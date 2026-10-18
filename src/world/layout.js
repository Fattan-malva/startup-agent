/*
 * Atelier Corp — denah U-SHAPE dengan COURTYARD (taman) di tengah.
 *
 * Bangunan melingkari sebuah taman 10 x 10 m yang terbuka ke selatan;
 * tapaknya TIDAK persegi (lekuk tengah) dan koridornya membentuk huruf U
 * (tidak lurus): kaki barat + kaki utara + kaki timur, semuanya berkaca
 * penuh menghadap taman dan ujungnya berjendela — jadi tidak ada koridor
 * buntu yang gelap.
 *
 * Alur masuk (natural seperti kantor nyata):
 *   luar -> taman (gap di tepi selatan) -> pintu kaca di dinding koridor
 *   utara (x = 0.0) -> koridor -> pintu Lobby tepat segaris di x = 0.0.
 *   Sumbu x = 0 dipakai untuk SEMUA jalur masuk: jalur gravel taman,
 *   pintu kaca, mulut koridor, pintu Lobby, dan meja resepsionis.
 *
 * Denah (mata angin: utara = z negatif):
 *
 *         x -16        -7.1  -5      0      5  7.1          16
 *   z -10  ┌────────────┬──────────────────┬────────────────┐
 *          │  MEETING   │      LOBBY       │      CAFE      │
 *          │ 10.5×6.9   │   resepsionis    │    10.5×6.9    │
 *   z -3.1 ├────────────┴── KORIDOR UTARA ─┴────────────────┤
 *          │  STAFF      ┌──────────────────────────┐       │
 *          │  8.9×6.1    │                          │  HR   │
 *   z  3   ├─────────────┤   COURTYARD (taman)      ├───────┤
 *          │    CEO      │   10 × 10, terbuka ke    │STUDIO │
 *          │  8.9×6.0    │   selatan (jalur gravel) ├───────┤
 *   z  9   └──────┬──────┴────────────┬─────────────┘  DEV  │
 *                 └── pintu masuk ────┘               8.9×4.4│
 *
 * Sekat kaca: Meeting|Lobby (x=-5.5), Lobby|Cafe (x=5.5),
 *             Staff|CEO (z=3), HR|Studio (z=1), Studio|Developer (z=5)
 *             + seluruh dinding koridor yang menghadap taman (x=±5, z=-1).
 *
 * Prinsip lama tetap dijaga: tidak ada ruangan yang menyempit dari layout
 * sebelumnya tanpa dibayar dengan memperluas dunia (kini 32 x 19 m).
 */

export const BOUNDS = { x0: -16, x1: 16, z0: -10, z1: 9 };

// Slab lantai dasar = persegi penuh; taman menutupinya dengan rumput
// (room overlay "grass"), jadi tidak ada lubang di bawah taman.
export const FLOOR_POLYGON = [
  [-16, -10], [16, -10], [16, 9], [-16, 9],
];

// Plafon HANYA menutup bangunan (tapak U) — taman tengah tetap terbuka
// ke langit, jadi saat mode Kendalikan taman terasa benar-benar outdoor.
export const CEILING_POLYGON = [
  [-16, -10], [16, -10], [16, 9], [5, 9], [5, -1], [-5, -1], [-5, 9], [-16, 9],
];

// Taman tengah (courtyard) — dipakai modul ruangan taman.
export const COURT = { x0: -5, x1: 5, z0: -1, z1: 9 };

export const WALL_H = 2.4;
// Tinggi bukaan pintu (lintel) — semua door otomatis mengikuti konstanta ini.
export const DOOR_H = 1.75;
export const WALL_T = 0.14;

