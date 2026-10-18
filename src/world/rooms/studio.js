/* ===================================================================== *
 *  Studio Kreatif — meja ide, papan moodboard, lounge lampu lantai.
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
  b._static(
    createMeetingTable({ w: 2.8, d: 1.3, h: 0.75 }),
    6.35, -3.55, 0, 0, { w: 2.8, d: 1.3 },
  );

  const studioSeatXs = [5.25, 7.45];
  for (const dz of [-0.82, 0.82]) {
    const yaw = dz > 0 ? Math.PI : 0;
    for (const x of studioSeatXs) {
      b._static(
        createOfficeChair({ color: dz > 0 ? "charcoal" : "navy" }),
        x, -3.55 + dz, yaw,
      );
      b._seat(x, -3.55 + dz, yaw, "meeting");
    }
  }

  const studioBoard = createWhiteboard({ w: 2.2, h: 1.0 });
  b._static(studioBoard, 6.35, -6.78, 0, 0.72, { w: 2.3, d: 0.16 });
  b._interactive(studioBoard, {
    id: "board-studio",
    label: "Papan ide studio",
    hint: "Klik untuk melihat moodboard",
    radius: 1.4,
    onClick: () => "Moodboard: eksplorasi warna, material, dan konsep kampanye",
  });

  b._static(createAcousticPanel({ w: 0.52, h: 0.86, color: "sage" }), 4.2, -6.78, 0, 0.7, { w: 0.6, d: 0.1 });
  b._static(createAcousticPanel({ w: 0.52, h: 0.86, color: "rust" }), 8.5, -6.78, 0, 0.7, { w: 0.6, d: 0.1 });

  b._static(
    createStorageCabinet({ w: 0.85, h: 1.18, d: 0.36, color: "light" }),
    3.45, -2.0, Math.PI / 2,
  );
  b._static(
    createBookshelf({ width: 0.9, height: 1.55, depth: 0.3, shelves: 4 }),
    9.45, -3.2, -Math.PI / 2,
  );

  b._static(createArmchair({ color: "olive" }), 8.55, -1.75, -Math.PI / 2);
  b._seat(8.55, -1.75, -Math.PI / 2, "lounge");
  b._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), 9.45, -1.75, 0);
  b._static(createFloorLamp(), 9.45, -5.8, 0);

  const studioRug = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.8), MAT.rug);
  studioRug.rotation.x = -Math.PI / 2;
  studioRug.position.set(6.35, 0.014, -3.55);
  studioRug.receiveShadow = true;
  b.staticGroup.add(studioRug);

  b._plant(3.55, -6.2, 0, { variant: 1, scale: 0.68, seed: 88 });
  b._plant(9.35, -6.25, 0, { variant: 0, scale: 0.62, seed: 89 });
  b._static(createWallArt({ w: 0.62, h: 0.78, variant: 2 }), 9.78, -4.8, -Math.PI / 2, 0.68, { w: 0.1, d: 0.78 });
  // Bin studio — pojok barat laut (jauh dari muka dinding koridor -1.12).
  b._static(createBin(), 3.5, -1.45, 0);
}
