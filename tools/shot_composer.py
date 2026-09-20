# Capture the composer plan (generated 145m2 playground) -> shots/composer-plan.png
import os, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

URL = "https://universities-commonly-furnishings-movies.trycloudflare.com/"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "shots", "composer-plan.png")
with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={"width": 1600, "height": 940})
    page.goto(URL, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_function("window.appReady === true", timeout=45000)
    page.wait_for_timeout(600)
    page.click("#diyOpenHero"); page.wait_for_timeout(500)
    page.evaluate("IC.planClear()")
    page.select_option("#diySpace", "play"); page.fill("#diyArea", "145"); page.select_option("#diyAge", "a3")
    page.click("#diyGen"); page.wait_for_timeout(500)
    page.screenshot(path=OUT)
    # also export the PNG the way a user would, and save its byte size
    size = page.evaluate("document.querySelector('#diyCanvas').toDataURL('image/png').length")
    print("plan items:", page.evaluate("IC.state.plan.size"), "| png data-bytes ~", size)
    b.close()
print("shot ->", OUT)
