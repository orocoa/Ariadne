import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const Truth = require("../public/truth-persistence-domain.js");
const Gate = require("../public/runtime-capability-gate.js");
const LocalJob = require("../public/local-job-extraction-domain.js");
const JobModel = require("../public/job-model-runtime-domain.js");
const JobContext = require("../public/job-context-domain.js");
const ImportLifecycle = require("../public/model-import-lifecycle-domain.js");
const ModelWorkspaceUI = require("../public/model-workspace-ui-domain.js");
const JobConversation = require("../public/job-conversation-domain.js");
const ConversationOutput = require("../public/conversation-output.js");
const ResumeTaskSupport = require("../public/resume-task-support.js");

function memoryDatabase() {
  const specs = new Map(Truth.STORE_SPECS.map((spec) => [spec.name, spec]));
  const records = new Map([...specs].map(([name]) => [name, new Map()]));
  return {
    records,
    transaction() {
      let completionTimer = null;
      let aborted = false;
      const scheduleComplete = () => {
        clearTimeout(completionTimer);
        completionTimer = setTimeout(() => { if (!aborted) transaction.oncomplete?.(); }, 0);
      };
      const transaction = {
        abort() { aborted = true; clearTimeout(completionTimer); queueMicrotask(() => transaction.onabort?.()); },
        objectStore(name) {
          const spec = specs.get(name);
          assert(spec, `unknown memory store ${name}`);
          return {
            add(value) {
              const request = {};
              const key = value[spec.keyPath];
              queueMicrotask(() => {
                if (records.get(name).has(key)) {
                  request.error = Object.assign(new Error("ConstraintError"), { name: "ConstraintError" });
                  request.onerror?.({ preventDefault() {}, stopPropagation() {} });
                } else {
                  records.get(name).set(key, structuredClone(value));
                  request.onsuccess?.();
                }
                scheduleComplete();
              });
              return request;
            },
            put(value) { records.get(name).set(value[spec.keyPath], structuredClone(value)); scheduleComplete(); },
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = records.get(name).has(key) ? structuredClone(records.get(name).get(key)) : undefined;
                request.onsuccess?.();
                scheduleComplete();
              });
              return request;
            },
          };
        },
      };
      return transaction;
    },
  };
}

function put(database, store, value) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([store], "readwrite");
    transaction.objectStore(store).put(value);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

const jobText = [
  "AI Systems Product Manager",
  "Ariadne Labs",
  "工作地点：上海 / Remote",
  "负责建立证据驱动的 AI 产品系统。",
  "任职要求",
  "- 能设计 Human-in-the-loop 工作流 🚀",
  "- 有 AI 产品评估经验",
].join("\n");
const source = await LocalJob.preparePastedText(jobText, "job-batch-model-regression");
const sourceDocument = LocalJob.sourceDocumentFor(source, "2026-09-04T04:00:00.000Z");
const authority = Gate.authorityFrom({ mode: "model", provider: "deepseek", model: "deepseek-flash" }, "job_text_import");
const gate = JobModel.assertEligibleGate(Gate.operationGate("job_text_import", authority));
assert.equal(gate.allowed, true);
assert.equal(Gate.DEEPSEEK_PRO_MODEL_DESCRIPTOR.runtime_capabilities.job_model_structuring, "unsupported");
assert.equal(Gate.JOB_MULTIMODAL_IMPORT_ADAPTER.runtime_capabilities.job_model_structuring, "supported");

