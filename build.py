# -*- coding: utf-8 -*-
"""Infraconcept 2026 — static site generator.

Usage:  python build.py            -> writes dist/
        python build.py --serve    -> build + http server on :8031
"""
import json
import os
import shutil
import sys

from catalog_data import (LANGS, DEFAULT_LANG, PURPOSES, TYPES, ALL_TYPES, AGES,
                          MATERIALS, BRANDS, PRODUCTS, PURPOSE_HUE, icon)
from components import (esc, fmt, raw, head, header, footer, card, filterbar,
                        quickview_modal, json_island, breadcrumb, LANG_URL, base_for)

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
SITE = "https://infraconcept.bg"

CONTENT = {}
def load(lang):
    if lang not in CONTENT:
        with open(os.path.join(ROOT, "content", f"{lang}.json"), encoding="utf-8") as f:
            CONTENT[lang] = json.load(f)
    return dict(CONTENT[lang])  # copy — we mutate _cur_sub per page

SECTORS = ["school", "kinder", "muni", "hotel", "build", "arch"]
SECTOR_PRESET = {
    "school": "?purpose=sport,play&age=3-6,6-12",
    "kinder": "?purpose=play&age=0-3,3-6",
    "muni":   "?purpose=park,play,sport",
    "hotel":  "?purpose=play,flooring",
    "build":  "?purpose=park,flooring",
    "arch":   "",
}
FLOOR_TYPES = TYPES["flooring"]

def page(depth, lang, c, sub, title, desc, body, active="", extra_head="", extra_js=""):
    base = base_for(depth)
    c["_cur_sub"] = sub
    return (head(lang, c, title, desc, base, sub)
            + f"<body data-lang=\"{lang}\" data-base=\"{base}\" data-sub=\"/{esc(sub)}\">"
            + extra_head
            + header(lang, c, base, active)
            + f"<main>{body}</main>"
            + footer(lang, c, base)
            + extra_js
            + "</body></html>")

def write(rel, text):
    path = os.path.join(DIST, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)

# ------------------------------------------------------------------ HOME
def featured():
    picks = []
    for want in ["complex", "rope", "streetworkout", "climbing", "bench", "cork", "inclusive", "figure3d"]:
        for p in PRODUCTS:
            if p["type"] == want and p not in picks:
                picks.append(p)
                break
    return picks[:8]

def ptitle(p, c):
    return f"{c.get('t_' + p['type'], p['type'])} · {p['series']} {p['model']}"

