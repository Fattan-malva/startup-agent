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
export const AVATAR_SCALE = 1.6;

export const WALK_SPEED = 1.25;
export const RUN_SPEED = 2.7;
/** Kecepatan awal lompat + gravitasi (meter & detik). */
export const JUMP_SPEED = 3.4;
export const JUMP_GRAVITY = 13;
export const STATES = ["Idle", "Walking", "Running", "Dance", "Death", "Sitting", "Standing"];
export const EMOTES = ["Jump", "Yes", "No", "Wave", "Punch", "ThumbsUp"];
export const EXPRESSIONS = ["Angry", "Surprised", "Sad"];

const REACH = 0.26;
const ARRIVE_RADIUS = 0.75;
const PATH_STUCK = 0.30;   // jalur A*: respons setelah ±0,30 dtk mentok
const FREE_STUCK = 0.14;   // mode bebas (pemain): berhenti dorong cepat
const YIELD_MAX = 4;       // berapa kali "mengalah" sebelum tujuannya dibatalkan
const YIELD_TIME = 0.5;    // jeda mengalah (dtk)
const FADE = 0.25;

/* SIT_LIFT sekarang kecil karena body sudah diskalakan. Kalau setelah
 * tuning terlihat bokong MELAYANG di atas pad → kurangi jadi 0 atau -0.01.
 * Kalau bokong MENEMBUS pad → naikkan ke 0.02 atau 0.03.
 */
const SIT_LIFT = -0.1;

function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

let ID = 0;

function defaultAppearance() {
  return {
    species: "developer",
    skin: "#dca787",
    shirt: "#506a85",
    pants: "#333943",
    tieColor: 0x477da6,
    hair: "#252321",
    eyes: "#49362b",
    accessory: "none",
    glasses: false,
    headphones: false,
    hat: false,
    palette: 0,
  };
}

export class Critter {
  static get ready() { return Promise.resolve(); }

  constructor({ species, name, tieColor, department, variant = 0, appearance = null } = {}) {
    try {
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
      // faktor kecepatan tambahan (dipakai POV/FPS: jalan & lari lebih gesit)
      this.speedScale = 1;
      // lompat (Space) — offset vertikal root, lantai tetap y = 0
      this._jumpV = 0;
      this.airborne = false;
      this._stuck = 0;
      this._blockedWish = null;
      this._dodge = null;
      this._yield = 0;
      this._blockTries = 0;
      this._slow = 1;
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
      this.pathFailed = false;
      this._seatObstacle = null;
      this._seatIgnore = null;
      this._seatIgnoreT = 0;
      this._seatStuck = 0;
      this._seatCenter = null;
      this._seatYaw = 0;
      this._exiting = false;
      this._exitPending = false;
      this._exitSpot = null;
      this._exitT = 0;
      this._exitStuck = 0;
      this._exitTry = 0;
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

      // Appearance system — dynamic visual properties
      this.appearance = appearance ? { ...defaultAppearance(), ...appearance } : defaultAppearance();
      if (species) this.appearance.species = species;
      if (tieColor != null) this.appearance.tieColor = tieColor;

      this._build();
    } catch (e) {
      console.error('[Critter] Constructor failed:', e);
      throw e;
    }
  }

