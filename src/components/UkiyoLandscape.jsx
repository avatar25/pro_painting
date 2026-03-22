import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/* ─── Defaults & Ukiyo-e palette ─── */
const DEFAULT_BASE_COLOR = '#4a6741';
const DEFAULT_SCROLL_SPEED = 26;
const DEFAULT_PANORAMA_SCALE = 2.35;

/* Authentic Ukiyo-e colour constants (Edo-period pigments) */
const SUMI_INK = { r: 28, g: 24, b: 20 };        // deep sumi-ink black
const INDIGO_TOP = { r: 25, g: 38, b: 72 };       // ai-iro (indigo blue) – top sky
const INDIGO_MID = { r: 60, g: 80, b: 120 };      // lighter indigo
const OCHRE_HORIZON = { r: 218, g: 185, b: 140 }; // yellow-ochre horizon
const PEACH_GLOW = { r: 235, g: 195, b: 155 };    // warm horizon glow
const VERMILLION = { r: 190, g: 40, b: 30 };      // beni-gara / vermillion sun
const CLOUD_WHITE = { r: 230, g: 222, b: 205 };   // gofun (shell white)
const WATER_BLUE = { r: 45, g: 65, b: 95 };       // deep water indigo
const WATER_LIGHT = { r: 100, g: 135, b: 160 };   // lighter water

/* ─── Utility functions ─── */
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function pingPong(v, len) {
  if (len <= 0) return 0;
  const c = len * 2, w = ((v % c) + c) % c;
  return w <= len ? w : c - w;
}
function resolveNum(v, fb) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
function mixRgb(a, b, t) {
  t = clamp(t, 0, 1);
  return { r: Math.round(lerp(a.r, b.r, t)), g: Math.round(lerp(a.g, b.g, t)), b: Math.round(lerp(a.b, b.b, t)) };
}
function css({ r, g, b }, a = 1) { return `rgba(${r},${g},${b},${a})`; }

function parseColor(c) {
  if (typeof c !== 'string') return parseColor(DEFAULT_BASE_COLOR);
  const h = c.trim();
  let m = /^#([\da-f]{3})$/i.exec(h);
  if (m) { const [r, g, b] = m[1].split(''); return { r: parseInt(r + r, 16), g: parseInt(g + g, 16), b: parseInt(b + b, 16) }; }
  m = /^#([\da-f]{6})$/i.exec(h);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  return parseColor(DEFAULT_BASE_COLOR);
}

/* ─── PRNG & noise ─── */
function createSeed() { return Math.floor(Math.random() * 2147483647); }
function seededRng(s) {
  let st = s % 2147483647; if (st <= 0) st += 2147483646;
  return () => { st = (st * 16807) % 2147483647; return (st - 1) / 2147483646; };
}
function hash1D(i, s) { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453123; return (v - Math.floor(v)) * 2 - 1; }
function perlin1D(x, s) {
  const l = Math.floor(x), lx = x - l;
  return lerp(hash1D(l, s) * lx, hash1D(l + 1, s) * (lx - 1), fade(lx));
}
function fbm1D(x, s, oct = 5, per = 0.55, lac = 2) {
  let t = 0, a = 1, f = 1, mx = 0;
  for (let o = 0; o < oct; o++) { t += perlin1D(x * f, s + o * 97) * a; mx += a; a *= per; f *= lac; }
  return mx === 0 ? 0 : t / mx;
}
function ridgedFbm(x, s, oct = 6, per = 0.56, lac = 2.2, sharp = 2.35) {
  let t = 0, a = 1, f = 1, mx = 0, w = 1;
  for (let o = 0; o < oct; o++) {
    const sig = 1 - Math.abs(perlin1D(x * f, s + o * 131));
    const r = Math.pow(clamp(sig, 0, 1), sharp) * w;
    t += r * a; mx += a; w = clamp(r * 2.8, 0, 1); a *= per; f *= lac;
  }
  return mx === 0 ? 0 : t / mx;
}

/* ─── Mountain ridge generation ─── */
function sharpPeak(x, c, lw, rw, s = 2.5) {
  const w = x < c ? lw : rw;
  return Math.pow(clamp(1 - Math.abs(x - c) / Math.max(w, 0.0001), 0, 1), s);
}

