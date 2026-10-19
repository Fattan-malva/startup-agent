# Office World

Denah blok utama 20 × 14 unit + sayap timur (LEBAR sayap 6.2, DEEP z -7..7) — tapak total tidak lagi persegi murni. Koridor utama lebar nominal 2.1 m (boundary z ±1.05), lalu BELOK ke selatan di sayap timur (arm x 14.6..16.2) menuju door Human Resource. Delapan ruang fungsi: Lobby, Ruang Meeting, Cafe, CEO Room, Staff Room, Developer Room (sayap timur utara, staff-nya WAJIB baju hitam), Human Resource (sayap timur selatan), dan koridor. Partisi, pintu, dan ambang tegak lurus mengikuti denah; nav A* otomatis dari BOUNDS + obstacle tembok.

## Struktur per-ruangan

Furnitur TIDAK lagi ada di `Building.js` — setiap ruangan punya filenya sendiri di `src/world/rooms/`:

```
src/world/rooms/
  index.js       → katalog ROOM_MODULES + furnishRooms(b)
  meeting.js     cafe.js      studio.js    lobby.js
  staff.js       ceo.js       developer.js hr.js
```

Cara menambah ruangan baru:
1. daftarkan room di `src/world/layout.js` (ROOMS + WALLS + ROOM_ANCHORS),
2. buat `src/world/rooms/<id>.js` dengan `export function build(b)` yang memakai helper Building (`b._static`, `b._place`, `b._seat`, `b._workBundle` untuk unit meja+kursi, `b._plant`, `b._interactive`, `b._deskParts`, `b._splitLive`). Karakter TIDAK dibuat di room: semua staf lahir dari `src/data/staff.json` lewat modal Management Staf (tidak ada NPC statis),
3. tambahkan ke `ROOM_MODULES` di `src/world/rooms/index.js`,
4. (opsional) tambah label sign di `Building._roomSigns`.

Furnitur berasal dari fungsi di `props.js`; helper TV/PlayStation/konter pantry/meja resepsionis hidup di module room miliknya (`cafe.js`, `lobby.js`). Karakter menggunakan avatar manusia prosedural casual modern dengan kepala proporsional, overlap leher, sendi bulat mulus, dan duduk yang mengikuti rute A*.
