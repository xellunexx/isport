# Env checks: file:// loading, mobile viewport, reduced motion, touch long-press.
import os, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"   [{extra}]" if extra else ""))
    if not cond: fails.append(name)

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # 1. file:// scheme
    page = b.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("file:///" + os.path.join(BASE, "index.html").replace("\\", "/"))
    page.wait_for_function("window.appReady === true", timeout=15000)
    page.wait_for_timeout(300)
    n = page.locator("#grid .card").count()
    check("file:// loads + renders", n > 20 and not errors, f"{n} cards; errors={errors[:2]}")
    page.close()

    # 2. mobile viewport + touch long-press commit
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    page.goto("file:///" + os.path.join(BASE, "index.html").replace("\\", "/"))
    page.wait_for_function("window.appReady === true", timeout=15000)
    check("mobile renders cards", page.locator("#grid .card").count() > 10)
    check("mobile deck present", page.locator("#deckCats").is_visible())
    card = page.locator("#grid .card").first
    box = card.bounding_box()
    page.touchscreen.tap(box["x"] + 50, box["y"] + 50)  # normal tap -> quick view should NOT auto open from tap on card? (it does open per click) -> close after
    page.wait_for_timeout(300)
    qv_open = page.locator("#qv").is_visible()
    if qv_open:
        page.keyboard.press("Escape"); page.wait_for_timeout(200)
    # long-press via touch: tap down, hold, up with touchscreen API is trickier; use dispatch pointer events
    page.evaluate("""() => {
      const c = document.querySelector('#grid .card');
      const r = c.getBoundingClientRect();
      c.dispatchEvent(new TouchEvent('touchstart', {bubbles:true, touches:[new Touch({identifier:1, target:c, clientX:r.x+30, clientY:r.y+30})]}));
    }""")
    page.wait_for_timeout(750)
    armed = page.evaluate("!document.getElementById('lens').hidden")
    check("touch long-press arms hover lens", armed)
    page.evaluate("""() => {
      const c = document.querySelector('#grid .card');
      c.dispatchEvent(new TouchEvent('touchend', {bubbles:true, changedTouches:[]}));
    }""")
    page.wait_for_timeout(300)
    check("touch release commits auto filters", page.evaluate("IC.state.auto.size") > 0, str(page.evaluate("IC.state.auto.size")))
    page.close(); ctx.close()

    # 3. reduced motion
    ctx = b.new_context(reduced_motion="reduce")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("file:///" + os.path.join(BASE, "index.html").replace("\\", "/"))
    page.wait_for_function("window.appReady === true", timeout=15000)
    page.wait_for_timeout(500)
    check("reduced-motion loads clean", not errors, "; ".join(errors[:2]))
    page.close(); ctx.close()
    b.close()

print("\n" + ("ALL ENV CHECKS PASS" if not fails else f"FAILURES: {fails}"))
sys.exit(1 if fails else 0)
