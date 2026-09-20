"""catalog.raw.json -> data/catalog.js (window.CATALOG) with facet tags.

Facets per product:
  cat      play|park|sport|flooring            (from breadcrumbs; brand fallback)
  brand    slug                                (crumbs[1], normalized)
  series   slug + bg label                     (backfilled from crumb_links)
  purpose  taxonomy key                        (ordered regex rules on title)
  mats     [wood,metal,concrete,rubber,cork,rope,plastic,hpl,turf,composite]
  ageMin/Max extracted from "Възрастова група" -> numeric years
  specs    dims / users / fall / safety (display in quick-view)
"""
from collections import Counter
import json, os, re, sys, unicodedata
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

data = json.load(open(os.path.join(BASE, "crawl", "catalog.raw.json"), encoding="utf-8"))
products_in, series_in = data["products"], data["series"]

BRAND_MAP = {
    "fulco": "Fulco", "proludic": "Proludic", "vinci play": "Vinci Play", "3dprogram": "3D Program",
    "polfisan": "Polfisan", "hard body hang": "Hard Body Hang", "innoflex": "Innoflex",
    "corkeen": "Corkeen", "epoxy": "Epoxy", "green-set": "GreenSet", "one-dna": "ONE-DNA",
    "playnetic": "Playnetic", "sawo": "Sawo", "finture-streetunit": "Finture StreetUnit",
    "настилки": "Инфра Концепт", "infra concept": "Инфра Концепт",
}
BRAND_SLUG = {
    "Fulco": "fulco", "Proludic": "proludic", "Vinci Play": "vinci", "3D Program": "3dprogram",
    "Polfisan": "polfisan", "Hard Body Hang": "hbh", "Innoflex": "innoflex", "Corkeen": "corkeen",
    "Epoxy": "epoxy", "GreenSet": "greenset", "ONE-DNA": "onedna", "Playnetic": "playnetic",
    "Sawo": "sawo", "Finture StreetUnit": "finture", "Инфра Концепт": "infra",
}
CAT_MAP = {"Игра": "play", "Парк": "park", "Спорт": "sport", "Настилки": "flooring"}
FLOOR_BRANDS = {"innoflex", "corkeen", "epoxy", "greenset", "onedna"}

# global overrides applied BEFORE per-cat rules (fixing miscategorized source data)
OVER = [
    (re.compile(r"комбинирано детско съоръжение|многофункционалн[аои].*игр", re.I), "play", "multiplay"),
    (re.compile(r"\bwoof\b|кучешк", re.I), "park", "dog"),
    (re.compile(r"фитнес степер|спортн[ао] станци", re.I), "sport", "fitness"),
]

