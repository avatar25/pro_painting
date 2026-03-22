import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/* ─── Import the 3 paintings ─── */
import painting1 from '../assets/1st.png';
import painting2 from '../assets/2nd.png';
import painting3 from '../assets/3rd.png';

const PAINTINGS = [painting1, painting2, painting3];
const PAINTING_LABELS = ['Mountain Village in Snow', 'River Valley Vista', 'Bridge at Twilight'];

const DEFAULT_SCROLL_SPEED = 22;
const DEFAULT_PANORAMA_SCALE = 2.2;
const CROSSFADE_MS = 1600;
const AUTO_ADVANCE_MS = 14000;

/* ─── Utility ─── */
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function pingPong(v, len) {
  if (len <= 0) return 0;
  const c = len * 2, w = ((v % c) + c) % c;
  return w <= len ? w : c - w;
}

/* ─── Seeded PRNG (for consistent particle placement) ─── */
function seededRng(s) {
  let st = s % 2147483647; if (st <= 0) st += 2147483646;
  return () => { st = (st * 16807) % 2147483647; return (st - 1) / 2147483646; };
}

/* ─── Woodgrain / washi paper texture overlay ─── */
function createWoodgrainTexture(w, h, seed) {
  const tc = document.createElement('canvas');
  const c = tc.getContext('2d');
  const tw = Math.max(1, Math.floor(w));
  const th = Math.max(1, Math.floor(h));
  tc.width = tw; tc.height = th;
  if (!c) return null;

  const rng = seededRng(seed + tw * 3 + th * 7);

  // Washi paper grain
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

  // Horizontal woodgrain lines
  c.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 30; i++) {
    const y = rng() * th;
    c.fillStyle = `rgba(140,115,85,${0.015 + rng() * 0.025})`;
    c.beginPath();
    for (let x = 0; x <= tw; x += 20) {
      const wy = y + Math.sin(x * 0.01 + i * 2) * (1 + rng() * 2);
      if (x === 0) c.moveTo(x, wy);
      else c.lineTo(x, wy);
    }
    for (let x = tw; x >= 0; x -= 20) {
      const wy = y + 1.5 + Math.sin(x * 0.01 + i * 2) * (1 + rng() * 2);
      c.lineTo(x, wy);
    }
    c.closePath();
    c.fill();
  }

  // Tea / age stains
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
    const ang = (rng() - 0.5) * 0.4;
    c.beginPath();
    c.lineWidth = 0.3 + rng() * 1;
    c.moveTo(fx, fy);
    c.lineTo(fx + Math.cos(ang) * len, fy + Math.sin(ang) * len);
    c.stroke();
  }

  return tc;
}

