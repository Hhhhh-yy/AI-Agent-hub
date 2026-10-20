/* ==========================================================================
   路线图数据 · 为「双非本硕 / AI Agent 方向」定制
   基准日：2026-10-09   投递日：2027-03-01
   说明：tasks[].level —— 1 基础 / 2 进阶 / 3 深挖
   ========================================================================== */
window.ROADMAP = {
  meta: {
    title: "AI Agent / 大模型应用开发 · 20 周冲刺计划",
    startDate: "2026-10-12",
    applyDate: "2027-03-01",
    autumnDate: "2027-09-01",
    graduateDate: "2028-06-30",
    hoursPerWeek: 14,
    subtitle: "以「能独立交付 + 有真实场景 + 长期稳定」为核心竞争力"
  },

  /* ---------------- 阶段 ---------------- */
  phases: [
    { id: "P0", weeks: "W1–W6", range: "2026-10-12 ~ 2026-11-22", name: "工程与认知打底",
      goal: "从「会改代码」变成「能独立建仓、写测试、打包部署、调模型」" },
    { id: "P1", weeks: "W7–W12", range: "2026-11-23 ~ 2027-01-03", name: "项目 A：RAG 全栈",
      goal: "交付一个真实问得动、有量化指标、能一键起的领域文献问答系统" },
    { id: "P2", weeks: "W13–W20", range: "2027-01-04 ~ 2027-02-28", name: "项目 B：Agent 系统",
      goal: "读懂 Agent 内核 → 判断工具/MCP 该暴露什么 → 记忆与失败回滚 → 任务级评测，并完成简历与八股" },
    { id: "P3", weeks: "W21–W32", range: "2027-03-01 ~ 2027-05-31", name: "边投边面 + 项目 C",
      goal: "拿到暑期实习 offer，同时把无人机课题做成差异化 Agent 项目" },
    { id: "P4", weeks: "W33–W42", range: "2027-06 ~ 2027-08", name: "暑期实习",
      goal: "实习转正考核 + 补齐微调/部署加分项", milestone: "—" },
    { id: "P5", weeks: "W43–W47+", range: "2027-08 ~ 2027-11", name: "秋招冲刺",
      goal: "提前批 + 正式批，拿正式 offer" },
    { id: "P6", weeks: "W48+", range: "2027-12 ~ 2028-06", name: "毕设与收尾",
      goal: "顺利毕业 + 入职准备 + 持续输出", milestone: "—" }
  ],

  /* ---------------- 里程碑 ---------------- */

  /* ---------------- 逐周任务 ---------------- */
  weeks: [
    /* ============ P0 ============ */
    {
      id: "W1", date: "10/12–10/18", title: "环境与交付起点", phase: "P0", hours: 12,
      goal: "从零跑通第一个能对话的 AI 程序，并学会把代码存到云端。工具够用就行，不追求精通。",
      depth: "能在 30 分钟内从零跑通一个「调用大模型」的脚本并看到它回话；能把代码 push 到 GitHub 并在网页上看到它；能说清「虚拟环境」解决了什么问题（不必背命令）。",
      tasks: [
        { id: "W1-1", level: 1, need: "key", box: 90, text: "跑通第一次大模型调用：30 行脚本，让程序回你一句话", desc: "先拿到「我能让 AI 干活」的成就感。用最朴素的 HTTP 请求，不装任何框架；跑通之后再回头逐行看懂" , starter: { have: "空的 agent-lab 文件夹、Python 已装好、一个可用的 API Key", want: "30 行内的 single 文件脚本，运行后终端打印出模型回的一句话", first: "先跑我给的 check_env.py，确认 openai 能 import 且 Key 读得到" }},
        { id: "W1-2", level: 1, need: "use", box: 45, text: "装 Python 3.12 + uv，配好 VS Code", desc: "装完能用就行，命令直接抄 AI 的。你只需会验证：uv --version 有输出、VS Code 能选到 3.12 解释器" },
        { id: "W1-3", level: 1, need: "use", box: 45, text: "Git 只学三个动作：add / commit / push（配好 SSH 免密）", desc: "只练「把今天的代码存到 GitHub」这一条路。分支、合并、PR、冲突这周一律不碰（已挪到 W6）。会看 git status 就够" },
        { id: "W1-4", level: 2, need: "key", box: 90, text: "写 3 个 30–80 行小脚本", desc: "文件批处理、调 LLM API 做摘要、JSON 读写统计。这是真本事，必须自己写" , starter: { have: "data/raw/ 下有 5 个 .txt（其中 1 个是 GBK 编码、2 个带页眉页脚），Python 环境就绪", want: "3 个脚本各 30–80 行，能一条命令串起来跑完，并在 data/clean/ 产出结果 + 一份报告", first: "先跑 inspect.py 看清每个文件的编码、行数、脏在哪，再决定清洗规则" }},
        { id: "W1-5", level: 2, need: "key", box: 90, text: "LeetCode 数组与哈希 3 题 + 复盘笔记", desc: "两数之和、字母异位词分组、最长连续序列（面试硬通货，不能外包给 AI）" },
        { id: "W1-6", level: 1, need: "use", box: 45, text: "建 notes/ 目录，写 week01 环境搭建笔记", desc: "重点记「我踩了什么坑、下次怎么避开」，以后面试讲「我怎么定位问题」用得上" }
      ]
    },
    {
      id: "W2", date: "10/19–10/25", title: "Python 语法速通", phase: "P0", hours: 14,
      goal: "从「能看懂」到「能写出带类型注解、有测试的模块」。",
      depth: "能不看教程写出模块化代码；能说清 pydantic 与 dataclass 的区别（校验 vs 数据容器）；余弦相似度能手算一个小例子；pytest 全绿。",
      tasks: [
        { id: "W2-1", level: 1, need: "key", box: 90, text: "类型注解 + dataclass + 常用内置数据结构", desc: "Optional/Union、泛型基础、不可变数据" },
        { id: "W2-2", level: 2, need: "key", box: 90, text: "pydantic v2 模型、字段校验、嵌套模型", desc: "后面做结构化输出与 API 全靠它" , starter: { have: "W1 写的 3 个脚本、纯 dict 处理数据", want: "把其中一个脚本的数据改成 pydantic 模型，字段校验失败时能给出明确报错", first: "先定义模型（只写字段和类型），再跑一次故意传错类型的测试看报错信息" }},
        { id: "W2-3", level: 1, need: "use", box: 45, text: "异常处理、logging、pathlib、推导式、f-string", desc: "别再用 print 调试，学会分级日志" },
        { id: "W2-4", level: 2, need: "use", box: 45, text: "把 W1 的三个脚本重构成 src/ 模块 + pyproject", desc: "函数拆分、单一职责、可被 import" },
        { id: "W2-5", level: 2, need: "key", box: 90, text: "写 6 个 pytest 用例覆盖上面的模块", desc: "含异常分支测试" , starter: { have: "W2-4 重构好的 src/ 模块", want: "6 个 pytest 用例全绿，其中至少 1 个测异常分支", first: "先只写 1 个最简单的用例跑通 pytest，再逐个补" }},
        { id: "W2-6", level: 1, need: "key", box: 90, text: "数学 1 小时：向量、点积、余弦相似度、范数", desc: "只求直觉与手算，不推公式" },
        { id: "W2-7", level: 2, need: "key", box: 90, text: "LeetCode 双指针 3 题", desc: "移动零、盛最多水的容器、三数之和" },
        { id: "W2-8", level: 1, need: "use", box: 45, text: "WSL2 装 Ubuntu（为 W6 的 Docker 铺路，命令问 AI 即可）", desc: "只要求能开、能用 cd/ls 走两步。15 条命令不必背——知道「有这些命令、要用时问 AI」就行" }
      ]
    },
    {
      id: "W3", date: "10/26–11/01", title: "Python 进阶与异步", phase: "P0", hours: 14,
      goal: "能写出生产级的批量调用工具（并发 + 重试 + 限流 + 成本统计）。",
      depth: "能解释 GIL 与线程/进程/协程的适用边界；能独立写出带 semaphore 限流、超时、重试、错误落盘的并发工具；能读懂别人的异步代码。",
      tasks: [
        { id: "W3-1", level: 2, need: "use", box: 45, text: "装饰器、生成器/迭代器、上下文管理器", desc: "理解可调用对象与惰性求值" },
        { id: "W3-2", level: 2, need: "key", box: 90, text: "async/await + httpx 并发请求", desc: "事件循环、Task、Semaphore 限流" , starter: { have: "一个能单次调用 LLM 的函数", want: "100 条文本并发请求，带 semaphore 限流、超时、失败重试，并打印总耗时", first: "先跑我给的基准脚本（串行 10 条），记下耗时，作为改造前的对照" }},
        { id: "W3-4", level: 1, need: "use", box: 45, text: "typer 写一个命令行入口", desc: "参数解析、帮助信息、进度条" },
        { id: "W3-5", level: 3, need: "key", box: 90, text: "实现 llm-batch 工具：100 条文本并发处理", desc: "读 CSV → 并发调模型 → JSONL 落盘 → 失败重试 → 输出 token 与成本统计" },
        { id: "W3-6", level: 2, need: "key", box: 90, text: "LeetCode 3 题（滑动窗口/二分）", desc: "无重复字符最长子串、找到字符串中所有字母异位词" },
        { id: "W3-7", level: 2, need: "key", box: 90, text: "AI 协作基本功：写一份能让 AI 落地的任务规格，再挑出它代码里的 2 个错", desc: "给 AI 一份含「输入输出示例 + 验收标准」的规格 → 让它实现 → 你逐行审并指出至少 2 处错漏。这是最不容易被替代的能力：AI 负责写，你负责定义「对」" },
      ]
    },
    {
      id: "W4", date: "11/02–11/08", title: "LLM 认知与本地推理", phase: "P0", hours: 14,
      goal: "建立对模型的「体感」：token、上下文、采样、成本、显存。工位笔记本只有 4GB 显存，本地大模型实验留给家里的台式机。",
      depth: "能一句话说清 token/上下文窗口/temperature 对输出的影响；能算清「4GB 显存 + 16GB 内存能跑什么、12GB 能跑什么」，并知道哪些实验必须等回家做；面对「为什么不用更大模型」能给出成本/延迟/效果三角答案。",
      tasks: [
        { id: "W4-1", level: 1, need: "key", box: 90, text: "读 hello-agents 前几章 + 一份官方 API 文档", desc: "重点看消息角色、上下文结构、工具调用字段" },
        { id: "W4-3", level: 2, need: "ai", box: 15, text: "搞懂「本地部署」是怎么回事：看一遍 Ollama/vLLM 的启动命令与显存账单，不必自己跑", desc: "台式机已改作游戏 + 文件整理机，不装 CUDA/PyTorch。这部分只求面试能讲清：本地部署省什么、贵在哪、什么场景才值得" },
        { id: "W4-4", level: 2, need: "key", box: 90, text: "写《模型选型与成本对比报告》", desc: "云端 3 家 + 本地模型，按价格/延迟/函数调用/上下文长度四维对比，必须是自测数据" },
        { id: "W4-5", level: 3, need: "skim", box: 15, text: "整理「显存与成本」账本：什么模型要多少显存、每百万 token 多少钱", desc: "面试硬知识 + 选型判断力。会算账比会部署值钱得多" },
      ]
    },
    {
      id: "W5", date: "11/09–11/15", title: "Prompt 与上下文工程", phase: "P0", hours: 14,
      goal: "能稳定地把模型输出约束成可校验的结构，并有准确率数字。",
      depth: "能写出稳定输出 JSON 的提示词并解释为什么还要加校验层；能说清「提示工程」与「上下文工程」的区别；手上有准确率与失败归因，面试可以直接讲。",
      tasks: [
        { id: "W5-1", level: 1, need: "key", box: 90, text: "系统提示词设计：角色、约束、输出格式、拒答边界", desc: "对比「宽松提示」与「强约束提示」的输出稳定性" },
        { id: "W5-2", level: 2, need: "key", box: 90, text: "few-shot 与 CoT 的对比实验", desc: "同一任务三种提示方式，记录准确率差异" },
        { id: "W5-3", level: 2, need: "use", box: 45, text: "结构化输出：会用 response_format / function calling 即可", desc: "模型自己越来越会吐 JSON，这块手艺在快速贬值。会调用 + 知道要加校验层就够" },
        { id: "W5-4", level: 2, need: "key", box: 90, text: "做一个 resume-parser：简历文本 → 结构化 JSON", desc: "教育/技能/项目/时间四类字段，用 pydantic 校验" , starter: { have: "10 份真实简历文本（可自己造，每份含教育/技能/项目/时间）", want: "输入简历文本 → 输出结构化 JSON，4 类字段齐全，pydantic 校验通过", first: "先跑我给的 sample_input.txt + 期望输出 JSON，对照着写 schema" }},
        { id: "W5-5", level: 3, need: "core", box: 240, text: "自建 20 条样本测字段抽取准确率 + 归因 3 个失败样例", desc: "失败原因要写成「模型错 / 提示词错 / 数据错」三类" , starter: { have: "20 份简历文本 + 已跑通的 resume-parser", want: "20 条跑完，输出准确率表格 + 3 个失败样例的原因分析", first: "先跑我给的小评测脚本，看它怎么逐条比对" } },
        { id: "W5-7", level: 2, need: "core", box: 240, text: "识别 AI 的失败模式：10 条输出逐条判「对 / 错 / 编」，总结 3 类系统性错误", desc: "幻觉不是随机的，它有模式。能说出「它在这类问题上必然出错」的人，才做得了评估与防护" , starter: { have: "10 条模型输出（从你项目里抽）", want: "逐条标「对/错/编」，归纳出 3 类系统性错误", first: "先只标 3 条，我陪你过一遍标注口径" } },
      ]
    },
    {
      id: "W6", date: "11/16–11/22", title: "Docker 收口与 M1 验收", phase: "P0", hours: 14,
      goal: "把工具变成「别人也能跑起来」的服务，完成 M1。",
      depth: "能独立把任意 Python 工具容器化并解释镜像分层；能在 20 分钟内配好 CI；M1 清单全部打勾。",
      tasks: [
        { id: "W6-1", level: 2, need: "use", box: 45, text: "写 Dockerfile 打包 resume-parser", desc: "理解基础镜像、分层缓存、卷、环境变量" },
        { id: "W6-2", level: 2, need: "use", box: 45, text: "docker compose 起服务（app + 依赖）", desc: "为项目 A 的向量库提前铺路" },
        { id: "W6-4", level: 2, need: "use", box: 45, text: "GitHub Actions 跑一次 pytest", desc: "README 挂上 CI 徽章，简历仓库的加分细节" },
        { id: "W6-5", level: 2, need: "key", box: 90, text: "写第一篇技术博客（就写你踩过的那个坑）", desc: "不用高大上：写「我怎么 3 小时才搞明白 Git 合并」反而更真实。发到掘金/知乎/CSDN，面试官会搜你" },
        { id: "W6-7", level: 2, need: "use", box: 45, text: "补上 W1 挪过来的 Git 协作演练：开分支 → 提 PR → 网页合并 → 制造并解决一次冲突", desc: "现在才是对的时机——你已经有代码可管了。只需走通一次，知道「冲突长什么样、该保留哪边」，命令不必记" },
        { id: "W6-6", level: 1, need: "key", box: 90, text: "M1 自检 + 复盘 + 下阶段计划微调", desc: "逐条打勾，没过就补，别急着进 P1" },
        { id: "W6-8", level: 2, need: "core", box: 240, text: "技术选型三问：这工具解决的不变问题是什么？换掉它成本多大？我学它是为了「判断」还是「操作」？", desc: "每遇到新框架 / 新协议 / 新平台都用这三问筛一遍，30 分钟决定学不学。这条比学任何具体工具都保值" , starter: { have: "一个你正在犹豫要不要学的工具（框架/协议/平台）", want: "用三问填一张表，30 分钟内给出「学 / 不学」的结论", first: "先在纸上写下那个工具名，以及你听谁说的" } },
      ]
    },

    /* ============ P1 ============ */
    {
      id: "W7", date: "11/23–11/29", title: "项目 A 立项与数据管道", phase: "P1", hours: 14,
      goal: "启动「无人机吊挂 / 控制领域文献助手」，把数据变成可检索的资产。",
      depth: "能解释不同分块策略的取舍与适用场景；数据管道可一条命令重建索引；清楚自己数据「脏」在哪，并能说出处理方案。",
      tasks: [
        { id: "W7-1", level: 1, need: "key", box: 90, text: "立项：写清服务对象、痛点、成功指标", desc: "建议做你课题领域的文献问答，数据自己有、领域你懂、能服务毕设" },
        { id: "W7-2", level: 2, need: "use", box: 45, text: "收集 200–500 篇 PDF（arXiv / 知网导出 / 自有文献）", desc: "建 inventory 表记录标题、作者、年份、来源" },
        { id: "W7-3", level: 2, need: "key", box: 90, text: "解析层：PyMuPDF / unstructured / MinerU 选型对比", desc: "扫描件用 OCR，公式提取不了的记为「已知限制」" , starter: { have: "data/raw/ 里 5 篇真实 PDF（中英文都行）", want: "选定一个解析库，写出 parse.py，对 5 篇各输出前 300 字 + 页数，人工看对不对", first: "先跑我给的 compare_parsers.py，一次性看到 3 个库在同一 PDF 上的输出差异" }},
        { id: "W7-4", level: 2, need: "key", box: 90, text: "清洗与元数据统一", desc: "去页眉页脚、参考文献噪声、统一编码" , starter: { have: "data/raw/ 下 5 个 .txt，其中 1 个 GBK、2 个带页眉页脚", want: "data/clean/ 下同名 .txt，UTF-8 无 BOM、无页眉页脚，并生成 clean_report.json 记录每个文件改了什么", first: "先跑 inspect.py 看清每个文件的编码和噪声行，再定清洗规则" }},
        { id: "W7-5", level: 3, need: "core", box: 240, text: "分块策略对比实验（固定 / 递归 / 按章节）", desc: "各用 10 个问题对比效果，记笔记" , starter: { have: "5 篇已解析的文献全文 + 10 个测试问题", want: "固定/递归/按章节三种切法各跑一遍，同一批问题对比命中率", first: "先跑我给的分块脚本，看三种切法切出来的块长什么样" } },
      ]
    },
    {
      id: "W8", date: "11/30–12/06", title: "向量化与检索基线", phase: "P1", hours: 14,
      goal: "跑通向量检索，并建立你的第一份评测集。",
      depth: "能解释向量维度、相似度度量、HNSW 参数对召回与延迟的影响；手上有一套自己写的、可复用的 30 条评测集。",
      tasks: [
        { id: "W8-1", level: 2, need: "core", box: 240, text: "Embedding 选型对比（bge-m3 / 智谱 / 云端）", desc: "各测 100 条中英样本，看相似度排序是否合理" , starter: { have: "30 条已切好的文本块 + 10 个查询", want: "2–3 个 embedding 模型各跑一遍，输出「同一查询下 top-5 差在哪」的表", first: "先跑我给的单模型 baseline，确认分数方向对" } },
        { id: "W8-2", level: 2, need: "use", box: 45, text: "向量库落地：先用 Chroma（进程内，笔记本够用）", desc: "建索引、批量写入、按元数据过滤；Milvus 这类重型组件等有服务器再说" },
        { id: "W8-3", level: 2, need: "key", box: 90, text: "实现基础向量检索 baseline 并跑 10 个查询", desc: "记录 top-k 结果，人工判断相关性" , starter: { have: "已切好块的 10 段文本 + 10 个测试问题", want: "基础向量检索能跑，对 10 个问题各返回 top-3，并打印相似度分数", first: "先用我给的 3 段样例跑通 embed + 余弦相似度，确认分数方向对" }},
        { id: "W8-4", level: 3, need: "core", box: 240, text: "建 30 条评测集：问题 + 标准答案 + 出处", desc: "这是整个项目最值钱的资产，后面所有对比都基于它" , starter: { have: "你领域 20 个真实问题（从文献里挑）", want: "30 条评测集：问题 + 标准答案 + 出处页码，存成 JSONL", first: "先只写 3 条，我审口径对不对再批量写" } },
        { id: "W8-6", level: 2, need: "key", box: 90, text: "LeetCode 4 题（二叉树）", desc: "遍历、层序、深度" }
      ]
    },
    {
      id: "W9", date: "12/07–12/13", title: "混合检索与重排", phase: "P1", hours: 14,
      goal: "把召回率显著抬起来，并留下 4 行可讲的对比数据。",
      depth: "能背出 RRF 公式并解释为什么有效；能说清 rerank 的收益边界与延迟代价；手上有 baseline → 混合 → 重排的完整对比表。",
      tasks: [
        { id: "W9-1", level: 2, need: "key", box: 90, text: "BM25 关键词召回（rank_bm25 或库内全文检索）", desc: "理解词频饱和与长度归一化" },
        { id: "W9-2", level: 3, need: "core", box: 240, text: "RRF 融合向量与 BM25 结果", desc: "理解为什么用排名倒数而不是分数加权" , starter: { have: "向量检索与 BM25 各自的 top-10 结果（同一批问题）", want: "RRF 融合后 top-10，三者 Recall@5 对比", first: "先跑我给的两路检索，把结果各存一个 JSON" } },
        { id: "W9-3", level: 2, need: "core", box: 240, text: "Cross-encoder 重排（bge-reranker）", desc: "对比重排前后 top-k 质量与延迟" , starter: { have: "融合后的 top-20 候选 + 10 个查询", want: "重排后 top-10 的命中率变化 + 单次延迟", first: "先跑我给的重排脚本，只处理 1 个查询，看耗时" } },
        { id: "W9-4", level: 3, need: "core", box: 240, text: "消融实验表：纯向量 → +BM25 → +RRF → +rerank", desc: "记录 Recall@5 / MRR / P95 延迟" , starter: { have: "四组结果（纯向量 / +BM25 / +RRF / +rerank）", want: "一张 4 行 3 列的表：Recall@5、MRR、平均延迟", first: "先确认四组用的是同一批评测问题" } },
      ]
    },
    {
      id: "W10", date: "12/14–12/20", title: "生成、引用与鲁棒性", phase: "P1", hours: 14,
      goal: "让回答可溯源、可拒答、不胡说。",
      depth: "幻觉被压到可接受范围且有证据；能解释「为什么给模型看原文而不是摘要」；刁钻问题下系统会明确说「资料不足」而不是编。",
      tasks: [
        { id: "W10-1", level: 2, need: "key", box: 90, text: "上下文组装：去重、按分数排序、token 预算截断", desc: "上下文不是越多越好，学会做取舍" },
        { id: "W10-2", level: 2, need: "key", box: 90, text: "引用溯源：答案带出处编号，可点击跳原文", desc: "这是面向研究所/国企场景的信任基础" },
        { id: "W10-3", level: 3, need: "key", box: 90, text: "查询处理：改写、HyDE、多查询扩展", desc: "对比开启前后在「口语化提问」上的表现" },
        { id: "W10-4", level: 2, need: "core", box: 240, text: "拒答机制：召回分数低于阈值时明确说资料不足", desc: "阈值要有实验依据，不能拍脑袋" , starter: { have: "一个低分召回的真实案例（问题 + 检索结果）", want: "阈值定在哪、用 10 个刁钻问题验证误拒与漏拒", first: "先跑我给的分值分布脚本，看分数长什么样" } },
        { id: "W10-5", level: 3, need: "core", box: 240, text: "10 个刁钻问题压力测试并记录失败模式", desc: "多云/多跳/否定式提问，各来几个" , starter: { have: "10 个故意刁钻的问题（跨文献、问细节、问不存在的事）", want: "逐条记录「答了/拒了/答错了」，标出 3 个失败模式", first: "先跑前 3 个，我陪你看怎么判" } },
      ]
    },
    {
      id: "W11", date: "12/21–12/27", title: "评估与成本", phase: "P1", hours: 14,
      goal: "把「我觉得变好了」变成「指标显示变好了，代价是多少」。",
      depth: "能说清忠实度 / 答案相关性 / 上下文精度的定义与差异；能讲一个「指标掉了，我定位是分块没切到章节」的归因故事；能报出每问成本与 P95 延迟。",
      tasks: [
        { id: "W11-1", level: 2, need: "core", box: 240, text: "接入 RAGAS 或自建 LLM-as-judge（必须写 rubric）", desc: "judge 的评分标准要固定，否则结果不可比" , starter: { have: "30 条评测集的问答结果", want: "一套能重复跑的评估脚本 + 一份 rubric（评分标准）", first: "先只写 rubric 的 3 条标准，我帮你审" } },
        { id: "W11-2", level: 2, need: "core", box: 240, text: "评测集扩到 60–100 条，跑全套指标", desc: "含 20% 的「应该拒答」样本" , starter: { have: "30 条基线评测集", want: "扩到 60–100 条，覆盖长尾问题", first: "先给现有 30 条按「类型」分类，看缺哪类" } },
        { id: "W11-3", level: 3, need: "core", box: 240, text: "写评测报告：指标 + 失败案例分析", desc: "每个失败都要给归因与下一步动作" , starter: { have: "全套指标数据 + 失败案例", want: "一份 2 页报告：指标表 + 3 个失败案例归因 + 下一步", first: "先把指标填进表，再写归因（别倒过来）" } },
        { id: "W11-4", level: 2, need: "key", box: 90, text: "成本与延迟分析：每问 token、P95、缓存命中", desc: "算清「一万次问答多少钱」" },
        { id: "W11-5", level: 2, need: "key", box: 90, text: "做一版缓存优化并出前后对比", desc: "语义缓存或结果缓存，任选其一做扎实" },
        { id: "W11-6", level: 2, need: "key", box: 90, text: "LeetCode 4 题（图 BFS/DFS）", desc: "岛屿数量、课程表" }
      ]
    },
    {
      id: "W12", date: "12/28–01/03", title: "工程化收口 M2", phase: "P1", hours: 14,
      goal: "项目 A 上线：别人 10 分钟能跑起来，你能讲 8 分钟。",
      depth: "仓库有架构图、指标表、已知限制；服务可流式回答；能回放一次检索链路；演示视频 60–90 秒。",
      tasks: [
        { id: "W12-1", level: 2, need: "key", box: 90, text: "FastAPI 服务：/chat 流式（SSE）、/ingest、/eval", desc: "理解 SSE 与 WebSocket 的差异与选型" },
        { id: "W12-3", level: 2, need: "use", box: 45, text: "Docker Compose 一键起（app + 向量库 + 缓存）", desc: "写出 README 的一键启动命令并实测" },
        { id: "W12-4", level: 2, need: "key", box: 90, text: "README：架构图 + 快速开始 + 指标表 + 已知限制", desc: "已知限制写得越坦诚，面试官越信你的数据" },
        { id: "W12-5", level: 1, need: "key", box: 90, text: "录 60–90 秒演示视频 / GIF", desc: "简历和 GitHub 首页都要放" },
        { id: "W12-6", level: 1, need: "key", box: 90, text: "M2 自检 + 复盘", desc: "指标没测出来就别进 P2" }
      ]
    },

    /* ============ P2 ============ */
    {
      id: "W13", date: "01/04–01/10", title: "读懂 Agent 内核", phase: "P2", hours: 12,
      goal: "读懂 agent 的循环与工具调用本质：能手画流程、能判断别人的 agent 哪里有问题。",
      depth: "能白板画出 ReAct 循环并说明每步输入输出；能解释框架帮你做了什么、代价是什么；能读懂一个 200 行的现成 agent 并指出它的隐患。",
      tasks: [
        { id: "W13-1", level: 1, need: "ai", box: 15, text: "读 hello-agents 工具系统与 Agent 章节", desc: "重点理解 Thought → Action → Observation 的数据流" },
        { id: "W13-2", level: 2, need: "key", box: 90, text: "读透一个 200 行的 mini agent 源码，说清每一步为什么这么写", desc: "不用手写，读就行。AI 时代手写 agent loop 已无价值，但读懂它才能判断别人的 agent 哪里有问题" },
        { id: "W13-3", level: 2, need: "key", box: 90, text: "接入计算器与文件读写两个工具，跑通 5 个任务", desc: "至少包含一个需要 3 步以上才能完成的任务" },
        { id: "W13-4", level: 2, need: "key", box: 90, text: "画循环时序图并写进 README", desc: "这张图面试时能直接白板复现" },
        { id: "W13-5", level: 2, need: "key", box: 90, text: "读 Anthropic《Building Effective Agents》英文原文", desc: "搞清 workflow 与 agent 的边界，面试可直接引用其框架" },
        { id: "W13-6", level: 2, need: "key", box: 90, text: "LeetCode 5 题（DP 入门）", desc: "爬楼梯、打家劫舍、最长递增子序列" }
      ]
    },
    {
      id: "W14", date: "01/11–01/17", title: "工具设计与 Function Calling", phase: "P2", hours: 14,
      goal: "把「能调工具」升级成「工具设计得让别人也能用」。",
      depth: "能说出「工具描述的写法决定大部分调用成功率」并举自己的例子；能处理模型传错参、工具超时、返回过大三类问题；有误用测试集。",
      tasks: [
        { id: "W14-1", level: 2, need: "key", box: 90, text: "工具 schema 设计规范：命名、描述、参数类型、返回值、错误语义", desc: "写成一页规范，项目 B 后续都按它做" },
        { id: "W14-2", level: 2, need: "use", box: 45, text: "工具工程细节：超时 / 重试 / 幂等 / 结果截断（照抄模板）", desc: "这些是固定套路，AI 一次给全。你只需要知道「这四样缺了会出什么事」" },
        { id: "W14-3", level: 2, need: "key", box: 90, text: "工具扩到 6–8 个", desc: "文献检索、代码执行沙箱、网页抓取、数据画图、仿真启动等" },
        { id: "W14-4", level: 2, need: "key", box: 90, text: "写工具单测 + 一组「工具误用」用例", desc: "验证模型传错类型/缺参数时系统的行为" },
        { id: "W14-5", level: 3, need: "skim", box: 15, text: "读 12-Factor Agents，对照自己的设计打勾", desc: "把差距写成待办" },
        { id: "W14-7", level: 2, need: "key", box: 90, text: "让 AI 写工具实现，你只写 schema 和测试，直到「误用率」下降", desc: "工具设计 = 判断力（你写），函数实现 = 体力活（AI 写）。跑一轮「你定标准 → AI 实现 → 你来测」的闭环" },
      ]
    },
    {
      id: "W15", date: "01/18–01/24", title: "MCP 协议实战", phase: "P2", hours: 14,
      goal: "写一个自己的 MCP Server，把课题能力开放给通用 Agent。",
      depth: "能画 MCP 的 client/server 交互；能对比 MCP 与自定义 REST 工具的差异与适用场景；server 可被外部客户端真实调用。",
      tasks: [
        { id: "W15-1", level: 2, need: "key", box: 90, text: "读 MCP 官方文档：client/server、tools/resources/prompts", desc: "搞清 stdio 与 HTTP 两种传输的适用场景" },
        { id: "W15-2", level: 3, need: "key", box: 90, text: "写一个 MCP Server：把课题仿真脚本或文献检索暴露出去", desc: "建议 4 个工具以内，把描述写清楚" },
        { id: "W15-7", level: 2, need: "core", box: 240, text: "判断：什么能力适合暴露成 MCP 工具，什么能力不该暴露", desc: "这是协议设计判断力，不是 API 用法。判断错会把「内部脚本」变成「对外承诺」", starter: { have: "你课题里的 5 个可脚本化的动作（仿真、调参、读数据等）", want: "逐个判定「该 / 不该」暴露成 MCP 工具，并说明理由", first: "先只判 1 个，我陪你过判断标准" } },
        { id: "W15-3", level: 2, need: "use", box: 45, text: "在支持 MCP 的客户端接入并演示", desc: "录一段演示，写进 README" },
        { id: "W15-6", level: 1, need: "key", box: 90, text: "更新简历里的项目 B 描述", desc: "趁热写，别等最后回忆" }
      ]
    },
    {
      id: "W16", date: "01/25–01/31", title: "LangGraph 重写骨架", phase: "P2", hours: 14,
      goal: "能判断「哪些环节值得上框架、哪些反而是负担」，并跑通一个最小状态图。",
      depth: "能说清框架给你的三样东西（状态持久化/可视化/协作）各自值多少钱，以及什么时候它反而拖累你。不必能手写框架，但要能做这个取舍。",
      tasks: [
        { id: "W16-1", level: 2, need: "use", box: 45, text: "学 StateGraph、节点/边、条件路由、循环", desc: "先把官方示例跑通，再做自己的" },
        { id: "W16-2", level: 2, need: "key", box: 90, text: "用 LangGraph 官方示例跑通一个带条件路由的小图，能说清 state 语义即可", desc: "不深挖框架 API（半年一换）。只需要能判断「什么场景值得上框架、什么场景是负担」" },
        { id: "W16-3", level: 2, need: "key", box: 90, text: "接入 checkpoint 持久化与 human-in-the-loop", desc: "为「危险操作前需人工确认」留接口" },
        { id: "W16-7", level: 2, need: "core", box: 240, text: "判断：项目 B 里哪些环节值得上框架，哪些反而增加负担", desc: "框架能给你状态持久化和可视化，也会给你升级成本和调试难度。这个取舍 AI 替不了你", starter: { have: "项目 B 的 5 个环节（规划、工具调用、记忆、审核、重试）", want: "逐个判「手写 / 上框架」，并说清代价", first: "先判「工具调用」这一个环节" } },
        { id: "W16-6", level: 1, need: "key", box: 90, text: "整理项目 B 的架构图", desc: "README 首图" }
      ]
    },
    {
      id: "W17", date: "02/01–02/07", title: "春节弹性周 ①", phase: "P2", hours: 5,
      goal: "保住手感，不安排新知识，把简历素材整理出来。",
      depth: "这周的目标是「不断档」。休息是计划的一部分，别自责。",
      tasks: [
        { id: "W17-2", level: 1, need: "key", box: 90, text: "用 2 小时整理简历素材清单", desc: "把项目 A/B 的数字、截图、难点列成表" },
      ]
    },
    {
      id: "W18", date: "02/08–02/14", title: "春节弹性周 ②", phase: "P2", hours: 5,
      goal: "恢复状态，为最后冲刺蓄力。",
      depth: "连续两周低强度是刻意的，防止二月崩盘。",
      tasks: [
      ]
    },
    {
      id: "W19", date: "02/15–02/21", title: "多智能体与记忆", phase: "P2", hours: 14,
      goal: "把单 Agent 升级成有记忆分层、能失败回滚的系统；多智能体只判断「什么时候是负优化」。",
      depth: "能说清「多智能体什么时候是负优化」；能给出角色边界与交接协议；能解释记忆的分层设计与上下文预算的取舍。",
      tasks: [
        { id: "W19-1", level: 2, need: "key", box: 90, text: "实现 2–3 个角色协作（检索员 + 撰写员 + 审核员）", desc: "supervisor / handoff / advocate-critic 任选实现" },
        { id: "W19-2", level: 3, need: "core", box: 240, text: "记忆设计：短期窗口、长期向量记忆、用户画像、摘要压缩", desc: "写清每类记忆的写入与淘汰策略" , starter: { have: "一个多轮对话场景（10 轮）", want: "短窗口 + 长期向量记忆 + 摘要压缩三层的具体参数与取舍", first: "先跑我给的长对话，看从第几轮开始跑偏" } },
        { id: "W19-3", level: 3, need: "core", box: 240, text: "处理失败：子任务失败的回滚与重试", desc: "至少演示一次失败后自动恢复" , starter: { have: "一个子任务失败的场景", want: "回滚策略：重试几次、退到哪、怎么记录", first: "先手动制造一次失败（断网或超时）" } },
        { id: "W19-6", level: 1, need: "key", box: 90, text: "更新简历 v0.9", desc: "为下周定稿做准备" }
      ]
    },
    {
      id: "W20", date: "02/22–02/28", title: "评测收口与 M3 冲刺", phase: "P2", hours: 16,
      goal: "三个仓库就绪、简历定稿、八股成册，3 月 1 日准时投递。",
      depth: "任一项目能对着镜头讲 8 分钟不卡壳；简历每条经历都有数字；LLM/Agent 专项 30 问答案写完；知道自己的三个弱项并排好补课顺序。",
      tasks: [
        { id: "W20-1", level: 3, need: "core", box: 240, text: "建 30–50 条任务级评测：成功率、步数、成本、P95", desc: "含工具调用准确率与失败类型分布" , starter: { have: "30–50 条任务描述 + 期望结果", want: "成功率 / 平均步数 / 单任务成本 / P95 延迟 四项指标", first: "先跑 5 条，看指标能不能算出来" } },
        { id: "W20-2", level: 2, need: "key", box: 90, text: "全链路 trace，能回放一次失败任务", desc: "面试演示时直接放这段" },
        { id: "W20-3", level: 3, need: "core", box: 240, text: "安全加固：注入防护、工具白名单、预算上限", desc: "研究所/国企面试很吃这一套" , starter: { have: "一个已知的提示词注入攻击样例", want: "三层防护（输入过滤 / 工具白名单 / 预算上限）各跑一次验证", first: "先用样例打一次现在的系统，看能不能被攻破" } },
        { id: "W20-4", level: 2, need: "key", box: 90, text: "三个仓库 README + 演示视频收口", desc: "统一风格：价值一句话 + 架构图 + 指标 + 已知限制" },
        { id: "W20-5", level: 2, need: "key", box: 90, text: "简历 v1 定稿（AI Agent 版 + 控制算法版）", desc: "用网站「简历工坊」直接排版导出" },
        { id: "W20-6", level: 2, need: "key", box: 90, text: "八股手册 v1：LLM/Agent 专项 30 问写完答案", desc: "在「模拟面试官」里先自测一轮 20 题" },
        { id: "W20-7", level: 1, need: "key", box: 90, text: "3 月 1 日投递清单：目标单位 30 家 + 内推渠道", desc: "分冲/稳/保三档，含研究所与高校" }
      ]
    }
  ],

  /* ---------------- 之后阶段（W21+） ---------------- */
  laterPhases: [
    { when: "2027-03（W21–W24）", title: "投递 + 项目 C 启动",
      items: ["每天 1–2 份精准投递，维护投递记录表（公司/岗位/进度/复盘）",
              "面试后 24 小时内写复盘，把新问题写进问题库",
              "项目 C 立项：无人机吊挂仿真 → Agent 工具 → 参数寻优自动化",
              "每周 1 次模拟面试（本网站 20 题一轮）"] },
    { when: "2027-04（W25–W28）", title: "项目 C 主体 + 八股二轮",
      items: ["项目 C 打通端到端并测出指标（调参周期、人工介入次数、性能提升）",
              "八股二轮：按面试反馈定向补，不再全量重读",
              "模拟面试升级为「压力面」：30 题 + 追问"] },
    { when: "2027-05（W29–W32）", title: "面试高峰 + 加分项",
      items: ["面试密度最高，LeetCode 保持每周 5 题复健",
              "LoRA/QLoRA 微调一个小模型（LLaMA-Factory）+ vLLM 部署，作为 L4 加分——**这类实验用云端按小时租卡做**（AutoDL / 阿里云，单次几十元），工位笔记本上只做数据准备、代码调试与结果整理；台式机已改作游戏 + 整理机，不装 CUDA",
              "项目 C 收口进简历 v2，准备「课题如何变成 AI 项目」的标准答法"] },
    { when: "2027-06 ~ 08（W33–W42）", title: "暑期实习",
      items: ["实习为主，周末 4–6 小时维持刷题与研究",
              "记录实习产出：做了什么、什么指标、用了什么工具，为转正与秋招简历备料",
              "目标：转正意向，或至少一段可写进秋招简历的大模型相关经历"] },
    { when: "2027-08 ~ 11（W43–W47+）", title: "秋招冲刺",
      items: ["8 月提前批全投（不影响正式批）",
              "9–11 月正式批，累计 60–100 家，分冲/稳/保三档",
              "研究所、高校、企业三条线并行；高校线额外准备试讲",
              "每场面试后更新问题库，11 月前拿到 ≥1 个满意 offer"] },
    { when: "2027-12 ~ 2028-06", title: "毕设与收尾",
      items: ["毕设与项目 C 复用，避免两线作战",
              "入职前补足岗位所需的具体技术栈",
              "保持技术输出（博客/GitHub），为入职后的成长做铺垫"] }
  ],

  /* ---------------- 两台机器的分工 ---------------- */
  machinePlan: [
    { title: "工位笔记本就是你的主力开发机（别嫌弃它）",
      text: "本网站自动探测到：i5-11400H + RTX 3050 Ti Laptop（4GB 显存）+ 16GB 内存（常只剩 3GB 可用）+ 456GB 磁盘。写代码、调云端 API、跑 Git/Docker 轻量服务、读文档，全都够用——你 80% 的学习任务在这台机器上完成。" },
    { title: "明确哪些事「不在笔记本上做」",
      text: "不要在这台机器上跑 7B/8B 模型（int4 也要 4~5GB 权重，4GB 显存会溢出到内存，而内存只剩 3GB）；不要同时开 Docker Desktop + 本地推理 + 一堆浏览器标签；向量库优先 Chroma（进程内），别上 Milvus/ES 这类重型组件。" },
    { title: "台式机的新角色：游戏机 + 文件整理机（不装 CUDA）",
      text: "你把宿舍那台 4070S 搬到工位当游戏机，只装一个 DSH 负责整理文件——这个决定是划算的：CUDA + PyTorch + 微调环境装一次要 2 小时，之后每次升级还可能重装。所以「需要 GPU 的实验」不再押在它身上，改用云端按小时租卡（AutoDL / 阿里云，跑一次微调几十块钱）。台式机给你的是：游戏体验 + 一块 2K 屏 + 一个替你收拾烂摊子的 AI。" },
    { title: "云端 API 是你的算力替代方案",
      text: "你已经在用阿里云百炼的 deepseek-v4.1-flash（支持看图、支持长上下文）。日常开发、RAG 评测、Agent 调试全部走 API，成本远低于买显卡；只有「必须验证本机部署」的环节才需要台式机。" },
    { title: "实验室机器：问清规则再用",
      text: "实验室有可跑 7B 的显卡，但使用规则未知。先去问清三件事：能不能装 Python 包、能不能长时间占用、数据能不能出内网。搞清后再决定是否把项目 C 的仿真跑在那里。" },
    { title: "网站会自动记住你在哪台机器上",
      text: "记忆档案每次启动都重新探测当前机器，并把「工位笔记本 / 家里台式机」分开记录，所以我在给你命令和算力建议时不会搞混——你在哪台机器上打开网站，它就按哪台的配置回答。" }
  ],

  /* ---------------- 抗过时 ---------------- */
  antiObsolescence: [
    { title: "只深挖「判断力」，把 API 当消耗品",
      text: "评估标准、幻觉归因、检索原理、取舍判断、安全边界——这些五年不变，而且 AI 越强越值钱（因为 AI 不知道自己错在哪）。框架 API、命令、配置半年一换，只求「能跑起来」，不求会。" },
    { title: "用「AI 替代后还剩多少」筛选内容",
      text: "每学一个东西先问一句：这东西如果明天消失，我的能力还剩多少？剩得多就值得深挖，剩得少就走个过场。你已经会用 Codex/DSH，说明你本来就擅长「按需现查」，别退回去背命令。" },
    { title: "建立技术雷达习惯（每季度 1 小时）",
      text: "固定 1 月、4 月、7 月、10 月各花 1 小时：读 3 篇一手来源（官方博客/文档/arXiv），然后更新本页的「资源库」和下一阶段计划。不要每天刷资讯。" },
    { title: "把「定义什么算对」当成唯一护城河",
      text: "AI 能把实现做得比你快，但它不知道「什么算做对了」。所以你的时间全押在：定验收标准、建评测集、做失败归因。换任何框架，你都能先建评测再动手——这个能力不会因模型升级而贬值。" },
    { title: "AI 时代最危险的两个姿势",
      text: "① 只会调 API、不会判断好坏——这类人正在被 AI 直接替代；② 只读理论不动手——面试过不了。你的路线里「每个项目必须有评测集」防第一种，「必须有可运行仓库」防第二种。" },
    { title: "分清「定义对错」和「实现对错」——只投资前者",
      text: "AI 能把实现做得比你快，但它不知道「什么算对」：验收标准、边界条件、取舍代价，这些必须由人定。所以你的时间应该压在「写规格、定标准、审结果」上，实现部分大胆交给 AI。判断一个学习内容值不值得投入，就问一句：它是在训练我「定义对错」，还是在训练我「敲得更快」？" },
    { title: "每个新工具只花 30 分钟，用三问筛选",
      text: "① 它解决的是不变的问题还是某个产品的临时方案？② 如果它明天消失，我的能力还剩多少？③ 我学它是为了「能判断」还是「能操作」？前两类答案决定投入多少——命令和界面永远只值 30 分钟，因为半年后就会换。你已经会用 Codex/DSH，说明你本来就擅长「按需现查」，别退回到背命令的老路。" },
    { title: "用真实场景对冲技术贬值",
      text: "教程项目会随技术换代失效，但你「把无人机吊挂实验流程 Agent 化」的经历不会——因为它证明的是解决真实问题的能力，而不是会用某个库。" }
  ],

  /* ---------------- 求职策略（不绑定城市） ---------------- */
  tianjin: [
    { title: "三类主战场，打法完全不同",
      text: "① 国企 / 研究所：重基础扎实、工程规范、稳定性，面试会问「为什么不去互联网」「能不能出差」；② 无人机 / 机器人 / 具身智能企业：重 ROS、仿真、控制 + AI 结合，你的课题是最强敲门砖；③ 高校 / 职校 / 事业单位：需要试讲与教学能力，看学历也看你能否独立带课。" },
    { title: "不去大厂 = 面试标准变了",
      text: "大厂考算法与系统设计，中小厂与研究所更考「能不能马上干活 + 稳不稳」。所以简历要突出：能独立交付（三个可运行仓库）、有真实场景（课题）、愿意长期稳定（而不是随时跳槽）。" },
    { title: "实习机会不足的对冲策略",
      text: "非一线城市的暑期实习岗位往往少于一线。三条路同时走：① 本地 + 邻近大城市双线投递（通勤可达就值得投）；② 接受远程实习；③ 争取在本地研究所或导师合作单位做与课题相关的实习，同样能写进简历。" },
    { title: "研究所 / 高校面试的准备重点",
      text: "研究所：政治素养与保密意识、文档与交接规范、对加班的真实态度、五年规划；高校：15 分钟试讲（准备一节课：把 Agent 讲给大二学生听）、科研与教学平衡、为什么不去企业。这些题在「模拟面试官」里都有专项题。" },
    { title: "信息渠道优先级",
      text: "① 导师与同门内推（研究所与本地企业最有效）；② 学校就业网与线下招聘会；③ 当地人社部门与人才活动；④ 牛客 / 小红书找同公司师兄师姐；⑤ 企业官网与公众号。海投效率最低，放最后。" },
    { title: "城市：当选择项，别当唯一理由",
      text: "决定去哪座城市时，把「产业密度、生活成本、离家人远近、长期定居意愿」一起算，不要只看政策。面试里可以说「我倾向在这座城市长期发展」，但别说「因为好落户所以选你们」——听起来像随时会走。" }
  ],

  /* ---------------- 资源库 ---------------- */
  resources: [
    { group: "主线教材（就这两本，别贪多）", items: [
      { name: "hello-agents", url: "https://github.com/datawhalechina/hello-agents", why: "Agent 主线教材。W13 起只精读「工具调用与循环控制」章节，其余当字典查——不必逐章跟做", tag: "always" },
      { name: "all-in-RAG", url: "https://github.com/datawhalechina/all-in-rag", why: "RAG 全栈施工图，W7–W12 每章读完立刻在项目 A 落地", tag: "always" }
    ]},
    { group: "一手来源（面试加分，也抗过时）", items: [
      { name: "MCP 官方文档", url: "https://modelcontextprotocol.io", why: "W15 直接读规范，比二手博客可靠得多", tag: "always" },
      { name: "Anthropic · Building Effective Agents", url: "https://www.anthropic.com/engineering/building-effective-agents", why: "workflow 与 agent 的边界，英文原文值得精读两遍", tag: "always" },
      { name: "12-Factor Agents", url: "https://github.com/humanlayer/12-factor-agents", why: "工程化清单，用来对照自己的设计。只当 checklist，不当教材精读", tag: "always" },
      { name: "LangGraph 文档", url: "https://github.com/langchain-ai/langgraph", why: "W16 状态机式编排，只看官方文档与示例", tag: "" }
    ]},
    { group: "工具链", items: [
      { name: "uv 官方文档", url: "https://docs.astral.sh/uv/", why: "W1 起的核心工具：装 Python、建虚拟环境、装依赖、锁版本，一条命令搞定", tag: "always" },
      { name: "FastAPI", url: "https://fastapi.tiangolo.com/", why: "W12 服务化，边用边查", tag: "" },
      { name: "Pydantic", url: "https://docs.pydantic.dev/", why: "数据校验用。结构化输出本身在贬值（模型越来越会吐 JSON），会校验即可", tag: "always" },
      { name: "Ollama", url: "https://github.com/ollama/ollama", why: "W4 在 4070S 上打通本地模型，当离线实验台", tag: "" },
      { name: "RAGAS", url: "https://github.com/explodinggradients/ragas", why: "W11 RAG 评测，注意 judge 的 rubric 要固定", tag: "" },
      { name: "Langfuse", url: "https://github.com/langfuse/langfuse", why: "W12/W20 全链路 trace，面试演示神器", tag: "" }
    ]},
    { group: "加分项（P3 之后再看）", items: [
      { name: "LLaMA-Factory", url: "https://github.com/hiyouga/LLaMA-Factory", why: "LoRA/QLoRA 微调，2027-05 加分项", tag: "" },
      { name: "vLLM", url: "https://github.com/vllm-project/vllm", why: "推理部署与吞吐优化，有 GPU 才做", tag: "" },
      { name: "LeRobot", url: "https://github.com/huggingface/lerobot", why: "想往具身智能方向讲时入门用", tag: "" }
    ]},
    { group: "刷题与八股", items: [
      { name: "代码随想录", url: "https://programmercarl.com/", why: "按分类刷题，比随机刷有效", tag: "always" },
      { name: "LeetCode 中国站", url: "https://leetcode.cn/", why: "只刷 6 类高频（数组/哈希/双指针/二叉树/BFS/DP）各 1 组，别为凑数量刷题", tag: "always" },
      { name: "本站「模拟面试官」", url: "#interview", why: "题库 150+ 题，按目标单位类型抽题并自动评分", tag: "always" }
    ]},
    { group: "别沉迷（最容易偷走你 20 周的东西）", items: [
      { name: "从头学深度学习/CS231n/CS224n", url: "", why: "对 Agent 应用岗性价比极低，面试几乎不问推导", tag: "avoid" },
      { name: "追新 Agent 框架", url: "", why: "框架半年一换。只跑通官方示例、能判断「什么场景值得上框架」就够，不深挖 API", tag: "avoid" },
      { name: "视频课刷时长", url: "", why: "唯一标准是「能不能马上写出代码」", tag: "avoid" },
      { name: "无限收藏仓库", url: "", why: "收藏夹≠技能，动手项目不超过 5 个", tag: "avoid" }
    ]}
  ]
};