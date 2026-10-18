/* ===================================================================== *
 *  Cafe — pantry, lounge TV, dan staff barista (keliling cafe).
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
  createBin,
  createCoffeeMachine,
  createMug,
} from "../props.js";

/* ------------------------------------------------------------------ *
 *  TV lounge (was Building.createTV).                                 *
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
 *  PlayStation (was Building.createPlayStation).                      *
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
 *  Konter pantry (was Building._kitchenCounter) — cara pasang:        *
 *    const counter = kitchenCounter(b);                               *
 *    b._static(counter, 0.5, -6.35, 0);                               *
 *    b._splitLive(counter, [counter.userData.parts.machine]);         *
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
  const counter = kitchenCounter(b);
  b._static(counter, 0.5, -6.35, 0);
  b._splitLive(counter, [counter.userData.parts.machine]);

  const fridge = createFridge({ w: 0.55, h: 1.4, d: 0.55 });
  b._static(fridge, -0.6, -6.35, 0);
  b._interactive(fridge, {
    id: "cafe-fridge", label: "Kulkas cafe",
    hint: "Klik untuk membuka / menutup", radius: 0.7,
    onClick: (self) => self.userData.api.toggle() ? "Kulkas dibuka" : "Kulkas ditutup",
  });

  const tv = createTV({ w: 1.4, h: 0.85 });
  b._static(tv, 2.2, -6.85, 0, 1.15, { w: 1.5, d: 0.2 });
  b._interactive(tv, {
    id: "cafe-tv", label: "TV lounge",
    hint: "Klik untuk ganti channel", radius: 1.2,
    onClick: () => "Channel: gameplay tournament · 4K 60 fps",
  });

  const ps = createPlayStation();
  b._static(ps, 2.2, -6.65, 0, 0.55, { w: 0.4, d: 0.25 });
  b._interactive(ps, {
    id: "cafe-ps", label: "PlayStation",
    hint: "Klik untuk menyalakan", radius: 0.7,
    onClick: () => "PS: game siap dimainkan",
  });

  // Carpet L-shape — digeser ke dalam supaya tidak menyentuh dinding koridor.
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.0), MAT.rug);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0.3, 0.012, -2.7);
  carpet.receiveShadow = true;
  b.staticGroup.add(carpet);

  // L-sofa A — sisi koridor, back DI DALAM room (tidak menembus dinding).
  // Back sofa = z_back; center z = -1.75 → back di -1.325, dinding inner -1.12. Aman.
  const sofaA = createSofa({ width: 2.0, depth: 0.85 });
  b._static(sofaA, 0.05, -1.75, Math.PI, 0, { w: 2.1, d: 0.95 });
  b._seat(0.05, -1.75, Math.PI, "lounge");

  // L-sofa B — sisi barat, footprint FIX (pre-swap salah sebelumnya).
  // fp {w:2.4, d:0.85} dibaca _static dengan swap ry=π/2 → world 0.85 × 2.4.
  const sofaB = createSofa({ width: 2.4, depth: 0.85 });
  b._static(sofaB, -0.4, -2.85, Math.PI / 2, 0, { w: 2.4, d: 0.85 });
  b._seat(-0.4, -2.85, Math.PI / 2, "lounge");

  // Coffee table — digeser bersama sofa supaya tidak menembus sofa.
  b._static(createCoffeeTable({ r: 0.38 }), 0.5, -2.75, 0);

  b._plant(2.6, -1.6, 0, { variant: 0, scale: 0.7, seed: 32 });
  // Bin cafe — pojok tenggara, jauh dari muka dinding koridor.
  b._static(createBin(), 2.7, -1.5, 0);

  // Barista cafe — keliling cafe & duduk di sofanya, tapi selalu kembali
  // ke belakang konter.
  b._spawnStaffCritter({
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
}
