# 2026-09-29 可靠性、负载与架构优化

本轮按用户授权实施多 agent 审核中能以现有契约验证的优化。三名审查/实现 agent 使用 Astra / ultra 分工，并交叉复核数据边界、运行成本和浏览器行为。开发所用模型不改变产品内用户选择的 Provider、型号、推理强度或权限。

状态：本地实现、回归、浏览器与发布包验收完成；未推送、部署、替换已安装 Skill 或执行真实业务模型。本轮证据只使用合成资料。原件、旧库、历史、已有未提交内容与 QA 产物原地保留。

## 已实施的改动

| 问题 | 实现 | 保持的边界 |
| --- | --- | --- |
| 流式公开说明反复发送完整前缀，长输出放大传输 | `commentary_delta` 按项增量；兼容旧完整替换；公开 JSON 预览使用增量解析 | 仅解析允许的公开字段路径；嵌套同名私有字段不输出，不展示内部推理 |
| PDF 为计数和交付重复完整转图，资源预算太晚才生效 | 元数据预检与真正转图分离；先验证整组页数/像素预算；请求内复用元数据；监控子进程磁盘输出 | 完整逐页交付，不截页、不降低既有 120 dpi / JPEG 82，不用 OCR 代替视觉材料 |
| 取消只改变界面，后端仍继续工作 | 请求级 cancellation 贯通本机 HTTP、Codex 通道、PDF 子进程、Web Provider 与 Worker signal | 隐藏仍在执行的详情不会误取消；不能撤销已经发生的费用 |
| Skill 同一附件落盘和推理各传一次 base64 | 先保存原始 Blob，再传绑定当前回合的本地引用；请求内复用已校验原件 | 校验 request、ordinal、domain、conversation、metadata、authority 和 hash；Web 禁止本地引用，发送同意保持 |
| 求职记录逐条读取反复拉取全库 | 共用读取 Promise、按 Job 查询、按键批量获取所需图片；大批次分块 | 写入仍采用完整读集与 CAS；原始字节校验保留；没有另建第二份事实库 |
| 旧库迁移每次初始化都探测，异常请求悬挂 | 先检查持久迁移标记；存储启动失败、abort 和请求结束均收束 pending 调用并释放锁 | 旧库与原件保留；失败明确返回，不把未读到的数据当作空库写回 |
| 页面刷新数据/加载历史会重建编辑节点，冲掉提案草稿 | 页面内草稿状态、稳定节点与历史增量挂载；失败保留草稿；外部决定冲突禁用保存并允许明确放弃 | 仅页面存活期间保留草稿，不声称刷新浏览器或重开窗口后恢复；人工确认仍是保存入口 |
| 历史 PDF 导出反复绘制、编码及生成 URL | 复用未变化输出的导出结果与 URL；减少重复 canvas 编码；输入事件合并更新 | 导出仍覆盖完整内容，测试验证真实下载字节、页数和交叉引用偏移 |
| Web 操作达到 256 次后无明确续用路径 | 明确提示用户核对结果，再开始新连接；旧操作固定原 session；绑定 Provider/凭据指纹 | 不自动重放付费请求；凭据改变时旧操作拒绝续发；session 记录不保存原始 Key |
| 老标签页跨版本加载、静态缓存和动态模块失败难诊断 | 整个 JS/MJS/CSS 依赖图生成版本化文件名；HTML/别名/manifest 保持重新验证；可保留上一发布代资产 | 不自动刷新或重试付费操作；旧资源缺失时明确提示先保留编辑内容再刷新 |
| 旧单字段提案缺少完整原子条件 | 同一事务核对提案、版本、生命周期及已处理决定 | Candidate/Job 保存权限分离，冲突整组拒绝，不覆盖他人或其他页的决定 |

本地附件库由客户端选择工作区，这不是服务端多账户授权系统；本轮加强回合、领域、会话及原件完整性，不把客户端工作区 ID 当作额外安全认证。

## 可复现的性能证据

基线为 `a16e004cfcb85b430cb808c7b78b1f992f795302`。以下是相同合成输入下的局部比较，不能外推为整个产品、模型调用或真实用户机器的加速倍数。

