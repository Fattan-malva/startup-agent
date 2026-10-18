import * as THREE from "three";

/* ===================================================================== *
 *  Player — "you".
 *
 *  Two ways to become part of the office:
 *    • create your own character, or
 *    • take over any NPC walking by.
 *  Once you have a body: WASD / click-to-walk to move, E to interact.
 * ===================================================================== */

const INTERACT_RANGE = 1.9;

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
    critter.status = "Kamu kendalikan";
    // control the character: first-person camera in the world
    this.rig.enterFps(critter);
    // plafon hanya tampil saat mode kendalikan (kamera first-person)
    this.building?.setCeilings?.(true);
    this.walkTarget = null;
    this._walkPath = null;
    this.fx?.setWalkTarget(null);
    this.hud?.setControlling({ name: critter.name, species: critter.speciesId, emoji: critter.spec.emoji });
    this.hud?.setFirstPerson(true);
    this.hud?.toast("Klik layar untuk mouse-look · WASD jalan · Esc keluar", 4200);
  }

  release() {
    if (!this.controlled) return;
    this.crew.release(this.controlled);
    this.controlled.status = "Balik kerja";
    this.controlled.walkScale = 1;
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

  setWalkTarget(point) {
    if (!this.controlled) return;
    if (this.rig.firstPerson) return; // walking is WASD when you are inside
    this.walkTarget = { x: point.x, z: point.z };
    // Compute a safe route once. An unreachable point should stop here,
    // never fall back to a direct line through furniture or partitions.
    this._walkPath = this.building.route(this.controlled.position, this.walkTarget);
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
      const ax = this.input.moveAxis(this._ax);
      const yaw = this.rig.fpsYaw;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      if (ax.x !== 0 || ax.y !== 0) {
        c.moveDir(sin * ax.y - cos * ax.x, cos * ax.y + sin * ax.x, this.input.running);
        c.status = this.input.running ? "Buru-buru! 🏃" : "Berkeliling";
      } else {
        c.moveDir(0, 0);
      }
      c.targetYaw = yaw; // the body always faces where you look
      return;
    }

    const ax = this.input.moveAxis(this._ax);
    if (ax.x !== 0 || ax.y !== 0) {
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
      if (c.pathDone && c.pathFailed) {
        this.walkTarget = null;
        this._walkPath = null;
        this.fx?.setWalkTarget(null);
        c.moveDir(0, 0);
        c.status = "Jalur terhalang";
        return;
      }
      const path = this._walkPath;
      const last = path[path.length - 1];
      const arrived = Math.hypot(last.x - c.position.x, last.z - c.position.z) < 0.3
        || (c.pathDone && !c.path);
      if (arrived) {
        this.walkTarget = null;
        this._walkPath = null;
        this.fx?.setWalkTarget(null);
        c.moveDir(0, 0);
        c.status = "Sampai tujuan";
      } else if (c.pathDone && !c.path) {
        // jalur habis tapi belum di titik akhir → hitung ulang sekali
        this._walkPath = this.building.route(c.position, this.walkTarget);
        if (!this._walkPath.length) {
          this.walkTarget = null;
          this._walkPath = null;
          this.fx?.setWalkTarget(null);
          c.moveDir(0, 0);
          c.status = "Jalur terhalang";
          return;
        }
        c.followPath(this._walkPath, false);
        c.status = "Jalan ke tujuan";
      }
    } else {
      c.moveDir(0, 0);
    }
  }

  /* ------------------------------------------------------------ actions */

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
      const msg = typeof meta.onClick === "function" ? meta.onClick(obj) : meta.hint || "";
      c.face(obj.getWorldPosition(this._tmp).x, obj.getWorldPosition(this._tmp).z);
      c.gesture("wave", 0.8);
      this.hud?.toast(msg || meta.label, 2400);
      this.onInteract?.({ kind: "prop", target: obj, message: msg });
      return;
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
