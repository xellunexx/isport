"""Full catalog crawl v2 driven by XML sitemaps (authoritative).

Sources:
  product_series-sitemap.xml  -> all series pages (105) -> paginated product grids
  product-sitemapN.xml        -> ALL product pages (2589)
  product_pavements-sitemap   -> flooring types (7)

Writes crawl/catalog.raw.json: {series, pavements, products[]}
Reuses HTML cache in crawl/raw/.
"""
from bs4 import BeautifulSoup
import json, os, re, sys, time, urllib.parse
import requests

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "crawl", "raw")
os.makedirs(RAW, exist_ok=True)

H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
DELAY = 0.22

BAD_IMG = re.compile(r"(logo|cart|viber|whatsapp|linkedin|youtube|facebook|instagram|Infraconcept1|Logo\.svg|hero-banner|shooping|shopping)", re.I)


def fetch(url, name):
    path = os.path.join(RAW, name + ".html")
    if os.path.exists(path):
        return open(path, encoding="utf-8").read()
    miss = path + ".miss"
    if os.path.exists(miss):
        return None  # known dead/slow URL, skip fast
    for attempt in range(2):
        try:
            r = requests.get(url, headers=H, timeout=18)
            if r.status_code == 200 and len(r.text) > 1500:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(r.text)
                time.sleep(0.15)
                return r.text
            print("  ! status", r.status_code, url, flush=True)
            break  # 4xx/5xx won't heal during this run
        except Exception as e:
            print("  ! err", e, url, flush=True)
        time.sleep(0.6)
    open(miss, "w").write("x")
    return None


def getxml(u):
    r = requests.get(u, headers=H, timeout=40)
    r.raise_for_status()
    return re.findall(r"<loc>(https://[^<]+)</loc>", r.text)


def slug_of(url):
    return urllib.parse.urlparse(url).path.strip("/").split("/")[-1]

# ---- sitemaps ----
idx = getxml("https://infraconcept.bg/sitemap_index.xml")
series_urls, product_urls, pave_urls = [], [], []
for sm in idx:
    sm_f = urllib.parse.unquote(sm)
    if "product_series-sitemap" in sm:
        series_urls = getxml(sm)
    elif re.search(r"product-sitemap\d+", sm):
        product_urls += getxml(sm)
    elif "product_pavements" in sm:
        pave_urls = getxml(sm)
product_urls = [u for u in product_urls if re.search(r"/product/[^/]+/$", u)]
print("sitemap series:", len(series_urls), " products:", len(product_urls), " pavements:", len(pave_urls))

# ---- series -> products with pagination ----
PRODUCT_URL = re.compile(r"https?://infraconcept\.bg/product/[^/?#]+/$", re.I)
series = {}
prod2series = {}
for su in series_urls:
    s = slug_of(su)
    html = fetch(su, "v2_series_" + s)
    if not html:
        continue
    soup = BeautifulSoup(html, "lxml")
    h1 = soup.find("h1")
    crumbs = [c.get_text(" ", strip=True) for c in soup.select(".breadcrumbs a, .breadcrumbs span")]
    # products page 1
    def page_products(text):
        sp = BeautifulSoup(text, "lxml")
        out, pgs = [], set()
        for a in sp.find_all("a", href=True):
            href = a["href"]
            if PRODUCT_URL.match(href.rstrip("/") + "/"):
                out.append(href)
            pm = re.search(r"/product-series/[^/]+/page/(\d+)/?$", href)
            if pm:
                pgs.add(int(pm.group(1)))
        return out, pgs
    links, pages = page_products(html)
    for n in sorted(pages):
        if n == 1:
            continue
        more = fetch(f"https://infraconcept.bg/product-series/{s}/page/{n}/", f"v2_series_{s}_p{n}")
        if more:
            m, _ = page_products(more)
            links += m
    seen, uniq = set(), []
    for l in links:
        l = l.rstrip("/") + "/"
        if l not in seen:
            seen.add(l)
            uniq.append(l)
    series[s] = {"slug": s, "url": su, "title_bg": (h1.get_text(" ", strip=True) if h1 else s),
                 "crumbs": crumbs, "products": uniq}
    for l in uniq:
        prod2series.setdefault(l, s)
print("series crawled:", len(series), " products via series:", len(prod2series))

# ---- pavements ----
pavements = []
for pu in pave_urls:
    s = slug_of(pu)
    html = fetch(pu, "v2_pave_" + s)
    if not html:
        continue
    soup = BeautifulSoup(html, "lxml")
    h1 = soup.find("h1")
    desc = soup.get_text(" ", strip=True)
    imgs = [urllib.parse.urljoin(pu, i.get("src")) for i in soup.find_all("img")
            if i.get("src") and "/uploads/" in i.get("src") and not BAD_IMG.search(i.get("src"))]
    pavements.append({"slug": s, "url": pu, "title_bg": h1.get_text(" ", strip=True) if h1 else s, "images": imgs[:4]})
print("pavements:", len(pavements))

# ---- ALL product pages ----
out = []
for i, u in enumerate(product_urls):
    u = u.rstrip("/") + "/"
    pslug = slug_of(u)
    html = fetch(u, "p_" + pslug)
    if not html:
        continue
    soup = BeautifulSoup(html, "lxml")
    wrap = soup.select_one(".single_product_wrapper") or soup
    title = ""
    h3 = wrap.find("h3")
    if h3:
        title = h3.get_text(" ", strip=True)
    if not title and soup.title:
        title = soup.title.get_text(strip=True)
    crumbs = [c.get_text(" ", strip=True) for c in soup.select(".breadcrumbs a, .breadcrumbs span")]
    crumb_links = [a.get("href", "") for a in soup.select(".breadcrumbs a")]
    attrs = []
    for pa in wrap.select(".product_attr p"):
        t = pa.get_text(" ", strip=True)
        if t and t not in attrs:
            attrs.append(t)
    desc_parts = []
    for p in wrap.find_all("p"):
        t = p.get_text(" ", strip=True)
        if t and t not in attrs and t not in desc_parts and len(t) > 12 and "Размери" not in t[:12]:
            desc_parts.append(t)
    imgs = []
    for img in wrap.find_all("img"):
        src = img.get("src") or (img.get("data-src") or "")
        if not src or BAD_IMG.search(src):
            continue
        src = urllib.parse.urljoin(u, src)
        if "/uploads/" in src and src not in imgs:
            imgs.append(src)
    pdfs = []
    for a in wrap.find_all("a", href=True):
        if ".pdf" in a["href"].lower():
            pdfs.append(urllib.parse.urljoin(u, a["href"]))
    out.append({
        "slug": pslug, "url": u, "title_bg": title,
        "series_slug": prod2series.get(u),
        "crumbs": crumbs, "crumb_links": crumb_links,
        "attrs": attrs, "desc_bg": desc_parts[:6], "images": imgs[:6], "pdfs": pdfs[:3],
    })
    if i % 100 == 0:
        print(f"{i}/{len(product_urls)}")

json.dump({"series": series, "pavements": pavements, "products": out},
          open(os.path.join(BASE, "crawl", "catalog.raw.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("DONE products:", len(out))
