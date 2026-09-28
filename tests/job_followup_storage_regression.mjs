// Real HTTP + filesystem transactions; synthetic records only, no model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Content = require('../public/content-database.js'), contract = require('../data/workspace_storage_v1.json');
const Truth = require('../public/truth-persistence-domain.js'), C = require('../public/job-context-domain.js');
const A = require('../public/job-application-domain.js'), J = require('../public/job-journal-domain.js'), Demo = require('../public/v1-demo-domain.js');
const workspace = crypto.randomUUID().replaceAll('-', ''), root = await fs.mkdtemp(path.resolve('.cache/job-followup-regression-'));
const child = spawn('python3', ['-u', '-c', `
from app import JobRadarHandler, ThreadingHTTPServer
from socketserver import TCPServer
class Server(ThreadingHTTPServer):
 def server_bind(self):
  TCPServer.server_bind(self)
  self.server_name='localhost'
  self.server_port=self.server_address[1]
s=Server(('127.0.0.1',0),JobRadarHandler)
print(s.server_port,flush=True)
s.serve_forever()
`], { env: { ...process.env, ARIADNE_CODEX_ENABLED: '0', ARIADNE_WORKSPACE_ROOT: root }, stdio: ['ignore','pipe','pipe'] });
let log=''; child.stderr.on('data', x=>{log+=x;});
const originalFetch=globalThis.fetch;
try {
  const port = await new Promise((resolve,reject)=> {
    const timer=setTimeout(()=>reject(Error('server timeout')),15000);
    child.once('error',reject); child.stdout.once('data', x=>{clearTimeout(timer);resolve(Number(String(x).trim()));});
  });
  const base=`http://127.0.0.1:${port}`, http=(url,options)=>originalFetch(new URL(url,base),{...options,signal:AbortSignal.timeout(10000)});
  globalThis.fetch=http;
  for(const [database,schema] of Object.entries(contract.databases)) {
    const r=await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'commit',transaction_id:crypto.randomUUID().replaceAll('-',''),workspace,database,expected:Object.fromEntries(Object.keys(schema).map(x=>[x,null])),writes:[],initialize:true})});assert.equal(r.status,200);
  }
  const connection = name => Content.connection(workspace,name,contract.databases[name]);
  const read = async (name,store)=> { const db=connection(name); try {return await new Promise((resolve,reject)=>{const tx=db.transaction(store), r=tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);tx.onerror=tx.onabort=()=>reject(tx.error);});}finally{db.close();} };
  const write = async (name,stores,callback)=> {const db=connection(name);try{return await new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readwrite');callback(tx);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);});}finally{db.close();}};
  globalThis.AriadneContentDatabase={open:async name=>connection(name)};
  globalThis.AriadneTruthPersistence={...Truth,openDatabase:async()=>connection(Truth.DB_NAME)};
  globalThis.AriadneJobContext=C;globalThis.AriadneJobApplications=A;globalThis.AriadneJobJournal=J;
  require('../public/job-followup-storage.js');const F=globalThis.AriadneJobFollowupStorage;
  const id='synthetic-job', initial=A.next(A.initial(id),{stage:'APPLIED',note:'原备注',outcome:''},0);
  const file=new Blob([Buffer.from('89504e470d0a1a0a','hex')],{type:'image/png'});
  const old={entry_id:'old-entry',job_context_id:id,observed_on:'2026-09-22',created_at:'2026-09-22T00:00:00Z',feedback:'UPDATE',text:'旧记录',images:[{image_id:'old-image',name:'old.png'}]};
  await write(A.DB_NAME,['applications'],tx=>tx.objectStore('applications').add(initial));
  await write(J.DB,[J.STORE,J.IMAGES],tx=>{tx.objectStore(J.STORE).add(old);tx.objectStore(J.IMAGES).add({image_id:'old-image',entry_id:old.entry_id,job_context_id:id,file});});
  await F.open(A.DB_NAME).then(db=>db.close()); await F.open(J.DB).then(db=>db.close());
  assert.deepEqual(await read(A.DB_NAME,'applications'),[initial],'legacy database stays intact');
  assert.equal((await read(J.DB,J.STORE))[0].text,'旧记录');
  let entries=await J.list(id), application=(await A.all()).get(id);
  assert.equal(entries.length,1);assert.equal(await entries[0].images[0].file.text(),await file.text());
  const currentJob={...Demo.clone(Demo.JOB_FIXTURE),job_context_id:id,item_version:1};
  await write(Truth.DB_NAME,['demo_job_contexts'],tx=>tx.objectStore('demo_job_contexts').add(currentJob));
  const edits=Object.fromEntries(['title','company','location','summary','requirements'].map(k=>[k,currentJob[k]]));
  const added={...old,entry_id:'new-entry',observed_on:'2026-09-21',text:'新增记录',images:[{name:'new.png',file}]};
  const input={jobId:id,application:{...application,draftNote:'第一条\n第二条',draftOutcome:''},entries:[...entries,added],observedEntries:entries,currentJob,currentRevision:null,edits:{...edits,title:'新职位名称'}};
  // A failed commit cannot publish Job fields, notes, journal or image references.
  const before=await fs.readFile(path.join(root,workspace,'HEAD.json'),'utf8');
  globalThis.fetch=(url,options)=>options?.body && JSON.parse(options.body).action==='commit' ? Promise.resolve(new Response('{"error":"WORKSPACE_STORAGE_UNAVAILABLE"}',{status:503})) : http(url,options);
  await assert.rejects(F.save(input));
  assert.equal(await fs.readFile(path.join(root,workspace,'HEAD.json'),'utf8'),before);
  globalThis.fetch=http;
  let result=await F.save(input);
  assert.equal(result.job.title,'新职位名称');assert.equal((await A.all()).get(id).note,'第一条\n第二条');
  entries=await J.list(id);assert.deepEqual(entries.map(x=>x.entry_id),['new-entry','old-entry']);
  assert.equal((await read(Truth.DB_NAME,J.IMAGES)).length,2,'unchanged originals are not duplicated');
  await assert.rejects(F.save(input),/其他页面更新/,'stale application/journal cannot overwrite saved state');
  application=(await A.all()).get(id);
  const latest={...input,currentJob:result.job,edits:{...edits,title:result.job.title},application:{...application,draftNote:'备注单独调整',draftOutcome:''},entries,observedEntries:entries};
  result=await F.save(latest);
  assert.equal((await read(Truth.DB_NAME,J.IMAGES)).length,2,'notes-only save keeps original image IDs and bytes');
  // Journal-only external change also invalidates an otherwise current application.
  const refreshed=(await A.all()).get(id);
  await J.save({...added,entry_id:'outside-entry'});
  await assert.rejects(F.save({...latest,application:{...refreshed,draftNote:'stale',draftOutcome:''}}),/其他页面更新/);
  entries=await J.list(id);application=(await A.all()).get(id);
  const deleting={...latest,application:{...application,draftNote:application.note,draftOutcome:''},entries:entries.filter(e=>e.entry_id!=='old-entry'),observedEntries:entries};
  await F.save(deleting);
  assert(!(await J.list(id)).some(x=>x.entry_id==='old-entry'));
  assert((await read(Truth.DB_NAME,J.STORE)).find(x=>x.entry_id==='old-entry').deleted_at);
  assert((await read(Truth.DB_NAME,J.IMAGES)).some(x=>x.image_id==='old-image'),'deleted record original is retained');
  await F.open(J.DB).then(db=>db.close());assert(!(await J.list(id)).some(x=>x.entry_id==='old-entry'),'migration never resurrects a deleted record');
  entries=await J.list(id);application=(await A.all()).get(id);
  const collision={...deleting,observedEntries:entries,application:{...application,draftNote:'must rollback',draftOutcome:''},entries:[...entries,{...added,job_context_id:'other-job',entry_id:'wrong'}]};
  await assert.rejects(F.save(collision),/不属于/);assert.equal((await A.all()).get(id).note,application.note);
  // Canonical Job revision and follow-up data share the same commit and stale-head gate.
  const sourceId='source-synthetic';
  const proposal=Truth.validateProposal({contract_id:'ariadne-context-proposal-v1',proposal_id:'proposal-synthetic',proposal_type:'JOB_CONTEXT',source_document_ids:[sourceId],processing_run_id:'run-synthetic',runtime_snapshot_id:'snapshot-synthetic',status:'AWAITING_REVIEW',created_at:'2026-09-24T00:00:00Z',payload:{contract_id:C.PAYLOAD_CONTRACT,title:'原职位',company:'测试公司',location:'上海',summary:'说明',requirements:[],source_document_ids:[sourceId],source_url:null,source_availability:'STRUCTURED_ONLY',field_provenance:Object.fromEntries(C.EDITABLE_FIELDS.map(x=>[x,'HUMAN_CONFIRMED'])),uncertainties:[]},grounding_refs:[{source_document_id:sourceId,location:'text',excerpt_or_reference:'原职位'}],warnings:[],uncertainties:[],authority:Truth.AUTHORITY.proposal});
  const canonical=C.reviewOutcome({proposal,decision:'CONFIRM'}).revision;
  await write(Truth.DB_NAME,['job_context_revisions'],tx=>tx.objectStore('job_context_revisions').add(canonical));
  const ui=C.recordForUi(canonical), app=A.initial(canonical.context_id);
  const canonicalInput={jobId:canonical.context_id,currentJob:ui,currentRevision:canonical,application:{...app,draftNote:'面试准备',draftOutcome:''},entries:[],observedEntries:[],edits:{title:'已修改职位',company:ui.company,location:ui.location,summary:ui.summary,requirements:ui.requirements}};
  const canonicalResult=await F.save(canonicalInput);
  assert.equal(canonicalResult.revision.version,2);assert.equal(canonicalResult.revision.previous_revision_id,canonical.revision_id);
  assert.equal((await A.all()).get(canonical.context_id).note,'面试准备');
  await assert.rejects(F.save({...canonicalInput,application:{...canonicalResult.application,draftNote:'stale head',draftOutcome:''}}),/职位内容已更新/);
  assert.equal((await read(Truth.DB_NAME,'job_context_revisions')).length,2);
  assert.equal((await read(Truth.DB_NAME,'candidate_context_revisions')).length,0);
  const beforeStage=(await A.all()).get(canonical.context_id);
  const stageProposal=A.stageProposal(beforeStage,'CLOSED','用户要求将此卡片标为已结束','synthetic-analysis');
  { const db=await Truth.openDatabase();try{await A.persistStageProposal(db,stageProposal);}finally{db.close();} }
  const beforeStageCommit=await fs.readFile(path.join(root,workspace,'HEAD.json'),'utf8');
  globalThis.fetch=(url,options)=>options?.body && JSON.parse(options.body).action==='commit' ? Promise.resolve(new Response('{"error":"WORKSPACE_STORAGE_UNAVAILABLE"}',{status:503})) : http(url,options);
  { const db=await Truth.openDatabase();try{await assert.rejects(A.decideStageProposal(db,stageProposal,'CONFIRM'));}finally{db.close();} }
  assert.equal(await fs.readFile(path.join(root,workspace,'HEAD.json'),'utf8'),beforeStageCommit,'failed approval rolls back status and decision');
  globalThis.fetch=http;
  { const db=await Truth.openDatabase();try{await A.decideStageProposal(db,stageProposal,'CONFIRM');}finally{db.close();} }
  const closed=(await A.all()).get(canonical.context_id);
  assert.equal(closed.stage,'CLOSED');assert.equal(closed.outcome,'');assert.equal(closed.note,beforeStage.note);
  assert.equal(closed.revision,beforeStage.revision+1);assert.equal(closed.history.at(-1).stage,'CLOSED');
  assert.equal((await read(Truth.DB_NAME,'job_context_revisions')).length,2,'stage approval creates no Job content revision');
  { const db=await Truth.openDatabase();try{await assert.rejects(A.decideStageProposal(db,stageProposal,'CONFIRM'),/已处理/);}finally{db.close();} }
  const stale=A.stageProposal(closed,'IN_PROGRESS','用户要求重开','synthetic-analysis-2');
  { const db=await Truth.openDatabase();try{await A.persistStageProposal(db,stale);}finally{db.close();} }
  await A.save(canonical.context_id,{stage:'APPLIED',outcome:'',note:closed.note},closed.revision);
  { const db=await Truth.openDatabase();try{await assert.rejects(A.decideStageProposal(db,stale,'CONFIRM'),/其他页面更新/);}finally{db.close();} }
  { const db=await Truth.openDatabase();try{await A.decideStageProposal(db,stale,'REJECT');}finally{db.close();} }
  assert.equal((await A.all()).get(canonical.context_id).stage,'APPLIED','rejecting an expired proposal does not modify the newer stage');
  console.log('PASS unified save: legacy migration, original bytes, atomic failure/retry, cancellation boundary, edits/deletion history, ordering, conflicts, canonical revision and Candidate isolation');
} finally { globalThis.fetch=originalFetch;child.kill('SIGTERM');await fs.writeFile(path.join(root,'server.log'),log); }
