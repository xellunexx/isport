/* store.js — ONE authoritative application state. All modules react to it.
   Facets: OR within a facet, AND across facets. Purposes are cat-scoped.
   Also: tray (Моят проект), view mode, composer plan, system recommendations,
   last-op tracking (empty-state recovery) and browser back/forward via hash. */
window.IC = (function () {
  const products = (window.IC_DATA || {}).products || [];
  const byId = new Map(products.map(p => [p.id, p]));

  const AGE_BUCKETS = [
    { id: "a0", lo: 0, hi: 3 },
    { id: "a3", lo: 3, hi: 7 },
    { id: "a7", lo: 7, hi: 12 },
    { id: "a12", lo: 12, hi: 99 },
  ];

  const state = {
    lang: "bg",
    cat: null,
    purp: new Set(),
    mats: new Set(),
    brands: new Set(),
    ages: new Set(),
    q: "",
    sort: "rel",
    auto: new Map(), // "facet:value" -> productId (source of hover-commit)
    mode: "catalog",            // catalog | live | project   (§14 MODES)
    tray: new Map(),            // id -> qty                   (Моят проект)
    plan: new Map(),            // id -> qty                   (Направи си сам)
    rec: null,                  // {slug, labelKey, ages:[], purps:[]} system recommendation — NOT user filters
    lastOp: null,               // {facet, value} for "remove last filter" recovery
    undo: null,                 // {cat, purp:[], mats:[], brands:[], ages:[], q} snapshot of last deliberate reset
    resetNote: null,            // one-shot ribbon note: [i18n keys cleared]
  };
  try { (JSON.parse(localStorage.getItem("ic-tray2") || "[]")).forEach(([id, q]) => state.tray.set(id, q || 1)); } catch (e) {}
  try { (JSON.parse(localStorage.getItem("ic-plan") || "[]")).forEach(([id, q]) => state.plan.set(id, q || 1)); } catch (e) {}
  function persist() {
    try {
      localStorage.setItem("ic-tray2", JSON.stringify([...state.tray]));
      localStorage.setItem("ic-plan", JSON.stringify([...state.plan]));
    } catch (e) {}
  }

  const subs = new Set();
  let silenced = false;
  function emit(what) {
    if (silenced) return;
    syncHash();
    subs.forEach(fn => fn(what || "state"));
  }
  function on(fn) { subs.add(fn); return () => subs.delete(fn); }
  function emitPersist(what) { persist(); emit(what); }

  /* ---------- matching ---------- */
  const nf = s => (s || "").toLowerCase().replace(/[̀́]/g, "");
  const matchQ = (p, q) => {
    if (!q) return true;
    const hay = nf(p.n + " " + p.code + " " + p.sname + " " + p.series);
    return q.toLowerCase().trim().split(/\s+/).every(t => hay.includes(t));
  };
  const matchAge = (p, ages) => {
    if (!ages.size) return true;
    if (!p.age) return false;
    const [lo, hi] = p.age;
    for (const a of ages) {
      const b = AGE_BUCKETS.find(x => x.id === a);
      if (b && lo <= b.hi && hi >= b.lo) return true;
    }
    return false;
  };
  const recAgeSet = () => state.rec && state.rec.ages && state.rec.ages.length ? new Set(state.rec.ages) : null;
  const recPurpSet = () => state.rec && state.rec.purps && state.rec.purps.length ? new Set(state.rec.purps) : null;

  function matches(p, except) {
    if (except !== "cat" && state.cat && p.cat !== state.cat) return false;
    if (except !== "purp" && state.purp.size && !state.purp.has(p.purp)) return false;
    if (except !== "mats" && state.mats.size && !p.mats.some(m => state.mats.has(m))) return false;
    if (except !== "brands" && state.brands.size && !state.brands.has(p.brand)) return false;
    if (except !== "ages" && !matchAge(p, state.ages)) return false;
    // system recommendations (never rendered as user-selected filters):
    if (except !== "rec") {
      const ra = recAgeSet(); if (ra && !matchAge(p, ra)) return false;
      const rp = recPurpSet(); if (rp && !rp.has(p.purp) && !state.purp.has(p.purp)) return false;
    }
    if (!matchQ(p, state.q)) return false;
    return true;
  }
  const filtered = () => products.filter(p => matches(p));

  /* counts for option v of facet F, against all other active facets */
  function countFor(facet, value) {
    let n = 0;
    for (const p of products) {
      if (!matches(p, facet)) continue;
      if (facet === "cat" && p.cat !== value) continue;
      if (facet === "purp" && p.purp !== value) continue;
      if (facet === "mats" && !p.mats.includes(value)) continue;
      if (facet === "brands" && p.brand !== value) continue;
      if (facet === "ages") {
        const b = AGE_BUCKETS.find(x => x.id === value);
        if (!(p.age && p.age[0] <= b.hi && p.age[1] >= b.lo)) continue;
      }
      n++;
    }
    return n;
  }

  /* ---------- mutations ---------- */
  function setLang(l) { state.lang = l; try { localStorage.setItem("ic-lang", l); } catch (e) {} emit("lang"); }

  function setCat(cat) {
    state.cat = state.cat === cat ? null : cat;
    state.purp.clear();
    dropAutoOf("purp");
    if (state.cat && cat) state.lastOp = { facet: "cat", value: cat };
    emit("filter");
  }
  function toggle(facet, value, opts = {}) {
    const set = state[facet];
    if (set.has(value)) { set.delete(value); state.auto.delete(facet + ":" + value); }
    else {
      set.add(value);
      if (opts.auto) state.auto.set(facet + ":" + value, opts.src || null);
      else state.lastOp = { facet, value };
      // user override wins over system recommendation for the same dimension
      if (!opts.auto && state.rec) {
        if (facet === "ages" && state.rec.ages.length) { state.rec = state.rec.ages.some(a => !state.ages.has(a)) ? { ...state.rec, ages: [] } : state.rec; }
        if (facet === "purp" && state.rec.purps.length) { state.rec = { ...state.rec, purps: [] }; }
        if (!state.rec.ages.length && !state.rec.purps.length) state.rec = null;
      }
    }
    emit("filter");
  }
  function clearFacet(facet, value) {
    if (facet === "cat") { state.cat = null; state.purp.clear(); dropAutoOf("purp"); dropAutoOf("cat"); emit("filter"); return; }
    if (value === undefined) { state[facet].clear(); dropAutoOf(facet); emit("filter"); return; }
    state[facet].delete(value); state.auto.delete(facet + ":" + value); emit("filter");
  }
  function clearAll(includeQ) {
    snapshotUndo();
    state.cat = null; state.purp.clear(); state.mats.clear(); state.brands.clear(); state.ages.clear();
    state.auto.clear(); if (includeQ) state.q = "";
    state.rec = null; state.lastOp = null;
    emit("filter");
  }
  function clearLastOp() {
    const op = state.lastOp;
    if (!op) return false;
    state.lastOp = null;
    if (op.facet === "cat") { state.cat = null; state.purp.clear(); dropAutoOf("purp"); }
    else if (op.facet === "q") state.q = "";
    else if (state[op.facet] instanceof Set) state[op.facet].delete(op.value);
    else if (op.facet === "brands") state.brands.delete(op.value);
    emit("filter");
    return true;
  }
  function clearAuto() {
    for (const key of [...state.auto.keys()]) {
      const [facet, value] = key.split(":");
      if (state[facet] instanceof Set) state[facet].delete(value);
      else if (facet === "cat") state.cat = null;
    }
    state.auto.clear(); emit("filter");
  }
  function dropAutoOf(facet) { for (const k of [...state.auto.keys()]) if (k.startsWith(facet + ":")) state.auto.delete(k); }

  /* Replace all auto filters with the hovered product's signature (manual stay). */
  function applySignature(sig, pid) {
    // manual selections survive; auto ones get replaced by the signature
    const manual = f => [...state[f]].filter(v => !state.auto.has(f + ":" + v));
    const newCat = sig.cat || state.cat;
    const newPurp = newCat !== state.cat ? new Set([sig.purp].filter(Boolean)) : new Set([...manual("purp"), ...[sig.purp].filter(Boolean)]);
    const newMats = new Set([...manual("mats"), ...(sig.mats || [])]);
    const newBrands = new Set([...manual("brands"), ...[sig.brand].filter(Boolean)]);
    const eq = (a, b) => a.size === b.size && [...a].every(v => b.has(v));
    const changed = newCat !== state.cat || !eq(newPurp, state.purp) || !eq(newMats, state.mats) || !eq(newBrands, state.brands);

    // Re-applying an identical signature must NOT re-emit: a re-render replaces the DOM
    // node under the cursor and would fire a fresh hover -> commit -> render -> loop.
    if (!changed) { // still refresh provenance + recorded state
      if (sig.purp) state.auto.set("purp:" + sig.purp, pid);
      for (const m of sig.mats || []) state.auto.set("mats:" + m, pid);
      if (sig.brand) state.auto.set("brands:" + sig.brand, pid);
      if (sig.cat) state.auto.set("cat:" + sig.cat, pid);
      return;
    }
    silenced = true; clearAuto(); silenced = false;
    const mp = newCat !== state.cat ? [] : manual("purp"), mm = manual("mats"), mb = manual("brands");
    if (newCat !== state.cat) { state.cat = newCat; }
    state.purp = new Set([...mp, sig.purp].filter(Boolean));
    state.mats = new Set([...mm, ...(sig.mats || [])]);
    state.brands = new Set([...mb, ...[sig.brand].filter(Boolean)]);
    if (sig.purp) state.auto.set("purp:" + sig.purp, pid);
    for (const m of sig.mats || []) state.auto.set("mats:" + m, pid);
    if (sig.brand) state.auto.set("brands:" + sig.brand, pid);
    if (sig.cat) state.auto.set("cat:" + sig.cat, pid);
    emit("filter");
  }

  function setQ(q) { if (q) state.lastOp = { facet: "q", value: q }; state.q = q; emit("filter"); }
  function setSort(s) { state.sort = s; emit("filter"); }

  /* snapshot current facet state for one-shot undo (ribbon shows what vanished) */
  function snapshotUndo() {
    state.undo = {
      cat: state.cat, purp: [...state.purp], mats: [...state.mats],
      brands: [...state.brands], ages: [...state.ages], q: state.q,
    };
  }
  function undoReset() {
    if (!state.undo) return;
    const u = state.undo;
    state.cat = u.cat; state.purp = new Set(u.purp); state.mats = new Set(u.mats);
    state.brands = new Set(u.brands); state.ages = new Set(u.ages); state.q = u.q;
    state.undo = null; state.resetNote = null;
    emit("filter");
  }
  /* deliberate resets note what was cleared so the user can UNDO it */
  function noteCleared() {
    const cleared = [];
    if (state.undo && (state.cat !== state.undo.cat || state.purp.size !== [...state.undo.purp||[]].length ||
        state.mats.size !== state.undo.mats.length || state.brands.size !== state.undo.brands.length ||
        state.ages.size !== state.undo.ages.length || state.q !== state.undo.q)) {
      // show "what got cleared" as human labels of previous context
      cleared.push(...(state.undo.cat && state.cat !== state.undo.cat ? ["cat_" + state.undo.cat] : []));
      cleared.push(...(state.undo.mats || []).filter(v => !state.mats.has(v)).map(v => "mat_" + v));
      cleared.push(...(state.undo.ages || []).filter(v => !state.ages.has(v)).map(v => "age_" + v.slice(1)));
      cleared.push(...(state.undo.purp || []).filter(v => !state.purp.has(v)).map(v => "p_" + v));
    }
    state.resetNote = cleared.length ? cleared : null;
  }

  /* Deliberate brand selection = a fresh start gesture: clears every other facet incl. rec. */
  function selectBrand(v) {
    if (state.brands.has(v)) { state.brands.delete(v); state.auto.delete("brands:" + v); emit("filter"); return; }
    snapshotUndo();
    silenced = true; clearAll(false); silenced = false;
    state.brands.add(v);
    state.lastOp = { facet: "brands", value: v };
    noteCleared();
    emit("filter");
  }

  /* Audience persona = SYSTEM RECOMMENDATION (visibly distinct from user filters).
     Sets the division as a normal filter; suitability hints live in state.rec. */
  function applyPreset(p) {
    snapshotUndo();
    silenced = true; clearAll(false); silenced = false;
    if (p.cat) state.cat = p.cat;
    state.rec = { slug: p.slug || "", labelKey: p.labelKey || "", ages: p.ages || [], purps: p.purps || [] };
    state.lastOp = p.cat ? { facet: "cat", value: p.cat } : null;
    emit("filter");
  }
  function clearRec() { state.rec = null; emit("filter"); }

  /* Моят проект / tray — single storage in state (persisted) */
  const trayMax = () => state.tray.size;
  function trayToggle(id) {
    if (state.tray.has(id)) { state.tray.delete(id); } else { state.tray.set(id, 1); }
    emitPersist("tray");
  }
  function trayQty(id, delta) {
    if (!state.tray.has(id)) return;
    const q = (state.tray.get(id) || 1) + delta;
    if (q <= 0) state.tray.delete(id); else state.tray.set(id, Math.min(q, 999));
    emitPersist("tray");
  }
  function trayAdd(id, qty) { if (!state.tray.has(id)) state.tray.set(id, qty || 1); emitPersist("tray"); }
  function trayRemove(id) { state.tray.delete(id); emitPersist("tray"); }
  function trayClear() { state.tray.clear(); emitPersist("tray"); }

  /* Направи си сам / composer plan */
  function planToggle(id) { if (state.plan.has(id)) state.plan.delete(id); else state.plan.set(id, 1); emitPersist("plan"); }
  function planRemove(id) { state.plan.delete(id); emitPersist("plan"); }
  function planClear() { state.plan.clear(); emitPersist("plan"); }

  /* view mode (§14): catalog | live | project */
  function setMode(m) { if (state.mode !== m) { state.mode = m; emit("mode"); } }

  /* ---------- URL hash + history (§22: back/forward/refresh/deep-link) ---------- */
  let hashT = 0, lastWritten = null;
  /* syncHash pushes entries (pushState never fires hashchange). Back/forward/section-anchor
     hashchanges are the only real events reaching the listener below. */
  function syncHash() {
    clearTimeout(hashT);
    hashT = setTimeout(() => {
      const ps = new URLSearchParams();
      if (state.cat) ps.set("cat", state.cat);
      if (state.purp.size) ps.set("purp", [...state.purp].join("."));
      if (state.mats.size) ps.set("mat", [...state.mats].join("."));
      if (state.brands.size) ps.set("brand", [...state.brands].join("."));
      if (state.ages.size) ps.set("age", [...state.ages].join("."));
      if (state.q) ps.set("q", state.q);
      if (state.sort !== "rel") ps.set("sort", state.sort);
      if (state.rec) ps.set("rec", state.rec.slug || "1");
      if (state.lang !== "bg") ps.set("lang", state.lang);
      const h = "#/c" + (ps.toString() ? "?" + ps.toString() : "");
      if (h === lastWritten || (lastWritten === null && h === "#/c" && location.hash === "")) { lastWritten = h; return; }
      try {
        history.pushState(null, "", h);
        lastWritten = h;
      } catch (e) {}
    }, 300);
  }
  function loadHash() {
    const m = location.hash.match(/^#\/c\??(.*)$/);
    if (!m) return;
    const ps = new URLSearchParams(m[1]);
    state.cat = ps.get("cat") || null;
    state.purp = new Set((ps.get("purp") || "").split(".").filter(Boolean));
    state.mats = new Set((ps.get("mat") || "").split(".").filter(Boolean));
    state.brands = new Set((ps.get("brand") || "").split(".").filter(Boolean));
    state.ages = new Set((ps.get("age") || "").split(".").filter(Boolean));
    state.q = ps.get("q") || "";
    state.sort = ps.get("sort") || "rel";
    if (ps.get("lang")) state.lang = ps.get("lang");
    state.auto.clear();
    state.rec = null; // recommendation survives only while explicit in url by slug
  }
  window.addEventListener("hashchange", () => {
    const h = location.hash || "#/c";
    if (h === lastWritten) return;
    if (/^#\//.test(h) || h === "" || h === "#") {
      loadHash();
      lastWritten = h;
      emit("filter");
    }
    // plain section anchors (#catalog, #aud, …) pass through without state change
  });
  try { const saved = localStorage.getItem("ic-lang"); if (saved && !/lang=/.test(location.hash)) state.lang = saved; } catch (e) {}

  return {
    state, products, byId, AGE_BUCKETS,
    on, matches, filtered, countFor,
    setLang, setCat, toggle, clearFacet, clearAll, clearAuto, applySignature, setQ, setSort, selectBrand, applyPreset,
    clearRec, clearLastOp, setMode, loadHash, persist, undoReset,
    trayToggle, trayAdd, trayRemove, trayQty, trayClear,
    planToggle, planRemove, planClear,
  };
})();
