# Responsive matrix QA: 9 viewport sizes x key flows. Overflow, reachability, modal fit.
import threading, functools, http.server, socketserver, time, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live"
PORT = 8155
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
threading.Thread(target=lambda: socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=BASE)).serve_forever(), daemon=True).start()
time.sleep(.4)

SIZES = [(1440, "d"), (1280, "d"), (1024, "d"), (834, "t"), (768, "t"), (430, "m"), (390, "m"), (375, "m"), (360, "m")]
touch_dev = {"m": dict(has_touch=True, is_mobile=True), "t": dict(has_touch=True, is_mobile=False), "d": {}}

fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"   [{extra}]" if extra else ""))
    if not cond: fails.append(name)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w, kind in SIZES:
        h = 900 if kind != "m" else 760
        ctx = b.new_context(viewport={"width": w, "height": h}, **touch_dev[kind])
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:100]))
        page.goto(f"http://127.0.0.1:{PORT}/index.html")
        try:
            page.wait_for_function("window.appReady === true", timeout=20000)
        except Exception:
            check(f"{w}px boots", False); ctx.close(); continue
        page.wait_for_timeout(450)
        ofx = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(f"{w}px no horizontal overflow", ofx <= 1, f"overflow={ofx}px")
        check(f"{w}px cards", page.locator("#grid .card").count() > 10)
        check(f"{w}px deck usable", page.locator(".cat-tile").first.is_visible())
        th = page.evaluate("document.querySelector('#deckWrap').getBoundingClientRect().height")
        check(f"{w}px deck height sane", th < h * 0.8, f"deck={th}px of {h}")
        # quick view fits
        page.evaluate("(() => {const c = document.querySelectorAll('#grid .card'); c[10] && c[10].scrollIntoView({behavior:'instant'});})()")
        page.wait_for_timeout(150)
        page.locator("#grid .card").nth(4).click(); page.wait_for_timeout(350)
        fits = page.evaluate("""(() => { const q = document.querySelector('#qv'); if (q.hidden) return -1;
          const r = q.querySelector('.qv-box').getBoundingClientRect();
          return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 2; })()""")
        check(f"{w}px quickview fits viewport", fits is True)
        page.keyboard.press("Escape"); page.wait_for_timeout(150)
        # tray fits
        page.click("#trayBtn"); page.wait_for_timeout(400)
        tfrect = page.evaluate("""(() => { const t = document.querySelector('#tray .tray-box').getBoundingClientRect();
          return {l:Math.round(t.left), r:Math.round(t.right), t:Math.round(t.top), b:Math.round(t.bottom)}; })()""")
        tf = page.evaluate("""(() => { const t = document.querySelector('#tray .tray-box').getBoundingClientRect();
          return t.left >= -1 && t.right <= innerWidth + 1 && t.top >= 0 && t.bottom <= innerHeight + 1; })()""")
        check(f"{w}px tray fits viewport", tf is True, "" if tf else str(tfrect))
        page.keyboard.press("Escape"); page.wait_for_timeout(150)
        # composer fits
        page.click("#diyOpenHero"); page.wait_for_timeout(350)
        df = page.evaluate("""(() => { const d = document.querySelector('#diy .diy-box').getBoundingClientRect();
          return d.left >= 0 && d.right <= innerWidth + 2 && d.bottom <= innerHeight + 2; })()""")
        check(f"{w}px composer fits viewport", df is True)
        page.keyboard.press("Escape"); page.wait_for_timeout(150)
        check(f"{w}px no js errors", not errs, "; ".join(errs[:2]))
        ctx.close()
    b.close()

print("\n" + ("ALL RESPONSIVE CHECKS PASS (9 sizes)" if not fails else f"FAILURES: {fails}"))
sys.exit(1 if fails else 0)
