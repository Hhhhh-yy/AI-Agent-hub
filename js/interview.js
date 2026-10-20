/* ==========================================================================
   interview.js · 模拟面试官（抽题 / 计时 / 评分 / 成功率 / 复盘）
   ========================================================================== */
window.Interview = (function () {
  "use strict";
  const $ = App.$, $$ = App.$$;

  /* 主目标 = AI 应用 / 中小厂（默认只抽这两类）；国企与高校留作备用，不默认勾选、不再新增题目 */
  const ORG_TYPES = [
    { id: "ai_startup", label: "AI 应用 / 中小厂", primary: true },
    { id: "uav_robot", label: "无人机 / 机器人 / 具身", primary: true },
    { id: "soe", label: "国企 / 研究所（备用）", backup: true },
    { id: "university", label: "高校 / 事业单位（备用）", backup: true }
  ];

  const PASS_THRESHOLD = { ai_startup: 0.62, uav_robot: 0.60, soe: 0.55, university: 0.66 };
  const FILES = [
    "data/questions/01-python-eng.json",
    "data/questions/02-llm-rag.json",
    "data/questions/03-agent.json",
    "data/questions/04-project-behavior.json"
  ];

  // 兜底题库：未启动本地服务时也能用（6 题）
  const FALLBACK = [
    { id: "fb-1", category: "Agent 原理", subcategory: "ReAct", difficulty: 1, orgTypes: ["ai_startup", "uav_robot"], timeLimitSec: 120,
      question: "用你自己的话说清楚 ReAct 循环是怎么跑的，每一步的输入输出是什么。",
      answerPoints: ["Thought 推理", "Action 工具调用", "Observation 结果回灌", "循环直到终止条件"],
      answerDetail: "ReAct = Reasoning + Acting。循环：模型根据当前上下文产出思考，决定调用哪个工具与参数，执行后把结果作为 Observation 追加回上下文，再进入下一轮，直到给出最终答案或触达步数/时间上限。关键是「观察结果必须回灌」，否则模型无法纠错。",
      followUps: ["你怎么防止它死循环？"], tags: ["ReAct"] },
    { id: "fb-2", category: "RAG 检索", subcategory: "混合检索", difficulty: 2, orgTypes: ["ai_startup", "soe"], timeLimitSec: 150,
      question: "向量检索为什么会漏召？混合检索为什么能改善？",
      answerPoints: ["专有名词与编号匹配弱", "长尾语义漂移", "BM25 补关键词", "RRF 按排名融合", "重排提精度"],
      answerDetail: "向量检索对专有名词、型号、编号、否定式提问容易漏；BM25 依赖字面匹配，两者互补。融合常用 RRF（按名次倒数加权），再用 cross-encoder 重排提升 top-k 精度。",
      followUps: ["RRF 为什么用倒数排名而不是分数加权？"], tags: ["BM25", "RRF"] },
    { id: "fb-3", category: "Python与工程基础", subcategory: "异步", difficulty: 2, orgTypes: ["ai_startup"], timeLimitSec: 120,
      question: "你写批量调用大模型 API 的脚本时，为什么用 asyncio 而不是多线程？两者边界在哪？",
      answerPoints: ["IO 密集", "GIL 限制", "事件循环开销小", "CPU 密集用进程", "并发限流 Semaphore"],
      answerDetail: "调用 API 是 IO 密集，协程在单线程事件循环里切换，开销远小于线程；GIL 使多线程无法并行 CPU 计算，CPU 密集要用多进程。无论哪种都要限流（Semaphore）、超时与重试。",
      followUps: ["如果 API 限流 10 QPS，你怎么控制？"], tags: ["asyncio", "GIL"] },
    { id: "fb-4", category: "工具与 MCP", subcategory: "协议", difficulty: 2, orgTypes: ["ai_startup", "uav_robot"], timeLimitSec: 150,
      question: "MCP 解决了什么问题？为什么不直接给模型一个 REST 接口就行？",
      answerPoints: ["统一协议", "工具可复用可插拔", "无需为每个模型改适配", "描述与权限集中管理"],
      answerDetail: "MCP 是一层标准化协议：工具/资源以 server 形式暴露，任何支持 MCP 的客户端都能接入，避免为每个模型/框架重复写适配层，也让工具描述、权限与调用审计集中管理。本质是把「工具接口」标准化。",
      followUps: ["MCP 的 tools 与 resources 有什么区别？"], tags: ["MCP"] },
    { id: "fb-5", category: "项目追问", subcategory: "指标口径", difficulty: 3, orgTypes: ["ai_startup", "soe"], timeLimitSec: 180,
      question: "你说 RAG 的 Recall@5 提升了，这个指标怎么测的？评测集谁写的？怎么保证不是自己骗自己？",
      answerPoints: ["自建评测集规模", "标注出处与标准答案", "固定口径与同一集合", "避免过拟合评测集", "人工抽查复核"],
      answerDetail: "要点是口径固定、集合固定、人工复核。评测集要写清问题、标准答案与出处；每次改动都在同一集合上跑；保留一部分「从没调过」的留出集防止过拟合；结论要有人工抽查支撑。",
      followUps: ["如果留出集指标掉了怎么办？"], tags: ["评估"] },
    { id: "fb-6", category: "行为与动机", subcategory: "稳定性", difficulty: 1, orgTypes: ["soe", "university"], timeLimitSec: 180,
      question: "你为什么想来我们这座城市发展？如果给你一线城市的 offer 你会怎么选？",
      answerPoints: ["真实具体理由", "长期定居规划", "家庭与生活成本", "不贬低其他城市", "表达稳定性"],
      answerDetail: "回答要真实而具体：家庭、生活成本、通勤、长期定居意愿，并说明这与你职业规划一致。避免「大城市太卷」「这边好落户」这类说法——前者显得消极，后者显得功利。",
      followUps: ["五年后你希望自己在什么位置？"], tags: ["地域"] }
  ];

  let bank = [];
  let catWeights = {};
  let usedIds = {};
  let session = null;
  let timerHandle = null;
  let cfg = { orgTypes: ["ai_startup", "uav_robot"], maxDiff: 2, count: 20 };

  /* ---------------- 题库 ---------------- */
  async function loadBank() {
    const all = [];
    for (const f of FILES) {
      try {
        const res = await fetch(f, { cache: "no-store" });
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data)) all.push.apply(all, data);
      } catch (e) { /* 文件缺失时跳过 */ }
    }
    if (!all.length) {
      bank = FALLBACK.slice();
      $("#bankStat").innerHTML = "⚠️ 未加载到题库文件（可能是没启动本地服务），当前使用 6 题兜底题库。<b>请用 start.cmd 启动服务</b>。";
    } else {
      bank = all;
      $("#bankStat").innerHTML = "题库已加载：<b>" + bank.length + "</b> 题 · 分类 " + categories().length + " 个 · 已练 " + usedCount() + " 题";
    }
    buildCategoryDefaults();
    renderWeightSliders();
  }

  function categories() {
    const set = [];
    bank.forEach(q => { if (set.indexOf(q.category) === -1) set.push(q.category); });
    return set;
  }

  function usedCount() {
    const u = (App.state.progress.interview || {}).usedIds || {};
    return Object.keys(u).length;
  }

  function buildCategoryDefaults() {
    const defaults = {
      "Python与工程基础": 4, "计算机基础": 3, "算法与数据结构": 2,
      "大模型基础": 3, "RAG 检索": 4, "RAG 生成与评估": 3, "微调与部署": 1,
      "Agent 原理": 4, "工具与 MCP": 4, "多智能体与记忆": 2, "评估与可观测": 3, "安全与成本": 2,
      "项目追问": 4, "行为与动机": 3
    };
    const saved = (App.state.progress.interview || {}).catWeights;
    catWeights = {};
    categories().forEach(c => { catWeights[c] = (saved && saved[c] != null) ? saved[c] : (defaults[c] != null ? defaults[c] : 3); });
  }

  function renderWeightSliders() {
    $("#weightSliders").innerHTML = categories().map(c =>
      '<div class="slider-row"><span>' + App.escape(c) + '</span>' +
      '<input type="range" min="0" max="6" step="1" value="' + catWeights[c] + '" data-cat="' + App.escape(c) + '">' +
      '<b data-cat-val="' + App.escape(c) + '">' + catWeights[c] + '</b></div>'
    ).join("");
  }

  /* ---------------- 抽题 ---------------- */
  function pickQuestions() {
    const orgs = cfg.orgTypes.length ? cfg.orgTypes : ORG_TYPES.map(o => o.id);
    let pool = bank.filter(q => (q.difficulty || 1) <= cfg.maxDiff);
    if (!pool.length) pool = bank.slice();

    // 单位类型加权
    const score = q => {
      let s = 1;
      (q.orgTypes || []).forEach(t => { if (orgs.indexOf(t) !== -1) s += 2; else s -= 0.4; });
      if ((q.difficulty || 1) === cfg.maxDiff) s += 0.5;
      const used = (App.state.progress.interview || {}).usedIds || {};
      if (used[q.id]) s -= 1.5;       // 练过的降权
      return Math.max(0.1, s);
    };

    // 分类配额
    const cats = categories();
    const totalW = cats.reduce((s, c) => s + (catWeights[c] || 0), 0) || 1;
    const quota = {};
    let assigned = 0;
    cats.forEach(c => {
      quota[c] = Math.floor(cfg.count * (catWeights[c] || 0) / totalW);
      assigned += quota[c];
    });
    // 余数补给权重最高的分类
    const sorted = cats.slice().sort((a, b) => (catWeights[b] || 0) - (catWeights[a] || 0));
    let i = 0;
    while (assigned < cfg.count && sorted.length) { quota[sorted[i % sorted.length]] += 1; assigned += 1; i++; }

    const picked = [];
    const pickedIds = {};
    cats.forEach(c => {
      const need = quota[c] || 0;
      const cands = pool.filter(q => q.category === c).sort((a, b) => score(b) - score(a));
      for (const q of cands) {
        if (picked.length >= cfg.count) break;
        if ((picked.filter(p => p.category === c).length) >= need) break;
        if (pickedIds[q.id]) continue;
        picked.push(q); pickedIds[q.id] = true;
      }
    });
    // 补足数量
    if (picked.length < cfg.count) {
      pool.slice().sort((a, b) => score(b) - score(a)).forEach(q => {
        if (picked.length >= cfg.count || pickedIds[q.id]) return;
        picked.push(q); pickedIds[q.id] = true;
      });
    }
    // 打乱顺序
    for (let k = picked.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      const t = picked[k]; picked[k] = picked[j]; picked[j] = t;
    }
    return picked.slice(0, cfg.count);
  }

  /* ---------------- 运行 ---------------- */
  function start() {
    const qs = pickQuestions();
    if (!qs.length) { App.toast("没有抽到题目，检查题库是否加载成功", "bad"); return; }
    session = {
      startedAt: new Date().toLocaleString("zh-CN"),
      orgTypes: cfg.orgTypes.slice(),
      maxDiff: cfg.maxDiff,
      questions: qs,
      answers: [],
      results: [],
      index: 0
    };
    $("#interviewSetup").classList.add("hidden");
    $("#interviewReport").classList.add("hidden");
    $("#interviewRun").classList.remove("hidden");
    renderQuestion();
    App.toast("面试开始，共 " + qs.length + " 题，加油", "ok");
  }

  function renderQuestion() {
    const q = session.questions[session.index];
    const n = session.questions.length;
    $("#runText").textContent = (session.index + 1) + " / " + n;
    $("#runBar").style.width = (session.index / n * 100) + "%";
    const orgLabels = (q.orgTypes || []).map(t => (ORG_TYPES.find(o => o.id === t) || {}).label).filter(Boolean).join(" · ");
    $("#qMeta").innerHTML =
      '<span class="tag">' + App.escape(q.category) + (q.subcategory ? " · " + App.escape(q.subcategory) : "") + '</span>' +
      '<span class="tag ' + (q.difficulty >= 3 ? "bad" : q.difficulty === 2 ? "warn" : "ok") + '">难度 ' + (q.difficulty || 1) + '/3</span>' +
      '<span class="tag">建议 ' + Math.round((q.timeLimitSec || 120) / 60) + ' 分钟</span>' +
      (orgLabels ? '<span class="tag">' + App.escape(orgLabels) + '</span>' : "");
    $("#qText").textContent = q.question;
    $("#answerInput").value = "";
    $("#answerInput").focus();
    $("#instantFeedback").innerHTML = "";
    $("#gradeHint").textContent = App.state.settings.hasKey
      ? "在线模式：提交后由模型按评分要点逐条判定"
      : "离线模式：按要点关键词比对（偏宽松），提交后可自行修正判定";
    startTimer(q.timeLimitSec || 120);
  }

  function startTimer(sec) {
    clearInterval(timerHandle);
    let left = sec;
    const el = $("#runTimer");
    const tick = () => {
      const m = String(Math.floor(left / 60)).padStart(2, "0");
      const s = String(left % 60).padStart(2, "0");
      el.textContent = m + ":" + s;
      el.classList.toggle("warn", left <= 20);
      if (left === 0) {
        clearInterval(timerHandle);
        el.textContent = "00:00";
        el.classList.add("warn");
        App.toast("建议时间到：可以继续作答，但真实面试里这已经是超时了", "bad");
        return;
      }
      left -= 1;
    };
    tick();
    timerHandle = setInterval(tick, 1000);
  }

  /* ---------------- 评分 ---------------- */
  function localGrade(q, answer) {
    const text = (answer || "").trim();
    const points = q.answerPoints || [];
    if (text.length < 6) {
      return { score: 0, verdict: "wrong", hitPoints: [], missedPoints: points,
        comment: "回答过短，在真实面试里等于没答。建议结构：先给结论 → 再分点说理由 → 最后补一句取舍或代价。",
        followUp: "", local: true };
    }
    const norm = text.toLowerCase().replace(/\s+/g, "");
    const STOP = ["的", "了", "是", "要", "能", "会", "和", "与", "或", "在", "把", "被", "对", "用", "会", "等", "个", "这", "那", "有", "无"];
    const hit = [], miss = [];
    points.forEach(p => {
      const s = String(p).toLowerCase();
      const grams = [];
      for (let len = 2; len <= 4; len++) {
        for (let i = 0; i + len <= s.length; i++) {
          const g = s.slice(i, i + len);
          if (/^[a-z0-9]+$/.test(g)) { if (g.length >= 2) grams.push(g); continue; }
          if (STOP.indexOf(g) !== -1) continue;
          if (len === 2 && STOP.some(x => g.indexOf(x) !== -1)) continue;
          grams.push(g);
        }
      }
      const uniq = Array.from(new Set(grams)).slice(0, 14);
      const matched = uniq.filter(g => norm.indexOf(g) !== -1).length;
      const ratio = uniq.length ? matched / uniq.length : 0;
      if (ratio >= 0.34) hit.push(p); else miss.push(p);
    });
    const score = points.length ? hit.length / points.length : 0;
    const verdict = score >= 0.85 ? "correct" : score >= 0.45 ? "partial" : "wrong";
    const comment = "离线要点比对：命中 " + hit.length + " / " + points.length + " 个要点。" +
      (miss.length ? " 明显漏掉的是「" + miss[0] + "」，面试官会认为你的理解不完整。" : " 要点覆盖较全，注意把结论讲在开头。") +
      " 提示：离线判定偏宽松，你可以用下方按钮自行修正。";
    return { score: score, verdict: verdict, hitPoints: hit, missedPoints: miss, comment: comment, followUp: "", local: true };
  }

  async function submit(force) {
    if (!session) return;
    clearInterval(timerHandle);
    const q = session.questions[session.index];
    const answer = $("#answerInput").value.trim();
    const btn = $("#btnSubmitAnswer");
    btn.disabled = true;
    btn.textContent = "评分中…";

    let result = null;
    if (!force && App.state.settings.hasKey && App.state.serverOnline) {
      try {
        const res = await App.post("/api/grade", {
          question: q.question, answerPoints: q.answerPoints, answerDetail: q.answerDetail, userAnswer: answer
        });
        if (res.ok && res.graded) result = res;
        else if (res.error) App.toast(res.error, "bad");
      } catch (e) { App.toast("评分请求失败，已降级为离线判定：" + e.message, "bad"); }
    }
    if (!result) result = localGrade(q, answer);

    session.answers.push(answer);
    session.results.push(result);
    renderFeedback(q, answer, result);
    btn.disabled = false;
    btn.textContent = "提交并评分";
    void force;
  }

  function renderFeedback(q, answer, r) {
    const cls = r.score >= 0.85 ? "ok" : r.score >= 0.5 ? "mid" : "bad";
    const verdictText = r.verdict === "correct" ? "回答到位" : r.verdict === "partial" ? "部分命中" : "未答到要点";
    let h = '<div class="fb-head"><span class="fb-score ' + cls + '">' + Math.round(r.score * 100) + '</span>' +
      '<span class="tag ' + (cls === "ok" ? "ok" : cls === "mid" ? "warn" : "bad") + '">' + verdictText + '</span>' +
      (r.local ? '<span class="muted small">离线判定（可自行修正）</span>' : '<span class="muted small">模型判定</span>') +
      '</div>';
    h += '<div class="fb-comment">' + App.escape(r.comment || "") + '</div>';
    if ((r.hitPoints || []).length) {
      h += '<div class="fb-block"><h4>✅ 你答到的要点</h4><ul>' + r.hitPoints.map(p => '<li>' + App.escape(p) + '</li>').join("") + '</ul></div>';
    }
    if ((r.missedPoints || []).length) {
      h += '<div class="fb-block"><h4>❌ 漏掉的要点</h4><ul>' + r.missedPoints.map(p => '<li>' + App.escape(p) + '</li>').join("") + '</ul></div>';
    }
    h += '<div class="fb-block"><h4>📖 参考答案</h4><div class="fb-comment">' + App.escape(q.answerDetail || "—") + '</div></div>';
    if (r.followUp) h += '<div class="fb-block"><h4>↪️ 面试官追问</h4><div class="fb-comment">' + App.escape(r.followUp) + '</div></div>';
    if (r.local) {
      h += '<div class="fb-block"><h4>✍️ 自行修正</h4><div class="chip-row">' +
        '<button class="chip" data-override="1">其实我答到位了 (+1)</button>' +
        '<button class="chip" data-override="0.6">大致答到一半</button>' +
        '<button class="chip" data-override="0.2">确实没答上来</button></div></div>';
    }
    h += '<div class="run-foot" style="margin-top:14px"><span class="muted small">' +
      (session.index + 1 < session.questions.length ? "下一题就绪" : "这是最后一题") +
      '</span><button class="primary-btn" id="btnNextQuestion">' +
      (session.index + 1 < session.questions.length ? "下一题 →" : "查看本轮报告") + '</button></div>';
    $("#instantFeedback").innerHTML = h;
    $("#btnNextQuestion").addEventListener("click", next);
    $$("#instantFeedback [data-override]").forEach(b => b.addEventListener("click", function () {
      const v = Number(b.dataset.override);
      const r2 = session.results[session.index];
      r2.score = v;
      r2.verdict = v >= 0.85 ? "correct" : v >= 0.45 ? "partial" : "wrong";
      r2.comment = "已按你的自我评估修正为 " + Math.round(v * 100) + " 分。下次尽量在作答时就覆盖到评分要点。";
      r2.overridden = true;
      renderFeedback(q, answer, r2);
    }));
    $("#instantFeedback").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function next() {
    if (session.index + 1 >= session.questions.length) { finish(); return; }
    session.index += 1;
    renderQuestion();
  }

  /* ---------------- 报告 ---------------- */
  function passRateOf(score, orgId) {
    const s0 = PASS_THRESHOLD[orgId] != null ? PASS_THRESHOLD[orgId] : 0.6;
    return 1 / (1 + Math.exp(-9 * (score - s0)));
  }

  function finish() {
    clearInterval(timerHandle);
    $("#interviewRun").classList.add("hidden");
    const results = session.results;
    const qs = session.questions;
    const scored = results.map((r, i) => ({ q: qs[i], r: r, a: session.answers[i] }));
    const avg = scored.length ? scored.reduce((s, x) => s + x.r.score, 0) / scored.length : 0;
    const correct = results.filter(r => r.verdict === "correct").length;
    const partial = results.filter(r => r.verdict === "partial").length;
    const wrong = results.filter(r => r.verdict === "wrong").length;

    // 分类得分
    const byCat = {};
    scored.forEach(x => {
      const c = x.q.category;
      byCat[c] = byCat[c] || { sum: 0, n: 0 };
      byCat[c].sum += x.r.score; byCat[c].n += 1;
    });
    const cats = Object.keys(byCat).map(c => ({ name: c, avg: byCat[c].sum / byCat[c].n, n: byCat[c].n }))
      .sort((a, b) => b.avg - a.avg);

    // 加权得分（分类权重）
    let wSum = 0, wTotal = 0;
    cats.forEach(c => { const w = catWeights[c.name] || 1; wSum += c.avg * w; wTotal += w; });
    const weighted = wTotal ? wSum / wTotal : avg;

    const primary = session.orgTypes[0] || "ai_startup";
    const pass = passRateOf(weighted, primary);
    const progress = App.overallPct() / 100;
    const readiness = 0.75 * pass + 0.25 * progress;

    const weak = cats.filter(c => c.avg < 0.65).sort((a, b) => a.avg - b.avg);
    const orgLabel = (ORG_TYPES.find(o => o.id === primary) || {}).label || primary;
    const level = readiness >= 0.75 ? "稳" : readiness >= 0.5 ? "有竞争力，但有明显短板" : readiness >= 0.3 ? "需要补强" : "危险：现在去面试基本过不了";

    let h = '<div class="panel"><div class="panel-head"><h2>📋 本轮面试报告</h2>' +
      '<span class="muted">' + App.escape(session.startedAt) + ' · 目标：' + App.escape(orgLabel) + '</span></div>';
    h += '<div class="report-hero">' +
      '<div class="gauge"><svg viewBox="0 0 120 120" width="168" height="168">' +
      '<circle class="g-bg" cx="60" cy="60" r="52"></circle>' +
      '<circle class="g-fg" cx="60" cy="60" r="52" style="stroke-dasharray:' + (2 * Math.PI * 52) + ';stroke-dashoffset:' + (2 * Math.PI * 52 * (1 - readiness)) + '"></circle>' +
      '</svg><div class="gauge-center"><b>' + Math.round(readiness * 100) + '%</b><span>综合准备度</span></div></div>' +
      '<div class="hero-text"><h3>' + App.escape(level) + '</h3>' +
      '<p class="muted" style="margin:0 0 8px">本轮面试表现得分 <b style="color:#22d3ee">' + Math.round(weighted * 100) + '</b> / 100，' +
      '按「' + App.escape(orgLabel) + '」的通过阈值换算，估计通过率约 <b style="color:#22d3ee">' + Math.round(pass * 100) + '%</b>；' +
      '再结合你的路线图完成度 ' + Math.round(progress * 100) + '%，得到综合准备度。</p>' +
      '<div class="chip-row">' +
      '<span class="tag ok">答到位 ' + correct + '</span><span class="tag warn">部分命中 ' + partial + '</span>' +
      '<span class="tag bad">未答到 ' + wrong + '</span><span class="tag">共 ' + scored.length + ' 题</span>' +
      '</div>' +
      '<p class="muted small" style="margin:10px 0 0">说明：这是启发式估算（逻辑回归式映射 + 学习进度加权），不是真实录用概率，用来判断「现在去面会怎样」和「先补哪里」。</p>' +
      '</div></div></div>';

    h += '<div class="panel"><div class="panel-head"><h2>📊 分类表现</h2><span class="muted">低于 65 分的就是你的补课清单</span></div><div class="bars">';
    cats.forEach(c => {
      const pct = Math.round(c.avg * 100);
      const cls = pct >= 80 ? "" : pct >= 60 ? "mid" : "low";
      h += '<div class="bar-row"><span>' + App.escape(c.name) + ' <span class="muted small">(' + c.n + ')</span></span>' +
        '<span class="b-track"><i class="b-fill ' + cls + '" style="width:' + pct + '%"></i></span>' +
        '<span class="b-val">' + pct + '</span></div>';
    });
    h += '</div>';
    if (weak.length) {
      h += '<div class="fb-block"><h4>🔧 优先补这 ' + Math.min(3, weak.length) + ' 项</h4><ul>' +
        weak.slice(0, 3).map(c => '<li><b>' + App.escape(c.name) + '</b>（' + Math.round(c.avg * 100) + ' 分）：回到路线图对应周次复习，然后在「答疑与汇报」里让 Agent 给你出 3 道同类题。</li>').join("") +
        '</ul></div>';
    } else {
      h += '<p class="muted">本轮没有明显短板。下一轮可以提高到「含深挖题」或 30 题压力面。</p>';
    }
    h += '</div>';

    h += '<div class="panel"><div class="panel-head"><h2>🔍 逐题复盘</h2><span class="muted">这是我建议你抄进错题本的部分</span></div>';
    scored.forEach((x, i) => {
      const cls = x.r.score >= 0.85 ? "ok" : x.r.score >= 0.5 ? "warn" : "bad";
      h += '<div class="q-review"><div class="qr-head"><span class="qr-q">' + (i + 1) + '. ' + App.escape(x.q.question) + '</span>' +
        '<span class="tag ' + cls + '">' + Math.round(x.r.score * 100) + '</span></div>' +
        '<div class="qr-a">你的回答：' + App.escape(x.a || "（未作答）").slice(0, 400) + '</div>' +
        ((x.r.missedPoints || []).length ? '<div class="qr-c">漏掉：' + App.escape(x.r.missedPoints.join("；")) + '</div>' : '') +
        '</div>';
    });
    h += '</div>';

    h += '<div class="panel"><div class="panel-head"><h2>💾 保存与复盘</h2></div>' +
      '<div class="chip-row">' +
      '<button class="primary-btn" id="btnSaveRound">保存本轮成绩到进度文件</button>' +
      '<button class="ghost-btn" id="btnCopyReview">复制复盘卡片（可贴给 DSH 里找 Agent 分析）</button>' +
      '<button class="ghost-btn" id="btnRetryWeak">只重练薄弱题（' + weak.length + ' 个分类）</button>' +
      '<button class="ghost-btn" id="btnBackSetup">再来一轮</button>' +
      '</div><p class="muted small" style="margin-top:10px">保存后，工作区的《学习进度报告.md》会同步更新，之后在 DSH 对话里说「读一下我的学习进度报告」即可。</p></div>';

    $("#interviewReport").innerHTML = h;
    $("#interviewReport").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });

    session.summary = {
      time: session.startedAt, orgType: orgLabel, count: scored.length,
      correct: correct, partial: partial, wrong: wrong,
      score: Math.round(weighted * 100), passRate: Math.round(pass * 100) + "%",
      weakCategories: weak.map(c => ({ name: c.name, note: Math.round(c.avg * 100) + " 分（" + c.n + " 题）" }))
    };

    $("#btnSaveRound").addEventListener("click", saveRound);
    $("#btnCopyReview").addEventListener("click", copyReview);
    $("#btnRetryWeak").addEventListener("click", function () {
      if (!weak.length) { App.toast("没有薄弱分类，直接再来一轮吧", "ok"); return; }
      weak.forEach(c => { catWeights[c.name] = Math.min(6, (catWeights[c.name] || 3) + 2); });
      cfg.count = Math.max(10, weak.reduce((s, c) => s + c.n, 0));
      $("#interviewReport").classList.add("hidden");
      start();
    });
    $("#btnBackSetup").addEventListener("click", function () {
      $("#interviewReport").classList.add("hidden");
      $("#interviewSetup").classList.remove("hidden");
    });
  }

  async function saveRound() {
    if (!session || !session.summary) return;
    try {
      // 记录已练题目，避免下次重复
      const iv = App.state.progress.interview || (App.state.progress.interview = { rounds: [] });
      iv.usedIds = iv.usedIds || {};
      session.questions.forEach(q => { iv.usedIds[q.id] = true; });
      iv.catWeights = catWeights;
      await App.post("/api/report", { round: session.summary, weakCategories: session.summary.weakCategories });
      await App.loadSettings();
      // 自动记入长期记忆的里程碑
      App.logMilestone("模拟面试：" + session.summary.orgType + " · " + session.summary.count + " 题 · 得分 " +
        session.summary.score + " · 估计通过率 " + session.summary.passRate +
        "（薄弱：" + (session.summary.weakCategories || []).map(w => w.name).join("、") + "）");
      App.toast("已保存，进度报告已更新", "ok");
      renderBankStat();
    } catch (e) {
      App.toast("保存失败：" + e.message, "bad");
    }
  }

  function copyReview() {
    const s = session.summary;
    const txt = [
      "【模拟面试复盘】" + s.time,
      "目标单位：" + s.orgType + "｜题量：" + s.count,
      "答到位 " + s.correct + " / 部分命中 " + s.partial + " / 未答到 " + s.wrong,
      "本轮得分：" + s.score + "｜估计通过率：" + s.passRate,
      "薄弱分类：" + (s.weakCategories.map(w => w.name + "(" + w.note + ")").join("、") || "无"),
      "",
      "我不会的题目：",
      session.questions.map((q, i) => (session.results[i].score < 0.6 ? "- " + q.category + "：" + q.question : null)).filter(Boolean).join("\n"),
      "",
      "请针对上面这些题，给我一份 3 天补强计划和 5 道同类练习题。"
    ].join("\n");
    navigator.clipboard.writeText(txt).then(
      () => App.toast("复盘卡片已复制，去「答疑与汇报」或 DSH 对话里粘贴", "ok"),
      () => App.toast("复制失败，请手动选择文本", "bad")
    );
  }

  function renderBankStat() {
    if (bank.length) {
      $("#bankStat").innerHTML = "题库已加载：<b>" + bank.length + "</b> 题 · 分类 " + categories().length + " 个 · 已练 " + usedCount() + " 题";
    }
  }

  function renderOrgChips() {
    $("#orgTypeChips").innerHTML = ORG_TYPES.map(o =>
      '<button class="chip ' + (cfg.orgTypes.indexOf(o.id) !== -1 ? "active" : "") + (o.backup ? " backup" : "") +
      '" data-org="' + o.id + '" title="' + (o.backup ? "备用方向：题目不再扩充，需要时再勾选" : "主目标方向") + '">' +
      App.escape(o.label) + '</button>').join("");
    $$("#orgTypeChips .chip").forEach(b => b.addEventListener("click", function () {
      const id = b.dataset.org;
      const i = cfg.orgTypes.indexOf(id);
      if (i === -1) cfg.orgTypes.push(id); else if (cfg.orgTypes.length > 1) cfg.orgTypes.splice(i, 1);
      // 保持选中顺序 = 优先级顺序
      renderOrgChips();
    }));
  }

  function bind() {
    $$("#difficultySeg .seg-item").forEach(b => b.addEventListener("click", function () {
      cfg.maxDiff = Number(b.dataset.diff);
      $$("#difficultySeg .seg-item").forEach(x => x.classList.toggle("active", x === b));
    }));
    $$("#countSeg .seg-item").forEach(b => b.addEventListener("click", function () {
      cfg.count = Number(b.dataset.count);
      $$("#countSeg .seg-item").forEach(x => x.classList.toggle("active", x === b));
    }));
    $("#btnStartInterview").addEventListener("click", start);
    $("#btnEndInterview").addEventListener("click", function () {
      if (confirm("提前结束本轮？已答的题会进入报告。")) finish();
    });
    $("#btnSkipQuestion").addEventListener("click", function () {
      $("#answerInput").value = "";
      submit(true);
    });
    $("#btnSubmitAnswer").addEventListener("click", function () { submit(false); });
    $("#answerInput").addEventListener("keydown", function (e) {
      if (e.ctrlKey && e.key === "Enter") submit(false);
    });
    $("#btnInterviewSettings").addEventListener("click", function () {
      renderWeightSliders();
      App.openModal("weightsModal");
    });
    $("#btnResetWeights").addEventListener("click", function () {
      (App.state.progress.interview || {}).catWeights = null;
      buildCategoryDefaults();
      renderWeightSliders();
      App.toast("已恢复默认权重", "ok");
    });
    $("#weightSliders").addEventListener("input", function (e) {
      const r = e.target.closest("input[type=range][data-cat]");
      if (!r) return;
      catWeights[r.dataset.cat] = Number(r.value);
      const b = $('[data-cat-val="' + r.dataset.cat.replace(/"/g, '\\"') + '"]');
      if (b) b.textContent = r.value;
      const iv = App.state.progress.interview || (App.state.progress.interview = { rounds: [] });
      iv.catWeights = catWeights;
      App.persist();
    });
    $("#btnInterviewHistory").addEventListener("click", showHistory);
  }

  function showHistory() {
    const rounds = ((App.state.progress.interview || {}).rounds || []);
    if (!rounds.length) {
      $("#historyBody").innerHTML = '<p class="muted">还没有记录。完成一轮面试并点「保存本轮成绩」后，这里会显示趋势。</p>';
    } else {
      let h = '<div class="bars">';
      rounds.slice(-12).forEach(r => {
        const pct = Number(r.score) || 0;
        h += '<div class="bar-row"><span>' + App.escape(String(r.time).slice(5, 16)) + ' <span class="muted small">' + App.escape(r.orgType || "") + '</span></span>' +
          '<span class="b-track"><i class="b-fill ' + (pct >= 80 ? "" : pct >= 60 ? "mid" : "low") + '" style="width:' + pct + '%"></i></span>' +
          '<span class="b-val">' + pct + '</span></div>';
      });
      h += '</div><table style="width:100%;margin-top:14px;font-size:13px;border-collapse:collapse">' +
        '<tr class="muted"><td>时间</td><td>单位</td><td>题量</td><td>对/部分/错</td><td>得分</td><td>估计通过率</td></tr>';
      rounds.slice().reverse().forEach(r => {
        h += '<tr><td>' + App.escape(String(r.time)) + '</td><td>' + App.escape(r.orgType || "") + '</td><td>' + (r.count || "") + '</td>' +
          '<td>' + (r.correct || 0) + '/' + (r.partial || 0) + '/' + (r.wrong || 0) + '</td><td>' + (r.score || 0) + '</td><td>' + App.escape(r.passRate || "") + '</td></tr>';
      });
      h += '</table>';
      $("#historyBody").innerHTML = h;
    }
    App.openModal("historyModal");
  }

  async function onEnter() {
    if (!bank.length) await loadBank();
    renderBankStat();
  }

  function init() {
    renderOrgChips();
    bind();
    loadBank();
  }

  return { init: init, onEnter: onEnter };
})();