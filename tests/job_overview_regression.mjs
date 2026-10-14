import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const Truth = require("../public/truth-persistence-domain.js");
const Job = require("../public/job-context-domain.js");
const Domain = require("../public/job-overview-domain.js");
const Personal = require("../public/personal-understanding-domain.js");
const Candidate = require("../public/job-candidate-context-domain.js");
const runtime = Domain.runtimeSnapshot({getItem:key=>key === "job-radar-selected-runtime" ? JSON.stringify({mode:"model",provider:"deepseek",model:"deepseek-flash"}) : null});
function databaseFor(input = {}) {
  const specs = new Map([...Truth.STORE_SPECS, { name: "career_entities", keyPath: "entity_id" }, { name: "career_evidence", keyPath: "evidence_id" }].map((entry) => [entry.name, entry.keyPath]));
  const data = new Map([...specs].map(([name]) => [name, new Map((input[name] || []).map((entry) => [entry[specs.get(name)], structuredClone(entry)]))]));
  return {
    data, objectStoreNames: { contains: (name) => data.has(name) },
    transaction(names, mode = "readonly") {
      const stores = Array.isArray(names) ? names : [names];
      const pending = new Map(stores.map((name) => [name, new Map(data.get(name))]));
      let count = 0, timer, aborted = false;
      const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { if (aborted || count) return; if (mode === "readwrite") pending.forEach((records, name) => data.set(name, records)); tx.oncomplete?.(); }, 0); };
      const tx = {
        abort() { aborted = true; clearTimeout(timer); queueMicrotask(() => tx.onabort?.()); },
        objectStore(name) {
          return {
            getAll() { const request = {}; count++; queueMicrotask(() => { request.result = [...pending.get(name).values()].map((entry) => structuredClone(entry)); request.onsuccess?.(); count--; schedule(); }); return request; },
            add(entry) { if (pending.get(name).has(entry[specs.get(name)])) { tx.error = Object.assign(new Error("duplicate"), { name: "ConstraintError" }); tx.abort(); return; } pending.get(name).set(entry[specs.get(name)], structuredClone(entry)); schedule(); },
            put(entry) { pending.get(name).set(entry[specs.get(name)], structuredClone(entry)); schedule(); },
          };
        },
      };
      return tx;
    },
  };
}

function proposal(index, title = `Synthetic Job ${index}`, requirement = "研究与评估") {
  return Job.proposalFor({ source: {source_document_id:`source-job-${index}`}, artifact: {payload:{extracted_text:`${title}\n合成测试公司\n上海\n任职要求\n- ${requirement}`}}, structuring_run:{run_id:`run-job-${index}`,runtime_snapshot_id:"runtime-job-fixture"} });
}
function revision(index, title, requirement) {return Job.reviewOutcome({proposal:proposal(index,title,requirement),decision:"CONFIRM"}).revision;}
const a=revision(1,"用户研究产品经理","负责用户访谈和需求定义；允许远程协作"), b=revision(2,"AI 评估工程师","负责评估指标和测试框架；深圳现场办公"), pending=proposal(3,"设计研究员","负责研究计划；工作地点待确认");
const person = { contract_id: "ariadne-context-revision-v1", context_type: "CANDIDATE", context_id: "synthetic-person", revision_id: "synthetic-person-1", version: 1,
  previous_revision_id: null, created_at: "2026-09-24T08:00:00Z", confirmed_from_proposal_id: "synthetic-person-proposal", review_decision_id: "synthetic-person-decision",
  provenance: { source_document_ids: ["synthetic-person-source"], processing_run_id: "synthetic-person-run", runtime_snapshot_id: "synthetic-person-runtime" },
  authority: Truth.AUTHORITY.revision, payload: { items: [{ item_id: "synthetic-research-project", item_type: "PROJECT", title: "星桥访谈项目", summary: "林澄独立负责12次用户访谈与交互原型；开发和上线由同事负责，没有增长指标。",
    facts: [{label: "职责", value: "用户研究与交互设计，不负责后端工程"}], uncertainties: [], grounding_refs: [] }] } };
