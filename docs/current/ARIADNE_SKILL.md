# Ariadne Skill：安装与使用

当前产品分为网页版（自己的 API、浏览器资料库）和 Skill（本机 Codex、本地文件库）。两者共用业务页面，不自动同步资料，也不进行网页配对。

## 首次安装

1. 当前新版请使用[2026-10-03 完整 GitHub Release](https://github.com/orocoa/Ariadne/releases/tag/skill-20261003-card-return)，下载完整 ZIP 和校验文件，并按下方版本信息交给 Codex 核验与安装。[官网的本地 Agent 窗口](https://ariadne.kai-nex.com/#skill)暂时仍提供 9 月 28 日旧版的固定安装指令。
2. 将指令粘贴到 Codex 对话中并发送，等待包校验、安装和依赖检查完成。已有同名 Skill 先备份，资料目录不删除。
3. 安装完成后，在 Codex 中发送 `$ariadne 打开 Ariadne`。独立窗口直接进入工作空间，不需要模型选择首页。
4. 在窗口添加个人资料或职位材料，再围绕材料提问；发送需确认，结果由用户审阅保存。关闭最后窗口或 ⌘Q 停止本次服务，已保存资料保留。

独立窗口要求 macOS 14+、Python 3.9+ 和 Apple 命令行开发工具；Codex 分析还需兼容 CLI、本人登录和 Poppler。缺依赖时明确提示，不切换到 API 或生成本地替代回答。当前仅 Codex adapter 已验收，其他 Agent 与操作系统不自动视为支持。

2026-09-24 流式升级：首次使用或旧版升级，在安装的 Skill 目录运行 `python3 scripts/ariadne.py login`，由本人完成官方登录。Ariadne 使用独立 `~/Library/Application Support/Ariadne Codex` 目录（其他 POSIX 为 `~/.local/share/Ariadne Codex`），不再继承日常 Codex 的认证/配置/AGENTS.md；不要手动复制认证文件。日常 Codex 和个人资料不受影响。`doctor` 只检查依赖与登录，不代表模型质量认证。

## 2026-10-03 完整 Skill 更新与升级

[本次完整包](https://github.com/orocoa/Ariadne/releases/tag/skill-20261003-card-return)绑定源码 `0994b110afb712927d7b91d0d9758f55237cb899`，共 234 个运行文件、2,907,949 bytes；SHA-256 为 `02392f70a080b40c7529e42887d4bbb8ae12aac8524739126990e7cd6c96b26e`。包含个人/职位卡片收回的尺寸、圆角和阴影衔接修复，以及此前已提交的可靠性优化；模型资格、资料来源及人工保存规则不变。官网与 API 本轮未部署。

先退出 Ariadne，下载该 Release 的完整 ZIP 与 `.sha256`，让 Codex 核对哈希和大小、保留旧 Skill 备份，再更新运行代码。保留原资料目录、工作区绑定与独立 Ariadne Codex 登录，不迁移或删除旧资料。重新打开后运行 `python3 scripts/ariadne.py doctor`；依赖检查不替代真实模型能力验收。

## 2026-09-28 更新与升级

本次完整包同步职位整组变更、Codex 多模型与独立强度选择、六入口每次确认。详见[更新记录](../../CHANGELOG.md)与[职位变更契约](JOB_WORKSPACE_CHANGE_SETS.md)。先退出 Ariadne，再从官网重新复制安装指令；升级前保留旧 Skill 备份，校验具体 GitHub Release ZIP 的大小和 SHA-256，替换完整运行代码，保留原资料目录和工作区绑定。重新打开后执行依赖检查并核对原资料；不把仓库中的 Skill 子目录当完整包。

## 数据和维护

默认地址 `http://127.0.0.1:8766`，资料位于 `~/Library/Application Support/Ariadne Skill/workspaces/<workspace-id>/`。页面的 `ariadne-content-workspace-v1` 映射决定具体工作区；保持既有目录与身份，不按最新目录猜测。Skill 安装目录不保存个人资料，更新运行代码不迁移旧 App 或浏览器的数据。

独立窗口默认 1392×944、最小 1080×720，保持原 1180:800 长宽比并为嵌入详情保留左右双栏。Candidate、Job 与关于我的共用对话会把标题和首次说明作为可滚动历史，消息增多后自然上移；不显示每轮耗时。生成中的详情即使暂时关闭也保留当前 iframe，返回同一卡片继续显示；已完成历史仍按各领域既有持久化恢复。「整理为个人补充」在当前详情浮层内淡出切换，返回按钮回到原对话，个人补充继续遵守 DRAFT/人工保存边界。

对话附件统一由 [共用 Turn Transport](CONVERSATION_TURN_ARCHITECTURE.md) 编排。页面会分别显示能力检查、文件读取校验、本机安全保存、发送并等待模型、完成或失败；DOCX 等附件在等待时出现 spinner 不表示传输失败。完成后生成文件位于对应回复下方，重启时可从已保存 deliverable 在本机重新生成下载链接。附件仍只供本轮使用，不自动成为确认资料。

用户明确要求迁移且已经核实来源工作区身份时，可运行 `python3 scripts/ariadne.py import-workspace --source-root <workspaces-root> --workspace <workspace-id>`。工具锁定源库，校验所有被索引的 Markdown、JSON 和原件 hash，完整复制到 Skill 数据目录并写入 `ariadne-desktop-workspace-binding-v1` 显式绑定；源目录与旧 Skill 工作区保留，不做合并或覆盖，也不复制浏览器 API Key、Cookie 或其他网站数据。重新打开 Skill 并核对实际资料后，才可另行清理对应浏览器 origin。

启动命令为 `python3 scripts/ariadne.py window`，诊断为 `python3 scripts/ariadne.py doctor`；路径相对于实际安装的 Skill。窗口核对使用 `opening_window.application` 返回的完整 App 路径，避免同名旧构建或 QA 缓存被误认成当前 Skill。`open` 仅用于明确选择的浏览器或开发验收，`connect` 已停用。完整包由 `python3 scripts/build_skill_bundle.py` 构建，包含页面、契约、启动器和完整性清单，不包含凭据或用户资料。

使用与运行边界以 [Skill 指令](../../skills/ariadne/SKILL.md) 和 [双端架构](TWO_PRODUCT_ARCHITECTURE.md) 为准。阶段发布与验收结果见 [项目状态](../../PROJECT_STATUS.md)。

## 历史交付记录

以下内容原地保留用于追溯；涉及运行选择页、API、本机网页配对的旧步骤不再适用于当前 Skill。

<details>
<summary>展开此前交付与验收记录</summary>

# Ariadne Skill

2026-09-20 两端架构更新：默认直接进入工作空间，使用本机 Codex，不再提供运行选择首页或网页配对。网页版仅连接 API，Skill 仅连接本地 Agent；具体实现与边界以 [双端架构](TWO_PRODUCT_ARCHITECTURE.md) 和 [Skill 指令](../../skills/ariadne/SKILL.md) 为准。下列记录保留为此前版本的验收历史，涉及运行选择、API 或配对的步骤已被本条取代。

# Ariadne 网页 + Skill

更新：2026-09-20。默认交付方向为网页 + Codex Skill 独立 Mac 窗口。官网入口统一为安装 Skill；另一台电脑与公网 HTTPS 首次本地网络授权仍未覆盖。旧 App 历史构建及源码保留；本机旧 App 已按用户要求移入废纸篓，原资料目录保留，不自动迁移到 Skill。

## 本机 Codex 闭环与当前范围（2026-09-20）

当前范围按用户决定收敛为：Skill 唤起独立窗口，保留现有页面，使用自己的 Codex，资料保存在本机。反馈更新暂不扩展；长期档案重构与其他 Agent 不作为先跑通的前提。Skill 是带启动脚本和完整运行代码的技能包，不是单个提示词文件；结构参考 [OpenAI Skill 文档](https://learn.chatgpt.com/docs/build-skills)。

资料与 Agent 安装分离。macOS 默认根目录为 `~/Library/Application Support/Ariadne Skill`，具体库在 `workspaces/<workspace-id>/`；页面保存的 `ariadne-content-workspace-v1` 映射选择工作区。更换 Agent 时需复用同一身份及读写契约，不能只指定根目录便假定已读取同一人。跨电脑需明确导出/复制与身份恢复，本轮没有实现自动同步。Codex 页面请求经独立 CLI 执行，不连接唤起 Skill 的聊天历史和工具。

本次实测补齐此前 Skill 阶段没有真实模型调用的缺口：独立窗口启动/退出/重开；隔离本地库两页合成 PDF 经真实 Codex 分析、人工保存、卡片恢复、真实详情对话。发现并修复候选人对话持久化层写死旧 DeepSeek 型号导致 Codex 回答保存失败的问题；现在按已持久化的本轮 RuntimeSnapshot 核对身份，仍拒绝不一致或缺失记录。

修复后对话成功保存为 `NO_CHANGE`，保留“原型未上线、无验证增长指标”的事实；确认版本未改变。服务停止/重启后卡片与对话恢复，76 个工作区文件 hash 相同。关联回归及 Skill 格式验证通过；本机安装已同步，新 ZIP 与全部运行文件校验通过。证据见 `.cache/skill-codex-e2e-20260920/`，最终结果见其中 `acceptance.json`。没有私人资料传输、旧资料迁移或官网新发布；其他电脑及其他 Agent 尚未验证。

## 官网安装入口上线（2026-09-20）

已发布 Cloudflare Pages `047f2d8c`，正式域名 `/install` 提供复制安装指令，旧 `/download.html` 自动跳转。介绍页、关于浮层、Codex 连接说明与中英 README 统一为 Skill。公网浏览器实际复制成功，完整包 2,793,081 bytes、SHA-256 `37fb2622e94020ce815ea32d04f7f7c643f2ac945a0f844b73ad163d45efca73` 与发布构建一致；修复静态托管 HEAD 缺少 Content-Length 时错误禁用按钮的问题，新增大小/hash 失败回归。桌面和 390px 页面验收通过，证据保留在 `.cache/skill-install-publication-20260920/`。

本机完整 Skill 已同步，doctor 的运行代码、Python、Codex 协议/登录及 PDF 工具检查通过。旧 `/Applications/Ariadne.app` 移至废纸篓的 `Ariadne-old-app-20260920.app`，移除其 Dock 固定项；旧 `Ariadne Local` 资料与安装备份保留。没有迁移旧资料、调用真实模型或发布 API Worker；本次只更新 Pages 及本机 Skill。以下旧阶段中的「未发布」描述保留为当时记录。

## 用户体验

默认：在 Codex 调用 `$ariadne` → 打开独立 Mac 窗口中的运行选择页面 → 选择 Codex/API/Local → 进入完整工作空间。本地同源无需配对，不使用 Codex 内置浏览器。关闭最后窗口或 ⌘Q 停止本次窗口及其服务，资料保留；最小化不退出。

可选：要求「连接公开网页版」时才启动 8765 配对通道，输入一次性码并同意连接；适合继续使用公开网站中的浏览器资料。

Skill 有网页界面，不是仅输出分析文字。网页仍负责来源归档、Working/Proposal、人工确认和保存版本。Skill 启动的本地服务负责将本次确认的请求交给用户自己的 Codex；不把当前 Agent 的历史、工具或文件系统控制权开放给网页。无需安装旧 Ariadne.app，窗口管理服务生命周期；模型推理仍由 OpenAI 提供，使用该用户账号额度。

## 安装与调用

打开官网 [安装 Skill](https://ariadne.kai-nex.com/install.html)，点击「复制安装指令」并发送给 Codex。Agent 获取完整包、核对 SHA-256、保留原版本备份并安装；网页本身不会写入本机。安装好后输入 `$ariadne 打开 Ariadne`，关闭最后窗口即退出。旧 `/download.html` 跳转到安装页，网页不再展示手动下载 App 的入口。复制受限时展开指令供手动复制；安装包缺失或 metadata 无效时按钮不可用。

发布构建产生 `Ariadne-Skill.zip` 和 SHA-256 文件。解压得到完整 `ariadne/`，内有 `SKILL.md`、`agents/openai.yaml`、启动脚本、含完整页面的 `runtime/`、逐文件 hash 和许可证。将整个文件夹交给 Codex，请它安装为 Ariadne Skill；已有同名技能时保留原件并先核对，不覆盖未知安装。不要只复制 `SKILL.md` 或脚本。

Codex 本机用户技能通常位于 `~/.codex/skills/ariadne`；支持 `.agents/skills` 的 Agent 也可使用其文档指定位置，但必须验证该 Agent 的执行环境。安装后调用 `$ariadne`；若尚未发现新技能，重开任务或重启 Codex。首版仅复用 Codex adapter，不声称任何 Agent 装上都能运行。

开发者可从源码执行，无需构建或安装 App：

```sh
python3 skills/ariadne/scripts/ariadne.py window
# 可选：只检查环境，或连接公开网页版
python3 skills/ariadne/scripts/ariadne.py doctor
python3 skills/ariadne/scripts/ariadne.py connect
```

默认本地页面固定为 `http://127.0.0.1:8766/`，与旧 8000/原 App/公网数据隔离，独立 WebKit 窗口打开该页面。窗口使用独立 profile，不自动迁移原浏览器的工作区身份或 API 连接。macOS 的资料写入 `~/Library/Application Support/Ariadne Skill`，其他 POSIX 写入 `~/.local/share/ariadne-skill`；升级代码不会覆盖资料。缺少 Codex/PDF 依赖时仍允许打开 Local，但不启用 Codex。`--port` 与 `--data-dir` 只用于明确指定的环境与隔离验收，不自动换端口。

可选公开网页配对默认只允许 `https://ariadne.kai-nex.com`。开发验证可传 `--origin http://127.0.0.1:端口`。Agent 根据脚本返回的 `url` 打开网页，不在 URL 中携带配对码。配对码五分钟有效、只能使用一次；连接授权最长八小时，沿用精确 Origin/Host、token、路由白名单和既有撤销行为。

## 环境与数据

- 独立窗口需要 macOS 14+ 与 Apple Command Line Tools，首次按本机 CPU 编译，缓存于数据目录的 `native/`；不替换旧 App、不固定 Dock。Python 3.9+、用户已登录的兼容 Codex CLI、Poppler 的 `pdftoppm` 和 `pdfinfo`。不携带 Apple arm64 二进制；Intel Mac 仍需实际验证；Linux 可显式使用 `open` 无窗口模式，原生 Windows 暂不支持。
- `doctor` 仅检查运行时代码完整性、依赖可执行、CLI 所需参数和登录状态，不读取认证文件、自动登录、改变配置或请求模型。通过检查不等于完成图片/PDF 模型资格认证；继续使用既有 capability authority 和 adapter。
- 网页配对原件读取复用 `src/web_source_read.py`：图片保持原图，PDF 完整逐页转图并返回页数，文本/DOCX 使用已有技术准备。不调用 Apple OCR 冒充跨平台语义理解；hash 不一致、缺页或无法处理时明确失败。
- 本地 Skill 的资料位于独立磁盘库，公开网页资料在浏览器库；旧 App、Skill 与公开网页不自动同步。安装不迁移、不复制个人材料、凭据或浏览器状态。
- 本地页面固定监听 `127.0.0.1:8766`，可选配对连接器为 `127.0.0.1:8765`。端口冲突报告失败，不结束旧进程、换端口或接管已有服务。独立窗口通过父子进程管道管理本次服务，窗口关闭/异常退出时收回服务及其子进程；不结束其他 Codex。配对和显式 `open` 模式通过 Ctrl+C/SIGTERM 退出；已发送到 OpenAI 的请求不保证取消或停止额度消耗。现有 App 不受影响。

## 构建与发布

```sh
python3 scripts/build_skill_bundle.py
python3 scripts/build_cloudflare_release.py --pdfjs /path/to/pdfjs-dist-5.4.624 --output /new/output/path
```

独立构建在 `.cache/skill-distribution/<时间>/` 保留源码包和 ZIP。Cloudflare 构建从当前公开源码白名单生成同款包，并将 ZIP、SHA-256 和 `downloads/skill.json` 放入 Pages，供 Agent 获取；不复制本机已安装技能。安装页只在 metadata 和实际文件大小有效时启用复制按钮；静态托管 HEAD 不含大小时获取完整包核对大小及 SHA-256。安装 Agent 仍须核对完整包的 SHA-256。原 Mac App 的历史 metadata 与 Release 保留，但页面不再展示下载引导。

Skill 包只含 Git 跟踪的运行源码、公开契约和完整公开网页资源，附启动脚本；不含 Python/Codex/Poppler 二进制、运行库、私有数据或登录文件。`runtime-files.json` 验证附带运行代码，外部 ZIP 完整性以独立 SHA-256 为准。不是代码签名或发行商身份认证。

## 本阶段验收

- 包含 `4b49193` 的页头对称布局，以及 `5063d20` 的两个资料库「编辑 / 完成」与卡片删除、职位生命周期、Markdown 库升级契约；直接从同一当前 checkout 构建，不维护第二份业务代码。
- 完整包本地启动到运行选择页面，在 Codex 内置浏览器进入工作空间，确认两个资料库编辑入口；本地无需配对。独立原件写入、错误版本拒绝、退出后重开保留、缺少 Codex/PDF 时仅禁用 Codex 的回归通过。

- 独立 ZIP 解压、逐文件完整性、损坏拒绝、缺依赖/登录/CLI 协议失败、端口冲突、启动/配对/撤销/退出回归。
- 实际本机 CLI 环境检查；egolite 在独立 loopback origin 下载完整 ZIP 并校验、配对后显示 GPT Sol、断开后授权失效、错误码失败；下载页桌面与 390px 布局检查。页面截图和下载证据保存在 `.cache/skill-distribution/`；浮窗中途动画截图只作过程记录，不作为视觉验收依据。
- 原件读取覆盖图片无 Apple OCR、PDF 完整页 manifest、hash 失败；既有 Codex transport/六类 runtime 描述符、Web 隔离、下载与 VI 回归。真实 PDF 渲染与模型语义质量分别记录，不将离线替身当真实模型。
- 本轮无真实模型请求、私人材料传输、公网发布或 Git push；正式 HTTPS 首次授权和另一台电脑首次安装仍待验收。

## 独立窗口补充验收（2026-09-20）

默认命令改为 `window`；`open` 保留为显式浏览器/开发模式。复用 `scripts/desktop_macos.swift` 的窗口、文件选择、下载、弹窗与关闭行为，条件编译接入 Skill；旧 App 构建入口保持。由 macOS Launch Services 启动独立窗口，Skill 安装包只携带源码，首次需要本机编译工具。生成程序是本机缓存，日常仍通过 Skill 启动。

本机实际打开连接页、点击窗口关闭并核对端口释放、资料保留、再次打开；独立包回归增加父管道断开、信号停止、端口冲突不接管和缺编译器明确失败。原生截图和 QA 数据保存在 `.cache/skill-window-20260920/`。未调用真实模型、未迁移原浏览器资料、未发布公网；首次启动错误及旧 QA 构建保留，不作为成功证据。

2026-09-20 图标修正：独立窗口沿用原 App 的 ICNS 与 Assets.car，保持系统图标的尺寸、留白与多外观；不再用网站 180px 图标覆盖。源码包约 2.7 MB，新增部分是 CPU 无关图标资源；原图及旧安装保留。

</details>
