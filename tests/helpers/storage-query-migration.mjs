// Run in a fresh, disposable browser context. All stores use a unique synthetic
// name; the legacy database and migrated data remain available for inspection.
export async function checkStorageQueryMigration() {
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const name = `synthetic-storage-${crypto.randomUUID()}`;
  const schema = { job_journal_entries: 'entry_id', job_journal_images: 'image_id' };
  AriadneWorkspaceStorageContract.databases[name] = schema;
  const legacy = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => { for (const [store, keyPath] of Object.entries(schema)) request.result.createObjectStore(store, { keyPath }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const a = { entry_id: 'entry-a', job_context_id: 'job-a', text: '完整原文', images: [{ image_id: 'image-a', name: 'a.png' }] };
  const b = { entry_id: 'entry-b', job_context_id: 'job-b', text: '其他职位', images: [] };
  await new Promise((resolve, reject) => {
    const tx = legacy.transaction(Object.keys(schema), 'readwrite');
    tx.objectStore('job_journal_entries').add(a); tx.objectStore('job_journal_entries').add(b);
    tx.objectStore('job_journal_images').add({ image_id: 'image-a', job_context_id: 'job-a', entry_id: 'entry-a', file: new Blob(['synthetic-image'], { type: 'image/png' }) });
    tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
  });
  let opened = 0;
  let db = await AriadneContentBrowserStorage.open(name, async () => { opened++; return legacy; });
  assert(opened === 1, 'first migration must read the original once');
  const selected = await db.getRecords('job_journal_entries', { job_context_id: 'job-a' });
  assert(JSON.stringify(selected) === JSON.stringify([a]), 'query preserves the complete selected record');
  const batch = await db.batchGet('job_journal_images', ['image-a', 'missing', 'image-a']);
  assert(batch.length === 3 && batch[1] === undefined && await batch[0].file.text() === 'synthetic-image', 'batch preserves identity, order and original bytes');
  assert(await (await db.getRecord('job_journal_images', 'image-a')).file.text() === 'synthetic-image', 'point-read parity');
  const metadata = await db.getAllMetadata('job_journal_images');
  assert(!Object.hasOwn(metadata[0], 'file'), 'metadata excludes blob bodies');
  db.close();
  // Reload the adapter (equivalent to a new page) so its in-memory ready map
  // cannot accidentally hide a rescan of the legacy database.
  const script = await (await fetch('/content-browser-storage.js', { cache: 'no-store' })).text();
  (0, eval)(script);
  db = await AriadneContentBrowserStorage.open(name, async () => { throw Error('MIGRATED_DATABASE_REOPENED_LEGACY'); });
  assert((await db.getRecords('job_journal_entries')).length === 2, 'marker survives adapter reload');
  db.close();
  return { database: name, checks: ['native migration', 'job query', 'batch/point-read parity', 'metadata blobs excluded', 'persisted marker skips unavailable legacy database'] };
}
