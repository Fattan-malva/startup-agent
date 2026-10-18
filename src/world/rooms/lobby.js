/* ===================================================================== *
 *  Lobby — resepsionis, waiting lounge, dan tamu pintu masuk barat.
 * ===================================================================== */
import * as THREE from "three";

import { MAT } from "../materials.js";
import {
  rbox,
  shade,
  createMonitor,
  createSofa,
  createCoffeeTable,
  createArmchair,
  createBench,
  createBookshelf,
  createSideTable,
  createWallArt,
  createMagazineRack,
  createBin,
} from "../props.js";

/* ------------------------------------------------------------------ *
 *  Meja resepsionis (was Building._receptionDesk).                    *
 * ------------------------------------------------------------------ */
function receptionDesk() {
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

export function build(b) {
  const reception = receptionDesk();
  b._place(reception, -8.35, 2.45, 0, 0, { w: 2.6, d: 0.9 });
  const recMon = createMonitor({ width: 0.5 });
  b._place(recMon, -9.02, 2.45, 0, 0.78);
  b._interactive(recMon, {
    id: "monitor-reception", label: "Sistem registrasi tamu",
    hint: "Klik untuk mengganti tampilan", radius: 0.85,
    onClick: () => { recMon.userData.api.cycle(); return "Daftar tamu diperbarui"; },
  });
  b._deskChair(-8.35, 2.45, Math.PI, { color: "navy", type: "reception", gap: 1.05 });

  // Resepsionis lobby — keliling lobby & duduk di kursi receptionisnya
  b._spawnStaffCritter({
    id: "receptionist",
    name: "Resepsionis",
    tieColor: 0x477da6,
    department: { id: "lobby", name: "Lobby" },
    variant: 1,
    x: -7.85, z: 3.6, yaw: -Math.PI / 3,
    hotspotLabel: "Resepsionis lobby",
    hotspotHint: "Klik untuk bertanya",
    hotspotMessage: "Resepsionis: selamat datang di Atelier Corp. Ada yang bisa dibantu?",
    radius: 1.4,
    room: "lobby",
    seatType: "reception",
    homeStatus: "Menunggu tamu 🛎️",
  });

  b._static(createSofa({ width: 1.72, depth: 0.78 }), -5.35, 5.95, Math.PI);
  b._seat(-5.35, 5.95, Math.PI, "lounge");
  b._static(createCoffeeTable({ r: 0.34 }), -5.35, 4.72, 0);
  b._static(createArmchair({ color: "sand" }), -3.75, 4.95, -Math.PI / 2);
  b._seat(-3.75, 4.95, -Math.PI / 2, "lounge");
  b._static(createBench({ w: 0.95, d: 0.38, h: 0.48 }), -8.55, 5.8, 0);
  b._static(createBookshelf({ width: 0.82, height: 1.45, depth: 0.28, shelves: 4 }), -9.48, 6.05, Math.PI / 2);
  b._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), -6.75, 6.1, 0);
  b._static(createWallArt({ w: 0.62, h: 0.78, variant: 3 }), -6.2, 6.82, Math.PI, 0.65, { w: 0.68, d: 0.1 });
  b._plant(-9.25, 1.55, 0, { variant: 0, scale: 0.72, seed: 55 });
  b._static(createMagazineRack({ w: 0.5, h: 0.68, d: 0.24 }), -4.0, 2.0, Math.PI / 2);
  // Bin lobby — pojok timur laut (jauh dari muka dinding koridor 1.12).
  b._static(createBin(), -3.3, 1.45, 0);
}
