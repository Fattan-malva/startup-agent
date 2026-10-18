import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { MAT } from "./materials.js";
import { mulberry32 } from "./textures.js";
import { Critter } from "../character/Critter.js";
import { StaffBrain } from "../systems/AI.js";
import {
  box,
  cyl,
  rbox,
  sphere,
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
 * ===================================================================== */

const SIT_FWD = 0.16;

function polygonFloorGeometry(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 2);
  geometry.rotateX(-Math.PI / 2);
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

    this.staffPosts = {};
    this.staffCritters = {};
    // pasangan critter + StaffBrain yang berkeliling dalam ruangannya
    this.staffRoster = [];
    // true saat rapat berjalan: staf dipas-lepas dari kunci pos ruangan
    this.meetingActive = false;

    this._v = new THREE.Vector3();
    this._c = new THREE.Color();
    this.rng = mulberry32(1337);

    this.holder = new THREE.Group();
    this.holder.name = "Props";
    this.staticGroup = new THREE.Group();
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
    this._roomSigns();
    this._lighting();
    this._furnish();
    this._addUniversalInteractions();
    this._mergeStatic();
    this._pruneLights();
    return this;
  }

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
      wood: MAT.floor,
    };
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

    const thresholdMat = MAT.brass || MAT.steel;
    for (const x of [-6.5, 1.5, 6.5]) {
      const strip = box(1.16, 0.018, 0.075, thresholdMat);
      strip.position.set(x, 0.018, -0.79);
      this.staticGroup.add(strip);
    }
    // South doors: lobby (-6.5), staff (0), CEO (8.5).
    for (const x of [-6.5, 0, 8.5]) {
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

      const skirting = box(sl, 0.095, WALL_T + 0.045, MAT.darkWood);
      skirting.position.set(mx, 0.075, mz);
      skirting.rotation.y = rot;
      this.staticGroup.add(skirting);
      const cap = box(sl, 0.055, WALL_T + 0.065, MAT.blackMetal);
      cap.position.set(mx, WALL_H - 0.006, mz);
      cap.rotation.y = rot;
      this.staticGroup.add(cap);

      const halfT = WALL_T / 2 + 0.035;
      this.obstacles.push({
        minX: Math.min(sx, ex) - halfT,
        maxX: Math.max(sx, ex) + halfT,
        minZ: Math.min(sz, ez) - halfT,
        maxZ: Math.max(sz, ez) + halfT,
      });

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

  /* ---------------------------------------------------------- room signs */

  _roomSigns() {
    const makeSignTexture = (title, sub) => {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 128;
      const ctx = c.getContext("2d");

      const g = ctx.createLinearGradient(0, 0, 512, 0);
      g.addColorStop(0, "#11161b");
      g.addColorStop(0.5, "#26313a");
      g.addColorStop(1, "#11161b");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 128);

      ctx.strokeStyle = "#c9a25a";
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, 496, 112);

      ctx.fillStyle = "#f4efe4";
      ctx.font = '700 44px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(title, 256, 54);

      ctx.fillStyle = "#c9a25a";
      ctx.font = '500 20px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(sub, 256, 94);

      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    };

    const signs = [
      { title: "RUANG MEETING", sub: "MEETING ROOM", x: -6.5, z: -0.73, ry: 0, face: 1 },
      { title: "CAFE", sub: "BAR & LOUNGE", x: 1.5, z: -0.73, ry: 0, face: 1 },
      { title: "STUDIO KREATIF", sub: "CREATIVE LAB", x: 6.5, z: -0.73, ry: 0, face: 1 },
      { title: "LOBBY", sub: "RECEPTION", x: -6.5, z: 0.73, ry: Math.PI, face: -1 },
      { title: "STAFF ROOM", sub: "8 WORKSTATIONS", x: 0, z: 0.73, ry: Math.PI, face: -1 },
      { title: "CEO ROOM", sub: "PRIVATE OFFICE", x: 8.5, z: 0.73, ry: Math.PI, face: -1 },
    ];

    for (const s of signs) {
      const back = rbox(1.05, 0.26, 0.045, 0.018, MAT.steel, 0.008);
      back.position.set(s.x, 1.29, s.z);
      back.rotation.y = s.ry;
      this.staticGroup.add(back);

      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.98, 0.21),
        new THREE.MeshStandardMaterial({
          map: makeSignTexture(s.title, s.sub),
          roughness: 0.42,
          metalness: 0.15,
        }),
      );
      plate.position.set(s.x, 1.29, s.z + s.face * 0.03);
      plate.rotation.y = s.ry;
      this.staticGroup.add(plate);
    }

    const ent = rbox(1.35, 0.3, 0.05, 0.02, MAT.steel, 0.01);
    ent.position.set(-9.93, 1.28, 4.5);
    ent.rotation.y = Math.PI / 2;
    this.staticGroup.add(ent);

    const entPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.26, 0.24),
      new THREE.MeshStandardMaterial({
        map: makeSignTexture("CRITTER CORP", "WELCOME"),
        roughness: 0.4,
        metalness: 0.2,
      }),
    );
    entPlate.position.set(-9.9, 1.28, 4.5);
    entPlate.rotation.y = Math.PI / 2;
    this.staticGroup.add(entPlate);
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

  _seat(x, z, yaw, type) {
    const seat = {
      id: `${type}-${this.seats.length}`,
      x, z, yaw, type, taken: null,
      sit: { x: x + Math.sin(yaw) * SIT_FWD, z: z + Math.cos(yaw) * SIT_FWD },
    };
    this.seats.push(seat);
    return seat;
  }

  _deskChair(deskX, deskZ, deskRy, { color = "charcoal", gap = 0.85, type = "desk" } = {}) {
    const x = deskX + Math.sin(deskRy) * gap;
    const z = deskZ + Math.cos(deskRy) * gap;
    const yaw = deskRy + Math.PI;
    this._static(createOfficeChair({ color }), x, z, yaw);
    return this._seat(x, z, yaw, type);
  }

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

  _hotspot(x, z, y, size, meta) {
    const mesh = new THREE.Mesh(this._hotspotGeo, this._hotspotMat);
    mesh.scale.set(size, Math.max(0.6, size), size);
    mesh.position.set(x, y, z);
    this.holder.add(mesh);
    this._interactive(mesh, meta);
    return mesh;
  }

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
    /* ================= RUANG MEETING ================= */
    const mcx = -5.5;
    const mcz = -3.9;

    this._static(
      createMeetingTable({ w: 4.8, d: 1.2, h: 0.75 }),
      mcx, mcz, 0, 0, { w: 4.8, d: 1.2 },
    );

    const sideSeatXs = [-1.92, -0.96, 0, 0.96, 1.92];
    for (const dz of [-0.9, 0.9]) {
      const yaw = dz > 0 ? Math.PI : 0;
      for (let i = 0; i < sideSeatXs.length; i++) {
        const dx = sideSeatXs[i];
        const color = (i + (dz > 0 ? 1 : 0)) % 2 === 0 ? "navy" : "charcoal";
        this._static(createOfficeChair({ color }), mcx + dx, mcz + dz, yaw);
        this._seat(mcx + dx, mcz + dz, yaw, "meeting");
      }
    }

    const headX = mcx + 2.4 + 0.65;
    const headYaw = -Math.PI / 2;
    this._static(createOfficeChair({ color: "charcoal" }), headX, mcz, headYaw);
    this._seat(headX, mcz, headYaw, "meeting");

    const board = createWhiteboard({ w: 2.4, h: 1.1 });
    this._static(board, mcx, -6.78, 0, 0.72, { w: 2.5, d: 0.16 });
    this._interactive(board, {
      id: "board-meeting", label: "Papan agenda meeting",
      hint: "Klik untuk melihat agenda", radius: 1.5,
      onClick: () => "Agenda: prioritas sprint · desain produk · evaluasi rilis",
    });

    this._static(createWallArt({ w: 0.7, h: 0.9, variant: 2 }), -8.6, -6.78, 0, 0.7, { w: 0.8, d: 0.1 });
    this._static(createWallArt({ w: 0.7, h: 0.9, variant: 4 }), -2.4, -6.78, 0, 0.7, { w: 0.8, d: 0.1 });

    this._static(createStorageCabinet({ w: 1.0, h: 1.1, d: 0.4, color: "wood" }), -9.4, -5.8, Math.PI / 2);
    this._static(createStorageCabinet({ w: 1.0, h: 1.1, d: 0.4, color: "light" }), -9.4, -2.0, Math.PI / 2);

    this._plant(-9.2, -1.5, 0, { variant: 1, scale: 0.7, seed: 31 });
    // Bin meeting — pojok tenggara (dekat pintu, sisi timur).
    this._static(createBin(), -1.2, -1.15, 0);

    const pendantA = createPendantLamp();
    const pendantB = createPendantLamp();
    const pendantC = createPendantLamp();
    this._static(pendantA, mcx - 1.5, mcz, 0, 2.15);
    this._static(pendantB, mcx, mcz, 0, 2.15);
    this._static(pendantC, mcx + 1.5, mcz, 0, 2.15);
    this._interactive(pendantA, { id: "pendant-meeting-a", label: "Lampu rapat A", hint: "Klik untuk nyala / mati", radius: 0.75, onClick: (self) => self.userData.api.toggle() ? "Lampu A nyala" : "Lampu A mati" });
    this._interactive(pendantB, { id: "pendant-meeting-b", label: "Lampu rapat B", hint: "Klik untuk nyala / mati", radius: 0.75, onClick: (self) => self.userData.api.toggle() ? "Lampu B nyala" : "Lampu B mati" });
    this._interactive(pendantC, { id: "pendant-meeting-c", label: "Lampu rapat C", hint: "Klik untuk nyala / mati", radius: 0.75, onClick: (self) => self.userData.api.toggle() ? "Lampu C nyala" : "Lampu C mati" });

    /* ================= CAFE ================= */
    const counter = this._kitchenCounter();
    this._static(counter, 0.5, -6.35, 0);
    this._splitLive(counter, [counter.userData.parts.machine]);

    const fridge = createFridge({ w: 0.55, h: 1.4, d: 0.55 });
    this._static(fridge, -0.6, -6.35, 0);
    this._interactive(fridge, {
      id: "cafe-fridge", label: "Kulkas cafe",
      hint: "Klik untuk membuka / menutup", radius: 0.7,
      onClick: (self) => self.userData.api.toggle() ? "Kulkas dibuka" : "Kulkas ditutup",
    });

    const tv = createTV({ w: 1.4, h: 0.85 });
    this._static(tv, 2.2, -6.85, 0, 1.15, { w: 1.5, d: 0.2 });
    this._interactive(tv, {
      id: "cafe-tv", label: "TV lounge",
      hint: "Klik untuk ganti channel", radius: 1.2,
      onClick: () => "Channel: gameplay tournament · 4K 60 fps",
    });

    const ps = createPlayStation();
    this._static(ps, 2.2, -6.65, 0, 0.55, { w: 0.4, d: 0.25 });
    this._interactive(ps, {
      id: "cafe-ps", label: "PlayStation",
      hint: "Klik untuk menyalakan", radius: 0.7,
      onClick: () => "PS: game siap dimainkan",
    });

    // Carpet L-shape — digeser ke dalam supaya tidak menyentuh dinding koridor.
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.0), MAT.rug);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0.3, 0.012, -2.5);
    carpet.receiveShadow = true;
    this.staticGroup.add(carpet);

    // L-sofa A — sisi koridor, back DI DALAM room (tidak menembus dinding).
    // Back sofa = z_back; center z = -1.55 → back di -1.125, dinding inner -0.87. Aman.
    const sofaA = createSofa({ width: 2.0, depth: 0.85 });
    this._static(sofaA, 0.05, -1.55, Math.PI, 0, { w: 2.1, d: 0.95 });
    this._seat(0.05, -1.55, Math.PI, "lounge");

    // L-sofa B — sisi barat, footprint FIX (pre-swap salah sebelumnya).
    // fp {w:2.4, d:0.85} dibaca _static dengan swap ry=π/2 → world 0.85 × 2.4.
    const sofaB = createSofa({ width: 2.4, depth: 0.85 });
    this._static(sofaB, -0.4, -2.45, Math.PI / 2, 0, { w: 2.4, d: 0.85 });
    this._seat(-0.4, -2.45, Math.PI / 2, "lounge");

    // Coffee table — digeser bersama sofa supaya tidak menembus sofa.
    this._static(createCoffeeTable({ r: 0.38 }), 0.5, -2.5, 0);

    this._plant(2.6, -1.3, 0, { variant: 0, scale: 0.7, seed: 32 });
    // Bin cafe — pojok tenggara.
    this._static(createBin(), 2.7, -1.15, 0);

    // Barista cafe — keliling cafe & duduk di sofanya, tapi selalu kembali
    // ke belakang konter.
    this._spawnStaffCritter({
      id: "barista",
      name: "Barista",
      tieColor: 0x4f9b78,
      department: { id: "cafe", name: "Cafe" },
      variant: 0,
      x: 0.5, z: -5.45, yaw: 0,
      hotspotLabel: "Barista cafe",
      hotspotHint: "Klik untuk memesan kopi",
      hotspotMessage: "Barista: pesanan dicatat, silakan tunggu di lounge ☕",
      radius: 1.1,
      room: "cafe",
      homeStatus: "Menyeduh kopi ☕",
    });

    /* ================= LOBBY ================= */
    const reception = this._receptionDesk();
    this._place(reception, -8.35, 2.45, 0, 0, { w: 2.6, d: 0.9 });
    const recMon = createMonitor({ width: 0.5 });
    this._place(recMon, -9.02, 2.45, 0, 0.78);
    this._interactive(recMon, {
      id: "monitor-reception", label: "Sistem registrasi tamu", hint: "Klik untuk mengganti tampilan", radius: 0.85,
      onClick: () => { recMon.userData.api.cycle(); return "Daftar tamu diperbarui"; },
    });
    this._deskChair(-8.35, 2.45, Math.PI, { color: "navy", type: "reception", gap: 0.78 });

    // Resepsionis lobby — keliling lobby & duduk di kursi receptionisnya
    this._spawnStaffCritter({
      id: "receptionist",
      name: "Resepsionis",
      tieColor: 0x477da6,
      department: { id: "lobby", name: "Lobby" },
      variant: 1,
      x: -7.85, z: 3.6, yaw: -Math.PI / 3,
      hotspotLabel: "Resepsionis lobby",
      hotspotHint: "Klik untuk bertanya",
      hotspotMessage: "Resepsionis: selamat datang di Critter Corp. Ada yang bisa dibantu?",
      radius: 1.4,
      room: "lobby",
      seatType: "reception",
      homeStatus: "Menunggu tamu 🛎️",
    });

    this._static(createSofa({ width: 1.72, depth: 0.78 }), -5.35, 5.95, Math.PI);
    this._seat(-5.35, 5.95, Math.PI, "lounge");
    this._static(createCoffeeTable({ r: 0.34 }), -5.35, 4.72, 0);
    this._static(createArmchair({ color: "sand" }), -4.05, 4.95, -Math.PI / 2);
    this._seat(-4.05, 4.95, -Math.PI / 2, "lounge");
    this._static(createBench({ w: 0.95, d: 0.38, h: 0.44 }), -8.55, 5.8, 0);
    this._static(createBookshelf({ width: 0.82, height: 1.45, depth: 0.28, shelves: 4 }), -9.48, 6.05, Math.PI / 2);
    this._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), -6.55, 6.1, 0);
    this._static(createWallArt({ w: 0.62, h: 0.78, variant: 3 }), -6.2, 6.82, Math.PI, 0.65, { w: 0.1, d: 0.78 });
    this._plant(-9.25, 1.2, 0, { variant: 0, scale: 0.72, seed: 55 });
    this._static(createMagazineRack({ w: 0.5, h: 0.68, d: 0.24 }), -3.55, 2.0, Math.PI / 2);
    // Bin lobby — pojok timur laut (dekat pintu, tapi jauh dari door).
    this._static(createBin(), -3.3, 1.1, 0);

    /* ================= STAFF ROOM =================
       8 workstation: 4 kolom × 2 baris. Space antar meja ±0.8 m sekarang,
       karena staff room diperluas ke x = -3 … 7. */
    const staffXs = [-1.85, 0.72, 3.28, 5.85];
    const staffRows = [
      { z: 2.7, ry: 0, color: "navy" },
      { z: 5.8, ry: Math.PI, color: "charcoal" },
    ];

    let staffIdx = 0;
    for (const row of staffRows) {
      for (const x of staffXs) {
        const ws = createWorkstation({ desk: { width: 1.75 } });
        this._place(ws, x, row.z, row.ry, 0, { w: 1.8, d: 1.2 });
        this._deskParts(ws, `staff-${String.fromCharCode(97 + staffIdx)}`);
        this._deskChair(x, row.z, row.ry, {
          color: staffIdx % 2 === 0 ? "navy" : "charcoal",
          gap: 0.78,
          type: "desk",
        });
        staffIdx++;
      }
    }

    const printer = createPrinterStation({ w: 0.72, h: 0.68, d: 0.5 });
    this._static(printer, 6.2, 1.5, -Math.PI / 2);
    this._interactive(printer, {
      id: "printer-staff", label: "Printer staff", hint: "Klik untuk mencetak dokumen", radius: 0.72,
      onClick: () => `Printer mencetak halaman #${printer.userData.api.print()}`,
    });

    this._static(
      createStorageCabinet({ w: 0.78, h: 1.18, d: 0.34, color: "light" }),
      -2.5, 1.5, Math.PI / 2,
    );

    this._static(createWallShelf({ w: 0.9, d: 0.22, shelves: 2 }), 0.4, 6.82, Math.PI, 1.08, { w: 0.9, d: 0.18 });
    this._static(createWallArt({ w: 0.55, h: 0.7, variant: 1 }), 3.5, 6.82, Math.PI, 0.63, { w: 0.1, d: 0.7 });
    this._plant(5.6, 6.5, 0, { variant: 1, scale: 0.62, seed: 61 });
    // Bin staff — pojok barat daya.
    this._static(createBin(), -2.7, 6.5, 0);

    /* ================= STUDIO KREATIF ================= */
    this._static(
      createMeetingTable({ w: 2.8, d: 1.3, h: 0.75 }),
      6.35, -3.55, 0, 0, { w: 2.8, d: 1.3 },
    );

    const studioSeatXs = [5.25, 7.45];
    for (const dz of [-0.82, 0.82]) {
      const yaw = dz > 0 ? Math.PI : 0;
      for (const x of studioSeatXs) {
        this._static(
          createOfficeChair({ color: dz > 0 ? "charcoal" : "navy" }),
          x, -3.55 + dz, yaw,
        );
        this._seat(x, -3.55 + dz, yaw, "meeting");
      }
    }

    const studioBoard = createWhiteboard({ w: 2.2, h: 1.0 });
    this._static(studioBoard, 6.35, -6.78, 0, 0.72, { w: 2.3, d: 0.16 });
    this._interactive(studioBoard, {
      id: "board-studio",
      label: "Papan ide studio",
      hint: "Klik untuk melihat moodboard",
      radius: 1.4,
      onClick: () => "Moodboard: eksplorasi warna, material, dan konsep kampanye",
    });

    this._static(createAcousticPanel({ w: 0.52, h: 0.86, color: "sage" }), 4.2, -6.78, 0, 0.7, { w: 0.6, d: 0.1 });
    this._static(createAcousticPanel({ w: 0.52, h: 0.86, color: "rust" }), 8.5, -6.78, 0, 0.7, { w: 0.6, d: 0.1 });

    this._static(
      createStorageCabinet({ w: 0.85, h: 1.18, d: 0.36, color: "light" }),
      3.45, -2.0, Math.PI / 2,
    );
    this._static(
      createBookshelf({ width: 0.9, height: 1.55, depth: 0.3, shelves: 4 }),
      9.45, -3.2, -Math.PI / 2,
    );

    this._static(createArmchair({ color: "olive" }), 8.55, -1.75, -Math.PI / 2);
    this._seat(8.55, -1.75, -Math.PI / 2, "lounge");
    this._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), 9.45, -1.75, 0);
    this._static(createFloorLamp(), 9.45, -5.8, 0);

    const studioRug = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.8), MAT.rug);
    studioRug.rotation.x = -Math.PI / 2;
    studioRug.position.set(6.35, 0.014, -3.55);
    studioRug.receiveShadow = true;
    this.staticGroup.add(studioRug);

    this._plant(3.55, -6.2, 0, { variant: 1, scale: 0.68, seed: 88 });
    this._plant(9.35, -6.25, 0, { variant: 0, scale: 0.62, seed: 89 });
    this._static(createWallArt({ w: 0.62, h: 0.78, variant: 2 }), 9.78, -4.8, -Math.PI / 2, 0.68, { w: 0.1, d: 0.78 });
    // Bin studio — pojok barat laut (dekat dinding koridor, bukan di pintu).
    this._static(createBin(), 3.5, -1.1, 0);

    /* ================= CEO ROOM =================
       Ruang lebih kecil (x = 7..10), door di x = 8.5. Sofa/coffee/armchair
       dan dekorasi disesuaikan dengan lebar baru. */
    const execDesk = createWorkstation();
    this._place(execDesk, 8.35, 2.65, Math.PI / 2, 0, { w: 2.05, d: 1.25 });
    this._deskParts(execDesk, "ceo-desk");
    this._deskChair(8.35, 2.65, Math.PI / 2, { color: "charcoal", gap: 0.78, type: "ceo" });

    this._static(createSofa({ width: 1.42, depth: 0.72 }), 7.85, 5.85, Math.PI);
    this._seat(7.85, 5.85, Math.PI, "lounge");
    this._static(createCoffeeTable({ r: 0.29 }), 7.85, 4.72, 0);
    this._static(createArmchair({ color: "navy" }), 9.0, 4.95, -Math.PI / 2);
    this._seat(9.0, 4.95, -Math.PI / 2, "lounge");

    this._static(createStorageCabinet({ w: 0.82, h: 1.18, d: 0.34, color: "wood" }), 9.52, 1.5, Math.PI / 2);
    this._static(createBookshelf({ width: 0.84, height: 1.52, depth: 0.28, shelves: 4 }), 9.52, 6.15, Math.PI / 2);
    this._static(createWallArt({ w: 0.55, h: 0.72, variant: 4 }), 8.5, 6.82, Math.PI, 0.64, { w: 0.1, d: 0.72 });
    this._plant(7.35, 6.6, 0, { variant: 2, scale: 0.64, seed: 70 });
    // Bin CEO — pojok barat daya, jauh dari pintu (door di x=8.5).
    this._static(createBin(), 7.3, 1.05, 0);
  }

  /* ------------------------------------------------- staff critter (NPC) */

  _spawnStaffCritter({
    id,
    name,
    tieColor,
    department,
    variant = 0,
    x, z, yaw = 0,
    hotspotLabel,
    hotspotHint,
    hotspotMessage,
    radius = 1.2,
    room,
    seatType = null,      // mis. "reception" → staf duduk di kursi posnya
    homeStatus = null,
    wanderRadius = 5,     // radius merdeka berkeliling (di clamp ruangan saja)
  }) {
    const critter = new Critter({
      species: "staff",
      name,
      tieColor,
      department,
      variant,
    });

    // penanda "live" supaya root ini tidak ikut digabung ke mesh statis;
    // update sesungguhnya dilakukan Building lewat staffRoster
    critter.root.userData.interactionManaged = true;
    critter.root.userData.liveMarker = true;
    critter.root.userData.update = () => {};

    this._static(critter.root, x, z, yaw);
    critter.teleport(x, z, yaw);

    this._hotspot(x, z, 0.9, 0.6, {
      id: `${id}-hotspot`,
      label: hotspotLabel,
      hint: hotspotHint,
      radius,
      onClick: () => hotspotMessage,
    });

    const post = {
      room,
      x, z, yaw,
      radius: wanderRadius,
      homeStatus: homeStatus || "Standby",
    };
    this.staffPosts[id] = post;
    this.staffCritters[id] = critter;

    const brain = new StaffBrain(critter, this, post, { seatType, homeStatus });
    this.staffRoster.push({ critter, brain, postId: id });
    critter.brain = brain;

    return critter;
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
      onClick: (self) => { self.userData.api.brew(4); return "Menarik double shot… ☕"; },
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

  _receptionDesk() {
    const g = new THREE.Group();
    g.name = "Meja resepsionis";
    g.userData.interactionLabel = "Meja resepsionis";
    const w = 2.6, h = 1.1, d = 0.9;
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

  _isLive(node) {
    let live = false;
    node.traverse((o) => {
      if (o.userData && (o.userData.interactive || o.userData.update)) live = true;
    });
    return live;
  }

  _splitLive(container, parts) {
    container.updateWorldMatrix(true, true);
    for (const p of parts) {
      if (!p || !p.parent) continue;
      p.matrixWorld.decompose(p.position, p.quaternion, p.scale);
      container.remove(p);
      this.holder.add(p);
    }
  }

  _deskParts(ws, key) {
    const parts = ws.userData.parts;
    ws.updateWorldMatrix(true, true);
    const monitor = parts.monitor;
    const mwp = monitor.getWorldPosition(new THREE.Vector3());
    this._splitLive(ws, [parts.lamp]);
    delete ws.userData.update;
    delete monitor.userData.update;

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
      onClick: () => { monitor.userData.api.cycle(); return "Layar berganti"; },
    });

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

  _mergeStatic() {
    const mergeGroup = new THREE.Group();
    const all = [...this.holder.children, ...this.staticGroup.children];
    for (const child of all) {
      if (this._isLive(child)) {
        if (child.parent !== this.holder) this.holder.add(child);
      } else {
        mergeGroup.add(child);
      }
    }

    mergeGroup.updateWorldMatrix(true, true);
    const buckets = new Map();
    const passthrough = [];

    mergeGroup.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (Array.isArray(o.material)) { passthrough.push(o); return; }
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
      if (!arr) { arr = []; buckets.set(o.material, arr); }
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
        for (const g of geoms) out.add(new THREE.Mesh(g, mat));
      }
    }
    for (const c of passthroughClones) out.add(c);

    this.scene.add(out);
    this.staticMeshes = out;

    this.tickers = [];
    this.holder.traverse((o) => {
      if (o.userData && o.userData.update) this.tickers.push(o);
    });
  }

  /* ------------------------------------------------- navigation helpers */

  roomAt(x, z) {
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

  staffPost(id) {
    return this.staffPosts[id] || null;
  }

  clampToStaffPost(id, v3, margin = 0.35) {
    const p = this.staffPosts[id];
    if (!p) return v3;

    const room = this.room(p.room);
    if (room) {
      v3.x = THREE.MathUtils.clamp(v3.x, room.x0 + margin, room.x1 - margin);
      v3.z = THREE.MathUtils.clamp(v3.z, room.z0 + margin, room.z1 - margin);
    }

    const dx = v3.x - p.x;
    const dz = v3.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > p.radius && d > 1e-5) {
      const k = p.radius / d;
      v3.x = p.x + dx * k;
      v3.z = p.z + dz * k;
    }
    return v3;
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

  /* ----------------------------------------------------- navigation (A*) */

  /**
   * Grid jalan-pakai halus (0.25 m): sel di dalam lantai yang bebas dari
   * tembok & perabot (sudah memperhitungkan radius tubuh 0.30 m). Pintu
   * otomatis jadi celah karena tembok dibangun per-span dengan celah pintu.
   */
  _navEnsure() {
    if (this._nav) return this._nav;
    const cell = 0.25;
    const x0 = this.bounds.x0, x1 = this.bounds.x1;
    const z0 = this.bounds.z0, z1 = this.bounds.z1;
    const nx = Math.max(1, Math.round((x1 - x0) / cell));
    const nz = Math.max(1, Math.round((z1 - z0) / cell));
    const walk = new Uint8Array(nx * nz);
    const R = 0.30;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + (i + 0.5) * cell;
        const z = z0 + (j + 0.5) * cell;
        // jaga jarak dari cangkang lantai (sinkron dengan clampToFloor)
        if (x < x0 + 0.42 || x > x1 - 0.42 || z < z0 + 0.42 || z > z1 - 0.42) continue;
        walk[j * nx + i] = this.isFree(x, z, R) ? 1 : 0;
      }
    }
    this._nav = { cell, x0, z0, nx, nz, walk };
    return this._nav;
  }

  /** Sel jalan-pakai terdekat dari titik mana pun ( Spiral search kecil). */
  _nearestWalkable(x, z, nav, maxRadius = 1.25) {
    const { cell, x0, z0, nx, nz, walk } = nav;
    const ci = THREE.MathUtils.clamp(Math.floor((x - x0) / cell), 0, nx - 1);
    const cj = THREE.MathUtils.clamp(Math.floor((z - z0) / cell), 0, nz - 1);
    if (walk[cj * nx + ci]) {
      return { i: cj * nx + ci, x: x0 + (ci + 0.5) * cell, z: z0 + (cj + 0.5) * cell };
    }
    const maxR = Math.ceil(maxRadius / cell);
    for (let r = 1; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const X = ci + di, Z = cj + dj;
          if (X < 0 || Z < 0 || X >= nx || Z >= nz) continue;
          if (!walk[Z * nx + X]) continue;
          return { i: Z * nx + X, x: x0 + (X + 0.5) * cell, z: z0 + (Z + 0.5) * cell };
        }
      }
    }
    return null;
  }

  /** Benang penglihatan: apakah garis A→B bebas rintangan? */
  _lineFree(ax, az, bx, bz, radius = 0.30) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / 0.14));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isFree(ax + (bx - ax) * t, az + (bz - az) * t, radius)) return false;
    }
    return true;
  }

  /** Sederhanakan jalur sel dengan string-pulling agar tidak bergerigi. */
  _simplify(points) {
    const out = [];
    let cursor = 0;
    let a = points[0];
    out.push(a);
    while (cursor < points.length - 1) {
      let j = points.length - 1;
      while (j > cursor + 1 && !this._lineFree(a.x, a.z, points[j].x, points[j].z)) j--;
      cursor = j;
      a = points[j];
      out.push(a);
    }
    return out;
  }

  /** A* 8-arah di atas grid; mengembalikan deretan indeks sel atau null. */
  _navSearch(nav, startI, goalI) {
    const { nx, nz, walk } = nav;
    const total = nx * nz;
    const gCost = new Float32Array(total).fill(Infinity);
    const parent = new Int32Array(total).fill(-1);
    const goalX = goalI % nx;
    const goalZ = (goalI / nx) | 0;

    // binary heap kecil (indeks & skor paralel)
    const hI = [];
    const hF = [];
    const swap = (a, b) => {
      [hI[a], hI[b]] = [hI[b], hI[a]];
      [hF[a], hF[b]] = [hF[b], hF[a]];
    };
    const push = (i, f) => {
      hI.push(i); hF.push(f);
      let c = hI.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (hF[p] <= hF[c]) break;
        swap(p, c); c = p;
      }
    };
    const pop = () => {
      const top = hI[0];
      const li = hI.length - 1;
      hI[0] = hI[li]; hF[0] = hF[li];
      hI.pop(); hF.pop();
      let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1;
        let m = c;
        if (l < hI.length && hF[l] < hF[m]) m = l;
        if (r < hI.length && hF[r] < hF[m]) m = r;
        if (m === c) break;
        swap(m, c); c = m;
      }
      return top;
    };

    const DIRS = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ];

    gCost[startI] = 0;
    push(startI, 0);
    let found = false;
    let guard = total * 8;
    while (hI.length && guard-- > 0) {
      const i = pop();
      if (i === goalI) { found = true; break; }
      const cx = i % nx, cz = (i / nx) | 0;
      for (const [dx, dz, cost] of DIRS) {
        const X = cx + dx, Z = cz + dz;
        if (X < 0 || Z < 0 || X >= nx || Z >= nz) continue;
        const nI = Z * nx + X;
        if (!walk[nI]) continue;
        // larang memotong sudut: kedua tetangga ortogonal harus jalan
        if (dx !== 0 && dz !== 0 && (!walk[cz * nx + X] || !walk[Z * nx + cx])) continue;
        const ng = gCost[i] + cost;
        if (ng < gCost[nI]) {
          gCost[nI] = ng;
          parent[nI] = i;
          const hx = Math.abs(X - goalX), hz = Math.abs(Z - goalZ);
          const mx = Math.max(hx, hz), mn = Math.min(hx, hz);
          push(nI, ng + (mx + 0.4142 * mn) * 1.001); // tie-break halus
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = goalI; i !== -1; i = parent[i]) cells.push(i);
    cells.reverse();
    return cells;
  }

  /**
   * Rute pintar dari posisi `from` ke `target`: garis lurus bila bebas,
   * selain itu A* grid → sederhanakan. Karakter otomatis menghindari
   * tembok & semua perabot alih-alih memaksakan jalan menempel.
   */
  route(from, target) {
    const fallback = [{ x: target.x, z: target.z }];
    if (this._lineFree(from.x, from.z, target.x, target.z, 0.30)) return fallback;

    const nav = this._navEnsure();
    const start = this._nearestWalkable(from.x, from.z, nav);
    const goal = this._nearestWalkable(target.x, target.z, nav);
    if (!start || !goal) return fallback; // pola lama sebagai jaring pengaman

    const cells = start.i !== goal.i ? this._navSearch(nav, start.i, goal.i) : null;
    if (!cells) {
      return this._lineFree(start.x, start.z, goal.x, goal.z, 0.24)
        ? [{ x: goal.x, z: goal.z }]
        : fallback;
    }
    const pts = cells.map((i) => ({
      x: nav.x0 + ((i % nav.nx) + 0.5) * nav.cell,
      z: nav.z0 + (((i / nav.nx) | 0) + 0.5) * nav.cell,
    }));
    const simp = this._simplify(pts).slice(1); // buang sel posisi awal
    const out = simp.map((p) => ({ x: p.x, z: p.z }));

    // tujuan presisi hanya jika memang bisa dipijak (kursi ≠ titik jalan);
    // kalau tidak, rute berhenti di sel terdekat dan duduk menyusul lewat seatInto
    if (this.isFree(target.x, target.z, 0.18)) out.push({ x: target.x, z: target.z });
    return out.length ? out : fallback;
  }

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
        out.x = x; out.z = z;
        return out;
      }
    }
    out.x = 0; out.z = 0;
    return out;
  }

  claimSeat(type, who, roomId) {
    const free = this.seats.filter((s) =>
      s.type === type
      // opsional: batasi ke kursi yang ADA DI DALAM satu ruangan
      // (studio kreatif juga punya kursi tipe "meeting"!)
      && (!roomId || this.roomAt(s.x, s.z) === roomId)
      && (!s.taken || s.taken === who));
    if (!free.length) return null;
    const seat = free[Math.floor(Math.random() * free.length)];
    seat.taken = who;
    return seat;
  }

  releaseSeat(seat, who) {
    if (seat && seat.taken === who) seat.taken = null;
  }

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
    // staf: otak sendiri, lalu badan dengan collision + kunci pos ruangan;
    // kunci pos dijalankan SEBELUM resolveCollisions supaya staf tidak
    // terdorong menembus meja/kasir oleh kunci pos itu sendiri
    for (const s of this.staffRoster) {
      s.brain.update(dt);
      s.critter.update(dt, elapsed, this);
      if (!this.meetingActive && !s.critter.sitting && !s.critter._seating) {
        this.clampToStaffPost(s.postId, s.critter.position, 0.35);
        this.resolveCollisions(s.critter.position, 0.3);
      }
    }
  }
}

