// Self-contained functions for Playwright page.evaluate or egolite execution.
// Only use the synthetic fixture served by scripts/browser_qa_server.py.
export async function checkPersonalDraftRefresh() {
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const wait = async predicate => {
    for (let i = 0; i < 500; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
    throw Error('synthetic_personal_state_timeout');
  };
  assert(location.hostname === '127.0.0.1' && new URL(location.href).searchParams.get('qa') === 'synthetic', 'synthetic fixture required');
  await wait(() => window.__optimizationQA && document.querySelector('#proposal-qa-proposal'));
  const fixture = window.__optimizationQA, input = document.querySelector('#proposal-qa-proposal');
  const messages = document.querySelector('#personal-conversation-messages');
  const historyNode = messages.firstElementChild, previousCount = messages.children.length;
  const draft = 'Synthetic unsaved edit — focus and history must preserve this.';
  input.value = draft; input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus(); input.setSelectionRange(10, 17);
  const previousLoads = fixture.loads;
  dispatchEvent(new Event('focus'));
  await wait(() => fixture.loads > previousLoads);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  assert(document.querySelector('#proposal-qa-proposal') === input && input.value === draft, 'focus refresh discarded the draft');
  assert(document.activeElement === input && input.selectionStart === 10 && input.selectionEnd === 17, 'focus refresh moved the caret');
  document.querySelector('#personal-older-messages').click();
  assert(messages.children.length > previousCount && [...messages.children].includes(historyNode), 'older history replaced an existing message');
  assert(document.querySelector('#proposal-qa-proposal') === input && input.value === draft, 'older history discarded the draft');
  const save = document.querySelector('[data-memory-save="qa-proposal"]'), previousFailures = fixture.failures;
  save.click();
  await wait(() => fixture.failures > previousFailures && !save.disabled);
  assert(input.isConnected && input.value === draft, 'failed save discarded the editable draft');
  assert(document.querySelector('#personal-message-status').classList.contains('error'), 'failed save was not reported');
  return { checks: ['focus preserves value, node and caret', 'history prepends retain existing DOM', 'failed save preserves draft and restores controls'] };
}

export async function checkPersonalDraftConflict() {
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const fixture = window.__optimizationQA, input = document.querySelector('#proposal-qa-proposal');
  assert(fixture && input, 'synthetic editable proposal required');
  const text = input.value;
  // This is the same persisted-decision observation a second tab supplies.
  fixture.stores.personal_memory_decisions.push({ proposal_id: 'qa-proposal', decision: 'REJECT' });
  dispatchEvent(new Event('focus'));
  for (let i = 0; i < 500 && !document.querySelector('[data-proposal-conflict]'); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert(document.querySelector('[data-proposal-conflict]'), 'external decision did not expose draft recovery');
  assert(input.isConnected && input.value === text, 'external decision discarded unsaved text');
  assert(document.querySelector('[data-memory-save="qa-proposal"]').disabled, 'conflicted draft can still save');
  assert(!document.querySelector('[data-proposal-reset]').disabled, 'explicit discard is inaccessible');
  return { checks: ['external decision preserves recovery text', 'conflicted save disabled', 'explicit discard available'] };
}

export async function checkPersonalPdfDownload() {
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const fixture = window.__optimizationQA;
  assert(fixture && window.AriadneConversationOutput, 'synthetic PDF fixture required');
  const last = fixture.stores.personal_conversation_turns.at(-1);
  const selector = '#personal-conversation-messages a[download$=".pdf"]';
  for (let i = 0; i < 500 && !document.querySelector(selector); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert(document.querySelector(selector), 'initial synthetic PDF did not finish');
  const previousUrl = document.querySelector(selector)?.href;
  last.output.deliverable = { kind: 'PDF', title: 'Synthetic three page export',
    body: Array.from({ length: 90 }, (_, i) => `Synthetic PDF line ${String(i + 1).padStart(3, '0')}`).join('\n'), nodes: [], edges: [] };
  const nativeToBlob = HTMLCanvasElement.prototype.toBlob, encodings = [];
  HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) { encodings.push(type); return nativeToBlob.call(this, callback, type, quality); };
  try {
    dispatchEvent(new Event('focus'));
    let link;
    for (let i = 0; i < 1000; i++) {
      link = document.querySelector(selector);
      if (link && link.href !== previousUrl && link.download === 'Synthetic three page export.pdf') break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert(link?.download === 'Synthetic three page export.pdf' && link.href !== previousUrl, 'complete PDF was not generated');
    const bytes = new Uint8Array(await (await fetch(link.href)).arrayBuffer());
    // Latin-1 keeps binary byte offsets, unlike UTF-8 decoding of JPEG streams.
    let pdf = ''; for (let i = 0; i < bytes.length; i += 8192) pdf += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const count = Number(/\/Type \/Pages \/Count (\d+)/.exec(pdf)?.[1]);
    assert(pdf.startsWith('%PDF-1.4\n') && pdf.endsWith('%%EOF\n'), 'download is a truncated or non-PDF blob');
    assert(count === 3 && (pdf.match(/\/Type \/Page \/Parent/g) || []).length === 3, 'complete three-page output missing');
    assert((pdf.match(/\/Filter \/DCTDecode/g) || []).length === 3, 'a page image stream is missing');
    const xref = Number(/startxref\n(\d+)\n%%EOF/.exec(pdf)?.[1]);
    assert(Number.isInteger(xref) && pdf.slice(xref, xref + 5) === 'xref\n', 'PDF xref byte offset is invalid');
    assert(encodings.length === 3 && encodings.every(type => type === 'image/jpeg'), 'PDF encoded unused PNGs or repeated pages');
    const loads = fixture.loads, bubble = link.closest('.v1-conversation-message');
    dispatchEvent(new Event('focus'));
    for (let i = 0; i < 500 && fixture.loads <= loads; i++) await new Promise(resolve => setTimeout(resolve, 20));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    assert(document.querySelector(selector) === link && link.closest('.v1-conversation-message') === bubble, 'unchanged export lost its DOM');
    assert(encodings.length === 3, 'history refresh regenerated a saved PDF');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return { checks: ['three complete PDF pages', 'valid byte offsets', 'JPEG only', 'unchanged export and URL reused'],
      bytes: bytes.length, pages: count, sha256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''), download: link.download };
  } finally { HTMLCanvasElement.prototype.toBlob = nativeToBlob; }
}

export function checkRepeatedSessionRecovery() {
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  assert(location.hostname === '127.0.0.1' && window.AriadneTransport && window.AriadneProduct?.kind !== 'skill', 'synthetic Web origin required');
  const key = 'ariadne-web-api-session-v1', bindingsKey = 'ariadne-web-operation-sessions-v1';
  let previous = AriadneTransport.beginNewSession();
  const bindings = sessionStorage.getItem(bindingsKey);
  for (let round = 0; round < 2; round++) {
    AriadneTransport.noteError('WEB_SESSION_OPERATION_LIMIT');
    const button = document.querySelector('#web-session-recovery button');
    assert(button, `session recovery button missing on round ${round + 1}`);
    AriadneTransport.noteError('WEB_SESSION_OPERATION_LIMIT');
    assert(document.querySelectorAll('#web-session-recovery').length === 1, 'duplicate recovery UI');
    button.click();
    const next = sessionStorage.getItem(key);
    assert(/^[a-f0-9]{64}$/.test(next) && next !== previous, 'explicit renewal did not change the session');
    assert(sessionStorage.getItem(bindingsKey) === bindings, 'renewal discarded old request bindings');
    previous = next;
  }
  return { checks: ['two successive operation limits can recover', 'no duplicate recovery UI', 'old operation bindings retained'] };
}
