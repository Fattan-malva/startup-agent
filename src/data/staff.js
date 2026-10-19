import staff from "./staff.json" with { type: "json" };
import { speciesById, DEPARTMENTS } from "../character/species.js";

/* ===================================================================== *
 *  src/data/staff.js — sumber data staf kantor.
 *
 *  Array STAFF yang sama dipakai bersama oleh Crew (spawn karakter ke
 *  dunia) dan StaffModal (CRUD lewat /__staff → src/data/staff.json),
 *  jadi perubahan di modal langsung terbaca di dunia dan sebaliknya.
 *
 *  Setiap record di-normalisasi saat modul dimuat: field yang belum
 *  diisi file JSON (warna kulit/baju/model, status, radius) diisi
 *  dari default spesiesnya — bukan teks contoh.
 * ===================================================================== */

export const STAFF = staff;

export const STAFF_STATUSES = [
  { value: "active", label: "Aktif", flag: "" },
  { value: "on-leave", label: "Cuti", flag: "CUTI" },
  { value: "inactive", label: "Tidak aktif", flag: "NONAKTIF" },
];

export const REST_ROOM = "cafe";                                  // ruang istirahat
export const WORKSTATION_SEAT_TYPES = new Set(["desk", "ceo", "reception"]);

/* Gaya rambut: avatarHead.js punya 5 model (indeks 0..4). Di modal
 * ditampilkan sebagai nomor 1..5 supaya gampang dipilih. */
export const HAIR_STYLES = [
  { n: 1, name: "Belah pinggir" },
  { n: 2, name: "Spiky" },
  { n: 3, name: "Dua poni" },
  { n: 4, name: "Buzz cut" },
  { n: 5, name: "Sampir" },
];
export const HAIR_STYLE_COUNT = HAIR_STYLES.length;
export const clampHairStyle = (v) => {
  const n = Math.round(Number(v) || 0);
  if (!n) return 1;
  return ((n - 1) % HAIR_STYLE_COUNT + HAIR_STYLE_COUNT) % HAIR_STYLE_COUNT + 1;
};
export const hairStyleName = (v) =>
  HAIR_STYLES.find((h) => h.n === clampHairStyle(v))?.name || HAIR_STYLES[0].name;

export const isWorkstationSeat = (seat) =>
  seat?.kind === "workstation" && WORKSTATION_SEAT_TYPES.has(seat.type);
export const staffByDesk = (deskId) => STAFF.find((s) => s.deskId === deskId) || null;
/** Ruangan yang boleh dimasuki staf — persis dari daftar check box modal.
 *  Tidak ada ruangan implisit: kalau Cafe tidak dicentang, staf tidak boleh
 *  masuk Cafe (beristirahat di ruangan yang memang diizinkan). */
export const effectiveRooms = (staff) =>
  new Set([...(staff?.rooms || [])]);
export const canEnter = (staff, roomId) => effectiveRooms(staff).has(roomId);

/** Ruangan bawaan per departemen — hanya saran saat staf baru dibuat. */
export const DEPT_ROOM = {
  Engineering: "developer",
  Design: "studio",
  People: "hr",
  Executive: "ceo",
  Operations: "staff",
  Growth: "staff",
  Finance: "staff",
};

export const DEFAULT_WANDER = 1.6;

/* Warna celana mengikuti palet yang dipakai avatarBody.js */
const TROUSERS = [0x343b45, 0x4a5360, 0x8c8175, 0x2b2f35, 0x484254, 0x4d5b51];

