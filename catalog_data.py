# -*- coding: utf-8 -*-
"""Infraconcept 2026 — product graph.

Single source of truth for the catalog: facets (purpose/type/age/material/brand),
SVG pictograms per product type, and the product dataset itself.

Product tuple fields (terse; expanded below):
    (purpose, type, brand, ages, mats, certs, cls, avail, series, model, dims, cap)
      purpose : play | sport | park | flooring
      type    : see TYPES
      ages    : subset of AGES (empty = all ages / n/a)
      mats    : subset of MATERIALS
      certs   : subset of CERTS
      cls     : 1=basic 2=mid 3=premium
      avail   : stock | order
      cap     : capacity / performance string (language-neutral)
"""

LANGS = ["bg", "en", "ro", "el", "sr", "mk", "al"]
DEFAULT_LANG = "bg"

PURPOSES = ["play", "sport", "park", "flooring"]
PURPOSE_HUE = {"play": 14, "sport": 150, "park": 96, "flooring": 228}  # card art

TYPES = {
    "play":     ["swing", "slide", "climber", "carousel", "spring", "complex",
                 "inclusive", "sensory", "figure3d", "playhouse", "rope", "balance"],
    "sport":    ["fitness", "streetworkout", "climbing", "muga", "goals", "track"],
    "park":     ["bench", "bin", "pergola", "bikerack", "planter", "lighting", "fence"],
    "flooring": ["tile", "poured", "cork", "grass", "acrylic", "epoxy", "pu", "stonecarpet"],
}
ALL_TYPES = [t for p in PURPOSES for t in TYPES[p]]

AGES = ["0-3", "3-6", "6-12", "12+", "adult"]
MATERIALS = ["robinia", "metal", "hpl", "rope", "concrete", "rubber", "cork", "combined"]
CERTS = ["EN 1176", "EN 1177", "EN 16630", "EN 15312", "EN 14904"]

BRANDS = {
    "proludic":  {"name": "Proludic",       "country": "FR", "since": 1988},
    "vinci":     {"name": "Vinci Play",     "country": "PL", "since": 2003},
    "polfisan":  {"name": "Polfisan",       "country": "PL", "since": 1997},
    "d3program": {"name": "3D Program",     "country": "BG", "since": 2012},
    "hbh":       {"name": "Hard Body Hang", "country": "BG", "since": 2016},
    "fulco":     {"name": "Fulco",          "country": "PL", "since": 1992},
    "innoflex":  {"name": "Innoflex",       "country": "BG", "since": 2019},
    "corkeen":   {"name": "Corkeen",        "country": "PT", "since": 2020},
    "greenset":  {"name": "GreenSet",       "country": "ES", "since": 1971},
    "epoxy":     {"name": "Epoxy",          "country": "BG", "since": 2015},
}

