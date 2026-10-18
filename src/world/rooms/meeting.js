/* ===================================================================== *
 *  Ruang Meeting — meja rapat utama, kursi tip "meeting" untuk klaim
 *  rapat (Building.claimSeat dibatasi ke ruangan ini).
 * ===================================================================== */
import {
  createMeetingTable,
  createOfficeChair,
  createWhiteboard,
  createWallArt,
  createStorageCabinet,
  createBin,
  createPendantLamp,
} from "../props.js";
import { WALL_H } from "../layout.js";

export function build(b) {
  const mcx = -5.5;
  const mcz = -3.9;

  b._static(
    createMeetingTable({ w: 4.8, d: 1.2, h: 0.75 }),
    mcx, mcz, 0, 0, { w: 4.8, d: 1.2 },
  );

  const sideSeatXs = [-1.92, -0.96, 0, 0.96, 1.92];
  for (const dz of [-0.9, 0.9]) {
    const yaw = dz > 0 ? Math.PI : 0;
    for (let i = 0; i < sideSeatXs.length; i++) {
      const dx = sideSeatXs[i];
      const color = (i + (dz > 0 ? 1 : 0)) % 2 === 0 ? "navy" : "charcoal";
      b._static(createOfficeChair({ color }), mcx + dx, mcz + dz, yaw);
      b._seat(mcx + dx, mcz + dz, yaw, "meeting");
    }
  }

  const headX = mcx + 2.4 + 0.65;
  const headYaw = -Math.PI / 2;
  b._static(createOfficeChair({ color: "charcoal" }), headX, mcz, headYaw);
  b._seat(headX, mcz, headYaw, "meeting");

  const board = createWhiteboard({ w: 2.4, h: 1.1 });
  b._static(board, mcx, -6.78, 0, 0.72, { w: 2.5, d: 0.16 });
  b._interactive(board, {
    id: "board-meeting", label: "Papan agenda meeting",
    hint: "Klik untuk melihat agenda", radius: 1.5,
    onClick: () => "Agenda: prioritas sprint · desain produk · evaluasi rilis",
  });

  b._static(createWallArt({ w: 0.7, h: 0.9, variant: 2 }), -8.6, -6.78, 0, 0.7, { w: 0.8, d: 0.1 });
  b._static(createWallArt({ w: 0.7, h: 0.9, variant: 4 }), -2.4, -6.78, 0, 0.7, { w: 0.8, d: 0.1 });

  b._static(createStorageCabinet({ w: 1.0, h: 1.1, d: 0.4, color: "wood" }), -9.4, -5.8, Math.PI / 2);
  b._static(createStorageCabinet({ w: 1.0, h: 1.1, d: 0.4, color: "light" }), -9.4, -2.0, Math.PI / 2);

  b._plant(-9.2, -1.5, 0, { variant: 1, scale: 0.7, seed: 31 });
  // Bin meeting — pojok tenggara (jauh dari muka dinding koridor -1.12).
  b._static(createBin(), -1.2, -1.45, 0);

  const pendantA = createPendantLamp();
  const pendantB = createPendantLamp();
  const pendantC = createPendantLamp();
  // kord lampu 0.7 m — pas sampai plafon (WALL_H)
  b._static(pendantA, mcx - 1.5, mcz, 0, WALL_H - 0.7);
  b._static(pendantB, mcx, mcz, 0, WALL_H - 0.7);
  b._static(pendantC, mcx + 1.5, mcz, 0, WALL_H - 0.7);
  b._interactive(pendantA, { id: "pendant-meeting-a", label: "Lampu rapat A", hint: "Klik untuk nyala / mati", radius: 0.75, onClick: (self) => self.userData.api.toggle() ? "Lampu A nyala" : "Lampu A mati" });
  b._interactive(pendantB, { id: "pendant-meeting-b", label: "Lampu rapat B", hint: "Klik untuk nyala / mati", radius: 0.75, onClick: (self) => self.userData.api.toggle() ? "Lampu B nyala" : "Lampu B mati" });
  b._interactive(pendantC, { id: "pendant-meeting-c", label: "Lampu rapat C", hint: "Klik untuk nyala / mati", radius: 0.75, onClick: (self) => self.userData.api.toggle() ? "Lampu C nyala" : "Lampu C mati" });
}
