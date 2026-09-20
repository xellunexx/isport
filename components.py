# -*- coding: utf-8 -*-
"""HTML component builders for the Infraconcept 2026 static build."""
import html
import json
from catalog_data import BRANDS, TYPES, AGES, MATERIALS, PURPOSES, icon, PRODUCTS

LANG_NATIVE = {"bg": "Български", "en": "English", "ro": "Română",
               "el": "Ελληνικά", "sr": "Српски", "mk": "Македонски", "al": "Shqip"}
LANG_URL = {"bg": "bg", "en": "en", "ro": "ro", "el": "el", "sr": "sr", "mk": "mk", "al": "al"}

def esc(s):
    return html.escape(str(s), quote=True)

def fmt(c, key, **kw):
    s = c.get(key, key)
    for k, v in kw.items():
        s = s.replace("{" + k + "}", str(v))
    return esc(s)

def raw(c, key, **kw):
    s = c.get(key, key)
    for k, v in kw.items():
        s = s.replace("{" + k + "}", str(v))
    return s

# ---------------------------------------------------------------- shell
def base_for(depth):
    return "../" * depth

def subpath_of(rel):  # rel like "katalog/" or "produkt/slug/" or ""
    return rel

def head(lang, c, title, desc, base, sub):
    alts = []
    for ol in LANG_URL:
        href = f"https://infraconcept.bg/{ol}/{sub}" if ol != "bg" else f"https://infraconcept.bg/bg/{sub}"
        alts.append(f'<link rel="alternate" hreflang="{ol}" href="{href}"/>')
    alts.append(f'<link rel="alternate" hreflang="x-default" href="https://infraconcept.bg/bg/{sub}"/>')
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{esc(title)} — {esc(c['site_name'])}</title>
<meta name="description" content="{esc(desc)}"/>
<link rel="icon" href="{base}assets/favicon.svg" type="image/svg+xml"/>
<link rel="stylesheet" href="{base}assets/css/site.css"/>
{''.join(alts)}
</head>"""

def header(lang, c, base, active="", cart=0):
    L = LANG_URL[lang]
    def a(path, key, act):
        cls = ' class="act"' if act == active else ""
        return f'<a href="{base}{L}/{path}"{cls}>{esc(c[key])}</a>'
    langs = "".join(
        f'<a href="{base}{ol}/{lang.get("cur_sub","")}" data-lang="{ol}">{LANG_NATIVE[ol]}</a>'
        for ol in LANG_URL) if isinstance(lang, dict) else ""
    # language switcher: same sub-path is injected via build (c contains "_cur_sub")
    cur_sub = c.get("_cur_sub", "")
    langs = "".join(
        f'<a href="{base}{ol}/{cur_sub}" lang="{ol}" hreflang="{ol}">{LANG_NATIVE[ol]}</a>'
        for ol in LANG_URL)
    return f"""<header class="site">
<a class="logo" href="{base}{L}/"><span class="lgo-mark">IC</span><span class="lgo-txt">{esc(c['site_name'])}<small>{esc(c['tagline'])}</small></span></a>
<nav class="mainnav" id="mainnav">
{a("katalog/", "nav_catalog", "catalog")}
{a("resheniya/", "nav_solutions", "solutions")}
{a("nastilki/", "nav_flooring", "flooring")}
{a("proizvoditeli/", "nav_brands", "brands")}
{a("obekti/", "nav_projects", "projects")}
{a("uslugi/", "nav_services", "services")}
{a("za-nas/", "nav_about", "about")}
{a("kontakti/", "nav_contacts", "contacts")}
</nav>
<div class="hactions">
<div class="langsw" id="langsw"><button type="button" class="langbtn" aria-haspopup="true">{LANG_URL[lang].upper()} ▾</button><div class="langmenu">{langs}</div></div>
<a class="cartbtn" href="{base}{L}/oferta/" aria-label="{esc(c['nav_quote'])}">🧾<span class="cartn" id="cart-count">0</span></a>
<button class="burger" id="burger" aria-label="menu"><span></span><span></span><span></span></button>
</div>
</header>"""

def footer(lang, c, base):
    L = LANG_URL[lang]
    return f"""<footer class="site">
