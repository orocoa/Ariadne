import assert from "node:assert/strict";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Truth = require("../public/truth-persistence-domain.js");
const Runtime = require("../public/runtime-capabilities.js");
const LocalJob = require("../public/local-job-extraction-domain.js");
const JobContext = require("../public/job-context-domain.js");
const CandidateContext = require("../public/job-candidate-context-domain.js");
const SourceRetrieval = require("../public/source-retrieval-domain.js");
const Conversation = require("../public/job-conversation-domain.js");
const Persistence = require("../public/job-conversation-persistence-domain.js");

function namedBlob(parts, name, type) {
  const blob = new Blob(parts, { type });
  Object.defineProperty(blob, "name", { value: name, enumerable: true });
  return blob;
}

function memoryDatabase() {
  const specs = new Map(Truth.STORE_SPECS.map((spec) => [spec.name, spec]));
  const records = new Map([...specs].map(([name]) => [name, new Map()]));
  return {
    records,
    objectStoreNames: { contains: (name) => specs.has(name) },
    transaction() {
      let completionTimer = null;
      let aborted = false;
      const scheduleComplete = () => {
        clearTimeout(completionTimer);
        completionTimer = setTimeout(() => { if (!aborted) tx.oncomplete?.(); }, 0);
      };
      const tx = {
        abort() { aborted = true; clearTimeout(completionTimer); queueMicrotask(() => tx.onabort?.()); },
        objectStore(name) {
          const spec = specs.get(name);
          assert(spec, `unknown memory store ${name}`);
          return {
            put(value) { records.get(name).set(value[spec.keyPath], structuredClone(value)); scheduleComplete(); },
            add(value) {
              const key = value[spec.keyPath];
              if (records.get(name).has(key)) throw new Error("ConstraintError");
              records.get(name).set(key, structuredClone(value));
              scheduleComplete();
            },
            getAll() {
              const request = {};
              queueMicrotask(() => { request.result = [...records.get(name).values()].map((value) => structuredClone(value)); request.onsuccess?.(); scheduleComplete(); });
              return request;
            },
            get(key) {
              const request = {};
              queueMicrotask(() => { request.result = records.get(name).has(key) ? structuredClone(records.get(name).get(key)) : undefined; request.onsuccess?.(); scheduleComplete(); });
              return request;
            },
          };
        },
      };
      return tx;
    },
  };
}

const database = memoryDatabase();
const jobText = [
  "AI Systems Product Manager",
  "Ariadne Labs 科技公司",
  "工作地点：上海 / Remote",
  "负责证据驱动的 AI 产品系统。",
  "任职要求",
  "- 有 AI 产品与评估经验",
  "- 能设计 Human-in-the-loop 工作流",
  "- 能清晰表达系统取舍",
].join("\n");
const sourceInput = await LocalJob.preparePastedText(jobText, "job-batch-synthetic", "https://example.invalid/metadata-only");
assert(sourceInput.source_document_id.startsWith("source-job-"));
const sourceDocument = LocalJob.sourceDocumentFor(sourceInput, "2026-09-04T01:00:00Z");
const resolved = await LocalJob.persistCanonicalSource(database, sourceDocument, sourceInput.file);
assert.equal(await resolved.file.text(), jobText);
assert.equal(resolved.metadata.content_hash, sourceDocument.content_hash);
assert.equal(sourceDocument.provenance.source_url, "https://example.invalid/metadata-only");