const preference = { contract_id: "ariadne-personal-memory-revision-v1", authority: "HUMAN_CONFIRMED_PERSONAL_MEMORY", memory_id: "synthetic-preference", revision_id: "synthetic-preference-1",
  decision_id: "synthetic-memory-decision", created_at: "2026-09-24T08:00:00Z", version: 1, status: "ACTIVE", kind: "PREFERENCE", text: "我偏好远程用户研究工作，不希望以基础设施工程为主要职责。", related_identities: [] };
const input={candidate_context_revisions:[person],personal_memory_revisions:[preference],job_context_revisions:[a,b],context_proposals:[pending],source_documents:[1,2,3].map(i=>({source_document_id:`source-job-${i}`}))};
const snapshot=await Domain.buildSnapshot(input);
if(process.argv.includes("--request")){console.log(JSON.stringify(Domain.requestFor("DISCUSS",Domain.discussionContext(snapshot,"这些职位有什么差异？",[]),"这些职位有什么差异？",runtime,true)));process.exit(0);}
if(process.argv.includes("--seed")){console.log(JSON.stringify(input));process.exit(0);}
assert.equal(snapshot.records.length,3); assert.equal(snapshot.working_count,1);
assert.equal((await Domain.buildSnapshot({...input, candidate_context_revisions:[{private:"Candidate must stay out"}],personal_memory_revisions:[{text:"private memory"}],demo_job_contexts:[{title:"demo must stay out"}]})).fingerprint,snapshot.fingerprint);
assert.deepEqual(Domain.INPUT_STORES,["job_context_lifecycle","job_context_revisions","context_proposals","context_review_decisions","source_documents"]);
assert.throws(()=>Domain.runtimeSnapshot({getItem:()=>JSON.stringify({mode:"local"})}),/runtime_capability/);
assert.throws(()=>Domain.requestFor("DISCUSS",{},"x",runtime,false),/CONSENT_REQUIRED/);
const next={...a,revision_id:"job-revision-new",version:2,previous_revision_id:a.revision_id,payload:{...a.payload,title:"更新后的研究岗位"}};
const newer=await Domain.buildSnapshot({...input,job_context_revisions:[a,next,b]});assert.equal(newer.records.length,3);assert(newer.records.some(x=>x.semantic.title==="更新后的研究岗位"));assert.notEqual(newer.fingerprint,snapshot.fingerprint);
const rejected=await Domain.buildSnapshot({...input,context_review_decisions:[{proposal_id:pending.proposal_id,authority:Truth.AUTHORITY.review,decision:"REJECT"}]});assert.equal(rejected.records.length,2);
const fakeDecision=await Domain.buildSnapshot({...input,context_review_decisions:[{proposal_id:pending.proposal_id,authority:"MODEL",decision:"REJECT"}]});assert.equal(fakeDecision.records.length,3);
const oldPending={...pending,proposal_id:"old-pending",created_at:"2020-01-01T00:00:00Z"};assert.equal((await Domain.buildSnapshot({...input,context_proposals:[oldPending,pending]})).working_count,1);
const accepted=Job.reviewOutcome({proposal:pending,decision:"CONFIRM"}).revision;assert.equal((await Domain.buildSnapshot({...input,job_context_revisions:[a,b,accepted]})).working_count,0);
const personalSnapshot=await Candidate.buildSnapshot({...input,personal_memory_revisions:[]});assert.equal(personalSnapshot.provider_view.confirmed.length,1,"personal context cannot acquire Job information");
const db=databaseFor(input), writesBefore=JSON.stringify([...db.data.get("job_context_revisions").values()]); const calls=[];
async function stub(request){calls.push(request); const output=request.phase==="DISTILL" ? {summaries:request.context.evidence.map(x=>({ref:x.ref,summary:`模型替身摘要：${x.title}`}))} : {summary:"模型替身：不同岗位侧重不同。",insights:request.context.evidence.length?[{text:"模型替身有来源的说明",evidence_refs:[request.context.evidence[0].ref]}]:[],uncertainties:[]};return {contract_id:Domain.Contract.result_contract,request_id:request.request_id,phase:request.phase,runtime_snapshot_id:request.runtime_snapshot.snapshot_id,provider:runtime.provider,model:runtime.model,output,network_call_made:true,persistence:"not_written",authority:"NON_AUTHORITATIVE_JOB_OVERVIEW",usage:{prompt_tokens:10}};}
const options={runtime_snapshot:runtime,consent:true,call:stub};
const directDb = databaseFor(input), beforeDirect = calls.length;
const direct = await Domain.discuss(directDb, {...options, human_message:"比较这些职位"});
assert.deepEqual(calls.slice(beforeDirect).map(entry=>entry.phase), ["DISCUSS"], "an uncached small collection needs only the answering call");
assert.equal(direct.context_coverage.strategy,"COMPLETE_CURRENT_EVIDENCE");
assert.equal(directDb.data.get("job_overview_snapshots").size,0,"a direct discussion does not manufacture or persist an overview");
assert.equal(directDb.data.get("job_overview_fragments").size,0);
assert.equal(JSON.stringify([...directDb.data.get("job_context_revisions").values()]),writesBefore);
const longSummary = "完整职位职责。".repeat(420) + "结尾要求：需要到现场参与研究。";
const fullJob = {...a,payload:{...a.payload,summary:longSummary}};
const fullSnapshot = await Domain.buildSnapshot({job_context_revisions:[fullJob]});
const fullContext = Domain.discussionContext(fullSnapshot,"岗位要求",[]);
assert(new TextEncoder().encode(JSON.stringify(fullSnapshot.records[0].semantic)).length>6000);
assert.equal(fullContext.evidence[0].summary,longSummary,"a long JD fitting the overall budget keeps its tail and all fields");
assert.equal(fullContext.coverage.truncated_jobs,0);
assert.equal(fullContext.coverage.strategy,"COMPLETE_CURRENT_EVIDENCE");
const failingDb=databaseFor(input); const beforeFailure=calls.length;
await assert.rejects(Domain.discuss(failingDb,{...options,human_message:"问题失败",call:async request=>{calls.push(request);throw new Error("synthetic-provider-failure");}}),/synthetic-provider-failure/);
assert.deepEqual(calls.slice(beforeFailure).map(entry=>entry.phase),["DISCUSS"]);
assert([...failingDb.data.get("job_overview_turns").values()].every(entry=>entry.status==="FAILED"));
assert.equal(failingDb.data.get("job_overview_snapshots").size,0);
assert.equal((await Domain.refresh(db,options)).calls,2);
assert.equal((await Domain.refresh(db,options)).calls,0);
const currentOverview = [...db.data.get("job_overview_snapshots").values()][0];
db.data.get("job_overview_snapshots").set(currentOverview.overview_id,{...currentOverview,runtime_identity:"different-model-settings"});
const beforeMismatched=calls.length;
await Domain.discuss(db,{...options,human_message:"用当前模型直接回答"});
assert.equal(calls[beforeMismatched].context.overview,null,"a different model/settings cache is not injected into the direct path");
assert.equal(calls.length-beforeMismatched,1);
db.data.get("job_overview_snapshots").set(currentOverview.overview_id,currentOverview);
const first=await Domain.discuss(db,{...options,human_message:"共同要求是什么？"});assert.equal(first.calls,1);assert.equal(calls.at(-1).request_id,first.turn_id,"stored discussion binds the attachment request identity");assert.equal(first.context_coverage.included_jobs,3);
assert(Domain.discussionContext((await Domain.snapshotFromDatabase(db)),"继续说说",[first]).history[0].assistant.includes("模型替身有来源的说明"), "follow-up history includes grounded findings");
assert(calls.filter(x=>x.phase!=="DISCUSS").every(x=>!x.context.candidate), "Job digests remain independent of the person");
assert.equal(JSON.stringify([...db.data.get("job_context_revisions").values()]),writesBefore,"overview cannot edit job facts");
assert.throws(()=>Domain.write(db,"personal_memory_revisions",{}),/WRITE_SCOPE/);
db.data.get("job_context_revisions").set(next.revision_id,next);
assert.equal((await Domain.snapshotFromDatabase(db)).overview,null);
const refreshed=await Domain.refresh(db,options);assert.equal(refreshed.snapshot.overview.refreshed_fragments,1);assert.equal(refreshed.snapshot.overview.reused_fragments,2);
assert.equal(Domain.discussionContext(refreshed.snapshot,"跟进",[first]).history.length,0);
db.data.get("context_proposals").set(pending.proposal_id,{...pending,status:"REJECTED"});assert.equal((await Domain.snapshotFromDatabase(db)).overview,null);assert.equal((await Domain.snapshotFromDatabase(db)).records.length,2);
const empty=await Domain.buildSnapshot({});assert.equal(Domain.discussionContext(empty,"概况",[]).evidence.length,0);
const huge=await Domain.buildSnapshot({job_context_revisions:Array.from({length:85},(_,i)=>({...a,context_id:`job-many-${i}`,revision_id:`job-many-revision-${i}`,payload:{...a.payload,title:`Long job ${i}`,summary:"职位要求细节".repeat(1000)}}))});
const bounded=Domain.discussionContext(huge,"职位要求",[]);assert(bounded.coverage.omitted_jobs>0);assert(bounded.coverage.truncated_jobs>0);assert(new TextEncoder().encode(JSON.stringify(bounded)).length<48000);
const manyInput={job_context_revisions:Array.from({length:3},(_,i)=>({...a,context_id:`large-job-${i}`,revision_id:`large-revision-${i}`,payload:{...a.payload,summary:longSummary}}))};
const manyDb=databaseFor(manyInput),beforeMany=calls.length;
const many=await Domain.discuss(manyDb,{...options,human_message:"汇总全部职位"});
assert(many.context_coverage.truncated_jobs>0);
assert(calls.slice(beforeMany).some(entry=>entry.phase==="DISTILL"));
assert(calls.slice(beforeMany).some(entry=>entry.phase==="SYNTHESIZE"));
assert.equal(calls.at(-1).phase,"DISCUSS");
assert.equal(calls.at(-1).context.overview.covered_jobs,3,"oversized collections still synthesize every current Job");
assert.equal([...manyDb.data.get("job_overview_snapshots").values()][0].covered_jobs,3);
assert.equal((await Domain.discuss(manyDb,{...options,human_message:"继续比较"})).calls,1,"unchanged large collections continue to reuse the digest cache");
const tiny = { ...snapshot, records: Array.from({length:80},(_,i)=>({ ...snapshot.records[0],ref:`job-${i+1}`,semantic:{title:"x",company:null,location:null,summary:null,requirements:[],uncertainties:[],authority:"CONFIRMED",source_availability:"SOURCE_SAVED"} })) };
assert.equal(Domain.discussionContext(tiny,"概况",[]).evidence.length,60,"detail selection also obeys the Provider record limit");
const staleDb=databaseFor(input);await assert.rejects(Domain.discuss(staleDb,{...options,human_message:"差异",call:async request=>{const result=await stub(request);if(request.phase==="DISCUSS")staleDb.data.get("job_context_revisions").set(next.revision_id,next);return result;}}),/CONTEXT_CHANGED/);
assert([...staleDb.data.get("job_overview_turns").values()].every(x=>x.status==="FAILED"));
const invalid=Domain.requestFor("SYNTHESIZE",{scope:Domain.Contract.scope,evidence:[{ref:"digest-1",title:"x",summary:"x"}],previous:null,traversal:{part:1,total_parts:1}},"",runtime,true);
const bad=await stub(invalid);bad.output.insights[0].evidence_refs=["unknown"];assert.throws(()=>Domain.validateResult(bad,invalid),/GROUNDING_INVALID/);
assert(readFileSync(new URL('../public/personal-understanding.html',import.meta.url),'utf8').includes('围绕过去的项目、你的职责与做事方式'));
assert(readFileSync(new URL('../public/jd.html',import.meta.url),'utf8').includes('了解职位概况'));
assert.equal(Personal.Contract.prompt_version,"ariadne-personal-understanding-prompt-v6");
const delivered={kind:"PDF",title:"职位介绍文件",body:"合成职位概要。",nodes:[],edges:[]};
const beforeDelivery=JSON.stringify([...db.data.get("job_context_revisions").values()]);
const fileTurn=await Domain.discuss(db,{...options,human_message:"制作介绍文件",call:async request=>({...await stub(request),...(request.phase==="DISCUSS"?{deliverable:delivered,delivery_version:"ariadne-conversation-delivery-v1"}:{})})});
assert.deepEqual(fileTurn.output.deliverable,delivered);
assert.deepEqual(db.data.get("job_overview_turns").get(fileTurn.turn_id).output.deliverable,delivered);
assert.equal(JSON.stringify([...db.data.get("job_context_revisions").values()]),beforeDelivery);
console.log(JSON.stringify({job_digest_scope:"pass",personal_discussion_scope:"pass",versions_and_review:"pass",incremental_cache:"pass",read_only_and_failure:"pass",bounded_context:"pass",provider_calls:0}));

