"""Validate browser-rendered complete PDF pages without replacing source identity.

The site-owned PDF.js renderer supplies pixels. The Worker independently checks
the original PDF hash, page count, ordered images and their hashes. This proves
transport completeness, not semantic truth or pixel equivalence for a malicious
client. The original PDF is still retained by the browser's source store.
"""
import base64
import hashlib
import io
from src.pdf_delivery import page_metrics

VERSION = "browser_pdfjs_complete_pages_v1"
MAX_PAGES = 16
MAX_ORIGINAL = 5 * 1024 * 1024
MAX_IMAGES = 6 * 1024 * 1024


class BrowserPDFDelivery:
    def __init__(self, manifests, page_counter=None):
        if not isinstance(manifests, list) or len(manifests) > 4:
            raise ValueError("WEB_PDF_MANIFEST_INVALID")
        self.manifests, self.cache, self.metadata = {}, {}, {}
        self.custom_page_counter = page_counter is not None
        self.page_counter = page_counter or self.count_pages
        for item in manifests:
            if not isinstance(item, dict) or set(item) != {"version", "source_hash", "page_count", "pages"}:
                raise ValueError("WEB_PDF_MANIFEST_INVALID")
            digest = item["source_hash"]
            if not isinstance(digest, str) or digest in self.manifests:
                raise ValueError("WEB_PDF_MANIFEST_INVALID")
            self.manifests[digest] = item

    @staticmethod
    def metrics(raw):
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw), strict=True)
        if reader.is_encrypted:
            raise ValueError("WEB_PDF_ENCRYPTED")
        if not 1 <= len(reader.pages) <= MAX_PAGES: raise ValueError("WEB_PDF_INCOMPLETE")
        sizes = [(float(page.mediabox.width) * float(page.get("/UserUnit", 1)),
                  float(page.mediabox.height) * float(page.get("/UserUnit", 1))) for page in reader.pages]
        return page_metrics(sizes, max_pages=MAX_PAGES, scale_to=2048)

    @staticmethod
    def count_pages(raw):
        return BrowserPDFDelivery.metrics(raw)["pages"]

    def inspect_metrics(self, raw, *, max_pages=MAX_PAGES):
        if not raw.startswith(b"%PDF-") or not 0 < len(raw) <= MAX_ORIGINAL:
            raise ValueError("WEB_PDF_ORIGINAL_INVALID")
        digest = hashlib.sha256(raw).digest()
        if digest not in self.metadata:
            self.metadata[digest] = ({"pages": self.page_counter(raw), "pixels": 0} if self.custom_page_counter else self.metrics(raw))
        result = self.metadata[digest]
        if not 1 <= result["pages"] <= min(MAX_PAGES, max_pages): raise ValueError("WEB_PDF_INCOMPLETE")
        return result

    def inspect(self, raw, *, max_pages=MAX_PAGES):
        return self.inspect_metrics(raw, max_pages=max_pages)["pages"]

    def __call__(self, raw):
        if not raw.startswith(b"%PDF-") or not 0 < len(raw) <= MAX_ORIGINAL:
            raise ValueError("WEB_PDF_ORIGINAL_INVALID")
        digest = "sha256:" + hashlib.sha256(raw).hexdigest()
        if digest in self.cache:
            return self.cache[digest]
        item = self.manifests.get(digest)
        if not item or item["version"] != VERSION or type(item["page_count"]) is not int:
            raise ValueError("WEB_PDF_PREPARATION_REQUIRED")
        count = self.inspect(raw)
        if not 1 <= count <= MAX_PAGES or count != item["page_count"] or not isinstance(item["pages"], list) or len(item["pages"]) != count:
            raise ValueError("WEB_PDF_INCOMPLETE")
        result, size = [], 0
        for index, page in enumerate(item["pages"], 1):
            if not isinstance(page, dict) or set(page) != {"number", "image", "sha256"} or type(page["number"]) is not int or page["number"] != index:
                raise ValueError("WEB_PDF_PAGE_ORDER_INVALID")
            prefix = "data:image/jpeg;base64,"
            if not isinstance(page["image"], str) or not page["image"].startswith(prefix):
                raise ValueError("WEB_PDF_IMAGE_INVALID")
            image = base64.b64decode(page["image"][len(prefix):], validate=True)
            size += len(image)
            if not image.startswith(b"\xff\xd8\xff") or not image.endswith(b"\xff\xd9") or size > MAX_IMAGES or hashlib.sha256(image).hexdigest() != page["sha256"]:
                raise ValueError("WEB_PDF_IMAGE_INTEGRITY_FAILED")
            result.append((str(index), image))
        self.cache[digest] = result
        return result
