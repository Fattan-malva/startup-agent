/* ===================================================================== *
 *  CEO Room — kantor eksekutif MEWAH, selebar HR (8.4 m: x 7..15.4).
 *
 *  Layout presisi:
 *    - sekat kaca barat x=7 (muka 7.07) & timur x=15.4 (muka 15.33)
 *    - meja eksekutif 2.5 m di barat + SATU kursi tamu (condong sisi
 *      kaca timur, bukan di jalur pintu x 8.85..10.15)
 *    - lounge SIMETRIS melayang di tengah-selatan: dikit dari tembok &
 *      sekat supaya tidak mepet — sofa utara & selatan saling pandang,
 *      2 armchair di ujung, semua roda di atas karpet NAVY 4.4×3.0
 *    - 2 lampu gantung interaktif (atas meja & lounge)
 *    - rak buku ×3 + lemari di muka kaca timur (terbuka ke dalam room)
 *    - lukisan besar di atas sofa selatan + 2 kecil di front dinding
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
  createPendantLamp,
  createBin,
} from "../props.js";
import { WALL_H } from "../layout.js";

export function build(b) {
  /* Meja eksekutif — lebar 2.5, menghadap barat (kaca muka 7.07) */
  const execDesk = createWorkstation({ desk: { width: 2.4 } });
  b._place(execDesk, 8.25, 2.7, Math.PI / 2, 0, { w: 2.5, d: 1.3 });
  b._deskParts(execDesk, "ceo-desk");
  b._deskChair(8.25, 2.7, Math.PI / 2, { color: "charcoal", gap: 1.12, type: "ceo" });

  // SATU kursi tamu saja — condong ke sisi tembok kaca timur (x=15.4),
  // selaras pusat meja — BUKAN di jalur pintu (x 8.85..10.15).
  b._static(createOfficeChair({ color: "navy" }), 13.9, 2.7, -Math.PI / 2);
  b._seat(13.9, 2.7, -Math.PI / 2, "lounge");

  /* Karpet NAVY polos — lounge melayang di tengah-selatan */
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.0), MAT.rugNavy);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(11.2, 0.013, 5.15);
  rug.receiveShadow = true;
  b.staticGroup.add(rug);

  /*
   * Lounge simetris — TIDAK mepet tembok/sekat:
   *   sofa selatan z 6.15 (muka tembok 6.93 → lega 0.33+)
   *   sofa utara  z 4.15 (jauh dari meja & jalur pintu)
   *   armchair    x 9.0 / 13.4 (kaca 7.07 & 15.33 → lega 0.9+)
   */
  const sofaS = createSofa({ width: 2.05, depth: 0.9 });
  b._static(sofaS, 11.2, 6.15, Math.PI, 0, { w: 2.05, d: 0.95 });
  b._seat(11.2, 6.15, Math.PI, "lounge");
  const sofaN = createSofa({ width: 2.05, depth: 0.9 });
  b._static(sofaN, 11.2, 4.15, 0, 0, { w: 2.05, d: 0.95 });
  b._seat(11.2, 4.15, 0, "lounge");
  b._static(createCoffeeTable({ r: 0.38 }), 11.2, 5.15, 0);
  const armW = createArmchair({ color: "sand" });
  b._static(armW, 9.65, 5.15, Math.PI / 2);
  b._seat(9.65, 5.15, Math.PI / 2, "lounge");
  const armE = createArmchair({ color: "sand" });
  b._static(armE, 12.75, 5.15, -Math.PI / 2);
  b._seat(12.75, 5.15, -Math.PI / 2, "lounge");
  b._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), 9.8, 6.35, 0);
  b._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), 12.6, 6.35, 0);

  /* Lemari + rak buku ×3 — dinding timur (muka 15.33).
   * Rotasi -π/2: punggung ke kaca, rak terbuka ke dalam room. */
  b._static(
    createStorageCabinet({ w: 0.82, h: 1.18, d: 0.34, color: "wood" }),
    15.05, 1.5, -Math.PI / 2,
  );
  const bookZs = [2.7, 3.9, 5.1];
  for (const bz of bookZs) {
    b._static(
      createBookshelf({ width: 0.84, height: 1.52, depth: 0.28, shelves: 4 }),
      15.05, bz, -Math.PI / 2,
    );
  }

  /* Lukisan — besar di atas sofa selatan, 2 kecil di front dinding */
  const artBig = createWallArt({ w: 1.15, h: 1.4, variant: 4 });
  b._static(artBig, 11.2, 6.82, Math.PI, 0.62, { w: 1.25, d: 0.1 });
  b._static(
    createWallArt({ w: 0.55, h: 0.72, variant: 2 }),
    8.2, 1.22, 0, 0.64, { w: 0.64, d: 0.1 },
  );
  b._static(
    createWallArt({ w: 0.62, h: 0.78, variant: 1 }),
    13.2, 1.22, 0, 0.68, { w: 0.72, d: 0.1 },
  );

  /* Dua lampu gantung — atas meja & lounge, interaktif */
  const lampDesk = createPendantLamp();
  const lampLounge = createPendantLamp();
  b._static(lampDesk, 8.25, 2.7, 0, WALL_H - 0.7);
  b._static(lampLounge, 11.2, 5.15, 0, WALL_H - 0.7);
  b._interactive(lampDesk, {
    id: "pendant-ceo-desk", label: "Lampu meja CEO",
    hint: "Klik untuk nyala / mati", radius: 0.75,
    onClick: (self) => self.userData.api.toggle() ? "Lampu meja nyala" : "Lampu meja mati",
  });
  b._interactive(lampLounge, {
    id: "pendant-ceo-lounge", label: "Lampu lounge CEO",
    hint: "Klik untuk nyala / mati", radius: 0.75,
    onClick: (self) => self.userData.api.toggle() ? "Lampu lounge nyala" : "Lampu lounge mati",
  });

  /* Hijauan + bin di pojok — rapi, tidak mengganggu jalur pintu */
  b._plant(14.75, 6.55, 0, { variant: 2, scale: 0.72, seed: 70 });
  b._plant(7.6, 1.75, 0, { variant: 0, scale: 0.6, seed: 71 });
  b._static(createBin(), 7.6, 6.6, 0);
}
