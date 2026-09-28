import { resolveVICSS } from "./helpers/vi-css.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const ProcessingIndicator = require("../public/processing-indicator-domain.js");
const ProductShell = require("../public/product-shell-domain.js");
const ConversationUI = require("../public/conversation-ui-domain.js");
const styles = resolveVICSS(read("public/styles.css"));
const pages = read("public/v1-pages.js");
const candidateImport = read("public/personal-import.html");
const jobImport = read("public/jd-import.html");
const candidateDetail = read("public/candidate-detail.html");
const jobDetail = read("public/job-detail.html");
const productSurfaces = [candidateImport, jobImport, candidateDetail, jobDetail];

assert.match(pages, /"职位已保存" : "使用人工智能解析"/);
assert.match(pages, /"原件已保存" : "保存原件"/);
assert.doesNotMatch(jobImport, /链接只作为来源信息保存在本地；本页不会自动访问或上传该网址。/);
assert.doesNotMatch(pages.slice(pages.indexOf("function showJobSource"), pages.indexOf("function resetJobSource")), /原始来源保存在本机；确认后发送有界文本证据/);
assert.match(pages, /source_url: sourceUrl/);

for (const html of [candidateImport, jobImport]) {
  assert.match(html, /id="confirm-(?:candidate|job)-model-consent" class="v1-consent-action"[^>]*>确认并发送<\/button>/);
}
assert.match(styles, /\.v1-consent-action \{[^}]*background: transparent;[^}]*color: var\(--ink\)/);
assert.match(styles, /\.v1-consent-action:hover, \.v1-consent-action:focus-visible \{[^}]*scale: 1\.015/);
assert.match(styles, /\.v1-body \.v1-consent-action:focus-visible \{[^}]*rgba\(82,111,218,\.24\)/);

assert.equal(typeof ProcessingIndicator.setButton, "function");
assert.equal(ConversationUI.ProcessingIndicator, ProcessingIndicator);
assert.equal(ConversationUI.humanSafeText("项目（card-3）对应 job-requirement-1。"), "项目对应。");
assert.equal(ProductShell.CONTRACT.conversation.field, "v1-composer-field");
assert.match(read("public/processing-indicator-domain.js"), /class="v1-processing-loop"/);
assert.doesNotMatch(read("public/processing-indicator-domain.js"), /processing-mesh/);
// The 2026-09-24 UX request restores three waving dots for conversations only.
assert.match(read("public/processing-indicator-domain.js"), /orb.innerHTML = "<i><\/i><i><\/i><i><\/i>"/);
assert.match(read("public/conversation-dots.css"), /prefers-reduced-motion: reduce/);
assert.match(styles, /\.v1-processing-loop \{[^}]*border-top-color: #8ea6ff;/);
assert.doesNotMatch(styles.match(/\.v1-processing-loop \{[^}]*\}/)?.[0] || "", /box-shadow|radial-gradient|conic-gradient/);
assert.doesNotMatch(styles, /v1-processing-(?:mesh|breathe|orbit)/);
assert.match(read("public/conversation-ui-domain.js"), /ProcessingIndicator\.setButton\(submit, \{ active: Boolean\(active\) \}\)/);
assert.match(styles, /\.v1-conversation-form button\.is-loading::before \{[^}]*v1-processing-loop/);
assert.match(styles, /\.v1-conversation-form button\.is-loading:disabled \{[^}]*opacity: 1/);

for (const html of productSurfaces) {
  assert.match(html, /class="v1-composer-field"><textarea/);
  assert.match(html, /processing-indicator-domain\.js\?v=ui-contract-addendum-v5/);
  assert.match(html, /conversation-ui-domain\.js\?v=shared-conversation-ui-v5/);
  assert.match(html, /styles\.css\?v=candidate-job-parity-v1/);
}
for (const html of [candidateImport, jobImport]) assert.match(html, /product-shell-domain\.js\?v=shared-product-shell-v4/);
for (const html of [candidateDetail, jobDetail]) assert.match(html, /product-shell-domain\.js\?v=detail-behavior-v1/);
assert.match(candidateDetail, /v1-pages\.js\?v=computer-use-e2e-v3/);
assert.match(jobDetail, /v1-pages\.js\?v=job-stage-conversation-v1/);
assert.equal((styles.match(/^\.v1-composer-field \{/gm) || []).length, 1);
assert.match(styles, /\.has-integrated-composer \.v1-composer-field > textarea \{[^}]*min-height: 64px/);
assert.match(styles, /\.has-integrated-composer \.v1-composer-field > button\[type="submit"\] \{[^}]*grid-column: 3;[^}]*grid-row: 3/);
assert.match(styles, /\.v1-composer-field \{[^}]*border-radius: 16px;[^}]*min-height: 46px/);
assert.match(styles, /\.v1-conversation-form textarea \{[^}]*height: 44px;[^}]*min-height: 44px/);
assert.match(styles, /\.v1-conversation-form button\[type="submit"\] \{[^}]*align-self: center;[^}]*height: 42px/);

assert.doesNotMatch(styles, /\.v1-back:hover \{[^}]*translateX/);
assert.match(styles, /\.v1-back:hover \{[^}]*scale: 1\.04;[^}]*transform: none/);
assert.match(styles, /\.v1-back:active \{[^}]*scale: \.985/);
assert.match(styles, /\.v1-detail-overlay-close:hover, \.v1-sheet-close:hover \{[^}]*scale: 1\.04/);
assert.match(styles, /\.v1-mini-sidebar \{[^}]*right: 18px;[^}]*top: 50%;[^}]*translateY\(-50%\)/);
const minibarRule = styles.match(/\.v1-mini-sidebar \{[^}]+\}/)?.[0] || "";
assert.doesNotMatch(minibarRule, /left: 50%|top: 0|translateX/);
assert.match(styles, /prefers-reduced-motion[\s\S]*\.v1-processing-loop[\s\S]*animation: none/);

console.log(JSON.stringify({
  job_import_copy_and_meta: "pass",
  shared_light_consent_action: "pass",
  restrained_shared_processing: "pass",
  shared_composer_geometry: "pass",
  visible_submit_waiting_state: "pass",
  shared_navigation_motion: "pass",
  centered_minibar: "pass",
  reduced_motion: "pass",
}));
