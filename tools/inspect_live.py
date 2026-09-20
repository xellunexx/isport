# Cross-engine inspection: chromium + webkit (Safari) + firefox.
# Usage: python inspect_live.py [base-url]   (default = live WAN)
import sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://bigger-brief-throwing-dir.trycloudflare.com/"

def probe(engine, page):
    errs, failed = [], []
    page.on("pageerror", lambda e: errs.append(str(e)[:140]))
    page.on("console", lambda m: errs.append("console: " + m.text[:140]) if m.type == "error" else None)
    page.on("response", lambda r: failed.append(f"{r.status} {r.url[-60:]}") if r.status >= 400 else None)
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    try:
        page.wait_for_function("window.appReady === true", timeout=45000)
        ready = True
    except Exception:
        ready = False
    page.wait_for_timeout(1200)
    cards = page.locator("#grid .card").count()
    results = {}
    def cleanup():
        page.evaluate("document.querySelectorAll('#diy,#audModal,#qv,#projModal,#brandModal,#tray,#admin').forEach(m=>m.hidden=true); document.body.style.overflow=''")
        page.wait_for_timeout(150)
    def step(name, fn):
        try:
            cleanup()
            v = fn()
            results[name] = ("OK", v)
        except Exception as e:
            results[name] = ("FAIL", str(e).split("Call log")[0][:90])
        finally:
            cleanup()
    step("nav #catalog anchors", lambda: (page.locator("a[href='#catalog']").first.click(), page.wait_for_timeout(900),
        page.evaluate("document.querySelector('#catalog').getBoundingClientRect().top") < 400)[-1])
    step("nav #aud anchors", lambda: (page.locator("a[href='#aud']").first.click(),
        page.wait_for_function("location.hash === '#aud'", timeout=3000),
        page.wait_for_timeout(2600),  # smooth-scroll finishes
        abs(page.evaluate("document.querySelector('#aud').getBoundingClientRect().top")) < 320)[-1])
    step("cat tile filters", lambda: (page.locator(".cat-tile[data-cat='play']").click(),
        page.wait_for_timeout(400), page.evaluate("IC.filtered().length") < 2579)[-1])
    step("live bar opens", lambda: (page.click("#liveBtn"), page.wait_for_timeout(300),
        page.locator("#irlBar").is_visible() and page.locator("#irlBar .irl-card").count() > 5)[-1])
    step("aud opens+applies", lambda: (page.locator(".au-card").first.click(), page.wait_for_timeout(300),
        page.locator("#audModal").is_visible(), page.click("#audApply"), page.wait_for_timeout(300),
        page.evaluate("IC.state.cat") == 'play')[-1])
    step("diy opens+canvas+images", lambda: (page.click("#diyOpenHero"), page.wait_for_timeout(400),
        page.locator("#diy").is_visible(),
        page.locator("#diyList .diy-item img").first.evaluate("i => i.complete && i.naturalWidth > 20"),
        page.locator("#diyList .diy-item .da").first.click(), page.wait_for_timeout(300),
        page.evaluate("(() => { const c=document.querySelector('#diyCanvas'); const x=c.getContext('2d'); const d=x.getImageData(0,0,c.width,c.height).data; for (let i=3;i<d.length;i+=997) if(d[i]>0) return true; return false; })()"))[-1])
    step("proj opens", lambda: (page.evaluate("document.querySelector('#proj').scrollIntoView()"), page.wait_for_timeout(400),
        page.locator(".proj-card").first.click(), page.wait_for_timeout(400),
        page.locator("#projModal").is_visible())[-1])
    step("quickview opens", lambda: (page.locator("#grid .card").first.click(), page.wait_for_timeout(400),
        page.locator("#qv").is_visible())[-1])
    print(f"== {engine}: appReady={ready} cards={cards}")
    for k, (s, v) in results.items():
        print(f"   {s}: {k}  [{v}]")
    print("   JS errors:", errs[:3] if errs else "none")
    print("   failed reqs:", failed[:3] if failed else "none")
    return results

with sync_playwright() as pw:
    for eng, launch in [("chromium", lambda: pw.chromium.launch()),
                        ("webkit", lambda: pw.webkit.launch()),
                        ("firefox", lambda: pw.firefox.launch())]:
        try:
            b = launch()
        except Exception as e:
            print(f"== {eng}: browser not installed ({str(e)[:60]}) — skipping")
            continue
        page = b.new_page(viewport={"width": 1440, "height": 900})
        try:
            probe(eng, page)
        except Exception as e:
            print(f"== {eng}: CRASH {str(e)[:120]}")
        b.close()