# ---------------- purpose rules: (cat, key, regex) evaluated in order -------------
R = [
    # PLAY ---------------------------------------------------------------------
    ("play", "swings",      r"люлк|swing\b|swing\s|хамак"),
    ("play", "springers",   r"клатушк|пружин"),
    ("play", "slides",      r"пързалк|тобоган|slide"),
    ("play", "carousels",   r"въртележк|карусел|carousel|orbita"),
    ("play", "climbers",    r"катерушк|катерен|пирамида|мрежа за|climboo|climb|стъпала"),
    ("play", "rope",        r"въжен|въже|nettix|hoop.*въже|пръстени|барове|лостове|вертикална мрежа"),
    ("play", "balance",     r"баланс|греда|пътека за|gymludic|пътеки|пътека|мост|родео|аероскейт|surf|степер|трупи"),
    ("play", "sandboxes",   r"пясъч|сандпит|sand|копач"),
    ("play", "water",       r"aquatica|водн|спрей|фонтан за игра|оризов"),
    ("play", "playhouses",  r"къщичк|къща|дървени къщи|кабина|biibox|кащичк|пазар|работилница|убежище|хижа|влакче и гара|гареr|сметало|гаране"),
    ("play", "thematic",    r"кораб|влак|самолет|ракет|камион|трактор|животн|animals|динозав|караван|пещера|замък|castillo|минаре|кладенец|гаргойл|слонче|дърво|dragster|кола\b|сърф|lighthouse|фар\b"),
    ("play", "trampoline",  r"батут|трамплин|tramplini|trampoline"),
    ("play", "figures",     r"3d ?(program|фигур)|фигур|обемн|скулптур|2d"),
    ("play", "multiplay",   r"комбиниран|многофункционалн|multiplay|metropolis|игров[иа] комплекс|съоръжение за игра"),
    ("play", "toddler",     r"baby|бебе|малк[аои] деца|минисуийт|minisweet|mini\b"),
    ("play", "interactive", r"интерактив|playnetic|energy|екран за игра|light-it-up|маса за игра|предизвикателство"),
    # SPORT --------------------------------------------------------------------
    ("sport", "walls",      r"стена за катерене|боулдъринг|boulder|climbing|тренирова?чна стена|проходима стена|наклон за катерене|модул за катерене|катерушка|катерене|мачта|решетки"),
    ("sport", "arenas",     r"arena|игрище|multisport|многофункционално игрище|игрища"),
    ("sport", "street",     r"workout|стрийт|street|лостове|лост |успоредк|ръкохватк|fire\s?wall|пейка за корем|шведск|щанг|маймунск|стълба за катерене|хоризонтални пръти|барове|пръти|лежанка|дъска за|боксова круша|махало|диск за|велоергометър|халки"),
    ("sport", "fitness",    r"фитнес|fitness|acti.?fit|велотренажор|крос тренажор|тренажор|елиптик|спортн[ао] станци|уред за|степер|хронометър|скок|гребна|машина|стъпаловидна|устройство за|балансиращ мост|греда за баланс"),
    ("sport", "parkour",    r"ninja|паркур|препятстви|obstacle|комбинирано трасе|трасе|тунел|висящ мост|кanyon|каньон|висящи стъпала|връв|въздушен преход|платформа за отскок"),
    ("sport", "goals",      r"кош|врат|баскетбол|футбол|волейбол|тенис на|хокей|гол"),
    ("sport", "trim",       r"трим|витажът|нишки за|пътека.*спорт|табела|указателн|пешеходна|бягаща"),
    ("sport", "tramp",      r"батут|трамплин"),
    ("sport", "tables",     r"шах|шахматен|table.*chess|маса за игра|маса за тенис|пинг понг"),
    ("sport", "skate",      r"скейт|рампа|памп|skate|pump"),
    # PARK ---------------------------------------------------------------------
    ("park", "benches",     r"пейк|седалк|bench|seat|sit|стол|stool|бар за сядане|шезлонг|хамак|лежанк|butaca|пейк"),
    ("park", "tables",      r"маса|table|шатра"),
    ("park", "picnic",      r"пикник|picnic"),
    ("park", "bins",        r"кошче|кош за|bin|разделн|пепелник|ashtray"),
    ("park", "planters",    r"кашпа|саксия|planter|цветарник|цветя"),
    ("park", "dog",         r"woof|кучешк|куче|dog"),
    ("park", "bollards",    r"болард|bollard|ограничител"),
    ("park", "bike",        r"вело|велосипед|bike|колоездач"),
    ("park", "busstop",     r"автобусн|спирк|bus"),
    ("park", "shelters",    r"навес|shelter|сенник|пергола|беседка"),
    ("park", "info",        r"борд|табела|указател|signage|инфо|пано|sign"),
    ("park", "smart",       r"смарт|smart|зарядн|usb|соларн|осветлени|лампа|стълб"),
    ("park", "wells",       r"кладенец|чешм|фонтан|well|pump"),
    ("park", "fences",      r"ограда|парапет|fence|бариера|порти"),
    ("park", "stairs",      r"стълб|рампи? за достъп|пандус"),
    # FLOORING -----------------------------------------------------------------
    ("flooring", "tiles",   r"плоч|tile|паве|плочк"),
    ("flooring", "cork",    r"корк|cork|corkeen"),
    ("flooring", "turf",    r"трева|turf|grass|one.?dna"),
    ("flooring", "poured",  r"разливн|епдм|epdm|леен|зам в движение|elastic|бягащ"),
    ("flooring", "acrylic", r"акрил|acryl|greenset|тенис корт"),
    ("flooring", "epoxy",   r"епоксид|epoxy"),
    ("flooring", "pu",      r"полиуретан|infraplay|pu\b|полиуретанов"),
    ("flooring", "stone",   r"каменен|каменен килим|stone"),
    ("flooring", "gym",     r"фитнес настилк|спортна настилк|зала"),
]
RULES = [(c, k, re.compile(rx, re.I | re.U)) for c, k, rx in R]

