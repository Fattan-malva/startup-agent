import { Critter } from "../character/Critter.js";
import { Brain } from "./AI.js";
import { SPECIES, DEPARTMENTS } from "../character/species.js";
import { STAFF, appearanceFromModel, effectiveRooms } from "../data/staff.js";

/* ===================================================================== *
 *  Crew — the population of the office.
 *
 *  Owns every critter and its brain, handles spawning/despawning and
 *  answers the queries the AI and the HUD need (roster, nearest, idle).
 * ===================================================================== */

const NAMES = [
  "Nova", "Biscuit", "Pixel", "Mochi", "Rex", "Luna", "Boba", "Ziggy",
  "Pumpkin", "Wasabi", "Noodle", "Miso", "Tofu", "Pepper", "Waffle",
  "Coco", "Mango", "Taro", "Gizmo", "Clover", "Pudding", "Churro",
];

export class Crew {
  constructor({ scene, building, onFootstep = null }) {
    this.scene = scene;
    this.building = building;
    this.onFootstep = onFootstep;
    this.members = [];
    this.brains = new Map();
    this.building.crew = this;
    this.building.dynamicBodies = [];
    this._nameIdx = Math.floor(Math.random() * NAMES.length);
  }

  _nextName() {
    const name = NAMES[this._nameIdx % NAMES.length];
    this._nameIdx++;
    return name;
  }

