"""Crawl infraconcept.bg product catalog -> crawl/catalog.raw.json + images into img/products/.

Structure discovered by probe:
  /product-series/?selected_manufacturer=M&selected_category=C  -> series cards (h4 + link /product-series/<slug>)
  /product-series/<slug>                                        -> product links /product/<slug>/
  /product/<slug>/                                              -> .single_product_wrapper with h3 title,
                                                                   .product_attr specs, .product_gallery_img imgs,
                                                                   .breadcrumbs (brand/category/series), PDF datasheet link
"""
from bs4 import BeautifulSoup
import json, os, re, sys, time, urllib.parse
import requests

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "crawl", "raw")
IMG = os.path.join(BASE, "img", "products")
os.makedirs(RAW, exist_ok=True)
os.makedirs(IMG, exist_ok=True)

H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
DELAY = 0.25

MATRIX = None  # auto-discovered below
CATS = ["park", "play", "sport"]
# flooring brands live under /nastilki & product-category pages; innoflex tiles are products
EXTRA_PRODUCT_LISTS = [
    ("flooring", "innoflex", "https://infraconcept.bg/product-category/?selected_manufacturer=innoflex"),
]

BAD_IMG = re.compile(r"(logo|cart|viber|whatsapp|linkedin|youtube|facebook|instagram|Icon|icon|Infraconcept1|Logo\.svg|corkeen-hero|hero-banner)", re.I)


def fetch(url, name):
    path = os.path.join(RAW, name + ".html")
    if os.path.exists(path):
        return open(path, encoding="utf-8").read()
    for attempt in range(3):
        try:
            r = requests.get(url, headers=H, timeout=40)
            if r.status_code == 200 and len(r.text) > 2000:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(r.text)
                time.sleep(DELAY)
                return r.text
            print("  ! status", r.status_code, url)
        except Exception as e:
            print("  ! err", e, url)
        time.sleep(1.5)
    return None


def slug_of(url):
    p = urllib.parse.urlparse(url).path.strip("/").split("/")
    return p[-1] if p else "x"


# ---------- 0. manufacturers ----------
html = fetch("https://infraconcept.bg/product-manufacturers/", "manufacturers")
msoup = BeautifulSoup(html, "lxml")
manufacturers = []
for a in msoup.find_all("a", href=True):
    m = re.search(r"selected_manufacturer=([a-z0-9-]+)", a["href"])
    if m and m.group(1) not in manufacturers:
        manufacturers.append(m.group(1))
# menu links also carry slugs; union with known
for known in ["fulco", "proludic", "vinci-play", "3dprogram", "polfisan", "hard-body-hang", "innoflex", "corkeen", "epoxy"]:
    if known not in manufacturers:
        manufacturers.append(known)
print("manufacturers:", manufacturers)

# ---------- 1. series ----------
series = {}  # slug -> dict
for man in manufacturers:
    for cat in CATS:
        url = f"https://infraconcept.bg/product-series/?selected_manufacturer={man}&selected_category={cat}"
        html = fetch(url, f"list_{cat}_{man}")
        if not html:
            continue
        soup = BeautifulSoup(html, "lxml")
        for a in soup.find_all("a", href=True):
            h = a["href"]
            if "/product-series/" in h and "selected_manufacturer" not in h:
                s = slug_of(h)
                if s in series:
                    if cat not in series[s]["categories"]:
                        series[s]["categories"].append(cat)
                    continue
                title_el = a.find(re.compile("^h[1-6]$"))
                series[s] = {
                    "slug": s,
                    "url": urllib.parse.urljoin(url, h),
                    "title_bg": (title_el.get_text(" ", strip=True) if title_el else a.get_text(" ", strip=True))[:80],
                    "brand": man,
                    "categories": [cat],
                }
print("series:", len(series))

PRODUCT_URL = re.compile(r"https?://infraconcept\.bg/product/[^/?#]+/?$")

