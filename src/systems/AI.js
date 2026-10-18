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
    const path = this.b.route(this.c.position, target);
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
    const target = goal.target;
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
    const dist = Math.hypot(spot.x - this.c.position.x, spot.z - this.c.position.z);
    if (dist > 0.3 && !this.goal.sitNear) {
      // fase pendekatan: ikuti rute sampai dekat kursi dulu
      this.goal.sitNear = true;
      this.stage = "travel";
      this.c.status = "Menuju kursi";
      const path = this.b.route(this.c.position, spot);
      this.c.pose("stand");
      this.c.followPath(path, false);
      return;
    }
    // sudah dekat → langkah pendek masuk ke kursi lalu duduk
    this.c.seatInto(spot.x, spot.z, this.goal.yaw);
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
    this.c.pose("stand");
    this.c.lookAt(null, null);
  }

  _chooseGoal() {
    const roll = Math.random();
    if (roll < 0.28) return this._goalWork();
    if (roll < 0.44) return this._goalWander();
    if (roll < 0.56) return this._goalCoffee();
    if (roll < 0.66) return this._goalWater();
    if (roll < 0.8) return this._goalChat();
    if (roll < 0.88) return this._goalBreak();
    if (roll < 0.94) return this._goalCooler();
    return this._goalMeeting();
  }

  _goalWork() {
    const seat = this._freeDesk();
    if (!seat) return this._goalWander();
    this.seat = seat;
    this._beginTravel({
      type: "work",
      target: this._seatSpot(seat),
      yaw: seat.yaw, // face the desk
      seat,
      via: this.b.approachTo(seat),
      travelStatus: "Menuju meja",
    });
  }

  _goalMeeting() {
    const seat = this.b.claimSeat("meeting", this.c);
    if (!seat) return this._goalWander();
    this.seat = seat;
    this._beginTravel({
      type: "meeting",
      target: this._seatSpot(seat),
      yaw: seat.yaw,
      seat,
      via: this.b.approachTo(seat),
      travelStatus: "Menuju ruang rapat",
    });
  }

  _goalWander() {
    const spot = this.b.randomSpot(null, { x: 0, z: 0 });
    if (Math.abs(spot.x) < 0.01 && Math.abs(spot.z) < 0.01) return this._beginAct(3, "Mikir bentar");
    this._beginTravel({
      type: "wander",
      target: spot,
      travelStatus: "Jalan-jalan",
    });
  }

  _goalCoffee() {
    this._beginTravel({
      type: "coffee",
      target: { x: -0.1, z: -5.12 },
      yaw: Math.PI,
      travelStatus: "Ngambil kopi",
    });
  }

  _goalCooler() {
    this._beginTravel({
      type: "cooler",
      target: { x: 2.0, z: -5.0 },
      yaw: Math.PI,
      travelStatus: "Haus nih",
    });
  }

  _goalWater() {
    const spots = this.b.plantSpots;
    if (!spots.length) return this._goalWander();
    const p = spots[Math.floor(Math.random() * spots.length)];
    this._beginTravel({
      type: "water",
      target: { x: p.x + 0.7, z: p.z + 0.5 },
      travelStatus: "Ambil semprotan",
    });
  }

  _goalBreak() {
    const seat = this.b.claimSeat(Math.random() < 0.5 ? "lounge" : "lunch", this.c);
    if (seat) {
      this.seat = seat;
      return this._beginTravel({
        type: "break",
        target: this._seatSpot(seat),
        yaw: seat.yaw,
        seat,
        via: this.b.approachTo(seat),
        travelStatus: "Cari tempat duduk",
      });
    }
    const spot = this.b.randomSpot("lobby", { x: 0, z: 0 });
    this._beginTravel({ type: "break", target: spot, travelStatus: "Istirahat" });
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

    if (!this.goal) {
      this._chooseGoal();
      return;
    }

    if (this.stage === "travel") {
      this.c.lookAt(null, null);
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
    const seat = pool[Math.floor(Math.random() * pool.length)];
    seat.taken = this.c;
    return seat;
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
    const t = seat ? (seat.sit || seat) : target;
    const path = this.b.route(this.c.position, t);
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
    const dist = Math.hypot(spot.x - this.c.position.x, spot.z - this.c.position.z);
    if (dist > 0.3 && !this.goal.sitNear) {
      this.goal.sitNear = true;
      this.stage = "travel";
      this.c.status = "Menuju kursi";
      const path = this.b.route(this.c.position, spot);
      this.c.pose("stand");
      this.c.followPath(path, false);
      return;
    }
    this.c.seatInto(spot.x, spot.z, seat.yaw);
  }

  _finish() {
    this._releaseSeat();
    this.goal = null;
    this.stage = "idle";
    this.c.pose("stand");
    this.c.lookAt(null, null);
    this.cool = 3 + Math.random() * 5;
  }

  update(dt) {
    if (this.stage === "act") {
      this.actTime -= dt;
      if (this.actTime <= 0) this._finish();
      return;
    }
    if (this.stage === "travel") {
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
