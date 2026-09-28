"use strict";

(function () {
  const Demo = window.JobRadarV1Demo;
  const RuntimeGate = window.JobRadarRuntimeGate;
  const RuntimeExecution = window.AriadneRuntimeExecution;
  const Truth = window.AriadneTruthPersistence;
  const RawSource = window.AriadneRawSourceStorage;
  const SourceInput = window.AriadneSourceInput;
  const ProcessingIndicator = window.AriadneProcessingIndicator;
  const LocalContextLifecycle = window.AriadneLocalContextLifecycle;
  const LocalCandidate = window.AriadneLocalCandidateExtraction;
  const LocalCandidateReview = window.AriadneLocalCandidateReview;
  const CandidateModel = window.AriadneCandidateModelRuntime;
  const CandidateConversation = window.AriadneCandidateConversation;
  const CandidateConversationPersistence = window.AriadneCandidateConversationPersistence;
  const CandidateWorkspaceConversationRuntime = window.AriadneCandidateWorkspaceConversationRuntime;
  const LocalJobLifecycle = window.AriadneLocalJobLifecycle;
  const LocalJob = window.AriadneLocalJobExtraction;
  const JobContext = window.AriadneJobContext;
  const JobApplications = window.AriadneJobApplications;
  const JobModel = window.AriadneJobModelRuntime;
  const JobCandidateContext = window.AriadneJobCandidateContext;
  const SourceRetrieval = window.AriadneSourceRetrieval;
  const JobConversation = window.AriadneJobConversation;
  const JobConversationPersistence = window.AriadneJobConversationPersistence;
  const ConversationUI = window.AriadneConversationUI;
  const ProductShell = window.AriadneProductShell;
  const ModelImportLifecycle = window.AriadneModelImportLifecycle;
  const ModelWorkspaceUI = window.AriadneModelWorkspaceUI;
  const page = document.body.dataset.v1Page;
  const isEmbeddedDetail = new URLSearchParams(window.location.search).get("embed") === "1";
  if (isEmbeddedDetail) document.body.classList.add("v1-embedded-detail");
  const delay = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const typeLabels = { WORK_EXPERIENCE: "工作经历", PROJECT: "项目", EDUCATION: "教育经历", OTHER: "其他" };
  const subtypeLabels = { work_experience: "工作经历", project: "项目经历", education: "教育经历", custom_section: "其他经历", skill_group: "核心能力", award: "获奖经历", language: "语言能力" };
  const materialTypeLabels = { resume: "简历", portfolio: "作品集", project: "项目材料", project_description: "项目说明", other: "其他材料" };
  const factLabels = { rawDate: "日期", date: "时间", time: "时间", achievements: "成果", responsibilities: "职责", summary: "摘要", location: "地点", area: "专业", major: "专业", degree: "专业", score: "成绩", result: "结果", awarder: "颁发方", issuer: "颁发方", keywords: "核心能力", skills: "核心能力", section: "分类", category: "分类", organization: "公司 / 机构", institution: "学校", school: "学校", company: "公司 / 机构", role: "角色", title: "角色", project: "项目", context: "背景", outputs: "产出", outcomes: "结果" };
  const sourceTypeLabels = { SANITIZED_FIXTURE: "本地测试资料", BROWSER_FILE_METADATA: "浏览器本地文件", PASTED_TEXT_METADATA: "本地粘贴文本", PDF: "PDF", DOCX: "DOCX", IMAGE: "图片", PASTED_TEXT: "本地粘贴文本", TXT: "文本" };
  let selectedCandidateSources = [];
  let selectedCandidateType = "Resume";
  let selectedJobSource = null;
  let selectedJobSources = [];
  let selectedJobImportType = "Document";
  let activeCandidate = null;
  let activeJob = null;
  let pendingDirectEdit = null;
  let candidateProcessingInProgress = false;
  let candidateBatchAbortController = null;
  let candidateExecutionState = "READY";
  let candidateSelectionVersion = 0;
  let candidateModelAttemptGeneration = 0;
  let candidateConsentSelectionVersion = null;
  let candidateConsentRuntimeIdentity = null;
  let candidateConsentId = null;
  let activeCandidateModelOperation = null;
  let activeCandidateWorkingModel = null;
  let candidateClarifications = null;
  let candidateClarificationSources = [];
  let activeCandidateWorkspaceItemId = null;
  let candidateWorkspaceEditDirty = false;
  let candidateWorkspaceExitIntent = null;
  let candidateWorkspacePreviousFocus = null;
  let candidateWorkspaceViewGeneration = 0;
  let candidateWorkspaceViewIntent = "import";
  let candidateWorkspaceConversation = [];
  let activeCandidateConversationSession = null;
  let candidateConversationTurnActive = false;
  let candidateDetailConversationTurnActive = false;
  let candidateReviewSessionTotal = 0;
  let candidateReviewSessionResolved = 0;
  let candidateReviewSourceIds = [];
  let jobProcessingInProgress = false;
  let jobBatchAbortController = null;
  let jobExecutionState = "IDLE";
  let jobImportLifecycle = null;
  let jobSelectionVersion = 0;
  let jobModelAttemptGeneration = 0;
  let jobModelConsentSelectionVersion = null;
  let jobModelConsentRuntimeIdentity = null;
  let jobModelConsentId = null;
  let jobModelConsentBundle = null;
  let activeJobModelOperation = null;
  let jobModelWaitTimer = null;
  let jobReviewSessionTotal = 0;
  let jobReviewSessionResolved = 0;
  let activeJobRevision = null;
  let activeJobWorkingProposal = null;
  let activeJobSourceDocument = null;
  let activeJobSourceDocuments = [];
  let activeJobChangeProposal = null;
  let activeJobConversationSession = null;
  let jobConversationTurnActive = false;
  let candidateWorkspaceShell = null;
  let jobWorkspaceShell = null;
  let candidateSourceInputBinding = null;
  let jobSourceInputBinding = null;

  function currentOperationGate(operation) {
    try { return RuntimeGate.operationGate(operation); }
    catch (_error) {
      return Object.freeze({
        allowed: false,
        operation,
        capability: "invalid_current_runtime",
        state: "unsupported",
        authority: Object.freeze({ runtime: Object.freeze({ mode: "invalid", provider: null, model: null }), capabilities: Object.freeze({}) }),
      });
    }
  }

  function currentAriadneMode() {
    try { return RuntimeExecution.normalizeCurrentRuntime(RuntimeGate.readStoredRuntime()).mode; }
    catch (_error) { return "invalid"; }
  }

  function candidateImportOperation() {
    const source = selectedCandidateSources[0];
    // The candidate picker currently accepts files only. Before a file exists,
    // gate the picker with the same multimodal operation it can actually start.
    if (!source || ["PDF", "IMAGE", "DOCX"].includes(source.source_type)) return "candidate_image_import";
    return "candidate_text_import";
  }

  function candidateSourceReadLabel(source, phase = "complete") {
    const kind = source?.source_type === "IMAGE" ? "图片" : source?.source_type === "PDF" ? "PDF" : "材料";
    return phase === "reading" ? `正在读取${kind}` : `${kind}已读取`;
  }

  function jobImportOperation() {
    if (!selectedJobSources.length) return selectedJobImportType === "Paste" ? "job_text_import" : "job_image_import";
    return selectedJobSources.some((source) => source?.source_type === "IMAGE") ? "job_image_import" : "job_text_import";
  }

  function candidateSharedWorkspace() {
    if (!candidateWorkspaceShell) {
      candidateWorkspaceShell = ProductShell.bindWorkspaceShell(document, {
        layer: "candidate-ai-workspace",
        source: "candidate-working-source",
        processing: "candidate-workspace-processing",
        content: "candidate-card-list",
        save: "candidate-workspace-save",
        save_status: "candidate-workspace-save-status",
        progress: "candidate-understanding-events",
        messages: "candidate-workspace-conversation",
        form: "candidate-workspace-composer",
        conversation_status: "candidate-workspace-conversation-status",
      });
    }
    return candidateWorkspaceShell;
  }

  function jobSharedWorkspace() {
    if (!jobWorkspaceShell) {
      jobWorkspaceShell = ProductShell.bindWorkspaceShell(document, {
        layer: "job-ai-workspace",
        source: "job-working-source",
        processing: "job-workspace-processing",
        content: "job-working-form",
        save: "job-workspace-save",
        save_status: "job-workspace-save-status",
        progress: "job-understanding-events",
        messages: "job-workspace-conversation",
        form: "job-workspace-composer",
        conversation_status: "job-workspace-conversation-status",
      });
    }
    return jobWorkspaceShell;
  }

  function runtimeLabel(runtime) {
    if (runtime.mode !== "model") return "本地运行";
    const provider = ({ codex: "Codex / OpenAI", deepseek: "DeepSeek", gemini: "Gemini", qwen: "Qwen" }[runtime.provider] || runtime.provider || "模型");
    return runtime.model ? `${provider} · ${runtime.model}` : provider;
  }

  function candidateTypeLabel(item) { return item?.category || subtypeLabels[item?.item_subtype] || typeLabels[item?.item_type] || "其他经历"; }
  function candidateFactLabel(value) {
    if (CandidateConversation) {
      const semanticKey = CandidateConversation.semanticKeyForFactLabel(value);
      return CandidateConversation.canonicalDisplayLabel(semanticKey, value);
    }
    return factLabels[value] || factLabels[String(value || "").trim().toLowerCase()] || (/[\u3400-\u9fff]/.test(String(value || "")) ? value : "未分类信息");
  }
  function candidateWorkspaceFactLabel(value) {
    return candidateFactLabel(value);
  }
  function personalErrorCopy(error) {
    const webCopy = window.AriadneTransport?.errorCopy?.(error);
    if (webCopy) return webCopy;
    const storageCopy = window.AriadneContentDatabase?.errorCopy(error);
    if (storageCopy) return storageCopy;
    const code = String(error?.code || error?.message || error || "");
    const messages = {
      candidate_source_identity_required: "无法确认这张卡片对应的原始文件。",
      candidate_source_not_found: "原始文件已不存在，无需再次删除。",
      candidate_item_not_found: "这张卡片已不存在。",
      candidate_item_already_removed: "这张卡片已被移除。",
      context_version_conflict: "卡片已在其他操作中更新，请重新打开后再试。",
      unsupported_document_type: "暂不支持这种文件格式。",
      invalid_document_size: "文件大小不符合本地导入要求。",
      document_read_failed: "无法读取这个本地文件。",
      document_size_limit_exceeded: "每个文件最大支持 30 MB；请压缩后重试。",
      image_size_limit_exceeded: "每个文件最大支持 30 MB；请压缩后重试。",
      source_archive_invalid: "保存的来源组无效；操作已停止。",
      raw_source_reference_missing: "原始文件的本地引用不存在；操作已停止。",
      raw_source_reference_invalid: "原始文件的本地引用无效；操作已停止。",
      raw_source_reference_unsupported: "原始文件的本地引用无法由当前版本解析；操作已停止。",
      raw_source_reference_mismatch: "原始文件的本地引用与来源身份不一致；操作已停止。",
      raw_source_document_missing: "原始来源记录不存在；操作已停止。",
      raw_source_document_not_canonical: "原始来源记录不是正式 SourceDocument；操作已停止。",
      raw_source_payload_missing: "本地保存的原始文件不存在；操作已停止。",
      raw_source_payload_invalid: "本地保存的原始文件无法读取；操作已停止。",
      raw_source_payload_envelope_invalid: "本地保存的原始文件记录无效；操作已停止。",
      raw_source_integrity_mismatch: "原始文件完整性校验失败；操作已停止。",
      raw_source_resolver_unavailable: "原始文件解析能力不可用；操作已停止。",
      raw_source_storage_unavailable: "浏览器本地来源存储不可用；操作已停止。",
      raw_source_read_failed: "浏览器未能读取原始文件；操作已停止。",
      raw_source_persistence_failed: "原始文件未能完整保存；没有记录为可持久恢复的来源。",
      source_document_legacy_collision: "来源身份与旧版记录冲突；未覆盖任何已有资料。",
      source_document_canonical_collision: "来源身份与已有正式记录冲突；未覆盖任何已有资料。",
      candidate_model_runtime_not_eligible: "当前运行方式不支持这次模型整理；没有发送材料。",
      candidate_model_multimodal_source_required: "当前模型导入支持图片、PDF 和 DOCX。",
      docx_complex_content_export_pdf: "Word 文件含暂不能完整读取的图表或嵌入对象，请导出为 PDF 后重试。",
      docx_archive_invalid: "Word 文件无法读取，请确认是未加密且可以正常打开的 DOCX。",
      docx_archive_limit: "Word 文件解压后内容过大，请拆分文件后重试。",
      attachment_content_limit: "文件内容超过完整处理预算，请拆分后重试；未截断发送。",
      candidate_model_pdf_required: "当前模型导入只支持 PDF 文件。",
      candidate_model_source_not_resolved: "无法从本机恢复当前材料；没有发送材料。",
      candidate_model_consent_required: "发送前需要你的明确确认。",
      candidate_model_consent_mismatch: "当前文件或运行方式已变化；请重新确认。",
      candidate_model_credential_reference_invalid: "模型凭据引用无效；没有发送材料。",
      CONNECTOR_UNREACHABLE: "无法连接本机连接器，请检查它是否运行及浏览器本地网络权限。没有改用其他模型。",
      CONNECTOR_PAIRING_REQUIRED: "本机连接已过期或撤销，请重新配对。",
      deepseek_key_not_configured: "尚未配置当前模型服务的 API 凭据；没有发送材料。",
      candidate_model_pdf_render_failed: "PDF 页面无法完整渲染；没有发送不完整内容。",
      candidate_model_request_size_invalid: "模型请求超过本地服务允许的大小；没有发送材料。",
      candidate_model_pdf_payload_invalid: "PDF 内容校验失败；没有发送材料。",
      candidate_model_source_payload_invalid: "图片或 PDF 内容校验失败；没有发送材料。",
      candidate_model_source_delivery_failed: "图片或 PDF 无法发送给图文模型；没有发送材料。",
      candidate_model_source_identity_mismatch: "PDF 来源身份校验失败；没有发送材料。",
      deepseek_network_error: "连接模型失败；未保存任何模型提案。",
      codex_timeout: "模型分析超过等待时限；原件已保留，未保存任何模型提案。可以重试，无需重新上传。",
      deepseek_provider_http_error: "模型未能完成这次请求；未保存任何模型提案。",
      deepseek_response_too_large: "模型返回内容超过安全上限；未保存任何模型提案。",
      deepseek_response_malformed: "模型返回内容无法解析；未保存任何模型提案。",
      deepseek_returned_model_mismatch: "服务商返回的模型身份与所选模型不一致；未保存任何模型提案。",
      candidate_model_response_contract_failed: "模型结果未通过运行契约校验；未保存任何模型提案。",
      candidate_model_proposal_contract_failed: "模型提案未通过结构校验；未保存任何模型提案。",
      candidate_model_grounding_validation_failed: "模型提案缺少有效来源依据；未保存任何模型提案。",
      candidate_model_processing_run_stale: "当前处理已被更新；旧模型结果没有写入。",
      candidate_model_result_persistence_failed: "模型提案未能完整保存；没有形成待审核内容。",
    };
    return messages[code] || "操作未完成，请重试。";
  }

  function jobErrorCopy(error) {
    const webCopy = window.AriadneTransport?.errorCopy?.(error);
    if (webCopy) return webCopy;
    const storageCopy = window.AriadneContentDatabase?.errorCopy(error);
    if (storageCopy) return storageCopy;
    const code = String(error?.code || error?.message || error || "");
    const messages = {
      unsupported_document_type: "暂不支持这种文件格式。",
      invalid_document_size: "文件大小不符合导入要求。",
      document_size_limit_exceeded: "每个文件最大支持 30 MB。",
      image_size_limit_exceeded: "每个文件最大支持 30 MB。",
      job_model_single_source_required: "ARIADNE AI 每次只处理一个职位来源。",
      job_model_runtime_not_eligible: "当前 ARIADNE AI 职位导入运行契约不可用。",
      job_model_source_text_required: "当前来源没有可供模型理解的文字内容。",
      job_model_source_preparation_invalid: "职位来源的只读技术解析未通过完整性校验。",
      job_model_consent_required: "发送前需要你的明确确认。",
      job_model_consent_mismatch: "当前来源或运行方式已变化；请重新确认。",
      job_model_credential_reference_invalid: "模型凭据引用无效；没有发送职位内容。",
      CONNECTOR_UNREACHABLE: "无法连接本机连接器，请检查它是否运行及浏览器本地网络权限。没有改用其他模型。",
      CONNECTOR_PAIRING_REQUIRED: "本机连接已过期或撤销，请重新配对。",
      deepseek_key_not_configured: "尚未配置当前模型服务的 API 凭据。",
      deepseek_network_error: "连接模型失败。",
      deepseek_provider_http_error: "模型未能完成这次职位理解。",
      deepseek_response_too_large: "模型返回内容超过安全上限。",
      deepseek_response_malformed: "模型返回内容无法解析。",
      deepseek_returned_model_mismatch: "服务商返回的模型与已验证运行方式不一致。",
      job_model_proposal_contract_failed: "模型职位提案未通过结构校验。",
      job_model_grounding_validation_failed: "模型职位提案缺少真实来源依据。",
      job_model_processing_run_stale: "职位来源已变化；旧模型结果没有写入。",
      job_model_result_persistence_failed: "模型职位提案未能完整保存。",
    };
    return messages[code] || "职位整理未完成，请重试。";
  }

  function unavailableCopy(gate, subject) {
    if (gate.authority.runtime.mode === "model") {
      return `当前所选模型的${subject}能力尚未真实接通；操作已停用，不会生成模型样例，也不会静默改用本地结果。`;
    }
    return "当前运行方式无效；操作已安全停用，请重新选择运行方式。";
  }

  function setRuntimeGateMessage(elementId, message) {
    const element = byId(elementId);
    if (!element) return;
    if (message) {
      element.textContent = message;
      element.classList.add("error");
      element.dataset.runtimeGateMessage = "true";
    } else if (element.dataset.runtimeGateMessage === "true") {
      element.textContent = "";
      element.classList.remove("error");
      delete element.dataset.runtimeGateMessage;
    }
  }

  function candidateAnalysisReady(gate) {
    return gate.allowed && gate.authority.runtime.mode === "model"
      && selectedCandidateSources.length === 1 && ["PDF", "IMAGE", "DOCX"].includes(selectedCandidateSources[0]?.source_type);
  }

  function refreshCandidateImportGate() {
    const mode = currentAriadneMode();
    const operation = mode === "model" ? candidateImportOperation() : "candidate_import";
    const gate = currentOperationGate(operation);
    if (byId("candidate-understanding-provider")) byId("candidate-understanding-provider").textContent = runtimeLabel(gate.authority.runtime);
    const button = byId("start-personal-processing");
    if (!button) return gate;
    const modelReady = candidateAnalysisReady(gate);
    document.body.dataset.candidateImportRuntime = mode === "local" ? "local" : modelReady ? "model-ready" : "model-unavailable";
    button.textContent = candidateProcessingInProgress ? "正在处理"
      : modelReady ? candidateExecutionState === "COMPLETE" ? "查看工作区" : "使用模型分析"
      : candidateExecutionState === "ARCHIVED" ? "原件已保存" : "保存原件";
    button.disabled = candidateProcessingInProgress || !selectedCandidateSources.length || (!modelReady && candidateExecutionState === "ARCHIVED");
    button.classList.toggle("hidden", modelReady && candidateExecutionState === "PROCESSING");
    byId("save-personal-source").classList.toggle("hidden", !modelReady);
    byId("save-personal-source").disabled = candidateProcessingInProgress || candidateExecutionState === "ARCHIVED";
    byId("personal-file-input").disabled = candidateProcessingInProgress;
    byId("personal-file-input").multiple = true;
    byId("personal-file-input").accept = ".pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/png,image/jpeg";
    byId("personal-dropzone").disabled = candidateProcessingInProgress;
    byId("personal-dropzone").setAttribute("aria-disabled", String(candidateProcessingInProgress));
    byId("saved-candidate-source-select").disabled = candidateProcessingInProgress;
    byId("personal-import-types").querySelectorAll("button").forEach((item) => { item.disabled = candidateProcessingInProgress; });
    byId("personal-runtime-summary").textContent = mode === "local"
      ? "仅保存原件，不识别、不分析。接入 AI 后可继续。"
      : modelReady ? `本次模型导入：${runtimeLabel(gate.authority.runtime)} · 也可以先保存原件`
      : "可以先保存原件。AI 分析需选择一份受支持的材料，并接入可用模型。";
    if (byId("personal-processing-boundary")) byId("personal-processing-boundary").textContent = modelReady
      ? "模型结果只进入待审核工作区" : "仅保存原始材料；不调用模型服务商";
    return gate;
  }

  function refreshJobImportGate() {
    let runtime;
    try { runtime = RuntimeGate.authorityFrom(RuntimeGate.readStoredRuntime()).runtime; }
    catch (_error) { runtime = { mode: "invalid", provider: null, model: null }; }
    const modelMode = runtime.mode === "model";
    const gate = currentOperationGate(modelMode ? jobImportOperation() : "job_import");
    const button = byId("start-job-processing");
    if (!button) return gate;
    const modelReady = modelMode && gate.allowed;
    document.body.dataset.jobImportRuntime = modelMode ? "model" : "local";
    document.body.dataset.jobImportLifecycle = jobExecutionState;
    button.textContent = jobProcessingInProgress ? "正在处理" : modelReady
      ? jobExecutionState === "REVIEWING" ? "请完成下方审核" : jobExecutionState === "WORKING" ? "查看 Working Job" : jobExecutionState === "SAVED" ? "职位已保存" : "使用人工智能解析"
      : jobExecutionState === "SOURCE_STORED" ? "原件已保存" : "保存原件";
    button.disabled = jobProcessingInProgress || !selectedJobSource || (modelReady
      ? ["REVIEWING", "READY_TO_SAVE", "SAVED"].includes(jobExecutionState) : jobExecutionState === "SOURCE_STORED");
    byId("save-job-source").classList.toggle("hidden", !modelReady);
    byId("save-job-source").disabled = jobProcessingInProgress || !selectedJobSource || jobExecutionState === "SOURCE_STORED";
    byId("job-file-input").disabled = jobProcessingInProgress;
    byId("job-file-input").multiple = true;
    byId("job-dropzone").disabled = jobProcessingInProgress;
    byId("job-dropzone").setAttribute("aria-disabled", String(jobProcessingInProgress));
    ["job-paste-input", "job-link-input", "saved-job-source-select"].forEach(id => { byId(id).disabled = jobProcessingInProgress; });
    byId("job-import-types")?.querySelectorAll("button").forEach((item) => { item.disabled = jobProcessingInProgress; });
    byId("job-runtime-summary").textContent = runtime.mode === "local"
      ? "仅保存原件，不识别、不分析。接入 AI 后可继续。"
      : modelReady ? `本次模型导入：${runtimeLabel(gate.authority.runtime)} · 也可以先保存原件`
      : "模型分析暂不可用；仍可保存原始材料，稍后继续。";
    if (byId("job-processing-boundary")) byId("job-processing-boundary").textContent = modelReady
      ? "原始来源已持久保留 · Provider 负责语义理解" : "仅保存原始材料；不调用模型服务商";
    return gate;
  }

  function beginJobImportLifecycle(initialState = ModelImportLifecycle.STATES.SOURCE_SELECTED) {
    jobImportLifecycle = ModelImportLifecycle.createStateMachine(initialState);
    jobExecutionState = jobImportLifecycle.state;
    document.body.dataset.jobImportLifecycle = jobExecutionState;
    return jobImportLifecycle;
  }

  function transitionJobImportLifecycle(nextState) {
    if (!jobImportLifecycle) beginJobImportLifecycle();
    jobExecutionState = jobImportLifecycle.transition(nextState);
    document.body.dataset.jobImportLifecycle = jobExecutionState;
    return jobExecutionState;
  }

  function resolveJobProposalLifecycle(unresolvedCount) {
    jobExecutionState = jobImportLifecycle.proposalReady(unresolvedCount);
    document.body.dataset.jobImportLifecycle = jobExecutionState;
    return jobExecutionState;
  }

  function updateJobReviewLifecycle(unresolvedCount) {
    if (!jobImportLifecycle || jobImportLifecycle.state !== ModelImportLifecycle.STATES.REVIEWING) return jobExecutionState;
    jobExecutionState = jobImportLifecycle.reviewProgress(unresolvedCount);
    document.body.dataset.jobImportLifecycle = jobExecutionState;
    return jobExecutionState;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "本地文件";
    if (bytes < 1024) return `${bytes} B`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function sheet(open, id) {
    const element = byId(id);
    element.classList.toggle("hidden", !open);
    document.body.classList.toggle("v1-sheet-open", open);
    if (open) element.querySelector("button, input, textarea")?.focus();
  }

  function installMenuBehavior() {
    document.addEventListener("click", (event) => {
      document.querySelectorAll(".v1-menu[open]").forEach((menu) => {
        if (!menu.contains(event.target)) menu.removeAttribute("open");
      });
    });
  }

  function installMiniSidebar() {
    if (isEmbeddedDetail) return;
    const activeSection = page === "candidate-detail" || page === "personal-import" || page === "personal-understanding" ? "personal" : page === "job-detail" || page === "job-import" || page === "job-overview" ? "jd" : page;
    const items = [
      ...(globalThis.AriadneProduct?.kind === "skill" ? [] : [{ id: "runtime", label: "连接设置", href: "/index.html", width: 84, base: 8 }]),
      { id: "workspace", label: "工作空间", href: "/workspace.html", width: 106, base: 8 },
      { id: "personal", label: "个人资料", href: "/personal-information.html", width: 104, base: 8 },
      { id: "jd", label: "职位描述", href: "/jd.html", width: 84, base: 8 },
    ];
    const markup = `<nav class="v1-mini-sidebar" aria-label="快捷导航">
      <div class="v1-mini-rail">
        ${items.map((item) => `<a class="v1-mini-item" data-mini-label="${item.label}" data-mini-width="${item.width}" data-mini-base="${item.base}" href="${item.href}" aria-label="${item.label}"${activeSection === item.id ? ' aria-current="page"' : ""}><span aria-hidden="true"></span></a>`).join("")}
        <div class="v1-mini-tooltip" aria-hidden="true"><span></span></div>
      </div>
    </nav>`;
    document.body.insertAdjacentHTML("afterbegin", markup);
    const sidebar = document.querySelector(".v1-mini-sidebar");
    const rail = sidebar.querySelector(".v1-mini-rail");
    const tooltip = sidebar.querySelector(".v1-mini-tooltip");
    const tooltipText = tooltip.querySelector("span");
    const navItems = [...sidebar.querySelectorAll(".v1-mini-item")];
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const influenceRadius = 13;
    let activeItem = null;
    let animationFrame = null;
    const states = navItems.map((item) => {
      const baseWidth = Number(item.dataset.miniBase);
      const restWidth = item.getAttribute("aria-current") === "page" ? baseWidth + 10 : baseWidth;
      const restOpacity = item.getAttribute("aria-current") === "page" ? 0.96 : 0.2;
      return {
        baseWidth, restWidth, width: restWidth, widthVelocity: 0, targetWidth: restWidth,
        opacity: restOpacity, opacityVelocity: 0, targetOpacity: restOpacity,
        scaleY: 0.76, scaleVelocity: 0, targetScaleY: 0.76,
      };
    });

    function showFor(item) {
      if (activeItem === item && tooltip.dataset.visible === "true") return;
      activeItem = item;
      rail.style.setProperty("--mini-tip-y", `${item.offsetTop + item.offsetHeight / 2}px`);
      tooltipText.textContent = item.dataset.miniLabel;
      const translatedWidth = Math.ceil(tooltipText.scrollWidth) + 28;
      rail.style.setProperty("--mini-tip-width", `${Math.max(Number(item.dataset.miniWidth), translatedWidth)}px`);
      tooltip.dataset.visible = "true";
      navItems.forEach((entry) => entry.classList.toggle("is-nearest", entry === item));
      tooltipText.getAnimations?.().forEach((animation) => animation.cancel());
      tooltipText.animate?.([
        { opacity: 0.12, filter: "blur(7px)", transform: "translateX(-5px)" },
        { opacity: 1, filter: "blur(0)", transform: "translateX(0)" },
      ], { duration: 220, easing: "cubic-bezier(.2,.82,.2,1)", fill: "both" });
    }

    function hideLabel() {
      activeItem = null;
      tooltip.dataset.visible = "false";
      navItems.forEach((entry) => entry.classList.remove("is-nearest"));
    }

    function spring(state, valueKey, velocityKey, targetKey) {
      if (prefersReducedMotion) {
        state[valueKey] = state[targetKey];
        state[velocityKey] = 0;
        return false;
      }
      state[velocityKey] = (state[velocityKey] + (state[targetKey] - state[valueKey]) * 0.17) * 0.72;
      state[valueKey] += state[velocityKey];
      const moving = Math.abs(state[velocityKey]) > 0.002 || Math.abs(state[targetKey] - state[valueKey]) > 0.002;
      if (!moving) state[valueKey] = state[targetKey];
      return moving;
    }

    function renderSpringFrame() {
      let moving = false;
      states.forEach((state, index) => {
        moving = spring(state, "width", "widthVelocity", "targetWidth") || moving;
        moving = spring(state, "opacity", "opacityVelocity", "targetOpacity") || moving;
        moving = spring(state, "scaleY", "scaleVelocity", "targetScaleY") || moving;
        const dash = navItems[index].querySelector("span");
        dash.style.width = `${state.width.toFixed(3)}px`;
        dash.style.opacity = state.opacity.toFixed(3);
        dash.style.transform = `scaleY(${state.scaleY.toFixed(3)})`;
      });
      animationFrame = moving ? window.requestAnimationFrame(renderSpringFrame) : null;
    }

    function startSpring() {
      if (animationFrame == null) animationFrame = window.requestAnimationFrame(renderSpringFrame);
    }

    function updateDistanceField(localY) {
      rail.classList.add("is-expanded");
      let nearestIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      navItems.forEach((item, index) => {
        const distance = Math.abs(localY - (item.offsetTop + item.offsetHeight / 2));
        if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
        const influence = Math.exp(-0.5 * (distance / influenceRadius) ** 2);
        states[index].targetWidth = states[index].restWidth + (38 - states[index].restWidth) * influence;
        states[index].targetOpacity = Math.max(item.getAttribute("aria-current") === "page" ? 0.96 : 0.2, 0.2 + 0.8 * influence);
        states[index].targetScaleY = 0.76 + 0.32 * influence;
      });
      if (nearestIndex >= 0) showFor(navItems[nearestIndex]);
      startSpring();
    }

    function resetDistanceField() {
      rail.classList.remove("is-expanded");
      states.forEach((state, index) => {
        state.targetWidth = state.restWidth;
        state.targetOpacity = navItems[index].getAttribute("aria-current") === "page" ? 0.96 : 0.2;
        state.targetScaleY = 0.76;
      });
      hideLabel();
      startSpring();
    }

    function navigateFromMiniLabel(event, item) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const destination = item.href;
      if (!destination || item.getAttribute("aria-current") === "page") { event.preventDefault(); return; }
      event.preventDefault();
      showFor(item);
      navigateWithPageFade(destination);
    }

    navItems.forEach((item) => {
      const state = states[navItems.indexOf(item)];
      const dash = item.querySelector("span");
      dash.style.width = `${state.width}px`;
      dash.style.opacity = state.opacity;
      dash.style.transform = `scaleY(${state.scaleY})`;
      item.addEventListener("focus", () => updateDistanceField(item.offsetTop + item.offsetHeight / 2));
      item.addEventListener("blur", resetDistanceField);
      item.addEventListener("click", (event) => navigateFromMiniLabel(event, item));
    });
    rail.addEventListener("pointerenter", () => rail.classList.add("is-expanded"));
    rail.addEventListener("pointermove", (event) => updateDistanceField(event.clientY - rail.getBoundingClientRect().top));
    rail.addEventListener("pointerleave", resetDistanceField);
  }

  const CARD_ROUTE_KEY = "job-radar-v1-card-route";
  const safeSession = {
    get() { try { return JSON.parse(sessionStorage.getItem(CARD_ROUTE_KEY) || "null"); } catch (_error) { return null; } },
    set(value) { try { sessionStorage.setItem(CARD_ROUTE_KEY, JSON.stringify(value)); } catch (_error) { /* Motion remains optional. */ } },
    remove() { try { sessionStorage.removeItem(CARD_ROUTE_KEY); } catch (_error) { /* Motion remains optional. */ } },
  };
  const routeKey = (url) => {
    const params = new URLSearchParams(url.search);
    params.delete("v");
    const search = params.toString();
    return `${url.pathname}${search ? `?${search}` : ""}`;
  };
  const currentRoute = () => routeKey(new URL(window.location.href));
  const routeFor = (href) => routeKey(new URL(href, window.location.href));
  const transitionSourceSelector = ".v1-candidate-card, .v1-add-guide-card";
  const pageFadeSourceSelector = "a[href]";
  const pagePaperColor = () => getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#f7f7f9";

  let pageFadeTimer = null;
  function pageFadeDestination(source) {
    if (!source || source.matches(transitionSourceSelector) || source.hasAttribute("download")) return null;
    const target = source.getAttribute("target");
    if (target && target.toLowerCase() !== "_self") return null;
    let destination;
    try { destination = new URL(source.getAttribute("href"), window.location.href); }
    catch (_error) { return null; }
    if (destination.origin !== window.location.origin || !/^(?:\/|.*\.html)$/.test(destination.pathname)) return null;
    if (destination.pathname === window.location.pathname && destination.search === window.location.search) return null;
    return destination.href;
  }

  function navigateWithPageFade(destination) {
    if (pageFadeTimer !== null) return;
    safeSession.remove();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { window.location.assign(destination); return; }
    document.body.classList.add("v1-route-leaving");
    pageFadeTimer = window.setTimeout(() => window.location.assign(destination), 320);
  }

  function restorePageFade(event) {
    window.clearTimeout(pageFadeTimer);
    pageFadeTimer = null;
    document.body.classList.remove("v1-route-leaving");
    if (!event.persisted) return;
    const shell = document.querySelector(".v1-page-shell");
    if (!shell) return;
    shell.style.animation = "none";
    void shell.offsetWidth;
    shell.style.animation = "";
  }

  function installDetailCardOverlay() {
    if (isEmbeddedDetail || !["personal", "jd", "workspace"].includes(page)) return;
    const aboutWorkspace = page === "workspace";
    const importCopy = page === "jd"
      ? Object.freeze({ title: "添加职位描述", close: "关闭添加职位描述", workspace: "职位描述" })
      : Object.freeze({ title: "添加个人材料", close: "关闭添加个人材料", workspace: "候选人信息" });
    document.body.insertAdjacentHTML("beforeend", `<div class="v1-detail-overlay hidden" aria-hidden="true">
      <button class="v1-detail-overlay-backdrop v1-sheet-backdrop" type="button" aria-label="关闭详情"></button>
      <section class="v1-detail-overlay-surface" role="dialog" aria-modal="true" aria-label="资料详情" tabindex="-1">
        <div class="v1-detail-overlay-preview" aria-hidden="true"></div>
        <div class="v1-detail-overlay-content">
          <header><button class="v1-detail-overlay-close" type="button" aria-label="关闭详情"></button><p></p><span class="v1-detail-overlay-header-actions"><button class="v1-detail-overlay-edit" type="button" aria-label="编辑当前内容">编辑</button><button class="v1-detail-overlay-workspace-close hidden" type="button" aria-label="关闭导入">×</button></span></header>
          <iframe title="本地资料详情"></iframe>
          <div class="v1-about-copy hidden">
            <h1><span class="v1-about-name">Ariadne</span><span class="v1-about-name-zh">衡</span></h1>
            <p class="v1-about-intro">先理解你，再理解机会。</p>
            <p><a class="runtime-back-link" href="https://ariadne.kai-nex.com/#skill" target="_blank" rel="noopener">安装 Ariadne Skill · Mac 独立窗口</a></p>
            <p>Ariadne · 衡是一个帮助你探索职业方向的工具。它理解你的经历与作品，也理解你选择的职位，帮你看清两者的关系。</p>
            <p>在个人资料中点击「了解我」，围绕过去的项目与经历逐步了解你；在职位描述中点击「了解职位概况」，汇总所有 JD 的职责、要求与差异。想讨论自己与某个职位的关系，可以进入该职位详情。</p>
            <p>原件、资料和对话保存在本机或当前浏览器。选择 API 模型并确认发送后，本次材料和 API Key 会经当前 Ariadne 服务转发给模型服务商；网页版经过网站服务器。Key 不在服务端持久保存，上传材料仅作临时处理；结果会短暂保留在内存中以处理重试。本地 Skill 使用 Codex，材料由你自己的电脑发送给 OpenAI。</p>
          </div>
        </div>
      </section>
    </div>`);
    const overlay = document.querySelector(".v1-detail-overlay");
    const backdrop = overlay.querySelector(".v1-detail-overlay-backdrop");
    const surface = overlay.querySelector(".v1-detail-overlay-surface");
    const preview = overlay.querySelector(".v1-detail-overlay-preview");
    const content = overlay.querySelector(".v1-detail-overlay-content");
    const title = content.querySelector("header p");
    const closeButton = overlay.querySelector(".v1-detail-overlay-close");
    const editButton = overlay.querySelector(".v1-detail-overlay-edit");
    const workspaceCloseButton = overlay.querySelector(".v1-detail-overlay-workspace-close");
    const frame = overlay.querySelector("iframe");
    const aboutCopy = overlay.querySelector(".v1-about-copy");
    function alignAboutBrand() {
      if (!aboutWorkspace) return;
      const english = aboutCopy.querySelector(".v1-about-name");
      const chinese = aboutCopy.querySelector(".v1-about-name-zh");
      const context = document.createElement("canvas").getContext("2d");
      if (!context) return;
      const measure = (element) => {
        context.font = getComputedStyle(element).font;
        return context.measureText(element.textContent);
      };
      const latin = measure(english);
      const reference = measure(chinese);
      const latinHeight = latin.actualBoundingBoxAscent + latin.actualBoundingBoxDescent;
      const chineseHeight = reference.actualBoundingBoxAscent + reference.actualBoundingBoxDescent;
      if (!(latinHeight > 0 && chineseHeight > 0)) return;
      // Match the painted glyph bounds without stretching either writing system.
      const size = parseFloat(getComputedStyle(chinese).fontSize) * latinHeight / chineseHeight;
      chinese.style.fontSize = `${size}px`;
      const adjusted = measure(chinese);
      chinese.style.transform = `translateY(${latin.actualBoundingBoxDescent - adjusted.actualBoundingBoxDescent}px)`;
    }
    if (aboutWorkspace) {
      document.fonts?.ready.then(alignAboutBrand);
      document.fonts?.addEventListener("loadingdone", alignAboutBrand);
      window.addEventListener("resize", alignAboutBrand);
    }
    const pageShell = document.querySelector(".v1-page-shell");
    const wasPageInert = pageShell?.inert || false;
    if (aboutWorkspace) {
      overlay.classList.add("is-about");
      closeButton.classList.replace("v1-detail-overlay-close", "v1-back");
      backdrop.setAttribute("aria-label", "关闭介绍，返回工作空间");
      backdrop.tabIndex = -1;
    }
    const surfaceControls = window.JobRadarFloatingWindow?.mount(surface, {
      dragHandle: content.querySelector("header"),
      minWidth: 520,
      minHeight: 400,
      margin: 10,
    });
    let sourceCard = null;
    let surfaceAnimation = null;
    let closing = false;
    let revealTimer = null;
    let afterClose = null;
    let aboutKeyboardInteraction = false;
    let aboutReturnWordmark = null;
    let aboutFadeAnimation = null;
    let frameConversationActive = false;
    let retainedFrameUrl = null;
    let personalSupplementReturnUrl = null;
    const aboutMotion = getComputedStyle(overlay);
    const aboutOpenDuration = parseFloat(aboutMotion.getPropertyValue("--vi-motion-about-open")) || 900;
    const aboutCloseDuration = parseFloat(aboutMotion.getPropertyValue("--vi-motion-about-close")) || 800;
    const aboutEasing = aboutMotion.getPropertyValue("--vi-ease-about").trim() || "cubic-bezier(.4,0,.2,1)";

    // Keep the final layout throughout motion; only composite its position and scale.
    function aboutTransform(from, to) {
      const scale = Math.min(to.width / from.width, to.height / from.height);
      return `translate(${to.left + to.width / 2 - from.left - from.width / 2}px, ${to.top + to.height / 2 - from.top - from.height / 2}px) scale(${scale})`;
    }

    function prepareAboutReturn() {
      const heading = aboutCopy.querySelector("h1");
      const origin = heading.querySelector(".v1-about-name");
      const start = origin.getBoundingClientRect();
      const end = sourceCard.getBoundingClientRect();
      const startStyle = getComputedStyle(origin);
      const endStyle = getComputedStyle(sourceCard);
      const typographyFrame = (rect, style) => ({
        left: `${rect.left}px`, top: `${rect.top}px`, fontSize: style.fontSize,
        fontWeight: style.fontWeight, letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight === "normal" ? `${rect.height}px` : style.lineHeight,
      });
      const first = typographyFrame(start, startStyle);
      const last = typographyFrame(end, endStyle);
      // Early dismissal can interrupt a scaled opening frame.
      const paintedScale = surface.getBoundingClientRect().width / surface.offsetWidth;
      for (const property of ["fontSize", "letterSpacing", "lineHeight"]) {
        first[property] = `${parseFloat(first[property]) * paintedScale}px`;
      }
      // Freeze the content geometry: fading copy must not wrap into the shrinking surface.
      content.style.width = `${content.offsetWidth}px`;
      content.style.height = `${content.offsetHeight}px`;
      aboutReturnWordmark = document.createElement("span");
      aboutReturnWordmark.className = "v1-wordmark v1-about-return-wordmark";
      aboutReturnWordmark.textContent = sourceCard.textContent;
      aboutReturnWordmark.setAttribute("aria-hidden", "true");
      Object.assign(aboutReturnWordmark.style, last);
      overlay.append(aboutReturnWordmark);
      heading.style.visibility = "hidden";
      const opacity = getComputedStyle(surface).opacity;
      aboutReturnWordmark.animate([{ ...first, opacity }, { ...last, opacity: 1 }], { duration: aboutCloseDuration, easing: aboutEasing, fill: "both" });
      // Fade the paper before it reaches wordmark size, so no tiny box trails the title.
      aboutFadeAnimation = surface.animate([{ opacity }, { opacity: 0, offset: 0.65 }, { opacity: 0 }], { duration: aboutCloseDuration, easing: aboutEasing, fill: "both" });
    }

    function setImportOverlayView(view = "import") {
      const workspace = view === "workspace";
      overlay.classList.toggle("is-import-workspace", workspace);
      closeButton.setAttribute("aria-label", workspace ? "返回导入" : importCopy.close);
      workspaceCloseButton.setAttribute("aria-label", importCopy.close);
      title.textContent = workspace ? importCopy.workspace : importCopy.title;
      workspaceCloseButton.classList.toggle("hidden", !workspace);
    }

    function targetRect() {
      const viewportWidth = window.visualViewport?.width || window.innerWidth;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const compact = viewportWidth < 760;
      if (aboutWorkspace) {
        const width = Math.min(620, viewportWidth * 0.92);
        const height = Math.min(480, viewportHeight * 0.86);
        return { left: (viewportWidth - width) / 2, top: (viewportHeight - height) / 2, width, height };
      }
      const skillWorkspace = globalThis.AriadneProduct?.kind === "skill";
      const width = viewportWidth * (compact ? 0.94 : skillWorkspace ? 0.92 : 0.8);
      const height = viewportHeight * (compact ? 0.9 : 0.8);
      return { left: (viewportWidth - width) / 2, top: (viewportHeight - height) / 2, width, height };
    }

    function rectFrame(rect, radius) {
      return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: radius };
    }

    function openOverlay(card) {
      if (sourceCard || closing) return;
      surfaceControls?.reset();
      sourceCard = card;
      const isImport = card.matches(".v1-add-guide-card");
      editButton.classList.toggle("hidden", isImport || aboutWorkspace);
      editButton.disabled = isImport || aboutWorkspace;
      const sourceRect = card.getBoundingClientRect();
      const destinationRect = targetRect();
      const sourceRadius = getComputedStyle(card).borderRadius;
      const clone = card.cloneNode(true);
      clone.removeAttribute("href");
      clone.removeAttribute("data-transition-key");
      clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      if (isImport) {
        card.classList.add("v1-transition-light");
        clone.classList.add("v1-transition-light");
      }
      preview.replaceChildren(clone);
      title.textContent = card.querySelector("h3, b")?.textContent || "资料详情";
      overlay.dataset.overlayKind = isImport ? "import" : "detail";
      if (isImport) setImportOverlayView("import");
      else {
        overlay.classList.remove("is-import-workspace");
        closeButton.setAttribute("aria-label", "关闭详情");
        workspaceCloseButton.setAttribute("aria-label", "关闭导入");
        workspaceCloseButton.classList.add("hidden");
      }
      surface.setAttribute("aria-label", isImport ? title.textContent : "资料详情");
      frame.title = isImport ? title.textContent : "资料详情";
      frame.classList.toggle("hidden", aboutWorkspace);
      aboutCopy.classList.toggle("hidden", !aboutWorkspace);
      if (aboutWorkspace) {
        title.textContent = "关于";
        surface.setAttribute("aria-label", "关于 Ariadne · 衡");
        closeButton.setAttribute("aria-label", "返回工作空间");
        sourceCard.setAttribute("aria-expanded", "true");
        if (pageShell) pageShell.inert = true;
        aboutCopy.scrollTop = 0;
      }
      overlay.classList.remove("hidden", "is-content-ready", "is-closing");
      if (aboutWorkspace) alignAboutBrand();
      overlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("v1-detail-overlay-open");
      Object.assign(surface.style, rectFrame(destinationRect, "28px"));
      sourceCard.style.visibility = "hidden";
      const detailUrl = new URL(card.href, window.location.href);
      detailUrl.searchParams.set("embed", "1");
      detailUrl.searchParams.delete("v");
      const reuseRetainedFrame = !aboutWorkspace && retainedFrameUrl === detailUrl.href && frame.src === detailUrl.href;
      frame.onload = aboutWorkspace ? null : () => {
        window.clearTimeout(revealTimer);
        revealTimer = window.setTimeout(() => {
          if (!closing && sourceCard) overlay.classList.add("is-content-ready");
        }, 260);
      };
      if (aboutWorkspace) {
        overlay.classList.add("is-content-ready");
      } else if (reuseRetainedFrame) {
        overlay.classList.add("is-content-ready");
      } else {
        retainedFrameUrl = detailUrl.href;
        personalSupplementReturnUrl = null;
        frameConversationActive = false;
        frame.src = detailUrl.href;
      }
      backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: aboutWorkspace ? aboutOpenDuration : 320, easing: aboutWorkspace ? aboutEasing : "ease", fill: "both" });
      surfaceAnimation = aboutWorkspace ? surface.animate([
        { transform: aboutTransform(destinationRect, sourceRect) },
        { transform: "none" },
      ], { duration: aboutOpenDuration, easing: aboutEasing, fill: "both" }) : surface.animate([
        rectFrame(sourceRect, sourceRadius),
        rectFrame(destinationRect, "28px"),
      ], { duration: 540, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" });
      if (aboutWorkspace && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        backdrop.getAnimations().forEach((animation) => animation.finish());
        surfaceAnimation.finish();
      }
      surfaceAnimation.finished.then(() => {
        if (!closing) { surfaceAnimation.cancel(); surfaceAnimation = null; (aboutWorkspace ? closeButton : surface).focus({ preventScroll: true }); }
      }).catch(() => {});
    }

    function finishClose() {
      const finishedSource = sourceCard;
      const completion = afterClose;
      surfaceAnimation?.cancel();
      aboutFadeAnimation?.cancel();
      aboutFadeAnimation = null;
      aboutReturnWordmark?.remove();
      aboutReturnWordmark = null;
      content.style.width = "";
      content.style.height = "";
      aboutCopy.querySelector("h1").style.visibility = "";
      backdrop.getAnimations().forEach((animation) => animation.cancel());
      frame.onload = null;
      if (!frameConversationActive) {
        frame.src = "about:blank";
        retainedFrameUrl = null;
        personalSupplementReturnUrl = null;
      }
      preview.replaceChildren();
      overlay.classList.add("hidden");
      overlay.classList.remove("is-content-ready", "is-closing");
      overlay.classList.remove("is-import-workspace", "is-personal-supplement");
      delete overlay.dataset.overlayKind;
      overlay.setAttribute("aria-hidden", "true");
      document.body.classList.remove("v1-detail-overlay-open");
      surfaceControls?.reset();
      if (finishedSource) {
        if (aboutWorkspace) {
          if (pageShell) pageShell.inert = wasPageInert;
          finishedSource.setAttribute("aria-expanded", "false");
          finishedSource.classList.toggle("is-pointer-return", !aboutKeyboardInteraction);
        }
        finishedSource.style.visibility = "";
        finishedSource.focus({ preventScroll: true });
        if (finishedSource.matches(".v1-add-guide-card")) window.requestAnimationFrame(() => finishedSource.classList.remove("v1-transition-light"));
      }
      sourceCard = null;
      surfaceAnimation = null;
      closing = false;
      afterClose = null;
      if (completion) Promise.resolve(completion()).catch((error) => console.error("Unable to refresh imported cards", error));
    }

    function closeOverlay() {
      if (!sourceCard || closing) return;
      closing = true;
      window.clearTimeout(revealTimer);
      if (aboutWorkspace) prepareAboutReturn();
      overlay.classList.add("is-closing");
      const currentRect = surface.getBoundingClientRect();
      const currentTransform = getComputedStyle(surface).transform;
      const destinationRect = sourceCard.getBoundingClientRect();
      const destinationRadius = getComputedStyle(sourceCard).borderRadius;
      surfaceAnimation?.cancel();
      const backdropOpacity = getComputedStyle(backdrop).opacity;
      backdrop.getAnimations().forEach((animation) => animation.cancel());
      backdrop.animate([{ opacity: backdropOpacity }, { opacity: 0 }], { duration: aboutWorkspace ? aboutCloseDuration : 360, easing: aboutWorkspace ? aboutEasing : "ease", fill: "both" });
      surfaceAnimation = aboutWorkspace ? surface.animate([
        { transform: currentTransform },
        { transform: aboutTransform(surface.getBoundingClientRect(), destinationRect) },
      ], { duration: aboutCloseDuration, easing: aboutEasing, fill: "both" }) : surface.animate([
        rectFrame(currentRect, "28px"),
        rectFrame(destinationRect, destinationRadius),
      ], { duration: 480, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" });
      if (aboutWorkspace && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        backdrop.getAnimations().forEach((animation) => animation.finish());
        aboutReturnWordmark?.getAnimations().forEach((animation) => animation.finish());
        aboutFadeAnimation?.finish();
        surfaceAnimation.finish();
      }
      surfaceAnimation.finished.then(finishClose).catch(finishClose);
    }

    document.addEventListener("click", (event) => {
      const card = aboutWorkspace ? event.target.closest(".v1-wordmark[data-about-trigger]") : event.target.closest(".v1-candidate-card, .v1-add-guide-card");
      if (!card || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (aboutWorkspace) {
        aboutKeyboardInteraction = event.detail === 0;
        card.classList.remove("is-pointer-return");
      }
      safeSession.remove();
      if (!aboutWorkspace && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { window.location.assign(card.href); return; }
      openOverlay(card);
    });
    closeButton.addEventListener("click", () => {
      if (overlay.classList.contains("is-import-workspace")) {
        frame.contentWindow?.postMessage({ type: "job-radar-v1-workspace-back" }, window.location.origin);
        return;
      }
      if (personalSupplementReturnUrl) {
        const destination = personalSupplementReturnUrl;
        personalSupplementReturnUrl = null;
        overlay.classList.remove("is-personal-supplement");
        title.textContent = sourceCard?.querySelector("h3, b")?.textContent || "资料详情";
        editButton.classList.remove("hidden");
        editButton.disabled = false;
        closeButton.setAttribute("aria-label", "关闭详情");
        frame.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: "ease", fill: "both" }).finished.then(() => {
          retainedFrameUrl = destination;
          frame.onload = () => frame.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease", fill: "both" });
          frame.src = destination;
        }).catch(() => { frame.src = destination; });
        return;
      }
      closeOverlay();
    });
    workspaceCloseButton.addEventListener("click", () => frame.contentWindow?.postMessage({ type: "job-radar-v1-workspace-close" }, window.location.origin));
    editButton.addEventListener("click", () => frame.contentWindow?.postMessage({ type: "job-radar-v1-open-detail-edit" }, window.location.origin));
    backdrop.addEventListener("click", closeOverlay);
    document.addEventListener("pointerdown", () => { if (aboutWorkspace && sourceCard) aboutKeyboardInteraction = false; });
    document.addEventListener("keydown", (event) => {
      if (aboutWorkspace) {
        aboutKeyboardInteraction = true;
        document.querySelector("[data-about-trigger]")?.classList.remove("is-pointer-return");
      }
      if (event.key === "Escape") closeOverlay();
      if (!aboutWorkspace || !sourceCard || closing || event.key !== "Tab") return;
      event.preventDefault();
      closeButton.focus({ preventScroll: true });
    });
    window.addEventListener("resize", () => {
      if (!sourceCard || closing || surface.classList.contains("floating-window-positioned")) return;
      Object.assign(surface.style, rectFrame(targetRect(), "28px"));
    });
    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
      if (event.data?.type === "ariadne-conversation-execution-state") {
        frameConversationActive = event.data.active === true;
        return;
      }
      if (event.data?.type === "ariadne-open-personal-supplement") {
        const destination = new URL(event.data.destination, window.location.origin);
        if (destination.origin !== window.location.origin || destination.pathname !== "/personal-understanding.html") return;
        personalSupplementReturnUrl = retainedFrameUrl || frame.src;
        overlay.classList.add("is-personal-supplement");
        title.textContent = "关于我 · 个人补充";
        editButton.classList.add("hidden");
        editButton.disabled = true;
        closeButton.setAttribute("aria-label", "返回原对话");
        frameConversationActive = false;
        frame.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: "ease", fill: "both" }).finished.then(() => {
          frame.onload = () => frame.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease", fill: "both" });
          frame.src = destination.href;
        }).catch(() => { frame.src = destination.href; });
        return;
      }
      if (event.data?.type === "job-radar-v1-import-view-state") {
        if (overlay.dataset.overlayKind === "import") setImportOverlayView(event.data.view);
        return;
      }
      const importComplete = event.data?.type === "job-radar-v1-import-complete";
      const detailUpdated = event.data?.type === "job-radar-v1-detail-updated";
      if (!importComplete && !detailUpdated) return;
      const { library, sourceKey } = event.data;
      if ((library === "personal" && page !== "personal") || (library === "jd" && page !== "jd")) return;
      afterClose = async () => {
        if (library === "personal") await renderPersonalLibrary();
        else await renderJobLibrary();
        document.querySelector(`[data-transition-key="${CSS.escape(sourceKey)}"]`)?.focus({ preventScroll: true });
      };
      if (importComplete) closeOverlay();
    });
  }

  function createCardTransitionLayer(source, startRect, startFullscreen = false) {
    const layer = source.cloneNode(true);
    layer.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    layer.removeAttribute("href");
    layer.classList.add("v1-card-transition-layer");
    if (source.matches(".v1-add-guide-card, .v1-object-folder.dark")) layer.classList.add("v1-transition-light");
    layer.style.backgroundColor = startFullscreen ? pagePaperColor() : "#fff";
    Object.assign(layer.style, startFullscreen ? {
      left: "0px", top: "0px", width: `${window.innerWidth}px`, height: `${window.innerHeight}px`, borderRadius: "0px",
    } : {
      left: `${startRect.left}px`, top: `${startRect.top}px`, width: `${startRect.width}px`, height: `${startRect.height}px`, borderRadius: getComputedStyle(source).borderRadius,
    });
    document.body.append(layer);
    return layer;
  }

  function animateCardToPage(source, destination) {
    const rect = source.getBoundingClientRect();
    const layer = createCardTransitionLayer(source, rect);
    const paperColor = pagePaperColor();
    document.body.classList.add("v1-card-route-out");
    const animation = layer.animate([
      { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: getComputedStyle(source).borderRadius, backgroundColor: "#fff", opacity: 1 },
      { left: "0px", top: "0px", width: `${window.innerWidth}px`, height: `${window.innerHeight}px`, borderRadius: "0px", backgroundColor: paperColor, opacity: 1 },
    ], { duration: 460, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
    window.setTimeout(() => {
      if (layer.isConnected) layer.classList.add("v1-transition-surface");
    }, 300);
    animation.finished.then(() => {
      layer.classList.add("is-holding");
      window.setTimeout(() => window.location.assign(destination), 34);
    }).catch(() => window.location.assign(destination));
  }

  function installCardPageTransitions() {
    document.addEventListener("click", (event) => {
      const fadeSource = event.target.closest(pageFadeSourceSelector);
      if (fadeSource && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        const fadeDestination = pageFadeDestination(fadeSource);
        if (fadeDestination) {
          event.preventDefault();
          navigateWithPageFade(fadeDestination);
          return;
        }
      }
      const source = event.target.closest(transitionSourceSelector);
      if (!source || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const destination = source.getAttribute("href");
      if (!destination) return;
      event.preventDefault();
      const route = { origin: currentRoute(), destination: routeFor(destination), sourceKey: source.dataset.transitionKey || "", returning: false };
      safeSession.set(route);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { window.location.assign(destination); return; }
      animateCardToPage(source, destination);
    });

    window.addEventListener("pageshow", restorePageFade);

    document.querySelectorAll(".v1-back[href]").forEach((back) => back.addEventListener("click", (event) => {
      const route = safeSession.get();
      if (!route || route.destination !== currentRoute() || route.origin !== routeFor(back.href)) return;
      event.preventDefault();
      route.returning = true;
      safeSession.set(route);
      document.body.classList.add("v1-card-return-cover");
      window.setTimeout(() => window.location.assign(back.href), 180);
    }));

    const route = safeSession.get();
    if (route?.destination === currentRoute() && !route.returning) {
      document.body.classList.add("v1-card-route-in");
      const cover = document.createElement("div");
      cover.className = "v1-card-arrival-cover";
      document.body.append(cover);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        document.body.classList.add("is-visible");
        cover.classList.add("is-clearing");
      }));
      window.setTimeout(() => cover.remove(), 340);
    }
  }

  function playPendingCardReturn() {
    const route = safeSession.get();
    if (!route?.returning || route.origin !== currentRoute()) return;
    const target = [...document.querySelectorAll(transitionSourceSelector)].find((item) => item.dataset.transitionKey === route.sourceKey);
    if (!target) { safeSession.remove(); return; }
    const returnsToDarkSurface = target.matches(".v1-add-guide-card, .v1-object-folder.dark");
    if (returnsToDarkSurface) target.classList.add("v1-transition-light");
    const rect = target.getBoundingClientRect();
    const layer = createCardTransitionLayer(target, rect, true);
    const paperColor = pagePaperColor();
    layer.classList.add("v1-transition-surface");
    document.body.classList.add("v1-card-route-returning");
    layer.animate([
      { left: "0px", top: "0px", width: `${window.innerWidth}px`, height: `${window.innerHeight}px`, borderRadius: "0px", backgroundColor: paperColor, opacity: 1 },
      { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: getComputedStyle(target).borderRadius, backgroundColor: "#fff", opacity: .98 },
    ], { duration: 420, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
    window.setTimeout(() => {
      layer.remove();
      document.body.classList.remove("v1-card-route-returning");
      safeSession.remove();
      if (returnsToDarkSurface) window.requestAnimationFrame(() => target.classList.remove("v1-transition-light"));
    }, 430);
  }

  function returnToCardLibrary(destination, sourceKey) {
    const route = safeSession.get() || {};
    safeSession.set({ ...route, origin: routeFor(destination), destination: currentRoute(), sourceKey, returning: true });
    document.body.classList.add("v1-card-return-cover");
    window.setTimeout(() => window.location.assign(destination), 180);
  }

  function completeEmbeddedImport(library, sourceKey) {
    if (!isEmbeddedDetail || window.parent === window) return false;
    window.parent.postMessage({ type: "job-radar-v1-import-complete", library, sourceKey }, window.location.origin);
    return true;
  }

  async function initWorkspace() {
    try {
      const [candidates, jobs] = await Promise.all([readPersonalLibrary(), readJobLibrary()]);
      const candidateCount = candidates.canonical.length + candidates.legacy.length;
      const jobCount = jobs.canonical.length + jobs.legacy.length;
      byId("workspace-personal-count").textContent = candidateCount ? `${candidateCount} 张资料卡片` : "尚未添加";
      byId("workspace-job-count").textContent = jobCount ? `${jobCount} 个职位对象` : "尚未添加";
    } catch (error) {
      byId("workspace-personal-count").textContent = "暂时无法读取";
      byId("workspace-job-count").textContent = "暂时无法读取";
      throw error;
    }
    window.requestAnimationFrame(playPendingCardReturn);
  }

  function cardSubtitleText(...values) {
    return values.map((value) => String(value ?? "").trim()).filter(Boolean).join(" ");
  }

  let libraryEditor = null;
  async function removePersonalLibraryCard(item) {
    if (item.data_class !== "CANONICAL_CONFIRMED") return LocalCandidateReview.removeLegacyContext(Demo, Demo.DEMO_STORES.candidates, item.item_id);
    const database = await Truth.openDatabase();
    try {
      const revision = LocalCandidateReview.latestRevision(await LocalCandidateReview.getAll(database, "candidate_context_revisions"), item.context_id);
      if (revision?.revision_id !== item.revision_id) throw new Error("context_version_conflict");
      await LocalCandidateReview.persistRemoval(database, revision, item.item_id);
    } finally { database.close(); }
  }

  async function removeJobLibraryCard(job) {
    if (job.data_class !== "CANONICAL_CONFIRMED") return LocalJobLifecycle.removeCard(Demo, Demo.DEMO_STORES.jobs, job.job_context_id);
    const database = await Truth.openDatabase();
    try {
      const revision = JobContext.latestRevision(await JobContext.getAll(database, "job_context_revisions"), job.job_context_id);
      if (revision?.revision_id !== job.revision_id) throw new Error("context_version_conflict");
      await JobContext.persistRemoval(database, revision);
    } finally { database.close(); }
  }

  function createLibraryEditor(gridId, messageId, remove, render) {
    const grid = byId(gridId), toggle = byId("library-edit-toggle"), message = byId(messageId);
    let editing = false, busy = false, selected = null, opener = null;
    const dialog = document.createElement("dialog");
    dialog.className = "v1-model-consent-dialog";
    dialog.id = "library-delete-dialog";
    dialog.setAttribute("aria-labelledby", "library-delete-title");
    dialog.setAttribute("aria-describedby", "library-delete-copy");
    dialog.innerHTML = `<h2 id="library-delete-title">删除这张卡片？</h2><p id="library-delete-copy"></p><p>仅移除当前卡片，原始材料与历史记录仍然保留。</p><p class="v1-inline-message error" role="alert" data-delete-error></p><div class="v1-button-row v1-edit-actions"><button type="button" class="v1-edit-text-action" data-edit-cancel autofocus>取消</button><button type="button" class="v1-edit-text-action" data-edit-destructive>确认删除</button></div>`;
    document.body.append(dialog);
    const cancel = dialog.querySelector("[data-edit-cancel]"), confirm = dialog.querySelector("[data-edit-destructive]");
    const setEditing = (value) => {
      editing = value;
      grid.classList.toggle("is-editing", editing);
      toggle.textContent = editing ? "完成" : "编辑";
      toggle.setAttribute("aria-pressed", String(editing));
      grid.querySelectorAll(".v1-candidate-card, .v1-job-stage-select, .v1-job-source-link").forEach((link) => {
        if (editing) link.setAttribute("tabindex", "-1"); else link.removeAttribute("tabindex");
      });
      grid.querySelectorAll("[data-library-delete]").forEach((button) => { button.hidden = !editing; button.disabled = busy; });
    };
    toggle.addEventListener("click", () => { if (!busy) { jobStageMenu?.close(); setEditing(!editing); } });
    grid.addEventListener("click", (event) => {
      if (editing && event.target.closest(".v1-candidate-card, .v1-job-stage-select, .v1-job-source-link")) { event.preventDefault(); event.stopPropagation(); }
    }, true);
    cancel.addEventListener("click", () => dialog.close());
    dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
    dialog.addEventListener("close", () => { if (opener?.isConnected) opener.focus(); else toggle.focus(); selected = null; });
    confirm.addEventListener("click", async () => {
      if (busy || !selected) return;
      busy = true;
      toggle.disabled = cancel.disabled = confirm.disabled = true;
      dialog.setAttribute("aria-busy", "true");
      confirm.textContent = "正在删除…";
      dialog.querySelector("[data-delete-error]").textContent = "";
      let removed = false;
      try {
        await remove(selected);
        removed = true;
        await render();
        message.classList.remove("error");
        message.textContent = "已删除卡片，原始材料与历史记录仍然保留。";
        dialog.close();
      } catch (error) {
        if (removed) {
          dialog.close();
          message.classList.add("error");
          message.textContent = "卡片已删除，但列表更新失败，请刷新页面。";
        } else {
          const conflict = ["context_version_conflict", "candidate_item_already_removed", "job_context_already_removed"].includes(error.message);
          dialog.querySelector("[data-delete-error]").textContent = conflict ? "卡片已发生变化，请取消并刷新页面后重试。" : `无法删除：${personalErrorCopy(error)}`;
        }
      } finally {
        busy = false;
        toggle.disabled = cancel.disabled = confirm.disabled = false;
        dialog.removeAttribute("aria-busy");
        confirm.textContent = "确认删除";
        setEditing(editing);
      }
    });
    return { decorate(records) {
      grid.querySelectorAll(".v1-candidate-card").forEach((card, index) => {
        let wrapper = card.closest(".v1-job-tracked-card");
        if (!wrapper) { wrapper = document.createElement("article"); card.before(wrapper); wrapper.append(card); }
        wrapper.classList.add("v1-library-card");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "v1-detail-edit-button v1-detail-remove-button v1-library-delete";
        button.dataset.libraryDelete = "";
        button.textContent = "删除";
        button.setAttribute("aria-label", `删除${records[index].title}`);
        button.addEventListener("click", () => {
          if (!editing || busy) return;
          selected = records[index]; opener = button;
          dialog.querySelector("#library-delete-copy").textContent = selected.title;
          dialog.querySelector("[data-delete-error]").textContent = "";
          dialog.showModal();
        });
        wrapper.append(button);
      });
      setEditing(editing);
    } };
  }

  function candidateCardMarkup(item) {
    const facts = (item.facts || []).slice(0, 4).map((fact) => `<li>${escapeHtml(fact.value)}</li>`).join("");
    const canonical = item.data_class === "CANONICAL_CONFIRMED";
    const href = canonical ? `/candidate-detail.html?context=${encodeURIComponent(item.context_id)}&item=${encodeURIComponent(item.item_id)}` : `/candidate-detail.html?item=${encodeURIComponent(item.item_id)}`;
    const stateBadge = canonical ? "" : '<span class="v1-review-chip">待审核 · 演示</span>';
    return `<a class="v1-candidate-card" data-transition-key="candidate:${escapeHtml(item.item_id)}" href="${href}">
      <div class="v1-card-top"><span class="v1-type-chip">${escapeHtml(candidateTypeLabel(item))}</span>${stateBadge}</div>
      <h3>${escapeHtml(item.title)}</h3><p class="v1-card-subtitle">${escapeHtml(cardSubtitleText(item.subtitle, item.time))}</p>
      <p class="v1-card-summary">${escapeHtml(item.summary || "")}</p><ul>${facts}</ul>
    </a>`;
  }

  function personalGuideCardMarkup() {
    return `<a class="v1-add-guide-card personal" data-transition-key="personal-guide" href="/personal-import.html"><span class="v1-add-guide-icon" aria-hidden="true">＋</span><span><b>添加个人材料</b></span><p class="v1-guide-copy"><span>保存原件，或选择已存材料交给 AI 分析。</span><span aria-hidden="true">原件保存在工作区，发送模型前需确认</span></p></a>`;
  }

  async function localizedCandidateRecords(records) {
    const localizedById = new Map(Demo.CANDIDATE_FIXTURES.map((item) => [item.item_id, item]));
    return Promise.all(records.map(async (record) => {
      const localized = localizedById.get(record.item_id);
      if (!localized || (record.copy_locale === "zh-CN" && record.title === localized.title)) return record;
      const migrated = {
        ...Demo.clone(record),
        copy_locale: "zh-CN",
        title: localized.title,
        subtitle: localized.subtitle,
        source_refs: Demo.clone(localized.source_refs),
        updated_at: new Date().toISOString(),
      };
      await Demo.put(Demo.DEMO_STORES.candidates, migrated);
      return migrated;
    }));
  }

  async function readPersonalLibrary() {
    // A new Truth-only workspace need not have legacy demo stores. Their
    // absence must not prevent the authoritative library from rendering.
    const legacyDatabase = await Demo.openDatabase();
    let legacyRecords = [];
    try {
      if (legacyDatabase.objectStoreNames.contains(Demo.DEMO_STORES.candidates)) {
        legacyRecords = await LocalCandidateReview.getAll(legacyDatabase, Demo.DEMO_STORES.candidates);
      }
    } finally { legacyDatabase.close(); }
    let canonical = [];
    if (Truth && LocalCandidateReview) {
      const database = await Truth.openDatabase();
      const [revisionRecords, lifecycleRecords] = await Promise.all([
        LocalCandidateReview.getAll(database, "candidate_context_revisions"),
        LocalCandidateReview.getAll(database, "candidate_context_lifecycle"),
      ]);
      database.close();
      const revisions = LocalCandidateReview.activeConfirmedRevisions(revisionRecords, lifecycleRecords);
      canonical = revisions.flatMap((revision) => (revision.payload.items || []).map((item) => ({ ...item, context_id: revision.context_id, revision_id: revision.revision_id, data_class: "CANONICAL_CONFIRMED", review_status: "CONFIRMED", source_refs: item.grounding_refs || [] })));
    }
    return { canonical, legacy: legacyRecords };
  }

  async function renderPersonalLibrary() {
    const { canonical, legacy } = await readPersonalLibrary();
    const items = [...canonical, ...await localizedCandidateRecords(legacy)];
    const grid = byId("candidate-card-grid");
    grid.innerHTML = personalGuideCardMarkup() + items.map(candidateCardMarkup).join("");
    libraryEditor?.decorate(items);
    window.requestAnimationFrame(playPendingCardReturn);
  }

  function candidateRecords(sourceDocuments, proposals, runs, revisions, lifecycle, workingModels, workspaceAcceptances) {
    return {
      source_documents: sourceDocuments,
      context_proposals: proposals,
      processing_runs: runs,
      candidate_context_revisions: revisions,
      candidate_context_lifecycle: lifecycle,
      candidate_working_models: workingModels,
      candidate_workspace_acceptances: workspaceAcceptances,
    };
  }

  function modelSourceImportState(sourceId, records) {
    const proposals = (records.context_proposals || []).filter((proposal) => proposal.proposal_type === "CANDIDATE_CONTEXT"
      && proposal.payload?.contract_id === CandidateModel?.PAYLOAD_CONTRACT_ID
      && proposal.source_document_ids?.includes(sourceId));
    if (proposals.length) return "WORKSPACE";
    const runs = (records.processing_runs || []).filter((run) => run.source_document_id === sourceId && run.operation_type === "CANDIDATE_MODEL_STRUCTURING");
    if (runs.some((run) => run.status === "SUCCEEDED")) return "WORKSPACE";
    return runs.some((run) => run.status === "FAILED" || run.status === "CANCELLED") ? "RETRY" : "NEW";
  }

  async function readCandidateRecords(database) {
    const [sourceDocuments, proposals, runs, revisions, lifecycle, workingModels, workspaceAcceptances] = await Promise.all([
      LocalCandidateReview.getAll(database, "source_documents"),
      LocalCandidateReview.getAll(database, "context_proposals"),
      LocalCandidateReview.getAll(database, "processing_runs"),
      LocalCandidateReview.getAll(database, "candidate_context_revisions"),
      LocalCandidateReview.getAll(database, "candidate_context_lifecycle"),
      LocalCandidateReview.getAll(database, "candidate_working_models"),
      LocalCandidateReview.getAll(database, "candidate_workspace_acceptances"),
    ]);
    return candidateRecords(sourceDocuments, proposals, runs, revisions, lifecycle, workingModels, workspaceAcceptances);
  }

  async function persistCandidateWorkspaceAcceptance(database, workingModel) {
    const checked = Truth.validateCandidateWorkingModel(workingModel);
    const records = await readCandidateRecords(database);
    const contextId = `candidate-workspace-context-${checked.source_document_id}`;
    const currentRevision = records.candidate_context_revisions
      .filter((revision) => revision.context_id === contextId)
      .sort((left, right) => right.version - left.version)[0] || null;
    const proposals = records.context_proposals.filter((proposal) => checked.proposal_ids.includes(proposal.proposal_id));
    const acceptedAt = new Date().toISOString();
    const outcome = Truth.applyWorkspaceAcceptance({
      working_model: checked,
      proposals,
      current_revision: currentRevision,
      expected_revision_version: currentRevision?.version || 0,
      context_id: contextId,
      acceptance_id: `workspace-acceptance-${crypto.randomUUID()}`,
      revision_id: `candidate-workspace-revision-${crypto.randomUUID()}`,
      accepted_at: acceptedAt,
    });
    await Truth.persistWorkspaceAcceptance(database, outcome);
    return outcome;
  }

  function workingCardMarkup(item) {
    const stateClass = item.dedupe_state === "needs_resolution" ? " needs-resolution" : "";
    const stateLabel = item.dedupe_state === "needs_resolution" ? '<span class="v1-working-state needs-resolution">需要确认</span>' : "";
    return `<button class="v1-working-card${stateClass}" type="button" data-working-item="${escapeHtml(item.item_id)}"><span><small>${escapeHtml(candidateTypeLabel(item))}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml([item.subtitle, item.time].filter(Boolean).join(" · "))}</span></span>${stateLabel}<span class="v1-working-chevron" aria-hidden="true">›</span></button>`;
  }

  function candidateWorkingGroupsMarkup(cards) {
    const groupOrder = ["work_experience", "project", "education", "skill_group", "award", "custom_section"];
    const grouped = new Map(groupOrder.map((key) => [key, []]));
    cards.forEach((card) => (grouped.get(card.item_subtype) || grouped.get("custom_section")).push(card));
    return [...grouped.entries()].filter(([, items]) => items.length).map(([type, items]) => `<section class="v1-working-group"><h3>${escapeHtml(subtypeLabels[type] || "其他经历")}</h3>${items.map(workingCardMarkup).join("")}</section>`).join("") || '<p class="v1-conversation-empty">模型未发现可形成 Working Card 的候选信息。</p>';
  }

  function latestCandidateWorkingModel(records, sourceId) {
    return (records.candidate_working_models || []).filter((model) => model.source_document_id === sourceId).sort((left, right) => right.version - left.version)[0] || null;
  }

  async function candidateWorkingModelForDetail(database, sourceId, itemId, canonicalRevision) {
    const models = await LocalCandidateReview.getAll(database, "candidate_working_models");
    const head = models.map(Truth.validateCandidateWorkingModel)
      .filter((model) => model.source_document_id === sourceId)
      .sort((left, right) => right.version - left.version || String(right.created_at || "").localeCompare(String(left.created_at || "")))[0] || null;
    const synchronized = await CandidateModel.synchronizedCandidateWorkingModel(head, canonicalRevision, itemId, sourceId);
    if (synchronized.working_model_id !== head?.working_model_id) await Truth.persistCandidateWorkingModel(database, synchronized);
    return synchronized;
  }

  function setCandidateWorkspaceProgress(steps, currentIndex = steps.length - 1) {
    ModelWorkspaceUI.renderProgress(byId("candidate-understanding-events"), steps, currentIndex);
  }

  function beginCandidateWorkspaceView() {
    candidateWorkspaceViewIntent = "workspace";
    candidateWorkspaceViewGeneration += 1;
    return candidateWorkspaceViewGeneration;
  }

  function workspaceViewIsCurrent(generation) {
    return candidateWorkspaceViewIntent === "workspace" && generation === candidateWorkspaceViewGeneration;
  }

  const normalizedDisplayValue = (value) => String(value || "").trim().toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

  function renderCandidateWorkspaceConversation() {
    const target = byId("candidate-workspace-conversation");
    if (!target) return;
    ConversationUI.renderMessages(target, candidateWorkspaceConversation, { empty_text: "可以讨论资料，也可以直接要求修改。支持结合上文说明范围与例外；修改先保留在草稿，核对后由你保存。", text_for: (message) => ConversationUI.humanSafeText(message.text ?? message.content) });
    window.AriadnePersonalMemoryBridge?.attachActions(target, candidateWorkspaceConversation, { type: "CANDIDATE", conversation_id: activeCandidateConversationSession?.conversation_id || null });
  }

  function setCandidateConversationExecutionState(copy = "", active = candidateConversationTurnActive) {
    ConversationUI.setExecutionState({ form: byId("candidate-workspace-composer"), status: byId("candidate-workspace-conversation-status"), active, copy });
  }

  async function restoreCandidateWorkspaceConversation(sourceId) {
    if (!CandidateWorkspaceConversationRuntime || !CandidateConversationPersistence) throw new Error("candidate_conversation_runtime_dependencies_unavailable");
    const database = await Truth.openDatabase();
    try {
      const session = await CandidateWorkspaceConversationRuntime.resolveSession(database, sourceId);
      const restored = await CandidateConversationPersistence.restoreConversation(database, session.conversation_id);
      activeCandidateConversationSession = restored.session;
      window.AriadneRuntimeSelection?.bind("candidate-workspace-composer", "candidate_conversation", restored.session.conversation_id);
      candidateWorkspaceConversation = restored.messages;
      renderCandidateWorkspaceConversation();
      const hasActiveTurn = restored.turns.some((turn) => CandidateConversationPersistence.ACTIVE_STATES.includes(turn.state));
      setCandidateConversationExecutionState(hasActiveTurn ? "正在理解…" : "", candidateConversationTurnActive || hasActiveTurn);
      return restored;
    } finally { database.close(); }
  }

  function showCandidateWorkspaceLayer(sourceName, processing = false) {
    const workspace = candidateSharedWorkspace();
    byId("candidate-card-detail").classList.add("hidden");
    const previousFocus = ProductShell.showWorkspace(workspace, { source_name: sourceName || "当前材料", processing, model_workspace_ui: ModelWorkspaceUI, embedded: isEmbeddedDetail });
    if (previousFocus) candidateWorkspacePreviousFocus = previousFocus;
  }

  function renderCandidateWorkspaceCardDetail(itemId) {
    const item = activeCandidateWorkingModel?.payload?.items?.find((entry) => entry.item_id === itemId);
    if (!item) return;
    activeCandidateWorkspaceItemId = itemId;
    byId("candidate-ai-workspace").querySelector(".v1-workspace-content-pane")?.classList.add("is-detail");
    byId("candidate-card-list").classList.add("hidden");
    byId("candidate-card-detail").classList.remove("hidden");
    byId("candidate-card-read").classList.remove("hidden");
    byId("candidate-card-edit").classList.remove("hidden");
    byId("candidate-card-edit-form").classList.add("hidden");
    byId("candidate-card-edit-form").setAttribute("aria-hidden", "true");
    candidateWorkspaceEditDirty = false;
    byId("candidate-card-detail-kind").textContent = candidateTypeLabel(item);
    byId("candidate-card-detail-title").textContent = item.title;
    byId("candidate-card-detail-meta").textContent = [item.subtitle ? `副标题：${item.subtitle}` : "", item.time ? `时间：${item.time}` : ""].filter(Boolean).join(" · ");
    byId("candidate-card-detail-summary").textContent = `摘要：${item.summary || "暂无摘要"}`;
    const visibleFacts = (item.facts || []).filter((fact) => normalizedDisplayValue(fact.value));
    const descriptors = CandidateConversation ? CandidateConversation.candidateFieldDescriptors(item) : [];
    byId("candidate-card-detail-facts").innerHTML = visibleFacts.map((fact) => {
      const descriptor = descriptors.find((entry) => entry.storage_target.kind === "FACT" && entry.storage_target.fact_id === fact.fact_id);
      const label = descriptor?.canonical_display_label || candidateWorkspaceFactLabel(fact.label);
      return `<div><small>${escapeHtml(label)}</small><p>${escapeHtml(fact.value)}</p></div>`;
    }).join("") || "<p>暂无现有信息</p>";
  }

  async function openCandidateWorkspaceCardDetail(itemId) {
    const sourceId = activeCandidateWorkingModel?.source_document_id;
    const viewGeneration = candidateWorkspaceViewGeneration;
    if (!sourceId || !workspaceViewIsCurrent(viewGeneration)) return;
    const database = await Truth.openDatabase();
    let durableHead;
    try { durableHead = await CandidateWorkspaceConversationRuntime.latestWorkingModel(database, sourceId); }
    finally { database.close(); }
    if (!workspaceViewIsCurrent(viewGeneration)) return;
    activeCandidateWorkingModel = durableHead;
    byId("candidate-working-groups").innerHTML = candidateWorkingGroupsMarkup(durableHead.payload.items || []);
    if ((durableHead.payload.items || []).some((item) => item.item_id === itemId)) renderCandidateWorkspaceCardDetail(itemId);
    else returnToCandidateCardList();
  }

  async function renderLatestCandidateWorkspaceSurface(sourceId, durableHead, viewGeneration) {
    if (!workspaceViewIsCurrent(viewGeneration)) return;
    activeCandidateWorkingModel = durableHead;
    candidateClarifications?.update(durableHead, candidateClarificationSources);
    const detailItemId = activeCandidateWorkspaceItemId;
    if (detailItemId === null) {
      await renderCandidateWorkingWorkspace(sourceId, { workingModel: durableHead, viewGeneration });
      return;
    }
    byId("candidate-working-groups").innerHTML = candidateWorkingGroupsMarkup(durableHead.payload.items || []);
    if ((durableHead.payload.items || []).some((item) => item.item_id === detailItemId)) renderCandidateWorkspaceCardDetail(detailItemId);
    else returnToCandidateCardList();
  }

  async function renderCandidateWorkingWorkspace(sourceId, options = {}) {
    const workspace = byId("candidate-ai-workspace");
    if (!workspace || !sourceId) return [];
    const viewGeneration = options.viewGeneration ?? beginCandidateWorkspaceView();
    if (!workspaceViewIsCurrent(viewGeneration)) return [];
    const database = await Truth.openDatabase();
    let records;
    try { records = await readCandidateRecords(database); } finally { database.close(); }
    const source = records.source_documents.find((record) => record.source_document_id === sourceId);
    const workingModel = options.workingModel || latestCandidateWorkingModel(records, sourceId);
    if (!workingModel) throw new Error("candidate_working_model_missing");
    activeCandidateWorkingModel = Truth.validateCandidateWorkingModel(workingModel);
    const cards = activeCandidateWorkingModel.payload.items || [];
    await restoreCandidateWorkspaceConversation(sourceId);
    if (!workspaceViewIsCurrent(viewGeneration)) return [];
    showCandidateWorkspaceLayer(source?.filename || "当前材料", false);
    byId("candidate-working-groups").innerHTML = candidateWorkingGroupsMarkup(cards);
    setCandidateWorkspaceProgress(["材料已准备", candidateSourceReadLabel(source), "模型已完成理解", `已生成 ${cards.length} 张候选卡片`]);
    candidateClarificationSources = records.source_documents;
    candidateClarifications?.update(activeCandidateWorkingModel, candidateClarificationSources);
    const accepted = records.candidate_workspace_acceptances.some((event) => event.working_model_id === activeCandidateWorkingModel.working_model_id);
    byId("candidate-workspace-save").disabled = !cards.length || accepted;
    byId("candidate-workspace-save-status").textContent = accepted ? "这版候选人信息已保存。" : "";
    renderCandidateWorkspaceConversation();
    byId("candidate-review-surface").classList.add("hidden");
    return cards;
  }

  function enterCandidateWorkspaceEdit() {
    if (candidateConversationTurnActive) return;
    const item = activeCandidateWorkingModel?.payload?.items?.find((entry) => entry.item_id === activeCandidateWorkspaceItemId);
    if (!item) return;
    byId("candidate-working-edit-title").value = item.title || "";
    byId("candidate-working-edit-category").value = item.category || "";
    byId("candidate-working-edit-subtitle").value = item.subtitle || "";
    byId("candidate-working-edit-time").value = item.time || "";
    byId("candidate-working-edit-summary").value = item.summary || "";
    byId("candidate-working-edit-facts").value = (item.facts || []).map((fact) => fact.value).join("\n");
    byId("candidate-card-read").classList.add("hidden");
    byId("candidate-card-edit").classList.add("hidden");
    byId("candidate-card-edit-form").classList.remove("hidden");
    byId("candidate-card-edit-form").setAttribute("aria-hidden", "false");
    byId("candidate-workspace-save").dataset.beforeEditDisabled = String(byId("candidate-workspace-save").disabled);
    byId("candidate-workspace-save").disabled = true;
    byId("candidate-workspace-save-status").textContent = "";
    candidateWorkspaceEditDirty = false;
    byId("candidate-working-edit-title").focus();
  }

  function cancelCandidateWorkspaceEdit() {
    const wasDisabled = byId("candidate-workspace-save").dataset.beforeEditDisabled === "true";
    renderCandidateWorkspaceCardDetail(activeCandidateWorkspaceItemId);
    byId("candidate-workspace-save").disabled = wasDisabled;
    byId("candidate-workspace-save-status").textContent = wasDisabled ? "这版候选人信息已保存。" : "";
  }

  function requireCandidateWorkspaceTitle() {
    const titleInput = byId("candidate-working-edit-title");
    if (titleInput.value.trim()) {
      titleInput.removeAttribute("aria-invalid");
      return true;
    }
    titleInput.setAttribute("aria-invalid", "true");
    const dialog = byId("candidate-card-title-required-dialog");
    if (!dialog.open) dialog.showModal();
    return false;
  }

  async function persistCandidateWorkspaceEdit() {
    if (byId("candidate-card-edit-form").classList.contains("hidden")) return activeCandidateWorkingModel;
    if (!requireCandidateWorkspaceTitle()) return null;
    const next = await CandidateModel.editedCandidateWorkingModel(activeCandidateWorkingModel, activeCandidateWorkspaceItemId, {
      title: byId("candidate-working-edit-title").value,
      category: byId("candidate-working-edit-category").value,
      subtitle: byId("candidate-working-edit-subtitle").value,
      time: byId("candidate-working-edit-time").value,
      summary: byId("candidate-working-edit-summary").value,
      facts: byId("candidate-working-edit-facts").value.split("\n").map((value) => value.trim()).filter(Boolean),
    });
    const database = await Truth.openDatabase();
    try { await Truth.persistCandidateWorkingModel(database, next); }
    finally { database.close(); }
    activeCandidateWorkingModel = next;
    candidateWorkspaceEditDirty = false;
    await renderCandidateWorkingWorkspace(next.source_document_id, { workingModel: next, viewGeneration: candidateWorkspaceViewGeneration });
    renderCandidateWorkspaceCardDetail(activeCandidateWorkspaceItemId);
    return next;
  }

  async function callCandidateConversationRuntime(request, { includeAttachments = true } = {}) {
    const signatureResponse = await (globalThis.AriadneTransport || globalThis).fetch("/api/candidate-conversation-runtime-signature", { cache: "no-store" });
    const signaturePayload = await signatureResponse.json().catch(() => null);
    const frontendSignature = CandidateWorkspaceConversationRuntime.runtimeSignature();
    const backendSignature = signaturePayload?.runtime_signature;
    if (!signatureResponse.ok || !CandidateWorkspaceConversationRuntime.runtimeSignaturesMatch(frontendSignature, backendSignature)) {
      const error = new Error("RUNTIME_CONTRACT_VERSION_MISMATCH");
      error.code = "RUNTIME_CONTRACT_VERSION_MISMATCH";
      error.failure_layer = "runtime";
      error.network_call_made = false;
      error.diagnostics = {
        stage: "RUNTIME_SIGNATURE",
        error_code: "RUNTIME_CONTRACT_VERSION_MISMATCH",
        provider_called: false,
        provider_response_received: false,
        json_parse_passed: false,
        semantic_schema_passed: false,
        resolution_passed: false,
        canonical_schema_passed: false,
        semantic_guard_passed: false,
        persistence_reached: false,
        runtime_signature_compatible: false,
        frontend_contract_version: frontendSignature.runtime_result_contract_version,
        backend_contract_version: typeof backendSignature?.runtime_result_contract_version === "string" ? backendSignature.runtime_result_contract_version : "unavailable",
      };
      throw error;
    }
    const transport = window.AriadneConversationTurnTransport;
    if (!transport) throw new Error("CONVERSATION_TURN_TRANSPORT_UNAVAILABLE");
    return transport.execute({ request, domain: "CANDIDATE", endpoint: "/api/candidate-conversation-turn",
      fallback_error: "CANDIDATE_CONVERSATION_FAILED", include_attachments: includeAttachments,
      create_error: ({ result }) => {
      const error = new Error(result.error || "CANDIDATE_CONVERSATION_FAILED");
      error.code = result.error || "CANDIDATE_CONVERSATION_FAILED";
      error.failure_layer = result.failure_layer || "runtime";
      error.network_call_made = result.network_call_made === true;
      error.diagnostics = result.diagnostics;
      return error;
    } });
  }

  async function submitCandidateWorkspaceConversation(content, options = {}) {
    const humanMessage = String(content || "").trim();
    if (!humanMessage || !activeCandidateWorkingModel || candidateConversationTurnActive) return;
    if (!CandidateWorkspaceConversationRuntime || !CandidateConversationPersistence) throw new Error("candidate_conversation_runtime_dependencies_unavailable");
    const sourceId = activeCandidateWorkingModel.source_document_id;
    const viewGeneration = candidateWorkspaceViewGeneration;
    const focus = options.focus || (activeCandidateWorkspaceItemId === null
      ? Object.freeze({ type: "CANDIDATE" })
      : Object.freeze({ type: "ITEM", item_id: activeCandidateWorkspaceItemId }));
    let terminalCopy = "";
    let database = null;
    const modelSelectionVersion = window.AriadneRuntimeSelection?.version();
    candidateConversationTurnActive = true;
    setCandidateConversationExecutionState("正在理解…", true);
    await ConversationUI.waitForIndicatorPaint();
    try {
      database = await Truth.openDatabase();
      const session = activeCandidateConversationSession?.source_document_id === sourceId
        ? activeCandidateConversationSession
        : await CandidateWorkspaceConversationRuntime.resolveSession(database, sourceId);
      activeCandidateConversationSession = session;
      if (window.AriadneRuntimeSelection?.version() !== modelSelectionVersion) throw new Error("RUNTIME_SELECTION_CHANGED");
      const snapshot = CandidateWorkspaceConversationRuntime.createRuntimeSnapshot({ scope: session.conversation_id });
      const outcome = await CandidateWorkspaceConversationRuntime.executeListTurn({
        database,
        session,
        human_message: humanMessage,
        focus,
        runtime_snapshot: snapshot,
        call_runtime: options.clarification
          ? (request) => window.AriadneCandidateClarifications.runBoundAnswer(options.clarification, request,
            (boundRequest) => callCandidateConversationRuntime(boundRequest, { includeAttachments: false }))
          : callCandidateConversationRuntime,
        on_user_persisted: async () => {
          const restored = await CandidateConversationPersistence.restoreConversation(database, session.conversation_id);
          if (!workspaceViewIsCurrent(viewGeneration)) return;
          candidateWorkspaceConversation = restored.messages;
          renderCandidateWorkspaceConversation();
        },
      });
      const restored = await CandidateConversationPersistence.restoreConversation(database, session.conversation_id);
      if (!workspaceViewIsCurrent(viewGeneration)) return outcome;
      candidateWorkspaceConversation = restored.messages;
      renderCandidateWorkspaceConversation();
      if (outcome.status === "STALE") {
        terminalCopy = "候选人信息已发生变化，请基于最新内容重试。";
        await renderLatestCandidateWorkspaceSurface(sourceId, outcome.working_model, viewGeneration);
        return outcome;
      }
      const durableHead = await CandidateWorkspaceConversationRuntime.latestWorkingModel(database, sourceId);
      await renderLatestCandidateWorkspaceSurface(sourceId, durableHead, viewGeneration);
      return outcome;
    } catch (error) {
      const failureCode = String(error?.code || error?.message);
      terminalCopy = window.AriadneRuntimeSelection?.errorCopy(error) || (failureCode === "STALE_WORKING_OBSERVATION"
        ? "候选人信息已发生变化，请基于最新内容重试。"
        : failureCode === "FOCUS_VIOLATION"
          ? "这个请求超出了当前卡片范围；候选人信息未修改。"
          : failureCode === "RUNTIME_CONTRACT_VERSION_MISMATCH"
            ? "服务版本已更新，请刷新页面后重试。"
            : failureCode === "EMPTY_RESPONSE"
              ? "模型这次没有返回可用内容，请重试。"
          : "这次没有完成，请重试。");
      if (database && activeCandidateConversationSession?.conversation_id) {
        try {
          const restored = await CandidateConversationPersistence.restoreConversation(database, activeCandidateConversationSession.conversation_id);
          if (workspaceViewIsCurrent(viewGeneration)) {
            candidateWorkspaceConversation = restored.messages;
            renderCandidateWorkspaceConversation();
            const durableHead = await CandidateWorkspaceConversationRuntime.latestWorkingModel(database, sourceId);
            await renderLatestCandidateWorkspaceSurface(sourceId, durableHead, viewGeneration);
          }
        } catch (_restoreError) { /* Preserve the safe failure copy. */ }
      }
      return { status: failureCode === "STALE_WORKING_OBSERVATION" ? "STALE" : "FAILED", message: terminalCopy };
    } finally {
      database?.close?.();
      candidateConversationTurnActive = false;
      if (workspaceViewIsCurrent(viewGeneration)) {
        setCandidateConversationExecutionState(terminalCopy, false);
        ConversationUI.settle({ form: byId("candidate-workspace-composer"), messages: byId("candidate-workspace-conversation") });
      }
    }
  }

  function renderCandidateDetailConversation(messages) {
    ConversationUI.renderMessages(byId("candidate-conversation-messages"), messages || [], {
      empty_text: "",
      text_for: (message) => ConversationUI.humanSafeText(message.text ?? message.content),
    });
    window.AriadnePersonalMemoryBridge?.attachActions(byId("candidate-conversation-messages"), messages || [], { type: "CANDIDATE_DETAIL", item_id: activeCandidate?.item_id || null });
  }

  async function restoreCandidateDetailConversation(database, conversationId, at = new Date().toISOString()) {
    let restored = await CandidateConversationPersistence.restoreConversation(database, conversationId);
    const expired = restored.turns.filter((turn) => CandidateConversationPersistence.ACTIVE_STATES.includes(turn.state)
      && Date.parse(at) - Date.parse(turn.updated_at) > 300000);
    for (const turn of expired) {
      try {
        await CandidateConversationPersistence.persistFailedTurn(database, {
          ...turn, state: "FAILED", updated_at: at, failure_code: "INTERRUPTED_TURN_EXPIRED",
          state_history: [...turn.state_history, { state: "FAILED", at }],
        });
      } catch (error) {
        if (error.code !== "TURN_NOT_ACTIVE") throw error;
      }
    }
    if (expired.length) restored = await CandidateConversationPersistence.restoreConversation(database, conversationId);
    return restored;
  }

  function setCandidateDetailConversationExecutionState(copy = "", active = candidateDetailConversationTurnActive) {
    ConversationUI.setExecutionState({
      form: byId("candidate-conversation-form"),
      status: byId("candidate-conversation-status"),
      active,
      copy,
    });
  }

  async function submitCandidateDetailConversation({ sourceId, itemId, canonicalRevision, content }) {
    const humanMessage = String(content || "").trim();
    if (!humanMessage || !sourceId || !itemId || candidateDetailConversationTurnActive) return;
    if (!CandidateWorkspaceConversationRuntime || !CandidateConversationPersistence) throw new Error("candidate_conversation_runtime_dependencies_unavailable");
    let terminalCopy = "";
    let database = null;
    const modelSelectionVersion = window.AriadneRuntimeSelection?.version();
    candidateDetailConversationTurnActive = true;
    setCandidateDetailConversationExecutionState("正在理解…", true);
    await ConversationUI.waitForIndicatorPaint();
    try {
      database = await Truth.openDatabase();
      const workingModel = await candidateWorkingModelForDetail(database, sourceId, itemId, canonicalRevision);
      const session = await CandidateWorkspaceConversationRuntime.resolveSession(database, sourceId);
      activeCandidateConversationSession = session;
      activeCandidateWorkingModel = workingModel;
      if (window.AriadneRuntimeSelection?.version() !== modelSelectionVersion) throw new Error("RUNTIME_SELECTION_CHANGED");
      const snapshot = CandidateWorkspaceConversationRuntime.createRuntimeSnapshot({ scope: session.conversation_id });
      const outcome = await CandidateWorkspaceConversationRuntime.executeListTurn({
        database,
        session,
        human_message: humanMessage,
        focus: Object.freeze({ type: "ITEM", item_id: itemId }),
        runtime_snapshot: snapshot,
        call_runtime: callCandidateConversationRuntime,
        on_user_persisted: async () => {
          const restored = await CandidateConversationPersistence.restoreConversation(database, session.conversation_id);
          renderCandidateDetailConversation(restored.messages);
        },
      });
      const restored = await CandidateConversationPersistence.restoreConversation(database, session.conversation_id);
      renderCandidateDetailConversation(restored.messages);
      activeCandidateWorkingModel = outcome.working_model || await CandidateWorkspaceConversationRuntime.latestWorkingModel(database, sourceId);
      const workingItem = activeCandidateWorkingModel.payload.items.find((item) => item.item_id === itemId);
      const resultType = outcome.action?.normalized_action?.action || "UNKNOWN";
      const proposalCreated = resultType === "PATCH_ITEM" && Boolean(workingItem);
      const form = byId("candidate-conversation-form");
      form.dataset.ariadneResultType = resultType;
      form.dataset.ariadneWorkingProposalCreated = proposalCreated ? "yes" : "no";
      form.dataset.ariadneConfirmedMutationBeforeSave = "no";
      if (proposalCreated) {
        showCandidateDetailWorkingProposal(activeCandidate, workingItem, outcome.assistant_message?.text);
      }
      if (outcome.status === "STALE") terminalCopy = "候选人信息已发生变化，请刷新后重试。";
      return outcome;
    } catch (error) {
      const code = String(error?.code || error?.message || "");
      terminalCopy = window.AriadneRuntimeSelection?.errorCopy(error) || (code === "RUNTIME_CONTRACT_VERSION_MISMATCH"
        ? "服务版本已更新，请刷新页面后重试。"
        : code === "EMPTY_RESPONSE"
          ? "模型这次没有返回可用内容，请重试。"
          : "这次没有完成，请重试。");
      if (database && activeCandidateConversationSession?.conversation_id) {
        try {
          const restored = await CandidateConversationPersistence.restoreConversation(database, activeCandidateConversationSession.conversation_id);
          renderCandidateDetailConversation(restored.messages);
        } catch (_restoreError) { /* Preserve the bounded failure copy. */ }
      }
      return null;
    } finally {
      database?.close?.();
      candidateDetailConversationTurnActive = false;
      setCandidateDetailConversationExecutionState(terminalCopy, false);
      ConversationUI.settle({ form: byId("candidate-conversation-form"), messages: byId("candidate-conversation-messages") });
    }
  }

  function returnToCandidateCardList() {
    byId("candidate-card-detail").classList.add("hidden");
    byId("candidate-card-list").classList.remove("hidden");
    byId("candidate-ai-workspace").querySelector(".v1-workspace-content-pane")?.classList.remove("is-detail");
    activeCandidateWorkspaceItemId = null;
    candidateWorkspaceEditDirty = false;
  }

  function requestCandidateCardBack() {
    const editOpen = !byId("candidate-card-edit-form").classList.contains("hidden");
    if (!editOpen) return returnToCandidateCardList();
    if (!candidateWorkspaceEditDirty) return cancelCandidateWorkspaceEdit();
    if (!requireCandidateWorkspaceTitle()) return undefined;
    const dialog = byId("candidate-card-unsaved-dialog");
    if (!dialog.open) dialog.showModal();
    return undefined;
  }

  function closeCandidateWorkspaceLayer(destination = "import") {
    candidateWorkspaceViewIntent = destination;
    candidateWorkspaceViewGeneration += 1;
    ProductShell.hideWorkspace(candidateSharedWorkspace(), { embedded: isEmbeddedDetail, restore_focus: destination === "profile" ? null : candidateWorkspacePreviousFocus });
    activeCandidateWorkspaceItemId = null;
    candidateWorkspaceEditDirty = false;
    if (destination === "profile") {
      if (!completeEmbeddedImport("personal", "personal-guide")) window.location.assign("/personal-information.html");
      return;
    }
  }

  function requestCandidateWorkspaceExit(destination) {
    const editOpen = !byId("candidate-card-edit-form").classList.contains("hidden");
    if (!editOpen || !candidateWorkspaceEditDirty) return closeCandidateWorkspaceLayer(destination);
    if (!requireCandidateWorkspaceTitle()) return undefined;
    candidateWorkspaceExitIntent = destination;
    const dialog = byId("candidate-workspace-close-dialog");
    if (!dialog.open) dialog.showModal();
    return undefined;
  }

  async function saveCandidateWorkspaceToProfile() {
    if (!byId("candidate-card-edit-form").classList.contains("hidden")) return;
    const workingModel = Truth.validateCandidateWorkingModel(activeCandidateWorkingModel);
    const database = await Truth.openDatabase();
    try {
      await persistCandidateWorkspaceAcceptance(database, workingModel);
      ProductShell.setFeedback(byId("candidate-workspace-save-status"), { state: "SUCCESS", copy: "已保存到个人资料。" });
      byId("candidate-workspace-save").disabled = true;
    } catch (error) {
      if (["candidate_working_model_stale", "context_version_conflict"].includes(String(error?.code || error?.message))) {
        ProductShell.setFeedback(byId("candidate-workspace-save-status"), { state: "FAILURE", copy: "内容已更新，请重新查看后再保存。" });
        return;
      }
      throw error;
    } finally { database.close(); }
    await delay(360);
    closeCandidateWorkspaceLayer("profile");
  }

  async function renderSavedSources(kind) {
    const section = byId(`saved-${kind}-sources`);
    if (!section) return;
    const database = await Truth.openDatabase();
    let records;
    try { records = await (kind === "candidate" ? LocalCandidateReview : JobContext).getAll(database, "source_documents"); }
    finally { database.close(); }
    // Candidate analysis still operates on one document; Job restores an ordered bundle.
    const options = RawSource.archiveOptions(kind === "candidate" ? records.filter(record => record.contract_id !== RawSource.ARCHIVE_CONTRACT) : records, kind === "candidate" ? "CANDIDATE" : "JOB");
    const select = byId(`saved-${kind}-source-select`);
    const previous = select.value;
    select.innerHTML = '<option value="">选择已保存的原件</option>' + options.map(option => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>`).join("");
    if (options.some(option => option.id === previous)) select.value = previous;
    section.classList.toggle("hidden", !options.length);
  }

  async function renderSavedCandidatePdfSources() { return renderSavedSources("candidate"); }

  async function selectSavedCandidatePdf(sourceId) {
    const selectionVersion = ++candidateSelectionVersion;
    const database = await Truth.openDatabase();
    let restoredWorkingModel = null;
    try {
      const { sources: [resolved] } = await RawSource.resolveArchive(database, sourceId, "CANDIDATE");
      const sourceDocument = resolved.source_document;
      const records = await readCandidateRecords(database);
      if (selectionVersion !== candidateSelectionVersion) return;
      restoredWorkingModel = latestCandidateWorkingModel(records, sourceId);
      selectedCandidateSources = [{
        file: resolved.file, mime_type: sourceDocument.mime_type, source_type: sourceDocument.source_type,
        content_hash: sourceDocument.content_hash, source_document_id: sourceDocument.source_document_id,
        batch_id: `batch-candidate-${crypto.randomUUID()}`, import_state: modelSourceImportState(sourceId, records),
      }];
    } finally { database.close(); }
    closeCandidateWorkspaceLayer("import");
    setCompletedSourceSheet(false);
    activeCandidateWorkingModel = restoredWorkingModel ? Truth.validateCandidateWorkingModel(restoredWorkingModel) : null;
    candidateExecutionState = activeCandidateWorkingModel ? "COMPLETE" : "ARCHIVED";
    byId("personal-page-message").textContent = "已恢复原件；尚未发起新的分析。";
    byId("personal-page-message").classList.remove("error");
    showCandidateSource(selectedCandidateSources[0]);
    await renderAwaitingCandidateReviews({ reset: true, sourceIds: [sourceId] });
  }

  async function selectSavedJobSources(archiveId) {
    const selectionVersion = ++jobSelectionVersion;
    const database = await Truth.openDatabase();
    let restored;
    try {
      restored = await RawSource.resolveArchive(database, archiveId, "JOB");
      const modelMode = currentAriadneMode() === "model";
      const sources = [];
      for (const resolved of restored.sources) {
        const document = resolved.source_document;
        sources.push({ file: resolved.file, name: document.filename, size: resolved.file.size,
          mime_type: document.mime_type, source_type: document.source_type, content_hash: document.content_hash,
          source_document_id: document.source_document_id, source_url: restored.source_url, captured_via: document.provenance?.captured_via || "JOB_FILE_PICKER",
          batch_id: document.batch_id, import_type: "Document", sizeLabel: formatBytes(resolved.file.size),
          import_state: await jobSourceImportState(document.source_document_id, database, modelMode) });
      }
      if (selectionVersion !== jobSelectionVersion) return;
      configureJobImportType("Document");
      selectedJobSources = sources;
      byId("job-link-input").value = restored.source_url || "";
    } finally { database.close(); }
    jobModelConsentBundle = null;
    const restoredVersion = jobSelectionVersion;
    const working = currentAriadneMode() === "model" && Boolean(await savedModelJobProposalForSource(selectedJobSources[0]?.source_document_id));
    if (restoredVersion !== jobSelectionVersion) return;
    beginJobImportLifecycle(working ? ModelImportLifecycle.STATES.WORKING : ModelImportLifecycle.STATES.SOURCE_STORED);
    showJobSource(selectedJobSources[0]);
    byId("job-page-message").textContent = "已按保存顺序恢复原件和职位链接；尚未发起新的分析。";
    byId("job-page-message").classList.remove("error");
  }

  function proposalItemEditor(item, index, fallbackRefs) {
    const evidence = (item.grounding_refs || fallbackRefs || [])[0];
    return `<section class="v1-review-item" data-review-item="${index}"><div class="v1-review-source"><p class="v1-section-label">原文</p><p class="v1-review-evidence">${escapeHtml(evidence?.excerpt_or_reference || "无可用结构化摘录")}</p><small>${escapeHtml(evidence?.location || "来源位置待人工核对")}</small></div><div class="v1-review-result"><p class="v1-section-label">提取结果</p><label>标题<input data-field="title" value="${escapeHtml(item.title || "")}"></label><label>组织 / 副标题<input data-field="subtitle" value="${escapeHtml(item.subtitle || "")}"></label><label>日期<input data-field="time" value="${escapeHtml(item.time || "")}"></label><label>摘要<textarea data-field="summary">${escapeHtml(item.summary || "")}</textarea></label><label>事实（每行一条）<textarea data-field="facts">${escapeHtml((item.facts || []).map((fact) => fact.value).join("\n"))}</textarea></label></div></section>`;
  }

  function humanReviewNotices(codes) {
    const messages = (codes || []).map((code) => {
      if (String(code).startsWith("selective_ocr_pages")) return "部分页面经过本地 OCR，请对照原文核对。";
      if (code === "missing_date") return "日期信息不完整，可留空或人工补充。";
      if (code === "ambiguous_company_or_title") return "组织与职位边界不明确，请人工核对。";
      if (code === "no_highlights_detected") return "未识别到明确的经历要点。";
      if (String(code).startsWith("self_reported_")) return "该内容来自材料自述，确认前请核对。";
      return "部分字段需要人工核对。";
    });
    return [...new Set(messages)];
  }

  function proposalReviewMarkup(proposal, position, total) {
    const items = proposal.payload.items?.length ? proposal.payload.items : [{ item_id: `user-item-${proposal.proposal_id}`, item_type: "OTHER", title: "", subtitle: null, time: null, facts: [], grounding_refs: proposal.grounding_refs, warnings: [], uncertainties: [], review_status: "NEEDS_REVIEW" }];
    const warnings = [...(proposal.warnings || []), ...items.flatMap((item) => item.warnings || [])];
    const notices = humanReviewNotices(warnings);
    const materialLabel = materialTypeLabels[proposal.payload.candidate_material_type] || "个人材料";
    const modelProposal = proposal.payload.contract_id === CandidateModel?.PAYLOAD_CONTRACT_ID;
    const sourceKind = modelProposal ? "模型提案" : "本地确定规则";
    return `<article class="v1-review-card" data-proposal-id="${escapeHtml(proposal.proposal_id)}"><p class="v1-review-progress">第 ${position} / ${total} 条</p><h3>${escapeHtml(candidateTypeLabel(items[0]))} · ${escapeHtml(materialLabel)}</h3><p class="v1-review-note">来源：${escapeHtml(proposal.source_label || "本地文件")} · ${sourceKind}${proposal.payload.manual_review_required ? " · 需要人工核对" : ""}</p>${notices.length ? `<p class="v1-review-warning">${escapeHtml(notices.join(" "))}</p>` : ""}${items.map((item, index) => proposalItemEditor(item, index, proposal.grounding_refs)).join("")}<p class="v1-review-note">确认会保存当前字段；如字段经过修改，系统会在内部记录为用户编辑。原始提案始终保留。</p><div class="v1-button-row"><button type="button" class="v1-primary-button" data-review-action="confirm">确认</button><button type="button" class="v1-tertiary-button" data-review-action="reject">拒绝</button></div></article>`;
  }

  async function renderAwaitingCandidateReviews({ advance = false, reset = false, sourceIds } = {}) {
    if (!LocalCandidateReview || !byId("candidate-review-surface")) return;
    if (sourceIds !== undefined) candidateReviewSourceIds = [...new Set(sourceIds || [])];
    const database = await Truth.openDatabase();
    let proposals;
    try {
      const sources = await LocalCandidateReview.getAll(database, "source_documents");
      const sourceById = new Map(sources.map((source) => [source.source_document_id, source]));
      let proposalRecords = await LocalCandidateReview.getAll(database, "context_proposals");
      proposalRecords = await LocalCandidateReview.ensureItemProposalQueue(database, proposalRecords);
      const reviewContracts = new Set(["ariadne-local-candidate-proposal-payload-v1"]);
      proposals = proposalRecords.filter((proposal) => candidateReviewSourceIds.length && proposal.proposal_type === "CANDIDATE_CONTEXT" && proposal.status === "AWAITING_REVIEW" && reviewContracts.has(proposal.payload?.contract_id) && proposal.source_document_ids?.some((sourceId) => candidateReviewSourceIds.includes(sourceId))).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.proposal_id.localeCompare(b.proposal_id)).map((proposal) => ({ ...proposal, source_label: sourceById.get(proposal.source_document_ids[0])?.filename || null }));
      const proposalSourceIds = [...new Set(proposals.flatMap((proposal) => proposal.source_document_ids || []))];
      if (proposalSourceIds.length && !RawSource) throw new Error("raw_source_resolver_unavailable");
      for (const sourceId of proposalSourceIds) await RawSource.resolveRawSource(database, sourceId);
    } finally { database.close(); }
    if (reset || !candidateReviewSessionTotal) { candidateReviewSessionTotal = proposals.length; candidateReviewSessionResolved = 0; }
    else if (advance) candidateReviewSessionResolved += 1;
    if (proposals.length > candidateReviewSessionTotal - candidateReviewSessionResolved) candidateReviewSessionTotal = candidateReviewSessionResolved + proposals.length;
    byId("candidate-review-surface").classList.toggle("hidden", !proposals.length);
    byId("candidate-review-surface").dataset.rawSourceIntegrity = proposals.length ? "verified" : "not-applicable";
    const modelReview = proposals[0]?.payload?.contract_id === CandidateModel?.PAYLOAD_CONTRACT_ID;
    byId("candidate-review-heading").textContent = modelReview ? "模型候选信息提案" : "本地候选信息提案";
    byId("candidate-review-heading").nextElementSibling.textContent = modelReview ? "这些内容来自所选模型，尚未成为已确认候选信息。" : "这些内容来自本地确定规则，尚未成为已确认候选信息。";
    byId("candidate-review-list").innerHTML = proposals.length ? proposalReviewMarkup(proposals[0], Math.min(candidateReviewSessionResolved + 1, candidateReviewSessionTotal), candidateReviewSessionTotal) : "";
    if (!proposals.length) { candidateReviewSessionTotal = 0; candidateReviewSessionResolved = 0; }
    return proposals;
  }

  function editedItemsFromCard(card, proposal) {
    return [...card.querySelectorAll("[data-review-item]")].map((section, index) => {
      const original = proposal.payload.items[index] || { item_id: `user-item-${crypto.randomUUID()}`, item_type: "OTHER", grounding_refs: proposal.grounding_refs, warnings: [], uncertainties: [] };
      const value = (field) => section.querySelector(`[data-field="${field}"]`).value.trim();
      const factValues = value("facts").split("\n").map((text) => text.trim()).filter(Boolean);
      const unchanged = value("title") === String(original.title || "") && (value("subtitle") || null) === (original.subtitle || null) && (value("time") || null) === (original.time || null) && (value("summary") || null) === (original.summary || null) && JSON.stringify(factValues) === JSON.stringify((original.facts || []).map((fact) => fact.value));
      if (unchanged) return structuredClone(original);
      return { ...original, title: value("title"), subtitle: value("subtitle") || null, time: value("time") || null, summary: value("summary") || null, facts: factValues.map((text, factIndex) => ({ fact_id: original.facts?.[factIndex]?.fact_id || `${original.item_id}-user-fact-${factIndex + 1}`, label: original.facts?.[factIndex]?.label || "用户补充", value: text })), review_status: "NEEDS_REVIEW", content_origin: "USER_CONFIRMED" };
    });
  }

  async function reviewCandidateProposal(proposalId, action, card) {
    const buttons = [...card.querySelectorAll("[data-review-action]")];
    buttons.forEach((button) => { button.disabled = true; });
    const activeButton = card.querySelector(`[data-review-action="${action}"]`);
    if (activeButton) activeButton.textContent = action === "reject" ? "正在拒绝…" : "正在确认…";
    const database = await Truth.openDatabase();
    try {
      const proposal = (await LocalCandidateReview.getAll(database, "context_proposals")).find((item) => item.proposal_id === proposalId);
      if (!proposal) throw new Error("candidate_proposal_not_found");
      const editedItems = action === "reject" ? null : editedItemsFromCard(card, proposal);
      const decision = action === "reject" ? "REJECT" : JSON.stringify(editedItems) === JSON.stringify(proposal.payload.items) ? "CONFIRM" : "EDIT_AND_CONFIRM";
      const acceptedPayload = decision === "CONFIRM" ? proposal.payload : decision === "EDIT_AND_CONFIRM" ? LocalCandidateReview.editedPayload(proposal, editedItems) : null;
      const outcome = await LocalCandidateReview.persistDecision(database, proposal, decision, acceptedPayload);
      const remaining = await renderAwaitingCandidateReviews({ advance: true });
      byId("personal-page-message").textContent = remaining.length ? "当前内容已处理，继续审核下一条。" : outcome.revision ? "全部内容已审核并保存为候选信息。" : "全部待审核内容已处理。";
      const confirmedItemId = outcome.revision?.payload?.items?.[0]?.item_id;
      if (!remaining.length) completeEmbeddedImport("personal", confirmedItemId ? `candidate:${confirmedItemId}` : "personal-guide");
    } catch (error) {
      buttons.forEach((button) => { button.disabled = false; });
      if (activeButton) activeButton.textContent = action === "reject" ? "拒绝" : "确认";
      throw error;
    } finally { database.close(); }
  }

  function showCandidateSource(source) {
    SourceInput.renderBundlePreview({
      container: byId("personal-file-preview"), list: byId("personal-source-preview-list"),
    }, selectedCandidateSources);
    refreshCandidateImportGate();
  }

  function setCandidateExtractionState(state, label) {
    const active = !["READY_FOR_REVIEW", "CANCELLED", "FAILED", "COMPLETE"].includes(state);
    ProcessingIndicator.set(byId("personal-processing"), {
      active,
      copy: label,
      boundary: currentAriadneMode() === "model" ? "正在等待模型时不会改用本地结果" : "仅保存原件 · 不进行识别或分析",
      state,
    });
  }

  function setCompletedSourceSheet(open) {
    sheet(open, "completed-source-sheet");
  }

  function resetInvalidCandidateSelection() {
    selectedCandidateSources = [];
    candidateExecutionState = "READY";
    byId("personal-file-input").value = "";
    byId("personal-file-preview").classList.add("hidden");
    byId("personal-page-message").textContent = "";
    byId("personal-page-message").classList.remove("error");
    byId("personal-processing")?.classList.add("hidden");
    refreshCandidateImportGate();
  }

  async function archiveSelectedSources(kind) {
    const candidate = kind === "candidate";
    if (candidate ? candidateProcessingInProgress : jobProcessingInProgress) return;
    const sources = [...(candidate ? selectedCandidateSources : selectedJobSources)];
    if (!sources.length) return;
    const prefix = candidate ? "personal" : "job";
    const adapter = candidate ? LocalCandidate : LocalJob;
    const sourceUrl = candidate ? null : byId("job-link-input").value.trim() || null;
    if (candidate) candidateProcessingInProgress = true;
    else jobProcessingInProgress = true;
    const refresh = candidate ? refreshCandidateImportGate : refreshJobImportGate;
    refresh();
    let database;
    try {
      database = await Truth.openDatabase();
      const documents = await SourceInput.persistDurableBundle({ database,
        sources: sources.map(source => ({ ...source, source_url: candidate ? source.source_url : sourceUrl })),
        sourceDocumentFor: adapter.sourceDocumentFor, persistDurableSource: adapter.persistCanonicalSource });
      await RawSource.persistArchive(database, documents, sourceUrl);
      const currentSources = candidate ? selectedCandidateSources : selectedJobSources;
      const selectionUnchanged = JSON.stringify(currentSources.map(source => source.source_document_id)) === JSON.stringify(sources.map(source => source.source_document_id));
      if (selectionUnchanged) {
        if (candidate) candidateExecutionState = "ARCHIVED";
        else beginJobImportLifecycle(ModelImportLifecycle.STATES.SOURCE_STORED);
      }
      byId(`${prefix}-page-message`).textContent = selectionUnchanged
        ? `已保存 ${documents.length} 份原件，未识别或分析。接入 AI 后可从上方选择原件继续。`
        : `已保存 ${documents.length} 份原件；当前选择已变化，新材料还需保存。`;
      byId(`${prefix}-page-message`).classList.remove("error");
    } catch (error) {
      byId(`${prefix}-page-message`).textContent = "原件保存未完成，请重试；已成功保存的文件会保留。";
      byId(`${prefix}-page-message`).classList.add("error");
    } finally {
      database?.close?.();
      if (candidate) candidateProcessingInProgress = false;
      else jobProcessingInProgress = false;
      refresh();
      await renderSavedSources(kind);
    }
  }

  async function runCandidateProcessing() { return archiveSelectedSources("candidate"); }

  function runtimeIdentity(runtime) {
    return JSON.stringify({ mode: runtime.mode, provider: runtime.provider, model: runtime.model });
  }

  async function openCandidateModelConsent() {
    const gate = CandidateModel.assertEligibleGate(refreshCandidateImportGate());
    const selectionVersion = candidateSelectionVersion;
    const selectedRuntimeIdentity = runtimeIdentity(gate.authority.runtime);
    if (candidateProcessingInProgress || selectedCandidateSources.length !== 1) throw new Error("candidate_model_pdf_required");
    const source = CandidateModel.assertMultimodalSource(selectedCandidateSources[0]);
    if (!["NEW", "RETRY", "WORKSPACE"].includes(source.import_state)) {
      throw new Error("candidate_model_processing_not_actionable");
    }
    const database = await Truth.openDatabase();
    try {
      await SourceInput.persistDurableBundle({
        database,
        sources: [source],
        sourceDocumentFor: LocalCandidate.sourceDocumentFor,
        persistDurableSource: LocalCandidate.persistCanonicalSource,
      });
    } finally { database.close(); }
    if (selectionVersion !== candidateSelectionVersion || selectedRuntimeIdentity !== runtimeIdentity(CandidateModel.assertEligibleGate(refreshCandidateImportGate()).authority.runtime)) {
      throw new Error("candidate_model_consent_mismatch");
    }
    candidateConsentSelectionVersion = selectionVersion;
    candidateConsentRuntimeIdentity = selectedRuntimeIdentity;
    candidateConsentId = `consent-candidate-model-${crypto.randomUUID()}`;
    byId("candidate-model-consent-provider").textContent = gate.authority.runtime.provider === "codex" ? "Codex / OpenAI" : gate.authority.runtime.provider;
    byId("candidate-model-consent-model").textContent = gate.authority.runtime.model;
    const dialog = byId("candidate-model-consent-dialog");
    if (!dialog.open) dialog.showModal();
    return undefined;
  }

  function runCandidateModelProcessing(gate, confirmedAt, consentId) {
    if (activeCandidateModelOperation?.consentId === consentId) return activeCandidateModelOperation.promise;
    const promise = executeCandidateModelProcessing(gate, confirmedAt, consentId);
    activeCandidateModelOperation = { consentId, promise };
    promise.then(
      () => { if (activeCandidateModelOperation?.promise === promise) activeCandidateModelOperation = null; },
      () => { if (activeCandidateModelOperation?.promise === promise) activeCandidateModelOperation = null; },
    );
    return promise;
  }

  async function executeCandidateModelProcessing(gate, confirmedAt, consentId) {
    CandidateModel.assertEligibleGate(gate);
    if (!RuntimeExecution || !Truth || !RawSource || !LocalCandidate || !CandidateModel) throw new Error("candidate_model_runtime_dependencies_unavailable");
    const source = CandidateModel.assertMultimodalSource(selectedCandidateSources[0]);
    const descriptor = RuntimeGate.modelDescriptorForRuntime(gate.authority.runtime, gate.operation);
    const snapshot = RuntimeExecution.createRuntimeSnapshot(gate.authority.runtime, {
      modelDescriptor: descriptor,
      credentialRef: RuntimeGate.credentialFor(gate.authority.runtime),
      adapterVersion: descriptor.adapter_version,
      promptVersion: CandidateModel.PROMPT_VERSION,
      schemaVersion: CandidateModel.SCHEMA_VERSION,
      deliveryMethod: CandidateModel.DELIVERY_METHOD,
      operation: gate.operation.toUpperCase(),
    });
    const consent = CandidateModel.consentFor(source, snapshot, confirmedAt, consentId);
    const operationIdentity = await CandidateModel.operationIdentityFor(source, snapshot, consent);
    const attemptGeneration = ++candidateModelAttemptGeneration;
    const workspaceViewGeneration = beginCandidateWorkspaceView();
    candidateWorkspaceConversation = [];
    activeCandidateConversationSession = null;
    const abortController = new AbortController();
    candidateProcessingInProgress = true;
    candidateExecutionState = "PROCESSING";
    candidateBatchAbortController = abortController;
    byId("replace-personal-file").textContent = "取消本次分析";
    showCandidateWorkspaceLayer(source.file.name, true);
    setCandidateWorkspaceProgress(["正在准备材料", candidateSourceReadLabel(source, "reading"), "等待模型理解", "整理候选卡片"], 0);
    byId("candidate-clarification-list").innerHTML = '<p data-entry-type="CLARIFYING_QUESTION_EMPTY">完成理解后，需要补充的问题会显示在这里。</p>';
    setCandidateExtractionState("PREPARING", "正在校验本机保存的原始材料");
    refreshCandidateImportGate();
    await ConversationUI.waitForIndicatorPaint();
    let database = null;
    let run = null;
    try {
      database = await Truth.openDatabase();
      await Truth.persistRecord(database, "runtime_snapshots", snapshot);
      run = CandidateModel.processingRunFor(source, snapshot.snapshot_id, "PENDING", new Date().toISOString(), { run_id: `run-${operationIdentity.operation_id}` });
      if (!await CandidateModel.claimProcessingRun(database, run)) return;
      const sourceDocument = await RawSource.sourceDocumentForId(database, source.source_document_id);
      const resolved = await RawSource.resolveRawSource(database, source.source_document_id);
      if (abortController.signal.aborted) throw Object.assign(new Error("candidate_model_cancelled"), { name: "AbortError" });
      const startedAt = new Date().toISOString();
      run = CandidateModel.processingRunFor(source, snapshot.snapshot_id, "RUNNING", startedAt, { run_id: run.run_id, started_at: startedAt });
      await Truth.persistRecord(database, "processing_runs", run);
      setCandidateExtractionState("EXTRACTING", source.source_type === "IMAGE" ? "正在准备原始图片" : source.source_type === "DOCX" ? "正在准备 Word 正文和内嵌图片" : "正在准备完整 PDF 渲染页面");
      setCandidateWorkspaceProgress(["材料已准备", candidateSourceReadLabel(source, "reading"), "等待模型理解", "整理候选卡片"], 1);
      const documentDataUrl = await LocalCandidate.readAsDataURL(resolved.file, sourceDocument.mime_type);
      if (abortController.signal.aborted) throw Object.assign(new Error("candidate_model_cancelled"), { name: "AbortError" });
      const request = CandidateModel.requestFor({
        source: { ...source, file: resolved.file },
        sourceDocument,
        documentDataUrl,
        snapshot,
        run,
        consent,
        operationIdentity,
      });
      setCandidateExtractionState("STRUCTURING", `正在使用模型分析：${source.file.name}`);
      setCandidateWorkspaceProgress(["材料已准备", candidateSourceReadLabel(source), "模型正在理解材料", "整理候选卡片"], 2);
      const response = await (globalThis.AriadneTransport || globalThis).fetch("/api/candidate-model-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify(request),
      });
      const result = await response.json().catch(() => ({ error: "deepseek_response_malformed", network_call_made: true }));
      if (!response.ok) {
        const error = new Error(result.error || "deepseek_provider_http_error");
        error.code = result.error || "deepseek_provider_http_error";
        error.failure_layer = result.failure_layer || "provider";
        error.network_call_made = result.network_call_made === true;
        throw error;
      }
      if (abortController.signal.aborted) throw Object.assign(new Error("candidate_model_cancelled"), { name: "AbortError" });
      const proposals = CandidateModel.proposalsFor({ source: { ...source, file: resolved.file }, run, result, operationIdentity, snapshot });
      const isCurrentOperation = () => attemptGeneration === candidateModelAttemptGeneration && selectedCandidateSources[0]?.source_document_id === source.source_document_id;
      await CandidateModel.persistSuccessfulResult(database, run, proposals, abortController.signal, isCurrentOperation);
      const records = await readCandidateRecords(database);
      const previousWorkingModel = latestCandidateWorkingModel(records, source.source_document_id);
      const workingModel = proposals.length ? await CandidateModel.candidateWorkingModelFor(proposals, previousWorkingModel) : null;
      if (!isCurrentOperation()) throw new Error("candidate_model_processing_run_stale");
      if (workingModel) await Truth.persistCandidateWorkingModel(database, workingModel);
      if (attemptGeneration === candidateModelAttemptGeneration) {
        candidateExecutionState = workingModel ? "COMPLETE" : "READY";
        setCandidateExtractionState("READY_FOR_REVIEW", proposals.length ? "Candidate Working Cards 已生成" : "模型未发现可形成卡片的候选信息");
        byId("personal-page-message").textContent = "";
        byId("personal-page-message").classList.remove("error");
        await renderAwaitingCandidateReviews({ reset: true, sourceIds: [] });
        if (workingModel && workspaceViewIsCurrent(workspaceViewGeneration)) await renderCandidateWorkingWorkspace(source.source_document_id, { workingModel, viewGeneration: workspaceViewGeneration });
        else if (!workingModel && workspaceViewIsCurrent(workspaceViewGeneration)) {
          activeCandidateWorkingModel = null;
          showCandidateWorkspaceLayer(source.file.name, false);
          byId("candidate-working-groups").innerHTML = '<p class="v1-conversation-empty">模型没有发现可形成卡片的候选信息。</p>';
          setCandidateWorkspaceProgress(["材料已准备", candidateSourceReadLabel(source), "模型已完成理解", "没有发现可形成卡片的信息"]);
          byId("candidate-clarification-list").innerHTML = '<p data-entry-type="CLARIFYING_QUESTION_EMPTY">当前没有需要补充的问题。</p>';
          byId("candidate-workspace-save-status").textContent = "没有可保存的候选人信息。";
        }
      }
    } catch (error) {
      if (database && run && ["PENDING", "RUNNING"].includes(run.status)) {
        const terminal = error?.name === "AbortError"
          ? Truth.cancelProcessingRun(run, new Date().toISOString())
          : CandidateModel.processingRunFor(source, snapshot.snapshot_id, "FAILED", run.started_at || new Date().toISOString(), {
            run_id: run.run_id,
            started_at: run.started_at || new Date().toISOString(),
            finished_at: new Date().toISOString(),
            error_code: String(error?.code || error?.message || "candidate_model_execution_failed").slice(0, 180),
          });
        await Truth.persistRecord(database, "processing_runs", terminal);
      }
      if (attemptGeneration === candidateModelAttemptGeneration) candidateExecutionState = "READY";
      if (error?.name === "AbortError") {
        if (attemptGeneration === candidateModelAttemptGeneration) {
          closeCandidateWorkspaceLayer("import");
          setCandidateExtractionState("CANCELLED", "已取消本次模型分析");
          byId("personal-page-message").textContent = "本次模型分析已取消；没有保存新的模型提案。";
          byId("personal-page-message").classList.remove("error");
        }
        return;
      }
      if (String(error?.message || error) === "candidate_model_processing_run_stale") return;
      if (attemptGeneration === candidateModelAttemptGeneration && workspaceViewIsCurrent(workspaceViewGeneration)) closeCandidateWorkspaceLayer("import");
      error.candidateModelExecution = true;
      throw error;
    } finally {
      database?.close?.();
      if (attemptGeneration === candidateModelAttemptGeneration) {
        candidateBatchAbortController = null;
        candidateProcessingInProgress = false;
        byId("replace-personal-file").textContent = "替换";
        byId("personal-processing").classList.add("hidden");
        refreshCandidateImportGate();
        renderSavedCandidatePdfSources().catch(showPersonalError);
      }
    }
  }

  function initPersonal() {
    libraryEditor = createLibraryEditor("candidate-card-grid", "personal-page-message", removePersonalLibraryCard, renderPersonalLibrary);
    renderPersonalLibrary().catch(showPersonalError);
  }

  function initPersonalImport() {
    if (window.AriadneCandidateClarifications && byId("candidate-clarification-list")) {
      candidateClarifications = window.AriadneCandidateClarifications.mount(byId("candidate-clarification-list"), {
        onAnswer: (entry, answer) => {
          if (candidateConversationTurnActive) return { status: "BUSY", message: "请等当前对话完成后再回答，输入已保留。" };
          if (!byId("candidate-card-edit-form").classList.contains("hidden")) {
            return { status: "EDITING", message: "请先确认或取消左侧卡片编辑，再回答这个问题。输入已保留。" };
          }
          if (entry.source_document_id !== activeCandidateWorkingModel?.source_document_id) return { status: "STALE" };
          return submitCandidateWorkspaceConversation(window.AriadneCandidateClarifications.answerMessage(entry, answer), {
            focus: { type: "ITEM", item_id: entry.item_id }, clarification: entry,
          });
        },
      });
    }
    ProductShell.bindImportShell(document);
    candidateSharedWorkspace();
    renderAwaitingCandidateReviews({ sourceIds: [] }).catch(showPersonalError);
    renderSavedCandidatePdfSources().catch(showPersonalError);
    window.addEventListener("message", (event) => {
      if (!isEmbeddedDetail || event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type === "job-radar-v1-workspace-back") requestCandidateWorkspaceExit("import");
      if (event.data?.type === "job-radar-v1-workspace-close") requestCandidateWorkspaceExit("profile");
    });
    byId("candidate-review-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-review-action]");
      if (!button) return;
      const card = button.closest("[data-proposal-id]");
      reviewCandidateProposal(card.dataset.proposalId, button.dataset.reviewAction, card).catch(showPersonalError);
    });
    const handleCandidateFiles = (files, options = {}) => {
      const selectionVersion = candidateSelectionVersion + 1;
      acceptCandidateFiles(files, options).catch((error) => showPersonalError(error, selectionVersion));
    };
    byId("personal-import-types").addEventListener("click", (event) => {
      const button = event.target.closest("[data-import-type]");
      if (!button) return;
      selectedCandidateType = button.dataset.importType;
      byId("personal-import-types").querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      if (selectedCandidateSources.length) handleCandidateFiles(selectedCandidateSources.map((source) => source.file));
    });
    byId("saved-candidate-source-select").addEventListener("change", event => {
      if (event.target.value && !candidateProcessingInProgress) selectSavedCandidatePdf(event.target.value).catch(showPersonalError);
    });
    byId("save-personal-source").addEventListener("click", () => runCandidateProcessing().catch(showPersonalError));
    const acceptCandidateFiles = async (files, { replace = false, captured_via: capturedVia = "FILE_PICKER" } = {}) => {
      const selectionVersion = ++candidateSelectionVersion;
      const gate = refreshCandidateImportGate();
      const modelReady = gate.authority.runtime.mode === "model" && gate.allowed;
      if (modelReady) CandidateModel.assertEligibleGate(gate);
      const selectedFiles = Array.from(files || []);
      closeCandidateWorkspaceLayer("import");
      setCompletedSourceSheet(false);
      byId("personal-page-message").textContent = "";
      byId("personal-page-message").classList.remove("error");
      const batchId = !replace && selectedCandidateSources[0]?.batch_id
        ? selectedCandidateSources[0].batch_id
        : `${modelReady ? "batch-candidate-model" : "batch-candidate-archive"}-${crypto.randomUUID()}`;
      candidateExecutionState = "READY";
      const prepared = await Promise.all(selectedFiles.map(async (file) => ({ ...(await LocalCandidate.prepareSource(file, batchId, selectedCandidateType)), captured_via: capturedVia })));
      if (selectionVersion !== candidateSelectionVersion) return;
      const unique = [...new Map(prepared.map((source) => [source.source_document_id, source])).values()];
      const database = await Truth.openDatabase();
      let records;
      try { records = await readCandidateRecords(database); }
      finally { database.close(); }
      if (selectionVersion !== candidateSelectionVersion) return;
      const incoming = unique.map((source) => ({ ...source, import_state: modelSourceImportState(source.source_document_id, records) }));
      selectedCandidateSources = SourceInput.mergeSources(selectedCandidateSources, incoming, { replace });
      activeCandidateWorkingModel = null;
      candidateExecutionState = "READY";
      if (selectedCandidateSources[0]) showCandidateSource(selectedCandidateSources[0]);
      await renderAwaitingCandidateReviews({ reset: true, sourceIds: [] });
      byId("personal-page-message").textContent = "已选择材料；保存原件后可随时回来继续。";
      refreshCandidateImportGate();
      await renderSavedCandidatePdfSources();
    };
    candidateSourceInputBinding = SourceInput.bind({
      dropzone: byId("personal-dropzone"), input: byId("personal-file-input"), onFiles: handleCandidateFiles,
      onAccepted: (count) => { byId("personal-page-message").textContent = `已从剪贴板添加 ${count} 张图片。`; },
    });
    byId("personal-source-preview-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-source-remove]");
      if (!button || candidateProcessingInProgress) return;
      selectedCandidateSources.splice(Number(button.dataset.sourceRemove), 1);
      candidateExecutionState = "READY";
      activeCandidateWorkingModel = null;
      candidateSelectionVersion += 1;
      if (selectedCandidateSources.length) showCandidateSource(selectedCandidateSources[0]);
      else resetInvalidCandidateSelection();
    });
    byId("replace-personal-file").addEventListener("click", () => {
      if (candidateProcessingInProgress) {
        candidateBatchAbortController?.abort();
        setCandidateExtractionState("CANCELLING", refreshCandidateImportGate().authority.runtime.mode === "model" ? "正在取消本次模型分析" : "原件保存中");
        return;
      }
      candidateSourceInputBinding.openChooser({ replace: false });
    });
    byId("start-personal-processing").addEventListener("click", () => {
      const gate = refreshCandidateImportGate();
      const sourceId = selectedCandidateSources[0]?.source_document_id;
      const operation = candidateAnalysisReady(gate)
        ? candidateExecutionState === "COMPLETE" && activeCandidateWorkingModel?.source_document_id === sourceId
          ? renderCandidateWorkingWorkspace(sourceId, { workingModel: activeCandidateWorkingModel }) : openCandidateModelConsent()
        : runCandidateProcessing();
      Promise.resolve(operation).catch(showPersonalError);
    });
    byId("confirm-completed-source").addEventListener("click", () => {
      setCompletedSourceSheet(false);
      if (!completeEmbeddedImport("personal", "personal-guide")) window.location.assign("/personal-information.html");
    });
    byId("document-size-limit-dialog").addEventListener("cancel", (event) => event.preventDefault());
    byId("confirm-document-size-limit").addEventListener("click", () => {
      byId("document-size-limit-dialog").close();
      resetInvalidCandidateSelection();
    });
    byId("candidate-model-failure-dialog").addEventListener("cancel", (event) => event.preventDefault());
    byId("confirm-candidate-model-failure").addEventListener("click", () => {
      byId("candidate-model-failure-dialog").close();
      candidateExecutionState = "READY";
      byId("personal-processing").classList.add("hidden");
      refreshCandidateImportGate();
    });
    byId("cancel-candidate-model-consent").addEventListener("click", () => byId("candidate-model-consent-dialog").close());
    byId("confirm-candidate-model-consent").addEventListener("click", () => {
      try {
        const gate = CandidateModel.assertEligibleGate(refreshCandidateImportGate());
        if (candidateConsentSelectionVersion !== candidateSelectionVersion || candidateConsentRuntimeIdentity !== runtimeIdentity(gate.authority.runtime)) {
          throw new Error("candidate_model_consent_mismatch");
        }
        const confirmedAt = new Date().toISOString();
        byId("candidate-model-consent-dialog").close();
        runCandidateModelProcessing(gate, confirmedAt, candidateConsentId).catch(showPersonalError);
      } catch (error) {
        byId("candidate-model-consent-dialog").close();
        showPersonalError(error);
      }
    });
    byId("candidate-working-groups").addEventListener("click", (event) => {
      const card = event.target.closest("[data-working-item]");
      if (card) openCandidateWorkspaceCardDetail(card.dataset.workingItem).catch(showPersonalError);
    });
    byId("candidate-card-back").addEventListener("click", requestCandidateCardBack);
    byId("candidate-card-edit").addEventListener("click", enterCandidateWorkspaceEdit);
    byId("candidate-card-edit-form").addEventListener("input", (event) => {
      candidateWorkspaceEditDirty = true;
      if (event.target === byId("candidate-working-edit-title") && event.target.value.trim()) event.target.removeAttribute("aria-invalid");
    });
    byId("candidate-working-cancel-edit").addEventListener("click", cancelCandidateWorkspaceEdit);
    byId("candidate-card-edit-form").addEventListener("submit", (event) => {
      event.preventDefault();
      persistCandidateWorkspaceEdit().catch(showPersonalError);
    });
    byId("candidate-card-unsaved-dialog").addEventListener("cancel", (event) => { event.preventDefault(); byId("candidate-card-unsaved-dialog").close(); });
    byId("candidate-card-unsaved-save").addEventListener("click", () => {
      persistCandidateWorkspaceEdit().then((saved) => { if (saved) byId("candidate-card-unsaved-dialog").close(); }).catch(showPersonalError);
    });
    byId("candidate-card-unsaved-discard").addEventListener("click", () => {
      byId("candidate-card-unsaved-dialog").close();
      cancelCandidateWorkspaceEdit();
    });
    byId("candidate-card-title-required-dialog").addEventListener("cancel", (event) => event.preventDefault());
    byId("candidate-card-title-required-confirm").addEventListener("click", () => {
      byId("candidate-card-title-required-dialog").close();
      byId("candidate-working-edit-title").focus();
    });
    byId("candidate-workspace-composer").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = byId("candidate-workspace-message");
      const content = input.value.trim();
      if (!content || candidateConversationTurnActive) return;
      const draft = ConversationUI.takeDraft(input);
      submitCandidateWorkspaceConversation(content).then(outcome => draft.finish(outcome?.status !== "SUCCEEDED")).catch(() => draft.finish(true));
    });
    byId("candidate-workspace-save").addEventListener("click", () => saveCandidateWorkspaceToProfile().catch(showPersonalError));
    byId("candidate-workspace-continue-editing").addEventListener("click", () => byId("candidate-workspace-close-dialog").close());
    byId("candidate-workspace-discard-close").addEventListener("click", () => {
      byId("candidate-workspace-close-dialog").close();
      closeCandidateWorkspaceLayer(candidateWorkspaceExitIntent || "import");
    });
    byId("candidate-workspace-save-draft-close").addEventListener("click", () => {
      persistCandidateWorkspaceEdit().then((saved) => {
        if (!saved) return;
        byId("candidate-workspace-close-dialog").close();
        closeCandidateWorkspaceLayer(candidateWorkspaceExitIntent || "import");
      }).catch(showPersonalError);
    });
    byId("candidate-workspace-close-dialog").addEventListener("cancel", (event) => {
      event.preventDefault();
      byId("candidate-workspace-close-dialog").close();
    });
    byId("candidate-ai-workspace").addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCandidateWorkspaceExit("import");
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...byId("candidate-ai-workspace").querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter((element) => !element.closest(".hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    refreshCandidateImportGate();
  }

  function showPersonalError(error, selectionVersion = candidateSelectionVersion) {
    if (selectionVersion !== candidateSelectionVersion) return;
    candidateProcessingInProgress = false;
    if (candidateExecutionState === "PROCESSING") candidateExecutionState = "COMPLETE";
    if (String(error?.code || error?.message || error || "") === "document_size_limit_exceeded") {
      byId("personal-page-message").textContent = "";
      byId("personal-page-message").classList.remove("error");
      byId("personal-processing")?.classList.add("hidden");
      refreshCandidateImportGate();
      const dialog = byId("document-size-limit-dialog");
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (error?.candidateModelExecution === true) {
      byId("personal-page-message").textContent = "";
      byId("personal-page-message").classList.remove("error");
      byId("personal-processing")?.classList.add("hidden");
      candidateExecutionState = "READY";
      refreshCandidateImportGate();
      const dialog = byId("candidate-model-failure-dialog");
      byId("candidate-model-failure-copy").textContent = personalErrorCopy(error);
      if (!dialog.open) dialog.showModal();
      return;
    }
    ProductShell.setFeedback(byId("personal-page-message"), { state: "FAILURE", copy: `无法整理材料：${personalErrorCopy(error)}` });
    refreshCandidateImportGate();
    byId("personal-processing")?.classList.add("hidden");
  }

  function createDeletePopover(popoverId) {
    const popover = byId(popoverId);
    const menu = popover.querySelector(".v1-delete-popover-menu");
    let opener = null;
    let closeTimer = null;
    const close = ({ restoreFocus = false } = {}) => {
      window.clearTimeout(closeTimer);
      popover.classList.remove("is-open");
      popover.setAttribute("aria-hidden", "true");
      closeTimer = window.setTimeout(() => popover.classList.add("hidden"), 180);
      if (restoreFocus) opener?.focus({ preventScroll: true });
    };
    const position = () => {
      const rect = opener.getBoundingClientRect();
      const viewportPadding = 12;
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      const left = Math.max(viewportPadding, Math.min(rect.right - width, window.innerWidth - width - viewportPadding));
      const top = rect.top - height - 10 >= viewportPadding ? rect.top - height - 10 : Math.min(rect.bottom + 10, window.innerHeight - height - viewportPadding);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    };
    const open = (trigger) => {
      opener = trigger;
      window.clearTimeout(closeTimer);
      popover.classList.remove("hidden");
      popover.setAttribute("aria-hidden", "false");
      position();
      window.requestAnimationFrame(() => popover.classList.add("is-open"));
    };
    popover.querySelectorAll("[data-delete-popover-cancel]").forEach((button) => button.addEventListener("click", () => close({ restoreFocus: true })));
    window.addEventListener("resize", () => { if (!popover.classList.contains("hidden")) position(); });
    return Object.freeze({ open, close });
  }

  function renderCandidate(item) {
    activeCandidate = item;
    byId("candidate-type").textContent = candidateTypeLabel(item);
    const reviewState = byId("candidate-review-state");
    const canonical = item.data_class === "CANONICAL_CONFIRMED";
    reviewState.classList.toggle("hidden", canonical);
    reviewState.textContent = canonical ? "" : "待审核 · 演示";
    byId("candidate-title").textContent = item.title;
    byId("candidate-subtitle").textContent = item.subtitle || "";
    byId("candidate-time").textContent = item.time || "";
    byId("candidate-summary").textContent = item.summary;
    byId("candidate-facts").innerHTML = item.facts.map((fact, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><p><b>${escapeHtml(candidateFactLabel(fact.label))}</b>${escapeHtml(fact.value)}</p></div>`).join("");
    byId("candidate-ownership").textContent = item.ownership || "未记录";
    byId("candidate-source").textContent = `${item.source_refs?.[0]?.location || "来源待核对"} · ${item.source_refs?.[0]?.excerpt_or_reference || "来源未记录"}`;
  }

  function candidateDetailChangeProjection(confirmedItem, workingItem) {
    if (!confirmedItem || !workingItem || confirmedItem.item_id !== workingItem.item_id) return null;
    const changes = [];
    const add = (label, before, after) => {
      const previous = String(before ?? "").trim();
      const next = String(after ?? "").trim();
      if (previous !== next) changes.push({ label, before: previous || "未填写", after: next || "未填写" });
    };
    [["标题", "title"], ["分类标签", "category"], ["组织 / 副标题", "subtitle"], ["日期", "time"], ["摘要", "summary"], ["责任边界", "ownership"]]
      .forEach(([label, field]) => add(label, confirmedItem[field], workingItem[field]));
    const confirmedFacts = new Map((confirmedItem.facts || []).map((fact) => [fact.fact_id, fact]));
    const workingFacts = new Map((workingItem.facts || []).map((fact) => [fact.fact_id, fact]));
    new Set([...confirmedFacts.keys(), ...workingFacts.keys()]).forEach((factId) => {
      const before = confirmedFacts.get(factId);
      const after = workingFacts.get(factId);
      add(candidateFactLabel(after?.label || before?.label), before?.value, after?.value);
    });
    if (!changes.length) return null;
    return Object.freeze({
      before: changes.map((change) => `${change.label}：${change.before}`).join("；"),
      after: changes.map((change) => `${change.label}：${change.after}`).join("；"),
    });
  }

  function showCandidateDetailWorkingProposal(confirmedItem, workingItem, reason = "") {
    const projection = candidateDetailChangeProjection(confirmedItem, workingItem);
    const panel = byId("candidate-patch-proposal");
    panel.classList.toggle("hidden", !projection);
    if (!projection) return false;
    byId("candidate-patch-before").textContent = projection.before;
    byId("candidate-patch-after").textContent = projection.after;
    byId("candidate-patch-reason").textContent = reason || "这是非权威 Working 修改；确认保存前，个人资料中的已确认版本保持不变。";
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }

  function setDetailRuntimeMode(record, paneId, editButtonId, runtimeBadgeId, operation) {
    const gate = currentOperationGate(operation);
    const runtime = gate.authority.runtime;
    const conversationAllowed = runtime.mode === "model" && gate.allowed;
    const candidate = paneId === "candidate-ai-pane";
    const shell = ProductShell.bindDetailShell(document, {
      conversation_pane: paneId,
      edit: editButtonId,
      runtime: runtimeBadgeId,
      messages: candidate ? "candidate-conversation-messages" : "job-conversation-messages",
      form: candidate ? "candidate-conversation-form" : "job-conversation-form",
      status: candidate ? "candidate-conversation-status" : "job-conversation-status",
    });
    ProductShell.applyDetailRuntime(shell, {
      mode: runtime.mode,
      recognition: Demo.isAIRecognizedRecord(record) ? "ai" : "local",
      conversation_allowed: conversationAllowed,
      runtime_label: runtimeLabel(runtime),
    });
    if (editButtonId === "open-job-edit") byId(editButtonId).classList.remove("hidden");
    setRuntimeGateMessage(record.item_id ? "candidate-detail-message" : "job-detail-message", runtime.mode === "model" && !conversationAllowed ? unavailableCopy(gate, "对话") : "");
    return conversationAllowed;
  }

  async function initCandidateDetail() {
    const contextId = new URLSearchParams(window.location.search).get("context");
    const itemId = new URLSearchParams(window.location.search).get("item") || Demo.CANDIDATE_FIXTURES[0].item_id;
    let canonicalRevision = null;
    let candidate = null;
    if (contextId && Truth && LocalCandidateReview) {
      const database = await Truth.openDatabase();
      const [revisionRecords, lifecycleRecords] = await Promise.all([
        LocalCandidateReview.getAll(database, "candidate_context_revisions"),
        LocalCandidateReview.getAll(database, "candidate_context_lifecycle"),
      ]);
      database.close();
      canonicalRevision = LocalCandidateReview.latestRevision(revisionRecords, contextId);
      const item = canonicalRevision?.payload?.items?.find((candidateItem) => candidateItem.item_id === itemId);
      if (!item) throw new Error("candidate_item_not_found");
      if (LocalCandidateReview.removedItemKeys(lifecycleRecords).has(LocalCandidateReview.candidateItemKey(contextId, itemId))) throw new Error("candidate_item_removed");
      candidate = { ...item, data_class: "CANONICAL_CONFIRMED", context_id: contextId, source_refs: item.grounding_refs || [] };
    } else {
      const storedCandidate = await Demo.get(Demo.DEMO_STORES.candidates, itemId);
      const storedRecords = await localizedCandidateRecords(storedCandidate ? [storedCandidate] : []);
      const stored = storedRecords[0] || null;
      const fallback = Demo.CANDIDATE_FIXTURES.find((item) => item.item_id === itemId);
      if (!stored && !fallback) throw new Error("candidate_item_not_found");
      candidate = stored || Demo.clone(fallback);
    }
    renderCandidate(candidate);
    ConversationUI.renderMessages(byId("candidate-conversation-messages"), [], { empty_text: "" });
    const sourceIdFor = (record, revision) => {
      const allowed = new Set(revision?.provenance?.source_document_ids || []);
      const grounded = (record.source_refs || record.grounding_refs || []).map((ref) => ref.source_document_id).find((sourceId) => sourceId && (!allowed.size || allowed.has(sourceId)));
      return grounded || revision?.provenance?.source_document_ids?.[0] || null;
    };
    const conversationAllowed = setDetailRuntimeMode(candidate, "candidate-ai-pane", "open-direct-edit", "candidate-ai-runtime", "candidate_conversation");
    const candidateDetailSourceId = sourceIdFor(candidate, canonicalRevision);
    // Editing existing confirmed content works in Local mode too. Its saved
    // Working/version is a persistence dependency, not a model capability.
    if (canonicalRevision?.contract_id === "ariadne-context-revision-v2" && candidateDetailSourceId) {
      const database = await Truth.openDatabase();
      try { activeCandidateWorkingModel = await candidateWorkingModelForDetail(database, candidateDetailSourceId, itemId, canonicalRevision); }
      finally { database.close(); }
    }
    const candidateConversationBinding = ProductShell.bindConversation({
      messages: byId("candidate-conversation-messages"),
      form: byId("candidate-conversation-form"),
      status: byId("candidate-conversation-status"),
    });
    ProductShell.bindConversationAdapter(candidateConversationBinding, {
      domain: "candidate",
      operation: "candidate_conversation",
      isAvailable: () => {
        const gate = currentOperationGate("candidate_conversation");
        return gate.authority.runtime.mode === "model" && gate.allowed && Boolean(candidateDetailSourceId && canonicalRevision);
      },
      resolveTarget: () => candidateDetailSourceId && canonicalRevision ? Object.freeze({ sourceId: candidateDetailSourceId, itemId }) : null,
      submit: ({ content, target }) => submitCandidateDetailConversation({ sourceId: target.sourceId, itemId: target.itemId, canonicalRevision, content }),
    });
    if (conversationAllowed) {
      const form = byId("candidate-conversation-form");
      if (candidateDetailSourceId && canonicalRevision) {
        const database = await Truth.openDatabase();
        try {
          activeCandidateWorkingModel ||= await candidateWorkingModelForDetail(database, candidateDetailSourceId, itemId, canonicalRevision);
          showCandidateDetailWorkingProposal(activeCandidate, activeCandidateWorkingModel.payload.items.find((item) => item.item_id === itemId));
          activeCandidateConversationSession = await CandidateWorkspaceConversationRuntime.resolveSession(database, candidateDetailSourceId);
          window.AriadneRuntimeSelection?.bind("candidate-conversation-form", "candidate_conversation", activeCandidateConversationSession.conversation_id);
          const restored = await restoreCandidateDetailConversation(database, activeCandidateConversationSession.conversation_id);
          renderCandidateDetailConversation(restored.messages);
          const hasActiveTurn = restored.turns.some((turn) => CandidateConversationPersistence.ACTIVE_STATES.includes(turn.state));
          const interrupted = restored.turns.at(-1)?.failure_code === "INTERRUPTED_TURN_EXPIRED";
          setCandidateDetailConversationExecutionState(hasActiveTurn ? "正在理解…" : interrupted ? "上次对话已中断，请重新发送。" : "", hasActiveTurn);
        } catch (error) {
          byId("candidate-detail-message").textContent = "当前材料的对话上下文尚不可用；不会改用本地结果。";
          byId("candidate-detail-message").classList.add("error");
          form.querySelector('button[type="submit"]').disabled = true;
        } finally { database.close(); }
      } else {
        byId("candidate-detail-message").textContent = "演示材料不建立真实模型会话。";
        form.querySelector('button[type="submit"]').disabled = true;
      }
    }
    byId("accept-candidate-patch").addEventListener("click", async () => {
      if (!activeCandidateWorkingModel || !canonicalRevision) return;
      const button = byId("accept-candidate-patch");
      button.disabled = true;
      try {
        const database = await Truth.openDatabase();
        try {
          let outcome;
          if (canonicalRevision.contract_id === "ariadne-context-revision-v2") {
            outcome = await persistCandidateWorkspaceAcceptance(database, activeCandidateWorkingModel);
          } else {
            const workingItem = activeCandidateWorkingModel.payload.items.find((item) => item.item_id === itemId);
            const originalItem = canonicalRevision.payload.items.find((item) => item.item_id === itemId);
            if (!workingItem || !originalItem) throw new Error("candidate_item_not_found");
            const confirmedWorkingModel = await CandidateModel.editedCandidateWorkingModel(activeCandidateWorkingModel, itemId, {
              title: workingItem.title,
              category: workingItem.category,
              subtitle: workingItem.subtitle,
              time: workingItem.time,
              summary: workingItem.summary,
              ownership: workingItem.ownership,
              facts: (workingItem.facts || []).map((fact) => fact.value),
            }, new Date().toISOString(), "USER_CONFIRMED");
            const confirmedItem = {
              ...originalItem,
              title: workingItem.title,
              subtitle: workingItem.subtitle || null,
              category: workingItem.category || null,
              time: workingItem.time || null,
              summary: workingItem.summary || null,
              ownership: workingItem.ownership || null,
              facts: structuredClone(workingItem.facts || []),
              content_origin: "USER_CONFIRMED",
              review_status: "CONFIRMED",
            };
            outcome = await LocalCandidateReview.persistUserEdit(database, canonicalRevision, itemId, confirmedItem, { working_model: confirmedWorkingModel });
            activeCandidateWorkingModel = confirmedWorkingModel;
          }
          canonicalRevision = outcome.revision;
          const confirmedItem = canonicalRevision.payload.items.find((item) => item.item_id === itemId);
          activeCandidate = { ...confirmedItem, data_class: "CANONICAL_CONFIRMED", context_id: canonicalRevision.context_id, source_refs: confirmedItem.grounding_refs || [] };
        } finally { database.close(); }
        renderCandidate(activeCandidate);
        byId("candidate-patch-proposal").classList.add("hidden");
        byId("candidate-detail-message").textContent = `Working 修改已由你确认并保存为第 ${canonicalRevision.version} 个确认版本；上一版本仍保留。`;
        byId("candidate-detail-message").classList.remove("error");
        if (window.parent !== window) window.parent.postMessage({ type: "job-radar-v1-detail-updated", library: "personal", sourceKey: `candidate:${itemId}` }, window.location.origin);
      } catch (error) {
        byId("candidate-detail-message").textContent = ["candidate_working_model_stale", "context_version_conflict"].includes(String(error?.code || error?.message))
          ? "内容已经变化，请刷新后重新查看再保存。"
          : `无法保存 Working 修改：${personalErrorCopy(error)}`;
        byId("candidate-detail-message").classList.add("error");
      } finally { button.disabled = false; }
    });
    byId("reject-candidate-patch").addEventListener("click", () => {
      byId("candidate-patch-proposal").classList.add("hidden");
      byId("candidate-detail-message").textContent = "已暂不保存这版 Working 修改；个人资料中的已确认版本没有变化。";
      byId("candidate-detail-message").classList.remove("error");
    });
    const editShell = ProductShell.createDetailEditController({
      trigger: byId("open-direct-edit"), form: byId("candidate-edit-form"), preview: byId("direct-edit-preview"), window,
      populate: () => {
        byId("candidate-edit-title").value = activeCandidate.title || "";
        byId("candidate-edit-category").value = activeCandidate.category || "";
        byId("candidate-edit-subtitle").value = activeCandidate.subtitle || "";
        byId("candidate-edit-time").value = activeCandidate.time || "";
        byId("candidate-edit-summary").value = activeCandidate.summary || "";
        byId("candidate-edit-facts").value = activeCandidate.facts.map((fact) => fact.value).join("\n");
      },
    });
    if (canonicalRevision) byId("open-candidate-delete").classList.add("hidden");
    const deletePopover = createDeletePopover("candidate-delete-popover");
    window.addEventListener("message", (event) => {
      if (event.origin === window.location.origin && event.data?.type === "job-radar-v1-open-detail-edit") byId("open-direct-edit").click();
    });
    byId("open-candidate-delete").addEventListener("click", (event) => deletePopover.open(event.currentTarget));
    document.querySelectorAll("[data-candidate-delete-scope]").forEach((button) => button.addEventListener("click", async () => {
      const scope = button.dataset.candidateDeleteScope;
      const scopeButtons = [...document.querySelectorAll("[data-candidate-delete-scope]")];
      scopeButtons.forEach((control) => { control.disabled = true; });
      const sourceId = sourceIdFor(activeCandidate, canonicalRevision);
      try {
        if (scope === "source" && canonicalRevision && String(sourceId || "").startsWith("source-candidate-")) {
          const response = await (globalThis.AriadneTransport || globalThis).fetch("/api/candidate-model-operation-state/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source_document_id: sourceId }),
          });
          if (!response.ok) throw new Error("candidate_model_operation_state_delete_failed");
        }
        if (canonicalRevision) {
          const database = await Truth.openDatabase();
          try {
            if (scope === "source") await LocalCandidateReview.persistSourceHardDelete(database, sourceId);
            else await LocalCandidateReview.persistRemoval(database, canonicalRevision, itemId);
          } finally { database.close(); }
        } else if (scope === "source") {
          await LocalCandidateReview.hardDeleteLegacySource(Demo, Demo.DEMO_STORES.candidates, sourceId);
        } else {
          await LocalCandidateReview.removeLegacyContext(Demo, Demo.DEMO_STORES.candidates, itemId);
        }
        const message = scope === "source" ? "已移除此文件导入的所有内容；现在可以重新导入同一文件。" : "已从个人资料中移除这张卡片；原始文件与提取记录仍然保留。";
        deletePopover.close();
        byId("candidate-detail-message").textContent = message;
        byId("candidate-detail-message").classList.remove("error");
        if (!completeEmbeddedImport("personal", `candidate:${itemId}`)) returnToCardLibrary("/personal-information.html", "personal-guide");
      } catch (error) {
        scopeButtons.forEach((control) => { control.disabled = false; });
        byId("candidate-detail-message").textContent = `无法删除：${personalErrorCopy(error)}`;
        byId("candidate-detail-message").classList.add("error");
      }
    }));
    byId("preview-direct-edit").addEventListener("click", () => {
      const values = byId("candidate-edit-facts").value.split("\n").map((value) => value.trim()).filter(Boolean);
      pendingDirectEdit = { title: byId("candidate-edit-title").value.trim(), category: byId("candidate-edit-category").value.trim() || null, subtitle: byId("candidate-edit-subtitle").value.trim() || null, time: byId("candidate-edit-time").value.trim() || null, summary: byId("candidate-edit-summary").value.trim() || null, facts: values.map((value, index) => ({ fact_id: activeCandidate.facts[index]?.fact_id || `direct-fact-${index + 1}`, label: activeCandidate.facts[index]?.label || "用户补充", value })) };
      if (!pendingDirectEdit.title) return;
      byId("direct-before").textContent = `${activeCandidate.title} · 分类标签：${activeCandidate.category || "未设置"} · ${activeCandidate.facts.length} 条事实`;
      byId("direct-after").textContent = `${pendingDirectEdit.title} · 分类标签：${pendingDirectEdit.category || "未设置"} · ${pendingDirectEdit.facts.length} 条事实`;
      editShell.showPreview();
    });
    byId("confirm-direct-edit").addEventListener("click", async () => {
      if (!pendingDirectEdit) return;
      const button = byId("confirm-direct-edit");
      button.disabled = true;
      try {
        if (canonicalRevision) {
          const originalItem = canonicalRevision.payload.items.find((item) => item.item_id === itemId);
          const editedItem = { ...originalItem, ...pendingDirectEdit, content_origin: "USER_CONFIRMED", review_status: "CONFIRMED" };
          const database = await Truth.openDatabase();
          try {
            let outcome;
            if (canonicalRevision.contract_id === "ariadne-context-revision-v2") {
              if (!CandidateModel || !activeCandidateWorkingModel) throw new Error("candidate_workspace_user_edit_requires_working_model");
              const editedWorkingModel = await CandidateModel.editedCandidateWorkingModel(activeCandidateWorkingModel, itemId, {
                ...pendingDirectEdit,
                facts: pendingDirectEdit.facts.map((fact) => fact.value),
              }, new Date().toISOString(), "USER_CONFIRMED");
              await Truth.persistCandidateWorkingModel(database, editedWorkingModel);
              outcome = await persistCandidateWorkspaceAcceptance(database, editedWorkingModel);
              activeCandidateWorkingModel = editedWorkingModel;
            } else {
              const currentWorkingModel = await candidateWorkingModelForDetail(database, candidateDetailSourceId, itemId, canonicalRevision);
              const editedWorkingModel = await CandidateModel.editedCandidateWorkingModel(currentWorkingModel, itemId, {
                ...pendingDirectEdit,
                facts: pendingDirectEdit.facts.map((fact) => fact.value),
              }, new Date().toISOString(), "USER_CONFIRMED");
              outcome = await LocalCandidateReview.persistUserEdit(database, canonicalRevision, itemId, editedItem, { working_model: editedWorkingModel });
              activeCandidateWorkingModel = editedWorkingModel;
            }
            canonicalRevision = outcome.revision;
            const confirmedItem = canonicalRevision.payload.items.find((item) => item.item_id === itemId);
            activeCandidate = { ...confirmedItem, data_class: "CANONICAL_CONFIRMED", context_id: contextId, source_refs: confirmedItem.grounding_refs || [] };
            byId("candidate-detail-message").textContent = `修改已保存为第 ${canonicalRevision.version} 个确认版本；上一版本仍保留。`;
          } finally { database.close(); }
        } else {
          activeCandidate = { ...activeCandidate, ...pendingDirectEdit, item_version: (Number(activeCandidate.item_version) || 1) + 1, updated_at: new Date().toISOString() };
          await Demo.put(Demo.DEMO_STORES.candidates, activeCandidate);
          byId("candidate-detail-message").textContent = "修改只保存到本地演示记录；未晋升为已确认候选信息。";
        }
        renderCandidate(activeCandidate);
        byId("candidate-patch-proposal").classList.add("hidden");
        editShell.complete();
        pendingDirectEdit = null;
        if (window.parent !== window) window.parent.postMessage({ type: "job-radar-v1-detail-updated", library: "personal", sourceKey: `candidate:${itemId}` }, window.location.origin);
      } catch (error) {
        byId("candidate-detail-message").textContent = `保存未完成：${personalErrorCopy(error)}`;
        byId("candidate-detail-message").classList.add("error");
      } finally {
        button.disabled = false;
      }
    });

  }

  let jobApplicationRecords = new Map(), jobLibraryRender = 0, jobStageMenu = null;
  function jobCardMarkup(job) {
    const canonical = job.data_class === "CANONICAL_CONFIRMED";
    const stateBadge = canonical ? "" : '<span class="v1-review-chip">演示数据</span>';
    const state = JobApplications ? jobApplicationRecords.get(job.job_context_id) || JobApplications.initial(job.job_context_id) : null;
    const sourceLink = JobApplications?.sourceLink(job);
    const chip = state ? `<span class="v1-type-chip v1-job-stage-placeholder" aria-hidden="true">${JobApplications.STAGES[state.stage]}</span>` : '<span class="v1-type-chip">职位描述</span>';
    const card = `<a class="v1-candidate-card job" data-transition-key="job:${escapeHtml(job.job_context_id)}" href="/job-detail.html?job=${encodeURIComponent(job.job_context_id)}"><div class="v1-card-top">${chip}${stateBadge}</div><h3>${escapeHtml(job.title)}</h3><p class="v1-card-subtitle">${escapeHtml(cardSubtitleText(job.company, job.location))}</p><p class="v1-card-summary">${escapeHtml(job.summary)}</p><ul>${(job.requirements || []).slice(0, 3).map((item) => `<li>${escapeHtml(item.label)}</li>`).join("")}</ul></a>`;
    const externalLink = sourceLink ? `<a class="v1-job-source-link" href="${escapeHtml(sourceLink.href)}" target="_blank" rel="noopener noreferrer" aria-label="打开${escapeHtml(job.title)}的原始职位链接"><span>职位链接</span><small>${escapeHtml(sourceLink.visible)}</small></a>` : "";
    if (!JobApplications && !externalLink) return card;
    // Keep the dropdown trigger outside the link, while sharing its visual alignment.
    const stageSelect = JobApplications ? `<button type="button" class="runtime-selector v1-job-stage-select" data-job-stage="${escapeHtml(job.job_context_id)}" data-stage="${state.stage}" data-job-title="${escapeHtml(job.title)}" data-revision="${state.revision}" aria-label="${escapeHtml(job.title)}的投递状态：${JobApplications.STAGES[state.stage]}" aria-haspopup="listbox" aria-controls="job-stage-options" aria-expanded="false"><span>${JobApplications.STAGES[state.stage]}</span><span class="runtime-chevron vi-icon" data-icon="chevron-down" aria-hidden="true"></span></button>` : "";
    return `<article class="v1-job-tracked-card${externalLink ? " has-source-link" : ""}">${card}${stageSelect}${externalLink}</article>`;
  }

  function jobGuideCardMarkup() {
    return `<a class="v1-add-guide-card job" data-transition-key="job-guide" href="/jd-import.html"><span class="v1-add-guide-icon" aria-hidden="true">＋</span><span><b>添加职位描述</b></span><p class="v1-guide-copy"><span>点击进入导入页面，建立期望职位卡片。</span><span aria-hidden="true">原件保存在工作区，发送模型前需确认</span></p></a>`;
  }

  async function localizedJobRecords(records) {
    return Promise.all(records.map(async (record) => {
      if (record.job_context_id !== Demo.JOB_FIXTURE.job_context_id || record.copy_locale === "zh-CN") return record;
      const migrated = { ...Demo.clone(Demo.JOB_FIXTURE), imported_from: Demo.clone(record.imported_from || {}), ai_recognized: record.ai_recognized || false, updated_at: new Date().toISOString() };
      await Demo.put(Demo.DEMO_STORES.jobs, migrated);
      return migrated;
    }));
  }

  async function canonicalJobRecords(database = null) {
    if (!Truth || !JobContext) return [];
    const owned = !database;
    const db = database || await Truth.openDatabase();
    try {
      const [revisions, lifecycle, sourceRecords] = await Promise.all([
        JobContext.getAll(db, "job_context_revisions"),
        JobContext.getAll(db, "job_context_lifecycle"),
        JobContext.getAll(db, "source_documents"),
      ]);
      return JobContext.activeRevisions(revisions, lifecycle).map((revision) => JobContext.recordForUi(revision, sourceRecords));
    } finally { if (owned) db.close(); }
  }

  async function canonicalJobRevision(jobContextId, database = null) {
    if (!Truth || !JobContext) return null;
    const owned = !database;
    const db = database || await Truth.openDatabase();
    try {
      const [revisions, lifecycle] = await Promise.all([JobContext.getAll(db, "job_context_revisions"), JobContext.getAll(db, "job_context_lifecycle")]);
      return JobContext.activeRevisions(revisions, lifecycle).find((entry) => entry.context_id === jobContextId) || null;
    } finally { if (owned) db.close(); }
  }

  async function readJobLibrary() {
    const records = await localizedJobRecords(await Demo.getAll(Demo.DEMO_STORES.jobs));
    const canonical = await canonicalJobRecords();
    const legacy = LocalJobLifecycle ? LocalJobLifecycle.libraryJobs(records) : records;
    const canonicalIds = new Set(canonical.map((job) => job.job_context_id));
    const database = await Truth.openDatabase();
    let removed;
    try { removed = new Set((await JobContext.getAll(database, "job_context_lifecycle")).map((entry) => entry.context_id)); } finally { database.close(); }
    return { canonical, legacy: legacy.filter((job) => !canonicalIds.has(job.job_context_id) && !removed.has(job.job_context_id)) };
  }

  async function renderJobLibrary() {
    const rendering = ++jobLibraryRender;
    const { canonical, legacy } = await readJobLibrary();
    const jobs = [...canonical, ...legacy];
    const applications = JobApplications ? await JobApplications.all() : new Map();
    if (rendering !== jobLibraryRender) return;
    jobApplicationRecords = applications;
    const visible = JobApplications ? JobApplications.orderJobs(jobs, applications) : jobs;
    const grid = byId("job-card-grid");
    jobStageMenu?.close();
    grid.innerHTML = jobGuideCardMarkup() + visible.map(jobCardMarkup).join("");
    libraryEditor?.decorate(visible);
    window.requestAnimationFrame(playPendingCardReturn);
  }

  function jobWorkingEdits() {
    if (!activeJobWorkingProposal || !byId("job-working-form")) return {};
    const payload = activeJobWorkingProposal.payload;
    const lines = byId("job-working-requirements").value.split("\n").map((line) => line.trim()).filter(Boolean);
    return {
      title: byId("job-working-title-input").value.trim(),
      company: byId("job-working-company").value.trim(),
      location: byId("job-working-location").value.trim(),
      summary: byId("job-working-summary").value.trim(),
      requirements: lines.map((detail, index) => ({
        requirement_id: payload.requirements[index]?.requirement_id,
        label: detail.length > 36 ? `${detail.slice(0, 34)}…` : detail,
        detail,
        grounding_refs: payload.requirements[index]?.grounding_refs || [],
        content_origin: payload.requirements[index]?.content_origin || "HUMAN_EDITED",
      })),
    };
  }

  function currentJobConversationSubject() {
    if (activeJobWorkingProposal) return JobContext.workingSubjectFor(activeJobWorkingProposal, jobWorkingEdits());
    return activeJobRevision;
  }

  function setJobWorkspaceProgress(steps, currentIndex = steps.length - 1) {
    ModelWorkspaceUI.renderProgress(byId("job-understanding-events"), steps, currentIndex);
  }

  function jobModelWaitCopy(startedAt) {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    if (elapsedSeconds < 15) return "ARIADNE AI 正在理解职位 · 请求已发送";
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const elapsed = minutes ? `${minutes} 分${seconds ? ` ${seconds} 秒` : ""}` : `${seconds} 秒`;
    return `ARIADNE AI 正在理解职位 · 已等待 ${elapsed}`;
  }

  function startJobModelWaitStatus() {
    if (jobModelWaitTimer) window.clearInterval(jobModelWaitTimer);
    const startedAt = Date.now();
    const update = () => ProcessingIndicator.set(byId("job-workspace-processing"), {
      active: true,
      copy: jobModelWaitCopy(startedAt),
      boundary: "原件已安全保存在本机；长文本或图片可能需要几分钟，等待期间不会改用本地结果。",
      state: "MODEL_PROCESSING",
    });
    update();
    jobModelWaitTimer = window.setInterval(update, 15_000);
  }

  function stopJobModelWaitStatus() {
    if (jobModelWaitTimer) window.clearInterval(jobModelWaitTimer);
    jobModelWaitTimer = null;
  }

  function setJobProcessingState(state, copy) {
    const modelMode = refreshJobImportGate().authority.runtime.mode === "model";
    ProcessingIndicator.set(byId("job-processing"), {
      active: !["READY_FOR_REVIEW", "WORKING_READY", "CANCELLED", "FAILED"].includes(state),
      copy,
      boundary: modelMode ? "正在等待模型时不会改用本地结果" : "仅保存原件 · 不进行识别或分析",
      state,
    });
  }

  function showJobModelProcessingWorkspace(sourceName) {
    activeJobWorkingProposal = null;
    activeJobConversationSession = null;
    byId("job-workspace-conversation").innerHTML = '<p class="v1-conversation-empty">职位理解完成后，可以在这里继续对话。</p>';
    ProcessingIndicator.clear(byId("job-workspace-conversation-status"));
    ProductShell.showWorkspace(jobSharedWorkspace(), { source_name: sourceName || "当前职位来源", processing: true, model_workspace_ui: ModelWorkspaceUI, embedded: isEmbeddedDetail });
    setJobWorkspaceProgress(["正在读取职位材料", "正在理解职位内容", "正在提取职位要求", "正在生成职位信息"], 0);
    startJobModelWaitStatus();
  }

  async function showJobWorkingWorkspace(proposal) {
    const checked = Truth.validateProposal(proposal);
    if (checked.proposal_type !== "JOB_CONTEXT" || checked.status !== "AWAITING_REVIEW") throw new Error("job_working_proposal_invalid");
    activeJobWorkingProposal = checked;
    activeJobRevision = null;
    activeJobConversationSession = null;
    const payload = JobContext.validateJobPayload(checked.payload);
    byId("job-working-title-input").value = payload.title || "";
    byId("job-working-company").value = payload.company || "";
    byId("job-working-location").value = payload.location || "";
    byId("job-working-summary").value = payload.summary || "";
    byId("job-working-requirements").value = (payload.requirements || []).map((item) => item.detail).join("\n");
    setJobWorkspaceProgress(["职位材料已准备", "职位内容已读取", "模型已完成理解", "Working Job 已生成"]);
    byId("job-review-surface").classList.add("hidden");
    const database = await Truth.openDatabase();
    try {
      const sourceDocuments = await JobContext.getAll(database, "source_documents");
      activeJobSourceDocuments = checked.source_document_ids.map((sourceId) => sourceDocuments.find((entry) => entry.source_document_id === sourceId)).filter(Boolean);
      activeJobSourceDocument = activeJobSourceDocuments[0] || null;
      const sourceName = activeJobSourceDocuments.map((entry) => entry.filename || entry.label).filter(Boolean).join("、") || selectedJobSource?.name || "当前职位来源";
      ProductShell.showWorkspace(jobSharedWorkspace(), { source_name: sourceName, processing: false, model_workspace_ui: ModelWorkspaceUI, embedded: isEmbeddedDetail });
      byId("job-workspace-save").disabled = false;
      byId("job-workspace-save-status").textContent = "";
      const restored = await restoreJobConversation(database, JobContext.contextIdForProposal(checked));
      renderJobConversationMessages(restored.messages);
    } finally { database.close(); }
  }

  async function savedModelJobProposalForSource(sourceId, sourceIds = selectedJobSources.map(source => source.source_document_id)) {
    const database = await Truth.openDatabase();
    try {
      return (await JobContext.getAll(database, "context_proposals"))
        .filter((proposal) => proposal.proposal_type === "JOB_CONTEXT" && proposal.status === "AWAITING_REVIEW" && proposal.source_document_ids.includes(sourceId)
          && JSON.stringify(proposal.source_document_ids) === JSON.stringify(sourceIds)
          && (proposal.warnings || []).includes("model_generated_non_authoritative"))
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))[0] || null;
    } finally { database.close(); }
  }

  async function saveJobWorkingWorkspace() {
    if (!activeJobWorkingProposal) return;
    const button = byId("job-workspace-save");
    button.disabled = true;
    ProductShell.setFeedback(byId("job-workspace-save-status"), { state: "PENDING", copy: "正在保存…" });
    const database = await Truth.openDatabase();
    try {
      const outcome = await JobContext.persistReview(database, activeJobWorkingProposal, "CONFIRM", jobWorkingEdits());
      transitionJobImportLifecycle(ModelImportLifecycle.STATES.SAVED);
      ProductShell.setFeedback(byId("job-workspace-save-status"), { state: "SUCCESS", copy: "已保存为不可变职位版本。" });
      const sourceKey = `job:${outcome.revision.context_id}`;
      if (!completeEmbeddedImport("jd", sourceKey)) window.location.assign(`/job-detail.html?job=${encodeURIComponent(outcome.revision.context_id)}`);
    } catch (error) {
      button.disabled = false;
      ProductShell.setFeedback(byId("job-workspace-save-status"), { state: "FAILURE", copy: error?.message === "context_version_conflict" ? "职位版本已经变化，请重新打开后保存。" : "保存失败，请重试。" });
      throw error;
    } finally { database.close(); }
  }

  function showJobSource(source) {
    selectedJobSource = source;
    SourceInput.renderBundlePreview({
      container: byId("job-file-preview"), list: byId("job-source-preview-list"),
    }, selectedJobImportType === "Paste" ? [source] : selectedJobSources);
    refreshJobImportGate();
  }

  function resetJobSource() {
    jobSelectionVersion += 1;
    selectedJobSource = null;
    selectedJobSources = [];
    jobModelConsentBundle = null;
    byId("job-file-preview").classList.add("hidden");
    byId("job-page-message").textContent = "";
    byId("job-page-message").classList.remove("error");
    jobExecutionState = "IDLE";
    jobImportLifecycle = null;
    refreshJobImportGate();
  }

  function configureJobImportType(type) {
    selectedJobImportType = type;
    byId("job-import-types").querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.jobImportType === type)));
    byId("job-paste-section").classList.toggle("hidden", type !== "Paste");
    byId("job-file-section").classList.toggle("hidden", type === "Paste");
    if (type !== "Paste") byId("job-file-input").accept = ".pdf,.png,.jpg,.jpeg,.docx,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    resetJobSource();
  }

  async function jobSourceImportState(sourceId, database, modelMode = false) {
    const [sources, proposals, revisions, runs] = await Promise.all([
      JobContext.getAll(database, "source_documents"),
      JobContext.getAll(database, "context_proposals"),
      JobContext.getAll(database, "job_context_revisions"),
      JobContext.getAll(database, "processing_runs"),
    ]);
    const modelWorking = proposals.some((proposal) => proposal.proposal_type === "JOB_CONTEXT" && proposal.source_document_ids?.includes(sourceId) && proposal.status === "AWAITING_REVIEW" && proposal.warnings?.includes("model_generated_non_authoritative"));
    if (modelMode && modelWorking) return "WORKSPACE";
    const pending = proposals.some((proposal) => proposal.proposal_type === "JOB_CONTEXT" && proposal.source_document_ids?.includes(sourceId) && proposal.status === "AWAITING_REVIEW" && !proposal.warnings?.includes("model_generated_non_authoritative"));
    if (pending) return "PENDING_REVIEW";
    if (revisions.some((revision) => revision.context_type === "JOB" && revision.provenance?.source_document_ids?.includes(sourceId))) return "ACTIVE";
    if (!sources.some((source) => source.source_document_id === sourceId)) return "NEW";
    const latest = runs.filter((run) => run.source_document_id === sourceId).sort((a, b) => String(b.finished_at || b.started_at || "").localeCompare(String(a.finished_at || a.started_at || "")))[0];
    return ["FAILED", "CANCELLED"].includes(latest?.status) ? "RETRY" : "RETRY";
  }

  async function acceptJobFiles(files, { replace = false, captured_via: capturedVia = "FILE_PICKER" } = {}) {
    const selectionVersion = ++jobSelectionVersion;
    jobModelConsentBundle = null;
    const selectedFiles = Array.from(files || []);
    const modelMode = refreshJobImportGate().authority.runtime.mode === "model";
    const batchKey = !replace && selectedJobSources[0]?.batch_id ? selectedJobSources[0].batch_id : `job-batch-${crypto.randomUUID()}`;
    const sourceUrl = byId("job-link-input")?.value.trim() || null;
    const settled = await Promise.allSettled(selectedFiles.map((file) => LocalJob.prepareSource(file, batchKey, { source_url: sourceUrl })));
    const prepared = settled.filter((result) => result.status === "fulfilled").map((result) => ({ ...result.value, captured_via: capturedVia, sizeLabel: formatBytes(result.value.size), import_type: "Document" }));
    if (selectionVersion !== jobSelectionVersion) return;
    const database = await Truth.openDatabase();
    try {
      const incoming = [];
      for (const source of LocalContextLifecycle.uniqueSources(prepared)) incoming.push({ ...source, import_state: await jobSourceImportState(source.source_document_id, database, modelMode) });
      selectedJobSources = SourceInput.mergeSources(selectedJobSources, incoming, { replace });
    } finally { database.close(); }
    if (!modelMode || selectedJobSources.some((source) => ["NEW", "RETRY"].includes(source.import_state))) beginJobImportLifecycle();
    else if (modelMode && await savedModelJobProposalForSource(selectedJobSources[0]?.source_document_id)) beginJobImportLifecycle(ModelImportLifecycle.STATES.WORKING);
    else if (modelMode && selectedJobSources.some((source) => source.import_state === "WORKSPACE")) beginJobImportLifecycle();
    else if (selectedJobSources.some((source) => source.import_state === "PENDING_REVIEW")) beginJobImportLifecycle(ModelImportLifecycle.STATES.REVIEWING);
    else beginJobImportLifecycle(ModelImportLifecycle.STATES.SAVED);
    if (selectedJobSources[0]) showJobSource(selectedJobSources[0]);
    else resetJobSource();
    const duplicateCount = prepared.length - LocalContextLifecycle.uniqueSources(prepared).length;
    const rejectedCount = settled.filter((result) => result.status === "rejected").length;
    const activeCount = selectedJobSources.filter((source) => source.import_state === "ACTIVE").length;
    const pendingCount = selectedJobSources.filter((source) => source.import_state === "PENDING_REVIEW").length;
    const messages = [];
    if (selectedJobSources.length) messages.push(`已选择 ${selectedJobSources.length} 份原件。`);
    if (duplicateCount) messages.push(`${duplicateCount} 个完全相同的文件已合并处理。`);
    if (activeCount) messages.push(`${activeCount} 个来源已导入，不会重复生成。`);
    if (pendingCount) messages.push(`${pendingCount} 个来源将恢复现有待审核草稿。`);
    if (rejectedCount) {
      const reasons = [...new Set(settled.filter((result) => result.status === "rejected").map((result) => jobErrorCopy(result.reason)))];
      messages.push(`${rejectedCount} 个文件已跳过。${reasons.join(" ")}`);
    }
    byId("job-page-message").textContent = messages.join(" ");
    byId("job-page-message").classList.toggle("error", !selectedJobSources.length);
    await renderAwaitingJobReviews({ reset: true });
    refreshJobImportGate();
  }

  async function readJobSourceForModel(database, source, sourceDocument, runtimeSnapshot, signal) {
    const resolved = await LocalJob.resolveRawSource(database, sourceDocument);
    const dataUrl = await LocalJob.readAsDataURL(resolved.file || resolved.blob, sourceDocument.mime_type);
    const image = ["image/png", "image/jpeg"].includes(sourceDocument.mime_type);
    const response = await (globalThis.AriadneTransport || globalThis).fetch("/api/local-source-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        filename: sourceDocument.filename,
        media_type: sourceDocument.mime_type,
        material_type: "JOB",
        source_document_id: sourceDocument.source_document_id,
        expected_content_hash: sourceDocument.content_hash,
        runtime_snapshot: runtimeSnapshot,
        ...(image ? { image_data_url: dataUrl } : { document_data_url: dataUrl }),
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.read_only !== true || result?.writeback !== false || result?.model_call_made !== false || result?.network_call_made !== false) {
      throw new Error(result?.error || "job_model_source_preparation_invalid");
    }
    return {
      preparation_result: result,
      source_input: image ? { source_document_id: sourceDocument.source_document_id, image_data_url: dataUrl }
        : sourceDocument.mime_type === "application/pdf" ? { source_document_id: sourceDocument.source_document_id, document_data_url: dataUrl } : null,
    };
  }

  async function callJobModelRuntime(request, signal) {
    const signatureResponse = await (globalThis.AriadneTransport || globalThis).fetch("/api/job-model-import-runtime-signature", { cache: "no-store", signal });
    const signaturePayload = await signatureResponse.json().catch(() => null);
    if (!signatureResponse.ok || !JobModel.runtimeSignaturesMatch(JobModel.runtimeSignature(), signaturePayload?.runtime_signature)) {
      const error = new Error("RUNTIME_CONTRACT_VERSION_MISMATCH");
      error.code = "RUNTIME_CONTRACT_VERSION_MISMATCH";
      error.network_call_made = false;
      throw error;
    }
    const response = await (globalThis.AriadneTransport || globalThis).fetch("/api/job-model-structure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify(request),
    });
    const result = await response.json().catch(() => ({ error: "deepseek_response_malformed", network_call_made: true }));
    if (!response.ok) {
      const error = new Error(result.error || "deepseek_provider_http_error");
      error.code = result.error || "deepseek_provider_http_error";
      error.failure_layer = result.failure_layer || "provider";
      error.network_call_made = result.network_call_made === true;
      throw error;
    }
    return result;
  }

  async function openJobModelConsent() {
    if (!JobModel || !selectedJobSource || !selectedJobSources.length) throw new Error("job_model_source_bundle_invalid");
    const gate = JobModel.assertEligibleGate(refreshJobImportGate());
    const selectionVersion = jobSelectionVersion;
    const sources = selectedJobSources.map(source => ({ ...source, source_url: byId("job-link-input").value.trim() || null }));
    const database = await Truth.openDatabase();
    let sourceDocuments;
    try {
      sourceDocuments = await SourceInput.persistDurableBundle({
        database,
        sources,
        sourceDocumentFor: LocalJob.sourceDocumentFor,
        persistDurableSource: LocalJob.persistCanonicalSource,
      });
      await RawSource.persistArchive(database, sourceDocuments, sources[0]?.source_url || null);
    } finally { database.close(); }
    const currentGate = refreshJobImportGate();
    if (selectionVersion !== jobSelectionVersion || currentGate.authority.runtime.mode !== "model") throw new Error("job_model_consent_mismatch");
    JobModel.assertEligibleGate(gate);
    if (jobImportLifecycle?.state === ModelImportLifecycle.STATES.SOURCE_SELECTED) transitionJobImportLifecycle(ModelImportLifecycle.STATES.SOURCE_STORED);
    jobModelConsentSelectionVersion = selectionVersion;
    jobModelConsentRuntimeIdentity = runtimeIdentity(currentGate.authority.runtime);
    jobModelConsentId = `consent-job-model-import-${crypto.randomUUID()}`;
    const consentBundle = await JobModel.sourceBundleFor(sources, sourceDocuments);
    // Execution must consume the same source snapshot that the user approved,
    // including a link entered after the files were selected.
    selectedJobSources = sources;
    selectedJobSource = sources[0] || null;
    jobModelConsentBundle = consentBundle;
    byId("job-model-consent-provider").textContent = gate.authority.runtime.provider === "codex" ? "Codex / OpenAI" : gate.authority.runtime.provider;
    byId("job-model-consent-model").textContent = gate.authority.runtime.model;
    const dialog = byId("job-model-consent-dialog");
    if (!dialog.open) dialog.showModal();
  }

  function runJobModelProcessing(gate, confirmedAt, consentId) {
    if (activeJobModelOperation?.consentId === consentId) return activeJobModelOperation.promise;
    const promise = executeJobModelProcessing(gate, confirmedAt, consentId);
    activeJobModelOperation = { consentId, promise };
    promise.then(
      () => { if (activeJobModelOperation?.promise === promise) activeJobModelOperation = null; },
      () => { if (activeJobModelOperation?.promise === promise) activeJobModelOperation = null; },
    );
    return promise;
  }

  async function executeJobModelProcessing(gate, confirmedAt, consentId) {
    JobModel.assertEligibleGate(gate);
    const sources = [...selectedJobSources];
    const source = sources[0];
    const sourceBundle = jobModelConsentBundle;
    if (!source || !sourceBundle || JSON.stringify(sourceBundle.source_document_ids) !== JSON.stringify(sources.map((entry) => entry.source_document_id))) throw new Error("job_model_source_bundle_invalid");
    const runtimeSnapshot = JobModel.createRuntimeSnapshot({ operation: gate.operation, runtime: gate.authority.runtime });
    const consent = JobModel.consentFor(sourceBundle, runtimeSnapshot, confirmedAt, consentId);
    const operationIdentity = await JobModel.operationIdentityFor(sourceBundle, runtimeSnapshot, consent);
    const attemptGeneration = ++jobModelAttemptGeneration;
    const selectionVersion = jobSelectionVersion;
    const abortController = new AbortController();
    jobProcessingInProgress = true;
    if (jobImportLifecycle?.state !== ModelImportLifecycle.STATES.SOURCE_STORED) throw new Error("job_import_source_not_stored");
    transitionJobImportLifecycle(ModelImportLifecycle.STATES.MODEL_PROCESSING);
    jobBatchAbortController = abortController;
    byId("replace-job-file").textContent = "取消本次理解";
    showJobModelProcessingWorkspace(sources.map((entry) => entry.name).join("、"));
    refreshJobImportGate();
    await ConversationUI.waitForIndicatorPaint();
    let database = null;
    let run = null;
    try {
      database = await Truth.openDatabase();
      await Truth.persistRecord(database, "runtime_snapshots", runtimeSnapshot);
      run = JobModel.processingRunFor(source, runtimeSnapshot.snapshot_id, "PENDING", { run_id: `run-${operationIdentity.operation_id}` });
      if (!await JobModel.claimProcessingRun(database, run)) return;
      const sourceDocuments = [];
      for (const entry of sources) {
        const sourceDocument = await RawSource.sourceDocumentForId(database, entry.source_document_id);
        await RawSource.resolveRawSource(database, sourceDocument);
        sourceDocuments.push(sourceDocument);
      }
      const startedAt = new Date().toISOString();
      run = JobModel.processingRunFor(source, runtimeSnapshot.snapshot_id, "RUNNING", { run_id: run.run_id, started_at: startedAt });
      await Truth.persistRecord(database, "processing_runs", run);
      setJobWorkspaceProgress(["职位材料已准备", "正在理解职位内容", "正在提取职位要求", "正在生成职位信息"], 1);
      const sourceReadResults = await Promise.all(sourceDocuments.map((sourceDocument, index) => readJobSourceForModel(database, sources[index], sourceDocument, runtimeSnapshot, abortController.signal)));
      const preparations = JobModel.boundedBundlePreparations(sourceDocuments, sourceReadResults.map((entry) => entry.preparation_result));
      const sourceInputs = sourceReadResults.map((entry) => entry.source_input).filter(Boolean);
      if (abortController.signal.aborted) throw Object.assign(new Error("job_model_import_cancelled"), { name: "AbortError" });
      setJobWorkspaceProgress(["职位材料已准备", "职位内容已读取", "正在提取职位要求", "正在生成职位信息"], 2);
      const request = JobModel.requestFor({ source_bundle: sourceBundle, source_documents: sourceDocuments, source_preparations: preparations, source_inputs: sourceInputs, snapshot: runtimeSnapshot, run, consent, operation_identity: operationIdentity });
      const result = await callJobModelRuntime(request, abortController.signal);
      setJobWorkspaceProgress(["职位材料已准备", "职位内容已读取", "职位要求已提取", "正在生成职位信息"], 3);
      const proposal = JobModel.proposalFor({ sources, source_documents: sourceDocuments, source_preparations: preparations, source_bundle: sourceBundle, run, result, snapshot: runtimeSnapshot });
      const isCurrent = () => attemptGeneration === jobModelAttemptGeneration && selectionVersion === jobSelectionVersion && refreshJobImportGate().authority.runtime.mode === "model" && JSON.stringify(selectedJobSources.map((entry) => entry.source_document_id)) === JSON.stringify(sourceBundle.source_document_ids);
      await JobModel.persistSuccessfulResult(database, run, proposal, abortController.signal, isCurrent);
      if (!isCurrent()) throw new Error("job_model_processing_run_stale");
      transitionJobImportLifecycle(ModelImportLifecycle.STATES.WORKING);
      setJobProcessingState("WORKING_READY", "Working Job 已生成");
      await showJobWorkingWorkspace(proposal);
      byId("job-page-message").textContent = "已从真实来源生成非权威 Working Job；编辑或继续对话后，由你保存为正式职位。";
      byId("job-page-message").classList.remove("error");
    } catch (error) {
      if (database && run && ["PENDING", "RUNNING"].includes(run.status)) {
        const terminal = error?.name === "AbortError"
          ? Truth.cancelProcessingRun(run, new Date().toISOString())
          : JobModel.processingRunFor(source, runtimeSnapshot.snapshot_id, "FAILED", { run_id: run.run_id, started_at: run.started_at || new Date().toISOString(), error_code: String(error?.code || error?.message || "job_model_execution_failed").slice(0, 180) });
        await Truth.persistRecord(database, "processing_runs", terminal);
      }
      if (jobImportLifecycle?.state === ModelImportLifecycle.STATES.MODEL_PROCESSING) transitionJobImportLifecycle(ModelImportLifecycle.STATES.MODEL_FAILED);
      if (error?.name === "AbortError") {
        byId("job-ai-workspace").classList.add("hidden");
        document.body.classList.remove("v1-workspace-open", "v1-workspace-view");
        byId("job-page-message").textContent = "本次 ARIADNE AI 职位理解已取消；没有保存模型职位提案，也没有执行本地整理。";
        byId("job-page-message").classList.remove("error");
        return;
      }
      error.jobModelExecution = true;
      throw error;
    } finally {
      database?.close?.();
      if (attemptGeneration === jobModelAttemptGeneration) {
        stopJobModelWaitStatus();
        jobBatchAbortController = null;
        jobProcessingInProgress = false;
        byId("replace-job-file").textContent = "替换";
        byId("job-processing").classList.add("hidden");
        refreshJobImportGate();
      }
    }
  }

  async function runJobProcessing() { return archiveSelectedSources("job"); }

  function jobReviewMarkup(proposal, position, total) {
    const job = proposal.payload;
    const requirements = (job.requirements || []).map((item) => item.detail).join("\n");
    const unresolved = (job.uncertainties || []).length ? ` · ${job.uncertainties.length} 个字段需要确认` : "";
    const modelProposal = proposal.warnings?.includes("model_generated_non_authoritative") || Object.values(job.field_provenance || {}).some((origin) => origin === "MODEL_PROPOSED");
    const title = modelProposal ? "职位描述 · ARIADNE AI 提案" : "职位描述 · 本地结构化草稿";
    const note = modelProposal ? `真实来源已保存在本地${unresolved}；模型理解尚未成为正式职位。` : `真实来源已保存在本地${unresolved}；确定性抽取不代表语义保证。`;
    const resultLabel = modelProposal ? "模型理解结果" : "本地整理结果";
    return `<article class="v1-review-card" data-job-proposal-id="${escapeHtml(proposal.proposal_id)}"><p class="v1-review-progress">第 ${position} / ${total} 条</p><h3>${escapeHtml(title)}</h3><p class="v1-review-note">${escapeHtml(note)}</p><section class="v1-review-item"><div class="v1-review-source"><p class="v1-section-label">来源证据</p><p class="v1-review-evidence">${escapeHtml(proposal.grounding_refs?.[0]?.excerpt_or_reference || "原始来源已保留")}</p><small>${escapeHtml(proposal.grounding_refs?.[0]?.location || "document")}</small></div><div class="v1-review-result"><p class="v1-section-label">${escapeHtml(resultLabel)}</p><label>职位名称<input data-job-field="title" value="${escapeHtml(job.title || "")}"></label><label>公司<input data-job-field="company" value="${escapeHtml(job.company || "")}"></label><label>地点<input data-job-field="location" value="${escapeHtml(job.location || "")}"></label><label>摘要<textarea data-job-field="summary">${escapeHtml(job.summary || "")}</textarea></label><label>任职要求（每行一条）<textarea data-job-field="requirements">${escapeHtml(requirements)}</textarea></label></div></section><div class="v1-button-row"><button type="button" class="v1-primary-button" data-job-review-action="confirm">确认并创建职位版本</button><button type="button" class="v1-tertiary-button" data-job-review-action="reject">拒绝</button></div></article>`;
  }

  async function renderAwaitingJobReviews({ advance = false, reset = false } = {}) {
    if (!JobContext || !byId("job-review-surface")) return [];
    const database = await Truth.openDatabase();
    let pending;
    try {
      const selectedSourceIds = new Set((selectedJobSources.length ? selectedJobSources : [selectedJobSource]).filter(Boolean).map((source) => source.source_document_id));
      pending = (await JobContext.getAll(database, "context_proposals"))
        .filter((proposal) => proposal.proposal_type === "JOB_CONTEXT" && proposal.status === "AWAITING_REVIEW")
        .filter((proposal) => !proposal.warnings?.includes("model_generated_non_authoritative"))
        .filter((proposal) => selectedSourceIds.size > 0 && proposal.source_document_ids.some((sourceId) => selectedSourceIds.has(sourceId)))
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.proposal_id.localeCompare(b.proposal_id));
    } finally { database.close(); }
    if (reset || !jobReviewSessionTotal) { jobReviewSessionTotal = pending.length; jobReviewSessionResolved = 0; }
    else if (advance) jobReviewSessionResolved += 1;
    if (pending.length > jobReviewSessionTotal - jobReviewSessionResolved) jobReviewSessionTotal = jobReviewSessionResolved + pending.length;
    byId("job-review-surface").classList.toggle("hidden", !pending.length);
    const modelReview = pending[0] && (pending[0].warnings?.includes("model_generated_non_authoritative") || Object.values(pending[0].payload?.field_provenance || {}).some((origin) => origin === "MODEL_PROPOSED"));
    byId("job-review-heading").textContent = modelReview ? "ARIADNE AI 职位提案" : "职位结构化草稿";
    byId("job-review-heading").nextElementSibling.textContent = modelReview ? "模型结果来自真实职位来源，尚未成为正式职位；请逐字段审核。" : "结果来自本地确定性抽取，可能保留未知字段；请以原始职位材料为准逐条审核。";
    byId("job-review-list").innerHTML = pending.length ? jobReviewMarkup(pending[0], Math.min(jobReviewSessionResolved + 1, jobReviewSessionTotal), jobReviewSessionTotal) : "";
    if (!pending.length) { jobReviewSessionTotal = 0; jobReviewSessionResolved = 0; }
    return pending;
  }

  async function reviewJobDraft(proposalId, action, card) {
    const buttons = [...card.querySelectorAll("[data-job-review-action]")];
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const database = await Truth.openDatabase();
      const proposal = (await JobContext.getAll(database, "context_proposals")).find((entry) => entry.proposal_id === proposalId);
      if (!proposal || proposal.status !== "AWAITING_REVIEW") { database.close(); throw new Error("job_review_draft_not_found"); }
      let confirmed = null;
      try {
        if (action === "reject") await JobContext.persistReview(database, proposal, "REJECT");
        else {
          const value = (field) => card.querySelector(`[data-job-field="${field}"]`).value.trim();
          if (!value("title")) throw new Error("job_title_required");
          const requirementLines = value("requirements").split("\n").map((line) => line.trim()).filter(Boolean);
          const requirements = requirementLines.map((detail, index) => {
            const existing = proposal.payload.requirements[index];
            return {
              requirement_id: existing?.requirement_id,
              label: detail.length > 36 ? `${detail.slice(0, 34)}…` : detail,
              detail,
              grounding_refs: existing?.grounding_refs || [],
              content_origin: existing?.detail === detail ? existing.content_origin : "HUMAN_EDITED",
            };
          });
          confirmed = await JobContext.persistReview(database, proposal, "CONFIRM", { title: value("title"), company: value("company"), location: value("location"), summary: value("summary"), requirements });
        }
      } finally { database.close(); }
      const remaining = await renderAwaitingJobReviews({ advance: true });
      updateJobReviewLifecycle(remaining.length);
      if (!remaining.length && jobImportLifecycle?.state === ModelImportLifecycle.STATES.READY_TO_SAVE) transitionJobImportLifecycle(ModelImportLifecycle.STATES.SAVED);
      byId("job-page-message").textContent = remaining.length ? "当前草稿已处理，继续审核下一条。" : "全部职位草稿已审核；确认内容已保存为不可变职位版本。";
      byId("job-page-message").classList.remove("error");
      if (!remaining.length) {
        const sourceKey = confirmed ? `job:${confirmed.revision.context_id}` : "job-guide";
        if (!completeEmbeddedImport("jd", sourceKey)) returnToCardLibrary("/jd.html", sourceKey);
      }
    } catch (error) {
      buttons.forEach((button) => { button.disabled = false; });
      throw error;
    }
  }

  function initJobLibrary() {
    libraryEditor = createLibraryEditor("job-card-grid", "job-page-message", removeJobLibraryCard, renderJobLibrary);
    const showLibraryError = error => {
      byId("job-page-message").textContent = error.message || "职位列表更新失败，请重试。";
      byId("job-page-message").classList.add("error");
    };
    renderJobLibrary().catch(showLibraryError);
    if (!JobApplications) return;
    let saving = false, pendingRefresh = false;
    let channel = null;
    const refresh = () => {
      // Keep the source card mounted while its detail window animates back to it.
      if (document.body.classList.contains("v1-detail-overlay-open")) { pendingRefresh = true; return Promise.resolve(); }
      pendingRefresh = false;
      return renderJobLibrary().catch(showLibraryError);
    };
    new MutationObserver(() => { if (pendingRefresh && !document.body.classList.contains("v1-detail-overlay-open")) refresh(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    const connect = () => {
      if (!channel && typeof BroadcastChannel === "function") {
        channel = new BroadcastChannel("ariadne-job-applications");
        channel.onmessage = refresh;
      }
    };
    connect();
    window.addEventListener("focus", refresh);
    window.addEventListener("pagehide", () => { channel?.close(); channel = null; });
    window.addEventListener("pageshow", event => { connect(); if (event.persisted) refresh(); });
    jobStageMenu = window.AriadneJobStageMenu.bind({ grid: byId("job-card-grid"), onSelect: async (select, value) => {
      if (!select || saving) return;
      const state = jobApplicationRecords.get(select.dataset.jobStage) || JobApplications.initial(select.dataset.jobStage);
      if (value === state.stage) return;
      saving = true;
      const controls = [...byId("job-card-grid").querySelectorAll("[data-job-stage]")];
      controls.forEach(control => { control.disabled = true; });
      select.setAttribute("aria-busy", "true");
      try {
        const result = await JobApplications.save(state.job_context_id, { stage: value, outcome: value === "CLOSED" ? state.outcome : "", note: state.note }, Number(select.dataset.revision));
        channel?.postMessage({ changed: true });
        await refresh();
        byId("job-page-message").textContent = `“${select.dataset.jobTitle}”已设为${JobApplications.STAGES[result.stage]}。${result.stage === "CLOSED" ? "卡片已移到列表末尾，备注可在详情中编辑。" : ""}`;
        byId("job-page-message").classList.remove("error");
      } catch (error) { await refresh(); showLibraryError(error); }
      finally {
        saving = false; controls.forEach(control => { control.disabled = false; }); select.removeAttribute("aria-busy");
        document.querySelector(`[data-job-stage="${CSS.escape(state.job_context_id)}"]`)?.focus({ preventScroll: true });
      }
    } });
  }

  function initJobImport() {
    ProductShell.bindImportShell(document);
    jobSharedWorkspace();
    renderSavedSources("job").catch(showJobError);
    byId("saved-job-source-select").addEventListener("change", event => {
      if (event.target.value && !jobProcessingInProgress) selectSavedJobSources(event.target.value).catch(showJobError);
    });
    byId("save-job-source").addEventListener("click", () => runJobProcessing().catch(showJobError));
    byId("job-link-input").addEventListener("input", () => {
      if (selectedJobSources.length) { jobSelectionVersion += 1; jobModelConsentBundle = null; beginJobImportLifecycle(); refreshJobImportGate(); }
    });
    byId("job-import-types").addEventListener("click", (event) => {
      const button = event.target.closest("[data-job-import-type]");
      if (!button) return;
      configureJobImportType(button.dataset.jobImportType);
    });
    byId("job-paste-input").addEventListener("input", async (event) => {
      const text = event.target.value;
      if (!text.trim()) { resetJobSource(); return; }
      const selectionVersion = ++jobSelectionVersion;
      const source = await LocalJob.preparePastedText(text, `job-batch-${crypto.randomUUID()}`, byId("job-link-input")?.value.trim() || null);
      const database = await Truth.openDatabase();
      const modelMode = refreshJobImportGate().authority.runtime.mode === "model";
      const importState = await jobSourceImportState(source.source_document_id, database, modelMode);
      database.close();
      if (selectionVersion !== jobSelectionVersion || event.target.value !== text) return;
      selectedJobSource = { ...source, sizeLabel: `${text.length} 字符`, import_type: "Paste", import_state: importState };
      selectedJobSources = [selectedJobSource];
      if (!modelMode || ["NEW", "RETRY"].includes(selectedJobSource.import_state)) beginJobImportLifecycle();
      else if (modelMode && selectedJobSource.import_state === "WORKSPACE") beginJobImportLifecycle(ModelImportLifecycle.STATES.WORKING);
      else if (selectedJobSource.import_state === "PENDING_REVIEW") beginJobImportLifecycle(ModelImportLifecycle.STATES.REVIEWING);
      else beginJobImportLifecycle(ModelImportLifecycle.STATES.SAVED);
      showJobSource(selectedJobSource);
      await renderAwaitingJobReviews({ reset: true });
    });
    jobSourceInputBinding = SourceInput.bind({
      dropzone: byId("job-dropzone"), input: byId("job-file-input"),
      onFiles: (files, options) => acceptJobFiles(files, options).catch(showJobError),
      onAccepted: (count) => { byId("job-page-message").textContent = `已从剪贴板添加 ${count} 张图片到当前职位来源组。`; },
    });
    byId("job-source-preview-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-source-remove]");
      if (!button || jobProcessingInProgress || selectedJobImportType === "Paste") return;
      selectedJobSources.splice(Number(button.dataset.sourceRemove), 1);
      jobSelectionVersion += 1;
      selectedJobSource = selectedJobSources[0] || null;
      if (selectedJobSource) { beginJobImportLifecycle(); showJobSource(selectedJobSource); }
      else resetJobSource();
    });
    byId("replace-job-file").addEventListener("click", () => {
      if (jobProcessingInProgress) {
        jobBatchAbortController?.abort();
        setJobProcessingState("CANCELLING", refreshJobImportGate().authority.runtime.mode === "model" ? "正在取消本次 ARIADNE AI 理解" : "原件保存中");
        return;
      }
      if (selectedJobImportType === "Paste") byId("job-paste-input").focus();
      else jobSourceInputBinding.openChooser({ replace: false });
    });
    byId("start-job-processing").addEventListener("click", () => {
      const gate = refreshJobImportGate();
      const operation = gate.authority.runtime.mode === "model" && gate.allowed
        ? jobExecutionState === "WORKING"
          ? savedModelJobProposalForSource(selectedJobSource.source_document_id).then((proposal) => proposal ? showJobWorkingWorkspace(proposal) : Promise.reject(new Error("job_working_proposal_missing")))
          : openJobModelConsent()
        : runJobProcessing();
      Promise.resolve(operation).catch(showJobError);
    });
    byId("job-workspace-save").addEventListener("click", () => saveJobWorkingWorkspace().catch(showJobError));
    byId("job-workspace-composer").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = byId("job-workspace-message");
      const content = input.value.trim();
      if (!content) return;
      const draft = ConversationUI.takeDraft(input);
      submitJobConversation(content).then(ok => draft.finish(ok !== true)).catch(error => { draft.finish(true); showJobError(error); });
    });
    byId("job-review-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-job-review-action]");
      const card = event.target.closest("[data-job-proposal-id]");
      if (!button || !card) return;
      reviewJobDraft(card.dataset.jobProposalId, button.dataset.jobReviewAction, card).catch(showJobError);
    });
    byId("job-model-consent-dialog").addEventListener("cancel", (event) => event.preventDefault());
    byId("cancel-job-model-consent").addEventListener("click", () => byId("job-model-consent-dialog").close());
    byId("confirm-job-model-consent").addEventListener("click", () => {
      try {
        const gate = JobModel.assertEligibleGate(refreshJobImportGate());
        if (jobModelConsentSelectionVersion !== jobSelectionVersion || gate.authority.runtime.mode !== "model" || jobModelConsentRuntimeIdentity !== runtimeIdentity(gate.authority.runtime)) throw new Error("job_model_consent_mismatch");
        byId("job-model-consent-dialog").close();
        runJobModelProcessing(gate, new Date().toISOString(), jobModelConsentId).catch(showJobError);
      } catch (error) {
        byId("job-model-consent-dialog").close();
        showJobError(error);
      }
    });
    byId("job-model-failure-dialog").addEventListener("cancel", (event) => event.preventDefault());
    byId("dismiss-job-model-failure").addEventListener("click", () => byId("job-model-failure-dialog").close());
    refreshJobImportGate();
    configureJobImportType("Document");
    renderAwaitingJobReviews({ reset: true }).catch(showJobError);
  }

  function showJobError(error) {
    jobProcessingInProgress = false;
    const modelFailure = error?.jobModelExecution === true;
    if (jobImportLifecycle?.state === ModelImportLifecycle?.STATES.MODEL_PROCESSING) transitionJobImportLifecycle(ModelImportLifecycle.STATES.MODEL_FAILED);
    ProductShell.setFeedback(byId("job-page-message"), { state: "FAILURE", copy: modelFailure ? `MODEL_FAILED：${jobErrorCopy(error)} 没有自动执行本地整理。` : `无法整理职位：${jobErrorCopy(error)}` });
    refreshJobImportGate();
    byId("job-processing")?.classList.add("hidden");
    if (modelFailure) {
      byId("job-ai-workspace")?.classList.add("hidden");
      document.body.classList.remove("v1-workspace-open", "v1-workspace-view");
      const dialog = byId("job-model-failure-dialog");
      if (!dialog.open) dialog.showModal();
    }
  }

  function renderJobConversationMessages(messages, { include_pending_user: includePendingUser = true } = {}) {
    const target = byId("job-workspace-conversation") || byId("job-conversation-messages");
    if (!target) return;
    const visible = JobConversation.connectedHistory(messages);
    if (includePendingUser) {
      const latest = [...messages].sort((left, right) => String(left.created_at).localeCompare(String(right.created_at))).at(-1);
      if (latest?.role === "USER" && !visible.some((entry) => entry.message_id === latest.message_id)) visible.push(latest);
    }
    ConversationUI.renderMessages(target, visible, { empty_text: "可以询问岗位要求、证据差距、项目或简历表达；结论不会自动改写职位或个人资料。", text_for: (message) => ConversationUI.humanSafeText(message.content ?? message.text) });
    window.AriadnePersonalMemoryBridge?.attachActions(target, visible, { type: "JOB", job_context_id: activeJobRevision?.context_id || null });
  }

  function showJobChangeProposal(proposal) {
    activeJobChangeProposal = proposal || null;
    const panel = byId("job-patch-proposal");
    if (!panel) return;
    panel.classList.toggle("hidden", !proposal);
    if (!proposal) return;
    const stage = proposal.contract_id === JobApplications.PROPOSAL_CONTRACT;
    const fieldLabels = { title: "职位名称", company: "公司", location: "地点", summary: "摘要" };
    const label = stage ? "投递状态" : fieldLabels[proposal.field] || proposal.field;
    byId("job-patch-before").textContent = `${label}：${stage ? JobApplications.STAGES[proposal.before_value] : proposal.before_value || "（空）"}`;
    byId("job-patch-after").textContent = `${label}：${stage ? JobApplications.STAGES[proposal.desired_value] : proposal.desired_value}`;
    byId("job-patch-reason").textContent = proposal.reason;
  }

  async function restoreJobConversation(database, jobContextId) {
    const session = JobConversation.createSession(jobContextId);
    activeJobConversationSession = await JobConversationPersistence.ensureSession(database, session);
    window.AriadneRuntimeSelection?.bind(byId("job-workspace-composer") ? "job-workspace-composer" : "job-conversation-form", "job_conversation", activeJobConversationSession.conversation_id);
    const [messages, proposals, decisions] = await Promise.all([
      JobConversationPersistence.messages(database, session.conversation_id),
      JobConversationPersistence.getAll(database, "job_change_proposals"),
      JobConversationPersistence.getAll(database, "job_change_decisions"),
    ]);
    const decided = new Set(decisions.map((entry) => entry.job_change_proposal_id));
    const pending = proposals.filter((entry) => entry.job_context_id === jobContextId && !decided.has(entry.job_change_proposal_id)
      && (entry.contract_id === JobApplications.PROPOSAL_CONTRACT || entry.contract_id === JobContext.CHANGE_PROPOSAL_CONTRACT))
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))[0] || null;
    renderJobConversationMessages(messages);
    showJobChangeProposal(pending);
    return { session: activeJobConversationSession, messages };
  }

  async function callJobConversationRuntime(request) {
    const signatureResponse = await (globalThis.AriadneTransport || globalThis).fetch("/api/job-conversation-runtime-signature", { cache: "no-store" });
    const signaturePayload = await signatureResponse.json().catch(() => null);
    if (!signatureResponse.ok || !JobConversation.runtimeSignaturesMatch(JobConversation.runtimeSignature(), signaturePayload?.runtime_signature)) {
      const error = new Error("RUNTIME_CONTRACT_VERSION_MISMATCH");
      error.code = "RUNTIME_CONTRACT_VERSION_MISMATCH";
      error.network_call_made = false;
      throw error;
    }
    const transport = window.AriadneConversationTurnTransport;
    if (!transport) throw new Error("CONVERSATION_TURN_TRANSPORT_UNAVAILABLE");
    return transport.execute({ request, domain: "JOB", endpoint: "/api/job-conversation-turn",
      fallback_error: "JOB_CONVERSATION_FAILED", create_error: ({ result }) => {
      const error = new Error(result.error || "JOB_CONVERSATION_FAILED");
      error.code = result.error || "JOB_CONVERSATION_FAILED";
      error.network_call_made = result.network_call_made === true;
      return error;
    } });
  }

  function previousCandidateSnapshot(analysis) {
    if (!analysis?.candidate_observation) return null;
    return {
      contract_id: JobCandidateContext.SNAPSHOT_CONTRACT,
      confirmed_manifest: analysis.candidate_observation.confirmed_manifest,
      working_manifest: analysis.candidate_observation.working_manifest,
      provider_view: analysis.candidate_observation.provider_view || null,
      confirmed_fingerprint: analysis.candidate_observation.confirmed_fingerprint,
      working_fingerprint: analysis.candidate_observation.working_fingerprint,
      aggregate_fingerprint: analysis.candidate_observation.aggregate_fingerprint,
    };
  }

  async function retrieveJobTurnSources(database, humanMessage, runtimeSnapshot, candidateSnapshot, previousAnalysis, jobSubject) {
    const previousNeed = previousAnalysis?.output?.source_need || null;
    const explicitCue = /(?:原文|来源|证据原句|具体措辞|source|evidence|quote)/iu.test(humanMessage);
    const structuredSufficient = !previousNeed && !explicitCue;
    const purpose = previousNeed?.purpose || (/(?:候选|简历|经历|candidate|resume)/iu.test(humanMessage) ? "CANDIDATE_EVIDENCE_DETAIL" : "JOB_REQUIREMENT_DETAIL");
    const candidateTerms = SourceRetrieval.normalizeTerms([humanMessage, previousNeed?.reason || ""]);
    const candidateEntries = [
      ...candidateSnapshot.confirmed_manifest.map((manifest, index) => ({ manifest, semantic: candidateSnapshot.provider_view.confirmed[index] })),
      ...candidateSnapshot.working_manifest.map((manifest, index) => ({ manifest, semantic: candidateSnapshot.provider_view.working[index] })),
    ];
    const candidateSourceIds = candidateEntries.filter((entry) => SourceRetrieval.scoreText(JSON.stringify(entry.semantic), candidateTerms) > 0).flatMap((entry) => entry.manifest.source_ids || []);
    const requested = purpose === "CANDIDATE_EVIDENCE_DETAIL"
      ? candidateSourceIds
      : jobSubject.provenance.source_document_ids;
    const [sourceDocuments, extractionArtifacts] = await Promise.all([
      JobContext.getAll(database, "source_documents"),
      JobContext.getAll(database, "extraction_artifacts"),
    ]);
    return SourceRetrieval.retrieve({
      mode: "model",
      purpose,
      structured_sufficient: structuredSufficient,
      requested_source_document_ids: [...new Set(requested)],
      source_documents: sourceDocuments,
      extraction_artifacts: extractionArtifacts,
      query_terms: [humanMessage, previousNeed?.reason || ""],
      raw_text_reader: async (source) => {
        const resolved = await LocalJob.resolveRawSource(database, source);
        const dataUrl = await LocalJob.readAsDataURL(resolved.file || resolved.blob, source.mime_type);
        const payload = {
          filename: source.filename,
          media_type: source.mime_type,
          material_type: source.material_type,
          source_document_id: source.source_document_id,
          expected_content_hash: source.content_hash,
          runtime_snapshot: runtimeSnapshot,
          ...(source.mime_type === "image/png" || source.mime_type === "image/jpeg" ? { image_data_url: dataUrl } : { document_data_url: dataUrl }),
        };
        const response = await (globalThis.AriadneTransport || globalThis).fetch("/api/local-source-read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.read_only || result.writeback !== false || result.model_call_made !== false) throw new Error(result?.error || "SOURCE_UNAVAILABLE");
        return result;
      },
    });
  }

  async function submitJobConversation(humanMessage) {
    const content = String(humanMessage || "").trim();
    const jobSubject = currentJobConversationSubject();
    if (!content || !jobSubject || jobConversationTurnActive) return;
    const modelSelectionVersion = window.AriadneRuntimeSelection?.version();
    jobConversationTurnActive = true;
    const form = byId("job-workspace-composer") || byId("job-conversation-form");
    const status = byId("job-workspace-conversation-status") || byId("job-conversation-status");
    const pageMessage = byId("job-detail-message");
    ConversationUI.setExecutionState({ form, status, active: true, copy: "正在理解…" });
    await ConversationUI.waitForIndicatorPaint();
    if (pageMessage) {
      pageMessage.textContent = "正在基于当前职位与当前个人资料分析…";
      pageMessage.classList.remove("error");
    }
    const database = await Truth.openDatabase();
    let execution = null;
    try {
      const restored = activeJobConversationSession ? { session: activeJobConversationSession, messages: await JobConversationPersistence.messages(database, activeJobConversationSession.conversation_id) } : await restoreJobConversation(database, jobSubject.context_id);
      const session = restored.session;
      const [candidateSnapshot, previousAnalysis] = await Promise.all([
        JobCandidateContext.buildSnapshotFromDatabase(database),
        JobConversationPersistence.latestAnalysis(database, jobSubject.context_id),
      ]);
      const candidateDelta = JobCandidateContext.candidateDelta(previousCandidateSnapshot(previousAnalysis), candidateSnapshot);
      if (window.AriadneRuntimeSelection?.version() !== modelSelectionVersion) throw new Error("RUNTIME_SELECTION_CHANGED");
      const runtimeSnapshot = JobConversation.createRuntimeSnapshot({ scope: session.conversation_id });
      await Truth.persistRecord(database, "runtime_snapshots", runtimeSnapshot);
      const sourceManifest = await retrieveJobTurnSources(database, content, runtimeSnapshot, candidateSnapshot, previousAnalysis, jobSubject);
      const application = activeJobRevision ? (await JobApplications.all()).get(jobSubject.context_id) || JobApplications.initial(jobSubject.context_id) : null;
      const compiledContext = JobConversation.compileContext({ job_subject: jobSubject, application, candidate_snapshot: candidateSnapshot, candidate_delta: candidateDelta, source_excerpt_manifest: sourceManifest, human_message: content, messages: restored.messages });
      const observation = JobConversation.observationFor(jobSubject, candidateSnapshot);
      execution = JobConversation.createTurnExecution(session, observation, runtimeSnapshot, { candidate_snapshot: candidateSnapshot, candidate_delta: candidateDelta, source_excerpt_manifest: sourceManifest });
      const userMessage = JobConversation.createMessage(session, "USER", content);
      await JobConversationPersistence.persistMessage(database, userMessage);
      await JobConversationPersistence.persistExecution(database, execution);
      renderJobConversationMessages([...restored.messages, userMessage], { include_pending_user: true });
      const request = JobConversation.createRuntimeRequest({ session, human_message: content, observation, compiled_context: compiledContext, candidate_snapshot: candidateSnapshot, candidate_delta: candidateDelta, source_excerpt_manifest: sourceManifest, runtime_snapshot: runtimeSnapshot, execution });
      const rawResult = await callJobConversationRuntime(request);
      const result = JobConversation.validateRuntimeResult(rawResult, execution, session, runtimeSnapshot, compiledContext);
      form.dataset.ariadneResultType = result.output.action;
      form.dataset.ariadneWorkingProposalCreated = result.output.job_edit ? "yes" : "no";
      form.dataset.ariadneConfirmedMutationBeforeSave = "no";
      const [currentSubject, currentCandidate] = await Promise.all([
        activeJobWorkingProposal ? Promise.resolve(currentJobConversationSubject()) : canonicalJobRevision(jobSubject.context_id, database),
        JobCandidateContext.buildSnapshotFromDatabase(database),
      ]);
      if (!JobConversation.observationMatches(observation, currentSubject, currentCandidate)) {
        await JobConversationPersistence.persistExecution(database, JobConversationPersistence.transitionExecution(execution, "ANALYSIS_STALE", "OBSERVATION_CHANGED"));
        if (pageMessage) pageMessage.textContent = "职位或个人资料已变化，这次结果未保存；请基于最新内容重试。";
        else status.textContent = "职位或个人资料已变化，请重试。";
        return;
      }
      if (result.output.job_edit?.field === "application_stage") {
        const currentApplication = (await JobApplications.all()).get(jobSubject.context_id) || JobApplications.initial(jobSubject.context_id);
        if (!application || currentApplication.revision !== application.revision || currentApplication.stage !== application.stage) {
          await JobConversationPersistence.persistExecution(database, JobConversationPersistence.transitionExecution(execution, "ANALYSIS_STALE", "APPLICATION_CHANGED"));
          if (pageMessage) pageMessage.textContent = "投递状态已变化，这次建议未保存；请基于最新状态重试。";
          else status.textContent = "投递状态已变化，请重试。";
          return;
        }
      }
      const analysis = JobConversationPersistence.createAnalysis({ session, execution, job_subject: jobSubject, candidate_snapshot: candidateSnapshot, candidate_delta: candidateDelta, source_excerpt_manifest: sourceManifest, runtime_snapshot: runtimeSnapshot, output: result.output, previous_analysis_id: previousAnalysis?.analysis_id || null });
      const assistantMessage = { ...JobConversation.createMessage(session, "ASSISTANT", result.output.message), deliverable: globalThis.AriadneConversationOutput.fromResult(result), web_search: globalThis.AriadneConversationOutput.searchFromResult(result) };
      await JobConversationPersistence.persistSuccessfulTurn(database, { execution, analysis, assistant_message: assistantMessage });
      if (result.output.job_edit && activeJobRevision) {
        const edit = result.output.job_edit;
        const proposal = edit.field === "application_stage"
          ? JobApplications.stageProposal(application, edit.desired_value, edit.reason, analysis.analysis_id)
          : JobContext.createChangeProposal({ current_revision: activeJobRevision, field: edit.field, desired_value: edit.desired_value, reason: edit.reason, source_analysis_id: analysis.analysis_id });
        if (edit.field === "application_stage") await JobApplications.persistStageProposal(database, proposal);
        else await JobContext.persistChangeProposal(database, proposal);
        showJobChangeProposal(proposal);
      }
      renderJobConversationMessages(await JobConversationPersistence.messages(database, session.conversation_id));
      if (pageMessage) pageMessage.textContent = sourceManifest.status === "SOURCE_UNAVAILABLE" ? "分析已保存；所请求的原始来源不可用，结论已按缺失来源处理。" : "分析已保存；任何职位修改仍需你确认。";
      return true;
    } catch (error) {
      if (execution) {
        try { await JobConversationPersistence.persistExecution(database, JobConversationPersistence.transitionExecution(execution, "HARD_FAILED", String(error?.code || error?.message).slice(0, 160))); }
        catch (_persistenceError) { /* Preserve the original failure. */ }
      }
      const copy = window.AriadneRuntimeSelection?.errorCopy(error) || (error?.code === "RUNTIME_CONTRACT_VERSION_MISMATCH" ? "服务版本已更新，请刷新页面后重试。" : "这次模型分析失败；没有使用本地替代结果，也没有修改职位或个人资料。");
      if (pageMessage) { pageMessage.textContent = copy; pageMessage.classList.add("error"); }
      else status.textContent = copy;
      if (activeJobConversationSession) {
        try { renderJobConversationMessages(await JobConversationPersistence.messages(database, activeJobConversationSession.conversation_id)); }
        catch (_historyError) { /* Preserve the original failure. */ }
      }
    } finally {
      database.close();
      jobConversationTurnActive = false;
      ConversationUI.setExecutionState({ form, status, active: false, copy: "" });
      ConversationUI.settle({ form, messages: byId("job-workspace-conversation") || byId("job-conversation-messages") });
    }
  }

  async function initJobDetail() {
    const jobId = new URLSearchParams(window.location.search).get("job") || Demo.JOB_FIXTURE.job_context_id;
    let activeJobSourceRecords = [];
    activeJobRevision = await canonicalJobRevision(jobId);
    if (activeJobRevision) {
      const database = await Truth.openDatabase();
      try {
        const sourceId = activeJobRevision.provenance.source_document_ids[0];
        const sourceDocuments = await JobContext.getAll(database, "source_documents");
        activeJobSourceRecords = sourceDocuments;
        activeJobSourceDocuments = activeJobRevision.provenance.source_document_ids.map((entry) => sourceDocuments.find((document) => document.source_document_id === entry)).filter(Boolean);
        activeJobSourceDocument = activeJobSourceDocuments.find((document) => document.source_document_id === sourceId) || activeJobSourceDocuments[0] || null;
      } finally { database.close(); }
    }
    const storedJob = activeJobRevision ? null : await Demo.get(Demo.DEMO_STORES.jobs, jobId);
    const job = activeJobRevision ? JobContext.recordForUi(activeJobRevision, activeJobSourceRecords) : (await localizedJobRecords(storedJob ? [storedJob] : []))[0] || (jobId === Demo.JOB_FIXTURE.job_context_id ? Demo.clone(Demo.JOB_FIXTURE) : null);
    if (!job) throw new Error("job_context_not_found");
    const renderJob = (record) => {
      activeJob = record;
      const canonical = record.data_class === "CANONICAL_CONFIRMED";
      byId("job-review-state").classList.toggle("hidden", canonical);
      byId("job-review-state").textContent = canonical ? "" : "演示数据";
      byId("job-title").textContent = record.title;
      byId("job-company").textContent = record.company;
      byId("job-location").textContent = record.location;
      byId("job-summary").textContent = record.summary;
      const imported = record.imported_from || {};
      byId("job-source").textContent = activeJobSourceDocuments.length
        ? activeJobSourceDocuments.map((document, index) => `${index + 1}. ${sourceTypeLabels[document.source_type] || document.source_type} · ${document.filename || document.label || "本地来源"}`).join("  ·  ") + " · 原始来源可恢复"
        : imported.name ? `${sourceTypeLabels[imported.source_type] || "本地来源"} · ${imported.name}` : `${sourceTypeLabels[record.source?.source_type] || record.source?.source_type || "演示来源"} · ${record.source?.display_name || "来源未记录"}`;
      byId("job-requirements").innerHTML = (record.requirements || []).map((requirement, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><p><b>${escapeHtml(requirement.label)}</b>${escapeHtml(requirement.detail)}</p></div>`).join("");
    };
    renderJob(job);
    const followupEditor = await globalThis.AriadneJobJournalUI.mount(jobId);
    const conversationAllowed = setDetailRuntimeMode(job, "job-ai-pane", "open-job-edit", "job-ai-runtime", "job_conversation") && Boolean(activeJobRevision);
    if (!activeJobRevision) {
      byId("job-ai-pane").classList.add("hidden");
      byId("job-ai-pane").setAttribute("aria-hidden", "true");
    }
    if (activeJobRevision) byId("open-job-delete").classList.add("hidden");
    const editShell = ProductShell.createDetailEditController({
      trigger: byId("open-job-edit"), form: byId("job-edit-form"), preview: byId("job-edit-preview"), window,
      onStateChange: state => {
        document.body.classList.toggle("v1-job-detail-editing", state === "edit");
        if (state === "closed") followupEditor.cancel();
      },
      populate: () => {
        followupEditor.begin();
        byId("job-edit-title").value = activeJob.title || "";
        byId("job-edit-company").value = activeJob.company || "";
        byId("job-edit-location").value = activeJob.location || "";
        byId("job-edit-summary").value = activeJob.summary || "";
        byId("job-edit-requirements").value = (activeJob.requirements || []).map((item) => item.detail).join("\n");
      },
    });
    const jobConversationBinding = ProductShell.bindConversation({
      messages: byId("job-conversation-messages"),
      form: byId("job-conversation-form"),
      status: byId("job-conversation-status"),
    });
    ProductShell.bindConversationAdapter(jobConversationBinding, {
      domain: "job",
      operation: "job_conversation",
      isAvailable: () => {
        const gate = currentOperationGate("job_conversation");
        return gate.authority.runtime.mode === "model" && gate.allowed && Boolean(activeJobRevision);
      },
      resolveTarget: () => activeJobRevision ? Object.freeze({ contextId: activeJobRevision.context_id }) : null,
      submit: ({ content }) => submitJobConversation(content),
    });
    const deletePopover = createDeletePopover("job-delete-popover");
    window.addEventListener("message", event => {
      if (event.origin === window.location.origin && event.data?.type === "job-radar-v1-open-detail-edit") byId("open-job-edit").click();
    });
    byId("open-job-delete").addEventListener("click", event => deletePopover.open(event.currentTarget));
    byId("job-edit-form").addEventListener("submit", async event => {
      event.preventDefault();
      const title = byId("job-edit-title").value.trim();
      if (!title) { byId("job-edit-title").focus(); return; }
      const requirements = byId("job-edit-requirements").value.split("\n").map(line => line.trim()).filter(Boolean).map((detail, index) => {
        const previous = activeJob.requirements?.[index];
        if (previous?.detail === detail) return previous;
        return { requirement_id: previous?.requirement_id || `job-user-requirement-${index + 1}`, label: detail.length > 36 ? `${detail.slice(0, 34)}…` : detail,
          detail, grounding_refs: previous?.grounding_refs || [], content_origin: "HUMAN_EDITED" };
      });
      const edits = { title, company: byId("job-edit-company").value.trim(), location: byId("job-edit-location").value.trim(), summary: byId("job-edit-summary").value.trim(), requirements };
      try {
        const result = await followupEditor.save({ currentJob: activeJob, currentRevision: activeJobRevision, edits });
        if (!result) return;
        activeJobRevision = result.revision;
        renderJob(activeJobRevision ? JobContext.recordForUi(activeJobRevision, activeJobSourceRecords) : result.job);
        editShell.complete();
        byId("job-detail-message").textContent = "修改已保存。";
        byId("job-detail-message").classList.remove("error");
        if (isEmbeddedDetail && window.parent !== window) window.parent.postMessage({ type: "job-radar-v1-detail-updated", library: "jd", sourceKey: `job:${activeJob.job_context_id}` }, window.location.origin);
      } catch (error) {
        byId("job-detail-message").textContent = `保存未完成：${error.message}`;
        byId("job-detail-message").classList.add("error");
      }
    });
    if (conversationAllowed) {
      const database = await Truth.openDatabase();
      try { await restoreJobConversation(database, activeJobRevision.context_id); }
      finally { database.close(); }
    }
    if (activeJobRevision) {
      byId("accept-job-patch").addEventListener("click", async () => {
        if (!activeJobChangeProposal) return;
        const database = await Truth.openDatabase();
        try {
          const head = await canonicalJobRevision(activeJobRevision.context_id, database);
          const stageProposal = activeJobChangeProposal.contract_id === JobApplications.PROPOSAL_CONTRACT;
          if (stageProposal) {
            if (!head) throw new Error("职位已移除，这条状态建议不能保存。");
            const application = await JobApplications.decideStageProposal(database, activeJobChangeProposal, "CONFIRM");
            byId("job-application-stage").textContent = JobApplications.STAGES[application.stage] + (application.outcome ? ` · ${JobApplications.OUTCOMES[application.outcome]}` : "");
            await followupEditor.refresh();
            followupEditor.announce();
          } else {
            const outcome = await JobContext.persistAcceptedChange(database, head, activeJobChangeProposal);
            activeJobRevision = outcome.revision;
            renderJob(JobContext.recordForUi(activeJobRevision));
          }
          if (isEmbeddedDetail && window.parent !== window) {
            window.parent.postMessage({ type: "job-radar-v1-detail-updated", library: "jd", sourceKey: `job:${activeJobRevision.context_id}` }, window.location.origin);
          }
          showJobChangeProposal(null);
          byId("job-detail-message").textContent = stageProposal ? "投递状态已确认并保存，旧状态与备注仍保留。" : `建议已由你确认并保存为职位第 ${activeJobRevision.version} 版；旧版本与分析来源仍保留。`;
        } catch (error) {
          byId("job-detail-message").textContent = error.message === "ANALYSIS_STALE" ? "职位已经变化，这条建议已过期，未保存。" : `无法保存建议：${error.message}`;
          byId("job-detail-message").classList.add("error");
        } finally { database.close(); }
      });
      byId("reject-job-patch").addEventListener("click", async () => {
        if (!activeJobChangeProposal) return;
        const database = await Truth.openDatabase();
        try {
          if (activeJobChangeProposal.contract_id === JobApplications.PROPOSAL_CONTRACT) await JobApplications.decideStageProposal(database, activeJobChangeProposal, "REJECT");
          else await JobContext.persistRejectedChange(database, activeJobChangeProposal);
          showJobChangeProposal(null);
          byId("job-detail-message").textContent = "建议已拒绝；职位版本没有变化。";
        } finally { database.close(); }
      });
    }
    document.querySelectorAll("[data-job-delete-scope]").forEach((button) => button.addEventListener("click", async () => {
      const controls = [...document.querySelectorAll("[data-job-delete-scope]")];
      controls.forEach((control) => { control.disabled = true; });
      try {
        if (button.dataset.jobDeleteScope === "source") await LocalJobLifecycle.hardDeleteSource(Demo, Demo.DEMO_STORES.jobs, LocalJobLifecycle.sourceIdFor(activeJob));
        else await LocalJobLifecycle.removeCard(Demo, Demo.DEMO_STORES.jobs, activeJob.job_context_id);
        deletePopover.close();
        byId("job-detail-message").textContent = button.dataset.jobDeleteScope === "source" ? "已移除此来源导入的所有职位内容；同批其他来源不受影响。" : "已移除当前职位卡片；来源身份保持不变。";
        if (!completeEmbeddedImport("jd", `job:${activeJob.job_context_id}`)) returnToCardLibrary("/jd.html", "job-guide");
      } catch (error) {
        controls.forEach((control) => { control.disabled = false; });
        byId("job-detail-message").textContent = `无法删除：${error.message}`;
        byId("job-detail-message").classList.add("error");
      }
    }));
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".v1-bottom-sheet:not(.hidden)").forEach((element) => sheet(false, element.id));
    document.querySelectorAll(".v1-menu[open]").forEach((menu) => menu.removeAttribute("open"));
  });

  installMiniSidebar();
  installMenuBehavior();
  installDetailCardOverlay();
  installCardPageTransitions();
  RuntimeGate.subscribe(() => {
    if (page === "personal-import") {
      refreshCandidateImportGate();
      renderSavedCandidatePdfSources().catch(showPersonalError);
    }
    if (page === "job-import") refreshJobImportGate();
    if (page === "candidate-detail" && activeCandidate) setDetailRuntimeMode(activeCandidate, "candidate-ai-pane", "open-direct-edit", "candidate-ai-runtime", "candidate_conversation");
    if (page === "job-detail" && activeJob) setDetailRuntimeMode(activeJob, "job-ai-pane", "open-job-edit", "job-ai-runtime", "job_conversation");
  });
  const initializers = { workspace: initWorkspace, personal: initPersonal, "personal-import": initPersonalImport, "candidate-detail": initCandidateDetail, jd: initJobLibrary, "job-import": initJobImport, "job-detail": initJobDetail };
  async function initializePage() {
    await initializers[page]?.();
  }
  Promise.resolve(initializePage()).catch((error) => {
    const message = document.querySelector(".v1-inline-message");
    if (message) { message.textContent = `页面初始化失败：${window.AriadneContentDatabase?.errorCopy(error) || error.message}`; message.classList.add("error"); }
  });
})();
