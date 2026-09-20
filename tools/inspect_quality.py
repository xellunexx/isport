# Quality pass over v2 catalog: crumbs patterns, series coverage, attrs vocabulary.
from collections import Counter
import json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = json.load(open(os.path.join(BASE, "crawl", "catalog.raw.json"), encoding="utf-8"))
products, series = data["products"], data["series"]
print("products:", len(products), "series:", len(series))

with_series = [p for p in products if p.get("series_slug")]
print("with series:", len(with_series))

# brand from series crumbs
def brand_cat_from_crumbs(crumbs):
    # pattern: Начало > <Brand> > <Category> > Серии > ... <Series>
    crumbs = [c for c in crumbs if c and c != "Начало"]
    if len(crumbs) >= 2:
        return crumbs[0], crumbs[1]
    return None, None

brands, cats = Counter(), Counter()
for s in series.values():
    b, c = brand_cat_from_crumbs(s["crumbs"])
    brands[b] += 1
    cats[c] += 1
print("\nseries by brand:", dict(brands.most_common()))
print("series by cat:", dict(cats.most_common()))

# products WITHOUT series: crumbs analysis
nos = [p for p in products if not p.get("series_slug")]
print("\nno-series:", len(nos))
pat = Counter()
for p in nos:
    pat[" / ".join(p["crumbs"][:4])[:80]] += 1
for k, v in pat.most_common(15):
    print(f"  {v:4d}  {k}")

# attrs vocabulary (keys before ':')
keys = Counter()
for p in products:
    for a in p["attrs"]:
        m = re.match(r"^([^:]{2,40}):", a)
        if m:
            keys[m.group(1).strip()] += 1
print("\nattr keys:", keys.most_common(25))

# sample records: one Fulco bench, one Proludic play, one HBH
import random
random.seed(7)
for want in ["flow-peyka", "hard-body", "klatushka", "fitnes-ured", "kaучuk", "plochka"]:
    m = [p for p in products if want.lower() in p["slug"].lower()]
    if m:
        r = random.choice(m)
        print("\n== SAMPLE", r["slug"])
        print("  title:", r["title_bg"])
        print("  crumbs:", " > ".join(r["crumbs"][:6]))
        print("  series:", r.get("series_slug"))
        print("  attrs:", r["attrs"][:4])
        print("  desc:", [d[:80] for d in r["desc_bg"][:2]])
        print("  imgs:", len(r["images"]), r["images"][:1])
