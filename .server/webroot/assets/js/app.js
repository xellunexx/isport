/* app.js — bootstrap: i18n runtime, hero, sections, deck/grid wiring, shortcuts. */
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const { t: I18N } = window.IC_I18N;
  window.ICT = function (key) {
    const lang = IC.state.lang;
    return (I18N[lang] && I18N[lang][key]) || I18N.bg[key] || key;
  };

  /* ---------- static chrome text ---------- */
  function applyI18n() {
    const T = ICT;
    document.documentElement.lang = IC.state.lang;
    document.title = `${T("site")} — ${T("promise")}`;
    const subP = T("promise").split(". ");
    $("#heroTitle").innerHTML = esc(subP[0] || "") + ".<br><em>" + esc(subP.slice(1).join(". ") || "") + "</em>";
    $("#heroSub").textContent = T("promise_sub");
    $("#heroKicker").textContent = IC.state.lang === "bg" ? "Инфра Концепт — инженеринг на открито, от 2008" : T("site") + " — outdoor engineering, since 2008";
    $("#ctaCatalog").textContent = T("cta_catalog");
    $("#ctaHow").textContent = T("cta_how");
    $("#heroHintTxt").textContent = T("how3_d");
    $("#deckTitle").textContent = T("menu_catalog");
    $("#searchInput").placeholder = T("search_ph");
    $("#sortLbl").textContent = T("sort");
    ["rel", "name", "brand"].forEach(v => { const o = $("#sortSel").querySelector(`option[value=${v}]`); if (o) o.textContent = T("sort_" + v); });
    $("#emptyT").textContent = T("no_results"); $("#emptyD").textContent = T("no_results_hint"); $("#emptyReset").textContent = T("reset");
    $("#howT").textContent = T("how_t");
    for (const i of [1, 2, 3]) { $("#how" + i + "T").textContent = T("how" + i + "_t"); $("#how" + i + "D").textContent = T("how" + i + "_d"); }
    $("#audT").textContent = T("menu_aud"); $("#audD").textContent = T("au_d");
    $("#projT").textContent = T("proj_t"); $("#projD").textContent = T("proj_d");
    $("#brandsT").textContent = T("brands_t"); $("#brandsD").textContent = T("brands_d");
    $("#aboutT").textContent = T("about_t"); $("#aboutD").textContent = T("about_d");
    $("#contactsT").textContent = T("contacts_t");
    $("#trayT").textContent = T("tray_title"); $("#trayNote").textContent = T("tray_note");
    $("#traySend").textContent = T("send"); $("#trayCopy").textContent = T("copy");
    const exb = $("#trayExport"); if (exb) exb.textContent = T("export_json");
    $("#trayName").placeholder = T("fname"); $("#trayEmail").placeholder = T("femail"); $("#trayMsg").placeholder = T("fmsg");
    const lb = document.querySelector(".live-btn-t"); if (lb) lb.textContent = T("live_btn");
    const diyh = $("#diyOpenHero"); if (diyh) diyh.textContent = T("diy_btn");
    const admB = $("#adminBtn"); if (admB) admB.title = T("admin_t");
    const trCl = $("#trayClear"); if (trCl) trCl.textContent = T("tray_clear");
    const emptLast = $("#emptyLast"); if (emptLast) emptLast.textContent = T("empty_remove_last");
    const ht = $("#heroTrust"); if (ht) ht.textContent = T("trust_line");
    const cb = $("#chatBtn"); if (cb) { cb.title = (window.IC_ASSIST ? IC_ASSIST.name : "Площадко"); const cn = $("#chatName"); if (cn && window.IC_ASSIST) cn.textContent = IC_ASSIST.name; const ci = $("#chatInput"); if (ci) ci.placeholder = T("menu_catalog") + " · " + (window.IC_ASSIST ? IC_ASSIST.name : "") + "…"; }
    $("#footNote").textContent = T("foot_note");
    $("#empty").hidden = true;
    buildNav();
    heroStats();
    renderAudiences(); renderProjects(); renderBrands(); renderContacts();
    // lang pills state
    document.querySelectorAll("#langSw button").forEach(b => b.classList.toggle("on", b.dataset.lang === IC.state.lang));
  }

  function buildNav() {
    const nav = $("#hdrNav");
    nav.innerHTML = [["#catalog", "menu_catalog"], ["#aud", "menu_aud"], ["#proj", "menu_projects"], ["#brands", "menu_brands"], ["#about", "menu_about"], ["#contacts", "menu_contacts"]]
      .map(([h, k]) => `<a href="${h}" data-nav="${h.slice(1)}">${esc(ICT(k))}</a>`).join("");
  }

  function heroStats() {
    const P = IC.products.length;
    const brands = Object.keys(IC_BRANDS).length;
    const series = new Set(IC.products.map(p => p.series).filter(Boolean)).size;
    $("#heroStats").innerHTML = [
      [P.toLocaleString(IC.state.lang), "stat_products"],
      [brands, "stat_brands"], [series, "stat_series"], ["17+", "stat_years"],
    ].map(([v, k]) => `<div class="st"><b>${esc(String(v))}</b><span>${esc(ICT(k))}</span></div>`).join("");
  }

  /* audiences (target-grupi) — personas = visible SYSTEM recommendations, not silent user filters */
  const PERSONAS = {
    "uchilishta":     { cat: "play",     ages: ["a7", "a12"], labelKey: "au_uchilishta" },
    "detski-gradini": { cat: "play",     ages: ["a0", "a3"], labelKey: "au_detski" },
    "hoteli":         { cat: "park",     purps: ["benches", "tables_p", "picnic", "planters"], labelKey: "au_hoteli" },
    "obshtini":       { cat: null,       labelKey: "au_obshtini" },
    "stroiteli":      { cat: "flooring", labelKey: "au_stroiteli" },
    "arhitekti":      { cat: "park",     purps: ["benches", "planters", "smart", "bike"], labelKey: "au_arhitekti" },
  };
  function renderAudiences() {
    const el = $("#audGrid");
    if (!el) return;
    el.innerHTML = (IC_DATA.targets || []).map(tg => `
      <button class="au-card" data-au="${esc(tg.slug)}">
        ${tg.imgs[0] ? `<img src="${esc(tg.imgs[0])}" alt="${esc(tg.title)}" loading="lazy" decoding="async">` : ""}
        <div class="ab"><span class="anm">${esc(ICT("au_" + tg.slug.replace("detski-gradini", "detski")))}</span>
        ${tg.paras[0] ? `<span class="ad">${esc(tg.paras[0])}</span>` : ""}
        <span class="act">${esc(ICT("apply_preset"))} →</span></div>
      </button>`).join("");
    el.addEventListener("click", e => {
      const c = e.target.closest("[data-au]"); if (!c) return;
      openAud(c.dataset.au);
    });
  }
  function openAud(slug) {
    const tg = (IC_DATA.targets || []).find(t => t.slug === slug); if (!tg) return;
    $("#audTitle").textContent = ICT("au_" + slug.replace("detski-gradini", "detski"));
    $("#audText").textContent = (tg.paras || []).slice(0, 2).join(" ");
    const im = $("#audImg"); im.src = tg.imgs[0] || ""; im.alt = tg.title;
    const ap = $("#audApply");
    ap.textContent = ICT("apply_preset") + " →";
    ap.onclick = () => {
      const pr = PERSONAS[slug] || {};
      IC.applyPreset({ ...pr, slug });
      IC.setMode("catalog");
      $("#audModal").hidden = true; document.body.style.overflow = "";
      document.querySelector("#grid").scrollIntoView({ behavior: "smooth" });
    };
    const go = $("#audGo");
    go.textContent = ICT("open_orig") + " ↗"; go.href = tg.url;
    $("#audModal").hidden = false; document.body.style.overflow = "hidden";
  }
  function renderProjects() {
    $("#projRail").innerHTML = (IC_DATA.facilities || []).map((f, i) => `
      <button class="proj-card" data-proj="${i}" aria-label="${esc(f.t)}"><img src="${esc(f.img)}" alt="${esc(f.t)}" loading="lazy" decoding="async">
      <div class="pb"><div class="pn">${esc(f.t)}</div><div class="pl">${esc(f.loc)}</div>
      <span class="ctapill">${esc(ICT("quick"))}</span></div></button>`).join("");
  }
  function renderBrands() {
    $("#brandsGrid").innerHTML = Object.entries(IC_BRANDS).map(([slug, b]) => {
      const n = (window.ICO && ICO.brandCount) ? ICO.brandCount(slug) : IC.countFor("brands", slug);
      return `<button class="brand-tile" data-brand="${slug}">
        <img src="img/brands/${slug}.png" alt="${esc(b.name)}" loading="lazy" onerror="this.remove()">
        <span class="bname">${esc(b.name)}</span>
        <span class="bmeta">${b.country} · ${b.est}</span>
        <span class="bcount">${n} ${esc(ICT("results"))}</span></button>`;
    }).join("");
  }
  function renderContacts() {
    const T = ICT;
    $("#contactsGrid").innerHTML = [
      [T("office_bg"), "+359 894 445 492", "office · Бургас"],
      [T("office_bgsouth"), "+359 894 445 490", ""],
      [T("office_varna"), "+359 894 445 491", ""],
    ].map(([t, tel, note]) => `<div class="contact-card"><div class="lbl">${esc(t)}</div>
      <a href="tel:${tel.replace(/\s/g, "")}">${esc(tel)}</a></div>`).join("");
  }

  /* ---------- hero canvas: drifting material granules ---------- */
  function heroCanvas() {
    const cv = $("#heroCanvas"), ctx = cv.getContext("2d");
    const COLORS = ["#ff7a1a", "#e0563f", "#d9a05b", "#8d8a80", "#9aa4ae", "#5da267", "#ffb054"];
    let W, H, parts = [], raf = 0;
    const DPR = Math.min(devicePixelRatio || 1, 2);
    function resize() {
      W = cv.width = cv.offsetWidth * DPR; H = cv.height = cv.offsetHeight * DPR;
      const n = Math.min(110, Math.max(34, Math.round(W * H / (26000 * DPR * DPR))));
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: (1.1 + Math.random() * 2.6) * DPR,
        vx: (Math.random() - .5) * .16 * DPR, vy: (.05 + Math.random() * .28) * DPR,
        ph: Math.random() * 6.28, sw: .3 + Math.random() * .8,
        c: COLORS[(Math.random() * COLORS.length) | 0], a: .12 + Math.random() * .3,
      }));
    }
    let t = 0;
    function frame() {
      t += .016;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.vx + Math.sin(t * p.sw + p.ph) * .12 * DPR; p.y += p.vy;
        if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
        if (p.x > W + 10) p.x = -10; if (p.x < -10) p.x = W + 10;
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.roundRect(p.x, p.y, p.r * 2.1, p.r * 1.5, p.r * .5); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    resize(); addEventListener("resize", resize);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let hideCtl = (window.ICA && ICA.prefs) ? !ICA.prefs.particles : false;
    function play() {
      cancelAnimationFrame(raf);
      const show = !reduced.matches && !document.hidden && !hideCtl;
      cv.style.display = hideCtl ? "none" : "";
      if (show) raf = requestAnimationFrame(frame);
      else if (!hideCtl) { // reduced/hidden -> draw single static frame
        ctx.clearRect(0, 0, W, H);
        for (const p of parts) { ctx.globalAlpha = p.a; ctx.fillStyle = p.c; ctx.beginPath(); ctx.roundRect(p.x, p.y, p.r * 2.1, p.r * 1.5, p.r * .5); ctx.fill(); }
      }
    }
    reduced.addEventListener("change", play);
    document.addEventListener("visibilitychange", play);
    play();
    return { setParticles(on) { hideCtl = !on; play(); } };
  }

  /* ---------- language switcher ---------- */
  function buildLang() {
    const sw = $("#langSw");
    sw.innerHTML = IC_I18N.langs.map(l => `<button data-lang="${l.id}" title="${esc(l.name)}">${esc(l.short)}</button>`).join("");
    sw.addEventListener("click", e => {
      const b = e.target.closest("[data-lang]"); if (!b) return;
      IC.setLang(b.dataset.lang);
    });
  }

  /* ---------- search ---------- */
  function bindSearch() {
    const inp = $("#searchInput"), x = $("#searchX");
    let deb = 0;
    inp.addEventListener("input", () => {
      clearTimeout(deb);
      deb = setTimeout(() => { IC.setQ(inp.value); x.hidden = !inp.value; }, 160);
    });
    x.addEventListener("click", () => { inp.value = ""; x.hidden = true; IC.setQ(""); inp.focus(); });
    $("#hdrSearch").addEventListener("click", () => {
      $("#catalog").scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inp.focus(), 450);
    });
  }

  function bindSort() {
    const sel = $("#sortSel");
    sel.innerHTML = `<option value="rel"></option><option value="name"></option><option value="brand"></option>`;
    sel.addEventListener("change", () => IC.setSort(sel.value));
  }

  /* Long-page nav: deterministic landing regardless of engine.
     Native anchors can drift (lazy image reflow + smooth flight + 24k px), so we:
     1) set the hash natively (history + accessibility preserved),
     2) compute the target with the CURRENTLY-MEASURED sticky chrome (header + deck),
     3) instant-land, then ONE poller re-aims after the browser settles (fonts/images). */
  window.__navJumping = 0;
  function stickyChromeH() {
    const h = document.getElementById("hdr");
    const d = document.getElementById("deckWrap");
    return (h ? h.offsetHeight : 0) + (d ? d.offsetHeight : 0) + 14;
  }
  function aimAt(el) {
    const y = el.getBoundingClientRect().top + window.scrollY - stickyChromeH();
    window.scrollTo(0, Math.max(0, y));
  }
  function jumpTo(hash) {
    const el = document.querySelector(hash);
    if (!el) return;
    window.__navJumping = Date.now() + 3600;
    aimAt(el);
    let lastY = -1, stable = 0, aims = 0;
    const t0 = Date.now();
    (function settle() {
      const y = window.scrollY;
      const targetTop = el.getBoundingClientRect().top - stickyChromeH();
      if (Math.abs(targetTop) > 24 && aims < 4) { aimAt(el); aims++; }
      if (Math.abs(y - lastY) < 2) stable++; else stable = 0;
      lastY = y;
      if (stable >= 3 || Date.now() - t0 > 5000) { aimAt(el); return; }
      setTimeout(settle, 120);
    })();
  }
  function bindNav() {
    document.addEventListener("click", e => {
      const a = e.target.closest("a[href^='#']");
      if (!a) return;
      const h = a.getAttribute("href");
      if (!h || !/^#(aud|proj|brands|about|contacts|catalog|how|top)$/.test(h)) return;
      e.preventDefault();
      jumpTo(h);
      try { history.pushState(null, "", h); } catch (e2) {}
    });
    // на живо header button: mode + land on the board
    const lb = $("#liveBtn");
    if (lb) lb.addEventListener("click", () => jumpTo("#catalog"));
  }
  function bindKeys() {
    document.addEventListener("keydown", e => {
      if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) {
        e.preventDefault(); jumpTo("#catalog"); setTimeout(() => $("#searchInput").focus(), 350);
      }
    });
    $("#toTop").addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));
  }

  /* ---------- boot ---------- */
  function boot() {
    IC.loadHash();
    // deep-link: restore persona recommendation from ?rec=slug (labels live here)
    try {
      const rm = location.hash.match(/[?&]rec=([a-z-]+)/);
      if (rm && PERSONAS[rm[1]]) {
        const pr = PERSONAS[rm[1]];
        IC.state.rec = { slug: rm[1], labelKey: pr.labelKey || "", ages: pr.ages || [], purps: pr.purps || [] };
      }
    } catch (e) {}
    buildLang();
    ICF.bind(); ICG.bind(); ICH.bind(); ICO.bind();
    if (window.ICL) ICL.bind();
    if (window.ICA) ICA.bind();
    if (window.ICD) ICD.bind();
    if (window.ICC) ICC.bind();
    bindSearch(); bindSort(); bindKeys(); bindNav(); window.__heroCtl = heroCanvas();
    applyI18n();
    // initial search box reflects hash
    if (IC.state.q) { $("#searchInput").value = IC.state.q; $("#searchX").hidden = false; }
    $("#sortSel").value = IC.state.sort;

    IC.on(what => {
      if (what === "lang") { applyI18n(); if (window.ICA) ICA.apply(); }
      ICF.render(); ICG.render();
    });
    ICF.render(); ICG.render();
    // deep-link: /#/p/<id> opens that product's quick view (SEO pages link in)
    const pm = location.hash.match(/^#\/p\/([^?#]+)/);
    if (pm && window.ICO) setTimeout(() => ICO.quickView(decodeURIComponent(pm[1])), 60);
    // track sticky deck height so scroll-margin keeps products visible below it
    const deckWrap = $("#deckWrap");
    const setDeckH = () => {
      const h = document.getElementById("hdr");
      document.documentElement.style.setProperty("--deckH", deckWrap.offsetHeight + "px");
      window.__stickyChromeH = () => (h ? h.offsetHeight : 0) + deckWrap.offsetHeight;
    };
    new ResizeObserver(setDeckH).observe(deckWrap);
    setDeckH();
    window.appReady = true;
    clearTimeout(window.__bootWatch);
    const bn = document.getElementById("bootNote"); if (bn) bn.hidden = true;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