export const WALLS = [
  /* ── Exterior UTARA (z = -10) — Meeting | Lobby | Cafe, band jendela ── */
  { x1: -16, z1: -10, x2: -13, z2: -10, mat: "wall" },
  { x1: -13, z1: -10, x2: -8.2, z2: -10, mat: "glass" },
  { x1: -8.2, z1: -10, x2: -3, z2: -10, mat: "wall" },
  { x1: -3, z1: -10, x2: 3, z2: -10, mat: "glass" },
  { x1: 3, z1: -10, x2: 8.2, z2: -10, mat: "wall" },
  { x1: 8.2, z1: -10, x2: 13, z2: -10, mat: "glass" },
  { x1: 13, z1: -10, x2: 16, z2: -10, mat: "wall" },

  /* ── Exterior BARAT (x = -16) ── */
  { x1: -16, z1: -10, x2: -16, z2: -6.4, mat: "wall" },
  { x1: -16, z1: -6.4, x2: -16, z2: -3.1, mat: "glass" }, // jendela meeting
  { x1: -16, z1: -3.1, x2: -16, z2: -0.6, mat: "wall" },
  { x1: -16, z1: -0.6, x2: -16, z2: 0.6, mat: "glass" },  // jendela staff
  { x1: -16, z1: 0.6, x2: -16, z2: 4.4, mat: "wall" },
  { x1: -16, z1: 4.4, x2: -16, z2: 7.6, mat: "glass" },   // jendela CEO
  { x1: -16, z1: 7.6, x2: -16, z2: 9, mat: "wall" },

  /* ── Exterior TIMUR (x = 16) ── */
  { x1: 16, z1: -10, x2: 16, z2: -6.5, mat: "wall" },
  { x1: 16, z1: -6.5, x2: 16, z2: -3.1, mat: "glass" },   // jendela cafe
  { x1: 16, z1: -3.1, x2: 16, z2: -0.6, mat: "wall" },
  { x1: 16, z1: -0.6, x2: 16, z2: 0.4, mat: "glass" },    // jendela HR
  { x1: 16, z1: 0.4, x2: 16, z2: 2.2, mat: "wall" },
  { x1: 16, z1: 2.2, x2: 16, z2: 3.8, mat: "glass" },     // jendela studio
  { x1: 16, z1: 3.8, x2: 16, z2: 6.2, mat: "wall" },
  { x1: 16, z1: 6.2, x2: 16, z2: 7.8, mat: "glass" },     // jendela developer
  { x1: 16, z1: 7.8, x2: 16, z2: 9, mat: "wall" },

  /* ── Exterior SELATAN (z = 9) — taman terbuka di x -5..5 ── */
  { x1: -16, z1: 9, x2: -13, z2: 9, mat: "wall" },
  { x1: -13, z1: 9, x2: -9.5, z2: 9, mat: "glass" },      // jendela selatan blok barat
  { x1: -9.5, z1: 9, x2: -7.1, z2: 9, mat: "wall" },
  { x1: -7.1, z1: 9, x2: -5, z2: 9, mat: "glass" },       // ujung kaca kaki koridor barat
  { x1: 5, z1: 9, x2: 7.1, z2: 9, mat: "glass" },         // ujung kaca kaki koridor timur
  { x1: 7.1, z1: 9, x2: 10, z2: 9, mat: "wall" },
  { x1: 10, z1: 9, x2: 13.4, z2: 9, mat: "glass" },       // jendela selatan blok timur
  { x1: 13.4, z1: 9, x2: 16, z2: 9, mat: "wall" },

  /* ── Koridor menghadap taman (kaca penuh) + pintu masuk utama ──
   * Pintu kaca masuk ada di dinding z = -1 (x = 0.0) PERSIS segaris dengan
   * pintu Lobby dan jalur taman (sumbu simetri bangunan).
   * Kaki barat & timur punya pintu kaca ke taman. LEBAR PINTU: 2.0 m
   * (muat 3 orang bersisipan), kecuali dua pintu yang memang terkurung
   * mulut koridor 1.6 m. */
  { x1: -5, z1: -1, x2: -5, z2: 9, mat: "glass", doors: [{ at: 7, w: 2.0 }] },
  { x1: 5, z1: -1, x2: 5, z2: 9, mat: "glass", doors: [{ at: 7, w: 2.0 }] },
  { x1: -5, z1: -1, x2: 5, z2: -1, mat: "glass", doors: [{ at: 5.0, w: 2.0 }] },

  /* ── Sekat KACA blok utara: Meeting|Lobby dan Lobby|Cafe ── */
  { x1: -5.5, z1: -10, x2: -5.5, z2: -3.1, mat: "glass" },
  { x1: 5.5, z1: -10, x2: 5.5, z2: -3.1, mat: "glass" },

  /* ── Dinding muka blok utara (z = -3.1): pintu Meeting / Lobby / Cafe ──
   * Pintu Lobby ada di x = 0.0 (SUMBU SIMETRI bangunan): segaris dengan
   * jalur taman, pintu kaca masuk, dan meja resepsionis.
   * Meeting & Cafe pintunya selebar MULUT KORIDOR (1.6 m) — sudah maksimal
   * karena terkurung lebar koridor. */
  {
    x1: -16, z1: -3.1, x2: 16, z2: -3.1, mat: "wall", doors: [
      { at: 9.7, w: 1.6 },   // meeting  (x = -6.3, selebar mulut koridor)
      { at: 16, w: 2.0 },    // lobby    (x =  0.0)
      { at: 22.3, w: 1.6 },  // cafe     (x =  6.3, selebar mulut koridor)
    ],
  },

  /* ── Dinding muka blok BARAT (x = -7.1): pintu Staff & CEO ── */
  {
    x1: -7.1, z1: -3.1, x2: -7.1, z2: 9, mat: "wall", doors: [
      { at: 2.2, w: 2.0 },   // staff (z = -0.9)
      { at: 9.6, w: 2.0 },   // ceo   (z =  6.5)
    ],
  },

  /* ── Dinding muka blok TIMUR (x = 7.1): pintu HR / Studio / Developer ── */
  {
    x1: 7.1, z1: -3.1, x2: 7.1, z2: 9, mat: "wall", doors: [
      { at: 1.35, w: 2.0 },  // hr        (z = -1.75)
      { at: 6.1, w: 2.0 },   // studio    (z =  3.0)
      { at: 10.1, w: 2.0 },  // developer (z =  7.0)
    ],
  },

  /* ── Sekat kaca dalam blok barat & timur ── */
  { x1: -16, z1: 3, x2: -7.1, z2: 3, mat: "glass" },   // Staff | CEO
  { x1: 7.1, z1: 1, x2: 16, z2: 1, mat: "glass" },     // HR | Studio
  { x1: 7.1, z1: 5, x2: 16, z2: 5, mat: "glass" },     // Studio | Developer
];

