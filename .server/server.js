/* Hardened static origin for the catalog app (P0).
   - keep-alive, concurrent streaming (event loop)
   - correct MIME (webp, woff2, svg, avif, webmanifest...)
   - gzip for text payloads (html/css/js/json)
   - Cache-Control: immutable-ish for heavy assets (max-age=86400), no-cache for html
   - ETag (mtime+size) with 304
   - path traversal guard, no directory listing outside webroot, index.html for "/"
   - request log -> logs/origin.log (rotating by size read: simple append)
*/
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "webroot");
const PORT = process.env.IC_PORT ? parseInt(process.env.IC_PORT, 10) : 8043;
const HOST = "127.0.0.1";
const LOG = path.join(__dirname, "logs", "origin.log");
const FEEDBACK_DIR = path.join(__dirname, "feedback");
const FEEDBACK_FILE = path.join(FEEDBACK_DIR, "messages.jsonl");
const OPERATOR_TOKEN_FILE = path.join(FEEDBACK_DIR, "operator-token.txt");
const FEEDBACK_MAX_BYTES = 2 * 1024 * 1024;

function operatorToken() {
  fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  try { return fs.readFileSync(OPERATOR_TOKEN_FILE, "utf8").trim(); } catch (_) {}
  const token = crypto.randomBytes(24).toString("base64url");
  fs.writeFileSync(OPERATOR_TOKEN_FILE, token + "\n", { encoding: "utf8", mode: 0o600 });
  return token;
}
const OPERATOR_TOKEN = operatorToken();

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
  return true;
}

function readFeedback() {
  try {
    const records = fs.readFileSync(FEEDBACK_FILE, "utf8").trim().split("\n")
      .filter(Boolean).map(line => { try { return JSON.parse(line); } catch (_) { return null; } }).filter(Boolean);
    const messages = records.filter(item => item.message && item.id);
    for (const item of records.filter(item => item.type === "attendance" && item.id)) {
      const message = messages.find(entry => entry.id === item.id);
      if (message) { message.status = "attended"; message.attendedAt = item.attendedAt; }
    }
    return messages;
  } catch (_) { return []; }
}

function writeFeedback(record) {
  fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(record) + "\n", "utf8");
  try {
    if (fs.statSync(FEEDBACK_FILE).size > FEEDBACK_MAX_BYTES) {
      fs.renameSync(FEEDBACK_FILE, FEEDBACK_FILE + ".1");
    }
  } catch (_) {}
}

function operatorHtml(key) {
  const safeKey = JSON.stringify(key);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Infraconcept · live inbox</title><style>body{margin:0;background:#101720;color:#edf2f7;font:15px system-ui,sans-serif}.bar{padding:18px 24px;background:#172332;position:sticky;top:0}.bar b{font-size:18px}.sub{color:#9db0c3;margin-top:4px}.wrap{max-width:900px;margin:22px auto;padding:0 18px}.item{padding:18px;margin:12px 0;background:#172332;border:1px solid #294158;border-radius:12px}.meta{color:#9db0c3;font-size:13px;margin-bottom:8px}.msg{white-space:pre-wrap;font-size:17px;line-height:1.45}.attended{opacity:.62}.attend{margin-top:12px;background:#7ae0b4;color:#10211a;border:0;border-radius:7px;padding:8px 12px;font-weight:700;cursor:pointer}</style><body><div class="bar"><b>Infraconcept · live visitor inbox</b><div class="sub" id="state">Connecting…</div></div><main class="wrap" id="list"></main><script>const key=${safeKey};let messages=[];const esc=s=>String(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));async function load(){try{const r=await fetch('/api/operator/feedback?key='+encodeURIComponent(key),{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);messages=d.messages||[];render();document.querySelector('#state').textContent='Live · '+messages.filter(x=>x.status!=='attended').length+' waiting';}catch(e){document.querySelector('#state').textContent='Inbox error: '+e.message}}function render(){const list=document.querySelector('#list');list.innerHTML=messages.length?messages.slice().reverse().map(x=>'<article class="item '+(x.status==='attended'?'attended':'')+'"><div class="meta">'+esc(x.createdAt)+' · '+esc(x.name||'Anonymous')+(x.email?' · '+esc(x.email):'')+' · '+esc(x.page)+'</div><div class="msg">'+esc(x.message)+'</div>'+(x.status==='attended'?'<div class="meta">Attended '+esc(x.attendedAt)+'</div>':'<button class="attend" data-id="'+esc(x.id)+'">Mark attended</button>')+'</article>').join(''):'<p>No visitor messages yet.</p>';list.querySelectorAll('.attend').forEach(b=>b.onclick=async()=>{await fetch('/api/operator/feedback?key='+encodeURIComponent(key),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:b.dataset.id})});load();});}load();setInterval(load,2000);</script></body></html>`;
}

// old-site URL -> new route 301 map (generated by tools/seo_build.py -> webroot/redirects.json)
let REDIRECTS = {};
try { REDIRECTS = JSON.parse(fs.readFileSync(path.join(ROOT, "redirects.json"), "utf8")); } catch (e) {}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".ico": "image/x-icon", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8",
  ".map": "application/json", ".webmanifest": "application/manifest+json",
};
const GZIP_OK = new Set([".html", ".js", ".css", ".json", ".svg", ".txt", ".map"]);
const CACHE_MS = { long: 86400, short: 300 };

