/*
 * Compact, conventional office floor plan.
 * Coordinates are metres. Five functional rooms connect to one straight,
 * 1.6 m-wide corridor; no decorative/organic room outlines.
 */
export const BOUNDS = { x0: -10, x1: 10, z0: -7, z1: 7 };
export const FLOOR_POLYGON = [
  [-10, -7], [10, -7], [10, 7], [-10, 7],
];
export const WALL_H = 1.52;
export const WALL_T = 0.14;
export const CORRIDOR_Z = { z0: -0.8, z1: 0.8 };

export const WALLS = [
  // Exterior walls. Glazing is a real straight wall segment, not an outline.
  { x1: -10, z1: -7, x2: -5, z2: -7, mat: "wall" },
  { x1: -5, z1: -7, x2: -1, z2: -7, mat: "glass" },
  { x1: -1, z1: -7, x2: 4, z2: -7, mat: "wallSage" },
  { x1: 4, z1: -7, x2: 8, z2: -7, mat: "glass" },
  { x1: 8, z1: -7, x2: 10, z2: -7, mat: "wall" },
  { x1: 10, z1: -7, x2: 10, z2: 7, mat: "wall" },
  { x1: 10, z1: 7, x2: -10, z2: 7, mat: "wall" },
  // Main entrance on the west wall, aligned with the lobby reception.
  { x1: -10, z1: -7, x2: -10, z2: 7, mat: "wall", doors: [{ at: 11.5, w: 1.55 }] },

  // North room fronts opening onto the shared corridor.
  { x1: -10, z1: -0.8, x2: 10, z2: -0.8, mat: "wall", doors: [
    { at: 3.5, w: 1.3 }, // meeting
    { at: 10, w: 1.3 },  // cafe
  ] },
  // South room fronts opening onto the same corridor.
  { x1: -10, z1: 0.8, x2: 10, z2: 0.8, mat: "wall", doors: [
    { at: 3.5, w: 1.3 }, // lobby
    { at: 10, w: 1.3 },  // staff
    { at: 16.5, w: 1.3 },// CEO
  ] },

  // Straight partitions separate each room. Each room has its own corridor door.
  { x1: -3, z1: -7, x2: -3, z2: -0.8, mat: "wallSage" },
  { x1: -3, z1: 0.8, x2: -3, z2: 7, mat: "wallSage" },
  { x1: 3, z1: 0.8, x2: 3, z2: 7, mat: "wallAccent" },
];

export const ROOMS = [
  {
    id: "meeting", name: "Ruang Meeting",
    x0: -10, z0: -7, x1: -3, z1: -0.8, floor: "carpet",
    polygon: [[-10, -7], [-3, -7], [-3, -0.8], [-10, -0.8]],
  },
  {
    id: "cafe", name: "Cafe",
    x0: -3, z0: -7, x1: 3, z1: -0.8, floor: "tile",
    polygon: [[-3, -7], [3, -7], [3, -0.8], [-3, -0.8]],
  },
  {
    id: "lobby", name: "Lobby",
    x0: -10, z0: 0.8, x1: -3, z1: 7, floor: "terrazzo",
    polygon: [[-10, 0.8], [-3, 0.8], [-3, 7], [-10, 7]],
  },
  {
    id: "staff", name: "Staff Room",
    x0: -3, z0: 0.8, x1: 3, z1: 7, floor: "carpet",
    polygon: [[-3, 0.8], [3, 0.8], [3, 7], [-3, 7]],
  },
  {
    id: "ceo", name: "CEO Room",
    x0: 3, z0: 0.8, x1: 10, z1: 7, floor: "carpet",
    polygon: [[3, 0.8], [10, 0.8], [10, 7], [3, 7]],
  },
];

// Anchor corridor points sit directly in front of their matching doorways.
export const ROOM_ANCHORS = {
  lobby:   { inside: { x: -6.7, z: 4.2 },  corridor: { x: -6.5, z: 0 } },
  meeting:{ inside: { x: -6.5, z: -1.45 }, corridor: { x: -6.5, z: 0 } },
  cafe:   { inside: { x: 0.0, z: -1.35 }, corridor: { x: 0.0, z: 0 } },
  staff:  { inside: { x: 0.0, z: 1.45 },  corridor: { x: 0.0, z: 0 } },
  ceo:    { inside: { x: 6.5, z: 1.45 },  corridor: { x: 6.5, z: 0 } },
  corridor:{ inside: { x: 0, z: 0 }, corridor: { x: 0, z: 0 } },
};

export const ENTRANCE = { x: -9.15, z: 4.55, yaw: Math.PI / 2 };
