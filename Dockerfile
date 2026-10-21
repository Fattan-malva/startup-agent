# Atelier Corp — Startup Miniatur (Three.js / Vite)
#
# Container menjalankan Vite dev server, bukan static build, karena aplikasi
# punya endpoint simpan data (/__layout, /__staff) yang diimplementasikan
# sebagai Vite middleware (vite.config.js). Mode Edit / HR reliant pada
# endpoint ini supaya perubahan tata ruang & data pegawai benar-benar tersimpan.

FROM docker.io/library/node:20-alpine

WORKDIR /app

# Layer dependency di-cache terpisah supaya rebuild cepat.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Source aplikasi (src/data di-bind-mount dari host, lihat compose.yaml).
COPY . .

ENV NODE_ENV=development \
    HOST=0.0.0.0 \
    PORT=5173

EXPOSE 5173

# Host 0.0.0.0 supaya Vite mau listen di semua interface container,
# bukan cuma loopback. Config dibungkus vite.deploy.config.js supaya
# host check Vite mengizinkan "Host: atelier.mallvaa.xyz" dari nginx.
CMD ["npm", "run", "dev", "--", "--config", "vite.deploy.config.js"]
