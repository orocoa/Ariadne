import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
function assertCurrentConversationScripts(html) {
  const scripts = [...html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<script\s+src="([^"]+)"\s*>\s*<\/script>/g)]
    .map(match => new URL(match[1].replaceAll("&amp;", "&"), "https://ariadne.test"));
  const loaded = pathname => {
    const matches = scripts.map((url, index) => ({ url, index })).filter(item => item.url.pathname === pathname);
    assert.equal(matches.length, 1, `${pathname} must be loaded once as an executable script`);
    assert.equal(matches[0].url.origin, "https://ariadne.test", `${pathname} must use the local module`);
    return matches[0];
  };
  const pages = loaded("/v1-pages.js"), ui = loaded("/conversation-ui-domain.js"), shell = loaded("/product-shell-domain.js");
  for (const { url } of [pages, ui]) {
    assert.deepEqual(url.searchParams.getAll("v"), [url.pathname === "/v1-pages.js" ? "understanding-consistency-20261014" : "chat-history-20261014"]);
    assert.deepEqual(url.searchParams.getAll("resume-stage"), ["1"]);
  }
  assert(ui.index < pages.index, "shared conversation UI must load before the page binding");
  assert(shell.index < pages.index, "shared product shell must load before the page binding");
}
const ProductShell = require("../public/product-shell-domain.js");
const shell = read("public/product-shell-domain.js");
const pages = read("public/v1-pages.js");
const jobConversation = read("public/job-conversation-domain.js");
const candidateDetail = read("public/candidate-detail.html");
const jobDetail = read("public/job-detail.html");

assert.equal(typeof ProductShell.bindConversationAdapter, "function");
assert.match(shell, /conversationAdapters = new WeakMap/);
assert.match(shell, /form\.addEventListener\("submit"/);
assert.match(shell, /form\.dataset\.ariadneSubmitEvent = "fired"/);
assert.match(shell, /activeAdapter\.submit/);
assert.match(shell, /panel\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
assert.match(shell, /focus\(\{ preventScroll: false \}\)/);
assert.match(shell, /binding\.trigger\.addEventListener\("click", toggle\)/);
assert.match(shell, /binding\.cancel\.addEventListener\("click", close\)/);
assert.match(shell, /binding\.back\.addEventListener\("click", backToEdit\)/);

assert.equal((pages.match(/ProductShell\.bindConversationAdapter\(/g) || []).length, 2);
assert.match(pages, /domain: "candidate",\s+operation: "candidate_conversation"/);
assert.match(pages, /resolveTarget: \(\) => candidateDetailSourceId && canonicalRevision/);
assert.match(pages, /submit: \(\{ content, target \}\) => submitCandidateDetailConversation/);
assert.match(pages, /domain: "job",\s+operation: "job_conversation"/);
assert.match(pages, /resolveTarget: \(\) => activeJobRevision/);
assert.match(pages, /submit: \(\{ content \}\) => submitJobConversation/);
assert.doesNotMatch(pages, /byId\("candidate-conversation-form"\)\.addEventListener\("submit"/);
assert.doesNotMatch(pages, /byId\("job-conversation-form"\)\.addEventListener\("submit"/);
assert.doesNotMatch(pages, /byId\("open-(?:direct|job)-edit"\)\.addEventListener\("click", editShell\.toggle\)/);
assert.doesNotMatch(pages, /byId\("cancel-(?:direct|job)-edit"\)\.addEventListener/);
assert.doesNotMatch(pages, /byId\("back-to-(?:direct|job)-edit"\)\.addEventListener/);
assert.doesNotMatch(jobConversation, /job_edit_requested/, "model interprets intent; code validates typed changes");
assert.match(jobConversation, /Changes\.validate\(value\.changes, compiledContext\)/);

for (const html of [candidateDetail, jobDetail]) {
  assert.match(html, /product-shell-domain\.js\?v=detail-behavior-v1/);
  assertCurrentConversationScripts(html);
}
for (const dependency of ["model-import-lifecycle-domain", "candidate-context-domain", "candidate-model-runtime-domain"]) {
  assert.match(candidateDetail, new RegExp(`${dependency}\\.js\\?v=computer-use-e2e-v1`));
}
assert.match(pages, /canonicalRevision\.contract_id === "ariadne-context-revision-v2"/);
assert.match(pages, /CandidateModel\.editedCandidateWorkingModel/);
assert.match(pages, /persistCandidateWorkspaceAcceptance\(database, editedWorkingModel\)/);
assert.match(pages, /CandidateModel\.synchronizedCandidateWorkingModel/);
assert.match(pages, /LocalCandidateReview\.persistUserEdit\(database, canonicalRevision, itemId, confirmedItem, \{ working_model: confirmedWorkingModel \}\)/);
assert.match(pages, /renderCandidate\(activeCandidate\);\s+byId\("candidate-patch-proposal"\)\.classList\.add\("hidden"\);\s+editShell\.complete\(\)/);

console.log(JSON.stringify({
  shared_composer_binding: "runtime-independent_and_domain_explicit",
  candidate_item_adapter: "bound",
  job_detail_adapter: "bound",
  shared_edit_controls: "trigger_cancel_back_owned_by_product_shell",
  edit_entry_focus: "first_field_visible",
}));
