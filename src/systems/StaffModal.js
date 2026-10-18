import * as THREE from "three";
import { STAFF } from "../data/staff.js";
import { SPECIES, DEPARTMENTS } from "../character/species.js";
import { Critter } from "../character/Critter.js";

/* ===================================================================== *
 *  StaffModal — dashboard manajemen staf di meja HR.
 *  3 kolom: sidebar (daftar + buat/hapus) | content (profil/model) |
 *  preview (3D karakter).
 * ===================================================================== */

const DEPT_ROOM = {
  Engineering: "developer",
  Design: "studio",
  People: "hr",
  Executive: "ceo",
  Operations: "staff",
  Growth: "staff",
  Finance: "staff",
};

export class StaffModal {
  constructor({ building, crew, hud }) {
    this.building = building;
    this.crew = crew;
    this.hud = hud;
    this.modal = document.getElementById("staff-modal");
    this.list = document.getElementById("staff-list");
    this.canvas = document.getElementById("staff-preview-canvas");
    this.current = null;   // staff object being edited (or null for new)
    this.tab = "profile";
    this._preview = null;
    this._bind();
    this._fillDepartments();
    this._fillSpecies();
    this.renderList();
  }

  _bind() {
    document.addEventListener("click", (e) => {
      const node = e.target.closest?.("[data-action]");
      if (!node) return;
      const { action, value } = node.dataset;
      if (action === "staff-close") this.close();
      else if (action === "staff-new") this.newStaff();
      else if (action === "staff-save") this.save();
      else if (action === "staff-delete") this.delete();
      else if (action === "staff-tab") this.setTab(value);
    });
    document.getElementById("staff-dept")?.addEventListener("change", () => this._refreshDesks());
    document.getElementById("staff-list")?.addEventListener("click", (e) => {
      const li = e.target.closest?.("[data-staff-id]");
      if (li) this.select(li.dataset.staffId);
    });
    // preview menus -> re-render preview on change
    for (const id of ["staff-skin", "staff-shirt", "staff-pants", "staff-accessory", "staff-species", "staff-tie"]) {
      document.getElementById(id)?.addEventListener("change", () => this._renderPreview());
      document.getElementById(id)?.addEventListener("input", () => this._renderPreview());
    }
  }

  _fillDepartments() {
    const sel = document.getElementById("staff-dept");
    if (!sel) return;
    sel.innerHTML = "";
    for (const d of DEPARTMENTS) {
      const o = document.createElement("option");
      o.value = d.name;
      o.textContent = d.name;
      sel.appendChild(o);
    }
  }

  _fillSpecies() {
    const sel = document.getElementById("staff-species");
    if (!sel) return;
    sel.innerHTML = "";
    for (const s of SPECIES) {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = `${s.emoji} ${s.name}`;
      sel.appendChild(o);
    }
  }

  open() {
    this.modal.classList.add("is-open");
    this.hud._modalOpen = true;
    this.renderList();
    if (!this.current && STAFF.length) this.select(STAFF[0].id);
    else if (!this.current) this.newStaff();
    this._refreshDesks();
    this._renderPreview();
  }

  close() {
    this.modal.classList.remove("is-open");
    this.hud._modalOpen = false;
    if (this._preview) {
      if (this._preview.raf) cancelAnimationFrame(this._preview.raf);
      this._preview.renderer?.dispose();
      this._preview = null;
    }
  }

  renderList() {
    if (!this.list) return;
    this.list.innerHTML = "";
    for (const s of STAFF) {
      const li = document.createElement("li");
      li.dataset.staffId = s.id;
      li.className = "staff-item" + (this.current && this.current.id === s.id ? " is-active" : "");
      li.textContent = `${s.name} — ${s.title}`;
      this.list.appendChild(li);
    }
  }

  newStaff() {
    const id = `staff-${Date.now()}`;
    const s = {
      id, name: "Staf baru", title: "Jabatan", department: "Engineering",
      roomId: "developer", deskId: null,
      model: { species: "developer", tieColor: 0x477da6, skin: "#dca787", shirt: "#506a85", pants: "#333943", accessory: "none" },
    };
    STAFF.push(s);
    this.current = s;
    this.crew.spawn({
      species: s.model.species,
      name: s.name,
      department: s.department,
      tieColor: s.model.tieColor,
      roomId: s.roomId,
      deskId: s.deskId,
      staffId: s.id,
    });
    this.renderList();
    this._loadForm(s);
    this._refreshDesks();
    this._renderPreview();
  }

  select(id) {
    const s = STAFF.find((x) => x.id === id);
    if (!s) return;
    this.current = s;
    this.renderList();
    this._loadForm(s);
    this._refreshDesks();
    this._renderPreview();
  }

