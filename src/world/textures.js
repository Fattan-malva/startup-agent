import * as THREE from "three";

/* ===================================================================== *
 *  Procedural texture foundry
 *  Every surface in the scene is painted here at runtime — the project
 *  ships with zero external image assets.
 * ===================================================================== */

let MAX_ANISO = 4;

export function setMaxAnisotropy(v) {
  MAX_ANISO = Math.max(1, Math.min(16, v | 0));
}

/* --------------------------------------------------------------------- *
 *  Canvas + texture plumbing
 * --------------------------------------------------------------------- */

function surface(w = 512, h = w) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true }) };
}

function makeTexture(canvas, opts = {}) {
  const {
    srgb = false,
    repeat = 1,
    wrap = THREE.RepeatWrapping,
    nearest = false,
  } = opts;

  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = wrap;
  if (Array.isArray(repeat)) t.repeat.set(repeat[0], repeat[1]);
  else t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = MAX_ANISO;

  if (nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  }
  t.needsUpdate = true;
  return t;
}

/* --------------------------------------------------------------------- *
 *  Deterministic noise
 * --------------------------------------------------------------------- */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed = 0) {
  let h =
    Math.imul(x | 0, 374761393) +
    Math.imul(y | 0, 668265263) +
    Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);

  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function fbm(x, y, { octaves = 4, gain = 0.5, lacunarity = 2, seed = 0 } = {}) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 31);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Per-pixel film-grain style break-up pass (kills the "flat CSS" look). */
