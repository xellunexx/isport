/* ═══════════════════════════════════════════════════════════════════
   sports-scene3d.js — WebGL renderer for the sports configurator scene engine.
   ES module: imports three (importmap) + OrbitControls from ./vendor (same
   vendored r186 setup as spatial3d.js). ALL geometry comes from
   buildSceneModel() (sports-scene-model.js) fed by sports-scene-specs.js —
   this file contains zero per-sport hardcoding.

   Exposed as window.SportsScene3D:
     mount(el, config, opts) → handle | null   (null when WebGL unavailable —
                                          caller falls back to the SVG plan)
       opts.onPinDrop(id, H, V, q, rotY, elev, tiltX, tiltZ) — fired when the user drag-drops an
                                          equipment unit: pointer-drag on a
                                          unit's plate/box/halo moves it along
                                          the ground plane (orbit locked during
                                          the drag); on drop the callback gets
                                          the PIN coordinates (metres from the
                                          field min corner, H along length,
                                          V along width) and the unit's qty
                                          index q. Clicks without movement are
                                          ignored (auto layout untouched).
     handle.update(config)               rebuild from same config family,
                                          camera untouched
     handle.setView('perspective'|'top')
     handle.fit()
     handle.toggleDims()                 outer L×W dimension overlay on/off
     handle.setFullscreen(bool)          mount element position:fixed inset:0,
                                          Esc exits
     handle.destroy()

   Textures (turf stripes, tartan/clay speckle to CanvasTexture, chain-link
   alpha) are generated deterministically (seeded PRNG) from the surface
   descriptor the model emits — no image assets, no randomness at runtime.
   ═══════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { OrbitControls } from './vendor/jsm/controls/OrbitControls.js';
import { SCENE_SPECS } from './sports-scene-specs.js';
import { buildSceneModel } from './sports-scene-model.js';

const FADE_MS = 380;
const ANIMATED = [];

/* i18n: reuse the global t() when present (works in every language), else EN */
const FALLBACK = {
  perspective: 'Perspective', top: 'Top / Plan', fit: 'Fit',
  dims: 'Dims', night: 'Night', surround: 'Surroundings', surroundField: 'Open field',
  surroundVillage: 'Village', surroundSuburb: 'Suburb', surroundCity: 'City',
  fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen',
  rotate: 'Rotate', tilt: 'Tilt', raise: 'Raise', lower: 'Lower',
  reset: 'Reset', grid: 'Grid', sideTilt: 'Side tilt',
  hint: 'Drag body to move · handles: red X / blue Z / green height / orange tilt / ring rotate · Alt = free',
  gridSnap: 'Grid 0.25 m', rotSnap: '15°', equipment: 'Equipment', deselect: 'Deselect',
  x: 'X', z: 'Z', elev: 'Alt', rot: 'Rot', tiltZ: 'TiltZ', propHint: 'Click a ball to kick it'
};
function tr(k) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const v = window.t('sports.scene.view.' + k);
      if (v && v !== 'sports.scene.view.' + k) return v;
    }
  } catch (_) { /* fall through to English */ }
  return FALLBACK[k] || k;
}

/* deterministic PRNG for texture speckle (same seed → same texture) */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── texture factory (memoised per key) ────────────────────────────── */
const TEX_CACHE = new Map();
const MAT_CACHE = new Map();
const PALETTE_CACHE = new Map();
const PHOTO_CARD_CACHE = new Map();
const RIG_GEO_CACHE = new Map();
const DEFAULT_ACCENTS = ['#d3542c', '#2563eb', '#16a34a', '#d97706'];

function standardMaterial(color, preset = 'default', options = {}) {
  const hex = new THREE.Color(color || '#888888').getHexString();
  const cacheable = !options.map && !options.alphaMap && !options.transparent &&
    !options.emissive && options.opacity == null;
  const key = hex + '|' + preset;
  if (cacheable && MAT_CACHE.has(key)) return MAT_CACHE.get(key);
  const presets = {
    default: { roughness: 0.65, metalness: 0.05 },
    steel: { roughness: 0.35, metalness: 0.6 },
    plastic: { roughness: 0.45, metalness: 0 },
    wood: { roughness: 0.8, metalness: 0 }
  };
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color || '#888888'),
    ...(presets[preset] || presets.default),
    ...options
  });
  if (cacheable) MAT_CACHE.set(key, mat);
  return mat;
}

function extractPalette(url, cb) {
  if (!url) return cb(null);
  const cached = PALETTE_CACHE.get(url);
  if (cached && cached.value) return cb(cached.value);
  if (cached) return cached.cbs.push(cb);
  const rec = { cbs: [cb], value: null };
  PALETTE_CACHE.set(url, rec);
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 48;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, 48, 48);
    const bins = new Array(24).fill(0);
    const data = ctx.getImageData(0, 0, 48, 48).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const c = new THREE.Color(`rgb(${data[i]},${data[i + 1]},${data[i + 2]})`);
      const hsl = {}; c.getHSL(hsl);
      if (hsl.s < 0.25 || hsl.l < 0.15 || hsl.l > 0.9) continue;
      bins[Math.min(23, Math.floor(hsl.h * 24))]++;
    }
    const top = bins.map((count, i) => ({ count, i })).sort((a, b) => b.count - a.count || a.i - b.i).slice(0, 2);
    const value = top.map(({ i }) => new THREE.Color().setHSL((i + 0.5) / 24, 0.8, 0.4));
    rec.value = value.length ? value : DEFAULT_ACCENTS.slice(0, 2).map((c) => new THREE.Color(c));
    rec.cbs.splice(0).forEach((fn) => fn(rec.value));
  };
  img.onerror = () => {
    rec.value = DEFAULT_ACCENTS.slice(0, 2).map((c) => new THREE.Color(c));
    rec.cbs.splice(0).forEach((fn) => fn(rec.value));
  };
  img.src = url;
}

function photoCardTexture(tex) {
  const key = tex.uuid;
  if (PHOTO_CARD_CACHE.has(key)) return PHOTO_CARD_CACHE.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.roundRect(18, 20, 220, 220, 18); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.roundRect(12, 12, 220, 220, 18); g.fill();
  const img = tex.image;
  if (img) {
    const scale = Math.min(196 / img.width, 196 / img.height);
    const w = img.width * scale, h = img.height * scale;
    g.drawImage(img, 30 + (184 - w) / 2, 30 + (184 - h) / 2, w, h);
  }
  const out = new THREE.CanvasTexture(cv);
  out.colorSpace = THREE.SRGBColorSpace;
  PHOTO_CARD_CACHE.set(key, out);
  CACHED_TEX.add(out);
  return out;
}

/* ── equipment photo textures (memoised per URL, async) ────────────── */
const PHOTO_TEX = new Map();   // url -> {tex}|{err:true}|pending record
let _texLoader = null;
let _maxAniso = 4;             // bumped to renderer max on mount (sprites ask for max)
/* load photo for url; cb(tex, isErr) — called synchronously from cache when possible */
function loadPhotoTexture(url, cb) {
  const rec = PHOTO_TEX.get(url);
  if (rec) {
    if (rec.tex) return cb(rec.tex, false);
    if (rec.err) return cb(null, true);
    rec.cbs.push(cb);
    return;
  }
  const r = { tex: null, err: false, cbs: [cb] };
  PHOTO_TEX.set(url, r);
  if (!_texLoader) _texLoader = new THREE.TextureLoader();
  const done = (fn) => { const cbs = r.cbs; r.cbs = []; cbs.forEach(fn); };
  _texLoader.load(url,
    (tex) => {
      r.tex = tex;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = _maxAniso;
      CACHED_TEX.add(tex);
      done((f) => f(tex, false));
    },
    undefined,
    () => { r.err = true; done((f) => f(null, true)); });
}

/* default perspective camera azimuth (doFit perspective position) — billboards
   orient to face it at build time; static, never per-frame */
const BBOARD_YAW = Math.atan2(0.78, -0.92);

