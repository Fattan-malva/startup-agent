import { Critter } from "../character/Critter.js";
import { Brain } from "./AI.js";
import { SPECIES, DEPARTMENTS } from "../character/species.js";

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
    this._nameIdx = Math.floor(Math.random() * NAMES.length);
  }

  _nextName() {
    const name = NAMES[this._nameIdx % NAMES.length];
    this._nameIdx++;
    return name;
  }

  /** Spawn a critter (with a brain) and drop it into the world. */
  spawn({ species = null, name = null, department = null, tieColor = undefined, at = null } = {}) {
    const spec = species ? SPECIES.find((s) => s.id === species) || SPECIES[0] : SPECIES[Math.floor(Math.random() * SPECIES.length)];
    const dept = department || DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)];
    const critter = new Critter({
      species: spec.id,
      name: name || this._nextName(),
      department: dept,
      tieColor: tieColor ?? dept.tie,
      variant: Math.floor(Math.random() * 5),
    });

    const spawnAt = at || this._randomSpawn();
    critter.teleport(spawnAt.x, spawnAt.z, spawnAt.yaw ?? Math.random() * Math.PI * 2);
    critter.onFootstep = (c) => this.onFootstep?.(c);
    critter.root.userData.critter = critter;

    this.scene.add(critter.root);
    this.members.push(critter);
    const brain = new Brain(critter, { building: this.building, crew: this });
    critter.brain = brain;
    this.brains.set(critter, brain);
    return critter;
  }

  _randomSpawn() {
    const spot = this.building.randomSpot(null, { x: 0, z: 0 });
    return { x: spot.x, z: spot.z, yaw: Math.random() * Math.PI * 2 };
  }

  /** Populate the office with `count` random critters. */
  populate(count) {
    for (let i = 0; i < count; i++) this.spawn();
    return this;
  }

  despawn(critter) {
    const brain = this.brains.get(critter);
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
    critter.pose("stand"); // stand up if you sat in someone's chair
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
    for (const c of this.members) {
      if (!c.controlled) this.brains.get(c)?.update(dt);
      c.update(dt, elapsed, this.building);
    }
    this.separate();
  }

  /* ------------------------------------------------- anti tembus karakter */

  /**
   * Anti tembus antar karakter: pasangan yang tumpang tindih saling digeser
   * keluar (masing-masing setengah jarak tumpang tindih), jadi saat
   * ditabrak badannya Bergeser ke samping, bukan menembus.
   * Yang duduk / sedang masuk kursi jadi jangkar: yang jalan-lah yang
   * terdorong penuh, supaya orang yang duduk tidak lepas dari kursi.
   */
  separate(radius = 0.27) {
    const bodies = this.members.concat(
      (this.building.staffRoster ?? []).map((s) => s.critter),
    );
    const min = radius * 2;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (a._forced === "Death") continue;
      const aAnchor = a.sitting || a._seating;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (b._forced === "Death") continue;
        const bAnchor = b.sitting || b._seating;
        if (aAnchor && bAnchor) continue;
        let dx = b.position.x - a.position.x;
        let dz = b.position.z - a.position.z;
        let d = Math.hypot(dx, dz);
        if (d >= min) continue;
        if (d < 1e-5) {
          const ang = (a.variant + 1) * 2.4;
          dx = Math.cos(ang) * 1e-3;
          dz = Math.sin(ang) * 1e-3;
          d = 1e-3;
        }
        const push = (min - d) / d;
        if (aAnchor) {
          b.position.x += dx * push;
          b.position.z += dz * push;
        } else if (bAnchor) {
          a.position.x -= dx * push;
          a.position.z -= dz * push;
        } else {
          const half = push * 0.5;
          a.position.x -= dx * half;
          a.position.z -= dz * half;
          b.position.x += dx * half;
          b.position.z += dz * half;
        }
      }
    }
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