  /** Spawn a critter (with a brain) and drop it into the world. */
  spawn({ species = null, name = null, department = null, tieColor = undefined, at = null, roomId = null, deskId = null, staffId = null, appearance = null, wander = 0, rooms = null } = {}) {
    const spec = species ? SPECIES.find((s) => s.id === species) || SPECIES[0] : SPECIES[Math.floor(Math.random() * SPECIES.length)];
    const dept = (typeof department === "string")
      ? (DEPARTMENTS.find((d) => d.name === department) || { name: department, tie: tieColor ?? 0x737f90 })
      : (department || DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)]);
    const appearanceObj = appearance || (spec.id && species ? {
      species: spec.id,
      skin: "#dca787",
      shirt: "#506a85",
      pants: "#333943",
      tieColor: dept.tie,
      accessory: "none",
    } : null);
    
    let critter;
    try {
      critter = new Critter({
        species: spec.id,
        name: name || this._nextName(),
        department: dept,
        tieColor: tieColor ?? dept.tie,
        variant: Math.floor(Math.random() * 5),
        appearance: appearanceObj,
      });
    } catch (e) {
      console.error('[Crew] Failed to create critter:', e);
      throw e;
    }
    critter.roomId = roomId || null;
    critter.deskId = deskId || null;
    critter.staffId = staffId || null;
    critter.wanderRadius = Number(wander) || 0;

    // Izin akses ruangan (modal Staf → daftar check box). `allowedRooms`
    // selalu memuat Cafe: area istirahat universal. NPC biasa (tanpa
    // staffId) tidak punya daftar → bebas ke mana saja.
    critter.rooms = Array.isArray(rooms) ? rooms.filter((r) => typeof r === "string") : [];
    critter.allowedRooms = staffId ? effectiveRooms({ rooms: critter.rooms }) : null;

    // Titik "rumah" dipakai Brain untuk membatasi radius keliling staf
    // sesuai pengaturan HR (staff.json → wander).
    if (deskId) {
      const seat = this.building.seatByDesk(deskId);
      if (seat) critter.homeSpot = { x: seat.x, z: seat.z };
    }

    const requested = at || (roomId ? this.building.randomSpot(roomId, { x: 0, z: 0 }) : this._randomSpawn());
    const spawnAt = this._findSafeSpawn(requested);
    critter.teleport(spawnAt.x, spawnAt.z, spawnAt.yaw ?? Math.random() * Math.PI * 2);
    critter.homeSpot = critter.homeSpot || { x: critter.position.x, z: critter.position.z };
    critter.onFootstep = (c) => this.onFootstep?.(c);
    critter.root.userData.critter = critter;

    this.scene.add(critter.root);
    this.members.push(critter);
    this._syncDynamicBodies();
    const brain = new Brain(critter, { building: this.building, crew: this });
    critter.brain = brain;
    this.brains.set(critter, brain);
    return critter;
  }

  _randomSpawn() {
    for (let attempt = 0; attempt < 40; attempt++) {
      const spot = this.building.randomSpot(null, { x: 0, z: 0 });
      if (this._isSpawnFree(spot.x, spot.z)) {
        return { x: spot.x, z: spot.z, yaw: Math.random() * Math.PI * 2 };
      }
    }
    return { ...this.building.entrance, yaw: this.building.entrance.yaw };
  }

  _syncDynamicBodies() {
    this.building.dynamicBodies = this.members.slice();
  }

  _isSpawnFree(x, z, radius = 0.29, ignore = null) {
    if (!this.building.isFree(x, z, radius)) return false;
    const minDistance = radius + 0.29;
    for (const other of this.building.dynamicBodies ?? []) {
      if (!other || other === ignore) continue;
      const dx = x - other.position.x;
      const dz = z - other.position.z;
      if (dx * dx + dz * dz < minDistance * minDistance) return false;
    }
    return true;
  }

  _findSafeSpawn(preferred) {
    if (this._isSpawnFree(preferred.x, preferred.z)) return preferred;
    // Search nearby without teleporting an entering player into a colleague.
    for (let radius = 0.45; radius <= 2.7; radius += 0.3) {
      for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2;
        const x = preferred.x + Math.cos(angle) * radius;
        const z = preferred.z + Math.sin(angle) * radius;
        if (this._isSpawnFree(x, z)) return { x, z, yaw: preferred.yaw };
      }
    }
    for (let attempt = 0; attempt < 40; attempt++) {
      const spot = this.building.randomSpot(null, { x: 0, z: 0 });
      if (this._isSpawnFree(spot.x, spot.z)) return { ...spot, yaw: preferred.yaw };
    }
    return preferred;
  }

  /** Populate the office with `count` random critters. */
  populate(count) {
    for (let i = 0; i < count; i++) this.spawn();
    return this;
  }

  /** Populate from src/data/staff.json (default 15 staff). */
  populateFromStaff() {    for (const s of STAFF) {
      const m = s.model || {};
      this.spawn({
        species: m.species || null,
        name: s.name,
        department: s.department,
        tieColor: m.tieColor,
        roomId: s.roomId,
        deskId: s.deskId,
        staffId: s.id,
        wander: s.wander,
        rooms: s.rooms,
        appearance: appearanceFromModel(m),
      });
    }
    return this;
  }

  /**
   * Sinkronkan ulang data staf (meja, ruang kerja, izin ruangan) ke
   * kritter di dunia. Dipanggil Mode Edit setelah meja dihapus/dipindah,
   * supaya karakter langsung tahu meja barunya (atau kehilangan mejanya).
   */
  syncStaffDesks() {
    for (const s of STAFF) {
      const c = this.members.find((m) => m.staffId === s.id);
      if (!c) continue;
      c.roomId = s.roomId;
      c.deskId = s.deskId;
      c.rooms = [...(s.rooms || [])];
      c.allowedRooms = effectiveRooms({ rooms: c.rooms });
      const seat = s.deskId ? this.building.seatByDesk(s.deskId) : null;
      if (seat) c.homeSpot = { x: seat.x, z: seat.z };
      else c.homeSpot = null;
    }
  }

  despawn(critter) {    const brain = this.brains.get(critter);
    if (brain) {
      brain._finish();
      this.brains.delete(critter);
    }
    this.scene.remove(critter.root);
    const i = this.members.indexOf(critter);
    if (i >= 0) this.members.splice(i, 1);
  }

  /** Suspend an NPC while the player drives it. */
  takeover(critter) {
    const brain = this.brains.get(critter);
    if (brain) brain.paused = true;
    critter.controlled = true;
    // kalau tadi sedang duduk, berdiri dengan langkah keluar yang aman
    if (critter.sitting || critter._seating) critter.standUp();
    else critter.pose("stand");
  }

  release(critter) {
    critter.controlled = false;
    const brain = this.brains.get(critter);
    if (brain) {
      brain._finish();
      brain.paused = false;
    }
  }

  /** Nearest member that is unclaimed and not chatting, to chat with. */
  findIdleNear(critter, maxDist = 14) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const m of this.members) {
      if (m === critter || m.controlled) continue;
      const brain = this.brains.get(m);
      if (!brain || brain.paused) continue;
      if (brain.goal && brain.goal.type === "chat") continue;
      const dx = m.position.x - critter.position.x;
      const dz = m.position.z - critter.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) {
        bestD = d2;
        best = m;
      }
    }
    return best;
  }

  nearest(x, z, maxDist = 2.5, exclude = null) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const m of this.members) {
      if (m === exclude) continue;
      const dx = m.position.x - x;
      const dz = m.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) {
        bestD = d2;
        best = m;
      }
    }
    return best;
  }

  update(dt, elapsed) {
    this._syncDynamicBodies();
    for (const c of this.members) {
      if (!c.controlled) this.brains.get(c)?.update(dt);
      c.update(dt, elapsed, this.building);
    }
    // Movement is swept against every other body before positions are committed.
    // Do not post-push overlapping bodies: that can shove them through furniture.
  }

  /* ------------------------------------------------- anti tembus karakter */

  /**
   * Compatibility hook: collision is enforced before movement by
   * Building.moveSafely(). Post-movement teleport pushes are intentionally
   * avoided because they can move a body through a wall or desk.
   */
  separate() {
    this._syncDynamicBodies();
  }

  roster() {
    return this.members.map((c) => ({
      id: c.id,
      name: c.name,
      species: c.speciesId,
      emoji: c.spec.emoji,
      dept: c.department?.name || "",
      tie: c.tieColor,
      status: c.status,
      controlled: c.controlled,
      critter: c,
    }));
  }
}
