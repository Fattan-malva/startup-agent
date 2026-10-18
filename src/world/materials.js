import * as THREE from "three";
import { TEX } from "./textures.js";

/* ===================================================================== *
 *  Material library
 *  One shared instance per look → fewer shader programs, fewer textures.
 * ===================================================================== */

function std(p) {
  return new THREE.MeshStandardMaterial(p);
}

let cache = null;

export function buildMaterials() {
  if (cache) return cache;

  const wall = TEX.wall;
  const wallAccent = TEX.wallAccent;
  const oak = TEX.oakFloor;
  const deskTop = TEX.deskTop;
  const darkWood = TEX.darkWood;
  const carpet = TEX.carpet;
  const rug = TEX.rug;
  const terrazzo = TEX.terrazzo;
  const tile = TEX.tile;
  const metal = TEX.metal;
  const noise = TEX.noiseNormal;

  const M = {
    /* ---- architecture ------------------------------------------------ */
    floor: std({
      map: oak.map,
      normalMap: oak.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.52,
      metalness: 0.03,
      color: 0xffffff,
      envMapIntensity: 0.55,
    }),

    wall: std({
      map: wall.map,
      normalMap: wall.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughnessMap: wall.roughnessMap,
      roughness: 0.94,
      metalness: 0,
      envMapIntensity: 0.4,
    }),

    wallAccent: std({
      map: wallAccent.map,
      normalMap: wallAccent.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 0.35,
    }),

    ceiling: std({
      map: TEX.ceiling,
      normalMap: noise,
      normalScale: new THREE.Vector2(0.2, 0.2),
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.25,
    }),

    carpet: std({
      map: carpet.map,
      normalMap: carpet.normalMap,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.98,
      metalness: 0,
      envMapIntensity: 0.2,
    }),

    rug: std({
      map: rug.map,
      normalMap: rug.normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.96,
      metalness: 0,
      envMapIntensity: 0.25,
    }),

    // Karpet polos NAVY ( lounge cafe & studio kreatif ) — tanpa tekstur.
    rugNavy: std({
      color: 0x22406b,
      roughness: 0.97,
      metalness: 0,
      envMapIntensity: 0.25,
    }),

    terrazzo: std({
      map: terrazzo.map,
      normalMap: terrazzo.normalMap,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughness: 0.68,
      metalness: 0.02,
      envMapIntensity: 0.48,
    }),

    tile: std({
      map: tile.map,
      normalMap: tile.normalMap,
      normalScale: new THREE.Vector2(0.34, 0.34),
      roughness: 0.36,
      metalness: 0.015,
      envMapIntensity: 0.72,
    }),

    glass: new THREE.MeshPhysicalMaterial({
      color: 0xdfeaf2,
      metalness: 0,
      roughness: 0.04,
      transmission: 0.96,
      thickness: 0.012,
      ior: 1.45,
      reflectivity: 0.35,
      clearcoat: 0.4,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.1,
      side: THREE.DoubleSide,
    }),

    /* ---- woods ------------------------------------------------------- */
    deskTop: std({
      map: deskTop.map,
      normalMap: deskTop.normalMap,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.46,
      metalness: 0.04,
      envMapIntensity: 0.6,
    }),

    darkWood: std({
      map: darkWood.map,
      normalMap: darkWood.normalMap,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.62,
      metalness: 0.03,
      envMapIntensity: 0.5,
    }),

    /* ---- metals & plastics ------------------------------------------- */
    steel: std({
      color: 0x9aa1a9,
      map: metal.map,
      roughnessMap: metal.roughnessMap,
      metalness: 0.92,
      roughness: 0.42,
      envMapIntensity: 1.0,
    }),

    blackMetal: std({
      color: 0x22252a,
      roughness: 0.48,
      metalness: 0.82,
      envMapIntensity: 0.9,
    }),

    chrome: std({
      color: 0xd7dbe0,
      roughness: 0.12,
      metalness: 1,
      envMapIntensity: 1.35,
    }),

    brass: std({
      color: 0xc9a25a,
      roughness: 0.28,
      metalness: 1,
      envMapIntensity: 1.2,
    }),

    plasticWhite: std({
      color: 0xf1efe9,
      roughness: 0.34,
      metalness: 0.04,
      envMapIntensity: 0.8,
    }),

    plasticDark: std({
      color: 0x1c1f23,
      roughness: 0.36,
      metalness: 0.16,
      envMapIntensity: 0.9,
    }),

    rubber: std({
      color: 0x25282c,
      roughness: 0.85,
      metalness: 0.02,
    }),

    ceramicWhite: std({
      color: 0xf6f3ec,
      roughness: 0.28,
      metalness: 0.02,
      envMapIntensity: 0.9,
    }),

    terracotta: std({
      color: 0xb5674a,
      roughness: 0.78,
      metalness: 0.02,
      envMapIntensity: 0.6,
    }),

    concrete: std({
      color: 0xbcb7ae,
      roughness: 0.9,
      metalness: 0.02,
      normalMap: noise,
      normalScale: new THREE.Vector2(0.5, 0.5),
      envMapIntensity: 0.5,
    }),

    paper: std({ color: 0xfbfaf6, roughness: 0.9, metalness: 0 }),

    screenOff: std({ color: 0x0a0d11, roughness: 0.16, metalness: 0.3, envMapIntensity: 1.1 }),

    /* ---- emissives --------------------------------------------------- */
    lightPanel: std({
      color: 0xfff6e6,
      emissive: 0xffeacb,
      emissiveIntensity: 2.4,
      roughness: 0.6,
      metalness: 0,
      toneMapped: false,
    }),

    bulb: new THREE.MeshBasicMaterial({ color: 0xfff0d0, toneMapped: false }),

    ledStrip: std({
      color: 0x8fe8ff,
      emissive: 0x63d8ff,
      emissiveIntensity: 2.2,
      roughness: 0.4,
      toneMapped: false,
    }),

    /* ---- fabrics ----------------------------------------------------- */
    fabricNavy: std({
      color: 0x2f4358,
      roughness: 0.94,
      metalness: 0,
    }),

    fabricCharcoal: std({
      color: 0x3a3d42,
      roughness: 0.95,
      metalness: 0,
    }),

    fabricSand: std({
      color: 0xc3ac8b,
      roughness: 0.95,
      metalness: 0,
    }),

    fabricRust: std({
      color: 0xa85a3c,
      roughness: 0.95,
      metalness: 0,
    }),

    fabricOlive: std({
      color: 0x66745c,
      roughness: 0.96,
      metalness: 0,
      envMapIntensity: 0.24,
    }),

    wallSage: std({
      color: 0x9fae9a,
      map: wall.map,
      normalMap: wall.normalMap,
      normalScale: new THREE.Vector2(0.32, 0.32),
      roughness: 0.91,
      metalness: 0,
      envMapIntensity: 0.3,
    }),

    wallClay: std({
      color: 0xb77860,
      map: wall.map,
      normalMap: wall.normalMap,
      normalScale: new THREE.Vector2(0.34, 0.34),
      roughness: 0.88,
      metalness: 0,
      envMapIntensity: 0.28,
    }),

    /* ---- foliage ----------------------------------------------------- */
    leaf: std({
      color: 0x3f6b45,
      roughness: 0.72,
      metalness: 0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.5,
    }),

    leafLight: std({
      color: 0x5c8a52,
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.5,
    }),

    soil: std({ color: 0x3a2e24, roughness: 1, metalness: 0 }),
  };

  // Weave the fabric textures in for the two hero upholsteries.
  const navyFab = TEX.fabric("#2f4358");
  const charcoalFab = TEX.fabric("#3a3d42");
  M.fabricNavy.map = navyFab.map;
  M.fabricNavy.normalMap = navyFab.normalMap;
  M.fabricNavy.normalScale = new THREE.Vector2(0.4, 0.4);
  M.fabricCharcoal.map = charcoalFab.map;
  M.fabricCharcoal.normalMap = charcoalFab.normalMap;
  M.fabricCharcoal.normalScale = new THREE.Vector2(0.4, 0.4);
  const oliveFab = TEX.fabric("#66745c");
  M.fabricOlive.map = oliveFab.map;
  M.fabricOlive.normalMap = oliveFab.normalMap;
  M.fabricOlive.normalScale = new THREE.Vector2(0.38, 0.38);

  cache = M;
  return M;
}

export const MAT = new Proxy(
  {},
  {
    get: (_t, key) => buildMaterials()[key],
  },
);
