/* ==========================================================================
   resume.js · 简历工坊（左编辑 / 右实时预览 / 导出）
   ========================================================================== */
window.ResumePage = (function () {
  "use strict";
  const $ = App.$, $$ = App.$$;
  const LS_RESUME = "agent-hub-resume-v1";

  let state = null;   // { version, data: {agent, control} }

  /* ---------------- 初始化 ---------------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function ensureState() {
    const saved = (App.state.progress || {}).resume;
    if (saved && saved.data && saved.data.agent && saved.data.control) {
      state = saved;
      if (!state.version) state.version = "agent";
    } else {
      state = { version: "agent", data: { agent: clone(window.RESUME_DATA.agent), control: clone(window.RESUME_DATA.control) } };
    }
  }

  function current() { return state.data[state.version]; }

  function persist() {
    state.updatedAt = new Date().toLocaleString("zh-CN");
    state.updatedAtISO = new Date().toISOString();
    App.state.progress.resume = state;
    try { localStorage.setItem(App.userKey(LS_RESUME), JSON.stringify(state)); } catch (e) {}
    App.persist();
  }

  /* ---------------- 编辑器 ---------------- */
  function fieldRow(si, ii, item, type) {
    const label = { edu: "学校 / 时间", research: "课题名称", projects: "项目名称", skills: "技能标签", text: "" }[type] || "";
    let h = '<div class="ed-row">';
    if (type !== "text") {
      h += '<input type="text" data-si="' + si + '" data-ii="' + ii + '" data-field="name" value="' + App.escape(item.name || "") + '" placeholder="' + label + '">';
    }
    if (type === "edu" || type === "research" || type === "projects") {
      h += '<input type="text" data-si="' + si + '" data-ii="' + ii + '" data-field="sub" value="' + App.escape(item.sub || "") + '" placeholder="' + (type === "edu" ? "学位 / 专业" : "角色 / 类型") + '">';
      h += '<input type="text" data-si="' + si + '" data-ii="' + ii + '" data-field="date" value="' + App.escape(item.date || "") + '" placeholder="时间" style="max-width:150px">';
    }
    h += '<button class="ed-del" data-del-item="' + si + ':' + ii + '" title="删除这一条">✕</button>';
    h += '</div>';

    if (type === "projects" || type === "research") {
      h += '<div class="ed-row"><input type="text" data-si="' + si + '" data-ii="' + ii + '" data-field="tech" value="' + App.escape(item.tech || "") + '" placeholder="技术栈 / 关键词（用 · 分隔）"></div>';
      h += '<div class="ed-row"><textarea data-si="' + si + '" data-ii="' + ii + '" data-field="desc" placeholder="一句话描述：为谁解决什么问题，怎么做">' + App.escape(item.desc || "") + '</textarea></div>';
    }
    if (type === "skills") {
      h += '<div class="ed-row"><textarea data-si="' + si + '" data-ii="' + ii + '" data-field="desc" placeholder="技能内容">' + App.escape(item.desc || "") + '</textarea></div>';
    }
    return h;
  }

  function bulletsEditor(si, ii, item) {
    const bullets = item.bullets || [];
    let h = '<div class="ed-bullets">';
    bullets.forEach(function (b, bi) {
      h += '<div class="ed-bullet">' +
        '<textarea data-si="' + si + '" data-ii="' + ii + '" data-bullet="' + bi + '" placeholder="要点：动词开头 + 做法 + 量化结果">' + App.escape(b) + '</textarea>' +
        '<button class="ed-del" data-del-bullet="' + si + ':' + ii + ':' + bi + '">✕</button>' +
        '</div>';
    });
    h += '</div><button class="ghost-btn ed-add" data-add-bullet="' + si + ':' + ii + '">+ 加一条要点</button>';
    return h;
  }

  function sectionEditor(sec, si) {
    const editable = sec.type !== "text" ? '<button class="ghost-btn ed-add" data-add-item="' + si + '">+ 新增一条</button>' : "";
    return '<div class="ed-sec" data-sec-index="' + si + '">' +
      '<div class="ed-sec-head" data-toggle-sec="' + si + '">' +
      '<h4>' + App.escape(sec.title) + ' <span class="muted small">(' + sec.items.length + ' 条)</span></h4>' +
      '<span class="caret">▼</span></div>' +
      '<div class="ed-sec-body">' +
      sec.items.map((it, ii) => fieldRow(si, ii, it, sec.type) + bulletsEditor(si, ii, it)).join('<hr style="border:none;border-top:1px dashed rgba(255,255,255,.12);margin:10px 0">') +
      editable +
      (sec.type === "projects" || sec.type === "research"
        ? '<div class="ed-hint">提示：每条要尽量带数字（提升 %、延迟 s、成本 元），面试官只看数字和你亲手做的事。</div>' : "") +
      '</div></div>';
  }

  function photoEditor() {
    const p = state.photo;
    return '<div class="ed-sec">' +
      '<div class="ed-sec-head" data-toggle-sec="-2"><h4>证件照 <span class="muted small">（可选，显示在右上角）</span></h4><span class="caret">▼</span></div>' +
      '<div class="ed-sec-body">' +
      '<div class="ed-photo-row">' +
      (p ? '<img class="ed-photo-thumb" src="' + p + '" alt="证件照预览">'
         : '<div class="ed-photo-thumb empty">未上传</div>') +
      '<div class="ed-photo-actions">' +
      '<label class="primary-btn" style="cursor:pointer">' + (p ? "更换照片" : "选择照片") +
      '<input type="file" id="photoInput" accept="image/png,image/jpeg,image/webp" style="display:none"></label>' +
      (p ? '<button class="ghost-btn" id="btnRemovePhoto">移除照片</button>' : '') +
      '<p class="ed-hint">建议用证件照：正面、白底或浅色底、比例 3:4。会自动压缩到 420px 宽（约 30–60KB）只存在你本机，不影响投递。研究所/国企投递常要求附照片。</p>' +
      '</div></div></div></div>';
  }

  function processPhoto(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { App.toast("请选择图片文件（jpg/png/webp）", "bad"); return; }
    if (file.size > 8 * 1024 * 1024) { App.toast("图片超过 8MB，请先压缩再上传", "bad"); return; }
    const reader = new FileReader();
    reader.onload = function (ev) {
      const img = new Image();
      img.onload = function () {
        const maxW = 420;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);           // 透明背景转白，避免打印成黑块
        ctx.drawImage(img, 0, 0, w, h);
        state.photo = cv.toDataURL("image/jpeg", 0.86);
        renderAll();
        persist();
        App.toast("照片已更新（" + w + "×" + h + "，已压缩）", "ok");
      };
      img.onerror = function () { App.toast("图片解析失败，换一张试试", "bad"); };
      img.src = ev.target.result;
    };
    reader.onerror = function () { App.toast("文件读取失败", "bad"); };
    reader.readAsDataURL(file);
  }

  function renderEditor() {
    const doc = current();
    let h = photoEditor() + '<div class="ed-sec">' +
      '<div class="ed-sec-head" data-toggle-sec="-1"><h4>基本信息</h4><span class="caret">▼</span></div>' +
      '<div class="ed-sec-body">' +
      '<div class="ed-row"><input type="text" data-top="name" value="' + App.escape(doc.name) + '" placeholder="姓名"></div>' +
      '<div class="ed-row"><input type="text" data-top="title" value="' + App.escape(doc.title) + '" placeholder="求职意向"></div>' +
      '<div class="ed-row"><input type="text" data-top="contact.phone" value="' + App.escape(doc.contact.phone) + '" placeholder="电话"></div>' +
      '<div class="ed-row"><input type="text" data-top="contact.email" value="' + App.escape(doc.contact.email) + '" placeholder="邮箱"></div>' +
      '<div class="ed-row"><input type="text" data-top="contact.github" value="' + App.escape(doc.contact.github) + '" placeholder="GitHub"></div>' +
      '<div class="ed-row"><input type="text" data-top="contact.blog" value="' + App.escape(doc.contact.blog) + '" placeholder="博客 / 个人站"></div>' +
      '<div class="ed-row"><input type="text" data-top="contact.location" value="' + App.escape(doc.contact.location) + '" placeholder="期望城市 / 通勤说明"></div>' +
      '</div></div>';
    h += doc.sections.map((s, i) => sectionEditor(s, i)).join("");
    $("#resumeEditor").innerHTML = h;
  }

  /* ---------------- 预览 ---------------- */
  function previewItem(sec, it) {
    if (sec.type === "skills") {
      return '<div class="r-skill-line"><b>' + App.escape(it.name) + '：</b>' + App.escape(it.desc) + '</div>';
    }
    if (sec.type === "text") {
      return '<ul>' + (it.bullets || []).map(b => '<li>' + App.escape(b) + '</li>').join("") + '</ul>';
    }
    let h = '<div class="r-item">';
    h += '<div class="r-item-head"><span>' + App.escape(it.name) + (it.sub ? ' <span style="font-weight:400">' + App.escape(it.sub) + '</span>' : '') + '</span>' +
      '<span>' + App.escape(it.date || "") + '</span></div>';
    if (it.tech) h += '<div class="r-item-sub"><span class="r-tech">' + App.escape(it.tech) + '</span></div>';
    if (it.desc) h += '<div style="margin:2px 0 0">' + App.escape(it.desc) + '</div>';
    if ((it.bullets || []).length) h += '<ul>' + it.bullets.map(b => '<li>' + App.escape(b) + '</li>').join("") + '</ul>';
    return h + '</div>';
  }

  function renderPreview() {
    const doc = current();
    const c = doc.contact;
    const contacts = [c.phone, c.email, c.github, c.blog, c.location].filter(x => x && x.trim()).join(" ｜ ");
    let h = '<div class="r-header">' +
      '<div class="r-head-main">' +
      '<h1>' + App.escape(doc.name) + '</h1>' +
      '<div class="r-contact"><b>' + App.escape(doc.title) + '</b><br>' + App.escape(contacts) + '</div>' +
      '</div>' +
      (state.photo ? '<div class="r-photo"><img src="' + state.photo + '" alt="证件照"></div>' : '') +
      '</div>';
    h += doc.sections.map(sec => {
      if (!sec.items.length) return "";
      return '<div class="r-sec"><div class="r-sec-title"><span>' + App.escape(sec.title) + '</span></div>' +
        sec.items.map(it => previewItem(sec, it)).join("") + '</div>';
    }).join("");
    $("#resumePreview").innerHTML = h;

    const text = $("#resumePreview").innerText.replace(/\s/g, "");
    const placeholder = (text.match(/待填|XX/g) || []).length;
    $("#resumeWordCount").textContent = "字数 " + text.length + " · 待填占位 " + placeholder + " 处";
    $("#resumeWordCount").className = "tag " + (placeholder > 0 ? "warn" : "ok");
    $$("#resumeVersionSeg .seg-item").forEach(b => b.classList.toggle("active", b.dataset.version === state.version));
  }

  function renderAll() { renderEditor(); renderPreview(); }

  /* ---------------- 编辑事件 ---------------- */
  function setTop(path, value) {
    const doc = current();
    if (path.indexOf("contact.") === 0) doc.contact[path.split(".")[1]] = value;
    else doc[path] = value;
  }

  function bind() {
    const ed = $("#resumeEditor");

    ed.addEventListener("input", function (e) {
      const t = e.target;
      const doc = current();
      if (t.dataset.top) {
        setTop(t.dataset.top, t.value);
      } else if (t.dataset.field) {
        const sec = doc.sections[Number(t.dataset.si)];
        const item = sec.items[Number(t.dataset.ii)];
        item[t.dataset.field] = t.value;
      } else if (t.dataset.bullet !== undefined && t.dataset.bullet !== "") {
        const sec = doc.sections[Number(t.dataset.si)];
        const item = sec.items[Number(t.dataset.ii)];
        item.bullets[Number(t.dataset.bullet)] = t.value;
      } else {
        return;
      }
      renderPreview();
      persist();
    });

    ed.addEventListener("change", function (e) {
      if (e.target && e.target.id === "photoInput") processPhoto(e.target.files && e.target.files[0]);
    });

    ed.addEventListener("click", function (e) {
      if (e.target.closest("#btnRemovePhoto")) {
        e.preventDefault();
        state.photo = null;
        renderAll(); persist();
        App.toast("已移除照片", "ok");
      }
    });

    ed.addEventListener("click", function (e) {
      const doc = current();
      const addItem = e.target.closest("[data-add-item]");
      const delItem = e.target.closest("[data-del-item]");
      const addB = e.target.closest("[data-add-bullet]");
      const delB = e.target.closest("[data-del-bullet]");
      const toggle = e.target.closest("[data-toggle-sec]");

      if (addItem) {
        const si = Number(addItem.dataset.addItem);
        doc.sections[si].items.push({ name: "", sub: "", date: "", tech: "", desc: "", bullets: [""] });
        renderAll(); persist();
        return;
      }
      if (delItem) {
        const p = delItem.dataset.delItem.split(":").map(Number);
        if (!confirm("确定删除这一条？")) return;
        doc.sections[p[0]].items.splice(p[1], 1);
        renderAll(); persist();
        return;
      }
      if (addB) {
        const p = addB.dataset.addBullet.split(":").map(Number);
        const item = doc.sections[p[0]].items[p[1]];
        item.bullets = item.bullets || [];
        item.bullets.push("");
        renderEditor(); renderPreview(); persist();
        return;
      }
      if (delB) {
        const p = delB.dataset.delBullet.split(":").map(Number);
        doc.sections[p[0]].items[p[1]].bullets.splice(p[2], 1);
        renderEditor(); renderPreview(); persist();
        return;
      }
      if (toggle) {
        const si = toggle.dataset.toggleSec;
        const sec = si === "-1" ? toggle.parentElement : toggle.parentElement;
        sec.classList.toggle("collapsed");
        return;
      }
    });

    $$("#resumeVersionSeg .seg-item").forEach(b => b.addEventListener("click", function () {
      state.version = b.dataset.version;
      persist();
      renderAll();
      App.toast("已切换到「" + b.textContent + "」", "ok");
    }));

    $("#btnPrintResume").addEventListener("click", function () {
      App.toast("在弹出的打印窗口里选择「另存为 PDF」，纸张选 A4，边距选默认", "ok");
      setTimeout(() => window.print(), 400);
    });

    $("#btnResetResume").addEventListener("click", function () {
      if (!confirm("恢复到初始模板？你当前的编辑会丢失。")) return;
      state.data = { agent: clone(window.RESUME_DATA.agent), control: clone(window.RESUME_DATA.control) };
      renderAll(); persist();
      App.toast("已恢复初始模板", "ok");
    });

    $("#btnExportMd").addEventListener("click", exportMarkdown);
    $("#btnExportTex").addEventListener("click", exportLatex);
  }

  /* ---------------- 导出 ---------------- */
  function download(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    App.toast("已导出 " + filename, "ok");
  }

  function toMarkdown() {
    const doc = current();
    const c = doc.contact;
    let md = "# " + doc.name + "\n\n**" + doc.title + "**\n\n";
    md += [c.phone, c.email, c.github, c.blog, c.location].filter(Boolean).join(" ｜ ") + "\n\n";
    if (state.photo) md += "> 证件照：Markdown 不内嵌图片，投递时请另附 `photo.jpg`（网站「导出 PDF」的版本已含照片）。\n\n";
    doc.sections.forEach(sec => {
      md += "## " + sec.title + "\n\n";
      sec.items.forEach(it => {
        if (sec.type === "skills") { md += "- **" + it.name + "**：" + it.desc + "\n"; return; }
        if (sec.type === "text") { (it.bullets || []).forEach(b => { md += "- " + b + "\n"; }); return; }
        md += "### " + it.name + (it.sub ? " · " + it.sub : "") + "\n\n";
        if (it.date) md += "_" + it.date + "_\n\n";
        if (it.tech) md += "**技术栈**：" + it.tech + "\n\n";
        if (it.desc) md += it.desc + "\n\n";
        (it.bullets || []).forEach(b => { md += "- " + b + "\n"; });
        md += "\n";
      });
      md += "\n";
    });
    return md;
  }

  function texEsc(s) {
    return String(s || "")
      .replace(/\\/g, "\\textbackslash{}")
      .replace(/([&%$#_{}])/g, "\\$1")
      .replace(/~/g, "\\textasciitilde{}")
      .replace(/\^/g, "\\textasciicircum{}");
  }

  function toLatex() {
    const doc = current();
    const c = doc.contact;
    const L = [];
    L.push("% 用 XeLaTeX 编译（需要 ctex 宏包）：xelatex resume.tex");
    L.push("\\documentclass[11pt]{ctexart}");
    L.push("\\usepackage[a4paper,margin=1.6cm]{geometry}");
    L.push("\\usepackage{enumitem}");
    L.push("\\usepackage{titlesec}");
    L.push("\\usepackage{hyperref}");
    L.push("\\usepackage{graphicx}");
    L.push("\\hypersetup{colorlinks=true,urlcolor=blue}");
    L.push("\\setlist[itemize]{leftmargin=1.2em,itemsep=1pt,topsep=2pt,parsep=0pt}");
    L.push("\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\titlerule]");
    L.push("\\titlespacing{\\section}{0pt}{8pt}{4pt}");
    L.push("\\pagestyle{empty}");
    L.push("\\begin{document}");
    const contactLine = [c.phone, c.email, c.github, c.blog, c.location].filter(Boolean).join(" \\textbar\\ ");
    if (state.photo) {
      L.push("% 照片：请把证件照保存为 photo.jpg 放在本文件同目录（网站导出 PDF 的版本已含照片）");
      L.push("\\begin{tabular*}{\\textwidth}{@{}p{0.7\\textwidth}@{\\extracolsep{\\fill}}p{0.26\\textwidth}@{}}");
      L.push("\\begin{minipage}[t]{\\linewidth}");
      L.push("{\\LARGE\\bfseries " + texEsc(doc.name) + "}\\\\[2pt]");
      L.push("{\\bfseries " + texEsc(doc.title) + "}\\\\[2pt]");
      L.push(texEsc(contactLine));
      L.push("\\end{minipage} & \\begin{minipage}[t]{\\linewidth}\\raggedleft");
      L.push("\\includegraphics[width=2.6cm]{photo.jpg}");
      L.push("\\end{minipage}\\\\");
      L.push("\\end{tabular*}\\vspace{2pt}");
    } else {
      L.push("\\begin{center}");
      L.push("{\\LARGE\\bfseries " + texEsc(doc.name) + "}\\\\[2pt]");
      L.push("{\\bfseries " + texEsc(doc.title) + "}\\\\[2pt]");
      L.push(texEsc(contactLine));
      L.push("\\end{center}");
    }
    doc.sections.forEach(sec => {
      L.push("\\section*{" + texEsc(sec.title) + "}");
      sec.items.forEach(it => {
        if (sec.type === "skills") { L.push("\\noindent\\textbf{" + texEsc(it.name) + "}：" + texEsc(it.desc) + "\\\\"); return; }
        if (sec.type === "text") { L.push("\\begin{itemize}"); (it.bullets || []).forEach(b => L.push("  \\item " + texEsc(b))); L.push("\\end{itemize}"); return; }
        L.push("\\noindent\\textbf{" + texEsc(it.name) + "}" + (it.sub ? " \\quad " + texEsc(it.sub) : "") + (it.date ? " \\hfill " + texEsc(it.date) : "") + "\\\\");
        if (it.tech) L.push("\\textit{" + texEsc(it.tech) + "}\\\\");
        if (it.desc) L.push(texEsc(it.desc));
        if ((it.bullets || []).length) {
          L.push("\\begin{itemize}");
          it.bullets.forEach(b => L.push("  \\item " + texEsc(b)));
          L.push("\\end{itemize}");
        }
      });
    });
    L.push("\\end{document}");
    return L.join("\n");
  }

  function exportMarkdown() {
    download("简历-" + (state.version === "agent" ? "AI-Agent版" : "控制算法版") + ".md", toMarkdown());
  }
  function exportLatex() {
    download("简历-" + (state.version === "agent" ? "AI-Agent版" : "控制算法版") + ".tex", toLatex());
  }

  function init() {
    ensureState();
    renderAll();
    bind();
  }

  return { init: init, toMarkdown: toMarkdown, toLatex: toLatex, current: current };
})();