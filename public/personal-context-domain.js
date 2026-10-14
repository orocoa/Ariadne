"use strict";

(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadnePersonalContext = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function create() {
  const bytes = (value) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).length;
  function errorCopy(error) {
    const code = String(error?.code || error?.message || error || "");
    if (code === "PERSONAL_SAVED_CONTEXT_LIMIT") return "已保存的更正或补充及其必要依据超过本轮处理预算。本轮未发送模型，也未截断这些内容；请缩小相关资料范围后重试。";
    if (code === "PERSONAL_CONTEXT_CHANGED") return "相关资料或已保存的更正已经变化，本次结果未保存。请基于当前资料重试。";
    if (code === "PERSONAL_SAVED_CONTEXT_INVALID") return "本轮个人更正上下文未通过校验，结果未保存。请刷新并基于当前资料重试。";
    return null;
  }
  function runtimeIdentity(snapshot) {
    const settings = snapshot.execution_settings;
    return JSON.stringify([snapshot.provider, snapshot.model, snapshot.protocol, settings?.connection_id,
      settings?.descriptor_revision, settings?.settings_schema_version, settings?.effective_settings]);
  }
  function batches(entries, budget = 15000, maximum = 10) {
    const groups = []; let group = [], size = 0;
    for (const entry of entries) {
      const cost = bytes(entry);
      if (group.length && (size + cost > budget || group.length >= maximum)) { groups.push(group); group = []; size = 0; }
      group.push(entry); size += cost;
    }
    if (group.length) groups.push(group);
    return groups;
  }
  function terms(value) {
    const text = String(value || "").toLowerCase();
    const result = text.match(/[a-z0-9]{2,}/g) || [];
    for (const run of text.match(/[\p{Script=Han}]+/gu) || []) {
      for (let index = 0; index < run.length - 1; index++) result.push(run.slice(index, index + 2));
    }
    return [...new Set(result)];
  }
  function records(snapshot) {
    return ["confirmed", "working"].flatMap((layer) => (snapshot.provider_view[layer] || []).map((semantic, index) => ({
      ...snapshot[`${layer}_manifest`][index], ref: semantic.candidate_ref, semantic, layer,
    })));
  }
  function limited(record) {
    const item = structuredClone(record);
    for (const key of ["title", "subtitle", "time", "summary", "ownership"]) if (typeof item[key] === "string") item[key] = item[key].slice(0, key === "summary" ? 1800 : 1200);
    item.facts = (item.facts || []).slice(0, 20).map((fact) => ({ label: String(fact.label || "").slice(0, 100), value: String(fact.value || "").slice(0, 500) }));
    item.uncertainties = (item.uncertainties || []).slice(0, 8).map((entry) => ({ question: String(entry.question || "").slice(0, 500), affects: String(entry.affects || "").slice(0, 100), status: entry.status }));
    return item;
  }
  function savedContext(snapshot, { source_document_id = null, item_ids = null, card_ref_by_item = null } = {}) {
    const sourceScoped = source_document_id !== null;
    const matches = related => related.manifest.source_ids.includes(source_document_id)
      && (!item_ids || item_ids.includes(related.item_id));
    const memories = (snapshot.saved_personal_memories || []).filter(memory => !sourceScoped || !memory.related.length || memory.related.some(matches)).map((memory, index) => {
      const related = sourceScoped ? memory.related.filter(matches) : memory.related;
      const related_refs = related.map(entry => sourceScoped ? card_ref_by_item?.[entry.item_id] : entry.content.candidate_ref).filter(Boolean);
      return { ref: sourceScoped ? `saved-memory-${index + 1}` : memory.ref, kind: memory.kind, text: memory.text, version: memory.version,
        revision_token: memory.revision_token, version_token: memory.version_token, human_quote: memory.human_quote, saved_at: memory.saved_at,
        related_refs: [...new Set(related_refs)], related_evidence: memory.related.map(entry => structuredClone(entry.content)) };
    });
    return { contract_id: "ariadne-saved-personal-context-v1", authority: "HUMAN_CONFIRMED_PERSONAL_MEMORY",
      source_token: snapshot.aggregate_fingerprint.replace(/^sha256:/, ""), scope: sourceScoped ? "CANDIDATE_SOURCE" : "PROFILE", memories };
  }
  function select(snapshot, query, budget = 24000) {
    const all = records(snapshot), tokens = terms(query), seenSources = new Set();
    const complete = all.reduce((sum, entry) => sum + bytes(entry.semantic) + 1, 0) <= budget;
    // This is a bounded retrieval heuristic, not semantic understanding. The
    // model receives explicit coverage and must not infer absent capability.
    const ranked = complete ? all : all.map((entry) => {
      const body = JSON.stringify(entry.semantic).toLowerCase();
      const title = String(entry.semantic.title || "").toLowerCase();
      return { ...entry, score: tokens.reduce((sum, token) => sum + (body.includes(token) ? 1 : 0), 0)
        + tokens.reduce((sum, token) => sum + (title.includes(token) ? 4 : 0), 0)
        + (entry.semantic.item_type === "PERSONAL_MEMORY" ? 6 : 0) };
    }).sort((a, b) => b.score - a.score || a.identity.localeCompare(b.identity));
    const ordered = [], remainder = [];
    for (const entry of ranked) {
      const source = entry.source_ids?.[0] || entry.identity;
      if (!seenSources.has(source) || entry.semantic.item_type === "PERSONAL_MEMORY") { ordered.push(entry); seenSources.add(source); }
      else remainder.push(entry);
    }
    ordered.push(...remainder);
    const selected = new Map(), truncated = new Set();
    let used = 0;
    // Saved self-reports and their bound evidence stay whole. Retrieval may
    // select other details, but cannot hide or truncate a saved correction.
    for (const memory of all.filter(entry => entry.semantic.item_type === "PERSONAL_MEMORY")) {
      for (const item of [memory, ...(memory.semantic.related_candidate_refs || []).map(ref => all.find(entry => entry.ref === ref)).filter(Boolean)]) {
        if (selected.has(item.ref)) continue;
        selected.set(item.ref, { ...item, semantic: structuredClone(item.semantic), was_truncated: false });
        used += bytes(item.semantic) + 1;
      }
    }
    if (used > budget) throw new Error("PERSONAL_SAVED_CONTEXT_LIMIT");
    for (const entry of ordered) {
      const group = [entry, ...(entry.semantic.related_candidate_refs || []).map((ref) => all.find((item) => item.ref === ref)).filter(Boolean)];
      const additions = group.filter((item) => !selected.has(item.ref)).map((item) => {
        const semantic = !complete && bytes(item.semantic) > 6000 ? limited(item.semantic) : structuredClone(item.semantic);
        return { ...item, semantic, was_truncated: bytes(semantic) !== bytes(item.semantic) };
      });
      const cost = additions.reduce((sum, item) => sum + bytes(item.semantic) + 1, 0);
      if (used + cost > budget) continue;
      additions.forEach((item) => { selected.set(item.ref, item); if (item.was_truncated) truncated.add(item.ref); });
      used += cost;
    }
    const view = { confirmed: [], working: [], policy: snapshot.provider_view.policy };
    const manifests = { confirmed_manifest: [], working_manifest: [] };
    // Preserve original order/references for Job validation and grounding.
    for (const entry of all) if (selected.has(entry.ref)) {
      view[entry.layer].push(selected.get(entry.ref).semantic);
      manifests[`${entry.layer}_manifest`].push(snapshot[`${entry.layer}_manifest`].find((item) => item.identity === entry.identity));
    }
    const entries = [...view.confirmed, ...view.working];
    return {
      ...snapshot, ...manifests, provider_view: view,
      structural_counts: { candidate_snapshot_present: true, confirmed_count: view.confirmed.length, working_count: view.working.length,
        project_count: entries.filter((item) => String(item.item_type || item.item_subtype).toUpperCase() === "PROJECT").length,
        evidence_count: entries.filter((item) => item.facts?.length || String(item.summary || "").trim()).length },
      context_coverage: { strategy: complete ? "COMPLETE_CURRENT_EVIDENCE" : "LEXICAL_DIVERSITY_WITH_CONFIRMED_MEMORY", total_records: all.length, included_records: entries.length,
        omitted_records: all.length - entries.length, truncated_records: truncated.size, evidence_bytes: used, budget_bytes: budget,
        complete: all.length === entries.length && !truncated.size },
    };
  }
  function boundedHistory(turns, budget = 200000, { assistantCurrent = () => true } = {}) {
    const Delivery = globalThis.AriadneConversationOutput || (typeof module === "object" ? require("./conversation-output.js") : null);
    // Actual Human words and valid replies remain whole: an earlier choice may
    // refer to an assistant's alternatives. Neither is confirmed personal data.
    const eligible = turns.filter(turn => turn.human_message && ["SUCCEEDED", "FAILED"].includes(turn.status));
    const history = eligible.map(turn => {
      const item = { human: turn.human_message, human_truncated: false, authority: "CONVERSATION_SELF_REPORT_NOT_SAVED" };
      if (turn.status === "SUCCEEDED" && turn.output?.message && assistantCurrent(turn)) Object.assign(item, {
        assistant: Delivery ? Delivery.historyText(turn.output) : turn.output.message,
        assistant_truncated: false, assistant_authority: "NON_AUTHORITATIVE_PRIOR_REPLY" });
      return item;
    });
    if (history.length > 500 || bytes(history) > budget) throw new Error("CONVERSATION_HISTORY_LIMIT");
    return history;
  }
  function catalog(snapshot, budget = 8000) {
    const all = records(snapshot), entries = []; let used = 200;
    for (const entry of all) {
      const item = { ref: entry.ref, title: String(entry.semantic.title || "").slice(0, 240), type: entry.semantic.item_type, layer: entry.layer };
      if (used + bytes(item) + 1 > budget) continue;
      entries.push(item); used += bytes(item) + 1;
    }
    return { records: entries, total_records: all.length, included_records: entries.length, complete: all.length === entries.length,
      policy: "INDEX_ONLY_NOT_FULL_EVIDENCE. Missing detail is not proof a record does not exist." };
  }
  function splitText(value, budget = 6000) {
    const chunks = []; let part = "", size = 0;
    for (const character of String(value)) {
      const cost = bytes(character);
      if (size + cost > budget) { chunks.push(part); part = ""; size = 0; }
      part += character; size += cost;
    }
    if (part) chunks.push(part);
    return chunks;
  }
  return Object.freeze({ bytes, errorCopy, runtimeIdentity, batches, terms, records, savedContext, limited, select, boundedHistory, catalog, splitText });
}));
