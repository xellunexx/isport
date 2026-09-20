"""P4 SEO layer: prerendered static pages into .server/webroot.

Routes:
  /p/<id>/index.html           product pages (2,579)
  /series/<slug>/index.html    series index pages (105)  [products grouped]
  /brand/<slug>/index.html     brand pages
  /cat/<slug>/index.html       division pages
  /audience/<slug>/index.html  target-group pages (6)   [from targets.json]
  /project/<i>/index.html      facility pages (51)

  /sitemap.xml, /robots.txt, /redirects.json (old site paths -> new routes, server 301s)

Product/series pages carry real content (name, brand, series, specs, image, JSON-LD Product).
Each page also offers the live app deep link.
"""
import io, json, os, re, sys
from html import escape
from urllib.parse import urljoin, quote, unquote as _unq
sys.stdout.reconfigure(encoding="utf-8")

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(BASE, ".server", "webroot")
HOST = "https://compromise-secondary-bill-nails.trycloudflare.com"  # canonical host (swap at domain time)

norm = json.load(open(os.path.join(BASE, "crawl", "catalog.norm.json"), encoding="utf-8"))
data = json.loads(io.open(os.path.join(BASE, "data", "catalog.js"), encoding="utf-8").read().split("=", 1)[1].rstrip(";\n"))
targets = data.get("targets", [])
facilities = data.get("facilities", [])
# brands.js is a JS literal; evaluate it with node to a JSON snapshot
import subprocess
brands_json = subprocess.run(
    [os.path.join(BASE, ".server", "bin", "node.exe"), "-e",
     "global.window={};require('%s');console.log(JSON.stringify(window.IC_BRANDS))" % os.path.join(BASE, "data", "brands.js").replace("\\", "/")],
    capture_output=True, text=True, encoding="utf-8").stdout
brands = json.loads(brands_json)

CAT_T = {"play": "Игра", "park": "Парк", "sport": "Спорт", "flooring": "Настилки"}

CSS = """
*{box-sizing:border-box}body{margin:0;font-family:system-ui,'Segoe UI',sans-serif;background:#f2efe7;color:#22241d;line-height:1.55}
.wrap{max-width:960px;margin:0 auto;padding:1.4rem 1.1rem 3rem}
header{padding:1rem 0;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem}
.logo{font-weight:800;text-transform:uppercase;letter-spacing:.04em;text-decoration:none;color:#22241d}
.logo b{color:#d14d0f}
nav a{margin-left:1rem;color:#5c584b;font-size:.9rem;text-decoration:none}
nav a:hover{color:#d14d0f}
.crum{color:#8b8677;font-size:.8rem;margin:1rem 0}
.crum a{color:#8b8677}
h1{font-size:1.9rem;margin:.2rem 0 .6rem;line-height:1.15}
h2{font-size:1.15rem;margin:2rem 0 .7rem;text-transform:uppercase;letter-spacing:.05em;color:#5c584b}
.hero{display:grid;grid-template-columns:1.1fr 1fr;gap:1.6rem;align-items:start}
@media(max-width:800px){.hero{grid-template-columns:1fr}}
.pimg{background:#fff;border:1px solid #e2ded2;border-radius:14px;padding:.8rem}
.pimg img{width:100%;object-fit:contain}
table.specs{width:100%;border-collapse:collapse;font-size:.95rem;background:#fff;border-radius:12px;overflow:hidden}
table.specs td{padding:.55rem .8rem;border-bottom:1px solid #eeeade}
table.specs td:first-child{color:#8b8677;width:42%}
.chips{display:flex;flex-wrap:wrap;gap:.4rem;margin:.4rem 0 .9rem}
.chip{background:#fff;border:1px solid #ddd6c7;border-radius:99px;padding:.25rem .8rem;font-size:.82rem;text-decoration:none;color:#44413a}
.chip:hover{border-color:#d14d0f;color:#d14d0f}
.grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:.8rem;margin-top:.6rem}
.mic{background:#fff;border:1px solid #e2ded2;border-radius:10px;padding:.55rem;text-decoration:none;color:#22241d;font-size:.82rem}
.mic img{width:100%;aspect-ratio:4/3;object-fit:contain;border-radius:6px;background:#faf8f3}
.mic span{display:block;margin-top:.35rem}
a.cta{display:inline-block;background:#d14d0f;color:#fff;text-decoration:none;padding:.75rem 1.5rem;border-radius:99px;font-weight:700;margin:.9rem .5rem 0 0}
a.cta2{background:#fff;color:#d14d0f;border:1px solid #d14d0f}
footer{margin-top:3rem;color:#8b8677;font-size:.78rem;border-top:1px solid #ddd;padding-top:1rem}
"""

