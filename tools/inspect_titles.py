# Title-pattern census to design the purpose taxonomy (strip trailing " - CODE").
from collections import Counter
import json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = json.load(open(os.path.join(BASE, "crawl", "catalog.raw.json"), encoding="utf-8"))
products = data["products"]

types = Counter()
for p in products:
    t = re.split(r"\s+[–-]\s+[A-Z0-9]", p["title_bg"])[0].strip()
    t = re.sub(r"\s+", " ", t)
    types[t] += 1
with open(os.path.join(BASE, "crawl", "title_types.txt"), "w", encoding="utf-8") as f:
    for k, v in types.most_common():
        f.write(f"{v:5d}  {k}\n")
print("distinct type prefixes:", len(types))
for k, v in types.most_common(80):
    print(f"{v:5d}  {k}")