| 场景 | 修改前 | 修改后 | 测量范围 |
| --- | ---: | ---: | --- |
| 2,400 字公开说明，每次增加 1 字 | 17,425,293 B | 166,887 B | NDJSON 事件字节，约减少 99.0% |
| 6,000 字公开说明，每次增加 5 字 | 21,686,493 B | 111,687 B | NDJSON 事件字节，约减少 99.5% |
| 47,973 字 JSON，公开段后接增长的非公开段 | 9.5495 s | 0.00334 s | 仅公开预览解析 CPU，中位数；不含模型时间 |
| 两页 PDF 的完整 Job 准备 | 2 次转图 / 1.1615 s | 1 次转图 / 0.6293 s | 三次取中位数，均交付完整两页 |
| 1,000 条记录，其中当前 Job 100 条、各 1 张合成图片 | 301 请求 / 135,361,847 B | 2 请求 / 665,254 B | 真实新旧 JS 适配器、内存端点；压缩前 JSON，不含磁盘与网络延迟 |

运行证据与脚本保留在本地工作目录：

- [运行时结果](../../work/optimization-20260929/runtime/results-final.json)与 [复现说明](../../work/optimization-20260929/runtime/README.md)。
- [存储复现说明](../../work/optimization-20260929/storage/README.md)与 [15 组合成结果](../../work/optimization-20260929/storage/results-2026-09-29T15-18-43-497Z.json)。

存储查询仍需一次完整扫描并检查 hash；本轮消除的是重复扫描和无关数据传输，没有证明磁盘索引已无必要。30 MiB 原始附件减少一次约 40 MiB 的 base64 传输是编码体积估算，不是浏览器峰值内存实测。

## 验收与持续集成

- 完整本地离线回归 141/141 通过，其中含此前未跟踪、未纳入本阶段提交的 Mac 启动器回归。随后人工语义回执校验的 6 项专项测试通过；不把它记作同一轮完整运行。
- VI 检查与 diff 检查通过。新增边界回归覆盖附件引用、数据读取恢复、查询/批读、PDF 整组预算、公开增量解析、取消、session 续期与凭据变更、旧提案冲突和资产指纹。
- egolite 实际验证草稿、历史、冲突、迁移与连接续期；截图连续遇到 CDP 超时，按用户约定改用已安装 Google Chrome。Chrome 完整验收通过，覆盖 1280px 与 390px 截图，浏览器/控制台错误均为零。测试使用隔离合成工作区、禁用业务模型调用和外网请求；为离线稳定性替换了 Google Fonts 样式请求，不代表线上字体加载验收。
- 真实 canvas 导出 90 行、3 页 PDF，601,768 bytes，SHA-256 `7f62c4342f150e4f34c73b839a765154b868576281cfbc2c77aff875db2a2ad1`；实际下载与 Blob 字节相同，检查 JPEG-only、完整页和 xref 偏移。见 [浏览器结果](../../work/optimization-browser/2026-09-29T15-29-38-826Z-65547/results.json)及同目录桌面/手机截图。
- CI 新增固定版本 Playwright 1.62.1 的真实浏览器流程及失败时也保留的证据上传；本地对应流程已通过，尚未推送，因此没有本次远端 CI 结果。既有全历史 Gitleaks 步骤保留，本轮未重新执行全历史扫描。

本地运行浏览器验收：

```sh
ARIADNE_PLAYWRIGHT_PACKAGE=/absolute/path/to/playwright node tests/optimization_browser_qa.mjs
```

若本机只装有 Google Chrome，可增加 `ARIADNE_QA_BROWSER_CHANNEL=chrome`；CI 使用安装后的 Chromium。执行器只允许合成 workspace 写入，其他业务 POST 被拒绝，结束后关闭自身浏览器与服务。

## 构建与真实平台检查

最终候选产物保留在 `work/optimization-20260929/release-20260929-153146/`，由该基线加本轮未提交实现构建；包内 manifest / 外部回执记录实际文件 hash，不冒充干净 Git 发布版本。最终构建与验包期间业务源文件无漂移，后续补充项目记录不改变已检验的运行代码。

