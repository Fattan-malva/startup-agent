/* ===================================================================== *
 *  Brain — the little life-sim behind every NPC critter.
 *
 *  A tiny goal state machine: pick a goal → walk to it → do the thing
 *  → pick the next one. Decisions are cheap and only run on arrival, so
 *  the per-frame cost per critter is a couple of vector ops.
 * ===================================================================== */

const TYPING = ["Deep work — kode ngebut", "Menjawab email", "Review desain", "Ngejar deadline"];
const STROLL = ["Jalan-jalan santai", "Cari kopi", "Ngobrol di lorong"];
const BREAK = ["Istirahat sejenak", "Rebahan bentar", "Ngisi ulang energi"];

export class Brain {
  constructor(critter, ctx) {
    this.c = critter;
    this.b = ctx.building;
    this.crew = ctx.crew;

    this.paused = false;
    this.stage = "idle"; // idle | travel | act
    this.goal = null;
    this.actTime = 0;
    this.seat = null;
    this.partner = null;

    this._chooseGoal();
  }

  /* --------------------------------------------------------------- goals */

  _roomOf(point) {
    return this.b.roomAt(point.x, point.z);
  }

  _walkTo(target, running, via = null) {
    // A* routing menangani pendekatan + menghindari tembok/perabot;
    // titik via lama tidak diperlukan lagi.
    void via;
    const path = this.b.route(this.c.position, target, this.c);
    this.c.pose("stand");
    this.c.followPath(path, running);
  }

  _freeDesk() {
    const seat = this.b.claimSeat("desk", this.c);
    return seat;
  }

  _beginTravel(goal) {
    this.goal = goal;
    this.stage = "travel";
    let target = goal.target;
    if (goal.seat) {
      target = this.b.approachTo(goal.seat);
      if (!target) {
        this._finish();
        this.c.status = "Kursi tidak dapat dijangkau";
        return;
      }
      goal.approach = target;
    }
    const dist = Math.hypot(target.x - this.c.position.x, target.z - this.c.position.z);
    this.c.status = goal.travelStatus || "Ke suatu tempat";
    this._walkTo(target, dist > 6, goal.via || null);
  }

  _beginAct(duration, status, pose = "stand") {
    this.stage = "act";
    this.actTime = duration;
    this.c.status = status;
    if (pose === "sit" && this.goal && this.goal.seat) {
      return this._approachAndSit(this.goal.seat);
    }
    pose = pose === "sit" ? "stand" : pose;
    this.c.pose(pose);
    if (this.goal && this.goal.yaw != null) this.c.targetYaw = this.goal.yaw;
  }

  /**
   * Duduk yang wajar: kalau masih jauh dari kursi, JALAN NORMAL lewat rute
   * A* sampai samping kursi (sel terjalan terdekat — tidak menembus
   * perabot/tembok), baru melangkah pendek masuk ke pad duduk lalu berhenti.
   */
  _approachAndSit(seat) {
    const spot = { x: seat.sit?.x ?? seat.x, z: seat.sit?.z ?? seat.z };
    const ign = this.b.seatIgnore(seat);
    const clearToSeat = this.b._lineFree(
      this.c.position.x, this.c.position.z, spot.x, spot.z, 0.24, ign,
    ) && this.b.isFree(spot.x, spot.z, 0.24, ign);
    if (!clearToSeat) {
      const approach = this.b.approachTo(seat);
      const path = approach ? this.b.route(this.c.position, approach, this.c) : [];
      if (path.length && Math.hypot(approach.x - this.c.position.x, approach.z - this.c.position.z) > 0.25) {
        this.goal.approach = approach;
        this.stage = "travel";
        this.c.status = "Mencari akses ke kursi";
        this.c.pose("stand");
        this.c.followPath(path, false, true);
        return;
      }
      this._finish();
      this.c.status = "Kursi terhalang";
      return;
    }
    // Final movement ignores this seat's own collider (+ perabot yang menempel
    // di titik duduk, mis. meja yang ditutup kursi), never walls/tables lain.
    this.c.seatInto(spot.x, spot.z, seat.yaw ?? this.goal?.yaw, seat);
  }

