/* ===================================================================== *
 *  Device — deteksi perangkat & kemampuan input.
 *
 *  Dipakai untuk:
 *    • menyalakan kontrol sentuh (joystick, tombol zoom, tombol gunakan)
 *    • menampilkan meta tag / perilaku khusus iOS (Add to Home Screen)
 *    • menyesuaikan HUD supaya tetap rapi di layar sempit
 *
 *  Semua deteksi dilakukan sekali di awal lalu di-cache — hasilnya tidak
 *  berubah selama sesi (kecuali orientasi, itu ditangani terpisah).
 * ===================================================================== */

/** true kalau perangkat punya layar sentuh (coarse pointer). */
export const isTouchDevice = (() => {
  if (typeof window === "undefined") return false;
  if ("ontouchstart" in window) return true;
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
})();

/** true kalau perangkatnya iPhone/iPad/iPod (WebKit, standalone Home Screen). */
export const isIOS = (() => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSUA = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ menyamar jadi Macintosh — deteksi lewat sentuhan多点.
  const iPadOS =
    /Macintosh/.test(ua) &&
    typeof document !== "undefined" &&
    "ontouchstart" in document &&
    navigator.maxTouchPoints > 1;
  return iOSUA || iPadOS;
})();

/** true kalau aplikasi dibuka sebagai PWA (Add to Home Screen). */
export const isStandalone = (() => {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  } catch {
    return false;
  }
})();

/** true kalau layar sempit (ponsel / tablet kecil). */
export const isNarrow = () =>
  typeof window !== "undefined" &&
  Math.min(window.innerWidth, window.innerHeight) <= 820;

/**
 * Tandai <html> dengan kelas yang dipakai CSS:
 *   .is-touch  → perangkat sentuh (kontrol mobile aktif)
 *   .is-ios    → iOS (safe-area & Home Screen)
 *   .is-standalone → dijalankan sebagai PWA
 */
export function markDevice() {
  const el = document.documentElement;
  el.classList.toggle("is-touch", isTouchDevice);
  el.classList.toggle("is-ios", isIOS);
  el.classList.toggle("is-standalone", isStandalone);
  if (isIOS) el.classList.add("is-mobile");
  if (isNarrow()) el.classList.add("is-narrow");
  return el;
}
