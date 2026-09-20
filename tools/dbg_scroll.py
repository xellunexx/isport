# scroll reachability dump.
import threading, functools, http.server, socketserver, time, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live"
PORT = 8149
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
threading.Thread(target=lambda: socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=BASE)).serve_forever(), daemon=True).start()
time.sleep(.4)
with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page(viewport={"width": 1440, "height": 900})
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.appReady === true", timeout=20000)
    page.wait_for_timeout(500)
    st = page.evaluate("""({
      scrollY: window.scrollY,
      scrollH: document.documentElement.scrollHeight,
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      audTop: document.querySelector('#aud').offsetTop,
      gridChildren: document.querySelectorAll('#grid > *').length,
      gridH: document.getElementById('grid').offsetHeight
    })""")
    print(st)
    page.evaluate("window.scrollTo({top: document.querySelector('#aud').offsetTop})")
    page.wait_for_timeout(600)
    print("after scrollTo: scrollY =", page.evaluate("window.scrollY"))
    b.close()
