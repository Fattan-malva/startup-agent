/* ===================================================================== *
 *  CEO Room — sayap barat-selatan (x -16..-7.1, z 3..9).
 *
 *  Layout (kantor eksekutif):
 *    - meja eksekutif menghadap timur (punggung ke jendela barat) +
 *      SATU kursi tamu di sisi timur meja, tidak di jalur pintu
 *    - lounge SIMETRIS melayang di tengah: sofa utara & selatan saling
 *      pandang + 2 armchair di ujung, di atas karpet NAVY
 *    - rak buku ×2 + lemari di dinding selatan (punggung menempel
 *      dinding, muka rak terbuka KE DALAM ruangan)
 *    - 2 lampu gantung interaktif, lampu lantai, tanaman, bin
 *  Pintu ada di dinding timur x = -7.1 (z = 6.5), menghadap koridor U.
 * ===================================================================== */
import * as THREE from "three";

import { MAT } from "../materials.js";
import {
  createWorkstation,
  createOfficeChair,
  createSofa,
  createCoffeeTable,
  createArmchair,
  createSideTable,
  createStorageCabinet,
  createBookshelf,
  createWallArt,
  createFloorLamp,
  createPendantLamp,
  createBin,
} from "../props.js";
import { WALL_H } from "../layout.js";

export function build(b) {
  /* ── Meja eksekutif + kursi (SATU perabot) ───────────────────────── */
  b._workBundle(createWorkstation({ desk: { width: 2.4 } }), {
    x: -14.15, z: 6.0, ry: -Math.PI / 2,
    label: "Meja CEO",
    type: "ceo",
    partsKey: "ceo-desk",
    chairs: [{ face: "-z", color: "charcoal", type: "ceo" }],
  });

  // Kursi tamu menghadap meja/CEO (dan jendela kaca barat) — jauh dari  // jalur pintu (x -7.85..-6.35).
  b._static(createOfficeChair({ color: "navy" }), -12.2, 6.0, -Math.PI / 2);
  b._seat(-12.2, 6.0, -Math.PI / 2, "lounge");

  /* ── Karpet NAVY + lounge melayang ───────────────────────────────── */
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), MAT.rugNavy);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-10.4, 0.013, 5.1);
  rug.receiveShadow = true;
  b.staticGroup.add(rug);

  const sofaN = createSofa({ width: 1.7, depth: 0.85 });
  b._static(sofaN, -10.4, 3.9, 0, 0, { w: 1.8, d: 0.95 });
  b._seat(-10.4, 3.9, 0, "lounge");

  const sofaS = createSofa({ width: 1.7, depth: 0.85 });
  b._static(sofaS, -10.4, 6.3, Math.PI, 0, { w: 1.8, d: 0.95 });
  b._seat(-10.4, 6.3, Math.PI, "lounge");

  /* Meja kopi dipindah ke ujung timur pit (bukan di tengah) supaya ruang
   * duduk depan sofa tetap lapang — karang duduk butuh jalur masuk. */
  b._static(createCoffeeTable({ r: 0.3 }), -9.15, 3.55, 0);

  const armW = createArmchair({ color: "sand" });
  b._static(armW, -12.7, 4.9, Math.PI / 2);
  b._seat(-12.7, 4.9, Math.PI / 2, "lounge");

  const armE = createArmchair({ color: "sand" });
  b._static(armE, -8.1, 4.9, -Math.PI / 2);
  b._seat(-8.1, 4.9, -Math.PI / 2, "lounge");

  /* Meja samping dihapus di sisi ini: dinding utara dipakai sebagai jalur
   * sirkulasi di belakang sofa supaya lounge tidak jadi kantong buntu. */
  b._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), -15.2, 3.62, 0);

  /* ── Rak buku + lemari di dinding selatan (muka rak ke dalam) ────── */
  b._static(
    createBookshelf({ width: 1.5, height: 1.55, depth: 0.28, shelves: 4 }),
    -13.5, 8.75, Math.PI,
  );
  b._static(
    createBookshelf({ width: 1.5, height: 1.55, depth: 0.28, shelves: 4 }),
    -11.4, 8.75, Math.PI,
  );
  b._static(
    createStorageCabinet({ w: 0.85, h: 1.18, d: 0.36, color: "wood" }),
    -8.9, 8.75, Math.PI,
  );

  /* ── Lukisan + lampu ─────────────────────────────────────────────── */
  b._static(createWallArt({ w: 1.1, h: 1.35, variant: 4 }), -7.24, 4.7, -Math.PI / 2, 1.15, { w: 1.2, d: 0.1 });
  b._static(createWallArt({ w: 0.6, h: 0.78, variant: 2 }), -13.5, 8.9, Math.PI, 2.0, { w: 0.68, d: 0.1 });
  b._static(createWallArt({ w: 0.6, h: 0.78, variant: 1 }), -11.4, 8.9, Math.PI, 2.0, { w: 0.68, d: 0.1 });

  const lampDesk = createPendantLamp();
  const lampLounge = createPendantLamp();
  b._static(lampDesk, -14.15, 6.0, 0, WALL_H - 0.7);
  b._static(lampLounge, -10.4, 5.1, 0, WALL_H - 0.7);
  b._interactive(lampDesk, {
    id: "pendant-ceo-desk",
    label: "Lampu meja CEO",
    hint: "Klik untuk nyala / mati",
    radius: 0.8,
    onClick: (self) => (self.userData.api.toggle() ? "Lampu meja nyala" : "Lampu meja mati"),
  });
  b._interactive(lampLounge, {
    id: "pendant-ceo-lounge",
    label: "Lampu lounge CEO",
    hint: "Klik untuk nyala / mati",
    radius: 0.8,
    onClick: (self) => (self.userData.api.toggle() ? "Lampu lounge nyala" : "Lampu lounge mati"),
  });

  b._static(createFloorLamp(), -8.2, 4.3, 0);

  b._plant(-15.4, 8.5, 0, { variant: 2, scale: 0.72, seed: 70 });
  b._plant(-7.6, 3.5, 0, { variant: 0, scale: 0.6, seed: 71 });
  b._static(createBin(), -7.6, 8.5, 0);
}
