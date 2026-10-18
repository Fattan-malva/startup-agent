import * as THREE from "three";
import { MAT } from "../world/materials.js";

/* ===================================================================== *
 *  EditMode — tata ulang perabot ala editor.
 *
 *  Saat aktif, gedung membongkar mesh statis hasil merge (Building.
 *  setEditMode) sehingga setiap perabot bisa dipilih lewat raycast,
 *  digeser di bidang lantai, diputar, dan diganti materialnya. Perubahan
 *  disimpan otomatis ke localStorage dan bisa diekspor/impor sebagai JSON.
 *
 *  Interaksi pointer sengaja memakai state mentah dari Input (down /
 *  dragDistance / ndc) supaya bisa membedakan "klik memilih" dari
 *  "drag memindah" tanpa mengganggu kontrol kamera.
 * ===================================================================== */

const STORE_KEY = "atelier.edit.v1";
const SNAP = 0.25;              // grid snap (meter)
const PICK_PERIOD = 1 / 30;     // hover raycast throttle
const DRAG_THRESHOLD = 6;       // px sebelum drag dihitung drag
const BODY_MARGIN = 0.15;

const MAT_PALETTE = [
  ["deskTop", "Kayu terang"],
  ["darkWood", "Kayu gelap"],
  ["steel", "Baja"],
  ["blackMetal", "Logam hitam"],
  ["chrome", "Krom"],
  ["brass", "Kuningan"],
  ["plasticWhite", "Plastik putih"],
  ["plasticDark", "Plastik hitam"],
  ["concrete", "Beton"],
  ["terrazzo", "Terrazzo"],
  ["carpet", "Karpet"],
  ["rugNavy", "Karpet navy"],
  ["fabricNavy", "Kain navy"],
  ["fabricCharcoal", "Kain abu"],
  ["fabricSand", "Kain sand"],
  ["fabricRust", "Kain rust"],
  ["fabricOlive", "Kain olive"],
  ["terracotta", "Terakota"],
  ["grass", "Rumput"],
  ["gravel", "Kerikil"],
];

export class EditMode {
  constructor({ scene, building, rig, fx, hud, input = null }) {
    this.scene = scene;
    this.building = building;
    this.rig = rig;
    this.fx = fx;
    this.hud = hud;
    this.input = input;

    this.enabled = false;
    this.snap = false;
    this.selected = null;
    this.hovered = null;
    this.dragging = false;
    this.pressedItem = null; // perabot yang sedang ditekan (publik, dipakai main.js)

    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._tmp = new THREE.Vector3();
    this._box = new THREE.Box3();
    this._roots = [];

    this._prevDown = false;
    this._pressNdc = new THREE.Vector2();
    this._pressItem = null;
    this._grab = { x: 0, z: 0 };
    this._isWall = false;
    this._wallLock = "x";
    this._lockX = 0;
    this._lockZ = 0;
    this._dirty = false;
    this._timer = 0;

    this._selBox = new THREE.Box3Helper(new THREE.Box3(), 0xf0c46a);
    this._selBox.visible = false;
    this._selBox.renderOrder = 8;
    this._selBox.material.depthTest = false;
    this._selBox.material.transparent = true;
    this._selBox.material.opacity = 0.95;
    this.scene.add(this._selBox);
  }

  /* ----------------------------------------------------------- lifecycle */

  setInput(input) {
    this.input = input;
  }

  /** Susun ulang daftar akar raycast (setelah Duplikat/Hapus/Impor). */
  refreshRoots() {
    if (!this.enabled) { this._roots = []; return; }
    this._roots = this.building
      .editList()
      .filter((it) => it.obj && !it.removed && it.obj.parent && it.obj.visible !== false)
      .map((it) => it.obj);
    const sel = this.selected;
    if (sel && (!sel.obj || sel.removed || !sel.obj.parent || sel.obj.visible === false)) {
      this.select(null);
    }
  }

  setEnabled(on) {
    const next = !!on;
    if (next === this.enabled) return this.enabled;
    this.enabled = next;

    this.building.setEditMode(next);
    this.refreshRoots();
    if (!next) this._roots = [];

    const btn = this.hud.dom?.editBtn;
    if (btn) {
      btn.classList.toggle("is-accent", next);
      btn.textContent = next ? "Selesai Edit" : "Mode Edit";
    }

    this.hud.toggleEditBar(next);
    this.hud.setHint(
      next
        ? "Mode Edit: klik & drag perabot · ⟲⟳ putar ([ ]) · Duplikat/Hapus · Esc selesai"
        : "Drag untuk geser · scroll untuk zoom · klik pegawai untuk detail",
    );

    if (next) {
      this.hud.renderEditMats(this.materialPalette(), null);
      this.hud.setEditSnap(this.snap);
      this.hud.setEditTarget("Klik perabot untuk memilih");
      this.hud.toast("Mode Edit aktif — geser perabot sesukamu 🛠️", 2600);
    } else {
      this.select(null);
      this.dragging = false;
      this._pressItem = null;
      this.pressedItem = null;
      this._isWall = false;
      this._dirty = false;
      this._prevDown = false;
      this.fx?.setHover(null);
      this.hud.setCursor("default");
      this.snap = false;
      this.hud.setEditSnap(false);
      this.save();
      this.hud.toast("Mode Edit selesai — layout disimpan", 2400);
    }
    return this.enabled;
  }

