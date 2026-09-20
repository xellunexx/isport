# Probe /product-category/ pages for brands without series (HBH etc).
from bs4 import BeautifulSoup
import re, os, sys, requests
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "crawl", "raw")
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}

for man in ["hard-body-hang", "innoflex", "corkeen", "epoxy", "sawo", "green-set", "one-dna", "playnetic", "finture-streetunit"]:
    url = f"https://infraconcept.bg/product-category/?selected_manufacturer={man}"
    p = os.path.join(RAW, f"catpage_{man}.html")
    if not os.path.exists(p):
        r = requests.get(url, headers=H, timeout=40)
        open(p, "w", encoding="utf-8").write(r.text)
    html = open(p, encoding="utf-8").read()
    soup = BeautifulSoup(html, "lxml")
    prods = {a["href"] for a in soup.find_all("a", href=True) if re.match(r"https?://infraconcept\.bg/product/[^/?#]+/?$", a["href"])}
    pages = {a["href"] for a in soup.find_all("a", href=True) if "product-category" in a["href"] and ("page" in a["href"] or "paged" in a["href"])}
    other = set()
    for a in soup.find_all("a", href=True):
        h = a["href"]
        if re.match(r"https?://infraconcept\.bg/(product|produkt|stena|steni|nastilka)[^/]*/[^/?#]+/?$", h):
            other.add(h)
    h1 = soup.find("h1")
    print(f"{man}: size={len(html)} prods={len(prods)} pages={len(pages)} h1={h1.get_text(strip=True)[:50] if h1 else None}")
    for x in list(prods)[:3]:
        print("   ", x)