function grainPass(ctx, w, h, amount = 0.05, seed = 1, scale = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const rnd = mulberry32(seed);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n =
        (fbm(x / (7 * scale), y / (7 * scale), { octaves: 3, seed }) - 0.5) * 2;
      const f = (rnd() - 0.5) * 0.6 + n;
      const k = 1 + f * amount;
      d[i] = Math.max(0, Math.min(255, d[i] * k));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * k));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * k));
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Sobel-derive a tangent-space normal map from a grayscale height canvas. */
export function heightToNormal(heightCanvas, strength = 2.2) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas
    .getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, w, h).data;

  const { canvas, ctx } = surface(w, h);
  const out = ctx.createImageData(w, h);
  const dst = out.data;

  const at = (x, y) => {
    const xx = ((x % w) + w) % w;
    const yy = ((y % h) + h) % h;
    return src[(yy * w + xx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));

      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;

      const i = (y * w + x) * 4;
      dst[i] = (nx * 0.5 + 0.5) * 255;
      dst[i + 1] = (ny * 0.5 + 0.5) * 255;
      dst[i + 2] = (nz / len) * 255;
      dst[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/* --------------------------------------------------------------------- *
 *  Surface builders
 * --------------------------------------------------------------------- */

export function woodTexture({
  size = 1024,
  planks = 7,
  base = "#c49a6c",
  dark = "#7d5330",
  light = "#e6c69a",
  seed = 11,
} = {}) {
  const { canvas, ctx } = surface(size);
  const rnd = mulberry32(seed);
  const ph = size / planks;

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    const tint = (rnd() - 0.5) * 0.16;
    const l = 0.5 + tint;
    ctx.fillStyle = `hsl(${28 + (rnd() - 0.5) * 8}, ${34 + rnd() * 10}%, ${l * 100}%)`;
    ctx.fillRect(0, y0, size, ph - 1);

    // long grain fibres
    const fibres = 90;
    for (let i = 0; i < fibres; i++) {
      const y = y0 + rnd() * ph;
      const alpha = 0.03 + rnd() * 0.11;
      ctx.strokeStyle = rnd() > 0.42 ? `rgba(90,56,28,${alpha})` : `rgba(255,238,208,${alpha})`;
      ctx.lineWidth = 0.6 + rnd() * 1.9;
      ctx.beginPath();
      ctx.moveTo(-10, y);
      const segs = 5;
      for (let s = 1; s <= segs; s++) {
        const x = (size / segs) * s;
        ctx.bezierCurveTo(
          x - size / segs * 0.6, y + (rnd() - 0.5) * 9,
          x - size / segs * 0.3, y + (rnd() - 0.5) * 9,
          x, y + (rnd() - 0.5) * 5,
        );
      }
      ctx.stroke();
    }

    // knots
    if (rnd() > 0.45) {
      const kx = rnd() * size;
      const ky = y0 + ph * (0.25 + rnd() * 0.5);
      const kr = 5 + rnd() * 13;
      for (let r = kr; r > 0; r -= 1.4) {
        ctx.strokeStyle = `rgba(78,48,24,${0.05 + (1 - r / kr) * 0.22})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(kx, ky, r * 1.7, r, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // plank seam
    ctx.fillStyle = "rgba(40,24,12,0.55)";
    ctx.fillRect(0, y0 + ph - 1.5, size, 1.5);
  }

  // darken edges subtly for board variation
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, "rgba(120,80,40,0.10)");
  g.addColorStop(0.5, "rgba(255,255,255,0.03)");
  g.addColorStop(1, "rgba(120,80,40,0.12)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  grainPass(ctx, size, size, 0.09, seed + 3, 1.6);

  return { map: canvas, dark, light };
}

export function woodAssets(opts = {}) {
  const { map } = woodTexture(opts);
  const height = (() => {
    const { canvas, ctx } = surface(map.width);
    ctx.drawImage(map, 0, 0);
    return canvas;
  })();
  return {
    map: makeTexture(map, { srgb: true, repeat: 1 }),
    normalMap: makeTexture(heightToNormal(height, 1.4), { repeat: 1 }),
  };
}

export function plasterTexture({ size = 512, base = "#e9e4db", seed = 21 } = {}) {
  const { canvas, ctx } = surface(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // soft trowel blotches
  const rnd = mulberry32(seed);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 12 + rnd() * 90;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    const v = rnd() > 0.5 ? 255 : 120;
    grd.addColorStop(0, `rgba(${v},${v},${v},0.045)`);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  grainPass(ctx, size, size, 0.06, seed + 9, 2.4);
  return canvas;
}

export function plasterAssets(opts = {}) {
  const map = plasterTexture(opts);
  return {
    map: makeTexture(map, { srgb: true }),
    normalMap: makeTexture(heightToNormal(map, 0.7)),
    roughnessMap: makeTexture(map),
  };
}

export function carpetTexture({ size = 512, base = "#3a3f47", seed = 33 } = {}) {
  const { canvas, ctx } = surface(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const rnd = mulberry32(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 46;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 1.05;
  }
  ctx.putImageData(img, 0, 0);

  // woven ridges
  ctx.globalAlpha = 0.12;
  for (let x = 0; x < size; x += 3) {
    ctx.strokeStyle = x % 6 === 0 ? "#000" : "#8a8f98";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y < size; y += 3) {
    ctx.strokeStyle = y % 6 === 0 ? "#000" : "#8a8f98";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

export function carpetAssets(opts = {}) {
  const map = carpetTexture(opts);
  return {
    map: makeTexture(map, { srgb: true }),
    normalMap: makeTexture(heightToNormal(map, 0.5)),
  };
}

export function fabricTexture({ size = 256, color = "#2f4a63", seed = 5 } = {}) {
  const { canvas, ctx } = surface(size);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.16;
  for (let y = 0; y < size; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? "#ffffff" : "#000000";
    ctx.fillRect(0, y, size, 1.6);
  }
  for (let x = 0; x < size; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? "#ffffff" : "#000000";
    ctx.fillRect(x, 0, 1.6, size);
  }
  ctx.globalAlpha = 1;
  grainPass(ctx, size, size, 0.12, seed, 1);
  return canvas;
}

export function fabricAssets(opts = {}) {
  const map = fabricTexture(opts);
  return {
    map: makeTexture(map, { srgb: true, repeat: 2 }),
    normalMap: makeTexture(heightToNormal(map, 0.9), { repeat: 2 }),
  };
}

export function brushedMetalTexture({ size = 512, base = "#b9bec6", seed = 77 } = {}) {
  const { canvas, ctx } = surface(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(seed);
  for (let i = 0; i < 2600; i++) {
    const y = rnd() * size;
    const x = rnd() * size;
    const len = 20 + rnd() * 130;
    ctx.strokeStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "60,66,74"},${0.02 + rnd() * 0.07})`;
    ctx.lineWidth = 0.6 + rnd() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rnd() - 0.5) * 1.6);
    ctx.stroke();
  }
  return canvas;
}

export function brushedMetalAssets(opts = {}) {
  const map = brushedMetalTexture(opts);
  return {
    roughnessMap: makeTexture(map),
    map: makeTexture(map, { srgb: true }),
  };
}

export function rugTexture({ size = 512, seed = 61 } = {}) {
  const { canvas, ctx } = surface(size);
  const rnd = mulberry32(seed);
  ctx.fillStyle = "#b9a48b";
  ctx.fillRect(0, 0, size, size);

  // irregular diamond lattice, hand-woven feel
  const step = 64;
  for (let y = 0; y <= size; y += step) {
    for (let x = 0; x <= size; x += step) {
      const jitter = (rnd() - 0.5) * 6;
      ctx.save();
      ctx.translate(x + jitter, y + jitter);
      ctx.rotate(Math.PI / 4);
      const s = step * (0.42 + rnd() * 0.12);
      ctx.fillStyle = ["#2f4a63", "#c0683c", "#e8dfd0", "#7d8b6a"][(x / step + y / step) % 4 | 0];
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  // horizon stripes
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#efe6d6" : "transparent";
    ctx.fillRect(0, (size / 8) * i, size, size / 16);
  }
  ctx.globalAlpha = 1;
  grainPass(ctx, size, size, 0.14, seed + 2, 1.2);
  return canvas;
}

export function rugAssets(opts = {}) {
  const map = rugTexture(opts);
  return {
    map: makeTexture(map, { srgb: true, wrap: THREE.ClampToEdgeWrapping }),
    normalMap: makeTexture(heightToNormal(map, 0.8), { wrap: THREE.ClampToEdgeWrapping }),
  };
}

/* --------------------------------------------------------------------- *
 *  Courtyard surfaces (outdoor garden + gravel walkway)
 * --------------------------------------------------------------------- */

export function grassTexture({ size = 512, base = "#4a6636", seed = 141 } = {}) {
  const { canvas, ctx } = surface(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(seed);

  // short lawn blades
  for (let i = 0; i < 4200; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const l = 0.24 + rnd() * 0.46;
    ctx.strokeStyle = `hsla(${86 + rnd() * 28}, ${28 + rnd() * 28}%, ${l * 100}%, ${0.16 + rnd() * 0.3})`;
    ctx.lineWidth = 0.7 + rnd() * 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 5, y - 2 - rnd() * 5);
    ctx.stroke();
  }

  // soft dry/wet patches so the lawn reads organic, never flat
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 18 + rnd() * 72;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.5;
    grd.addColorStop(0, dark ? "rgba(18,32,12,0.30)" : "rgba(156,184,96,0.20)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  grainPass(ctx, size, size, 0.08, seed + 5, 1.4);
  return canvas;
}

export function gravelTexture({ size = 512, base = "#9a9287", seed = 57 } = {}) {
  const { canvas, ctx } = surface(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(seed);
  const stones = ["#cdc7bb", "#8b8378", "#6f6a62", "#b3ab9d", "#5f5b55", "#ded7c9"];

  for (let i = 0; i < 2600; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 1.3 + rnd() * 4.6;
    ctx.fillStyle = stones[(rnd() * stones.length) | 0];
    ctx.globalAlpha = 0.5 + rnd() * 0.5;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    // small highlight on top of each pebble
    ctx.globalAlpha = 0.18 + rnd() * 0.2;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.2, y - r * 0.3, r * 0.55, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  grainPass(ctx, size, size, 0.05, seed + 3, 1.6);
  return canvas;
}

export function ceilingPanelTexture({ size = 512, seed = 91 } = {}) {
  const { canvas, ctx } = surface(size);
  ctx.fillStyle = "#f2f0eb";
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(seed);
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    ctx.fillStyle = `rgba(150,148,142,${0.04 + rnd() * 0.09})`;
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.strokeStyle = "rgba(120,118,112,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  return canvas;
}

export function posterTexture({ size = 512, variant = 0, seed = 13 } = {}) {
  const { canvas, ctx } = surface(size, size * 0.72);
  const h = canvas.height;
  const rnd = mulberry32(seed + variant * 17);

  const palettes = [
    ["#e9e2d4", "#c0683c", "#2f4a63", "#1d1c1a"],
    ["#f1ece2", "#7d8b6a", "#c9a06a", "#2b2a28"],
    ["#14181d", "#3f6f7a", "#d8c9a3", "#e8e3da"],
    ["#e8e3da", "#b03a3a", "#1d1c1a", "#c9a06a"],
  ];
  const pal = palettes[variant % palettes.length];

  ctx.fillStyle = pal[0];
  ctx.fillRect(0, 0, size, h);

  if (variant % 3 === 0) {
    // bauhaus arches
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = pal[1 + (i % 3)];
      const w = size * (0.16 + rnd() * 0.2);
      const hh = h * (0.4 + rnd() * 0.5);
      ctx.beginPath();
      ctx.moveTo(size * 0.08 + i * size * 0.24, h * 0.92);
      ctx.lineTo(size * 0.08 + i * size * 0.24, h * 0.92 - hh + w / 2);
      ctx.arc(size * 0.08 + i * size * 0.24 + w / 2, h * 0.92 - hh + w / 2, w / 2, Math.PI, 0);
      ctx.lineTo(size * 0.08 + i * size * 0.24 + w, h * 0.92);
      ctx.closePath();
      ctx.fill();
    }
  } else if (variant % 3 === 1) {
    // horizon bands
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = pal[1 + (i % 3)];
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(0, h * (0.18 + i * 0.11));
      ctx.bezierCurveTo(size * 0.3, h * (0.1 + i * 0.11), size * 0.7, h * (0.3 + i * 0.11), size, h * (0.18 + i * 0.11));
      ctx.lineTo(size, h * (0.24 + i * 0.11));
      ctx.bezierCurveTo(size * 0.7, h * (0.36 + i * 0.11), size * 0.3, h * (0.16 + i * 0.11), 0, h * (0.24 + i * 0.11));
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    // type specimen
    ctx.fillStyle = pal[3];
    ctx.font = `700 ${size * 0.34}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText("FORM", size * 0.07, h * 0.46);
    ctx.font = `300 ${size * 0.34}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText("& TONE", size * 0.07, h * 0.78);
    ctx.fillStyle = pal[1];
    ctx.fillRect(size * 0.07, h * 0.12, size * 0.3, size * 0.03);
  }

  grainPass(ctx, size, h, 0.1, seed + variant, 1.4);
  return canvas;
}

export function whiteboardTexture({ size = 1024, seed = 3 } = {}) {
  const { canvas, ctx } = surface(size, size * 0.62);
  const h = canvas.height;
  const rnd = mulberry32(seed);

  ctx.fillStyle = "#f7f8f6";
  ctx.fillRect(0, 0, size, h);

  // faint grid
  ctx.strokeStyle = "rgba(120,140,160,0.09)";
  ctx.lineWidth = 1;
  for (let x = 0; x < size; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  const ink = ["#1f2933", "#2b6cb0", "#c05621", "#2f855a"];

  // boxes & arrows
  const boxes = [
    [60, 70, 250, 130],
    [420, 60, 230, 150],
    [760, 90, 200, 110],
    [90, 300, 300, 120],
    [520, 280, 260, 130],
  ];
  boxes.forEach((b, i) => {
    ctx.strokeStyle = ink[i % ink.length];
    ctx.lineWidth = 3;
    ctx.strokeRect(b[0], b[1], b[2], b[3]);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    for (let l = 0; l < 3; l++) {
      ctx.fillRect(b[0] + 16, b[1] + 26 + l * 26, (b[2] - 40) * (0.4 + rnd() * 0.55), 6);
    }
  });

  const arrow = (x1, y1, x2, y2) => {
    ctx.strokeStyle = "rgba(40,50,60,0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 12, y2 - 7);
    ctx.lineTo(x2 - 12, y2 + 7);
    ctx.closePath();
    ctx.fillStyle = "rgba(40,50,60,0.6)";
    ctx.fill();
  };
  arrow(318, 135, 412, 135);
  arrow(660, 135, 752, 145);
  arrow(240, 300, 240, 210);
  arrow(790, 285, 790, 210);

  // sticky notes
  const notes = [
    ["#f6e05e", 640, 470],
    ["#fbb6ce", 760, 430],
    ["#9ae6b4", 860, 500],
  ];
  notes.forEach(([c, x, y]) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rnd() - 0.5) * 0.18);
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 92, 92);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    for (let l = 0; l < 3; l++) ctx.fillRect(12, 20 + l * 20, 62 - l * 12, 5);
    ctx.restore();
  });

  // hand-written title
  ctx.fillStyle = "#1f2933";
  ctx.font = `600 ${size * 0.045}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText("Q4 —  ATELIER STUDIO OS", 60, 44);

  grainPass(ctx, size, h, 0.05, seed + 4, 2);
  return canvas;
}

export function dashboardTexture({ size = 1024, seed = 8 } = {}) {
  const { canvas, ctx } = surface(size, size * 0.6);
  const w = size;
  const h = canvas.height;

  ctx.fillStyle = "#0b1016";
  ctx.fillRect(0, 0, w, h);

  // top bar
  ctx.fillStyle = "#121b24";
  ctx.fillRect(0, 0, w, h * 0.11);
  ctx.fillStyle = "#3ddc97";
  ctx.fillRect(0, h * 0.11 - 3, w, 3);

  const dot = (x, y, c) => {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  };
  dot(30, h * 0.055, "#ff5f57");
  dot(54, h * 0.055, "#febc2e");
  dot(78, h * 0.055, "#28c840");

  ctx.fillStyle = "#e6f1ff";
  ctx.font = `600 ${w * 0.026}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText("atelier · office telemetry", 110, h * 0.068);

  // left panel
  ctx.fillStyle = "#0e161d";
  ctx.fillRect(0, h * 0.11, w * 0.3, h * 0.89);
  ctx.fillStyle = "#8fa6bb";
  ctx.font = `500 ${w * 0.019}px "Segoe UI", system-ui, sans-serif`;
  const rows = ["Floor 3 / East wing", "Occupancy   12 / 20", "Climate     21.4 C", "CO2         612 ppm", "Light       78 %", "Coffee      42 cups"];
  rows.forEach((t, i) => ctx.fillText(t, 26, h * 0.19 + i * h * 0.1));
  ctx.fillStyle = "#3ddc97";
  ctx.fillRect(22, h * 0.14, 3, h * 0.72);

  // right sparkline panel
  const rnd = mulberry32(seed);
  const px = w * 0.32;
  const pw = w * 0.66;
  ctx.fillStyle = "#8fa6bb";
  ctx.font = `500 ${w * 0.018}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText("THROUGHPUT · 24h", px, h * 0.18);

  const barH = h * 0.4;
  const bars = 26;
  for (let i = 0; i < bars; i++) {
    const bh = barH * (0.18 + rnd() * 0.82);
    const bw = (pw / bars) * 0.55;
    const x = px + (pw / bars) * i;
    const grd = ctx.createLinearGradient(0, h * 0.62 - bh, 0, h * 0.62);
    grd.addColorStop(0, "#3ddc97");
    grd.addColorStop(1, "#1b6b56");
    ctx.fillStyle = grd;
    ctx.fillRect(x, h * 0.62 - bh, bw, bh);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = h * 0.62 - (barH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px + pw, y);
    ctx.stroke();
  }

  // bottom metrics
  const metrics = [
    ["UPTIME", "99.982%"],
    ["LATENCY", "34 ms"],
    ["SESSIONS", "1 284"],
  ];
  metrics.forEach(([k, v], i) => {
    const x = px + i * (pw / 3);
    ctx.fillStyle = "#5c7186";
    ctx.font = `500 ${w * 0.016}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(k, x, h * 0.8);
    ctx.fillStyle = "#e6f1ff";
    ctx.font = `700 ${w * 0.034}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(v, x, h * 0.89);
  });

  return canvas;
}

export function cityTexture({ size = 2048, seed = 44 } = {}) {
  const { canvas, ctx } = surface(size, Math.round(size * 0.42));
  const w = size;
  const h = canvas.height;
  const rnd = mulberry32(seed);

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#8fb3d9");
  sky.addColorStop(0.55, "#c9d8e4");
  sky.addColorStop(1, "#e3d9c6");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // distant haze band
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(0, h * 0.55, w, h * 0.45);

  const layer = (count, baseY, minH, maxH, color, lit) => {
    let x = -40;
    for (let i = 0; i < count; i++) {
      const bw = 40 + rnd() * 130;
      const bh = minH + rnd() * (maxH - minH);
      ctx.fillStyle = color;
      ctx.fillRect(x, baseY - bh, bw, bh);

      if (rnd() > 0.3) {
        ctx.fillStyle = color;
        ctx.fillRect(x + bw * 0.3, baseY - bh - 18 - rnd() * 30, bw * 0.22, 40);
      }

      if (lit) {
        const cols = Math.max(1, Math.floor(bw / 16));
        const rows = Math.max(1, Math.floor(bh / 20));
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            if (rnd() > 0.68) {
              ctx.fillStyle = `rgba(255, ${210 + rnd() * 40}, ${140 + rnd() * 80}, ${0.25 + rnd() * 0.5})`;
              ctx.fillRect(x + 7 + c * 16, baseY - bh + 10 + r * 20, 7, 9);
            }
          }
        }
      }
      x += bw + 6 + rnd() * 14;
    }
    return x;
  };

  layer(26, h * 0.78, h * 0.18, h * 0.42, "rgba(172,188,204,0.82)", false);
  layer(20, h * 0.9, h * 0.25, h * 0.55, "rgba(150,168,186,0.94)", false);
  layer(15, h * 1.02, h * 0.3, h * 0.62, "rgba(122,140,160,1)", true);

  // ground
  ctx.fillStyle = "#8b98a6";
  ctx.fillRect(0, h * 0.98, w, h);

  return canvas;
}

/** Generic tileable normal map used to add micro-relief to flat surfaces. */export function noiseNormalTexture({ size = 512, scale = 22, strength = 1.4, seed = 123 } = {}) {
  const { canvas, ctx } = surface(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hv = fbm(x / scale, y / scale, { octaves: 4, seed }) * 255;
      const i = (y * size + x) * 4;
      d[i] = hv;
      d[i + 1] = hv;
      d[i + 2] = hv;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return makeTexture(heightToNormal(canvas, strength));
}

/** Night skyline: black plate with only the lit windows + street glow,
 *  meant to be additively blended over the darkened day backdrop. */
export function cityNightTexture({ size = 2048, seed = 44 } = {}) {
  const { canvas, ctx } = surface(size, Math.round(size * 0.42));
  const w = size;
  const h = canvas.height;
  const rnd = mulberry32(seed);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(6,9,18,1)";
  ctx.fillRect(0, 0, w, h);

  const layer = (count, baseY, minH, maxH, fill, lit) => {
    let x = -40;
    for (let i = 0; i < count; i++) {
      const bw = 40 + rnd() * 130;
      const bh = minH + rnd() * (maxH - minH);
      ctx.fillStyle = fill;
      ctx.fillRect(x, baseY - bh, bw, bh);
      if (rnd() > 0.3) {
        ctx.fillStyle = fill;
        ctx.fillRect(x + bw * 0.3, baseY - bh - 18 - rnd() * 30, bw * 0.22, 40);
      }
      if (lit) {
        const cols = Math.max(1, Math.floor(bw / 16));
        const rows = Math.max(1, Math.floor(bh / 20));
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            if (rnd() > 0.55) {
              const warm = rnd();
              const col = warm > 0.5
                ? `rgba(255, ${196 + rnd() * 50}, ${120 + rnd() * 70}, ${0.55 + rnd() * 0.45})`
                : `rgba(${150 + rnd() * 40}, ${210 + rnd() * 40}, 255, ${0.4 + rnd() * 0.4})`;
              ctx.fillStyle = col;
              ctx.fillRect(x + 7 + c * 16, baseY - bh + 10 + r * 20, 7, 9);
            }
          }
        }
      }
      x += bw + 6 + rnd() * 14;
    }
  };

  layer(26, h * 0.78, h * 0.18, h * 0.42, "rgba(10,14,24,0.9)", true);
  layer(20, h * 0.9, h * 0.25, h * 0.55, "rgba(6,9,17,0.95)", true);
  layer(15, h * 1.02, h * 0.3, h * 0.62, "rgba(3,5,10,1)", true);

  // street glow along the bottom
  const glow = ctx.createLinearGradient(0, h * 0.82, 0, h);
  glow.addColorStop(0, "rgba(255,180,110,0)");
  glow.addColorStop(1, "rgba(255,170,100,0.35)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, h * 0.82, w, h * 0.18);

  // moon + a couple of beacons
  const mx = w * 0.74;
  const my = h * 0.16;
  const halo = ctx.createRadialGradient(mx, my, 0, mx, my, 90);
  halo.addColorStop(0, "rgba(220,232,255,0.85)");
  halo.addColorStop(0.2, "rgba(180,205,255,0.28)");
  halo.addColorStop(1, "rgba(140,170,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 90, my - 90, 180, 180);

  return makeTexture(canvas, { srgb: true, wrap: THREE.ClampToEdgeWrapping });
}

function terrazzoTexture({ size = 512, base = "#cfc5b5", seed = 77 } = {}) {
  const { canvas, ctx } = surface(size);
  const rnd = mulberry32(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const chips = ["#eee5d5", "#8e9694", "#a66f55", "#b4a38c", "#53636a", "#d7d0c2"];
  for (let i = 0; i < 1900; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const rx = 0.8 + rnd() * 4.8;
    const ry = 0.7 + rnd() * 3.4;
    ctx.globalAlpha = 0.28 + rnd() * 0.48;
    ctx.fillStyle = chips[(rnd() * chips.length) | 0];
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  grainPass(ctx, size, size, 0.035, seed + 4, 1.8);
  return canvas;
}

function tileTexture({ size = 512, base = "#c8c0b4", grout = "#8b8378", seed = 83 } = {}) {
  const { canvas, ctx } = surface(size);
  const rnd = mulberry32(seed);
  const tile = size / 4;
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const inset = 4 + rnd() * 2;
      ctx.fillStyle = base;
      ctx.fillRect(x * tile + inset, y * tile + inset, tile - inset * 2, tile - inset * 2);
      const glaze = ctx.createLinearGradient(x * tile, y * tile, (x + 1) * tile, (y + 1) * tile);
      glaze.addColorStop(0, `rgba(255,255,255,${0.06 + rnd() * 0.07})`);
      glaze.addColorStop(1, `rgba(35,31,27,${0.025 + rnd() * 0.04})`);
      ctx.fillStyle = glaze;
      ctx.fillRect(x * tile + inset, y * tile + inset, tile - inset * 2, tile - inset * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + rnd() * 0.08})`;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x * tile + inset + 1, y * tile + inset + 1, tile - inset * 2 - 2, tile - inset * 2 - 2);
    }
  }
  grainPass(ctx, size, size, 0.025, seed + 5, 2.1);
  return canvas;
}