  toggle() {
    return this.setEnabled(!this.enabled);
  }

  setSnap(on) {
    this.snap = !!on;
    return this.snap;
  }

  /* -------------------------------------------------------------- palette */

  materialPalette() {
    return MAT_PALETTE.map(([key, label]) => {
      const m = MAT[key];
      let color = "#8a8f96";
      try {
        if (m && m.color && m.color.getHexString) color = `#${m.color.getHexString()}`;
      } catch { /* material aneh — pakai warna fallback */ }
      return { key, label, color };
    });
  }

  /* --------------------------------------------------------------- update */

  update(dt) {
    if (!this.enabled || !this.input) return;
    const input = this.input;
    const down = input.down;

    if (down && !this._prevDown) this._press(input.ndc);
    if (down && this._pressItem && !this.dragging && input.dragDistance > DRAG_THRESHOLD) {
      this._beginDrag();
    }
    if (down && this.dragging) this._drag(input.ndc);
    if (!down && this._prevDown) this._release();
    this._prevDown = down;

    if (!down) {
      this._timer += dt;
      if (this._timer >= PICK_PERIOD) {
        this._timer = 0;
        const item = this._pick(input.ndc);
        this.hovered = item;
        const showObj = this.selected ? this.selected.obj : (item ? item.obj : null);
        this.fx?.setHover(showObj);
        this.hud.setCursor(item ? "grab" : "default");
      }
    }

    if (this.selected) this._refreshBox();
  }

  /* -------------------------------------------------------------- picking */

  _pick(ndc) {
    if (!this._roots.length) return null;
    this._ndc.set(ndc.x, ndc.y);
    this._ray.setFromCamera(this._ndc, this.rig.activeCamera);
    this._ray.far = 160;
    const hits = this._ray.intersectObjects(this._roots, true);
    for (const h of hits) {
      const item = this._itemOf(h.object);
      if (item) return item;
    }
    return null;
  }

  _itemOf(obj) {
    let n = obj;
    while (n) {
      if (n.userData && n.userData.editItem) return n.userData.editItem;
      n = n.parent;
    }
    return null;
  }

  /* ----------------------------------------------------------------- drag */

  _press(ndc) {
    this._pressNdc.copy(ndc);
    const item = this._pick(ndc);
    this._pressItem = item;
    this.pressedItem = item;
    // pilih langsung saat ditekan supaya kotak seleksi tampil dari awal
    this.select(item);
    if (!item) return;
    // benda yang menempel dinding digeser HANYA sepanjang dinding itu
    this._isWall = !!item.wallLocked;
    const q = ((Math.round(item.ry / (Math.PI / 2)) % 4) + 4) % 4;
    this._wallLock = q % 2 === 0 ? "z" : "x";
    this._lockX = item.x;
    this._lockZ = item.z;
  }

  _beginDrag() {
    const item = this._pressItem;
    if (!item) return;
    const g = this.rig.screenToGround(this._pressNdc.x, this._pressNdc.y, this._tmp);
    this._grab.x = g ? item.x - g.x : 0;
    this._grab.z = g ? item.z - g.z : 0;
    this.dragging = true;
    this.fx?.setHover(item.obj);
  }

  _drag(ndc) {
    const item = this._pressItem;
    if (!item) return;
    const g = this.rig.screenToGround(ndc.x, ndc.y, this._tmp);
    if (!g) return;
    let x = g.x + this._grab.x;
    let z = g.z + this._grab.z;
    if (this.snap) {
      x = Math.round(x / SNAP) * SNAP;
      z = Math.round(z / SNAP) * SNAP;
    }
    if (this._isWall) {
      if (this._wallLock === "z") z = this._lockZ;
      else x = this._lockX;
    }
    const b = this.building.bounds;
    x = THREE.MathUtils.clamp(x, b.x0 + BODY_MARGIN, b.x1 - BODY_MARGIN);
    z = THREE.MathUtils.clamp(z, b.z0 + BODY_MARGIN, b.z1 - BODY_MARGIN);
    this.building.moveProp(item, x, z);
    item.obj.updateMatrixWorld(true);
    this.fx?.setHover(item.obj);
    this._dirty = true;
    this._readout();
  }

