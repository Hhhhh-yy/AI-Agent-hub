/* ==========================================================================
   resume.data.js · 简历初始数据（两版）
   注意：所有「XX」「{待填}」都是占位符，请按自己情况替换。
   数据结构：{ name, title, contact{}, sections:[{id,title,type,items:[item]}] }
   item: { name, sub, date, tech, desc, bullets:[] }
   section.type: edu（教育）/ skills（技能单行）/ projects（项目）/ text（纯要点）
   ========================================================================== */
window.RESUME_DATA = {
  agent: {
    name: "XX（你的姓名）",
    title: "求职意向：AI Agent 开发 / 大模型应用开发（实习）",
    contact: {
      phone: "138-0000-0000",
      email: "you@example.com",
      github: "github.com/your-id",
      blog: "你的技术博客（可选）",
      location: "可接受异地 / 远程"
    },
    sections: [
      {
        id: "edu", title: "教育背景", type: "edu", items: [
          {
            name: "XX 大学（填你的学校）", sub: "电子信息 · 硕士（控制方向）", date: "2025.09 – 2028.06",
            desc: "", bullets: [
              "研究方向：四旋翼无人机吊挂系统的建模与防摆控制",
              "核心课程：线性系统理论、最优控制、机器学习、Python 程序设计"
            ]
          },
          {
            name: "XX 大学", sub: "人工智能 · 本科", date: "2021.09 – 2025.06",
            desc: "", bullets: [
              "核心课程：数据结构、机器学习、深度学习入门、信号与系统",
              "「如有」GPA / 排名 / 奖学金：待填"
            ]
          }
        ]
      },
      {
        id: "skills", title: "专业技能", type: "skills", items: [
          { name: "编程与工程", sub: "", date: "", tech: "", desc: "Python（类型注解、asyncio 异步、FastAPI、Pydantic、pytest、Docker、Git/Linux）；MATLAB/Simulink；习惯用 AI 辅助编码并对生成结果做逐行审查与验收", bullets: [] },
          { name: "大模型应用", sub: "", date: "", tech: "", desc: "RAG 全栈（分块策略、BM25+向量混合检索、RRF 融合、bge-reranker 重排、RAGAS 评估）；提示/上下文工程；结构化输出与函数调用", bullets: [] },
          { name: "Agent 工程", sub: "", date: "", tech: "", desc: "手写 ReAct 循环与工具调度；Function Calling 工具 schema 设计与容错；自研 MCP Server；LangGraph（StateGraph、条件路由、checkpoint、多智能体协作）", bullets: [] },
          { name: "评估与判断（护城河）", sub: "", date: "", tech: "", desc: "能为一套系统先定义「什么算做对了」再动手：自建评测集、设计 rubric、用指标驱动迭代；能识别模型输出的系统性失败模式并归因到检索/提示/工具三层的具体位置", bullets: [] },
          { name: "仿真与控制", sub: "", date: "", tech: "", desc: "四旋翼吊挂动力学建模；Simulink/MuJoCo 仿真；控制器设计与参数寻优；ROS 基础", bullets: [] }
        ]
      },
      {
        id: "projects", title: "项目经历", type: "projects", items: [
          {
            name: "Agent 实验调度系统", sub: "个人项目（简历主打）", date: "2027.01 – 2027.02",
            tech: "Python · LangGraph · MCP · Function Calling · FastAPI · Docker",
            desc: "面向「仿真实验重复劳动多」的问题，将实验流程工具化并交给 Agent 自动规划执行：接收自然语言目标（如「在给定参数空间内找到抖动最小的配置」），自动拆解任务、调用仿真工具、记录结果并生成实验报告。",
            bullets: [
              "自研 ReAct 循环（≤300 行，含最大步数、超时、重复动作检测），后迁移至 LangGraph 以支持状态持久化与人工确认",
              "设计并实现 8 个工具的 schema 与容错机制（超时、重试、幂等、错误回灌），工具调用成功率 {待填}%",
              "实现领域 MCP Server（4 个工具），可被通用 Agent 客户端直接调用",
              "任务级评测（30–50 条）：成功率 {待填}%、平均步数 {待填}、单任务成本 {待填} 元、P95 延迟 {待填}s" +
              "；每个工具都先写 schema 与误用用例再实现，误用率从 {待填}% 降到 {待填}%"
            ]
          },
          {
            name: "领域文献 RAG 智能问答助手", sub: "个人项目", date: "2026.11 – 2027.01",
            tech: "Python · FastAPI · Chroma/pgvector · bge-m3 · bge-reranker · RAGAS · Docker",
            desc: "面向控制/无人机领域 300+ 篇文献的问答系统，解决关键词检索无法理解语义、通用模型答非所问的问题，支持自然语言提问、多跳检索与答案溯源。",
            bullets: [
              "构建数据管道：PDF 解析 → 清洗 → 元数据统一 → 分块策略对比实验（固定/递归/按章节）",
              "实现混合检索（BM25 + 向量 + RRF）并接入 Cross-encoder 重排，Recall@5 从 {待填}% 提升至 {待填}%，MRR {待填}",
              "用 RAGAS + 自建 60–100 条评测集量化忠实度/答案相关性/上下文精度，指标驱动了 3 轮迭代",
              "FastAPI 提供 SSE 流式接口，Langfuse 全链路追踪，Docker Compose 一键启动"
            ]
          }
        ]
      },
      {
        id: "research", title: "科研经历", type: "research", items: [
          {
            name: "四旋翼无人机吊挂系统防摆控制（硕士课题）", sub: "课题研究", date: "2025.10 – 至今",
            tech: "MATLAB/Simulink · 非线性控制",
            desc: "针对吊挂负载在加减速与扰动下的摆动问题，完成动力学建模、控制器设计与仿真验证，并把高频重复的实验流程 Agent 化以提升迭代效率。",
            bullets: [
              "建立吊挂系统动力学模型，设计 {待填：控制器类型} 并进行仿真验证，摆角峰值降低 {待填}%",
              "将仿真与参数扫描封装为 Agent 可调用工具（8 个），单轮调参周期从 {待填} 缩短至 {待填}；用固定评测集验证改动没有回退",
              "「如有」论文/专利/软著：待填"
            ]
          }
        ]
      },
      {
        id: "extra", title: "其他", type: "text", items: [
          { name: "", sub: "", date: "", tech: "", desc: "", bullets: [
            "技术博客：{待填篇数} 篇（含 RAG 检索优化笔记、踩坑复盘）",
            "开源：向 {待填仓库} 提交过 PR / Issue（含分支、冲突解决与合并流程）",
            "「如有」竞赛、奖学金、英语等级：待填"
          ] }
        ]
      }
    ]
  },

  control: {
    name: "XX（你的姓名）",
    title: "求职意向：控制算法 / 无人机与机器人算法（实习）",
    contact: {
      phone: "138-0000-0000",
      email: "you@example.com",
      github: "github.com/your-id",
      blog: "你的技术博客（可选）",
      location: "可接受异地 / 远程"
    },
    sections: [
      {
        id: "edu", title: "教育背景", type: "edu", items: [
          {
            name: "XX 大学（填你的学校）", sub: "电子信息 · 硕士（控制方向）", date: "2025.09 – 2028.06",
            desc: "", bullets: [
              "研究方向：四旋翼无人机吊挂系统建模、防摆控制与实验自动化",
              "核心课程：线性系统理论、最优控制、非线性控制、机器学习"
            ]
          },
          {
            name: "XX 大学", sub: "人工智能 · 本科", date: "2021.09 – 2025.06",
            desc: "", bullets: [
              "核心课程：数据结构、机器学习、信号与系统、自动控制原理",
              "「如有」GPA / 排名 / 奖学金：待填"
            ]
          }
        ]
      },
      {
        id: "skills", title: "专业技能", type: "skills", items: [
          { name: "建模与仿真", sub: "", date: "", tech: "", desc: "四旋翼吊挂系统动力学建模；MATLAB/Simulink 仿真；参数辨识与扫频实验；ROS 基础", bullets: [] },
          { name: "控制算法", sub: "", date: "", tech: "", desc: "{待填：PID / LQR / 滑模 / MPC 等实际用过的} 控制器设计与整定；状态观测与滤波基础", bullets: [] },
          { name: "编程与工具", sub: "", date: "", tech: "", desc: "Python（数据处理、异步、脚本自动化）；C 语言基础；Git / Linux / Docker", bullets: [] },
          { name: "AI 应用（加分）", sub: "", date: "", tech: "", desc: "RAG 检索问答与 Agent 工具调用，能将仿真实验流程自动化；Python 调用大模型完成数据分析与报告生成", bullets: [] }
        ]
      },
      {
        id: "research", title: "科研经历", type: "research", items: [
          {
            name: "四旋翼无人机吊挂系统防摆控制（硕士课题）", sub: "课题研究", date: "2025.10 – 至今",
            tech: "MATLAB/Simulink · 非线性控制",
            desc: "针对吊挂负载在加速、减速与风扰下的摆动问题，完成动力学建模、控制器设计与仿真验证，并搭建了自动化实验流程以加速调参。",
            bullets: [
              "建立吊挂系统动力学模型（{待填：牛顿-欧拉 / 拉格朗日}），分析摆动与飞行状态的耦合关系",
              "设计 {待填：控制器类型} 控制器，仿真中摆角峰值降低 {待填}%，恢复时间缩短 {待填}s",
              "搭建参数扫描与结果自动汇总流程，单轮实验周期从 {待填} 缩短至 {待填}",
              "「如有」论文/专利/软著：待填"
            ]
          }
        ]
      },
      {
        id: "projects", title: "项目经历", type: "projects", items: [
          {
            name: "仿真实验自动化 Agent", sub: "个人项目", date: "2027.01 – 2027.05",
            tech: "Python · LangGraph · Function Calling · MCP",
            desc: "把仿真脚本、参数设置、结果绘图与日志归档封装成 Agent 可调用的工具，用自然语言下达实验目标即可自动完成多轮实验并输出报告。",
            bullets: [
              "工具 schema 设计与容错（超时、重试、错误回灌），支撑无人值守批量实验",
              "多角色协作（执行 / 校验 / 汇总）与人工确认机制，避免错误参数导致无效实验",
              "实验报告自动生成，人工介入次数从 {待填} 降至 {待填}"
            ]
          },
          {
            name: "领域文献 RAG 智能问答助手", sub: "个人项目", date: "2026.11 – 2027.01",
            tech: "Python · 向量检索 · 混合检索 · FastAPI",
            desc: "面向 300+ 篇控制领域文献的问答系统，支持自然语言提问、多路召回与答案溯源。",
            bullets: [
              "混合检索（BM25 + 向量 + RRF）+ 重排，Recall@5 从 {待填}% 提升至 {待填}%",
              "自建评测集与引用溯源、低置信拒答，FastAPI + Docker 一键部署"
            ]
          }
        ]
      },
      {
        id: "extra", title: "其他", type: "text", items: [
          { name: "", sub: "", date: "", tech: "", desc: "", bullets: [
            "英语：{待填：CET-4/6 分数}，可阅读英文技术文档与论文",
            "「如有」竞赛、奖学金、学生工作、教学/助教经历：待填"
          ] }
        ]
      }
    ]
  }
};