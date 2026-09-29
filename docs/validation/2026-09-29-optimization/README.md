# 2026-09-29 优化：公开合成证据

这是一份历史验收的精简证据集，仅包含合成资料的测量、离线回归和本地平台检查。没有执行真实业务模型、部署、生产并发压力测试或真实用户研究。原始 `work/` 和 `.cache/` 文件仍保留；本目录没有移动或替换它们。

比较基线为 `a16e004cfcb85b430cb808c7b78b1f992f795302`。测量后的相关运行代码已核对并绑定到 `8b77d26abb3b9609960e2d674fd88c0f545fa884`，核对范围见 [manifest.json](manifest.json)。发布包在该提交之前从本地候选工作树构建，因此这里的包 hash 是当时产物的记录，不表示新提交重新构建必然得到相同压缩包字节。

## 文件与测量边界

| 文件 | 内容 | 不能据此推断 |
| --- | --- | --- |
| [runtime-results.json](runtime-results.json) | 增量公开预览解析、NDJSON 事件字节、公开合成两页 PDF；计时取三次中位数 | 整个产品、模型推理或任意用户设备的加速比 |
| [storage-results.json](storage-results.json) | 真实新旧 JS 客户端对内存只读端点的 15 组比较，核对完整记录及图片原始字节 | 磁盘、锁、HEAD、浏览器 IndexedDB、初始化/迁移和写事务耗时 |
| [browser-results.json](browser-results.json) | 原生浏览器中的草稿、冲突、历史 DOM、原生 IndexedDB、两次 session 恢复及实际三页 PDF 下载 | 线上字体加载、全部浏览器/设备或真实模型输出质量 |
| [package-verification.json](package-verification.json) | 三种候选包的大小/hash、必要文件一致性、234 个 Skill runtime hash、116 个指纹资源 | 已部署、全新机器安装成功或正式发布签名 |
| [worker-runtime-summary.json](worker-runtime-summary.json) | 本地 Wrangler/workerd/Pyodide，健康检查、Web runtime 和无效合成请求经 DO/WSGI 后被契约拒绝 | Provider 请求成功或线上容量 |
| [pages-cache-summary.json](pages-cache-summary.json) | 候选包的真实本地 Pages 缓存响应；两包前端图相同，generation 相同 | 两个不同真实发布版本已部署 |
| [pages-distinct-generations-summary.json](pages-distinct-generations-summary.json) | 另建的合成两代静态图，新旧 hash URL 与缓存头均经本地 Pages 验证 | 对候选包做了二次改写或修改了正式服务 |
| [regression-summary.json](regression-summary.json) | 历史完整运行 141 个回归脚本的退出状态，全部为 0 | 当前公开源码必然发现相同数量的脚本，或每个脚本的每个测试均未 skip |

141 项中包含当时未跟踪、未纳入该阶段提交的 `macos_launcher_regression.py`。之后另一次 `tests/semantic_review_regression.py` 的 6 个用例通过；这是补充工具输出，没有独立文件回执包含在这里，不能合并记作同一次全量运行。语义回执校验器的用例通过，也不等于真实模型语义评测通过。

浏览器验收先使用 egolite；截图连续发生 CDP 超时后改用已安装的 Google Chrome，覆盖 1280px 与 390px 页面。业务模型 POST 与外网请求被阻断；Google Fonts CSS 被明确替换为空样式，使用产品已有的系统字体回退。90 行合成内容实际生成完整三页 PDF，601,768 bytes，SHA-256 为 `7f62c4342f150e4f34c73b839a765154b868576281cfbc2c77aff875db2a2ad1`，浏览器保存字节与 Blob 相同。截图和 PDF 原件留在原工作目录，本小型公开证据集只保留结果与 hash。

存储输入为 100/500/1,000 条合成记录，当前 Job 占 10%，图片为每条 0/1/2 个 4,096-byte 合成载荷。指标统计压缩前紧凑 UTF-8 JSON，不含 HTTP 头；图片载荷用于传输和完整性校验，不测试图片解码。查询仍会扫描并检查一次 store 的 hash，未证明持久索引没有价值。单点/批读比较衡量调用方采用已有读取能力，而非声称 `getRecord()` 是本轮新发明的接口。

运行时计时使用 `time.perf_counter()` 的经过时间，不是进程 CPU 采样。公开预览输入的非公开 JSON 段不断增长，用于检验历史解析放大；PDF 只使用仓库公开的 `provider-visual-check.pdf`，新旧路径均完整交付两页，保持 120 dpi/JPEG 82。小片段长说明是可复现的边界场景，不代表真实模型通常以同样模式输出。

## 复现

需要 Python 3.9+、Node.js 22+、含基线提交的 Git 历史，以及 PATH 中的 Poppler `pdfinfo`、`pdftoppm`。这些脚本不安装依赖、不访问网络、不调用模型，也不读取个人工作区；只读当前/历史源代码与公开合成 PDF。它们默认将每次结果写入新的 `work/benchmarks/` 时间戳文件，拒绝覆盖已有文件。

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/benchmarks/runtime_optimization.py
node scripts/benchmarks/storage_reads.mjs
```

两个脚本均支持 `--root /path/to/repository`、`--baseline <commit>` 和 `--output /path/to/new-results.json`。显式相对输出路径相对于命令执行目录；默认输出位于所选仓库的 `work/benchmarks/runtime/` 或 `work/benchmarks/storage/`。新结果记录实际加载的模块 hash；计时随环境变化，不要求重现历史小数。

- [运行时脚本](../../../scripts/benchmarks/runtime_optimization.py)保留原有三类合成工作量与完整页断言。
- [存储脚本](../../../scripts/benchmarks/storage_reads.mjs)执行真实新旧适配器和 journal `list()`，逐项比较读取结果及选中图片的字节 hash。
- 浏览器验收使用 [optimization_browser_qa.mjs](../../../tests/optimization_browser_qa.mjs)，通过 `ARIADNE_PLAYWRIGHT_PACKAGE` 指定已安装的 Playwright；仅装有 Google Chrome 时可设 `ARIADNE_QA_BROWSER_CHANNEL=chrome`。CI 安装固定 Playwright 1.62.1 对应的 Chromium，关闭自有服务并保留每次证据。
- 回归入口为 `python3 scripts/run_regressions.py`；该次运行的数量由实际可见的测试文件决定。

## 来源与完整性

[manifest.json](manifest.json)记录每个公开 JSON 的字节数/SHA-256、原始文件的仓库相对路径和原始 hash，并逐项说明裁剪。原始来源路径用于追溯，不承诺本地 `work/` 或 `.cache/` 出现在公开仓库中。

运行时、存储、浏览器、验包与回归 JSON 按字节复制；Worker/Pages 摘要移除了冗余依赖文件清单、本机临时端口、重复响应头和无关占位状态，保留状态码、契约错误、缓存策略、内容 hash 与代际关系。没有复制账户资料、机器标识、绝对本机路径、私人材料、完整发布包或依赖目录。SHA-256 可以核对文件一致性；它不是独立第三方认证。
