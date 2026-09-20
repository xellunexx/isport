# Discover what lives in extra_innoflex + nastilki pages.
from bs4 import BeautifulSoup
import re, os, sys, requests
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "crawl", "raw")

html = open(os.path.join(RAW, "extra_innoflex.html"), encoding="utf-8").read()
soup = BeautifulSoup(html, "lxml")
print("== innoflex page href segments ==")
pats = {}
for a in soup.find_all("a", href=True):
    m = re.match(r"https?://infraconcept\.bg(/[^?#]*)", a["href"]) or re.match(r"(/[^?#]*)", a["href"])
    if m:
        seg = "/".join(m.group(1).split("/")[:3])
        pats[seg] = pats.get(seg, 0) + 1
for k in sorted(pats, key=lambda x: -pats[x])[:30]:
    print(pats[k], k)

print("\n== tiles/nastilki-subpage link texts ==")
seen = set()
for a in soup.find_all("a", href=True):
    h = a["href"]
    t = a.get_text(" ", strip=True)[:70]
    if ("/nastilki/" in h or "innoflex" in h.lower() or "kauchuk" in h) and h not in seen:
        seen.add(h)
        print(h, "|", t)

print("\n== h1..h4 ==")
for t in soup.find_all(re.compile("^h[1-4]$"))[:30]:
    print(t.name, "|", t.get_text(" ", strip=True)[:100])
