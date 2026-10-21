/* ===================================================================== *
 *  TouchControls — kontrol layar sentuh.
 *
 *  Dua bagian:
 *
 *  1. Gesture di kanvas 3D
 *       • 1 jari drag  → geser peta (mode kamera atas) / lihat sekeliling
 *                        (mode kendalikan / POV)
 *       • 2 jari cubit → zoom tampilan (kamera atas: zoom dunia,
 *                        POV: zoom FOV seperti teropong)
 *       • tap          → klik objek (buka detail pegawai, jalan ke titik…)
 *
 *  2. Overlay kontrol (hanya di perangkat sentuh)
 *       • joystick kiri  → jalan / lari saat Mode Kendalikan (POV)
 *       • tombol kanan  → zoom, lompat, gunakan (interaksi), keluar POV
 *
 *  Semua event sentuh ditangani DI SINI supaya Input.js (mouse/keyboard)
 *  tidak ikut bereaksi dan menyebabkan gerak ganda.
 * ===================================================================== */

import { isTouchDevice } from "./Device.js";

const TAP_SLOP = 14; // px — jarak maksimal untuk dianggap tap
const JOY_RADIUS = 52; // px — radius knob joystick

export class TouchControls {
  constructor({
    canvas,
    rig,
    input,
    hud,
    player = null,
    onUse = null,
    onJump = null,
    onExit = null,
    onTap = null,
  } = {}) {
    this.canvas = canvas;
    this.rig = rig;
    this.input = input;
    this.hud = hud;
    this.player = player;
    this.onUse = onUse;
    this.onJump = onJump;
    this.onExit = onExit;
    this.onTap = onTap;

    this.enabled = isTouchDevice;
    this._runOn = false;

    /** pointer id → { x, y, sx, sy, moved } */
    this.pointers = new Map();
    this._pinchDist = 0;
    this._joyId = null;

    this.dom = {
      layer: document.getElementById("touch-layer"),
      joystick: document.getElementById("joystick"),
      knob: document.getElementById("joystick-knob"),
      runBtn: document.getElementById("btn-run"),
      zoomBtn: document.getElementById("btn-fps-zoom"),
      jumpBtn: document.getElementById("btn-fps-jump"),
      useBtn: document.getElementById("btn-fps-use"),
      exitBtn: document.getElementById("btn-fps-exit"),
    };

    this._bindCanvas();
    this._bindJoystick();
    this._bindButtons();

    if (!this.enabled) this.dom.layer?.setAttribute("hidden", "");
  }

  /* ------------------------------------------------------------- kanvas */