function surfaceTexture(desc, L, W) {
  if (!desc || !desc.spec || !desc.variant) return null;
  const { spec, variant } = desc;
  const key = desc.kind + '|' + variant.key + '|' + Math.round(L) + 'x' + Math.round(W);
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const rnd = mulberry32(1337);
  g.fillStyle = variant.base || '#3f9c55';
  g.fillRect(0, 0, S, S);
  if (desc.kind === 'turf' && spec.stripePitch > 0) {
    /* soft mowing bands: a two-band tile repeats every 6 m. */
    const bands = 2;
    g.fillStyle = variant.alt || variant.base;
    g.globalAlpha = 0.42;
    g.fillRect(0, 0, S / bands, S);
    g.globalAlpha = 1;
  }
  if (variant.speckle || desc.kind === 'tartan' || desc.kind === 'clay') {
    /* fine fleck noise: darker + lighter grains */
    const n = desc.kind === 'tartan' || desc.kind === 'clay' ? 1400 : 700;
    for (let i = 0; i < n; i++) {
      const x = rnd() * S, y = rnd() * S, sz = 1 + rnd() * 2.2;
      g.globalAlpha = 0.05 + rnd() * 0.12;
      g.fillStyle = rnd() < 0.5 ? '#000000' : '#ffffff';
      g.fillRect(x, y, sz, sz);
    }
    g.globalAlpha = 1;
  }
  if (desc.kind === 'lawn') {
    const patches = variant.patches || ['#6fae55', '#559143'];
    for (let i = 0; i < 180; i++) {
      g.globalAlpha = 0.16 + rnd() * 0.18;
      g.fillStyle = patches[i % patches.length];
      const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 10;
      g.beginPath(); g.ellipse(x, y, r * 1.8, r, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  if (desc.kind === 'paving') {
    const joint = variant.joint || '#68737e';
    g.strokeStyle = joint;
    g.lineWidth = 2;
    const slab = Math.max(4, Math.round(S * 0.6 / 6));
    const base = new THREE.Color(variant.base || '#9aa3ad');
    for (let x = 0; x < S; x += slab) for (let y = 0; y < S; y += slab) {
      const jitter = (rnd() - 0.5) * 0.08;
      const tile = base.clone();
      tile.offsetHSL(0, 0, jitter);
      g.fillStyle = '#' + tile.getHexString();
      g.fillRect(x + 1, y + 1, slab - 2, slab - 2);
    }
    for (let x = 0; x <= S; x += slab) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
    for (let y = 0; y <= S; y += slab) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (desc.kind === 'turf' && spec.stripePitch > 0) tex.repeat.set(Math.max(1, L / 6), 1);
  else tex.repeat.set(Math.max(1, L / 6), Math.max(1, W / 6));
  TEX_CACHE.set(key, tex);
  CACHED_TEX.add(tex);
  return tex;
}

function siteGroundTexture() {
  const key = 'site-ground|grass';
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const rnd = mulberry32(4801);
  g.fillStyle = '#5f8f3f';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const v = 0.94 + rnd() * 0.12;
    const c = new THREE.Color('#5f8f3f').multiplyScalar(v);
    g.fillStyle = `#${c.getHexString()}`;
    const x = rnd() * S, y = rnd() * S, r = 1 + rnd() * 2;
    g.fillRect(x, y, r, r);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(200, 200);
  tex.colorSpace = THREE.SRGBColorSpace;
  TEX_CACHE.set(key, tex); CACHED_TEX.add(tex);
  return tex;
}

function apronTexture() {
  const key = 'site-ground|apron';
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#c9c6bd'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(92,96,98,.18)'; g.lineWidth = 1;
  for (let x = 0; x <= S; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
  for (let y = 0; y <= S; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  TEX_CACHE.set(key, tex); CACHED_TEX.add(tex);
  return tex;
}

function waterTexture() {
  const key = 'water';
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#5aa9d6'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(220,245,255,0.55)'; g.lineWidth = 2;
  for (let y = 10; y < S; y += 22) {
    g.beginPath();
    for (let x = -8; x <= S + 8; x += 8) g.lineTo(x, y + Math.sin(x * 0.14) * 3);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  TEX_CACHE.set(key, tex); CACHED_TEX.add(tex);
  return tex;
}

/* alpha grid: diagonal = chain-link fence, orthogonal = sport net */
function gridTexture(kind) {
  const key = 'grid|' + kind;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const S = kind === 'diag' ? 256 : 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  /* alphaMap samples the green channel, so paint opaque grey levels (a
     translucent fill would unpremultiply back to white = solid wall) */
  g.fillStyle = kind === 'diag' ? '#0a0a0a' : '#000000';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#ffffff';
  g.lineWidth = kind === 'diag' ? 2.4 : 3;
  if (kind === 'diag') {
    const cell = S / 20;
    g.beginPath();
    for (let i = -S; i <= S * 2; i += cell) { g.moveTo(i, 0); g.lineTo(i + S, S); }
    for (let i = 0; i <= S * 3; i += cell) { g.moveTo(i, 0); g.lineTo(i - S, S); }
    g.stroke();
  } else {
    g.beginPath();
    for (let i = 0; i <= S; i += 16) { g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = _maxAniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  TEX_CACHE.set(key, tex);
  CACHED_TEX.add(tex);
  return tex;
}

function nightPoolTexture() {
  const key = 'night|pool';
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.32)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  TEX_CACHE.set(key, tex); CACHED_TEX.add(tex);
  return tex;
}

function surroundRoadTexture() {
  const key = 'surround|road';
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#3e454a'; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,.82)';
  for (let x = 8; x < S; x += 42) g.fillRect(x, S * .47, 24, 5);
  const rnd = mulberry32(6911);
  for (let i = 0; i < 500; i++) {
    const v = 0.8 + rnd() * 0.2;
    g.fillStyle = `rgba(220,225,228,${0.02 + v * 0.03})`;
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  TEX_CACHE.set(key, tex); CACHED_TEX.add(tex);
  return tex;
}

function surroundWindowTexture(kind = 'suburb') {
  const key = 'surround|windows|' + kind;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = kind === 'city' ? '#737a80' : '#8d8175'; g.fillRect(0, 0, S, S);
  const rnd = mulberry32(9217);
  const rows = kind === 'city' ? 6 : 2;
  const cols = kind === 'city' ? 5 : 4;
  const cellW = S / cols, cellH = S / rows;
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = col * cellW + cellW * 0.18, y = row * cellH + cellH * 0.16;
    const ww = cellW * 0.58, wh = cellH * 0.5;
    g.fillStyle = rnd() < 0.55 ? '#ffd9a0' : '#27303a';
    g.fillRect(x, y, ww, wh);
    g.fillStyle = 'rgba(15,23,42,.55)';
    g.fillRect(x + ww + cellW * 0.08, y, Math.max(2, cellW * 0.05), wh);
    if (kind !== 'city' && row === rows - 1 && col === 0) {
      g.fillStyle = '#4d3b32';
      g.fillRect(x + ww * 0.28, y + wh * 0.12, ww * 0.44, wh * 0.88);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  TEX_CACHE.set(key, tex); CACHED_TEX.add(tex);
  return tex;
}

function surroundContactTexture() {
  const key = 'surround|contact';
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const S = 64, cv = document.createElement('canvas');
  cv.width = S; cv.height = 16;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, S, 0);
  grad.addColorStop(0, 'rgba(0,0,0,.48)');
  grad.addColorStop(0.45, 'rgba(0,0,0,.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, 16);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  TEX_CACHE.set(key, tex); CACHED_TEX.add(tex);
  return tex;
}

function makeTree(height = 4, crown = 1.2, variant = 'round', color = '#3e7d3a') {
  const g = new THREE.Group();
  g.userData.surroundTree = true;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, height * 0.58, 8),
    standardMaterial('#72533b', 'wood'));
  trunk.position.y = height * 0.29;
  trunk.castShadow = true;
  g.add(trunk);
  if (variant === 'conifer') {
    const crownMesh = new THREE.Mesh(new THREE.ConeGeometry(crown, height * 0.75, 10),
      standardMaterial(color, 'plastic'));
    crownMesh.position.y = height * 0.72;
    crownMesh.castShadow = true;
    g.add(crownMesh);
  } else {
    const crownMesh = new THREE.Mesh(new THREE.SphereGeometry(crown, 12, 8),
      standardMaterial(color, 'plastic'));
    crownMesh.scale.y = 0.82;
    crownMesh.position.y = height * 0.72;
    crownMesh.castShadow = true;
    g.add(crownMesh);
  }
  return g;
}

/* soft elliptical fake contact shadow: radial gradient dark centre → transparent */
function shadowTexture() {
  const key = 'shadow|contact';
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.80)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.30)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  TEX_CACHE.set(key, tex);
  CACHED_TEX.add(tex);
  return tex;
}

function glowTexture() {
  const key = 'glow|lamp';
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,245,190,0.75)');
  grad.addColorStop(0.4, 'rgba(255,226,130,0.25)');
  grad.addColorStop(1, 'rgba(255,226,130,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  TEX_CACHE.set(key, tex); CACHED_TEX.add(tex);
  return tex;
}

function contactShadow(fpw, fpd) {
  const geo = new THREE.PlaneGeometry(Math.max(0.1, fpw * 1.15), Math.max(0.1, fpd * 1.15));
  geo.rotateX(-HPI);
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTexture(), transparent: true, opacity: 0.38, depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.userData.contactShadow = true;
  return mesh;
}

function animateMesh(mesh, options) {
  mesh.userData = { ...(mesh.userData || {}), ...options };
  ANIMATED.push(mesh);
  return mesh;
}

function textSprite(text, size, color) {
  const fs = 64, pad = 12;
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  g.font = '600 ' + fs + 'px system-ui, sans-serif';
  const wTxt = Math.ceil(g.measureText(text).width);
  cv.width = wTxt + pad * 2;
  cv.height = fs + pad * 2;
  const g2 = cv.getContext('2d');
  g2.font = '600 ' + fs + 'px system-ui, sans-serif';
  g2.textBaseline = 'middle';
  g2.textAlign = 'center';
  g2.lineWidth = 8;
  g2.strokeStyle = 'rgba(10,14,20,0.85)';
  g2.strokeText(text, cv.width / 2, cv.height / 2);
  g2.fillStyle = color || '#f2f5f7';
  g2.fillText(text, cv.width / 2, cv.height / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  const aspect = cv.width / cv.height;
  spr.scale.set(size * aspect, size, 1);
  spr.renderOrder = 990;
  return spr;
}

/* ── procedural 3D physical apparatus for sports & playground items ─── */
function buildEquipmentRig3D(o) {
  const grp = new THREE.Group();
  grp.userData = { unitGroup: true, sp3: o, paletteParts: [] };
  const m = o.meta || {};
  const name = String(m.name || m.id || '').toLowerCase();
  const id = String(m.id || '').toLowerCase();
  const purp = String(m.purp || '').toLowerCase();
  const sz = o.size || [1.5, 2.0, 1.0];
  const W = Math.max(0.6, sz[0] || 1.2);
  const H = Math.max(0.8, sz[1] || 2.0);
  const D = Math.max(0.4, sz[2] || 0.8);
  const colIdx = m.idx != null ? m.idx : (m.unit || 0);
  const accentCols = ['#d3542c', '#2563eb', '#16a34a', '#d97706'];
  const accent = accentCols[colIdx % accentCols.length];
  const steel = '#1e293b';
  const steelLight = '#94a3b8';

  const addPart = (geo, matColor, px, py, pz, rx, ry, rz, castShadow = true) => {
    const preset = /steel|mast|frame|post|bar|rail/i.test(matColor) ? 'steel' : 'plastic';
    const mat = standardMaterial(matColor, preset);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(px, py, pz);
    if (rx) mesh.rotation.x = rx;
    if (ry) mesh.rotation.y = ry;
    if (rz) mesh.rotation.z = rz;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.userData = { sp3: o };
    if (matColor === accent) {
      mesh.userData.palette = 'a1';
      grp.userData.paletteParts.push(mesh);
    } else if (matColor === accentCols[(colIdx + 1) % accentCols.length]) {
      mesh.userData.palette = 'a2';
      grp.userData.paletteParts.push(mesh);
    }
    grp.add(mesh);
    return mesh;
  };
  const addRod = (a, b, radius, color = steel) => {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
    const dir = bv.clone().sub(av), len = dir.length();
    if (!(len > 0.001)) return null;
    const mesh = addPart(new THREE.CylinderGeometry(radius, radius, len, 10), color, 0, 0, 0);
    mesh.position.copy(av.clone().add(bv).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
  };
  const addTube = (points, radius, color = accent) => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return addPart(new THREE.TubeGeometry(curve, Math.max(4, points.length * 3), radius, 8, false), color, 0, 0, 0);
  };
  const addHalfPipe = (points, width, floorColor = accent, sideColor = accent2) => {
    const floor = addTube(points, Math.max(0.025, width * 0.22), floorColor);
    const left = points.map(([x, y, z]) => [x - width * 0.43, y + width * 0.34, z]);
    const right = points.map(([x, y, z]) => [x + width * 0.43, y + width * 0.34, z]);
    addTube(left, Math.max(0.018, width * 0.09), sideColor);
    addTube(right, Math.max(0.018, width * 0.09), sideColor);
    return floor;
  };
  const addRail = (x0, z0, x1, z1, y, color = steel) => {
    addRod([x0, y, z0], [x1, y, z1], 0.025, color);
    addRod([x0, 0, z0], [x0, y, z0], 0.025, steel);
    addRod([x1, 0, z1], [x1, y, z1], 0.025, steel);
  };
  const addNet = (w, h, cells, color = steelLight, z = 0, x = 0, y = 0) => {
    const n = Math.max(2, Math.round(cells));
    for (let i = 0; i <= n; i++) {
      const xx = x - w / 2 + (w * i) / n;
      addRod([xx, y, z], [xx, y + h, z], 0.012, color);
      const yy = y + (h * i) / n;
      addRod([x - w / 2, yy, z], [x + w / 2, yy, z], 0.012, color);
    }
  };
  const accent2 = accentCols[(colIdx + 1) % accentCols.length];
  let enhanced = false;

  if (purp === 'slides') {
    const postH = Math.min(H * 0.62, Math.max(0.75, H - 0.25));
    const platformY = Math.min(H - 0.25, Math.max(0.55, H * 0.55));
    for (const x of [-W * 0.34, W * 0.34]) for (const z of [-D * 0.28, D * 0.28]) {
      addRod([x, 0, z], [x, postH, z], 0.045, steel);
    }
    addPart(new THREE.BoxGeometry(W * 0.72, 0.08, D * 0.52), accent, 0, platformY, -D * 0.08);
    addRail(-W * 0.34, -D * 0.32, W * 0.34, -D * 0.32, platformY + 0.42, steel);
    addRail(-W * 0.34, -D * 0.32, -W * 0.34, D * 0.12, platformY + 0.42, steel);
    addRail(W * 0.34, -D * 0.32, W * 0.34, D * 0.12, platformY + 0.42, steel);
    const ladderZ = -D * 0.4;
    addRod([-W * 0.22, 0, ladderZ], [-W * 0.22, platformY, ladderZ], 0.025, steel);
    addRod([W * 0.22, 0, ladderZ], [W * 0.22, platformY, ladderZ], 0.025, steel);
    for (let y = 0.18; y < platformY; y += 0.22) addRod([-W * 0.22, y, ladderZ], [W * 0.22, y, ladderZ], 0.018, steelLight);
    if (H > 1.8) {
      const roofY = Math.min(H - 0.08, platformY + 0.78);
      addPart(new THREE.BoxGeometry(W * 0.48, 0.07, D * 0.7), accent2, -W * 0.15, roofY, -D * 0.08, 0, 0, -0.22);
      addPart(new THREE.BoxGeometry(W * 0.48, 0.07, D * 0.7), accent2, W * 0.15, roofY, -D * 0.08, 0, 0, 0.22);
      addRod([-W * 0.32, roofY + 0.12, -D * 0.08], [W * 0.32, roofY + 0.12, -D * 0.08], 0.025, steel);
    }
    const chute = [
      [0, platformY - 0.02, D * 0.12],
      [0, platformY * 0.78, D * 0.27],
      [0, 0.42, D * 0.43],
      [0, 0.3, D * 0.48]
    ];
    addHalfPipe(chute, Math.min(W * 0.48, 0.65), accent, accent2);
    addPart(new THREE.BoxGeometry(Math.min(W * 0.48, 0.65), 0.035, D * 0.16), accent, 0, 0.28, D * 0.48);
    enhanced = true;
  } else if (purp === 'multiplay') {
    const towerXs = [-W * 0.3, W * 0.3];
    const platformY = Math.min(H - 0.28, Math.max(0.8, H * 0.55));
    towerXs.forEach((tx, ti) => {
      const tz = -D * 0.1;
      for (const dx of [-W * 0.16, W * 0.16]) for (const dz of [-D * 0.16, D * 0.16]) {
        addRod([tx + dx, 0, tz + dz], [tx + dx, platformY, tz + dz], 0.045, steel);
      }
      addPart(new THREE.BoxGeometry(W * 0.34, 0.08, D * 0.38), accent, tx, platformY, tz);
      const roofY = Math.min(H - 0.08, platformY + 0.72);
      addPart(new THREE.BoxGeometry(W * 0.3, 0.07, D * 0.42), accent2, tx - W * 0.09, roofY, tz, 0, 0, -0.24);
      addPart(new THREE.BoxGeometry(W * 0.3, 0.07, D * 0.42), accent2, tx + W * 0.09, roofY, tz, 0, 0, 0.24);
    });
    const bridgeZ = -D * 0.1;
    addTube([[-W * 0.18, platformY + 0.08, bridgeZ - D * 0.15], [0, platformY + 0.02, bridgeZ - D * 0.15], [W * 0.18, platformY + 0.08, bridgeZ - D * 0.15]], 0.025, steel);
    addTube([[-W * 0.18, platformY + 0.08, bridgeZ + D * 0.15], [0, platformY + 0.02, bridgeZ + D * 0.15], [W * 0.18, platformY + 0.08, bridgeZ + D * 0.15]], 0.025, steel);
    for (let x = -W * 0.18; x <= W * 0.18; x += Math.max(0.18, W * 0.12)) {
      addPart(new THREE.BoxGeometry(Math.max(0.12, W * 0.09), 0.06, D * 0.22), accent, x, platformY, bridgeZ);
    }
    addNet(W * 0.38, Math.min(H * 0.72, platformY), 5, accent2, bridgeZ - D * 0.18, W * 0.3, 0);
    const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(W, D) * 0.22, Math.min(W, D) * 0.22, W * 0.55, 16, 1, true), standardMaterial(accent2, 'plastic'));
    tunnel.rotation.z = HPI; tunnel.position.set(0, Math.min(0.55, platformY * 0.55), bridgeZ); tunnel.userData = { sp3: o }; tunnel.castShadow = true; grp.add(tunnel);
    addHalfPipe([[towerXs[0], platformY - 0.03, bridgeZ + D * 0.15], [towerXs[0] + W * 0.06, platformY * 0.7, bridgeZ + D * 0.25], [towerXs[0] + W * 0.1, 0.35, D * 0.42]], Math.min(W * 0.32, 0.5), accent, accent2);
    enhanced = true;
  } else if (purp === 'swings') {
    const seats = W > 3.5 ? 3 : 2;
    const topY = Math.min(H, Math.max(1.7, H * 0.92));
    for (const x of [-W * 0.34, W * 0.34]) {
      addRod([x - 0.16, 0, -D * 0.34], [x, topY, 0], 0.045, steel);
      addRod([x + 0.16, 0, D * 0.34], [x, topY, 0], 0.045, steel);
    }
    addRod([-W * 0.34, topY, 0], [W * 0.34, topY, 0], 0.06, steel);
    for (let i = 0; i < seats; i++) {
      const x = (i - (seats - 1) / 2) * Math.min(0.75, W * 0.22);
      const pivot = new THREE.Group();
      pivot.position.set(x, topY, 0);
      pivot.userData = { sp3: o, swing: true };
      addPart(new THREE.CylinderGeometry(0.012, 0.012, topY * 0.56, 7), steelLight, x - 0.1, topY * 0.72, 0);
      addPart(new THREE.CylinderGeometry(0.012, 0.012, topY * 0.56, 7), steelLight, x + 0.1, topY * 0.72, 0);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.2), standardMaterial(accent, 'plastic'));
      seat.position.set(x, topY * 0.42, 0); seat.userData = { sp3: o }; pivot.add(seat);
      grp.add(pivot);
      animateMesh(pivot, { swing: true, amp: 0.14, period: 1800, phase: i * 0.8 });
    }
    enhanced = true;
  } else if (purp === 'springers') {
    const coilPoints = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32, a = t * TAU * 8;
      coilPoints.push([Math.cos(a) * 0.1, 0.08 + t * 0.35, Math.sin(a) * 0.1]);
    }
    addTube(coilPoints, 0.018, steel);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(Math.min(D * 0.22, 0.18), Math.max(0.22, W * 0.5), 6, 12), standardMaterial(accent, 'plastic'));
    body.rotation.z = HPI; body.position.set(-W * 0.03, 0.62, 0); body.userData = { sp3: o }; body.castShadow = true; grp.add(animateMesh(body, { amp: 0.06, period: 1500, phase: colIdx * 0.8 }));
    addPart(new THREE.SphereGeometry(Math.min(0.16, W * 0.16), 12, 8), accent2, W * 0.28, 0.72, 0);
    addPart(new THREE.ConeGeometry(0.055, 0.16, 8), accent2, W * 0.22, 0.87, -0.09);
    addPart(new THREE.ConeGeometry(0.055, 0.16, 8), accent2, W * 0.34, 0.87, 0.09);
    addPart(new THREE.BoxGeometry(W * 0.26, 0.06, D * 0.28), '#8b5a2b', -W * 0.02, 0.76, 0);
    addRod([W * 0.28, 0.78, -D * 0.12], [W * 0.28, 0.95, -D * 0.12], 0.018, steel);
    addRod([W * 0.28, 0.78, D * 0.12], [W * 0.28, 0.95, D * 0.12], 0.018, steel);
    for (const x of [-W * 0.28, W * 0.28]) for (const z of [-D * 0.22, D * 0.22]) addRod([x, 0.36, z], [x, 0.42, z], 0.022, steel);
    enhanced = true;
  } else if (purp === 'carousels') {
    const radius = Math.min(W, D) * 0.43;
    addPart(new THREE.CylinderGeometry(0.07, 0.09, Math.min(H, 0.9), 12), steel, 0, Math.min(H, 0.9) / 2, 0);
    const disc = addPart(new THREE.CylinderGeometry(radius, radius, 0.08, 28), accent, 0, 0.35, 0);
    animateMesh(disc, { spin: true, speed: 0.25 });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const x = Math.cos(a) * radius * 0.62, z = Math.sin(a) * radius * 0.62;
      addPart(new THREE.BoxGeometry(0.28, 0.08, 0.18), accent2, x, 0.47, z, 0, -a, 0);
      addTube([[0, 0.8, 0], [x * 0.55, 0.68, z * 0.55], [x, 0.58, z]], 0.018, steel);
    }
    if (H > 2) addPart(new THREE.ConeGeometry(radius * 0.9, 0.45, 16), accent2, 0, H - 0.22, 0);
    enhanced = true;
  } else if (purp === 'climbers' || purp === 'rope' || purp === 'parkour' || purp === 'walls') {
    const postH = Math.min(H, Math.max(1, H * 0.9));
    for (const x of [-W * 0.42, W * 0.42]) {
      addRod([x, 0, -D * 0.35], [x, postH, -D * 0.15], 0.045, steel);
      addRod([x, 0, D * 0.35], [x, postH, D * 0.15], 0.045, steel);
    }
    addRod([-W * 0.42, postH, -D * 0.15], [W * 0.42, postH, -D * 0.15], 0.045, steel);
    if (purp === 'walls') {
      addPart(new THREE.BoxGeometry(W * 0.72, H * 0.62, 0.1), accent, 0, H * 0.32, -D * 0.25);
      for (let i = 0; i < 12; i++) addPart(new THREE.SphereGeometry(0.055, 8, 6), i % 2 ? accent2 : '#f59e0b', (i % 4 - 1.5) * W * 0.16, H * (0.18 + (Math.floor(i / 4) * 0.18)), -D * 0.32);
    } else {
      addNet(W * 0.7, Math.min(H * 0.8, postH), 6, accent2, 0, 0, 0.08);
      for (let y = 0.35; y < postH; y += 0.35) addRod([-W * 0.3, y, D * 0.1], [W * 0.3, y, D * 0.1], 0.018, accent);
    }
    enhanced = true;
  } else if (purp === 'fitness' || purp === 'street' || /fitnes|fitness|workout|street/i.test(name + ' ' + id)) {
    const hw = W * 0.36, hd = D * 0.3, topY = Math.min(H, 2.2);
    for (const x of [-hw, hw]) addRod([x, 0, -hd], [x, topY, -hd], 0.045, steel);
    addRod([-hw, topY, -hd], [hw, topY, -hd], 0.03, accent);
    addRod([-hw, 0.95, hd], [hw, 0.95, hd], 0.028, accent);
    addRod([-hw, 0.95, hd + 0.18], [hw, 0.95, hd + 0.18], 0.028, accent);
    addRod([-hw, 0.35, hd], [hw, 0.75, -hd], 0.04, steel);
    addPart(new THREE.BoxGeometry(W * 0.35, 0.06, D * 0.18), accent2, 0, 0.72, 0);
    enhanced = true;
  } else if (purp === 'benches') {
    for (let i = 0; i < 5; i++) addPart(new THREE.BoxGeometry(W * 0.9, 0.045, Math.min(0.1, D * 0.16)), '#8b5a2b', 0, 0.46, -D * 0.32 + i * D * 0.16);
    for (let i = 0; i < 3; i++) addPart(new THREE.BoxGeometry(W * 0.9, 0.045, Math.min(0.1, D * 0.16)), '#8b5a2b', 0, 0.72 + i * 0.12, -D * 0.38);
    for (const x of [-W * 0.36, W * 0.36]) {
      addRod([x, 0, -D * 0.28], [x, 0.46, -D * 0.28], 0.035, steel);
      addRod([x, 0.46, -D * 0.28], [x, 0.72, -D * 0.38], 0.035, steel);
    }
    enhanced = true;
  } else if (purp === 'playhouses' || purp === 'shelters') {
    const wallH = Math.min(H * 0.58, 1.25);
    for (const x of [-W * 0.38, W * 0.38]) for (const z of [-D * 0.34, D * 0.34]) addRod([x, 0, z], [x, H * 0.75, z], 0.04, steel);
    addPart(new THREE.BoxGeometry(W * 0.28, wallH, 0.06), accent, -W * 0.34, wallH / 2, D * 0.34);
    addPart(new THREE.BoxGeometry(W * 0.28, wallH, 0.06), accent, W * 0.34, wallH / 2, D * 0.34);
    addPart(new THREE.BoxGeometry(W * 0.72, 0.06, 0.06), accent2, 0, wallH * 0.55, -D * 0.34);
    addRail(-W * 0.16, D * 0.37, W * 0.16, D * 0.37, wallH * 0.7, steel);
    addPart(new THREE.BoxGeometry(W * 0.55, 0.08, D * 0.9), accent2, -W * 0.18, H * 0.78, 0, 0, 0, -0.22);
    addPart(new THREE.BoxGeometry(W * 0.55, 0.08, D * 0.9), accent2, W * 0.18, H * 0.78, 0, 0, 0, 0.22);
    enhanced = true;
  } else if (purp === 'trampoline') {
    const radius = Math.min(W, D) * 0.42;
    addPart(new THREE.TorusGeometry(radius, 0.08, 10, 32), '#2563eb', 0, 0.12, 0, HPI);
    const mat = addPart(new THREE.CylinderGeometry(radius * 0.86, radius * 0.86, 0.045, 28), '#172554', 0, 0.16, 0);
    animateMesh(mat, { amp: 0.025, period: 1100, phase: colIdx * 0.4 });
    addPart(new THREE.TorusGeometry(radius * 0.9, 0.055, 8, 28), accent, 0, 0.18, 0, HPI);
    enhanced = true;
  } else if (purp === 'planters') {
    addPart(new THREE.CylinderGeometry(Math.min(W, D) * 0.28, Math.min(W, D) * 0.42, H * 0.55, 16), '#8b5a2b', 0, H * 0.275, 0);
    addPart(new THREE.CylinderGeometry(Math.min(W, D) * 0.28, Math.min(W, D) * 0.28, 0.04, 16), '#4b3621', 0, H * 0.56, 0);
    for (let i = 0; i < 3; i++) addPart(new THREE.SphereGeometry(Math.min(W, D) * 0.22, 10, 8), '#3f8f45', (i - 1) * W * 0.2, H * 0.72, (i % 2 - 0.5) * D * 0.2);
    for (let i = 0; i < 6; i++) addPart(new THREE.SphereGeometry(0.035, 6, 5), i % 2 ? '#ffffff' : accent, Math.cos(i) * W * 0.22, H * 0.9, Math.sin(i) * D * 0.22);
    enhanced = true;
  } else if (purp === 'tables' || purp === 'picnic') {
    addPart(new THREE.BoxGeometry(W * 0.85, 0.08, D * 0.42), '#8b5a2b', 0, 0.72, 0);
    for (const x of [-W * 0.32, W * 0.32]) addRod([x, 0, 0], [x, 0.72, 0], 0.04, steel);
    if (purp === 'picnic') for (const z of [-D * 0.62, D * 0.62]) addPart(new THREE.BoxGeometry(W * 0.78, 0.07, 0.12), '#8b5a2b', 0, 0.45, z);
    enhanced = true;
  } else if (!purp || !['basketball', 'goals', 'arenas'].includes(purp)) {
    const hw = W * 0.38, hd = D * 0.34;
    for (const x of [-hw, hw]) addRod([x, 0, -hd], [x, H, -hd], 0.04, steel);
    addRod([-hw, H, -hd], [hw, H, -hd], 0.035, accent);
    addPart(new THREE.BoxGeometry(W * 0.5, H * 0.28, 0.08), accent2, 0, H * 0.48, -hd);
    addNet(W * 0.62, H * 0.55, 4, steelLight, hd, 0, H * 0.12);
    enhanced = true;
  }

  // 1. BASKETBALL HOOP
  if (!enhanced && (/basket|kosh|кош|arena[-_ ]?242|arena[-_ ]?243|r1390|r2212/i.test(name) || /basket|kosh|arena-242|arena-243|r1390|r2212/i.test(id))) {
    const mastH = Math.max(2.8, H);
    // Base anchor plate & bolts
    addPart(new THREE.BoxGeometry(0.4, 0.03, 0.4), '#0f172a', 0, 0.015, 0);
    // Upright main mast
    addPart(new THREE.BoxGeometry(0.12, mastH, 0.12), steel, 0, mastH / 2, 0);
    // Protective padding sleeve
    addPart(new THREE.BoxGeometry(0.24, 1.2, 0.24), accent, 0, 0.6, 0);
    // Overhang cantilever arm
    const armLen = 1.1;
    const armGeo = new THREE.BoxGeometry(0.1, 0.1, armLen);
    armGeo.translate(0, 0, armLen / 2);
    addPart(armGeo, steel, 0, mastH - 0.25, 0, -0.15, 0, 0);
    // Backboard
    const bbW = 1.8, bbH = 1.05;
    const bbZ = armLen + 0.1;
    const bbY = mastH - 0.1;
    addPart(new THREE.BoxGeometry(bbW, bbH, 0.03), '#f8fafc', 0, bbY, bbZ);
    // Inner target rectangle (red outline)
    addPart(new THREE.BoxGeometry(0.59, 0.03, 0.035), '#dc2626', 0, bbY + 0.225, bbZ);
    addPart(new THREE.BoxGeometry(0.59, 0.03, 0.035), '#dc2626', 0, bbY - 0.225, bbZ);
    addPart(new THREE.BoxGeometry(0.03, 0.45, 0.035), '#dc2626', -0.28, bbY, bbZ);
    addPart(new THREE.BoxGeometry(0.03, 0.45, 0.035), '#dc2626', 0.28, bbY, bbZ);
    // Orange Rim (mounted at regulation height)
    const rimY = bbY - bbH / 2 + 0.15;
    const rimZ = bbZ + 0.38;
    const rimGeo = new THREE.TorusGeometry(0.225, 0.016, 8, 24);
    rimGeo.rotateX(HPI);
    const rim = addPart(rimGeo, '#ea580c', 0, rimY, rimZ);
    rim.userData.sp3 = { ...o, meta: { ...(o.meta || {}), part: 'rim', rimR: 0.225 } };
    // White net mesh
    const netGeo = new THREE.CylinderGeometry(0.22, 0.12, 0.38, 12, 1, true);
    netGeo.translate(0, -0.19, 0);
    const netMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f1f5f9'), wireframe: true, transparent: true, opacity: 0.75, roughness: 0.5 });
    const netMesh = new THREE.Mesh(netGeo, netMat);
    netMesh.position.set(0, rimY, rimZ);
    netMesh.userData = { sp3: o };
    grp.add(animateMesh(netMesh, { amp: 0.03, period: 2100, phase: (colIdx + 1) * 0.7 }));
  }
  // 2. GOAL / ARENA GOAL
  else if (/vrata|goal|футбол|хандбал|минифутбол|arena[-_ ]?240|arena[-_ ]?241/i.test(name) || /vrata|goal|football|handbal|arena-240|arena-241/i.test(id)) {
    const gW = W, gH = H, gD = Math.max(0.6, D);
    const postR = 0.045;
    const postGeo = new THREE.CylinderGeometry(postR, postR, gH, 16);
    postGeo.translate(0, gH / 2, 0);
    addPart(postGeo, '#ffffff', -gW / 2, 0, 0);
    addPart(postGeo, '#ffffff', gW / 2, 0, 0);
    const barGeo = new THREE.CylinderGeometry(postR, postR, gW, 16);
    barGeo.rotateZ(HPI);
    addPart(barGeo, '#ffffff', 0, gH, 0);
    // Rear ground frame
    const baseSideGeo = new THREE.CylinderGeometry(0.03, 0.03, gD, 12);
    baseSideGeo.rotateX(HPI);
    baseSideGeo.translate(0, 0.03, -gD / 2);
    addPart(baseSideGeo, '#ffffff', -gW / 2, 0, 0);
    addPart(baseSideGeo, '#ffffff', gW / 2, 0, 0);
    const baseBackGeo = new THREE.CylinderGeometry(0.03, 0.03, gW, 12);
    baseBackGeo.rotateZ(HPI);
    baseBackGeo.translate(0, 0.03, -gD);
    addPart(baseBackGeo, '#ffffff', 0, 0, 0);
    // Top depth arms
    const topArmLen = gD * 0.7;
    const topArmGeo = new THREE.CylinderGeometry(0.025, 0.025, topArmLen, 12);
    topArmGeo.rotateX(HPI);
    topArmGeo.translate(0, 0, -topArmLen / 2);
    addPart(topArmGeo, '#ffffff', -gW / 2, gH, 0);
    addPart(topArmGeo, '#ffffff', gW / 2, gH, 0);
    // Diagonal net back stays
    const diagLen = Math.hypot(gH, gD - topArmLen);
    const diagAng = Math.atan2(gD - topArmLen, gH);
    const diagGeo = new THREE.CylinderGeometry(0.02, 0.02, diagLen, 12);
    diagGeo.translate(0, diagLen / 2, 0);
    diagGeo.rotateX(-diagAng);
    addPart(diagGeo, '#ffffff', -gW / 2, 0, -gD);
    addPart(diagGeo, '#ffffff', gW / 2, 0, -gD);
    // Net back panel
    const netP = new THREE.PlaneGeometry(gW, gH);
    netP.translate(0, gH / 2, -gD * 0.6);
    netP.rotateX(-0.25);
    const netM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f1f5f9'), wireframe: true, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const netMesh = new THREE.Mesh(netP, netM);
    netMesh.userData = { sp3: o };
    grp.add(animateMesh(netMesh, { amp: 0.02, period: 2400, phase: (colIdx + 1) * 0.5 }));
  }
  // 3. PLAYGROUND SLIDE
  else if (purp === 'slides' || /пързал|parzalka|slide|тобоган|tobogan/i.test(name) || /parzalka|slide|tobogan/i.test(id)) {
    const postGeo = new THREE.CylinderGeometry(0.045, 0.045, H * 0.6, 12);
    postGeo.translate(0, H * 0.3, 0);
    for (const x of [-W * 0.35, W * 0.35]) for (const z of [-D * 0.3, D * 0.3]) addPart(postGeo.clone(), steel, x, 0, z);
    const platformY = H * 0.6;
    addPart(new THREE.BoxGeometry(W * 0.75, 0.08, D * 0.55), accent, 0, platformY, 0);
    const rungGeo = new THREE.CylinderGeometry(0.018, 0.018, H * 0.45, 10);
    rungGeo.rotateZ(HPI);
    for (let i = 0; i < 4; i++) addPart(rungGeo.clone(), steelLight, -W * 0.35, 0.18 + i * 0.13, D * 0.38);
    const chuteLen = Math.max(D * 0.9, H * 0.65);
    const chuteAng = Math.atan2(platformY - 0.3, chuteLen);
    const chute = new THREE.BoxGeometry(W * 0.35, 0.06, chuteLen);
    chute.translate(0, 0, chuteLen / 2);
    addPart(chute, accent, 0, 0.3, D * 0.45, chuteAng, 0, 0);
    addPart(new THREE.BoxGeometry(0.05, 0.18, chuteLen), steel, -W * 0.2, 0.38, D * 0.45, chuteAng, 0, 0);
    addPart(new THREE.BoxGeometry(0.05, 0.18, chuteLen), steel, W * 0.2, 0.38, D * 0.45, chuteAng, 0, 0);
  }
  // 4. PLAYGROUND SWING
  else if (purp === 'swings' || /люл|lyulka|swing/i.test(name) || /lyulka|swing/i.test(id)) {
    const legGeo = new THREE.CylinderGeometry(0.045, 0.045, H, 12);
    legGeo.translate(0, H / 2, 0);
    for (const x of [-W * 0.38, W * 0.38]) for (const z of [-D * 0.35, D * 0.35]) {
      addPart(legGeo.clone(), steel, x, 0, z, z < 0 ? -0.18 : 0.18);
    }
    const beam = new THREE.CylinderGeometry(0.055, 0.055, W, 12);
    beam.rotateZ(HPI);
    addPart(beam, steelLight, 0, H, 0);
    for (const x of [-W * 0.2, W * 0.2]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, H, 0);
      pivot.userData = { sp3: o, swing: true };
      const addPivotPart = (geo, matColor, px, py, pz) => {
        const mesh = new THREE.Mesh(geo, standardMaterial(matColor, 'plastic'));
        mesh.position.set(px, py, pz);
        mesh.userData = { sp3: o };
        pivot.add(mesh);
        return mesh;
      };
      const rope = new THREE.CylinderGeometry(0.012, 0.012, H * 0.48, 8);
      rope.translate(0, -H * 0.24, 0);
      addPivotPart(rope.clone(), steelLight, -0.1, 0, 0);
      addPivotPart(rope.clone(), steelLight, 0.1, 0, 0);
      addPivotPart(new THREE.BoxGeometry(0.45, 0.03, 0.2), accent, 0, -H * 0.5, 0);
      grp.add(animateMesh(pivot, { swing: true, amp: 0.15, period: 1800, phase: (x + W) * 2 }));
    }
  }
  // 5. CLIMBING FRAME / WALL
  else if (purp === 'climbers' || purp === 'rope' || /катеруш|katerene|katerushka|climb|стена|stena|wall/i.test(name) || /kater|climb|stena|wall/i.test(id)) {
    for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 3; iz++) {
      const h = H * (0.7 + 0.15 * ((ix + iz) % 3));
      const post = new THREE.CylinderGeometry(0.04, 0.04, h, 12);
      post.translate(0, h / 2, 0);
      addPart(post, steel, (ix - 1) * W * 0.4, 0, (iz - 1) * D * 0.4);
    }
    const rungStep = 0.3;
    for (let y = rungStep; y < H; y += rungStep) {
      addPart(new THREE.BoxGeometry(W * 0.8, 0.035, 0.04), (Math.round(y / rungStep) % 2) ? accent : steelLight, 0, y, 0);
      addPart(new THREE.BoxGeometry(0.04, 0.035, D * 0.8), (Math.round(y / rungStep) % 2) ? steelLight : accent, 0, y, 0);
    }
    if (/стена|stena|wall/i.test(name + ' ' + id)) {
      addPart(new THREE.BoxGeometry(W * 0.75, H * 0.65, 0.08), '#b45309', 0, H * 0.35, -D * 0.35);
      for (let i = 0; i < 5; i++) {
        const hold = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), standardMaterial(accent, 'plastic'));
        hold.position.set((i - 2) * W * 0.13, H * (0.25 + (i % 2) * 0.16), -D * 0.42);
        hold.userData = { sp3: o };
        grp.add(hold);
      }
    }
  }
  // 6. CAROUSEL
  else if (purp === 'carousels' || /въртел|въртящ|махало|vartelezhka|vartqshto|mahalo|carousel/i.test(name) || /vartelezhka|vartqshto|mahalo|carousel/i.test(id)) {
    addPart(new THREE.CylinderGeometry(0.08, 0.08, H, 12), steel, 0, H / 2, 0);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, 0.06, 24), standardMaterial(accent, 'plastic'));
    disc.position.y = 0.45;
    disc.userData = { sp3: o, spin: true };
    grp.add(animateMesh(disc, { spin: true, speed: 0.15 }));
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const bar = new THREE.CylinderGeometry(0.018, 0.018, W * 0.7, 8);
      bar.rotateZ(HPI);
      addPart(bar, steelLight, Math.cos(a) * W * 0.25, 0.72, Math.sin(a) * W * 0.25, 0, a, 0);
    }
  }
  // 7. SPRING RIDER
  else if (purp === 'springers' || /пружин|prujin|spring|rocker/i.test(name) || /prujin|spring|rocker/i.test(id)) {
    for (let i = 0; i < 5; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 8, 18), standardMaterial(steel, 'steel'));
      coil.position.y = 0.08 + i * 0.06;
      coil.userData = { sp3: o };
      grp.add(coil);
    }
    const body = addPart(new THREE.BoxGeometry(W * 0.55, 0.18, D * 0.35), accent, 0, 0.55, 0);
    animateMesh(body, { amp: 0.08, period: 1500, phase: colIdx * 0.8 });
    addPart(new THREE.BoxGeometry(0.25, 0.04, 0.18), accent, 0, 0.68, D * 0.16);
    const grip = new THREE.CylinderGeometry(0.018, 0.018, 0.35, 8);
    grip.rotateX(HPI);
    addPart(grip, steel, -0.16, 0.68, D * 0.22);
    addPart(grip.clone(), steel, 0.16, 0.68, D * 0.22);
  }
  // 8. SANDBOX / BALANCE BEAM / SEESAW
  else if (purp === 'sandboxes' || /пясъч|sandbox/i.test(name) || /sandbox/i.test(id)) {
    const sand = new THREE.PlaneGeometry(W, D);
    sand.rotateX(-HPI);
    addPart(sand, '#d6b36a', 0, 0.02, 0);
    addPart(new THREE.BoxGeometry(W, 0.22, 0.08), steel, 0, 0.11, -D / 2);
    addPart(new THREE.BoxGeometry(W, 0.22, 0.08), steel, 0, 0.11, D / 2);
    addPart(new THREE.BoxGeometry(0.08, 0.22, D), steel, -W / 2, 0.11, 0);
    addPart(new THREE.BoxGeometry(0.08, 0.22, D), steel, W / 2, 0.11, 0);
  }
  else if (purp === 'balance' || /греда|баланс|beam|balance/i.test(name) || /greda|balans|beam|balance/i.test(id)) {
    addPart(new THREE.BoxGeometry(W, 0.12, 0.18), accent, 0, 0.55, 0);
    addPart(new THREE.BoxGeometry(0.12, 0.55, 0.12), steel, -W * 0.3, 0.27, 0);
    addPart(new THREE.BoxGeometry(0.12, 0.55, 0.12), steel, W * 0.3, 0.27, 0);
  }
  else if (/клатуш|seesaw/i.test(name) || /klatushka|seesaw/i.test(id)) {
    const plank = addPart(new THREE.BoxGeometry(W, 0.12, 0.28), accent, 0, 0.55, 0);
    animateMesh(plank, { amp: 0.12, period: 1900, phase: colIdx * 0.6 });
    addPart(new THREE.ConeGeometry(0.22, 0.5, 4), steel, 0, 0.25, 0);
  }
  else if (purp === 'playhouses') {
    addPart(new THREE.BoxGeometry(W * 0.75, H * 0.48, D * 0.7), accent, 0, H * 0.24, 0);
    const roof = Math.atan2(H * 0.28, Math.max(0.2, W * 0.42));
    const half = new THREE.BoxGeometry(W * 0.55, 0.08, D * 0.82);
    addPart(half.clone(), accent, -W * 0.2, H * 0.62, 0, 0, 0, -roof);
    addPart(half.clone(), accent, W * 0.2, H * 0.62, 0, 0, 0, roof);
  }
  else if (purp === 'multiplay') {
    const post = new THREE.CylinderGeometry(0.05, 0.05, H * 0.72, 10);
    post.translate(0, H * 0.36, 0);
    for (const x of [-W * 0.3, W * 0.3]) for (const z of [-D * 0.25, D * 0.25]) addPart(post.clone(), steel, x, 0, z);
    for (const py of [H * 0.45, H * 0.7]) addPart(new THREE.BoxGeometry(W * 0.58, 0.08, D * 0.5), accent, 0, py, 0);
    const roof = new THREE.BoxGeometry(W * 0.45, 0.08, D * 0.45);
    addPart(roof, accent, 0, H * 0.92, 0, 0, 0, Math.atan2(H * 0.12, W * 0.25));
    const chute = new THREE.BoxGeometry(W * 0.28, 0.06, D * 0.8);
    chute.translate(0, 0, D * 0.4);
    addPart(chute, accent, W * 0.42, H * 0.35, 0, Math.atan2(H * 0.35, D * 0.8), 0, 0);
    addPart(new THREE.BoxGeometry(0.05, H * 0.55, D * 0.1), steelLight, -W * 0.42, H * 0.27, 0);
  }
  else if (purp === 'trampoline') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(0.25, W * 0.42), 0.06, 8, 24), standardMaterial(steel, 'steel'));
    ring.rotation.x = HPI; ring.userData = { sp3: o }; grp.add(ring);
    const mat = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.2, W * 0.36), Math.max(0.2, W * 0.36), 0.04, 24), standardMaterial('#1f2937', 'plastic'));
    mat.position.y = 0.08; mat.userData = { sp3: o }; grp.add(mat);
  }
  else if (purp === 'benches') {
    for (let i = -1; i <= 1; i++) addPart(new THREE.BoxGeometry(W * 0.9, 0.055, 0.09), '#b45309', 0, 0.48, i * 0.12);
    for (const x of [-W * 0.38, W * 0.38]) addPart(new THREE.BoxGeometry(0.07, 0.48, D * 0.7), steel, x, 0.24, 0);
    addPart(new THREE.BoxGeometry(W * 0.9, 0.14, 0.06), '#b45309', 0, 0.78, -D * 0.28);
  }
  else if (purp === 'tables' || purp === 'picnic') {
    addPart(new THREE.BoxGeometry(W * 0.9, 0.08, D * 0.7), '#b45309', 0, 0.7, 0);
    for (const x of [-W * 0.3, W * 0.3]) addPart(new THREE.BoxGeometry(0.08, 0.7, D * 0.55), steel, x, 0.35, 0);
    if (purp === 'picnic') for (const z of [-D * 0.65, D * 0.65]) addPart(new THREE.BoxGeometry(W * 0.85, 0.06, 0.12), '#b45309', 0, 0.45, z);
  }
  else if (purp === 'planters') {
    addPart(new THREE.BoxGeometry(W * 0.7, H * 0.35, D * 0.7), '#9a6b43', 0, H * 0.175, 0);
    addPart(new THREE.SphereGeometry(Math.min(W, D) * 0.42, 12, 8), '#3f8f45', 0, H * 0.62, 0);
  }
  else if (purp === 'bins') {
    addPart(new THREE.CylinderGeometry(W * 0.35, W * 0.4, H * 0.7, 16), steel, 0, H * 0.35, 0);
    addPart(new THREE.CylinderGeometry(W * 0.38, W * 0.38, 0.06, 16), accent, 0, H * 0.72, 0);
  }
  else if (purp === 'bike') {
    for (let i = -1; i <= 1; i++) {
      const x = i * W * 0.28;
      addPart(new THREE.CylinderGeometry(0.025, 0.025, H * 0.75, 8), steel, x - 0.16, H * 0.375, 0);
      addPart(new THREE.CylinderGeometry(0.025, 0.025, H * 0.75, 8), steel, x + 0.16, H * 0.375, 0);
      const bar = new THREE.CylinderGeometry(0.025, 0.025, 0.32, 8); bar.rotateX(HPI);
      addPart(bar, steel, x, H * 0.75, 0);
    }
  }
  else if (purp === 'bollards') {
    addPart(new THREE.CylinderGeometry(W * 0.2, W * 0.24, H * 0.75, 12), steel, 0, H * 0.375, 0);
    addPart(new THREE.SphereGeometry(W * 0.24, 12, 8), accent, 0, H * 0.78, 0);
  }
  else if (purp === 'dog') {
    const post = new THREE.CylinderGeometry(0.035, 0.035, H * 0.7, 8);
    addPart(post, steel, -W * 0.3, H * 0.35, 0); addPart(post.clone(), steel, W * 0.3, H * 0.35, 0);
    addPart(new THREE.CylinderGeometry(0.025, 0.025, W * 0.6, 8), accent, 0, H * 0.55, 0, 0, 0, HPI);
  }
  else if (purp === 'info') {
    addPart(new THREE.CylinderGeometry(0.04, 0.04, H * 0.65, 8), steel, 0, H * 0.325, 0);
    addPart(new THREE.BoxGeometry(W * 0.75, H * 0.35, 0.05), accent, 0, H * 0.75, 0);
  }
  else if (purp === 'fences') {
    for (const x of [-W * 0.4, 0, W * 0.4]) addPart(new THREE.CylinderGeometry(0.03, 0.03, H, 8), steel, x, H / 2, 0);
    addPart(new THREE.BoxGeometry(W * 0.8, 0.05, 0.05), accent, 0, H * 0.35, 0);
    addPart(new THREE.BoxGeometry(W * 0.8, 0.05, 0.05), accent, 0, H * 0.7, 0);
  }
  else if (purp === 'shelters') {
    const post = new THREE.CylinderGeometry(0.04, 0.04, H * 0.8, 8);
    for (const x of [-W * 0.4, W * 0.4]) for (const z of [-D * 0.35, D * 0.35]) addPart(post.clone(), steel, x, H * 0.4, z);
    addPart(new THREE.BoxGeometry(W, 0.1, D), accent, 0, H * 0.8, 0);
  }
  // 3. FITNESS / CALISTHENICS / WORKOUT STATION
  else if (/fitnes|fitness|lost|shved|uspored|pull|dip|gym|street|workout|trenajor|steper|kater/i.test(name) || /fitnes|fitness|lost|shved|uspored|pull|dip|gym|street|workout|trenajor|steper|kater/i.test(id)) {
    const postR = 0.045, barR = 0.018;
    const hw = W / 2, hd = D / 2;
    const postGeo = new THREE.CylinderGeometry(postR, postR, H, 16);
    postGeo.translate(0, H / 2, 0);
    addPart(postGeo, steel, -hw, 0, -hd);
    addPart(postGeo, steel, hw, 0, -hd);
    addPart(postGeo, steel, -hw, 0, hd);
    addPart(postGeo, steel, hw, 0, hd);
    // Top pull-up / cross bars
    const barXGeo = new THREE.CylinderGeometry(barR, barR, W, 12);
    barXGeo.rotateZ(HPI);
    addPart(barXGeo, accent, 0, H - 0.05, -hd);
    addPart(barXGeo, accent, 0, H - 0.05, hd);
    const barZGeo = new THREE.CylinderGeometry(barR, barR, D, 12);
    barZGeo.rotateX(HPI);
    addPart(barZGeo, steelLight, -hw, H - 0.05, 0);
    addPart(barZGeo, steelLight, hw, H - 0.05, 0);
    // Intermediate horizontal rungs
    const rungs = Math.max(2, Math.floor(H / 0.35));
    for (let i = 1; i < rungs; i++) {
      const ry = (H / rungs) * i;
      addPart(barXGeo.clone(), steelLight, 0, ry, -hd);
    }
    // Parallel dip bar handles
    const dipGeo = new THREE.CylinderGeometry(0.022, 0.022, D * 1.2, 12);
    dipGeo.rotateX(HPI);
    addPart(dipGeo, accent, -hw - 0.25, Math.min(1.1, H * 0.5), 0);
    addPart(dipGeo, accent, hw + 0.25, Math.min(1.1, H * 0.5), 0);
    addPart(new THREE.BoxGeometry(0.25, 0.04, 0.04), steel, -hw - 0.125, Math.min(1.1, H * 0.5), -hd * 0.6);
    addPart(new THREE.BoxGeometry(0.25, 0.04, 0.04), steel, hw + 0.125, Math.min(1.1, H * 0.5), -hd * 0.6);
  }
  // 4. BENCH / TABLE / REST PROPS
  else if (/peyk|bench|stol|masa|table|most|greda|tramplin|kanyon/i.test(name) || /peyk|bench|stol|masa|table|most|greda|tramplin|kanyon/i.test(id)) {
    const seatH = Math.min(0.48, H * 0.6);
    const legGeo = new THREE.BoxGeometry(0.06, seatH, 0.06);
    legGeo.translate(0, seatH / 2, 0);
    addPart(legGeo, steel, -W / 2 + 0.1, 0, -D / 2 + 0.1);
    addPart(legGeo, steel, W / 2 - 0.1, 0, -D / 2 + 0.1);
    addPart(legGeo, steel, -W / 2 + 0.1, 0, D / 2 - 0.1);
    addPart(legGeo, steel, W / 2 - 0.1, 0, D / 2 - 0.1);
    // Wooden slats for top
    const slatW = 0.12, gap = 0.02;
    const numSlats = Math.max(2, Math.floor(D / (slatW + gap)));
    for (let i = 0; i < numSlats; i++) {
      const sz = -D / 2 + (i + 0.5) * (D / numSlats);
      addPart(new THREE.BoxGeometry(W, 0.04, slatW), '#b45309', 0, seatH + 0.02, sz);
    }
    if (H > 0.6) {
      addPart(new THREE.BoxGeometry(0.05, 0.45, 0.05), steel, -W / 2 + 0.1, seatH + 0.22, -D / 2 + 0.05);
      addPart(new THREE.BoxGeometry(0.05, 0.45, 0.05), steel, W / 2 - 0.1, seatH + 0.22, -D / 2 + 0.05);
      addPart(new THREE.BoxGeometry(W, 0.14, 0.03), '#b45309', 0, seatH + 0.35, -D / 2 + 0.03);
    }
  }
  // 5. GENERIC ARCHITECTURAL APPARATUS
  else {
    const postR = 0.035;
    const hw = W / 2, hd = D / 2;
    const postGeo = new THREE.CylinderGeometry(postR, postR, H, 16);
    postGeo.translate(0, H / 2, 0);
    addPart(postGeo, steel, -hw, 0, -hd);
    addPart(postGeo, steel, hw, 0, -hd);
    addPart(postGeo, steel, -hw, 0, hd);
    addPart(postGeo, steel, hw, 0, hd);
    // Perimeter safety top rail
    const railX = new THREE.CylinderGeometry(0.02, 0.02, W, 12);
    railX.rotateZ(HPI);
    addPart(railX, accent, 0, H, -hd);
    addPart(railX, accent, 0, H, hd);
    const railZ = new THREE.CylinderGeometry(0.02, 0.02, D, 12);
    railZ.rotateX(HPI);
    addPart(railZ, accent, -hw, H, 0);
    addPart(railZ, accent, hw, H, 0);
    addPart(railX.clone(), steelLight, 0, H * 0.5, -hd);
    addPart(railX.clone(), steelLight, 0, H * 0.5, hd);
  }

  const sh = contactShadow(W, D);
  sh.position.set(0, -(o.pos[1] || 0) + 0.008, 0);
  sh.rotation.order = 'YXZ';
  sh.rotation.set(-(o.tiltX || 0), 0, -(o.tiltZ || 0));
  grp.add(sh);

  grp.rotation.order = 'YXZ';
  grp.position.set(o.pos[0], o.pos[1] || 0, o.pos[2]);
  const rigRotY = typeof o.rotY === 'number' ? o.rotY : (o.pos[2] < 0 ? Math.PI : 0);
  grp.rotation.set(typeof o.tiltX === 'number' ? o.tiltX : 0, rigRotY, typeof o.tiltZ === 'number' ? o.tiltZ : 0);
  grp.traverse((part) => {
    if (part.isMesh && !part.userData.contactShadow) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
  });
  return grp;
}

