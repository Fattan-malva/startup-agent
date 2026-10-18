/* Diagnostik: apakah mulut setiap pintu tersambung ke jalur utama?
 * Jalankan: node tools/diag-doors.mjs
 */

function makeCtx(canvas) {
  const store = { canvas };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "createImageData") return (w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
      if (k === "getImageData") return (x = 0, y = 0, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
      if (k === "measureText") return () => ({ width: 8 });
      if (k === "createPattern") return () => ({});
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function makeCanvas() {
  const c = { width: 256, height: 256, style: {} };
  c.getContext = () => makeCtx(c);
  return c;
}
globalThis.document = {
  createElement(tag) { return tag === "canvas" ? makeCanvas() : { style: {}, appendChild() {}, addEventListener() {}, setAttribute() {} }; },
  createElementNS(_n, tag) { return this.createElement(tag); },
  body: { appendChild() {}, style: {} },
};

const THREE = await import("three");
const { Building } = await import("../src/world/Building.js");
const { WALLS } = await import("../src/world/layout.js");

const scene = new THREE.Scene();
const b = new Building(scene);
b.build();

const nav = b._navEnsure();
const { nx, nz, walk, cell, x0, z0 } = nav;
const total = nx * nz;

const comp = new Int32Array(total).fill(-1);
let comps = 0;
const sizes = [];
for (let s = 0; s < total; s++) {
  if (!walk[s] || comp[s] >= 0) continue;
  const id = comps++;
  let n = 0;
  const q = [s];
  comp[s] = id;
  while (q.length) {
    const i = q.pop();
    n++;
    const cx = i % nx, cz = (i / nx) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = cx + dx, Z = cz + dz;
      if (X < 0 || Z < 0 || X >= nx || Z >= nz) continue;
      const nI = Z * nx + X;
      if (!walk[nI] || comp[nI] >= 0) continue;
      comp[nI] = id;
      q.push(nI);
    }
  }
  sizes.push(n);
}
const big = sizes.indexOf(Math.max(...sizes));

const cellOf = (x, z) => {
  const ci = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / cell)));
  const cj = Math.min(nz - 1, Math.max(0, Math.floor((z - z0) / cell)));
  return cj * nx + ci;
};
const probe = (x, z) => {
  const i = cellOf(x, z);
  if (!walk[i]) {
    // cari sel terdekat untuk tahu ia komponen mana
    const nw = b._nearestWalkable(x, z, nav);
    return nw ? `TERTUTUP(sel)→comp${comp[nw.i]}${comp[nw.i] === big ? "/UTAMA" : ""}` : "TERTUTUP(sel)→nihil";
  }
  return `comp${comp[i]}${comp[i] === big ? "/UTAMA" : "/TERPISAH"}`;
};

for (const w of WALLS) {
  if (!w.doors) continue;
  const dx = w.x2 - w.x1;
  const dz = w.z2 - w.z1;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  // normal
  const nX = -uz;
  const nZ = ux;
  for (const d of w.doors) {
    const px = w.x1 + ux * d.at;
    const pz = w.z1 + uz * d.at;
    const halves = [-(d.w / 2 - 0.25), 0, d.w / 2 - 0.25];
    const parts = [];
    for (const h of halves) {
      const qx = px + ux * h;
      const qz = pz + uz * h;
      const a = probe(qx + nX * 0.55, qz + nZ * 0.55);
      const bb = probe(qx - nX * 0.55, qz - nZ * 0.55);
      parts.push(`[${a} | ${bb}]`);
    }
    console.log(`pintu (${px.toFixed(1)},${pz.toFixed(1)}) w=${d.w}  ${parts.join(" ")}`);
  }
}