def build_home(lang):
    c = load(lang)
    base = base_for(1)
    L = lang
    floats = "".join(f'<span class="fic i{i}" style="--h:{PURPOSE_HUE[p]}">{icon(t)}</span>'
                     for i, (p, t) in enumerate([("play","swing"),("play","complex"),("sport","streetworkout"),
                                                  ("park","bench"),("flooring","cork"),("play","rope"),
                                                  ("sport","climbing"),("park","lighting")]))
    sol_tiles = "".join(f"""
<a class="soltile" id="{s}" href="{base}{L}/resheniya/#{s}">
 <h4>{esc(c['sec_' + s + '_t'])}</h4><p>{esc(c['sec_' + s + '_d'])}</p><span class="go">→</span>
</a>""" for s in SECTORS)
    feat = "".join(card(p, c, lang, base) for p in featured())
    brands = "".join(f"""
<a class="bchip" href="{base}{L}/katalog/?brand={k}" title="{esc(c.get('brand_' + k + '_d'))}">
 <span class="bmono" style="--h:{(i * 36) % 360}">{esc(v['name'][:1])}</span><span>{esc(v['name'])}</span><small>{v['country']} · {v['since']}</small>
</a>""" for i, (k, v) in enumerate(BRANDS.items()))
    projs = "".join(f"""
<a class="prj" href="{base}{L}/obekti/" style="--h:{40 + i * 40}">
 <div class="prj-art"></div><h4>{esc(c[f'prj{i+1}_t'])}</h4><p>{esc(c[f'prj{i+1}_d'])}</p>
</a>""" for i in range(3))
    body = f"""
<section class="hero">
 <div class="mesh"></div><div class="grain"></div>
 <div class="floats">{floats}</div>
 <div class="hero-in">
  <p class="kicker">{esc(c['tagline'])}</p>
  <h1>{esc(c['hero_title'])}</h1>
  <p class="lede">{esc(c['hero_sub'])}</p>
  <div class="cta-row"><a class="btn big acc" href="{base}{L}/katalog/">{esc(c['hero_cta1'])} →</a>
  <a class="btn big ghost" href="{base}{L}/resheniya/">{esc(c['hero_cta2'])}</a></div>
  <div class="stats">
   <div><b>17+</b><span>{esc(c['stat_years'])}</span></div>
   <div><b>900+</b><span>{esc(c['stat_projects'])}</span></div>
   <div><b>3</b><span>{esc(c['stat_certs'])}</span></div>
   <div><b>10</b><span>{esc(c['stat_brands'])}</span></div>
  </div>
 </div>
</section>
<section class="wrap sol">
 <h2>{esc(c['home_sol_t'])}</h2><p class="sub">{esc(c['home_sol_s'])}</p>
 <div class="solgrid">{sol_tiles}</div>
</section>
<section class="wrap">
 <h2>{esc(c['home_feat_t'])}</h2><p class="sub">{esc(c['home_feat_s'])}</p>
 <div class="pgrid" id="home-grid">{feat}</div>
 <p class="center"><a class="btn" href="{base}{L}/katalog/">{esc(c['b_all'])} →</a></p>
</section>
<section class="wrap">
 <h2>{esc(c['home_brands_t'])}</h2>
 <div class="bchips">{brands}</div>
</section>
<section class="wrap">
 <h2>{esc(c['home_proj_t'])}</h2><p class="sub">{esc(c['home_proj_s'])}</p>
 <div class="prjgrid">{projs}</div>
</section>
<section class="ctaband">
 <div><h2>{esc(c['home_cta_t'])}</h2><p>{esc(c['home_cta_s'])}</p></div>
 <a class="btn big acc" href="{base}{L}/oferta/">{esc(c['home_cta_b'])} →</a>
</section>
"""
    return page(1, lang, c, "", c["site_name"], c["meta_desc"], body, active="home")

# ------------------------------------------------------------------ CATALOG
def build_catalog(lang):
    c = load(lang)
    base = base_for(2)
    L = lang
    grid = "".join(card(p, c, lang, base) for p in PRODUCTS)
    body = f"""
<section class="cathead">
 <h1>{esc(c['cat_t'])}</h1>
 <p class="sub">{esc(c['cat_s'])}</p>
</section>
{filterbar(c, lang)}
<section class="wrap catalog-wrap">
 <div class="pgrid" id="catalog-grid">{grid}</div>
 <div class="femptyline" id="empty-line" hidden><h3>{esc(c['f_empty'])}</h3><p>{esc(c['f_empty_hint'])}</p></div>
</section>
{quickview_modal(c)}
"""
    js = (f'<script src="{base}assets/js/catalog.js"></script>')
    return page(2, lang, c, "katalog/", c["cat_t"], c["cat_s"], body, active="catalog", extra_js=js,
                extra_head=json_island(PRODUCTS, c))

# ------------------------------------------------------------------ PRODUCT
def similar_for(p):
    same = [x for x in PRODUCTS if x["type"] == p["type"] and x["id"] != p["id"]]
    rest = [x for x in PRODUCTS if x["purpose"] == p["purpose"] and x["type"] != p["type"]]
    return (same + rest)[:6]