  /**
   * Where a body actually ends up on a seat (a little forward of the pad
   * centre, so it rests against the backrest instead of inside it).
   */
  _seatSpot(seat) {
    return seat.sit || { x: seat.x, z: seat.z };
  }

  _finish() {
    if (this.seat) {
      this.b.releaseSeat(this.seat, this.c);
      this.seat = null;
    }
    if (this.partner) {
      this.partner.brain && (this.partner.brain.paused = false);
      this.partner.status = "Lanjut kerja";
      this.partner.lookAt(null, null);
      this.partner = null;
    }
    this.goal = null;
    this.stage = "idle";
    if (this.c.sitting || this.c._seating) this.c.standUp();
    else this.c.pose("stand");
    this.c.lookAt(null, null);
  }

  _chooseGoal() {
    const roll = Math.random();
    if (roll < 0.28) return this._goalWork();
    if (roll < 0.42) return this._goalWander();
    if (roll < 0.54) return this._goalCoffee();
    if (roll < 0.62) return this._goalWater();
    if (roll < 0.76) return this._goalChat();
    if (roll < 0.88) return this._goalSitAny();
    if (roll < 0.94) return this._goalCooler();
    return this._goalMeeting();
  }

  /**
   * Ambil kursi kosong yang titik pendekatannya BENAR-BENAR bisa dicapai.
   * Kalau kursi yang terklaim ternyata di kantong buntu / terhalang, lepas
   * lagi dan coba kandidat lain — jadi NPC tidak pernah "nyangkut niat".
   */
  _reachableSeat(claim) {
    for (let i = 0; i < 6; i++) {
      const seat = claim();
      if (!seat) return null;
      const approach = this.b.approachTo(seat);
      if (approach) return { seat, approach };
      this.b.releaseSeat(seat, this.c);
    }
    return null;
  }

  _sitGoal(seat, approach, type, status) {
    this.seat = seat;
    this._beginTravel({
      type,
      target: this._seatSpot(seat),
      yaw: seat.yaw,
      seat,
      via: approach,
      travelStatus: status,
    });
  }

  _goalWork() {
    const found = this._reachableSeat(() => this.b.claimSeat("desk", this.c));
    if (!found) return this._goalWander();
    this._sitGoal(found.seat, found.approach, "work", "Menuju meja");
  }

  _goalMeeting() {
    const found = this._reachableSeat(() => this.b.claimSeat("meeting", this.c));
    if (!found) return this._goalSitAny();
    this._sitGoal(found.seat, found.approach, "meeting", "Menuju ruang rapat");
  }

  _goalWander() {
    // Radius keliling dari pengaturan HR (staff.json → wander). Karakter
    // berkeliling di sekitar "rumah"-nya (meja/kursi) dengan jarak maksimal
    // `wanderRadius` — kalau radius 0, boleh ke mana saja di ruangannya.
    const r = Number(this.c.wanderRadius) || 0;
    const home = this.c.homeSpot;
    const homeRoom = home ? this.b.roomAt(home.x, home.z) : this.c.roomId;
    let spot = null;
    if (r > 0 && home) {
      for (let i = 0; i < 30; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.random() * r;
        const x = home.x + Math.cos(ang) * rad;
        const z = home.z + Math.sin(ang) * rad;
        if (this.b.roomAt(x, z) !== homeRoom) continue;
        if (!this.b.isFree(x, z, 0.55)) continue;
        if (!this.b._bodyFree(x, z, 0.8)) continue;
        if (!this.b.walkableAt(x, z, 0.22, true)) continue;
        spot = { x, z };
        break;
      }
    }
    if (!spot) {
      spot = this.b.randomSpot(this.c.roomId || homeRoom, { x: 0, z: 0 });
    }
    if (Math.abs(spot.x) < 0.01 && Math.abs(spot.z) < 0.01) return this._beginAct(3, "Mikir bentar");
    this._beginTravel({
      type: "wander",
      target: spot,
      travelStatus: "Jalan-jalan",
    });
  }

  _goalCoffee() {
    const p = this.b.poiNear("Espresso machine", this.c.position, {
      start: 0.72, maxR: 2.0, gap: 0.7, radius: 0.34,
    });
    if (!p) return this._goalSitAny();
    this._beginTravel({
      type: "coffee",
      target: { x: p.x, z: p.z },
      yaw: p.yaw,
      travelStatus: "Ngambil kopi",
    });
  }

