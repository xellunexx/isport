# Show titles landing in 'other' buckets for rule refinement.
from collections import Counter
import json, os, re, sys, importlib.util
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = json.load(open(os.path.join(BASE, "crawl", "catalog.raw.json"), encoding="utf-8"))

spec = importlib.util.spec_from_file_location("norm", os.path.join(BASE, "tools", "normalize.py"))
# don't execute; just reuse rules by copy-paste is brittle -> quick re-parse here instead
RULES = []
src = open(os.path.join(BASE, "tools", "normalize.py"), encoding="utf-8").read()
block = re.search(r"^R = \[(.*?)^\]", src, re.S | re.M).group(1)
for c, k, rx in re.findall(r'\("(\w+)",\s*"(\w+)",\s*r"(.*?)"\)', block):
    RULES.append((c, k, re.compile(rx, re.I | re.U)))

CAT_MAP = {"Игра": "play", "Парк": "park", "Спорт": "sport", "Настилки": "flooring"}
others = Counter()
for p in data["products"]:
    crumbs = [c for c in p["crumbs"] if c and c != "Начало"]
    cat = next((CAT_MAP[c] for c in crumbs if c in CAT_MAP), None)
    if not cat:
        continue
    blob = " ".join([p["title_bg"]] + p["attrs"] + p["desc_bg"]).lower()
    if not any(c == cat and rx.search(blob) for c, k, rx in RULES):
        others[(cat, re.split(r"\s+[–-]\s+", p["title_bg"])[0][:45])] += 1
for (c, t), v in others.most_common(90):
    print(f"{v:4d}  {c:8s} {t}")
