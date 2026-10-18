/* ===================================================================== *
 *  Staff Room — 8 workstation (4 kolom × 2 baris) + printer & storage.
 * ===================================================================== */
import {
  createWorkstation,
  createPrinterStation,
  createStorageCabinet,
  createWallShelf,
  createWallArt,
  createBin,
} from "../props.js";

export function build(b) {
  const staffXs = [-1.85, 0.72, 3.28, 5.85];
  const staffRows = [
    { z: 2.7, ry: 0, color: "navy" },
    { z: 5.8, ry: Math.PI, color: "charcoal" },
  ];

  let staffIdx = 0;
  for (const row of staffRows) {
    for (const x of staffXs) {
      const ws = createWorkstation({ desk: { width: 1.75 } });
      b._place(ws, x, row.z, row.ry, 0, { w: 1.8, d: 1.2 });
      b._deskParts(ws, `staff-${String.fromCharCode(97 + staffIdx)}`);
      b._deskChair(x, row.z, row.ry, {
        color: staffIdx % 2 === 0 ? "navy" : "charcoal",
        gap: 1.05,
        type: "desk",
      });
      staffIdx++;
    }
  }

  const printer = createPrinterStation({ w: 0.72, h: 0.68, d: 0.5 });
  b._static(printer, 6.2, 1.5, -Math.PI / 2);
  b._interactive(printer, {
    id: "printer-staff", label: "Printer staff",
    hint: "Klik untuk mencetak dokumen", radius: 0.72,
    onClick: () => `Printer mencetak halaman #${printer.userData.api.print()}`,
  });

  b._static(
    createStorageCabinet({ w: 0.78, h: 1.18, d: 0.34, color: "light" }),
    -2.5, 1.5, Math.PI / 2,
  );

  b._static(createWallShelf({ w: 0.9, d: 0.22, shelves: 2 }), 0.4, 6.82, Math.PI, 1.08, { w: 0.9, d: 0.18 });
  b._static(createWallArt({ w: 0.55, h: 0.7, variant: 1 }), 3.5, 6.82, Math.PI, 0.63, { w: 0.62, d: 0.1 });
  b._plant(5.6, 6.5, 0, { variant: 1, scale: 0.62, seed: 61 });
  // Bin staff — pojok barat daya.
  b._static(createBin(), -2.7, 6.5, 0);
}