const snapshot = JobModel.createRuntimeSnapshot({ operation: "job_text_import", snapshot_id: "runtime-snapshot-job-model-regression", captured_at: "2026-09-04T04:00:01.000Z" });
const preparation = JobModel.sourcePreparationFor(sourceDocument, {
  content_hash: sourceDocument.content_hash,
  extracted_text: jobText,
  extraction_method: "utf8_text_ephemeral_v0",
  read_only: true,
  writeback: false,
  model_call_made: false,
});
assert.equal(preparation.semantic_structuring, false);
assert.equal(preparation.source_document_id, sourceDocument.source_document_id);
assert(preparation.blocks.some((block) => block.text.includes("Human-in-the-loop")));
const preparedText = preparation.blocks.map((block) => block.text).join("");
assert.equal(preparation.character_count, Array.from(preparedText).length, "astral Unicode characters use backend-compatible code point counts");
assert.notEqual(preparation.character_count, preparedText.length, "regression fixture must exercise a UTF-16 surrogate pair");

const consent = JobModel.consentFor(source, snapshot, "2026-09-04T04:00:02.000Z", "consent-job-model-regression");
const operationIdentity = await JobModel.operationIdentityFor(source, snapshot, consent);
const pendingRun = JobModel.processingRunFor(source, snapshot.snapshot_id, "PENDING", { run_id: `run-${operationIdentity.operation_id}` });
const database = memoryDatabase();
assert.equal(await JobModel.claimProcessingRun(database, pendingRun), true);
const runningRun = JobModel.processingRunFor(source, snapshot.snapshot_id, "RUNNING", {
  run_id: pendingRun.run_id,
  started_at: "2026-09-04T04:00:03.000Z",
  timestamp: "2026-09-04T04:00:03.000Z",
});
await put(database, "processing_runs", runningRun);
const request = JobModel.requestFor({ source_document: sourceDocument, source_preparation: preparation, snapshot, run: runningRun, consent, operation_identity: operationIdentity });
assert.equal(request.contract_id, JobModel.CONTRACTS.request_contract_version);

const modelProposal = {
  contract_id: JobModel.PROPOSAL_CONTRACT,
  title: { value: "AI Systems Product Manager", source_refs: ["job-source-block-1"] },
  company: { value: "Ariadne Labs", source_refs: ["job-source-block-1"] },
  location: { value: "上海 / Remote", source_refs: ["job-source-block-1"] },
  summary: { value: "建立证据驱动的 AI 产品系统。", source_refs: ["job-source-block-1"] },
  requirements: [
    { label: "Human-in-the-loop", detail: "能设计 Human-in-the-loop 工作流", source_refs: ["job-source-block-1"] },
    { label: "AI 产品评估", detail: "有 AI 产品评估经验", source_refs: ["job-source-block-1"] },
  ],
  uncertainties: [],
};
const result = {
  contract_id: JobModel.CONTRACTS.result_contract_version,
  provider: "deepseek",
  model: JobModel.MODEL_ID,
  protocol: "OPENAI_CHAT_COMPLETIONS",
  adapter_version: JobModel.CONTRACTS.adapter_version,
  runtime_snapshot_id: snapshot.snapshot_id,
  source_document_id: source.source_document_id,
  processing_run_id: runningRun.run_id,
  operation_id: operationIdentity.operation_id,
  usage: { prompt_tokens: 10, completion_tokens: 20 },
  job_proposal: modelProposal,
  network_call_made: true,
  persistence: "browser_working_job_save_required",
};
const proposal = JobModel.proposalFor({ source, source_document: sourceDocument, source_preparation: preparation, run: runningRun, result });
assert.equal(proposal.authority, "NON_AUTHORITATIVE_PROPOSAL");
assert.equal(proposal.status, "AWAITING_REVIEW");
assert.equal(proposal.payload.field_provenance.title, "MODEL_PROPOSED");
assert.equal(proposal.grounding_refs[0].source_document_id, source.source_document_id);
assert.equal(proposal.payload.source_document_ids[0], source.source_document_id);
await JobModel.persistSuccessfulResult(database, runningRun, proposal, new AbortController().signal);
assert.equal(database.records.get("processing_runs").get(runningRun.run_id).status, "SUCCEEDED");
assert.equal(database.records.get("context_proposals").get(proposal.proposal_id).proposal_id, proposal.proposal_id);
const workingSubject = JobContext.workingSubjectFor(proposal, { summary: "Human refined working summary." });
assert.equal(workingSubject.authority, "NON_AUTHORITATIVE_WORKING_MODEL");
assert.equal(workingSubject.version, 0);
assert.equal(workingSubject.payload.summary, "Human refined working summary.");
assert.equal(workingSubject.payload.field_provenance.summary, "HUMAN_EDITED");
assert.throws(() => JobContext.workingSubjectFor({ ...proposal, warnings: [] }), /job_working_model_proposal_required/);

