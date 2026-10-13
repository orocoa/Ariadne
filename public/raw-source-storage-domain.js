"use strict";

(function attachRawSourceStorage(root, factory) {
  const truth = root.AriadneTruthPersistence
    || (typeof module === "object" && module.exports ? require("./truth-persistence-domain.js") : null);
  const api = factory(truth);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneRawSourceStorage = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createRawSourceStorage(Truth) {
  if (!Truth) throw new Error("truth_persistence_required");

  const DB_NAME = Truth.DB_NAME;
  const STORE_NAME = "source_documents";
  const RECORD_TYPE = "ARIADNE_CANONICAL_RAW_SOURCE_V1";
  const PAYLOAD_KEY_PREFIX = "raw-source-payload-v1::";
  const ARCHIVE_CONTRACT = "ariadne-source-archive-v1";
  const LOCAL_REFERENCE_PREFIX = `indexeddb://${DB_NAME}/${STORE_NAME}/`;

  class RawSourceStorageError extends Error {
    constructor(code, message = code) {
      super(message);
      this.name = "RawSourceStorageError";
      this.code = code;
    }
  }

  function requiredSourceId(value) {
    const sourceId = String(value || "").trim();
    if (!sourceId) throw new RawSourceStorageError("raw_source_identity_required");
    return sourceId;
  }

  function payloadRecordIdFor(sourceId) {
    return `${PAYLOAD_KEY_PREFIX}${requiredSourceId(sourceId)}`;
  }

  function localReferenceFor(sourceId) {
    return `${LOCAL_REFERENCE_PREFIX}${encodeURIComponent(payloadRecordIdFor(sourceId))}`;
  }

  function parseLocalReference(localReference) {
    const reference = String(localReference || "");
    if (!reference) throw new RawSourceStorageError("raw_source_reference_missing");
    if (!reference.startsWith(LOCAL_REFERENCE_PREFIX)) throw new RawSourceStorageError("raw_source_reference_unsupported");
    const encodedKey = reference.slice(LOCAL_REFERENCE_PREFIX.length);
    if (!encodedKey || encodedKey.includes("/")) throw new RawSourceStorageError("raw_source_reference_invalid");
    let recordId;
    try { recordId = decodeURIComponent(encodedKey); }
    catch (_error) { throw new RawSourceStorageError("raw_source_reference_invalid"); }
    if (!recordId.startsWith(PAYLOAD_KEY_PREFIX)) throw new RawSourceStorageError("raw_source_reference_invalid");
    return Object.freeze({ database_name: DB_NAME, store_name: STORE_NAME, record_id: recordId });
  }

  function isBlobLike(value) {
    return Boolean(value && Number.isFinite(value.size) && value.size >= 0 && typeof value.arrayBuffer === "function");
  }

  async function sha256Blob(blob) {
    if (!isBlobLike(blob)) throw new RawSourceStorageError("raw_source_payload_invalid");
    let bytes;
    try { bytes = await blob.arrayBuffer(); }
    catch (_error) { throw new RawSourceStorageError("raw_source_payload_read_failed"); }
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return `sha256:${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  function payloadEnvelopeFor(sourceDocument, file, createdAt = new Date().toISOString()) {
    const source = Truth.validateSourceDocument(sourceDocument);
    if (!isBlobLike(file)) throw new RawSourceStorageError("raw_source_payload_invalid");
    const expectedReference = localReferenceFor(source.source_document_id);
    if (source.local_reference !== expectedReference) throw new RawSourceStorageError("raw_source_reference_mismatch");
    return Object.freeze({
      source_document_id: payloadRecordIdFor(source.source_document_id),
      record_type: RECORD_TYPE,
      canonical_source_document_id: source.source_document_id,
      content_hash: source.content_hash,
      filename: source.filename,
      mime_type: source.mime_type,
      byte_size: file.size,
      file_blob: file,
      created_at: createdAt,
    });
  }

  function isPayloadRecord(record) {
    return Boolean(record && record.record_type === RECORD_TYPE && String(record.source_document_id || "").startsWith(PAYLOAD_KEY_PREFIX));
  }

  function isPayloadRecordFor(record, sourceId) {
    const id = requiredSourceId(sourceId);
    return isPayloadRecord(record)
      && record.source_document_id === payloadRecordIdFor(id)
      && record.canonical_source_document_id === id;
  }

  function validatePayloadEnvelope(record, sourceDocument) {
    const source = Truth.validateSourceDocument(sourceDocument);
    if (!isPayloadRecordFor(record, source.source_document_id)) throw new RawSourceStorageError("raw_source_payload_envelope_invalid");
    if (record.content_hash !== source.content_hash
      || record.filename !== source.filename
      || record.mime_type !== source.mime_type
      || record.byte_size !== record.file_blob?.size
      || !isBlobLike(record.file_blob)) {
      throw new RawSourceStorageError("raw_source_payload_envelope_invalid");
    }
    return record;
  }

  function readRecord(database, key) {
    // Resolving one original is an independent read, never a save transaction.
    if (database.getRecord) return database.getRecord(STORE_NAME, key);
    return new Promise((resolve, reject) => {
      let transaction;
      try { transaction = database.transaction(STORE_NAME, "readonly"); }
      catch (_error) { reject(new RawSourceStorageError("raw_source_storage_unavailable")); return; }
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new RawSourceStorageError("raw_source_read_failed"));
    });
  }

  async function sourceDocumentForId(database, sourceId) {
    const record = await readRecord(database, requiredSourceId(sourceId));
    if (!record) throw new RawSourceStorageError("raw_source_document_missing");
    if (record.contract_id !== "ariadne-source-document-v1") throw new RawSourceStorageError("raw_source_document_not_canonical");
    return Truth.validateSourceDocument(record);
  }

  async function resolveRawSource(database, sourceOrId) {
    const source = typeof sourceOrId === "string"
      ? await sourceDocumentForId(database, sourceOrId)
      : Truth.validateSourceDocument(sourceOrId);
    const reference = parseLocalReference(source.local_reference);
    const expectedRecordId = payloadRecordIdFor(source.source_document_id);
    if (reference.record_id !== expectedRecordId) throw new RawSourceStorageError("raw_source_reference_mismatch");
    const payload = await readRecord(database, reference.record_id);
    if (!payload) throw new RawSourceStorageError("raw_source_payload_missing");
    validatePayloadEnvelope(payload, source);
    const resolvedHash = await sha256Blob(payload.file_blob);
    if (resolvedHash !== source.content_hash) {
      throw new RawSourceStorageError("raw_source_integrity_mismatch", "raw source integrity mismatch");
    }
    const resolvedFile = typeof payload.file_blob.name === "string"
      ? payload.file_blob
      : (typeof File === "function" ? new File([payload.file_blob], payload.filename, { type: payload.mime_type || "", lastModified: 0 }) : payload.file_blob);
    return Object.freeze({
      source_document: source,
      file: resolvedFile,
      blob: payload.file_blob,
      metadata: Object.freeze({
        filename: payload.filename,
        mime_type: payload.mime_type,
        byte_size: payload.byte_size,
        content_hash: resolvedHash,
        local_reference: source.local_reference,
      }),
    });
  }

  async function persistDurableSource(database, sourceDocument, file) {
    const requested = Truth.validateSourceDocument(sourceDocument);
    const expectedReference = localReferenceFor(requested.source_document_id);
    if (requested.local_reference !== expectedReference) throw new RawSourceStorageError("raw_source_reference_mismatch");
    const incomingHash = await sha256Blob(file);
    if (incomingHash !== requested.content_hash) {
      throw new RawSourceStorageError("raw_source_integrity_mismatch", "raw source integrity mismatch");
    }

    const canonicalKey = requested.source_document_id;
    const payloadKey = payloadRecordIdFor(canonicalKey);
    const [existingCanonical, existingPayload] = await Promise.all([
      readRecord(database, canonicalKey),
      readRecord(database, payloadKey),
    ]);
    let canonicalToPersist = requested;
    if (existingCanonical) {
      if (existingCanonical.contract_id !== "ariadne-source-document-v1") throw new RawSourceStorageError("source_document_legacy_collision");
      const validated = Truth.validateSourceDocument(existingCanonical);
      if (validated.content_hash !== requested.content_hash || validated.material_type !== requested.material_type) {
        throw new RawSourceStorageError("source_document_canonical_collision");
      }
      if (validated.local_reference && validated.local_reference !== expectedReference) {
        throw new RawSourceStorageError("raw_source_reference_mismatch");
      }
      canonicalToPersist = Truth.validateSourceDocument({
        ...validated,
        local_reference: expectedReference,
        provenance: { ...validated.provenance, raw_source_recoverability: "DURABLE_BROWSER_LOCAL" },
      });
    }
    if (existingPayload) {
      validatePayloadEnvelope(existingPayload, canonicalToPersist);
      const existingHash = await sha256Blob(existingPayload.file_blob);
      if (existingHash !== canonicalToPersist.content_hash) {
        throw new RawSourceStorageError("raw_source_integrity_mismatch", "raw source integrity mismatch");
      }
    }
    const payloadToPersist = payloadEnvelopeFor(canonicalToPersist, file);

    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      let canonicalRecord = null;
      let payloadRecord = null;
      let readsRemaining = 2;
      let contractError = null;
      const abortWith = (error) => {
        if (contractError) return;
        contractError = error;
        transaction.abort();
      };
      const writeWhenReady = () => {
        readsRemaining -= 1;
        if (readsRemaining) return;
        try {
          if (canonicalRecord) {
            if (canonicalRecord.contract_id !== "ariadne-source-document-v1") throw new RawSourceStorageError("source_document_legacy_collision");
            const validated = Truth.validateSourceDocument(canonicalRecord);
            if (validated.content_hash !== canonicalToPersist.content_hash || validated.material_type !== canonicalToPersist.material_type) {
              throw new RawSourceStorageError("source_document_canonical_collision");
            }
          }
          if (payloadRecord) validatePayloadEnvelope(payloadRecord, canonicalToPersist);
          store.put(structuredClone(canonicalToPersist));
          if (!payloadRecord) store.add(structuredClone(payloadToPersist));
        } catch (error) { abortWith(error); }
      };
      const canonicalRequest = store.get(canonicalKey);
      canonicalRequest.onsuccess = () => { canonicalRecord = canonicalRequest.result || null; writeWhenReady(); };
      canonicalRequest.onerror = () => abortWith(canonicalRequest.error || new RawSourceStorageError("raw_source_read_failed"));
      const payloadRequest = store.get(payloadKey);
      payloadRequest.onsuccess = () => { payloadRecord = payloadRequest.result || null; writeWhenReady(); };
      payloadRequest.onerror = () => abortWith(payloadRequest.error || new RawSourceStorageError("raw_source_read_failed"));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(contractError || transaction.error || new RawSourceStorageError("raw_source_persistence_failed"));
      transaction.onabort = () => reject(contractError || transaction.error || new RawSourceStorageError("raw_source_persistence_failed"));
    });

    return resolveRawSource(database, canonicalToPersist);
  }

  // This index remembers a user's ordered selection. It contains no extracted
  // content or conclusions; the original SourceDocuments remain authoritative.
  async function persistArchive(database, documents, sourceUrl = null, displayName = "") {
    const name = archiveName(displayName);
    const sources = documents.map(Truth.validateSourceDocument);
    if (!sources.length || new Set(sources.map(source => source.material_type)).size !== 1
      || new Set(sources.map(source => source.source_document_id)).size !== sources.length) {
      throw new RawSourceStorageError("source_archive_invalid");
    }
    for (const source of sources) await resolveRawSource(database, source);
    const sourceIds = sources.map(source => source.source_document_id);
    const identity = JSON.stringify([sources[0].material_type, sourceIds, sourceUrl]);
    const hash = await sha256Blob(new Blob([identity]));
    const key = `source-archive-v1::${hash.slice(7)}`;
    const existing = await readRecord(database, key);
    if (existing) {
      if (existing.contract_id !== ARCHIVE_CONTRACT || existing.material_type !== sources[0].material_type
        || JSON.stringify(existing.source_document_ids) !== JSON.stringify(sourceIds) || existing.source_url !== sourceUrl) {
        throw new RawSourceStorageError("source_archive_invalid");
      }
      return name ? renameArchive(database, key, name) : existing;
    }
    const archive = {
      contract_id: ARCHIVE_CONTRACT, source_document_id: key,
      material_type: sources[0].material_type, source_document_ids: sourceIds,
      source_url: sourceUrl, created_at: new Date().toISOString(),
      ...(name ? { display_name: name } : {}),
    };
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(archive);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new RawSourceStorageError("raw_source_persistence_failed"));
      transaction.onabort = transaction.onerror;
    });
    return archive;
  }

  async function resolveArchive(database, key, materialType) {
    const record = await readRecord(database, key);
    const ids = record?.contract_id === ARCHIVE_CONTRACT ? record.source_document_ids : [key];
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length
      || (record?.contract_id === ARCHIVE_CONTRACT && record.material_type !== materialType)) {
      throw new RawSourceStorageError("source_archive_invalid");
    }
    const sources = [];
    for (const sourceId of ids) {
      const resolved = await resolveRawSource(database, sourceId);
      if (resolved.source_document.material_type !== materialType) throw new RawSourceStorageError("source_archive_invalid");
      sources.push(resolved);
    }
    return { sources, source_url: record?.contract_id === ARCHIVE_CONTRACT ? record.source_url : sources[0].source_document.provenance?.source_url || null };
  }

  function archiveName(value) {
    if (typeof value !== "string" || value.trim().length > 160 || /[\u0000-\u001f\u007f]/u.test(value)) throw new RawSourceStorageError("source_archive_name_invalid");
    return value.trim();
  }

  async function renameArchive(database, key, value) {
    const name = archiveName(value);
    if (!name) throw new RawSourceStorageError("source_archive_name_required");
    return new Promise((resolve, reject) => {
      let updated, error;
      const transaction = database.transaction(STORE_NAME, "readwrite"), store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        const record = request.result;
        if (record?.contract_id !== ARCHIVE_CONTRACT || record.material_type !== "JOB") {
          error = new RawSourceStorageError("source_archive_invalid"); transaction.abort(); return;
        }
        updated = { ...record, display_name: name };
        store.put(updated);
      };
      request.onerror = () => { error = request.error; transaction.abort(); };
      transaction.oncomplete = () => resolve(updated);
      transaction.onerror = transaction.onabort = () => reject(error || transaction.error || new RawSourceStorageError("raw_source_persistence_failed"));
    });
  }

  function jobArchiveName(ids, revisions) {
    const matches = revisions.filter(record => record.authority === Truth.AUTHORITY.revision
      && JSON.stringify(record.provenance?.source_document_ids) === JSON.stringify(ids) && record.payload?.title)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || (b.version || 0) - (a.version || 0));
    const payload = matches[0]?.payload;
    return payload ? [payload.company, payload.title].filter(Boolean).join(" · ").slice(0, 160) : "";
  }

  function archiveDownloadName(name, filename, position, count) {
    const safe = archiveName(name).replace(/[<>:"/\\|?*]/g, "-").replace(/[. ]+$/g, "");
    if (!safe) throw new RawSourceStorageError("source_archive_name_required");
    const extension = String(filename).match(/\.[a-z0-9]{1,10}$/i)?.[0] || "";
    let stem = "", bytes = 0;
    for (const character of safe) {
      const size = new TextEncoder().encode(character).length;
      if (bytes + size > 180) break;
      stem += character; bytes += size;
    }
    return `${stem}${count > 1 ? `-${position + 1}` : ""}${extension}`;
  }

  function isArchiveRecordFor(record, sourceId) {
    return record?.contract_id === ARCHIVE_CONTRACT && Array.isArray(record.source_document_ids) && record.source_document_ids.includes(sourceId);
  }

  function archiveOptions(records, materialType, revisions = []) {
    const sources = records.filter(record => record.contract_id === "ariadne-source-document-v1" && record.material_type === materialType && record.local_reference);
    const byId = new Map(sources.map(source => [source.source_document_id, source]));
    const archives = records.filter(record => record.contract_id === ARCHIVE_CONTRACT && record.material_type === materialType
      && Array.isArray(record.source_document_ids) && record.source_document_ids.length && record.source_document_ids.every(id => byId.has(id)));
    const groupedIds = new Set(archives.flatMap(archive => archive.source_document_ids));
    const options = [...archives.map(archive => ({ id: archive.source_document_id, ids: archive.source_document_ids,
      display_name: archive.display_name || "", created_at: archive.created_at })),
      ...sources.filter(source => !groupedIds.has(source.source_document_id)).map(source => ({ id: source.source_document_id,
        ids: [source.source_document_id], display_name: "", created_at: source.created_at }))]
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return options.map((option, index) => {
      const name = option.display_name || (materialType === "JOB" ? jobArchiveName(option.ids, revisions) : "");
      const filenames = option.ids.map(id => byId.get(id).filename).join("、");
      const date = option.created_at ? new Date(option.created_at).toLocaleString("zh-CN", { hour12: false }) : "";
      return { id: option.id, display_name: name, created_at: option.created_at,
        label: materialType === "JOB" ? `${name || "未命名职位"} · ${option.ids.length} 份 · ${date} · #${index + 1}` : filenames };
    });
  }

  return Object.freeze({
    DB_NAME,
    STORE_NAME,
    RECORD_TYPE,
    PAYLOAD_KEY_PREFIX,
    RawSourceStorageError,
    payloadRecordIdFor,
    localReferenceFor,
    parseLocalReference,
    sha256Blob,
    payloadEnvelopeFor,
    isPayloadRecord,
    isPayloadRecordFor,
    readRecord,
    sourceDocumentForId,
    resolveRawSource,
    persistDurableSource,
    ARCHIVE_CONTRACT, persistArchive, resolveArchive, archiveOptions, isArchiveRecordFor,
    archiveName, renameArchive, jobArchiveName, archiveDownloadName,
  });
}));