  _goalCooler() {
    const p = this.b.poiNear("Dispenser air", this.c.position, {
      start: 0.72, maxR: 2.0, gap: 0.7, radius: 0.34,
    });
    if (!p) return this._goalSitAny();
    this._beginTravel({
      type: "cooler",
      target: { x: p.x, z: p.z },
      yaw: p.yaw,
      travelStatus: "Haus nih",
    });
  }

  _goalWater() {
    const spots = this.b.plantSpots;
    if (!spots.length) return this._goalWander();
    const p = spots[Math.floor(Math.random() * spots.length)];
    // Cari titik berhenti di sekitar tanaman yang masih di "ruangan" yang
    // sama dengan tanaman itu — supaya NPC tidak jalan menembus sekat
    // (mis. menyiram tanaman lobby dari sisi cafe).
    const home = this.b.roomAt(p.x, p.z);
    const bd = this.b.bounds;
    const offs = [[0.7, 0.5], [-0.7, 0.5], [0.7, -0.5], [-0.7, -0.5], [0.85, 0], [-0.85, 0], [0, 0.75], [0, -0.75]];
    let target = { x: p.x, z: p.z };
    for (const [ox, oz] of offs) {
      const tx = p.x + ox, tz = p.z + oz;
      if (tx < bd.x0 + 0.3 || tx > bd.x1 - 0.3 || tz < bd.z0 + 0.3 || tz > bd.z1 - 0.3) continue;
      if (this.b.roomAt(tx, tz) !== home) continue;
      if (!this.b.isFree(tx, tz, 0.32)) continue;
      if (!this.b.walkableAt(tx, tz, 0.22, true)) continue;
      target = { x: tx, z: tz };
      break;
    }
    this._beginTravel({
      type: "water",
      target,
      travelStatus: "Ambil semprotan",
    });
  }

  _goalBreak() {
    const want = Math.random() < 0.5 ? "lounge" : null;
    const found = this._reachableSeat(() => this.b.claimSeat(want, this.c));
    if (!found) return this._goalWander();
    this._sitGoal(found.seat, found.approach, "break", "Cari tempat duduk");
  }

  /** Duduk di kursi/sofa tipe APA PUN yang kosong (semua dudukan bisa dipakai). */
  _goalSitAny() {
    const found = this._reachableSeat(() => this.b.claimAnySeat(this.c));
    if (!found) return this._goalBreak();
    const st = found.seat.type;
    this._sitGoal(
      found.seat,
      found.approach,
      "break",
      st === "desk" ? "Mau duduk kerja" : "Cari tempat duduk",
    );
  }

  _goalChat() {
    const partner = this.crew.findIdleNear(this.c, 16);
    if (!partner) return this._goalWander();
    this.partner = partner;
    const target = {
      x: partner.position.x + Math.cos(partner.yaw) * 0.65,
      z: partner.position.z - Math.sin(partner.yaw) * 0.65,
    };
    this._beginTravel({
      type: "chat",
      target,
      travelStatus: `Ngejar ${partner.name}`,
    });
  }

  /* ------------------------------------------------------------- running */