// Removing a confirmed card retains immutable history and changes current scope/cache.
const removalDb = databaseFor({...input, context_proposals: [{...proposal(1), proposal_id: a.confirmed_from_proposal_id}, pending]});
const originalRevisions = structuredClone([...removalDb.data.get("job_context_revisions").values()]);
const originalSources = structuredClone([...removalDb.data.get("source_documents").values()]);
const removal = await Job.persistRemoval(removalDb, a);
assert.equal(Truth.validateForStore("job_context_lifecycle", removal).context_id, a.context_id);
assert.throws(() => Truth.validateJobContextLifecycle({...removal, authority: "MODEL"}));
assert.throws(() => Truth.validateJobContextLifecycle({...removal, item_id: "foreign"}));
assert.deepEqual([...removalDb.data.get("job_context_revisions").values()], originalRevisions);
assert.deepEqual([...removalDb.data.get("source_documents").values()], originalSources);
assert.deepEqual(Job.activeRevisions(originalRevisions, [removal]).map(r => r.context_id), [b.context_id]);
const afterRemoval = await Domain.snapshotFromDatabase(removalDb);
assert.equal(afterRemoval.confirmed_count, 1);
assert.notEqual(afterRemoval.fingerprint, snapshot.fingerprint);
assert(!afterRemoval.records.some(r => r.context_id === a.context_id));
assert.equal(afterRemoval.working_count, 1, "removed accepted proposal must not return as Working");
await assert.rejects(Job.persistRemoval(removalDb, a), /job_context_already_removed/);
const conflictDb = databaseFor({job_context_revisions: [a, {...a, revision_id: "newer-revision", version: a.version + 1}]});
await assert.rejects(Job.persistRemoval(conflictDb, a), /context_version_conflict/);
assert.equal(conflictDb.data.get("job_context_lifecycle").size, 0);
const failureDb = {transaction() { throw Error("storage unavailable"); }};
await assert.rejects(Job.persistRemoval(failureDb, b), /storage unavailable/);
console.log("job card removal: history/source preservation, current scope, duplicate/conflict and failure PASS");

