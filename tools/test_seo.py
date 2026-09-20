# P4 SEO verification: static routes, redirects, sitemap/robots, no-JS content, app deep-links. localhost + WAN.
import sys, os, json, requests
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

WAN = None
_urls_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".server", "PUBLIC-URL.txt")
if len(sys.argv) > 1:
    WAN = sys.argv[1]
elif os.path.exists(_urls_file):
    WAN = open(_urls_file, encoding="utf-8").read().strip() or None
LOC = "http://127.0.0.1:8043"
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"   [{extra}]" if extra else ""))
    if not cond: fails.append(name)

def probe(base, tag):
    pid = "flow-peyka-bez-oblegalka-lfl122"
    # static product page: real content without JS
    r = requests.get(f"{base}/p/{pid}/", timeout=30)
    check(f"{tag} /p/<id> 200 + title + specs + canonical", r.status_code == 200 and "FLOW пейка" in r.text and "canonical" in r.text and "schema.org" in r.text)
    check(f"{tag} /p/<id> JSON-LD Product", '{"@context":"https://schema.org","@type":"Product"' in r.text.replace(" ", ""))
    # series / brand / cat / audience / project
    for route in ["/series/pejki-fulco/", "/brand/fulco/", "/cat/park/", "/audience/detski-gradini/", "/project/0/"]:
        rr = requests.get(base + route, timeout=30)
        check(f"{tag} {route} 200", rr.status_code == 200 and "<h1" in rr.text, str(rr.status_code))
    # old-site route redirects
    rr = requests.get(f"{base}/product/{pid}/", timeout=30, allow_redirects=False)
    check(f"{tag} old /product/ 301 -> /p/", rr.status_code == 301 and f"/p/{pid}/" in rr.headers.get("Location", ""), str(rr.headers.get("Location", "")))
    rr = requests.get(f"{base}/product-series/pejki-fulco/", timeout=30, allow_redirects=False)
    check(f"{tag} old series 301", rr.status_code == 301)
    rr = requests.get(f"{base}/target-grupi/detski-gradini/", timeout=30, allow_redirects=False)
    check(f"{tag} old target-grupi 301", rr.status_code == 301 and "/audience/detski-gradini/" in rr.headers.get("Location", ""))
    # sitemap + robots
    rr = requests.get(f"{base}/sitemap.xml", timeout=30)
    check(f"{tag} sitemap.xml urls>2700", rr.status_code == 200 and rr.text.count("<url>") > 2700, str(rr.text.count("<url>")))
    rr = requests.get(f"{base}/robots.txt", timeout=20)
    check(f"{tag} robots ok", rr.status_code == 200 and "Sitemap:" in rr.text)

for base, tag in [(LOC, "local"), (WAN, "WAN")]:
    if not base:
        print("SKIP WAN (no live URL recorded)")
        continue
    try:
        probe(base, tag)
    except Exception as e:
        check(tag + " probe", False, str(e)[:80])

# app deep link: /#/p/<id> opens quickview
if WAN:
    with sync_playwright() as pw:
        b = pw.chromium.launch(); page = b.new_page()
        page.goto(f"{WAN}/#/p/flow-peyka-bez-oblegalka-lfl122", wait_until="domcontentloaded")
        page.wait_for_function("window.appReady === true", timeout=45000)
        page.wait_for_timeout(600)
        check("WAN deep-link opens quickview", page.locator("#qv").is_visible())
        b.close()
else:
    print("SKIP deep-link (no live URL recorded)")

print("\n" + ("SEO/P4 GATE PASS" if not fails else f"SEO FAILURES: {fails}"))
sys.exit(1 if fails else 0)
