// Isolated browser regression. Supply a disposable local server; no real model is called.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = process.argv[2];
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base || '')) throw new Error('disposable_local_server_required');
const output = path.resolve(process.env.ARIADNE_QA_OUTPUT || '.cache/local-archive-20260912');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const evidence = { checks: [], errors: [], posts: [] };
const stores = ['source_documents','runtime_snapshots','processing_runs','processing_batches','extraction_artifacts','context_proposals','candidate_context_revisions','job_context_revisions'];
try {
 const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
 const page = await context.newPage();
 page.on('pageerror', error => evidence.errors.push(error.message));
 page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname !== '/api/workspace') evidence.posts.push(new URL(request.url()).pathname); });
 let failStorage = false;
 await context.route('**/api/workspace', route => {
  if (failStorage && route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'commit') return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'WORKSPACE_STORAGE_UNAVAILABLE'})});
  return route.continue();
 });
 // Model errors are intentional test doubles; no Provider traffic is permitted.
 await context.route('**/api/candidate-model-structure', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({error:'deepseek_network_error',network_call_made:false}) }));
 await context.route('**/api/job-model-structure', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({error:'deepseek_network_error',network_call_made:false}) }));
 async function records() { return page.evaluate(async names => {
  const db = await AriadneTruthPersistence.openDatabase(); const result = {};
  for (const name of names) result[name] = await new Promise((resolve,reject) => { const request = db.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result.map(record => ({...record,file_blob:undefined})));request.onerror=()=>reject(request.error); });
  db.close(); return result;
 }, stores); }
 async function mode(value) { await page.evaluate(value => localStorage.setItem('job-radar-selected-runtime', JSON.stringify(value)), value); await page.reload(); }
 async function noConclusions() { const data=await records(); for(const name of ['extraction_artifacts','context_proposals','candidate_context_revisions','job_context_revisions']) assert.equal(data[name].length,0,name);return data; }
 async function capture(name) {
  await page.screenshot({path:path.join(output,name+'-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false,name+' overflow');
  await page.screenshot({path:path.join(output,name+'-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1280,height:900});
 }
 const image = {name:'job-radar-multimodal-smoke.jpg',mimeType:'image/jpeg',buffer:await fs.readFile(path.resolve('public/job-radar-multimodal-smoke.jpg'))};
 await page.goto(base+'/personal-import.html');
 await page.setInputFiles('#personal-file-input', [image, {name:'经历原文.md',mimeType:'text/markdown',buffer:Buffer.from('# 合成原文\n  保留空格\n')}]);
 await page.waitForFunction(()=>document.querySelectorAll('#personal-source-preview-list li').length===2);
 assert.equal((await records()).source_documents.length,0,'selection alone creates no records');
 await page.click('#start-personal-processing');
 await page.waitForFunction(()=>document.querySelector('#personal-page-message').textContent.includes('已保存 2 份原件'));
 let data=await noConclusions();for(const name of ['runtime_snapshots','processing_runs','processing_batches'])assert.equal(data[name].length,0,name);
 assert.deepEqual(evidence.posts,[],'Local import makes no model or recognition requests');
 const candidateDocs = data.source_documents.filter(record=>record.contract_id==='ariadne-source-document-v1' && record.material_type==='CANDIDATE');
 assert.equal(candidateDocs.length,2);
 const candidateId=candidateDocs.find(record=>record.source_type==='IMAGE').source_document_id;
 await capture('candidate-archived');
 await page.reload();await page.selectOption('#saved-candidate-source-select',candidateId);
 await page.waitForFunction(()=>document.querySelector('#personal-page-message').textContent.includes('已恢复原件'));
 evidence.checks.push('Candidate multi-file archive, zero processing writes or requests, reload restore');
 await mode({mode:'model',provider:'deepseek',model:'deepseek-flash'});
 await page.selectOption('#saved-candidate-source-select',candidateId);
 await page.waitForFunction(()=>document.querySelector('#start-personal-processing').textContent==='使用模型分析');
 await page.click('#start-personal-processing');await page.locator('#candidate-model-consent-dialog').waitFor({state:'visible'});
 assert.deepEqual(evidence.posts,[],'opening consent never calls model');
 await page.click('#cancel-candidate-model-consent');await noConclusions();
 await page.click('#start-personal-processing');await page.click('#confirm-candidate-model-consent');
 await page.locator('#candidate-model-failure-dialog').waitFor({state:'visible'});await noConclusions();
 assert.equal((await records()).source_documents.filter(record=>record.contract_id==='ariadne-source-document-v1').length,2);
 evidence.checks.push('Candidate restored original reaches unchanged Model consent; cancel and model failure preserve originals, no conclusions');
 await page.goto(base+'/jd-import.html');await mode({mode:'local'});
 const text='  合成职位描述\n\n职责：研究与协作。\n  ';
 await page.click('[data-job-import-type="Paste"]');await page.fill('#job-paste-input',text);
 await page.waitForFunction(()=>!document.querySelector('#start-job-processing').disabled);
 await page.fill('#job-link-input','https://example.test/jobs/raw');
 await page.fill('#job-source-name','合成公司 · 职位原件');await page.click('#start-job-processing');await page.waitForFunction(()=>document.querySelector('#start-job-processing').textContent==='原件已保存');
 data=await noConclusions();
 let jobArchives=data.source_documents.filter(record=>record.contract_id==='ariadne-source-archive-v1'&&record.material_type==='JOB');
 assert.equal(jobArchives.length,1);
 const pastedId=jobArchives[0].source_document_ids[0];
 const restoredText=await page.evaluate(async id=>{const db=await AriadneTruthPersistence.openDatabase();try{return await (await AriadneRawSourceStorage.resolveRawSource(db,id)).file.text();}finally{db.close();}},pastedId);
 assert.equal(restoredText,text);
 await page.reload();await page.selectOption('#saved-job-source-select',jobArchives.find(record=>record.source_document_ids.includes(pastedId)).source_document_id);
 await page.waitForFunction(()=>document.querySelector('#job-link-input').value==='https://example.test/jobs/raw');
 assert.equal(await page.locator('#job-source-preview-list li').count(),1);
 evidence.checks.push('Job pasted original preserved verbatim with original URL and restored after reload');
 await page.reload();
 await page.setInputFiles('#job-file-input',[{name:'职位附件.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nsynthetic original, archive only')},image]);
 await page.waitForFunction(()=>document.querySelectorAll('#job-source-preview-list li').length===2);
 await page.fill('#job-source-name','合成公司 · 职位原件');await page.click('#start-job-processing');await page.waitForFunction(()=>document.querySelector('#start-job-processing').textContent==='原件已保存');
 data=await noConclusions();jobArchives=data.source_documents.filter(record=>record.contract_id==='ariadne-source-archive-v1'&&record.material_type==='JOB');
 const bundle=jobArchives.find(record=>record.source_document_ids.length===2);assert(bundle);
 await page.reload();await page.selectOption('#saved-job-source-select',bundle.source_document_id);
 await page.waitForFunction(()=>document.querySelectorAll('#job-source-preview-list li').length===2);
 assert.deepEqual(await page.locator('#job-source-preview-list li span').allTextContents(),['1职位附件.pdf','2job-radar-multimodal-smoke.jpg']);
 await capture('job-archived');
 // Re-importing and saving identical originals does not duplicate the archive.
 const count=data.source_documents.length;
 await page.reload();await page.setInputFiles('#job-file-input',[{name:'职位附件.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nsynthetic original, archive only')},image]);
 await page.waitForFunction(()=>document.querySelectorAll('#job-source-preview-list li').length===2);
 await page.fill('#job-source-name','合成公司 · 职位原件');await page.click('#start-job-processing');await page.waitForFunction(()=>document.querySelector('#start-job-processing').textContent==='原件已保存');
 assert.equal((await records()).source_documents.length,count);
 evidence.checks.push('Job ordered bundle, duplicate save, desktop and narrow viewport');
 // Storage failure is visible; no success state or semantic data is manufactured.
 await page.reload();await page.click('[data-job-import-type="Paste"]');await page.fill('#job-paste-input','仅供失败测试的原文');
 await page.waitForFunction(()=>!document.querySelector('#start-job-processing').disabled);
 failStorage = true;
 await page.fill('#job-source-name','合成公司 · 职位原件');await page.click('#start-job-processing');await page.waitForFunction(()=>document.querySelector('#job-page-message').textContent.includes('原件保存未完成'));
 assert.equal(await page.locator('#start-job-processing').isEnabled(),true);
 assert.equal((await records()).source_documents.length,count);
 failStorage = false;
 await page.fill('#job-source-name','合成公司 · 职位原件');await page.click('#start-job-processing');await page.waitForFunction(()=>document.querySelector('#start-job-processing').textContent==='原件已保存');
 evidence.checks.push('Storage failure gives retry and never shows saved; retry succeeds');
 // An unavailable Model never blocks raw storage and is never silently invoked.
 await mode({mode:'model',provider:'deepseek',model:'unavailable-qa-model'});
 await page.click('[data-job-import-type="Paste"]');await page.fill('#job-paste-input','模型不可用时也能保存的合成原文');
 await page.waitForFunction(()=>!document.querySelector('#start-job-processing').disabled);
 assert.equal(await page.locator('#start-job-processing').textContent(),'保存原件');
 await page.fill('#job-source-name','合成公司 · 职位原件');await page.click('#start-job-processing');await page.waitForFunction(()=>document.querySelector('#start-job-processing').textContent==='原件已保存');
 await noConclusions();
 evidence.checks.push('Unavailable model allows explicit raw archive without analysis fallback');
 await mode({mode:'model',provider:'deepseek',model:'deepseek-flash'});
 await page.selectOption('#saved-job-source-select',jobArchives.find(record=>record.source_document_ids.includes(pastedId)).source_document_id);
 await page.waitForFunction(()=>document.querySelector('#job-link-input').value==='https://example.test/jobs/raw');
 await page.click('#start-job-processing');await page.locator('#job-model-consent-dialog').waitFor({state:'visible'});
 await page.click('#cancel-job-model-consent');await noConclusions();
 evidence.checks.push('Saved Job original can enter Model consent later without re-upload');
 // Embedded import needs visible status, too.
 await page.goto(base+'/jd-import.html?embedded=1');
 assert.notEqual(await page.locator('#job-page-message').evaluate(node=>getComputedStyle(node).display),'none');
 assert.deepEqual(evidence.posts,['/api/candidate-model-structure']);
 assert.deepEqual(evidence.errors,[]);
} finally {
 await browser.close();await fs.writeFile(path.join(output,'browser-results.json'),JSON.stringify(evidence,null,2));
}
console.log(JSON.stringify(evidence));
