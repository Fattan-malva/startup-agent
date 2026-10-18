/* ===================================================================== *
 *  Human Resource — sayap timur selatan (x 10..14.6, z 1.05..7).
 *
 *  Layout presisi:
 *    - door di dinding timur (x = 14.6, z center 1.95) — dijangkau lewat
 *      belok koridor arm timur (koridor utama → timur → selatan)
 *    - meja kerja HR menghadap barat (door di seberangnya)
 *    - sudut wawancara (sofa + armchair + coffee table) di selatan
 *    - papan kebijakan di dinding utara (muka koridor z = 1.12)
 * ===================================================================== */
import {
  createWorkstation,
  createWhiteboard,
  createWallArt,
  createSofa,
  createCoffeeTable,
  createArmchair,
  createStorageCabinet,
  createBookshelf,
  createBin,
} from "../props.js";

export function build(b) {
  /* Meja kerja HR — menghadap barat, kursi di sisi timur meja */
  const ws = createWorkstation();
  b._place(ws, 11.6, 2.7, Math.PI / 2, 0, { w: 2.05, d: 1.25 });
  b._deskParts(ws, "hr-desk");
  b._deskChair(11.6, 2.7, Math.PI / 2, { color: "charcoal", gap: 0.78, type: "desk" });

  /* Papan kebijakan — dinding utara (di atas muka dinding z=1.12) */
  const hrBoard = createWhiteboard({ w: 1.7, h: 0.95 });
  b._static(hrBoard, 11.6, 1.22, 0, 0.72, { w: 1.7, d: 0.16 });
  b._interactive(hrBoard, {
    id: "board-hr",
    label: "Papan kebijakan People Ops",
    hint: "Klik untuk melihat kebijakan",
    radius: 1.4,
    onClick: () => "Kebijakan: cuti tahunan · WFH kamis · review 1-on-1 📋",
  });

  /* Sudut wawancara — sisi selatan */
  b._static(createSofa({ width: 1.72, depth: 0.78 }), 12.4, 5.95, Math.PI);
  b._seat(12.4, 5.95, Math.PI, "lounge");
  b._static(createCoffeeTable({ r: 0.32 }), 12.4, 4.72, 0);
  b._static(createArmchair({ color: "sand" }), 13.5, 4.95, -Math.PI / 2);
  b._seat(13.5, 4.95, -Math.PI / 2, "lounge");

  /* Storage & rak dokumen — sisi barat */
  b._static(
    createStorageCabinet({ w: 0.78, h: 1.18, d: 0.34, color: "light" }),
    10.45, 1.95, Math.PI / 2,
  );
  b._static(
    createBookshelf({ width: 0.84, height: 1.52, depth: 0.28, shelves: 4 }),
    12.7, 6.6, 0,
  );

  /* Decor */
  b._static(createWallArt({ w: 0.55, h: 0.72, variant: 2 }), 13.3, 1.22, 0, 0.64, { w: 0.1, d: 0.72 });
  b._plant(13.75, 6.35, 0, { variant: 2, scale: 0.62, seed: 77 });
  b._plant(10.6, 5.6, 0, { variant: 0, scale: 0.6, seed: 78 });
  // Bin HR — pojok barat laut, jauh dari door (door z≈1.95 di timur).
  b._static(createBin(), 10.7, 1.5, 0);

  /* ── STAFF HR — baju normal (bukan hitam; hitam khusus Developer) ── */
  b._spawnStaffCritter({
    id: "hr-manager",
    species: "people",
    name: "HR Manager",
    tieColor: 0xd66e91,
    department: { id: "hr", name: "Human Resource" },
    variant: 0,
    x: 12.35, z: 3.6, yaw: 0,
    hotspotLabel: "HR Manager",
    hotspotHint: "Klik untuk tanya cuti & manfaat",
    hotspotMessage: "HR: review 1-on-1 minggu depan ya, dipersilakan siap-siap 📋",
    radius: 1.8,
    room: "hr",
    homeStatus: "Memproses cuti tim 📋",
  });
}