| 产物 | 大小 | SHA-256 |
| --- | ---: | --- |
| `skill/Ariadne-Skill.zip` | 2,907,705 B | `0136b20194ab369f691e8031c1a35a034d104b9d18e15272d1457d9b805e9fec` |
| `web.tar.gz` | 875,882 B | `89ab814bb5e2ec27951e56341d3cf87c8a5d07223518c74b16393a28b91a47c5` |
| `cloudflare/Ariadne-Pages.zip` | 7,133,344 B | `732a42fbeb70bc6e39facd5a8544f4d59066c43aaa55e6eba6ee00ed6f0b2a59` |

Skill 的 234 个 runtime 文件 hash 已核验；必要新模块在三种产品中一致。真实本地 Wrangler / workerd / Pyodide 的 `healthz` 与 Web runtime 均返回 200；无效合成非流式 POST 经过 Default → Durable Object → WSGI 后返回 422 `PERSONAL_REQUEST_INVALID` / `failure_layer=contract` / `network_call_made=false`，覆盖实际平台导入与 signal 属性兼容，无 Provider 调用。

实际 Pages 服务验证了 hashed URL 的 `public, max-age=31536000, immutable`，以及 HTML、原路径别名和 manifest 的 `no-cache`。本次两包的前端图相同，因此 generation 相同，116 个上一代文件逐个校验；另外在发布包之外构建合成两代静态图，真实 Pages 验证新旧 hash URL 与缓存头，不改候选包。篡改拒绝另由资产回归覆盖。证据见该目录的 `package-verification.json`、`local-runtime-report.json`、`pages-runtime-report.json` 和 `pages-distinct-generation-report-v2.json`。

构建时应传 `--previous-pages /absolute/path/to/previous/pages`，只保留该 manifest 所属的一代资源，并校验路径和内容 hash；不无限累计旧发布。Cloudflare `_headers` 使用 detach 后设置，避免重叠规则把 `no-cache` 和 `immutable` 合并，规则语义见 [官方 Headers 文档](https://developers.cloudflare.com/pages/configuration/headers/)。本轮没有部署或修改正式服务。

## 语义质量与尚未完成的工作

新增 `tests/fixtures/semantic_review_cases.json` 的 8 个合成情景，覆盖否定修改、整组修改、证据缺失、来源冲突、材料指令注入、公开来源隔离、假设讨论和完整视觉 PDF。`scripts/evaluate_semantic_review.py` 只校验真实执行及人工评审回执，不自行调用模型或以关键词评分；未提供结果时明确返回 `NOT_RUN`。

回执须声明 synthetic-only / real-model-execution，并记录 Provider、精确 model/effort、prompt 版本、完整 source commit、带时区执行时间，各场景的原始输出、有限耗时、整数 token 用量与人工判定及依据。调用方式为 `python3 scripts/evaluate_semantic_review.py /path/to/receipt.json`。人工失败返回 `REVIEW_FAILED` / exit 1，无效回执返回 `INVALID_RECEIPT` / exit 2；拒绝重复 JSON 字段及 NaN/Infinity。结构字段齐全不能证明回执真实性、评审者独立性或模型质量，工具明确标记 `SELF_REPORTED_NOT_VERIFIED`；实际结果仍需核验原始执行证据，并由人评价。当前未执行本轮真实模型评测或招募真实用户。

保留以下限制，避免把优化写成“项目完美”：

- `v1-pages.js` 的大型共享闭包尚未整体拆分。已落实可验证的状态/渲染和存储接口改进；全面拆分需先按领域入口建立独立契约，不能仅为文件变小引入循环依赖或更大的加载成本。
- 未引入微服务、框架迁移、持久查询索引或跨端自动同步。当前证据支持先消除重复工作；进一步架构投资应由实际规模、CPU、峰值内存与 p95 延迟决定。
- PDF 子进程每 100 ms 检查已写 JPEG 总量，两个检查之间可能短暂超过预算；`pdfinfo` 可占用其既有约 10 秒超时窗口。取消不能保证上游已停止计费。
- 超过保留代数的旧页面可能需要人工刷新；尚未保存的文本应先自行保留。页面内草稿恢复不等于跨刷新持久草稿。
- 尚无生产并发/长时间内存压力、全部 Provider/设备、全新机器安装或真实用户研究证据。源码、合成浏览器及本地平台通过不替代这些验收。
