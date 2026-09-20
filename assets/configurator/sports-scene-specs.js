/* ═══════════════════════════════════════════════════════════════════
   sports-scene-specs.js — DATA ONLY. Per-sport / per-surface scene knowledge
   for the sports configurator 3D scene engine. Pure ES module, zero imports,
   safe to import in node (acceptance tests) and in the browser (renderer).

   Per-sport knowledge lives HERE, not in the renderer and not in the model
   builder logic: the model (sports-scene-model.js) contains only generic
   builders that mechanically evaluate these specs.

   Scene conventions (see sports-scene-model.js header):
     metres · field centred at origin · X along field length (east) ·
     Z along field width (south) · Y up · ground y=0.
   All numbers below are metres, signed/absolute position values the generic
   sport builders in the model evaluate mechanically.
   ═══════════════════════════════════════════════════════════════════ */

const LINE = '#f5f7f9';          // standard white marking paint
const STEEL = '#a7b0ba';         // galvanized-ish workout steel
const STEEL_D = '#7d8794';       // darker structural steel
const ACCENT = '#d3542c';        // workout accent orange
const GOAL_W = '#f2f5f7';        // goal frame white

export const SCENE_SPECS = {
  version: 1,

  /* site-wide numeric constants (renderer/model read these, never invent) */
  site: {
    fenceGap: 1.2,          // m between field edge and fence line
    postSpacing: 2.5,       // target spacing of fence posts
    postRadius: 0.045,
    gateWidth: 1.2,         // gate clear opening
    gatePostRadius: 0.06,
    netRise: 1.2,           // gallery protective net rise above fence
    poleHeight: 6,          // lighting pole mast height
    poleLampCount: 2,       // lamp heads per pole
    roofThickness: 0.2,
    roofFallbackHeight: 4,  // roof support height when no fence is present
    benchLength: 1.8,
    stand: { rows: 3, seats: 17, seatW: 0.5, stepH: 0.38, stepD: 0.8 }
  },

  /* ── surfaces ──────────────────────────────────────────────────────
     kind drives the renderer's texture generator; variants are pure color
     presets: model picks config.colors?.surface (variant key), default first.
       turf    → mow stripes (stripePitch m) or natural speckle (stripes: 0)
       tartan  → fine EPDM speckle
       acrylic → two-tone: playing zone `inner`, apron `outer`
       clay    → fine orange-brown noise                                        */
  surfaces: {
    turf_multi: { kind: 'turf', stripePitch: 8, variants: [
      { key: 'classic', base: '#3f9c55', alt: '#379050', speckle: false },
      { key: 'deep',    base: '#2f8044', alt: '#2a743c', speckle: false },
      { key: 'bright',  base: '#4baa5f', alt: '#3f9c55', speckle: false }
    ] },
    turf_football: { kind: 'turf', stripePitch: 8, variants: [
      { key: 'classic', base: '#3a9e4e', alt: '#328f45', speckle: false },
      { key: 'deep',    base: '#2c7f41', alt: '#27723a', speckle: false },
      { key: 'bright',  base: '#48ad5d', alt: '#3fa052', speckle: false }
    ] },
    turf_natural: { kind: 'turf', stripePitch: 0, variants: [
      { key: 'meadow', base: '#4d8f47', alt: '#468545', speckle: true },
      { key: 'dry',    base: '#6d8f43', alt: '#648240', speckle: true },
      { key: 'deep',   base: '#3e7c3c', alt: '#387138', speckle: true }
    ] },
    tartan: { kind: 'tartan', variants: [
      { key: 'red',   base: '#b23c2a', alt: '#a03424', speckle: true },
      { key: 'blue',  base: '#31568f', alt: '#2a4b80', speckle: true },
      { key: 'green', base: '#3d7a52', alt: '#356b47', speckle: true }
    ] },
    acrylic: { kind: 'acrylic', zoneGrow: 0.4, variants: [
      { key: 'blue-green', inner: '#2a5da8', outer: '#3a8a5f' },
      { key: 'ao-blue',    inner: '#2664c8', outer: '#4f9dd8' },
      { key: 'green',      inner: '#2e7d54', outer: '#266b47' }
    ] },
    clay: { kind: 'clay', variants: [
      { key: 'red',   base: '#a3512c', alt: '#96492a', speckle: true },
      { key: 'light', base: '#b96a3e', alt: '#ac6036', speckle: true },
      { key: 'green', base: '#5f7457', alt: '#56694f', speckle: true }
    ] },
    lawn: { kind: 'lawn', variants: [
      { key: 'green', base: '#5e9e4a', patches: ['#6fae55', '#559143'] }
    ] },
    paving: { kind: 'paving', variants: [
      { key: 'grey', base: '#9aa3ad', joint: '#68737e' },
      { key: 'sand', base: '#d8c9a3', joint: '#9f906f' }
    ] }
  },

  /* default surface per sport — used ONLY when config.surface is falsy */
  surfaceOf: {
    football5: 'turf_football', football7: 'turf_football', football11: 'turf_football',
    basketball: 'acrylic', volleyball: 'acrylic', tennis: 'acrylic',
    multisport: 'tartan', street_workout: 'tartan', open_park: 'lawn'
  },

  /* ── sports ──────────────────────────────────────────────────────────
     base selects the generic builder in the model:
       'football' | 'basketball' | 'volleyball' | 'tennis' |
       'multisport' (layers[] of the other bases) | 'workout'
     equip: declarative equipment descriptors the model materialises into
     goal frames / nets+posts / basketball hoop units.                      */
  sports: {

    /* 5-a-side on a futsal-sized pitch: no boxes — quarter-circle penalty
       arcs r=6 from each goal post + straight 3 m segment at 6 m depth,
       penalty spot 6 m, second spot 10 m, centre circle r=3. */
    football5: {
      dims: { l: 40, w: 20 }, base: 'football',
      lineW: 0.08, centerR: 3, cornerR: 0.25,
      end: { style: 'quarters', r: 6, spotA: 6, spotB: 10 },
      goal: { w: 3, h: 2, depth: 0.8, r: 0.06 }
    },

    /* 7-a-side: boxes scaled to the 60x40 pitch (youth/amateur standard). */
    football7: {
      dims: { l: 60, w: 40 }, base: 'football',
      lineW: 0.10, centerR: 6, cornerR: 0.5,
      end: { style: 'boxes', goalArea: { d: 4, w: 10 }, penalty: { d: 9, w: 24, spot: 7, arcR: 6 } },
      goal: { w: 5, h: 2, depth: 1.0, r: 0.07 }
    },

    /* 11-a-side: FIFA penalty area 16.5 d x 40.32 w, spot 11 m, arc r 9.15. */
    football11: {
      dims: { l: 105, w: 68 }, base: 'football',
      lineW: 0.12, centerR: 9.15, cornerR: 1,
      end: { style: 'boxes', goalArea: { d: 5.5, w: 18.32 }, penalty: { d: 16.5, w: 40.32, spot: 11, arcR: 9.15 } },
      goal: { w: 7.32, h: 2.44, depth: 1.2, r: 0.06 }
    },

    /* FIBA 28x15: key 5.8 deep x 4.9 wide, FT circle r 1.8, 3PT r 6.75 from
       basket point (1.575 m off baseline) with 2.99 m straight segments at
       0.9 m from the sidelines; no-charge arc r 1.25. */
    basketball: {
      dims: { l: 28, w: 15 }, base: 'basketball',
      lineW: 0.05, centerR: 1.8,
      three: { r: 6.75, anchor: 1.575, straight: 2.99, inset: 0.9 },
      key: { depth: 5.8, halfW: 2.45, ftR: 1.8 },
      chargeR: 1.25,
      hoop: { rimH: 3.05, rimR: 0.225, boardW: 1.8, boardH: 1.05, boardThick: 0.05,
              boardBottom: 2.9, boardFaceOff: 1.2, poleOff: 0.75, pole: 0.3 }
    },

    /* FIVB 18x9: attack lines 3 m each side of the net line. */
    volleyball: {
      dims: { l: 18, w: 9 }, base: 'volleyball',
      lineW: 0.05, attackD: 3,
      net: { h: 2.43, clearH: 1.0, postOut: 0.5, postR: 0.06, antenna: 0.8 }
    },

    /* ITF: doubles court 23.77 x 10.97, singles sidelines 1.37 m inset,
       service lines 6.40 m from the net, net 1.07 m at posts / 0.914 m centre,
       posts 0.914 m outside the doubles sidelines. */
    tennis: {
      dims: { l: 23.77, w: 10.97 }, base: 'tennis',
      lineW: 0.10, singlesInset: 1.37, serviceD: 6.40,
      net: { postOut: 0.914, hEnd: 1.07, hMid: 0.914, postR: 0.08 }
    },

    /* Composite pitch+court: football (white) + 28x15 basketball court
       (blue) + 18x9 volleyball court (amber), all centred on the pad. */
    multisport: {
      dims: { l: 32, w: 18 }, base: 'multisport',
      layers: [
        { use: 'football', color: LINE, lineW: 0.07, centerR: 4, cornerR: 0.5,
          end: { style: 'boxes', goalArea: { d: 3, w: 8 }, penalty: { d: 7, w: 16, spot: 6, arcR: 5 } },
          goal: { w: 3, h: 2, depth: 0.8, r: 0.06 } },
        { use: 'basketball', color: '#7ab5f0', l: 28, w: 15, lineW: 0.05, centerR: 1.8,
          three: { r: 6.75, anchor: 1.575, straight: 2.99, inset: 0.9 },
          key: { depth: 5.8, halfW: 2.45, ftR: 1.8 }, chargeR: 1.25,
          hoop: { rimH: 3.05, rimR: 0.225, boardW: 1.8, boardH: 1.05, boardThick: 0.05,
                  boardBottom: 2.9, boardFaceOff: 1.2, poleOff: 0.75, pole: 0.3 } },
        { use: 'volleyball', color: '#ffd23f', l: 18, w: 9, lineW: 0.05, attackD: 3, net: null }
      ]
    },

    /* NO pitch: tartan pad with a two-row station layout. Slots are claimed
       first by catalog equipment from config.equipment (their parsed
       footprints replace the default arrangement), remaining slots get the
       default stations below in order. Parts are data: post/bar/box members
       given as local offsets from the slot anchor. */
    street_workout: {
      dims: { l: 15, w: 10 }, base: 'workout',
      slots: { rows: 2, perRow: 4, margin: 2.0 },
      stations: [
        { id: 'pull-up', parts: [
          { p: 'post', x: -0.9, z: 0, h: 2.4 }, { p: 'post', x: 0.9, z: 0, h: 2.4 },
          { p: 'bar', x0: -0.9, z0: 0, x1: 0.9, z1: 0, y: 2.32, r: 0.018, color: STEEL_D }
        ] },
        { id: 'parallel', parts: [
          { p: 'post', x: -0.9, z: -0.3, h: 1.15 }, { p: 'post', x: -0.9, z: 0.3, h: 1.15 },
          { p: 'post', x: 0.9, z: -0.3, h: 1.15 }, { p: 'post', x: 0.9, z: 0.3, h: 1.15 },
          { p: 'bar', x0: -0.9, z0: -0.3, x1: 0.9, z1: -0.3, y: 1.15, r: 0.02, color: ACCENT },
          { p: 'bar', x0: -0.9, z0: 0.3, x1: 0.9, z1: 0.3, y: 1.15, r: 0.02, color: ACCENT }
        ] },
        { id: 'ladder', parts: [
          { p: 'post', x: -1.2, z: -0.5, h: 2.5 }, { p: 'post', x: -1.2, z: 0.5, h: 2.5 },
          { p: 'post', x: 1.2, z: -0.5, h: 2.5 }, { p: 'post', x: 1.2, z: 0.5, h: 2.5 },
          { p: 'bar', x0: -1.2, z0: -0.5, x1: 1.2, z1: -0.5, y: 2.45, r: 0.018, color: STEEL_D },
          { p: 'bar', x0: -1.2, z0: 0.5, x1: 1.2, z1: 0.5, y: 2.45, r: 0.018, color: STEEL_D },
          { p: 'bar', x0: -1.0, z0: -0.5, x1: -1.0, z1: 0.5, y: 2.45, r: 0.014 },
          { p: 'bar', x0: -0.6, z0: -0.5, x1: -0.6, z1: 0.5, y: 2.45, r: 0.014 },
          { p: 'bar', x0: -0.2, z0: -0.5, x1: -0.2, z1: 0.5, y: 2.45, r: 0.014 },
          { p: 'bar', x0: 0.2, z0: -0.5, x1: 0.2, z1: 0.5, y: 2.45, r: 0.014 },
          { p: 'bar', x0: 0.6, z0: -0.5, x1: 0.6, z1: 0.5, y: 2.45, r: 0.014 },
          { p: 'bar', x0: 1.0, z0: -0.5, x1: 1.0, z1: 0.5, y: 2.45, r: 0.014 }
        ] },
        { id: 'dips', parts: [
          { p: 'post', x: -0.35, z: -0.5, h: 1.05 }, { p: 'post', x: -0.35, z: 0.5, h: 1.05 },
          { p: 'post', x: 0.35, z: -0.5, h: 1.05 }, { p: 'post', x: 0.35, z: 0.5, h: 1.05 },
          { p: 'bar', x0: -0.35, z0: -0.5, x1: -0.35, z1: 0.5, y: 1.05, r: 0.02, color: ACCENT },
          { p: 'bar', x0: 0.35, z0: -0.5, x1: 0.35, z1: 0.5, y: 1.05, r: 0.02, color: ACCENT }
        ] },
        { id: 'incline', parts: [
          { p: 'post', x: -0.6, z: -0.2, h: 0.35 }, { p: 'post', x: -0.6, z: 0.2, h: 0.35 },
          { p: 'post', x: 0.6, z: -0.2, h: 0.35 }, { p: 'post', x: 0.6, z: 0.2, h: 0.35 },
          { p: 'box', x: 0, z: 0, y: 0.35, size: [1.6, 0.12, 0.5], color: ACCENT }
        ] }
      ]
    },
    open_park: {
      dims: { l: 60, w: 40 }, kind: 'park', base: 'park'
    }
  },

  colors: {
    line: LINE, steel: STEEL, steelDark: STEEL_D, accent: ACCENT, goalFrame: GOAL_W,
    fencePost: '#5b6570', fencePostGalv: '#c9cfd6', gateFrame: '#39404a',
    net: '#e8edf2', poleMast: '#3d4654', lamp: '#fff3bf',
    benchWood: '#8a6f4d', benchFrame: '#3d4654',
    standStep: '#6b7686', standSeat: '#4c8ac9',
    equipment: ['#7d8794', '#8a94a3', '#6f7b87'],
    halo: '#e8a13a', roof: '#cfd8e3', dimLine: '#c98f2e',
    siteSlab: '#e6ebf0', paving: '#9aa3ad',
    trees: ['#3f8f45', '#559f4c', '#6eaa50', '#c98a3a']
  }
};
