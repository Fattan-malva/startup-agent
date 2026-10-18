/* ===================================================================== *
 *  CEO Room — meja eksekutif sudut tenggara, lounge privat, dokumen.
 * ===================================================================== */
import {
  createWorkstation,
  createSofa,
  createCoffeeTable,
  createArmchair,
  createStorageCabinet,
  createBookshelf,
  createWallArt,
  createBin,
} from "../props.js";

export function build(b) {
  const execDesk = createWorkstation();
  b._place(execDesk, 8.35, 2.65, Math.PI / 2, 0, { w: 2.05, d: 1.25 });
  b._deskParts(execDesk, "ceo-desk");
  b._deskChair(8.35, 2.65, Math.PI / 2, { color: "charcoal", gap: 0.78, type: "ceo" });

  b._static(createSofa({ width: 1.42, depth: 0.72 }), 7.85, 5.85, Math.PI);
  b._seat(7.85, 5.85, Math.PI, "lounge");
  b._static(createCoffeeTable({ r: 0.29 }), 7.85, 4.72, 0);
  b._static(createArmchair({ color: "navy" }), 9.0, 4.95, -Math.PI / 2);
  b._seat(9.0, 4.95, -Math.PI / 2, "lounge");

  b._static(createStorageCabinet({ w: 0.82, h: 1.18, d: 0.34, color: "wood" }), 9.52, 1.5, Math.PI / 2);
  b._static(createBookshelf({ width: 0.84, height: 1.52, depth: 0.28, shelves: 4 }), 9.52, 6.15, Math.PI / 2);
  b._static(createWallArt({ w: 0.55, h: 0.72, variant: 4 }), 8.5, 6.82, Math.PI, 0.64, { w: 0.1, d: 0.72 });
  b._plant(7.35, 6.6, 0, { variant: 2, scale: 0.64, seed: 70 });
  // Bin CEO — pojok barat daya, jauh dari pintu (door di x=8.5).
  b._static(createBin(), 7.3, 1.45, 0);
}
