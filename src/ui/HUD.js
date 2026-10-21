import { SPECIES } from "../character/species.js";
import { isTouchDevice } from "../systems/Device.js";

function byId(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

const l1 = new Intl.NumberFormat("en-US");

export class HUD {
  constructor({ onAction = () => { } } = {}) {
    this.onAction = onAction;
    this.dom = {
      root: byId("hud"),
      canvas: byId("gl"),
      tooltip: byId("tooltip"),
      tooltipTitle: byId("tooltip-title"),
      tooltipHint: byId("tooltip-hint"),
      hint: byId("hint-text"),
      crosshair: byId("crosshair"),
      toast: byId("toast"),
      help: byId("help"),
      spawn: byId("spawn"),
      speciesGrid: byId("species-grid"),
      spawnName: byId("spawn-name"),
      detailPanel: byId("detail-panel"),
      roster: byId("roster"),
      rosterList: byId("roster-list"),
      editbar: byId("editbar"),
      editBtn: byId("btn-edit"),
      dock: byId("dock"),
      dockPops: {
        camera: byId("pop-camera"),
        time: byId("pop-time"),
        more: byId("pop-more"),
      },
      editTarget: byId("edit-target"),
      editSaveState: byId("edit-save-state"),
      editMats: byId("edit-mats"),
      editSnap: byId("btn-snap"),
      editUndo: byId("edit-undo"),
      editRedo: byId("edit-redo"),
      controlInfo: byId("control-info"),
      btnRelease: byId("btn-release"),
      loader: byId("loader"),
      loaderBar: byId("loader-bar"),
      loaderLabel: byId("loader-label"),
      loaderPct: byId("loader-pct"),
      loaderLog: byId("loader-log"),
      loaderError: byId("loader-error"),
      stats: {
        fps: byId("st-fps"),
        pop: byId("st-pop"),
        calls: byId("st-calls"),
        tris: byId("st-tris"),
      },
    };

    this._toastTimer = 0;
    this._helpOpen = false;
    this._spawnOpen = false;
    this._rosterOpen = true;
    this._editOpen = false;
    this._selectedSpecies = SPECIES[0].id;
    this._lastMsg = null;
    this._fps = false;
    this._staffOpen = false;
    this._logLines = [];
    this._lastLogLabel = null;
    this._dockMenu = null;

    this._buildSpeciesGrid();
    this._bind();
  }

  /* -------------------------------------------------------------- binding */
  _bind() {
    document.addEventListener("click", (e) => {
      const node = e.target.closest?.("[data-action]");
      if (!node) return;
      const { action, value } = node.dataset;
      e.preventDefault();
      this.onAction(action, value ?? "", node);
      // aksi dari dock menutup daftar yang sedang terbuka
      this.closeDockMenu();
    });

    // ikon dock → buka/tutup daftar mengambang di atas dock
    document.addEventListener("click", (e) => {
      const toggle = e.target.closest?.("[data-dock-toggle]");
      if (!toggle) return;
      e.preventDefault();
      this.toggleDockMenu(toggle.dataset.dockToggle);
    });

    // klik di luar daftar/dock → tutup daftar mengambang
    document.addEventListener("click", (e) => {
      if (!this._dockMenu) return;
      if (e.target.closest?.("[data-dock-menu]")) return;
      this.closeDockMenu();
    });

    for (const el of document.querySelectorAll("#hud .panel, .modal")) {
      el.addEventListener("pointerdown", (e) => e.stopPropagation());
    }

    /* Klik di luar kartu modal → tutup. Pengecualian: Manajemen Staf
       (banyak isian, gampang kepencet) dan Mode Edit (panel, bukan modal). */
    for (const modal of document.querySelectorAll(".modal")) {
      if (modal.id === "staff-modal") continue;
      if (modal.id === "editbar") continue; // panel edit harus tetap terbuka
      modal.addEventListener("click", (e) => {
        if (e.target !== modal) return; // klik di dalam kartu
        const close = modal.querySelector("[data-action$='-close']");
        if (close) this.onAction(close.dataset.action, "", close);
        else modal.classList.remove("is-open");
      });
    }

    /* Klik di area dunia (bukan panel/modal) → tutup panel detail karakter
       dan daftar tim. Panel/modal punya stopPropagation pointerdown di atas,
       jadi handler ini hanya menerima klik di luar UI. */
    document.addEventListener("pointerdown", () => {
      if (this.detailOpen) this.onAction("detail-close", "", null);
      if (this._rosterOpen) this.toggleRoster(false);
    });

    const nameInput = this.dom.spawnName;
    if (nameInput) {
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.onAction("spawn-confirm", "", nameInput);
      });
    }
  }

  /* ------------------------------------------------------ dock dropdown */

  /**
   * Buka/tutup daftar mengambang di atas dock (kamera / suasana / menu).
   * Hanya satu boleh terbuka; klik ikon yang sama menutupnya lagi.
   */
  toggleDockMenu(key) {
    const same = this._dockMenu === key;
    this.closeDockMenu();
    if (same) return false;
    const pop = this.dom.dockPops?.[key];
    if (!pop) return false;
    this._dockMenu = key;
    pop.classList.add("is-open");
    // toast disembunyikan supaya tidak tembus pandang di balik panel
    this.dom.toast?.classList.remove("is-show");
    const btn = document.querySelector(`[data-dock-toggle="${key}"]`);
    btn?.classList.add("is-active");
    btn?.setAttribute("aria-expanded", "true");
    return true;
  }

  closeDockMenu() {
    if (!this._dockMenu) return;
    const pop = this.dom.dockPops?.[this._dockMenu];
    pop?.classList.remove("is-open");
    const btn = document.querySelector(`[data-dock-toggle="${this._dockMenu}"]`);
    btn?.classList.remove("is-active");
    btn?.setAttribute("aria-expanded", "false");
    this._dockMenu = null;
  }

  get dockMenuOpen() {
    return !!this._dockMenu;
  }

  _buildSpeciesGrid() {
    const t = this.dom.speciesGrid;
    if (!t) return;
    t.innerHTML = "";
    for (const sp of SPECIES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "species-btn" + (sp.id === this._selectedSpecies ? " is-active" : "");
      btn.dataset.action = "spawn-species";
      btn.dataset.value = sp.id;
      btn.innerHTML = `<span class="species-emoji">${sp.emoji}</span><span class="species-name">${esc(sp.name)}</span>`;
      t.appendChild(btn);
    }
  }

  setSpeciesSelected(id) {
    this._selectedSpecies = id;
    for (const el of this.dom.speciesGrid?.children || []) {
      el.classList.toggle("is-active", el.dataset.value === id);
    }
  }

  get speciesSelected() {
    return this._selectedSpecies;
  }

  get spawnName() {
    return this.dom.spawnName?.value?.trim() || "";
  }

  /* Panel detail PEGAWAI bukan modal: seperti dock/roster, tidak boleh
   * memblokir drag kamera atau klik di dunia (termasuk di POV). */
  get modalOpen() {
    return this._spawnOpen || this._helpOpen || this._staffOpen;
  }

  /** true kalau panel detail pegawai sedang terbuka. */
  get detailOpen() {
    return !!this.dom.detailPanel?.classList.contains("is-open");
  }

  /** true kalau perangkat sentuh atau layarnya sempit (mode mobile). */
  get isMobile() {
    return (
      document.documentElement.classList.contains("is-touch") ||
      (typeof window !== "undefined" &&
        window.matchMedia("(max-width: 820px)").matches)
    );
  }

  /* --------------------------------------------------------------- stats */
  setStats(s = {}) {
    const e = this.dom.stats;
    const set = (el, val) => {
      if (el && el.textContent !== val) el.textContent = val;
    };
    if (s.fps != null) set(e.fps, s.fps.toFixed(0));
    if (s.pop != null) set(e.pop, String(s.pop));
    if (s.calls != null) set(e.calls, l1.format(s.calls));
    if (s.triangles != null)
      set(e.tris, `${(s.triangles / 1000).toFixed(1)}k`);
  }

  setCursor(c) {
    if (this.dom.canvas) this.dom.canvas.style.cursor = c;
  }

  /* -------------------------------------------------------- first person */
  setFirstPerson(on) {
    this._fps = !!on;
    this.dom.root?.classList.toggle("is-fps", this._fps);
    this.dom.crosshair?.classList.remove("is-hot");
    this.setHint(
      this._fps
        ? (isTouchDevice
          ? "Joystick kiri jalan · tombol Lari buat ngebut · kanan: zoom, lompat, gunakan · drag layar buat lihat sekeliling"
          : "Klik untuk mouse-look · WASD jalan · Shift lari · Space lompat · E sapa/pakai · B edit · Esc keluar")
        : (isTouchDevice
          ? "1 jari geser peta · 2 jari cubit zoom · tap pegawai buat lihat detail"
          : "Drag untuk geser · scroll untuk zoom · klik pegawai untuk detail"),
    );
  }

  get firstPerson() {
    return !!this._fps;
  }

  setCrosshairHot(on) {
    this.dom.crosshair?.classList.toggle("is-hot", !!on);
  }

  setHint(text) {
    if (!this.dom.hint || typeof text !== "string") return;
    if (this.dom.hint.textContent !== text) this.dom.hint.textContent = text;
  }

  setActive(action, value) {
    const nodes = document.querySelectorAll(`[data-action="${action}"]`);
    for (const n of nodes) {
      n.classList.toggle("is-active", n.dataset.value === String(value));
    }
  }

  setControlling(c) {
    if (c) {
      this.dom.controlInfo.textContent = `${c.emoji} ${c.name}`;
      this.dom.controlInfo.classList.add("is-live");
      this.dom.controlInfo.hidden = false;
      if (this.dom.btnRelease) this.dom.btnRelease.hidden = false;
    } else {
      this.dom.controlInfo.textContent = "Penonton";
      this.dom.controlInfo.classList.remove("is-live");
      this.dom.controlInfo.hidden = true;
      if (this.dom.btnRelease) this.dom.btnRelease.hidden = true;
    }
  }

  /* --------------------------------------------------------------- roster */
  toggleRoster(force) {
    const open =
      typeof force === "boolean" ? force : !this._rosterOpen;
    this._rosterOpen = open;
    this.dom.roster?.classList.toggle("is-open", open);
    return open;
  }

  renderRoster(list) {
    const ul = this.dom.rosterList;
    if (!ul || !this._rosterOpen) return;
    ul.innerHTML = "";
    for (const c of list) {
      const li = document.createElement("li");
      li.className = "roster-item" + (c.controlled ? " is-you" : "");
      li.dataset.action = "select-critter";
      li.dataset.value = c.id;
      li.innerHTML = `
        <span class="roster-emoji">${c.emoji}</span>
        <span class="roster-body">
          <span class="roster-name">${esc(c.name)}${c.controlled ? " · kamu" : ""}</span>
          <span class="roster-status">${esc(c.status)}</span>
        </span>
        <span class="roster-tie" style="background:#${(c.tie >>> 0)
          .toString(16)
          .padStart(6, "0")}"></span>`;
      ul.appendChild(li);
    }
  }

  /* ------------------------------------------------------------ edit mode */
  toggleEditBar(force) {
    const open =
      typeof force === "boolean" ? force : !this._editOpen;
    this._editOpen = open;
    this.dom.editbar?.classList.toggle("is-open", open);
    this.dom.root?.classList.toggle("is-editing", open);
    return open;
  }

  get editOpen() {
    return !!this._editOpen;
  }

  setEditTarget(text) {
    if (!this.dom.editTarget) return;
    if (this.dom.editTarget.textContent !== text) this.dom.editTarget.textContent = text;
  }

  setEditSave(text, ok = null) {
    const el = this.dom.editSaveState;
    if (!el) return;
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle("is-ok", ok === true);
    el.classList.toggle("is-bad", ok === false);
  }

  setViewCycle(text) {
    const label = document.getElementById("view-cycle-label");
    if (label && label.textContent !== text) label.textContent = text;
    // tandai tombol arah aktif di daftar kamera
    const m = /:\s*(\S+)\s*$/.exec(text || "");
    const cur = m ? m[1] : "";
    for (const b of document.querySelectorAll('[data-action="view"]')) {
      b.classList.toggle("is-active", b.textContent.trim() === cur);
    }
  }

  setEditSnap(on) {
    this.dom.editSnap?.classList.toggle("is-active", !!on);
  }

  renderEditMats(list, activeKey) {
    const wrap = this.dom.editMats;
    if (!wrap) return;
    wrap.innerHTML = "";
    for (const m of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sw" + (m.key === activeKey ? " is-active" : "");
      b.dataset.action = "edit-mat";
      b.dataset.value = m.key;
      b.title = m.label;
      b.style.setProperty("--c", m.color);
      wrap.appendChild(b);
    }
  }

  /* ----------------------------------------------------------- info card */
  /* Kartu lama di panel brand DIHAPUS. Detail pegawai kini tampil di
   * panel "Detail pegawai" (modal) — lihat systems/CharDetail.js. */

  /** Benda yang diklik: cukup keterangan singkat lewat toast. */
  openCard(meta, message = null) {
    if (!meta) return;
    const text = message || meta.hint || meta.label || "";
    if (text) this.toast(`${meta.label ? meta.label + " — " : ""}${text}`, 2400);
  }

  closeCard() {
    /* tidak ada kartu di panel brand lagi */
  }

  /* -------------------------------------------------------------- spawn */
  toggleSpawn(force) {
    const open =
      typeof force === "boolean" ? force : !this._spawnOpen;
    this._spawnOpen = open;
    this.dom.spawn?.classList.toggle("is-open", open);
    return open;
  }

  /* --------------------------------------------------------------- help */
  toggleHelp(force) {
    const open =
      typeof force === "boolean" ? force : !this._helpOpen;
    this._helpOpen = open;
    this.dom.help?.classList.toggle("is-open", open);
    return open;
  }

  /* ------------------------------------------------------------- staff */
  setStaffModal(open) {
    this._staffOpen = !!open;
  }

  toast(msg, duration = 2200) {
    const el = this.dom.toast;
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove("is-show"), duration);
  }

  /* ----------------------------------------------------------- tooltip */
  showTooltip(meta) {
    const t = this.dom.tooltip;
    if (!t) return;
    this.dom.tooltipTitle.textContent = meta?.label || "";
    this.dom.tooltipHint.textContent = meta?.hint || "";
    t.classList.add("is-show");
  }

  hideTooltip() {
    this.dom.tooltip?.classList.remove("is-show");
  }

  placeTooltip(ndc, meta) {
    const t = this.dom.tooltip;
    if (!t) return;
    const rect = this.dom.canvas?.getBoundingClientRect();
    if (!rect) return;
    const x = rect.left + (ndc.x * 0.5 + 0.5) * rect.width;
    const y = rect.top + (-ndc.y * 0.5 + 0.5) * rect.height;
    t.style.left = `${x}px`;
    t.style.top = `${y}px`;
  }

  /* ------------------------------------------------------------- loader */

  /**
   * Tambah satu baris ke "build log" pada layar pemuatan.
   * Baris lama digeser ke atas, yang baru muncul dengan animasi.
   */
  log(text, kind = "ok") {
    const list = this.dom.loaderLog;
    if (!list || !text) return;
    const li = document.createElement("li");
    li.className = `log-line log-line--${kind}`;
    const mark = document.createElement("span");
    mark.className = "log-mark";
    mark.textContent = kind === "warn" ? "!" : kind === "err" ? "×" : "›";
    const span = document.createElement("span");
    span.className = "log-text";
    span.textContent = text;
    li.append(mark, span);
    list.append(li);
    this._logLines.push(li);
    // sisakan maksimal 6 baris terakhir supaya loader tetap ringkas
    while (this._logLines.length > 6) {
      const old = this._logLines.shift();
      old?.remove();
    }
    list.scrollTop = list.scrollHeight;
  }

  setProgress(pct, label) {
    if (this.dom.loaderBar) {
      this.dom.loaderBar.style.width = `${Math.round(pct * 100)}%`;
    }
    if (this.dom.loaderLabel && label) this.dom.loaderLabel.textContent = label;
    if (this.dom.loaderPct) {
      this.dom.loaderPct.textContent = `${Math.round(pct * 100)}%`;
    }
    // build log: setiap label baru jadi satu baris
    if (label && label !== this._lastLogLabel) {
      this._lastLogLabel = label;
      this.log(label);
    }
  }

  hideLoader(delay = 0) {
    setTimeout(() => {
      this.dom.loader?.classList.add("is-done");
      // tampilkan HUD + canvas hanya setelah loader mulai memudar,
      // supaya tidak ada kedipan HTML/CSS yang belum terpasang
      this.dom.root?.classList.add("is-ready");
      this.dom.canvas?.classList.add("is-ready");
    }, delay);
  }

  showError(msg) {
    if (this.dom.loaderError) {
      this.dom.loaderError.hidden = false;
      this.dom.loaderError.textContent = msg;
    }
  }
}
