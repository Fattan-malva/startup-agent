/*
 * Compact, conventional office floor plan.
 * Coordinates are metres. Rooms connect to the main straight corridor
 * which bends into an east wing (tapak tidak persegi). Wing corridor:
 * lurus ke timur lalu belok ke selatan menuju door HUMAN RESOURCE.
 */
export const BOUNDS = { x0: -10, x1: 16.2, z0: -7, z1: 7 };
export const FLOOR_POLYGON = [
  [-10, -7], [16.2, -7], [16.2, 7], [-10, 7],
];
export const WALL_H = 2.4;
// Tinggi bukaan pintu (lintel) — semua door otomatis mengikuti konstanta ini.
export const DOOR_H = 1.75;
export const WALL_T = 0.14;
// Koridor lebar nominal 2.1 m (muka-ke-muka ±1.96). Semua boundary
// (room, partition, sign, threshold) mengacu ke z = ±1.05 ini.
export const CORRIDOR_Z = { z0: -1.05, z1: 1.05 };

export const WALLS = [
  // Exterior walls.
  { x1: -10, z1: -7, x2: -5, z2: -7, mat: "wall" },
  { x1: -5, z1: -7, x2: -1, z2: -7, mat: "glass" },
  { x1: -1, z1: -7, x2: 4, z2: -7, mat: "wallSage" },
  { x1: 4, z1: -7, x2: 8, z2: -7, mat: "glass" },
  { x1: 8, z1: -7, x2: 10, z2: -7, mat: "wall" },
  // East wing extensions (sayap timur).
  { x1: 10, z1: -7, x2: 16.2, z2: -7, mat: "wall" },
  { x1: 16.2, z1: -7, x2: 16.2, z2: 7, mat: "wall" },
  { x1: 16.2, z1: 7, x2: -10, z2: 7, mat: "wall" },
  // Main entrance on the west wall, aligned with the lobby reception.
  { x1: -10, z1: -7, x2: -10, z2: 7, mat: "wall", doors: [{ at: 11.5, w: 1.55 }] },

  // North room fronts (Meeting, Cafe, Studio Kreatif).
  {
    x1: -10, z1: -1.05, x2: 10, z2: -1.05, mat: "wall", doors: [
      { at: 3.5, w: 1.3 },   // meeting
      { at: 11.5, w: 1.3 },  // cafe
      { at: 16.5, w: 1.3 },  // studio kreatif
    ]
  },
  // South room fronts (Lobby, Staff, CEO).
  // CEO door dipindah ke x = 8.5 (at 18.5).
  {
    x1: -10, z1: 1.05, x2: 10, z2: 1.05, mat: "wall", doors: [
      { at: 3.5, w: 1.3 },   // lobby   x=-6.5
      { at: 10, w: 1.3 },    // staff   x=0
      { at: 18.5, w: 1.3 },  // CEO     x=8.5
    ]
  },

  // Wing fronts (Developer Room & arm koridor HUMAN RESOURCE).
  // Koridor belok: dari koridor utama timur → belok selatan di x=14.6.
  { x1: 10, z1: -1.05, x2: 16.2, z2: -1.05, mat: "wall", doors: [{ at: 3.1, w: 1.3 }] },       // developer, door x=13.1
  { x1: 10, z1: 1.05, x2: 14.6, z2: 1.05, mat: "wall" },                                       // batas koridor utama / HR
  { x1: 14.6, z1: 1.05, x2: 14.6, z2: 7, mat: "wall", doors: [{ at: 0.9, w: 1.3 }] },          // door HR, z=1.95

  // North partitions.
  { x1: -1, z1: -7, x2: -1, z2: -1.05, mat: "wallSage" },
  { x1: 3, z1: -7, x2: 3, z2: -1.05, mat: "wallAccent" },
  // South partitions. Staff lebih luas, CEO lebih kecil.
  { x1: -3, z1: 1.05, x2: -3, z2: 7, mat: "wallSage" },
  { x1: 7, z1: 1.05, x2: 7, z2: 7, mat: "wallAccent" },
  // Wing divider (mis. antara blok utama dan sayap timur, ada gap koridor).
  { x1: 10, z1: -7, x2: 10, z2: -1.05, mat: "wall" },
  { x1: 10, z1: 1.05, x2: 10, z2: 7, mat: "wall" },
];

