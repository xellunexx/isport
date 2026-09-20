/* facets.js — the permanent filter deck: cat tiles, purpose/material/age/brand chips
   with live counts, no-dead-ends disabling, active-filters ribbon. */
window.ICF = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const MATS = ["wood", "metal", "concrete", "rubber", "cork", "rope", "plastic", "hpl", "turf", "composite"];
  const CATS = ["play", "park", "sport", "flooring"];
  const PURP_ORDER = { // curated display order inside each cat
    play: ["multiplay", "swings", "springers", "climbers", "rope", "slides", "carousels", "balance",
           "playhouses", "thematic", "sandboxes", "water", "trampoline", "figures", "toddler", "interactive", "other"],
    sport: ["fitness", "street", "walls", "parkour", "arenas", "goals", "trim", "tramp", "tables", "skate", "other"],
    park: ["benches", "tables_p", "picnic", "planters", "bins", "bike", "busstop", "shelters", "bollards",
           "dog", "info", "smart", "wells", "fences", "stairs", "other"],
    flooring: ["tiles", "cork", "poured", "acrylic", "epoxy", "pu", "turf", "stone", "gym", "other"],
  };
  const CAT_ICONS = {
    play: '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M5 4v6m8-6v6M5 7c0 2.5 1.6 4 4 4s4-1.5 4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M3 20h18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="9" cy="15.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
    park: '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M4 11h16M7 11v3m10-3v3M5 20l1.4-6m11.2 6L19 14M9 20l.9-3.6M15 20l-.9-3.6M8.5 11V6.5L12 4l3.5 2.5V11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    sport: '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M3 12h2m14 0h2M7 8v8m10-8v8M7 10h10M7 14h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/></svg>',
    flooring: '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M4 7l8-4 8 4-8 4-8-4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 12l8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  };

  const T = k => (window.ICT ? ICT(k) : k);
  const matSw = m => "var(--" + m + ")";

  function chip(facet, value, label, count, opts = {}) {
    const st = IC.state;
    const on = facet === "cat" ? st.cat === value : st[facet].has(value);
    const zero = !on && count === 0;
    const auto = st.auto.has(facet + ":" + value);
    return `<button class="chip ${on ? "on" : ""} ${zero ? "off" : ""} ${auto ? "auto" : ""}"
      data-facet="${facet}" data-value="${esc(value)}" ${auto ? `data-auto="${esc(T("auto"))}"` : ""}
      aria-pressed="${on}" ${zero ? "aria-disabled='true' tabindex='-1'" : ""}
      title="${esc(String(count))}">${opts.sw ? `<i class="sw" style="--sw:${matSw(value)}"></i>` : ""}${esc(label)}<span class="n">${count}</span></button>`;
  }

  function catTiles() {
    return CATS.map(c => {
      const n = IC.countFor("cat", c);
      const on = IC.state.cat === c;
      const zero = !on && n === 0; // never lead to an empty grid
      return `<button class="cat-tile ${on ? "on" : ""} ${zero ? "off" : ""}" data-cat="${c}" aria-pressed="${on}" ${zero ? "aria-disabled='true' tabindex='-1'" : ""}>
        <i class="ci">${CAT_ICONS[c]}</i>
        <span class="ct">${esc(T("cat_" + c))}</span>
        <span class="cn">${n}</span></button>`;
    }).join("");
  }

  function purpChips() {
    const cat = IC.state.cat;
    if (!cat) return "";
    const order = PURP_ORDER[cat] || [];
    return order.map(k => {
      const n = IC.countFor("purp", k);
      return chip("purp", k, T("p_" + k), n);
    }).join("");
  }

  function ribbon() {
    const st = IC.state;
    const items = [];
    // system recommendation chip (visibly NOT a user filter)
    if (st.rec) {
      const name = st.rec.labelKey ? T(st.rec.labelKey) : (IC_BRANDS[st.rec.slug] || {}).name || st.rec.slug;
      const hints = [];
      if (st.rec.ages && st.rec.ages.length) hints.push(st.rec.ages.map(a => T("age_" + a.slice(1))).join(", "));
      if (st.rec.purps && st.rec.purps.length) hints.push(st.rec.purps.map(a => T("p_" + a)).join(", "));
      items.push(`<span class="af rec" title="${esc(T("rec_lbl"))}">⚲ ${esc(T("rec_lbl"))}: ${esc(name)}${hints.length ? " · " + esc(hints.join(" · ")) : ""}
        <button class="x" data-rec="1" aria-label="×">×</button></span>`);
    }
    const srcChip = key => {
      const pid = st.auto.get(key);
      if (!pid) return "";
      const p = IC.byId.get(pid);
      if (!p || !p.img[0]) return "";
      return `<span class="src"><img src="${esc(p.img[0])}" alt="" loading="lazy"></span>`;
    };
    // what got auto-cleared by the last deliberate reset (brand/persona), with one-click undo
    if (st.resetNote && st.resetNote.length)
      items.push(`<span class="af reset-note">${esc(T("cleared_note"))}: ${esc(st.resetNote.map(v => T(v)).join(" · "))}</span>`);
    if (st.undo)
      items.push(`<button class="af undo-chip" data-undo="1">⟲ ${esc(T("undo_filters"))}</button>`);
    if (st.cat) items.push(ribbonItem("cat", st.cat, T("f_cat") + ": " + T("cat_" + st.cat), srcChip("cat:" + st.cat)));
    for (const v of st.purp) items.push(ribbonItem("purp", v, T("f_purp") + ": " + T("p_" + v), srcChip("purp:" + v)));
    for (const v of st.mats) items.push(ribbonItem("mats", v, T("f_mat") + ": " + T("mat_" + v), srcChip("mats:" + v)));
    for (const v of st.ages) items.push(ribbonItem("ages", v, T("f_age") + ": " + T("age_" + v.slice(1)), srcChip("ages:" + v)));
    for (const v of st.brands) items.push(ribbonItem("brands", v, T("f_brand") + ": " + (IC_BRANDS[v] || {}).name || v, srcChip("brands:" + v)));
    if (!items.length) return "";
    const clear = `<button class="af-clear-big" id="afClear"><b>${esc(T("clear_all"))}</b></button>`;
    return items.join("") + clear;
  }
  function ribbonItem(facet, value, label, src) {
    const auto = IC.state.auto.has(facet + ":" + value);
    return `<span class="af ${auto ? "auto-ribbon" : ""}">${esc(label)}${src || ""}
      <button class="x" data-rfacet="${facet}" data-rvalue="${esc(value)}" aria-label="×">×</button></span>`;
  }

  function renderModes() {
    const seg = $("#modeSeg");
    if (!seg) return;
    const m = IC.state.mode;
    seg.innerHTML = [["catalog", "menu_catalog"], ["live", "live_btn"], ["project", "tray_title"]]
      .map(([v, k]) => `<button data-mode="${v}" class="${m === v ? "on" : ""}" aria-pressed="${m === v}">${esc(T(k))}</button>`).join("");
  }

  function render() {
    const st = IC.state;
    renderModes();
    $("#deckCats").innerHTML = catTiles();

    // purposes row only when a cat is chosen (progressive disclosure)
    const dp = $("#deckPurps");
    if (st.cat) {
      dp.hidden = false;
      dp.innerHTML = `<span class="facet-lbl">${esc(T("f_purp"))}</span>` + purpChips();
    } else { dp.hidden = true; dp.innerHTML = ""; }

    $("#deckMats").innerHTML = `<span class="facet-lbl">${esc(T("f_mat"))}</span>` +
      MATS.map(m => chip("mats", m, T("mat_" + m), IC.countFor("mats", m), { sw: 1 })).join("");

    $("#deckAges").innerHTML = `<span class="facet-lbl">${esc(T("f_age"))}</span>` +
      IC.AGE_BUCKETS.map(b => chip("ages", b.id, T("age_" + b.id.slice(1)), IC.countFor("ages", b.id))).join("");

    const brandOpts = Object.keys(IC_BRANDS)
      .map(b => ({ b, n: IC.countFor("brands", b) }));
    $("#deckBrands").innerHTML = `<span class="facet-lbl">${esc(T("f_brand"))}</span>` +
      brandOpts.map(({ b, n }) => chip("brands", b, (IC_BRANDS[b] || {}).name || b, n)).join("");

    const da = $("#deckActive");
    const rh = ribbon();
    da.hidden = !rh; da.innerHTML = rh;

    const total = IC.filtered().length;
    $("#deckCount").innerHTML = `<b>${total.toLocaleString("bg-BG")}</b> ${esc(T("results"))}` + (st.cat ? "" : "");
  }

  /* one delegated listener for the whole deck */
  function bind() {
    const deck = $("#deck");
    deck.addEventListener("click", e => {
      const catBtn = e.target.closest("[data-cat]");
      if (catBtn) { if (!catBtn.classList.contains("off")) IC.setCat(catBtn.dataset.cat); return; }
      const chipEl = e.target.closest(".chip[data-facet]");
      if (chipEl) {
        const { facet, value } = chipEl.dataset;
        if (facet === "brands") { IC.selectBrand(value); return; } // brand = fresh-start gesture
        IC.toggle(facet, value);
        return;
      }
      const rx = e.target.closest("[data-rfacet]");
      if (rx) { IC.clearFacet(rx.dataset.rfacet, rx.dataset.rvalue); return; }
      const recX = e.target.closest("[data-rec]") || e.target.closest("[data-clearrec]");
      if (recX) { IC.clearRec(); return; }
      const un = e.target.closest("[data-undo]");
      if (un) { IC.undoReset(); return; }
      const modeB = e.target.closest("#modeSeg [data-mode]");
      if (modeB) { IC.setMode(modeB.dataset.mode); return; }
      if (e.target.closest("#afClear")) IC.clearAll(true);

      // any OTHER deliberate deck click clears the stale reset note + undo offer
      if (e.target.closest("[data-cat], .chip, #modeSeg, .search-field, .sort-field")) {
        if (IC.state.resetNote) { IC.state.resetNote = null; }
      }
    });
  }

  return { render, bind, T };
})();