  update(dt) {
    if (this.paused) return;
    // Sedang melangkah keluar kursi (fase aman) → jangan pilih tujuan dulu.
    if (this.c._exiting || this.c._exitPending) return;

    if (!this.goal) {
      this._chooseGoal();
      return;
    }

    if (this.stage === "travel") {
      this.c.lookAt(null, null);
      if (this.c.pathDone && this.c.pathFailed) {
        this._finish();
        this.c.status = "Jalur terhalang";
        return;
      }
      if (this.c.pathDone) {
        // arrived
        switch (this.goal.type) {
          case "work":
            this._beginAct(18 + Math.random() * 24, pick(TYPING), this.goal.seat ? "sit" : "stand");
            break;
          case "meeting":
            this._beginAct(24 + Math.random() * 24, "Rapat all-hands", this.goal.seat ? "sit" : "stand");
            break;
          case "wander":
            this._beginAct(2 + Math.random() * 4, pick(STROLL));
            break;
          case "coffee":
            this._beginAct(8 + Math.random() * 10, "Ngopi dulu ☕", "stand");
            break;
          case "cooler":
            this._beginAct(6 + Math.random() * 6, "Minum air 💧", "stand");
            break;
          case "water":
            this._beginAct(5 + Math.random() * 5, "Menyiram tanaman 🌿", "stand");
            break;
          case "break":
            // duduk hanya kalau benar-benar dapat kursi/sofa —
            // jangan duduk melayang di tengah ruangan
            this._beginAct(8 + Math.random() * 8, pick(BREAK), this.goal.seat ? "sit" : "stand");
            break;
          case "chat": {
            const p = this.partner;
            if (p && p.brain) {
              p.brain.paused = true;
              p.status = `Ngobrol dengan ${this.c.name}`;
              p.pose("stand");
              p.lookAt(this.c.position.x, this.c.position.z);
              p.gesture("wave", 0.9);
            }
            this.c.lookAt(p ? p.position.x : null, p ? p.position.z : null);
            this._beginAct(12 + Math.random() * 12, `Ngobrol dengan ${p ? p.name : "teman"}`);
            break;
          }
          default:
            this._beginAct(3, "Santai");
        }
      }
      return;
    }

    if (this.stage === "act") {
      this.actTime -= dt;
      // idle chatter while chatting
      if (this.goal.type === "chat" && this.partner) {
        this.c.lookAt(this.partner.position.x, this.partner.position.z);
        if (Math.random() < dt * 0.3) this.c.gesture("wave", 0.6);
      }
      if (this.actTime <= 0) this._finish();
    }
  }
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ===================================================================== *
 *  StaffBrain — otak ringan untuk NPC staf (barista cafe, resepsionis
 *  lobby). Semua aktivitas dikunci di ruangannya sendiri: keliling
 *  ruangan, duduk di sofa ruangan itu, dan sering kembali ke posnya.
 *  Resepsionis punya seatType "reception" sehingga dia duduk di kursi
 *  meja receptionis.
 * ===================================================================== */
export class StaffBrain {
  constructor(critter, building, post, opts = {}) {
    this.c = critter;
    this.b = building;
    this.post = post;
    this.seatType = opts.seatType || null;
    this.stage = "idle"; // idle | travel | act
    this.goal = null;
    this.seat = null;
    this.actTime = 0;
    this.cool = 2 + Math.random() * 3;
    this.c.status = opts.homeStatus || "Siap melayani";
  }

  _inRoom(seat) {
    return this.b.roomAt(seat.x, seat.z) === this.post.room;
  }

  _freeSeatInRoom(type = null) {
    let pool = this.b.seats.filter((s) =>
      this._inRoom(s) && (!type || s.type === type) && (!s.taken || s.taken === this.c));
    if (!pool.length && type) {
      // kursi utama (mis. meja receptionis) dipakai orang → cari sofa di ruangan ini
      pool = this.b.seats.filter((s) =>
        this._inRoom(s) && (s.type === "lounge" || s.type === "lunch") && !s.taken);
    }
    if (!pool.length) return null;
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // hanya pilih kursi yang titik pendekatannya benar-benar bisa dicapai
    for (const s of pool) {
      if (!this.b.approachTo(s)) continue;
      s.taken = this.c;
      s.takenAt = this.b._clock;
      s.uses = (s.uses || 0) + 1;
      return s;
    }
    return null;
  }

  _releaseSeat() {
    if (this.seat) {
      this.b.releaseSeat(this.seat, this.c);
      this.seat = null;
    }
  }

  _travel(target, status, { seat = null, yaw = null, type = null } = {}) {
    this.goal = { target, seat, yaw, type };
    this.stage = "travel";
    this.c.status = status;
    const t = seat ? this.b.approachTo(seat) : target;
    if (!t) {
      this._releaseSeat();
      this.goal = null;
      this.stage = "idle";
      this.c.status = "Kursi tidak dapat dijangkau";
      this.cool = 2;
      this.c.moveDir(0, 0);
      return;
    }
    if (seat) this.goal.approach = t;
    const path = this.b.route(this.c.position, t, this.c);
    this.c.pose("stand");
    this.c.followPath(path, false);
  }

