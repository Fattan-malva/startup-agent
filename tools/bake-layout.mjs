// Bake tata ruang final (src/data/layout.default.json) ke dalam modul
// ruangan: posisi di kode = isi JSON, jadi kalau file JSON hilang, gedung
// tetap tertata seperti ini.
//
// Pemetaan: bangun seluruh ruangan dengan Building tiruan yang mencatat
// id item → call site (file + baris), lalu tulis ulang argumen x/z/ry.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Stub DOM minimal: props memakai canvas untuk tekstur (tidak jalan di Node). */
const ctxStub = new Proxy({}, {
  get(_t, key) {
    if (key === "createImageData" || key === "getImageData") {
      return (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    }
    if (key === "measureText") return () => ({ width: 10 });
    if (key === "canvas") return { width: 1, height: 1 };
    if (key === "createLinearGradient" || key === "createRadialGradient") {
      return () => ({ addColorStop() {} });
    }
    return () => {};
  },
});
globalThis.window = globalThis;
globalThis.document = {
  createElement(tag) {
    if (tag === "canvas") return { width: 1, height: 1, style: {}, getContext: () => ctxStub };
    return { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} };
  },
  body: { appendChild() {} },
};

const { furnishRooms } = await import("../src/world/rooms/index.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LAYOUT = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/layout.default.json"), "utf8"),
);

/* ------------------------------------------------------------------ *
 *  Building tiruan: mencatat id item → call site
 * ------------------------------------------------------------------ */
const calls = new Map();     // id -> { file, line, label, kind }
let seq = 0;

function callSite() {
  const frame = new Error().stack
    .split("\n")
    .find((l) => /rooms[\\/][a-z]+\.js:\d+/.test(l)) || "";
  const m = frame.match(/rooms[\\/]([a-z]+)\.js:(\d+)/);
  return m
    ? { file: `src/world/rooms/${m[1]}.js`, line: +m[2] }
    : { file: "?", line: 0 };
}

function reg(kind, label) {
  const site = callSite();
  const id = `p${seq++}`;
  calls.set(id, { ...site, label: label || "", kind });
  return id;
}

const group = {
  add() {}, remove() {}, traverse() {}, children: [], visible: true,
  position: { set() {}, x: 0, y: 0, z: 0 }, rotation: { set() {}, y: 0 },
};
const b = {
  scene: group, staticGroup: group, holder: group,
  interactives: [], plantSpots: [], seats: [], obstacles: [],
  _static(obj, x, z, ry = 0) {
    const id = reg("static", obj?.userData?.interactionLabel || obj?.name || "");
    obj.extras = obj.extras || [];
    obj.userData = obj.userData || {};
    obj.userData.editItem = { id };
    return obj;
  },
  _place(obj, x, z, ry = 0) {
    const id = reg("place", obj?.userData?.interactionLabel || obj?.name || "");
    obj.extras = obj.extras || [];
    obj.userData = obj.userData || {};
    obj.userData.editItem = { id };
    return obj;
  },
  _plant(x, z, ry, opts, label) { reg("plant", label); return {}; },
  _workBundle(obj, opts = {}) {
    const id = reg("bundle", opts.label || "");
    obj.extras = obj.extras || [];
    obj.userData = obj.userData || {};
    obj.userData.editItem = { id };
    return obj;
  },
  _interactive() {}, _seat() { return {}; }, _softSeats() { return []; },
  _hotspot() { return {}; }, _splitLive() {},
};

furnishRooms(b);
console.log(`terpetakan ${calls.size} item`);

/* ------------------------------------------------------------------ *
 *  Parse call di file + span argumen
 * ------------------------------------------------------------------ */
