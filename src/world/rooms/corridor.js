/* ===================================================================== *
 *  Koridor U — dekorasi sepanjang kaki utara / barat / timur.
 *
 *  Koridor bukan ruangan (tidak ada di ROOMS): lantainya memakai slab
 *  dasar. Modul ini hanya menambah perabot koridor:
 *    - dispenser air di koridor utara (target AI "cooler")
 *    - bangku tunggu di koridor utara + 1 bangku tiap kaki (menghadap
 *      taman kaca), papan pengumuman di dinding kaki barat & timur
 *    - keset pintu masuk taman, jam, lukisan, tanaman sudut
 * ===================================================================== */
import * as THREE from "three";

import { MAT } from "../materials.js";
import {
  createWaterCooler,
  createBench,
  createClock,
  createWallArt,
  createWhiteboard,
} from "../props.js";

export function build(b) {
  /* ── Dispenser air (koridor utara, dekat Lobby) ────────────────────
   *  Target AI `_goalCooler` mengarah ke (3.2, -2.1) — tepat di muka
   *  dispenser ini, jadi jangan digeser tanpa memperbarui AI.js. */
  const cooler = createWaterCooler();
  b._static(cooler, 3.2, -2.72, 0);
  b._interactive(cooler, {
    id: "corridor-cooler",
    label: "Dispenser air",
    hint: "Klik untuk ambil segelas air",
    radius: 0.8,
    onClick: () => "Air dingin siap — segar 💧",
  });

  /* ── Koridor utara: bangku tunggu + jam + lukisan ────────────────── */
  b._static(createBench({ w: 1.35, d: 0.44, h: 0.48 }), -1.9, -2.72, 0);
  b._static(createClock(), -4.6, -2.97, 0, 2.0);
  // Digeser ke timur: pintu Lobby kini 1.8 m (x -0.9..0.9), jadi lukisan
  // tidak boleh lagi mengintip ke jalur pintu.
  b._static(createWallArt({ w: 0.70, h: 0.95, variant: 3 }), 1.65, -2.97, 0, 0.98, { w: 0.78, d: 0.1 });

  /* ── Kaki barat & timur: bangku menghadap taman ──────────────────── */
  b._static(createBench({ w: 1.35, d: 0.44, h: 0.48 }), -6.79, 1.0, Math.PI / 2);
  b._static(createBench({ w: 1.35, d: 0.44, h: 0.48 }), 6.79, 1.0, -Math.PI / 2);

  /* ── Papan pengumuman di dinding kaki barat & timur (digeser sedikit ke
   *  utara supaya pintu kaca 2.0 m ke taman benar-benar bebas) ─────── */
  const boardW = createWhiteboard({ w: 1.3, h: 0.8 });
  b._static(boardW, -6.94, 4.2, Math.PI / 2, 1.28, { w: 1.3, d: 0.14 });
  b._interactive(boardW, {
    id: "announce-west",
    label: "Papan pengumuman",
    hint: "Klik untuk membaca pengumuman",
    radius: 1.1,
    onClick: () => "Pengumuman: jadwal rilis Q3 · kelas bahasa Jumat · ganti password 💡",
  });

  const boardE = createWhiteboard({ w: 1.3, h: 0.8 });
  b._static(boardE, 6.94, 4.2, -Math.PI / 2, 1.28, { w: 1.3, d: 0.14 });
  b._interactive(boardE, {
    id: "announce-east",
    label: "Papan pengumuman",
    hint: "Klik untuk membaca pengumuman",
    radius: 1.1,
    onClick: () => "Pengumuman: agenda all-hands · pelatihan keamanan · kantin baru 🍜",
  });

  /* ── Keset pintu masuk taman (segaris sumbu x = 0) ────────────────── */
  const doormat = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.9), MAT.rug);
  doormat.rotation.x = -Math.PI / 2;
  doormat.position.set(0.0, 0.014, -1.62);
  doormat.receiveShadow = true;
  b.staticGroup.add(doormat);

  /* ── Tanaman sudut (dipindah ke kaki koridor: mulut koridor utara kini
   *  jadi jalur pintu Meeting & Cafe yang lebar, tidak boleh terhalang) ─ */
  b._plant(-6.85, 2.7, 0, { variant: 0, scale: 0.55, seed: 101 });
  b._plant(6.85, 5.55, 0, { variant: 1, scale: 0.55, seed: 102 });
  b._plant(-6.6, 6.4, 0, { variant: 2, scale: 0.55, seed: 103 });
  b._plant(6.6, 6.4, 0, { variant: 0, scale: 0.55, seed: 104 });
}
