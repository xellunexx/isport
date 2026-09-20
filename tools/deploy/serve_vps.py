#!/usr/bin/env python3
"""Инфра Концепт live catalog — production static origin on pure Python stdlib.

Same contract as the dev Node origin (.server/server.js):
  - gzip for text payloads (html/css/js/json/svg)
  - ETag (mtime+size) + If-None-Match 304
  - Cache-Control: no-cache for HTML, long cache for /assets /data /img
  - correct MIME incl. webp + woff2
  - path-traversal guard, no directory listing
  - 301 redirects from site/redirects.json
  - request log to logs/serve.log

Usage:
  python3 serve_vps.py [--host 0.0.0.0] [--port 8000] [--root ./site]

No third-party packages required. Python >= 3.9.
"""
import argparse, gzip, io, json, mimetypes, os, posixpath, sys, threading, time, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MIME = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif",
    ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
    ".ico": "image/x-icon", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8", ".map": "application/json",
}
GZIP_EXT = {".html", ".js", ".css", ".json", ".svg", ".txt", ".map", ".xml"}

mimetypes.init()
for ext, mt in MIME.items():
    mimetypes.add_type(mt, ext)

def build(root):
    root = os.path.abspath(root)
    redirects = {}
    rp = os.path.join(root, "redirects.json")
    if os.path.exists(rp):
        redirects = json.load(open(rp, encoding="utf-8"))
    os.makedirs(os.path.join(root, "logs"), exist_ok=True)
    logf = open(os.path.join(root, "logs", "serve.log"), "a", encoding="utf-8", buffering=1)

    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "InfraconceptVPS/1.0"

        def log_message(self, fmt, *args):
            try:
                logf.write(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {self.client_address[0]} {fmt % args}\n")
            except Exception:
                pass

        def _safe(self, u):
            raw = urllib.parse.unquote(urllib.parse.urlparse(u).path)
            trailing = raw.endswith("/")
            u = posixpath.normpath(raw)
            if u.startswith("../") or u == ".." or "\x00" in u:
                return None, False, None
            return u, trailing, raw

        def do_GET(self):
            self._serve(False)

        def do_HEAD(self):
            self._serve(True)

        def _serve(self, head_only):
            safe = self._safe(self.path)
            if safe[0] is None:
                self.send_error(403); return
            u, trailing, raw = safe
            hit = redirects.get(raw) or redirects.get(raw + "/") or redirects.get(u) or redirects.get(u + "/")
            if hit:
                self.send_response(301)
                self.send_header("Location", hit)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            fp = os.path.join(root, u.lstrip("/"))
            if trailing:
                fp = os.path.join(fp, "index.html")
            if not os.path.isfile(fp):
                self.send_error(404)
                return
            st = os.stat(fp)
            ext = os.path.splitext(fp)[1].lower()
            ctype = MIME.get(ext) or mimetypes.guess_type(fp)[0] or "application/octet-stream"
            etag = f'"{st.st_size}-{int(st.st_mtime * 1000)}"'
            if self.headers.get("If-None-Match") == etag:
                self.send_response(304)
                self.send_header("ETag", etag)
                self.end_headers()
                return
            cacheable = u.startswith(("/img/", "/assets/", "/data/"))
            headers = {
                "Content-Type": ctype,
                "ETag": etag,
                "Cache-Control": "no-cache" if ext == ".html" else ("public, max-age=86400" if cacheable else "public, max-age=300"),
                "X-Content-Type-Options": "nosniff",
                "Accept-Ranges": "bytes",
            }
            accepts_gzip = "gzip" in (self.headers.get("Accept-Encoding") or "")
            use_gzip = ext in GZIP_EXT and accepts_gzip and st.st_size > 1200
            if use_gzip:
                raw = open(fp, "rb").read()
                body = gzip.compress(raw, 6)
                headers["Content-Encoding"] = "gzip"
                headers["Content-Length"] = str(len(body))
            else:
                body = open(fp, "rb").read()
                headers["Content-Length"] = str(len(body))
            self.send_response(200)
            for k, v in headers.items():
                self.send_header(k, v)
            self.end_headers()
            if not head_only:
                self.wfile.write(body)

    return H, root

def main():
    ap = argparse.ArgumentParser(description="Infraconcept static VPS server")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--root", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "site"))
    args = ap.parse_args()
    handler, root = build(args.root)
    srv = ThreadingHTTPServer((args.host, args.port), handler)
    srv.daemon_threads = True
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    print(f"Infraconcept: serving {root} on http://{args.host}:{args.port}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()

if __name__ == "__main__":
    main()
