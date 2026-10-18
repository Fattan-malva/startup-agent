/* Uji simpan → muat ulang: unit meja+kursi + duplikat tetap utuh. */
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
const fails = [];
const check = (ok, m) => { if (!ok) fails.push(m); };

// pilih unit developer, geser + duplikat
const seat = b.seats.find((s) => b.roomAt(s.x, s.z) === "developer" && s.type === "desk");
const anchor = b.groupOf(seat.obstacle.owner.userData.editItem)[0];
const home = { x: anchor.x, z: anchor.z };
b.moveGroup(anchor, anchor.x, anchor.z + 0.2);
b.refreshNav();
if (!em.groupPlacementOk(anchor) || !em.allSeatsOk()) {
  b.moveGroup(anchor, home.x, home.z);
  b.refreshNav();
  console.log("geser uji ditolak oleh validasi (benar) — tetap di posisi awal");
}
const copy = b.copyGroup(
  anchor,
  (dx, dz) => em.groupCopyOk(anchor, dx, dz),
  (a) => { b.refreshNav(); if (!em.groupPlacementOk(a)) return false; return em.allSeatsOk(); },
);
check(!!copy, "duplikat gagal dibuat");
const copyGroupIds = copy ? b.groupOf(copy).map((m) => m.id) : [];
const anchorPos = { x: anchor.x, z: anchor.z };
const copyPos = copy ? { x: copy.x, z: copy.z } : null;

const saved = b.serializeEdits();
const json = JSON.stringify(saved);
console.log("simpanan:", json.slice(0, 240) + (json.length > 240 ? " …" : ""));
check(saved.add?.some((a) => a.grp), "add tidak menyimpan grp");
console.log("add:", saved.add);
console.log("items kunci:", Object.keys(saved.items));

// bangun ulang dari nol (seperti reload) lalu terapkan
const b2 = new Building(new THREE.Scene());
b2.build();
b2.dynamicBodies = [];
const em2 = new EditMode({ scene: b2.scene, building: b2, rig: {}, fx: null, hud: {} });
const n = b2.applyEdits(JSON.parse(json));
check(n > 0, "applyEdits tidak menerapkan apa pun");
const a2 = b2._editById.get(anchor.id);
check(Math.abs(a2.x - anchorPos.x) < 1e-3 && Math.abs(a2.z - anchorPos.z) < 1e-3, "posisi anchor tidak kembali");
const copies = b2.editList().filter((it) => it.isCopy);
check(copies.length >= 2, `jumlah salinan setelah muat = ${copies.length}`);
const g2 = copies.length ? b2.groupOf(copies.find((c) => c.seats?.length)) : [];
check(g2.length >= 2, `salinan tidak tergabung setelah muat (${g2.length})`);
const cA = b2.editById = copies.find((c) => c.id === (copyGroupIds[0] || ""));
if (copyPos && a2) {
  const cB = b2._editById.get(copyGroupIds[1]);
  check(!!cB, "kursi salinan tidak ada setelah muat");
  if (cB) {
    const d = Math.hypot(cB.x - (copyPos.x + (cB.x - cB.x)), cB.z - copyPos.z);
    console.log("kursi salinan setelah muat:", cB.x.toFixed(2), cB.z.toFixed(2), "seat?", !!cB.seats?.length);
  }
}
// semua kursi masih bisa diakses?
let bad = 0;
for (const s of b2.seats) if (!b2.approachTo(s)) bad++;
console.log(`kursi tak bisa diakses setelah muat: ${bad}/${b2.seats.length}`);
check(bad === 0, "ada kursi tak bisa diakses setelah muat");

console.log(fails.length ? `GAGAL (${fails.length}):` : "SEMUA OK");
for (const f of fails) console.log("  - " + f);
