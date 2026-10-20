/* ==========================================================================
   trending.js · GitHub 热榜页
   数据：GitHub 搜索 API（时间窗口内新建 + star 最多）
   分析：模型结合长期记忆给出「这是什么 / 推荐原因（学习 or 好用）/ 推荐等级」
   更新：服务端每天定时抓取，进页面只读缓存，不触发检索
   ========================================================================== */
window.TrendingPage = (function () {
  "use strict";
  const $ = App.$, $$ = App.$$;

  let state = {
    window: "week",
    ai: false,
    entry: null,
    analysis: null,
    fetchedAt: "",
    auto: null,
    nextRun: "",
    stale: false,
    watchlist: [],
    loading: false,
    analyzing: false,
    running: false,
    error: "",
    loadedOnce: false
  };

  const LVL_CLASS = { "非常推荐": "lvl-a", "较为推荐": "lvl-b", "适中": "lvl-c", "不推荐": "lvl-d" };
  const KIND_CLASS = { "学习相关": "k-learn", "实用工具": "k-tool", "视野扩展": "k-view", "不相关": "k-none" };
  const WINDOW_CN = { week: "近七天", month: "近一个月", quarter: "近三个月", all: "总榜" };

  function analysisMap() {
    const map = {};
    ((state.analysis && state.analysis.items) || []).forEach(it => { map[String(it.name || "").trim()] = it; });
    return map;
  }
  function watched(name) { return state.watchlist.some(x => String(x.name) === String(name)); }
  function fmtStars(n) {
    if (n == null) return "—";
    if (n >= 10000) return (n / 10000).toFixed(1) + " 万";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  function renderAutoBar() {
    const a = state.auto || {};
    const hour = a.hour != null ? a.hour : 8;
    const scope = a.analyze || "week";
    const opts = [];
    for (let h = 0; h < 24; h++) {
      opts.push('<option value="' + h + '"' + (h === hour ? " selected" : "") + '>' + String(h).padStart(2, "0") + ':00</option>');
    }
    $("#trendAutoBar").innerHTML =
      '<span class="tag ' + (state.stale ? "warn" : "ok") + '">' +
        (state.fetchedAt ? "数据抓取于 " + App.escape(state.fetchedAt.slice(5)) : "尚无数据") + '</span>' +
      '<label class="switch">每天 <select id="autoHour">' + opts.join("") + '</select> 自动更新</label>' +
      '<label class="switch">分析范围 <select id="autoScope">' +
        '<option value="off"' + (scope === "off" ? " selected" : "") + '>不自动分析（省额度）</option>' +
        '<option value="week"' + (scope === "week" ? " selected" : "") + '>仅近七天（推荐）</option>' +
        '<option value="all"' + (scope === "all" ? " selected" : "") + '>四个窗口全部分析</option>' +
      '</select></label>' +
      '<button class="ghost-btn" id="btnAutoSave">保存定时设置</button>' +
      '<button class="ghost-btn" id="btnRunNow"' + (state.running ? " disabled" : "") + '>' +
        (state.running ? "更新中…" : "⚡ 立即更新一次") + '</button>' +
      '<span class="muted small">上次自动更新：' + App.escape(a.lastRun || "尚未执行") +
        "　下次：" + App.escape(state.nextRun || "—") + '</span>' +
      (a.lastStatus ? '<span class="muted small">结果：' + App.escape(a.lastStatus) + '</span>' : "") +
      (state.stale ? '<span class="muted small" style="color:var(--warn)">数据已超过 26 小时未更新：网站需要处于打开状态才会执行定时任务（或用 update_trending.py + 计划任务）</span>' : "");

    const hs = $("#autoHour"), sc = $("#autoScope");
    if (hs) hs.addEventListener("change", saveAuto);
    if (sc) sc.addEventListener("change", saveAuto);
    const sv = $("#btnAutoSave");
    if (sv) sv.addEventListener("click", function () { saveAuto(true); });
    const rn = $("#btnRunNow");
    if (rn) rn.addEventListener("click", runNow);
  }

  async function saveAuto(explicit) {
    const hour = Number(($("#autoHour") || {}).value);
    const analyze = ($("#autoScope") || {}).value || "week";
    try {
      const res = await App.post("/api/trending/auto", { hour: hour, analyze: analyze });
      if (res.ok) {
        state.auto = res.auto;
        state.nextRun = res.nextRun;
        renderAutoBar();
        if (explicit) App.toast("定时设置已保存：每天 " + String(hour).padStart(2, "0") + ":00 更新，分析范围 " + analyze, "ok");
      }
    } catch (e) { App.toast("保存失败：" + e.message, "bad"); }
  }

  async function runNow() {
    if (state.running) return;
    if (!confirm("立即更新一次：会抓取四个窗口（消耗 GitHub 搜索配额），并按当前设置生成分析（可能调用模型）。\n继续？")) return;
    state.running = true; renderAutoBar();
    App.toast("正在更新，首次可能需要 1–2 分钟…", "ok");
    try {
      const res = await App.post("/api/trending/run", {});
      if (res.ok) {
        state.auto = res.auto; state.nextRun = res.nextRun;
        App.toast("更新完成：" + res.status, "ok");
        await load(false);
      } else {
        App.toast("更新失败：" + res.error, "bad");
      }
    } catch (e) { App.toast("更新失败：" + e.message, "bad"); }
    state.running = false; renderAutoBar();
  }

  function renderMeta() {
    const e = state.entry;
    $("#trendQuery").innerHTML = e && e.meta
      ? "抓取条件：<code>" + App.escape(e.meta.query) + "</code>　命中 <b>" +
        (e.meta.total != null ? e.meta.total.toLocaleString() : "—") + "</b> 个 · 按 star 降序取前 20" +
        (e.meta.remaining != null ? "　（GitHub 剩余搜索配额 " + App.escape(String(e.meta.remaining)) + "）" : "")
      : "";
    const an = state.analysis;
    $("#trendMeta").textContent = (an ? "分析于 " + (an.at || "").slice(5) + (an.source === "heuristic" ? "（规则打分）" : "") : "未分析") +
      "　· 清单 " + state.watchlist.length + " 项";
    $("#btnTrendAnalyze").textContent = state.analyzing ? "分析中…" : (an ? "🤖 重新生成分析" : "🤖 生成 AI 分析");
    $("#btnTrendAnalyze").disabled = state.analyzing || state.loading || state.running;
    renderAutoBar();
  }

  function renderList() {
    const box = $("#trendList");
    if (state.loading) { box.innerHTML = '<div class="panel"><p class="muted">正在读取热榜数据…</p></div>'; return; }
    if (state.error) {
      box.innerHTML = '<div class="panel"><p style="color:var(--bad)">⚠️ ' + App.escape(state.error) +
        '</p><p class="muted small">可以点「⚡ 立即更新一次」，或在设置里填 GitHub Token 提高配额。</p></div>';
      return;
    }
    const items = (state.entry && state.entry.items) || [];
    if (!items.length) {
      box.innerHTML = '<div class="panel"><p class="muted">还没有数据。点上方「⚡ 立即更新一次」抓取，或等待每日定时任务。</p></div>';
      return;
    }
    const map = analysisMap();

    box.innerHTML = items.map((it, i) => {
      const a = map[String(it.name).trim()] || {};
      const lvl = a.level || "";
      const kind = a.kind || "";
      const inList = watched(it.name);
      return '<div class="trend-card">' +
        '<div class="trend-rank">' + (i + 1) + '</div>' +
        '<div class="trend-main">' +
        '<div class="trend-head">' +
        '<a class="trend-name" href="' + App.escape(it.url || "#") + '" target="_blank" rel="noopener">' + App.escape(it.name) + '</a>' +
        '<span class="trend-stats">⭐ ' + fmtStars(it.stars) + '　⑂ ' + fmtStars(it.forks) +
        '　<span class="lang">' + App.escape(it.lang || "—") + '</span>　建于 ' + App.escape(it.created || "") + '</span>' +
        '</div>' +
        (it.desc ? '<div class="trend-desc">' + App.escape(it.desc) + '</div>' : '') +
        (it.topics && it.topics.length ? '<div class="trend-topics">' + it.topics.map(t => '<span class="topic">' + App.escape(t) + '</span>').join("") + '</div>' : '') +
        (a.intro ? '<div class="trend-ai"><b>这是什么：</b>' + App.escape(a.intro) + '</div>' : '') +
        (a.fit ? '<div class="trend-ai fit"><b>推荐原因：</b>' + App.escape(a.fit) + '</div>' : '') +
        (!a.intro ? '<div class="trend-ai muted small">点右上角「生成 AI 分析」后，这里会出现中文介绍与推荐原因。</div>' : '') +
        '<div class="trend-actions">' +
        '<button class="ghost-btn star-btn' + (inList ? " on" : "") + '" data-star="' + App.escape(it.name) + '">' +
        (inList ? "★ 已在关注清单" : "☆ 加入我的关注清单") + '</button>' +
        '<a class="ghost-btn" href="' + App.escape(it.url || "#") + '" target="_blank" rel="noopener">打开仓库 ↗</a>' +
        '</div>' +
        '</div>' +
        '<div class="trend-lvl">' +
        (lvl ? '<span class="lvl ' + (LVL_CLASS[lvl] || "lvl-none") + '">' + App.escape(lvl) + '</span>' : '<span class="lvl lvl-none">待分析</span>') +
        (kind ? '<div style="margin-top:6px"><span class="kind ' + (KIND_CLASS[kind] || "k-none") + '">' + App.escape(kind) + '</span></div>' : '') +
        '</div>' +
        '</div>';
    }).join("");

    $$("#trendList [data-star]").forEach(b => b.addEventListener("click", function () {
      const name = b.dataset.star;
      const item = items.find(x => x.name === name);
      if (watched(name)) removeWatch(name);
      else addWatch(item, map[name] || {});
    }));
  }

  /* ---------------- 关注清单 ---------------- */
  async function addWatch(item, a) {
    if (!item) return;
    try {
      const res = await App.post("/api/memory", {
        watchlistAdd: [{
          name: item.name, url: item.url, stars: item.stars, lang: item.lang, desc: item.desc,
          level: a.level || "", kind: a.kind || "", why: a.fit || "",
          from: WINDOW_CN[state.window] + (state.ai ? "(AI)" : "")
        }]
      });
      if (res && res.ok) {
        state.watchlist = res.memory.watchlist || [];
        App.state.memory = res.memory;
        renderMeta(); renderList();
        App.toast("已加入关注清单（存进长期记忆，清空对话/重启都不丢）", "ok");
      }
    } catch (e) { App.toast("加入失败：" + e.message, "bad"); }
  }

  async function removeWatch(name) {
    try {
      const res = await App.post("/api/memory", { watchlistRemove: name });
      if (res && res.ok) {
        state.watchlist = res.memory.watchlist || [];
        App.state.memory = res.memory;
        renderMeta(); renderList();
        App.toast("已从关注清单移除", "ok");
      }
    } catch (e) { App.toast("移除失败：" + e.message, "bad"); }
  }

  function render() { renderMeta(); renderList(); }

  async function load(refresh) {
    state.loading = true; state.error = ""; render();
    try {
      const res = await App.get("/api/trending?window=" + state.window + "&ai=" + (state.ai ? 1 : 0) +
        (refresh ? "&refresh=1" : ""));
      state.entry = res.entry || null;
      state.fetchedAt = res.fetchedAt || "";
      state.analysis = res.analysis || null;
      state.auto = res.auto || state.auto;
      state.nextRun = res.nextRun || "";
      state.stale = !!res.stale;
      state.watchlist = res.watchlist || state.watchlist;
      if (!res.ok && res.error) state.error = res.error;
      state.loadedOnce = true;
    } catch (e) {
      state.error = "请求本地服务失败：" + e.message;
    }
    state.loading = false;
    render();
  }

  async function analyze() {
    state.analyzing = true; render();
    try {
      const res = await App.post("/api/trending/analyze", { window: state.window, ai: state.ai });
      if (res.ok) {
        state.analysis = res.analysis;
        App.toast(state.analysis.source === "heuristic"
          ? "已用规则打分生成（未配置模型 Key）"
          : "AI 分析完成（模型 " + (state.analysis.model || "") + "）", "ok");
      } else {
        App.toast("分析失败：" + res.error, "bad");
      }
    } catch (e) { App.toast("分析请求失败：" + e.message, "bad"); }
    state.analyzing = false;
    render();
  }

  function bind() {
    $$("#trendTabs .seg-item").forEach(b => b.addEventListener("click", function () {
      state.window = b.dataset.window;
      $$("#trendTabs .seg-item").forEach(x => x.classList.toggle("active", x === b));
      state.analysis = null;
      load(false);              // 只读缓存，不触发检索
    }));
    $("#trendAiOnly").addEventListener("change", function (e) {
      state.ai = e.target.checked;
      state.analysis = null;
      load(false);
    });
    $("#btnTrendRefresh").addEventListener("click", function () {
      if (!confirm("从 GitHub 重新抓取当前窗口（消耗一次搜索配额）？\n日常更新已由每天定时任务负责。")) return;
      load(true);
    });
    $("#btnTrendAnalyze").addEventListener("click", () => analyze());
  }

  function init() { bind(); }

  function onEnter() {
    // 进页面只读缓存：只有从没读过时才请求一次（服务端此时也不会去检索，除非完全没有数据）
    if (!state.loadedOnce) load(false);
  }

  return { init: init, onEnter: onEnter };
})();