  _loadForm(s) {
    document.getElementById("staff-name").value = s.name || "";
    document.getElementById("staff-title").value = s.title || "";
    document.getElementById("staff-dept").value = s.department || "Engineering";
    document.getElementById("staff-species").value = s.model?.species || "developer";
    document.getElementById("staff-tie").value = "#" + (s.model?.tieColor || 0x477da6).toString(16).padStart(6, "0");
    document.getElementById("staff-skin").value = s.model?.skin || "#dca787";
    document.getElementById("staff-shirt").value = s.model?.shirt || "#506a85";
    document.getElementById("staff-pants").value = s.model?.pants || "#333943";
    document.getElementById("staff-accessory").value = s.model?.accessory || "none";
  }

  setTab(tab) {
    this.tab = tab;
    document.querySelectorAll("[data-action='staff-tab']").forEach((b) => b.classList.toggle("is-active", b.dataset.value === tab));
    document.getElementById("staff-form-profile").hidden = tab !== "profile";
    document.getElementById("staff-form-model").hidden = tab !== "model";
  }

  _refreshDesks() {
    const sel = document.getElementById("staff-desk");
    if (!sel) return;
    const dept = document.getElementById("staff-dept")?.value || this.current?.department || "Engineering";
    const roomId = DEPT_ROOM[dept] || "staff";
    if (this.current) this.current.roomId = roomId;
    const desks = this.building.seats.filter((s) => s.type === "desk" && this.building.roomAt(s.x, s.z) === roomId);
    sel.innerHTML = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "— tanpa meja —";
    sel.appendChild(none);
    for (const d of desks) {
      const o = document.createElement("option");
      o.value = d.obstacle?.owner?.userData?.editId || d.id;
      o.textContent = `${d.id} (${d.x.toFixed(1)}, ${d.z.toFixed(1)})`;
      sel.appendChild(o);
    }
    if (this.current?.deskId) sel.value = this.current.deskId;
  }

  async save() {
    if (!this.current) return;
    const s = this.current;
    s.name = document.getElementById("staff-name").value.trim() || s.name;
    s.title = document.getElementById("staff-title").value.trim() || s.title;
    s.department = document.getElementById("staff-dept").value;
    s.roomId = DEPT_ROOM[s.department] || s.roomId;
    s.deskId = document.getElementById("staff-desk").value || null;
    s.model = s.model || {};
    s.model.species = document.getElementById("staff-species").value;
    s.model.tieColor = parseInt(document.getElementById("staff-tie").value.replace("#", ""), 16);
    s.model.skin = document.getElementById("staff-skin").value;
    s.model.shirt = document.getElementById("staff-shirt").value;
    s.model.pants = document.getElementById("staff-pants").value;
    s.model.accessory = document.getElementById("staff-accessory").value;
    // persist
    try {
      const res = await fetch("/__staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(STAFF) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.hud.toast("Staf disimpan ke src/data/staff.json", 2200);
    } catch (e) {
      this.hud.toast("Simpan staf gagal (jalankan via npm run dev)", 2600);
    }
    this.renderList();
    this._renderPreview();
  }

  async delete() {
    if (!this.current) return;
    if (!confirm(`Hapus staf "${this.current.name}"?`)) return;
    const idx = STAFF.findIndex((x) => x.id === this.current.id);
    if (idx >= 0) STAFF.splice(idx, 1);
    // remove critter from scene
    const critter = this.crew.members.find((c) => c.name === this.current.name);
    if (critter) this.crew.despawn(critter);
    this.current = STAFF.length ? STAFF[0] : null;
    try {
      await fetch("/__staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(STAFF) });
    } catch { /* ignore */ }
    this.renderList();
    if (this.current) this._loadForm(this.current);
    else {
      document.getElementById("staff-name").value = "";
      document.getElementById("staff-title").value = "";
    }
    this._renderPreview();
    this.hud.toast("Staf dihapus", 2000);
  }

  _renderPreview() {
    if (!this.canvas) return;
    if (this._preview) {
      this._preview.renderer?.dispose();
      this._preview = null;
    }
    const s = this.current;
    const species = s ? (SPECIES.find((x) => x.id === (s.model?.species || "developer")) || SPECIES[0]) : SPECIES[0];
    const tieColor = s?.model?.tieColor ?? species.fur;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    renderer.setSize(this.canvas.width, this.canvas.height, false);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(45, this.canvas.width / this.canvas.height, 0.1, 100);
    cam.position.set(0, 1.2, 3.2);
    cam.lookAt(0, 1.0, 0);
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(2, 4, 3);
    scene.add(light, new THREE.AmbientLight(0xffffff, 0.6));
    const critter = new Critter({ species: species.id, name: s?.name || "Preview", department: { name: s?.department || "Engineering", tie: tieColor }, tieColor, variant: 0 });
    scene.add(critter.root);
    critter.root.position.set(0, 0, 0);
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      critter.root.rotation.y += 0.01;
      renderer.render(scene, cam);
    };
    animate();
    this._preview = { renderer, raf, scene, cam, critter };
  }
}