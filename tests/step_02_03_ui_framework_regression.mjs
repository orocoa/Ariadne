import { resolveVICSS } from "./helpers/vi-css.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, "public", file), "utf8");
const require = createRequire(import.meta.url);
const Demo = require("../public/v1-demo-domain.js");
const Conversation = require("../public/scoped-conversation-domain.js");
const workspace = read("workspace.html");
const personal = read("personal-information.html");
const personalImport = read("personal-import.html");
const candidateDetail = read("candidate-detail.html");
const jd = read("jd.html");
const jobImport = read("jd-import.html");
const jobDetail = read("job-detail.html");
const pages = read("v1-pages.js");
const styles = resolveVICSS(read("styles.css"));

for (const html of [workspace, personal, personalImport, candidateDetail, jd, jobImport, jobDetail]) {
  assert.match(html, /v1-motion-33/);
  assert.match(html, /floating-window\.js\?v=v1-motion-33/);
  assert.match(html, /v1-demo-domain\.js\?v=v1-motion-33/);
  assert.ok(html.indexOf("runtime-capabilities.js") < html.indexOf("runtime-capability-gate.js"));
  assert.ok(html.indexOf("runtime-capability-gate.js") < html.indexOf("v1-pages.js"));
}

// Workspace and navigation grammar.
assert.match(workspace, /v1-object-folder[\s\S]*个人资料/);
assert.match(workspace, /v1-object-folder dark[\s\S]*职位描述/);
assert.equal((workspace.match(/v1-folder-paper/g) || []).length, 6);
assert.match(workspace, /v1-folder-back/);
assert.match(workspace, /v1-folder-front/);
assert.doesNotMatch(workspace, /v1-object-arrow|v1-folder-tab/);
assert.match(workspace, /href="\/index.html">连接设置/);
assert.doesNotMatch(workspace, /v1-object-index|STEP\s*0[123]/i);

// Personal list stays clean; the guide card links to a dedicated import page.
assert.doesNotMatch(personal, /v1-bottom-sheet|personal-empty|open-personal-import/);
assert.match(personalImport, /<div><h1>添加个人材料<\/h1><\/div>/);
assert.doesNotMatch(personalImport, /导入一份材料|选择材料类型并提供本地文件。内容先形成待审核对象，不会直接写入正式职业模型。/);
for (const label of ["简历", "作品集", "项目", "其他"]) assert.match(personalImport, new RegExp(`>${label}<`));
assert.match(personalImport, /\.pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg/);
assert.match(personalImport, /点击上传文件或直接拖拽文件至此/);
assert.doesNotMatch(personalImport, /选择文件|支持 PDF/);
assert.doesNotMatch(personalImport, /use-candidate-fixture|消毒/);
assert.equal(Demo.candidatePromptProfile("Resume"), "candidate-resume-grounded-v2");
assert.equal(new Set(Object.values(Demo.CANDIDATE_PROMPT_PROFILES)).size, 4);
assert.doesNotMatch(pages, /prompt_profile: Demo\.candidatePromptProfile\(materialType\)/);
assert.match(pages, /LocalCandidate\.prepareSource\(file, batchId, selectedCandidateType\)/);

