/* ═══════════════════════════════════════════════════════════════════
   sports-scene-model.js — PURE MODEL LAYER (no three.js, no DOM, no I/O).
   Plain ES module, importable in node for acceptance tests.

   buildSceneModel(config, specs) → deterministic array of scene objects.

   SCENE CONVENTION (fixed — do not change):
     · units = metres
     · field centred at origin; ground plane is y=0
     · X runs along the field LENGTH (east), Z along the WIDTH (south), Y up
     · every scene object is one of:
         plane     {type:'plane',    pos:[x,y,z] centre,          size:[sx,sz]}
         box       {type:'box',      pos:[x,y,z] centre of BASE,  size:[sx,sy,sz]}
         cylinder  {type:'cylinder', pos = base centre when dir 'y' (default),
                                     pos = centre when dir 'x'|'z',
                                     radius, height, dir}
         torus     {type:'torus',    pos:[x,y,z] centre, radius, tube, flat:true}
         line      {type:'line',     points:[[x,y,z],[x,y,z]], width} — flat strip
         arc       {type:'arc',      pos:[x,y,z] centre, radius, width,
                                     a0, a1} — arc point = (x + r·cos a, y, z + r·sin a)
         net-panel {type:'net-panel', pos:[x,yBase,z] centre of base edge,
                                     axis:'x'|'z' (panel runs along that axis),
                                     size:[len,h]}
         text      {type:'text',     pos:[x,y,z], text, size (line height, m)}
         billboard {type:'billboard', pos:[x,y,z] base centre, size:[w,h],
                    img:'img/p/<file>.webp'} — upright photo panel
                    (renderer swaps geometry width to h*photoAspect on load;
                    meta.fp {w,d,h} keeps the real footprint for base/fallback;
                    imgT:null when no secondary image is available
                    exists — renderer may then upgrade the panel to a sprite
                    impostor; sprite-ness is a renderer decision)
     · optional fields on any object: color '#rrggbb', opacity, rotY, tiltX,
       tiltZ, material
       {surface texture descriptor}, meta {kind, ...}
   meta.kind vocabulary: field, field-zone, apron, marking, goal, net, hoop,
     station, fence, fence-post, gate, gallery-net, roof, pole, bench, stands,
     equipment, halo, dim-line.
   Equipment descriptors may carry pin:[x,z,rotY,elev,tiltX,tiltZ] — user-locked position (scene
     coords, metres, field centre origin). Pinned units are placed exactly at
     (x,z) instead of the first-fit/workout slot; positions outside the field
     are placed verbatim. A pinned entry with qty>1 anchors its FIRST unit at
     (x,z); the rest trail at +(fp.w+1) m along X. Emitted equipment objects
     carry meta.pinned:true so the renderer can flag user-locked units.
   ═══════════════════════════════════════════════════════════════════ */

import { SCENE_SPECS } from './sports-scene-specs.js';

const TAU = Math.PI * 2;
const HPI = Math.PI / 2;
const MARK_Y = 0.02;              // marking strip base height above surface

