/* Diagnostik sementara: apakah peserta rapat benar-benar duduk? */
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
const { Meeting } = await import("../src/systems/AI.js");
const { DEFAULT_EDITS } = await import("../src/world/defaultEdits.js");

const scene = new THREE.Scene();
const building = new Building(scene);
building.build();
building.applyEdits(DEFAULT_EDITS);
building.bakeHome();
building.refreshNav();
const crew = new Crew({ scene, building });
crew.populate(14);
const meeting = new Meeting({ building, crew });
console.log("start:", meeting.start());
console.log("peserta:", meeting.parts.length, "duduk:", meeting.parts.filter((p) => p.mode === "sit").length, "berdiri:", meeting.parts.filter((p) => p.mode === "stand").length);
for (const p of meeting.parts.filter((p) => p.mode === "sit")) {
  const app = building.approachTo(p.seat);
  const path = app ? building.route(p.c.position, app, p.c) : [];
  console.log("probe", p.seat.id, p.c.position.x.toFixed(2), p.c.position.z.toFixed(2),
    "room", building.roomAt(p.c.position.x, p.c.position.z),
    "app", app ? `${app.x.toFixed(2)},${app.z.toFixed(2)}` : "-",
    "path", path.length,
    "walk", building.walkableAt(p.c.position.x, p.c.position.z, 0.22, true));
}
const dt = 1 / 60;
const prevRetry = new Map();
for (let i = 0; i < 90 * 60; i++) {
  const el = i * dt;
  building.update(dt, el);
  crew.update(dt, el);
  const before = meeting.parts.map((p) => ({ mode: p.mode, seat: p.seat?.id, retries: p.retries }));
  meeting.update(dt);
  meeting.parts.forEach((p, k) => {
    const b0 = before[k];
    const pr = prevRetry.get(p) ?? 0;
    if (p.retries !== pr && p.retries > 0 && p.seat) {
      const app = building.approachTo(p.seat);
      const spot = p.seat.sit;
      const ign = building.seatIgnore(p.seat);
      const clear = building._lineFree(p.c.position.x, p.c.position.z, spot.x, spot.z, 0.24, ign)
        && building.isFree(spot.x, spot.z, 0.24, ign);
      const dapp = app ? Math.hypot(app.x - p.c.position.x, app.z - p.c.position.z) : -1;
      console.log(`  retry ${p.seat.id} #${p.retries} pos=${p.c.position.x.toFixed(2)},${p.c.position.z.toFixed(2)} app=${app ? `${app.x.toFixed(2)},${app.z.toFixed(2)}` : "-"} dapp=${dapp.toFixed(2)} clear=${clear} distSit=${Math.hypot(spot.x - p.c.position.x, spot.z - p.c.position.z).toFixed(2)}`);
    }
    prevRetry.set(p, p.retries);
    if (b0.mode === "sit" && p.mode !== "sit") {
      console.log(`t=${el.toFixed(1)} ${b0.seat} seat=${p.seat?.id} ${b0.mode}→${p.mode} retry=${p.retries} pathFailed=${p.c.pathFailed} pos=${p.c.position.x.toFixed(2)},${p.c.position.z.toFixed(2)} status=${p.c.status} sitting=${p.c.sitting} seating=${p.c._seating}`);
    }
  });
}
console.log("akhir duduk:", meeting.parts.filter((p) => p.c.sitting).length, "/", meeting.parts.length);
meeting.parts.forEach((p, i) => {
  console.log(i, p.mode, p.stage, p.seat?.id || "-", p.c.status, p.c.position.x.toFixed(2), p.c.position.z.toFixed(2));
});
