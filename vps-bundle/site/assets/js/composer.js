/* composer.js — "Направи си сам": pick products -> auto 2D site plan.
   Footprints from parsed dims; safety padding from parsed safety zones (sqrt of zone area);
   shelf-pack layout; stats (area / users / zones), age-mix warning, PNG export, to-inquiry. */
window.ICD = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const T = k => (window.ICT ? ICT(k) : k);

  const plan = IC.state.plan; // single source of truth (persisted by the store)
  const reasons = new Map(); // id -> {k:'anchor'|'fill'|'safe', note}
  let seed = 7;

  /* ---------- parsing ---------- */
  function parseDims(s) {
    if (!s) return null;
    const nums = (s.match(/\d[\d\s.,]*/g) || []).map(x => parseFloat(x.replace(/\s/g, "").replace(",", "."))).filter(n => n > 0);
    if (nums.length < 2) return null;
    let unit = /mm/i.test(s) ? 0.001 : (/cm/.test(s) ? 0.01 : 1); // m if plain
    const mm = nums.map(n => n * unit);
    // drop height: with >=3 dims the convention here is W x H x L -> footprint = first x last
    let w = mm[0], d = mm[2] || mm[1];
    w = Math.min(Math.max(w, 0.3), 40); d = Math.min(Math.max(d, 0.3), 40);
    return { w: +w.toFixed(2), d: +d.toFixed(2) };
  }
  function parseZone(s) { // "11,1 m2"
    if (!s) return 0;
    const m = s.match(/([\d.,]+)/);
    return m ? parseFloat(m[1].replace(",", ".")) || 0 : 0;
  }
  function parseUsers(s) { // "1", "1 - 4", "12"
    if (!s) return 0;
    const nums = s.match(/\d+/g);
    return nums ? Math.max(...nums.map(Number)) : 0;
  }
  function safetyPad(p) {
    const fp = parseDims(p.sp && p.sp.d) || { w: 2, d: 2, est: true };
    const z = parseZone(p.sp && p.sp.z);
    let pad = 0.5;
    if (z > 0) {
      const fa = fp.w * fp.d;
      pad = Math.max(0.5, Math.min(2.4, (Math.sqrt(z) - Math.sqrt(fa)) / 2 || 0.5));
    }
    return pad;
  }

  /* ---------- pick list (follows current catalog filters!) ---------- */
  function renderList() {
    const q = ($("#diyQ").value || "").toLowerCase();
    const list = IC.filtered().filter(p => !q || (p.n + " " + (p.code || "")).toLowerCase().includes(q)).slice(0, 80);
    $("#diyList").innerHTML = list.map(p => `
      <div class="diy-item ${plan.has(p.id) ? "inplan" : ""}" data-id="${esc(p.id)}">
        <img src="${esc(p.img[0] || "")}" alt="" loading="lazy">
        <span class="dn">${esc(ICG.displayName(p))}<br><span class="dq">${esc(p.code || "")} · ${p.sp && p.sp.d ? esc(p.sp.d) : "—"}</span></span>
        <button class="da" data-tgl="${esc(p.id)}" aria-label="+">${plan.has(p.id) ? "✓" : "+"}</button>
      </div>`).join("");
  }

  /* ---------- plan chips (remove / swap) ---------- */
  function renderChips() {
    const el = $("#diyChips");
    if (!el) return;
    if (!plan.size) { el.innerHTML = ""; return; }
    el.innerHTML = [...plan.keys()].map(id => {
      const p = IC.byId.get(id); if (!p) return "";
      const r = reasons.get(id);
      const tip = r ? " [" + T("diy_role_" + r.k) + (r.note ? " · " + r.note : "") + "]" : "";
      return `<span class="af" title="${esc(ICG.displayName(p)) + (r ? " — " + T("diy_role_" + r.k) : "")}">
        ${esc(p.code || ICG.displayName(p))}${tip ? "" : ""}
        <button class="x" data-psw="${esc(id)}" title="${esc(T("diy_swap"))}">⇄</button>
        <button class="x" data-prm="${esc(id)}" aria-label="${esc(T("diy_remove"))}">×</button></span>`;
    }).join("");
  }
  function swapItem(id) {
    const p = IC.byId.get(id); if (!p) return;
    const alt = IC.products.find(x => x.purp === p.purp && x.cat === p.cat && !plan.has(x.id) && x.img[0]);
    if (!alt) return;
    reasons.delete(id); IC.planRemove(id);
    const r = reasons.get(alt.id) || { k: "fill" };
    if (!plan.has(alt.id)) IC.planToggle(alt.id);
    reasons.set(alt.id, typeof r === "object" ? r : { k: "fill" });
    renderList(); renderChips(); draw();
  }

  /* ---------- generate: constraint-aware auto-selection ---------- */
  const SPACE_CATS = { play: ["play"], park: ["park"], sport: ["sport", "play"], mix: ["play", "park", "sport"] };
  function ageOK(p, bucketId) {
    if (!bucketId) return true;
    const b = IC.AGE_BUCKETS.find(x => x.id === bucketId);
    if (!b) return true;
    if (!p.age) return true; // unknown age = doesn't disqualify, but ranked below
    return p.age[0] <= b.hi && p.age[1] >= b.lo;
  }
  function generate() {
    const space = $("#diySpace").value, area = Math.max(12, parseFloat($("#diyArea").value) || 80), age = $("#diyAge").value;
    const cats = SPACE_CATS[space] || ["play"];
    const pool = IC.products.filter(p => cats.includes(p.cat) && ageOK(p, age) && p.img[0]);
    reasons.clear(); IC.planClear();
    // 1) anchor: biggest footprint multiplay/arena/bench fitting ~40% of area incl. pad
    const anchors = pool.filter(p => ["multiplay", "arenas", "benches", "street"].includes(p.purp))
      .sort((a, b) => paddedArea(b) - paddedArea(a));
    const anchor = anchors.find(p => paddedArea(p) <= area * 0.45) || anchors[0];
    if (anchor) { IC.planToggle(anchor.id); reasons.set(anchor.id, { k: "anchor" }); }
    // 2) companions: cycle purposes for diversity while the padded budget lasts
    const wantPurps = space === "sport"
      ? ["fitness", "street", "walls", "tramp", "goals", "tables", "parkour"]
      : space === "park"
        ? ["benches", "bins", "bike", "planters", "picnic", "shelters", "info"]
        : ["swings", "springers", "carousels", "slides", "sandboxes", "balance", "climbers", "playhouses"];
    let used = 0; for (const id of plan.keys()) { const pi = IC.byId.get(id); used += paddedArea(pi); }
    let added = true, rounds = 0;
    while (added && rounds < 4) {
      added = false; rounds++;
      for (const pur of wantPurps) {
        const cand = pool.find(p => p.purp === pur && !plan.has(p.id));
        if (!cand) continue;
        const need = paddedArea(cand);
        if (used + need > area) continue; // WHAT CAN FIT — hard constraint
        IC.planToggle(cand.id);
        reasons.set(cand.id, { k: age && cand.age ? "safe" : "fill", note: age && cand.age ? `възраст ${cand.age[0]}–${cand.age[1] >= 99 ? "+" : cand.age[1]}` : `${need.toFixed(1)} m²` });
        used += need; added = true;
        if (plan.size >= 14) break;
      }
      if (plan.size >= 14) break;
    }
    renderList(); renderChips(); draw();
  }
  function paddedArea(p) { const it = parseDims(p.sp && p.sp.d) || { w: 2, d: 2 }; const pad = safetyPad(p); return (it.w + 2 * pad) * (it.d + 2 * pad); }

  /* ---------- layout + rendering delegate to ICP (assets/js/plan.js) ---------- */
  function planToItems() {
    const items = [];
    for (const [id, qty] of plan.entries()) {
      const p = IC.byId.get(id); if (!p) continue;
      for (let i = 0; i < qty; i++) {
        const fp = ICP.parseDims(p.sp && p.sp.d) || { w: 2, d: 2, est: true };
        items.push({ p, dims: fp, pad: ICP.safetyPad(p), est: !!fp.est });
      }
    }
    return items;
  }
  function paddedArea(p) { const it = ICP.parseDims(p.sp && p.sp.d) || { w: 2, d: 2 }; const pad = ICP.safetyPad(p); return (it.w + 2 * pad) * (it.d + 2 * pad); }

  function draw() {
    const cv = $("#diyCanvas"), wrap = $("#diyWrap");
    if (!cv || !wrap || !window.ICP) return;
    const space = $("#diySpace").value || "mix";
    const area = Math.max(12, parseFloat($("#diyArea").value) || 80);
    const age = $("#diyAge").value;
    const items = planToItems();
    $("#diyEmpty").hidden = items.length > 0;
    $("#diyEmpty").textContent = T("diy_empty");
    const L = ICP.render(cv, wrap, items, {
      space, areaM2: area,
      title: T("diy_concept") + " — " + T("space_" + space),
      kicker: (age ? T("age_" + age.slice(1)) : T("diy_all_ages")) + " · " + plan.size + " " + T("diy_items") + " · " + area + " m²",
    });
    let areaUse = 0, users = 0, zones = 0, est = 0;
    for (const it of items) {
      areaUse += (it.dims.w + 2 * it.pad) * (it.dims.d + 2 * it.pad);
      zones += ICP.parseZone(it.p.sp && it.p.sp.z);
      users += parseUsers(it.p.sp && it.p.sp.u);
      if (it.est) est++;
    }
    drawStats(items.length, areaUse, zones, users, est);
    window.__lastLayout = L;
  }
  function drawStats(items, area, zones, users, est = 0) {
    $("#diyStats").innerHTML = items ? [
      [items, T("diy_items")], [area ? area.toFixed(1) + " m²" : "—", T("diy_area")],
      [zones ? zones.toFixed(1) + " m²" : "—", T("diy_zones")], [users || "—", T("diy_users")],
    ].map(([v, l]) => `<span class="st"><b>${esc(String(v))}</b> ${esc(l)}</span>`).join("") : "";
    const warns = [];
    if (est) warns.push(est + " " + T("diy_warn_dims"));
    const ages = new Set(); let any = false;
    for (const id of plan.keys()) { const p = IC.byId.get(id); if (p && p.age) { any = true; ages.add(p.age[0] <= 3 ? "small" : p.age[0] >= 14 ? "adult" : "kid"); } }
    if (any && ages.size > 1) warns.unshift(T("diy_warn_age"));
    const wEl = $("#diyWarn");
    wEl.hidden = !warns.length; wEl.innerHTML = warns.map(esc).join("<br>");
  }

  /* ---------- png ---------- */
  function downloadPNG() {
    const a = document.createElement("a");
    a.href = $("#diyCanvas").toDataURL("image/png");
    a.download = "infraconcept-plan.png";
    a.click();
  }

  function openDiy() {
    applyI18nTexts();
    $("#diy").hidden = false; document.body.style.overflow = "hidden";
    renderList(); renderChips(); requestAnimationFrame(draw);
  }
  function closeDiy() { $("#diy").hidden = true; document.body.style.overflow = ""; IC.persist(); }
  function applyI18nTexts() {
    $("#diyT").textContent = T("diy_t"); $("#diyD").textContent = T("diy_d");
    $("#diyQ").placeholder = T("diy_pick") + "…";
    $("#diyRepack").textContent = T("diy_repack"); $("#diyPng").textContent = T("diy_png"); $("#diyAll").textContent = T("diy_to_inq");
    const dclr = $("#diyClear"); if (dclr) dclr.textContent = T("diy_clear");
    $("#diyConcept").textContent = "◦ " + T("diy_concept");
    $("#diyTypeLbl").textContent = T("diy_type"); $("#diyAreaLbl").textContent = T("diy_area_lbl"); $("#diyAgeLbl").textContent = T("diy_age_lbl");
    $("#diyGen").textContent = T("diy_generate");
    $("#diySpace").querySelectorAll("option").forEach(o => { o.textContent = T("space_" + o.value); });
    $("#diyAge").querySelectorAll("option").forEach(o => { o.textContent = o.value ? T("age_" + o.value.slice(1)) : T("diy_all_ages"); });
  }

  function bind() {
    const open = e => { if (e) e.preventDefault(); openDiy(); };
    const heroBtn = $("#diyOpenHero"); if (heroBtn) heroBtn.addEventListener("click", open);
    $("#diy").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeDiy(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#diy").hidden) closeDiy(); });
    $("#diyList").addEventListener("click", e => {
      const b = e.target.closest("[data-tgl]"); if (!b) return;
      reasons.delete(b.dataset.tgl); IC.planToggle(b.dataset.tgl);
      renderList(); renderChips(); draw();
    });
    $("#diyChips").addEventListener("click", e => {
      const rm = e.target.closest("[data-prm]"); if (rm) { reasons.delete(rm.dataset.prm); IC.planRemove(rm.dataset.prm); renderList(); renderChips(); draw(); return; }
      const sw = e.target.closest("[data-psw]"); if (sw) { swapItem(sw.dataset.psw); }
    });
    $("#diyQ").addEventListener("input", renderList);
    $("#diyGen").addEventListener("click", generate);
    $("#diyRepack").addEventListener("click", generate); // regenerate = fresh constraint-aware selection
    $("#diyPng").addEventListener("click", downloadPNG);
    const dclr = $("#diyClear");
    if (dclr) dclr.addEventListener("click", () => { reasons.clear(); IC.planClear(); renderList(); });
    $("#diyAll").addEventListener("click", () => {
      for (const id of plan.keys()) IC.trayAdd(id, 1);
      closeDiy();
      $("#trayBtn").click();
    });
    addEventListener("resize", () => { if (!$("#diy").hidden) draw(); });
    IC.on(what => { if (what === "lang") applyI18nTexts(); if (what === "plan") { renderChips(); draw(); } });
  }
  return { bind, openDiy };
})();
