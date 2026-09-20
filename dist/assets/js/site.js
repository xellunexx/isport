/* Infraconcept 2026 — universal site behaviors: nav, lang, cart badge, toast, reveal. */
(function () {
  "use strict";

  // ---- quote cart (localStorage)
  var CART_KEY = "ic_cart_v1";
  function readCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeCart(c) { localStorage.setItem(CART_KEY, JSON.stringify(c)); paintBadge(); }
  function cartCount() {
    var c = readCart(), n = 0;
    for (var k in c) n += c[k];
    return n;
  }
  function paintBadge() {
    var el = document.getElementById("cart-count");
    if (el) el.textContent = cartCount();
  }
  window.IC_CART = {
    add: function (id) {
      var c = readCart(); c[id] = (c[id] || 0) + 1; writeCart(c);
      return c[id];
    },
    set: function (id, q) {
      var c = readCart();
      if (q <= 0) delete c[id]; else c[id] = q;
      writeCart(c);
    },
    all: readCart,
    count: cartCount
  };

  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }
  window.IC_TOAST = toast;

  // ---- burger / lang dropdown
  function qs(s) { return document.querySelector(s); }
  var burger = qs("#burger");
  if (burger) burger.addEventListener("click", function () {
    document.body.classList.toggle("nav-open");
  });
  var langsw = qs("#langsw");
  if (langsw) {
    langsw.querySelector(".langbtn").addEventListener("click", function (e) {
      e.stopPropagation(); langsw.classList.toggle("open");
    });
    document.addEventListener("click", function () { langsw.classList.remove("open"); });
  }

  // ---- add-to-quote buttons (static pages: buttons carry real data-add ids)
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-add]");
    if (!btn) return;
    if (btn.dataset.addBound) return; // catalog.js bound this one eagerly
    if (btn.dataset.addDone) return;  // catalog.js handled this click already
    btn.dataset.addDone = "1";
    setTimeout(function () { delete btn.dataset.addDone; }, 400);
    IC_CART.add(btn.dataset.add);
    btn.classList.add("in");
    var lbl = document.querySelector("html").lang;
    toast((window.IC_I18N_ADDED) || "Добавено към офертата ✓");
    setTimeout(function () { btn.classList.remove("in"); }, 900);
  });

  // ---- reveal on scroll
  var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -8% 0px" }) : null;
  function armReveal() {
    if (!io) return;
    document.querySelectorAll("section.wrap, .soltile, .brandcard, .prj, .srvcard, .seccard").forEach(function (el) {
      el.classList.add("rv"); io.observe(el);
    });
  }
  armReveal();

  // ---- contact form -> mailto
  window.icContact = function (ev) {
    ev.preventDefault();
    var f = ev.target;
    var body = encodeURIComponent(f.msg.value + "\n\n— " + f.name.value + " <" + f.email.value + ">");
    location.href = "mailto:office@infraconcept.bg?subject=" +
      encodeURIComponent("[site] " + f.name.value) + "&body=" + body;
    var ok = f.querySelector(".ok"); if (ok) ok.hidden = false;
    return false;
  };

  paintBadge();
})();
