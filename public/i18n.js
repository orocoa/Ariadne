"use strict";

(function attachAriadneI18n(root) {
  const STORAGE_KEY = "ariadne.ui.locale.v1";
  const ENGLISH = "en";
  const CHINESE = "zh-CN";
  const HAN = /[\u3400-\u9fff]/u;
  const ATTRIBUTES = ["aria-label", "placeholder", "title", "alt", "content", "data-mini-label", "data-personal-prompt", "data-job-prompt"];
  const SKIP_SELECTOR = [
    "script", "style", "code", "pre", "textarea", "[contenteditable]", "[data-i18n='off']",
    ".v1-conversation-message.user", ".v1-conversation-message.assistant",
    ".v1-candidate-card h3", ".v1-candidate-card .v1-card-subtitle", ".v1-candidate-card .v1-card-summary", ".v1-candidate-card li",
    ".personal-memory > p", ".personal-insight > p", ".personal-evidence", ".personal-proposal blockquote", ".personal-proposal textarea",
    "#candidate-title", "#candidate-subtitle", "#candidate-time", "#candidate-summary", "#candidate-facts", "#candidate-ownership", "#candidate-source",
    "#job-title", "#job-company", "#job-location", "#job-summary", "#job-requirements", "#job-source",
    "#memory-list", "#memory-history"
  ].join(",");

  const EN = Object.freeze({
    "这条建议或相关资料已变化；你的编辑仍保留，请复制需要的内容后重新核对。": "This suggestion or its supporting information has changed. Your edits are preserved; copy anything you need before reviewing the latest version.",
    "放弃这份编辑并读取最新建议": "Discard these edits and load the latest suggestion",
    "选择记录图片": "Choose entry images",
    "添加图片，可拖拽或粘贴": "Add images, drag or paste",
    "拖拽图片到这里，或点击选择": "Drop images here, or click to choose",
    "也可直接粘贴图片": "You can also paste images here",
    "暂无备注": "No notes yet",
    "暂无求职记录": "No application entries yet",
    "每行填写一条备注": "One note per line",
    "添加更多": "Add more",
    "删除记录": "Delete entry",
    "移除图片": "Remove image",
    "关闭图片": "Close image",
    "内容": "Content",
    "记录沟通经过、反馈或下一步安排": "Record conversations, feedback or next steps",
    "修改已保存。": "Changes saved.",
    "求职记录": "Application journal",
    "发生日期": "Date",
    "公司反馈": "Company feedback",
    "经过与补充": "What happened",
    "添加图片": "Add images",
    "添加记录": "Add entry",
    "进展记录": "Progress update",
    "已读未回": "Read, no reply",
    "明确拒绝": "Explicit rejection",
    "持续无回复": "Still no response",
    "面试邀请": "Interview invitation",
    "收到 Offer": "Offer received",
    "其他反馈": "Other feedback",
    "求职记录时间线": "Application timeline",
    "记录你观察到的反馈。无回复不等于拒绝；这些记录不会自动改变投递阶段或发送给 AI。": "Record the feedback you observed. Silence does not mean rejection. Entries do not automatically change your application stage or get sent to AI.",
    "每条最多 4 张，单张 5 MB、合计 12 MB。可保存聊天截图、邮件反馈或面试通知。": "Up to 4 images per entry: 5 MB each, 12 MB total. Attach chat screenshots, email feedback or interview notices.",
    "还没有求职记录。记录沟通过程、公司反馈或等待情况。": "No entries yet. Record your conversations, company feedback or waiting status.",
    "求职记录已保存；职位要求和个人资料没有变化。": "Entry saved. Job requirements and your personal profile are unchanged.",
    "可以对比多个职位描述、讨论岗位类型与要求差异。对话会结合当前个人资料与已保存补充，帮助比较适合的方向；不会自动修改个人资料或职位。": "Compare jobs using your current profile and saved personal notes. Discussion does not automatically change your profile or jobs.",
    "哪些更适合我": "Which roles suit me?",
    "正在读取个人资料与当前职位…": "Reading your profile and current jobs\u2026",
    "正在结合个人资料与当前职位回应…": "Considering your profile and current jobs\u2026",
    "正在结合个人资料与全部职位概况回应…": "Considering your profile and the full job overview\u2026",
    "个人资料或职位已经变化，本次结果未保存。请基于最新资料重试。": "Your profile or jobs changed. This result was not saved; please retry with the latest information.",
    "暂时无法读取个人资料或职位，请重试；未将读取失败当作资料为空。": "Could not read your profile or jobs. Please retry; a read failure does not mean your records are empty.",
    "从整体概况、岗位共性或某几份职位描述的差异开始。也可以结合关于我，讨论哪些方向更适合你。": "Discuss similarities and differences across jobs, or use your saved profile to explore suitable directions.",
    "旧轮次未读取个人资料。": "This older turn did not read your profile.",
    "（基于当时资料或旧读取范围的历史回答）": "(Historical answer based on earlier records or reading scope)",
    "个人资料": "Personal profile",
    "未能读取，未作为网页证据": "Could not read; not used as web evidence",

    "Ariadne · 衡": "Ariadne",
    "。": ".",
    "zh_CN": "en_US",
    "Ariadne · 连接设置": "Ariadne · Connection Settings",
    "Ariadne · 工作空间": "Ariadne · Workspace",
    "Ariadne · 个人资料": "Ariadne · Personal Profile",
    "Ariadne · 添加个人材料": "Ariadne · Add Personal Material",
    "Ariadne · 个人材料详情": "Ariadne · Personal Material Details",
    "Ariadne · 职位描述": "Ariadne · Job Descriptions",
    "Ariadne · 添加职位描述": "Ariadne · Add a Job Description",
    "Ariadne · 职位详情": "Ariadne · Job Details",
    "Ariadne · 了解我": "Ariadne · Understand Me",
    "Ariadne · 了解职位概况": "Ariadne · Understand My Jobs",
    "Ariadne · 安装 Skill": "Ariadne · Install the Skill",
    "Ariadne · 安装与使用 Skill": "Ariadne · Install and Use the Skill",
    "Ariadne · 连接 Gemini": "Ariadne · Connect Gemini",
    "关于 Ariadne · 衡": "About Ariadne",
    "结合你的简历、作品集与目标岗位，讨论已有依据、需要补充的信息和下一步。支持网页版与本地 Skill，使用自己的模型连接，由你审阅并保存。": "Bring your résumé, portfolio, and target roles together to discuss the evidence you already have, what still needs clarification, and what to do next. Use the web app or local Skill with your own model connection; you review and save every change.",
    "Ariadne · 衡｜看懂经历，理解岗位": "Ariadne · Understand your experience and the role",
    "Ariadne 双手 Logo 与个人资料、职位描述工作空间；看懂经历，理解岗位，由你决定下一步。": "Ariadne hands logo with a workspace for personal materials and job descriptions; understand your experience and the role, then choose your next step.",
    "Ariadne 双手 Logo 与空工作空间，不含个人资料。": "Ariadne hands logo with an empty workspace containing no personal information.",
    "连接设置": "Connection Settings",
    "正在读取可用模型…": "Loading available models…",
    "继续": "Continue",
    "选择运行方式": "Choose how to run Ariadne",
    "添加新的模型": "Add a new model",
    "使用自己的 API Key": "Use your own API key",
    "通过本地 Agent 使用": "Use with a local agent",
    "安装 Skill，在独立窗口中使用": "Install the Skill and use it in a separate window",
    "暂不连接 AI": "Continue without AI",
    "先保存原件，接入 AI 后再分析": "Save source files now and analyze them after connecting AI",
    "关闭添加模型": "Close Add Model",
    "关闭": "Close",
    "模型服务": "Model provider",
    "千问 Qwen": "Qwen",
    "输入 API Key": "Enter API key",
    "删除已保存的 API Key": "Delete the saved API key",
    "API Key 保存在当前浏览器。你确认发起请求后，Key 与本次材料经当前 Ariadne 服务转发至 DeepSeek；本地版经本机服务，网页版经网站服务器。Key 不在服务端持久保存，上传材料仅作临时处理。请在自己的设备使用。": "Your API key is stored in this browser. After you confirm a request, the key and the material for that request are relayed to DeepSeek through the current Ariadne service: the local service for the local app, or the website server for the web app. The key is not stored on the server, and uploaded material is processed only temporarily. Use Ariadne on your own device.",
    "点击连接将向 DeepSeek 发送一张固定测试图片，可能产生少量 API 费用；不会发送你的个人材料。": "Connecting sends one fixed test image to DeepSeek and may incur a small API charge. None of your personal material is sent.",
    "可用图文模型": "Available multimodal models",
    "同意验证并连接": "Agree, verify, and connect",
    "1. 先安装 Skill": "1. Install the Skill",
    "复制安装指令，粘贴到 Codex 对话中并发送，等待安装与依赖检查完成。": "Copy the installation prompt, paste it into a Codex conversation, and send it. Wait for installation and dependency checks to finish.",
    "复制安装指令": "Copy installation prompt",
    "正在检查可安装版本…": "Checking the available version…",
    "查看安装指令": "View installation prompt",
    "复制后粘贴到 Codex": "Copy and paste into Codex",
    "2. 安装完成后调用": "2. Launch it after installation",
    "在 Codex 对话中输入并发送": "In a Codex conversation, enter and send",
    "，即可直接进入独立窗口的工作空间。": " to open the workspace directly in a separate window.",
    "3. 在窗口中使用": "3. Use the window",
    "添加个人资料或职位材料，再围绕材料提问。分析使用你的 Codex，结果由你审阅保存；关闭最后窗口即停止服务，已保存资料保留。": "Add personal or job materials, then ask questions about them. Analysis uses your Codex, and you review and save the results. Closing the last window stops the service while keeping saved materials.",
    "网页资料与 Skill 本地资料各自保存，不自动同步。目前已支持 Codex，其他 Agent 待适配。": "Web data and local Skill data are stored separately and do not sync automatically. Codex is supported now; other agents still need adapters.",

    "关于 Ariadne · 衡": "About Ariadne",
    "打开导航菜单": "Open navigation menu",
    "主导航": "Main navigation",
    "工作空间": "Workspace",
    "个人资料": "Personal Profile",
    "职位描述": "Job Descriptions",
    "工作空间对象": "Workspace items",
    "简历 · 作品集 · 项目": "Résumé · Portfolio · Projects",
    "职位内容 · 任职要求": "Role details · Requirements",
    "正在读取…": "Loading…",
    "尚未添加": "Nothing added yet",
    "暂时无法读取": "Unable to load right now",
    "返回工作空间": "Back to workspace",
    "返回个人资料": "Back to personal profile",
    "返回职位描述": "Back to job descriptions",
    "了解我": "Understand Me",
    "了解职位概况": "Understand My Jobs",
    "编辑": "Edit",
    "完成": "Done",

    "添加个人材料": "Add personal material",
    "个人材料导入": "Import personal material",
    "材料类型": "Material type",
    "简历": "Résumé",
    "作品集": "Portfolio",
    "项目": "Project",
    "其他": "Other",
    "已保存在本机的原件": "Source files saved on this device",
    "选择已保存的原件": "Choose a saved source file",
    "点击上传文件或直接拖拽文件至此": "Click to upload or drag files here",
    "已选择的来源": "Selected sources",
    "添加来源": "Add source",
    "保存原件": "Save source files",
    "只保存原件，稍后分析": "Save source files only and analyze later",
    "候选人信息工作区": "Candidate information workspace",
    "返回全部卡片": "Back to all cards",
    "标题": "Title",
    "分类标签": "Category",
    "例如：建筑项目；留空恢复默认类型说明": "For example: Architecture project; leave blank to restore the default type label",
    "副标题": "Subtitle",
    "组织 / 副标题": "Organization / Subtitle",
    "时间": "Date",
    "日期": "Date",
    "摘要": "Summary",
    "事实": "Facts",
    "事实（每行一条）": "Facts (one per line)",
    "责任边界": "Scope of responsibility",
    "来源": "Source",
    "保存修改": "Save changes",
    "取消": "Cancel",
    "保存到个人资料": "Save to personal profile",
    "告诉 Ariadne 哪里需要调整": "Tell Ariadne what to adjust",
    "直接说想了解什么，或哪里需要修改": "Ask what you want to understand or describe what should change",
    "发送修改请求": "Send change request",
    "发送": "Send",
    "待人工审核": "Awaiting your review",
    "本地候选信息提案": "Local candidate-information proposal",
    "模型候选信息提案": "Model candidate-information proposal",
    "这些内容来自本地确定规则，尚未成为已确认候选信息。": "This content comes from local deterministic rules and has not become confirmed candidate information.",
    "这些内容来自所选模型，尚未成为已确认候选信息。": "This content comes from the selected model and has not become confirmed candidate information.",
    "该资料已被读取": "This material has been read",
    "确认": "Confirm",
    "拒绝": "Reject",
    "文件大小提示": "File size notice",
    "每个文件最大支持 30 MB，请压缩后重试。": "Each file can be up to 30 MB. Compress larger files and try again.",
    "模型分析未完成": "Model analysis did not finish",
    "模型服务暂时无法完成分析；未保存任何模型提案。请稍后重试。": "The model service could not complete the analysis. No model proposal was saved. Try again later.",
    "知道了": "Got it",
    "确认发送个人材料": "Confirm sending personal material",
    "这次操作会把当前文件内容发送到模型服务商进行候选人材料理解。": "This action sends the current file contents to the model provider so it can understand the candidate material.",
    "确认并发送": "Confirm and send",
    "是否关闭当前操作？": "Close this task?",
    "当前卡片还有未保存的修改。": "This card still has unsaved changes.",
    "保留草稿并关闭": "Keep draft and close",
    "放弃草稿并关闭": "Discard draft and close",
    "继续编辑": "Keep editing",
    "当前的修改尚未保存，是否保存后返回？": "Your changes are not saved. Save before going back?",
    "是": "Yes",
    "否": "No",
    "标题必须填写。": "A title is required.",

    "个人资料 / 材料对象": "Personal Profile / Material",
    "直接编辑预览": "Direct edit preview",
    "修改前": "Before",
    "修改后": "After",
    "确认修改": "Review changes",
    "确认保存": "Confirm and save",
    "返回编辑": "Back to editing",
    "AI 对话": "AI conversation",
    "仅限当前材料": "Current material only",
    "当前卡片智能协作": "Work with AI on this card",
    "使用当前选择的模型讨论这张卡片，或用自然语言生成 Candidate Working 修改。确认保存前，已确认信息保持不变。": "Discuss this card with the selected model, or describe a Candidate Working change in natural language. Confirmed information remains unchanged until you explicitly save.",
    "待审核修改建议": "Change suggestion awaiting review",
    "确认并保存": "Confirm and save",
    "暂不保存": "Do not save",
    "询问当前材料": "Ask about this material",
    "询问这份材料，或直接说明要修改什么": "Ask about this material or describe what you want to change",
    "关闭删除操作": "Close delete controls",
    "删除操作": "Delete controls",
    "删除": "Delete",
    "仅删除这张卡片": "Delete this card only",
    "移除此文件导入的所有内容": "Remove everything imported from this file",
    "删除这张卡片？": "Delete this card?",
    "仅移除当前卡片，原始材料与历史记录仍然保留。": "Only the current card will be removed. Source material and history will remain.",
    "确认删除": "Confirm deletion",
    "正在删除…": "Deleting…",

    "添加职位描述": "Add a job description",
    "职位描述导入": "Import a job description",
    "输入方式": "Input method",
    "职位描述输入方式": "Job-description input method",
    "文件": "File",
    "粘贴文本": "Paste text",
    "在此粘贴职位描述…": "Paste the job description here…",
    "职位链接": "Job link",
    "选填": "Optional",
    "职位信息工作区": "Job information workspace",
    "NON_AUTHORITATIVE WORKING JOB · 保存前不会成为正式职位": "NON-AUTHORITATIVE WORKING JOB · It is not a confirmed job until you save it",
    "职位名称": "Job title",
    "公司": "Company",
    "地点": "Location",
    "任职要求": "Requirements",
    "任职要求（每行一条）": "Requirements (one per line)",
    "保存职位": "Save job",
    "模型职位是非权威 Working 信息。你可以继续对话或编辑；只有“保存职位”会创建不可变的已确认版本。": "Model-generated job information is non-authoritative Working content. You can continue the conversation or edit it; only “Save job” creates an immutable confirmed version.",
    "询问当前 Working Job": "Ask about this Working Job",
    "询问这份职位或它与你当前资料的关系": "Ask about this job or how it relates to your current profile",
    "职位结构化草稿": "Structured job draft",
    "结果来自本地确定性抽取，可能保留未知字段；请以原始职位材料为准逐条审核。": "This draft comes from local deterministic extraction and may retain unknown fields. Review every item against the original job material.",
    "确认发送职位材料": "Confirm sending job material",
    "原始来源已经保存在本机。确认后，系统会先进行只读技术解析；图片导入会把有界文本证据与按顺序排列的原始图片发送给下方选定的模型进行职位语义理解。PDF 将完整逐页转图后发送，超过完整处理上限时会停止。": "The original source is already saved on this device. After confirmation, Ariadne first performs read-only technical preparation. For image imports, bounded text evidence and the original images in order are sent to the selected model below for semantic understanding. PDFs are converted and sent in full, page by page; processing stops if the full-document limit is exceeded.",
    "ARIADNE AI 未能完成职位理解；没有保存模型职位提案，也没有自动执行本地整理。": "ARIADNE AI could not finish understanding the job. No model job proposal was saved, and no local fallback was run.",
    "原件会继续保留。可以稍后重试，或在“运行方式”连接可用模型后继续。": "The source file remains saved. Try again later, or connect an available model under “Run mode” and continue.",
    "打开运行方式": "Open run mode",

    "职位描述 / 职位上下文": "Job Descriptions / Job Context",
    "投递记录 ·": "Application record ·",
    "结束结果（可选）": "Final outcome (optional)",
    "备注（可选）": "Notes (optional)",
    "记录投递反馈或下一步安排": "Record application feedback or next steps",
    "保存备注": "Save notes",
    "职位智能分析": "Job analysis",
    "仅限当前职位": "Current job only",
    "每次对话都会读取当前职位版本与当前个人资料；未确认的 Working 信息会明确标注，不会写入正式个人资料。": "Each conversation reads the current job version and personal profile. Unconfirmed Working information is clearly marked and is not written into your confirmed profile.",
    "拒绝建议": "Reject suggestion",
    "询问当前职位": "Ask about this job",
    "例如：这份职位最核心的三个要求是什么？": "For example: What are the three most important requirements for this role?",

    "个人资料 / 个人理解": "Personal Profile / Personal Understanding",
    "＋ 添加资料": "+ Add material",
    "随资料与补充更新": "Updated with your materials and additions",
    "我目前如何理解你": "How I currently understand you",
    "更新理解": "Update understanding",
    "正在读取个人资料…": "Loading personal profile…",
    "开始对话 ↓": "Start a conversation ↓",
    "你已保存的补充": "Your saved additions",
    "这些信息会用于之后的个人对话和职位分析。资料原文与模型推断仍分别保留。": "This information will be used in future personal conversations and job analysis. Source material and model inferences remain separate.",
    "查看补充的历史版本": "View addition history",
    "了解我对话": "Understand Me conversation",
    "围绕过去的项目、你的职责与做事方式跨资料讨论，也可以随时补充。需要记住的信息会先放到下方，由你确认保存。": "Discuss past projects, your responsibilities, and how you work across your materials, or add context at any time. Anything Ariadne should remember appears below for you to review and save first.",
    "关于这些信息或许你想问": "Questions you may want to ask",
    "开始讨论": "Start a discussion",
    "你目前如何理解我": "How do you currently understand me?",
    "资料之间的联系": "Connections across my materials",
    "补充一点关于我": "Add something about me",
    "查看更早对话": "View earlier messages",
    "待确认的资料卡变更": "Profile-card changes awaiting confirmation",
    "待确认的个人补充": "Personal additions awaiting confirmation",
    "讨论经历或补充个人信息": "Discuss experience or add personal information",
    "聊聊你的经历…": "Talk about your experience…",
    "问题、相关个人资料及对话历史将发送至当前模型；更新理解可能分批调用并产生 API 费用。": "Your question, relevant personal materials, and conversation history will be sent to the current model. Updating understanding may require multiple API calls and incur charges.",
    "结合我的不同资料，你目前如何理解我的经历？哪些地方还不确定？": "Based on my materials, how do you currently understand my experience, and what remains uncertain?",
    "不同资料之间，有哪些互补或相互矛盾的信息需要我澄清？": "What complementary or conflicting information across my materials should I clarify?",
    "我想补充一条个人信息：": "I want to add something about myself:",

    "职位描述 / 职位概况": "Job Descriptions / Overview",
    "先理解职位本身": "Understand the jobs first",
    "更新概况": "Update overview",
    "汇总你添加的职位描述，梳理职责、要求、共同点与差异。这里专注职位；你的项目与经历在个人理解中讨论。": "Summarize the job descriptions you added and identify responsibilities, requirements, common ground, and differences. This page focuses on jobs; discuss your projects and experience under Personal Understanding.",
    "正在读取职位…": "Loading jobs…",
    "开始跨职位对话": "Start a cross-job conversation",
    "查看本次范围内的全部职位描述": "View every job description in this scope",
    "了解职位概况对话": "Job-overview conversation",
    "可以对比多个职位描述、讨论岗位类型与要求差异。概况和讨论不会改写原职位描述，也不会读取或修改个人资料。": "Compare job descriptions and discuss differences in role types and requirements. The overview and conversation do not rewrite source job descriptions or read or modify your personal profile.",
    "总结全部职位描述": "Summarize all job descriptions",
    "共性与差异": "Common ground and differences",
    "回顾我的项目与经历": "Review my projects and experience",
    "讨论全部职位描述": "Discuss all job descriptions",
    "聊聊这些职位…": "Talk about these jobs…",
    "请总结我添加的全部职位描述，说明各自重点和共同要求。": "Summarize all the job descriptions I added, explaining each role's focus and their common requirements.",
    "这些职位有哪些共同点和关键差异？哪些信息还不明确？": "What do these jobs have in common, what are the key differences, and what remains unclear?",

    "一个开源 AI 职业探索工作空间：先理解个人资料，再理解目标岗位，保留原件与来源，由你审阅并保存变化。": "An open-source AI workspace for career exploration: understand your personal materials first, then target roles, while preserving sources and letting you review and save every change.",
    "跳到正文": "Skip to main content",
    "Ariadne 工作空间": "Ariadne workspace",
    "关于页导航": "About-page navigation",
    "可以做什么": "What it does",
    "本地运行": "Run locally",
    "进入应用": "Open app",
    "给职业探索，一条清晰的线索。": "A clear thread through career exploration.",
    "衡": "Discernment",
    "中文名": "Chinese name",
    "先理解你，": "Understand you first,",
    "再理解机会。": "then understand the opportunity.",
    "把分散的经历、作品与目标职位放在一起，": "Bring scattered experiences, work, and target roles together",
    "看清已有的支持、尚待澄清的问题，以及下一步。": "to see the evidence you have, what still needs clarity, and what comes next.",
    "进入工作空间": "Enter workspace",
    "从名字开始了解": "Start with the name",
    "每段经历，都有来处。": "Every experience has a source.",
    "每一步，都由你决定。": "Every step is your decision.",
    "名字的来处": "Where the name comes from",
    "有线索，": "A thread to follow,",
    "也有分寸。": "and judgment in every choice.",
    "中文名「衡」，是衡量，也是在选择中把握分寸。看清自己的经历与机会，在能力、期待与现实之间认真权衡，再按自己的目标做决定。": "The Chinese name “衡” evokes weighing evidence and exercising judgment. See your experience and opportunities clearly, balance ability, expectations, and reality, then decide according to your own goals.",
    "Ariadne 的英文名字借用了古希腊神话中引路的线团：她把线团交给忒修斯，让他能循着线索走出迷宫。": "The English name Ariadne comes from the guiding thread in Greek mythology: she gave Theseus a thread so he could find his way out of the labyrinth.",
    "英文名典故": "The English name",
    "Ariadne 是引路的线索，「衡」是面对选择时的判断。两个名字共同表达一种期待：了解自己，也看清机会。": "Ariadne is the thread that guides; “衡” is the judgment used when choosing. Together, the names express a hope: understand yourself and see opportunities clearly.",
    "Ariadne 希望帮你把这些线索连接起来。": "Ariadne helps you connect these threads.",
    "目的地与取舍，始终由你决定。": "The destination and trade-offs are always yours to decide.",
    "里面有什么": "What's inside",
    "理解你的经历，": "Understand your experience",
    "也读懂眼前的机会。": "and the opportunity in front of you.",
    "先分别了解你和职位，": "Understand you and the role separately first,",
    "再讨论它们之间的关系。": "then discuss how they relate.",
    "你的个人资料": "Your personal profile",
    "汇集简历、作品集、项目材料与其他经历。查看来源、整理后的内容，并通过编辑与对话补充和校准。": "Bring together résumés, portfolios, project materials, and other experience. Review sources and organized content, then add context and make corrections through editing and conversation.",
    "支持 PDF、Word（DOCX）、PNG、JPG 等文件，每个文件最大 30 MB。具体处理能力取决于所选运行方式。": "Supports PDF, Word (DOCX), PNG, JPG, and other files up to 30 MB each. Exact processing capabilities depend on the selected run mode.",
    "查看个人资料": "View personal profile",
    "你选择的职位": "Jobs you choose",
    "添加职位原文或文件，梳理职责、要求和不明确的地方。围绕一个具体机会建立可追溯的职位上下文。": "Add original job text or files to clarify responsibilities, requirements, and unknowns. Build a traceable context around a specific opportunity.",
    "职位资料单独维护，关注一个机会不意味着你已经确定长期目标。": "Job materials are maintained separately. Exploring one opportunity does not mean you have chosen it as a long-term goal.",
    "查看职位描述": "View job descriptions",
    "有依据的讨论": "Evidence-grounded discussion",
    "结合当前个人资料讨论职位，区分能力、证据、表达与相关性问题。看见依据与未知，再决定是否补充资料或调整内容。": "Discuss a job using your current profile, distinguishing ability, evidence, presentation, and relevance. See both evidence and unknowns before deciding whether to add material or adjust content.",
    "模型修改先形成可审阅的草稿，由你明确保存后才成为确认版本。": "Model changes first become reviewable drafts and only become confirmed versions when you explicitly save them.",
    "产品原则": "Product principles",
    "缺少证据，不等于缺少能力。": "Missing evidence is not the same as missing ability.",
    "每一个建议，都应该有来处。": "Every suggestion should have a source.",
    "在自己的电脑上": "On your own computer",
    "把这条线索，": "Keep the thread",
    "留在自己手中。": "in your own hands.",
    "在 Codex 安装 Ariadne Skill，打开自己的独立窗口。直接进入工作空间，使用个人资料、职位和对话。": "Install the Ariadne Skill in Codex and open it in a separate window. Go straight to the workspace to use personal materials, jobs, and conversations.",
    "安装 Ariadne Skill": "Install the Ariadne Skill",
    "关闭最后窗口即停止本次服务，已保存资料保留。首次安装会检查 Mac 环境和所需依赖。": "Closing the last window stops the service and keeps saved materials. The first installation checks your Mac environment and required dependencies.",
    "通过 Skill 开始。": "Get started with the Skill.",
    "安装 Skill": "Install Skill",
    "在安装页复制指令，粘贴到 Codex 并发送，让它安装并检查环境。": "Copy the prompt on the installation page, paste it into Codex, and send it so Codex can install the Skill and check the environment.",
    "打开独立窗口": "Open a separate window",
    "在 Codex 中输入：": "In Codex, enter:",
    "直接使用本机 Codex，无需选择模型首页。关闭最后窗口即可退出，已保存资料保留。": "Use Codex on this device directly, without a model-selection page. Close the last window to exit; saved materials remain.",
    "独立窗口需要 macOS 14+、Python 3.9+ 和 Apple 命令行开发工具；Codex 分析还需要兼容 CLI、本人登录和 Poppler。旧 App、Skill 和网页版的资料不自动同步。": "The separate window requires macOS 14+, Python 3.9+, and Apple Command Line Tools. Codex analysis also requires a compatible CLI, your own login, and Poppler. Data from the old app, Skill, and web app does not sync automatically.",
    "开始之前": "Before you start",
    "你可能还想知道": "You may also want to know",
    "需要注册账号吗？": "Do I need an account?",
    "无需注册 Ariadne 账号。网页版使用你自己的 API Key；本地 Skill 使用本机 Codex，打开后直接进入工作空间。": "No Ariadne account is required. The web app uses your own API key; the local Skill uses Codex on your device and opens directly into the workspace.",
    "资料会发送给谁？": "Who receives my material?",
    "网页资料保存在当前浏览器，Skill 资料保存在本机文件库。未连接 AI 时不调用外部模型；分析会按你的操作和传输确认，把所需资料交给对应服务商处理，并可能产生模型费用。普通讨论不会自动改写已确认的资料。": "Web data is stored in the current browser, while Skill data is stored in a local file library. No external model is called while AI is disconnected. When you request and confirm analysis, the required material is sent to the relevant provider and may incur model charges. Ordinary conversation never rewrites confirmed information automatically.",
    "它会替我选择工作或自动投递吗？": "Will it choose a job or apply for me?",
    "Ariadne 帮你理解资料、解释差异并讨论下一步。当前没有自动投递功能；目标职位、材料取舍和是否保存修改都由你决定。": "Ariadne helps you understand material, explain differences, and discuss next steps. It does not apply for jobs automatically. You choose target roles, what to include, and whether to save changes.",
    "换一个浏览器，资料会跟着过去吗？": "Does my data follow me to another browser?",
    "当前版本没有跨设备账号同步。浏览器、访问地址或端口变化，都会进入不同的本地存储空间。请保留原始文件，并在日常使用时保持同一个浏览器和访问地址。": "The current version has no cross-device account sync. A different browser, address, or port uses a different local storage space. Keep your original files and use the same browser and address for everyday work.",
    "开始使用": "Get started",
    "从你已有的经历出发。": "Start with the experience you already have.",
    "进入 Ariadne": "Enter Ariadne",
    "回到顶部": "Back to top",

    "在 Codex 中通过 Ariadne Skill 打开完整本地页面，保留资料库与人工审阅，无需安装 Mac App。": "Use the Ariadne Skill in Codex to open the complete local interface, with its material library and human review flow, without installing a Mac app.",
    "安装 Ariadne · 衡 Skill": "Install the Ariadne Skill",
    "返回运行选择": "Back to run-mode selection",
    "Ariadne · 网页 + Skill": "Ariadne · Web + Skill",
    "先安装 Ariadne Skill。": "Install the Ariadne Skill first.",
    "先把下面的安装指令交给 Codex，完成安装与依赖检查；再调用 Skill，直接进入独立窗口中的个人资料、职位和对话。无需另外安装 Ariadne App。": "Give the installation prompt below to Codex and let it finish installation and dependency checks. Then launch the Skill to open your personal materials, jobs, and conversations directly in a separate window. No separate Ariadne app is required.",
    "点击「复制安装指令」，打开 Codex，将指令粘贴到对话中并发送。Codex 会获取完整 Skill、核对文件并安装；已有版本先备份。": "Select “Copy installation prompt,” open Codex, paste the prompt into a conversation, and send it. Codex downloads the complete Skill, verifies its files, and installs it after backing up any existing version.",
    "等 Codex 确认安装和依赖检查完成，再在对话中输入并发送": "After Codex confirms that installation and dependency checks are complete, enter and send",
    "。Skill 在 Mac 上打开独立窗口，直接显示工作空间；无需配对码，也不使用 Codex 内置浏览器。": ". The Skill opens a separate window on your Mac and shows the workspace directly; no pairing code or embedded Codex browser is used.",
    "无需选择模型，Skill 使用本机 Codex。缺少登录或 PDF 工具时会明确提示，已保存资料仍可查看。": "There is no model-selection step; the Skill uses Codex on your device. Missing login or PDF tools are reported clearly, while saved materials remain available.",
    "在窗口中管理资料和职位；发送材料仍需确认，结果由你审阅保存。关闭最后窗口或按 ⌘Q 自动停止 Ariadne，已保存资料保留。": "Manage personal materials and jobs in the window. Sending material still requires confirmation, and you review and save the results. Closing the last window or pressing ⌘Q stops Ariadne while keeping saved data.",
    "Skill 包含完整页面和运行代码，不捆绑芯片专用程序。独立窗口需要 macOS 14+、Apple 命令行开发工具和 Python 3.9+，首次按本机芯片编译窗口程序；使用 Codex 分析还需兼容 CLI、本人登录和 Poppler。首版接入 Codex，其他 Agent 与原生 Windows 尚未验证。": "The Skill contains the complete interface and runtime code, without bundling a chip-specific binary. The separate window requires macOS 14+, Apple Command Line Tools, and Python 3.9+; its window program is compiled for your Mac on first use. Codex analysis also requires a compatible CLI, your own login, and Poppler. The first release supports Codex; other agents and native Windows have not yet been verified.",
    "也可以直接": "You can also",
    "使用公开网页版": "use the public web app",
    "和自己的 API Key。网页不连接本机 Agent；使用本机 Codex 请打开 Skill 独立窗口。旧 Mac App、本地 Skill 和公开网页的资料不自动同步。": "with your own API key. The web app does not connect to a local agent; open the Skill window to use Codex on your device. Data from the old Mac app, local Skill, and public web app does not sync automatically.",
    "本地入口已改为 Skill。": "The local entry point is now the Skill.",
    "1. 先安装：前往安装页，复制安装指令，粘贴到 Codex 对话中并发送，让它安装并检查依赖。": "1. Install first: open the installation page, copy the prompt, paste it into a Codex conversation, and send it so Codex can install the Skill and check dependencies.",
    "前往安装页 · 复制安装指令": "Open installation page · Copy installation prompt",
    "2. 安装完成后调用：在 Codex 中输入并发送": "2. Launch after installation: in Codex, enter and send",
    "，直接进入本地工作空间。": " to enter the local workspace directly.",
    "3. 在窗口中添加资料或职位材料，再围绕材料提问；结果由你审阅保存。": "3. Add personal or job material in the window, then ask questions about it. You review and save the results.",
    "网页版仅使用 API；本地资料在 Skill 中保存。原网页配对入口已停止使用。": "The web app uses APIs only; local data is saved by the Skill. The former web pairing entry point has been retired.",
    "返回网页版": "Back to web app",

    "Gemini · 图文验证": "Gemini · Multimodal verification",
    "连接 Gemini": "Connect Gemini",
    "图文验证已准备完成；在本次测试获批前不会向模型服务商发出请求。API 密钥不会发送给 Ariadne 服务端，也不会写入网址、日志、IndexedDB 或本机钥匙串。": "Multimodal verification is ready. No request is sent to the model provider before you approve this test. The API key is not sent to Ariadne's server or written to the URL, logs, IndexedDB, or the local keychain.",
    "Gemini API 密钥": "Gemini API key",
    "仅本次连接使用": "Used for this connection only",
    "开始图文验证": "Start multimodal verification",
    "获取 Gemini API 密钥（Google AI Studio）↗": "Get a Gemini API key (Google AI Studio) ↗",
    "查看 API 密钥获取与安全说明": "View API-key setup and security guidance",
    "Gemini API 密钥获取与安全说明": "Gemini API-key setup and security guidance",
    "返回 Gemini 连接": "Back to Gemini connection",
    "Ariadne · API 密钥指南": "Ariadne · API-key guide",
    "获取 Gemini API 密钥": "Get a Gemini API key",
    "前往": "Open",
    "Google AI Studio API 密钥页面 ↗": "Google AI Studio API-key page ↗",
    "创建或选择你的密钥。": "Create or select your key.",
    "在 Ariadne 的 Gemini 连接页输入密钥；本页面不会保存它。": "Enter the key on Ariadne's Gemini connection page; this page does not save it.",
    "只在理解 Gemini 数据与计费规则后，主动发送测试或职业资料。": "Only send a test or career material after you understand Gemini's data and billing terms.",
    "官方资料：": "Official resources:",
    "Gemini API 密钥安全说明 ↗": "Gemini API-key security guidance ↗",
    "Gemini 模型列表 ↗": "Gemini model list ↗",

    "对话记录": "Conversation history",
    "调整输入框高度": "Resize message field",
    "上下拖动调整高度；方向键微调，Home 恢复": "Drag vertically to resize; use arrow keys for fine adjustments, or Home to reset",
    "请先勾选底部的资料传输与费用说明，再点击发送。": "Select the data-transfer and cost notice at the bottom before sending.",
    "当前没有需要补充的问题。": "There are no questions to clarify right now.",
    "完成理解后，需要补充的问题会显示在这里。": "Questions that need clarification will appear here after analysis.",
    "模型没有发现可形成卡片的候选信息。": "The model did not find candidate information that could form a card.",
    "职位理解完成后，可以在这里继续对话。": "Continue the conversation here after the job has been understood.",
    "原件保存在工作区，发送模型前需确认": "Source files stay in the workspace; confirmation is required before sending them to a model",
    "保存原件，或选择已存材料交给 AI 分析。": "Save source files, or choose saved material for AI analysis.",
    "点击进入导入页面，建立期望职位卡片。": "Open the import page to create a target-job card.",
    "待审核 · 演示": "Review needed · Demo",
    "演示数据": "Demo data",
    "需要确认": "Needs confirmation",
    "其他经历": "Other experience",
    "工作经历": "Work experience",
    "项目经历": "Project experience",
    "教育经历": "Education",
    "核心能力": "Core skills",
    "获奖经历": "Awards",
    "语言能力": "Languages",
    "暂无摘要": "No summary yet",
    "未记录": "Not recorded",
    "来源待核对": "Source needs verification",
    "来源未记录": "Source not recorded",
    "未设置": "Not set",
    "（空）": "(empty)",
    "地点未明确": "Location not specified",
    "暂无职位描述。": "No job descriptions yet.",
    "暂无历史版本。": "No version history yet."
    ,"验证并切换": "Verify and switch"
    ,"稍后": "Not now"
    ,"API Key 保存在当前浏览器。你确认发起请求后，Key 与本次材料经 Ariadne 网站服务转发至 DeepSeek。Key 不在服务端持久保存，上传材料仅作临时处理。请在自己的设备使用。": "Your API key is stored in this browser. After you confirm a request, the key and material for that request are relayed to DeepSeek through the Ariadne website service. The key is not stored on the server, and uploaded material is processed only temporarily. Use Ariadne on your own device."
    ,"点击连接将发送一张固定测试图片，可能产生少量 API 费用；不会发送你的个人材料。": "Connecting sends one fixed test image and may incur a small API charge. None of your personal material is sent."
    ,"获取 DeepSeek API Key": "Get a DeepSeek API key"
    ,"未连接": "Not connected"
    ,"快捷导航": "Quick navigation"
    ,"关闭介绍，返回工作空间": "Close introduction and return to workspace"
    ,"资料详情": "Material details"
    ,"关闭详情": "Close details"
    ,"编辑当前内容": "Edit current content"
    ,"关闭导入": "Close import"
    ,"本地资料详情": "Local material details"
    ,"先理解你，再理解机会。": "Understand you first, then understand the opportunity."
    ,"安装 Ariadne Skill · Mac 独立窗口": "Install the Ariadne Skill · Separate Mac window"
    ,"Ariadne · 衡是一个帮助你探索职业方向的工具。它理解你的经历与作品，也理解你选择的职位，帮你看清两者的关系。": "Ariadne is a tool for exploring career directions. It understands your experience and work as well as the jobs you choose, helping you see how they relate."
    ,"在个人资料中点击「了解我」，围绕过去的项目与经历逐步了解你；在职位描述中点击「了解职位概况」，汇总所有 JD 的职责、要求与差异。想讨论自己与某个职位的关系，可以进入该职位详情。": "Select “Understand Me” in Personal Profile to build an understanding across your past projects and experience. Select “Understand My Jobs” under Job Descriptions to summarize responsibilities, requirements, and differences across all jobs. To discuss how you relate to one job, open that job's details."
    ,"原件、资料和对话保存在本机或当前浏览器。选择 API 模型并确认发送后，本次材料和 API Key 会经当前 Ariadne 服务转发给模型服务商；网页版经过网站服务器。Key 不在服务端持久保存，上传材料仅作临时处理；结果会短暂保留在内存中以处理重试。本地 Skill 使用 Codex，材料由你自己的电脑发送给 OpenAI。": "Source files, profile data, and conversations are stored on this device or in the current browser. After you select an API model and confirm sending, the material for that request and your API key are relayed to the model provider through the current Ariadne service; the web app uses the website server. The key is not stored on the server, uploaded material is processed only temporarily, and results are held in memory briefly to handle retries. The local Skill uses Codex, with material sent to OpenAI from your own computer."
    ,"仅保存原件，不识别、不分析。接入 AI 后可继续。": "Save source files only, without recognition or analysis. Continue after connecting AI."
    ,"本轮待发送附件": "Attachments to send in this turn"
    ,"添加图片或文件": "Add an image or file"
    ,"添加图片或文件，也可直接粘贴图片或拖入文件": "Add an image or file, paste an image, or drag in a file"
    ,"选择模型与推理强度：Local": "Choose model and reasoning effort: Local"
    ,"Local · 继承默认设置": "Local · Inherit default settings"
    ,"选择模型": "Choose model"
    ,"同意将所选附件发送给 当前模型 / 未选择 用于本轮对话，可能消耗额度。附件不会自动保存到个人资料或职位。": "I agree to send the selected attachments to Current model / Not selected for this conversation, which may use model quota. Attachments are not automatically saved to my personal profile or jobs."
    ,"未投递": "Not applied"
    ,"已投递": "Applied"
    ,"推进中": "In progress"
    ,"已结束": "Closed"
    ,"选择投递状态": "Choose application status"
    ,"暂不填写": "Not specified"
    ,"简历未通过": "Résumé rejected"
    ,"面试未通过": "Interview unsuccessful"
    ,"已入职": "Joined"
    ,"主动放弃": "Withdrew"
    ,"岗位关闭": "Role closed"
    ,"其他结果": "Other outcome"
    ,"本次处理未完成，没有生成替代回复或保存个人事实。你可以重试；原始资料与历史仍保留。": "This process did not finish. No substitute reply was generated and no personal facts were saved. You can retry; source materials and history remain available."
    ,"可直接讨论当前职位；资料较多时会分批理解。": "You can discuss the current jobs now; larger collections are understood in batches."
    ,"概况已更新；结论为模型理解。": "The overview is up to date; its conclusions are model interpretations."
    ,"还没有可汇总的职位描述。添加真实职位描述后，可以在这里一起讨论。演示卡片不纳入概况。": "There are no job descriptions to summarize yet. Add real job descriptions to discuss them here. Demo cards are excluded from the overview."
    ,"Local · 查看已保存概况": "Local · View saved overview"
    ,"从整体概况、岗位共性或某几份职位描述的差异开始。这里不读取个人资料。": "Start with the overall picture, common role patterns, or differences among specific job descriptions. Personal profile data is not read here."
    ,"当前为 Local。选择可用模型后，可以汇总与讨论职位。": "The current mode is Local. Choose an available model to summarize and discuss jobs."
    ,"概况分批汇总全部当前职位描述；对话按预算选取详细证据，保留原文和历史。": "The overview summarizes all current job descriptions in batches. Conversations select detailed evidence within the context budget while preserving source text and history."
    ,"尚无个人资料。可以添加文件，也可以从对话中补充。": "There is no personal profile yet. Add files or provide context in the conversation."
    ,"从你做过的项目开始，聊聊当时负责什么、怎么做、为什么这样做。你的补充会帮助我逐步了解你。": "Start with a project you worked on: what you were responsible for, how you approached it, and why. Your additions help Ariadne understand you over time."
    ,"尚未保存补充。对话中的建议只有经你确认，才会出现在这里。": "No additions have been saved. Suggestions from conversations appear here only after you confirm them."
    ,"Local · 查看已保存内容": "Local · View saved content"
    ,"这里的对话围绕你已添加的资料展开，可以跨文件讨论，也可以直接补充新的个人信息。": "This conversation is grounded in the materials you added. You can discuss information across files or add new personal context directly."
    ,"当前为 Local。切换到已验证的模型后，可以综合资料与对话。": "The current mode is Local. Switch to a verified model to synthesize your materials and conversation."
    ,"原始资料长期保留；每轮加载当前证据、资料目录与预算内的对话原话，有有效整体理解时复用。": "Source materials are retained. Each turn loads current evidence, the material directory, and verbatim conversation within the context budget, reusing a valid overall understanding when available."

    ,"本地 Skill 只使用当前 Agent；API 连接请使用网页版。": "The local Skill uses the current agent only. Use the web app for API connections."
    ,"Codex 暂不可用，已保存资料仍可查看。请回到 Agent 运行 Ariadne doctor，检查登录和依赖后重新打开。": "Codex is temporarily unavailable, but saved materials can still be viewed. Return to the agent and run Ariadne doctor, check login and dependencies, then reopen Ariadne."
    ,"Codex 暂不可用，请在 Agent 中检查 Ariadne 登录和依赖后重新打开。": "Codex is temporarily unavailable. Check Ariadne login and dependencies in the agent, then reopen Ariadne."
    ,"网站的 API 服务暂不可用，请稍后重试或使用本地版。": "The website API service is temporarily unavailable. Try again later or use the local version."
    ,"网页预览版每份 PDF 最多 5 MB，更大的文件请使用本地版。": "The web preview supports PDFs up to 5 MB each. Use the local version for larger files."
    ,"网页预览版每份 PDF 最多 16 页，更长的文件请使用本地版。": "The web preview supports PDFs up to 16 pages each. Use the local version for longer files."
    ,"这份 PDF 转图后超过网页预览容量，请使用本地版完整分析。": "This PDF exceeds the web preview capacity after page rendering. Use the local version for complete analysis."
    ,"网页预览版一次最多处理 4 份 PDF，请减少本次附件。": "The web preview can process up to four PDFs at a time. Remove some attachments and try again."
    ,"PDF 未能完整读取，请使用无密码且可正常打开的 PDF，或使用本地版。": "The PDF could not be read completely. Use an unprotected PDF that opens normally, or use the local version."
    ,"本次材料超过网页预览容量，请减少文件数量，或使用本地版。": "This material exceeds the web preview capacity. Reduce the number of files or use the local version."
    ,"请先在连接设置中填写并验证你自己的 API Key。": "Enter and verify your own API key in Connection Settings first."
    ,"网站正在处理其他请求，请稍后手动重试。": "The website is processing other requests. Try again manually in a moment."
    ,"本页已有请求正在处理，请等待完成。": "A request on this page is already running. Wait for it to finish."
    ,"本次连接的处理次数已达上限，请稍后重新打开页面。": "This connection has reached its processing limit. Reopen the page later."
    ,"请求内容已变化，请重新确认材料后再分析。": "The request content changed. Confirm the material again before analyzing."
    ,"这次分析已经执行，结果缓存已失效；请先核对已有结果，再决定是否重新付费分析。": "This analysis already ran, but its result cache expired. Review any existing result before deciding whether to pay for another analysis."
    ,"原件未能完整读取，请核对文件；复杂 Word 文档可导出为 PDF 后重试。": "The source file could not be read completely. Check the file; for complex Word documents, export to PDF and try again."
    ,"网页版单次材料总量约限 30 MB，请减少本次文件数量后重试。": "The web app accepts about 30 MB of material per request. Reduce the number of files and try again."
    ,"网页版需要使用你自己验证过的 API 连接；本地 Agent 请通过 Ariadne Skill 使用。": "The web app requires an API connection you have verified. Use the Ariadne Skill for a local agent."

    ,"正在准备连接验证…": "Preparing connection verification…"
    ,"正在验证图文输入能力…": "Verifying multimodal input…"
    ,"验证成功": "Verification succeeded"
    ,"验证失败，请重试。": "Verification failed. Try again."
    ,"选择模型服务": "Choose a model provider"
    ,"重试连接": "Retry connection"
    ,"浏览器无法保存 API Key，请允许本站存储后重试。": "The browser could not save the API key. Allow site storage and try again."
    ,"测试 PDF 未能完整转图，请检查服务端 PDF 工具后重试。": "The test PDF could not be rendered completely. Check the server PDF tools and try again."
    ,"模型未完整通过两页读图与 JSON 验证，请重试或检查模型权限。": "The model did not fully pass the two-page image and JSON verification. Retry or check model access."
    ,"当前网站尚未提供此模型服务，请更新网站部署后重试。": "This model provider is not available in the current website deployment. Update the deployment and try again."
    ,"服务额度或请求频率受限，请检查余额、配额后重试。": "The provider limited quota or request rate. Check balance and quota, then try again."
    ,"验证失败，请检查 API Key、服务地区、模型权限或稍后重试。": "Verification failed. Check the API key, service region, and model access, or try again later."
    ,"连接失败：请检查 Gemini API Key。": "Connection failed: check the Gemini API key."
    ,"连接失败：浏览器无法直接访问 Gemini。": "Connection failed: the browser cannot reach Gemini directly."
    ,"连接失败：Gemini 暂时不可用。": "Connection failed: Gemini is temporarily unavailable."
    ,"连接失败：当前账号没有可用的图文模型。": "Connection failed: this account has no available multimodal model."
    ,"连接失败：Gemini 未接受图文验证请求。": "Connection failed: Gemini did not accept the multimodal verification request."
    ,"连接失败：无法读取 Gemini 返回内容。": "Connection failed: Gemini's response could not be read."
    ,"连接失败：Gemini 返回了空内容。": "Connection failed: Gemini returned an empty response."
    ,"连接失败：模型未正确读取测试图片。": "Connection failed: the model did not read the test image correctly."
    ,"连接失败：请检查 DeepSeek 凭据。": "Connection failed: check the DeepSeek credentials."
    ,"连接失败：无法访问 DeepSeek。": "Connection failed: DeepSeek could not be reached."
    ,"连接失败：DeepSeek 暂时不可用。": "Connection failed: DeepSeek is temporarily unavailable."
    ,"连接失败：该模型当前不可用。": "Connection failed: this model is currently unavailable."
    ,"该模型不符合图片和 PDF 接入要求。": "This model does not meet the image and PDF requirements."
    ,"该模型的连接协议尚未确认。": "This model's connection protocol has not been verified."
    ,"连接失败：服务返回异常。": "Connection failed: the service returned an unexpected response."
    ,"连接失败：请重试。": "Connection failed. Try again."
    ,"当前模型不符合图片和 PDF 接入要求，或尚未完成 Ariadne 适配验证。请重新选择模型。": "The current model does not meet the image and PDF requirements or has not completed Ariadne adapter verification. Choose another model."
    ,"图片 / PDF 导入 · 职位 / 候选人对话": "Image / PDF import · Job / candidate conversations"
    ," · 自己的 Codex 账号": " · Your Codex account"
    ," · 自己的 API": " · Your own API"
    ,"复制指令后，粘贴到 Codex 并发送，即可开始安装。": "After copying the prompt, paste it into Codex and send it to begin installation."
    ,"安装包暂不可用，请关闭后重试。网页版仍可使用。": "The installation package is temporarily unavailable. Close this window and try again; the web app remains available."
    ,"安装指令已复制。请粘贴到 Codex 并发送，安装将由 Codex 执行。": "Installation prompt copied. Paste it into Codex and send it; Codex will perform the installation."
    ,"未能自动复制。请复制已选中的安装指令，再粘贴到 Codex 并发送。": "Automatic copying failed. Copy the selected installation prompt, then paste it into Codex and send it."

    ,"当前职位来源": "Current job source"
    ,"正在读取职位材料": "Reading job material"
    ,"正在理解职位内容": "Understanding job content"
    ,"正在提取职位要求": "Extracting job requirements"
    ,"正在生成职位信息": "Generating job information"
    ,"职位材料已准备": "Job material is ready"
    ,"职位内容已读取": "Job content has been read"
    ,"模型已完成理解": "The model finished understanding"
    ,"Working Job 已生成": "Working Job generated"
    ,"正在保存…": "Saving…"
    ,"已保存为不可变职位版本。": "Saved as an immutable job version."
    ,"职位版本已经变化，请重新打开后保存。": "The job version changed. Reopen it before saving."
    ,"保存失败，请重试。": "Save failed. Try again."
    ,"取消本次理解": "Cancel this analysis"
    ,"职位要求已提取": "Job requirements extracted"
    ,"已从真实来源生成非权威 Working Job；编辑或继续对话后，由你保存为正式职位。": "A non-authoritative Working Job was created from the real source. Edit or continue the conversation, then save it as a confirmed job when ready."
    ,"本次 ARIADNE AI 职位理解已取消；没有保存模型职位提案，也没有执行本地整理。": "This ARIADNE AI job analysis was canceled. No model job proposal was saved, and no local fallback was run."
    ,"替换": "Replace"
    ,"职位描述 · ARIADNE AI 提案": "Job Description · ARIADNE AI Proposal"
    ,"职位描述 · 本地结构化草稿": "Job Description · Local Structured Draft"
    ,"模型理解结果": "Model interpretation"
    ,"本地整理结果": "Local organization result"
    ,"ARIADNE AI 职位提案": "ARIADNE AI Job Proposal"
    ,"模型结果来自真实职位来源，尚未成为正式职位；请逐字段审核。": "The model result comes from a real job source and is not yet a confirmed job. Review every field."
    ,"当前草稿已处理，继续审核下一条。": "This draft has been handled. Continue to the next item."
    ,"全部职位草稿已审核；确认内容已保存为不可变职位版本。": "All job drafts have been reviewed; confirmed content was saved as immutable job versions."
    ,"职位列表更新失败，请重试。": "The job list could not be updated. Try again."
    ,"投递记录已在其他页面更新。你的输入仍保留，可复制后点击取消重新读取。": "The application record was updated on another page. Your input is preserved; copy it, then select Cancel to reload the record."
    ,"投递备注已保存。": "Application notes saved."
    ,"正在取消本次 ARIADNE AI 理解": "Canceling this ARIADNE AI analysis"
    ,"原件保存中": "Saving source files"
    ,"可以询问岗位要求、证据差距、项目或简历表达；结论不会自动改写职位或个人资料。": "Ask about role requirements, evidence gaps, projects, or résumé wording. Conclusions never rewrite jobs or personal information automatically."
    ,"正在理解…": "Understanding…"
    ,"正在基于当前职位与当前个人资料分析…": "Analyzing the current job and personal profile…"
    ,"职位或个人资料已变化，这次结果未保存；请基于最新内容重试。": "The job or personal profile changed, so this result was not saved. Try again with the latest content."
    ,"职位或个人资料已变化，请重试。": "The job or personal profile changed. Try again."
    ,"分析已保存；所请求的原始来源不可用，结论已按缺失来源处理。": "Analysis saved. A requested source was unavailable, and conclusions account for the missing source."
    ,"分析已保存；任何职位修改仍需你确认。": "Analysis saved. Any job change still requires your confirmation."
    ,"服务版本已更新，请刷新页面后重试。": "The service version was updated. Refresh the page and try again."
    ,"这次模型分析失败；没有使用本地替代结果，也没有修改职位或个人资料。": "This model analysis failed. No local substitute was used, and no job or personal information was changed."
    ," · 原始来源可恢复": " · Original source available"
    ,"修改已保存到当前本地演示记录。": "Changes were saved to the current local demo record."
    ,"职位已经变化，这条建议已过期，未保存。": "The job changed, so this suggestion is stale and was not saved."
    ,"建议已拒绝；职位版本没有变化。": "Suggestion rejected; the job version did not change."
    ,"已移除此来源导入的所有职位内容；同批其他来源不受影响。": "Removed all job content imported from this source. Other sources in the same batch are unaffected."
    ,"已移除当前职位卡片；来源身份保持不变。": "Removed the current job card; source identity remains unchanged."

    ,"职位标识无效。": "The job identifier is invalid."
    ,"职位跟进记录无法读取，请保留数据后重试。": "The application record could not be read. Preserve the data and try again."
    ,"这项职位的阶段已在其他页面更新，请重新打开后修改。": "This job's stage was updated on another page. Reopen it before making changes."
    ,"请选择有效阶段，备注最多 300 字。": "Choose a valid stage; notes may contain up to 300 characters."
    ,"结束结果只适用于已结束的职位。": "A final outcome only applies to closed jobs."
    ,"职位列表无法排序。": "The job list could not be sorted."
    ,"浏览器无法保存职位阶段。": "The browser could not save the job stage."
    ,"职位阶段数据库无法打开。": "The job-stage database could not be opened."
    ,"请关闭其他旧页面后重试。": "Close other old pages and try again."
    ,"职位阶段读取失败，请重试。": "The job stage could not be read. Try again."
    ,"阶段保存失败，原记录仍保留。请重试。": "The stage could not be saved. The original record remains; try again."
    ,"无法读取可用模型，请检查本地服务或连接。": "Available models could not be loaded. Check the local service or connection."
    ,"选择模型与推理强度": "Choose model and reasoning effort"
    ,"当前处于 Local 模式。请先在连接设置选择模型。": "Ariadne is in Local mode. Choose a model in Connection Settings first."
    ,"请先打开一份资料或职位。": "Open a personal material or job first."
    ,"暂无可用模型，请检查连接。": "No model is available. Check the connection."
    ,"当前对话已变化，请重新打开模型菜单。": "The conversation changed. Reopen the model menu."
    ,"正在等待模型响应": "Waiting for the model"
    ,"来源文件暂不可用": "The source file is temporarily unavailable"
    ,"有几处信息可以稍后确认": "Some details can be clarified later"
    ,"点击回答": "Select to answer"
    ,"你的回答": "Your answer"
    ,"回答将用于更新这张卡片的草稿，核对后由你保存。": "Your answer will update this card's draft. Review it before saving."
    ,"正在处理…": "Processing…"
    ,"回答": "Answer"
    ,"正在处理这条回答…": "Processing this answer…"
    ,"回答已提交；如果仍需补充，请查看下方对话。": "Answer submitted. If more context is needed, check the conversation below."
    ,"资料已变化，回答尚未应用。请核对最新问题后重试。": "The material changed, so the answer was not applied. Review the latest question and try again."
    ,"这次未完成，回答已保留，请重试。": "This did not finish. Your answer is preserved; try again."
    ,"内容已在其他页面更新，请刷新后再保存。": "Content was updated on another page. Refresh before saving."
    ,"文件内容与保存记录不一致，请保留原文件并核对；本次没有覆盖它。": "The file contents do not match the saved record. Keep and verify the original file; it was not overwritten."
    ,"工作区中的文件暂时找不到，请恢复原文件后重试。": "A workspace file is temporarily missing. Restore the original file and try again."
    ,"工作区迁移未完成，旧记录仍保留，请重试或检查迁移记录。": "Workspace migration did not finish. Old records remain; retry or inspect the migration record."
    ,"无法完成工作区读写，请检查本机服务和磁盘空间，重连后刷新核对。": "Workspace reading or writing could not finish. Check the local service and disk space, reconnect, then refresh and verify."
    ,"文件内容不符合输出契约，请重新生成": "The file content does not match the output contract. Generate it again."
    ,"文件输出版本不兼容，请刷新后重试": "The file-output version is incompatible. Refresh and try again."
    ,"页数超出导出范围": "The page count exceeds the export limit."
    ,"图片数据无效": "The image data is invalid."
    ,"回复为空或超过 4 万字，请分段导出": "The reply is empty or longer than 40,000 characters. Export it in sections."
    ,"排版资源未加载，请刷新后重试": "Layout resources did not load. Refresh and try again."
    ,"浏览器不支持图片导出": "This browser does not support image export."
    ,"回复超过 32 页，请分段导出": "The reply exceeds 32 pages. Export it in sections."
    ,"生成文件 · 非确认资料 · 未经外部事实核验": "Generated file · Unconfirmed material · Not externally fact-checked"
    ,"图片生成失败，请重试": "Image generation failed. Try again."
    ,"图解类型无效": "The diagram type is invalid."
    ,"浏览器不支持图解生成": "This browser does not support diagram generation."
    ,"Ariadne · 衡 / 模型图解 · 非确认资料": "Ariadne / Model diagram · Unconfirmed material"
    ,"图解生成失败": "Diagram generation failed."
    ,"正在生成文件…": "Generating file…"
    ,"成果": "Outcome"
    ,"职责": "Responsibilities"
    ,"专业": "Field of study"
    ,"成绩": "Grade"
    ,"结果": "Result"
    ,"颁发方": "Issuer"
    ,"能力": "Skill"
    ,"分类": "Category"
    ,"组织": "Organization"
    ,"角色": "Role"
    ,"背景": "Context"
    ,"产出": "Deliverable"
    ,"补充信息": "Additional information"
    ,"经历与背景": "Experience and background"
    ,"个人偏好": "Personal preferences"
    ,"已确认目标": "Confirmed goals"
    ,"理解修正": "Corrections to understanding"
    ,"相关资料或记忆已经变化。这次结果未保存，请基于最新内容重试。": "Related materials or memories changed. This result was not saved; try again with the latest content."
    ,"当前模型或资料传输确认已变化，请核对运行方式后重试。": "The current model or data-transfer confirmation changed. Check the run mode and try again."
    ,"本轮内容超过处理预算，请缩小问题范围。原始资料仍然保留。": "This turn exceeds the processing budget. Narrow the question; source materials remain available."
    ,"相同的补充已经保存，无需重复添加。可以暂不采纳这条重复建议。": "The same addition is already saved and does not need to be added again. You can decline this duplicate suggestion."
    ,"这条建议已经处理，请查看最新的个人补充。": "This suggestion has already been handled. Check the latest personal additions."
    ,"还需要澄清": "Needs clarification"
    ,"已停止使用，历史保留": "No longer used; history retained"
    ,"已保存": "Saved"
    ,"修改这条补充": "Edit this addition"
    ,"不再使用": "Stop using"
    ,"其他资料": "Other material"
    ,"待确认的新资料卡": "New profile card awaiting confirmation"
    ,"待确认的资料卡修改": "Profile-card change awaiting confirmation"
    ,"类型": "Type"
    ,"负责内容": "Responsibilities"
    ,"事实（每行“标签：内容”）": "Facts (one “label: content” pair per line)"
    ,"确认保存资料卡": "Confirm and save card"
    ,"暂不采纳": "Decline"
    ,"确认停止使用这条补充": "Confirm stopping use of this addition"
    ,"你的原话：": "Your words:"
    ,"原有内容：": "Previous content:"
    ,"将停止用于之后的分析；历史仍保留": "It will no longer be used in future analysis; history remains available"
    ,"确认内容，可在保存前修改": "Review the content and edit it before saving"
    ,"确认停止使用": "Confirm stop using"
    ,"来自原对话的个人补充。请核对下面的原话，再发送整理；尚未保存为个人事实。": "Personal context from the original conversation. Review your words below, then send them for organization; nothing has been saved as a personal fact yet."
    ,"请先在首页选择可用模型。": "Choose an available model on the home page first."
    ,"正在准备当前个人资料…": "Preparing the current personal profile…"
    ,"尚无可综合的个人资料，可以先添加资料或补充信息。": "There is no personal information to synthesize yet. Add material or context first."
    ,"当前理解已与资料一致，无需重复调用模型。": "The current understanding already matches the materials; there is no need to call the model again."
    ,"你选择不再使用这条补充。": "You chose to stop using this addition."
    ,"已保存。后续个人对话与职位分析会读取最新补充；历史版本保留。": "Saved. Future personal conversations and job analysis will read the latest addition; version history remains available."
    ,"已暂不采纳，个人确认信息没有变化。": "Declined. Confirmed personal information did not change."
    ,"已暂不采纳，个人资料卡没有变化。": "Declined. Personal profile cards did not change."

    ,"这个 Word 文件含暂不能完整读取的图表或嵌入对象，请导出为 PDF 后重试。": "This Word file contains charts or embedded objects that cannot be read completely yet. Export it as PDF and try again."
    ,"Word 文件无法完整读取，请确认是未加密的 DOCX，或导出为 PDF 后重试。": "The Word file could not be read completely. Make sure it is an unencrypted DOCX, or export it as PDF and try again."
    ,"附件展开后内容过多（合计最多 48 张图片或 PDF 页、12 万字），请分批发送；没有截断发送。": "Expanded attachments contain too much content (up to 48 images or PDF pages and 120,000 characters total). Send them in batches; nothing was sent in truncated form."
    ,"图片无法读取，或超过模型单张图片 20 MB 的传输限制，请压缩图片后重试。": "The image could not be read or exceeds the model's 20 MB per-image transfer limit. Compress it and try again."
    ,"PDF 无法完整转为页面图片，请确认文件未加密且可以打开，再重试。": "The PDF could not be rendered completely into page images. Make sure it is unencrypted and opens normally, then try again."
    ,"附件未发送成功，请检查格式、总大小与传输确认后重试；已选附件保留。": "The attachments were not sent. Check format, total size, and transfer confirmation, then try again. Selected attachments remain available."
    ,"每轮最多 4 个附件，单个及合计最大 30 MB。": "Each turn supports up to four attachments, with a 30 MB limit per file and in total."
    ,"支持 PDF、DOCX、PNG、JPG、TXT、Markdown；文件不能为空。": "Supported formats: PDF, DOCX, PNG, JPG, TXT, and Markdown. Files cannot be empty."
    ,"当前模型": "Current model"
    ,"未选择": "Not selected"
    ,"附件正在发送，请稍候。": "Attachments are being sent. Please wait."
    ,"请先选择模型，并勾选本轮附件的传输确认。": "Choose a model and select the attachment-transfer confirmation for this turn."
    ,"请解读本轮附件。": "Please interpret the attachments in this turn."
    ,"本轮未完成，附件保留，可以重试。": "This turn did not finish. Attachments remain available; you can retry."
    ,"本轮未完成，附件已恢复；请重新确认后重试。": "This turn did not finish. The attachments were restored; confirm the transfer again and retry."
    ,"项目材料": "Project material"
    ,"项目说明": "Project description"
    ,"其他材料": "Other material"
    ,"本地测试资料": "Local test material"
    ,"浏览器本地文件": "Local browser file"
    ,"本地粘贴文本": "Locally pasted text"
    ,"图片": "Image"
    ,"文本": "Text"
    ,"材料": "Material"
    ,"本地运行": "Local"
    ,"模型": "Model"
    ,"未分类信息": "Uncategorized information"
    ,"公司 / 机构": "Company / Organization"
    ,"学校": "School"
    ,"无法确认这张卡片对应的原始文件。": "The source file for this card could not be confirmed."
    ,"原始文件已不存在，无需再次删除。": "The source file no longer exists and does not need to be deleted again."
    ,"这张卡片已不存在。": "This card no longer exists."
    ,"这张卡片已被移除。": "This card has been removed."
    ,"卡片已在其他操作中更新，请重新打开后再试。": "The card was updated by another action. Reopen it and try again."
    ,"暂不支持这种文件格式。": "This file format is not supported yet."
    ,"文件大小不符合本地导入要求。": "The file size does not meet local import requirements."
    ,"文件大小不符合导入要求。": "The file size does not meet import requirements."
    ,"无法读取这个本地文件。": "This local file could not be read."
    ,"每个文件最大支持 30 MB；请压缩后重试。": "Each file can be up to 30 MB. Compress it and try again."
    ,"每个文件最大支持 30 MB。": "Each file can be up to 30 MB."
    ,"保存的来源组无效；操作已停止。": "The saved source group is invalid. The action was stopped."
    ,"原始文件的本地引用不存在；操作已停止。": "The local reference to the source file is missing. The action was stopped."
    ,"原始文件的本地引用无效；操作已停止。": "The local reference to the source file is invalid. The action was stopped."
    ,"原始文件的本地引用无法由当前版本解析；操作已停止。": "The current version cannot resolve the local source-file reference. The action was stopped."
    ,"原始文件的本地引用与来源身份不一致；操作已停止。": "The local source-file reference does not match the source identity. The action was stopped."
    ,"原始来源记录不存在；操作已停止。": "The source record is missing. The action was stopped."
    ,"原始来源记录不是正式 SourceDocument；操作已停止。": "The source record is not a canonical SourceDocument. The action was stopped."
    ,"本地保存的原始文件不存在；操作已停止。": "The locally saved source file is missing. The action was stopped."
    ,"本地保存的原始文件无法读取；操作已停止。": "The locally saved source file cannot be read. The action was stopped."
    ,"本地保存的原始文件记录无效；操作已停止。": "The locally saved source-file record is invalid. The action was stopped."
    ,"原始文件完整性校验失败；操作已停止。": "Source-file integrity verification failed. The action was stopped."
    ,"原始文件解析能力不可用；操作已停止。": "Source-file resolution is unavailable. The action was stopped."
    ,"浏览器本地来源存储不可用；操作已停止。": "Local browser source storage is unavailable. The action was stopped."
    ,"浏览器未能读取原始文件；操作已停止。": "The browser could not read the source file. The action was stopped."
    ,"原始文件未能完整保存；没有记录为可持久恢复的来源。": "The source file was not saved completely and was not recorded as a durably recoverable source."
    ,"来源身份与旧版记录冲突；未覆盖任何已有资料。": "The source identity conflicts with a legacy record. No existing material was overwritten."
    ,"来源身份与已有正式记录冲突；未覆盖任何已有资料。": "The source identity conflicts with an existing canonical record. No existing material was overwritten."
    ,"当前运行方式不支持这次模型整理；没有发送材料。": "The current run mode does not support this model analysis. No material was sent."
    ,"当前模型导入支持图片、PDF 和 DOCX。": "The current model import supports images, PDFs, and DOCX files."
    ,"Word 文件含暂不能完整读取的图表或嵌入对象，请导出为 PDF 后重试。": "The Word file contains charts or embedded objects that cannot be read completely yet. Export it as PDF and try again."
    ,"Word 文件无法读取，请确认是未加密且可以正常打开的 DOCX。": "The Word file could not be read. Make sure it is an unencrypted DOCX that opens normally."
    ,"Word 文件解压后内容过大，请拆分文件后重试。": "The expanded Word file is too large. Split it and try again."
    ,"文件内容超过完整处理预算，请拆分后重试；未截断发送。": "The file exceeds the full-processing budget. Split it and try again; no truncated content was sent."
    ,"当前模型导入只支持 PDF 文件。": "The current model import supports PDF files only."
    ,"无法从本机恢复当前材料；没有发送材料。": "The current material could not be recovered from this device. No material was sent."
    ,"发送前需要你的明确确认。": "Your explicit confirmation is required before sending."
    ,"当前文件或运行方式已变化；请重新确认。": "The current file or run mode changed. Confirm again."
    ,"模型凭据引用无效；没有发送材料。": "The model credential reference is invalid. No material was sent."
    ,"无法连接本机连接器，请检查它是否运行及浏览器本地网络权限。没有改用其他模型。": "The local connector could not be reached. Check that it is running and that the browser has local-network access. No other model was used."
    ,"本机连接已过期或撤销，请重新配对。": "The local connection expired or was revoked. Pair it again."
    ,"尚未配置当前模型服务的 API 凭据；没有发送材料。": "API credentials for the current model provider are not configured. No material was sent."
    ,"PDF 页面无法完整渲染；没有发送不完整内容。": "The PDF pages could not be rendered completely. Incomplete content was not sent."
    ,"模型请求超过本地服务允许的大小；没有发送材料。": "The model request exceeds the size allowed by the local service. No material was sent."
    ,"PDF 内容校验失败；没有发送材料。": "PDF content validation failed. No material was sent."
    ,"图片或 PDF 内容校验失败；没有发送材料。": "Image or PDF content validation failed. No material was sent."
    ,"图片或 PDF 无法发送给图文模型；没有发送材料。": "The image or PDF could not be sent to the multimodal model. No material was sent."
    ,"PDF 来源身份校验失败；没有发送材料。": "PDF source identity validation failed. No material was sent."
    ,"连接模型失败；未保存任何模型提案。": "The model connection failed. No model proposal was saved."
    ,"模型分析超过等待时限；原件已保留，未保存任何模型提案。可以重试，无需重新上传。": "Model analysis exceeded the wait limit. Source files remain, and no model proposal was saved. You can retry without uploading again."
    ,"模型未能完成这次请求；未保存任何模型提案。": "The model could not complete this request. No model proposal was saved."
    ,"模型返回内容超过安全上限；未保存任何模型提案。": "The model response exceeded the safety limit. No model proposal was saved."
    ,"模型返回内容无法解析；未保存任何模型提案。": "The model response could not be parsed. No model proposal was saved."
    ,"服务商返回的模型身份与所选模型不一致；未保存任何模型提案。": "The provider returned a model identity that does not match the selected model. No model proposal was saved."
    ,"模型结果未通过运行契约校验；未保存任何模型提案。": "The model result failed runtime-contract validation. No model proposal was saved."
    ,"模型提案未通过结构校验；未保存任何模型提案。": "The model proposal failed structural validation. No model proposal was saved."
    ,"模型提案缺少有效来源依据；未保存任何模型提案。": "The model proposal lacks valid source evidence. No model proposal was saved."
    ,"当前处理已被更新；旧模型结果没有写入。": "The current process was updated. The old model result was not written."
    ,"模型提案未能完整保存；没有形成待审核内容。": "The model proposal was not saved completely, so no review item was created."
    ,"操作未完成，请重试。": "The action did not finish. Try again."
    ,"正在处理": "Processing"
    ,"查看工作区": "View workspace"
    ,"使用模型分析": "Analyze with model"
    ,"原件已保存": "Source files saved"
    ,"可以先保存原件。AI 分析需选择一份受支持的材料，并接入可用模型。": "You can save source files first. AI analysis requires one supported material and an available model."
    ,"模型结果只进入待审核工作区": "Model results enter the review workspace only"
    ,"仅保存原始材料；不调用模型服务商": "Save source material only; do not call a model provider"
    ,"请完成下方审核": "Complete the review below"
    ,"查看 Working Job": "View Working Job"
    ,"职位已保存": "Job saved"
    ,"使用人工智能解析": "Analyze with AI"
    ,"模型分析暂不可用；仍可保存原始材料，稍后继续。": "Model analysis is temporarily unavailable. You can still save source material and continue later."
    ,"原始来源已持久保留 · Provider 负责语义理解": "Source preserved durably · Provider performs semantic understanding"
    ,"本地文件": "Local file"
    ,"返回导入": "Back to import"
    ,"关于": "About"
    ,"已删除卡片，原始材料与历史记录仍然保留。": "Card deleted. Source material and history remain available."
    ,"卡片已删除，但列表更新失败，请刷新页面。": "The card was deleted, but the list could not be updated. Refresh the page."
    ,"卡片已发生变化，请取消并刷新页面后重试。": "The card changed. Cancel, refresh the page, and try again."
    ,"模型未发现可形成 Working Card 的候选信息。": "The model did not find candidate information that could form a Working Card."
    ,"可以讨论资料，也可以直接要求修改。支持结合上文说明范围与例外；修改先保留在草稿，核对后由你保存。": "Discuss the material or request changes directly. You can clarify scope and exceptions using the conversation above; changes remain drafts until you review and save them."
    ,"当前材料": "Current material"
    ,"暂无现有信息": "No current information"
    ,"材料已准备": "Material is ready"
    ,"这版候选人信息已保存。": "This version of the candidate information is saved."
    ,"正在拒绝…": "Rejecting…"
    ,"正在确认…": "Confirming…"
    ,"当前内容已处理，继续审核下一条。": "This item has been handled. Continue to the next item."
    ,"全部内容已审核并保存为候选信息。": "All content has been reviewed and saved as candidate information."
    ,"全部待审核内容已处理。": "All review items have been handled."
    ,"正在等待模型时不会改用本地结果": "No local substitute is used while waiting for the model"
    ,"仅保存原件 · 不进行识别或分析": "Save source files only · No recognition or analysis"
    ,"原件保存未完成，请重试；已成功保存的文件会保留。": "Source-file saving did not finish. Try again; successfully saved files remain available."
    ,"取消本次分析": "Cancel this analysis"
    ,"正在准备材料": "Preparing material"
    ,"等待模型理解": "Waiting for model understanding"
    ,"整理候选卡片": "Organizing candidate cards"
    ,"正在校验本机保存的原始材料": "Validating locally saved source material"
    ,"正在准备原始图片": "Preparing original images"
    ,"正在准备 Word 正文和内嵌图片": "Preparing Word text and embedded images"
    ,"正在准备完整 PDF 渲染页面": "Preparing fully rendered PDF pages"
    ,"模型正在理解材料": "The model is understanding the material"
    ,"Candidate Working Cards 已生成": "Candidate Working Cards generated"
    ,"模型未发现可形成卡片的候选信息": "The model did not find candidate information that could form a card"
    ,"模型没有发现可形成卡片的候选信息。": "The model did not find candidate information that could form a card."
    ,"没有发现可形成卡片的信息": "No information suitable for a card was found"
    ,"没有可保存的候选人信息。": "There is no candidate information to save."
    ,"已取消本次模型分析": "This model analysis was canceled"
    ,"本次模型分析已取消；没有保存新的模型提案。": "This model analysis was canceled. No new model proposal was saved."
    ,"请等当前对话完成后再回答，输入已保留。": "Wait for the current conversation to finish before answering. Your input is preserved."
    ,"请先确认或取消左侧卡片编辑，再回答这个问题。输入已保留。": "Confirm or cancel the card edit on the left before answering. Your input is preserved."
    ,"已选择材料；保存原件后可随时回来继续。": "Material selected. Save the source file to continue later."
    ,"正在取消本次模型分析": "Canceling this model analysis"
    ,"待审核 · 演示": "Review needed · Demo"
    ,"未填写": "Not provided"
    ,"这是非权威 Working 修改；确认保存前，个人资料中的已确认版本保持不变。": "This is a non-authoritative Working change. The confirmed version in your personal profile remains unchanged until you save."
    ,"上次对话已中断，请重新发送。": "The previous conversation was interrupted. Send it again."
    ,"当前材料的对话上下文尚不可用；不会改用本地结果。": "Conversation context for this material is not available yet. No local substitute will be used."
    ,"演示材料不建立真实模型会话。": "Demo material does not create a real model conversation."
    ,"内容已经变化，请刷新后重新查看再保存。": "The content changed. Refresh and review it again before saving."
    ,"已暂不保存这版 Working 修改；个人资料中的已确认版本没有变化。": "This Working change was not saved. Confirmed information in the personal profile did not change."
    ,"已移除此文件导入的所有内容；现在可以重新导入同一文件。": "Removed everything imported from this file. You can now import the same file again."
    ,"已从个人资料中移除这张卡片；原始文件与提取记录仍然保留。": "Removed this card from the personal profile. The source file and extraction records remain available."
    ,"修改只保存到本地演示记录；未晋升为已确认候选信息。": "The change was saved only to the local demo record and was not promoted to confirmed candidate information."
    ,"来源证据": "Source evidence"
    ,"原始来源已保留": "Original source retained"
    ,"确认并创建职位版本": "Confirm and create job version"
    ,"卡片已移到列表末尾，备注可在详情中编辑。": "The card moved to the end of the list. Notes can be edited in its details."
    ,"本地来源": "Local source"
    ,"演示来源": "Demo source"
    ,"由 Ariadne Skill 使用本机 Codex。": "The Ariadne Skill uses Codex on this device."
    ,"切换模型服务请前往": "To switch model providers, open"
    ,"此对话设置": "This conversation's setting"
    ,"继承默认设置": "Inherit default setting"
    ,"历史职位已不在当前范围": "This historical job is no longer in the current scope"
    ,"未确认草稿": "Unconfirmed draft"
    ,"先了解这些职位各自在做什么，再比较共同要求与差异。": "Understand what each job involves first, then compare common requirements and differences."
    ,"还需要确认": "Needs confirmation"
    ,"尚未保存为正式职位": "Not yet saved as a confirmed job"
    ,"（基于当时职位版本的历史回答）": "(Historical answer based on the job versions at that time)"
    ,"正在读取当前职位…": "Reading current jobs…"
    ,"职位已经变化，本次结果未保存。请基于最新职位描述重试。": "The jobs changed, so this result was not saved. Try again with the latest job descriptions."
    ,"运行方式或资料传输确认已变化，请核对后重试。": "The run mode or data-transfer confirmation changed. Check it and try again."
    ,"本次处理未完成，没有生成替代回答或修改任何职位描述。原始资料与历史保留，可以重试。": "This process did not finish. No substitute answer was generated and no job description was changed. Source material and history remain available; you can retry."
    ,"请先添加真实职位描述。": "Add a real job description first."
    ,"当前职位没有变化，无需重复调用模型。": "The current jobs have not changed; there is no need to call the model again."
    ,"暂时无法读取职位，请重试。": "Jobs could not be loaded right now. Try again."
  });

  const RULES = Object.freeze([
    [/^对话会将当前个人资料、已保存补充、职位与相关历史发送至 (.+)；可能消耗额度。会尝试读取本轮消息中的公开链接，并将网页内容交给模型；不自动保存为个人事实。$/, (_, target) => `Your profile, saved notes, jobs and relevant history will be sent to ${target}; usage may incur charges. Public links in this message will be read when possible and shared with the model, without being saved as personal facts.`],
    [/^已读取当前页文字（节选），不含整站或图片$/, "Read an excerpt of this page's text; not the entire site or images"],
    [/^已读取当前页文字，不含整站或图片$/, "Read this page's text; not the entire site or images"],
    [/^其余 (\d+) 个链接未读取；每轮最多读取两个公开页面。$/, (_, count) => `${count} additional links were not read; at most two public pages per turn.`],
    [/^(\d+) 张资料卡片$/u, (_, count) => `${count} material ${count === "1" ? "card" : "cards"}`],
    [/^(\d+) 个职位对象$/u, (_, count) => `${count} job ${count === "1" ? "item" : "items"}`],
    [/^第 (\d+) /u, (_, number) => `Item ${number} `],
    [/^共 (\d+) /u, (_, number) => `${number} total `],
    [/^已从剪贴板添加 (\d+) 张图片。$/u, (_, count) => `Added ${count} ${count === "1" ? "image" : "images"} from the clipboard.`],
    [/^已从剪贴板添加 (\d+) 张图片到当前职位来源组。$/u, (_, count) => `Added ${count} ${count === "1" ? "image" : "images"} from the clipboard to this job's source group.`],
    [/^摘要：(.*)$/su, (_, value) => `Summary: ${value}`],
    [/^副标题：(.*)$/su, (_, value) => `Subtitle: ${value}`],
    [/^时间：(.*)$/su, (_, value) => `Date: ${value}`],
    [/^无法删除：(.*)$/su, (_, value) => `Could not delete: ${value}`],
    [/^保存未完成：(.*)$/su, (_, value) => `Save did not finish: ${value}`],
    [/^页面初始化失败：(.*)$/su, (_, value) => `Page initialization failed: ${value}`],
    [/^当前 (\d+) 份职位描述：(\d+) 份已保存，(\d+) 份未确认草稿。(.*)$/su, (_, total, saved, working, tail) => `There are ${total} job descriptions: ${saved} saved and ${working} unconfirmed drafts. ${translate(tail)}`],
    [/^当前版本 (\d+)$/u, (_, version) => `Current version ${version}`],
    [/^修改已保存为第 (\d+) 个确认版本；上一版本仍保留。$/u, (_, version) => `Changes were saved as confirmed version ${version}; the previous version remains available.`],
    [/^修改已保存为职位第 (\d+) 版；上一版本仍保留。$/u, (_, version) => `Changes were saved as job version ${version}; the previous version remains available.`],
    [/^建议已由你确认并保存为职位第 (\d+) 版；旧版本与分析来源仍保留。$/u, (_, version) => `You confirmed and saved the suggestion as job version ${version}; previous versions and analysis sources remain available.`],
    [/^Working 修改已由你确认并保存为第 (\d+) 个确认版本；上一版本仍保留。$/u, (_, version) => `You confirmed and saved the Working change as confirmed version ${version}; the previous version remains available.`],
    [/^(.*) · 分类标签：(.*) · (\d+) 条事实$/su, (_, title, category, count) => `${title} · Category: ${category} · ${count} ${count === "1" ? "fact" : "facts"}`],
    [/^(.*) · (\d+) 条要求$/su, (_, title, count) => `${title} · ${count} ${count === "1" ? "requirement" : "requirements"}`]
    ,[/^同意将所选附件发送给 (.*) 用于本轮对话，可能消耗额度。附件不会自动保存到个人资料或职位。$/su, (_, model) => `I agree to send the selected attachments to ${model} for this conversation, which may use model quota. Attachments are not automatically saved to my personal profile or jobs.`]
    ,[/^选择模型与推理强度：(.*)$/su, (_, model) => `Choose model and reasoning effort: ${model}`]
    ,[/^(\d+) 条当前有效$/u, (_, count) => `${count} currently active`]
    ,[/^已综合当前 (\d+) 条资料与补充 · 模型推断，可继续校准$/u, (_, count) => `Synthesized ${count} current materials and additions · Model inference, open to correction`]
    ,[/^已有 (\d+) 条资料与补充 · 整体理解待更新；可直接根据当前资料对话$/u, (_, count) => `${count} materials and additions available · Overall understanding needs an update; you can discuss the current materials now`]
    ,[/^(.*) · 版本 (\d+)$/su, (_, label, version) => `${translate(label)} · Version ${version}`]
    ,[/^(.*) · 版本 (\d+) · 关联资料已变化，暂不使用$/su, (_, label, version) => `${translate(label)} · Version ${version} · Related material changed; not currently used`]
    ,[/^(.*) · v(\d+) · 已停止使用，历史保留$/su, (_, label, version) => `${translate(label)} · v${version} · No longer used; history retained`]
    ,[/^(.*) · v(\d+) · 已保存$/su, (_, label, version) => `${translate(label)} · v${version} · Saved`]
    ,[/^(.*) · 保存前可以修改；确认后生成新的资料版本，原版本和对话依据保留。$/su, (_, reason) => `${reason} · You can edit before saving. Confirmation creates a new profile version while retaining the previous version and conversation evidence.`]
    ,[/^最近一轮：选取 (\d+)\/(\d+) 条详细证据，(\d+) 条节选。对话上下文 (\d+) KB；(\d+) 次模型调用。$/u, (_, included, total, excerpts, kb, calls) => `Latest turn: selected ${included}/${total} detailed evidence records, with ${excerpts} excerpts. Conversation context: ${kb} KB; ${calls} model calls.`]
    ,[/^理解已更新：复用 (\d+) 段摘要，重新理解 (\d+) 段。$/u, (_, reused, refreshed) => `Understanding updated: reused ${reused} summaries and reinterpreted ${refreshed}.`]
    ,[/^资料卡已保存为确认版本 (\d+)；原版本和对话依据仍保留。$/u, (_, version) => `The profile card was saved as confirmed version ${version}; the previous version and conversation evidence remain available.`]
    ,[/^(.*) 的缩略图$/su, (_, filename) => `Thumbnail of ${filename}`]
    ,[/^移除 (.*)$/su, (_, filename) => `Remove ${filename}`]
    ,[/^正在检查附件格式与模型能力…$/u, () => "Checking attachment formats and model capability…"]
    ,[/^正在读取并校验附件完整性…$/u, () => "Reading attachments and verifying their integrity…"]
    ,[/^附件已安全保存在本机；准备发送给 (.*)…$/su, (_, provider) => `Attachments are safely stored on this device; preparing to send them to ${provider}…`]
    ,[/^附件已安全保存在本机；正在发送给 (.*)…$/su, (_, provider) => `Attachments are safely stored on this device; sending them to ${provider}…`]
    ,[/^本轮已发送 (.*)给 (.*)；正在等待模型理解与回复…$/su, (_, files, provider) => `${files} were sent to ${provider} for this turn; waiting for the model to understand them and reply…`]
    ,[/^本轮 (.*) 已发送并处理完成；生成文件正在本轮回复中准备，可直接下载。$/su, (_, files) => `${files} were sent and processed in this turn. The generated file is being prepared in this reply and can be downloaded directly.`]
    ,[/^本轮 (.*) 已发送并处理完成；本轮回复已生成。$/su, (_, files) => `${files} were sent and processed in this turn. This turn's reply is ready.`]
    ,[/^正在读取(图片|PDF|材料)$/u, (_, kind) => `Reading ${translate(kind).toLowerCase()}`]
    ,[/^(图片|PDF|材料)已读取$/u, (_, kind) => `${translate(kind)} read`]
    ,[/^当前所选模型的(.*)能力尚未真实接通；操作已停用，不会生成模型样例，也不会静默改用本地结果。$/su, (_, subject) => `The selected model's ${subject} capability is not actually connected. This action is disabled; it will not generate a model sample or silently use a local substitute.`]
    ,[/^已保存 (\d+) 份原件，未识别或分析。接入 AI 后可从上方选择原件继续。$/u, (_, count) => `Saved ${count} source files without recognition or analysis. After connecting AI, choose a saved source above to continue.`]
    ,[/^已保存 (\d+) 份原件；当前选择已变化，新材料还需保存。$/u, (_, count) => `Saved ${count} source files. The current selection changed, and new material still needs to be saved.`]
    ,[/^已生成 (\d+) 张候选卡片$/u, (_, count) => `Generated ${count} candidate cards`]
    ,[/^已选择 (\d+) 份原件。$/u, (_, count) => `Selected ${count} source files.`]
    ,[/^(\d+) 个完全相同的文件已合并处理。$/u, (_, count) => `${count} identical files were merged for processing.`]
    ,[/^(\d+) 个来源已导入，不会重复生成。$/u, (_, count) => `${count} sources were already imported and will not be generated again.`]
    ,[/^(\d+) 个来源将恢复现有待审核草稿。$/u, (_, count) => `${count} sources will restore existing drafts awaiting review.`]
    ,[/^(\d+) 个字段需要确认$/u, (_, count) => `${count} fields need confirmation`]
    ,[/^第 (\d+) \/ (\d+) 条$/u, (_, current, total) => `Item ${current} of ${total}`]
    ,[/^打开(.*)的原始职位链接$/su, (_, title) => `Open the original job link for ${title}`]
    ,[/^(.*)的投递状态：(.*)$/su, (_, title, stage) => `${title} application status: ${translate(stage)}`]
    ,[/^“(.*)”已设为(.*)。(.*)$/su, (_, title, stage, tail) => `“${title}” was set to ${translate(stage)}. ${translate(tail)}`]
    ,[/^真实来源已保存在本地 · (\d+) 个字段需要确认；模型理解尚未成为正式职位。$/u, (_, count) => `The real source is saved locally · ${count} fields need confirmation; the model interpretation is not yet a confirmed job.`]
    ,[/^真实来源已保存在本地；模型理解尚未成为正式职位。$/u, () => "The real source is saved locally; the model interpretation is not yet a confirmed job."]
    ,[/^真实来源已保存在本地 · (\d+) 个字段需要确认；确定性抽取不代表语义保证。$/u, (_, count) => `The real source is saved locally · ${count} fields need confirmation; deterministic extraction does not guarantee semantic correctness.`]
    ,[/^真实来源已保存在本地；确定性抽取不代表语义保证。$/u, () => "The real source is saved locally; deterministic extraction does not guarantee semantic correctness."]
    ,[/^(.*) · 当前版本 (\d+)$/su, (_, title, version) => `${title} · Current version ${version}`]
    ,[/^(.*) · 未确认草稿$/su, (_, title) => `${title} · Unconfirmed draft`]
    ,[/^(.*) · 尚未保存为正式职位$/su, (_, location) => `${location} · Not yet saved as a confirmed job`]
    ,[/^最近一轮详细证据 (\d+)\/(\d+) 份，(\d+) 份节选；另参考当轮全量概况。上下文 (\d+) KB，(\d+) 次模型调用。$/u, (_, included, total, excerpts, kb, calls) => `Latest turn: ${included}/${total} detailed evidence records, with ${excerpts} excerpts, plus the complete overview for that turn. Context: ${kb} KB; ${calls} model calls.`]
    ,[/^概况已更新：复用 (\d+) 段摘要，新理解 (\d+) 段。$/u, (_, reused, refreshed) => `Overview updated: reused ${reused} summaries and created ${refreshed} new interpretations.`]
    ,[/^我想修正这条已保存的补充：“(.*)”。实际情况是：$/su, (_, value) => `I want to correct this saved addition: “${value}”. The actual situation is:`]
  ]);

  const originals = new WeakMap();
  const rendered = new WeakMap();
  const attributeOriginals = new WeakMap();
  const attributeRendered = new WeakMap();
  let observer = null;
  let locale = readLocale();

  function readLocale() {
    try { return root.localStorage?.getItem(STORAGE_KEY) === ENGLISH ? ENGLISH : CHINESE; }
    catch (_error) { return CHINESE; }
  }

  function translate(value) {
    const direct = EN[value];
    if (direct) return direct;
    for (const [pattern, replacement] of RULES) {
      if (pattern.test(value)) return value.replace(pattern, replacement);
    }
    return value;
  }

  function translatableNode(node) {
    const parent = node.parentElement;
    return parent && !parent.closest(SKIP_SELECTOR);
  }

  function localizeText(node, force = false) {
    if (!translatableNode(node)) return;
    const current = node.data;
    if (!force && rendered.get(node) === current) return;
    if (HAN.test(current) || Object.hasOwn(EN, current.trim())) originals.set(node, current);
    const source = originals.get(node);
    if (!source) return;
    const next = locale === ENGLISH ? source.replace(/^(\s*)(.*?)(\s*)$/su, (_, before, body, after) => `${before}${translate(body)}${after}`) : source;
    if (next !== current) { rendered.set(node, next); node.data = next; }
  }

  function localizeAttributes(element, force = false) {
    if (element.closest("[data-i18n='off']")) return;
    let sourceMap = attributeOriginals.get(element);
    let renderedMap = attributeRendered.get(element);
    for (const name of ATTRIBUTES) {
      if (!element.hasAttribute(name)) continue;
      const current = element.getAttribute(name);
      if (!force && renderedMap?.get(name) === current) continue;
      if (HAN.test(current) || Object.hasOwn(EN, current.trim())) {
        if (!sourceMap) { sourceMap = new Map(); attributeOriginals.set(element, sourceMap); }
        sourceMap.set(name, current);
      }
      const source = sourceMap?.get(name);
      if (!source) continue;
      const next = locale === ENGLISH ? translate(source) : source;
      if (next !== current) {
        if (!renderedMap) { renderedMap = new Map(); attributeRendered.set(element, renderedMap); }
        renderedMap.set(name, next); element.setAttribute(name, next);
      }
    }
  }

  function localizeTree(rootNode, force = false) {
    if (rootNode.nodeType === Node.TEXT_NODE) { localizeText(rootNode, force); return; }
    if (rootNode.nodeType !== Node.ELEMENT_NODE && rootNode.nodeType !== Node.DOCUMENT_NODE && rootNode.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (rootNode.nodeType === Node.ELEMENT_NODE) localizeAttributes(rootNode, force);
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) localizeText(node, force);
      else localizeAttributes(node, force);
    }
  }

  function renderSwitch() {
    let button = document.querySelector("[data-ariadne-language-switch]");
    if (!document.body?.hasAttribute("data-ariadne-language-entry")) {
      button?.remove();
      return;
    }
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "ariadne-language-switch";
      button.dataset.ariadneLanguageSwitch = "";
      button.dataset.i18n = "off";
      button.textContent = "EN/中";
      document.body.append(button);
      button.addEventListener("click", () => setLocale(locale === ENGLISH ? CHINESE : ENGLISH));
    }
    button.setAttribute("aria-label", locale === ENGLISH ? "Switch to Chinese" : "切换为英文");
    button.setAttribute("title", locale === ENGLISH ? "Switch to Chinese" : "切换为英文");
    button.setAttribute("aria-pressed", String(locale === ENGLISH));
  }

  function setLocale(next) {
    locale = next === ENGLISH ? ENGLISH : CHINESE;
    try { root.localStorage?.setItem(STORAGE_KEY, locale); } catch (_error) {}
    document.documentElement.lang = locale === ENGLISH ? "en" : CHINESE;
    document.documentElement.dataset.locale = locale;
    localizeTree(document, true);
    renderSwitch();
    document.dispatchEvent(new CustomEvent("ariadne:localechange", { detail: { locale } }));
  }

  function start() {
    document.documentElement.lang = locale === ENGLISH ? "en" : CHINESE;
    document.documentElement.dataset.locale = locale;
    localizeTree(document);
    renderSwitch();
    observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") localizeText(record.target);
        else if (record.type === "attributes") localizeAttributes(record.target);
        else for (const node of record.addedNodes) localizeTree(node);
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  }

  root.AriadneI18n = Object.freeze({
    locale: () => locale,
    setLocale,
    t: (chinese) => locale === ENGLISH ? translate(chinese) : chinese,
    translate,
    storageKey: STORAGE_KEY
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}(globalThis));
