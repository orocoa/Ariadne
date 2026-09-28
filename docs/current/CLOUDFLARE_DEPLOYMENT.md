# Ariadne：免费托管与腾讯域名部署

更新：2026-09-28。官网 **https://ariadne.kai-nex.com**、API 与完整 Skill 已同步到源码 `126c775150370c25bbdbd9cf8ad1fe9209936f21`。Pages `eaf6467c`，API Worker `a97ce0f0-a935-436e-9f3e-63f586c91ec8`；[完整 Skill 下载](https://github.com/orocoa/Ariadne/releases/tag/skill-20260928-workspace-changes)：2,893,474 bytes，SHA-256 `4a61ed3cbd4fb4fe63b5f197df66af6174a33c77890d68a05d9f42e68a4839cf`。新增职位完整变更集、Codex 模型/强度分别选择、六入口每次确认，以及不依赖反向 DNS 的本机启动。GitHub 129/129 回归、VI、公开文件与全历史凭据扫描均通过；线上 27 个路径及两处 ZIP 下载核验通过。详见[本次发布回执](../../PROJECT_STATUS.md)和[更新记录](../../CHANGELOG.md)。

上一版（2026-09-25）：正式入口 **https://ariadne.kai-nex.com** 已同步当前个人上下文、统一求职记录与对话体验。Pages 为 `47227fc3`，绑定 API Worker `0070f6ad-1107-4aee-9e55-b37baa112350`，源码 `b4f995f`；公开包为 [skill-20260925-context-journal-ui](https://github.com/orocoa/Ariadne/releases/tag/skill-20260925-context-journal-ui)，2,879,841 bytes，SHA-256 `80eb91046f6883dcdbe4ef7c0201bf22559c84f9c4f7775e4a06f7baa076be8a`。GitHub、官网和本机 Skill 安装内容已核对；用户资料各自保存，不自动同步。线上检查及本地 128 项回归通过，GitHub 自动回归两组启动超时（126/128），不视为全绿验收；详见 [发布回执](../../PROJECT_STATUS.md)。旧版本保留。本机旧版升级需在独立 Ariadne Codex 目录完成官方登录，不复制日常 Codex 凭据。

当前部署：Pages 项目 `ariadne`，实际默认域名 `ariadne-7pc.pages.dev`；通过 `ARIADNE_API` 绑定 Python Worker `ariadne-api`。腾讯 DNSPod 已添加 `ariadne` CNAME 指向上述 Pages 域名，Cloudflare 自定义域名显示 Active / SSL enabled。未购买 VPS、迁移整个 DNS 或修改原有邮箱记录。以下步骤供后续更新与重新部署使用。

## 你将得到什么

- Cloudflare Pages 提供网页；Pages 的 Service Binding 将 API 请求交给 Python Worker。普通用户只打开浏览器、填写自己的 Key，无需安装 Python、Codex 或本地连接器。
- DeepSeek 已通过正式 HTTPS 网站完成真实图片连接检查和两页合成简历分析，返回 3 条待审阅资料；两页完整交付，重复请求命中相同结果。Gemini/千问保留用户自带 Key 的连接验证；本阶段没有这两家的真实账号执行证据。
- 浏览器保存原件、资料和确认版本。Key 按请求经过 Cloudflare 转交指定 Provider，不持久保存到服务端。服务器只持久保存操作/内容摘要，防止同一次付费操作在运行实例重启后自动重复；短暂结果缓存会过期，用户须审阅后主动重试。
- 原有六类领域处理与人工保存规则复用；PDF 在浏览器完整逐页转图，Worker 核对原始 hash、实际页数、顺序和每页 hash。本预览限制每份 PDF 5 MiB / 16 页 / 转图合计 6 MiB，完整请求 12 MiB；超限整次拒绝，不截断。本地包保留原有较大上限。
- Codex 通过使用者电脑上的 Ariadne Skill 运行，直接进入工作空间。网页本地 Agent 入口仅提供安装与调用说明；网页不连接 Codex，API 不依赖本地 Skill。

