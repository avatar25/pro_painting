import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

const DEFAULT_BASE_COLOR = '#65775d';
const DEFAULT_SCROLL_SPEED = 26;
const DEFAULT_PANORAMA_SCALE = 2.35;
const SKY_TOP = '#435c86';
const SKY_BOTTOM = '#f6d7c0';
const SUN_COLOR = '#d95b43';
const OUTLINE_COLOR = { r: 42, g: 43, b: 46 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function pingPong(value, length) {
  if (length <= 0) {
    return 0;
  }

  const cycle = length * 2;
  const wrapped = ((value % cycle) + cycle) % cycle;

  return wrapped <= length ? wrapped : cycle - wrapped;
}

function resolveFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mixRgb(colorA, colorB, amount) {
  const t = clamp(amount, 0, 1);

  return {
    r: Math.round(lerp(colorA.r, colorB.r, t)),
    g: Math.round(lerp(colorA.g, colorB.g, t)),
    b: Math.round(lerp(colorA.b, colorB.b, t)),
  };
}

function rgbToCss({ r, g, b }, alpha = 1) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function parseColor(color) {
  if (typeof color !== 'string') {
    return parseColor(DEFAULT_BASE_COLOR);
  }

  const hex = color.trim();
  const shortHexMatch = /^#([\da-f]{3})$/i.exec(hex);
  if (shortHexMatch) {
    const [r, g, b] = shortHexMatch[1].split('');
    return {
      r: parseInt(`${r}${r}`, 16),
      g: parseInt(`${g}${g}`, 16),
      b: parseInt(`${b}${b}`, 16),
    };
  }

  const longHexMatch = /^#([\da-f]{6})$/i.exec(hex);
  if (longHexMatch) {
    return {
      r: parseInt(longHexMatch[1].slice(0, 2), 16),
      g: parseInt(longHexMatch[1].slice(2, 4), 16),
      b: parseInt(longHexMatch[1].slice(4, 6), 16),
    };
  }

  const rgbMatch = /^rgba?\(([^)]+)\)$/i.exec(hex);
  if (rgbMatch) {
    const values = rgbMatch[1]
      .split(',')
      .map((part) => Number.parseFloat(part.trim()))
      .slice(0, 3);

    if (values.length === 3 && values.every((value) => Number.isFinite(value))) {
      return {
        r: clamp(values[0], 0, 255),
        g: clamp(values[1], 0, 255),
        b: clamp(values[2], 0, 255),
      };
    }
  }

  return parseColor(DEFAULT_BASE_COLOR);
}

function createSeed() {
  return Math.floor(Math.random() * 2147483647);
}

