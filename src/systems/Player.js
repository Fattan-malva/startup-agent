import * as THREE from "three";
import { isTouchDevice } from "./Device.js";

/* ===================================================================== *
 *  Player — "you".
 *
 *  Two ways to become part of the office:
 *    • create your own character, or
 *    • take over any NPC walking by.
 *  Once you have a body: WASD / click-to-walk to move, E to interact.
 * ===================================================================== */

const INTERACT_RANGE = 1.9;
/* Jalan & lari hanya dipercepat saat POV (first-person): sudut pandang orang
 * pertama terasa lambat kalau memakai kecepatan NPC, sementara di kamera atas
 * kecepatan normal justru lebih enak dilihat. */
const FPS_SPEED_SCALE = 1.7;

export class Player {
  constructor({ building, crew, rig, input, fx, hud, onInteract = null }) {
    this.building = building;
    this.crew = crew;
    this.rig = rig;
    this.input = input;
    this.fx = fx;
    this.hud = hud;
    this.onInteract = onInteract;

    this.controlled = null;
    this.walkTarget = null;
    this._walkPath = null;
    this._sitSeat = null;
    this._dir = new THREE.Vector2();
    this._ax = new THREE.Vector2();
    this._tmp = new THREE.Vector3();
  }

  get active() {
    return !!this.controlled;
  }

  /* -------------------------------------------------------- possession */

  spawn({ species, name, tieColor } = {}) {
    const at = { ...this.building.entrance };
    const critter = this.crew.spawn({ species, name, tieColor, at });
    this.possess(critter);
    this.hud?.toast(`${critter.name} masuk kantor — selamat bekerja! 👋`, 3200);
    return critter;
  }

  possess(critter) {
    if (!critter) return;
    if (this.controlled && this.controlled !== critter) this.crew.release(this.controlled);
    this.controlled = critter;
    this.crew.takeover(critter);
    critter.walkScale = 1.3; // a hand on the wheel walks a bit brisker
    critter.speedScale = 1;  // dipercepat hanya saat POV (lihat update)
    critter.status = "Kamu kendalikan";
    // control the character: first-person camera in the world
    this.rig.enterFps(critter);
    // plafon hanya tampil saat mode kendalikan (kamera first-person)
    this.building?.setCeilings?.(true);
    this.walkTarget = null;
    this._walkPath = null;
    this._sitSeat = null;
    this.fx?.setWalkTarget(null);
    this.hud?.setControlling({ name: critter.name, species: critter.speciesId, emoji: critter.spec.emoji });
    this.hud?.setFirstPerson(true);
    this.hud?.toast(
      isTouchDevice
        ? "Joystick kiri jalan · tombol Lari buat ngebut · kanan: zoom & gunakan 👋"
        : "Klik layar untuk mouse-look · WASD jalan · Esc keluar",
      4200,
    );
  }

  release() {
    if (!this.controlled) return;
    const seat = this._sitSeat || this.building.seatOf(this.controlled);
    if (seat) this.building.releaseSeat(seat, this.controlled);
    this._sitSeat = null;
    this.crew.release(this.controlled);
    this.controlled.status = "Balik kerja";
    this.controlled.walkScale = 1;
    this.controlled.speedScale = 1;
    this.controlled = null;
    // keluar dari mode kendalikan → plafon menghilang lagi
    this.building?.setCeilings?.(false);
    this.rig.exitFps();
    this.rig.follow(null);
    this.rig.overview();
    this.walkTarget = null;
    this._walkPath = null;
    this.fx?.setWalkTarget(null);
    this.hud?.setControlling(null);
    this.hud?.setFirstPerson(false);
    this.input?.releaseLock();
  }

  /** Lompat (Space) — hanya saat berada di dalam tubuh. */
  jump() {
    if (!this.controlled) return false;
    return this.controlled.jump();
  }

  setWalkTarget(point) {
    if (!this.controlled) return;
    if (this.rig.firstPerson) return; // walking is WASD when you are inside
    this.walkTarget = { x: point.x, z: point.z };
    this._sitSeat = null;
    // Compute a safe route once. An unreachable point should stop here,
    // never fall back to a direct line through furniture or partitions.
    this._walkPath = this.building.route(this.controlled.position, this.walkTarget, this.controlled);
    this.controlled.followPath(this._walkPath, false);
    if (!this._walkPath.length) {
      this.walkTarget = null;
      this._walkPath = null;
      this.fx?.setWalkTarget(null);
      this.hud?.toast("Tujuan tidak dapat dijangkau tanpa menabrak objek", 2400);
      return;
    }
    this.fx?.setWalkTarget(point);
  }

  /* -------------------------------------------------------------- input */