  _choose() {
    const roll = Math.random();
    if (roll < 0.5) {
      // kembali ke posnya; duduk di kursi utama bila masih kosong
      const postSeat = this.seatType ? this._freeSeatInRoom(this.seatType) : null;
      if (postSeat) {
        this.seat = postSeat;
        this._travel(
          { x: this.post.x, z: this.post.z },
          this.post.homeStatus || "Kembali ke pos",
          { seat: postSeat },
        );
      } else {
        this._travel(
          { x: this.post.x, z: this.post.z },
          this.post.homeStatus || "Balik ke pos",
          { yaw: this.post.yaw },
        );
      }
    } else if (roll < 0.78) {
      // keliling DI DALAM ruangannya sendiri
      const spot = this.b.randomSpot(this.post.room, { x: 0, z: 0 });
      if (Math.abs(spot.x) < 0.01 && Math.abs(spot.z) < 0.01) {
        return this._startAct(3, "Standby", "stand");
      }
      this._travel(spot, "Keliling ruangan", { type: "wander" });
    } else {
      // duduk santai di sofa/kursi ruangan ini
      const seat = this._freeSeatInRoom();
      if (seat) {
        this.seat = seat;
        this._travel(seat.sit || seat, "Istirahat bentar", { seat });
      } else {
        this._travel(
          { x: this.post.x, z: this.post.z },
          this.post.homeStatus || "Balik ke pos",
          { yaw: this.post.yaw },
        );
      }
    }
  }

  _startAct(duration, status, pose = "stand") {
    this.stage = "act";
    this.actTime = duration;
    this.c.status = status;
    if (pose === "sit" && this.goal?.seat) {
      this._approachAndSit(this.goal.seat);
      return;
    }
    this.c.pose("stand");
    const yaw = this.goal?.yaw;
    if (yaw != null) this.c.targetYaw = yaw;
  }

  /** Sama seperti Brain: dekati kursi lewat rute normal dulu, baru duduk. */
  _approachAndSit(seat) {
    const spot = { x: seat.sit?.x ?? seat.x, z: seat.sit?.z ?? seat.z };
    const ign = this.b.seatIgnore(seat);
    const clearToSeat = this.b._lineFree(
      this.c.position.x, this.c.position.z, spot.x, spot.z, 0.24, ign,
    ) && this.b.isFree(spot.x, spot.z, 0.24, ign);
    if (!clearToSeat) {
      const approach = this.b.approachTo(seat);
      const path = approach ? this.b.route(this.c.position, approach, this.c) : [];
      if (path.length && Math.hypot(approach.x - this.c.position.x, approach.z - this.c.position.z) > 0.25) {
        this.goal.approach = approach;
        this.stage = "travel";
        this.c.status = "Mencari akses ke kursi";
        this.c.pose("stand");
        this.c.followPath(path, false, true);
        return;
      }
      this._finish();
      this.c.status = "Kursi terhalang";
      return;
    }
    this.c.seatInto(spot.x, spot.z, seat.yaw ?? this.goal?.yaw, seat);
  }

  _finish() {
    this._releaseSeat();
    this.goal = null;
    this.stage = "idle";
    if (this.c.sitting || this.c._seating) this.c.standUp();
    else this.c.pose("stand");
    this.c.lookAt(null, null);
    this.cool = 3 + Math.random() * 5;
  }

  update(dt) {
    if (this.paused) return;
    if (this.c._exiting || this.c._exitPending) return;
    if (this.stage === "act") {
      this.actTime -= dt;
      if (this.actTime <= 0) this._finish();
      return;
    }
    if (this.stage === "travel") {
      if (this.c.pathDone && this.c.pathFailed) {
        this._finish();
        this.c.status = "Jalur terhalang";
        return;
      }
      if (this.c.pathDone) {
        const g = this.goal;
        if (g?.seat) this._startAct(10 + Math.random() * 16, "Duduk santai", "sit");
        else if (g?.type === "wander") this._startAct(3 + Math.random() * 5, "Jalan-jalan bentar", "stand");
        else this._startAct(4 + Math.random() * 6, this.post.homeStatus || "Standby", "stand");
      }
      return;
    }
    this.cool -= dt;
    if (this.cool <= 0) this._choose();
  }
}

/* ===================================================================== *
 *  Meeting — rapat kantor yang dipicu dari dock.
 *
 *  start(): semua karakter (NPC biasa + staf; penonton/controlled
 *  tidak dibawa) menuju ruang meeting: yang dapat klaim kursi duduk,
 *  yang tidak kebagian berdiri di titik kosong menghadap meja — sampai
 *  end() dipanggil, mereka tetap di ruangan.
 * ===================================================================== */
export class Meeting {
  constructor({ building, crew }) {
    this.b = building;
    this.crew = crew;
    this.active = false;
    this.parts = [];
    this._clock = 5;
    this._front = null;
  }

