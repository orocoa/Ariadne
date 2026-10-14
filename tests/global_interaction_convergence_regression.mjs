import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const SourceInput = require("../public/source-input-domain.js");
const ProcessingIndicator = require("../public/processing-indicator-domain.js");
const ProductShell = require("../public/product-shell-domain.js");
const JobModel = require("../public/job-model-runtime-domain.js");
const Truth = require("../public/truth-persistence-domain.js");
const RawSource = require("../public/raw-source-storage-domain.js");

const first = { source_document_id: "source-job-" + "a".repeat(64), name: "page-1.png", content_hash: "sha256:" + "a".repeat(64), batch_id: "job-batch-bundle" };
const second = { source_document_id: "source-job-" + "b".repeat(64), name: "page-2.png", content_hash: "sha256:" + "b".repeat(64), batch_id: "job-batch-bundle" };
assert.deepEqual(SourceInput.mergeSources([], [first, second]).map((entry) => entry.name), ["page-1.png", "page-2.png"]);
assert.deepEqual(SourceInput.mergeSources([first], [first, second]).map((entry) => entry.name), ["page-1.png", "page-2.png"]);
assert.deepEqual(SourceInput.mergeSources([first], [second], { replace: true }).map((entry) => entry.name), ["page-2.png"]);
assert.equal(SourceInput.isEditableTarget({ closest: (selector) => selector.includes("textarea") ? {} : null }), true);
assert.equal(SourceInput.isEditableTarget({ closest: () => null }), false);
assert.equal(typeof SourceInput.bind, "function");
assert.equal(typeof SourceInput.persistDurableBundle, "function");
assert.equal(typeof ProcessingIndicator.set, "function");
assert.equal(typeof ProcessingIndicator.setButton, "function");
assert.equal(typeof ProductShell.createDetailEditController, "function");
assert.equal(ProductShell.dispatchRuntimeImport({ authority: { runtime: { mode: "local" } } }, { local: () => "local", model: () => "model" }), "local");
assert.equal(ProductShell.dispatchRuntimeImport({ authority: { runtime: { mode: "model" } } }, { local: () => "local", model: () => "model" }), "model");
assert.throws(() => ProductShell.dispatchRuntimeImport({ authority: { runtime: { mode: "model" } } }, { local: () => "local", model: () => { throw new Error("MODEL_FAILED"); } }), /MODEL_FAILED/);

const sourceDocument = (source, index) => Truth.validateSourceDocument({
  contract_id: "ariadne-source-document-v1",
  source_document_id: source.source_document_id,
  source_type: "IMAGE",
  filename: source.name,
  label: null,
  mime_type: "image/png",
  content_hash: source.content_hash,
  created_at: `2026-09-04T08:00:0${index}.000Z`,
  material_type: "JOB",
  local_reference: RawSource.localReferenceFor(source.source_document_id),
  batch_id: source.batch_id,
  provenance: { supplied_by: "USER", captured_via: "CLIPBOARD_IMAGE", raw_source_recoverability: "DURABLE_BROWSER_LOCAL" },
  authority: Truth.AUTHORITY.source,
});
const documents = [sourceDocument(first, 1), sourceDocument(second, 2)];
const persistedDocuments = await SourceInput.persistDurableBundle({
  database: {},
  sources: [first, second].map((source) => ({ ...source, file: {} })),
  sourceDocumentFor: (source) => documents.find((document) => document.source_document_id === source.source_document_id),
  persistDurableSource: async (_database, document) => ({ source_document: document, metadata: { content_hash: document.content_hash } }),
});
assert.deepEqual(persistedDocuments.map((document) => document.source_document_id), [first.source_document_id, second.source_document_id]);
const bundle = await JobModel.sourceBundleFor([first, second], documents);
assert.deepEqual(bundle.source_document_ids, [first.source_document_id, second.source_document_id]);
assert.equal(bundle.source_count, 2);
const readResults = [
  { content_hash: first.content_hash, extracted_text: "AI 产品经理\n示例科技\n地点：上海", extraction_method: "vision_ocr", read_only: true, writeback: false, model_call_made: false },
  { content_hash: second.content_hash, extracted_text: "任职要求\n构建 AI 产品系统\n网站导航\n隐私政策", extraction_method: "vision_ocr", read_only: true, writeback: false, model_call_made: false },
];
const preparations = JobModel.boundedBundlePreparations(documents, readResults);
assert.equal(preparations.length, 2);
assert.match(preparations[0].blocks[0].source_ref, /^job-source-1-block-/);
assert.match(preparations[1].blocks[0].source_ref, /^job-source-2-block-/);
assert(preparations.reduce((total, preparation) => total + preparation.blocks.length, 0) <= 48);
assert(preparations.reduce((total, preparation) => total + preparation.character_count, 0) <= 48000);

