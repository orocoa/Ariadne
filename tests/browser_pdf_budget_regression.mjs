import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
globalThis.crypto ||= webcrypto;
let sizes, canvases = 0, destroyed = 0;
globalThis.syntheticPDFJS = {
  getDocument() {
    const pdf = {numPages: sizes.length, async getPage(number) {
      return {getViewport({scale}) { return {width:sizes[number-1][0]*scale,height:sizes[number-1][1]*scale}; },
        render() { return {promise:Promise.resolve()}; }, cleanup() {}};
    }};
    return {promise:Promise.resolve(pdf), async destroy() { destroyed++; }};
  }
};
globalThis.document = {createElement() {canvases++; return {width:0,height:0,getContext(){return {};},toDataURL(){return 'data:image/jpeg;base64,/9j/2Q==';}};}};
// Substitute only the unavailable PDF.js loader. Exercise the real admission,
// canvas ordering, manifests and cleanup with a synthetic PDF engine.
const source = fs.readFileSync(new URL('../public/browser-pdf-delivery.js',import.meta.url),'utf8')
  .replace('let library;', 'let library = Promise.resolve(globalThis.syntheticPDFJS);');
const pdf = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
sizes = [[100,100],[200001,100]];
await assert.rejects(pdf.renderPDF(new Uint8Array([1])), /WEB_PDF_IMAGE_LIMIT/);
assert.equal(canvases,0,'all page geometries must pass before the first canvas');
for (const group of [{pages:47,pixels:0},{pages:0,pixels:128*1024*1024}]) {
  sizes = [[100,100],[100,100]];
  await assert.rejects(pdf.renderPDF(new Uint8Array([1]),undefined,group), /WEB_PDF_IMAGE_LIMIT/);
  assert.equal(canvases,0,'next document must be admitted against the remaining group budget');
}
const group={pages:0,pixels:0};
const output=await pdf.renderPDF(new Uint8Array([1]),undefined,group);
assert.equal(output.page_count,2); assert.deepEqual(output.pages.map(p=>p.number),[1,2]);
assert.equal(canvases,2); assert.equal(group.pages,2); assert.ok(group.pixels>0);
assert.equal(destroyed,4,'all success and rejection paths release the PDF task');
console.log('browser_pdf_budget_regression=PASS: whole-document geometry, remaining group admission, complete pages and cleanup');
