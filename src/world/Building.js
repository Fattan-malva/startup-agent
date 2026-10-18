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
  CEILING_POLYGON,
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
// Kursi kerja DITUTUP ke meja (0.62 m): persis seperti orang menaruh kursi
// di meja. Ini penting bukan cuma soal rapi — kalau kursi ditarik jauh
// (1.05 m), dua baris kursi yang berhadapan menyegel lorong pod sehingga
// grid navigasi terpecah dan NPC tidak akan pernah bisa duduk di sana.
const DESK_CHAIR_GAP = 0.62;

/* Normalisasi daftar collider yang boleh diabaikan (bisa satu obstacle
 * atau array: kursi + meja yang ditutup kursi). */
function ignoreList(ignore) {
  if (!ignore) return null;
  return Array.isArray(ignore) ? ignore : [ignore];
}
function isIgnored(b, list) {
  if (!list) return false;
  for (let i = 0; i < list.length; i++) if (list[i] === b) return true;
  return false;
}

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

/**
 * Tipe "bahan" sebuah perabot, dibaca dari labelnya. Dipakai AI supaya tahu
 * APA yang menghalangi (mis. "dudukan" bisa diduduki, "meja" tidak bisa
 * ditembus, "penyimpanan" selalu padat, dst.).
 */
export function propType(label = "") {
  const s = String(label).toLowerCase();
  if (/kursi|sofa|armchair|ottoman|bangku|stool|dudukan/.test(s)) return "dudukan";
  if (/meja|workstation|desk|konter|pantry|printer|standing/.test(s)) return "meja";
  if (/lemari|rak|kabinet|cabinet|storage|filing/.test(s)) return "penyimpanan";
  if (/tanaman|pot|divider|sekat/.test(s)) return "tanaman";
  if (/lampu|clock|jam|tv|playstation|kulkas|fridge/.test(s)) return "perangkat";
  if (/papan|whiteboard|lukisan|moodboard|panel/.test(s)) return "dekorasi";
  if (/tempat sampah|bin/.test(s)) return "wadah";
  return "perabot";
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

    /* ---- edit mode (atur-ulang furnitur) ----------------------------- */
    this.editMode = false;
    this.staticMeshes = null;          // hasil merge, dibuang saat masuk Edit
    this._mergedSources = [];          // { obj, group } untuk dipulihkan
    this._editSeq = 0;                 // id stabil per-perabot (urutan build tetap)
    this._editItems = new Map();       // obj → item (record edit)
    this._editById = new Map();        // id → item (termasuk yang dihapus)
    this._copies = [];                 // perabot hasil Duplikat
    this._copySeq = 0;                 // penomoran id duplikat (c1, c2, ...)
    this._editGroups = new Map();      // gid → [item] (unit edit, mis. meja+kursi)
    this._groupOf = new Map();         // item → gid
    this._grpSeq = 0;
    // pasangan critter + StaffBrain yang berkeliling dalam ruangannya
    this.staffRoster = [];
    // true saat rapat berjalan: staf dipas-lepas dari kunci pos ruangan
    this.meetingActive = false;

    this._v = new THREE.Vector3();
    this._c = new THREE.Color();
    this.rng = mulberry32(1337);
    this._clock = 0;              // waktu berjalan (dipakai klaim kursi)
    this._seatSweep = 0;          // timer pembersih klaim kursi bocor

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
      grass: MAT.grass || MAT.concrete,
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

      // AABB dinding: panjangnya PERSIS sepanjang span (s..e) — padding
      // hanya tegak lurus dinding. Kalau dipad kedua arah, AABB-nya
      // menyempitkan mulut pintu ~0.1 m di tiap sisi dan bikin NPC
      // berdesakan di pintu.
      const halfT = WALL_T / 2 + 0.035;
      const alongX = Math.abs(ux) > 0.5; // dinding mendatar (sepanjang x)
      const padX = alongX ? 0 : halfT;
      const padZ = alongX ? halfT : 0;
      this.obstacles.push({
        minX: Math.min(sx, ex) - padX,
        maxX: Math.max(sx, ex) + padX,
        minZ: Math.min(sz, ez) - padZ,
        maxZ: Math.max(sz, ez) + padZ,
        centerX: (sx + ex) / 2,
        centerZ: (sz + ez) / 2,
        kind: "wall",
        // TANDA PADAT: tidak ada karakter yang boleh memaksa masuk ke sini.
        solid: true,
        blocked: true,          // pantang ditembus / didorong
        type: isGlass ? "sekat" : "dinding",
        obstacleClass: "wall",  // dinding: TIDAK PERNAH boleh diabaikan
        label: isGlass ? "Sekat kaca" : "Dinding",
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
      // Dinding muka blok utara (z = -3.1) — papan menghadap koridor (+z).
      { title: "RUANG MEETING", sub: "MEETING ROOM", x: -6.3, z: -3.03, ry: 0, face: 1 },
      { title: "LOBBY", sub: "RECEPTION", x: 0.0, z: -3.03, ry: 0, face: 1 },
      { title: "CAFE", sub: "BAR & LOUNGE", x: 6.3, z: -3.03, ry: 0, face: 1 },
      // Dinding muka blok barat (x = -7.1) — papan menghadap timur (+x).
      { title: "STAFF ROOM", sub: "OPEN OFFICE", x: -7.03, z: -0.9, ry: Math.PI / 2, face: 0, ox: 0.045 },
      { title: "CEO ROOM", sub: "PRIVATE OFFICE", x: -7.03, z: 6.5, ry: Math.PI / 2, face: 0, ox: 0.045 },
      // Dinding muka blok timur (x = 7.1) — papan menghadap barat (-x).
      { title: "HUMAN RESOURCE", sub: "PEOPLE & CULTURE", x: 7.03, z: -1.5, ry: -Math.PI / 2, face: 0, ox: -0.045 },
      { title: "STUDIO KREATIF", sub: "CREATIVE LAB", x: 7.03, z: 3.0, ry: -Math.PI / 2, face: 0, ox: -0.045 },
      { title: "DEV ROOM", sub: "ENGINEERING", x: 7.03, z: 7.0, ry: -Math.PI / 2, face: 0, ox: -0.045 },
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

    // Papan nama pintu masuk — di atas pintu kaca taman (z = -1, x = 0.0),
    // menghadap taman (+z) supaya terbaca dari jalur masuk.
    const ent = rbox(1.35, 0.3, 0.05, 0.02, MAT.steel, 0.01);
    ent.position.set(0.0, signY, -0.93);
    this.staticGroup.add(ent);

    const entPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.26, 0.24),
      new THREE.MeshStandardMaterial({
        map: makeSignTexture("ATELIER CORP", "WELCOME"),
        roughness: 0.4,
        metalness: 0.2,
      }),
    );
    entPlate.position.set(0.0, signY, -0.9);
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
    // interior saat mode kendalikan aktif. DoubleSide karena plafon tapak U
    // dilihat dari sisi bawah saat karakter berada di dalam.
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.96,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    // Plafon mengikuti tapak U (CEILING_POLYGON) — taman tengah sengaja
    // tidak berplafon supaya terasa benar-benar halaman terbuka.
    const plane = new THREE.Mesh(polygonFloorGeometry(CEILING_POLYGON), mat);
    plane.position.y = WALL_H - 0.02;
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
    return this._register(obj, x, z, ry, y, fp, this.holder, this.placedProps);
  }

  _static(obj, x, z, ry = 0, y = 0, fp = null) {
    return this._register(obj, x, z, ry, y, fp, this.staticGroup, this.staticProps);
  }

  /**
   * Tempat generik: set transform, masukkan ke grup, catat record edit
   * (posisi asal, footprint, obstacle, kursi, bagian lepas) supaya perabot
   * bisa dipindah/diputar/di-material saat Mode Edit.
   */
  _register(obj, x, z, ry, y, fp, group, list, id = null) {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    group.add(obj);

    const item = {
      obj,
      x, z, y, ry,
      state: -1,
      id: id || `p${this._editSeq++}`,
      label: obj.userData.interactionLabel || obj.name || null,
      fp: fp || obj.userData.footprint || null,
      obstacle: null,
      hotspot: null,
      extras: null,
      seats: null,
      plantSpot: null,
      baseMat: null,
      curMat: null,
      matKey: null,
      wallLocked: y > 0.2 && this._nearWall(x, z),
      home: { x, z, ry },
      isCopy: false,
      srcId: null,
      removed: false,
    };
    obj.userData.editItem = item;
    obj.userData.editId = item.id;
    list.push(item);
    this._editItems.set(obj, item);
    this._editById.set(item.id, item);

    if (item.fp) {
      const o = this._obstacleFor(item, x, z, ry, item.fp);
      item.obstacle = o;
      this.obstacles.push(o);
    }
    return obj;
  }

  /** Apakah (x,z) menempel pada salah satu dinding/tembok interior? */
  _nearWall(x, z, maxDist = 0.45) {
    const max2 = maxDist * maxDist;
    for (const w of WALLS) {
      const dx = w.x2 - w.x1;
      const dz = w.z2 - w.z1;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 1e-9 ? ((x - w.x1) * dx + (z - w.z1) * dz) / len2 : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const px = w.x1 + dx * t;
      const pz = w.z1 + dz * t;
      if ((x - px) * (x - px) + (z - pz) * (z - pz) < max2) return true;
    }
    return false;
  }

  _obstacleFor(item, x, z, ry, f) {
    const q = ((Math.round(ry / (Math.PI / 2)) % 4) + 4) % 4;
    const swap = q % 2 === 1;
    const hw = (swap ? f.d : f.w) / 2;
    const hd = (swap ? f.w : f.d) / 2;
    const label = item.label || item.obj?.userData?.interactionLabel || item.obj?.name || "Perabot";
    return {
      minX: x - hw, maxX: x + hw,
      minZ: z - hd, maxZ: z + hd,
      centerX: x, centerZ: z,
      owner: item.obj, kind: "prop",
      // TANDA PADAT + label + tipe bahan: AI tahu APA yang menghalangi
      // jalurnya (dipakai `blockerAt`), tidak bisa ditembus/didorong, dan
      // tahu jenisnya (dudukan / meja / penyimpanan / …).
      solid: true,
      blocked: true,
      obstacleClass: "prop",
      type: propType(label),
      label,
    };
  }

  /**
   * Daftarkan sebuah kursi/sofa yang BISA DIDUDUKI.
   *
   * Aturan penting:
   *  • `obstacle`  = collider perabotnya sendiri → saat melangkah masuk
   *                  dan saat duduk, hanya collider ini (plus perabot yang
   *                  memang menyelip, mis. meja kerja) yang diabaikan.
   *  • `overlaps`  = perabot yang boleh DISENTUH badan saat duduk (meja
   *                  kerja/meja rapat yang ditutup kursi). Dinding & sekat
   *                  kaca TIDAK PERNAH masuk daftar ini.
   *  • `height`    = tinggi permukaan duduk (semua dudukan seragam).
   *
   * Semua kursi juga otomatis jadi hotspot klik "Duduk", jadi pemain
   * (mode Kendalikan) bisa duduk di kursi/sofa mana pun.
   */
  _seat(x, z, yaw, type) {
    // 1) collider kursinya sendiri (dipasang tepat sebelum _seat dipanggil)
    let obstacle = null;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const candidate = this.obstacles[i];
      if (candidate.owner && Math.abs(candidate.centerX - x) < 0.025 && Math.abs(candidate.centerZ - z) < 0.025) {
        obstacle = candidate;
        break;
      }
    }
    const sit = { x: x + Math.sin(yaw) * SIT_FWD, z: z + Math.cos(yaw) * SIT_FWD };

    // 2) perabot yang wajar "menyelip" badan saat duduk (meja/meja rapat)
    const overlaps = [];
    for (const b of this.obstacles) {
      if (b === obstacle || b.kind === "wall") continue;
      const cx = THREE.MathUtils.clamp(sit.x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(sit.z, b.minZ, b.maxZ);
      const dx = sit.x - cx;
      const dz = sit.z - cz;
      if (dx * dx + dz * dz < 0.34 * 0.34) overlaps.push(b);
    }

    const seat = {
      id: `${type}-${this.seats.length}`,
      x, z, yaw, type, taken: null, takenAt: 0, uses: 0, obstacle, overlaps, sit,
      height: obstacle?.owner?.userData?.seatTop ?? 0.505,
      seatable: true,
      blocked: true,          // tetap padat untuk yang BERJALAN
    };

    // 3) tautkan ke record perabot pemiliknya → ikut bergerak saat Mode Edit
    const item = obstacle ? this._editItems.get(obstacle.owner) : null;
    if (item) (item.seats || (item.seats = [])).push(seat);
    if (obstacle) {
      obstacle.seatable = true;   // AI tahu: ini dudukan, bukan halangan buta
      obstacle.type = "dudukan";
      obstacle.seatType = type;
    }

    // 4) hotspot "Duduk" untuk semua kursi (juga dipakai pemain)
    const owner = obstacle?.owner;
    if (owner && !owner.userData.interactive && !owner.userData.interactionManaged) {
      const label = owner.userData.interactionLabel || owner.name || "Kursi";
      this._interactive(owner, {
        id: `seat-${seat.id}`,
        label: `${label} · ${this.room(this.roomAt(x, z))?.name || "Kantor"}`,
        hint: "Klik untuk duduk di sini",
        radius: 1.0,
        seat,
        onClick: () => `Kursi ${label} bebas — siap diduduki.`,
      });
    }

    this.seats.push(seat);
    return seat;
  }

  /** Collider yang boleh diabaikan saat berjalan masuk & duduk di kursi ini. */
  seatIgnore(seat) {
    if (!seat) return null;
    const list = [];
    if (seat.obstacle) list.push(seat.obstacle);
    if (seat.overlaps) for (const o of seat.overlaps) list.push(o);
    return list.length ? list : null;
  }

  _deskChair(deskX, deskZ, deskRy, { color = "charcoal", gap = DESK_CHAIR_GAP, type = "desk", desk = null } = {}) {
    const x = deskX + Math.sin(deskRy) * gap;
    const z = deskZ + Math.cos(deskRy) * gap;
    const yaw = deskRy + Math.PI;
    this._static(createOfficeChair({ color }), x, z, yaw);
    const seat = this._seat(x, z, yaw, type);
    // meja + kursi ergonomis = SATU unit edit (geser/putar/hapus/duplikat)
    if (desk) this.pairProps(desk, seat);
    return seat;
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
    const item = plant.userData.editItem;
    const spot = { x, z };
    this.plantSpots.push(spot);
    if (item) item.plantSpot = spot;
    if (label) {
      const api = plant.userData.api;
      const hs = this._hotspot(x, z, 0.55, 1.0, {
        id: `plant-${x}-${z}`,
        label,
        hint: "Klik untuk menyiram",
        radius: 0.85,
        onClick: () => {
          api?.water?.();
          return "Sudah disiram — terima kasih 🌿";
        },
      });
      if (item) (item.extras || (item.extras = [])).push(hs);
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
      item.hotspot = this._hotspot(item.x, item.z, y, size, {
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
    const item = container.userData.editItem;
    for (const p of parts) {
      if (!p || !p.parent) continue;
      p.matrixWorld.decompose(p.position, p.quaternion, p.scale);
      container.remove(p);
      this.holder.add(p);
      // bagian yang dilepas (mis. lampu meja) tetap ikut saat meja dipindah
      if (item) (item.extras || (item.extras = [])).push(p);
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

    const item = ws.userData.editItem;
    const extras = item ? (item.extras || (item.extras = [])) : null;

    this._interactive(parts.lamp, {
      id: `lamp-${key}`,
      label: "Lampu meja",
      hint: "Klik untuk nyala / mati",
      radius: 0.75,
      onClick: (self) => (self.userData.api.toggle() ? "Lampu meja nyala" : "Lampu meja mati"),
    });

    const monHs = this._hotspot(mwp.x, mwp.z, 0.95, 0.8, {
      id: `monitor-${key}`,
      label: "Layar telemetri",
      hint: "Klik untuk ganti tampilan",
      radius: 1.0,
      onClick: () => { monitor.userData.api.cycle(); return "Layar berganti"; },
    });
    if (extras) extras.push(monHs);

    const peripherals = [
      [parts.keyboard, "Keyboard", "Periksa keyboard workstation"],
      [parts.mouse, "Mouse", "Periksa mouse workstation"],
      [parts.mug, "Cangkir", "Cangkir workstation siap digunakan"],
      [parts.notepad, "Catatan kerja", "Catatan kerja dibuka untuk inspeksi"],
    ];
    for (const [part, label, message] of peripherals) {
      if (!part) continue;
      const pos = part.getWorldPosition(new THREE.Vector3());
      const hs = this._hotspot(pos.x, pos.z, 0.91, 0.42, {
        id: `${label.toLowerCase().replace(/\s+/g, "-")}-${key}`,
        label: `${label} · workstation`,
        hint: "Klik untuk inspeksi",
        radius: 0.55,
        onClick: () => message,
      });
      if (extras) extras.push(hs);
    }
  }

  _mergeStatic() {
    if (this.staticMeshes || this._mergedSources.length) this._disposeMerged();

    const mergeGroup = new THREE.Group();
    const all = [...this.holder.children, ...this.staticGroup.children];
    for (const child of all) {
      if (this._isLive(child)) {
        if (child.parent !== this.holder) this.holder.add(child);
      } else if (child.visible === false) {
        // perabot yang dihapus di Mode Edit: biarkan tinggal di grupnya,
        // jangan digabung (kalau tidak, isinya tetap ikut ter-render).
        continue;
      } else {
        // simpan grup asal supaya bisa dipulihkan saat masuk Mode Edit
        this._mergedSources.push({ obj: child, group: child.parent });
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
        const mesh = new THREE.Mesh(merged, mat);
        mesh.userData._merged = true;
        out.add(mesh);
      } catch (err) {
        for (const g of geoms) {
          const mesh = new THREE.Mesh(g, mat);
          mesh.userData._merged = true;
          out.add(mesh);
        }
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

  /**
   * Bongkar hasil merge: buang mesh gabungan (hanya geometry milik kita yang
   * dibuang — passthrough clone memakai geometry asli) lalu kembalikan
   * perabot ke grup asalnya supaya bisa dipilih & digeser satu per satu.
   */
  _disposeMerged() {
    const out = this.staticMeshes;
    if (out) {
      out.traverse((o) => {
        if (o.isMesh && o.userData._merged && o.geometry) o.geometry.dispose();
      });
      this.scene.remove(out);
      this.staticMeshes = null;
    }
    for (const s of this._mergedSources) {
      if (s.obj.parent !== s.group) s.group.add(s.obj);
    }
    this._mergedSources = [];
  }

  /* ------------------------------------------------------------ edit mode */

  /** Masuk/keluar Mode Edit: bongkar merge agar perabot bisa dipilih. */
  setEditMode(on) {
    const next = !!on;
    if (next === this.editMode) return;
    this.editMode = next;
    if (next) this._disposeMerged();
    else this._mergeStatic();
  }

  /** Semua perabot yang boleh diedit (kecuali NPC). */
  editList() {
    const out = [];
    for (const list of [this.placedProps, this.staticProps]) {
      for (const item of list) {
        if (!item.obj || item.obj.userData.liveMarker) continue;
        out.push(item);
      }
    }
    return out;
  }

  _syncObstacle(item) {
    const o = item.obstacle;
    if (!o) return;
    const f = item.fp;
    if (!f) { o.centerX = item.x; o.centerZ = item.z; return; }
    const q = ((Math.round(item.ry / (Math.PI / 2)) % 4) + 4) % 4;
    const swap = q % 2 === 1;
    const hw = (swap ? f.d : f.w) / 2;
    const hd = (swap ? f.w : f.d) / 2;
    o.minX = item.x - hw; o.maxX = item.x + hw;
    o.minZ = item.z - hd; o.maxZ = item.z + hd;
    o.centerX = item.x; o.centerZ = item.z;
    this._nav = null; // grid navigasi dibangun ulang
  }

  /** Pindah perabot di bidang lantai; bagian lepas/hotspot/kursi ikut. */
  moveProp(item, x, z) {
    const dx = x - item.x;
    const dz = z - item.z;
    if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return;
    item.obj.position.x = x;
    item.obj.position.z = z;
    if (item.extras) {
      for (const e of item.extras) { e.position.x += dx; e.position.z += dz; }
    }
    if (item.hotspot) { item.hotspot.position.x += dx; item.hotspot.position.z += dz; }
    if (item.plantSpot) { item.plantSpot.x = x; item.plantSpot.z = z; }
    if (item.seats) {
      for (const s of item.seats) {
        s.x = x; s.z = z;
        s.sit.x = x + Math.sin(s.yaw) * SIT_FWD;
        s.sit.z = z + Math.cos(s.yaw) * SIT_FWD;
      }
    }
    item.x = x; item.z = z;
    this._syncObstacle(item);
  }

  /** Putar perabot mengelilingi pusatnya; extras & kursi ikut berputar. */
  rotateProp(item, ry) {
    const d = ry - item.ry;
    if (Math.abs(d) < 1e-9) return;
    item.obj.rotation.y = ry;
    if (item.extras) {
      for (const e of item.extras) this._orbit(e, item.x, item.z, d);
    }
    if (item.hotspot) this._orbit(item.hotspot, item.x, item.z, d);
    if (item.seats) {
      for (const s of item.seats) {
        s.yaw = ry;
        s.sit.x = s.x + Math.sin(ry) * SIT_FWD;
        s.sit.z = s.z + Math.cos(ry) * SIT_FWD;
      }
    }
    item.ry = ry;
    this._syncObstacle(item);
  }

  _orbit(o, cx, cz, d) {
    const dx = o.position.x - cx;
    const dz = o.position.z - cz;
    const cos = Math.cos(d);
    const sin = Math.sin(d);
    o.position.x = cx + dx * cos - dz * sin;
    o.position.z = cz + dx * sin + dz * cos;
    o.rotation.y += d;
  }

  /* --------------------------------------- grup edit (meja + kursi = 1) */

  /**
   * Tautkan perabot supaya bergerak / berputar / diduplikat / dihapus
   * sebagai SATU unit (mis. meja kerja + kursi ergonomisnya). Tiap anggota
   * tetap punya record, collider, dan kursinya sendiri — jadi NPC tetap
   * bisa menyelip & duduk dengan presisi.
   */
  linkProps(a, b) {
    const x = a?.userData?.editItem || a;
    const y = b?.userData?.editItem || b;
    if (!x || !y || x === y) return null;
    const ga = this._groupOf.get(x) || null;
    const gb = this._groupOf.get(y) || null;
    if (ga && ga === gb) return ga;
    const gid = ga || gb || `g${++this._grpSeq}`;
    const set = new Set();
    for (const g of [ga, gb]) {
      if (!g) continue;
      for (const it of this._editGroups.get(g) || []) set.add(it);
      this._editGroups.delete(g);
    }
    set.add(x);
    set.add(y);
    const arr = [...set];
    for (const it of arr) this._groupOf.set(it, gid);
    this._editGroups.set(gid, arr);
    return gid;
  }

  /** Tautkan beberapa perabot sebagai satu grup baru. */
  linkAll(items) {
    const list = [...new Set((items || []).filter(Boolean))];
    if (list.length < 2) return null;
    for (const it of list) this.unlinkProp(it);
    const gid = `g${++this._grpSeq}`;
    for (const it of list) this._groupOf.set(it, gid);
    this._editGroups.set(gid, list);
    return gid;
  }

  unlinkProp(item) {
    const gid = this._groupOf.get(item);
    if (!gid) return;
    this._groupOf.delete(item);
    const arr = this._editGroups.get(gid);
    if (!arr) return;
    const i = arr.indexOf(item);
    if (i >= 0) arr.splice(i, 1);
    if (arr.length < 2) {
      for (const it of arr) this._groupOf.delete(it);
      this._editGroups.delete(gid);
    }
  }

  /** Semua anggota unit edit (atau [item] kalau berdiri sendiri). */
  groupOf(item) {
    if (!item) return [];
    const gid = this._groupOf.get(item);
    if (!gid) return [item];
    const arr = this._editGroups.get(gid);
    return arr && arr.length ? arr : [item];
  }

  /** Pasangkan kursi (seat) dengan perabot meja pemiliknya. */
  pairProps(deskRef, seatRef) {
    const desk = deskRef?.userData?.editItem || deskRef;
    const chair = seatRef?.obstacle?.owner?.userData?.editItem
      || seatRef?.userData?.editItem || seatRef;
    return this.linkProps(desk, chair);
  }

  /** Geser seluruh unit; anchor menentukan delta. */
  moveGroup(item, x, z) {
    const g = this.groupOf(item);
    if (g.length <= 1) { this.moveProp(item, x, z); return; }
    const dx = x - item.x;
    const dz = z - item.z;
    if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return;
    for (const m of g) this.moveProp(m, m.x + dx, m.z + dz);
    this._nav = null;
  }

  /** Putar seluruh unit mengelilingi anchor (posisi + orientasi). */
  rotateGroup(item, ry) {
    const g = this.groupOf(item);
    if (g.length <= 1) { this.rotateProp(item, ry); return; }
    const d = ry - item.ry;
    if (Math.abs(d) < 1e-9) return;
    const ax = item.x;
    const az = item.z;
    const cos = Math.cos(d);
    const sin = Math.sin(d);
    const moves = g.map((m) => {
      if (m === item) return { m, x: ax, z: az, ry };
      const dx = m.x - ax;
      const dz = m.z - az;
      return {
        m,
        x: ax + dx * cos - dz * sin,
        z: az + dx * sin + dz * cos,
        ry: m.ry + d,
      };
    });
    for (const t of moves) {
      this.rotateProp(t.m, t.ry);
      this.moveProp(t.m, t.x, t.z);
    }
    this._nav = null;
  }

  /**
   * Duplikat satu unit. `validate(dx, dz, member)` dipanggil untuk tiap
   * anggota pada offset kandidat; harus true kalau seluruh unit aman.
   */
  copyGroup(item, validate = null, confirm = null) {
    const g = this.groupOf(item);
    if (g.length <= 1) {
      return this.copyProp(
        item,
        validate ? (src, x, z) => validate(x - src.x, z - src.z, src) : null,
        confirm ? (copy) => confirm(copy, 0, 0, [copy]) : null,
      );
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const m of g) {
      const f = m.fp || { w: 0.7, d: 0.7 };
      const hw = Math.max(f.w || 0.7, f.d || 0.7) / 2;
      minX = Math.min(minX, m.x - hw);
      maxX = Math.max(maxX, m.x + hw);
      minZ = Math.min(minZ, m.z - hw);
      maxZ = Math.max(maxZ, m.z + hw);
    }
    const reach = Math.max(maxX - minX, maxZ - minZ) / 2 + 0.5;
    const b = this.bounds;
    // kandidat spiral: makin jauh makin jarang, supaya duplikat tetap dekat
    // dengan aslinya tapi tidak memaksakan satu jarak saja.
    const cands = [];
    for (const mult of [0.7, 0.9, 1.1, 1.4, 1.8, 2.3]) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        cands.push([Math.sin(a) * reach * mult, Math.cos(a) * reach * mult]);
      }
    }
    cands.sort((p, q) => (p[0] * p[0] + p[1] * p[1]) - (q[0] * q[0] + q[1] * q[1]));
    // fallback: pindai seluruh lantai (0.5 m) — selalu ada tempat bila
    // memang ada ruang kosong di mana pun di gedung.
    for (let gx = b.x0 + 0.8; gx <= b.x1 - 0.8; gx += 0.5) {
      for (let gz = b.z0 + 0.8; gz <= b.z1 - 0.8; gz += 0.5) {
        cands.push([gx - item.x, gz - item.z]);
      }
    }
    cands.sort((p, q) => (p[0] * p[0] + p[1] * p[1]) - (q[0] * q[0] + q[1] * q[1]));
    for (const [dx, dz] of cands) {
      let ok = true;
      for (const m of g) {
        const nx = m.x + dx;
        const nz = m.z + dz;
        if (nx < b.x0 + 0.5 || nx > b.x1 - 0.5 || nz < b.z0 + 0.5 || nz > b.z1 - 0.5) {
          ok = false;
          break;
        }
        if (validate && !validate(dx, dz, m)) { ok = false; break; }
      }
      if (!ok) continue;
      const made = [];
      for (const m of g) {
        const c = this._makeCopy(m, m.x + dx, m.z + dz, m.ry, null);
        if (c) made.push(c);
      }
      if (!made.length) continue;
      this.linkAll(made);
      const anchorCopy = made[g.indexOf(item)] || made[0];
      // konfirmasi di dunia nyata (setelah salinan benar-benar ada)
      if (confirm && !confirm(anchorCopy, dx, dz, made)) {
        for (const c of made) {
          this.unlinkProp(c);
          this.deleteProp(c);
        }
        continue;
      }
      return anchorCopy;
    }
    return null;
  }

  /* ----------------------------------------------------- duplikat & hapus */

  /** Aktif/nonaktif collider sebuah perabot tanpa membuang recordnya. */
  _setObstacleActive(item, on) {
    const o = item.obstacle;
    if (!o) return;
    const i = this.obstacles.indexOf(o);
    if (on && i < 0) this.obstacles.push(o);
    else if (!on && i >= 0) this.obstacles.splice(i, 1);
    if (on) this._syncObstacle(item);
    this._nav = null;
  }

  /** Daftar-hotspot: pasang/lepas objek dari target raycast interaksi. */
  _setInteractiveActive(obj, on) {
    if (!obj || !obj.userData || !obj.userData.interactive) return;
    const i = this.interactives.indexOf(obj);
    if (on && i < 0) this.interactives.push(obj);
    else if (!on && i >= 0) this.interactives.splice(i, 1);
  }

  /**
   * "Hapus" perabot: disembunyikan + collider/hotspot/kursinya dilepas.
   * Record tetap hidup supaya tombol Reset bisa mengembalikannya.
   */
  removeProp(item) {
    if (!item || item.removed) return;
    item.removed = true;
    item.obj.visible = false;
    this._setObstacleActive(item, false);
    if (item.hotspot) {
      item.hotspot.visible = false;
      this._setInteractiveActive(item.hotspot, false);
    }
    if (item.extras) {
      for (const e of item.extras) {
        e.visible = false;
        this._setInteractiveActive(e, false);
      }
    }
    if (item.plantSpot) {
      const i = this.plantSpots.indexOf(item.plantSpot);
      if (i >= 0) this.plantSpots.splice(i, 1);
    }
    if (item.seats) {
      for (const s of item.seats) {
        const i = this.seats.indexOf(s);
        if (i >= 0) this.seats.splice(i, 1);
      }
    }
    this._nav = null;
  }

  /** Kebalikan dari removeProp (dipakai "Reset pilihan" / "Reset semua"). */
  restoreProp(item) {
    if (!item || !item.removed) return;
    item.removed = false;
    item.obj.visible = true;
    this._setObstacleActive(item, true);
    if (item.hotspot) {
      item.hotspot.visible = true;
      this._setInteractiveActive(item.hotspot, true);
    }
    if (item.extras) {
      for (const e of item.extras) {
        e.visible = true;
        this._setInteractiveActive(e, true);
      }
    }
    if (item.plantSpot && !this.plantSpots.includes(item.plantSpot)) {
      this.plantSpots.push(item.plantSpot);
    }
    if (item.seats) {
      for (const s of item.seats) if (!this.seats.includes(s)) this.seats.push(s);
    }
  }

  /** Klon visual tanpa menyentuh userData (isinya bisa melingkar). */
  _cloneVisual(obj) {
    const saved = [];
    obj.traverse((n) => {
      if (n.userData && Object.keys(n.userData).length) {
        saved.push([n, n.userData]);
        n.userData = {};
      }
    });
    let clone;
    try {
      clone = obj.clone(true);
    } finally {
      for (const [n, u] of saved) n.userData = u;
    }
    // apa pun perilaku three-nya, userData klon harus benar-benar bersih
    clone.traverse((n) => { n.userData = {}; });
    return clone;
  }

  _nextCopyId() {
    let id;
    do { id = `c${++this._copySeq}`; } while (this._editById.has(id));
    return id;
  }

  /**
   * Buat duplikat dari sebuah perabot (record base-nya dipertahankan sebagai
   * `srcId` supaya bisa dibangun ulang saat boot). `id` dipakai saat memuat
   * simpanan; kalau null → dihasilkan otomatis.
   */
  _makeCopy(srcItem, x, z, ry, id = null) {
    if (!srcItem) return null;
    // selalu klon dari perabot ASLI (bukan duplikat) supaya rantai tidak panjang
    let base = srcItem.srcId ? this._editById.get(srcItem.srcId) : null;
    if (!base || base.removed) base = srcItem;

    const clone = this._cloneVisual(base.obj);
    clone.visible = true; // kalau sumbernya sedang dihapus, klon tetap tampil
    const finalId = id || this._nextCopyId();
    // `_register` mengembalikan objek THREE; record edit-nya ada di
    // userData.editItem. (Dulu yang dipakai objeknya → duplikat tidak
    // tercatat sebagai salinan, hilang setelah reload.)
    const obj = this._register(
      clone, x, z, ry, srcItem.y, srcItem.fp, this.holder, this.placedProps, finalId,
    );
    const item = obj.userData.editItem;
    if (!item) return null;
    item.isCopy = true;
    item.srcId = base.id;
    item.label = srcItem.label;
    const m = /^c(\d+)$/.exec(finalId);
    if (m) this._copySeq = Math.max(this._copySeq, Number(m[1]));

    // bagian lepas yang kelihatan (mis. lampu meja) ikut tersalin — kutip
    // hotspot tembus-pandang tidak perlu diduplikat.
    const cdx = x - srcItem.x;
    const cdz = z - srcItem.z;
    const cd = ry - srcItem.ry;
    if (srcItem.extras) {
      const extras = [];
      for (const e of srcItem.extras) {
        if (!e || e.material === this._hotspotMat) continue;
        const ce = this._cloneVisual(e);
        ce.position.set(e.position.x + cdx, e.position.y, e.position.z + cdz);
        if (Math.abs(cd) > 1e-9) this._orbit(ce, x, z, cd);
        this.holder.add(ce);
        extras.push(ce);
      }
      if (extras.length) item.extras = extras;
    }

    // kursi ikut tersalin → NPC boleh duduk di duplikatnya juga
    if (srcItem.seats) {
      item.seats = [];
      const roomName = this.room(this.roomAt(x, z))?.name || "Studio";
      const seatLabel = item.label || "Kursi";
      for (const s of srcItem.seats) {
        const sit = { x: x + Math.sin(ry) * SIT_FWD, z: z + Math.cos(ry) * SIT_FWD };
        const ns = {
          id: `${s.type}-${this.seats.length}`,
          x, z, yaw: ry, type: s.type, taken: null, takenAt: 0, uses: 0,
          obstacle: item.obstacle,
          sit,
          overlaps: [],
          height: s.height ?? 0.505,
          seatable: true,
          blocked: true,
        };
        // meja yang menutupi titik duduk ikut boleh "diselipi" saat duduk
        for (const b of this.obstacles) {
          if (b === item.obstacle || b.kind === "wall") continue;
          const cx = THREE.MathUtils.clamp(sit.x, b.minX, b.maxX);
          const cz = THREE.MathUtils.clamp(sit.z, b.minZ, b.maxZ);
          if ((sit.x - cx) ** 2 + (sit.z - cz) ** 2 < 0.34 * 0.34) ns.overlaps.push(b);
        }
        if (item.obstacle) {
          item.obstacle.seatable = true;
          item.obstacle.type = "dudukan";
          item.obstacle.seatType = s.type;
        }
        // duplikat kursi tetap bisa diklik untuk diduduki (pemain)
        if (!obj.userData.interactive) {
          this._interactive(obj, {
            id: `seat-${ns.id}`,
            label: `${seatLabel} · ${roomName}`,
            hint: "Klik untuk duduk di sini",
            radius: 1.0,
            seat: ns,
            onClick: () => `Kursi ${seatLabel} bebas — siap diduduki.`,
          });
        }
        item.seats.push(ns);
        this.seats.push(ns);
      }
    }

    // hotspot inspeksi sendiri supaya duplikat tetap bisa diklik
    const room = this.room(this.roomAt(x, z));
    const roomName = room?.name || "Studio";
    const label = item.label || "Furnitur kantor";
    const f = item.fp || { w: 0.7, d: 0.7 };
    const size = THREE.MathUtils.clamp(Math.max(f.w || 0.7, f.d || 0.7) * 0.72, 0.6, 1.05);
    item.hotspot = this._hotspot(x, z, Math.max(0.68, item.y + 0.66), size, {
      id: `inspect-copy-${finalId}`,
      label: `${label} · ${roomName}`,
      hint: "Klik untuk memeriksa detail dan status objek",
      radius: 1.0,
      onClick: () => {
        item.state = (item.state + 1) % 3;
        return [
          `${label}: siap digunakan di area ${roomName}.`,
          `${label}: detail material dan kondisi sudah diperiksa.`,
          `${label}: kembali ke status siap digunakan.`,
        ][item.state];
      },
    });

    this._copies.push(item);
    this._nav = null;
    return item;
  }

  /** Ruang kosong dari perabot lain (tembok diabaikan — benda menempel
   *  dinding tetap boleh diduplikat di sepanjang dinding yang sama). */
  _spotFree(x, z, r) {
    if (x < this.bounds.x0 + 0.4 || x > this.bounds.x1 - 0.4 ||
        z < this.bounds.z0 + 0.4 || z > this.bounds.z1 - 0.4) return false;
    for (const b of this.obstacles) {
      if (b.kind !== "prop") continue;
      const cx = THREE.MathUtils.clamp(x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(z, b.minZ, b.maxZ);
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) return false;
    }
    return true;
  }

  /** Duplikat dengan mencari tempat kosong di sekeliling perabot asalnya. */
  copyProp(item, validate = null, confirm = null) {
    if (!item) return null;
    const f = item.fp || { w: 0.7, d: 0.7 };
    const reach = Math.max(f.w || 0.7, f.d || 0.7) / 2 + 0.5;
    const b = this.bounds;
    // benda yang menempel dinding digeser di sepanjang dinding itu saja,
    // supaya duplikatnya tidak "melayang" di depan dinding.
    const q = ((Math.round(item.ry / (Math.PI / 2)) % 4) + 4) % 4;
    const onWall = item.wallLocked || this._nearWall(item.x, item.z);
    const OFFS = onWall
      ? (q % 2 === 0 ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]])
      : [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

    const attempt = (x, z) => {
      if (validate && !validate(item, x, z, item.ry)) return null;
      const copy = this._makeCopy(item, x, z, item.ry, null);
      if (!copy) return null;
      if (confirm && !confirm(copy, x, z)) {
        this.deleteProp(copy);
        return null;
      }
      return copy;
    };

    for (const [ox, oz] of OFFS) {
      const x = THREE.MathUtils.clamp(item.x + ox * reach, b.x0 + 0.6, b.x1 - 0.6);
      const z = THREE.MathUtils.clamp(item.z + oz * reach, b.z0 + 0.6, b.z1 - 0.6);
      if (Math.hypot(x - item.x, z - item.z) < 0.3) continue;
      const ok = onWall ? this._spotFree(x, z, 0.3) : this.isFree(x, z, 0.34);
      if (!ok) continue;
      const copy = attempt(x, z);
      if (copy) return copy;
    }
    for (const [ox, oz] of OFFS) {
      const x = THREE.MathUtils.clamp(item.x + ox * reach, b.x0 + 0.6, b.x1 - 0.6);
      const z = THREE.MathUtils.clamp(item.z + oz * reach, b.z0 + 0.6, b.z1 - 0.6);
      if (!this.isFree(x, z, 0.28)) continue;
      const copy = attempt(x, z);
      if (copy) return copy;
    }
    return null;
  }

  /** Buang satu duplikat dari dunia (geometry-nya dipakai bersama). */
  _destroyCopy(item) {
    if (!item) return;
    if (item.hotspot) {
      this._setInteractiveActive(item.hotspot, false);
      item.hotspot.parent?.remove(item.hotspot);
      item.hotspot = null;
    }
    if (item.obstacle) {
      const i = this.obstacles.indexOf(item.obstacle);
      if (i >= 0) this.obstacles.splice(i, 1);
      item.obstacle = null;
    }
    if (item.seats) {
      for (const s of item.seats) {
        const i = this.seats.indexOf(s);
        if (i >= 0) this.seats.splice(i, 1);
      }
      item.seats = null;
    }
    item.obj.parent?.remove(item.obj);
    item.obj.userData.editItem = null;
    item.obj.userData.editId = null;
    this._editItems.delete(item.obj);
    this._editById.delete(item.id);
    const pi = this.placedProps.indexOf(item);
    if (pi >= 0) this.placedProps.splice(pi, 1);
    item.removed = true;
    this._nav = null;
  }

  deleteProp(item) {
    if (!item) return false;
    if (item.isCopy) {
      this._destroyCopy(item);
      const ci = this._copies.indexOf(item);
      if (ci >= 0) this._copies.splice(ci, 1);
      return true;
    }
    if (item.removed) return false;
    this.removeProp(item);
    return true;
  }

  /** Buang semua duplikat (dipakai Reset semua / sebelum impor). */
  _clearCopies() {
    for (const item of this._copies.slice()) this._destroyCopy(item);
    this._copies = [];
  }

  /** Material yang paling banyak dipakai di dalam sebuah perabot. */
  _dominantMaterial(obj) {
    const count = new Map();
    obj.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
      count.set(o.material, (count.get(o.material) || 0) + 1);
    });
    let best = null;
    let bestN = 0;
    for (const [m, n] of count) {
      if (n > bestN) { best = m; bestN = n; }
    }
    return best;
  }

  /** Ganti material utama sebuah perabot (tanpa merusak aksen layar/lampu). */
  setPropMaterial(item, matKey) {
    const mat = MAT[matKey];
    if (!mat) return;
    if (!item.baseMat) item.baseMat = this._dominantMaterial(item.obj);
    const from = item.curMat || item.baseMat;
    if (from && from !== mat) {
      item.obj.traverse((o) => {
        if (o.isMesh && !Array.isArray(o.material) && o.material === from) o.material = mat;
      });
    }
    item.curMat = mat;
    item.matKey = matKey;
  }

  /** Kembalikan satu perabot ke posisi/rotasi/material asal. */
  resetProp(item) {
    if (item.removed) this.restoreProp(item);
    this.moveProp(item, item.home.x, item.home.z);
    this.rotateProp(item, item.home.ry);
    if (item.curMat && item.curMat !== item.baseMat && item.baseMat) {
      item.obj.traverse((o) => {
        if (o.isMesh && !Array.isArray(o.material) && o.material === item.curMat) {
          o.material = item.baseMat;
        }
      });
    }
    item.curMat = item.baseMat;
    item.matKey = null;
  }

  resetAllEdits() {
    for (const item of this.editList()) {
      if (item.isCopy) continue; // duplikat dibuang seluruhnya
      this.resetProp(item);
    }
    this._clearCopies();
  }

  /**
   * Jadikan posisi sekarang sebagai "rumah" baru semua perabot.
   * Dipakai setelah layout bawaan diterapkan: Reset & simpanan berikutnya
   * memakai layout itu sebagai titik awal (bukan denah asli builder).
   */
  bakeHome() {
    for (const item of this.editList()) {
      item.home = { x: item.x, z: item.z, ry: item.ry };
    }
  }

  /** Ringkasan perubahan untuk disimpan (hanya perabot yang berubah). */
  serializeEdits() {
    const items = {};
    const add = [];
    const del = [];
    for (const item of this.editList()) {
      if (item.removed) {
        if (!item.isCopy) del.push(item.id);
        continue;
      }
      if (item.isCopy) {
        const a = {
          id: item.id,
          src: item.srcId,
          x: +item.home.x.toFixed(4),
          z: +item.home.z.toFixed(4),
          ry: +item.home.ry.toFixed(4),
        };
        const gid = this._groupOf.get(item);
        if (gid && (this._editGroups.get(gid) || []).length > 1) a.grp = gid;
        add.push(a);
      }
      const h = item.home;
      const moved = Math.abs(item.x - h.x) > 1e-4 || Math.abs(item.z - h.z) > 1e-4;
      const rotated = Math.abs(this._angleDiff(item.ry, h.ry)) > 1e-4;
      if (!moved && !rotated && !item.matKey) continue;
      const e = { x: +item.x.toFixed(4), z: +item.z.toFixed(4), ry: +item.ry.toFixed(4) };
      if (item.matKey) e.mat = item.matKey;
      items[item.id] = e;
    }
    const out = { v: 1, items };
    if (add.length) out.add = add;
    if (del.length) out.del = del;
    return out;
  }

  /**
   * Snapshot LENGKAP tata ruang (semua perabot, bukan hanya yang berubah).
   * Dipakai untuk menulis src/world/layout.default.json dari Mode Edit:
   * siapa pun yang pull repo langsung memakai tata ruang ini.
   */
  serializeLayout() {
    const items = {};
    const add = [];
    const del = [];
    for (const item of this.editList()) {
      if (item.removed) {
        if (!item.isCopy) del.push(item.id);
        continue;
      }
      if (item.isCopy) {
        const a = {
          id: item.id,
          src: item.srcId,
          x: +item.x.toFixed(4),
          z: +item.z.toFixed(4),
          ry: +item.ry.toFixed(4),
        };
        const gid = this._groupOf.get(item);
        if (gid && (this._editGroups.get(gid) || []).length > 1) a.grp = gid;
        add.push(a);
      }
      const e = {
        x: +item.x.toFixed(4),
        z: +item.z.toFixed(4),
        ry: +item.ry.toFixed(4),
      };
      if (item.matKey) e.mat = item.matKey;
      items[item.id] = e;
    }
    const out = { v: 1, full: true, items };
    if (add.length) out.add = add;
    if (del.length) out.del = del;
    return out;
  }

  _angleDiff(a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /**
   * Terapkan hasil simpanan ke dunia.
   * `reset = false` dipakai saat menumpuk layout tersimpan di atas layout
   * bawaan (jangan mengembalikan perabot ke denah asli builder).
   */
  applyEdits(data, reset = true) {
    if (!data) return 0;
    // mulai dari kondisi bersih: pulihkan yang dihapus, buang semua duplikat
    if (reset) this.resetAllEdits();
    let n = 0;

    // 1) hapus perabot yang sebelumnya dihapus
    if (Array.isArray(data.del)) {
      for (const id of data.del) {
        const item = this._editById.get(id);
        if (item && !item.isCopy) { this.removeProp(item); n++; }
      }
    }

    // 2) bangun ulang duplikat (dari perabot aslinya)
    const groups = new Map();
    if (Array.isArray(data.add)) {
      for (const a of data.add) {
        if (!a || typeof a.id !== "string" || typeof a.src !== "string") continue;
        const src = this._editById.get(a.src);
        if (!src || src.isCopy) continue;
        const x = Number(a.x) || 0;
        const z = Number(a.z) || 0;
        const ry = Number(a.ry) || 0;
        const made = this._makeCopy(src, x, z, ry, a.id);
        if (!made) continue;
        n++;
        if (a.grp) {
          if (!groups.has(a.grp)) groups.set(a.grp, []);
          groups.get(a.grp).push(made);
        }
      }
    }
    // tautkan lagi unit hasil duplikat (meja+kursi)
    for (const list of groups.values()) {
      if (list.length > 1) this.linkAll(list);
    }

    // 3) posisi/rotasi/material
    if (data.items) {
      for (const [id, e] of Object.entries(data.items)) {
        if (!e) continue;
        const item = this._editById.get(id);
        if (!item || item.removed) continue;
        if (typeof e.x === "number" && typeof e.z === "number") this.moveProp(item, e.x, e.z);
        if (typeof e.ry === "number") this.rotateProp(item, e.ry);
        if (e.mat) this.setPropMaterial(item, e.mat);
        n++;
      }
    }

    this._nav = null;
    if (this.staticMeshes) this._mergeStatic();
    return n;
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
    const ign = ignoreList(ignoreObstacle);
    for (const b of this.obstacles) {
      if (isIgnored(b, ign)) continue;
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
    const ign = ignoreList(ignoreObstacle);
    for (const b of this.obstacles) {
      if (isIgnored(b, ign)) continue;
      const cx = THREE.MathUtils.clamp(x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(z, b.minZ, b.maxZ);
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return false;
    }
    return true;
  }

  /**
   * Apa yang menghalangi titik (x,z)? Dipakai AI untuk memutuskan langkah:
   *   { type: "solid" } → dinding / sekat kaca / perabot  → PANTANG ditembus,
   *                        jadi AI menyusun ulang rute (bukan mendorong).
   *   { type: "body"  } → karakter lain                    → AI menyalip / mengalah.
   * Semua penghalang di sini sudah bertanda `solid` saat dibuat, dan
   * daftarnya hidup — jadi begitu perabot dipindah / diduplikat / dihapus
   * di Mode Edit, jawabannya langsung berubah.
   */
  blockerAt(x, z, radius = 0.3, ignoreObstacle = null, mover = null) {
    const ign = ignoreList(ignoreObstacle);
    for (let i = 0; i < this.obstacles.length; i++) {
      const b = this.obstacles[i];
      if (isIgnored(b, ign)) continue;
      const cx = x > b.maxX ? b.maxX : (x < b.minX ? b.minX : x);
      const cz = z > b.maxZ ? b.maxZ : (z < b.minZ ? b.minZ : z);
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < radius * radius) {
        return {
          type: "solid",
          kind: b.kind,
          blocked: b.blocked !== false,
          propType: b.type || null,
          seatable: !!b.seatable,
          obstacleClass: b.obstacleClass || (b.kind === "wall" ? "wall" : "prop"),
          label: b.label || (b.kind === "wall" ? "Dinding" : "Perabot"),
          obstacle: b,
        };
      }
    }
    const bodies = this.dynamicBodies;
    if (bodies) {
      for (let i = 0; i < bodies.length; i++) {
        const o = bodies[i];
        if (!o || o === mover) continue;
        const gap = radius + 0.29;
        const dx = x - o.position.x;
        const dz = z - o.position.z;
        if (dx * dx + dz * dz < gap * gap) {
          return { type: "body", label: o.name || "Rekan kerja", body: o };
        }
      }
    }
    return null;
  }

  /** Paksa grid navigasi dibangun ulang (setelah perabot diedit). */
  refreshNav() {
    this._nav = null;
  }

  /** Ada karakter lain yang terlalu dekat dengan (x,z)? (tabrakan badan) */
  _bodyBlocked(x, z, radius, mover = null) {
    const bodies = this.dynamicBodies;
    if (!bodies) return false;
    for (let i = 0; i < bodies.length; i++) {
      const o = bodies[i];
      if (!o || o === mover) continue;
      const minD = radius + 0.29;
      const ox = x - o.position.x;
      const oz = z - o.position.z;
      if (ox * ox + oz * oz < minD * minD) return true;
    }
    return false;
  }

  /**
   * Saat karakter BERHENTI, badan tidak boleh saling tembus. Yang berjalan
   * boleh lewat (biar AI tidak macet), tapi begitu dua badan sama-sama diam
   * dan bertumpuk, yang berdiri digeser menjauh dengan aman (tetap tidak
   * menembus dinding/perabot). Badan yang sedang duduk tidak pernah digeser.
   */
  separateIdleBodies() {
    const bodies = this.dynamicBodies;
    if (!bodies || bodies.length < 2) return;
    const minD = 0.29 * 2;
    const idle = (o) => !!o && !o._seating && !o._exiting && !o.path
      && (!o.speed || o.speed <= 0.06);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        if (!a || !idle(a)) continue;
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          if (!b) continue;
          // salah satu masih berjalan → biarkan saling lewat
          if (!idle(b) && !b.sitting) continue;
          const dx = b.position.x - a.position.x;
          const dz = b.position.z - a.position.z;
          const d2 = dx * dx + dz * dz;
          if (d2 >= minD * minD) continue;
          const d = Math.sqrt(d2);
          let nx = 1;
          let nz = 0;
          if (d > 1e-4) { nx = dx / d; nz = dz / d; }
          else {
            const ang = this.rng() * Math.PI * 2;
            nx = Math.cos(ang);
            nz = Math.sin(ang);
          }
          const gap = minD - d + 0.005;
          if (a.sitting && b.sitting) continue;
          if (a.sitting) {
            this.moveSafely(b.position, nx * gap, nz * gap, 0.29, b._seatIgnore, b);
          } else if (b.sitting) {
            this.moveSafely(a.position, -nx * gap, -nz * gap, 0.29, a._seatIgnore, a);
          } else {
            const half = gap / 2;
            this.moveSafely(a.position, -nx * half, -nz * half, 0.29, a._seatIgnore, a);
            this.moveSafely(b.position, nx * half, nz * half, 0.29, b._seatIgnore, b);
          }
        }
      }
    }
  }

  /** Titik ini bebas dari karakter lain? (dipakai saat memilih tujuan) */
  _bodyFree(x, z, gap = 0.9, mover = null) {
    const bodies = this.dynamicBodies;
    if (!bodies) return true;
    for (let i = 0; i < bodies.length; i++) {
      const o = bodies[i];
      if (!o || o === mover) continue;
      const dx = x - o.position.x;
      const dz = z - o.position.z;
      if (dx * dx + dz * dz < gap * gap) return false;
    }
    return true;
  }

  /**
   * Gerak bertahap (swept). Setiap posisi diperiksa SEBELUM dikomit, jadi
   * badan tidak bisa menembus dinding sekat, perabot, atau karakter lain —
   * bahkan saat lari atau menyerong. Kalau langkah lurus terhalang, badan
   * meluncur di sumbu yang masih bebas (ubah haluan, bukan memaksa maju).
   * @returns {number} jarak yang benar-benar ditempuh (meter)
   */
  sweepMove(v3, dx, dz, radius = 0.29, ignoreObstacle = null, mover = null) {
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-8) return 0;
    // langkah mikro ≤ 0.11 m → tak ada celah yang bisa ditembus
    const stepLen = Math.min(0.11, Math.max(0.05, radius * 0.38));
    const steps = Math.max(1, Math.ceil(distance / stepLen));
    const sx = dx / steps;
    const sz = dz / steps;
    const ign = ignoreList(ignoreObstacle);

    // Kedalaman tumpang-tindih badan dengan collider. 0 = bebas. Nilai
    // negatif-jarak (titik di DALAM kotak) dihitung makin besar, sehingga
    // "keluar dari dalam perabot" selalu memperkecil angka ini.
    const penetration = (x, z) => {
      let pen = 0;
      for (let i = 0; i < this.obstacles.length; i++) {
        const b = this.obstacles[i];
        if (isIgnored(b, ign)) continue;
        const cx = x > b.maxX ? b.maxX : (x < b.minX ? b.minX : x);
        const cz = z > b.maxZ ? b.maxZ : (z < b.minZ ? b.minZ : z);
        let d = Math.hypot(x - cx, z - cz);
        if (d < 1e-9) {
          // titik berada di dalam kotak → jarak "negatif" ke sisi terdekat
          d = -Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
        }
        if (d < radius) pen += radius - d;
      }
      return pen;
    };

    const r2 = radius * radius;
    const freeOf = (x, z) => {
      for (let i = 0; i < this.obstacles.length; i++) {
        const b = this.obstacles[i];
        if (isIgnored(b, ign)) continue;
        const cx = x > b.maxX ? b.maxX : (x < b.minX ? b.minX : x);
        const cz = z > b.maxZ ? b.maxZ : (z < b.minZ ? b.minZ : z);
        const ddx = x - cx;
        const ddz = z - cz;
        if (ddx * ddx + ddz * ddz < r2) return false;
      }
      return true;
    };

    // Kalau badan terjepit (mis. kursi berdiri lalu collider meja aktif
    // kembali, atau perabot dipindah menimpa orang), izinkan HANYA langkah
    // yang mengurangi tumpang-tindih — jadi tetap tidak bisa menembus,
    // tapi tidak pernah beku selamanya di dalam perabot.
    let penNow = penetration(v3.x, v3.z);

    const canOccupy = (x, z) => {
      if (x < this.bounds.x0 + radius || x > this.bounds.x1 - radius ||
          z < this.bounds.z0 + radius || z > this.bounds.z1 - radius) return false;
      // Karakter lain TIDAK memblokir saat berjalan (bisa saling lewat).
      // Saat berhenti, `separateIdleBodies()` yang merenggangkan badan.
      if (freeOf(x, z)) return true;
      if (penNow <= 1e-9) return false;          // kondisi normal: tidak boleh
      return penetration(x, z) < penNow - 1e-9;  // hanya boleh keluar
    };

    const fromX = v3.x;
    const fromZ = v3.z;
    for (let i = 0; i < steps; i++) {
      const nx = v3.x + sx;
      const nz = v3.z + sz;
      if (canOccupy(nx, nz)) {
        v3.x = nx;
        v3.z = nz;
        penNow = penetration(v3.x, v3.z);
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
        penNow = penetration(v3.x, v3.z);
      }
    }
    return Math.hypot(v3.x - fromX, v3.z - fromZ);
  }

  /** Versi lama: mengembalikan v3 (dipakai leash staf & pemanggil lain). */
  moveSafely(v3, dx, dz, radius = 0.3, ignoreObstacle = null, mover = null) {
    this.sweepMove(v3, dx, dz, radius, ignoreObstacle, mover);
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

    /* Peta "kelegaan" (clearance) — jarak tiap sel ke sel tak-jalan terdekat,
       dihitung dengan chamfer 2-lintasan. Dipakai A* untuk memilih jalur
       yang tidak menempel dinding/perabot, jadi karakter tidak menyusur
       sudut dan tidak menyenggol benda di tepian. Nilai dalam 1/10 sel. */
    const CAP = 60;              // 6 sel ≈ 1,5 m
    const D1 = 10;               // 1 sel
    const D2 = 14;               // √2 sel
    const clear = new Uint8Array(nx * nz);
    for (let k = 0; k < clear.length; k++) clear[k] = walk[k] ? CAP : 0;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!walk[k]) continue;
        let v = clear[k];
        if (i > 0 && clear[k - 1] + D1 < v) v = clear[k - 1] + D1;
        if (j > 0 && clear[k - nx] + D1 < v) v = clear[k - nx] + D1;
        if (i > 0 && j > 0 && clear[k - nx - 1] + D2 < v) v = clear[k - nx - 1] + D2;
        if (i < nx - 1 && j > 0 && clear[k - nx + 1] + D2 < v) v = clear[k - nx + 1] + D2;
        clear[k] = v;
      }
    }
    for (let j = nz - 1; j >= 0; j--) {
      for (let i = nx - 1; i >= 0; i--) {
        const k = j * nx + i;
        if (!walk[k]) continue;
        let v = clear[k];
        if (i < nx - 1 && clear[k + 1] + D1 < v) v = clear[k + 1] + D1;
        if (j < nz - 1 && clear[k + nx] + D1 < v) v = clear[k + nx] + D1;
        if (i < nx - 1 && j < nz - 1 && clear[k + nx + 1] + D2 < v) v = clear[k + nx + 1] + D2;
        if (i > 0 && j < nz - 1 && clear[k + nx - 1] + D2 < v) v = clear[k + nx - 1] + D2;
        clear[k] = v;
      }
    }

    /* Label KOMPONEN: kelompok sel yang saling terhubung. Dipakai supaya
       rute tidak pernah gagal membabi-buta: kalau tujuan berada di area
       yang tak terjangkau (kantong di belakang perabot), karakter berjalan
       ke titik terdekat yang masih sekomponen dengan dirinya. */
    const comp = new Int32Array(nx * nz).fill(-1);
    const queue = new Int32Array(nx * nz);
    let compCount = 0;
    for (let s = 0; s < comp.length; s++) {
      if (!walk[s] || comp[s] >= 0) continue;
      const id = compCount++;
      let head = 0;
      let tail = 0;
      queue[tail++] = s;
      comp[s] = id;
      while (head < tail) {
        const k = queue[head++];
        const i = k % nx;
        const j = (k / nx) | 0;
        if (i > 0 && walk[k - 1] && comp[k - 1] < 0) { comp[k - 1] = id; queue[tail++] = k - 1; }
        if (i < nx - 1 && walk[k + 1] && comp[k + 1] < 0) { comp[k + 1] = id; queue[tail++] = k + 1; }
        if (j > 0 && walk[k - nx] && comp[k - nx] < 0) { comp[k - nx] = id; queue[tail++] = k - nx; }
        if (j < nz - 1 && walk[k + nx] && comp[k + nx] < 0) { comp[k + nx] = id; queue[tail++] = k + nx; }
      }
    }

    let mainComp = -1;
    let mainSize = -1;
    const sizes = new Int32Array(compCount);
    for (let k = 0; k < comp.length; k++) {
      const c = comp[k];
      if (c >= 0) sizes[c]++;
    }
    for (let c = 0; c < compCount; c++) {
      if (sizes[c] > mainSize) { mainSize = sizes[c]; mainComp = c; }
    }

    this._nav = { cell, x0, z0, nx, nz, walk, clear, cap: CAP, comp, compCount, mainComp };
    return this._nav;
  }

  /**
   * Apakah (x,z) benar-benar punya sel jalan di dekatnya (bisa dipijak)?
   * `mainOnly` = harus tersambung ke jaringan utama (bukan kantong buntu).
   */
  walkableAt(x, z, tol = 0.22, mainOnly = false) {
    const nav = this._navEnsure();
    const { cell, x0, z0, nx, nz, walk, comp, mainComp } = nav;
    const ci = Math.floor((x - x0) / cell);
    const cj = Math.floor((z - z0) / cell);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        const k = j * nx + i;
        if (!walk[k]) continue;
        if (mainOnly && comp[k] !== mainComp) continue;
        const cx = x0 + (i + 0.5) * cell;
        const cz = z0 + (j + 0.5) * cell;
        if (di === 0 && dj === 0) return true;
        if ((cx - x) ** 2 + (cz - z) ** 2 <= tol * tol) return true;
      }
    }
    return false;
  }

  /** Sel jalan SEKOMPONEN `comp` yang paling dekat dengan (x,z). */
  _nearestInComp(x, z, nav, comp, maxRadius = 3.0) {
    const { cell, x0, z0, nx, nz, walk } = nav;
    const its = nav.comp;
    if (comp < 0) return null;
    const ci = THREE.MathUtils.clamp(Math.floor((x - x0) / cell), 0, nx - 1);
    const cj = THREE.MathUtils.clamp(Math.floor((z - z0) / cell), 0, nz - 1);
    const hit = (i, j) => {
      const k = j * nx + i;
      return walk[k] && its[k] === comp ? { i: k, x: x0 + (i + 0.5) * cell, z: z0 + (j + 0.5) * cell } : null;
    };
    const first = hit(ci, cj);
    if (first) return first;
    const maxR = Math.ceil(maxRadius / cell);
    for (let r = 1; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
          const found = hit(i, j);
          if (found) return found;
        }
      }
    }
    return null;
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
  _navSearch(nav, startI, goalI, avoid = null) {
    const { nx, nz, walk, clear, cap, x0, z0, cell } = nav;
    const total = nx * nz;
    const gCost = new Float32Array(total).fill(Infinity);
    const parent = new Int32Array(total).fill(-1);
    const goalX = goalI % nx;
    const goalZ = (goalI / nx) | 0;

    /**
     * Biaya ekstra sebuah sel:
     *  • kelegaan — menjauhi dinding/perabot (biar tidak menyusur sudut)
     *  • kerumunan — menghindari karakter lain yang sedang berdiri di jalur
     */
    const stepCost = (nI) => {
      let p = 0;
      const c = clear[nI];
      if (c < cap) p += (cap - c) * 0.0016;
      if (avoid) {
        const wx = x0 + ((nI % nx) + 0.5) * cell;
        const wz = z0 + (((nI / nx) | 0) + 0.5) * cell;
        for (let a = 0; a < avoid.length; a++) {
          const o = avoid[a];
          const ox = o.position.x - wx;
          const oz = o.position.z - wz;
          const d2 = ox * ox + oz * oz;
          if (d2 < 2.25) p += (1.5 - Math.sqrt(d2)) * 0.6;
        }
      }
      return p;
    };

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
        const ng = gCost[i] + cost + stepCost(nI);
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
  route(from, target, mover = null) {
    if (!from || !target) return [];
    const direct = [{ x: target.x, z: target.z }];
    if (this._lineFree(from.x, from.z, target.x, target.z, 0.30)) return direct;

    const nav = this._navEnsure();

    // Kerumunan: karakter lain (selain penggerak) jadi biaya ekstra di A*,
    // jadi NPC memilih lorong yang tidak penuh orang.
    let avoid = null;
    const bodies = this.dynamicBodies;
    if (bodies && bodies.length) {
      avoid = [];
      for (const o of bodies) {
        if (!o || o === mover) continue;
        avoid.push(o);
      }
      if (!avoid.length) avoid = null;
    }

    const start = this._nearestWalkable(from.x, from.z, nav);
    let goal = this._nearestWalkable(target.x, target.z, nav);
    if (!start || !goal) return []; // Never force a direct path when no safe path exists.

    // Tujuan di area lain yang tak terjangkau (kantong di belakang perabot)?
    // Jangan menyerah: dekati sejauh jaringan izinkan — jadi NPC tidak
    // berhenti mencoba jalan yang mustahil sampai tujuannya dibatalkan.
    const startComp = nav.comp ? nav.comp[start.i] : -1;
    if (nav.comp && startComp >= 0 && nav.comp[goal.i] !== startComp) {
      const near = this._nearestInComp(target.x, target.z, nav, startComp, 3.0);
      if (!near) return [];
      goal = near;
    }

    const cells = start.i !== goal.i ? this._navSearch(nav, start.i, goal.i, avoid) : null;
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

  /**
   * Titik berdiri yang aman di dekat (x,z): bebas perabot & tembok, tidak
   * menempel karakter lain, dan (default) masih di ruangan yang sama.
   */
  freeSpotAround(x, z, opts = {}) {
    const radius = opts.radius ?? 0.34;
    const gap = opts.gap ?? 0.75;
    const sameRoom = opts.sameRoom !== false;
    const home = this.roomAt(x, z);
    const bd = this.bounds;
    const start = opts.start ?? 0.6;
    const maxR = opts.maxR ?? 2.0;
    for (let r = start; r <= maxR; r += 0.3) {
      const steps = Math.max(8, Math.round(r * 8));
      const phase = this.rng() * Math.PI * 2;
      for (let i = 0; i < steps; i++) {
        const a = phase + (i / steps) * Math.PI * 2;
        const px = x + Math.sin(a) * r;
        const pz = z + Math.cos(a) * r;
        if (px < bd.x0 + 0.4 || px > bd.x1 - 0.4 || pz < bd.z0 + 0.4 || pz > bd.z1 - 0.4) continue;
        if (sameRoom && this.roomAt(px, pz) !== home) continue;
        if (!this.isFree(px, pz, radius)) continue;
        if (!this.walkableAt(px, pz, 0.22, true)) continue;
        if (!this._bodyFree(px, pz, gap)) continue;
        return { x: px, z: pz };
      }
    }
    return null;
  }

  /**
   * Titik berdiri di depan perabot berlabel tertentu (POI dinamis) — NPC
   * otomatis mencari perabot yang dipindah / diduplikat di Mode Edit.
   */
  poiNear(label, from = null, opts = {}) {
    let best = null;
    let bestD = Infinity;
    const v = new THREE.Vector3();
    for (const o of this.interactives) {
      const meta = o.userData.interactive;
      if (!meta || !meta.label || String(meta.label).indexOf(label) === -1) continue;
      o.getWorldPosition(v);
      const d = from ? (v.x - from.x) ** 2 + (v.z - from.z) ** 2 : 0;
      if (d < bestD) { bestD = d; best = { x: v.x, z: v.z }; }
    }
    if (!best) return null;
    const spot = this.freeSpotAround(best.x, best.z, opts);
    if (!spot) return null;
    spot.yaw = Math.atan2(best.x - spot.x, best.z - spot.z);
    return spot;
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
      if (this.isFree(x, z, 0.55) && this._bodyFree(x, z, 0.8) && this.walkableAt(x, z, 0.22, true)) {
        out.x = x; out.z = z;
        return out;
      }
    }
    out.x = 0; out.z = 0;
    return out;
  }

  /**
   * Klaim satu kursi. Kursi yang paling jarang dipakai didahulukan supaya
   * SEMUA kursi (semua tipe) kebagian diduduki — bukan cuma yang dekat.
   */
  claimSeat(type, who, roomId, near = null) {
    const free = this.seats.filter((s) =>
      s.type === type
      // opsional: batasi ke kursi yang ADA DI DALAM satu ruangan
      // (studio kreatif juga punya kursi tipe "meeting"!)
      && (!roomId || this.roomAt(s.x, s.z) === roomId)
      && (!s.taken || s.taken === who));
    if (!free.length) return null;
    // Rapat: pilih kursi TERDEKAT dari posisi peserta supaya lalu lintas
    // tidak silang dan kursi cepat terisi.
    if (near && typeof near.x === "number" && typeof near.z === "number") {
      let best = free[0];
      let bestD = Infinity;
      for (const s of free) {
        const d = (s.x - near.x) ** 2 + (s.z - near.z) ** 2;
        if (d < bestD) { bestD = d; best = s; }
      }
      best.taken = who;
      best.takenAt = this._clock;
      best.uses = (best.uses || 0) + 1;
      return best;
    }
    let min = Infinity;
    for (const s of free) min = Math.min(min, s.uses || 0);
    const pool = free.filter((s) => (s.uses || 0) === min);
    const seat = pool[Math.floor(Math.random() * pool.length)];
    seat.taken = who;
    seat.takenAt = this._clock;
    seat.uses = (seat.uses || 0) + 1;
    return seat;
  }

  /** Kursi apa pun yang masih kosong (semua tipe dudukan bisa diduduki). */
  claimAnySeat(who, { exclude = ["reception"], roomId = null } = {}) {
    const free = this.seats.filter((s) =>
      !exclude.includes(s.type)
      && (!roomId || this.roomAt(s.x, s.z) === roomId)
      && (!s.taken || s.taken === who));
    if (!free.length) return null;
    let min = Infinity;
    for (const s of free) min = Math.min(min, s.uses || 0);
    const pool = free.filter((s) => (s.uses || 0) === min);
    const seat = pool[Math.floor(Math.random() * pool.length)];
    seat.taken = who;
    seat.takenAt = this._clock;
    seat.uses = (seat.uses || 0) + 1;
    return seat;
  }

  releaseSeat(seat, who) {
    if (seat && seat.taken === who) {
      seat.taken = null;
      seat.takenAt = 0;
    }
  }

  /** Kursi apa yang sedang dipakai `who` (untuk dipakai pemain/NPC lain)? */
  seatOf(who) {
    for (const s of this.seats) if (s.taken === who) return s;
    return null;
  }

  /**
   * Jaring pengaman: klaim kursi yang "bocor" (pemiliknya sudah tidak ada
   * atau keburu lama) dilepas lagi. Tanpa ini, kursi bisa terkunci selamanya
   * dan tidak ada seorang pun yang bisa duduk di sana.
   */
  _releaseStaleSeats() {
    for (const s of this.seats) {
      if (!s.taken) continue;
      const owner = s.taken;
      const gone = !this.dynamicBodies?.includes(owner) && !(owner?.brain);
      const stale = this._clock - (s.takenAt || 0) > 90;
      if (gone || stale) {
        s.taken = null;
        s.takenAt = 0;
      }
    }
  }

  approachTo(seat, radii = [0.78, 0.92, 1.08, 1.24]) {
    const room = this.roomAt(seat.x, seat.z);
    const base = seat.yaw ?? 0;
    const target = seat.sit || seat;
    // Garis & titik duduk boleh menyelip ke meja yang ditutup kursi, tapi
    // titik pendekatannya WAJIB tempat yang benar-benar bisa dipijak.
    const ign = this.seatIgnore(seat);
    for (const r of radii) {
      for (let i = 0; i < 12; i++) {
        const step = Math.ceil(i / 2) * (Math.PI / 6) * (i % 2 ? 1 : -1);
        const a = base + step;
        const x = seat.x + Math.sin(a) * r;
        const z = seat.z + Math.cos(a) * r;
        if (this.roomAt(x, z) !== room) continue;
        if (!this.isFree(x, z, 0.30)) continue;
        if (!this.walkableAt(x, z, 0.22, true)) continue;   // harus tersambung ke jalur utama
        if (!this._lineFree(x, z, target.x, target.z, 0.24, ign)) continue;
        if (!this.isFree(target.x, target.z, 0.24, ign)) continue;
        return { x, z };
      }
    }
    return null;
  }

  /* --------------------------------------------------------------- loop */

  update(dt, elapsed) {
    this._clock += dt;
    this.dynamicBodies = (this.crew?.members ?? []).concat(
      (this.staffRoster ?? []).map((s) => s.critter),
    );
    // kursi yang klaimnya bocor dibebaskan tiap detik
    this._seatSweep -= dt;
    if (this._seatSweep <= 0) {
      this._seatSweep = 1;
      this._releaseStaleSeats();
    }
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
    // badan yang sudah diam tidak boleh bertumpuk
    this.separateIdleBodies();
  }
}