export const ROOMS = [
  {
    id: "meeting", name: "Ruang Meeting",
    x0: -16, z0: -10, x1: -5.5, z1: -3.1, floor: "carpet",
    polygon: [[-16, -10], [-5.5, -10], [-5.5, -3.1], [-16, -3.1]],
  },
  {
    id: "lobby", name: "Lobby",
    x0: -5.5, z0: -10, x1: 5.5, z1: -3.1, floor: "terrazzo",
    polygon: [[-5.5, -10], [5.5, -10], [5.5, -3.1], [-5.5, -3.1]],
  },
  {
    id: "cafe", name: "Cafe",
    x0: 5.5, z0: -10, x1: 16, z1: -3.1, floor: "terrazzo",
    polygon: [[5.5, -10], [16, -10], [16, -3.1], [5.5, -3.1]],
  },
  {
    id: "staff", name: "Staff Room",
    x0: -16, z0: -3.1, x1: -7.1, z1: 3, floor: "carpet",
    polygon: [[-16, -3.1], [-7.1, -3.1], [-7.1, 3], [-16, 3]],
  },
  {
    id: "ceo", name: "CEO Room",
    x0: -16, z0: 3, x1: -7.1, z1: 9, floor: "carpet",
    polygon: [[-16, 3], [-7.1, 3], [-7.1, 9], [-16, 9]],
  },
  {
    id: "hr", name: "Human Resource",
    x0: 7.1, z0: -3.1, x1: 16, z1: 1, floor: "terrazzo",
    polygon: [[7.1, -3.1], [16, -3.1], [16, 1], [7.1, 1]],
  },
  {
    id: "studio", name: "Studio Kreatif",
    x0: 7.1, z0: 1, x1: 16, z1: 5, floor: "wood",
    polygon: [[7.1, 1], [16, 1], [16, 5], [7.1, 5]],
  },
  {
    id: "developer", name: "Developer Room",
    x0: 7.1, z0: 5, x1: 16, z1: 9, floor: "wood",
    polygon: [[7.1, 5], [16, 5], [16, 9], [7.1, 9]],
  },
  {
    // Courtyard: taman tengah, lantai rumput. Terbuka ke selatan
    // (tidak ada dinding di z = 9 antara x -5..5).
    id: "courtyard", name: "Taman Tengah", outdoor: true,
    x0: -5, z0: -1, x1: 5, z1: 9, floor: "grass",
    polygon: [[-5, -1], [5, -1], [5, 9], [-5, 9]],
  },
];

