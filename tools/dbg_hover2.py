# Instrument #grid pointerover/pointerenter counts around hover.
import threading, functools, http.server, socketserver, time, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live"
PORT = 8146

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
threading.Thread(target=lambda: socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=BASE)).serve_forever(), daemon=True).start()
time.sleep(.4)
with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type in ("log", "error") else None)
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.appReady === true", timeout=20000)
    page.evaluate("""(() => {
      window.__pcount = {over:0, card:0, out:0};
      const g = document.getElementById('grid');
      g.addEventListener('pointerover', e => {
        window.__pcount.over++;
        const c = e.target.closest && e.target.closest('.card');
        if (c) window.__pcount.card++;
      });
      g.addEventListener('pointerout', () => window.__pcount.out++);
    })()""")
    page.evaluate("document.querySelector('#catalog').scrollIntoView({block:'end'})"); page.wait_for_timeout(300)
    bb = page.locator("#grid .card").first.bounding_box()
    page.mouse.move(bb["x"] + bb["width"]/2, bb["y"] + 40)
    page.wait_for_timeout(1000)
    print("pcounts after hover:", page.evaluate("window.__pcount"))
    print("lens:", page.locator("#lens").is_visible())
    # pointer events disabled?
    print("supports pointer over:", page.evaluate("'onpointerover' in window"))
    # is something else above the card? elementFromPoint at the hover point
    print("elementAtPoint:", page.evaluate(f"document.elementFromPoint({bb['x']+bb['width']/2}, {bb['y']+40})?.className"))
    b.close()