  _release() {
    const item = this._pressItem;
    if (this.dragging) {
      this.dragging = false;
      if (this._dirty) this.save();
      this._dirty = false;
      if (item) this.select(item);
    } else if (item) {
      this.select(item);
    }
    this._pressItem = null;
    this.pressedItem = null;
  }

  /* ------------------------------------------------------------ selection */

  select(item) {
    this.selected = item || null;
    if (!item) {
      this._selBox.visible = false;
      this.hud.setEditTarget("Klik perabot untuk memilih");
      this.hud.renderEditMats(this.materialPalette(), null);
      return;
    }
    this._selBox.visible = true;
    this.hud.renderEditMats(this.materialPalette(), item.matKey);
    this._readout();
    this._refreshBox();
  }

  _readout() {
    const item = this.selected;
    if (!item) return;
    const label = item.label || item.obj.userData.interactionLabel || item.obj.name || "Perabot";
    const deg = Math.round((((item.ry * 180) / Math.PI) % 360 + 360) % 360);
    this.hud.setEditTarget(
      `${label} · x ${item.x.toFixed(2)} · z ${item.z.toFixed(2)} · ${deg}°`,
    );
  }

  _refreshBox() {
    const item = this.selected;
    if (!item || !item.obj.parent) {
      this._selBox.visible = false;
      return;
    }
    this._box.setFromObject(item.obj);
    if (this._box.isEmpty()) {
      this._selBox.visible = false;
      return;
    }
    this._selBox.box.copy(this._box);
    this._selBox.visible = true;
    this._selBox.updateMatrixWorld(true);
  }

  /* --------------------------------------------------------------- actions */

  rotateSelected(deg) {
    const item = this.selected;
    if (!item) {
      this.hud.toast("Pilih perabot dulu", 1400);
      return;
    }
    this.building.rotateProp(item, item.ry + (deg * Math.PI) / 180);
    this._readout();
    this.save();
  }

  applyMaterial(key) {
    const item = this.selected;
    if (!item) {
      this.hud.toast("Pilih perabot dulu", 1400);
      return;
    }
    this.building.setPropMaterial(item, key);
    this.hud.renderEditMats(this.materialPalette(), key);
    this.save();
  }

  resetSelected() {
    const item = this.selected;
    if (!item) {
      this.hud.toast("Pilih perabot dulu", 1400);
      return;
    }
    this.building.resetProp(item);
    this.refreshRoots();
    this.hud.renderEditMats(this.materialPalette(), null);
    this._readout();
    this.save();
  }

  resetAll() {
    this.building.resetAllEdits();
    this.refreshRoots();
    this.select(null);
    this.save();
    this.hud.toast("Semua perabot kembali ke posisi awal", 2400);
  }

  copySelected() {
    const item = this.selected;
    if (!item) {
      this.hud.toast("Pilih perabot dulu, lalu Duplikat", 1600);
      return;
    }
    const copy = this.building.copyProp(item);
    if (!copy) {
      this.hud.toast("Gagal menduplikat perabot", 1800);
      return;
    }
    this.refreshRoots();
    this.select(copy);
    this.save();
    const label = copy.label || "Perabot";
    this.hud.toast(`${label} diduplikat — geser ke tempat baru`, 2200);
  }

  deleteSelected() {
    const item = this.selected;
    if (!item) {
      this.hud.toast("Pilih perabot dulu, lalu Hapus", 1600);
      return;
    }
    const label = item.label || "Perabot";
    const ok = this.building.deleteProp(item);
    if (!ok) return;
    this.refreshRoots();
    this.select(null);
    this.save();
    this.hud.toast(`${label} dihapus — "Reset semua" untuk mengembalikan`, 2400);
  }

  /* ----------------------------------------------------------- persistence */

  save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.building.serializeEdits()));
    } catch { /* storage penuh/diblokir — abaikan */ }
  }

  loadSaved() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return 0;
      const data = JSON.parse(raw);
      const n = this.building.applyEdits(data);
      if (n) this._loaded = n;
      return n;
    } catch {
      return 0;
    }
  }

  exportEdits() {
    try {
      const data = this.building.serializeEdits();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `atelier-tata-ruang-${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.hud.toast("Layout diekspor ke file JSON", 2200);
    } catch (err) {
      console.error(err);
      this.hud.toast("Gagal mengekspor layout", 2400);
    }
  }

  async importEdits(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      this.building.resetAllEdits();
      const n = this.building.applyEdits(data);
      this.refreshRoots();
      this.save();
      this.select(null);
      this.hud.toast(`Layout diimpor — ${n} perabot diproses`, 2600);
    } catch (err) {
      console.error(err);
      this.hud.toast("Gagal membaca file layout", 2600);
    }
  }
}