<div class="fgrid">
<div><span class="lgo-mark">IC</span><p>{esc(c['tagline'])}</p><p class="muted">ISO 9001 · ISO 14001 · ISO 45001</p></div>
<div><h5>{esc(c['foot_col_cat'])}</h5>
<a href="{base}{L}/katalog/?purpose=play">{esc(c['p_play'])}</a>
<a href="{base}{L}/katalog/?purpose=sport">{esc(c['p_sport'])}</a>
<a href="{base}{L}/katalog/?purpose=park">{esc(c['p_park'])}</a>
<a href="{base}{L}/katalog/?purpose=flooring">{esc(c['p_flooring'])}</a></div>
<div><h5>{esc(c['foot_col_sol'])}</h5>
<a href="{base}{L}/resheniya/#muni">{esc(c['sec_muni_t'])}</a>
<a href="{base}{L}/resheniya/#school">{esc(c['sec_school_t'])}</a>
<a href="{base}{L}/resheniya/#kinder">{esc(c['sec_kinder_t'])}</a>
<a href="{base}{L}/resheniya/#arch">{esc(c['sec_arch_t'])}</a></div>
<div><h5>{esc(c['foot_col_info'])}</h5>
<a href="{base}{L}/za-nas/">{esc(c['nav_about'])}</a>
<a href="{base}{L}/proizvoditeli/">{esc(c['nav_brands'])}</a>
<a href="{base}{L}/obekti/">{esc(c['nav_projects'])}</a>
<a href="{base}{L}/kontakti/">{esc(c['nav_contacts'])}</a>
<a href="#" rel="nofollow">{esc(c['foot_priv'])}</a>
<a href="#" rel="nofollow">{esc(c['foot_terms'])}</a></div>
</div>
<div class="fbottom"><span>{esc(c['foot_rights'])}</span><span class="muted">{esc(c['cookie_note'])}</span></div>
</footer>
<div class="toast" id="toast" role="status"></div>
<div class="simtip" id="simtip" hidden data-tpl="{esc(c['sm_preview'])}"></div>
<script>window.IC_I18N_ADDED = {json.dumps(c['cart_added'])};</script>
<script src="{base}assets/js/site.js"></script>"""

# ---------------------------------------------------------------- product card
PURPOSE_GLYPH = {"play": "🛝", "sport": "🏋", "park": "🌳", "flooring": "◼"}

def card(p, c, lang, base):
    L = LANG_URL[lang]
    b = BRANDS[p["brand"]]
    href = f"{base}{L}/produkt/{p['slug']}/"
    ages = ",".join(p["ages"])
    mats = ",".join(p["mats"])
    certs = ",".join(p["certs"])
    ages_lbl = " · ".join(c.get("a_" + a, a) for a in p["ages"]) if p["ages"] else "—"
    cert_chips = " ".join(f'<span class="cert">{esc(x)}</span>' for x in p["certs"])
    cl = "●" * p["cls"] + "○" * (3 - p["cls"])
    return f"""<article class="pcard" tabindex="0"
 data-id="{p['id']}" data-href="{href}"
 data-purpose="{p['purpose']}" data-type="{p['type']}"
 data-ages="{ages}" data-mats="{mats}" data-brand="{p['brand']}"
 data-name="{esc(p['series'] + ' ' + p['model'])}" data-series="{esc(p['series'])}" data-model="{esc(p['model'])}"
 data-tname="{esc(c.get('t_' + p['type'], p['type']))}" data-bname="{esc(b['name'])}"
 data-cls="{p['cls']}" data-dims="{esc(p['dims'])}" data-cap="{esc(p['cap'])}" data-certs="{certs}">
 <a class="part" href="{href}" style="--h:{p['hue']}" aria-hidden="true" tabindex="-1">
  {icon(p['type'], 'pict')}
  <span class="pbrand">{esc(b['name'])}</span>
 </a>
 <div class="pbody">
  <a class="ptitle" href="{href}"><span class="pt">{esc(c.get('t_'+p['type'], p['type']))}</span><span class="ps">{esc(p['series'])} <em>{esc(p['model'])}</em></span></a>
  <div class="pbadges">{f'<span class="bage">{esc(ages_lbl)}</span>' if p['ages'] else ''}<span class="bmat">{esc(' + '.join(c.get('m_'+m, m) for m in p['mats']))}</span>{cert_chips}</div>
  <div class="pfoot">
   <span class="pcls" title="{esc(c['cl_'+str(p['cls'])])}">{cl}</span>
   <span class="pdots">
    <button type="button" class="pqv" data-qv="{p['id']}" title="{esc(c['b_qv'])}">👁</button>
    <button type="button" class="psim" data-sim="{p['id']}" title="{esc(c['b_similar'])}">⦿</button>
    <button type="button" class="padd" data-add="{p['id']}" title="{esc(c['b_add'])}">＋ {esc(c['b_add'])}</button>
   </span>
  </div>
 </div>
