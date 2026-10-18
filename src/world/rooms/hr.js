/* ===================================================================== *
 *  Human Resource — sayap timur-utara (x 7.1..16, z -3.1..1).
 *
 *  Layout:
 *    - meja kerja HR menghadap barat (menghadap pintu masuk), kursi di
 *      sisi timur meja → tamu langsung terlihat dari pintu
 *    - papan kebijakan People Ops di dinding masuk
 *    - sudut wawancara: meja bundar + 3 armchair di sisi timur
 *    - lemari arsip ×2 + rak dokumen, tanaman, bin
 *    - 1 HR manager (baju normal/warna, bukan hitam)
 *  Pintu ada di dinding barat x = 7.1 (z = -1.5), menghadap koridor U.
 * ===================================================================== */
import {
  createWorkstation,
  createWhiteboard,
  createWallArt,
  createCoffeeTable,
  createArmchair,
  createStorageCabinet,
  createBookshelf,
  createPendantLamp,
  createBin,
} from "../props.js";
import { WALL_H } from "../layout.js";

export function build(b) {
  /* ── Meja kerja HR ───────────────────────────────────────────────── */
  const ws = createWorkstation({ desk: { width: 1.85 } });
  b._place(ws, 9.6, -1.6, Math.PI / 2, 0, { w: 2.05, d: 1.25 });
  b._deskParts(ws, "hr-desk");
  b._deskChair(9.6, -1.6, Math.PI / 2, { color: "charcoal", type: "desk" });

  /* ── Papan kebijakan di dinding masuk (x = 7.1) ──────────────────── *
   *  Lebar 1.4 + digeser ke z = 0.2 supaya pintu HR (1.8 m, z -2.4..-0.6)
   *  benar-benar bebas. */
  const board = createWhiteboard({ w: 1.4, h: 1.0 });
  b._static(board, 7.25, 0.2, Math.PI / 2, 0.78, { w: 1.4, d: 0.16 });
  b._interactive(board, {
    id: "board-hr",
    label: "Papan kebijakan People Ops",
    hint: "Klik untuk melihat kebijakan",
    radius: 1.4,
    onClick: () => "Kebijakan: cuti tahunan · WFH kamis · review 1-on-1 📋",
  });

  /* ── Sudut wawancara (meja bundar + 3 armchair) ──────────────────── */
  b._static(createCoffeeTable({ r: 0.36 }), 13.9, -0.9, 0);
  const seatAngles = [
    [13.9, -2.2, 0],
    [12.5, -0.9, Math.PI / 2],
    [15.3, -0.9, -Math.PI / 2],
  ];
  for (const [x, z, ry] of seatAngles) {
    b._static(createArmchair({ color: "sand" }), x, z, ry);
    b._seat(x, z, ry, "lounge");
  }

  /* ── Arsip & dokumen ─────────────────────────────────────────────── */
  b._static(createStorageCabinet({ w: 0.85, h: 1.18, d: 0.36, color: "light" }), 11.8, -2.75, 0);
  b._static(createStorageCabinet({ w: 0.85, h: 1.18, d: 0.36, color: "wood" }), 15.4, -2.75, 0);
  b._static(
    createBookshelf({ width: 0.84, height: 1.52, depth: 0.28, shelves: 4 }),
    15.7, -1.9, -Math.PI / 2,
  );

  /* ── Decor + lampu ───────────────────────────────────────────────── */
  b._static(createWallArt({ w: 0.6, h: 0.78, variant: 2 }), 9.0, -2.98, 0, 0.9, { w: 0.68, d: 0.1 });
  b._static(createWallArt({ w: 0.55, h: 0.72, variant: 3 }), 13.0, -2.98, 0, 0.85, { w: 0.62, d: 0.1 });

  const lamp = createPendantLamp();
  b._static(lamp, 9.6, -1.6, 0, WALL_H - 0.72);
  b._interactive(lamp, {
    id: "pendant-hr",
    label: "Lampu meja HR",
    hint: "Klik untuk nyala / mati",
    radius: 0.8,
    onClick: (self) => (self.userData.api.toggle() ? "Lampu HR nyala" : "Lampu HR mati"),
  });

  b._plant(8.35, -2.72, 0, { variant: 2, scale: 0.6, seed: 77 });
  b._plant(15.5, 0.5, 0, { variant: 0, scale: 0.62, seed: 78 });
  b._static(createBin(), 8.4, 0.6, 0);

  /* ── HR Manager (baju normal — hitam hanya untuk Developer Room) ─── */
  b._spawnStaffCritter({
    id: "hr-manager",
    species: "people",
    name: "HR Manager",
    tieColor: 0xd66e91,
    department: { id: "hr", name: "Human Resource" },
    variant: 0,
    x: 11.4, z: -1.4, yaw: Math.PI,
    hotspotLabel: "HR Manager",
    hotspotHint: "Klik untuk tanya cuti & manfaat",
    hotspotMessage: "HR: review 1-on-1 minggu depan ya, dipersilakan siap-siap 📋",
    radius: 1.5,
    room: "hr",
    wanderRadius: 1.6,
    homeStatus: "Memproses cuti tim 📋",
  });
}
