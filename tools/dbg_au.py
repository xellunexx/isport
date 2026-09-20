# Repro: audience card click reachability + geometry dump.
import threading, functools, http.server, socketserver, time, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live"
PORT = 8147
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
threading.Thread(target=lambda: socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=BASE)).serve_forever(), daemon=True).start()
time.sleep(.4)
with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page(viewport={"width": 1440, "height": 900})
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.appReady === true", timeout=20000)
    page.evaluate("document.querySelector('#aud').scrollIntoView({block:'start'})")
    page.wait_for_timeout(700)
    info = page.evaluate("""(() => {
      const c = document.querySelector(".au-card[data-au='detski-gradini']");
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const el = document.elementFromPoint(cx, cy);
      return {rect:{x:r.x,y:r.y,w:r.width,h:r.height}, hit: el ? el.className || el.id || el.tagName : "NONE",
              innerH: innerHeight, deckH: getComputedStyle(document.documentElement).getPropertyValue('--deckH')};
    })()""")
    print(info)
    b.close()
