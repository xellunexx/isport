# Sample catalog.raw.json: print representative records per brand + attr vocabulary.
from collections import Counter, defaultdict
import json, os, sys
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = json.load(open(os.path.join(BASE, "crawl", "catalog.raw.json"), encoding="utf-8"))
series, products = data["series"], data["products"]
print("series:", len(series), "products:", len(products))

bybrand = Counter()
byser = defaultdict(list)
for s, sd in series.items():
    bybrand[sd["brand"]] += 1
    byser[sd["brand"]].append((s, sd["title_bg"], len(sd.get("products", []))))
for b in sorted(bybrand):
    print(f"\n### {b} — {bybrand[b]} series")
    for s, t, n in byser[b]:
        print(f"   {n:4d}  {t[:60]:60s} [{s}]")

print("\n== empty-title products:", sum(1 for p in products if not p["title_bg"]))
print("== no-image products:", sum(1 for p in products if not p["images"]))
print("== no-series products:", sum(1 for p in products if not p.get("series_slug")))
