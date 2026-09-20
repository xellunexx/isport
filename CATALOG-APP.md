# CATALOG-APP — the real-catalog interactive application

> **„ВИЖ всичко. ИЗБЕРИ за секунди."** built on the site's *real* data:
> **2,579 products with real photos and real specs**, crawled from the live sitemap.
> Default look is the **light "paper" theme** (dark available in the admin panel).

This app lives at **`infraconcept-live/index.html`** (canonical working copy since 2026-08-30; the
original remains frozen at `infraconcept2026/`). Fully self-contained — double-clicking the file
works (no server needed); `dist/` holds the separate multi-page SSG build (69 curated sample
products, per-language static pages). The two never cross-import.

## Concept implementation

- **Catalog = landing.** The grid of all 2,579 products is the first contentful view
  after a slim hero promise strip.
- **Filter deck (sticky)**: Раздел (4 divisions) → Предназначение → Материал → Възраст →
  Марка (brand deliberately last) + live search.
- **Brand = fresh start.** A deliberate brand click clears every other facet; then you narrow
  inside the brand. No dead ends still holds (all counts are live forward counts; zero-result
  options disable themselves).
- **Hover engine**: 0.7 s preview (dims + lens explaining the would-be filters), **3.0 s commit**
  (auto-tagged „авто" filter chips with source-product thumbnail in the ribbon). Hovering a product
  whose signature is already fully applied is a **no-op** (no lens, no churn — no reload loop).
  After any commit the engine latches until the pointer leaves the grid. Esc unwinds.
- **Nothing hides under UI**: sticky header+deck offsets are tracked (`--deckH`) and all
  scroll targets carry `scroll-margin-top`.
- **на живо**: header toggle opens an IRL strip above the grid — real photos from **delivered
  projects** (51 facilities), ranked by the active division; quick view shows a contextual strip.
  Honest mapping: project photos are per-division, not per-SKU (the source site has none).
- **За кого (target-grupi, improved)**: six audience cards → modal with the page's real copy &
  photos → one click applies the persona facet preset (e.g. Детски градини → Игра + възраст 0–7).
- **Направи си сам (composer)**: pick any products → auto-generated 2D site plan with footprints
  from parsed dimensions and safety padding derived from parsed safety zones; live stats
  (items / occupied m² / Σ safety zones / Σ users), mixed-age warning, re-shuffle, PNG export,
  "all into inquiry".
- **Admin panel** (⚙ header): light/dark/custom themes — background, panels, text and accent
  colors applied live via CSS variables; hover-dwell time; card density; hero particles on/off;
  persisted per device (localStorage). It restyles every chip, card, modal and the composer.
- **URL state** ``#/c?cat=…&purp=…&mat=…&brand=…&q=…&lang=…`` — shareable.

## Stack / files

Zero runtime JS dependencies, plain scripts (works from `file://`), hand-rolled CSS with
`data-theme` presets, self-hosted *Sofia Sans*. 7 languages (bg en ro el sr mk sq) — 188 keys each,
parity enforced by `tools/test_static.mjs`.

## Stack

Zero runtime JS dependencies, plain scripts (works from `file://`), hand-rolled CSS
(dark graphite + EPDM-amber material language, self-hosted *Sofia Sans* — Bulgarian-made
typeface covering Cyrillic/Greek/Latin). 7 languages: **bg en ro el sr mk sq**
(147 keys each, parity enforced by `tools/test_static.mjs`).

```
index.html               shell (hero / catalog deck / grid / sections / modals)
assets/css/main.css      design system
assets/js/store.js       state, facet matching with forward-counts, hash URLs
assets/js/facets.js      deck rendering, no-dead-end disabling, active ribbon
assets/js/grid.js        card render, batched append (72/page), sort, lazy alt-image
assets/js/hover.js       the smart-hover lens engine (preview -> commit -> unwind)
assets/js/overlay.js     quick view, inquiry tray (+qty, JSON export), brand modal
assets/js/app.js         i18n runtime, hero canvas granules, sections, shortcuts
data/catalog.js          2,579 products (~1 MB, JS global — no fetch, no CORS)
data/i18n.js             7-language copy deck
data/brands.js           brand reference + blurbs
img/p|fac|brands         5,300+ optimized WebP/PNG (crawled + resized ≤880 px)
tools/                   crawl → normalize → images → emit → tests
```

## Production hardening (2026-08-30, see `QA-REPORT.md`)

- **Origin**: hardened Node static server (`.server/server.js`: keep-alive, gzip, ETag/304,
  cache control, MIME incl. webp/woff2, traversal guard, 301 map from `webroot/redirects.json`).
  The Python one folded with 12% 502s under tunnel concurrency — the incident that made the
  site "completely inert" over WAN; **0×502 after the swap (140/140 burst)**.
- **SEO layer** (`tools/seo_build.py` → into webroot): static `/p/<id>/` products (2,579),
  `/series/<slug>/` (90), `/brand/<slug>/` (10), `/cat/<slug>/` (4), `/audience/<slug>/` (6),
  `/project/<i>/` (51), `/sitemap.xml`, `/robots.txt`, old-site 301s (2,774 mappings — incl.
  Cyrillic URL-encoded variants). Each static page deep-links into the app (`/#/p/<id>` → quick view).
- **One state**: `store.js` holds filters + auto + tray + plan + mode + rec + history; modules are
  consumers. Hover engine: 0.7 s preview → **3.0 s** commit (admin-tunable), latch, furthest-downstream
  no-op, resting-cursor REDISCOVERY after any re-render (the silent-miss class fix).
- **Brand click = reset** (deliberate only). Persona/TG presets = visible recommendation chips,
  user selection overrides them.
- **Режими**: Каталог \| На живо \| Моят проект (view modes, §14).

## Data pipeline (reproducible)

```powershell
..\..\.venv\Scripts\python.exe tools\crawl2.py            # sitemap-driven crawl (cache in crawl/raw)
..\..\.venv\Scripts\python.exe tools\normalize.py         # facet tagging
..\..\.venv\Scripts\python.exe tools\fetch_images.py      # photos + logos -> img/
..\..\.venv\Scripts\python.exe tools\crawl_facilities.py  # realized projects + galleries
..\..\.venv\Scripts\python.exe tools\crawl_targets.py     # target groups
..\..\.venv\Scripts\python.exe tools\build_data.py        # -> data/catalog.js
..\..\.venv\Scripts\python.exe tools\seo_build.py         # -> .server/webroot (SEO layer)
```

## Tests (all green)

```powershell
node tools\test_static.mjs            # data: images exist, brands resolvable, i18n parity x7
..\..\.venv\Scripts\python.exe tools\test_browser.py   # 33 DOM checks (filters, no-dead-ends, hover commit/Esc, tray, hash roundtrip, lang switch)
..\..\.venv\Scripts\python.exe tools\test_env.py       # file:// scheme, mobile touch long-press, reduced-motion
..\..\.venv\Scripts\python.exe tools\test_langs.py     # 7-lang render + perf smoke
```

## Editing

- **Product facet tag wrong** → adjust rules in `tools/normalize.py` (ordered regex
  tables `OVER`/`R`/`M`), rerun normalize + build_data.
- **UI text** → edit every language in `data/i18n.js` (test enforces parity).
- **New brand** → `data/brands.js` + `img/brands/<slug>.png`.

## Deploy / expose to WAN (current state: LIVE)

```powershell
tools\expose.ps1      # starts clean webroot + localhost:8043 static server + Cloudflare quick-tunnel; prints URL
tools\unexpose.ps1    # takes it all down
tools\test_wan.py     # playwright smoke test over the public URL
```

Chain: `https://<random>.trycloudflare.com` (Cloudflare edge, HTTPS) → `cloudflared` on the PC →
`http://127.0.0.1:8043` (localhost-only Python server) → `.server\webroot` (junctions to `assets/ data/ img/`
+ copied `index.html` — the crawl cache and tools are never exposed).
The quick-tunnel URL is ephemeral (it changes if the tunnel restarts). For a permanent address
(e.g. `catalog.infraconcept.bg`) use a *named* Cloudflare tunnel on their account, or drop the
webroot onto static hosting (Cloudflare Pages / Netlify / S3) — no server code is required anywhere.
Current public URL is kept in `.server\PUBLIC-URL.txt`.

## Not in scope (deliberately)

Speculative materials are not invented (unasserted products stay untagged); product
names remain in source language; inquiry uses mailto/clipboard/JSON — no backend.
