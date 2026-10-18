/* Tata ruang bawaan (final dari pengguna).
 * Dipakai sebagai titik awal & titik "Reset": semua posisi di sini sudah
 * lolos uji kursi + jalur. Jangan ubah tanpa menjalankan diag-seats/diag-edit.
 *
 * Sumbernya adalah src/data/layout.default.json: file ini ditulis ulang
 * otomatis oleh Mode Edit (tombol Simpan / auto-save), sehingga siapa pun
 * yang pull repo langsung memakai tata ruang terbaru.
 */
import layout from "./layout.default.json" with { type: "json" };
export const DEFAULT_EDITS = layout;
