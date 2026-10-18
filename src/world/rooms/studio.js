/* ===================================================================== *
 *  Studio Kreatif — sayap timur-tengah (x 7.1..16, z 1..5).
 *
 *  Layout:
 *    - DUA meja kerja besar di tengah (10.6 & 13.4) untuk kolaborasi,
 *      masing-masing dikelilingi 2 kursi ergonomis
 *    - karpet NAVY di bawah meja, papan moodboard di dinding utara,
 *      panel akustik di dinding selatan
 *    - rak buku + lemari di dinding timur, lounge armchair + side table
 *      di sudut barat laut, lampu lantai interaktif
 *  Pintu ada di dinding barat x = 7.1 (z = 3), menghadap koridor U.
 * ===================================================================== */
import * as THREE from "three";

import { MAT } from "../materials.js";
import {
  createMeetingTable,
  createOfficeChair,
  createWhiteboard,
  createAcousticPanel,
  createStorageCabinet,
  createBookshelf,
  createArmchair,
  createSideTable,
  createFloorLamp,
  createWallArt,
  createBin,
} from "../props.js";

export function build(b) {
  /* ── 2 meja kerja besar + kursi ──────────────────────────────────── */
  const tables = [
    { x: 10.6, w: 2.6 },
    { x: 13.4, w: 2.6 },
  ];
  for (const t of tables) {
    b._static(
      createMeetingTable({ w: t.w, d: 1.2, h: 0.75 }),
      t.x, 2.9, 0, 0, { w: t.w, d: 1.2 },
    );
    b._static(createOfficeChair({ color: "navy" }), t.x, 2.38, 0);
    b._seat(t.x, 2.38, 0, "meeting");
    b._static(createOfficeChair({ color: "charcoal" }), t.x, 3.42, Math.PI);
    b._seat(t.x, 3.42, Math.PI, "meeting");
  }

  /* ── Karpet NAVY di bawah meja ───────────────────────────────────── */
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), MAT.rugNavy);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(12.0, 0.014, 2.9);
  rug.receiveShadow = true;
  b.staticGroup.add(rug);

  /* ── Moodboard + panel akustik ───────────────────────────────────── */
  const board = createWhiteboard({ w: 2.2, h: 1.0 });
  b._static(board, 9.4, 1.2, 0, 0.78, { w: 2.2, d: 0.16 });
  b._interactive(board, {
    id: "board-studio",
    label: "Papan ide studio",
    hint: "Klik untuk melihat moodboard",
    radius: 1.4,
    onClick: () => "Moodboard: eksplorasi warna, material, dan konsep kampanye",
  });

  b._static(createAcousticPanel({ w: 0.52, h: 0.86, color: "sage" }), 13.4, 4.82, Math.PI, 0.85, { w: 0.6, d: 0.1 });
  b._static(createAcousticPanel({ w: 0.52, h: 0.86, color: "rust" }), 15.0, 4.82, Math.PI, 0.85, { w: 0.6, d: 0.1 });
  b._static(createWallArt({ w: 0.6, h: 0.78, variant: 2 }), 12.6, 1.2, 0, 0.85, { w: 0.68, d: 0.1 });

  /* ── Penyimpanan di dinding timur ────────────────────────────────── */
  b._static(
    createStorageCabinet({ w: 0.85, h: 1.18, d: 0.36, color: "light" }),
    15.7, 2.0, -Math.PI / 2,
  );
  b._static(
    createBookshelf({ width: 0.84, height: 1.55, depth: 0.3, shelves: 4 }),
    15.7, 3.6, -Math.PI / 2,
  );

  /* ── Lounge kecil di sudut barat laut (digeser sedikit ke timur supaya
   *  jalur pintu 2.0 m tidak terhalang) ──────────────────────────────── */
  const arm = createArmchair({ color: "olive" });
  b._static(arm, 9.0, 1.8, 0);
  b._seat(9.0, 1.8, 0, "lounge");
  b._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), 9.95, 1.5, 0);
  b._static(createFloorLamp(), 8.2, 4.45, 0);

  b._plant(9.0, 4.5, 0, { variant: 1, scale: 0.66, seed: 88 });
  /* tanaman dipindah dari dinding utara: supaya jalur belakang meja (tempat
     sandaran kursi utara) tidak terputus jadi kantong buntu. */
  b._plant(9.55, 4.6, 0, { variant: 0, scale: 0.6, seed: 89 });
  b._static(createBin(), 7.6, 4.6, 0);
}
