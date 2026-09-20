# Target-group pages: title, hero/gallery images, intro copy, url -> crawl/targets.json
from bs4 import BeautifulSoup
import json, os, re, sys, requests
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"}
BAD = re.compile(r"(logo|cart|viber|whatsapp|linkedin|youtube|facebook|instagram|Infraconcept1|Logo\.svg|icon)", re.I)

PAGES = ["uchilishta", "detski-gradini", "hoteli", "obshtini", "stroiteli", "arhitekti"]
out = []
for slug in PAGES:
    u = f"https://infraconcept.bg/target-grupi/{slug}/"
    r = requests.get(u, headers=H, timeout=40)
    soup = BeautifulSoup(r.text, "lxml")
    h1 = soup.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else slug
    # hero-ish content images in document order
    imgs = []
    for i in soup.find_all("img"):
        s = i.get("src") or ""
        if "/uploads/" in s and not BAD.search(s) and s not in imgs:
            imgs.append(s)
    # lead paragraphs (skip nav/footer noise)
    paras = []
    for p in soup.find_all("p"):
        t = p.get_text(" ", strip=True)
        if 40 < len(t) < 420 and not any(x in t for x in ["бюлетин", "Leave this field", "©20"]):
            if t not in paras:
                paras.append(t)
        if len(paras) >= 4:
            break
    out.append({"slug": slug, "title": title, "imgs": imgs[:5], "paras": paras[:3], "url": u})
    print(slug, "|", title, "| imgs:", len(imgs), "| paras:", len(paras))
json.dump(out, open(os.path.join(BASE, "crawl", "targets.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
