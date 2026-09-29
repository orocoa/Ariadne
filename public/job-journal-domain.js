(function (root, factory) {
  const api = factory(root.AriadneContentDatabase || (typeof module === "object" && module.exports ? require("./content-database.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AriadneJobJournal = api;
}(globalThis, function (ContentDatabase) {
  "use strict";
  const DB = "ariadne-job-journal-v1", STORE = "job_journal_entries", IMAGES = "job_journal_images";
  const FEEDBACK = Object.freeze({ UPDATE: "进展记录", READ_NO_REPLY: "已读未回", REJECTED: "明确拒绝", NO_RESPONSE: "持续无回复", INTERVIEW: "面试邀请", OFFER: "收到 Offer", OTHER: "其他反馈" });
  const MAX_BYTES = 12 * 1024 * 1024;
  function validate(record) {
    if (!record || typeof record.entry_id !== "string" || !record.entry_id || typeof record.job_context_id !== "string" || !record.job_context_id
        || !Object.hasOwn(FEEDBACK, record.feedback) || typeof record.text !== "string" || record.text.length > 6000
        || !/^\d{4}-\d{2}-\d{2}$/.test(record.observed_on) || !Number.isFinite(Date.parse(record.observed_on))
        || new Date(record.observed_on).toISOString().slice(0, 10) !== record.observed_on
        || !Array.isArray(record.images) || record.images.length > 4 || !Number.isFinite(Date.parse(record.created_at))) throw Error("求职记录格式无效，请检查日期与内容。");
    if (!record.text.trim() && !record.images.length) throw Error("请填写经过或添加图片后再保存。");
    let total = 0;
    for (const image of record.images) {
      if (!(image.file instanceof Blob) || !["image/png", "image/jpeg", "image/webp"].includes(image.file.type) || !image.file.size
          || image.file.size > 5 * 1024 * 1024 || typeof image.name !== "string") throw Error("图片须为 PNG、JPEG 或 WebP，单张不超过 5 MB。");
      total += image.file.size;
    }
    if (total > MAX_BYTES) throw Error("每条记录最多 4 张图片，合计不超过 12 MB。");
    return record;
  }
  async function prepareImages(files) {
    if (files.length > 4) throw Error("每条记录最多 4 张图片。");
    const images = [];
    for (const file of files) {
      const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const type = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? "image/png"
        : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "image/jpeg"
        : String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" ? "image/webp" : null;
      if (!type) throw Error("无法识别图片，请使用 PNG、JPEG 或 WebP。");
      images.push({ name: file.name || "图片", file: new Blob([file], { type }) });
    }
    validate({ entry_id: "check", job_context_id: "check", feedback: "UPDATE", text: "check", observed_on: "2026-01-01", created_at: new Date().toISOString(), images });
    return images;
  }
  function native() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "entry_id" });
        if (!request.result.objectStoreNames.contains(IMAGES)) request.result.createObjectStore(IMAGES, { keyPath: "image_id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => reject(Error("求职记录无法打开，请重试。"));
    });
  }
  const open = () => globalThis.AriadneJobFollowupStorage ? globalThis.AriadneJobFollowupStorage.open(DB, native) : globalThis.AriadneContentDatabase ? globalThis.AriadneContentDatabase.open(DB, native) : native();
  async function list(jobId) {
    if (typeof jobId !== "string" || !jobId || jobId.length > 1024) throw Error("WORKSPACE_QUERY_INVALID");
    const db = await open();
    try {
      // Read this job's entries once, then batch only their live image IDs.
      // Revisions and images are immutable during this independent read; the
      // save command still rechecks the complete journal/application read set.
      const records = db.getRecords ? await db.getRecords(STORE, { job_context_id: jobId })
        : await ContentDatabase.readRecords(db, STORE);
      const entries = records.filter(entry => entry.job_context_id === jobId && !entry.deleted_at);
      const imageIds = [...new Set(entries.flatMap(entry => entry.images.map(image => image.image_id)))];
      const images = new Map();
      for (let offset = 0; offset < imageIds.length; offset += 1000) {
        const keys = imageIds.slice(offset, offset + 1000);
        const batch = db.batchGet ? await db.batchGet(IMAGES, keys) : await ContentDatabase.readRecords(db, IMAGES, keys);
        keys.forEach((key, index) => images.set(key, batch[index]));
      }
      for (const entry of entries) {
        entry.images = entry.images.map(image => {
          const original = images.get(image.image_id);
          if (!original || original.entry_id !== entry.entry_id || original.job_context_id !== jobId) throw Error("求职记录图片来源不一致。");
          return { image_id: image.image_id, name: image.name, file: original.file };
        });
        validate(entry);
      }
      return entries.sort((a, b) => a.observed_on.localeCompare(b.observed_on) || a.created_at.localeCompare(b.created_at) || a.entry_id.localeCompare(b.entry_id));
    } finally { db.close(); }
  }
  async function save(record) {
    validate(record);
    const db = await open();
    try { await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE, IMAGES], "readwrite");
      const images = record.images.map((image, index) => ({ image_id: `${record.entry_id}:${index}`, name: image.name }));
      record.images.forEach((image, index) => tx.objectStore(IMAGES).add({ ...images[index], entry_id: record.entry_id, job_context_id: record.job_context_id, file: image.file }));
      // Append only: an existing record can never be replaced by this form.
      tx.objectStore(STORE).add({ ...record, images });
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(Error("求职记录未保存，输入仍保留。请重试；如已保存，请刷新核对。"));
    }); } finally { db.close(); }
    return record;
  }
  const fingerprint = entries => JSON.stringify(entries.map(entry => [entry.entry_id, entry.revision || 0]).sort((a, b) => a[0].localeCompare(b[0])));
  return Object.freeze({ fingerprint, DB, STORE, IMAGES, FEEDBACK, validate, prepareImages, list, save });
}));
