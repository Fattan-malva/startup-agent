/* Diagnostik headless untuk layout simpanan user.
 * node tools/diag-edit.mjs <file.json>
 */
import fs from "node:fs";

function makeCtx(canvas) {
  const store = { canvas };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
      if (k === "createImageData") return (w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
      if (k === "getImageData") return (x = 0, y = 0, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
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
  createElement(tag) {
    if (tag === "canvas") return makeCanvas();
    return { style: {}, appendChild() {}, addEventListener() {}, setAttribute() {} };
  },
  createElementNS(_ns, tag) { return this.createElement(tag); },
  body: { appendChild() {}, style: {} },
};

const THREE = await import("three");
const { Building } = await import("../src/world/Building.js");

const file = process.argv[2];
const data = file ? JSON.parse(fs.readFileSync(file, "utf8")) : null;

const scene = new THREE.Scene();
const b = new Building(scene);
b.build();

const fx = (n) => (typeof n === "number" ? n.toFixed(2) : "-");
const label = (it) => it.label || it.obj?.userData?.interactionLabel || it.obj?.name || "?";
const room = (it) => b.roomAt(it.x, it.z);

if (data) {
  console.log("=== isi simpanan ===");
  const ids = [...Object.keys(data.items || {})];
  for (const id of ids) {
    const it = b._editById.get(id);
    if (!it) { console.log(`${id.padEnd(6)} TIDAK ADA di build ini`); continue; }
    const seats = (it.seats || []).map((s) => `${s.type}@${fx(s.x)},${fx(s.z)}`).join(" ");
    console.log(
      `${id.padEnd(6)} ${String(label(it)).padEnd(26)} room=${String(room(it)).padEnd(10)} ` +
      `home=(${fx(it.home.x)},${fx(it.home.z)}) now=(${fx(it.x)},${fx(it.z)}) fp=${it.fp ? `${it.fp.w}x${it.fp.d}` : "-"} ` +
      (it.plantSpot ? "PLANT " : "") + (seats ? "SEAT " + seats : ""),
    );
  }
  console.log("\n=== dihapus ===");
  for (const id of data.del || []) {
    const it = b._editById.get(id);
    console.log(`${id.padEnd(6)} ${it ? String(label(it)).padEnd(26) + " room=" + room(it) : "TIDAK ADA"}`);
  }
  console.log("");
  const n = b.applyEdits(data);
  console.log(`applyEdits: ${n} item`);
}

console.log("\n=== kursi setelah layout ===");
{
  let ok = 0, bad = 0;
  for (const s of b.seats) {
    const sit = s.sit || s;
    const sitFree = b.isFree(sit.x, sit.z, 0.24, b.seatIgnore(s));
    const app = b.approachTo(s);
    const good = !!s.obstacle && sitFree && !!app;
    if (good) ok++; else bad++;
    if (!good) {
      console.log(`GAGAL ${s.id.padEnd(14)} ${s.type.padEnd(9)} room=${String(b.roomAt(s.x, s.z)).padEnd(10)} seat=(${fx(s.x)},${fx(s.z)}) sit=(${fx(sit.x)},${fx(sit.z)}) sitFree=${sitFree} approach=${!!app}`);
    }
  }
  console.log(`ringkasan: ${ok} bisa diduduki, ${bad} gagal`);
}

console.log("\n=== cek jarak meja-kursi (menempel) ===");
// untuk setiap kursi: cari meja (obstacle) yang paling dekat di sekitar arah hadap
for (const s of b.seats) {
  const o = s.obstacle;
  if (!o) continue;
  const cos = Math.cos(s.yaw), sin = Math.sin(s.yaw);
  // arah hadap kursi (yaw = arah menghadap: +z kalau 0)
  let best = null;
  for (const b2 of b.obstacles) {
    if (b2 === o || b2.kind === "wall") continue;
    if (b2.seatable) continue;
    const dx = b2.centerX - s.x;
    const dz = b2.centerZ - s.z;
    const fwd = dx * sin + dz * cos;
    if (fwd < 0.05 || fwd > 1.8) continue;
    const side = Math.abs(dx * cos - dz * sin);
    const w = Math.max(b2.maxX - b2.minX, b2.maxZ - b2.minZ);
    if (side > Math.max(0.6, w * 0.5)) continue;
    const cx = Math.min(Math.max(s.x, b2.minX), b2.maxX);
    const cz = Math.min(Math.max(s.z, b2.minZ), b2.maxZ);
    const edge = Math.hypot(s.x - cx, s.z - cz);
    if (!best || edge < best.edge) best = { edge, label: b2.label, d: Math.hypot(dx, dz) };
  }
  if (best) console.log(`${s.id.padEnd(14)} ${s.type.padEnd(9)} ke ${String(best.label).padEnd(22)} jarak_tepi=${best.edge.toFixed(2)} jarak_pusat=${best.d.toFixed(2)}`);
}
