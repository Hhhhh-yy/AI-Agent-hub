/* ==========================================================================
   core.js · 状态、路由、通用 UI
   ========================================================================== */
window.App = (function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const LS_KEY = "agent-hub-progress-v1";
  const LS_RESUME = "agent-hub-resume-v1";

  const App = {
    $: $,
    $$: $$,
    state: {
      progress: { weeks: {}, interview: { rounds: [], weakCategories: [] }, questions: [], totalHours: 0, lastWeek: "" },
      settings: { hasKey: false, keySource: "none", model: "deepseek-chat", baseUrl: "https://api.deepseek.com" },
      memory: { profile: {}, environment: {}, environment_notes: {}, devices: [], notes: [], faq: [], milestones: [], watchlist: [] },
      user: { slug: "", name: "", emoji: "🙋" },
      users: [],
      token: "",
      serverOnline: false
    },

    /* 每位成员一套本地缓存，避免互相污染 */
    userKey(base) {
      return base + "::" + (App.state.user.slug || "default");
    },

    /* ---------------- 通用工具 ---------------- */
    escape(str) {
      return String(str == null ? "" : str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    },

    toast(msg, type) {
      const wrap = $("#toastWrap");
      const el = document.createElement("div");
      el.className = "toast " + (type || "");
      el.textContent = msg;
      wrap.appendChild(el);
      setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateX(18px)"; }, 2600);
      setTimeout(() => el.remove(), 3000);
    },

    /* 局域网模式的访问令牌：从网址 ?k= 取一次并记住 */
    resolveToken() {
      try {
        const params = new URLSearchParams(location.search);
        const q = params.get("k");
        if (q && q.trim()) localStorage.setItem("agent-hub-token", q.trim());
        App.state.token = (q && q.trim()) || localStorage.getItem("agent-hub-token") || "";
        // ?u=<slug>：把「这台设备是谁」钉死在网址里。
        // 同学用带 ?u=u2 的专属链接进来，即使她清了浏览器缓存 / 换了浏览器，
        // 也还是她自己，不会跑到别人名下。普通访客不带 ?u= 则进主账号。
        const u = params.get("u");
        if (u && u.trim()) {
          localStorage.setItem("agent-hub-current-user", u.trim());
          App.state.pinnedUser = u.trim();
        }
      } catch (e) { App.state.token = ""; }
    },

    async api(path, options) {
      const headers = { "Content-Type": "application/json" };
      if (App.state.user && App.state.user.slug) headers["X-User"] = App.state.user.slug;
      if (App.state.token) headers["X-Token"] = App.state.token;
      const opt = Object.assign({ headers: headers }, options || {});
      opt.headers = Object.assign({}, headers, (options && options.headers) || {});
      const res = await fetch(path, opt);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { throw new Error("服务返回非 JSON：" + text.slice(0, 120)); }
      if (data && data.needToken && !App._tokenWarned) {
        App._tokenWarned = true;
        App.toast("需要访问令牌：请用服务器控制台给出的完整链接打开（带 ?k=令牌）", "bad");
      }
      return data;
    },

    get(path) { return App.api(path, { method: "GET" }); },
    post(path, body) { return App.api(path, { method: "POST", body: JSON.stringify(body || {}) }); },

    /* ---------------- 日期 / 周次 ---------------- */
    today() { return new Date(); },

    weekIndexOf(date) {
      const start = new Date(window.ROADMAP.meta.startDate + "T00:00:00");
      const d = date || App.today();
      const diff = Math.floor((d - start) / 86400000);
      return Math.floor(diff / 7) + 1;
    },

    daysTo(dateStr) {
      const target = new Date(dateStr + "T00:00:00");
      return Math.ceil((target - App.today()) / 86400000);
    },

    /* ---------------- 进度计算 ---------------- */
    totalTasks() {
      return window.ROADMAP.weeks.reduce((sum, w) => sum + w.tasks.length, 0);
    },

    doneTasks() {
      const weeks = App.state.progress.weeks || {};
      return Object.keys(weeks).reduce((s, k) => s + (weeks[k].done || []).length, 0);
    },

    weekDone(weekId) {
      const w = (App.state.progress.weeks || {})[weekId];
      return w && w.done ? w.done : [];
    },

    weekPct(weekId) {
      const week = window.ROADMAP.weeks.find(w => w.id === weekId);
      if (!week || !week.tasks.length) return 0;
      return Math.round(App.weekDone(weekId).length / week.tasks.length * 100);
    },

    phasePct(phaseId) {
      const weeks = window.ROADMAP.weeks.filter(w => w.phase === phaseId);
      const total = weeks.reduce((s, w) => s + w.tasks.length, 0);
      const done = weeks.reduce((s, w) => s + App.weekDone(w.id).length, 0);
      return total ? Math.round(done / total * 100) : 0;
    },

    overallPct() {
      const total = App.totalTasks();
      return total ? Math.round(App.doneTasks() / total * 100) : 0;
    },

    /* 每个任务类型对应的「预计投入分钟」——打卡即自动计入累计时长，
       用户也可以在某周手填 hours 覆盖（手填优先，不叠加）。
       以前 hours 从来没被任何代码写过，所以侧栏恒为 0h。 */
    COST_MIN: { core: 90, key: 60, use: 30, ai: 15, skim: 15 },

    /* 找到某个任务对象（跨周查找，返回 { week, task }） */
    findTask(taskId) {
      const R = window.ROADMAP;
      if (!R || !taskId) return null;
      for (const w of R.weeks) {
        for (const t of w.tasks) {
          if (t.id === taskId) return { week: w, task: t };
        }
      }
      return null;
    },

    /* 按「已完成任务」估算的本周时长（分钟） */
    weekAutoMinutes(weekId) {
      const R = window.ROADMAP;
      const week = R && R.weeks.find(w => w.id === weekId);
      if (!week) return 0;
      const done = App.weekDone(weekId);
      return week.tasks.reduce((sum, t) => {
        if (done.indexOf(t.id) === -1) return sum;
        return sum + (t.box || App.COST_MIN[t.need] || App.COST_MIN.key);
      }, 0);
    },

    totalHours() {
      const weeks = App.state.progress.weeks || {};
      const R = window.ROADMAP;
      if (!R) return 0;
      let minutes = 0;
      R.weeks.forEach(function (w) {
        const st = weeks[w.id] || {};
        const manual = Number(st.hours) || 0;          // 手填的小时数
        if (manual > 0) {
          minutes += manual * 60;                      // 手填优先
        } else {
          minutes += App.weekAutoMinutes(w.id);        // 否则按打卡自动估算
        }
      });
      return Math.round(minutes / 6) / 10;             // 保留 1 位小数
    },

    toggleTask(weekId, taskId, checked) {
      const weeks = App.state.progress.weeks || (App.state.progress.weeks = {});
      const w = weeks[weekId] || (weeks[weekId] = { done: [], hours: 0, note: "" });
      w.done = w.done || [];
      const i = w.done.indexOf(taskId);
      if (checked && i === -1) w.done.push(taskId);
      if (!checked && i !== -1) w.done.splice(i, 1);
      App.state.progress.lastWeek = weekId;
      App.persist();
      App.renderSidebar();
      App.refreshRoadmapStats();
    },

    setWeekMeta(weekId, patch) {
      const weeks = App.state.progress.weeks || (App.state.progress.weeks = {});
      const w = weeks[weekId] || (weeks[weekId] = { done: [], hours: 0, note: "" });
      Object.assign(w, patch);
      // 空记录不留档，避免进度报告里出现一堆 0 任务的周
      const empty = !(w.done || []).length && !Number(w.hours) && !String(w.note || "").trim();
      if (empty) delete weeks[weekId];
      App.persist();
    },

    /* ---------------- 持久化 ---------------- */
    /* stateLoaded：从服务器加载完成前禁止回写。
       否则「全新浏览器（本地 localStorage 为空）」一进页面就会把空进度写回服务器，
       把真实打卡冲掉——这是真实踩过的坑。 */
    stateLoaded: false,

    persist: (function () {
      let timer = null;
      return function () {
        clearTimeout(timer);
        timer = setTimeout(async function () {
          try { localStorage.setItem(App.userKey(LS_KEY), JSON.stringify(App.state.progress)); } catch (e) {}
          if (!App.state.serverOnline || !App.stateLoaded) return;   // 未加载完不许回写
          try {
            await App.post("/api/state", {
              progress: Object.assign({}, App.state.progress, { totalTasks: App.totalTasks() })
            });
          } catch (e) { /* 静默失败，localStorage 已兜底 */ }
        }, 700);
      };
    })(),

    async pushProgressNow() {
      try { localStorage.setItem(App.userKey(LS_KEY), JSON.stringify(App.state.progress)); } catch (e) {}
      const res = await App.post("/api/state", {
        progress: Object.assign({}, App.state.progress, { totalTasks: App.totalTasks() })
      });
      return res;
    },

    /* ---------------- 侧边栏 ---------------- */
    renderSidebar() {
      const pct = App.overallPct();
      const ring = $("#sideRing");
      const C = 2 * Math.PI * 52;
      ring.style.strokeDasharray = C;
      ring.style.strokeDashoffset = C * (1 - pct / 100);
      $("#sideRingPct").textContent = pct + "%";
      $("#sideDone").textContent = App.doneTasks() + " / " + App.totalTasks();
      $("#sideHours").textContent = App.totalHours() + "h";
      const days = App.daysTo(window.ROADMAP.meta.applyDate);
      $("#sideCountdown").textContent = days > 0 ? days + " 天" : "已到投递期";
    },

    refreshRoadmapStats() {
      if (window.Roadmap && Roadmap.refreshStats) Roadmap.refreshStats();
      if (window.ChatPage && ChatPage.renderProgress) ChatPage.renderProgress();
    },

    /* ---------------- 路由 ---------------- */
    go(view) {
      $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
      $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (view === "interview" && window.Interview && Interview.onEnter) Interview.onEnter();
      if (view === "chat" && window.ChatPage && ChatPage.onEnter) ChatPage.onEnter();
      if (view === "memory" && window.MemoryPage && MemoryPage.onEnter) MemoryPage.onEnter();
      if (view === "trending" && window.TrendingPage && TrendingPage.onEnter) TrendingPage.onEnter();
      location.hash = view;
    },

    /* ---------------- 弹窗 ---------------- */
    openModal(id) { $("#" + id).classList.remove("hidden"); },
    closeModal(id) { $("#" + id).classList.add("hidden"); },

    /* ---------------- 设置 ---------------- */
    /* ---------------- 持久记忆档案 ---------------- */
    async loadMemory() {
      try {
        const res = await App.get("/api/memory");
        if (res && res.ok && res.memory) App.state.memory = res.memory;
      } catch (e) { /* 服务未启动时用空记忆 */ }
      return App.state.memory;
    },

    async saveMemory(patch) {
      try {
        const res = await App.post("/api/memory", patch || {});
        if (res && res.ok && res.memory) App.state.memory = res.memory;
        return res;
      } catch (e) {
        App.toast("记忆写入失败：" + e.message, "bad");
        return null;
      }
    },

    /* 自动记账：完成一周 / 考完一轮面试 时写进长期记忆的里程碑 */
    logMilestone(text) {
      const t = String(text || "").trim();
      if (!t) return;
      const mem = App.state.memory || (App.state.memory = {});
      mem.milestones = (mem.milestones || []).concat([{
        time: new Date().toLocaleString("zh-CN").slice(0, 16), text: t
      }]).slice(-80);
      App.saveMemory({ milestoneAppend: [t] });
      if (window.MemoryPage && MemoryPage.render) MemoryPage.render();
    },

    /* 每次问答后自动沉淀进记忆档案：清空对话、重启网站、换浏览器都不会丢 */
    rememberExchange(question, answer, topic) {
      const q = String(question || "").trim();
      const a = String(answer || "").trim();
      if (!q || !a) return;
      const week = window.ROADMAP ? ("第 " + App.weekIndexOf() + " 周") : "";
      const item = {
        time: new Date().toLocaleString("zh-CN"),
        week: week,
        topic: (topic || q).slice(0, 60),
        q: q.slice(0, 900),
        // 磁盘档案里保留较完整的解答（含代码），但注入提示词时只取摘要，兼顾「记得住」与「不烧 token」
        a: a.replace(/\n{3,}/g, "\n\n").slice(0, 2500)
      };
      const mem = App.state.memory || (App.state.memory = { faq: [] });
      mem.faq = (mem.faq || []).concat([item]).slice(-60);
      App.saveMemory({ faqAppend: [item] });
    },

    async loadSettings() {
      try {
        const res = await App.get("/api/settings");
        if (res && res.ok) { App.state.settings = res; App.state.serverOnline = true; }
      } catch (e) { App.state.serverOnline = false; }
      App.renderKeyState();
      App.refreshKeyHint();
    },

    thinkingLabel(level) {
      return { high: "高", medium: "中", low: "低", off: "关" }[level] || "高";
    },

    renderKeyState() {
      const tag = $("#chatModeTag");
      const s = App.state.settings;
      if (s.hasKey) {
        tag.textContent = "在线模式 · " + s.model + " · 思考" + App.thinkingLabel(s.thinking);
        tag.className = "tag ok";
      } else {
        tag.textContent = App.state.serverOnline ? "离线模式 · 需配置 Key" : "未连接本地服务";
        tag.className = "tag warn";
      }
    },

    async saveSettings() {
      const status = $("#settingsStatus");
      let extra = {};
      const rawExtra = ($("#setExtra").value || "").trim();
      if (rawExtra) {
        try { extra = JSON.parse(rawExtra); }
        catch (e) { status.textContent = "❌ 附加参数不是合法 JSON：" + e.message; App.toast("附加参数 JSON 有误", "bad"); return; }
        if (typeof extra !== "object" || Array.isArray(extra)) {
          status.textContent = "❌ 附加参数必须是 JSON 对象，例如 {\"max_tokens\": 4096}";
          return;
        }
      }
      // 关键：留空的字段一律「不修改」，绝不把空值发过去覆盖已有配置
      const body = {
        thinking: $("#setThinking").value,
        extraParams: extra
      };
      const key = $("#setKey").value.trim();
      if (key) body.apiKey = key;
      const base = $("#setBase").value.trim();
      if (base) body.baseUrl = base;
      const model = $("#setModel").value.trim();
      if (model) body.model = model;
      const budget = ($("#setBudget").value || "").trim();
      if (budget !== "") body.thinkingBudget = Number(budget) || 0;
      const imgModel = ($("#setImageModel").value || "").trim();
      if (imgModel) body.imageModel = imgModel;
      if ($("#setVisionModel")) {
        body.visionModel = ($("#setVisionModel").value || "").trim();   // 允许清空 = 用主模型
      }
      const ghToken = ($("#setGhToken") ? $("#setGhToken").value.trim() : "");
      if (ghToken) body.githubToken = ghToken;

      status.textContent = "保存中…";
      try {
        const res = await App.post("/api/settings", body);
        if (!res.ok) throw new Error(res.error || "保存失败");
        App.state.settings = res;
        App.renderKeyState();
        status.textContent = res.hasKey
          ? "✅ 已保存：Key " + res.keyHint + " 保留中 · 模型 " + res.model +
            " · 思考强度 " + App.thinkingLabel(res.thinking) + "（预算 " + res.thinkingBudget + " token）"
          : "⚠️ 当前没有可用 Key，处于离线模式（可粘贴新 Key 后保存）";
        App.toast(res.hasKey ? "配置已保存（Key 未改动）" : "已保存，但还没有可用 Key", res.hasKey ? "ok" : "bad");
        $("#setKey").value = "";
        App.refreshKeyHint();
      } catch (e) {
        status.textContent = "❌ " + e.message;
        App.toast("保存失败：" + e.message, "bad");
      }
    },

    refreshKeyHint() {
      const s = App.state.settings;
      const el = $("#keyState");
      if (!el) return;
      if (s.hasKey) {
        el.innerHTML = '（已保存：<b>' + App.escape(s.keyHint || "已配置") + '</b>，留空保存不会清除）';
      } else {
        el.innerHTML = "（当前未配置，粘贴后点保存）";
      }
    },

    async clearKey() {
      if (!confirm("确定清除已保存的 API Key？清除后答疑与自动评分会进入离线模式。")) return;
      try {
        const res = await App.post("/api/settings", { clearKey: true });
        App.state.settings = res;
        App.renderKeyState();
        App.refreshKeyHint();
        $("#setKey").value = "";
        $("#settingsStatus").textContent = "已清除 Key，当前为离线模式。";
        App.toast("已清除 Key", "bad");
      } catch (e) { App.toast("清除失败：" + e.message, "bad"); }
    },

    async fetchModels() {
      const status = $("#settingsStatus");
      const btn = $("#btnFetchModels");
      btn.disabled = true;
      status.textContent = "正在拉取模型列表…";
      try {
        const res = await App.get("/api/models");
        if (!res.ok) throw new Error(res.error || "拉取失败");
        const list = res.models || [];
        $("#modelList").innerHTML = list.map(m => '<option value="' + App.escape(m) + '"></option>').join("");
        const cur = $("#setModel").value.trim();
        if (!cur || list.indexOf(cur) === -1) {
          const preferred = list.find(m => m === "deepseek-v4.1-flash") || list.find(m => /deepseek/i.test(m)) || list[0];
          if (preferred) $("#setModel").value = preferred;
        }
        status.textContent = "✅ 拉取到 " + list.length + " 个模型，点模型名输入框可下拉选择（已按对话类优先排序）";
      } catch (e) {
        status.textContent = "❌ " + e.message;
      }
      btn.disabled = false;
    },

    async testKey() {
      const status = $("#settingsStatus");
      status.textContent = "测试中（可能需要几秒）…";
      const key = $("#setKey").value.trim();
      if (key) {
        try {
          await App.post("/api/settings", { apiKey: key });
          $("#setKey").value = "";
        } catch (e) {}
      }
      const base = $("#setBase").value.trim();
      const model = $("#setModel").value.trim();
      if (base || model) {
        const patch = {};
        if (base) patch.baseUrl = base;
        if (model) patch.model = model;
        try { await App.post("/api/settings", patch); } catch (e) {}
      }
      try {
        const res = await App.post("/api/chat", {
          messages: [{ role: "user", content: "只回复两个字：可用" }],
          temperature: 0
        });
        if (res.ok) {
          status.textContent = "✅ 连接成功（Key " + (App.state.settings.keyHint || "已配置") + "）模型回复：" + res.content.slice(0, 30) +
            (res.reasoningTokens ? " · 思考 " + res.reasoningTokens + " token" : "");
        } else {
          status.textContent = "❌ " + res.error;
        }
      } catch (e) {
        status.textContent = "❌ " + e.message;
      }
      await App.loadSettings();
      App.refreshKeyHint();
    },

    exportState() {
      const blob = new Blob([JSON.stringify(App.state.progress, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "agent-hub-progress-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      App.toast("进度已导出", "ok");
    },

    /* ---------------- 分享链接：换网络后 IP 会变，这里现取现显示 ---------------- */
    async openShare() {
      const hint = $("#shareHint");
      const warn = $("#shareWarn");
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ""; };
      if (hint) hint.textContent = "正在检测当前网络…";
      if (warn) warn.innerHTML = "";
      setVal("shareSelf", "");
      setVal("shareOther", "");

      let res = null;
      try { res = await App.get("/api/lan"); } catch (e) { res = null; }

      if (!res || !res.ok) {
        if (hint) hint.textContent = "读不到网络信息：服务可能没启动。";
        if (warn) warn.innerHTML = "先在电脑上双击 <code>launch-lan.cmd</code> 启动服务，再点「重新检测」。";
        App.openModal("shareModal");
        return;
      }

      const ips = res.ips || [];
      const port = res.port || 8787;
      const token = res.token || "";
      const local = "http://127.0.0.1:" + port + "/" + (token ? "?k=" + token : "");
      const localEl = $("#shareLocal");
      if (localEl) localEl.textContent = local;

      const other = (res.users || []).find(u => !u.primary);
      const u2Name = $("#shareU2Name");
      if (u2Name) u2Name.textContent = other ? other.name : "同学";

      if (!ips.length) {
        if (hint) hint.textContent = "没检测到可用的局域网地址 —— 现在只有这台电脑自己能打开。";
        if (warn) {
          warn.innerHTML = "你大概<strong>没连网络</strong>（或连的是虚拟网卡）。" +
            "连上 WiFi 或手机热点后，点下面的「重新检测」。";
        }
        setVal("shareSelf", local);
        setVal("shareOther", local);
        App.openModal("shareModal");
        return;
      }

      const ip = ips[0];
      const selfUrl = "http://" + ip + ":" + port + "/" + (token ? "?k=" + token : "");
      const otherUrl = "http://" + ip + ":" + port + "/" + (token ? "?k=" + token + "&" : "?") +
        "u=" + (other ? other.slug : "u2");

      if (hint) {
        hint.textContent = "当前地址 " + ip + (ips.length > 1 ? "（检测到 " + ips.length + " 个可用地址，已选最可能的一个）" : "") +
          "。换网络后 IP 会变，重新打开本窗口即可拿到新链接。";
      }
      setVal("shareSelf", selfUrl);
      setVal("shareOther", otherUrl);

      if (warn) {
        warn.innerHTML = "同学要和你连<strong>同一个网络</strong>（同一个 WiFi 或同一个手机热点）才能打开。" +
          "用手机热点时，你的电脑不能休眠。";
      }

      App.openModal("shareModal");
    },

    /* ---------------- 启动 ---------------- */
    async boot() {
      // 0) 先确定成员（多用户：数据完全隔离）与全局设置
      App.state.serverOnline = false;
      App.resolveToken();
      await App.loadSettings();
      if (window.Users) { await Users.load(); Users.init(); }

      // 1) 先用本成员自己的本地缓存渲染，避免白屏
      try {
        const cached = localStorage.getItem(App.userKey(LS_KEY));
        if (cached) App.state.progress = JSON.parse(cached);
      } catch (e) {}
      try {
        const cachedResume = localStorage.getItem(App.userKey(LS_RESUME));
        if (cachedResume) App.state.progress.resume = JSON.parse(cachedResume);
      } catch (e) {}

      // 2) 再拉服务端状态（服务端为准）
      try {
        const res = await App.get("/api/state");
        if (res && res.ok && res.progress && Object.keys(res.progress).length) {
          const server = res.progress;
          const localWeeks = App.state.progress.weeks || {};
          const serverWeeks = server.weeks || {};
          const localEmpty = Object.keys(localWeeks).every(k => !(localWeeks[k].done || []).length);
          // 本地为空（新浏览器 / 清了缓存）时直接以服务器为准，不要用空值去「合并」掉真实打卡
          const merged = localEmpty ? serverWeeks : {};
          if (!localEmpty) {
            Object.keys(Object.assign({}, localWeeks, serverWeeks)).forEach(k => {
              const a = localWeeks[k] || {}, b = serverWeeks[k] || {};
              merged[k] = {
                done: Array.from(new Set((a.done || []).concat(b.done || []))),
                hours: Math.max(Number(a.hours) || 0, Number(b.hours) || 0),
                note: a.note || b.note || ""
              };
            });
          }
          server.weeks = merged;
          server.interview = server.interview || { rounds: [], weakCategories: [] };
          server.questions = server.questions && server.questions.length ? server.questions : (App.state.progress.questions || []);
          // 简历数据取「更新的一份」，避免旧副本覆盖新编辑
          const localResume = App.state.progress.resume;
          const serverResume = server.resume;
          if (localResume && serverResume) {
            const lt = Date.parse(localResume.updatedAtISO || "") || 0;
            const st = Date.parse(serverResume.updatedAtISO || "") || 0;
            server.resume = st > lt ? serverResume : localResume;
          } else {
            server.resume = localResume || serverResume;
          }
          App.state.progress = server;
        }
        App.state.serverOnline = true;
        App.stateLoaded = true;      // 加载完成，之后才允许回写服务器
      } catch (e) {
        App.state.serverOnline = false;
      }

      App.renderSidebar();
      if (App.state.serverOnline) await App.loadMemory();
      if (window.Users) Users.renderChip();

      // 3) 各页面初始化
      Roadmap.init();
      ResumePage.init();
      Interview.init();
      ChatPage.init();
      if (window.MemoryPage) MemoryPage.init();
      if (window.TrendingPage) TrendingPage.init();

      // 4) 事件绑定
      $$(".nav-item").forEach(b => b.addEventListener("click", () => App.go(b.dataset.view)));
      $$("[data-close-modal]").forEach(b => b.addEventListener("click", () => {
        $$(".modal").forEach(m => m.classList.add("hidden"));
      }));
      $$(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.classList.add("hidden"); }));
      $("#btnSettings").addEventListener("click", () => {
        $("#setBase").value = App.state.settings.baseUrl || "https://api.deepseek.com";
        $("#setModel").value = App.state.settings.model || "deepseek-chat";
        $("#setThinking").value = App.state.settings.thinking || "high";
        $("#setBudget").value = App.state.settings.thinkingBudget || 16384;
        $("#setExtra").value = (App.state.settings.extraParams && Object.keys(App.state.settings.extraParams).length)
          ? JSON.stringify(App.state.settings.extraParams) : "";
        if ($("#setImageModel")) $("#setImageModel").value = App.state.settings.imageModel || "qwen-image-3.0-pro";
        if ($("#setVisionModel")) $("#setVisionModel").value = App.state.settings.visionModel || "";
        if ($("#setGhToken")) $("#setGhToken").value = "";
        if ($("#ghTokenState")) {
          $("#ghTokenState").innerHTML = App.state.settings.hasGithubToken
            ? "（已配置 Token，热榜配额更高；留空保存不会清除）"
            : "（可选：填了热榜抓取配额从 10 次/时 提到 30 次/分）";
        }
        $("#setKey").value = "";
        App.refreshKeyHint();
        $("#settingsStatus").textContent = App.state.settings.hasKey
          ? "当前 Key：" + (App.state.settings.keyHint || "已配置") + "（留空保存不会清除它）"
          : "当前未配置 Key。";
        App.openModal("settingsModal");
      });
      $("#btnSaveSettings").addEventListener("click", () => App.saveSettings());
      $("#btnTestKey").addEventListener("click", () => App.testKey());
      $("#btnClearKey").addEventListener("click", () => App.clearKey());
      $("#btnFetchModels").addEventListener("click", () => App.fetchModels());
      $("#btnExportState").addEventListener("click", () => App.exportState());
      if ($("#btnShareLink")) $("#btnShareLink").addEventListener("click", () => App.openShare());
      if ($("#btnRefreshShare")) $("#btnRefreshShare").addEventListener("click", () => App.openShare());
      $$("[data-copy]").forEach(b => b.addEventListener("click", function () {
        const el = document.getElementById(b.dataset.copy);
        if (!el) return;
        el.select();
        el.setSelectionRange(0, 99999);
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(el.value).then(
              () => App.toast("已复制", "ok"),
              () => { document.execCommand("copy"); App.toast("已复制", "ok"); });
          } else {
            document.execCommand("copy");
            App.toast("已复制", "ok");
          }
        } catch (e) { App.toast("复制失败，请手动选中复制", "bad"); }
      }));

      const hash = (location.hash || "").replace("#", "");
      App.go(["roadmap", "resume", "interview", "chat", "memory", "trending"].indexOf(hash) >= 0 ? hash : "roadmap");
      if (!App.state.serverOnline) App.toast("未检测到本地服务：进度只存浏览器，且无法自动评分。请用 start.cmd 启动服务。", "bad");

      // 5) 首次进入：先选成员；新成员还要填画像问卷
      if (window.Users) {
        if (!Users.storedSlug()) {
          setTimeout(() => Users.openSelect(), 400);
        } else if (Users.needsOnboarding()) {
          setTimeout(() => Users.openOnboarding(false), 500);
        }
      }
    }
  };

  return App;
})();