const localSnapshot = Runtime.createRuntimeSnapshot({ mode: "local" }, {
  snapshotId: "runtime-snapshot-job-local", capturedAt: "2026-09-04T01:00:01Z", operation: "JOB_LOCAL_IMPORT", schemaVersion: JobContext.PAYLOAD_CONTRACT,
});
await Truth.persistRecord(database, "runtime_snapshots", localSnapshot);
const extractionRun = LocalJob.processingRunFor(sourceInput, localSnapshot.snapshot_id, "RUNNING", { timestamp: "2026-09-04T01:00:02Z" });
const artifact = LocalJob.artifactFor(sourceInput, extractionRun, {
  pages: [{ page: 1, lines: jobText.split("\n") }],
  document_blocks: jobText.split("\n").map((text, index) => ({ page: 1, block_id: `job-block-${index + 1}`, text })),
  extracted_text: jobText,
  byte_size: sourceInput.size,
  extraction_method: "utf8_text_v0",
  processing_boundary: "localhost_transient_job_extraction",
  warnings: [],
});
await Truth.persistRecord(database, "extraction_artifacts", artifact);
const structuringRun = JobContext.structuringRunFor(sourceInput, localSnapshot.snapshot_id, "RUNNING", { timestamp: "2026-09-04T01:00:03Z" });
const proposal = JobContext.proposalFor({ source: sourceDocument, artifact, structuring_run: structuringRun, source_url: sourceInput.source_url });
await Truth.persistRecord(database, "context_proposals", proposal);
assert.equal(proposal.payload.title, "AI Systems Product Manager");
assert(proposal.payload.requirements.some((item) => item.detail.includes("Human-in-the-loop")));
assert.equal(proposal.authority, "NON_AUTHORITATIVE_PROPOSAL");
assert.equal(database.records.get("job_context_revisions").size, 0);
const confirmed = await JobContext.persistReview(database, proposal, "CONFIRM");
assert.equal(confirmed.revision.version, 1);
assert.equal(confirmed.revision.authority, "AUTHORITATIVE_CONFIRMED_CONTEXT");
assert(!confirmed.revision.context_id.includes(sourceDocument.content_hash.replace("sha256:", "")));
const revisionWithoutCopiedUrl = structuredClone(confirmed.revision);
revisionWithoutCopiedUrl.payload.source_url = null;
const archivedSource = {
  contract_id: "ariadne-source-archive-v1",
  source_document_id: "source-archive-v1::synthetic-link",
  material_type: "JOB",
  source_document_ids: [...confirmed.revision.payload.source_document_ids],
  source_url: sourceInput.source_url,
  created_at: "2026-09-04T01:00:04Z",
};
assert.equal(JobContext.archivedSourceUrl([archivedSource], confirmed.revision.payload.source_document_ids), sourceInput.source_url);
assert.equal(JobContext.recordForUi(revisionWithoutCopiedUrl, [archivedSource]).source_url, sourceInput.source_url, "cards recover a link retained by the exact source archive");
assert.equal(JobContext.recordForUi(revisionWithoutCopiedUrl, [{ ...archivedSource, source_document_ids: ["other-source"] }]).source_url, null, "an unrelated archive cannot lend its URL to this job");
const immutableV1 = structuredClone(confirmed.revision);

const directEdit = await JobContext.persistDirectEdit(database, confirmed.revision, { location: "上海（混合办公）", requirements: confirmed.revision.payload.requirements });
assert.equal(directEdit.revision.version, 2);
assert.equal(directEdit.revision.previous_revision_id, confirmed.revision.revision_id);
assert.deepEqual(directEdit.revision.payload.requirements, confirmed.revision.payload.requirements);
assert.deepEqual(database.records.get("job_context_revisions").get(confirmed.revision.revision_id), immutableV1);
const modelProposal = JobContext.createChangeProposal({
  current_revision: directEdit.revision, field: "location", desired_value: "深圳", reason: "Human explicitly requested this semantic edit.", source_analysis_id: "job-analysis-synthetic",
});
await JobContext.persistChangeProposal(database, modelProposal);
assert.equal(JobContext.latestRevision([...database.records.get("job_context_revisions").values()]).payload.location, "上海（混合办公）");
const modelAccepted = await JobContext.persistAcceptedChange(database, directEdit.revision, modelProposal);
assert.equal(modelAccepted.revision.version, 3);
assert.equal(modelAccepted.revision.payload.location, "深圳");
assert.equal(modelAccepted.revision.confirmed_from_proposal_id, modelProposal.job_change_proposal_id);
assert.equal(modelAccepted.revision.review_decision_id, modelAccepted.decision.job_change_decision_id);
assert.deepEqual(database.records.get("job_context_revisions").get(confirmed.revision.revision_id), immutableV1);

