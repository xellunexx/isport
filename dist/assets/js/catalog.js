/* Infraconcept 2026 — catalog engine.
   Филтриранe: AND across facets, OR within. Live counts, dead-end-proof options.
   Smart mode: hover-dwell on a card -> ghost "similar" filters -> pin or exit. */
(function () {
  "use strict";

  var grid = document.querySelector("#catalog-grid, #home-grid, .pgrid");
  if (!grid) return;
  var onCatalog = !!document.getElementById("catalog-grid");

  var cards = Array.prototype.slice.call(grid.querySelectorAll(".pcard")).map(function (el) {
    return {
      el: el, id: el.dataset.id, href: el.dataset.href,
      purpose: el.dataset.purpose, type: el.dataset.type, brand: el.dataset.brand,
      ages: el.dataset.ages ? el.dataset.ages.split(",") : [],
      mats: el.dataset.mats ? el.dataset.mats.split(",") : [],
      certs: el.dataset.certs ? el.dataset.certs.split(",") : [],
      name: (el.dataset.name || ""), series: el.dataset.series || "", model: el.dataset.model || "",
      tname: el.dataset.tname || "", bname: el.dataset.bname || "",
      dims: el.dataset.dims || "", cap: el.dataset.cap || ""
    };
  });

  // facet label map harvested from the rendered menus (no duplicated i18n)
  var LABEL = {}, OPTION = {};
  document.querySelectorAll(".fopt").forEach(function (o) {
    var inp = o.querySelector("input");
    if (!inp) return;
    var f = inp.dataset.f, v = inp.value;
    var lab = o.querySelector("span");
    if (lab) { (LABEL[f] = LABEL[f] || {})[v] = lab.textContent; }
    (OPTION[f] = OPTION[f] || {})[v] = o;
  });
  function label(f, v) { return (LABEL[f] && LABEL[f][v]) || v; }

  // ------------------------------------------------------------------ state
  var state = { purpose: new Set(), type: new Set(), age: new Set(), material: new Set(), brand: new Set(), q: "" };
  var ghost = null;          // {purpose:Set,...} while similar mode active
  var snapshot = null;       // saved real state for restore
  var smart = true;

  var URLKEY = { purpose: "purpose", type: "type", age: "age", material: "mat", brand: "brand" };
  function readURL() {
    var usp = new URLSearchParams(location.search);
    for (var f in URLKEY) {
      var v = usp.get(URLKEY[f]);
      if (v) v.split(",").forEach(function (x) { if (x) state[f].add(x); });
    }
    var q = usp.get("q"); if (q) state.q = q;
    return usp;
  }
  function writeURL() {
    if (!onCatalog) return;
    var usp = new URLSearchParams();
    for (var f in URLKEY) if (state[f].size) usp.set(URLKEY[f], Array.from(state[f]).join(","));
    if (state.q) usp.set("q", state.q);
    var qs = usp.toString();
    try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "")); } catch (e) { /* file:// previews */ }
  }

  // ------------------------------------------------------------------ filtering
  function eff() { return ghost || state; }
  function matches(c, st) {
    if (st.purpose.size && !st.purpose.has(c.purpose)) return false;
    if (st.type.size && !st.type.has(c.type)) return false;
    if (st.brand.size && !st.brand.has(c.brand)) return false;
    if (st.age.size && !c.ages.some(function (a) { return st.age.has(a); })) return false;
    if (st.material.size && !c.mats.some(function (m) { return st.material.has(m); })) return false;
    if (st.q) {
      var q = st.q.toLowerCase();
      var hay = (c.tname + " " + c.name + " " + c.series + " " + c.model + " " + c.bname).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function apply(updateURL) {
    var st = eff(), n = 0;
    cards.forEach(function (c) {
      var ok = matches(c, st);
      c.el.classList.toggle("hide", !ok);
      if (ok) n++;
    });
    paintCounts(n);
    paintChips();
    paintDropdownStates();
    if (updateURL !== false) writeURL();
    var empty = document.getElementById("empty-line");
    if (empty) empty.hidden = n !== 0;
  }

  function paintCounts(n) {
    var rc = document.getElementById("rcount");
    if (rc) rc.textContent = (rc.dataset.tpl || "{n}").replace("{n}", n);
    var mn = document.getElementById("f-mob-n");
    if (mn) mn.textContent = n;
    // per-option forward counts: ticking this option never produces a dead end
    var st = eff();
    for (var f in OPTION) {
      for (var v in OPTION[f]) {
        var o = OPTION[f][v], cntEl = o.querySelector(".n");
        var test = cloneState(st); test[f].add(v);
        var cnt = 0;
        cards.forEach(function (c) { if (matches(c, test)) cnt++; });
        if (cntEl) cntEl.textContent = cnt;
        o.classList.toggle("zero", cnt === 0);
      }
    }
  }
  function cloneState(st) {
    return { purpose: new Set(st.purpose), type: new Set(st.type), age: new Set(st.age),
             material: new Set(st.material), brand: new Set(st.brand), q: st.q };
  }

  function paintChips() {
    var box = document.getElementById("chips");
    if (!box) return;
    box.innerHTML = "";
    for (var f in URLKEY) {
      eff()[f].forEach(function (v) {
        var ch = document.createElement("span");
        ch.className = "chip" + (ghost ? " ghosty" : "");
        ch.innerHTML = "<b></b> <span></span> <button type='button' aria-label='×'>✕</button>";
        ch.querySelector("b").textContent = shortFacet(f);
        ch.querySelector("span").textContent = label(f, v);
        ch.querySelector("button").addEventListener("click", function () {
          if (ghost) { ghost[f].delete(v); if (similarEmpty()) exitSimilar(false); apply(); }
          else { state[f].delete(v); syncInputs(); apply(); }
        });
        box.appendChild(ch);
      });
    }
  }
  function shortFacet(f) {
    var btn = document.querySelector('.fdrop[data-facet="' + f + '"] .flab');
    return btn ? btn.textContent : f;
  }
  function paintDropdownStates() {
    document.querySelectorAll(".fdrop").forEach(function (d) {
      var f = d.dataset.facet, valEl = d.querySelector(".fval");
      var sel = Array.from(eff()[f]);
      valEl.textContent = sel.length ? sel.map(function (v) { return label(f, v); }).join(", ") : allTextOf(f);
      d.classList.toggle("on", sel.length > 0);
      // cascade: type options only make sense inside chosen purposes
      if (f === "type") {
        var ps = eff().purpose;
        d.querySelectorAll(".fopt").forEach(function (o) {
          var ok = !ps.size || o.dataset.p && ps.has(o.dataset.p);
          o.style.display = ok ? "" : "none";
        });
      }
    });
  }
  function allTextOf(f) {
    var b = document.querySelector('.fdrop[data-facet="' + f + '"] .fbtn');
    return b ? b.dataset.allText || (b.dataset.allText = b.querySelector(".fval").textContent) : "";
  }
  function syncInputs() {
    document.querySelectorAll(".fopt input").forEach(function (inp) {
      inp.checked = state[inp.dataset.f].has(inp.value);
    });
  }

  // ------------------------------------------------------------------ dropdowns
  document.querySelectorAll(".fdrop > .fbtn").forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      var d = b.parentElement, was = d.classList.contains("open");
      closeMenus();
      if (!was) { d.classList.add("open"); document.body.classList.add("f-open"); }
    });
  });
  function closeMenus() {
    document.querySelectorAll(".fdrop.open").forEach(function (d) { d.classList.remove("open"); });
    document.body.classList.remove("f-open");
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".fdrop")) closeMenus();
  });
  document.querySelectorAll(".fopt input").forEach(function (inp) {
    inp.addEventListener("change", function () {
      if (ghost) exitSimilar(true);
      var f = inp.dataset.f;
      inp.checked ? state[f].add(inp.value) : state[f].delete(inp.value);
      apply();
    });
  });
  var clearAll = document.getElementById("clear-all");
  if (clearAll) clearAll.addEventListener("click", function () {
    exitSimilar(false);
    for (var f in state) state[f] = (f === "q") ? "" : new Set();
    var s = document.getElementById("fsearch"); if (s) s.value = "";
    syncInputs(); apply();
  });

  // ------------------------------------------------------------------ search
  var fsearch = document.getElementById("fsearch");
  var fsug = document.getElementById("fsug");
  if (fsearch) {
    var deb;
    fsearch.addEventListener("input", function () {
      clearTimeout(deb);
      deb = setTimeout(function () {
        state.q = fsearch.value.trim(); apply();
        var q = fsearch.value.trim().toLowerCase();
        if (!q || !fsug) { if (fsug) fsug.hidden = true; return; }
        var hits = cards.filter(function (c) {
          return (c.tname + " " + c.name + " " + c.bname).toLowerCase().indexOf(q) !== -1;
        }).slice(0, 6);
        fsug.innerHTML = hits.map(function (c) {
          return '<a href="' + c.href + '"><span>' + c.tname + " · " + c.series + " " + c.model + "</span><small>" + c.bname + "</small></a>";
        }).join("") ;
        fsug.hidden = !hits.length;
      }, 140);
    });
    document.addEventListener("click", function (e) {
      if (fsug && !e.target.closest(".fsearch")) fsug.hidden = true;
    });
  }

  // ------------------------------------------------------------------ QUICK VIEW
  var qv = document.getElementById("qv");
  function openQV(c) {
    if (!qv) return;
    document.getElementById("qv-title").textContent = c.tname + " · " + c.series + " " + c.model;
    document.getElementById("qv-sub").textContent = c.bname;
    document.getElementById("qv-dims").textContent = c.dims;
    document.getElementById("qv-cap").textContent = c.cap;
    document.getElementById("qv-certs").textContent = c.certs.join(", ") || "—";
    document.getElementById("qv-mats").textContent = c.mats.map(function (m) { return label("material", m); }).join(", ");
    var open = document.getElementById("qv-open"); open.href = c.href;
    var add = document.getElementById("qv-add");
    add.onclick = function () { window.IC_CART.add(c.id); window.IC_TOAST(window.IC_I18N_ADDED || "✓"); };
    var art = document.getElementById("qv-art");
    var srcArt = c.el.querySelector(".part");
    art.style.cssText = srcArt.style.cssText;
    art.style.background = getComputedStyle(srcArt).background;
    art.style.color = getComputedStyle(srcArt).color;
    art.style.display = "grid"; art.style.placeItems = "center";
    art.innerHTML = srcArt.querySelector("svg").outerHTML;
    qv.hidden = false;
  }
  function closeQV() { if (qv) qv.hidden = true; }
  if (qv) {
    qv.addEventListener("click", function (e) { if (e.target === qv) closeQV(); });
    document.getElementById("qv-x").addEventListener("click", closeQV);
  }

  // ------------------------------------------------------------------ SMART SIMILAR MODE
  var simtip = document.getElementById("simtip");
  var banner = document.getElementById("similar-banner");
  var hoverT = null, dwellT = null, ringI = null, target = null;
  var DWELL = 650, PREVIEW = 160;

  function smartOn() {
    var t = document.getElementById("smart-toggle");
    return t ? t.checked : true;
  }
  function facetsOf(c) {
    return { purpose: new Set([c.purpose]), type: new Set([c.type]),
             age: new Set(), material: new Set(c.mats), brand: new Set([c.brand]), q: "" };
  }
  function similarCount(c) {
    var g = facetsOf(c), n = 0;
    cards.forEach(function (x) { if (matches(x, g)) n++; });
    return n;
  }
  function similarEmpty() {
    var g = ghost;
    return !(g.purpose.size || g.type.size || g.age.size || g.material.size || g.brand.size);
  }
  function enterSimilar(c) {
    if (!ghost) snapshot = cloneState(state);
    ghost = facetsOf(c);
    state = snapshot; // inputs stay on real state; grid on ghost
    if (banner) {
      banner.hidden = false;
      document.getElementById("sim-label").textContent =
        (banner.dataset.tpl || "⦿ «{name}»").replace("{name}", c.series + " " + c.model);
      var sc = document.getElementById("sim-chips");
      sc.innerHTML = "";
      ["purpose", "type", "material", "brand"].forEach(function (f) {
        ghost[f].forEach(function (v) {
          var s = document.createElement("span");
          s.className = "chip ghosty";
          s.textContent = shortFacet(f) + ": " + label(f, v);
          s.title = c.el.dataset.tname;
          sc.appendChild(s);
        });
      });
    }
    target = c;
    cards.forEach(function (x) { x.el.classList.remove("sim-anchor"); });
    c.el.classList.add("sim-anchor");
    apply();
  }
  function exitSimilar(restore) {
    if (!ghost) return;
    ghost = null;
    if (banner) banner.hidden = true;
    if (restore && snapshot) state = snapshot;
    snapshot = null;
    target = null;
    cards.forEach(function (x) { x.el.classList.remove("sim-anchor"); });
    syncInputs(); apply();
  }
  window.__icSimilarFromURL = function (id) {
    var c = cards.filter(function (x) { return x.id === id; })[0];
    if (c) enterSimilar(c);
  };

  // hover wiring (fine pointers only; touch uses the ⦿ button)
  var finePointer = window.matchMedia && window.matchMedia("(pointer:fine)").matches;
  function armHover(card) {
    var c = card;
    if (finePointer) {
      c.el.addEventListener("mouseenter", function (e) {
        if (!smartOn()) return;
        clearTimeout(hoverT); clearTimeout(dwellT);
        hoverT = setTimeout(function () { showTip(c, e); }, PREVIEW);
        dwellT = setTimeout(function () {
          hideTip();
          if (!ghost) enterSimilar(c);
          else if (target !== c) enterSimilar(c);
        }, DWELL);
      });
      c.el.addEventListener("mousemove", function (e) { posTip(e); });
      c.el.addEventListener("mouseleave", function () {
        clearTimeout(hoverT); clearTimeout(dwellT); hideTip();
      });
    }
    var simBtn = c.el.querySelector("[data-sim]");
    if (simBtn) simBtn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      if (onCatalog) enterSimilar(c);
      else window.location.href = catalogLink(c.id);
    });
    var qvBtn = c.el.querySelector("[data-qv]");
    if (qvBtn) qvBtn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation(); openQV(c);
    });
    var addBtn = c.el.querySelector("[data-add]");
    if (addBtn && !addBtn.dataset.addBound) {
      addBtn.dataset.addBound = "1";
      addBtn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        addBtn.dataset.addDone = "1";
        setTimeout(function () { delete addBtn.dataset.addDone; }, 400);
        window.IC_CART.add(c.id);
        addBtn.classList.add("in");
        window.IC_TOAST(window.IC_I18N_ADDED || "✓");
        setTimeout(function () { addBtn.classList.remove("in"); }, 900);
      });
    }
    // non-catalog grids (home featured): dwell navigates to catalog with ?similar=
    if (!onCatalog && finePointer) {
      c.el.addEventListener("mouseenter", function () {
        clearTimeout(dwellT);
        dwellT = setTimeout(function () { window.location.href = catalogLink(c.id); }, DWELL + 120);
      });
      c.el.addEventListener("mouseleave", function () { clearTimeout(dwellT); });
    }
  }
  function catalogLink(id) {
    var body = document.body;
    return body.dataset.base + body.dataset.lang + "/katalog/?similar=" + id;
  }

  // simtip
  var tipState = { pid: null };
  function showTip(c, e) {
    if (!simtip) return;
    var n = similarCount(c);
    simtip.dataset.pid = c.id;
    var tpl = simtip.dataset.tpl || "{n} similar — hold";
    simtip.innerHTML = "⦿ " + tpl.replace("{n}", "<b>" + n + "</b>") +
      '<span class="ring"><i></i></span>';
    simtip.hidden = false;
    posTip(e);
    var bar = simtip.querySelector(".ring i"), t0 = performance.now();
    cancelAnimationFrame(ringI);
    (function step(t) {
      if (simtip.hidden) return;
      var k = Math.min(1, (t - t0) / (DWELL - PREVIEW));
      bar.style.width = (k * 100) + "%";
      if (k < 1) ringI = requestAnimationFrame(step);
    })(t0);
  }
  function posTip(e) {
    if (!simtip || simtip.hidden) return;
    simtip.style.left = Math.min(window.innerWidth - 240, e.clientX) + "px";
    simtip.style.top = (e.clientY + 6) + "px";
  }
  function hideTip() { if (simtip) simtip.hidden = true; cancelAnimationFrame(ringI); }

  // banner buttons
  var pinBtn = document.getElementById("sim-pin");
  if (pinBtn) pinBtn.addEventListener("click", function () {
    if (!ghost) return;
    state = cloneState(ghost);
    exitSimilar(false);
    syncInputs(); apply();
  });
  var exitBtn = document.getElementById("sim-exit");
  if (exitBtn) exitBtn.addEventListener("click", function () { exitSimilar(true); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (ghost) exitSimilar(true);
      closeQV(); closeMenus();
      if (fsug) fsug.hidden = true;
    }
  });

  // smart toggle
  var st = document.getElementById("smart-toggle");
  if (st) {
    st.checked = (localStorage.getItem("ic_smart") || "1") === "1";
    st.addEventListener("change", function () {
      localStorage.setItem("ic_smart", st.checked ? "1" : "0");
      if (!st.checked && ghost) exitSimilar(true);
    });
  }

  // ------------------------------------------------------------------ boot
  var usp = readURL();
  syncInputs();
  cards.forEach(armHover);
  apply(false);
  var simId = usp.get("similar");
  if (simId) window.__icSimilarFromURL(simId);

  // mobile filter toggle button focuses first dropdown
  var ftm = document.getElementById("f-toggle-mob");
  if (ftm) ftm.addEventListener("click", function () {
    var first = document.querySelector(".fdrop");
    if (first) first.classList.add("open");
  });
})();
