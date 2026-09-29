"""Shared complete-page PDF delivery; request-owned admission, no semantic extraction."""
from __future__ import annotations
from contextlib import contextmanager
from contextvars import ContextVar
import hashlib
import math
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time
from src.ai_career_ingestion import AICareerIngestionError
from src.runtime_cancellation import ExecutionCancelled, check_cancelled

PUBLIC_PDF_LIMITS = ContextVar("ariadne_public_pdf_limits", default=False)
PDF_RENDERER = ContextVar("ariadne_pdf_renderer", default=None)
PDF_METADATA = ContextVar("ariadne_pdf_metadata", default=None)
MAX_PAGE_PIXELS = 16_777_216
MAX_TOTAL_PIXELS = 134_217_728
MAX_PAGE_EDGE = 8192
MAX_RENDER_BYTES = 40_000_000


def page_metrics(sizes, *, max_pages=80, scale_to=None, scale_up=False):
    if not 1 <= len(sizes) <= max_pages:
        raise AICareerIngestionError("pdf_complete_page_limit")
    total = 0
    for width, height in sizes:
        if not all(math.isfinite(v) and 0 < v <= 200_000 for v in (width, height)):
            raise AICareerIngestionError("pdf_page_geometry_invalid")
        # Poppler -scale-to also enlarges small pages; PDF.js retains 120 dpi.
        scale = (scale_to / max(width, height) if scale_up else min(120 / 72, scale_to / max(width, height))) if scale_to else 120 / 72
        w, h = math.ceil(width * scale), math.ceil(height * scale)
        total += w * h
        if max(w, h) > MAX_PAGE_EDGE or w * h > MAX_PAGE_PIXELS or total > MAX_TOTAL_PIXELS:
            raise AICareerIngestionError("pdf_pixel_budget_exceeded")
    return {"pages": len(sizes), "pixels": total}


def validate_page_geometry(sizes, *, max_pages=80, scale_to=None):
    return page_metrics(sizes, max_pages=max_pages, scale_to=scale_to)["pages"]


def _inspect_path(source, max_pages):
    check_cancelled()
    try:
        info = subprocess.run(["pdfinfo", "-f", "1", "-l", str(max_pages), "-box", str(source)],
                              check=True, capture_output=True, timeout=10)
        output = info.stdout.decode("utf-8", "replace")
        match = re.search(r"(?m)^Pages:\s*(\d+)\s*$", output)
        count = int(match.group(1)) if match else 0
        if not 1 <= count <= max_pages:
            raise AICareerIngestionError("pdf_complete_page_limit")
        if re.search(r"(?m)^Encrypted:\s+yes\b", output):
            raise AICareerIngestionError("pdf_encrypted")
        dimensions = re.findall(r"(?m)^Page\s+(\d+)\s+size:\s*([\d.eE+-]+)\s+x\s+([\d.eE+-]+)\s+pts", output)
        if [int(row[0]) for row in dimensions] != list(range(1, count + 1)):
            raise AICareerIngestionError("pdf_page_geometry_invalid")
        return page_metrics([(float(row[1]), float(row[2])) for row in dimensions], max_pages=max_pages,
                            scale_to=2048 if PUBLIC_PDF_LIMITS.get() else None, scale_up=PUBLIC_PDF_LIMITS.get())
    except (subprocess.SubprocessError, OSError, UnicodeError, ValueError) as error:
        if isinstance(error, AICareerIngestionError): raise
        raise AICareerIngestionError("pdf_preflight_failed") from error


def _metadata(pdf_bytes, max_pages=80, source=None):
    check_cancelled()
    renderer, cache = PDF_RENDERER.get(), PDF_METADATA.get()
    key = (hashlib.sha256(pdf_bytes).digest(), PUBLIC_PDF_LIMITS.get(), id(renderer))
    if cache is not None and key in cache:
        result = cache[key]
    elif renderer is not None and hasattr(renderer, "inspect_metrics"):
        result = renderer.inspect_metrics(pdf_bytes, max_pages=max_pages)
    elif source is not None:
        result = _inspect_path(source, min(max_pages, 48) if PUBLIC_PDF_LIMITS.get() else max_pages)
    else:
        with tempfile.TemporaryDirectory(prefix="ariadne-pdf-preflight-") as directory:
            original = Path(directory) / "source.pdf"
            original.write_bytes(pdf_bytes)
            result = _inspect_path(original, min(max_pages, 48) if PUBLIC_PDF_LIMITS.get() else max_pages)
    if not 1 <= result["pages"] <= max_pages: raise AICareerIngestionError("pdf_complete_page_limit")
    if cache is not None: cache[key] = result
    return result


