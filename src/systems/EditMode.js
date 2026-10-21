import * as THREE from "three";
import { MAT } from "../world/materials.js";
import { DEFAULT_EDITS } from "../data/defaultEdits.js";
import { STAFF, persistStaff } from "../data/staff.js";

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

// Tata ruang disimpan sebagai modul di repo (bukan localStorage).
// Dev server menulis src/data/defaultEdits.js lewat endpoint ini.
const LAYOUT_URL = "/__layout";
/* Petak seragam untuk SEMUA perabot, sama persis dengan ukuran sel
 * navgrid karakter (Building._navEnsure → cell = 0.25 m).
 *
 * Dulu tiap perabot memakai snap miliknya sendiri (5/10/25/50 cm) sesuai
 * ukurannya, sehingga tepi perabot mendarat di posisi yang tidak sejajar
 * sel nav. Akibatnya tersisa sel "setengah terblokir" di mana isFree() di
 * pusat sel bisa goyah — itulah yang membuat karakter nyangkut, tidak
 * bisa berdiri lagi setelah duduk, atau tersendat di sempit perabot.
 *
 * Dengan satu ukuran petak yang sama dengan grid jalan, tepi perabot
 * selalu jatuh tepat di garis sel nav → peta jalur selalu rapi dan
 * deterministik. Geser/pindah barang juga jadi per petak 25 cm. */
const PETAK = 0.25;              // meter — sinkron dengan Building nav cell
const SNAP = PETAK;              // alias lama (dipertahankan untuk kompatibilitas)
const PICK_PERIOD = 1 / 30;     // hover raycast throttle
const DRAG_THRESHOLD = 6;       // px sebelum drag dihitung drag
const BODY_MARGIN = 0.15;

/* Petak (grid) untuk Mode Edit: garis halus 5 cm, sedang 25 cm, dan
 * garis utama 1 m — supaya penempatan presisi dan perabot selalu
 * duduk rapi di atas petak. */
