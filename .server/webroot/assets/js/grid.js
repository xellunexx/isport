/* grid.js — the product grid: matching -> sort -> batched render (fast even for 2.5k). */
window.ICG = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const T = k => (window.ICT ? ICT(k) : k);
  const BATCH = 72;

  let shown = 0, list = [], sentinelIO = null;

  const ICONS = {
    eye: '<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M2.5 10S5.5 5 10 5s7.5 5 7.5 5-3 5-7.5 5S2.5 10 2.5 10Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    plus: '<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    sim: '<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><circle cx="10" cy="10" r="3.4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 3"/></svg>',
  };

  function purpLabel(p) {
    return T("p_" + p.purp) || p.purp;
  }
  function displayName(p) {
    // "FLOW пейка без облегалка – LFL122" -> "FLOW пейка без облегалка"
    return p.code ? p.n.replace(new RegExp("\\s*[–-]\\s*" + p.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$"), "") : p.n;
  }

  function cardHTML(p) {
    const img = p.img[0] || "";
    const alt = p.img[1] || img;
    const inTray = window.ICO && ICO.tray.has(p.id);
    return `
    <article class="card" data-id="${esc(p.id)}" tabindex="0" aria-label="${esc(p.n)}">
      <div class="ph">
        <span class="purp-tag">${esc(purpLabel(p))}</span>
        <img src="${esc(img)}" alt="${esc(p.n)}" loading="lazy" decoding="async">
        ${p.img[1] ? `<img class="alt" data-src="${esc(alt)}" alt="" loading="lazy" decoding="async">` : ""}
        <div class="acts">
          <button data-act="quick" title="${esc(T("quick"))}" aria-label="${esc(T("quick"))}">${ICONS.eye}</button>
          <button data-act="sim" title="${esc(T("similar"))}" aria-label="${esc(T("similar"))}">${ICONS.sim}</button>
          <button data-act="add" class="${inTray ? "added" : ""}" title="${esc(T("add"))}" aria-label="${esc(T("add"))}">${ICONS.plus}</button>
        </div>
      </div>
      <div class="bd">
        <div class="nm" title="${esc(p.n)}">${esc(displayName(p))}</div>
        <div class="mt">
          <img class="blogo" src="img/brands/${esc(p.brand)}.png" alt="" loading="lazy" onerror="this.style.display='none'">
          <span class="dims">${esc((p.sp && p.sp.d) || p.code || "")}</span>
        </div>
      </div>
    </article>`;
  }

  function sortList(l) {
    const s = IC.state.sort;
    if (s === "name") return [...l].sort((a, b) => a.n.localeCompare(b.n, IC.state.lang));
    if (s === "brand") return [...l].sort((a, b) => (a.brand + a.n).localeCompare(b.brand + b.n, IC.state.lang));
    return l; // curated catalog order
  }

  function renderMore(viaIO) {
    const grid = $("#grid");
    const frag = list.slice(shown, shown + BATCH).map(cardHTML).join("");
    grid.insertAdjacentHTML("beforeend", frag);
    shown += BATCH;
    if (viaIO) autoBatches++;
    updateMore();
  }

  function ensureMoreUI(gm) {
    if ($("#moreBtn")) return;
    gm.innerHTML = `<button class="btn ghost" id="moreBtn"></button>
      <div class="remaining" id="moreRem"></div>
      <div class="sentinel" id="sentinel"></div>`;
    $("#moreBtn").addEventListener("click", () => renderMore(false));
    sentinelIO = new IntersectionObserver(en => {
      if (window.__navJumping && Date.now() < window.__navJumping) return; // page must not grow mid-jump
      if (autoBatches >= 2) { sentinelIO.disconnect(); return; }            // auto-appendes capped; user steers
      if (en[0].isIntersecting && $("#moreBtn") && !$("#moreBtn").hidden) renderMore(true);
    }, { rootMargin: "700px" });
    sentinelIO.observe($("#sentinel"));
  }

  let autoBatches = 0; // IO auto-appends at most 2 batches per list; after that the More button steers
  function updateMore() {
    const gm = $("#gridMore");
    const rest = list.length - shown;
    if (rest <= 0) {
      gm.innerHTML = "";
      sentinelIO && sentinelIO.disconnect();
      return;
    }
    ensureMoreUI(gm);
    $("#moreBtn").hidden = false; // always reachable
    $("#moreBtn").textContent = `${T("more")} ${Math.min(rest, BATCH)} ${T("of")} ${list.length}`;
    $("#moreRem").textContent = `${shown} / ${list.length}`;
    if (autoBatches >= 2) sentinelIO && sentinelIO.disconnect();
  }

  /* ---------- mode boards (§14 MODES) ---------- */
  function renderLive(grid) {
    const cat = IC.state.cat;
    let facs = ((window.ICL ? ICL.contextFor("cat") : (IC_DATA.facilities || [])) || []).filter(f => f.img);
    let note = "";
    if (cat && window.ICL) {
      const mine = facs.filter(f => ICL.catOf(f) === cat);
      if (mine.length) { facs = mine; note = ""; } else { note = T("live_no_ctx"); }
    }
    if (IC.state.brands.size) note = note || T("live_brand_note");
    const header = `<div class="proj-cta-row live-explainer"><b>${facs.length} · ${esc(T("live_note"))}</b><span>Реални снимки от изпълнени обекти. Избери карта, за да разгледаш обекта — това не променя филтрите в каталога.</span>${note ? `<span class="facet-lbl">${esc(note)}</span>` : ""}</div>`;
    grid.innerHTML = header + facs.map((f, i) => `
      <button class="proj-card" data-proj="${IC_DATA.facilities.indexOf(f)}" aria-label="${esc(f.t)}">
        <img src="${esc(f.img)}" alt="${esc(f.t)}" loading="lazy" decoding="async">
        <div class="pb"><div class="pn">${esc(f.t)}</div><div class="pl">${esc(f.loc || "")}</div>
        <span class="ctapill">${esc(T("live_note"))}</span></div></button>`).join("");
  }
  function renderProject(grid) {
    const tray = IC.state.tray;
    let head = "";
    if (tray.size) {
      head = `<div class="proj-cta-row">
          <b>${tray.size} ${esc(T("diy_items"))}</b>
          <button class="btn solid" data-open-tray>${esc(T("send"))}</button>
          <button class="btn ghost" data-clear-tray>${esc(T("tray_clear"))}</button>
        </div>`;
    }
    // suggestions: context-aware when filters exist; curated brand-spread when not
    const active = IC.state.cat || IC.state.purp.size || IC.state.mats.size || IC.state.brands.size || IC.state.ages.size || IC.state.q || IC.state.rec;
    let sugg, label;
    if (active) {
      sugg = IC.filtered().filter(p => !tray.has(p.id)).slice(0, 24);
      label = T("tray_suggest");
    } else {
      // curated spread: one pick per purpose, rotating brands so it never looks like a dump
      const seen = new Set(), seenBrand = new Set(); sugg = [];
      for (const p of IC.products) {
        if (tray.has(p.id) || seen.has(p.purp) || seenBrand.has(p.brand)) continue;
        seen.add(p.purp); seenBrand.add(p.brand); sugg.push(p);
        if (sugg.length >= 16) break;
      }
      label = T("tray_curated");
    }
    const suggHtml = sugg.length ? `
      <div class="proj-sugg-h">${esc(label)} <span class="facet-lbl">(${sugg.length})</span></div>` +
      sugg.map(p => cardHTML(p)).join("") : "";
    const selHtml = tray.size
      ? [...tray.entries()].map(([id, qty]) => {
          const p = IC.byId.get(id); if (!p) return "";
          return `<div class="tray-item big">
            <img src="${esc(p.img[0] || "")}" alt="${esc(p.n)}" loading="lazy">
            <span class="ti-mid"><span class="ti-n">${esc(displayName(p))}</span><br>
            <span class="ti-c">${esc((IC_BRANDS[p.brand] || {}).name || p.brand)}${p.code ? " · " + esc(p.code) : ""}</span>
            <span class="ti-qty"><button data-qty="-1" data-qid="${esc(id)}">−</button><b>${qty}</b><button data-qty="1" data-qid="${esc(id)}">+</button></span></span>
            <button class="ti-x" data-rm="${esc(id)}" aria-label="×">×</button></div>`;
        }).join("")
      : `<div class="proj-empty">${esc(T("tray_empty"))}</div>`;
    grid.innerHTML = `<div class="proj-board">${head}${selHtml}</div>` +
      (sugg.length ? `<div class="grid board-sugg" style="margin-top:1.2rem">${suggHtml}</div>` : "");
  }

  function render() {
    const grid = $("#grid");
    const mode = IC.state.mode;
    grid.classList.toggle("board-mode", mode !== "catalog");
    $("#empty").hidden = true;
    if (mode === "live") { renderLive(grid); return; }
    if (mode === "project") { renderProject(grid); return; }
    // catalog mode
    list = sortList(IC.filtered());
    shown = 0; autoBatches = 0;
    grid.innerHTML = "";
    $("#empty").hidden = list.length > 0;
    if (!list.length) { renderEmptyAssist(); $("#gridMore").innerHTML = ""; return; }
    renderMore(false);
  }

  function renderEmptyAssist() {
    const st = IC.state;
    const last = $("#emptyLast");
    last.hidden = !st.lastOp;
    // sensible suggestions: top purposes ignoring current purp/ages with counts > 0
    const sugg = [];
    const cat = st.cat;
    const seenPurp = new Set();
    for (const p of IC.products) {
      if (seenPurp.has(p.purp) || sugg.length >= 5) continue;
      if (cat && p.cat !== cat) continue;
      seenPurp.add(p.purp);
      sugg.push(p.purp);
    }
    $("#emptySugg").innerHTML = sugg.length
      ? `<span class="facet-lbl">${esc(T("empty_suggest"))}:</span>` + sugg.map(v =>
          `<button class="chip" data-sugg="${esc(v)}">${esc(T("p_" + v))}</button>`).join("")
      : "";
  }

  /* re-render on any store change (cheap: batches) */
  function bind() {
    $("#emptyReset").addEventListener("click", () => IC.clearAll(true));
    $("#emptyLast").addEventListener("click", () => IC.clearLastOp());
    document.addEventListener("click", e => {
      const sg = e.target.closest("[data-sugg]");
      if (sg) { // suggestion: apply purpose (cat if none, keep it honest as a normal filter)
        const v = sg.dataset.sugg;
        if (!IC.state.cat) { /* infer cat of that purpose isn't tracked; let deck show it */ }
        IC.toggle("purp", v);
      }
      if (e.target.closest("[data-open-tray]")) { $("#trayBtn") && $("#trayBtn").click(); }
      if (e.target.closest("[data-clear-tray]")) { IC.trayClear(); }
      const rm2 = e.target.closest("#grid [data-rm]");
      if (rm2) { IC.trayToggle(rm2.dataset.rm); }
      const qt = e.target.closest("#grid [data-qty]");
      if (qt) { IC.trayQty(qt.dataset.qid, parseInt(qt.dataset.qty, 10)); }
    });
    $("#grid").addEventListener("click", e => {
      const actBtn = e.target.closest("[data-act]");
      if (!actBtn) return;
      const card = e.target.closest(".card");
      if (!card) return;
      const id = card.dataset.id;
      const act = actBtn.dataset.act;
      if (act === "quick") window.ICO && ICO.quickView(id);
      if (act === "add") { window.ICO && ICO.trayToggle(id); syncAddBtn(card, id); }
      if (act === "sim") window.ICH && ICH.applyOf(id);
      e.stopPropagation();
    });
    /* click on card body (not buttons) opens quick view — in catalog AND suggestion rows */
    $("#grid").addEventListener("click", e => {
      if (e.target.closest("[data-act]")) return;
      if (e.target.closest("[data-proj]")) return; // project/live cards handle themselves
      const card = e.target.closest(".card");
      if (card) window.ICO && ICO.quickView(card.dataset.id);
    });
    /* hover image swap: lazy-load the alt once */
    $("#grid").addEventListener("pointerover", e => {
      const ph = e.target.closest && e.target.closest(".card .ph");
      if (!ph) return;
      const alt = ph.querySelector("img.alt[data-src]");
      if (alt) { alt.src = alt.dataset.src; alt.removeAttribute("data-src"); }
    });
    /* keyboard: Enter/Space on focused card opens quick view */
    $("#grid").addEventListener("keydown", e => {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("card")) {
        e.preventDefault(); window.ICO && ICO.quickView(e.target.dataset.id);
      }
    });
  }
  function syncAddBtn(card, id) {
    const b = card.querySelector('[data-act="add"]');
    if (!b) return;
    b.classList.toggle("added", window.ICO && ICO.tray.has(id));
  }

  return { render, bind, displayed: () => list.slice(0, shown), listRef: () => list, displayName };
})();
