/* Diagnostik unit edit (meja+kursi): geser, putar, duplikat, hapus.
 * node tools/diag-groups.mjs
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
function makeCanvas() { const c = { width: 256, height: 256, style: {} }; c.getContext = () => makeCtx(c); return c; }
globalThis.document = {
  createElement(tag) { return tag === "canvas" ? makeCanvas() : { style: {}, appendChild() {}, addEventListener() {}, setAttribute() {} }; },
  createElementNS(_n, tag) { return this.createElement(tag); },
  body: { appendChild() {}, style: {} },
};

const THREE = await import("three");
const { Building } = await import("../src/world/Building.js");

const scene = new THREE.Scene();
const b = new Building(scene);
b.build();
b.dynamicBodies = [];

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

// Cari semua workstation: item yang punya kursi + grup > 1
const seats = b.seats;
const grouped = new Map();
for (const s of seats) {
  const chair = s.obstacle?.owner?.userData?.editItem;
  if (!chair) continue;
  const g = b.groupOf(chair);
  if (g.length > 1) grouped.set(chair.id, { chair, g, seat: s });
}
console.log(`kursi yang tergabung dengan meja: ${grouped.size}`);
for (const [id, { g }] of grouped) {
  console.log(`  ${id.padEnd(6)} grup [${g.map((m) => m.id).join(", ")}]`);
}

// 1) geser unit HR (desk+chair) ke utara
const hr = [...grouped.values()].find((v) => b.roomAt(v.chair.x, v.chair.z) === "hr");
if (!hr) {
  fails.push("tidak menemukan unit HR");
} else {
  const anchor = hr.g[0];
  const chair = hr.chair;
  const before = { ax: anchor.x, az: anchor.z, cx: chair.x, cz: chair.z, ry: anchor.ry };
  b.moveGroup(anchor, anchor.x, anchor.z - 0.35);
  check(Math.abs(anchor.z - (before.az - 0.35)) < 1e-6, "anchor tidak bergeser");
  check(Math.abs(chair.z - (before.cz - 0.35)) < 1e-6 && Math.abs(chair.x - before.cx) < 1e-6, "kursi tidak ikut bergeser");
  check(!!b.approachTo(chair.seats[0]), "kursi HR jadi tidak bisa diakses setelah digeser");
  // 2) putar unit 90°
  const bx = chair.x, bz = chair.z;
  b.rotateGroup(anchor, anchor.ry + Math.PI / 2);
  const moved = Math.hypot(chair.x - bx, chair.z - bz);
  check(moved > 0.3, "kursi tidak ikut berputar mengelilingi meja");
  check(!!b.approachTo(chair.seats[0]), "kursi HR jadi tidak bisa diakses setelah diputar");
  // balikkan
  b.rotateGroup(anchor, before.ry);
  b.moveGroup(anchor, before.ax, before.az);
  check(Math.abs(anchor.z - before.az) < 1e-6, "reset posisi anchor gagal");
  check(Math.abs(chair.z - before.cz) < 1e-6, "reset posisi kursi gagal");
}

// 3) duplikat unit (pakai validator seperti Mode Edit) — pilih unit di
// ruang yang lebih lapang (developer) supaya ada tempat aman.
const devGrp = [...grouped.values()].find((v) => b.roomAt(v.chair.x, v.chair.z) === "developer");
if (devGrp) {
  const { EditMode } = await import("../src/systems/EditMode.js");
  const em = new EditMode({ scene, building: b, rig: {}, fx: null, hud: {} });
  const anchor = devGrp.g[0];
  const before = b.editList().length;
  const copy = b.copyGroup(
    anchor,
    (dx, dz) => em.groupCopyOk(anchor, dx, dz),
    (anchorCopy) => { b.refreshNav(); return em.groupPlacementOk(anchorCopy); },
  );
  check(!!copy, "duplikat unit gagal");
  if (copy) {
    const g = b.groupOf(copy);
    check(g.length > 1, `duplikat bukan unit (${g.length} anggota)`);
    const copyChair = g.find((m) => m.seats && m.seats.length);
    check(!!copyChair, "duplikat tidak punya kursi");
    if (copyChair) {
      check(!!b.approachTo(copyChair.seats[0]), "kursi duplikat tidak bisa diakses");
    }
    check(b.editList().length > before, "record duplikat tidak bertambah");
    // 4) hapus unit
    for (const m of g) b.deleteProp(m);
    check(g.every((m) => m.removed || !m.obj.parent), "hapus unit tidak menyembunyikan semua anggota");
  }
}

console.log(fails.length ? `GAGAL (${fails.length}):` : "SEMUA OK");
for (const f of fails) console.log("  - " + f);