无需租 VPS。Pages、Workers 与 SQLite Durable Objects 可从免费计划开始，但免费额度和 CPU/存储限制仍适用，超额会影响可用性；模型 API 费用由各用户自己的服务商账号承担。本次正式 HTTPS 与小样本公网执行通过，不代表高并发、全部文件上限或跨地区网络验收。[Pages 限制](https://developers.cloudflare.com/pages/platform/limits/)、[Workers 价格](https://developers.cloudflare.com/workers/platform/pricing/)、[Durable Objects 免费额度](https://developers.cloudflare.com/durable-objects/platform/pricing/)。

## 1. 准备账号与部署工具

1. 注册或登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，使用免费计划。
2. 在你的 Mac 上安装 [Node.js LTS](https://nodejs.org/en/download)（22 或以上）与 [uv](https://docs.astral.sh/uv/getting-started/installation/)（0.12.3 或以上）。这些只用于你部署，网站访客不需要安装。
3. 打开本次生成的发布目录，里面有 `pages/`、`api/`、`wrangler.jsonc`、`Ariadne-Pages.zip` 和本说明。**不要上传整个项目目录、`.cache`、私人材料或 API Key。**
4. 打开终端，输入 `cd `（末尾有空格），把发布目录拖入终端，回车。后文命令从此目录执行。

## 2. 先部署 API Worker

```sh
cd api
npm install
npx wrangler login --device --scopes user:read account:read workers:write pages:write zone:read workers_scripts:write
uv run pywrangler deploy
cd ..
```

设备授权会显示验证网址和一次性代码，打开网址完成授权并等待终端报告成功；它不依赖 localhost 回调。如果旧的普通授权链接出现 localhost refused to connect，重新执行上面的设备授权，不要继续使用已过期的回调链接。若账户有多个账号，选择你要托管 Ariadne 的那个。`workers_scripts:write` 是本次 Worker 上传所需权限；`offline_access` 由工具自动添加，不要手动放入 scopes。不要将令牌或 Key 发给别人。配置已固定 `ariadne-api`、SQLite Durable Object 和允许的正式来源 `https://ariadne.kai-nex.com`；不需要填你的 DeepSeek Key。成功输出应包含 Worker 部署/版本信息；API Worker 没有独立公网入口，通过 Pages 绑定访问。

本发布包固定 Wrangler 4.134.0、workers-py 1.17.3、runtime SDK 1.8.6 和 pypdf 6.1.1，包含依赖 hash 锁文件。`uv run pywrangler deploy --dry-run` 可先检查打包而不发布。[Cloudflare Python WSGI 支持](https://developers.cloudflare.com/workers/languages/python/packages/flask/)。

## 3. 部署 Pages 页面并绑定 API

推荐命令方式，能同时带上 API 绑定，少一次控制台配置：

```sh
api/node_modules/.bin/wrangler pages project create ariadne --production-branch main --force
api/node_modules/.bin/wrangler pages deploy pages --project-name ariadne --branch main
```

已有同名 Pages 项目就跳过创建，直接部署。Wrangler 4.134.0 创建时使用 `--force` 保留 Pages 项目类型，避免自动转向 Workers 创建流程；后续 `pages deploy` 不需要此参数。若你改了项目名，同时修改发布目录根部 `wrangler.jsonc` 的 `name` 以及命令里的 `--project-name`。Pages 自动读取此标准文件名，不接受自定义 `--config` 路径。**记下部署输出的实际 `*.pages.dev` 地址**，域名可能与项目名不同，不要猜；本项目实际分配的是 `ariadne-7pc.pages.dev`。

也可在 Cloudflare 的 **Workers & Pages → Create application → Pages → Direct Upload** 上传 `Ariadne-Pages.zip`。此方式还要在该 Pages 项目的 **Settings → Bindings → Add → Service binding** 添加：变量名 `ARIADNE_API`，服务选 `ariadne-api`，然后重新部署 Pages，使绑定生效。[直接上传](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[Service bindings](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings)。

预览 `pages.dev` 地址可显示页面，但默认 API 只允许正式域名，出现 `WEB_ORIGIN_DENIED` 是配置边界。先完成下一步即可。若你确实要在 `pages.dev` 测试 API，把**实际且受你控制的**来源追加到 `api/wrangler.jsonc` 的 `ARIADNE_WEB_ORIGINS`（英文逗号分隔），再重新部署 Worker；不要使用通配符。

## 4. 腾讯 DNS 绑定 ariadne.kai-nex.com

**先在 Cloudflare 添加自定义域名，再去腾讯添加解析。**

1. Cloudflare → 你的 Pages 项目 → **Custom domains → Set up a custom domain**。
2. 输入 `ariadne.kai-nex.com`，按页面继续。使用外部 DNS 的子域名接入，不必把整个 `kai-nex.com` 的 DNS 迁走。
3. 打开腾讯云 **DNSPod → 我的域名 → kai-nex.com → 解析 → 添加记录**。

| 字段 | 填写 |
| --- | --- |
| 主机记录 | `ariadne` |
| 记录类型 | `CNAME` |
| 线路 | 默认 |
| 记录值 | Cloudflare 给你的实际 Pages 域名，例如实际显示的 `项目名.pages.dev` |
| TTL | 默认 |

记录值不含 `https://`、斜杠、路径。不要同时保留同名冲突的 A/CNAME 记录；若已有业务记录，先核对用途。回到 Cloudflare 等待域名和证书状态成为 **Active**，然后打开 `https://ariadne.kai-nex.com`。[Cloudflare 外部 DNS 子域名官方说明](https://developers.cloudflare.com/pages/configuration/custom-domains/#add-a-custom-subdomain)。

## 5. 首次上线检查

1. 首页先选运行方式，不显示全局预览提示行。选择「暂不连接 AI」应能进入空工作空间，保存合成材料后刷新可恢复。
2. 打开 `https://ariadne.kai-nex.com/api/web-runtime`，应显示 `mode: web`、三家 BYOK、`preview: true`。若提示 `WEB_API_BINDING_REQUIRED`，检查第 3 步的绑定并重新部署 Pages。
3. 首页“添加新的模型”→ DeepSeek → 填你自己的有效 Key → 阅读费用/传输说明 → “同意验证并连接”。验证成功后选择并继续。
4. 先用无隐私的两页测试资料，确认可以分析、出现待审阅内容，并且只有主动保存才生成确认资料。无效 Key 应明确失败，不能显示假回答或切换 Local。
5. 手机和另一台电脑各验证一次；它们的浏览器资料和 Key 独立。第一次公开分享前，核对 Cloudflare 用量页与错误率。不要启用请求正文、Key 或 Authorization 日志。

正式域名、本机 `127.0.0.1`、预览域名的数据相互独立，不会自动迁移；请使用现有导出/导入能力搬运所需资料。清除浏览器站点数据会删除该浏览器的本地资料。

## 6. 发布 Skill 包

当前构建器自动从同一代码版本生成 `skill-bundle/Ariadne-Skill.zip`，复制到 Pages 的 `/downloads/Ariadne-Skill.zip`，并生成包含完整大小与 SHA-256 的 `/downloads/skill.json`。首页「通过本地 Agent 使用」窗口直接提供「复制安装指令」，再说明 `$ariadne 打开 Ariadne`；旧 `/install` 链接回到 `/#skill`。

发布 Skill 时为构建器传入 `--skill-release-tag skill-YYYYMMDD-HHMMSS`，将生成的同一个完整 ZIP 与 `.sha256` 上传到仓库该 tag 的 GitHub Release，确认公开下载 hash 后再部署 Pages。metadata 的 `github_url` 绑定该版本，网页指令引用 GitHub 包；同源 ZIP 保留作完整性检查与已有链接兼容。不把仓库中的单独 `skills/ariadne` 目录误当完整安装包。发布后核对窗口复制、两个下载来源的字节/hash 及本地直达工作空间行为。

### 历史 Mac App 分发记录

下列 App 发布步骤和资产保留用于追溯；当前安装入口使用上述 Skill 包。


2026-09-19 新版 App 已公开发布：[20260918-172135](https://github.com/KAI-NEX/Ariadne/releases/tag/local-20260918-172135)，113,908,957 bytes，SHA-256 `e8d88429b9802537ec30e914263187abfafcee6e3b501d34ea59aa42d49918bd`。网页下载入口与安装步骤使用独立窗口 App（拖入「应用程序」、菜单登录 Codex、关闭窗口停止）；旧终端版 Release 保留为历史版本。实际发布验收见 PROJECT_STATUS 最新条目。

2026-09-18 已发布 [Apple 芯片 Mac 安装包](https://github.com/KAI-NEX/Ariadne/releases/tag/local-20260918-104410)，版本 `20260918-104410`，111,601,193 bytes，SHA-256 `2636abcf8b5ab85f2921bc4c557e0deb09f4c5bd0583793faa109d68b28ae6eb`。公开下载信息保存在 [local-download.json](../../deploy/cloudflare/local-download.json)，普通页面更新默认沿用它，不要求本机留有 ZIP，也不会因为省略 `--download-url` 清空线上下载。

当前本地 ZIP 超过 Pages 单文件 25 MiB 限制，不能塞进 Pages。网页 API 不依赖它，因此可以先上线网页。安装包适用范围仍为 **macOS 14+ / Apple 芯片**，不宣称支持 Windows 或 Intel。

1. 在你的公开 GitHub 仓库创建 Release（可用公开的 Ariadne 仓库；如源码仓库是私有的，可自己新建仅存放下载的公开仓库）。不必为了放安装包公开私人源码或材料。
2. 上传本次生成的 `Ariadne-Local-macOS-arm64-时间戳.zip`，发布后复制该文件的真实下载链接。链接形如 `https://github.com/KAI-NEX/仓库/releases/download/标签/文件名.zip`。
3. 在**源码仓库**中重新构建网页发布包，传入真实下载链接：

```sh
npm install --prefix .cache/cloudflare-build --save-exact pdfjs-dist@5.4.624
python3 scripts/build_cloudflare_release.py --pdfjs .cache/cloudflare-build/node_modules/pdfjs-dist --download-url '这里换成刚发布的完整 GitHub 下载链接'
```

构建器会核对本地 ZIP 文件名、大小和 SHA-256，然后更新新发布包的下载元数据。替换安装包时，先发布并验证新资产，再将对应 URL、大小、hash 和版本写入 `deploy/cloudflare/local-download.json`，供后续构建默认使用。重新部署新 `pages/` 即可；API 代码未变时无需重复部署 Worker。没有已发布配置且未提供下载 URL 时，网站显示“尚未发布安装包”。[GitHub Release 资产说明](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)。

## 实现与验收边界

- Pages：静态页面、合同 JS、按需加载的 PDF.js 5.4.624、API 路由 Worker。非 PDF 请求不加载 PDF.js。无额外前端框架或常驻轮询。
- Python Worker：复用 WSGI/领域模块；通过请求级传输钩子调用固定官方端点，重定向拒绝跟随；PDF hook 替代该平台不支持的 Poppler 子进程。本机路径仍使用原实现。
- 每个 origin / 浏览器会话 / Provider / Key 摘要单独一个 Durable Object，最多 2 个并发、256 个持久操作摘要。只写 hash，不写 Key、材料、模型正文。实例丢失内存结果后阻止无声重试；浏览器源材料和确认资料仍在。
- “完整页数与 hash 通过”是传输完整性验证，不是语义正确或对恶意客户端像素真实性的认证。六领域离线回归、本机模拟及正式 HTTPS 的 DeepSeek 小样本分别记录；不同地区 API 可达性、负载上限仍待检查；旧公网 Codex 配对已退出当前产品入口。
- 旧 [Docker 网页部署](WEB_DEPLOYMENT.md) 与 [腾讯服务器教程](WEB_FIRST_DEPLOY.md) 保留为备选历史路径；不需要照旧教程购买服务器。