/* ── one scene object → THREE.Object3D ─────────────────────────────── */
const HPI = Math.PI / 2;
const TAU = Math.PI * 2;
const CACHED_TEX = new WeakSet();
function isFenceKind(kind) { return kind === 'fence' || kind === 'fence-post' || kind === 'gallery-net' || kind === 'gate'; }
function buildObject(o, L, W, onPhoto) {
  const kind = o.meta && o.meta.kind;
  const isMark = kind === 'marking';
  const isDim = kind === 'dim-line';
  if (o.type === 'text') {
    const spr = textSprite(o.text, o.size, o.color);
    spr.position.set(o.pos[0], o.pos[1], o.pos[2]);
    return spr;
  }
  if (o.type === 'billboard' && kind === 'equipment' && o.meta?.part === 'photo') {
    /* Product photography is a reference card for a physical rig, not the
       apparatus itself. Keep the photo available above the rig. */
    const fp = o.meta.fp || { w: o.size[0], h: o.size[1], d: o.size[2] || o.size[0] };
    const rigObj = Object.assign({}, o, {
      type: 'box',
      size: [fp.w, fp.h, fp.d],
      meta: Object.assign({}, o.meta, { part: null })
    });
    const rig = buildEquipmentRig3D(rigObj);
    if (typeof onPhoto === 'function') onPhoto(rig, o, L, W);
    return rig;
  }
  if (o.type === 'billboard') {
    const bh = o.size[1] || 1;
    const bw = o.size[0] || bh;
    const geo = new THREE.PlaneGeometry(bw, bh);
    geo.translate(0, bh / 2, 0);
    const frontMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff'), transparent: true, opacity: 0, alphaTest: 0.05, side: THREE.DoubleSide, depthWrite: false
    });
    const front = new THREE.Mesh(geo, frontMat);
    front.userData = { sp3: o, photoPlane: true };
    const fp = (o.meta && o.meta.fp) || { w: bw, d: bw };
    const grp = new THREE.Group();
    grp.userData = { sp3: o, unitGroup: true, billboard: true };
    grp.add(front);
    const sh = contactShadow(fp.w || bw, fp.d || bw);
    sh.position.set(0, -(o.pos[1] || 0) + 0.008, 0);
    sh.rotation.order = 'YXZ';
    sh.rotation.set(-(o.tiltX || 0), 0, -(o.tiltZ || 0));
    grp.add(sh);
    grp.position.set(o.pos[0], o.pos[1] || 0, o.pos[2]);
    grp.rotation.order = 'YXZ';
    const initRot = typeof o.rotY === 'number' ? o.rotY : (o.pos[2] < 0 ? Math.PI : 0);
    grp.rotation.set(typeof o.tiltX === 'number' ? o.tiltX : 0, initRot, typeof o.tiltZ === 'number' ? o.tiltZ : 0);
    if (typeof onPhoto === 'function') onPhoto(grp, o, L, W);
    return grp;
  }
  if (o.type === 'tree') {
    const height = Math.max(4, o.height || 5), crown = Math.max(1.6, o.crown || 2);
    const grp = new THREE.Group();
    grp.position.set(o.pos[0], o.pos[1] || 0, o.pos[2]);
    grp.userData = { sp3: o };
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, height * 0.45, 12);
    trunkGeo.translate(0, height * 0.225, 0);
    const trunk = new THREE.Mesh(trunkGeo, standardMaterial('#6b4a2b', 'wood'));
    trunk.castShadow = true; trunk.receiveShadow = true;
    grp.add(trunk);
    const branchGeo = new THREE.CylinderGeometry(0.045, 0.07, Math.max(0.5, height * 0.2), 8);
    for (const side of [-1, 1]) {
      const branch = new THREE.Mesh(branchGeo, standardMaterial('#6b4a2b', 'wood'));
      branch.position.set(side * 0.18, height * 0.32, 0);
      branch.rotation.z = side * 0.65;
      branch.castShadow = true;
      grp.add(branch);
    }
    const crownGrp = new THREE.Group();
    crownGrp.position.y = height * 0.45;
    const tint = new THREE.Color(o.color || '#3f8f45');
    const hsl = {}; tint.getHSL(hsl);
    const makeMat = (delta) => {
      const c = new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + delta)));
      return standardMaterial('#' + c.getHexString(), 'plastic');
    };
    if (o.variant === 'conifer') {
      const low = new THREE.Mesh(new THREE.ConeGeometry(crown, crown * 1.25, 16), makeMat(-0.03));
      low.position.y = crown * 0.45;
      const high = new THREE.Mesh(new THREE.ConeGeometry(crown * 0.72, crown * 1.05, 16), makeMat(0.04));
      high.position.y = crown * 1.2;
      crownGrp.add(low, high);
    } else {
      const main = new THREE.Mesh(new THREE.SphereGeometry(crown, 16, 12), makeMat(0));
      const left = new THREE.Mesh(new THREE.SphereGeometry(crown * 0.8, 16, 12), makeMat(0.04));
      const right = new THREE.Mesh(new THREE.SphereGeometry(crown * 0.8, 16, 12), makeMat(-0.04));
      main.position.y = crown; left.position.set(-crown * 0.65, crown * 0.85, 0); right.position.set(crown * 0.65, crown * 0.85, 0);
      const extra = new THREE.Mesh(new THREE.SphereGeometry(crown * 0.68, 16, 12), makeMat(0.02));
      extra.position.set(0, crown * 1.35, crown * 0.35);
      crownGrp.add(main, left, right, extra);
    }
    crownGrp.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    const seed = Math.abs(Math.round((o.pos[0] || 0) * 1000) * 7919 + Math.round((o.pos[2] || 0) * 1000));
    grp.add(animateMesh(crownGrp, { sway: true, amp: 0.02, period: 2600 + seed % 900, phase: (seed % 628) / 100 }));
    return grp;
  }
  if (kind === 'flowerbed') {
    const r = o.radius || 1;
    const grp = new THREE.Group();
    grp.position.set(o.pos[0], o.pos[1] || 0, o.pos[2]);
    grp.userData = { sp3: o };
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.08, 32),
      standardMaterial('#4b3621', 'wood'));
    soil.position.y = 0.04;
    soil.receiveShadow = true;
    grp.add(soil);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, 0.09, 8, 32),
      standardMaterial('#8a8f98', 'default'));
    ring.rotation.x = HPI;
    ring.position.y = 0.08;
    ring.castShadow = true;
    grp.add(ring);
    const flowerCols = [o.color || '#e0457b', '#ffffff', '#f2c14e'];
    const seed = Math.abs(Math.round((o.pos[0] || 0) * 1000) * 7919 + Math.round((o.pos[2] || 0) * 1000));
    const random = mulberry32(seed);
    const count = 48;
    const stemGeo = new THREE.CylinderGeometry(0.008, 0.012, 0.22, 5);
    const headGeo = new THREE.SphereGeometry(0.045, 6, 5);
    const stems = new THREE.InstancedMesh(stemGeo, standardMaterial('#398044', 'plastic'), count);
    const heads = flowerCols.map((color) => new THREE.InstancedMesh(headGeo, standardMaterial(color, 'plastic'), Math.ceil(count / 3)));
    const dummy = new THREE.Object3D();
    const headIndexes = heads.map(() => 0);
    for (let i = 0; i < count; i++) {
      const a = random() * TAU, d = Math.sqrt(random()) * r * 0.78;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.15 + random() * 0.2;
      dummy.position.set(x, h / 2 + 0.08, z); dummy.scale.set(1, h / 0.22, 1); dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
      const headSlot = i % heads.length;
      const head = heads[headSlot];
      dummy.position.set(x, h + 0.08, z); dummy.scale.setScalar(0.7 + random() * 0.6); dummy.updateMatrix();
      head.setMatrixAt(headIndexes[headSlot]++, dummy.matrix);
    }
    heads.forEach((head, i) => { head.count = headIndexes[i]; head.position.y = 0; head.castShadow = true; grp.add(head); });
    stems.instanceMatrix.needsUpdate = true; stems.castShadow = true; grp.add(stems);
    return grp;
  }
  if (kind === 'water') {
    const geo = new THREE.CylinderGeometry(o.radius, o.radius, o.height || 0.016, 40);
    geo.translate(0, (o.height || 0.016) / 2, 0);
    const mat = new THREE.MeshStandardMaterial({ map: waterTexture(), color: '#75b9df', transparent: true, opacity: o.opacity == null ? 0.9 : o.opacity, roughness: 0.2, metalness: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(o.pos[0], o.pos[1] || 0, o.pos[2]);
    mesh.userData = { sp3: o };
    animateMesh(mesh, { ripple: true });
    return mesh;
  }
  if (kind === 'equipment' && !o.meta.part) {
    /* solid apparatus tier: rich 3D physical model instead of monolithic grey box */
    return buildEquipmentRig3D(o);
  }
  let geo = null, mat = null;
  if (o.type === 'plane') {
    geo = new THREE.PlaneGeometry(o.size[0], o.size[1]);
    geo.rotateX(-HPI);
    const tex = o.material && o.material.kind !== 'flat' ? surfaceTexture(o.material, L, W) : null;
    /* texture already carries the surface colorway — white albedo keeps spec hues true */
    mat = standardMaterial(tex ? '#ffffff' : (kind === 'site-ground' ? '#c9c5bd' : (o.color || '#3f9c55')), 'default', { map: tex || null });
  } else if (o.type === 'box') {
    geo = new THREE.BoxGeometry(o.size[0], o.size[1], o.size[2]);
    geo.translate(0, o.size[1] / 2, 0);       // pos = centre of base
    mat = standardMaterial(o.color || '#888888', kind === 'bench' ? 'wood' : 'default');
  } else if (o.type === 'cylinder') {
    if (kind === 'flowerbed' && o.radius <= 1.05) {
      geo = new THREE.SphereGeometry(o.radius, 20, 12, 0, TAU, 0, HPI);
      geo.scale(1, 0.35, 1);
    } else if (kind === 'pole' && o.meta && o.meta.part === 'lamp') {
      geo = new THREE.SphereGeometry(0.3, 16, 10);
    } else {
      geo = new THREE.CylinderGeometry(o.radius, o.radius, o.height, 20);
      if (o.dir === 'x') geo.rotateZ(HPI);
      else if (o.dir === 'z') geo.rotateX(HPI);
      else geo.translate(0, o.height / 2, 0);   // pos = base centre for dir 'y'
    }
    const postColor = kind === 'fence-post' ? '#374151' : (o.color || '#888888');
    mat = (o.meta && o.meta.mark)
      ? new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color || '#ffffff') })
      : standardMaterial(postColor, kind === 'pole' || isFenceKind(kind) ? 'steel' : 'default');
  } else if (o.type === 'torus') {
    geo = new THREE.TorusGeometry(o.radius, o.tube || 0.02, 8, 24);
    if (o.flat) geo.rotateX(HPI);
    mat = standardMaterial(o.color || '#e6702c', 'plastic');
  } else if (o.type === 'line') {
    const [p0, p1] = o.points;
    const dx = p1[0] - p0[0], dz = p1[2] - p0[2];
    const len = Math.hypot(dx, dz);
    if (!(len > 1e-6)) return null;
    geo = new THREE.BoxGeometry(len + o.width, 0.02, o.width);
    geo.translate(0, 0.01, 0);
    mat = standardMaterial('#fafafa', 'default', { emissive: new THREE.Color('#fafafa'), emissiveIntensity: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = -Math.atan2(dz, dx);
    mesh.position.set((p0[0] + p1[0]) / 2, p0[1], (p0[2] + p1[2]) / 2);
    mesh.userData = { sp3: o };
    return mesh;
  } else if (o.type === 'arc') {
    const r0 = o.radius - o.width / 2, r1 = o.radius + o.width / 2;
    if (!(r1 > 0)) return null;
    /* model angle a: (x + r·cos a, z + r·sin a); after rotateX(-PI/2) a ring
       point (r·cos t, r·sin t) lands on z = −r·sin t → t = −a          */
    geo = new THREE.RingGeometry(Math.max(0.001, r0), r1, 48, 1, -o.a1, o.a1 - o.a0);
    geo.rotateX(-HPI);
    mat = standardMaterial(o.color || '#ffffff', 'default');
  } else if (o.type === 'net-panel') {
    geo = new THREE.PlaneGeometry(o.size[0], o.size[1]);
    if (o.axis === 'z') geo.rotateY(HPI);
    geo.translate(0, o.size[1] / 2, 0);       // pos = centre of base edge
    const chain = kind === 'fence';
    const diag = chain || isFenceKind(kind);
    const grid = gridTexture(diag ? 'diag' : 'ortho').clone(); // own repeat per panel
    grid.needsUpdate = true;
    mat = new THREE.MeshStandardMaterial({
      color: chain ? '#6b7280' : new THREE.Color(o.color || '#dfe6ee'),
      alphaMap: grid, alphaTest: chain ? 0.5 : 0, transparent: false, opacity: 1,
      side: THREE.DoubleSide, depthWrite: true, roughness: chain ? 0.5 : (isFenceKind(kind) ? 0.35 : 0.65),
      metalness: chain ? 0.4 : (isFenceKind(kind) ? 0.6 : 0.05),
      emissive: chain ? new THREE.Color('#475569') : undefined,
      emissiveIntensity: chain ? 0.08 : 0
    });
    const repeatUnit = chain ? 0.6 : 0.4;
    mat.alphaMap.repeat.set(o.size[0] / repeatUnit, o.size[1] / repeatUnit);
    if (chain) mat.alphaMap.anisotropy = _maxAniso;
  } else {
    return null;
  }
  if (!geo || !mat) return null;
  if (o.opacity != null && o.opacity < 1 && kind !== 'fence') { mat.transparent = true; mat.opacity = o.opacity; }
  if (kind === 'halo') { mat.transparent = true; mat.opacity = o.opacity != null ? o.opacity : 0.16; mat.depthWrite = false; }
  if (kind === 'equipment' && o.meta && o.meta.part === 'base') {
    /* base plate is an invisible hit handle for drag interaction — zero grey box rendering */
    mat.transparent = true; mat.opacity = 0; mat.depthWrite = false;
  }
  if (o.meta && o.meta.part === 'lamp') {
    /* luminaire head: barely self-lit so poles read as floodlights in daylight too */
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f6e7b0'),
      emissive: new THREE.Color('#ffe4a0'),
      emissiveIntensity: 0.65, roughness: 0.35
    });
  }
  if (kind === 'roof') { mat.transparent = true; mat.opacity = o.opacity != null ? o.opacity : 0.3; mat.side = THREE.DoubleSide; mat.depthWrite = false; }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { sp3: o };
  const fenceCaster = kind === 'fence-post' || kind === 'pole';
  mesh.castShadow = !isMark && kind !== 'dim-line' && kind !== 'halo' && kind !== 'field' && kind !== 'apron' &&
    (!isFenceKind(kind) || fenceCaster);
  mesh.receiveShadow = kind === 'site-ground' || kind === 'field' || kind === 'apron' || kind === 'path' ||
    kind === 'plaza' || kind === 'pad' || kind === 'water' || kind === 'site-ground';
  if (o.meta && o.meta.part === 'lamp') {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10),
      new THREE.MeshStandardMaterial({
        color: '#f6e7b0', emissive: '#fff1c2', emissiveIntensity: 0.8,
        roughness: 0.3, metalness: 0.05
      }));
    head.position.y = 0.04;
    head.castShadow = false;
    head.userData = { sp3: o, lampHead: true };
    mesh.add(head);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: '#fff1c2', transparent: true, opacity: 0.72,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.set(0.9, 0.9, 1);
    glow.position.y = 0.06;
    glow.userData = { sp3: o, lampGlow: true };
    mesh.add(glow);
  }
  if (isFenceKind(kind) && o.type === 'net-panel') {
    const panelMat = new THREE.MeshStandardMaterial({
      color: '#8e99a6', transparent: true, opacity: 0.22,
      depthWrite: false, side: THREE.DoubleSide, roughness: 0.82, metalness: 0.04
    });
    const panelGeo = new THREE.PlaneGeometry(o.size[0], o.size[1]);
    panelGeo.translate(0, o.size[1] / 2, 0);
    const panel = new THREE.Mesh(panelGeo, panelMat);
    if (o.axis === 'z') panel.rotation.y = HPI;
    panel.position.set(o.axis === 'z' ? 0.005 : 0, 0, o.axis === 'x' ? 0.005 : 0);
    panel.userData = { sp3: o, fenceFill: true };
    panel.castShadow = false;
    panel.receiveShadow = false;
    mesh.add(panel);
    const railW = Math.max(0.2, o.size[0] || 1);
    const railH = Math.max(0.4, o.size[1] || 1);
    const railMat = new THREE.MeshStandardMaterial({
      color: '#374151', emissive: '#64748b', emissiveIntensity: 0.08, roughness: 0.35, metalness: 0.6
    });
    for (const y of [railH * 0.5, railH * 0.98]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, railW, 10), railMat);
      if (o.axis === 'z') rail.rotation.x = HPI;
      else rail.rotation.z = HPI;
      rail.position.y = y;
      rail.castShadow = false;
      rail.userData = { sp3: o, fenceRail: true };
      mesh.add(rail);
    }
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(railW, 0.35), new THREE.MeshBasicMaterial({
      map: surroundContactTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide
    }));
    contact.rotation.x = -HPI;
    contact.position.y = 0.006;
    contact.userData = { sp3: o, contactStrip: true };
    mesh.add(contact);
  }
  if (isFenceKind(kind) && o.type === 'cylinder' && (o.radius || 0) <= 0.1) {
    const postH = Math.max(0.1, o.height || 1);
    const capR = Math.max(0.025, (o.radius || 0.04) * 0.9);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(capR, capR, 0.035, 12),
      standardMaterial('#374151', 'steel'));
    cap.position.y = postH + 0.018;
    cap.castShadow = false;
    cap.userData = { sp3: o, fenceCap: true };
    mesh.add(cap);
    const footing = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.25), standardMaterial('#b8b4aa', 'default'));
    footing.position.y = 0.075;
    footing.castShadow = true; footing.receiveShadow = true;
    footing.userData = { sp3: o, fenceFooting: true };
    mesh.add(footing);
  }
  if (kind === 'pad' && o.type === 'box') {
    const curbMat = standardMaterial('#6f7780', 'steel');
    const curbH = 0.15;
    const curbT = 0.06;
    const [cw, , cd] = o.size;
    for (const [x, z, w, d] of [[0, -cd / 2, cw, curbT], [0, cd / 2, cw, curbT],
      [-cw / 2, 0, curbT, cd], [cw / 2, 0, curbT, cd]]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(w, curbH, d), curbMat);
      curb.position.set(x, curbH / 2, z);
      curb.castShadow = true; curb.receiveShadow = true; curb.userData = { sp3: o };
      mesh.add(curb);
    }
  }
  if (kind === 'water' && o.type === 'cylinder' && o.radius) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(o.radius * 0.96, 0.12, 8, 32),
      standardMaterial('#8a8f98', 'default'));
    rim.rotation.x = HPI;
    rim.position.y = 0.025;
    rim.castShadow = true; rim.receiveShadow = true; rim.userData = { sp3: o };
    mesh.add(rim);
  }
  if (kind === 'equipment') {
    const grp = new THREE.Group();
    grp.userData = { unitGroup: true, sp3: o };
    grp.rotation.order = 'YXZ';
    mesh.position.set(0, 0, 0);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(0, 0, 0);
    grp.add(mesh);
    const fp = (o.meta && o.meta.fp) || { w: o.size[0], d: o.size[2] };
    const sh = contactShadow(fp.w || o.size[0], fp.d || o.size[2]);
    sh.position.set(0, -(o.pos[1] || 0) + 0.008, 0);
    sh.rotation.order = 'YXZ';
    sh.rotation.set(-(o.tiltX || 0), 0, -(o.tiltZ || 0));
    grp.add(sh);
    grp.position.set(o.pos[0], o.pos[1] || 0, o.pos[2]);
    grp.rotation.set(typeof o.tiltX === 'number' ? o.tiltX : 0, typeof o.rotY === 'number' ? o.rotY : 0, typeof o.tiltZ === 'number' ? o.tiltZ : 0);
    return grp;
  }
  mesh.position.set(o.pos[0], o.pos[1] || 0, o.pos[2]);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.set(typeof o.tiltX === 'number' ? o.tiltX : 0, typeof o.rotY === 'number' ? o.rotY : 0, typeof o.tiltZ === 'number' ? o.tiltZ : 0);
  if (kind === 'field' && o.type === 'plane' && o.size) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(o.size[0], 0.14, o.size[1]), standardMaterial('#b8b4aa', 'default'));
    slab.position.y = -0.09;
    slab.castShadow = false; slab.receiveShadow = false; slab.userData = { sp3: o, slab: true };
    mesh.add(slab);
    const kerbMat = standardMaterial('#b8b4aa', 'default');
    const kerb = 0.055;
    const edge = 0.05;
    for (const [x, z, w, d] of [[0, -o.size[1] / 2, o.size[0], kerb], [0, o.size[1] / 2, o.size[0], kerb],
      [-o.size[0] / 2, 0, kerb, o.size[1]], [o.size[0] / 2, 0, kerb, o.size[1]]]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(w, edge, d), kerbMat);
      line.position.set(x, edge / 2, z);
      line.castShadow = true; line.receiveShadow = true; line.userData = { sp3: o, kerb: true };
      mesh.add(line);
    }
  }
  return mesh;
}

