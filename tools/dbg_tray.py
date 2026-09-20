# Focused tray debugging.
import threading, functools, http.server, socketserver, time, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live"
PORT = 8144
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
threading.Thread(target=lambda: socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=BASE)).serve_forever(), daemon=True).start()
time.sleep(.4)
with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:130]))
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.appReady === true", timeout=20000)
    page.evaluate("IC.trayAdd('flow-peyka-bez-oblegalka-lfl122', 2); IC.trayAdd('arena-2452', 1)")
    page.wait_for_timeout(150)
    page.click("#trayBtn"); page.wait_for_timeout(300)
    print("tray visible:", page.locator("#tray").is_visible())
    print("items:", page.locator("#trayList .tray-item").count())
    print("qty btns:", page.locator("#trayList [data-qty]").count())
    print("page errors:", errs[:3])
    b.close()
