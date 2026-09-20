# Why do some brands yield no series? Inspect cached list pages.
from bs4 import BeautifulSoup
import re, os, sys, glob
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "crawl", "raw")

for name in ["list_sport_hard-body-hang", "list_play_innoflex", "list_sport_innoflex", "list_park_innoflex", "list_play_corkeen", "list_sport_sawo"]:
    p = os.path.join(RAW, name + ".html")
    if not os.path.exists(p):
        print("NOT FETCHED:", name)
        continue
    html = open(p, encoding="utf-8").read()
    soup = BeautifulSoup(html, "lxml")
    ser = set()
    for a in soup.find_all("a", href=True):
        if "/product-series/" in a["href"] and "selected_manufacturer" not in a["href"]:
            ser.add(a["href"])
    body = soup.get_text(" ", strip=True)
    print(f"{name}: size={len(html)} series_links={len(ser)} | contains 'Няма'/'not found': {'няма' in body.lower()}")
    h1 = soup.find("h1")
    print("   h1:", h1.get_text(strip=True)[:80] if h1 else None)
    for s in list(ser)[:8]:
        print("   ", s)
