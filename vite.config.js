import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/* Tata ruang gedung disimpan sebagai JSON (satu-satunya sumber data):
 *   src/data/layout.default.json  →  src/data/defaultEdits.js (DEFAULT_EDITS)
 * Mode Edit menulis ke file JSON ini lewat endpoint /__layout, jadi
 * "Reset semua" selalu kembali ke editan terakhir yang tersimpan. */
const LAYOUT_FILE = path.join(__dirname, "src", "data", "layout.default.json");
const STAFF_FILE = path.join(__dirname, "src", "data", "staff.json");

/* File data yang di-import sebagai modul JS:
 *   src/data/staff.json           → src/data/staff.js       (STAFF)
 *   src/data/layout.default.json  → src/data/defaultEdits.js (DEFAULT_EDITS)
 * Endpoint /__staff dan /__layout menulis ulang file-file ini. */
const DATA_FILES = new Set(["staff.json", "layout.default.json"]);

function staffSavePlugin() {
  return {
    name: "atelier-staff-save",
    configureServer(server) {
      server.middlewares.use("/__staff", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
          return;
        }
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 2_000_000) req.destroy(); });
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (!Array.isArray(data)) throw new Error("staff harus array");
            const out = JSON.stringify(data, null, 2) + "\n";
            fs.mkdirSync(path.dirname(STAFF_FILE), { recursive: true });
            fs.writeFileSync(STAFF_FILE, out, "utf8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, bytes: out.length }));
          } catch (err) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
          }
        });
      });
    },
  };
}

function layoutSavePlugin() {
  return {
    name: "atelier-layout-save",
    configureServer(server) {
      server.middlewares.use("/__layout", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
          return;
        }
        let body = "";
        req.on("data", (c) => {
          body += c;
          if (body.length > 2_000_000) req.destroy();
        });
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (!data || typeof data !== "object" || !data.items) {
              throw new Error("layout tidak valid (items hilang)");
            }
            // Tata ruang disimpan sebagai JSON (dibaca defaultEdits.js).
            const out = JSON.stringify(data, null, 2) + "\n";
            fs.mkdirSync(path.dirname(LAYOUT_FILE), { recursive: true });
            fs.writeFileSync(LAYOUT_FILE, out, "utf8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, bytes: out.length }));
          } catch (err) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
          }
        });
      });
    },
  };
}

/* ------------------------------------------------------------------ *
 *  Jangan full-reload saat file data ditulis oleh endpoint simpan.
 *
 *  Tanpa plugin ini: setiap kali Mode Edit / HR menyimpan, JSON yang
 *  di-import sebagai modul ditulis ulang. Watcher Vite melihat modul itu
 *  berubah lalu mengirim full-reload ke browser → layar loading muncul
 *  lagi dari awal dan seluruh gedung dibangun ulang, padahal perubahan
 *  sudah diterapkan langsung di memori.
 *
 *  Dengan mengembalikan array kosong dari `handleHotUpdate`, Vite tidak
 *  mengirim update/reload apa pun untuk file tersebut. Modulnya tetap
 *  di-invalidate supaya refresh manual berikutnya membaca isi terbaru
 *  dari disk (bukan cache transform lama).
 * ------------------------------------------------------------------ */
function noReloadOnDataSave() {
  return {
    name: "atelier-no-reload-data-save",
    handleHotUpdate({ file, server, modules }) {
      if (!DATA_FILES.has(path.basename(file))) return;
      for (const mod of modules) server.moduleGraph.invalidateModule(mod);
      return []; // tidak ada update ke browser → tidak ada reload
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [layoutSavePlugin(), staffSavePlugin(), noReloadOnDataSave()],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: "esnext",
    outDir: "dist",
    sourcemap: false,
  },
});
