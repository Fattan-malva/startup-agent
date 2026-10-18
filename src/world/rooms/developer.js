/* ===================================================================== *
 *  Developer Room — sayap timur-selatan (x 7.1..16, z 5..9).
 *
 *  Layout:
 *    - 4 workstation benching berderet menghadap utara (menghadap
 *      dinding glass Studio|Developer), kursi ergonomis
 *    - meja tinggi berdiri (standing table) + rak server di dinding
 *      selatan, papan ritme engineering di dinding timur
 *    - panel akustik di dinding utara, nook lounge (armchair + side
 *      table + lampu lantai) di sudut barat daya
 *    - Staff di room ini HANYA yang berbaju hitam (species "staff")
 *  Pintu ada di dinding barat x = 7.1 (z = 7), menghadap koridor U.
 * ===================================================================== */
import {
  createWorkstation,
  createMeetingTable,
  createWhiteboard,
  createWallArt,
  createAcousticPanel,
  createStorageCabinet,
  createArmchair,
  createSideTable,
  createFloorLamp,
  createBin,
} from "../props.js";

export function build(b) {
  /* ── 4 workstation benching (baris digeser sedikit ke utara supaya jalur
   *    selatan di belakang kursi tetap tersambung, tidak jadi kantong) ── */
  const devXs = [9.4, 11.0, 12.6, 14.2];
  devXs.forEach((x, i) => {
    const ws = createWorkstation({ desk: { width: 1.5 } });
    b._place(ws, x, 6.15, 0, 0, { w: 1.5, d: 1.2 });
    b._deskParts(ws, `dev-${String.fromCharCode(97 + i)}`);
    b._deskChair(x, 6.15, 0, { color: i % 2 === 0 ? "navy" : "charcoal", type: "desk", desk: ws });
  });

  /* ── Meja tinggi berdiri + rak server ────────────────────────────── */
  b._static(
    createMeetingTable({ w: 1.4, d: 0.8, h: 1.05 }),
    13.6, 8.4, 0, 0, { w: 1.4, d: 0.8 },
  );
  b._static(
    createStorageCabinet({ w: 1.0, h: 1.5, d: 0.42, color: "light" }),
    15.35, 8.4, 0,
  );

  /* ── Papan ritme engineering di dinding timur ────────────────────── */
  const board = createWhiteboard({ w: 1.6, h: 0.95 });
  b._static(board, 15.83, 6.6, -Math.PI / 2, 0.78, { w: 1.6, d: 0.16 });
  b._interactive(board, {
    id: "board-developer",
    label: "Papan ritme engineering",
    hint: "Klik untuk melihat status release",
    radius: 1.4,
    onClick: () => "Status: build hijau · staging deploy → release Jumat 🚀",
  });

  /* ── Panel akustik + lukisan ─────────────────────────────────────── */
  b._static(createAcousticPanel({ w: 0.52, h: 0.86, color: "navy" }), 9.4, 5.2, 0, 0.85, { w: 0.6, d: 0.1 });
  b._static(createAcousticPanel({ w: 0.52, h: 0.86, color: "rust" }), 11.0, 5.2, 0, 0.85, { w: 0.6, d: 0.1 });
  b._static(createWallArt({ w: 0.6, h: 0.78, variant: 1 }), 11.0, 8.86, Math.PI, 0.9, { w: 0.68, d: 0.1 });

  /* ── Nook lounge di tengah dinding selatan (menghadap utara) ──────── */
  const arm = createArmchair({ color: "olive" });
  b._static(arm, 9.9, 8.45, Math.PI);
  b._seat(9.9, 8.45, Math.PI, "lounge");
  b._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), 11.1, 8.55, 0);
  b._static(createFloorLamp(), 8.3, 5.5, 0);

  b._plant(15.5, 5.6, 0, { variant: 1, scale: 0.62, seed: 91 });
  b._plant(7.7, 8.6, 0, { variant: 0, scale: 0.6, seed: 92 });
  b._static(createBin(), 7.6, 5.5, 0);

  /* ── STAFF DEVELOPER — wajib hitam total ─────────────────────────── *
   *  species "staff" = outfit 0x101218 + celana 0x0a0c10 (hitam);      *
   *  aksen (tie/badge) juga gelap supaya tidak ada warna lain.         *
   * ───────────────────────────────────────────────────────────────── */
  b._spawnStaffCritter({
    id: "dev-senior",
    species: "staff",
    name: "Developer",
    tieColor: 0x11151c,
    department: { id: "developer", name: "Developer Room" },
    variant: 0,
    x: 10.4, z: 8.3, yaw: 0.35,
    hotspotLabel: "Developer",
    hotspotHint: "Klik untuk tanya progres",
    hotspotMessage: "Developer: build hijau semua, aku push sekarang 💻",
    radius: 1.6,
    room: "developer",
    seatType: "desk",
    wanderRadius: 2.0,
    homeStatus: "Coding fitur 💻",
  });
  b._spawnStaffCritter({
    id: "dev-ops",
    species: "staff",
    name: "Dev Ops",
    tieColor: 0x0d1117,
    department: { id: "developer", name: "Developer Room" },
    variant: 2,
    x: 12.3, z: 8.5, yaw: -0.5,
    hotspotLabel: "Dev Ops",
    hotspotHint: "Klik untuk tanya deploy",
    hotspotMessage: "Dev Ops: staging sudah deploy, tunggu release Jumat 🚀",
    radius: 1.6,
    room: "developer",
    wanderRadius: 2.0,
    homeStatus: "Ngawasin pipeline ⚙️",
  });
}
