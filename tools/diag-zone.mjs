/* Diagnostik: obstacle mana yang menutup sebuah area?
 * Jalankan: node tools/diag-zone.mjs x0 z0 x1 z1
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

const [a, b_, c, d] = process.argv.slice(2).map(Number);
const scene = new THREE.Scene();
const b = new Building(scene);
b.build();

console.log(`area (${a}..${c}) x (${b_}..${d})`);
for (const o of b.obstacles) {
  if (o.maxX < a || o.minX > c || o.maxZ < b_ || o.minZ > d) continue;
  console.log(`  ${String(o.kind).padEnd(5)} ${String(o.label).padEnd(22)} x ${o.minX.toFixed(2)}..${o.maxX.toFixed(2)}  z ${o.minZ.toFixed(2)}..${o.maxZ.toFixed(2)}`);
}