# ---------------- material rules ----------------
M = [
    ("wood",      r"дървен|дърво|robinia|робиния|акаци|листвениц|бамбук|дерев[оя]|wood|тик"),
    ("metal",     r"метал|стоман|алумин|поцинкован|galvan|steel|желязо|инокс|неръждаем|мetal"),
    ("concrete",  r"бетон|камен|архитектурен|concrete|stone"),
    ("rubber",    r"каучук|гумен|резина|rubber|sbr|epdm"),
    ("cork",      r"корк|cork"),
    ("rope",      r"въжен|въже|rope|nettix"),
    ("plastic",   r"пластмас|hdpe|полиетилен|plastic"),
    ("hpl",       r"hpl|компактен ламинат"),
    ("turf",      r"трева|turf|grass"),
    ("composite", r"композит|composite|wpc"),
]
MRULES = [(k, re.compile(rx, re.I | re.U)) for k, rx in M]
SERIES_MAT = {  # conservative imputation for famous collections
    "robinia": ["wood"], "naturo": ["wood"], "kanope": ["wood"], "arborea-play": ["wood"],
    "durveni-kushti": ["wood"], "ixo": ["metal", "hpl"], "nettix": ["rope", "metal"],
    "diabolo": ["metal", "hpl"], "diabolo-baby": ["metal", "hpl"],
    "metropolis-mnogofunktsionalni-igri-proludic": ["metal", "hpl"], "metropolis-kray": ["metal", "hpl"],
    "biibox": ["hpl", "metal"], "city": ["metal", "wood"], "animals": ["rubber"],
    "aquatica": ["metal", "plastic"], "solo": ["metal"], "roxx": ["metal"],
    "climboo": ["metal", "plastic"], "hoop": ["rope", "metal"], "jungle": ["metal", "hpl"],
    "maxx": ["metal", "hpl"], "crooc": ["metal", "hpl"], "castillo": ["metal"],
    "minisweet": ["metal", "plastic"], "park": ["wood", "metal"],
    "fitness": ["metal"], "workout": ["metal"], "workoutpro": ["metal"], "active": ["metal", "wood"],
    "seria-arena": ["metal"], "acti-fit-bg": ["metal"], "actininja": ["metal", "hpl"],
    "acti-street-bg": ["metal"], "fitness-acti-fun-bg": ["metal"],
    "dinamichni-strukturi-acti-fun-bg": ["metal"], "mnogofunktsionalni-igrishta": ["metal"],
    "trim-pateki": ["wood", "metal"], "actifun-tramplini": ["metal"],
    "gymludic-moduli-za-pateki-i-balansirane": ["wood"],
    "pejki-fulco": ["metal", "wood"], "masi-fulco": ["metal", "wood"], "picnic-sets": ["metal", "wood"],
    "koshcheta-za-smet-fulco": ["metal"], "bolardi-fulco": ["metal"],
    "velo_stoyki_fulco": ["metal"], "pepelnitsi-fulco": ["metal"],
    "avtobusni_spirki_fulco": ["metal", "hpl"], "kashpi_fulco": ["concrete"],
    "smart-produkti-fulco": ["metal"], "info-bordove-fulco": ["metal"],
    "furniture": ["metal", "wood"], "fences-and-gates": ["metal"], "signage": ["metal"],
    "3dprogramklasicheskaseria": ["rubber"], "3dprogram-obiknovena-seria": ["rubber"],
    "3dprogramminiseria": ["rubber"], "3dprogramekstraseria": ["rubber"],
    "mladejko-sportno-oborudvane": ["wood", "metal"],
    "spring": ["metal"], "robinia-rope": ["rope", "wood"],
}

def clean_title(t):
    return re.sub(r"\s+", " ", t or "").strip()

def code_of(t, slug):
    m = re.search(r"[–-]\s*([A-Za-z0-9]{1,3}[0-9][A-Za-z0-9.\-/]*)\s*$", t or "")
    return m.group(1) if m else ""

def parse_age(attrs):
    lo, hi = None, None
    for a in attrs:
        if "Възраст" in a:
            m = re.search(r"(\d+)\s*[-–]\s*(\d+)\s*г", a)
            if m:
                lo, hi = int(m.group(1)), int(m.group(2))
            else:
                m2 = re.search(r"(\d+)\s*\+\s*г", a)
                if m2:
                    lo, hi = int(m2.group(1)), 99
                else:
                    m3 = re.search(r"от\s*(\d+)\s*г", a)
                    if m3:
                        lo, hi = int(m3.group(1)), 99
    return lo, hi

def spec_of(attrs, key):
    for a in attrs:
        if a.startswith(key):
            return a.split(":", 1)[1].strip() if ":" in a else a
    return ""

