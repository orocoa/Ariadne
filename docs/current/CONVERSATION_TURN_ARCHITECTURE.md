# 共用对话 Turn 架构

更新：2026-09-24。适用于 Candidate、Job、个人理解与职位概况的 Model 对话；领域语义、结果校验和人工保存权限仍分别维护。对话现在通过同一 transport 接收请求局部实时事件；协议、公开预览与校验边界见 [对话实时反馈](CONVERSATION_LIVE_FEEDBACK.md)。

2026-10-14 增量：六入口共用只读 `personal_context`，提供当前人工保存补充和完整必要依据；四 adapter 校验并入模，原领域成功事务复核捕获的来源/记忆 readset。失效历史不回流，超预算显式失败；共用 transport 不取得解释事实或保存权限。具体行为和验收边界见[理解一致性修复](UNDERSTANDING_CONSISTENCY_20261014.md)。

## 为什么需要整合

此前附件组件已经共用，但每个领域仍各自编排 `prepare → fetch → parse → finish`。同一套附件落盘、网络异常和成功清理逻辑分散在四处，状态只能退化为总发送按钮的 loading。用户看到 DOCX 卡片和「正在理解」时，无法分辨正在校验文件、已在本机保存、正在传输，还是模型正在生成回复；页面分支也容易在后续修改中出现不同的失败与清理行为。

本轮把共用边界提升一层：所有 Model 对话经 `conversation-turn-transport.js` 进入同一 Turn Transport。页面/领域不再直接调用附件的 `prepare` 或 `finish`。

## 当前管线

1. **Composer / Attachment Controller**：`conversation-attachments.js` 只负责选择、格式与大小检查、明确传输确认、本机 `SOURCE_INPUT_ONLY` 原件记录，以及可见阶段状态。
2. **Turn Transport**：`conversation-turn-transport.js` 是唯一的前端网络编排入口，按顺序准备附件、标记模型请求、发起请求、确认 composer dispatch、接收实时事件/公开预览、解析统一终态与错误，并且恰好一次完成或失败附件状态。旧 JSON 响应兼容但不宣称实时。
3. **Domain Contract**：Candidate、Job、个人理解、职位概况继续分别创建请求、检查 Runtime signature、校验结果和执行各自的 Working/Proposal/只读权限；共用传输不解释领域语义。
4. **Backend Attachment Adapter**：`src/conversation_attachments.py` 集中核对执行 ID、Provider/model 同意、文件名/MIME/大小/hash 和完整解码，再把本轮材料作为低权限 source material 放入对应领域 payload。
5. **Persistence / Delivery**：领域持久化只保存已校验的对话与 Working 结果；附件不会自动成为确认资料。模型选择 PDF/图解 deliverable 时，`conversation-output.js` 在本地生成下载文件。

可见阶段固定为：检查模型能力 → 读取并校验 → 本机安全保存 → 请求已发出并等待模型理解 → 完成/失败。网络请求成功创建后，dispatch 会立即把本轮附件从 composer 移出并显示数量回执，避免长时间生成过程中把已发送缩略图误认为待发送；若网络或模型失败，原附件恢复到 composer，用户重新确认后可以重试。它们描述实际边界，不伪造 Provider 侧的上传百分比，也不重新引入每轮耗时计时。

## 不变量

- 选中文件不等于发送；未确认、Runtime 改变或 Local 模式均在网络请求前失败。
- 原件先在当前工作区持久化，持久化失败则不发送；失败后保留选择供重试。
- Turn Transport 只处理网络生命周期，不绕过领域 schema、来源范围、版本冲突或人工保存。
- Candidate/Job 不互相静默改写；个人补充仍是 Proposal/DRAFT；职位概况仍只读。
- 当前请求成功只说明本轮附件被模型处理。它不会自动成为资料卡，也不会在下一轮隐式重传。
- Skill 与 Web 共用此页面管线，但 transport 和存储路由仍由各自产品配置决定。

## 后续扩展原则

新增对话领域时，应提供 endpoint、domain identity、Runtime signature 与领域 error factory，然后接入 Turn Transport；不得复制一套附件收尾代码。更细服务端进度使用现有请求局部事件通道，不用前端定时器猜测上传/推理阶段，也不把模型观察标成代码验证结果。

## 2026-09-24：跨职位上下文与公开链接

职位概况的 DISCUSS 现在读取当前个人资料与职位集合，两类数据的确认保存权限不变。共用 Turn Transport 仍只负责附件与网络生命周期；跨域读取、两类版本指纹、证据覆盖与引用由 Job Overview 领域负责。公开页面在服务端验证本轮 Runtime/同意/凭据后准备，作为未核验来源注入同一请求，保留失败/节选回执，不给 Codex 开放工具。细节、限制与验收见 [跨职位对话契约](ARIADNE_JOB_OVERVIEW_V1.md)。
