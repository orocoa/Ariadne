import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {databaseFor, sourceInput, requestFor, WORKSPACE, HUMAN, commitPrepared} from './helpers/resume-task-fixtures.mjs';
const require=createRequire(import.meta.url), Task=require('../public/resume-task-domain.js');
const python=process.env.ARIADNE_TEST_PYTHON || 'python3';
const db=databaseFor(sourceInput());
const firstRequest=requestFor(HUMAN);
const first=await Task.buildContext({database:db,request:firstRequest,domain:'PERSONAL',workspace:WORKSPACE});
function resultFor(context,request){
 const result=spawnSync(python,[resolve('tests/resume_task_runtime_regression.py'),'--result'],{input:JSON.stringify({context,runtime_snapshot:request.runtime_snapshot,intent:{instruction:request.human_message,template_name:'',continue:Boolean(context.prior_task)}}),encoding:'utf8',env:{...process.env,PYTHONPATH:process.cwd()},maxBuffer:3000000});
 assert.equal(result.status,0,result.stderr); return JSON.parse(result.stdout);
}
const old=await Task.validateResult(resultFor(first,firstRequest),first);
await Task.assertFresh(db,old);await commitPrepared(Task,db,old);
const storedOld=JSON.stringify(db.data.get('resume_document_versions').get(old.document_version.version_id));
const newer=structuredClone(sourceInput().candidate_context_revisions[0]);
newer.revision_id+='-new';newer.version=2;newer.previous_revision_id=sourceInput().candidate_context_revisions[0].revision_id;
newer.payload.items[0].summary='Updated current evidence: 9 research participants; deployment by colleagues.';
db.data.get('candidate_context_revisions').set(newer.revision_id,newer);
const request=requestFor('Continue the complete previous draft. Use current evidence; preserve its section order.');
const context=await Task.buildContext({database:db,request,domain:'PERSONAL',workspace:WORKSPACE});
assert.notEqual(context.candidate_fingerprint,old.document_version.candidate_fingerprint);
assert.deepEqual(context.prior_version.deliverable,old.document_version.deliverable);
assert.equal(context.prior_version.evidence_snapshot,null);
assert(!context.evidence.some(item=>item.role==='TASK_HUMAN_UNCONFIRMED'&&item.content.text===HUMAN));
assert(JSON.stringify(context.evidence).includes('9 research participants'));
await Task.assertContextFresh(db,context);
const missing={...structuredClone(context),prior_version:{...context.prior_version,task_id:'unrelated-task'}};
missing.context_fingerprint=await Task.fingerprint(Object.fromEntries(Object.entries(missing).filter(([key])=>key!=='context_fingerprint')));
await assert.rejects(Task.validateContext(missing),/RESUME_/);
const raw=resultFor(context,request);
// Deliberately simulated review: verify transport/ledger/CAS, not model quality.
const source=context.evidence.find(item=>item.role==='CANDIDATE_CONFIRMED');
for(const block of raw.deliverable.resume.blocks)block.text=block.text.replace('12 participants','9 participants');
raw.proposal=structuredClone(raw.deliverable);
raw.document_hash=await Task.fingerprint(raw.deliverable);raw.review.document_hash=raw.document_hash;
for(const grounding of raw.grounding){if(grounding.text_source_refs.length)grounding.text_source_refs=[source.ref];if(grounding.right_source_refs.length)grounding.right_source_refs=[source.ref];}
for(const row of raw.review.block_reviews)for(const field of ['text','right'])if(row[field].source_refs.length){row[field].source_refs=[source.ref];row[field].source_states=[source.source_state];}
const prepared=await Task.validateResult(raw,context);
await Task.assertFresh(db,prepared);await commitPrepared(Task,db,prepared);
assert.equal(prepared.document_version.parent_version_id,old.document_version.version_id);
assert.equal(prepared.document_version.version,2);
assert.equal(JSON.stringify(db.data.get('resume_document_versions').get(old.document_version.version_id)),storedOld);
await assert.rejects(Task.assertDocumentFresh(db,old.document_version),/RESUME_CONTEXT_CHANGED/);
await Task.assertDocumentFresh(db,prepared.document_version);
const forged=structuredClone(raw);forged.grounding[0].text_source_refs=['prior-version-fact'];
await assert.rejects(Task.validateResult(forged,context),/RESUME_/);
console.log('PASS profile continuation: complete prior draft retained, old evidence excluded, current ledger required, cross-task/tamper rejected, v2 parent/current download and immutable v1');
