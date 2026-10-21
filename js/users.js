/* ==========================================================================
   users.js · 成员（多用户）：右上角切换、首次选择、画像问卷
   数据隔离：进度 / 记忆 / 关注清单 / 简历 / 面试记录都按成员分开
   ========================================================================== */
window.Users = (function () {
  "use strict";
  const $ = App.$, $$ = App.$$;
  const LS_USER = "agent-hub-current-user";

  /* ---------------- 画像问卷定义 ---------------- */
  const ONBOARD = [
    { k: "name", q: "怎么称呼你？", t: "text", ph: "例如：小雨 / 张同学" },
    { k: "identity", q: "你的身份和学校类型？", t: "text", ph: "例如：双非本硕，研二，本科自动化" },
    { k: "research", q: "你的研究方向 / 课题是什么？", t: "textarea", ph: "一句话说清，例如：多传感器融合的室内定位" },
    { k: "target", q: "求职目标与岗位方向？（城市 / 是否考虑大厂）", t: "textarea", ph: "例如：想做 AI 应用或数据分析，不去大厂；城市待定" },
    { k: "timeline", q: "毕业时间与投递节点？", t: "text", ph: "例如：2028-06 毕业，2027-03 投暑期实习" },
    { k: "hours", q: "每周能稳定投入多少小时学习？", t: "select", opts: ["不到 5 小时", "5–10 小时", "10–20 小时", "20–30 小时", "30 小时以上"] },
    { k: "python", q: "编程基础如何？（Python 到什么程度，还会什么语言）", t: "textarea", ph: "例如：Python 会写脚本，MATLAB 熟练，C 学过" },
    { k: "math", q: "数学与算法基础？", t: "select", opts: ["比较扎实", "一般，需要复习", "基本忘光了", "没怎么学过"] },
    { k: "tools", q: "熟悉哪些工具？（Git / Linux / Docker / AI 编程工具…）", t: "textarea", ph: "例如：Git 只会 clone，Linux 不熟，用过 ChatGPT 写代码" },
    { k: "machine", q: "你主要用什么电脑？（CPU / 显卡 / 内存 / 系统）", t: "textarea", ph: "例如：笔记本 i5-11400H + RTX3050 4G + 16G，Windows" },
    { k: "machineTag", q: "给这台电脑起个名字", t: "text", ph: "例如：我的笔记本 / 实验室工作站" },
    { k: "machineUse", q: "这台电脑主要拿来做什么？", t: "text", ph: "例如：写代码、跑仿真、看文献" },
    { k: "strengths", q: "你最大的优势是什么？", t: "textarea", ph: "例如：动手能力强、仿真熟、英语阅读还行" },
    { k: "weakness", q: "最大的短板 / 最没底的地方？", t: "textarea", ph: "例如：算法不会、项目经历少、面试紧张" },
    { k: "painpoint", q: "现在最大的困扰是什么？（希望这个网站帮你解决什么）", t: "textarea", ph: "例如：不知道怎么开始、学了记不住、没有项目可写" },
    { k: "style", q: "你喜欢怎么学？（文档 / 视频 / 动手做 / 需要人带）", t: "textarea", ph: "例如：只看能动手的教程，不看视频" },
    { k: "mustknow", q: "还有什么必须让我记住的？（可选）", t: "textarea", ph: "例如：导师不允许实习 / 晚上没时间学习" }
  ];

  let state = { users: [], active: "", loaded: false };

  /* ---------------- 当前成员 ---------------- */
  function storedSlug() {
    try { return localStorage.getItem(LS_USER) || ""; } catch (e) { return ""; }
  }

  function current() {
    return state.users.find(u => u.slug === App.state.user.slug) || state.users[0] || null;
  }

  function setCurrent(slug) {
    App.state.user.slug = slug;
    try { localStorage.setItem(LS_USER, slug); } catch (e) {}
    renderChip();
  }

  /* ---------------- 加载与渲染 ---------------- */
  async function load() {
    try {
      const res = await App.get("/api/users");
      if (res && res.ok) {
        state.users = res.users || [];
        state.active = res.active || "";
        state.loaded = true;
      }
    } catch (e) { /* 服务未启动 */ }
    if (!state.users.length) {
      state.users = [{ slug: "me", name: "我（本人）", emoji: "🙋", primary: true, onboarded: true }];
    }

    // 关键：本地记着的成员可能已经被删掉（或不存在）。
    // 这时必须回落到真实存在的成员，否则会一直带 X-User: <无效 slug>，
    // 服务器返回别的/空的数据，用户看到「进度全没了」。
    let slug = storedSlug();
    const exists = slug && state.users.some(u => u.slug === slug);
    if (!exists) {
      const ghost = slug;
      // 新浏览器（没有任何本地记录）一律先进「主账号」。
      // 服务端的 active 只代表「最近有谁动过」，不代表这台设备是谁；
      // 跟着它走会让同学一打开就进到别人名下，看到别人的进度和画像。
      slug = (state.users.find(u => u.primary) || state.users[0]).slug;
      try { localStorage.setItem(LS_USER, slug); } catch (e) {}
      if (ghost) {
        // 注意：被删掉的是「成员本身」，不是本地缓存坏了。
        // 不要顺手清 ::ghost 的缓存 —— 万一是误删又被恢复，缓存还能帮上忙；
        // 清理动作留给服务端确认该成员真的不存在之后再做。
        App.toast("原成员（" + ghost + "）已不存在，已切回「" + slug + "」", "bad");
      }
    }
    App.state.user = Object.assign({}, App.state.user, { slug: slug });
    const u = current() || {};
    App.state.user.name = u.name || slug;
    App.state.user.emoji = u.emoji || "🙋";
    renderChip();
    return state.users;
  }

  function renderChip() {
    const u = current() || {};
    const em = $("#chipEmoji"), nm = $("#chipName");
    if (em) em.textContent = u.emoji || "🙋";
    if (nm) nm.textContent = (u.name || App.state.user.slug || "未选择") + (u.primary ? "" : "");
    const meta = $("#topUserMeta");
    if (meta) {
      meta.textContent = u.onboarded ? "画像已建立" : "待填写画像";
      meta.className = "tag " + (u.onboarded ? "ok" : "warn");
    }
  }

  function renderMenu() {
    const menu = $("#userMenu");
    if (!menu) return;
    menu.innerHTML =
      '<div class="um-title">切换成员（数据互相独立）</div>' +
      state.users.map(u =>
        '<button class="um-item ' + (u.slug === App.state.user.slug ? "active" : "") + '" data-switch="' + App.escape(u.slug) + '">' +
        '<span class="um-emoji">' + App.escape(u.emoji || "🙂") + '</span>' +
        '<span class="um-name">' + App.escape(u.name) + (u.primary ? " <span class='muted small'>主账号</span>" : "") + '</span>' +
        '<span class="um-stat muted small">' + (u.doneTasks || 0) + ' 项</span>' +
        (u.slug === App.state.user.slug ? '<span class="um-dot">●</span>' : '') +
        '</button>').join("") +
      '<div class="um-sep"></div>' +
      '<button class="um-item" data-menu="editprofile"><span class="um-emoji">📝</span><span class="um-name">' +
        (current() && current().onboarded ? "重新填写/修改我的画像" : "填写我的画像问卷") + '</span></button>' +
      '<button class="um-item" data-menu="newuser"><span class="um-emoji">➕</span><span class="um-name">新增成员</span></button>' +
      '<button class="um-item" data-menu="manage"><span class="um-emoji">⚙️</span><span class="um-name">成员管理</span></button>';

    $$("#userMenu [data-switch]").forEach(b => b.addEventListener("click", function () {
      switchTo(b.dataset.switch);
    }));
    $$("#userMenu [data-menu]").forEach(b => b.addEventListener("click", function () {
      hideMenu();
      const act = b.dataset.menu;
      if (act === "editprofile") openOnboarding(true);
      if (act === "newuser") openSelect(true);
      if (act === "manage") openSelect(false);
    }));
  }

  function showMenu() { renderMenu(); $("#userMenu").classList.remove("hidden"); }
  function hideMenu() { $("#userMenu").classList.add("hidden"); }

  /* ---------------- 切换 / 新建 / 删除 ---------------- */
  async function switchTo(slug) {
    if (!slug || slug === App.state.user.slug) { hideMenu(); return; }
    setCurrent(slug);
    hideMenu();
    App.toast("已切换到「" + (current() || {}).name + "」，正在加载其数据…", "ok");
    // 切换后整页重载，确保所有模块用新成员的数据重新初始化
    setTimeout(() => location.reload(), 350);
  }

  async function createUser() {
    const name = ($("#newUserName").value || "").trim();
    const emoji = ($("#newUserEmoji").value || "").trim() || "🙂";
    const status = $("#userStatus");
    if (!name) { status.textContent = "请先填名字"; return; }
    status.textContent = "创建中…";
    try {
      const res = await App.post("/api/users", { action: "create", name: name, emoji: emoji });
      if (!res.ok) throw new Error(res.error || "创建失败");
      state.users = res.users;
      state.active = res.active;
      const created = state.users.find(u => u.name === name) || state.users[state.users.length - 1];
      setCurrent(created.slug);
      App.modalClosed = true;
      App.closeModal("userSelectModal");
      status.textContent = "";
      renderChip();
      App.toast("已创建「" + name + "」，接着填写画像问卷", "ok");
      setTimeout(() => openOnboarding(true), 300);
    } catch (e) {
      status.textContent = "❌ " + e.message;
    }
  }

  async function deleteUser(slug) {
    const u = state.users.find(x => x.slug === slug) || {};
    if (u.primary) { App.toast("主账号不能删除", "bad"); return; }
    if (!confirm("删除成员「" + u.name + "」？其进度、记忆、简历文件都会从磁盘删除，无法恢复。")) return;
    const res = await App.post("/api/users", { action: "delete", slug: slug });
    if (res && res.ok) {
      state.users = res.users;
      if (App.state.user.slug === slug) {
        setCurrent(res.active || (res.users[0] || {}).slug);
        App.toast("成员已删除，已切回「" + (current() || {}).name + "」", "bad");
        setTimeout(() => location.reload(), 500);
      } else {
        renderPickList(); renderChip();
        App.toast("成员已删除", "ok");
      }
    }
  }

  /* ---------------- 成员选择弹窗 ---------------- */
  function renderPickList() {
    const box = $("#userPickList");
    if (!box) return;
    box.innerHTML = state.users.map(u =>
      '<div class="pick-item ' + (u.slug === App.state.user.slug ? "active" : "") + '">' +
      '<button class="pick-main" data-pick="' + App.escape(u.slug) + '">' +
      '<span class="pick-emoji">' + App.escape(u.emoji || "🙂") + '</span>' +
      '<span class="pick-text"><b>' + App.escape(u.name) + '</b>' +
      '<span class="muted small">' + (u.primary ? "主账号 · " : "") + (u.onboarded ? "画像已建立" : "还没填画像") +
      ' · 已完成 ' + (u.doneTasks || 0) + ' 项任务' + (u.hasResume ? " · 有简历" : "") + '</span></span>' +
      (u.slug === App.state.user.slug ? '<span class="tag ok">当前</span>' : '<span class="tag">切换</span>') +
      '</button>' +
      (u.primary ? "" : '<button class="ed-del" data-deluser="' + App.escape(u.slug) + '" title="删除成员">✕</button>') +
      '</div>').join("");
    $$("#userPickList [data-pick]").forEach(b => b.addEventListener("click", function () {
      if (b.dataset.pick === App.state.user.slug) {
        App.closeModal("userSelectModal");
        if (!(current() || {}).onboarded) openOnboarding(true);
        return;
      }
      switchTo(b.dataset.pick);
    }));
    $$("#userPickList [data-deluser]").forEach(b => b.addEventListener("click", function (e) {
      e.stopPropagation();
      deleteUser(b.dataset.deluser);
    }));
  }

  function openSelect() {
    renderPickList();
    $("#userStatus").textContent = "";
    App.openModal("userSelectModal");
  }

  /* ---------------- 画像问卷 ---------------- */
  function renderOnboarding() {
    const form = $("#obForm");
    const isEdit = !!(current() && current().onboarded);
    $("#obTitle").textContent = isEdit ? "📝 修改我的画像" : "📝 先认识一下你（首次进入的画像问卷）";
    $("#obHint").textContent = isEdit
      ? "改动会覆盖长期记忆里的对应字段（可随时再改）。"
      : "这些答案会写进你的长期记忆档案，之后答疑、热榜推荐、面试评分都会按你的情况来。";
    $("#btnObSkip").classList.toggle("hidden", isEdit);
    $("#btnObLater").classList.toggle("hidden", isEdit);
    form.innerHTML = ONBOARD.map((q, i) => {
      const id = "ob_" + q.k;
      let input = "";
      if (q.t === "select") {
        input = '<select id="' + id + '" data-ob="' + q.k + '"><option value="">请选择…</option>' +
          q.opts.map(o => '<option value="' + App.escape(o) + '">' + App.escape(o) + '</option>').join("") + '</select>';
      } else if (q.t === "textarea") {
        input = '<textarea id="' + id + '" data-ob="' + q.k + '" rows="2" placeholder="' + App.escape(q.ph || "") + '"></textarea>';
      } else {
        input = '<input type="text" id="' + id + '" data-ob="' + q.k + '" placeholder="' + App.escape(q.ph || "") + '">';
      }
      return '<div class="field"><label>' + (i + 1) + '. ' + App.escape(q.q) + '</label>' + input + '</div>';
    }).join("");
    updateProgress();
    $$("#obForm [data-ob]").forEach(el => el.addEventListener("input", updateProgress));
    $$("#obForm select[data-ob]").forEach(el => el.addEventListener("change", updateProgress));
    // 已填过的预填
    const mem = App.state.memory || {};
    const p = mem.profile || {}, n = mem.environment_notes || {};
    const dev = (mem.devices || [])[0] || {};
    const pre = {
      name: p["称呼"] || (current() || {}).name || "",
      identity: p["身份"] || "", research: p["课题"] || "", target: p["目标岗位"] || "",
      timeline: p["求职节点"] || "", hours: p["每周可投入"] || "", python: p["编程基础"] || "",
      math: p["数学与算法"] || "", strengths: p["优势"] || "", weakness: p["短板"] || "",
      style: p["学习方式偏好"] || "", machine: n["电脑环境"] || "", tools: n["已有的工具/技能"] || "",
      painpoint: n["目前最大的困扰"] || "", mustknow: n["其他必须记住的"] || "",
      machineTag: dev.name || "", machineUse: dev["用途"] || ""
    };
    Object.keys(pre).forEach(k => {
      const el = $("#ob_" + k);
      if (el && pre[k]) el.value = pre[k];
    });
    updateProgress();
  }

  function updateProgress() {
    const filled = $$("#obForm [data-ob]").filter(el => (el.value || "").trim()).length;
    const total = ONBOARD.length;
    const el = $("#obProgress");
    if (el) el.textContent = "已填 " + filled + " / " + total;
  }

  function collectAnswers() {
    const out = {};
    $$("#obForm [data-ob]").forEach(el => { out[el.dataset.ob] = (el.value || "").trim(); });
    return out;
  }

  async function saveOnboarding() {
    const status = $("#obStatus");
    const answers = collectAnswers();
    if (!answers.name) { status.textContent = "至少填一下称呼吧"; return; }
    status.textContent = "保存中…";
    try {
      const res = await App.post("/api/onboarding", { slug: App.state.user.slug, answers: answers });
      if (!res.ok) throw new Error(res.error || "保存失败");
      App.state.memory = res.memory || App.state.memory;
      state.users = (res.user && res.user.users) || state.users;
      renderChip();
      App.closeModal("onboardingModal");
      status.textContent = "";
      App.toast("画像已保存，之后的答疑与推荐都会按你的情况来", "ok");
      if (window.MemoryPage && MemoryPage.render) MemoryPage.render();
      if (window.ChatPage && ChatPage.renderProgress) ChatPage.renderProgress();
    } catch (e) {
      status.textContent = "❌ " + e.message;
    }
  }

  function openOnboarding(force) {
    if (!force && (current() || {}).onboarded) return;
    renderOnboarding();
    App.openModal("onboardingModal");
  }

  /* ---------------- 绑定 ---------------- */
  function bind() {
    const chip = $("#btnUserChip");
    if (chip) chip.addEventListener("click", function (e) {
      e.stopPropagation();
      const menu = $("#userMenu");
      if (menu.classList.contains("hidden")) showMenu(); else hideMenu();
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".user-chip-wrap")) hideMenu();
    });
    const create = $("#btnCreateUser");
    if (create) create.addEventListener("click", createUser);
    const save = $("#btnObSave");
    if (save) save.addEventListener("click", saveOnboarding);
    const skip = $("#btnObSkip");
    if (skip) skip.addEventListener("click", async function () {
      if (!confirm("跳过画像问卷？之后可以在「长期记忆」页或右上角菜单里补填。")) return;
      try { await App.post("/api/users", { action: "mark_onboarded", slug: App.state.user.slug }); } catch (e) {}
      App.closeModal("onboardingModal");
      const u = current(); if (u) u.onboarded = true;
      renderChip();
    });
    const later = $("#btnObLater");
    if (later) later.addEventListener("click", function () { App.closeModal("onboardingModal"); });
  }

  function init() { bind(); }

  return {
    init: init, load: load, openSelect: openSelect, openOnboarding: openOnboarding,
    switchTo: switchTo, renderChip: renderChip, state: state,
    storedSlug: storedSlug,
    needsOnboarding: function () { return !(current() || {}).onboarded; }
  };
})();