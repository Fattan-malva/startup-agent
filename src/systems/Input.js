import * as THREE from "three";

/* ===================================================================== *
 *  Input — keyboard, pointer, drag/click disambiguation.
 * ===================================================================== */

export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.ndc = new THREE.Vector2(0, 0);
    this.client = { x: 0, y: 0 };
    this.inside = false;

    this.down = false;
    this.downAt = { x: 0, y: 0 };
    this.dragDistance = 0;
    this.dragging = false;
    this.locked = false; // pointer lock (first-person mouse look)
    this._click = null;
    this._dbl = null;
    this.delta = new THREE.Vector2(0, 0); // pointer delta while dragging
    this.wheel = 0;
    this.keyHandlers = new Map();

    this._bind();
  }

  _bind() {
    const dom = this.dom;

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      const code = e.code;
      // don't steal typing from form fields
      if (e.target && e.target.tagName === "INPUT") return;
      this.keys.add(code);
      const fn = this.keyHandlers.get(code);
      if (fn) fn(e);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onBlur = () => this.keys.clear();

    this._onPointerMove = (e) => {
      // pointer locked → raw movement is first-person look input
      if (this.locked) {
        this.delta.x += e.movementX || 0;
        this.delta.y += e.movementY || 0;
        return;
      }
      // measure against the previous position *before* _updateNdc moves it
      const dx = e.clientX - this.client.x;
      const dy = e.clientY - this.client.y;
      this._updateNdc(e);
      this.inside = true;
      if (this.down) {
        this.delta.x += dx;
        this.delta.y += dy;
        this.dragDistance += Math.hypot(
          e.clientX - this.downAt.x,
          e.clientY - this.downAt.y,
        );
        if (this.dragDistance > 6) this.dragging = true;
      }
    };

    this._onPointerDown = (e) => {
      this._updateNdc(e);
      this.down = true;
      this.dragging = false;
      this.dragDistance = 0;
      this.downAt = { x: e.clientX, y: e.clientY };
      this.client = { x: e.clientX, y: e.clientY };
      try {
        dom.setPointerCapture?.(e.pointerId);
      } catch {
        /* synthetic pointer, or capture refused — drag still works */
      }
    };

    this._onPointerUp = (e) => {
      const wasDown = this.down;
      const wasDrag = this.dragging;
      this.down = false;
      this.dragging = false;
      this.delta.set(0, 0);
      // pointerup di luar kanvas (dock HUD, panel Tim, modal) bukan klik
      // dunia — jangan daftarkan klik, supaya tombol-tombol HUD tidak ikut
      // memicu raycast / click-walk / geser kamera
      const onCanvas = e.target === this.dom || this.dom.contains?.(e.target);
      if (!wasDown || !onCanvas) return;
      if (!wasDrag) {
        this._updateNdc(e);
        this._click = { x: e.clientX, y: e.clientY, ndc: this.ndc.clone() };
      }
    };

    this._onDblClick = (e) => {
      this._updateNdc(e);
      this._dbl = { x: e.clientX, y: e.clientY, ndc: this.ndc.clone() };
    };

    this._onWheel = (e) => {
      this.wheel += e.deltaY;
    };

    this._onLeave = () => {
      this.inside = false;
    };

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
    dom.addEventListener("pointermove", this._onPointerMove);
    dom.addEventListener("pointerdown", this._onPointerDown);
    window.addEventListener("pointerup", this._onPointerUp);
    dom.addEventListener("dblclick", this._onDblClick);
    dom.addEventListener("wheel", this._onWheel, { passive: true });
    dom.addEventListener("pointerleave", this._onLeave);

    this._onLockChange = () => {
      this.locked = document.pointerLockElement === dom;
      if (!this.locked) this.delta.set(0, 0);
    };
    document.addEventListener("pointerlockchange", this._onLockChange);
  }

  requestLock() {
    try {
      const p = this.dom.requestPointerLock?.();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* pointer lock unavailable — dragging still looks around */
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _updateNdc(e) {
    const rect = this.dom.getBoundingClientRect();
    this.client = { x: e.clientX, y: e.clientY };
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  onKey(code, fn) {
    this.keyHandlers.set(code, fn);
  }

  isDown(code) {
    return this.keys.has(code);
  }

  /** Horizontal movement axes from WASD / arrows. */
  moveAxis(out = new THREE.Vector2()) {
    const f = (this.isDown("KeyW") || this.isDown("ArrowUp") ? 1 : 0)
      - (this.isDown("KeyS") || this.isDown("ArrowDown") ? 1 : 0);
    const s = (this.isDown("KeyD") || this.isDown("ArrowRight") ? 1 : 0)
      - (this.isDown("KeyA") || this.isDown("ArrowLeft") ? 1 : 0);
    out.set(s, f);
    if (out.lengthSq() > 1) out.normalize();
    return out;
  }

  get running() {
    return this.isDown("ShiftLeft") || this.isDown("ShiftRight");
  }

  /** Returns the pending click and clears it. */
  consumeClick() {
    const c = this._click;
    this._click = null;
    return c;
  }

  consumeDoubleClick() {
    const c = this._dbl;
    this._dbl = null;
    return c;
  }

  /** Pointer delta for look controls; consumed each frame. */
  consumeDelta() {
    const d = { x: this.delta.x, y: this.delta.y };
    this.delta.set(0, 0);
    return d;
  }

  dispose() {
    window.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("pointerlockchange", this._onLockChange);
    window.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    this.dom.removeEventListener("pointermove", this._onPointerMove);
    this.dom.removeEventListener("pointerdown", this._onPointerDown);
    window.removeEventListener("pointerup", this._onPointerUp);
    this.dom.removeEventListener("dblclick", this._onDblClick);
    this.dom.removeEventListener("wheel", this._onWheel);
    this.dom.removeEventListener("pointerleave", this._onLeave);
  }
}
