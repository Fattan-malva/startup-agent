/* Diagnostik: kenapa route() sering gagal? (headless)
 * Jalankan: node tools/diag-route.mjs [detik]
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
const { Crew } = await import("../src/systems/Crew.js");

const SECONDS = Number(process.argv[2] || 300);
const scene = new THREE.Scene();
const building = new Building(scene);
building.build();
const crew = new Crew({ scene, building });
crew.populate(14);

const fails = new Map();
const origRoute = building.route.bind(building);
building.route = (from, target, mover = null) => {
  const out = origRoute(from, target, mover);
  if (!out.length) {
    const nav = building._navEnsure();
    const start = building._nearestWalkable(from.x, from.z, nav);
    const goal = building._nearestWalkable(target.x, target.z, nav);
    const reason = !start ? "start-null" : !goal ? "goal-null" : "no-path";
    const key = `${reason} target=(${target.x.toFixed(1)},${target.z.toFixed(1)}) room=${building.roomAt(target.x, target.z)} free=${building.isFree(target.x, target.z, 0.18)}`;
    fails.set(key, (fails.get(key) || 0) + 1);
  }
  return out;
};

const dt = 1 / 60;
for (let i = 0; i < Math.round(SECONDS / dt); i++) {
  building.update(dt, i * dt);
  crew.update(dt, i * dt);
}

console.log(`route gagal total: ${[...fails.values()].reduce((a, b) => a + b, 0)}`);
[...fails.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));
