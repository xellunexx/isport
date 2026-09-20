"""Download product images (first two per product) + brand logos; resize to webp.

out: img/p/<id>_1.webp, <id>_2.webp (max 880px, q78) ; img/brands/<slug>.png ; img/hero/*.webp
writes: crawl/images.map.json {product_id: [local files]}
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
import json, os, re, sys, threading
import requests
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(BASE, "img")
for d in ["p", "brands", "hero"]:
    os.makedirs(os.path.join(IMG, d), exist_ok=True)

H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
LOGOS = {
    "fulco": "https://infraconcept.bg/wp-content/uploads/2025/06/fulco-logo-.png",
    "proludic": "https://infraconcept.bg/wp-content/uploads/2024/04/manufacturer-logo-proludic.png",
    "vinci": "https://infraconcept.bg/wp-content/uploads/2024/03/manufacturer-logo-vinci-play.png",
    "3dprogram": "https://infraconcept.bg/wp-content/uploads/2024/10/3D-Program-Logo.png",
    "polfisan": "https://infraconcept.bg/wp-content/uploads/2024/03/manufacturer-logo-polfisan.png",
    "hbh": "https://infraconcept.bg/wp-content/uploads/2025/06/hard-body-hang-logo-logo-.png",
    "innoflex": "https://infraconcept.bg/wp-content/uploads/2025/06/innoflex-logo-.png",
    "corkeen": "https://infraconcept.bg/wp-content/uploads/2025/06/CorkeenLogo.png",
    "epoxy": "https://infraconcept.bg/wp-content/uploads/2025/06/epoxy-logo-.png",
    "infra": "https://infraconcept.bg/wp-content/uploads/2025/11/Infraconcept1.png",
}
_tls = threading.local()

def sess():
    if not hasattr(_tls, "s"):
        _tls.s = requests.Session()
        _tls.s.headers.update(H)
    return _tls.s

def get(url, tries=2):
    for _ in range(tries):
        try:
            r = sess().get(url, timeout=30)
            if r.status_code == 200 and len(r.content) > 800:
                return r.content
        except Exception:
            pass
    return None

def save_webp(raw, path, maxdim=880, q=78):
    im = Image.open(BytesIO(raw))
    im = im.convert("RGB") if im.mode not in ("RGB", "RGBA") else im
    if im.mode == "RGBA":
        bg = Image.new("RGB", im.size, (250, 250, 248))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    w, h = im.size
    if max(w, h) > maxdim:
        sc = maxdim / max(w, h)
        im = im.resize((max(1, int(w * sc)), max(1, int(h * sc))), Image.LANCZOS)
    im.save(path, "WEBP", quality=q, method=4)

def task_product(p):
    pid = p["id"]
    got = []
    for i, url in enumerate(p["img"][:2]):
        fn = f"img/p/{pid}_{i+1}.webp"
        ap = os.path.join(BASE, fn)
        if os.path.exists(ap) and os.path.getsize(ap) > 1000:
            got.append(fn)
            continue
        raw = get(url)
        if not raw:
            continue
        try:
            save_webp(raw, ap)
            got.append(fn)
        except Exception:
            pass
    return pid, got

def task_logo(kv):
    slug, url = kv
    ap = os.path.join(IMG, "brands", slug + ".png")
    if os.path.exists(ap) and os.path.getsize(ap) > 500:
        return slug, True
    raw = get(url)
    if raw:
        try:
            im = Image.open(BytesIO(raw))
            im.thumbnail((420, 420), Image.LANCZOS)
            im.save(ap, "PNG", optimize=True)
            return slug, True
        except Exception:
            return slug, False
    return slug, False

norm = json.load(open(os.path.join(BASE, "crawl", "catalog.norm.json"), encoding="utf-8"))
print("products:", len(norm))

mapping = {}
with ThreadPoolExecutor(max_workers=8) as ex:
    futs = [ex.submit(task_product, p) for p in norm] + [ex.submit(task_logo, kv) for kv in LOGOS.items()]
    done = 0
    for f in as_completed(futs):
        r = f.result()
        if isinstance(r[0], str) and isinstance(r[1], list):
            mapping[r[0]] = r[1]
        done += 1
        if done % 250 == 0:
            print(f"{done}/{len(futs)}", flush=True)

json.dump(mapping, open(os.path.join(BASE, "crawl", "images.map.json"), "w", encoding="utf-8"))
noimg = sum(1 for v in mapping.values() if not v)
print("DONE. mapped:", len(mapping), "without images:", noimg)
