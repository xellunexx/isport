# Capture presentation screenshots into shots/ (light default, dwell=3s).
import os, sys, threading, functools, http.server, socketserver, time
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(BASE, "shots"); os.makedirs(SHOTS, exist_ok=True)
PORT = 8141
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
threading.Thread(target=lambda: socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=BASE)).serve_forever(), daemon=True).start()
time.sleep(.5)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={"width": 1600, "height": 940}, device_scale_factor=1.5)
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.appReady === true", timeout=20000)
    page.evaluate("localStorage.clear()")
    page.reload(); page.wait_for_function("window.appReady === true"); page.wait_for_timeout(1100)
    page.screenshot(path=os.path.join(SHOTS, "01-hero-light.png"))

    page.evaluate("document.querySelector('#catalog').scrollIntoView()"); page.wait_for_timeout(700)
    page.screenshot(path=os.path.join(SHOTS, "02-catalog-light.png"))

    page.locator(".cat-tile[data-cat='park']").click()
    page.locator(".chip[data-facet='purp'][data-value='benches']").click()
    page.locator(".chip[data-facet='mats'][data-value='wood']").click()
    page.wait_for_timeout(600)
    page.screenshot(path=os.path.join(SHOTS, "03-filtered.png"))

    # hover lens (3s commit, preview at .7s)
    page.mouse.move(60, 60); page.wait_for_timeout(200)
    page.evaluate("IC.clearAll(false)"); page.wait_for_timeout(300)
    card = page.locator("#grid .card").first
    bb = card.bounding_box()
    page.mouse.move(bb["x"] + bb["width"]/2, bb["y"] + 60)
    page.wait_for_timeout(1200)
    page.screenshot(path=os.path.join(SHOTS, "04-hover-preview.png"))
    page.wait_for_timeout(2100)
    page.screenshot(path=os.path.join(SHOTS, "05-hover-committed.png"))
    page.keyboard.press("Escape"); page.mouse.move(60, 60); page.wait_for_timeout(300)

    # live strip
    page.evaluate("IC.clearAll(false)")
    page.click("#liveBtn"); page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(SHOTS, "06-live-strip.png"))
    page.click("#liveBtn")

    # quickview with IRL strip
    c2 = page.locator("#grid .card").nth(2)
    c2.click(); page.wait_for_timeout(600)
    page.screenshot(path=os.path.join(SHOTS, "07-quickview.png"))
    page.keyboard.press("Escape"); page.wait_for_timeout(300)

    # audiences
    page.evaluate("document.querySelector('#aud').scrollIntoView()"); page.wait_for_timeout(900)
    page.screenshot(path=os.path.join(SHOTS, "08-audiences.png"))

    # admin panel (dark preview)
    page.click("#adminBtn"); page.wait_for_timeout(350)
    page.screenshot(path=os.path.join(SHOTS, "09-admin.png"))
    page.locator("#admTheme button[data-th='dark']").click(); page.wait_for_timeout(250)
    page.click("#admin .tray-x"); page.wait_for_timeout(300)
    page.evaluate("document.querySelector('#top').scrollIntoView()"); page.wait_for_timeout(800)
    page.screenshot(path=os.path.join(SHOTS, "10-hero-dark.png"))
    page.evaluate("localStorage.setItem('ic-admin', JSON.stringify({theme:'light'})); location.reload()")
    page.wait_for_function("window.appReady === true")

    # DIY composer with 3 items
    page.click("#diyOpenHero"); page.wait_for_timeout(400)
    for i in range(3):
        page.locator("#diyList .diy-item .da").nth(i).click()
    page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(SHOTS, "11-composer.png"))
    page.keyboard.press("Escape")

    m = b.new_page(viewport={"width": 390, "height": 844})
    m.goto(f"http://127.0.0.1:{PORT}/index.html")
    m.wait_for_function("window.appReady === true"); m.wait_for_timeout(900)
    m.screenshot(path=os.path.join(SHOTS, "12-mobile-hero.png"))
    m.evaluate("document.querySelector('#catalog').scrollIntoView()"); m.wait_for_timeout(400)
    m.evaluate("IC.setCat('play')"); m.wait_for_timeout(400)
    m.screenshot(path=os.path.join(SHOTS, "13-mobile-catalog.png"))
    b.close()
print("shots:", len(os.listdir(SHOTS)))