def build_product(lang, p):
    c = load(lang)
    base = base_for(3)
    L = lang
    b = BRANDS[p["brand"]]
    name = ptitle(p, c)
    sub = f"produkt/{p['slug']}/"
    mats = ", ".join(c.get("m_" + m, m) for m in p["mats"]) or "—"
    ages = ", ".join(c.get("a_" + a, a) for a in p["ages"]) or "—"
    certs = ", ".join(p["certs"]) or "—"
    crumb = breadcrumb(c, base, [(f"{base}{L}/", c["site_name"]),
                                 (f"{base}{L}/katalog/", c["nav_catalog"]),
                                 (f"{base}{L}/katalog/?type={p['type']}", c.get("t_" + p["type"], p["type"])),
                                 ("#", p["series"] + " " + p["model"])])
    rows = "".join([
        f'<div><dt>{esc(c["prod_brand"])}</dt><dd>{esc(b["name"])} ({b["country"]})</dd></div>',
        f'<div><dt>{esc(c["prod_series"])}</dt><dd>{esc(p["series"])}</dd></div>',
        f'<div><dt>{esc(c["prod_model"])}</dt><dd>{esc(p["model"])}</dd></div>',
        f'<div><dt>{esc(c["prod_dims"])}</dt><dd>{esc(p["dims"])}</dd></div>',
        f'<div><dt>{esc(c["prod_cap"])}</dt><dd>{esc(p["cap"])}</dd></div>',
        f'<div><dt>{esc(c["prod_mats"])}</dt><dd>{esc(mats)}</dd></div>',
        f'<div><dt>{esc(c["prod_ages"])}</dt><dd>{esc(ages)}</dd></div>',
        f'<div><dt>{esc(c["prod_certs"])}</dt><dd>{esc(certs)}</dd></div>',
        f'<div><dt>{esc(c["prod_class"])}</dt><dd>{esc(c["cl_" + str(p["cls"])])}</dd></div>',
        f'<div><dt>{esc(c["prod_avail"])}</dt><dd>{esc(c["av_" + p["avail"]])}</dd></div>',
    ])
    sim = "".join(card(x, c, lang, base) for x in similar_for(p))
    href_q = f"?purpose={p['purpose']}&type={p['type']}&brand={p['brand']}"
    body = f"""
<section class="wrap prod">
 {crumb}
 <div class="prodhead">
  <div class="prodart" style="--h:{p['hue']}">{icon(p['type'], 'pict xl')}<span class="pbrand">{esc(b['name'])}</span></div>
  <div class="prodmeta">
   <p class="kicker">{esc(c.get('t_' + p['type'], p['type']))} · {esc(c['p_' + p['purpose']])}</p>
   <h1>{esc(name)}</h1>
   <p class="muted">{esc(b['name'])} · {b['country']} · {esc(c['av_' + p['avail']])}</p>
   <div class="cta-row">
    <button type="button" class="btn big acc" data-add="{p['id']}">{esc(c['b_add'])}</button>
    <a class="btn big ghost" href="{base}{L}/katalog/{href_q}">{esc(c['b_similar'])} →</a>
   </div>
   <p class="muted small">{esc(c['prod_dwg'])}</p>
  </div>
 </div>
 <h2>{esc(c['prod_specs'])}</h2>
 <dl class="spec">{rows}</dl>
 <h2>{esc(c['prod_similar_t'])}</h2>
 <div class="pgrid">{sim}</div>
</section>
"""
    js = f'<script src="{base}assets/js/catalog.js"></script>'
    return page(3, lang, c, sub, name, c["meta_desc"], body, extra_js=js,
                extra_head=json_island(PRODUCTS, c))

# ------------------------------------------------------------------ SOLUTIONS
def build_solutions(lang):
    c = load(lang)
    base = base_for(2)
    L = lang
    cards = "".join(f"""
<div class="seccard" id="{s}">
 <div class="sech" style="--h:{(SECTORS.index(s) * 52) % 360}"><h3>{esc(c['sec_' + s + '_t'])}</h3></div>
 <div class="secb">
  <p>{esc(c['sec_' + s + '_d'])}</p>
  <ul><li>{esc(c['sec_' + s + '_b1'])}</li><li>{esc(c['sec_' + s + '_b2'])}</li><li>{esc(c['sec_' + s + '_b3'])}</li></ul>
  <a class="btn acc" href="{base}{L}/katalog/{SECTOR_PRESET[s]}">{esc(c['b_all'])} →</a>
 </div>
</div>""" for s in SECTORS)
    body = f"""
<section class="cathead"><h1>{esc(c['sol_t'])}</h1><p class="sub">{esc(c['sol_s'])}</p></section>
<section class="wrap secgrid">{cards}</section>
"""
    return page(2, lang, c, "resheniya/", c["sol_t"], c["sol_s"], body, active="solutions")

