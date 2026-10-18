/*
 * Open-plan office, tapak TIDAK persegi panjang (notch sudut tenggara).
 * Blok utama x -10..10, ekspansi timur sampai x 25.6. Koridor utama z
 * -1.05..1.05 lurus ke timur, lalu BELOK ke selatan menjadi arm koridor
 * x 23.8..25.6 (z 1.05..5.8) yang melayani door Human Resource.
 *
 * Prinsip: TIDAK ADA ruangan yang menyempit dari layout lama — semua
 * pelebaran dibayar dengan memperluas dunia.
 *
 * Denah (utara & selatan sama-sama 35.6 m):
 *   utara : Meeting(-10..-1) | Cafe(-1..9)    | Studio(9..16)  | Developer(16..25.6)
 *   selatan: Lobby(-10..-3)  | Staff(-3..7)  | CEO(7..15.4)   | HR(15.4..23.8)
 * Sekat kaca: Cafe|Meeting (x=-1), Cafe|Studio (x=9), Staff|CEO (x=7),
 * CEO|HR (x=15.4) — ruangan sebelah terlihat satu sama lain.
 */
export const BOUNDS = { x0: -10, x1: 25.6, z0: -7, z1: 7 };
// Tapak gedung: kotak besar MINUS notch (sudut tenggara di belakang arm
// koridor tidak dibangun → tapak L, bukan persegi panjang).
export const FLOOR_POLYGON = [
  [-10, -7], [25.6, -7], [25.6, 5.8], [23.8, 5.8], [23.8, 7], [-10, 7],
];
export const WALL_H = 2.4;
// Tinggi bukaan pintu (lintel) — semua door otomatis mengikuti konstanta ini.
export const DOOR_H = 1.75;
export const WALL_T = 0.14;
// Koridor lebar nominal 2.1 m (muka-ke-muka ±1.96). Semua boundary
// (room, partition, sign) mengacu ke z = ±1.05 ini.
export const CORRIDOR_Z = { z0: -1.05, z1: 1.05 };

export const WALLS = [
  // Exterior walls — sisi utara (campuran tembok & kaca tetap dari lama).
  { x1: -10, z1: -7, x2: -5, z2: -7, mat: "wall" },
  { x1: -5, z1: -7, x2: -1, z2: -7, mat: "glass" },
  { x1: -1, z1: -7, x2: 4, z2: -7, mat: "wall" }, // dinding TV cafe — warna seragam
  { x1: 4, z1: -7, x2: 8, z2: -7, mat: "glass" },
  { x1: 8, z1: -7, x2: 25.6, z2: -7, mat: "wall" },
  // Exterior timur (sampai z 5.8 — di bawahnya adalah notch).
  { x1: 25.6, z1: -7, x2: 25.6, z2: 5.8, mat: "wall" },
  // Notch sudut tenggara: tutup arm koridor di z 5.8, lalu turun ke z 7.
  { x1: 25.6, z1: 5.8, x2: 23.8, z2: 5.8, mat: "wall" },
  { x1: 23.8, z1: 5.8, x2: 23.8, z2: 7, mat: "wall" },
  // Exterior selatan.
  { x1: 23.8, z1: 7, x2: -10, z2: 7, mat: "wall" },
  // Main entrance on the west wall, aligned with the lobby reception.
  { x1: -10, z1: -7, x2: -10, z2: 7, mat: "wall", doors: [{ at: 11.5, w: 1.55 }] },

  // North room fronts — door: meeting x=-6.5, cafe x=1.5, studio x=12.5, developer x=20.8.
  {
    x1: -10, z1: -1.05, x2: 25.6, z2: -1.05, mat: "wall", doors: [
      { at: 3.5, w: 1.3 },   // meeting (-6.5)
      { at: 11.5, w: 1.3 },  // cafe (1.5)
      { at: 22.5, w: 1.3 },  // studio kreatif (12.5)
      { at: 30.8, w: 1.3 },  // developer (20.8)
    ]
  },
  // South room fronts — door: lobby x=-6.5, staff x=0, CEO x=9.5.
  {
    x1: -10, z1: 1.05, x2: 23.8, z2: 1.05, mat: "wall", doors: [
      { at: 3.5, w: 1.3 },   // lobby (-6.5)
      { at: 10, w: 1.3 },    // staff (0)
      { at: 19.5, w: 1.3 },  // CEO (9.5)
    ]
  },

  // Dinding timur HR + door arm koridor (z=1.95). Segmen 1.05..5.8
  // memisahkan HR dari arm; segmen 5.8..7 ditangani satu kali oleh
  // dinding muka notch di atas agar tidak ada dua tembok bertumpuk.
  { x1: 23.8, z1: 1.05, x2: 23.8, z2: 5.8, mat: "wall", doors: [{ at: 0.9, w: 1.3 }] },

  // Sekat KACA utara — Cafe|Meeting (x=-1) dan Cafe|Studio (x=9):
  // ESPRIT terbuka, ruangan sebelah terlihat — TIDAK menyempitkan siapa pun.
  { x1: -1, z1: -7, x2: -1, z2: -1.05, mat: "glass" },
  { x1: 9, z1: -7, x2: 9, z2: -1.05, mat: "glass" },
  // Sekat biasa Studio|Developer.
  { x1: 16, z1: -7, x2: 16, z2: -1.05, mat: "wall" },

  // Sekat Lobby|Staff (x=-3) — warna sama dengan tembok lain (bukan sage).
  { x1: -3, z1: 1.05, x2: -3, z2: 7, mat: "wall" },
  // Sekat KACA selatan — Staff|CEO (x=7) dan CEO|HR (x=15.4); CEO dilebarkan.
  { x1: 7, z1: 1.05, x2: 7, z2: 7, mat: "glass" },
  { x1: 15.4, z1: 1.05, x2: 15.4, z2: 7, mat: "glass" },
];

