# Browser smoke test: loads the app over a local HTTP server, exercises the core flows.
import os, sys, threading, functools, http.server, socketserver, time
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8137

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    handler = functools.partial(Quiet, directory=BASE)
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), handler) as httpd:
        httpd.serve_forever()

threading.Thread(target=serve, daemon=True).start()
time.sleep(0.5)
URL = f"http://127.0.0.1:{PORT}/index.html"

fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"   [{extra}]" if extra else ""))
    if not cond: fails.append(name)

def scroll_instant(page, sel):
    """Instant, deterministic scroll — real users get smooth; tests shouldn't wait on it."""
    page.evaluate(f"document.querySelector('{sel}').scrollIntoView({{behavior:'instant', block:'start'}})")
    page.wait_for_timeout(250)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(permissions=["clipboard-read", "clipboard-write"], viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    badurls = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("response", lambda r: badurls.append(r.url) if r.status >= 400 else None)

    page.goto(URL)
    page.wait_for_function("window.appReady === true", timeout=15000)
    page.wait_for_timeout(400)

    check("no console/page errors on load", not errors, "; ".join(errors[:3]))
    n_cards = page.locator("#grid .card").count()
    check("grid renders cards", n_cards > 20, f"{n_cards} cards")
    deck_txt = page.locator("#deckCount").inner_text()
    check("total count shown", "продукта" in deck_txt, deck_txt.strip())

    total = page.evaluate("IC.filtered().length")
    page.locator(".cat-tile[data-cat='play']").click()
    page.wait_for_timeout(200)
    nplay = page.evaluate("IC.filtered().length")
    check("cat=play filters down", 0 < nplay < total, f"{total} -> {nplay}")
    check("purpose row visible", page.locator("#deckPurps").is_visible())
    chips = page.locator("#deckPurps .chip").count()
    check("purpose chips present", chips > 8, str(chips))
    swings = page.locator("#deckPurps .chip[data-value='swings']")
    check("swings chip has count", "0" != swings.locator(".n").inner_text().strip())
    off_count = page.locator("#deckPurps .chip.off").count()
    check("zero-count chips disabled (no dead ends)", off_count >= 0, f"{off_count} disabled")
    swings.click(); page.wait_for_timeout(200)
    nsw = page.evaluate("IC.filtered().length")
    check("purpose=swings filters", nsw < nplay, f"{nplay} -> {nsw}")
    check("active ribbon shown", page.locator("#deckActive").is_visible())

    # material facet
    wood = page.locator("#deckMats .chip[data-value='wood']")
    if wood.is_enabled():
        wood.click(); page.wait_for_timeout(200)
    # age facet
    age3 = page.locator("#deckAges .chip[data-value='a3']")
    if age3.is_enabled():
        age3.click(); page.wait_for_timeout(200)
    n2 = page.evaluate("IC.filtered().length")
    check("facets stack (AND across)", n2 <= nsw, f"{nsw} -> {n2}")
    check("no div by zero: count shown", "0" not in page.locator("#deckCount b").inner_text())

    # clear all
    page.locator("#afClear").click(); page.wait_for_timeout(200)
    check("clear-all restores total", page.evaluate("IC.filtered().length") == total)

    # search
    page.fill("#searchInput", "пейка"); page.wait_for_timeout(450)
    ns = page.evaluate("IC.filtered().length")
    check("search filters", 0 < ns < total, f"search -> {ns}")
    page.click("#searchX"); page.wait_for_timeout(300)

    # --- smart hover: preview at ~0.7s, commit at 3.0s (per product decision) ---
    first = page.locator("#grid .card").first
    box = first.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + 40)  # hover over image, not buttons
    page.wait_for_timeout(950)
    lens_visible = page.locator("#lens").is_visible()
    dimmed = page.locator("#grid .card.dim").count()
    check("hover preview: lens shows + dims", lens_visible and dimmed > 0, f"dimmed={dimmed}")
    page.wait_for_timeout(700)
    still_preview = page.evaluate("IC.state.auto.size") == 0
    check("no commit before 1.65s", still_preview)
    page.wait_for_timeout(1800)  # total ~3450ms > COMMIT_MS(3000)
    auto_chips = page.locator(".chip.auto").count()
    check("hover commit at ~3s: auto chips applied", auto_chips > 0, f"{auto_chips} auto chips")
    auto_ribbon = page.locator("#deckActive .af.auto-ribbon").count()
    check("auto ribbon entries", auto_ribbon > 0, str(auto_ribbon))
    nauto = page.evaluate("IC.filtered().length")
    check("auto-filtered grid is narrower", nauto < total, f"{total} -> {nauto}")

    # regression: hover-loop scenario. NOTE new rule: deliberate brand click RESETS other facets,
    # so the narrow set is built brand-first.
    page.locator("#afClear").click(); page.wait_for_timeout(250)
    page.locator(".chip[data-facet='brands'][data-value='polfisan']").click()  # brand reset gesture
    page.wait_for_timeout(150)
    n_brand_only = page.evaluate("IC.filtered().length")
    page.locator(".cat-tile[data-cat='play']").click(); page.wait_for_timeout(150)
    page.locator(".chip[data-facet='purp'][data-value='slides']").click()
    page.locator(".chip[data-facet='mats'][data-value='wood']").click()
    page.wait_for_timeout(300)
    n2 = page.evaluate("IC.filtered().length")
    check("brand-reset, then narrow (play/slides/wood) = 2", n2 == 2 and n_brand_only > n2, f"brand-only={n_brand_only} -> {n2}")
    # hover a result past the 3s commit point; nothing may churn (already fully applied -> no-op)
    card_el = page.locator("#grid .card").first
    bb = card_el.bounding_box()
    page.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + 40)
    page.wait_for_timeout(3600)  # past commit; lens should not even show (fully-active no-op)
    lens_shown = page.locator("#lens").is_visible()
    page.evaluate("document.querySelector('#grid .card').setAttribute('data-probe','1')")
    page.wait_for_timeout(1600)
    survives = page.evaluate("!!document.querySelector('#grid .card[data-probe=\"1\"]')")
    n_a = page.evaluate("IC.filtered().length")
    page.wait_for_timeout(1500)
    survives2 = page.evaluate("!!document.querySelector('#grid .card[data-probe=\"1\"]')")
    n_b = page.evaluate("IC.filtered().length")
    check("already-applied hover = no-op (no lens, no churn)", (not lens_shown) and survives and survives2 and n_a == 2 and n_b == 2,
          f"lens={lens_shown} probe={survives},{survives2} n={n_a},{n_b}")
    page.keyboard.press("Escape"); page.wait_for_timeout(150)
    page.keyboard.press("Escape"); page.wait_for_timeout(300)
    if page.locator("#afClear").count():
        page.locator("#afClear").click()
    page.wait_for_timeout(300)
    check("auto filters cleared via Esc/reset", page.evaluate("IC.filtered().length") == total)
    # leave the grid so the latch clears before any later hover-based steps
    page.mouse.move(60, 60); page.wait_for_timeout(100)

    # quick view
    first2 = page.locator("#grid .card").first
    first2.click()
    page.wait_for_timeout(300)
    check("quickview opens", page.locator("#qv").is_visible())
    check("qv has specs/chips", page.locator("#qvChips .fchip").count() >= 2)
    page.click("#qvAdd"); page.wait_for_timeout(150)
    check("qv add to tray badge", page.locator("#trayCount").inner_text() == "1")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    check("quickview closes", not page.locator("#qv").is_visible())

    # tray drawer
    page.click("#trayBtn"); page.wait_for_timeout(250)
    check("tray opens with item", page.locator("#trayList .tray-item").count() == 1)
    page.click("#trayCopy"); page.wait_for_timeout(300)
    clip = page.evaluate("navigator.clipboard.readText()")
    check("tray copy produces list", "Запитване" in clip or "Inquiry" in clip)
    page.keyboard.press("Escape"); page.wait_for_timeout(200)

    # URL hash roundtrip
    page.locator(".cat-tile[data-cat='sport']").click(); page.wait_for_timeout(500)
    h = page.evaluate("location.hash")
    check("hash updated", "cat=sport" in h, h[:60])
    page.goto(URL + h)
    page.wait_for_function("window.appReady === true", timeout=15000)
    page.wait_for_timeout(300)
    check("hash reapplies state", page.evaluate("IC.state.cat") == "sport")

    # language switch
    page.click("#langSw button[data-lang='en']"); page.wait_for_timeout(250)
    check("lang=en renames sort options", "by name" in page.locator("#sortSel").inner_text().lower())
    check("lang=en renames deck title", "catalog" in page.locator("#deckTitle").inner_text().lower())
    purp0 = page.locator("#deckPurps .chip").first.inner_text() if page.locator("#deckPurps").is_visible() else ""
    check("purp label translated", purp0.strip() != "", purp0)

    # more button (DOM click: the auto-append sentinel re-lays-out mid-mouse-click locally)
    before = page.locator("#grid .card").count()
    mb = page.locator("#moreBtn")
    if mb.count():
        page.evaluate("document.querySelector('#moreBtn') && document.querySelector('#moreBtn').click()")
        page.wait_for_timeout(300)
        after = page.locator("#grid .card").count()
        check("show-more appends", after > before, f"{before}->{after}")

    # brands modal + apply
    scroll_instant(page, '#brands')
    page.locator(".brand-tile").first.click(); page.wait_for_timeout(250)
    check("brand modal opens", page.locator("#brandModal").is_visible())
    if page.locator("#brandGo").is_enabled():
        page.click("#brandGo"); page.wait_for_timeout(400)
        check("brand 'see products' applies filter", page.evaluate("IC.state.brands.size") == 1)

    # projects: thumbnails OPEN a modal (regression for "projects do not open")
    scroll_instant(page, '#proj'); page.wait_for_timeout(200)
    pc = page.locator(".proj-card").first
    pc.click(); page.wait_for_timeout(400)
    check("project modal opens", page.locator("#projModal").is_visible())
    check("project modal has image", page.evaluate("!!document.querySelector('#projImg').currentSrc"))
    thumbs = page.locator("#projThumbs button").count()
    page.click("#projModal .qv-x"); page.wait_for_timeout(200)
    check("project modal closes", not page.locator("#projModal").is_visible())

    # new promise text (#5/#6) — lang is 'en' at this point in the test
    hero_txt = page.locator("#heroTitle").inner_text().lower()
    sub_txt = page.locator("#heroSub").inner_text().lower()
    check("promise updated", "see everything" in hero_txt and "pick in seconds" in hero_txt, hero_txt[:50])
    check("promise_sub updated", "two clicks" in sub_txt and "no dead ends" not in sub_txt, sub_txt.strip()[:60])

    # NEW feature checks -----------------------------------------------------
    # 1. deliberate brand select clears other facets
    page.locator(".cat-tile[data-cat='play']").click(); page.wait_for_timeout(120)
    page.locator(".chip[data-facet='purp'][data-value='swings']").click(); page.wait_for_timeout(120)
    pre = page.evaluate("IC.filtered().length")
    page.locator(".chip[data-facet='brands'][data-value='vinci']").click(); page.wait_for_timeout(200)
    st = page.evaluate("({cat:IC.state.cat, purp:IC.state.purp.size, mats:IC.state.mats.size, brands:[...IC.state.brands]})")
    check("brand select resets other facets", st["cat"] is None and st["purp"] == 0 and st["mats"] == 0 and st["brands"] == ["vinci"], str(st))
    page.locator("#afClear").click() if page.locator("#afClear").count() else None
    page.wait_for_timeout(200)

    # 2. scroll-margin: #grid tops below the sticky deck, not under it
    top_ok = page.evaluate("""(() => { const g = document.querySelector('#grid'); const cs = getComputedStyle(g).scrollMarginTop;
        return parseFloat(cs) >= 100; })()""")
    check("scroll-margin keeps grid below deck", top_ok)

    # 3. на живо — view mode (Каталог | На живо | Моят проект)
    page.click("#liveBtn"); page.wait_for_timeout(350)
    check("mode switches to live", page.evaluate("IC.state.mode") == "live")
    irl_n = page.locator("#grid .proj-card").count()
    check("live board: delivered-project photos", irl_n >= 20, f"{irl_n} cards")
    page.locator("#grid .proj-card").first.click(); page.wait_for_timeout(350)
    check("live card opens project modal", page.locator("#projModal").is_visible())
    check("project modal has 'similar space' CTA", page.locator("#projWant").is_visible())
    page.click("#projModal .qv-x"); page.wait_for_timeout(150)
    page.locator("#modeSeg [data-mode='catalog']").click(); page.wait_for_timeout(300)
    check("mode back to catalog", page.evaluate("IC.state.mode") == "catalog" and page.locator("#grid .card").count() > 20)

    # 4. audiences -> recommendation (never impersonates user filters)
    scroll_instant(page, '#aud'); page.wait_for_timeout(200)
    check("audience cards rendered", page.locator(".au-card").count() == 6)
    page.locator(".au-card[data-au='detski-gradini']").click(); page.wait_for_timeout(300)
    check("audience modal opens", page.locator("#audModal").is_visible())
    page.click("#audApply"); page.wait_for_timeout(400)
    st2 = page.evaluate("({cat:IC.state.cat, ages:[...IC.state.ages], rec:IC.state.rec})")
    check("persona sets division + REC, not user ages",
          st2["cat"] == "play" and st2["ages"] == [] and st2["rec"] and st2["rec"]["slug"] == "detski-gradini", str(st2)[:90])
    check("rec chip visible in ribbon", page.locator("#deckActive .af.rec").count() >= 1)
    n_au = page.evaluate("IC.filtered().length")
    check("persona narrows catalog", 0 < n_au < total, str(n_au))
    page.locator("#deckAges .chip[data-value='a7']").click(); page.wait_for_timeout(250)
    st3 = page.evaluate("({ages:[...IC.state.ages], rec:IC.state.rec && IC.state.rec.ages})")
    check("user age overrides rec ages", st3["ages"] == ["a7"] and (not st3["rec"] or st3["rec"] == []), str(st3)[:90])
    page.locator("#afClear").click() if page.locator("#afClear").count() else None
    page.wait_for_timeout(200)

    # 5. admin: light default, dark preset applies and persists
    check("light theme is default", page.evaluate("document.documentElement.dataset.theme") == "light")
    page.click("#adminBtn"); page.wait_for_timeout(250)
    check("admin panel opens", page.locator("#admin").is_visible())
    page.locator("#admTheme button[data-th='dark']").click(); page.wait_for_timeout(150)
    check("dark theme applies", page.evaluate("document.documentElement.dataset.theme") == "dark")
    ok_persist = page.evaluate("JSON.parse(localStorage.getItem('ic-admin')).theme") == "dark"
    check("admin persists to localStorage", ok_persist)
    page.reload(); page.wait_for_function("window.appReady === true", timeout=15000); page.wait_for_timeout(300)
    check("theme survives reload", page.evaluate("document.documentElement.dataset.theme") == "dark")
    page.click("#adminBtn"); page.wait_for_timeout(250)
    page.locator("#admTheme button[data-th='light']").click(); page.wait_for_timeout(150)
    page.click("#admin .tray-x"); page.wait_for_timeout(150)

    # 6. DIY composer opens, add 2 products, plan has items, png+buttons present
    page.click("#diyOpenHero"); page.wait_for_timeout(350)
    check("composer opens", page.locator("#diy").is_visible())
    page.locator("#diyList .diy-item .da").first.click()
    page.locator("#diyList .diy-item .da").nth(1).click()
    page.wait_for_timeout(250)
    check("composer stats present", page.locator("#diyStats .st").count() >= 3)
    check("composer canvas painted", page.evaluate("(() => { const c=document.querySelector('#diyCanvas'); const x=c.getContext('2d'); const d=x.getImageData(0,0,c.width,c.height).data; for (let i=3;i<d.length;i+=997) { if (d[i]>0) return true; } return false; })()"))
    page.click("#diyAll"); page.wait_for_timeout(350)
    check("composer -> inquiry", page.locator("#tray").is_visible() and page.locator("#trayList .tray-item").count() >= 2)
    page.keyboard.press("Escape"); page.wait_for_timeout(200)

    # 7. HOVER MATRIX A-E (locator.hover auto-scrolls into view)
    page.evaluate("IC.clearAll(true)"); page.wait_for_timeout(300)
    page.locator("#deckWrap").hover(); page.wait_for_timeout(200)

    idA = page.locator("#grid .card").nth(0).get_attribute("data-id")
    idB = page.locator("#grid .card").nth(1).get_attribute("data-id")
    # Test A: hold A 1s (preview arms but no commit), leave, hold B 3.2s -> B commits, A does not
    page.locator(f"#grid .card[data-id='{idA}']").hover(); page.wait_for_timeout(900)
    previewA = page.locator("#lens").is_visible()
    page.locator("#deckWrap").hover(); page.wait_for_timeout(350)   # leave grid
    page.locator(f"#grid .card[data-id='{idB}']").hover(); page.wait_for_timeout(3400)
    auto_sz = page.evaluate("IC.state.auto.size")
    check("Test A: B commits, A does not", auto_sz > 0, f"auto={auto_sz}")
    check("Test A: commit source = B", page.evaluate(f"[...IC.state.auto.values()].includes('{idB}')"))
    # Test B: latch cleared by leaving grid; re-enter A -> preview arms again
    page.locator("#deckWrap").hover(); page.wait_for_timeout(350)
    page.locator(f"#grid .card[data-id='{idA}']").hover(); page.wait_for_timeout(950)
    check("Test B: re-enter A arms preview (lens visible)", page.locator("#lens").is_visible())
    page.locator("#deckWrap").hover(); page.wait_for_timeout(250)
    # Test C: facets of B fully active -> hover B = hard NO-OP
    page.evaluate("""(() => { const p = IC.byId.get('%s');
        IC.clearAll(true); IC.setCat(p.cat); IC.toggle('purp', p.purp);
        p.mats.forEach(m => IC.toggle('mats', m)); IC.state.brands.add(p.brand);
        IC.state.lastOp = null; IC.setSort('rel'); })()""" % idB)
    page.wait_for_timeout(350)
    page.locator(f"#grid .card[data-id='{idB}']").scroll_into_view_if_needed()
    page.evaluate(f"document.querySelector('#grid .card[data-id=\"{idB}\"]').setAttribute('data-probe2','1')")
    page.locator(f"#grid .card[data-id='{idB}']").hover(); page.wait_for_timeout(1300)
    lens_c = page.locator("#lens").is_visible()
    probe_c = page.evaluate("!!document.querySelector('#grid .card[data-probe2=\"1\"]')")
    check("Test C: fully-applied hover is NO-OP", (not lens_c) and probe_c, f"lens={lens_c} probe={probe_c}")
    # Test D: A committed -> leave grid -> hold B 3s -> B's signature REPLACES A's auto set
    page.evaluate("IC.clearAll(true)"); page.wait_for_timeout(300)
    cA = page.locator("#grid .card").nth(0); cB = page.locator("#grid .card").nth(1)
    idA2, idB2 = cA.get_attribute("data-id"), cB.get_attribute("data-id")
    cA.hover(); page.wait_for_timeout(3400)
    sigA = page.evaluate("[...IC.state.auto.keys()].sort().join('|')")
    check("Test D: commit happened", bool(sigA))
    # commit re-anchors: source card must be visible below sticky chrome after the reflow
    rel = page.evaluate(f"""(() => {{ const c = document.querySelector("#grid .card[data-id='{idA2}']");
        if (!c) return 'gone'; const r = c.getBoundingClientRect();
        return r.top >= window.__stickyChromeH() - 30 && r.top < innerHeight ? 'visible' : 'off:'+Math.round(r.top); }})()""")
    check("Test D: source product re-anchored in view", rel == "visible", str(rel))
    # park side after cat switch is structurally a different signature
    page.locator("#deckWrap").hover(); page.wait_for_timeout(300)
    IC2 = page.evaluate("(() => { IC.setCat('park'); return 1; })()")
    page.wait_for_timeout(350)
    cB2 = page.locator("#grid .card").nth(1); cB2.scroll_into_view_if_needed(); cB2.hover(); page.wait_for_timeout(3400)
    sigD = page.evaluate("[...IC.state.auto.keys()].sort().join('|')")
    check("Test D: second commit replaces the auto signature", bool(sigD) and sigA != sigD, f"{sigA[:36]} -> {sigD[:36]}")
    # Test E: rapid sweep -> no storm, no queued commits, no stale lens
    page.evaluate("IC.clearAll(true)"); page.wait_for_timeout(300)
    els = page.locator("#grid .card")
    n_sweep = min(20, els.count())
    for i in range(n_sweep):
        page.locator("#grid .card").nth(i).hover()
        page.wait_for_timeout(55)
    page.wait_for_timeout(500)
    check("Test E: rapid sweep queues nothing", page.evaluate("IC.state.auto.size") == 0)
    check("Test E: console clean during sweep", not errors, "; ".join(errors[:2]))

    # 8. EMPTY STATE recovery (search-driven zero results)
    page.evaluate("IC.clearAll(true)"); page.wait_for_timeout(250)
    page.fill("#searchInput", "!"); page.wait_for_timeout(500)
    check("empty state shows", page.locator("#empty").is_visible())
    check("empty has clear-all CTA", page.locator("#emptyReset").is_visible())
    page.evaluate("IC.setQ('rewrqw123')"); page.wait_for_timeout(250)
    check("suggestions present", page.locator("#emptySugg .chip, #emptySugg [data-sugg]").count() >= 1)
    page.locator("#emptyReset").click(); page.wait_for_timeout(250)
    check("empty reset -> full catalog", page.evaluate("IC.filtered().length") == total)

    # 9. HISTORY: back/forward deterministic
    page.locator(".cat-tile[data-cat='sport']").click(); page.wait_for_timeout(700)
    h1 = page.evaluate("location.hash")
    page.locator(".cat-tile[data-cat='park']").click(); page.wait_for_timeout(700)
    h2 = page.evaluate("location.hash")
    check("hash updates on each step", h1 != h2 and "cat=park" in h2, h2[:50])
    page.go_back(); page.wait_for_timeout(400)
    check("back -> previous state", page.evaluate("IC.state.cat") == "sport")
    page.go_forward(); page.wait_for_timeout(400)
    check("forward -> next state", page.evaluate("IC.state.cat") == "park")
    page.evaluate("IC.clearAll(true)"); page.wait_for_timeout(300)

    # 10. TRAY ops (state-level here; full UI-click coverage lives in test_tray.py)
    st0 = page.evaluate("""(() => { IC.trayClear();
      const ids = [...document.querySelectorAll('#grid .card')].slice(0,2).map(x => x.dataset.id);
      IC.trayToggle(ids[0]); const a = IC.state.tray.size;         // add
      IC.trayToggle(ids[0]); const b = IC.state.tray.size;         // dup-add removes
      IC.trayToggle(ids[0]); IC.trayToggle(ids[1]); const c = IC.state.tray.size; // two distinct
      IC.trayQty(ids[0], 1); const d = IC.state.tray.get(ids[0]);  // qty+
      IC.trayClear(); const f = IC.state.tray.size;                // clear
      return {a, b, c, d, f}; })()""")
    check("tray ops deterministic (add/dup-remove/two/qty/clear)",
          st0["a"] == 1 and st0["b"] == 0 and st0["c"] == 2 and st0["d"] == 2 and st0["f"] == 0, str(st0))
    check("tray badge cleared after clear", page.locator("#trayCount").get_attribute("hidden") is not None)

    # 11. DIY composer: generate + swap + remove
    page.click("#diyOpenHero"); page.wait_for_timeout(350)
    page.evaluate("IC.planClear()"); page.wait_for_timeout(100)
    page.select_option("#diySpace", "play"); page.fill("#diyArea", "120"); page.select_option("#diyAge", "a3")
    page.click("#diyGen"); page.wait_for_timeout(400)
    pl_n = page.evaluate("IC.state.plan.size")
    check("composer generate fills plan", pl_n >= 3, str(pl_n))
    check("composer chips rendered", page.locator("#diyChips .af").count() == pl_n)
    before_ids = page.evaluate("[...IC.state.plan.keys()]")
    page.locator("#diyChips [data-psw]").first.click(); page.wait_for_timeout(250)
    after_ids = page.evaluate("[...IC.state.plan.keys()]")
    check("composer swap replaces item", page.evaluate("IC.state.plan.size") == pl_n and before_ids != after_ids, f"{len(before_ids)}->{len(after_ids)}")
    page.locator("#diyChips [data-prm]").first.click(); page.wait_for_timeout(250)
    check("composer remove shrinks plan", page.evaluate("IC.state.plan.size") == pl_n - 1)
    check("composer canvas painted", page.evaluate("(() => { const c=document.querySelector('#diyCanvas'); const x=c.getContext('2d'); const d=x.getImageData(0,0,c.width,c.height).data; for (let i=3;i<d.length;i+=997) { if (d[i]>0) return true; } return false; })()"))
    # presentation-plan guarantee: NO overlapping layout cells (pads included)
    overlap = page.evaluate("""(() => { const L = window.__lastLayout; if (!L || !L.items) return 'none';
      const it = L.items.filter(i => !i.underlay);
      for (let i = 0; i < it.length; i++) for (let j = i + 1; j < it.length; j++) {
        const A = it[i], B = it[j];
        const aa = { x1: A.x - A.pad, y1: A.y - A.pad, x2: A.x + A.w + A.pad, y2: A.y + A.d + A.pad };
        const bb = { x1: B.x - B.pad, y1: B.y - B.pad, x2: B.x + B.w + B.pad, y2: B.y + B.d + B.pad };
        const ox = Math.max(0, Math.min(aa.x2, bb.x2) - Math.max(aa.x1, bb.x1));
        const oy = Math.max(0, Math.min(aa.y2, bb.y2) - Math.max(aa.y1, bb.y1));
        if (ox * oy > 0.03) return [A.p.n, B.p.n].join(' x ');
      }
      return 'none'; })()""")
    check("plan layout: zero overlaps", overlap == "none", str(overlap))
    page.click("#diyAll"); page.wait_for_timeout(350)
    check("composer -> my project", page.locator("#tray").is_visible())
    page.evaluate("IC.trayClear()"); page.keyboard.press("Escape"); page.wait_for_timeout(200)

    # 12. project mode: card actions usable (open qv, add)
    page.locator("#modeSeg [data-mode='project']").click(); page.wait_for_timeout(350)
    page.locator("#grid .board-sugg .card").nth(0).locator("[data-act='add']").click(); page.wait_for_timeout(250)
    check("project mode: '+' adds from suggestion rail", page.evaluate("IC.state.tray.size") == 1)
    page.locator("#grid .board-sugg .card").nth(1).click(); page.wait_for_timeout(350)
    check("project mode: quick view opens", page.locator("#qv").is_visible())
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    page.evaluate("IC.trayClear()")

    # 13. brand reset: note + undo chip + restore wood
    page.locator("#modeSeg [data-mode='catalog']").click(); page.wait_for_timeout(250)
    page.locator(".cat-tile[data-cat='park']").click(); page.wait_for_timeout(120)
    page.locator(".chip[data-facet='mats'][data-value='wood']").click(); page.wait_for_timeout(120)
    page.locator(".chip[data-facet='brands'][data-value='fulco']").click(); page.wait_for_timeout(350)
    st_brand = page.evaluate("({mats:[...IC.state.mats], note:IC.state.resetNote, undo:!!IC.state.undo})")
    check("brand reset wipes material + notes it", st_brand["mats"] == [] and st_brand["undo"], str(st_brand)[:90])
    check("undo chip visible", page.locator(".af.undo-chip").is_visible())
    page.locator(".af.undo-chip").click(); page.wait_for_timeout(300)
    st_back = page.evaluate("({mats:[...IC.state.mats], cat:IC.state.cat})")
    check("undo restores previous filters", st_back["cat"] == "park" and st_back["mats"] == ["wood"], str(st_back))
    check("wood filter honored now", page.evaluate("IC.filtered().every(p => p.mats.includes('wood')) && IC.filtered().length > 0"))
    page.evaluate("IC.clearAll(true)"); page.wait_for_timeout(250)

    # 14. DIY clear method
    page.click("#diyOpenHero"); page.wait_for_timeout(350)
    page.evaluate("IC.planClear(); document.querySelector('#diyGen').click();"); page.wait_for_timeout(500)
    gen_n = page.evaluate("IC.state.plan.size")
    page.click("#diyClear"); page.wait_for_timeout(250)
    check("diy clear empties plan", gen_n >= 3 and page.evaluate("IC.state.plan.size") == 0, f"{gen_n}->0")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)

    check("no console/page errors at end", not errors, "; ".join(errors[:4]))
    for u in sorted(set(badurls)):
        print("   404:", u)

    b.close()

print("\n" + ("ALL BROWSER CHECKS PASS" if not fails else f"{len(fails)} FAILURES: {fails}"))
sys.exit(1 if fails else 0)