const progressTarget = { innerHTML: "" };
ModelWorkspaceUI.renderProgress(progressTarget, ["read", "understand", "build"], 1);
assert.match(progressTarget.innerHTML, /is-complete[^>]*><span[^>]*><\/span>read/);
assert.match(progressTarget.innerHTML, /is-current[^>]*><span[^>]*><\/span>understand/);

const pages = fs.readFileSync(path.join(root, "public/v1-pages.js"), "utf8");
const modelFlow = pages.slice(pages.indexOf("async function executeJobModelProcessing"), pages.indexOf("async function runJobProcessing"));
assert.match(modelFlow, /readJobSourceForModel/);
assert.match(modelFlow, /callJobModelRuntime|JobModel\.proposalFor|persistSuccessfulResult/);
assert.match(modelFlow, /showJobModelProcessingWorkspace|setJobWorkspaceProgress|showJobWorkingWorkspace/);
assert.match(modelFlow, /stopJobModelWaitStatus/);
assert.match(modelFlow, /ModelImportLifecycle\.STATES\.WORKING/);
assert.doesNotMatch(modelFlow, /renderAwaitingJobReviews|resolveJobProposalLifecycle/);
assert.doesNotMatch(modelFlow, /processJobSource|JobContext\.proposalFor|local-job-extract|local-job-image-ocr/);
const modelFailure = fs.readFileSync(path.join(root, "public/jd-import.html"), "utf8");
assert.match(modelFailure, /MODEL_FAILED/);
assert.doesNotMatch(modelFailure, /data-job-processing-mode|id="job-processing-modes"|>本地整理<|>ARIADNE AI</);
assert.doesNotMatch(modelFailure, /id="job-model-use-local"|>改用本地整理</);
assert.match(modelFailure, /打开运行方式/);
assert.match(modelFailure, /id="job-ai-workspace" class="v1-workspace-layer hidden"/);
assert.match(modelFailure, /NON_AUTHORITATIVE WORKING JOB/);
assert.match(modelFailure, /id="job-workspace-save"[^>]*>保存职位</);
assert.match(pages, /原件已安全保存在本机；长文本或图片可能需要几分钟/);
// Execute the actual Job projection rather than freezing its object spelling.
// Reviewed proof is an addition to the original message/deliverable/search fields.
const submitStart = pages.indexOf("  async function submitJobConversation(");
const submitEnd = pages.indexOf("  async function initJobDetail(", submitStart);
assert(submitStart >= 0 && submitEnd > submitStart, "target the real Job submit flow");
const jobSubmit = pages.slice(submitStart, submitEnd);
const assistantAssignments = [...jobSubmit.matchAll(/\bconst assistantMessage\s*=\s*(\{[^\n]+\});/g)];
assert.equal(assistantAssignments.length, 1, "the Job flow has one assistant projection");
const session = JobConversation.createSession("job-model-import-projection", "2026-10-14T00:00:00Z");
const projectAssistant = (conversationResult, resumeMetadata) => vm.runInNewContext(`(${assistantAssignments[0][1]})`, {
  JobConversation, session, result: conversationResult, resumeMetadata,
  globalThis: { AriadneConversationOutput: ConversationOutput },
});
const search = { version: "ariadne-public-search-v1", authority: "EXTERNAL_WEB_NON_AUTHORITATIVE",
  personal_data_written: false, source_verification: "MODEL_CITED", calls: 1, searched_at: "2026-10-14T00:00:00Z",
  sources: [{ title: "Synthetic public source", url: "https://example.test/job" }] };
