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
    const from = this._roomOf(this.c.position);
    const to = this._roomOf(target);
    const path = this.b.path(from, to, target);
    if (via) path.splice(path.length - 1, 0, via);
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
      // don't snap into the chair: shuffle the last stretch onto the pad and
      // let the critter sit when it gets there
      this.c.seatInto(this.goal.target.x, this.goal.target.z, this.goal.yaw);
      return;
    }
    this.c.pose(pose);
    if (this.goal && this.goal.yaw != null) this.c.targetYaw = this.goal.yaw;
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
            this._beginAct(18 + Math.random() * 24, pick(TYPING), "sit");
            break;
          case "meeting":
            this._beginAct(24 + Math.random() * 24, "Rapat all-hands", "sit");
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
            this._beginAct(8 + Math.random() * 8, pick(BREAK), "sit");
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
