import * as THREE from "three";

/* Shared geometry/material cache for the procedural human cast. */
const geometryCache = new Map();
const materialCache = new Map();

export const G = (key, make) => {
  if (!geometryCache.has(key)) {
    const geo = make();
    geo.userData.shared = true; // dipakai bersama seluruh kru — JANGAN di-dispose
    geometryCache.set(key, geo);
  }
  return geometryCache.get(key);
};
export const SPH = () => G("human-sphere", () => new THREE.SphereGeometry(1, 32, 24));
export const BOX = () => G("human-box", () => new THREE.BoxGeometry(1, 1, 1));

export function M(hex, extra = {}) {
  const key = `${hex}|${JSON.stringify(extra)}`;
  if (!materialCache.has(`s:${key}`)) {
    const mat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.76, ...extra });
    mat.userData.shared = true; // dipakai bersama seluruh kru — JANGAN di-dispose
    materialCache.set(`s:${key}`, mat);
  }
  return materialCache.get(`s:${key}`);
}
export function MB(hex, extra = {}) {
  const key = `${hex}|${JSON.stringify(extra)}`;
  if (!materialCache.has(`b:${key}`)) {
    const mat = new THREE.MeshBasicMaterial({ color: hex, ...extra });
    mat.userData.shared = true; // dipakai bersama seluruh kru — JANGAN di-dispose
    materialCache.set(`b:${key}`, mat);
  }
  return materialCache.get(`b:${key}`);
}

export function add(parent, geometry, material, x = 0, y = 0, z = 0,
  sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Thin rectangular strip aligned from point A to B. */
export function seg(parent, a, b, w, t, material) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const mesh = new THREE.Mesh(BOX(), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.set(w, length, t);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function shade(hex, factor) {
  const color = new THREE.Color(hex);
  const hsl = {};
  color.getHSL(hsl);
  color.setHSL(hsl.h, Math.min(1, hsl.s * 1.04), THREE.MathUtils.clamp(hsl.l * factor, 0.04, 0.96));
  return color.getHex();
}

let cachedShadow = null;
export function shadowMaterial() {
  if (cachedShadow) return cachedShadow;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, "rgba(0,0,0,0.34)");
  gradient.addColorStop(0.55, "rgba(0,0,0,0.16)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  cachedShadow = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.86 });
  cachedShadow.userData.shared = true; // bayangan bersama seluruh kru — JANGAN di-dispose
  return cachedShadow;
}

export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
