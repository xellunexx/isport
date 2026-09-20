/* admin.js — appearance & behavior panel (persisted per device).
   Theme presets (light default / dark), custom colors, hover-dwell time, card density,
   hero particles. Applies via CSS variables — everything (filters, catalog, cards) follows. */
window.ICA = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const T = k => (window.ICT ? ICT(k) : k);

  const DEFAULTS = { theme: "light", cbg: "", cpanel: "", cink: "", cacc: "", particles: true, dwell: 3.0, cardw: 215, heroSub: "",
    llmBase: "", llmModel: "qwen" };
  let prefs = { ...DEFAULTS };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem("ic-admin") || "{}")); } catch (e) {}

  function save() { try { localStorage.setItem("ic-admin", JSON.stringify(prefs)); } catch (e) {} }

  function apply() {
    const html = document.documentElement;
    html.dataset.theme = prefs.theme === "custom" ? "light" : prefs.theme; // custom overrides the light base
    const vars = { "--bg": prefs.cbg, "--panel": prefs.cpanel, "--ink": prefs.cink, "--acc": prefs.cacc };
    const keyOf = { "--bg": "cbg", "--panel": "cpanel", "--ink": "cink", "--acc": "cacc" };
    for (const [k, v] of Object.entries(vars)) {
      if (prefs[keyOf[k]]) html.style.setProperty(k, v);
      else html.style.removeProperty(k);
    }
    html.style.setProperty("--cardw", prefs.cardw + "px");
    if (window.__heroCtl) window.__heroCtl.setParticles(prefs.particles);
    if (window.ICH && ICH.setTimings) ICH.setTimings(700, prefs.dwell * 1000);
    const hs = $("#heroSub");
    if (hs) hs.textContent = prefs.heroSub || (window.ICT ? ICT("promise_sub") : hs.textContent);
  }

  function render() {
    const el = $("#adminBody");
    el.innerHTML = `
      <div class="adm-sec"><h4>${esc(T("admin_theme"))}</h4>
        <div class="adm-seg" id="admTheme">
          <button data-th="light" class="${prefs.theme === "light" ? "on" : ""}">${esc(T("admin_light"))}</button>
          <button data-th="dark" class="${prefs.theme === "dark" ? "on" : ""}">${esc(T("admin_dark"))}</button>
          <button data-th="custom" class="${prefs.theme === "custom" ? "on" : ""}">${esc(T("admin_custom"))}</button>
        </div>
        <div id="admColors">
          <div class="adm-row"><span>${esc(T("admin_bg"))}</span><input type="color" id="cbg" value="${prefs.cbg || "#f2efe7"}"></div>
          <div class="adm-row"><span>${esc(T("admin_panel"))}</span><input type="color" id="cpanel" value="${prefs.cpanel || "#ffffff"}"></div>
          <div class="adm-row"><span>${esc(T("admin_ink"))}</span><input type="color" id="cink" value="${prefs.cink || "#22241d"}"></div>
          <div class="adm-row"><span>${esc(T("admin_acc"))}</span><input type="color" id="cacc" value="${prefs.cacc || "#f05e0e"}"></div>
        </div>
      </div>
      <div class="adm-sec"><h4>${esc(T("admin_t"))}</h4>
        <div class="adm-row"><span>${esc(T("admin_particles"))}</span><input type="checkbox" id="cparticles" ${prefs.particles ? "checked" : ""}></div>
        <div class="adm-row"><span>${esc(T("admin_dwell"))}</span><input type="range" id="cdwell" min="0.5" max="4" step="0.1" value="${prefs.dwell}"><b>${Number(prefs.dwell).toFixed(1)}s</b></div>
        <div class="adm-row"><span>${esc(T("admin_density"))}</span><input type="range" id="ccardw" min="170" max="300" step="5" value="${prefs.cardw}"><b>${prefs.cardw}px</b></div>
      </div>
      <div class="adm-sec"><h4>${esc(T("asst_admin"))}</h4>
        <div class="adm-row" style="flex-direction:column;align-items:stretch;gap:.4rem">
          <span>${esc(T("admin_llm_base"))}</span>
          <input id="cllmbase" type="url" value="${esc(prefs.llmBase || "")}" placeholder="http://127.0.0.1:10000/v1"
            style="background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:9px;padding:.45rem .6rem;font:inherit">
          <span>${esc(T("admin_llm_model"))}</span>
          <input id="cllmmodel" value="${esc(prefs.llmModel || "qwen")}"
            style="background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:9px;padding:.45rem .6rem;font:inherit">
          <button class="btn ghost" id="cllmtest" style="font-size:.78rem;padding:.45rem 1rem;align-self:flex-start">${esc(T("admin_llm_test"))}</button>
          <span class="adm-note" id="cllmstat"></span>
        </div>
      </div>
      <div class="adm-sec"><h4>${esc(T("admin_content"))}</h4>
        <div class="adm-row" style="flex-direction:column;align-items:stretch;gap:.4rem">
          <span>${esc(T("admin_herosub"))}</span>
          <textarea id="cherosub" rows="2" style="background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:9px;padding:.45rem .6rem;font:inherit">${esc(prefs.heroSub || "")}</textarea>
          <div style="display:flex;gap:.5rem"><button class="btn ghost" id="cheroapply" style="font-size:.78rem;padding:.45rem 1rem">${esc(T("admin_apply"))}</button></div>
        </div>
      </div>
      <button class="btn ghost" id="admReset">${esc(T("admin_reset"))}</button>
      <p class="adm-note">${esc(T("admin_note"))}</p>`;
    bindPanel();
  }

  function bindPanel() {
    $("#admTheme").addEventListener("click", e => {
      const b = e.target.closest("[data-th]"); if (!b) return;
      prefs.theme = b.dataset.th;
      if (prefs.theme !== "custom") { prefs.cbg = prefs.cpanel = prefs.cink = prefs.cacc = ""; }
      save(); apply(); render();
    });
    for (const id of ["cbg", "cpanel", "cink", "cacc"]) {
      const inp = document.getElementById(id);
      if (!inp) continue;
      inp.addEventListener("input", () => {
        prefs.theme = "custom"; prefs[id] = inp.value; save(); apply();
        document.querySelectorAll("#admTheme button").forEach(b => b.classList.toggle("on", b.dataset.th === "custom"));
      });
    }
    const pc = document.getElementById("cparticles");
    if (pc) pc.addEventListener("change", () => { prefs.particles = pc.checked; save(); apply(); });
    const dw = document.getElementById("cdwell");
    if (dw) dw.addEventListener("input", () => { prefs.dwell = parseFloat(dw.value); dw.nextElementSibling.textContent = parseFloat(dw.value).toFixed(1) + "s"; save(); apply(); });
    const cw = document.getElementById("ccardw");
    if (cw) cw.addEventListener("input", () => { prefs.cardw = parseInt(cw.value, 10); cw.nextElementSibling.textContent = cw.value + "px"; save(); apply(); });
    const rst = document.getElementById("admReset");
    if (rst) rst.addEventListener("click", () => { prefs = { ...DEFAULTS }; save(); apply(); render(); });
    const ha = document.getElementById("cheroapply"), hs2 = document.getElementById("cherosub");
    if (ha && hs2) ha.addEventListener("click", () => { prefs.heroSub = hs2.value.trim(); save(); apply(); render(); });
    const lb = document.getElementById("cllmbase"), lm = document.getElementById("cllmmodel");
    const syncLlm = () => { if (lb) prefs.llmBase = lb.value.trim(); if (lm) prefs.llmModel = lm.value.trim() || "qwen"; save(); };
    if (lb) lb.addEventListener("change", syncLlm);
    if (lm) lm.addEventListener("change", syncLlm);
    const lt = document.getElementById("cllmtest");
    if (lt) lt.addEventListener("click", async () => {
      const st = document.getElementById("cllmstat");
      syncLlm();
      if (st) st.textContent = "…";
      try {
        const r = await fetch("/api/llm-status?base=" + encodeURIComponent(prefs.llmBase || ""), { cache: "no-store" });
        const d = await r.json();
        if (st) st.textContent = d.online ? ("✓ online: " + (d.base || "default")) : ("× " + T("admin_llm_off"));
      } catch { if (st) st.textContent = "× " + T("admin_llm_off"); }
    });
  }

  function openPanel() { $("#admin").hidden = false; document.body.style.overflow = "hidden"; }
  function closePanel() { $("#admin").hidden = true; document.body.style.overflow = ""; }
  function bind() {
    const btn = $("#adminBtn");
    if (btn) btn.addEventListener("click", () => { render(); openPanel(); });
    $("#admin").addEventListener("click", e => { if (e.target.closest("[data-close]")) closePanel(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#admin").hidden) closePanel(); });
    apply();
  }
  return { bind, apply, prefs, closePanel };
})();