# ------------------------------------------------------------------ FLOORING
def build_flooring(lang):
    c = load(lang)
    base = base_for(2)
    L = lang
    chips = "".join(
        f'<a class="flchip" href="{base}{L}/katalog/?purpose=flooring&type={t}">{icon(t)}<span>{esc(c["t_" + t])}</span></a>'
        for t in FLOOR_TYPES)
    fl_products = [p for p in PRODUCTS if p["purpose"] == "flooring"]
    grid = "".join(card(p, c, lang, base) for p in fl_products[:6])
    body = f"""
<section class="cathead"><h1>{esc(c['fl_t'])}</h1><p class="sub">{esc(c['fl_s'])}</p></section>
<section class="wrap"><div class="flchips">{chips}</div></section>
<section class="wrap"><h2>{esc(c['cat_t'])} — {esc(c['p_flooring'])}</h2>
<div class="pgrid">{grid}</div>
<p class="center"><a class="btn" href="{base}{L}/katalog/?purpose=flooring">{esc(c['b_all'])} →</a></p></section>
"""
    return page(2, lang, c, "nastilki/", c["fl_t"], c["fl_s"], body, active="flooring")

# ------------------------------------------------------------------ BRANDS
def build_brands(lang):
    c = load(lang)
    base = base_for(2)
    L = lang
    items = []
    for i, (k, v) in enumerate(BRANDS.items()):
        n = sum(1 for p in PRODUCTS if p["brand"] == k)
        items.append(f"""
<a class="brandcard" href="{base}{L}/katalog/?brand={k}">
 <span class="bmono big" style="--h:{(i * 36) % 360}">{esc(v['name'][:1])}</span>
 <div><h3>{esc(v['name'])}</h3><p class="muted">{v['country']} · {v['since']} · <b>{n}</b> {esc(c['f_results']).replace('{n}', '').strip().lower()}</p>
 <p>{esc(c.get('brand_' + k + '_d'))}</p></div>
</a>""")
    body = f"""
<section class="cathead"><h1>{esc(c['brands_t'])}</h1></section>
<section class="wrap brandgrid">{''.join(items)}</section>
"""
    return page(2, lang, c, "proizvoditeli/", c["brands_t"], c["meta_desc"], body, active="brands")

# ------------------------------------------------------------------ PROJECTS
def build_projects(lang):
    c = load(lang)
    base = base_for(2)
    cards = "".join(f"""
<div class="prj big" style="--h:{40 + i * 40}"><div class="prj-art"></div>
<h3>{esc(c[f'prj{i}_t'])}</h3><p>{esc(c[f'prj{i}_d'])}</p></div>""" for i in range(1, 7))
    body = f"""
<section class="cathead"><h1>{esc(c['proj_t'])}</h1><p class="sub">{esc(c['proj_s'])}</p></section>
<section class="wrap prjgrid">{cards}</section>
"""
    return page(2, lang, c, "obekti/", c["proj_t"], c["proj_s"], body, active="projects")