const ordinaryResult = { output: { message: "Current Job discussion answer." }, deliverable: null, web_search: search };
const ordinaryAssistant = projectAssistant(ordinaryResult, null);
assert.equal(ordinaryAssistant.contract_id, JobConversation.createMessage(session, "ASSISTANT", "Baseline").contract_id);
assert.equal(ordinaryAssistant.conversation_id, session.conversation_id);
assert.equal(ordinaryAssistant.role, "ASSISTANT");
assert.equal(ordinaryAssistant.authority, "NON_AUTHORITATIVE_MODEL_OUTPUT");
assert.equal(ordinaryAssistant.content, ordinaryResult.output.message);
assert.match(ordinaryAssistant.message_id, /^job-message-assistant-/);
assert(Number.isFinite(Date.parse(ordinaryAssistant.created_at)));
assert.equal(ordinaryAssistant.deliverable, null);
assert.deepEqual(ordinaryAssistant.web_search, search);
assert.equal(Object.hasOwn(ordinaryAssistant, "resume_task"), false, "ordinary discussion cannot gain reviewed proof");
const resume = { kind: "RESUME", title: "Synthetic Resume", body: "", nodes: [], edges: [], resume: {
  template_name: "", review_notes: [], layout: { margin_mm: 15, body_pt: 10.5, line_height: 1.3, name_pt: 21, section_pt: 13, section_gap_pt: 12 },
  blocks: [{ type: "NAME", text: "Synthetic Name", right: "", emphasis: "REGULAR" },
    { type: "SECTION", text: "EXPERIENCE", right: "", emphasis: "REGULAR" },
    { type: "BULLET", text: "Current supported contribution.", right: "", emphasis: "REGULAR" }],
} };
const prepared = { status: "READY", task: { task_id: "synthetic-resume-task", scope: {
  workspace: "synthetic-workspace", domain: "JOB", conversation_id: session.conversation_id } },
  document_version: { version_id: "synthetic-resume-version", document_hash: `sha256:${"a".repeat(64)}`, evidence_hash: `sha256:${"b".repeat(64)}` } };
const proof = ResumeTaskSupport.metadata(prepared);
assert.deepEqual(ResumeTaskSupport.validateMetadata(proof), proof);
const reviewedResult = { output: { message: "The reviewed resume is ready." }, deliverable: resume,
  delivery_version: "ariadne-conversation-delivery-v3", resume_task: { status: "READY", deliverable: resume }, web_search: search };
const reviewedAssistant = projectAssistant(reviewedResult, proof);
assert.equal(reviewedAssistant.content, reviewedResult.output.message);
assert.equal(reviewedAssistant.conversation_id, session.conversation_id);
assert.equal(reviewedAssistant.role, "ASSISTANT");
assert.equal(reviewedAssistant.authority, "NON_AUTHORITATIVE_MODEL_OUTPUT");
assert.deepEqual(reviewedAssistant.deliverable, resume);
assert.deepEqual(reviewedAssistant.web_search, search);
assert.equal(reviewedAssistant.resume_task, proof, "retain the exact checked task/version/scope/document/evidence proof");
for (const status of ["NEEDS_FACTS", "REVISION_REQUIRED"]) {
  const blockedProof = ResumeTaskSupport.metadata({ ...prepared, status });
  assert.equal(blockedProof, null);
  assert.equal(Object.hasOwn(projectAssistant(ordinaryResult, blockedProof), "resume_task"), false);
  assert.throws(() => projectAssistant({ ...reviewedResult, resume_task: { status, deliverable: resume } }, blockedProof), /简历尚未通过事实审核/);
}
assert.match(jobSubmit, /const resumePrepared = await window\.AriadneResumeTaskSupport\.prepareResult\(database, request, result\);/);
assert.match(jobSubmit, /const resumeMetadata = window\.AriadneResumeTaskSupport\.metadata\(resumePrepared\);/);
assert.match(jobSubmit, /JobConversationPersistence\.persistSuccessfulTurn\(database, \{ execution, analysis, assistant_message: assistantMessage, change_proposal: proposal, resume_task: resumePrepared \}\)/);
const prepareIndex = jobSubmit.indexOf("const resumePrepared ="), proofIndex = jobSubmit.indexOf("const resumeMetadata =");
const assistantIndex = jobSubmit.indexOf("const assistantMessage ="), persistIndex = jobSubmit.indexOf("JobConversationPersistence.persistSuccessfulTurn(");
assert(prepareIndex >= 0 && prepareIndex < proofIndex && proofIndex < assistantIndex && assistantIndex < persistIndex,
  "checked proof and assistant stay in the domain-owned successful-turn save");