const baseCandidate = {
  candidate_context_revisions: [{
    contract_id: "ariadne-context-revision-v1", context_id: "candidate-context-synthetic", context_type: "CANDIDATE", revision_id: "candidate-revision-v1", version: 1,
    payload: { items: [{ item_id: "project-alpha", item_type: "PROJECT", title: "AI Evidence Project", summary: "Designed evidence-grounded product evaluation.", facts: [{ label: "Outcome", value: "Built an evaluation workflow" }], uncertainties: [] }] },
    provenance: { source_document_ids: ["source-candidate-confirmed"], processing_run_id: "candidate-run", runtime_snapshot_id: "candidate-runtime" },
    previous_revision_id: null, confirmed_from_proposal_id: "candidate-proposal", review_decision_id: "candidate-review", created_at: "2026-09-04T01:10:00Z", authority: "AUTHORITATIVE_CONFIRMED_CONTEXT",
  }],
  candidate_context_lifecycle: [],
  candidate_working_models: [{
    working_model_id: "candidate-working-v1", source_document_id: "source-candidate-working", version: 1, previous_working_model_id: null, fingerprint: "sha256:" + "a".repeat(64),
    payload: { items: [{ item_id: "working-project", item_type: "PROJECT", title: "Working HITL Prototype", summary: "Unconfirmed prototype evidence.", facts: [], uncertainties: [] }] },
  }],
  candidate_workspace_acceptances: [],
  career_entities: [{ entity_id: "legacy-entity-1", entity_type: "skill", data: { name: "Legacy research" }, review_status: "confirmed", source_document_ids: [] }],
  career_evidence: [],
  source_documents: [
    { contract_id: "ariadne-source-document-v1", source_document_id: "source-candidate-confirmed", content_hash: "sha256:" + "b".repeat(64), local_reference: "indexeddb://confirmed" },
    { contract_id: "ariadne-source-document-v1", source_document_id: "source-candidate-working", content_hash: "sha256:" + "c".repeat(64), local_reference: "indexeddb://working" },
  ],
};
const candidateA = await CandidateContext.buildSnapshot(baseCandidate);
assert.equal(candidateA.provider_view.confirmed.length, 2);
assert.equal(candidateA.provider_view.working.length, 1);
assert(candidateA.provider_view.working.every((item) => item.authority === "NON_AUTHORITATIVE"));
assert(!JSON.stringify(candidateA.provider_view).includes("candidate-context-synthetic"));
assert.equal(CandidateContext.candidateDelta(null, candidateA).mode, "BASELINE");

const candidateAdded = structuredClone(baseCandidate);
candidateAdded.candidate_context_revisions[0].payload.items.push({ item_id: "project-beta", item_type: "PROJECT", title: "New AI Project", summary: "Newly added current project.", facts: [], uncertainties: [] });
const candidateB = await CandidateContext.buildSnapshot(candidateAdded);
assert(CandidateContext.candidateDelta(candidateA, candidateB).changes.some((entry) => entry.change === "ADDED"));
const candidateEdited = structuredClone(candidateAdded);
candidateEdited.candidate_context_revisions[0].payload.items[0].summary = "Updated stable project evidence.";
const candidateC = await CandidateContext.buildSnapshot(candidateEdited);
const editedDelta = CandidateContext.candidateDelta(candidateB, candidateC);
assert(editedDelta.changes.some((entry) => entry.change === "UPDATED"));
const editedProviderDelta = editedDelta.provider_view.find((entry) => entry.change === "UPDATED");
assert.equal(editedProviderDelta.current_candidate.title, "AI Evidence Project");
assert.deepEqual(editedProviderDelta.changed_fields, [{ field: "summary", before: "Designed evidence-grounded product evaluation.", current: "Updated stable project evidence." }]);
assert(!JSON.stringify(editedDelta.provider_view).includes("canonical:"));
assert(!JSON.stringify(editedDelta.provider_view).includes("sha256:"));
const candidateRemoved = structuredClone(candidateEdited);
candidateRemoved.candidate_context_lifecycle.push({ context_id: "candidate-context-synthetic", item_id: "project-alpha", state: "REMOVED", authority: Truth.AUTHORITY.lifecycle });
const candidateD = await CandidateContext.buildSnapshot(candidateRemoved);
const removedDelta = CandidateContext.candidateDelta(candidateC, candidateD);
assert(removedDelta.changes.some((entry) => entry.change === "REMOVED"));
assert.equal(removedDelta.provider_view.find((entry) => entry.change === "REMOVED").previous_candidate.title, "AI Evidence Project");
const unstableA = structuredClone(baseCandidate);
delete unstableA.candidate_working_models[0].payload.items[0].item_id;
const unstableB = structuredClone(unstableA);
unstableB.candidate_working_models[0].payload.items[0].summary = "Changed but identity remains unproven.";
unstableB.candidate_working_models[0].working_model_id = "candidate-working-v2";
unstableB.candidate_working_models[0].previous_working_model_id = "candidate-working-v1";
unstableB.candidate_working_models[0].version = 2;
assert(CandidateContext.candidateDelta(await CandidateContext.buildSnapshot(unstableA), await CandidateContext.buildSnapshot(unstableB)).changes.some((entry) => entry.change === "NEEDS_REVIEW"));