/* ===================================================================== *
 *  Local helpers (TV, PS, lunch table for the pantry)
 * ===================================================================== */

function createTable(w, d, h) {
  const g = new THREE.Group();
  g.name = "Meja makan";
  g.userData.interactionLabel = "Meja makan";
  const top = rbox(w, 0.05, d, 0.02, MAT.deskTop, 0.01);
  top.position.y = h - 0.025;
  g.add(top);
  const legGeo = new THREE.CylinderGeometry(0.035, 0.035, h - 0.05, 12);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(legGeo, MAT.steel);
    leg.position.set(sx * (w / 2 - 0.1), (h - 0.05) / 2, sz * (d / 2 - 0.1));
    g.add(leg);
  }
  shade(g);
  g.userData.footprint = { w, d };
  return g;
}

function createTV({ w = 1.4, h = 0.85 } = {}) {
  const g = new THREE.Group();
  g.name = "TV";
  g.userData.interactionLabel = "TV";

  const bezel = rbox(w + 0.05, h + 0.05, 0.06, 0.015, MAT.blackMetal, 0.005);
  g.add(bezel);

  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x081020,
    roughness: 0.15,
    metalness: 0.4,
    emissive: 0x2a6d9a,
    emissiveIntensity: 0.18,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat);
  screen.position.z = 0.031;
  g.add(screen);

  const stand = rbox(0.24, 0.02, 0.16, 0.008, MAT.blackMetal, 0.003);
  stand.position.y = -h / 2 - 0.04;
  g.add(stand);

  shade(g);
  g.userData.parts = { screen: screenMat };
  g.userData.api = {
    toggle() {
      screenMat.emissiveIntensity = screenMat.emissiveIntensity > 0 ? 0 : 0.18;
      return screenMat.emissiveIntensity > 0;
    },
  };
  return g;
}

function createPlayStation() {
  const g = new THREE.Group();
  g.name = "PlayStation";
  g.userData.interactionLabel = "PlayStation";

  const body = rbox(0.32, 0.055, 0.24, 0.012, MAT.plasticDark, 0.005);
  body.position.y = 0.0275;
  g.add(body);

  const stripe = rbox(0.30, 0.008, 0.22, 0.004, MAT.plasticWhite, 0.002);
  stripe.position.y = 0.028;
  g.add(stripe);

  const led = box(0.06, 0.004, 0.002, MAT.ledStrip);
  led.position.set(-0.06, 0.03, 0.122);
  g.add(led);

  shade(g);
  g.userData.footprint = { w: 0.35, d: 0.28 };
  return g;
}

export { BOUNDS, WALL_H, WALL_T };