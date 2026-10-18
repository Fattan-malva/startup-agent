import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { MAT } from "./materials.js";
import { mulberry32 } from "./textures.js";
import { Critter } from "../character/Critter.js";
import { StaffBrain } from "../systems/AI.js";
import {
  box,
  rbox,
  createOfficeChair,
  createPlant,
} from "./props.js";
import {
  BOUNDS,
  FLOOR_POLYGON,
  WALL_H,
  DOOR_H,
  WALL_T,
  WALLS,
  ROOMS,
  ROOM_ANCHORS,
  ENTRANCE,
} from "./layout.js";
import { furnishRooms } from "./rooms/index.js";

/* ===================================================================== *
 *  Building — one floor of Atelier Corp.
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
    this.dynamicBodies = [];
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
    this._ceilings();
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

    // Ambang pintu (brass strip) dihapus — lantai menyambung polos
    // dari ruangan ke koridor tanpa "gerigi" di bawah setiap pintu.
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
        kind: "wall",
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

    const openingH = Math.min(DOOR_H, WALL_H - 0.1);
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
      { title: "RUANG MEETING", sub: "MEETING ROOM", x: -6.5, z: -0.98, ry: 0, face: 1 },
      { title: "CAFE", sub: "BAR & LOUNGE", x: 1.5, z: -0.98, ry: 0, face: 1 },
      { title: "STUDIO KREATIF", sub: "CREATIVE LAB", x: 12.5, z: -0.98, ry: 0, face: 1 },
      { title: "DEV ROOM", sub: "ENGINEERING", x: 20.8, z: -0.98, ry: 0, face: 1 },
      { title: "LOBBY", sub: "RECEPTION", x: -6.5, z: 0.98, ry: Math.PI, face: -1 },
      { title: "STAFF ROOM", sub: "8 WORKSTATIONS", x: 0, z: 0.98, ry: Math.PI, face: -1 },
      { title: "CEO ROOM", sub: "PRIVATE OFFICE", x: 9.5, z: 0.98, ry: Math.PI, face: -1 },
      // Sign door HR nempel dinding vertikal x=23.8 → offset ke arah timur.
      { title: "HUMAN RESOURCE", sub: "PEOPLE & CULTURE", x: 23.87, z: 1.95, ry: Math.PI / 2, face: 0, ox: 0.045 },
    ];

    // Papan nama menempel DI TENGAH lintel pintu (bukan mepet bawah),
    // mengikuti tinggi pintu via DOOR_H supaya selalu presisi.
    const signY = (DOOR_H + WALL_H) / 2;

    for (const s of signs) {
      const back = rbox(1.05, 0.26, 0.045, 0.018, MAT.steel, 0.008);
      back.position.set(s.x, signY, s.z);
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
      // plate menghadap dari dinding: offset via s.face (*0.03 di sumbu z)
      // atau s.ox untuk dinding vertikal (offset sumbu x).
      plate.position.set(s.x + (s.ox || 0), signY, s.z + (s.oz ?? s.face * 0.03));
      plate.rotation.y = s.ry;
      this.staticGroup.add(plate);
    }

    const ent = rbox(1.35, 0.3, 0.05, 0.02, MAT.steel, 0.01);
    ent.position.set(-9.93, signY, 4.5);
    ent.rotation.y = Math.PI / 2;
    this.staticGroup.add(ent);

    const entPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.26, 0.24),
      new THREE.MeshStandardMaterial({
        map: makeSignTexture("ATELIER CORP", "WELCOME"),
        roughness: 0.4,
        metalness: 0.2,
      }),
    );
    entPlate.position.set(-9.9, signY, 4.5);
    entPlate.rotation.y = Math.PI / 2;
    this.staticGroup.add(entPlate);
  }

  /* --------------------------------------------------------- ceilings */

  /**
   * Plafon panel putih kotak-kotak (garis grid) — HANYA terlihat saat
   * mode Kendalikan (first-person): dari atas/iso gedung tetap terbuka
   * supaya tetap mudah diintip, tapi begitu "masuk badan" karakter,
   * ruangan langsung tertutup plafon lengkap.
   */
  _ceilings() {
    const g = new THREE.Group();
    g.name = "Ceilings";

    // Tekstur grid: satu tile = 1 sel, digambar di canvas lalu di-repeat.
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    // panel putih biasa (hampir flat, hanya sedikit variasi)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#f7f8f9";
    ctx.fillRect(10, 10, 108, 108);
    // garis grid lebar tapi terang — secukupnya, tidak dominan
    ctx.strokeStyle = "#d7dbe0";
    ctx.lineWidth = 14;
    ctx.strokeRect(0, 0, 128, 128);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // sel plafon ~1.5 m teoritis; repeat bulat supaya seam menyambung rapi
    const w = BOUNDS.x1 - BOUNDS.x0;
    const d = BOUNDS.z1 - BOUNDS.z0;
    const nx = Math.max(1, Math.round(w / 1.5));
    const nz = Math.max(1, Math.round(d / 1.5));
    tex.repeat.set(nx, nz);

    // MeshStandardMaterial biasa — plafon putih normal (bukan "menyala");
    // kecerahannya mengikuti cahaya, yang dijaga tetap terang oleh boost
    // interior saat mode kendalikan aktif.
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.96,
      metalness: 0.0,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    plane.rotation.x = Math.PI / 2; // normal menghadap BAWAH (dilihat dari dalam)
    plane.position.set((BOUNDS.x0 + BOUNDS.x1) / 2, WALL_H - 0.02, (BOUNDS.z0 + BOUNDS.z1) / 2);
    plane.castShadow = false;
    plane.receiveShadow = false;
    g.add(plane);

    g.visible = false; // default: mode jelajah — plafon tersembunyi
    this.scene.add(g);
    this.ceilings = g;
  }

  setCeilings(on) {
    if (this.ceilings) this.ceilings.visible = !!on;
    // masuk/keluar mode kendalikan → boost cahaya interior ikut nyala/padam
    // (dipadam halus di update() supaya transisinya tidak "pop")
    this.lightBoostTarget = on ? 1 : 0;
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
    // boost cahaya interior — aktif saat plafon tampil (mode kendalikan)
    this.lightBoost = 0;
    this.lightBoostTarget = 0;
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
    // boost: cahaya interior ekstra saat mode kendalikan (first-person).
    // Dari dalam, dinding/sisi furniture tidak pernah terkena sun fisik,
    // jadi tanpa boost ruangan terasa gelap; boost menaikkan hemi/ambient/
    // sun/fill secukupnya. Malam hari boost dikurangi (0.45×) biar tetap
    // ada kesan "lampu kantor menyala" tapi tidak membuat malam jadi siang.
    const b = this.lightBoost * THREE.MathUtils.lerp(1, 0.45, v);
    const L = this.lights;
    L.sun.intensity = THREE.MathUtils.lerp(1.55, 0.25, v) + 0.55 * b;
    L.sun.color.setHex(v > 0.5 ? 0xa8bcff : 0xfff3df);
    L.hemi.intensity = THREE.MathUtils.lerp(1.05, 0.35, v) + 0.5 * b;
    L.hemi.color.setHex(v > 0.5 ? 0x2a3a5c : 0xdfe8f5);
    L.hemi.groundColor.setHex(v > 0.5 ? 0x0e1218 : 0x6b5a45);
    L.fill.intensity = THREE.MathUtils.lerp(0.35, 0.5, v) + 0.35 * b;
    L.amb.intensity = THREE.MathUtils.lerp(0.22, 0.16, v) + 0.42 * b;
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
      this.obstacles.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, centerX: x, centerZ: z, owner: obj, kind: "prop" });
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
      this.obstacles.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, centerX: x, centerZ: z, owner: obj, kind: "prop" });
    }
    return obj;
  }

  _seat(x, z, yaw, type) {
    // The final sit animation may overlap only the chair/sofa assigned to it.
    let obstacle = null;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const candidate = this.obstacles[i];
      if (candidate.owner && Math.abs(candidate.centerX - x) < 0.025 && Math.abs(candidate.centerZ - z) < 0.025) {
        obstacle = candidate;
        break;
      }
    }
    const seat = {
      id: `${type}-${this.seats.length}`,
      x, z, yaw, type, taken: null, obstacle,
      sit: { x: x + Math.sin(yaw) * SIT_FWD, z: z + Math.cos(yaw) * SIT_FWD },
    };
    this.seats.push(seat);
    return seat;
  }

  _deskChair(deskX, deskZ, deskRy, { color = "charcoal", gap = 1.05, type = "desk" } = {}) {
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
    // Furniture per-ruangan penuh ada di src/world/rooms/*.js
    furnishRooms(this);
  }

  /* ------------------------------------------------- staff critter (NPC) */

  _spawnStaffCritter({
    id,
    species = "staff",    // "staff" = baju hitam (developer room); lainnya normal
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
      species,
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

  clampToStaffPost(id, v3, margin = 0.35, critter = null) {
    const p = this.staffPosts[id];
    if (!p) return v3;

    const room = this.room(p.room);
    let tx = v3.x;
    let tz = v3.z;
    if (room) {
      tx = THREE.MathUtils.clamp(tx, room.x0 + margin, room.x1 - margin);
      tz = THREE.MathUtils.clamp(tz, room.z0 + margin, room.z1 - margin);
    }

    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d > p.radius && d > 1e-5) {
      const k = p.radius / d;
      tx = p.x + dx * k;
      tz = p.z + dz * k;
    }
    // The leash is a desired position, not a teleport. Respect every
    // static and dynamic collider while returning toward the post.
    return this.moveSafely(
      v3, tx - v3.x, tz - v3.z, 0.29,
      critter?._seatObstacle || null, critter,
    );
  }

  clampToFloor(v3, margin = 0.35) {
    v3.x = THREE.MathUtils.clamp(v3.x, this.bounds.x0 + margin, this.bounds.x1 - margin);
    v3.z = THREE.MathUtils.clamp(v3.z, this.bounds.z0 + margin, this.bounds.z1 - margin);
    return v3;
  }

  resolveCollisions(v3, radius = 0.3, ignoreObstacle = null) {
    for (const b of this.obstacles) {
      if (b === ignoreObstacle) continue;
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

  isFree(x, z, radius = 0.35, ignoreObstacle = null) {
    for (const b of this.obstacles) {
      if (b === ignoreObstacle) continue;
      const cx = THREE.MathUtils.clamp(x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(z, b.minZ, b.maxZ);
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return false;
    }
    return true;
  }

  /**
   * Move in swept micro-steps. Every position is checked before commit, so
   * fast movement and diagonal cornering cannot tunnel through obstacles.
   * A blocked diagonal may slide along either free axis.
   */
  moveSafely(v3, dx, dz, radius = 0.3, ignoreObstacle = null, mover = null) {
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-8) return v3;
    const steps = Math.max(1, Math.ceil(distance / Math.max(0.055, radius * 0.38)));
    const sx = dx / steps;
    const sz = dz / steps;
    const canOccupy = (x, z) => {
      if (x < this.bounds.x0 + radius || x > this.bounds.x1 - radius ||
          z < this.bounds.z0 + radius || z > this.bounds.z1 - radius) return false;
      if (!this.isFree(x, z, radius, ignoreObstacle)) return false;
      for (const other of this.dynamicBodies) {
        if (!other || other === mover) continue;
        const minD = radius + 0.29;
        const ox = x - other.position.x;
        const oz = z - other.position.z;
        if (ox * ox + oz * oz < minD * minD) return false;
      }
      return true;
    };
    for (let i = 0; i < steps; i++) {
      const nx = v3.x + sx;
      const nz = v3.z + sz;
      if (canOccupy(nx, nz)) {
        v3.x = nx;
        v3.z = nz;
        continue;
      }
      const axes = Math.abs(sx) >= Math.abs(sz)
        ? [["x", sx], ["z", sz]]
        : [["z", sz], ["x", sx]];
      for (const [axis, delta] of axes) {
        const cx = v3.x + (axis === "x" ? delta : 0);
        const cz = v3.z + (axis === "z" ? delta : 0);
        if (!canOccupy(cx, cz)) continue;
        v3.x = cx;
        v3.z = cz;
      }
    }
    return v3;
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
  _lineFree(ax, az, bx, bz, radius = 0.30, ignoreObstacle = null) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / 0.10));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isFree(ax + (bx - ax) * t, az + (bz - az) * t, radius, ignoreObstacle)) return false;
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
    const direct = [{ x: target.x, z: target.z }];
    if (this._lineFree(from.x, from.z, target.x, target.z, 0.30)) return direct;

    const nav = this._navEnsure();
    const start = this._nearestWalkable(from.x, from.z, nav);
    const goal = this._nearestWalkable(target.x, target.z, nav);
    if (!start || !goal) return []; // Never force a direct path when no safe path exists.

    const cells = start.i !== goal.i ? this._navSearch(nav, start.i, goal.i) : null;
    if (!cells) {
      return this._lineFree(start.x, start.z, goal.x, goal.z, 0.24)
        ? [{ x: goal.x, z: goal.z }]
        : [];
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
    return out;
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

  approachTo(seat, radii = [0.78, 0.92, 1.08, 1.24]) {
    const room = this.roomAt(seat.x, seat.z);
    const base = seat.yaw ?? 0;
    const target = seat.sit || seat;
    for (const r of radii) {
      for (let i = 0; i < 12; i++) {
        const step = Math.ceil(i / 2) * (Math.PI / 6) * (i % 2 ? 1 : -1);
        const a = base + step;
        const x = seat.x + Math.sin(a) * r;
        const z = seat.z + Math.cos(a) * r;
        if (this.roomAt(x, z) !== room) continue;
        if (!this.isFree(x, z, 0.30)) continue;
        if (!this._lineFree(x, z, target.x, target.z, 0.24, seat.obstacle)) continue;
        if (!this.isFree(target.x, target.z, 0.24, seat.obstacle)) continue;
        return { x, z };
      }
    }
    return null;
  }

  /* --------------------------------------------------------------- loop */

  update(dt, elapsed) {
    this.dynamicBodies = (this.crew?.members ?? []).concat(
      (this.staffRoster ?? []).map((s) => s.critter),
    );
    if (Math.abs(this.targetNightness - this.nightness) > 0.001) {
      const k = 1 - Math.exp(-2.2 * dt);
      this.nightness += (this.targetNightness - this.nightness) * k;
      this._applyNightness();
    }
    // boost cahaya interior menyala/padam halus mengikuti plafon
    if (Math.abs(this.lightBoostTarget - this.lightBoost) > 0.005) {
      const kb = 1 - Math.exp(-5 * dt);
      this.lightBoost += (this.lightBoostTarget - this.lightBoost) * kb;
      this._applyNightness();
    }
    for (let i = 0; i < this.tickers.length; i++) {
      this.tickers[i].userData.update?.(dt, elapsed);
    }
    // NPC staf bergerak memakai swept collision yang sama dengan crew.
    // Batas pos diterapkan sebagai gerakan aman, bukan teleportasi lalu push.
    for (const s of this.staffRoster) {
      s.brain.update(dt);
      s.critter.update(dt, elapsed, this);
      if (!this.meetingActive && !s.critter.sitting && !s.critter._seating) {
        this.clampToStaffPost(s.postId, s.critter.position, 0.35, s.critter);
      }
    }
  }
}