/* --------------------------------------------------------------------- *
 *  Memoised library — build each texture once, share it everywhere.
 * --------------------------------------------------------------------- */
const memo = new Map();
const once = (key, fn) => {
  if (!memo.has(key)) memo.set(key, fn());
  return memo.get(key);
};

export const TEX = {
  get oakFloor() {
    return once("oakFloor", () => {
      const a = woodAssets({ planks: 6, base: "#c7a77d", seed: 11 });
      a.map.repeat.set(3, 3);
      a.normalMap.repeat.set(3, 3);
      return a;
    });
  },
  get deskTop() {
    return once("deskTop", () => {
      const a = woodAssets({ planks: 3, base: "#c5a477", seed: 29 });
      a.map.anisotropy = MAX_ANISO;
      return a;
    });
  },
  get darkWood() {
    return once("darkWood", () => {
      const a = woodAssets({ planks: 4, base: "#6c5038", seed: 51 });
      a.map.repeat.set(2, 2);
      a.normalMap.repeat.set(2, 2);
      return a;
    });
  },
  get wall() {
    return once("wall", () => plasterAssets({ base: "#eeeae2", seed: 21 }));
  },
  get wallAccent() {
    return once("wallAccent", () => plasterAssets({ base: "#37444e", seed: 22 }));
  },
  get carpet() {
    return once("carpet", () => {
      const a = carpetAssets({ base: "#666b65", seed: 33 });
      a.map.repeat.set(6, 6);
      a.normalMap.repeat.set(6, 6);
      return a;
    });
  },
  get rug() {
    return once("rug", () => rugAssets({ seed: 61 }));
  },
  get terrazzo() {
    return once("terrazzo", () => {
      const mapCanvas = terrazzoTexture({ base: "#d5cec2", seed: 77 });
      const heightCanvas = surface(mapCanvas.width);
      heightCanvas.ctx.drawImage(mapCanvas, 0, 0);
      const map = makeTexture(mapCanvas, { srgb: true, repeat: [4, 4] });
      const normalMap = makeTexture(heightToNormal(heightCanvas.canvas, 0.42), { repeat: [4, 4] });
      return { map, normalMap };
    });
  },
  get tile() {
    return once("tile", () => {
      const mapCanvas = tileTexture({ base: "#d4cec3", grout: "#9d968b", seed: 83 });
      const heightCanvas = surface(mapCanvas.width);
      heightCanvas.ctx.drawImage(mapCanvas, 0, 0);
      const map = makeTexture(mapCanvas, { srgb: true, repeat: [4, 4] });
      const normalMap = makeTexture(heightToNormal(heightCanvas.canvas, 0.62), { repeat: [4, 4] });
      return { map, normalMap };
    });
  },
  get grass() {
    return once("grass", () => {
      const mapCanvas = grassTexture({ seed: 141 });
      const heightCanvas = surface(mapCanvas.width);
      heightCanvas.ctx.drawImage(mapCanvas, 0, 0);
      const map = makeTexture(mapCanvas, { srgb: true, repeat: [8, 8] });
      const normalMap = makeTexture(heightToNormal(heightCanvas.canvas, 1.1), { repeat: [8, 8] });
      return { map, normalMap };
    });
  },
  get gravel() {
    return once("gravel", () => {
      const mapCanvas = gravelTexture({ seed: 57 });
      const heightCanvas = surface(mapCanvas.width);
      heightCanvas.ctx.drawImage(mapCanvas, 0, 0);
      const map = makeTexture(mapCanvas, { srgb: true, repeat: [6, 6] });
      const normalMap = makeTexture(heightToNormal(heightCanvas.canvas, 1.5), { repeat: [6, 6] });
      return { map, normalMap };
    });
  },
  get ceiling() {
    const c = once("ceilingTile", () => ceilingPanelTexture({ seed: 91 }));
    return once("ceilingTex", () => {
      const t = makeTexture(c, { srgb: true, repeat: [4, 3] });
      return t;
    });
  },
  get metal() {
    return once("metal", () => brushedMetalAssets({ base: "#b6bcc4" }));
  },
  get noiseNormal() {
    return once("noiseNormal", () => noiseNormalTexture({ scale: 26, strength: 1.1 }));
  },
  get posterA() {
    return once("posterA", () => makeTexture(posterTexture({ variant: 0, seed: 13 }), { srgb: true, wrap: THREE.ClampToEdgeWrapping }));
  },
  get posterB() {
    return once("posterB", () => makeTexture(posterTexture({ variant: 1, seed: 14 }), { srgb: true, wrap: THREE.ClampToEdgeWrapping }));
  },
  get posterC() {
    return once("posterC", () => makeTexture(posterTexture({ variant: 2, seed: 15 }), { srgb: true, wrap: THREE.ClampToEdgeWrapping }));
  },
  get posterD() {
    return once("posterD", () => makeTexture(posterTexture({ variant: 3, seed: 16 }), { srgb: true, wrap: THREE.ClampToEdgeWrapping }));
  },
  get whiteboard() {
    return once("whiteboard", () => makeTexture(whiteboardTexture({ seed: 3 }), { srgb: true, wrap: THREE.ClampToEdgeWrapping }));
  },
  get dashboard() {
    return once("dashboard", () => makeTexture(dashboardTexture({ seed: 8 }), { srgb: true, wrap: THREE.ClampToEdgeWrapping }));
  },
  get city() {
    return once("city", () => makeTexture(cityTexture({ seed: 44 }), { srgb: true, wrap: THREE.ClampToEdgeWrapping }));
  },
  fabric(color) {
    return once(`fabric:${color}`, () => fabricAssets({ color, seed: 5 }));
  },
};