  start() {
    if (this.active || !this.b.room("meeting")) return false;
    this.active = true;
    this.b.meetingActive = true;
    const room = this.b.room("meeting");
    this._front = { x: (room.x0 + room.x1) / 2, z: (room.z0 + room.z1) / 2 };

    const participants = [
      ...this.crew.members.filter((c) => !c.controlled),
      ...this.b.staffRoster.map((s) => s.critter),
    ];
    // bekuin otak masing-masing + lepas kursi/partner lama
    for (const c of participants) {
      const brain = c.brain;
      if (brain) {
        if (brain.seat) this.b.releaseSeat(brain.seat, c);
        brain.seat = null;
        if (brain.partner) {
          if (brain.partner.brain) brain.partner.brain.paused = false;
          brain.partner = null;
        }
        brain.paused = true;
        brain.goal = null;
        brain.stage = "idle";
      }
      c.path = null;
      c.pathDone = true;
      if (c.sitting || c._seating) c.standUp();
      else c.pose("stand");
      c.status = "Menuju rapat 🧑‍💼";
    }

    // HANYA kursi di dalam ruang meeting (ruang studio kreatif juga punya
    // kursi tipe "meeting") → yang dapat duduk, sisanya berdiri di ruangan
    this.parts = [];
    const standers = [];
    const claimed = [];
    for (const c of participants) {
      let seat = null;
      for (let i = 0; i < 6; i++) {
        const s = this.b.claimSeat("meeting", c, "meeting", c.position);
        if (!s) break;
        if (this.b.approachTo(s)) { seat = s; break; }
        this.b.releaseSeat(s, c);
      }
      if (seat) {
        claimed.push(seat);
        this.parts.push({
          c, mode: "sit", stage: "travel", seat, retries: 0, cooldown: 0,
          // berangkat bergiliran supaya tidak berdesakan di pintu
          delay: 0.15 + claimed.length * 0.32,
          homeYaw: null, chat: 0, pal: null,
        });
      }
      else standers.push(c);
    }

    const spots = this._standSpots(standers.length, claimed);
    standers.forEach((c, i) => {
      this.parts.push({
        c, mode: "stand", stage: "travel",
        spot: spots[i % Math.max(1, spots.length)] || null,
        started: false,
        delay: 1.4 + i * 0.4,
        homeYaw: null, chat: 0, pal: null,
      });
    });
    // pasangan ngobrol pertama mulai tidak lama setelah semua tiba
    this._clock = 3.5;

    return true;
  }

  end() {
    if (!this.active) return false;
    this.active = false;
    this.b.meetingActive = false;
    for (const p of this.parts) {
      const c = p.c;
      if (p.seat) this.b.releaseSeat(p.seat, c);
      if (c.sitting || c._seating) c.standUp();
      else c.pose("stand");
      c.status = "Balik kerja";
      c.path = null;
      c.pathDone = true;
      if (c.brain) {
        c.brain.paused = false;
        c.brain.goal = null;
        c.brain.stage = "idle";
      }
    }
    this.parts = [];
    return true;
  }

