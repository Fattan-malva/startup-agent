import * as THREE from "three";
import { speciesById } from "./species.js";
import { buildBody, BODY_HEIGHT, HIP_Y } from "./avatarBody.js";
import { buildHead } from "./avatarHead.js";
import { buildProps } from "./avatarProps.js";
import { G, shadowMaterial } from "./critterShared.js";

/* ===================================================================== *
 * Critter — self-contained procedural human avatar.
 * ===================================================================== */

/* Skala karakter terhadap furniture realistis di Building.js.
 * Tune 1.10 – 1.25 sesuai selera:
 *   1.10 = sedikit lebih besar
 *   1.15 = default (rekomendasi)
 *   1.20 = jelas lebih besar
 *   1.25 = raksasa mungil (bisa clipping di lorong sempit)
 */
export const AVATAR_SCALE = 1.2;

export const WALK_SPEED = 1.25;
export const RUN_SPEED = 2.7;
export const STATES = ["Idle", "Walking", "Running", "Dance", "Death", "Sitting", "Standing"];
export const EMOTES = ["Jump", "Yes", "No", "Wave", "Punch", "ThumbsUp"];
export const EXPRESSIONS = ["Angry", "Surprised", "Sad"];

const REACH = 0.26;
const ARRIVE_RADIUS = 0.75;
const STUCK_LIMIT = 1.1;
const FADE = 0.25;

/* SIT_LIFT sekarang kecil karena body sudah diskalakan. Kalau setelah
 * tuning terlihat bokong MELAYANG di atas pad → kurangi jadi 0 atau -0.01.
 * Kalau bokong MENEMBUS pad → naikkan ke 0.02 atau 0.03.
 */
const SIT_LIFT = 0.001;

function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

let ID = 0;

export class Critter {
  static get ready() { return Promise.resolve(); }

  constructor({ species, name, tieColor, department, variant = 0 } = {}) {
    this.spec = speciesById(species);
    this.id = `critter-${++ID}`;
    this.name = name || this.spec.name;
    this.department = department || null;
    this.speciesId = this.spec.id;
    this.variant = variant;
    this.tieColor = tieColor ?? this.spec.fur;
    this.status = "Idle";
    this.busy = false;
    this.controlled = false;
    this.speed = 0;
    this.walkScale = 1;
    this._stuck = 0;
    this._dodge = null;
    this.yaw = 0;
    this.targetYaw = 0;
    this.sitting = false;
    this._seatTarget = null;
    this._seating = false;
    this._seatProgress = 0;
    this._seatStartDist = 0.5;
    this._noCollide = 0;
    this.phase = 0;
    this.look = null;
    this.path = null;
    this.pathIndex = 0;
    this.pathDone = true;
    this.running = false;
    this.onFootstep = null;
    this._stepSign = 1;
    this._wish = new THREE.Vector2(0, 0);
    this._wishLen = 0;
    this._forced = null;
    this._oneShot = null;
    this._oneShotTime = 0;
    this.gestureName = null;
    this._expr = { Angry: 0, Surprised: 0, Sad: 0 };
    this._exprTarget = { Angry: 0, Surprised: 0, Sad: 0 };
    this.eyeY = BODY_HEIGHT * 0.86 * AVATAR_SCALE;
    this._death = 0;
    this._build();
  }

