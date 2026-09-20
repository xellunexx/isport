# Verify the VPS bundle end-to-end: pure-stdlib server on 0.0.0.0:8000, app boots, SEO pages serve,
# redirects 301, gzip/etag/cache correct; then close.
import os, sys, subprocess, time, requests
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLE = os.path.join(BASE, "vps-bundle")
HOST, PORT = "127.0.0.1", 8000

fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"   [{extra}]" if extra else ""))
    if not cond: fails.append(name)

proc = subprocess.Popen([sys.executable, os.path.join(BUNDLE, "serve_vps.py"),
                         "--host", "0.0.0.0", "--port", str(PORT), "--root", os.path.join(BUNDLE, "site")],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
if proc.poll() is not None:
    print("!! serve_vps.py did not start"); sys.exit(1)

try:
    b0 = f"http://{HOST}:{PORT}"
    # real boot over the production-grade server
    with sync_playwright() as pw:
        b = pw.chromium.launch(); page = b.new_page(viewport={"width": 1440, "height": 900})
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:80]))
        page.goto(b0 + "/")
        page.wait_for_function("window.appReady === true", timeout=20000)
        page.wait_for_timeout(300)
        check("app boots on stdlib origin", page.locator("#grid .card").count() > 20)
        check("no js errors", not errs, "; ".join(errs[:2]))
        b.close()
    # key routes
    for route, must in [("/p/flow-peyka-bez-oblegalka-lfl122/", "FLOW пейка"), ("/sitemap.xml", "<url>"),
                        ("/brand/vinci/", "Vinci"), ("/robots.txt", "Sitemap")]:
        r = requests.get(b0 + route, timeout=10)
        check(f"{route}", r.status_code == 200 and must in r.text, str(r.status_code))
    # 301
    r = requests.get(b0 + "/product/flow-peyka-bez-oblegalka-lfl122/", timeout=10, allow_redirects=False)
    check("old /product/ 301", r.status_code == 301 and "/p/flow-peyka-bez-oblegalka-lfl122/" in r.headers.get("Location", ""), r.headers.get("Location", ""))
    # gzip + etag
    r1 = requests.get(b0 + "/data/catalog.js", timeout=10)
    check("gzip on catalog.js", r1.headers.get("Content-Encoding") == "gzip")
    etag = r1.headers.get("ETag")
    r2 = requests.get(b0 + "/data/catalog.js", headers={"If-None-Match": etag}, timeout=10)
    check("etag 304", r2.status_code == 304, str(r2.status_code))
    r3 = requests.get(b0 + "/img/p/flow-peyka-bez-oblegalka-lfl122_1.webp", timeout=10)
    check("webp mime + long cache", "image/webp" in r3.headers.get("Content-Type", "") and "max-age=86400" in r3.headers.get("Cache-Control", ""))
    r4 = requests.get(b0 + "/index.html", timeout=10)
    check("index.html no-cache", "no-cache" in r4.headers.get("Cache-Control", ""))
    # traversal blocked
    r5 = requests.get(b0 + "/../../../../../windows/win.ini", timeout=10)
    check("traversal blocked", r5.status_code in (403, 404), str(r5.status_code))
finally:
    proc.terminate()
    try:
        proc.wait(timeout=6)
    except Exception:
        proc.kill()

print("\n" + ("VPS BUNDLE: ALL PASS" if not fails else f"FAILURES: {fails}"))
sys.exit(1 if fails else 0)
