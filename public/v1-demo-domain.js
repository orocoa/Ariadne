(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JobRadarV1Demo = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DB_NAME = "job-radar-local-first-v1";
  const DB_VERSION = 20;
  const DATA_CLASS = "DEMO_FIXTURE";
  const STORES = [
    ["applications", "job_context_id"],
    ["job_journal_entries", "entry_id"],
    ["job_journal_images", "image_id"],
    ["job_followup_migrations", "migration_id"],

    ["jobs", "job_id"], ["candidates", "candidate_id"], ["source_documents", "source_document_id"],
    ["runtime_snapshots", "snapshot_id"], ["extraction_artifacts", "artifact_id"],
    ["extraction_runs", "extraction_run_id"], ["career_entities", "entity_id"], ["entity_review_decisions", "decision_id"],
    ["career_evidence", "evidence_id"], ["review_decisions", "decision_id"], ["career_profiles", "profile_id"],
    ["correction_memory", "correction_id"], ["ai_career_contexts", "artifact_id"], ["ai_career_profiles", "profile_id"],
    ["career_intelligence", "record_id"], ["candidate_contexts", "context_id"], ["candidate_proposals", "candidate_proposal_id"],
    ["candidate_context_patches", "patch_id"], ["processing_runs", "run_id"], ["processing_batches", "batch_id"], ["processing_consents", "consent_id"],
    ["context_proposals", "proposal_id"], ["context_review_decisions", "review_id"],
    ["candidate_working_models", "working_model_id"], ["candidate_workspace_acceptances", "acceptance_id"],
    ["candidate_context_revisions", "revision_id"], ["candidate_context_lifecycle", "lifecycle_id"], ["job_context_revisions", "revision_id"], ["job_context_lifecycle", "lifecycle_id"],
    ["conversation_sessions", "conversation_id"], ["conversation_messages", "message_id"],
    ["conversation_turn_executions", "execution_id"], ["candidate_actions", "action_id"],
    ["job_analyses", "analysis_id"], ["job_conversation_sessions", "conversation_id"],
    ["job_conversation_messages", "message_id"], ["job_turn_executions", "execution_id"],
    ["job_change_proposals", "job_change_proposal_id"],
    ["job_change_decisions", "job_change_decision_id"],
    ["resume_tasks", "task_id"], ["resume_document_versions", "version_id"],
    ["personal_memory_revisions", "revision_id"],
    ["personal_memory_proposals", "proposal_id"],
    ["personal_memory_decisions", "decision_id"],
    ["personal_understanding_fragments", "fragment_id"],
    ["personal_understanding_snapshots", "understanding_id"],
    ["personal_conversation_turns", "turn_id"], ["job_overview_fragments", "fragment_id"], ["job_overview_snapshots", "overview_id"], ["job_overview_turns", "turn_id"],

    ["demo_candidate_items", "item_id"], ["demo_job_contexts", "job_context_id"],
    ["demo_conversations", "conversation_id"], ["demo_ui_state", "state_id"],
  ];
  const DEMO_STORES = {
    candidates: "demo_candidate_items",
    jobs: "demo_job_contexts",
    conversations: "demo_conversations",
    ui: "demo_ui_state",
  };
  const CANDIDATE_PROCESSING_STATES = [
    ["PREPARING", "正在准备本地材料"],
    ["WAITING", "等待本地解析任务"],
    ["UNDERSTANDING", "正在按确定规则整理材料"],
    ["BUILDING_CARDS", "正在生成本地演示卡片"],
    ["READY_FOR_REVIEW", "已生成 3 张本地演示卡片"],
  ];
  const JOB_PROCESSING_STATES = [
    ["PREPARING", "正在准备职位材料"],
    ["WAITING", "等待本地解析任务"],
    ["UNDERSTANDING", "正在按确定规则整理职位材料"],
    ["BUILDING_CARDS", "正在生成本地演示卡片"],
    ["READY_FOR_REVIEW", "已生成 1 张本地演示卡片"],
  ];
  const CANDIDATE_PROMPT_PROFILES = {
    Resume: "candidate-resume-grounded-v2",
    Portfolio: "candidate-portfolio-grounded-v2",
    Project: "candidate-project-grounded-v2",
    Other: "candidate-other-grounded-v2",
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function nowIso() { return new Date().toISOString(); }
  function safeId(value) { return String(value || "object").trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(); }
  function candidatePromptProfile(materialType) {
    const promptProfile = CANDIDATE_PROMPT_PROFILES[materialType];
    if (!promptProfile) throw new Error("unsupported_candidate_material_type");
    return promptProfile;
  }

  const sourceRef = (suffix, excerpt) => ({
    source_ref_id: `demo-source-ref-${suffix}`,
    source_document_id: "demo-source-resume-01",
    location: `示例材料 · ${suffix}`,
    excerpt_or_reference: excerpt,
    support_relation: "EXPLICIT_SOURCE",
  });

  const CANDIDATE_FIXTURES = [
    {
      contract_id: "job-radar-candidate-context-v2-step1", data_class: DATA_CLASS, copy_locale: "zh-CN",
      item_id: "demo-work-experience", item_type: "WORK_EXPERIENCE", title: "产品设计师",
      subtitle: "北极星工作室", time: "2023 — 2025",
      summary: "负责一款职业探索产品的研究、信息架构与核心交互设计。",
      facts: [
        { fact_id: "work-fact-1", label: "职责", value: "主持 12 次用户访谈并整理机会地图" },
        { fact_id: "work-fact-2", label: "范围", value: "负责从问题定义到高保真原型" },
        { fact_id: "work-fact-3", label: "协作", value: "与产品、工程和内容团队共同交付" },
      ],
      ownership: "示例人物负责研究与交互设计；业务结果归因未确认。",
      source_refs: [sourceRef("工作经历", "产品设计师 · 北极星工作室")],
      uncertainties: [{ uncertainty_id: "work-uncertain-1", question: "材料未提供可核验的业务结果。", affects: "outcome", status: "OPEN" }],
      review_status: "NEEDS_REVIEW", item_version: 1, updated_at: "2026-08-27T00:00:00.000Z",
    },
    {
      contract_id: "job-radar-candidate-context-v2-step1", data_class: DATA_CLASS, copy_locale: "zh-CN",
      item_id: "demo-project-job-radar", item_type: "PROJECT", title: "Ariadne",
      subtitle: "个人职业智能原型", time: "2025 — 2026",
      summary: "定义并验证一个本地优先、有证据依据的职业信息产品原型。",
      facts: [
        { fact_id: "project-fact-1", label: "问题", value: "把零散职业证据转化为可审核对象" },
        { fact_id: "project-fact-2", label: "系统", value: "设计个人上下文与修改审核边界" },
        { fact_id: "project-fact-3", label: "验证", value: "使用测试样例与回归测试校验核心状态流" },
        { fact_id: "project-fact-4", label: "边界", value: "AI 提案不会静默写入正式事实" },
      ],
      ownership: "示例人物定义产品与系统边界；实现过程包含 AI 工具协作。",
      source_refs: [sourceRef("项目经历", "Ariadne · 个人职业智能原型")],
      uncertainties: [{ uncertainty_id: "project-uncertain-1", question: "独立工程能力范围仍需单独证据。", affects: "ownership", status: "OPEN" }],
      review_status: "NEEDS_REVIEW", item_version: 1, updated_at: "2026-08-27T00:00:00.000Z",
    },
    {
      contract_id: "job-radar-candidate-context-v2-step1", data_class: DATA_CLASS, copy_locale: "zh-CN",
      item_id: "demo-education", item_type: "EDUCATION", title: "人机交互理学硕士",
      subtitle: "示例大学", time: "2021 — 2023",
      summary: "学习用户研究、交互设计与人机协作系统。",
      facts: [
        { fact_id: "education-fact-1", label: "方向", value: "人机交互" },
        { fact_id: "education-fact-2", label: "课程", value: "用户研究方法" },
        { fact_id: "education-fact-3", label: "课程", value: "交互系统设计" },
      ],
      ownership: "示例教育经历，仅用于 UI 验收。",
      source_refs: [sourceRef("教育经历", "人机交互理学硕士 · 示例大学")],
      uncertainties: [], review_status: "NEEDS_REVIEW", item_version: 1, updated_at: "2026-08-27T00:00:00.000Z",
    },
  ];

  const JOB_FIXTURE = {
    contract_id: "job-radar-job-context-v1", data_class: DATA_CLASS, copy_locale: "zh-CN",
    job_context_id: "demo-job-ai-product-manager", title: "AI 产品经理",
    company: "示例实验室", location: "上海 · 混合办公",
    summary: "负责把用户问题转化为可验证的 AI 产品工作流，并建立数据、模型与人工审核之间的边界。",
    requirements: [
      { requirement_id: "req-1", label: "产品判断", detail: "能够定义 AI 产品问题、成功标准与阶段性验证。" },
      { requirement_id: "req-2", label: "系统理解", detail: "理解数据流、状态、接口与模型能力边界。" },
      { requirement_id: "req-3", label: "人工参与", detail: "能设计清晰的审核、修正与确认机制。" },
      { requirement_id: "req-4", label: "跨职能协作", detail: "能与设计、工程和业务团队共同推进交付。" },
      { requirement_id: "req-5", label: "评估与诊断", detail: "能定义评估方法并定位模型或产品失败层。" },
    ],
    source: { source_type: "SANITIZED_FIXTURE", display_name: "AI 产品经理 — 示例实验室.txt" },
    review_status: "NEEDS_REVIEW", updated_at: "2026-08-27T00:00:00.000Z",
  };

  function openDatabase() {
    if (globalThis.AriadneContentDatabase) return globalThis.AriadneContentDatabase.open(DB_NAME);
    return openNativeDatabase();
  }

  function openNativeDatabase() {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("indexeddb_unavailable"));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => STORES.forEach(([name, keyPath]) => {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath });
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("indexeddb_upgrade_blocked"));
    });
  }

  function operation(storeName, mode, callback) {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = callback(transaction.objectStore(storeName));
      transaction.oncomplete = () => { const result = request?.result; db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error("indexeddb_transaction_aborted")); };
    }));
  }

  const getAll = (storeName) => operation(storeName, "readonly", (store) => store.getAll());
  const get = (storeName, key) => operation(storeName, "readonly", (store) => store.get(key));
  const put = (storeName, value) => operation(storeName, "readwrite", (store) => store.put(clone(value)));
  const remove = (storeName, key) => operation(storeName, "readwrite", (store) => store.delete(key));
  const putMany = (storeName, values) => openDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    values.forEach((value) => transaction.objectStore(storeName).put(clone(value)));
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  }));

  async function seedCandidateFixtures(source = {}) {
    const now = nowIso();
    const items = CANDIDATE_FIXTURES.map((item) => ({ ...clone(item), imported_from: clone(source), updated_at: now }));
    await putMany(DEMO_STORES.candidates, items);
    await put(DEMO_STORES.ui, { state_id: "personal-library", data_class: DATA_CLASS, has_demo_data: true, source: clone(source), updated_at: now });
    return items;
  }

  function normalizedText(value) {
    return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
  }

  function uniqueBy(values, keyFor) {
    const seen = new Set();
    return values.filter((value) => {
      const key = keyFor(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function overlapScore(left = [], right = [], keyFor = normalizedText) {
    const a = new Set(left.map(keyFor).filter(Boolean));
    const b = new Set(right.map(keyFor).filter(Boolean));
    if (!a.size || !b.size) return 0;
    let shared = 0;
    a.forEach((key) => { if (b.has(key)) shared += 1; });
    return shared / Math.max(a.size, b.size);
  }

  function candidateDuplicateScore(left, right) {
    if (!left || !right || normalizedText(left.item_type) !== normalizedText(right.item_type)) return 0;
    if (normalizedText(left.title) !== normalizedText(right.title)) return 0;
    let score = 0.42;
    if (normalizedText(left.subtitle) && normalizedText(left.subtitle) === normalizedText(right.subtitle)) score += 0.16;
    if (normalizedText(left.time) && normalizedText(left.time) === normalizedText(right.time)) score += 0.12;
    if (normalizedText(left.summary) && normalizedText(left.summary) === normalizedText(right.summary)) score += 0.16;
    score += overlapScore(left.facts, right.facts, (fact) => normalizedText(`${fact?.label || ""}:${fact?.value || ""}`)) * 0.14;
    return Math.min(1, score);
  }

  function jobDuplicateScore(left, right) {
    if (!left || !right || normalizedText(left.title) !== normalizedText(right.title)) return 0;
    if (normalizedText(left.company) !== normalizedText(right.company)) return 0;
    let score = 0.56;
    if (normalizedText(left.location) && normalizedText(left.location) === normalizedText(right.location)) score += 0.12;
    if (normalizedText(left.summary) && normalizedText(left.summary) === normalizedText(right.summary)) score += 0.16;
    score += overlapScore(left.requirements, right.requirements, (item) => normalizedText(`${item?.label || ""}:${item?.detail || ""}`)) * 0.16;
    return Math.min(1, score);
  }

  function findDuplicates(incoming, existing, scoreFor) {
    return incoming.map((candidate) => {
      let best = null;
      existing.forEach((stored) => {
        const score = scoreFor(candidate, stored);
        if (score >= 0.72 && (!best || score > best.score)) best = { incoming: candidate, existing: stored, score };
      });
      return best;
    }).filter(Boolean);
  }

  const findCandidateDuplicates = (incoming, existing) => findDuplicates(incoming, existing, candidateDuplicateScore);
  const findJobDuplicates = (incoming, existing) => findDuplicates(incoming, existing, jobDuplicateScore);

  function mergedSources(left, right) {
    const values = [left?.imported_from, ...(left?.imported_sources || []), right?.imported_from, ...(right?.imported_sources || [])].filter(Boolean).map(clone);
    return uniqueBy(values, (value) => normalizedText(JSON.stringify(value)));
  }

  function mergeCandidateRecords(existing, incoming, method = "LOCAL_DETERMINISTIC") {
    const now = nowIso();
    return {
      ...clone(existing),
      summary: normalizedText(incoming.summary).length > normalizedText(existing.summary).length ? incoming.summary : existing.summary,
      facts: uniqueBy([...(existing.facts || []), ...(incoming.facts || [])].map(clone), (fact) => normalizedText(`${fact.label}:${fact.value}`)),
      source_refs: uniqueBy([...(existing.source_refs || []), ...(incoming.source_refs || [])].map(clone), (ref) => normalizedText(`${ref.source_document_id}:${ref.location}:${ref.excerpt_or_reference}`)),
      uncertainties: uniqueBy([...(existing.uncertainties || []), ...(incoming.uncertainties || [])].map(clone), (item) => normalizedText(item.question || item.uncertainty_id)),
      imported_sources: mergedSources(existing, incoming),
      ai_recognized: existing.ai_recognized === true || incoming.ai_recognized === true,
      review_status: "NEEDS_REVIEW",
      item_version: Math.max(Number(existing.item_version) || 1, Number(incoming.item_version) || 1) + 1,
      merge_metadata: { method, duplicate_score: candidateDuplicateScore(existing, incoming), merged_at: now, merged_item_id: incoming.item_id },
      updated_at: now,
    };
  }

  function mergeJobRecords(existing, incoming, method = "LOCAL_DETERMINISTIC") {
    const now = nowIso();
    return {
      ...clone(existing),
      summary: normalizedText(incoming.summary).length > normalizedText(existing.summary).length ? incoming.summary : existing.summary,
      requirements: uniqueBy([...(existing.requirements || []), ...(incoming.requirements || [])].map(clone), (item) => normalizedText(`${item.label}:${item.detail}`)),
      imported_sources: mergedSources(existing, incoming),
      ai_recognized: existing.ai_recognized === true || incoming.ai_recognized === true,
      review_status: "NEEDS_REVIEW",
      item_version: Math.max(Number(existing.item_version) || 1, Number(incoming.item_version) || 1) + 1,
      merge_metadata: { method, duplicate_score: jobDuplicateScore(existing, incoming), merged_at: now, merged_job_id: incoming.job_context_id },
      updated_at: now,
    };
  }

  function consolidateRecords(records, scoreFor, mergeFor, keyFor) {
    const sorted = [...records].map(clone).sort((left, right) => {
      const timeOrder = String(left.updated_at || "").localeCompare(String(right.updated_at || ""));
      return timeOrder || String(keyFor(left)).localeCompare(String(keyFor(right)));
    });
    const kept = [];
    const removedIds = [];
    const mergedGroups = [];
    sorted.forEach((record) => {
      let bestIndex = -1;
      let bestScore = 0;
      kept.forEach((candidate, index) => {
        const score = scoreFor(record, candidate);
        if (score >= 0.72 && score > bestScore) { bestIndex = index; bestScore = score; }
      });
      if (bestIndex < 0) {
        kept.push(record);
        return;
      }
      const retainedId = keyFor(kept[bestIndex]);
      const removedId = keyFor(record);
      kept[bestIndex] = mergeFor(kept[bestIndex], record, "LOCAL_DETERMINISTIC_CONSOLIDATION");
      removedIds.push(removedId);
      mergedGroups.push({ retained_id: retainedId, removed_id: removedId, duplicate_score: bestScore });
    });
    return { records: kept, removed_ids: removedIds, merged_groups: mergedGroups };
  }

  const consolidateCandidateRecords = (records) => consolidateRecords(records, candidateDuplicateScore, mergeCandidateRecords, (record) => record.item_id);
  const consolidateJobRecords = (records) => consolidateRecords(records, jobDuplicateScore, mergeJobRecords, (record) => record.job_context_id);

  async function consolidateExistingDuplicatesOnce() {
    const stateId = "duplicate-consolidation-2026-08-31-v1";
    const completed = await get(DEMO_STORES.ui, stateId);
    if (completed?.completed) return completed;
    const [candidateRecords, jobRecords] = await Promise.all([getAll(DEMO_STORES.candidates), getAll(DEMO_STORES.jobs)]);
    const candidates = consolidateCandidateRecords(candidateRecords);
    const jobs = consolidateJobRecords(jobRecords);
    await putMany(DEMO_STORES.candidates, candidates.records);
    await putMany(DEMO_STORES.jobs, jobs.records);
    await Promise.all([
      ...candidates.removed_ids.map((id) => remove(DEMO_STORES.candidates, id)),
      ...jobs.removed_ids.map((id) => remove(DEMO_STORES.jobs, id)),
    ]);
    const result = {
      state_id: stateId,
      data_class: DATA_CLASS,
      completed: true,
      candidates_removed: candidates.removed_ids.length,
      jobs_removed: jobs.removed_ids.length,
      candidate_groups: candidates.merged_groups,
      job_groups: jobs.merged_groups,
      updated_at: nowIso(),
    };
    await put(DEMO_STORES.ui, result);
    return result;
  }

  function createLocalCandidateFixtures(source = {}) {
    const now = nowIso();
    const batchId = safeId(`${Date.now()}-${source.name || source.import_type || "local"}`);
    const importedFrom = { ...clone(source), recognition_mode: "LOCAL", content_read: false, network_sent: false };
    return CANDIDATE_FIXTURES.map((item) => ({
      ...clone(item), item_id: `${item.item_id}-${batchId}`, imported_from: importedFrom, ai_recognized: false, updated_at: now,
    }));
  }

  async function persistCandidateImport(items, source = {}) {
    const now = nowIso();
    await putMany(DEMO_STORES.candidates, items);
    await put(DEMO_STORES.ui, { state_id: "personal-library", data_class: DATA_CLASS, has_demo_data: true, source: clone(source), updated_at: now });
    return items;
  }

  async function importLocalCandidateFixtures(source = {}) {
    const items = createLocalCandidateFixtures(source);
    return persistCandidateImport(items, items[0]?.imported_from || source);
  }

  function createLocalJobFixture(source = {}) {
    const now = nowIso();
    const batchId = safeId(`${Date.now()}-${source.name || source.import_type || "local-job"}`);
    const importedFrom = { ...clone(source), recognition_mode: "LOCAL", content_read: false, network_sent: false };
    return { ...clone(JOB_FIXTURE), job_context_id: `${JOB_FIXTURE.job_context_id}-${batchId}`, imported_from: importedFrom, ai_recognized: false, item_version: 1, updated_at: now };
  }

  async function persistJobImport(job, source = {}) {
    await put(DEMO_STORES.jobs, job);
    await put(DEMO_STORES.ui, { state_id: "jd-library", data_class: DATA_CLASS, has_demo_data: true, source: clone(source), updated_at: job.updated_at || nowIso() });
    return job;
  }

  async function seedJobFixture(source = {}) {
    const job = { ...clone(JOB_FIXTURE), imported_from: clone(source), updated_at: nowIso() };
    return persistJobImport(job, source);
  }

  function createConversation(scopeType, scopeId) {
    if (!['CANDIDATE_ITEM', 'JOB'].includes(scopeType)) throw new Error("unsupported_demo_conversation_scope");
    const timestamp = nowIso();
    return { contract_id: "job-radar-scoped-conversation-v1", data_class: DATA_CLASS, conversation_id: `demo-conv-${scopeType.toLowerCase()}-${safeId(scopeId)}`, scope_type: scopeType, scope_id: scopeId, messages: [], created_at: timestamp, updated_at: timestamp };
  }

  function isAIRecognizedRecord(record) {
    if (!record || typeof record !== "object") return false;
    const imported = record.imported_from && typeof record.imported_from === "object" ? record.imported_from : {};
    const source = record.source && typeof record.source === "object" ? record.source : {};
    const extraction = record.extraction && typeof record.extraction === "object" ? record.extraction : {};
    if (imported.network_sent === false || imported.recognition_mode === "LOCAL") return false;
    return record.ai_recognized === true
      || imported.network_sent === true
      || Boolean(record.model_metadata?.provider || record.model_metadata?.model)
      || Boolean(imported.provider || imported.provider_id || imported.model || imported.model_id)
      || Boolean(source.provider || source.model)
      || Boolean(extraction.provider || extraction.model || extraction.model_metadata?.provider);
  }

  async function appendDemoMessage(scopeType, scopeId, role, content) {
    const conversationId = `demo-conv-${scopeType.toLowerCase()}-${safeId(scopeId)}`;
    const conversation = await get(DEMO_STORES.conversations, conversationId) || createConversation(scopeType, scopeId);
    conversation.messages.push({ message_id: `${conversationId}-${Date.now()}-${role.toLowerCase()}`, role, content: String(content).trim(), created_at: nowIso() });
    conversation.updated_at = nowIso();
    await put(DEMO_STORES.conversations, conversation);
    return conversation;
  }

  function candidatePatchFor(item) {
    const before = item.summary;
    const after = item.item_type === "PROJECT"
      ? "定义并验证本地优先的职业信息产品原型，重点建立证据、AI 提案与人工确认之间的清晰边界。"
      : `${before}（表述已收紧，仅保留示例材料明确支持的范围。）`;
    return {
      patch_id: `demo-patch-${safeId(item.item_id)}`, data_class: DATA_CLASS,
      target_item_id: item.item_id, base_item_version: item.item_version,
      change_source: "AI_ASSISTED_CORRECTION", before_snapshot: { summary: before }, after_preview: { summary: after },
      operations: [{ op: "replace", path: "/summary", value: after }],
      reason: "将宽泛表述收紧为示例来源明确支持的职责和产品边界。", status: "PROPOSED",
    };
  }

  function applyDemoPatch(item, patch) {
    if (patch.target_item_id !== item.item_id || patch.base_item_version !== item.item_version || patch.status !== "PROPOSED") throw new Error("stale_or_invalid_demo_patch");
    return { ...clone(item), summary: patch.after_preview.summary, item_version: item.item_version + 1, updated_at: nowIso() };
  }

  function jobPatchFor(job) {
    const before = job.summary;
    const after = `${before.replace(/[。；;]+$/, "")}；修改仅限职位原文明确支持的职责和要求。`;
    return {
      patch_id: `demo-job-patch-${safeId(job.job_context_id)}`, data_class: DATA_CLASS,
      target_job_context_id: job.job_context_id, base_item_version: Number(job.item_version) || 1,
      change_source: "AI_ASSISTED_CORRECTION", before_snapshot: { summary: before }, after_preview: { summary: after },
      operations: [{ op: "replace", path: "/summary", value: after }],
      reason: "将职位摘要收紧到当前职位文本能够支持的范围。", status: "PROPOSED",
    };
  }

  function applyDemoJobPatch(job, patch) {
    const version = Number(job.item_version) || 1;
    if (patch.target_job_context_id !== job.job_context_id || patch.base_item_version !== version || patch.status !== "PROPOSED") throw new Error("stale_or_invalid_demo_job_patch");
    return { ...clone(job), summary: patch.after_preview.summary, item_version: version + 1, updated_at: nowIso() };
  }

  return {
    DB_NAME, DB_VERSION, DATA_CLASS, STORES, DEMO_STORES, CANDIDATE_PROCESSING_STATES, JOB_PROCESSING_STATES,
    CANDIDATE_PROMPT_PROFILES, candidatePromptProfile,
    CANDIDATE_FIXTURES, JOB_FIXTURE, clone, openDatabase, getAll, get, put, remove, seedCandidateFixtures,
    normalizedText, candidateDuplicateScore, jobDuplicateScore, findCandidateDuplicates, findJobDuplicates,
    mergeCandidateRecords, mergeJobRecords, consolidateCandidateRecords, consolidateJobRecords, consolidateExistingDuplicatesOnce,
    createLocalCandidateFixtures, persistCandidateImport, importLocalCandidateFixtures,
    createLocalJobFixture, persistJobImport, seedJobFixture,
    createConversation, appendDemoMessage, isAIRecognizedRecord, candidatePatchFor, applyDemoPatch, jobPatchFor, applyDemoJobPatch,
  };
});
