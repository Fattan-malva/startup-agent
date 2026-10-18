/* Uji bake: simpanan awal kosong, reset kembali ke layout bawaan. */
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
const { DEFAULT_EDITS } = await import("../src/world/defaultEdits.js");

const b = new Building(new THREE.Scene());
b.build();
b.applyEdits(DEFAULT_EDITS);
b.bakeHome();
b.refreshNav();
const fails = [];
const check = (ok, m) => { if (!ok) fails.push(m); };

let s = b.serializeEdits();
console.log("simpanan awal:", JSON.stringify(s).slice(0, 160));
check(Object.keys(s.items).length === 0, `items awal harus kosong (${Object.keys(s.items).length})`);
check((s.del || []).length === DEFAULT_EDITS.del.length, "daftar del awal tidak sama");

// geser unit HR → harus tercatat
const hr = b._editById.get("p133");
const z0 = hr.z;
b.moveGroup(hr, hr.x, hr.z + 0.3);
b.refreshNav();
s = b.serializeEdits();
check(s.items.p133 && s.items.p134, "geser unit HR tidak tercatat");
console.log("setelah geser p133:", s.items.p133, "p134:", s.items.p134);

// reset pilihan → kembali ke layout bawaan
for (const m of b.groupOf(hr)) b.resetProp(m);
b.refreshNav();
check(Math.abs(hr.z - z0) < 1e-6, `resetProp tidak kembali (${hr.z} vs ${z0})`);

// reset total → posisi & del sama dengan bawaan
b.resetAllEdits();
b.applyEdits(DEFAULT_EDITS);
b.refreshNav();
const hr2 = b._editById.get("p133");
check(Math.abs(hr2.z - z0) < 1e-6, "reset total tidak kembali ke layout bawaan");
check(b._editById.get("p90").removed, "item yang dihapus layout bawaan tidak terhapus lagi");

console.log(fails.length ? `GAGAL (${fails.length}):` : "SEMUA OK");
for (const f of fails) console.log("  - " + f);