out, stats = [], Counter()
title_types_seen = {}
from collections import defaultdict
title_types_seen = defaultdict(list)
series_lookup = {s: v for s, v in series_in.items()}

for p in products_in:
    crumbs = [c for c in p["crumbs"] if c and c != "Начало"]
    brand = None
    for c in crumbs:
        if c.lower() in BRAND_MAP:
            brand = BRAND_MAP[c.lower()]
            break
    cat = None
    for c in crumbs:
        if c in CAT_MAP:
            cat = CAT_MAP[c]
            break
    if not brand and crumbs and crumbs[0].lower() in BRAND_MAP:
        brand = BRAND_MAP[crumbs[0].lower()]
    if not brand:
        brand = "Инфра Концепт"
    bslug = BRAND_SLUG.get(brand, "infra")
    if not cat:
        cat = "flooring" if bslug in FLOOR_BRANDS else None
    if not cat:
        stats["drop_no_cat"] += 1
        continue  # cannot place -> drop (should be rare)
    if bslug in FLOOR_BRANDS:
        cat = "flooring"
    title = clean_title(p["title_bg"])
    series_slug = p.get("series_slug")
    series_label = ""
    if series_slug and series_slug in series_lookup:
        series_label = clean_title(series_lookup[series_slug].get("title_bg", ""))

    blob = " ".join([title, series_label] + p["attrs"] + p["desc_bg"]).lower()
    # global overrides beat crumbs (fix miscategorized source data)
    ov = next(((oc, op) for rx, oc, op in OVER if rx.search(blob)), None)
    if ov:
        cat, purpose = ov
    else:
        purpose = None
        for c, k, rx in RULES:
            if c == cat and rx.search(blob):
                purpose = k
                break
    if not purpose:
        purpose = "multiplay" if cat == "play" else "other"
        stats[f"other_{cat}"] += 1
        if len(title_types_seen[(cat, "other")]) < 25:
            title_types_seen[(cat, "other")].append(title[:60])
    mats = set()
    tblob = (title + " " + series_label).lower()
    for k, rx in MRULES:
        if rx.search(tblob):
            mats.add(k)
    if not mats and series_slug in SERIES_MAT:
        mats.update(SERIES_MAT[series_slug])
    lo, hi = parse_age(p["attrs"])
    out.append({
        "id": p["slug"],
        "n": title,
        "code": code_of(title, p["slug"]),
        "cat": cat,
        "brand": bslug,
        "series": series_slug or "",
        "sname": series_label,
        "purp": [purpose],
        "mats": sorted(mats),
        "age": [lo, hi] if lo is not None else None,
        "specs": {
            "dims": spec_of(p["attrs"], "Размери"),
            "fall": spec_of(p["attrs"], "Критична височина на падане"),
            "users": spec_of(p["attrs"], "Брой ползватели"),
            "zone": spec_of(p["attrs"], "Зона на безопасност"),
        },
        "img": p["images"][:3],
        "pdf": p["pdfs"][:2],
        "url": p["url"],
    })
    stats[f"cat_{cat}"] += 1
    stats[f"brand_{bslug}"] += 1
    stats[f"purp_{cat}_{purpose}"] += 1

# brand stats
for b in sorted({BRAND_SLUG.get(x, x) for x in BRAND_MAP.values()}):
    print(f"brand {b:12s} {stats[f'brand_{b}']}")
for c in ["play", "sport", "park", "flooring"]:
    print(f"\ncat {c}: {stats[f'cat_{c}']}  others: {stats[f'other_{c}']}")
    ks = [(k[len(f'purp_{c}_'):], v) for k, v in stats.items() if k.startswith(f"purp_{c}_")]
    for k, v in sorted(ks, key=lambda x: -x[1]):
        print(f"   {v:5d} {k}")
    for t in title_types_seen.get((c, "other"), [])[:15]:
        print(f"       ? {t}")

no_mat = sum(1 for p in out if not p["mats"] and p["cat"] in ("play", "park", "sport"))
mat_cov = Counter()
for p in out:
    for m in p["mats"]:
        mat_cov[m] += 1
print("\nmats coverage:", dict(mat_cov.most_common()), "no-mat:", no_mat)

json.dump(out, open(os.path.join(BASE, "crawl", "catalog.norm.json"), "w", encoding="utf-8"),
          ensure_ascii=False)
print("\nTOTAL:", len(out))