function parseCall(file, line) {
  const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
  const text = raw.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < line - 1; i++) offset += lines[i].length + 1;
  const re = /\bb\._(static|place|workBundle|plant)\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    if (m.index < offset) continue;
    const startLine = text.slice(0, m.index).split("\n").length;
    if (startLine !== line) continue;
    const open = m.index + m[0].length - 1;
    const end = matchParen(text, open);
    if (end < 0) continue;
    const inner = text.slice(open + 1, end);
    return { kind: m[1], open, end, inner, args: splitArgs(inner), src: text, start: open + 1 };
  }
  return null;
}

function matchParen(text, open) {
  let depth = 0, inStr = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function splitArgs(inner) {
  const out = [];
  let depth = 0, start = 0, inStr = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) { out.push({ s: start, e: i }); break; }
      depth--;
    } else if (c === "," && depth === 0) { out.push({ s: start, e: i }); start = i + 1; }
  }
  if (inner.slice(start).trim()) out.push({ s: start, e: inner.length });
  return out.map((a) => ({ ...a, text: inner.slice(a.s, a.e) }));
}

const fmt = (n) => String(Number(Number(n).toFixed(6)));
const isNum = (s) => /^-?[\d.]+$/.test(String(s).trim()) && String(s).trim() !== ".";
/** Ekspresi konstanta (mis. "Math.PI / 2") — aman diganti whole number. */
const isConstExpr = (s) => /^[A-Za-z_$][\w$]*(\s*[\/\+\-\*]\s*[A-Za-z_$0-9.]+)*$/.test(String(s).trim());

/** Nilai dari ekspresi konstanta (angka atau Math.*). */
function evalConst(expr) {
  const t = String(expr ?? "").trim();
  if (isNum(t)) return Number(t);
  if (!isConstExpr(t)) return null;
  try {
    return Function(`"use strict";return (${t})`)();
  } catch {
    return null;
  }
}

/** Baca nilai `key:` di dalam teks opts → { value, start, end } (span relatif). */
function readOptValue(text, key) {
  const re = new RegExp(`\\b${key}\\s*:\\s*`);
  const m = text.match(re);
  if (!m) return null;
  const start = m.index + m[0].length;
  // nilai berhenti di koma atau kurung kurawal di level yang sama
  let depth = 0;
  let end = start;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) break;
      depth--;
    } else if (c === "," && depth === 0) break;
    end = i + 1;
  }
  const value = text.slice(start, end).trim();
  const lead = text.slice(start, end).indexOf(value);
  return { value, start: start + lead, end: start + lead + value.length };
}

