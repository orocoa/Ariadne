// Loaded only by the Cloudflare runtime; PDF.js loads only when a PDF is present.
const VERSION = "browser_pdfjs_complete_pages_v1";
const MAX_ORIGINAL = 5 * 1024 * 1024, MAX_PAGES = 16, MAX_IMAGES = 6 * 1024 * 1024;
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
const bytesFromURL = value => Uint8Array.from(atob(value.split(",", 2)[1]), c => c.charCodeAt(0));
let library;
function aborted(signal) { if (signal?.aborted) throw new DOMException("PDF preparation cancelled", "AbortError"); }

export function collectPDFs(value, found = new Set()) {
  if (typeof value === "string" && value.startsWith("data:application/pdf;base64,")) found.add(value);
  else if (Array.isArray(value)) value.forEach(item => collectPDFs(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach(item => collectPDFs(item, found));
  return found;
}

export async function renderPDF(raw, signal, group = null) {
  aborted(signal);
  if (!raw.byteLength || raw.byteLength > MAX_ORIGINAL) throw new Error("WEB_PDF_SIZE_LIMIT");
  const sourceHash = "sha256:" + await hash(raw);
  if (!library) library = import("/vendor/pdfjs/pdf.mjs").then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.mjs";
    return pdfjs;
  });
  const pdfjs = await library;
  const task = pdfjs.getDocument({data: raw, isEvalSupported: false, stopAtErrors: true,
    cMapUrl: "/vendor/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
    wasmUrl: "/vendor/pdfjs/wasm/", useSystemFonts: true});
  task.onPassword = () => task.destroy();
  const cancel = () => task.destroy();
  signal?.addEventListener("abort", cancel, {once: true});
  try {
    const pdf = await task.promise;
    if (pdf.numPages < 1 || pdf.numPages > MAX_PAGES) throw new Error("WEB_PDF_PAGE_LIMIT");
    const pages = [], geometry = [];
    let pixels = 0;
    // Inspect the complete page set before allocating the first render canvas.
    for (let number = 1; number <= pdf.numPages; number++) {
      aborted(signal);
      const page = await pdf.getPage(number), size = page.getViewport({scale: 1});
      if (![size.width, size.height].every(v => Number.isFinite(v) && v > 0 && v <= 200000)) throw new Error("WEB_PDF_IMAGE_LIMIT");
      const viewport = page.getViewport({scale: Math.min(120 / 72, 2048 / Math.max(size.width, size.height))});
      pixels += Math.ceil(viewport.width) * Math.ceil(viewport.height);
      if (pixels > 64 * 1024 * 1024) throw new Error("WEB_PDF_IMAGE_LIMIT");
      geometry.push(viewport);
    }
    if (group) {
      if (group.pages + pdf.numPages > 48 || group.pixels + pixels > 128 * 1024 * 1024) throw new Error("WEB_PDF_IMAGE_LIMIT");
      group.pages += pdf.numPages; group.pixels += pixels;
    }
    let total = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      aborted(signal);
      const page = await pdf.getPage(number), viewport = geometry[number - 1];
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({canvasContext: canvas.getContext("2d", {alpha: false}), viewport}).promise;
        const image = canvas.toDataURL("image/jpeg", 0.82), bytes = bytesFromURL(image);
        total += bytes.length;
        if (total > MAX_IMAGES) throw new Error("WEB_PDF_IMAGE_LIMIT");
        pages.push({number, image, sha256: await hash(bytes)});
      } finally { canvas.width = canvas.height = 0; page.cleanup(); }
    }
    aborted(signal);
    return {version: VERSION, source_hash: sourceHash, page_count: pdf.numPages, pages};
  } catch (error) {
    aborted(signal);
    if (String(error?.message).startsWith("WEB_PDF_")) throw error;
    throw new Error("WEB_PDF_PREPARATION_FAILED");
  } finally { signal?.removeEventListener("abort", cancel); await task.destroy(); }
}

export async function prepareRequest(path, options, service, fetcher = fetch) {
  // Source-read checks original PDF metadata on the server. Only the eventual
  // inference request needs complete pixels; no cross-request private cache.
  const payload = JSON.parse(options.body);
  if (Object.hasOwn(payload, "_cloudflare_pdf_pages")) throw new Error("WEB_PDF_MANIFEST_INVALID");
  if (path === "/api/local-source-read") return options;
  const originals = [...collectPDFs(payload)];
  if (originals.length > 4) throw new Error("WEB_PDF_COUNT_LIMIT");
  const pages = [], group = {pages: 0, pixels: 0};
  if (/^\/api\/runtime-providers\/(gemini|qwen)\/connection-check$/.test(path) && payload.confirmed === true) {
    const response = await fetcher("/provider-visual-check.pdf", {cache: "no-store", signal: options.signal});
    if (!response.ok) throw new Error("WEB_PDF_PREPARATION_FAILED");
    pages.push(await renderPDF(new Uint8Array(await response.arrayBuffer()), options.signal));
  }
  for (const value of originals) pages.push(await renderPDF(bytesFromURL(value), options.signal, group));
  if (pages.length) payload._cloudflare_pdf_pages = pages;
  const body = JSON.stringify(payload);
  if (new Blob([body]).size > service.request_limit) throw new Error("WEB_PREVIEW_REQUEST_SIZE_LIMIT");
  return {...options, body};
}