/* ── small numeric helpers ─────────────────────────────────────────── */
const num = (v, fb) => { const n = typeof v === 'string' ? parseFloat(String(v).replace(',', '.')) : +v; return Number.isFinite(n) ? n : fb; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_HEIGHT_M = Object.freeze({
  multiplay: 3.2, swings: 2.4, springers: 0.9, climbers: 2.6, rope: 3.0,
  parkour: 1.6, walls: 2.4, slides: 2.2, carousels: 1.0, playhouses: 2.2,
  shelters: 2.8, fitness: 2.2, street: 2.6, trampoline: 0.4, sandboxes: 0.4,
  balance: 0.6, thematic: 1.6, figures: 1.4, interactive: 1.6, water: 1.2,
  info: 2.0, benches: 0.85, tables: 0.75, picnic: 0.75, planters: 0.6,
  bins: 1.0, bike: 0.8, bollards: 1.0, lamps: 4.5, fences: 1.2
});

/* "101 x 75 x 167 cm" / "85х63х174 см" → {w:1.01, d:0.75, h:1.67} metres.
   The unit is decided once for the whole string; strings without 2 usable
   numbers → null (caller skips the footprint). */
export function parseFootprint(dims, purp) {
  const raw = String(dims == null ? '' : dims);
  const m = raw.replace(/,/g, '.').match(/\d+(?:\.\d+)?/g);
  if (!m || m.length < 2) return null;
  const values = m.slice(0, 3).map((v) => parseFloat(v));
  let scale = 1;
  if (/\bmm\b|мм/i.test(raw)) scale = 0.001;
  else if (/\bcm\b|см/i.test(raw)) scale = 0.01;
  else if (values.some((v) => v > 25)) scale = 0.01;
  const [a, b, c = 0] = values.map((v) => v * scale);
  if (!(a > 0.05 && b > 0.05)) return null;
  if (c > 0.05) return { w: a, d: b, h: c, hSource: 'observed' };
  return { w: a, d: b, h: DEFAULT_HEIGHT_M[purp] || 1.5, hDefault: true };
}

/* "12,1 m2" → 12.1 | null */
export function parseZone(zone) {
  const m = String(zone == null ? '' : zone).replace(/,/g, '.').match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const v = parseFloat(m[0]);
  return v > 0 ? v : null;
}

const fmtM = (v) => String(Math.round(v * 100) / 100) + ' m';

/* descriptor pin → [x,z,rotY,elev,tiltX,tiltZ] (scene metres) | null; coords must be finite */
function pinOf(it) {
  const p = it && it.pin;
  if (!Array.isArray(p) || p.length < 2) return null;
  const x = num(p[0], NaN), z = num(p[1], NaN);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const rotY = p.length > 2 && Number.isFinite(num(p[2], NaN)) ? num(p[2], 0) : null;
  const elev = p.length > 3 && Number.isFinite(num(p[3], NaN)) ? num(p[3], 0) : null;
  const tiltX = p.length > 4 && Number.isFinite(num(p[4], NaN)) ? num(p[4], 0) : null;
  const tiltZ = p.length > 5 && Number.isFinite(num(p[5], NaN)) ? num(p[5], 0) : null;
  const res = [x, z];
  if (rotY != null) res[2] = rotY;
  if (elev != null) res[3] = elev;
  if (tiltX != null) res[4] = tiltX;
  if (tiltZ != null) res[5] = tiltZ;
  return res;
}

/* ── generic marking emitters ──────────────────────────────────────── */
function mLine(out, mark, x0, z0, x1, z1, w, color, y) {
  out.push({ type: 'line', points: [[x0, y, z0], [x1, y, z1]], width: w, color, meta: { kind: 'marking', mark } });
}
function mArc(out, mark, x, z, r, a0, a1, w, color, y) {
  if (!(r > 0) || !(a1 > a0)) return;
  out.push({ type: 'arc', pos: [x, y, z], radius: r, width: w, a0, a1, color, meta: { kind: 'marking', mark } });
}
function mSpot(out, mark, x, z, r, color, y) {
  out.push({ type: 'cylinder', pos: [x, y, z], radius: r, height: 0.02, color, meta: { kind: 'marking', mark } });
}
function mRect(out, mark, L, W, w, color, y) {
  const hx = L / 2, hz = W / 2;
  mLine(out, mark, -hx, -hz, hx, -hz, w, color, y);
  mLine(out, mark, hx, -hz, hx, hz, w, color, y);
  mLine(out, mark, hx, hz, -hx, hz, w, color, y);
  mLine(out, mark, -hx, hz, -hx, -hz, w, color, y);
}
/* three-sided box opening toward the field centre from end s (−1 west / +1 east) */
function mEndBox(out, mark, s, L, d, halfW, w, color, y) {
  const gx = s * L / 2, xi = gx - s * d;
  mLine(out, mark, gx, -halfW, xi, -halfW, w, color, y);
  mLine(out, mark, gx, halfW, xi, halfW, w, color, y);
  mLine(out, mark, xi, -halfW, xi, halfW, w, color, y);
}
/* arc centred on (cx, 0), symmetrical about the inward direction of end s */
function mEndArc(out, mark, s, cx, r, alpha, w, color, y) {
  const base = s < 0 ? 0 : Math.PI;
  mArc(out, mark, cx, 0, r, base - alpha, base + alpha, w, color, y);
}

/* ── per-sport marking builders (numbers come from specs) ──────────── */

function footballMarks(sp, L, W, color, y, out, equip) {
  const lw = sp.lineW || 0.1;
  mRect(out, 'perimeter', L, W, lw, color, y);
  mLine(out, 'midline', 0, -W / 2, 0, W / 2, lw, color, y);
  if (sp.centerR) {
    mArc(out, 'center-circle', 0, 0, sp.centerR, 0, TAU, lw, color, y);
    mSpot(out, 'center-spot', 0, 0, Math.max(0.09, lw * 1.2), color, y);
  }
  if (sp.cornerR) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const base = Math.atan2(-sz, -sx);
      mArc(out, 'corner-arc', sx * L / 2, sz * W / 2, sp.cornerR, base - HPI / 2, base + HPI / 2, lw, color, y);
    }
  }
  const e = sp.end || {};
  for (const s of [-1, 1]) {
    const gx = s * L / 2, inward = -s;
    if (e.style === 'boxes') {
      if (e.goalArea) mEndBox(out, 'goal-area', s, L, e.goalArea.d, e.goalArea.w / 2, lw, color, y);
      if (e.penalty) {
        mEndBox(out, 'penalty-area', s, L, e.penalty.d, e.penalty.w / 2, lw, color, y);
        const sx = gx + inward * e.penalty.spot;
        mSpot(out, 'penalty-spot', sx, 0, Math.max(0.09, lw * 1.1), color, y);
        if (e.penalty.arcR > (e.penalty.d - e.penalty.spot)) {
          const alpha = Math.acos(clamp((e.penalty.d - e.penalty.spot) / e.penalty.arcR, -1, 1));
          mEndArc(out, 'penalty-arc', s, sx, e.penalty.arcR, alpha, lw, color, y);
        }
      }
    } else if (e.style === 'quarters' && sp.goal) {
      /* futsal: quarter circles r centred on each post (outer side, endpoint
         on the goal line r metres out) + straight segment at r depth,
         penalty spot at spotA, optional second spot at spotB */
      const gw2 = sp.goal.w / 2, r = e.r || 6;
      for (const s2 of [-1, 1]) {
        const zc = s2 * gw2;
        const aMid = s < 0 ? 0 : Math.PI;
        const aLine = aMid + (s < 0 ? s2 : -s2) * HPI;
        mArc(out, 'penalty-arc', gx, zc, r, Math.min(aLine, aMid), Math.max(aLine, aMid), lw, color, y);
      }
      mLine(out, 'penalty-line', gx + inward * r, -gw2, gx + inward * r, gw2, lw, color, y);
      if (e.spotA) mSpot(out, 'penalty-spot', gx + inward * e.spotA, 0, Math.max(0.09, lw * 1.1), color, y);
      if (e.spotB) mSpot(out, 'second-spot', gx + inward * e.spotB, 0, Math.max(0.09, lw * 1.1), color, y);
    }
  }
  if (sp.goal && equip) for (const s of [-1, 1]) equip.push({ kind: 'goal', s, gx: s * L / 2, w: sp.goal.w, h: sp.goal.h, depth: sp.goal.depth, r: sp.goal.r });
}

function basketballMarks(sp, L, W, color, y, out, equip) {
  const lw = sp.lineW || 0.05;
  mRect(out, 'perimeter', L, W, lw, color, y);
  mLine(out, 'midline', 0, -W / 2, 0, W / 2, lw, color, y);
  if (sp.centerR) mArc(out, 'center-circle', 0, 0, sp.centerR, 0, TAU, lw, color, y);
  const t3 = sp.three;
  for (const s of [-1, 1]) {
    const gx = s * L / 2, inward = -s;
    const k = sp.key;
    if (k) {
      mLine(out, 'key', gx, -k.halfW, gx + inward * k.depth, -k.halfW, lw, color, y);
      mLine(out, 'key', gx, k.halfW, gx + inward * k.depth, k.halfW, lw, color, y);
      mLine(out, 'key', gx + inward * k.depth, -k.halfW, gx + inward * k.depth, k.halfW, lw, color, y);
      if (k.ftR) mEndArc(out, 'freethrow-arc', s, gx + inward * k.depth, k.ftR, HPI, lw, color, y);
    }
    if (t3) {
      const zs = W / 2 - t3.inset;
      mLine(out, 'three-line', gx, -zs, gx + inward * t3.straight, -zs, lw, color, y);
      mLine(out, 'three-line', gx, zs, gx + inward * t3.straight, zs, lw, color, y);
      const xc = gx + inward * t3.anchor;
      const alpha = Math.acos(clamp((t3.straight - t3.anchor) / t3.r, -1, 1));
      mEndArc(out, 'three-arc', s, xc, t3.r, alpha, lw, color, y);
      if (sp.chargeR) mEndArc(out, 'charge-arc', s, xc, sp.chargeR, HPI, lw, color, y);
    }
  }
  if (sp.hoop && equip) for (const s of [-1, 1]) equip.push({ kind: 'hoop', s, hoop: sp.hoop, L });
}

function volleyballMarks(sp, L, W, color, y, out) {
  const lw = sp.lineW || 0.05;
  mRect(out, 'perimeter', L, W, lw, color, y);
  mLine(out, 'net-line', 0, -W / 2, 0, W / 2, lw, color, y);
  if (sp.attackD) {
    mLine(out, 'attack-line', -sp.attackD, -W / 2, -sp.attackD, W / 2, lw, color, y);
    mLine(out, 'attack-line', sp.attackD, -W / 2, sp.attackD, W / 2, lw, color, y);
  }
}

