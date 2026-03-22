import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

const DEFAULT_BASE_COLOR = '#65775d';
const SKY_TOP = '#435c86';
const SKY_BOTTOM = '#f6d7c0';
const SUN_COLOR = '#d95b43';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
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

function fractalNoise1D(x, seed, octaves = 5, persistence = 0.55, lacunarity = 2) {
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

function sineWaveSummation(x, seed, depth) {
  const phase = seed * 0.0013;
  const broad = Math.sin((x + phase) * (Math.PI * 2.2 + depth * 1.7)) * 0.55;
  const medium = Math.sin((x + phase * 1.9) * (Math.PI * 5.6 + depth * 3.2)) * 0.25;
  const detail = Math.sin((x + phase * 3.1) * (Math.PI * 10.4 + depth * 5.1)) * 0.1;

  return broad + medium + detail;
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
  const baseY = height * (0.35 + depth * 0.18);
  const amplitude = height * (0.045 + depth * 0.085);
  const detailScale = 1.6 + depth * 2.6;
  const peakA = 0.18 + random() * 0.22;
  const peakB = 0.52 + random() * 0.24;
  const valley = 0.34 + random() * 0.2;
  const horizonLift = random() * 0.08;
  const points = [];
  const step = Math.max(4, Math.floor(width / 160));

  for (let x = 0; x <= width + step; x += step) {
    const nx = x / width;
    const coarse = fractalNoise1D(nx * detailScale + horizonLift, seed + layerIndex * 31, 5, 0.55, 2.15);
    const fine = fractalNoise1D(nx * (detailScale * 2.4) + 12.3, seed + layerIndex * 67, 3, 0.45, 2.8);
    const waves = sineWaveSummation(nx, seed + layerIndex * 47, depth);
    const peakCurveA = Math.exp(-((nx - peakA) ** 2) / (0.012 + depth * 0.024));
    const peakCurveB = Math.exp(-((nx - peakB) ** 2) / (0.02 + depth * 0.03));
    const valleyCurve = Math.exp(-((nx - valley) ** 2) / 0.018);
    const ridgeValue =
      coarse * 0.72 +
      fine * 0.22 +
      waves * 0.18 +
      peakCurveA * (0.5 + depth * 0.15) +
      peakCurveB * (0.4 + depth * 0.18) -
      valleyCurve * 0.16;
    const y = baseY - ridgeValue * amplitude;

    points.push({ x, y });
  }

  return {
    depth,
    baseY,
    amplitude,
    points,
  };
}

function drawMountainLayer(ctx, width, height, ridge, color, seed, layerIndex) {
  const lineColor = mixRgb(color, { r: 22, g: 28, b: 24 }, 0.38);

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

  if (ridge.depth > 0.35) {
    ctx.beginPath();
    ridge.points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y + 2);
      } else {
        ctx.lineTo(point.x, point.y + 2);
      }
    });
    ctx.strokeStyle = rgbToCss(lineColor, 0.26 + ridge.depth * 0.12);
    ctx.lineWidth = 1.2 + ridge.depth * 0.4;
    ctx.stroke();
  }

  if (ridge.depth > 0.55) {
    const random = createSeededRandom(seed + layerIndex * 251);
    const hatchCount = 18 + Math.floor(ridge.depth * 12);

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
}

function drawFogBand(ctx, width, centerY, thickness, opacity, seedOffset) {
  const gradient = ctx.createLinearGradient(0, centerY - thickness, 0, centerY + thickness);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.5, `rgba(255, 255, 255, ${opacity})`);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.save();
  ctx.beginPath();

  for (let x = 0; x <= width; x += 8) {
    const drift = fractalNoise1D(x * 0.005 + seedOffset, seedOffset * 113, 3, 0.55, 2.1) * thickness * 0.16;
    const y = centerY - thickness * 0.45 + drift;
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  for (let x = width; x >= 0; x -= 8) {
    const drift = fractalNoise1D(x * 0.005 + seedOffset + 7.3, seedOffset * 131, 3, 0.55, 2.1) * thickness * 0.2;
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
  const textureSize = 160;
  const textureContext = textureCanvas.getContext('2d');

  textureCanvas.width = textureSize;
  textureCanvas.height = textureSize;

  if (!textureContext) {
    return null;
  }

  const imageData = textureContext.createImageData(textureSize, textureSize);
  const pixels = imageData.data;
  const random = createSeededRandom(seed + width + height);

  for (let index = 0; index < pixels.length; index += 4) {
    const value = 226 + Math.floor(random() * 24);
    const alpha = 4 + Math.floor(random() * 13);

    pixels[index] = value;
    pixels[index + 1] = value - Math.floor(random() * 6);
    pixels[index + 2] = value - Math.floor(random() * 10);
    pixels[index + 3] = alpha;
  }

  textureContext.putImageData(imageData, 0, 0);
  textureContext.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  textureContext.lineWidth = 0.5;

  for (let fiber = 0; fiber < 24; fiber += 1) {
    const x = random() * textureSize;
    const y = random() * textureSize;
    const length = 16 + random() * 28;
    const angle = (random() - 0.5) * 0.8;

    textureContext.beginPath();
    textureContext.moveTo(x, y);
    textureContext.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    textureContext.stroke();
  }

  return textureCanvas;
}

function paintLandscape(ctx, width, height, { mountainLayers, baseColor, fogDensity, seed }) {
  const random = createSeededRandom(seed);
  const resolvedLayersInput = Number.isFinite(Number(mountainLayers)) ? Number(mountainLayers) : 5;
  const resolvedFogInput = Number.isFinite(Number(fogDensity)) ? Number(fogDensity) : 0.5;
  const resolvedLayers = clamp(Math.round(resolvedLayersInput), 4, 5);
  const resolvedFog = clamp(resolvedFogInput, 0, 1);
  const parsedBaseColor = parseColor(baseColor);

  ctx.clearRect(0, 0, width, height);

  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, SKY_TOP);
  skyGradient.addColorStop(0.55, '#8593b1');
  skyGradient.addColorStop(1, SKY_BOTTOM);
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  const sunX = width * (0.68 + random() * 0.12);
  const sunY = height * (0.18 + random() * 0.08);
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
    const pattern = ctx.createPattern(paperTexture, 'repeat');

    if (pattern) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  ctx.save();
  ctx.fillStyle = 'rgba(255, 248, 238, 0.03)';
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
  },
  ref,
) {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(0);
  const seedRef = useRef(createSeed());

  function renderScene() {
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
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    paintLandscape(context, cssWidth, cssHeight, {
      mountainLayers,
      baseColor,
      fogDensity,
      seed: seedRef.current,
    });
  }

  function scheduleRender() {
    if (typeof window === 'undefined') {
      return;
    }

    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = window.requestAnimationFrame(renderScene);
  }

  function regenerate() {
    seedRef.current = createSeed();
    scheduleRender();
  }

  useImperativeHandle(
    ref,
    () => ({
      regenerate,
      getSeed: () => seedRef.current,
    }),
    [mountainLayers, baseColor, fogDensity, height],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      scheduleRender();
    };

    scheduleRender();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.cancelAnimationFrame(animationFrameRef.current);
    };
  }, [mountainLayers, baseColor, fogDensity, height]);

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