# ---------------------------------------------------------------- pictograms
# Inline SVG shapes per type (24x24, stroke style). Shapes are <path>/<circle>.
P = {
"swing":        '<path d="M4 20 L9 4 M20 20 L15 4 M9 4 h6 M11 4 v6.5 M13 4 v6.5 M10 11.5 h4 v3 h-4 z"/>',
"slide":        '<path d="M4 20 h4 v-4 h4 v-4 h4 V8 M16 8 L5 20 M16 8 h4 M16 8 v4"/>',
"climber":      '<path d="M12 3 L4 20 h16 Z M12 5 v15 M8.7 13 h6.6 M10.4 8.5 h3.2 M7 16.6 h10"/>',
"carousel":     '<path d="M12 3 v5 M12 14 L6.5 11 M12 14 l5.5 -3 M12 14 v6 M6 21.5 h12"/><circle cx="12" cy="14" r="6"/>',
"spring":       '<circle cx="12" cy="3.4" r="2"/><path d="M10 6 l4 2.5 l-4 2.5 l4 2.5 l-4 2.5 l4 2.5 M6 20.5 h12"/>',
"complex":      '<path d="M4 20 V9 h4 v11 M16 20 V9 h4 v11 M3 9 l3 -4 l3 4 M15 9 l3 -4 l3 4 M8 12.5 h8 M20 12 c-3 4 -6 6 -9 7"/>',
"inclusive":    '<circle cx="11" cy="3.6" r="1.9"/><path d="M11 6 v5 h5 l2.5 4 M11 10.5 h3 M8 12.8 a4.3 4.3 0 1 0 6.6 5.2"/>',
"sensory":      '<path d="M6 4 v16 M12 4 v16 M18 4 v16"/><circle cx="6" cy="10.5" r="1.7"/><circle cx="12" cy="14.5" r="1.7"/><circle cx="18" cy="7.5" r="1.7"/>',
"figure3d":     '<circle cx="8" cy="4.6" r="1.8"/><circle cx="16" cy="4.6" r="1.8"/><circle cx="12" cy="8.6" r="4.4"/><circle cx="12" cy="9.6" r="1.1"/><path d="M7.2 18.5 c0 -3 2 -4.7 4.8 -4.7 s4.8 1.7 4.8 4.7"/>',
"playhouse":    '<path d="M4 20 V10 l8 -6.5 L20 10 v10 Z M10 20 v-6 h4 v6"/>',
"rope":         '<path d="M12 3 v18 M12 4 L4 20 M12 4 L20 20 M12 8 L7.5 20 M12 8 L16.5 20 M3 21 h18"/>',
"balance":      '<path d="M3 20.5 h18 M4 15 h16 M8 15 v5.5 M16 15 v5.5"/>',
"fitness":      '<circle cx="8" cy="17.5" r="3.4"/><path d="M4 21 h16 M8 17.5 L14 8 h5 M19 8 v5"/>',
"streetworkout":'<path d="M5 21 V5 M19 21 V5 M5 5 h14 M10 5 v3 M14 5 v3"/><circle cx="10" cy="10.4" r="2"/><circle cx="14" cy="10.4" r="2"/>',
"climbing":     '<path d="M5 21 V4 h14 v17"/><circle cx="9" cy="8.5" r="1.3"/><circle cx="14.5" cy="6.5" r="1.3"/><circle cx="11.5" cy="12" r="1.3"/><circle cx="16" cy="15" r="1.3"/><circle cx="8" cy="16.5" r="1.3"/>',
"muga":         '<path d="M3 19.5 V6.5 h18 v13 M12 6.5 v13 M3 10 h2.5 M21 10 h-2.5"/><circle cx="12" cy="12.7" r="2.4"/>',
"goals":        '<path d="M4 20 V7 h16 v13 M4 13 h16 M9.3 7 v13 M14.7 7 v13"/>',
"track":        '<path d="M4 20 a8 8 0 0 1 16 0 M8 20 a4 4 0 0 1 8 0 M2 22.5 h20"/>',
"bench":        '<path d="M6.5 4 v15.5 M17.5 4 v15.5 M4 6.5 h16 M4 11 h16 M4 15.5 h4 M20 15.5 h-4"/>',
"bin":          '<path d="M6 7 h12 l-1.5 14 h-9 Z M5 5 h14 M10 3 h4 M10 10.5 v7 M14 10.5 v7"/>',
"pergola":      '<path d="M3 8 h18 M6 21 V8 M18 21 V8 M9 8 V4.5 M15 8 V4.5 M6 12 h12"/>',
"bikerack":     '<circle cx="7" cy="17" r="3.4"/><circle cx="17" cy="17" r="3.4"/><path d="M7 17 l3.5 -7 h4 l2.5 7 M10.5 10 L9.5 16 M13 7 h2"/>',
"planter":      '<path d="M6 12 h12 l-2 9 H8 Z M12 12 c-4 -2 -5.5 -5 -5.5 -8.5 M12 12 c0 -4.5 2 -6.5 5.5 -7.5 M12 12 V8.5"/>',
"lighting":     '<path d="M12 22 V9 M12 9 h5.5 M14.8 9 a3 3 0 0 0 5.7 0 M9 22 h6"/>',
"fence":        '<path d="M4 21 V6 M9 21 V6 M14 21 V6 M19 21 V6 M3 9.5 h18 M3 15 h18"/>',
"tile":         '<path d="M2 12 l10 -5 l10 5 l-10 5 Z M2 12 v4.5 L12 21.5 v-5 M22 12 v4.5 L12 21.5"/>',
"poured":       '<path d="M12 2.5 c3.2 4.3 5.3 7 5.3 9.7 a5.3 5.3 0 0 1 -10.6 0 c0 -2.7 2.1 -5.4 5.3 -9.7 Z M4 20 q4 -3 8 0 t8 0"/>',
"cork":         '<circle cx="12" cy="12" r="8"/><circle cx="9" cy="9.7" r="0.8"/><circle cx="13.5" cy="8.6" r="0.8"/><circle cx="15" cy="13.3" r="0.8"/><circle cx="10.2" cy="14.8" r="0.8"/><circle cx="13" cy="12" r="0.6"/>',
"grass":        '<path d="M3 20.5 h18 M5 20.5 c0 -6.5 1 -9.5 4 -12.5 M10.5 20.5 c0 -5.5 0 -8.5 2 -11 M16 20.5 c0 -6.5 1 -9.5 4 -12.5 M7.5 20.5 c0 -3.5 -1 -6 -3 -8.5"/>',
"acrylic":      '<path d="M4 21 V4 h16 v17 M4 12.5 h16 M4 8 h3 M20 8 h-3"/><circle cx="12" cy="12.5" r="3"/>',
"epoxy":        '<path d="M4 6.5 h11 v4 H4 Z M15 8.5 h4.5 V13 h-5 M14 13 v2.5 M3 20.5 h18 M7 20.5 v-6 M17 20.5 v-6"/>',
"pu":           '<path d="M10.5 3 h3 M11 3 v5.5 L6.2 18 a2.6 2.6 0 0 0 2.3 3.5 h7 a2.6 2.6 0 0 0 2.3 -3.5 L13 8.5 V3 M7.8 14.5 h8.4"/>',
"stonecarpet":  '<circle cx="7" cy="15" r="2.5"/><circle cx="13" cy="16.3" r="2"/><circle cx="17.2" cy="12.5" r="2.3"/><circle cx="10" cy="8.6" r="2.2"/><circle cx="16.4" cy="6.5" r="1.8"/><path d="M3 21 h18"/>',
}
def icon(t, cls=""):
    inner = P.get(t, P["complex"])
    c = f' class="{cls}"' if cls else ""
    return (f'<svg{c} viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" '
            f'aria-hidden="true">{inner}</svg>')