  _build() {
    const root = new THREE.Group();
    root.name = this.name;
    root.userData.critter = this;
    this.root = root;

    // ── Skala karakter di sini ──────────────────────────────────────
    const motion = new THREE.Group();
    motion.name = "Avatar motion";
    motion.scale.setScalar(AVATAR_SCALE);   // ← semua body/head/props ikut besar
    root.add(motion);
    this.motion = motion;

    const shadow = new THREE.Mesh(
      G("avatar-shadow-plane", () => new THREE.PlaneGeometry(0.68, 0.68)),
      shadowMaterial(),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    // Bayangan ikut membesar supaya proporsional.
    shadow.scale.set(1.42 * AVATAR_SCALE, 1.42 * AVATAR_SCALE, 1);
    shadow.renderOrder = 1;
    root.add(shadow);
    this.shadow = shadow;

    buildBody(this);
    buildHead(this);
    buildProps(this);
    this.model = this.motion;
    this._current = "Idle";
    this._lastExprUpdate = 0;
  }

  _baseState() {
    if (this._forced === "Death") return "Death";
    if (this.sitting) return "Sitting";
    if (this._seating) return "Walking";
    if (this.speed > RUN_SPEED * 0.7 || (this.running && this.speed > 0.5)) return "Running";
    if (this.speed > 0.06) return "Walking";
    if (this._forced === "Dance") return "Dance";
    return "Idle";
  }

  setState(state) {
    const s = state ? String(state).toLowerCase() : null;
    this._forced = s === "dance" ? "Dance" : s === "death" ? "Death" : null;
    if (this._forced) this._oneShot = null;
    if (!this._forced) {
      this._death = 0;
      this.motion.rotation.z = 0;
      this.body.rotation.z = 0;
    }
  }
  dance(on = true) { this.setState(on ? "dance" : null); }
  die() { this.setState("death"); }
  revive() { if (this._forced === "Death") this.setState(null); }

  emote(name) {
    if (this._forced === "Death") return;
    const raw = String(name || "").toLowerCase().replace(/[^a-z]/g, "");
    const aliases = { wave: "Wave", yes: "Yes", no: "No", jump: "Jump", punch: "Punch", thumbsup: "ThumbsUp", standing: "Standing" };
    const clip = aliases[raw];
    if (!clip) return;
    this._oneShot = clip;
    this._oneShotTime = clip === "Jump" ? 0.62 : clip === "Standing" ? 0.55 : 1.0;
    this.gestureName = raw;
  }
  gesture(name) { this.emote(name); }

  setExpression(name, amount = 1) {
    for (const k of EXPRESSIONS) this._exprTarget[k] = 0;
    if (!name) return;
    const key = EXPRESSIONS.find((e) => e.toLowerCase() === String(name).toLowerCase());
    if (key) this._exprTarget[key] = THREE.MathUtils.clamp(amount, 0, 1);
  }

  get position() { return this.root.position; }
  eyeLevel() { return this.position.y + this.eyeY; }

  moveDir(dx, dz, running = false) {
    this.path = null;
    this.pathDone = true;
    const len = Math.hypot(dx, dz);
    this._wishLen = len;
    if (len > 1e-4) this._wish.set(dx / len, dz / len);
    else this._wish.set(0, 0);
    this.running = running;
  }

  followPath(points, running = false) {
    if (!points || !points.length) { this.moveDir(0, 0); return; }
    this.path = points;
    this.pathIndex = 0;
    this.pathDone = false;
    this.running = running;
  }

  face(x, z) {
    this.targetYaw = Math.atan2(x - this.position.x, z - this.position.z);
  }

  pose(kind) {
    const wasSitting = this.sitting;
    this.sitting = kind === "sit";
    this._seatTarget = null;
    this._seating = false;
    this._seatProgress = 0;
    if (wasSitting && !this.sitting) {
      this._noCollide = 0.5;
      this.emote("standing");
    }
  }

  seatInto(x, z, yaw = null) {
    this.pose("stand");
    this._oneShot = null;
    this._seatTarget = { x, z, yaw };
    this._seating = true;
    this._seatProgress = 0;
    this._seatStartDist = Math.max(0.4, Math.hypot(x - this.position.x, z - this.position.z));
    this.path = null;
    this.pathDone = true;
  }

  lookAt(x, z) { this.look = x === null ? null : { x, z }; }

  /** Berdiri dari posisi duduk saat ini (tanpa memindahkan posisi). */
  standUp() {
    this.sitting = false;
    this._seating = false;
    this._seatTarget = null;
    this._seatProgress = 0;
    this._seatStartDist = 1;
    this._noCollide = 0.6; // biar mulus lepas dari zona kursi
    this.pose("stand");
  }

  teleport(x, z, yaw = 0) {
    this.root.position.set(x, 0, z);
    this.yaw = this.targetYaw = yaw;
    this.root.rotation.y = yaw;
    this.speed = 0;
    this.path = null;
    this.pathDone = true;
    this._wish.set(0, 0);
    this._wishLen = 0;
    this._stuck = 0;
    this._dodge = null;
    this.sitting = false;
    this._seatTarget = null;
    this._seating = false;
    this._seatProgress = 0;
    this._noCollide = 0;
    this._forced = null;
    this.motion.rotation.set(0, 0, 0);
  }

  _updateSeating(dt, elapsed) {
    const target = this._seatTarget;
    if (!target) { this._seating = false; this.pose("stand"); return; }
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.07) {
      this.position.x = target.x;
      this.position.z = target.z;
      // baru sekarang menghadap arah kursi/meja — jadi tidak ada
      // "jalan mundur pelan-pelan" ke kursi
      if (target.yaw != null) this.yaw = this.targetYaw = target.yaw;
      this.root.rotation.y = this.yaw;
      this._seatTarget = null;
      this._seating = false;
      this._seatProgress = 0;
      this.speed = 0;
      this._wish.set(0, 0);
      this._wishLen = 0;
      this.pose("sit");
      this._animate(dt, elapsed);
      return;
    }
    const k = 1 - Math.exp(-10 * dt);
    // langkah masuk kursi: jalan normal dulu; pelan hanya untuk langkah
    // terakhir, ketika sudah benar-benar mepet kursi (sisa < 0.28 m)
    const cruise = dist < 0.28 ? 0.5 : WALK_SPEED;
    this.speed += (cruise - this.speed) * k;
    const step = this.speed * dt;
    this.position.x += (dx / dist) * step;
    this.position.z += (dz / dist) * step;
    this._seatProgress = THREE.MathUtils.clamp(1 - dist / this._seatStartDist, 0, 1);
    // selama melangkah: hadap ke arah kursi (arah gerak), bukan yaw akhir
    this.targetYaw = Math.atan2(dx, dz);
    this._wish.set(dx / dist, dz / dist);
    this._wishLen = 1;
    this.yaw = dampAngle(this.yaw, this.targetYaw, 10, dt);
    this.root.rotation.y = this.yaw;
    this._animate(dt, elapsed);
  }

