import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Critter } from "../character/Critter.js";
import { SPECIES, DEPARTMENTS, speciesById } from "../character/species.js";
import {
  STAFF,
  STAFF_STATUSES,
  DEPT_ROOM,
  DEFAULT_WANDER,
  newStaffRecord,
  modelDefaults,
  appearanceFromModel,
  toHex,
  toInt,
  deptTie,
} from "../data/staff.js";

/* ===================================================================== *
 *  StaffModal — dashboard manajemen staf di meja HR.
 *
 *  3 kolom: daftar staf | formulir (Profil / Model / Penempatan) |
 *  preview 3D.
 *
 *  Semua yang tampil di sini berasal dari data nyata:
 *    • daftar & statistik  ← STAFF (src/data/staff.json)
 *    • daftar meja         ← building.seats (meja di ruangan terpilih)
 *    • peta penempatan     ← building.rooms + posisi kru
 *    • preview             ← Critter yang sama dengan yang di dunia
 *  Setiap Simpan / Tambah / Hapus ikut menulis src/data/staff.json
 *  lewat middleware /__staff dan langsung mengubah karakter di dunia.
 * ===================================================================== */

const $ = (id) => document.getElementById(id);

const COLOR_FIELDS = ["skin", "shirt", "pants", "hair", "eyes", "tie"];

const PRESETS = {
  dev: { species: "developer", skin: "#dca787", shirt: "#17191d", pants: "#101216", hair: "#252321", eyes: "#49362b", accessory: "headphones" },
  design: { species: "designer", skin: "#f0c8ad", shirt: "#8980a8", pants: "#4a5360", hair: "#342721", eyes: "#49362b", accessory: "glasses" },
  exec: { species: "finance", skin: "#e5c0a4", shirt: "#484254", pants: "#4a5360", hair: "#2a2429", eyes: "#49362b", accessory: "none" },
  ops: { species: "operator", skin: "#9f694a", shirt: "#333943", pants: "#484254", hair: "#17191d", eyes: "#30241d", accessory: "headphones" },
};

/** Geometri & material warna dibagi cache global untuk seluruh kru —
 *  jangan pernah di-dispose (ditandai `userData.shared` oleh critterShared,
 *  termasuk material bayangan bersama). Yang benar-benar milik preview ini
 *  hanya material ID card: dibuat baru tiap kritter + punya texture sendiri. */
function releasePreviewMeshes(root) {
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.userData?.shared) continue; // material cache global (M/MB/bayangan) — jangan disentuh
      if (!m.map) continue; // hanya material milik preview ini (ID card) punya texture sendiri
      m.map.dispose?.();
      m.dispose?.();
    }
  });
}

export class StaffModal {
  constructor({ building, crew, hud }) {
    this.building = building;
    this.crew = crew;
    this.hud = hud;
    this.modal = $("staff-modal");
    this.list = $("staff-list");
    this.canvas = $("staff-preview-canvas");
    this.mapCanvas = $("staff-map-canvas");
    this.current = null;
    this.tab = "profile";
    this.isOpen = false;
    this.dirty = false;
    this._filter = "";
    this._preview = null;
    this._bind();
    this._fillSelects();
    this.renderList();
    this._setState(false);
  }

  /* ---------------------------------------------------------- binding */

