# 2026-10-14 完整 Skill 与官网发布回执

## 正式发布已完成

用户本人完成 Cloudflare 官方设备授权后，API `ariadne-api` 已部署 `d7690df9-e5ba-442e-87fd-a67ded9ced18`，部署查询确认 100%；Pages 生产版本 `38f2288b-9586-4307-89d6-1f1b060c0e41`，发布回执地址 https://38f2288b.ariadne-7pc.pages.dev，来源 `d18feb1`。官网正式域名继续为 https://ariadne.kai-nex.com/ 。保留既有服务绑定、正式来源和 DO migration，未新增模型调用。

官网 `/downloads/skill.json` 已引用 `skill-20261014-continuity`，大小 2,983,221 bytes，SHA-256 `156b3be872ac6b225ad1f03c2426a4fe2ebe819155d33b95da4b33aefd5da9f7`；同源 ZIP、GitHub 下载和本机构建逐字节相同。安装指令生成代码无需修改，固定 Release URL 与校验信息已随本次发布更新。已复制出去的旧安装文字不会自动改变，重新从官网复制即可获取新版。

正式 HTTPS egolite TaskSpace 50 验证：安装窗口就绪及复制成功，新 URL/hash 正确，1350×728 无横向溢出、截图可读；health/web runtime/Candidate signature/Job signature GET 200，空合成对话请求经生产 DO/WSGI 返回 400、`network_call_made=false`、未写入。公开 asset manifest 与候选包完全一致，七项关键资源（查找、个人上下文、对话、简历任务和页面脚本）HTTP 200/hash 相同并使用 immutable 缓存。第一份核验记录用了两个不存在的资源名，原结果保留，按源码实际文件名复核通过，未修改产品。

本机已完成完整备份更新，245 个运行文件与发布包一致，doctor ready；原窗口需要重开才能加载完整新版。职业资料、工作区绑定、独立登录和模型选择保持。未验证新机器首次安装、所有真实业务模型质量或生产压力，不以此次部署核验外推这些结论。

证据补充：`api-deploy.log`、`pages-deploy.log`、`api-deployments-after.log`、`pages-deployments-after.json`、`public-after.json`、`public-install-verification.json`、`public-assets-final.json`、`public-download.zip`、`public-install.png`、`publication-complete.json`，均在 `work/release-20261014-continuity/`。以下保留首次发布尝试的过程与权限阻断，现已完成。

<details>
<summary>首次发布尝试与原验收记录（权限阻断现已解决）</summary>

## 已完成：GitHub 完整包与本机更新

- [完整 Release](https://github.com/orocoa/Ariadne/releases/tag/skill-20261014-continuity)绑定 `d18feb127ca9594930e131110c06f3b950fc1255`，从干净独立 checkout 构建，不包含主目录无关改动。ZIP 2,983,221 bytes，SHA-256 `156b3be872ac6b225ad1f03c2426a4fe2ebe819155d33b95da4b33aefd5da9f7`，245 个 runtime 文件。GitHub 已下载核对大小/hash，ZIP 路径和内部完整性通过。
- 本机 `~/.codex/skills/ariadne` 已覆盖同一完整包；旧安装完整备份在 `work/release-20261014-continuity/installed-before/`。245 个文件 hash 和 doctor ready，未读改职业资料、工作区绑定或认证，未更换模型选择。原窗口未打断，重开加载完整新版。
- [源码 GitHub CI](https://github.com/orocoa/Ariadne/actions/runs/38559952818)通过；发布相关 bundle/install/download/Cloudflare download 与公开文件检查通过。新增发布工作没有调用真实 Provider，沿用源码阶段的合成模型质量证据，不宣称更多任务已验收。

## 待完成：官网、API 和固定安装清单

官网当前仍提供 10 月 13 日完整 Skill，Web/API 保持旧版。新的 Pages/API 候选包已生成，尚未上传生产。当前 Cloudflare OAuth 缺少 `workers_scripts:write`，API 返回无权访问；官方设备授权五分钟内未完成而超时。需要本人在 Cloudflare 页面完成授权后继续，无需重建已核验包。

官网安装指令由 `/downloads/skill.json` 提供固定 GitHub Release URL、字节数和 SHA-256，生成指令的代码无需修改；发布时必须同时更新该清单、同源 ZIP/校验文件及 API/Pages。单独推送 GitHub main 不会让旧指令自动跟随新源码，已复制出去的旧指令也不会自行更新。

## 候选包验收及边界

Pages 496 文件；121 个指纹资源 hash 和 HTML 引用完整。旧官网 `/asset-manifest.json` 返回 404，本轮从首代指纹资产开始，没有虚构上一代 manifest。实际 Workerd/Pyodide 启动，开发参数将允许来源精确限定为隔离 loopback；health/runtime/signature GET 200，空合成请求经 DO/WSGI 返回 400、零 Provider 调用。生产配置只允许正式 HTTPS 来源。

同一 egolite TaskSpace 49 检查发布预览：新 tag/hash 安装指令及复制成功、无横向溢出。公网发布后的页面/API/下载核验尚未执行，不能用本地预览替代公网证据。直接 Python 请求正式站点收到 403，浏览器同源读取正常；保留原结果。

环境准备时发现隔离源码没有 `.cache`、系统 Python 与 Node/npm 路径差异，保留失败并补齐测试目录/指定现有运行时。pywrangler 已完成锁定依赖同步，但调用 npx 时因本机没有 npx 退出；随后直接使用同一已安装 Wrangler 4.134.0 完成 dry-run 及本地运行，没有更改依赖版本或产品代码。最初 HTTP dev 请求被生产 HTTPS 来源规则正确拒绝，后续仅 dev 参数采用明确 loopback origin。

所有包、备份、回执、原失败及中间文件保留在 `work/release-20261014-continuity/`；不纳入源码提交。未新增产品功能、迁移用户资料、部署不匹配的前端或绕过发布权限。

</details>
