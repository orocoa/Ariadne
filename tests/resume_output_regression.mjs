import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const Output = createRequire(import.meta.url)('../public/conversation-output.js');
const block = (type, text, right = '', emphasis = 'REGULAR') => ({ type, text, right, emphasis });
const resume = {
  kind: 'RESUME', title: 'Synthetic filename, not a printed title', body: '', nodes: [], edges: [],
  resume: { template_name: '', review_notes: ['Award years omitted; verify official English names.'],
    layout: { margin_mm: 15, body_pt: 10.5, line_height: 1.3, name_pt: 21, section_pt: 13, section_gap_pt: 12 },
    blocks: [block('NAME', '林晨 Lin Chen'), block('CONTACT', 'lin@example.test | https://example.test/portfolio'),
      block('SECTION', 'EDUCATION'), block('ENTRY', 'Synthetic University', '2024 - 2025', 'BOLD'),
      block('BULLET', 'Researched product concepts with 12 participants.'), block('PAGE_BREAK', ''),
      block('SECTION', 'EXPERIENCE'), block('ENTRY', 'Example Studio', '2025 - Present', 'BOLD'),
      block('BULLET', '负责用户访谈、原型设计和测试；café e\u0301 👩🏽‍💻 𠮷。'),
      block('PARAGRAPH', '<script>literal inert text</script>')] },
};
if (process.argv.includes('--fixture')) { console.log(JSON.stringify(resume)); process.exit(0); }
assert.deepEqual(Output.validate(resume), resume);
assert.deepEqual(Output.fromResult({ deliverable: resume, delivery_version: Output.VERSION }), resume);
assert.throws(() => Output.fromResult({ deliverable: resume, delivery_version: 'ariadne-conversation-delivery-v1' }));
const legacy = { kind: 'PDF', title: 'Old report', body: 'Saved body', nodes: [], edges: [] };
assert.deepEqual(Output.fromResult({ deliverable: legacy, delivery_version: 'ariadne-conversation-delivery-v1' }), legacy);
for (const mutate of [
  value => { value.resume.layout.margin_mm = 0; },
  value => { value.resume.layout.body_pt = true; },
  value => { value.resume.layout.line_height = Infinity; },
  value => { value.resume.layout.script = 'alert(1)'; },
  value => { value.resume.review_notes = ['Bearer synthetic-private-secret']; },
  value => { value.resume.blocks[0].text = 'sha256:' + 'a'.repeat(64); },
  value => { value.resume.blocks[0].type = 'PARAGRAPH'; },
  value => { value.resume.blocks[2].right = 'unpermitted'; },
  value => { value.resume.blocks[3] = null; },
  value => { value.resume.blocks.push(block('SECTION', 'Orphan')); },
  value => { value.resume.blocks[5].text = 'hidden'; },
  value => { value.resume.blocks[5].emphasis = 'BOLD'; },
  value => { value.resume.blocks[5] = block('NAME', 'Second identity'); },
  value => { value.body = 'Second conflicting prose authority'; },
]) { const value = structuredClone(resume); mutate(value); assert.throws(() => Output.validate(value)); }
assert.ok(!Output.documentText(resume).includes(resume.title));
assert.ok(!Output.documentText(resume).includes('Award years'));
assert.deepEqual(Output.wrapResumeText('Product discovery and validation', text => text.length, 18), ['Product discovery', 'and validation']);
assert.deepEqual(Output.wrapResumeText('中文👩🏽‍💻 e\u0301', text => [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)].length, 3), ['中文👩🏽‍💻', 'e\u0301']);

const painted = [], contexts = [];
let failEncode = false;
const doc = { fonts: { ready: Promise.resolve() }, defaultView: {
  getComputedStyle: () => ({ getPropertyValue: key => key === '--vi-font-ui' ? 'sans-serif' : '#000' }),
}, createElement() {
  const ctx = { font: '',
    measureText(text) { const size = Number(this.font.match(/([\d.]+)px/)?.[1] || 10); return { width: [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)].length * size * .5 }; },
    fillText(text, x, y) { painted.push({ text, x, y }); }, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  contexts.push(ctx);
  return { getContext: () => ctx, toBlob: callback => callback(failEncode ? null : new Blob([new Uint8Array([255, 216, 255, 217])])) };
} };
const pages = await Output.renderResumePages(resume, doc);
assert.equal(pages.length, 2, 'explicit reference page break preserved');
assert.ok(pages[0].textRuns.some(run => run.text === 'EDUCATION'));
assert.ok(pages[1].textRuns.some(run => run.text === 'EXPERIENCE'));
assert.equal(pages.flatMap(page => page.textRuns).filter(run => run.text.startsWith('林晨')).length, 1);
const visible = painted.map(row => row.text).join('\n');
assert.doesNotMatch(visible, /Ariadne|非确认|未经外部|仅供参考|Award years|Synthetic filename/);
const school = painted.find(row => row.text === 'Synthetic University'), date = painted.find(row => row.text === '2024 - 2025');
assert.equal(school.y, date.y, 'dates share the entry baseline');
assert.ok(date.x > school.x + 300, 'dates appear in the right-hand column');
const pdf = Output.pdfFromJpegs(pages), bytes = new TextDecoder().decode(pdf);
assert.match(bytes, /\/ToUnicode/); assert.match(bytes, /3 Tr/); assert.match(bytes, /\/Count 2/);
assert.match(bytes, /D83DDC69D83CDFFD200DD83DDCBB/, 'ZWJ emoji maps to its full UTF-16 sequence');
assert.match(bytes, /00650301/, 'combining character maps without normalization or loss');
assert.match(bytes, /D842DFB7/, 'non-BMP ideograph maps through a surrogate pair');
assert.throws(() => Output.pdfFromJpegs([{ ...pages[0], textRuns: [{ text: 'wrong', x: 1, y: 1, size: 10, widths: [] }] }]));
assert.throws(() => Output.pdfFromJpegs([{ ...pages[0], textRuns: [{ text: 'x', x: 1239, y: 1, size: 10, widths: [10] }] }]));
const start = Number(bytes.match(/startxref\n(\d+)/)[1]); assert.equal(bytes.slice(start, start + 4), 'xref');