  _bind() {
    document.addEventListener("click", (e) => {
      const node = e.target.closest?.("[data-action]");
      if (!node) return;
      const { action, value } = node.dataset;
      if (action === "staff-close") this.close();
      else if (action === "staff-new") this.newStaff();
      else if (action === "staff-save") this.save();
      else if (action === "staff-delete") this.remove();
      else if (action === "staff-tab") this.setTab(value);
      else if (action === "staff-preset") this.applyPreset(value);
    });

    this.list?.addEventListener("click", (e) => {
      const li = e.target.closest?.("[data-staff-id]");
      if (li) this.select(li.dataset.staffId);
    });

    $("staff-search")?.addEventListener("input", (e) => {
      this._filter = (e.target.value || "").trim().toLowerCase();
      this.renderList();
    });

    for (const id of ["staff-name", "staff-title"]) {
      $(id)?.addEventListener("input", () => {
        this._setDirty(true);
        this._updatePreviewMeta();
      });
    }

    $("staff-dept")?.addEventListener("change", () => this._onDeptChange());
    $("staff-status")?.addEventListener("change", () => this._setDirty(true));
    $("staff-species")?.addEventListener("change", () => this._onSpeciesChange());
    $("staff-accessory")?.addEventListener("change", () => {
      this._setDirty(true);
      this._refreshPreview();
    });

    for (const key of COLOR_FIELDS) {
      const input = $(`staff-${key}`);
      input?.addEventListener("input", () => {
        const out = $(`staff-${key}-out`);
        if (out) out.textContent = input.value;
        this._setDirty(true);
        this._refreshPreview();
      });
    }

    $("staff-room")?.addEventListener("change", () => {
      this._refreshDesks();
      this._drawMap();
      this._updatePreviewMeta();
      this._setDirty(true);
    });
    $("staff-desk")?.addEventListener("change", () => {
      this._drawMap();
      this._setDirty(true);
    });
    $("staff-wander")?.addEventListener("input", (e) => {
      this._setWanderOut(e.target.value);
      this._setDirty(true);
    });

    $("staff-preview-anim")?.addEventListener("change", (e) => {
      if (!this._preview) return;
      this._preview.anim = e.target.value;
      this._applyPreviewAnim();
    });
    $("staff-preview-spin")?.addEventListener("change", (e) => {
      if (this._preview) this._preview.spin = e.target.value === "on";
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) this.close();
    });

