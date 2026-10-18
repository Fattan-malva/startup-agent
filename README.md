# Startup Agent — Compact Office World

Proyek office simulator 3D berbasis Three.js. Gedung memakai denah ortogonal berbentuk L dengan koridor tengah dan delapan ruang: Lobby, Ruang Meeting, Cafe, Studio Kreatif, Developer Room, Staff Room, CEO Room, dan Human Resource. Tiap ruang dirakit dari modul tersendiri di `src/world/rooms/`.

## Layout dan furnitur

Penempatan memakai koordinat dunia dan footprint collider yang menjadi acuan navigasi. Furniture yang menjadi tempat duduk menggunakan tinggi permukaan sekitar **0,505 unit**, selaras dengan dudukan kursi ergonomis. Sofa di cafe dipisah agar tidak saling tumpang tindih; meja rapat/studio dan kursinya diberi clearance; workstation developer direnggangkan dan meja CEO digeser untuk membuka akses pintu.

## Karakter dan navigasi

Avatar manusia prosedural bergaya casual modern bergerak menggunakan A* di grid 0,25 unit. Collision checks membatasi gerak terhadap dinding, sekat, dan footprint furnitur. Rute yang tidak dapat ditemukan tidak boleh berubah menjadi gerakan langsung menembus rintangan. Gerakan antar-character juga diuji sepanjang lintasan dan diselesaikan tanpa mendorong tubuh menembus geometri statis.

## Menjalankan di Windows

Pastikan Node.js terpasang, kemudian buka terminal pada folder proyek dan jalankan:

```powershell
npm ci
npm run dev
```

Build produksi:

```powershell
npm run build
npm run preview
```

`node_modules` dan `dist` tidak disertakan dalam ZIP. Dependency akan dipasang ulang di komputer tujuan agar memakai binary yang sesuai dengan OS.
