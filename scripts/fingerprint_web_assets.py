"""Version exported scripts/styles together, including their dynamic references.

Source and compatibility URLs stay in place. A digest of the full asset graph
handles cycles and ensures a changed dependency also changes its callers' URLs.
"""
import hashlib
import json
from pathlib import Path
import re

VERSION = "ariadne-assets-v1"
EXTENSIONS = {".js", ".mjs", ".css"}
LITERAL = re.compile(r'''(["'`])(/[^\s"'`<>]*)\1''')
CSS_URL = re.compile(r"url\((/[^\s)'\"]+)\)")


def fingerprint(pages, previous_pages=None):
    pages = Path(pages)
    sources = {"/" + str(path.relative_to(pages)): path.read_bytes()
               for path in sorted(pages.rglob("*"))
               if path.is_file() and path.suffix in EXTENSIONS and path.name != "_worker.js"}
    digest = hashlib.sha256(VERSION.encode())
    for name, body in sources.items():
        digest.update(name.encode() + b"\0" + hashlib.sha256(body).digest())
    version = digest.hexdigest()[:32]
    mapping = {name: str(Path(name).with_name(f"{Path(name).stem}.{version}{Path(name).suffix}")) for name in sources}

    def resolve(url):
        path = url.split("?", 1)[0].split("#", 1)[0]
        return mapping.get(path, url)

    def rewrite(body):
        source = body.decode("utf-8")
        source = LITERAL.sub(lambda m: m[1] + resolve(m[2]) + m[1], source)
        return CSS_URL.sub(lambda m: "url(" + resolve(m[1]) + ")", source).encode("utf-8")

    files = {}
    for name, body in sources.items():
        rewritten = rewrite(body)
        (pages / mapping[name].lstrip("/")).write_bytes(rewritten)
        files[mapping[name]] = hashlib.sha256(rewritten).hexdigest()
    for page in sorted(pages.rglob("*.html")):
        page.write_bytes(rewrite(page.read_bytes()))
    retained = {}
    previous_generation = None
    if previous_pages is not None:
        previous_pages = Path(previous_pages)
        previous = json.loads((previous_pages / "asset-manifest.json").read_text())
        previous_generation = previous.get("generation")
        if previous.get("version") != VERSION or not re.fullmatch(r"[a-f0-9]{32}", previous_generation or ""):
            raise ValueError("Invalid previous asset manifest")
        for url, expected in previous["sha256"].items():
            relative = Path(url.lstrip("/"))
            if (not url.startswith("/") or ".." in relative.parts or relative.suffix not in EXTENSIONS
                    or not relative.name.endswith(f".{previous_generation}{relative.suffix}")):
                raise ValueError("Invalid previous asset path")
            source = previous_pages / relative
            if source.is_symlink() or not source.resolve().is_relative_to(previous_pages.resolve()):
                raise ValueError("Invalid previous asset path")
            body = source.read_bytes()
            if hashlib.sha256(body).hexdigest() != expected:
                raise ValueError("Previous asset hash mismatch")
            target = pages / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists() and target.read_bytes() != body:
                raise ValueError("Previous asset collision")
            target.write_bytes(body)
            retained[url] = expected
    manifest = {"version": VERSION, "generation": version, "urls": mapping, "sha256": files, "retained_sha256": retained}
    (pages / "asset-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    headers = "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: SAMEORIGIN\n  Content-Security-Policy: frame-ancestors 'self'\n  Cache-Control: no-cache\n"
    for generation in sorted({version, previous_generation} - {None}):
        for suffix in sorted(EXTENSIONS):
            headers += f"\n/*.{generation}{suffix}\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable\n"
    (pages / "_headers").write_text(headers)
    return manifest
