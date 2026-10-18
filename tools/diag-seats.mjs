/* Diagnostik headless: apakah setiap kursi benar-benar bisa diduduki?
 * Jalankan: node tools/diag-seats.mjs
 *
 * Memakai stub canvas supaya THREE bisa membuat CanvasTexture tanpa DOM.
 */

function makeCtx(canvas) {
  const store = { canvas };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "createLinearGradient" || k === "createRadialGradient") {
        return () => ({ addColorStop() {} });
      }
      if (k === "createImageData") {
        return (w = 1, h = 1) => ({
          data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
          width: w,
          height: h,
        });
      }
      if (k === "getImageData") {
        return (x = 0, y = 0, w = 1, h = 1) => ({
          data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
          width: w,
          height: h,
        });
      }
      if (k === "measureText") return () => ({ width: 8 });
      if (k === "createPattern") return () => ({});
      return () => undefined;
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
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
  createElementNS(_ns, tag) {
    return this.createElement(tag);
  },
  body: { appendChild() {}, style: {} },
};

const THREE = await import("three");
const { Building } = await import("../src/world/Building.js");

const scene = new THREE.Scene();
const b = new Building(scene);
b.build();

const byType = {};
for (const s of b.seats) byType[s.type] = (byType[s.type] || 0) + 1;
console.log(`kursi total: ${b.seats.length}`);
console.log("per tipe:", byType);
console.log("obstacle:", b.obstacles.length, "plafon/props:", b.staticProps.length, "placed:", b.placedProps.length);
console.log("");

function near(x, z, ignore, radius = 0.45) {
  const out = [];
  for (const o of b.obstacles) {
    if (o === ignore) continue;
    const cx = Math.min(Math.max(x, o.minX), o.maxX);
    const cz = Math.min(Math.max(z, o.minZ), o.maxZ);
    const d = Math.hypot(x - cx, z - cz);
    if (d < radius) out.push({ d: +d.toFixed(3), label: o.label, kind: o.kind });
  }
  return out.sort((p, q) => p.d - q.d);
}

let ok = 0;
let bad = 0;
for (const s of b.seats) {
  const sit = s.sit || s;
  const obsOk = !!s.obstacle;
  const sitFree = b.isFree(sit.x, sit.z, 0.24, b.seatIgnore(s));
  const app = b.approachTo(s);
  const room = b.roomAt(s.x, s.z);
  const good = obsOk && sitFree && !!app;
  if (good) ok++;
  else bad++;
  const blockers = near(sit.x, sit.z, b.seatIgnore(s));
  console.log(
    `${good ? "OK  " : "GAGAL"} ${s.id.padEnd(14)} ${s.type.padEnd(9)} room=${String(room).padEnd(10)}` +
    ` obs=${obsOk ? "y" : "N"} sitFree=${sitFree ? "y" : "N"} approach=${app ? "y" : "N"}` +
    (good ? "" : `  blockers=${JSON.stringify(blockers.slice(0, 3))}`),
  );
}
console.log("");
console.log(`ringkasan: ${ok} bisa diduduki, ${bad} gagal`);
