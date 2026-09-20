# Reproduce user's "Моят проект" issues on the live build, measured.
import threading, functools, http.server, socketserver, time, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live"
PORT = 8161
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
threading.Thread(target=lambda: socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=BASE)).serve_forever(), daemon=True).start()
time.sleep(.4)

with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page(viewport={"width": 1440, "height": 940})
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.appReady === true", timeout=20000)
    page.wait_for_timeout(400)
    page.evaluate("IC.trayClear()")

    # into project mode with NO filters
    page.locator("#modeSeg [data-mode='project']").click(); page.wait_for_timeout(400)
    print("== project mode, no filters")
    print("  tray emptymark visible:", page.locator("#grid .proj-empty").is_visible())
    print("  sugg heading:", page.locator("#grid .proj-sugg-h").is_visible(),
          "| sugg cards:", page.locator("#grid .board-sugg .card").count(),
          "| tray items:", page.locator("#grid .proj-board .tray-item").count())
    print("  any other .card NOT in board-sugg:", page.evaluate("document.querySelectorAll('#grid .card').length - document.querySelectorAll('#grid .board-sugg .card').length"))
    cw = page.evaluate("""(() => { const c = document.querySelector('#grid .board-sugg .card'); return c ? {w: c.offsetWidth, h: c.offsetHeight} : null; })()""")
    print("  sugg card size:", cw)

    # try the + add on a suggestion card
    bid = page.locator("#grid .board-sugg .card").nth(0).get_attribute("data-id")
    page.locator("#grid .board-sugg .card").nth(0).locator("[data-act='add']").click(); page.wait_for_timeout(250)
    print("  after + on a sugg card: tray size =", page.evaluate("IC.state.tray.size"))
    # quick view on sugg card
    page.locator("#grid .board-sugg .card").nth(1).click(); page.wait_for_timeout(300)
    print("  quick view opens on sugg card:", page.locator("#qv").is_visible())
    page.keyboard.press("Escape"); page.wait_for_timeout(200)

    # user flow: park/wood/fulco in catalog
    page.locator("#modeSeg [data-mode='catalog']").click(); page.wait_for_timeout(200)
    page.locator(".cat-tile[data-cat='park']").click(); page.wait_for_timeout(200)
    page.locator(".chip[data-facet='mats'][data-value='wood']").click(); page.wait_for_timeout(150)
    page.locator(".chip[data-facet='brands'][data-value='fulco']").click(); page.wait_for_timeout(250)
    ids = page.evaluate("Array.from(document.querySelectorAll('#grid .card')).slice(0,8).map(c => c.querySelector('.nm').textContent)")
    print("== park+wood+fulco top results:", ids)
    print("== their mats:", page.evaluate("IC.filtered().slice(0,8).map(p => p.mats.join('+'))"))
    b.close()
