# AUDIT — infraconcept.bg (as crawled 2026-08-30)

What the current site actually contains, measured from its own sitemap + pages.
Everything below is reproducible: `tools/crawl2.py` (cache in `crawl/raw/`) → `crawl/catalog.raw.json`.

## Real inventory

| dimension | measured |
|---|---|
| Products in XML sitemap | **2,775** |
| Crawled OK | 2,767 (8 URLs are dead, HTTP 500) |
| With usable photo | **2,579** |
| Duplicate slugs across series pages | 186 (same product reachable from ≥2 series) |
| Product series | 105 |
| Realized projects (facilities) | 59 |
| Flo­oring "pavement" types | 7 |

Brands with products: **Proludic 1,036 · Vinci Play 1,281 · Fulco 412 · Polfisan 6 · 3DProgram 11 · Innoflex/own 21**.
Brands presented in marketing with **zero products online**: Hard Body Hang, Corkeen, Epoxy, GreenSet, ONE-DNA, Playnetic, Sawo, Finture StreetUnit.

## The funnel problem (why the brief exists)

Today the path is **Category → Manufacturer → Series → paginated product grid**.
Measured: the Fulco benches series alone is **23 paginated pages** (≈270 SKUs, 12 per page).
A buyer looking for "a wooden bench" cannot express it *anywhere*: no material, no age,
no purpose filter exists. The only axes are category and manufacturer — and the menu
forces manufacturer first. From landing to a specific product routinely takes
**4–6 clicks plus pagination scavenging**.

## Data-quality findings (fixable, but telling)

- The same products are filed under the wrong division: e.g. 99 *Комбинирано детско
  съоръжение* (play structures) appear under **Спорт/Парк** breadcrumbs; WOOF dog-agility
  equipment sits under **Игра** instead of Парк. (Our rebuild re-files them correctly —
  see `tools/normalize.py` overrides.)
- 8 product URLs return HTTP 500 (broken templates) — silently dead catalog entries.
- No spec fields are rendered as facets anywhere; specs exist (2 080 products carry age
  group, 2 063 fall height, 1 942 user count) but are buried as body text.
- Header/footer chrome is duplicated in every page payload; hero banners weigh ~200–500 KB each.

## What the rebuild keeps vs. changes

Keeps: full real catalog, photos, specs, facilities, contacts, brand roster.
Changes: information architecture (catalog-first), faceted engine with per-option live
counts (dead ends structurally impossible), hover-based "similar" auto-filtering,
7-language UI shell, inquiry cart with JSON export.

## Honest limitations of the rebuild data

- **Materials, purposes, ages** are auto-classified tags derived from titles/series/specs
  (`tools/normalize.py`, ~53% of products carry an asserted material; the rest are
  intentionally untagged rather than guessed). The taxonomy lives in one editable rule
  table — a merchandiser pass should confirm/correct tags before launch.
- Product **names stay in source language** (they are model designations). The UI,
  facets and chrome are fully translated; long-form product copy was thin/absent on the
  source site and is not translated per-product.
- Datasheet PDFs link back to the original domain (not mirrored).