  update(dt, elapsed, building) {
    if (this._seating) { this._updateSeating(dt, elapsed); return; }
    if (this.path) {
      const waypoint = this.path[this.pathIndex];
      const last = this.pathIndex >= this.path.length - 1;
      const dx = waypoint.x - this.position.x;
      const dz = waypoint.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (this._stuck > STUCK_LIMIT) {
        this._stuck = 0;
        // bedakan penghalang: tembok/perabot vs karakter lain
        const aheadFree = !building || building.isFree(
          this.position.x + this._wish.x * 0.5,
          this.position.z + this._wish.y * 0.5, 0.3);
        let dodged = false;
        if (aheadFree) {
          // di depan bebas = yang menghalangi karakter lain → menghindar:
          // cari sisi kosong (kiri/kanan) lalu melesat kesamping sejenak
          const b = building;
          const px = this._wish.y, pz = -this._wish.x;
          const pref = ((this.variant + (this.name?.length ?? 0)) % 2) ? 1 : -1;
          if (b.isFree(this.position.x + px * 0.55 * pref, this.position.z + pz * 0.55 * pref, 0.3)) {
            this._dodge = { t: 0.55, x: px * pref, z: pz * pref };
            dodged = true;
          } else if (b.isFree(this.position.x - px * 0.55 * pref, this.position.z - pz * 0.55 * pref, 0.3)) {
            this._dodge = { t: 0.55, x: -px * pref, z: -pz * pref };
            dodged = true;
          }
        }
        if (!dodged) {
          // tembok/perabot → lanjutkan seperti biasa: lewati titik jalur ini
          this.pathIndex++;
          if (this.pathIndex >= this.path.length) {
            this.path = null; this.pathDone = true;
            this._wish.set(0, 0); this._wishLen = 0;
          }
        }
      } else if (dist < (last ? ARRIVE_RADIUS : REACH)) {
        this.pathIndex++;
        if (this.pathIndex >= this.path.length) {
          this.path = null; this.pathDone = true;
          this._wish.set(0, 0); this._wishLen = 0; this._stuck = 0;
        }
      } else {
        this._wish.set(dx / dist, dz / dist);
        this._wishLen = 1;
      }
    }

    const dead = this._forced === "Death";
    // hindaran aktif: sesaat melangkah ke sisi kosong sebelum melanjutkan
    // jalur, supaya tidak terus-menerus mendorong karakter di depannya
    if (this._dodge) {
      this._dodge.t -= dt;
      if (this._dodge.t <= 0) this._dodge = null;
      else this._wish.set(this._dodge.x, this._dodge.z);
    }
    const wishMax = this._wishLen > 0 && !dead && !this.sitting
      ? (this.running ? RUN_SPEED : WALK_SPEED * this.walkScale) : 0;
    const k = 1 - Math.exp(-9 * dt);
    this.speed += (wishMax - this.speed) * k;
    if (this.speed < 0.02 && wishMax === 0) this.speed = 0;

    const fromX = this.position.x;
    const fromZ = this.position.z;
    if (wishMax > 0) {
      const step = this.speed * dt;
      this.position.x += this._wish.x * step;
      this.position.z += this._wish.y * step;
      this.targetYaw = Math.atan2(this._wish.x, this._wish.y);
    } else if (this.look && this.speed < 0.06 && !this.sitting && !dead) {
      this.targetYaw = Math.atan2(this.look.x - this.position.x, this.look.z - this.position.z);
    }

    if (building) {
      building.clampToFloor(this.position, 0.36);
      if (this._noCollide > 0) this._noCollide -= dt;
      if (!this.sitting && this._noCollide <= 0) building.resolveCollisions(this.position, 0.3);
    }
    const moved = Math.hypot(this.position.x - fromX, this.position.z - fromZ);
    if (wishMax > 0 && moved < this.speed * dt * 0.35) this._stuck += dt;
    else this._stuck = 0;

    this.yaw = dampAngle(this.yaw, this.targetYaw, 10, dt);
    this.root.rotation.y = this.yaw;
    this._animate(dt, elapsed);
  }