  _build() {
    try {
      const root = new THREE.Group();
      root.name = this.name;
      root.userData.critter = this;
      this.root = root;

      // ── Skala karakter di sini ──────────────────────────────────────
      const motion = new THREE.Group();
      motion.name = "Avatar motion";
      motion.scale.setScalar(AVATAR_SCALE);
      root.add(motion);
      this.motion = motion;

      const shadow = new THREE.Mesh(
        G("avatar-shadow-plane", () => new THREE.PlaneGeometry(0.68, 0.68)),
        shadowMaterial(),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.012;
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
    } catch (e) {
      console.error('[Critter] _build failed:', e);
      throw e;
    }
  }

  /** Rebuild visual appearance from this.appearance (call after changing colors/accessories). */
  rebuildAppearance() {
    try {
      // Buang mesh lama. Hanya sumber daya milik kritter ini (ID card:
      // plane + texture-nya) yang boleh di-dispose. Geometry dari cache
      // `G()` dan material dari `M()/MB()/shadowMaterial()` dipakai
      // bersama SELURUH kru — membuangnya membuat karakter lain (dan
      // preview di modal staf) ikut hilang / kosong.
      const drop = (group) => {
        group?.traverse?.((o) => {
          if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
          for (const m of mats) {
            if (m.userData?.shared) continue;
            m.map?.dispose?.();
            m.dispose?.();
          }
        });
      };
      drop(this.body);
      drop(this.headGroup);
      drop(this.cupProp);
      drop(this.phoneProp);
      drop(this.laptopProp);

      // Remove old groups
      if (this.body) this.motion.remove(this.body);
      if (this.headGroup) this.spine.remove(this.headGroup);
      if (this.cupProp) this.holdR.remove(this.cupProp);
      if (this.phoneProp) this.holdL.remove(this.phoneProp);
      if (this.laptopProp) this.body.remove(this.laptopProp);
      
      // Rebuild
      buildBody(this);
      buildHead(this);
      buildProps(this);
    } catch (e) {
      console.warn('[Critter] rebuildAppearance failed:', e);
    }
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
    this._cancelExit();
    this._precisePath = false;
    this.path = null;
    this.pathDone = true;
    this.pathFailed = false;
    this._yield = 0;
    this._blockTries = 0;
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) {
      const nx = dx / len;
      const nz = dz / len;
      if (this._blockedWish && nx * this._blockedWish.x + nz * this._blockedWish.z > 0.92) {
        // Stop pushing against the same wall until the input direction changes.
        this._wish.set(0, 0);
        this._wishLen = 0;
        this.running = running;
        return;
      }
      this._blockedWish = null;
      this._wish.set(nx, nz);
      this._wishLen = len;
    } else {
      this._blockedWish = null;
      this._wish.set(0, 0);
      this._wishLen = 0;
    }
    this.running = running;
  }

  followPath(points, running = false, precise = false) {
    this._cancelExit();
    this._yield = 0;
    this._blockTries = 0;
    this._precisePath = !!precise;
    if (!points || !points.length) {
      this.path = null;
      this.pathDone = true;
      this.pathFailed = true;
      this._wish.set(0, 0);
      this._wishLen = 0;
      this.running = false;
      return;
    }
    this.pathFailed = false;
    this._blockedWish = null;
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
    this._seatStuck = 0;
    if (wasSitting && !this.sitting) {
      this._noCollide = 0.5;
      this.emote("standing");
    }
  }

  seatInto(x, z, yaw = null, seat = null) {
    this.pose("stand");
    this._cancelExit();
    this._precisePath = false;
    this._oneShot = null;
    this._yield = 0;
    this._blockTries = 0;
    this._seatObstacle = seat?.obstacle || null;
    this._seatCenter = seat ? { x: seat.x, z: seat.z } : { x, z };
    this._seatYaw = yaw ?? this.yaw;
    // Collider yang boleh "diselipi" badan saat duduk: kursinya sendiri +
    // perabot yang memang ditutup kursi (meja kerja/meja rapat). Dinding
    // tidak pernah masuk daftar ini.
    const ign = [];
    if (seat?.obstacle) ign.push(seat.obstacle);
    if (seat?.overlaps) for (const o of seat.overlaps) ign.push(o);
    this._seatIgnore = ign.length ? ign : null;
    this._seatIgnoreT = 1.5;
    this._seatStuck = 0;
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
    const wasOnSeat = this.sitting || this._seating || !!this._seatTarget;
    this._precisePath = false;
    this.sitting = false;
    this._seating = false;
    this._seatTarget = null;
    this._seatProgress = 0;
    this._seatStartDist = 1;
    // Preserve the own-seat collider exception until the body has stepped clear.
    this._seatStuck = 0;
    this._seatIgnoreT = 6;        // izin menyelip sampai benar-benar keluar
    this._noCollide = 0.6; // biar mulus lepas dari zona kursi
    this.pose("stand");
    // Langkah keluar yang aman: cari titik kosong di luar kursi + meja,
    // lalu berjalan ke sana sebelum AI memilih tujuan baru. Tanpa ini,
    // badan bisa berhenti di dalam collider meja dan tidak bisa bergerak.
    this._exiting = false;
    this._exitSpot = null;
    this._exitT = 0;
    this._exitStuck = 0;
    this._exitTry = 0;
    this._exitPending = wasOnSeat && !!this._seatIgnore;
  }

  /** Batalkan fase keluar (mis. pemain langsung menekan WASD). */
  _cancelExit() {
    this._exiting = false;
    this._exitPending = false;
    this._exitSpot = null;
    this._exitT = 0;
    this._exitStuck = 0;
    this._exitTry = 0;
  }

