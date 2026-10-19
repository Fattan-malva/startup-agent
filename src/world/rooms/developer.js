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
 *    - karakter TIDAK di-hard-code di sini (semua staf dari staff.json)
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
   *    selatan di belakang kursi tetap tersambung, tidak jadi kantong).
   *    Tiap meja + kursinya = SATU perabot dengan SATU petak lewat
   *    `_workBundle`; jarak kursi ke TEPI meja seragam di seluruh gedung. ── */
  const devXs = [9.4, 11.0, 12.6, 14.2];
  devXs.forEach((x, i) => {
    b._workBundle(createWorkstation({ desk: { width: 1.5 } }), {
      x, z: 6.15, ry: 0,
      label: "Workstation developer",
      type: "desk",
      partsKey: `dev-${String.fromCharCode(97 + i)}`,
      chairs: [
        { face: "-z", color: i % 2 === 0 ? "navy" : "charcoal", type: "desk" },
      ],
    });
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

  /* Karakter TIDAK dibuat di sini. Semua staf lahir dari data
   * src/data/staff.json lewat modal Management Staf, jadi tidak ada
   * satu pun karakter statis/hard-coded di dunia. */
}