// Anchor corridor tepat di depan tiap pintu (dipakai AI untuk room→room).
export const ROOM_ANCHORS = {
  meeting: { inside: { x: -6.3, z: -4.3 }, corridor: { x: -6.3, z: -2.0 } },
  lobby: { inside: { x: 0.0, z: -4.5 }, corridor: { x: 0.0, z: -2.0 } },
  cafe: { inside: { x: 6.3, z: -4.5 }, corridor: { x: 6.3, z: -2.0 } },
  staff: { inside: { x: -8.6, z: -0.9 }, corridor: { x: -6.0, z: -0.9 } },
  ceo: { inside: { x: -8.6, z: 6.5 }, corridor: { x: -6.0, z: 6.5 } },
  hr: { inside: { x: 8.7, z: -1.75 }, corridor: { x: 6.0, z: -1.75 } },
  studio: { inside: { x: 8.7, z: 3.0 }, corridor: { x: 6.0, z: 3.0 } },
  developer: { inside: { x: 8.7, z: 7.0 }, corridor: { x: 6.0, z: 7.0 } },
  courtyard: { inside: { x: 0.0, z: 3.0 }, corridor: { x: 0.0, z: -2.0 } },
  corridor: { inside: { x: 0.0, z: -2.0 }, corridor: { x: 0.0, z: -2.0 } },
};

// Titik spawn: di jalur taman menghadap gedung (yaw π = menghadap utara).
// x = 0.0 → tepat di sumbu simetri (jalur taman ↔ pintu Lobby).
export const ENTRANCE = { x: 0.0, z: 8.1, yaw: Math.PI };

/* Dokumentasi presisi:
 *   koridor utara : z -3.1..-1.0, x -7.1..7.1  (lebar 2.1 m)
 *   koridor barat : x -7.1..-5.0, z -1.0..9    (menghadap taman)
 *   koridor timur : x  5.0..7.1, z -1.0..9     (menghadap taman)
 *   sumbu simetri : x = 0 → jalur gravel taman, pintu kaca masuk,
 *                   mulut koridor, pintu Lobby, meja resepsionis
 *   pintu masuk   : kaca z = -1, x = 0.0 (lebar 2.0)
 *   lebar pintu   : 2.0 m (≥3 orang bersisipan); Meeting & Cafe 1.6 m
 *                   karena selebar mulut koridor di ujungnya
 * Nav A* otomatis: grid mengikuti BOUNDS & obstacle; sel taman tetap
 * terjangkau lewat pintu kaca, dan taman tidak berplafon.
 */
