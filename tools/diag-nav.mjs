/* Diagnostik: apakah grid navigasi terpecah (tidak terhubung)?
 * Jalankan: node tools/diag-nav.mjs
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

const scene = new THREE.Scene();
const b = new Building(scene);
b.build();

const nav = b._navEnsure();
const { nx, nz, walk, cell, x0, z0 } = nav;
const total = nx * nz;
console.log(`grid ${nx}x${nz} = ${total} sel; jalan: ${walk.reduce((a, v) => a + v, 0)}`);

// label komponen dengan BFS
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
      if (dx !== 0 && dz !== 0) continue;
      comp[nI] = id;
      q.push(nI);
    }
  }
  sizes.push(n);
}
console.log(`komponen terhubung: ${comps}; ukuran terbesar: ${Math.max(...sizes)}`);
const big = sizes.indexOf(Math.max(...sizes));
const small = [];
for (let i = 0; i < comps; i++) if (i !== big && sizes[i] > 3) small.push({ id: i, n: sizes[i] });
console.log(`komponen kecil (>3 sel): ${small.length}`, small.slice(0, 12));

function cellAt(x, z) {
  const ci = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / cell)));
  const cj = Math.min(nz - 1, Math.max(0, Math.floor((z - z0) / cell)));
  return { i: cj * nx + ci, ci, cj };
}
function report(x, z, label) {
  const c = cellAt(x, z);
  const w = walk[c.i];
  const nw = b._nearestWalkable(x, z, nav);
  let info = `(${x},${z}) ${label}: sel(${c.ci},${c.cj}) walk=${w}`;
  if (nw) {
    const compId = comp[nw.i];
    info += ` nearest=(${nw.x.toFixed(2)},${nw.z.toFixed(2)}) comp=${compId}${compId === big ? " (UTAMA)" : " <<< TERPISAH"} n=${sizes[compId]}`;
  } else info += " nearest=null";
  console.log(info);
}

// titik tujuan yang sering gagal
report(13.5, -8.6, "coffee cafe");
report(3.2, -2.1, "cooler koridor");
report(0, 8.1, "entrance");
report(13.4, 7.5, "developer");
report(-14.0, -0.8, "staff");
report(0, 0, "lobby");
report(-3, 0, "koridor barat");
report(7, 0, "koridor timur");

// apakah komponen terpisah tersambung lewat sel diagonal saja?
if (small.length) {
  for (const s of small.slice(0, 6)) {
    let sample = null;
    for (let i = 0; i < total; i++) if (comp[i] === s.id) { sample = i; break; }
    const cx = sample % nx, cz = (sample / nx) | 0;
    console.log(`  komp ${s.id} (n=${s.n}) contoh sel(${cx},${cz}) world(${(x0 + (cx + 0.5) * cell).toFixed(2)},${(z0 + (cz + 0.5) * cell).toFixed(2)}) room=${b.roomAt(x0 + (cx + 0.5) * cell, z0 + (cz + 0.5) * cell)}`);
  }
}