/** Cari deklarasi `const/let <name> = <angka>` → span angka. */
function findDecl(src, name) {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*(-?[\\d.]+)`);
  const m = src.match(re);
  if (!m) return null;
  const start = m.index + m[0].length - m[1].length;
  return { s: start, e: start + m[1].length };
}

/* ------------------------------------------------------------------ *
 *  Terapkan posisi JSON
 * ------------------------------------------------------------------ */
const patches = new Map();
const report = [];
const skipped = [];
const varPatches = new Map();   // file -> [{s,e,text}]

for (const [id, call] of calls) {
  const rec = LAYOUT.items[id];
  if (!rec) continue;                       // item dihapus → tak disentuh
  const parsed = parseCall(call.file, call.line);
  if (!parsed) { console.warn(`! call site tak ketemu: ${id} ${call.file}:${call.line}`); continue; }
  const want = { x: rec.x, z: rec.z, ry: rec.ry };

  if (parsed.kind === "workBundle") {
    const opt = parsed.args[1];
    if (!opt) continue;
    let text = opt.text;
    const vals = {};
    for (const key of ["x", "z", "ry"]) vals[key] = readOptValue(text, key);
    const cur = {
      x: vals.x?.value ?? null,
      z: vals.z?.value ?? null,
      ry: vals.ry?.value ?? null,
    };
    // Posisi dari variabel loop (mis. `x`, `t.x`) → nilainya sudah manage
    // dari array di kode; tidak boleh di-hardcode (nanti loop-nya rusak).
    if (!cur.x || !cur.z || !isNum(cur.x) || !isNum(cur.z)) {
      skipped.push({ id, ...call, expr: `x=${cur.x} z=${cur.z}` });
      continue;
    }
    const curX = evalConst(cur.x);
    const curZ = evalConst(cur.z);
    const curRy = evalConst(cur.ry);
    const same = curX != null && curZ != null
      && Math.abs(curX - want.x) < 1e-6
      && Math.abs(curZ - want.z) < 1e-6
      && (curRy == null || Math.abs(curRy - want.ry) < 1e-4);
    if (same) continue;
    // ganti dari belakang ke depan supaya span yang lain tetap valid
    const repl = [];
    for (const key of ["x", "z", "ry"]) {
      const v = vals[key];
      if (!v) continue;
      if (isNum(v.value) || isConstExpr(v.value)) repl.push({ s: v.start, e: v.end, text: fmt(want[key]) });
    }
    repl.sort((a, b) => b.s - a.s);
    for (const p of repl) text = text.slice(0, p.s) + p.text + text.slice(p.e);
    patches.set(call.file, [...(patches.get(call.file) || []), {
      s: parsed.start + opt.s, e: parsed.start + opt.e, text,
    }]);
    report.push({ ...call, id, cur, want });
  } else {
    const base = parsed.kind === "plant" ? 0 : 1;
    const cur = {};
    const spans = [];
    for (const [off, key] of [[0, "x"], [1, "z"], [2, "ry"]]) {
      const a = parsed.args[base + off];
      if (!a) { spans.push(null); cur[key] = null; continue; }
      const t = a.text.trim();
      const isPlain = /^-?[\d.]+$/.test(t) && t !== ".";
      cur[key] = isPlain ? t : t;
      spans.push({ a, key, isPlain });
    }
    // Posisi dari variabel loop → sudah manage dari array; jangan di-hardcode.
    if (!spans[0]?.isPlain || !spans[1]?.isPlain) {
      skipped.push({ id, ...call, expr: `x=${cur.x} z=${cur.z}` });
      continue;
    }
    const same = Math.abs(Number(cur.x) - want.x) < 1e-6
      && Math.abs(Number(cur.z) - want.z) < 1e-6
      && (!spans[2]?.isPlain || Math.abs(Number(cur.ry) - want.ry) < 1e-4);
    if (same) continue;
    for (const sp of spans) {
      if (!sp) continue;
      const raw = sp.a.text;
      const t = raw.trim();
      const off = raw.indexOf(t);
      const s = parsed.start + sp.a.s + off;
      const e = s + t.length;
      if (!isNum(t) && !isConstExpr(t)) continue;
      patches.set(call.file, [...(patches.get(call.file) || []), {
        s, e, text: fmt(want[sp.key]),
      }]);
    }
    report.push({ ...call, id, cur, want });
  }
}

/* Shorthand `x,` (mis. devXs.forEach((x) => b._workBundle(..., { x, z: 6.15 })))
   → tidak di-hardcode: nilainya tetap dari array (sudah sesuai JSON). */
const shorthand = [];

console.log(`\n${report.length} call perlu diperbarui:`);
for (const r of report) {
  console.log(` ${r.id.padEnd(6)} ${r.file.replace("src/world/rooms/", "").padEnd(12)} ${String(r.label || r.kind).padEnd(22)} ${JSON.stringify(r.cur)} → ${JSON.stringify(r.want)}`);
}

if (process.argv.includes("--apply")) {
  const all = new Map();
  for (const [f, list] of patches) all.set(f, [...(all.get(f) || []), ...list]);
  for (const [f, list] of varPatches) all.set(f, [...(all.get(f) || []), ...list]);
  for (const [file, list] of all) {
    const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    let text = raw.replace(/\r\n/g, "\n");
    list.sort((a, b) => b.s - a.s);
    for (const p of list) text = text.slice(0, p.s) + p.text + text.slice(p.e);
    fs.writeFileSync(path.join(ROOT, file), eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text, "utf8");
    console.log(`\n✓ ${file}: ${list.length} patch`);
  }
}
