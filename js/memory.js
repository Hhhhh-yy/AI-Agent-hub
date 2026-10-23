/* ==========================================================================
   memory.js · 长期记忆页
   自动更新的部分：当前机器/工具链（每次启动 + 可手动刷新）、疑问解答（问答后）、
                  学习里程碑（完成一周 / 考完一轮面试）
   手动维护的部分：学生画像、名下设备、环境补充说明、长期备注
   ========================================================================== */
window.MemoryPage = (function () {
  "use strict";
  const $ = App.$, $$ = App.$$;
  let faqExpanded = false;

  function mem() { return App.state.memory || {}; }

  /* ---------------- KPI ---------------- */
  function renderKpis() {
    const m = mem();
    const rounds = ((App.state.progress.interview || {}).rounds || []).length;
    const env = m.environment || {};
    const tools = env["已装工具"] || {};
    const toolOk = Object.keys(tools).filter(k => String(tools[k]).indexOf("✅") === 0).length;
    const toolNo = Object.keys(tools).filter(k => String(tools[k]).indexOf("❌") === 0).length;
    const prof = m.profile || {};
    const profFilled = Object.keys(prof).filter(k => String(prof[k] || "").trim()).length;

    $("#memKpis").innerHTML = [
      { label: "学习原则", value: (m.principles || []).length + " 条", note: "决定 AI 讲多深" },
      { label: "学生画像", value: profFilled + " 项", note: "决定回答怎么贴合你" },
      { label: "已装工具", value: toolOk + " 可用", note: toolNo ? toolNo + " 项缺失" : "环境齐备" },
      { label: "长期备注", value: (m.notes || []).length + " 条", note: "手动维护" },
      { label: "关注清单", value: (m.watchlist || []).length + " 项", note: "来自 GitHub 热榜" },
      { label: "模拟面试轮次", value: rounds + " 轮", note: "来自进度数据" },
      { label: "档案更新时间", value: ((m.updatedAt || "—").split(" ")[1] || "—"), note: (m.updatedAt || "").split(" ")[0] || "还没写入" }
    ].map(k => '<div class="kpi"><span>' + App.escape(k.label) + '</span><b>' + App.escape(String(k.value)) +
      '</b><em>' + App.escape(k.note) + '</em></div>').join("");
  }


  /* ---------------- 当前机器 ---------------- */
  function renderEnv() {
    const env = mem().environment || {};
    $("#memEnvTime").textContent = env["探测时间"] ? "探测于 " + env["探测时间"].slice(5) : "尚未探测";
    const rows = Object.keys(env).filter(k => k !== "已装工具" && k !== "探测时间")
      .map(k => '<div class="mem-kv"><span class="k">' + App.escape(k) + '</span><span class="v">' + App.escape(String(env[k])) + '</span></div>').join("");
    const tools = env["已装工具"] || {};
    const toolHtml = Object.keys(tools).length
      ? '<div class="mem-tools">' + Object.keys(tools).map(t => {
          const val = String(tools[t]);
          const ok = val.indexOf("✅") === 0;
          const warn = val.indexOf("⚠️") === 0;
          return '<span class="mem-tool ' + (ok ? "ok" : (warn ? "warn" : "no")) + '"><b>' + App.escape(t) + '</b>' +
            App.escape(val.replace(/^[✅❌⚠️]\s*/, "").slice(0, 52)) + '</span>';
        }).join("") + "</div>"
      : "";
    $("#memEnv").innerHTML = rows + (toolHtml ? '<div class="mem-sub">已装工具（每次启动 + 点右上角刷新时更新）</div>' + toolHtml : "") +
      '<p class="muted small" style="margin:12px 0 0">这一块会自动更新：换了机器、装了新工具、改了 Python 版本，点右上角「🔄 重新探测环境与工具」即可（也会在每次启动网站时自动刷新）。' +
      '下方「环境补充说明」与「长期备注」是你手写的，不会自动改；两者冲突时以自动探测为准。</p>';
  }

  /* ---------------- 画像（可编辑） ---------------- */
  function renderProfile() {
    const p = mem().profile || {};
    $("#memProfile").innerHTML = Object.keys(p).map(k =>
      '<div class="field"><label>' + App.escape(k) + '</label>' +
      '<textarea data-mem-profile="' + App.escape(k) + '" rows="' + (String(p[k]).length > 60 ? 3 : 2) + '">' +
      App.escape(p[k]) + '</textarea></div>').join("");
  }

  /* ---------------- 设备（可编辑） ---------------- */

  /* ---------------- 环境补充说明（可编辑） ---------------- */
  function renderEnvNotes() {
    const notes = mem().environment_notes || {};
    const keys = Object.keys(notes);
    const missingRoot = !String(notes["代码根目录"] || "").trim();
    const hint = missingRoot
      ? '<p class="muted small" style="color:#fbbf24;margin-bottom:8px">⚠️ 还没填「代码根目录」。' +
        '不填的话，教学里给的路径是通用的，可能和你的电脑不一致。' +
        '点「➕ 加一条」，标题写 <b>代码根目录</b>，内容填你自己的，例如 ' +
        '<code>D:\\code\\agent-lab</code>。</p>'
      : "";
    $("#memEnvNotes").innerHTML = hint + (keys.length ? keys.map((k, i) =>
      '<div class="mem-kv-edit">' +
      '<input type="text" data-envnote-key="' + i + '" value="' + App.escape(k) + '" placeholder="标题">' +
      '<textarea data-envnote-val="' + i + '" rows="2" placeholder="内容">' + App.escape(notes[k]) + '</textarea>' +
      '<button class="ed-del" data-del-envnote="' + i + '" title="删除">✕</button>' +
      '</div>').join("") : '<p class="muted small">还没有补充说明。</p>');
  }

  /* ---------------- 长期备注 ---------------- */
  function renderNotes() {
    const notes = mem().notes || [];
    $("#memNoteCount").textContent = notes.length + " 条";
    $("#memNotes").innerHTML = notes.length
      ? '<ul class="bullet-list">' + notes.map((n, i) =>
          '<li>' + App.escape(n) + ' <button class="mini-x" data-del-note="' + i + '">✕</button></li>').join("") + "</ul>"
      : '<p class="muted small">还没有。写下要它长期记住的事，例如「我不看视频课」「实验室服务器不能随便装东西」。</p>';
  }

  /* ---------------- 里程碑 ---------------- */

  /* ---------------- 疑问解答记忆 ---------------- */

  /* ---------------- 关注清单 ---------------- */
  /* ---------------- 学习原则：这是内置 AI 最该长期记住的东西 ---------------- */
  const DEFAULT_PRINCIPLES = ["区分「必须会」和「会用即可」：核心能力（设计、评估、归因）逼我自己写；命令和配置直接给我，别讲原理。", "不要让我背命令、背参数、背框架 API —— 这些半年就换，教我「什么时候该查什么」就够。", "每个工具类任务最多 45 分钟。超时就直接给最小可行路径，剩下的你替我做完。", "面试可能问的技术，哪怕我不动手，也要讲清「它解决什么问题、代价是什么」。", "AI 能生成代码，但「什么算做对了」必须我自己定义 —— 每次任务先让我说验收标准。", "发现我在抄命令却不理解时，停下来问「这条命令干了什么」，答不出就重讲。", "一次不要给我超过 3 个新术语；新术语第一次出现必须用括号解释。",
    "只让我深挖「AI 越强越值钱」的判断力（评估标准、失败归因、取舍、安全边界）；命令、配置、框架 API 这些带版本号的，直接给成品，不要让我练。",
    "如果我在学一个一两年后会被 AI 替代的操作，直接打断我，告诉我该把时间花在哪。"];

  let principles = [];

  function loadPrinciples() {
    const p = (App.state.memory && App.state.memory.principles) || [];
    principles = (Array.isArray(p) && p.length) ? p.slice() : DEFAULT_PRINCIPLES.slice();
  }

  function renderPrinciples() {
    const box = $("#memPrinciples");
    if (!box) return;
    loadPrinciples();
    box.innerHTML = principles.map(function (t, i) {
      return '<div class="principle-row">' +
        '<span class="pr-num">' + (i + 1) + '</span>' +
        '<input class="pr-input" data-pr="' + i + '" value="' + App.escape(t) + '" />' +
        '<button class="ed-del" data-pr-del="' + i + '" title="删除这条">\u2715</button>' +
        '</div>';
    }).join("");
    const cnt = $("#memPrincipleCount");
    if (cnt) cnt.textContent = principles.length + " \u6761";
  }

  async function savePrinciples() {
    const list = [];
    App.$$("#memPrinciples [data-pr]").forEach(function (el) {
      const v = (el.value || "").trim();
      if (v) list.push(v);
    });
    try {
      const res = await App.post("/api/memory", { principles: list });
      if (res && res.ok) {
        App.state.memory = res.memory || App.state.memory;
        renderPrinciples();
        App.toast("\u5b66\u4e60\u539f\u5219\u5df2\u4fdd\u5b58", "ok");
      } else {
        App.toast("\u4fdd\u5b58\u5931\u8d25", "bad");
      }
    } catch (e) { App.toast("\u4fdd\u5b58\u5931\u8d25\uff1a" + e.message, "bad"); }
  }

  function renderWatchlist() {
    const wl = mem().watchlist || [];
    $("#memWatchCount").textContent = wl.length + " 项";
    if (!wl.length) {
      $("#memWatchlist").innerHTML = '<p class="muted small">还没有。在「GitHub 热榜」里点「☆ 加入我的关注清单」，项目就会存到这里（清空对话与重启网站都不会丢）。</p>';
      return;
    }
    const ORDER = { "非常推荐": 0, "较为推荐": 1, "适中": 2, "不推荐": 3, "": 4 };
    const sorted = wl.slice().sort((a, b) => (ORDER[a.level] != null ? ORDER[a.level] : 4) - (ORDER[b.level] != null ? ORDER[b.level] : 4));
    $("#memWatchlist").innerHTML = sorted.map(x =>
      '<div class="wl-item">' +
      '<div>' +
      '<a class="wl-name" href="' + App.escape(x.url || "#") + '" target="_blank" rel="noopener">' + App.escape(x.name) + '</a>' +
      '<div class="wl-meta">⭐ ' + App.escape(String(x.stars != null ? x.stars : "—")) +
      '　' + App.escape(x.lang || "—") + '　来自：' + App.escape(x.from || "—") + '　加入于 ' + App.escape(x.addedAt || "—") + '</div>' +
      (x.desc ? '<div class="wl-meta">' + App.escape(String(x.desc).slice(0, 150)) + '</div>' : '') +
      (x.why ? '<div class="wl-why"><b>推荐原因：</b>' + App.escape(x.why) + '</div>' : '') +
      '</div>' +
      '<div class="wl-side">' +
      (x.level ? '<div><span class="lvl lvl-' + ({ "非常推荐": "a", "较为推荐": "b", "适中": "c", "不推荐": "d" }[x.level] || "none") + '">' + App.escape(x.level) + '</span></div>' : "") +
      (x.kind ? '<div style="margin-top:6px"><span class="kind ' + ({ "学习相关": "k-learn", "实用工具": "k-tool", "视野扩展": "k-view", "不相关": "k-none" }[x.kind] || "k-none") + '">' + App.escape(x.kind) + '</span></div>' : "") +
      '</div>' +
      '<div style="text-align:right"><button class="ed-del" data-del-watch="' + App.escape(x.name) + '" title="移出清单">✕</button></div>' +
      '</div>').join("");
  }

  function render() {
    renderKpis(); renderEnv(); renderProfile(); renderPrinciples();
    renderEnvNotes(); renderNotes(); renderWatchlist();
  }

  /* ---------------- 保存逻辑 ---------------- */
  function collectProfile() {
    const out = {};
    $$("#memProfile textarea[data-mem-profile]").forEach(t => { out[t.dataset.memProfile] = t.value.trim(); });
    return out;
  }
  function collectEnvNotes() {
    const out = {};
    $$("#memEnvNotes [data-envnote-key]").forEach((k, i) => {
      const key = k.value.trim();
      const val = ($('#memEnvNotes [data-envnote-val="' + i + '"]') || {}).value || "";
      if (key) out[key] = val.trim();
    });
    return out;
  }
  function collectDevices() {
    const devs = (mem().devices || []).map(d => Object.assign({}, d));
    return devs.filter(d => (d.name || "").trim() || (d["配置"] || "").trim());
  }

  function bind() {
    $("#btnSaveProfile").addEventListener("click", async function () {
      const res = await App.saveMemory({ profile: collectProfile() });
      if (res) { render(); App.toast("画像已保存", "ok"); }
    });
    $("#btnSaveEnvNotes").addEventListener("click", async function () {
      const res = await App.saveMemory({ environment_notes: collectEnvNotes() });
      if (res) { render(); App.toast("环境补充说明已保存", "ok"); }
    });

    // 学习原则：保存 / 加一条 / 删一条 / 恢复默认
    const bs = $("#btnSavePrinciples");
    if (bs) bs.addEventListener("click", function () { savePrinciples(); });
    const rs = $("#btnResetPrinciples");
    if (rs) rs.addEventListener("click", async function () {
      if (!confirm("恢复成默认的那套学习原则？你改过的会被覆盖。")) return;
      try {
        const res = await App.post("/api/memory", { principles: DEFAULT_PRINCIPLES });
        if (res && res.ok) {
          App.state.memory = res.memory || App.state.memory;
          renderPrinciples();
          App.toast("已恢复默认原则", "ok");
        }
      } catch (e) { App.toast("恢复失败：" + e.message, "bad"); }
    });
    const ap = $("#btnAddPrinciple");
    if (ap) ap.addEventListener("click", function () {
      const inp = $("#memPrincipleInput");
      const v = (inp.value || "").trim();
      if (!v) { App.toast("先写一条内容", "bad"); return; }
      const list = [];
      App.$$("#memPrinciples [data-pr]").forEach(function (el) {
        if ((el.value || "").trim()) list.push(el.value.trim());
      });
      list.push(v);
      App.post("/api/memory", { principles: list }).then(function (res) {
        if (res && res.ok) {
          App.state.memory = res.memory || App.state.memory;
          inp.value = "";
          renderPrinciples();
          App.toast("已加一条原则", "ok");
        }
      });
    });
    const mb = $("#btnSavePrinciples");
    const box = $("#memPrinciples");
    if (box) box.addEventListener("click", async function (e) {
      const del = e.target.closest("[data-pr-del]");
      if (!del) return;
      const list = [];
      App.$$("#memPrinciples [data-pr]").forEach(function (el) {
        if ((el.value || "").trim()) list.push(el.value.trim());
      });
      list.splice(Number(del.dataset.prDel), 1);
      try {
        const res = await App.post("/api/memory", { principles: list });
        if (res && res.ok) {
          App.state.memory = res.memory || App.state.memory;
          renderPrinciples();
          App.toast("已删除", "ok");
        }
      } catch (err) { App.toast("删除失败：" + err.message, "bad"); }
    });

    $("#btnAddEnvNote").addEventListener("click", function () {
      const notes = collectEnvNotes();
      notes["新说明 " + (Object.keys(notes).length + 1)] = "";
      App.state.memory.environment_notes = notes;
      renderEnvNotes();
    });
    $("#memEnvNotes").addEventListener("click", function (e) {
      const del = e.target.closest("[data-del-envnote]");
      if (!del) return;
      const notes = collectEnvNotes();
      delete notes[Object.keys(notes)[Number(del.dataset.delEnvnote)]];
      App.saveMemory({ environment_notes: notes }).then(() => { render(); });
    });


    $("#btnAddNote2").addEventListener("click", async function () {
      const v = ($("#memNoteInput2").value || "").trim();
      if (!v) return;
      const next = (mem().notes || []).concat([v]);
      const res = await App.saveMemory({ notes: next });
      if (res) { $("#memNoteInput2").value = ""; render(); App.toast("已写入长期记忆", "ok"); }
    });
    $("#memNotes").addEventListener("click", function (e) {
      const del = e.target.closest("[data-del-note]");
      if (!del) return;
      const next = (mem().notes || []).slice();
      next.splice(Number(del.dataset.delNote), 1);
      App.saveMemory({ notes: next }).then(() => render());
    });

    $("#btnRefreshEnv").addEventListener("click", async function () {
      App.toast("正在重新探测环境与工具链…", "ok");
      const res = await App.saveMemory({ action: "refresh_env" });
      if (res) { render(); App.toast("已刷新（uv / Git / Docker 等工具状态已更新）", "ok"); }
    });

    $("#btnExportMemory").addEventListener("click", function () {
      const blob = new Blob([JSON.stringify(mem(), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "长期记忆-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      App.toast("已导出记忆档案", "ok");
    });

    $("#memWatchlist").addEventListener("click", async function (e) {
      const del = e.target.closest("[data-del-watch]");
      if (!del) return;
      const res = await App.saveMemory({ watchlistRemove: del.dataset.delWatch });
      if (res) { render(); App.toast("已移出关注清单", "ok"); }
    });
    const cw = $("#btnClearWatchlist");
    if (cw) cw.addEventListener("click", async function () {
      if (!confirm("清空整个关注清单？")) return;
      const res = await App.saveMemory({ watchlist: [] });
      if (res) { render(); App.toast("关注清单已清空", "ok"); }
    });
    const ew = $("#btnExportWatchlist");
    if (ew) ew.addEventListener("click", function () {
      const wl = mem().watchlist || [];
      const md = ["# 我的关注清单（" + wl.length + " 项）", ""].concat(
        wl.map(x => "- [" + (x.level || "—") + "｜" + (x.kind || "—") + "] [" + x.name + "](" + x.url + ")" +
          (x.why ? "\n  - 推荐原因：" + x.why : "")));
      navigator.clipboard.writeText(md.join("\n")).then(
        () => App.toast("已复制 Markdown 清单，可粘到笔记或对话里", "ok"),
        () => App.toast("复制失败", "bad"));
    });
    $("#btnClearMemory2").addEventListener("click", async function () {
      if (!confirm("重置整个记忆档案？（画像、设备、备注、问答、里程碑全部回到初始，环境会重新探测）")) return;
      const res = await App.saveMemory({ action: "clear_all" });
      if (res) { render(); App.toast("记忆档案已重置", "bad"); }
    });
  }

  function init() { render(); bind(); }

  async function onEnter() {
    if (App.state.serverOnline) await App.loadMemory();
    render();
  }

  return { init: init, onEnter: onEnter, render: render };
})();