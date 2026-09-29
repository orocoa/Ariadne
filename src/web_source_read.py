"""Portable mechanical source preparation; no local OCR or semantic rules."""
import base64
import hashlib
import json

from src.execution_contract import validate_runtime_snapshot
from src.material_delivery import DOCX, docx_parts, image_part, MAX_TEXT
from src.pdf_delivery import inspect_complete_pdf
from src.upload_limits import MAX_FILE_BYTES


def read_source(payload):
    snapshot = validate_runtime_snapshot(payload.get("runtime_snapshot"))
    if snapshot.mode != "model" or not any(value == "supported" for value in (
        snapshot.capabilities.ai_conversation, snapshot.capabilities.candidate_model_structuring,
        snapshot.capabilities.job_model_structuring,
    )):
        raise ValueError("source_read_model_mode_required")
    domain = payload.get("material_type")
    prefix = {"JOB": "source-job-", "CANDIDATE": "source-candidate-"}.get(domain)
    source = payload.get("source_document_id")
    if not prefix or not isinstance(source, str) or not source.startswith(prefix) or len(source) > 180:
        raise ValueError("invalid_source_read_identity")
    mime = payload.get("media_type")
    image = mime in {"image/png", "image/jpeg"}
    data = payload.get("image_data_url" if image else "document_data_url")
    if not isinstance(data, str) or not data.startswith(f"data:{mime};base64,"):
        raise ValueError("source_original_required")
    raw = base64.b64decode(data.split(",", 1)[1], validate=True)
    digest = "sha256:" + hashlib.sha256(raw).hexdigest()
    if not raw or len(raw) > MAX_FILE_BYTES or digest != payload.get("expected_content_hash"):
        raise ValueError("source_read_integrity_mismatch")
    count = None
    if image:
        image_part(mime, raw)
        # A locator for the original image, never invented OCR or job content.
        text, method = "Original image attached; interpret the complete image.", "original_image_manifest_v1"
    elif mime == "application/pdf":
        if not raw.startswith(b"%PDF-"):
            raise ValueError("source_pdf_invalid")
        count = inspect_complete_pdf(raw, max_pages=48)
        text, method = "", "complete_pdf_page_manifest_v1"
    elif mime == DOCX:
        parts = docx_parts(raw)
        if any(part["type"] != "text" for part in parts):
            raise ValueError("docx_complex_content_export_pdf")
        text, method = "\n\n".join(part["text"] for part in parts[1:]), "docx_xml_text_v0"
    elif mime in {"text/plain", "text/markdown"}:
        text, method = raw.decode("utf-8-sig"), "utf8_text_v0"
        if not text.strip() or "\0" in text:
            raise ValueError("source_text_invalid")
    else:
        raise ValueError("source_type_unsupported")
    if len(text) > MAX_TEXT:
        raise ValueError("source_text_limit")
    return {"source_document_id": source, "content_hash": digest, "extracted_text": text,
            "extraction_method": method, **({"visual_page_count": count} if count else {}),
            "read_only": True, "writeback": False, "model_call_made": False,
            "network_call_made": False, "runtime_snapshot_id": snapshot.snapshot_id}


def read_portable_source(self):
    # Shared mechanical preparation; never substitutes text for visual PDF input.
    from src.upload_limits import MAX_FILE_REQUEST_BYTES
    try:
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= MAX_FILE_REQUEST_BYTES:
            raise ValueError("invalid_source_read_request_size")
        payload = json.loads(self.rfile.read(length))
        if not isinstance(payload, dict):
            raise ValueError("invalid_source_read_request")
        result = read_source(payload)
    except (ValueError, TypeError, KeyError, UnicodeDecodeError):
        self.send_json(422, {"error": "SOURCE_READ_FAILED", "read_only": True,
            "writeback": False, "network_call_made": False, "model_call_made": False,
            "persistence": "not_written"})
        return
    self.send_json(200, result)
