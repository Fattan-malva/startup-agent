/* ===================================================================== *
 *  Developer Room — pojok timur laut (x 16..25.6, z -7..-1.05).
 *
 *  Layout presisi:
 *    - sekat barat x = 16 (Studio), front koridor z = -1.05,
 *      door center x = 20.8, dinding timur x = 25.6
 *    - 3 workstation benching (desk 1.55) berderet menghadap utara,
 *      dipusatkan di x = 20.8 senada pintu
 *    - papan ritme + lounge di dinding timur, rak server di pojok
 *      timur laut, decor utara sejajar meja
 *    - lantai wood senada Studio Kreatif, tanpa karpet
 *    - Staff di room ini HANYA yang berbaju hitam (species "staff",
 *      outfit hitam di character/species.js) dengan aksen gelap.
 * ===================================================================== */
import {
  createWorkstation,
  createWhiteboard,
  createWallArt,
  createWallShelf,
  createStorageCabinet,
  createArmchair,
  createSideTable,
  createFloorLamp,
  createBin,
} from "../props.js";

export function build(b) {
  /* Workstation — benching 3 meja (1.55 m) menghadap dinding utara,
   * dipusatkan di 20.8 = tepat di depan pintu developer. */
  const devXs = [19.0, 20.8, 22.6];
  devXs.forEach((x, i) => {
    const ws = createWorkstation({ desk: { width: 1.55 } });
    b._place(ws, x, -5.75, 0, 0, { w: 1.55, d: 1.2 });
    b._deskParts(ws, `dev-${String.fromCharCode(97 + i)}`);
    b._deskChair(x, -5.75, 0, {
      color: i % 2 === 0 ? "navy" : "charcoal",
      gap: 1.05,
      type: "desk",
    });
  });

  /* Rak server-ish — dinding timur dekat sudut; lemari wood di barat */
  b._static(
    createStorageCabinet({ w: 1.0, h: 1.5, d: 0.42, color: "light" }),
    24.2, -6.6, 0,
  );
  b._static(
    createStorageCabinet({ w: 0.85, h: 1.18, d: 0.36, color: "wood" }),
    17.05, -3.0, Math.PI / 2,
  );

  /* Papan ritme engineering — dinding timur (face ke dalam room) */
  const devBoard = createWhiteboard({ w: 2.2, h: 1.0 });
  b._static(devBoard, 24.5, -3.6, -Math.PI / 2, 0.72, { w: 2.2, d: 0.16 });
  b._interactive(devBoard, {
    id: "board-developer",
    label: "Papan ritme engineering",
    hint: "Klik untuk melihat status release",
    radius: 1.4,
    onClick: () => "Status: build hijau · staging deploy → release Jumat 🚀",
  });

  /* Lounge sudut timur */
  b._static(createArmchair({ color: "olive" }), 23.7, -2.5, -Math.PI / 2);
  b._seat(23.7, -2.5, -Math.PI / 2, "lounge");
  b._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), 23.7, -3.45, 0);
  b._static(createFloorLamp(), 24.4, -1.7, 0);

  /* Decor di dinding utara */
  b._static(createWallShelf({ w: 0.9, d: 0.22, shelves: 2 }), 20.0, -6.82, 0, 1.08, { w: 0.9, d: 0.18 });
  b._static(createWallArt({ w: 0.62, h: 0.78, variant: 1 }), 21.6, -6.82, 0, 0.68, { w: 0.68, d: 0.1 });

  /* Lantai wood polos (senada Studio Kreatif) — tanpa karpet */

  b._plant(18.1, -6.55, 0, { variant: 1, scale: 0.66, seed: 91 });
  // Bin developer — pojok barat, di luar lane door (x 20.15..21.45).
  b._static(createBin(), 17.05, -1.5, 0);

  /* ── STAFF DEVELOPER ROOM — wajib hitam total ────────────────────── *
   *  species "staff" = outfit 0x101218 + celana 0x0a0c10 (hitam);      *
   *  aksen (tie/badge) juga dibuat gelap supaya tidak ada warna lain. *
   * ───────────────────────────────────────────────────────────────── */
  b._spawnStaffCritter({
    id: "dev-senior",
    species: "staff",
    name: "Developer",
    tieColor: 0x11151c,
    department: { id: "developer", name: "Developer Room" },
    variant: 0,
    x: 20.4, z: -3.3, yaw: 0.35,
    hotspotLabel: "Developer",
    hotspotHint: "Klik untuk tanya progres",
    hotspotMessage: "Developer: build hijau semua, aku push sekarang 💻",
    radius: 1.6,
    room: "developer",
    homeStatus: "Coding fitur 💻",
  });
  b._spawnStaffCritter({
    id: "dev-ops",
    species: "staff",
    name: "Dev Ops",
    tieColor: 0x0d1117,
    department: { id: "developer", name: "Developer Room" },
    variant: 2,
    x: 21.9, z: -3.9, yaw: -0.5,
    hotspotLabel: "Dev Ops",
    hotspotHint: "Klik untuk tanya deploy",
    hotspotMessage: "Dev Ops: staging sudah deploy, tunggu release Jumat 🚀",
    radius: 1.6,
    room: "developer",
    homeStatus: "Ngawasin pipeline ⚙️",
  });
}