def head(title, desc, canon_path, extra=""):
    return f"""<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)}</title><meta name="description" content="{escape(desc[:158])}">
<link rel="canonical" href="{HOST}{canon_path}">
<meta property="og:title" content="{escape(title)}"><meta property="og:description" content="{escape(desc[:158])}">
<meta property="og:type" content="website"><meta property="og:url" content="{HOST}{canon_path}">
<style>{CSS}</style>{extra}</head><body><div class="wrap">
<header><a class="logo" href="/">Инфра<b>Концепт</b></a>
<nav><a href="/#catalog">Каталог</a><a href="/#aud">За кого</a><a href="/#proj">Проекти</a><a href="/#contacts">Контакти</a></nav></header>
"""

def foot():
    return """<footer>Инфра Концепт ООД · +359 894 445 492 · infraconcept.bg<br>Страница за търсачки и споделяне — пълното изживяване е в приложението.</footer></div></body></html>"""

def write(rel, html):
    p = os.path.join(WEB, *rel.split("/"), "index.html")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with io.open(p, "w", encoding="utf-8") as f:
        f.write(html)

site_urls = []
redirects = {}

# ---------- products ----------
byid_index = {p["id"]: p for p in data["products"]}
series_map = {}
prod_count = 0
for p in data["products"]:
    pid = p["id"]
    series_map.setdefault(p.get("series") or "_", []).append(pid)
    cat = CAT_T.get(p["cat"], p["cat"])
    bname = (brands.get(p["brand"], {}) or {}).get("name", p["brand"])
    crumbs = f'<div class="crum"><a href="/">Начало</a> · <a href="/cat/{p["cat"]}/">{escape(cat)}</a> · <a href="/brand/{p["brand"]}/">{escape(bname)}</a>' + \
             (f' · <a href="/series/{p["series"]}/">{escape(p["sname"])}</a>' if p.get("series") else "") + "</div>"
    sp = p.get("sp") or {}
    specs = "".join(f"<tr><td>{escape(k)}</td><td>{escape(v)}</td></tr>" for k, v in
                    [("Размери", sp.get("d")), ("Височина на падане", sp.get("f")),
                     ("Ползватели", sp.get("u")), ("Зона на безопасност", sp.get("z"))] if v)
    age = f"{p['age'][0]}–{p['age'][1] if p['age'][1] < 99 else '+'}" if p.get("age") else ""
    if age:
        specs += f"<tr><td>Възрастова група</td><td>{escape(age)}</td></tr>"
    img = p["img"][0] if p.get("img") else ""
    img_tag = f'<div class="pimg"><img src="/{escape(img)}" alt="{escape(p["n"])}"></div>' if img else ""
    desc = f"{p['n']} — {bname}, {cat}" + (f", серия {p.get('sname')}." if p.get("sname") else ".")
    jsonld = json.dumps({
        "@context": "https://schema.org", "@type": "Product", "name": p["n"], "sku": p.get("code") or pid,
        "brand": {"@type": "Brand", "name": bname}, "image": HOST + "/" + img if img else None,
        "description": desc, "url": f"{HOST}/p/{pid}/", "category": cat,
    }, ensure_ascii=False)
    html = head(p["n"], desc, f"/p/{pid}/", f'<script type="application/ld+json">{jsonld}</script>') + \
        crumbs + f"""<div class="hero">{img_tag}<div>
        <h1>{escape(p["n"])}</h1>
        <div class="chips">
          <a class="chip" href="/cat/{p["cat"]}/">{escape(cat)}</a>
          <a class="chip" href="/brand/{p["brand"]}/">{escape(bname)}</a>
          {f'<a class="chip" href="/series/{p["series"]}/">{escape(p["sname"])}</a>' if p.get("series") else ""}
        </div>
        {f'<table class="specs">{specs}</table>' if specs else ""}
        <a class="cta" href="/#/p/{pid}">Бърз преглед в каталога</a>
        <a class="cta cta2" href="/">← Към каталога</a>
        </div></div>""" + foot()
    write(f"p/{pid}", html)
    site_urls.append(f"/p/{pid}/")
    redirects["/product/" + pid + "/"] = f"/p/{pid}/"
    redirects["/product/" + quote(pid) + "/"] = f"/p/{pid}/"  # non-latin slugs existed URL-encoded too
    if p.get("url"):
        old_tail = p["url"].rstrip("/").split("/")[-1]
        redirects["/product/" + old_tail + "/"] = f"/p/{pid}/"
        redirects["/product/" + _unq(old_tail) + "/"] = f"/p/{pid}/"
    prod_count += 1
print("product pages:", prod_count)

# ---------- series ----------
for sname, pids in series_map.items():
    if sname == "_":
        continue
    label = byid_index[pids[0]].get("sname") or sname
    grid = "".join(f'<a class="mic" href="/p/{i}/">{f"<img src=\'/{byid_index[i]['img'][0]}\' alt=\'\'>" if byid_index[i].get("img") else ""}<span>{escape(byid_index[i]["n"])}</span></a>' for i in pids[:48])
    html = head(f"Серия {label}", f"Серия {label}: {len(pids)} продукта от каталога на Инфра Концепт.", f"/series/{sname}/") + \
        f'<div class="crum"><a href="/">Начало</a> · Серия</div><h1>{escape(label)}</h1><p>{len(pids)} продукта.</p><div class="grid2">{grid}</div>' + foot()
    write(f"series/{sname}", html)
    site_urls.append(f"/series/{sname}/")
    redirects[f"/product-series/{sname}/"] = f"/series/{sname}/"
