/* ===================================================================== *
 *  Lobby — sayap utara-tengah (x -5.5..5.5, z -10..-3.1).
 *
 *  Layout:
 *    - meja resepsionis menghadap pintu (front +z); kursi resepsionis
 *      di belakangnya (karakter diisi dari staff.json, bukan statis)
 *    - waiting lounge: 2 sofa saling pandang + meja kopi di atas karpet
 *      navy, armchair + side table, bangku tunggu di dinding timur
 *    - rak buku + rak majalah + jam + tanaman
 *  Pintu ada di dinding selatan z = -3.1 (x = 0), menghadap koridor U.
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
  createClock,
  createMagazineRack,
  createBin,
} from "../props.js";

/* ------------------------------------------------------------------ *
 *  Meja resepsionis — panel brand menghadap tamu (+z).               *
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
  /* ── Resepsionis: meja + kursi = SATU perabot ─────────────────────── */
  b._workBundle(receptionDesk(), {
    x: 0, z: -7.5, ry: Math.PI,
    label: "Meja resepsionis",
    type: "reception",
    // Kursi resepsionis di sisi utara meja, menghadap tamu.
    chairs: [
      { face: "-z", color: "navy", type: "reception", label: "Kursi resepsionis" },
    ],
  });

  const recMon = createMonitor({ width: 0.5 });
  b._place(recMon, -0.67, -7.5, Math.PI, 0.78);
  b._interactive(recMon, {
    id: "monitor-reception",
    label: "Sistem registrasi tamu",
    hint: "Klik untuk mengganti tampilan",
    radius: 0.85,
    onClick: () => { recMon.userData.api.cycle(); return "Daftar tamu diperbarui"; },
  });

  /* Dinding brand di belakang resepsionis. */
  b._static(
    createWallArt({ w: 2.4, h: 1.0, variant: 0 }),
    0, -9.86, 0, 1.24, { w: 2.5, d: 0.1 },
  );
  b._static(createClock(), 3.5, -9.86, 0, 2.0);

  /* ── Waiting lounge (karpet navy + 2 sofa saling pandang) ────────── */
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.0), MAT.rugNavy);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-3.9, 0.012, -6.4);
  rug.receiveShadow = true;
  b.staticGroup.add(rug);

  const sofaA = createSofa({ width: 2.0, depth: 0.85 });
  b._static(sofaA, -3.9, -8.45, 0, 0, { w: 2.1, d: 0.95 });
  b._seat(-3.9, -8.45, 0, "lounge");

  const sofaB = createSofa({ width: 2.0, depth: 0.85 });
  b._static(sofaB, -3.9, -4.35, Math.PI, 0, { w: 2.1, d: 0.95 });
  b._seat(-3.9, -4.35, Math.PI, "lounge");

  b._static(createCoffeeTable({ r: 0.42 }), -3.9, -6.4, 0);

  const armW = createArmchair({ color: "sand" });
  b._static(armW, -1.8, -6.4, -Math.PI / 2);
  b._seat(-1.8, -6.4, -Math.PI / 2, "lounge");
  b._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), -1.8, -5.05, 0);

  /* Bangku tunggu + rak majalah di dinding timur. */
  b._static(createBench({ w: 1.35, d: 0.44, h: 0.48 }), 5.02, -6.0, -Math.PI / 2);
  b._static(createMagazineRack({ w: 0.72, h: 0.9, d: 0.3 }), 5.0, -4.2, -Math.PI / 2);

  /* Rak buku di dinding utara (punggung menempel dinding). */
  b._static(
    createBookshelf({ width: 0.84, height: 1.45, depth: 0.28, shelves: 4 }),
    -3.9, -9.79, 0,
  );

  b._plant(5.05, -9.2, 0, { variant: 0, scale: 0.72, seed: 55 });
  b._plant(-5.05, -9.25, 0, { variant: 2, scale: 0.62, seed: 56 });
  b._plant(1.95, -3.75, 0, { variant: 1, scale: 0.6, seed: 57 });
  b._static(createBin(), -1.9, -9.2, 0);

  /* Karakter TIDAK dibuat di sini — semua staf lahir dari staff.json
   * lewat modal Management Staf. Tidak ada NPC statis. */
}