function tennisMarks(sp, L, W, color, y, out) {
  const lw = sp.lineW || 0.1;
  mRect(out, 'perimeter', L, W, lw, color, y);                 // doubles court
  const zs = W / 2 - sp.singlesInset;                          // singles sidelines (1.37 m inset)
  mLine(out, 'singles', -L / 2, -zs, L / 2, -zs, lw, color, y);
  mLine(out, 'singles', -L / 2, zs, L / 2, zs, lw, color, y);
  mLine(out, 'service', -sp.serviceD, -zs, -sp.serviceD, zs, lw, color, y);
  mLine(out, 'service', sp.serviceD, -zs, sp.serviceD, zs, lw, color, y);
  mLine(out, 'center-service', -sp.serviceD, 0, sp.serviceD, 0, lw, color, y);
  for (const s of [-1, 1]) mLine(out, 'center-mark', s * L / 2, 0, s * (L / 2) + s * -0.1, 0, lw, color, y);
}

/* ── equipment materialisers (descriptors → primitive objects) ─────── */

function goalObjects(out, d, colors) {
  const { s, gx, w, h } = d, dep = d.depth || 0.8, r = d.r || 0.06;
  const meta = { kind: 'goal', side: s, w, h };
  for (const z of [-w / 2, w / 2]) {
    out.push({ type: 'cylinder', pos: [gx, 0, z], radius: r, height: h, color: colors.goalFrame, meta: { ...meta, part: 'post' } });
  }
  out.push({ type: 'cylinder', pos: [gx, h, 0], radius: r, height: w, dir: 'z', color: colors.goalFrame, meta: { ...meta, part: 'bar' } });
  /* net volume (back + sides), low-opacity panels read as netting */
  out.push({ type: 'net-panel', pos: [gx + s * dep, 0, 0], axis: 'z', size: [w, h], color: colors.net, opacity: 0.32, meta: { ...meta, part: 'net' } });
  for (const z of [-w / 2, w / 2]) {
    out.push({ type: 'net-panel', pos: [gx + s * dep / 2, 0, z], axis: 'x', size: [dep, h * 0.75], color: colors.net, opacity: 0.22, meta: { ...meta, part: 'net' } });
  }
}

function hoopObjects(out, d, colors) {
  const s = d.s, p = d.hoop, L = d.L;
  const unit = s < 0 ? 0 : 1;
  const meta = { kind: 'hoop', unit };
  const poleX = s * (L / 2 + p.poleOff);
  const poleH = p.boardBottom + p.boardH + 0.1;
  out.push({ type: 'box', pos: [poleX, 0, 0], size: [p.pole, poleH, p.pole], color: colors.steelDark, meta: { ...meta, part: 'pole' } });
  const boardCX = s * (L / 2 - p.boardFaceOff - p.boardThick / 2);
  const armLen = Math.abs(poleX - s * p.pole / 2 - (boardCX + s * p.boardThick / 2));
  const armCX = (poleX - s * p.pole / 2 + boardCX + s * p.boardThick / 2) / 2;
  out.push({ type: 'box', pos: [armCX, poleH - 0.42, 0], size: [armLen, 0.12, 0.12], color: colors.steelDark, meta: { ...meta, part: 'arm' } });
  out.push({ type: 'box', pos: [boardCX, p.boardBottom, 0], size: [p.boardThick, p.boardH, p.boardW], color: '#f2f5f7', meta: { ...meta, part: 'board' } });
  const rimX = s * (L / 2 - p.boardFaceOff - p.boardThick - 0.381 + p.rimR);
  out.push({ type: 'torus', pos: [rimX, p.rimH, 0], radius: p.rimR, tube: 0.02, flat: true, color: '#e6702c', meta: { ...meta, part: 'rim', rimH: p.rimH } });
  out.push({ type: 'cylinder', pos: [rimX, p.rimH - 0.4, 0], radius: p.rimR - 0.02, height: 0.38, color: colors.net, opacity: 0.35, meta: { ...meta, part: 'net' } });
}

function tennisNetObjects(out, sp, W, colors) {
  const n = sp.net;
  const zPost = W / 2 + n.postOut, len = zPost * 2;
  for (const z of [-zPost, zPost]) {
    out.push({ type: 'cylinder', pos: [0, 0, z], radius: n.postR, height: n.hEnd, color: '#3a4350', meta: { kind: 'net', part: 'post' } });
  }
  out.push({ type: 'net-panel', pos: [0, 0, 0], axis: 'z', size: [len, n.hEnd], color: colors.net, opacity: 0.5, meta: { kind: 'net', part: 'net', hEnd: n.hEnd, hMid: n.hMid } });
  out.push({ type: 'box', pos: [0, n.hEnd - 0.05, 0], size: [0.05, 0.05, len], color: '#ffffff', meta: { kind: 'net', part: 'tape' } });
}

function volleyballNetObjects(out, sp, W, colors) {
  const n = sp.net;
  const len = W + n.postOut * 2, postH = n.h + 0.1;
  for (const z of [-len / 2, len / 2]) {
    out.push({ type: 'cylinder', pos: [0, 0, z], radius: n.postR, height: postH, color: colors.steelDark, meta: { kind: 'net', part: 'post' } });
  }
  out.push({ type: 'net-panel', pos: [0, n.h - n.clearH, 0], axis: 'z', size: [len, n.clearH], color: colors.net, opacity: 0.5, meta: { kind: 'net', part: 'net', hTop: n.h } });
  for (const z of [-W / 2, W / 2]) {
    out.push({ type: 'cylinder', pos: [0, n.h, z], radius: 0.01, height: n.antenna, color: '#d94545', meta: { kind: 'net', part: 'antenna' } });
  }
}

/* ── site context: fencing, roof, poles, benches, stands, equipment ── */

