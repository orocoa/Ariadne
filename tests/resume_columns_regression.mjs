import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resumeColumnsFixture } from './helpers/resume-columns-fixture.mjs';
const Output = createRequire(import.meta.url)('../public/conversation-output.js');
const fixture = resumeColumnsFixture();
if (process.argv.includes('--fixture')) { console.log(JSON.stringify(fixture)); process.exit(0); }
assert.deepEqual(Output.validate(fixture), fixture);
for (const mutate of [
  v => v.resume.columns.assignments.pop(), v => v.resume.columns.assignments[0] = 'LEFT',
  v => v.resume.columns.assignments[3] = 'RIGHT', v => v.resume.columns.assignments[8] = 'LEFT',
  v => v.resume.columns.left_fraction = NaN, v => v.resume.columns.left_fraction = true,
  v => v.resume.columns.gap_mm = 0, v => v.resume.columns.script = 'alert(1)',
  v => v.resume.columns.assignments.fill('FULL'), v => v.resume.columns.assignments[7] = 'FULL',
]) { const v = structuredClone(fixture); mutate(v); assert.throws(() => Output.validate(v)); }
const doc = { fonts: { ready: Promise.resolve() }, defaultView: { getComputedStyle: () => ({ getPropertyValue: key => key === '--vi-font-ui' ? 'sans-serif' : '#000' }) }, createElement() {
  const ctx = { font: '', measureText(text) { return { width: [...new Intl.Segmenter('zh', {granularity:'grapheme'}).segment(text)].length * Number(this.font.match(/([\d.]+)px/)[1]) * .5 }; }, fillText() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
  return { getContext: () => ctx, toBlob: cb => cb(new Blob([new Uint8Array([255,216,255,217])])) };
} };
const pages = await Output.renderResumePages(fixture, doc);
assert.equal(pages.length, 2);
const margin = 16 * 1240 / 210, gap = 8 * 1240 / 210, width = 1240 - 2 * margin, leftWidth = (width - gap) * .34, rightX = margin + leftWidth + gap;
for (const [index, page] of pages.entries()) {
  const leftHeading = page.textRuns.find(r => r.text.startsWith(index ? 'SKILLS' : 'EDUCATION'));
  const rightHeading = page.textRuns.find(r => r.text.startsWith(index ? 'RESEARCH' : 'EXPERIENCE'));
  assert.equal(leftHeading.y, rightHeading.y, 'two column headings begin together');
  assert.equal(leftHeading.x, margin); assert.equal(rightHeading.x, rightX);
  let rightStarted = false;
  for (const r of page.textRuns) {
    const end = r.x + r.widths.reduce((a,b) => a+b, 0);
    assert.ok(r.y <= 1754-margin && r.x >= margin && end <= 1240-margin+.01, 'no clipped page text');
    if (r.x >= rightX-.01) rightStarted = true;
    else if (!r.text.startsWith('林晨') && !r.text.startsWith('lin@')) { assert.ok(!rightStarted, 'text reading order is left then right'); assert.ok(end <= margin+leftWidth+.01, 'left text cannot cross gutter'); }
  }
}
assert.doesNotMatch(pages.flatMap(p=>p.textRuns).map(r=>r.text).join('\n'), /Internal review|Ariadne|仅供参考/);
const long = structuredClone(fixture); long.resume.blocks[7].text = 'Full evidence tail 中文 '.repeat(65);
const overflow = await Output.renderResumePages(long, doc);
assert.ok(overflow.length <= 4); assert.ok(overflow.flatMap(p=>p.textRuns).some(r=>r.text.includes('12 participants')));
const oversized = structuredClone(fixture); oversized.resume.blocks[4].text = '中'.repeat(1600); oversized.resume.blocks[10].text = '中'.repeat(1600);
Object.assign(oversized.resume.layout, { margin_mm: 30, body_pt: 12, line_height: 1.65 });
await assert.rejects(Output.renderResumePages(oversized, doc), /超过 4 页/);
const pdf = new TextDecoder().decode(Output.pdfFromJpegs(pages)); assert.match(pdf, /\/Count 2/); assert.match(pdf, /\/ToUnicode/);
console.log('two-column resume: bounded geometry, Python-compatible layout, independent pagination, gutter/date alignment, semantic reading order, multilingual tails, no notes, four-page fail-closed PASS');
