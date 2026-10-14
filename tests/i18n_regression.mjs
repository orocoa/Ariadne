import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/i18n.js", import.meta.url), "utf8");
const listeners = new Map();
const storage = new Map();
const context = {
  document: {
    readyState: "loading",
    addEventListener(name, callback) { listeners.set(name, callback); },
  },
  localStorage: {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); },
  },
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: "i18n.js" });

const i18n = context.AriadneI18n;
assert.ok(i18n, "i18n API should be available before DOMContentLoaded");
assert.equal(i18n.translate("工作空间"), "Workspace");
assert.equal(i18n.translate("3 张资料卡片"), "3 material cards");
assert.equal(i18n.translate("1 个职位对象"), "1 job item");
assert.equal(i18n.translate("自定义中文经历"), "自定义中文经历", "unknown personal content must not be rewritten");
assert.match(i18n.translate("相关资料或已保存的更正已经变化，本次结果未保存。请基于当前资料重试。"), /saved corrections have changed/);
assert.match(i18n.translate("已保存的更正或补充及其必要依据超过本轮处理预算。本轮未发送模型，也未截断这些内容；请缩小相关资料范围后重试。"), /Nothing was sent to the model or truncated/);
assert.equal(i18n.storageKey, "ariadne.ui.locale.v1");
assert.match(source, /button\.textContent = "EN\/中"/);
assert.ok(listeners.has("DOMContentLoaded"));

const pages = [
  "index", "workspace", "personal-information", "personal-import", "candidate-detail",
  "jd", "jd-import", "job-detail", "personal-understanding", "job-overview", "about",
  "install", "codex-connect", "gemini-connect", "gemini-api-key-guide", "download",
];
for (const page of pages) {
  const html = fs.readFileSync(new URL(`../public/${page}.html`, import.meta.url), "utf8");
  const version = ["workspace", "personal-information", "personal-import", "candidate-detail", "jd-import", "job-detail", "personal-understanding", "job-overview"].includes(page) ? "understanding-consistency-20261014" : "1";
  assert(html.includes(`<script src="/i18n.js?v=${version}"></script>`), `${page} must load the current shared language layer once`);
  assert.equal((html.match(/<script src="\/i18n\.js\?/g) || []).length, 1);
  if (page === "index") assert.match(html, /<body[^>]*data-ariadne-language-entry/, "entry page owns the language switch");
  else assert.doesNotMatch(html, /data-ariadne-language-entry/, `${page} must not show the language switch`);
}

const css = fs.readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
assert.match(css, /\.ariadne-language-switch\s*\{/);
assert.match(css, /\.ariadne-language-switch\s*\{[^}]*left: 50%;[^}]*translateX\(-50%\)/s);
assert.match(css, /\[data-ariadne-product="skill"\] \.ariadne-language-switch \{ display: none; \}/);
assert.match(source, /hasAttribute\("data-ariadne-language-entry"\)/);
assert.doesNotMatch(source, /fetch\s*\(/, "language switching must remain local and must not send content anywhere");

console.log("i18n regression PASS");
