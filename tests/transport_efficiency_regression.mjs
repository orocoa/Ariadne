import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const sessions = new Map(), calls = [];
let credential = 'synthetic-test-key';
const storage = {getItem: key => sessions.get(key) ?? null, setItem: (key, value) => sessions.set(key, value)};
function client() {
  const context = vm.createContext({URL, Headers, Blob, Response, crypto: webcrypto,
    location: new URL('https://synthetic.example/'), sessionStorage: storage,
    localStorage: {getItem: () => credential}, AriadneProduct: {kind: 'web'},
    fetch: async (url, options = {}) => {
      calls.push({url, options});
      return new Response(JSON.stringify(url === '/api/web-runtime' ? {mode: 'web', byok: ['deepseek']} : {ok: true}), {headers: {'Content-Type': 'application/json'}});
    },
  });
  vm.runInContext(fs.readFileSync('public/product-transport.js', 'utf8'), context);
  return context.AriadneTransport;
}
const request = (id, extra = {}) => ({method: 'POST', body: JSON.stringify({runtime_snapshot: {mode: 'model', provider: 'deepseek'}, request_id: id, ...extra})});
const session = () => new Headers(calls.at(-1).options.headers).get('X-Ariadne-Web-Session');
let transport = client();
await transport.fetch('/api/personal-understanding-turn', request('old-turn'));
const old = session();
transport.beginNewSession();
await transport.fetch('/api/personal-understanding-turn', request('new-turn'));
assert.notEqual(session(), old);
await transport.fetch('/api/personal-understanding-turn', request('old-turn'));
assert.equal(session(), old, 'old operation keeps the same durable receipt namespace');
transport = client();
await transport.fetch('/api/personal-understanding-turn', request('old-turn'));
assert.equal(session(), old, 'reload retains replay binding');
await transport.fetch('/api/candidate-conversation-turn', request(undefined, {turn: {execution_id: 'execution', generation: 'one'}}));
const active = session();
transport.beginNewSession();
await transport.fetch('/api/candidate-conversation-turn/cancel', request(undefined, {execution_id: 'execution', generation: 'one'}));
assert.equal(session(), active, 'cancel reaches the in-flight request after renewal');
const beforeCredentialChange = calls.length;
credential = 'synthetic-other-key';
await assert.rejects(transport.fetch('/api/personal-understanding-turn', request('old-turn')), /WEB_OPERATION_CREDENTIAL_CHANGED/);
assert.equal(calls.length, beforeCredentialChange, 'credential change must not create another paid namespace for an old operation');
assert(![...sessions.values()].join('').includes(credential), 'raw credentials never enter replay metadata');
await transport.fetch('/api/personal-understanding-turn', request('newly-reviewed-turn'));

const attachmentsContext = vm.createContext({crypto: webcrypto, Blob});
vm.runInContext(fs.readFileSync('public/conversation-attachments.js', 'utf8'), attachmentsContext);
const raw = new TextEncoder().encode('Synthetic local attachment');
const metadata = await attachmentsContext.AriadneConversationAttachments.recordFor({name: 'fixture.txt', arrayBuffer: async () => raw.buffer}, false);
assert.equal(metadata.size, raw.length);
assert.match(metadata.content_hash, /^sha256:[a-f0-9]{64}$/);
assert.equal(Object.hasOwn(metadata, 'data_url'), false, 'local metadata path never creates a second base64 payload');
console.log('PASS explicit Web session renewal, replay/cancel binding, reload persistence, local attachment metadata-only preparation');
