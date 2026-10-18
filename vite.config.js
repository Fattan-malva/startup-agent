import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAYOUT_FILE = path.join(__dirname, "src", "data", "layout.default.json");

const STAFF_FILE = path.join(__dirname, "src", "data", "staff.json");

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

export default defineConfig({
  base: "./",
  plugins: [layoutSavePlugin(), staffSavePlugin()],
  server: {
    port: 5173,
    open: false,
    watch: {
      // Jangan HMR reload saat file layout ditulis ulang dari Edit Mode.
      ignored: ["**/src/world/layout.default.json"],
    },
  },
  build: {
    target: "esnext",
    outDir: "dist",
    sourcemap: false,
  },
});