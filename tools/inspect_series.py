# Inspect series page HTML to find product-link selectors.
from bs4 import BeautifulSoup
import re, os, sys
sys.stdout.reconfigure(encoding="utf-8")

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(os.path.join(BASE, "crawl", "raw", "series_page_pejki.html"), encoding="utf-8").read()
soup = BeautifulSoup(html, "lxml")

links = {}
for a in soup.find_all("a", href=True):
    h = a["href"]
    if re.search(r"/product[s]?/", h):
        links.setdefault(h, a.get_text(" ", strip=True)[:70])
for h, t in list(links.items())[:60]:
    print(h, "|", t)

print("---- href segment counts ----")
pats = {}
for a in soup.find_all("a", href=True):
    m = re.match(r"https?://[^/]+(/[^?#]*)", a["href"]) or re.match(r"(/[^?#]*)", a["href"])
    if m:
        seg = "/".join(m.group(1).split("/")[:2])
        pats[seg] = pats.get(seg, 0) + 1
for k in sorted(pats, key=lambda x: -pats[x]):
    print(pats[k], k)