function fenceObjects(out, cfg, L, W, specs) {
  const site = specs.site, colors = specs.colors;
  const fc = (cfg && cfg.fencing) || {};
  const h = num(fc.height, 0);
  const opts = Array.isArray(fc.options) ? fc.options : [];
  const mg = site.fenceGap, Fx = L / 2 + mg, Fz = W / 2 + mg;
  if (h > 0) {
    const gates = Math.max(0, Math.round(num(fc.gates, 0)));
    const gw = site.gateWidth;
    const postCol = opts.includes('galvanized') ? colors.fencePostGalv : colors.fencePost;
    /* long edges first for gates: S(z=-Fz), N(z=+Fz) */
    const edges = [
      { id: 'S', axis: 'x', c: -Fz, a: -Fx, b: Fx, long: true },
      { id: 'N', axis: 'x', c: Fz, a: -Fx, b: Fx, long: true },
      { id: 'E', axis: 'z', c: Fx, a: -Fz, b: Fz, long: false },
      { id: 'W', axis: 'z', c: -Fx, a: -Fz, b: Fz, long: false }
    ];
    /* gates distributed on the two long edges: S gets the odd one */
    const perEdge = new Map();
    const longs = edges.filter(e => e.long);
    longs.forEach((e, i) => {
      perEdge.set(e.id, Math.floor(gates / 2) + (i === 0 && gates % 2 === 1 ? 1 : 0));
    });
    const seenPost = new Set();
    for (const e of edges) {
      const len = e.b - e.a;
      const k = perEdge.get(e.id) || 0;
      const spans = [];
      for (let i = 0; i < k; i++) {
        const c = e.a + (i + 1) * len / (k + 1);
        spans.push([c - gw / 2, c + gw / 2]);
      }
      /* posts every ~2.5 m skipping gate spans, corners deduped */
      const nBays = Math.max(1, Math.round(len / site.postSpacing));
      for (let i = 0; i <= nBays; i++) {
        const p = e.a + i * len / nBays;
        if (spans.some(([g0, g1]) => p > g0 - 0.09 && p < g1 + 0.09)) continue;
        const x = e.axis === 'x' ? p : e.c, z = e.axis === 'x' ? e.c : p;
        const key = x.toFixed(3) + '|' + z.toFixed(3);
        if (seenPost.has(key)) continue;
        seenPost.add(key);
        out.push({ type: 'cylinder', pos: [x, 0, z], radius: site.postRadius, height: h, color: postCol, meta: { kind: 'fence-post', height: h, edge: e.id } });
      }
      /* gate frame posts + header bar */
      for (const [g0, g1] of spans) {
        for (const p of [g0, g1]) {
          const x = e.axis === 'x' ? p : e.c, z = e.axis === 'x' ? e.c : p;
          out.push({ type: 'cylinder', pos: [x, 0, z], radius: site.gatePostRadius, height: h, color: colors.gateFrame, meta: { kind: 'gate', part: 'post', height: h, edge: e.id } });
        }
        const cx = (g0 + g1) / 2;
        const px = e.axis === 'x' ? cx : e.c, pz = e.axis === 'x' ? e.c : cx;
        out.push({ type: 'cylinder', pos: [px, h + 0.03, pz], radius: 0.03, height: gw + 0.12, dir: e.axis, color: colors.gateFrame, meta: { kind: 'gate', part: 'header', edge: e.id } });
      }
      /* mesh panel runs between gate gaps */
      let cur = e.a;
      const runs = [];
      for (const [g0, g1] of spans) { if (g0 > cur) runs.push([cur, g0]); cur = g1; }
      if (cur < e.b) runs.push([cur, e.b]);
      for (const [p, q] of runs) {
        if (q - p < 0.2) continue;
        const mid = (p + q) / 2;
        const px = e.axis === 'x' ? mid : e.c, pz = e.axis === 'x' ? e.c : mid;
        out.push({ type: 'net-panel', pos: [px, 0, pz], axis: e.axis, size: [q - p, h], color: '#ccd6e2', opacity: 0.62, meta: { kind: 'fence', height: h, edge: e.id } });
        if (opts.includes('gallery_protective_net')) {
          out.push({ type: 'net-panel', pos: [px, h, pz], axis: e.axis, size: [q - p, site.netRise], color: '#eef2f6', opacity: 0.28, meta: { kind: 'gallery-net', height: site.netRise, edge: e.id } });
        }
      }
    }
  }
  if (opts.includes('roof')) {
    const roofH = h > 0 ? h + 0.3 : site.roofFallbackHeight;
    out.push({ type: 'box', pos: [0, roofH, 0], size: [Fx * 2 + 0.4, site.roofThickness, Fz * 2 + 0.4], color: specs.colors.roof, opacity: 0.3, meta: { kind: 'roof', part: 'panel' } });
    if (h <= 0) {
      const cols = [[-Fx, -Fz], [Fx, -Fz], [Fx, Fz], [-Fx, Fz], [0, -Fz], [0, Fz]];
      for (const [x, z] of cols) {
        out.push({ type: 'cylinder', pos: [x, 0, z], radius: 0.09, height: roofH, color: specs.colors.steelDark, meta: { kind: 'roof', part: 'column' } });
      }
    }
  }
  return { Fx, Fz, fenceOn: h > 0 };
}

function poleObjects(out, count, Fx, Fz, specs) {
  const site = specs.site, colors = specs.colors, H = site.poleHeight;
  /* balanced along long edges: corners first, then edge midpoints */
  const cand = [
    [-Fx - 1, -Fz - 1], [Fx + 1, Fz + 1], [-Fx - 1, Fz + 1], [Fx + 1, -Fz - 1],
    [0, -Fz - 1], [0, Fz + 1],
    [-Fx / 2, -Fz - 1], [Fx / 2, Fz + 1], [Fx / 2, -Fz - 1], [-Fx / 2, Fz + 1],
    [-Fx - 1, 0], [Fx + 1, 0]
  ];
  const n = clamp(Math.round(num(count, 0)), 0, cand.length);
  for (let i = 0; i < n; i++) {
    const [x, z] = cand[i];
    const m = Math.max(Math.abs(x), Math.abs(z));
    const aim = [-x / m, -z / m];
    const unit = { kind: 'pole', idx: i };
    out.push({ type: 'cylinder', pos: [x, 0, z], radius: 0.11, height: H, color: colors.poleMast, meta: { ...unit, part: 'mast' } });
    const perp = [-aim[1], aim[0]];
    const rotY = -Math.atan2(perp[1], perp[0]);
    out.push({ type: 'box', pos: [x, H - 0.18, z], size: [1.5, 0.12, 0.3], rotY, color: colors.poleMast, meta: { ...unit, part: 'arm' } });
    for (const t of [-0.6, 0.6]) {
      out.push({ type: 'box', pos: [x + perp[0] * t, H - 0.34, z + perp[1] * t], size: [0.5, 0.16, 0.3], rotY, color: colors.lamp, aim, meta: { ...unit, part: 'lamp' } });
    }
  }
}

function benchObjects(out, count, Fx, Fz, specs) {
  const colors = specs.colors, bl = specs.site.benchLength;
  const n = clamp(Math.round(num(count, 0)), 0, 20);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (bl + 0.6);
    const z = Fz + 0.85;
    const meta = { kind: 'bench', idx: i };
    for (const dz of [-0.16, 0.16]) {
      for (const dx of [-bl / 2 + 0.15, bl / 2 - 0.15]) {
        out.push({ type: 'box', pos: [x + dx, 0, z + dz], size: [0.06, 0.45, 0.06], color: colors.benchFrame, meta: { ...meta, part: 'leg' } });
      }
    }
    out.push({ type: 'box', pos: [x, 0.45, z], size: [bl, 0.06, 0.45], color: colors.benchWood, meta: { ...meta, part: 'seat' } });
    out.push({ type: 'box', pos: [x, 0.45, z + 0.21], size: [bl, 0.42, 0.05], color: colors.benchWood, meta: { ...meta, part: 'back' } });
  }
}

