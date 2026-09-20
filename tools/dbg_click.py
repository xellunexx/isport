# Where do the add-clicks really land? capture-phase click taplog.
import threading, functools, http.server, socketserver, time, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live"
PORT = 8150
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
threading.Thread(target=lambda: socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=BASE)).serve_forever(), daemon=True).start()
time.sleep(.4)
with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script("""window.__clog = [];
      document.addEventListener('click', e => {
        const path = (e.composedPath() || []).slice(0,6).map(n => n && n.classList ? (n.classList.value || n.tagName) : (n.tagName || n)).join(' < ');
        window.__clog.push({t: (e.target.classList && e.target.classList.value) || e.target.tagName, p: path.slice(0, 180)});
      }, true);""")
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.appReady === true", timeout=20000)
    page.wait_for_timeout(400)
    c = page.locator("#grid .card").first
    c.scroll_into_view_if_needed(); page.wait_for_timeout(200)
    for k in range(3):
        page.locator("#grid .card").first.locator("[data-act='add']").click()
        page.wait_for_timeout(200)
        print(f"after click {k+1}: tray =", page.evaluate("IC.state.tray.size"))
    print("click log:")
    for entry in page.evaluate("window.__clog"):
        print("  ", entry["p"][:150])
    b.close()