  _animate(dt, elapsed) {
    const speed = this.speed;
    const moving = speed > 0.06 && !this.sitting;
    // langkah per detik disesuaikan agar kaki tidak terasa slow-mo sementara
    // badan meluncur cepat: lantakan tiap ~0.5 m saat jalan, ~0.8 m saat lari
    this.phase += dt * speed * (this.running ? 4.2 : 6.2);
    const stepWave = Math.sin(this.phase);
    if (moving && Math.sign(stepWave) !== this._stepSign) {
      this._stepSign = Math.sign(stepWave);
      this.onFootstep?.(this);
    } else if (!moving) this._stepSign = Math.sign(stepWave);

    if (this._oneShot) {
      this._oneShotTime -= dt;
      if (this._oneShotTime <= 0) { this._oneShot = null; this.gestureName = null; }
    }
    const walkAmount = moving ? THREE.MathUtils.clamp(speed / (this.running ? RUN_SPEED : WALK_SPEED), 0, 1.25) : 0;
    const swing = moving ? Math.sin(this.phase) * (this.running ? 0.60 : 0.41) * walkAmount : 0;
    const idleBreath = Math.sin(elapsed * 2.1 + this.variant * 0.6) * 0.006;
    const sit = this.sitting ? 1 : 0;

    // SIT_LIFT kecil karena geometri sudah diskalakan (lihat komentar di atas).
    const sitLift = sit * SIT_LIFT;
    this.body.position.y = THREE.MathUtils.damp(
      this.body.position.y,
      HIP_Y + sitLift + (moving ? Math.abs(stepWave) * 0.014 : idleBreath),
      12, dt,
    );

    this.legL.rotation.x = -swing * (1 - sit) - 0.84 * sit;
    this.legR.rotation.x = swing * (1 - sit) - 0.84 * sit;
    this.kneeL.rotation.x = Math.max(0, swing) * 0.65 + 0.84 * sit;
    this.kneeR.rotation.x = Math.max(0, -swing) * 0.65 + 0.84 * sit;
    this.ankL.rotation.x = -Math.max(0, -swing) * 0.18;
    this.ankR.rotation.x = -Math.max(0, swing) * 0.18;

    this.armL.rotation.x = swing * 0.62 + sit * -0.58;
    this.armR.rotation.x = -swing * 0.62 + sit * -0.56;
    this.armL.rotation.z = 0.07 + (moving ? 0.06 * Math.cos(this.phase) : 0);
    this.armR.rotation.z = -0.07 - (moving ? 0.06 * Math.cos(this.phase) : 0);
    this.elbowL.rotation.x = sit ? -0.42 + Math.sin(elapsed * 4.5) * 0.025 : 0.05 + Math.max(0, swing) * 0.2;
    this.elbowR.rotation.x = sit ? -0.4 + Math.sin(elapsed * 4.1 + 1) * 0.025 : 0.05 + Math.max(0, -swing) * 0.2;
    this.spine.rotation.x = (this.running && moving ? -0.045 : 0) + sit * -0.03;
    this.spine.rotation.z = Math.sin(this.phase * 0.5) * 0.018 * walkAmount;
    this.headGroup.rotation.x = Math.sin(elapsed * 1.5) * 0.012 + (this.running && moving ? -0.025 : 0);
    this.headGroup.rotation.z = Math.sin(elapsed * 1.1 + this.variant) * 0.012;

    const gesture = this._oneShot;
    if (gesture === "Wave") {
      this.armR.rotation.x = -1.55 + Math.sin(elapsed * 10) * 0.12;
      this.armR.rotation.z = -0.62;
      this.elbowR.rotation.x = -0.8;
    } else if (gesture === "Yes") {
      this.headGroup.rotation.x += Math.sin((1 - this._oneShotTime) * 12) * 0.11;
    } else if (gesture === "No") {
      this.headGroup.rotation.y = Math.sin((1 - this._oneShotTime) * 13) * 0.2;
    } else if (gesture === "Jump") {
      this.motion.position.y = Math.max(0, Math.sin((1 - this._oneShotTime / 0.62) * Math.PI)) * 0.17;
    } else if (gesture === "Punch") {
      this.armR.rotation.x = -1.0;
      this.elbowR.rotation.x = -0.18;
      this.armR.rotation.z = -0.24;
    } else if (gesture === "ThumbsUp") {
      this.armR.rotation.x = -1.15;
      this.armR.rotation.z = -0.48;
      this.elbowR.rotation.x = -0.55;
    } else if (gesture === "Standing") {
      this.body.position.y += Math.sin((1 - this._oneShotTime / 0.55) * Math.PI) * 0.018;
    } else {
      this.motion.position.y = moving ? Math.abs(stepWave) * 0.006 : 0;
    }

    if (this._forced === "Dance") {
      this.spine.rotation.z += Math.sin(elapsed * 8) * 0.14;
      this.spine.rotation.x += Math.sin(elapsed * 5) * 0.09;
      this.armL.rotation.z = 0.58 + Math.sin(elapsed * 7) * 0.36;
      this.armR.rotation.z = -0.58 - Math.cos(elapsed * 7) * 0.36;
      this.armL.rotation.x = Math.sin(elapsed * 7) * 0.55;
      this.armR.rotation.x = -Math.cos(elapsed * 7) * 0.55;
      this.body.rotation.y = Math.sin(elapsed * 5) * 0.1;
    } else {
      this.body.rotation.y = THREE.MathUtils.damp(this.body.rotation.y, 0, 8, dt);
    }

    if (this._forced === "Death") {
      this._death = THREE.MathUtils.damp(this._death, 1, 3.4, dt);
      this.motion.rotation.z = -this._death * 1.2;
      this.motion.position.y = -this._death * 0.15;
    } else {
      this._death = THREE.MathUtils.damp(this._death, 0, 5, dt);
      this.motion.rotation.z = THREE.MathUtils.damp(this.motion.rotation.z, 0, 8, dt);
    }

    const kx = 1 - Math.exp(-10 * dt);
    for (const key of EXPRESSIONS) this._expr[key] += (this._exprTarget[key] - this._expr[key]) * kx;
    const angry = this._expr.Angry, surprised = this._expr.Surprised, sad = this._expr.Sad;
    this.faceRig.browL.rotation.z = Math.PI / 2 + angry * 0.33 - sad * 0.2;
    this.faceRig.browR.rotation.z = Math.PI / 2 - angry * 0.33 + sad * 0.2;
    this.faceRig.mArc.visible = Math.max(angry, surprised) < 0.28 && sad < 0.25;
    this.faceRig.mD.visible = angry > 0.35;
    this.faceRig.mTeeth.visible = angry > 0.35;
    this.faceRig.mO.visible = surprised > 0.25;
    this.faceRig.mouth.scale.y = 1 + surprised * 0.55;
    const expressionEyeScale = 1 + surprised * 0.16;
    this.faceRig.eyeL.group.scale.y = expressionEyeScale;
    this.faceRig.eyeR.group.scale.y = expressionEyeScale;

    if (this.look && !this.sitting) {
      const desired = Math.atan2(this.look.x - this.position.x, this.look.z - this.position.z) - this.yaw;
      this.headGroup.rotation.y = THREE.MathUtils.damp(this.headGroup.rotation.y, THREE.MathUtils.clamp(desired, -0.55, 0.55), 5, dt);
    } else {
      this.headGroup.rotation.y = THREE.MathUtils.damp(this.headGroup.rotation.y, 0, 3.5, dt);
    }

    this.cupProp.rotation.x = 0;
    this.cupProp.rotation.z = 0;
    this.phoneProp.rotation.x = this.sitting ? -0.12 : 0;
    this.laptopProp.visible = false;

    this.shadow.position.y = 0.012;
    this._current = this._baseState();
  }
}