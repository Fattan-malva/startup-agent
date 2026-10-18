/* Peta ASCII sel navigasi per ruangan.
 * Jalankan: node tools/diag-map.mjs staff
 *   '#' = tidak bisa dilewati   '.' = jalur utama
 *   huruf lain = kantong terpisah (komponen berbeda)
 *   'D' = mulut pintu (komponennya huruf kecil)  'S' = titik duduk kursi
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
const { ROOMS } = await import("../src/world/layout.js");

const roomId = process.argv[2] || "staff";
const scene = new THREE.Scene();
const b = new Building(scene);
b.build();

const nav = b._navEnsure();
const { nx, nz, walk, cell, x0, z0 } = nav;
const total = nx * nz;

const room = ROOMS.find((r) => r.id === roomId);
if (!room) { console.log("ruangan tidak dikenal"); process.exit(1); }

const comp = new Int32Array(total).fill(-1);
let comps = 0;
const sizes = [];
const letters = "abcdefghijklmnopqrstuvwxyz";
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
const label = (id) => (id === big ? "." : letters[id % 26]);

const seatMarks = new Map();
for (const s of b.seats) seatMarks.set(b.roomAt(s.x, s.z), (seatMarks.get(b.roomAt(s.x, s.z)) || []).concat([s]));

const pad = 0.1;
console.log(`\nruangan ${room.name} (${room.x0}..${room.x1} x ${room.z0}..${room.z1})  besar=${big}`);
console.log("   " + "barat→timur");
for (let z = room.z0 + pad; z < room.z1; z += cell) {
  let line = "";
  for (let x = room.x0 + pad; x < room.x1; x += cell) {
    const ci = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / cell)));
    const cj = Math.min(nz - 1, Math.max(0, Math.floor((z - z0) / cell)));
    const i = cj * nx + ci;
    let ch = walk[i] ? label(comp[i]) : "#";
    const seats = seatMarks.get(roomId) || [];
    if (seats.some((s) => Math.abs(s.x - x) < cell * 0.6 && Math.abs(s.z - z) < cell * 0.6)) ch = "S";
    line += ch;
  }
  console.log(`z=${z.toFixed(2).padStart(5)} ${line}`);
}
console.log(`\nkomponen dalam ruangan ini:`);
const inRoom = new Map();
for (let i = 0; i < total; i++) {
  if (!walk[i]) continue;
  const x = x0 + ((i % nx) + 0.5) * cell;
  const z = z0 + (((i / nx) | 0) + 0.5) * cell;
  if (x < room.x0 || x > room.x1 || z < room.z0 || z > room.z1) continue;
  const k = comp[i];
  inRoom.set(k, (inRoom.get(k) || 0) + 1);
}
[...inRoom.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  console.log(`  comp${k} ${k === big ? "(UTAMA)" : "(TERPISAH)"} → ${v} sel`);
});