  update(dt) {
    if (!this.active) return;
    const front = this._front;

    // flavor: sesekali pasangan peserta mulai ngobrol (duduk maupun berdiri)
    this._clock -= dt;
    if (this._clock <= 0) {
      this._clock = 4.5 + Math.random() * 4.5;
      this._startRandomChat();
    }

    for (const p of this.parts) {
      const c = p.c;
      if (c._exiting || c._exitPending) continue;   // sedang keluar kursi
      if (c.sitting || c._seating) {
        // Duduk di kursi rapat yang benar? Kalau ternyata masih duduk di
        // kursi lain (mis. meja kerja), berdiri lalu ikut rapat.
        const onRightSeat = !p.seat || (
          Math.hypot(c.position.x - (p.seat.sit?.x ?? p.seat.x),
            c.position.z - (p.seat.sit?.z ?? p.seat.z)) < 0.6
        );
        if (c.sitting && !onRightSeat) {
          c.standUp();
          continue;
        }
        // sudah (proses) duduk → settle; tetap boleh ngobrol sambil duduk
        p.stage = "settled";
        if (p.homeYaw == null) p.homeYaw = p.seat?.yaw ?? c.targetYaw;
        this._chatStep(p, dt);
        continue;
      }

      if ((p.delay || 0) > 0) {
        p.delay -= dt;
        c.status = "Menuju rapat 🧑‍💼";
        continue;
      }

      if (p.mode === "sit" && p.seat) {
        const spot = { x: p.seat.sit?.x ?? p.seat.x, z: p.seat.sit?.z ?? p.seat.z };
        const dist = Math.hypot(spot.x - c.position.x, spot.z - c.position.z);
        const ign = this.b.seatIgnore(p.seat);
        const clearToSeat = this.b._lineFree(
          c.position.x, c.position.z, spot.x, spot.z, 0.24, ign,
        ) && this.b.isFree(spot.x, spot.z, 0.24, ign);
        // Duduk begitu jalur ke pad duduk bersih (sama seperti Brain AI).
        // Jarak dibatasi supaya tidak "meluncur" dari seberang ruangan.
        if (clearToSeat && dist <= 1.5) {
          p.homeYaw = p.seat.yaw;
          c.seatInto(spot.x, spot.z, p.seat.yaw, p.seat);
          c.status = "Duduk rapat 🪑";
          p.stage = "settled";
          continue;
        }
        if (c.pathDone && !c.path) {
          // Jangan langsung menyerah: beri jeda, lalu coba pendekatan lagi.
          p.cooldown = Math.max(0, (p.cooldown || 0) - dt);
          if (p.cooldown > 0) continue;
          p.retries++;
          if (p.retries > 14) {
            // If no safe approach exists, stand at a spot that does NOT
            // block the seat aisle (bukan berhenti di tengah lorong kursi).
            this.b.releaseSeat(p.seat, c);
            p.seat = null;
            p.mode = "stand";
            p.stage = "travel";
            p.started = false;
            p.cooldown = 0;
            const keep = this.b.seats.filter(
              (s) => s.type === "meeting" && this.b.roomAt(s.x, s.z) === "meeting",
            );
            p.spot = this._standSpots(1, keep)[0] || null;
            c.status = "Berdiri — kursi terhalang";
            continue;
          }
          const approach = this.b.approachTo(p.seat);
          const path = approach ? this.b.route(c.position, approach, c) : [];
          if (path.length) {
            p.approach = approach;
            c.followPath(path, false, true);   // presisi: berhenti tepat di titik pendekat
            p.stage = "travel";
            p.cooldown = 0.4;
          } else {
            p.cooldown = 1.2;
          }
        }
        continue;
      }

      if (p.mode === "stand") {
        if (!p.started && p.spot) {
          p.started = true;
          const path = this.b.route(c.position, p.spot, c);
          if (path.length) c.followPath(path, false);
          continue;
        }
        // Gagal di tengah jalan → jangan berhenti di lorong kursi; ulangi
        // rute ke titik berdiri yang sudah dipilih.
        if (p.spot && c.pathDone && !c.path) {
          const dSpot = Math.hypot(p.spot.x - c.position.x, p.spot.z - c.position.z);
          if (dSpot > 0.5) {
            p.cooldown = Math.max(0, (p.cooldown || 0) - dt);
            if (p.cooldown <= 0) {
              const path = this.b.route(c.position, p.spot, c);
              if (path.length) {
                c.followPath(path, false);
                p.cooldown = 0.5;
              } else {
                p.cooldown = 1.2;
              }
            }
            continue;
          }
        }
        if (c.pathDone && !c.path) {
          p.stage = "settled";
          p.homeYaw = Math.atan2(front.x - c.position.x, front.z - c.position.z);
          c.status = "Rapat — berdiri 🧍";
          this._chatStep(p, dt);
        } else {
          this._chatStep(p, dt);
        }
      }
    }
  }