# ---------------------------------------------------------------- products
E1, E2, E3, E4, E5 = "EN 1176", "EN 1177", "EN 16630", "EN 15312", "EN 14904"

_RAW = [
 # ---- PLAY -----------------------------------------------------------------
 ("play","swing","proludic",["3-6","6-12"],["metal","rope"],[E1,E2],2,"order","Kanope","J-1201","3.4×2.1×2.5 m","4"),
 ("play","swing","vinci",["3-6","6-12"],["robinia","rope"],[E1,E2],2,"stock","Robinia Nest","VPS-08","3.8×2.4×2.6 m","5"),
 ("play","swing","polfisan",["0-3","3-6"],["metal","hpl"],[E1,E2],1,"stock","Piccolo Baby","PL-77","2.6×1.9×2.2 m","2"),
 ("play","slide","proludic",["3-6"],["hpl","metal"],[E1],1,"stock","Diabolo Baby","J-0523","3.1×0.6×1.9 m","2"),
 ("play","slide","vinci",["6-12"],["metal"],[E1],2,"order","Tubular Pro","VPS-311","5.2×0.8×3.6 m","3"),
 ("play","slide","polfisan",["3-6","6-12"],["hpl"],[E1],1,"stock","Mini Wave","PL-120","2.9×0.6×1.7 m","2"),
 ("play","climber","proludic",["6-12","12+"],["rope","metal"],[E1],3,"order","Ixo Spire","J-4410","5.6×5.6×6.2 m","10"),
 ("play","climber","vinci",["3-6","6-12"],["robinia","rope"],[E1],2,"stock","Acacia DOM","VPS-142","4.1×3.9×2.8 m","8"),
 ("play","carousel","proludic",["6-12"],["metal"],[E1],2,"order","Giro 360","J-0904","Ø2.2×0.9 m","6"),
 ("play","carousel","vinci",["3-6","6-12"],["metal","hpl"],[E1],1,"stock","Orbita","VPS-61","Ø1.8×0.8 m","5"),
 ("play","spring","vinci",["0-3","3-6"],["metal","hpl"],[E1],1,"stock","Zoo Rider","VPS-20","0.9×0.5×1.0 m","1"),
 ("play","spring","polfisan",["0-3","3-6"],["metal"],[E1],1,"stock","Veselko","PL-31","0.9×0.5×0.9 m","1"),
 ("play","complex","proludic",["3-6","6-12"],["robinia","hpl","rope"],[E1,E2],3,"order","Metropolis Grand","J-8001","11.5×8.2×5.4 m","35"),
 ("play","complex","vinci",["3-6","6-12"],["robinia"],[E1,E2],2,"order","Robinia Fort","VPS-500","9.0×7.1×4.6 m","24"),
 ("play","complex","polfisan",["3-6"],["hpl","metal"],[E1],1,"stock","Mini Villa","PL-210","5.4×4.2×2.9 m","12"),
 ("play","inclusive","proludic",["3-6","6-12"],["metal","hpl"],[E1],3,"order","Animals Access","J-3320","4.6×3.8×2.1 m","8"),
 ("play","inclusive","vinci",["0-3","3-6","6-12"],["robinia","metal"],[E1],2,"order","All-Play Ramp","VPS-404","6.2×4.0×1.6 m","10"),
 ("play","sensory","proludic",["0-3","3-6"],["hpl"],[E1],2,"stock","Biibox Touch","J-2102","1.4×0.4×1.6 m","3"),
 ("play","sensory","vinci",["0-3","3-6"],["hpl","metal"],[E1],1,"stock","Labyrinth Panel","VPS-96","1.6×0.3×1.5 m","3"),
 ("play","figure3d","d3program",["3-6","6-12"],["rubber"],[E1],2,"order","3D Dino Rex","3DP-114","2.4×1.1×1.5 m","4"),
 ("play","figure3d","d3program",["0-3","3-6"],["rubber"],[E1],1,"stock","3D Ladybird","3DP-021","1.2×0.9×0.8 m","2"),
 ("play","figure3d","d3program",["3-6","6-12"],["rubber"],[E1],2,"order","2D Ocean Maze","3DP-207","3.0×0.3×1.4 m","6"),
 ("play","playhouse","vinci",["0-3","3-6"],["robinia"],[E1],2,"stock","Robinia Lodge","VPS-88","3.2×2.6×3.1 m","6"),
 ("play","playhouse","proludic",["3-6"],["hpl"],[E1],2,"order","City Kiosk","J-1150","2.8×2.2×2.9 m","5"),
 ("play","rope","proludic",["6-12","12+"],["rope","metal"],[E1],3,"order","Kanope Altitude","J-9017","7.4×7.4×7.0 m","18"),
 ("play","rope","vinci",["6-12"],["rope","metal"],[E1],2,"order","Net Pyramid M","VPS-630","5.0×5.0×4.4 m","10"),
 ("play","balance","vinci",["3-6","6-12","12+"],["robinia"],[E1],1,"stock","Trail Steps","VPS-71","6.0×2.0×0.6 m","6"),
 ("play","balance","proludic",["6-12","12+"],["metal","rope"],[E1],2,"order","GymLudic Flow","J-5520","8.4×2.6×1.2 m","8"),
 # ---- SPORT ----------------------------------------------------------------
 ("sport","fitness","hbh",["12+","adult"],["metal"],[E3],2,"order","Calisthenics Core","HBH-01","2.8×1.2×2.5 m","3"),
 ("sport","fitness","proludic",["12+","adult"],["metal","hpl"],[E3],2,"order","ActiFit Duo","J-7110","2.4×1.4×2.2 m","2"),
 ("sport","streetworkout","hbh",["12+","adult"],["metal"],[E3],3,"order","HBH Arena Pro","HBH-30","7.2×3.4×3.1 m","12"),
 ("sport","streetworkout","hbh",["12+","adult"],["metal"],[E3],2,"stock","Rings Frame","HBH-12","3.6×2.2×3.0 m","4"),
 ("sport","streetworkout","vinci",["12+","adult"],["metal"],[E3],1,"stock","Outdoor Gym Set","VPS-700","5.0×2.4×2.5 m","6"),
 ("sport","climbing","hbh",["12+","adult"],["concrete","metal"],[E3],3,"order","Boulder Granite","HBH-B1","4.2×3.6×4.2 m","6"),
 ("sport","climbing","hbh",["6-12","12+","adult"],["concrete"],[E3],3,"order","Boulder Urban S","HBH-B4","3.1×2.7×3.2 m","4"),
 ("sport","muga","proludic",["6-12","12+","adult"],["metal"],[E4],3,"order","City Stade 12×24","J-8800","26×14×4 m","26"),
 ("sport","muga","polfisan",["12+","adult"],["metal"],[E4],2,"order","Arena Basic 9×18","PL-500","20×11×3.5 m","16"),
 ("sport","goals","proludic",["12+","adult"],["metal"],[E4],2,"stock","Footgoal HD","J-7205","3.2×1.1×2.2 m","2"),
 ("sport","goals","polfisan",["6-12","12+"],["metal"],[E4],1,"stock","Street Basket","PL-601","1.8×1.2×3.9 m","2"),
 ("sport","track","greenset",["12+","adult"],["rubber"],[E5],3,"order","GrandPrix Track","GS-T4","400 m / 6 lanes","—"),
 ("sport","track","innoflex",["6-12","12+","adult"],["rubber"],[E5],1,"stock","JogFlex Lane","IF-TL2","50 m / module","—"),
 # ---- PARK -----------------------------------------------------------------
 ("park","bench","fulco",[],["concrete","metal"],[],3,"order","Sofia Monolith","FC-310","2.2×0.6×0.45 m","3"),
 ("park","bench","fulco",[],["metal"],[],2,"stock","Linea Steel","FC-201","1.8×0.55×0.8 m","3"),
 ("park","bench","proludic",[],["robinia","metal"],[],2,"order","Foret Bench","J-8810","2.0×0.6×0.8 m","3"),
 ("park","bin","fulco",[],["metal"],[],1,"stock","Cito 90L","FC-090","Ø0.45×0.95 m","90 L"),
 ("park","bin","vinci",[],["metal"],[],1,"stock","EcoBin 60","VPS-901","0.4×0.4×0.9 m","60 L"),
 ("park","pergola","fulco",[],["concrete","metal"],[],3,"order","Arcadia Shade","FC-520","4.5×3.0×3.2 m","—"),
 ("park","pergola","vinci",[],["robinia"],[],2,"order","Robin Canopy","VPS-855","3.8×3.8×3.0 m","—"),
 ("park","bikerack","fulco",[],["metal"],[],1,"stock","Velo Loop","FC-112","0.9×0.1×0.85 m","2"),
 ("park","bikerack","proludic",[],["metal"],[],1,"stock","City Rack","J-8890","1.0×0.15×0.9 m","2"),
 ("park","planter","fulco",[],["concrete"],[],2,"order","Geo Planter L","FC-400","1.2×1.2×0.9 m","—"),
 ("park","planter","vinci",[],["robinia"],[],1,"stock","Robin Box","VPS-950","1.0×1.0×0.7 m","—"),
 ("park","lighting","fulco",[],["metal"],[],2,"order","Luma Pole 4m","FC-600","Ø0.18×4.0 m","—"),
 ("park","lighting","proludic",[],["metal"],[],2,"order","ParkLine LED","J-8910","Ø0.16×3.5 m","—"),
 ("park","fence","fulco",[],["metal"],[],1,"stock","GridRail","FC-150","2.0×1.1 m / panel","—"),
 ("park","fence","vinci",[],["robinia","metal"],[],1,"stock","Robin Fence","VPS-970","1.8×1.0 m / panel","—"),
 # ---- FLOORING --------------------------------------------------------------
 ("flooring","tile","innoflex",[],["rubber"],[E2],1,"stock","Innoflex Tile 50×50","IF-5050","500×500×30 mm","HIC 1.1 m"),
 ("flooring","tile","innoflex",[],["rubber"],[E2],1,"stock","Innoflex Tile XL","IF-1000","1000×1000×45 mm","HIC 1.6 m"),
 ("flooring","poured","innoflex",[],["rubber"],[E2],2,"order","Wetpour Seamless","IF-WP","20–80 mm","HIC ≤2.4 m"),
 ("flooring","poured","corkeen",[],["cork"],[E2],3,"order","Corkeen Play Natural","CK-PL","40–90 mm","HIC ≤2.8 m"),
 ("flooring","cork","corkeen",[],["cork"],[E2],3,"order","Corkeen Master","CK-90","two-layer system","CO₂ neg."),
 ("flooring","grass","innoflex",[],["combined"],[E2],2,"order","TurfPlay 35","IF-TG35","rolls 2/4 m","35 mm"),
 ("flooring","grass","greenset",[],["combined"],[E5],2,"order","ONE-DNA Turf","GS-DNA","rolls 2/4 m","recyclable"),
 ("flooring","acrylic","greenset",[],["combined"],[E5],3,"order","Cushion Prestige","GS-CP","8-layer sport","ITF 3"),
 ("flooring","acrylic","greenset",[],["combined"],[E5],2,"stock","Comfort Standard","GS-CS","5-layer sport","ITF 4"),
 ("flooring","epoxy","epoxy",[],["combined"],[],2,"order","EpoxyGuard HD","EP-200","2–4 mm","RL R10"),
 ("flooring","epoxy","epoxy",[],["combined"],[],1,"stock","EpoxyDecor Flake","EP-110","2–3 mm","decorative"),
 ("flooring","pu","epoxy",[],["combined"],[],2,"order","PU Flex Industrial","EP-P40","3–6 mm","R11 / ESD"),
 ("flooring","stonecarpet","epoxy",[],["combined"],[],2,"order","StoneCarpet Quartz","EP-SQ","6–10 mm","UV-stable"),
]

def _slug(t, model, i):
    base = f"{t}-{model.lower()}"
    for a, b in [("×","x"),(" ","-"),("–","-"),("—","-"),("®",""),("é","e"),
                 ("Ø","d"),("'",""),("/",""),("≥",""),("≤","")]:
        base = base.replace(a, b)
    out = [ch for ch in base if ord(ch) < 128 and (ch.isalnum() or ch == "-")]
    return "".join(out).strip("-").replace("--", "-") + f"-{i:03d}"

PRODUCTS = []
for i, (purpose, typ, brand, ages, mats, certs, cls, avail, series, model, dims, cap) in enumerate(_RAW, 1):
    PRODUCTS.append({
        "id": f"p{i:03d}",
        "slug": _slug(typ, model, i),
        "purpose": purpose, "type": typ, "brand": brand,
        "ages": ages, "mats": mats, "certs": certs,
        "cls": cls, "avail": avail,
        "series": series, "model": model,
        "dims": dims, "cap": cap,
        "hue": PURPOSE_HUE[purpose],
    })

if __name__ == "__main__":
    print(f"{len(PRODUCTS)} products, {len(ALL_TYPES)} types, {len(BRANDS)} brands")
