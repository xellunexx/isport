# Infraconcept 2026 — rebuild

Static, 7-language rebuild of https://infraconcept.bg/ around one idea:

> **„Покажи всичко. Стесни за секунди."** — the catalogue *is* the landing view.
> Every product pops immediately; a permanent filter bar shrinks the grid live.
> Brand is the last filter, not the gate. No dead ends. Every product ≤ 2 interactions.

## Stack

Zero runtime dependencies. Python 3 stdlib generator → deployable static `dist/`.
Frontend: hand-rolled modern CSS + vanilla JS (no frameworks, no trackers, no build chain).

```
catalog_data.py     products (69), 33 product types, 10 brands, SVG pictogram system
components.py       HTML component builders (cards, filter bar, header/footer, modal)
build.py            page orchestrator — 79 pages × 7 languages → dist/
content/{bg,en,ro,el,sr,mk,al}.json   236 UI keys per language (bg = canonical)
assets/css/site.css dark-premium design system, hue-driven card art
assets/js/catalog.js the engine: faceted filtering + smart hover-similar + search + quick view
assets/js/site.js   nav, lang switch, quote cart (localStorage), toast, reveal
assets/js/quote.js  oferta page: qty editing, JSON export, mailto enquiry
tools/validate.py   post-build gate (i18n parity, inventory, placeholder leaks)
```

## Build / validate / preview

```powershell
# build (from repo root)
.\.venv\Scripts\python.exe infraconcept2026\build.py
# validation gate
.\.venv\Scripts\python.exe infraconcept2026\tools\validate.py
# build + serve at http://localhost:8031
.\.venv\Scripts\python.exe infraconcept2026\build.py --serve
```

`dist/` is the whole site — drop it on any static host. `dist/index.html` language-redirects.

## The smart engine (catalog.js)

- **Facets**: Предназначение / Вид / Възраст / Материал / Марка + search. OR within a facet, AND across.
- **Dead-end-proof**: every option shows a live forward count; zero-result options are disabled.
- **URL-driven state**: `?purpose=play&type=swing&age=3-6&mat=robinia&brand=proludic` — shareable, tender-friendly.
- **Smart similar mode**: dwell-hover (650 ms) a product → ghost filters (purpose+type+material+brand)
  apply live, banner explains what's shown, `Закотви` pins them as real filters, `Esc` restores.
  Touch devices use the per-card ⦿ button. Home-page dwell deep-links into the catalog in similar mode.
- **Quote cart**: `＋ Добави` anywhere → localStorage → `/oferta/` (qty, JSON spec export, mailto).

## Editing

- Add a product → one tuple in `catalog_data.py::_RAW`, rebuild.
- Add UI text → add key to **all** `content/*.json` (validator enforces parity vs `bg.json`).
- New type → add to `TYPES` + pictogram `P` + `t_<type>` labels in every language.

## Notes

- `ro/el/sr/mk/al` copy is a careful working draft — have a native reviewer pass over before launch.
- Product data is realistic sample data with real brands/series tokens — replace with the official ERP/catalogue export before going live.
- Pictogram art is the interim design language; swap `.part` backgrounds for real photography when assets arrive.