// Cross-job choice must use the same current profile and saved memories as Job detail.
const jointDb = databaseFor(input);
const sourceBefore = JSON.stringify([...jointDb.data.get("candidate_context_revisions").values()]);
const memoriesBefore = JSON.stringify([...jointDb.data.get("personal_memory_revisions").values()]);
let captured;
const joint = await Domain.discuss(jointDb, {...options, human_message:"这些职位哪个更适合我？", call: async request => {
  captured = request;
  const result = await stub(request);
  result.output.insights = [{text:"访谈项目支持用户研究方向，工程上线尚无证据。",evidence_refs:[request.context.candidate.confirmed[0].candidate_ref,request.context.evidence[0].ref]}];
  return result;
}});
assert.equal(captured.context.scope,Domain.Contract.discussion_scope);
assert(captured.context.candidate.confirmed.some(x=>x.title==="星桥访谈项目"));
assert(captured.context.candidate.confirmed.some(x=>x.item_type==="PERSONAL_MEMORY" && JSON.stringify(x).includes("远程")));
assert.equal(captured.context.candidate_status,"AVAILABLE");
assert.equal(captured.context.candidate_coverage.complete,true);
assert.equal(joint.output.insights[0].candidate_sources[0].title,"星桥访谈项目");
assert.equal(JSON.stringify([...jointDb.data.get("candidate_context_revisions").values()]),sourceBefore);
assert.equal(JSON.stringify([...jointDb.data.get("personal_memory_revisions").values()]),memoriesBefore);
const updatedPerson = {...person,revision_id:"synthetic-person-2",version:2,previous_revision_id:person.revision_id,payload:{items:[{...person.payload.items[0],summary:"新版经历：已完成20次访谈，依然未负责工程上线。"}]}};
jointDb.data.get("candidate_context_revisions").set(updatedPerson.revision_id,updatedPerson);
const changedProfile = await Domain.snapshotFromDatabase(jointDb);
const changedContext = Domain.discussionContext(changedProfile,"继续比较",[joint]);
assert.equal(changedContext.history.length,0,"previous profile conclusions must not be current context");
assert(JSON.stringify(changedContext.candidate).includes("20次"));
const retracted = {...preference,revision_id:"synthetic-preference-2",version:2,status:"RETRACTED"};
jointDb.data.get("personal_memory_revisions").set(retracted.revision_id,retracted);
assert(!JSON.stringify(Domain.discussionContext(await Domain.snapshotFromDatabase(jointDb),"当前偏好",[joint]).candidate).includes("远程用户研究"));
await assert.rejects(Domain.discuss(jointDb,{...options,human_message:"比较",call:async request=>{
  const result=await stub(request);jointDb.data.get("personal_memory_revisions").set("synthetic-preference-3",{...preference,revision_id:"synthetic-preference-3",version:3});return result;
}}),/CONTEXT_CHANGED/);
const unreadable = databaseFor(input), oldTransaction = unreadable.transaction;
unreadable.transaction = function(names,...args) { if(names==="candidate_context_revisions") throw Error("synthetic-profile-read-failed"); return oldTransaction.call(this,names,...args); };
let madeCall=false;
await assert.rejects(Domain.discuss(unreadable,{...options,human_message:"读取失败",call:async()=>{madeCall=true;}}),/synthetic-profile-read-failed/);
assert.equal(madeCall,false,"reading failure cannot become empty profile or call model");
const largePersonal = await Domain.buildSnapshot({...input,candidate_context_revisions:Array.from({length:60},(_,i)=>({...person,context_id:`person-${i}`,revision_id:`person-revision-${i}`,payload:{items:[{...person.payload.items[0],summary:"大段个人材料。".repeat(1000)}]}}))});
const partial = Domain.discussionContext(largePersonal,"研究职位",[]);
assert.equal(partial.candidate_status,"AVAILABLE");assert(partial.candidate_coverage.omitted_records>0);assert.equal(partial.candidate_coverage.complete,false);
assert(new TextEncoder().encode(JSON.stringify(partial)).length<=Domain.Contract.limits.context_bytes);
const onlyPerson = Domain.discussionContext(await Domain.buildSnapshot({candidate_context_revisions:[person]}),"我是谁",[]);
assert.equal(onlyPerson.evidence.length,0);assert.equal(onlyPerson.candidate.confirmed.length,1);
const noPerson = Domain.discussionContext(await Domain.buildSnapshot({job_context_revisions:[a]}),"我适合吗",[]);
assert.equal(noPerson.candidate_status,"NO_ACTIVE_RECORDS");
console.log("Cross-job personal evidence, saved preferences, read-only, versions, retraction, read failure and coverage PASS");