export const ROOMS = [
  {
    id: "meeting", name: "Ruang Meeting",
    // lebar ASLI dipertahankan (9 m) — tidak ada yang menyempit
    x0: -10, z0: -7, x1: -1, z1: -1.05, floor: "carpet",
    polygon: [[-10, -7], [-1, -7], [-1, -1.05], [-10, -1.05]],
  },
  {
    id: "cafe", name: "Cafe",
    // selebar Staff Room (10 m) — sekat kaca di kedua sisi;
    // lantai terrazzo senada Lobby (permintaan).
    x0: -1, z0: -7, x1: 9, z1: -1.05, floor: "terrazzo",
    polygon: [[-1, -7], [9, -7], [9, -1.05], [-1, -1.05]],
  },
  {
    id: "studio", name: "Studio Kreatif",
    // lebar asli dipertahankan (7 m)
    x0: 9, z0: -7, x1: 16, z1: -1.05, floor: "wood",
    polygon: [[9, -7], [16, -7], [16, -1.05], [9, -1.05]],
  },
  {
    id: "developer", name: "Developer Room",
    // ikut membesar (9.6 m); lantai wood senada Studio Kreatif
    x0: 16, z0: -7, x1: 25.6, z1: -1.05, floor: "wood",
    polygon: [[16, -7], [25.6, -7], [25.6, -1.05], [16, -1.05]],
  },
  {
    id: "lobby", name: "Lobby",
    x0: -10, z0: 1.05, x1: -3, z1: 7, floor: "terrazzo",
    polygon: [[-10, 1.05], [-3, 1.05], [-3, 7], [-10, 7]],
  },
  {
    id: "staff", name: "Staff Room",
    x0: -3, z0: 1.05, x1: 7, z1: 7, floor: "carpet",
    polygon: [[-3, 1.05], [7, 1.05], [7, 7], [-3, 7]],
  },
  {
    id: "ceo", name: "CEO Room",
    // selebar HR sekarang (8.4 m) — kantor eksekutif mewah,
    // sekat kaca dengan Staff & HR
    x0: 7, z0: 1.05, x1: 15.4, z1: 7, floor: "carpet",
    polygon: [[7, 1.05], [15.4, 1.05], [15.4, 7], [7, 7]],
  },
  {
    id: "hr", name: "Human Resource",
    // 8.4 m (lebar tetap, bergeser ke timur); door dari arm koridor
    // belok (x 23.8, z 1.95)
    x0: 15.4, z0: 1.05, x1: 23.8, z1: 7, floor: "terrazzo",
    polygon: [[15.4, 1.05], [23.8, 1.05], [23.8, 7], [15.4, 7]],
  },
];

// Anchor corridor points sit directly in front of their matching doorways.
export const ROOM_ANCHORS = {
  lobby: { inside: { x: -6.7, z: 4.2 }, corridor: { x: -6.5, z: 0 } },
  meeting: { inside: { x: -6.5, z: -1.7 }, corridor: { x: -6.5, z: 0 } },
  cafe: { inside: { x: 1.5, z: -1.7 }, corridor: { x: 1.5, z: 0 } },
  studio: { inside: { x: 12.5, z: -1.7 }, corridor: { x: 12.5, z: 0 } },
  developer: { inside: { x: 20.8, z: -1.75 }, corridor: { x: 20.8, z: 0 } },
  // koridor utama → arm timur (belok selatan) → door HR di x=23.8, z=1.95
  hr: { inside: { x: 21.5, z: 2.4 }, corridor: { x: 24.7, z: 1.95 } },
  staff: { inside: { x: 0.0, z: 1.75 }, corridor: { x: 0.0, z: 0 } },
  ceo: { inside: { x: 9.5, z: 1.75 }, corridor: { x: 9.5, z: 0 } },
  corridor: { inside: { x: 0, z: 0 }, corridor: { x: 0, z: 0 } },
};

export const ENTRANCE = { x: -9.15, z: 4.55, yaw: Math.PI / 2 };

/* Segmen koridor untuk dokumentasi presisi:
 *   koridor utama : z -1.05..1.05, x -10..25.6 (lebar nominal 2.1 m)
 *   belok arm     : x 23.8..25.6, z 1.05..5.8 (belok selatan)
 *                    → door HR di dinding x=23.8, z 1.3..2.6
 * Nav A* otomatis: grid mengikuti BOUNDS & obstacle tembok; sel notch
 * (x 23.8..25.6, z 5.8..7) otomatis terblokir dinding exterior.
 */
