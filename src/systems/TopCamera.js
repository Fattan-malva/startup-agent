import * as THREE from "three";

/* ===================================================================== *
 *  TopCamera — an isometric 3/4 camera.
 *
 *  A parallel (orthographic) projection looking down at 35.26° from a 45°
 *  diagonal: the classic isometric diorama. Because it is parallel there
 *  is no perspective distortion — the floor plan keeps its proportions
 *  wherever it sits on screen, which is what makes a miniature read.
 *
 *    drag  → pan        wheel → zoom
 *    Q / E → rotate     WASD  → pan (only while nothing is possessed)
 *
 *  Zoom is expressed as "view height" (how many metres the viewport shows
 *  vertically), so the framing can be computed straight from the size of
 *  the building and the aspect ratio of the window.
 * ===================================================================== */

export const ISO_YAW = Math.PI / 4;
/** True isometric tilt: atan(1 / √2) ≈ 35.264°. */
export const ISO_ELEVATION = Math.atan(1 / Math.SQRT2);

const CAM_DIST = 90; // how far the parallel camera sits from its focus
const MIN_HEIGHT = 4; // closest zoom, in metres of view height
const MAX_HEIGHT = 140;
const FIT_MARGIN = 1.12; // breathing room around the building (clear of the HUD)
const DRIVE_HEIGHT = 10; // view height while you drive a critter
const PAN_X = 26;
const PAN_Z = 20;

const FPS_FOV = 64;
const FPS_SENS = 0.0028; // radians per pixel of pointer movement
const FPS_PITCH_MIN = -1.05;
const FPS_PITCH_MAX = 0.8;
/* Tingkat zoom tampilan orang pertama (1 = normal, makin besar = makin dekat). */
const FPS_ZOOM_STEPS = [1, 1.6, 2.3, 3.1];
const FPS_ZOOM_MIN = 0.8;
const FPS_ZOOM_MAX = 4;

const UP = new THREE.Vector3(0, 1, 0);

export class TopCamera {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;

    this.focus = new THREE.Vector3(0, 0, 0);
    this._target = new THREE.Vector3(0, 0, 0);
    this._panOffset = new THREE.Vector2(0, 0);

    this.yaw = ISO_YAW;
    this.targetYaw = ISO_YAW;
    this.elevation = ISO_ELEVATION;

    this.aspect = 16 / 9;
    this.fitHeight = 46; // whole floor — recomputed by `fit()`
    this.height = 46; // current view height
    this.targetHeight = 46;
    this.followTarget = null;

    /* ---- first person ---- */
    this.mode = "iso"; // "iso" | "fps"
    this.body = null; // the critter you are driving
    this.viewmodel = null;
    this.suppressDragPan = false; // dipakai Mode Edit saat men-drag perabot
    this.fpsYaw = 0;
    this.fpsPitch = -0.07;
    this.fpsZoom = 1; // 1 = normal, >1 = tampil lebih dekat
    this.fpsCamera = new THREE.PerspectiveCamera(FPS_FOV, 16 / 9, 0.05, 160);
    this.fpsCamera.rotation.order = "YXZ";
    this._t = 0;