const GRID_STEPS = [
  [0.05, 0x9fb6c9, 0.055],
  [0.25, 0xbfd4e6, 0.11],
  [1.0, 0xf0c46a, 0.17],
];

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
  constructor({ scene, building, rig, fx, hud, input = null, crew = null }) {
    this.scene = scene;
    this.building = building;
    this.rig = rig;
    this.fx = fx;
    this.hud = hud;
    this.input = input;
    this.crew = crew;

    this.enabled = false;
    this.snap = true;
    this.selected = null;
    this.hovered = null;
    this.dragging = false;
    this.pressedItem = null; // perabot yang sedang ditekan (publik, dipakai main.js)

    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._aim = new THREE.Vector2();
    this._tmp = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._box = new THREE.Box3();
    this._mBox = new THREE.Box3();
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

    // petak-petak lantai (hanya tampil di Mode Edit)
    this._grids = GRID_STEPS.map(([step, color, opacity]) => this._makeGrid(step, color, opacity));
    // Petak milik perabot terpilih: footprint-nya digambar sebagai petak
    // kecil sesuai skala snap perabot itu. Hijau = aman ditempatkan,
    // merah = bertabrakan / menutup jalan.
    this._footMat = new THREE.LineBasicMaterial({
      color: 0x35d07a, transparent: true, opacity: 0.95, depthTest: false,
    });
    const cellGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5),
      new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5),
    ]);
    this._footCells = [];
    for (let i = 0; i < 320; i++) {
      const cell = new THREE.LineLoop(cellGeo, this._footMat);
      cell.visible = false;
      cell.renderOrder = 9;
      this.scene.add(cell);
      this._footCells.push(cell);
    }
    this._placeOk = true;
    this._safe = null;   // posisi terakhir yang aman (untuk revert)

    /* Riwayat undo/redo: snapshot tata ruang (serializeLayout) tiap aksi.
     * Ctrl+Z / tombol Undo mengembalikan keadaan sebelum aksi terakhir. */
    this._undoStack = [];
    this._redoStack = [];
    this._undoLimit = 60;

    // Ctrl+Z / Ctrl+Y (atau Ctrl+Shift+Z) → undo / redo saat Mode Edit aktif
    this._onKey = (e) => {
      if (!this.enabled) return;
      if (e.target && e.target.tagName === "INPUT") return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = (e.key || "").toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        this.redo();
      }
    };
    window.addEventListener("keydown", this._onKey);
  }

  /* ------------------------------------------------------------- undo/redo */

  /** Snapshot lengkap: tata ruang + penempatan meja staf. */
  _capture() {
    return {
      layout: this.building.serializeLayout(),
      desks: STAFF.map((s) => ({ id: s.id, deskId: s.deskId })),
    };
  }

  /** Simpan snapshot SEBELUM aksi supaya bisa dibatalkan. */
  _snapshot() {
    try {
      this._undoStack.push(this._capture());
      if (this._undoStack.length > this._undoLimit) this._undoStack.shift();
      this._redoStack.length = 0;
      this._syncUndoBtn();
    } catch (e) {
      console.warn("[EditMode] gagal membuat snapshot undo", e);
    }
  }

  _syncUndoBtn() {
    const btn = this.hud?.dom?.editUndo;
    if (btn) btn.disabled = !this._undoStack.length;
    const rbtn = this.hud?.dom?.editRedo;
    if (rbtn) rbtn.disabled = !this._redoStack.length;
  }

  /** Kembalikan tata ruang + penempatan meja staf ke snapshot tersimpan. */
  _applySnapshot(snap) {
    const data = snap?.layout || snap;
    this.building.applyEdits(data, true);
    // meja staf ikut dikembalikan (mis. setelah meja dihapus lalu di-undo)
    if (Array.isArray(snap?.desks)) {
      for (const d of snap.desks) {
        const s = STAFF.find((x) => x.id === d.id);
        if (s) s.deskId = d.deskId;
      }
      persistStaff();
    }
    this.building.refreshNav();
    this.refreshRoots();
    this.select(null);
    this.crew?.syncStaffDesks?.();
    this._placeOk = true;
    this._refreshBox();
  }

  undo() {
    if (!this._undoStack.length) {
      this.hud?.toast("Tidak ada yang bisa dibatalkan", 1600);
      return false;
    }
    const snap = this._undoStack.pop();
    this._redoStack.push(this._capture());
    this._applySnapshot(snap);
    this._syncUndoBtn();
    this.save();
    this.hud?.toast("Dibatalkan ↩️", 1600);
    return true;
  }

  redo() {
    if (!this._redoStack.length) {
      this.hud?.toast("Tidak ada yang bisa diulang", 1600);
      return false;
    }
    const snap = this._redoStack.pop();
    this._undoStack.push(this._capture());
    this._applySnapshot(snap);
    this._syncUndoBtn();
    this.save();
    this.hud?.toast("Diulang ↪️", 1600);
    return true;
  }

  /** Buat satu lapis garis petak di atas lantai, dibatasi footprint gedung. */
  _makeGrid(step, color, opacity) {
    const b = this.building.bounds;
    const pts = [];
    const eps = 1e-6;
    for (let x = Math.ceil(b.x0 / step) * step; x <= b.x1 + eps; x += step) {
      pts.push(x, 0, b.z0, x, 0, b.z1);
    }
    for (let z = Math.ceil(b.z0 / step) * step; z <= b.z1 + eps; z += step) {
      pts.push(b.x0, 0, z, b.x1, 0, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity, depthWrite: false,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.position.y = 0.018;
    lines.renderOrder = 2;
    lines.visible = false;
    this.scene.add(lines);
    return lines;
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
      // tombol dock berupa ikon — jangan ganti textContent (ikon hilang)
      btn.classList.toggle("is-active", next);
      btn.title = next ? "Selesai Edit" : "Mode Edit";
    }

    this.hud.toggleEditBar(next);
    this.hud.setHint(
      next
        ? "Mode Edit: klik & drag perabot · ⟲⟳ putar ([ ]) · Duplikat/Hapus · B atau Esc selesai"
        : "Drag untuk geser · scroll untuk zoom · klik pegawai untuk detail",
    );
    // Keluar Mode Edit saat masih di dalam tubuh (POV) → pulihkan petunjuk
    // first-person, jangan tinggalkan teks mode isometrik.
    if (!next && this.hud.firstPerson) this.hud.setFirstPerson(true);

    if (next) {
      this.snap = true;
      for (const g of this._grids) g.visible = true;
      this.hud.renderEditMats(this.materialPalette(), null);
      this.hud.setEditSnap(this.snap);
      this.hud.setEditTarget("Klik perabot untuk memilih");
      this._syncUndoBtn();
      this.hud.toast(
        this.input?.locked
          ? "Mode Edit POV — bidik perabot dengan crosshair, tahan tombol untuk menggeser. Esc = lepas kursor 🛠️"
          : "Mode Edit aktif — petak seragam 25 cm, sejajar grid jalan karakter 🛠️",
        2800,
      );
    } else {
      for (const g of this._grids) g.visible = false;
      this._hideFootCells();
      // Drag yang masih jalan harus DIBATASI: kalau tidak, tahanan grid
      // navigasi tetap aktif → grid jadi basi → karakter bisa menembus
      // dinding/perabot selamanya.
      if (this.dragging || this._pressItem) this._release();
      this.building?.resumeNav();
      this.building?.refreshNav();
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
    if (this.selected) this._refreshBox();
    else this._hideFootCells();
    return this.snap;
  }

  /* ------------------------------------------------------- petak & aman */

  /**
   * Ukuran petak snap milik perabot — SERAGAM untuk semua perabot:
   * selalu0,25 m, sejajar dengan sel navgrid karakter (Building nav cell).
   *
   * Dulu ukurannya diturunkan dari footprint (5/10/25/50 cm), sehingga
   * perabot kecil punya petak kecil dan perabot besar petak besar — tepi
   * mereka tidak pernah sejajar dengan grid lantai/nav, dan sisa sel
   * "setengah terblokir" bikin karakter nyangkut. Sekarang satu ukuran
   * untuk semua: tepi perabot selalu jatuh di garis sel nav yang sama.
   */
  snapStep() {
    return PETAK;
  }

  /** Selaraskan SISI perabot (bukan pusatnya) ke garis petak. */
  _snapEdge(v, size, step) {
    return Math.round((v - size / 2) / step) * step + size / 2;
  }

  _footprint(item, ry) {
    const f = item.fp || { w: 0.7, d: 0.7 };
    const q = ((Math.round(ry / (Math.PI / 2)) % 4) + 4) % 4;
    const swap = q % 2 === 1;
    return { w: (swap ? f.d : f.w) || 0.7, d: (swap ? f.w : f.d) || 0.7 };
  }

  /** Kotak perabot pada posisi/rotasi hipotetis. */
  _boxAt(item, x, z, ry) {
    const f = this._footprint(item, ry);
    return {
      minX: x - f.w / 2, maxX: x + f.w / 2,
      minZ: z - f.d / 2, maxZ: z + f.d / 2,
      w: f.w, d: f.d,
    };
  }

  /** Bertabrakan dengan dinding/perabot lain? (cepat, tanpa cek kursi) */
  overlapsSolid(item, x, z, ry, margin = 0.015, own = item.obstacle, ignore = null) {
    const box = this._boxAt(item, x, z, ry);
    const b = this.building.bounds;
    if (box.minX < b.x0 + 0.04 || box.maxX > b.x1 - 0.04 ||
        box.minZ < b.z0 + 0.04 || box.maxZ > b.z1 - 0.04) return true;
    // kursi memang "menyelip" ke meja/meja kopi → jangan dianggap tabrakan
    const allowed = new Set();
    if (item.seats) {
      for (const s of item.seats) for (const o of s.overlaps || []) allowed.add(o);
    }
    for (const o of this.building.obstacles) {
      // collider milik perabot INI SENDIRI (mis. kotak tiap kursi pada unit
      // meja+kursi) bukan tabrakan — unit memang satu kesatuan.
      if (o === own || o.owner === item.obj || allowed.has(o) || (ignore && ignore.has(o))) continue;
      if (o.kind !== "wall" && !o.blocked) continue;
      if (box.minX >= o.maxX - margin || box.maxX <= o.minX + margin ||
          box.minZ >= o.maxZ - margin || box.maxZ <= o.minZ + margin) continue;
      return true;
    }
    return false;
  }

  /** Apakah titik duduk perabot ini masih bisa dicapai setelah dipindah? */
  seatsReachable(item, x, z, ry, ignore = null) {
    if (!item.seats || !item.seats.length) return true;
    const b = this.building;
    const box = this._boxAt(item, x, z, ry);
    const fake = { ...box, owner: item.obj, kind: "prop", blocked: true, label: "perabot" };
    const dRy = ry - item.ry;
    const c = Math.cos(dRy), s = Math.sin(dRy);
    const ringIgn = ignore ? [...ignore] : null;
    for (const seat of item.seats) {
      const dx = seat.x - item.x;
      const dz = seat.z - item.z;
      const sx = x + dx * c + dz * s;
      const sz = z - dx * s + dz * c;
      const syaw = (seat.yaw ?? 0) + dRy;
      // vektor duduk relatif terhadap pusat kursi (ikut rotasi)
      const sdx = (seat.sit?.x ?? seat.x) - seat.x;
      const sdz = (seat.sit?.z ?? seat.z) - seat.z;
      const sit = {
        x: sx + sdx * c + sdz * s,
        z: sz - sdx * s + sdz * c,
      };
      const ign = [fake, seat.obstacle || item.obstacle, ...(seat.overlaps || [])].filter(Boolean);
      const room = b.roomAt(sx, sz);
      if (!b.isFree(sit.x, sit.z, 0.24, ign)) return false;
      let ok = false;
      for (const r of [0.78, 0.92, 1.08, 1.24]) {
        for (let i = 0; i < 12; i++) {
          const a = syaw + Math.ceil(i / 2) * (Math.PI / 6) * (i % 2 ? 1 : -1);
          const px = sx + Math.sin(a) * r;
          const pz = sz + Math.cos(a) * r;
          if (b.roomAt(px, pz) !== room) continue;
          // titik pijak harus benar-benar di luar footprint perabot ini
          // (pakai jarak ke kotak, bukan selisih sumbu — sudut kotak aman)
          const kx = Math.max(fake.minX, Math.min(px, fake.maxX));
          const kz = Math.max(fake.minZ, Math.min(pz, fake.maxZ));
          if ((px - kx) ** 2 + (pz - kz) ** 2 < 0.30 * 0.30) continue;
          if (!b.isFree(px, pz, 0.30, ringIgn)) continue;
          if (!b.walkableAt(px, pz, 0.22, true)) continue;
          if (!b._lineFree(px, pz, sit.x, sit.z, 0.24, [...ign, ...(ringIgn || [])])) continue;
          ok = true;
          break;
        }
        if (ok) break;
      }
      if (!ok) return false;
    }
    return true;
  }

  /** Validasi: cukup tidak menabrak perabot lain (petak). Path/kursi
   *  dibiarkan ke NavMesh — karakter akan mencari jalan alternatif. */
  placementOk(item, x, z, ry = item.ry, own = item.obstacle, ignore = null) {
    return !this.overlapsSolid(item, x, z, ry, 0.015, own, ignore);
  }

  /** Validasi seluruh unit edit (meja+kursi) pada posisi saat ini. */
  groupPlacementOk(item) {
    const g = this.building.groupOf(item);
    if (g.length <= 1) return this.placementOk(item, item.x, item.z, item.ry);
    const ignore = new Set(g.map((m) => m.obstacle).filter(Boolean));
    for (const m of g) {
      ignore.delete(m.obstacle);
      const bad = this.overlapsSolid(m, m.x, m.z, m.ry, 0.015, m.obstacle, ignore);
      ignore.add(m.obstacle);
      if (bad) return false;
    }
    return true;
  }

  /** Cek cepat (tanpa jalur) untuk saat drag — cukup tabrakan fisik. */
  groupOverlapOnly(item) {
    const g = this.building.groupOf(item);
    if (g.length <= 1) {
      return !this.overlapsSolid(item, item.x, item.z, item.ry);
    }
    const ignore = new Set(g.map((m) => m.obstacle).filter(Boolean));
    for (const m of g) {
      ignore.delete(m.obstacle);
      const bad = this.overlapsSolid(m, m.x, m.z, m.ry, 0.015, m.obstacle, ignore);
      ignore.add(m.obstacle);
      if (bad) return false;
    }
    return true;
  }

  /**
   * Cek tabrakan pada posisi KANDIDAT (belum dipindahkan). Dipakai saat
   * drag supaya perabot tidak pernah masuk ke perabot lain (dari titik
   * valid terakhir) — jadi tidak ada "nempel lalu snap balik" saat dilepas.
   */
  groupOverlapOnlyAt(item, x, z) {
    const g = this.building.groupOf(item);
    const dx = x - item.x;
    const dz = z - item.z;
    if (g.length <= 1) {
      return !this.overlapsSolid(item, x, z, item.ry);
    }
    const ignore = new Set(g.map((m) => m.obstacle).filter(Boolean));
    for (const m of g) {
      ignore.delete(m.obstacle);
      const bad = this.overlapsSolid(m, m.x + dx, m.z + dz, m.ry, 0.015, m.obstacle, ignore);
      ignore.add(m.obstacle);
      if (bad) return false;
    }
    return true;
  }

  /** NavMesh menangani navigasi — penempatan hanya dicek petak vs petak. */
  allSeatsOk() {
    return true;
  }

  /** Prefilter unit pada offset kandidat (validasi akhir setelah salinan ada). */
  groupCopyOk(item, dx, dz) {
    const g = this.building.groupOf(item);
    // anggota grup sendiri tidak dihitung sebagai tabrakan (meja+kursinya
    // memang saling menyelip); perabot LAIN tetap dicek.
    const ignore = new Set(g.map((m) => m.obstacle).filter(Boolean));
    for (const m of g) {
      if (this.overlapsSolid(m, m.x + dx, m.z + dz, m.ry, 0.015, null, ignore)) return false;
    }
    return true;
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
    const aim = this.aimNdc();
    const down = input.down;

    // Jaring pengaman: tahanan grid navigasi HANYA boleh aktif sambil
    // menggeser. Kalau tidak (mis. drag terputus), lepaskan — kalau tidak
    // grid navigasi jadi basi dan karakter menembus dinding/perabot.
    if (this.building?._navSuspended && !this.dragging) this.building.resumeNav();

    if (down && !this._prevDown) this._press(aim);
    // Kursor terkunci (Mode Edit dari POV): tidak ada jarak kursor, jadi
    // "tahan tombol di perabot" langsung dianggap men-drag (ala Minecraft).
    if (down && this._pressItem && !this.dragging
      && (input.dragDistance > DRAG_THRESHOLD || input.locked)) {
      this._beginDrag();
    }
    if (down && this.dragging) this._drag(aim);
    if (!down && this._prevDown) this._release();
    this._prevDown = down;

    if (!down) {
      this._timer += dt;
      if (this._timer >= PICK_PERIOD) {
        this._timer = 0;
        const item = this._pick(aim);
        this.hovered = item;
        const showObj = this.selected ? this.selected.obj : (item ? item.obj : null);
        this.fx?.setHover(showObj);
        this.hud.setCursor(item ? "grab" : "default");
      }
    }

    if (this.selected) {
      // Kotak seleksi = Box3 dari seluruh mesh grup — mahal kalau dihitung
      // tiap frame saat drag. Cukup 8×/detik saat menggeser.
      if (!this.dragging) {
        this._refreshBox();
      } else {
        this._boxTimer = (this._boxTimer || 0) + dt;
        if (this._boxTimer >= 0.12) {
          this._boxTimer = 0;
          this._refreshBox();
        }
      }
    }
  }

  /**
   * Titik bidik Mode Edit: posisi kursor di layar, atau TITIK TENGAH LAYAR
   * (crosshair) saat kursor terkunci untuk mouse-look POV — di sana tidak
   * ada kursor, jadi bidikannya crosshair.
   */
  aimNdc(out = this._aim) {
    const i = this.input;
    if (!i) return out.set(0, 0);
    if (i.locked) return out.set(0, 0);
    return out.set(i.ndc.x, i.ndc.y);
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
    this._safe = { x: item.x, z: item.z, ry: item.ry };
    this._placeOk = !this.overlapsSolid(item, item.x, item.z, item.ry);
  }

  _beginDrag() {
    const item = this._pressItem;
    if (!item) return;
    // snapshot SEBELUM digeser → bisa di-undo
    this._snapshot();
    // Selama drag, jangan bangun ulang grid nav tiap frame (berat) —
    // grid dibangun ulang sekali saat lepas.
    if (this.building) this.building.suspendNav();
    if (this.input?.locked) {
      // POV / kursor terkunci: ...
      this._grab.x = 0;
      this._grab.z = 0;
      this.input.consumeDelta();
    } else {
      const g = this.rig.screenToGround(this._pressNdc.x, this._pressNdc.y, this._tmp);
      this._grab.x = g ? item.x - g.x : 0;
      this._grab.z = g ? item.z - g.z : 0;
    }
    this.dragging = true;
    this.fx?.setHover(item.obj);
  }

  _drag(ndc) {
    const item = this._pressItem;
    if (!item) return;
    if (this.input?.locked) return this._dragLocked(item);
    const g = this.rig.screenToGround(ndc.x, ndc.y, this._tmp);
    if (!g) return;
    this._moveTo(item, g.x + this._grab.x, g.z + this._grab.z);
  }

  /**
   * Geser perabot ketika kursor TERKUNCI (Mode Edit dari POV): gerakan mouse
   * diproyeksikan ke bidang lantai menurut arah kamera — tarik ke kanan →
   * perabot ikut ke kanan layar, tarik ke bawah → maju ke arah pemain.
   *
   * Skala 1:1 di layar (perabot mengikuti kursor persis seperti crosshair
   * di Minecraft), TANPA snap per petak saat menggeser — snap dipakai
   * setelah mouse dilepas supaya terasa mulus.
   */
  _dragLocked(item) {
    const d = this.input.consumeDelta();
    if (!d.x && !d.y) return;
    const cam = this.rig.activeCamera;
    cam.updateMatrixWorld(true);
    cam.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-6) return;
    this._fwd.normalize();
    // kanan layar di bidang lantai = F × up
    const rx = -this._fwd.z;
    const rz = this._fwd.x;
    // meter per piksel pada jarak perabot → gerakan terasa 1:1
    const dist = Math.max(0.8, cam.position.distanceTo(item.obj.position));
    const h = Math.max(1, this.rig.canvas?.clientHeight || 720);
    const perPixel = (2 * dist * Math.tan(((cam.fov || 55) * Math.PI) / 360)) / h;
    const k = perPixel * 1.5;
    const dx = (rx * d.x - this._fwd.x * d.y) * k;
    const dz = (rz * d.x - this._fwd.z * d.y) * k;
    this._moveTo(item, item.x + dx, item.z + dz);
  }

  /**
   * Terapkan posisi kandidat ke perabot.
   * `applySnap` hanya dipakai saat melepas drag — selama drag perabot ikut
   * mouse 1:1 (tanpa lompat per petak) supaya terasa ringan & mulus.
   */
  _moveTo(item, x, z, applySnap = false) {
    if (applySnap && this.snap) {
      // setrik ke petak perabot ini: sisi footprint tepat di garis petak
      const f = this._footprint(item, item.ry);
      const step = this.snapStep(item);
      x = this._snapEdge(x, f.w, step);
      z = this._snapEdge(z, f.d, step);
    }
    if (this._isWall) {
      if (this._wallLock === "z") z = this._lockZ;
      else x = this._lockX;
    }
    const b = this.building.bounds;
    x = THREE.MathUtils.clamp(x, b.x0 + BODY_MARGIN, b.x1 - BODY_MARGIN);
    z = THREE.MathUtils.clamp(z, b.z0 + BODY_MARGIN, b.z1 - BODY_MARGIN);
    // tidak berubah (mis. klik tanpa geser) → jangan tandai "kotor"
    if (Math.abs(x - item.x) < 1e-4 && Math.abs(z - item.z) < 1e-4) return;
    // Posisi yang menabrak perabot lain / menutup jalan TIDAK dipakai —
    // perabot tetap di posisi valid terakhir (ala Minecraft: blok nggak
    // bisa ditaruh di dalam blok lain). Efeknya: tidak ada "nempel lalu
    // snap balik" saat mouse dilepas.
    const wasOk = this._placeOk;
    if (!this.groupOverlapOnlyAt(item, x, z)) {
      this._placeOk = false;
      this._readout();
      return;
    }
    this.building.moveGroup(item, x, z);
    item.obj.updateMatrixWorld(true);
    this._placeOk = true;
    if (!wasOk) this._safe = { x: item.x, z: item.z, ry: item.ry };
    this._dirty = true;
    this._readout();
  }

  _release() {
    const item = this._pressItem;
    if (this.building) this.building.resumeNav();
    if (this.dragging) {
      this.dragging = false;
      if (this._dirty) {
        // validasi penuh sekali saat lepas: jangan sampai perabot menutup
        // jalan, menabrak dinding, atau membuat kursinya tak bisa diakses.
        if (item) {
          this.building.refreshNav();
          // posisi akhir dirapikan ke petak (setelah lepas, bukan saat
          // digeser — jadi selama drag terasa mulus)
          if (this.snap) {
            const f = this._footprint(item, item.ry);
            const step = this.snapStep(item);
            const sx = this._snapEdge(item.x, f.w, step);
            const sz = this._snapEdge(item.z, f.d, step);
            if ((Math.abs(sx - item.x) > 1e-4 || Math.abs(sz - item.z) > 1e-4)
              && this.groupOverlapOnlyAt(item, sx, sz)) {
              this.building.moveGroup(item, sx, sz);
              item.obj.updateMatrixWorld(true);
            }
          }
          let ok = this.groupPlacementOk(item);
          if (!ok && this._safe) {
            this.building.moveGroup(item, this._safe.x, this._safe.z);
            this.building.rotateGroup(item, this._safe.ry);
            this.building.refreshNav();
            item.obj.updateMatrixWorld(true);
            this._placeOk = true;
            this.hud.toast("Posisi itu menutup perabot lain — dikembalikan ke posisi aman", 2800);
          } else if (ok) {
            this._safe = { x: item.x, z: item.z, ry: item.ry };
            this._placeOk = true;
          }
          // meja ikut pindah → titik "rumah" staf ikut diperbarui
          this.crew?.syncStaffDesks?.();
        }
        this.save();
      }
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
      this._hideFootCells();
      this.hud.setEditTarget("Klik perabot untuk memilih");
      this.hud.renderEditMats(this.materialPalette(), null);
      return;
    }
    this._selBox.visible = true;
    this.hud.renderEditMats(this.materialPalette(), item.matKey);
    this._readout(true);
    // validasi penuh sekali saat memilih → warna petak langsung benar
    this._placeOk = this.groupPlacementOk(item);
    this._refreshBox();
  }

  _readout(force = false) {
    const item = this.selected;
    if (!item) return;
    const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
    if (!force && this._lastReadout && now - this._lastReadout < 80) return;
    this._lastReadout = now;
    const label = item.label || item.obj.userData.interactionLabel || item.obj.name || "Perabot";
    const deg = Math.round((((item.ry * 180) / Math.PI) % 360 + 360) % 360);
    const petak = `${Math.round(PETAK * 100)} cm`;
    const unit = this.building.groupOf(item).length > 1 ? " · 1 unit" : "";
    this.hud.setEditTarget(
      `${label} · x ${item.x.toFixed(2)} · z ${item.z.toFixed(2)} · ${deg}° · petak ${petak}${this.snap ? " (snap)" : ""}${unit}`,
    );
  }

  _hideFootCells() {
    for (const c of this._footCells) c.visible = false;
  }

  /** Gambar footprint perabot sebagai petak-petak snap miliknya sendiri.
   *  Hijau = posisi aman, merah = bertabrakan / menutup jalan. */
  _updateFootCells(item) {
    if (!item || !this.enabled || !this.snap) {
      this._hideFootCells();
      return;
    }
    const step = this.snapStep(item);
    const f = this._footprint(item, item.ry);
    const minX = Math.floor((item.x - f.w / 2) / step + 1e-6) * step;
    const minZ = Math.floor((item.z - f.d / 2) / step + 1e-6) * step;
    const nx = Math.max(1, Math.ceil(f.w / step - 1e-6));
    const nz = Math.max(1, Math.ceil(f.d / step - 1e-6));
    let n = 0;
    for (let iz = 0; iz < nz && n < this._footCells.length; iz++) {
      for (let ix = 0; ix < nx && n < this._footCells.length; ix++) {
        const cell = this._footCells[n++];
        cell.visible = true;
        cell.scale.set(step, 1, step);
        cell.position.set(minX + (ix + 0.5) * step, 0.032, minZ + (iz + 0.5) * step);
      }
    }
    for (let i = n; i < this._footCells.length; i++) this._footCells[i].visible = false;
    this._footMat.color.setHex(this._placeOk ? 0x35d07a : 0xff4d4d);
    this._footMat.opacity = this._placeOk ? 0.85 : 1;
  }

  _refreshBox() {
    const item = this.selected;
    if (!item || !item.obj.parent) {
      this._selBox.visible = false;
      this._hideFootCells();
      return;
    }
    const g = this.building.groupOf(item);
    this._box.makeEmpty();
    for (const m of g) {
      if (!m.obj?.parent) continue;
      this._mBox.setFromObject(m.obj);
      if (!this._mBox.isEmpty()) this._box.union(this._mBox);
    }
    if (this._box.isEmpty()) {
      this._mBox.setFromObject(item.obj);
      if (this._mBox.isEmpty()) {
        this._selBox.visible = false;
        this._hideFootCells();
        return;
      }
      this._box.copy(this._mBox);
    }
    // saat drag cukup cek tabrakan cepat; saat diam pakai hasil validasi penuh
    if (this.dragging) this._placeOk = this.groupOverlapOnly(item);
    const ok = this._placeOk;
    this._selBox.box.copy(this._box);
    this._selBox.visible = true;
    this._selBox.material.color.setHex(ok ? 0xf0c46a : 0xff5c5c);
    this._selBox.updateMatrixWorld(true);
    this._updateFootCells(item);
  }

  /* --------------------------------------------------------------- actions */

  rotateSelected(deg) {
    const item = this.selected;
    if (!item) {
      this.hud.toast("Pilih perabot dulu", 1400);
      return;
    }
    this._snapshot();
    const before = { x: item.x, z: item.z, ry: item.ry };
    this.building.rotateGroup(item, item.ry + (deg * Math.PI) / 180);
    this.building.refreshNav();
    // Putaran bisa membuat kursi menghadap dinding / tidak bisa diakses.
    // Kalau begitu, kembalikan ke putaran aman terakhir.
    let ok = this.groupPlacementOk(item);
    if (!ok) {
      this.building.rotateGroup(item, before.ry);
      this.building.refreshNav();
      item.obj.updateMatrixWorld(true);
      this.hud.toast("Putaran itu menutup perabot lain — dibatalkan", 2600);
    } else {
      this._safe = { x: item.x, z: item.z, ry: item.ry };
    }
    this._placeOk = ok;
    this._readout();
    this._refreshBox();
    this.crew?.syncStaffDesks?.();
    this.save();
  }

  applyMaterial(key) {
    const item = this.selected;
    if (!item) {
      this.hud.toast("Pilih perabot dulu", 1400);
      return;
    }
    // Material berlaku untuk SEMUA perabot sejenis — pilih satu "Meja kerja"
    // dan semua meja kerja (termasuk salinannya) ikut berubah.
    this._snapshot();
    const n = this.building.setPropMaterialKind(item, key);
    this.hud.renderEditMats(this.materialPalette(), key);
    this._readout();
    this.save();
    const kind = this.building.propKind(item);
    this.hud.toast(
      n > 1
        ? `Material diterapkan ke ${n} perabot "${kind}"`
        : `Material diterapkan ke ${kind}`,
      2400,
    );
  }

  resetSelected() {
    const item = this.selected;
    if (!item) {
      this.hud.toast("Pilih perabot dulu", 1400);
      return;
    }
    // Reset berlaku untuk semua perabot sejenis (konsisten dengan material).
    this._snapshot();
    this.building.resetPropKind(item);
    this.building.refreshNav();
    this.refreshRoots();
    this.hud.renderEditMats(this.materialPalette(), null);
    this._placeOk = true;
    this._readout();
    this._refreshBox();
    this.save();
  }

  resetAll() {
    // kembali ke editan terakhir yang tersimpan (src/data/defaultEdits.js)
    this._snapshot();
    this.building.applyEdits(this._bootLayout || DEFAULT_EDITS);
    this.building.refreshNav();
    this.refreshRoots();
    this.select(null);
    this.crew?.syncStaffDesks?.();
    this.save();
    this.hud.toast("Semua perabot kembali ke tata ruang tersimpan", 2400);
  }

  copySelected() {
    const item = this.selected;
    if (!item) {
      this.hud.toast("Pilih perabot dulu, lalu Duplikat", 1600);
      return;
    }
    // cari tempat yang tidak menutup jalan dan kursinya tetap bisa dipakai;
    // unit meja+kursi diduplikat bersama-sama. Validasi akhir dilakukan
    // setelah salinan benar-benar ada di dunia (posisi kursi & jalur asli).
    this._snapshot();
    const copy = this.building.copyGroup(
      item,
      (dx, dz) => this.groupCopyOk(item, dx, dz),
      (anchorCopy) => {
        this.building.refreshNav();
        if (!this.groupPlacementOk(anchorCopy)) return false;
        return true;
      },
    );
    if (!copy) {
      this.hud.toast("Gagal menduplikat — tidak ada tempat aman di sekitarnya", 2600);
      return;
    }
    this.refreshRoots();
    this.select(copy);
    this.save();
    const n = this.building.groupOf(copy).length;
    const label = copy.label || "Perabot";
    this.hud.toast(
      n > 1 ? `${label} + ${n - 1} bagian diduplikat (1 unit)` : `${label} diduplikat — geser ke tempat baru`,
      2400,
    );
  }

  deleteSelected() {
    const item = this.selected;
    if (!item) {
      this.hud.toast("Pilih perabot dulu, lalu Hapus", 1600);
      return;
    }
    const label = item.label || "Perabot";
    const g = this.building.groupOf(item);
    // Meja yang dihapus → lepaskan staf yang memakainya (otomatis adaptasi).
    this._snapshot();
    const freed = this._releaseStaffDesks(g);
    let any = false;
    for (const m of g) {
      if (this.building.deleteProp(m)) any = true;
      this.building.unlinkProp(m);
    }
    if (!any) return;
    this.refreshRoots();
    this.select(null);
    this.save();
    this.hud.toast(
      (g.length > 1
        ? `${label} + ${g.length - 1} bagian dihapus`
        : `${label} dihapus`)
      + (freed.length ? ` — ${freed.join(", ")} lepas dari mejanya` : "")
      + ' · "Reset semua" untuk mengembalikan',
      2800,
    );
  }

  /**
   * Kalau meja kerja dihapus, staf yang_assignment ke meja itu harus
   * dilepas (deskId = null) supaya tidak ada staf "nempel" ke meja yang
   * sudah tidak ada. Mengembalikan nama-nama staf yang dilepas.
   */
  _releaseStaffDesks(group) {
    const ids = new Set();
    for (const m of group || []) {
      const id = m?.id;
      if (id) ids.add(id);
    }
    if (!ids.size) return [];
    const freed = [];
    for (const s of STAFF) {
      if (!s.deskId) continue;
      // kunci meja bisa berupa id unit polos (p51) atau per kursi (p37#1)
      const base = String(s.deskId).split("#")[0];
      if (!ids.has(s.deskId) && !ids.has(base)) continue;
      s.deskId = null;
      freed.push(s.name);
      // kritter di dunia ikut dilepas
      const critter = this.crew?.members?.find((c) => c.staffId === s.id);
      if (critter) {
        critter.deskId = null;
        critter.homeSpot = null;
      }
    }
    if (freed.length) {
      this.crew?.syncStaffDesks?.();
      // ikut disimpan ke src/data/staff.json supaya tidak hilang saat reload
      persistStaff();
    }
    return freed;
  }

  /* ----------------------------------------------------------- persistence */

  /** Simpan otomatis ke src/data/layout.default.json (lewat dev server).
   *  Tidak memakai localStorage: file JSON di repo adalah satu-satunya
   *  sumber tata ruang, jadi siapa pun yang pull repo ikut memakainya. */
  save() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._postLayout(false);
    }, 350);
  }

  /** Simpan sekarang (tombol Simpan). */
  saveNow(downloadOnFail = false) {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    return this._postLayout(true, downloadOnFail);
  }

  async _postLayout(explicit = false, downloadOnFail = false) {
    const data = this.building.serializeLayout();
    this.hud.setEditSave?.("💾 menyimpan ke layout.default.json…", null);
    try {
      const res = await fetch(LAYOUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const out = await res.json().catch(() => ({}));
      if (out && out.ok === false) throw new Error(out.error || "gagal");
      // "Reset semua" sekarang kembali ke editan TERAKHIR yang tersimpan.
      this._bootLayout = JSON.parse(JSON.stringify(data));
      this._savedAt = Date.now();
      const time = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      this.hud.setEditSave?.(`💾 tersimpan ${time} · src/data/layout.default.json`, true);
      if (explicit) this.hud.toast("Tata ruang tersimpan ke src/data/layout.default.json", 2400);
      return true;
    } catch (err) {
      console.warn("[EditMode] gagal menyimpan layout", err);
      this.hud.setEditSave?.("⚠️ simpan file gagal — jalankan lewat `npm run dev`", false);
      if (explicit) {
        this.hud.toast(
          "Simpan ke file hanya aktif saat dev server (npm run dev).",
          3200,
        );
      }
      return false;
    }
  }

  loadSaved() {
    // Satu sumber: src/data/layout.default.json (dibaca lewat defaultEdits.js).
    this._bootLayout = JSON.parse(JSON.stringify(DEFAULT_EDITS));
    const base = this.building.applyEdits(this._bootLayout);
    this.building.bakeHome();
    this.building.refreshNav();
    this._loaded = base;
    return this._loaded;
  }
}