def inspect_complete_pdf(pdf_bytes, *, max_pages=80):
    """Count/check every page; this is not proof that rasterization will succeed."""
    return _metadata(pdf_bytes, max_pages)["pages"]


@contextmanager
def pdf_preparation(documents, *, max_pages=48, other_images=0):
    """Admit a whole input group before any render; metadata lives only in this call.

    Count each occurrence even for identical bytes. Hashes allow metadata reuse,
    never a cross-workspace or cross-request cache of private source pixels.
    """
    token = PDF_METADATA.set({"rendered_bytes": 0})
    try:
        count, pixels = other_images, 0
        if count > max_pages: raise AICareerIngestionError("pdf_complete_page_limit")
        for raw in documents:
            result = _metadata(raw, max_pages=max_pages)
            count += result["pages"]; pixels += result["pixels"]
            if count > max_pages: raise AICareerIngestionError("pdf_complete_page_limit")
            if pixels > MAX_TOTAL_PIXELS: raise AICareerIngestionError("pdf_pixel_budget_exceeded")
        yield
    finally:
        PDF_METADATA.reset(token)


def _run_pdf_render(args, directory):
    """One renderer process, checked while it writes; no per-page process overhead."""
    check_cancelled()
    cache = PDF_METADATA.get()
    remaining = MAX_RENDER_BYTES - (cache.get("rendered_bytes", 0) if cache is not None else 0)
    if remaining <= 0: raise AICareerIngestionError("rendered_pages_exceed_request_limit")
    process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    deadline = time.monotonic() + 120
    try:
        while True:
            check_cancelled()
            if sum(path.stat().st_size for path in directory.glob("page-*.jpg")) > remaining:
                raise AICareerIngestionError("rendered_pages_exceed_request_limit")
            if time.monotonic() >= deadline: raise AICareerIngestionError("pdf_page_render_failed")
            try:
                if process.wait(timeout=0.1): raise AICareerIngestionError("pdf_page_render_failed")
                return
            except subprocess.TimeoutExpired: pass
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try: process.wait(timeout=1)
            except subprocess.TimeoutExpired: os.killpg(process.pid, signal.SIGKILL); process.wait()


def render_complete_pdf_pages(pdf_bytes: bytes, *, max_pages=80) -> list[tuple[str, bytes]]:
    """Validate the whole document before rasterization; send every page or fail."""
    renderer = PDF_RENDERER.get()
    if renderer is not None:
        if hasattr(renderer, "inspect_metrics"): _metadata(pdf_bytes, max_pages)
        return renderer(pdf_bytes)
    with tempfile.TemporaryDirectory(prefix="job-radar-career-pages-") as directory:
        root = Path(directory)
        source = root / "source.pdf"
        source.write_bytes(pdf_bytes)
        output_prefix = root / "page"
        expected_pages = _metadata(pdf_bytes, max_pages, source)["pages"]
        try:
            _run_pdf_render(["pdftoppm", "-jpeg", "-r", "120", "-jpegopt", "quality=82",
                             *(["-scale-to", "2048"] if PUBLIC_PDF_LIMITS.get() else []), str(source), str(output_prefix)], root)
        except ExecutionCancelled:
            raise
        except (subprocess.SubprocessError, OSError) as error:
            raise AICareerIngestionError("pdf_page_render_failed") from error
        paths = sorted(root.glob("page-*.jpg"), key=lambda path: int(path.stem.rsplit("-", 1)[1]))
        if [int(path.stem.rsplit("-", 1)[1]) for path in paths] != list(range(1, expected_pages + 1)):
            raise AICareerIngestionError("pdf_page_render_incomplete")
        size = sum(path.stat().st_size for path in paths)
        cache = PDF_METADATA.get()
        total = size + (cache.get("rendered_bytes", 0) if cache is not None else 0)
        if total > MAX_RENDER_BYTES:
            raise AICareerIngestionError("rendered_pages_exceed_request_limit")
        if cache is not None: cache["rendered_bytes"] = total
        return [(str(index), path.read_bytes()) for index, path in enumerate(paths, start=1)]
