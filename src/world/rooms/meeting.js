/* ===================================================================== *
 *  Ruang Meeting — sayap utara-barat (x -16..-5.5, z -10..-3.1).
 *
 *  Layout:
 *    - meja rapat 4.6 m di tengah, 5 kursi tiap sisi + 1 kursi kepala
 *      di ujung timur (di luar jalur pintu x -6.95..-5.65)
 *    - papan tulis besar di dinding utara, layar presentasi di dinding
 *      barat (menghadap ke dalam ruangan)
 *    - 2 kredenza penyimpanan + lukisan + 3 lampu gantung interaktif
 *  Pintu ada di dinding selatan z = -3.1 (x = -6.3, menghadap koridor).
 * ===================================================================== */
import * as THREE from "three";

import { MAT } from "../materials.js";
import {
  rbox,
  shade,
  createMeetingTable,
  createOfficeChair,
  createWhiteboard,
  createWallArt,
  createStorageCabinet,
  createPendantLamp,
  createBin,
} from "../props.js";
import { WALL_H } from "../layout.js";

/* Layar presentasi dinding — bezel tipis + panel gelap yang menghadap
 * ke dalam ruangan (bukan TV lounge, jadi tanpa stand meja). */
function createWallScreen({ w = 1.9, h = 1.05 } = {}) {
  const g = new THREE.Group();
  g.name = "Layar presentasi";
  g.userData.interactionLabel = "Layar presentasi";

  const bezel = rbox(w + 0.06, h + 0.06, 0.06, 0.014, MAT.blackMetal, 0.005);
  g.add(bezel);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      color: 0x0c1a26,
      roughness: 0.2,
      metalness: 0.25,
      emissive: 0x1c4a6b,
      emissiveIntensity: 0.22,
    }),
  );
  screen.position.z = 0.034;
  g.add(screen);

  shade(g);
  g.userData.parts = { screen: screen.material };
  g.userData.api = {
    on: true,
    toggle() {
      this.on = !this.on;
      screen.material.emissiveIntensity = this.on ? 0.22 : 0;
      return this.on;
    },
  };
  return g;
}

export function build(b) {
  const cx = -10.75;
  const cz = -6.55;

  /* Meja rapat — 4.6 × 1.3, sumbu panjang mengikuti x.
   * Meja + SEMUA kursinya = SATU unit edit: geser/putar/duplikat/hapus
   * selalu bersama, jadi susunan rapat tidak pernah berantakan. */
  const table = b._static(
    createMeetingTable({ w: 4.6, d: 1.3, h: 0.75 }),
    cx, cz, 0, 0, { w: 4.6, d: 1.3 },
  );
  const chairs = [];

  /* 5 kursi tiap sisi panjang (z -7.67 & -5.43) + 1 kursi kepala timur. */
  const sideXs = [-1.8, -0.9, 0, 0.9, 1.8];
  for (const dz of [-1.12, 1.12]) {
    const yaw = dz > 0 ? Math.PI : 0;
    for (const dx of sideXs) {
      chairs.push(b._static(createOfficeChair({ color: dz > 0 ? "charcoal" : "navy" }), cx + dx, cz + dz, yaw));
      b._seat(cx + dx, cz + dz, yaw, "meeting");
    }
  }
  chairs.push(b._static(createOfficeChair({ color: "navy" }), -7.85, cz, -Math.PI / 2));
  b._seat(-7.85, cz, -Math.PI / 2, "meeting");
  b.linkAll([table, ...chairs]);

  /* Papan tulis di dinding utara (muka dinding -9.93). */
  const board = createWhiteboard({ w: 2.6, h: 1.3 });
  b._static(board, cx, -9.86, 0, 0.78, { w: 2.7, d: 0.16 });
  b._interactive(board, {
    id: "board-meeting",
    label: "Papan tulis meeting",
    hint: "Klik untuk melihat agenda",
    radius: 1.5,
    onClick: () => "Agenda: review sprint · roadmap Q3 · alokasi tim 📝",
  });

  /* Layar presentasi di dinding barat (muka dinding -15.93). */
  const screen = createWallScreen({ w: 1.9, h: 1.05 });
  b._static(screen, -15.86, cz, Math.PI / 2, 1.28);
  b._interactive(screen, {
    id: "screen-meeting",
    label: "Layar presentasi",
    hint: "Klik untuk nyala / mati",
    radius: 1.0,
    onClick: (self) => (self.userData.api.toggle() ? "Layar presentasi nyala" : "Layar presentasi mati"),
  });

  /* Kredenza penyimpanan di dinding utara, mengapit papan tulis. */
  b._static(createStorageCabinet({ w: 1.35, h: 0.62, d: 0.46 }), -15.1, -9.66, 0, 0, { w: 1.42, d: 0.5 });
  b._static(createStorageCabinet({ w: 1.35, h: 0.62, d: 0.46 }), -8.5, -9.66, 0, 0, { w: 1.42, d: 0.5 });

  /* Lukisan kecil di dinding utara mengapit papan tulis. */
  b._static(createWallArt({ w: 0.62, h: 0.8, variant: 1 }), -13.55, -9.86, 0, 0.95, { w: 0.7, d: 0.1 });
  b._static(createWallArt({ w: 0.62, h: 0.8, variant: 3 }), -7.0, -9.86, 0, 0.95, { w: 0.7, d: 0.1 });

  /* 3 lampu gantung di atas meja — interaktif. */
  [-1.5, 0, 1.5].forEach((dx, i) => {
    const lamp = createPendantLamp();
    b._static(lamp, cx + dx, cz, 0, WALL_H - 0.72);
    b._interactive(lamp, {
      id: `pendant-meeting-${i}`,
      label: "Lampu gantung rapat",
      hint: "Klik untuk nyala / mati",
      radius: 0.85,
      onClick: (self) => (self.userData.api.toggle() ? "Lampu rapat nyala" : "Lampu rapat mati"),
    });
  });

  b._plant(-15.35, -3.85, 0, { variant: 0, scale: 0.7, seed: 40 });
  b._plant(-6.05, -9.2, 0, { variant: 1, scale: 0.62, seed: 41 });
  b._static(createBin(), -8.8, -3.65, 0);
}