  /** Sikap satu peserta yang sudah siap: menghadap lawan obrolan,
   *  atau kembali netral menghadap meja/arah depannya. */
  _chatStep(p, dt) {
    const c = p.c;
    if (p.chat > 0 && p.pal) {
      const pal = p.pal;
      if (!this.parts.includes(pal) || pal.stage !== "settled") {
        // lawan obrolan menghilang (mis. di-reset) → kembali netral
        p.chat = 0;
        p.pal = null;
        c.status = "Rapat berlangsung 📝";
        return;
      }
      p.chat -= dt;
      if (p.chat <= 0) {
        p.chat = 0;
        p.pal = null;
        c.status = "Rapat berlangsung 📝";
        return;
      }
      const pc = pal.c;
      c.targetYaw = Math.atan2(pc.position.x - c.position.x, pc.position.z - c.position.z);
      return;
    }
    // netral: menghadap meja rapat (berdiri) / arah kursi (duduk)
    if (p.homeYaw != null) c.targetYaw = p.homeYaw;
  }

  /** Pasangkan 1–2 pasangan peserta yang sudah siap untuk mengobrol.
   *  Berlaku juga untuk yang duduk — cukup memutar badan menghadap
   *  lawan + gestur kecil, jadi suasana rapat terasa hidup. */
  _startRandomChat() {
    const idle = this.parts.filter((p) => p.stage === "settled" && !p.chat && !p.c._forced);
    if (idle.length < 2) return;
    for (let i = idle.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idle[i], idle[j]] = [idle[j], idle[i]];
    }
    const lines = [
      "Bahas sprint mingguan 🗒️",
      "Nggosip proyek ☕",
      "Bagikan ide desain ✨",
      "Evaluasi rilis kemarin 🔍",
      "Janjian review draft 📝",
    ];
    const line = lines[Math.floor(Math.random() * lines.length)];
    const pairCount = Math.min(2, Math.floor(idle.length / 2));
    for (let k = 0; k < pairCount; k++) {
      const a = idle[k * 2];
      const b = idle[k * 2 + 1];
      const dur = 4 + Math.random() * 4;
      a.chat = dur; a.pal = b;
      b.chat = dur; b.pal = a;
      a.c.status = line;
      b.c.status = "Mendengarkan 👂";
      a.c.gesture(Math.random() < 0.5 ? "yes" : "no");
      if (Math.random() < 0.6) b.c.gesture("yes");
    }
  }

  /** Titik berdiri: sel bebas di dalam ruang meeting, berjarak pas antar orang.
   *  Penting: jangan berdiri di zona masuk kursi (belakang/samping kursi)
   *  supaya peserta yang mau duduk tidak terhalang badan. */
  _standSpots(count, seats = []) {
    if (count <= 0) return [];
    const room = this.b.room("meeting");
    if (!room) return [];
    const keep = seats.map((s) => (s.sit ? { x: s.sit.x, z: s.sit.z } : { x: s.x, z: s.z }));
    const door = this.b.anchors?.meeting?.inside || null;
    const spots = [];
    for (let z = room.z0 + 0.9; z <= room.z1 - 0.85; z += 0.75) {
      for (let x = room.x0 + 0.9; x <= room.x1 - 0.85; x += 0.75) {
        if (keep.some((k) => Math.hypot(k.x - x, k.z - z) < 1.25)) continue;
        if (door && Math.hypot(door.x - x, door.z - z) < 1.1) continue;
        if (this.b.isFree(x, z, 0.4)) spots.push({ x, z });
      }
    }
    // acak supaya penempatan tidak seragam kaku
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    const picks = [];
    for (const s of spots) {
      if (picks.length >= count) break;
      if (picks.every((q) => Math.hypot(q.x - s.x, q.z - s.z) > 0.7)) picks.push(s);
    }
    if (picks.length < count) {
      for (const s of spots) {
        if (picks.length >= count) break;
        if (!picks.includes(s) && picks.every((q) => Math.hypot(q.x - s.x, q.z - s.z) > 0.45)) {
          picks.push(s);
        }
      }
    }
    return picks;
  }
}