function buildRidge(w, h, li, total, seed) {
  const rng = seededRng(seed + li * 173);
  const depth = total <= 1 ? 1 : li / (total - 1);
  const baseY = h * (0.28 + depth * 0.22);
  const amp = h * (0.08 + depth * 0.10);
  const massif = 1.4 + depth * 1.1;
  const crag = 4.8 + depth * 2.8;
  const chisel = 11 + depth * 5.4;
  const pA = 0.16 + rng() * 0.18, pB = 0.42 + rng() * 0.18, pC = 0.68 + rng() * 0.14;
  const valley = 0.28 + rng() * 0.28;
  const lift = rng() * 0.08;
  const pts = [], step = Math.max(3, Math.floor(w / 280));

  for (let x = 0; x <= w + step; x += step) {
    const nx = x / w;
    const warpX = nx + fbm1D(nx * (1.15 + depth * 0.35) + lift, seed + li * 17, 4, 0.58, 2.12) * (0.07 - depth * 0.018);
    const broad = ridgedFbm(warpX * massif + 1.7, seed + li * 31, 6, 0.58, 2.08, 2.15);
    const crags = ridgedFbm(warpX * crag + 9.4, seed + li * 67, 5, 0.52, 2.55, 2.6);
    const chisels = ridgedFbm(warpX * chisel + 15.9, seed + li * 109, 4, 0.45, 3.05, 3);
    const under = Math.max(0, fbm1D(warpX * (1 + depth * 0.35) + 4.2, seed + li * 47, 4, 0.54, 2.02));
    const pA_c = sharpPeak(nx, pA, 0.11 + depth * 0.035, 0.05 + depth * 0.018, 2.7);
    const pB_c = sharpPeak(nx, pB, 0.095 + depth * 0.03, 0.06 + depth * 0.02, 2.6);
    const pC_c = sharpPeak(nx, pC, 0.085 + depth * 0.028, 0.05 + depth * 0.018, 2.8);
    const valC = Math.pow(clamp(1 - Math.abs(nx - valley) / 0.09, 0, 1), 1.8);
    const rv = broad * 0.9 + crags * 0.42 + chisels * 0.18 + under * 0.22 +
               pA_c * (0.62 + depth * 0.1) + pB_c * (0.42 + depth * 0.12) + pC_c * (0.3 + depth * 0.12) - valC * 0.14;
    pts.push({ x, y: baseY - Math.pow(Math.max(rv, 0), 1.22) * amp });
  }
  return { depth, baseY, points: pts };
}

function sampleY(ridge, x) {
  const pts = ridge.points;
  if (!pts.length) return ridge.baseY;
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  const step = pts.length > 1 ? pts[1].x - pts[0].x : 1;
  const bi = clamp(Math.floor(x / Math.max(step, 1)), 0, pts.length - 2);
  const s = pts[bi], e = pts[bi + 1];
  return lerp(s.y, e.y, (x - s.x) / Math.max(e.x - s.x, 0.0001));
}

/* ─── Ukiyo-e mountain layer colours ─── */
function ukiyoLayerColor(idx, total, base) {
  // Far layers: blue-grey (atmospheric perspective in Ukiyo-e)
  // Mid layers: muted green-grey
  // Near layers: deeper green-brown mixed with base
  const palette = [
    { r: 120, g: 135, b: 165 },   // far – blue-grey
    { r: 105, g: 125, b: 140 },   // mid-far – steel-blue
    { r: 85, g: 110, b: 100 },    // mid – blue-green
    { r: 65, g: 90, b: 60 },      // mid-near – muted green
    mixRgb(base, SUMI_INK, 0.3),  // near – dark, ink-heavy
  ];
  const c = palette[idx] || palette[palette.length - 1];
  const d = total <= 1 ? 1 : idx / (total - 1);
  // Ukiyo-e: far mountains get lighter/more atmospheric, close ones are darker
  const atm = mixRgb(c, OCHRE_HORIZON, 0.35 - d * 0.28);
  return mixRgb(atm, base, d * 0.15);
}

