/* ===================================================================== *
 *  Developer Room — sayap timur utara (x 10..16.2, z -7..-1.05).
 *
 *  Layout presisi:
 *    - front dinding koridor di z = -1.05, door center x = 13.1
 *    - 3 workstation berderet menghadap dinding utara (z = -5.75)
 *    - lounge sudut timur + papan ritme di dinding timur (x ≈ 16)
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
  /* Workstation — 3 meja deret utara, kursi di sisi selatan meja */
  const devXs = [11.2, 12.9, 14.55];
  devXs.forEach((x, i) => {
    const ws = createWorkstation({ desk: { width: 1.75 } });
    b._place(ws, x, -5.75, 0, 0, { w: 1.8, d: 1.2 });
    b._deskParts(ws, `dev-${String.fromCharCode(97 + i)}`);
    b._deskChair(x, -5.75, 0, {
      color: i % 2 === 0 ? "navy" : "charcoal",
      gap: 0.78,
      type: "desk",
    });
  });

  /* Rak server-ish + lemari — pojok timur laut */
  b._static(
    createStorageCabinet({ w: 1.0, h: 1.5, d: 0.42, color: "light" }),
    15.8, -5.85, -Math.PI / 2,
  );
  b._static(
    createStorageCabinet({ w: 0.85, h: 1.18, d: 0.36, color: "wood" }),
    10.45, -2.0, Math.PI / 2,
  );

  /* Papan ritme engineering — dinding timur (face ke dalam room) */
  const devBoard = createWhiteboard({ w: 2.2, h: 1.0 });
  b._static(devBoard, 15.98, -3.6, -Math.PI / 2, 0.72, { w: 2.2, d: 0.16 });
  b._interactive(devBoard, {
    id: "board-developer",
    label: "Papan ritme engineering",
    hint: "Klik untuk melihat status release",
    radius: 1.4,
    onClick: () => "Status: build hijau · staging deploy → release Jumat 🚀",
  });

  /* Lounge sudut timur */
  b._static(createArmchair({ color: "olive" }), 14.95, -2.5, -Math.PI / 2);
  b._seat(14.95, -2.5, -Math.PI / 2, "lounge");
  b._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), 14.95, -3.45, 0);
  b._static(createFloorLamp(), 15.45, -1.6, 0);

  /* Decor di dinding utara */
  b._static(createWallShelf({ w: 0.9, d: 0.22, shelves: 2 }), 12.2, -6.82, 0, 1.08, { w: 0.9, d: 0.18 });
  b._static(createWallArt({ w: 0.62, h: 0.78, variant: 1 }), 13.3, -6.82, 0, 0.68, { w: 0.1, d: 0.78 });

  /* Lantai wood polos (senada Studio Kreatif) — tanpa karpet */

  b._plant(10.8, -6.2, 0, { variant: 1, scale: 0.66, seed: 91 });
  // Bin developer — pojok barat daya, jauh dari muka dinding koridor -1.12.
  b._static(createBin(), 10.75, -1.5, 0);

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
    x: 12.55, z: -3.35, yaw: 0.35,
    hotspotLabel: "Developer",
    hotspotHint: "Klik untuk tanya progres",
    hotspotMessage: "Developer: build hijau semua, aku push sekarang 💻",
    radius: 2.0,
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
    x: 13.95, z: -3.85, yaw: -0.5,
    hotspotLabel: "Dev Ops",
    hotspotHint: "Klik untuk tanya deploy",
    hotspotMessage: "Dev Ops: staging sudah deploy, tunggu release Jumat 🚀",
    radius: 2.0,
    room: "developer",
    homeStatus: "Ngawasin pipeline ⚙️",
  });
}