</article>"""

# ---------------------------------------------------------------- filter bar
def filterbar(c, lang, smart_default=True, search_ph=None):
    sh = esc(search_ph or c["f_search"])
    def drop(fid, label, opts):
        lis = []
        for val, lab, extra in opts:
            lis.append(f'<label class="fopt" data-v="{val}"{extra}><input type="checkbox" data-f="{fid}" value="{val}"/> <i>{icon(val) if fid=="type" else ""}</i><span>{esc(lab)}</span><b class="n"></b></label>')
        return f"""<div class="fdrop" data-facet="{fid}">
 <button type="button" class="fbtn"><span class="flab">{esc(label)}</span><span class="fval">{esc(c['f_all'])}</span><span class="caret">▾</span></button>
 <div class="fmenu"><div class="fmenu-in">{''.join(lis)}</div></div>
</div>"""
    d_purpose = drop("purpose", c["f_purpose"], [(p, c["p_" + p], "") for p in PURPOSES])
    t_opts = []
    for pur, ts in TYPES.items():
        for t in ts:
            t_opts.append((t, c["t_" + t], f' data-p="{pur}"'))
    d_type = drop("type", c["f_type"], t_opts)
    d_age = drop("age", c["f_age"], [(a, c["a_" + a], "") for a in AGES])
    d_mat = drop("material", c["f_mat"], [(m, c["m_" + m], "") for m in MATERIALS])
    b_opts = [(k, v["name"], "") for k, v in BRANDS.items()]
    d_brand = drop("brand", c["f_brand"], b_opts)
    chk = " checked" if smart_default else ""
    return f"""<div class="fwrap" id="fwrap">
<form class="fbar" id="fbar" onsubmit="return false">
 {d_purpose}{d_type}{d_age}{d_mat}{d_brand}
 <label class="smagic" title="{esc(c['sm_hint'])}"><input type="checkbox" id="smart-toggle"{chk}/><span>🪄 {esc(c['sm_toggle'])}</span></label>
 <div class="fsearch"><input type="search" id="fsearch" placeholder="{sh}" autocomplete="off"/><div class="fsug" id="fsug" hidden></div></div>
 <button type="button" class="fmob" id="f-toggle-mob">🎚 <span id="f-mob-n"></span></button>
</form>
<div class="fmeta">
 <div class="chips" id="chips"></div>
 <div class="rmeta"><span id="rcount" class="rcount" data-tpl="{esc(c['f_results'])}"></span><button type="button" id="clear-all" class="linklike">{esc(c['f_clear'])}</button></div>
</div>
<div class="simbar" id="similar-banner" hidden data-tpl="⦿ {esc(c['sm_on'])}">
 <span class="simlab" id="sim-label"></span><span class="simchips" id="sim-chips"></span>
 <span class="simbtns"><button type="button" id="sim-pin">{esc(c['b_pin'])}</button><button type="button" id="sim-exit" class="ghost">{esc(c['b_exit'])} <kbd>Esc</kbd></button></span>
</div>
</div>"""

def quickview_modal(c):
    return f"""<div class="qv" id="qv" hidden>
<div class="qv-card">
 <button type="button" class="qv-x" id="qv-x" aria-label="×">×</button>
 <div class="qv-art" id="qv-art"></div>
 <div class="qv-body">
  <h3 id="qv-title"></h3><p class="qv-sub" id="qv-sub"></p>
  <dl class="qv-dl">
   <div><dt>{esc(c['prod_dims'])}</dt><dd id="qv-dims"></dd></div>
   <div><dt>{esc(c['prod_cap'])}</dt><dd id="qv-cap"></dd></div>
   <div><dt>{esc(c['prod_certs'])}</dt><dd id="qv-certs"></dd></div>
   <div><dt>{esc(c['prod_mats'])}</dt><dd id="qv-mats"></dd></div>
  </dl>
  <div class="qv-act"><a id="qv-open" class="btn" href="#">{esc(c['b_more'])}</a><button type="button" id="qv-add" class="btn acc">{esc(c['b_add'])}</button></div>
  <p class="muted">{esc(c['prod_dwg'])}</p>
 </div>
</div>
</div>"""

def json_island(products, c):
    idx = []
    for p in products:
        idx.append({"id": p["id"], "slug": p["slug"], "purpose": p["purpose"], "type": p["type"],
                    "brand": p["brand"], "series": p["series"], "model": p["model"],
                    "cls": p["cls"], "avail": p["avail"], "dims": p["dims"], "cap": p["cap"],
                    "ages": p["ages"], "mats": p["mats"], "certs": p["certs"],
                    "tname": c.get("t_" + p["type"], p["type"])})
    return ('<script id="catalog-json" type="application/json">'
            + json.dumps(idx, ensure_ascii=False) + "</script>")

def breadcrumb(c, base, items):
    L = list(items)
    out = ['<nav class="crumb" aria-label="breadcrumb">']
    for href, lab in L[:-1]:
        out.append(f'<a href="{href}">{esc(lab)}</a><span class="sep">›</span>')
    out.append(f'<span class="cur">{esc(L[-1][1])}</span></nav>')
    return "".join(out)
