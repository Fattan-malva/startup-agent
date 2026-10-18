/* Diagnostik: setelah berdiri dari kursi, apakah karakter bisa keluar?
 * node tools/diag-exit.mjs [layout.json]
 */
import fs from "node:fs";

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
function makeCanvas() { const c = { width: 256, height: 256, style: {} }; c.getContext = () => makeCtx(c); return c; }
globalThis.document = {
  createElement(tag) { return tag === "canvas" ? makeCanvas() : { style: {}, appendChild() {}, addEventListener() {}, setAttribute() {} }; },
  createElementNS(_n, tag) { return this.createElement(tag); },
  body: { appendChild() {}, style: {} },
};

const THREE = await import("three");
const { Building } = await import("../src/world/Building.js");
const { Critter } = await import("../src/character/Critter.js");

const layoutFile = process.argv[2];
const scene = new THREE.Scene();
const b = new Building(scene);
b.build();
if (layoutFile) {
  const data = JSON.parse(fs.readFileSync(layoutFile, "utf8"));
  b.applyEdits(data);
  console.log("layout:", layoutFile);
}
b.dynamicBodies = [];

const dt = 1 / 60;
const fails = [];

for (const seat of b.seats) {
  const sit = seat.sit;
  const c = new Critter({ species: "people", name: "Test" });
  c.root.position.set(sit.x, 0, sit.z);
  c.sitting = true;
  c.pose("sit");
  // mirip seatInto(): ignore kursi + meja
  c._seatObstacle = seat.obstacle;
  c._seatIgnore = b.seatIgnore(seat);
  c._seatIgnoreT = 1.5;
  c.yaw = c.targetYaw = seat.yaw ?? 0;
  c.root.rotation.y = c.yaw;
  b.dynamicBodies = [c];

  c.standUp();
  // fase keluar kursi (seperti NPC: AI menunggu sampai selesai)
  for (let i = 0; i < 60 * 4 && (c._exiting || c._exitPending); i++) c.update(dt, i * dt, b);
  // tujuan: jauh dari kursi, di ruangan yang sama bila mungkin
  let target = null;
  for (const r of [1.6, 2.2, 3.0]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const x = sit.x + Math.sin(a) * r;
      const z = sit.z + Math.cos(a) * r;
      if (!b.isFree(x, z, 0.32)) continue;
      if (!b.walkableAt(x, z, 0.22, true)) continue;
      target = { x, z };
      break;
    }
    if (target) break;
  }
  if (!target) { fails.push(`${seat.id.padEnd(14)} ${seat.type.padEnd(8)} tidak ada tujuan`); continue; }
  const path = b.route(c.position, target, c);
  c.followPath(path, false);

  let maxDist = 0;
  let insideAfter = false;
  let ignoreDroppedWhileInside = false;
  for (let i = 0; i < 60 * 6; i++) {
    c.update(dt, i * dt, b);
    const d = Math.hypot(c.position.x - sit.x, c.position.z - sit.z);
    maxDist = Math.max(maxDist, d);
    if (!c._seatIgnore && !b.isFree(c.position.x, c.position.z, 0.27)) insideAfter = true;
  }
  const outside = maxDist > 0.4;
  if (!outside || insideAfter) {
    fails.push(`${seat.id.padEnd(14)} ${seat.type.padEnd(8)} room=${String(b.roomAt(sit.x, sit.z)).padEnd(10)} maxDist=${maxDist.toFixed(2)} bekuDiProp=${insideAfter} pos=(${c.position.x.toFixed(2)},${c.position.z.toFixed(2)}) target=(${target.x.toFixed(2)},${target.z.toFixed(2)}) ignore=${!!c._seatIgnore}`);
  }
}

console.log(`kursi diuji: ${b.seats.length}, gagal keluar/beku: ${fails.length}`);
for (const f of fails) console.log("  " + f);