assert.match(pages, /const visible = JobConversation\.connectedHistory\(messages\)/);
assert.match(pages, /include_pending_user: true/);
assert.doesNotMatch(modelFailure, /确认并创建职位版本[^<]*<\/button>[\s\S]*model_generated_non_authoritative/);
assert.match(pages, /currentOperationGate\(modelMode \? jobImportOperation\(\) : "job_import"\)/);
assert.doesNotMatch(pages, /selectedJobProcessingMode|configureJobProcessingMode/);
const consentFlow = pages.slice(pages.indexOf("async function openJobModelConsent"), pages.indexOf("function runJobModelProcessing"));
assert.ok(consentFlow.indexOf("SourceInput.persistDurableBundle") < consentFlow.indexOf("dialog.showModal()"));
assert.ok(consentFlow.indexOf("selectedJobSources = sources") < consentFlow.indexOf("dialog.showModal()"), "execution reuses the consent sources that include the entered job link");
assert.match(pages, /selectedJobSources = \[selectedJobSource\]/);
const lifecycle = ImportLifecycle.createStateMachine();
assert.equal(lifecycle.transition(ImportLifecycle.STATES.SOURCE_STORED), "SOURCE_STORED");
assert.equal(lifecycle.transition(ImportLifecycle.STATES.MODEL_PROCESSING), "MODEL_PROCESSING");
assert.equal(lifecycle.transition(ImportLifecycle.STATES.WORKING), "WORKING");
assert.equal(lifecycle.transition(ImportLifecycle.STATES.SAVED), "SAVED");
const localLifecycle = ImportLifecycle.createStateMachine();
localLifecycle.transition(ImportLifecycle.STATES.SOURCE_STORED);
localLifecycle.transition(ImportLifecycle.STATES.MODEL_PROCESSING);
assert.equal(localLifecycle.transition(ImportLifecycle.STATES.PROPOSAL_READY), "PROPOSAL_READY");
assert.equal(localLifecycle.proposalReady(1), "REVIEWING");
assert.equal(localLifecycle.reviewProgress(0), "READY_TO_SAVE");
assert.equal(localLifecycle.transition(ImportLifecycle.STATES.SAVED), "SAVED");
const failedLifecycle = ImportLifecycle.createStateMachine();
failedLifecycle.transition(ImportLifecycle.STATES.SOURCE_STORED);
failedLifecycle.transition(ImportLifecycle.STATES.MODEL_PROCESSING);
assert.equal(failedLifecycle.transition(ImportLifecycle.STATES.MODEL_FAILED), "MODEL_FAILED");
assert.match(pages, /selectedSourceIds = new Set/);
assert.match(pages, /selectedSourceIds\.size > 0 && proposal\.source_document_ids\.some/);

console.log(JSON.stringify({
  model_pipeline_isolated_from_local_semantics: "pass",
  durable_source_and_bound_provenance: "pass",
  model_proposal_becomes_working_job: "pass",
  candidate_proven_workspace_lifecycle_reused: "pass",
  failure_requires_product_runtime_change: "pass",
  local_actionable_review_lifecycle_preserved: "pass",
}));
