import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { G, SPH, BOX, M, MB, add, seg, shade, rrect } from "./critterShared.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const cap = (key, radius, length) =>
  G(key, () => new THREE.CapsuleGeometry(radius, length, 10, 22));const cylinder = (key, top, bottom, height, segments = 22) =>
  G(key, () => new THREE.CylinderGeometry(top, bottom, height, segments));

const CLOTHING = [0x94ad9b, 0x506a85, 0xd4c7b5, 0xb96850, 0x8980a8, 0x333943, 0x9ca9b8, 0xc0a06b];
const TROUSERS = [0x343b45, 0x4a5360, 0x8c8175, 0x2b2f35, 0x484254, 0x4d5b51];

export const HIP_Y = 0.485;
export const BODY_HEIGHT = 1.1;

function makeIdCard(c, accent) {
  const width = 280, height = 392; // rasio badge memanjang (pas kartu lebar)
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f8fafc";
  rrect(ctx, 4, 4, width - 8, height - 8, 22); ctx.fill();
  ctx.save();
  rrect(ctx, 4, 4, width - 8, height - 8, 22); ctx.clip();
  ctx.fillStyle = `#${new THREE.Color(accent).getHexString()}`;
  ctx.fillRect(0, 0, width, 76);
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.beginPath(); ctx.arc(220, 22, 48, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const dept = c.department
    ? (typeof c.department === "object" ? c.department.name : c.department)
    : "STUDIO";
  ctx.fillStyle = "#fff";
  let size = 24; ctx.font = `700 ${size}px Arial, sans-serif`;
  while (ctx.measureText(dept.toUpperCase()).width > width - 24 && size > 12) {
    size -= 2; ctx.font = `700 ${size}px Arial, sans-serif`;
  }
  ctx.fillText(dept.toUpperCase(), width / 2, 38);
  ctx.fillStyle = "#d9e2eb";
  ctx.beginPath(); ctx.arc(width / 2, 132, 34, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(width / 2, 206, 59, 43, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#1f2937";
  size = 33; ctx.font = `700 ${size}px Arial, sans-serif`;
  while (ctx.measureText(c.name).width > width - 24 && size > 13) {
    size -= 2; ctx.font = `700 ${size}px Arial, sans-serif`;
  }
  ctx.fillText(c.name, width / 2, 310);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function buildBody(c) {
  const paletteIndex = (c.variant * 2 + Math.max(0, c.spec.palette || 0)) % CLOTHING.length;
  const outfitHex = c.spec.outfit ?? CLOTHING[paletteIndex];
  // ← BARU: mendukung celana kustom (staff pakai celana hitam).
  const pantsHex = c.spec.pants
    ?? TROUSERS[(c.variant + Math.max(0, c.spec.palette || 0)) % TROUSERS.length];
  const skinHex = c.spec.skin ?? 0xe9b998;
  const accentHex = c.tieColor ?? 0x547da4;
  c.outfitHex = outfitHex;
  c.pantsHex = pantsHex;
  c.skinHex = skinHex;

  const top = M(outfitHex);
  const topDark = M(shade(outfitHex, 0.72));
  const pants = M(pantsHex);
  const pantsDark = M(shade(pantsHex, 0.70));
  const skin = M(skinHex);
  const sneaker = M(0xf2f0ea);
  const sneakerDark = M(shade(0xf2f0ea, 0.86));
  const soleMat = M(0x2e323a);
  const laceMat = M(0xd9d5cc);

  const body = new THREE.Group();
  body.name = "Casual silhouette";
  body.position.y = HIP_Y;
  c.motion.add(body);
  c.body = body;

  /* ── PELVIS ── satu rounded box mulus; dinaikkan agar bertumpuk dengan
        bawah torso — badan dan pinggang menyambung tanpa celah */
  add(body, new RoundedBoxGeometry(0.180, 0.128, 0.135, 5, 0.056), pants, 0, 0.012, -0.004);

  /* ── WAIST ── polos: tidak ada sabuk/waistband yang menonjol ── */

  /* ── LEGS ── satu radius konsisten (paha=lutut=kering) → tanpa lingkaran
        yang menonjol di sendi; kapsul tanpa pipih-skal sehingga ujung bulat
        menyatu dengan bola sendi. */
  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.name = side > 0 ? "Left hip" : "Right hip";
    hip.position.set(side * 0.048, -0.015, -0.002);
    body.add(hip);
    add(hip, SPH(), pants, 0, 0, 0, 0.052, 0.052, 0.052);
    add(hip, cap("thigh-v3", 0.052, 0.155), pants, 0, -0.115, 0);
    // lipatan saku celana di sisi luar paha
    add(hip, new RoundedBoxGeometry(0.046, 0.056, 0.008, 3, 0.004), pantsDark,
      side * 0.050, -0.105, 0.010, 1, 1, 1, 0, side * Math.PI / 2, 0);

    const knee = new THREE.Group();
    knee.position.y = -0.215;
    knee.name = side > 0 ? "Left knee" : "Right knee";
    hip.add(knee);
    add(knee, SPH(), pants, 0, 0.004, 0, 0.052, 0.052, 0.052);
    // kering lebih ramping & berhenti di dalam sepatu — celana tidak menembus
    add(knee, cap("shin-v5", 0.048, 0.130), pants, 0, -0.115, 0);
    // ujung celana tepat di atas sepatu, memeluk kering
    add(knee, cylinder("pant-cuff-v5", 0.0485, 0.0485, 0.026, 18), pantsDark, 0, -0.135, 0);

    const ankle = new THREE.Group();
    ankle.position.y = -0.207;
    knee.add(ankle);

    /* ── SEPATU ── ramping: sol tipis mengikuti, badan tidak terlalu tebal,
         depan (toe) dipendekkan; tanpa bagian belakang */
    add(ankle, new RoundedBoxGeometry(0.100, 0.020, 0.152, 6, 0.010), soleMat, 0, -0.025, 0.024);
    add(ankle, new RoundedBoxGeometry(0.100, 0.058, 0.140, 4, 0.016), sneaker, 0, 0.012, 0.024);
    add(ankle, new RoundedBoxGeometry(0.088, 0.036, 0.052, 4, 0.014), sneaker, 0, 0.000, 0.074);
    add(ankle, new RoundedBoxGeometry(0.050, 0.020, 0.048, 3, 0.009), sneakerDark, 0, 0.042, 0.030);
    for (let n = 0; n < 2; n++) {
      add(ankle, new RoundedBoxGeometry(0.024, 0.006, 0.060, 2, 0.002), laceMat,
        0, 0.030 + n * 0.011, 0.030 + n * 0.013, 1, 1, 1, -0.16 + n * 0.13, 0, 0);
      add(ankle, new RoundedBoxGeometry(0.024, 0.006, 0.060, 2, 0.002), laceMat,
        0, 0.030 + n * 0.011, 0.030 + n * 0.013, 1, 1, 1, 0.16 - n * 0.13, 0, 0);
    }
    return { hip, knee, ankle };
  };
  const leftLeg = makeLeg(1);
  const rightLeg = makeLeg(-1);
  c.legL = leftLeg.hip; c.kneeL = leftLeg.knee; c.ankL = leftLeg.ankle;
  c.legR = rightLeg.hip; c.kneeR = rightLeg.knee; c.ankR = rightLeg.ankle;

  /* ── SPINE / TORSO ── torso rounded box kontinu (yoke dicabut): tinggi
        dipendekkan supaya tidak lonjong, bagian bawahnya bertumpuk dengan
        pinggul sehingga badan-pinggul menyambung mulus */
  const spine = new THREE.Group();
  spine.position.y = 0.035;
  body.add(spine);
  c.spine = spine;

  add(spine, new RoundedBoxGeometry(0.208, 0.224, 0.150, 6, 0.066), top, 0, 0.140, -0.002);

  /* ── NECK ── */
  add(spine, cap("neck-v3", 0.032, 0.030), skin, 0, 0.275, 0.002);

  /* ── HOODIE ── punggung polos tanpa kantong hood/kerah yang menonjol ── */

  /* ── DADA ── polos: saku dada dan pin aksen dilucuti agar tidak ada
        apa pun yang menutupi / mengganggu ID card ── */

  /* ── ARMS ── kapsul dengan radius seragam per segmen; no ring di siku ── */
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.name = side > 0 ? "Left shoulder" : "Right shoulder";
    shoulder.position.set(side * 0.104, 0.204, 0);
    spine.add(shoulder);
    // bahu = bola sebesar lengan atas → mulus menyatu
    add(shoulder, SPH(), top, 0, 0, 0, 0.037, 0.037, 0.037);
    add(shoulder, cap("upper-arm-v3", 0.037, 0.085), top, 0, -0.058, 0);

    const elbow = new THREE.Group();
    elbow.name = side > 0 ? "Left elbow" : "Right elbow";
    elbow.position.y = -0.128;
    shoulder.add(elbow);
    // lengan bawah sedikit dipendekkan agar tangan tidak kelihatan terlalu panjang
    add(elbow, cap("forearm-v4", 0.034, 0.075), top, 0, -0.035, 0);
    // manset hoodie: memeluk bagian silinder lengan, muat rapi
    add(elbow, cylinder("sleeve-cuff-v4", 0.0348, 0.0348, 0.038, 18), topDark, 0, -0.060, 0);
    // pergelangan tangan kulit: pendek — tangan "masuk" ke bawah lengan;
    // kulit yang kelihatan hanya sedikit di bawah manset
    add(elbow, cylinder("wrist-v5", 0.0225, 0.0225, 0.042, 16), skin, 0, -0.095, 0);

    const hand = new THREE.Group();
    hand.position.y = -0.130;
    elbow.add(hand);
    add(hand, SPH(), skin, 0, 0, 0.006, 0.027, 0.030, 0.027);
    add(hand, cap("thumb-v3", 0.008, 0.012), skin, -side * 0.008, -0.002, 0.025, 1, 1, 1, -0.45, 0, 0);
    const hold = new THREE.Group();
    hold.position.set(0, -0.006, 0.012);
    hand.add(hold);
    return { shoulder, elbow, hand, hold };
  };
  const leftArm = makeArm(1);
  const rightArm = makeArm(-1);
  c.armL = leftArm.shoulder; c.elbowL = leftArm.elbow; c.handL = leftArm.hand; c.holdL = leftArm.hold;
  c.armR = rightArm.shoulder; c.elbowR = rightArm.elbow; c.handR = rightArm.hand; c.holdR = rightArm.hold;

  /* ── SMARTWATCH ── di ujung manset, tepat di atas tangan ── */
  const watchBand = M(0x252a31);
  add(leftArm.elbow, cylinder("watch-band-v4", 0.0248, 0.0248, 0.016, 20), watchBand, 0, -0.088, 0);
  add(leftArm.elbow, new RoundedBoxGeometry(0.013, 0.030, 0.027, 3, 0.005), M(0x323b48),
    0.025, -0.088, 0);
  add(leftArm.elbow, new RoundedBoxGeometry(0.002, 0.022, 0.020, 3, 0.001), MB(0x9ed9ed),
    0.031, -0.088, 0);

  /* ── LANYARD + ID CARD ── kartu PANJANG dari tengah dada sampai dekat dasar
        leher (tidak ada yang menutupinya); tali dari leher menempel di dada
        dan bertemu pas di ujung atas kartu ── */
  const lanyard = M(shade(accentHex, 0.78));
  const lanyardGroup = new THREE.Group();
  lanyardGroup.name = "Lanyard";
  spine.add(lanyardGroup);
  for (const side of [-1, 1]) {
    // satu tarikan tali: leher → menuruni muka dada → ujung atas kartu
    seg(lanyardGroup, V(side * 0.032, 0.240, 0.046), V(0, 0.197, 0.0745), 0.005, 0.002, lanyard);
  }

  const card = new THREE.Group();
  card.name = "Employee ID card";
  card.position.set(0, 0.148, 0.075);
  card.rotation.x = -0.04;
  lanyardGroup.add(card);
  add(card, new RoundedBoxGeometry(0.074, 0.104, 0.006, 3, 0.004), M(0xffffff), 0, 0, 0);
  const cardFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.070, 0.098),
    new THREE.MeshBasicMaterial({ map: makeIdCard(c, accentHex), toneMapped: false }),
  );
  cardFace.position.z = 0.0035;
  cardFace.renderOrder = 5;
  card.add(cardFace);
  c.nameTag = card;
  c.chestBadge = card;
  c.tie = lanyardGroup;

  /* ── TAS ── dihapus: karakter polos tanpa tas selempang/tas punggung ── */

  c._limbs = { leftLeg, rightLeg, leftArm, rightArm };
  return body;
}