/* ═══════════════════════════════════════════════════════════════════ */

function mount(el, config, opts) {
  if (!el) return null;
  if (el.__sp3d && el.__sp3d.destroy) el.__sp3d.destroy();
  const onPinDrop = opts && typeof opts.onPinDrop === 'function' ? opts.onPinDrop : null;
  const onUnpin = opts && typeof opts.onUnpin === 'function' ? opts.onUnpin : null;
  const onContextLostCallback = opts && typeof opts.onContextLost === 'function' ? opts.onContextLost : null;

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (_) { return null; }
  if (!renderer) return null;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.78;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);                 // transparent: app theme shows through
  _maxAniso = renderer.capabilities.getMaxAnisotropy();
  if (typeof window !== 'undefined' && window.devicePixelRatio) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#e4edf3', 70, 320);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(
    new THREE.SphereGeometry(80, 24, 12),
    new THREE.MeshBasicMaterial({ color: '#7fa6cf', side: THREE.BackSide })
  );
  envScene.add(envSky);
  const envGround = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshBasicMaterial({ color: '#4b5546' })
  );
  envGround.rotation.x = -HPI;
  envScene.add(envGround);
  const envSun = new THREE.Mesh(
    new THREE.SphereGeometry(8, 12, 8),
    new THREE.MeshStandardMaterial({ color: '#fff8df', emissive: '#fff4cc', emissiveIntensity: 1.2, roughness: 0.25 })
  );
  envSun.position.set(-25, 35, 18);
  envScene.add(envSun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(envScene);
  scene.environment = envTarget.texture;
  pmrem.dispose();
  const skyGeo = new THREE.SphereGeometry(600, 32, 16);
  const skyColors = [], skyDay = [], skyNight = [];
  const skyPos = skyGeo.attributes.position;
  for (let i = 0; i < skyPos.count; i++) {
    const y = THREE.MathUtils.clamp(skyPos.getY(i) / 600, -1, 1);
    const t = THREE.MathUtils.clamp((y + 0.05) / 1.05, 0, 1);
    const horizon = new THREE.Color('#dfe7ee');
    const day = horizon.clone().lerp(new THREE.Color('#f3f7fb'), Math.min(1, t * 1.8)).lerp(new THREE.Color('#cfe6ff'), Math.max(0, t - 0.25));
    const night = new THREE.Color('#0b1220').lerp(new THREE.Color('#020617'), t);
    skyColors.push(day.r, day.g, day.b);
    skyDay.push(day.r, day.g, day.b);
    skyNight.push(night.r, night.g, night.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xf8fafc, 0x5b5648, 0.38);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff7ed, 0.95);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 300;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.06;
  sun.shadow.radius = 3;
  sun.position.set(32, 30, 14);
  scene.add(sun);
  scene.add(sun.target);
  const fillLight = new THREE.DirectionalLight(0xe2e8f0, 0.2);
  fillLight.position.set(-25, 30, -20);
  scene.add(fillLight);
  scene.add(fillLight.target);
  const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.12);
  rimLight.position.set(-22, 24, -28);
  rimLight.castShadow = false;
  scene.add(rimLight);

  const environment = new THREE.Group();
  environment.name = 'sports-environment';
  scene.add(environment);
  const groundMat = new THREE.MeshStandardMaterial({
    color: '#ffffff', map: siteGroundTexture(), roughness: 0.95, metalness: 0
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  ground.rotation.x = -HPI; ground.position.y = -0.12;
  ground.receiveShadow = true; environment.add(ground);
  const apronMat = new THREE.MeshStandardMaterial({
    color: '#ffffff', map: apronTexture(), roughness: 0.9, metalness: 0
  });
  const apronParts = [];
  const apronGroup = new THREE.Group();
  apronGroup.name = 'sports-apron';
  environment.add(apronGroup);
  let surroundGroup = null;
  const surroundNight = [];
  let surroundGroundTint = new THREE.Color('#ffffff');
  const surroundKinds = new Set(['field', 'village', 'suburb', 'city']);
  function surroundSeed(kind, L, W) {
    const text = kind + Math.round(L * 10) + Math.round(W * 10);
    let seed = 2166136261;
    for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
    return seed >>> 0;
  }
  function surroundMesh(root, geo, mat, x, y, z, cast = true) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    const d = Math.hypot(x, z);
    mesh.castShadow = cast && d < 35;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }
  function surroundMat(color, options = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02, ...options });
  }
  function surroundContact(root, w, x, z, ry = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.35), new THREE.MeshBasicMaterial({
      map: surroundContactTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide
    }));
    mesh.rotation.set(-HPI, ry, 0); mesh.position.set(x, 0.006, z); root.add(mesh);
  }
  function isInsideCourt(x, z, L, W, margin = 3) {
    return Math.abs(x) < L / 2 + 4 + margin && Math.abs(z) < W / 2 + 4 + margin;
  }
  function keepOut(x, z, L, W, margin = 3) {
    if (!isInsideCourt(x, z, L, W, margin)) return [x, z];
    const edgeX = L / 2 + 4 + margin;
    const edgeZ = W / 2 + 4 + margin;
    const remainingX = edgeX - Math.abs(x);
    const remainingZ = edgeZ - Math.abs(z);
    if (remainingX < remainingZ && x !== 0) return [x < 0 ? -edgeX : edgeX, z];
    return [x, z < 0 ? -edgeZ : edgeZ];
  }
  function addSurroundBuilding(root, x, z, w, d, h, bodyColor, roofColor, windows = true) {
    const wallMat = surroundMat(bodyColor);
    const body = surroundMesh(root, new THREE.BoxGeometry(w, h, d), wallMat, x, h / 2, z);
    body.userData.surroundBuilding = true;
    const pitch = h > 7 ? 0 : (h < 3.5 ? 35 : 30);
    if (pitch) {
      const roofW = w + 0.5;
      const roofH = (roofW / 2) * Math.tan(pitch * Math.PI / 180);
      const shape = new THREE.Shape();
      shape.moveTo(-roofW / 2, 0);
      shape.lineTo(0, roofH);
      shape.lineTo(roofW / 2, 0);
      shape.closePath();
      const roofDepth = d + 0.45;
      const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: roofDepth, bevelEnabled: false });
      roofGeo.translate(0, 0, -roofDepth / 2);
      const roof = surroundMesh(root, roofGeo, surroundMat(roofColor, { roughness: 0.7 }), x, h, z, true);
      roof.userData.surroundRoof = true;
      for (const side of [-1, 1]) {
        const gable = new THREE.Mesh(new THREE.ShapeGeometry(shape), wallMat);
        gable.position.set(x, h, z + side * (d / 2 + 0.012));
        gable.scale.z = side;
        gable.castShadow = true;
        gable.receiveShadow = true;
        root.add(gable);
      }
      surroundMesh(root, new THREE.BoxGeometry(0.16, 0.65, 0.16), surroundMat('#6b4b3b'), x + w * 0.25, h + 0.3, z, true);
    } else {
      const parapet = surroundMesh(root, new THREE.BoxGeometry(w + 0.18, 0.28, d + 0.18), surroundMat(roofColor, { roughness: 0.7 }), x, h + 0.14, z, true);
      parapet.userData.surroundParapet = true;
      surroundMesh(root, new THREE.BoxGeometry(w * 0.22, 0.34, d * 0.22), surroundMat('#59616a'), x - w * 0.25, h + 0.45, z, true);
      surroundMesh(root, new THREE.BoxGeometry(w * 0.18, 0.3, d * 0.18), surroundMat('#59616a'), x + w * 0.22, h + 0.43, z, true);
      surroundMesh(root, new THREE.BoxGeometry(w + 0.12, 0.22, d + 0.12), surroundMat('#77716a'), x, 0.11, z, true);
    }
    if (windows) {
      const facade = surroundWindowTexture(h > 7 ? 'city' : 'suburb');
      const wallPanels = [
        [w, 0.035, x, h * 0.54, z - d / 2 - 0.021, 0],
        [w, 0.035, x, h * 0.54, z + d / 2 + 0.021, 0],
        [d, 0.035, x - w / 2 - 0.021, h * 0.54, z, HPI],
        [d, 0.035, x + w / 2 + 0.021, h * 0.54, z, HPI]
      ];
      wallPanels.forEach(([pw, pd, px, py, pz, ry]) => {
        const winMat = new THREE.MeshStandardMaterial({
          map: facade, emissiveMap: facade, emissive: new THREE.Color('#ffd9a0'),
          emissiveIntensity: 0, roughness: 0.48, metalness: 0.05
        });
        surroundNight.push({ material: winMat, type: 'window' });
        const win = surroundMesh(root, new THREE.BoxGeometry(pw * 0.86, h * 0.72, pd), winMat, px, py, pz, false);
        win.rotation.y = ry;
        win.material.map.repeat.set(Math.max(1, pw / 4), Math.max(1, h / 3));
        win.material.emissiveMap.repeat.copy(win.material.map.repeat);
        win.userData.surroundWindow = true;
      });
    }
    surroundContact(root, w, x, z - d / 2);
    return body;
  }
  function addLamp(root, x, z) {
    const poleMat = surroundMat('#374151', { metalness: 0.65, roughness: 0.4 });
    surroundMesh(root, new THREE.CylinderGeometry(0.035, 0.05, 3.4, 8), poleMat, x, 1.7, z, true);
    const headMat = new THREE.MeshStandardMaterial({
      color: '#f6e7b0', emissive: new THREE.Color('#ffe9b8'), emissiveIntensity: 0, roughness: 0.3
    });
    surroundNight.push({ material: headMat, type: 'lamp' });
    surroundMesh(root, new THREE.SphereGeometry(0.14, 10, 8), headMat, x, 3.42, z, true);
  }
  function addCar(root, x, z, rot = 0, rnd = Math.random) {
    const palette = ['#c8ccd1', '#2b2f36', '#e8e9ea', '#7a1f2b', '#2c4a7a', '#5a6b58'];
    const color = palette[Math.floor(rnd() * palette.length)];
    const bodyMat = surroundMat(color, { roughness: 0.58 });
    const car = new THREE.Group();
    car.name = 'street-car';
    car.userData.surroundCar = true;
    car.position.set(x, 0, z);
    car.rotation.y = rot;
    root.add(car);

    surroundMesh(car, new THREE.BoxGeometry(4.4, 0.55, 1.8), bodyMat, 0, 0.55, 0, true);
    surroundMesh(car, new THREE.BoxGeometry(4.4, 0.12, 1.84), surroundMat('#30353b', { roughness: 0.72 }), 0, 0.32, 0, true);
    for (const bx of [-2.2, 2.2]) {
      surroundMesh(car, new THREE.BoxGeometry(0.12, 0.3, 1.7), surroundMat('#23272d', { roughness: 0.7 }), bx, 0.5, 0, true);
    }

    const cabinShape = new THREE.Shape();
    cabinShape.moveTo(-1.7, 0);
    cabinShape.lineTo(-1.15, 0.62);
    cabinShape.lineTo(0.95, 0.62);
    cabinShape.lineTo(1.55, 0);
    cabinShape.closePath();
    const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, { depth: 1.62, bevelEnabled: false });
    cabinGeo.translate(0, 0, -0.81);
    const glass = surroundMesh(car, cabinGeo, surroundMat('#1f2a36', { roughness: 0.15, metalness: 0.6 }), 0, 0.83, 0, false);
    glass.receiveShadow = false;
    surroundMesh(car, new THREE.BoxGeometry(2.05, 0.05, 1.6), bodyMat, -0.05, 1.45, 0, true);

    const wheelMat = surroundMat('#1b1e22', { roughness: 0.95 });
    const hubMat = surroundMat('#9aa1a8', { roughness: 0.48, metalness: 0.45 });
    for (const wx of [-1.45, 1.45]) for (const wz of [-0.85, 0.85]) {
      const wheel = surroundMesh(car, new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12), wheelMat, wx, 0.33, wz, true);
      wheel.rotation.z = HPI;
      const hub = surroundMesh(car, new THREE.CylinderGeometry(0.18, 0.18, 0.26, 12), hubMat, wx, 0.33, wz, true);
      hub.rotation.z = HPI;
    }

    const headMat = new THREE.MeshStandardMaterial({
      color: '#fff6d5', emissive: new THREE.Color('#fff1c2'), emissiveIntensity: 0,
      roughness: 0.3, metalness: 0.05
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: '#7a1220', emissive: new THREE.Color('#ff3b3b'), emissiveIntensity: 0,
      roughness: 0.36, metalness: 0.02
    });
    for (const wz of [-0.6, 0.6]) {
      const head = surroundMesh(car, new THREE.BoxGeometry(0.05, 0.12, 0.35), headMat, 2.2, 0.72, wz, false);
      head.receiveShadow = false;
      const tail = surroundMesh(car, new THREE.BoxGeometry(0.05, 0.12, 0.35), tailMat, -2.2, 0.72, wz, false);
      tail.receiveShadow = false;
    }
    surroundNight.push({ material: headMat, type: 'lamp' }, { material: tailMat, type: 'lamp' });

    const contact = surroundMesh(car, new THREE.PlaneGeometry(4.6, 2), new THREE.MeshBasicMaterial({
      map: surroundContactTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide
    }), 0, 0.006, 0, false);
    contact.rotation.x = -HPI;
    contact.castShadow = false;
    return car;
  }
  function addHills(root, rnd) {
    for (let i = 0; i < 4; i++) {
      const x = (rnd() < 0.5 ? -1 : 1) * (150 + rnd() * 150);
      const z = -140 - rnd() * 120;
      const hill = surroundMesh(root, new THREE.SphereGeometry(70 + rnd() * 50, 16, 8), surroundMat(i % 2 ? '#9db08c' : '#7f9a6a'), x, -45, z, false);
      hill.scale.y = 0.22; hill.castShadow = false; hill.receiveShadow = false;
    }
  }
  function addTreeline(root, rnd, count = 18, radius = 58, L, W) {
    const clearX = L / 2 + 4, clearZ = W / 2 + 4;
    radius = Math.max(radius, Math.hypot(clearX, clearZ) + 8);
    for (let i = 0; i < count; i++) {
      const a = rnd() * TAU, d = radius + rnd() * 18;
      const tree = makeTree(3.6 + rnd() * 2.5, 0.9 + rnd() * 0.5, i % 4 === 0 ? 'conifer' : 'round', '#477348');
      const [x, z] = keepOut(Math.cos(a) * d, Math.sin(a) * d - 45, L, W);
      tree.position.set(x, 0, z);
      tree.traverse((o) => { if (o.isMesh) { o.castShadow = d < 35; o.receiveShadow = true; } });
      root.add(tree);
    }
  }
  function buildSurroundings(kind, L, W) {
    const root = new THREE.Group();
    root.name = 'SURROUND';
    root.userData.surroundKind = kind;
    const rnd = mulberry32(surroundSeed(kind, L, W));
    const clearX = L / 2 + 4, clearZ = W / 2 + 4;
    const sidewalkMat = surroundMat('#d3d0c8');
    const roadMat = surroundMat('#42484d', { roughness: 0.95, map: surroundRoadTexture() });
    const grassMat = surroundMat(kind === 'city' ? '#b9b7b0' : kind === 'field' ? '#dfe9d2' : '#6f9954');
    if (kind === 'city') surroundGroundTint.set('#b9b7b0');
    else if (kind === 'field') surroundGroundTint.set('#dfe9d2');
    else surroundGroundTint.set('#ffffff');
    if (kind === 'suburb' || kind === 'city') {
      surroundMesh(root, new THREE.BoxGeometry(L + 2 * clearX + 4, 0.08, 2), sidewalkMat, 0, -0.02, -clearZ - 1);
      surroundMesh(root, new THREE.BoxGeometry(L + 2 * clearX + 4, 0.08, 2), sidewalkMat, 0, -0.02, clearZ + 1);
      surroundMesh(root, new THREE.BoxGeometry(L + 2 * clearX + 10, 0.06, 6), roadMat, 0, -0.07, -clearZ - 5);
      surroundMesh(root, new THREE.BoxGeometry(L + 2 * clearX + 10, 0.06, 6), roadMat, 0, -0.07, clearZ + 5);
      if (kind === 'city') {
        surroundMesh(root, new THREE.BoxGeometry(2, 0.08, W + 2 * clearZ), sidewalkMat, clearX + 1, -0.02, 0);
        surroundMesh(root, new THREE.BoxGeometry(6, 0.06, W + 2 * clearZ + 10), roadMat, clearX + 5, -0.07, 0);
      }
      const houseCols = ['#e8dfd0', '#d9cdb8', '#cbb9a3'];
      for (let i = -2; i <= 2; i++) {
        addSurroundBuilding(root, i * 11, clearZ + 16, 8.5, 5.5, 4.8, houseCols[(i + 1) % 3], '#7a4a3a');
      }
      for (let i = -2; i <= 2; i++) addLamp(root, i * 10, clearZ + 2.2);
      for (let i = 0; i < 4; i++) addCar(root, -9 + i * 6, clearZ + 3.4, 0, rnd);
      for (const x of [-6, 4]) addCar(root, x, -clearZ - 3.4, Math.PI, rnd);
      for (let i = -2; i <= 2; i++) {
        const tree = makeTree(4.2, 1.05, 'round', '#4f8a45');
        tree.position.set(i * 9, 0, -clearZ - 1);
        root.add(tree);
      }
      if (kind === 'city') {
        for (let i = 0; i < 3; i++) addCar(root, clearX + 3.4, -10 + i * 7, HPI, rnd);
        for (let i = -2; i <= 2; i++) addSurroundBuilding(root, i * 17, clearZ + 25, 12, 8, 10 + (i + 2) * 1.7, ['#a8adb2', '#d2c4ae', '#9b5f4b'][i % 3], '#565b65');
        const [towerX1, towerZ1] = keepOut(34, 68, L, W);
        const [towerX2, towerZ2] = keepOut(-30, 76, L, W);
        addSurroundBuilding(root, towerX1, towerZ1, 16, 11, 25, '#8f969c', '#454c56');
        addSurroundBuilding(root, towerX2, towerZ2, 16, 11, 31, '#b0a99c', '#454c56');
        for (let i = 0; i < 6; i++) addLamp(root, -clearX - 3, -12 + i * 5);
        for (let i = 0; i < 8; i++) surroundMesh(root, new THREE.CylinderGeometry(0.08, 0.08, 0.7, 8), surroundMat('#303840'), -clearX - 2, 0.35, -12 + i * 4, true);
        surroundMesh(root, new THREE.BoxGeometry(2.8, 2.5, 1.5), surroundMat('#d39b58'), clearX + 8, 1.25, 8, true);
      }
      addTreeline(root, rnd, kind === 'city' ? 14 : 18, 55, L, W);
    } else if (kind === 'village') {
      surroundMesh(root, new THREE.BoxGeometry(4, 0.08, 110), roadMat, -(clearX + 16), -0.07, 0);
      surroundMesh(root, new THREE.BoxGeometry(1.2, 0.08, 110), surroundMat('#b9a688'), -(clearX + 13.4), -0.03, 0);
      surroundMesh(root, new THREE.BoxGeometry(1.2, 0.08, 110), surroundMat('#b9a688'), -(clearX + 18.6), -0.03, 0);
      for (let i = -3; i <= 3; i++) {
        const [houseX, houseZ] = keepOut(-30 + (i % 2) * 4, clearZ + 16 + i * 8, L, W);
        addSurroundBuilding(root, houseX, houseZ, 7, 5, 2.9, '#dbc7a4', i % 2 ? '#7a4a3a' : '#8c4a32', false);
      }
      for (let i = -3; i <= 3; i++) {
        const tree = makeTree(2.6 + rnd(), 0.7, 'round', '#65934d');
        tree.position.set(-clearX - 3, 0, i * 12 + 3); root.add(tree);
      }
      for (const z of [-8, 8]) {
        surroundMesh(root, new THREE.CylinderGeometry(0.08, 0.1, 0.9, 8), surroundMat('#7c5b3c'), -clearX - 4, 0.45, z, true);
        surroundMesh(root, new THREE.CylinderGeometry(0.06, 0.06, 4, 8), surroundMat('#7c5b3c'), -clearX - 4, 0.62, z + 2, true);
      }
      const [churchX, churchZ] = keepOut(45, 48, L, W);
      surroundMesh(root, new THREE.BoxGeometry(3, 6, 3), surroundMat('#c8b89f'), churchX, 3, churchZ, true);
      surroundMesh(root, new THREE.ConeGeometry(2.4, 2.5, 4), surroundMat('#8c4a32'), churchX, 7.25, churchZ, true);
      for (let i = 0; i < 2; i++) {
        const [baleX, baleZ] = keepOut(-clearX - 2 + i * 1.4, 26, L, W);
        const bale = surroundMesh(root, new THREE.CylinderGeometry(0.55, 0.55, 1.1, 12), surroundMat('#c59d52'), baleX, 0.55, baleZ, true);
        bale.rotation.z = HPI;
      }
      addHills(root, rnd); addTreeline(root, rnd, 20, 72, L, W);
    } else {
      surroundMesh(root, new THREE.BoxGeometry(4, 0.08, 14), surroundMat('#a89578'), 0, -0.07, clearZ + 7);
      for (let side of [-1, 1]) {
        const z = side * (W / 2 + 12);
        for (let i = -4; i <= 4; i++) {
          surroundMesh(root, new THREE.CylinderGeometry(0.08, 0.11, 1.2, 8), surroundMat('#765638'), i * 10, 0.6, z, true);
          surroundMesh(root, new THREE.BoxGeometry(10, 0.08, 0.08), surroundMat('#765638'), i * 10, 0.7, z, true);
        }
      }
      for (let i = 0; i < 24; i++) {
        const a = rnd() * TAU;
        const d = Math.max(25, Math.hypot(clearX, clearZ) + 4) + rnd() * 45;
        const tree = makeTree(3.8 + rnd() * 2.2, 0.8 + rnd() * 0.55, i % 5 === 0 ? 'conifer' : 'round', '#4f8748');
        const [x, z] = keepOut(Math.cos(a) * d, Math.sin(a) * d, L, W);
        tree.position.set(x, 0, z); root.add(tree);
      }
      for (let i = 0; i < 3; i++) {
        const [baleX, baleZ] = keepOut(-22 + i * 2, 18, L, W);
        const bale = surroundMesh(root, new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12), surroundMat('#c59d52'), baleX, 0.6, baleZ, true);
        bale.rotation.z = HPI;
      }
      const [barnX, barnZ] = keepOut(45, 60, L, W);
      addSurroundBuilding(root, barnX, barnZ, 10, 7, 4.2, '#c5a97f', '#704b37', false);
      addHills(root, rnd); addTreeline(root, rnd, 24, 72, L, W);
    }
    return root;
  }
  function updateEnvironment(L, W) {
    while (apronGroup.children.length) {
      const part = apronGroup.children.pop();
      part.geometry.dispose();
    }
    const gap = 2.5;
    const parts = [
      [L + gap * 2, 0.04, gap, 0, 0, -(W + gap) / 2],
      [L + gap * 2, 0.04, gap, 0, 0, (W + gap) / 2],
      [gap, 0.04, W, -(L + gap) / 2, 0, 0],
      [gap, 0.04, W, (L + gap) / 2, 0, 0]
    ];
    parts.forEach(([sx, sy, sz, x, y, z]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.10, sz), apronMat);
      const sy2 = 0.10;
      mesh.position.set(x, y - sy2 / 2 - 0.03, z); mesh.receiveShadow = true; apronGroup.add(mesh);
    });
    if (surroundGroup) {
      environment.remove(surroundGroup);
      isolateMaterials(surroundGroup);
      queueFade(surroundGroup, false);
      pendingDispose.push(surroundGroup);
    }
    surroundGroup = buildSurroundings(surroundKinds.has(state.surround) ? state.surround : 'suburb', L, W);
    environment.add(surroundGroup);
    collectFade(surroundGroup, true);
  }

  /* content group (mesh objects) + separate dim overlay + shadow ground */
  let group = new THREE.Group();
  group.name = 'sports-scene';
  let buildTarget = group;
  const PROPS = new THREE.Group();
  PROPS.name = 'sports-props';
  const FX = new THREE.Group();
  FX.name = 'sports-fx';
  const dimsGroup = new THREE.Group();
  dimsGroup.name = 'sports-dims';
  dimsGroup.visible = false;
  scene.add(group, PROPS, FX, dimsGroup);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 2000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.45;

  /* ── visible selection gizmo ── */
  const selectRingGroup = new THREE.Group();
  selectRingGroup.name = 'sports-gizmo';
  selectRingGroup.visible = false;
  const gizmo = selectRingGroup;
  const gizmoGround = new THREE.Group();
  gizmoGround.userData.gizmo = null;
  gizmo.add(gizmoGround);
  const gizmoMaterials = [];
  const gizmoMat = (color, opacity = 0.9) => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), side: THREE.DoubleSide, transparent: true,
      opacity, depthTest: false
    });
    gizmoMaterials.push({ material: m, color: new THREE.Color(color) });
    return m;
  };
  const markGizmo = (obj, mode) => {
    obj.renderOrder = 999;
    obj.userData = { ...(obj.userData || {}), gizmo: mode };
    obj.traverse?.((child) => {
      child.renderOrder = 999;
      child.userData = { ...(child.userData || {}), gizmo: mode };
    });
    return obj;
  };
  const makeArrow = (axis, sign, color, mode) => {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), gizmoMat(color));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 12), gizmoMat(color));
    const offset = 0.75 * sign;
    if (axis === 'x') {
      shaft.rotation.z = HPI;
      cone.rotation.z = sign > 0 ? -HPI : HPI;
      shaft.position.x = 0.45 * sign;
      cone.position.x = offset;
    } else {
      shaft.rotation.x = sign > 0 ? HPI : -HPI;
      cone.rotation.x = sign > 0 ? HPI : -HPI;
      shaft.position.z = 0.45 * sign;
      cone.position.z = offset;
    }
    g.add(shaft, cone);
    return markGizmo(g, mode);
  };
  const ringGeo = new THREE.RingGeometry(0.85, 0.95, 32);
  ringGeo.rotateX(-HPI);
  const ringMesh = markGizmo(new THREE.Mesh(ringGeo, gizmoMat('#38bdf8', 0.85)), 'rot');
  gizmo.add(ringMesh);
  const arrowCone = markGizmo(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 16), gizmoMat('#38bdf8')), 'rot');
  arrowCone.rotation.x = HPI;
  arrowCone.position.set(0, 0.02, 1.15);
  const arrowStem = markGizmo(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.4), gizmoMat('#38bdf8')), 'rot');
  arrowStem.position.set(0, 0.02, 0.8);
  gizmo.add(arrowCone, arrowStem);
  const worldHandles = new THREE.Group();
  worldHandles.rotation.order = 'YXZ';
  gizmo.add(worldHandles);
  worldHandles.add(makeArrow('x', -1, '#ef4444', 'move-x'), makeArrow('x', 1, '#ef4444', 'move-x'));
  worldHandles.add(makeArrow('z', -1, '#3b82f6', 'move-z'), makeArrow('z', 1, '#3b82f6', 'move-z'));
  const elevHandle = new THREE.Group();
  const elevShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 8), gizmoMat('#22c55e'));
  elevShaft.position.y = 0.65;
  const elevTop = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), gizmoMat('#22c55e'));
  elevTop.position.y = 1.3;
  elevHandle.add(elevShaft, elevTop);
  gizmo.add(markGizmo(elevHandle, 'elev'));
  const tiltXHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.03, 8, 24, Math.PI / 2),
    gizmoMat('#f59e0b')
  );
  tiltXHandle.rotation.y = HPI;
  tiltXHandle.position.z = 0.65;
  const tiltZHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.03, 8, 24, Math.PI / 2),
    gizmoMat('#f59e0b')
  );
  tiltZHandle.position.x = 0.65;
  gizmo.add(markGizmo(tiltXHandle, 'tilt-x'), markGizmo(tiltZHandle, 'tilt-z'));
  scene.add(gizmo);

  /* ── equipment drag-to-place state (active only with opts.onPinDrop) ── */
  const ray = new THREE.Raycaster();
  ray.camera = camera;                  // Sprite.raycast needs the camera, else it throws
  const ndc = new THREE.Vector2();
  const PIN_PAD = 3;                    // placement may exceed the field by 3 m
  let dragUnits = [];                   // per-unit drag records (see rebuild)
  let dragByUnit = new Map();
  let selectedUnit = null;
  let hoverUnit = null;
  let spaceHeld = false;
  const originalMaterials = new WeakMap();
  const drag = {
    on: false, started: false, unit: null, mode: 'move', ptr: null,
    startX: 0, startY: 0, startRot: 0, startElev: 0, startTiltX: 0, startTiltZ: 0,
    offX: 0, offZ: 0, startBaseX: 0, startBaseZ: 0, lastT: null,
    snap: { grid: true, rot: true }
  };
  const guides = new THREE.Group();
  guides.name = 'sports-guides';
  scene.add(guides);

  /* ── floating HUD transform widget ── */
  const hudEl = document.createElement('div');
  hudEl.className = 'sp3d-hud';
  hudEl.style.display = 'none';
  hudEl.innerHTML =
    '<span class="sp3d-hud-coords"></span>' +
    '<span class="sp3d-hud-snaps">' +
      '<button class="sp3d-hud-btn" data-act="snap-grid" title="' + tr('gridSnap') + '">▦</button>' +
      '<button class="sp3d-hud-btn" data-act="snap-rot" title="' + tr('rotSnap') + '">∠</button>' +
    '</span>';
  el.appendChild(hudEl);
  const propHintEl = document.createElement('div');
  propHintEl.className = 'sp3d-prop-hint';
  propHintEl.textContent = tr('propHint');
  propHintEl.style.cssText = 'display:none;position:absolute;left:50%;bottom:10px;transform:translateX(-50%);padding:4px 9px;border-radius:999px;background:rgba(10,14,20,0.72);color:#dbeafe;font:600 11px system-ui,sans-serif;pointer-events:none;z-index:4;';
  el.appendChild(propHintEl);

  hudEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.target.closest('button');
    if (!btn || !selectedUnit) return;
    const act = btn.dataset.act;
    const u = selectedUnit;
    if (act === 'snap-grid') {
      drag.snap.grid = !drag.snap.grid;
      updateHud(u);
      return;
    } else if (act === 'snap-rot') {
      drag.snap.rot = !drag.snap.rot;
      updateHud(u);
      return;
    }
  });

  function selectUnit(u) {
    if (selectedUnit && selectedUnit !== u) restoreHighlight(selectedUnit);
    selectedUnit = u;
    refreshHighlights();
    propHintEl.style.display = 'none';
    if (!u) {
      selectRingGroup.visible = false;
      hudEl.style.display = 'none';
      propHintEl.style.display = propRoots.length ? 'block' : 'none';
      return;
    }
    selectRingGroup.position.set(u.baseX, u.elev || 0, u.baseZ);
    selectRingGroup.rotation.y = u.rotY || 0;
    worldHandles.rotation.y = -(u.rotY || 0);
    selectRingGroup.visible = true;
    updateGroundRefs(u);
    updateContactShadows(u);
    updateHud(u);
    hudEl.style.display = 'block';
  }

  function deselect() {
    if (selectedUnit) restoreHighlight(selectedUnit);
    selectedUnit = null;
    refreshHighlights();
    selectRingGroup.visible = false;
    hudEl.style.display = 'none';
  }

  function updateHud(u) {
    if (!hudEl || !u) return;
      const coords = hudEl.querySelector('.sp3d-hud-coords');
    if (coords) {
      const l = state.config.dims && +state.config.dims.l, w = state.config.dims && +state.config.dims.w;
      const L = Number.isFinite(l) && l > 0 ? l : 20, W = Number.isFinite(w) && w > 0 ? w : 12;
      const hx = +(u.baseX + L / 2).toFixed(1);
      const vz = +(u.baseZ + W / 2).toFixed(1);
      const deg = Math.round(((u.rotY || 0) * 180 / Math.PI) % 360);
      const normDeg = deg < 0 ? deg + 360 : deg;
      const tiltDeg = Math.round(((u.tiltX || 0) * 180 / Math.PI));
      const tiltZDeg = Math.round(((u.tiltZ || 0) * 180 / Math.PI));
      const alt = (+(u.elev || 0)).toFixed(1);
      coords.textContent = `X: ${hx}m  Z: ${vz}m  H: ${alt}m  yaw: ${normDeg}°  tiltX: ${tiltDeg}°  tiltZ: ${tiltZDeg}°`;
    }
    hudEl.querySelector('[data-act="snap-grid"]')?.classList.toggle('on', drag.snap.grid);
    hudEl.querySelector('[data-act="snap-rot"]')?.classList.toggle('on', drag.snap.rot);
  }

  /* ── toolbar overlay (own styles, sp3d- prefix, no external css) ── */
  const state = {
    config: config || {}, view: 'perspective', dims: false, fs: false, night: false,
    surround: 'suburb', disposed: false, contextLost: false, qualityLevel: 0
  };
  try { state.night = localStorage.getItem('sp3d.night') === '1'; } catch (_) {}
  try {
    const saved = localStorage.getItem('sp3d.surround');
    if (surroundKinds.has(saved)) state.surround = saved;
  } catch (_) {}
  const nightLights = new THREE.Group();
  const nightPools = new THREE.Group();
  nightLights.name = 'sports-night-lights';
  nightPools.name = 'sports-night-pools';
  scene.add(nightPools, nightLights);
  let nightTween = { from: 0, to: state.night ? 1 : 0, start: -Infinity, immediate: true };
  let nightSkyUpdate = false;
  let nightLightRefs = [];
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  let loopRunning = false;
  let intersecting = true;
  let contextLossTimer = 0;
  let contextLossNotified = false;
  let intersectionObserver = null;
  let qualityLevel = 0;
  let qualityFrames = 0;
  let qualitySince = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let qualitySamples = [];
  let frameCount = 0;
  function clearNightLights() {
    while (nightLights.children.length) {
      const c = nightLights.children[nightLights.children.length - 1];
      nightLights.remove(c);
      if (c.target) scene.remove(c.target);
      if (c.dispose) c.dispose();
    }
    while (nightPools.children.length) {
      const c = nightPools.children[nightPools.children.length - 1];
      nightPools.remove(c);
      if (c.material && c.material.map && !CACHED_TEX.has(c.material.map)) c.material.map.dispose();
      c.geometry?.dispose(); c.material?.dispose();
    }
    nightLightRefs = [];
  }
  function rebuildNightLights() {
    clearNightLights();
    const lighting = Number(state.config?.lighting?.poles || 0) > 0;
    if (!lighting) return;
    const center = new THREE.Vector3();
    const L = num0(state.config?.dims, 'l', 20), W = num0(state.config?.dims, 'w', 12);
    group.traverse((node) => {
      const meta = node.userData?.sp3?.meta;
      if (!meta || meta.kind !== 'pole' || meta.part !== 'lamp') return;
      const world = node.getWorldPosition(new THREE.Vector3());
      const spot = new THREE.SpotLight(0xfff1c1, 0, 45, 0.7, 0.8, 1.5);
      spot.position.copy(world);
      spot.castShadow = false;
      spot.shadow.bias = -0.0005;
      spot.shadow.normalBias = 0.05;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.camera.near = 1;
      spot.shadow.camera.far = Math.max(12, world.y + Math.hypot(L, W));
      const target = new THREE.Object3D();
      target.position.set(THREE.MathUtils.clamp(world.x * 0.35, -L / 2, L / 2), 0, THREE.MathUtils.clamp(world.z * 0.35, -W / 2, W / 2));
      scene.add(target); spot.target = target;
      nightLights.add(spot);
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(Math.max(2, Math.min(L, W) * 0.35), 48),
        new THREE.MeshBasicMaterial({
          map: nightPoolTexture(), color: '#ffe9b8', transparent: true,
          opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      pool.rotation.x = -HPI; pool.position.copy(target.position); pool.position.y = 0.012;
      nightPools.add(pool);
      nightLightRefs.push({ spot, pool, target });
      center.add(target.position);
    });
    if (nightLightRefs.length) center.multiplyScalar(1 / nightLightRefs.length);
  }
  function setNight(on, immediate = false) {
    const target = !!on;
    const previous = state.night;
    state.night = target;
    try { localStorage.setItem('sp3d.night', target ? '1' : '0'); } catch (_) {}
    const from = nightTween && Number.isFinite(nightTween.value) ? nightTween.value : (previous ? 1 : 0);
    nightTween = { from, to: target ? 1 : 0, start: performance.now(), immediate };
    if (immediate) {
      nightTween.start = -Infinity;
    }
    syncToolbar();
  }
  function setSurround(kind) {
    const next = surroundKinds.has(kind) ? kind : 'suburb';
    if (next === state.surround && surroundGroup) {
      syncToolbar();
      return;
    }
    state.surround = next;
    try { localStorage.setItem('sp3d.surround', next); } catch (_) {}
    const L = num0(state.config?.dims, 'l', 20), W = num0(state.config?.dims, 'w', 12);
    updateEnvironment(L, W);
    fadeStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    applyNightMix(state.night ? 1 : 0);
    syncToolbar();
  }
  function applyNightMix(k) {
    const attr = skyGeo.attributes.color;
    for (let i = 0; i < attr.count * 3; i++) attr.array[i] = THREE.MathUtils.lerp(skyDay[i], skyNight[i], k);
    attr.needsUpdate = true;
    const skyColor = new THREE.Color('#dfe7ee').lerp(new THREE.Color('#0b1220'), k);
    scene.fog.color.copy(skyColor);
    hemi.color.set('#f8fafc').lerp(new THREE.Color('#1e3a5f'), k);
    hemi.intensity = THREE.MathUtils.lerp(0.38, 0.18, k);
    hemi.groundColor.set('#5b5648').lerp(new THREE.Color('#0f172a'), k);
    sun.color.set('#fff7ed').lerp(new THREE.Color('#94a3b8'), k);
    sun.intensity = THREE.MathUtils.lerp(0.95, 0.08, k);
    fillLight.intensity = THREE.MathUtils.lerp(0.2, 0.05, k);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(0.78, 0.62, k);
    groundMat.color.copy(surroundGroundTint).multiplyScalar(THREE.MathUtils.lerp(1, 0.35, k));
    apronMat.color.setScalar(THREE.MathUtils.lerp(1, 0.55, k));
    group.traverse((node) => {
      if (node.isMesh) node.receiveShadow = k < 0.5;
      if (!node.material) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((mat) => {
        if (!mat.emissive) return;
        if (node.userData?.lampHead) {
          mat.emissive.set('#fff3c4'); mat.emissiveIntensity = THREE.MathUtils.lerp(0.65, 2.5, k);
        } else if (isFenceKind(node.userData?.sp3?.meta?.kind) || node.userData?.sp3?.meta?.mark || node.userData?.sp3?.type === 'line') {
          mat.emissive.set(node.userData?.sp3?.type === 'line' ? '#fafafa' : '#b8c0c8');
          mat.emissiveIntensity = THREE.MathUtils.lerp(0.05, 0.25, k);
        }
      });
    });
    surroundNight.forEach(({ material, type }) => {
      material.emissiveIntensity = THREE.MathUtils.lerp(0, type === 'window' ? 1.1 : 1.6, k);
    });
    nightLightRefs.forEach(({ spot, pool }) => {
      spot.intensity = 8 * k;
      pool.material.opacity = 0;
    });
  }
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  if (cs && cs.position === 'static') el.style.position = 'relative';
  if (cs && (!el.clientHeight || parseFloat(cs.height) === 0)) el.style.minHeight = el.style.minHeight || '320px';
  el.classList.add('sp3d-host');
  ensureStyles();
  const toolbar = document.createElement('div');
  toolbar.className = 'sp3d-toolbar';
  const BTNS = [['perspective', 'perspective'], ['top', 'top'], ['fit', 'fit'], ['reset', 'reset'], ['dims', 'dims'], ['night', 'night'], ['fullscreen', 'fullscreen']];
  BTNS.forEach(([act, key]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sp3d-btn';
    b.dataset.sp3d = act;
    b.textContent = tr(key);
    b.title = tr(key);
    toolbar.appendChild(b);
  });
  const surroundWrap = document.createElement('span');
  surroundWrap.className = 'sp3d-surround';
  const surroundTitle = document.createElement('span');
  surroundTitle.className = 'sp3d-surround-title';
  surroundTitle.textContent = tr('surround');
  surroundWrap.appendChild(surroundTitle);
  [['field', 'surroundField'], ['village', 'surroundVillage'], ['suburb', 'surroundSuburb'], ['city', 'surroundCity']].forEach(([kind, label]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sp3d-btn';
    b.dataset.sp3d = 'surround:' + kind;
    b.textContent = tr(label); b.title = tr(label);
    surroundWrap.appendChild(b);
  });
  toolbar.appendChild(surroundWrap);
  toolbar.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-sp3d]');
    if (!b) return;
    const act = b.dataset.sp3d;
    if (act === 'perspective') setView('perspective');
    else if (act === 'top') setView('top');
    else if (act === 'fit') doFit(true);
    else if (act === 'reset') {
      if (selectedUnit) {
        selectedUnit.rotY = 0; selectedUnit.elev = 0; selectedUnit.tiltX = 0; selectedUnit.tiltZ = 0;
        applyTransform(selectedUnit, selectedUnit.baseX, selectedUnit.baseZ, 0, 0, 0, 0, false);
        commitTransform(selectedUnit);
      } else {
        doFit(true);
        resetProps();
      }
    }
    else if (act === 'dims') toggleDims();
    else if (act === 'night') setNight(!state.night);
    else if (act.startsWith('surround:')) setSurround(act.slice(9));
    else if (act === 'fullscreen') setFullscreen(!state.fs);
  });

  /* ── (re)build scene content from config ── */
  let fadeStart = 0;
  let fadeEnabled = true;
  let rebuildCount = 0;
  let staticSceneKey = null;
  const unitObjects = new Map();
  const unitSignatures = new Map();
  const fadeMats = [];
  const pendingDispose = [];
  const fenceMorphs = [];
  const lightingPops = [];
  const billboards = [];
  const propRoots = [];
  const propBodies = [];
  let propHover = null;
  let activeBodies = 0;
  let idlePropAt = 0;
  let lastPropTick = 0;
  const pointerTrail = [];
  const propGeo = {
    ball: new THREE.SphereGeometry(1, 16, 10),
    disc: new THREE.CylinderGeometry(1, 1, 0.035, 24),
    torus: new THREE.TorusGeometry(0.14, 0.02, 8, 24),
    plane: new THREE.PlaneGeometry(1, 1),
    rod: new THREE.CylinderGeometry(0.02, 0.02, 1, 8),
    bird: new THREE.BoxGeometry(0.28, 0.025, 0.035)
  };
  const propMat = {
    football: null, basketball: null, volleyball: null, tennis: null,
    generic: null, dark: null, bright: null, shadow: null
  };

  function propTexture(kind) {
    const key = 'prop|' + kind;
    if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
    const S = 128, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, S, S);
    if (kind === 'football') {
      g.fillStyle = '#f8fafc'; g.fillRect(0, 0, S, S);
      g.fillStyle = '#17202b';
      for (const [x, y] of [[32, 32], [96, 34], [64, 96], [18, 92], [110, 92]]) {
        g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 9, y - 3); g.lineTo(x + 6, y + 9); g.lineTo(x - 6, y + 9); g.lineTo(x - 9, y - 3); g.closePath(); g.fill();
      }
      g.strokeStyle = '#94a3b8'; g.lineWidth = 2; g.strokeRect(8, 8, S - 16, S - 16);
    } else if (kind === 'basketball') {
      g.fillStyle = '#e87924'; g.fillRect(0, 0, S, S);
      g.strokeStyle = '#111827'; g.lineWidth = 5;
      g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); g.moveTo(8, 64); g.lineTo(120, 64); g.moveTo(64, 8); g.lineTo(64, 120); g.stroke();
    } else if (kind === 'tennis') {
      g.fillStyle = '#d9f044'; g.fillRect(0, 0, S, S);
      g.strokeStyle = '#f8fafc'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 42, -1.1, 1.1); g.stroke();
    } else {
      g.fillStyle = '#f7fbff'; g.fillRect(0, 0, S, S);
      g.fillStyle = '#facc15'; g.fillRect(0, S * 0.33, S, S * 0.34);
      g.fillStyle = '#2563eb'; g.fillRect(S * 0.33, 0, S * 0.34, S);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    TEX_CACHE.set(key, tex); CACHED_TEX.add(tex);
    return tex;
  }

  function makePropMaterials() {
    if (propMat.football) return;
    const ball = (kind, color) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), map: propTexture(kind), roughness: 0.45, metalness: 0.02 });
    propMat.football = ball('football', '#ffffff');
    propMat.basketball = ball('basketball', '#e87924');
    propMat.tennis = ball('tennis', '#d9f044');
    propMat.volleyball = ball('volleyball', '#ffffff');
    propMat.generic = standardMaterial('#b8c2cc', 'plastic');
    propMat.dark = standardMaterial('#17202b', 'default');
    propMat.dark.map = gridTexture('ortho');
    propMat.dark.needsUpdate = true;
    propMat.bright = standardMaterial('#f97316', 'plastic');
    propMat.shadow = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  }

  function addPropShadow(root, radius) {
    const shadow = contactShadow(radius * 2.2, radius * 1.15);
    shadow.geometry.dispose();
    shadow.geometry = propGeo.plane;
    shadow.material.dispose();
    shadow.material = propMat.shadow;
    shadow.position.y = -root.position.y + 0.008;
    shadow.scale.set(radius * 2.2, radius * 1.15, 1);
    shadow.userData.propShadow = true;
    root.add(shadow);
    root.userData.shadow = shadow;
  }

  function markPropMesh(root, mesh, ball = false) {
    mesh.userData = { ...(mesh.userData || {}), propRoot: root };
    (root.userData.propMeshes || (root.userData.propMeshes = [])).push({
      mesh, baseScale: mesh.scale.clone(), basePos: mesh.position.clone(), ball
    });
    return mesh;
  }

  function addBall(x, z, radius, kind, index) {
    const root = new THREE.Group();
    root.name = 'hero-ball-' + index;
    root.position.set(x, radius, z);
    root.userData = {
      prop: true, propKind: 'ball', ballType: kind, radius,
      visualBoost: kind === 'basketball' ? 1.35 : 1.15,
      default: [x, radius, z], index, rimAwarded: false
    };
    const mesh = new THREE.Mesh(propGeo.ball, propMat[kind]);
    mesh.scale.setScalar(radius);
    markPropMesh(root, mesh, true);
    root.add(mesh);
    addPropShadow(root, radius);
    PROPS.add(root); propRoots.push(root); propBodies.push(root.userData);
    return root;
  }

  function addFrisbee(x, z, index) {
    const root = new THREE.Group();
    root.name = 'hero-frisbee';
    root.position.set(x, 0.04, z);
    root.userData = { prop: true, propKind: 'frisbee', radius: 0.0175, default: [x, 0.04, z], index, rimAwarded: false };
    const mesh = new THREE.Mesh(propGeo.disc, propMat.bright);
    mesh.scale.set(0.14, 1, 0.14);
    mesh.position.y = -0.0175; markPropMesh(root, mesh, true); root.add(mesh);
    addPropShadow(root, 0.14);
    PROPS.add(root); propRoots.push(root); propBodies.push(root.userData);
    return root;
  }

  function addRacket(x, z, index) {
    const root = new THREE.Group();
    root.name = 'hero-racket'; root.position.set(x, 0.02, z);
    root.userData = { prop: true, propKind: 'racket', default: [x, 0.02, z], index, swingFrom: 0, swingTo: 0, swingT: 0 };
    const head = new THREE.Mesh(propGeo.torus, propMat.dark);
    head.rotation.x = HPI; head.position.y = 0.06; markPropMesh(root, head);
    const strings = new THREE.Mesh(propGeo.plane, propMat.dark);
    strings.scale.set(0.23, 0.23, 1); strings.rotation.x = -HPI; strings.position.y = 0.06; markPropMesh(root, strings);
    const handle = new THREE.Mesh(propGeo.rod, propMat.dark);
    handle.scale.y = 0.3; handle.rotation.x = HPI; handle.position.set(0, 0.04, 0.28); markPropMesh(root, handle);
    root.add(head, strings, handle); addPropShadow(root, 0.18);
    PROPS.add(root); propRoots.push(root);
    return root;
  }

  function addKettlebell(x, z, index) {
    const root = new THREE.Group();
    root.name = 'hero-kettlebell'; root.position.set(x, 0, z);
    root.userData = { prop: true, propKind: 'kettlebell', heavy: true, default: [x, 0, z], index };
    const body = new THREE.Mesh(propGeo.ball, propMat.generic);
    body.scale.setScalar(0.12); body.position.y = 0.12; markPropMesh(root, body);
    const handle = new THREE.Mesh(propGeo.torus, propMat.dark);
    handle.scale.set(0.72, 1.2, 0.72); handle.position.y = 0.29; markPropMesh(root, handle);
    root.add(body, handle); addPropShadow(root, 0.14);
    PROPS.add(root); propRoots.push(root);
    return root;
  }

  function addAmbientLife(L, W) {
    const seed = Math.round(L * 100) * 7919 + Math.round(W * 100);
    const rnd = mulberry32(seed);
    for (let i = 0; i < 4 + Math.floor(rnd() * 3); i++) {
      const root = new THREE.Group();
      const bird = { phase: rnd() * Math.PI * 2, rx: L * (0.25 + rnd() * 0.15), rz: W * (0.22 + rnd() * 0.14), cy: 9 + rnd() * 5, speed: 0.00035 + rnd() * 0.0002 };
      root.userData = { ambient: 'bird', bird, base: rnd() * Math.PI * 2 };
      root.position.set(Math.cos(bird.base) * bird.rx, bird.cy, Math.sin(bird.base) * bird.rz);
      const left = new THREE.Mesh(propGeo.bird, propMat.dark), right = new THREE.Mesh(propGeo.bird, propMat.dark);
      left.rotation.z = -0.35; right.rotation.z = 0.35; left.position.x = -0.12; right.position.x = 0.12;
      root.add(left, right); PROPS.add(root);
    }
    const flowers = [[-Math.min(L, W) * 0.12, 0], [0, Math.min(L, W) * 0.12],
      [Math.min(L, W) * 0.12, 0], [0, -Math.min(L, W) * 0.12]];
    flowers.forEach(([x, z], bi) => {
      for (let i = 0; i < 3; i++) {
        const root = new THREE.Group();
        const a = rnd() * Math.PI * 2;
        root.userData = { ambient: 'butterfly', phase: a, radius: 0.35 + rnd() * 0.25, cx: x, cz: z, speed: 0.0007 + rnd() * 0.0003 };
        root.position.set(x + Math.cos(a) * root.userData.radius, 0.75 + rnd() * 0.25, z + Math.sin(a) * root.userData.radius);
        const l = new THREE.Mesh(propGeo.plane, propMat.bright), r = new THREE.Mesh(propGeo.plane, propMat.bright);
        l.scale.set(0.06, 0.09, 1); r.scale.set(0.06, 0.09, 1); l.position.x = -0.045; r.position.x = 0.045;
        l.rotation.y = HPI * 0.25; r.rotation.y = -HPI * 0.25; root.add(l, r); PROPS.add(root);
      }
    });
  }

  function buildProps(cfg, L, W) {
    makePropMaterials();
    const sport = String(cfg.sport || '').toLowerCase();
    let i = 0;
    if (/^football(5|7|11)$/.test(sport)) { addBall(0, 0, 0.11, 'football', i++); addBall(L * 0.42, 0, 0.11, 'football', i++); }
    else if (sport === 'basketball') addBall(0, -W * 0.25, 0.12, 'basketball', i++);
    else if (sport === 'volleyball') addBall(0, W * 0.22, 0.105, 'volleyball', i++);
    else if (sport === 'tennis') {
      addBall(-L * 0.38, -W * 0.34, 0.06, 'tennis', i++);
      addBall(-L * 0.32, -W * 0.34, 0.06, 'tennis', i++);
      addBall(-L * 0.26, -W * 0.34, 0.06, 'tennis', i++);
      addRacket(-L * 0.18, -W * 0.29, i++);
    } else if (sport === 'multisport') {
      addBall(-L * 0.18, 0, 0.11, 'football', i++); addBall(L * 0.18, 0, 0.12, 'basketball', i++);
    } else if (sport === 'street_workout') {
      addKettlebell(-W * 0.2, 0, i++);
      const root = new THREE.Group(); root.name = 'hero-medicine-ball'; root.position.set(W * 0.2, 0.13, 0);
      root.userData = { prop: true, propKind: 'ball', ballType: 'generic', heavy: true, radius: 0.13, visualBoost: 1.2, default: [W * 0.2, 0.13, 0], index: i++, rimAwarded: false };
      const mesh = new THREE.Mesh(propGeo.ball, propMat.generic); mesh.scale.setScalar(0.13); markPropMesh(root, mesh, true); root.add(mesh);
      addPropShadow(root, 0.15); PROPS.add(root); propRoots.push(root); propBodies.push(root.userData);
    } else if (sport === 'open_park') {
      addBall(-L * 0.16, W * 0.12, 0.11, 'football', i++);
      addFrisbee(L * 0.12, W * 0.08, i++);
      addBall(W * 0.28, -W * 0.28, 0.06, 'tennis', i++);
      addAmbientLife(L, W);
    }
    idlePropAt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 6000;
  }

  function propVisualScale() {
    const distance = camera.position.distanceTo(controls.target);
    return THREE.MathUtils.clamp(distance * 0.02, 1.0, 1.6);
  }

  function applyPropVisualScale(root, scale) {
    const meshes = root.userData && root.userData.propMeshes;
    if (!meshes) return;
    const factor = scale * (root.userData.visualBoost || 1) * (root === propHover ? 1.08 : 1);
    for (const entry of meshes) {
      if (!entry.mesh.parent) continue;
      entry.mesh.scale.copy(entry.baseScale).multiplyScalar(factor);
      if (entry.ball) {
        const r = root.userData.radius || 0.04;
        const centerY = Math.max(root.position.y, r * factor);
        entry.mesh.position.set(entry.basePos.x, centerY - root.position.y, entry.basePos.z);
      } else {
        entry.mesh.position.copy(entry.basePos).multiplyScalar(factor);
      }
    }
  }

  function setPropHover(root) {
    if (propHover === root) return;
    if (propHover) {
      propHover.traverse((o) => { if (o.material?.emissive) o.material.emissive.set('#000000'); });
    }
    propHover = root;
    if (root) {
      root.traverse((o) => { if (o.material?.emissive) { o.material.emissive.set('#38bdf8'); o.material.emissiveIntensity = 0.22; } });
    }
  }

  function pickProp(e) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1; ndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    ray.setFromCamera(ndc, camera);
    let hits = [];
    try { hits = ray.intersectObjects(PROPS.children, true); } catch (_) { return null; }
    for (const h of hits) {
      let n = h.object;
      while (n && n !== PROPS) {
        if (n.userData?.prop && !n.userData.ambient) return n;
        n = n.parent;
      }
    }
    let nearest = null, nearestPx = 22;
    const pointer = new THREE.Vector2(e.clientX, e.clientY);
    const projected = new THREE.Vector3();
    for (const root of propRoots) {
      if (!root.userData?.ballType && root.userData?.propKind !== 'frisbee') continue;
      root.getWorldPosition(projected).project(camera);
      const sx = r.left + (projected.x + 1) * r.width / 2;
      const sy = r.top + (-projected.y + 1) * r.height / 2;
      const px = Math.hypot(pointer.x - sx, pointer.y - sy);
      if (px < nearestPx) { nearestPx = px; nearest = root; }
    }
    if (nearest) return nearest;
    return null;
  }

  function pointerVelocity() {
    if (pointerTrail.length < 2) return new THREE.Vector3();
    const first = pointerTrail[0], last = pointerTrail[pointerTrail.length - 1];
    const span = last.t - first.t;
    if (span < 8) return new THREE.Vector3();
    const v = new THREE.Vector3(
      (last.x - first.x) / (span / 1000), 0, (last.z - first.z) / (span / 1000)
    );
    if (v.length() > 14) v.setLength(14);
    return v;
  }

  function activateBody(b) {
    if (!b.active) { b.active = true; activeBodies++; }
  }

  function kickBody(root, hit, pv) {
    const b = root && root.userData;
    if (!b || !['ball', 'frisbee'].includes(b.propKind)) return;
    const speed = pv && pv.length();
    b.rimAwarded = false;
    b.prevY = root.position.y;
    if (speed > 1.2) {
      const mass = b.heavy ? 0.25 :
        ({ basketball: 0.9, football: 0.9, volleyball: 0.9, tennis: 1.1 }[b.ballType] || 0.9);
      const horizontal = pv.clone().multiplyScalar(b.propKind === 'frisbee' ? 1.2 : 1);
      b.velocity = horizontal.multiplyScalar(mass);
      b.velocity.y = b.heavy ? Math.min(0.6, speed * 0.35) :
        b.propKind === 'frisbee' ? 1.5 : THREE.MathUtils.clamp(speed * 0.35, 0.4, 4.5);
      b.lastKickT = typeof performance !== 'undefined' ? performance.now() : Date.now();
      activateBody(b);
      return;
    }
    const dx = root.position.x - (hit?.x || root.position.x), dz = root.position.z - (hit?.z || root.position.z);
    const len = Math.hypot(dx, dz) || 1;
    const cam = camera.getWorldDirection(new THREE.Vector3()); cam.y = 0; cam.normalize();
    const dir = new THREE.Vector3(dx / len, 0, dz / len).multiplyScalar(0.65).add(cam.multiplyScalar(0.35)).normalize();
    root.position.x += dir.x * 0.01;
    root.position.z += dir.z * 0.01;
    b.velocity = new THREE.Vector3(dir.x * 7.5, b.propKind === 'frisbee' ? 2 : 4, dir.z * 7.5);
    activateBody(b);
  }

  function hitRacket(root, pv) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (root.userData.racketT && now - root.userData.racketT < 300) return;
    root.userData.racketT = now;
    root.userData.racketHit = true;
    if (pv && pv.length() > 1.2) {
      root.userData.swingFrom = root.rotation.y;
      root.userData.swingTo = Math.atan2(pv.x, pv.z);
      root.userData.swingT = now;
    }
    for (const p of propRoots) {
      if (p.userData?.ballType === 'tennis' && p.position.distanceTo(root.position) < 1.5) {
        const dir = pv && pv.length() > 1.2 ? pv.clone() : new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        dir.y = 0; dir.normalize();
        p.userData.velocity = dir.multiplyScalar(pv && pv.length() > 1.2 ? 1.3 * pv.length() : 7);
        p.userData.velocity.y = pv && pv.length() > 1.2 ? THREE.MathUtils.clamp(pv.length() * 0.4, 1, 4) : 3.2;
        p.userData.prevY = p.position.y;
        p.userData.rimAwarded = false;
        activateBody(p.userData);
      }
    }
  }

  function rimTargets() {
    const rims = [];
    group.traverse((node) => {
      const meta = node.userData?.sp3?.meta;
      if (node.isMesh && meta?.part === 'rim') {
        rims.push({ pos: node.getWorldPosition(new THREE.Vector3()), radius: meta.rimR || 0.225 });
      }
    });
    return rims;
  }

  function spawnConfetti(pos) {
    if (reducedMotion) return;
    const colors = ['#f97316', '#22c55e', '#3b82f6', '#eab308', '#ec4899'];
    for (let i = 0; i < 36; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.06, 0.1),
        new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, side: THREE.DoubleSide })
      );
      mesh.position.copy(pos);
      mesh.userData.fx = {
        age: 0, maxAge: 1.6,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3),
        spin: (Math.random() - 0.5) * 12
      };
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      FX.add(mesh);
    }
  }

  function updateFx(dt) {
    const step = Math.min(0.05, Math.max(0, dt));
    for (let i = FX.children.length - 1; i >= 0; i--) {
      const mesh = FX.children[i], fx = mesh.userData.fx;
      if (!fx) continue;
      fx.age += step;
      fx.velocity.y -= 9.81 * step;
      mesh.position.addScaledVector(fx.velocity, step);
      mesh.rotation.x += fx.spin * step;
      mesh.rotation.y += fx.spin * 0.7 * step;
      mesh.rotation.z += fx.spin * 0.45 * step;
      mesh.material.opacity = Math.max(0, 1 - fx.age / fx.maxAge);
      if (fx.age >= fx.maxAge) {
        FX.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
  }

  function clearFx() {
    while (FX.children.length) {
      const mesh = FX.children.pop();
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    }
  }

  function resetProps() {
    for (const root of propRoots) {
      const b = root.userData, d = b.default;
      root.position.set(d[0], d[1], d[2]); root.rotation.set(0, 0, 0);
      b.velocity = null; b.active = false; b.rimAwarded = false; b.prevY = root.position.y;
      if (b.shadow) b.shadow.material.opacity = 0.28;
    }
    activeBodies = 0; setPropHover(null); clearFx();
  }

  function updateProps(now, dt) {
    if (state.view === 'top') return;
    const totalDt = Math.min(0.05, Math.max(0, dt));
    const steps = Math.min(3, Math.max(1, Math.ceil(totalDt / (1 / 60))));
    const stepDt = totalDt / steps;
    if (activeBodies > 0) {
      const L = num0(state.config.dims, 'l', 20), W = num0(state.config.dims, 'w', 12);
      const fenced = configFenceOn(state.config);
      const rims = rimTargets();
      for (let step = 0; step < steps; step++) for (const root of propRoots) {
        const b = root.userData;
        if (!b.active || !b.velocity) continue;
        const floor = b.radius || 0.04;
        const prevY = root.position.y;
        b.velocity.y += (b.propKind === 'frisbee' ? -3 : -9.81) * stepDt;
        root.position.addScaledVector(b.velocity, stepDt);
        const edgeX = fenced ? L / 2 - floor : L / 2 + 2;
        const edgeZ = fenced ? W / 2 - floor : W / 2 + 2;
        if (root.position.x < -edgeX || root.position.x > edgeX) { root.position.x = THREE.MathUtils.clamp(root.position.x, -edgeX, edgeX); b.velocity.x *= -0.55; }
        if (root.position.z < -edgeZ || root.position.z > edgeZ) { root.position.z = THREE.MathUtils.clamp(root.position.z, -edgeZ, edgeZ); b.velocity.z *= -0.55; }
        if (root.position.y <= floor) {
          root.position.y = floor;
          if (b.velocity.y < 0) b.velocity.y *= b.heavy ? -0.15 : (b.propKind === 'frisbee' ? -0.15 : (b.ballType === 'basketball' ? -0.75 : b.ballType === 'tennis' ? -0.7 : -0.6));
        }
        if (root.position.y <= floor + 0.005) {
          const friction = Math.max(0, 1 - (b.heavy ? 6 : 1.6) * stepDt);
          b.velocity.x *= friction; b.velocity.z *= friction;
        }
        b.velocity.multiplyScalar(Math.max(0, 1 - 0.08 * stepDt));
        if (b.ballType === 'basketball' && !b.rimAwarded && b.velocity.y < 0 && prevY > 0) {
          for (const rim of rims) {
            if (prevY >= rim.pos.y && root.position.y <= rim.pos.y &&
                Math.hypot(root.position.x - rim.pos.x, root.position.z - rim.pos.z) < rim.radius * 0.9) {
              root.position.x = THREE.MathUtils.lerp(root.position.x, rim.pos.x, 0.5);
              root.position.z = THREE.MathUtils.lerp(root.position.z, rim.pos.z, 0.5);
              b.rimAwarded = true;
              spawnConfetti(rim.pos);
              break;
            }
          }
        }
        root.rotation.x += b.velocity.z * stepDt / Math.max(0.04, floor);
        root.rotation.z -= b.velocity.x * stepDt / Math.max(0.04, floor);
        if (b.shadow) { b.shadow.position.y = -root.position.y + floor + 0.008; b.shadow.material.opacity = 0.28 * Math.max(0, 1 - (root.position.y - floor) / 4); }
        b.prevY = root.position.y;
        if (b.velocity.length() < 0.08 && root.position.y <= floor + 0.01) {
          b.velocity.set(0, 0, 0); b.active = false; b.rimAwarded = false; activeBodies = Math.max(0, activeBodies - 1);
        }
      }
    }
    if (now >= idlePropAt && propRoots.length) {
      const balls = propRoots.filter((p) => p.userData?.ballType && !p.userData.active);
      if (balls.length) {
        const p = balls[Math.floor((now / 1000) % balls.length)];
        p.userData.velocity = new THREE.Vector3(0, 1.2, 0); p.userData.prevY = p.position.y; p.userData.rimAwarded = false;
        activateBody(p.userData);
      }
      idlePropAt = now + 6000 + ((Math.round(now) % 4000));
    }
    PROPS.children.forEach((root) => {
      const b = root.userData;
      if (b?.ambient === 'bird') { const a = now * b.bird.speed + b.bird.phase; root.position.set(Math.cos(a) * b.bird.rx, b.bird.cy + Math.sin(a * 2) * 0.3, Math.sin(a) * b.bird.rz); root.scale.y = 0.85 + Math.sin(now / 140 + b.bird.phase) * 0.18; }
      else if (b?.ambient === 'butterfly') { const a = now * b.speed + b.phase; root.position.set(b.cx + Math.cos(a) * b.radius, 0.75 + Math.sin(a * 2) * 0.12, b.cz + Math.sin(a) * b.radius); root.rotation.y = -a; }
      if (b?.swingT && now - b.swingT < 150) {
        const k = THREE.MathUtils.clamp((now - b.swingT) / 150, 0, 1);
        root.rotation.y = THREE.MathUtils.lerp(b.swingFrom, b.swingTo, 1 - Math.pow(1 - k, 3));
      }
      if (b?.racketHit && now - b.racketT < 800) root.rotation.z = Math.sin((now - b.racketT) / 800 * Math.PI) * 0.8;
    });
  }

  function replaceUnitTarget(oldObj, newObj, o) {
    if (!oldObj || !newObj) return;
    const key = o && o.meta ? unitKey(o.meta) : null;
    if (key && dragByUnit.has(key)) {
      const u = dragByUnit.get(key);
      const idx = u.targets.indexOf(oldObj);
      if (idx >= 0) u.targets[idx] = newObj;
      else u.targets.push(newObj);
      const offsetY = (o && o.pos && Number.isFinite(o.pos[1]) ? o.pos[1] : 0) - (u.elev || 0);
      u.targetOffsets.set(newObj, offsetY);
      newObj.position.set(u.baseX, (u.elev || 0) + offsetY, u.baseZ);
      newObj.rotation.order = 'YXZ';
      newObj.rotation.set(u.tiltX || 0, u.rotY || 0, u.tiltZ || 0);
    }
  }

  function applyPalette(grp, cols) {
    if (!grp || !cols || !cols.length) return;
    const parts = grp.userData?.paletteParts || [];
    parts.forEach((part) => {
      if (!part.material) return;
      const col = cols[part.userData.palette === 'a2' ? 1 : 0];
      if (part.userData.sharedMaterial) {
        const base = part.userData.sharedMaterial.clone();
        base.color.copy(col);
        part.userData.sharedMaterial = base;
        part.material.color.copy(col);
        const orig = originalMaterials.get(part.material);
        if (orig && orig.color) orig.color.copy(col);
        return;
      }
      part.material = part.material.clone();
      part.material.color.copy(col);
      part.material.needsUpdate = true;
    });
  }

  /* Product photography is shown as a floating reference card above the
     physical rig. The rig remains present even while either texture loads. */
  function handlePhoto(bmesh, o) {
    loadPhotoTexture(o.img || o.imgT, (tex, isErr) => {
      queueMicrotask(() => {
        if (!bmesh.parent || state.disposed) return;
        if (isErr || !tex || bmesh.userData.photoCardRef) return;
        const fp = o.meta?.fp || { h: o.size[1] || 1 };
        const card = new THREE.Sprite(new THREE.SpriteMaterial({
          map: photoCardTexture(tex), transparent: true, depthTest: false, depthWrite: false
        }));
        card.scale.set(0.35, 0.35, 1);
        card.position.set(0, (fp.h || 1) + 0.6, 0);
        card.userData = { sp3: o, photoCard: true };
        card.renderOrder = 80;
        bmesh.userData.photoCardRef = card;
        bmesh.add(card);
        extractPalette(o.imgT, (cols) => applyPalette(bmesh, cols));
      });
    });
  }

  /* Cutouts only provide rig colours now; the full photo remains the card. */
  function handleSprite(spr, o, L, W) {
    extractPalette(o.imgT, (cols) => {
      queueMicrotask(() => {
        if (spr.parent && !state.disposed) applyPalette(spr, cols);
      });
    });
    handlePhoto(spr, o);
  }

  function stableSceneKey(value) {
    if (Array.isArray(value)) return '[' + value.map(stableSceneKey).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).filter((k) => k !== 'equipment').sort().map((k) => JSON.stringify(k) + ':' + stableSceneKey(value[k])).join(',') + '}';
    }
    if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value * 1000) / 1000);
    return JSON.stringify(value);
  }
  function sceneStaticKey(cfg) {
    return stableSceneKey(cfg || {});
  }
  function sceneFacilityKey(cfg) {
    const copy = { ...(cfg || {}) };
    delete copy.fenceHeight;
    if (copy.fencing && typeof copy.fencing === 'object') copy.fencing = { ...copy.fencing, height: undefined };
    return stableSceneKey(copy);
  }
  function configFenceHeight(cfg) {
    return Number(cfg?.fenceHeight ?? cfg?.fencing?.height ?? 0);
  }
  function configFenceOn(cfg) {
    return configFenceHeight(cfg) > 0;
  }
  function unitSignature(o) {
    const meta = o.meta ? { ...o.meta } : null;
    if (meta) delete meta.pinned;
    return stableSceneKey({ ...o, pos: undefined, rotY: undefined, tiltX: undefined, tiltZ: undefined, meta });
  }
  function objectUnitGroups(objects) {
    const groups = new Map();
    for (const o of objects) {
      const m = o.meta;
      if (!m || (m.kind !== 'equipment' && m.kind !== 'halo') || dragIdOf(m) == null) continue;
      const key = unitKey(m);
      const row = groups.get(key) || { objects: [], signature: [] };
      row.objects.push(o);
      row.signature.push(unitSignature(o));
      groups.set(key, row);
    }
    groups.forEach((row) => { row.signature = row.signature.sort().join('|'); });
    return groups;
  }
  function removeUnitObjects(key) {
    const row = unitObjects.get(key);
    if (!row) return;
    for (const mesh of row.meshes) {
      if (mesh.parent) mesh.parent.remove(mesh);
      disposeChild(mesh);
    }
    unitObjects.delete(key);
    unitSignatures.delete(key);
    const u = dragByUnit.get(key);
    if (u) {
      if (selectedUnit === u) deselect();
      restoreHighlight(u);
      dragByUnit.delete(key);
      const i = dragUnits.indexOf(u);
      if (i >= 0) dragUnits.splice(i, 1);
    }
  }
  function applyModelUnit(u, row) {
    const main = row.objects.find((o) => o.meta?.kind === 'equipment') || row.objects[0];
    if (!main || !u) return;
    const elev = Number.isFinite(main.pos?.[1]) ? main.pos[1] : 0;
    applyTransform(u, main.pos[0], main.pos[2], elev, typeof main.rotY === 'number' ? main.rotY : u.rotY, typeof main.tiltX === 'number' ? main.tiltX : u.tiltX, typeof main.tiltZ === 'number' ? main.tiltZ : u.tiltZ, false);
  }
  function addUnitObjects(key, row, L, W, allowFade) {
    const meshes = [];
    fadeEnabled = !!allowFade;
    for (const o of row.objects) {
      const photoCb = o.type === 'billboard'
        ? (o.imgT ? ((m, oo) => handleSprite(m, oo, L, W)) : handlePhoto)
        : undefined;
      let mesh = null;
      try { mesh = buildObject(o, L, W, photoCb); } catch (_) { mesh = null; }
      if (!mesh) continue;
      mesh.userData.fadeAllowed = !!allowFade;
      collectFade(mesh, !!allowFade);
      registerDrag(mesh, o);
      if (mesh.userData?.billboard) {
        mesh.visible = state.view !== 'top';
        billboards.push(mesh);
      }
      if (o.meta?.kind === 'halo') buildTarget.add(mesh);
      else buildTarget.add(mesh);
      meshes.push(mesh);
    }
    fadeEnabled = false;
    unitObjects.set(key, { meshes, objects: row.objects });
    unitSignatures.set(key, row.signature);
  }

  function updateEquipment(cfg) {
    state.config = cfg || {};
    const L = num0(state.config.dims, 'l', 20), W = num0(state.config.dims, 'w', 12);
    let objects = [];
    try { objects = buildSceneModel(state.config, SCENE_SPECS) || []; } catch (_) { objects = []; }
    const next = objectUnitGroups(objects);
    for (const key of unitObjects.keys()) if (!next.has(key)) removeUnitObjects(key);
    for (const [key, row] of next) {
      const oldSig = unitSignatures.get(key);
      if (oldSig === row.signature) {
        const u = dragByUnit.get(key);
        if (u) applyModelUnit(u, row);
        continue;
      }
      removeUnitObjects(key);
      addUnitObjects(key, row, L, W, true);
      const u = dragByUnit.get(key);
      if (u) applyModelUnit(u, row);
    }
    buildProps(state.config, L, W);
    propHintEl.style.display = propRoots.length && !selectedUnit ? 'block' : 'none';
  }

  function isolateMaterials(root) {
    const seen = new Map();
    root.traverse((obj) => {
      if (!obj.material) return;
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      const cloned = list.map((mat) => {
        if (!mat) return mat;
        if (!seen.has(mat)) seen.set(mat, mat.clone());
        return seen.get(mat);
      });
      obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
    });
  }
  function queueFade(root, fromZero) {
    root.traverse((obj) => {
      if (!obj.material) return;
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      list.forEach((m) => {
        if (!m || m.userData?.fadeQueued) return;
        m.userData = { ...(m.userData || {}), fadeQueued: true };
        const target = m.opacity == null ? 1 : m.opacity;
        const wasT = !!m.transparent;
        m.transparent = true;
        m.opacity = fromZero ? 0 : target;
        fadeMats.push({ m, from: fromZero ? 0 : target, to: fromZero ? target : 0, wasT });
      });
    });
  }
  function rebuild(cfg, first = false, opts = {}) {
    rebuildCount++;
    while (pendingDispose.length) {
      const stale = pendingDispose.shift();
      if (stale.parent) stale.parent.remove(stale);
      disposeChild(stale);
    }
    fadeMats.length = 0;
    state.config = cfg || {};
    const prevKey = selectedUnit ? selectedUnit.key : null;
    const prevId = selectedUnit ? selectedUnit.id : null;
    const oldGroup = group;
    const oldProps = first ? null : new THREE.Group();
    if (oldProps) {
      while (PROPS.children.length) oldProps.add(PROPS.children[0]);
      oldProps.name = 'sports-props-transition';
      scene.add(oldProps);
    }
    if (!drag.on) {
      dragUnits = [];
      dragByUnit = new Map();
    }
    ANIMATED.length = 0;
    while (PROPS.children.length) PROPS.remove(PROPS.children[PROPS.children.length - 1]);
    clearFx();
    pointerTrail.length = 0;
    while (dimsGroup.children.length) disposeChild(dimsGroup.children.pop());
    billboards.length = 0;
    unitObjects.clear();
    unitSignatures.clear();
    propRoots.length = 0;
    propBodies.length = 0;
    activeBodies = 0;
    const nextGroup = first ? oldGroup : new THREE.Group();
    nextGroup.name = 'sports-scene';
    buildTarget = nextGroup;
    if (first) while (nextGroup.children.length) disposeChild(nextGroup.children.pop());
    const L = num0(state.config.dims, 'l', 20), W = num0(state.config.dims, 'w', 12);
    updateEnvironment(L, W);
    let objects = [];
    try { objects = buildSceneModel(state.config, SCENE_SPECS) || []; } catch (_) { objects = []; }
    for (const o of objects) {
      let mesh = null;
      const photoCb = o.type === 'billboard'
        ? (o.imgT ? ((m, oo) => handleSprite(m, oo, L, W)) : handlePhoto)
        : undefined;
      try { mesh = buildObject(o, L, W, photoCb); } catch (_) { mesh = null; }
      if (!mesh) continue;
      mesh.userData.fadeAllowed = !!first;
      collectFade(mesh, !!first);
      registerDrag(mesh, o);
      if (mesh.userData?.billboard) {
        mesh.visible = state.view !== 'top';
        billboards.push(mesh);
      }
      if (o.meta && o.meta.kind === 'dim-line') dimsGroup.add(mesh);
      else buildTarget.add(mesh);
      if (o.meta && (o.meta.kind === 'equipment' || o.meta.kind === 'halo')) {
        const key = unitKey(o.meta);
        const row = unitObjects.get(key) || { meshes: [], objects: [] };
        row.meshes.push(mesh); row.objects.push(o);
        unitObjects.set(key, row);
      }
    }
    unitObjects.forEach((row, key) => { unitSignatures.set(key, objectUnitGroups(row.objects).get(key)?.signature || row.objects.map(unitSignature).sort().join('|')); });
    buildProps(state.config, L, W);
    propHintEl.style.display = propRoots.length && !selectedUnit ? 'block' : 'none';
    group = nextGroup;
    if (!first && !opts.fenceMorph) {
      isolateMaterials(oldGroup);
      isolateMaterials(nextGroup);
      scene.add(nextGroup);
      queueFade(oldGroup, false);
      queueFade(nextGroup, true);
      if (oldProps && oldProps.children.length) {
        isolateMaterials(oldProps);
        queueFade(oldProps, false);
        isolateMaterials(PROPS);
        queueFade(PROPS, true);
        pendingDispose.push(oldProps);
      }
      pendingDispose.push(oldGroup);
    } else if (!first && opts.fenceMorph) {
      if (oldGroup.parent) oldGroup.parent.remove(oldGroup);
      disposeChild(oldGroup);
      if (oldProps) {
        if (oldProps.parent) oldProps.parent.remove(oldProps);
        disposeChild(oldProps);
      }
      scene.add(nextGroup);
      fadeStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    } else {
      collectFade(nextGroup, true);
      fadeStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    }
    buildTarget = group;
    fitSun();
    rebuildNightLights();
    if (qualityLevel > 0) applyQualityLevel(qualityLevel);
    applyNightMix(state.night ? 1 : 0);
    if (opts.lightingPop) {
      group.traverse((obj) => {
        if (obj.userData?.sp3?.meta?.part !== 'lamp') return;
        obj.scale.setScalar(0.85);
        lightingPops.push({ obj, start: performance.now() });
      });
    }
    if (opts.fenceMorph && !first) {
      const oldH = Math.max(0.1, +opts.oldFenceHeight || 1);
      const newH = Math.max(0.1, configFenceHeight(state.config) || 1);
      group.traverse((obj) => {
        if (!isFenceKind(obj.userData?.sp3?.meta?.kind)) return;
        obj.scale.y = oldH / newH;
        fenceMorphs.push({ obj, from: oldH / newH, to: 1, start: performance.now() });
      });
      fadeMats.length = 0;
    }
    staticSceneKey = sceneStaticKey(state.config);
    fadeEnabled = false;

    if (prevKey && dragByUnit.has(prevKey)) {
      selectUnit(dragByUnit.get(prevKey));
    } else if (prevId) {
      const match = dragUnits.find(u => u.id === prevId);
      if (match) selectUnit(match);
      else deselect();
    }
  }

  function collectFade(obj, allowFade = true) {
    obj.traverse((c) => {
      if (!c.material) return;
      if (c.userData?.photoPlane) return;
      const m = c.material;
      /* the async photo tiers push their own fade entry (t:1) when the texture
         is already cached — never let the generic sweep override that claim,
         else a post-commit rebuild leaves the sprite pinned at opacity 0 */
      if (fadeMats.some((f) => f.m === m)) return;
      if (allowFade) {
        fadeMats.push({ m, from: 0, to: m.opacity == null ? 1 : m.opacity, wasT: m.transparent });
        m.transparent = true;
        m.opacity = 0;
      }
    });
  }

  /* ── drag-to-place & 3D multi-axis transform internals ──────────────── */
  const dragIdOf = (m) => (m && (m.id != null ? m.id : m.eqId)) ?? null;
  const unitKey = (m) => String(dragIdOf(m)) + '|' + String(m.unit != null ? m.unit : (m.slot != null ? m.slot : (m.idx != null ? m.idx : 0)));
  function registerDrag(mesh, o) {
    if (!onPinDrop) return;
    const m = o.meta;
    if (!m || dragIdOf(m) == null) return;
    if (m.kind !== 'equipment' && m.kind !== 'halo') return;
    const key = unitKey(m);
    let u = dragByUnit.get(key);
    if (!u) {
      const initRot = typeof o.rotY === 'number' ? o.rotY : (o.pos[2] < 0 ? Math.PI : 0);
      const initElev = (o.pos && Number.isFinite(o.pos[1])) ? o.pos[1] : 0;
      const initTilt = typeof o.tiltX === 'number' ? o.tiltX : 0;
      const initTiltZ = typeof o.tiltZ === 'number' ? o.tiltZ : 0;
      u = {
        id: String(dragIdOf(m)),
        name: m.name || m.id || 'Equipment',
        q: m.q || 0,
        key,
        targets: [],
        halos: [],
        targetOffsets: new Map(),
        initX: o.pos[0],
        initZ: o.pos[2],
        baseX: o.pos[0],
        baseZ: o.pos[2],
        baseY: initElev,
        rotY: initRot,
        tiltX: initTilt,
        tiltZ: initTiltZ,
        elev: initElev,
        fp: m.fp || { w: o.size ? o.size[0] : 1.5, d: o.size ? o.size[2] : 1.0, h: o.size ? o.size[1] : 1.5 }
      };
      dragByUnit.set(key, u);
      dragUnits.push(u);
    }
    if (m.kind === 'halo') {
      u.halos.push(mesh);
    } else {
      u.targets.push(mesh);
      u.targetOffsets.set(mesh, (o.pos && Number.isFinite(o.pos[1]) ? o.pos[1] : 0) - u.elev);
      updateContactShadows(u);
    }
  }

  function restoreHighlight(u) {
    if (!u) return;
    for (const target of u.targets) target.traverse?.((obj) => {
      if (!obj.material || obj.userData?.contactShadow) return;
      const shared = obj.userData.sharedMaterial;
      if (shared) {
        if (obj.material !== shared) obj.material.dispose?.();
        obj.material = shared;
        delete obj.userData.sharedMaterial;
        return;
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        const original = originalMaterials.get(mat);
        if (!original) continue;
        if (original.color && mat.color) mat.color.copy(original.color);
        if (original.emissive && mat.emissive) mat.emissive.copy(original.emissive);
        if (original.emissiveIntensity != null) mat.emissiveIntensity = original.emissiveIntensity;
        originalMaterials.delete(mat);
      }
    });
  }

  function applyHighlight(u, strength) {
    if (!u) return;
    for (const target of u.targets) target.traverse?.((obj) => {
      if (!obj.material || obj.userData?.contactShadow) return;
      /* rig parts share cached materials; highlight a private clone so other units stay untouched */
      if (!Array.isArray(obj.material) && obj.userData.sp3 && !obj.userData.sharedMaterial && !originalMaterials.has(obj.material)) {
        obj.userData.sharedMaterial = obj.material;
        obj.material = obj.material.clone();
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!originalMaterials.has(mat)) originalMaterials.set(mat, {
          color: mat.color?.clone(),
          emissive: mat.emissive?.clone(),
          emissiveIntensity: mat.emissiveIntensity
        });
        if (mat.emissive) {
          mat.emissive.set('#38bdf8');
          mat.emissiveIntensity = strength;
        } else if (mat.map && mat.color) {
          mat.color.set(strength > 0.3 ? '#c7e6ff' : '#dbeefe');
        }
      }
    });
  }

  function refreshHighlights() {
    const units = new Set([selectedUnit, hoverUnit].filter(Boolean));
    for (const u of units) restoreHighlight(u);
    if (hoverUnit && hoverUnit !== selectedUnit) applyHighlight(hoverUnit, 0.25);
    if (selectedUnit) applyHighlight(selectedUnit, 0.4);
  }

  function setHover(u) {
    if (hoverUnit === u) return;
    if (hoverUnit && hoverUnit !== selectedUnit) restoreHighlight(hoverUnit);
    hoverUnit = u;
    refreshHighlights();
  }

  function groundPoint(e) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    ray.setFromCamera(ndc, camera);
    const dy = ray.ray.direction.y;
    if (!(Math.abs(dy) > 1e-6)) return null;
    const t = -ray.ray.origin.y / dy;
    if (!Number.isFinite(t) || t <= 0) return null;
    const p = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    p.y = 0;
    return p;
  }

  function pickDragUnit(e) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    ray.setFromCamera(ndc, camera);

    if (selectedUnit && selectRingGroup.visible) {
      let gizmoHits = [];
      try { gizmoHits = ray.intersectObjects(gizmo.children, true); } catch (_) { gizmoHits = []; }
      for (const h of gizmoHits) {
        let n = h.object;
        while (n && n !== gizmo) {
          if (n.userData && n.userData.gizmo) return selectedUnit;
          n = n.parent;
        }
      }
    }

    let hits = [];
    try { hits = ray.intersectObjects(group.children, true); } catch (_) { hits = []; }
    for (const h of hits) {
      let n = h.object, sp = null;
      while (n) { if (n.userData && n.userData.sp3) { sp = n.userData.sp3; break; } n = n.parent; }
      if (!sp || !sp.meta) continue;
      const m = sp.meta;
      if (dragIdOf(m) == null) continue;
      if (m.kind !== 'equipment' && m.kind !== 'halo') continue;
      const u = dragByUnit.get(unitKey(m));
      if (u) return u;
    }
    return null;
  }

  function updateGroundRefs(u) {
    while (gizmoGround.children.length) disposeChild(gizmoGround.children.pop());
    if (!(u.elev > 0.02)) return;
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -u.elev, 0), new THREE.Vector3(0, 0, 0)
    ]);
    const lineMat = new THREE.LineDashedMaterial({ color: '#38bdf8', transparent: true, opacity: 0.7, dashSize: 0.12, gapSize: 0.08, depthTest: false });
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 999;
    line.computeLineDistances();
    line.userData = { gizmo: null };
    const w = Math.max(0.05, u.fp?.w || 1), d = Math.max(0.05, u.fp?.d || 1);
    const footprintGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-w / 2, -u.elev + 0.01, -d / 2),
      new THREE.Vector3(w / 2, -u.elev + 0.01, -d / 2),
      new THREE.Vector3(w / 2, -u.elev + 0.01, d / 2),
      new THREE.Vector3(-w / 2, -u.elev + 0.01, d / 2)
    ]);
    const footprint = new THREE.LineLoop(footprintGeo, new THREE.LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.7, depthTest: false }));
    footprint.renderOrder = 999;
    footprint.userData = { gizmo: null };
    gizmoGround.add(line, footprint);
  }

  function updateContactShadows(u) {
    for (const target of u.targets) {
      target.traverse?.((obj) => {
        if (!obj.userData?.contactShadow || !obj.material) return;
        obj.material.opacity = 0.38 * (1 - Math.min(0.8, Math.max(0, u.elev / 2)));
        obj.position.y = -u.elev - (u.targetOffsets.get(target) || 0) + 0.008;
        obj.rotation.order = 'YXZ';
        obj.rotation.set(-u.tiltX, 0, -u.tiltZ);
        obj.scale.setScalar(1 + Math.min(0.6, u.elev * 0.25));
      });
    }
  }

  function applyTransform(u, tx, tz, elev, rotY, tiltX, tiltZ, isDragging) {
    u.baseX = tx;
    u.baseZ = tz;
    u.elev = Number.isFinite(elev) ? Math.max(0, Math.min(6, elev)) : 0;
    if (u.elev < 0.05) u.elev = 0;
    u.rotY = Number.isFinite(rotY) ? rotY : 0;
    u.tiltX = Number.isFinite(tiltX) ? Math.max(-0.8, Math.min(0.8, tiltX)) : 0;
    u.tiltZ = Number.isFinite(tiltZ) ? Math.max(-0.8, Math.min(0.8, tiltZ)) : 0;

    const targetY = (isDragging ? 0.04 : 0) + u.elev;
    for (const t of u.targets) {
      t.position.set(tx, targetY + (u.targetOffsets.get(t) || 0), tz);
      t.rotation.order = 'YXZ';
      t.rotation.set(u.tiltX, u.rotY, u.tiltZ);
    }
    for (const h of u.halos) {
      h.position.set(tx, 0.005, tz);
    }
    selectRingGroup.position.set(tx, u.elev || 0, tz);
    selectRingGroup.rotation.y = u.rotY;
    worldHandles.rotation.y = -u.rotY;
    selectRingGroup.visible = true;
    updateGroundRefs(u);
    updateContactShadows(u);
    updateHud(u);
    drag.lastT = [tx, tz];
  }

  function commitTransform(u) {
    if (!onPinDrop || !u) return;
    const l = state.config.dims && +state.config.dims.l, w = state.config.dims && +state.config.dims.w;
    const L = Number.isFinite(l) && l > 0 ? l : 20, W = Number.isFinite(w) && w > 0 ? w : 12;
    const hx = +(u.baseX + L / 2).toFixed(2);
    const vz = +(u.baseZ + W / 2).toFixed(2);
    onPinDrop(u.id, hx, vz, u.q || 0, +(u.rotY).toFixed(3), +(u.elev).toFixed(3), +(u.tiltX || 0).toFixed(3), +(u.tiltZ || 0).toFixed(3));
  }

  function cancelDrag(restore) {
    if (!drag.on) return;
    const u = drag.unit;
    drag.on = false; drag.started = false; drag.unit = null; drag.lastT = null; drag.ptr = null;
    controls.enabled = true;
    controls.enableZoom = true;
    canvas.style.cursor = '';
    if (restore && u) {
      try { applyTransform(u, u.baseX, u.baseZ, u.elev, u.rotY, u.tiltX, u.tiltZ, false); } catch (_) { }
    }
  }

  function gizmoModeAt(e) {
    if (!selectedUnit || !gizmo.visible) return null;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    ray.setFromCamera(ndc, camera);
    let hits = [];
    try { hits = ray.intersectObjects(gizmo.children, true); } catch (_) { hits = []; }
    for (const h of hits) {
      let n = h.object;
      while (n && n !== gizmo) {
        if (n.userData && n.userData.gizmo) return n.userData.gizmo;
        n = n.parent;
      }
    }
    return null;
  }

  function clearGuides() {
    while (guides.children.length) disposeChild(guides.children.pop());
  }

  function applySnapping(u, tx, tz, free, axis = 'both') {
    clearGuides();
    if (free) return [tx, tz];
    if (drag.snap.grid) {
      if (axis !== 'z') tx = Math.round(tx / 0.25) * 0.25;
      if (axis !== 'x') tz = Math.round(tz / 0.25) * 0.25;
    }
    const l = state.config.dims && +state.config.dims.l, w = state.config.dims && +state.config.dims.w;
    const L = Number.isFinite(l) && l > 0 ? l : 20, W = Number.isFinite(w) && w > 0 ? w : 12;
    const xs = [-L / 2, 0, L / 2], zs = [-W / 2, 0, W / 2];
    for (const other of dragUnits) {
      if (other === u) continue;
      xs.push(other.baseX);
      zs.push(other.baseZ);
    }
    let xGuide = null, zGuide = null;
    if (axis !== 'z') for (const c of xs) {
      if (Math.abs(tx - c) < 0.2) { tx = c; xGuide = c; break; }
    }
    if (axis !== 'x') for (const c of zs) {
      if (Math.abs(tz - c) < 0.2) { tz = c; zGuide = c; break; }
    }
    const guideMat = () => {
      return new THREE.LineBasicMaterial({ color: '#f472b6', transparent: true, opacity: 0.9, depthTest: false });
    };
    if (xGuide != null) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(xGuide, 0.02, -W / 2 - PIN_PAD),
        new THREE.Vector3(xGuide, 0.02, W / 2 + PIN_PAD)
      ]);
      const line = new THREE.Line(g, guideMat());
      line.renderOrder = 998;
      guides.add(line);
    }
    if (zGuide != null) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-L / 2 - PIN_PAD, 0.02, zGuide),
        new THREE.Vector3(L / 2 + PIN_PAD, 0.02, zGuide)
      ]);
      const line = new THREE.Line(g, guideMat());
      line.renderOrder = 998;
      guides.add(line);
    }
    return [tx, tz];
  }

  function onPointerDown(e) {
    noteInteraction();
    if (drag.on) return;
    if (e.target !== canvas) return;
    try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (_e) { } }
    const prop = pickProp(e);
    if (prop) {
      const hit = groundPoint(e);
      const pv = pointerVelocity();
      if (prop.userData.propKind === 'racket') hitRacket(prop, pv.length() > 1.2 ? pv : null);
      else if (prop.userData.propKind === 'frisbee') kickBody(prop, hit, pv.length() > 1.2 ? pv : null);
      else if (prop.userData.propKind === 'ball') kickBody(prop, hit, pv.length() > 1.2 ? pv : null);
      e.preventDefault(); e.stopPropagation();
      return;
    }
    if (!onPinDrop) {
      if (e.button === 0 && e.detail >= 2) resetProps();
      return;
    }
    const u = pickDragUnit(e);
    if (!u) {
      if (e.button === 0 && e.detail >= 2) resetProps();
      if (e.button === 0 && selectedUnit && !drag.on) deselect();
      return;
    }
    selectUnit(u);
    const g = groundPoint(e);
    let mode = gizmoModeAt(e) || 'move';
    if (mode === 'move' && (e.button === 2 || e.ctrlKey)) mode = 'rot';
    else if (mode === 'move' && e.shiftKey) mode = 'elev';
    else if (mode === 'move' && e.altKey) mode = 'tilt';
    if (!g && !['elev', 'tilt-x', 'tilt-z'].includes(mode)) return;
    drag.on = true; drag.started = false; drag.unit = u; drag.mode = mode; drag.ptr = e.pointerId;
    drag.startX = e.clientX; drag.startY = e.clientY;
    drag.startRot = u.rotY || 0; drag.startElev = u.elev || 0;
    drag.startTiltX = u.tiltX || 0; drag.startTiltZ = u.tiltZ || 0;
    drag.startBaseX = u.baseX; drag.startBaseZ = u.baseZ;
    const gx = g ? g.x : u.baseX, gz = g ? g.z : u.baseZ;
    drag.startAngle = Math.atan2(gz - u.baseZ, gx - u.baseX);
    drag.startG = { x: gx, z: gz };
    drag.offX = gx - u.baseX; drag.offZ = gz - u.baseZ; drag.lastT = null;
    drag.free = spaceHeld;
    controls.enabled = false;
    controls.enableZoom = false;
    canvas.style.cursor = (mode === 'rot' || mode === 'tilt' || mode === 'tilt-x' || mode === 'tilt-z' || mode === 'elev') ? 'ns-resize' : 'grabbing';
    e.preventDefault(); e.stopPropagation();
    try { el.setPointerCapture(e.pointerId); } catch (_) { }
  }

  function onPointerMove(e) {
    if (!drag.on) {
      if (e.target === canvas) {
        const point = groundPoint(e);
        if (point) {
          pointerTrail.push({ x: point.x, z: point.z, t: typeof performance !== 'undefined' ? performance.now() : Date.now() });
          const now = pointerTrail[pointerTrail.length - 1].t;
          while (pointerTrail.length > 6 || (pointerTrail.length && now - pointerTrail[0].t > 120)) pointerTrail.shift();
        }
        const prop = pickProp(e);
        if (prop) {
          setPropHover(prop);
          setHover(null);
          canvas.style.cursor = 'pointer';
          const pv = pointerVelocity();
          const speed = pv.length();
          const b = prop.userData;
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          if (prop.userData.propKind === 'racket' && speed > 1.2) {
            hitRacket(prop, pv);
          } else if (['ball', 'frisbee'].includes(prop.userData.propKind) && speed > 1.2 &&
            now - (b.lastKickT || 0) > 180) {
            kickBody(prop, groundPoint(e), pv);
          }
          return;
        }
        setPropHover(null);
      }
      if (onPinDrop && e.target === canvas && dragUnits.length) {
        const hovered = pickDragUnit(e);
        setHover(hovered);
        const mode = gizmoModeAt(e);
        if (mode) {
          gizmoMaterials.forEach(({ material, color }) => material.color.copy(color));
          const r = canvas.getBoundingClientRect();
          ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
          ndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
          ray.setFromCamera(ndc, camera);
          let hits = [];
          try { hits = ray.intersectObjects(gizmo.children, true); } catch (_) { hits = []; }
          for (const h of hits) {
            let n = h.object;
            while (n && n !== gizmo) {
              if (n.userData?.gizmo === mode && n.material?.color) {
                n.material.color.lerp(new THREE.Color('#ffffff'), 0.45);
              }
              n = n.parent;
            }
          }
          canvas.style.cursor = mode === 'rot' ? 'ew-resize' : (mode === 'elev' || mode === 'tilt' || mode === 'tilt-x' || mode === 'tilt-z' ? 'ns-resize' : 'grab');
          controls.enableZoom = false;
        } else {
          gizmoMaterials.forEach(({ material, color }) => material.color.copy(color));
          canvas.style.cursor = hovered ? 'grab' : '';
          controls.enableZoom = !hovered && !mode;
        }
      }
      return;
    }
    const u = drag.unit;
    if (!u) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
      drag.started = true;
    }
    if (drag.mode === 'rot') {
      const g = groundPoint(e);
      if (g) {
        const currentAngle = Math.atan2(g.z - u.baseZ, g.x - u.baseX);
        const deltaAngle = currentAngle - drag.startAngle;
        let newRot = drag.startRot + deltaAngle;
        if (drag.snap.rot && !drag.free) newRot = Math.round(newRot / (Math.PI / 12)) * (Math.PI / 12);
        applyTransform(u, u.baseX, u.baseZ, u.elev, newRot, u.tiltX, u.tiltZ, true);
      }
    } else if (drag.mode === 'rotate') {
      const deltaX = (e.clientX - drag.startX) * 0.02;
      let newRot = drag.startRot + deltaX;
      if (drag.snap.rot && !drag.free) newRot = Math.round(newRot / (Math.PI / 12)) * (Math.PI / 12);
      applyTransform(u, u.baseX, u.baseZ, u.elev, newRot, u.tiltX, u.tiltZ, true);
    } else if (drag.mode === 'tilt') {
      const deltaX = (e.clientX - drag.startX) * 0.01;
      const deltaY = -(e.clientY - drag.startY) * 0.01;
      const tiltX = Math.max(-0.8, Math.min(0.8, drag.startTiltX + deltaY));
      const tiltZ = Math.max(-0.8, Math.min(0.8, drag.startTiltZ + deltaX));
      applyTransform(u, u.baseX, u.baseZ, u.elev, u.rotY, tiltX, tiltZ, true);
    } else if (drag.mode === 'tilt-x' || drag.mode === 'tilt-z') {
      const deltaY = -(e.clientY - drag.startY) * 0.01;
      const value = Math.max(-0.8, Math.min(0.8, (drag.mode === 'tilt-x' ? drag.startTiltX : drag.startTiltZ) + deltaY));
      applyTransform(u, u.baseX, u.baseZ, u.elev, u.rotY, drag.mode === 'tilt-x' ? value : u.tiltX, drag.mode === 'tilt-z' ? value : u.tiltZ, true);
    } else if (drag.mode === 'elev') {
      const deltaY = -(e.clientY - drag.startY) * 0.01;
      const newElev = Math.max(0, Math.min(6.0, drag.startElev + deltaY));
      applyTransform(u, u.baseX, u.baseZ, newElev, u.rotY, u.tiltX, u.tiltZ, true);
    } else {
      const g = groundPoint(e);
      if (!g) return;
      let tx = drag.mode === 'move-x' ? drag.startBaseX + (g.x - drag.startG.x) : g.x - drag.offX;
      let tz = drag.mode === 'move-z' ? drag.startBaseZ + (g.z - drag.startG.z) : g.z - drag.offZ;
      const l = state.config.dims && +state.config.dims.l, w = state.config.dims && +state.config.dims.w;
      const L = Number.isFinite(l) && l > 0 ? l : 20, W = Number.isFinite(w) && w > 0 ? w : 12;
      tx = Math.max(-L / 2 - PIN_PAD, Math.min(L / 2 + PIN_PAD, tx));
      tz = Math.max(-W / 2 - PIN_PAD, Math.min(W / 2 + PIN_PAD, tz));
      [tx, tz] = applySnapping(u, tx, tz, drag.free, drag.mode === 'move-x' ? 'x' : (drag.mode === 'move-z' ? 'z' : 'both'));
      if (drag.mode === 'move-x') tz = u.baseZ;
      if (drag.mode === 'move-z') tx = u.baseX;
      applyTransform(u, tx, tz, u.elev, u.rotY, u.tiltX, u.tiltZ, true);
    }
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (!drag.on) return;
    const u = drag.unit, started = drag.started;
    drag.on = false; drag.started = false; drag.unit = null; drag.ptr = null;
    controls.enabled = true;
    controls.enableZoom = true;
    canvas.style.cursor = '';
    try { el.releasePointerCapture(e.pointerId); } catch (_) { }
    if (!started || !u) {
      if (u) applyTransform(u, u.baseX, u.baseZ, u.elev, u.rotY, u.tiltX, u.tiltZ, false);
      clearGuides();
      return;
    }
    applyTransform(u, u.baseX, u.baseZ, u.elev, u.rotY, u.tiltX, u.tiltZ, false);
    clearGuides();
    commitTransform(u);
  }

  function onWheel(e) {
    noteInteraction();
    if (state.disposed) return;
    const r = canvas.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    const hit = pickDragUnit(e);
    if (!drag.on && !selectedUnit && !hit) return;
    if (!drag.on && !hit && !selectedUnit) return;
    e.preventDefault();
    e.stopPropagation();
    if (!selectedUnit) return;
    const u = selectedUnit;
    const sign = Math.sign(e.deltaY || e.detail || 0);
    if (e.shiftKey) {
      u.elev = Math.max(0, Math.min(6.0, (u.elev || 0) + (sign > 0 ? -0.1 : 0.1)));
    } else if (e.ctrlKey) {
      u.rotY = (u.rotY || 0) + (sign > 0 ? 15 : -15) * Math.PI / 180;
    } else if (e.altKey) {
      u.tiltX = Math.max(-0.8, Math.min(0.8, (u.tiltX || 0) + (sign > 0 ? -0.05 : 0.05)));
    } else {
      u.elev = Math.max(0, Math.min(6.0, (u.elev || 0) + (sign > 0 ? -0.1 : 0.1)));
    }
    applyTransform(u, u.baseX, u.baseZ, u.elev, u.rotY, u.tiltX, u.tiltZ, false);
    commitTransform(u);
  }

  function onSceneKey(e) {
    noteInteraction();
    if (e.code === 'Space') { spaceHeld = e.type === 'keydown'; e.preventDefault(); return; }
    const u = selectedUnit;
    if (!u) return;
    const step = e.shiftKey ? 1 : 0.1;
    let handled = true;
    if (e.key === 'ArrowLeft') u.baseX -= step;
    else if (e.key === 'ArrowRight') u.baseX += step;
    else if (e.key === 'ArrowUp') u.baseZ -= step;
    else if (e.key === 'ArrowDown') u.baseZ += step;
    else if (e.key === 'PageUp') u.elev = Math.min(6, (u.elev || 0) + 0.1);
    else if (e.key === 'PageDown') u.elev = Math.max(0, (u.elev || 0) - 0.1);
    else if (e.key.toLowerCase() === 'q') u.rotY = (u.rotY || 0) - Math.PI / 12;
    else if (e.key.toLowerCase() === 'e') u.rotY = (u.rotY || 0) + Math.PI / 12;
    else if (e.key.toLowerCase() === 'r') { u.rotY = 0; u.tiltX = 0; u.tiltZ = 0; u.elev = 0; }
    else if (e.key === 'Escape') { e.preventDefault(); deselect(); return; }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (onUnpin) onUnpin(u.id);
      deselect();
      e.preventDefault();
      return;
    } else handled = false;
    if (!handled) return;
    e.preventDefault();
    applyTransform(u, u.baseX, u.baseZ, u.elev, u.rotY, u.tiltX, u.tiltZ, false);
    commitTransform(u);
  }

  const onContextMenu = (e) => { if (pickProp(e) || pickDragUnit(e)) e.preventDefault(); };
  const onSpaceUp = (e) => { if (e.code === 'Space') spaceHeld = false; };
  const onPointerCancel = () => cancelDrag(true);
  const onPointerLeave = () => { if (!drag.on) { setHover(null); setPropHover(null); controls.enableZoom = true; } };
  el.addEventListener('pointerdown', onPointerDown, true);
  el.addEventListener('keydown', onSceneKey);
  el.setAttribute('tabindex', '0');
  el.style.outline = 'none';
  canvas.addEventListener('wheel', onWheel, { passive: false });
  hudEl.addEventListener('wheel', (e) => {
    if (selectedUnit) { e.preventDefault(); e.stopPropagation(); }
  }, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('pointerleave', onPointerLeave);
  if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerCancel, true);
    window.addEventListener('keyup', onSpaceUp, true);
  }
  function disposeChild(c) {
    if (!c) return;
    if (c.traverse) c.traverse((x) => {
      if (x.geometry && x.geometry.dispose) x.geometry.dispose();
      if (x.material) {
        const mats = Array.isArray(x.material) ? x.material : [x.material];
        mats.forEach((m) => {
          if (m.map && !CACHED_TEX.has(m.map) && m.map.dispose) m.map.dispose();
          if (m.alphaMap && !CACHED_TEX.has(m.alphaMap) && m.alphaMap.dispose) m.alphaMap.dispose();
          if (m.dispose) m.dispose();
        });
      }
    });
  }

  function num0(d, k, fb) { const v = d && +d[k]; return Number.isFinite(v) && v > 0 ? v : fb; }

  /* sun + fill lighting sized from the facility bounding box */
  function fitSun() {
    const bb = new THREE.Box3().setFromObject(group);
    if (bb.isEmpty()) return;
    const c = bb.getCenter(new THREE.Vector3());
    const sz = bb.getSize(new THREE.Vector3());
    const r = Math.max(4, Math.max(sz.x, sz.z) / 2);
    sun.position.set(c.x + 32, 30, c.z + 14);
    sun.target.position.copy(c);
    fillLight.position.set(c.x - r * 1.5, r * 1.8, c.z - r * 1.2);
    fillLight.target.position.copy(c);
    rimLight.target.position.copy(c);
    const L = num0(state.config?.dims, 'l', 20), W = num0(state.config?.dims, 'w', 12);
    const shadowExtent = Math.max(L, W) / 2 + 8;
    const marginX = shadowExtent, marginZ = shadowExtent;
    sun.shadow.camera.left = -marginX;
    sun.shadow.camera.right = marginX;
    sun.shadow.camera.top = marginZ;
    sun.shadow.camera.bottom = -marginZ;
    sun.shadow.camera.updateProjectionMatrix();
  }

  /* ── camera: fit / views — presence bias: steeper 3/4 aerial, tighter margin ── */
  function fitInfo() {
    const bb = new THREE.Box3().setFromObject(group);
    const c = bb.isEmpty() ? new THREE.Vector3() : bb.getCenter(new THREE.Vector3());
    const sz = bb.isEmpty() ? new THREE.Vector3(20, 0, 12) : bb.getSize(new THREE.Vector3());
    const r = Math.max(3, Math.hypot(sz.x, sz.z) / 2) + sz.y * 0.15;
    const vFov = camera.fov * Math.PI / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const dist = Math.max(r / Math.tan(hFov / 2), r / Math.tan(vFov / 2)) * 1.02;
    return { c, r, dist, bb, hFov, vFov };
  }
  /* smallest camera distance along `dir` (from `target`) that keeps every
     corner of `bb` inside the frustum — tight framing instead of a bounding
     sphere, so a long rectangular field fills the viewport                 */
  function fitDistance(bb, target, dir, hFov, vFov) {
    const f = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, f).normalize();
    const th = Math.tan(hFov / 2), tv = Math.tan(vFov / 2);
    let D = 0;
    const p = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).sub(target);
      const depth = p.dot(f);
      D = Math.max(D, Math.abs(p.dot(right)) / th - depth, Math.abs(p.dot(up)) / tv - depth);
    }
    return D * 1.04 + 0.5;
  }
  let cameraTween = null;
  function cancelCameraTween() { cameraTween = null; }
  let idleTimer = 0;
  function noteInteraction() {
    cancelCameraTween();
    controls.autoRotate = false;
    if (idleTimer) clearTimeout(idleTimer);
    if (reducedMotion) return;
    idleTimer = setTimeout(() => {
      if (!state.disposed && state.view !== 'top' && !selectedUnit) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.35;
      }
    }, 6000);
  }
  function tweenCamera(position, target, duration = 700, immediate = false) {
    if (immediate || reducedMotion) {
      camera.position.copy(position); controls.target.copy(target); controls.update(); cameraTween = null; return;
    }
    cameraTween = {
      fromP: camera.position.clone(), toP: position.clone(),
      fromT: controls.target.clone(), toT: target.clone(),
      start: performance.now(), duration
    };
  }
  function doFit(immediate = false, margin = 1) {
    const { c, r, bb, hFov, vFov } = fitInfo();
    let dist;
    const targetY = 0.3;
    const target = new THREE.Vector3(c.x, targetY, c.z);
    let position;
    if (state.view === 'top') {
      const box = bb.isEmpty() ? new THREE.Box3(new THREE.Vector3(-10, 0, -6), new THREE.Vector3(10, 0, 6)) : bb;
      dist = fitDistance(box, target, new THREE.Vector3(0, 1, 0.00001).normalize(), hFov, vFov);
      position = new THREE.Vector3(c.x, Math.max(12, dist * margin), c.z + 0.001);
    } else {
      const park = SCENE_SPECS.sports?.[state.config.sport]?.kind === 'park';
      const elevation = (park ? 33 : 28) * Math.PI / 180;
      const cosEl = Math.cos(elevation);
      const dir = new THREE.Vector3(cosEl * 0.647, Math.sin(elevation), -cosEl * 0.763).normalize();
      /* frame the field itself (plus a strip of apron); poles/benches outside
         the perimeter may crop — they read fine at the edge and the court stays big */
      const L = num0(state.config?.dims, 'l', 20), W = num0(state.config?.dims, 'w', 12);
      const pad = park ? 1.2 : 2.0;
      const top = bb.isEmpty() ? 2 : Math.min(bb.max.y, park ? 6 : 5);
      const box = new THREE.Box3(
        new THREE.Vector3(c.x - L / 2 - pad, 0, c.z - W / 2 - pad),
        new THREE.Vector3(c.x + L / 2 + pad, top, c.z + W / 2 + pad)
      );
      dist = fitDistance(box, target, dir, hFov, vFov);
      position = target.clone().add(dir.multiplyScalar(dist * margin));
    }
    controls.minDistance = r * 0.25;
    controls.maxDistance = dist * 4 * margin;
    tweenCamera(position, target, 700, immediate);
  }
  function viewCenter() {
    if (!el || !canvas || !camera) return null;
    const L = num0(state.config?.dims, 'l', 20);
    const W = num0(state.config?.dims, 'w', 12);
    ndc.set(0, 0);
    ray.setFromCamera(ndc, camera);
    const hit = ray.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      new THREE.Vector3()
    );
    const target = hit || controls.target;
    const halfL = Math.max(0, L / 2 - 1);
    const halfW = Math.max(0, W / 2 - 1);
    const cx = Math.min(halfL, Math.max(-halfL, target.x));
    const cz = Math.min(halfW, Math.max(-halfW, target.z));
    return { x: cx + L / 2, z: cz + W / 2 };
  }
  function selectById(id, retry = true) {
    const u = dragUnits.find(item => String(item.id) === String(id) && (item.q || 0) === 0);
    if (u) {
      selectUnit(u);
      return true;
    }
    if (retry && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => selectById(id, false));
    }
    return false;
  }
  function setView(v) {
    state.view = v === 'top' ? 'top' : 'perspective';
    controls.minPolarAngle = state.view === 'top' ? 0 : 0.35;
    controls.maxPolarAngle = state.view === 'top' ? 0.001 : 1.45;
    /* technical view stays clean: photos out, footprint plates + halos stay */
    billboards.forEach((b) => { b.visible = state.view !== 'top'; });
    doFit(false);
    syncToolbar();
  }
  function toggleDims() {
    state.dims = !state.dims;
    dimsGroup.visible = state.dims;
    syncToolbar();
  }
  function syncToolbar() {
    toolbar.querySelectorAll('[data-sp3d]').forEach((b) => {
      const a = b.dataset.sp3d;
      const on = (a === 'perspective' && state.view === 'perspective') || (a === 'top' && state.view === 'top') ||
                 (a === 'dims' && state.dims) || (a === 'night' && state.night) ||
                 (a === 'fullscreen' && state.fs) || (a.startsWith('surround:') && a.slice(9) === state.surround);
      b.classList.toggle('active', !!on);
      b.classList.toggle('on', !!on);
      if (a === 'fullscreen') b.textContent = tr(state.fs ? 'exitFullscreen' : 'fullscreen');
    });
  }

  /* ── fullscreen (element goes fixed inset:0; Esc exits) ── */
  let savedStyle = null;
  function setFullscreen(on) {
    on = !!on;
    if (on === state.fs) return;
    state.fs = on;
    if (on) {
      savedStyle = el.getAttribute('style');
      el.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(10,14,20,0.94);';
      el.classList.add('sp3d-fs');
      window.addEventListener('keydown', onKey);
    } else {
      el.classList.remove('sp3d-fs');
      if (savedStyle != null) el.setAttribute('style', savedStyle);
      else el.removeAttribute('style');
      const cs2 = getComputedStyle(el);
      if (cs2.position === 'static') el.style.position = 'relative';
      window.removeEventListener('keydown', onKey);
    }
    fitSize();
    syncToolbar();
  }
  function onKey(e) {
    if (e.key === 'Escape') setFullscreen(false);
  }

  /* ── sizing ── */
  function fitSize() {
    if (state.disposed) return;
    const w = el.clientWidth || 0, h = el.clientHeight || 0;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function setShadowMapSize(light, size) {
    if (!light?.shadow) return;
    light.shadow.mapSize.set(size, size);
    if (light.shadow.map) {
      light.shadow.map.dispose();
      light.shadow.map = null;
    }
  }
  function applyQualityLevel(level) {
    qualityLevel = Math.max(0, Math.min(3, level));
    state.qualityLevel = qualityLevel;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    renderer.setPixelRatio(qualityLevel === 0 ? Math.min(dpr, 2) : qualityLevel === 1 ? Math.min(dpr, 1.25) : 1);
    if (qualityLevel >= 2) {
      setShadowMapSize(sun, 1024);
      nightLights.traverse((node) => { if (node.isSpotLight) setShadowMapSize(node, 512); });
    } else {
      setShadowMapSize(sun, 2048);
      nightLights.traverse((node) => { if (node.isSpotLight) setShadowMapSize(node, 1024); });
    }
    if (qualityLevel >= 3) {
      renderer.shadowMap.type = THREE.PCFShadowMap;
      nightLights.traverse((node) => { if (node.isSpotLight) node.castShadow = false; });
    } else {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    fitSize();
  }
  function stepQualityDown() {
    if (qualityLevel >= 3) return;
    applyQualityLevel(qualityLevel + 1);
    console.info(`[sports3d] adaptive quality level ${qualityLevel}`);
  }
  function sampleQuality(now, elapsed) {
    if (now - qualitySince < 2000 || elapsed <= 0 || elapsed > 250) return;
    qualitySamples.push(elapsed);
    qualityFrames++;
    if (qualityFrames < 60) return;
    const mean = qualitySamples.reduce((sum, value) => sum + value, 0) / qualitySamples.length;
    qualityFrames = 0;
    qualitySamples = [];
    if (mean > 28) stepQualityDown();
  }
  function canRunLoop() {
    return !state.disposed && !state.contextLost &&
      !(typeof document !== 'undefined' && document.hidden) && intersecting;
  }
  function startLoop() {
    if (loopRunning || !canRunLoop()) return;
    loopRunning = true;
    lastPropTick = 0;
    raf = requestAnimationFrame(tick);
  }
  function stopLoop() {
    loopRunning = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastPropTick = 0;
  }
  function onVisibilityChange() {
    if (canRunLoop()) startLoop();
    else stopLoop();
  }
  function onIntersection(entries) {
    intersecting = !!entries[0]?.isIntersecting;
    onVisibilityChange();
  }
  function onContextLost(e) {
    e.preventDefault();
    state.contextLost = true;
    contextLossNotified = false;
    stopLoop();
    clearTimeout(contextLossTimer);
    contextLossTimer = setTimeout(() => {
      if (state.contextLost && !contextLossNotified) {
        contextLossNotified = true;
        onContextLostCallback?.(new Error('WebGL context lost'));
      }
    }, 4000);
  }
  function onContextRestored() {
    state.contextLost = false;
    contextLossNotified = false;
    clearTimeout(contextLossTimer);
    lastPropTick = 0;
    renderer.render(scene, camera);
    startLoop();
  }

  /* ── render loop: orbit damping + ≤250 ms ease-in of new content ── */
  const photoWorld = new THREE.Vector3();
  function tick() {
    if (!canRunLoop()) {
      loopRunning = false;
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = lastPropTick ? Math.max(0, now - lastPropTick) : 0;
    const dt = Math.min(0.05, elapsed / 1000);
    lastPropTick = now;
    frameCount++;
    sampleQuality(now, elapsed);
    if (cameraTween) {
      const k = Math.min(1, (now - cameraTween.start) / cameraTween.duration);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.lerpVectors(cameraTween.fromP, cameraTween.toP, e);
      controls.target.lerpVectors(cameraTween.fromT, cameraTween.toT, e);
      if (k >= 1) cameraTween = null;
    }
    if (nightTween) {
      const k = nightTween.start === -Infinity ? 1 : Math.min(1, (now - nightTween.start) / 1200);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const value = THREE.MathUtils.lerp(nightTween.from, nightTween.to, e);
      nightTween.value = value;
      applyNightMix(value);
      if (k >= 1) nightTween = null;
    }
    for (let i = fenceMorphs.length - 1; i >= 0; i--) {
      const f = fenceMorphs[i];
      const k = Math.min(1, (now - f.start) / 450);
      const e = 1 - Math.pow(1 - k, 3);
      f.obj.scale.y = THREE.MathUtils.lerp(f.from, f.to, e);
      if (k >= 1) fenceMorphs.splice(i, 1);
    }
    for (let i = lightingPops.length - 1; i >= 0; i--) {
      const f = lightingPops[i];
      const k = Math.min(1, (now - f.start) / 400);
      const e = k === 1 ? 1 : 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
      f.obj.scale.setScalar(THREE.MathUtils.lerp(0.85, 1, e));
      if (k >= 1) lightingPops.splice(i, 1);
    }
    if (fadeMats.length) {
      const k = Math.min(1, (now - fadeStart) / FADE_MS);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      if (k >= 1) {
        fadeMats.forEach(({ m, to, wasT }) => { m.opacity = to; m.transparent = wasT; if (m.userData) delete m.userData.fadeQueued; });
        while (pendingDispose.length) {
          const old = pendingDispose.shift();
          if (old.parent) old.parent.remove(old);
          disposeChild(old);
        }
        fadeMats.length = 0;
      } else fadeMats.forEach(({ m, from, to }) => { m.opacity = THREE.MathUtils.lerp(from, to, e); });
    }
    controls.update();
    if (gizmo.visible) {
      const d = camera.position.distanceTo(gizmo.position);
      gizmo.scale.setScalar(Math.max(0.6, Math.min(3, d * 0.045)));
      ringMesh.material.opacity = 0.55 + 0.3 * Math.sin(now / 300);
    }
    if (propRoots.length) {
      const visualScale = propVisualScale();
      propRoots.forEach((root) => applyPropVisualScale(root, visualScale));
    }
    group.traverse((node) => {
      if (node.userData?.photoCard !== true) return;
      const world = node.getWorldPosition(photoWorld);
      const cardScale = THREE.MathUtils.clamp(camera.position.distanceTo(world) * 0.02, 0.2, 0.65);
      node.scale.set(cardScale * 0.45, cardScale * 0.45, 1);
      const owner = node.parent;
      const active = (selectedUnit && selectedUnit.targets.includes(owner)) ||
        (hoverUnit && hoverUnit.targets.includes(owner));
      node.visible = state.view !== 'top' && (!!active || !!selectedUnit || !!hoverUnit);
    });
    if (state.view !== 'top') {
      for (const a of ANIMATED) {
        if (a.userData.spin) a.rotation.y += (a.userData.speed || 0.15) / 60;
        if (a.userData.amp) a.rotation.x = a.userData.amp * Math.sin(now / (a.userData.period || 2000) + (a.userData.phase || 0));
        if (a.userData.sway) a.rotation.z = a.userData.amp * Math.sin(now / (a.userData.period || 2000) + (a.userData.phase || 0));
        if (a.userData.ripple && a.material && a.material.map) {
          a.material.map.offset.x += 0.00025;
          a.material.map.offset.y += 0.00015;
        }
      }
      updateProps(now, dt);
    }
    updateFx(dt);
    if (propHintEl) propHintEl.style.display = propRoots.length && !selectedUnit ? 'block' : 'none';

    renderer.render(scene, camera);
  }

  rebuild(config || {}, true);
  el.appendChild(canvas);
  el.appendChild(toolbar);
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver(onIntersection, { threshold: 0 });
    intersectionObserver.observe(el);
  }
  fitSize();
  doFit(true);
  if (state.night) setNight(true, true);
  syncToolbar();
  startLoop();

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(fitSize);
    ro.observe(el);
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', fitSize);
  }

  const handle = {
    update(cfg) {
      const prevConfig = state.config || {};
      const sportChanged = state.config?.sport !== cfg?.sport;
      const nextKey = sceneStaticKey(cfg || {});
      if (staticSceneKey == null || nextKey !== staticSceneKey) {
        const fenceOnly = sceneFacilityKey(prevConfig) === sceneFacilityKey(cfg || {}) &&
          configFenceHeight(prevConfig) !== configFenceHeight(cfg || {});
        const fenceOnChanged = configFenceOn(prevConfig) !== configFenceOn(cfg || {});
        const lightingOn = Number(prevConfig?.lighting?.poles || 0) <= 0 && Number(cfg?.lighting?.poles || 0) > 0;
        rebuild(cfg, false, { fenceMorph: fenceOnly, oldFenceHeight: configFenceHeight(prevConfig), lightingPop: lightingOn });
        if (sportChanged || fenceOnly || fenceOnChanged || lightingOn) doFit(false, lightingOn ? 1.15 : 1);
      } else {
        updateEquipment(cfg);
      }
    },
    viewCenter,
    selectById,
    setView,
    fit() { doFit(); },
    toggleDims,
    setNight,
    setSurround,
    setFullscreen,
    quality() { return qualityLevel; },
    stats() { return { frames: frameCount, quality: qualityLevel, running: loopRunning, contextLost: state.contextLost }; },
    propsDebug() { return PROPS.children.length; },
    rebuildDebug() { return rebuildCount; },
    /* test hook: drag registry snapshot (ids, bases, part counts) */
    dragDebug() {
      return { cb: !!onPinDrop, on: drag.on,
        units: dragUnits.map((u) => ({ id: u.id, q: u.q, base: [u.baseX, u.baseZ],
          parts: [...u.targets, ...u.halos].map((obj) => ({ t: obj.type || obj.constructor?.name,
            k: obj.userData?.sp3?.meta?.part || null,
            op: obj.material ? +obj.material.opacity.toFixed(2) : null,
            map: !!(obj.material && obj.material.map) })) })) };
    },
    destroy() {
      state.disposed = true;
      stopLoop();
      clearTimeout(contextLossTimer);
      if (intersectionObserver) intersectionObserver.disconnect();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('webglcontextlost', onContextLost, false);
      canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
      if (ro) ro.disconnect();
      else if (typeof window !== 'undefined') window.removeEventListener('resize', fitSize);
      window.removeEventListener('keydown', onKey);
      el.removeEventListener('pointerdown', onPointerDown, true);
      el.removeEventListener('keydown', onSceneKey);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerCancel, true);
      window.removeEventListener('keyup', onSpaceUp, true);
      }
      controls.dispose();
      while (group.children.length) disposeChild(group.children.pop());
      if (surroundGroup) {
        environment.remove(surroundGroup);
        disposeChild(surroundGroup);
        surroundGroup = null;
      }
      while (PROPS.children.length) PROPS.remove(PROPS.children[PROPS.children.length - 1]);
      clearFx();
      while (dimsGroup.children.length) disposeChild(dimsGroup.children.pop());
      while (guides.children.length) disposeChild(guides.children.pop());
      while (gizmo.children.length) disposeChild(gizmo.children.pop());
      scene.remove(guides, gizmo, FX);
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      if (toolbar.parentNode) toolbar.parentNode.removeChild(toolbar);
      if (hudEl.parentNode) hudEl.parentNode.removeChild(hudEl);
      if (propHintEl.parentNode) propHintEl.parentNode.removeChild(propHintEl);
      Object.values(propMat).forEach((m) => m?.dispose?.());
      Object.values(propGeo).forEach((g) => g?.dispose?.());
      el.classList.remove('sp3d-host', 'sp3d-fs');
      if (el.__sp3d === handle) el.__sp3d = null;
    }
  };
  el.__sp3d = handle;
  if (typeof window !== 'undefined') {
    const fenceShadowClass = (node) => {
      const sp3 = node?.userData?.sp3;
      const kind = sp3?.meta?.kind;
      if (!isFenceKind(kind)) return null;
      if (node.userData?.fenceRail) return 'rail';
      if (node.userData?.fenceCap) return 'cap';
      if (node.userData?.fenceFooting) return 'footing';
      if (node.userData?.fenceFill) return 'panel-fill';
      if (sp3.type === 'net-panel') return kind === 'gallery-net' ? 'gallery-net' : 'panel';
      if (kind === 'gate') return 'gate';
      if (kind === 'fence-post') return 'post';
      return kind;
    };
    window.__sp3debug = {
      props: () => PROPS.children.length,
      propScreenPos() {
        const root = propRoots.find((p) => p.userData?.ballType);
        if (!root) return null;
        const p = root.getWorldPosition(new THREE.Vector3()).project(camera);
        const r = canvas.getBoundingClientRect();
        return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (-p.y + 1) * r.height / 2 };
      },
      surround: () => ({ kind: state.surround, children: surroundGroup ? surroundGroup.children.length : 0 }),
      apronBounds() {
        const apronBox = new THREE.Box3().setFromObject(apronGroup);
        const fieldBox = new THREE.Box3();
        let fieldCount = 0;
        group.traverse((node) => {
          if (node.userData?.sp3?.meta?.kind !== 'field') return;
          fieldBox.expandByObject(node);
          fieldCount++;
        });
        return {
          apron: { min: apronBox.min.toArray(), max: apronBox.max.toArray(), count: apronGroup.children.length },
          field: { min: fieldBox.min.toArray(), max: fieldBox.max.toArray(), count: fieldCount }
        };
      },
      fenceShadows() {
        const out = {};
        group.traverse((node) => {
          const cls = fenceShadowClass(node);
          if (!cls) return;
          const row = out[cls] || { total: 0, cast: 0 };
          row.total++;
          if (node.castShadow) row.cast++;
          out[cls] = row;
        });
        for (const cls of ['post', 'footing', 'panel', 'panel-fill', 'rail', 'gate', 'gallery-net', 'cap']) {
          if (!out[cls]) out[cls] = { total: 0, cast: 0 };
        }
        return out;
      },
      fenceShadowAssertion() {
        const report = window.__sp3debug.fenceShadows();
        const allowed = new Set(['post', 'footing']);
        const violations = Object.entries(report)
          .filter(([cls, row]) => !allowed.has(cls) && row.cast > 0)
          .map(([cls, row]) => ({ cls, cast: row.cast }));
        return { report, violations, ok: violations.length === 0 };
      },
      setFenceShadows(className, enabled) {
        let changed = 0;
        group.traverse((node) => {
          if (fenceShadowClass(node) !== className) return;
          node.castShadow = !!enabled;
          changed++;
        });
        return { className, enabled: !!enabled, changed, report: window.__sp3debug.fenceShadows() };
      },
      ballScreenRadius() {
        const root = propRoots.find((p) => p.userData?.ballType);
        if (!root) return null;
        const center = root.getWorldPosition(new THREE.Vector3()).project(camera);
        const edge = root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(root.userData.radius || 0.1, 0, 0)).project(camera);
        const r = canvas.getBoundingClientRect();
        const cx = (center.x + 1) * r.width / 2, cy = (-center.y + 1) * r.height / 2;
        const ex = (edge.x + 1) * r.width / 2, ey = (-edge.y + 1) * r.height / 2;
        return Math.hypot(ex - cx, ey - cy);
      },
      pointerVelocity: () => pointerVelocity().toArray(),
      pointerTrail: () => pointerTrail.map((p) => ({ ...p })),
      propState(i) {
        const root = propRoots[Number(i) || 0];
        if (!root) return null;
        return { position: root.position.toArray(), velocity: root.userData.velocity?.toArray() || null };
      },
      setPropState(i, position, velocity) {
        const root = propRoots[Number(i) || 0];
        if (!root) return false;
        const b = root.userData;
        if (position) root.position.set(position[0], position[1], position[2]);
        b.velocity = velocity ? new THREE.Vector3(velocity[0], velocity[1], velocity[2]) : null;
        b.prevY = root.position.y; b.rimAwarded = false;
        if (b.velocity) activateBody(b);
        return true;
      },
      rims: () => rimTargets().map((r) => ({ position: r.pos.toArray(), radius: r.radius })),
      fx: () => FX.children.length,
      fit: () => { const f = fitInfo(); const bb = new THREE.Box3().setFromObject(group); return { c: f.c.toArray(), r: f.r, dist: f.dist, min: bb.min.toArray(), max: bb.max.toArray(), aspect: camera.aspect, cam: camera.position.toArray(), tgt: controls.target.toArray(), w: canvas.clientWidth, h: canvas.clientHeight }; },
      photoCards: () => {
        let n = 0;
        group.traverse((node) => { if (node.userData?.photoCard === true) n++; });
        return n;
      },
      rebuilds: rebuildCount,
      position: (i) => {
        const root = propRoots[Number(i) || 0];
        return root ? [root.position.x, root.position.y, root.position.z] : null;
      },
      deselect: () => { deselect(); return true; },
      select: (i) => {
        const u = dragUnits[Number(i) || 0];
        if (!u) return false;
        selectUnit(u);
        return true;
      },
      kick: (i) => {
        const root = propRoots[Number(i) || 0];
        if (root) kickBody(root, root.position);
        return !!root;
      },
      units: () => dragUnits.map((u) => {
        const t = u.targets && u.targets[0];
        const o = t && t.userData && t.userData.sp3;
        const source = (u.targets || []).map((target) => target.userData && target.userData.sp3)
          .find((item) => item && item.meta && item.meta.fp) || o;
        const box = new THREE.Box3();
        let parts = 0;
        for (const target of (u.targets || [])) { box.expandByObject(target); parts += target.children.length; }
        const sz = box.isEmpty() ? null : box.getSize(new THREE.Vector3());
        return {
          id: u.id, name: u.name,
          purp: source && source.meta && source.meta.purp, dims: source && source.meta && source.meta.dims, size: source && source.size,
          fp: (source && source.meta && source.meta.fp) || u.fp,
          bbox: sz ? [sz.x, sz.y, sz.z].map((v) => Math.round(v * 100) / 100) : null,
          parts, targets: (u.targets || []).length
        };
      }),
      mats: (i) => {
        const u = dragUnits[Number(i) || 0];
        if (!u) return null;
        const out = [];
        (u.targets || []).forEach((t) => t.traverse((n) => {
          if (n.material && n.material.color && out.length < 80) out.push({ pal: n.userData.palette, c: '#' + n.material.color.getHexString(), op: n.material.opacity, tr: n.material.transparent, em: n.material.emissive && '#' + n.material.emissive.getHexString() });
        }));
        return out;
      },
      probe: (i) => {
        const u = dragUnits[Number(i) || 0];
        if (!u) return null;
        return (u.targets || []).map((t) => {
          const chain = [];
          for (let n = t; n; n = n.parent) chain.push({ type: n.type, sc: [n.scale.x, n.scale.y, n.scale.z].map((v) => +v.toFixed(3)), pos: [n.position.x, n.position.y, n.position.z].map((v) => +v.toFixed(2)), rot: [n.rotation.x, n.rotation.y, n.rotation.z].map((v) => +v.toFixed(2)), kids: n.children.length, vis: n.visible });
          const box = new THREE.Box3().setFromObject(t);
          return { bbox: box.isEmpty() ? null : [box.min.y, box.max.y].map((v) => +v.toFixed(2)), chain };
        });
      },
      look: (i, dist) => {
        const u = dragUnits[Number(i) || 0];
        if (!u) return false;
        const p = { x: u.baseX, y: u.baseY || 0, z: u.baseZ };
        const d = Number(dist) || 8;
        controls.target.set(p.x, p.y + 1, p.z);
        camera.position.set(p.x + d * 0.7, p.y + d * 0.55, p.z + d * 0.7);
        controls.update();
        return true;
      }
    };
    Object.defineProperty(window.__sp3debug, 'rebuilds', {
      configurable: true,
      get: () => rebuildCount
    });
  }
  return handle;
}