let rawReads = 0;
const sufficient = await SourceRetrieval.retrieve({ mode: "model", purpose: "JOB_REQUIREMENT_DETAIL", structured_sufficient: true });
assert.equal(sufficient.status, "NOT_NEEDED");
const fromArtifact = await SourceRetrieval.retrieve({ mode: "model", purpose: "JOB_REQUIREMENT_DETAIL", structured_sufficient: false, requested_source_document_ids: [sourceDocument.source_document_id], source_documents: [sourceDocument], extraction_artifacts: [artifact], query_terms: ["Human-in-the-loop"], raw_text_reader: async () => { rawReads += 1; } });
assert.equal(fromArtifact.method, "EXTRACTION_ARTIFACT");
assert.equal(rawReads, 0);
assert(fromArtifact.provider_view.every((entry) => !Object.hasOwn(entry, "source_document_id")));
const fromRaw = await SourceRetrieval.retrieve({ mode: "model", purpose: "GROUNDING_VERIFICATION", structured_sufficient: false, requested_source_document_ids: [sourceDocument.source_document_id], source_documents: [sourceDocument], extraction_artifacts: [], query_terms: ["评估"], raw_text_reader: async () => { rawReads += 1; return { content_hash: sourceDocument.content_hash, extracted_text: jobText }; } });
assert.equal(fromRaw.method, "EPHEMERAL_LOCAL_SOURCE_READ");
assert.equal(rawReads, 1);
assert.equal((await SourceRetrieval.retrieve({ mode: "model", purpose: "JOB_REQUIREMENT_DETAIL", structured_sufficient: false, requested_source_document_ids: [], source_documents: [], extraction_artifacts: [] })).status, "SOURCE_UNAVAILABLE");
await assert.rejects(SourceRetrieval.retrieve({ mode: "model", purpose: "GROUNDING_VERIFICATION", structured_sufficient: false, requested_source_document_ids: [sourceDocument.source_document_id], source_documents: [sourceDocument], extraction_artifacts: [], raw_text_reader: async () => ({ content_hash: "sha256:wrong", extracted_text: jobText }) }), (error) => error.code === "SOURCE_PROVENANCE_FAILURE");