  /**
   * Cari titik berdiri yang benar-benar bebas di sekitar kursi. Prioritas
   * arah BELAKANG kursi (menjauhi meja), lalu sisi kiri/kanan bila kursi
   * menempel dinding. Titik harus bebas, tersambung jalur utama, dan garis
   * dari posisi duduk ke titik itu tidak menembus dinding/perabot lain.
   */
  _findExitSpot(building) {
    if (!building) return null;
    const c = this._seatCenter || { x: this.position.x, z: this.position.z };
    const base = (this._seatYaw ?? this.yaw) + Math.PI;
    const ign = this._seatIgnore;
    const angles = [0, 0.5, -0.5, 1.0, -1.0, 1.55, -1.55, 2.1, -2.1, Math.PI];
    for (const r of [0.55, 0.7, 0.85, 1.0, 1.2, 1.45]) {
      for (const a of angles) {
        const x = c.x + Math.sin(base + a) * r;
        const z = c.z + Math.cos(base + a) * r;
        if (!building.isFree(x, z, 0.30)) continue;
        if (!building.walkableAt(x, z, 0.22, true)) continue;
        if (!building._lineFree(this.position.x, this.position.z, x, z, 0.26, ign)) continue;
        return { x, z };
      }
    }
    // Cadangan: titik bebas terdekat ke segala arah (tetap tanpa menembus).
    for (const r of [0.45, 0.6, 0.8, 1.0, 1.25]) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const x = c.x + Math.sin(a) * r;
        const z = c.z + Math.cos(a) * r;
        if (building.isFree(x, z, 0.30) && building.walkableAt(x, z, 0.22, true)) return { x, z };
      }
    }
    return null;
  }

  _finishExit() {
    this._exiting = false;
    this._exitPending = false;
    this._exitSpot = null;
    this._exitT = 0;
    this._exitStuck = 0;
    this._wish.set(0, 0);
    this._wishLen = 0;
    this.speed = 0;
    this.path = null;
    this.pathDone = true;
    this._seatIgnore = null;
    this._seatObstacle = null;
    this._seatIgnoreT = 0;
  }

  _updateExit(dt, elapsed, building) {
    this._exitPending = false;
    this._exiting = true;
    if (!building || !this._seatIgnore) {
      this._finishExit();
      this._animate(dt, elapsed);
      return;
    }
    if (!this._exitSpot) {
      this._exitSpot = this._findExitSpot(building);
      this._exitT = 0;
      this._exitStuck = 0;
      if (!this._exitSpot) {
        // tidak ada titik keluar yang aman → serahkan ke AI, izin menyelip
        // tetap aktif sampai badan benar-benar keluar dari collider.
        this._exiting = false;
        this._animate(dt, elapsed);
        return;
      }
    }
    const spot = this._exitSpot;
    const dx = spot.x - this.position.x;
    const dz = spot.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.07) {
      this.position.x = spot.x;
      this.position.z = spot.z;
      this._finishExit();
      this._animate(dt, elapsed);
      return;
    }
    const cruise = Math.min(1.0, 0.4 + dist * 0.8);
    const step = Math.min(dist, cruise * dt);
    const bx = this.position.x;
    const bz = this.position.z;
    building.moveSafely(this.position, (dx / dist) * step, (dz / dist) * step, 0.29, this._seatIgnore, this);
    const moved = Math.hypot(this.position.x - bx, this.position.z - bz);
    if (moved < step * 0.4) this._exitStuck += dt;
    else this._exitStuck = 0;
    this._exitT += dt;
    this.speed = moved / Math.max(dt, 1e-4);
    this.targetYaw = Math.atan2(dx, dz);
    this.yaw = dampAngle(this.yaw, this.targetYaw, 10, dt);
    this.root.rotation.y = this.yaw;
    this._wish.set(dx / dist, dz / dist);
    this._wishLen = 1;
    if (this._exitStuck > 0.5 || this._exitT > 2.4) {
      this._exitTry++;
      this._exitSpot = null;
      this._exitT = 0;
      this._exitStuck = 0;
      if (this._exitTry > 3) {
        // gagal total: jangan bikin AI menunggu selamanya
        this._exiting = false;
        this._exitSpot = null;
      }
    }
    this._animate(dt, elapsed);
  }

  teleport(x, z, yaw = 0) {
    this.root.position.set(x, 0, z);
    this.yaw = this.targetYaw = yaw;
    this.root.rotation.y = yaw;
    this.speed = 0;
    this._jumpV = 0;
    this.airborne = false;
    this.shadow.position.y = 0.012;
    this.path = null;
    this.pathDone = true;
    this._wish.set(0, 0);
    this._wishLen = 0;
    this._stuck = 0;
    this._blockedWish = null;
    this._dodge = null;
    this._yield = 0;
    this._blockTries = 0;
    this.sitting = false;
    this._seatTarget = null;
    this._seating = false;
    this._seatProgress = 0;
    this._seatObstacle = null;
    this._seatIgnore = null;
    this._seatIgnoreT = 0;
    this._seatStuck = 0;
    this._seatCenter = null;
    this._seatYaw = 0;
    this._precisePath = false;
    this._cancelExit();
    this._noCollide = 0;
    this._forced = null;
    this.motion.rotation.set(0, 0, 0);
  }

  /**
   * Lompat (Space di POV). Kalau sedang duduk, Space = BERDIRI dulu —
   * jadi pemain tidak "lompat dari kursi" dan nyangkut di meja.
   */
  jump(strength = JUMP_SPEED) {
    if (this._forced === "Death") return false;
    if (this.sitting || this._seating) { this.standUp(); return false; }
    if (this.position.y > 0.001) return false; // sudah di udara
    this._jumpV = strength;
    this.airborne = true;
    this.gesture("jump"); // pose lompat (one-shot ±0.62 s ≈ waktu di udara)
    return true;
  }

  /** Integrasi vertikal lompatan: root naik-turun, bayangan tetap di lantai. */
  _updateJump(dt) {
    if (!this.airborne && this.position.y === 0) return;
    this._jumpV -= JUMP_GRAVITY * dt;
    let y = this.position.y + this._jumpV * dt;
    if (y <= 0) {
      y = 0;
      this._jumpV = 0;
      this.airborne = false;
    }
    this.position.y = y;
    if (this.shadow) this.shadow.position.y = 0.012 - y;
  }

  _updateSeating(dt, elapsed, building) {
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
      this._seatStuck = 0;
      this.speed = 0;
      this._wish.set(0, 0);
      this._wishLen = 0;
      this.pose("sit");
      this._animate(dt, elapsed);
      return;
    }
    const k = 1 - Math.exp(-10 * dt);
    const cruise = dist < 0.28 ? 0.5 : WALK_SPEED;
    this.speed += (cruise - this.speed) * k;
    const step = Math.min(dist, this.speed * dt);
    const beforeX = this.position.x;
    const beforeZ = this.position.z;
    if (building) building.moveSafely(this.position, (dx / dist) * step, (dz / dist) * step, 0.29, this._seatIgnore, this);
    else {
      this.position.x += (dx / dist) * step;
      this.position.z += (dz / dist) * step;
    }
    const moved = Math.hypot(this.position.x - beforeX, this.position.z - beforeZ);
    if (moved < step * 0.35) this._seatStuck += dt;
    else this._seatStuck = 0;
    if (this._seatStuck > 0.45) {
      // Kalau sudah dekat kursinya, duduk di tempat saja — jangan pernah
      // gagal duduk hanya karena tersangkut pinggiran meja/kursi.
      if (dist < 0.6) {
        this.position.x = target.x;
        this.position.z = target.z;
        if (target.yaw != null) this.yaw = this.targetYaw = target.yaw;
        this.root.rotation.y = this.yaw;
        this._seatTarget = null;
        this._seating = false;
        this._seatProgress = 0;
        this._seatStuck = 0;
        this.speed = 0;
        this._wish.set(0, 0);
        this._wishLen = 0;
        this.pose("sit");
        this._animate(dt, elapsed);
        return;
      }
      this._seatTarget = null;
      this._seating = false;
      this._seatObstacle = null;
      this._seatIgnore = null;
      this._seatStuck = 0;
      this.pathFailed = true;
      this.pathDone = true;
      this.speed = 0;
      this._wish.set(0, 0);
      this._wishLen = 0;
      this.status = "Kursi terhalang";
      this._animate(dt, elapsed);
      return;
    }
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
    this._updateJump(dt);
    if (this._exiting || this._exitPending) { this._updateExit(dt, elapsed, building); return; }
    if (this._seating) { this._updateSeating(dt, elapsed, building); return; }
    if (this.path) {
      if (this._yield > 0) {
        // Sedang mengalah: diam sejenak, jangan mendorong siapa pun.
        this._yield -= dt;
        this._wish.set(0, 0);
        this._wishLen = 0;
      } else {
        this._followStep(building);
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
      ? (this.running ? RUN_SPEED : WALK_SPEED * this.walkScale) * this.speedScale : 0;
    const k = 1 - Math.exp(-9 * dt);
    this.speed += (wishMax - this.speed) * k;
    if (this.speed < 0.02 && wishMax === 0) this.speed = 0;

    const fromX = this.position.x;
    const fromZ = this.position.z;
    if (wishMax > 0) {
      const step = this.speed * dt;
      if (building) building.moveSafely(this.position, this._wish.x * step, this._wish.y * step, 0.29, this._seatIgnore, this);
      else {
        this.position.x += this._wish.x * step;
        this.position.z += this._wish.y * step;
      }
      this.targetYaw = Math.atan2(this._wish.x, this._wish.y);
    } else if (this.look && this.speed < 0.06 && !this.sitting && !dead) {
      this.targetYaw = Math.atan2(this.look.x - this.position.x, this.look.z - this.position.z);
    }

    if (building) {
      building.clampToFloor(this.position, 0.36);
      // Swept collision checks happen before each step; never push the
      // character through a neighbouring obstacle during post-correction.
      if (this._seatIgnore && !this.sitting && !this._seating) {
        // Izin "menyelip" hanya dicabut setelah badan benar-benar keluar
        // dari SEMUA collider kursi + meja (bukan cuma kursinya). Dulu
        // collider meja aktif kembali saat badan masih di dalamnya →
        // karakter beku. Sekarang aman.
        this._seatIgnoreT -= dt;
        let outside = true;
        for (const o of this._seatIgnore) {
          const cx = THREE.MathUtils.clamp(this.position.x, o.minX, o.maxX);
          const cz = THREE.MathUtils.clamp(this.position.z, o.minZ, o.maxZ);
          const ddx = this.position.x - cx;
          const ddz = this.position.z - cz;
          if (ddx * ddx + ddz * ddz < 0.29 * 0.29) { outside = false; break; }
        }
        if (outside || this._seatIgnoreT <= 0) {
          this._seatIgnore = null;
          this._seatObstacle = null;
        }
      }
      if (this._noCollide > 0) this._noCollide -= dt;
    }
    const moved = Math.hypot(this.position.x - fromX, this.position.z - fromZ);
    if (wishMax > 0 && moved < this.speed * dt * 0.2) {
      this._stuck += dt;
      if (!this.path && this._stuck > FREE_STUCK) {
        this._blockedWish = { x: this._wish.x, z: this._wish.y };
        this._wish.set(0, 0);
        this._wishLen = 0;
        this.speed = 0;
        this._stuck = 0;
      }
    } else {
      this._stuck = 0;
      // jalan lancar → kesabaran penuh lagi
      if (wishMax > 0 && moved > this.speed * dt * 0.6) this._blockTries = 0;
    }

    this.yaw = dampAngle(this.yaw, this.targetYaw, 10, dt);
    this.root.rotation.y = this.yaw;
    this._animate(dt, elapsed);
  }

  /* ------------------------------------------------------- navigasi --- *
   * Aturan: karakter TIDAK PERNAH memaksa jalan. Begitu langkahnya
   * terhalang (tembok sekat, perabot, atau karakter lain) ia langsung
   * bereaksi: nyalip ke sisi kosong → susun ulang rute → mengalah
   * (diam sejenak) → batalkan tujuan. Tidak ada dorong-dorongan, tidak
   * ada tembus-menembus.
   * -------------------------------------------------------------------- */

  /** Ikuti waypoint rute; panggil _recover begitu macet. */
  _followStep(building) {
    const waypoint = this.path[this.pathIndex];
    const last = this.pathIndex >= this.path.length - 1;
    const dx = waypoint.x - this.position.x;
    const dz = waypoint.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (this._stuck > PATH_STUCK) {
      this._stuck = 0;
      this._recover(building);
      return;
    }
    if (dist < (last ? (this._precisePath ? 0.16 : ARRIVE_RADIUS) : REACH)) {
      // Tujuan presisi (titik pendekat kursi): tempelkan badan tepat di titik
      // itu supaya garis masuk ke pad duduk benar-benar bersih.
      if (last && this._precisePath && building && dist > 0.02) {
        building.moveSafely(
          this.position,
          waypoint.x - this.position.x,
          waypoint.z - this.position.z,
          0.29, this._seatIgnore, this,
        );
      }
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) {
        this.path = null;
        this.pathDone = true;
        this._wish.set(0, 0);
        this._wishLen = 0;
        this._stuck = 0;
      }
      return;
    }
    this._wish.set(dx / dist, dz / dist);
    this._wishLen = 1;
  }

  /** Karakter lain yang berdiri tepat di depan (dalam arah gerak). */
  _bodyAhead(building, dist = 0.85, wx = null, wz = null) {
    const bodies = building?.dynamicBodies;
    if (!bodies) return null;
    let best = null;
    let bestD = dist * dist;
    for (let i = 0; i < bodies.length; i++) {
      const o = bodies[i];
      if (!o || o === this) continue;
      const dx = o.position.x - this.position.x;
      const dz = o.position.z - this.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > bestD || d2 < 1e-6) continue;
      if (wx != null && dx * wx + dz * wz < -0.1) continue; // hanya di depan
      bestD = d2;
      best = o;
    }
    return best;
  }

  /**
   * Cari sisi kosong untuk menyalip. Arahnya selalu MENJAUHI penghalang,
   * jadi dua karakter yang bertemu otomatis ambil sisi berlawanan.
   */
  _tryDodge(building, wx, wz, blocker = null) {
    if (!building) return false;
    const px = -wz; // vektor "kiri" dari arah jalan
    const pz = wx;
    let side;
    if (blocker) {
      const bx = blocker.position.x - this.position.x;
      const bz = blocker.position.z - this.position.z;
      side = bx * px + bz * pz >= 0 ? -1 : 1;
    } else {
      side = (this.variant + (this.name?.length ?? 0)) % 2 ? 1 : -1;
    }
    const bodies = building.dynamicBodies ?? [];
    const canStand = (x, z) => {
      if (!building.isFree(x, z, 0.3)) return false;
      for (let i = 0; i < bodies.length; i++) {
        const o = bodies[i];
        if (!o || o === this) continue;
        const dx = x - o.position.x;
        const dz = z - o.position.z;
        if (dx * dx + dz * dz < 0.62 * 0.62) return false;
      }
      return true;
    };
    for (const s of [side, -side]) {
      for (const len of [0.6, 0.9]) {
        const x = this.position.x + px * len * s;
        const z = this.position.z + pz * len * s;
        if (!canStand(x, z)) continue;
        this._dodge = { t: 0.5, x: px * s, z: pz * s };
        return true;
      }
    }
    return false;
  }

  /**
   * Bereaksi saat jalan terhalang: nyalip → susun ulang rute → mengalah →
   * batalkan tujuan. Selalu berhenti sebelum menabrak sesuatu.
   */
  _recover(building) {
    this._blockTries++;
    const heading = this._wishLen > 0 ? Math.atan2(this._wish.x, this._wish.y) : this.yaw;
    const wx = Math.sin(heading);
    const wz = Math.cos(heading);
    const destination = this.path ? this.path[this.path.length - 1] : null;

    // 1) ada orang tepat di depan → coba nyalip ke sisi yang kosong
    const body = this._bodyAhead(building, 0.85, wx, wz);
    if (body && this._tryDodge(building, wx, wz, body)) {
      this.status = "Nyalip dikit";
      return;
    }

    // 2) penghalang diam (tembok/sekat/perabot) ATAU orang yang bergeser →
    //    susun ulang rute. A* sudah memperhitungkan tubuh orang lain (biaya
    //    kerumunan), jadi re-route tetap menghindari tabrakan.
    if (building && destination && this._blockTries <= YIELD_MAX) {
      const replanned = building.route(this.position, destination, this);
      if (replanned && replanned.length) {
        const first = replanned[0];
        const far = Math.hypot(first.x - this.position.x, first.z - this.position.z);
        if (far > 0.15) {
          this.path = replanned;
          this.pathIndex = 0;
          if (far > 1e-4) {
            this._wish.set((first.x - this.position.x) / far, (first.z - this.position.z) / far);
            this._wishLen = 1;
          }
          return;
        }
      }
    }

    // 3) tetap buntu → MENGALAH: diam sebentar, biar yang di depan lewat
    if (this._blockTries <= YIELD_MAX * 2) {
      this._yield = YIELD_TIME + Math.random() * 0.35;
      this.speed = 0;
      this._wish.set(0, 0);
      this._wishLen = 0;
      this.status = "Memberi jalan";
      return;
    }

    // 4) sudah cukup sabar & tetap tidak bisa → batalkan, jangan menabrak
    this._blockTries = 0;
    this._yield = 0;
    this.path = null;
    this.pathDone = true;
    this.pathFailed = true;
    this.speed = 0;
    this._wish.set(0, 0);
    this._wishLen = 0;
    this.status = "Jalur terhalang";
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