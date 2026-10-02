// Native Chromium acceptance; all pages and data live in an owned QA origin.
// ARIADNE_PLAYWRIGHT_PACKAGE can point to an installed Playwright package.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkStorageQueryMigration } from './helpers/storage-query-migration.mjs';
import { checkCardReturn } from './helpers/card-return-browser-checks.mjs';
import { checkPersonalDraftRefresh, checkPersonalDraftConflict, checkPersonalPdfDownload, checkRepeatedSessionRecovery } from './helpers/optimization-browser-checks.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ARIADNE_PLAYWRIGHT_PACKAGE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'work', 'optimization-browser', `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
await mkdir(output, { recursive: true });
const evidence = { checks: {}, errors: [], consoleErrors: [], stubbedFontStylesheets: [], externalRequests: [], providerRequests: [], serverErrors: '', providerCalls: 0 };
const server = spawn(process.env.ARIADNE_QA_PYTHON || 'python3', ['scripts/browser_qa_server.py'], {
  cwd: root, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', chunk => { evidence.serverErrors += chunk.toString(); });
let browser, page, failure, overallTimer;
async function stopServer() {
  if (!server.pid || server.exitCode !== null || server.signalCode !== null) return;
  const done = once(server, 'exit'); server.kill('SIGTERM');
  const force = setTimeout(() => server.kill('SIGKILL'), 3000);
  try { await done; } finally { clearTimeout(force); }
}
try {
  const base = await new Promise((resolve, reject) => {
    const lines = createInterface({ input: server.stdout });
    const timer = setTimeout(() => reject(Error('synthetic QA server startup timed out')), 15000);
    const finish = (error, value) => { clearTimeout(timer); lines.close(); server.off('exit', ended); error ? reject(error) : resolve(value); };
    const ended = code => finish(Error(`synthetic QA server exited during startup: ${code}`));
    server.once('error', error => finish(error)); server.once('exit', ended);
    lines.on('line', line => { if (/^\d+$/.test(line)) finish(null, `http://127.0.0.1:${Number(line)}`); });
  });
  browser = await chromium.launch({ headless: true, ...(process.env.ARIADNE_QA_BROWSER_CHANNEL ? {channel: process.env.ARIADNE_QA_BROWSER_CHANNEL} : {}) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
  // Even a regressed UI cannot reach an external service or invoke a model.
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    // The application already has system-font fallbacks. Keep the optional
    // Google Fonts stylesheet offline while exercising the real PDF canvas.
    if (url.origin === 'https://fonts.googleapis.com' && request.resourceType() === 'stylesheet') {
      evidence.stubbedFontStylesheets.push(url.pathname);
      return route.fulfill({ status: 200, contentType: 'text/css', body: '/* Offline synthetic QA: use the existing system-font fallback. */' });
    }
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) {
      evidence.externalRequests.push(request.url()); return route.abort('blockedbyclient');
    }
    if (request.method() === 'POST' && url.pathname !== '/api/workspace') {
      evidence.providerRequests.push(url.pathname); return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
  page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(30000);
  const run = async () => {
    await page.goto(`${base}/personal-understanding.html?qa=synthetic`);
    await page.waitForFunction(() => window.__optimizationQA && document.querySelector('#proposal-qa-proposal'));
    evidence.checks.drafts = await page.evaluate(checkPersonalDraftRefresh);
    await page.screenshot({ path: path.join(output, 'draft-preserved.png'), fullPage: true });
    evidence.checks.pdf = await page.evaluate(checkPersonalPdfDownload);
    const downloaded = page.waitForEvent('download');
    await page.locator('#personal-conversation-messages a[download$=".pdf"]').click();
    const download = await downloaded;
    assert.equal(download.suggestedFilename(), evidence.checks.pdf.download);
    const pdfPath = path.join(output, 'synthetic-complete.pdf'); await download.saveAs(pdfPath);
    const pdfBytes = await readFile(pdfPath);
    assert.equal(pdfBytes.length, evidence.checks.pdf.bytes, 'native download truncated the Blob');
    assert.equal(createHash('sha256').update(pdfBytes).digest('hex'), evidence.checks.pdf.sha256, 'download differs from generated PDF');
    evidence.checks.pdf.nativeDownloadMatchesBlob = true;
    evidence.checks.conflict = await page.evaluate(checkPersonalDraftConflict);
    await page.locator('[data-proposal-conflict]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'draft-conflict.png'), fullPage: true });
    await page.setViewportSize({width: 390, height: 844});
    await page.locator('[data-proposal-conflict]').scrollIntoViewIfNeeded();
    await page.screenshot({path: path.join(output, 'draft-conflict-mobile.png'), fullPage: true});
    assert(await page.locator('[data-proposal-reset]').isVisible(), 'mobile conflict recovery is inaccessible');
    await page.setViewportSize({width: 1280, height: 1000});
    await page.locator('[data-proposal-reset]').click();
    await page.waitForFunction(() => !document.querySelector('#proposal-qa-proposal'));
    evidence.checks.conflict.explicitDiscard = true;
    evidence.checks.session = await page.evaluate(checkRepeatedSessionRecovery);
    await page.screenshot({ path: path.join(output, 'session-recovered.png'), fullPage: true });
    evidence.checks.storage = await page.evaluate(checkStorageQueryMigration);
    evidence.checks.cardReturn = await checkCardReturn(page, base, output);
    assert.deepEqual(evidence.errors, [], 'browser runtime errors');
    assert.deepEqual(evidence.consoleErrors, [], 'browser console errors');
    assert.deepEqual(evidence.externalRequests, [], 'unexpected external requests');
    assert.deepEqual(evidence.providerRequests, [], 'unexpected provider requests');
  };
  await Promise.race([run(), new Promise((_, reject) => { overallTimer = setTimeout(() => reject(Error('browser acceptance timed out')), 90000); })]);
} catch (error) {
  failure = error; evidence.failure = error.stack || String(error);
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  clearTimeout(overallTimer);
  if (browser) await browser.close().catch(error => { evidence.errors.push(`browser cleanup: ${error.message}`); });
  await stopServer();
  await writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2) + '\n');
}
console.log(JSON.stringify({ result: failure ? 'FAIL' : 'PASS', output, ...evidence }, null, 2));
if (failure) throw failure;
