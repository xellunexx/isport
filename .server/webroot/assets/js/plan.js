/* plan.js — presentation-grade plan renderer for "Направи си сам".
   Vector, top-view, park-plan look: perimeter walking path, corner trees, grass texture,
   safety-zones as dashed clearance, equipment as recognizable pictograms drawn to scale.
   Layout heuristics: anchor centerpiece, play ring, street furniture along the perimeter,
   guaranteed non-overlap (relaxation passes), auto-grows plot if budget demands. */
window.ICP = (function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const T = k => (window.ICT ? ICT(k) : k);

  /* ---------- parsing (dims, zones, users) ---------- */
  function parseDims(s) {
    if (!s) return null;
    const nums = (s.match(/\d[\d\s.,]*/g) || []).map(x => parseFloat(x.replace(/\s/g, "").replace(",", "."))).filter(n => n > 0);
    if (nums.length < 2) return null;
    const unit = /mm/i.test(s) ? 0.001 : (/cm/.test(s) ? 0.01 : 1);
    const mm = nums.map(n => n * unit);
    let w = mm[0], d = mm[2] || mm[1]; // W x H x L convention on this catalog
    return { w: Math.min(Math.max(w, 0.3), 40), d: Math.min(Math.max(d, 0.3), 40) };
  }
  function parseZone(s) {
    if (!s) return 0;
    const m = s.match(/([\d.,]+)/);
    return m ? parseFloat(m[1].replace(",", ".")) || 0 : 0;
  }
  function safetyPad(p) {
    const fp = parseDims(p.sp && p.sp.d) || { w: 2, d: 2 };
    const z = parseZone(p.sp && p.sp.z);
    let pad = 0.6;
    if (z > 0) {
      const fa = fp.w * fp.d;
      pad = Math.max(0.6, Math.min(2.4, (Math.sqrt(z) - Math.sqrt(fa)) / 2 || 0.6));
    }
    return pad;
  }

  /* ---------- palette ---------- */
  const SURF = { play: "#dfe8c8", park: "#e3e0cd", sport: "#dfe6ec", mix: "#e8e3d4" }; // muted ground palettes
  const INK = "#3d3a30";
  const ACC = "#d14d0f";
  const EARTH = "#8a7f63";
  const GRASS = ["#acc48b", "#9fb982", "#b3c894"];
  const PATH = "#efe9da";
  const SF_ZONE = "rgba(90,80,60,.55)";

  const GROUP_OF = p => {
    if (p.cat === "park") return "perimeter";                          // benches/tables/bins/planters/bike/bussstop...
    if (p.cat === "flooring") return "safety-surface";
    if (p.cat === "sport") return ["arenas", "goals"].includes(p.purp) ? "center-sport" : "sport-ring";
    return ["multiplay", "climbers"].includes(p.purp) ? "anchor" : "play-ring";
  };

  /* ---------- layout ---------- */
  function layout(itemsIn, areaM2, space) {
    let items = itemsIn.map(it => ({
      p: it.p, w: it.dims.w, d: it.dims.d, pad: it.pad, est: it.dims.est,
      group: GROUP_OF(it.p), cat: it.p.cat, purp: it.p.purp,
    }));
    const padTotal = items.reduce((s, i) => s + (i.w + i.pad * 2) * (i.d + i.pad * 2), 0);
    let side = Math.max(16, Math.sqrt(Math.max(areaM2, padTotal * 1.55)));
    let placed = null;
    for (let growTry = 0; growTry < 4 && !placed; growTry++) {
      placed = placeOnPlot(items, side, side * 0.82, space);
      side *= 1.18;
    }
    if (!placed) placed = placeOnPlot(items, side, side, space) || { items, plotW: side, plotH: side, deco: { trees: [] } };
    return placed;
  }

  function placeOnPlot(items, W, H, space) {
    const deco = { trees: [] };
    const margin = 1.4, pathW = 2.1;
    const anchor = items.find(i => i.group === "anchor") || items[0];
    const rest = items.filter(i => i !== anchor);
    const out = [];
    // anchor at center
    if (anchor) out.push({ ...anchor, x: W / 2 - (anchor.w + anchor.pad * 2) / 2, y: H / 2 - (anchor.d + anchor.pad * 2) / 2, rot: 0 });
    const cx = W / 2, cy = H / 2;
    const play = rest.filter(i => ["play-ring", "sport-ring", "center-sport"].includes(i.group));
    const peri = rest.filter(i => i.group === "perimeter");
    const surf = rest.filter(i => i.group === "safety-surface");
    // inner play ring around anchor
    const ringR = Math.max(anchor ? Math.max(anchor.w, anchor.d) + 4.5 : 5, 6);
    const nP = play.length;
    let ang = -Math.PI / 2;
    play.sort((a, b) => (b.w * b.d) - (a.w * a.d));
    play.forEach((it, k) => {
      const a = ang + (k / Math.max(1, nP)) * Math.PI * 2;
      const iw = it.w + it.pad * 2, ih = it.d + it.pad * 2;
      let x = cx + Math.cos(a) * (ringR + Math.max(it.w, it.pad) + iw / 2) - iw / 2;
      let y = cy + Math.sin(a) * (ringR + Math.max(it.d, it.pad) + ih / 2) - ih / 2;
      // long side faces center for pretty look
      out.push({ ...it, x, y, rot: Math.atan2(cy - (y + ih / 2), cx - (x + iw / 2)) });
    });
    // safety surface (flooring) spills under play
    const playBox = bboxOf(out.filter(o => ["play-ring", "anchor", "center-sport", "sport-ring"].includes(o.group)), 2);
    for (const it of surf) out.push({ ...it, x: playBox.x, y: playBox.y, w: playBox.w, d: playBox.h, rot: 0, underlay: true });
    // perimeter along the inner path (benches/bins face inward)
    const lane = margin + pathW / 2 + 0.6;
    const perPath = [
      [lane, H - lane, W - lane, H - lane],          // south edge
      [lane, lane, W - lane, lane],                  // north
      [lane, lane * 1.6, lane, H - lane],            // west
      [W - lane, lane * 1.6, W - lane, H - lane * 1.05], // east
    ];
    let edge = 0, t = 0;
    peri.forEach((it, i) => {
      const [x1, y1, x2, y2] = perPath[edge % perPath.length];
      const L = Math.hypot(x2 - x1, y2 - y1) - (it.w + 2);
      if (t > 1) { edge++; t = 0; }
      const useEdge = perPath[Math.min(edge, perPath.length - 1)];
      const [a1, b1, a2, b2] = useEdge.length ? useEdge : [0, 0, 0, 0];
      t += (it.w + 2.2) / L;
      const px = a1 + (a2 - a1) * Math.min(1, t), py = b1 + (b2 - b1) * Math.min(1, t);
      out.push({ ...it, x: px - (it.w / 2), y: py - (it.d / 2), rot: Math.atan2((cy - py), (cx - px)) });
    });
    // resolve overlaps via relaxation (full-gap pushes; clamp; repeat until clean)
    const relax = () => {
      for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
        const A = out[i], B = out[j];
        if (A.underlay || B.underlay) continue;
        const ax = A.x + A.w / 2 + A.pad, ay = A.y + A.d / 2 + A.pad, ar = Math.max(A.w, A.d) / 2 + A.pad;
        const bx = B.x + B.w / 2 + B.pad, by = B.y + B.d / 2 + B.pad, br = Math.max(B.w, B.d) / 2 + B.pad;
        const dd = Math.hypot(ax - bx, ay - by);
        const min = ar + br + 0.08;
        if (dd < min) {
          if (dd > 0.001) {
            const ux = (ax - bx) / dd, uy = (ay - by) / dd, push = min - dd;
            A.x += ux * push * .55; A.y += uy * push * .55; B.x -= ux * push * .55; B.y -= uy * push * .55;
          } else { A.x += 0.15; } // perfect stack degenerate: nudge
        }
      }
    };
    const bounds = () => {
      for (const o of out) {
        if (o.underlay) continue;
        o.x = Math.min(Math.max(o.x, margin), Math.max(margin, W - o.w - margin - o.pad * 1.2));
        o.y = Math.min(Math.max(o.y, margin), Math.max(margin, H - o.d - margin - o.pad * 1.2));
      }
    };
    for (let iter = 0; iter < 240; iter++) { relax(); if (iter % 6 === 5) bounds(); }
    bounds(); relax(); bounds();
    // corner trees (decorative, outside walking lane)
    const corners = [[margin + 1.4, margin + 1.4], [W - margin - 1.4, margin + 1.4], [margin + 1.4, H - margin - 1.4], [W - margin - 1.4, H - margin - 1.4]];
    corner_chk: for (const [tx, ty] of corners) {
      for (const o of out) {
        if (o.underlay) continue;
        if (Math.abs((o.x + o.w / 2) - tx) < (o.w / 2 + o.pad + 1.2) && Math.abs((o.y + o.d / 2) - ty) < (o.d / 2 + o.pad + 1.2)) continue corner_chk;
      }
      deco.trees.push({ x: tx, y: ty });
    }
    return { items: out, plotW: W, plotH: H, deco, surfacePoly: playBox.width ? playBox : null, pathHalf: margin + pathW / 2 };
  }
  function bboxOf(items, add) {
    if (!items.length) return { x: 2, y: 2, w: 8, h: 8 };
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    for (const i of items) {
      x1 = Math.min(x1, i.x - i.pad); y1 = Math.min(y1, i.y - i.pad);
      x2 = Math.max(x2, i.x + i.w + i.pad); y2 = Math.max(y2, i.y + i.d + i.pad);
    }
    return { x: x1 - add, y: y1 - add, w: x2 - x1 + add * 2, h: y2 - y1 + add * 2, width: x2 - x1 + add * 2 };
  }

  /* ---------- pictograms (vector, top-view) ---------- */
  function swingIcon(c, x, y, w, h) { // A-frames + beam + seats
    c.strokeStyle = INK; c.lineWidth = Math.max(2, w * .05);
    c.beginPath(); c.moveTo(x + w * .12, y + h * .1); c.lineTo(x, y + h); c.lineTo(x + w * .24, y + h); c.closePath();
    c.moveTo(x + w * .88, y + h * .1); c.lineTo(x + w, y + h); c.lineTo(x + w * .76, y + h); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(x, y + h * .12); c.lineTo(x + w, y + h * .12); c.stroke();
    for (const sx of [0.32, 0.55, 0.78].slice(0, Math.max(2, Math.round(w / (h * 1.1))))) {
      c.beginPath(); c.moveTo(x + w * sx, y + h * .12); c.lineTo(x + w * sx, y + h * .7); c.stroke();
      c.fillStyle = ACC; c.fillRect(x + w * sx - w * .05, y + h * .7, w * .1, h * .1 * 0 + Math.min(h * .16, 14));
    }
  }
  function slideIcon(c, x, y, w, h) {
    c.strokeStyle = INK; c.lineWidth = Math.max(2, w * .04);
    c.fillStyle = "#c8dbee";
    c.beginPath(); c.moveTo(x, y + h); c.lineTo(x + w * .72, y + h * .18); c.lineTo(x + w, y + h * .18); c.lineTo(x + w * .28, y + h); c.closePath(); c.fill(); c.stroke();
    c.strokeRect(x + w * .72, y, w * .26, h * .18);
  }
  function carouselIcon(c, x, y, w, h) {
    const r = Math.min(w, h) * .42, cx = x + w / 2, cy = y + h / 2;
    c.strokeStyle = INK; c.lineWidth = Math.max(2, r * .08);
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke(); }
    c.fillStyle = ACC; c.beginPath(); c.arc(cx, cy, r * .16, 0, Math.PI * 2); c.fill();
  }
  function springerIcon(c, x, y, w, h) {
    c.strokeStyle = INK; c.lineWidth = Math.max(2, w * .05);
    c.beginPath();
    for (let i = 0; i <= 8; i++) { const t = i / 8; c.lineTo(x + w / 2 + Math.sin(t * 9) * w * .12, y + h * (1 - t)); }
    c.stroke();
    c.fillStyle = ACC; c.beginPath(); c.arc(x + w / 2, y + h * .18, Math.min(w, h) * .2, 0, Math.PI * 2); c.fill();
    c.strokeRect(x + w * .3, y + h * .88, w * .4, h * .1);
  }
  function sandboxIcon(c, x, y, w, h) {
    c.fillStyle = "#e7d3a7"; c.strokeStyle = EARTH; c.lineWidth = Math.max(2, w * .035);
    c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h);
    c.fillStyle = "rgba(120,100,60,.5)";
    for (let i = 0; i < 26; i++) { const gx = x + ((i * 37) % 100) / 100 * w, gy = y + ((i * 53) % 100) / 100 * h; c.fillRect(gx, gy, 3, 3); }
  }
  function climberIcon(c, x, y, w, h) {
    c.strokeStyle = INK; c.lineWidth = Math.max(1.6, w * .035); c.fillStyle = "#9db8cf";
    c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); c.fill(); c.stroke();
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x + w * i / 5, y + h * (1 - i / 5)); c.lineTo(x + w - w * i / 5, y + h * (1 - i / 5)); c.stroke(); }
  }
  function ropeIcon(c, x, y, w, h) {
    c.strokeStyle = EARTH; c.lineWidth = Math.max(1.5, w * .03);
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x + w / 2, y + h / 2, Math.min(w, h) * (0.16 + i * 0.13), 0, Math.PI * 2); c.stroke(); }
  }
  function balanceIcon(c, x, y, w, h) {
    c.strokeStyle = INK; c.lineWidth = Math.max(2, w * .05);
    c.beginPath(); c.moveTo(x, y + h * .3); c.lineTo(x + w * .5, y); c.lineTo(x + w * .5, y + h * .6); c.lineTo(x + w, y + h * .3); c.stroke();
  }
  function playhouseIcon(c, x, y, w, h) {
    c.fillStyle = "#d8c6a8"; c.strokeStyle = INK; c.lineWidth = Math.max(2, w * .04);
    c.fillRect(x + w * .12, y + h * .4, w * .76, h * .6); c.strokeRect(x + w * .12, y + h * .4, w * .76, h * .6);
    c.beginPath(); c.moveTo(x, y + h * .42); c.lineTo(x + w / 2, y); c.lineTo(x + w, y + h * .42); c.closePath(); c.fillStyle = ACC; c.fill(); c.stroke();
  }
  function benchIcon(c, x, y, w, h) {
    c.fillStyle = "#c2a47c"; c.strokeStyle = INK; c.lineWidth = Math.max(1.8, h * .07);
    c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h);
    for (let i = 1; i <= 3; i++) { c.beginPath(); c.moveTo(x + (w * i) / 4, y); c.lineTo(x + (w * i) / 4, y + h); c.stroke(); }
  }
  function tableIcon(c, x, y, w, h) {
    c.fillStyle = "#c2a47c"; c.strokeStyle = INK; c.lineWidth = Math.max(1.8, w * .04);
    c.fillRect(x + w * .15, y + h * .15, w * .7, h * .7); c.strokeRect(x + w * .15, y + h * .15, w * .7, h * .7);
    c.beginPath(); c.arc(x + w * .07, y + h * .5, h * .12, 0, Math.PI * 2); c.arc(x + w * .93, y + h * .5, h * .12, 0, Math.PI * 2); c.stroke();
  }
  function binIcon(c, x, y, w, h) {
    c.fillStyle = "#6b6f5f"; c.strokeStyle = INK; c.lineWidth = Math.max(1.8, w * .05);
    c.beginPath(); c.arc(x + w / 2, y + h / 2, Math.min(w, h) * .32, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  function planterIcon(c, x, y, w, h) {
    c.fillStyle = "#b39670"; c.strokeStyle = INK; c.lineWidth = Math.max(1.8, w * .045);
    c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h);
    c.fillStyle = "#5a7d46"; c.beginPath(); c.arc(x + w / 2, y + h / 2, Math.min(w, h) * .3, 0, Math.PI * 2); c.fill();
  }
  function bikeIcon(c, x, y, w, h) {
    c.strokeStyle = INK; c.lineWidth = Math.max(1.6, h * .08);
    for (let i = 0; i < 4; i++) { const bx = x + (w * (i + .5)) / 4; c.beginPath(); c.arc(bx, y + h / 2, h * .32, Math.PI, 0); c.stroke(); c.moveTo(bx - h * .32, y + h / 2); c.lineTo(bx - h * .32, y + h); c.moveTo(bx + h * .32, y + h / 2); c.lineTo(bx + h * .32, y + h); c.stroke(); }
  }
  function busIcon(c, x, y, w, h) {
    c.fillStyle = "#ccd5de"; c.strokeStyle = INK; c.lineWidth = Math.max(1.8, w * .035);
    c.fillRect(x, y + h * .2, w, h * .6); c.strokeRect(x, y + h * .2, w, h * .6);
    c.beginPath(); c.moveTo(x, y + h * .2); c.lineTo(x + w * .12, y); c.lineTo(x + w * .88, y); c.lineTo(x + w, y + h * .2); c.closePath(); c.fillStyle = "#e8eef4"; c.fill(); c.stroke();
  }
  function shelterIcon(c, x, y, w, h) {
    c.strokeStyle = INK; c.lineWidth = Math.max(2, w * .04); c.fillStyle = "#dfeadd";
    c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w, y + h * .3); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.lineTo(x, y + h * .3); c.closePath(); c.fill(); c.stroke();
  }
  function fitnessIcon(c, x, y, w, h) {
    c.strokeStyle = INK; c.lineWidth = Math.max(2, w * .05);
    c.beginPath(); c.moveTo(x + w * .08, y); c.lineTo(x + w * .08, y + h); c.moveTo(x + w * .92, y); c.lineTo(x + w * .92, y + h); c.moveTo(x + w * .08, y + h * .12); c.lineTo(x + w * .92, y + h * .12); c.stroke();
    c.fillStyle = ACC; c.fillRect(x + w * .3, y + h * .45, w * .4, h * .14);
  }
  function arenaIcon(c, x, y, w, h) {
    c.fillStyle = "#bcd4c2"; c.strokeStyle = INK; c.lineWidth = Math.max(1.6, h * .02);
    c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h);
    c.fillStyle = "rgba(255,255,255,.55)";
    c.beginPath(); c.arc(x + w / 2, y + h / 2, Math.min(w, h) * .16, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeRect(x, y + h * .3, w * .14, h * .4); c.strokeRect(x + w - w * .14, y + h * .3, w * .14, h * .4);
  }
  function wallsIcon(c, x, y, w, h) {
    c.fillStyle = "#d7ddd0"; c.strokeStyle = INK; c.lineWidth = Math.max(2, w * .04);
    c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); c.fill(); c.stroke();
    for (let i = 0; i < 12; i++) { c.fillStyle = "#fff"; const gx = x + ((i * 41) % 100) / 100 * w, gy = y + ((i * 29) % 100) / 100 * h; c.fillRect(gx, gy, 3, 3); }
  }
  function trampolineIcon(c, x, y, w, h) {
    const r = Math.min(w, h) * .42; const cx = x + w / 2, cy = y + h / 2;
    c.fillStyle = "#dfe6ed"; c.strokeStyle = INK; c.lineWidth = Math.max(2, r * .06);
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.setLineDash([4, 3]); c.beginPath(); c.arc(cx, cy, r * .55, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  }
  function tilesIcon(c, x, y, w, h) { /* checker underlay — subtle */ }
  function waterIcon(c, x, y, w, h) {
    c.fillStyle = "#c8deea"; c.strokeStyle = "#4c89ad"; c.lineWidth = Math.max(1.6, w * .03);
    c.beginPath(); c.ellipse(x + w / 2, y + h / 2, w * .42, h * .32, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = "#4c89ad"; for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; c.beginPath(); c.arc(x + w / 2 + Math.cos(a) * w * .22, y + h / 2 + Math.sin(a) * h * .18, Math.min(w, h) * .07, 0, Math.PI * 2); c.fill(); }
  }
  function multiIcon(c, x, y, w, h) { // multiplay: two towers + bridge beam
    c.strokeStyle = INK; c.lineWidth = Math.max(2, w * .04);
    c.fillStyle = "#d9c59b";
    c.fillRect(x, y, w * .32, h * .7); c.strokeRect(x, y, w * .32, h * .7);
    c.fillRect(x + w * .68, y, w * .32, h * .7); c.strokeRect(x + w * .68, y, w * .32, h * .7);
    c.fillStyle = "#c8dbee"; c.fillRect(x + w * .3, y + h * .34, w * .4, h * .18); c.strokeRect(x + w * .3, y + h * .34, w * .4, h * .18);
    c.fillStyle = ACC; c.beginPath(); c.moveTo(x + w * .32, y + h * .7); c.lineTo(x + w * .32, y + h); c.lineTo(x + w * .52, y + h); c.lineTo(x + w * .45, y + h * .7); c.closePath(); c.fill();
  }
  function dogIcon(c, x, y, w, h) {
    c.strokeStyle = INK; c.lineWidth = Math.max(1.8, w * .04);
    for (const [dx, dy, dw, dh] of [[0, 0.1, 1, 0.25], [0, 0.5, 1, 0.25], [0, 0.85, 0.6, 0.15]]) {
      c.strokeRect(x, y + dy * h, w * dw, dh * h + 2);
    }
  }
  function genericIcon(c, x, y, w, h) {
    c.fillStyle = "#cfc8b5"; c.strokeStyle = INK; c.lineWidth = Math.max(1.6, w * .035);
    roundrect(c, x, y, w, h, Math.min(w, h) * .2); c.fill(); c.stroke();
    c.fillStyle = INK; c.font = `700 ${Math.min(w, h) * .3}px system-ui`; c.textAlign = "center"; c.fillText("?", x + w / 2, y + h / 2 + Math.min(w, h) * .1); c.textAlign = "left";
  }
  const ICONS = {
    swings: swingIcon, slides: slideIcon, carousels: carouselIcon, springers: springerIcon, sandboxes: sandboxIcon,
    climbers: climberIcon, rope: ropeIcon, balance: balanceIcon, playhouses: playhouseIcon, thematic: playhouseIcon,
    benches: benchIcon, tables_p: tableIcon, picnic: tableIcon, bins: binIcon, planters: planterIcon, bike: bikeIcon,
    busstop: busIcon, shelters: shelterIcon, smart: shelterIcon, wells: waterIcon, fences: binIcon, dog: dogIcon,
    fitness: fitnessIcon, street: fitnessIcon, arenas: arenaIcon, goals: arenaIcon, walls: wallsIcon, parkour: treadmillBox,
    tramp: trampolineIcon, trampoline: trampolineIcon, tables: tableIcon, skate: genericIcon, water: waterIcon,
    multiplay: multiIcon, figures: genericIcon, toddler: sandboxIcon, interactive: genericIcon,
    tiles: tilesIcon, cork: tilesIcon, poured: tilesIcon, acrylic: tilesIcon, epoxy: tilesIcon, pu: tilesIcon,
    stone: tilesIcon, gym: tilesIcon, bollards: binIcon, info: genericIcon, stairs: genericIcon, other: genericIcon,
  };
  function treadmillBox(c, x, y, w, h) {
    c.strokeStyle = INK; c.lineWidth = Math.max(2, w * .04);
    c.beginPath(); c.moveTo(x, y + h * .4); c.quadraticCurveTo(x + w / 2, y, x + w, y + h * .4); c.moveTo(x, y + h * .4); c.lineTo(x, y + h); c.moveTo(x + w, y + h * .4); c.lineTo(x + w, y + h); c.stroke();
  }
  function roundrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.beginPath() || c.roundRect(x, y, w, h, r) : null; if (!c.roundRect) { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); } }

  /* ---------- main render ---------- */
  function render(canvas, wrap, items, meta) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const Wpx = wrap.clientWidth * dpr, Hpx = wrap.clientHeight * dpr;
    canvas.width = Wpx; canvas.height = Hpx;
    const c = canvas.getContext("2d");
    c.clearRect(0, 0, Wpx, Hpx);

    const L = layout(items, meta.areaM2, meta.space);
    const W = L.plotW, H = L.plotH;
    const sc = Math.min(Wpx / (W + 3), Hpx / (H + 3)) * 0.97;
    const ox = (Wpx - W * sc) / 2, oy = (Hpx - H * sc) / 2;
    const M = (m) => m * sc;

    // ------- site surface
    c.fillStyle = SURF[meta.space] || SURF.mix;
    roundrect(c, ox - M(1.5), oy - M(1.5), M(W + 3), M(H + 3), M(1));
    c.fill();
    c.strokeStyle = "#8a8272"; c.lineWidth = M(.16);
    roundrect(c, ox - M(1.5), oy - M(1.5), M(W + 3), M(H + 3), M(1)); c.stroke();
    // grass speckle
    c.fillStyle = "rgba(120,140,90,.12)";
    for (let i = 0; i < 700; i++) {
      const gx = ox + (((i * 37) % 100) / 100) * M(W) + M(((i * 13) % 10) / 10 - .3);
      const gy = oy + (((i * 53) % 100) / 100) * M(H) + M(((i * 7) % 10) / 10 - .3);
      if (gy < oy + M(H) && gx < ox + M(W)) { c.beginPath(); c.arc(gx, gy, M(.055), 0, Math.PI * 2); c.fill(); }
    }
    // ------- perimeter path (soft band)
    const ln = M(L.pathHalf + .65);
    c.strokeStyle = PATH; c.lineWidth = M(2.1); c.lineCap = "round";
    const pa = ox + ln, pb = oy + ln, pc = ox + M(W) - ln, pd = oy + M(H) - ln;
    c.beginPath();
    c.moveTo(pa + M(1), pb); c.lineTo(pc - M(1), pb); c.quadraticCurveTo(pc, pb, pc, pb + M(1));
    c.lineTo(pc, pd - M(1)); c.quadraticCurveTo(pc, pd, pc - M(1), pd);
    c.lineTo(pa + M(1), pd); c.quadraticCurveTo(pa, pd, pa, pd - M(1));
    c.lineTo(pa, pb + M(1)); c.quadraticCurveTo(pa, pb, pa + M(1), pb);
    c.stroke();
    c.strokeStyle = "rgba(130,118,96,.4)"; c.lineWidth = Math.max(1, M(.06)); c.stroke();

    // ------- trees (corners)
    for (const t of L.deco.trees) {
      const tx = ox + M(t.x), ty = oy + M(t.y);
      c.fillStyle = "#7c8f56";
      c.beginPath(); c.ellipse(tx, ty, M(.95), M(.8), 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#5f7345"; c.beginPath(); c.ellipse(tx + M(.1), ty - M(.1), M(.55), M(.45), 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#5d4a33"; c.fillRect(tx - M(.07), ty + M(.55), M(.14), M(.4));
    }

    // ------- safety surface underlay (flooring group)
    if (L.surfacePoly) {
      c.save();
      roundrect(c, ox + M(L.surfacePoly.x), oy + M(L.surfacePoly.y), M(L.surfacePoly.w), M(L.surfacePoly.h), M(.5));
      c.fillStyle = "rgba(230,120,60,.16)"; c.fill();
      c.setLineDash([M(.3), M(.18)]); c.strokeStyle = "rgba(190,90,40,.65)"; c.lineWidth = Math.max(1.5, M(.07));
      c.stroke(); c.setLineDash([]);
      c.restore();
    }

    // ------- devices
    for (const it of L.items) {
      const x = ox + M(it.x), y = oy + M(it.y), w = M(it.w), h = M(it.d);
      if (it.underlay) continue; // underlay drawn already
      // dashed safety clearance
      if (it.pad > 0.05) {
        c.save();
        c.setLineDash([M(.22), M(.14)]); c.strokeStyle = SF_ZONE; c.lineWidth = Math.max(1.2, M(.045));
        c.strokeRect(x - M(it.pad), y - M(it.pad), w + M(it.pad * 2), h + M(it.pad * 2));
        c.restore();
      }
      const icon = ICONS[it.purp] || genericIcon;
      c.save();
      c.translate(x + w / 2, y + h / 2);
      const facing = it.rot || 0;
      const doRot = ["benches", "tables_p", "picnic", "bike", "busstop", "shelters", "slides"].includes(it.purp);
      if (doRot && facing) c.rotate(facing + Math.PI / 2);
      c.translate(-w / 2, -h / 2);
      icon(c, 0, 0, w, h);
      c.restore();
      // label under the item
      if (Math.max(w, h) > M(2.6)) {
        c.fillStyle = "#4a463a";
        c.font = `600 ${Math.max(M(.42), 9.5 * dpr)}px "Sofia Sans", system-ui, sans-serif`;
        c.textAlign = "center";
        c.fillText((it.p.code || it.p.n).slice(0, 22), x + w / 2, y + h + M(it.pad) + M(.5));
        c.textAlign = "left";
      }
    }

    // ------- frame furniture: title / scale bar / north / legend
    c.fillStyle = "#3d3a30";
    c.font = `800 ${Math.max(13 * dpr, M(.62))}px "Sofia Sans", sans-serif`;
    c.fillText(meta.title || ("Концепция"), ox - M(1.2), oy - M(2.1));
    c.font = `600 ${Math.max(10 * dpr, M(.42))}px "Sofia Sans", system-ui, sans-serif`;
    c.fillStyle = "#6a6353";
    c.fillText(`${W.toFixed(1)} m × ${H.toFixed(1)} m · ${meta.kicker || ""}`, ox - M(1.2), oy - M(1.45));
    // north arrow
    c.fillStyle = "#4a463a"; c.font = `700 ${Math.max(11 * dpr, M(.5))}px "Sofia Sans", system-ui, sans-serif`;
    const nx = ox + M(W) + M(1), ny_ = oy - M(.4);
    c.beginPath(); c.moveTo(nx, ny_ - M(.5)); c.lineTo(nx - M(.2), ny_ + M(.2)); c.lineTo(nx, ny_); c.lineTo(nx + M(.2), ny_ + M(.2)); c.closePath(); c.fill();
    c.fillText("N", nx - M(.18), ny_ + M(.65));
    // scale bar: 5 m reference
    const by = oy + M(H) + M(1.7);
    c.strokeStyle = "#4a463a"; c.lineWidth = Math.max(2, M(.09));
    c.beginPath(); c.moveTo(ox - M(1.4), by); c.lineTo(ox - M(1.4) + M(5), by); c.stroke();
    c.font = `600 ${Math.max(10 * dpr, M(.4))}px "Sofia Sans", system-ui, sans-serif`; c.fillStyle = "#4a463a";
    c.fillText("5 m", ox - M(1.4) + M(5) / 2 - M(.4), by + M(.6));
    // legend of categories present
    let lx = ox - M(1.4), ly = by + M(1.25);
    const catsShown = [...new Set(L.items.filter(i => !i.underlay).map(i => i.p.cat))];
    for (const catn of catsShown) {
      const y0 = ly;
      switch (catn) { case "play": c.fillStyle = "#d14d0f"; break; case "park": c.fillStyle = "#8a6a45"; break; case "sport": c.fillStyle = "#2f6da8"; break; default: c.fillStyle = "#6a7258"; }
      c.fillRect(lx, y0 - M(.42), M(.45), M(.45));
      c.fillStyle = "#55503f"; c.fillText(T("cat_" + catn), lx + M(.62), y0 + M(-.03));
      lx += M((T("cat_" + catn).length + 3.4) * .62);
    }
    return L;
  }

  return { render, layout, parseDims, parseZone, safetyPad };
})();