/* ─── Floating particles (dust motes / fireflies) ─── */
class Particle {
  constructor(w, h, rng) {
    this.reset(w, h, rng);
  }
  reset(w, h, rng) {
    this.x = rng() * w;
    this.y = rng() * h;
    this.size = 1 + rng() * 2.5;
    this.speedX = (rng() - 0.5) * 0.15;
    this.speedY = -0.08 - rng() * 0.18;
    this.opacity = 0.15 + rng() * 0.35;
    this.phase = rng() * Math.PI * 2;
    this.drift = 0.3 + rng() * 0.6;
    this.warm = rng() > 0.5; // warm (gold) or cool (white)
  }
  update(w, h, t, rng) {
    this.x += this.speedX + Math.sin(t * 0.0004 + this.phase) * this.drift * 0.05;
    this.y += this.speedY;
    if (this.y < -10 || this.x < -10 || this.x > w + 10) {
      this.reset(w, h, rng);
      this.y = h + 5;
    }
  }
  draw(ctx, t) {
    const flicker = 0.6 + 0.4 * Math.sin(t * 0.002 + this.phase);
    const alpha = this.opacity * flicker;
    const color = this.warm
      ? `rgba(255, 230, 160, ${alpha})`
      : `rgba(230, 225, 215, ${alpha})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    // Soft glow
    if (this.size > 1.5) {
      const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 3);
      glow.addColorStop(0, color.replace(/[\d.]+\)$/, `${alpha * 0.3})`));
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* ─── Cloud wisps ─── */
function drawCloudWisps(ctx, w, h, t, seed) {
  const rng = seededRng(seed + 4444);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const wispCount = 4;
  for (let i = 0; i < wispCount; i++) {
    const baseY = h * (0.05 + rng() * 0.25);
    const baseX = rng() * w;
    const wispW = w * (0.12 + rng() * 0.2);
    const wispH = 3 + rng() * 8;
    const driftX = Math.sin(t * 0.00008 + i * 2.5) * 40;
    const alpha = 0.03 + rng() * 0.05;

    const grd = ctx.createLinearGradient(baseX + driftX - wispW / 2, baseY, baseX + driftX + wispW / 2, baseY);
    grd.addColorStop(0, `rgba(230,222,205,0)`);
    grd.addColorStop(0.3, `rgba(230,222,205,${alpha})`);
    grd.addColorStop(0.7, `rgba(230,222,205,${alpha})`);
    grd.addColorStop(1, `rgba(230,222,205,0)`);
    ctx.fillStyle = grd;

    ctx.beginPath();
    ctx.ellipse(baseX + driftX, baseY, wispW / 2, wispH, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ─── Warm vignette ─── */
function drawVignette(ctx, w, h, intensity) {
  ctx.save();
  const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.6, 'rgba(0,0,0,0)');
  grd.addColorStop(1, `rgba(20,15,8,${0.45 * intensity})`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  // Warm tone overlay on edges
  const warmEdge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
  warmEdge.addColorStop(0, 'rgba(0,0,0,0)');
  warmEdge.addColorStop(0.7, 'rgba(0,0,0,0)');
  warmEdge.addColorStop(1, `rgba(80,50,20,${0.12 * intensity})`);
  ctx.fillStyle = warmEdge;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* ─── React Component ─── */
const UkiyoLandscape = forwardRef(function UkiyoLandscape(
  {
    height = 620,
    className,
    style,
    scrollSpeed = DEFAULT_SCROLL_SPEED,
    panoramaScale = DEFAULT_PANORAMA_SCALE,
    overlayIntensity = 0.7,
    onIndexChange,
  },
  ref,
) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(0);
  const stateRef = useRef({
    currentIndex: 0,
    prevIndex: -1,
    crossfadeStart: 0,
    crossfading: false,
    images: [],
    loaded: false,
    particles: [],
    texCache: null,
    startedAt: 0,
    autoTimer: null,
  });

  // Load images on mount
  useEffect(() => {
    const st = stateRef.current;
    let cancelled = false;
    const promises = PAINTINGS.map(src => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    });

    Promise.all(promises).then(imgs => {
      if (cancelled) return;
      st.images = imgs.filter(Boolean);
      st.loaded = true;
      st.startedAt = performance.now();

      // Init particles
      const rng = seededRng(42);
      const cw = canvasRef.current?.clientWidth || 900;
      const ch = canvasRef.current?.clientHeight || 620;
      st.particles = [];
      for (let i = 0; i < 35; i++) {
        st.particles.push(new Particle(cw, ch, rng));
      }
    });

    return () => { cancelled = true; };
  }, []);

  // Auto-advance timer
  useEffect(() => {
    const st = stateRef.current;
    const timer = setInterval(() => {
      nextPainting();
    }, AUTO_ADVANCE_MS);
    st.autoTimer = timer;
    return () => clearInterval(timer);
  }, []);

  function nextPainting() {
    const st = stateRef.current;
    if (!st.loaded || st.images.length === 0) return;
    st.prevIndex = st.currentIndex;
    st.currentIndex = (st.currentIndex + 1) % st.images.length;
    st.crossfadeStart = performance.now();
    st.crossfading = true;
    onIndexChange?.(st.currentIndex);
  }

  function goTo(index) {
    const st = stateRef.current;
    if (!st.loaded || st.images.length === 0 || index === st.currentIndex) return;
    st.prevIndex = st.currentIndex;
    st.currentIndex = clamp(index, 0, st.images.length - 1);
    st.crossfadeStart = performance.now();
    st.crossfading = true;
    onIndexChange?.(st.currentIndex);
  }

  useImperativeHandle(ref, () => ({
    next: nextPainting,
    goTo,
    getIndex: () => stateRef.current.currentIndex,
    getCount: () => stateRef.current.images.length,
  }), []);

  // Animation loop
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    function drawFrame(now) {
      const cv = canvasRef.current;
      if (!cv) { animFrameRef.current = requestAnimationFrame(drawFrame); return; }
      const cx = cv.getContext('2d');
      if (!cx) { animFrameRef.current = requestAnimationFrame(drawFrame); return; }
      const st = stateRef.current;
      if (!st.loaded || st.images.length === 0) { animFrameRef.current = requestAnimationFrame(drawFrame); return; }

      const dpr = window.devicePixelRatio || 1;
      const cw = Math.max(1, Math.floor(cv.clientWidth || 900));
      const ch = Math.max(1, Math.floor(typeof height === 'number' ? height : 620));
      if (cv.width !== Math.floor(cw * dpr) || cv.height !== Math.floor(ch * dpr)) {
        cv.width = Math.floor(cw * dpr);
        cv.height = Math.floor(ch * dpr);
        st.texCache = null; // Invalidate texture cache on resize
      }

      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, cw, ch);

      const spd = Math.max(0, scrollSpeed || DEFAULT_SCROLL_SPEED);
      const elapsed = Math.max(0, now - st.startedAt);

      // Helper: draw an image with panning
      function drawPaintingPanned(img, alpha) {
        if (!img) return;
        cx.save();
        cx.globalAlpha = alpha;

        // Calculate how to cover the viewport with the image, then pan
        const imgAspect = img.width / img.height;
        const viewAspect = cw / ch;

        let drawW, drawH;
        if (imgAspect > viewAspect) {
          // Image is wider — fit height, pan across width
          drawH = ch;
          drawW = ch * imgAspect;
        } else {
          // Image is taller — fit width, no pan (or vertical pan)
          drawW = cw;
          drawH = cw / imgAspect;
        }

        // Scale up slightly for the panorama panning effect
        const ps = clamp(panoramaScale || DEFAULT_PANORAMA_SCALE, 1, 3);
        drawW *= ps;
        drawH *= ps;

        // Center vertically
        const yOffset = (ch - drawH) / 2;

        // Calculate panning
        const extra = Math.max(0, drawW - cw);
        const offset = extra === 0 ? 0 : pingPong(elapsed * spd / 1000, extra);

        cx.drawImage(img, 0, 0, img.width, img.height, -offset, yOffset, drawW, drawH);
        cx.restore();
      }

      // Draw current (and optionally previous for crossfade)
      const currentImg = st.images[st.currentIndex];

      if (st.crossfading && st.prevIndex >= 0) {
        const prevImg = st.images[st.prevIndex];
        const fadeT = clamp((now - st.crossfadeStart) / CROSSFADE_MS, 0, 1);
        // Ease-in-out
        const easedT = fadeT < 0.5
          ? 2 * fadeT * fadeT
          : 1 - Math.pow(-2 * fadeT + 2, 2) / 2;

        drawPaintingPanned(prevImg, 1 - easedT);
        drawPaintingPanned(currentImg, easedT);

        if (fadeT >= 1) {
          st.crossfading = false;
          st.prevIndex = -1;
        }
      } else {
        drawPaintingPanned(currentImg, 1);
      }

      // ─── Canvas overlays drawn on top ───
      const oi = clamp(typeof overlayIntensity === 'number' ? overlayIntensity : 0.7, 0, 1);

      if (oi > 0.01) {
        // Cloud wisps
        drawCloudWisps(cx, cw, ch, now, 777);

        // Floating particles
        const partRng = seededRng(999);
        for (const p of st.particles) {
          p.update(cw, ch, now, partRng);
          cx.save();
          cx.globalAlpha = oi;
          p.draw(cx, now);
          cx.restore();
        }

        // Vignette
        drawVignette(cx, cw, ch, oi);

        // Woodgrain / washi paper texture
        if (!st.texCache || st.texCache._w !== cw || st.texCache._h !== ch) {
          const tex = createWoodgrainTexture(cw, ch, 12345);
          if (tex) { tex._w = cw; tex._h = ch; st.texCache = tex; }
        }
        if (st.texCache) {
          cx.save();
          cx.globalAlpha = 0.14 * oi;
          cx.drawImage(st.texCache, 0, 0, cw, ch);
          cx.globalCompositeOperation = 'multiply';
          cx.globalAlpha = 0.08 * oi;
          cx.drawImage(st.texCache, 0, 0, cw, ch);
          cx.restore();
        }

        // Final warm tone (aged print)
        cx.save();
        cx.fillStyle = `rgba(245,235,218,${0.035 * oi})`;
        cx.fillRect(0, 0, cw, ch);
        cx.restore();
      }

      animFrameRef.current = requestAnimationFrame(drawFrame);
    }

    animFrameRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [height, scrollSpeed, panoramaScale, overlayIntensity]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={`Ukiyo-e painting: ${PAINTING_LABELS[stateRef.current.currentIndex] || 'Japanese landscape'}`}
      style={{
        display: 'block',
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
    />
  );
});

export { PAINTING_LABELS };
export default UkiyoLandscape;
