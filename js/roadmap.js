/* ==========================================================================
   roadmap.js · 路线图页渲染
   ========================================================================== */
window.Roadmap = (function () {
  "use strict";
  const $ = App.$, $$ = App.$$;
  const R = window.ROADMAP;

  let openWeeks = {};

  function kpiHtml() {
    const idx = App.weekIndexOf();
    const curWeek = R.weeks[Math.min(Math.max(idx - 1, 0), R.weeks.length - 1)];
    const days = App.daysTo(R.meta.applyDate);
    const rounds = ((App.state.progress.interview || {}).rounds || []).length;
    return [
      { label: "总进度", value: App.overallPct() + "%", note: App.doneTasks() + " / " + App.totalTasks() + " 个任务" },
      { label: "当前周次", value: idx < 1 ? "未开始" : (idx > R.weeks.length ? "已完成 20 周" : "第 " + idx + " 周"),
        note: curWeek ? curWeek.title : "" },
      { label: "本周完成", value: curWeek ? App.weekPct(curWeek.id) + "%" : "—", note: curWeek ? curWeek.date : "" },
      { label: "累计投入", value: App.totalHours() + " h", note: "目标 " + R.meta.hoursPerWeek + " h/周" },
      { label: "距暑期实习投递", value: days > 0 ? days + " 天" : "已到投递期", note: R.meta.applyDate },
      { label: "模拟面试轮次", value: rounds + " 轮", note: rounds ? "见「模拟面试官」历史成绩" : "还没测过，建议 W6 起开始" }
    ].map(k => '<div class="kpi"><span>' + App.escape(k.label) + '</span><b>' + App.escape(k.value) + '</b><em>' + App.escape(k.note) + '</em></div>').join("");
  }

  function timelineHtml() {
    const idx = App.weekIndexOf();
    return R.phases.map(p => {
      const pct = App.phasePct(p.id);
      const firstWeek = R.weeks.find(w => w.phase === p.id);
      const lastWeek = R.weeks.slice().reverse().find(w => w.phase === p.id);
      let cls = "";
      if (pct >= 100) cls = "done";
      else if (firstWeek && lastWeek) {
        const from = R.weeks.indexOf(firstWeek) + 1, to = R.weeks.indexOf(lastWeek) + 1;
        if (idx >= from && idx <= to) cls = "current";
      }
      return '<div class="tl-item ' + cls + '">' +
        '<div class="tl-time">' + App.escape(p.weeks + " · " + p.range) + '</div>' +
        '<h4>' + App.escape(p.name) + '</h4>' +
        '<div class="tl-goal">' + App.escape(p.goal) + '</div>' +
        '<span class="tl-pct">阶段完成 ' + pct + '%</span>' +
        '</div>';
    }).join("");
  }

  /* 里程碑区块已移除：验收清单并入各周「过关标准」，页面只保留阶段时间轴 → 逐周任务 */
  const NEED_META = {
    core: { label: "核心·深挖", tip: "护城河：必须能白板讲清、能手写。面试和工作都靠它，不许只靠 AI" },
    key: { label: "必学", tip: "要会，强度中等：能独立做出来，允许查文档" },
    use: { label: "会用即可", tip: "命令/配置：AI 给你就能跑，你只要会验证结果对不对" },
    ai: { label: "交给AI", tip: "知道它存在、知道它解决什么就够了，具体操作让 AI 做" },
    skim: { label: "了解·不深究", tip: "面试问到时能答一句，不投入练习时间" }
  };

  function taskHtml(week, t) {
    const done = App.weekDone(week.id).indexOf(t.id) !== -1;
    // need: core=核心·深挖 / key=必学 / use=会用即可 / ai=交给AI / skim=了解·不深究
    const meta = NEED_META[t.need] || NEED_META.key;
    const needBadge = '<span class="t-need ' + (t.need || "key") + '" title="' + App.escape(meta.tip) + '">' +
      App.escape(meta.label) + '</span>';
    const boxBadge = t.box ? '<span class="t-box" title="时间盒：到点就停，别坠入无底洞">⏱' + t.box + '′</span>' : "";
    return '<label class="task ' + (done ? "done" : "") + '" data-task="' + t.id + '">' +
      '<input type="checkbox" data-week="' + week.id + '" data-task-id="' + t.id + '"' + (done ? " checked" : "") + '>' +
      '<span class="t-body">' +
      '<span class="t-title">' + App.escape(t.text) + '</span>' +
      (t.desc ? '<span class="t-desc">' + App.escape(t.desc) + '</span>' : "") +
      '</span>' +
      '<span class="t-tools">' +
      '<button class="teach-btn" data-teach="' + t.id + '" title="手把手带做：会切到本周专属对话窗口，给命令 + 解释 + 验证">💡 手把手</button>' +
      '<button class="teach-btn deep-btn" data-deep="' + t.id + '" title="开独立窗口深挖：讲透原理、为什么这么设计、面试怎么答，可以一直追问">🔍 深挖</button>' +
      needBadge + boxBadge +
      '<span class="t-level" title="难度"><i class="dot d' + t.level + '"></i></span>' +
      '</span>' +
      '</label>';
  }

  function weekHtml(week, i) {
    const idx = App.weekIndexOf();
    const num = i + 1;
    const done = App.weekDone(week.id).length;
    const pct = App.weekPct(week.id);
    const badgeCls = pct >= 100 ? "week-badge" : (num < idx ? "week-badge past" : "week-badge") + (num === idx ? " now" : "");
    const weeksState = App.state.progress.weeks || (App.state.progress.weeks = {});
    const meta = weeksState[week.id] || {};
    const isOpen = openWeeks[week.id] !== undefined ? openWeeks[week.id] : (num === idx);
    return '<div class="week ' + (isOpen ? "open" : "") + '" id="week-' + week.id + '">' +
      '<div class="week-head" data-week-toggle="' + week.id + '">' +
      '<span class="' + badgeCls + '">' + week.id + '</span>' +
      '<span class="week-title"><h3>' + App.escape(week.title) + '</h3>' +
      '<span class="wk-sub">' + App.escape(week.date + " · 建议 " + week.hours + " 小时 · " + week.phase) + '</span></span>' +
      '<span class="week-progress"><span class="mini-bar"><i style="width:' + pct + '%"></i></span>' +
      '<span class="week-count">' + done + '/' + week.tasks.length + '</span></span>' +
      '<span class="week-caret">▶</span>' +
      '</div>' +
      '<div class="week-body">' +
      '<div class="week-goal">🎯 ' + App.escape(week.goal) + '</div>' +
      '<div class="week-meta"><span>📅 ' + App.escape(week.date) + '</span><span>⏱ 建议 ' + week.hours + ' 小时</span><span>🧩 ' + week.tasks.length + ' 个任务</span></div>' +
      week.tasks.map(t => taskHtml(week, t)).join("") +
      '<div class="depth-box"><b>学到什么程度：</b>' + App.escape(week.depth) + '</div>' +
      '<div class="week-note-row">' +
      '<input type="text" class="hours-input" placeholder="实际小时" data-week-hours="' + week.id + '" value="' + (meta.hours || "") + '">' +
      '<input type="text" placeholder="本周备注：卡在哪、下周砍什么…" data-week-note="' + week.id + '" value="' + App.escape(meta.note || "") + '">' +
      '</div>' +
      '</div></div>';
  }

  function weeksHtml() {
    let html = R.weeks.map((w, i) => weekHtml(w, i)).join("");
    html += '<div class="panel" style="margin-top:22px"><div class="panel-head"><h2>🚀 之后阶段（W21 起）</h2>' +
      '<span class="muted">到 2027-03 再细化，这里先给你方向</span></div>';
    html += R.laterPhases.map(p =>
      '<div class="ms-card" style="margin-bottom:12px">' +
      '<div class="ms-when">' + App.escape(p.when) + '</div><h4>' + App.escape(p.title) + '</h4>' +
      '<ul>' + p.items.map(x => '<li>' + App.escape(x) + '</li>').join("") + '</ul></div>'
    ).join("");
    html += '</div>';
    return html;
  }

  function bulletsHtml(list) {
    return '<ul class="bullet-list">' + list.map(x =>
      '<li><b>' + App.escape(x.title) + '</b>：' + App.escape(x.text) + '</li>').join("") + '</ul>';
  }

  function resourcesHtml() {
    return R.resources.map(g =>
      '<div class="res-group"><h4>' + App.escape(g.group) + '</h4>' +
      g.items.map(it => {
        const cls = it.tag === "always" ? "res-item always" : (it.tag === "avoid" ? "res-item avoid" : "res-item");
        const name = it.url && it.url.charAt(0) !== "#"
          ? '<a class="res-name" href="' + App.escape(it.url) + '" target="_blank" rel="noopener">' + App.escape(it.name) + '</a>'
          : '<span class="res-name">' + App.escape(it.name) + '</span>';
        return '<div class="' + cls + '">' + name + '<span class="res-why">' + App.escape(it.why) + '</span></div>';
      }).join("") + '</div>'
    ).join("");
  }

  /* 图例：解释「学习深度」标签，避免把该偷懒的地方死磕 */
  function legendHtml() {
    return '<div class="need-legend">' +
      '<b>怎么读这些标签：</b>' +
      '<span class="lg"><i class="dot d1"></i>基础/进阶 = 难度</span>' +
      '<span class="lg"><span class="t-need use">会用即可</span>知道有这东西、会验证结果就够，<b>命令和参数直接问 AI</b></span>' +
      '<span class="lg"><span class="t-need ai">交给AI</span>只需知道它存在，具体操作让 AI 做</span>' +
      '<span class="lg"><span class="t-box">⏱45′</span>时间盒，到点就停，别坠入无底洞</span>' +
      '<span class="lg muted">没标签的 = <b>必须自己掌握</b>（能力，不能外包）</span>' +
      '</div>';
  }

  function renderAll() {
    $("#roadmapSub").textContent = R.meta.subtitle;
    $("#todayTag").textContent = "今天 " + new Date().toLocaleDateString("zh-CN") + " · 基准日 " + R.meta.startDate;
    $("#kpis").innerHTML = kpiHtml();
    if ($("#needLegend")) $("#needLegend").innerHTML = legendHtml();
    $("#timeline").innerHTML = timelineHtml();
    $("#weekList").innerHTML = weeksHtml();
    $("#antiObsolescence").innerHTML = bulletsHtml(R.antiObsolescence);
    $("#machinePlan").innerHTML = bulletsHtml(R.machinePlan || []);
    $("#tianjin").innerHTML = bulletsHtml(R.tianjin);
    $("#resources").innerHTML = resourcesHtml();
  }

  function refreshStats() {
    $("#kpis").innerHTML = kpiHtml();
    $("#timeline").innerHTML = timelineHtml();
    R.weeks.forEach((w, i) => {
      const card = document.getElementById("week-" + w.id);
      if (!card) return;
      const pct = App.weekPct(w.id);
      const done = App.weekDone(w.id).length;
      card.querySelector(".mini-bar i").style.width = pct + "%";
      card.querySelector(".week-count").textContent = done + "/" + w.tasks.length;
      const badge = card.querySelector(".week-badge");
      badge.className = "week-badge" + (pct >= 100 ? "" : (i + 1 < App.weekIndexOf() ? " past" : "") + (i + 1 === App.weekIndexOf() ? " now" : ""));
    });
  }

  /* ---------------- 交给 DSH 的待办 ---------------- */
  let requests = [];

  function renderRequestPanel() {
    const box = document.getElementById("requestPanel");
    if (!box) return;
    const pending = requests.filter(r => r.status !== "done");
    if (!pending.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    box.classList.remove("hidden");
    box.innerHTML =
      '<div class="panel-head"><h2>🤖 待 DSH 在电脑上执行（' + pending.length + '）</h2>' +
      '<span class="muted">在 DSH 对话里说「执行我网站里的待办」即可</span></div>' +
      pending.map(r =>
        '<div class="req-item">' +
        '<div class="req-main"><b>' + App.escape(r.title) + '</b>' +
        '<span class="muted small"> · ' + App.escape(r.week || "") + ' · ' + App.escape(r.taskId || "") +
        ' · 提交于 ' + App.escape(r.time || "") + '</span>' +
        (r.desc ? '<div class="muted small">' + App.escape(r.desc) + '</div>' : "") +
        '</div>' +
        '<div class="req-actions">' +
        '<button class="teach-btn" data-req-done="' + App.escape(r.id) + '">标记已完成</button>' +
        '<button class="teach-btn" data-req-copy="' + App.escape(r.id) + '">复制请求</button>' +
        '</div></div>').join("");
    if (App.state.serverOnline) {
      box.insertAdjacentHTML("beforeend",
        '<p class="muted small" style="margin:10px 0 0">DSH 执行完会自动更新这份列表；你也可以手动标记完成。' +
        '（管理：<button class="mini-x" id="btnClearDone" style="font-size:12px">清掉已完成的记录</button>）</p>');
      const cd = document.getElementById("btnClearDone");
      if (cd) cd.addEventListener("click", async function () {
        await App.post("/api/request", { action: "clear" });
        await loadRequests();
      });
    }
    App.$$("#requestPanel [data-req-done]").forEach(b => b.addEventListener("click", async function () {
      await App.post("/api/request", { action: "done", id: b.dataset.reqDone });
      await loadRequests();
      App.toast("已标记完成", "ok");
    }));
    App.$$("#requestPanel [data-req-copy]").forEach(b => b.addEventListener("click", function () {
      const r = requests.find(x => x.id === b.dataset.reqCopy);
      if (!r) return;
      navigator.clipboard.writeText(r.ask || r.title).then(
        () => App.toast("已复制，粘到 DSH 对话里发给我即可", "ok"),
        () => App.toast("复制失败，请手动复制", "bad"));
    }));
  }

  async function loadRequests() {
    if (!App.state.serverOnline) { renderRequestPanel(); return; }
    try {
      const res = await App.get("/api/requests");
      if (res && res.ok) requests = res.requests || [];
    } catch (e) { /* 忽略 */ }
    renderRequestPanel();
  }

  async function submitRequest(week, task) {
    if (!App.state.serverOnline) {
      const card = "请在 DSH 里帮我在电脑上完成这条学习任务：" + task.text +
        "（" + week.id + " · " + week.title + "）。做完告诉我怎么验证。";
      navigator.clipboard.writeText(card).then(
        () => App.toast("离线模式：请求已复制，粘到 DSH 对话里发给我", "ok"),
        () => App.toast("复制失败，请手动复制", "bad"));
      return;
    }
    try {
      const res = await App.post("/api/request", {
        taskId: task.id, week: week.id, title: task.text, desc: task.desc || ""
      });
      if (res && res.ok) {
        requests = res.requests || [];
        renderRequestPanel();
        App.toast("已派给 DSH：在对话里说「执行我网站里的待办」", "ok");
      }
    } catch (e) { App.toast("提交失败：" + e.message, "bad"); }
  }

  function bind() {
    const list = $("#weekList");

    list.addEventListener("click", function (e) {
      const teachBtn = e.target.closest("[data-teach]");
      if (teachBtn) {
        e.preventDefault();
        e.stopPropagation();
        const taskId = teachBtn.dataset.teach;
        const week = window.ROADMAP.weeks.find(w => w.tasks.some(t => t.id === taskId));
        const task = week && week.tasks.find(t => t.id === taskId);
        if (week && task && window.ChatPage) ChatPage.teachTask(week, task);
        return;
      }
      const dshBtn = e.target.closest("[data-dsh]");
      if (dshBtn) {
        e.preventDefault();
        e.stopPropagation();
        const taskId = dshBtn.dataset.dsh;
        const week = window.ROADMAP.weeks.find(w => w.tasks.some(t => t.id === taskId));
        const task = week && week.tasks.find(t => t.id === taskId);
        if (week && task) submitRequest(week, task);
        return;
      }
      const head = e.target.closest("[data-week-toggle]");
      if (!head) return;
      const id = head.dataset.weekToggle;
      const card = document.getElementById("week-" + id);
      const isOpen = card.classList.toggle("open");
      openWeeks[id] = isOpen;
    });

    // 🔍 深挖：进这个任务所属周的独立窗口，并让模型展开讲原理
    list.addEventListener("click", function (e) {
      const db = e.target.closest("[data-deep]");
      if (!db) return;
      e.preventDefault();
      const week = window.ROADMAP.weeks.find(w => w.tasks.some(t => t.id === db.dataset.deep));
      const task = week && week.tasks.find(t => t.id === db.dataset.deep);
      if (!week || !task) return;
      if (window.ChatPage && ChatPage.deepTask) ChatPage.deepTask(week, task);
    });

    list.addEventListener("change", function (e) {
      const cb = e.target.closest("input[type=checkbox][data-task-id]");
      if (!cb) return;
      App.toggleTask(cb.dataset.week, cb.dataset.taskId, cb.checked);
      const label = cb.closest(".task");
      if (label) label.classList.toggle("done", cb.checked);
      if (cb.checked) {
        const week = window.ROADMAP.weeks.find(w => w.id === cb.dataset.week);
        const task = week && week.tasks.find(t => t.id === cb.dataset.taskId);
        App.toast("已完成：" + (task ? task.text.slice(0, 22) : cb.dataset.taskId), "ok");
        // 整周完成时自动记入长期记忆
        if (week && App.weekDone(week.id).length === week.tasks.length) {
          App.logMilestone("完成 " + week.id + " 全部 " + week.tasks.length + " 项：" + week.title +
            "（累计投入 " + App.totalHours() + " 小时，总进度 " + App.overallPct() + "%）");
          App.toast("🎉 整周任务清空，已记入长期记忆", "ok");
        }
      }
    });

    list.addEventListener("blur", function (e) {
      const hi = e.target.closest("[data-week-hours]");
      if (hi) App.setWeekMeta(hi.dataset.weekHours, { hours: Number(hi.value) || 0 });
      const ni = e.target.closest("[data-week-note]");
      if (ni) App.setWeekMeta(ni.dataset.weekNote, { note: ni.value });
    }, true);

    $("#btnExpandAll").addEventListener("click", function () {
      $$("#weekList .week").forEach(c => { c.classList.add("open"); openWeeks[c.id.replace("week-", "")] = true; });
    });
    $("#btnCollapseAll").addEventListener("click", function () {
      $$("#weekList .week").forEach(c => { c.classList.remove("open"); openWeeks[c.id.replace("week-", "")] = false; });
    });
  }

  function init() {
    renderAll();
    bind();
    loadRequests();
  }

  return { init: init, refreshStats: refreshStats, renderAll: renderAll, reloadRequests: loadRequests };
})();