function createSeededRandom(seed) {
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function hash1D(index, seed) {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453123;
  return (value - Math.floor(value)) * 2 - 1;
}

function perlin1D(x, seed) {
  const left = Math.floor(x);
  const localX = x - left;
  const gradientA = hash1D(left, seed);
  const gradientB = hash1D(left + 1, seed);
  const dotA = gradientA * localX;
  const dotB = gradientB * (localX - 1);
  const blend = fade(localX);

  return lerp(dotA, dotB, blend);
}

function fbm1D(x, seed, octaves = 5, persistence = 0.55, lacunarity = 2) {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    total += perlin1D(x * frequency, seed + octave * 97) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return maxValue === 0 ? 0 : total / maxValue;
}

function ridgedFbm1D(x, seed, octaves = 6, persistence = 0.56, lacunarity = 2.2, sharpness = 2.35) {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  let weight = 1;

  for (let octave = 0; octave < octaves; octave += 1) {
    const signal = 1 - Math.abs(perlin1D(x * frequency, seed + octave * 131));
    const ridge = Math.pow(clamp(signal, 0, 1), sharpness) * weight;

    total += ridge * amplitude;
    maxValue += amplitude;
    weight = clamp(ridge * 2.8, 0, 1);
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return maxValue === 0 ? 0 : total / maxValue;
}

function sineWaveSummation(x, seed, depth) {
  const phase = seed * 0.0013;
  const broad = Math.sin((x + phase) * (Math.PI * 2.2 + depth * 1.7)) * 0.55;
  const medium = Math.sin((x + phase * 1.9) * (Math.PI * 5.6 + depth * 3.2)) * 0.25;
  const detail = Math.sin((x + phase * 3.1) * (Math.PI * 10.4 + depth * 5.1)) * 0.1;

  return broad + medium + detail;
}

function sharpPeak(x, center, leftWidth, rightWidth, sharpness = 2.5) {
  const width = x < center ? leftWidth : rightWidth;
  const normalizedDistance = Math.abs(x - center) / Math.max(width, 0.0001);
  return Math.pow(clamp(1 - normalizedDistance, 0, 1), sharpness);
}

function getLayerColor(index, totalLayers, baseColor) {
  const palette = [
    { r: 145, g: 157, b: 182 },
    { r: 154, g: 159, b: 168 },
    { r: 136, g: 147, b: 145 },
    { r: 118, g: 131, b: 107 },
    mixRgb(baseColor, { r: 44, g: 56, b: 47 }, 0.2),
  ];

  const layerColor = palette[index] || palette[palette.length - 1];
  const depth = totalLayers <= 1 ? 1 : index / (totalLayers - 1);
  const atmosphereTint = mixRgb(layerColor, { r: 245, g: 240, b: 234 }, 0.38 - depth * 0.2);

  return mixRgb(atmosphereTint, baseColor, depth * 0.2);
}

function buildMountainRidge(width, height, layerIndex, totalLayers, seed) {
  const random = createSeededRandom(seed + layerIndex * 173);
  const depth = totalLayers <= 1 ? 1 : layerIndex / (totalLayers - 1);
  const baseY = height * (0.39 + depth * 0.16);
  const amplitude = height * (0.08 + depth * 0.11);
  const massifScale = 1.4 + depth * 1.1;
  const cragScale = 4.8 + depth * 2.8;
  const chiselScale = 11 + depth * 5.4;
  const peakA = 0.16 + random() * 0.18;
  const peakB = 0.42 + random() * 0.18;
  const peakC = 0.68 + random() * 0.14;
  const valley = 0.28 + random() * 0.28;
  const horizonLift = random() * 0.08;
  const points = [];
  const step = Math.max(3, Math.floor(width / 280));

  for (let x = 0; x <= width + step; x += step) {
    const nx = x / width;
    const warp = fbm1D(nx * (1.15 + depth * 0.35) + horizonLift, seed + layerIndex * 17, 4, 0.58, 2.12);
    const warpedX = nx + warp * (0.07 - depth * 0.018);
    const broadMass = ridgedFbm1D(warpedX * massifScale + 1.7, seed + layerIndex * 31, 6, 0.58, 2.08, 2.15);
    const crags = ridgedFbm1D(warpedX * cragScale + 9.4, seed + layerIndex * 67, 5, 0.52, 2.55, 2.6);
    const chisels = ridgedFbm1D(warpedX * chiselScale + 15.9, seed + layerIndex * 109, 4, 0.45, 3.05, 3);
    const underShape = Math.max(0, fbm1D(warpedX * (1 + depth * 0.35) + 4.2, seed + layerIndex * 47, 4, 0.54, 2.02));
    const waves = sineWaveSummation(nx, seed + layerIndex * 47, depth) * 0.04;
    const peakCurveA = sharpPeak(nx, peakA, 0.11 + depth * 0.035, 0.05 + depth * 0.018, 2.7);
    const peakCurveB = sharpPeak(nx, peakB, 0.095 + depth * 0.03, 0.06 + depth * 0.02, 2.6);
    const peakCurveC = sharpPeak(nx, peakC, 0.085 + depth * 0.028, 0.05 + depth * 0.018, 2.8);
    const valleyCurve = Math.pow(clamp(1 - Math.abs(nx - valley) / 0.09, 0, 1), 1.8);
    const ridgeValue =
      broadMass * 0.9 +
      crags * 0.42 +
      chisels * 0.18 +
      underShape * 0.22 +
      peakCurveA * (0.62 + depth * 0.1) +
      peakCurveB * (0.42 + depth * 0.12) +
      peakCurveC * (0.3 + depth * 0.12) +
      waves -
      valleyCurve * 0.14;
    const shapedRidge = Math.pow(Math.max(ridgeValue, 0), 1.22);
    const y = baseY - shapedRidge * amplitude;

    points.push({ x, y });
  }

  return {
    depth,
    baseY,
    points,
  };
}

function drawMountainOutline(ctx, ridge, seed, layerIndex) {
  const outlineNoiseScale = 0.0045 + ridge.depth * 0.0025;
  const jitterAmount = 0.85 + ridge.depth * 1.05;

  ctx.save();
  ctx.beginPath();

  ridge.points.forEach((point, index) => {
    const jitter = fbm1D(
      point.x * outlineNoiseScale + layerIndex * 1.73,
      seed + layerIndex * 211,
      3,
      0.58,
      2.22,
    ) * jitterAmount;
    const y = point.y + jitter;

    if (index === 0) {
      ctx.moveTo(point.x, y);
    } else {
      ctx.lineTo(point.x, y);
    }
  });

  ctx.strokeStyle = rgbToCss(OUTLINE_COLOR, 0.78);
  ctx.lineWidth = ridge.depth > 0.5 ? 3 : 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawMountainLayer(ctx, width, height, ridge, color, seed, layerIndex) {
  const lineColor = mixRgb(color, OUTLINE_COLOR, 0.52);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, height);

  ridge.points.forEach((point) => {
    ctx.lineTo(point.x, point.y);
  });

  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = rgbToCss(color, 1);
  ctx.fill();
  if (ridge.depth > 0.55) {
    const random = createSeededRandom(seed + layerIndex * 251);
    const hatchCount = 18 + Math.floor(ridge.depth * 20);

    ctx.strokeStyle = rgbToCss(lineColor, 0.06 + ridge.depth * 0.04);
    ctx.lineWidth = 0.7;

    for (let index = 0; index < hatchCount; index += 1) {
      const startX = random() * width;
      const ridgePointIndex = clamp(Math.floor((startX / width) * (ridge.points.length - 1)), 0, ridge.points.length - 1);
      const ridgePoint = ridge.points[ridgePointIndex];
      const strokeLength = height * (0.025 + random() * 0.04);
      const tilt = -10 - random() * 16;

      ctx.beginPath();
      ctx.moveTo(startX, ridgePoint.y + 6 + random() * 12);
      ctx.lineTo(startX + tilt, ridgePoint.y + strokeLength);
      ctx.stroke();
    }
  }

  ctx.restore();
  drawMountainOutline(ctx, ridge, seed, layerIndex);
}

function drawFogBand(ctx, width, centerY, thickness, opacity, seedOffset) {
  const gradient = ctx.createLinearGradient(0, centerY - thickness, 0, centerY + thickness);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.5, `rgba(255, 255, 255, ${opacity})`);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.save();
  ctx.beginPath();

  for (let x = 0; x <= width; x += 8) {
    const drift = fbm1D(x * 0.005 + seedOffset, seedOffset * 113, 3, 0.55, 2.1) * thickness * 0.16;
    const y = centerY - thickness * 0.45 + drift;
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  for (let x = width; x >= 0; x -= 8) {
    const drift = fbm1D(x * 0.005 + seedOffset + 7.3, seedOffset * 131, 3, 0.55, 2.1) * thickness * 0.2;
    const y = centerY + thickness * 0.55 + drift;
    ctx.lineTo(x, y);
  }

  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();
}

function createPaperTexture(width, height, seed) {
  const textureCanvas = document.createElement('canvas');
  const textureContext = textureCanvas.getContext('2d');
  const textureWidth = Math.max(1, Math.floor(width));
  const textureHeight = Math.max(1, Math.floor(height));

  textureCanvas.width = textureWidth;
  textureCanvas.height = textureHeight;

  if (!textureContext) {
    return null;
  }

  const imageData = textureContext.createImageData(textureWidth, textureHeight);
  const pixels = imageData.data;
  const random = createSeededRandom(seed + textureWidth * 3 + textureHeight * 7);
  const columnMemory = new Float32Array(textureWidth);

  for (let y = 0; y < textureHeight; y += 1) {
    let rowMemory = random();

    for (let x = 0; x < textureWidth; x += 1) {
      const grain = random();
      const warmShift = random();
      rowMemory = rowMemory * 0.84 + grain * 0.16;
      columnMemory[x] = columnMemory[x] * 0.9 + grain * 0.1;

      const fiberField = rowMemory * 0.58 + columnMemory[x] * 0.42;
      const tonalLift = Math.floor(fiberField * 18);
      const value = 226 + tonalLift + Math.floor(warmShift * 8);
      const alpha = 5 + Math.floor(Math.abs(grain - fiberField) * 26) + Math.floor(random() * 5);
      const index = (y * textureWidth + x) * 4;

      pixels[index] = value;
      pixels[index + 1] = value - Math.floor(4 + warmShift * 8);
      pixels[index + 2] = value - Math.floor(10 + warmShift * 12);
      pixels[index + 3] = alpha;
    }
  }

  textureContext.putImageData(imageData, 0, 0);
  textureContext.globalCompositeOperation = 'multiply';

  for (let stain = 0; stain < 8; stain += 1) {
    const centerX = random() * textureWidth;
    const centerY = random() * textureHeight;
    const radius = Math.min(textureWidth, textureHeight) * (0.14 + random() * 0.18);
    const stainGradient = textureContext.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);

    stainGradient.addColorStop(0, `rgba(166, 142, 112, ${0.035 + random() * 0.025})`);
    stainGradient.addColorStop(1, 'rgba(166, 142, 112, 0)');
    textureContext.fillStyle = stainGradient;
    textureContext.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  }

  textureContext.strokeStyle = 'rgba(112, 96, 78, 0.045)';

  for (let fiber = 0; fiber < Math.max(80, Math.floor((textureWidth * textureHeight) / 22000)); fiber += 1) {
    const x = random() * textureWidth;
    const y = random() * textureHeight;
    const length = 24 + random() * 90;
    const angle = (random() - 0.5) * 0.65 + (random() > 0.55 ? 0 : Math.PI / 2);

    textureContext.beginPath();
    textureContext.lineWidth = 0.35 + random() * 1.15;
    textureContext.moveTo(x, y);
    textureContext.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    textureContext.stroke();
  }

  textureContext.globalCompositeOperation = 'screen';
  textureContext.strokeStyle = 'rgba(255, 250, 242, 0.035)';

  for (let fiber = 0; fiber < Math.max(48, Math.floor((textureWidth * textureHeight) / 36000)); fiber += 1) {
    const x = random() * textureWidth;
    const y = random() * textureHeight;
    const length = 18 + random() * 70;
    const angle = (random() - 0.5) * 0.5;

    textureContext.beginPath();
    textureContext.lineWidth = 0.25 + random() * 0.8;
    textureContext.moveTo(x, y);
    textureContext.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    textureContext.stroke();
  }

  textureContext.globalCompositeOperation = 'source-over';

  for (let speck = 0; speck < Math.max(120, Math.floor((textureWidth * textureHeight) / 12000)); speck += 1) {
    const speckX = random() * textureWidth;
    const speckY = random() * textureHeight;
    const radius = 0.3 + random() * 1.3;

    textureContext.fillStyle = `rgba(95, 82, 70, ${0.012 + random() * 0.022})`;
    textureContext.beginPath();
    textureContext.arc(speckX, speckY, radius, 0, Math.PI * 2);
    textureContext.fill();
  }

  return textureCanvas;
}

function paintLandscape(ctx, width, height, { mountainLayers, baseColor, fogDensity, seed }) {
  const random = createSeededRandom(seed);
  const resolvedLayers = clamp(Math.round(resolveFiniteNumber(mountainLayers, 5)), 4, 5);
  const resolvedFog = clamp(resolveFiniteNumber(fogDensity, 0.5), 0, 1);
  const parsedBaseColor = parseColor(baseColor);

  ctx.clearRect(0, 0, width, height);

  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, SKY_TOP);
  skyGradient.addColorStop(0.55, '#8593b1');
  skyGradient.addColorStop(1, SKY_BOTTOM);
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  const sunX = width * (0.62 + random() * 0.22);
  const sunY = height * (0.17 + random() * 0.08);
  const sunRadius = Math.min(width, height) * (0.075 + random() * 0.02);
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius * 2.8);
  sunGlow.addColorStop(0, 'rgba(217, 91, 67, 0.72)');
  sunGlow.addColorStop(0.35, 'rgba(217, 91, 67, 0.34)');
  sunGlow.addColorStop(1, 'rgba(217, 91, 67, 0)');

  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius * 2.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = SUN_COLOR;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  const ridges = [];
  for (let layerIndex = 0; layerIndex < resolvedLayers; layerIndex += 1) {
    ridges.push(buildMountainRidge(width, height, layerIndex, resolvedLayers, seed));
  }

  ridges.forEach((ridge, layerIndex) => {
    const color = getLayerColor(layerIndex, resolvedLayers, parsedBaseColor);
    drawMountainLayer(ctx, width, height, ridge, color, seed, layerIndex);

    if (layerIndex < ridges.length - 1) {
      const nextRidge = ridges[layerIndex + 1];
      const fogY = lerp(ridge.baseY, nextRidge.baseY, 0.48);
      const fogThickness = height * (0.035 + resolvedFog * 0.03 + ridge.depth * 0.012);
      const fogOpacity = 0.08 + resolvedFog * 0.13 - ridge.depth * 0.02;

      drawFogBand(ctx, width, fogY, fogThickness, clamp(fogOpacity, 0.04, 0.22), seed + layerIndex * 41);
    }
  });

  const foregroundWash = ctx.createLinearGradient(0, height * 0.65, 0, height);
  foregroundWash.addColorStop(0, 'rgba(255, 246, 238, 0)');
  foregroundWash.addColorStop(1, 'rgba(82, 90, 72, 0.08)');
  ctx.fillStyle = foregroundWash;
  ctx.fillRect(0, height * 0.65, width, height * 0.35);

  const paperTexture = createPaperTexture(width, height, seed + 999);
  if (paperTexture) {
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.drawImage(paperTexture, 0, 0, width, height);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.14;
    ctx.drawImage(paperTexture, 0, 0, width, height);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(241, 231, 218, 0.14)';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = 'rgba(255, 248, 238, 0.045)';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

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
  const animationFrameRef = useRef(0);
  const seedRef = useRef(createSeed());
  const sceneRef = useRef(null);

  function invalidateScene() {
    sceneRef.current = null;
  }

  function ensureScene(width, heightValue) {
    if (typeof document === 'undefined') {
      return null;
    }

    const resolvedPanoramaScale = clamp(resolveFiniteNumber(panoramaScale, DEFAULT_PANORAMA_SCALE), 1, 4);
    const panoramaWidth = Math.max(width, Math.floor(width * resolvedPanoramaScale));
    const sceneCanvas = document.createElement('canvas');
    const sceneContext = sceneCanvas.getContext('2d');

    if (!sceneContext) {
      return null;
    }

    sceneCanvas.width = panoramaWidth;
    sceneCanvas.height = heightValue;

    paintLandscape(sceneContext, panoramaWidth, heightValue, {
      mountainLayers,
      baseColor,
      fogDensity,
      seed: seedRef.current,
    });

    const random = createSeededRandom(seedRef.current + width + heightValue);
    sceneRef.current = {
      canvas: sceneCanvas,
      panoramaWidth,
      viewportWidth: width,
      viewportHeight: heightValue,
      phase: random() * panoramaWidth,
      startedAt: typeof performance !== 'undefined' ? performance.now() : 0,
    };

    return sceneRef.current;
  }

  function drawFrame(now) {
    if (typeof window === 'undefined') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.max(1, Math.floor(canvas.clientWidth || canvas.parentElement?.clientWidth || 900));
    const fallbackHeight = typeof height === 'number' ? height : 560;
    const cssHeight = Math.max(1, Math.floor(canvas.clientHeight || fallbackHeight));

    if (canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      invalidateScene();
    }

    let scene = sceneRef.current;
    if (!scene || scene.viewportWidth !== cssWidth || scene.viewportHeight !== cssHeight) {
      scene = ensureScene(cssWidth, cssHeight);
    }

    if (!scene) {
      animationFrameRef.current = window.requestAnimationFrame(drawFrame);
      return;
    }

    const normalizedSpeed = Math.max(0, resolveFiniteNumber(scrollSpeed, DEFAULT_SCROLL_SPEED));
    const extraWidth = Math.max(0, scene.panoramaWidth - cssWidth);
    const elapsed = Math.max(0, now - scene.startedAt);
    const offset = extraWidth === 0 ? 0 : pingPong(scene.phase + (elapsed * normalizedSpeed) / 1000, extraWidth);

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.drawImage(scene.canvas, offset, 0, cssWidth, cssHeight, 0, 0, cssWidth, cssHeight);

    animationFrameRef.current = window.requestAnimationFrame(drawFrame);
  }

  function startAnimation() {
    if (typeof window === 'undefined') {
      return;
    }

    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = window.requestAnimationFrame(drawFrame);
  }

  function regenerate() {
    seedRef.current = createSeed();
    invalidateScene();
    startAnimation();
  }

  useImperativeHandle(
    ref,
    () => ({
      regenerate,
      getSeed: () => seedRef.current,
    }),
    [mountainLayers, baseColor, fogDensity, height, scrollSpeed, panoramaScale],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    invalidateScene();

    const handleResize = () => {
      invalidateScene();
      startAnimation();
    };

    startAnimation();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    };
  }, [mountainLayers, baseColor, fogDensity, height, scrollSpeed, panoramaScale]);

  useEffect(() => {
    if (regenerateKey === undefined) {
      return;
    }

    regenerate();
  }, [regenerateKey]);

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
