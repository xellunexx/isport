# Probe: what real-life imagery do the manufacturer category pages + target-grupi pages offer?
from bs4 import BeautifulSoup
import re, os, sys, requests
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "crawl", "raw")
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"}
BAD = re.compile(r"(logo|cart|viber|whatsapp|linkedin|youtube|facebook|instagram|Infraconcept1|Logo\.svg|icon)", re.I)

URLS = [
    "https://infraconcept.bg/product-manufacturers/?selected_category=play",
    "https://infraconcept.bg/product-manufacturers/?selected_category=park",
    "https://infraconcept.bg/product-manufacturers/?selected_category=sport",
    "https://infraconcept.bg/target-grupi/",
    "https://infraconcept.bg/target-grupi/detski-gradini/",
]
for u in URLS:
    slug = re.sub(r"[^a-z0-9]+", "_", u.split("infraconcept.bg/")[1])[:40]
    r = requests.get(u, headers=H, timeout=40)
    soup = BeautifulSoup(r.text, "lxml")
    imgs = []
    for i in soup.find_all("img"):
        s = i.get("src") or ""
        if "/uploads/" in s and not BAD.search(s):
            imgs.append(s)
    h = [t.get_text(" ", strip=True)[:70] for t in soup.find_all(re.compile("^h[1-3]$"))][:12]
    print("==", u, len(r.text))
    print("   headings:", h)
    print("   imgs:", len(imgs))
    for x in imgs[:14]:
        print("     ", x[:110])