// Candidate fixture cards and review interaction.
assert.equal(Demo.CANDIDATE_FIXTURES.length, 3);
assert.deepEqual(Demo.CANDIDATE_FIXTURES.map((item) => item.item_type), ["WORK_EXPERIENCE", "PROJECT", "EDUCATION"]);
assert.ok(Demo.CANDIDATE_FIXTURES.every((item) => item.data_class === "DEMO_FIXTURE" && item.review_status === "NEEDS_REVIEW"));
assert.match(candidateDetail, /id="candidate-ai-pane"/);
assert.match(candidateDetail, /candidate-conversation-form/);
assert.match(candidateDetail, /<button type="submit" aria-label="发送"><\/button>/);
assert.doesNotMatch(candidateDetail, /<button type="submit" aria-label="发送">↑<\/button>/);
assert.match(candidateDetail, /candidate-patch-proposal/);
assert.match(candidateDetail, /直接编辑预览/);
assert.match(candidateDetail, /id="open-direct-edit"[^>]*>编辑</);
assert.doesNotMatch(candidateDetail, /直接编辑摘要与事实/);
assert.match(pages, /const conversationAllowed = runtime\.mode === "model" && gate\.allowed/);
assert.match(pages, /ProductShell\.applyDetailRuntime\(shell,/);
assert.match(read("product-shell-domain.js"), /shell\.edit\.classList\.toggle\("hidden", conversationAllowed\)/);
assert.doesNotMatch(pages, /preview-source|appendDemoMessage|initCandidateConversation|initJobConversation/);
assert.match(read("product-shell-domain.js"), /panel\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);

// JD is separate, has five requirements, and no match surface.
assert.doesNotMatch(jd, /v1-bottom-sheet|job-empty|open-job-import/);
assert.match(jobImport, /<div><h1>添加职位描述<\/h1><\/div>/);
assert.doesNotMatch(jobImport, /导入一份职位描述|提供本地文件或粘贴职位文本。每份职位描述会形成独立的职位上下文。/);
assert.match(jobImport, /粘贴文本/);
assert.match(jobImport, />文件</);
assert.ok(jobImport.indexOf('data-job-import-type="Document"') < jobImport.indexOf('data-job-import-type="Paste"'));
assert.match(jobImport, /data-job-import-type="Document" aria-pressed="true"/);
assert.match(jobImport, /\.pdf,.png,.jpg,.jpeg,.docx/);
assert.match(jobImport, /点击上传文件或直接拖拽文件至此/);
assert.match(personalImport, /id="personal-file-input"[^>]*\bmultiple\b/);
assert.match(jobImport, /id="job-file-input"[^>]*\bmultiple\b/);
assert.doesNotMatch(pages, /function installFileDropzone\(dropzoneId, inputId, onFiles\)/);
assert.match(read("source-input-domain.js"), /function bind\(\{ dropzone, input, onFiles/);
assert.match(read("source-input-domain.js"), /dropzone\.addEventListener\("click"/);
assert.match(read("source-input-domain.js"), /input\.addEventListener\("change"/);
assert.match(pages, /byId\("job-paste-input"\)\.addEventListener\("input"/);
assert.match(styles, /#job-paste-input \{ overflow-y: auto; resize: none; \}/);
assert.match(styles, /\.v1-paste-input textarea \{[^}]*min-height: 130px[^}]*resize: vertical/s);
assert.match(styles, /\.v1-conversation-form textarea \{[^}]*resize: none/s);
assert.doesNotMatch(jobImport, /选择文件|支持 PDF/);
assert.doesNotMatch(jobImport, /use-job-fixture|消毒/);
assert.match(jobImport, /id="job-link-input"[^>]*type="url"/);
assert.match(jobImport, /职位链接[^<]*<span>选填/);
assert.equal(Demo.JOB_FIXTURE.contract_id, "job-radar-job-context-v1");
assert.equal(Demo.JOB_FIXTURE.requirements.length, 5);
const jdBatchSources = [
  { name: "jd-a.pdf", source_key: "job-source-batch-1", source_url: "https://example.com/a" },
  { name: "jd-b.png", source_key: "job-source-batch-2", source_url: "https://example.com/a" },
];
const jdBatchFixtures = jdBatchSources.map((source) => Demo.createLocalJobFixture(source));
assert.notEqual(jdBatchFixtures[0].job_context_id, jdBatchFixtures[1].job_context_id);
assert.deepEqual(jdBatchFixtures.map((job) => job.imported_from.source_key), jdBatchSources.map((source) => source.source_key));
assert.deepEqual(jdBatchFixtures.map((job) => job.imported_from.source_url), jdBatchSources.map((source) => source.source_url));
assert.match(jobDetail, /v1-type-chip">职位/);
assert.match(jobDetail, /id="job-ai-pane"[\s\S]*job-conversation-form/);
for (const detail of [candidateDetail, jobDetail]) {
  assert.match(detail, /class="v1-conversation-form"[\s\S]*class="v1-composer-field"><textarea[^>]*>[\s\S]*<button type="submit" aria-label="发送"><\/button>/);
}
assert.doesNotMatch(jobDetail, /<button type="submit" aria-label="发送">↑<\/button>/);
assert.match(jobDetail, /id="job-patch-proposal"/);
assert.doesNotMatch(jobDetail, /match score|匹配分数/i);
const jobPatch = Demo.jobPatchFor(Demo.JOB_FIXTURE);
assert.equal(jobPatch.target_job_context_id, Demo.JOB_FIXTURE.job_context_id);
assert.equal(Demo.applyDemoJobPatch(Demo.JOB_FIXTURE, jobPatch).item_version, (Number(Demo.JOB_FIXTURE.item_version) || 1) + 1);

// State language, no provider call, and persistence separation.
assert.deepEqual(Demo.CANDIDATE_PROCESSING_STATES.map(([state]) => state), ["PREPARING", "WAITING", "UNDERSTANDING", "BUILDING_CARDS", "READY_FOR_REVIEW"]);
assert.deepEqual(Demo.JOB_PROCESSING_STATES.map(([state]) => state), ["PREPARING", "WAITING", "UNDERSTANDING", "BUILDING_CARDS", "READY_FOR_REVIEW"]);
assert.doesNotMatch(pages, /fetch\("\/api\/local-ocr-capability"/);
assert.doesNotMatch(pages, /\/api\/local-candidate-extract/);
assert.doesNotMatch(pages, /\/api\/local-candidate-image-ocr/);
assert.doesNotMatch(pages, /fetch\("\/api\/local-ocr"/);
assert.ok(Demo.STORES.some(([name]) => name === "demo_candidate_items"));
assert.ok(Demo.STORES.some(([name]) => name === "demo_job_contexts"));
assert.equal(Demo.isAIRecognizedRecord({ imported_from: { network_sent: false } }), false);
assert.equal(Demo.isAIRecognizedRecord({ ai_recognized: true, imported_from: { network_sent: false, provider: "qwen" } }), false);
assert.equal(Demo.isAIRecognizedRecord({ model_metadata: { provider: "qwen" }, imported_from: { recognition_mode: "LOCAL" } }), false);
assert.equal(Demo.isAIRecognizedRecord({ imported_from: { network_sent: true, provider: "qwen", model: "qwen3.8-max" } }), true);
const duplicateCandidate = Demo.clone(Demo.CANDIDATE_FIXTURES[2]);
const duplicateCandidateIncoming = { ...Demo.clone(duplicateCandidate), item_id: "incoming-education" };
const candidateDuplicates = Demo.findCandidateDuplicates([duplicateCandidateIncoming], [duplicateCandidate]);
assert.equal(candidateDuplicates.length, 1);
assert.ok(candidateDuplicates[0].score >= 0.72);
const mergedCandidate = Demo.mergeCandidateRecords(duplicateCandidate, duplicateCandidateIncoming);
assert.equal(mergedCandidate.item_id, duplicateCandidate.item_id);
assert.equal(mergedCandidate.item_version, duplicateCandidate.item_version + 1);
assert.equal(mergedCandidate.merge_metadata.method, "LOCAL_DETERMINISTIC");
const duplicateJobIncoming = { ...Demo.clone(Demo.JOB_FIXTURE), job_context_id: "incoming-job" };
const jobDuplicates = Demo.findJobDuplicates([duplicateJobIncoming], [Demo.JOB_FIXTURE]);
assert.equal(jobDuplicates.length, 1);
const mergedJob = Demo.mergeJobRecords(Demo.JOB_FIXTURE, duplicateJobIncoming);
assert.equal(mergedJob.job_context_id, Demo.JOB_FIXTURE.job_context_id);
assert.equal(mergedJob.merge_metadata.method, "LOCAL_DETERMINISTIC");
const candidateConsolidation = Demo.consolidateCandidateRecords([
  duplicateCandidate,
  { ...Demo.clone(duplicateCandidate), item_id: "duplicate-education-2", updated_at: "2026-08-28T00:00:00.000Z" },
  { ...Demo.clone(duplicateCandidate), item_id: "duplicate-education-3", updated_at: "2026-08-29T00:00:00.000Z" },
]);
assert.equal(candidateConsolidation.records.length, 1);
assert.equal(candidateConsolidation.removed_ids.length, 2);
assert.equal(candidateConsolidation.records[0].item_id, duplicateCandidate.item_id);
const jobConsolidation = Demo.consolidateJobRecords([
  Demo.JOB_FIXTURE,
  { ...Demo.clone(Demo.JOB_FIXTURE), job_context_id: "duplicate-job-2", updated_at: "2026-08-28T00:00:00.000Z" },
]);
assert.equal(jobConsolidation.records.length, 1);
assert.deepEqual(jobConsolidation.removed_ids, ["duplicate-job-2"]);

// Patch confirmability and independent JOB conversation scope.
const original = Demo.clone(Demo.CANDIDATE_FIXTURES[1]);
const patch = Demo.candidatePatchFor(original);
const updated = Demo.applyDemoPatch(original, patch);
assert.notEqual(updated.summary, original.summary);
assert.equal(updated.item_version, original.item_version + 1);
const jobSession = Conversation.createSession({ scope_type: "JOB", scope_id: Demo.JOB_FIXTURE.job_context_id }, new Date("2026-08-27T00:00:00Z"));
assert.deepEqual(Conversation.validateSession(jobSession), []);
assert.equal(jobSession.scope_type, "JOB");

// Reference mini sidebar: persistent desktop rail, animated hover label, mobile fallback.
assert.match(pages, /function installMiniSidebar/);
for (const label of ["连接设置", "工作空间", "个人资料", "职位描述"]) assert.match(pages, new RegExp(`label: "${label}"`));
assert.ok(pages.indexOf('id: "runtime"') < pages.indexOf('id: "workspace"'));
assert.match(pages, /tooltipText\.animate/);
assert.match(pages, /const translatedWidth = Math\.ceil\(tooltipText\.scrollWidth\) \+ 28/);
assert.match(pages, /Math\.max\(Number\(item\.dataset\.miniWidth\), translatedWidth\)/);
assert.match(pages, /pointermove/);
assert.match(pages, /Math\.exp\(-0\.5/);
assert.match(pages, /requestAnimationFrame\(renderSpringFrame\)/);
assert.match(pages, /widthVelocity/);
assert.match(pages, /targetOpacity/);
assert.equal((pages.match(/base: 8/g) || []).length, 4);
assert.match(pages, /const restWidth = item\.getAttribute\("aria-current"\) === "page" \? baseWidth \+ 10 : baseWidth/);
assert.match(pages, /restOpacity = item\.getAttribute\("aria-current"\) === "page" \? 0\.96 : 0\.2/);
assert.match(pages, /states\[index\]\.restWidth \+ \(38 - states\[index\]\.restWidth\) \* influence/);
assert.match(styles, /will-change: width, opacity, transform/);
assert.match(styles, /\.v1-mini-tooltip\[data-visible="true"\]/);
assert.match(styles, /\.v1-mini-tooltip \{[^}]*min-width: var\(--mini-tip-width\)[^}]*width: max-content/s);
assert.match(styles, /\.v1-mini-sidebar \{[^}]*height: 53px[^}]*right: 18px[^}]*top: 50%[^}]*translateY\(-50%\)/s);
assert.match(styles, /\.v1-mini-rail \{[^}]*gap: 0[^}]*left: 50%[^}]*top: 50%[^}]*translate\(-50%, -50%\)/s);
assert.match(styles, /\.v1-mini-item > span \{[^}]*width: 8px/s);
assert.match(styles, /\.v1-mini-item > span \{[^}]*transform-origin: right center/s);
assert.match(styles, /\.v1-mini-item \{[^}]*height: 7px/s);
assert.match(styles, /\.v1-mini-rail\.is-expanded \.v1-mini-item \{[^}]*height: 12px/s);
assert.match(styles, /\.v1-mini-item\[aria-current="page"\] > span \{[^}]*opacity: \.96[^}]*width: 18px/s);
assert.match(pages, /function navigateFromMiniLabel/);
assert.match(pages, /classList\.add\("v1-route-leaving"\)/);
assert.doesNotMatch(pages, /v1-mini-navigation-bloom|mini-bloom-scale/);
assert.match(styles, /\.v1-route-leaving \.v1-page-shell[^}]*opacity: 0/s);
assert.match(styles, /\.v1-route-leaving \.v1-page-shell[^}]*translateY\(0\)/s);
assert.match(styles, /@keyframes v1-page-fade-in/);
assert.match(styles, /\.v1-page-shell \{[^}]*animation: v1-page-fade-in 420ms cubic-bezier\(\.22,\.78,\.24,1\);/s);
assert.doesNotMatch(styles, /animation: v1-page-fade-in[^;]*\bboth\b/);
assert.match(styles, /\.v1-page-shell \{[^}]*transition: opacity 320ms cubic-bezier/s);
assert.doesNotMatch(styles, /\.v1-body \{[^}]*animation: v1-page-fade-in/s);
assert.match(styles, /@media \(min-width: 701px\)[\s\S]*\.v1-mini-sidebar \{ display: block/);
assert.match(styles, /prefers-reduced-motion: reduce/);

// Card waterfalls always lead with an add-information guide card.
assert.match(pages, /function personalGuideCardMarkup\(\)/);
assert.match(pages, /href="\/personal-import\.html"/);
assert.match(pages, /function jobGuideCardMarkup\(\)/);
assert.match(pages, /href="\/jd-import\.html"/);
assert.match(styles, /\.v1-card-grid \{[^}]*display: grid[^}]*grid-template-columns: repeat\(auto-fit/s);
assert.match(styles, /\.v1-card-grid \{[^}]*align-items: stretch/s);
assert.match(styles, /\.v1-candidate-card, \.v1-add-guide-card \{ display: flex[^}]*height: 100%/s);
assert.match(styles, /@media \(min-width: 701px\) \{[\s\S]*?\.v1-card-grid > \.v1-add-guide-card:only-child \{ justify-self: center; width: min\(100%, 380px\); \}/);
assert.match(styles, /@media \(min-width: 701px\) \{[\s\S]*?\.v1-card-grid > \.v1-add-guide-card\.personal:only-child \{ min-height: 330px; \}/);
assert.match(styles, /@media \(min-width: 701px\) \{[\s\S]*?\.v1-card-grid > \.v1-add-guide-card\.job:only-child \{ min-height: 380px; \}/);
assert.match(styles, /@media \(max-width: 700px\) \{[\s\S]*?\.v1-card-grid \{ grid-template-columns: 1fr; \}/);
assert.match(styles, /\.v1-add-guide-card:hover[^}]*\.v1-add-guide-card\.v1-transition-light[^}]*background: #fff/s);
assert.match(styles, /\.v1-add-guide-card\.job \{ min-height: 330px; \}/);
assert.match(styles, /\.v1-object-folder\.dark\.v1-transition-light \{[^}]*--folder-back: #eceff4[^}]*--folder-front: #fff[^}]*--folder-line: #dce1e9/s);
assert.doesNotMatch(styles, /\.v1-object-folder\.dark:hover[^}]*--folder-(?:back|front|line):/s);
assert.doesNotMatch(styles, /\.v1-object-folder\.dark:focus-visible[^}]*--folder-(?:back|front|line):/s);
assert.match(styles, /\.v1-object-folder \{[^}]*--folder-back: #eceff4[^}]*--folder-front: #fff[^}]*--folder-line: #dce1e9/s);
assert.match(styles, /\.v1-object-folder\.dark \{[^}]*--folder-back: #343842[^}]*--folder-front: #20232a[^}]*--folder-line: #20232a/s);
assert.match(styles, /\.v1-object-folder:not\(\.dark\) \{ --folder-back: #e8ebf0; --folder-front: #fafbfc; \}/);
assert.match(styles, /\.v1-object-folder:not\(\.dark\) \.v1-folder-paper\.paper-3 \{ background: #f0f2f6; \}/);
assert.match(styles, /\.v1-object-folder:not\(\.dark\) \.v1-folder-paper\.paper-2 \{ background: #f5f6f8; \}/);
assert.match(styles, /\.v1-object-folder:not\(\.dark\) \.v1-folder-paper\.paper-1 \{ background: #fff; \}/);
assert.match(styles, /\.v1-folder-paper \{[^}]*border: 1px solid rgba\(207,213,223,\.95\)/s);
assert.match(styles, /\.v1-folder-front \{[^}]*box-shadow: 0 10px 24px rgba\(31,34,42,\.06\)/s);
assert.doesNotMatch(styles, /\.v1-folder-back[^}]*filter:/s);
assert.match(styles, /\.v1-object-folder:hover \.v1-folder-front, \.v1-object-folder:focus-visible \.v1-folder-front \{[^}]*box-shadow: 0 14px 30px rgba\(31,34,42,\.10\)[^}]*rotateX\(-30deg\)/s);
assert.doesNotMatch(styles, /\.v1-object-folder:hover \.v1-folder-front, \.v1-object-folder:focus-visible \.v1-folder-front \{[^}]*border-color:/s);
assert.match(styles, /\.v1-object-folder\.dark \.v1-folder-paper \{[^}]*background: #2a2e36[^}]*border-color: #3b404a/s);
assert.match(styles, /\.v1-object-folder\.dark \.v1-folder-paper i \{[^}]*background: #555b67[^}]*transition: background-color 360ms ease/s);
assert.match(styles, /\.v1-object-folder\.dark\.v1-transition-light \.v1-folder-paper \{[^}]*background: #f5f6f8[^}]*border-color: #d9dee7/s);
assert.match(styles, /\.v1-object-folder\.dark\.v1-transition-light \.v1-folder-paper i \{[^}]*background: #d9dee7/s);
assert.doesNotMatch(styles, /\.v1-object-folder\.dark:hover \.v1-folder-paper[^}]*background:/s);
assert.doesNotMatch(styles, /\.v1-object-folder\.dark:focus-visible \.v1-folder-paper[^}]*background:/s);
assert.match(styles, /\.v1-add-guide-icon \{[^}]*border: 0/s);
assert.match(styles, /\.v1-add-guide-icon::before \{[^}]*height: 24px[^}]*width: 24px/s);
assert.match(styles, /\.v1-add-guide-card \{[^}]*padding: 24px/s);
assert.match(styles, /\.v1-add-guide-icon \{[^}]*justify-content: flex-start/s);
assert.match(styles, /\.v1-add-guide-icon::before \{[^}]*transform: translateX\(calc\(-1 \* 4px\)\)/s);
assert.match(styles, /\.v1-candidate-card > \.v1-card-top > \.v1-type-chip \{[^}]*transform: translateX\(-1px\)/s);
assert.match(styles, /\.v1-conversation-form button\[type="submit"\] \{[^}]*background: #20232a[^}]*font-size: 0[^}]*height: 42px[^}]*width: 42px/s);
assert.match(styles, /\.v1-conversation-form button\[type="submit"\]::before \{[^}]*height: 20px[^}]*mask: url\("\/vi\/icons\/send\.svg"\)[^}]*20px 20px[^}]*width: 20px/s);
assert.match(styles, /\.v1-body button:focus-visible[^}]*outline: 3px solid rgba\(82, 111, 218, 0\.25\)[^}]*outline-offset: 3px/s);
assert.match(styles, /\.v1-back \{[^}]*border: 0/s);
assert.match(styles, /\.v1-back::before \{[^}]*url\("\/vi\/icons\/chevron-left\.svg"\)[^}]*width: 20px/s);
assert.match(styles, /\.v1-back::after \{ content: none; \}/);
assert.match(styles, /\.v1-detail-overlay-close::before \{[^}]*height: 24px[^}]*width: 24px/s);
assert.match(styles, /\.sheet-icon-button::before \{[^}]*height: 24px[^}]*width: 24px/s);
assert.match(styles, /\.v1-object-folder \{[^}]*contain: layout style[^}]*isolation: isolate/s);
assert.match(styles, /\.v1-workspace-grid \{ gap: 27px; margin: max\(130px, calc\(54vh - 184px\)\) auto 0; width: min\(901px, 85%\); \}/);
assert.match(styles, /@media \(min-width: 701px\) \{[\s\S]*?\.v1-workspace-grid \{ column-gap: 89px; margin: max\(130px, calc\(50vh - 184px\)\) auto 0; \}/);
assert.match(styles, /\.v1-folder-back \{[^}]*figma-folder-back\.svg[^}]*100% 100% no-repeat/s);
assert.match(styles, /\.v1-folder-back::before \{ content: none; \}/);
assert.match(styles, /\.v1-object-folder:hover \.v1-folder-paper,[^}]*\{[^}]*translate3d\(0, var\(--paper-open-y\), var\(--paper-depth\)\)[^}]*rotateX\(-7deg\)/s);
assert.match(styles, /\.v1-folder-paper \{[^}]*backface-visibility: hidden[^}]*height: 61\.77%[^}]*top: 18\.67%[^}]*translate3d\(0, 7px, var\(--paper-depth\)\)[^}]*500ms cubic-bezier\(\.22,\.72,\.2,1\)/s);
assert.match(styles, /\.v1-folder-front \{[^}]*backface-visibility: hidden[^}]*top: 9\.4%[^}]*transform: translate3d\(0,0,0\)[^}]*transform-style: preserve-3d/s);
assert.match(styles, /\.v1-object-folder:hover \.v1-folder-front,[^}]*\{[^}]*rotateX\(-30deg\)/s);
assert.doesNotMatch(styles, /\.v1-object-folder:hover \{[^}]*filter:/s);
assert.doesNotMatch(styles, /\.v1-object-folder:hover \{[^}]*transform:/s);
assert.doesNotMatch(styles, /\.v1-object-folder:hover \.v1-folder-back,[^}]*\{[^}]*box-shadow:/s);
assert.doesNotMatch(styles, /\.v1-object-folder:hover \.v1-folder-paper,[^}]*\{[^}]*box-shadow:/s);
assert.match(styles, /\.v1-object-copy \{[^}]*position: absolute[^}]*top: 74px[^}]*translateZ\(2px\)/s);
assert.match(styles, /\.v1-object-count \{[^}]*position: absolute[^}]*top: 142px/s);
assert.match(styles, /\.v1-object-count \{[^}]*translateZ\(2px\)/s);
assert.match(styles, /\.v1-folder-paper\.paper-3 \{[^}]*--paper-depth: -3px[^}]*--paper-open-y: -26px[^}]*transition-delay: 80ms[^}]*z-index: 1/s);
assert.match(styles, /\.v1-folder-paper\.paper-2 \{[^}]*--paper-depth: -2px[^}]*--paper-open-y: -16px[^}]*transition-delay: 40ms[^}]*z-index: 2/s);
assert.match(styles, /\.v1-folder-paper\.paper-1 \{[^}]*--paper-depth: -1px[^}]*--paper-open-y: -7px[^}]*transition-delay: 0ms[^}]*z-index: 3/s);
assert.match(styles, /\.v1-folder-front \{[^}]*transform 640ms cubic-bezier\(\.22,\.72,\.2,1\)/s);
assert.match(styles, /\.v1-folder-front \{[^}]*z-index: 4/s);
assert.match(styles, /\.v1-object-folder:hover \.v1-folder-paper,[^}]*transition: transform 480ms cubic-bezier\(\.16,1,\.3,1\)/s);
assert.match(styles, /\.v1-object-folder:hover \.v1-folder-paper\.paper-3,[^}]*\{[^}]*transition-delay: 64ms/s);
assert.match(workspace, /v1-folder-front[^>]*>\s*<span class="v1-object-copy"><b>个人资料<\/b>[\s\S]*workspace-personal-count[\s\S]*<\/span>/);
assert.match(styles, /\.v1-folder-paper i/);
assert.match(personal, /id="candidate-card-grid" class="v1-card-grid"/);
assert.match(jd, /id="job-card-grid" class="v1-card-grid"/);

