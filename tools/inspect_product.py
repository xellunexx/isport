# Fetch one product page, print its structural skeleton (titles, imgs, spec containers).
from bs4 import BeautifulSoup
import re, os, sys, requests
sys.stdout.reconfigure(encoding="utf-8")

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "crawl", "raw")
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}

url = "https://infraconcept.bg/product/flow-peyka-bez-oblegalka-lfl122/"
r = requests.get(url, headers=H, timeout=30)
r.raise_for_status()
open(os.path.join(RAW, "product_example.html"), "w", encoding="utf-8").write(r.text)
print("saved", len(r.text))

soup = BeautifulSoup(r.text, "lxml")
print("\n== H1/H2/H3 ==")
for t in soup.find_all(re.compile("^h[1-4]$"))[:25]:
    print(t.name, "|", t.get_text(" ", strip=True)[:90], "| class:", " ".join(t.get("class", []))[:60])

print("\n== text blocks containing 'mm' or 'Материал' etc ==")
for el in soup.find_all(string=re.compile(r"(Материал|мм|mm|Габарит|Размер|Възраст|Сертиф|Монтаж|Цвят)")):
    p = el.parent
    gp = p.parent if p else None
    print("•", p.name, ".".join(p.get("class", []))[:40], "->", el.strip()[:110])
    if gp and len(gp.get_text(strip=True)) < 300:
        pass

print("\n== breadcrumb ==")
for bc in soup.select("nav, .breadcrumb, .breadcrumbs, [class*=breadcrumb]")[:4]:
    print(bc.get("class"), "|", bc.get_text(" ", strip=True)[:160])

print("\n== main images ==")
for img in soup.find_all("img"):
    src = img.get("src") or ""
    parent = img.parent
    if "product" in src.lower() or "/uploads/" in src:
        cls = ".".join((parent.get("class") or [])[:3]) if parent else ""
        print(src[:100], "| parent:", parent.name, cls[:50])
