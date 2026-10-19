import * as THREE from "three";
import { Critter } from "../character/Critter.js";
import { STAFF, appearanceFromModel, hairStyleName } from "../data/staff.js";

/* ===================================================================== *
 *  CharDetail — panel "detail pegawai" yang muncul saat karakter diklik.
 *
 *  Isi: pratinjau 3D SETENGAH BADAN (berputar otomatis, tidak bisa
 *  di-drag) + biodata staf (jabatan, departemen, ruangan, meja, akses).
 *  Bahasa visualnya sama dengan modal Manajemen Staf (kaca gelap, hairline,
 *  satu aksen hangat).
 * ===================================================================== */

const $ = (id) => document.getElementById(id);

export class CharDetail {
  constructor({ onAction = () => { } } = {}) {
    this.onAction = onAction;
    this.panel = $("detail-panel");
    this.canvas = $("detail-canvas");
    this.titleEl = $("detail-title");
    this.subEl = $("detail-sub");
    this.rowsEl = $("detail-rows");
    this.actionsEl = $("detail-actions");
    this.isOpen = false;
    this.selected = null;   // karakter dunia yang sedang dilihat
    this.preview = null;    // karakter pratinjau (punya renderer sendiri)
    this._renderer = null;
    this._scene = null;
    this._camera = null;
    this._raf = 0;
    this._last = 0;
    this._spin = 0;
    this._bound = false;
  }

  /* ------------------------------------------------------------- panel */

  open(critter) {
    if (!critter) return;
    this.selected = critter;
    this.isOpen = true;
    this.panel?.classList.add("is-open");
    this._fill(critter);
    this._showPreview(critter);
  }

  close() {
    this.isOpen = false;
    this.selected = null;
    this.panel?.classList.remove("is-open");
    this._stopLoop();
    this._clearPreview();
  }

  /** Buang karakter pratinjau lama supaya tidak menumpuk (double). */
  _clearPreview() {
    if (this.preview && this._scene) {
      this._scene.remove(this.preview.root);
      this.preview = null;
    }
  }

  /** Isi biodata + tombol aksi. */
  _fill(critter) {
    const staff = STAFF.find((s) => s.id === critter.staffId) || null;
    const name = critter.name || "Pegawai";
    this.titleEl.textContent = `${critter.spec?.emoji || "🙂"} ${name}`;
    const sub = [];
    if (critter.department?.name) sub.push(critter.department.name);
    if (critter.spec?.name) sub.push(critter.spec.name);
    this.subEl.textContent = sub.join(" · ") || "Pegawai kantor";

    const rows = [
      ["Jabatan", staff?.title || "—"],
      ["Departemen", staff?.department || critter.department?.name || "—"],
      ["Status kerja", staff ? (staff.status === "active" ? "Aktif" : staff.status === "on-leave" ? "Cuti" : "Tidak aktif") : "—"],
      ["Ruang kerja", staff?.roomId || critter.roomId || "—"],
      ["Meja kerja", staff?.deskId || critter.deskId || "—"],
      ["Akses ruangan", (staff?.rooms?.length ? staff.rooms : critter.rooms || []).join(", ") || "—"],
      ["Gaya rambut", hairStyleName(staff?.model?.hairStyle)],
      ["Sedang", critter.status || "—"],
    ];

    this.rowsEl.innerHTML = "";
    for (const [k, v] of rows) {
      const row = document.createElement("div");
      row.className = "detail-row";
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      row.append(dt, dd);
      this.rowsEl.appendChild(row);
    }

    // aksi
    this.actionsEl.innerHTML = "";
    const actions = [];
    if (!critter.controlled) {
      actions.push({ action: "possess", value: critter.id, label: "Kendalikan", accent: true });
    }
    actions.push({ action: "focus", value: critter.id, label: "Ikuti kamera" });
    for (const a of actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn" + (a.accent ? " is-accent" : "");
      b.textContent = a.label;
      b.dataset.action = a.action;
      if (a.value != null) b.dataset.value = a.value;
      this.actionsEl.appendChild(b);
    }
  }

  /* ----------------------------------------------------------- pratinjau */

  _ensure() {
    if (this._renderer) return;
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._renderer = renderer;

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(2.2, 3.4, 2.6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd6ff, 0.4);
    rim.position.set(-2.2, 1.8, -2.4);
    scene.add(rim);
    this._scene = scene;

    const cam = new THREE.PerspectiveCamera(34, 1, 0.05, 20);
    this._camera = cam;

    if (!this._bound) {
      this._bound = true;
      // Pratinjau TIDAK bisa di-drag: karakter berputar otomatis.
      this.canvas.style.pointerEvents = "none";
      this.canvas.style.cursor = "default";
      // Buffer kanvas harus ikut ukuran panel (panel muncul/dobrak sesaat).
      if ("ResizeObserver" in window) {
        this._ro = new ResizeObserver(() => this._resize());
        if (this.canvas.parentElement) this._ro.observe(this.canvas.parentElement);
      }
    }
  }

  /** Tampilkan setengah badan karakter yang dipilih. */
  _showPreview(critter) {
    this._ensure();
    requestAnimationFrame(() => this._resize());
    setTimeout(() => this._resize(), 80);

    // Buang pratinjau sebelumnya DULU (kalau tidak, karakternya dobel).
    this._clearPreview();
    const staff = STAFF.find((s) => s.id === critter.staffId);
    const spec = critter.spec || { id: "developer" };
    const c = new Critter({
      species: spec.id,
      name: critter.name || "Pegawai",
      department: critter.department || null,
      tieColor: critter.tieColor ?? 0x477da6,
      appearance: staff?.model ? appearanceFromModel(staff.model) : null,
    });
    c.root.position.set(0, 0, 0);
    this._scene.add(c.root);
    this.preview = c;
    this._spin = 0;
    this._startLoop();
  }

  _resize() {
    if (!this._renderer || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(80, Math.round(rect.width));
    const h = Math.max(80, Math.round(rect.height));
    if (this._renderer.domElement.width === w && this._renderer.domElement.height === h) return;
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  }

  _startLoop() {
    if (this._raf) return;
    this._last = performance.now();
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      this._frame();
    };
    this._raf = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _frame() {
    if (!this._renderer || !this.isOpen) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;

    const c = this.preview;
    if (c) {
      c.update(dt, now / 1000, null);
      // Character berputar otomatis (setelah update, yg menimpa rotation).
      this._spin += dt * 0.55;
      c.yaw = this._spin;
      c.targetYaw = this._spin;
      c.root.rotation.y = this._spin;
    }

    // Kamera membingkai SETENGAH BADAN: dari kepala (y 1.28–1.55) turun
    // ke dada/pinggang (y ≈ 0.95) — kaki & bokong terpotong.
    const cam = this._camera;
    const targetY = 1.27;
    cam.position.set(0, targetY + 0.05, 1.08);
    cam.lookAt(0, targetY, 0);
    this._renderer.render(this._scene, cam);
  }
}
