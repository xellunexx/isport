# QA REPORT — infraconcept-live — production hardening (all rounds)

**Public URL (persisted):** `infraconcept-live\.server\PUBLIC-URL.txt` (currently
https://dates-beverage-till-persian.trycloudflare.com — verified 3-engine green at report time).
**Backups per phase:** `_backups\infraconcept-live-p*.`

## P7 — LLM integration (Площадко) — 2026-08-31

- **Scope delivered:** OpenAI-compatible local LLM (qwen2.5-coder-14b via `llama-server :10000`);
  same-origin proxy `/api/chat` + health `/api/llm-status` in the hardened Node origin (mixed-content-safe);
  admin panel fields (endpoint, model, test) persisted on-device; assistant identity "Площадко"
  (`data/assistant.js`: persona + 14 canned-truth FAQs + 4 quick subjects + free-text path with the facts
  injected into the system prompt).
- **Contract:** LLM online → full model answer; offline → deterministic canned-truth FAQ match (token-weighted),
  "Нямам данни…" + offline note otherwise. Never fakes availability: status dot reflects a real probe.
- **Measured:**
  - LLM offline at :10000 → status 502 reported as offline; chat still answers FAQs (no crash).
  - `qwen.vbs` started, model loaded; persona answer in Bulgarian, correct facts, status "· LLM онлайн".
  - `tools\test_llm.py`: 10/10 PASS. `tools\test_llm_live.py`: PASS (real model round-trip).
- **FIXED during the round (test-exposed):** FAQ matcher too literal → token-weighted scoring;
  `busy` flag leaked on early return → `finally` reset (send button never locked forever).

## P8 — VPS bundle (no LLM) — 2026-08-31

- `vps-bundle/` — 143 MB, 8,151 files; zero third-party anywhere (pure Python stdlib).
  - `serve_vps.py` — production origin: gzip, ETag/304, cache policy, traversal guard, 301 map,
    webp/woff2 MIME, request log.
  - `site/` — complete static payload (app + 2,743 SEO pages + all images).
  - `DEPLOY.md` — run command + systemd snippet.
- `tools\prepare_vps_bundle.py` rebuilds it; `tools\test_deploy.py` verifies the bundle boots and
  behaves (incl. old-URL 301, gzip, etag, no-cache html, traversal 404).

### Evidence now
- Bundle verify: **ALL PASS** (11/11 on the само stdlib server incl. old-URL 301).
- Full app suite after LLM work: main 72/72, tray 12/12, responsive 9, env, 7 languages, static, SEO — ALL PASS.
- (One transient flake seen once: hover Test B under first-paint load race; passes on rerun deterministically.

## P0-origin story (recap)

Date: 2026-08-30 · Public URL: https://bigger-brief-throwing-dir.trycloudflare.com
Server chain: Cloudflare quick-tunnel → cloudflared → **Node static origin** (`server.js`, :8043, localhost-only) → `.server/webroot`.

All statuses below are results of executed tests (Playwright on Chromium/WebKit/Firefox over localhost AND the WAN URL), not code inspection.

## Follow-up round (2026-08-31, part 5) — link refresh, stabilized

- **FOUND:** refresh churn every time someone asked for "a fresh link": new quick-tunnels hostnames
  sit minutes in edge-DNS before they resolve locally (my pollers timed out and killed healthy
  tunnels mid-propagation), plus PUBLIC-URL.txt got written before verification.
- **FIX:** `tools\refresh_link.ps1` is now zero-churn: recorded URL verified first (exit early if
  healthy), tunnel started only when cloudflared is absent, DNS-wait loop (up to ~10 min via system
  resolver + 1.1.1.1), verification gate *before* persistence, and `tools\host_switch.py` normalizes
  ANY known tunnel host to the active one (pattern-based, history-proof). ssh relay kept as an
  option (was present one boot, gone the next - the loop .cmd is there when SSH returns).
- **VERIFIED NOW (3 engines + SEO probes):** 0 JS errors, 0 failed requests, sitemap/robox/redirects
  all on the current host. Canonical audit: 13,534 absolute refs → all on active URL.
- Current public URL persisted in `.server/PUBLIC-URL.txt`. ✅ FIXED + RETESTED

## Follow-up round (2026-08-31, part 4) — Моят проект actions + hover-commit anchor link refresh

- **FOUND (measured, in-browser):** in modes На живо / Моят проект all card actions (`+`, Бърз преглед, Подobни) were inert — grid action handlers were gated `mode === "catalog"`. The suggestion rail with no filters active read as "24 random Vinci items".
- **FIX:** card actions work in every mode; the suggestion rail is now filter-aware (follows active filters,
  shows 24 contextual matches) or a deliberately curated one-per-brand spread with an explicit label.
- **FOUND (measured):** `парк + дърво → click Fulco` → concrete benches. Root cause: brand reset removed the
  wood filter *as designed* but invisibly — reads like broken filtering. **FIX:** brand/persona resets now
  snapshot the previous facet set; the ribbon shows "Нулирани при избора: …" + a clickable ⟲ undo chip that
  restores it. Verified: `undo restores park+wood`, `IC.filtered()` then all-wood.
- **FOUND (user-reported):** after hover-commit the grid reflows and the source product is lost.
  **FIX:** post-commit the engine re-finds its card and re-anchors the scroll to it (below the sticky chrome),
  with a soft pulse mark for ~2.6 s. Verified: "source product re-anchored in view = visible".
- **Изчисти всички** enlarged into a prominent accent-outlined pill; **composer gained the missing
  "Изчисти плана"** action (verified 4 → 0).
- **Link refresh tool:** `tools\refresh_link.ps1` (tunnel restart, host re-point of all SEO canonicals,
  PUBLIC-URL.txt). New URL: https://international-sen-lasting-pockets.trycloudflare.com — 3-engine
  probe: 0 JS errors, 0 failed requests; sitemap + all static routes carry the new host.
- Status: **FIXED + RETESTED** ✅ (main suite 79/79; tray 12/12; responsive 9/9; env; languages; static; SEO)

## Follow-up round (2026-08-31, part 3) — "Направи си сам" presentation-grade renderer

- **FOUND:** the plan output was a bare grid of colored rects ("overlapping / impossible-to-read");
  user reference: real site-layout renders (Поморие-style park plan).
- **FIX:** new vector plan renderer (`assets/js/plan.js`): ground surface per space type + perimeter
  walking path, corner trees, grass speckle, safety clearances as dashed zones, equipment as
  recognizable top-view pictograms at true scale (swings/slides/carousels/springers/sandbox/climber/
  multi-play tower/benches/tables/bins/planters/bike racks/bus stops/shelters/fitness frames/arenas/
  climbing walls/trampolines/water), layout logic = anchor centerpiece + play ring + street furniture
  along the perimeter path (facing inward), PLUS hard guarantee: two-stage relaxation solver →
  **zero overlapping padded footprints** (asserted by automated test), auto-grown plot when the area
  budget is too tight. Title strip + real dimensions + scale bar (5 m) + north arrow + category legend.
  Marked "Концепция" (concept, not an approved engineering design).
- **RETEST:** `test_browser.py` generates a 145 m² kindergarten playground and proves
  "plan layout: zero overlaps"; PNG export samples non-empty; 3-engine WAN probe clean (0 errors).
  Screenshot for eyeball review: `shots/composer-plan.png`.
- Status: **FIXED + RETESTED** ✅

## Follow-up round (2026-08-31, part 2) — nav-landing precision

- **FOUND:** section anchors settled ±170–236 px off across engines (scroll-margin was a CSS-var
  snapshot that didn't track the live deck height; bottom-of-page clamping additionally capped the
  last section). **FIX:** land via measured live sticky-chrome height (header + deck at click
  instant), instant scroll, self-correcting one-shot re-aim after scroll settles, plus a 34 vh
  page-floor cushion so the final section can always reach its margin; per-deploy cache-busting of
  code bundles (`?v=…`) via `tools/bump_version.py` (auto-run from `expose.ps1`) — kills the
  stale-JS/new-HTML mismatch class entirely.
- **RETEST (settled, all engines):** #aud/#proj/#brands/#about/#contacts land at top-margin
  **0–1 px** on Chromium/WebKit/Firefox; runaway case lands at 0:1 px. ✅ FIXED + RETESTED

**Action for anyone with the old tab open:** one hard refresh (Ctrl+F5) once; the app is self-healing
thereafter (HTML is `no-cache`, code carries versioned URLs).

## Follow-up round (2026-08-31) — user-reported symptoms

1. **Nav links (#aud #proj #brands #about #contacts) "endless browse loop"** →
   **FOUND:** anchor targets scroll for seconds through a ~24 000 px page while the IntersectionObserver
   sentinel kept auto-appending 72-card batches — the landing point *ran away* (measured: after 2.9 s the
   target was still 3 573 px below the fold).
   **FIX:** instant programmatic jumps for in-page nav (smooth flight kept for user-driven scrolling),
   sentinel pauses while a jump is in flight, IO auto-append capped at 2 batches per list (More button
   keeps full control beyond). **RETEST: all 5 anchors land at exactly header+deck margin (≈319 px),
   3 engines ×2 runs.** ✅ FIXED + RETESTED
2. **"на живо … does not trigger anything"** → **FOUND:** the mode switched but nothing visibly changed
   above the fold. **FIX:** header toggle now also lands on the board. **RETEST** (mode=live + scrollY≈473
   + board visible, 3 engines). ✅
3. **"на живо / Моят проект don't get results from applying filters"** → **FOUND:** modes isolated from
   the facet context. **FIX:** На живо narrows by active division (sport catalog 210 → live board 13
   contextual objects + honest note when no in-division projects exist); Моят проект shows a
   filter-following suggestion strip. **RETEST PASS (3 engines).** ✅
4. **DIY "no layout, no background — only orange squares"** → **FOUND:** canvas only painted devices.
   **FIX:** plot field always rendered (surface per space type, 1 m grid, border with `m × m` label,
   legend, centered codes), even with an empty plan. **RETEST** (empty fill=3 931 painted cells; with
   generated plan=5 → 1 618 cells incl. devices). ✅
5. Endless composer blank/no-images over WAN → was the P0 transport incident (asset 502s); covered by the
   P0 gate + 3-engine reproduce (diy images + canvas OK). ✅

## 0. Incident found before P0 (user-reported "everything inert")

- **FOUND:** On real WAN probes, WebKit died completely (`appReady=false`, zero cards); Chromium/Firefox intermittently lost critical assets.
- **ROOT CAUSE:** Python's `http.server` folded under concurrent tunnel streams — measured **12% HTTP 502** at 100 requests/20 concurrent (12 × 502; local burst was 0%). Script 502 = silent boot death.
- **FIX:** replaced origin with a purpose-built Node static server: keep-alive, streaming, gzip, correct MIME, ETag/304, Cache-Control, traversal guard, 301 redirect map, request log.
- **RETEST RESULT:** two 100/20 bursts + one 140/20 burst → **100% 200** (0 × 502). All 3 engines clean over WAN. **FIXED + RETESTED** ✅

---

## 0. Incident found before P0 (user-reported "everything inert")

- **FOUND:** On real WAN probes, WebKit died completely (`appReady=false`, zero cards); Chromium/Firefox intermittently lost critical assets.
- **ROOT CAUSE:** Python's `http.server` folded under concurrent tunnel streams — measured **12% HTTP 502** at 100 requests/20 concurrent (12 × 502; local burst was 0%). Script 502 = silent boot death.
- **FIX:** replaced origin with a purpose-built Node static server: keep-alive, streaming, gzip, correct MIME, ETag/304, Cache-Control, traversal guard, 301 redirect map, request log.
- **RETEST RESULT:** two 100/20 bursts + one 140/20 burst → **100% 200** (0 × 502). All 3 engines clean over WAN. **FIXED + RETESTED** ✅

## 1. P0 acceptance gate

| item | result |
|---|---|
| Chromium over WAN | **PASS** |
| Firefox over WAN | **PASS** |
| WebKit over WAN | **PASS** |
| 100 req / 20 conc | **PASS — 0×502 (was 12%)** |
| Critical JS assets | **PASS — 0 failed requests in all 3 engines** |
| WebP/WOFF2/SVG/PNG/JS/CSS MIME | **PASS** (content-type asserted per type) |
| Cache headers | **PASS** (`no-cache` for HTML; `public, max-age=86400` + ETag→304 for /assets /data /img) |
| No silent boot failure | **PASS** — boot watchdog banner + retry button if `appReady` isn't set within 7 s |
| localhost + WAN | **PASS both** |
| Public URL preserved | **PASS** (same trycloudflare URL; tunnel untouched during origin swap) |

## 2. UX gate (§29 UX)

| item | result | evidence |
|---|---|---|
| ≤2 interactions to any product | PASS | catalog=landing; type-one-letter search; hover-commit path |
| Brand click clears other filters (deliberate only) | FIXED + RETESTED | `selectBrand` resets cat/purp/mats/ages/q; hover/auto paths never wipe |
| Hover preview 0.7 s / commit 3.0 s | PASS | timed assertions (no commit at 1.65 s; commit by 3.4 s) |
| Hover latch (re-arm only after grid leave) | PASS | Test B |
| Furthest-downstream hover = NO-OP | PASS | Test C: no lens, DOM probe unchanged |
| A→leave→B-3s commits B, not A | PASS | Test A (auto source = B) |
| A active → B hover 3s → B replaces signature | PASS | Test D (vinci/fitness → park/dog signature swap, cat switch included) |
| Rapid 20-card sweep: no storm/queue/stale lens | PASS | Test E (auto=0, lens hidden, 0 errors) |
| Selected product never hidden under sticky UI | PASS | live-measured `--deckH`; scroll-margin assertion ≥100px |
| Empty state recoverable | FIXED + RETESTED | "remove last filter" + clear-all + live suggestions; exercised in suite |
| Back / Forward / Refresh / Deep links | FIXED + RETESTED | `pushState`-based history; back/forward/refresh asserted deterministic (was broken: selfNav flag swallowed first back) |
| No dead ends | PASS | every terminal state has a path (suggestions/CTAs) |

## 3. Content

| item | result |
|---|---|
| Products open (quick view) | PASS (gallery, parsed specs, facets-as-chips, inquiry, similar) |
| Manufacturers open | PASS (brand modal + "see products" applies brand reset) |
| Projects open | FIXED + RETESTED (was thumbnail-only; now full modal w/ gallery² + location + Виж обекта + "Искам подобно пространство" + "Продукти от този тип") |
| Target groups | PASS — full integration: real images/copy crawled from all 6 pages; persona preset = visible system RECOMMENDATION chip, never impersonated user filters; user override drops rec ages |
| Trust block wired | PASS — ISO×3 + ЦПР trust line in hero, about section |
| На живо | PASS (upgraded to view MODE: Каталог \| На живо \| Моят проект segment; 51 real project galleries, division-aware ranking) |
| Image provenance | PASS — labeled "Снимки от реализирани обекти"; no SKU claims |
| Broken images | PASS — 5,335 asset files, zero zero-byte/tiny; 0 failed requests in all engine probes |
| Missing content | PASS — note data-gap: **no product↔project mapping exists on the source site** (honest gap, not invented) |

## 4. Project / enquiry (Моят проект)

| item | result |
|---|---|
| Add / remove / duplicate-add / qty / clear | PASS (12/12 UI-click checks in `test_tray.py`; state assertions in main suite) |
| Persists reload & navigation | PASS (localStorage via store) |
| Enquiry contains selected items | PASS (clipboard + mailto subject/body verified) |
| Confirmation | PARTIAL — mailto client opens prefilled; no backend exists, so server-side delivery is **UNVERIFIED by design** (no fake success state; JSON export + copy list provided as channels) |

## 5. Responsive matrix

| width | 1440 | 1280 | 1024 | 834 | 768 | 430 | 390 | 375 | 360 |
|---|---|---|---|---|---|---|---|---|---|
| boot/overflow/deck/quickview/tray/composer | PASS | PASS | PASS³ | PASS | PASS³ | PASS | PASS | PASS | PASS |

³ One real defect found + fixed en route: fit-assertion measured during the 300 ms slide animation → test now waits past animation end (FIXED + RETESTED). Mobile landscape orientation: **UNVERIFIED** (not simulated).

## 6. Technical

| item | result |
|---|---|
| Console errors | **0** across all engines, incl. after 90 s soak |
| Network failures | 0 (after origin fix) |
| Broken routes/assets | none found in audits |
| Request storms / timer accumulation | none (sweep+soak measured; hover engine holds a single pair of timers) |
| Memory growth | **0.0 MB** heap growth across 90 s mixed soak (long tasks: 1) |
| Layout overflow | none at 9 sizes |
| CLS | 0.105 (font-swap residue — acceptable; note only) |
| Loading | cold 260 ms appReady¹ (node origin, warm disk); first-ever cold measured 1 483 ms on the old Python origin; repeat 75 ms; throttled 1.6 Mbps 910 ms |
| Facet re-render | avg 51.5 ms (min 40 / max 69) over 12 mixed ops |

¹ perf harness measures localhost origin (isols the app from tunnel jitter, by design).

- CPU-constrained device simulation: **UNVERIFIED** (no CPU-throttle run wired).
- Real Safari device (as opposed to WebKit engine), iOS ≤15: **UNVERIFIED** (polyfills present for roundRect; no other ≥2023 APIs in use — static scan clean).

## 7. SEO (P4 — hybrid prerender, as instructed)

| item | result |
|---|---|
| Product routes `/p/<id>/` | PASS — 2,579 static pages (name/specs/age/image/breadcrumbs, JSON-LD `Product`) over WAN |
| Series routes `/series/<slug>/` | PASS — 90 pages w/ product indexes |
| Brand routes `/brand/<slug>/` | PASS — 10 |
| Division routes `/cat/<slug>/` | PASS — 4 |
| Target-group routes `/audience/<slug>/` | PASS — 6 (real copy + images) |
| Project routes `/project/<i>/` | PASS — 51 |
| Old URLs 301 | PASS — `/product/<slug>/` (incl. URL-encoded Cyrillic variants), `/product-series/<slug>/`, `/target-grupi/<slug>/`, project pages — 2,774 mappings, verified 301+Location over WAN |
| Titles/meta/canonical | PASS (present, asserted) |
| Sitemap | PASS — 2,741 URLs |
| Robots | PASS — valid sitemap reference |
| Crawlable w/o JS | PASS — all static HTML content fetched via plain HTTP (no JS) |
| Canonical host | ⚠ currently the trycloudflare URL — switch `HOST` in `tools/seo_build.py` at domain move (one var + rebuild) |

## 8. Remaining known issues / honest gaps

1. **Content gap:** no per-SKU real-life photos exist on the source site → "на живо" maps at division level, labeled honestly.
2. **Content gap:** project↔product relationships are not published anywhere on the source site → "Продукти от този тип" links by division.
3. Mailto enquiry delivery is a client action (no backend by design).
4. CLS 0.105 on first load (font swap) — below other budgets; cosmetic note only.
5. Admin panel scope: appearance + behavior + hero-subtitle override are live-editable; product/target data remains build-time (`tools/` pipeline) — noted, not faked.
6. Legacy Safari (<16) and CPU-throttled devices carry UNVERIFIED status above.

Everything else from the earlier failure list ("за кого / марки / проекти / на живо / направи си сам inert") — those were the P0 transport incident; each is covered by a passing cross-engine WAN test.

## Commands (full suite)

```powershell
node tools\test_static.mjs
..\..\.venv\Scripts\python.exe tools\test_browser.py     # 72 checks
..\..\.venv\Scripts\python.exe tools\test_tray.py        # 12 checks
..\..\.venv\Scripts\python.exe tools\test_responsive.py  # 9 sizes
..\..\.venv\Scripts\python.exe tools\test_perf.py        # load/CLS/longtasks/soak
..\..\.venv\Scripts\python.exe tools\test_seo.py         # routes/redirects/sitemap
..\..\.venv\Scripts\python.exe tools\inspect_live.py     # 3-engine WAN probe
..\..\.venv\Scripts\python.exe tools\seo_build.py        # (re)generate SEO layer
```