const runtimeSnapshot = Conversation.createRuntimeSnapshot({ snapshot_id: "runtime-snapshot-job-model", captured_at: "2026-09-04T02:00:00Z" });
const session = Conversation.createSession(modelAccepted.revision.context_id, "2026-09-04T02:00:01Z");
const candidateDelta = CandidateContext.candidateDelta(null, candidateA);
const compiled = Conversation.compileContext({ job_revision: modelAccepted.revision, candidate_snapshot: candidateA, candidate_delta: candidateDelta, source_excerpt_manifest: fromArtifact, human_message: "我还需要补充什么？", messages: [] });
const historySession = Conversation.createSession(modelAccepted.revision.context_id, "2026-09-04T04:10:00.000Z");
const connected = Conversation.connectedHistory([
  Conversation.createMessage(historySession, "USER", "first", "2026-09-04T04:10:01.000Z"),
  Conversation.createMessage(historySession, "ASSISTANT", "answer", "2026-09-04T04:10:02.000Z"),
  Conversation.createMessage(historySession, "USER", "failed orphan", "2026-09-04T04:10:03.000Z"),
  Conversation.createMessage(historySession, "USER", "retry", "2026-09-04T04:10:04.000Z"),
  Conversation.createMessage(historySession, "ASSISTANT", "retry answer", "2026-09-04T04:10:05.000Z"),
  Conversation.createMessage(historySession, "USER", "latest failed orphan", "2026-09-04T04:10:06.000Z"),
]);
assert.deepEqual(connected.map((entry) => entry.content), ["first", "answer", "retry", "retry answer"]);
const memorySnapshot = { ...candidateA, memory_revision_count: 3 };
const memoryCompile = (messages, delta = candidateDelta) => Conversation.compileContext({ job_revision: modelAccepted.revision, candidate_snapshot: memorySnapshot, candidate_delta: delta, source_excerpt_manifest: fromArtifact, human_message: "当前资料", messages });
assert.equal(memoryCompile(connected).history.length, 0, "old unbound conversation must not resurrect saved/retracted personal memory");
assert.equal(memoryCompile(connected.map((entry) => entry.role === "ASSISTANT" ? { ...entry, candidate_fingerprint: candidateA.aggregate_fingerprint } : entry)).history.length, 4);
const removedMemoryDelta = { ...candidateDelta, provider_view: [{ change_ref: "candidate-change-1", change: "REMOVED", layer: "CONFIRMED", previous_candidate: { item_type: "PERSONAL_MEMORY", summary: "removed private preference" }, current_candidate: null, changed_fields: [] }] };
assert(!JSON.stringify(memoryCompile([], removedMemoryDelta)).includes("removed private preference"));
assert.equal(memoryCompile([], removedMemoryDelta).candidate_delta_coverage.complete, false);
assert.equal(compiled.turn_scope.scope, "CURRENT_CANDIDATE_X_ACTIVE_JOB");
assert.equal(compiled.turn_scope.referent, "ACTIVE_JOB_WITH_CURRENT_CANDIDATE");
assert.equal(compiled.turn_scope.job_edit_requested, undefined, "intent is not classified by local keywords");
assert.deepEqual(compiled.change_policy.targets, [], "Working/read-only contexts have no write targets");
const serializedProviderContext = JSON.stringify(compiled);
for (const privateValue of [sourceDocument.source_document_id, modelAccepted.revision.revision_id, candidateA.aggregate_fingerprint, "indexeddb://", "/Users/"]) assert(!serializedProviderContext.includes(privateValue));
assert(serializedProviderContext.includes("confirmed-candidate-1"));
assert(serializedProviderContext.includes("working-candidate-1"));
const observation = Conversation.observationFor(modelAccepted.revision, candidateA);
const execution = Conversation.createTurnExecution(session, observation, runtimeSnapshot, { candidate_snapshot: candidateA, candidate_delta: candidateDelta, source_excerpt_manifest: fromArtifact }, "2026-09-04T02:00:02Z");
assert.deepEqual(execution.candidate_manifest.confirmed_manifest, candidateA.confirmed_manifest);
assert.deepEqual(execution.candidate_delta, candidateDelta);
assert.equal(execution.source_excerpt_manifest.policy_version, fromArtifact.policy_version);
assert.deepEqual(execution.source_excerpt_manifest.provider_view, []);
const staleExecution = Persistence.transitionExecution(execution, "ANALYSIS_STALE", "OBSERVATION_CHANGED", "2026-09-04T02:00:02.500Z");
assert.deepEqual(staleExecution.candidate_manifest, execution.candidate_manifest);
assert.deepEqual(staleExecution.candidate_delta, execution.candidate_delta);
assert.deepEqual(staleExecution.source_excerpt_manifest, execution.source_excerpt_manifest);
const request = Conversation.createRuntimeRequest({ session, human_message: "我与这个职位的证据差距是什么？", observation, compiled_context: compiled, candidate_snapshot: candidateA, candidate_delta: candidateDelta, source_excerpt_manifest: fromArtifact, runtime_snapshot: runtimeSnapshot, execution });
assert.deepEqual(request.compiled_context, compiled);
assert(!JSON.stringify(request.compiled_context).includes(sourceDocument.source_document_id));
assert.equal(Conversation.observationMatches(observation, modelAccepted.revision, candidateA), true);
assert.equal(Conversation.observationMatches(observation, modelAccepted.revision, candidateB), false);