/* ─── Drawing: Bokashi sky ─── */
function drawBokashiSky(ctx, w, h, seed) {
  // Classic Ukiyo-e sky: deep indigo at top, graduating to warm ochre at horizon
  // with subtle horizontal streaks (bokashi technique)
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.65);
  grad.addColorStop(0, css(INDIGO_TOP));
  grad.addColorStop(0.25, css(INDIGO_MID));
  grad.addColorStop(0.55, css({ r: 115, g: 140, b: 165 }));
  grad.addColorStop(0.78, css(PEACH_GLOW));
  grad.addColorStop(1, css(OCHRE_HORIZON));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Bokashi horizontal banding – the hallmark of woodblock printing
  const rng = seededRng(seed + 7777);
  ctx.save();
  for (let i = 0; i < 20; i++) {
    const y = rng() * h * 0.55;
    const bh = 2 + rng() * 8;
    const alpha = 0.02 + rng() * 0.05;
    const tone = rng() > 0.5 ? `rgba(255,240,220,${alpha})` : `rgba(20,30,60,${alpha})`;
    ctx.fillStyle = tone;
    ctx.fillRect(0, y, w, bh);
  }
  ctx.restore();
}

/* ─── Drawing: Vermillion sun disc ─── */
function drawSun(ctx, w, h, seed) {
  const rng = seededRng(seed);
  const sunX = w * (0.62 + rng() * 0.22);
  const sunY = h * (0.14 + rng() * 0.10);
  const sunR = Math.min(w, h) * (0.068 + rng() * 0.018);

  // Soft vermillion glow behind
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3.2);
  glow.addColorStop(0, css(VERMILLION, 0.25));
  glow.addColorStop(0.4, css({ r: 210, g: 120, b: 60 }, 0.10));
  glow.addColorStop(1, 'rgba(210,120,60,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Solid vermillion disc – flat, bold, Ukiyo-e
  ctx.save();
  ctx.fillStyle = css(VERMILLION);
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();

  // Slight gradient on disc (bokashi on the sun)
  const sunGrad = ctx.createRadialGradient(sunX - sunR * 0.2, sunY - sunR * 0.2, 0, sunX, sunY, sunR);
  sunGrad.addColorStop(0, css({ r: 220, g: 60, b: 40 }, 0.4));
  sunGrad.addColorStop(1, css({ r: 150, g: 25, b: 20 }, 0.3));
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return { sunX, sunY, sunR };
}

/* ─── Drawing: Yokogumo (horizontal cloud bands) ─── */
function drawYokogumo(ctx, w, h, seed) {
  const rng = seededRng(seed + 3333);
  const bandCount = 3 + Math.floor(rng() * 3);
  ctx.save();

  for (let i = 0; i < bandCount; i++) {
    const y = h * (0.08 + rng() * 0.30);
    const bh = 4 + rng() * 14;
    const alpha = 0.12 + rng() * 0.18;

    // Cloud band – characteristic long horizontal wisps
    ctx.beginPath();
    ctx.moveTo(-10, y);

    // Wavy top edge
    for (let x = 0; x <= w + 20; x += 30) {
      const wobble = fbm1D(x * 0.003 + i * 5.3, seed + i * 67, 3, 0.6, 2.0) * bh * 0.6;
      ctx.lineTo(x, y + wobble);
    }
    // Wavy bottom edge back
    for (let x = w + 20; x >= -10; x -= 30) {
      const wobble = fbm1D(x * 0.003 + i * 5.3 + 17, seed + i * 89, 3, 0.6, 2.0) * bh * 0.5;
      ctx.lineTo(x, y + bh + wobble);
    }
    ctx.closePath();

    // Gofun (shell-white) fill with transparency
    const cg = ctx.createLinearGradient(0, y, 0, y + bh);
    cg.addColorStop(0, css(CLOUD_WHITE, alpha * 0.5));
    cg.addColorStop(0.5, css(CLOUD_WHITE, alpha));
    cg.addColorStop(1, css(CLOUD_WHITE, alpha * 0.3));
    ctx.fillStyle = cg;
    ctx.fill();
  }
  ctx.restore();
}

