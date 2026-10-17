import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { MAT } from "./materials.js";
import { mulberry32 } from "./textures.js";
import {
  box,
  cyl,
  rbox,
  shade,
  createBin,
  createBookshelf,
  createClock,
  createFridge,
  createMagazineRack,
  createPrinterStation,
  createSideTable,
  createStorageCabinet,
  createWallShelf,
  createArmchair,
  createOttoman,
  createBench,
  createAcousticPanel,
  createCoffeeMachine,
  createCoffeeTable,
  createDivider,
  createFloorLamp,
  createMeetingTable,
  createMug,
  createMonitor,
  createOfficeChair,
  createPendantLamp,
  createPlant,
  createSofa,
  createWallArt,
  createWaterCooler,
  createWhiteboard,
  createWorkstation,
} from "./props.js";
import {
  BOUNDS,
  FLOOR_POLYGON,
  WALL_H,
  WALL_T,
  WALLS,
  ROOMS,
  ROOM_ANCHORS,
  ENTRANCE,
} from "./layout.js";

/* ===================================================================== *
 *  Building — one floor of Critter Corp.
 *
 *  Builds the shell from `layout.js`, fills every room with the existing
 *  (realistic) furniture, then merges all *static* decoration into a
 *  handful of meshes so the draw-call count stays tiny.
 * ===================================================================== */

/**
 * A seated critter parks this far *forward* of a seat's pad centre (forward
 * = the direction the seat faces). Chairs and sofas keep their backrest right
 * behind the pad centre, so sitting dead-centre would bury the critter's back
 * inside the cushions.
 */
const SIT_FWD = 0.16;

