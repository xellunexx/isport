# All-langs render + rough perf smoke.
import os, sys, threading, functools, http.server, socketserver, time
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept2026"
PORT = 8140
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve():
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=BASE)) as s:
        s.serve_forever()
threading.Thread(target=serve, daemon=True).start()
time.sleep(.4)

fails = []
with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page()
    t0 = time.time()
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.appReady === true", timeout=20000)
    print(f"appReady: {time.time()-t0:.2f}s")
    for l in ["bg", "en", "ro", "el", "sr", "mk", "sq"]:
        page.evaluate(f"IC.setLang('{l}')"); page.wait_for_timeout(150)
        ht = page.locator("#heroTitle").inner_html()
        deck = page.locator("#deckTitle").inner_text()
        cat0 = page.locator(".cat-tile[data-cat='play'] .ct").inner_text()
        ok = "<em>" in ht and len(deck.strip()) > 2 and len(cat0.strip()) > 1
        print(("PASS" if ok else "FAIL"), l, "|", cat0, "|", deck)
        if not ok: fails.append(l)
    t = time.time()
    page.evaluate("IC.setCat('play')"); page.wait_for_timeout(50)
    print(f"cat switch ~{(time.time()-t)*1000:.0f}ms (incl 50ms floor)")
    t = time.time()
    page.evaluate("IC.toggle('purp','swings')"); page.wait_for_timeout(50)
    print(f"purp toggle ~{(time.time()-t)*1000:.0f}ms")
    b.close()
print("RESULT:", "FAILED " + str(fails) if fails else "ALL LANGS OK")
sys.exit(1 if fails else 0)