export const ROOMS = [
  {
    id: "meeting", name: "Ruang Meeting",
    x0: -10, z0: -7, x1: -1, z1: -1.05, floor: "carpet",
    polygon: [[-10, -7], [-1, -7], [-1, -1.05], [-10, -1.05]],
  },
  {
    id: "cafe", name: "Cafe",
    x0: -1, z0: -7, x1: 3, z1: -1.05, floor: "tile",
    polygon: [[-1, -7], [3, -7], [3, -1.05], [-1, -1.05]],
  },
  {
    id: "studio", name: "Studio Kreatif",
    x0: 3, z0: -7, x1: 10, z1: -1.05, floor: "wood",
    polygon: [[3, -7], [10, -7], [10, -1.05], [3, -1.05]],
  },
  {
    id: "developer", name: "Developer Room",
    // sayap timur sebelah utara — tapak tetap penuh (x 10..16.2);
    // lantai wood, senada Studio Kreatif (bukan carpet/concrete).
    x0: 10, z0: -7, x1: 16.2, z1: -1.05, floor: "wood",
    polygon: [[10, -7], [16.2, -7], [16.2, -1.05], [10, -1.05]],
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
    id: "hr", name: "Human Resource",
    // sayap timur sebelah selatan, koridor arm di timurnya (x 14.6..16.2)
    x0: 10, z0: 1.05, x1: 14.6, z1: 7, floor: "terrazzo",
    polygon: [[10, 1.05], [14.6, 1.05], [14.6, 7], [10, 7]],
  },
  {
    id: "ceo", name: "CEO Room",
    x0: 7, z0: 1.05, x1: 10, z1: 7, floor: "carpet",
    polygon: [[7, 1.05], [10, 1.05], [10, 7], [7, 7]],
  },
];

// Anchor corridor points sit directly in front of their matching doorways.
export const ROOM_ANCHORS = {
  lobby: { inside: { x: -6.7, z: 4.2 }, corridor: { x: -6.5, z: 0 } },
  meeting: { inside: { x: -6.5, z: -1.7 }, corridor: { x: -6.5, z: 0 } },
  cafe: { inside: { x: 1.5, z: -1.7 }, corridor: { x: 1.5, z: 0 } },
  studio: { inside: { x: 6.5, z: -1.7 }, corridor: { x: 6.5, z: 0 } },
  developer: { inside: { x: 13.1, z: -1.75 }, corridor: { x: 13.1, z: 0 } },
  // koridor utama → arm timur (belok) → door HR di x=14.6, z=1.95
  hr: { inside: { x: 13.75, z: 1.95 }, corridor: { x: 15.4, z: 1.95 } },
  staff: { inside: { x: 0.0, z: 1.75 }, corridor: { x: 0.0, z: 0 } },
  ceo: { inside: { x: 8.5, z: 1.75 }, corridor: { x: 8.5, z: 0 } },
  corridor: { inside: { x: 0, z: 0 }, corridor: { x: 0, z: 0 } },
};

export const ENTRANCE = { x: -9.15, z: 4.55, yaw: Math.PI / 2 };

/* Segmen koridor untuk dokumentasi presisi:
 *   koridor utama : z -1.05..1.05, x -10..16.2 (lebar nominal 2.1 m)
 *   belok wing    : arm selatan x 14.6..16.2, z 1.05..7
 *                    → door HR (x=14.6, z 1.3..2.6)
 * Nav A* otomatis: grid mengikuti BOUNDS & obstacle tembok.
 */