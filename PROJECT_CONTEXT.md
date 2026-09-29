# Ariadne 项目上下文

## 2026-09-30：统一专业的项目介绍

中英文 README 以产品定位、原始资料、版本与人工保存流程开篇；按作者最新决定撤回模型宣传及个人评价引文，架构分析和变更记录同步整理。此前开发说明已被本条取代，运行代码与模型选择规则不变。

## 2026-09-30：GitHub 已同步，修正 PDF 契约测试的环境依赖

优化源码与架构说明已通过已认证 GitHub CLI 同步，远端核对 `ee1370a` 与本地相同。旧 #50 启动超时已有后续通过记录；本次新 CI 的 140/141 暴露 PDF 契约测试漏模拟 `pdfinfo` 预检，已补测试隔离与缺失工具明确失败覆盖，运行代码不变。具体运行链接及验证边界见 [项目状态](PROJECT_STATUS.md)；同步源码不等于部署官网或升级已安装 Skill。

## 2026-09-29：优化源码与架构分析同步 GitHub

本阶段 GitHub 同步包含 `8b77d26` 优化源码、双语 README、CHANGELOG、[最终架构分析](docs/current/ARCHITECTURE_REVIEW_20260929.md)、绑定源码的 Archify 交互图，以及可公开的合成性能/验收证据和复现脚本。官网、公开 Skill 包与本机安装未随本次源码同步升级，仍以各自发布记录为准。

## 2026-09-29：可靠性与运行负载优化，尚未发布

已按多 agent 审核实施增量公开输出、PDF 单次转图与整组预算、真实取消传播、Skill 已保存附件引用、存储查询/批读、页面内草稿保护、历史/PDF 复用、Web 显式连接续期与静态资源指纹。完整性、人工保存、跨域隔离、模型选择和旧资料保持原契约。完整本地回归 141/141、真实浏览器和三种候选包本地平台验收通过；未调用真实业务模型、更新本机安装、push 或部署。量化证据及大型模块拆分、语义评测、压力测试等剩余限制见 [优化记录](docs/current/RUNTIME_OPTIMIZATION_20260929.md)。

## 2026-09-28：GitHub、官网与完整 Skill 已同步发布

