// Wrapper config khusus DEPLOYMENT — source app (vite.config.js) tidak diubah.
//
// Vite >= 5.4.12 menambahkan host check: request dengan header Host yang
// tidak terdaftar dijawab 403. Nginx mem-proxy dengan "Host: atelier.mallvaa.xyz",
// jadi hostname itu harus didaftarkan lewat server.allowedHosts.
//
// Env var __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS hanya tersedia di Vite 6,
// sedangkan project ini memakai Vite 5.4.21 → harus lewat config.
//
// Semua opsi lain diwarisi apa adanya dari vite.config.js asli.
import base from "./vite.config.js";

/* Setiap container baru = BUILD_ID baru. Entry module di index.html diberi
 * ?v=<BUILD_ID> supaya browser/Cloudflare tidak memakai /src/main.js lama
 * setelah redeploy (Cloudflare default memberi Cache-Control max-age=4 jam
 * untuk .js/.css kalau origin tidak mengirim no-store). */
const BUILD_ID = Date.now().toString(36);

function cacheBustEntry() {
  return {
    name: "atelier-cache-bust-entry",
    transformIndexHtml(html) {
      return html.replace(/(\/src\/main\.js)(?!\?)/g, `$1?v=${BUILD_ID}`);
    },
  };
}

const allowedHosts = [
  "atelier.mallvaa.xyz",
  "startup-agent", // akses langsung via nama container (untuk verifikasi/debug)
  "localhost",
  "127.0.0.1",
].filter(Boolean);

export default {
  ...base,
  plugins: [...(base.plugins || []), cacheBustEntry()],
  server: {
    ...base.server,
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts,
  },
  preview: {
    ...base.preview,
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    allowedHosts,
  },
};
