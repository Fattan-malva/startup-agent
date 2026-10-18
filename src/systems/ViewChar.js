import * as THREE from "three";
import { Critter } from "../character/Critter.js";
import { SPECIES } from "../character/species.js";

/* ===================================================================== *
 *  ViewChar — a tiny on-demand 3D preview of a critter, used by the
 *  "Lihat karakter" modal. A second, lazy WebGLRenderer keeps the main
 *  scene untouched; the render loop only runs while the modal is open.
 * ===================================================================== */

export class ViewChar {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.critter = null;
    this.running = false;
    this._rotY = 0;
    this._rotX = 0.25;
    this._zoom = 3.4;
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._autoRotate = true;
    this._lastT = 0;
    this._bound = false;
  }

  _ensure() {
    if (this.renderer) return;
    const r = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2028);
    const amb = new THREE.AmbientLight(0xffffff, 0.55);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(2.5, 4, 3);
    scene.add(amb, dir);
    const rim = new THREE.DirectionalLight(0xbfd6ff, 0.35);
    rim.position.set(-2, 2, -3);
    scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 40),
      new THREE.MeshLambertMaterial({ color: 0x262d36 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);
    this.scene = scene;

    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
    cam.position.set(0, 1.4, this._zoom);
    cam.lookAt(0, 0.95, 0);
    this.camera = cam;

    if (!this._bound) {
      this._bound = true;
      this.canvas.addEventListener("pointerdown", (e) => {
        this._dragging = true;
        this._lastX = e.clientX;
        this._lastY = e.clientY;
        try {
          this.canvas.setPointerCapture?.(e.pointerId);
        } catch (err) {}
      });
      this.canvas.addEventListener("pointermove", (e) => {
        if (!this._dragging) return;
        this._rotY += (e.clientX - this._lastX) * 0.012;
        this._rotX = THREE.MathUtils.clamp(
          this._rotX + (e.clientY - this._lastY) * 0.008, 0.02, 0.95,
        );
        this._lastX = e.clientX;
        this._lastY = e.clientY;
        this._autoRotate = false;
      });
      const up = () => {
        this._dragging = false;
        window.setTimeout(() => {
          this._autoRotate = true;
        }, 1200);
      };
      this.canvas.addEventListener("pointerup", up);
      this.canvas.addEventListener("pointercancel", up);
      this.canvas.addEventListener("wheel", (e) => {
        this._zoom = THREE.MathUtils.clamp(this._zoom + e.deltaY * 0.004, 2.0, 6.0);
        e.preventDefault();
      }, { passive: false });
    }
  }

  show(speciesId) {
    this._ensure();
    // size after layout
    requestAnimationFrame(() => this._resize());
    setTimeout(() => this._resize(), 60);

    if (this.critter) {
      this.scene.remove(this.critter.root);
      this.critter = null;
    }
    const sp = SPECIES.find((s) => s.id === speciesId) || SPECIES[0];
    const c = new Critter({
      species: sp.id,
      name: sp.name,
      tieColor: 0x2f6fb0,
      department: null,
    });
    c.root.position.set(0, 0, 0);
    c.root.scale.setScalar(1.6);
    this.scene.add(c.root);
    this.critter = c;
    this._rotY = 0;
    this._rotX = 0.25;
    this._zoom = 3.4;
    this._autoRotate = true;

    if (!this.running) {
      this.running = true;
      this._lastT = performance.now();
      this._loop();
    }
  }

  _resize() {
    if (!this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(120, Math.round(rect.width));
    const h = Math.max(120, Math.round(rect.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastT) / 1000);
    this._lastT = now;
    if (this.critter) {
      if (this._autoRotate && !this._dragging) this._rotY += dt * 0.6;
      this.critter.update(dt, now / 1000, null);
      // Critter.update() menimpa root.rotation.y dengan yaw internalnya setiap
      // frame — override SETELAH update supaya drag putaran benar-benar
      // terlihat (badan samping & belakang bisa dilihat).
      this.critter.yaw = this._rotY;
      this.critter.targetYaw = this._rotY;
      this.critter.root.rotation.y = this._rotY;
    }
    // orbit kamera di sekeliling karakter; drag vertikal memutar sudut pandang
    const r = this._zoom;
    const pitch = this._rotX;
    const targetY = 0.95;
    this.camera.position.set(
      0,
      targetY + Math.sin(pitch) * r,
      Math.cos(pitch) * r,
    );
    this.camera.lookAt(0, targetY, 0);
    this.renderer.render(this.scene, this.camera);
  }

  hide() {
    this.running = false;
    if (this.critter && this.scene) {
      this.scene.remove(this.critter.root);
      this.critter = null;
    }
  }
}