def products_on(url, cache_name):
    html = fetch(url, cache_name)
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    links, pages = [], set()
    for a in soup.find_all("a", href=True):
        h = a["href"]
        if PRODUCT_URL.match(h):
            links.append((h, a.get_text(" ", strip=True)))
        pm = re.match(r"(https?://infraconcept\.bg/product-series/[^/]+/page/(\d+)/?)$", h)
        if pm:
            pages.add(int(pm.group(2)))
    seen, uniq = set(), []
    for h, t in links:
        if h not in seen:
            seen.add(h)
            uniq.append((h, t))
    return uniq, pages

# ---------- 2. products per series (with pagination) ----------
products = {}
for s, sd in sorted(series.items()):
    uniq, pages = products_on(sd["url"], "series_" + s)
    if pages:
        for n in sorted(pages):
            if n == 1:
                continue
            more, _ = products_on(f"https://infraconcept.bg/product-series/{s}/page/{n}/", f"series_{s}_p{n}")
            known = {h for h, _ in uniq}
            for h, t in more:
                if h not in known:
                    uniq.append((h, t))
    sd["products"] = [h for h, _ in uniq]
    for h, t in uniq:
        pslug = slug_of(h)
        products.setdefault(pslug, {"slug": pslug, "url": h, "list_title": t, "series": s})
print("products:", len(products))

# ---------- 3. extra product lists (flooring) ----------
for cat, man, url in EXTRA_PRODUCT_LISTS:
    html = fetch(url, f"extra_{man}")
    if not html:
        continue
    soup = BeautifulSoup(html, "lxml")
    for a in soup.find_all("a", href=True):
        h = a["href"]
        if re.match(r"https?://infraconcept\.bg/product/[^/]+/?$", h):
            pslug = slug_of(h)
            products.setdefault(pslug, {"slug": pslug, "url": h, "list_title": a.get_text(" ", strip=True), "series": None, "force_cat": cat, "force_brand": man})
print("with extras:", len(products))

# ---------- 4. product pages ----------
out = []
for i, (pslug, pd) in enumerate(sorted(products.items())):
    html = fetch(pd["url"], "p_" + pslug)
    if not html:
        continue
    soup = BeautifulSoup(html, "lxml")
    wrap = soup.select_one(".single_product_wrapper") or soup
    # title
    title = ""
    h3 = wrap.find("h3")
    if h3:
        title = h3.get_text(" ", strip=True)
    if not title and soup.title:
        title = soup.title.get_text(strip=True)
    # breadcrumbs
    crumbs = [c.get_text(" ", strip=True) for c in soup.select(".breadcrumbs a, .breadcrumbs span")]
    # attrs
    attrs = []
    for pa in wrap.select(".product_attr p"):
        t = pa.get_text(" ", strip=True)
        if t and t not in attrs:
            attrs.append(t)
    # any other descriptive paragraphs inside wrap
    desc_parts = []
    for p in wrap.find_all("p"):
        t = p.get_text(" ", strip=True)
        if t and t not in attrs and t not in desc_parts and len(t) > 12 and "Размери" not in t:
            desc_parts.append(t)
    # images
    imgs = []
    for img in wrap.find_all("img"):
        src = img.get("src") or (img.get("data-src") or "")
        if not src or BAD_IMG.search(src):
            continue
        if src.startswith("/"):
            src = "https://infraconcept.bg" + src
        if "/uploads/" in src and src not in imgs:
            imgs.append(src)
    # datasheet pdf
    pdfs = []
    for a in wrap.find_all("a", href=True):
        h = a["href"]
        if ".pdf" in h.lower():
            pdfs.append(urllib.parse.urljoin(pd["url"], h))
    rec = {
        "slug": pslug,
        "url": pd["url"],
        "title_bg": title,
        "list_title": pd.get("list_title", ""),
        "series_slug": pd.get("series"),
        "crumbs": crumbs,
        "attrs": attrs,
        "desc_bg": desc_parts[:6],
        "images": imgs[:6],
        "pdfs": pdfs[:3],
        "force_cat": pd.get("force_cat"),
        "force_brand": pd.get("force_brand"),
    }
    out.append(rec)
    if i % 25 == 0:
        print(f"{i}/{len(products)} {pslug}")

json.dump({"series": series, "products": out},
          open(os.path.join(BASE, "crawl", "catalog.raw.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("DONE. products:", len(out))
