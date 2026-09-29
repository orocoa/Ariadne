/* Synthetic state for the disposable QA server. No model or private workspace. */
(() => {
  const stores = {personal_memory_revisions: [], personal_memory_decisions: [], context_proposals: [],
    personal_memory_proposals: [{proposal_id: "qa-proposal", operation: "ADD", kind: "PREFERENCE", text: "合成偏好：远程协作", reason: "合成测试建议", human_quote: "我喜欢远程协作。", target_memory_id: null}],
    personal_conversation_turns: Array.from({length: 17}, (_, i) => ({kind: "DISCUSSION", turn_id: `qa-turn-${i}`, created_at: `2026-09-29T00:${String(i).padStart(2, "0")}:00Z`, status: "SUCCEEDED", human_message: `合成问题 ${i}`, output: {message: `合成回答 ${i}`, ...(i === 16 ? {deliverable: {kind: "PDF", title: "合成输出", body: "仅用于验证重复渲染与下载，不包含私人资料。", nodes: [], edges: []}} : {})}, context_coverage: {included_records: 0, total_records: 0, truncated_records: 0}, context_bytes: 0, calls: 0}))};
  const snapshot = {personal_understanding: null, provider_view: {confirmed: [], working: []}, confirmed_manifest: [], working_manifest: []};
  window.__optimizationQA = {stores, snapshot, failures: 0, loads: 0};
  window.AriadneTruthPersistence = {...window.AriadneTruthPersistence, openDatabase: async () => ({close() {}})};
  window.AriadneJobCandidateContext = {...window.AriadneJobCandidateContext, buildSnapshotFromDatabase: async () => { window.__optimizationQA.loads++; return structuredClone(snapshot); }};
  window.AriadnePersonalMemory = {...window.AriadnePersonalMemory,
    getAll: async (_, name) => structuredClone(stores[name] || []),
    decide: async () => { window.__optimizationQA.failures++; throw Error("synthetic_save_failure"); }};
})();
