/* Simulasi headless AI: apakah NPC benar-benar duduk?
 * Jalankan: node tools/sim-ai.mjs [detik]
 */

function makeCtx(canvas) {
  const store = { canvas };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "createImageData") {
        return (w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
      }
      if (k === "getImageData") {
        return (x = 0, y = 0, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
      }
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

const SECONDS = Number(process.argv[2] || 180);
const scene = new THREE.Scene();
const building = new Building(scene);
building.build();
const crew = new Crew({ scene, building });
crew.populate(14);

const all = () => crew.members.concat(building.staffRoster.map((s) => s.critter));
const dt = 1 / 60;
const steps = Math.round(SECONDS / dt);

const satSeats = new Map();      // seat id → berapa kali dipakai duduk
const statusCount = new Map();
let everSat = 0;
let maxSat = 0;

for (let i = 0; i < steps; i++) {
  const el = i * dt;
  building.update(dt, el);
  crew.update(dt, el);

  let now = 0;
  for (const c of all()) {
    if (c.sitting) {
      now++;
      const seat = building.seats.find((s) => Math.abs(s.sit.x - c.position.x) < 0.12 && Math.abs(s.sit.z - c.position.z) < 0.12);
      if (seat) satSeats.set(seat.id, (satSeats.get(seat.id) || 0) + 1);
    }
  }
  maxSat = Math.max(maxSat, now);
  everSat += now;

  for (const c of all()) {
    const key = c.status || "-";
    statusCount.set(key, (statusCount.get(key) || 0) + 1);
  }
}

const total = steps * all().length;
console.log(`durasi simulasi: ${SECONDS}s, kritter: ${all().length}`);
console.log(`rata-rata duduk: ${((everSat / total) * 100).toFixed(1)}%   puncak: ${maxSat}`);
console.log(`kursi yang pernah diduduki: ${satSeats.size} / ${building.seats.length}`);
const perType = {};
const never = [];
for (const s of building.seats) {
  const hit = satSeats.has(s.id);
  perType[s.type] = perType[s.type] || { dipakai: 0, total: 0 };
  perType[s.type].total++;
  if (hit) perType[s.type].dipakai++;
  else never.push(`${s.id}(${s.type},${building.roomAt(s.x, s.z)})`);
}
console.log("per tipe kursi:", perType);
console.log(`tak pernah dipakai (${never.length}): ${never.join(" ")}`);
const claimLeak = building.seats.filter((s) => s.taken);
console.log(`kursi masih ter-klaim di akhir: ${claimLeak.length} (${claimLeak.map((s) => s.id).join(",")})`);
console.log("");
console.log("status tersering:");
[...statusCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([k, v]) => {
  console.log(`  ${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
});