function parkBenchObjects(out, count, hx, hz, specs, paved = false) {
  const colors = specs.colors, bl = specs.site.benchLength;
  const n = Math.max(0, Math.round(num(count, 0)));
  for (let i = 0; i < n; i++) {
    const side = i % 4, k = Math.floor(i / 4);
    const along = -hx + 2.2 + (k + 0.5) * Math.max(2.4, (2 * hx - 4.4) / Math.max(1, Math.ceil(n / 4)));
    const vertical = side === 2 || side === 3;
    let x = vertical ? (side === 2 ? hx + 0.85 : -hx - 0.85) : along;
    let z = vertical ? (side === 2 ? along : -along) : (side === 0 ? hz + 0.85 : -hz - 0.85);
    if (paved) {
      const padCount = Math.max(2, Math.min(4, Math.round((hx * 2) / 24)));
      const padX = (i % padCount - (padCount - 1) / 2) * Math.min(12, hx * 0.36);
      x = padX;
      z = i % 2 === 0 ? hz * 0.28 + 3.35 : -hz * 0.28 - 3.35;
    }
    const rotY = vertical ? HPI : 0;
    const meta = { kind: 'bench', idx: i };
    for (const dz of [-0.16, 0.16]) {
      for (const dx of [-bl / 2 + 0.15, bl / 2 - 0.15]) {
        const c = Math.cos(rotY), s = Math.sin(rotY);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        out.push({ type: 'box', pos: [x + lx, 0, z + lz], size: [0.06, 0.45, 0.06], rotY, color: colors.benchFrame, meta: { ...meta, part: 'leg' } });
      }
    }
    out.push({ type: 'box', pos: [x, 0.45, z], size: [bl, 0.06, 0.45], rotY, color: colors.benchWood, meta: { ...meta, part: 'seat' } });
    const c = Math.cos(rotY), s = Math.sin(rotY);
    out.push({ type: 'box', pos: [x - 0.21 * s, 0.45, z + 0.21 * c], size: [bl, 0.42, 0.05], rotY, color: colors.benchWood, meta: { ...meta, part: 'back' } });
  }
}

function parkObjects(out, cfg, L, W, specs) {
  const colors = specs.colors, Fx = L / 2, Fz = W / 2, min = Math.min(L, W);
  const paved = cfg.surface === 'paving';
  const natural = cfg.surface === 'turf_natural';
  const plazaR = min * 0.12 * (paved ? 1.6 : 1);
  const loopR = min * 0.08, hx = Fx * 0.82, hz = Fz * 0.82;
  const pathWidth = paved ? 3.2 : natural ? 1.8 : 2.2;
  const pathColor = natural ? '#d8c9a3' : (cfg.colors && cfg.colors.surface === 'sand' ? '#d8c9a3' : (colors.paving || '#9aa3ad'));
  const pathMeta = { kind: 'path' };
  out.push({ type: 'cylinder', pos: [0, 0.01, 0], radius: plazaR, height: 0.02, color: pathColor, meta: { kind: 'plaza' } });
  const straights = [
    [[-hx + loopR, 0.012, -hz], [hx - loopR, 0.012, -hz]],
    [[-hx + loopR, 0.012, hz], [hx - loopR, 0.012, hz]],
    [[-hx, 0.012, -hz + loopR], [-hx, 0.012, hz - loopR]],
    [[hx, 0.012, -hz + loopR], [hx, 0.012, hz - loopR]]
  ];
  for (const points of straights) out.push({ type: 'line', points, width: pathWidth, color: pathColor, meta: pathMeta });
  for (const [x, z, a0, a1] of [
    [hx - loopR, -hz + loopR, -HPI, 0],
    [hx - loopR, hz - loopR, 0, HPI],
    [-hx + loopR, hz - loopR, HPI, Math.PI],
    [-hx + loopR, -hz + loopR, Math.PI, TAU - HPI]
  ]) out.push({ type: 'arc', pos: [x, 0.012, z], radius: loopR, width: pathWidth, a0, a1, color: pathColor, meta: pathMeta });
  const diagLen = Math.max(0, Math.hypot(hx - loopR, hz - loopR) - plazaR);
  for (const s of [-1, 1]) {
    const ex = s * (hx - loopR), ez = s * (hz - loopR);
    const q = Math.hypot(ex, ez) || 1;
    out.push({ type: 'line', points: [[s * plazaR * ex / q, 0.012, s * plazaR * ez / q], [ex, 0.012, ez]], width: pathWidth, color: pathColor, meta: pathMeta });
  }

  const seed = Math.round(L * 100) * 7919 + Math.round(W * 100);
  const random = mulberry32(seed);
  const treeN = clamp(Math.round(L * W / 110 * (paved ? 0.7 : 1)), 8, 60);
  const pond = L * W >= 1500 ? { x: -Fx * 0.45, z: Fz * 0.35, r: min * 0.09 } : null;
  const distLoop = (x, z) => Math.min(Math.abs(Math.abs(x) - hx), Math.abs(Math.abs(z) - hz));
  const trees = [];
  let attempts = 0;
  while (trees.length < treeN && attempts++ < treeN * 1000) {
    const outer = random() < 0.6;
    let x, z;
    if (outer && random() < 0.5) {
      x = (random() < 0.5 ? -1 : 1) * (hx + random() * Math.max(0.1, Fx - hx));
      z = (random() * 2 - 1) * Fz;
    } else if (outer) {
      z = (random() < 0.5 ? -1 : 1) * (hz + random() * Math.max(0.1, Fz - hz));
      x = (random() * 2 - 1) * Fx;
    } else {
      x = (random() * 2 - 1) * Fx; z = (random() * 2 - 1) * Fz;
    }
    if (Math.abs(x) > Fx || Math.abs(z) > Fz || distLoop(x, z) < 2.6 ||
        Math.hypot(x, z) < plazaR + 1.5 ||
        trees.some(t => Math.hypot(t.pos[0] - x, t.pos[2] - z) < 2.5) ||
        (pond && Math.hypot(x - pond.x, z - pond.z) < pond.r + 1)) continue;
    trees.push({ type: 'tree', pos: [x, 0, z], height: 4 + random() * 3, crown: 1.6 + random() * 1.2,
      variant: random() < 0.28 ? 'conifer' : 'round', color: colors.trees[Math.min(colors.trees.length - 1, random() < 0.1 ? 3 : Math.floor(random() * 3))], meta: { kind: 'tree' } });
  }
  out.push(...trees);
  if (paved) {
    const padW = Math.min(8, Math.max(5, L * 0.14));
    const padD = Math.min(6, Math.max(4, W * 0.15));
    const pads = Math.max(2, Math.min(4, Math.round(L / 24)));
    for (let i = 0; i < pads; i++) {
      const x = (i - (pads - 1) / 2) * Math.min(12, L * 0.18);
      const z = i % 2 === 0 ? W * 0.28 : -W * 0.28;
      out.push({ type: 'box', pos: [x, 0.025, z], size: [padW, 0.05, padD], color: pathColor, meta: { kind: 'pad', idx: i } });
    }
  }
  const ex = cfg.extras || {};
  parkBenchObjects(out, num(ex.benches, 0) > 0 ? ex.benches : 6, hx, hz, specs, paved);

  const perimeter = 4 * (hx + hz - 2 * loopR) + 2 * Math.PI * loopR;
  const poleN = Math.min(Math.max(0, Math.round(num(cfg.lighting && cfg.lighting.poles, 0))) * 2, Math.max(1, Math.round(perimeter / 14)));
  const pointOnLoop = (t) => {
    const total = perimeter, d = ((t % total) + total) % total;
    const segs = [
      [2 * (hx - loopR), (u) => [-hx + loopR + u, -hz]],
      [Math.PI * loopR, (u) => [hx - loopR + loopR * Math.cos(u / loopR), -hz + loopR + loopR * Math.sin(u / loopR)]],
      [2 * (hz - loopR), (u) => [hx, -hz + loopR + u]],
      [Math.PI * loopR, (u) => [hx - loopR + loopR * Math.cos(u / loopR), hz - loopR + loopR * Math.sin(u / loopR)]],
      [2 * (hx - loopR), (u) => [hx - loopR - u, hz]],
      [Math.PI * loopR, (u) => [-hx + loopR + loopR * Math.cos(Math.PI + u / loopR), hz - loopR + loopR * Math.sin(Math.PI + u / loopR)]],
      [2 * (hz - loopR), (u) => [-hx, hz - loopR - u]],
      [Math.PI * loopR, (u) => [-hx + loopR + loopR * Math.cos(Math.PI + u / loopR), -hz + loopR + loopR * Math.sin(Math.PI + u / loopR)]]
    ];
    let left = d;
    for (const [len, fn] of segs) { if (left <= len) return fn(left); left -= len; }
    return [-hx + loopR, -hz];
  };
  for (let i = 0; i < poleN; i++) {
    const [x, z] = pointOnLoop((i + 0.5) * perimeter / poleN);
    out.push({ type: 'cylinder', pos: [x, 0, z], radius: 0.08, height: 4, color: colors.poleMast, meta: { kind: 'pole', idx: i, part: 'mast' } });
    out.push({ type: 'cylinder', pos: [x, 4, z], radius: 0.3, height: 0.12, color: colors.lamp, meta: { kind: 'pole', idx: i, part: 'lamp' } });
  }
  const flowers = ['#e0457b', '#f2c14e', '#c084fc', '#f97316'];
  for (let i = 0; i < 4; i++) {
    const a = i * HPI, x = Math.cos(a) * plazaR, z = Math.sin(a) * plazaR;
    out.push({ type: 'cylinder', pos: [x, 0, z], radius: 1.1, height: 0.3, color: '#6b4a2b', meta: { kind: 'flowerbed' } });
    out.push({ type: 'cylinder', pos: [x, 0.3, z], radius: 1.0, height: 0.12, color: flowers[i], meta: { kind: 'flowerbed' } });
  }
  if (pond) out.push({ type: 'cylinder', pos: [pond.x, 0.008, pond.z], radius: pond.r, height: 0.016, color: '#5aa9d6', opacity: 0.9, meta: { kind: 'water' } });
}