// Push a section to a page boundary. Its first entry must follow it on the
// same page. Long bullets wrap without losing their tail or crossing margins.
const boundary = structuredClone(resume);
boundary.resume.blocks = [block('NAME', 'Boundary Test'), ...Array.from({ length: 41 }, (_, i) => block('PARAGRAPH', `Filler ${i}`)),
  block('SECTION', 'NEW SECTION'), block('ENTRY', 'First entry', '2026'), block('BULLET', 'Long achievement with complete evidence. '.repeat(30))];
const split = await Output.renderResumePages(boundary, doc);
const headingPage = split.find(page => page.textRuns.some(run => run.text === 'NEW SECTION'));
assert.ok(headingPage.textRuns.some(run => run.text === 'First entry'), 'no orphan section at page bottom');
assert.ok(headingPage.textRuns.some(run => run.text.includes('Long achievement')), 'the first content line accompanies a short entry');
const bulletLines = split.flatMap(page => page.textRuns).filter(run => run.text.includes('achievement') || run.text.includes('evidence'));
assert.ok(bulletLines.length > 1);
assert.ok(bulletLines.slice(1).every(run => run.x > bulletLines[0].x), 'wrapped bullets keep a hanging indent');
assert.equal(bulletLines.map(run => run.text).join(' ').replace(/^• /, '').replace(/\s+/g, ' ').trim(), boundary.resume.blocks.at(-1).text.trim());
for (const page of split) for (const run of page.textRuns) {
  assert.ok(run.x >= 80 && run.y <= page.height - 80, 'visible text stays inside page margins');
}
const oversized = structuredClone(resume);
Object.assign(oversized.resume.layout, { margin_mm: 30, body_pt: 12, line_height: 1.65, name_pt: 28, section_pt: 16, section_gap_pt: 18 });
oversized.resume.blocks = [block('NAME', 'Synthetic Name'), block('SECTION', 'LONG ENTRY SECTION'), block('ENTRY', 'X'.repeat(1600), 'D'.repeat(120)), block('BULLET', 'Evidence tail')];
const huge = await Output.renderResumePages(oversized, doc);
const hugeHeading = huge.find(page => page.textRuns.some(run => run.text === 'LONG ENTRY SECTION'));
assert.ok(hugeHeading.textRuns.some(run => run.text.startsWith('X')), 'an oversized entry cannot orphan its heading');
assert.ok(huge.flatMap(page => page.textRuns).some(run => run.text.includes('Evidence tail')));
oversized.resume.blocks = [block('NAME', 'Many Entries'), block('SECTION', 'EXPERIENCE'), ...Array.from({ length: 24 }, (_, index) => block('ENTRY', `Item ${index} ` + 'Readable text '.repeat(10)))];
const many = await Output.renderResumePages(oversized, doc);
assert.ok(many.length <= 4, 'consecutive entries do not reserve an impossible whole chain');
for (let index = 0; index < 24; index++) assert.ok(many.flatMap(page => page.textRuns).some(run => run.text.includes(`Item ${index} `)));
const shortBoundary = structuredClone(resume);
shortBoundary.resume.blocks = [block('NAME', 'Boundary Test'), block('SECTION', 'Earlier content'), ...Array.from({ length: 41 }, (_, i) => block('PARAGRAPH', `Filler ${i}`)),
  block('SECTION', 'NEW SECTION'), block('ENTRY', 'Short Studio', '2026'), block('BULLET', 'Achievement tail.')];
const shortPages = await Output.renderResumePages(shortBoundary, doc);
const shortHead = shortPages.find(page => page.textRuns.some(run => run.text === 'NEW SECTION'));
assert.ok(shortHead.textRuns.some(run => run.text === 'Short Studio') && shortHead.textRuns.some(run => run.text.includes('Achievement tail.')), 'section, short entry and first achievement stay together');
failEncode = true;
await assert.rejects(Output.renderResumePages(resume, doc), /图片生成失败/);
failEncode = false;
assert.equal((await Output.renderResumePages(resume, doc)).length, 2, 'encoder failure remains retryable');
const report = await Output.renderPages('Saved report body', doc);
assert.doesNotMatch(report.flatMap(page => page.textRuns).map(run => run.text).join('\n'), /Ariadne|非确认|未经外部|仅供参考/);
if (process.argv.includes('--write-pdf')) {
  const directory = resolve(process.argv[process.argv.indexOf('--write-pdf') + 1]); mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'unicode-text-layer.pdf'), pdf);
  writeFileSync(resolve(directory, 'expected-runs.json'), JSON.stringify(pages.map(page => page.textRuns.map(run => run.text))));
}
console.log('resume output: typed bounds, legacy compatibility, reference hierarchy, right dates, Unicode text layer, pagination, no watermark/notes, retry PASS');
