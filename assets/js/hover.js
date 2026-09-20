/* hover.js — the smart-hover engine.
   dwell 420ms  -> PREVIEW: non-matching cards dim, matching filter chips glow, lens follows cursor
   Hover -> PREVIEW only: the visitor decides whether to apply similar-product filters by clicking
   the lens.  This avoids unexpected catalogue changes while simply inspecting products.
   Esc / wheel / leave cancels preview; explicitly applied filters stay until cleared (×, Esc, Clear all).
   Touch: long-press 600ms arms preview, release without scroll commits. */
window.ICH = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const T = k => (window.ICT ? ICT(k) : k);

  let PREVIEW_MS = 700, COMMIT_MS = 3000, RETARGET_MS = 60; // admin-adjustable via ICA
  let armedId = null, previewId = null, committedLens = false, latch = false;
  let tA = 0, tB = 0, lensEl, lastXY = { x: 0, y: 0 };
  let touchArmed = false, touchMoved = false;

  function sigOf(p) {
    return { cat: p.cat, purp: p.purp, mats: p.mats.slice(), brand: p.brand };
  }
  /* what the grid would look like with sig applied on top of current manual filters */
  function previewCount(sig) {
    let n = 0;
    for (const p of IC.products) {
      if (!IC.matches(p)) continue;
      if (p.cat !== sig.cat) continue;
      if (p.purp !== sig.purp) continue;
      if (sig.mats.length && !p.mats.some(m => sig.mats.includes(m))) continue;
      if (p.brand !== sig.brand) continue;
      n++;
    }
    return n;
  }

  /* ---------- lens ---------- */
  function lensShow(p, sig, phase) {
    lensEl.hidden = false;
    lensEl.classList.add("show");
    lensEl.classList.toggle("committed", phase === "committed");
    const n = previewCount(sig);
    const facets = [
      `<span>${esc(T("f_purp"))}: ${esc(T("p_" + p.purp))}</span>`,
      ...p.mats.map(m => `<span>${esc(T("mat_" + m))}</span>`),
      `<span>${esc(T("f_brand"))}: ${esc((IC_BRANDS[p.brand] || {}).name || p.brand)}</span>`,
    ].join("");
    lensEl.innerHTML = `
      <div class="lens-head"><span class="lens-pul"></span><span>${phase === "committed" ? esc(T("lens_apply")) + " ✓" : esc(T("preview_of"))}</span></div>
      <div class="lens-name">${esc(ICG.displayName(p))}</div>
      <div class="lens-facets">${facets}</div>
      <div class="lens-foot"><b>${n}</b> ${esc(T("results"))} · ${phase === "committed" ? "Esc — " + esc(T("reset")) : "Кликни тук, за да приложиш подобни"}</div>
      <div class="lens-bar"><i id="lensBar" style="width:${phase === "committed" ? 100 : 0}%"></i></div>`;
    lensMove(lastXY.x, lastXY.y);
    if (phase === "preview") {
      const bar = lensEl.querySelector("#lensBar");
      if (bar && !reduceMotion()) {
        bar.style.transition = "none"; bar.style.width = "0%";
        requestAnimationFrame(() => {
          bar.style.transition = `width ${(COMMIT_MS - PREVIEW_MS) - 60}ms linear`;
          bar.style.width = "100%";
        });
      }
    }
  }
  function lensHide(later) {
    clearTimeout(lensEl._hideT || 0);
    if (later) { lensEl._hideT = setTimeout(lensHide, later); return; }
    lensEl.classList.remove("show");
    setTimeout(() => { lensEl.hidden = true; }, 190);
  }
  function lensMove(x, y) {
    const w = 296, h = 170, pad = 14;
    let lx = x + pad, ly = y + pad;
    if (lx + w > innerWidth - 8) lx = x - w - pad;
    if (ly + h > innerHeight - 8) ly = y - h - pad;
    lensEl.style.left = lx + "px"; lensEl.style.top = ly + "px";
  }

  /* ---------- preview visuals ---------- */
  function applyPreview(sig) {
    document.body.classList.add("previewing");
    const keep = new Set();
    for (const p of ICG.displayed()) {
      const ok = p.cat === sig.cat && p.purp === sig.purp &&
                 (!sig.mats.length || p.mats.some(m => sig.mats.includes(m))) && p.brand === sig.brand;
      if (ok) keep.add(p.id);
    }
    document.querySelectorAll("#grid .card").forEach(c => c.classList.toggle("dim", !keep.has(c.dataset.id)));
    ghostChips(sig, true);
  }
  function clearPreview() {
    document.body.classList.remove("previewing");
    document.querySelectorAll("#grid .card.dim").forEach(c => c.classList.remove("dim"));
    ghostChips(null, false);
  }
  function ghostChips(sig, on) {
    document.querySelectorAll(".chip.ghosted").forEach(c => c.classList.remove("ghosted"));
    if (!on || !sig) return;
    const keys = new Set([`purp:${sig.purp}`, `brands:${sig.brand}`, ...sig.mats.map(m => "mats:" + m)]);
    document.querySelectorAll(".chip[data-facet]").forEach(c => {
      if (keys.has(c.dataset.facet + ":" + c.dataset.value)) c.classList.add("ghosted");
    });
    const catTile = document.querySelector(`.cat-tile[data-cat="${sig.cat}"]`);
    if (catTile) catTile.classList.add("ghosted");
  }

  function resetTimers() { clearTimeout(tA); clearTimeout(tB); }
  function cancelAll() {
    resetTimers(); armedId = null;
    if (previewId) { previewId = null; lensHide(); clearPreview(); }
  }

  /* if the product's signature is already fully applied as filters, hovering does nothing —
     the selection is already "furthest downstream" (the card itself shows it). */
  function fullyActive(p) {
    const st = IC.state;
    if (st.cat !== p.cat) return false;
    if (!st.purp.has(p.purp)) return false;
    if (!p.mats.every(m => st.mats.has(m))) return false;
    if (!st.brands.has(p.brand)) return false;
    return true;
  }

  function arm(id, skipDelay) {
    if (previewId === id && !committedLens) return;
    resetTimers();
    armedId = id;
    const p0 = IC.byId.get(id);
    if (p0 && fullyActive(p0)) { cancelAll(); return; }
    if (previewId && previewId !== id) { // retarget fast
      previewId = id; armedId = id;
      const p = IC.byId.get(id); if (!p) return;
      applyPreview(sigOf(p)); lensShow(p, sigOf(p), "preview");
      resetTimers();
      return;
    }
    tA = setTimeout(() => {
      const p = IC.byId.get(armedId); if (!p) return;
      previewId = armedId;
      applyPreview(sigOf(p));
      lensShow(p, sigOf(p), "preview");
    }, skipDelay ? RETARGET_MS : PREVIEW_MS);
  }
  function commit(id) {
    const p = IC.byId.get(id); if (!p) return;
    committedLens = true;
    latch = true; // after a commit, previews stay off until the pointer leaves the grid
    IC.applySignature(sigOf(p), id);
    lensShow(p, sigOf(p), "committed");
    clearPreview();
    lensHide(1800);
    setTimeout(() => { committedLens = false; previewId = null; }, 300);
    /* never lose the sourced product after the reflow: re-anchor scroll to it + flash */
    setTimeout(() => {
      const card = document.querySelector(`#grid .card[data-id="${CSS.escape(id)}"]`);
      if (!card) return;
      const h = window.__stickyChromeH ? window.__stickyChromeH() : 140;
      const y = card.getBoundingClientRect().top + window.scrollY - h - 10;
      window.scrollTo(0, Math.max(0, y));
      card.classList.add("commit-mark");
      setTimeout(() => card.classList.remove("commit-mark"), 2600);
    }, 140); // after store emit -> grid re-render
  }

  /* imperative "similar" from card button or quickview */
  function applyOf(pid) {
    const p = IC.byId.get(pid); if (!p) return;
    cancelAll(); commit(pid);
  }

  /* ---------- wiring ---------- */
  function bind() {
    lensEl = $("#lens");
    const grid = $("#grid");

    grid.addEventListener("pointerover", e => {
      if (e.pointerType && e.pointerType !== "mouse") return; // touch handled below
      if (latch) return; // pointer must leave the grid once before the next hover-filter
      if (IC.state.mode !== "catalog") return; // hover-filtering is a catalog-mode gesture
      const card = e.target.closest(".card");
      if (!card || e.target.closest("[data-act]")) return;
      lastXY = { x: e.clientX, y: e.clientY };
      arm(card.dataset.id);
    });
    grid.addEventListener("pointerout", e => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const card = e.target.closest(".card");
      if (!card) return;
      const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".card");
      if (to && to !== card) return; // pointerover of new card will retarget
      if (to === card) return;
      const rt = e.relatedTarget;
      if (rt && rt.closest && rt.closest("#lens")) return; // lens is interactive
      if (rt && rt.closest && rt.closest("#grid")) { return; } // still inside grid (e.g. child swap)
      if (!rt) { } // fell off entirely
      if (committedLens) { resetTimers(); return; }
      cancelAll();
    });
    grid.addEventListener("pointerleave", e => {
      latch = false; // fully off the grid -> hover engine arms again
      if (!e.relatedTarget || !(e.relatedTarget.closest && e.relatedTarget.closest("#lens"))) {
        if (!committedLens) cancelAll();
      }
    });
    addEventListener("pointermove", e => {
      lastXY = { x: e.clientX, y: e.clientY };
      if (previewId && !lensEl.hidden && !committedLens) lensMove(e.clientX, e.clientY);
    }, { passive: true });
    document.addEventListener("wheel", cancelAll, { passive: true });
    grid.addEventListener("pointerdown", () => cancelAll(), true);

    /* touch: long-press */
    let tch = 0;
    grid.addEventListener("touchstart", e => {
      const card = e.target.closest(".card");
      if (!card) return;
      touchMoved = false; touchArmed = false;
      clearTimeout(tch);
      tch = setTimeout(() => { touchArmed = true; arm(card.dataset.id, true); }, 600);
    }, { passive: true });
    grid.addEventListener("touchmove", () => { touchMoved = true; clearTimeout(tch); cancelAll(); }, { passive: true });
    grid.addEventListener("touchend", e => {
      clearTimeout(tch);
      if (touchArmed && !touchMoved && previewId) { commit(previewId); e.preventDefault(); }
      else if (touchArmed) cancelAll();
    }, { passive: false });

    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      if (window.ICO && ICO.isOpen()) return; // modal Esc handled by overlay.js
      if (previewId && !committedLens) { cancelAll(); }
      else if (IC.state.auto.size) { lensHide(); IC.clearAuto(); }
    });

    /* when store re-renders deck/grid, drop stale ghost chips — and REDISCOVER the
       card under a resting cursor (browsers do NOT re-fire pointerover after the DOM
       node under the pointer is replaced; without this the engine goes silently dead) */
    IC.on(what => {
      if (what === "filter" || what === "lang") ghostChips(null, false);
      if (latch || committedLens) return;
      if (what === "filter" || what === "tray" || what === "mode" || what === "plan" || what === "lang") {
        setTimeout(() => { // wait for grid re-render settle
          if (latch || committedLens || previewId) return;
          const el = document.elementFromPoint(lastXY.x, lastXY.y);
          const card = el && el.closest ? el.closest("#grid .card") : null;
          if (card && mode_free()) arm(card.dataset.id);
        }, 60);
      }
    });
    function mode_free() { return IC.state.mode === "catalog"; }

    /* lens itself is clickable -> commit early */
    lensEl.addEventListener("click", () => { if (previewId) commit(previewId); });
    lensEl.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && previewId) { commit(previewId); e.preventDefault(); } });
  }
  function reduceMotion() { return matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function setTimings(previewMs, commitMs) { PREVIEW_MS = previewMs; COMMIT_MS = Math.max(commitMs, previewMs + 100); }

  return { bind, applyOf, cancelAll, setTimings };
})();
