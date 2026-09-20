/* live.js — "на живо" IRL strip: real photos from delivered projects,
   context-aware (follows the active division), click opens the project modal. */
window.ICL = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const T = k => (window.ICT ? ICT(k) : k);

  const CAT_KEYS = {
    play: /детск|площадк|игр[иа]\b.*детск|градин|дг\b|д\.г\.|детска|звън|къща|влакче/i,
    sport: /спорт|фитнес|игрище|пист|трева|корт|стадион|тренажор|мултифункционалн|skate|скейт/i,
    park: /парк|сквер|алея|отдих|градинск|квартал/i,
    flooring: /настилк|гараж|епоксид|декоратив|индустриал|подов|финиш|corkeen|корк/i,
  };
  function catOf(f) {
    const t = (f.t + " " + (f.loc || "")).toLowerCase();
    for (const c in CAT_KEYS) if (CAT_KEYS[c].test(t)) return c;
    return "play"; // facilities are play by default on this catalog
  }
  function contextFor(mode) {
    // mode: null|"none" -> all; "cat" -> current division first
    const facs = (IC_DATA.facilities || []).slice();
    const cat = IC.state.cat;
    if (!cat) return facs;
    return facs.sort((a, b) => (catOf(a) === cat ? 0 : 1) - (catOf(b) === cat ? 0 : 1));
  }

  let irlOn = false;
  function syncBtn() {
    const btn = $("#liveBtn");
    if (btn) btn.setAttribute("aria-pressed", String(IC.state.mode === "live"));
  }
  function bind() {
    const btn = $("#liveBtn");
    if (btn) btn.addEventListener("click", () => IC.setMode(IC.state.mode === "live" ? "catalog" : "live"));
    IC.on(() => syncBtn());
    syncBtn();
  }
  return { bind, contextFor, catOf };
})();
