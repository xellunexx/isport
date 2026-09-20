# -*- coding: utf-8 -*-
"""Post-build gate for Infraconcept 2026.

Checks:
  1. i18n key parity across all content/{lang}.json against content/bg.json
  2. dist/ exists and page count is as expected per language
  3. no unresolved placeholders ({key} leaks) inside built HTML
  4. every product page links back to catalog (sampled)
Exit 1 on any failure.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content")
DIST = os.path.join(ROOT, "dist")

sys.path.insert(0, ROOT)
from catalog_data import LANGS, PRODUCTS  # noqa: E402

def fail(msg):
    print("FAIL:", msg)
    sys.exit(1)

def main():
    # 1 — key parity
    with open(os.path.join(CONTENT, "bg.json"), encoding="utf-8") as f:
        master = set(json.load(f).keys())
    for lang in LANGS:
        with open(os.path.join(CONTENT, lang + ".json"), encoding="utf-8") as f:
            keys = set(json.load(f).keys())
        missing = master - keys
        extra = keys - master
        if missing:
            fail(f"{lang}.json missing keys: {sorted(missing)[:6]}")
        if extra:
            fail(f"{lang}.json has unknown keys: {sorted(extra)[:6]}")
    print(f"1. i18n parity OK — {len(master)} keys × {len(LANGS)} languages")

    if not os.path.isdir(DIST):
        fail("dist/ missing — run build.py first")

    # 2 — page inventory
    expect_static = 10 + len(PRODUCTS)
    for lang in LANGS:
        d = os.path.join(DIST, lang)
        n = 0
        for _dp, _dn, files in os.walk(d):
            n += sum(1 for x in files if x.endswith(".html"))
        if n != expect_static:
            fail(f"{lang}: expected {expect_static} pages, found {n}")
    print(f"2. inventory OK — {expect_static} pages × {len(LANGS)} languages "
          f"= {expect_static * len(LANGS)} files")

    # 3 — placeholder leaks
    leak = re.compile(r"\{[a-z_][a-z0-9_]*\}")
    scanned = 0
    for lang in ("bg", "en"):
        for _dp, _dn, files in os.walk(os.path.join(DIST, lang)):
            for fn in files:
                if not fn.endswith(".html"):
                    continue
                with open(os.path.join(_dp, fn), encoding="utf-8") as f:
                    txt = f.read()
                # ignore legit JS templates inside <script> (quote.js strings, json islands)
                txt2 = re.sub(r"<script[\s\S]*?</script>", "", txt)
                # and intentional {n}/{name} templates inside data-tpl attributes
                txt2 = re.sub(r'data-tpl="[^"]*"', "", txt2)
                m = leak.findall(txt2)
                if m:
                    fail(f"{lang}/{fn}: placeholder leak {m[:3]}")
                scanned += 1
    print(f"3. placeholder scan OK — {scanned} files")

    # 4 — sample product page sanity
    p0 = PRODUCTS[17]
    f = os.path.join(DIST, "en", "produkt", p0["slug"], "index.html")
    with open(f, encoding="utf-8") as fh:
        txt = fh.read()
    for needle in ("catalog.js", "spec", "Similar", "oferta"):
        if needle not in txt:
            fail(f"product page missing {needle!r}")
    print("4. product page sanity OK")

    print("\nVALIDATION PASSED")

if __name__ == "__main__":
    main()
