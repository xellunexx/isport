# Focused: reproduce suite conditions -> hover commit + card add-to-tray.
import threading, functools, http.server, socketserver, time, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live"
PORT = 8145
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
threading.Thread(target=lambda: socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=BASE)).serve_forever(), daemon=True).start()
time.sleep(.4)
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(permissions=["clipboard-read", "clipboard-write"], viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:160]))
    page.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None)
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.appReady === true", timeout=20000)
    page.wait_for_timeout(400)

    print("== 0. fresh state:", page.evaluate("({mode:IC.state.mode, tray:IC.state.tray.size, ready:!!window.appReady})"))

    # emulate suite start-up portions that precede the hover matrix, minimally
    page.locator(".cat-tile[data-cat='play']").click(); page.wait_for_timeout(200)
    page.locator("#afClear").click(); page.wait_for_timeout(250)   # resets (as suite does)
    # slide down so card centers visible like suite did
    page.evaluate("document.querySelector('#catalog').scrollIntoView({block:'end'})"); page.wait_for_timeout(300)

    # 1) tray add via real card-button clicks
    page.locator("#grid .card [data-act='add']").first.click(); page.wait_for_timeout(120)
    n1 = page.evaluate("IC.state.tray.size")
    page.locator("#grid .card [data-act='add']").nth(1).click(); page.wait_for_timeout(120)
    print("tray size after 2 card clicks:", page.evaluate("IC.state.tray.size"), "(after first:", n1, ")")
    page.evaluate("IC.trayClear()")

    # 2) hover commit on card (post-suite state)
    bb = page.locator("#grid .card").first.bounding_box()
    page.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + 40)
    page.wait_for_timeout(900)
    print("lens after 900ms:", page.locator("#lens").is_visible(), "| dimmed:", page.locator("#grid .card.dim").count())
    page.wait_for_timeout(2500)
    print("auto size after 3.4s:", page.evaluate("IC.state.auto.size"))
    print("lens committed cls:", page.locator("#lens").get_attribute("class"))
    print("errors:", errs[:4])
    b.close()
