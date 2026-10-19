import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { G, SPH, M, MB, add, seg } from "./critterShared.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const hairTones = [0x201c1b, 0x342722, 0x17191d, 0x5a3d2c, 0x332f2b, 0x7e5d3e, 0x2a2429];
const skinShade = (hex, factor) => {
  const color = new THREE.Color(hex);
  const hsl = {};
  color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s * 0.94, THREE.MathUtils.clamp(hsl.l * factor, 0.04, 0.95));
  return color.getHex();
};

export function buildHead(c) {
  const a = c.appearance;
  const skinHex = a.skin ? parseInt(a.skin.replace("#", ""), 16) : 0xe9b998;
  const skin = M(skinHex);
  const skinShadow = M(skinShade(skinHex, 0.86));
  const hairHex = a.hair ? parseInt(a.hair.replace("#", ""), 16) : hairTones[(c.variant + (a.palette || 0)) % hairTones.length];
  const hair = M(hairHex);
  const hairLight = M(skinShade(hairHex, 1.18));

  const head = new THREE.Group();
  head.name = "Head rig";
  head.position.set(0, 0.300, 0.004);
  head.scale.setScalar(0.86);
  c.spine.add(head);
  c.headGroup = head;

  /* ── KEPALA ── */
  add(head, SPH(), skin, 0, 0.066, 0.004, 0.075, 0.087, 0.079);
  add(head, SPH(), skin, 0, 0.030, 0.014, 0.055, 0.040, 0.058);
  for (const side of [-1, 1]) {
    add(head, SPH(), skin, side * 0.073, 0.052, 0.002, 0.010, 0.018, 0.013);
  }

  /* ── HAIR ── */
  add(head, SPH(), hair, 0, 0.110, -0.005, 0.086, 0.065, 0.082);
  add(head, SPH(), hair, 0, 0.075, -0.048, 0.076, 0.076, 0.048);

  // Gaya rambut: kalau appearance menyertakan hairStyle (1..5) pakai itu,
  // kalau tidak → ikut variation bawaan (variant + palet spesies).
  const style = a.hairStyle
    ? ((Math.round(a.hairStyle) - 1) % 5 + 5) % 5
    : (c.variant + (c.spec.palette || 0)) % 5;

  if (style === 0) {
    add(head, SPH(), hairLight, -0.032, 0.115, 0.068, 0.042, 0.022, 0.020, 0, 0, -0.25);
  } else if (style === 1) {
    add(head, SPH(), hair, -0.040, 0.155, 0.005, 0.032, 0.020, 0.030);
    add(head, SPH(), hairLight, 0.038, 0.158, -0.010, 0.028, 0.018, 0.028);
    add(head, SPH(), hair, 0.000, 0.170, -0.015, 0.028, 0.018, 0.026);
  } else if (style === 2) {
    add(head, SPH(), hairLight, -0.028, 0.115, 0.065, 0.032, 0.020, 0.018, 0, 0, -0.20);
    add(head, SPH(), hair, 0.028, 0.115, 0.065, 0.032, 0.020, 0.018, 0, 0, 0.20);
  } else if (style === 3) {
    // buzz cut
  } else {
    add(head, SPH(), hair, 0, 0.070, -0.108, 0.040, 0.044, 0.040);
    add(head, SPH(), hairLight, 0, 0.092, -0.105, 0.032, 0.022, 0.030);
  }

  /* ── WAJAH ── */
  const face = {};
  c.faceRig = face;
  const eyeWhite = M(0xfaf9f6);
  const iris = M(a.eyes ? parseInt(a.eyes.replace("#", ""), 16) : 0x493629);
  const pupil = MB(0x121316);
  const highlight = MB(0xffffff);
  const browMat = M(skinShade(hairHex, 0.82));

  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.031, 0.064, 0.0675);
    head.add(eye);
    add(eye, SPH(), eyeWhite, 0, 0, 0, 0.016, 0.019, 0.0085);
    const irisGroup = new THREE.Group();
    eye.add(irisGroup);
    add(irisGroup, SPH(), iris, 0, -0.001, 0.0070, 0.0108, 0.013, 0.0045);
    add(irisGroup, SPH(), pupil, 0, -0.001, 0.0105, 0.0056, 0.0078, 0.0025);
    add(irisGroup, SPH(), highlight, 0.0037, 0.0045, 0.0125, 0.0025, 0.0026, 0.0012);
    const brow = add(head,
      G("human-brow", () => new THREE.CapsuleGeometry(0.003, 0.022, 3, 8)), browMat,
      side * 0.031, 0.092, 0.074, 1, 1, 1, 0, 0, Math.PI / 2);
    face[side > 0 ? "eyeL" : "eyeR"] = { group: eye, iris: irisGroup };
    face[side > 0 ? "browL" : "browR"] = brow;
  }

  add(head, SPH(), skinShadow, 0, 0.045, 0.080, 0.010, 0.007, 0.005);

  const mouth = new THREE.Group();
  // menempel di permukaan wajah: permukaan muka di ketinggian mulut ada di
  // z ≈ 0.070, jadi mulut tidak boleh dipasang lebih maju dari itu
  // (sedikit miring mengikuti lengkungan bawah hidung)
  mouth.position.set(0, 0.024, 0.070);
  mouth.rotation.x = 0.18;
  head.add(mouth);
  face.mouth = mouth;
  face.mArc = add(mouth,
    G("human-smile", () => new THREE.TorusGeometry(0.0135, 0.0018, 6, 22, Math.PI)),
    MB(0x6a3332), 0, 0, 0, 1, 1, 1, 0, 0, Math.PI);
  face.mD = add(mouth,
    G("human-grin", () => new THREE.CircleGeometry(0.016, 22, Math.PI, Math.PI)),
    MB(0x53262a), 0, -0.004, 0.0005);
  face.mTeeth = add(mouth,
    G("human-teeth", () => new THREE.CircleGeometry(0.013, 22, Math.PI, Math.PI)),
    MB(0xfaf7ef), 0, -0.004, 0.001);
  face.mO = add(mouth,
    G("human-surprise", () => new THREE.CircleGeometry(0.011, 22)),
    MB(0x53262a), 0, -0.004, 0.0005);
  face.mD.visible = face.mTeeth.visible = face.mO.visible = false;

  /* ── GLASSES ── */
  const frameMat = M(0x272a30, { metalness: 0.35, roughness: 0.36 });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xdce9f8, transparent: true, opacity: 0.13,
    roughness: 0.16, metalness: 0.08, depthWrite: false,
  });
  const glasses = new THREE.Group();
  glasses.name = "Glasses";
  const lensRing = G("human-lens-ring", () => new THREE.TorusGeometry(0.023, 0.0025, 8, 26));
  const lensDisc = G("human-lens-disc", () => new THREE.CircleGeometry(0.0225, 26));
  for (const side of [-1, 1]) {
    add(glasses, lensRing, frameMat, side * 0.031, 0.064, 0.081, 1.08, 1, 1);
    add(glasses, lensDisc, lensMat, side * 0.031, 0.064, 0.0818, 1.08, 1, 1);
    seg(glasses, V(side * 0.055, 0.066, 0.078), V(side * 0.077, 0.061, 0.009), 0.0028, 0.0028, frameMat);
  }
  add(glasses, new RoundedBoxGeometry(0.014, 0.003, 0.003, 2, 0.001), frameMat, 0, 0.067, 0.081);
  glasses.visible = a.glasses === true;
  head.add(glasses);
  c.glasses = glasses;

  /* ── HEADPHONES ── */
  const headphones = new THREE.Group();
  headphones.name = "Headphones";
  const hpMat = M(0x22262d);
  add(headphones,
    G("headphone-band", () => new THREE.TorusGeometry(0.083, 0.006, 8, 30, Math.PI)),
    hpMat, 0, 0.074, -0.006, 1, 1, 1, 0, 0, Math.PI);
  for (const side of [-1, 1]) {
    add(headphones,
      G("headphone-cup", () => new THREE.CylinderGeometry(0.027, 0.027, 0.020, 20)),
      hpMat, side * 0.081, 0.058, 0, 1, 1, 1, 0, 0, Math.PI / 2);
    add(headphones, SPH(), M(0x555e6b), side * 0.090, 0.058, 0, 0.012, 0.022, 0.022);
  }
  headphones.visible = a.headphones === true;
  head.add(headphones);
  c.headphonesProp = headphones;

  /* ── HAT (staff uniform) ────────────────────────────────────────── *
   *  Barista & resepsionis memakai topi hitam (cap dengan brim).
   *  Topi menutupi hair-cap dan mempertegas status "staff khusus".
   */
  if (a.hat) {
    const hatMat = M(0x181a20, { roughness: 0.74, metalness: 0.06 });
    const brimMat = M(0x0a0b10, { roughness: 0.68, metalness: 0.10 });
    const buttonMat = M(a.tieColor ?? 0x2a2d33, { roughness: 0.5, metalness: 0.2 });

    const hatGroup = new THREE.Group();
    hatGroup.name = "Staff cap";

    // Crown — dome lembut di atas kepala
    add(hatGroup, SPH(), hatMat, 0, 0.160, -0.008, 0.092, 0.055, 0.088);

    // Brim — menjorok ke depan (arah +z), dimiringkan sedikit ke bawah
    add(hatGroup, new RoundedBoxGeometry(0.155, 0.012, 0.085, 3, 0.006),
      brimMat, 0, 0.128, 0.068, 1, 1, 1, -0.14, 0, 0);

    // Tombol atas — pakai warna aksen (barista=green, receptionist=blue)
    add(hatGroup, SPH(), buttonMat, 0, 0.214, -0.008, 0.013, 0.009, 0.013);

    head.add(hatGroup);
    c.hatGroup = hatGroup;
  }

  c.eyeY = 0.485 + 0.035 + head.position.y + 0.064 * head.scale.y;
  return head;
}