// ---- LLM sidecar (Ploshtadko assistant): OpenAI-compatible proxy, localhost target by default.
// Client -> POST /api/chat {messages:[...], base?, model?}  -> forwarded to {base}/chat/completions.
// No secrets are stored here; the base URL travels per-request from the admin panel's saved prefs.
const LLM_DEFAULT = process.env.LLM_BASE || "http://127.0.0.1:10000/v1";
const LLM_MODEL = process.env.LLM_MODEL || "qwen";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "", size = 0;
    req.on("data", c => { size += c.length; if (size > 64 * 1024) { req.destroy(); reject(new Error("too big")); } else b += c; });
    req.on("end", () => resolve(b));
    req.on("error", reject);
  });
}
function postJson(url, payload, timeoutMs) {
  const data = Buffer.from(payload, "utf8");
  const { hostname, port, pathname, protocol } = new URL(url);
  const lib = protocol === "https:" ? require("https") : require("http");
  return new Promise(resolve => {
    const q = lib.request({
      host: hostname, port: port || (protocol === "https:" ? 443 : 80), path: pathname,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length, "Accept": "application/json" },
      timeout: timeoutMs,
    }, r => {
      let bb = "";
      r.on("data", c => bb += c);
      r.on("end", () => resolve({ status: r.statusCode, body: bb }));
    });
    q.on("timeout", () => { q.destroy(); resolve({ status: 504, body: '{"error":"llm timeout"}' }); });
    q.on("error", e => resolve({ status: 502, body: JSON.stringify({ error: String(e).slice(0, 120) }) }));
    q.end(data);
  });
}
function getJson(url, timeoutMs) {
  const { hostname, port, pathname, protocol } = new URL(url);
  const lib = protocol === "https:" ? require("https") : require("http");
  return new Promise(resolve => {
    const q = lib.get({ host: hostname, port: port || (protocol === "https:" ? 443 : 80), path: pathname, timeout: timeoutMs }, r => {
      let bb = ""; r.on("data", c => bb += c); r.on("end", () => resolve({ status: r.statusCode, body: bb }));
    });
    q.on("timeout", () => { q.destroy(); resolve({ status: 504, body: '{}' }); });
    q.on("error", e => resolve({ status: 502, body: JSON.stringify({ error: String(e).slice(0, 120) }) }));
  });
}
async function handleLlm(req, res, u) {
  if (req.method === "POST" && u === "/api/feedback") {
    const body = await readBody(req).catch(() => null);
    if (!body) { return json(res, 413, { ok: false, error: "Message is too large." }); }
    let input;
    try { input = JSON.parse(body); } catch (_) { return json(res, 400, { ok: false, error: "Invalid message." }); }
    const message = String(input.message || "").trim();
    const name = String(input.name || "").trim().slice(0, 120);
    const email = String(input.email || "").trim().slice(0, 160);
    const rawContext = input.context && typeof input.context === "object" ? input.context : {};
    const context = {
      section: String(rawContext.section || "").trim().slice(0, 180),
      label: String(rawContext.label || "").trim().slice(0, 240),
      locator: String(rawContext.locator || "").trim().slice(0, 320),
      x: Number.isFinite(Number(rawContext.x)) ? Math.max(0, Math.min(100000, Number(rawContext.x))) : null,
      y: Number.isFinite(Number(rawContext.y)) ? Math.max(0, Math.min(100000, Number(rawContext.y))) : null,
    };
    if (!message || message.length > 2000) {
      return json(res, 400, { ok: false, error: "Please enter a message up to 2,000 characters." });
    }
    const contextLines = [
      context.section && `Section: ${context.section}`,
      context.label && `Element: ${context.label}`,
      context.locator && `Locator: ${context.locator}`,
      context.x !== null && context.y !== null && `Pointer: ${context.x}, ${context.y}`,
    ].filter(Boolean);
    const displayMessage = contextLines.length ? `${message}\n\n[Visitor context]\n${contextLines.join("\n")}` : message;
    const record = {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: "new",
      name, email, message: displayMessage, page: String(input.page || "/").slice(0, 300), context,
    };
    writeFeedback(record);
    log(`feedback ${record.id} ${record.message.length}`);
    return json(res, 201, { ok: true, id: record.id });
  }
  if (u === "/api/operator/feedback") {
    const query = new URL(req.url, "http://local").searchParams;
    if (query.get("key") !== OPERATOR_TOKEN) { return json(res, 403, { ok: false, error: "Operator access required." }); }
    if (req.method === "GET") {
      const after = query.get("after") || "";
      const messages = readFeedback().filter(item => !after || item.createdAt > after).slice(-200);
      return json(res, 200, { ok: true, messages });
    }
    if (req.method === "POST") {
      const body = await readBody(req).catch(() => null);
      let input; try { input = JSON.parse(body || ""); } catch (_) { return json(res, 400, { ok: false, error: "Invalid update." }); }
      const id = String(input.id || "");
      const records = readFeedback();
      const record = records.find(item => item.id === id);
      if (!record) { return json(res, 404, { ok: false, error: "Message not found." }); }
      record.status = "attended"; record.attendedAt = new Date().toISOString();
      writeFeedback({ type: "attendance", id, attendedAt: record.attendedAt });
      return json(res, 200, { ok: true, id });
    }
  }
  if (req.method === "GET" && u.startsWith("/api/llm-status")) {
    const base = new URL(req.url, "http://x").searchParams.get("base") || LLM_DEFAULT;
    const r = await getJson(base.replace(/\/$/, "") + "/models", 4000);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ online: r.status === 200, base, status: r.status }));
    return true;
  }
  if (req.method === "POST" && u.startsWith("/api/chat")) {
    const body = await readBody(req).catch(() => null);
    if (!body) { res.writeHead(413); res.end('{"error":"too big"}'); return true; }
    let payload;
    try { payload = JSON.parse(body); } catch { res.writeHead(400); res.end('{"error":"bad json"}'); return true; }
    const base = (payload.base || LLM_DEFAULT).replace(/\/$/, "");
    const model = payload.model || LLM_MODEL;
    if (!/^(https?:\/\/)?[a-z0-9.:@-]+(\/[\w./-]*)*$/i.test(base.split("/").slice(0, 3).join("/"))) { // origin sanity
      res.writeHead(400, { "Content-Type": "application/json" }); res.end('{"error":"bad base"}'); return true;
    }
    const up = await postJson(base + "/chat/completions",
      JSON.stringify({ model, messages: payload.messages, temperature: payload.temperature ?? 0.7,
        max_tokens: payload.max_tokens ?? 800, top_p: payload.top_p ?? 0.9 }),
      Math.min(Number(payload.timeout_ms) || 120000, 150000)); // local models on CPU can be slow
    res.writeHead(up.status, { "Content-Type": "application/json" });
    res.end(up.body);
    return true;
  }
  return false;
}