export const toHex = (n) => "#" + (Number(n) || 0).toString(16).padStart(6, "0");
export const toInt = (v) => {
  const n = parseInt(String(v ?? "").replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0;
};
const clampWander = (v) => Math.min(5, Math.max(0.5, Number(v) || DEFAULT_WANDER));

/** Model bawaan sebuah spesies (dipakai saat staf belum punya field itu). */
export function modelDefaults(speciesId) {
  const spec = speciesById(speciesId);
  return {
    species: spec.id,
    skin: toHex(spec.skin),
    shirt: toHex(spec.fur),
    // Some looks (e.g. "Staff Cafe") bring their own trousers color.
    pants: toHex(spec.pants ?? TROUSERS[Math.abs(spec.palette || 0) % TROUSERS.length]),
    hair: toHex(spec.hair),
    hairStyle: 1,
    eyes: toHex(spec.eyes),
    tieColor: 0x477da6,
    accessory: spec.glasses ? "glasses" : spec.headphones ? "headphones" : spec.hat ? "hat" : "none",
  };
}

/** Lengkapi satu record staf supaya semua field selalu ada. */
export function normalizeStaff(raw = {}) {
  const department = raw.department || "Engineering";
  const model = { ...modelDefaults(raw.model?.species), ...(raw.model || {}) };
  const status = STAFF_STATUSES.some((s) => s.value === raw.status) ? raw.status : "active";
  return {
    ...raw,
    id: raw.id || `staff-${Date.now().toString(36)}`,
    name: raw.name || "Staf baru",
    title: raw.title || "Staf",
    department,
    status,
    roomId: raw.roomId || DEPT_ROOM[department] || "staff",
    deskId: raw.deskId || null,
    wander: clampWander(raw.wander),
    model,
    rooms: Array.isArray(raw.rooms)
      ? raw.rooms.filter((id) => typeof id === "string")
      : [raw.roomId],
  };
}

/**
 * Objek `appearance` untuk Critter — kunci yang sama dipakai
 * avatarBody/avatarHead, sehingga preview dan karakter di dunia identik.
 */
export function appearanceFromModel(model = {}) {
  const m = { ...modelDefaults(model.species), ...model };
  const accessory = m.accessory || "none";
  return {
    species: m.species,
    skin: m.skin,
    shirt: m.shirt,
    pants: m.pants,
    hair: m.hair,
    hairStyle: clampHairStyle(m.hairStyle),
    eyes: m.eyes,
    tieColor: m.tieColor,
    accessory,
    glasses: accessory === "glasses",
    headphones: accessory === "headphones",
    hat: accessory === "hat",
    palette: speciesById(m.species).palette || 0,
  };
}

/** Staf baru — siap diedit di modal, langsung lengkap modelnya. */
export function newStaffRecord({ department = "Engineering", species = "developer", roomId = null } = {}) {
  const seq = STAFF.reduce((max, s) => {
    const n = Number(String(s.id).replace(/\D/g, ""));
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  const home = roomId || DEPT_ROOM[department] || "staff";
  return normalizeStaff({
    id: `staff-${String(seq + 1).padStart(3, "0")}`,
    name: "Staf baru",
    title: "Jabatan baru",
    department,
    status: "active",
    roomId: home,
    deskId: null,
    wander: DEFAULT_WANDER,
    model: { ...modelDefaults(species), tieColor: deptTie(department) },
    // Default: ruang kerja departemen + Cafe (area istirahat/ngopi).
    // Untick di modal kalau staf ini tidak boleh masuk Cafe.
    rooms: [home, REST_ROOM],
  });
}

/** Warna dasi sebuah departemen (staf baru & saat departemen diganti). */
export function deptTie(department) {
  const extra = { Executive: 0x739dd0 };
  return DEPARTMENTS.find((d) => d.name === department)?.tie
    ?? extra[department]
    ?? 0x737f90;
}

export function staffById(id) {
  return STAFF.find((s) => s.id === id) || null;
}

export function staffByRoom(roomId) {
  return STAFF.filter((s) => s.roomId === roomId);
}

export function staffByDepartment(department) {
  return STAFF.filter((s) => s.department === department);
}

/* Normalisasi saat modul dimuat: JSON lama tetap terbaca, field baru
   langsung lengkap tanpa menunggu tombol Simpan. */
for (let i = 0; i < STAFF.length; i++) STAFF[i] = normalizeStaff(STAFF[i]);
