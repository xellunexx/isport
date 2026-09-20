/* Explicit visitor-to-local-team messaging. No silent interaction capture. */
(() => {
  const style = document.createElement("style");
  style.textContent = ".ic-feedback{position:fixed;right:18px;bottom:18px;z-index:80;border:0;border-radius:999px;padding:12px 16px;background:#f4b740;color:#17212b;font:700 14px system-ui;box-shadow:0 8px 28px #0005;cursor:pointer}.ic-feedback-modal{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:#08111acc;padding:16px}.ic-feedback-card{width:min(460px,100%);background:#fff;color:#17212b;border-radius:16px;padding:22px;box-shadow:0 16px 55px #0008}.ic-feedback-card h2{margin:0 0 8px}.ic-feedback-card p{margin:0 0 16px;color:#536474}.ic-feedback-card label{display:block;margin:10px 0 4px;font-weight:700}.ic-feedback-card input,.ic-feedback-card textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid #bcc9d5;border-radius:8px;font:inherit}.ic-feedback-card textarea{min-height:120px;resize:vertical}.ic-feedback-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.ic-feedback-actions button{border:0;border-radius:8px;padding:10px 14px;font:700 14px system-ui;cursor:pointer}.ic-feedback-cancel{background:#e9eef2}.ic-feedback-send{background:#172b44;color:#fff}.ic-feedback-note{min-height:20px;margin-top:10px;color:#246646;font-weight:600}";
  document.head.appendChild(style);
  const button = document.createElement("button"); button.className = "ic-feedback"; button.type = "button"; button.textContent = "Message the local team"; document.body.appendChild(button);
  function close() { document.querySelector(".ic-feedback-modal")?.remove(); }
  function describeTarget(target, event) {
    const el = target.closest("button,a,input,select,textarea,[role],article,section,main,header,footer") || target;
    const area = el.closest("section,main,header,footer,[id]") || document.body;
    const heading = area.querySelector("h1,h2,h3,[role=heading]");
    const classes = Array.from(el.classList || []).slice(0, 3).map(name => "." + name).join("");
    return {
      section: (heading?.textContent || area.getAttribute("aria-label") || area.id || area.tagName).trim().slice(0, 180),
      label: (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.name || el.tagName).trim().replace(/\s+/g, " ").slice(0, 240),
      locator: (el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + classes).slice(0, 320),
      x: Math.round(event.clientX + window.scrollX), y: Math.round(event.clientY + window.scrollY),
    };
  }
  function open(context) {
    const modal = document.createElement("div"); modal.className = "ic-feedback-modal";
    const where = context?.section ? `<p><b>Referring to:</b> ${context.section}</p>` : "";
    modal.innerHTML = `<form class="ic-feedback-card"><h2>Message the local team</h2>${where}<p>Your message is delivered to the local Infraconcept inbox. Include contact details only if you want a reply.</p><label>Name <small>(optional)</small><input name="name" maxlength="120" autocomplete="name"></label><label>Email <small>(optional)</small><input name="email" maxlength="160" type="email" autocomplete="email"></label><label>Message <textarea name="message" maxlength="2000" required></textarea></label><div class="ic-feedback-note" aria-live="polite"></div><div class="ic-feedback-actions"><button class="ic-feedback-cancel" type="button">Cancel</button><button class="ic-feedback-send" type="submit">Send message</button></div></form>`;
    document.body.appendChild(modal); modal.querySelector("textarea").focus();
    modal.addEventListener("click", event => { if (event.target === modal || event.target.closest(".ic-feedback-cancel")) close(); });
    modal.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault(); const form = event.currentTarget; const note = form.querySelector(".ic-feedback-note"); const send = form.querySelector(".ic-feedback-send"); const payload = { name: form.name.value.trim(), email: form.email.value.trim(), message: form.message.value.trim(), page: location.pathname + location.hash, context };
      send.disabled = true; note.textContent = "Sending…";
      try { const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok || !data.ok) throw Error(data.error || "Could not send message."); note.textContent = "Message sent to the local team."; form.reset(); setTimeout(close, 1300); } catch (error) { note.textContent = error.message || "Could not send message."; send.disabled = false; }
    });
  }
  button.addEventListener("click", () => open(null));
  document.addEventListener("contextmenu", event => { if (event.target.closest(".ic-feedback-modal")) return; event.preventDefault(); open(describeTarget(event.target, event)); }, true);
})();