await Persistence.ensureSession(database, session);
await Persistence.persistExecution(database, execution);
const output = Conversation.validateSemanticOutput({
  contract_id: "ariadne-job-semantic-output-v2", action: "EXPLAIN", message: "现有项目能支持部分要求；另有证据需要补充。",
  fit_findings: [{ requirement_ref: "job-requirement-1", candidate_refs: ["confirmed-candidate-1"], assessment: "PARTIALLY_SUPPORTED", explanation: "项目展示了相关方法。", uncertainty: null }],
  gap_findings: [{ requirement_ref: "job-requirement-2", candidate_refs: [], gap_type: "EVIDENCE_GAP", explanation: "当前资料没有足够证据，不能推断缺少能力。", uncertainty: "需要更多案例。", clarification_needed: true }],
  recommendations: [{ kind: "PROJECT_POSITIONING", text: "突出 Human-in-the-loop 的取舍与验证。", evidence_state: "EXISTING_EVIDENCE" }],
  candidate_delta_interpretation: null, clarification: null, source_need: null, changes: [],
}, compiled);
const normalizedExplain = Conversation.validateSemanticOutput({ ...output, action: "ASK_CLARIFICATION" }, compiled);
assert.equal(normalizedExplain.action, "EXPLAIN");
assert.equal(normalizedExplain.message, output.message);
const leakyHumanCopy = structuredClone(output);
leakyHumanCopy.message = "最相关的是 AI evaluation project（confirmed-candidate-1），对应 job-requirement-1。";
assert.throws(() => Conversation.validateSemanticOutput(leakyHumanCopy, compiled), /HUMAN_COPY_INTERNAL_ID_FORBIDDEN/);
const normalizedClarification = Conversation.validateSemanticOutput({ ...output, clarification: "你指的是已确认项目还是 Working 项目？" }, compiled);
assert.equal(normalizedClarification.action, "ASK_CLARIFICATION");
const applicationContext = Conversation.compileContext({ job_revision: modelAccepted.revision,
  application: { stage: "APPLIED", outcome: "", note: "已有备注" }, candidate_snapshot: candidateA, candidate_delta: candidateDelta,
  source_excerpt_manifest: fromArtifact, human_message: "同步状态和经过", messages: [] });
assert.equal(applicationContext.application.note, "已有备注");
const changes = [
  { target: "application.stage", value: "CLOSED", record_ref: null, reason: "用户明确要求结束本次跟进。" },
  { target: "journal.append", value: "HR 让加老板微信，一直未通过。", record_ref: null, reason: "保存用户描述的投递经过。" },
  { target: "job.location", value: "深圳", record_ref: null, reason: "用户要求更正地点。" },
];
const edit = Conversation.validateSemanticOutput({ ...output, action: "PROPOSE_JOB_EDIT", changes, clarification: "请确认。" }, applicationContext);
assert.equal(edit.clarification, null);
assert.deepEqual(edit.changes, changes);
assert.throws(() => Conversation.validateSemanticOutput({ ...output, action: "PROPOSE_JOB_EDIT", changes }, compiled), /JOB_CHANGE_SET_INVALID/);
assert.throws(() => Conversation.validateSemanticOutput({ ...output, action: "PROPOSE_JOB_EDIT", changes: [{ ...changes[0], value: "RESUME_REJECTED" }] }, applicationContext), /JOB_CHANGE_SET_INVALID/);
assert.throws(() => Conversation.validateSemanticOutput({ ...output, action: "EXPLAIN", changes }, applicationContext), /job_edit_action_mismatch/);
assert.throws(() => Conversation.validateSemanticOutput({ ...output, action: "PROPOSE_JOB_EDIT", changes: [{ ...changes[0], target: "candidate.summary" }] }, applicationContext), /JOB_CHANGE_SET_INVALID/);
const analysis = Persistence.createAnalysis({ session, execution, job_revision: modelAccepted.revision, candidate_snapshot: candidateA, candidate_delta: candidateDelta, source_excerpt_manifest: fromArtifact, runtime_snapshot: runtimeSnapshot, output });
assert.deepEqual(analysis.candidate_observation.provider_view, candidateA.provider_view);
const assistant = Conversation.createMessage(session, "ASSISTANT", output.message, "2026-09-04T02:00:03Z");
await Persistence.persistSuccessfulTurn(database, { execution, analysis, assistant_message: assistant });
const persistedHistorical = structuredClone(database.records.get("job_analyses").get(analysis.analysis_id));
await CandidateContext.buildSnapshot(candidateAdded);
assert.deepEqual(database.records.get("job_analyses").get(analysis.analysis_id), persistedHistorical);
assert.equal(database.records.get("job_analyses").size, 1);

assert.throws(() => Conversation.validateSemanticOutput({ ...output, gap_findings: [{ ...output.gap_findings[0], gap_type: "NO_EVIDENCE_MEANS_NO_CAPABILITY" }] }, compiled), /job_gap_finding_invalid/);
assert(!JSON.stringify(output).match(/\b\d{1,3}%/u));

console.log(JSON.stringify({
  job_local_real_source_and_revision: "pass",
  local_provider_calls: 0,
  candidate_context_and_delta: "pass",
  source_retrieval_read_only: "pass",
  provider_safe_context: "pass",
  append_only_job_analysis: "pass",
  model_job_edit_human_save: "pass",
}));