function standObjects(out, count, Fx, specs) {
  const st = specs.site.stand, colors = specs.colors;
  const n = clamp(Math.round(num(count, 0)), 0, 10);
  const seatLen = st.seats * st.seatW;
  for (let j = 0; j < n; j++) {
    const zc = (j - (n - 1) / 2) * (seatLen + 1.5);
    for (let r = 0; r < st.rows; r++) {
      const h = st.stepH * (r + 1);
      const x = -(Fx + 1.4) - st.stepD * (r + 0.5);
      out.push({ type: 'box', pos: [x, 0, zc], size: [st.stepD, h, seatLen], color: colors.standStep, meta: { kind: 'stands', unit: j, part: 'step', row: r } });
      out.push({ type: 'box', pos: [x, h, zc], size: [0.35, 0.08, seatLen], color: colors.standSeat, meta: { kind: 'stands', unit: j, part: 'seats', row: r } });
    }
  }
}

/* deterministic first-fit along the free perimeter (south row, then north);
   pinned entries bypass the cursor and land exactly at their pin (verbatim —
   outside the field is allowed) */
function equipmentObjects(out, items, Fx, Fz, specs, options) {
  const colors = specs.colors;
  const park = options && options.park;
  const L = options && options.L || Fx * 2, W = options && options.W || Fz * 2;
  let cursor = { x: -Fx + 0.4, row: 0 };
  let placed = 0;
  for (const it of items) {
    const fp = parseFootprint(it && it.dims, it && it.purp);
    if (!fp) continue;                                    // gracefully skip unparseable
    const qty = clamp(Math.round(num(it.qty, 1)), 1, 8);
    const zone = parseZone(it.zone != null ? it.zone : it.zone_m2);
    const img = typeof it.img === 'string' && it.img ? it.img : null;
    const imgT = typeof it.imgT === 'string' && it.imgT ? it.imgT : null;
    const pin = pinOf(it);
    for (let q = 0; q < qty; q++) {
      let x, z, y = 0, rotY = null, tiltX = null, tiltZ = null, pinned = false;
      if (pin) {
        x = pin[0] + q * (fp.w + 1.0);
        z = pin[1];
        if (pin[2] != null) rotY = pin[2];
        if (pin[3] != null) y = pin[3];
        if (pin[4] != null) tiltX = pin[4];
        if (pin[5] != null) tiltZ = pin[5];
        pinned = true;
      } else {
        if (park) {
          const rowStart = -Fx * 0.6, rowEnd = Fx * 0.6;
          let found = false;
          for (let guard = 0; guard < 64 && !found; guard++) {
            if (cursor.x < rowStart) cursor.x = rowStart;
            if (cursor.x + fp.w / 2 > rowEnd) {
              if (cursor.row === 1) break;
              cursor = { x: rowStart, row: 1 };
            }
            const candidateX = cursor.x + fp.w / 2;
            const candidateZ = cursor.row === 0 ? W * 0.28 : -W * 0.28;
            const pond = L * W >= 1500 ? { x: -Fx * 0.45, z: Fz * 0.35, r: Math.min(L, W) * 0.09 } : null;
            cursor.x += fp.w + 1.0;
            if (pond && Math.hypot(candidateX - pond.x, candidateZ - pond.z) < pond.r + Math.max(fp.w, fp.d) / 2) continue;
            x = candidateX; z = candidateZ; found = true;
          }
          if (!found) break;
        } else if (cursor.x + fp.w / 2 > Fx - 0.4) {
          if (cursor.row === 1) break;
          cursor = { x: -Fx + 0.4, row: 1 };
          if (cursor.x + fp.w / 2 > Fx - 0.4) break;
        }
        if (!park) {
          x = cursor.x + fp.w / 2;
          const zS = Fz + 0.7 + fp.d / 2;
          z = cursor.row === 0 ? zS : -zS;
          cursor.x += fp.w + 1.0;
        }
      }
      const metaE = { kind: 'equipment', id: it.id != null ? String(it.id) : null, name: it.name || null, purp: it.purp || null, cat: it.cat || null, dims: it.dims != null ? String(it.dims) : null, idx: placed, unit: placed, q };
      if (pinned) metaE.pinned = true;
      if (zone) {
        out.push({ type: 'cylinder', pos: [x, y + 0.005, z], radius: Math.sqrt(zone / Math.PI), height: 0.01, color: specs.colors.halo, opacity: 0.16, meta: { kind: 'halo', zone, idx: placed, unit: placed, eqId: metaE.id, pinned } });
      }
      const rotProp = { ...(rotY != null ? { rotY } : {}), ...(tiltX != null ? { tiltX } : {}), ...(tiltZ != null ? { tiltZ } : {}) };
      if (img) {
        /* photo billboard on a base plate; real footprint stays in meta */
        out.push({ type: 'box', pos: [x, y, z], size: [fp.w, 0.05, fp.d], color: colors.equipment[placed % colors.equipment.length], ...rotProp, meta: { ...metaE, part: 'base' } });
        out.push({ type: 'billboard', pos: [x, y + 0.05, z], size: [Math.min(fp.w, fp.h), fp.h], img, imgT, ...rotProp, meta: { ...metaE, part: 'photo', fp } });
      } else {
        out.push({ type: 'box', pos: [x, y, z], size: [fp.w, fp.h, fp.d], color: colors.equipment[placed % colors.equipment.length], ...rotProp, meta: metaE });
      }
      placed++;
    }
  }
  return placed;
}