/* ─── Drawing: mountain layer (Ukiyo-e flat fill + sumi outline) ─── */
function drawMountainLayer(ctx, w, h, ridge, color, seed, li) {
  ctx.save();

  // --- Fill: flat colour with subtle bokashi gradient (lighter at ridge top) ---
  ctx.beginPath();
  ctx.moveTo(0, h);
  ridge.points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(w, h);
  ctx.closePath();

  // Vertical bokashi within the mountain body
  const minY = Math.min(...ridge.points.map(p => p.y));
  const fillBottom = h;
  const grad = ctx.createLinearGradient(0, minY, 0, fillBottom);
  const lighter = mixRgb(color, CLOUD_WHITE, 0.22);
  grad.addColorStop(0, css(lighter));
  grad.addColorStop(0.35, css(color));
  grad.addColorStop(1, css(mixRgb(color, SUMI_INK, 0.18)));
  ctx.fillStyle = grad;
  ctx.fill();

  // --- Sumi-ink outline (heavier for foreground layers) ---
  ctx.beginPath();
  const outNoise = 0.004 + ridge.depth * 0.003;
  const jitter = 0.6 + ridge.depth * 1.2;

  ridge.points.forEach((p, idx) => {
    const j = fbm1D(p.x * outNoise + li * 1.73, seed + li * 211, 3, 0.58, 2.22) * jitter;
    if (idx === 0) ctx.moveTo(p.x, p.y + j);
    else ctx.lineTo(p.x, p.y + j);
  });

  const lw = ridge.depth > 0.5 ? 2.8 : 1.8;
  ctx.strokeStyle = css(SUMI_INK, 0.85);
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // --- Ukiyo-e texture lines (hatch marks like woodblock strokes) ---
  if (ridge.depth > 0.3) {
    const rng = seededRng(seed + li * 251);
    const lineColor = mixRgb(color, SUMI_INK, 0.55);
    const hatchCount = 22 + Math.floor(ridge.depth * 30);

    // Contour-following strokes (characteristic of Ukiyo-e mountain texture)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, h);
    ridge.points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = css(lineColor, 0.08 + ridge.depth * 0.06);
    ctx.lineWidth = 0.8;

    for (let i = 0; i < hatchCount; i++) {
      const sx = rng() * w;
      const pi = clamp(Math.floor((sx / w) * (ridge.points.length - 1)), 0, ridge.points.length - 1);
      const rp = ridge.points[pi];
      const sl = h * (0.015 + rng() * 0.05);
      const angle = -0.15 + rng() * 0.3; // nearly vertical

      ctx.beginPath();
      ctx.moveTo(sx, rp.y + 4 + rng() * 15);
      ctx.lineTo(sx + Math.sin(angle) * sl, rp.y + sl);
      ctx.stroke();
    }

    // Horizontal contour lines (wood-block texture)
    for (let i = 0; i < 6 + Math.floor(ridge.depth * 8); i++) {
      const yOff = rng() * 0.6 + 0.2;
      const startX = rng() * w * 0.3;
      const endX = startX + w * (0.3 + rng() * 0.5);
      ctx.beginPath();
      ctx.strokeStyle = css(lineColor, 0.04 + rng() * 0.04);
      ctx.lineWidth = 0.5 + rng() * 0.8;
      for (let x = startX; x <= endX; x += 8) {
        const baseAtX = sampleY(ridge, x);
        const cy = baseAtX + (h - baseAtX) * yOff + fbm1D(x * 0.01 + i * 3, seed + i * 71, 2, 0.5, 2) * 6;
        if (x === startX) ctx.moveTo(x, cy);
        else ctx.lineTo(x, cy);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  ctx.restore();
}

/* ─── Drawing: Valley mist (atmospheric fog between layers) ─── */
function drawValleyMist(ctx, w, upper, lower, fogD, seedOff) {
  const fog = clamp(fogD, 0, 1);
  const bands = 3 + Math.round(fog * 2);
  const step = 8;
  const xs = [];
  for (let x = 0; x <= w; x += step) xs.push(x);
  if (xs[xs.length - 1] !== w) xs.push(w);

  ctx.save();
  // Clip region between ridges
  ctx.beginPath();
  xs.forEach((x, i) => {
    const uY = sampleY(upper, x), lY = sampleY(lower, x);
    const top = uY + Math.max(6, (lY - uY) * 0.06);
    i === 0 ? ctx.moveTo(x, top) : ctx.lineTo(x, top);
  });
  for (let i = xs.length - 1; i >= 0; i--) {
    const x = xs[i], uY = sampleY(upper, x), lY = sampleY(lower, x);
    ctx.lineTo(x, lY - Math.max(4, (lY - uY) * 0.03));
  }
  ctx.closePath();
  ctx.clip();

  // Mist bands – using gofun (shell-white) tones
  for (let bi = 0; bi < bands; bi++) {
    const lift = bi / Math.max(bands - 1, 1);
    const dens = 1 - lift * 0.22;

    ctx.beginPath();
    xs.forEach((x, i) => {
      const uY = sampleY(upper, x), lY = sampleY(lower, x);
      const gap = Math.max(18, lY - uY);
      const cY = uY + gap * (0.78 - lift * 0.18);
      const bh = Math.max(12, gap * (0.12 + (1 - lift) * 0.08 + fog * 0.05));
      const drift = fbm1D(x * 0.004 + seedOff + bi * 2.1, seedOff * 113, 3, 0.55, 2.1) * bh * 0.18;
      const topY = cY - bh * 0.92 + drift;
      i === 0 ? ctx.moveTo(x, topY) : ctx.lineTo(x, topY);
    });
    for (let i = xs.length - 1; i >= 0; i--) {
      const x = xs[i], uY = sampleY(upper, x), lY = sampleY(lower, x);
      const gap = Math.max(18, lY - uY);
      const cY = uY + gap * (0.78 - lift * 0.18);
      const bh = Math.max(12, gap * (0.12 + (1 - lift) * 0.08 + fog * 0.05));
      const drift = fbm1D(x * 0.004 + seedOff + bi * 2.1 + 5.7, seedOff * 131, 3, 0.55, 2.1) * bh * 0.16;
      const bottom = Math.min(lY - Math.max(2, gap * 0.025), cY + bh * 0.34 + drift);
      ctx.lineTo(x, bottom);
    }
    ctx.closePath();

    const op = clamp((0.06 + fog * 0.14) * dens, 0.04, 0.20);
    const g = ctx.createLinearGradient(0, upper.baseY, 0, lower.baseY + (lower.baseY - upper.baseY) * 0.1);
    g.addColorStop(0, css(CLOUD_WHITE, 0));
    g.addColorStop(0.45, css(CLOUD_WHITE, op * 0.34));
    g.addColorStop(1, css(CLOUD_WHITE, op));
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.restore();
}

/* ─── Drawing: Pine tree silhouettes ─── */
function drawPineTree(ctx, x, baseY, size, rng) {
  ctx.save();

  // Slightly curved trunk (brush-stroke style)
  const trunkH = size * 0.40;
  const trunkLean = (rng() - 0.5) * size * 0.08;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.025, baseY);
  ctx.quadraticCurveTo(x + trunkLean, baseY - trunkH * 0.5, x + trunkLean * 0.5, baseY - trunkH);
  ctx.quadraticCurveTo(x + trunkLean * 0.5, baseY - trunkH * 0.5, x + size * 0.025, baseY);
  ctx.fillStyle = css(SUMI_INK, 0.85);
  ctx.fill();

  // Pine needle tiers (Ukiyo-e style – flat triangular/fan shapes, layered)
  const tiers = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < tiers; i++) {
    const ty = baseY - trunkH * (0.45 + i * 0.18);
    const cx = x + trunkLean * (0.3 + i * 0.15) + (rng() - 0.5) * size * 0.06;
    const halfW = size * (0.20 - i * 0.02) + rng() * size * 0.06;
    const tierH = size * (0.08 + rng() * 0.04);
    const treeGreen = {
      r: 28 + Math.floor(rng() * 18),
      g: 48 + Math.floor(rng() * 22),
      b: 22 + Math.floor(rng() * 12)
    };

    // Fan-shaped needle mass
    ctx.beginPath();
    ctx.moveTo(cx, ty - tierH);
    ctx.quadraticCurveTo(cx - halfW * 0.3, ty - tierH * 0.4, cx - halfW, ty + tierH * 0.2);
    ctx.quadraticCurveTo(cx - halfW * 0.5, ty, cx, ty - tierH * 0.1);
    ctx.quadraticCurveTo(cx + halfW * 0.5, ty, cx + halfW, ty + tierH * 0.2);
    ctx.quadraticCurveTo(cx + halfW * 0.3, ty - tierH * 0.4, cx, ty - tierH);
    ctx.closePath();
    ctx.fillStyle = css(treeGreen, 0.90);
    ctx.fill();

    // Sumi outline
    ctx.strokeStyle = css(SUMI_INK, 0.6);
    ctx.lineWidth = 1.0;
    ctx.stroke();
  }
  ctx.restore();
}

function drawPineTrees(ctx, w, h, ridges, seed) {
  if (ridges.length < 2) return;
  const rng = seededRng(seed + 5555);
  // Place trees on the last two ridges (foreground)
  for (let ri = Math.max(0, ridges.length - 2); ri < ridges.length; ri++) {
    const ridge = ridges[ri];
    const treeCount = 4 + Math.floor(rng() * 5);
    for (let t = 0; t < treeCount; t++) {
      const tx = w * (0.05 + rng() * 0.9);
      const ty = sampleY(ridge, tx);
      const treeSize = h * (0.06 + rng() * 0.08) * (ri === ridges.length - 1 ? 1.2 : 0.8);
      drawPineTree(ctx, tx, ty, treeSize, rng);
    }
  }
}

/* ─── Drawing: Stylized water foreground ─── */
function drawWater(ctx, w, h, seed) {
  const waterTop = h * 0.58;
  const rng = seededRng(seed + 8888);

  ctx.save();

  // Water body – fully opaque indigo with bokashi gradient
  const wg = ctx.createLinearGradient(0, waterTop, 0, h);
  wg.addColorStop(0, css({ r: 75, g: 100, b: 130 }));
  wg.addColorStop(0.15, css(WATER_LIGHT));
  wg.addColorStop(0.35, css(WATER_BLUE));
  wg.addColorStop(0.7, css(mixRgb(WATER_BLUE, INDIGO_MID, 0.3)));
  wg.addColorStop(1, css(mixRgb(WATER_BLUE, SUMI_INK, 0.5)));
  ctx.fillStyle = wg;
  ctx.fillRect(0, waterTop, w, h - waterTop);

  // Ukiyo-e wave pattern lines (Hokusai-inspired)
  const waveRows = 14 + Math.floor(rng() * 6);
  for (let i = 0; i < waveRows; i++) {
    const wy = waterTop + (h - waterTop) * (i / waveRows) + rng() * 6;
    const rowAlpha = 0.10 + (i / waveRows) * 0.15;
    ctx.strokeStyle = css(CLOUD_WHITE, rowAlpha);
    ctx.lineWidth = 0.8 + (i / waveRows) * 0.6;
    ctx.beginPath();
    for (let x = -10; x <= w + 10; x += 3) {
      const wave = Math.sin(x * 0.02 + i * 1.8 + rng() * 6.28) * (2 + rng() * 3)
                 + Math.sin(x * 0.055 + i * 3.5 + seed * 0.001) * (1 + rng() * 1.8)
                 + Math.sin(x * 0.11 + i * 7.1) * 0.6;
      const y = wy + wave;
      if (x === -10) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Sumi-ink wave crests (occasional bold strokes)
  for (let i = 0; i < 5 + Math.floor(rng() * 4); i++) {
    const cx = rng() * w;
    const cy = waterTop + (h - waterTop) * (0.1 + rng() * 0.7);
    const cw = 30 + rng() * 80;
    ctx.beginPath();
    ctx.moveTo(cx - cw / 2, cy);
    ctx.quadraticCurveTo(cx, cy - 3 - rng() * 4, cx + cw / 2, cy);
    ctx.strokeStyle = css(SUMI_INK, 0.12 + rng() * 0.10);
    ctx.lineWidth = 0.6 + rng() * 0.8;
    ctx.stroke();
  }

  // Water-line at top edge (sumi outline)
  ctx.beginPath();
  for (let x = 0; x <= w; x += 5) {
    const wobble = fbm1D(x * 0.004, seed + 999, 3, 0.5, 2) * 3;
    if (x === 0) ctx.moveTo(x, waterTop + wobble);
    else ctx.lineTo(x, waterTop + wobble);
  }
  ctx.strokeStyle = css(SUMI_INK, 0.30);
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.restore();
}

/* ─── Woodgrain texture overlay (simulates woodblock print grain) ─── */
function createWoodgrainTexture(w, h, seed) {
  const tc = document.createElement('canvas');
  const c = tc.getContext('2d');
  const tw = Math.max(1, Math.floor(w));
  const th = Math.max(1, Math.floor(h));
  tc.width = tw; tc.height = th;
  if (!c) return null;

  const rng = seededRng(seed + tw * 3 + th * 7);

  // Base paper tone (warm washi paper)
  const img = c.createImageData(tw, th);
  const px = img.data;
  const colMem = new Float32Array(tw);

  for (let y = 0; y < th; y++) {
    let rowMem = rng();
    for (let x = 0; x < tw; x++) {
      const grain = rng();
      const warm = rng();
      rowMem = rowMem * 0.84 + grain * 0.16;
      colMem[x] = colMem[x] * 0.9 + grain * 0.1;
      const fiber = rowMem * 0.58 + colMem[x] * 0.42;
      const tone = Math.floor(fiber * 14);
      const v = 220 + tone + Math.floor(warm * 6);
      const alpha = 4 + Math.floor(Math.abs(grain - fiber) * 22) + Math.floor(rng() * 4);
      const i = (y * tw + x) * 4;
      px[i] = v;
      px[i + 1] = v - Math.floor(5 + warm * 10);
      px[i + 2] = v - Math.floor(12 + warm * 14);
      px[i + 3] = alpha;
    }
  }
  c.putImageData(img, 0, 0);

  // Horizontal woodgrain lines (characteristic of woodblock printing)
  c.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 30; i++) {
    const y = rng() * th;
    const lineH = 0.5 + rng() * 2;
    c.fillStyle = `rgba(140,115,85,${0.015 + rng() * 0.025})`;
    // Slightly wavy horizontal grain line
    c.beginPath();
    for (let x = 0; x <= tw; x += 20) {
      const wy = y + Math.sin(x * 0.01 + i * 2) * (1 + rng() * 2);
      if (x === 0) c.moveTo(x, wy);
      else c.lineTo(x, wy);
    }
    for (let x = tw; x >= 0; x -= 20) {
      const wy = y + lineH + Math.sin(x * 0.01 + i * 2) * (1 + rng() * 2);
      c.lineTo(x, wy);
    }
    c.closePath();
    c.fill();
  }

  // Tea/age stains
  c.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 6; i++) {
    const cx = rng() * tw, cy = rng() * th;
    const r = Math.min(tw, th) * (0.12 + rng() * 0.16);
    const sg = c.createRadialGradient(cx, cy, 0, cx, cy, r);
    sg.addColorStop(0, `rgba(160,135,105,${0.030 + rng() * 0.020})`);
    sg.addColorStop(1, 'rgba(160,135,105,0)');
    c.fillStyle = sg;
    c.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // Paper fiber strokes
  c.globalCompositeOperation = 'source-over';
  c.strokeStyle = 'rgba(100,85,65,0.035)';
  const fibers = Math.max(60, Math.floor(tw * th / 28000));
  for (let i = 0; i < fibers; i++) {
    const fx = rng() * tw, fy = rng() * th;
    const len = 20 + rng() * 70;
    const ang = (rng() - 0.5) * 0.4; // mostly horizontal
    c.beginPath();
    c.lineWidth = 0.3 + rng() * 1;
    c.moveTo(fx, fy);
    c.lineTo(fx + Math.cos(ang) * len, fy + Math.sin(ang) * len);
    c.stroke();
  }

  return tc;
}

/* ─── Main painting function ─── */
function paintLandscape(ctx, w, h, { mountainLayers, baseColor, fogDensity, seed }) {
  const rng = seededRng(seed);
  const layers = clamp(Math.round(resolveNum(mountainLayers, 5)), 4, 5);
  const fog = clamp(resolveNum(fogDensity, 0.5), 0, 1);
  const base = parseColor(baseColor);

  ctx.clearRect(0, 0, w, h);

  // 1. Bokashi sky
  drawBokashiSky(ctx, w, h, seed);

  // 2. Yokogumo clouds (behind mountains)
  drawYokogumo(ctx, w, h, seed);

  // 3. Sun disc
  drawSun(ctx, w, h, seed);

  // 4. Mountain ridges
  const ridges = [];
  for (let i = 0; i < layers; i++) ridges.push(buildRidge(w, h, i, layers, seed));

  ridges.forEach((ridge, i) => {
    const color = ukiyoLayerColor(i, layers, base);
    drawMountainLayer(ctx, w, h, ridge, color, seed, i);
    if (i < ridges.length - 1) {
      drawValleyMist(ctx, w, ridge, ridges[i + 1], fog, seed + i * 41);
    }
  });

  // 5. Pine trees on foreground ridges
  drawPineTrees(ctx, w, h, ridges, seed);

  // 6. Water foreground
  drawWater(ctx, w, h, seed);

  // 7. Foreground atmospheric wash
  const fgW = ctx.createLinearGradient(0, h * 0.7, 0, h);
  fgW.addColorStop(0, 'rgba(40,35,25,0)');
  fgW.addColorStop(1, 'rgba(40,35,25,0.08)');
  ctx.fillStyle = fgW;
  ctx.fillRect(0, h * 0.7, w, h * 0.3);

  // 8. Woodgrain texture overlay
  const tex = createWoodgrainTexture(w, h, seed + 999);
  if (tex) {
    ctx.save();
    ctx.globalAlpha = 0.20;
    ctx.drawImage(tex, 0, 0, w, h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.12;
    ctx.drawImage(tex, 0, 0, w, h);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(235,225,210,0.10)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // 9. Final warm tone overlay (aged print look)
  ctx.save();
  ctx.fillStyle = 'rgba(245,235,218,0.04)';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* ─── React component ─── */
const UkiyoLandscape = forwardRef(function UkiyoLandscape(
  {
    mountainLayers = 5,
    baseColor = DEFAULT_BASE_COLOR,
    fogDensity = 0.5,
    height = 560,
    regenerateKey,
    className,
    style,
    scrollSpeed = DEFAULT_SCROLL_SPEED,
    panoramaScale = DEFAULT_PANORAMA_SCALE,
  },
  ref,
) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(0);
  const seedRef = useRef(createSeed());
  const sceneRef = useRef(null);

  function invalidate() { sceneRef.current = null; }

  function ensureScene(vw, vh) {
    if (typeof document === 'undefined') return null;
    const ps = clamp(resolveNum(panoramaScale, DEFAULT_PANORAMA_SCALE), 1, 4);
    const pw = Math.max(vw, Math.floor(vw * ps));
    const sc = document.createElement('canvas');
    const sx = sc.getContext('2d');
    if (!sx) return null;
    sc.width = pw; sc.height = vh;
    paintLandscape(sx, pw, vh, { mountainLayers, baseColor, fogDensity, seed: seedRef.current });
    const rng = seededRng(seedRef.current + vw + vh);
    sceneRef.current = { canvas: sc, panoramaWidth: pw, viewportWidth: vw, viewportHeight: vh, phase: rng() * pw, startedAt: typeof performance !== 'undefined' ? performance.now() : 0 };
    return sceneRef.current;
  }

  function drawFrame(now) {
    if (typeof window === 'undefined') return;
    const cv = canvasRef.current;
    if (!cv) return;
    const cx = cv.getContext('2d');
    if (!cx) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.floor(cv.clientWidth || cv.parentElement?.clientWidth || 900));
    const ch = Math.max(1, Math.floor(cv.clientHeight || (typeof height === 'number' ? height : 560)));
    if (cv.width !== Math.floor(cw * dpr) || cv.height !== Math.floor(ch * dpr)) {
      cv.width = Math.floor(cw * dpr); cv.height = Math.floor(ch * dpr);
      invalidate();
    }
    let scene = sceneRef.current;
    if (!scene || scene.viewportWidth !== cw || scene.viewportHeight !== ch) scene = ensureScene(cw, ch);
    if (!scene) { animFrameRef.current = window.requestAnimationFrame(drawFrame); return; }
    const spd = Math.max(0, resolveNum(scrollSpeed, DEFAULT_SCROLL_SPEED));
    const extra = Math.max(0, scene.panoramaWidth - cw);
    const elapsed = Math.max(0, now - scene.startedAt);
    const offset = extra === 0 ? 0 : pingPong(scene.phase + (elapsed * spd) / 1000, extra);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, cw, ch);
    cx.drawImage(scene.canvas, offset, 0, cw, ch, 0, 0, cw, ch);
    animFrameRef.current = window.requestAnimationFrame(drawFrame);
  }

  function startAnim() {
    if (typeof window === 'undefined') return;
    window.cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = window.requestAnimationFrame(drawFrame);
  }

  function regenerate() { seedRef.current = createSeed(); invalidate(); startAnim(); }

  useImperativeHandle(ref, () => ({ regenerate, getSeed: () => seedRef.current }), [mountainLayers, baseColor, fogDensity, height, scrollSpeed, panoramaScale]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    invalidate();
    const onResize = () => { invalidate(); startAnim(); };
    startAnim();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); window.cancelAnimationFrame(animFrameRef.current); animFrameRef.current = 0; };
  }, [mountainLayers, baseColor, fogDensity, height, scrollSpeed, panoramaScale]);

  useEffect(() => { if (regenerateKey !== undefined) regenerate(); }, [regenerateKey]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label="Procedurally generated Japanese Ukiyo-e landscape"
      style={{
        display: 'block',
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
    />
  );
});

export default UkiyoLandscape;
