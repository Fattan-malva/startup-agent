/* ===================================================================== *
 *  Cafe — sayap utara-timur (x 5.5..16, z -10..-3.1).
 *
 *  Layout:
 *    - konter pantry panjang di dinding utara + espresso machine
 *      interaktif; 3 bar stool (ottoman) menghadap konter
 *    - kulkas + media cabinet + TV lounge + PlayStation di dinding utara
 *      bagian timur, lounge sofa menghadap TV di atas karpet navy
 *    - 2 meja bundar dengan armchair (area makan)
 *    - bangku/kursi tetap ada; KARAKTER tidak di-hard-code di sini
 *      (semua staf lahir dari src/data/staff.json lewat modal Staf)
 *  Pintu ada di dinding selatan z = -3.1 (x = 6.3), menghadap koridor U.
 * ===================================================================== */
import * as THREE from "three";

import { MAT } from "../materials.js";
import {
  box,
  rbox,
  cyl,
  shade,
  createFridge,
  createSofa,
  createCoffeeTable,
  createArmchair,
  createOttoman,
  createSideTable,
  createStorageCabinet,
  createClock,
  createBin,
  createCoffeeMachine,
  createMug,
} from "../props.js";

/* ------------------------------------------------------------------ *
 *  TV lounge — bezel tipis + layar yang bisa dinyalakan.              *
 * ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ *
 *  PlayStation — dekorasi konsol di atas media cabinet.               *
 * ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ *
 *  Konter pantry — splash MENEMPEL dinding utara (lokal -z).          *
 * ------------------------------------------------------------------ */
function kitchenCounter(b) {
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
  b._interactive(machine, {
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

export function build(b) {
  /* ── Pantry: konter + kulkas + TV lounge ─────────────────────────── */
  const counter = kitchenCounter(b);
  b._static(counter, 11.6, -9.62, 0);
  b._splitLive(counter, [counter.userData.parts.machine]);

  /* 3 bar stool (ottoman) DITUTUP ke konter — sekaligus membuka jalur
   * lewat lounge supaya sudut TV tidak jadi kantong buntu. */
  const stoolXs = [10.85, 11.6, 12.35];
  for (const sx of stoolXs) {
    const stool = createOttoman({ w: 0.6, d: 0.56, color: "olive" });
    b._static(stool, sx, -9.12, Math.PI);
    b._seat(sx, -9.12, Math.PI, "lounge");
  }

  const fridge = createFridge({ w: 0.55, h: 1.4, d: 0.55 });
  b._static(fridge, 15.35, -9.62, 0);
  b._interactive(fridge, {
    id: "cafe-fridge",
    label: "Kulkas cafe",
    hint: "Klik untuk membuka / menutup",
    radius: 0.7,
    onClick: (self) => (self.userData.api.toggle() ? "Kulkas dibuka" : "Kulkas ditutup"),
  });

  const mediaCabinet = createStorageCabinet({ w: 1.35, h: 0.56, d: 0.38, color: "wood" });
  b._static(mediaCabinet, 13.8, -9.74, 0, 0, { w: 1.42, d: 0.44 });

  const tv = createTV({ w: 1.4, h: 0.85 });
  b._static(tv, 13.8, -9.82, 0, 1.15);
  b._interactive(tv, {
    id: "cafe-tv",
    label: "TV lounge",
    hint: "Klik untuk ganti channel",
    radius: 1.2,
    onClick: () => "Channel: gameplay tournament · 4K 60 fps",
  });

  const ps = createPlayStation();
  ps.userData.footprint = null; // menempel media cabinet, bukan collider lantai
  b._static(ps, 13.8, -9.6, 0, 0.62);
  b._interactive(ps, {
    id: "cafe-ps",
    label: "PlayStation",
    hint: "Klik untuk menyalakan",
    radius: 0.7,
    onClick: () => "PS: game siap dimainkan",
  });

  b._static(createClock(), 9.5, -9.86, 0, 2.0);

  /* ── Lounge menghadap TV (karpet navy) ───────────────────────────── */
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), MAT.rugNavy);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(13.8, 0.012, -7.4);
  rug.receiveShadow = true;
  b.staticGroup.add(rug);

  const sofa = createSofa({ width: 2.0, depth: 0.85 });
  b._static(sofa, 13.8, -6.15, Math.PI, 0, { w: 2.1, d: 0.95 });
  b._seat(13.8, -6.15, Math.PI, "lounge");

  const armA = createArmchair({ color: "sand" });
  b._static(armA, 15.25, -7.9, Math.PI);
  b._seat(15.25, -7.9, Math.PI, "lounge");

  const armB = createArmchair({ color: "sand" });
  b._static(armB, 11.9, -7.35, Math.PI);
  b._seat(11.9, -7.35, Math.PI, "lounge");

  b._static(createCoffeeTable({ r: 0.38 }), 13.8, -7.5, 0);

  /* ── Area makan: 2 meja bundar + armchair ────────────────────────── */
  const dining = [
    { x: 8.3, z: -5.4 },
    { x: 11.2, z: -5.4 },
  ];
  for (const t of dining) {
    b._static(createCoffeeTable({ r: 0.4 }), t.x, t.z, 0);
    b._static(createArmchair({ color: "olive" }), t.x, t.z - 1.5, 0);
    b._seat(t.x, t.z - 1.5, 0, "lounge");
    b._static(createArmchair({ color: "olive" }), t.x, t.z + 1.5, Math.PI);
    b._seat(t.x, t.z + 1.5, Math.PI, "lounge");
  }
  b._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), 9.75, -6.6, 0);

  b._plant(6.1, -9.4, 0, { variant: 0, scale: 0.66, seed: 32 });
  b._plant(9.6, -9.4, 0, { variant: 1, scale: 0.6, seed: 33 });
  b._plant(15.5, -3.9, 0, { variant: 2, scale: 0.6, seed: 34 });
  b._static(createBin(), 7.75, -3.5, 0);

  /* Karakter TIDAK dibuat di sini — semua staf lahir dari staff.json
   * lewat modal Management Staf. Tidak ada NPC statis. */
}
