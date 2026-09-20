# Performance QA over LOCAL node origin (measures app, not tunnel latency):
# cold load, imgs eager/lazy counts, filter re-render timings, long tasks, memory soak, throttle pass.
import threading, functools, http.server, socketserver, time, sys, json, subprocess, os
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live"
PORT = 8156
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve():  # reuse the production node server on a second port
    env = dict(os.environ); env["IC_PORT"] = str(PORT)
    subprocess.Popen([os.path.join(BASE, ".server", "bin", "node.exe"),
                      os.path.join(BASE, ".server", "server.js")], env=env,
                     stdout=open(os.path.join(BASE, ".server", "logs", "perf-http.log"), "w"),
                     stderr=subprocess.STDOUT)
threading.Thread(target=lambda: serve(), daemon=True).start()
time.sleep(1.2)

out = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page()
    reqs = []
    page.on("request", lambda r: reqs.append(r.url))
    lt = []
    page.on("console", lambda m: lt.append(m.text) if m.type == "error" else None)
    # long task + CLS + LCP observers
    page.add_init_script("""
      window.__lt = 0; window.__cls = 0; window.__lcp = 0;
      try {
        new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt++; }).observe({type:'longtask', buffered:true});
        new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({type:'layout-shift', buffered:true});
        new PerformanceObserver(l => { const es = l.getEntries(); if (es.length) window.__lcp = es[es.length-1].startTime; }).observe({type:'largest-contentful-paint', buffered:true});
      } catch(e){}
    """)
    t0 = time.perf_counter()
    page.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    page.wait_for_function("window.appReady === true", timeout=30000)
    ready_ms = round((time.perf_counter() - t0) * 1000)
    page.wait_for_timeout(2500)
    out["cold_appReady_ms"] = ready_ms
    out["cold_LCP_ms"] = page.evaluate("Math.round(window.__lcp)")
    out["cold_CLS"] = page.evaluate("Math.round(window.__cls * 1000) / 1000")
    out["cold_requests"] = len(reqs)
    out["console_errors"] = lt

    # repeat/cached load (same context => warmed cache)
    reqs.clear()
    t1 = time.perf_counter()
    page.reload(); page.wait_for_function("window.appReady === true")
    out["repeat_appReady_ms"] = round((time.perf_counter() - t1) * 1000)
    out["repeat_requests"] = len(reqs)

    # filter re-render timing: 12 facet toggles, measure wall time per batch
    times = []
    ops = [f"IC.setCat('{c}')" for c in ["play", "park", "sport", "flooring", "park", "play"]] + \
          ["IC.toggle('mats','wood')", "IC.toggle('ages','a3')", "IC.toggle('purp','swings')", "IC.setQ('пейка')", "IC.setQ('')", "IC.setCat('sport')"]
    for op in ops:
        t = time.perf_counter()
        page.evaluate(op)
        page.wait_for_timeout(30)
        times.append(round((time.perf_counter() - t) * 1000))
    out["facet_op_ms"] = {"min": min(times), "avg": round(sum(times)/len(times), 1), "max": max(times)}

    # hover: sweep 20 fast + 1 commit; memory snapshots
    page.evaluate("window.__lt = 0")
    mem0 = page.evaluate("performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0")

    els = page.locator("#grid .card")
    for i in range(min(20, els.count())):
        els.nth(i).hover(); page.wait_for_timeout(40)
    first = page.locator("#grid .card").first
    first.hover(); page.wait_for_timeout(3400)
    # 90-second realistic soak: repeated filter changes, mode switches, hovers
    soak_start = time.time()
    while time.time() - soak_start < 90:
        for op, pause in [("IC.setCat('play')", 100), ("IC.setMode('live')", 700), ("IC.setMode('catalog')", 200),
                          ("IC.toggle('mats','wood')", 100), ("IC.toggle('mats','wood')", 100),
                          ("IC.setCat('park')", 150)]:
            page.evaluate(op); page.wait_for_timeout(pause)
        try:
            page.locator("#grid .card").nth(3).hover()
        except Exception:
            pass
        page.wait_for_timeout(250)
    mem1 = page.evaluate("performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0")
    out["longTasks_during_hover+soak"] = page.evaluate("window.__lt")
    out["jsHeap_MB_start"] = round(mem0, 1)
    out["jsHeap_MB_after_90s"] = round(mem1, 1)
    out["heap_growth_MB"] = round(mem1 - mem0, 1)
    out["total_requests_after_soak"] = len(reqs)
    out["console_errors_after_soak"] = lt[:5]

    # throttled (Fast 3G-ish) cold load via CDP
    ctx2 = b.new_context(viewport={"width": 1280, "height": 900})
    p2 = ctx2.new_page()
    cdp = p2.context.new_cdp_session(p2)
    cdp.send("Network.enable")
    cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 150, "downloadThroughput": 1600000, "uploadThroughput": 750000})
    t2 = time.perf_counter()
    p2.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    p2.wait_for_function("window.appReady === true", timeout=60000)
    out["throttled_1.6Mbps_appReady_ms"] = round((time.perf_counter() - t2) * 1000)
    ctx2.close()
    b.close()

print(json.dumps(out, indent=1, ensure_ascii=False))
ok = (out["cold_appReady_ms"] < 2500 and out["repeat_appReady_ms"] < out["cold_appReady_ms"] and not out["console_errors"]
      and out["facet_op_ms"]["avg"] < 200 and out["longTasks_during_hover+soak"] < 12 and out["heap_growth_MB"] < 25
      and out["throttled_1.6Mbps_appReady_ms"] < 9000 and not out["console_errors_after_soak"])
print("\nPERF GATE:", "PASS" if ok else "CHECK ITEMS ABOVE")
