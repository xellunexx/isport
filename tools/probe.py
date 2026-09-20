# Probe infraconcept.bg structure: dump raw HTML of key page types for parser design.
import os, requests

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "crawl", "raw")
os.makedirs(RAW, exist_ok=True)

URLS = {
    "series_list_fulco_park": "https://infraconcept.bg/product-series/?selected_manufacturer=fulco&selected_category=park",
    "series_page_pejki": "https://infraconcept.bg/product-series/pejki-fulco",
    "product_example": None,  # filled after series_page probe
}

H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}

for name, url in URLS.items():
    if not url:
        continue
    r = requests.get(url, headers=H, timeout=30)
    r.raise_for_status()
    path = os.path.join(RAW, name + ".html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(r.text)
    print(name, r.status_code, len(r.text), "->", path)