/* street workout pad: two anchor rows; catalog equipment claims slots first.
   Pinned units land exactly at their pin instead of claiming a slot — the slot
   stays free and gets a default station (slot count is pin-invariant). */
function workoutObjects(out, cfg, sp, L, W, specs) {
  const colors = specs.colors;
  const sl = sp.slots || { rows: 2, perRow: 4, margin: 2 };
  const slots = [];
  for (let r = 0; r < sl.rows; r++) {
    const z = (r === 0 ? -1 : 1) * (W / 4);
    for (let i = 0; i < sl.perRow; i++) {
      slots.push([ -L / 2 + sl.margin + i * (L - 2 * sl.margin) / (sl.perRow - 1), z ]);
    }
  }
  const units = [];
  for (const it of (cfg.equipment || [])) {
    const fp = parseFootprint(it && it.dims, it && it.purp);
    if (!fp) continue;
    const zone = parseZone(it.zone != null ? it.zone : it.zone_m2);
    const qty = clamp(Math.round(num(it.qty, 1)), 1, 6);
    const pin = pinOf(it);
    for (let q = 0; q < qty; q++) {
      let unitPin = null;
      if (pin) {
        unitPin = [pin[0] + q * (fp.w + 1.0), pin[1]];
        if (pin[2] != null) unitPin[2] = pin[2];
        if (pin[3] != null) unitPin[3] = pin[3];
        if (pin[4] != null) unitPin[4] = pin[4];
        if (pin[5] != null) unitPin[5] = pin[5];
      }
      units.push({ fp, zone, id: it.id, name: it.name, purp: it.purp, cat: it.cat, dims: it.dims, q,
        img: typeof it.img === 'string' && it.img ? it.img : null,
        imgT: typeof it.imgT === 'string' && it.imgT ? it.imgT : null,
        pin: unitPin });
    }
  }
  /* one equipment unit → base + photo/box tier (+ halo). slot=null → pinned unit. */
  const emitUnit = (u, x, z, slot, uord) => {
    const metaE = { kind: 'equipment', id: u.id != null ? String(u.id) : null, name: u.name || null, purp: u.purp || null, cat: u.cat || null, dims: u.dims != null ? String(u.dims) : null, unit: uord, q: u.q };
    if (slot != null) metaE.slot = slot;
    else metaE.pinned = true;
    const colIdx = slot != null ? slot : uord;
    const rotY = u.pin && u.pin[2] != null ? u.pin[2] : null;
    const y = (u.pin && u.pin[3] != null ? u.pin[3] : 0);
    const tiltX = u.pin && u.pin[4] != null ? u.pin[4] : null;
    const tiltZ = u.pin && u.pin[5] != null ? u.pin[5] : null;
    const rotProp = { ...(rotY != null ? { rotY } : {}), ...(tiltX != null ? { tiltX } : {}), ...(tiltZ != null ? { tiltZ } : {}) };
    if (u.zone) {
      out.push({ type: 'cylinder', pos: [x, y + 0.005, z], radius: Math.sqrt(u.zone / Math.PI), height: 0.01, color: colors.halo, opacity: 0.16, meta: { kind: 'halo', zone: u.zone, unit: uord, eqId: metaE.id, pinned: slot == null } });
    }
    if (u.img) {
      /* workout slot claimed by catalog item with photo: billboard on base plate */
      out.push({ type: 'box', pos: [x, y, z], size: [u.fp.w, 0.05, u.fp.d], color: colors.equipment[colIdx % colors.equipment.length], ...rotProp, meta: { ...metaE, part: 'base' } });
      out.push({ type: 'billboard', pos: [x, y + 0.05, z], size: [Math.min(u.fp.w, u.fp.h), u.fp.h], img: u.img, imgT: u.imgT, ...rotProp, meta: { ...metaE, part: 'photo', fp: u.fp } });
    } else {
      out.push({ type: 'box', pos: [x, y, z], size: [u.fp.w, u.fp.h, u.fp.d], color: colors.equipment[colIdx % colors.equipment.length], ...rotProp, meta: metaE });
    }
  };
  units.forEach((u, ui) => { if (u.pin) emitUnit(u, u.pin[0], u.pin[1], null, ui); });
  const free = units.filter(u => !u.pin);
  const defaults = sp.stations || [];
  let di = 0;
  slots.forEach(([ax, az], si) => {
    if (si < free.length) {
      emitUnit(free[si], ax, az, si, units.indexOf(free[si]));
      return;
    }
    const st = defaults[di % defaults.length];
    di++;
    const meta = { kind: 'station', station: st.id, slot: si };
    for (const part of st.parts) {
      if (part.p === 'post') {
        out.push({ type: 'cylinder', pos: [ax + part.x, 0, az + part.z], radius: part.r || 0.045, height: part.h, color: part.color || colors.steel, meta: { ...meta, part: 'post' } });
      } else if (part.p === 'bar') {
        const x0 = ax + part.x0, z0 = az + part.z0, x1 = ax + part.x1, z1 = az + part.z1;
        const len = Math.hypot(x1 - x0, z1 - z0);
        out.push({ type: 'cylinder', pos: [(x0 + x1) / 2, part.y, (z0 + z1) / 2], radius: part.r || 0.018, height: len, dir: Math.abs(x1 - x0) >= Math.abs(z1 - z0) ? 'x' : 'z', color: part.color || colors.steelDark, meta: { ...meta, part: 'bar' } });
      } else if (part.p === 'box') {
        out.push({ type: 'box', pos: [ax + part.x, part.y || 0, az + part.z], size: part.size, color: part.color || colors.steelDark, meta: { ...meta, part: 'box' } });
      }
    }
  });
}