/** Build an irregular X/Z polygon as a horizontal Three.js floor surface. */
function polygonFloorGeometry(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 2);
  geometry.rotateX(-Math.PI / 2);
  // ShapeGeometry emits coordinates in world space; normalize UVs so texture
  // density remains consistent across small rooms and the full building shell.
  const pos = geometry.attributes.position;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minX = Math.min(minX, pos.getX(i)); maxX = Math.max(maxX, pos.getX(i));
    minZ = Math.min(minZ, pos.getZ(i)); maxZ = Math.max(maxZ, pos.getZ(i));
  }
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - minX) / Math.max(1e-4, maxX - minX),
      (pos.getZ(i) - minZ) / Math.max(1e-4, maxZ - minZ));
  }
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    const crosses = (zi > z) !== (zj > z) &&
      x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export class Building {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = [];
    this.interactives = [];
    this.seats = [];
    this.plants = [];
    this.plantSpots = [];
    this.staticProps = [];
    this.placedProps = [];
    this._interactionId = 0;
    this.tickers = [];
    this.rooms = ROOMS;
    this.bounds = { ...BOUNDS, y1: WALL_H };
    this.anchors = ROOM_ANCHORS;
    this.entrance = ENTRANCE;

    this._v = new THREE.Vector3();
    this._c = new THREE.Color();
    this.rng = mulberry32(1337);

    this.holder = new THREE.Group(); // everything placed by `place`
    this.holder.name = "Props";
    this.staticGroup = new THREE.Group(); // merged at the end
    this.staticGroup.name = "Static";
    scene.add(this.holder);
    scene.add(this.staticGroup);

    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0xbcd8ea,
      transparent: true,
      opacity: 0.18,
      roughness: 0.08,
      metalness: 0.0,
      depthWrite: false,
    });

    this._hotspotGeo = new THREE.BoxGeometry(1, 1, 1);
    this._hotspotMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  }

  build() {
    this._floor();
    this._walls();
    this._lighting();
    this._furnish();
    this._addUniversalInteractions();
    this._mergeStatic();
    this._pruneLights();
    return this;
  }

  /**
   * Props ship with their own little lights (desk lamps, pendants…). Each
   * one is evaluated per fragment for every lit material, so we keep only
   * the four global lights and let the emissive materials do the rest.
   */
  _pruneLights() {
    const keep = new Set(Object.values(this.lights));
    const remove = [];
    this.scene.traverse((o) => {
      if (o.isLight && !keep.has(o)) remove.push(o);
    });
    for (const l of remove) l.parent?.remove(l);
  }

  /* -------------------------------------------------------------- floor */

  _floor() {
    // The base floor follows the clipped outer shell instead of exposing a
    // large rectangular slab beyond the walls.
    const floor = new THREE.Mesh(polygonFloorGeometry(FLOOR_POLYGON), MAT.floor);
    floor.position.y = 0.001;
    floor.receiveShadow = true;
    this.staticGroup.add(floor);

    const overlayMat = {
      carpet: MAT.carpet,
      rug: MAT.rug,
      concrete: MAT.concrete,
      terrazzo: MAT.terrazzo || MAT.concrete,
      tile: MAT.tile || MAT.concrete,
    };
    // Lay broad zone finishes first and nested alcoves last, so the copy nook,
    // restroom, archive and huddle room keep their own flooring at overlaps.
    const floorOrder = this.rooms.slice().sort((a, b) =>
      ((b.x1 - b.x0) * (b.z1 - b.z0)) - ((a.x1 - a.x0) * (a.z1 - a.z0)));
    for (const r of floorOrder) {
      const mat = overlayMat[r.floor];
      if (!mat || !r.polygon) continue;
      const plane = new THREE.Mesh(polygonFloorGeometry(r.polygon), mat);
      plane.position.y = 0.008;
      plane.receiveShadow = true;
      this.staticGroup.add(plane);
    }

    // Brass inlays align exactly with the five room doors and lobby entrance.
    const thresholdMat = MAT.brass || MAT.steel;
    for (const x of [-6.5, 0]) {
      const strip = box(1.16, 0.018, 0.075, thresholdMat);
      strip.position.set(x, 0.018, -0.79);
      this.staticGroup.add(strip);
    }
    for (const x of [-6.5, 0, 6.5]) {
      const strip = box(1.16, 0.018, 0.075, thresholdMat);
      strip.position.set(x, 0.018, 0.79);
      this.staticGroup.add(strip);
    }
    const entranceStrip = box(0.075, 0.018, 1.38, thresholdMat);
    entranceStrip.position.set(-9.94, 0.018, 4.5);
    this.staticGroup.add(entranceStrip);
  }

  /* -------------------------------------------------------------- walls */

  _walls() {
    for (const seg of WALLS) this._wallRun(seg);
  }

  _wallRun(seg) {
    const { x1, z1, x2, z2, mat = "wall", doors = [] } = seg;
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return;
    const ux = dx / len;
    const uz = dz / len;
    const rot = Math.atan2(-uz, ux);
    const sorted = doors.slice().sort((a, b) => a.at - b.at);
    const spans = [];
    let cursor = 0;
    for (const d of sorted) {
      const a = Math.max(0, d.at - d.w / 2);
      const b = Math.min(len, d.at + d.w / 2);
      if (a > cursor + 0.02) spans.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < len - 0.02) spans.push([cursor, len]);

    const isGlass = mat === "glass";
    const material = isGlass ? this.glassMat : MAT[mat] || MAT.wall;
    for (const [s, e] of spans) {
      const sl = e - s;
      if (sl < 0.05) continue;
      const sx = x1 + ux * s;
      const sz = z1 + uz * s;
      const ex = x1 + ux * e;
      const ez = z1 + uz * e;
      const mx = (sx + ex) / 2;
      const mz = (sz + ez) / 2;

      const mesh = box(sl, WALL_H, WALL_T, material);
      mesh.position.set(mx, WALL_H / 2, mz);
      mesh.rotation.y = rot;
      mesh.receiveShadow = true;
      this.staticGroup.add(mesh);

      // Warm timber skirting + a narrow dark cap make walls feel assembled
      // from real architectural materials instead of solid debug rectangles.
      const skirting = box(sl, 0.095, WALL_T + 0.045, MAT.darkWood);
      skirting.position.set(mx, 0.075, mz);
      skirting.rotation.y = rot;
      this.staticGroup.add(skirting);
      const cap = box(sl, 0.055, WALL_T + 0.065, MAT.blackMetal);
      cap.position.set(mx, WALL_H - 0.006, mz);
      cap.rotation.y = rot;
      this.staticGroup.add(cap);

      // Diagonal walls need expanded bounds on both axes; treating a diagonal
      // as horizontal/vertical creates collision leaks at the clipped corners.
      const halfT = WALL_T / 2 + 0.035;
      this.obstacles.push({
        minX: Math.min(sx, ex) - halfT,
        maxX: Math.max(sx, ex) + halfT,
        minZ: Math.min(sz, ez) - halfT,
        maxZ: Math.max(sz, ez) + halfT,
      });

      // Slim mullions break up the glass wall and add readable scale.
      if (isGlass) {
        const step = 2.25;
        for (let offset = 0.55; offset < sl - 0.25; offset += step) {
          const px = sx + ux * offset;
          const pz = sz + uz * offset;
          const mullion = box(0.045, WALL_H, WALL_T + 0.035, MAT.blackMetal);
          mullion.position.set(px, WALL_H / 2, pz);
          mullion.rotation.y = rot;
          this.staticGroup.add(mullion);
        }
      }
    }

    // Door heads sit above a human-height opening even though the room walls
    // are kept low for visibility from the game's isometric camera.
    const openingH = Math.min(1.18, WALL_H - 0.12);
    const headerH = WALL_H - openingH;
    if (headerH > 0.02) {
      for (const d of sorted) {
        const cx = x1 + ux * d.at;
        const cz = z1 + uz * d.at;
        const lintel = box(d.w, headerH, WALL_T, material);
        lintel.position.set(cx, openingH + headerH / 2, cz);
        lintel.rotation.y = rot;
        this.staticGroup.add(lintel);
      }
    }
  }

  /* ------------------------------------------------------------ lights */

  _lighting() {
    const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x6b5a45, 1.05);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff3df, 1.55);
    sun.position.set(9, 16, 7);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xd7e4ff, 0.35);
    fill.position.set(-8, 10, -6);
    this.scene.add(fill);

    const amb = new THREE.AmbientLight(0xffffff, 0.22);
    this.scene.add(amb);

    this.lights = { hemi, sun, fill, amb };
    this.nightness = 0;
    this.targetNightness = 0;
  }

  setNightness(v, instant = false) {
    this.targetNightness = THREE.MathUtils.clamp(Number(v) || 0, 0, 1);
    if (instant) {
      this.nightness = this.targetNightness;
      this._applyNightness();
    }
  }

  _applyNightness() {
    const v = this.nightness;
    const L = this.lights;
    L.sun.intensity = THREE.MathUtils.lerp(1.55, 0.25, v);
    L.sun.color.setHex(v > 0.5 ? 0xa8bcff : 0xfff3df);
    L.hemi.intensity = THREE.MathUtils.lerp(1.05, 0.35, v);
    L.hemi.color.setHex(v > 0.5 ? 0x2a3a5c : 0xdfe8f5);
    L.hemi.groundColor.setHex(v > 0.5 ? 0x0e1218 : 0x6b5a45);
    L.fill.intensity = THREE.MathUtils.lerp(0.35, 0.5, v);
    L.amb.intensity = THREE.MathUtils.lerp(0.22, 0.16, v);
  }

  /* ------------------------------------------------------------ furnish */

  /** Place a prop and register its footprint as an obstacle. */
  _place(obj, x, z, ry = 0, y = 0, fp = null) {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    this.holder.add(obj);
    this.placedProps.push({ obj, x, z, y, ry, state: -1 });
    const f = fp || obj.userData.footprint;
    if (f) {
      const q = ((Math.round(ry / (Math.PI / 2)) % 4) + 4) % 4;
      const swap = q % 2 === 1;
      const hw = (swap ? f.d : f.w) / 2;
      const hd = (swap ? f.w : f.d) / 2;
      this.obstacles.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
    }
    return obj;
  }

  /** Static (non-interactive, non-animating) decoration — merged later. */
  _static(obj, x, z, ry = 0, y = 0, fp = null) {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    this.staticGroup.add(obj);
    this.staticProps.push({ obj, x, z, y, ry, state: -1 });
    const f = fp || obj.userData.footprint;
    if (f) {
      const q = ((Math.round(ry / (Math.PI / 2)) % 4) + 4) % 4;
      const swap = q % 2 === 1;
      const hw = (swap ? f.d : f.w) / 2;
      const hd = (swap ? f.w : f.d) / 2;
      this.obstacles.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
    }
    return obj;
  }

  /**
   * Register a seat. `x, z` is the pad/cushion centre and `yaw` is the
   * direction a body sitting there looks — always *at* whatever the seat
   * faces (a desk, a table, a meeting table). `sit` is where the body
   * actually ends up.
   */
  _seat(x, z, yaw, type) {
    const seat = {
      id: `${type}-${this.seats.length}`,
      x,
      z,
      yaw,
      type,
      taken: null,
      sit: { x: x + Math.sin(yaw) * SIT_FWD, z: z + Math.cos(yaw) * SIT_FWD },
    };
    this.seats.push(seat);
    return seat;
  }

  /**
   * Chair for a desk, at any yaw: it stands on the desk's user side (the
   * desk's own local +z, where the keyboard sits — the monitor is on the far
   * side) and looks straight back at the desk. Seats registered this way can
   * never end up with their back to the desk.
   */
  _deskChair(deskX, deskZ, deskRy, { color = "charcoal", gap = 0.85, type = "desk" } = {}) {
    const x = deskX + Math.sin(deskRy) * gap;
    const z = deskZ + Math.cos(deskRy) * gap;
    const yaw = deskRy + Math.PI; // face the desk
    this._static(createOfficeChair({ color }), x, z, yaw);
    return this._seat(x, z, yaw, type);
  }

  /** Chair for a table/point of interest: placed anywhere, then turned to
   *  look at the thing it belongs to. */

  _interactive(obj, meta) {
    obj.userData.interactive = { ...meta, object: obj };
    this.interactives.push(obj);
    return obj;
  }

  _plant(x, z, ry, opts, label = "Tanaman kantor") {
    const plant = createPlant(opts);
    plant.userData.interactionManaged = true;
    this._static(plant, x, z, ry, 0);
    this.plantSpots.push({ x, z });
    if (label) {
      const api = plant.userData.api;
      this._hotspot(x, z, 0.55, 1.0, {
        id: `plant-${x}-${z}`,
        label,
        hint: "Klik untuk menyiram",
        radius: 0.85,
        onClick: () => {
          api?.water?.();
          return "Sudah disiram — terima kasih 🌿";
        },
      });
    }
    return plant;
  }

  /**
   * An invisible interaction volume. Merged decoration can't be clicked, so
   * any interactive-yet-merged prop gets one of these on top of it.
   */
  _hotspot(x, z, y, size, meta) {
    const mesh = new THREE.Mesh(this._hotspotGeo, this._hotspotMat);
    mesh.scale.set(size, Math.max(0.6, size), size);
    mesh.position.set(x, y, z);
    this.holder.add(mesh);
    this._interactive(mesh, meta);
    return mesh;
  }

  /**
   * Keep static geometry merged for performance but expose a clickable
   * inspection hotspot over every static furniture/decor group. Items with a
   * purpose-built interaction (plant, board, cooler, etc.) keep that action.
   */
  _addUniversalInteractions() {
    const placed = [...this.staticProps, ...this.placedProps];
    for (const item of placed) {
      const obj = item.obj;
      if (obj.userData.interactionManaged || obj.userData.interactive) continue;
      const room = this.room(this.roomAt(item.x, item.z));
      const roomName = room?.name || "Studio";
      const label = obj.userData.interactionLabel || obj.name || "Furnitur kantor";
      const footprint = obj.userData.footprint || { w: 0.7, d: 0.7 };
      const size = THREE.MathUtils.clamp(Math.max(footprint.w || 0.7, footprint.d || 0.7) * 0.72, 0.6, 1.05);
      const y = Math.max(0.68, item.y + 0.66);
      this._hotspot(item.x, item.z, y, size, {
        id: `inspect-prop-${this._interactionId++}`,
        label: `${label} · ${roomName}`,
        hint: "Klik untuk memeriksa detail dan status objek",
        radius: 1.0,
        onClick: () => {
          item.state = (item.state + 1) % 3;
          const messages = [
            `${label}: siap digunakan di area ${roomName}.`,
            `${label}: detail material dan kondisi sudah diperiksa.`,
            `${label}: kembali ke status siap digunakan.`,
          ];
          return messages[item.state];
        },
      });
    }
  }

  _furnish() {
    /* ================= RUANG MEETING =================
       One compact six-seat meeting table, board, storage and plant.
       The chair geometry remains the project's original office-chair model. */
    const mcx = -6.55;
    const mcz = -4.05;
    this._static(createMeetingTable({ w: 2.55, d: 1.12, h: 0.74 }), mcx, mcz, 0, 0, { w: 2.55, d: 1.12 });
    const meetingSeats = [
      [-1.38, -0.98], [0, -0.98], [1.38, -0.98],
      [-1.38, 0.98], [0, 0.98], [1.38, 0.98],
    ];
    for (const [dx, dz] of meetingSeats) {
      const yaw = dz > 0 ? Math.PI : 0;
      this._static(createOfficeChair({ color: dx < 0 ? "navy" : "charcoal" }), mcx + dx, mcz + dz, yaw);
      this._seat(mcx + dx, mcz + dz, yaw, "meeting");
    }
    const board = createWhiteboard({ w: 1.65, h: 0.94 });
    this._static(board, -6.55, -6.78, 0, 0.68, { w: 1.7, d: 0.16 });
    this._interactive(board, {
      id: "board-meeting", label: "Papan agenda meeting", hint: "Klik untuk melihat agenda", radius: 1.1,
      onClick: () => "Agenda: prioritas sprint · desain produk · evaluasi rilis",
    });
    this._static(createStorageCabinet({ w: 0.9, h: 0.9, d: 0.36, color: "wood" }), -9.35, -5.45, Math.PI / 2);
    this._plant(-9.15, -1.65, 0, { variant: 1, scale: 0.68, seed: 31 });
    this._static(createBin(), -8.9, -2.2, 0);
    this._static(createWallArt({ w: 0.62, h: 0.72, variant: 2 }), -4.05, -6.78, 0, 0.64, { w: 0.1, d: 0.72 });

    /* ================= CAFE =================
       Service counter against the outside wall, two small tables and
       compact utilities; an open central route keeps the door usable. */
    const counter = this._kitchenCounter();
    this._static(counter, -0.05, -6.08, 0);
    this._splitLive(counter, [counter.userData.parts.machine]);
    const fridge = createFridge({ w: 0.58, h: 1.42, d: 0.56 });
    this._static(fridge, -2.42, -6.05, 0);
    this._interactive(fridge, {
      id: "cafe-fridge", label: "Kulkas cafe", hint: "Klik untuk membuka / menutup", radius: 0.75,
      onClick: (self) => self.userData.api.toggle() ? "Kulkas dibuka" : "Kulkas ditutup",
    });
    const cooler = createWaterCooler();
    this._static(cooler, 2.35, -5.85, 0);
    this._interactive(cooler, {
      id: "cooler", label: "Dispenser air cafe", hint: "Klik untuk mengambil air", radius: 0.75,
      onClick: () => "Air minum siap — jangan lupa hidrasi.",
    });

    const cafeTableA = createTable(1.28, 0.78, 0.73);
    this._static(cafeTableA, -1.22, -4.22, 0, 0, { w: 1.28, d: 0.78 });
    for (const [dz, yaw] of [[-0.76, 0], [0.76, Math.PI]]) {
      this._static(createOfficeChair({ color: "navy" }), -1.22, -4.22 + dz, yaw);
      this._seat(-1.22, -4.22 + dz, yaw, "lunch");
    }
    const cafeTableB = createTable(1.12, 0.74, 0.73);
    this._static(cafeTableB, 1.1, -2.25, 0, 0, { w: 1.12, d: 0.74 });
    for (const [dx, yaw] of [[-0.78, Math.PI / 2], [0.78, -Math.PI / 2]]) {
      this._static(createOfficeChair({ color: dx < 0 ? "navy" : "charcoal" }), 1.1 + dx, -2.25, yaw);
      this._seat(1.1 + dx, -2.25, yaw, "lunch");
    }
    this._static(createMug({ color: 0xe8e3d8 }), -1.38, -4.22, 0, 0.75);
    this._static(createMug({ color: 0xc9d6c7 }), 1.0, -2.25, 0, 0.75);
    this._static(createWallShelf({ w: 0.82, d: 0.22, shelves: 2 }), 1.7, -6.76, 0, 1.1, { w: 0.82, d: 0.18 });
    this._plant(2.45, -1.28, 0, { variant: 0, scale: 0.65, seed: 32 });
    this._static(createBin(), -2.5, -2.05, 0);

    /* ================= LOBBY =================
       Reception plus a modest waiting nook: furniture stays out of the
       entrance-to-corridor walking line. */
    const reception = this._receptionDesk();
    this._place(reception, -8.35, 2.45, 0, 0, { w: 2.6, d: 0.9 });
    const recMon = createMonitor({ width: 0.5 });
    this._place(recMon, -9.02, 2.45, 0, 0.78);
    this._interactive(recMon, {
      id: "monitor-reception", label: "Sistem registrasi tamu", hint: "Klik untuk mengganti tampilan", radius: 0.85,
      onClick: () => { recMon.userData.api.cycle(); return "Daftar tamu diperbarui"; },
    });
    this._deskChair(-8.35, 2.45, Math.PI, { color: "navy", type: "reception", gap: 0.78 });

    this._static(createSofa({ width: 1.72, depth: 0.78 }), -5.35, 5.95, Math.PI);
    this._seat(-5.35, 5.95, Math.PI, "lounge");
    this._static(createCoffeeTable({ r: 0.34 }), -5.35, 4.72, 0);
    this._static(createArmchair({ color: "sand" }), -4.05, 4.95, -Math.PI / 2);
    this._seat(-4.05, 4.95, -Math.PI / 2, "lounge");
    this._static(createBench({ w: 0.95, d: 0.38, h: 0.44 }), -8.55, 5.8, 0);
    this._static(createBookshelf({ width: 0.82, height: 1.45, depth: 0.28, shelves: 4 }), -9.48, 6.05, Math.PI / 2);
    this._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), -6.55, 6.1, 0);
    this._static(createWallArt({ w: 0.62, h: 0.78, variant: 3 }), -6.2, 6.78, 0, 0.65, { w: 0.1, d: 0.78 });
    this._plant(-9.25, 1.2, 0, { variant: 0, scale: 0.72, seed: 55 });
    this._static(createMagazineRack({ w: 0.5, h: 0.68, d: 0.24 }), -3.55, 2.0, Math.PI / 2);
    this._static(createBin(), -6.75, 2.0, 0);

    /* ================= STAFF ROOM =================
       Two full workstations fit with usable chair pull-back and a central
       approach; storage and a shared printer fill the remaining wall zones. */
    const staffDesks = [
      { x: -1.42, z: 5.45, color: "navy", id: "staff-a" },
      { x: 1.35, z: 5.45, color: "charcoal", id: "staff-b" },
    ];
    for (const d of staffDesks) {
      const ws = createWorkstation();
      this._place(ws, d.x, d.z, Math.PI, 0, { w: 2.05, d: 1.25 });
      this._deskParts(ws, d.id);
      this._deskChair(d.x, d.z, Math.PI, { color: d.color, gap: 0.78, type: "desk" });
    }
    const printer = createPrinterStation({ w: 0.72, h: 0.68, d: 0.5 });
    this._static(printer, 2.45, 2.2, -Math.PI / 2);
    this._interactive(printer, {
      id: "printer-staff", label: "Printer staff", hint: "Klik untuk mencetak dokumen", radius: 0.72,
      onClick: () => `Printer mencetak halaman #${printer.userData.api.print()}`,
    });
    this._static(createStorageCabinet({ w: 0.78, h: 1.18, d: 0.34, color: "light" }), -2.52, 2.35, Math.PI / 2);
    this._static(createWallShelf({ w: 0.9, d: 0.22, shelves: 2 }), -0.1, 6.76, 0, 1.08, { w: 0.9, d: 0.18 });
    this._static(createWallArt({ w: 0.55, h: 0.7, variant: 1 }), 1.35, 6.76, 0, 0.63, { w: 0.1, d: 0.7 });
    this._plant(2.45, 6.25, 0, { variant: 1, scale: 0.62, seed: 61 });
    this._static(createBin(), -2.55, 4.0, 0);

    /* ================= CEO ROOM =================
       Executive workstation, visitor sofa and side storage; deliberately
       scaled to a private office rather than a large empty suite. */
    const execDesk = createWorkstation();
    this._place(execDesk, 4.25, 3.1, Math.PI / 2, 0, { w: 2.05, d: 1.25 });
    this._deskParts(execDesk, "ceo-desk");
    this._deskChair(4.25, 3.1, Math.PI / 2, { color: "charcoal", gap: 0.78, type: "ceo" });
    this._static(createSofa({ width: 1.52, depth: 0.74 }), 7.1, 5.95, Math.PI);
    this._seat(7.1, 5.95, Math.PI, "lounge");
    this._static(createCoffeeTable({ r: 0.31 }), 7.1, 4.75, 0);
    this._static(createArmchair({ color: "navy" }), 6.1, 4.75, Math.PI / 2);
    this._seat(6.1, 4.75, Math.PI / 2, "lounge");
    this._static(createStorageCabinet({ w: 0.85, h: 1.22, d: 0.36, color: "wood" }), 9.4, 3.0, Math.PI / 2);
    this._static(createBookshelf({ width: 0.88, height: 1.58, depth: 0.3, shelves: 4 }), 9.45, 5.4, Math.PI / 2);
    this._static(createWallArt({ w: 0.58, h: 0.76, variant: 4 }), 6.7, 6.78, 0, 0.64, { w: 0.1, d: 0.76 });
    this._plant(9.35, 1.35, 0, { variant: 2, scale: 0.68, seed: 70 });
    this._static(createBin(), 4.0, 2.0, 0);

    /* Slim corridor furniture is omitted on purpose: the corridor is only
       1.6 m wide and must stay genuinely traversable. */
  }

  /* ------------------------------------------------- reception counter */

  _kitchenCounter() {
    const g = new THREE.Group();
    g.name = "Konter pantry";
    g.userData.interactionLabel = "Konter pantry";
    const w = 2.2;
    const h = 0.9;
    const d = 0.62;

    const carcass = rbox(w, h - 0.04, d, 0.02, MAT.plasticWhite, 0.01);
    carcass.position.set(0, (h - 0.04) / 2, 0);
    g.add(carcass);

    const top = rbox(w + 0.06, 0.05, d + 0.05, 0.02, MAT.concrete, 0.008);
    top.position.set(0, h - 0.025, 0);
    g.add(top);

    for (let i = 0; i < 3; i++) {
      const door = rbox(w / 3 - 0.05, h - 0.12, 0.02, 0.008, MAT.darkWood, 0.005);
      door.position.set(-w / 3 + i * (w / 3), (h - 0.06) / 2, d / 2 + 0.005);
      g.add(door);
      const handle = cyl(0.008, 0.008, 0.16, MAT.chrome, 10);
      handle.rotation.z = Math.PI / 2;
      handle.position.set(-w / 3 + i * (w / 3) + w / 6 - 0.08, h - 0.18, d / 2 + 0.03);
      g.add(handle);
    }

    const splash = rbox(w, 0.5, 0.03, 0.01, MAT.concrete, 0.005);
    splash.position.set(0, h + 0.25, -d / 2 + 0.02);
    g.add(splash);

    const shelf = rbox(w - 0.3, 0.04, 0.24, 0.01, MAT.darkWood, 0.005);
    shelf.position.set(0, h + 0.68, -d / 2 + 0.16);
    g.add(shelf);
    for (let i = 0; i < 4; i++) {
      const mug = createMug({ color: [0xe8e3d8, 0xa8543a, 0x46506b, 0xd8cbb6][i] });
      mug.position.set(-0.7 + i * 0.45, h + 0.7, -d / 2 + 0.16);
      g.add(mug);
    }

    const machine = createCoffeeMachine();
    machine.position.set(-0.55, h, 0.02);
    machine.rotation.y = 0.06;
    g.add(machine);
    this._interactive(machine, {
      id: "coffee",
      label: "Espresso machine",
      hint: "Klik untuk menarik satu shot",
      radius: 0.9,
      onClick: (self) => {
        self.userData.api.brew(4);
        return "Menarik double shot… ☕";
      },
    });

    const kettle = new THREE.Group();
    const kb = cyl(0.075, 0.09, 0.2, MAT.chrome, 22);
    kb.position.y = 0.1;
    kettle.add(kb);
    const spout = cyl(0.016, 0.022, 0.1, MAT.chrome, 10);
    spout.rotation.z = 0.9;
    spout.position.set(0.09, 0.14, 0);
    kettle.add(spout);
    const lid = cyl(0.055, 0.055, 0.03, MAT.blackMetal, 20);
    lid.position.y = 0.21;
    kettle.add(lid);
    kettle.position.set(0.42, h, 0.0);
    shade(kettle);
    g.add(kettle);

    shade(g);
    g.userData.footprint = { w: 2.2, d: 0.62 };
    g.userData.parts = { machine };
    return g;
  }

  /* ------------------------------------------------- reception counter */

  _receptionDesk() {
    const g = new THREE.Group();
    g.name = "Meja resepsionis";
    g.userData.interactionLabel = "Meja resepsionis";
    const w = 2.6;
    const h = 1.1;
    const d = 0.9;
    const body = rbox(w, h - 0.06, d, 0.05, MAT.darkWood, 0.02);
    body.position.y = (h - 0.06) / 2;
    g.add(body);
    const top = rbox(w + 0.08, 0.06, d + 0.08, 0.02, MAT.deskTop, 0.01);
    top.position.y = h - 0.03;
    g.add(top);
    const front = rbox(w - 0.1, 0.4, 0.04, 0.02, MAT.wallAccent, 0.01);
    front.position.set(0, 0.55, d / 2 + 0.01);
    g.add(front);
    const label = rbox(1.0, 0.18, 0.02, 0.01, MAT.brass, 0.005);
    label.position.set(0, 0.55, d / 2 + 0.03);
    g.add(label);
    shade(g);
    g.userData.footprint = { w: 2.6, d: 0.9 };
    return g;
  }

  /* ------------------------------------------------------------- merge */

  /** True if anything in `node`'s subtree animates or is clickable. */
  _isLive(node) {
    let live = false;
    node.traverse((o) => {
      if (o.userData && (o.userData.interactive || o.userData.update)) live = true;
    });
    return live;
  }

  /** Detach `parts` from `container`, keeping their world transforms. */
  _splitLive(container, parts) {
    container.updateWorldMatrix(true, true);
    for (const p of parts) {
      if (!p || !p.parent) continue;
      p.matrixWorld.decompose(p.position, p.quaternion, p.scale);
      container.remove(p);
      this.holder.add(p);
    }
  }

  /**
   * A workstation = decor + two interaction points. The desk, keyboard,
   * mouse, mug, notepad and monitor merge into the static batch; the task
   * lamp stays live so its bulb can still be switched, and the monitor is
   * reached through an invisible hotspot (its material stays addressable
   * even after merging, so `cycle()` still repaints the screen).
   */
  _deskParts(ws, key) {
    const parts = ws.userData.parts;
    ws.updateWorldMatrix(true, true);
    const monitor = parts.monitor;
    const mwp = monitor.getWorldPosition(new THREE.Vector3());
    this._splitLive(ws, [parts.lamp]);
    delete ws.userData.update;
    delete monitor.userData.update; // drop the screen flicker so the desk can merge

    this._interactive(parts.lamp, {
      id: `lamp-${key}`,
      label: "Lampu meja",
      hint: "Klik untuk nyala / mati",
      radius: 0.75,
      onClick: (self) => (self.userData.api.toggle() ? "Lampu meja nyala" : "Lampu meja mati"),
    });

    this._hotspot(mwp.x, mwp.z, 0.95, 0.8, {
      id: `monitor-${key}`,
      label: "Layar telemetri",
      hint: "Klik untuk ganti tampilan",
      radius: 1.0,
      onClick: () => {
        monitor.userData.api.cycle();
        return "Layar berganti";
      },
    });

    // Peripherals each get their own target, not just the workstation shell.
    const peripherals = [
      [parts.keyboard, "Keyboard", "Periksa keyboard workstation"],
      [parts.mouse, "Mouse", "Periksa mouse workstation"],
      [parts.mug, "Cangkir", "Cangkir workstation siap digunakan"],
      [parts.notepad, "Catatan kerja", "Catatan kerja dibuka untuk inspeksi"],
    ];
    for (const [part, label, message] of peripherals) {
      if (!part) continue;
      const pos = part.getWorldPosition(new THREE.Vector3());
      this._hotspot(pos.x, pos.z, 0.91, 0.42, {
        id: `${label.toLowerCase().replace(/\s+/g, "-")}-${key}`,
        label: `${label} · workstation`,
        hint: "Klik untuk inspeksi",
        radius: 0.55,
        onClick: () => message,
      });
    }
  }

  /**
   * Bake everything static down to ~one mesh per material; anything with
   * an update hook or an interactive tag stays live as its own object.
   */
  _mergeStatic() {
    const mergeGroup = new THREE.Group();
    const all = [...this.holder.children, ...this.staticGroup.children];
    for (const child of all) {
      if (this._isLive(child)) {
        if (child.parent !== this.holder) this.holder.add(child);
      } else {
        mergeGroup.add(child); // reparent (both parents sit at identity)
      }
    }

    mergeGroup.updateWorldMatrix(true, true);
    const buckets = new Map();
    const passthrough = [];

    mergeGroup.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (Array.isArray(o.material)) {
        passthrough.push(o);
        return;
      }
      let g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      for (const key of Object.keys(g.attributes)) {
        if (key !== "position" && key !== "normal" && key !== "uv") g.deleteAttribute(key);
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        const count = g.attributes.position.count;
        g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      let arr = buckets.get(o.material);
      if (!arr) {
        arr = [];
        buckets.set(o.material, arr);
      }
      arr.push(g);
    });

    const passthroughClones = passthrough.map((m) => {
      const clone = m.clone();
      m.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
      return clone;
    });

    mergeGroup.clear();

    const out = new THREE.Group();
    out.name = "StaticMerged";
    for (const [mat, geoms] of buckets) {
      try {
        const merged = mergeGeometries(geoms, false);
        if (!merged) throw new Error("merge returned null");
        for (const g of geoms) g.dispose();
        out.add(new THREE.Mesh(merged, mat));
      } catch (err) {
        // fall back to keeping them separate rather than losing geometry
        for (const g of geoms) out.add(new THREE.Mesh(g, mat));
      }
    }
    for (const c of passthroughClones) out.add(c);

    this.scene.add(out);
    this.staticMeshes = out;

    // collect per-prop animation hooks from everything that stayed live
    this.tickers = [];
    this.holder.traverse((o) => {
      if (o.userData && o.userData.update) this.tickers.push(o);
    });
  }

  /* ------------------------------------------------- navigation helpers */

  roomAt(x, z) {
    // Support rooms sit inside larger zones (print nook, archive and huddle
    // room). Pick the smallest matching envelope so nested spaces remain real
    // destinations for the AI instead of being swallowed by their parent room.
    let best = null;
    let bestArea = Infinity;
    for (const r of this.rooms) {
      const hit = r.polygon
        ? pointInPolygon(x, z, r.polygon)
        : x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
      if (!hit) continue;
      const area = Math.max(0.01, (r.x1 - r.x0) * (r.z1 - r.z0));
      if (area < bestArea) { best = r; bestArea = area; }
    }
    return best?.id || "corridor";
  }

  room(id) {
    return this.rooms.find((r) => r.id === id) || null;
  }

  clampToFloor(v3, margin = 0.35) {
    v3.x = THREE.MathUtils.clamp(v3.x, this.bounds.x0 + margin, this.bounds.x1 - margin);
    v3.z = THREE.MathUtils.clamp(v3.z, this.bounds.z0 + margin, this.bounds.z1 - margin);
    return v3;
  }

  resolveCollisions(v3, radius = 0.3) {
    for (const b of this.obstacles) {
      const cx = THREE.MathUtils.clamp(v3.x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(v3.z, b.minZ, b.maxZ);
      const dx = v3.x - cx;
      const dz = v3.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > radius * radius) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        v3.x += dx * push;
        v3.z += dz * push;
      } else {
        const left = v3.x - b.minX;
        const right = b.maxX - v3.x;
        const near = v3.z - b.minZ;
        const far = b.maxZ - v3.z;
        const m = Math.min(left, right, near, far);
        if (m === left) v3.x = b.minX - radius;
        else if (m === right) v3.x = b.maxX + radius;
        else if (m === near) v3.z = b.minZ - radius;
        else v3.z = b.maxZ + radius;
      }
    }
    return v3;
  }

  isFree(x, z, radius = 0.35) {
    for (const b of this.obstacles) {
      const cx = THREE.MathUtils.clamp(x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(z, b.minZ, b.maxZ);
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return false;
    }
    return true;
  }

  /** Waypoints from one room to a target point in another room. */
  path(fromRoomId, toRoomId, target) {
    const pts = [];
    if (fromRoomId !== toRoomId) {
      if (fromRoomId !== "corridor") {
        const a = this.anchors[fromRoomId];
        if (a) {
          pts.push({ x: a.inside.x, z: a.inside.z });
          pts.push({ x: a.corridor.x, z: a.corridor.z });
        }
      }
      if (toRoomId !== "corridor") {
        const b = this.anchors[toRoomId];
        if (b) {
          pts.push({ x: b.corridor.x, z: b.corridor.z });
          pts.push({ x: b.inside.x, z: b.inside.z });
        }
      }
    }
    pts.push({ x: target.x, z: target.z });
    return pts;
  }

  /** A free point inside a room (or any room if `roomId` is omitted). */
  randomSpot(roomId = null, out = { x: 0, z: 0 }) {
    for (let attempt = 0; attempt < 14; attempt++) {
      const room = roomId
        ? this.room(roomId)
        : this.rooms[Math.floor(this.rng() * this.rooms.length)];
      if (!room) break;
      const inset = 1.3;
      const x = room.x0 + inset + this.rng() * Math.max(0.5, room.x1 - room.x0 - inset * 2);
      const z = room.z0 + inset + this.rng() * Math.max(0.5, room.z1 - room.z0 - inset * 2);
      if (this.roomAt(x, z) !== room.id) continue;
      if (this.isFree(x, z, 0.55)) {
        out.x = x;
        out.z = z;
        return out;
      }
    }
    out.x = 0;
    out.z = 0;
    return out;
  }

  /** Nearest free seat of a type, optionally claimed by `who`. */
  claimSeat(type, who) {
    const free = this.seats.filter((s) => s.type === type && (!s.taken || s.taken === who));
    if (!free.length) return null;
    const seat = free[Math.floor(Math.random() * free.length)];
    seat.taken = who;
    return seat;
  }

  releaseSeat(seat, who) {
    if (seat && seat.taken === who) seat.taken = null;
  }

  /**
   * The spot a critter should stand on to use a seat. Seats sit inside
   * their own furniture (a chair tucked under a desk, a sofa against its
   * own footprint), so the exact seat point is never walkable: pick the
   * closest free point around it instead.
   *
   * The scan starts on the side the seat *faces* (its desk, its table) and
   * only then works its way around, so a critter always walks up to the
   * desk the way a person would — never from behind the chair.
   */
  approachTo(seat, radii = [0.5, 0.68, 0.86]) {
    const room = this.roomAt(seat.x, seat.z);
    const base = seat.yaw ?? 0;
    for (const r of radii) {
      for (let i = 0; i < 12; i++) {
        const step = Math.ceil(i / 2) * (Math.PI / 6) * (i % 2 ? 1 : -1);
        const a = base + step;
        const x = seat.x + Math.sin(a) * r;
        const z = seat.z + Math.cos(a) * r;
        if (this.roomAt(x, z) !== room) continue;
        if (this.isFree(x, z, 0.32)) return { x, z };
      }
    }
    return null;
  }

  /* --------------------------------------------------------------- loop */

  update(dt, elapsed) {
    if (Math.abs(this.targetNightness - this.nightness) > 0.001) {
      const k = 1 - Math.exp(-2.2 * dt);
      this.nightness += (this.targetNightness - this.nightness) * k;
      this._applyNightness();
    }
    for (let i = 0; i < this.tickers.length; i++) {
      this.tickers[i].userData.update?.(dt, elapsed);
    }
  }
}

/** A small lunch/meeting table used by the pantry. */
function createTable(w, d, h) {
  const g = new THREE.Group();
  g.name = "Meja makan";
  g.userData.interactionLabel = "Meja makan";
  const top = rbox(w, 0.05, d, 0.02, MAT.deskTop, 0.01);
  top.position.y = h - 0.025;
  g.add(top);
  const legGeo = new THREE.CylinderGeometry(0.035, 0.035, h - 0.05, 12);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const leg = new THREE.Mesh(legGeo, MAT.steel);
    leg.position.set(sx * (w / 2 - 0.1), (h - 0.05) / 2, sz * (d / 2 - 0.1));
    g.add(leg);
  }
  shade(g);
  g.userData.footprint = { w, d };
  return g;
}

export { BOUNDS, WALL_H, WALL_T };