// Stored cards and import guide cards share the same large reversible overlay.
assert.match(pages, /function installDetailCardOverlay/);
assert.match(pages, /page === "jd"[\s\S]*title: "添加职位描述"[\s\S]*close: "关闭添加职位描述"/);
assert.match(pages, /title: "添加个人材料"[\s\S]*close: "关闭添加个人材料"[\s\S]*workspace: "候选人信息"/);
assert.match(pages, /title\.textContent = workspace \? importCopy\.workspace : importCopy\.title/);
assert.match(pages, /isEmbeddedDetail = new URLSearchParams/);
assert.match(pages, /viewportWidth \* \(compact \? 0\.94 : skillWorkspace \? 0\.92 : 0\.8\)/);
assert.match(pages, /viewportHeight \* \(compact \? 0\.9 : 0\.8\)/);
assert.match(pages, /duration: 540, easing: "cubic-bezier\(\.16,1,\.3,1\)"/);
assert.match(pages, /duration: 480, easing: "cubic-bezier\(\.16,1,\.3,1\)"/);
assert.match(pages, /detailUrl\.searchParams\.set\("embed", "1"\)/);
assert.match(pages, /event\.target\.closest\("\.v1-candidate-card, \.v1-add-guide-card"\)/);
assert.match(pages, /overlay\.dataset\.overlayKind = isImport \? "import" : "detail"/);
assert.match(pages, /else \{[\s\S]*closeButton\.setAttribute\("aria-label", "关闭详情"\)[\s\S]*workspaceCloseButton\.classList\.add\("hidden"\)/);
assert.match(pages, /job-radar-v1-import-complete/);
assert.match(pages, /job-radar-v1-detail-updated/);
assert.match(pages, /window\.visualViewport\?\.width \|\| window\.innerWidth/);
assert.match(pages, /if \(!sourceCard \|\| closing \|\| surface\.classList\.contains\("floating-window-positioned"\)\) return/);
assert.match(pages, /function completeEmbeddedImport/);
assert.doesNotMatch(pages, /completeEmbeddedImport\("personal", lastSourceKey\)/);
assert.doesNotMatch(pages, /Demo\.createLocalCandidateFixtures/);
assert.doesNotMatch(pages, /Demo\.findCandidateDuplicates/);
assert.doesNotMatch(pages, /Demo\.mergeCandidateRecords/);
assert.doesNotMatch(pages, /Demo\.persistCandidateImport/);
assert.match(pages, /const acceptCandidateFiles =/);
assert.match(pages, /Array\.from\(files \|\| \[\]\)/);
assert.match(pages, /const batchId = !replace && selectedCandidateSources\[0\]\?\.batch_id/);
assert.match(pages, /new Map\(prepared\.map\(\(source\) => \[source\.source_document_id, source\]\)\)/);
assert.match(pages, /modelSourceImportState\(source\.source_document_id, records\)/);
assert.match(pages, /SourceInput\.renderBundlePreview\([\s\S]*selectedCandidateSources/);
assert.doesNotMatch(pages, /支持多文件|可上传多个文件|批量上传/);
assert.match(read("source-input-domain.js"), /for \(const source of sources\)/);
assert.doesNotMatch(pages, /await processCandidateSource\(/);
assert.match(pages, /async function archiveSelectedSources\(kind\)[\s\S]*SourceInput\.persistDurableBundle/);
assert.doesNotMatch(pages, /LocalCandidate\.processingRunFor\(/);
assert.match(pages, /原件保存未完成，请重试/);
// Completion is reachable from proposal review, candidate removal, durable-source
// acknowledgement, and the accepted Candidate Workspace publication path.
assert.equal((pages.match(/completeEmbeddedImport\("personal"/g) || []).length, 4);
assert.match(pages.slice(pages.indexOf("async function reviewCandidateProposal"), pages.indexOf("function showCandidateSource")), /completeEmbeddedImport\("personal"/);
assert.match(pages.slice(pages.indexOf("async function initCandidateDetail"), pages.indexOf("function jobCardMarkup")), /persistRemoval\(database, canonicalRevision, itemId\)[\s\S]*completeEmbeddedImport\("personal"/);
assert.match(read("source-input-domain.js"), /accept\(event\.dataTransfer\?\.files/);
assert.match(pages, /async function acceptJobFiles\(files, \{ replace = false/);
assert.match(pages, /const selectedFiles = Array\.from\(files \|\| \[\]\)/);
assert.match(pages, /Promise\.allSettled\(selectedFiles\.map/);
assert.doesNotMatch(pages, /modelMode && selectedFiles\.length !== 1/);
assert.match(pages, /const batchKey = !replace && selectedJobSources\[0\]\?\.batch_id/);
assert.match(pages, /LocalJob\.prepareSource/);
assert.match(pages, /LocalContextLifecycle\.uniqueSources\(prepared\)/);
assert.match(pages, /const sourceUrl = byId\("job-link-input"\)\?\.value\.trim\(\) \|\| null/);
assert.match(pages, /LocalJob\.prepareSource\(file, batchKey, \{ source_url: sourceUrl \}\)/);
assert.match(jobImport, /accept="\.pdf,\.png,\.jpg,\.jpeg,\.docx/);
assert.match(pages, /const handleCandidateFiles = \(files, options = \{\}\) => \{[\s\S]*showPersonalError\(error, selectionVersion\)/);
assert.match(pages, /candidateSourceInputBinding = SourceInput\.bind/);
assert.match(pages, /jobSourceInputBinding = SourceInput\.bind/);
assert.match(read("source-input-domain.js"), /event\.dataTransfer\?\.files/);
assert.match(pages, /SourceInput\.renderBundlePreview\([\s\S]*selectedJobSources/);
assert.doesNotMatch(pages.slice(pages.indexOf("function showJobSource"), pages.indexOf("function resetJobSource")), /原始来源保存在本机；确认后发送有界文本证据/);
assert.doesNotMatch(read("source-input-domain.js"), /\{ container, list, name, meta, icon \}|boundary/);
assert.doesNotMatch(`${personalImport}\n${jobImport}`, /id="(?:personal|job)-file-(?:name|meta|icon)"/);
assert.doesNotMatch(jobImport, /data-job-processing-mode|id="job-processing-modes"/);
assert.doesNotMatch(pages, /selectedJobProcessingMode|configureJobProcessingMode/);
assert.match(read("source-input-domain.js"), /for \(const source of sources\)/);
assert.doesNotMatch(pages, /await processJobSource\(/);
// A failed pending paste cannot fall through to archiving an obsolete source.
const jobEntryCode = pages.slice(pages.indexOf("  async function runJobProcessing("), pages.indexOf("  function jobReviewMarkup("));
let archivedAfterFailure = false;
const runJobProcessing = vm.runInNewContext(`${jobEntryCode}; runJobProcessing`, {
  prepareCurrentJobPaste: async () => { throw Error("synthetic paste preparation failed"); },
  archiveSelectedSources: () => { archivedAfterFailure = true; },
});
await assert.rejects(runJobProcessing(), /synthetic paste preparation failed/);
assert.equal(archivedAfterFailure, false, "preparation failure must not save an obsolete original");
assert.match(pages, /原件保存未完成，请重试；已成功保存的文件会保留。/);
assert.match(pages, /await renderAwaitingJobReviews\(\{ reset: true \}\)/);
assert.match(pages, /if \(!remaining\.length\) \{/);
assert.doesNotMatch(jobImport, /支持多文件|可同时上传多个|批量上传/);
assert.match(pages, /LocalJob\.preparePastedText/);
assert.doesNotMatch(pages, /Demo\.createLocalJobFixture/);
assert.doesNotMatch(pages, /askDuplicateResolution/);
assert.match(pages, /sourceCard\.style\.visibility = "hidden"/);
assert.match(pages, /finishedSource\.style\.visibility = ""/);
assert.match(pages, /JobRadarFloatingWindow\?\.mount\(surface/);
assert.match(pages, /dragHandle: content\.querySelector\("header"\)/);
assert.ok(pages.indexOf("installDetailCardOverlay();") < pages.indexOf("installCardPageTransitions();"));
assert.match(styles, /\.v1-detail-overlay-surface \{[^}]*position: fixed[^}]*will-change: left, top, width, height, border-radius/s);
assert.match(styles, /\.v1-detail-overlay-content \{[^}]*grid-template-rows: 58px minmax\(0, 1fr\)/s);
assert.match(styles, /\.v1-embedded-detail \.v1-split-view \{[^}]*gap: 0[^}]*grid-template-columns: minmax\(0, 1fr\) !important/s);
assert.match(styles, /\.v1-embedded-detail\.v1-ai-capable \.v1-split-view \{[^}]*grid-template-columns: minmax\(0, 1\.08fr\) minmax\(340px, \.92fr\) !important/s);
assert.match(styles, /\.v1-embedded-detail \.v1-structured-pane \{[^}]*border: 0[^}]*border-radius: 0[^}]*scrollbar-gutter: stable/s);
assert.match(styles, /scroll-padding-bottom: 52px/);
assert.match(styles, /\.v1-embedded-detail\[data-v1-page="personal-import"\], \.v1-embedded-detail\[data-v1-page="job-import"\] \{[^}]*height: 100vh[^}]*overflow: hidden/s);
assert.match(styles, /\.v1-embedded-detail\[data-v1-page="personal-import"\] \.v1-page-shell,[^}]*height: 100vh[^}]*overflow-x: hidden[^}]*overflow-y: auto[^}]*scrollbar-gutter: stable/s);
assert.match(styles, /\.v1-embedded-detail \.v1-structured-pane::\-webkit-scrollbar-track,[^}]*\.v1-page-shell::\-webkit-scrollbar-track[^}]*margin-block: 20px/s);
assert.match(styles, /\.v1-embedded-detail \.v1-structured-pane::\-webkit-scrollbar-thumb,[^}]*background-clip: padding-box[^}]*border-radius: 999px/s);
assert.match(styles, /\.v1-detail-overlay-preview > \.v1-candidate-card, \.v1-detail-overlay-preview > \.v1-add-guide-card/);
assert.match(styles, /\.v1-embedded-detail\[data-v1-page="personal-import"\] \.v1-page-shell,[^}]*overflow-y: auto[^}]*scroll-padding-bottom: 52px/s);
assert.match(pages, /function installCardPageTransitions/);
assert.match(pages, /params\.delete\("v"\)/);
assert.match(pages, /function animateCardToPage/);
assert.match(pages, /function playPendingCardReturn/);
assert.match(pages, /function returnToCardLibrary/);
assert.match(pages, /transitionSourceSelector = "\.v1-candidate-card, \.v1-add-guide-card"/);
assert.match(pages, /pageFadeSourceSelector = "a\[href\]"/);
assert.doesNotMatch(pages, /transitionSourceSelector = "[^"]*\.v1-object-folder/);
assert.match(pages, /const fadeSource = event\.target\.closest\(pageFadeSourceSelector\)/);
assert.match(pages, /function navigateWithPageFade[\s\S]*safeSession\.remove\(\);[\s\S]*classList\.add\("v1-route-leaving"\)[\s\S]*window\.setTimeout\(\(\) => window\.location\.assign\(destination\), 320\)/);
assert.match(pages, /source\.matches\("\.v1-add-guide-card, \.v1-object-folder\.dark"\)/);
assert.match(pages, /classList\.add\("v1-transition-light"\)/);
assert.match(pages, /returnsToDarkSurface = target\.matches\("\.v1-add-guide-card, \.v1-object-folder\.dark"\)/);
assert.match(pages, /target\.classList\.remove\("v1-transition-light"\)/);
assert.match(pages, /duration: 460, easing: "cubic-bezier\(\.16,1,\.3,1\)"/);
assert.match(pages, /classList\.add\("v1-transition-surface"\)/);
assert.match(pages, /const pagePaperColor = \(\) =>/);
assert.match(pages, /backgroundColor: paperColor/);
assert.match(pages, /backgroundColor: "#fff"/);
assert.match(pages, /cover\.className = "v1-card-arrival-cover"/);
assert.match(styles, /\.v1-card-transition-layer\.v1-transition-surface > \* \{ opacity: 0; \}/);
assert.match(styles, /\.v1-card-arrival-cover\.is-clearing \{ opacity: 0; \}/);
assert.match(styles, /\.v1-card-arrival-cover \{[^}]*background: var\(--paper\)/s);
assert.match(styles, /\.v1-card-route-in \.v1-page-shell \{[^}]*animation: none/s);
assert.doesNotMatch(pages, /returnToCardLibrary\("\/personal-information\.html", lastSourceKey\)/);
assert.match(pages, /returnToCardLibrary\("\/jd\.html", sourceKey\)/);
assert.match(styles, /\.v1-card-transition-layer/);
assert.match(styles, /\.v1-conversation-message \{[^}]*align-items: center[^}]*display: flex[^}]*min-height: 48px/s);
assert.match(styles, /\.v1-conversation-message\.user \{[^}]*background: #fff/s);
assert.match(styles, /\.v1-conversation-message\.assistant \{[^}]*background: #20232a/s);
assert.match(personalImport, /id="candidate-workspace-conversation" class="v1-workspace-conversation v1-conversation-messages v1-conversation-thread"/);
assert.match(jobImport, /id="job-workspace-conversation" class="v1-workspace-conversation v1-conversation-messages v1-conversation-thread"/);
assert.match(jobDetail, /id="job-conversation-messages" class="v1-conversation-messages v1-conversation-thread"/);
assert.match(styles, /\.v1-conversation-thread \.v1-conversation-message \{ line-height: 1\.5; max-width: 92%; min-height: 0; padding: 10px 13px; \}/);
for (const html of [personalImport, jobImport]) {
  assert.match(html, /class="v1-conversation-form v1-workspace-composer"/);
  assert.match(html, /class="v1-composer-field"><textarea/);
}
assert.match(pages, /ConversationUI\.renderMessages\(target, candidateWorkspaceConversation,/);
assert.match(pages, /const visible = JobConversation\.connectedHistory\(messages\)/);
assert.match(pages, /ConversationUI\.renderMessages\(target, visible,/);
assert.match(pages, /ModelWorkspaceUI\.renderProgress\(byId\("candidate-understanding-events"\)/);
assert.match(pages, /ModelWorkspaceUI\.renderProgress\(byId\("job-understanding-events"\)/);
assert.match(pages, /ProductShell\.showWorkspace\(workspace, \{ source_name: sourceName \|\| "当前材料"/);
assert.match(pages, /ProductShell\.showWorkspace\(jobSharedWorkspace\(\), \{ source_name:/);
assert.match(styles, /corner-shape: squircle/);
assert.match(workspace, />Ariadne</);
assert.doesNotMatch(workspace, /所有本轮示例均为/);
assert.match(styles, /@import url\("https:\/\/fonts\.googleapis\.com\/css2\?family=IBM\+Plex\+Serif/);
assert.match(styles, /font-family: "Recursive", "Inter", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", ui-sans-serif, sans-serif/);
assert.doesNotMatch(styles, /font-family:[^;]*IBM Plex Serif/);
assert.doesNotMatch(styles, /\.v1-back::before \{[^}]*width: 17px/s);
assert.doesNotMatch(pages, /打开材料|打开职位上下文|PDF · 图片 · 粘贴文本|简历 · 作品集 · 项目/);
assert.match(pages, /保存原件，或选择已存材料交给 AI 分析。/);
assert.match(pages, /点击进入导入页面，建立期望职位卡片。/);
assert.match(styles, /\.v1-file-picker \{[^}]*min-height: 230px[^}]*padding: 0/s);
assert.match(styles, /\.v1-file-dropzone > span \{ opacity: \.9; \}/);

// Press feedback remains global; mini navigation expands its current label before navigation.
assert.match(styles, /\.v1-body :where\(button:not\(:disabled\):not\(\.v1-sheet-backdrop\), summary, a\[href\]\):active[^}]*scale: \.97/s);
assert.doesNotMatch(pages, /installPageTransitions|v1-page-enter|v1-page-leaving|v1-mini-navigation-bloom/);
assert.match(pages, /"personal-import": initPersonalImport/);
assert.match(pages, /"job-import": initJobImport/);

console.log(JSON.stringify({ step_02_03_ui_framework: "expanded_checks_pass", mini_sidebar_fisheye_contract: "compact_idle_expanded_proximity_active_emphasis_and_fade_navigation_pass", workspace_folders: "figma_vector_back_and_layered_hover_open_with_three_papers_pass", workspace_navigation: "folder_and_workspace_back_smooth_page_fade_pass", stored_card_detail: "current_runtime_capability_gated_with_local_direct_edit", import_guides: "personal_and_job_import_share_the_same_reversible_overlay_and_complete_in_place", page_motion: "folder_fade_overlay_morph_and_mini_fade_pass", real_provider_calls: "none", fixture_truth_separation: "pass" }, null, 2));

assert.match(read("vi/icons/send.svg"), /stroke-width="1\.8" stroke-linecap="round" stroke-linejoin="round"[\s\S]*M12 18V6M7\.5 10\.5 12 6l4\.5 4\.5/);
assert.match(read("vi/icons/chevron-left.svg"), /stroke-width="2\.4" stroke-linecap="round" stroke-linejoin="round"[\s\S]*M15 5\.5 8\.5 12 15 18\.5/);