当前完整版本为 [skill-20260928-workspace-changes](https://github.com/orocoa/Ariadne/releases/tag/skill-20260928-workspace-changes)，产品源码 `126c775`；网页、API 与 Skill 来自同一干净源码。包含职位完整变更集、Codex 型号/强度分别选择、六入口每次确认与无反向 DNS 的本机启动。发布源码 GitHub CI 全绿；中英文 README 说明具体变化、完整包及升级边界。官网安装指令绑定本次 tag 与 SHA-256；用户资料不自动跨端同步。部署与检验回执见项目状态。

## 2026-09-28：统一发布前消除本机启动的 DNS 依赖

本机 Skill、原生监督进程与开发服务共用固定回环 HTTP server，绑定 127.0.0.1 时不再调用反向 DNS。保留 Host/Origin 校验、就绪时间与进程所有权边界；公开下载统一发布工作继续，最终回执见项目状态。

## 2026-09-28：职位对话以整组变更同步正文与跟进

职位对话由单字段 `job_edit` 升级为有明确目标契约的 `changes` 变更集；同时读取当前职位、阶段、结果、备注与求职记录文字，模型理解完整同步意图，代码校验权限/引用/版本并绑定本地数据。一个请求可把状态和经过一起提出，一次审核后原子保存；仅改跟进不生成无关职位版本。移除本地修改关键词路由，保留 Candidate 隔离、来源、人工保存和搜索回合只读。架构见 [职位工作空间变更集](docs/current/JOB_WORKSPACE_CHANGE_SETS.md)。

## 2026-09-28：所有卡片进入对话均需确认

个人与职位卡片、导入工作区及两类整体对话统一为每次进入确认。旧同意不跳过入口，模型/强度变化或切回原模型也重新确认；仍保留历史、草稿和连续进入动效。正在执行的详情窗口被保留后重开也重置本次确认，不取消已经发送的请求。本机 Skill 已更新重开；见 [对话反馈契约](docs/current/CONVERSATION_LIVE_FEEDBACK.md)。

## 2026-09-28：Codex 多模型与推理强度分别选择

本机 Skill 对话菜单改为独立模型列表和推理强度行，点击「应用」统一保存当前对话设置。读取实际 Codex `model/list`，与图片、完整视觉 PDF 及现有领域适配资格取交集；当前 7 款模型已验证，旧选择不自动更换。请求、策略检查和回执均保留所选型号；Ultra 自动委派与当前受限执行边界不兼容，暂不开放。本机 Skill 已备份更新并重新打开；当前 GitHub/公开发布不随本轮自动更新。详情见 [模型选择契约](docs/current/MODEL_SELECTION_AND_TUNING_ARCHITECTURE.md)。

## 2026-09-28：职位对话可建议修改投递阶段

已确认职位的 AI 对话现在读取当前卡片的投递阶段和结束结果。用户明确要求时，模型可提出四种阶段之一；对话区展示修改前后，只有用户确认才写入 applications 修订与历史。跨页变更使旧建议失效；阶段修改不创建 Job 正文版本、不推断未被明确确认的拒绝结果。详情见 [投递与求职记录契约](docs/current/JOB_APPLICATION_STAGES.md)。本轮仅合成模型输出和隔离浏览器路径验收，不将其视为真实模型质量结论。

## 2026-09-25：Web、Skill 与 GitHub 同步发布

已按用户要求将个人上下文、统一求职记录编辑、图片输入与动效、对话进入确认和公开实时反馈同步到官网、本机 Skill 与 [GitHub 当前仓库](https://github.com/orocoa/Ariadne)。中英文 README、发布说明及安装指令使用当前仓库，旧安装链接仍兼容。官网 Pages `47227fc3`、API `0070f6ad-1107-4aee-9e55-b37baa112350`；[完整安装包](https://github.com/orocoa/Ariadne/releases/tag/skill-20260925-context-journal-ui)绑定源码 `b4f995f`。用户资料不跨端上传或自动同步，本机需重开以加载新版。线上检查和本地 128 项回归通过；GitHub 自动回归两组启动测试超时（126/128），尚未完成 CI 全绿验收。详情见状态记录。

## 2026-09-25：进入对话的连续过渡

「同意并进入对话」由整个说明面板淡出，再让历史、引导和输入框共同渐入；不再只动画输入框。共用六入口保持过渡期间的输入门禁，结束后聚焦；设置/范围变化和页面离开可取消，减少动效时直接进入。已完成浏览器与边界回归，本机文件已更新；尚未重启锁屏中的原生应用。详见 [实时反馈契约](docs/current/CONVERSATION_LIVE_FEEDBACK.md)。

## 2026-09-25：模型动态与逐段回答

用户要求关闭编号式「本轮过程记录」及 token/校验说明。六入口改为直接显示真实模型活动、公开思路说明和逐段突出的回答；只转发思考/网页工具的生命周期，不显示内部推理、思维链或工具参数。回答以增量传输，避免逐字更新重复传送整篇。浏览器与协议回归通过，本机文件已更新；后端更新需重开 Ariadne 生效，锁屏期间未强行重启。详见 [实时反馈契约](docs/current/CONVERSATION_LIVE_FEEDBACK.md)。

## 2026-09-25：了解我与职位概况的进入确认

从资料库点击「了解我」「了解职位概况」时，每次先显示发送范围、当前模型与费用说明，确认后进入对话；左上角复用返回图标回对应资料库。先前保存的同意不跳过本次入口，返回缓存页也重新展示；确认本身不发送请求。其余对话的既有同意范围不变。本机静态文件已更新；锁屏期间未重启或完成原生窗口复验。详见 [对话实时反馈契约](docs/current/CONVERSATION_LIVE_FEEDBACK.md)。

## 2026-09-25：求职记录快速输入与动效

求职记录不再要求填写发生日期：新记录自动保留创建日期，旧记录日期与顺序保留。图片支持拖拽、粘贴和点击选择，统一校验并保留原图；添加更多/删除使用淡入展开、淡出收起，尊重减少动态效果。复用统一编辑、保存和取消，本机 Skill 已更新，未发布公网。详见 [投递与求职记录契约](docs/current/JOB_APPLICATION_STAGES.md)。

## 2026-09-24：职位详情统一编辑与保存

用户要求备注、求职图文记录与职位正文统一编辑。详情默认只读，点击「编辑」后一次修改，底部统一「保存 / 取消」；备注按行展示，求职记录支持多组图文、编辑、删除及缩略图放大，按发生日期从早到晚排列。跟进数据迁入共用内容库后，与职位修改使用同一事务提交；旧库、旧记录和原图保留，跨页冲突拒绝覆盖。仅更新本机 Skill，未发布公网。详见 [投递与求职记录契约](docs/current/JOB_APPLICATION_STAGES.md)。

## 2026-09-24：真正连续反馈与进入对话前确认

用户要求看到生成中的公开文字，而非固定阶段提示后直接出现结果；六个对话入口采用真实增量预览、可平滑展开的过程记录和波动圆点。传输/模型/费用说明改为进入对话前确认，范围或运行设置改变需重新确认；附件与人工保存边界保留。本机执行升级为隔离 App Server，用户明确同意使用独立 Ariadne Codex 目录并已自行完成官方登录，不读取或复制原 Codex 登录/规则。隐藏推理不展示，真实公开文字才实时转发，不伪造进度；详见 [实时反馈契约](docs/current/CONVERSATION_LIVE_FEEDBACK.md)。

本轮已发布官网、`skill-20260924-streaming-v2` 完整包，并备份更新本机 Skill；实际模型/浏览器证据、生产版本和资料完整性见 [状态记录](PROJECT_STATUS.md)。只展示当前连接的能力说明，网页版 API 不展示本机 Codex 搜索提示。

## 2026-09-24：允许公开搜索，个人经历保持独立

用户要求对话允许联网，但网上信息不能混淆个人经历。本机 Skill 的 Codex 普通对话已按需开放公开搜索；外部来源随对话单独标记，搜索回合由代码禁止提交个人资料、记忆和职位修改。导入/阶段性理解仍只依据提供的材料；网页版 BYOK 未接入搜索。查询隐私的指令边界、模型引用与真实事件的区别见 [公开搜索契约](docs/current/CONVERSATION_PUBLIC_SEARCH.md)。

2026-09-24 跨职位个人上下文修复：用户指出“了解工作”不知道“关于我”已保存的信息。根因是职位概况将分别建模误设为 Job-only 读取范围，并被后端、提示词和测试固定。现 DISCUSS 复用当前 Candidate、已保存补充及个人理解，与当前职位集合一起回答；纯职位摘要保持独立，保存权限不扩大。增加双域版本失效、读取覆盖、旧同意失效和本轮公开链接受控读取。已更新本机 Skill 并重开，资料原件与历史保持；未发布公网。详见 [跨职位对话契约](docs/current/ARIADNE_JOB_OVERVIEW_V1.md)。

2026-09-21 最新对话附件发送回执修复：此前附件只在模型完整回复成功后才从 composer 清除，长时间生成期间已发送的图片仍停留在输入框，用户无法区分“待发送”与“已发出”。现在共用 Turn Transport 在网络请求成功创建后触发 dispatch：六个对话入口立即移除本轮附件预览并显示“本轮已发送 N 张图片/个附件”的等待回执；若网络、模型或结果校验失败，原附件恢复并要求重新确认后重试。原件本机保存、当前轮用途、领域隔离与人工保存边界不变。

2026-09-21 最新职位来源链接修复：职位导入的知情确认阶段会把当时填写的链接持久化到来源归档，但模型执行此前重新读取了未带链接的文件选择对象，使正式 Job revision 的 `source_url` 为空，卡片因此隐藏链接。现在执行复用同一份 consent source snapshot；对于已发生的数据，卡片只按完全一致的有序 `source_document_ids` 从来源归档回溯链接，不改写确认版本，也不会借用其他职位的 URL。当前 Skill 工作区实际恢复出「AI 产品工程师（协同办公创新方向）」的 `jobs.mihoyo.com` 职位链接。

2026-09-21 最新对话附件架构整合：用户看到 DOCX 与总 spinner 后误以为文件未发送；实际该轮在约 67 秒后 `SUCCEEDED`，原件已写入当前 Skill 工作区，并生成 5 页可下载 PDF。根因是附件准备、落盘、请求、解析与收尾分散在四个领域调用中，界面无法表达真实阶段。现新增共用 Turn Transport，Candidate、Job、个人理解和职位概况统一走「能力检查 → 读取校验 → 本机保存 → 发送并等待模型 → 完成/失败」，页面不再各自调用附件 `prepare/finish`；领域 schema、Working/Proposal、只读范围与人工保存仍独立。架构见 [共用对话 Turn 架构](docs/current/CONVERSATION_TURN_ARCHITECTURE.md)。

2026-09-21 最新 Skill 对话与职位导入修复：粘贴职位中含 Emoji 等 Unicode 扩展字符时，浏览器原按 UTF-16 code unit 计数、Python 后端按 Unicode code point 校验，导致请求在模型调用前误报 `MODEL_FAILED`；现已统一为 code point 计数与切片，并补充明确的长时间等待状态。Skill 原生窗口改为 1392×944、最小 1080×720，保持既有长宽比；Skill 详情浮层使用 92% 宽度，资料与对话保持左右双栏。Candidate、Job、关于我的共用对话将说明区纳入可滚动历史、移除每轮耗时和底部多余留白，保存待回复用户消息；进行中的嵌入对话关闭后继续保留，返回同一卡片恢复原界面。「整理为个人补充」改在同一详情浮层内淡出切换，可返回原对话，不再硬跳转清空界面。

2026-09-21 最新本机资料迁移：已修复 Ariadne Skill 同名旧构建可能被 Launch Services 误选及 Skill 工作区绑定路径不一致的问题，新增校验原件 hash、逐文件 SHA-256 和目标冲突拒绝的显式工作区导入。已确认的浏览器工作区 `cb3634b814d142b2a45f7f093397d092` 完整复制到独立 Skill 文件库，源目录与旧 Skill 工作区保留；Skill 显示 18 张个人卡片和 5 个职位。随后仅清理 egolite/Chrome 的 Ariadne 本地与公网 origin，未处理浏览历史、密码或其他网站数据。

2026-09-20 最新内容更新：安装窗口复制按钮保留原坐标与尺寸，改为透明背景、700 字重；三个步骤标题改为纯黑。中英 README 以同一份已核实实现更新 Web/API 与 Skill/Codex 架构图，并说明从本地网页验证业务、独立安装包降低环境门槛，到 Skill 复用 Codex 入口的动机及依赖/同步限制。旧图和历史原地保留，新的 [双语图与回执](docs/architecture/archify/2026-09-20-web-skill/review.json)绑定源码 `a4fc904`。

2026-09-20 最新入口与分发更新：用户要求将安装集成到「通过本地 Agent 使用」窗口，直接「复制安装指令」，不再单独跳安装页。已上线 [同页安装窗口](https://ariadne.kai-nex.com/#skill)，旧链接回到该窗口；完整 Skill 包发布于 [GitHub Release](https://github.com/KAI-NEX/Ariadne/releases/tag/skill-20260920-102511)，源码同步现有仓库。Pages `6062f6c7`，安装指令固定 GitHub 版本与 SHA-256；保留先安装再调用、本机直达工作空间及两端独立存储。

2026-09-20 最新正式发布：按用户要求，Web / Skill 双端架构和「先安装、再调用」引导已上线 [官网](https://ariadne.kai-nex.com) 与 [安装页](https://ariadne.kai-nex.com/install)。Pages `a56a6d36`、API Worker `4ab1078e-7937-4687-a827-ddba54044bc5`；公开 Skill 包包含本机 Codex、直接进入工作空间与本地文件库。网页版仅用 API，本地 Agent 入口只提供说明，两端不配对、不自动同步资料。线上桌面/手机、API 边界、复制指令与公开包完整性已核对；本轮未重新执行真实模型，未 push Git。下列旧条目的“未部署”、Skill 模型选择页或配对描述保留为历史，以本条和 [双端架构](docs/current/TWO_PRODUCT_ARCHITECTURE.md) 为准。

2026-09-20 最新架构决定：用户确认拆分 Web 与 Skill 两种产品。Web 只连接 API、使用浏览器内容库，本地 Agent 入口仅提供安装说明；Skill 使用本机 Codex 与固定文件库，直接进入工作空间，不再显示模型选择首页。共用页面与领域/保存契约，独立产品配置、启动、transport 和存储路由；旧网页配对退出当前入口，源码与原资料保留。已更新本机 Skill，完成真实 Codex 对话、两端浏览器与原生窗口验收；未部署公网。详见 [双端架构](docs/current/TWO_PRODUCT_ARCHITECTURE.md)。

2026-09-20 最新范围决定：用户要求先跑通 Ariadne Skill → Codex → 保留现有页面 → 本地资料保存；反馈更新暂不扩展，通用长期档案契约与其他 Agent 适配不作为本阶段前置条件。同机后续 Agent 可复用资料根目录与明确的工作区身份，但连接 adapter、能力验证、上下文范围及人工保存规则仍须适配；指定目录不等于跨机同步。当前页面调用本机 Codex CLI，不接入唤起它的聊天历史。已完成本机合成 PDF 导入、确认保存、真实对话及服务重启恢复验收，并修复候选人对话保存层的旧 Provider 硬编码；详见 [Skill 指南](docs/current/ARIADNE_SKILL.md)。

2026-09-20 最新交付更新：官网已正式改为[安装 Ariadne Skill](https://ariadne.kai-nex.com/install)，复制指令给 Codex 安装，旧下载页跳转；公开包和本机 Skill 同步到当前资料库编辑/删除、独立窗口与原图标版本。按用户要求将本机旧 Ariadne.app 移入废纸篓并移除其 Dock 固定项，旧资料保留、未迁移。日常在 Codex 输入 `$ariadne 打开 Ariadne`，独立窗口显示运行选择页，关闭最后窗口停止服务。其他电脑首次安装仍未实机验收；历史未发布/保留旧 App 描述以本条为准。

2026-09-20 后续交互决定：用户明确不要 Codex 内置浏览器，本地 Skill 默认打开独立 Mac 窗口，关闭最后窗口即停止其专属本地服务，资料保留。已复用现有原生窗口并完成实际关闭/重开验收；首次需要 macOS 14+、Python 和 Apple Command Line Tools，按本机芯片编译缓存窗口。原浏览器入口保留为显式备选，旧 App 和各 profile 的资料不自动迁移。

2026-09-20 用户将本地交付改为 Codex 可直接打开的 Ariadne Skill，并保留完整的运行选择页面。默认 Skill 在固定 8766 启动同源完整网页，资料保存在独立目录；可选配对模式供公开网页版连接本机 Codex。已同步两个资料库的编辑/删除及页头布局，独立包、本机安装与浏览器验收完成，旧 App/源码/资料保留。尚未发布新公网下载包，不自动迁移旧 origin 或账户资料，不声称所有 Agent/操作系统已支持。安装与边界见 [Ariadne Skill](docs/current/ARIADNE_SKILL.md)。

更新：2026-09-18。用途：新任务的项目入口与稳定产品约束；当前实现进度和验收结果由 [PROJECT_STATUS.md](PROJECT_STATUS.md) 记录。本文依据用户本次明确的产品目标整理，择要保留已有项目决策，不复制个人背景或学习记录。

## 2026-09-17：使用与发布方向

本机日常使用优先，项目所有者首选自己的 Codex，同时保留 DeepSeek。后续公开用户自带 API 凭据，或下载后使用自己的 Codex；不共享开发者账号或代付 Key。每次打开入口先选择模型或本地运行，点击继续后进入工作空间；保留已保存的连接配置。当前已补齐本机 DeepSeek 自带 Key 与原件按记录读取，并新增网页专用 WSGI 执行入口及会话/凭据隔离；公网托管、真实 HTTPS 与跨电脑分发验收仍待完成。详见 [本机与网页运行方向](docs/current/LOCAL_AND_WEB_RUNTIME_DIRECTION.md)，不能把此方向记录或本机验收视为已上线。

2026-09-17 最新域名决定：`https://ariadne.kai-nex.com` 直接进入模型选择和应用，取代此前官网与 `web` 子域拆分方案。腾讯负责域名解析，用户尚无服务器；当前只完成可部署代码和本机预览，不表示公网已上线。部署与 DNS 步骤见 [网页部署](docs/current/WEB_DEPLOYMENT.md)。旧双域名条目保留为历史记录。

2026-09-18 用户要求开放 Gemini 与千问。新增 Gemini 3.7 Flash、千问 Qwen 3.8 Max（百炼北京地域）的请求自带 Key 与六个领域 adapter 接线，使用官方固定 OpenAI 兼容端点；用户通过完整两页合成 PDF 读图/JSON 验证后可选择。DeepSeek/Codex 与用户既有选择保留，不改变开发审阅模型。离线领域回归不等于真实业务回答质量；API 账号、额度及地区要求仍须实际连接验证。[逐步部署教程](docs/current/WEB_FIRST_DEPLOY.md) 以腾讯新加坡 Ubuntu 24.04 为例，未购买或部署服务器。

## 1. 要解决的问题

2026-09-18 正式发布更新：用户授权后已部署 Cloudflare Pages `ariadne`（`ariadne-7pc.pages.dev`）和绑定的 Python Worker `ariadne-api`；腾讯新增 `ariadne` CNAME，`https://ariadne.kai-nex.com` 已 Active / SSL enabled。公网浏览器真实 DeepSeek 图片连接和两页合成简历分析通过，返回 3 条待审阅资料，重复请求命中缓存。网页仍属预览阶段，但按用户最新要求不显示全局提示行；资料按浏览器保存；Gemini/千问真实账号、跨地区网络、公网 Codex 配对和安装包公开下载仍未验收或发布。无须购买服务器，未变更整个域名的 DNS 托管或现有邮箱记录。

2026-09-18 发布方向更新：用户不购买服务器，采用 Cloudflare Pages + Python Workers，并明确网页必须免安装使用自带 API Key。已完成可部署预览、浏览器完整 PDF 转图、复用领域处理的 Worker 与防重复付费摘要；真实 DeepSeek 经本机 workerd/Pages 服务绑定验证图片和两页合成简历分析。没有公网部署、DNS 修改或 Gemini/千问真实账号验收。安装包继续作为本地 Codex/较大文件路径；当前范围为 macOS Apple 芯片。执行新的 [Cloudflare 部署教程](docs/current/CLOUDFLARE_DEPLOYMENT.md)，旧腾讯服务器教程只作备选。

品牌名称：英文名 **Ariadne**，中文名 **衡**（用户于 2026-09-09 再次确认）；产品中文名不使用英文音译。中文表达沿用引导职业探索的意图，以衡量、判断与取舍传达更贴近中文文化的内涵；介绍页文案是本次整理，不声称逐字恢复此前命名讨论。

用户有自己的经历、作品与资料，也有想接近的职位。Ariadne 的核心是让 AI 先理解个人资料，再理解职位描述，在此基础上帮助用户看清已有支持、待澄清之处和下一步可做的事。

产品主线：

1. **理解个人资料**：从用户提供的资料中理解经历、负责内容、成果与证据，保留冲突和未知，由用户校准。
2. **理解目标职位**：从职位原文中理解职责、要求、背景与不明确之处，不将页面导航、招聘宣传等当作岗位要求。
3. **建立有依据的关联**：针对用户选择的职位，说明哪些要求有资料支持，哪些还缺信息，以及差异属于能力、证据、表达还是相关性问题。
4. **帮助用户逐步行动**：围绕目标提出必要的澄清、证据补充或材料调整建议；用户决定是否行动及保存哪些变化。

这是产品方向，不表示完整行动闭环已经实现。“分别理解”指 Candidate/Job 各自有清晰的语义和来源，不规定固定模型调用次数，也不妨碍后续关联分析。

## 2. 保留的项目决策

| 决策 | 对产品的意义 | 本仓库依据 |
| --- | --- | --- |
| 有来源的理解与最少必要修改 | AI 可以解释和推理，但不能为了迎合职位补造个人经历；不需要修改也是有效结果 | [V2 产品架构](docs/architecture/PRODUCT_ARCHITECTURE_V2_FINAL_CONSOLIDATION.md) §A、§N |
| Candidate 与 Job 分别建模，再关联当前上下文 | 职位要求不反向变成个人事实；对话与建议使用当前有效版本 | [Candidate 对话契约](data/candidate_conversation_contract_v1.json)、[Job 智能契约](data/job_intelligence_contract_v1.json) |
| Working 与确认数据分离 | 模型的建议可以被讨论、编辑、拒绝；Human Save 才推进确认版本 | [持久化 schema](data/truth_persistence_v1.schema.json)、[当前状态](PROJECT_STATUS.md) |
| 来源先保存，派生内容可追溯 | 理解结果、来源恢复与后续校准能回到同一份原始材料 | [来源存储实现](public/raw-source-storage-domain.js)、[共享来源入口](public/source-input-domain.js) |
| Runtime 按模式、操作、能力分别解析 | 图片导入和对话可能需要不同能力；失败不能冒充成功或静默换成 Local | [能力解析实现](public/runtime-capability-gate.js)、[Runtime 合同](docs/current/ARIADNE_RUNTIME_EXECUTION_CONTRACT.md)、PROJECT_STATUS 的 2026-09-04 routing 条目 |
| 共用交互，保留领域边界 | Candidate/Job 的输入、等待、编辑、保存体验一致；各自的语义与修改权限明确 | [ProductShell](public/product-shell-domain.js)、[共享交互审查](docs/current/ARIADNE_GLOBAL_INTERACTION_PARITY_AUDIT.md) |
| 结构正确与理解正确分别验收 | schema、回归和 HTTP 成功不能单独证明模型回答贴合当前材料 | [技术证据](TECHNICAL_EVIDENCE.md)、[当前状态](PROJECT_STATUS.md) |

这些内容从旧工作区的项目规则、Ariadne 专属决策及本仓库现有契约中重新整理；相关依据已在本仓库，不引入旧工作区作为必需读取路径。未整份导入系统 AGENTS、全局决策日志或其他项目记录。

2026-09-12 用户确认内容简化方向：人通过卡片浏览编辑，AI 按范围读取多份 Markdown，保留原始文件及来源关系，并要求保留现有功能。目标收敛为文件与内容库、卡片界面、上下文准备、模型执行、修改保存五项职责。当前已完成完整证据优先、小集合职位单次对话及 Markdown 主存储接线：本机真实文件库、网页端同格式浏览器库，卡片从同一文档产生投影，旧 IndexedDB 留作备份且不双写。迁移按 origin/工作区首次访问触发：前次 egolite profile 的 376 条既有记录已逐条核对；2026-09-13 修复历史来源 hash 表示误判后，实际报错的 Codex 内置浏览器主库 1,854 条迁移并通过磁盘校验。两者同为本机 8000，但 profile 独立，不能把一个的验收视为另一个已迁移。首页与资料库复用集合读取、存储错误共用呈现，原件与领域完整性约束不放宽。职责取舍见 [内容架构复核与简化](docs/current/CONTENT_ARCHITECTURE_SIMPLIFICATION.md)，实际布局、恢复及验收见 [Markdown 内容库](docs/current/MARKDOWN_CONTENT_STORAGE.md)。

## 3. 当前实现与边界

- 2026-09-12 用户将 Local 简化为原件保存：不再在正常导入中执行本地识别、OCR 或确定性结构化。Candidate/Job 共用原件归档，保留文件、hash、来源链接和职位材料顺序；接入可用 AI 后由用户选择已存原件、确认传输再分析。历史卡片/草稿/对话和学习模块保留；Model 输入准备仍可本地读文档或完整转图。随后 Markdown 内容库迁移已完成代码和合成验收，见上述存储契约。

- 2026-09-09 已实现 Codex 本机直连及 Web 配对连接器，当前验证组合为 `codex / gpt-5.6-sol / CODEX_EXEC_JSONL`。两种方式均经本机客户端向 OpenAI 推理，保持 Model、来源完整性与人工保存边界；公开 HTTPS origin 的本地网络授权仍待实际部署验收。启动、配对与限制见 [Codex 运行指南](docs/current/CODEX_RUNTIME_CONNECTOR.md)。
- 2026-09-08 用户确认模型接入最低要求：所有 Model 操作（包括纯文字对话）只使用有明确图片输入和视觉 PDF 处理能力的多模态模型。PDF 可原生发送，也可完整逐页转图；仅 OCR/文本抽取、模型列表存在、名称含 vision 或一次文字连通检查都不能替代能力证据。未来 Gemini/其他 Provider 同样遵守此门槛，且须完成对应 Ariadne adapter 验证后才能执行。
- 当前基础为 Candidate/Job 导入、Working、人工保存、确认版本、详情编辑、来源恢复和范围明确的模型对话；具体已验收路径与故障以 PROJECT_STATUS 最新条目及对应证据为准。
- 新增「个人理解」入口：跨资料派生理解、用户审阅保存的个人补充、当前指纹绑定的缓存及有界上下文已实现；个人/JD 对话读取当前有效补充。原始事实、用户自述与模型推断分层，仍依赖底层模型，不声称完全理解用户。详见 [持续个人理解 v1](docs/current/ARIADNE_PERSONAL_UNDERSTANDING_V1.md)。
- 理解入口分工：个人「了解我」专注过去项目、经历、职责、决策与做事方式；职位「了解职位概况」独立汇总并讨论当前全部 JD，不读取个人资料或个人记忆，不修改确认资料。个人与单个职位的关联分析保留在该 JD 详情。详见 [职位概况与范围契约](docs/current/ARIADNE_JOB_OVERVIEW_V1.md)。
- Candidate Material Detail 的当前版本/同源 Working 同步，以及 Local/Model 隔离，是已修复且有回归覆盖的行为契约；后续改动应保留。
- Job 已有基于 Candidate 上下文的讨论、差距分类和建议契约；这不等于已完成建议执行、成果反馈及持续进展闭环。
- 完整目标推进、建议落实后回写 Candidate、自动简历优化与投递等后续能力，需在具体任务中定义和验收。本文整理不启动 J2，不改变当前功能或 Provider。
- 本仓库维护产品、代码、契约、测试与技术决策。个人学习日志、课程路线、能力掌握等级、全局职业综合和其他项目档案不纳入本次整理。产品可以给出职位相关的能力提升建议，这不要求复制开发者的个人学习档案。

## 4. 文档职责与适用顺序

项目文件不能覆盖当前用户明确指令，也不能把历史授权作为新的执行许可。

| 需要了解什么 | 入口 |
| --- | --- |
| 如何在本仓库工作 | [AGENTS.md](AGENTS.md) |
| 产品目标与稳定约束 | 本文件 |
| 当前完成到哪里、验证过什么 | [PROJECT_STATUS.md](PROJECT_STATUS.md) 最新适用条目 |
| 某项修复的依据、失败与证明 | [TECHNICAL_EVIDENCE.md](TECHNICAL_EVIDENCE.md) 及对应测试 |
| 实际数据结构和操作边界 | `data/` 中契约/schema，以及 `public/`、`src/` 中对应实现 |
| 历史设计取舍和阶段交接 | [架构目录](docs/architecture/)、[NEXT_PHASE_HANDOFF.md](NEXT_PHASE_HANDOFF.md) |
| 迁移位置、数据与运行验收 | [RELOCATION_HANDOFF.md](RELOCATION_HANDOFF.md)、[RELOCATION_MANIFEST.md](RELOCATION_MANIFEST.md) 最新记录 |

架构文档保留稳定设计约束；其中带日期的实现状态、next milestone、模型推荐和一次性执行指令属于当时快照。后续有明确记录的用户决策可修订对应约束；单凭较新的代码或 PASS 文案不能推翻行为契约。遇到实质冲突先核对相关决策、实现与证据，再作最小处理。

无需每次加载所有历史文件。按任务选择契约与必要来源，减少无关上下文对当前判断的影响。

## 5. 开发与运行入口

- 后端：根目录 `app.py`，Python 标准库；前端：`public/` 中原生 HTML/CSS/JavaScript；领域及 Provider 后端：`src/`。
- 持久化：本机正常入口使用 `data/workspaces/<workspace-id>/` 的 Markdown/原件及状态文件；网页端使用浏览器 Markdown 库。origin 的 localStorage 保存工作区 ID，旧 IndexedDB 保留迁移备份；legacy SQL 数据仍原地在 `data/job_radar.db`。改变 profile、host、端口或清空映射不自动关联旧磁盘目录，恢复需核对身份。
- 从仓库根启动：`PYTHONDONTWRITEBYTECODE=1 python3 app.py`，正常入口为 `http://127.0.0.1:8000/`。重启前先核对占用端口进程的 cwd 与身份。
- Node 回归按文件运行：`node tests/<name>_regression.mjs`；Python：`PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 python3 tests/<name>_regression.py`。跨语言 route suite 必要时设置 `ARIADNE_NODE_BINARY` 为现有 Node 可执行路径。
- 最新已记录的自动回归基线为 61 Node + 35 Python（2026-09-12）；计数会随项目变化，应以实际文件与运行结果为准。常驻 stub server、可选私有 fixture 和可选 smoke 不计作默认回归套件。
- 本机运行继续使用 Python 标准库与原生前端；网页部署新增 `deploy/requirements.txt` 固定 Gunicorn 版本及 Docker/Poppler 配置。不要为文档整理安装依赖或引入新框架。测试日志、编译产物和私人截图保存在忽略的 `.cache/` 或仓库外，不加入 Git。