    window.addEventListener("resize", () => {
      if (!this.isOpen) return;
      this._resizePreview();
      this._drawMap();
    });
  }

  _fillSelects() {
    const dept = $("staff-dept");
    if (dept) {
      const names = [...new Set([...DEPARTMENTS.map((d) => d.name), ...STAFF.map((s) => s.department)])];
      dept.innerHTML = "";
      for (const n of names) dept.append(new Option(n, n));
    }

    const status = $("staff-status");
    if (status) {
      status.innerHTML = "";
      for (const s of STAFF_STATUSES) status.append(new Option(s.label, s.value));
    }

    const species = $("staff-species");
    if (species) {
      species.innerHTML = "";
      for (const sp of SPECIES) species.append(new Option(`${sp.emoji} ${sp.name}`, sp.id));
    }

    const room = $("staff-room");
    if (room) {
      room.innerHTML = "";
      for (const r of this.building.rooms) room.append(new Option(r.name, r.id));
    }
  }

  /* ------------------------------------------------------------ daftar */

  renderList() {
    if (!this.list) return;
    const q = this._filter;
    const rows = STAFF.filter((s) => !q || `${s.name} ${s.title} ${s.department}`.toLowerCase().includes(q));
    this.list.innerHTML = "";

    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "staff-empty";
      li.textContent = STAFF.length
        ? "Tidak ada staf yang cocok dengan pencarian."
        : "Belum ada staf — tekan “+ Staf baru”.";
      this.list.appendChild(li);
    }

    for (const s of rows) {
      const li = document.createElement("li");
      li.className = "staff-item"
        + (this.current?.id === s.id ? " is-active" : "")
        + (s.status !== "active" ? " is-off" : "");
      li.dataset.staffId = s.id;
      li.innerHTML =
        '<span class="staff-dot"></span><span class="staff-name"></span>' +
        '<span class="staff-flag"></span><span class="staff-meta"></span>';
      li.querySelector(".staff-dot").style.setProperty("--dot", toHex(s.model?.tieColor ?? 0));
      li.querySelector(".staff-name").textContent = s.name;
      li.querySelector(".staff-meta").textContent = `${s.title} · ${this._roomName(s.roomId)}`;
      li.querySelector(".staff-flag").textContent =
        STAFF_STATUSES.find((x) => x.value === s.status)?.flag || "";
      this.list.appendChild(li);
    }

    this._updateStats();
  }

  _updateStats() {
    const set = (id, v) => { const el = $(id); if (el) el.textContent = String(v); };
    set("staff-stat-total", STAFF.length);
    set("staff-stat-dept", new Set(STAFF.map((s) => s.department)).size);
    set("staff-stat-active", STAFF.filter((s) => s.status === "active").length);
  }

  _roomName(roomId) {
    return this.building.room(roomId)?.name || roomId || "—";
  }

  /* --------------------------------------------------------- seleksi */

  select(id) {
    const s = STAFF.find((x) => x.id === id);
    if (!s) return;
    this.current = s;
    this._loadForm(s);
    this.renderList();
    this._refreshPreview();
    this._drawMap();
    this._setState(false);
  }

  _loadForm(s) {
    const set = (id, v) => { const el = $(id); if (el) el.value = v ?? ""; };
    const def = modelDefaults(s.model?.species);

    set("staff-id", s.id);
    set("staff-name", s.name);
    set("staff-title", s.title);
    set("staff-dept", s.department);
    set("staff-status", s.status);
    set("staff-species", s.model?.species || def.species);
    set("staff-accessory", s.model?.accessory || def.accessory);

    for (const key of COLOR_FIELDS) {
      const val = key === "tie"
        ? toHex(s.model?.tieColor ?? def.tieColor)
        : (s.model?.[key] || def[key]);
      set(`staff-${key}`, val);
      const out = $(`staff-${key}-out`);
      if (out) out.textContent = val;
    }

    set("staff-room", s.roomId);
    this._refreshDesks();
    set("staff-desk", s.deskId);

    const w = $("staff-wander");
    if (w) {
      w.value = String(s.wander ?? DEFAULT_WANDER);
      this._setWanderOut(w.value);
    }
    this._updatePreviewMeta();
  }

  _clearForm() {
    const set = (id, v) => { const el = $(id); if (el) el.value = v; };
    set("staff-id", "");
    set("staff-name", "");
    set("staff-title", "");
    set("staff-dept", DEPARTMENTS[0]?.name || "Engineering");
    set("staff-status", "active");
    set("staff-room", DEPT_ROOM[DEPARTMENTS[0]?.name] || "staff");
    this._refreshDesks();
    set("staff-desk", "");
    const def = modelDefaults("developer");
    set("staff-species", def.species);
    set("staff-accessory", def.accessory);
    for (const key of COLOR_FIELDS) {
      const val = key === "tie" ? toHex(def.tieColor) : def[key];
      set(`staff-${key}`, val);
      const out = $(`staff-${key}-out`);
      if (out) out.textContent = val;
    }
    const w = $("staff-wander");
    if (w) { w.value = String(DEFAULT_WANDER); this._setWanderOut(w.value); }
    this._updatePreviewMeta();
  }

  _setWanderOut(v) {
    const out = $("staff-wander-out");
    if (out) out.textContent = `${Number(v).toFixed(1)} m`;
  }

  setTab(tab) {
    this.tab = tab;
    for (const name of ["profile", "model", "placement"]) {
      const panel = $(`staff-form-${name}`);
      if (panel) panel.hidden = name !== tab;
    }
    document.querySelectorAll("[data-action='staff-tab']").forEach((b) => {
      const on = b.dataset.value === tab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });
    if (tab === "placement") requestAnimationFrame(() => this._drawMap());
  }

  /* ------------------------------------------------------ ubah form */

  _onDeptChange() {
    const dept = $("staff-dept")?.value;
    if (!dept) return;
    const roomId = DEPT_ROOM[dept];
    if (roomId && this.building.room(roomId)) {
      const room = $("staff-room");
      if (room) room.value = roomId;
      this._refreshDesks();
    }
    const tie = toHex(deptTie(dept));
    const tieEl = $("staff-tie");
    if (tieEl) {
      tieEl.value = tie;
      const out = $("staff-tie-out");
      if (out) out.textContent = tie;
    }
    this._drawMap();
    this._updatePreviewMeta();
    this._setDirty(true);
    this._refreshPreview();
  }

  _onSpeciesChange() {
    const species = $("staff-species")?.value || "developer";
    this._applyModelDefaults(modelDefaults(species));
    this._setDirty(true);
    this._refreshPreview();
  }

  applyPreset(name) {
    if (name === "reset") {
      this._applyModelDefaults(modelDefaults($("staff-species")?.value || "developer"));
      this._setDirty(true);
      this._refreshPreview();
      return;
    }
    const p = PRESETS[name];
    if (!p) return;
    const spec = $("staff-species");
    if (spec) spec.value = p.species;
    this._applyModelDefaults({ ...modelDefaults(p.species), ...p });
    this._setDirty(true);
    this._refreshPreview();
  }

  _applyModelDefaults(model) {
    for (const key of ["skin", "shirt", "pants", "hair", "eyes"]) {
      const el = $(`staff-${key}`);
      if (!el || !model[key]) continue;
      el.value = model[key];
      const out = $(`staff-${key}-out`);
      if (out) out.textContent = model[key];
    }
    const acc = $("staff-accessory");
    if (acc && model.accessory) acc.value = model.accessory;
  }

  /* ------------------------------------------------------------- CRUD */

  async newStaff() {
    const s = newStaffRecord({
      department: this.current?.department || DEPARTMENTS[0]?.name || "Engineering",
      species: this.current?.model?.species || "developer",
    });
    STAFF.push(s);
    this._spawnCritter(s);
    this.current = s;
    this._loadForm(s);
    this.setTab("profile");
    this.renderList();
    this._refreshPreview();
    this._drawMap();
    await this._persist();
    this._setState(true);
    this.hud?.toast(`${s.name} ditambahkan — lengkapi profilnya lalu tekan Simpan`, 2800);
    const nameInput = $("staff-name");
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  }

  async remove() {
    const s = this.current;
    if (!s) return;
    if (!confirm(`Hapus staf "${s.name}" dari kantor?`)) return;
    const idx = STAFF.indexOf(s);
    if (idx >= 0) STAFF.splice(idx, 1);
    const critter = this._critterOf(s.id);
    if (critter) this.crew.despawn(critter);
    this.current = STAFF[Math.min(idx, STAFF.length - 1)] || null;
    if (this.current) this._loadForm(this.current);
    else this._clearForm();
    this.renderList();
    this._refreshPreview();
    this._drawMap();
    await this._persist();
    this._setState(false);
    this.hud?.toast(`${s.name} dihapus dari kantor`, 2400);
  }

  async save() {
    const s = this.current;
    if (!s) return;
    const nameEl = $("staff-name");
    const name = (nameEl?.value || "").trim();
    if (!name) {
      this.setTab("profile");
      this.hud?.toast("Nama staf wajib diisi", 2400);
      nameEl?.focus();
      return;
    }

    const prev = { room: s.roomId, desk: s.deskId, species: s.model?.species };

    s.name = name;
    s.title = ($("staff-title")?.value || "").trim() || s.title;
    s.department = $("staff-dept")?.value || s.department;
    s.status = $("staff-status")?.value || s.status;
    s.roomId = $("staff-room")?.value || s.roomId;
    s.deskId = $("staff-desk")?.value || null;
    s.wander = Number($("staff-wander")?.value) || DEFAULT_WANDER;
    s.model = {
      species: $("staff-species")?.value || s.model?.species || "developer",
      skin: $("staff-skin")?.value || s.model?.skin,
      shirt: $("staff-shirt")?.value || s.model?.shirt,
      pants: $("staff-pants")?.value || s.model?.pants,
      hair: $("staff-hair")?.value || s.model?.hair,
      eyes: $("staff-eyes")?.value || s.model?.eyes,
      tieColor: toInt($("staff-tie")?.value || 0),
      accessory: $("staff-accessory")?.value || "none",
    };

    this._syncCritter(s, prev);
    this.renderList();
    this._refreshPreview();
    this._drawMap();
    const ok = await this._persist();
    this._setState(false);
    if (ok) this.hud?.toast(`${s.name} tersimpan ke src/data/staff.json`, 2400);
  }

  async _persist() {
    try {
      const res = await fetch("/__staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(STAFF),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (e) {
      console.warn("[StaffModal] gagal menyimpan:", e);
      this.hud?.toast("Gagal menyimpan — jalankan lewat npm run dev", 2800);
      return false;
    }
  }

  _setState(dirty) {
    this.dirty = !!dirty;
    const el = $("staff-state");
    if (!el) return;
    el.classList.toggle("is-dirty", this.dirty);
    el.textContent = this.dirty ? "Perubahan belum disimpan" : "Tersimpan di src/data/staff.json";
  }

  /* Semua input form memanggil ini untuk menandai "belum disimpan".
     Refresh preview 3D TIDAK di sini — cukup di listener yang relevan
     (warna/spesies/aksesori/preset), supaya mengetik nama tidak
     membangun ulang model 3D. */
  _setDirty(dirty = true) {
    this._setState(dirty);
  }

  /* ------------------------------------------------- jembatan ke dunia */

  _critterOf(staffId) {
    return this.crew.members.find((c) => c.staffId === staffId) || null;
  }

  _deskSeat(deskId) {
    if (!deskId) return null;
    return this.building.seats.find(
      (s) => (s.obstacle?.owner?.userData?.editId || s.id) === deskId,
    ) || null;
  }

  _spawnCritter(s) {
    const seat = this._deskSeat(s.deskId);
    const critter = this.crew.spawn({
      species: s.model?.species || null,
      name: s.name,
      department: s.department,
      tieColor: s.model?.tieColor,
      roomId: s.roomId,
      deskId: s.deskId,
      staffId: s.id,
      appearance: appearanceFromModel(s.model),
    });
    critter.wanderRadius = Number(s.wander) || 0;
    critter.homeSpot = seat
      ? { x: seat.x, z: seat.z }
      : { x: critter.position.x, z: critter.position.z };
    return critter;
  }

  _syncCritter(s, prev = {}) {
    let critter = this._critterOf(s.id);
    // spesies berganti → badan dibangun ulang dari nol supaya emoji/palet ikut
    if (critter && prev.species && prev.species !== s.model.species) {
      this.crew.despawn(critter);
      critter = null;
    }
    if (!critter) {
      this._spawnCritter(s);
      return;
    }
    critter.name = s.name;
    if (critter.root) critter.root.name = s.name;
    critter.department = DEPARTMENTS.find((d) => d.name === s.department)
      || { name: s.department, tie: s.model.tieColor };
    critter.tieColor = s.model.tieColor;
    critter.roomId = s.roomId;
    critter.deskId = s.deskId;
    critter.wanderRadius = Number(s.wander) || 0;
    critter.appearance = appearanceFromModel(s.model);
    try {
      critter.rebuildAppearance();
    } catch (e) {
      console.warn("[StaffModal] gagal memperbarui karakter:", e);
    }
    if (prev.room !== s.roomId || prev.desk !== s.deskId) this._placeCritter(critter, s);
  }

  _placeCritter(critter, s) {
    const seat = this._deskSeat(s.deskId);
    const want = seat
      ? { x: seat.x, z: seat.z }
      : this.building.randomSpot(s.roomId, { x: 0, z: 0 });
    const yaw = Math.random() * Math.PI * 2;
    const spot = this.crew._findSafeSpawn?.({ ...want, yaw }) || { ...want, yaw };
    critter.teleport(spot.x, spot.z, spot.yaw ?? yaw);
    critter.homeSpot = seat
      ? { x: seat.x, z: seat.z }
      : { x: spot.x, z: spot.z };
  }

  /* -------------------------------------------------------- meja & peta */

  _refreshDesks() {
    const sel = $("staff-desk");
    if (!sel) return;
    const roomId = $("staff-room")?.value || this.current?.roomId || "staff";
    const desks = this.building.seats.filter((d) =>
      this.building.roomAt(d.x, d.z) === roomId,
    );
    sel.innerHTML = "";
    sel.append(new Option("— tanpa meja —", ""));
    for (const d of desks) {
      const id = d.obstacle?.owner?.userData?.editId || d.id;
      const taken = STAFF.find((s) => s.deskId === id && s !== this.current);
      const opt = new Option(`${id} · ${taken ? taken.name : "kosong"}`, id);
      if (taken) opt.disabled = true;
      sel.append(opt);
    }
    if (this.current?.deskId) sel.value = this.current.deskId;
    if (sel.selectedIndex < 0) sel.value = "";
  }

  _drawMap() {
    const canvas = this.mapCanvas;
    if (!canvas || !this.isOpen) return;
    const cssW = Math.max(200, canvas.clientWidth || canvas.width || 300);
    const cssH = Math.max(140, canvas.clientHeight || canvas.height || 190);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const b = this.building.bounds;
    const pad = 12;
    const sx = (cssW - pad * 2) / (b.x1 - b.x0);
    const sz = (cssH - pad * 2) / (b.z1 - b.z0);
    const s = Math.min(sx, sz);
    const ox = pad + ((cssW - pad * 2) - (b.x1 - b.x0) * s) / 2 - b.x0 * s;
    const oz = pad + ((cssH - pad * 2) - (b.z1 - b.z0) * s) / 2 - b.z0 * s;
    const X = (x) => ox + x * s;
    const Z = (z) => oz + z * s;

    const activeRoom = $("staff-room")?.value || this.current?.roomId || null;

    // ruangan
    for (const r of this.building.rooms) {
      const pts = (r.polygon || [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]);
      ctx.beginPath();
      pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
      ctx.closePath();
      const on = r.id === activeRoom;
      ctx.fillStyle = on ? "rgba(226,176,119,0.16)" : "rgba(255,255,255,0.04)";
      ctx.fill();
      ctx.strokeStyle = on ? "rgba(226,176,119,0.75)" : "rgba(255,255,255,0.14)";
      ctx.lineWidth = on ? 1.4 : 1;
      ctx.stroke();

      const cx = X((r.x0 + r.x1) / 2);
      const cz = Z((r.z0 + r.z1) / 2);
      ctx.fillStyle = on ? "rgba(244,241,234,0.92)" : "rgba(126,133,143,0.9)";
      ctx.font = "8px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((r.name || r.id).toUpperCase(), cx, cz);
    }

    // meja — tampilkan SEMUA kursi di ruangan (semua dianggap tempat kerja)
    const desks = this.building.seats.filter((d) => true);
    for (const d of desks) {
      const id = d.obstacle?.owner?.userData?.editId || d.id;
      const owner = STAFF.find((st) => st.deskId === id);
      const mine = owner && this.current && owner.id === this.current.id;
      ctx.beginPath();
      ctx.arc(X(d.x), Z(d.z), mine ? 4 : 2.6, 0, Math.PI * 2);
      if (mine) {
        ctx.fillStyle = "rgba(226,176,119,0.95)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(X(d.x), Z(d.z), 7.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(226,176,119,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (owner) {
        ctx.strokeStyle = "rgba(185,189,196,0.75)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(126,133,143,0.55)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // posisi staf terpilih di dunia
    const critter = this.current ? this._critterOf(this.current.id) : null;
    if (critter) {
      ctx.beginPath();
      ctx.arc(X(critter.position.x), Z(critter.position.z), 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(99,216,255,0.95)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(X(critter.position.x), Z(critter.position.z), 6.4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(99,216,255,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /* ---------------------------------------------------------- preview */

  open() {
    this.isOpen = true;
    this.modal?.classList.add("is-open");
    this.hud?.setStaffModal?.(true);

    if (!this.current) {
      const first = STAFF[0];
      if (first) {
        this.current = first;
        this._loadForm(first);
      } else {
        this._clearForm();
      }
    }
    this.renderList();
    this.setTab(this.tab);
    this._refreshPreview();
    this._startLoop();
    requestAnimationFrame(() => {
      this._resizePreview();
      this._drawMap();
    });
    setTimeout(() => {
      this._resizePreview();
      this._drawMap();
    }, 140);
  }

  close() {
    this.isOpen = false;
    this.modal?.classList.remove("is-open");
    this.hud?.setStaffModal?.(false);
    // Hanya hentikan render loop. Renderer + WebGL context TETAP hidup:
    // memanggil forceContextLoss() lalu memakai canvas yang sama saat
    // modal dibuka lagi membuat preview kadang blank (context mati tidak
    // bisa dipulihkan dengan andal di canvas yang sama).
    this._stopLoop();
  }

  _ensurePreview() {
    if (this._preview) return this._preview;

    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(2.4, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd6ff, 0.45);
    rim.position.set(-2.4, 2.2, -2.6);
    scene.add(rim);

    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    cam.position.set(0, 1.35, 2.9);

    const controls = new OrbitControls(cam, this.canvas);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 5.2;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;

    const p = {
      renderer, scene, cam, controls,
      critter: null, raf: 0, running: false, last: performance.now(),
      anim: $("staff-preview-anim")?.value || "idle",
      spin: ($("staff-preview-spin")?.value || "on") === "on",
      dragging: false, emoteT: 0, w: 0, h: 0,
    };
    this._preview = p;

    this.canvas.addEventListener("pointerdown", () => { p.dragging = true; });
    window.addEventListener("pointerup", () => { p.dragging = false; });

    // Context WebGL bisa hilang (GPU reset / tab lama di background).
    // preventDefault membuat browser boleh memulihkan context; setelah
    // pulih, ukuran framebuffer disegarkan lagi.
    this.canvas.addEventListener("webglcontextlost", (e) => e.preventDefault(), false);
    this.canvas.addEventListener("webglcontextrestored", () => this._resizePreview(), false);

    if ("ResizeObserver" in window) {
      p.ro = new ResizeObserver(() => this._resizePreview());
      if (this.canvas.parentElement) p.ro.observe(this.canvas.parentElement);
    }

    return p;
  }

  /** Mulai/hentikan render loop tanpa menyentuh WebGL context. */
  _startLoop() {
    const p = this._preview;
    if (!p || p.running) return;
    p.running = true;
    p.last = performance.now();
    p.raf = requestAnimationFrame(this._loop);
  }

  _stopLoop() {
    const p = this._preview;
    if (!p) return;
    p.running = false;
    if (p.raf) cancelAnimationFrame(p.raf);
    p.raf = 0;
  }

  _loop = () => {
    const p = this._preview;
    if (!p || !p.running) {
      if (p) p.raf = 0;
      return;
    }
    p.raf = requestAnimationFrame(this._loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - p.last) / 1000);
    p.last = now;

    const c = p.critter;
    if (c) {
      if (p.anim === "walk") {
        // jalan melingkar pelan agar tetap berada di dalam bingkai
        const a = now * 0.0012;
        c.moveDir(Math.cos(a), Math.sin(a));
      }
      c.update(dt, now / 1000, null);

      if (p.anim === "walk") {
        const r = Math.hypot(c.position.x, c.position.z);
        if (r > 0.5) {
          const k = 0.5 / r;
          c.position.x *= k;
          c.position.z *= k;
        }
      } else if (p.anim === "wave" || p.anim === "thumbsup") {
        p.emoteT -= dt;
        if (p.emoteT <= 0) {
          c.emote(p.anim);
          p.emoteT = 2.8;
        }
      }

      if (p.spin && !p.dragging) {
        c.yaw += dt * 0.55;
        c.targetYaw = c.yaw;
        c.root.rotation.y = c.yaw;
      }
    }

    p.controls.update();
    p.renderer.render(p.scene, p.cam);
  };

  _resizePreview() {
    const p = this._preview;
    if (!p || !this.canvas) return;
    // Saat modal tertutup, kotak canvas berukuran 0. Jangan mengecilkan
    // framebuffer ke ukuran itu — cukup ukur ketika benar-benar tampil.
    if (!this.isOpen) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w < 8 || h < 8) return;
    if (p.w === w && p.h === h) return;
    p.w = w;
    p.h = h;
    p.renderer.setSize(w, h, false);
    p.cam.aspect = w / h;
    p.cam.updateProjectionMatrix();
  }

  /** Model dari nilai form yang SEDANG diedit (belum tentu tersimpan),
   *  supaya preview langsung berubah saat warna/preset/spesies diganti. */
  _formModel() {
    const s = this.current;
    const base = s?.model || modelDefaults($("staff-species")?.value || "developer");
    return {
      species: $("staff-species")?.value || base.species,
      skin: $("staff-skin")?.value || base.skin,
      shirt: $("staff-shirt")?.value || base.shirt,
      pants: $("staff-pants")?.value || base.pants,
      hair: $("staff-hair")?.value || base.hair,
      eyes: $("staff-eyes")?.value || base.eyes,
      tieColor: toInt($("staff-tie")?.value || base.tieColor),
      accessory: $("staff-accessory")?.value || base.accessory || "none",
    };
  }

  _refreshPreview() {
    const p = this._ensurePreview();
    this._resizePreview();

    if (p.critter) {
      p.scene.remove(p.critter.root);
      releasePreviewMeshes(p.critter.root);
      p.critter = null;
    }

    const model = this.current ? this._formModel() : modelDefaults("developer");
    const spec = speciesById(model.species);
    const critter = new Critter({
      species: spec.id,
      name: this.current ? this.current.name : "Preview",
      department: { name: this.current ? this.current.department : "", tie: model.tieColor ?? spec.fur },
      tieColor: model.tieColor ?? spec.fur,
      variant: 0,
      appearance: appearanceFromModel(model),
    });
    critter.root.position.set(0, 0, 0);
    p.scene.add(critter.root);
    p.critter = critter;
    p.emoteT = 0;

    this._applyPreviewAnim();
    this._updatePreviewMeta();
    if (this.isOpen) this._startLoop();
  }

  _applyPreviewAnim() {
    const p = this._preview;
    if (!p?.critter) return;
    const c = p.critter;
    c.setState(null);
    c.pose("stand");
    c._oneShot = null;
    c.gestureName = null;
    c.moveDir(0, 0);
    if (p.anim === "dance") c.setState("dance");
    if (p.anim === "wave" || p.anim === "thumbsup") {
      c.emote(p.anim);
      p.emoteT = 2.8;
    }
  }

  _updatePreviewMeta() {
    const s = this.current;
    const nameEl = $("staff-preview-name");
    const subEl = $("staff-preview-sub");
    if (nameEl) nameEl.textContent = s ? ($("staff-name")?.value.trim() || s.name) : "Belum ada staf";
    if (!subEl) return;
    if (!s) {
      subEl.textContent = "Tekan “+ Staf baru” untuk menambah staf.";
      return;
    }
    const sp = speciesById($("staff-species")?.value || s.model?.species);
    const title = ($("staff-title")?.value || "").trim() || s.title;
    subEl.textContent = `${title} · ${sp.emoji} ${sp.name} · ${this._roomName($("staff-room")?.value || s.roomId)}`;
  }

  /** Teardown total — HANYA untuk membongkar aplikasi.
   *  Jangan dipanggil saat modal ditutup: `forceContextLoss()` membuat
   *  canvas tidak bisa dipakai renderer baru dengan andal. */
  _disposePreview() {
    const p = this._preview;
    if (!p) return;
    this._stopLoop();
    p.ro?.disconnect?.();
    p.controls?.dispose();
    if (p.critter) {
      p.scene.remove(p.critter.root);
      releasePreviewMeshes(p.critter.root);
      p.critter = null;
    }
    p.renderer?.dispose?.();
    try {
      p.renderer?.forceContextLoss?.();
    } catch { /* browser lama */ }
    this._preview = null;
  }
}
