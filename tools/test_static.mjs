// Static data-integrity checks — no browser needed.
// node tools/test_static.mjs
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = join(dirname(fileURLToPath(import.meta.url)), "..");
global.window = {};
for (const f of ["data/catalog.js", "data/i18n.js", "data/brands.js"])
  eval(readFileSync(join(BASE, f), "utf8"));

const { products, facilities } = window.IC_DATA;
const I18N = window.IC_I18N, BRANDS = window.IC_BRANDS;
let fail = 0;
const bad = m => { console.error("FAIL:", m); fail++; };

// 1. images exist on disk
let missing = 0;
for (const p of products) for (const im of p.img) {
  if (!existsSync(join(BASE, im))) { if (missing++ < 5) bad(`img missing ${im} (${p.id})`); }
}
if (missing) bad(`${missing} missing product images total`);
for (const f of facilities) if (!existsSync(join(BASE, f.img))) bad(`facility img missing ${f.img}`);
console.log("images: OK (checked", products.length, "products,", facilities.length, "facilities)");

// 2. brands resolvable
const usedBrands = new Set(products.map(p => p.brand));
for (const b of usedBrands) if (!BRANDS[b]) bad(`brand '${b}' used by products but missing in IC_BRANDS`);
console.log("brands used:", [...usedBrands].join(", "));

// 3. facet vocab sanity
const cats = new Set(products.map(p => p.cat));
for (const c of cats) if (!["play", "park", "sport", "flooring"].includes(c)) bad(`unknown cat ${c}`);
const purps = new Set(products.map(p => p.purp));
console.log("cats:", [...cats].join(","), " (", purps.size, "purposes )");

// 4. i18n parity: every key in bg exists everywhere else
const bgKeys = Object.keys(I18N.t.bg);
for (const l of I18N.langs.map(x => x.id)) {
  const miss = bgKeys.filter(k => !(k in I18N.t[l]));
  if (miss.length) bad(`i18n[${l}] missing: ${miss.join(",")}`);
  // every purpose used must have a label
  for (const pp of purps) if (!I18N.t[l]["p_" + pp]) bad(`i18n[${l}] missing purpose label p_${pp}`);
  for (const c of cats) if (!I18N.t[l]["cat_" + c]) bad(`i18n[${l}] missing cat_${c}`);
  const mats = new Set(products.flatMap(p => p.mats));
  for (const m of mats) if (!I18N.t[l]["mat_" + m]) bad(`i18n[${l}] missing mat_${m}`);
}
console.log("i18n keys per lang:", bgKeys.length, "| langs:", I18N.langs.length);

// 5. shapes
for (const p of products) {
  if (!p.n || !p.id) bad(`empty name/id`);
  if (p.age && !(p.age[0] <= p.age[1])) bad(`bad age range ${p.id}`);
}
// 6. local brand logos exist
for (const slug of Object.keys(BRANDS)) {
  if (!existsSync(join(BASE, "img/brands", slug + ".png"))) bad(`brand logo missing: ${slug}.png`);
}

console.log(fail ? `\n${fail} FAILURES` : "\nALL STATIC CHECKS PASS");
process.exit(fail ? 1 : 0);
