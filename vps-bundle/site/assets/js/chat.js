/* chat.js — Площадко, the assistant. LLM-first with canned-truth fallback.
   Offline fallback still answers FAQs deterministically; never fakes availability. */
window.ICC = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const T = k => (window.ICT ? ICT(k) : k);
  const A = window.IC_ASSIST;

  let online = null, busy = false;
  const history = []; // transcript

  function addMsg(who, text, chips) {
    const box = $("#chatMsgs");
    const div = document.createElement("div");
    div.className = "cm " + who;
    div.innerHTML = `<div class="cm-b">${text}</div>`;
    if (chips && chips.length) {
      const row = document.createElement("div");
      row.className = "cm-chips";
      chips.forEach(ch => {
        const b = document.createElement("button");
        b.className = "chip";
        b.textContent = ch.label;
        b.onclick = ch.on;
        row.appendChild(b);
      });
      div.appendChild(row);
    }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function canned(q) {
    const ql = " " + q.toLowerCase().replace(/[.,!?;:]/g, " ") + " ";
    let best = null, bestScore = 0.5; // must beat threshold
    for (const f of A.faq) {
      for (const pat of f.q.split("|")) {
        const toks = pat.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        if (!toks.length) continue;
        const hit = toks.filter(t => ql.includes(t)).length / toks.length;
        if (hit > bestScore) { bestScore = hit; best = f; }
      }
    }
    if (best) {
      const chips = best.link ? [{
        label: T("menu_catalog") + " →",
        on: () => { applyLink(best.link); closeChat(); },
      }] : undefined;
      return { text: esc(best.a), chips };
    }
    return null;
  }
  function applyLink(link) {
    const walk = window.__navJumping !== undefined;
    if (link.rec) {
      const PERSONAS_applied = link.rec;
      IC.applyPreset({ cat: link.cat, slug: PERSONAS_applied, labelKey: "au_" + PERSONAS_applied.replace("detski-gradini", "detski") });
    }
    if (link.cat && !link.rec) IC.applyPreset({ cat: link.cat });
    if (link.purp) IC.toggle("purp", link.purp);
    IC.setMode("catalog");
    const g = document.getElementById("grid");
    if (g) window.scrollTo(0, g.getBoundingClientRect().top + window.scrollY - 300);
  }

  async function ask(q) {
    addMsg("me", esc(q));
    $("#chatInput").value = "";
    busy = true; paintSend();
    try {
      const prefs = (window.ICA && ICA.prefs) || {};
      const base = prefs.llmBase || "";
      const model = prefs.llmModel || "qwen";
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base: base || undefined, model,
          messages: [
            { role: "system", content: A.persona + "\nФАКТИ:\n" + A.faq.map(f => "- " + f.a).join("\n") },
            ...history.slice(-8).map(h => ({ role: h.who === "me" ? "user" : "assistant", content: h.text.replace(/<[^>]+>/g, "") })),
            { role: "user", content: q },
          ],
        }),
      });
      const data = await r.json();
      const txt = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
      if (r.ok && txt.trim()) {
        llmMark(true);
        addMsg("it", esc(txt.trim()));
        history.push({ who: "me", text: q }, { who: "it", text: txt });
        return;
      }
      throw new Error("offline or empty");
    } catch (e) {
      llmMark(false);
      const c = canned(q);
      if (c) { addMsg("it", c.text, c.chips); history.push({ who: "me", text: q }, { who: "it", text: c.text }); }
      else addMsg("it", esc(A.noIdea) + ` <i>${esc(A.offlineNote)}</i>`);
    } finally {
      busy = false; paintSend();
    }
  }
  function paintSend() { $("#chatSend").disabled = busy; }

  function llmMark(on) {
    online = on;
    const el = $("#chatStatus");
    el.textContent = on ? " · LLM онлайн" : " · вградени отговори";
    el.classList.toggle("on", !!on);
  }

  function openChat() {
    renderQuick();
    $("#chat").hidden = false; document.body.style.overflow = "hidden";
    if (!$("#chatMsgs").children.length) {
      addMsg("it", esc(T("asst_greet")).replace("{name}", A.name));
      // probe status once on open
      refreshStatus();
    }
    setTimeout(() => $("#chatInput").focus(), 220);
  }
  function closeChat() { $("#chat").hidden = true; document.body.style.overflow = ""; }

  async function refreshStatus() {
    const base = (window.ICA && ICA.prefs.llmBase) || "";
    try {
      const r = await fetch("/api/llm-status?base=" + encodeURIComponent(base), { cache: "no-store" });
      const d = await r.json();
      llmMark(!!d.online);
    } catch { llmMark(false); }
  }

  function renderQuick() {
    const qc = $("#chatQuick");
    qc.innerHTML = "";
    for (const item of A.quick) {
      const b = document.createElement("button");
      b.className = "chip"; b.textContent = item.t;
      b.onclick = () => { ask(item.q); if (item.link) applyLink(item.link); };
      qc.appendChild(b);
    }
  }

  function bind() {
    const btn = $("#chatBtn"); if (btn) btn.addEventListener("click", openChat);
    $("#chat").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeChat(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#chat").hidden) closeChat(); });
    $("#chatForm").addEventListener("submit", e => { e.preventDefault(); const v = $("#chatInput").value.trim(); if (v && !busy) ask(v); });
  }
  return { bind, openChat };
})();
