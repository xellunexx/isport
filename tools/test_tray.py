# Focused Моят проект (tray) UI test: add/dup-add/remove/qty/clear/persist/reload/enquiry text.
import threading, functools, http.server, socketserver, time, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live"
PORT = 8151

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
threading.Thread(target=lambda: socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=BASE)).serve_forever(), daemon=True).start()
time.sleep(.4)

fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"   [{extra}]" if extra else ""))
    if not cond: fails.append(name)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(permissions=["clipboard-read", "clipboard-write"], viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:120]))
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.appReady === true", timeout=20000)
    page.wait_for_timeout(400)
    page.evaluate("IC.trayClear()")

    page.locator("#grid .card").first.scroll_into_view_if_needed(); page.wait_for_timeout(200)
    add0 = page.locator("#grid .card").nth(0).locator("[data-act='add']")
    add1 = page.locator("#grid .card").nth(1).locator("[data-act='add']")
    add0.click(); page.wait_for_timeout(200)
    check("add #1 (badge=1)", page.evaluate("IC.state.tray.size") == 1 and page.locator("#trayCount").inner_text() == "1")
    add0.click(); page.wait_for_timeout(200)
    check("dup-add toggles OFF (no duplicates ever)", page.evaluate("IC.state.tray.size") == 0)
    add0.click(); page.wait_for_timeout(150)
    add1.click(); page.wait_for_timeout(150)
    check("two distinct adds", page.evaluate("IC.state.tray.size") == 2)
    # qty +/-
    page.click("#trayBtn"); page.wait_for_timeout(300)
    check("drawer shows 2 items", page.locator("#trayList .tray-item").count() == 2)
    page.locator("#trayList [data-qty='1']").first.click(); page.wait_for_timeout(200)
    check("qty+ => 2", page.locator("#trayList .ti-qty b").first.inner_text().strip() == "2")
    page.locator("#trayList [data-qty='-1']").first.click(); page.wait_for_timeout(200)
    check("qty- => 1", page.locator("#trayList .ti-qty b").first.inner_text().strip() == "1")
    # persistence across reload
    page.reload(); page.wait_for_function("window.appReady === true", timeout=20000); page.wait_for_timeout(300)
    check("tray persists reload", page.evaluate("IC.state.tray.size") == 2)
    # remove one
    page.click("#trayBtn"); page.wait_for_timeout(250)
    page.locator("#trayList [data-rm]").first.click(); page.wait_for_timeout(200)
    check("remove single", page.evaluate("IC.state.tray.size") == 1)
    # enquiry text contains items
    page.click("#trayCopy"); page.wait_for_timeout(300)
    clip = page.evaluate("navigator.clipboard.readText()")
    n_items = clip.count("•")
    check("enquiry contains items", n_items == 1, f"items in clipboard={n_items}")
    # clear all
    page.click("#trayClear"); page.wait_for_timeout(200)
    check("clear empties + badge hidden", page.evaluate("IC.state.tray.size") == 0 and page.locator("#trayCount").get_attribute("hidden") is not None)
    # back to catalog unharmed
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    check("catalog still fine", page.locator("#grid .card").count() > 20)
    check("no js errors", not errs, "; ".join(errs[:2]))
    b.close()
print("\n" + ("ALL TRAY CHECKS PASS" if not fails else f"FAILURES: {fails}"))
sys.exit(1 if fails else 0)