  _bindCanvas() {
    const dom = this.canvas;
    if (!dom) return;

    this._down = (e) => {
      if (!this.enabled || e.pointerType !== "touch") return;
      e.preventDefault();
      try {
        dom.setPointerCapture?.(e.pointerId);
      } catch {
        /* pointer capture ditolak — gesture tetap jalan */
      }
      this.pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        sx: e.clientX,
        sy: e.clientY,
        moved: 0,
      });
      if (this.pointers.size === 2) this._pinchDist = this._distance();
    };

    this._move = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      p.moved += Math.hypot(dx, dy);

      if (this.pointers.size === 1) {
        if (this.rig.firstPerson) this.rig.lookByPixels(dx, dy);
        else this.rig.panByPixels(dx, dy);
      } else if (this.pointers.size >= 2) {
        const d = this._distance();
        if (this._pinchDist > 0 && d > 0) {
          const ratio = this._pinchDist / d; // jari Spread → zoom in
          if (this.rig.firstPerson) this.rig.nudgeFpsZoom(ratio);
          else this.rig.zoomBy(ratio);
        }
        this._pinchDist = d;
      }
    };

    this._up = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this._pinchDist = 0;
      // tap (jarak kecil, satu jari) → treat sebagai klik objek
      if (p.moved < TAP_SLOP && this.pointers.size === 0) {
        const rect = this.canvas.getBoundingClientRect();
        const ndc = {
          x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
          y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
        };
        const click = { x: e.clientX, y: e.clientY, ndc };
        this.input?.pushClick(click);
        this.onTap?.(click);
      }
    };

    this._cancel = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this._pinchDist = 0;
    };

    dom.addEventListener("pointerdown", this._down, { passive: false });
    dom.addEventListener("pointermove", this._move, { passive: false });
    dom.addEventListener("pointerup", this._up, { passive: false });
    dom.addEventListener("pointercancel", this._cancel);
    // cegah zoom halaman / scroll dua jari di area kanvas
    dom.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    dom.addEventListener("gesturestart", (e) => e.preventDefault());
  }

  _distance() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  /* ---------------------------------------------------------- joystick */

  _bindJoystick() {
    const el = this.dom.joystick;
    if (!el) return;

    const setKnob = (dx, dy) => {
      const knob = this.dom.knob;
      if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const update = (e) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const max = Math.min(JOY_RADIUS, rect.width / 2 - 14);
      if (dist > max) {
        dx = (dx / dist) * max;
        dy = (dy / dist) * max;
      }
      setKnob(dx, dy);
      // y positif = maju (ke arah atas layar)
      const nx = max > 0 ? dx / max : 0;
      const ny = max > 0 ? -dy / max : 0;
      this.input?.setVirtualAxis(nx, ny);
    };

    this._joyDown = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      e.stopPropagation();
      this._joyId = e.pointerId;
      el.classList.add("is-active");
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* abaikan */
      }
      update(e);
    };

    this._joyMove = (e) => {
      if (this._joyId !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      update(e);
    };

    this._joyUp = (e) => {
      if (this._joyId !== e.pointerId) return;
      e.preventDefault();
      this._joyId = null;
      el.classList.remove("is-active");
      setKnob(0, 0);
      this.input?.setVirtualAxis(0, 0);
    };

    el.addEventListener("pointerdown", this._joyDown, { passive: false });
    el.addEventListener("pointermove", this._joyMove, { passive: false });
    el.addEventListener("pointerup", this._joyUp);
    el.addEventListener("pointercancel", this._joyUp);
  }

  /* ----------------------------------------------------------- tombol */

  _bindButtons() {
    const { zoomBtn, jumpBtn, useBtn, exitBtn, runBtn } = this.dom;

    const hold = (el, fn) => {
      if (!el) return;
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add("is-press");
        fn?.();
      });
      const clear = () => el.classList.remove("is-press");
      el.addEventListener("pointerup", clear);
      el.addEventListener("pointerleave", clear);
      el.addEventListener("pointercancel", clear);
    };

    hold(zoomBtn, () => {
      const z = this.rig.cycleFpsZoom();
      this._syncZoomLabel(z);
    });
    hold(jumpBtn, () => this.onJump?.());
    hold(useBtn, () => this.onUse?.());
    hold(exitBtn, () => this.onExit?.());

    // Tombol Lari: toggle. Saat aktif joystick otomatis lari.
    if (runBtn) {
      runBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._runOn = !this._runOn;
        this.input?.setRunToggle(this._runOn);
        runBtn.classList.toggle("is-active", this._runOn);
        runBtn.setAttribute("aria-pressed", this._runOn ? "true" : "false");
      });
    }
  }

  _syncZoomLabel(z) {
    const el = this.dom.zoomBtn;
    if (!el) return;
    const label = el.querySelector(".mbtn-label");
    const text = `${(z ?? this.rig.fpsZoom).toFixed(1)}×`;
    if (label) label.textContent = text;
    else el.textContent = text;
  }

  /** Dipanggil tiap frame supaya label zoom selalu sinkron. */
  update() {
    if (!this.enabled) return;
    const z = this.rig.fpsZoom;
    const el = this.dom.zoomBtn;
    if (!el) return;
    const label = el.querySelector(".mbtn-label");
    const text = `${z.toFixed(1)}×`;
    const target = label || el;
    if (target.textContent !== text) target.textContent = text;
  }

  /** Reset state saat keluar dari mode kendalikan. */
  reset() {
    this.input?.setVirtualAxis(0, 0);
    this.input?.setRunToggle(false);
    this._runOn = false;
    this.dom.runBtn?.classList.remove("is-active");
    this.dom.runBtn?.setAttribute("aria-pressed", "false");
    this.dom.joystick?.classList.remove("is-active");
    if (this.dom.knob) this.dom.knob.style.transform = "translate(0px, 0px)";
  }
}