# ------------------------------------------------------------------ SERVICES
def build_services(lang):
    c = load(lang)
    base = base_for(2)
    keys = ["consult", "build", "floor", "play", "sport", "park"]
    icons = {"consult": "M9 11l3 3 8-8 M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9",
             "build": "M3 21h18 M5 21V7l7-4 7 4v14 M9 21v-6h6v6",
             "floor": "M2 12l10-5 10 5-10 5z M2 12v5l10 5v-5 M22 12v5l-10 5",
             "play": "M12 3L4 20h16z M8.7 13h6.6",
             "sport": "M5 21V5 M19 21V5 M5 5h14",
             "park": "M6.5 4v15.5 M17.5 4v15.5 M4 6.5h16 M4 11h16"}
    cards = "".join(f"""
<div class="srvcard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="{icons[k]}"/></svg>
<div><h3>{esc(c['serv_' + k + '_t'])}</h3><p>{esc(c['serv_' + k + '_d'])}</p></div></div>""" for k in keys)
    body = f"""
<section class="cathead"><h1>{esc(c['serv_t'])}</h1></section>
<section class="wrap srvgrid">{cards}</section>
"""
    return page(2, lang, c, "uslugi/", c["serv_t"], c["meta_desc"], body, active="services")

# ------------------------------------------------------------------ ABOUT
def build_about(lang):
    c = load(lang)
    body = f"""
<section class="cathead"><h1>{esc(c['about_t'])}</h1></section>
<section class="wrap prose">
 <p class="lede">{esc(c['about_p1'])}</p>
 <p>{esc(c['about_p2'])}</p>
 <div class="isoband"><span>ISO 9001:2015</span><span>ISO 14001:2015</span><span>ISO 45001:2018</span></div>
</section>
"""
    return page(2, lang, c, "za-nas/", c["about_t"], c["about_p1"][:150], body, active="about")

# ------------------------------------------------------------------ CONTACTS
def build_contacts(lang):
    c = load(lang)
    body = f"""
<section class="cathead"><h1>{esc(c['contact_t'])}</h1></section>
<section class="wrap cgrid">
 <div class="ccard"><h3>{esc(c['contact_off1'])}</h3><p><a href="tel:+359894445492">+359 894 445 492</a><br/><a href="mailto:office@infraconcept.bg">office@infraconcept.bg</a></p></div>
 <div class="ccard"><h3>{esc(c['contact_ms'])}</h3><p><a href="tel:+359894445490">+359 894 445 490</a><br/><a href="mailto:south@infraconcept.bg">south@infraconcept.bg</a></p></div>
 <div class="ccard"><h3>{esc(c['contact_mn'])}</h3><p><a href="tel:+359894445491">+359 894 445 491</a><br/><a href="mailto:north@infraconcept.bg">north@infraconcept.bg</a></p></div>
 <form class="cform" onsubmit="return icContact(event)">
  <h3>{esc(c['contact_form_t'])}</h3>
  <input required placeholder="{esc(c['contact_name'])}" name="name"/>
  <input required type="email" placeholder="{esc(c['contact_email'])}" name="email"/>
  <textarea required placeholder="{esc(c['contact_msg'])}" name="msg" rows="5"></textarea>
  <button class="btn acc" type="submit">{esc(c['contact_send'])}</button>
  <p class="muted ok" hidden>{esc(c['contact_ok'])}</p>
 </form>
</section>
"""
    return page(2, lang, c, "kontakti/", c["contact_t"], c["meta_desc"], body, active="contacts")

