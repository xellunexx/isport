# Fetch sitemap index, list sitemaps, then collect all /product/ URLs.
from bs4 import BeautifulSoup
import re, os, sys, requests
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "crawl", "raw")
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}

def get(u):
    r = requests.get(u, headers=H, timeout=40)
    return r.text

idx = get("https://infraconcept.bg/sitemap_index.xml")
smaps = re.findall(r"<loc>(https://[^<]+)</loc>", idx)
print("sitemaps:", len(smaps))
prod_urls = set()
for s in smaps:
    print(" -", s)
    if "/product" in s:
        x = get(s)
        urls = re.findall(r"<loc>(https://[^<]+)</loc>", x)
        print("   urls:", len(urls))
        for u in urls:
            if re.match(r"https?://infraconcept\.bg/product/[^/]+/?$", u):
                prod_urls.add(u.rstrip("/") + "/")

known = set()
import json
cat = json.load(open(os.path.join(BASE, "crawl", "catalog.raw.json"), encoding="utf-8"))
for p in cat["products"]:
    known.add(p["url"].rstrip("/") + "/")

new = sorted(prod_urls - known)
print("\nTOTAL in sitemap:", len(prod_urls), " already have:", len(known & prod_urls), " NEW:", len(new))
with open(os.path.join(BASE, "crawl", "sitemap_products.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(sorted(prod_urls)))
for u in new[:40]:
    print("  +", u)