/* ── surface planes ────────────────────────────────────────────────── */
function surfaceObjects(out, surfaceId, variantKey, L, W, specs) {
  const surf = (specs.surfaces && specs.surfaces[surfaceId]) || null;
  if (!surf) return;
  const variants = surf.variants || [];
  const v = variants.find(x => x.key === variantKey) || variants[0];
  if (!v) return;
  if (surf.kind === 'acrylic') {
    /* two-tone: green apron out to the fence corner + blue playing zone */
    const gap = specs.site.fenceGap;
    out.push({ type: 'plane', pos: [0, -0.008, 0], size: [L + 2 * gap + 2.4, W + 2 * gap + 2.4], color: v.outer, material: { kind: 'flat', spec: surf, variant: v }, meta: { kind: 'apron', surface: surfaceId } });
    const grow = surf.zoneGrow || 0.4;
    out.push({ type: 'plane', pos: [0, 0, 0], size: [L + 2 * grow, W + 2 * grow], color: v.inner, material: { kind: 'flat', spec: surf, variant: v }, meta: { kind: 'field', surface: surfaceId, variant: v.key } });
  } else {
    out.push({ type: 'plane', pos: [0, 0, 0], size: [L, W], color: v.base, material: { kind: surf.kind, spec: surf, variant: v }, meta: { kind: 'field', surface: surfaceId, variant: v.key } });
  }
}

/* ── dimension overlay (outer L×W with metre labels) ───────────────── */
function dimObjects(out, L, W, Fx, Fz, specs) {
  const c = specs.colors.dimLine, y = 0.03, t = 0.035;
  const zD = Fz + 1.9, xD = Fx + 1.9;
  const meta = { kind: 'dim-line' };
  mLineX(out, -L / 2, zD, L / 2, zD, t, c, y, meta);
  mLineX(out, -L / 2, zD - 0.25, -L / 2, zD + 0.25, t, c, y, meta);
  mLineX(out, L / 2, zD - 0.25, L / 2, zD + 0.25, t, c, y, meta);
  out.push({ type: 'text', pos: [0, 0.55, zD], text: fmtM(L), size: 0.8, color: c, meta: { ...meta, axis: 'l' } });
  mLineX(out, xD, -W / 2, xD, W / 2, t, c, y, meta);
  mLineX(out, xD - 0.25, -W / 2, xD + 0.25, -W / 2, t, c, y, meta);
  mLineX(out, xD - 0.25, W / 2, xD + 0.25, W / 2, t, c, y, meta);
  out.push({ type: 'text', pos: [xD, 0.55, 0], text: fmtM(W), size: 0.8, color: c, meta: { ...meta, axis: 'w' } });
}
function mLineX(out, x0, z0, x1, z1, w, color, y, meta) {
  out.push({ type: 'line', points: [[x0, y, z0], [x1, y, z1]], width: w, color, meta });
}

/* ═══════════════════════════════════════════════════════════════════ */

export function buildSceneModel(config, specs) {
  specs = specs || SCENE_SPECS;
  const cfg = config || {};
  const out = [];
  const sp = (specs.sports && specs.sports[cfg.sport]) || null;
  const L = sp ? clamp(num(cfg.dims && cfg.dims.l, 0) || sp.dims.l, 2, 130)
               : clamp(num(cfg.dims && cfg.dims.l, 20), 2, 130);
  const W = sp ? clamp(num(cfg.dims && cfg.dims.w, 0) || sp.dims.w, 2, 130)
               : clamp(num(cfg.dims && cfg.dims.w, 12), 2, 130);
  const lineColor = specs.colors.line;

  const isPark = sp && sp.kind === 'park';
  const surfaceId = isPark ? 'lawn' : (cfg.surface || (sp && specs.surfaceOf && specs.surfaceOf[cfg.sport]) || null);
  surfaceObjects(out, surfaceId, isPark ? 'green' : (cfg.colors && cfg.colors.surface), L, W, specs);

  const equip = [];
  if (sp) {
    if (sp.base === 'football') footballMarks(sp, L, W, lineColor, MARK_Y, out, equip);
    else if (sp.base === 'basketball') basketballMarks(sp, L, W, lineColor, MARK_Y, out, equip);
    else if (sp.base === 'volleyball') volleyballMarks(sp, L, W, lineColor, MARK_Y, out);
    else if (sp.base === 'tennis') tennisMarks(sp, L, W, lineColor, MARK_Y, out);
    else if (sp.base === 'multisport') {
      (sp.layers || []).forEach((ly, i) => {
        const LL = ly.l || L, WW = ly.w || W, col = ly.color || lineColor, y = MARK_Y + i * 0.004;
        if (ly.use === 'football') footballMarks(ly, LL, WW, col, y, out, equip);
        else if (ly.use === 'basketball') basketballMarks(ly, LL, WW, col, y, out, equip);
        else if (ly.use === 'volleyball') volleyballMarks(ly, LL, WW, col, y, out);
      });
    }
  }

  for (const d of equip) {
    if (d.kind === 'goal') goalObjects(out, d, specs.colors);
    else if (d.kind === 'hoop') hoopObjects(out, d, specs.colors);
  }
  if (sp && sp.base === 'tennis' && sp.net) tennisNetObjects(out, sp, W, specs.colors);
  if (sp && sp.base === 'volleyball' && sp.net) volleyballNetObjects(out, sp, W, specs.colors);

  const { Fx, Fz } = fenceObjects(out, cfg, L, W, specs);

  /* site slab: soft uniform ground pad under the whole facility — the facility
     doesn't float on page background; fence/pole shadows land on it */
  out.push({ type: 'plane', pos: [0, -0.02, 0], size: [2 * (Fx + 4.4), 2 * (Fz + 4.4)], color: specs.colors.siteSlab || '#e6ebf0', meta: { kind: 'site-ground' } });

  if (sp && sp.base === 'park') {
    parkObjects(out, cfg, L, W, specs);
    equipmentObjects(out, Array.isArray(cfg.equipment) ? cfg.equipment : [], Fx, Fz, specs, { park: true, L, W });
  } else if (sp && sp.base === 'workout') {
    workoutObjects(out, cfg, sp, L, W, specs);
  } else {
    equipmentObjects(out, Array.isArray(cfg.equipment) ? cfg.equipment : [], Fx, Fz, specs, { L, W });
  }

  const ex = cfg.extras || {};
  const poles = cfg.lighting && cfg.lighting.poles;
  if (!(sp && sp.base === 'park')) poleObjects(out, poles, Fx, Fz, specs);
  if (!(sp && sp.base === 'park')) benchObjects(out, ex.benches, Fx, Fz, specs);
  standObjects(out, ex.stands_50, Fx, specs);

  dimObjects(out, L, W, Fx, Fz, specs);

  return out;
}
