import assert from 'node:assert/strict';
import fs from 'node:fs';
const workerCode = fs.readFileSync(new URL('../deploy/cloudflare/pages-worker.js', import.meta.url), 'utf8');
const {default: worker} = await import(`data:text/javascript;base64,${Buffer.from(workerCode).toString('base64')}`);
let api = 0, assets = 0;
const env = {ARIADNE_API: {fetch: async request => {api++; return new Response(request.url);}}, ASSETS: {fetch: async () => {assets++; return new Response('asset');}}};
for (const path of ['/api/web-runtime', '/api/candidate-model-structure', '/healthz']) {
  await worker.fetch(new Request('https://ariadne.kai-nex.com' + path), env);
}
await worker.fetch(new Request('https://ariadne.kai-nex.com/workspace'), env);
assert.equal(api, 3); assert.equal(assets, 1);
const missing = await worker.fetch(new Request('https://ariadne.kai-nex.com/api/web-runtime'), {});
assert.equal(missing.status, 503);
assert.deepEqual(await missing.json(), {error:'WEB_API_BINDING_REQUIRED', network_call_made:false});
const code = fs.readFileSync(new URL('../public/browser-pdf-delivery.js', import.meta.url), 'utf8');
const pdf = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
assert.equal(pdf.collectPDFs({file:'data:application/pdf;base64,QQ==', nested:[{file:'data:application/pdf;base64,QQ=='}]}).size,1);
const options={method:'POST',body:JSON.stringify({message:'Hello'})};
assert.deepEqual(JSON.parse((await pdf.prepareRequest('/api/candidate-conversation-turn',options,{request_limit:100})).body),{message:'Hello'});
await assert.rejects(pdf.prepareRequest('/api/x',{body:JSON.stringify({_cloudflare_pdf_pages:[]})},{request_limit:100}),/WEB_PDF_MANIFEST_INVALID/);
await assert.rejects(pdf.prepareRequest('/api/x',options,{request_limit:1}),/WEB_PREVIEW_REQUEST_SIZE_LIMIT/);
const metadataOptions = {body:JSON.stringify({document_data_url:'data:application/pdf;base64,QQ=='})};
assert.equal(await pdf.prepareRequest('/api/local-source-read', metadataOptions, {request_limit:100}), metadataOptions);
console.log('Pages routing, missing binding, PDF detection and request limits PASS');