  update(dt) {
    const c = this.controlled;
    if (!c) return;

    /* ---- inside the body: WASD relative to where you are looking ---- */
    if (this.rig.firstPerson) {
      c.speedScale = FPS_SPEED_SCALE; // POV: jalan & lari lebih gesit
      const ax = this.input.moveAxis(this._ax);
      const yaw = this.rig.fpsYaw;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      if (ax.x !== 0 || ax.y !== 0) {
        this._standFromSeat();
        this._clearWalk(); // gerak manual membatalkan jalan otomatis
        c.moveDir(sin * ax.y - cos * ax.x, cos * ax.y + sin * ax.x, this.input.running);
        c.status = this.input.running ? "Buru-buru! 🏃" : "Berkeliling";
        c.targetYaw = yaw; // the body always faces where you look
      } else if (this.walkTarget && this._walkPath) {
        // jalan otomatis (mis. menuju kursi setelah tombol "Gunakan")
        this._followWalkTarget(c);
      } else {
        c.moveDir(0, 0);
        c.targetYaw = yaw;
      }
      return;
    }

    const ax = this.input.moveAxis(this._ax);
    c.speedScale = 1; // kamera atas: kecepatan normal
    if (ax.x !== 0 || ax.y !== 0) {
      this._standFromSeat();
      this.walkTarget = null;
      this._walkPath = null;
      this.fx?.setWalkTarget(null);
      // camera-relative direction
      const sin = Math.sin(this.rig.yaw);
      const cos = Math.cos(this.rig.yaw);
      const dx = cos * ax.x - sin * ax.y;
      const dz = -sin * ax.x - cos * ax.y;
      c.moveDir(dx, dz, this.input.running);
      c.status = this.input.running ? "Buru-buru! 🏃" : "Berkeliling";
    } else if (this.walkTarget && this._walkPath) {
      this._followWalkTarget(c);
    } else {
      c.moveDir(0, 0);
    }
  }

  /** Batalkan jalan otomatis (dipakai saat pemain bergerak manual). */
  _clearWalk() {
    this.walkTarget = null;
    this._walkPath = null;
    this.fx?.setWalkTarget(null);
  }

  /** Ikuti jalur A* yang sudah dihitung; duduk kalau tujuannya kursi. */
  _followWalkTarget(c) {
    if (c.pathDone && c.pathFailed) {
      this._clearWalk();
      c.moveDir(0, 0);
      c.status = "Jalur terhalang";
      return;
    }
    const path = this._walkPath;
    const last = path[path.length - 1];
    const arrived = Math.hypot(last.x - c.position.x, last.z - c.position.z) < 0.3
      || (c.pathDone && !c.path);
    if (arrived) {
      const seat = this._sitSeat;
      this._clearWalk();
      if (seat) {
        // sampai di titik pendekatan kursi → melangkah masuk & duduk
        this._sitSeat = null;
        const spot = { x: seat.sit?.x ?? seat.x, z: seat.sit?.z ?? seat.z };
        c.seatInto(spot.x, spot.z, seat.yaw ?? 0, seat);
        c.status = "Duduk santai 🪑";
        return;
      }
      c.moveDir(0, 0);
      c.status = "Sampai tujuan";
      return;
    }
    if (c.pathDone && !c.path) {
      // jalur habis tapi belum di titik akhir → hitung ulang sekali
      this._walkPath = this.building.route(c.position, this.walkTarget, c);
      if (!this._walkPath.length) {
        this._clearWalk();
        c.moveDir(0, 0);
        c.status = "Jalur terhalang";
        return;
      }
      c.followPath(this._walkPath, false);
      c.status = "Jalan ke tujuan";
    }
  }

  /* ------------------------------------------------------------ actions */

  /** Berdiri dari kursi + lepas klaimnya (dipakai saat pemain mulai jalan). */
  _standFromSeat() {
    const c = this.controlled;
    if (!c) return;
    const seat = this._sitSeat || this.building.seatOf(c);
    if (seat) this.building.releaseSeat(seat, c);
    this._sitSeat = null;
    if (c.sitting || c._seating) c.standUp();
  }

