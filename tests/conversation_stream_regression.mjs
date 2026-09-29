import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const T = require("../public/conversation-turn-transport.js");
const enc = new TextEncoder();
function response(events, close = true) {
  let controller;
  const stream = new ReadableStream({ start(c) { controller = c; } });
  for (const event of events) {
    const data = enc.encode(JSON.stringify(event) + "\n");
    // Deliberately split every multibyte Chinese character.
    for (const byte of data) controller.enqueue(new Uint8Array([byte]));
  }
  if (close) controller.close();
  return [new Response(stream, { headers: { "Content-Type": T.STREAM } }), controller];
}
const preview = { seq: 1, type: "preview", text: "初步公开结论；未核验。" };
const result = { seq: 2, type: "result", status: 200, result: { output: "complete" } };
const [r, controller] = response([preview], false);
const seen = [];
const commentary = {seq:1,type:'commentary',id:'public-1',text:'Public status'};
const publicSeen=[];
await T.readStream(response([commentary,result])[0],event=>publicSeen.push(event));
assert.deepEqual(publicSeen,[commentary]);
await assert.rejects(T.readStream(response([{...commentary,id:null},result])[0],()=>{}));
const commentaryDeltas = [];
await T.readStream(response([
  {seq:1,type:'commentary',id:'one',text:'你'},
  {seq:2,type:'commentary',id:'two',text:'Other'},
  {seq:3,type:'commentary_delta',id:'one',text:'好。'},
  {seq:4,type:'commentary',id:'one',text:'更正'},
  {seq:5,type:'result',status:200,result:{output:'done'}}
])[0], event => commentaryDeltas.push([event.id,event.text]));
assert.deepEqual(commentaryDeltas, [['one','你'],['two','Other'],['one','你好。'],['one','更正']]);
await assert.rejects(T.readStream(response([{seq:1,type:'commentary_delta',id:'one',text:'orphan'},result])[0],()=>{}));
await assert.rejects(T.readStream(response([{...commentary,text:'x'.repeat(12000)},{seq:2,type:'commentary_delta',id:'public-1',text:'x'}])[0],()=>{}));

const activity = {seq:1,type:'activity',id:'a',activity:'thinking',state:'started'};
const activitySeen=[];
await T.readStream(response([activity,result])[0],event=>activitySeen.push(event));
assert.deepEqual(activitySeen,[activity]);
for (const bad of [{activity:'reasoning_text'}, {state:'guessed'}, {id:''}, {text:'PRIVATE'}, {query:'PRIVATE'}]) {
  await assert.rejects(T.readStream(response([{...activity,...bad},result])[0],()=>{}));
}
const deltas=[];
await T.readStream(response([{seq:1,type:'preview',text:'你'},{seq:2,type:'preview_delta',text:'好。'},{seq:3,type:'result',status:200,result:{output:'complete'}}])[0],event=>deltas.push(event.text));
assert.deepEqual(deltas,['你','你好。']);
await assert.rejects(T.readStream(response([{seq:1,type:'preview_delta',text:'missing base'},result])[0],()=>{}));
let settled = false;
const promise = T.readStream(r, event => seen.push(event)).then(value => { settled = true; return value; });
await new Promise(resolve => setTimeout(resolve, 20));
assert.deepEqual(seen, [preview]); assert.equal(settled, false);
controller.enqueue(enc.encode(JSON.stringify(result) + "\n")); controller.close();
assert.deepEqual(await promise, result);
for (const events of [[preview], [preview, { ...result, seq: 3 }], [result], [preview, result, result], [{ seq: 1, type: "reasoning", text: "secret" }]]) {
  await assert.rejects(T.readStream(response(events)[0], () => {}));
}
const finishes = [];
globalThis.AriadneConversationAttachments = { prepare: async request => request, dispatch() {}, stage() {}, finish(_request, ok) { finishes.push(ok); } };
globalThis.AriadneTransport = { fetch: async () => response([preview, { ...result, status: 422, result: { error: "VALIDATION_FAILED" } }])[0] };
await assert.rejects(T.execute({ request: { request_id: "synthetic" }, domain: "JOB", endpoint: "/api/job-conversation-turn" }), /VALIDATION_FAILED/);
assert.deepEqual(finishes, [false]);
console.log("conversation_stream_regression=PASS: early UTF-8 preview, strict terminal/sequence, no reasoning, failure lifecycle");
