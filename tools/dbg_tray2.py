# Repro 1024 tray rect.
import threading, functools, http.server, socketserver, time, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live"
PORT = 8157
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
threading.Thread(target=lambda: socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=BASE)).serve_forever(), daemon=True).start()
time.sleep(.4)
with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page(viewport={"width": 1024, "height": 900})
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.appReady === true", timeout=20000)
    page.click("#trayBtn"); page.wait_for_timeout(400)
    d = page.evaluate("""(() => { const r = document.querySelector('#tray .tray-box').getBoundingClientRect();
      return {l:r.left, r:r.right, t:r.top, b:b0=r.bottom, w:r.width, h:r.height, iw:innerWidth, ih:innerHeight}; })()""")
    print(d)
    b.close()
