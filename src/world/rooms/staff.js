/* ===================================================================== *
 *  Staff Room — sayap barat-utara (x -16..-7.1, z -3.1..3).
 *
 *  Layout:
 *    - pod open-plan: 2 baris × 3 workstation saling berhadapan
 *      (baris utara ry 0, baris selatan ry π) dengan kursi ergonomis
 *    - stasiun printer di pojok tenggara dekat pintu, lemari arsip di
 *      dinding barat, sofa huddle + side table di sudut barat daya
 *    - 2 sekat tanaman sebagai pembatas zona di dinding selatan
 *    - karakter TIDAK di-hard-code di sini (semua staf dari staff.json)
 *  Pintu ada di dinding timur x = -7.1 (z = -0.9), menghadap koridor U.
 * ===================================================================== */
import {
  createWorkstation,
  createPrinterStation,
  createStorageCabinet,
  createWallShelf,
  createWallArt,
  createClock,
  createSofa,
  createSideTable,
  createDivider,
  createBin,
} from "../props.js";

export function build(b) {
  /* ── Pod open-plan: 2 × 3 workstation ────────────────────────────── */
  const podXs = [-13.2, -11.55, -9.9];
  const rows = [
    { z: -1.9, ry: 0, color: "navy" },
    { z: 1.3, ry: Math.PI, color: "charcoal" },
  ];

  let idx = 0;
  for (const row of rows) {
    for (const x of podXs) {
      b._workBundle(createWorkstation({ desk: { width: 1.55 } }), {
        x, z: row.z, ry: row.ry,
        label: "Workstation staff",
        type: "desk",
        partsKey: `staff-${String.fromCharCode(97 + idx)}`,
        chairs: [{ face: "-z", color: row.color, type: "desk" }],
      });
      idx++;
    }
  }

  /* ── Zona kerja pendukung ────────────────────────────────────────── */
  const printer = createPrinterStation({ w: 0.9, h: 0.72, d: 0.58 });
  b._static(printer, -8.1, 2.3, Math.PI);
  b._interactive(printer, {
    id: "staff-printer",
    label: "Stasiun printer",
    hint: "Klik untuk mencetak",
    radius: 0.8,
    onClick: (self) => `Printer: ${self.userData.api.print()} dokumen tercetak 🖨️`,
  });

  /* Lemari arsip di dinding barat. */
  b._static(createStorageCabinet({ w: 0.85, h: 1.18, d: 0.36, color: "light" }), -15.75, -2.2, Math.PI / 2);
  b._static(createStorageCabinet({ w: 0.85, h: 1.18, d: 0.36, color: "wood" }), -15.75, -0.8, Math.PI / 2);

  /* ── Huddle nook (sudut barat daya) ──────────────────────────────── */
  const huddle = createSofa({ width: 1.6, depth: 0.78 });
  const huddleObj = b._static(huddle, -14.6, 1.9, Math.PI / 2, 0, { w: 1.7, d: 0.88 });
  b._softSeats({ x: -14.6, z: 1.9, ry: Math.PI / 2, width: 1.6, depth: 0.78, count: 3, owner: huddleObj });
  b._static(createSideTable({ w: 0.42, d: 0.38, h: 0.46 }), -14.6, 0.45, 0);

  /* 2 sekat tanaman sebagai pembatas zona di dinding selatan. */
  b._static(createDivider({ w: 1.6, h: 1.05 }), -12.6, 2.6, 0);
  b._static(createDivider({ w: 1.6, h: 1.05 }), -10.5, 2.6, 0);

  /* ── Decor dinding utara ─────────────────────────────────────────── */
  b._static(createWallShelf({ w: 1.0, d: 0.24, shelves: 2 }), -12.6, -2.90, 0, 1.35, { w: 1.04, d: 0.2 });
  b._static(createWallArt({ w: 0.62, h: 0.8, variant: 2 }), -10.4, -2.98, 0, 0.9, { w: 0.7, d: 0.1 });
  b._static(createClock(), -9.4, -2.98, 0, 2.0);

  b._plant(-8.4, -2.7, 0, { variant: 1, scale: 0.62, seed: 60 });
  b._plant(-15.4, 2.4, 0, { variant: 0, scale: 0.62, seed: 61 });
  b._static(createBin(), -8.5, 0.6, 0);

  /* Karakter TIDAK dibuat di sini — semua staf lahir dari staff.json
   * lewat modal Management Staf. Tidak ada NPC statis. */
}