let stylesDone = false;
function ensureStyles() {
  if (stylesDone || typeof document === 'undefined') return;
  stylesDone = true;
  const st = document.createElement('style');
  st.textContent =
    '.sp3d-toolbar{position:absolute;top:8px;right:8px;display:flex;gap:4px;z-index:5;flex-wrap:wrap;justify-content:flex-end;max-width:calc(100% - 16px)}' +
    '.sp3d-surround{flex-basis:100%;display:flex;align-items:center;justify-content:flex-end;gap:4px;min-height:24px}' +
    '.sp3d-surround-title{padding:4px 7px;border-radius:999px;background:rgba(15,23,42,.48);color:#cbd5e1;font:500 10px/1 system-ui,sans-serif}' +
    '.sp3d-btn{appearance:none;border:1px solid rgba(120,130,150,0.45);background:rgba(16,20,28,0.72);color:#e8edf2;' +
    'font:600 11px/1 system-ui,sans-serif;padding:6px 9px;border-radius:7px;cursor:pointer;backdrop-filter:blur(4px)}' +
    '.sp3d-btn:hover{border-color:rgba(200,210,225,0.8)}' +
    '.sp3d-btn.active{background:rgba(120,90,40,0.85);border-color:rgba(220,180,110,0.9);color:#ffe9c9}' +
    '.sp3d-hud{position:absolute;z-index:20;left:8px;bottom:8px;background:rgba(15,23,42,0.66);backdrop-filter:blur(6px);border:1px solid rgba(56,189,248,0.3);border-radius:999px;padding:4px 7px;box-shadow:0 4px 14px rgba(0,0,0,0.28);color:#f8fafc;font:500 10px/1.2 system-ui,sans-serif;user-select:none;pointer-events:auto;transition:opacity 0.15s ease;max-width:95%}' +
    '.sp3d-hud-btn{appearance:none;background:#1e293b;border:1px solid #334155;color:#f1f5f9;padding:3px 7px;border-radius:5px;cursor:pointer;font:600 11px/1 system-ui,sans-serif;transition:all 0.12s ease}' +
    '.sp3d-hud-btn:hover{background:#334155;border-color:#38bdf8;color:#38bdf8}' +
    '.sp3d-hud-btn.on{background:#075985;border-color:#38bdf8;color:#f0f9ff}' +
    '.sp3d-hud-hint{font-size:9px;line-height:1.25;color:#94a3b8;margin:0 0 5px;max-width:430px;text-align:center}' +
    '.sp3d-hud-btn:active{transform:scale(0.96)}';
  document.head.appendChild(st);
}

function supported() {
  try {
    if (typeof window === 'undefined' || !window.WebGLRenderingContext) return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (_) { return false; }
}

window.SportsScene3D = { mount, supported };
try { window.dispatchEvent(new CustomEvent('sportsscene3d:ready')); } catch (_) { /* no-op */ }
export { mount, supported };
