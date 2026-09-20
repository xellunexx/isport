# Facilities (Обекти) crawl: titles + first image for the Projects section.
from bs4 import BeautifulSoup
import json, os, re, sys, requests
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"}

idx = requests.get("https://infraconcept.bg/facilities-sitemap.xml", headers=H, timeout=30).text
urls = [u for u in re.findall(r"<loc>(https://[^<]+)</loc>", idx)]
print("facilities:", len(urls))
out = []
for u in urls:
    slug = u.rstrip("/").split("/")[-1]
    try:
        html = requests.get(u, headers=H, timeout=25).text
    except Exception:
        continue
    soup = BeautifulSoup(html, "lxml")
    h1 = soup.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else (soup.title.get_text(strip=True) if soup.title else slug)
    title = re.sub(r"\s*[-–]\s*Infraconcept\s*$", "", title).strip()
    bad = re.compile(r"(logo|cart|viber|whatsapp|linkedin|youtube|facebook|instagram|Infraconcept1|Logo\.svg)", re.I)
    imgs = [i.get("src") for i in soup.find_all("img")
            if i.get("src") and "/uploads/" in (i.get("src") or "") and not bad.search(i.get("src") or "")]
    loc_el = soup.find(string=re.compile(r"(гр\.|с\.|село|град)\s*[А-Я]"))
    loc = loc_el.strip()[:40] if loc_el else ""
    out.append({"slug": slug, "title": title, "loc": loc, "img": imgs[0] if imgs else None, "imgs": imgs[:5], "url": u})
json.dump(out, open(os.path.join(BASE, "crawl", "facilities.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved", len(out))
for o in out[:12]:
    print(" -", o["title"][:60], "|", o["loc"], "|", (o["img"] or "")[:80])
