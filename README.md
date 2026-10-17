# Startup Agent — Compact Office World

Proyek office simulator 3D berbasis Three.js. Denah sekarang sengaja dibuat **persegi panjang, ortogonal, ringkas, dan presisi**, bukan world abstrak. Ukuran bangunan adalah 20 × 14 unit dunia dengan satu koridor lurus selebar 1,6 unit.

## Lima ruang

- **Lobby** — meja resepsionis, monitor registrasi, sofa tunggu, kursi tamu, meja kopi, rak, dan tanaman.
- **Ruang Meeting** — meja rapat enam kursi, papan agenda, kabinet, dan dekorasi dinding.
- **Cafe** — counter kopi, kulkas, dispenser, dua meja kecil, empat kursi, dan perlengkapan cafe.
- **CEO Room** — workstation eksekutif, kursi kerja, sofa tamu, meja kopi, kabinet, rak buku, dan tanaman.
- **Staff Room** — dua workstation lengkap, kursi ergonomis, printer bersama, kabinet, rak, dan tempat sampah.

Semua pintu ruang terhubung ke koridor tengah. Anchor navigasi dan lokasi masuk diselaraskan dengan pintu, serta koridor sengaja tidak dipenuhi furnitur agar karakter dapat melintas.

## Karakter

Avatar robot eksternal telah diganti dengan karakter manusia prosedural bergaya casual modern. Kepala sedikit diperbesar agar proporsional, leher dibuat dengan geometri kapsul yang menumpang tindih ke kepala dan torso, detail permukaan kepala lebih halus, sambungan kaki diperkuat untuk mengurangi celah ketika bergerak, dan kecepatan jalan diturunkan menjadi 1,85 unit/detik (lari 4 unit/detik).

Model kursi kantor yang sudah ada dipertahankan: fungsi `createOfficeChair()` dalam `src/world/props.js` tidak diubah.

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
