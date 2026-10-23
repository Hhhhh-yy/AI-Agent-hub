/* ==========================================================================
   chat.js · 答疑与汇报
   能力：多轮上下文 / 学习进度记忆 / 粘贴看图 / 生成教学插图 / SVG 示意图
   ========================================================================== */
window.ChatPage = (function () {
  "use strict";
  const $ = App.$, $$ = App.$$;
  const LS_CHAT = "agent-hub-chat-v2";       // v2：按窗口分开存
  const LS_WIN = "agent-hub-cur-win-v1";     // 记住上次打开的窗口
  const LS_SUMMARY = "agent-hub-win-summary-v1";
  const MAX_ATTACH = 4;
  const MAX_HISTORY = 40;      // 每个窗口单独限 40 条
  const SEND_WINDOW = 24;      // 每次发给模型的最近消息数
  const KEEP_IMAGES = 6;       // 本地只保留最近几张图，避免撑爆浏览器存储

  let history = [];            // 当前窗口的消息
  let attachments = [];
  let currentWin = "free";     // 当前窗口 id：W1..W20 或 free

  const QUICK = [
    { label: "汇报本周进度", kind: "report" },
    { label: "我卡在某个知识点", kind: "stuck" },
    { label: "给我出 3 道检验题", kind: "quiz" },
    { label: "分析我最近的面试成绩", kind: "interview" },
    { label: "下周该学什么", kind: "next" },
    { label: "解释一个概念", kind: "explain" },
    { label: "🎨 生成教学插图", kind: "image" },
    { label: "🖼️ 画示意图（SVG）", kind: "svg" }
  ];

  /* ====================== 窗口（W1–W20 + 自由窗） ====================== */
  /* 日期窗口：id 形如 day-2026-10-20，由用户手动建立，一天一个干净窗口 */
  const LS_DAYLIST = "agent-hub-day-windows-v1";

  function dayKey(d) {
    const t = d || new Date();
    const p = n => (n < 10 ? "0" : "") + n;
    return "day-" + t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate());
  }

  function dayLabel(id) {
    // day-2026-10-20 -> 10.20
    const m = /^day-(\d{4})-(\d{2})-(\d{2})$/.exec(id);
    return m ? (Number(m[2]) + "." + Number(m[3])) : id;
  }

  /* 日期窗口存储：{ id: "day-2026-10-20", owner: "W2" | "" }  */
  function savedDays() {
    try {
      const raw = localStorage.getItem(App.userKey(LS_DAYLIST));
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      // 兼容旧格式（纯字符串数组）
      return arr.map(x => (typeof x === "string" ? { id: x, owner: "" } : x)).filter(x => x && x.id);
    } catch (e) { return []; }
  }

  function saveDays(list) {
    try { localStorage.setItem(App.userKey(LS_DAYLIST), JSON.stringify(list.slice(-120))); } catch (e) {}
  }

  function ensureDay(id) {
    const list = savedDays();
    if (!list.some(x => x.id === id)) {
      list.push({ id: id, owner: guessOwner(id) });
      saveDays(list);
    }
  }

  function setDayOwner(id, owner) {
    const list = savedDays();
    const it = list.find(x => x.id === id);
    if (it) { it.owner = owner || ""; saveDays(list); }
  }

  function dayOwner(id) {
    const list = savedDays();
    const it = list.find(x => x.id === id);
    return it ? (it.owner || "") : "";
  }

  /* 猜测这个学习日属于哪一周：
     ① 已有归属就用它
     ② 用当天对话里出现的任务关键词去匹配
     ③ 兜底：按当前日历周（weekIndexOf） */
  function guessOwner(id) {
    const exist = dayOwner(id);
    if (exist) return exist;

    let msgs = [];
    try {
      const raw = localStorage.getItem(winStorageKey(id));
      msgs = raw ? JSON.parse(raw) : [];
    } catch (e) { msgs = []; }
    if (msgs.length) {
      const text = msgs.map(m => {
        if (typeof m.content === "string") return m.content;
        if (Array.isArray(m.content)) return m.content.filter(p => p.type === "text").map(p => p.text).join(" ");
        return "";
      }).join(" ");
      const hit = matchWeekByText(text);
      if (hit) return hit;
    }
    const R = window.ROADMAP;
    if (R) {
      const idx = App.weekIndexOf();
      const w = R.weeks[idx - 1];
      if (w) return w.id;
    }
    return "";
  }

  /* 用任务文本反查周次：取命中词最多的那一周 */
  function matchWeekByText(text) {
    const R = window.ROADMAP;
    if (!R || !text) return "";
    const t = String(text);
    let best = "", bestScore = 0;
    R.weeks.forEach(function (w) {
      let score = 0;
      w.tasks.forEach(function (task) {
        // 用任务文本里的关键词（2 字以上中文片段 / 英文单词）做匹配
        const words = (task.text + " " + (task.desc || "")).match(/[A-Za-z][A-Za-z0-9_.+-]{2,}|[\u4e00-\u9fa5]{2,4}/g) || [];
        words.forEach(function (kw) {
          if (kw.length >= 2 && t.indexOf(kw) !== -1) score += 1;
        });
      });
      if (score > bestScore) { bestScore = score; best = w.id; }
    });
    // 至少命中 3 个词才算认得出，否则交给兜底
    return bestScore >= 3 ? best : "";
  }

  function removeDay(id) {
    saveDays(savedDays().filter(x => x !== id));
    try { localStorage.removeItem(winStorageKey(id)); } catch (e) {}
  }

  function winList() {
    const R = window.ROADMAP;
    const weeks = R ? R.weeks : [];

    // 日期窗口（唯一可以对话的窗口）
    const days = savedDays().slice().sort((a, b) => (a.id < b.id ? -1 : 1));

    const out = [];
    // 每个 W 变成一个「分组」，本身不可对话
    weeks.forEach(function (w) {
      const kids = days.filter(d => (d.owner || "") === w.id).map(d => d.id);
      out.push({
        id: w.id, label: w.id, title: w.title,
        isGroup: true, days: kids
      });
    });

    // 未归类的日期窗口
    const orphan = days.filter(function (d) {
      const o = d.owner || "";
      return !o || !weeks.some(w => w.id === o);
    }).map(d => d.id);

    orphan.forEach(function (id) {
      out.push({ id: id, label: dayLabel(id), title: "学习日 " + dayLabel(id), isDay: true, orphan: true });
    });

    // 自由窗（也可对话，留一个应急入口）
    out.push({ id: "free", label: "自由", title: "自由提问（不归类）", isDay: true, isFree: true });

    return out;
  }

  /* 某个 id 是不是「可对话窗口」 */
  function isChatWin(id) {
    return /^day-/.test(id) || id === "free";
  }

  function winMeta(id) {
    const found = winList().find(w => w.id === id);
    if (found) return found;
    if (/^day-/.test(id)) return { id: id, label: dayLabel(id), title: "学习日 " + dayLabel(id), isDay: true };
    return { id: "free", label: "自由", title: "自由提问" };
  }

  function winStorageKey(id) {
    return App.userKey(LS_CHAT + "::" + id);
  }

  function loadWindow(id) {
    try {
      const raw = localStorage.getItem(winStorageKey(id));
      history = raw ? JSON.parse(raw) : [];
    } catch (e) { history = []; }
  }

  function saveWindow() {
    try {
      localStorage.setItem(winStorageKey(currentWin),
        JSON.stringify(stripOldImages(history.slice(-MAX_HISTORY))));
    } catch (e) { /* 存不下就只留内存 */ }
  }

  function setWindow(id) {
    const same = (id === currentWin);
    if (!same) saveWindow();
    currentWin = id;
    try { localStorage.setItem(App.userKey(LS_WIN), id); } catch (e) {}
    loadWindow(id);
    // 即使切到同一个窗口也要重渲染：用户可能刚新建/删除了学习日
    if (typeof renderWinBar === "function") renderWinBar();
    if (typeof renderHistory === "function") renderHistory();
    if (typeof renderWinSummary === "function") renderWinSummary();
    if (typeof renderDayOwner === "function") renderDayOwner();
    if (typeof renderWatchBar === "function") renderWatchBar();
  }

  function renderWinBar() {
    const bar = $("#winBar");
    if (!bar) return;
    const all = winList();

    const cntOf = function (id) {
      try {
        const raw = localStorage.getItem(winStorageKey(id));
        const arr = raw ? JSON.parse(raw) : [];
        return arr.filter(m => m.role === "user").length;
      } catch (e) { return 0; }
    };

    let html = "";
    all.forEach(function (w) {
      if (w.isGroup) {
        // 周分组标题（不可点击对话）
        html += '<span class="win-group' + (w.days.length ? " has" : "") + '" title="' + App.escape(w.title) + '">' +
          App.escape(w.label) +
          (w.days.length ? '<i>' + w.days.length + '</i>' : "") +
          '</span>';
        // 挂在它下面的日期窗口
        w.days.forEach(function (did) {
          const cnt = cntOf(did);
          const on = (did === currentWin) ? " active" : "";
          html += '<button class="win-day' + on + '" data-win="' + did + '" title="学习日 ' + App.escape(dayLabel(did)) + '">' +
            App.escape(dayLabel(did)) + (cnt ? '<i>' + cnt + '</i>' : "") +
            '<span class="win-x" data-win-del="' + did + '" title="删除这天">×</span></button>';
        });
      }
    });

    // 未归类的日期窗口
    const orphans = all.filter(w => w.isDay && w.orphan);
    if (orphans.length) {
      html += '<span class="win-sep">未归类</span>';
      orphans.forEach(function (w) {
        const cnt = cntOf(w.id);
        html += '<button class="win-day warn' + (w.id === currentWin ? " active" : "") + '" data-win="' + w.id +
          '" title="学习日 ' + App.escape(dayLabel(w.id)) + '（请在右侧归到某一周）">' +
          App.escape(w.label) + (cnt ? '<i>' + cnt + '</i>' : "") +
          '<span class="win-x" data-win-del="' + w.id + '" title="删除这天">×</span></button>';
      });
    }

    // 自由窗
    const free = all.find(w => w.isFree);
    if (free) {
      html += '<button class="win-day free' + (free.id === currentWin ? " active" : "") + '" data-win="free" title="自由提问（不归类到任何周）">自由</button>';
    }

    // 新建按钮
    html += '<button class="win-add" data-win-add="1" title="新建今天的学习窗口（每天一个干净的对话，会自动归到对应周）">+ 今天</button>';

    bar.innerHTML = html;

    // 绑定
    $$("#winBar [data-win]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        if (e.target.dataset.winDel) return;
        setWindow(b.dataset.win);
      });
    });
    $$("#winBar [data-win-del]").forEach(function (x) {
      x.addEventListener("click", function (e) {
        e.stopPropagation();
        const id = x.dataset.winDel;
        if (!confirm("删除「" + dayLabel(id) + "」这个学习日窗口？只删这一窗。")) return;
        removeDay(id);
        if (currentWin === id) {
          const today = dayKey();
          ensureDay(today);
          setWindow(today);
        }
        renderWinBar();
        App.toast("已删除该学习日", "ok");
      });
    });
    const addBtn = $("#winBar [data-win-add]");
    if (addBtn) addBtn.addEventListener("click", function () {
      const id = dayKey();
      ensureDay(id);
      setWindow(id);
      renderWinBar();
      renderDayOwner();
      App.toast("已新建今天（" + dayLabel(id) + "）的学习窗口，归到 " + (dayOwner(id) || "（未识别）"), "ok");
    });
  }


  /* ====================== 学习日归属 ====================== */
  function renderDayOwner() {
    const box = $("#dayOwnerBox");
    if (!box) return;
    if (!/^day-/.test(currentWin)) { box.innerHTML = ""; box.classList.add("hidden"); return; }
    box.classList.remove("hidden");

    const R = window.ROADMAP;
    const cur = dayOwner(currentWin) || guessOwner(currentWin);
    const weeks = R ? R.weeks : [];

    // 自定义下拉：原生 select 在暗色主题下白底白字，看不清
    let list = '<button class="do-item' + (!cur ? " on" : "") + '" data-owner="">'
      + '<span class="do-id">—</span><span class="do-name">不归类（留在「未归类」）</span></button>';
    weeks.forEach(function (w) {
      list += '<button class="do-item' + (w.id === cur ? " on" : "") + '" data-owner="' + w.id + '">' +
        '<span class="do-id">' + w.id + '</span>' +
        '<span class="do-name">' + App.escape(w.title) + '</span>' +
        (w.id === cur ? '<span class="do-check">✓</span>' : '') +
        '</button>';
    });

    box.innerHTML =
      '<div class="do-head">' +
      '<span class="do-title">这天记到哪一周</span>' +
      '<button class="do-toggle" id="dayOwnerToggle">' + App.escape(cur || "未归类") +
      ' <span class="caret">▾</span></button>' +
      '</div>' +
      '<div class="do-list hidden" id="dayOwnerList">' + list + '</div>' +
      '<div class="do-hint">当前自动判断：' + App.escape(cur || "未识别") + '</div>';

    const toggle = $("#dayOwnerToggle");
    const listEl = $("#dayOwnerList");
    if (toggle) toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      listEl.classList.toggle("hidden");
    });
    $$("#dayOwnerList [data-owner]").forEach(function (b) {
      b.addEventListener("click", function () {
        setDayOwner(currentWin, b.dataset.owner);
        renderWinBar();
        renderDayOwner();
        App.toast(b.dataset.owner ? "已归到 " + b.dataset.owner : "已取消归类", "ok");
      });
    });
    document.addEventListener("click", function hide(e) {
      if (!e.target.closest || !e.target.closest("#dayOwnerBox")) {
        if (listEl) listEl.classList.add("hidden");
      }
    }, { once: true });
  }

  /* ====================== 记忆：进度摘要 ====================== */
  function progressDigest() {
    const idx = App.weekIndexOf();
    const R = window.ROADMAP;
    const week = R && R.weeks[idx - 1] ? R.weeks[idx - 1] : { title: "", goal: "", depth: "" };
    const weeks = App.state.progress.weeks || {};
    const doneThisWeek = App.weekDone(week.id || "")
      .map(id => (week.tasks.find(t => t.id === id) || {}).text)
      .filter(Boolean);
    const questions = (App.state.progress.questions || []).slice(-6).map(q => q.text);
    const rounds = (App.state.progress.interview && App.state.progress.interview.rounds || []).slice(-3).map(r =>
      (r.title || "") + " " + (r.score != null ? r.score + "分" : ""));
    const weak = (App.state.progress.interview && App.state.progress.interview.weakCategories || []).slice(0, 5).join("、");
    const doneAll = [];
    (R ? R.weeks : []).forEach(w => {
      App.weekDone(w.id).forEach(id => {
        const t = w.tasks.find(x => x.id === id);
        if (t) doneAll.push(w.id + " " + t.text.slice(0, 18));
      });
    });
    return {
      weekIndex: idx,
      week: week.id ? (week.id + " " + week.title) : "",
      weekGoal: week.goal || "",
      weekDepth: week.depth || "",
      phase: week.phase || "",
      doneThisWeek: doneThisWeek,
      doneAll: doneAll,
      questions: questions,
      rounds: rounds,
      weak: weak || "暂未测出",
      totalDone: App.doneTasks(),
      totalTasks: App.totalTasks(),
      overall: App.overallPct(),
      hours: App.totalHours(),
      // 当前周里第一个没完成的任务（用于「当前进度」展示）
      nextTask: (function () {
        const done = App.weekDone(week.id || "");
        const t = (week.tasks || []).find(x => done.indexOf(x.id) === -1);
        return t ? t.text : "";
      })()
    };
  }

  /* ====================== 记忆块（长期档案） ====================== */
  function memoryBlock() {
    const m = App.state.memory || {};
    const out = [];

    // 学习原则最高优先
    const pr = m.principles || [];
    if (pr.length) {
      out.push("【他的学习原则（最高优先级，与下面任何内容冲突时以这里为准）】");
      pr.forEach((t, i) => out.push((i + 1) + ". " + t));
      out.push("");
    }

    const p = m.profile || {};
    if (Object.keys(p).length) {
      out.push("【学生画像（长期记忆）】");
      Object.keys(p).forEach(k => out.push("· " + k + "：" + p[k]));
      out.push("");
    }

    const e = m.environment || {};
    if (Object.keys(e).length) {
      out.push("【他此刻运行网站的机器（实时探测）】");
      Object.keys(e).forEach(k => out.push("· " + k + "：" + e[k]));
      out.push("→ 分工：工位笔记本=办公/实验，台式机=游戏+文件整理（不装 CUDA）。需要 GPU 的实验建议云端租卡或只讲原理。");
      out.push("");
    }

    const watched = m.watchlist || [];
    if (watched.length) {
      out.push("【他关注过的项目（别重复推荐；问到时说明适不适合他）】");
      watched.slice(-10).forEach(w => out.push("· " + w.name + "（" + (w.level || "") + "·" + (w.kind || "") + "）：" + (w.why || "")));
      out.push("");
    }

    const notes = m.notes || [];
    if (notes.length) {
      out.push("【长期备注（他手动写的）】");
      notes.slice(-10).forEach(n => out.push("· " + n));
      out.push("");
    }
    return out.join("\n");
  }

  /* ====================== 系统提示词 ====================== */
  function systemPrompt() {
    const d = progressDigest();
    const doneAll = d.doneAll.length > 14
      ? ("（共 " + d.doneAll.length + " 项，最近 14 项）" + d.doneAll.slice(-14).join("；"))
      : (d.doneAll.join("；") || "暂无打卡");

    return [
      "你是这位学生的专属 AI 学习教练兼面试官，语气直接、务实、不说客套话。",
      "你的记忆是持久的：下面的画像是长期档案，进度是实时数据，每次对话自动带上，他不需要重新交代背景。",
      "",
      memoryBlock(),
      "【学习计划】只深挖 20 个判断力任务（评估、归因、取舍、安全）；其余 58 个必学、19 个会用即可、少量交给 AI。",
      "三个简历项目的硬要求：有量化指标、有评测集、有 README 与演示、能讲清取舍。",
      "",
      "===== 以下是实时进度 =====",
      "当前：第 " + d.weekIndex + " 周（" + d.week + "），阶段 " + d.phase + "，完成 " + d.totalDone + "/" + d.totalTasks + "（" + d.overall + "%），累计 " + d.hours + " 小时。",
      "本周目标：" + d.weekGoal,
      "本周过关标准：" + d.weekDepth,
      "本周已完成：" + (d.doneThisWeek.length ? d.doneThisWeek.join("；") : "暂无打卡"),
      "历史已完成任务：" + doneAll,
      "最近问过你的问题：" + (d.questions.length ? d.questions.join(" ｜ ") : "暂无记录"),
      "最近面试记录：" + (d.rounds.length ? d.rounds.join("；") : "还没做过模拟面试"),
      "薄弱分类：" + d.weak,
      "===== 记忆区结束 =====",
      "",
      "【跨窗口记忆说明】他这几天在不同日期的窗口里学过什么，会作为「背景资料」附在他本次提问的前面。",
      "那些内容就是你的记忆，直接接着讲，绝不要回答「我看不到之前的对话」。",
      "",
      "【看图能力】你可以看用户粘贴的截图。看到图片时先复述观察到的关键信息再回答；看不清就说看不清，不要猜。",
      "",
      "【画图规范】需要示意图时输出一个 ```svg 代码块：viewBox=\"0 0 900 520\"、浅色背景、中文标注、自包含、不使用 script / 外部资源 / foreignObject。",
      "",
      "【根本原则：什么值得他花时间（最高优先级）】",
      "他学任何东西的前提是：不能一两年后被更强的 AI 直接替代。按下面三条判断：",
      "· **只深挖「AI 越强越值钱」的判断力**：什么算做对了（评估标准/rubric）、AI 什么时候在编（幻觉归因）、哪个方案代价更小（取舍）、哪些边界不能越（安全）。这些 AI 替不了，因为 AI 不知道自己错在哪。",
      "· **操作层一律「会用即可」**：命令、配置、框架 API、Dockerfile、schema 写法 —— 带版本号、半年一换、AI 一键生成。给他成品，不值得练。",
      "· **判断要不要深入的问句**：这东西如果明天消失，他的能力还剩多少？剩得多就值得深，剩得少就走过场。",
      "· 如果他正在花时间学一个会被替代的操作细节，**直接打断并告诉他**：这块不值得，改成学 X。",
      "",
      "【排版硬约束（违反任何一条都算回答失败）】",
      "0. **开头第一句必须是**：上次我们做到 X，这次从 Y 开始。（让我知道你接上了，不是重新开题）",
      "1. 一个意思一段，**每段不超过 3 行**。禁止「一句话一段 → 一条 --- → 再一句话一段」。",
      "2. 全文加粗 **不超过 5 处**，只加粗两种：结论句、危险操作。",
      "3. 表格只在「真正并列的 3 项以上」时用；能一句话说完的，不许做成表格。",
      "4. 分割线 --- 全文**最多 1 条**，只放在「正式开始动手」之前。",
      "5. 单行不超过 40 字；超了就换行。",
      "6. 代码块之外不要用 emoji 做条目符号；条目用 1. 2. 3.。",
      "",
      "【回答要求】",
      "1. 先给结论和可执行动作，再解释原因；不要长篇教科书式铺垫。",
      "2. 涉及代码时给最小可运行示例（Python 优先），并指出常见坑。",
      "2.1 **代码必须逐行注释，且要能一段一段读懂**：",
      "     · 每行有意义的代码，上方一行 `#` 注释，写「它在干什么 + 为什么这么写」。",
      "     · 每 3–8 行插一条 `# ---` 段注释，写「上一步拿到 X → 这一块用它做 Y」。",
      "     · 嵌套最多 2 层；一行只做一件事，长表达式拆行，变量名要能读（raw_rows 而不是 a）。",
      "     · 代码块外先给 3 行「读这段的顺序」：先看哪行、顺着什么往下、哪行是核心。",
      "     · 代码块后给「改这里试试」：指出 1–2 个能安全改的参数和改动后的预期变化。",
      "3. 如果他问的东西偏离目标岗位或性价比低，直接说「不值得，建议改成 X」。",
      "4. 每次回答结尾给「下一步（今天就能做的 2–3 件事）」。",
      "5. 不确定的技术细节要说明不确定，不要编造 API 或论文。",
      "6. 他是初学者：专业术语第一次出现必须用括号给一句大白话解释。",
      "7. 给命令时说明它在干什么、会改动电脑的哪一处。",
      "8. **文件路径固定**：他所有练习代码的根目录是 `C:\\Users\\Giraffe\\code\\agent-lab`（已有 git 仓库和 .venv）。",
      "    · 要建文件就放进 agent-lab 里，按 `weekNN` 分周目录；周目录第一次用到时先建再进。",
      "    · 严禁用 `Desktop`、`~`、`$HOME` 作为建文件位置。",
      "    · 需要独立仓库时放在 `C:\\Users\\Giraffe\\code\\<项目名>`，与 agent-lab 平级，并说明这一点。",
      "    · 每步写清当前所在目录；结尾让他跑一次 `Get-Location` 确认。"
    ].join("\n");
  }

  /* ====================== 离线卡片 ====================== */
  function cardFor(kind, userText) {
    const d = progressDigest();
    const header = "【当前状态】第 " + d.weekIndex + " 周 · " + d.week + " · 完成 " + d.totalDone + "/" + d.totalTasks + " · 累计 " + d.hours + "h";
    if (kind === "report") {
      return ["# 学习进度汇报（请帮我评估与调整计划）", header,
        "本周目标：" + d.weekGoal, "本周完成：" + (d.doneThisWeek.join("；") || "暂无"),
        "我的问题：" + (userText || "请评估我的进度并指出下一步重点")].join("\n");
    }
    if (kind === "quiz") return ["# 请给我出 3 道检验题", header, "本周过关标准：" + d.weekDepth,
      "要求：题目要能测出我是否真懂，不要考记忆。", "我的补充：" + (userText || "")].join("\n");
    if (kind === "interview") return ["# 请分析我的面试表现", header,
      "最近记录：" + (d.rounds.join("；") || "暂无"), "薄弱分类：" + d.weak,
      "我的补充：" + (userText || "")].join("\n");
    if (kind === "next") return ["# 下周该学什么", header, "请结合我的进度给下周的 3 件事。", "我的补充：" + (userText || "")].join("\n");
    if (kind === "image") return ["# 请给我一张教学插图", header, "主题：" + (userText || "")].join("\n");
    return ["# 我卡住了，请帮我看一下", header,
      "我的问题：" + (userText || ""), "请先判断是理解问题还是操作问题，再给最小可行路径。"].join("\n");
  }

  /* ====================== Markdown / SVG 渲染 ====================== */
  function sanitizeSvg(text) {
    return String(text || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
      .replace(/javascript:/gi, "");
  }

  function fmtMarkdown(text) {
    // 顺序很重要：先抽代码块和 SVG，再转义，最后回填并处理换行。
    const svgStore = [];
    const codeStore = [];
    let raw = String(text || "");

    // ① 抽出 ```svg
    raw = raw.replace(/```svg\r?\n?([\s\S]*?)```/gi, function (m, code) {
      const idx = svgStore.push(sanitizeSvg(code)) - 1;
      return "\u0000SVG" + idx + "\u0000";
    });

    // ② 抽出其它 ```lang 代码块（先抽出，避免里面的 < > 被转义，也避免被换行处理破坏）
    raw = raw.replace(/```([a-zA-Z0-9+#._-]*)\r?\n?([\s\S]*?)```/g, function (m, lang, code) {
      const idx = codeStore.push({ lang: lang || "sh", code: code.replace(/\s+$/, "") }) - 1;
      return "\u0000CODE" + idx + "\u0000";
    });

    // ③ 转义（此时正文里已无代码块）
    let out = App.escape(raw);

    // ④ 行内 markdown（必须在换行处理之前，且不能跨行）
    out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img class="bubble-img" alt="$1" src="$2">');
    out = out.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

    // ⑤ 按行处理：标题 / 有序列表 / 无序列表 / 普通段落 / 空行
    const lines = out.split(/\r?\n/);
    const html = [];
    let listType = "";        // "ol" | "ul" | ""
    let para = [];            // 累积普通行

    function flushPara() {
      if (para.length) {
        html.push('<p class="md-p">' + para.join("<br>") + '</p>');
        para = [];
      }
    }
    function closeList() {
      if (listType) { html.push("</" + listType + ">"); listType = ""; }
    }

    lines.forEach(function (line) {
      const t = line.trim();

      // 空行 → 结束当前段落与列表
      if (!t) {
        flushPara(); closeList();
        return;
      }

      // 标题：# / ## / ###
      const h = /^(#{1,4})\s+(.+)$/.exec(t);
      if (h) {
        flushPara(); closeList();
        const lvl = Math.min(h[1].length + 2, 5);
        html.push('<h' + lvl + ' class="md-h">' + h[2] + '</h' + lvl + '>');
        return;
      }

      // 有序列表：1. / 2) / ①
      const ol = /^(\d{1,2})[.、)]\s+(.+)$/.exec(t) || /^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.+)$/.exec(t);
      if (ol) {
        flushPara();
        if (listType !== "ol") { closeList(); html.push('<ol class="md-ol">'); listType = "ol"; }
        html.push("<li>" + ol[2] + "</li>");
        return;
      }

      // 无序列表：- / * / •
      const ul = /^[-*•]\s+(.+)$/.exec(t);
      if (ul) {
        flushPara();
        if (listType !== "ul") { closeList(); html.push('<ul class="md-ul">'); listType = "ul"; }
        html.push("<li>" + ul[1] + "</li>");
        return;
      }

      // 步骤/小标题行（步骤 1：xxx、第 1 步：xxx、**xxx**）→ 单独成段并加粗
      if (/^(步骤\s*\d|第\s*\d\s*步|Step\s*\d)/i.test(t)) {
        flushPara(); closeList();
        html.push('<p class="md-step">' + t + '</p>');
        return;
      }

      // 普通行 → 进段落（内部用 <br> 连接）
      closeList();
      para.push(line);
    });

    flushPara();
    closeList();
    out = html.join("\n");

    // ⑥ 回填代码块与 SVG
    out = out.replace(/\u0000CODE(\d+)\u0000/g, function (m, i) {
      const c = codeStore[Number(i)] || { lang: "sh", code: "" };
      return '<pre class="md-code" data-lang="' + c.lang + '">' + c.code + '</pre>';
    });
    out = out.replace(/\u0000SVG(\d+)\u0000/g, function (m, i) {
      const clean = svgStore[Number(i)] || "";
      return '<div class="svg-block" data-svg="' + encodeURIComponent(clean) + '">' +
        '<div class="svg-bar">\ud83d\uddbc\ufe0f \u793a\u610f\u56fe <button class="chip svg-dl">\u4e0b\u8f7d PNG</button>' +
        '<button class="chip svg-src-btn">\u770b\u6e90\u7801</button></div>' +
        '<div class="svg-body"></div><pre class="svg-src">' + App.escape(clean) + '</pre></div>';
    });

    return out;
  }

  function hydrateSvg(root) {
    $$(".svg-block", root).forEach(function (block) {
      const body = block.querySelector(".svg-body");
      if (body && !body.dataset.done) {
        body.innerHTML = decodeURIComponent(block.dataset.svg || "");
        body.dataset.done = "1";
      }
      const dl = block.querySelector(".svg-dl");
      if (dl && !dl.dataset.bound) {
        dl.dataset.bound = "1";
        dl.addEventListener("click", function () {
          const svg = block.querySelector("svg");
          if (svg) svgToPng(svg, "示意图.png", block);
        });
      }
      const sb = block.querySelector(".svg-src-btn");
      if (sb && !sb.dataset.bound) {
        sb.dataset.bound = "1";
        sb.addEventListener("click", function () { block.classList.toggle("show-src"); });
      }
    });
  }

  function svgToPng(svgEl, name, block) {
    try {
      const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
      const w = (vb && vb.width) || svgEl.clientWidth || 900;
      const h = (vb && vb.height) || svgEl.clientHeight || 520;
      const data = new XMLSerializer().serializeToString(svgEl);
      const url = URL.createObjectURL(new Blob([data], { type: "image/svg+xml;charset=utf-8" }));
      const img = new Image();
      img.onload = function () {
        const scale = 2;
        const cv = document.createElement("canvas");
        cv.width = w * scale; cv.height = h * scale;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(b);
          a.download = name;
          a.click();
          App.toast("示意图已下载", "ok");
        }, "image/png");
      };
      img.onerror = function () { App.toast("PNG 转换失败，可点「看源码」自行保存 SVG", "bad"); };
      img.src = url;
    } catch (e) {
      App.toast("PNG 转换失败，可点「看源码」自行保存 SVG", "bad");
    }
  }

  /* ====================== 气泡渲染 ====================== */
  function stripOldImages(list) {
    let seen = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i].content;
      if (Array.isArray(c)) {
        const imgs = c.filter(x => x && x.type === "image_url");
        if (imgs.length) {
          seen += imgs.length;
          if (seen > KEEP_IMAGES) {
            list[i] = {
              role: list[i].role,
              content: c.filter(x => x.type === "text").map(x => x.text).join("\n") + "\n（历史图片已清理，仅保留最近 " + KEEP_IMAGES + " 张）"
            };
          }
        }
      }
    }
    return list;
  }

  function bubble(role, content) {
    const wrap = document.createElement("div");
    wrap.className = "bubble-row " + role;
    const av = document.createElement("div");
    av.className = "bubble-avatar";
    av.textContent = role === "user" ? "🙋" : "🤖";
    const b = document.createElement("div");
    b.className = "bubble";
    let imgs = "";
    let txt = content;
    if (Array.isArray(content)) {
      imgs = content.filter(i => i && i.type === "image_url")
        .map(i => '<img class="bubble-img" src="' + (i.image_url && i.image_url.url || "") + '" alt="上传的图片">').join("");
      txt = content.filter(i => i.type === "text").map(i => i.text).join("\n");
    }
    if (role === "assistant") {
      b.innerHTML = fmtMarkdown(txt);
    } else {
      b.innerHTML = imgs + '<div class="md-plain">' + App.escape(txt) + '</div>';
    }
    wrap.appendChild(av);
    wrap.appendChild(b);
    return wrap;
  }

  function renderHistory() {
    const box = $("#chatMessages");
    if (!box) return;
    box.innerHTML = "";
    if (!history.length) {
      const m = winMeta(currentWin);
      box.appendChild(bubble("assistant",
        "我是你的专属学习教练。你可以：\n" +
        "· 直接问技术问题（例：为什么我的 asyncio 批量调用比多线程还慢）\n" +
        "· 汇报进度（例：本周完成 W3 的 CLI 工具，卡在 pydantic 校验）\n" +
        "· 粘贴截图问我（报错截图、别人的代码、论文里的图）—— 我能看图\n" +
        "· 让我「画示意图」「生成教学插图」\n\n" +
        "当前窗口：**" + m.label + "**" + (m.title ? "（" + m.title + "）" : "") +
        "。我记得你的学习进度和之前问过的问题。"));
    } else {
      history.forEach(m => box.appendChild(bubble(m.role, m.content)));
    }
    hydrateSvg(box);
    box.scrollTop = box.scrollHeight;
  }

  function saveHistory() { saveWindow(); }

  /* ====================== 图片附件 ====================== */
  function readImage(file, maxW, quality) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) { reject(new Error("不是图片文件")); return; }
      if (file.size > 12 * 1024 * 1024) { reject(new Error("图片超过 12MB，请先压缩")); return; }
      const fr = new FileReader();
      fr.onload = function () {
        const img = new Image();
        img.onload = function () {
          const scale = Math.min(1, maxW / img.width);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const cv = document.createElement("canvas");
          cv.width = w; cv.height = h;
          const ctx = cv.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL("image/jpeg", quality));
        };
        img.onerror = function () { reject(new Error("图片解析失败")); };
        img.src = fr.result;
      };
      fr.onerror = function () { reject(new Error("文件读取失败")); };
      fr.readAsDataURL(file);
    });
  }

  function dataUrlToFile(dataUrl) {
    try {
      const idx = dataUrl.indexOf(",");
      const head = dataUrl.slice(0, idx);
      const b64 = dataUrl.slice(idx + 1);
      const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/png";
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new File([arr], "pasted-image", { type: mime });
    } catch (e) { return null; }
  }

  async function filesFromClipboard(cd) {
    const out = [];
    const items = (cd && cd.items) || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const f = items[i].getAsFile();
        if (f && /^image\//.test(f.type)) out.push(f);
      }
    }
    if (out.length) return out;

    let html = "";
    try { html = (cd.getData && cd.getData("text/html")) || ""; } catch (e) { html = ""; }
    const m = html.match(/src=["'](data:image\/[a-z0-9.+-]+;base64,[^"']+)["']/i);
    if (m) {
      const f = dataUrlToFile(m[1]);
      if (f) return [f];
    }

    let txt = "";
    try { txt = ((cd.getData && (cd.getData("text/uri-list") || cd.getData("text/plain"))) || "").trim(); } catch (e) { txt = ""; }
    const firstLine = txt.split(/\s+/)[0] || "";
    if (/^(https?:|blob:)/i.test(firstLine)) {
      try {
        const r = await fetch(firstLine);
        const b = await r.blob();
        if (/^image\//i.test(b.type)) return [new File([b], "pasted-image", { type: b.type })];
      } catch (e) { /* 跨域，走失败提示 */ }
    }
    return out;
  }

  async function addFiles(files) {
    const list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    for (const f of list) {
      if (attachments.length >= MAX_ATTACH) { App.toast("一次最多 " + MAX_ATTACH + " 张图", "bad"); break; }
      try {
        const data = await readImage(f, 1920, 0.9);
        attachments.push(data);
      } catch (e) {
        App.toast("添加图片失败：" + e.message, "bad");
      }
    }
    renderAttachments();
  }

  function renderAttachments() {
    const strip = $("#attachStrip");
    if (!strip) return;
    strip.classList.toggle("has", attachments.length > 0);
    strip.innerHTML = attachments.map((a, i) =>
      '<div class="attach-thumb"><img src="' + a + '" alt="待发送图片"><button data-del-attach="' + i + '" title="移除">✕</button></div>'
    ).join("");
    $$("#attachStrip [data-del-attach]").forEach(b => b.addEventListener("click", function () {
      attachments.splice(Number(b.dataset.delAttach), 1);
      renderAttachments();
    }));
    const hint = $("#chatHint");
    if (hint) hint.innerHTML = attachments.length
      ? "已附加 <b>" + attachments.length + "</b> 张图（会自动压到 1920 宽发送，文字更清楚）"
      : "支持 <b>Ctrl+V 粘贴截图</b>、拖拽图片、或点 📎 上传（最多 4 张）。<b>建议只截报错那一段</b>，别截整屏。";
  }

  /* ====================== 发送 ====================== */
  async function send(text, opts) {
    const options = opts || {};
    const content = (text || "").trim();
    if (!content && !attachments.length) return;

    const userContent = attachments.length
      ? [{ type: "text", text: content || "请看这张图，告诉我关键信息，并结合我的学习目标给出建议。" }]
        .concat(attachments.map(u => ({ type: "image_url", image_url: { url: u } })))
      : content;

    history.push({ role: "user", content: userContent });
    renderHistory();
    $("#chatInput").value = "";
    const hadImages = attachments.length > 0;
    attachments = [];
    renderAttachments();

    const qs = App.state.progress.questions || (App.state.progress.questions = []);
    qs.push({ time: new Date().toLocaleString("zh-CN"), text: (content || "［图片提问］").slice(0, 500) });
    App.state.progress.questions = qs.slice(-60);
    App.persist();
    saveHistory();

    const online = App.state.settings.hasKey && App.state.serverOnline;
    if (!online) {
      const kind = /汇报|进度/.test(content) ? "report" : /出题|检验|考我/.test(content) ? "quiz"
        : /面试/.test(content) ? "interview" : /插图|画/.test(content) ? "image" : "stuck";
      const structured = /^#\s|【任务】|【当前状态】|【要教我的任务】/.test(content);
      const card = structured ? content : cardFor(kind, content);
      history.push({
        role: "assistant", content:
          "当前是离线模式，我无法直接回答" + (hadImages ? "（图片也无法分析）" : "") +
          "。把下面的结构化内容粘到 DSH 对话里发给我，我会给出完整回答。\n\n" + card
      });
      renderHistory(); saveHistory();
      return;
    }

    const pending = bubble("assistant", hadImages ? "正在看图并思考…" : "思考中…");
    pending.querySelector(".bubble").classList.add("loading-dots");
    $("#chatMessages").appendChild(pending);
    $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;

    try {
      const hist = history.slice(-SEND_WINDOW);
      const payload = [{ role: "system", content: systemPrompt() }];

      // 跨窗口记忆必须放进 user 消息里，不能只放 system prompt。
      // 实测：只写在 system 里，模型会当成「外部说明」而不认，
      // 仍回答「我看不到昨天的对话记录」；放在 user 消息里它才当成真实上下文。
      const mem = crossWindowMemory();
      if (mem && hist.length) {
        // 挂到「最后一条用户消息」前面，作为背景资料，不污染历史
        const lastUser = (function () {
          for (let i = hist.length - 1; i >= 0; i--) if (hist[i].role === "user") return i;
          return -1;
        })();
        if (lastUser >= 0) {
          const orig = hist[lastUser];
          const text = typeof orig.content === "string"
            ? orig.content
            : (Array.isArray(orig.content)
                ? orig.content.filter(p => p && p.type === "text").map(p => p.text || "").join(" ")
                : "");
          const merged = {
            role: "user",
            content: mem + "\n（上面是我这几天在这个网站上的学习记录，请当作你已经知道的事，别再说「看不到之前的对话」。）\n\n我这次问：" + text
          };
          if (Array.isArray(orig.content)) {
            // 保留图片：把图片部分接回去
            merged.content = [{ type: "text", text: merged.content }]
              .concat(orig.content.filter(p => p && p.type !== "text"));
          }
          payload.push.apply(payload, hist.slice(0, lastUser));
          payload.push(merged);
        } else {
          payload.push.apply(payload, hist);
        }
      } else {
        payload.push.apply(payload, hist);
      }

      const body = { messages: payload, temperature: 0.4 };
      if (options.thinking) body.thinking = options.thinking;
      const res = await App.post("/api/chat", body);
      pending.remove();
      if (res.ok) {
        history.push({ role: "assistant", content: res.content });
        if (res.hadImage) App.toast("已读图回答（模型 " + (res.model || "") + "）", "ok");
        App.rememberExchange(content, res.content, content.slice(0, 60));
      } else {
        history.push({ role: "assistant", content: "⚠️ " + res.error + "\n\n（离线模式：把问题和报错贴到 DSH 对话里问我。）" });
      }
    } catch (e) {
      pending.remove();
      history.push({ role: "assistant", content: "⚠️ 请求失败：" + e.message });
    }
    renderHistory(); saveHistory();
  }

  /* ====================== 5 档深度 + 分工 ====================== */
  const DESIGN_POINTS = ["评估标准", "评测集", "rubric", "检索策略", "记忆分层", "安全边界",
    "取舍", "为什么", "判断", "归因", "失败"];

  function splitRule(task) {
    const t = (task.text || "") + (task.desc || "");
    const isDesign = DESIGN_POINTS.some(k => t.indexOf(k) !== -1);
    if (isDesign) {
      return "【这一项怎么分工】\n" +
        "· **设计层归我**（这类判断）：给我 2–3 个候选方案 + 各自代价，让我选，不要替我定。\n" +
        "· **语法层归你**（写函数、读文件、try 放哪、字符串处理）：**直接给完整可跑代码**，我要的是看懂，不是背。\n" +
        "· 判断标准：我这辈子只用一次的，给代码；我以后每天要做决策的，才让我自己想。";
    }
    return "【这一项怎么分工】**整项都属于「拿走即用」**：请直接给完整可跑代码，按下面的代码规则逐行注释，让我能一行一行读下来并安全改动，不要留 NotImplementedError 让我填。";
  }

  const DEPTH_RULE = {
    core: "【深度：核心·深挖】这是面试会被追问的点。讲清原理 → 给完整示范代码（按代码规则逐行注释）→ 只在「设计判断」上让我选（见下面的分工）。",
    key: "【深度：必学】要真会，但允许查文档。给完整可跑代码（按代码规则逐行注释），让我改一处参数看变化。",
    use: "【深度：会用即可】不展开原理。直接给可粘贴的命令 / 配置，一句话说明它干了什么。目标 45 分钟内搞定。",
    ai: "【深度：交给AI】直接把成品给我（命令或代码），不要讲原理，10 分钟内做完。",
    skim: "【深度：了解·不深究】只讲 3 句话：它是什么、为什么存在、面试怎么答。不要让我动手。"
  };

  /* 代码注释硬规则：目标是「基础弱的人能逐行读懂并安全改一处」，
     所以要求逐行注释 + 段间衔接 + 允许看懂的低复杂度。 */
  const CODE_RULES = [
    "【代码注释硬约束（违反任何一条都算回答失败）】",
    "1. **每一行有意义的代码，上方必须有一行 `#`（或 `//`）注释**，写清两件事：它在干什么 + 为什么这么写。",
    "   · 反例：`df = df.dropna()`（无注释）",
    "   · 正例：`# 删掉有缺失值的行：脏数据进来会让后面统计全变 NaN`",
    "2. **每 3–8 行之间插一条「段注释」**，写清这块和上一块的连接关系，句式固定为「上一步拿到 X → 这一块用它做 Y」。",
    "   段注释单独占一行、以 `# ---` 开头，方便我一眼找到块边界。",
    "3. **嵌套层数最多 2 层**（一个 for 里最多一个 if）。要 3 层就说明该拆函数，请拆开并给函数起能读的中文名。",
    "4. **一行只做一件事**。长表达式必须拆行，每行结尾用 `\\`（shell）或括号换行（Python），不许出现需要横向读 100 字符的行。",
    "5. **每个代码块开头，代码块外先写 3 行以内的「读这段的顺序」**：先看哪行、再顺着什么往下看、哪行是核心。",
    "6. **变量名必须能读**：不要 `a` / `d` / `tmp1`，用 `raw_rows` / `clean_rows` / `bad_count` 这种一眼知道装什么的。",
    "7. **只留必要代码**：不要 import 一堆用不到的库，不要写异常捕获以外的防御代码，不要为了完整加 `if __name__ == \"__main__\"`。",
    "8. **代码块结尾加一段「改这里试试」**：指出 1–2 个可以安全改的数字或字符串，并说明改动后我该看到什么变化。"
  ];

  /* 工作目录硬规则：所有练习文件必须落在固定位置，不许散在桌面。
     桌面是我放快捷方式的地方，堆满 .py 会很难找。 */
  const WORKSPACE_RULES = [
    "【工作目录硬约束（违反算回答失败）】",
    "· 我的代码根目录固定在 `C:\\Users\\Giraffe\\code\\agent-lab`（已建好 git 仓库 + .venv）。",
    "· **本任务要建的文件，全部放进 `agent-lab` 里面**，不要在桌面或别处新建。",
    "· 一周一个子目录，命名用 `week02`、`week03` 这种零填充格式；本周练习都放同一个子目录。",
    "· 虚拟环境在根目录：`agent-lab\\.venv`。在 `week02` 里要用它，写 `..\\.venv\\Scripts\\python.exe -m ...`。",
    "  或者干脆先进根目录激活一次：`.\\.venv\\Scripts\\Activate.ps1`，再 `Set-Location .\\week02`。",
    "· 第一次进入时，第一条命令必须是「切到根目录 → 建本周目录 → 进去」，之后再写文件。",
    "· **禁止**出现 `cd ~\\Desktop`、`C:\\Users\\...\\Desktop`、`$HOME\\Desktop` 这类路径。",
    "· 若某个任务确实需要独立仓库（比如单独的项目 A/B），建在 `agent-lab` 的**兄弟目录**下：",
    "  `C:\\Users\\Giraffe\\code\\<项目名>`，并说明「这个和 agent-lab 平级」。",
    "· 每个步骤的「做什么」里要写清**当前所在目录**，让我随时知道自己站在哪。",
    "· 结尾给一条 `Get-Location` 让我确认位置，并列出本步骤新建了哪些文件。",
    "",
    "【建文件的方式（这条也常被违反）】",
    "· **不要用 `Set-Content` / `echo >` / here-string 把代码塞进终端**。",
    "  我引号、缩进、中文任一处理错，文件就坏了，而且我根本没法在里面改。",
    "· 正确做法：让我在 **VS Code** 里新建文件（`code .\\文件名.py` 打开），",
    "  然后我把代码块**整段粘进去、Ctrl+S 保存**。这样我能读、能改、能对照注释。",
    "· 如果必须用命令生成文件，只能用最简单的 `New-Item .\\x.py -Force` 建空文件，",
    "  再让我用编辑器粘内容，不要把代码内容写进命令行。"
  ];

  const FORMAT_RULES = [
    "【排版硬约束（违反任何一条都算回答失败）】",
    "0. **开头第一句必须是**：上次我们做到 X，这次从 Y 开始。（让我知道你接上了，不是重新开题）",
    "1. 一个意思一段，**每段不超过 3 行**。禁止「一句话一段 → 一条 --- → 再一句话一段」。",
    "2. 全文加粗 **不超过 5 处**，只加粗两种：结论句、危险操作。其余一律正常字重。",
    "3. 表格只在「真正并列的 3 项以上」时用；能一句话说完的，不许做成表格。",
    "4. 分割线 --- 全文**最多 1 条**，只放在「正式开始动手」之前。",
    "5. 单行不超过 40 字；超了就换行，不要让我横向读长句。",
    "6. 代码块之外，不要用 emoji 做条目符号；条目用 1. 2. 3.。",
    "",
    "【结构硬约束（这条最常被违反，务必遵守）】",
    "· **每个编号必须独占一行**，编号后**空一行再接下一个编号**，绝不把 5. 和 6. 挤在同一段里。",
    "· **步骤必须有前缀**：写「步骤 1：建虚拟环境」「步骤 2：看清脏在哪」，而不是「1. 建虚拟环境」然后跟一大段。",
    "· **每个步骤内部结构固定**：先一行「做什么：…」，再代码块，再一行「预期：…」，最后一行「⚠️ 坑：…」。四块之间空行。",
    "· **代码块前后各留一个空行**，不要把文字紧贴在 ``` 上。",
    "· 一段话超过 3 行就拆成两段；超过 3 个并列点就用列表。",
    "· 结尾的「下一步」必须是独立小标题 + 编号列表，不要塞在段落里。"
  ];

  function teachPrompt(week, task) {
    return [
      "# 请对我做一次「手把手教学」，目标是我自己动手做成，不是替我做完",
      "",
      "【所属周次】" + week.id + " · " + week.title + "（" + week.date + "）",
      "【本阶段目标】" + week.goal,
      "【要教我的任务】" + task.text,
      task.desc ? "【任务说明】" + task.desc : "",
      task.starter ? ("【起手式（必须从这里开始，不要自己编场景）】\n" +
        "· 我手上已有什么：" + task.starter.have + "\n" +
        "· 这次要做到什么程度：" + task.starter.want + "\n" +
        "· 第一个动作：" + task.starter.first) : "",
      "【这一周的过关标准】" + week.depth,
      DEPTH_RULE[task.need] || DEPTH_RULE.key,
      splitRule(task),
      task.box ? "【时间盒】" + task.box + " 分钟。到点做不完就停下来，告诉我「最小可行路径」，剩下的交给 AI。" : "",
      "",
      "【我的情况】我是完全初学者，看不懂没解释的专业名词；用的是 Windows 11 + 管理员权限的 PowerShell 7（pwsh），请给能直接粘贴的命令。",
      "",
      WORKSPACE_RULES.join("\n"),
      "",
      "【必须遵守的讲解规则】",
      "1. 任何术语第一次出现，必须紧跟括号用大白话解释。一句话里出现 3 个以上新词，先用两三句打比方把整件事讲明白。",
      "2. 每个命令都要说明两件事：它在干什么 + 会改动我电脑的哪里。命令放进代码块，作用用一行「#」注释写在命令上方。",
      "3. 坑要就地提示：某一步有常见错误，就在这一步下面写「⚠️ 这一步的坑：症状现象 → 原因 → 怎么改」。",
      "4. 不要用「各来一次」「走完一次完整 X」这种压缩说法，把要做的动作一个一个拆开列出。",
      "5. **只要出现代码块，就必须按下面的代码规则写**，我读不懂就等于没教。",
      "",
      CODE_RULES.join("\n"),
      "",
      FORMAT_RULES.join("\n"),
      "",
      "【回答结构】",
      "1. 这是什么、为什么值得花时间（3–6 行：它是什么 → 解决什么问题 → 对我有什么用）",
      "2. 动手前先确认（要准备什么、要不要管理员、要不要重启终端）",
      "3. 操作步骤（编号；每一步 = 做什么 + 命令 + 命令作用 + 预期现象 + ⚠️ 这一步的坑）",
      "4. 怎么验证成功（一条验证命令 + 预期输出长什么样）",
      "5. 学到什么程度算过关（一条能自己自检的标准）",
      "6. 一道 30 秒能答完的小练习，等我回答后再判分",
      "",
      "如果这一项其实不值得花时间，请直接说「不值得」，并告诉我应该改成做什么。"
    ].filter(Boolean).join("\n");
  }

  function deepPrompt(week, task) {
    return [
      "# 请带我把这件事「深挖透」，不是手把手做一遍",
      "",
      "【所属周次】" + week.id + " · " + week.title,
      "【要深挖的内容】" + task.text,
      task.desc ? "【任务说明】" + task.desc : "",
      task.starter ? ("【起手式】\n· 手上已有：" + task.starter.have + "\n· 做到什么程度：" + task.starter.want + "\n· 第一个动作：" + task.starter.first) : "",
      DEPTH_RULE[task.need] || DEPTH_RULE.key,
      splitRule(task),
      "",
      "我对这块的目的不是「会操作」，而是「能讲清楚、能扛住追问」。请按这个顺序展开：",
      "",
      "1. **它到底解决什么问题**：不用它的时候人们怎么办？它的代价是什么？",
      "2. **核心机制**：用一张简化的流程图或伪代码讲清它内部怎么跑（能画 SVG 就画）。",
      "3. **关键取舍**：有哪 2–3 个设计选择，各自牺牲了什么、换来了什么。",
      "4. **面试怎么答**：给出 60 秒的口头回答模板；再列出最可能追问的 3 个问题。",
      "5. **常见误解**：初学者最容易搞错哪 2 点？",
      "",
      "【深度要求】" + (task.need === "core"
        ? "这是我的护城河，请讲到我能在白板上重画它的机制，并说出至少两个失败模式。"
        : task.need === "skim"
          ? "这块我只是了解层面，请控制在一屏内。"
          : "讲到我能在项目里正确选它、并在被质疑时说清取舍即可。"),
      "",
      "【我的情况】初学者，术语必须第一次出现就用括号解释。讲完先不要给我练习题，等我追问。",
      "",
      WORKSPACE_RULES.join("\n"),
      "",
      "",
      CODE_RULES.join("\n")
    ].filter(Boolean).join("\n");
  }

  /* 手把手/深挖的统一入口：
     W 分组本身不能对话，所以落到「今天的日期窗口」，并把它归到该周。 */
  function enterWeekChat(weekId) {
    const today = dayKey();
    ensureDay(today);
    setDayOwner(today, weekId);          // 自动归到这一周
    App.go("chat");
    setWindow(today);
    renderWinBar();
    renderDayOwner();
    return today;
  }

  function teachTask(week, task) {
    enterWeekChat(week.id);
    App.toast("已进入今天的窗口，并归到「" + week.id + "」：" + task.text.slice(0, 14) + "…", "ok");
    const prompt = teachPrompt(week, task);
    setTimeout(function () { send(prompt); }, 220);
  }

  function deepTask(week, task) {
    enterWeekChat(week.id);
    App.toast("已进入今天的窗口（归到 " + week.id + "），开始深挖：" + task.text.slice(0, 14) + "…", "ok");
    setTimeout(function () { send(deepPrompt(week, task)); }, 220);
  }

  /* ====================== 关注清单 ====================== */
  function renderWatchBar() {
    const bar = $("#watchBar");
    if (!bar) return;
    const list = (App.state.memory && App.state.memory.watchlist) || [];
    if (!list.length) {
      bar.innerHTML = '<span class="muted small">⭐ 关注清单还空着 —— 去「GitHub 热榜」把想学的项目加进来，这里就能直接问</span>';
      return;
    }
    bar.innerHTML = '<span class="wb-label">⭐ 想学的项目：</span>' +
      list.slice(0, 12).map(function (it, i) {
        const name = it.name || it.repo || "未命名";
        return '<button class="wb-chip" data-watch="' + i + '" title="点一下，让模型讲清这个项目适不适合你">' +
          App.escape(String(name).slice(0, 28)) + '</button>';
      }).join("") +
      '<button class="wb-chip more" data-watch-more="1" title="在「长期记忆」页管理关注清单">管理 ›</button>';
    $$("#watchBar [data-watch]").forEach(function (b) {
      b.addEventListener("click", function () {
        const it = list[Number(b.dataset.watch)] || {};
        const name = it.name || it.repo || "这个项目";
        const ask = "我在 GitHub 热榜关注了「" + name + "」，它被标注为【" + (it.level || "未评级") + " · " +
          (it.kind || "未分类") + "】。\n\n请结合我的画像和当前学习阶段回答三件事：\n" +
          "1. 这个项目**对我现在**（第 " + App.weekIndexOf() + " 周）有没有必要花时间？说清「值得学」还是「只是好用」。\n" +
          "2. 如果值得，我该花多久、看哪几个文件、能学到什么具体能力？\n" +
          "3. 如果不值得，告诉我它对应我计划里的哪一块。";
        $("#chatInput").value = ask;
        $("#chatInput").focus();
        App.toast("已填入提问，按 Ctrl+Enter 发送", "ok");
      });
    });
    const more = $("#watchBar [data-watch-more]");
    if (more) more.addEventListener("click", function () { App.go("memory"); });
  }

  /* ====================== 跨窗口记忆 ======================
     之前每个日期窗口是孤岛：发送时只带当前窗口 history，system prompt 里
     也没有别的窗口内容，所以「昨天讲到哪、卡在哪」今天完全不知道。
     这里做两件事把它们接起来：
       1) 收集其它窗口的对话，压成「上次做到哪」的摘要送进 system prompt
       2) 附上最近一次窗口的小结（做得好/还薄弱/下一步）
     不做全文拼接（token 会炸），只取每个窗口末尾几轮的关键内容。 */

  const CROSS_MEMORY_CHARS = 1600;   // 跨窗口记忆总预算（小结 + 摘录一起算）
  const CROSS_WINDOW_TAIL = 2;       // 每个历史窗口只取最后 2 轮
  const CROSS_MAX_WINDOWS = 4;       // 最多看最近 4 个有对话的窗口
  const ASK_CHARS = 80;              // 我的提问截断长度
  const ANS_CHARS = 60;              // 它的回答截断长度（只要一句方向即可）

  function allWindowIds() {
    const ids = [];
    savedDays().forEach(d => ids.push(d.id));
    if (ids.indexOf("free") === -1) ids.push("free");
    return ids;
  }

  function readWindowHistory(id) {
    try {
      const raw = localStorage.getItem(winStorageKey(id));
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function msgText(m) {
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content.filter(p => p && p.type === "text").map(p => p.text || "").join(" ");
    }
    return "";
  }

  /* 把某窗口压成几行：只留「我问了什么 / 它答的第一句」，够判断进度即可 */
  function digestWindow(id) {
    const h = readWindowHistory(id);
    const pairs = [];
    let lastUser = "";
    h.forEach(function (m) {
      if (m.role === "user") {
        const t = msgText(m).trim().replace(/\s+/g, " ");
        // 跳过「手把手/深挖」这种自动注入的长提示词，只留真人提问
        if (t && t.indexOf("# 请对我做一次") === -1 && t.indexOf("# 请带我把这件事") === -1) {
          lastUser = t.slice(0, ASK_CHARS);
        }
      } else if (m.role === "assistant" && lastUser) {
        // 只取回答的第一句：后面通常是步骤细节，对「接上下文」没用
        let a = msgText(m).trim().replace(/\s+/g, " ");
        const cut = a.search(/[。！？\n]/);
        if (cut > 0 && cut < ANS_CHARS) a = a.slice(0, cut);
        else a = a.slice(0, ANS_CHARS);
        pairs.push({ q: lastUser, a: a });
        lastUser = "";
      }
    });
    return pairs.slice(-CROSS_WINDOW_TAIL);
  }

  function crossWindowMemory() {
    const ids = allWindowIds().filter(id => id !== currentWin);
    const lines = [];
    let budget = CROSS_MEMORY_CHARS;

    // ① 优先：已生成的小结（信息密度最高，先占预算）
    let sums = {};
    try { sums = JSON.parse(localStorage.getItem(App.userKey(LS_SUMMARY)) || "{}"); } catch (e) { sums = {}; }
    const sumIds = Object.keys(sums).filter(id => id !== currentWin).sort();
    if (sumIds.length) {
      const block = [];
      for (const id of sumIds.slice(-3).reverse()) {
        const s = sums[id] || {};
        const meta = winMeta(id);
        const parts = [];
        if (s.good) parts.push("做到了：" + s.good);
        if (s.weak) parts.push("卡在：" + s.weak);
        if (s.next) parts.push("下一步：" + s.next);
        if (!parts.length) continue;
        const line = "· " + meta.label + " → " + parts.join("；");
        if (line.length > budget) break;
        block.push(line);
        budget -= line.length;
      }
      if (block.length) {
        lines.push("【之前窗口的小结（他自己点「分析」生成的，可信度高，优先参考）】", block.join("\n"), "");
      }
    }

    // ② 其次：最近几个有对话的窗口，取末尾几轮原话
    const withTalk = ids.map(function (id) {
      return { id: id, pairs: digestWindow(id) };
    }).filter(x => x.pairs.length);
    withTalk.sort((a, b) => (a.id < b.id ? 1 : -1));   // 日期窗口 id 可按名字排序，新的在前

    if (withTalk.length && budget > 200) {
      const head = "【最近几个窗口聊过什么（原话摘录，越靠前越近）】";
      lines.push(head);
      const seen = {};      // 去重：同一句提问在多个窗口重复出现时只留第一次
      let shown = 0;
      for (const w of withTalk.slice(0, CROSS_MAX_WINDOWS)) {
        if (budget <= 150) break;
        const meta = winMeta(w.id);
        const wl = ["◆ " + meta.label + " " + meta.title];
        let wlen = wl[0].length;
        for (const p of w.pairs) {
          const sig = p.q.slice(0, 40);
          if (seen[sig]) continue;      // 已经说过同样的话，跳过
          const line = "  我：" + p.q + " ／ 它：" + p.a;
          if (wlen + line.length > budget) break;
          seen[sig] = 1;
          wl.push(line);
          wlen += line.length;
        }
        if (wl.length > 1) {
          lines.push(wl.join("\n"));
          budget -= wlen;
          shown++;
        }
      }
      if (!shown) lines.pop();
      else lines.push("");
    }

    if (!lines.length) return "";
    return ["===== 跨窗口记忆（其他窗口发生过的事，你要接上，不要当第一次见面）====="]
      .concat(lines)
      .concat(["===== 跨窗口记忆结束 =====", ""])
      .join("\n");
  }

  /* ====================== 本窗口小结 ====================== */
  function renderWinSummary() {
    const box = $("#winSummary");
    if (!box) return;
    let all = {};
    try { all = JSON.parse(localStorage.getItem(App.userKey(LS_SUMMARY)) || "{}"); } catch (e) { all = {}; }
    const s2 = all[currentWin];
    if (!s2) {
      box.innerHTML = '<p class="muted small">点右上「分析」，模型会读这一窗的对话，告诉你这块「做得好 / 还薄弱 / 下一步」。</p>';
      return;
    }
    box.innerHTML =
      '<div class="ws-when muted small">' + App.escape(s2.at || "") + ' · 基于 ' + (s2.n || 0) + ' 轮对话</div>' +
      '<div class="ws-row ok"><b>做得好的</b><span>' + App.escape(s2.good || "—") + '</span></div>' +
      '<div class="ws-row bad"><b>还薄弱的</b><span>' + App.escape(s2.weak || "—") + '</span></div>' +
      '<div class="ws-row next"><b>下一步</b><span>' + App.escape(s2.next || "—") + '</span></div>';
  }

  async function summarizeWindow() {
    const box = $("#winSummary");
    const btn = $("#btnSummarizeWin");
    const users = history.filter(m => m.role === "user").length;
    if (!users) { App.toast("这个窗口还没有对话，先聊几句再分析", "bad"); return; }
    if (btn) { btn.disabled = true; btn.textContent = "分析中…"; }
    if (box) box.innerHTML = '<p class="muted small">正在读这一窗的 ' + users + ' 轮对话…</p>';

    const transcript = history.filter(m => m.role !== "system").slice(-20).map(function (m) {
      let txt = "";
      if (typeof m.content === "string") txt = m.content;
      else if (Array.isArray(m.content)) txt = m.content.filter(p => p.type === "text").map(p => p.text).join(" ");
      return (m.role === "user" ? "【我】" : "【教练】") + String(txt).slice(0, 600);
    }).join("\n");

    const meta = winMeta(currentWin);
    const prompt = "下面是「" + meta.label + " · " + meta.title + "」这个窗口的对话记录。" +
      "请只分析这一窗，输出严格三段（每段不超过 2 句，直给结论，不要客套）：\n" +
      "做得好的：…\n还薄弱的：…\n下一步：…\n\n对话记录：\n" + transcript;

    try {
      const res = await App.post("/api/chat", {
        messages: [
          { role: "system", content: "你是学习教练。只做简短归因分析，不重复教学内容，不客套。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        thinking: "low"
      });
      if (!res.ok) throw new Error(res.error || "分析失败");
      const text = String(res.content || "");
      const pick = function (key) {
        const m = text.match(new RegExp(key + "[：:]\\s*([^\\n]+)"));
        return m ? m[1].trim() : "";
      };
      const rec = { at: new Date().toLocaleString("zh-CN"), n: users, good: pick("做得好的"), weak: pick("还薄弱的"), next: pick("下一步") };
      let all = {};
      try { all = JSON.parse(localStorage.getItem(App.userKey(LS_SUMMARY)) || "{}"); } catch (e) { all = {}; }
      all[currentWin] = rec;
      localStorage.setItem(App.userKey(LS_SUMMARY), JSON.stringify(all));
      renderWinSummary();
      App.toast("本窗口小结已更新", "ok");
    } catch (e) {
      if (box) box.innerHTML = '<p class="muted small">分析失败：' + App.escape(e.message) + '</p>';
    }
    if (btn) { btn.disabled = false; btn.textContent = "分析"; }
  }

  /* ====================== 教学插图 ====================== */
  function lastTopic() {
    const qs = (App.state.progress.questions || []);
    for (let i = qs.length - 1; i >= 0; i--) {
      const t = (qs[i].text || "").trim();
      if (t && !/^#|【|🎨|🖼️/.test(t) && t.length > 3) return t.slice(0, 80);
    }
    const d = progressDigest();
    return d.doneThisWeek[0] || "AI Agent 开发学习路径";
  }

  async function generateIllustration(promptText) {
    if (!App.state.settings.hasKey || !App.state.serverOnline) {
      App.toast("离线模式无法生成插图", "bad");
      return;
    }
    const topic = (promptText || lastTopic() || "").trim();
    const full = "教学示意图，扁平矢量风格，浅色背景，中文标注清晰工整，构图简洁不要多余装饰：" + topic;
    const pending = bubble("assistant", "正在生成教学插图…");
    pending.querySelector(".bubble").classList.add("loading-dots");
    $("#chatMessages").appendChild(pending);
    try {
      const res = await App.post("/api/image", { prompt: full, size: "1024x1024" });
      pending.remove();
      if (res.ok && res.url) {
        history.push({ role: "assistant", content: "![教学插图](" + res.url + ")\n\n主题：" + topic });
        App.toast("插图已生成", "ok");
      } else {
        history.push({ role: "assistant", content: "⚠️ 生成失败：" + (res.error || "未知错误") });
      }
    } catch (e) {
      pending.remove();
      history.push({ role: "assistant", content: "⚠️ 生成失败：" + e.message });
    }
    renderHistory(); saveHistory();
  }

  function askForSvg() {
    send("请用一张示意图帮我理解我最近问的知识点（" + lastTopic() + "）。\n" +
      "**只输出一个 ```svg 代码块**，不要额外解释。要求：viewBox=\"0 0 900 520\"、浅色背景、中文标注、自包含、不使用外部资源。",
      { thinking: "low" });
  }

  /* ====================== 侧栏 / 快捷 ====================== */
  function renderProgress() {
    const d = progressDigest();
    const box = $("#chatProgress");
    if (!box) return;
    box.innerHTML =
      '<div class="bars"><div class="bar-row"><span>总完成度</span>' +
      '<span class="b-track"><i class="b-fill" style="width:' + d.overall + '%"></i></span>' +
      '<span class="b-val">' + d.overall + '%</span></div></div>' +
      '<ul class="bullet-list" style="margin-top:10px">' +
      "<li><b>当前进度</b>：" + App.escape(d.week) + (d.nextTask ? "<br><span class=\"muted small\">下一项：" + App.escape(d.nextTask.slice(0, 30)) + "…</span>" : "") + "</li>" +
      "<li><b>已完成任务</b>：" + d.totalDone + " / " + d.totalTasks + "</li>" +
      "<li><b>累计时长</b>：" + d.hours + " 小时</li>" +
      "<li><b>最近面试</b>：" + App.escape(d.rounds.length ? d.rounds.join("；") : "暂无记录") + "</li>" +
      "<li><b>薄弱分类</b>：" + App.escape(d.weak) + "</li>" +
      "</ul>";
  }

  function renderQuick() {
    const box = $("#chatQuick");
    if (!box) return;
    box.innerHTML = QUICK.map(q => '<button class="chip" data-quick="' + q.kind + '">' + App.escape(q.label) + '</button>').join("");
    $$("#chatQuick [data-quick]").forEach(b => b.addEventListener("click", function () {
      const kind = b.dataset.quick;
      if (kind === "svg") { askForSvg(); return; }
      if (kind === "image") { generateIllustration(""); return; }
      $("#chatInput").value = cardFor(kind, "").split("\n").slice(2).join("\n").trim();
      $("#chatInput").focus();
      App.toast("已填入输入框，可编辑后发送", "ok");
    }));
  }

  /* ====================== 事件 ====================== */
  function bind() {
    $("#btnSendChat").addEventListener("click", () => send($("#chatInput").value));
    $("#chatInput").addEventListener("keydown", function (e) {
      if (e.ctrlKey && e.key === "Enter") send($("#chatInput").value);
    });

    document.addEventListener("paste", async function (e) {
      const host = e.target && e.target.closest ? e.target.closest("#view-chat") : null;
      if (!host) return;
      const cd = e.clipboardData;
      if (!cd) return;

      let hasFile = false;
      const items = cd.items || [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file" && /^image\//i.test(items[i].type)) { hasFile = true; break; }
      }
      let html = "", txt = "";
      try { html = cd.getData("text/html") || ""; } catch (err) { html = ""; }
      try { txt = cd.getData("text/plain") || ""; } catch (err) { txt = ""; }
      const htmlImg = /src=["']data:image\//i.test(html);
      const urlImg = /^https?:\/\/\S+\.(png|jpe?g|webp|gif|bmp)/i.test(txt.trim());
      if (!hasFile && !htmlImg && !urlImg) return;

      const files = await filesFromClipboard(cd);
      if (!files.length) {
        App.toast("这张图没接住：建议用 Win+Shift+S 重新截图后直接 Ctrl+V，或把图片拖进来", "bad");
        return;
      }
      e.preventDefault();
      await addFiles(files);
      App.toast("已粘贴 " + files.length + " 张图，可以直接发送", "ok");
    });

    $("#btnAttach").addEventListener("click", () => $("#chatFile").click());
    $("#chatFile").addEventListener("change", function (e) {
      addFiles(e.target.files);
      e.target.value = "";
    });

    const main = $(".chat-main");
    if (main) {
      ["dragenter", "dragover"].forEach(ev => main.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        main.classList.add("drag-over");
      }));
      ["dragleave", "drop"].forEach(ev => main.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        if (ev === "dragleave" && main.contains(e.relatedTarget)) return;
        main.classList.remove("drag-over");
      }));
      main.addEventListener("drop", function (e) {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length) addFiles(dt.files);
      });
    }

    $("#btnClearChat").addEventListener("click", function () {
      const meta = winMeta(currentWin);
      if (!confirm("清空「" + meta.label + " · " + meta.title + "」这个窗口的对话记录？\n\n只清这一窗，其它窗口和长期记忆都不受影响。")) return;
      history = [];
      saveWindow();
      renderHistory();
      renderWinBar();
      App.toast("「" + meta.label + "」窗口已清空", "ok");
    });

    $("#btnPushProgress").addEventListener("click", async function () {
      try {
        const res = await App.pushProgressNow();
        App.toast(res.ok ? "已写回工作区：" + res.report : "写回失败", res.ok ? "ok" : "bad");
      } catch (e) { App.toast("写回失败：" + e.message, "bad"); }
    });

    const sumBtn = $("#btnSummarizeWin");
    if (sumBtn) sumBtn.addEventListener("click", function () { summarizeWindow(); });
  }

  /* ====================== 初始化 ====================== */
  function init() {
    try {
      const today = dayKey();
      ensureDay(today);
      const last = localStorage.getItem(App.userKey(LS_WIN));
      // 只接受「可对话窗口」（日期窗 / 自由窗）；旧的 W 窗口记录直接落到今天
      currentWin = (last && isChatWin(last) && winList().some(w => w.id === last)) ? last : today;
      if (!winList().some(w => w.id === currentWin)) currentWin = today;
    } catch (e) { currentWin = "free"; }
    loadWindow(currentWin);
    renderQuick();
    renderProgress();
    renderAttachments();
    renderWinBar();
    renderWatchBar();
    renderWinSummary();
    renderDayOwner();
    renderHistory();
    bind();
  }

  async function onEnter() {
    renderProgress();
    App.renderKeyState();
    if (App.state.serverOnline) await App.loadMemory();
    renderWinBar();
    renderWatchBar();
    renderWinSummary();
    renderDayOwner();
  }

  function openWindow(id, opts) {
    let target = id;
    // W1–W20 现在是分组，不可对话 → 落到今天的窗口并归到该周
    if (target && /^W\d+$/.test(target)) {
      const today = dayKey();
      ensureDay(today);
      setDayOwner(today, target);
      target = today;
    }
    if (!target || !winList().some(w => w.id === target)) target = "free";
    App.go("chat");
    setWindow(target);
    if (opts && opts.focus) {
      setTimeout(function () {
        const el = $("#chatInput");
        if (el) el.focus();
      }, 200);
    }
  }

  return {
    init: init, onEnter: onEnter, renderProgress: renderProgress,
    teachTask: teachTask, deepTask: deepTask, openWindow: openWindow,
    summarizeWindow: summarizeWindow
  };
})();
