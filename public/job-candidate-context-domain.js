"use strict";

(function attachJobCandidateContext(root, factory) {
  const manifest = root.AriadneJobIntelligenceContract
    || (typeof module === "object" && module.exports ? require("../data/job_intelligence_contract_v1.json") : null);
  const memory = root.AriadnePersonalMemory || (typeof module === "object" && module.exports ? require("./personal-memory-domain.js") : null);
  const personalContract = root.AriadnePersonalUnderstandingContract || (typeof module === "object" && module.exports ? require("../data/personal_understanding_contract_v1.json") : null);
  const api = factory(manifest, memory, personalContract);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneJobCandidateContext = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createJobCandidateContext(Manifest, Memory, PersonalContract) {
  if (!Manifest) throw new Error("job_candidate_context_manifest_required");

  const SNAPSHOT_CONTRACT = Manifest.candidate_snapshot_version;
  const DELTA_CONTRACT = Manifest.candidate_delta_version;
  const READ_STORES = ["candidate_context_revisions", "candidate_context_lifecycle", "candidate_working_models", "candidate_workspace_acceptances", "career_entities", "career_evidence", "source_documents", "personal_memory_revisions"];
  const readsets = new WeakMap();
  function metadata(value) {
    if (Array.isArray(value)) return value.map(metadata);
    if (isObject(value)) return Object.fromEntries(Object.entries(value).filter(([, entry]) => !(typeof Blob !== "undefined" && entry instanceof Blob) && entry?.$blob !== "file").map(([key, entry]) => [key, metadata(entry)]));
    return value;
  }
  function transactionStores(snapshot, database) { return READ_STORES.filter(name => database.objectStoreNames.contains(name)); }
  function assertSnapshotInto(tx, snapshot, stores = READ_STORES, { added_sources = [] } = {}) {
    const expected = readsets.get(snapshot);
    if (!expected) return Promise.reject(new CandidateSnapshotError("PERSONAL_CONTEXT_GUARD_REQUIRED"));
    return new Promise((resolve, reject) => {
      const names = stores;
      let remaining = names.length;
      const abort = () => { const error = new CandidateSnapshotError("PERSONAL_CONTEXT_CHANGED"); reject(error); try { tx.abort(); } catch (_) {} };
      if (!remaining) return resolve(true);
      for (const name of names) {
        const store = tx.objectStore(name), read = name === "source_documents" && store.getAllMetadata ? store.getAllMetadata() : store.getAll();
        read.onerror = abort;
        read.onsuccess = () => {
          const accepted = name === "source_documents" ? [...(expected[name] || []), ...added_sources.filter(source => !(expected[name] || []).some(prior => prior.source_document_id === source.source_document_id)).map(metadata)] : expected[name] || [];
          const order = entries => [...entries].sort((a, b) => JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b))));
          if (JSON.stringify(canonical(order(metadata(read.result || [])))) !== JSON.stringify(canonical(order(accepted)))) return abort();
          if (--remaining === 0) resolve(true);
        };
      }
    });
  }

  class CandidateSnapshotError extends Error {
    constructor(code) { super(code); this.name = "CandidateSnapshotError"; this.code = code; }
  }

  function isObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return structuredClone(value); }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
  }

  async function fingerprint(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return `sha256:${[...new Uint8Array(digest)].map((entry) => entry.toString(16).padStart(2, "0")).join("")}`;
  }

  function latestBy(records, keyFor, versionFor = (entry) => Number(entry.version || 0)) {
    const heads = new Map();
    (records || []).forEach((entry) => {
      const key = keyFor(entry);
      if (!key) return;
      const current = heads.get(key);
      if (!current || versionFor(entry) > versionFor(current)) heads.set(key, entry);
    });
    return [...heads.values()];
  }

  function sourceAvailability(sourceId, sourceDocuments) {
    const source = (sourceDocuments || []).find((entry) => entry?.source_document_id === sourceId && entry?.contract_id === "ariadne-source-document-v1");
    if (!source) return "SOURCE_UNAVAILABLE";
    if (source.local_reference) return "ORIGINAL_AVAILABLE";
    return source.content_hash ? "SOURCE_REFERENCE_ONLY" : "LEGACY_PROVENANCE_UNKNOWN";
  }

  function semanticItem(item) {
    return {
      item_type: item.item_type || item.entity_type || item.evidence_type || "OTHER",
      item_subtype: item.item_subtype || item.entity_type || null,
      category: item.category || null,
      title: item.title || item.data?.position || item.data?.name || item.data?.institution || item.claim || "未命名候选信息",
      subtitle: item.subtitle || item.data?.name || item.data?.organization || item.data?.studyType || null,
      time: item.time || item.data?.rawDate || item.data?.timeframe || null,
      summary: item.summary || item.description || item.claim || item.data?.summary || null,
      ownership: item.ownership || null,
      facts: (item.facts || []).filter(isObject).map((fact) => ({ label: fact.label || "信息", value: fact.value || "" })).filter((fact) => fact.value),
      uncertainties: (item.uncertainties || []).filter(isObject).map((entry) => ({ question: entry.question || entry.code || "待确认", affects: entry.affects || null, status: entry.status || "OPEN" })),
    };
  }

  function lifecycleRemovedKeys(records) {
    return new Set((records || []).filter((entry) => entry?.state === "REMOVED" && entry?.authority === "AUTHORITATIVE_USER_DECISION").map((entry) => `${entry.context_id}|${entry.item_id}`));
  }

  function removedWorkingItemKeys(input) {
    const removed = lifecycleRemovedKeys(input.candidate_context_lifecycle);
    const keys = new Set();
    // Lifecycle decisions address confirmed contexts. Resolve their source/item
    // identities through retained revisions, never through titles or item ID alone.
    (input.candidate_context_revisions || []).filter((revision) => revision?.context_type === "CANDIDATE" && revision?.authority === "AUTHORITATIVE_CONFIRMED_CONTEXT").forEach((revision) => {
      (revision.payload?.items || []).forEach((item) => {
        if (!item?.item_id || !removed.has(`${revision.context_id}|${item.item_id}`)) return;
        (revision.provenance?.source_document_ids || []).forEach((sourceId) => keys.add(`${sourceId}|${item.item_id}`));
      });
    });
    return keys;
  }

  function confirmedRecords(input) {
    const revisions = latestBy(
      (input.candidate_context_revisions || []).filter((entry) => entry?.context_type === "CANDIDATE" && entry?.authority === "AUTHORITATIVE_CONFIRMED_CONTEXT"),
      (entry) => entry.context_id,
    );
    const removed = lifecycleRemovedKeys(input.candidate_context_lifecycle);
    const canonicalRecords = [];
    revisions.forEach((revision) => {
      (revision.payload?.items || []).forEach((item) => {
        if (!item?.item_id || removed.has(`${revision.context_id}|${item.item_id}`)) return;
        const itemSourceIds = [...new Set((item.grounding_refs || []).map((ref) => ref?.source_document_id).filter(Boolean))];
        canonicalRecords.push({
          identity: `canonical:${revision.context_id}:${item.item_id}`,
          item_id: item.item_id,
          identity_stability: "CANONICAL",
          semantic: semanticItem(item),
          authority: "CONFIRMED",
          source_ids: itemSourceIds.length ? itemSourceIds : [...(revision.provenance?.source_document_ids || [])],
          lineage: { context_id: revision.context_id, revision_id: revision.revision_id, version: revision.version },
        });
      });
    });

    const legacyEntities = (input.career_entities || []).filter((entry) => entry?.review_status === "confirmed").map((entry) => ({
      identity: `legacy-entity:${entry.entity_id}`,
      identity_stability: "LEGACY_STABLE_ID",
      semantic: semanticItem(entry),
      authority: "CONFIRMED",
      source_ids: [...(entry.source_document_ids || [])],
      lineage: { legacy_store: "career_entities", reviewed_at: entry.reviewed_at || null },
    }));
    const legacyEvidence = (input.career_evidence || []).filter((entry) => ["confirmed", "derived_from_confirmed_entities"].includes(entry?.review_status) || entry?.authority === "HUMAN_CONFIRMED").map((entry) => ({
      identity: `legacy-evidence:${entry.evidence_id}`,
      identity_stability: "LEGACY_STABLE_ID",
      semantic: semanticItem(entry),
      authority: "CONFIRMED",
      source_ids: [...(entry.source_document_ids || [])],
      lineage: { legacy_store: "career_evidence", created_at: entry.created_at || null },
    }));
    const base = [...canonicalRecords, ...legacyEntities, ...legacyEvidence];
    if ((input.personal_memory_revisions || []).length && !Memory) throw new CandidateSnapshotError("personal_memory_dependency_required");
    const memories = Memory ? Memory.active(input.personal_memory_revisions, [...base, ...workingRecords(input)]).map((raw) => {
      const entry = Memory.validateRevision(raw);
      return {
        identity: `memory:${entry.memory_id}`, identity_stability: "CANONICAL", authority: "CONFIRMED", source_ids: [],
        semantic: { ...semanticItem({ item_type: "PERSONAL_MEMORY", item_subtype: entry.kind, title: entry.text, summary: entry.text }),
          memory_kind: entry.kind, memory_version: entry.version, memory_revision_token: null },
        related_identities: entry.related_identities,
        lineage: { memory_id: entry.memory_id, revision_id: entry.revision_id, version: entry.version },
      };
    }) : [];
    return [...base, ...memories];
  }

  function workingRecords(input) {
    const accepted = new Set((input.candidate_workspace_acceptances || []).map((entry) => `${entry.working_model_id}|${entry.working_model_fingerprint}`));
    const heads = latestBy(input.candidate_working_models || [], (entry) => entry.source_document_id);
    const removed = removedWorkingItemKeys(input);
    return heads.flatMap((working) => {
      if (accepted.has(`${working.working_model_id}|${working.fingerprint}`)) return [];
      return (working.payload?.items || []).filter((item) => isObject(item) && !removed.has(`${working.source_document_id}|${item.item_id}`)).map((item) => ({
        identity: `working:${working.source_document_id}:${item.item_id || "unstable"}`,
        item_id: item.item_id || null,
        identity_stability: item.item_id ? "WORKING_LINEAGE_SCOPED" : "UNSTABLE",
        semantic: semanticItem(item),
        authority: "NON_AUTHORITATIVE",
        source_ids: [working.source_document_id],
        lineage: {
          working_model_id: working.working_model_id,
          previous_working_model_id: working.previous_working_model_id,
          version: working.version,
          fingerprint: working.fingerprint,
        },
      }));
    });
  }

  async function withHashes(records, sourceDocuments) {
    const availabilityPriority = ["ORIGINAL_AVAILABLE", "SOURCE_REFERENCE_ONLY", "LEGACY_PROVENANCE_UNKNOWN", "SOURCE_UNAVAILABLE"];
    return Promise.all(records.map(async (entry) => {
      const semantic = entry.semantic.item_type === "PERSONAL_MEMORY" ? { ...entry.semantic, memory_revision_token: (await fingerprint(entry.lineage)).slice(7) } : entry.semantic;
      return ({
      ...entry, semantic,
      semantic_hash: await fingerprint(semantic),
      source_availability: entry.source_ids.length
        ? entry.source_ids.map((sourceId) => sourceAvailability(sourceId, sourceDocuments)).sort((left, right) => availabilityPriority.indexOf(left) - availabilityPriority.indexOf(right))[0]
        : "LEGACY_PROVENANCE_UNKNOWN",
    }); }));
  }

  function providerItems(records, prefix) {
    return records.map((entry, index) => ({
      candidate_ref: `${prefix}-${index + 1}`,
      authority: entry.authority,
      source_availability: entry.source_availability,
      ...clone(entry.semantic),
    }));
  }

  function manifestEntries(records) {
    return records.map((entry) => ({
      identity: entry.identity,
      identity_stability: entry.identity_stability,
      semantic_hash: entry.semantic_hash,
      source_ids: [...entry.source_ids],
      source_availability: entry.source_availability,
      lineage: clone(entry.lineage),
    })).sort((left, right) => left.identity.localeCompare(right.identity));
  }

  async function buildSnapshot(input) {
    const sourceDocuments = input.source_documents || [];
    const confirmed = (await withHashes(confirmedRecords(input), sourceDocuments)).sort((left, right) => left.identity.localeCompare(right.identity));
    const working = (await withHashes(workingRecords(input), sourceDocuments)).sort((left, right) => left.identity.localeCompare(right.identity));
    const confirmedManifest = manifestEntries(confirmed);
    const workingManifest = manifestEntries(working);
    const confirmedFingerprint = await fingerprint(confirmedManifest);
    const workingFingerprint = await fingerprint(workingManifest);
    // A save/replace/retract cycle can return to the same active evidence.
    // Keep a memory version marker so old chats and portraits cannot become
    // current again merely because that visible set happens to match.
    const memoryHeads = (Memory?.latest(input.personal_memory_revisions || []) || []).map((entry) => ({ memory_id: entry.memory_id, revision_id: entry.revision_id, version: entry.version, status: entry.status })).sort((a, b) => a.memory_id.localeCompare(b.memory_id));
    const aggregateFingerprint = await fingerprint({ confirmed: confirmedFingerprint, working: workingFingerprint, include_working: true, ...(memoryHeads.length ? { memory_heads: memoryHeads } : {}) });
    const eligibleRecordCount = (input.candidate_context_revisions || []).filter((entry) => entry?.context_type === "CANDIDATE" && entry?.authority === "AUTHORITATIVE_CONFIRMED_CONTEXT").length
      + (input.candidate_working_models || []).length
      + (input.career_entities || []).filter((entry) => entry?.review_status === "confirmed").length
      + (input.career_evidence || []).filter((entry) => ["confirmed", "derived_from_confirmed_entities"].includes(entry?.review_status) || entry?.authority === "HUMAN_CONFIRMED").length;
    if (eligibleRecordCount > 0 && confirmed.length + working.length === 0) {
      const beforeRemoval = { ...input, candidate_context_lifecycle: [] };
      // A deliberate removal is a valid empty profile. Retain the wiring guard
      // when eligible records cannot produce context even before removals.
      if (confirmedRecords(beforeRemoval).length + workingRecords(beforeRemoval).length === 0) throw new CandidateSnapshotError("CANDIDATE_CONTEXT_WIRING_EMPTY");
    }
    const providerConfirmed = providerItems(confirmed, "confirmed-candidate");
    const providerWorking = providerItems(working, "working-candidate");
    const providerRecords = [...providerConfirmed, ...providerWorking];
    const refByIdentity = new Map([...confirmed, ...working].map((entry, index) => [entry.identity, providerRecords[index].candidate_ref]));
    [...confirmed, ...working].forEach((entry, index) => {
      if (entry.related_identities) providerRecords[index].related_candidate_refs = entry.related_identities.map((identity) => refByIdentity.get(identity)).filter(Boolean);
    });
    const structuralCounts = Object.freeze({
      candidate_snapshot_present: true,
      confirmed_count: providerConfirmed.length,
      working_count: providerWorking.length,
      project_count: providerRecords.filter((entry) => String(entry.item_type || entry.item_subtype).toUpperCase() === "PROJECT").length,
      evidence_count: providerRecords.filter((entry) => (entry.facts || []).length || String(entry.summary || "").trim()).length,
    });
    const evidenceByIdentity = new Map([...confirmed, ...working].map((entry, index) => [entry.identity, { item_id: entry.item_id || null, manifest: manifestEntries([entry])[0], content: providerRecords[index] }]));
    const savedMemories = await Promise.all((Memory ? Memory.active(input.personal_memory_revisions, [...confirmed, ...working].filter(entry => !entry.identity.startsWith("memory:"))) : []).map(async raw => {
      const entry = Memory.validateRevision(raw);
      const ref = refByIdentity.get(`memory:${entry.memory_id}`), related = entry.related_identities.map(identity => evidenceByIdentity.get(identity)).filter(Boolean);
      const body = { kind: entry.kind, text: entry.text, version: entry.version,
        revision_token: evidenceByIdentity.get(`memory:${entry.memory_id}`).content.memory_revision_token,
        human_quote: entry.human_quote || null, saved_at: entry.created_at, related_evidence: related.map(item => item.content) };
      return { ref, ...body, version_token: (await fingerprint(body)).slice(7), related };
    }));
    const activeMemoryIds = new Set(confirmed.filter(entry => entry.identity.startsWith("memory:")).map(entry => entry.lineage.revision_id));
    const memoryHeadsById = new Map((Memory?.latest(input.personal_memory_revisions || []) || []).map(entry => [entry.memory_id, entry]));
    const compilationTime = new Date().toISOString();
    const historyBlockers = (input.personal_memory_revisions || []).filter(entry => entry.authority === Memory?.REVISION_AUTHORITY && !activeMemoryIds.has(entry.revision_id)).map(entry => ({
      human_quote: entry.human_quote || null, origin: clone(entry.origin || {}),
      // A still-ACTIVE memory can lose its evidence after Save. Its original
      // Save time is not the invalidation time; exclude all older copies at
      // this compile boundary, while the current Human turn stays separate.
      invalidated_at: memoryHeadsById.get(entry.memory_id)?.revision_id === entry.revision_id && entry.status === "ACTIVE"
        ? compilationTime : memoryHeadsById.get(entry.memory_id)?.created_at || entry.created_at,
    }));
    const snapshot = Object.freeze({
      contract_id: SNAPSHOT_CONTRACT,
      compiled_at: new Date().toISOString(),
      working_inclusion_policy: "INCLUDE_CURRENT_NON_AUTHORITATIVE",
      confirmed_manifest: confirmedManifest,
      working_manifest: workingManifest,
      confirmed_fingerprint: confirmedFingerprint,
      working_fingerprint: workingFingerprint,
      aggregate_fingerprint: aggregateFingerprint,
      saved_personal_memories: savedMemories,
      personal_history_blockers: historyBlockers,
      structural_counts: structuralCounts,
      provider_view: Object.freeze({
        confirmed: providerConfirmed,
        working: providerWorking,
        policy: "Working information is NON_AUTHORITATIVE and must never be phrased as confirmed truth. PERSONAL_MEMORY is explicitly saved by the Human. A saved CORRECTION qualifies the claims in its related_candidate_refs; retain source history, acknowledge conflicts, and never infer that material claims override the Human correction.",
      }),
      uncertainties: [...confirmed, ...working].flatMap((entry) => entry.semantic.uncertainties.map((uncertainty) => ({ authority: entry.authority, ...uncertainty }))),
    });
    readsets.set(snapshot, Object.fromEntries(READ_STORES.map(name => [name, clone(metadata(input[name] || []))])));
    return snapshot;
  }

  function lineageContinues(previousEntry, currentEntry) {
    if (previousEntry.identity_stability !== "WORKING_LINEAGE_SCOPED" || currentEntry.identity_stability !== "WORKING_LINEAGE_SCOPED") return true;
    return currentEntry.lineage?.previous_working_model_id === previousEntry.lineage?.working_model_id
      || currentEntry.lineage?.working_model_id === previousEntry.lineage?.working_model_id;
  }

  function compareManifest(previous, current, layer) {
    const before = new Map((previous || []).map((entry) => [entry.identity, entry]));
    const after = new Map((current || []).map((entry) => [entry.identity, entry]));
    const changes = [];
    for (const [identity, entry] of after) {
      const prior = before.get(identity);
      if (!prior) changes.push({ change: "ADDED", layer, identity, semantic_hash: entry.semantic_hash });
      else if (prior.semantic_hash !== entry.semantic_hash) {
        if (lineageContinues(prior, entry) && entry.identity_stability !== "UNSTABLE") changes.push({ change: "UPDATED", layer, identity, semantic_hash: entry.semantic_hash });
        else changes.push({ change: "NEEDS_REVIEW", layer, identity, semantic_hash: entry.semantic_hash });
      }
    }
    for (const [identity, entry] of before) {
      if (!after.has(identity)) changes.push({ change: "REMOVED", layer, identity, semantic_hash: entry.semantic_hash });
    }
    return changes.sort((left, right) => `${left.layer}:${left.identity}:${left.change}`.localeCompare(`${right.layer}:${right.identity}:${right.change}`));
  }

  function providerRecordForIdentity(snapshot, layer, identity) {
    const manifest = layer === "CONFIRMED" ? snapshot?.confirmed_manifest : snapshot?.working_manifest;
    const provider = layer === "CONFIRMED" ? snapshot?.provider_view?.confirmed : snapshot?.provider_view?.working;
    const index = (manifest || []).findIndex((entry) => entry.identity === identity);
    return index >= 0 && provider?.[index] ? clone(provider[index]) : null;
  }

  function semanticFieldDelta(before, current) {
    if (!before || !current) return [];
    const fields = ["item_type", "item_subtype", "category", "title", "subtitle", "time", "summary", "ownership", "facts", "uncertainties"];
    return fields.filter((field) => JSON.stringify(canonical(before[field] ?? null)) !== JSON.stringify(canonical(current[field] ?? null)))
      .map((field) => ({ field, before: clone(before[field] ?? null), current: clone(current[field] ?? null) }));
  }

  function providerDelta(changes, previousSnapshot, currentSnapshot) {
    return changes.map((entry, index) => ({
      change_ref: `candidate-change-${index + 1}`,
      change: entry.change,
      layer: entry.layer,
      previous_candidate: providerRecordForIdentity(previousSnapshot, entry.layer, entry.identity),
      current_candidate: providerRecordForIdentity(currentSnapshot, entry.layer, entry.identity),
      changed_fields: semanticFieldDelta(
        providerRecordForIdentity(previousSnapshot, entry.layer, entry.identity),
        providerRecordForIdentity(currentSnapshot, entry.layer, entry.identity),
      ),
    }));
  }

  function candidateDelta(previousSnapshot, currentSnapshot) {
    if (!currentSnapshot || currentSnapshot.contract_id !== SNAPSHOT_CONTRACT) throw new CandidateSnapshotError("candidate_snapshot_invalid");
    if (!previousSnapshot) {
      return Object.freeze({
        contract_id: DELTA_CONTRACT,
        mode: "BASELINE",
        previous_fingerprint: null,
        current_fingerprint: currentSnapshot.aggregate_fingerprint,
        changes: [],
        provider_view: [{ change_ref: "candidate-baseline", change: "BASELINE", layer: "ALL" }],
      });
    }
    const changes = [
      ...compareManifest(previousSnapshot.confirmed_manifest, currentSnapshot.confirmed_manifest, "CONFIRMED"),
      ...compareManifest(previousSnapshot.working_manifest, currentSnapshot.working_manifest, "WORKING"),
    ];
    return Object.freeze({
      contract_id: DELTA_CONTRACT,
      mode: changes.length ? "CHANGED" : "UNCHANGED",
      previous_fingerprint: previousSnapshot.aggregate_fingerprint,
      current_fingerprint: currentSnapshot.aggregate_fingerprint,
      changes,
      provider_view: providerDelta(changes, previousSnapshot, currentSnapshot),
    });
  }

  async function getAll(database, storeName) {
    if (!database.objectStoreNames.contains(storeName)) return [];
    if (storeName === "source_documents" && database.getAllMetadata) return database.getAllMetadata(storeName);
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new CandidateSnapshotError("candidate_context_read_failed"));
    });
  }

  async function buildSnapshotFromDatabase(database) {
    const names = [...READ_STORES, "personal_understanding_snapshots"];
    const values = await Promise.all(names.map((name) => getAll(database, name)));
    const records = Object.fromEntries(names.map((name, index) => [name, values[index]]));
    const snapshot = await buildSnapshot(records);
    const understanding = records.personal_understanding_snapshots.filter((entry) => entry.authority === "NON_AUTHORITATIVE_PERSONAL_UNDERSTANDING" && PersonalContract && entry.prompt_version === PersonalContract.prompt_version && entry.source_fingerprint === snapshot.aggregate_fingerprint)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
    const result = Object.freeze({ ...snapshot, memory_revision_count: records.personal_memory_revisions.length, personal_understanding: understanding });
    readsets.set(result, readsets.get(snapshot));
    return result;
  }

  function observationsMatch(left, right) {
    return Boolean(left && right
      && left.confirmed_fingerprint === right.confirmed_fingerprint
      && left.working_fingerprint === right.working_fingerprint
      && left.aggregate_fingerprint === right.aggregate_fingerprint);
  }

  return Object.freeze({
    SNAPSHOT_CONTRACT, DELTA_CONTRACT, READ_STORES, transactionStores, assertSnapshotInto, CandidateSnapshotError, canonical, fingerprint, latestBy,
    sourceAvailability, semanticItem, confirmedRecords, workingRecords, buildSnapshot, candidateDelta,
    buildSnapshotFromDatabase, observationsMatch,
  });
}));
