# AI Job Radar｜Phase 4 Status

## 2026-09-29 — 多 agent 审核后的可靠性与负载优化（本地完成）

- 用户在只读审查后明确授权实施优化；三名 Astra / ultra agent 分别处理前端、运行成本及数据/架构边界，并交叉复核。开发模型与产品模型选择保持独立。实现与未完成项详见 [优化记录](docs/current/RUNTIME_OPTIMIZATION_20260929.md)。
- 已减少公开流式全文重传、预览反复解析、PDF 重复转图、附件重复 base64 上传、记录/图片全库读取、历史节点和 PDF 导出重建；补齐整组资源预算、取消传播、存储异常收束、草稿/冲突保护、旧提案原子条件、Web 显式续期与资产版本缓存。业务输出、完整 PDF、原件、人工保存和既有模型资格/同意机制保持。
- 相同合成输入：6,000 字说明的 NDJSON 从 21,686,493 B 降到 111,687 B；两页 PDF 从两次转图 / 1.1615 s 降到一次 / 0.6293 s；1,000 条记录中当前 Job 100 条、各一张图片的读取从 301 请求 / 135,361,847 B 降到 2 请求 / 665,254 B。均为局部可复现基准，不代表总体模型速度、生产延迟或峰值内存。
- 完整本地离线回归 141/141 通过（包含此前未跟踪的旧 Mac 启动测试）；VI 与 diff 检查通过。egolite 验证关键行为，截图 CDP 超时后改用已安装 Chrome；桌面/手机、草稿与光标、冲突、历史节点、迁移、两次续期及真实三页 PDF 下载通过，控制台/页面错误和 Provider 调用为零。CI 增加固定 Playwright 浏览器验收及证据上传，尚无本轮远端 CI 结果。
- 三种候选包在 `work/optimization-20260929/release-20260929-153146/`；234 个 Skill runtime hash、必要模块一致性与资产 manifest 通过。真实本地 Workerd/Pyodide health/runtime 200，合成无效 POST 返回领域契约 422 且未调用 Provider；Pages 实取缓存头符合预期。候选包来自基线 `a16e004` 加当前改动，不冒充干净发布版本。
- 新增 8 个语义评测情景与人工回执校验器；本轮真实模型评测仍为 NOT_RUN。大型 `v1-pages.js` 未整体拆分，查询仍做一次完整 hash 扫描，草稿仅页面内保留，生产压力及全新机器安装未验证。无私人资料、真实付费模型调用、已安装 Skill 替换、push 或公网部署。旧产物、QA 与无关未提交内容保留。

## 2026-09-28 — GitHub、网页、完整 Skill 统一公开发布

- 按用户明确授权提交、推送并发布。先前五个本地提交已进入 GitHub；`f954c71` 更新中英文 README、CHANGELOG 与 Skill 升级指南，`126c775` 修复固定回环服务启动的反向 DNS 依赖。公开产品源码固定 `126c775150370c25bbdbd9cf8ad1fe9209936f21`，后续回执提交仅更新文档。
- 发布 [skill-20260928-workspace-changes](https://github.com/orocoa/Ariadne/releases/tag/skill-20260928-workspace-changes)，tag 直接指向上述源码。完整 `Ariadne-Skill.zip`：2,893,474 bytes，SHA-256 `4a61ed3cbd4fb4fe63b5f197df66af6174a33c77890d68a05d9f42e68a4839cf`，232 个运行文件，`includes_working_changes=false`。无凭据或用户资料；原 Release 保留。
- 同源 Cloudflare Pages `eaf6467c`，API Worker `a97ce0f0-a935-436e-9f3e-63f586c91ec8`，正式入口 https://ariadne.kai-nex.com。共用 154 个静态文件、72 个服务/契约文件逐个 hash 一致；图标、本机启动器、旧 SQLite 和产品模式配置保持必要差异。
- [GitHub CI 36440876205](https://github.com/orocoa/Ariadne/actions/runs/36440876205) 全部通过：129/129 发布源码回归、公开文件检查、VI 与全历史 Gitleaks。旧失败 `36439793318` 保留；修复后远端两组启动验收恢复，不放宽超时或跳过断言。工作目录另有未跟踪旧测试，130/130 通过；不把其混入完整发布包。
- 公网实取 GitHub 与同源 ZIP、大小、SHA-256、内部 manifest 与 clean build 标记一致。27 个 HTTPS 路径包含全部变化静态文件、安装元数据、healthz、Web runtime 与 Job runtime signature；线上 Job adapter v13 / prompt v12，哈希匹配构建产物。egolite 验证安装指令绑定本次 tag/hash，1280×900 与 390×844 无溢出；截图已检查，测试空间已关闭。证据保留 `.cache/release-20260928/`。
- 对话语义与保存的真实合成执行/浏览器证据沿用本轮变更集阶段记录；本次发布没有传输私人资料或额外调用付费模型。未新增所有 BYOK Provider、独立新机器、压力或所有模型强度的验收。本机已安装产品功能此前已生效；本次公网包另含启动修复，不在用户当前窗口运行时替换代码。
- 原始资料、旧包、QA 与无关未提交文件保留。只提交本阶段源码/测试/说明及此回执，未纳入私人工作区、历史 Mac 启动器草稿或临时产物。

## 2026-09-28 — 发布准备与本机启动修复

- 用户授权同步 GitHub、网页和完整 Skill；已推送此前五个功能/记录提交及中英文 README、CHANGELOG、升级说明（`f954c71`）。从干净源码构建，129/129 离线回归、VI、公开文件检查通过。
- GitHub `36439793318` 仍重现旧的 desktop_lifecycle / skill_bundle 启动超时（127/129），未发布该候选包。HTTPServer 构造会调用 getfqdn；既有 storage 测试也已绕开此无关查询。新增共用 LoopbackHTTPServer，使正式本机启动不依赖反向 DNS，拒绝非回环监听；不放宽 10 秒就绪断言或跳过生命周期测试。原日志不足以断言 DNS 是唯一耗时来源，远端复验另记。
- 新回归模拟 DNS 不可用，真实请求/响应、端口边界通过；原退出/重开/端口冲突/父进程管道/信号/资料保留覆盖保持。工作目录 130/130 通过（含未跟踪旧测试，发布源码为 129 组）；无关文件保留。QA 在 `.cache/release-20260928/`。

## 2026-09-28 — 对话完整同步与原子变更集（本机已更新）

- 根因是读取上下文缺少备注/记录、输出协议只有一个 `job_edit`，且本地关键词控制正文修改。改为声明式目标契约和整组 `changes`：正文五类字段、投递阶段/结果/备注、记录追加/更正/移除；模型理解请求的关联内容，代码仅负责领域权限、长度/枚举、引用及版本一致性。架构与演进约束见 [工作空间变更集](docs/current/JOB_WORKSPACE_CHANGE_SETS.md)。
- 新增模型安全的跟进上下文（最多 40 条完整记录/24,000 字，并显式报告覆盖；不发送记录数据库 ID 或图片正文）；进入对话说明与 Job 同意指纹同步更新。事件归求职记录，长期摘要归备注；不把用户招聘经历写成职位要求。搜索过的回合也禁止新 `changes` 提案，Working 职位无此权限。
- 提案关联分析/用户消息，展示所有修改及阶段切换清空旧结果的连带变化。成功回复与提案一起持久化，确认决定与正文/状态/记录复用同一内容库事务；检查 Job/application/journal 版本、职位移除、已处理决定及本地手工编辑状态。失败/冲突整组不保存，更正/移除保留历史、图片和原件。旧单字段提案兼容保留。
- 130/130 离线回归、VI、diff 与 Skill 打包验收通过。真实 GPT-6-Astra/high 的 6 个合成场景均通过：状态+经过、已结束补经过、更正记录+备注、只讨论且忽略材料指令、从对话历史补漏、已有记录不重复。未以测试替身冒充这些真实调用，也未使用真实用户资料。
- 隔离 Chrome 从输入/提交到整组审核/确认/刷新验证通过：状态和记录同时出现，旧备注保留，Job 版本未增加；1280/390px 可读、无横向溢出。浏览器回放上述真实合成结果，没有再次调用 Provider。ego-browser 及 Chrome 有间歇性脚本未初始化现象；检查完整依赖、修正验收脚本对进入动画完成的等待后通过，运行与截图保留 `.cache/job-workspace-changes-20260928/`。
- 已完整备份本机 Skill，231 个运行文件逐一核对，744 个既有工作区/绑定文件 hash 未变，doctor 就绪；正常重开原生窗口后显示原有 18 张个人资料卡片和 6 个职位。仅本地安装；不改真实职位记录，不发布公网或 push。原有项目文档、Mac 启动、handoff、架构 QA 与其他未跟踪内容原地保留。

## 2026-09-28 — 卡片对话每次进入确认（本机已更新）

- 根因：之前仅整体个人/职位对话采用 per-visit 标记，四个卡片/工作区入口直接沿用持久化同意。共用入口现在统一要求本次进入确认；模型/强度/范围变化使本次状态失效，切回旧组合不能恢复旧进入许可。六页初始隐藏对话，脚本就绪后显示入口，保留连续进入动效和既有发送前检查。
- 保留中的详情 iframe 再打开时同步 resetVisit，不重载/清空历史或正在接收的结果；普通重渲染不重复要求确认。页面离开与浏览器缓存恢复也重置本次状态；确认按钮只进入，不调用模型。
- 130/130 回归、VI 与 diff 检查通过。egolite 使用合成卡片验证首次/重复打开、旧同意仍需确认、模型切换与切回；保留 iframe 路径以模拟执行状态消息验证，没有真实模型调用。初次 egolite 载入缺失脚本模块，刷新同一页面恢复；QA 保留 `.cache/card-entry-consent-20260928/`。
- 旧 Skill 已完整备份；230 个运行文件 hash 一致，726 个既有原件/历史/绑定文件 hash 不变。正常退出空闲工作空间并重开原生窗口，doctor 就绪。本轮仅本地提交与安装，未 push 或公网发布；无关改动保留。

## 2026-09-28 — Codex 多模型选择（本机已更新并重开）

- 根因是 Skill 目录、前后端资格门禁及 App Server 请求均固定 `gpt-5.6-sol`，菜单把低/中/高展示成型号组合。新增官方 `model/list` 发现与经验证资格的交集，模型和强度分组选择、点击「应用」保存；原偏好及历史快照不迁移。型号缺失/发现失败保留当前选择，不默认换成列表第一款。
- 当前账号 7 款：GPT-6 Astra/Sol/Luna、GPT-5.6 Sol/Terra/Luna、GPT-5.5。前六款最高 max，5.5 最高 xhigh；按每款实际 metadata 进一步收窄。Ultra 包含自动委派，仍禁用。所有实际请求、策略回执核验及结果身份使用冻结快照中的模型；六领域、来源与手动保存契约保留。
- 7 款均以 low 完成真实合成图片、完整两页 PDF 转图、结构化输出与隔离策略检查；另以 GPT-6-Luna/max 验证 `call_codex` 实际执行。没有使用私人资料，不把合成运输/视觉检查等同于每个推理档位或求职语义质量评价。
- 130/130 离线回归、VI、公开文件与 diff 检查通过。egolite 验证 1280/390px 菜单、保存/刷新、取消、不同型号档位、scope 隔离，以及模拟型号移除/503 保留选择。QA 和收据保留 `.cache/codex-models-20260928/`。
- 完整备份旧 Skill 后安装 230 个运行文件并逐一核对 hash；726 个既有原件、历史与工作区绑定 hash 不变。doctor 就绪，正常退出旧服务并重开原生 Ariadne，实际窗口已显示新模型菜单和原有资料。未更换用户当前模型；此轮没有公网发布或 GitHub push。无关未提交内容继续保留。

## 2026-09-28 — 职位对话修改投递阶段（本地代码验收）

- 职位对话增加当前卡片 applications 阶段上下文；明确修改投递状态时，模型输出 `application_stage` 待审核建议。对话不直接写入状态，确认后才在独立跟进记录中追加修订与历史；关闭时不推断具体拒绝原因。已有标题、公司、地点、摘要提案继续使用 Job 正文版本。
- 新增阶段建议的身份、四值枚举、修订冲突及已处理决定校验。确认/拒绝通过同一内容库事务记录决定；确认保留备注与求职记录，投递状态和旧结果历史仍可追溯。模型执行前后检查 application 修订，防止页面同时修改时产生过期建议。
- Job runtime、领域、应用状态及真实 HTTP/落盘事务回归通过；隔离 Chrome 使用合成职位完成进入对话确认、建议展示、人工保存、详情刷新，页面错误零。ego-browser 与初次 Chrome 加载有脚本资源返回 200 却未执行的间歇故障；隔离 Chrome 对每次加载检查必要模块并重开失败页后完成验收。截图与脚本留在 `.cache/job-stage-conversation-20260928/`。未调用真实模型、未改实际用户资料；真实模型对不同措辞的语义质量仍待实际使用观察。
- 桌面及 390px 提案布局可读、无横向溢出；`check_vi.py`、Skill 打包回归与 `git diff --check` 通过。当前源码尚未发布公网。用户退出旧窗口后，已备份并替换本机 Skill，安装文件逐一与 `69409b6` 构建包核对一致；`doctor` 就绪，重新打开原生窗口后 8766 服务正常监听。备份保留在 `.cache/job-stage-conversation-20260928/installed-backup-20260928-195324/`。

## 2026-09-25 — 全端与 GitHub 同步（PUBLISHED；CI 启动超时待处理）

- 用户授权同步所有项目内容，包括 GitHub。将此前 5 次已验收修复及发布准备 `b4f995f11a8bba0bc41e99e9196d4bac53fa74fe` 推送 `orocoa/Ariadne/main`；保持原 `KAI-NEX` 历史记录与旧 Release，不修改个人资料、登录或无关未完成文件。
- 中英文 README、CHANGELOG 更新当前个人上下文、统一求职记录与对话体验。GitHub API 核实当前仓库名称后，安装 metadata 改用 `orocoa/Ariadne`；精确仓库白名单兼容原地址，仍拒绝其他所有者、任意下载路径和浮动 tag。新增兼容回归通过。
- 从干净 detached worktree 构建 Pages/Worker/Skill，同一源码 `b4f995f` 发布 Pages `47227fc3`，API Worker `0070f6ad-1107-4aee-9e55-b37baa112350`；[Skill Release](https://github.com/orocoa/Ariadne/releases/tag/skill-20260925-context-journal-ui)完整 ZIP 为 2,879,841 bytes，SHA-256 `80eb91046f6883dcdbe4ef7c0201bf22559c84f9c4f7775e4a06f7baa076be8a`。旧包、构建与 QA 均保留。
- 已重新下载 GitHub 包并检查 ZIP、大小和 hash；官网 `/downloads/skill.json`、同源 ZIP 及 28 个变化资源/API 健康与模式检查通过，静态内容与本次构建逐字节一致。核验遵循 Pages 的 `.html` 规范化重定向；未修改站点或资料 origin。
- 本地干净源码 128/128 离线回归、公开文件门禁、VI、安装包与 Worker dry-run 通过。GitHub [检查 36045362815](https://github.com/orocoa/Ariadne/actions/runs/36045362815) 为 126/128：`desktop_lifecycle_regression.py` 与 `skill_bundle_regression.py` 在 10 秒内未收到服务 ready 事件。线上检查通过不代表 CI 通过；本轮没有放宽测试或声称已修复该 CI 启动问题。
- egolite 核实官网安装指令引用当前 tag 与 hash；截图超时后使用隔离 Chrome 完成 1280/390px 安装窗口、无横向溢出、了解我/职位概况入口和渐入验证，无页面异常及模型请求。API 接收方使用隔离页面合成设置，无凭据、不认证真实模型质量。QA、下载校验和发布日志在 `.cache/sync-all-20260925/`。
- 已完整备份并用同一发布 Skill 更新本机，228 个运行文件 hash 一致、716 个原件/历史/工作区绑定文件 hash 不变。尚未收到解除锁屏确认，未重启或强行关闭原生窗口，需重新打开加载新版。原有两份项目文档历史改动、Mac 启动脚本、手工 handoff、work 与架构 QA 等未完成/未纳入发布内容继续原地保留。

## 2026-09-25 — 同意后平滑进入对话（VALIDATED；本机文件已更新）

- 共用六入口从仅输入框 240ms 动画改为整个说明面板淡出 240ms，历史/引导/输入框整体渐入 540ms 并轻移 8px，时长与曲线取已有 VI token；布局切换发生在透明时，面板高度稳定。
- 过渡中禁用重复确认、保持内容 inert 与 beforeDispatch 入口锁，完成后再恢复交互和聚焦。范围/模型设置变化、离开页面取消旧动画，保留本来已 inert 的内容；减少动效即时进入。确认不调用模型、不改变已有保存权限。
- 新增 motion 回归覆盖六表单、重复点击、双阶段门禁、两阶段中途换范围、同意失败、页面生命周期及减少动效；entry/consent/navigation/intro 四项既有回归与 VI/diff 检查通过。
- egolite 实际点击并确认最终解锁，但等待动画首次超时、截图接口继续超时；按既有规则使用隔离 Chrome。首轮发现资源初始化异常，未改动或过滤断言的复跑通过：了解我/职位概况两页阶段透明度、内容 inert、高度不跳、完成聚焦、运行设置变更取消、390px 无溢出、减少动效及无模型请求。截图、脚本和结果保留在 `.cache/entry-motion-20260925/`；不声称真实模型质量或原生窗口验收。
- 备份后更新本机 Skill，228 个运行文件 hash 一致，716 个原件/历史/工作区绑定文件 hash 不变。仍未收到解除锁屏的确认，未重启原生应用；重新打开后加载最新实现。无关未提交改动原地保留，未 push 或发布。

## 2026-09-25 — 移除技术过程记录、展示真实模型动态（VALIDATED；本机文件已更新，待重开）

- 六个对话入口移除「本轮过程记录」折叠列表、资料计数、服务端步骤、结构校验说明和 token 用量。底层校验、用量记录、来源与人工保存契约保留。非流式响应不模拟过程；失败由原有领域错误处理展示，临时回答撤回。
- 当前回合仅显示模型连接/回应状态、公开 commentary 的「思路说明」和实时回答。App Server 根据 reasoning/webSearch 的真实开始/完成事件转发 thinking/search/reading/finding 枚举状态；不转发 reasoning 正文/摘要、搜索词、URL 或工具参数，不增加模型权限。没有公开 commentary 的回合不编造思路说明；成功后仅可保留本页临时的公开说明，不持久化为事实。
- 新到文字用 VI focus 色与透明度短暂突出，按真实事件追加或替换，不用定时器假打字；减少动态效果时直接显示。移除 24 字缓冲阈值，新增 `preview_delta` 只传新增后缀，客户端有界重组；6,000 字逐字回归验证传输规模线性，避免累计全文超过流上限。旧 `preview` 累计格式仍接受。
- 7 项事件/HTTP Python 测试、6 项 App Server 隔离/生命周期测试、stream 与 turn transport Node 回归及 VI/diff 检查通过。新增生命周期不泄露私有文本、未知活动/额外字段拒绝、逐字增量/重复去除与无初始值增量拒绝。首次回归发现 emit 参数名与活动 kind 冲突，已修正并重验；另一次失败为 PATH 无 Node，使用已安装运行时后通过。
- egolite 合成流验证思考/搜索/公开说明/增量突出与无技术列表；截图接口超时后用隔离 Chrome 验证 1280/390px、无页面异常/横向溢出、减少动效、完整替换、成功收尾和失败撤回。截图与脚本在 `.cache/model-live-20260925/`；浏览器使用内存模拟流，未调用真实模型，不将其声称为实际模型质量验收。
- 已完整备份并更新本机 Skill，228 个运行文件 hash 一致、716 个原件/历史/工作区绑定 hash 不变。上一轮 Mac 锁屏尚未确认解除，未操作或强制关闭原生窗口；本轮 Python 后端更新需下次重新打开 Ariadne 才完整生效。未发布公网、未 push、未更换模型或修改用户资料，既有无关修改保留。

## 2026-09-25 — 了解我与职位概况每次进入确认（VALIDATED；本机文件已更新）

- 根因是共用入口以已持久化的精确模型/设置同意决定是否展示，重新打开时直接跳过。两页新增每次访问的进入状态：先显示范围与费用说明，点击确认才展现历史、建议和输入框；确认只进入，不调用模型。职位概况说明同时列出当前职位与个人资料，保持真实读取范围。
- 左上角复用现有 chevron-left 返回个人资料/职位列表并增加标题提示；不新造图标、不改变领域上下文。异步加载入口前隐藏对话内容，缓存恢复重新确认；beforeDispatch 也检查入口锁，已存同意无法绕过本次进入步骤。模型/推理设置变化、附件单轮同意与人工保存边界保留。
- 5 项 Node 回归通过：entry、consent、navigation、intro、turn transport；补充已存同意仍被入口锁阻止发送的断言。VI、diff 检查通过。egolite 实际两库入口→说明→确认→对话→返回→再次进入验证；另验模型设置变更与 persisted pageshow，确认未产生模型请求。快速连续导航曾有一次点击未跳转，读取实际页面后重新按当前入口验证通过，没有放宽检查。
- 截图接口 `Page.captureScreenshot` 超时；原生 Computer Use 报 Mac 锁屏，已请用户解锁。本轮未取得新的原生截图或移动端视觉证据，不将 DOM 检查称为视觉验收。合成 QA 在 `.cache/understanding-entry-20260925/`。
- 完整备份本机 Skill 后，只更新已验证的 5 个 public 文件及构建清单，228 个运行文件 hash 一致，712 个既有原件/历史/工作区绑定 hash 不变。未重启锁屏中的应用；原生窗口复验待解锁。未修改私人记录、未调用模型、未发布公网或 push；无关未提交修改保留。

## 2026-09-25 — 求职记录图片输入与增删动效（COMPLETE；本机已更新）

- 去除发生日期输入；新组自动记录创建日期，旧记录日期保留，阅读顺序不变。内容与图片继续通过详情统一保存或取消。
- 图片区支持拖入、粘贴图片及点击选图；内容框可直接粘贴截图，普通文字粘贴不受影响。三种入口共用数量、字节、格式和解码校验，保持既有图片 ID 与原图；失败不清空现有输入。字段字号与间距复用现有详情样式。
- 添加更多与删除记录不再重建整个编辑器，各组 DOM 与草稿保持稳定。复用 VI 540 ms 展开、480 ms 收起和标准缓动，结合透明度及高度过渡；减少动态效果时直接完成。动画或图片处理期间禁止并发保存，取消不会提交删除。
- journal、统一存储、详情接线回归与 VI/diff 检查通过。egolite 合成数据验证拖拽/粘贴/选图、分组隔离、普通文字粘贴、图片上限失败保留、统一保存、删除取消恢复、稳定节点、实际动画与减少动态效果。拖拽/图片粘贴由浏览器事件注入验证，文字粘贴使用原生快捷键；未测试每种外部应用的图片剪贴板。egolite 截图超时，改用本机 WebKit 原生窗口完成最终视觉检查；本轮不声称移动端截图验收。QA 留在 `.cache/job-journal-input-20260925/`。
- 已备份并更新本机 Skill，校验 228 个运行文件；仍显示 18 张个人资料卡片和 6 个职位。原件、历史与工作区绑定共 712 个文件 SHA-256 未变化，原生验收只进入编辑再取消。未调用模型、未发布公网、未 push；其他已有修改原地保留。

## 2026-09-24 — 职位详情统一编辑、备注与图文记录（VALIDATED）

- 修复正文、备注和求职记录分别编辑/保存的问题。详情与浮窗默认只读；共用 ProductShell 管理进入编辑和取消，单次 Human Save 统一保存所有内容。取消丢弃本轮备注、记录增删、文字与图片改动；保存失败保留输入。
- 「备注」移除“可选”，查看时复用任职要求的逐行编号布局，编辑时为一个大文本框。移除求职记录长说明；每组包含日期、内容和图片，可「添加更多」、编辑、删除。旧反馈标签保留展示，按发生日期/创建时间升序，图片缩略图点击在当前页面放大。
- 新增 `job-followup-storage.js`：applications、journal entries/images 及迁移标记纳入既有主内容库，原库只读迁移且保留。统一事务校验 Job head、应用修订和记录集合版本，提交 Job revision/演示卡、备注、记录和图片引用；不改 Candidate，不发模型调用。删除使用标记，修改保留前版与原图；仅改备注不生成 Job 新版本、不重复保存原图。
- IndexedDB schema 升为 19，Markdown Web/本机两种存储继续共用契约。128/128 离线回归、VI 检查和 diff 检查通过；新增真实 HTTP/文件事务覆盖迁移、失败整批不提交/重试、旧库保留、原图、跨页冲突、删除不复活、正式 Job 版本与 Candidate 隔离。
- egolite 在隔离 18779 origin 验证只读→编辑→保存/取消、添加多条图文、日期排序、删除取消/保存、放大、刷新、存储失败保留输入；1280px/390px 和详情 iframe 核对。另验浏览器 IndexedDB 保存/恢复图文。遇到浏览器缓存导致部分脚本未加载，用同一任务空间 CDP 忽略缓存重载恢复；截图与合成材料保留 `.cache/job-unified-edit-20260924/`。
- 本机 Skill 更新前保留完整安装备份，228 个安装文件 hash 核对通过；无 push 或公网发布。本机原生窗口验证 18 张个人资料卡、6 个职位及旧求职记录保留，统一编辑/取消可用；更新前 703 个原件/历史文件逐项 hash 未变，工作区绑定未变，未修改用户的真实备注或求职记录内容，未调用模型。本次只纳入本阶段文件，原有项目文档改动和未跟踪产物保留。

## 2026-09-24 — 连续流式反馈双端发布回执（COMPLETE）

- 实现 `7d6e76d`、接收方说明修正 `d1e2a55` 均已 push。从干净提交构建最终 Pages `73e26b06`；API Worker `194e65db-8eb2-4c52-8d15-390c65c819b0`，两份构建的 API runtime 字节一致。官网 https://ariadne.kai-nex.com 已生效，包含此前完成的求职记录功能，不夹带无关未提交修改。
- [最终 Skill Release](https://github.com/KAI-NEX/Ariadne/releases/tag/skill-20260924-streaming-v2) 与官网实际下载均为 2,875,197 bytes，SHA-256 `46fa34793c6fb4e33c042304467efe6c19093ff2f960e14e3b7d67f05855fcab`，ZIP 完整。首次 `streaming` 包和 Pages `cfe16e81` 保留；线上视觉验收发现 API 确认页仍提及本机搜索，已按当前接收方限定文案后发布最终版本。
- 正式站桌面/390px 实际点击进入确认、刷新记忆、底部旧说明隐藏和无横向溢出通过，无页面错误；9 项生产资源含 ZIP 与最终构建字节一致。无效合成请求返回 received→422 result 的 NDJSON，`network_call_made=false`、未写入资料。首次 QA 错把协商格式当 SSE 且未提供合成 header，在外层正确被 400 拒绝；修正测试后通过，没有放宽服务端约束。
- 本机旧 Skill 完整备份后更新，227 个运行文件 hash 与包一致、doctor 全部通过。独立窗口已重启，仍显示 18 张资料卡片与 6 个职位；702 个工作区文件更新前、更新后及重开后 hash 一致。文案补丁只改变静态 JS，已核对运行服务返回最终文件；不代发用户问题、不修改其设置或资料。
- 完整工作区 127/127 suites 通过；最终干净发布源码 126/126 再次通过，差异是既有未跟踪历史 Mac launcher 测试未进入发布。真实三家 BYOK 账号与跨机安装未重验；本机真实合成模型证据见下条。QA、两个本机备份、首次下载超时与最终成功下载均保留在 `.cache/conversation-ux-v2/`。原有未提交历史文档、原件和 QA 原样保留。

## 2026-09-24 — 求职图文记录官网发布（COMPLETE）

- 用户明确要求提交、发布官网后 handoff。功能提交 `b42b77f` 从干净副本构建；Pages 最终部署 `eb6838f3`，正式域名 https://ariadne.kai-nex.com。仅更新 Pages，API Worker、DNS 与已安装 Skill 未改；现有公开 Skill 包及 GitHub 下载地址保持原版本。
- 官网独立浏览器以合成职位完成文字/图片保存、刷新恢复、原图 SHA-256、备注无缩放角及 390px 布局验收，无页面错误。8 项生产资源与发布目录字节一致，含新 JS、页面、存储契约及保留的 Skill 包。未发送私人资料或调用模型。
- 首次发布 `5370b555` 意外携带构建器新生成的 Skill 下载，随后恢复原公开包并发布最终版本；现在线上 Skill SHA-256 为 `645d63db4ad87507afc13779ec83f26655197168336233bfec5eb79ad2af3129`。失败探测、初次部署和修正均保留于 `.cache/job-journal-publish-20260924/`；`live-qa.json` 与 `live-hashes.json` 为最终验收证据。未 push；其他任务未提交内容原地保留。

## 2026-09-24 — 连续流式公开反馈与对话前确认（COMPLETE；已发布并更新本机）

- 本机从 exec 完整消息升级到 App Server 的真实 agentMessage delta；固定 gpt-5.6-sol 与用户强度，每请求独立临时线程和受限工具，实际隔离策略核验后才启动模型。用户已自行登录独立 Ariadne Codex 目录，不复制旧凭据、不修改原 Codex 配置。隐藏推理不外传，失败/断流撤回未校验预览，不改变领域校验及显式保存边界。
- 六个对话入口先显示范围、接收方与费用确认，接受后进入对话，底部旧说明隐藏但保留原执行守卫。设置/范围变化重新确认；真实预览不重复播放假打字，过程记录默认收起并平滑展开/收起，等待恢复三点波动，减少动效偏好生效。
- 127/127 离线 regression suites 通过，新增 App Server 事件/身份/隔离/失败/超限、进入确认、真实子进程超时与分字节 SSE 回归；VI、公开文件、语法和 diff 检查通过。原先禁止圆点的旧 UI 断言按用户新要求更新，原领域/保存约束保留。
- 四次真实模型调用均仅用合成资料：文字首段 5.714 秒、21 次增量、12.999 秒完成；图片与完整两页 PDF 顺序送达并正确读出三个测试标记；公开搜索两次调用 Python 官网且无个人/职位修改；实际浏览器→HTTP→领域→模型链路 4.99 秒首段、13.354 秒完成，提前显示持续增长的公开回复，无提案、未写入资料。
- 桌面/390px、六个页面入口、失败撤回、快速展开/收起及 reduced-motion 浏览器验证通过。egolite 截图 CDP 超时后按项目规则使用独立 Chrome 复验；仅合成上下文，无页面错误。QA 和失败中间证据保留于 `.cache/conversation-ux-v2/`。本轮尚未重测真实三家 BYOK 账号或跨机安装。
- 本条记录实现验收；最终发布与本机交付见上方双端发布回执。既有求职记录等已完成提交纳入当前基线，无关未提交文档、原件和历史 QA 保留。

## 2026-09-24 — 求职图文记录与卡片详情一致性（COMPLETE；本地代码）

- 去掉职位备注右下角原生缩放角；确认后的个人资料详情隐藏旧删除/按来源移除入口，与职位详情一致，仍通过资料库编辑模式删除卡片。历史兼容记录的行为、原件和历史保留机制不变。
- 职位详情新增求职时间线：发生日期、反馈标签、文字、最多四张原图；支持预览/移除待存图片、取消、显式保存及刷新恢复。已读未回/持续无回复由用户记录，不自动推断拒绝或能力不足，不改变投递阶段或个人/职位正文，不自动发送给模型。
- 独立 journal 数据库复用 Markdown 内容库，正文与原图引用/Blob 分库表、同事务追加；重复 ID 拒绝覆盖，读取校验职位与条目身份。修正验证中发现的 Markdown 不支持直接序列化 Blob 的边界，原始失败合成记录保留。新增文件输入导致窄屏 grid 被撑宽的问题已修复。
- journal、阶段、两域详情 parity/生命周期、内容 codec/HTTP 数据库/磁盘存储和 i18n 相关回归通过，VI、语法、公开文件及 diff 检查通过。egolite 通过图文保存/刷新、原图 hash 相同、职位隔离、断网失败保留/重试、确认 Candidate 隐藏详情删除；截图超时后用独立 Chrome 补验桌面/390px/详情 iframe/重复追加拒绝，无页面错误。后续复验的 CDP 缓存干预会间歇性缺失脚本，保留失败日志；移除测试中的缓存干预，在 HEAD 加本阶段文件的独立服务上完成桌面/390px/详情 iframe/重复拒绝复验。仅合成数据，未调用真实模型或修改私人资料。
- QA 在 `.cache/job-journal-20260924/`，契约见 [职位投递阶段](docs/current/JOB_APPLICATION_STAGES.md)。本阶段仅本地 commit，尚未发布官网或更新已安装 Skill；现有其他任务的流式对话、运行选择、文档及未跟踪内容保留。


## 2026-09-24 — Skill 对话公开搜索与个人经历隔离（COMPLETE；本机已更新）

- 按用户要求开放 Codex 的六个普通对话入口实时搜索；关闭导入、DISTILL/SYNTHESIZE、Local 的搜索能力，网页版 BYOK 未扩展。保留 gpt-5.6-sol 和用户推理强度；仅隔离子进程启用搜索需要的 code_mode/host，不改全局配置。
- 外部来源独立展示和持久化，历史保留非个人经历标记。搜索回合在运行层拒绝任何个人资料、记忆、资料卡或职位修改；网页要求、同名者或公司成果不能成为个人经历证据。查询隐私仍依靠模型指令，来源属于模型引用，不声称确定性脱敏或逐条外部事实认证。
- 124/124 离线 regression suites、VI 和 diff 检查通过；含工具事件、伪造来源/不安全 URL/非法动作/失败/超限拒绝、阶段隔离及 Candidate 搜索回执保存/恢复。旧测试中的“不可搜索”断言已按新的运行边界更新，既有非搜索和保存约束保留。
- 了解我与 Job 对话各一次真实 Codex 合成调用，均实际搜索 Python 官网、保留链接并区分自述与网页内容；均未提出或保存个人/职位修改。未发送用户私人资料。搜索 host 缺失的初始失败探测与成功记录均保留。
- egolite 桌面/390px 确认独立来源标记、链接、键盘焦点与无横向溢出；缓存失效导致的初次脚本缺失恢复后通过。新 Skill ZIP 已构建；旧本机 Skill 完整备份后更新，220 个运行文件 hash 与 doctor 均通过，重开窗口显示 18 张个人卡片、6 个职位；702 个工作区文件更新前后及重开后 hash 一致。
- 实现和限制见 [公开搜索契约](docs/current/CONVERSATION_PUBLIC_SEARCH.md)，本地 QA/备份/构建位于 `.cache/conversation-search-20260924/`。此次未发布官网或 GitHub Release；既有无关未提交文档、原件与 QA 保留。

## 2026-09-24 — Web / Skill 对话实时透明反馈（COMPLETE；已发布并更新本机）

- 六个对话入口共用真实请求事件、资料覆盖范围、公开回复预览和可折叠过程记录。Web 逐块读取所选 API 的 Chat Completions SSE；Skill 保留隔离的 Codex exec JSONL，在公开消息完成时提前转发，不切换模型/强度/工具权限，不声称 Codex 已提供连续 token delta。
- 隐藏 reasoning、原始工具参数与修改动作；公开预览明确未校验。只有完整终态交回原领域校验/持久化，断流/乱序/失败撤回预览并恢复附件确认，Candidate/Job/补充的人工保存边界不变。结构校验不等于事实验证；临时过程记录不写入长期资料。
- 122/122 离线 regression suite、VI/负向检查、语法与 diff 检查通过。包含新增 SSE 分字节中文、身份/大小/终态校验、公开字段隔离、Web 真领域合成成功与错误动作拒绝、本机 HTTP/WSGI 提前 flush、前端提前预览及失败收尾。
- 1 次真实 Codex / gpt-5.6-sol / medium 合成资料调用：13.066 秒预览、16.943 秒终态，提前约 3.88 秒；未出现额外 commentary，不能据此声称持续逐字输出。没有发送私人资料或调用真实 BYOK API。
- egolite 六页面共用链路合成验收、桌面/390px、失败撤回、完成折叠与减少动效通过；实际 workerd 验证公开事件早于终态、成功/422 失败保真、分块上游 SSE 和 reasoning 不外传。过程中修复 SDK Request 克隆类型错误；本地 SDK 依赖缺失、测试替身的 JsProxy/dict 使用错误和浏览器缓存加载失败的中间证据均保留，不计作通过。
- 从干净提交 `eccac62` 构建并发布：Pages `8b602e80`，API Worker `6c86cee2-5816-4e43-a525-5b77e8ee2634`；[官网](https://ariadne.kai-nex.com) 实际浏览器核对运行边界、生产脚本/CSS hash、事件 Content-Type 与收到请求 → 422 拒绝的完整终态，`network_call_made=false`。未使用私人资料或真实 API Key 作公网验证。
- [公开 Skill Release](https://github.com/KAI-NEX/Ariadne/releases/tag/skill-20260924-live-feedback) 已上传完整 ZIP；GitHub 与官网实际下载均为 2,852,833 bytes，SHA-256 `645d63db4ad87507afc13779ec83f26655197168336233bfec5eb79ad2af3129`，ZIP 完整。官网安装指令绑定此版本与 hash；实现提交已 push。
- 本机旧 Skill 完整备份在 `.cache/conversation-transparency-20260924/installed-backup/`，更新后 219 个运行文件 hash 全部一致、doctor 全部通过。重开精确独立窗口，仍显示 18 张个人卡片和 6 个职位；更新前、更新后、重开后 694 个工作区文件 SHA-256 完全一致。没有代发用户问题或重置其模型选择。
- 架构与限制见 [对话实时反馈](docs/current/CONVERSATION_LIVE_FEEDBACK.md)。QA、生成包及发布时的短 SHA Release 拒绝/首次网络失败日志均保留在 `.cache/conversation-transparency-20260924/`；后续用完整 commit SHA 与正确依赖目录成功发布。真实三家 API 账号与跨机安装仍待验收。既有未提交历史文档及原件保留。

## 2026-09-24 — 跨职位对话认识当前个人资料（COMPLETE；本机 Skill）

- 修复根因：`JOB_OVERVIEW_TURN / DISCUSS` 原来只读取 Job，并在 prompt/后端/测试中禁止 Candidate。现从同一工作区复用 JobCandidateContext 与 PersonalContext，读取当前个人经历、未确认 Working、已保存补充和同指纹个人理解；模型区分能力、证据、表达、相关性与偏好。DISTILL/SYNTHESIZE 继续只发送职位，模型无 Candidate/Job 确认写权限。
- 对话增加 Candidate 指纹与读取覆盖，个人或职位在执行期间变化则结果失效；旧范围/版本回答保留并标记历史，不作为当前结论。目录不冒充正文，读取失败不当作空库。新增个人/公开链接传输说明与独立 disclosure 版本，旧 Job-only 同意不能自动授权新范围。
- 新增本轮公开 URL 读取准备：只处理当前用户消息的明确链接/域名，最多两页，限定公开 IP、HTTP(S)、标准端口、受控重定向、响应大小与静态文本预算；无 Cookie/凭据、自动爬站或 Codex 工具权限变化。网页是未核验来源，只回传来源/时间/hash/节选/失败状态，不自动写成个人事实。实际读取 kai-nex.com 首页成功，只验证网页技术读取，没有把该网站与私人档案发送模型。
- 120/120 离线 suite 通过；最终独立基线+本次文件快照再次通过领域、网页 10 项、同意、i18n、VI，以及 Skill bundle 8 项。真实隔离 Skill/Codex 合成验收正确引用“12 次访谈、交互原型、远程偏好”，比较三个岗位并区分工程证据缺口；读取 Example Domain 并明确不能作个人项目证据。确认资料、个人补充及职位记录逐项保持。桌面 1392×944、390px、中英说明、重开恢复、失败草稿恢复通过。
- 真实模型总计三轮，均为合成资料：首轮正式验收及两轮因跨工具调用的 CDP 阻断未保留而意外成功的后续对话；随后同轮设置网络阻断，得到 fetch 失败并恢复草稿。没有修改 Provider/model 或发送私人资料进行模型验收。
- 收口发现另一并行任务正在修改共用传输、Codex/HTTP 流式反馈，混合打包缺少其未跟踪模块。该失败包及日志保留；使用 `38565a0` 基线叠加本阶段文件构建独立包，排除并行未完成改动，未覆盖它们。最终 ZIP 2,845,215 bytes，SHA-256 `d59ebc519cac60303be1b533dd5bfb04301db4a6b0f86f0e60114f47d6dfbfed`，217 个运行文件，doctor 全部通过。
- 原安装完整备份在 `.cache/job-person-20260924/installed-backup/`；本机 Skill 已更新并重新打开。更新前后及重开后 686 个工作区文件 SHA-256 完全一致，独立窗口仍显示 18 张个人卡片、6 个职位，运行签名为 prompt-v4。此前 4 轮真实用户历史保留，新的传输复选框默认未勾选，未代用户重新发送问题。
- 未部署公网、未 push。公开网页读取只验证本机 Python 环境及静态文字，不声称读图/整站/登录页面/搜索；公开 Web Worker 尚未验证该新增读取路径。全部 QA、失败过程及隔离源码在 `.cache/job-person-20260924/`，原有未提交资料与并行修改原地保留。

## 2026-09-21 — 对话附件发送后仍留在输入框（COMPLETE；本机 Skill 与 GitHub 源码同步）

- 根因是共用附件控制器只在完整模型回复成功的 `finish` 阶段清除选中附件；截图中的用户消息和请求已经进入等待态，但四张图片仍以“本轮待发送附件”显示，造成重复发送风险。不是图片没有进入请求。
- 共用 Turn Transport 新增明确的 dispatch 边界：只有 `fetch` 请求已成功创建才从 composer 移出附件；立即显示本轮已发送的图片/附件数量并继续等待。同步抛错不会误清空；请求创建后发生的网络、模型或结果失败会恢复原文件，并清除旧确认，要求用户重新确认后重试。
- Candidate 工作区/详情、Job 工作区/详情、了解我与职位概况六个入口通过同一组件生效；中英文回执、缓存版本和架构文档同步。附件仍先保存为本机 `SOURCE_INPUT_ONLY`，不自动写入个人资料或职位，不扩大任何领域修改权限。
- 119/119 离线回归、VI、专项 transport/附件测试和真实浏览器合成附件 dispatch/失败恢复通过；浏览器 QA 没有模型请求或页面异常。已从实现提交 `7fde1b9` 清洁构建并更新本机 Skill：ZIP 2,837,585 bytes、SHA-256 `2a6b762f7cb079ba5953883f8fb2b8256a6aff940b5fcec85730ea94e9c37ef8`、216 个运行文件；GitHub `main` 已包含该实现及本状态记录。未把用户截图或私人附件用于测试，未部署官网/API，也未创建新的公开 Skill Release。

## 2026-09-21 — 职位卡片来源链接恢复（COMPLETE；本机）

- 定位到链接不是被删除：当前 Skill 工作区有一条 URL 保存在 `ariadne-source-archive-v1`，但对应确认 Job revision 的 `source_url` 为空。原因是 consent 阶段使用了带链接的 source snapshot，执行阶段却重新复制了更早的 `selectedJobSources`，链接未进入模型职位提案和确认版本，卡片渲染按空值隐藏。
- 新导入现在让模型执行复用已确认的 source snapshot。既有职位若确认版本没有 URL，则只从 `material_type=JOB`、有序 `source_document_ids` 完全相同的最新非空来源归档读取显示值；不修改历史确认版本，不跨职位借用链接，最终仍由 `http/https` 安全校验决定是否渲染。
- 本机已重新构建并同步 Skill；ZIP 2,837,329 bytes，SHA-256 `73784244b9bfc0bade1a56edeffe794398852b3b3571e4c8e9a039ecc2ef3ff0`，216 个运行文件。独立窗口实际打开 7 个职位对象，确认「AI 产品工程师（协同办公创新方向）」卡片底部恢复 `职位链接 · jobs.mihoyo.com`，其他没有已保存 URL 的卡片不伪造入口。72/72 JavaScript 回归、Job 领域/导入/卡片专项、VI、Skill bundle 8 项、doctor、语法与 diff 检查通过；未打开外部职位站点、未调用模型、未改写用户资料、未部署公网或 push。

## 2026-09-21 — 对话附件 Turn Transport 架构整合（COMPLETE；本机）

- 诊断用户截图对应的真实执行：`产品经理final.docx` 记录为 `SOURCE_INPUT_ONLY`、66,333 bytes，06:59:39 创建，07:00:46 结束，状态 `SUCCEEDED`；约 67 秒内文件并未被拒绝。结果包含 PDF deliverable，重启 Skill 后历史恢复并在本地重新生成 5 页 PDF，实际界面显示下载链接。
- 确认基础问题不是某一个 DOCX 特例，而是附件组件虽然共用，`prepare → fetch → parse → finish` 仍分别散落在 Candidate、Job、个人理解和职位概况四处。新增 `conversation-turn-transport.js` 作为唯一前端网络生命周期编排层；四个领域只提供 endpoint、domain identity 和领域错误，保留各自 Runtime signature、结果校验、语义权限与持久化。
- `conversation-attachments.js` 收敛为 Composer/Attachment Controller，明确展示 `CHECKING_CAPABILITY → READING_AND_HASHING → SAVED_LOCALLY → MODEL_REQUEST → COMPLETED/FAILED`。原件仍先在本机保存，失败保留选择；成功文案区分普通回复和生成文件，不重新引入每轮耗时，也不声称未知的 Provider 上传百分比。
- 六个对话入口均加载同一 Turn Transport，中英文动态状态同步；架构职责、不变量和新增领域接入规则记录在 [共用对话 Turn 架构](docs/current/CONVERSATION_TURN_ARCHITECTURE.md)。本轮未改变后端附件完整性、模型资格、Candidate/Job 隔离、Working/Proposal 或人工保存边界。
- 72/72 JavaScript 回归、DOCX 与四领域后端附件传输回归、相关领域 Python 回归、Skill bundle 8 项、VI、ZIP/doctor、语法和差异检查通过。最终包 2,836,958 bytes，SHA-256 `49efa6eb19ddab88d2ba7af6c0c375c5d6b187a299622387bd5431cd480aa3ee`，216 个运行文件；已同步并重启本机 Skill。本轮修复未重新发送用户附件、未部署公网、未 push。

## 2026-09-21 — Skill 粘贴职位、对话连续性与宽屏布局（COMPLETE；本机）

- 修复粘贴职位包含 Emoji/Unicode 扩展字符时的前后端长度歧义：前端统一按 Unicode code point 分块、截断和生成 `character_count`，与 Python 校验一致；失败原因为请求进入模型前的 source preparation 校验，不是模型拒绝。职位模型导入增加持续等待文案，明确原件已保存在本机且不会静默改用 Local。
- 独立窗口由 1180×800 等比扩大为 1392×944，最小尺寸提高至 1080×720；Skill 详情窗口使用 92% 可视宽度。实际打开「AI 产品伙伴」验证资料与对话保持左右双栏，没有因嵌入宽度跌破断点而变成上下结构。
- Candidate、Job、关于我的共用对话把标题、Runtime 和首次说明纳入对话滚动区：看过后会随消息上移；移除「本轮处理耗时」和永久等待计时，压缩 composer 与底部留白。Job 待回复的用户消息默认恢复显示；嵌入对话在生成中关闭时不销毁 iframe，返回同一卡片继续显示原界面，完成后的历史仍由既有持久化恢复。
- 「整理为个人补充」先写入既有 DRAFT 边界，再由详情容器在同一浮层内淡出切换到「关于我 · 个人补充」；左上按钮返回原对话，避免顶层页面硬跳转。该共享实现覆盖职位、候选人和个人资料相关 AI 对话，不改变 Working/Proposal 与人工保存权限。
- 全部 71 个 JavaScript 回归、Skill bundle 8 项、相关 Python 回归、VI 检查、ZIP/doctor 与语法/差异检查通过；完整 Python discover 另有一个既存测试在 Codex Skill 环境仍硬编码默认 Provider 为 DeepSeek，本轮未改运行契约。最终本机包 2,835,543 bytes，SHA-256 `4f7765dd15b5f7a8b4d82236a81fea34be2b7083c89ec43575311b214afa6a08`，已同步并重启精确 Skill App。未发起真实模型请求、未发布公网、未 push，用户资料目录未参与覆盖。

## 2026-09-21 — Ariadne Skill 修复、浏览器资料迁移与清理（COMPLETE；本机）

- 修复同 bundle identifier 的旧 QA/缓存 App 可能被按名称误选的问题：启动前向 Launch Services 注册当前精确构建，启动回执返回完整 App 路径与 bundle id，使用说明要求按路径核对。修正 Skill 原生窗口的工作区根目录，并以 `ariadne-desktop-workspace-binding-v1` 显式绑定经校验的导入工作区；保留旧目录，不以目录新旧猜测身份。
- 新增 `import-workspace`：在源工作区锁内读取全部索引记录、校验 Markdown/JSON 与原件 hash，拒绝符号链接、损坏来源、目标冲突和覆盖；复制后逐文件 SHA-256 复核，重复执行仅在目标与映射完全一致时返回 `already_imported`。不迁移 API Key、Cookie、密码、历史记录或其他网站数据。
- 已将已核实的浏览器工作区 `cb3634b814d142b2a45f7f093397d092` 导入 `~/Library/Application Support/Ariadne Skill/`：410 个文件、22 个原件，源目标清单完全一致；独立 Skill 实际显示 18 张个人卡片和 5 个职位。安装前副本、构建包和运行证据保存在 `.cache/skill-repair-20260921/`；发布 ZIP 为 2,834,430 bytes，SHA-256 `44b22c3707448d21f87017ff17e74d10fe78378d648dc241e56e69a21a544a51`。
- 用户确认删除后，egolite 对 `http://127.0.0.1:8000` 与 `https://ariadne.kai-nex.com` 精确执行 origin 级清理，现场验证 localStorage 为空、IndexedDB 列表为空；Chrome 由用户在站点数据设置中删除，随后两个可见 Chrome 实例的本地/公网工作空间均实际显示“尚未添加”。未执行 profile 级 Cookie/缓存清理，Skill 文件库复核仍为 410 个文件和 22 个原件。
- `skill_bundle_regression.py` 8 项、`desktop_workspace_copy_regression.py`、VI 检查与 `git diff --check` 通过；安装版重复导入返回 `already_imported` 且 SHA-256 验证成功。未发起真实模型请求、未发布公网、未 push；原有无关未提交修改和 QA 产物继续保留。

## 2026-09-20 — 透明安装按钮、纯黑步骤标题与双语架构说明（COMPLETE）

- 按用户要求保留「复制安装指令」的原位置和尺寸，改透明背景、700 字重；悬停下划线、键盘可见焦点保留。三个步骤标题改纯黑，使用 manifest 新语义 token `--vi-text-emphasis` 并重新生成 CSS，不手改生成资源。实际桌面按钮 630×50.28125 px、390px 页面按钮 314×50.28125 px，变更前后矩形完全一致，三个标题均为 rgb(0,0,0)。
- 中英 README 更新当前架构与上手说明；加入本地网页 → 独立安装包 → Web + Skill 的动机、各阶段解决的问题及代价。明确 Skill 复用已有 Codex、保留完整窗口和独立数据；仍有本机依赖、无自动同步、其他 Agent 待适配，不宣称用户效果或反馈更新已实现。产品案例保留原贡献与用户验证内容，仅对齐当前交付入口并链接演变说明。
- 使用 Archify 2.17 交付中文/英文 architecture HTML、可编辑 JSON、干净 PNG 与交付回执，目录 `docs/architecture/archify/2026-09-20-web-skill/`。8 个节点绑定当前仓库来源与 `a4fc904`，明确 Web HTTPS/API/浏览器库与 Skill loopback/Codex/文件库独立；共用契约由说明卡表达，不虚构运行服务或配对通道。旧图和全部历史证据原地保留。
- 两图均 9/9 showcase、0 error / 0 warning；修正一次储存连线标签与节点重叠后冻结。deliver 记录 source/HTML SHA-256，visual-check 分别完成 1440×900、1600×1000、1920×1080、2048×1320 无溢出检查与双主题截图；另经实际图像审阅和 egolite 官方 PNG 导出核查，review.json 区分结构、浏览器证据和人工视觉结论。
- 相关 Skill install、VI/负向检查、公开文件扫描、README 链接和 diff 检查通过；egolite 验证桌面/手机几何、透明样式、纯黑标题和复制。官网 Pages `a2c6960c`，仅部署 styles.css 与 vi/tokens.css 的差异；API 与 GitHub Skill ZIP 沿用上一已核验版本，不改业务或资料。QA 和部署日志在 `.cache/skill-readme-20260920/`。
- 补记上一发布的完整 CI：`35505089964` 为 114/116 suite 通过；desktop_lifecycle 与 skill_bundle 的 CI 服务启动就绪等待失败，本机 Skill bundle 7 项此前通过。此失败早于本次纯 UI/文档修改；本次没有修复或声称完整 CI 已绿，也没有真实模型调用。原有未提交历史记录与资料保持。

## 2026-09-20 — 同窗口安装与 GitHub Skill 分发（COMPLETE；已上线）

- 用户最新要求已发布：官网 `/#skill` 直接打开「通过本地 Agent 使用」，窗口内复制安装指令；旧 `/install`、download 与 codex-connect 地址回到同一入口。Pages `6062f6c7`，正式域名 https://ariadne.kai-nex.com。API 未再次部署，沿用已通过健康与隔离检查的 `4ab1078e-7937-4687-a827-ddba54044bc5`。
- 已将 Skill 和双端架构源码同步 GitHub main；保留远端 `5251c37` 的产品案例/用户验证内容，合并提交 `0e971c3`，没有覆盖原有贡献说明。发布 [skill-20260920-102511](https://github.com/KAI-NEX/Ariadne/releases/tag/skill-20260920-102511)，完整 ZIP 与 SHA-256 文件公开可下载；安装提示绑定这个固定版本，不引用可漂移的 latest 文件。包源码为合并提交，后续发布记录不改变运行文件。
- GitHub 和正式官网分别下载核对：均为 2,798,607 bytes、SHA-256 `5caf82de4fc49972b1aec286bdde930d7eae0d8582e49c93bb017e01b17dd4f1`；ZIP 和 214 个运行文件 hash 全部通过，独立包 doctor ready。本轮不覆盖日常 Skill、不迁移资料、不新增反馈更新、其他 Agent 或真实模型调用。
- 线上实际检查桌面/390px、同窗口复制成功且指令含上述 GitHub URL/hash、旧安装链接自动回到窗口、无横向溢出；健康返回 Web、磁盘 workspace API 仍为预期 404。本地相关回归、失败重试、复制降级与 VI 证据见上一条。全量 GitHub CI 由 main/tag 推送触发，记录时仍在运行，未将其计入通过结论。
- 发布包、下载、截图、日志与 publication.json 在 `.cache/skill-inline-github-20260920/`。GitHub 首次创建使用短 SHA 被拒，改用完整已推送 SHA 后成功；没有产生额外公开版本。原未提交项目历史条目、旧 App 源码及 QA 产物继续保留。

## 2026-09-20 — 本地 Agent 窗口内直接安装（COMPLETE；本地验收，待发布）

- 用户要求取消为了复制指令单独跳页。首页「通过本地 Agent 使用」窗口直接提供「复制安装指令」，随后说明安装后调用和独立窗口使用；`/#skill` 可直接打开，旧 install / download / codex-connect 地址兼容跳回同一窗口。复制失败展开并选中原始指令，包不可用禁用按钮，关闭重开可重试；关闭恢复原触发焦点。
- 安装检查仅在窗口首次打开时执行，并发/再次打开复用成功结果。安装指令支持受限的 KAI-NEX/Ariadne、固定 skill tag GitHub Release 完整 ZIP 与 SHA-256；构建器新增 `--skill-release-tag`，同源包继续作校验与旧地址兼容。完整包包含运行代码，单独 skills/ariadne 目录不能直接替代；本次未改变模型、个人数据或启动权限。
- Skill install 回归覆盖按需检查、并发去重、复制降级、缺长度时完整 hash/大小、非法 GitHub URL 与包失败；product boundary、Skill bundle 7 tests、VI/负向检查、公开文件扫描和语法检查通过。egolite 实际验证桌面/390px 复制成功、保持原页面、旧安装地址进入同一窗口、Escape 焦点恢复；阻止 metadata 后按钮禁用，解除阻止后重开成功。QA 在 `.cache/skill-inline-github-20260920/`，没有真实模型调用。

## 2026-09-20 — 双端架构与安装优先内容正式发布（COMPLETE；已上线）

- 按用户「调整好架构和内容，发布」授权，将此前完成的 Web / Skill 架构、Skill 直达工作空间和三步安装优先引导发布至正式域名。中英 README、当前 Skill 指南和部署说明统一 Web API / 浏览器库、Skill Codex / 文件库的职责；旧配对、模型选择与 Mac App 说明保留为明确标注的历史记录。反馈更新和其他 Agent 未扩展。
- API Worker `ariadne-api` 版本 `4ab1078e-7937-4687-a827-ddba54044bc5`；Pages `a56a6d36`（https://a56a6d36.ariadne-7pc.pages.dev），正式入口 https://ariadne.kai-nex.com。沿用既有 Service Binding、域名和数据隔离，未修改 DNS。上一 Pages `047f2d8c` 记录保留。
- 公开 `/downloads/Ariadne-Skill.zip` 为 2,797,991 bytes，SHA-256 `95eeff5f2ff595812758161a1905cfa9ff7f4fc9aa6cbb8064e3a83f783084b2`。从正式网页下载后与构建包逐字节 hash 一致，ZIP 完整性及 214 个运行文件清单校验通过；解包后 doctor 所需 Python、Codex、协议、登录与 PDF 工具检查均 ready。运行源码来自 `75cf2ef`；不包含个人资料或凭据。本轮未覆盖日常安装目录，已安装 Skill 的架构更新见上一阶段。
- 发布前 product boundary、Skill install、Web runtime 8 tests、VI、公开文件扫描、文档链接与 Worker 打包检查通过。首次 Worker dry-run 缺少 PATH 中的 npx，改用现有完整 Node 22 工具链后通过并完成部署；失败日志保留。
- 正式域名浏览器验证健康、Web Runtime、运行选项与六类领域 signature 接口正常，本地 `/api/workspace` 返回预期 404 / WEB_ROUTE_DENIED。桌面与 390px 实际检查先安装 → 安装后调用 → 窗口使用，无配对字段、旧桥接脚本或横向溢出；安装按钮复制成功，指令含公开包最新 hash，旧 Codex URL 仅显示引导。普通 urllib 下载返回 403，使用正常浏览器下载成功并完成上述完整校验。
- 证据、发布包、部署日志、截图及线上下载包保存在 `.cache/two-products-publication-20260920/`。本轮不执行真实模型或发送私人材料；真实 Codex 与原生窗口证据沿用本机架构阶段，不据此声称其他电脑、其他 Agent、完整 API 业务或负载上限已验收。未 push Git、未迁移资料；无关未提交文件原地保留。

## 2026-09-20 — 网页 Skill 引导改为安装优先（COMPLETE；未发布）

- 按用户反馈，首页「通过本地 Agent 使用」说明改为三步：先安装 Skill（立即提供安装页入口与复制/粘贴说明）→ 安装完成后在 Codex 输入调用语句 → 在独立窗口添加资料与提问。旧配对 URL 的说明同步此顺序。
- 安装页标题明确「先安装 Ariadne Skill」，说明等待安装/依赖检查完成再调用；修正页首残留的“选择运行方式”旧流程。只调整引导内容，不改变安装执行、模型或存储行为。
- 安装指令与入口回归、VI、diff 检查通过；egolite 验证桌面/390px 三步顺序、安装链接跳转与无横向溢出。证据在 `.cache/skill-guide-order-20260920/`。未发布公网、未更新本机 Skill 运行包，原未提交资料保留。

## 2026-09-20 — Web / Skill 双端架构与本地直达工作空间（COMPLETE；本机交付，未发布公网）

- 按用户明确决定从组合层拆分：Web 仅 BYOK API + 浏览器内容库，Skill 仅本机 Codex + 文件库。新增产品配置、产品 shell、同源 transport 与 Skill 服务组合器；不再由 hostname、旧配对或旧 API 偏好决定路由。共用 Candidate/Job 页面、来源、上下文、RuntimeSnapshot、Working/Proposal、Human Save 与版本契约。
- Skill 根地址及旧首页直接到工作空间，导航不再有连接设置。沿用已验证 `codex / gpt-5.6-sol` 与相容推理设置，不继承唤起它的聊天模型。服务端拒绝 API Provider/连接设置；缺 Codex 明确返回不可用并提示处理，资料仍可读取，不静默改用 Provider 或 Local。原固定 8766、资料根目录、工作区映射、旧资料不变。
- 网页「通过本地 Agent 使用」改为安装/使用说明窗口；取消当前页面配对码、连接状态、本机转发。旧 URL 仅显示说明，Skill `connect` 返回 `WEB_PAIRING_RETIRED`；配对源码原地保留但不由当前页面加载。网页可暂不连接 AI 管理原件。安装页、介绍页、Skill 指令及 README 更新；完整责任见 [双端架构](docs/current/TWO_PRODUCT_ARCHITECTURE.md)。
- 回归：15 项既有 Node suite + 新 product boundary suite、Skill 包 7 tests、Web 8 tests、Codex 六领域身份门禁、旧 connector 原件准备、VI/负向门禁、Skill 格式、语法、diff 检查通过。覆盖旧 token 不转发、loopback 上 Web 仍使用浏览器模式、Provider/凭据隔离、保留旧偏好、首页跳转、缺依赖拒绝与资料重启保留。Python 跨语言回归首次因 PATH 无 Node 失败，指定现有 Node 后通过。
- egolite 真实验收桌面/390px 安装说明、Escape 焦点恢复、无横向溢出、Web 工作空间零磁盘 API 请求、Skill 缺 Codex 提示。复制此前合成资料到隔离验收目录，明确设定测试工作区身份；保留旧 DeepSeek 偏好仍解析为 Codex，旧卡片/对话恢复。实际执行 1 次 Codex 对话，正确说明原型未上线与无已验证增长；回复落盘并重开恢复，6 个原件/来源/确认版本文件 hash 不变。没有发送私人材料或新增反馈功能。
- 本机 Skill 更新前完整备份，doctor 通过；真实独立窗口直接显示工作空间且无连接设置，关闭释放 8766、重开可用。Cua 按名字曾命中历史 QA 窗口路径而显示启动参数错误，随后使用已核实的日常缓存路径完成验收，未删除旧产物。
- 构建 Web Pages + Worker 目录和完整 Skill ZIP，ZIP 完整性及所有业务页产品脚本接线核对通过；本机安装同步。证据、备份、测试资料与中间包均在 `.cache/two-products-20260920/`。不推送 Git、不部署公网；其他电脑/系统、其他 Agent、API 真实账号与完整 Job 业务本轮未重新实测。原无关工作区修改保留。

## 2026-09-20 — Skill / Codex / 本地资料闭环（COMPLETE；本机合成验收）

- 按用户新范围复用已有完整 Skill、独立窗口、页面及本地库，先跑通 Codex；不启动反馈更新、长期通用档案重构、其他 Agent 适配或旧资料迁移。技能说明新增本地工作区身份与 Agent 连接边界；同机复用资料不等于跨机自动同步。
- 真实验收发现 `persistSuccessfulTurn` 写死 `deepseek / deepseek-flash`：Codex 已返回 EXPLAIN，但前端保存报 `SUCCESSFUL_TURN_LINKAGE_INVALID`。现从同一事务读取派发前已保存的 RuntimeSnapshot，校验原 turn、snapshot ID、mode、operation、Provider/model；保留 action/message/Working 关联与原子写入。未放宽模型资格或保存权限。
- 已安装 Skill 与源码同步。独立窗口真实选择 GPT Sol、进入工作空间、关闭后 8766 释放、重开保留选择。隔离 18766/测试数据目录经 egolite 上传两页虚构 PDF、Codex `gpt-5.6-sol` 分析为 1 张有两页来源的项目卡片、人工保存、重开详情并真实讨论；回答明确不能宣称未上线项目带来增长，成功状态 `NO_CHANGE`，确认版本 hash 未变。服务完整重启后卡片/对话恢复，76 个工作区文件 hash 一致，TXT/PDF 原件 hash 一致。
- 回归：6 项关联 Node/Python suite（其中 Skill bundle 7 tests）、Codex connector 回归、Skill 格式验证、JS syntax、VI 与 diff 检查通过。新增 Codex/DeepSeek 成功保存与重开、Provider/model/snapshot/operation 不一致、缺失 snapshot、错误文字/action 关联的原子拒绝，以及 Codex EXPLAIN/NO_CHANGE/ASK_CLARIFICATION 全路径；补齐既有资料库测试函数所需的 `libraryEditor` 空依赖。
- QA 过程保留：3 次自动化未接住延迟确认框而未发送；修复前 1 次真实对话已执行但保存失败；egolite 缓存加载异常经禁用本轮资源缓存并完整重载恢复。最终详情加载/对话无捕获到的页面异常。实际模型调用共 3 次（PDF 导入、修复前对话、修复后对话），全部为合成资料；不把离线回归当作真实模型证明。
- 证据与新包在 `.cache/skill-codex-e2e-20260920/`；安装前文件、原件、中间包及失败记录保留。只更新本机 Skill，没有推送 Git 或发布官网新包；其他电脑首次安装、其他 Agent、真实私人材料质量及本轮全部 Job 业务未重新实测。

## 2026-09-20 — 官网安装 Skill 与本机 App 替换（COMPLETE）

- 官网新增 `/install`：复制带公开包地址及 SHA-256 的安装指令给 Codex；复制失败可手动选择，包缺失/metadata 无效时禁用。旧下载页自动跳转，关于页/浮层/连接引导/中英 README 同步，取消日常手动下载 App 的流程。同步此前两个资料库的编辑/删除和页头布局。
- 已发布 Cloudflare Pages `047f2d8c` 至正式域名；没有发布 API Worker。公网浏览器实际复制成功、旧 URL 跳转、桌面/390px 显示通过。公开 Skill 包 2,793,081 bytes，SHA-256 `37fb2622e94020ce815ea32d04f7f7c643f2ac945a0f844b73ad163d45efca73` 与构建一致。上线发现 HEAD 无 Content-Length，已补齐获取完整包检查大小/hash 的分支及失败回归。
- 本机 Skill 已同步并通过 doctor。旧 `/Applications/Ariadne.app` 已移入废纸篓（`Ariadne-old-app-20260920.app`），仅移除对应 Dock 固定项；旧资料、安装备份和全部 QA 产物保留，未迁移资料。独立窗口继续使用同一原生图标与随关随停机制。
- Skill 安装/导航/Codex runtime 回归、Web runtime 8 项、Skill bundle 7 项、VI/负向门禁及发布扫描通过。本轮无真实模型调用、私人材料传输、Git push；其他电脑首次安装及公网连接器首次本地网络授权仍未实机验收。证据在 `.cache/skill-install-publication-20260920/`，原有无关未提交修改原地保留。

## 2026-09-20 — Skill 沿用原 App 图标尺寸（COMPLETE；本机）

- 修复独立 Skill 窗口直接用网页 180px touch icon 覆盖应用图标导致的尺寸/留白偏差。复用已安装原 App 的同一份 `Ariadne.icns` / `Assets.car` 和 `CFBundleIconFile` / `CFBundleIconName` 配置，去掉运行时 PNG 覆盖，原 Icon Composer 源文件与旧图标资源保留；图标内容变化纳入窗口缓存版本。
- 原 App 与新窗口资源逐字节一致；使用 macOS `NSWorkspace.icon(forFile:)` 分别渲染 256px，新旧 PNG SHA-256 完全相同（`1185ef37ce67d04d60fafc5c29b5048b9f46898765c19820d060790146dad1d1`）。7 项 Skill 包回归、Swift typecheck、VI 与负向门禁通过。Dock 自动化读取超时，未声称取得 Dock 截图；系统图标渲染证据保存在 `.cache/skill-icon-20260920/`。
- 已更新本机 Skill 并重开窗口；新 ZIP 2,791,346 bytes（增加原生外观资源），原安装另有完整备份。未发布公网或 push，资料和其他未提交内容保留。

## 2026-09-20 — Skill 独立 Mac 窗口与随关随停（COMPLETE；本机）

- 按用户最新要求，Skill 默认 `window` 打开独立 Ariadne 窗口，不使用 Codex 内置浏览器；复用原 App 的 WebKit 窗口、上传、下载和菜单。关闭最后窗口/⌘Q/窗口异常退出时，父管道关闭触发专属服务树停止，最小化保留运行，已保存资料保留。原无窗口 `open` 仅作明确选择的浏览器或开发入口。
- 首次在本机以 Swift 编译轻量窗口壳，要求 macOS 14+ 与 Apple Command Line Tools，按本机 CPU 编译，源码包不夹带固定架构程序。通过 Launch Services 启动并缓存重新打开配置；仅保存工具路径与可选账户目录路径，不保存凭据。修复从 macOS 重开时 PATH 丢失导致 Codex/PDF 不可用。旧 App、两个已安装 Skill 备份、失败过程与 QA 全部保留。
- 7 项 Skill 包回归、5 项原生服务生命周期回归、旧 App Swift typecheck、Skill 格式和 VI 正负向检查通过。实际独立窗口运行选择→Local 工作空间、关闭端口释放、重开与原件保留已验收；正式安装后再次实际关闭/重开，8766 当前正常且返回 Codex/DeepSeek 可用选项。截图、进程验收及新版 ZIP（859,445 bytes）在 `.cache/skill-window-20260920/`。
- 已更新本机 Skill；旧浏览器 profile 与独立窗口 profile 不自动迁移。无真实模型请求、私人材料传输、公网发布或 push；Intel Mac/其他机器未验收。使用说明见 [Ariadne Skill](docs/current/ARIADNE_SKILL.md)。

## 2026-09-20 — Codex Skill 与完整本地网页（COMPLETE；本机安装，未发布）

- 按用户要求将默认交付调整为网页 + Ariadne Skill。`$ariadne` 在 Codex 打开完整运行选择页面，选择 Codex/API/Local 后进入现有工作空间，本地同源无需配对；保留公开网页的可选短期配对通道和历史 Mac App。
- Skill ZIP 携带公开运行源码、完整页面、契约及逐文件完整性清单，不含芯片专用二进制、账号或个人材料。本地资料独立写入 `~/Library/Application Support/Ariadne Skill`；默认固定 8766，缺少 Codex/PDF 工具仍可用 Local，端口冲突不接管进程，旧 App/8000/公网资料不自动迁移。
- 同步 `5063d20` 的资料库卡片编辑/删除、Job 生命周期与存储升级，以及 `4b49193` 的对称页头布局；最终包 846,901 bytes。已安装到本机用户 Skill 目录，在 Codex 内置浏览器打开实际 8766 页面，依赖检查通过。下载页与 Pages 构建同时支持 ZIP/SHA-256，原 App 下载保留。
- 5 项独立包回归覆盖完整性、缺依赖、CLI 协议/登录、端口冲突、配对撤销、本地页面、独立原件保存、版本冲突、重启保留及 Local 可用；Codex transport/PDF、Web Runtime 8 项、资料磁盘库、runtime 前端、生命周期、下载与 VI 正负向检查通过。独立包在仓库外实际渲染两页合成 PDF；Skill 格式校验通过。
- 实际浏览器完成 Codex 内运行选择→工作空间→两个资料库编辑态；可选配对的成功/断开/错误码和下载桌面/窄屏已验收。最终 HTTP 下载与 ZIP/hash/大小一致。证据保留在 `.cache/skill-distribution/`；使用说明见 [Ariadne Skill](docs/current/ARIADNE_SKILL.md)。本轮未请求真实模型、发送私人材料、发布公网或 push；另一台电脑和公网 HTTPS 首次本地网络授权仍未验收。

## 2026-09-20 — 资料库页头对称布局修正（COMPLETE；本地预览）

- 按用户预览反馈，将「编辑 / 完成」移到页头最右侧；「了解我」「了解职位概况」作为独立中列居中，与按钮宽度无关。左侧返回和右侧编辑统一 44 px 热区，保留窄屏导航与现有删除行为。
- egolite 检查两个页面的 1440 / 390 / 320 px 宽度：标题相对可用页面中心误差小于 0.01 px，左右按钮中心完全对称、同高，无横向溢出或控件重叠；编辑/完成切换正常。VI、VI 负向回归、页面导航回归与 diff 检查通过。截图与几何证据保存在 `.cache/library-edit-preview-20260920/`；原预览地址可刷新查看，未发布公网或更新安装包。

## 2026-09-20 — 个人与职位资料库编辑删除（COMPLETE；本地验收，未发布）

- 两个资料库在「了解我」「了解职位概况」右侧新增「编辑 / 完成」，编辑态卡片右上角显示「删除」。复用文字按钮、danger token 与共用确认 dialog；取消/Escape 不写入，忙态防重复，失败保留卡片并允许重试，持久化成功但重绘失败明确要求刷新。
- Candidate 复用逐卡片 lifecycle；已确认 Job 新增仅追加的 `job_context_lifecycle`，核对当前版本并拒绝重复删除。原始材料、确认版本与对话/投递历史保留；资料库、工作空间计数和职位概况使用当前有效 Job 范围，旧概况指纹失效，已移除的确认 proposal 不回流 Working。契约版本 18，网页 Markdown 旧库增量补 store，不重新迁移或覆盖既有内容。
- 16 项相关 Node 回归、3 项 Python 回归（含 VI 负向检查）、VI 与 diff 检查通过。egolite 在隔离本机服务/合成资料验证 1440×900 和 390×844、取消与焦点恢复、删除后刷新、投递状态恢复、连续删除至空态、减少动效、注入存储失败重试及保存成功/重绘失败分支；真实浏览器另验证旧 Markdown 库升级、原历史字节保留、移除记录重开与失败回滚。没有真实模型调用。
- 范围与契约见 [资料库卡片编辑与删除](docs/current/CARD_LIBRARY_EDITING.md)；截图和合成数据在 `.cache/library-edit-20260920/`。本次仅本地代码和验收，不发布网站、不重建安装包、不 push；用户实际资料及其他任务未提交内容保留。
## 2026-09-20 — 产品案例、贡献说明与用户验证协议

- 根据维护者明确说明，README 中英文补充独立项目 ownership 与 AI 辅助实现的职责边界，加入产品案例与用户验证协议入口。案例复用现有架构决策和大 PDF 失败记录，不新增业务效果主张。
- `docs/product/PRODUCT_CASE_STUDY.md` 说明问题、个人职责、关键取舍、已交付与未知；`USER_VALIDATION_PLAN.md` 提供招募范围、知情同意、对照任务、评价标准、问题归因与复验。协议状态为计划就绪，尚未执行本轮真实用户研究。
- 本阶段仅修改公开文档，不变更运行代码、模型、数据或网页部署。文档链接、贡献表述与公开文件检查在提交前核对；研究结果不得由本次文档整理推定。

## 2026-09-19 — 传播入口与文字上手说明（COMPLETE；已上线）

- GitHub About 已填入 `https://ariadne.kai-nex.com/`，简介改为直接说明资料/目标岗位理解、来源依据、人工审阅及 Web/macOS 使用；原有 Topics 保留。GitHub Social preview 已上传现有双手 Logo 与真实空工作区组成的 1280×640 封面，并核对公开仓库 og:image 已采用自定义图片。
- 中英文 README 增加封面、顶部网页/下载入口、产品用途与五步上手说明：连接或 Local 归档、加入个人资料、审阅保存、加入目标岗位、围绕岗位讨论。按用户要求不制作演示视频。保留模型传输确认、缺证据不等于缺能力、普通讨论不改确认数据的边界。
- 官网首页、介绍页、下载页新增各自 description/canonical、Open Graph 与 Twitter 大图信息，共用 `public/social/ariadne-preview.png`。Pages 发布 `436818e7`，相较上一正式包只改变上述 3 个 HTML 并新增封面；下载 metadata、API Worker 和业务运行代码保持原有发布内容。
- 分享图来源与 HTML 模板在 `assets/social/`；工作区截图来自独立本机空数据库，不包含私人材料、凭据或模拟模型结果。封面 1280×640 / 87,288 bytes，实际浏览器检查文字、布局及图片；egolite 核对三条正式网页元数据和公开 PNG HTTP 200/MIME/完整 hash。VI、VI 负向回归、公开文件、README 链接、重复 meta/canonical 与 diff 检查通过。证据在 `.cache/social-entry-20260919/`，发布包在 `.cache/cloudflare-distribution/20260919-sharing/`。第三方社交平台缓存刷新时间不由本项目控制，本轮未向社区发布推广消息。

## 2026-09-19 — README 安装入口与当前架构图（COMPLETE）

- 中英文 README 首屏加入公开网页、官网下载页、macOS App ZIP 与 Release 校验文件入口；说明 Assets 中正确 ZIP、Applications 安装、Dock 固定、可选 Codex 登录、关闭最后窗口停止服务及资料保留。区分普通用户安装与开发者源码启动，修正“尚无公开网页版”的过期说明；保留未公证、兼容系统未全覆盖及网页/App 不自动同步的实际边界。
- 新增 `docs/architecture/archify/2026-09-19-current/`：Archify architecture 源文件、交互 HTML、供 README 展示的干净 PNG、交付回执和浏览器证据。图以 `4400d05` 为证据基线，绑定 8 个已核实源码入口，展示网页 IndexedDB/Worker、本机 App/Python/文件库、BYOK 与 Codex，并说明分域、传输确认和人工保存边界。
- Archify showcase 9/9、0 error、0 warning；四种桌面尺寸（1440×900 至 2048×1320）自动浏览器验收通过。egolite 实际打开并导出 PNG，检查浅色/深色截图与导出可读性；完整 artifact/specification SHA-256 见 delivery.json/review.json。README 本地链接、公开 Release/ZIP、VI、公开文件与 diff 检查通过。本轮只更新文档和架构图，没有执行真实模型调用或变更 App/网站运行代码。

## 2026-09-19 — 新版 macOS App 公开下载与 GitHub 同步（COMPLETE；已上线）

- 按用户明确要求，发布双手图标的独立窗口 App，并将下载页、首页 Codex 入口和连接页改为 App 安装流程：解压拖入「应用程序」、Dock 固定、菜单登录 Codex、关闭最后窗口或 ⌘Q 停止；说明无需 Apple Developer 账户及未公证首次系统确认。本次包也包含同款网页 favicon 和更新的安装文案。
- GitHub Release `local-20260918-172135` 已公开，ZIP 为 113,908,957 bytes，SHA-256 `e8d88429b9802537ec30e914263187abfafcee6e3b501d34ea59aa42d49918bd`，另附 `.sha256`。Release 标签对应安装说明准备提交 `ff9f5e0`，旧终端版及早期本地产物保留。公开包不含本机资料库、workspace 映射或登录凭据；不会把本机同步的私人资料分发给下载用户。
- Pages 发布 `44179fdc`，与上一正式包比较仅 5 项变化：index.html、codex-connect.html、download.html、local-download.js、downloads/latest.json。下载配置已更新到新 Release；API Worker 未重新部署。egolite 验证正式网页文案与实际点击下载，完整下载 ZIP 与构建包大小/hash 一致且解压完整性通过；桌面和 390px 窄屏预览通过，无横向溢出。
- 新 ZIP 解压到独立目录后安装/启动/退出、端口释放、签名与 1,183 个包内文件 hash 验证通过；5 项生命周期、下载 metadata/缺失文件/URL 边界、Cloudflare 配置与路由、VI/公开文件/diff 检查通过。出站 Git 的 212 个既有新增 blob 凭据模式检查通过，未提交的个人/其他任务文件继续保留。主分支推送在本阶段收口时核对，不重写历史。
- 构建包 `.cache/local-distribution/20260918-172135/`；网页包 `.cache/cloudflare-distribution/20260919-desktop-app-public/`；完整发布及浏览器下载证据 `.cache/desktop-publication-20260919/`。本机已安装 App 的资料与正在运行的服务未被替换；未做另一台 Mac 的首次 Gatekeeper 验收或本轮真实模型调用。

## 2026-09-19 — 双手图标作为正式网站 favicon（COMPLETE；已上线）

- 正式 `ariadne.kai-nex.com` 复用用户选定的 App 双手图标。新增可复现导出脚本，产出 16/32/48 px PNG、多尺寸 ICO 和 180 px Apple touch icon；20 个静态 HTML 与构建生成的 404 页面声明图标及缓存版本。Apple 图标源、原图和页面业务 UI 保留。
- Pages 发布 `f8b1c110`；与上一正式 Pages 产物比较，仅 21 个 HTML 图标声明和 5 个图标资源发生变化，API Worker、运行配置与已公开安装包下载元数据不变。egolite 在正式 HTTPS 首页核对 icon/touch 链接与实际 HTTP 200、MIME、SHA-256，三项资源与本机发布包完全一致。21 页引用和 ICO 16/32/48 内嵌 PNG 完整性、VI/diff 检查通过，48 px 预览核对。
- 构建包与证据 `.cache/cloudflare-distribution/20260919-favicon/`；未调用模型、修改资料、重建本机 App 或推送 Git。浏览器可能保留旧 favicon，可刷新或重新打开标签页。

## 2026-09-19 — 双手图标、Dock 安装与 egolite 资料同步（COMPLETE；本机）

- 按用户提供的双手/连接线图像与 Apple WWDC25 361 制作独立 App 图标。原图及 imagegen 前景原地保留；`assets/desktop-icon/Ariadne.icon` 使用 1024 点画布、独立透明前景、系统背景与圆角；复杂纹理关闭前景 glass/specular，Default 保留黑白纹理，Dark/Mono 使用清晰轮廓。Apple `actool` 输出 Assets.car 与兼容 ICNS，默认/深色/染色实际渲染核对。Icon Composer 首次许可由用户明确同意后接受；GUI 菜单操作遇到工具错误，改用已安装的 Apple 编译工具完成。
- 安装 `/Applications/Ariadne.app`，通过 Finder 固定至 Dock，并读取持久 Dock 项确认仅有该路径一个固定项。资料复制前核对 egolite origin/工作区 ID；源库锁内验证记录、原件和完整逐文件 SHA-256，共 410 文件、22 原件；主库 372 条记录、投递库 3 条、附件库 3 条。旧目录与全部历史保留，无覆盖、合并、Provider 调用或凭据复制。
- 新增显式资料复制工具与本机 `desktop-workspace.json` 映射；目标已存在、原件损坏或 ID 非法时拒绝。映射仅为无现有资料身份的原生 profile 初始化同一工作区。复制后再次核对源未变化，停止已验证归属本仓库的开发服务 PID，再由 App 管理 8000；egolite 与 App 现在访问同一份 App 数据。两端实际显示 18 张资料卡片、5 个职位对象，原生截图与浏览器截图留存。API Key/模型连接仍各浏览器独立配置。
- 5 项生命周期回归、4 项安装回归、资料复制边界回归、原有存储回归、VI/diff 检查通过；最终包 1178 个运行文件 hash、ZIP 完整性、安装前后 ad-hoc 签名和 Dock 固定验证通过。保留用户当前打开的 App；本轮未重做上一阶段全部关闭/重开 UI 测试，关闭行为由已有原生验收和本轮生命周期回归覆盖。
- 最终版本 `20260918-170658`（UTC），产物 `.cache/local-distribution/20260918-170658/`，SHA-256 `ded10ae31c6ce92d4c33a5530ee4d5336696cedac60bea7cbb89058fb41b0b38`；证据 `.cache/desktop-install-20260919/`。不需要 Apple Developer 账户；仍为未公证 App，未验收其他电脑首次 Gatekeeper，未替换公网旧终端包、未 push。

## 2026-09-19 — 独立窗口 macOS App 与退出即停（COMPLETE；本机验收，未替换公网下载）

- 按用户“像 App 一样点击打开、关闭就停止、安装后可用”的要求，将可分发包升级为 AppKit + WKWebView 的 `Ariadne.app`，自带现有 Python、Codex 和文档工具。每次打开进入运行选择；关闭最后一个窗口或 ⌘Q 停止本次服务和子进程，最小化保持运行。图标复用 VI 色彩和「衡」字标；网页业务界面、Provider/model、传输确认与人工保存边界不改。
- 原生窗口通过 stdin 管道持有监护进程；父进程丢失同样触发清理。只管理自己创建的子进程树（含另起 session 的模型子进程），不按程序名杀进程、不复用或接管已有端口、不改变固定 8000 origin。端口占用明确提示，旧版与开发服务保留。退出中断未完成操作，已发到 Provider 的请求不保证取消计费。
- 修复打包安装的资料路径问题：共享 `data/workspaces` 的安装链接被存储层拒绝。启动器传入本安装的真实规范路径，继续拒绝存储内符号链接及越界；不放宽 `WorkspaceStorage`。App 的 WebKit 设置/工作区映射与原浏览器独立，旧资料不自动迁移；新版本继续保留共享 data、旧 release 和原下载包。
- 原生 CUA 验证选择 Local、系统文件选择、合成 TXT 保存、红色关闭按钮及 ⌘Q 释放监听端口、重新打开保留选择、原件列表恢复和再次读取；磁盘原件 SHA-256 相同。egolite 对同一隔离服务验证正常网页渲染及原件保存/重开，未调用 Provider。原生自动化将窗口后台化，使 WebKit 动画暂停；专用 `DESKTOP_QA` 构建仅完成有限动画以验证交互，正式包不含该运行代码，不把该截图当作前台动画验收。
- 5 项生命周期回归、4 项安装回归、工作区存储回归及 VI/diff 检查通过；覆盖 EOF、信号、冲突、启动中断、独立 session 子进程清理和无关进程保留。最终 ZIP 解压到独立目录再安装，真实后端身份、工作区读写准备、退出释放端口、1178 个包内文件 hash、ZIP 完整性及 ad-hoc 签名验证通过。首次 CUA 启动未携带测试参数，曾创建默认安装目录中的该测试 release，因 8000 已占用退出，未接管原服务或改写原资料；该产物和日志保留。
- 最终产物 `.cache/local-distribution/20260918-161228/Ariadne.app` 及同目录 ZIP（111,953,471 bytes），SHA-256 `6feb0fd2061e391f656acec61f8ced53edc0c6922eef5942f74b71acf6f97931`。证据在 `.cache/desktop-app-20260918/`，使用说明见 [本地安装包](docs/current/LOCAL_DISTRIBUTION.md)。仅 Apple 芯片/macOS 14+ 构建并在本机验收；尚未 Apple 公证、另一台 Mac 首次 Gatekeeper 验收、Intel/Windows 或本轮真实模型验收。公网仍为 `20260918-104410` 旧终端包，本阶段未发布、push 或更换下载元数据。

## 2026-09-18 — 蓝色下载链接与本地安装包公开下载（COMPLETE；已上线）

- 用户反馈正式网站 Codex 浮窗下载链接为黑色、下载页提示没有安装包。下载链接改用既有 VI 交互蓝；此前 ZIP 仅保存在本机且 Pages 下载 metadata 为 `available:false`，现已发布到 [GitHub Release](https://github.com/KAI-NEX/Ariadne/releases/tag/local-20260918-104410)。包版本 `20260918-104410`，111,601,193 bytes，SHA-256 `2636abcf8b5ab85f2921bc4c557e0deb09f4c5bd0583793faa109d68b28ae6eb`。
- Pages 发布 `74a4f791`，对比上一正式发布仅变更首页、样式和下载元数据三个文件；正式 [下载页](https://ariadne.kai-nex.com/download.html) 已提供真实 ZIP 链接。新增版本控制的 `deploy/cloudflare/local-download.json`，普通网页构建沿用已发布下载，不再因省略参数或缺少本地 ZIP 清空入口；更换包时仍要求名称、大小及 hash 相同。API Worker 未重新部署。
- 从 ZIP 解压后 1,177 个文件 checksum 一致，无私人数据或凭据；隔离目录独立安装/启动、重复启动复用、自带 Codex 版本及完整两页 PDF 转图通过。egolite 在正式网站验证 1280×900/390×844 蓝色链接、实际点击打开下载页，无横向溢出与相关错误；浏览器实际下载的完整 ZIP 与原包 hash/大小一致，压缩完整性通过。安装器、下载状态、Cloudflare 下载配置/路由回归及 VI/公开文件/diff 检查通过。
- 证据保存在 `.cache/local-download-publish-20260918/`，源码分发包在 `.cache/local-distribution/20260918-104410/`，Pages 包在 `.cache/cloudflare-distribution/20260918-local-download-public/`。仅支持 macOS 14+ Apple 芯片，仍未公证、未做全新电脑/Gatekeeper 或全部 macOS 版本验收。未调用模型或更改用户资料；公开的是安装包及校验文件，未推送本机分支或纳入其他任务未提交内容。

## 2026-09-18 — 移除网页全局预览提示（COMPLETE；已上线）

- 按用户要求，Cloudflare 导出不再向页面注入“网页预览 · 自带 API Key · 资料保存在当前浏览器 · 下载本地版”提示行。原提示源码与旧发布包保留；模型连接、传输确认、资料保存和独立下载入口不变。
- Pages 发布 `bce5e48c`，正式域名首页与工作空间经 egolite 验证均无提示节点和脚本引用；导出 HTML 检查、Cloudflare 路由回归、VI 与 diff 检查通过。截图及新发布包位于 `.cache/cloudflare-distribution/20260918-remove-preview-banner/`；未重新部署 API 或调用模型。

## 2026-09-18 — Cloudflare 正式发布与腾讯域名绑定（COMPLETE；公网预览）

- 用户明确授权注册/绑定后复用已有 Cloudflare 账号，创建 Pages 项目 `ariadne`，实际主机名为 `ariadne-7pc.pages.dev`。Pages 发布 `5b41fcb0`，Python Worker `ariadne-api` 版本 `6ff8a1d5-3030-4196-ad02-1a1b666e7eba`，通过 `ARIADNE_API` Service Binding 访问，Worker 无独立公网入口。
- 用户完成 OAuth 和腾讯登录。旧浏览器回调因授权等待超时出现 localhost refused；切换设备授权成功，补齐 `workers_scripts:write`。Wrangler 4.134.0 的 Pages 创建须 `--force` 保持项目类型；教程已按实际过程修正，不要求用户购买服务器或更换平台。
- 腾讯 DNSPod 新增唯一的 `ariadne CNAME ariadne-7pc.pages.dev`（TTL 600），权威 DNS 返回正确记录；Cloudflare 显示 Active / SSL enabled。正式 HTTPS 根页、`/healthz`、`/api/web-runtime` 均可用；保留原有 6 条 DNS 记录与邮箱配置，不迁移 DNS，不修改另一个个人网站项目。
- 正式域名通过真实浏览器调用 DeepSeek：固定图片连接 215 tokens；两页虚构简历完整交付 2 页/2 图，3,913 tokens，返回工作经历/项目/教育 3 条有来源的 `NEEDS_REVIEW` 提案。重复同请求 HTTP 200 且结果完全相同；未写入人工确认资料，未使用私人简历。Python urllib 的首次 POST 被 Cloudflare 1010 拒绝，真实浏览器请求成功；原失败保留，不把脚本失败当作模型失败。
- 浏览器确认无效 Key 显示失败、Local 能进入空工作空间，再次打开根入口仍须选择运行方式。正式来源与预览域名分离；API 仅允许正式来源，pages.dev 的 API 返回 `WEB_ORIGIN_DENIED` 是既定配置。未把测试 Key 留在设置中。
- 运行证据、合成响应与部署状态保存在忽略目录 `.cache/cloudflare-publish-20260918/`。此前 110/110 离线回归保持为实现基线，本次仅部署与教程/状态更新，不重复声称全部领域已通过公网模型验收。Gemini/千问真实账号、最大文件/并发负载、不同地区网络与公网 Codex 配对仍待验证；本地安装包未上传公开下载。未 push、购买资源或纳入其他任务改动。

## 2026-09-18 — Cloudflare 网页免安装 BYOK（IMPLEMENTATION COMPLETE；未公网部署）

- 用户明确网页也必须免安装调用自己的 API Key；采用 Pages + Python Worker，DNS 继续腾讯，正式入口 `https://ariadne.kai-nex.com`。使用 [Cloudflare 逐步部署](docs/current/CLOUDFLARE_DEPLOYMENT.md)，无须购买 VPS。原腾讯/Docker 教程保留并标为备选，不把纯静态预览冒充可执行 API。
- Pages 导出保留每次先选模型，增加预览与下载说明；六个领域复用现有 Python 校验/模型处理/人工保存规则。通过 request-local HTTP/PDF hook 适配 workerd，不更换框架或应用模型。PDF.js 按需完整逐页转图；Worker 用原件 hash、pypdf 页数、有序图像 hash 核对交付。预览每份 PDF 5 MiB、16 页、图像 6 MiB，完整请求 12 MiB；本地上限不变。
- 每个来源/浏览器会话/Provider/Key 摘要隔离 Durable Object，最多 2 个并发、256 个持久操作摘要；仅持久写入 hash，不保存 Key、原件或模型正文。实例缓存丢失后同操作返回 409、内容改变返回冲突，不能自动重复付费。原件、资料和确认版本保存在当前浏览器；Codex 仍走本机登录与配对。
- 真实 workerd + Pages Service Binding 使用既有 DeepSeek Key，仅发送合成固定图片和两页虚构简历；连接 215 tokens，资料分析 3,950 tokens，`deepseek-flash` 返回 3 条有来源的 `NEEDS_REVIEW` 资料，完整交付 2 页/2 图。重复同请求返回相同结果；无效 Key 返回 Provider 401，模拟实例重载后的摘要拒绝重放/内容冲突均未发起模型调用。没有使用私人简历；Gemini/千问只保留原离线回归与用户连接验证，未宣称真实账号通过。
- 110/110 离线回归、PDF 真实解析检查、VI、公开文件扫描与 diff 检查通过。新回归覆盖完整/缺页/顺序/hash/来源隔离、缺失服务绑定、请求体限制与 GitHub 下载 URL。pywrangler 官方部署 dry-run 通过，部署源码与 Python 依赖隔离目录，Worker 压缩约 488 KiB，避免把部署虚拟环境打包。
- egolite 真实 Pages 页面验证桌面/390×844 手机选择入口、无效 Key、浏览器两页 PDF 渲染、Local 原件保存/刷新恢复、根入口再次先选模型。修复 Pages `X-Frame-Options: DENY` 拦住同站导入弹窗，改 SAMEORIGIN；预览说明不重复插入嵌入弹窗。截图、合成材料、失败尝试和运行证据留在 `.cache/pages-preview-20260918/`。Cloudflare 公网 CPU/配额、真实 TLS、跨地区 API 与公网 Codex 配对仍待上线后验收。
- 发布目录 `.cache/cloudflare-distribution/20260918-151649/`，包含 340 个 Pages 文件、2.69 MiB 页面 ZIP、API 源码/锁文件与部署说明；417 个文件 hash 核对通过，不含私人数据或本地大 ZIP。下载地址未发布，网页诚实显示尚无安装包；教程说明公开 GitHub Release 上传并用实际 URL 重建。
- 新本地包 `.cache/local-distribution/20260918-071241/Ariadne-Local-macOS-arm64-20260918-071241.zip`，SHA-256 `f30d7e814272536ad7673fabbf82cea9e010e561e3faf78ab6d177da2a109e27`；在独立目录安装启动、版本端点、关键源码/hash 核对通过。未修改原有私人工作区、购买资源、变更 DNS、推送或公网发布；旧文件与无关未提交改动保留。


## 2026-09-18 — Gemini / 千问完整接入与逐步部署教程（IMPLEMENTATION COMPLETE；真实账号及公网待验收）

- 按用户新要求开放 Gemini 3.7 Flash 与千问 Qwen 3.8 Max；此前入口只有保留位置/连接实验，缺少完整领域执行，因此未开放。本次补齐 Candidate/Job 导入、两类对话、个人理解、职位概况六个 adapter 的前后端绑定；共用既有领域契约和 PDF 完整逐页转图，不增加框架或 SDK。千问固定使用百炼北京地域；不改 Codex/DeepSeek 的既有选择。
- 两家使用固定官方 OpenAI 兼容端点，连接前经用户确认发送固定两页合成 PDF 的完整页面图，验证两页读图与 JSON。只有通过后才加入模型选择；失败不回退其他 Provider。凭据按 Provider 独立保存在当前浏览器，按请求携带；网站执行命名空间加入 Provider，禁止交叉借用 Key、Keychain/环境回退及 HTTP 重定向。实际传输与费用确认保留，私人材料不用于连接测试。
- 108/108 离线回归通过，新增六个领域 × 两家 Provider 从真实校验、payload 构建、传输到响应正规化的合成检查，覆盖能力/模型/凭据错配、两页验证失败、取消与会话隔离；真实 API HTTP 响应使用替身，不作为业务理解质量证据。VI、公开文件检查、安装脚本语法与 diff 检查通过。
- egolite 完成连接成功/失败与刷新路径，截图接口超时后按项目规则使用隔离 Chrome/Playwright。桌面 1280×800、手机 390×844 的两家成功/失败、独立 Key、迟到验证丢弃和每次入口先选模型通过，无脚本错误或横向溢出；截图与失败尝试保留 `.cache/providers-20260918/`。合成验证服务使用真实 Poppler 渲染；本地包另用自带 Python/PDFKit 完整渲染两页通过。
- 8000 本机与 `http://ariadne.localhost:8081/` 网页预览已重启到新代码，Codex 本机优先保持；真实预览列出三家 API，四个未确认连接请求均拒绝且未调用 Provider。合成 QA 8082 已停止，未操作原有私人工作区或真实 API 凭据。
- 新增 [第一次部署逐步教程](docs/current/WEB_FIRST_DEPLOY.md) 与仅用于新 Ubuntu 24.04 服务器的 Docker 安装脚本；按腾讯新加坡轻量服务器、腾讯 DNSPod `ariadne` A 记录、Docker/Caddy 自动 HTTPS 编排。未购买服务器、变更 DNS、推送或公网发布；本机无 Docker，Linux 镜像/Compose/Caddy、真实账号、正式 HTTPS 和公网 Codex 配对仍需部署后实测。
- 新部署包 `.cache/web-distribution/20260918-134930.tar.gz`（SHA-256 `0f796ec9fa3b06de88e118b835844d0a2d3f02e41cc38eb7a1253e3060e1092c`）的 200 个源码文件逐项与当前代码核对，包含安装脚本和教程；内置本地 ZIP `20260918-054730`（SHA-256 `54c41e6b9c9e2271e8b460e61d107c217557671cc4b309ba5df9f54e9e986968`），ZIP 源码、测试 PDF 和嵌套下载 hash 核对通过。本地包验收范围仍为 macOS Apple 芯片，旧包和历史 QA 原地保留。

## 2026-09-17 — 单域名网页执行与部署包（IMPLEMENTATION COMPLETE；未公网部署）

- 用户确认 `https://ariadne.kai-nex.com` 直接进入模型选择与应用，腾讯负责 DNS，尚无服务器；取代历史官网与 `web` 子域分离方案。实现与绑定步骤见 [网页部署](docs/current/WEB_DEPLOYMENT.md)。每次根入口仍先选模型，不自动进入工作空间。
- 新增独立 WSGI 网页入口，复用六条真实领域执行与能力/来源/人工保存校验。公开入口只接受用户自己的 DeepSeek Key；禁止服务器 Keychain、环境凭据回退、Codex 和本机资料接口。资料留在浏览器，传输确认明确网站转发及临时处理；Codex 继续通过用户电脑上的配对连接器，默认来源更新为正式单域名。
- 用浏览器随机会话与 Key 摘要共同隔离执行、幂等缓存、取消和删除；绑定操作内容，限制命名空间、请求并发、缓存和原件大小，缓存失效不会自动重复付费分析。修复旧代对话迟到结果清掉新代执行状态的问题。网页 PDF 使用 Poppler 全页转图，先检查页数与输出完整性，复杂 Word 内嵌图像明确要求 PDF；本机既有交付路径保留。
- 提供 Dockerfile、单实例 Gunicorn/Caddy HTTPS 与资源限制配置、公开源码白名单导出和 loopback 预览。未购买资源、配置 DNS、推送或发布公网；本机没有 Docker，因此 Linux 镜像/Compose/Caddy 实际启动、正式 HTTPS、自带 Key 真实模型与 Codex 本地网络授权仍待部署后验收。
- 106/106 离线回归、VI 和相关校验通过；最后的异常操作身份处理另复验 8 项网页回归。新增测试覆盖六域校验到模拟 Provider 边界、会话/Key 隔离、原件 hash、容量、取消代际与 PDF 不完整拒绝。真实 Gunicorn 26.2.0 可启动导出源码，HTTP 首页/契约可用而本机私有接口拒绝；本机真实 Poppler 完整渲染合成三页 PDF、损坏文件拒绝。这些不作为真实模型理解质量证明。
- egolite 完成合成交互但截图超时，隔离 Chrome/Playwright 补齐桌面 1280×800 与手机 390×844：连接成功/失败、Local 原件保存/刷新恢复、每次先选模型、两个浏览器 Key 与资料隔离通过，无脚本错误或横向溢出。未调用真实 Provider 或修改原有私人工作区。所有 QA、失败尝试和截图保留 `.cache/web-release-20260917/`。
- 部署包 `.cache/web-distribution/20260917-211043.tar.gz`（SHA-256 `81ed8671a4fc70211d548ec2198859e6b6de29d76fbbcf7bc38c3cf925037ae9`）的 197 个源码文件逐份与当前代码一致；内含本地下载包 `20260917-043113`（SHA-256 `dbd2ac47021c505cc261585949667241e8e9938d61d5bed76a3d186c85f93a69`），下载 hash 与单域配对配置已核对。旧包原地保留；本地包仍只有此前 Apple 芯片平台验收范围。仅提交本阶段文件，原有 Mac App、图谱及文档未提交改动保留。

## 2026-09-17 — 每次启动先选择模型（COMPLETE）

- 按用户新指示，移除首页「返回工作空间」入口，取消根入口自动跳转；`/` 与 `/index.html` 都先显示运行选择页，用户点击继续后进入工作空间。已保存的连接配置与既有资料保留，localhost 的规范地址及启动器根页面就绪检测不变；取代下方历史阶段中的工作空间默认入口决定。
- 入口、运行选择和本地包相关回归通过，现有 Mac 启动器 10 项兼容测试、VI 与 diff 检查通过。egolite 实测打开入口 → 选择本地运行 → 继续进入工作空间 → 重新打开入口仍停留选择页，已保存选择仍在且无返回工作空间链接；截图核对正常。验证使用独立工作区和空模型列表替身，未调用真实模型或改动私人资料。证据保留于 `.cache/model-first-entry-20260917/`。
- 本机下载包已更新为 `20260917-030426`，SHA-256 `90e349e83b0cdad9b4b43849459734b794871bcae5edf6742966f3306b1d41c6`；从 ZIP 独立安装启动后确认首页及脚本与源码一致，旧包原地保留。8000 开发服务已直接返回最新静态文件，无需重启；未发布公网，跨电脑安装边界不变。

## 2026-09-17 — 本机优先、自带连接与原件单条读取（LOCAL FOUNDATION COMPLETE）

- 用户确认：自己的日常使用优先 Codex，保留 DeepSeek；后续用户自带 API，或下载后连接自己的 Codex。Astra 从架构、软件、产品与首次传播体验复核，保留原生前端 + Python 模块化单体，不重写框架。方向、范围和公开 Web 待办见 [本机与网页运行方向](docs/current/LOCAL_AND_WEB_RUNTIME_DIRECTION.md)。
- 根入口默认进入工作空间，`/index.html` 作为连接设置，保留原有启动器的根页面就绪检测及 127.0.0.1 地址。本机 Codex 优先展示且无需配对，应用内模型与已有选择不自动变更。
- 补齐添加 DeepSeek 的固定图片验证与六个领域实际执行接线；API Key 在用户当前浏览器保存，后端按请求使用，不写项目、不传给 Codex。无秘密的 `browser-key://deepseek/request` 明确区分旧 Keychain 来源，缺失/无效/来源变化不静默回退。费用、材料范围和失败可见；Gemini/Qwen 入口保留为尚未开放。关闭弹窗使迟到验证结果失效。
- 原件恢复新增独立按记录读取，保留原件 hash 与保存时完整读集/版本/幂等检查。复核确认旧领域列表已有 getAllMetadata，早期审阅中的潜在 getAll 放大不能当作列表实际下载原件的证据。合成 1,000 条 × 8 KiB 观察中，单条查询对象读取 1,000→1、响应 8,244,157→8,275 B；暖缓存三次中位数 105.37→0.77 ms，不代表整条恢复或模型耗时的加速倍数。当前页面仍有其他元数据集合读取。
- 现有全量回归与本阶段三组新回归合计 103 组离线检查均通过，包含六个真实领域校验到模拟 Provider 边界、来源隔离、真实 HTTP/磁盘单条原件、保存冲突与完整性；VI、公开文件和 diff 检查通过。另验证现有未提交 Mac 启动器 10 项兼容测试，未修改或纳入该功能文件。
- egolite 完成初步交互但截图反复失败，Chrome 控制桥也超时，改用隔离的 Chrome / Playwright 补齐 1280×800 与 390×844 视觉及行为检查。验证连接成功/失败、关闭后的迟到结果不切换、刷新保留 Local、本机 Codex 不弹配对、Local 原件保存/恢复及未适配项禁用。无页面脚本错误；连接成功为合成 HTTP 替身，未调用真实模型、未使用私人材料作质量验收。QA 和失败记录留在 `.cache/byok-workspace-20260917/`。
- 独立本地包 `20260917-024831` 已重新构建并更新本机下载入口，旧产物保留；SHA-256 为 `b07a07a7273c9732c29e46f654d18a36bf513099b8bcdbbe8af0c26001af3703`。从 ZIP 在独立安装目录验证运行、入口、连接路由、无私人工作区/凭据打包；真实开发服务经目录/进程与空闲监听核对后重启为新版。该验收仍在本台 Mac，未代表其他电脑、Gatekeeper、Intel/Windows 或 macOS 全版本可用。
- 公开网页的多用户 API 执行层仍未实现、未部署；当前页面明确说明限制，不把开发者密钥提供给网页用户。后续必须处理请求凭据、执行/取消/幂等缓存的用户隔离、完整 PDF 与真实 HTTPS 连接器验收。未 push、发布公网、换应用模型或搬移/删除原资料；本阶段不纳入原有并行文档与 App 工作。

## 2026-09-17 — 首页「添加新的模型」关闭闪烁修复（COMPLETE）

- 根因是添加 API 浮窗开始关闭时，首页模型菜单保持隐藏；浮窗结束并隐藏后才重新执行菜单展开动画，导致遮罩淡出时短暂露出只有选择框的中间态。关闭按钮焦点还会随隐藏浮窗一起进入 `aria-hidden` 区域。
- 关闭开始后的下一任务先在遮罩下无动画恢复模型菜单并锁住交互，浮窗结束时直接解锁；选择器焦点与展开状态同步恢复。连接本地 Codex 的既有转场保留，不改 Provider、模型、API Key、Runtime 或资料状态；资源 URL 增加版本标识避免旧缓存继续表现原缺陷。
- 5 项关联 Node 回归、JavaScript 语法、VI 静态/负向门禁和 diff 检查通过。egolite 在 1280×800 点击关闭按钮、390×844 按 Escape 均直接返回模型菜单；20 ms 采样确认 26–426 ms 的全部关闭帧菜单可见且不可误触，结束后立即可操作、焦点回到选择器，无相关控制台错误或窄屏横向溢出。未调用模型、修改凭据或改写资料。

## 2026-09-17 — 一键本地部署包与下载入口（COMPLETE；本机测试分发）

- 按用户澄清交付 ZIP 本地部署包，不做 Apple App；Apple 芯片/macOS 14+ 构建目标，双击「启动 Ariadne.command」首次安装后打开原运行选择页。包内含独立 Python、官方 Codex CLI 0.153.4（下载 SHA-256 校验）、预编译 PDFKit/Vision 工具和相关许可证，不依赖原项目目录或开发工具。
- Codex 登录与公开网页配对分别作为可选 command；不自动登录、不预选 Codex、不执行模型调用，DeepSeek/Gemini 等现有 API 入口与能力资格原样保留。本阶段未扩展尚未完成的 Gemini 领域 adapter，不能把入口存在当作完整支持。新用户浏览器实测初始选择为 null。
- 安装位置为 Application Support/Ariadne Local，版本代码保留、数据共用独立目录；不迁移旧开发版资料，不复制凭据、运行数据、旧目录或私人原件。重复启动复用同版本服务，端口冲突明确失败，不杀已有进程或更换 origin。现有未提交的旧 Mac App 启动器继续保留。
- Codex 配对引导及工作空间点击 Ariadne 后的介绍浮窗新增本地下载入口；下载页显示平台、包大小与 SHA-256，检查实际 ZIP 存在后才提供链接。没有发布包的站点明确显示未发布，ZIP 和运行时仅保留在忽略目录，不进入 Git。
- 验证：安装器/下载状态新回归及相关 Codex、Provider、Gemini 连接、Runtime gating、介绍浮窗回归共 8 套件通过，VI 与公开文件/diff 检查通过。完整 ZIP 解压校验、脱离原仓库冷启动/重复启动/冲突拒绝、三页 PDF 完整转图及逐页 OCR、损坏 PDF 拒绝通过；真实浏览器下载 hash 相同，egolite 检查两个入口、390px 无横向溢出及未发布状态。PDFKit 首次无界面上下文创建失败已修复，历史失败包与 QA 原地保留，下载 metadata 只指向修复后的版本。
- 证据与分发产物在 `.cache/local-distribution/`，说明见 [本地部署包](docs/current/LOCAL_DISTRIBUTION.md)。仅在当前 macOS 26.6 Apple 芯片电脑验收，未完成全新电脑/Gatekeeper、全部 macOS 版本、公网 HTTPS 配对及所有 Provider 的真实模型验收；没有公开托管、配置 DNS、Apple 公证或 push。本阶段创建本地 commit，其他任务改动不纳入。

## 2026-09-15 — GitHub Run failed 定位与测试等待修正（COMPLETE；远端通过）

- 用户反复反馈的是 GitHub `Verify source and isolation` 工作流失败；此前误判为工具执行或作品集失败，现更正。读取实际 [失败运行](https://github.com/KAI-NEX/Ariadne/actions/runs/34973395385)：提交 `6367782` 的公开文件检查成功，离线回归 97/98，唯一失败为 `content_database_regression.mjs`，后续 VI/Gitleaks 尚未运行；旧日志只输出测试名，缺少退出码与错误正文，无法据此确认最终根因。
- 修正该测试的无界并发等待：在两个读取快照均返回后才继续事务，提交与重试走正常传输；等待参与者和本地 HTTP 请求均设 10 秒上限，消费直接响应并在失败时输出测试服务诊断。保留恰好一次成功、另一次版本冲突、回滚及原件完整性断言，不通过跳过测试或放宽产品约束消除红灯。
- 回归执行器打印失败退出码和日志尾部，超时保留已有输出及明确的 120 秒超时标记；避免 GitHub 临时运行机销毁后只剩一条 Run failed。非零退出及超时诊断的合成检查通过。
- 下载并校验 CI 同版 Node 22.23.2；本机 Node 24、Node 22 单项及仅含 Git 已跟踪文件的干净检出 98/98 回归通过，公开文件/VI/diff 检查通过。本地 Python 为 3.12，GitHub 为 3.11；本地未重现远端原失败，因此此条不宣称 GitHub 已恢复绿色，需将本次修改推送后实际复验。证据在 `.cache/ci-run-failure-20260915/`；未调用模型、改动应用数据或修改旧目录，原有未提交内容保留。
- 用户授权推送后，`ea7b1a4` 的 [远端日志](https://github.com/KAI-NEX/Ariadne/actions/runs/34975841919) 明确失败在测试服务的 `storage_test_server_timeout`，尚未进入数据库断言；此前并发屏障修改属于健壮性补强，不是已证实的远端根因。后续测试服务使用运行器的同一 Python，固定 loopback 服务名以避免构造时无关的 `getfqdn` DNS 查询，冷启动上限 30 秒；20 秒仍未就绪时输出 Python 栈，子进程早退/启动错误立即失败，端口按完整行验证。应用服务及模型等待预算不变；Node 22 的真实存储测试与缺失解释器快速失败检查通过，继续等待远端验收。
- 最终 `b121cdd` 已推送并在 [GitHub 实际运行](https://github.com/KAI-NEX/Ariadne/actions/runs/34976499436) 全部通过：98/98 回归、公开文件检查、VI 检查、全历史 Gitleaks 均成功且未发现凭据。已证实失败发生在测试服务启动阶段，修正后远端恢复；原日志不足以进一步断言 DNS 是唯一耗时来源。旧失败运行保留为历史，不删除或关闭验证来隐藏错误。

## 2026-09-15 — 修复完整作品集的 Codex 分析超时（COMPLETE）

- 用户新增的 25 页、约 24 MB PDF 在约 198 秒后以通用 `deepseek_network_error` 失败；Codex 原先对文字和完整 PDF 统一限时 180 秒，前端失败弹窗又未使用已有错误码文案。原件 hash 校验正常，短请求 Sol 调用约 13 秒成功。原失败没有保留细分超时诊断，因此不把历史通用错误码当作直接超时记录。
- 同一作品集、同一 `codex / gpt-5.6-sol / medium` 完整真实复验，在临时提高到 720 秒的诊断预算下耗时 425.16 秒（含转图）成功：25 页全部交付，5 个提案条目通过现有结构/来源校验。实际结果仅保存在忽略的本机 QA 目录，未写入用户 Working、确认资料或普通对话；原始 PDF 字节和 hash 不变。这证明原 180 秒预算不足，不宣称语义提取穷尽了每项经历。
- 正式 Codex 等待预算按实际交付图片数计算：文字/单图仍为 180 秒，每增加一张图增加 30 秒，最高 900 秒；该作品集为 900 秒。保留完整页面、模型/推理强度、并发上限、输出限制和失败关闭。Candidate 超时返回 `codex_timeout`，只记录 Provider、等待上限及图片数；弹窗显示对应原因与原件保留/重试说明，未知服务商正文不展示。
- 17 套相关回归及 VI 静态/负向检查通过，覆盖长材料超过旧期限仍完成、短请求/显式超时与子进程清理、HTTP 失败/幂等重试、完整 25 图、六域模型身份、Local 隔离、人工保存/旧版本及错误文案。跨域回归首次因测试进程 PATH 未含 Node 启动失败，补齐现有 Node 路径后通过，原日志保留。
- egolite 使用隔离存储和两页合成 PDF 验证超时、解析失败、刷新恢复原件、重试成功及再次恢复 Working：三次测试替身请求，真实 Provider 调用为零；失败 Working/Proposal/确认版本均为零，成功仅一份 Working/Proposal，人工确认记录仍为零，原件 hash 相同。桌面/390 px 错误提示及工作区可读；egolite 在改视口后截图裁切与 DOM 坐标不一致，使用同一浏览器 CDP 截图核对完整桌面，原截图保留。
- 当前 8000 服务已从本仓库重启加载修复，工作空间、导入页与 Runtime 接口 HTTP 200。复验证据保留 `.cache/portfolio-analysis-fix-20260915/`；仅提交本阶段文件，原有 Mac App、上下文和图谱改动保留，不 push、不修改旧 Learning OS 或清理原件。

## 2026-09-14 — 删除独立官网及动画试制（COMPLETE；仅本地清理）

- 用户明确要求删除这次制作的整个官网及动画试制，并保留 Ariadne 原网页。已移除独立 `website/` 工程（源码、依赖、构建、原视频、全部动画试片及生成/检查脚本）和 14 个对应试制缓存目录，共约 2.23 GB；官网 5173 / 4173 预览服务停止。
- 清理本文件和 VI 文档中的官网实现/试制条目，避免继续指向已删除资源。Git 历史不改写；共用 VI 资源、主应用 `public/`、`src/`、`app.py` 和数据目录均不修改，也不清理浏览器存储。
- 删除前后 180 个主应用文件 SHA-256 完全一致；8000 主应用服务保持同一进程，HTTP 入口正常。VI 检查、官网残留/引用检查和 diff 检查通过；仅提交本次删除与记录，其他任务未提交改动原地保留，未 push 或部署。

## 2026-09-13 — 修复历史来源迁移误判与首页统计（COMPLETE）

- 用户在 Codex 内置浏览器打开个人/JD 页失败。实查旧学习来源保存裸 SHA-256，新存储入口直接与 `sha256:` 加摘要比较；实际摘要一致，却误报原件不一致，完整主库迁移因此停止。个人页又把具体存储错误降成“操作未完成”。前次 egolite profile 的 376 条验收未覆盖当前 profile，这是验收遗漏；旧状态条目原文保留，当前范围已在上下文与存储契约澄清。
- 在共用存储入口兼容两种 SHA-256 表示，仅用于比较，不改原始 hash/ID/文件/未知字段；不同摘要、错误格式和其他算法仍拒绝提交，失败不激活半份索引。两域复用存储错误文案，服务端只记录错误码、操作和注册库名。首页区分读取中、失败和空库，并复用资料库的当前版本/生命周期查询，修复只统计旧演示卡片的问题；未增加领域迁移器、同步服务或本地识别。
- 实际报错 profile 主库 1,854 条完成迁移，所有引用对象通过磁盘完整性读取；114 条来源中的 57 份带摘要原件逐份一致（4 份裸摘要、53 份带前缀）。当前个人 36 张、职位 17 张，首页相同；三个页面无错误，实际窄视口无横向溢出。原工作区映射、旧 IndexedDB、未引用暂存文件及历史保留；投递库为空且已初始化，附件库未访问，不宣称已迁移。
- 96 套离线回归通过（61 Node + 35 Python），新增混合来源/摘要表示/错误摘要拒绝/字段与字节不变边界；共用读取抽取后，一项页面函数测试需同时装载新函数，修正测试装配并复验，原行为断言保留。五组隔离浏览器 QA 通过，覆盖失败重试、三个入口错误、两域编辑/人工保存/旧版本、首页计数、附件、原件归档、投递及历史页面；最后集合读取调整后复跑迁移/保存与投递组。VI 与 diff 检查通过。
- 本次在实际出错的内置浏览器直接恢复和目视检查，隔离 Chrome 自动 QA 使用合成资料；未将当前资料传给模型，未调用真实 Provider，归档组的模型失败请求为测试替身。证据原地保留 `.cache/storage-recovery-20260913/`，不作为新的模型语义质量认证。
- 仅本阶段本地 commit，不 push；原有 Mac App、公开入口和图谱未提交内容原地保留。

## 2026-09-12 — Markdown 内容库迁移（COMPLETE；按浏览器工作区切换）

- 按用户要求完成迁移和全链路接线：本机语义内容写实际 Markdown，原件保留 bytes；网页端用同格式浏览器 Markdown。Candidate/Job 卡片、Working、人工保存、个人补充、对话、投递、逐轮附件及四个历史页面共用同一存储边界。32 类语义记录采用无损正文区块，身份/来源/版本/状态保留；卡片只使用瞬时投影，不双写 JSON 正文。架构与恢复见 [Markdown 内容库](docs/current/MARKDOWN_CONTENT_STORAGE.md)。
- 共用一份跨语言存储注册契约，移除四个历史页面约 190 行重复建库代码；保留现有领域 API 与学习文件。主要职责为文件与内容库、卡片、范围上下文、模型执行、人工保存；没有新增部署服务、框架、向量库。共享兼容接口只支持现有 repository 使用的有限事务操作，不宣称重建了完整 IndexedDB。
- 原件逐份暂存，完成逐条 codec/来源 hash/文件回读校验后原子提交完整索引。旧数据库原地保留为备份；文件和历次索引不可变，删除/撤回不清掉原件。Web Locks + 文件锁 + read-set 版本检查保护并发；提交回执防网络丢响应重复保存。中断文件只留下未引用临时产物，不阻塞下一次重试；来源列表只读元数据，需要原件时再取 bytes。本机故障不自动切回旧库。
- 四类对话/理解 Provider 输入共用 scoped Markdown renderer，保留当前引用、来源/领域范围、覆盖预算、历史、类型化 action 与 Human Save。视觉导入继续使用原图/完整 PDF；正常 Local 仍仅归档，零 Provider/本地识别。修复原有 Local 编辑已确认 Candidate 缺 Working、Job 字段保存清空未知的问题，保存错误保留编辑并明确反馈。
- 96/96 离线回归通过（61 Node + 35 Python，包含 3 个新增存储 suite；不含另一任务的 Mac 启动器）；新边界覆盖未知文本与空白往返、原字节、暂存/提交失败重试、幂等、事务回滚、文件损坏、并发冲突、路径/origin 限制及历史保留。VI 静态/负向、脚本语法、文档链接和 diff 检查通过。
- 五组隔离 Chrome 浏览器 QA 通过：内容迁移/两域编辑保存、浏览器 Markdown、原件归档、投递记录、附件/历史页面。覆盖刷新、失败/取消/冲突、桌面与 390 px，无页面异常。egolite 实际交互通过；截图 API 超时，按现有授权由 Chrome 补齐截图。归档测试唯一模型 POST 是合成失败替身，其他存储 POST 不算 Provider 调用。
- 真实 Codex 沿原 `gpt-5.6-sol` 执行六条领域路径及两域明确修改。Candidate 完整两页 PDF 被传输并分别引用；Job 保留缺失摘要为未知；个人偏好只生成提案。修改实际返回 `PATCH_ITEM` 和 `PROPOSE_JOB_EDIT`，无确认写入。首次 Job 修改测试未同步 fixture 授权标记，模型文案声称创建而无实际修改；该轮不计修改通过，修正请求后重测成功，两轮证据均保留。不声称覆盖全部真实资料/模型语义质量或重新验收公开 HTTPS。
- 当前浏览器 `http://127.0.0.1:8000` 既有主库 371 条、投递 2 条、附件 3 条实际迁移，逐条字段与所有 Blob/File 的 SHA-256、名称/类型/时间相同；旧库未变。先保存迁移前数量清单，再切换并核对回执，迁移后资料页正常；未向模型发送这些既有材料。工作区定位与回执留在忽略的本机证据中，其他 profile/origin 独立。
- 只读核对 Ariadne 默认 CLI 的 `login status` 与 app-server `account/read(refreshToken=false)`：当前为 ChatGPT Pro、Apple 隐藏邮箱，无法可靠映射用户所说的两个别名；未切换登录/模型、未把邮箱/token 加入仓库。默认本机 8000 服务已启动新代码；其他 profile/origin 需在各自首次访问时迁移，不能推断全机已迁移。
- QA/合成源/真实模型结果/截图保留 `.cache/markdown-migration-20260912/`，最后离线结果在 `final/regressions/results.json`。原有 Mac App、公开入口及图谱未提交改动原地保留；仅本阶段本地 commit，不 push。

## 2026-09-12 — Local 原件归档（COMPLETE）

- 用户调整：本地识别最初用于学习，现在正式 Local 只保存原始资料，接入 AI 后再分析。修订 AGENTS、稳定上下文、Runtime 契约和内容简化文档；该决定取代此前保留正常 Local 确定性分析流程的要求。Markdown 主存储仍未迁移。
- Candidate/Job 共用归档逻辑；移除页面内本地 OCR 探测、提取、结构化及批次编排，`v1-pages.js` 相对前阶段净减少 301 行。保留原始 bytes、hash、文件名、用户材料类型、职位链接和有序来源组；粘贴文本不裁掉空行/首尾空格。同一 store 增加只含来源身份/顺序/链接/时间的轻量索引，无新表、依赖或服务；显式删除 Candidate 来源时包含相关索引。
- 两个导入页共用原生原件选择框，刷新后恢复；Local 或模型暂不可用时可保存，可用模型也有“只保存原件，稍后分析”。Candidate 继续逐份分析已有支持的图片/PDF/DOCX；TXT/Markdown 可归档，未扩大 adapter 支持范围。Job 恢复原顺序/链接并进入已有模型传输确认；修复恢复来源缺少 captured_via 时的契约错误，已有 Working 仅按完全相同来源组恢复。
- 保留模型能力资格、人工传输确认、技术输入准备、模型失败显式返回、Working/人工保存及旧版本；原有卡片/对话/历史审核继续可用。学习用 Local 模块和底层接口原地保留，正式导入不再调用，也不制造提案或确认内容。
- 验证：59 个 Node + 34 个 Python 已跟踪离线回归通过（93 套件）；旧学习契约测试继续保留，页面断言按新决定调整。扩充来源存储回归覆盖原字节/空白、顺序、重复保存、领域隔离、损坏/缺失、写入失败与删除索引边界。VI 静态和负向检查通过，无新增漂移。
- egolite 实际保存/刷新恢复并核对零 ProcessingRun/ExtractionArtifact/Proposal/revision；其截图 API 的 Page.captureScreenshot 超时，按现有授权改用独立 Chrome 测试会话补充桌面/390 px 截图。`tests/source_archive_browser_qa.mjs` 覆盖归档、重载、顺序、重复、存储失败/重试、模型不可用仍可保存、恢复后传输确认/取消，以及模拟模型失败保留原件。七组检查通过，无页面错误/横向溢出；Local 无 POST。唯一模型 POST 是隔离测试替身，不是实际 Provider 调用或模型质量证据。
- QA 原地保留在 `.cache/local-archive-20260912/`，最终浏览器证据在 `final-check/`。未操作真实用户工作区、外部 Provider 或凭据；未完成磁盘 Markdown 主存储迁移。其他图谱、Mac 启动器和公开入口改动按各自任务保留。

## 2026-09-12 — 内容架构复核与上下文简化（COMPLETE；Markdown 主存储尚未迁移）

- 按用户“人看卡片、AI 读多份 Markdown、保留原件、保留现有功能”的方向复核当前代码。新增[内容架构复核与简化](docs/current/CONTENT_ARCHITECTURE_SIMPLIFICATION.md)：十二类职责中五类保留保护、五类合并实现、一类按规模启用、一类隔离兼容；目标为文件与内容库、卡片界面、上下文准备、模型执行、修改保存五项职责，附现有功能保留表与主存储切换的完成条件。分类不代表删代码比例；当前 IndexedDB 仍为内容权威，未把新增文档说明当作已实施迁移。
- 个人及 JD 关联上下文、职位集合上下文在完整当前语义可放入预算时不再先按单条 6,000 bytes 截取。小集合职位讨论只执行 DISCUSS，不强制生成摘要；不同模型配置的旧概况不注入当前请求。超预算/超过条目限制的集合继续全量分片综合和缓存，显式更新、来源/权限/版本/保存边界保持。共用分批及模型配置身份函数，旧缓存键格式、Provider/model/提示版本与用户数据不改，更新四个页面资源版本。
- 93/93 已跟踪离线回归通过（59 JS + 34 Python，隔离环境 `ARIADNE_CODEX_ENABLED=0`），包含导入、来源恢复、字段操作、人工保存、模型资格、附件、文件交付、投递阶段与新增长正文/小集合直答/大集合综合/失败/缓存隔离检查；最终等待文案调整后另复跑 Job Node/Python。VI、文档链接及 diff 检查通过，不包含未跟踪的 Mac 启动器 suite，不作为真实模型质量证明。
- egolite 在独立合成工作区验证未确认零请求、三份职位一次 DISCUSS、刷新恢复、失败保留与 390×844 重试；截图接口 `Page.captureScreenshot` 超时，本机 CUA 只能取得浏览器 New tab 画面，随后独立 Chrome 补齐 1280×800/390×844 两页截图和真实 UI 操作。个人页完整 9,208 bytes 证据进入一次请求，职位内容未混入；来源、Candidate/Job 记录逐项未变、个人确认补充为零、页面错误/横向溢出为零。初始 Job 截图采样在逐字呈现途中，等待来源链接全文后另存 complete 截图复验；原截图保留。
- QA、测试替身、日志及截图保留 `.cache/architecture-simplification-20260912/`；没有发送私人材料、发起真实模型推理或迁移用户资料，主服务无需重启。更新项目上下文、领域说明与图谱台账，当前架构图不提前绘成 Markdown 主存储。仅本阶段本地提交，不 push；原有 Mac App、公开入口和其他图表未提交内容保留。

## 2026-09-12 — 职位卡片显示原始链接（COMPLETE）

- 有原始链接的职位卡片底部显示「职位链接」及域名/路径，长地址单行省略；点击在新标签打开原地址，不误开 Ariadne 详情或状态菜单。无链接的卡片不显示占位。
- 同时兼容确认职位的 `source_url` 与旧本地记录的 `imported_from.source_url`，只呈现 HTTP/HTTPS 地址；不请求来源站点、不修改职位或投递状态。
- 职位阶段与 Candidate/Job parity 回归、浏览器 QA 脚本语法、VI 静态/负向检查通过；egolite 以临时 DOM 合成长链接核对 1280×800 和 390×844 的 24 px 对齐、文本省略及无横向溢出，未写入实际资料或打开外部链接。

## 2026-09-12 — 资料库留白压缩与已结束职位置底（COMPLETE）

- 个人资料库和职位库共用的标题到卡片间距按用户要求缩减约 3/4：由 `78–148 px / 14vh` 改为 `20–36 px / 3.5vh`，保留原网格、标题、返回与卡片尺寸。
- 职位库移除「关注中／已结束／全部」筛选，始终显示全部卡片；卡片内四阶段下拉及保存/冲突边界不变。已结束卡片稳定排在未结束卡片之后，两组内部顺序保持；重新开启后回到未结束分组。
- 职位阶段、Candidate/Job parity、生命周期、职位基础与职位概况相关 Node 回归，以及 VI 静态/负向检查通过；egolite 在 1280×800、1920×862 和 390×844 验证两页间距约 28–30 px、筛选为零、已结束置底、无错误覆盖或横向溢出。egolite 截图接口连续超时，改用本机 Computer Use 完成两页直接视觉检查；未修改真实职位状态、资料或调用模型。
- 本阶段仅创建本地 commit，不 push；原有 Mac App、公开入口和 Archify 未提交内容原地保留。

## 2026-09-12 — 投递标签紧凑化与首页同款动效（COMPLETE）

- 复用首页 runtime selector/menu/chevron 的淡入下移展开、收起、箭头 180° 翻转、悬停与按下阴影；按用户追加要求保留原卡片标签圆角形状，不套用首页按钮外形。文字和 14 px 箭头间距 8 px，标签宽度由 108 px 收至当前 84 px，整体左移 2 px；正文卡片和详情备注不改。
- 菜单支持键盘方向/Home/End、Escape/Tab、外侧点击与视口变化收起、选中勾及减少动态效果；选择后仍走原修订校验/持久化链路，失败保留原状态，打开菜单不写入记录或误开详情。
- 94/94 离线回归、VI 静态/负向检查通过；egolite 对照首页动效并实际打开/选择/刷新、核对 999 px 圆角；独立 Chrome 合成数据回归覆盖桌面/390 px 菜单、翻转/键盘/减少动态效果、84 px 宽度/8 px 间距/2 px 左移，以及既有备注、冲突和存储失败保护，无页面错误/横向溢出/POST。QA 留在 `.cache/job-stage-menu-20260912/`，未改真实用户数据或调用模型。
- 仅本阶段本地 commit，不 push；原有 Mac App、公开入口和 Archify 未提交内容原地保留。

## 2026-09-11 — 投递状态合并到卡片标签（COMPLETE）

- 按用户反馈把卡片左上角「职位描述」改为四阶段原生下拉，选择即保存，不打开独立页面或进度弹窗；移除卡片底部状态/备注，列表只保留关注中、已结束、全部同页筛选。状态选择与卡片正文链接互不嵌套，不误开详情。
- 结束结果和备注改在职位详情「投递记录」中编辑，支持保存、取消与失败保留，浮窗/独立页一致；已有状态、备注及历史原地保留，不改职位内容、Candidate 或 AI 上下文。跨页更新不覆盖正在编辑的输入，保留修订冲突保护；详情展开期间延迟刷新背景卡片，保留缩回位置。
- 修复实测发现的列表错误提示误用导入处理器、浮窗隐藏备注保存反馈；沿用 VI 字段/文字操作/图标，更新资源版本。既有生命周期测试改为明确定位资料编辑操作区，保留原确认/取消/删除断言，避免误取新备注表单。
- 94/94 离线回归、VI 静态/负向及 diff 检查通过；egolite 实际验证状态、详情备注保存及截图，独立 Chrome 自动化验证一键切换、刷新、隐藏/恢复、取消、跨页冲突重试、存储失败回滚、来源记录不变与 1280/390 px 布局；无页面错误/横向溢出/POST，未操作真实用户资料或模型。QA 保留 `.cache/job-stage-chip-20260911/`，可重复脚本为 `tests/job_application_browser_qa.cjs`。
- 仅本阶段本地 commit，不 push；原有 Mac App、公开入口和 Archify 未提交内容原地保留。

## 2026-09-11 — 职位卡片投递阶段（COMPLETE）

- 每张职位卡片新增未投递、已投递、推进中、已结束；结束可选填简历未通过等结果及备注。默认关注中收起已结束，可按阶段/全部找回或重新开启，不删除职位。
- 用户进度以稳定职位 ID 独立持久化，事务保存当前记录与历史，修订校验防跨页覆盖；失败保留原记录，刷新及缓存页面恢复可继续使用。同步修复首次直接打开职位库时 Demo/Truth 共库初始化顺序，不改变职位/个人确认数据及 AI 上下文。契约见 [职位投递阶段](docs/current/JOB_APPLICATION_STAGES.md)。
- 94/94 离线回归及 VI 检查通过。egolite 验证阶段保存/结束隐藏，截图接口超时后由隔离 Chrome 补齐桌面/390 px 呈现、刷新、取消、重新开启、跨页冲突、事务失败与页面恢复检查；合成来源记录未变，无页面错误/横向溢出/POST，不作为真实模型质量验收。
- QA 留在 `.cache/job-stages-20260911/`；仅本阶段本地 commit，不 push。原有 Mac App、公开入口和 Archify 未提交内容原地保留。

## 2026-09-11 — AI 对话等待动画缩小 50%（COMPLETE）

- 按用户反馈将 WavePhysicsLoader 的三档响应式比例由 `.6 / .75 / 1` 统一减半为 `.3 / .375 / .5`，因此动画容器、柱条、小球和运动幅度保持同一比例整体缩小 50%；15 柱、201 帧、4 秒循环、状态文案与轨迹不变。
- 六个对话入口同步样式资源版本；发送按钮及其动画、非对话导入加载、模型调用和资料保存逻辑均未改动。
- 波浪轨迹回归、VI 静态/负向门禁及 diff 检查通过；egolite 在桌面和 390 px 窄屏挂载等待状态，核对动画容器尺寸分别为 146 × 96 px、87.6 × 57.6 px，发送按钮仍使用原 0.82 秒旋转。未调用模型或改写资料。
- 仅本阶段本地提交，不 push；Archify 图表、Mac 启动器与公开入口等其他改动原地保留。

## 2026-09-11 — Archify 安装与 Ariadne 架构分析（COMPLETE）

- 按用户要求安装 `tt-a1i/archify` 的 Archify Skill（本机 `~/.codex/skills/archify`，包标识 `2.17.0-dev.1`），doctor 通过。基于 `1b39747` 实际代码生成[分析报告与交互架构图](docs/architecture/archify/2026-09-11/README.md)，保留 typed JSON、交付哈希、来源文件指纹与上游 MIT 许可；未把 Skill 源码或依赖加入产品运行时。
- 图示来源、Candidate/Job、范围上下文、Runtime 门禁、本机服务、Local/Model、Working 与 Human Save。报告区分逻辑关系和网络路径，指出页面/HTTP 编排集中、跨语言契约同步、真正流式与公开 HTTPS 验收边界；本次没有改应用、Provider、模型选择或用户资料，没有发起真实模型调用。
- Archify showcase 校验与交付 9/9、0 errors、0 warnings；自带 visual-check 在四种桌面尺寸通过，四张浅/深色截图经目视检查。egolite 实际验证搜索、节点详情关闭、导出菜单和 SVG 下载，导出结构/核心节点检查通过。11/11 相关离线 suite、VI、文档链接和交付字节校验通过。
- 当前 `1b39747` 已修正此前 Job Model 导入的 `createMessage` 断言，本次 suite 重跑通过；此前失败条目作为历史保留。当前已跟踪默认回归文件为 58 JS + 34 Python，本次只运行所列 11 项，不声称全量或模型语义质量验收。
- QA 截图/浏览器回执原地保留在图表目录，其他中间证据与 SVG 样本保留 `.cache/archify-20260911/`；仅本次交付文档/图源/HTML/摘要本地 commit，不 push。原有 Mac App 和公开入口未提交改动保持原样。

## 2026-09-11 — DeepSeek V4.1 Flash 迁移与单次确认更新（COMPLETE）

- 按用户授权将当前 DeepSeek 多模态执行统一迁移到官方 `deepseek-flash`；保留协议与领域权限，更新 descriptor 指纹，旧实验型号仅做当前偏好映射与历史元数据兼容。Codex/Local、旧快照/消息、资料与确认数据不批量重写。当前服务已重启，8000 返回新型号及新目录。
- 首页及六个对话入口共用轻提示：DeepSeek 可见空闲页面自动读取账号型号，成功发现缓存 15 分钟；只读发现无推理/材料传输。一次点击「验证并切换」同意少量合成图片/PDF 测试费用，验证通过按原 scope + Web Locks/CAS 直接切换；失败、并发、型号撤销、未知 adapter、运行中/跨页选择变化不覆盖原选择。未适配型号只提示，同 ID 背后权重升级无法靠模型列表发现。
- 真实合成图片与完整两页视觉 PDF/结构化输出通过，Candidate/Job PDF 导入、两域对话、个人理解和职位概况六条领域执行通过并检查来源/未知/人工保存分层。首轮 Job 测试长行出界，修短合成行后单独重跑，完整读出要求；两轮原件与响应保留，不声称实际资料质量普遍无误。
- 79 项离线回归中 78 项通过；唯一失败为此前已记录的 Job Model 导入 `createMessage` 源码正则断言（HEAD 同样失败），未放宽该断言。新增迁移/历史、发现缓存、确认/缺页/响应错误、Local 零调用和切换冲突回归通过；VI 静态/负向、来源隔离、diff 与公开文件门禁通过。egolite 验证真实控件的一次点击、失败保留/成功换标签、旧首页偏好迁移、六入口加载、桌面/390 px 无溢出；浏览器切换使用合成响应替身，真实模型证据另存。
- 契约见 [DeepSeek 模型更新](docs/current/DEEPSEEK_MODEL_UPDATES.md)，QA 保留 `.cache/deepseek-v41-20260911/`；本阶段仅本地 commit，不 push。既有 Mac App/公开入口未提交修改原地保留，不混入本次提交。

## 2026-09-10 — AI 对话等待改为波浪弹跳动画（COMPLETE）

- 按用户给定 WavePhysicsLoader 代码复现 15 根柱条、201 帧、4 秒往返、四次弹跳/单程、落地压缩/波峰下压与渐变；在原生页面用 Web Animations 接入共用 processing 组件，不引入 React/Framer 运行时。只替换六个对话 status，发送按钮及其 0.82 秒旋转、非对话导入加载不改。
- 新增 light/dark 色彩端点到 VI manifest 并生成 tokens，保留 .6/.75/1 响应式比例、状态文字与 aria-busy；进度更新复用动画，离屏/后台暂停、缓存恢复续播、减少动态效果静态呈现，完成/失败清理。处于历史底部时跟随新等待内容，向上阅读时不强制跳动；同步资源版本。
- 新轨迹/生命周期回归及九项相关 Node suite、VI 静态/负向门禁与 diff 检查通过。核对发送按钮函数完全未变；egolite 实际挂载 15 柱并确认按钮旋转。隔离 Chrome 在六入口 1280/390 px 检查 16 条同步动画、4 秒时长、进度不重启、减少动态效果与停止清理，另采样实时时序、落地/腾空/循环和 dark 色彩，无页面错误/横向溢出/POST。未打开的导入工作区使用原控件的可见合成容器验收，不冒充真实模型等待；未调用模型或保存资料。
- 代码、截图与采样保留 `.cache/wave-loader-20260910/`。仅本阶段本地提交，不 push；Mac 启动器/公开入口相关修改原地保留。

## 2026-09-10 — 工作区加载提示栏内居中（COMPLETE）

- 修复「正在整理职位信息」偏右/偏上的两个原因：长文件名撑大左栏隐式网格列，以及加载提示父区域未建立居中布局。共用左栏显式限制单列宽度；只在加载态启用内容区水平/垂直居中、对称留白，不保留单侧滚动条槽。Candidate 共用同一修复，标题、底部保存与右侧进度逻辑不变。
- 更新两个导入页样式版本，避免缓存旧布局。共享 shell、Candidate Model、处理指示器回归及 VI 静态/负向、公开文件/diff 检查通过。egolite 用合成长文件名和共用加载状态函数复现偏移；修复后 Job 桌面/390 px、Candidate 共用栏内中心差均为 0，加载结束恢复普通 block 内容布局与表单。
- 额外运行 Job Model 导入回归时，既有 `createMessage` 直接赋值源码正则断言失败；核对 HEAD 同样不匹配，相关源码/测试本次未改动（当前已包装为包含输出文件的消息对象），不是本次布局引入。没有放宽该断言或顺带修改消息逻辑。
- 截图保留 `.cache/workspace-loading-center-20260910/`。本次仅验证加载呈现，不触发真实导入/模型或资料保存；仅本阶段本地提交，不 push，原有 App/域名修改保留。

## 2026-09-10 — 传输提示统一为 VI 纯文字浮层（COMPLETE）

- 按引用任务「AriadneVI」和当前 VI 规范，将两页不可定制的原生校验气泡替换为共用纯文字 popover：没有感叹号/尖角，12 px 字号、12 px 圆角、8/12 px 留白，宽高随文字，使用现有色彩与轻阴影 token。
- 保留聚焦勾选框、alert/描述关联；勾选、离开焦点、外侧点击或 Esc 收起，重复点击复用单个提示，视口变化重定位。仍未勾选零发送，勾选后不二次确认，未改变资料或模型权限。
- 6 项相关 Node 回归、VI 静态/负向、公开文件/diff 检查通过。egolite 两页桌面/390 px 实际检查无图标、12 px 字号/圆角、文字自适应及关闭/焦点；发现旧样式缓存后更新两页 CSS/JS 资源版本并重测。QA 截图（含首次缓存未刷新状态）原地保留 `.cache/consent-hint-vi-20260910/`，未调用真实 Provider 或提交对话/资料。
- 仅本阶段本地提交，不 push；其他并行回复标签及 App/域名修改保留，不合并进本次提交。

## 2026-09-10 — 移除回复旁的模型与强度标签（COMPLETE）

- 共用消息渲染器不再给助手气泡追加「Sol · 中」等模型/强度标签，删除仅为标签查询历史快照的读取与对应样式；六入口同步资源版本。回复正文、来源链接、文件输出、执行快照及输入区模型选择保留。
- 回复逐字显示、历史滚动与共用界面三项 Node 回归、VI 静态/负向及 diff 检查通过。egolite 确认当前页面无标签；隔离 Chrome 在 1280/390 px 的两整体对话页检查带内联快照与历史引用的合成回复，无标签/额外快照读取/页面错误/POST，原快照不变。未调用模型或修改真实聊天资料；截图和脚本保留 `.cache/reply-label-20260910/`。
- 同步 VI 与模型架构的展示约定，仅本次本地提交，不 push；其他传输确认提示、App/域名改动保留。

## 2026-09-10 — 个人补充确认按钮改为文字操作（COMPLETE）

- 「待确认的个人补充」复用现有 `v1-edit-text-action`：确认保存为黑色，暂不采纳为灰色，均无背景、边框或阴影；保留原字号、间距、44 px 热区、悬停下划线和键盘焦点。确认停止使用同样复用该确认样式，保存/拒绝事件及持久化权限不变。
- 个人理解领域回归、VI 静态/负向和 diff 检查通过。egolite 当前没有待审补充；使用隔离 Chrome 和合成只读提案在 1280/390 px 检查正常、hover、focus 样式与截图，未实际保存/拒绝、写入资料或调用模型。证据保留 `.cache/memory-actions-20260910/`。
- 仅本项本地提交，不 push，其他 App/域名记录原地保留。

## 2026-09-10 — 整体对话发送提示与重复确认修复（COMPLETE）

- 原因：两个整体对话页把未勾选作为按钮禁用条件，点击无反馈；连接层又独立弹出通用 Provider 确认。现在未勾选可点击发送，复用原生校验浮提示并聚焦底部勾选框；已勾选直接发送，不再重复确认同一接收方。职位说明同时明确相关对话历史与 Codex / OpenAI 接收方。
- 共用确认绑定当前 operation/scope、模型/参数和选择修订，仅保留页内存；取消勾选或切换模型后旧确认无效，旧 sessionStorage 不能越过未勾选状态。Local/无资格/忙态、附件独立确认、发送快照/来源/人工保存边界保留；其他无底部勾选的对话不删除唯一披露。
- 12 项相关 Node 回归、JS 语法、VI 静态/负向及公开文件/diff 检查通过。egolite 两页实际验证未勾选零 POST 与浮提示，勾选后各一次合成失败请求、零 confirm、失败草稿恢复，以及模型切换失效、桌面/390 px 提示和焦点，无页面错误。测试使用页内偏好、独立 QA 数据库及网络失败替身，无真实模型调用/私人资料外发；截图保留 `.cache/conversation-consent-20260910/`。
- 架构与 VI 说明更新，仅提交本阶段文件，不 push；原有 App/域名相关未提交修改原地保留。

## 2026-09-10 — 首页选服务、对话内切同服务模型（COMPLETE）

- 六入口共享菜单仅列首页当前 Provider 下、目录及对应多模态 operation 验证通过的所有型号/参数组合；Codex 当前仅 GPT Sol 三档，DeepSeek 需先在首页切换。每次打开重读目录，同 Provider 多型号不截取首项；千问/Qwen 与 Gemini 的 API/密钥入口保留，未新增或宣称完成其领域执行接入。
- 共用选择解析、旧 operation 兼容路径及偏好写入一并锁定首页 Provider，不只是隐藏菜单选项。跨 Provider 旧偏好原地保留但不覆盖首页；切换首页/scope 收起旧菜单，陈旧发送准备拒绝，Local 与来源、确认、执行快照边界不变。
- 6 项相关 Node 回归通过，更新既有浏览器 QA 的新契约断言并通过语法检查（该 Playwright 脚本本次未运行）；新增合成目录/权威回归验证同服务多个模型、未知/无资格排除及跨服务写入零变更，不作为新型号能力认证。VI 与公开文件/diff 检查通过。
- egolite 实际验证 Sol 三档/DeepSeek 单项、旧覆盖失效但保留、Provider 切换收起、忙态禁用、切换保留草稿、Escape 与焦点、390 px 无溢出、首页 Qwen/Gemini 入口。选择写入使用页内内存替身，不改用户偏好或资料、无 Provider 调用；截图保留 `.cache/provider-scoped-models-20260910/`。架构与 VI 说明同步；仅本阶段本地提交，不 push，原有 App/域名修改保留。

## 2026-09-10 — 按对话意图交付文件（COMPLETE，创作型生图未接入）

- 移除六入口每条助手回复后的“导出 PDF / 导出图片”。原领域模型在同一次结构化调用中选择普通文字、介绍文档 PDF、有界节点连线图 PNG 或明确暂不支持；不增加关键词分类器/额外分类调用，不修改选定模型、强度或工具权限。
- 共用交付契约、后端/前端双重校验与消息持久化：原领域/来源/版本边界先通过，文件提案随成功对话保留，不进入确认 Candidate/Job；重开可本地再生成，有界历史摘要保留非确认标记。失败显示重试、不伪造下载；重绘/离开回收 Blob，图片可预览放大。
- 四域 Runtime、Codex 六域身份与推理强度、Candidate 集成/持久化、个人理解/职位概况、对话显示/滚动/草稿、文件边界/PDF 字节及 VI/diff 回归通过。合成资料真实 Sol medium 四类请求均选对输出类型，单次约 12–21 秒；不将此当作速度基准或六入口真实端到端认证。
- egolite 六入口实际共享渲染验证普通消息零导出按钮、文件自动生成；真实模型的合成内容成功下载 PDF/PNG，检查 A4 中文渲染、390 px 无横向溢出、重试成功及旧 URL 回收。初次重试 QA 受页面 focus 重载合成 DOM / 画布异步等待影响，调整为独立测试节点并分轮确认后通过；证据及初次尝试均保留 `.cache/conversation-delivery-20260910/`，未写入用户对话/确认资料，未上传私人内容。
- [输出契约与边界](docs/current/CONVERSATION_OUTPUT_AND_STREAMING.md) 已更新。PDF 仍是不可选择文字的栅格排版；PNG 是流程/关系图，不是照片或创作型插画，后者明确未接入。真 Provider 流式未在本阶段实现。已在同一 8000 origin 更新本地服务；只提交本阶段文件，不 push，原有 App/域名相关未提交修改保留。

## 2026-09-10 — 两行输入区与开场顶部对齐（COMPLETE）

- 六入口共享输入区默认/最小从 96 px 改为 64 px：两行 20 px 文字加上下各 12 px 留白；保留鼠标拖大/缩回、方向键与 Home，原文字、附件、模型及发送逻辑不变。
- 个人理解/职位概况移除开场上方额外间距，提示顶部与返回按钮热区底部对齐，三个快捷入口随整组上移；输入框底部工具、发送和页面底部留白保持，相关 CSS 资源版本同步。
- 54 项 Node 回归、VI 静态/负向和 diff 检查通过。egolite 核对实际 64 px 与顶部对齐并截图；隔离 Chrome 验证两页 1280/390 px、两行中英文无滚动、鼠标/键盘调高与最小限制、六入口与模型菜单/失败草稿/附件边界，未调用真实模型或改写用户资料。浏览器证据保留 `.cache/two-line-composer-20260910/1789015852138/` 和 `.cache/model-selection-20260910/browser-1789015864236/`。
- 本地原 8000 端口无服务，已从项目启动以供验证/继续使用；仅本阶段本地提交，不 push，其他 App/域名记录保持未提交。

## 2026-09-10 — 整体对话开场提示与底部布局（COMPLETE）

- 「了解我」「了解职位概况」内部移除固定可见标题，空对话仅展示「关于这些信息或许你想问」和三个入口。共用 intro 状态在选择入口或开始第一轮发送后隐藏，失败/重绘不复现；读取历史前隐藏，已有对话不闪现开场。职位页第三项改为跳转个人对话的「回顾我的项目与经历」，移除原底部链接。
- 两页底部传输/费用文案精简并继续读取当前选定模型；职位页说明不发送个人资料，个人页如实说明发送相关个人资料与对话历史，保留原有传输确认、模型切换重新确认及资料保存边界。未将职位的范围声明错误应用于个人对话。
- 两页以视口高度布局，底部仅保留 8 px / 安全区；保留独立消息滚动、框内工具、发送和拖动调高。使用现有 VI 与共用提示按钮样式，页面资源版本同步。
- 验证：10 项相关 Node 回归、VI 静态/负向门禁与 diff 检查通过。egolite 实际验证提示选择后隐藏、填入问题、输入焦点和 8 px 底边距；因该浏览器既有截图接口技术超时，用隔离 Chrome 检查 1280/390 px 两页空态、选择、首轮等待、失败恢复、历史回显及底部位置，无页面错误、横向溢出或 POST。发送/历史使用合成领域替身，未调用模型或写入真实资料。
- 截图、脚本与结果保留 `.cache/chat-intro-20260910/`。只为本项创建本地提交，不 push；Mac 启动器及公开域名记录等其他改动保留。

## 2026-09-10 — 加大输入框与轻量上拉模型菜单（COMPLETE）

- 六个对话入口共用 96 px 最小文字区、底部附件/模型工具行与框内右下角发送按钮，保留原发送、拖动调高及附件确认行为；同步资源版本避免旧缓存混合布局。
- 模型菜单仅保留「选择模型」和已验证组合（Sol 低/中/高、DeepSeek Vision），点选即保存当前对话并收起；无复杂说明或应用/默认/关闭按钮。选择资格、修订冲突、范围隔离与传输确认未改变，默认模型/强度未修改。
- 验证：53 项 Node 回归、VI 静态/负向及 diff 检查通过；egolite 实际控件读取，截图接口超时后隔离 Chrome 验证 1280/390 px、六入口内嵌发送、菜单向上/键盘、刷新/跨页冲突、附件确认失效、失败输入/附件保留、忙态和陈旧请求零 POST。使用合成资料/Provider 替身，无真实模型调用或确认资料改写；本次不重新宣称模型质量验收。
- 截图与结果保留 `.cache/model-selection-20260910/browser-1789010223662/`；同步 VI 与模型选择架构修订，仅本次文件本地提交，无关 App/域名记录原地保留，不 push。

## 2026-09-10 — 个人对话连续性与单次直答（COMPLETE / STREAMING STILL PENDING）

- 定位到最多四轮/整组预算遇长回复停止、资料指纹变化过滤全部历史、普通讨论强制先刷新画像三个原因。实际浏览器本地检查发现用户自述和 Ariadne 项目记录均存在；修复后相关原话、目录和项目正文均进入当前请求，不将开发对话或仓库代码自动同步为用户档案。
- 历史优先保留预算内用户原话、分离旧助手推断；资料变更不等于忘记用户说过的话。撤回/替换/来源失效的记忆禁止经原聊天回合复活。检索提高标题命中优先级，加入有界资料目录；模型负责区分已知本人关系、缺少细节与覆盖不足，不新增 Ariadne 专属识别规则。
- 普通「了解我」直接基于当前证据执行一次 DISCUSS，复用仅当前资料/有效配置匹配的画像；完整刷新仍为独立操作。更新提示和费用文案，prompt v5 与缓存失效一致；不修改 Provider、强度或确认资料权限。
- personal/job-overview、模型设置 Node，personal runtime/Codex 六领域 Python 及 VI/diff 回归通过；真实 Sol/medium 合成测试承认虚构项目由用户发起独立负责、未编造细节、无提案/保存，耗时 23.45 秒（非速度对照基准）。egolite 只读检查实际上下文，并以合成内存数据库/模型替身执行浏览器领域路径和渲染，单次 DISCUSS、旧助手过滤、零确认写入；截图技术超时后以隔离 Chrome 补查 1280/390 px 文案与布局，无页面异常或横向溢出。不冒充用户私人材料端到端模型验收。
- 证据保留 `.cache/personal-continuity-20260910/`，细节见[个人理解实现更新](docs/current/ARIADNE_PERSONAL_UNDERSTANDING_V1.md)。核对主服务 cwd/空闲状态后重启，原 8000 origin 和资料保留。仅本阶段本地提交，其他 App 启动器/域名改动原地保留，不 push；真正流式及此前未完成的模型主动文件输出仍待实施。

## 2026-09-10 — 首页简称与对话内模型/强度切换（COMPLETE）

- 首页使用 GPT Sol / DeepSeek Vision 简称；六个对话入口共用左下 sliders + 模型/强度菜单，支持当前对话覆盖、设为默认、恢复默认、刷新与跨标签同步/修订冲突提示。当前默认保持 Sol/medium，提供 low/medium/high；DeepSeek 使用已验证固定参数，没有新增型号/Provider 或自动继承开发任务配置。
- 单一参数目录、版本化 execution_settings、前后端校验与六领域实际参数贯通；旧历史可读但新请求缺设置拒绝执行。选择只影响下一轮，准备中变更拒绝发送、运行中本页不可切换；绑定当前对话的资料/历史/来源摘录/附件重新确认，失败保留输入与附件。导入指纹及个人/职位摘要缓存按真实有效设置隔离，历史标签使用当轮快照，确认资料与旧记录不重写。实际字段、旧偏好迁移与未来模型接入步骤见[架构实施记录](docs/current/MODEL_SELECTION_AND_TUNING_ARCHITECTURE.md)。
- 验证：53 项 Node suite、11 项相关 Python suite、VI 静态/负向与 diff 检查通过；六领域各三档参数到 Provider 边界共 18 种组合通过。真实本机 Codex 对 low/medium/high 各执行虚构短文本 smoke 并成功返回；不冒充真实资料/视觉质量或速度基准验收，不承诺加速倍数。
- egolite 检查实际菜单与服务；隔离 Chrome 验证六入口挂载、同源 Candidate scope、两对话默认隔离、同对话跨页恢复/冲突、DeepSeek 隐藏不支持参数、切换附件确认失效、失败输入/附件保留、旧请求零 POST、忙态、1280/390 px 菜单与 Escape；无页面脚本错误。证据保留 `.cache/model-selection-20260910/`。核对 8000 服务身份与空闲状态后重启，原 origin 与资料保留；仅本次文件/共享文件相关段落本地提交，不 push，其他任务改动原地保留。

## 2026-09-10 — 对话回复文件导出与耗时显示（EXPORT COMPLETE / TRUE STREAMING PENDING）

- 六个对话入口共用本地 PDF／分页 PNG 导出、图片预览及下载；输出来自单条回复，不额外调用模型、不写入确认资料。PDF 为保留中文排版的图片式 PDF，文字暂不可选取；尚未实现模型主动文件提案、语义图表或 AI 创作图片。
- 显示真实等待／处理耗时，移除发送前默认 800 ms 固定停顿。当前仍由 Provider 完成后交付整包，既有逐字动画不是真正流式；没有降低推理强度或移除最终内容校验。
- App Server 仅作本机协议/config 只读探测，发现继承 MCP 配置；新连接尚未证明与原隔离 exec 路径等价，因此没有切换生产传输、开启工具或发起模型请求。剩余架构与验收条件记录于[对话输出与流式边界](docs/current/CONVERSATION_OUTPUT_AND_STREAMING.md)。整体需求仍未全部完成。
- 新增输出回归及原 reply/scroll/draft 回归、VI/diff 检查通过；egolite 点击接口超时后隔离 Chrome 完成六入口控件、实际下载、中文三页 PDF/PNG、1280/390 px 和计时检查，零 POST。修复实际发现的导出区并排错位。PDF 读取/逐页渲染与 QA 原件保留 `.cache/conversation-output-20260910/`。本阶段仅本地提交相关改动，并行模型设置及 App 启动器等改动原样保留，不 push。

## 2026-09-10 — 首页简化与对话内模型调节架构（ARCHITECTURE DOCUMENTED / IMPLEMENTATION PENDING）

- 按用户确认方向整理[统一模型选择与对话内调节架构](docs/current/MODEL_SELECTION_AND_TUNING_ARCHITECTURE.md)：首页使用 `GPT Sol` 等目录简称，对话左下显示模型/强度；共用选择组件覆盖六入口和 Candidate 逐条回答，模型与连接身份分离，不为 Codex 单独建控制链。
- 明确全局 Local/Model 门禁、应用默认与完整对话覆盖、按模型能力生成参数菜单、每轮不可变有效设置快照、指纹/缓存隔离、跨接收方上下文及附件重新确认、旧操作偏好的显式迁移和旧历史保留。Runtime 主契约新增目标架构补充，Codex 运行指南区分当前固定 Sol/medium 与未来可调设置。
- 本阶段仅文档；未修改页面/运行代码、默认模型、推理强度、服务或用户数据，未新增 Provider/型号或模型调用。不声称控件上线、已提速或新模型已通过多模态资格。文档链接、职责/状态一致性和 diff 检查作为本阶段验收；后续按目录/解析、快照/执行、六入口 UI、逐模型验收的依赖顺序实施。

## 2026-09-10 — 对话框内嵌附件与透明加号（COMPLETE）

- 六入口取消外置「附件·可粘贴图片」折叠区，直接把图片/文件缩略卡片放在同一个输入框的文字上方，支持粘贴、拖放、横向滚动与移除。左下透明 plus 与右侧发送箭头分离；发送通用样式及两个整体页的运行门禁只定位 submit，更新资源版本避免旧附件 CSS 缓存。无附件时不显示说明区，传输确认仍按需显示；支持格式、大小预算、领域、当前轮与人工保存边界不变。
- 9 项相关 Node 回归与 VI 静态/负向检查通过。egolite 检查六页组件挂载、透明加号/发送图标区分；实际「了解我」在 1280/390 px 验证图片缩略图、文件卡片、混合粘贴文字、拖放反馈、移除后焦点、未确认阻止发送与横向滚动。prepare/finish 回执替身验证未确认拒绝、处理中禁止添加、失败保留与成功清空；未调用真实模型或改写个人确认资料，不将 UI 验收宣称为新模型能力验收。
- 补修缩略图生命周期：状态重绘复用 Blob URL，只在移除对应文件后释放，避免请求中的缩略图因过早释放而报错；失败保留后的图片解码与移除复验通过，最终相关浏览器错误事件为空。QA 截图和状态保留 `.cache/inline-attachments-20260910/`。本阶段文件与状态段落本地提交，不 push；未完成的 App 启动器和域名记录原地保留。

## 2026-09-10 — 逐条回答待确认信息与获奖生成规则（COMPLETE）

- Candidate 工作区 OPEN 问题可独立展开、输入并「回答」，显示所属卡片、来源文件及卡片材料位置；相同问题/跨卡片相同 ID 不混淆，来源缺失不猜测。专用入口限制为当前选中卡片和问题，复用同源对话与 Working，足够的回答才解决问题，Human Save 才确认资料。
- 空白/重复提交阻止，失败保留当前页面输入；版本变化或问题已处理时不调用模型。有手动编辑时先阻止回答，处理中不进入新编辑；不发送主对话框尚未发送的附件。成功后的问题状态与草稿可以刷新恢复，未发送输入不承诺刷新保存。
- 获奖 prompt 升为 `candidate_workspace_v3_atomic_awards`：一项独立比赛结果一张卡片，具体奖名作标题、模块/结果作副标题，区分入围与获奖，按来源去重且不补造年份/颁发方/所属项目。前后端增加可选 subtype 对应枚举校验，模型显式 OTHER/award 优先于旧提案兼容适配；旧卡片、原始材料与版本不静默改写。规范与未实施的教育/项目关系建议见 [待确认信息与获奖卡片](docs/current/CANDIDATE_CLARIFICATIONS_AND_AWARDS.md)。
- 验证：8 项相关 Node suite、4 项 Candidate Python suite、VI 静态/负向门禁与 diff 检查通过；真实 Codex / gpt-5.6-sol 用虚构文本验证奖项拆分/去重/入围、不把故事时间写成项目时间、不充分回答保持 OPEN，3 项通过，不冒充真实简历或视觉 PDF 重生成验收。egolite 截图技术超时后用隔离 Chrome 验证 1280/390 px 来源与展开、键盘、空值、失败重试、手动编辑保护、异步回答、零确认写入及刷新恢复，无 pageerror 或横向溢出。
- 合成执行、截图及中间证据保留 `.cache/clarification-baseline-XHNUDG/`，未发送用户私人资料、迁移浏览器数据或建立教育关系。核对 8000 服务身份与空闲状态后重启到当前代码，保留原 origin、浏览器资料与模型选择。只提交本阶段文件/共享文件相关段落，不 push。

## 2026-09-10 — 工作空间介绍浮窗慢速连续动效（COMPLETE）

- 介绍展开 / 缩回独立调整为 900 / 800 ms，使用柔和起步收束的 VI 缓动；不改变其他详情的 540 / 480 ms。去掉标题副本预览与 260 ms 正文等待，内容从第一帧随窗口整体等比展开，固定终态排版，减少逐帧重排。返回从当前动画帧衔接，背景提前淡出避免字标旁残留方框。
- 验证：介绍动效、Workspace、floating window、UI framework、页面导航五项 Node 回归、JS 语法与 VI 静态/负向检查通过。egolite 实际点击确认正文立即显示与 900 ms 时长；截图接口技术超时后，隔离 Chrome 检查 1280 / 390 px 中间帧、固定排版宽度、展开/返回、快速 Esc 中断、外侧关闭、焦点恢复及减少动态效果，页面脚本错误和 POST 均为零。
- 截图、脚本和结果保留 `.cache/about-motion-20260910/`。仅 UI 动效，没有模型调用或资料写入。相关文件/共享文件段落本地提交，不 push；其他正在进行的澄清能力、App 启动器与域名记录保持原地。

## 2026-09-10 — DOCX 导入与六入口多模态对话（COMPLETE）

- 修复 Candidate 选择器/操作路由/按钮资格/前后端 source validator/结果计数不一致：DOCX 不再落入未接通的文字操作，正文、表格段落、页眉页脚与注释、内嵌 PNG/JPEG 由本地技术准备后交模型理解。原件先持久保存；独立 DOCX delivery 回执不伪装 PDF 页数。已保存来源支持 DOCX/图片恢复，导入状态不再统称 PDF。
- 六个当前对话入口共用附件组件，支持 PDF/DOCX/PNG/JPG/TXT/Markdown 选择、拖放及输入框粘贴图片、缩略预览/移除、逐轮传输确认与失败保留。四类运行时接收独立版本的附件通道，绑定执行 ID、模型和 hash；PDF 完整逐页发送图像，未确认或不完整材料失败关闭，不增加确认写入权限。材料、来源与限制见 [多模态对话输入](docs/current/MULTIMODAL_CONVERSATION_INPUTS.md)。
- 每轮最多 4 个、单个及合计 30 MB，展开后总计最多 48 张图像/PDF 页及 12 万字符；图片模型传输单张另限 20 MB。复杂 Word 图表/嵌入对象等要求导出 PDF，不静默遗漏。附件原件保存在独立浏览器库并绑定领域/会话/执行，不自动成为个人或职位确认资料；本版附件仅用于当前轮，追问需重新添加，没有附件历史浏览菜单。
- 验证：新增 DOCX 含表格/页眉/图片、坏包/复杂内容拒绝、四类 runtime 附件透传与篡改/未确认零 Provider 调用回归，以及六入口 UI/路由门禁。83 项 suite 运行后 82 项通过，唯一旧路由断言更新以包含 DOCX 后重跑通过；最终文案影响的 Local Review/UI/Model suite 再跑通过，VI/diff 检查通过。
- 真实 Codex / gpt-5.6-sol 四类对话均准确读出合成 PDF 第二页识别码、颜色及独立 PNG 颜色；真实 DOCX 生成合规提案。独立 Chrome 又走通完整真实 DOCX 导入、草稿生成、零确认 revision、刷新与已保存来源恢复。共计 6 次合成真实执行，没有使用或改写用户私人材料；不据此认证其他 Provider 真实质量。
- egolite 验证实际控件和文件选择，截图技术超时后独立 Chrome 验证全部六入口挂载、粘贴/预览/移除、未勾选零发送、失败保留、原件持久化，以及 1280/390 px 布局无横向溢出、无页面脚本异常。合成 QA 与中间文件保留 `.cache/attachments-20260910/`，离线日志另存时间戳目录。主服务保持原 8000 origin 与模型配置，核对进程无活动子任务后加载更新；仅本地提交，不推送，独立 App/域名记录原样保留。

## 2026-09-10 — 普通页面导航统一淡入淡出（COMPLETE）

- 「了解我」「了解职位概况」标题入口及返回接入共用导航淡出；同源 HTML 普通链接、文件夹、侧栏复用同一处理，首页继续按钮同步为 320 ms 淡出 / 420 ms 淡入及现有 VI 缓动。外链、下载、页内锚点、新标签页与已由浮窗/编辑守卫接管的点击保留原行为，卡片层级展开不改。
- 快速重复点击只安排一次导航；离开时取消未结束的入场动画，避免覆盖淡出。浏览器返回清理离开状态，缓存恢复时重播淡入并恢复首页按钮；系统减少动态效果时直接切换。
- 验证：导航行为、首页、UI 框架、多模态选择器四项 Node 回归及 VI 静态/负向门禁通过。egolite 实际验证两个标题入口与返回；截图接口技术超时后，隔离 Chrome 在 1280/390 px 检查入口/返回、文件夹、首页、历史返回与减少动效，逐帧 opacity 采样确认渐变，窄屏无横向溢出、无页面错误或 POST 请求。实际历史返回未命中 bfcache，缓存分支另用合成 pageshow 事件及单元回归验证，不声称真实缓存命中。
- 证据和脚本保留 `.cache/page-fade-20260910/`。未调用模型、改动资料或选择的模型；仅本地提交本阶段相关改动，其他任务工作原地保留，不 push。

## 2026-09-10 — 卡片右上角编辑改为文字入口（COMPLETE）

- 按用户要求，详情浮窗与 Candidate/Job 独立详情页右上角「编辑」统一黑色文字，无背景、边框、阴影，hover 保持透明并以下划线反馈；保留原点击热区、键盘焦点及打开编辑行为。同步 VI 样例、规范与对应库存增量，没有增加历史例外。
- 验证：lifecycle final、shared product shell 两项相关 Node 回归、VI 门禁及 diff 检查通过。egolite 实际浮窗确认正常/hover 样式与点击后编辑面板打开；截图接口技术超时后，独立 Chrome 使用内置演示详情核验 Candidate/Job 在 1280/390 px 的正常/hover/focus 样式、编辑/取消与截图，未见 pageerror。独立浏览器没有列表资料，未将空列表超时视为产品回归或复制用户数据；实际浮窗点击由 egolite 验证。未保存、删除资料或调用模型。
- 证据与尝试脚本保留 `.cache/top-edit-20260910/`。仅本地提交本项相关文件及共享文件段落，其他任务修改继续原地保留。

## 2026-09-10 — 候选卡片空标题返回提示（COMPLETE）

- 候选人工作区卡片编辑将标题必填校验前移到交互入口：标题为空时，保存修改、返回卡片列表或关闭工作区都会先显示“标题必须填写。”，弹窗仅有“确认”按钮；不再先进入无法完成保存的“是/否”分支。确认后保持编辑内容并将焦点送回标题输入框；标题有效时原有未保存确认与底层数据校验保持不变。
- Candidate 专项回归、JavaScript 语法、VI 静态/负向门禁与 diff 检查通过。52 项 Node suite 中 51 项通过；唯一失败是无关的 `multimodal_runtime_policy_regression.mjs` 测试替身缺少 `window.addEventListener`，本次未改运行方式代码或该测试。
- egolite 实测空标题返回、直接保存、确认后焦点和有效标题原分支；其截图接口技术超时后用隔离的应用内浏览器补做当前页面截图与视觉检查，页面错误日志为空。测试只丢弃未保存的临时空标题，没有修改候选资料、调用模型或发送材料。

## 2026-09-10 — 编辑卡片底部统一为文字操作（COMPLETE）

- 按用户提供截图与指定排列，Candidate/Job 编辑卡片底部改为左侧黑色「确认修改」，右侧灰色「取消」、最右红色「删除」；共用 `v1-edit-text-action`，无背景、边框、阴影，左右文字与上方输入框外边缘对齐，44 px 高度热区、悬停下划线和键盘焦点保留。DOM/Tab 顺序与视觉顺序一致，窄屏仍同排。
- 只调整底部文案与 VI，不改变编辑、预览、人工保存或删除权限。「确认修改」继续进入既有修改预览，由后续「确认保存」持久化；删除仍打开范围确认。VI 规范、可浏览样例与相关历史回归断言同步，样式入口带新版标记，例外台账没有扩容。
- 验证：4 项相关 Node UI suite、VI 门禁与 diff 检查通过。egolite 打开实际详情编辑面板后截图接口超时，使用独立 Chrome/Playwright 完成 Candidate/Job 在 1280/390 px 的样式、严格边缘对齐、同排、hover、Tab 顺序与焦点、取消不改标题、确认进入预览、返回编辑、删除菜单取消验证；无 pageerror。仅使用内置演示数据，没有执行最终保存、实际删除或模型调用。
- 实际截图与结果保留 `.cache/edit-footer-20260909/`；按跨午夜任务保留原证据目录名。仅本地提交本阶段文件/共享文件内相关段落，其他启动器、必填字段提示与项目入口记录原地保留，不 push。

## 2026-09-09 — 对话使用引导与 GitHub 同步准备（COMPLETE）

- 优化 Candidate 导入工作区、详情对话的输入提示和空态说明，明确可直接提问或要求修改、结合上文说明范围、草稿核对后人工保存；复用既有组件，不新增关键词判断或改变模型/写入权限。
- README 补充自然语言操作示例及真实能力边界，CHANGELOG 区分 main 分支更新与既有 v0.1.0 Release；用户本次授权推送 GitHub，不包含公网部署、私人资料或独立 App 打包的未提交工作。
- 80 项离线 suite 执行后 79 项通过，唯一失败为旧 placeholder 文案断言；同步断言后该 suite 与共享界面 suite 重跑通过。VI、公开文件检查、Git 全历史 Gitleaks 及 diff 检查通过。egolite 核对实际服务的新提示与工作空间导航；本轮未调用真实模型，不将文案优化称为新增语义能力验收。

## 2026-09-09 — 通用对话语义与执行链补齐（COMPLETE）

- 从架构分离人类意图理解、领域能力目录、类型化修改和真实执行回执。Candidate/Job/个人理解/职位概况共用意图原则，但各自保留上下文与写入权限；不更换 Provider/model。架构、使用方式及限制见 [对话语义与执行](docs/current/CONVERSATION_SEMANTIC_EXECUTION.md)。
- Candidate 每轮提供实际可编辑字段的临时引用、名称、当前值与允许操作，模型据此理解时间、职责、教育、摘要、分类等概念。字段目标明确后不再要求用户表达与界面标签逐字相同；新批量计划可引用当前及同源历史用户原话承接范围、处理排除，前后端核对引用、身份、焦点、版本和保存边界。旧无引用动作保留原限制；引用存在不冒充语义正确性认证。
- 新增可选分类标签 category，贯穿草稿、卡片/详情、手动编辑、预览、确认保存、同源恢复及个人/JD 上下文；原 item_type/subtype、栏目分组、来源和旧版本保留。澄清保留模型的具体问题，回执由实际前后值生成并说明草稿/未保存状态；历史附带实际操作结果。
- 真实 Codex / gpt-5.6-sol 合成语义测试 7/7 通过：排除项目、承接上文、教育时间、工作角色、只解释、取消修改、模糊请求。首轮教育测试暴露自然语言 selector 二次逐字匹配，修复后完整重跑通过。未发送或改写用户真实资料；其他三个对话领域的共用原则变更已过离线回归，未单独进行真实模型质量验收。
- 80 项离线回归通过（隔离运行时使用 ARIADNE_CODEX_ENABLED=0；Codex 专项自行构造 opt-in，不修改本机配置），最终列表读取修复另复跑集成与共用界面回归；VI 和 diff 检查通过。egolite 验证批量草稿更新、排除与人工保存；截图技术超时后使用独立 Chrome 完成真实页面的手动清空分类、保存、刷新恢复、详情再次编辑，以及 1280/390 px 截图检查，无页面脚本错误或横向溢出。浏览器传输使用合成替身，不计为真实模型调用证据。
- 保存回归发现新 Truth-only 工作区没有旧演示表时会阻断个人资料列表：现将可选旧记录读取与确认资料读取分开，并补齐列表页反馈组件依赖；缺表不清库、不创建假资料，已有旧记录继续读取。证据与中间文件保留 `.cache/semantic-conversation-20260909/`，不纳入公开 Git。
- 已核对本项目 8000 监听服务身份且无活动子进程后重启，保持原 origin、模型选择和浏览器数据；新服务签名已验证。原 Mac 启动器/公开入口文档的未提交工作继续独立保留；本阶段仅本地提交，不推送或发布。

## 2026-09-09 — 项目材料卡片类型契约与 Chrome 导入验收（COMPLETE）

- 用户指定项目 PDF 的两次真实 Codex 返回均被 `invalid_item_type` 拒绝，未保存失败提案。检查发现提示只示范 WORK_EXPERIENCE，没有列出验证器完整类型；现由同一 ITEM_TYPES 权威生成枚举，明确 PROJECT/EDUCATION/WORK_EXPERIENCE/OTHER 的用途，仍拒绝未知类型，不自动改写模型输出或放宽来源与事实校验。
- 前后端 prompt 同步升级至 `candidate_workspace_v2_item_types`，旧请求在传输前被拒绝；补充四类合法输出、非法类型拒绝、提示枚举/前端版本一致性及旧快照零 Provider 调用回归。7 项相关 Python/Node suite、VI 和 diff 检查通过。
- 经用户明确授权发送与保存，在用户实际 Chrome 的 `127.0.0.1:8000` 工作区完成两份项目 PDF 的真实 Codex 分析、逐卡核对、编辑与保存；刷新后两张新增项目卡片可见，原有三张演示卡片未修改。保存内容区分个人贡献和 AI 实现分工，不据项目技术栈推定独立开发能力。
- 原文、整理稿、两份嵌入中文字体的 PDF 与逐页渲染保留在本机忽略目录 `.cache/personal-project-sync-20260909/`；未纳入公开仓库。Chrome 浏览器连接超时后改用原生窗口操作，没有启用 Apple Events JavaScript 或改变浏览器权限；未迁移整个浏览器资料库。Markdown 模型导入尚未接通，本次完整转 PDF 后使用原有视觉路径，不扩展文件能力。


## 2026-09-09 — 职位概况页面术语中文化（COMPLETE）

- 「了解职位概况」的界面文案统一将 JD 写为「职位描述」，覆盖按钮、快捷问题、传输确认、范围/空态说明与失败提示；路由标识、原始资料和已有对话不改写。
- egolite 确认页面可见文案没有 JD、首个快捷按钮正确填入中文问题，390 px 窄屏无横向溢出；已有职位概况回归、JS 语法、VI 及 diff 检查通过，未发送模型请求。仅提交本项页面文案与记录，其他工作区改动保留。

## 2026-09-09 — v0.1.0 MIT 公开发布（PUBLISHED）

- 现有 [KAI-NEX/Ariadne](https://github.com/KAI-NEX/Ariadne) 已公开，MIT 许可已由 GitHub 识别，匿名访问验证通过；保留已核验 Git 历史。[v0.1.0 开源预览版](https://github.com/KAI-NEX/Ariadne/releases/tag/v0.1.0) 对应 `005b387`，本地 annotated tag 与远端同步。
- [云端检查](https://github.com/KAI-NEX/Ariadne/actions/runs/34358916060) 通过 78/78 离线回归、VI 门禁与全历史 Gitleaks。首次 Linux 执行暴露真实 PDF 测试的 macOS 依赖，已改用 macOS 15，未删减 PDF 回归；本机也已通过干净检出与空工作区验收。
- GitHub secret scanning、push protection 和私密漏洞报告均已启用并经 API 核对；核对时开放秘密告警为零。本机 API/Codex 凭据、私人资料、数据库和浏览器存储未加入 Git/发布。本机 8000 已加载 Host/Origin 隔离，Codex 选择仍有效，外部 Origin 返回 403。
- 当前模型选择背景参数保留为默认基准。此发布提供源码与版本链接，未部署公网 Web、DNS 或作者电脑隧道；其他并行启动器/公开域名决策改动仍独立保留。

## 2026-09-09 — 添加模型菜单文案精简（COMPLETE）

- 首页模型下拉菜单「＋ 添加新的模型」改为「添加新的模型」，其余文案与点击行为保持。
- egolite 核对实际菜单文字及点击后弹窗标题/可见性，已有添加模型回归、VI 检查与 diff 检查通过；未连接模型或修改资料。仅提交本项 HTML 与记录，其他未完成修改保留。

## 2026-09-09 — v0.1.0 MIT 开源发布候选（VALIDATED）

- 用户选择 MIT，并明确公开现有 KAI-NEX/Ariadne 仓库、保留已核验历史。整理 README 当前入口、许可、安全/贡献指南、CHANGELOG、公开文件门禁和固定版本 GitHub CI；历史开发记录及原件原地保留，不将本机凭据、运行数据或私人材料加入发布。
- 全历史 Gitleaks 与补充 blob/commit metadata 检查未发现有效凭据；两条告警是历史 Figma file key，按完整指纹精确排除。所有模式的本机 HTTP 增加 Host/Origin/跨站请求隔离，并禁止目录列表和越界 symlink；配对连接器的 GET 明确经过授权，HEAD 拒绝。
- 修复干净克隆依赖未发布私有 JD seed 的启动问题；legacy review 回归改用临时合成数据库。78/78 回归、VI 与 diff 检查通过。完整检查范围和限制见 [发布安全检查](docs/current/PUBLIC_RELEASE_SECURITY_AUDIT.md)；GitHub 公开/Release 结果以随后实际发布记录为准。
- 用户确认模型选择背景的当前保存参数就是预设。读取目标浏览器的指定背景设置键并核对代码，九项值完全一致；本次仅记录基准，不改变效果，后续调整/恢复沿用该组值。见 [VI 预设记录](docs/current/ARIADNE_VI_SYSTEM.md)。
- 证据及审计工具保留 `.cache/open-source-20260909/`，不提交凭据、扫描临时原件或日志；其他并行未完成的安装器/启动器工作不混入本候选。

## 2026-09-09 — 介绍字标顶底对齐与本地存储说明（COMPLETE）

- 第二页 Ariadne 介绍弹窗改以英文和中文的实际字形边界对齐：共用基线，按当前字体测得的高度调整「衡」字号与垂直位置，不拉伸字形。字体完成加载、回退或视口变化后重算；返回动画从英文文字本身起步。工作空间资源版本与 VI 规则同步更新。
- 添加文件内容、资料、对话与 API 密钥保存在本机/当前浏览器、不上传 Ariadne 云端服务器的说明；同时明确 AI 操作按传输确认向所选服务商发送必要材料，密钥用于对应服务的连接与调用。依据现有 IndexedDB/浏览器存储、本机连接器及 Provider 请求路径核对；不宣称 AI 模式没有外部传输，未修改存储或权限逻辑。
- egolite 实测字形边界偏差低于 0.01 px；截图接口再次超时，CUA Chrome 入口也初始化超时，随后复用已安装 Playwright 与独立无头 Chrome 验收。1280×850 / 390×844 截图、窄屏长文滚动、减少动效、禁用在线字体后的回退均通过，四种状态顶部偏差 <0.01 px、底部偏差 <0.001 px；Esc 关闭/焦点返回正常，无页面 JS 错误和 POST 请求。
- 三项相关 Node suite（about overlay motion、UI framework、shared shell）、JS 语法、VI 静态/负向门禁和 diff 检查通过。证据保留 `.cache/about-brand-20260909/`；仅提交本次代码、VI 与状态条目，已有项目文档的其他未提交内容保留。未请求模型、上传资料或推送 GitHub。

## 2026-09-09 — Codex「更多」说明与断开指引（COMPLETE）

- 将连接弹窗中的材料/额度与浏览器权限两段说明收进「更多」二级弹窗，原配对窗按精简后的内容计算高度。更多说明补充断开本页配对、终端 Ctrl+C 撤销所有网页授权、离线时的处理、重新配对，以及本机直连时切换运行方式；明确关闭弹窗不等于断开、资料保留和已发送请求可能继续执行。
- 更多弹窗使用现有浮窗视觉与原生 modal 焦点管理。Esc/关闭/点击外侧只关闭顶层说明并返回「更多」链接，配对草稿保留；原配对窗的取消语义保持。
- 3 项相关 Node suite、JS 语法、VI 门禁/负向回归与 diff 检查通过。egolite 验证打开、关闭及返回父弹窗；Chrome 沿用截图技术回退完成 1280×850 / 390×844 视觉、长说明滚动、Esc、外侧关闭、焦点与草稿保留检查，无页面 JS 错误、无 POST 或模型调用。证据保留 `.cache/codex-more-20260909/`；原有两份项目文档中的其他未提交内容继续保留。

## 2026-09-09 — 首页模型菜单连接项去下划线（COMPLETE）

- 共用 `runtime-menu-item` 明确设置 `text-decoration: none`，移除「连接本地 Codex」链接在下拉菜单中的浏览器默认下划线；保留悬停/键盘焦点反馈与原页弹窗行为。
- egolite 核对正常、悬停、聚焦及 390 px 窄屏均无下划线，窄屏无横向溢出，点击仍打开连接弹窗；未执行配对或模型调用。VI 静态/负向门禁、已有添加模型回归与 diff 检查通过，记录保留 `.cache/menu-underline-20260909/checks.json`。仅提交本项样式和状态条目，其他进行中的改动原地保留。

## 2026-09-09 — 本地 Codex 连接弹窗（COMPLETE）

- 运行方式菜单的「连接本地 Codex」改为当前页弹窗，复用添加模型的浮窗、标题栏、输入框、底部操作与拖动/缩放组件；「添加新的模型」弹窗底部新增同名链接，可直接切换到 Codex 配对。配对说明、额度/材料告知及一次性配对表单独立呈现，旧独立连接页继续保留。
- 连接成功后原页更新 Codex 选择并关闭弹窗；失败在窗内显示。关闭/Esc 清除配对码并归还焦点，键盘焦点约束于当前弹窗；关闭期间才完成的配对撤销授权，不产生迟到的模型选择。修复旧添加模型浮窗在展开动画中用缩放后高度计算尺寸、导致新增底部链接后内容被遮挡的问题，改读未缩放布局高度。
- 验收：6 项相关 Node 回归、JS 语法、VI 门禁与负向回归、diff 检查通过。egolite 验证两个入口、弹窗切换、真实本机配对成功/断开、连接器未运行时失败；URL 保持原页，无模型推理调用。Chrome 补做 1280×850 / 390×844 截图与交互检查（egolite 截图接口此前超时）：无横向溢出，底部操作可见，Esc/Tab/焦点返回、减少动效及异步取消通过，无页面 JS 错误。
- 证据保留 `.cache/codex-modal-20260909/`。仅提交本项 UI、相关回归和文档；原有两份项目文档中公开入口决策的未提交内容保留，本机 8000 服务继续运行。

## 2026-09-09 — Codex 本机运行与 Web 配对连接器（COMPLETE）

- 按用户要求增加「Web 网页 → 本机配对连接器 → Codex」第二种方式，并在当前电脑启用「本机 Ariadne → Codex」第一种方式。当前本机 `http://127.0.0.1:8000` 已启动；忽略目录中的显式本机偏好首次选择 Codex，后续尊重用户切换。使用本机已有 ChatGPT 登录和 `gpt-5.6-sol`，没有复制登录凭据或修改开发任务模型。详见 [运行与配对指南](docs/current/CODEX_RUNTIME_CONNECTOR.md)。
- 六个语义领域沿用原有来源、schema、版本、Working/Proposal 与 Human Save 校验，新增独立 Codex identity/adapter 和有界 CLI 传输。执行使用临时独立目录、ephemeral 会话、HTTPS provider 配置，关闭 shell、浏览器、插件与其他工具；optional schema 在 wire 层转换后恢复并进行原领域验证。Local 零 Provider 调用，失败不静默降级。
- 连接器只监听 loopback，校验准确 Origin/Host、一次性配对及有时限可撤销 token，仅允许列出的领域/技术准备接口及 Codex 执行。前端显式路由，凭据不发往网页后端；未配对、断连、重启、过期和撤销均明确失败。模型确认框同步实际 Provider/model。
- 发现并修复 Job PDF 旧路径只发送提取文字的问题：保留原始 PDF，验证 hash、完整页数与位置后附带全部页图，Codex/DeepSeek 共用完整渲染器；Job import adapter 升至 v3。缺少原件、hash 变化、缺页或超过完整处理预算时停止，不截取部分页面冒充完整理解。
- 验收：**77/77** Python/Node 回归、VI 门禁及 diff 检查通过。真实 Codex 合成调用覆盖独立图片、两页 PDF 标记、Candidate 导入、Job 文本/PDF 导入、Candidate/Job 对话与修改提案、个人理解和职位概况；初次 Candidate optional schema 失败已修复并复验，原失败证据保留。
- egolite 在独立网页/连接器 origin 完成配对、Candidate/Job 两页 PDF 真实导入、来源恢复和人工保存：两域各自保存前确认 revision 为零，保存后为一，六条 source document 记录保留；断连及旧 token 失败不降级。Chrome 补做桌面/移动视觉与溢出检查（egolite 截图接口超时），并验证本机初始 Codex、切换 Local 后刷新仍保留选择及真实同源 HTTP Codex 请求。
- 合成输入、结果、截图与回归留在 `.cache/codex-integration-20260909/`；本机配置、运行数据、凭据与 QA 不提交。没有使用私人资料作质量认证，没有发布公网、配置 DNS 或 push；真实 HTTPS origin 的浏览器本地网络授权须部署后验收，模型输出仍可能失败。已有公开入口决策的并行未提交内容原地保留。

## 2026-09-09 — GitHub 仓库创建与首次同步（COMPLETE）

- 按用户授权，通过 GitHub CLI 创建私有仓库 [KAI-NEX/Ariadne](https://github.com/KAI-NEX/Ariadne)，配置 HTTPS `origin`，将本地 `main` 推送并建立 `origin/main` 跟踪关系；GitHub 返回默认分支 `main`、可见性 `PRIVATE`。
- 首次推送包含聊天修复 `b82d68b`、卡片 UI 收口 `8ee8cd0` 及其已有历史；未改写历史。下方“没有远程地址、待推送”的条目为当时状态，由本条更新。
- GitHub CLI 使用官方发布包并校验 SHA-256，保留在忽略目录 `.cache/github-cli/`；通过设备授权完成登录，凭据与 QA/运行数据未加入本次提交。本条记录随后随 `main` 推送。

## 2026-09-09 — 卡片 UI 改动提交收口（COMPLETE）

- 根据用户本轮明确的命令行 commit / GitHub 同步请求，将此前保留在工作区的类型标签左移 1 px、卡片副标题移除分隔点及空行高度规则一并纳入本地提交；下方原有“未提交”条目记录的是当时状态，现由本条补充收口。
- 提交前复验 card subtitle、UI framework、VI 静态门禁与 diff 检查通过，沿用已有浏览器验收证据；不修改业务数据或原始资料。当前仓库没有配置 Git remote，GitHub 推送待用户提供目标仓库地址后继续。

## 2026-09-09 — 对话即时清空与快速逐字回复（COMPLETE）

- 「了解我」「了解职位概况」在发送前置检查通过后同步清空输入，并立即显示本轮用户消息；返回结果不再清空等待期间的新草稿。失败恢复未被编辑的原文，新输入或主动清空的内容不被覆盖；模型、资料传输确认与保存权限保持。
- 共用 ConversationUI 仅对当前执行的新 Assistant 回复逐字展开，按字素约 6 ms、总时长 120–1800 ms；通过微任务在首次绘制前准备文字，避免首帧等待。稳定消息 ID 区分重复正文与历史，重绘续接进度，已完成回复不重播；来源链接节点、完整原文、历史阅读位置保留。减少动态效果时直接完整显示。
- 本项为已校验回复的前端展示，接口仍返回完整结果；模型处理等待时间不变，不声称真实流式传输。Candidate/Job 详情与来源工作区沿用已有提交即清空，通过共用消息渲染器获得同一回复效果。
- 新增草稿及逐字显示回归，覆盖成功、失败、新草稿、空历史、旧回复、字素、来源内容、刷新续接、滚动与减少动效；共 9 个相关 Node suite、JS 语法、VI 静态/负向门禁和 diff 检查通过。
- egolite 使用真实页面脚本与可控延迟的合成领域响应，验证两个整体对话页即时清空、用户消息可见、失败恢复/不覆盖新草稿、未确认不发送、历史不重播及减少动效。约 60 ms 已显示 11 字，约 2 秒完整显示 372 字及 Job 附加说明；来源链接节点与 href 保留。390×844 下新回复 80 ms 已显示 15 字，无横向溢出，输入可见。未请求 Provider 或修改实际资料，:8000 三份脚本字节与工作区一致。
- 证据原地保留 `.cache/reply-ui-20260909/`：桌面截图、逐时采样、边界及窄屏 JSON、合成验收服务器。egolite 窄屏截图两次超时，窄屏仅以 DOM/几何及文字采样验收，未冒称截图成功；未验证真实 Provider 的生成时延。仅提交本阶段实现、回归与记录，卡片类型标签/副标题的并行未提交改动保留。

## 2026-09-09 — Ariadne 介绍浮窗缩回与焦点修复（COMPLETE）

- 实际复现：缩回 400 ms 时表面仅约 60×15 px，仍带 1 px 边框和浮窗阴影；预览字标为 550 字重/负字距，目标标题为 800 字重/1.92 px 字距，终点切换跳变。正文跟随缩窄重新排版；关闭后程序归还焦点，鼠标路径也触发全局 focus-visible 外框。
- 仅介绍浮窗改用独立字标返程：从当前标题（快速关闭时从实际预览）位置/字形过渡至原字标，沿用 480 ms/既有缓动；正文几何冻结，窗口表面在 160 ms 内淡出，避免小方框和挤压换行。返程结束清理动画节点及临时尺寸。鼠标返回只抑制该标题的焦点框，键盘切换立即恢复可见提示，焦点仍归还标题。Workspace 增加资源版本标记。
- egolite 原生 CDP 截图审阅 80/160/400 ms：末段表面透明、字标距终点横向不足 0.15 px，宽度差不足 0.04 px。1280/390 px 真鼠标返回/外侧关闭无焦点框，Esc/Enter 保留键盘焦点；快速关闭、减少动效、无残留节点/inert，以及 Candidate/Job 既有 iframe 打开关闭通过。证据保留 `.cache/about-motion-20260909/`，包括修复前后图片及交互 JSON。
- 新增 about motion 回归、既有 UI framework/shared shell/UI contract、卡片副标题回归、VI 检查及负向回归、语法/diff 检查通过。未请求 Provider、修改资料或改写 Git 历史；仅提交本项动效修复，卡片微调/副标题及并行聊天任务改动保留。

## 2026-09-09 — 卡片副标题移除分隔点（工作区已验证，未提交）

- 用户确认类型标签左移 1 px，并要求标题与摘要之间不再显示孤立的点。Candidate/Job 卡片共用副标题格式化：过滤空字段，仅以空格连接实际信息；保留 HTML 转义、原始数据和列表项目符号。副标题最小高度使用 `1lh`，为空时留白，不收缩原有间距。
- egolite 核对当前 7 张个人卡片：空副标题无分隔点、每行仍为 14.5 px，类型标签保持 -1 px，21 个列表项保留。截图 `.cache/card-alignment-20260909/subtitle-no-dot.png` 已审阅。新增回归覆盖空/单值/双值及两域调用和留白，UI framework、VI 检查、diff 检查通过；未发起 Provider 调用或持久化数据操作，未操作 Git 提交历史。

## 2026-09-09 — 共用聊天输入框：焦点、悬浮与手动高度（COMPLETE）

- 修复个人页面高优先级焦点规则造成的方形外框：共用 textarea 明确不叠加 outline，保留圆角 field 的统一焦点反馈。受影响页面增加 CSS 版本标记，避免继续读取旧样式。
- `ConversationUI.enhanceComposers()` 统一增强个人理解、职位概况、Candidate/Job 详情和两域来源工作区：消息/待审核内容独立滚动，输入 dock 保持可见。Job 嵌入工作区复用 Candidate 的页壳高度/导入区收起规则，修复输入区被导入页内容推出视口；窄屏工作区限制子列最小宽度并支持 dock 悬浮。
- 每个输入框上沿提供共用高度拖柄，支持鼠标/Pointer、方向键与 Home/End，暴露可访问名称和范围。初始 44 px，上限按视口、历史区域剩余空间和 320 px 取最小值；调整时保留草稿、发送状态与历史位置，等待/失败不重置高度。已接入 VI 演示并更新 VI 规范；无需修改生成资源。
- 消息刷新/追加时保留正在阅读的历史位置，加载更早消息按新增高度补偿；只有原本停留底部时跟随新消息。滚动只作用于消息容器，不再用 scrollIntoView 连带移动外层工作区。新增 Node 回归覆盖这四种边界。
- 验证：7 个相关 Node suite（scroll、个人理解、shared shell、UI contract、UI framework、Candidate Model UI、detail wiring）、VI 静态门禁及负向回归、JS 语法与 diff 检查通过。egolite 对真实 HTML 构建的合成 UI 在 1280/390 px 完成 6×2=12 个布局检查：长历史滚动前后输入位置不变、无方形 outline/横向溢出、拖柄唯一、键盘增高/复位、最大高度仍保留阅读空间；另检验两个独立详情路由的输入可见性。
- egolite 实际鼠标拖动将输入从 44 px 增至 174/144 px，草稿和历史位置不变且提交次数为 0；显式发送后仅合成处理器计数一次，等待状态保留高度。真实 :8000 两个整体对话页的焦点、dock、拖柄及未勾选确认时禁用发送正常，VI 演示键盘调节正常，无 Runtime exception。合成浏览器检查不代表模型执行验收，Provider 请求为零；未覆盖实体手机键盘或跨刷新保存高度。
- 证据保留 `.cache/composer-ui-20260909/`，包括原截图 helper 的过渡态与随后原生 CDP 清晰截图、布局 JSON、合成验收服务器；不提交 QA 文件或私人材料。仅提交本阶段文件与记录，卡片类型标签微调及其回归/记录原地保留。

## 2026-09-09 — 更正标签微调对象（工作区已验证，未提交）

- 用户明确指「工作经历」「教育经历」等卡片类型胶囊，而不是添加加号。撤回前轮加号额外 -1 px 调整，保留此前 SVG 留白补偿；卡片类型标签经 1 px / 2 px 截图比较采用左移 1 px，详情页与右侧审核标签不受影响。此前“添加卡片 1 px 光学校准”条目的对象理解有误，以本条为准。
- egolite 检查真实工作/教育标签及 390 px 窄屏：类型标签 -1 px、加号恢复 -4 px、无临时预览样式或横向溢出；对比与最终截图保留于 `.cache/card-alignment-20260909/type-label-*.png`。VI 检查、负向回归及新增类型标签约束的 UI framework 回归通过。本次不操作 Git 暂存/提交/历史，保留并行改动。

## 2026-09-09 — 添加卡片 1 px 光学校准（COMPLETE）

- 按用户要求，在 egolite 的职位添加卡片上分别预览额外左移 1 px / 2 px；对比截图后采用 1 px，2 px 的加号左端略超出下方文字视觉边缘。修改共用加号样式，底部文字、卡片内边距及 SVG 不变。
- 保存两版原始对比截图及最终窄屏截图于 `.cache/card-alignment-20260909/`。刷新后确认实际变换为 -5 px（原 SVG 补偿 -4 px 加光学校准 -1 px）、无临时预览样式/横向溢出；VI 检查、负向回归、更新后的 UI framework 回归及 diff 检查通过。其他并行任务改动不纳入本次提交。

## 2026-09-09 — 个人理解与全部 JD 概况独立分工（本阶段 COMPLETE）

- 个人「了解我」调整为理解过去项目、职责、决策、成果、协作与做事方式；prompt v3 使旧派生理解失效，个人补充的审阅/保存边界保持。职位描述页新增「了解职位概况」入口，独立汇总及讨论全部当前 canonical JD；个人与具体职位的关联仍在 JD 详情。产品介绍同步当前入口，详见 [分工与范围契约](docs/current/ARIADNE_JOB_OVERVIEW_V1.md)。
- Job 数据入口只读最新确认版本、当前待审 Job 提案、审阅决定与来源元数据四个 store。草稿明确未确认，拒绝/已处理提案退出，Demo/legacy/个人资料与记忆不混入；同标题不同来源不自动合并。讨论只能写本区域的非权威概况和历史，不能改写 Job/Candidate/个人记忆。
- 新增独立 JOB_OVERVIEW_TURN runtime 与前后端签名，复用已有合格多模态能力和 Provider/model。数据库 v16 → v17 增量增加三个 Job 派生 store；真实 IndexedDB 升级后原始合成 Blob 逐字保留。概况分批覆盖全部当前 JD，对话采用当前概况和预算内详细证据，48 KB 上限、18 KB/60 条详细证据与有限历史；变化使旧概况/旧历史失效，旧记录保留。
- 自动验收：当前共享工作区 44 Node + 25 Python = **69/69** suite 通过（含并行 UI 新增回归）；legacy analysis_review 单独使用现有数据库备份、rollback-only 运行，原库不变。新增本功能两项 suite 覆盖范围隔离、拒绝、版本、增量缓存、无变化零调用、并发失效、详细上下文预算、来源引用、只读输出、Local/Model 与凭据前置校验。VI 检查、相关语法、文档链接和 diff 检查通过。
- 真实模型/浏览器：独立 :8021 合成资料，模型成功区分三份 JD 的研究/产品/评估职责、远程/现场/未知安排及地点矛盾；数据库同时存在个人 Lyra 项目时，Job 请求不含该资料，跨范围提问明确无法获知个人经历。个人真实对话围绕 Lyra 项目职责、工作方法与两份资料中的部署责任冲突，没有引入 Job。普通对话零确认数据写入。
- 变化复验：一份 Job 更新到 v2 后只新理解一段、复用两段，回答采用最新深圳地点，旧对话未传入新上下文；旧 revision 保留。不变的概况刷新零 Provider 调用；拒绝一份草稿后范围由三份变两份，旧概况失效、历史引用标明已不在当前范围。
- 首次真实综合遇到正文内部引用和 uncertainties 错误类型两次失败，均无假回答或确认写入。保留失败产物并加强 schema/正文说明（Job prompt v2），后续真实三阶段及对话通过；未删弱校验或加入自动重试，不宣称模型永远输出正确。合成真实执行共 13 次 Provider 请求，其中前述两次失败。
- egolite 验证两个库标题入口、真实发送/等待/复位、费用确认、来源链接、历史版本提示及 1280/390 px 渲染，无横向溢出或脚本错误；复用并行已建立的精简对话布局。:8000 从本仓库重启，8 个静态资源字节和两个后端签名一致。证据保存在忽略目录 `.cache/job-overview-20260909/`，不提交私人资料、运行数据或截图。
- 本阶段本地 commit 仅包含功能、相关入口/文案、存储版本、回归和项目记录；并行滚动/输入框 UI 改动保留、不纳入本次暂存。不 push，不修改旧 Learning OS，不执行 Phase B 清理。未验证大规模 JD 集合的真实语义召回、长期使用质量、跨设备同步或真实私人资料的完整理解。
- 提交归属核对：本阶段暂存的 30 个文件被并行任务从共享 index 提交为 `d0d2595`；其标题 `Fine-tune card icon alignment by one pixel` 与实际内容不符。已核对该 commit 完整包含本阶段 30 文件、751 行新增/21 行删除，没有额外图标或滚动改动。保留既有历史，此补记用于准确定位功能提交。


## 2026-09-09 — 添加卡片左侧对齐（COMPLETE）

- 修正个人资料/职位共用添加卡片：内边距统一为 VI 的 24 px；加号由容器居中改为左对齐，并补偿共享 SVG 的 4 px 内部留白，使可见笔画与下方标题/说明沿同一左轴。保留原 SVG、卡片点击区域、状态与展开动画，不修改材料数据。
- egolite 原生 CDP 检查 1280×800、390×700 两页布局，加号容器/标题/说明左坐标一致、无横向溢出，截图已审阅；导入浮窗可打开，关闭动作异步完成后核对隐藏状态，未见 Runtime exception。截图原地保存在 `.cache/card-alignment-20260909/`（包括最初动画中截图），不提交资料截图。
- UI framework 回归增加卡片内边距及图标对齐约束并通过；VI 静态检查与负向回归通过，diff 检查通过。仅提交本次 CSS、回归及记录，职位概况等并行任务改动保留；无 Provider 请求或确认数据写入。

## 2026-09-09 — 「了解我」与职位概况对话页精简（UI COMPLETE）

- 个人资料入口改为「了解我」，复用 Workspace Ariadne 的 `v1-wordmark`（12 px）与对称三列顶栏，在返回键同一高度居中；内层标题仍用原 UI 字体和 18 px 字号。保留用户指定的「你目前如何理解我」「资料之间的联系」「补充一点关于我」三个按钮。
- 新增共用 `understanding-chat.css`：个人与职位页采用单列对话，不再显示重复的理解概况、手动更新、补充列表/历史、模型标题、引导/空状态及上下文统计。保留底层渲染目标和持久化实现，既有资料和历史不删除；传输/费用确认、实际待保存 Proposal、运行错误继续按需显示。修正确认框被 flex 拉宽，缩短窄屏输入提示。
- 职位页已在当前工作树同步居中「了解职位概况」入口、内层标题、共用样式和短输入提示。该页及其领域/后端由同目录 Mix 任务同时新增，尚未完成其功能阶段收口；`jd.html` 和新增 `job-overview.html` 的改动原地保留，随该功能一并提交，避免把未完成的功能纳入本次 UI commit。本次提交个人入口/页面、共用样式及本条记录；个人页面中并行修改的一句隐藏说明也不纳入本次提交。
- 验证：VI 静态检查及负向回归、4 个 Node suite（个人理解、UI framework、shared product shell、UI contract addendum）、diff 检查通过。egolite 1206/1280 px 桌面及 390 px 窄屏审阅截图，检查两个入口居中/返回键同高、个人入口往返、两组全部快捷按钮填入和聚焦、无横向溢出、13 px checkbox；截图原地保存在 `.cache/chat-ui-20260909/`，不提交私人资料截图。
- 验收边界：个人页面使用既有 :8000；职位概况在独立 :8032 新后端检查，contract 正常加载。既有 :8000 进程尚未加载并行新增的 job-overview-contract 路由（404），未擅自重启其运行任务；独立未配置 Runtime 的 JD 列表曾暴露既有 `showJobError` 对缺少 gate 的异常，非本次 CSS 引起，未据此宣称职位整体功能验收通过。本次 Provider 请求为零，不验证模型回答质量或新增领域功能。

## 2026-09-09 — Ariadne · 衡 VI 视觉系统 1.0（本阶段 COMPLETE）

- 建立 [VI 系统规范](docs/current/ARIADNE_VI_SYSTEM.md) 与 [可浏览总览](public/vi-system.html)，覆盖品牌、颜色、中英文字体、字号/字重/行高、图标、网格、简历对齐、圆角、阴影、组件、状态、动效和维护规则。79 个语义 token、15 个普通 SVG 图标由 `public/vi/manifest.json` 唯一定义；专用文件夹、垃圾桶、ASCII 波纹和引路插图单独登记。
- 核心接入：共用 CSS 颜色、缓动、阴影及 composer 几何引用 token；重复返回/关闭/添加/选中/发送 mask 引用统一 SVG。介绍页方向字符、FAQ 加减改为图标资源。所有现有页面样式链接增加 VI 版本标记，修复普通导航仍读取旧 CSS 的缓存问题。原 HTML/JS 动作、来源/Provider/人工保存/版本契约保持。
- 字体实证：egolite CDP 读取 Workspace 实际字体，英文为 Recursive，中文为 PingFang SC，文件夹标题的英文首选仍为 Inter。清除 UI 中 IBM Plex Serif 的衬线回退，记录 Windows/Linux 和离线无衬线降级；不宣称已验收其他系统或已内置离线字体。
- 网格：新增复用工具与可见叠层，桌面/平板/窄屏为 12/8/4 列，4 px 基础节奏；A4 简历示例采用 16 mm 边距、12 列、4 mm 列距、3+9 章节/正文对齐与 10.5 pt / 16 pt 正文。示例为占位内容，不新增简历生成或 PDF 导出功能。保留既有文件夹、浮窗和 46/44/42 px composer 专用几何。
- 维护：AGENTS/docs 入口链接 VI；`scripts/check_vi.py` 扫描 75 个非生成静态文件，校验 17 个生成资源、未知 token/图标及新增硬编码颜色、独立字体栈、SVG/符号副本。现有 441 次例外有逐条台账，只允许不增加；新增负向用例验证新颜色、复制旧值、独立字体栈、符号/内嵌图标会被拦住。此门禁需实际运行，不能替代视觉审阅，也不声称旧页面全部迁移。
- 验证：12 项相关 Node UI suites、VI Python 负向回归、生成资源一致性、JS 语法、22 项静态 HTTP 字节对照、25 个规范入口本地链接与 diff 检查通过。原断言通过 token 解析继续核对实际数值；内嵌图标断言迁至资源路径与 SVG 几何，未删弱交互约束。
- 浏览器：egolite 1280/1440、900、390 px 检查字体样本、图标检索/空结果、网格开关、简历两行共用左轴、输入焦点样式、发送/等待/复位和减少动效；四个 Candidate/Job 导入/详情 composer 新资源均为 46/44/42 px，返回与发送 mask 正确，介绍页 FAQ 与链接箭头正常。总览和介绍页无文档级横向溢出；复制受浏览器剪贴板权限限制时显示可手动复制的变量。普通截图/鼠标 helper 在滚动位置技术失败后，使用同一浏览器原生 CDP 截图与 DOM 操作完成；原空白截图保留，实际图片已审阅。
- 证据保存在忽略目录 `.cache/vi-system-20260909/`；未新增 Provider 请求或私人数据写入。并行个人理解任务已独立提交，本阶段仅其 HTML 样式 URL 版本标记涉及该页面；不包含其领域改动。按现行阶段规则本地提交，不 push。未覆盖整站逐页全部状态、Windows/Linux 字体、离线 webfont 或实际简历 PDF 分页。

## 2026-09-09 — 持续个人理解 v1 与综合对话入口（本阶段 COMPLETE）

- 实施用户授权的持续理解第一版闭环：个人资料内新增「个人理解」页面，跨资料综合当前经历、来源关联与未知；对话中的事实、偏好、目标和修正先成为可编辑 Proposal，Human Save 后才进入个人确认记忆。Candidate/JD 原卡片及 Job 确认版本不被普通讨论静默修改。卡片、来源工作区和 JD 用户消息可转入有出处的个人补充草稿。
- 数据库 v15 → v16 仅增量添加六个 store，统一既有 opener。确认记忆追加版本，明确拒绝、重复保存、版本冲突、来源变化和停止使用边界；修正保留完整来源绑定，包括本轮只发送节选的长资料。旧来源、Blob 和历史原地保留。
- 新增按指纹复用的片段摘要与当前全局理解，资料/prompt 变化使旧理解失效。个人对话上下文上限 48 KB；JD 个人详细证据、历史和变更分别受预算约束，发送覆盖说明。词项检索只负责挑选，不冒充语义理解。过时聊天和旧记忆 delta 不回流为当前个人事实。
- 验证：以 `ff2e114` 加本阶段文件构成独立验收树，42 Node + 23 Python = **65/65** 默认 suite 通过；legacy analysis_review 另使用现有本地 fixture 数据库的只读备份运行，原库不变。共享工作区另有并行 VI/图标调整，整区当时为 63/65，两个失败来自未完成的图标断言；未放宽它们，也未纳入本阶段提交。新增长资料节选后保存、prompt 缓存失效及旧记忆历史排除回归。
- egolite 独立 :8020 合成人物/材料真实验证：两材料职责冲突、待确认而不写入、保存后刷新、偏好 v2 替换及 v3 停止使用、拒绝不改变确认内容、修正关联两份材料、JD 收到最新个人补充、JD 原话转入个人理解草稿。v15 合成 Blob 升级后逐字不变。真实更新复用两段摘要、只理解两段新增补充；再次更新 Provider 调用 0。未把私人材料发送 Provider。
- 真实模型初次综合因文本契约失败，后续收紧输出长度/空项/正文引用以及来源、空字段、职责推断规则；复验正确采用本人责任修正并保留未知，JD 明确不从部署职责推断未说明的设计/取舍职责。结构测试不替代语义判断，不宣称完全理解一个人。1280 px 与 390 px 布局、窄屏对话跳转、保存/拒绝及历史可见性已检验；egolite 截图 helper 在滚动位置产出空白，保留该产物并用同一浏览器原生 CDP viewport 截图完成复验。
- 已核对新根进程身份后重启 :8000，7 项新增/变化静态文件与当前文件逐字一致、个人理解运行签名一致。实施说明、边界和后续方向见 [持续个人理解 v1](docs/current/ARIADNE_PERSONAL_UNDERSTANDING_V1.md)；日志、合成请求/响应及截图保留于忽略目录 `.cache/personal-understanding-implementation-20260909/`。
- 本阶段仅本地 commit；并行视觉规范、介绍页和相关未完成改动原地保留，未写旧 Learning OS、未清理原文件、未 push。完整职业行动反馈、跨设备同步和语义向量检索尚未实现。


## 2026-09-09 — 中文品牌标题视觉校准（COMPLETE）

- 「衡」改为 Ariadne 字号的 86%（桌面 37.84 px、窄屏 32.68 px），按中文字形实际视觉高度校准，取代前序等字号处理；颜色改为灰色 `#7a7f89`，其他内容与交互不变。
- 沿用 egolite 截图技术故障后的 Chrome/Playwright 回退，验证 Workspace 标题打开、字号/颜色及返回，无 pageerror；审阅桌面 1280×800 与窄屏 390×700 截图，证据原地保存在 `.cache/about-popup-20260909/optical-gray-*.png`。仅提交此标题样式与记录，其他任务改动保留。

## 2026-09-09 — 删除介绍浮窗底部说明（COMPLETE）

- 按用户要求删除「衡」寓意及“目标由你选择，修改由你确认”两句底部文案，同时移除该段独用的分隔线样式；其他正文与交互不变。JS 语法、UI framework 回归及 diff 检查通过，HTTP 核对新模板已生效；本次纯文案删除未重复浏览器视觉验收。其他任务改动保留。

## 2026-09-09 — 介绍浮窗字号与后续对话说明（COMPLETE）

- 「衡」与 Ariadne 使用同等标题字号/字重（桌面 44 px、窄屏 38 px）。补充「了解我」和「了解职位概况」两个整体 AI 对话入口的规划，明确写明“正在搭建”“后续”，本次仅改介绍文案，不实现或宣称这些功能已完成。
- egolite 验证标题打开及正文；沿用截图技术故障后的 Chrome/Playwright 回退，审阅 1280×800、390×700 截图，验证同等字号、文案、无横向溢出及返回行为，无 pageerror；既有 UI framework 回归通过。证据保留于 `.cache/about-popup-20260909/copy-*.png` 及 `verify-copy.cjs`。其他任务未提交修改保留，仅提交本次字号、文案及记录。

## 2026-09-09 — Ariadne · 衡 介绍入口改为浮窗（COMPLETE）

- 按用户最新要求，Workspace 标题不再跳转独立页面：点击 Ariadne 从字标位置展开为简短介绍浮窗，说明产品用途、可做的事与「衡」的寓意。复用已有详情浮窗的展开/缩回动画（540/480 ms）及系统 `v1-back` 返回图标；点击左上角、浮窗外侧或 Esc 返回原处。
- 新样式仅在 Workspace 加载；支持窄屏、减少动态效果偏好、键盘焦点约束及关闭后的焦点恢复。原 `about.html` / `about.css` 保留原地，不再作为标题入口，本次不增加账号、下载或部署功能。
- 验证：3 项现有 Node 回归（UI framework、shared product shell、UI contract addendum）通过。egolite 验证标题打开、不换 URL、返回；截图技术超时后使用已安装 Chrome/Playwright 验证返回按钮、外侧、Esc、Tab、打开中途关闭、减少动态效果、390 px 窄屏，以及个人资料/职位原有 iframe 浮窗。无 pageerror；1280×800、390×700 和展开中间态截图已审阅，修复预览字标继承网格列导致的偏移。证据保存在忽略目录 `.cache/about-popup-20260909/`。
- 本地提交仅包含 Workspace 入口、介绍样式、共用浮窗中本次相关代码及此记录；并行个人理解任务的未完成改动保留、不纳入提交。无真实 Provider 请求或发布。

## 2026-09-09 — Ariadne · 衡 产品介绍页（COMPLETE）

- 文件夹选择页（Workspace）顶部 Ariadne 字标链接至 `about.html`。新增独立介绍页及作用域 CSS，延续既有字体、浅灰背景与深色按钮；包含中文品牌名「衡」、英文名典故、产品用途、三项现有能力、资料与保存边界、可展开 FAQ、本地启动说明和返回应用入口。
- 用户澄清“可登录”指能正常打开并进入应用，本次不新增账号系统。中文名是「衡」，不是音译；页面以“衡量、分寸、判断与取舍”表述本次用户提供的文化方向，不冒称已找回历史讨论原话。稳定命名已补入 PROJECT_CONTEXT。
- 下载区域标注“后续开放”，没有安装包、假下载按钮或发布承诺。提供已有源码项目在 Codex/终端打开、`python3 app.py` 启动、通过 localhost 使用的步骤，并说明当前 macOS 文档处理条件。
- 验证：既有 `step_02_03_ui_framework_regression.mjs` 通过。egolite 验证 Workspace 字标跳转与正文；截图接口技术超时后，使用已安装 Chrome/Playwright 完成 1280×900、390×900 截图审阅，修复共用旧 `main` 样式造成的窄内容区。复验标题、FAQ 展开/收起、页内锚点、5 个本地目标 HTTP 200、返回文件夹页面通过；无横向溢出、无 pageerror。证据保存在忽略目录 `.cache/about-page-20260909/`。
- 仅提交介绍页、字标链接及本条记录/命名约定；其他任务正在进行的个人理解、领域、存储和共享界面改动保留，不纳入本阶段提交。未进行真实 Provider 请求或发布部署。

## 2026-09-09 — 个人理解架构审计与快照移除一致性修复（本阶段 COMPLETE）

- 完成 [个人理解与 Candidate × Job 审计](docs/current/ARIADNE_PERSONAL_UNDERSTANDING_AUDIT.md)：JD 每轮实际接入跨资料最新个人快照；Candidate 详情仍限定当前卡片，来源工作区限定当前来源；尚无跨来源长期个人模型及 JD 新信息经提案保存回 Candidate 的闭环。不能宣称项目已实现“越聊越了解整个人”。
- 修复已移除卡片通过未接受的 Working 回流到 JD；移除记录只认可用户决定 authority，按 source/item 身份过滤，保留其他来源的独立条目。修复全部移除及仅未确认 legacy 数据时的空快照误报，保留异常接线的 fail-closed 检查；历史与来源不被快照编译改写。
- 41 Node + 22 Python = **63/63** 默认回归通过；新增移除回流用例修复前失败、修复后通过。egolite 隔离合成浏览器 4 轮验证跨资料入模、人工修正传播、逐项移除与合法空资料；生产后端校验后的 Provider payload 候选数量为 `2/2 → 2/2 → 1/1 → 0/0`（Confirmed/Working）。测试在外部请求前主动停止，Provider 调用 0，失败状态正确，历史保留。
- 仍未覆盖真实模型对私人多材料的理解质量；长期记忆、冲突综合、超长上下文，以及既有个人编辑预览不展示摘要变化的问题见审计。egolite 截图技术超时，本次以 DOM、IndexedDB 及后端 payload 作为交互证据，不声称布局验收。产物保留在忽略目录 `.cache/personal-understanding-audit-20260909/`。
- 本阶段仅本地提交相关实现、回归与项目记录；无 Provider/model 更换、原始文件清理、旧 Learning OS 写入或 push。

## 2026-09-09 — 文件上传上限统一为 30 MB（COMPLETE）

- 按用户要求，个人资料与职位描述上传的文档和 PNG/JPEG 均调整为每文件 ≤30,000,000 bytes（十进制 30 MB）；旧职业资料入口同步采用同一应用限制。后端共用 `src/upload_limits.py`，同步覆盖 Local 读取/OCR、Model 来源读取、Candidate/Job Model 原始输入校验；单文件 HTTP 请求允许 40 MB Base64 加 1 MB 元数据，多图请求允许四份满额文件的编码体积加元数据，仍保留有界请求。
- 原 8 MB 是早期 Local intake 的应用常量，见本文件历史 Inputs 条目及 TECHNICAL_EVIDENCE 的 Local intake boundary。历史记录未解释为何恰好选择 8 MB，没有依据把它归因于服务商硬限制；图片原先另限 5 MB。Provider 能力目录中的自身限制保持原义。
- 超限弹窗和两域提示同步为 30 MB；职位批量选择现在显示实际拒绝原因。连同上一轮已验证的“已保存在本机的 PDF”→“资料”文案一并收口。
- 验证：6 Node + 6 Python 相关回归文件通过，包括新增所有支持格式恰好 30 MB 接收、超 1 byte/空文件拒绝、后端 PDF/PNG/JPEG 解码与 hash 边界，以及 8 个真实 HTTP handler 的完整 Base64 请求读取/超限拒绝（下游执行用测试替身停止）。原有来源持久化、Local/Model 和领域回归通过。
- egolite 在正常 `:8000` 页验证个人资料 30 MB 合成文件选入及超限弹窗、职位 30 MB 合成图片选入及超限提示。浏览器仅验证选择与大小限制，未执行这些合成文件的 PDF/OCR/模型语义处理或 Human Save；未发起真实 Provider 请求。没有以本次验证宣称任意 30 MB 复杂文件的识别质量。
- 已启动本项目 `:8000` 服务供刷新使用；按阶段规则创建本地 commit，不 push。

## 2026-09-08 — 全操作多模态模型接入修复（COMPLETE）

- 用户明确要求所有可调用模型至少能理解图片和 PDF，后续 Gemini/其他 Provider 同样适用。规则已写入 AGENTS、PROJECT_CONTEXT 和 Runtime Contract 顶部增量条目；取代历史 Pro 对话例外，原历史记录保留。
- 根因：Runtime selector 通过 `ai_conversation=supported` 单独放行纯文本 `deepseek-v4-pro`，首页又自动给对话分配 Pro；旧的 `connection_verified` 记录也可恢复为 READY。现已在共用能力门槛、选择器、旧配置恢复、操作路由及后端执行/连接边界阻断这些路径。
- DeepSeek 可执行模型仅保留 `deepseek-v4-flash-vision-exp`；Candidate/Job 对话迁至同一模型（adapter v8/v10），保留领域 schema、Working、人工保存、版本及来源边界。旧 Pro 不自动替换：刷新后提示重新选择；用户选定 Vision 后才更新相应操作分配。历史来源和已有对话记录不迁移、不删除。
- PDF 能力要求原生 PDF 或完整逐页转图；纯文本/OCR 路径和未知模型名称不构成多模态认证。Gemini 文档发现增加确切模型白名单，直接连接请求拒绝未知 ID；未完成 Ariadne 领域适配的 Gemini/Qwen 连接不再成为可执行 Runtime。本阶段未新增这些 Provider 的领域能力。
- 验证：40 Node + 21 Python = **61/61** 自动回归通过（含新跨 Provider 门槛、旧配置保留、伪造能力标记、文本/未知模型在凭据读取前拒绝）；22 个受影响 JS/Python/JSON 文件语法检查及 diff 检查通过。真实 DeepSeek 合成测试通过：图片读取、两页 PDF 逐页转图按序读取、Candidate/Job 各一次讨论及一次修改提案，共 6 次推理；没有私人材料或确认数据写入。
- 浏览器：egolite 在独立 `:8001` 验证旧 Pro 阻止继续、仅 Vision 可选、显式选择后导入/对话分配收敛、历史记录保留、Local 可选及进入 Workspace。egolite 截图技术超时后，使用已安装 Chrome 的 Playwright 完成 1280×800 截图核对；无新增 JS 异常，既有 Google Fonts CSP 阻止记录与本修改无关，未扩大修改范围。
- 已核实原进程 cwd 后重启正式 `:8000` 服务；8 项 HTTP 检查通过，包括新模型列表、对话签名及 Pro 请求 422/Provider=0。证据原地保存在忽略目录 `.cache/multimodal-api-20260908/`，不提交凭据、运行数据或 QA 产物。
- 验收边界：真实合成 Provider 测试与浏览器选择流程分开记录；未以此宣称复杂私人 PDF 识别质量或完整个人资料端到端重新验收。完成后按当前项目规则创建本地 Git commit，不 push。

## 2026-09-08 — 迁移与项目规范阶段 Git 收口

- 用户明确要求提交当前项目，并将“每次大阶段完成且验收通过后主动创建一次本地 Git commit”作为后续工作规则；已写入 AGENTS.md，取代旧的不自动提交约定。此授权不包含 push、发布或额外清理。
- 本次提交范围为已完成的迁移/切换记录、README 与文档入口、项目专用 AGENTS/PROJECT_CONTEXT、gate #16 精确断言修复，以及迁移时已排除的 4 张 tracked 私有 QA 图片。原始图片继续保留在旧归档位置，未执行新的文件删除。
- 运行验收沿用本阶段已完成的 59/59 regressions、70/70 HTTP 及浏览器/数据完整性证据；后续改动仅为项目文档与提交规则，不改变运行代码。提交前检查文档链接、diff 格式与暂存文件范围。

## 2026-09-08 — 项目专用工作规范与上下文整理

- 用户重新明确主线：先理解个人资料，再理解用户选择的职位描述，通过有依据的关联、澄清与建议帮助用户逐步接近目标职位。
- 新增 AGENTS.md 与 PROJECT_CONTEXT.md，择要整理项目规则、领域边界和现有设计决策；只引用本仓库已有契约与证据，不整份复制旧系统规范或个人学习记录。
- README、docs/README 与 NEXT_PHASE_HANDOFF 增加当前入口及历史状态/授权说明，保留原正文和既有迁移收口记录。产品愿景与已实现范围分开；未启动新功能、未更换应用 Provider/model。
- 本次仅改项目文档；40/40 本地链接有效，四份既有文档原正文按原顺序保留，核对范围内 128 个旧目录文件无变化，既有改动保留，diff 检查通过且暂存区为空。未重跑产品回归或真实 Provider 请求，既有运行验收仍引用下方记录。

## 2026-09-08 — Human 正式切换与 Phase B

当前状态：**CUTOVER COMPLETE / PHASE B COMPLETE / ARIADNE ACTIVE**。用户已明确确认 `/Users/kai/Documents/GitKaiNex/Ariadne` 为正式开发目录，并授权按首次迁移快照 §15 清理旧实现。此前 READY FOR CUTOVER / Human confirmation pending 为前序历史状态。

本轮清理已完成：按 74 个显式路径组移除 1,044 files；旧根 124 个原文件保留（123 个逐字节不变，README 仅加归档提示并保留原正文），另新增 RELOCATION_POINTER.md。清理后从新根直接执行 app.py，PID 85159；39 Node + 20 Python = 59/59 regressions、70/70 HTTP（63 静态字节对照）再次通过。255 个现行实现/测试/数据文件及 57 个原始浏览器 Blob 哈希不变，SQLite 完整性正常；main 37 commits/HEAD 不变，暂存区为空。无真实 Provider 请求，本轮未重复浏览器 UI 验收。

删除前核对：旧 1,168 files 无漂移；93 个 data/ 非缓存文件一致；原 Git 历史/对象完整，新仓库 main HEAD 不变，现有未提交内容保留。执行记录和每文件清单见 [Phase B 执行记录](/Users/kai/Documents/Codex/AI-Learning-OS/06_reports/ARIADNE_CUTOVER_PHASE_B_2026-09-08.md)。

旧根保留学习/历史/私有档案，入口见 [归档入口](/Users/kai/Documents/Codex/AI-Learning-OS/03_projects/job-radar/RELOCATION_POINTER.md)。本次不自动 commit，不修改产品代码，不发送模型请求，不启动 J2。Phase B 后旧根直接运行/回退方式失效，恢复需从新仓库及已保全的最新数据进行。

## 2026-09-08 — Ariadne 新目录迁移验收（READY FOR CUTOVER）

- 新 root：`/Users/kai/Documents/GitKaiNex/Ariadne`，`main @ a2b3512`。gate #16 的既有失败为 global-convergence 测试未同步 2026-09-05 hotfix 的 `canonicalRevision` 参数；依据确认版本 → 同源 Working 补齐/保留 pending edits/幂等性及 Human Save 契约，仅修正一条精确测试断言并加注释，运行代码不变。
- 复验全部通过：39 Node + 20 Python regressions、84 JS syntax、50 Python compilation、70 HTTP checks、Git diff/fsck。新位置现有 PID 77200 的 cwd/entrypoint 已核实，runtime audit 无旧 Learning OS 实现读取。
- 原 Codex profile + `http://127.0.0.1:8000` 的浏览器 smoke 通过：36 Candidate / 17 Job；两域 Detail Edit 首字段 focus、Cancel 不变、刷新重开不变；13 PDF 来源恢复、既有 Candidate Working 重开；console error/warning=0。本轮未执行真实 Provider turn、Human Save 或新导入，不据此新增语义质量或完整 E2E 声明。
- 旧目录 1,168 files hash/mode 无漂移、57 原始 Blob 同哈希、SQLite 完整性 ok。原未提交 README/QA exclusions/relocation docs 保留，无 staging/commit、Phase B 或旧 Learning OS 修改。技术迁移验收 READY FOR CUTOVER，正式开发切换仍由 Human 确认。
- 详情及临时证据路径见 `RELOCATION_HANDOFF.md` 顶部接手续验节；下方历史产品验收记录原样保留。

## 2026-09-05 — J1 Candidate Material conversation hotfix（browser and regression gates PASS）

- This entry supersedes earlier Candidate Material conversation PASS claims. Human usage disproved those claims; the hotfix is based on `13ff1fc764b7235ba624a82f3e9a6594d20ba6d3` and must not be committed until final real-browser gates pass.
- Reproduced on the normal `127.0.0.1:8000` Personal Information → Candidate Material Card → embedded Candidate Material Detail path. The composer retained input, but Send was disabled because the confirmed legacy item did not exist in its source's Working head. Existing tests assumed that binding already existed.
- Candidate-only repair: bootstrap the current confirmed item into the source's latest append-only Working head, idempotently; preserve pending Working edits; atomically persist legacy Human Save/direct Edit with confirmed revisions; refresh the parent Personal Information list after Save. ITEM Provider requests no longer include unrelated material directory entries. Expired interrupted Detail turns can be retried without fabricated Assistant output or Local fallback.
- First browser pass: Work Experience discussion, mutation, Working/Save/reopen/new-context; Project discussion after one Provider timeout and interrupted-turn recovery; Education discussion. Local Detail/direct Edit produced exactly zero Provider calls during the observed 105-second window. Original Model selection restored.
- Final automated gates: 18 Node suites, 8 Python suites (15 unittest cases plus six executable assertion suites), 10 JavaScript syntax checks, 3 Python compilation targets, and `git diff --check` passed. The additional Node suite covers the bounded Job negation repair, with 10 non-edit and 6 affirmative/mixed-intent cases.
- Final post-regression browser: Work Experience, Project, and Education discussions PASS; the same Work Experience mutation/Working/Human Save/refreshed Candidate Material Card/reopen/next-discussion PASS; Local Provider calls again exactly 0; original Model selection restored; captured console warning/error count 0. One mutation Provider response failed parsing without mutation, then one identical-prompt retry passed.
- The initial frozen Job smoke failed with `JOB_EDIT_INVALID`: its referent resolver misclassified “不修改任何内容” as an edit request. Work paused without staging/commit. The Human then explicitly requested the bounded repair and one additional smoke. Only negated edit-verb routing was changed; affirmative/mixed requests and the original Human message are preserved. The additional real call used the identical question and existing Job Detail: new Assistant answer visible, HTTP 200, Provider called, no Working proposal or confirmed mutation. The server recorded `ASK_CLARIFICATION` as its normalized non-mutating result type; no claim of an `EXPLAIN` envelope is made. No Job prompt, mutation implementation, Save, or UI redesign was performed. All required hotfix gates now pass.
- Checkpoint: Product Progress is the bounded conversation repair. New Transferable Knowledge is that a visible confirmed material and a source-scoped Working head are distinct identities, and Save must advance both coherently. User-owned Capability Evidence is the Human's counterexample and acceptance contract, not independent implementation. Implementation/debugging/tests/browser operation are Tool-assisted; final Human review remains a separate capability/acceptance checkpoint. No J2, import redesign, or UI polish.

## 2026-09-04 — Ariadne runtime capability routing stabilized（real browser verified）

- Runtime ownership is now split into three independent contracts: Ariadne mode (`LOCAL` / `MODEL`), operation (`candidate_image_import`, `job_image_import`, Candidate/Job conversation, and text variants), and model capability. One shared operation-aware resolver persists compatible per-operation model assignments; Runtime load seeds only missing configured pro conversation assignments and never overwrites an existing Human conversation choice. MODEL failures remain MODEL failures and never dispatch the Local semantic path.
- Candidate image/PDF and Job image imports resolve to the configured `deepseek-v4-flash-vision-exp` adapters. `deepseek-v4-pro` no longer carries a latent Job-import adapter and remains the verified Candidate/Job conversation runtime. Job image requests include ordered original image inputs plus bounded read-only Source Preparation; the Working proposal retains every ordered SourceDocument ID.
- Real browser on isolated `127.0.0.1:8001`: a synthetic Candidate PNG produced one non-authoritative Working card through the vision Provider; two ordered synthetic Job PNGs produced one Working Job through the vision Provider; a subsequent Job conversation used `deepseek-v4-pro` and received the current synthetic Candidate Working snapshot. The incompatible pro-only image state was disabled as Model-unavailable and did not enter Local.
- The shared minibar is fixed at the right edge and vertically centered. The import-page transform containing-block bug was removed while a Workspace is open; desktop Workspace width now reserves the rail. At `1280×720`, Workspace was `x=87…1193` and minibar `x=1205…1262`, with a 12 px gap. Hover expanded the rail while its bounding rectangle stayed byte-for-byte unchanged.
- Browser diagnostics recorded two read-only `/api/local-source-read` Source Preparation calls, one `deepseek-v4-flash-vision-exp` Job import call, and one `deepseek-v4-pro` Job conversation call. No `/api/local-job-extract`, `/api/local-job-image-ocr`, Local semantic proposal, or Local review path executed in Model mode. Separate Local Candidate and Job regressions retained Provider calls = 0.
- Regression: `38` Node regression files and `20` Python regression files passed. No staging or commit was performed. Human acceptance remains pending.
- Checkpoint: Product Progress is operation-specific runtime routing plus real multimodal Candidate/Job proof. New Transferable Knowledge is that mode authority, operation requirements, and model capabilities must be resolved independently, and technical source reads must authorize semantic adapters without becoming semantic structuring. User-owned Capability Evidence is the Human Acceptance diagnosis and explicit routing/visual contracts. Implementation and QA are Tool-assisted. Remaining Gap is Human acceptance on the user's normal `:8000` session.

## 2026-08-31 — Figma parity、导入入口收敛与现有重复卡片融合

- Workspace 已按 Figma `02 · 工作空间` 的几何重建：1280 设计基线为 1060 px 双栏、32 px gap、297 px 文件夹、58 px 顶栏；当前 982 px 浏览器实测为 `433 + 32 + 433`，y=190、h=297，背景固定 `#f7f7f9`，Ariadne 字标居中。文件夹纸张、前盖、标题与数量基线均按 Figma 比例落位，原内容与既有开合/fade motion 保留。
- Personal/JD import 取消原生大号 file input 与“消毒示例”入口，改为 Figma 风格点击/拖拽区。Personal 支持 PDF/PNG/JPG/JPEG/DOCX；JD 默认顺序为 PDF → 图片 → 粘贴文本，PDF/图片各自约束 accept，粘贴文本置于最后，职位链接仍为选填，主动作只显示“开始理解职位”。
- 新增一次性本地重复数据收敛：保留最早对象 ID，用确定性字段融合合并事实、来源、uncertainty 与版本，再删除重复副本并写入 migration marker。当前浏览器 Personal 从 9 张重复资料收敛为 3 张，JD 保持 1 张；Ariadne 项目名同步到现有演示记录。后续新导入仍先弹窗由用户选择融合/保留/取消，不会静默覆盖正式 Career Model。
- 字体合同为 Recursive → Inter → IBM Plex Serif Regular → 系统中文 fallback；返回箭头横线缩短为 17 px。V1 cache 升至 `v1-motion-29`。
- 验证：14/14 Node `.mjs`、全部 Python regression、17 个 public JavaScript syntax、14/14 HTML HTTP 200；真实浏览器验证 Workspace geometry/count、Personal 悬浮导入 80% + 8 个 resize handles、JD PDF/Image/Paste 顺序与状态、Personal 3 张唯一卡片通过。没有 Provider/API/Key/付费调用。
- Checkpoint：Product Progress 是 Figma 到实现的一致性、输入模式收敛与重复数据清理；New Transferable Knowledge 是“去重检测 → 人工决策 → 确定性融合 → provenance 留存 → 持久化”的本地闭环；用户提供了视觉验收标准与入口顺序，构成产品判断证据；CSS/JS、IndexedDB migration 与回归属于 Tool-assisted Implementation。Remaining Gap 是实际 PDF/图片正文解析仍未在本轮改变，也没有真实模型识别验收。

## 2026-08-31 — 本地导入可见闭环 + Figma 7 画面编辑基线

- 本地个人材料导入不再覆盖固定的 3 个演示 ID：`importLocalCandidateFixtures()` 为每次导入创建独立批次与新对象 ID，并强制记录 `recognition_mode: LOCAL`、`network_sent: false`、`ai_recognized: false`。浏览器回归中列表由 4 个入口/对象增长到 7 个，控制台无 warning/error。
- 本地与模型识别继续分流：`network_sent: false` 或 `recognition_mode: LOCAL` 现在优先阻断 AI 面板，即使旧记录残留 provider/model 字段也不会误开 AI；模型识别对象的 scoped conversation / reviewable patch 未删除、未改调用逻辑。
- Personal/JD 卡片区从 CSS columns 改为占满容器的响应式 Grid；桌面实测为 3 列 `371px`，横向覆盖 `1149px` 容器。AI 对话气泡使用 flex 垂直居中与对称纵向 padding。
- Figma `Job Radar — UI Screens` 只保留 7 个画面：02、03A、03B、03E、04A、04B、04E。保留画面中的 301 个 Auto Layout/Grid 容器已转换为自由布局，7 个顶层画面和所有后代的自动布局计数均为 0，因此拖拽不再被父布局回排。旧 `04E` 只有游离残片，已基于 03E 分栏结构补建为独立中文职位 + AI 画面。
- V1 静态资源版本升至 `v1-motion-27`，避免浏览器继续命中旧 CSS/JS。Node 回归、浏览器本地导入、Grid 几何和 Figma 结构/截图通过；没有 Provider 调用、API Key、职业资料上传或费用。

## 2026-08-28 — V1 中文界面与来源分流恢复（Browser + Figma verified）

- Runtime、Workspace、个人资料、职位描述、导入页、详情页与相关职业资料界面的用户界面文案已统一为中文；模型名、API、PDF/DOCX/JSON 等技术名词、`JOB RADAR` 产品字标与原始来源证据保持原样，避免改变协议或 provenance。Workspace / Personal / JD 顶部说明、STEP 01/02/03 与文件夹 01/02 编号已移除，Workspace 的 `JOB RADAR` 精确居中。
- AI 能力按来源分流：`network_sent: false` 的本地导入对象只显示资料信息，不创建对话面板；由模型识别、具有明确 provider/model provenance 的对象继续显示 scoped AI conversation 与可审核 Patch。历史本地 demo 记录会增量迁移中文副本，历史 AI 对话仅在展示层翻译，不删除用户数据。
- 现有 Figma 文件已原位同步为 22 个可编辑 Frame、1443 个可编辑 Text 节点；本地来源 Candidate/Job 页面不含 AI 面板，新增的模型识别 Candidate/Job 页面保留 AI 面板。Workspace `JOB RADAR` 为未栅格化的真实文字节点，名称为 `JOB RADAR（可编辑）`，画布中心与文字中心一致。
- 验证：4 个关键 JavaScript syntax、全部 14 个 Node `.mjs` regressions、localhost Workspace/Personal/Candidate 来源分流和 Figma 结构检查通过；未调用 Provider、未发送 API Key 或职业资料、未产生模型费用。

## 2026-08-28 — Personal/JD import guides share the reversible floating overlay（Browser verified）

- “添加个人材料”与“添加职位描述”不再进入独立全页导入路由；它们和已保存对象使用同一个 80% 悬浮容器，从原引导卡位置放大，点击 ×、遮罩或 Esc 后反向缩回原卡片。导入内容仍复用原 `personal-import.html` / `jd-import.html`，只增加 `embed=1` 显示模式，没有复制上传、fixture processing 或 IndexedDB 逻辑。
- 导入完成时，嵌入页只向同源父页面发送受限的完成消息；父页面先沿原路径收回悬浮层，再刷新相应 library，并把焦点放到新生成的 Candidate/Job 卡片。浏览器地址不发生变化，Personal/JD 的已有对象及 Add Guide 均保留。
- V1 cache 升至 `v1-motion-18`。浏览器验收：Personal guide `335×285`、JD guide `335×330` 都放大为 `643.195×557.594`（当前 804×697 视口的 80%）；Personal 取消后来源卡恢复；Personal 与 JD 使用消毒示例完成处理后，overlay hidden、body 解锁、列表原地刷新，焦点分别落在 `candidate:demo-work-experience` 与 `job:demo-job-ai-product-manager`。
- 验证：全部 13 个 Node `.mjs` regressions、16 个 public JavaScript syntax、8/8 localhost 页面与 `git diff --check` 通过；未执行 Provider/API 请求。

## 2026-08-28 — Stored card 80% reversible detail overlay（Browser verified）

- Personal Information 与 JD 中已经保存的普通卡片不再导航到独立详情页；点击后从原卡片位置连续放大为居中的悬浮详情层，桌面最终尺寸严格为视口 `80vw × 80vh`。关闭按钮、遮罩与 Esc 都沿相反路径缩回当前来源卡片，不再经过全屏白色 holding frame，因此消除了卡片放大后换页造成的闪动与色温跳变。
- 悬浮层内部复用原有同源详情页并添加 `embed=1`：左侧是资料/职位信息，右侧是现有 scoped AI conversation，两侧各为独立圆角卡片并可单独滚动。Candidate/Job 数据、Direct Edit、Patch 与对话状态仍使用原有 domain/IndexedDB contract，没有复制第二套业务逻辑或静默修改已存资料。
- “添加个人材料 / 添加职位描述”引导卡继续进入专用导入页，不被详情悬浮层拦截。版本升至 `v1-motion-17`；打开 540 ms、关闭 480 ms，使用相同 spring-like easing，并兼容 `prefers-reduced-motion`。
- 浏览器验收：Personal 与 JD 悬浮层在 `804×697` 视口中均为 `643.195×557.594`（宽高比例均约 `0.8`）；嵌入页均为 2 列、16 px 间距、22 px 圆角、独立滚动，关闭后来源卡恢复可见并可再次打开；导入引导卡仍正常导航。16 个 public JavaScript syntax、13/13 Node regressions、6 个非历史-fixture Python scripts、8/8 localhost 页面与 `git diff --check` 通过；未执行 Provider/API 请求。

## 2026-08-28 — Workspace folder navigation simplified to pure fade（Video + Browser verified）

- 对照 `Screen Recording 2026-08-28 at 11.06.29.mov`，Workspace folder 点击仍走 card clone 放大，再叠加目标页入场 fade；两种 motion 与表面颜色在导航交接点相互覆盖，形成闪烁和色温跳变。Workspace 的 Personal/JD folder 现已退出 card-to-page transition，只使用与 minibar 相同的整页 opacity fade；Personal/JD 返回 Workspace 也走同一路径。
- 发现并修复 fade-out 未生效的直接原因：`.v1-page-shell` 的入场 animation 使用 `fill: both`，结束后持续占用 `opacity: 1`，覆盖 `.v1-route-leaving`。现移除 persistent fill，出场 320 ms、入场 420 ms 都只改变 opacity，不再位移或创建 card clone。
- 当前 V1 cache 版本为 `v1-motion-14`。浏览器采样：Workspace opacity `1 → .260 → .058 → .008`，Personal `0 → .629 → .882 → .993 → 1`；返回 Workspace 与打开 JD 同样连续；全过程 card transition layer 数量为 0，body background 始终 `rgb(247,247,249)`。
- 验证：16 个 public JavaScript syntax、13/13 Node regressions、6 个非历史-fixture Python scripts、8/8 localhost 页面与 `git diff --check` 通过；未执行 Provider/API 调用。

## 2026-08-28 — Card color interpolation + stable folder text plane（Video + Browser verified）

- 对照 `Screen Recording 2026-08-28 at 11.02.13.mov`，卡片 clone 原本以纯白结束，而导入页以 `--paper: #f7f7f9` 开始，导航交接时因此出现可见的白→冷灰闪变。正向与反向 card transition 现在都显式在 `#fff` 与运行时读取的 `--paper` 之间连续插值；arrival cover 与目标 body 使用同一个实际颜色。
- Workspace folder 的文字闪动不只来自旧 filter：hover 时旋转前盖会在 3D 合成上下文短暂盖过 `translateZ(1px)` 的文字。序号、标题与计数现固定到独立 `translateZ(96px)` 前景平面；folder anchor 不再位移，标题下移到 folder 下半部，hover / leave 均保持同一坐标与 opacity。
- 当前 V1 cache 版本为 `v1-motion-12`。浏览器采样：正向颜色 `rgb(253,253,254) → rgb(248,248,250) → rgb(247,247,249)`，目标 body/cover 均为 `rgb(247,247,249)`；Personal title hover/leave 相对 top 均为 `208.189px`、opacity 均为 `1`，且打开时持续可见。
- 验证：16 个 public JavaScript syntax、13/13 Node regressions、除既有历史 fixture assertion 外的 Python regressions、8/8 localhost 页面与 `git diff --check` 通过；未执行 Provider/API 调用。

## 2026-08-28 — Folder text compositing + exact fade background（Browser-verified）

- Workspace 文字闪动来自 hover 时给整个 folder anchor 添加/移除 `filter: drop-shadow()`，浏览器会在离场时撤销整卡合成层并重新栅格化文字。阴影现在只作用于 `.v1-folder-back` 的 `box-shadow`；标题、序号与计数固定在 `translateZ(1px)` 合成层，folder 本体全程 `filter: none`。
- V1 fade 原先把 animation 加在整个 body 上，透明阶段会露出浏览器默认底色。现在 body 的 `--paper: #f7f7f9` 永远不透明，只让 `.v1-page-shell` fade；card arrival/return cover 也统一使用 `var(--paper)`。版本升至 `v1-motion-10`。
- 浏览器采样：Personal folder 文字在 rest / hover / leave 55 ms / leave 205 ms / settled 的 opacity 均为 `1`、color 均为 `rgb(31,34,42)`、folder filter 均为 `none`；Workspace → Personal fade 的 leaving / arrival / final body background 均为 `rgb(247,247,249)`、body opacity 均为 `1`。未执行 Provider/API 调用。

## 2026-08-28 — Folder / right minibar / card transition refinement（Video + Browser verified）

- 对照 `Screen Recording 2026-08-28 at 10.09.31.mov`，Workspace folder 不再让三张 paper 分别弹散：paper 使用固定 6 px 层级槽位与同一 12 px hover 位移，作为一组进出；front 改为 `rotateX(-30deg)` 的明确开盖动作。鼠标移开后 paper 相对间距保持不变，闭合后仍能看到三层文件边缘。
- minibar 镜像到右上角：dash 右对齐、tooltip 向左展开，当前页静止宽 16 px / opacity `.96`；13 px proximity field 与 spring loop 保留连续 fisheye wave，切页仍为 220 ms fade。桌面阈值调整为 701 px，使当前 in-app browser 804 px 视口也能直接使用。
- 对照 `Screen Recording 2026-08-28 at 10.12.01.mov`，card-to-page 不再在动画中途突然清空内容：460 ms 放大先保持 card 内容，300 ms 后才渐隐；到达页用白色 arrival cover 与 page content 交叉淡入，且取消 body 的重复初始 fade，消除双层重绘闪动。
- 版本：V1 `v1-motion-9`。浏览器逐帧验证 folder hover/leave/settle、右侧 minibar proximity、card 120/340/470 ms 与 arrival/final 帧；13 个 Node regression files、7 个不相关 Python regressions、16 个 public script 语法检查、8 个 localhost 页面与 `git diff --check` 通过。既有 `career_entity_regression.py::test_real_portfolio` fixture assertion 仍失败，与本轮 UI 无关且未改动。未执行 Provider/API 调用。

## 2026-08-28 — Motion continuity bugfix（Browser-verified / No Provider Call）

- Add Model 关闭缺少动画的根因是正向 CSS animation 以 `both` 持续占用 `transform`，覆盖关闭 transition。关闭前现在先进入 `is-close-ready`、解除 animation 并强制建立起始帧，再以 380 ms 收回 Runtime selector 中心；关闭后菜单恢复、再次打开仍正常。
- Workspace folder 的纸张离场原先使用强前置 easing，80 ms 内几乎全部掉回前盖后方。现在离场为 560 ms 柔和滑回，并在闭合状态保留三层 34.4 / 24.8 / 15.1 px 的纸张边缘，不再像删除内容。
- Personal 引导卡、JD folder、JD 引导卡都改为 idle 黑色、hover 白色。card-to-page clone 与反向 return clone 使用 `v1-transition-light` 锁定白色；返回后再以现有颜色 transition 平滑恢复黑色，消除点击/返回闪黑。
- 版本：Runtime `runtime-ui-v45`；V1 `v1-motion-8`。13 个 Node regression files、7 个不相关 Python regressions、4 个脚本语法检查、8 个 localhost HTTP 页面、浏览器开合/hover/leave/forward/return sampling 与 console 0 warning/error 通过。未执行 Provider/API 调用。

## 2026-08-27 — Runtime / Workspace motion refinement（No Provider Call）

- Runtime 的“添加新的模型”不再从底部上滑：现在从触发按钮位置按统一比例放大为居中悬浮页；左上返回、遮罩、Esc 与 Qwen 验证成功都复用同一条反向收回路径。Runtime 下拉菜单更贴近选择框，垃圾桶保留原按钮边框，仅缩小内部图标。
- V1 minibar 仍保持 52 px 外部宽度，但默认四段纵向间距更短，靠近后纵向展开；当前页 dash 在静止与交互时都有更强区分，Runtime / Workspace / Personal / JD 之间只用轻量 fade 切换。
- Workspace 的 Personal Information / JD 改为三张纸张的分层文件夹：hover 时纸张依次弹起、folder front 轻微打开，移除了原右上角箭头。Personal 首张引导卡默认为黑色，hover 变白；返回符号与引导卡加号均无外框。
- 文件夹、Personal/JD 卡片与导入引导卡使用共享的卡片→全屏 420 ms 过渡；详情返回与导入完成复用反向全屏→原卡片过渡。所有可操作按钮维持轻微按压缩放，并尊重 `prefers-reduced-motion`。
- 验证：13 个 Node regression files、4 个浏览器脚本语法检查、8 个 localhost 页面 HTTP 200 与 `git diff --check` 通过。浏览器自动 reload 受本地 URL 安全策略限制，本轮未据此新增视觉通过声明；未执行 Provider/API 调用、未发送 Key 或职业资料。
- 学习边界：交互目标与视觉判断来自用户；CSS/JS 状态、动画路由、session transition contract 与回归实现属于 Tool-assisted Implementation。

## 2026-08-27 — Reference mini sidebar motion

- 依据用户提供的 12.155 秒录屏与后续精确交互合同，Web-first V1 桌面导航改为常驻 mini rail：鼠标纵向距离形成连续 fisheye 波形，最近 dash 最长最深，相邻 dash 按高斯距离场逐级衰减；宽度、opacity 与厚度由带速度/阻尼的 spring loop 回弹。
- rail 仍只有 Workspace / Personal Information / JD / Runtime，不展开成后台式 sidebar。Candidate detail 归属 Personal，Job detail 归属 JD；hover 与 keyboard focus 使用相同反馈。
- 小于 821 px 时隐藏 rail，继续使用现有圆形 menu；支持 `prefers-reduced-motion`。没有修改 Runtime、Candidate/Job schema、fixture、IndexedDB 或 Provider 路径。
- 验证：44 项 UI/fisheye contract、全部 12 个 Node test files、桌面距离场数值采样、离场回弹、focus 与移动 fallback 通过；浏览器 console error = 0。

## 2026-08-27 — Web-first V1 STEP 02–03 UI Framework complete（Fixture-only）

- Workspace 已收敛为两个可点击对象：`Personal Information` 与 `JD`；无永久 sidebar，统一 menu 只保留 Workspace / Personal / JD / Runtime。
- STEP 02 已实现 Personal library empty state、Resume/Portfolio/Project/Other bottom sheet、Browser File API 元数据预览、无百分比的五阶段状态流，以及 1 Work / 1 Project / 1 Education 的消毒 fixture cards。
- Candidate detail 采用左侧 structured item + 右侧 `CANDIDATE_ITEM` scoped conversation；对话只能先提出 Before/After/Why Patch，再由用户接受或拒绝。Direct Edit 为零模型调用，先预览后确认。
- STEP 03 已实现 JD library、Paste/PDF/Image bottom sheet、fixture processing、1 个独立 `job-radar-job-context-v1` Job Card、5 条 Requirements 与 `JOB` scoped conversation；没有 match、application 或 Candidate mutation。
- IndexedDB 仍为同一个 `job-radar-local-first-v1`，additive 升至 v10；新增 `demo_candidate_items`、`demo_job_contexts`、`demo_conversations`、`demo_ui_state`，与正式 Candidate/Job truth 完全分离。
- 验证：27 项 STEP 02–03 contract checks、全部 12 个 Node test files、全部 Python regression scripts、桌面浏览器全流程与 390 px responsive DOM 验收通过。没有真实 Provider call、API Key、Resume/JD 正文读取或外部传输。

## 2026-08-25 — Product Architecture V2 Gate Closeout

```text
PRODUCT ARCHITECTURE V2 = FROZEN / CONFIRMED
Architecture Gate = COMPLETE
Implementation = IN PROGRESS / Phase A–B contract preparation complete
Current Milestone = STEP 1 — ONE REAL RESUME
                    CANDIDATE IMPORT + HUMAN CALIBRATION
```

当前最高 authority：`docs/architecture/PRODUCT_ARCHITECTURE_V2_FINAL_CONSOLIDATION.md`。本文件以下更早日期的 P4.1、Career Intelligence V0、CareerEntity、CapabilityBoundary、CareerDirectionHypothesis、OCR 与旧 V2 Gate 内容只保留为实现/决策历史，不是当前主线、next action 或 architecture research backlog。

## 2026-08-26 — Add Model Sheet Interaction Shell（No Provider Call）

- Runtime Selection 的“＋ 添加新的模型”已从旧的全页跳转改为当前页 bottom sheet：遮罩、上滑、关闭、Esc、Provider picker、Key 输入/清空、动态官方 Key 链接、状态区、候选模型区与禁用的完成按钮均已实现。
- 首批 catalog 严格按 model-level 只含 `deepseek-v4-flash-vision-exp`、`gemini-3.7-flash`、`qwen3.8-max`；文本模型与 account unknown 不会进入 sheet 的可用图文模型列表。当前主选择器不显示 Gemini/Qwen，只有当前官方接入 DeepSeek 模型与“添加新的模型”。
- “连接并读取可用模型”在本轮不读取或传输 API Key，也不调用 Provider；输入满足前置条件后只显示等待 action-time 批准。只有后续获得账号模型列表、选中图文模型并通过真实对应验证，✓ 完成才可启用并回写主选择器。
- 浏览器验证：sheet 显示三家 Provider，切换 Qwen 会显示正确 Key 链接，关闭后覆盖层隐藏；Key 未输入、未发送。离线 catalog/UI/现有 runtime/provider regressions 与 Python compile 通过。

## 2026-08-26 — Runtime Selection 多模态能力修正（Implementation Ready / Paid Smoke Not Run）

- **V1 normal selector = multimodal-only：** DeepSeek 官方 2026-08-21 公告确认 `deepseek-v4-flash-vision-exp` 是支持图文混合输入的多模态视觉理解 API 模型；该 exact ModelDescriptor 因此以 `official_contract + TEXT/VISION + VERIFIED` 进入 V1 并可继续。`deepseek-v4-flash`、`deepseek-v4-pro` 与 unknown 均不继承视觉能力且不显示；Gemini browser-BYOK 路线未接入当前选择器。
- **连接边界：** 进入 Workspace 是已接入官方图文模型的选择状态，不代表已发起过付费请求；`MULTIMODAL_CONNECTION_READY` 仍是未来真实 synthetic smoke 的独立证据。没有 API Key 读取、Provider inference 或职业资料传输。
- **readiness 定义修正：** 不再以 `Reply only: OK` 的纯文本回包认定图文模型 ready。统一 smoke 是固定 360×96 JPEG（文字 `JOB RADAR TEST`）加指令 `Read the text in this image. Reply only with the text you see.`；仅在可见文本规范化后精确为 `JOB RADAR TEST` 时产生 `MULTIMODAL_CONNECTION_READY`。`STRUCTURED_OUTPUT_VERIFIED` 是独立、尚未验证的后续状态。
- **vision-exp 重新定位：** 先前经批准的纯文本 ping 空回包只证明该请求不适合该模型，不能显示为连接失败。官方公告现确认该 exact model 的图文合同；descriptor 使用 `OPENAI_CHAT_COMPLETIONS`、`TEXT + VISION`、PDF page JPEG/Base64 `image_url` 与 `choices[0].message.content`，允许进入 Workspace，但不声称已完成真实 smoke。
- **对话上下文边界：** Context Compiler 默认只发当前 Card、相关文字、同 scope 最近对话与用户消息；只有调用者明确提供相同来源的 `relevant_source_image` 时才包含图片。没有新增对话 UI、真实对话 call 或 CandidateContext 写入。
- **验证：** 图文 request/normalization、V1 selector filter、Gemini key safety、成功/失败 arrow、scoped conversation 的无自动图片与明确相关图片路径的离线回归均通过。未读取 API Key、未发送职业资料，也未执行任何 Provider inference。

## 2026-08-26 — Web BYOK Provider Feasibility Spike

- 独立、无计费的 Web-first 可行性 Spike 已完成，权威记录为 `docs/architecture/WEB_BYOK_PROVIDER_FEASIBILITY.md`。它不改变 V2、Candidate Context、Job/Résumé scope、Provider runtime、IndexedDB/SQLite，也不引入 Job Radar proxy、SaaS backend、Tauri、RAG、Agent 或 MCP。
- 实际浏览器证据：从 `http://localhost:8011` 使用固定无效 placeholder key 对 DeepSeek/Gemini/OpenAI/Claude/OpenRouter 的 model-list GET 触发预检并取得可读取 HTTP 结果（401 / 400 / 401 / 401 / 200）；无职业数据、真实 key、请求 body、模型 inference 或费用。该证据只证明 browser transport/CORS path，不证明真实 key、模型、stream、结构化输出、地区或安全默认值。
- 正式状态合同分离 `browser_transport` 与 `default_policy`。DeepSeek/Gemini 是 future `SESSION_BYOK_CANDIDATE`；OpenAI 为 `NOT_DEFAULT_ALLOWED`（官方明确禁止 client-side exposure）；Claude/OpenRouter 为 `REFERENCE_ONLY`。所有未来 UI 均维持 session-only default、no URL/log/telemetry/proxy、显式存储选择与删除 key。
- 下一外部边界仍只有一项：若用户重新 action-time 批准，可作 DeepSeek `deepseek-v4-flash → POST /responses` synthetic `Reply only: OK`（reasoning none / max 16 / no source data / no stream）的单次浏览器直连 smoke。未获批准前绝不执行，且本 Spike 不能标记 real inference ready。

## 2026-08-26 — Gemini Browser BYOK Runtime Smoke（历史 text-only 方案，已由上方图文方案取代）

- 用户批准的单次 Gemini real browser smoke 已以 Browser Direct BYOK 接入现有 Runtime Selection；没有使用历史 macOS Keychain、Python proxy 或 server-side credential。`public/gemini-browser-runtime.js` 先对 Gemini model-list direct fetch，再只从账号实际返回且支持 `generateContent` 的 stable Flash candidates 选择最低成本优先模型；当前官方优先候选为 `gemini-3.1-flash-lite`，但绝不在模型 discovery 之前假设其可用。
- 测试请求已固定：`POST https://generativelanguage.googleapis.com/v1beta/models/<account-returned-model>:generateContent`，协议 `GEMINI_REST_GENERATE_CONTENT`，synthetic input `Reply only: OK`，`maxOutputTokens: 16`，无文件/图像/职业资料/结构化 schema/历史/重试/fallback。`normalized.text` 非空且为 `OK` 或语义等价才会使 arrow enabled。
- Web UI 已实测：Runtime Selection 保持无 key 输入；选择 `Gemini · Browser Direct BYOK` 会进入 `/gemini-connect.html` 专页，显示 session-only password input、Google AI Studio key 获取链接与本地安全说明页。空 key 显示轻量 credential failure；Runtime arrow 保持 disabled。CSP 只允许 self 与 Gemini `connect-src`，无 key URL/console/IndexedDB；connection test 不创建 Conversation 或 Candidate truth。
- 当前唯一阻塞是用户在页面输入当次 Gemini API Key；不读取/复用 Keychain。输入后才会执行已经批准的唯一计费调用并记录 AUTH/CORS/PROVIDER/MODEL/REQUEST/RESPONSE_EXTRACTION/EMPTY_RESPONSE 之一。成功后关闭 Provider spike，回到 Resume → Candidate Proposal/Cards 的 browser-local Step 1。

Step 1 唯一范围：`ONE REAL RESUME PDF → SourceDocument → DeepSeek consent → real ProcessingRun states → structured CandidateItem Proposal → Work / Project / Education Cards → Human Review → Direct Edit → card-scoped AI Correction → Context Patch → Before / After / Why → User Confirm → CandidateContext persisted → close / reopen → confirmed Cards remain`。

明确不做：Portfolio、Job Import、Match、Resume generation、Capability Card、Career Mentor、Architecture redesign、旧 CareerEntity migration、OCR benchmark、MCP、RAG、Agent、Skill、CLI。Step 1 仅完成不会发送资料的 Phase A–B preparation，尚未运行真实 Resume 或完成任何 Card UI。

持续硬原则：`CARD-FIRST HUMAN CALIBRATION`；Candidate Context 是 semantic truth，Cards 是 human review views；用户是最终 Candidate Context authority；Direct Edit = 0 LLM calls；AI Correction 只提交 task-scoped Context Patch proposal；Minimum Necessary Change 保留为未来 Job/Application 原则；Passit 是下游 JD Evidence Match 基线，CareerStack/KarriereVault 是 Candidate representation 参考；reference-first；Git/GitHub 管代码版本，CandidateContext revision 管用户数据版本；Figma 管 Human Calibration UI 设计；DeepSeek first。

## 2026-08-25 — Step 1 Implementation Preflight + Phase A–B Preparation

- Git：项目已初始化为本地空仓库，尚无 commit、branch 或 remote；新增 `.gitignore` 忽略 credentials、runtime DB、local OCR uploads、private candidate material、exports、logs 与 cache。没有移动、删除、加入暂存区或推送任何文件。
- DeepSeek：Keychain credential presence 已确认；对账号只执行了 `/models` listing（没有 Resume、没有 model inference），可见 `deepseek-v4-flash`、`deepseek-v4-pro` 与 `deepseek-v4-flash-vision-exp`。官方当前支持该 vision model 以 image inputs 接收内容，故现有“本地完整 PDF 渲染为页图 → DeepSeek”delivery 可继续作为 Step 1 主路径。
- Phase A：新增 `public/candidate-context-domain.js` 的最小 V2 runtime contract；浏览器 IndexedDB 从 v7 additive 升至 v8，新增 `candidate_contexts`、`candidate_proposals`、`candidate_context_patches`、`processing_runs`、`processing_consents` 五个 stores。旧 SourceDocument、CareerEntity、CareerEvidence、AI Markdown artifact 与现有 records 未删除、未迁移、未写入。
- Phase B preparation：新增 `src/candidate_context.py`。它构建 DeepSeek JSON Output request，要求 CandidateItem Proposal 并对 empty / malformed / ungrounded output fail closed；它只返回 `NEEDS_REVIEW` proposal，不能写入 confirmed CandidateContext。此模块尚未连接页面或实际 Provider send，因此不会绕过 explicit consent。
- 验证：新的 JavaScript contract regression、Python provider-boundary regression、既有 AI artifact regression、Python compile 与 IndexedDB migration consistency check 均通过；没有真实 Resume、Candidate Context、Provider inference 或 UI Card acceptance。
- 下一真实阻塞：Phase C 前需连接/提供 Figma Candidate Human Calibration Kit 作为 Card visual authority；真实 Phase B execution 还需要用户提供一份 Resume PDF，并在 UI 内对具体文件、DeepSeek、用途与可能费用作 action-scoped consent。

## 2026-08-26 — Step 1A Runtime Selection + Real Connection Test

- Figma `01 — Runtime Selection`（node `9:3`）已作为第一屏 UI authority 实际读取。localhost 首页现在只保留单一 Runtime Selector 与单一圆形 Status/Next control；没有独立成功 checkmark 或后续页面重设计。
- 新增 `/api/runtime-options` 动态读取账号可见 DeepSeek 模型；`/api/runtime-check` 对所选模型执行不含职业资料的 `CONNECTION_TEST`（`Reply only: OK`，最多 4 output tokens），返回 token usage 与内部诊断；credential / transport / provider / model / unexpected response 分层失败。
- 真实测试：`deepseek-v4-flash-vision-exp` 已在用户明确批准后收到一次最小文本 ping；Provider 返回可解析但无内容，前端正确进入 `FAILED`，不显示 arrow，可通过重新选择模型重试。没有发送 Resume、Portfolio、Candidate Context 或 JD，也未创建 Candidate truth。
- Local：`LOCAL_READY` 不发 Provider request，arrow 已验证能进入现有 `/workspace.html`。离线 runtime regressions 与既有相关 regressions 均通过。
- 当前待决：该 vision model 的文本 ping 不能证明 ready。选择并测试已列出的 `deepseek-v4-flash` 会是独立的最小 API call，需在 action time 获得用户批准；未获批准前 Step 1A 不可标记 complete。
- 修正候选：DeepSeek 当前默认 thinking 可能让 `max_tokens: 4` 耗尽在 reasoning 而不返回 visible content。connection test 将改为显式 `thinking: disabled`、`max_tokens: 16`；仍只发送固定健康提示，下一次调用需单独验证。

## 2026-08-26 — Provider Reference-First Audit + Targeted Adapter

- 审计 authority：`docs/architecture/PROVIDER_REFERENCE_FIRST_AUDIT.md`。Chatbox、Cherry Studio、Resume Tailor 与 LiteLLM 的共通模式是：Provider identity、model descriptor、protocol、capability、request transform 与 response normalize 分层；“OpenAI-compatible”不等于所有 endpoint/protocol/capability 兼容。
- 新增 `src/provider_runtime.py`：DeepSeek model listing 规范化为 runtime-only `ModelDescriptor`；`deepseek-v4-flash` 走 `OPENAI_RESPONSES + TEXT`，`deepseek-v4-pro` 走 `OPENAI_CHAT_COMPLETIONS + TEXT/STRUCTURED_JSON`，`deepseek-v4-flash-vision-exp` 标记为 account-discovered experimental，未声明 plain-text capability，因此不会被 text ping 误判失败。
- Runtime UI 仍是 Figma 的单 selector + action control；账号可见但 capability 未确认的模型显示轻量说明、arrow disabled。Local 不调用 Provider，已再次验证进入 `/workspace.html`。修复 localhost 静态入口缓存，避免新 API 被旧 runtime script 解析。
- 新增 fixture-only protocol/capability/normalization regression；所有 targeted 与既有 Candidate contract regressions 通过。审计后没有新的 paid inference；剩余的 `deepseek-v4-flash → POST /responses` synthetic smoke test 必须逐次取得批准。

## 2026-08-26 — Scoped Conversation Foundation

- 已正式采用 `Scoped Conversation`：Conversation 属于 Job Radar object，不属于 Provider；第一版仅支持 `CANDIDATE_ITEM`。同一 Candidate Item 取得稳定 conversation ID；未来换 Provider/model 不复制 session，单个 assistant message 独立保留 canonical provider/model/protocol/usage provenance。
- 已新增 `public/scoped-conversation-domain.js` 和 IndexedDB v9 的 additive `conversation_sessions` / `conversation_messages` stores。Context Compiler 只编译当前 CandidateItem、可选 relevant source、最近 8 条本 session message、当前 user message 与固定规则；它没有网络调用、没有 credential、不会默认加入完整 Resume/Portfolio/CandidateContext/JD。
- 硬边界保持：Conversation ≠ Candidate truth；Conversation 只能支持未来的 Context Patch proposal，仍须 `validate → Before / After / Why → user confirm`。Direct Edit 仍为零模型调用。
- 当前 repo 尚没有 V2 Candidate Card Detail，因此未擅自加入右侧聊天 UI、真实对话、streaming 或 Patch Generation。`tests/scoped_conversation_regression.mjs` 与既有 Candidate/workspace regressions 通过；无 Provider call、无职业资料传输、无 CandidateContext 改写。

## 2026-08-25 — Product Architecture V2 Final Consolidation complete

Historical pre-closeout status：`PRODUCT ARCHITECTURE V2 FINAL CONSOLIDATION = ADOPT WITH CHANGES / IMPLEMENTATION PAUSED`。该状态已由上方 Gate Closeout 覆盖；其架构内容继续有效。

冻结 Sidebar：AI 工作区、导入资料、查看资料、导入职位、查看职位、设置。第一实现只能是一个真实 Resume 的完整 Candidate Import + Calibration lifecycle，之后才做一个真实 JD；Match、Minimum Necessary Change 与材料生成均为 later。当前 Job Radar 不是 Git worktree，Figma plugin 未安装；本 Gate 未修改生产代码、schema、SQLite、IndexedDB 或 Provider。完整决定：`docs/architecture/PRODUCT_ARCHITECTURE_V2_FINAL_CONSOLIDATION.md`。

## 2026-08-25 — 基础工作台 UI 已实现

- 新增 `/workspace.html`：在单一入口呈现本机的简历/作品集 Material Card、AI Context Card、已审核 Job Card 与下一步。
- 导入职业材料、AI 审核、导入职位与职位详情仍分别由现有页面承担；工作台不触发上传或模型调用。
- 浏览器 IndexedDB 打开版本已统一为 `7`（`local-first.js`、`local-jobs.js`、Career 页），消除旧页面回退到 `v2` 的兼容风险。
- 回归：新增 `tests/workspace_contract_regression.mjs`；既有 Career/AI/Analysis 回归仍通过，未产生网络调用。

## 2026-08-25 — Product Architecture V2 Gate adopted with changes

`PRODUCT ARCHITECTURE V2 = ADOPT WITH CHANGES`。Job Radar 的产品核心从长期 `Personal Career Intelligence / Career Mentor` 收缩为 `Evidence-grounded Candidate Understanding + Job Understanding + Application Intelligence`。当前 Build 继续暂停，等待用户确认 Architecture 后再进入实现；本 Gate 没有修改生产代码、schema、IndexedDB、SQLite、Provider、OCR 或前端。

V2 的正式 source-of-truth 边界是：Original Source = source of record；Reviewed Candidate Context = 产品正式 Candidate truth；confirmed CareerEvidence = matching/generation 的 claim-level reasoning source。AI Markdown 只是 `AI Interpretation Artifact`，Human Card 是 review/edit View，二者都不能自行成为 stored truth。

旧 `CareerEntity` 决定为 `DEPRECATE FROM AI MAIN FLOW / LEGACY-OFFLINE INTERMEDIATE / REPLACE LATER`；`CapabilityBoundary = KEEP + SIMPLIFY`，`InterestSignal = lightweight metadata`，`CareerDirectionHypothesis = DEFER / remove from main flow`，`OpenQuestion = contextual clarification only`。现有对象、records、tests 与 JD-001～014 均保留，不删除或重录。

ONE first implementation slice 已选定：`one existing AI Interpretation Artifact → typed Human Cards → one user correction → versioned Reviewed Candidate Context → confirmed CareerEvidence`。它默认复用现有 browser artifact，不发起新 Provider 调用；验证通过后才进入 one-JD JobRequirement/Match 与 ApplicationDossier。完整决定见 `docs/architecture/PRODUCT_ARCHITECTURE_V2_GATE.md`。

## 2026-08-24 — AI-first quality/review correction pending real result

用户对当前 AI-first 页面给出关键产品诊断：原先的单次发送确认没有清晰表现资料传输、费用确认、发送中、失败或返回内容；同时，页面下方的旧 Local fallback `CareerEntity` 卡片被误认为 DeepSeek 输出，造成“邮箱被当职业标签”、大量空字段和待分类原文的不可用观感。实际边界是：AI 通路只保存 Canonical Career Context Markdown；Local Entity 卡片没有使用 AI 输出。

已将界面改为两步确认（资料传输 → 可能费用 → 发送），并显示明确的发送中、失败或“AI 已返回”结果与 Provider/model/时间。Local Entity 卡片明确标注为高级 fallback、未调用 AI。Canonical prompt 升级为 `canonical_career_context_v2_flexible`：只保留证据支持的字段，无法稳定映射的片段进入带页码的“待人工归类的原文片段”，而不是硬填固定表单。服务日志随后确认用户已主动发起多次 DeepSeek 完整资料请求并收到 HTTP 200；旧前端没有可靠地呈现这些响应，且服务端不持久化响应正文，因此这些调用的实际 Markdown 仍需从浏览器本地 artifact 或一次明确的新发送中复核。

后续用户观察确认旧 Local Entity 审核仍造成强烈误导与阅读负担。页面已收拢为 `AI 返回职业上下文（默认可见，全文按需展开）` 与 `旧版本地 Entity 审核与导出（默认折叠）` 两层；AI artifact 不再被呈现为固定字段表单。邮箱→职业标签是 Local fallback 规则误投影的已知失败，不能归因为 DeepSeek prompt 或 AI 返回。

用户随后确认目标交互为完整闭环。AI-first 路径现为：选择 PDF → “资料将传输”与“可能费用”两个勾选 → 单一状态框（等待/可发送/已发送/已返回/失败）→ 可直接编辑的 AI 信息卡 → 确认使用。确认会将审核后的可变区块保存为浏览器本地 `ai_career_profiles` snapshot、下载 `MY_CAREER_PROFILE.md`，并跳转至 `career-profile.html` 专属个人 Profile 页面。该 Profile 不再依赖或写入旧 Local Entity 表单。

个人 Profile 初版暴露原始 Markdown 审核标记，阅读负担过高。`career-profile.html` 现采用阅读器呈现：字段加粗、子项目和列表被渲染为正常内容；`[原文明确支持]`、`[AI 解释]`、未知标记和页码移动到每块默认折叠的“查看依据与不确定项”。原始 Profile Markdown 下载仍保留。

## 2026-08-24 — AI-first Career Material path: DeepSeek complete-document verification

用户确认将 Career Material 主入口转为 AI-first。DeepSeek account model listing 返回 `deepseek-v4-flash-vision-exp`；现在可将完整 PDF 在本机瞬时渲染为全部 JPEG 页面后，以一份完整资料请求发送给 DeepSeek。Gemini 继续作为另一条完整资料验证通路。产品合同不再向用户区分“文字/PDF 能力”，只记录 Provider 内部 `document_delivery` 适配方式。Local parser/OCR 保留为折叠的高级离线 fallback，未删除、未重开 benchmark。

预检、离线合同回归与浏览器 UI 验证通过；没有职业 PDF 被发送，因此 AI 输出质量、隐私/费用体验和真实 Career Context 仍待用户主动测试。

## 2026-08-24 — Career Intelligence V0 control surface implemented; user review pending

`Career Intelligence V0` now has an additive, browser-local V0 proposal flow: confirmed CareerEvidence plus existing SQLite JD records generate review-only CapabilityBoundary, InterestSignal, CareerDirectionHypothesis and OpenQuestion records. IndexedDB v6 adds only `career_intelligence`; Confirm/Reject and CapabilityBoundary state edits survive refresh. The deterministic proposal layer preserves provenance and enforces that JD interest is not capability evidence, `UNVERIFIED` is not absence of ability, and AI-assisted implementation is not independent engineering capability.

This is **not** yet a usable baseline: the browser verification used an isolated test profile and no real user has reviewed or confirmed a Career Model V0. The next required action is real user review in the Control Center; do not start P4.2.

## 2026-08-24 — Formal Handover: Career Intelligence V0 is next

```text
P4.1A — LOCAL CAREER MATERIAL INGESTION = COMPLETE / PRODUCTION-USABLE BASELINE
P4.1B — AI-ASSISTED CAREER MATERIAL INGESTION = IN PROGRESS / GEMINI CREDENTIAL GATE
CAREER INTELLIGENCE V0 = NOT STARTED
P4.2 — EVIDENCE-GROUNDED MATCHING & APPLICATION INTELLIGENCE = NOT STARTED
```

`NEXT_PHASE_HANDOFF.md` is the authoritative next-thread handover. Document Understanding / OCR is now ingestion infrastructure. The next bounded product hypothesis is `existing CareerEvidence + existing JD records → CapabilityBoundary → InterestSignal → CareerDirectionHypothesis → OpenQuestions → Human Review → persistence`. This handover changed documentation only; no production code, schema, OCR, Provider, IndexedDB or UI was changed.

Learning-by-Building constraint: implementation remains `Tool-assisted Implementation`; only the user's own definitions, predictions, judgments, diagnoses, acceptance decisions, trade-offs and explanations count as `User-owned Capability Evidence`. The learning target is AI Product / AI Systems Product judgment, not independent software-engineering drills.

## 2026-08-24 — P4.1B AI-Assisted Career Material Ingestion: Provider Strategy Updated

```text
P4.1A — LOCAL CAREER MATERIAL INGESTION = COMPLETE / PRODUCTION-USABLE BASELINE
P4.1B — AI-ASSISTED CAREER MATERIAL INGESTION = IN PROGRESS
P4.2 — EVIDENCE-GROUNDED MATCHING & APPLICATION INTELLIGENCE = NOT STARTED
```

- Job Radar now defines **Local / No-AI Mode** and **AI-Assisted Mode** as alternative user-selected ingestion modes. Normal product use runs one mode; automatic voting, fusion, consensus, ensemble parsing and mandatory dual execution are out of scope.
- Local Mode retains the accepted native-first + selective Apple Vision + conditional OCR Resume GapTree + DocumentBlock v1 architecture. “Frozen” stops architecture-shopping; it does not block source-confirmed targeted fixes followed by regression.
- P4.1B's direct path is `Original Resume / Portfolio → multimodal AI → high-fidelity Canonical Career Context Markdown → local persistence / reuse`. It does not place local OCR or the deterministic parser in front of the model.
- Optional Local-vs-AI execution is an evaluation workflow only. The original source plus user judgment remains the adjudication authority; neither mode wins by default.
- P4.2 remains not started until P4.1B reaches a usable baseline.

### Current vertical-slice result

- Implemented a capability-aware Provider layer: DeepSeek = TEXT only; Gemini = direct original-PDF target; Groq = TEXT/IMAGE registered but direct PDF unsupported. OpenAI is not a P4.1B test provider and is not requested or configured.
- The page requires explicit Provider/model selection and private-document transmission consent. The original PDF Blob remains in SourceDocument; the localhost service does not persist the document or response and never writes SQLite.
- Existing DeepSeek Keychain credential passed a small real Chinese text preflight using account-returned `deepseek-v4-flash` → `预检成功`; no career material was sent. Its direct-PDF capability remains unsupported; existing JD screenshot behavior is unchanged.
- Gemini uses a separate `GEMINI_API_KEY` / Keychain entry, dynamic model listing and provider-specific privacy confirmation. It is not configured yet, so no Resume/Portfolio has been sent. Canonical Markdown and epistemic markers are Chinese-first while source-language names remain unchanged. P4.1B is **not yet a usable baseline**.
- Offline AI contract/cache regressions and all authoritative Local Resume/Portfolio, CareerEntity, confirmed-only CareerEvidence and Phase 3 regressions pass.

## 2026-08-24 — P4.1 Archive Cleanup & Workspace Reorganization

- Removed only 208 KB of regenerated Python bytecode and Finder metadata plus an empty, benchmark-created Paddle cache hierarchy. Shared Hugging Face/Docling cache remains `REVIEW_REQUIRED` and untouched.
- Root documentation is now limited to everyday entry points: `README.md`, `PROJECT_STATUS.md`, `NEXT_PHASE_HANDOFF.md`, `TECHNICAL_EVIDENCE.md` and `文件说明.md`/`.pdf`. Completed architecture reports live in `docs/architecture/`; completed phase checkpoints live in `docs/history/`.
- Durable evaluation evidence remains in `document_benchmark/`, which now has `README.md` and `CLEANUP_MANIFEST.md`.
- Post-cleanup CareerEntity, CareerEvidence, Phase 3, native PDF and Apple Vision OCR smoke regressions pass with `0 architecture regressions`.
- This is housekeeping only: the no-model architecture remains frozen and P4.2 has not started.

## 2026-08-24 — Repository Structure Cleanup

- Root now exposes `app.py`, five daily documentation entry points, and the primary folders `src/`, `scripts/`, `tests/`, `data/`, `public/`, `docs/` and `document_benchmark/`.
- Production Python modules moved to `src/`; Swift extraction adapters to `src/extraction/`; bounded/manual operations to `scripts/`; authoritative regressions to `tests/`; SQLite schema to `data/schema.sql`.
- `app.py`, scripts, regressions, benchmark harness, README commands and Markdown references now use the new paths. `docs/current/REPOSITORY_STRUCTURE_AUDIT.md` records the responsibility classification and dependency map.
- All authoritative regressions and a localhost application smoke passed after the move. No production behavior or frozen architecture contract changed.

## 2026-08-24 — Final No-model Document Understanding Closeout

```text
CAREER DOCUMENT UNDERSTANDING FOUNDATION = COMPLETE
NO-MODEL ARCHITECTURE = FROZEN
TARGETED MAPPING FIXES = CLOSED
```

- English image-only CV mapping now preserves `3 WorkExperience / 2 Education / 3 SkillGroup / 2 Language / 3 Award` entities. Award dates and other unsupported fields remain empty; every added entity retains source anchors.
- Touchine Portfolio mapping now returns five real project identities: `MemoryBlock`, `MUPAHKC`, `Material Card`, `Mac Setup`, and `Material Resonance`. CASE/category labels remain `category` / `section_label` metadata, and overview/contact pages are not promoted to projects.
- The complete real regression matrix passed: English CV, Touchine Portfolio, Tencent Resume PDF, Tencent Resume DOCX, Tencent Portfolio, 45-page comprehensive Portfolio, CareerEntity, confirmed-only CareerEvidence, duplicate/stable identity, refresh persistence, syntax/contracts, and existing Phase 3 analysis review.
- Normal browser acceptance passed without confirming career facts: English CV displayed 14 pending entities; Touchine displayed five pending projects; source-card switching worked; provenance expanded to page/line anchors; same-type duplicate import added `0`; refresh retained the five entities; confirmed entities and derived Evidence remained `0`.
- No OCR provider, Apple Vision selection, DocumentBlock v1, IndexedDB ownership boundary, or confirmed-only Evidence behavior changed. P4.2 has not started.

Remaining non-blocking limitations: ambiguous source-section semantics, conservative review calibration, and portfolios without reliable project boundaries that correctly remain `needs_manual_selection`.

## 2026-08-24 — Independent Blind Review Final Architecture Judgment

Historical audit verdict: `KEEP FROZEN WITH TARGETED FIXES`. The two targeted fixes identified here are now closed by the final no-model closeout above.

The native-first + selective Apple Vision + conditional OCR-Resume GapTree + DocumentBlock v1 architecture remains frozen. Independent review of the 45-page comprehensive Portfolio matched Job Radar on all five named projects, multi-page grouping, unknown outcomes and provenance. Two real implementation gaps remain: the image-only English CV has OCR blocks for awards and skill categories that are not fully projected into CareerEntity, and the Touchine Portfolio omits Mac Setup while using CASE/category labels as project names. Both are Document Structure / CareerEntity Mapping fixes, not evidence for reopening OCR or replacing the architecture.

`CAREER DOCUMENT UNDERSTANDING FOUNDATION` was architecture-complete at this gate. Current implementation status is `COMPLETE / FROZEN / TARGETED MAPPING FIXES CLOSED`. Full judgment and closeout addendum: `docs/architecture/DOCUMENT_UNDERSTANDING_FINAL_ARCHITECTURE_REVIEW.md`.

## 2026-08-24 — Document Understanding Architecture Gate

`CAREER DOCUMENT UNDERSTANDING FOUNDATION = COMPLETE / ARCHITECTURE BENCHMARKED AND FROZEN`.

The production path is native-document-first, selective Apple Vision V1 Auto only for unusable PDF pages, and conditional GapTree-style ordering only for OCR Resume pages. Outputs normalize to DocumentBlock v1 before the existing Entity-first boundary; Resume and Portfolio keep separate extraction/grouping logic.

Real corpus: 20 documents / 305 pages, 20 completed, 0 crashes, 18 reviewable, 2 external benchmark-only Portfolios safely `needs_manual_selection`, and 6/6 truth documents passed. Tencent Resume PDF/DOCX remain 13 entities; Tencent Portfolio remains four projects; the image-only English CV now yields 3 Work + 2 Education + Skills; the architecture Portfolio yields four projects with unsupported role/outcome fields empty.

Paddle, Surya and Docling were tested; none justified replacing the local Apple/native path. Details: `docs/architecture/DOCUMENT_UNDERSTANDING_ARCHITECTURE_BENCHMARK.md`. Do not resume OCR/framework experimentation without repeated new real-user evidence. Do not start P4.2 automatically.

## Phase Decision

- Current Phase: `ACTIVE / Phase 4 Career Intelligence Workspace & Agent Backend`.
- Active milestone: `P4.1 Career Material Entity-first Import`.
- Current slice: `COMPLETE / REAL RESUME + REAL PORTFOLIO ACCEPTANCE VERIFIED`.
- Current ingestion contract: `SourceDocument → ExtractionRun → CareerEntity → Entity Review → Confirmed Career Model → selective CareerEvidence derivation`.
- `CareerEvidence` remains the future JobRequirement matching layer; it no longer stores the Resume itself.
- IndexedDB and SQLite remain alternative implementations, not automatic replicas.
- Resume and Portfolio share the CareerEntity/review/evidence domain but use separate extraction paths.

## P4.1 Closeout — Career Material Entity-first Import

- Real Resume PDF: 13 `needs_review` entities — Basics 1, WorkExperience 3, Education 2, Resume Project 3, SkillGroup 2, Language 2. Missing/ambiguous fields remain null/low-confidence rather than guessed.
- Real image-only Portfolio PDF: native PDF text was empty; local PDFKit rendering plus macOS Vision OCR produced 4 `PortfolioProject` entities. No cloud/model request occurred.
- Portfolio grouping: same explicit CASE number is the only automatic multi-page merge signal. Material Card is `[4,5]`; MUPAHKC is `[7]`, so working-method and contact pages are not falsely attached.
- Layout-aware mapping: OCR blocks now preserve normalized coordinates/confidence. Field extraction accepts text from the same column below a label, rejects low-confidence/neighbouring-card blocks, and leaves unsupported fields empty. `Problem`, `Role`, `Process`, `Tools`, `Outputs`, `Boundaries`, source pages/assets and field anchors are reviewable.
- Browser acceptance in an isolated localhost IndexedDB origin: Portfolio import `4`; Resume import `13`; duplicate Portfolio import `0`; four Portfolio entities confirmed in acceptance simulation; `10` derived Evidence exported; reload retained sources, 13 pending entities, 4 confirmed entities and 10 active derived Evidence; browser console had no errors.
- Existing v0–v4 stores and records remain additive/preserved. SQLite was not written by career-document extraction.
- Gemini/DeepSeek document comparison is not justified in P4.1: the observed image-only/layout failure was resolved by the local coordinate-aware OCR path. A later comparison requires a documented residual document-understanding failure.

## Execution Mode Update — Continuous Milestone Build

For user-confirmed Phase 4 milestones, normal implementation, diagnosis, fixes and regressions continue without per-small-step approval. Pause only at material external, destructive, privacy/security, scope/architecture or missing-input blockers. Local user corrections may inform local-only correction memory; they are not centralised or used for shared training by default.

## P4.1 Reliability Extension — Local Correction Memory + Source Interaction

- IndexedDB v4 adds `correction_memory`: `ocr_replacement`, `section_alias` and `classification_correction` records are browser-local and versioned by `local_correction_memory_v1.json`.
- Corrections are applied only to the local extraction request. The localhost service validates/bounds the data but does not persist it; no provider call, SQLite write, upload or shared training occurs.
- Entity edits automatically remember bounded string corrections; a manual local-memory form supports aliases such as `PROFESSIONAL EXPERIENCE → work`.
- One unified intake zone supports file selection, drag/drop and clipboard file/plain-text paste. Pasted text is stored as a browser-local TXT SourceDocument.
- Source cards are now selectable and synchronize the lower review/confirmed/evidence view. Each existing source has `重新识别此资料`, which reruns the current local parser against its retained browser Blob without deleting source data.
- Real DOCX regression and UI re-recognition now yield the same 13 Resume entities as the real PDF. Browser evidence confirmed an OCR correction and section alias applied on pasted Resume input, persisted after reload, and current DOCX re-recognition created 13 pending entities with no console errors.
- Isolated browser acceptance also changed one complete WorkExperience to Education before confirmation: only name/institution, date, location and supported highlights carried over; unsupported Education fields remained empty, the confirmed card became Education, and the browser console stayed clean.

## Implemented Resume Slice

- Inputs: PDF, DOCX, Markdown and UTF-8 TXT, maximum 8 MB.
- Local route: `POST /api/career-document-extract`; no external model and no SQLite write.
- Resume entities: Basics, WorkExperience, Education, Resume Project, SkillGroup and Language.
- Complete WorkExperience grouping retains company, role, raw/normalized dates, location and all wrapped bullets.
- Deterministic extraction does not guess missing dates or ambiguous company/title boundaries; it lowers confidence and adds warnings.
- IndexedDB `job-radar-local-first-v1` uses additive version 4 stores: `extraction_runs`, `career_entities`, `entity_review_decisions`, `correction_memory`; all prior stores and records remain.
- Review unit is one entity. Confirm, edit-and-confirm, reject and reopen are recorded without changing source anchors.
- Confirmed entities project to a JSON Resume-compatible Career Profile and selectively derive capability/responsibility/outcome Evidence.
- Resume entity, extraction-run and Portfolio-project contracts are versioned in `data/domain_contracts/`.

## Verified Behavior

- Real Tencent-targeted one-page Resume: 13 entities — 1 Basics, 3 Work, 2 Education, 3 Project, 2 SkillGroup and 2 Language.
- The three Work entities preserve `company + role + dates + location + 2/1/1 highlights`; the wrapped Good Art bullet remains one item.
- Duplicate browser import creates 0 additional entities and leaves the review count unchanged.
- One Work entity was edited at entity level, confirmed, and produced 2 selective Evidence records; reopening removed it from the confirmed derivation, and reconfirming rebuilt the two records.
- Browser refresh retained 12 pending entities, 1 confirmed entity and 2 derived Evidence records.
- Additive upgrade retained two pre-existing SourceDocuments and seven legacy v0 Evidence records. Legacy records remain visible as preserved data but do not enter the v1 profile.
- Python, JavaScript and JSON contract checks pass; existing Phase 3 analysis regression remains unchanged.
- Empty/no-CASE Portfolio text returns 0 Project entities and `needs_manual_selection`; image-only PDFs proceed to the local visual OCR path. This is a fail-closed boundary test.

## Failure Coverage

- Missing Work date → `startDate/endDate = null`, `missing_date`, low confidence.
- Ambiguous company/title → empty unresolved field, `ambiguous_company_or_title`, low confidence.
- Header-only/partial Work text → `no_highlights_detected`, low confidence, still `needs_review`.
- Duplicate import → stable entity identities and no uncontrolled entity creation.
- Entity reopen → derived Evidence becomes stale/not active until reconfirmed.
- IndexedDB v2→v4 → creates only missing stores; old data remains.

## Learning and Ownership Boundary

- Product lesson: Resume entities own chronology and context; Career Evidence owns job-relevant claims derived from confirmed entities.
- Extraction confidence is not human verification. Every entity starts `needs_review`.
- The implementation, parser, schema, migrations, regressions and browser acceptance were Codex-assisted; they do not establish independent user coding ability.
- The one confirmed Work entity in the browser is an implementation acceptance action executed during testing, not a new independently verified employment claim.

## Historical P4.1A Stop Gate

P4.1A Local is complete. The user has now explicitly approved P4.1B AI-Assisted ingestion, which is the only active extension. Do not automatically start P4.2, RAG, MCP, Agent or Job Discovery.

## Runtime Selection — Qwen direct multimodal verification (2026-08-26)

- By user decision, Qwen now requires only an API Key. A click sends one minimal synthetic text+image request to fixed `qwen3.8-max` and visibly progresses through `正在发送模型列表请求 → 正在等待 Qwen 响应 → 正在验证图文输入能力 → 验证成功/失败`.
- The API Key is read from Provider-scoped browser `localStorage` and forwarded once by the local process when the user clicks connect; the server does not persist it. The request contains the fixed `JOB RADAR TEST` image and instruction only: no Resume, JD, Candidate data or SQLite persistence.
- Success means the returned text contains the synthetic image label, so the selectable model is actual image-input verified rather than name- or provider-inferred. This may incur minimal Qwen usage.
- Static and mocked HTTP regressions pass. The live call happens when the user refreshes and presses the updated Qwen connection button; the prior keyed page was not inspected or migrated.
- Selection persistence correction: a verified Qwen model is inserted into the main selector's `addedModels` collection and stored in browser `localStorage` without any Key. The chosen runtime is stored separately, so refresh/reopen restores Qwen and the asynchronous DeepSeek catalog load cannot replace it.
- A cache-versioned script URL (`runtime-ui-v4`) ensures an existing Runtime Selection tab receives the current readiness/persistence/menu fix on refresh.

## Runtime Selection — Add Model sheet interaction correction (2026-08-27)

- The Add Model overlay remains a bottom sheet. Its top grabber now supports continuous vertical resizing and three system-like height detents; Arrow Up/Down provides the same adjustment for keyboard users.
- Provider selection is one native dropdown for DeepSeek, Gemini and Qwen. The provider-specific API Key guide link switches immediately with the selected option.
- API Keys are now explicitly user-authorized browser-local persistence, keyed per Provider under `job-radar-provider-api-key:<provider>`. The sheet restores the last Provider and its saved Key after refresh; the trash icon removes only that Provider's saved Key. Keys are still excluded from the controller's exposed state and from the added-model selector record.
- The interface copy now says the Key is stored in the local browser and not uploaded to Job Radar cloud. This is browser storage, not OS Keychain isolation: same-origin scripts can read it.
- The connection button owns its visible state: idle text; spinner with no text while sending/waiting/verifying; a standalone check after verification; and `重试连接` after failure. The old bottom status row was removed visually while an `aria-live` announcement remains for assistive technology.
- The top-right completion action is icon-only and remains disabled until a Provider, saved/entered Key, verified multimodal model and selected model are all present.
- Regression contracts and live local-browser checks passed for Provider/link switching, refresh restoration, icon-only completion, visual status removal and height adjustment. No Provider request or career data transmission was made during this correction.

## Runtime Selection — default readiness + Apple-style menu correction (2026-08-27)

- Root cause: `loadModels()` copied the default DeepSeek descriptor into `state.provider/state.model` but left `state.phase = IDLE`. The UI therefore displayed a selected model while the next button still evaluated `ready = false` until the user selected the same model again.
- Fix: the default, restored and clicked paths now share `applyReadyModel(ModelDescriptor)`. A verified default DeepSeek model enters `OFFICIAL_READY` immediately; a previously verified added model enters `READY`; local mode enters `LOCAL_READY`. Display value and button readiness can no longer diverge.
- Browser-local continuity: added models and the selected runtime now use `localStorage`, with one-time migration from the earlier session record. Qwen's Provider-scoped Key is re-persisted on input/change/blur/close and immediately before connection. No Key is stored in the added-model or selected-runtime records.
- Origin rule: local development canonicalizes `localhost:8000` to `127.0.0.1:8000`, because browser storage is origin-scoped and the two hostnames cannot share a Key. A Key that existed only under the old hostname must be entered once at the canonical address.
- Motion/UI: the next arrow keeps the existing black/white visual language and adds soft hover elevation, shadow, arrow translation and press scale. The selector border/shadow transitions continuously. The menu uses a 20 px rounded translucent surface, blur, scale/translate/opacity entrance, staggered option reveal, selected checkmark and no redundant menu titles.
- Acceptance: fresh reload showed `DeepSeek · deepseek-v4-flash-vision-exp` with `runtime-action ready`; clicking the arrow navigated directly to `/workspace.html` without opening the list. Menu computed style changed from hidden `opacity 0 / translateY(-9px) / scale(.985)` to visible `opacity 1 / identity transform`; hover shadow changed from `0 2px 7px` to `0 14px 30px + 0 4px 10px`. Console errors/warnings: 0. No Provider connection was submitted.

## V1 floating-window unification + continuous detail plane（2026-08-28）

- Runtime cache contract is now `runtime-ui-v47`; V1 is `v1-motion-20`.
- Saved Personal/JD detail and Add Guide overlays now render as one continuous 80% surface: left object detail and right scoped AI conversation have zero inner radius/gap and one `1px` center divider. The underlying detail/conversation content and boundaries are unchanged.
- Runtime Add Model and the shared Personal/JD overlay now use `public/floating-window.js`: the header drags the surface; four edges and four corners resize it; viewport margins and minimum dimensions prevent losing the window; an interaction shield preserves pointer continuity across embedded iframes.
- Embedded detail panes reserve 52px bottom safe space, stable scrollbar gutters and inset WebKit scrollbar tracks. Import overlays reserve 56px safe space plus a 24px terminal margin, preventing end content/thumbs from being clipped by the outer rounded surface.
- Verification: all 14 Node `.mjs` regressions passed. Browser final-version acceptance confirmed eight resize handles, `gap: 0px`, inner radii `0px`, divider `1px`, and bottom padding `52px`; the left pane scrolled to exact maximum with the last item still 64px above the visible pane edge. Local JD page returned HTTP 200. No Provider/API request or user career-data mutation occurred.

### Learning checkpoint

- Product Progress: one window grammar now covers model configuration, saved detail and import overlays; detail and AI remain separate functional columns within one spatial object.
- New Transferable Knowledge: visual grouping can be changed independently of the information boundary; resize/drag input must be clamped and must survive iframe pointer crossing; rounded containers need explicit scroll-end safe zones.
- User-owned Capability Evidence: the user identified the misleading two-card hierarchy, requested one divider-based surface, required universal window manipulation, and detected the rounded-scroll clipping defect.
- Tool-assisted Implementation: shared controller, geometry clamping, CSS integration, cache versioning, regression coverage and browser measurement were implemented and validated by Codex.
- Remaining Capability Gaps: no independent user-authored implementation evidence was produced; touch-device manipulation and OS-level accessibility testing remain future acceptance work.

## Workspace folder attached-copy + staged paper motion（2026-08-28）

- V1 cache contract is now `v1-motion-21`.
- Root cause 1: folder title/subtitle/count were sibling layers fixed at `translateZ(96px)`, so they visually floated above the front cover while that cover rotated. They are now children of `.v1-folder-front` at a 2px local depth, and therefore inherit the exact same open/close 3D transform.
- Root cause 2: all three paper layers previously had different resting Y positions and received the same hover delta. The interface was effectively swapping between two already-separated arrangements. All three papers now overlap at the same resting transform, then separate in order with 0/42/84ms entrance delays and merge in reverse with 0/42/84ms exit delays. Every change remains a continuous 560ms transform; no display/visibility switch is used.
- Browser evidence: at rest the three paper top coordinates were exactly `627.99 / 627.99 / 627.99`. During opening they progressed through distinct intermediate positions and settled at `293.81 / 300.76 / 307.72`. The copy is DOM-contained by the front cover and moved continuously while the cover reached `rotateX(-30deg)`.
- Regression: all 14 Node `.mjs` suites, all public JavaScript syntax checks and `GET /workspace.html` HTTP 200 passed. No Provider/API call or persistent data mutation occurred.

### Learning checkpoint

- Product Progress: the folder now reads as one physical object; one visible paper becomes three on approach and the label behaves like printing on the cover rather than a floating HUD.
- New Transferable Knowledge: elements that represent one physical plane should share a transform ancestor; staggered enter/exit motion needs explicit rest equivalence and reverse ordering, not only different end positions.
- User-owned Capability Evidence: the user diagnosed both the detached text plane and the abrupt one-to-three/three-to-one state change from a real recording.
- Tool-assisted Implementation: DOM nesting, 3D depth correction, staged timing, regression contracts and frame/state measurement were implemented by Codex.
- Remaining Capability Gaps: physical mouse/touch feel remains a subjective acceptance item for the user; no independent user-authored code evidence was added.

## Workspace folder exit-order regression fix（2026-08-28）

- V1 cache contract is now `v1-motion-22`.
- Root cause: the first staged implementation collapsed the back paper before the two papers in front. During the first 35ms of pointer leave, the back paper crossed the middle paper (`307.67 / 302.92 / 307.72`), which looked like one page was abruptly removed even though every individual transform was continuous.
- Fix: exit now merges front → middle → back with `0/56/112ms` delays. The exit uses a calmer `660ms cubic-bezier(.22,.72,.2,1)` paper curve and a `640ms` cover curve; entrance retains the faster `0/42/84ms` separation and existing open endpoint.
- Real-pointer browser acceptance ran three enter/leave cycles on both Personal Information and JD. In all six cycles, open coordinates were `293.81 / 300.76 / 307.72`, every sampled exit frame preserved `back ≤ middle ≤ front`, and rest returned to `324.49 / 324.49 / 324.49`.
- All 14 Node regressions, 17 public JavaScript syntax checks and Workspace HTTP 200 passed. No Provider/API call or domain-data mutation occurred.

### Learning checkpoint

- Product Progress: the folder no longer loses a visible page while closing; both object folders share the same stable physical stacking rule.
- New Transferable Knowledge: continuous transforms can still create a discontinuous perception when 3D layers cross; exit sequencing must preserve visual occlusion order, not merely reverse entrance delays.
- User-owned Capability Evidence: the user detected the residual leave-only defect after the first motion correction.
- Tool-assisted Implementation: pointer reproduction, frame measurement, exit-order correction, cache versioning and regression coverage were implemented by Codex.
- Remaining Capability Gaps: touch/pencil hover behavior and device-specific GPU compositing remain future acceptance work.

## Workspace JD dark-folder surface synchronization（2026-08-28）

- V1 cache contract is now `v1-motion-23`.
- JD paper layers and their document lines now share the dark resting palette with the JD folder. Hover/focus/transition-light changes the back, papers, paper lines, front cover and copy to the existing light palette through the same 360ms color transition.
- Browser acceptance measured rest paper `rgb(42,46,54)` / line `rgb(85,91,103)`, hover paper `rgb(245,246,248)` / line `rgb(217,222,231)`, and exact return to the dark values after pointer leave. The non-crossing paper motion contract remains intact.
- All 14 Node regressions, all 17 public JavaScript syntax checks and Workspace HTTP 200 passed. No Provider/API call or career-data mutation occurred.

## Workspace folder compositor-flicker and paint-cost correction（2026-08-28）

- V1 cache contract is now `v1-motion-24`.
- Root cause: the three paper layers shared the same 3D depth and z-index; at the end of close, the front cover also changed from a matrix to `transform: none`. That combination allowed a final compositor layer reorder that appeared as a paper briefly piercing the closed folder. The animated hover shadows added paint work during the same interval.
- Fix: back/paper/front planes now retain deterministic depths `-4 / -3 / -2 / -1 / 0px` and explicit z-order. The front cover keeps `translate3d(0,0,0)` at rest, so it is never demoted at transition completion. Paper exit is shortened to `500ms` with `0/40/80ms` front-to-back delays; all papers finish before the `640ms` cover close.
- Performance: hover motion now animates compositor-friendly transforms and the already-required color transitions only. Folder, paper and cover shadows are stable rather than animated; the folder establishes an isolated layout/style containment boundary and all 3D surfaces hide their back faces.
- Real-pointer acceptance: Personal Information and JD each completed three full enter/leave cycles, followed by a rapid leave/re-enter/leave reversal. Every cycle returned to stable paper depths `[-3,-2,-1]`, z-order `[1,2,3]`, front identity matrix and no hover state. Open, close midpoint and final frames were visually inspected; browser logs were empty.
- All 14 Node `.mjs` regressions, all 17 public JavaScript syntax checks and Workspace HTTP 200 passed. No Provider/API request or career-data mutation occurred.

### Learning checkpoint

- Product Progress: folder close no longer exposes a last-frame paper/compositor flash, and hover/leave requires less per-frame paint work.
- New Transferable Knowledge: continuous CSS values are insufficient when multiple 3D surfaces are coplanar; stable depth ownership and a non-`none` terminal transform prevent compositor handoff artifacts. Animated shadows are a paint concern even when transform motion is GPU-composited.
- User-owned Capability Evidence: the user repeatedly isolated a leave-only visual defect and explicitly connected animation feel with rendering cost, prompting a layer/compositor diagnosis rather than another cosmetic timing adjustment.
- Tool-assisted Implementation: layer-depth stabilization, close sequencing, paint optimization, cache versioning, regression contracts and real-pointer verification were implemented by Codex.
- Remaining Capability Gaps: touch/pencil hover and low-end-device frame-time profiling remain future acceptance work; no independent user-authored implementation evidence was added.

## Floating import scrollbar safe-inset correction（2026-08-28）

- V1 cache contract is now `v1-motion-26`.
- Root cause: Personal/JD import embeds declared `overflow:auto` on `body`, but browser root-scroll propagation still assigned the visible scrollbar to the iframe viewport. The outer floating surface clipped that viewport scrollbar at its rounded bottom corner, so the thumb looked abruptly cut off.
- Fix: import `body` is now a fixed `100vh` non-scrolling viewport and `.v1-page-shell` owns the actual internal scroll. The shell keeps 52px scroll-end padding, stable gutter, thin scrollbar styling and a 20px top/bottom track inset. Structured detail and scoped-conversation panes share the same rounded thumb and track contract.
- Browser acceptance: at the equivalent 1022×516 iframe viewport, Personal shell measured `clientHeight=516`, `scrollHeight=696`, `max=180`; a real wheel event reached `scrollTop=180.5`. JD measured `516 / 668 / 152` and reached `scrollTop=152`. In the actual 80% Personal import overlay, the right thumb remained inside the floating surface with bottom clearance rather than touching the rounded corner.
- All 14 Node `.mjs` regressions, all 17 public JavaScript syntax checks and all 8 active V1 page HTTP checks passed. No Provider/API request, Key access or career-data mutation occurred.
- Figma export preflight: the official Figma plugin was installed for the requested MCP workflow. Because connector tools are loaded only at the beginning of a task turn, the current turn could not hot-load `generate_figma_design/use_figma`; the exact 15-page public UI inventory and existing target file key are retained in `NEXT_PHASE_HANDOFF.md` for immediate continuation.

### Learning checkpoint

- Product Progress: import overlays now own their scrolling inside the rounded surface, so scroll-end affordance and content safe space agree visually.
- New Transferable Knowledge: setting overflow on `body` does not guarantee a nested scroll container because root overflow can propagate to the viewport; a fixed viewport body plus an explicit child scroller makes scrollbar geometry controllable.
- User-owned Capability Evidence: the user identified the scrollbar as a boundary/clipping defect rather than a missing content-padding defect and requested an editable design handoff.
- Tool-assisted Implementation: scroll ownership correction, scrollbar styling, cache versioning, browser measurement and regression coverage were implemented by Codex; the later MCP import milestone below supersedes the earlier pending note.
- Remaining Capability Gaps: the user still needs to review and adjust the imported editable Figma frames; no independent user-authored implementation evidence was added.

## Local-only detail UI + Figma MCP handoff（2026-08-28）

- Candidate Detail and Job Detail no longer render scoped AI conversation panes. Both reuse the existing local fixture/IndexedDB read path and present one structured information pane; Candidate direct edit remains available.
- The shared floating overlay iframe is now labelled `本地资料详情`. Personal/JD import overlays keep their existing local file/paste, processing and completion flow without a conversation UI.
- A new-account Figma file was populated directly through Figma MCP with 20 named editable frames: 14 public routes plus Runtime dropdown, Add New Model, Personal import/detail overlay and JD import/detail overlay states.
- Figma file: <https://www.figma.com/design/3XdQUI6Dd1BhGCZVhFOncF/Job-Radar-Web-first-V1-%E2%80%94-UI-Screens>. No paid plugin continuation, account upgrade, Provider request, API Key, browser secret or personal source file was used.
- Final verification: 14 Node regressions, 17 public JavaScript syntax checks, 14 HTTP page checks and zero remaining Figma capture scripts passed. Browser inspection measured `conversation=0`, `structured=1` for Job detail and `conversation=0`, `filePicker=1` for Personal import.

### Learning checkpoint

- Product Progress: editable design handoff is complete and the local information flow is visually simpler; AI conversation is no longer presented inside the local import/detail surface.
- New Transferable Knowledge: MCP can write rendered local web pages into editable Figma layers, but exact browser rendering still requires a temporary capture bridge; that bridge should be removed and CSP restored after export.
- User-owned Capability Evidence: the user rejected the paid plugin path, required direct MCP use, and explicitly simplified the local import boundary by removing AI conversation.
- Tool-assisted Implementation: UI removal, regression updates, MCP capture, frame cleanup/naming, screenshot comparison and capture-script cleanup were performed by Codex.
- Remaining Capability Gaps: Figma visual edits and any design decisions derived from them still require user review before code synchronization.
## Ariadne UI consistency + duplicate-aware local intake（2026-08-31）

- Product/UI: user-facing `Job Radar` branding is now `Ariadne`; Workspace and the V1 pages share the neutral `#f7f7f9` canvas. Recursive is the Latin display/body preference, Inter is the CJK preference, and IBM Plex Serif Regular remains the final named fallback. Soft rectangular surfaces use a 20px radius; browsers that support CSS `corner-shape` receive the squircle approximation, while the editable Figma surfaces use corner smoothing `0.6` exactly.
- Layout: Personal and JD card grids stretch every card to the same row height and retain one 18px row/column gap. Workspace folders are 10% smaller, centered as a pair and retain the existing hover/open/close motion. Existing drag/resize, card-to-floating-surface, minibar and press animations were not removed.
- Local duplicate contract: Candidate and JD imports now normalize text, score possible duplicate records, and pause before persistence. Local mode offers `融合重复内容 / 保留为新卡片 / 取消导入`; deterministic fusion preserves the existing object ID, unions sources/list fields, increments the item version and records merge metadata. The JD form also accepts an optional provenance URL without attempting to fetch it.
- Model-assisted boundary: if a model runtime is selected and the user chooses model fusion, the UI stops before write and explains that a real Provider call requires explicit approval. This milestone made no Provider request and did not transmit career material. Local import, local fusion, static AI-view rendering and the deterministic scoped-conversation response were verified.
- Figma: the editable file page is now `Ariadne — UI Screens` and retains only the seven requested frames: Workspace, Personal import/local/AI, and JD import/local/AI. The frames use the new brand, typography, 20px/60% surfaces, centered Workspace geometry, optional JD URL field, and black AI / white user message ownership.
- Verification: all Node `.mjs` regressions and all Python regression scripts passed. Browser acceptance created and then fused a sanitized duplicate JD into one card, measured exact 18px card gaps/equal row heights, verified 20px squircle surfaces, checked black AI/white user messages, and ended with zero console errors. The original Qwen runtime selection was restored after the local-only test.

### Learning checkpoint

- Product Progress: Ariadne now has one consistent visual grammar and a Human-in-the-loop duplicate decision before local persistence.
- New Transferable Knowledge: duplicate detection and duplicate resolution are different stages; deterministic local fusion can be implemented and tested without granting an LLM authority over stored truth. Figma corner smoothing is an exact design property, while the closest current web expression is a progressive CSS enhancement.
- User-owned Capability Evidence: the user supplied the spacing, typography, interaction, merge-policy and design-handoff acceptance criteria and identified the need to distinguish local fusion from model-assisted fusion.
- Tool-assisted Implementation: normalization/scoring/merge helpers, modal state, visual-token reconciliation, Figma construction, browser measurement and regression execution were implemented by Codex.
- Remaining Capability Gaps: a real Qwen fusion/ingestion request remains deliberately unexecuted pending explicit approval; user review of the updated editable Figma frames is still required. No independent user-authored implementation evidence was added in this milestone.

## Ariadne material-routed intake + compact Workspace refinement（2026-09-01）

- UI contract: V1 cache contract is now `v1-motion-32`. Personal/JD import use the entire dashed surface as one click/drop target; visible “选择文件” and supported-format copy were removed, while the hidden file input still accepts PDF/PNG/JPG/JPEG/DOCX. Upload copy opacity is 90%.
- JD intake: PDF and image are consolidated into one user-facing `图像` mode with a single five-format accept/validation contract; `粘贴文本` remains the second mode and the optional provenance URL remains unchanged.
- Candidate AI boundary: `src/candidate_context.py` now routes Resume / Portfolio / Project / Other to four distinct grounded prompt profiles. Unknown material types fail closed. The browser import metadata records the chosen prompt-profile ID, but this milestone does not connect or execute a Provider request.
- Workspace/navigation: Ariadne is mathematically centered. Folder geometry is 85% of the previous footprint (`901px` pair width, `27px` gap, `252px` height), positioned at 54vh center; the tab/body seam overlaps by 2px to avoid a missing corner. The top-right minibar is approximately 10% larger. All V1 return arrows share one 24px rounded SVG-mask path.
- Card copy: stored Candidate/JD cards no longer show “打开材料 / 打开职位上下文”. Personal/JD guide cards removed the category-format subtitle and cross-fade from the requested default sentence to “文件仅在当前浏览器中处理” on hover/focus.
- Verification: 14/14 Node regressions passed; 7/8 unrelated Python regression scripts passed, with the pre-existing `career_entity_regression.py::test_real_portfolio` assertion still failing outside this UI/prompt scope. The targeted material-prompt suite passed 5/5. All 17 public JavaScript files passed syntax checks and seven active V1 pages returned HTTP 200. Browser acceptance measured exact Workspace centering and 85% folder geometry, 53×57 minibar, a 230px full hit-area dropzone, 0.9 upload-copy opacity, two JD modes, six identical arrow masks, reversible JD import overlay, and no stale open labels. No Provider/API/Key/cost action occurred.

### Learning checkpoint

- Product Progress: one file surface now supports all required local document formats, while semantic material type and input transport remain separate decisions.
- New Transferable Knowledge: MIME/extension acceptance, prompt routing, and persistence authority are three distinct boundaries; changing one must not silently broaden the others.
- User-owned Capability Evidence: the user supplied the exact copy, geometry, format consolidation, prompt-routing and visual-alignment acceptance criteria.
- Tool-assisted Implementation: DOM/CSS refinement, prompt routing, validation, regression updates, browser geometry checks and documentation were implemented by Codex.
- Remaining Capability Gaps: real Provider ingestion and model-assisted merge still require a separate explicit authorization and bounded content/cost decision; the historical Portfolio fixture assertion remains outside this milestone.

## Figma vector folders + runtime-scoped detail controls（2026-09-01）

- Figma authority: Workspace node `9:2` in file `3XdQUI6Dd1BhGCZVhFOncF` was re-read through Figma MCP. Its Personal/JD folder back is one continuous vector rather than a rectangle plus a separately stitched tab. The exact Figma path is now committed as `public/assets/figma-folder-back.svg` and used as the shared CSS mask, removing the residual notch/gap without changing the established three-paper hover motion.
- Detail-mode contract: the current Runtime selection, rather than record provenance alone, controls the editing surface. Local Runtime shows a top-right `编辑` action and hides the AI pane; opening it scrolls and focuses the existing summary/facts form so the interaction is immediately visible. A selected model keeps the scoped conversation on the right and hides direct local editing.
- Human-in-the-loop boundary: Candidate and JD model conversations can produce reviewable before/after patches. Accept/reject remains explicit; no model output silently overwrites the stored object. The browser QA route used deterministic preview logic only and made no Provider request.
- Icon grammar: back, add and close use a common 24px rounded glyph inside a 36px interactive target where applicable. Duplicate text/pseudo crosses were removed from Add Model and detail overlays.
- Cache contracts: Runtime is `runtime-ui-v48`; V1 is `v1-motion-33`.
- Verification: 14/14 Node `.mjs` regressions, all public JavaScript syntax checks, 5/5 Candidate prompt regressions and 9/9 active pages/assets HTTP checks passed. Real-browser checks covered the seamless Figma folder, Local edit focus/scroll, model-side Candidate/JD patch proposals and single-glyph close icons. No Provider/API/Key/cost action occurred.

### Learning checkpoint

- Product Progress: one selected Runtime now leads to one predictable detail-editing mode, and the Workspace folder geometry matches the editable design source.
- New Transferable Knowledge: record provenance and active interaction mode are separate state dimensions; the former explains how evidence was created, while the latter determines which editing tool the user is currently using.
- User-owned Capability Evidence: the user identified the unreachable edit affordance, required Local/model behavior to diverge, and supplied the Figma folder geometry as the visual acceptance authority.
- Tool-assisted Implementation: Figma path extraction, SVG-mask integration, runtime-mode branching, reviewable JD patch flow, icon normalization and browser/regression verification were implemented by Codex.
- Remaining Capability Gaps: a real model-backed edit/ingestion request still requires explicit provider/model/content/cost authorization and remains unexecuted.

## J1 final acceptance stabilization（2026-09-04，Human acceptance pending）

- Product/runtime authority: Job import no longer exposes a per-import Local/AI selector. The current Ariadne Runtime now selects the Local or Model path; model failure does not invoke a hidden Local semantic fallback.
- Review lifecycle: Candidate-proven import lifecycle states are shared through `model-import-lifecycle-domain.js`. Job Model import moves through source, processing, proposal, review, ready-to-save and saved states; unresolved work is visible and actionable instead of leaving the page on an indefinite “等待审核完成”.
- Shared presentation: Candidate and Job conversations now use the same message-thread and composer primitives. Real-browser computed style inspection matched message width, radius, padding, ownership colors, composer height, field geometry and send-button geometry.
- Job-scope semantics: short prompts in an active Job Detail resolve to current Candidate × active Job and emit a deterministic safe `turn_scope`; capability, evidence, presentation and relevance gaps remain distinct, and missing evidence is not treated as missing capability.
- Real-browser evidence completed: Model Job import, Local Job import, review/save, immutable Job Revision creation, Candidate Model processing preservation, Candidate/Job conversation UI parity and forced `MODEL_FAILED` with no fake proposal or Local fallback. Local import made zero Provider calls; the successful Model import made one expected DeepSeek call and skipped Local semantic structuring.
- Automated evidence: 34/34 Node `.mjs` suites, 20/20 Python `*_regression.py` suites, 40/40 public JavaScript syntax checks and seven final-backend HTTP checks passed.
- Fresh real-Candidate turn: after explicit action-time confirmation, the active Job received “我还需要补充什么能力？”. DeepSeek returned one relevant Candidate × Job gap analysis without a Candidate-vs-Job clarification. Backend safe diagnostics recorded `candidate_snapshot_present=true`, `confirmed_count=27`, `working_count=29`, `project_count=11`, `evidence_count=54`; the request returned HTTP 200 and the analysis was appended without mutating Candidate truth.
- CandidateDelta continuity: the same real Job history preserves the earlier Candidate project change turn and its bounded relevance/non-proof analysis; the new turn recompiled the current Candidate snapshot. Historical Job analysis remained unchanged and visible.
- Acceptance boundary: no READY claim has been made. Mandatory implementation, automated and browser evidence are complete; final Human acceptance of the product path is still required before any staging or commit.

### Learning checkpoint

- Product Progress: runtime selection, import authority, human review and shared conversation presentation now form one consistent J1 path.
- New Transferable reminders: source preparation is not semantic structuring; a visible review state must have an actionable transition; shared UI is proven through shared ownership and computed behavior, not similar CSS values.
- User-owned Capability Evidence: the user rejected the earlier READY report based on real UI failures and specified the product/runtime, review and Job-scope acceptance contracts.
- Tool-assisted Implementation: lifecycle extraction, runtime-driven branching, shared UI promotion, deterministic referent scope, failure isolation, regressions and browser smoke were performed by Codex.
- Remaining Capability Gaps: final Human acceptance remains open; no staging or commit is authorized.

## J1 final product convergence（2026-09-04，Human acceptance still pending）

- Product flow correction: Model Job import no longer opens the Local field-by-field review surface. Its visible lifecycle is now `Source → durable source → provider-safe preparation → DeepSeek → NON_AUTHORITATIVE WORKING JOB → Job workspace/conversation → Human Workspace Save → immutable confirmed Job Revision`. Local import retains its Proposal/Review/Save path.
- Shared product infrastructure: Candidate and Job processing both call `AriadneModelWorkspaceUI.renderProgress()` and `setProcessingState()`. Candidate, Working Job and confirmed Job conversations all use `AriadneConversationUI.renderMessages()`, the same user/assistant bubble classes and the same composer classes.
- Conversation correction: each Provider request now carries bounded prior Human/Assistant messages as actual chat turns and the latest Human message last. Failed orphan Human attempts remain in the local audit record but are excluded from both the visible connected thread and later Provider history. The Provider is instructed to answer that latest request, resolve follow-up referents, advance instead of repeat, use plain text, and state that realtime Web Search is unavailable rather than inventing repositories or URLs. The exact Provider `output.message` is the Human-visible Assistant copy.
- Browser proof completed so far: a synthetic realistic Job source was durably stored and sent once to `DeepSeek / deepseek-v4-pro`; the page opened the Working Job workspace with the model/runtime indicator, no Local Review UI, then Human Workspace Save created and opened the confirmed Job detail. Backend recorded exactly one Job import Provider call.
- Real conversation proof: all ten explicitly authorized Job-conversation calls were used. Five completed connected turns over the current Candidate × confirmed Job: requirement summary, strongest-evidence comparison, two concrete project-strengthening actions, one-action prioritization with minimum completion criteria, and a three-step plan plus Web-capability boundary. The final answer stated that this Runtime has no Web Search and returned no fabricated repository or URL. Five attempts failed closed and wrote no Assistant copy: one semantic-schema 422, three JSON-mode `EMPTY_RESPONSE` results, and one text-mode `MALFORMED_RESPONSE`.
- Provider-response stabilization: DeepSeek JSON mode was replaced for this contract by one forced strict function call. The last three authorized calls then succeeded 3/3. The plain-text rule prevents future Markdown delimiters; one earlier successful Provider response still contains literal `**` and remains unchanged because Provider copy is append-only evidence.
- Automated proof: all 34 Node `.mjs` suites, all 20 Python `*_regression.py` suites, 41 public JavaScript syntax checks, Python compilation and seven live HTTP checks passed.
- Acceptance boundary: implementation, automated checks, synthetic Model import, five connected real-Candidate turns and Web-unavailable behavior are complete. Human acceptance is still failed/pending; this section does not claim READY. No additional Provider-call authorization remains, and no staging or commit was performed.

### Learning checkpoint

- Product Progress: Model import now hands off to an editable conversational Working object, while Local review remains a separate deterministic product path.
- New Transferable Knowledge: an internal proposal record may support provenance and atomic save without forcing the product to expose a proposal-review queue; Provider-authored conversational copy and system-owned mutation authority are independent contracts.
- User-owned Capability Evidence: the user identified that the technically functioning Model import still violated the accepted product interaction and required exact Candidate-flow reuse plus natural connected conversation.
- Tool-assisted Implementation: working-object lifecycle, shared processing symbols, Provider history/prompt contract, safe diagnostics, regressions and synthetic browser smoke were implemented by Codex.
- Remaining Capability Gaps: only final Human acceptance remains open; no staging or commit is authorized.

## J1 shared product shell convergence（2026-09-04，READY FOR J1 HUMAN ACCEPTANCE）

- Architecture convergence: Candidate and Job now depend on one neutral `AriadneProductShell` for import binding, workspace binding/show/hide, detail binding/runtime application, conversation binding, and edit-panel control. Candidate-owned generic workspace class names were replaced by neutral `v1-workspace-*` shell classes; Candidate keeps its accepted appearance while Candidate/Job schemas, renderers and semantic actions remain domain-specific.
- Exact UI ownership: both detail pages use the same `v1-detail-shell → v1-split-view → structured/conversation panes` contract, the same `AriadneConversationUI.renderMessages()` renderer, the same Human/Assistant bubble classes, and the same composer/input/send selectors. Job's separate detail-composer structure was removed. Both import workspaces bind through the same `ProductShell.bindWorkspaceShell()` and `ProductShell.showWorkspace()` symbols.
- Browser correction: the first real reload exposed `product_conversation_messages_missing` because the workspace message nodes had not declared the shared renderer class. Candidate and Job markup were corrected together to `v1-workspace-conversation v1-conversation-messages v1-conversation-thread`, and both a shell regression and the earlier UI-framework regression now enforce that exact contract.
- Real browser proof: Candidate and Job card-library entry, floating detail shell, content/conversation split, fixed composer, and shared edit-controller activation passed with empty console error logs. Local Job completed `paste → deterministic extraction → Human field correction → confirmation → immutable Job card`, and recorded only `POST /api/local-job-extract`. The fresh Model path completed `paste → DeepSeek → NON_AUTHORITATIVE WORKING JOB → Human Workspace Save → immutable Job Revision` on the same shared shell and never exposed the Local review queue.
- Connected Job reasoning: the saved Job then completed the required five-turn current Candidate × active Job sequence. The Provider compared existing evidence, selected the highest-priority existing project, proposed concrete evidence-strengthening work, supplied a resume-only alternative, and prioritized the actions without treating AI-assisted implementation as independent engineering capability. Two intermediate contract failures returned HTTP 422, produced no Assistant copy, and were excluded from visible and future connected history.
- CandidateDelta acceptance: two source-backed blank project-summary fields were filled without inventing facts; each used the Local preview/confirm path and retained its previous version. A first technically valid but semantically imprecise delta answer remains append-only evidence. The payload was then corrected to carry Provider-safe exact previous/current records and changed fields. A fresh delta turn correctly identified the blank-to-summary change, stated that no function/runtime evidence was added, kept the priority unchanged, and left every earlier Assistant message byte-for-visible-text unchanged.
- Targeted contract fixes: non-mutating EXPLAIN/ASK_CLARIFICATION action labels are canonically derived from the actual clarification payload; project/resume advice cannot trigger a Job edit unless the Human explicitly requests a Job-field mutation; CandidateDelta now binds the Provider to the exact changed record and field while excluding canonical identities, hashes and filesystem paths. Explicit Job edits remain strict and all mismatch paths still fail closed.
- Provider accounting: this final acceptance used 10 actual DeepSeek requests—1 successful Model import, 5 required successful Job turns, 2 fail-closed conversation attempts, 1 append-only but semantically imprecise CandidateDelta answer, and 1 final precise CandidateDelta success. Local import and both Candidate edits used zero Provider calls.
- Automated evidence: 35/35 Node `.mjs` suites, 20/20 Python `*_regression.py` suites, 42/42 public JavaScript syntax checks, Python compilation, and `git diff --check` passed. Staged files remain zero; no reset, stash, checkout, add, or commit was performed.
- Acceptance boundary: `J1 HUMAN ACCEPTANCE: PASS`. Functional scope is frozen; this record is ready for the authorized final J1 closeout commit. No J2 scope is started here.

### Learning checkpoint

- Product Progress: Candidate and Job are now two domain adapters inside one actual product shell instead of parallel presentation implementations.
- New Transferable Knowledge: shared UI is an executable contract—symbol identity, DOM roles and state transitions—not a visual resemblance. Real browser initialization is necessary even when static regressions pass, because a shared binder can expose missing runtime DOM invariants.
- User-owned Capability Evidence: the user defined the product-shell/domain-adapter boundary and required Candidate to remain the accepted reference.
- Tool-assisted Implementation: symbol mapping, neutral shell extraction, duplicate removal, regression adaptation, browser interaction and Local vertical acceptance were performed by Codex.
- Remaining Capability Gaps: J1 has no remaining acceptance gate. The implementation and evidence are Tool-assisted and do not by themselves constitute user-owned independent engineering capability.

## J1 final closeout（2026-09-04，Human Acceptance PASS）

- Scope and privacy audit: no credentials, raw Provider reasoning, Human-visible local filesystem paths, persistent internal IDs, destructive migration, hidden Local fallback, Local Provider call, Web Search implementation, or runtime/provider switch was included in the J1 diff. Candidate evidence in this project status is represented only as a redacted field-level change description.
- Functional scope is frozen after acceptance. Deferred work remains outside J1: Candidate Learning / CandidateUpdateProposal execution, Job clarification-to-Candidate learning, grounded resume optimization execution, project optimization-to-evidence updates, live Web/GitHub research, automatic application, and match percentage/scoring.
## Ariadne global interaction convergence（2026-09-04，READY FOR J1 HUMAN ACCEPTANCE）

- Shared interaction ownership: Candidate and Job now call the same `AriadneSourceInput`, `AriadneProcessingIndicator`, `AriadneConversationUI`, `AriadneProductShell` and `AriadneModelWorkspaceUI` primitives for common input, waiting, Working, detail, edit and conversation behavior. Schema, semantic structuring, actions and persistence authority remain domain-specific.
- Source bundle: both domains accept ordered multi-image accumulation through click, drag/drop or guarded clipboard paste. Normal text paste in text inputs remains native. Model Job sends the bounded bundle once and retains every durable source ID; Local paths remain deterministic with Provider=0.
- Semantic correction: the Model Job prompt now identifies the actual job-content region across the bundle and excludes navigation/header/footer/legal/privacy/copyright/site-service/recruiting CTA chrome from title, company, location, summary, responsibility and requirement fields. Missing or uncertain fields remain unknown rather than being invented.
- Real-browser proof: a three-image DeepSeek Job import produced one Working Job directly, with sane grounded fields and ordered recoverable provenance; Candidate and Job clipboard intake, text-paste non-hijacking, shared Edit lifecycle, exact conversation symbols, live waiting animation, Candidate × Job reasoning and fail-closed Provider behavior all passed.
- Automated proof: all 57 executable Candidate/Job Node/Python regression suites and final JavaScript syntax checks passed; `git diff --check` passed. No tests were removed.
- Acceptance boundary: `READY FOR J1 HUMAN ACCEPTANCE — GLOBAL INTERACTION CONVERGED`. Human acceptance remains pending. No staging or commit was performed.

### Learning checkpoint

- Product Progress: Candidate and Job now behave as two domain adapters inside one interaction system, including source acquisition and perceptible async waiting rather than only a shared visual shell.
- New Transferable Knowledge: source transport, semantic understanding and persistence authority are independent boundaries; UI reuse is proven by common callable symbols and state transitions, while model grounding must explicitly separate content regions from page chrome.
- User-owned Capability Evidence: the user defined the convergence contract, page-chrome failure class, clipboard safety rule and real-browser readiness gates.
- Tool-assisted Implementation: shared primitive extraction, Job bundle/model grounding, UI integration, real-browser execution, regressions and evidence documentation were performed by Codex.
- Remaining Capability Gaps: final Human acceptance is still required; the implementation does not constitute independent user-authored engineering evidence.

## Ariadne Candidate ↔ Job parity repair（2026-09-04，Human acceptance pending）

- Product Progress: Candidate Material Detail now routes item-focused natural-language edits through the Candidate Provider contract and projects the resulting NON_AUTHORITATIVE Working into the existing review/save region. The required role-wording replacement produced a Candidate-only title diff while confirmed facts remained unchanged until Human Save; ordinary questions remain discussion turns.
- Shared edit contract: Candidate and Job Detail now bind the same ProductShell edit-shell roles, field geometry, action region, Cancel, preview, apply/back and existing destructive-action pattern. Job canonical deletion remains unavailable because the current domain does not support it; no new deletion semantics were introduced.
- Source preview: Candidate and Job import surfaces now show one ordered source list only. Single- and multi-image browser checks preserved bundle order, durable original bodies, provenance, hash validation and Source Retrieval.
- Failure boundary: Candidate conversation transport now uses a Candidate-specific forced tool contract. It does not use the Job schema, Local semantic structuring, or a Local fallback; Provider failure remains visible and fail closed.
- Verification: all `38` Node regression files, `20` Python regression files, `44` public JavaScript syntax checks, Python compilation and real-browser Candidate/Job checks passed. Final browser console errors were zero; the global runtime was restored to Model.

### Learning checkpoint

- New Transferable Knowledge: a shared visual shell is only stable when both domains bind the same semantic roles and acceptance authority; matching CSS alone does not prevent divergent behavior.
- User-owned Capability Evidence: the user identified the exact Candidate edit, Job edit-shell and duplicate source-preview failures and specified the Human Save and provenance boundaries.
- Tool-assisted Implementation: Provider contract repair, shared-shell extraction, UI integration, automated regressions and browser execution were performed by Codex.
- Remaining Capability Gaps: Human J1 acceptance is still required. No J2 work, staging or commit is authorized.

## Ariadne final product-contract addendum（2026-09-04，READY FOR J1 HUMAN ACCEPTANCE）

- Runtime-driven import: Candidate and Job now dispatch through one `ProductShell.dispatchRuntimeImport()` contract. There is no import-level Local/AI selector. Local invokes only Local; Model invokes only Model; unavailable domain capability or Model failure fails closed and never invokes Local.
- Model isolation: Candidate and Job Model slices were re-audited and regression-locked against Local semantic structuring, Local proposal generation and Local review rendering. Source decoding/OCR/read/hash/bounded preparation remains technical Source Preparation only.
- Provenance correction: Job pasted text now joins `selectedJobSources`, so paste, click, drop and clipboard sources all reach the shared durable source-bundle gate. Both Model consent paths call `SourceInput.persistDurableBundle()` before consent/Provider, validate identity/hash, and preserve original bodies for Source Retrieval.
- Micro-interactions: common source, button, input, Working transition, message, edit, save and failure feedback use shared Ariadne symbols. Motion is subtle; reduced-motion disables new entry/orb/pulse animation and collapses transitions.
- Browser proof: Local Candidate/Job actions were selected automatically with zero per-import selectors; Candidate vision Runtime selected the Model action; Job Model pasted text reached source-first consent as one shared source. Consent was cancelled, so no new Provider call occurred. Shared input focus and loaded hover/pressed/message/reduced-motion rules were verified.
- Verification: `36 Node + 21 Python = 57` suites, 44 public JS syntax checks and `git diff --check` passed; staged files remain zero.

### Learning checkpoint

- Product Progress: runtime authority and durable-source authority are now executable shared gates, including pasted text, rather than conventions duplicated in two event handlers.
- New Transferable Knowledge: capability gating is distinct from fallback—a Model Runtime may fail closed before execution when its domain adapter is unverified, but it must never reroute the same intent through Local semantics.
- User-owned Capability Evidence: the user specified runtime ownership, semantic-boundary and source-first invariants plus the micro-interaction acceptance surface.
- Tool-assisted Implementation: shared dispatch/persistence helpers, pasted-text correction, motion/focus feedback, browser QA, regressions and documentation were performed by Codex.
- Remaining Capability Gaps: final Human acceptance remains pending; no J2 work is authorized.

## Ariadne UI contract correction（2026-09-04，READY FOR J1 HUMAN ACCEPTANCE）

- Product Progress: Add Job now uses `使用人工智能解析`, hides the two verbose inline provenance explanations while retaining durable source metadata, and uses the shared light `确认并发送` action.
- Shared interaction refinement: `AriadneProcessingIndicator.setButton()` applies the same restrained blue loop to import, conversation and submit waiting. `AriadneProductShell.CONTRACT.conversation.field` requires the same `v1-composer-field` wrapper in all four Candidate/Job workspace/detail composers; their field/input/button geometry is `46 / 44 / 42 px` with exact vertical centering and a contained focus ring.
- Layout/motion: shared back/close controls use scale-only hover and milder press without lateral translation. The shared minibar is horizontally centered, leaving the top-right zone unoccupied for a future settings control. Reduced-motion removes the continuous loop and shortens shared transitions.
- Browser evidence: desktop and 390 px mobile Job import, light consent action, Model import WORKING state, Job conversation WAITING state, Candidate/Job focused composer geometry, stable busy submit layout, scale-only back hover and centered minibar all passed. Final Add Job console errors were zero.
- Failure evidence: the synthetic Model Job import returned a Provider payload that failed the existing schema and surfaced `MODEL_FAILED`; no Local fallback ran. The synthetic conversation waiting capture was cancelled by reload before Provider transmission.
- Verification: `37 Node + 21 Python = 58` suites, 44 public JS syntax checks and `git diff --check` passed; staged files remain zero. No add/commit/reset/stash was performed.

### Learning checkpoint

- Product Progress: shared async feedback and composer geometry are now structural ProductShell contracts rather than page-level visual approximations.
- New Transferable Knowledge: a loading state needs both semantic state (`aria-busy`, duplicate-submit prevention) and perceptible, layout-stable feedback; shared CSS alone is insufficient if pages do not share the required DOM wrapper and state setter.
- User-owned Capability Evidence: the user identified the recurring oversized composer, frozen-looking submit state, ornamental loader, misplaced minibar and ambiguous Job action copy as concrete product-contract failures.
- Tool-assisted Implementation: shared primitive refinement, regression coverage, desktop/mobile browser measurement and evidence updates were performed by Codex.
- Remaining Capability Gaps: Human visual/interaction acceptance is pending; the synthetic Provider schema failure is a separate model-output quality observation, not evidence of a Local fallback.

## Ariadne Detail behavioral wiring stabilization（2026-09-04，READY FOR J1 HUMAN ACCEPTANCE）

- The earlier READY claim was revoked after Human observation exposed real Detail failures. The first broken owners were Candidate `UI_BINDING`, Job post-Provider `RESULT_PROJECTION` validation, and the shared Edit controller's entry/focus behavior.
- Shared wiring: `AriadneProductShell.bindConversationAdapter()` now owns the single composer submit primitive and calls explicit Candidate/Job domain adapters with the current target and runtime capability. `createDetailEditController()` owns Edit/Cancel/Preview/Back and scrolls/focuses the first field consistently on both detail pages.
- Candidate proof: the required role-wording replacement produced Provider `PATCH_ITEM`, created a NON_AUTHORITATIVE Working proposal, and left confirmed data unchanged. Human Save then confirmed the requested field-level change and retained the previous version.
- Job proof: `这个职位最重要的三个要求是什么？` returned a Provider `EXPLAIN`; `按照我现在的个人资料，我最缺什么？` returned a grounded Provider answer using the current confirmed Job, CandidateContext and prior conversation. Neither turn created Working or mutated confirmed data.
- Safe execution evidence records only submit/domain/operation/provider/model/result/Working/pre-save mutation fields. Candidate logged Provider=true, `deepseek-v4-pro`, `PATCH_ITEM`, Working=yes, pre-save mutation=no. Job logged Provider=true for both turns and remained fail-closed; no private source bodies, internal IDs or chain-of-thought were logged.
- Edit parity was exercised end-to-end on Candidate and Job: enter, first-field focus, preview, back-to-edit, cancel, and shared action geometry. Final browser checks found zero error states and no persistent ID leakage.
- Verification: `39/39` Node regression suites, `20/20` Python regression suites, `44/44` public JavaScript syntax checks and Python compilation passed. Human J1 acceptance remains pending; no J2 work, staging or commit was performed.

### Learning checkpoint

- Product Progress: Detail conversation and Edit behavior now have shared executable owners plus explicit domain adapters.
- New Transferable Knowledge: a visible control can still be unwired when capability is resolved after initialization; availability must be evaluated at submit time, while the binding itself remains stable.
- User-owned Capability Evidence: the user identified the exact Candidate and Job behavioral failures, required observation-first proof, and explicitly authorized the two real Job Provider turns.
- Tool-assisted Implementation: fault tracing, shared binding/controller repair, semantic-validation normalization, regressions, Provider execution and browser verification were performed by Codex.
- Remaining Capability Gaps: final Human J1 acceptance is still required; implementation work is not independent user-authored engineering evidence.

## Ariadne Computer-use-first E2E acceptance gate（2026-09-05）

- Final status: real in-app browser A–E passed after the last runtime/UI fix. Native Computer Use was attempted first but the host safety layer disallowed controlling the Codex app, so the same visible Candidate/Job flows were completed through Browser Control in the existing in-app browser.
- Candidate discussion stayed non-mutating. The explicit role-wording replacement produced Provider `PATCH_ITEM`, visible NON_AUTHORITATIVE Working, no pre-Save confirmed mutation, Human Save, and a reopened confirmed revision with no internal ID in the UI.
- Job discussion returned two real Candidate-grounded DeepSeek answers without Working or mutation. The explicit summary deletion produced `PROPOSE_JOB_EDIT`, visible Working, no pre-Save mutation, Human Save, and a reopened immutable revision.
- Candidate/Job Edit share enter/focus/preview/back/cancel behavior. Direct Save was exercised on both. Candidate workspace-v2 direct edits now persist through a new Working + Workspace Acceptance + confirmed revision, keeping subsequent Candidate conversation context synchronized; obsolete Working UI is cleared after Save. Candidate delete remains available; Job delete remains absent because its canonical delete contract is not implemented.
- Final verification: `40/40` Node suites, `20/20` Python suites, `44/44` public JavaScript syntax checks and Python compilation passed. The final post-fix A–E run produced zero new browser console errors, no Model→Local fallback and zero Local Provider calls. No staging or commit was performed.

### Learning checkpoint

- Product Progress: the final Candidate/Job interaction and persistence gates are now verified through visible Human actions rather than inferred from code or synthetic tests.
- New Transferable Knowledge: a successful confirmed write is incomplete if its non-authoritative working projection remains stale; revision lineage, Working lineage, acceptance artifacts and rendered state must converge together.
- User-owned Capability Evidence: the user defined the acceptance prompts, Save boundary, no-fallback rule, provenance/privacy constraints and the requirement to restart A–E after every code fix.
- Tool-assisted Implementation: fault tracing, minimal fixes, real Provider calls, browser execution and regression verification were performed by Codex.
- Remaining Capability Gaps: Human product acceptance remains the next decision; this implementation does not count as independent user-authored engineering evidence.
## J1 Candidate Material integrity checkpoint（2026-09-05，COMPLETE）

- Candidate Material Detail: real DeepSeek discussion and semantic mutation passed for Work Experience, Project, and Education. Work Experience additionally passed direct Edit, preview, Human Save, reload/reopen, and subsequent-conversation current-state checks. Confirmed state remained unchanged before Save; Provider output remained NON_AUTHORITATIVE Working.
- Candidate Material coverage: deterministic/runtime regressions exercise every currently supported type: `work_experience`, `project`, `education`, `skill_group`, `language`, `award`, and `custom_section`.
- Item/context integrity: context compiler v2 limits item history to the active Candidate Material and its current Working/version/fingerprint lineage. Stale turn-local aliases cannot retarget another item.
- Human Copy boundary: Provider-facing structured references remain available for grounding, while server normalization, client projection, and render-time sanitation prevent Candidate/Job internal IDs or aliases from appearing in visible messages, including legacy persisted history.
- Job regression: the frozen Job Detail completed one real CandidateContext-grounded DeepSeek smoke turn with no Working and no confirmed mutation.
- Runtime/source isolation: Local Candidate and Local Job Provider calls remain exactly zero; Model failure is `MODEL_FAILED` and never falls back to Local. Model imports persist the original ordered source/source bundle before Provider execution and retain bodies for Source Retrieval.
- Final verification: `40/40` Node regression suites, `21/21` executable Python regression suites, `84/84` JavaScript syntax checks, Python compilation, `10/10` HTTP checks, browser console checks, visible-copy ID checks, and `git diff --check` passed. The Python stub server was correctly excluded because it is a non-terminating test fixture, not an executable suite.
- Scope: J1 only. J2, Web Search, automatic application, and general polish remain deferred.

### Learning checkpoint

- Product Progress: Candidate Material current-state integrity, shared interaction behavior, source-first provenance, and Candidate/Job Human Copy boundaries are now closed as one J1 foundation.
- New Transferable Knowledge: semantic authority, durable source authority, current-item context, and visible Human Copy are separate contracts and need independent fail-closed validation.
- User-owned Capability Evidence: the user defined the runtime, provenance, Human Save, Candidate Material parity, and real-provider acceptance gates and authorized repeated DeepSeek execution through completion.
- Tool-assisted Implementation: runtime repairs, real Provider/browser execution, systematic coverage, privacy/scope audit, and regression verification were performed by Codex.
- Remaining Capability Gaps: deferred J2 capabilities remain unimplemented by design.