print("series pages:", len(series_map) - (1 if "_" in series_map else 0))

# ---------- brands ----------
for bslug, b in brands.items():
    plist = [pid for pid, p in byid_index.items() if p["brand"] == bslug]
    name = b["name"]; d = b["d"]["bg"]
    grid = "".join(f'<a class="mic" href="/p/{i}/">{f"<img src=\'/{byid_index[i]['img'][0]}\' alt=\'\'>" if byid_index[i].get("img") else ""}<span>{escape(byid_index[i]["n"])}</span></a>' for i in plist[:36])
    html = head(f"{name} — продукти", d, f"/brand/{bslug}/") + \
        f'<div class="crum"><a href="/">Начало</a> · Производител</div><h1>{escape(name)}</h1><p>{escape(d)}</p><p>{len(plist)} продукта.</p><div class="grid2">{grid}</div><a class="cta" href="/#/c?brand={bslug}">Филтрирай в каталога</a>' + foot()
    write(f"brand/{bslug}", html)
    site_urls.append(f"/brand/{bslug}/")
    redirects[f"/product-manufacturers/{bslug}/"] = f"/brand/{bslug}/"
print("brand pages:", len(brands))

# ---------- cats ----------
for ck, ct in CAT_T.items():
    plist = [pid for pid, p in byid_index.items() if p["cat"] == ck]
    grid = "".join(f'<a class="mic" href="/p/{i}/">{f"<img src=\'/{byid_index[i]['img'][0]}\' alt=\'\'>" if byid_index[i].get("img") else ""}<span>{escape(byid_index[i]["n"])}</span></a>' for i in plist[:36])
    html = head(f"Каталог: {ct}", f"{ct}: {len(plist)} продукта — детски площадки, спорт, паркове, настилки.", f"/cat/{ck}/") + \
        f'<div class="crum"><a href="/">Начало</a> · Каталог</div><h1>{escape(ct)}</h1><p>{len(plist)} продукта.</p><div class="grid2">{grid}</div><a class="cta" href="/#/c?cat={ck}">Разгледай с филтри</a>' + foot()
    write(f"cat/{ck}", html)
    site_urls.append(f"/cat/{ck}/")
print("cat pages: 4")

# ---------- audiences ----------
for t in targets:
    slug = t["slug"]
    txt = " ".join(t.get("paras", []))
    imgs = "".join(f'<div class="pimg"><img src="/{i}" alt="{escape(t["title"])}"></div>' for i in t.get("imgs", [])[:2])
    html = head(t["title"], txt or t["title"], f"/audience/{slug}/") + \
        f'<div class="crum"><a href="/">Начало</a> · За кого</div><h1>{escape(t["title"])}</h1><p>{escape(txt)}</p><div class="hero">{imgs}</div><a class="cta" href="/#/aud">Конфигурирай подбор</a>' + foot()
    write(f"audience/{slug}", html)
    site_urls.append(f"/audience/{slug}/")
    redirects[f"/target-grupi/{slug}/"] = f"/audience/{slug}/"
print("audience pages:", len(targets))
redirects["/target-grupi/"] = "/#aud"

# ---------- projects ----------
for i, f in enumerate(facilities):
    imgs = "".join(f'<div class="pimg"><img src="/{im}" alt="{escape(f["t"])}"></div>' for im in f.get("imgs", [])[:3])
    html = head(f["t"], f'{f["t"]}{" — " + f["loc"] if f.get("loc") else ""} · реализиран проект на Инфра Концепт.', f"/project/{i}/") + \
        f'<div class="crum"><a href="/">Начало</a> · Проекти</div><h1>{escape(f["t"])}</h1><p>{escape(f.get("loc", ""))}</p><div class="hero">{imgs}</div><a class="cta" href="/#/proj">Всички проекти</a>' + foot()
    write(f"project/{i}", html)
    site_urls.append(f"/project/{i}/")
    if f.get("url"):
        pth = "/" + f["url"].split("infraconcept.bg/", 1)[-1]
        redirects[pth] = f"/project/{i}/"
print("project pages:", len(facilities))

# ---------- sitemap / robots / redirects ----------
urls = ["/"] + sorted(set(site_urls))
sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + \
     "".join(f"  <url><loc>{HOST}{u}</loc></url>\n" for u in urls) + "</urlset>\n"
io.open(os.path.join(WEB, "sitemap.xml"), "w", encoding="utf-8").write(sm)
io.open(os.path.join(WEB, "robots.txt"), "w", encoding="utf-8").write(
    "User-agent: *\nAllow: /\nDisallow: /_\nSitemap: " + HOST + "/sitemap.xml\n")
json.dump(redirects, io.open(os.path.join(WEB, "redirects.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("sitemap urls:", len(urls), "| redirects:", len(redirects))
