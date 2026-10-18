/* Cari unit mana yang bisa diduplikat aman (uji jalur copyGroup + confirm). */
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
const { EditMode } = await import("../src/systems/EditMode.js");
const scene = new THREE.Scene();
const b = new Building(scene);
b.build();
b.dynamicBodies = [];
const em = new EditMode({ scene, building: b, rig: {}, fx: null, hud: {} });

const seen = new Set();
for (const s of b.seats) {
  const chair = s.obstacle?.owner?.userData?.editItem;
  if (!chair) continue;
  const g = b.groupOf(chair);
  if (g.length < 2 || seen.has(chair.id)) continue;
  seen.add(chair.id);
  const anchor = g[0];
  const t0 = Date.now();
  const copy = b.copyGroup(
    anchor,
    (dx, dz) => em.groupCopyOk(anchor, dx, dz),
    (a) => { b.refreshNav(); if (!em.groupPlacementOk(a)) return false; return em.allSeatsOk(); },
  );
  const ms = Date.now() - t0;
  if (copy) {
    const gg = b.groupOf(copy);
    const cc = gg.find((m) => m.seats?.length);
    console.log(`OK ${anchor.id}+${chair.id} -> ${gg.map((m) => m.id).join(",")} seat=${cc ? !!b.approachTo(cc.seats[0]) : "-"} (${ms}ms)`);
    for (const m of gg) { b.unlinkProp(m); b.deleteProp(m); }
    b.refreshNav();
  } else {
    console.log(`-- ${anchor.id}+${chair.id} tidak ada tempat (${ms}ms)`);
  }
}