# ------------------------------------------------------------------ QUOTE
def build_quote(lang):
    c = load(lang)
    base = base_for(2)
    items = {p["id"]: {"name": ptitle(p, c), "series": p["series"], "model": p["model"], "type": p["type"]}
             for p in PRODUCTS}
    body = f"""
<section class="cathead"><h1>{esc(c['q_t'])}</h1></section>
<section class="wrap quote">
 <div class="qitems" id="q-items"></div>
 <p class="muted" id="q-empty" hidden>{esc(c['q_empty'])}</p>
 <form class="cform" id="q-form">
  <div class="qrow"><input required name="name" placeholder="{esc(c['q_name'])}"/><input required name="org" placeholder="{esc(c['q_org'])}"/></div>
  <div class="qrow"><input required type="email" name="email" placeholder="{esc(c['q_email'])}"/><input name="phone" placeholder="{esc(c['q_phone'])}"/></div>
  <textarea name="msg" rows="4" placeholder="{esc(c['q_msg'])}"></textarea>
  <div class="cta-row">
   <button class="btn big acc" type="submit">{esc(c['q_send'])}</button>
   <button class="btn" type="button" id="q-dl">{esc(c['q_dl'])}</button>
  </div>
  <p class="muted small">{esc(c['q_note'])}</p>
 </form>
</section>
<script>window.IC_CART_META = {json.dumps(items, ensure_ascii=False)};
window.IC_Q = {{send_note: {json.dumps(c['q_note'])}, name: {json.dumps(c['q_name'])}, qty: {json.dumps(c['q_qty'])}, rm: {json.dumps(c['q_rm'])}, items: {json.dumps(c['q_items'])}, empty: {json.dumps(c['q_empty'])}}};</script>
<script src="{base}assets/js/quote.js"></script>
"""
    return page(2, lang, c, "oferta/", c["q_t"], c["meta_desc"], body, active="quote")

# ------------------------------------------------------------------ driver
def copy_assets():
    src = os.path.join(ROOT, "assets")
    dst = os.path.join(DIST, "assets")
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst)

def root_redirect():
    langs = "".join(f'<li><a href="{l}/">{l.upper()}</a></li>' for l in LANGS)
    write("index.html", f"""<!DOCTYPE html><html lang="bg"><head><meta charset="utf-8"/>
<meta http-equiv="refresh" content="0; url=bg/"/><title>Infraconcept</title>
<script>location.replace(({{bg:1}}[((navigator.language||'bg').slice(0,2))]?'bg':['en','ro','el','sr','mk','al'].includes((navigator.language||'').slice(0,2))?(navigator.language||'').slice(0,2):'en') + '/');</script>
<style>body{{font-family:system-ui;background:#10141a;color:#f4f1ea;display:grid;place-items:center;height:100vh}}a{{color:#ffb020}}</style>
</head><body><ul>{langs}</ul></body></html>""")

def sitemap():
    urls = []
    for lang in LANGS:
        subs = ["", "katalog/", "resheniya/", "nastilki/", "proizvoditeli/", "obekti/",
                "uslugi/", "za-nas/", "kontakti/", "oferta/"]
        subs += [f"produkt/{p['slug']}/" for p in PRODUCTS]
        for s in subs:
            urls.append(f"<url><loc>{SITE}/{lang}/{s}</loc>"
                        + f'<changefreq>weekly</changefreq></url>')
    write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n'
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
          + "".join(urls) + "</urlset>")
    write("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")

def main():
    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)
    copy_assets()
    n = 0
    for lang in LANGS:
        write(f"{lang}/index.html", build_home(lang)); n += 1
        write(f"{lang}/katalog/index.html", build_catalog(lang)); n += 1
        write(f"{lang}/resheniya/index.html", build_solutions(lang)); n += 1
        write(f"{lang}/nastilki/index.html", build_flooring(lang)); n += 1
        write(f"{lang}/proizvoditeli/index.html", build_brands(lang)); n += 1
        write(f"{lang}/obekti/index.html", build_projects(lang)); n += 1
        write(f"{lang}/uslugi/index.html", build_services(lang)); n += 1
        write(f"{lang}/za-nas/index.html", build_about(lang)); n += 1
        write(f"{lang}/kontakti/index.html", build_contacts(lang)); n += 1
        write(f"{lang}/oferta/index.html", build_quote(lang)); n += 1
        for p in PRODUCTS:
            write(f"{lang}/produkt/{p['slug']}/index.html", build_product(lang, p)); n += 1
    root_redirect()
    sitemap()
    print(f"OK — {n} pages × assets -> dist/")
    if "--serve" in sys.argv:
        import http.server, functools
        os.chdir(DIST)
        http.server.test(HandlerClass=functools.partial(http.server.SimpleHTTPRequestHandler), port=8031)

if __name__ == "__main__":
    main()
