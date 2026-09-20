/* overlay.js — quickview modal, inquiry tray (localStorage, mailto), brand modal. */
window.ICO = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const T = k => (window.ICT ? ICT(k) : k);

  /* ---------------- tray (Моят проект, storage in IC.state — one truth) ---------------- */
  const tray = IC.state.tray; // live alias (never reassigned by store)
  function trayBadge() {
    const el = $("#trayCount");
    el.hidden = tray.size === 0;
    el.textContent = tray.size;
  }

  let lastFocus = null;
  function openModal(id) { lastFocus = document.activeElement; $(id).hidden = false; document.body.style.overflow = "hidden"; }
  function closeModal(el) { (typeof el === "string" ? $(el) : el).hidden = true; document.body.style.overflow = ""; if (lastFocus) lastFocus.focus(); }
  const MODALS = ["#qv", "#tray", "#brandModal", "#projModal", "#audModal"];
  function anyModalOpen() { return MODALS.some(id => !$(id).hidden); }

  /* ---------------- project modal ---------------- */
  function projectView(i) {
    const f = (IC_DATA.facilities || [])[i]; if (!f) return;
    const imgs = f.imgs && f.imgs.length ? f.imgs : (f.img ? [f.img] : []);
    $("#projTitle").textContent = f.t;
    $("#projLoc").textContent = f.loc || "";
    $("#projImg").src = imgs[0] || ""; $("#projImg").alt = f.t;
    $("#projThumbs").innerHTML = imgs.length > 1 ? imgs.map((im, j) =>
      `<button data-pimg="${esc(im)}" class="${j === 0 ? "on" : ""}" aria-label="img ${j + 1}"><img src="${esc(im)}" alt=""></button>`).join("") : "";
    const go = $("#projGo");
    go.textContent = T("open_orig") + " ↗";
    if (f.url) { go.href = f.url; go.style.display = ""; } else { go.style.display = "none"; }
    const want = $("#projWant");
    want.textContent = T("want_similar");
    want.onclick = () => {
      closeModal("#projModal");
      const msg = $("#trayMsg"); if (msg) { msg.value = `${T("want_similar")}: ${f.t}${f.loc ? " (" + f.loc + ")" : ""}`; }
      renderTray(); openModal("#tray");
    };
    const typ = $("#projType");
    typ.textContent = T("proj_type_link");
    typ.onclick = () => {
      closeModal("#projModal");
      const cat = window.ICL ? ICL.catOf(f) : "play";
      IC.applyPreset({ cat, slug: "", labelKey: "" });
      IC.setMode("catalog");
      document.querySelector("#grid").scrollIntoView({ behavior: "smooth" });
    };
    openModal("#projModal");
  }
  /* ---------------- quick view ---------------- */
  function quickView(id) {
    const p = IC.byId.get(id); if (!p) return;
    const qv = $("#qv");
    $("#qvTitle").textContent = ICG.displayName(p);
    const subtitle = [p.code, (IC_BRANDS[p.brand] || {}).name || p.brand, p.sname].filter(Boolean).join(" · ");
    $("#qvCode").textContent = subtitle;
    const imgs = p.img.length ? p.img : [];
    $("#qvImg").src = imgs[0] || "";
    $("#qvImg").alt = p.n;
    $("#qvThumbs").innerHTML = imgs.map((im, i) =>
      `<button data-img="${esc(im)}" class="${i === 0 ? "on" : ""}" aria-label="img ${i + 1}"><img src="${esc(im)}" alt=""></button>`).join("");
    const chips = [];
    chips.push(`<button class="fchip" data-ap="cat" data-v="${p.cat}">${esc(T("cat_" + p.cat))}</button>`);
    chips.push(`<button class="fchip" data-ap="purp" data-v="${p.purp}">${esc(T("p_" + p.purp))}</button>`);
    p.mats.forEach(m => chips.push(`<button class="fchip" data-ap="mats" data-v="${m}">${esc(T("mat_" + m))}</button>`));
    if (p.age) chips.push(`<span class="fchip">${esc(T("ageLbl"))}: ${p.age[0]}${p.age[1] >= 99 ? "+" : "–" + p.age[1]}</span>`);
    chips.push(`<button class="fchip" data-ap="brands" data-v="${p.brand}">${esc((IC_BRANDS[p.brand] || {}).name || p.brand)}</button>`);
    if (p.sname) chips.push(`<span class="fchip">${esc(T("seriesLbl"))}: ${esc(p.sname)}</span>`);
    $("#qvChips").innerHTML = chips.join("");
    const rows = [];
    if (p.sp.d) rows.push([T("dims"), p.sp.d]);
    if (p.sp.f) rows.push([T("fall"), p.sp.f]);
    if (p.sp.u) rows.push([T("users"), p.sp.u]);
    if (p.sp.z) rows.push([T("zone"), p.sp.z]);
    $("#qvSpecs").innerHTML = rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("");
    $("#qvLinks").innerHTML = (p.pdfs || []).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(T("datasheet"))} ↗</a>`).join("");
    // "на живо": real delivered-project photos in this product's division
    let irl = "";
    if (window.ICL) {
      const ctx = ICL.contextFor("cat").filter(f => f.img && ICL.catOf(f) === p.cat).slice(0, 4);
      if (ctx.length) {
        irl = `<p class="qv-irl-t">${esc(T("live_btn"))} · ${esc(T("live_note"))}</p>
          <div class="qv-irl-row">` + ctx.map(f => {
            const idx = IC_DATA.facilities.indexOf(f);
            return `<button class="qv-irl-i" data-proj="${idx}"><img src="${esc(f.img)}" alt="${esc(f.t)}" loading="lazy"></button>`;
          }).join("") + `</div>`;
      }
    }
    $("#qvIrl").innerHTML = irl;
    const addBtn = $("#qvAdd");
    addBtn.textContent = tray.has(id) ? "✓ " + T("added") : "+ " + T("add");
    addBtn.onclick = () => { trayToggle(id); addBtn.textContent = tray.has(id) ? "✓ " + T("added") : "+ " + T("add"); };
    const simBtn = $("#qvSimilar");
    simBtn.textContent = "◎ " + T("similar");
    simBtn.onclick = () => { closeModal(qv); window.ICH && ICH.applyOf(id); document.querySelector("#catalog").scrollIntoView(); };
    qv.dataset.pid = id;
    openModal("#qv");
  }

  /* ---------------- tray ---------------- */
  function trayToggle(id) {
    IC.trayToggle(id);
    trayBadge(); renderTray();
    const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"] [data-act="add"]`);
    if (card) card.classList.toggle("added", tray.has(id));
  }
  function trayQtyD(id, delta) {
    IC.trayQty(id, delta);
    trayBadge(); renderTray();
    const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"] [data-act="add"]`);
    if (card) card.classList.toggle("added", tray.has(id));
  }
  function renderTray() {
    const list = $("#trayList");
    if (!tray.size) { list.innerHTML = `<p class="tray-empty">${esc(T("tray_empty"))}</p>`; return; }
    list.innerHTML = [...tray.entries()].map(([id, qty]) => {
      const p = IC.byId.get(id); if (!p) return "";
      return `<div class="tray-item">
        <img src="${esc(p.img[0] || "")}" alt="" loading="lazy">
        <span class="ti-mid"><span class="ti-n">${esc(ICG.displayName(p))}</span><br><span class="ti-c">${esc(p.code || "")}</span>
        <span class="ti-qty"><button data-qty="-1" data-qid="${esc(id)}" aria-label="-">−</button><b>${qty}</b><button data-qty="1" data-qid="${esc(id)}" aria-label="+">+</button></span></span>
        <button class="ti-x" data-rm="${esc(id)}" aria-label="${esc(T("remove_one"))}">×</button></div>`;
    }).join("");
  }
  const trayLines = withQty => [...tray.entries()].map(([id, qty]) => {
    const p = IC.byId.get(id);
    return p ? `• ${p.n}${p.code ? " (" + p.code + ")" : ""}${withQty ? " × " + qty : ""}` : "";
  }).filter(Boolean);
  function trayText() {
    const who = [$("#trayName").value, $("#trayEmail").value].filter(Boolean).join(" — ");
    const msg = $("#trayMsg").value;
    return `${who ? who + "\n\n" : ""}${msg ? msg + "\n\n" : ""}Запитване / Inquiry (${tray.size}):\n${trayLines(true).join("\n")}`;
  }
  function exportTray() {
    const spec = {
      generated: new Date().toISOString().slice(0, 19),
      locale: IC.state.lang,
      contact: { name: $("#trayName").value, email: $("#trayEmail").value, message: $("#trayMsg").value },
      items: [...tray.entries()].map(([id, qty]) => {
        const p = IC.byId.get(id) || {};
        return { id, name: p.n, code: p.code || "", brand: (IC_BRANDS[p.brand] || {}).name || p.brand, series: p.sname || "", qty };
      }),
    };
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "infraconcept-inquiry.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function copyTray() {
    const txt = trayText();
    try { await navigator.clipboard.writeText(txt); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); ta.remove();
    }
    const btn = $("#trayCopy"); const old = btn.textContent;
    btn.textContent = T("copied"); setTimeout(() => btn.textContent = old, 1600);
  }
  function sendTray() {
    const subject = encodeURIComponent(`Запитване от сайта / Inquiry (${tray.size})`);
    const body = encodeURIComponent(trayText());
    location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  /* ---------------- brand modal ---------------- */
  function brandModal(slug) {
    const b = IC_BRANDS[slug]; if (!b) return;
    $("#brandLogo").src = "img/brands/" + slug + ".png";
    $("#brandLogo").alt = b.name;
    $("#brandName").textContent = b.name;
    $("#brandMeta").textContent = `${b.country} · est. ${b.est}`;
    $("#brandDesc").textContent = (b.d[IC.state.lang] || b.d.en);
    const n = brandCount(slug);
    const go = $("#brandGo");
    go.textContent = `${b.name} — ${n} ${T("results")}`;
    go.onclick = () => {
      closeModal("#brandModal");
      IC.selectBrand(slug);
      document.querySelector("#grid").scrollIntoView({ behavior: "smooth" });
    };
    if (n === 0) { go.disabled = true; go.style.opacity = .35; go.onclick = null; } else { go.disabled = false; go.style.opacity = 1; }
    openModal("#brandModal");
  }

  /* brand context = unfiltered totals (tile mustn't depend on current filters) */
  function brandCount(slug) {
    let n = 0;
    for (const p of IC.products) if (p.brand === slug) n++;
    return n;
  }

  function bind() {
    document.addEventListener("click", e => {
      const cl = e.target.closest("[data-close]");
      if (cl) { const box = cl.closest(".qv, .tray"); if (box) closeModal(box); }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && anyModalOpen()) { MODALS.slice().reverse().forEach(id => { if (!$(id).hidden) closeModal(id); }); }
    });
    ["#projRail", "#irlRail", "#qvIrl", "#grid"].forEach(sel => {
      const el = $(sel);
      if (el) el.addEventListener("click", e => {
        const t = e.target.closest("[data-proj]");
        if (t) projectView(parseInt(t.dataset.proj, 10));
      });
    });
    $("#projThumbs").addEventListener("click", e => {
      const b = e.target.closest("[data-pimg]"); if (!b) return;
      $("#projImg").src = b.dataset.pimg;
      [...$("#projThumbs").children].forEach(x => x.classList.toggle("on", x === b));
    });
    $("#qvThumbs").addEventListener("click", e => {
      const b = e.target.closest("[data-img]"); if (!b) return;
      $("#qvImg").src = b.dataset.img;
      [...$("#qvThumbs").children].forEach(x => x.classList.toggle("on", x === b));
    });
    $("#qvChips").addEventListener("click", e => {
      const ch = e.target.closest("[data-ap]"); if (!ch) return;
      const f = ch.dataset.ap, v = ch.dataset.v;
      if (f === "brands") { IC.selectBrand(v); }
      else if (f === "cat") { IC.state.cat || IC.setCat(v); if (IC.state.cat !== v) IC.setCat(v); }
      else if (!((IC.state[f] instanceof Set) && IC.state[f].has(v))) IC.toggle(f, v);
      closeModal("#qv");
      document.querySelector("#grid").scrollIntoView({ behavior: "smooth" });
    });
    $("#trayBtn").addEventListener("click", () => { renderTray(); openModal("#tray"); });
    $("#trayList").addEventListener("click", e => {
      const qb = e.target.closest("[data-qty]");
      if (qb) { trayQtyD(qb.dataset.qid, parseInt(qb.dataset.qty, 10)); return; }
      const rm = e.target.closest("[data-rm]");
      if (rm) trayToggle(rm.dataset.rm);
    });
    $("#traySend").addEventListener("click", sendTray);
    $("#trayCopy").addEventListener("click", copyTray);
    const clr = $("#trayClear");
    if (clr) clr.addEventListener("click", () => { IC.trayClear(); trayBadge(); renderTray(); document.querySelectorAll("#grid [data-act='add'].added").forEach(b => b.classList.remove("added")); });
    const exBtn = $("#trayExport");
    if (exBtn) exBtn.addEventListener("click", exportTray);
    $("#brandsGrid").addEventListener("click", e => {
      const t = e.target.closest("[data-brand]");
      if (t) brandModal(t.dataset.brand);
    });
    trayBadge();
    IC.on(() => trayBadge());
  }

  return { bind, quickView, brandModal, trayToggle, tray, isOpen: anyModalOpen, brandCount, projectView };
})();
