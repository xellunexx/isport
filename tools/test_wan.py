# Render the app end-to-end through the public Cloudflare tunnel URL.
import sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

URL = "https://bigger-brief-throwing-dir.trycloudflare.com/"
with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={"width": 1600, "height": 940})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_function("window.appReady === true", timeout=60000)
    page.wait_for_timeout(4000)
    n = page.locator("#grid .card").count()
    imgs = page.evaluate('Array.from(document.querySelectorAll("#grid .card img")).slice(0,20).filter(i=>i.complete && i.naturalWidth>0).length')
    # exercise one filter over WAN
    page.locator(".cat-tile[data-cat='play']").click()
    page.wait_for_timeout(400)
    n2 = page.evaluate("IC.filtered().length")
    print(f"WAN render: cards={n}, first-20 images loaded={imgs}, play={n2}, js-errors={errs[:2]}")
    hero = page.locator("#heroTitle").inner_text()
    ok = n > 20 and imgs >= 10 and 0 < n2 < 2579 and not errs and ("ВИЖ" in hero and "ИЗБЕРИ" in hero)
    print("WAN SMOKE:", "PASS" if ok else "FAIL")
    b.close()
    sys.exit(0 if ok else 1)