  /**
   * Duduk di kursi/sofa yang diklik: klaim kursi, cari jalan ke titik
   * pendekatan yang aman lewat A*, lalu melangkah masuk dan duduk.
   * Kalau sudah dekat (≤1 m) & garis ke titik duduk bebas → langsung duduk.
   */
  sitOn(seat) {
    const c = this.controlled;
    if (!c || !seat) return false;
    if (seat.taken && seat.taken !== c) {
      this.hud?.toast("Kursi itu sedang dipakai orang lain", 1800);
      return false;
    }
    this._standFromSeat();
    seat.taken = c;
    seat.takenAt = this.building._clock;
    seat.uses = (seat.uses || 0) + 1;
    this._sitSeat = seat;

    const ign = this.building.seatIgnore(seat);
    const spot = { x: seat.sit?.x ?? seat.x, z: seat.sit?.z ?? seat.z };
    const dist = Math.hypot(spot.x - c.position.x, spot.z - c.position.z);
    const clear = this.building._lineFree(c.position.x, c.position.z, spot.x, spot.z, 0.24, ign)
      && this.building.isFree(spot.x, spot.z, 0.24, ign);
    if (dist <= 1.0 && clear) {
      c.seatInto(spot.x, spot.z, seat.yaw ?? 0, seat);
      c.status = "Duduk santai 🪑";
      this._clearWalk();
      this._sitSeat = null;
      return true;
    }

    const approach = this.building.approachTo(seat);
    if (!approach) {
      this.building.releaseSeat(seat, c);
      this._sitSeat = null;
      this.hud?.toast("Tidak ada jalan menuju kursi itu", 2200);
      return false;
    }
    // sudah berdiri di titik pendekatan (mis. di mode POV) → langsung duduk
    if (Math.hypot(approach.x - c.position.x, approach.z - c.position.z) < 0.45) {
      c.seatInto(spot.x, spot.z, seat.yaw ?? 0, seat);
      c.status = "Duduk santai 🪑";
      this._clearWalk();
      this._sitSeat = null;
      return true;
    }
    this.walkTarget = { x: approach.x, z: approach.z };
    this._walkPath = this.building.route(c.position, approach, c);
    if (!this._walkPath.length) {
      this.building.releaseSeat(seat, c);
      this._sitSeat = null;
      this._clearWalk();
      this.hud?.toast("Tidak ada jalan menuju kursi itu", 2200);
      return false;
    }
    c.pose("stand");
    c.followPath(this._walkPath, false);
    c.status = "Menuju kursi";
    this.fx?.setWalkTarget(approach);
    this.hud?.toast("Menuju kursi…", 1600);
    return true;
  }

  /** Kursi terdekat dari posisi tubuh (untuk tombol "Gunakan" di POV). */
  _nearestSeat(maxDist = 2.4) {
    const c = this.controlled;
    if (!c) return null;
    let best = null;
    let bestD = maxDist * maxDist;
    for (const seat of this.building.seats) {
      if (seat.taken && seat.taken !== c) continue;
      const x = seat.sit?.x ?? seat.x;
      const z = seat.sit?.z ?? seat.z;
      const d2 = (x - c.position.x) ** 2 + (z - c.position.z) ** 2;
      if (d2 < bestD) {
        bestD = d2;
        best = seat;
      }
    }
    return best;
  }

  /** E — greet the nearest colleague, or use the nearest interactive prop. */
  interact() {
    const c = this.controlled;
    if (!c) return;

    const other = this.crew.nearest(c.position.x, c.position.z, INTERACT_RANGE, c);
    if (other) {
      c.gesture("wave", 1.1);
      c.face(other.position.x, other.position.z);
      other.gesture("wave", 1.0);
      other.lookAt(c.position.x, c.position.z);
      setTimeout(() => other.lookAt(null, null), 2200);
      const line = GREETINGS[Math.floor(Math.random() * GREETINGS.length)](other.name);
      c.status = `Ngobrol dengan ${other.name}`;
      other.status = `Ngobrol dengan ${c.name}`;
      this.hud?.toast(line, 2600);
      this.onInteract?.({ kind: "critter", target: other, message: line });
      return;
    }

    const obj = this._nearestInteractive(c.position.x, c.position.z);
    if (obj) {
      const meta = obj.userData.interactive;
      // kursi di dekat sini → langsung duduk (tombol "Gunakan" di POV)
      if (meta.seat && this.rig.firstPerson) {
        if (this.sitOn(meta.seat)) return;
      }
      const msg = typeof meta.onClick === "function" ? meta.onClick(obj) : meta.hint || "";
      c.face(obj.getWorldPosition(this._tmp).x, obj.getWorldPosition(this._tmp).z);
      c.gesture("wave", 0.8);
      this.hud?.toast(msg || meta.label, 2400);
      this.onInteract?.({ kind: "prop", target: obj, message: msg });
      return;
    }

    // tidak ada apa-apa di dekat sini → di POV coba duduk di kursi terdekat
    if (this.rig.firstPerson) {
      const seat = this._nearestSeat(2.6);
      if (seat && this.sitOn(seat)) return;
    }

    this.hud?.toast("Nggak ada apa-apa di dekat sini", 1600);
  }

  _nearestInteractive(x, z) {
    let best = null;
    let bestD = INTERACT_RANGE * INTERACT_RANGE;
    for (const obj of this.building.interactives) {
      obj.getWorldPosition(this._tmp);
      const dx = this._tmp.x - x;
      const dz = this._tmp.z - z;
      const d2 = dx * dx + dz * dz;
      const radius = obj.userData.interactive.radius ?? 1;
      if (d2 < bestD + radius * radius * 0.25) {
        bestD = d2;
        best = obj;
      }
    }
    return best;
  }
}

const GREETINGS = [
  (n) => `“Hei ${n}! Kopi di pantry enak nih.”`,
  (n) => `“${n}, jadi ikut standup nanti?”`,
  (n) => `“Eh ${n}, desainnya udah kelar belum?”`,
  (n) => `“${n}, jangan lupa istirahat ya.”`,
  (n) => `“Siap ${n}! Semangat hari ini.”`,
];
