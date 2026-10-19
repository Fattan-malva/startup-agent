/* ===================================================================== *
 *  rooms/index.js — katalog modul per ruangan.
 *
 *  Cara menambah ruangan baru:
 *    1. buat file src/world/rooms/<id>.js dan export function build(b)
 *       (b = instance Building: b._static / b._place / b._seat /
 *        b._workBundle (meja+kursi = satu perabot) / b._plant /
 *        b._interactive / b._deskParts / b._splitLive …)
 *    2. daftarkan room di src/world/layout.js  (ROOMS + WALLS + ANCHORS)
 *    3. tambahkan modulnya ke ROOM_MODULES di sini
 *
 *  Furniture per-room penuh ada di masing-masing file, Building tidak
 *  lagi menampung kode per-ruangan.
 * ===================================================================== */
import { build as buildMeeting } from "./meeting.js";
import { build as buildCafe } from "./cafe.js";
import { build as buildStudio } from "./studio.js";
import { build as buildDeveloper } from "./developer.js";
import { build as buildLobby } from "./lobby.js";
import { build as buildStaff } from "./staff.js";
import { build as buildHr } from "./hr.js";
import { build as buildCeo } from "./ceo.js";
import { build as buildCourtyard } from "./courtyard.js";
import { build as buildCorridor } from "./corridor.js";

/** Urutan membangun: urut saja — antar-ruangan tidak saling bergantung. */
export const ROOM_MODULES = [
  buildMeeting,
  buildCafe,
  buildStudio,
  buildDeveloper,
  buildLobby,
  buildStaff,
  buildHr,
  buildCeo,
  buildCourtyard,
  buildCorridor,
];

/** Pasang seluruh furniture semua ruangan ke building. */
export function furnishRooms(b) {
  for (const module of ROOM_MODULES) module(b);
}