function log(line) {
  try { fs.appendFileSync(LOG, new Date().toISOString() + " " + line + "\n"); } catch (e) {}
}

const server = http.createServer({ keepAliveTimeout: 30000 }, (req, res) => {
  let u = decodeURIComponent(req.url.split("?")[0]);
  if (u.includes("..") || u.includes("\0")) { res.writeHead(403); res.end("403"); return; }
  if (u === "/__operator") {
    const key = new URL(req.url, "http://local").searchParams.get("key");
    if (key !== OPERATOR_TOKEN) { res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Operator access required."); return; }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(operatorHtml(key));
    return;
  }
  // LLM sidecar endpoints first (they're not files)
  if (u.startsWith("/api/")) {
    handleLlm(req, res, u).then(handled => { if (!handled) { res.writeHead(404); res.end('{"error":"not found"}'); } })
      .catch(e => { res.writeHead(500); res.end('{"error":"server"}'); log("api err " + e); });
    return;
  }
  if (REDIRECTS[u]) { res.writeHead(301, { Location: REDIRECTS[u] }); res.end(); log(`301 ${u} -> ${REDIRECTS[u]}`); return; }
  let fp = path.join(ROOT, u);
  if (u.endsWith("/")) fp = path.join(fp, "index.html");
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) {
      // no directory listing; clean 404
      log(`404 ${u}`);
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404");
      return;
    }
    const ext = path.extname(fp).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
    if (req.headers["if-none-match"] === etag) { res.writeHead(304); res.end(); return; }
    const isText = GZIP_OK.has(ext);
    const cacheable = /^\/(img|assets|data)\//.test(u) && !/index\.html$/.test(u);
    const headers = {
      "Content-Type": type,
      "ETag": etag,
      "Cache-Control": isText && ext === ".html" ? "no-cache" : `public, max-age=${cacheable ? CACHE_MS.long : CACHE_MS.short}`,
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
    };
    const acceptsGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
    if (isText && acceptsGzip && st.size > 1400) {
      headers["Content-Encoding"] = "gzip";
      res.writeHead(200, headers);
      fs.createReadStream(fp).pipe(zlib.createGzip({ level: 6 })).pipe(res);
    } else {
      headers["Content-Length"] = st.size;
      res.writeHead(200, headers);
      fs.createReadStream(fp).pipe(res);
    }
    log(`${res.statusCode} ${u} ${st.size}`);
  });
});

server.keepAliveTimeout = 30000;
server.headersTimeout = 35000;
server.listen(PORT, HOST, () => log(`origin up http://${HOST}:${PORT} root=${ROOT}`));
