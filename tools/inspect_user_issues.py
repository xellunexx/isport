# Diagnose user-reported issues on the deployed URL (all 3 engines):
#  nav anchors (#aud #proj #brands #about #contacts) | liveBtn event | DIY canvas | mode/filter rings
import sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

URL = "https://bigger-brief-throwing-dir.trycloudflare.com/"
def settle_scroll(page, timeout_ms=9000):
    """Poll until scrollY is stable for 3 consecutive samples (what a user finally sees)."""
    import time as _t
    t0 = _t.time(); prev = None; stable = 0
    while (_t.time() - t0) * 1000 < timeout_ms:
        y = page.evaluate("window.scrollY")
        if prev is not None and abs(y - prev) < 2:
            stable += 1
            if stable >= 3:
                return y
        else:
            stable = 0
        prev = y
        page.wait_for_timeout(150)
    return page.evaluate("window.scrollY")

def probe(engine, page):
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:120]))
    page.on("console", lambda m: errs.append("c:" + m.text[:120]) if m.type == "error" else None)
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function("window.appReady === true", timeout=45000)
    page.evaluate("window.scrollTo(0,0)"); page.wait_for_timeout(300)
    out = []
    for sel, name in [("#aud", "aud"), ("#proj", "proj"), ("#brands", "brands"), ("#about", "about"), ("#contacts", "contacts")]:
        page.evaluate("window.scrollTo(0,0)"); page.wait_for_timeout(250)
        page.locator(f"a[href='{sel}']").first.click()
        y = settle_scroll(page)
        top = page.evaluate(f"document.querySelector('{sel}').getBoundingClientRect().top")
        h = page.evaluate("location.hash")
        margin = page.evaluate(f"parseFloat(getComputedStyle(document.querySelector('{sel}')).scrollMarginTop) || 0")
        ok_scroll_target = abs(top - margin) <= 80  # px-precision landing (deck margin ±80)
        out.append((name, f"settledY={round(y)} top-margin={round(top-margin)} ({'OK' if (y > 400 and ok_scroll_target) else 'NO-FOLLOW'})"))
    # live button: mode + land on the board (visible feedback)
    page.evaluate("window.scrollTo(0,0)"); page.wait_for_timeout(200)
    page.click("#liveBtn"); settle_scroll(page); page.wait_for_timeout(250)
    out.append(("liveBtn", f"mode={page.evaluate('IC.state.mode')} scrollY={round(page.evaluate('window.scrollY'))}"
                           f" boardCards={page.locator('#grid .proj-card').count()}"))
    out.append(("liveBtn", f"mode={page.evaluate('IC.state.mode')} scrollY={round(page.evaluate('window.scrollY'))}"
                           f" boardCards={page.locator('#grid .proj-card').count()}"))
    page.locator("#modeSeg [data-mode='catalog']").click(); page.wait_for_timeout(300)
    # mode + filters interplay: boards now narrow WITH the filters
    page.locator(".cat-tile[data-cat='sport']").click(); page.wait_for_timeout(350)
    n_catalog_sport = page.evaluate("IC.filtered().length")
    page.locator("#modeSeg [data-mode='live']").click(); page.wait_for_timeout(400)
    live_sport = page.evaluate("(() => { const fs=[...document.querySelectorAll('#grid .proj-card')].length; return fs; })()")
    page.locator("#modeSeg [data-mode='project']").click(); page.wait_for_timeout(300)
    sugg_proj = page.locator("#grid .board-sugg .card").count()
    out.append(("modes+filters", f"catalog@sport={n_catalog_sport} live@sportCards={live_sport} projectSuggestions={sugg_proj}"))
    # nav jump during auto-append: target must not drift (regression for 'endless browse loop')
    page.locator("#modeSeg [data-mode='catalog']").click(); page.wait_for_timeout(250)
    page.evaluate("window.scrollTo(0,0)"); page.wait_for_timeout(200)
    page.locator("a[href='#contacts']").first.click(); y2 = settle_scroll(page); page.wait_for_timeout(150)
    cy = page.evaluate("window.scrollY")
    ct = page.evaluate("var e=document.querySelector('#contacts'); e.getBoundingClientRect().top")
    cm = page.evaluate("var e=document.querySelector('#contacts'); parseFloat(getComputedStyle(e).scrollMarginTop) || 0")
    out.append(("nav-no-runaway", f"settledY={round(cy)} top-margin={round(ct-cm)}"))
    # DIY field drawn even when EMPTY (layout always visible)
    page.click("#diyOpenHero"); page.wait_for_timeout(400)
    page.evaluate("IC.planClear()"); page.wait_for_timeout(450)
    px_empty = page.evaluate("(() => { const c=document.querySelector('#diyCanvas'); const x=c.getContext('2d');" 
      "let col=0; const d=x.getImageData(0,0,c.width,c.height).data;"
      "for (let i=0;i<d.length;i+=4*97) { if(d[i]>30||d[i+1]>30||d[i+2]>30) col++; } return col; })()")
    page.select_option("#diySpace", "play"); page.fill("#diyArea", "145"); page.select_option("#diyAge", "a3")
    page.click("#diyGen"); page.wait_for_timeout(400)
    pl = page.evaluate("IC.state.plan.size")
    px = page.evaluate("(() => { const c=document.querySelector('#diyCanvas'); const x=c.getContext('2d');" 
      "let col=0; const d=x.getImageData(0,0,c.width,c.height).data;"
      "for (let i=0;i<d.length;i+=4*97) { if(d[i]>30||d[i+1]>30||d[i+2]>30) col++; } return col; })()")
    out.append(("diy-field", f"emptyFill={px_empty} plan={pl} paintedCells={px} (field always rendered; products drawn as colored safety cells)"))
    print(f"== {engine}")
    for n, v in out: print(f"   {n}: {v}")
    print("   JS errors:", errs[:4] if errs else "none")

with sync_playwright() as pw:
    for eng, launch in [("chromium", lambda: pw.chromium.launch()),
                        ("webkit", lambda: pw.webkit.launch()),
                        ("firefox", lambda: pw.firefox.launch())]:
        b = launch(); page = b.new_page(viewport={"width": 1440, "height": 900})
        try: probe(eng, page)
        except Exception as e: print(f"== {eng}: CRASH {str(e)[:150]}")
        b.close()