    this._lastHeight = -1;
    this._ax = new THREE.Vector2();
    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hit = new THREE.Vector3();
    this._ndc = new THREE.Vector2();
    this._R = new THREE.Vector2();
    this._F = new THREE.Vector2();
    this._v = new THREE.Vector3();
    this._eye = new THREE.Vector3();
  }

  /* ------------------------------------------------------------- framing */

  /** The camera the renderer should use right now. */
  get activeCamera() {
    return this.mode === "fps" ? this.fpsCamera : this.camera;
  }

  get firstPerson() {
    return this.mode === "fps";
  }

  /* --------------------------------------------------------- first person */

  /**
   * Step inside a critter: the camera moves to its eyes and the critter
   * itself is hidden (you are the critter now, so you don't need to see
   * it — the viewmodel supplies the hands and sleeves).
   */
  enterFps(critter) {
    if (!critter) return;
    if (this.body) this.body.root.visible = true;
    this.mode = "fps";
    this.body = critter;
    this.fpsYaw = critter.yaw;
    this.fpsPitch = -0.07;
    this.fpsZoom = 1;
    this._applyFpsFov();
    critter.root.visible = false;
    this.viewmodel?.show(critter.spec);
    this._syncFpsCamera();
  }

  exitFps() {
    if (this.body) this.body.root.visible = true;
    this.mode = "iso";
    this.body = null;
    this.fpsZoom = 1;
    this._applyFpsFov();
    this.viewmodel?.hide();
  }

  /* --------------------------------------------------------------- zoom */

  /** Terapkan zoom tampilan orang pertama (FOV makin sempit). */
  _applyFpsFov() {
    const cam = this.fpsCamera;
    cam.fov = FPS_FOV / this.fpsZoom;
    cam.updateProjectionMatrix();
  }

  /** Set level zoom POV (1 = normal). */
  setFpsZoom(z) {
    this.fpsZoom = THREE.MathUtils.clamp(z, FPS_ZOOM_MIN, FPS_ZOOM_MAX);
    this._applyFpsFov();
    return this.fpsZoom;
  }

  /** Geser level zoom sedikit (dipakai cubit pinch di layar sentuh). */
  nudgeFpsZoom(factor) {
    return this.setFpsZoom(this.fpsZoom * factor);
  }

  /** Putar level zoom ke langkah berikutnya (tombol zoom di layar). */
  cycleFpsZoom() {
    const z = this.fpsZoom;
    let next = FPS_ZOOM_STEPS[FPS_ZOOM_STEPS.length - 1];
    for (const s of FPS_ZOOM_STEPS) {
      if (s > z + 0.01) {
        next = s;
        break;
      }
    }
    if (next <= z + 0.01) next = 1; // sudah di level terakhir → kembali normal
    this.setFpsZoom(next);
    return this.fpsZoom;
  }

  /** Label ringkas level zoom untuk tombol HUD. */
  get fpsZoomLabel() {
    return `${this.fpsZoom.toFixed(1)}×`;
  }

  /* -------------------------------------------------------------- pan */

  /**
   * Geser kamera isometrik memakai delta piksel (untuk layar sentuh).
   * Arahnya sama seperti drag tetikus: lantai ikut jari.
   */
  panByPixels(dx, dy) {
    if (this.mode === "fps") return;
    if (this.suppressDragPan) return;
    const perPixel = this.height / Math.max(this.canvas.clientHeight || 1, 1);
    const R = this._R.set(Math.cos(this.yaw), -Math.sin(this.yaw));
    const F = this._F.set(-Math.sin(this.yaw), -Math.cos(this.yaw));
    const mx = (R.x * dx - F.x * dy) * perPixel;
    const mz = (R.y * dx - F.y * dy) * perPixel;
    if (this.followTarget) {
      this._panOffset.x = THREE.MathUtils.clamp(this._panOffset.x - mx, -12, 12);
      this._panOffset.y = THREE.MathUtils.clamp(this._panOffset.y - mz, -12, 12);
    } else {
      this._target.x -= mx;
      this._target.z -= mz;
    }
  }

  /** Putar pandangan orang pertama memakai delta piksel (sentuhan layar). */
  lookByPixels(dx, dy) {
    if (this.mode !== "fps") return;
    if (this.suppressDragPan) return;
    this.fpsYaw -= dx * FPS_SENS;
    this.fpsPitch = THREE.MathUtils.clamp(
      this.fpsPitch - dy * FPS_SENS,
      FPS_PITCH_MIN,
      FPS_PITCH_MAX,
    );
  }

  _syncFpsCamera() {
    const b = this.body;
    if (!b) return;
    const cam = this.fpsCamera;
    cam.rotation.set(this.fpsPitch, this.fpsYaw + Math.PI, 0, "YXZ");
    cam.position.set(b.position.x, b.eyeLevel() + 0.3, b.position.z);
  }

  _updateFps(dt, input) {
    this._t += dt;
    const look = input.consumeDelta();
    input.wheel = 0; // no zooming while inside a body
    // Saat memilih/menggeser perabot (Mode Edit) atau saat modal terbuka,
    // delta dikonsumsi tapi TIDAK dipakai untuk memutar kamera — supaya
    // gerakan kursor menggerakkan perabot, bukan memutar pandangan.
    if (!this.suppressDragPan) {
      this.fpsYaw -= look.x * FPS_SENS;
      this.fpsPitch = THREE.MathUtils.clamp(
        this.fpsPitch - look.y * FPS_SENS,
        FPS_PITCH_MIN,
        FPS_PITCH_MAX,
      );
    }

    this._syncFpsCamera();
    const b = this.body;
    this.viewmodel?.update(dt, this._t, this.fpsCamera, {
      speed: b ? b.speed : 0,
      sitting: b ? b.sitting : false,
    });
  }

  /* ------------------------------------------------------------- framing 2 */

  /**
   * Compute the zoom level at which the whole building fits the viewport
   * for a given aspect ratio, and (by default) snap to it.
   */
  fit(bounds, aspect = this.aspect, instant = true) {
    this.aspect = aspect;
    this.fitHeight = this._fitHeightFor(bounds, aspect);
    if (instant) this.height = this.targetHeight = this.fitHeight;
    else this.targetHeight = this.fitHeight;
    this._applyProjection();
    return this.fitHeight;
  }

  /**
   * How tall the view has to be so that every corner of the footprint (and
   * the top of the walls) lands inside the frustum. Measured at the fixed
   * isometric yaw, which is the worst case for a rectangular plan — so the
   * building keeps fitting after the user rotates the view.
   */
  _fitHeightFor(bounds, aspect) {
    const cx = (bounds.x0 + bounds.x1) / 2;
    const cz = (bounds.z0 + bounds.z1) / 2;
    const y1 = bounds.y1 || 0;
    const ce = Math.cos(this.elevation);
    const se = Math.sin(this.elevation);

    const eye = this._eye.set(
      cx + Math.sin(ISO_YAW) * ce * CAM_DIST,
      se * CAM_DIST,
      cz + Math.cos(ISO_YAW) * ce * CAM_DIST,
    );
    const rot = new THREE.Matrix4().lookAt(eye, this._v.set(cx, 0, cz), UP).invert();

    let maxX = 0;
    let maxY = 0;
    for (const x of [bounds.x0, bounds.x1]) {
      for (const z of [bounds.z0, bounds.z1]) {
        for (const y of [0, y1]) {
          const p = this._v.set(x, y, z).sub(eye).applyMatrix4(rot);
          maxX = Math.max(maxX, Math.abs(p.x));
          maxY = Math.max(maxY, Math.abs(p.y));
        }
      }
    }
    const need = Math.max(maxY * 2, (maxX * 2) / Math.max(aspect, 0.2));
    return need * FIT_MARGIN;
  }

  /** The window changed size — keep the projection in sync. */
  resize(aspect) {
    this.aspect = aspect;
    this._applyProjection();
    this.fpsCamera.aspect = aspect;
    this.fpsCamera.updateProjectionMatrix();
  }

  _applyProjection() {
    const half = this.height / 2;
    const cam = this.camera;
    cam.left = -half * this.aspect;
    cam.right = half * this.aspect;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 0.1;
    cam.far = CAM_DIST * 2 + 60;
    cam.updateProjectionMatrix();
  }

  /* --------------------------------------------------------- positioning */

  setFocus(x, z, instant = false) {
    this._target.set(x, 0, z);
    this._panOffset.set(0, 0);
    if (instant) {
      this.focus.copy(this._target);
      this._apply();
    }
  }

  follow(critter) {
    this.followTarget = critter;
    this._panOffset.set(0, 0);
  }

  /** Close isometric view — used while the player drives a critter. */
  driveView() {
    this.targetHeight = DRIVE_HEIGHT;
  }

  /** Whole-floor overview, back to the default yaw. */
  overview(instant = false) {
    this.setFocus(0, 0, instant);
    this.targetYaw = ISO_YAW;
    this.targetHeight = this.fitHeight;
    if (instant) {
      this.yaw = ISO_YAW;
      this.height = this.fitHeight;
      this._applyProjection();
      this._apply();
    }
  }

  zoomBy(factor) {
    const max = Math.min(MAX_HEIGHT, this.fitHeight * 1.6);
    this.targetHeight = THREE.MathUtils.clamp(
      this.targetHeight * factor,
      MIN_HEIGHT,
      Math.max(MIN_HEIGHT + 1, max),
    );
  }

  /* ------------------------------------------------------------- controls */

  update(dt, input, controlled) {
    if (this.mode === "fps") {
      this._updateFps(dt, input);
      return;
    }

    const delta = input.consumeDelta();
    const wheel = input.wheel;
    input.wheel = 0;

    if (wheel) this.zoomBy(1 + wheel * 0.0013);

    if (input.isDown("KeyQ")) this.targetYaw += dt * 1.2;
    if (input.isDown("KeyE")) this.targetYaw -= dt * 1.2;

    // ground-plane basis of the screen: R = screen right, F = away from
    // the camera (screen "up" once projected onto the floor)
    this._R.set(Math.cos(this.yaw), -Math.sin(this.yaw));
    this._F.set(-Math.sin(this.yaw), -Math.cos(this.yaw));

    // world units per screen pixel — makes dragging track the cursor
    const perPixel = this.height / Math.max(this.canvas.clientHeight || 1, 1);

    // WASD pans only while the player is not driving a critter
    if (!controlled) {
      const ax = input.moveAxis(this._ax);
      if (ax.x !== 0 || ax.y !== 0) {
        const scale = this.height * 0.85 * dt;
        this._target.x += (this._R.x * ax.x + this._F.x * ax.y) * scale;
        this._target.z += (this._R.y * ax.x + this._F.y * ax.y) * scale;
      }
    }

    // drag grabs the floor and pulls it along with the cursor
    if (input.dragging && (delta.x || delta.y) && !this.suppressDragPan) {
      const dx = (this._R.x * delta.x - this._F.x * delta.y) * perPixel;
      const dz = (this._R.y * delta.x - this._F.y * delta.y) * perPixel;
      if (this.followTarget) {
        this._panOffset.x = THREE.MathUtils.clamp(this._panOffset.x - dx, -12, 12);
        this._panOffset.y = THREE.MathUtils.clamp(this._panOffset.y - dz, -12, 12);
      } else {
        this._target.x -= dx;
        this._target.z -= dz;
      }
    }

    // follow the driven critter
    if (this.followTarget) {
      this._target.set(
        this.followTarget.position.x + this._panOffset.x,
        0,
        this.followTarget.position.z + this._panOffset.y,
      );
    }

    this._target.x = THREE.MathUtils.clamp(this._target.x, -PAN_X, PAN_X);
    this._target.z = THREE.MathUtils.clamp(this._target.z, -PAN_Z, PAN_Z);

    const k = 1 - Math.exp(-9 * dt);
    this.focus.lerp(this._target, k);
    this.yaw += (((this.targetYaw - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI) * k;
    this.height += (this.targetHeight - this.height) * k;
    if (Math.abs(this.height - this._lastHeight) > 1e-4) {
      this._lastHeight = this.height;
      this._applyProjection();
    }
    this._apply();
  }

  _apply() {
    const ce = Math.cos(this.elevation);
    const se = Math.sin(this.elevation);
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * ce * CAM_DIST,
      se * CAM_DIST,
      this.focus.z + Math.cos(this.yaw) * ce * CAM_DIST,
    );
    this.camera.lookAt(this.focus.x, 0.6, this.focus.z);
  }

  /* -------------------------------------------------------------- picking */

  /** NDC (-1..1) → point on the floor plane (y = 0). */
  screenToGround(x, y, out = new THREE.Vector3()) {
    this._ndc.set(x, y);
    this._ray.setFromCamera(this._ndc, this.activeCamera);
    const hit = this._ray.ray.intersectPlane(this._plane, this._hit);
    if (!hit) return null;
    out.copy(hit);
    return out;
  }

  /** Ray for picking objects, rebuilt from the current pointer NDC. */
  raycaster(ndcX, ndcY) {
    this._ndc.set(ndcX, ndcY);
    this._ray.setFromCamera(this._ndc, this.activeCamera);
    return this._ray;
  }
}