const pages = read("public/v1-pages.js");
const candidateImport = read("public/personal-import.html");
const jobImport = read("public/jd-import.html");
const candidateDetail = read("public/candidate-detail.html");
const jobDetail = read("public/job-detail.html");
const conversationUi = read("public/conversation-ui-domain.js");
const conversationOutput = read("public/conversation-output.js");
const memoryBridge = read("public/personal-memory-bridge.js");
assert.equal((pages.match(/SourceInput\.bind\(/g) || []).length, 2);
assert.equal((pages.match(/SourceInput\.renderBundlePreview\(/g) || []).length, 2);
assert.equal((pages.match(/SourceInput\.persistDurableBundle\(/g) || []).length, 3);
assert.equal((pages.match(/ProductShell\.createDetailEditController\(/g) || []).length, 2);
assert.match(pages, /async function runCandidateProcessing\(\) \{ return archiveSelectedSources\("candidate"\); \}/);
assert.doesNotMatch(pages, /function installFileDropzone/);
for (const html of [candidateImport, jobImport]) {
  assert.match(html, /source-input-domain\.js\?v=candidate-job-parity-v1/);
  assert.match(html, /processing-indicator-domain\.js\?v=ui-contract-addendum-v5/);
  assert.match(html, /class="v1-source-preview-list"/);
}
for (const html of [candidateImport, jobImport, candidateDetail, jobDetail]) {
  assert.match(html, /processing-indicator-domain\.js\?v=ui-contract-addendum-v5/);
}
assert.match(candidateDetail, /candidate-workspace-conversation-runtime\.js\?v=understanding-consistency-20261014/);
assert.match(pages, /async function submitCandidateDetailConversation/);
// Detail submission must carry the current confirmed revision for legacy Working synchronization.
assert.match(pages, /submit: \(\{ content, target \}\) => submitCandidateDetailConversation\(\{ sourceId: target\.sourceId, itemId: target\.itemId, canonicalRevision, content \}\)/);
assert.match(pages, /form: byId\("candidate-conversation-form"\),[\s\S]*status: byId\("candidate-conversation-status"\)/);
assert.match(pages, /boundedBundlePreparations/);
assert.match(pages, /source_bundle: sourceBundle/);
assert.match(pages, /selectedJobSources = \[selectedJobSource\]/);
assert.doesNotMatch(`${candidateImport}\n${jobImport}`, /data-(?:candidate|job)-processing-mode|id="(?:candidate|job)-processing-modes"/);
assert.match(read("public/styles.css"), /\.v1-conversation-message\.is-entering, \.is-working-ready/);
assert.match(read("public/styles.css"), /prefers-reduced-motion[\s\S]*\.v1-processing-loop[\s\S]*animation: none/);
assert.doesNotMatch(pages.slice(pages.indexOf("async function executeJobModelProcessing"), pages.indexOf("async function runJobProcessing")), /job_model_single_source_required/);
assert.match(conversationUi, /insertBefore\(scroll, pane\.firstElementChild\)/);
assert.match(conversationUi, /ariadne-conversation-execution-state/);
assert.doesNotMatch(conversationOutput, /本轮处理耗时|完整回复校验后显示/);
assert.doesNotMatch(read("public/conversation-output.css"), /v1-conversation-elapsed/);
assert.match(memoryBridge, /ariadne-open-personal-supplement/);
assert.match(pages, /let frameConversationActive = false/);
assert.match(pages, /if \(!frameConversationActive\) \{[\s\S]*frame\.src = "about:blank"/);
assert.match(pages, /function renderJobConversationMessages\(messages, \{ include_pending_user: includePendingUser = true \}/);

console.log(JSON.stringify({
  shared_source_input: "pass",
  guarded_clipboard_contract: "pass",
  ordered_source_bundle: "pass",
  shared_processing_indicator: "pass",
  shared_detail_edit_shell: "pass",
  exact_candidate_job_symbol_reuse: "pass",
  runtime_driven_import: "pass",
  pasted_text_durable_bundle: "pass",
  reduced_motion_contract: "pass",
  conversation_continuity_and_compact_layout: "pass",
}));
