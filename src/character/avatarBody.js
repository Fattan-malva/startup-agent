import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { G, SPH, BOX, M, MB, add, seg, shade, rrect } from "./critterShared.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const cap = (key, radius, length) =>
  G(key, () => new THREE.CapsuleGeometry(radius, length, 10, 22));
const cylinder = (key, top, bottom, height, segments = 22) =>
  G(key, () => new THREE.CylinderGeometry(top, bottom, height, segments));

const CLOTHING = [0x94ad9b, 0x506a85, 0xd4c7b5, 0xb96850, 0x8980a8, 0x333943, 0x9ca9b8, 0xc0a06b];
const TROUSERS = [0x343b45, 0x4a5360, 0x8c8175, 0x2b2f35, 0x484254, 0x4d5b51];

export const HIP_Y = 0.485;
export const BODY_HEIGHT = 1.1;

function makeIdCard(c, accent) {
  const width = 256, height = 320;
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
  ctx.fillText(c.name, width / 2, 268);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function buildBody(c) {
  const paletteIndex = (c.variant * 2 + Math.max(0, c.spec.palette || 0)) % CLOTHING.length;
  const outfitHex = c.spec.outfit ?? CLOTHING[paletteIndex];
  const pantsHex = TROUSERS[(c.variant + Math.max(0, c.spec.palette || 0)) % TROUSERS.length];
  const skinHex = c.spec.skin ?? 0xe9b998;
  const accentHex = c.tieColor ?? 0x547da4;
  c.outfitHex = outfitHex;
  c.pantsHex = pantsHex;
  c.skinHex = skinHex;

  const top = M(outfitHex);
  const topDark = M(shade(outfitHex, 0.72));
  const topLight = M(shade(outfitHex, 1.16));
  const pants = M(pantsHex);
  const pantsDark = M(shade(pantsHex, 0.70));
  const skin = M(skinHex);
  const sneaker = M(0xf0eee9);
  const metal = M(0x777f8a, { metalness: 0.65, roughness: 0.42 });

  const body = new THREE.Group();
  body.name = "Casual silhouette";
  body.position.y = HIP_Y;
  c.motion.add(body);
  c.body = body;

  /* ── PELVIS + BOKONG ── */
  add(body, SPH(), pants, 0, 0.005, -0.008, 0.082, 0.065, 0.062);
  add(body, SPH(), pants, 0, -0.018, -0.048, 0.080, 0.058, 0.045);
  add(body, new RoundedBoxGeometry(0.175, 0.030, 0.118, 4, 0.012), pantsDark, 0, 0.042, -0.004);
  add(body, new RoundedBoxGeometry(0.030, 0.020, 0.010, 3, 0.003), metal, 0, 0.042, 0.058);

  /* ── LEGS ── */
  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.name = side > 0 ? "Left hip" : "Right hip";
    hip.position.set(side * 0.048, -0.015, -0.002);
    body.add(hip);
    add(hip, SPH(), pants, 0, 0, 0, 0.056, 0.058, 0.060);
    add(hip, cap("thigh", 0.054, 0.155), pants, 0, -0.115, 0, 1, 1, 0.96);

    // Saku cargo: di samping luar (bukan depan)
    add(hip, new RoundedBoxGeometry(0.048, 0.058, 0.008, 3, 0.004), pantsDark,
      side * 0.052, -0.110, 0.010, 1, 1, 1, 0, side * Math.PI / 2, 0);

    const knee = new THREE.Group();
    knee.position.y = -0.215;
    knee.name = side > 0 ? "Left knee" : "Right knee";
    hip.add(knee);
    add(knee, SPH(), pants, 0, 0.005, 0, 0.052, 0.050, 0.052);
    add(knee, cap("shin", 0.048, 0.155), pants, 0, -0.105, 0, 1, 1, 0.94);
    add(knee, cylinder("ankle-cuff", 0.048, 0.048, 0.024, 18), pantsDark, 0, -0.198, 0);

    const ankle = new THREE.Group();
    ankle.position.y = -0.207;
    knee.add(ankle);

    // Sneaker utama (tanpa sol bawah)
    add(ankle, new RoundedBoxGeometry(0.100, 0.048, 0.165, 5, 0.025), sneaker, 0, -0.005, 0.035);
    // Bagian tumit
    add(ankle, new RoundedBoxGeometry(0.062, 0.036, 0.052, 4, 0.014), sneaker, 0, 0.008, -0.045);
    // Tali sepatu
    for (let n = 0; n < 3; n++) {
      add(ankle, new RoundedBoxGeometry(0.048, 0.004, 0.006, 2, 0.0015), metal,
        0, 0.022 + n * 0.001, 0.020 + n * 0.018);
    }
    return { hip, knee, ankle };
  };
  const leftLeg = makeLeg(1);
  const rightLeg = makeLeg(-1);
  c.legL = leftLeg.hip; c.kneeL = leftLeg.knee; c.ankL = leftLeg.ankle;
  c.legR = rightLeg.hip; c.kneeR = rightLeg.knee; c.ankR = rightLeg.ankle;

  /* ── SPINE / TORSO ── */
  const spine = new THREE.Group();
  spine.position.y = 0.035;
  body.add(spine);
  c.spine = spine;

  add(spine, cylinder("sweatshirt", 0.098, 0.108, 0.220, 26), top, 0, 0.110, 0, 1, 1, 0.74);
  add(spine, cylinder("hem", 0.112, 0.112, 0.028, 22), topDark, 0, 0.014, 0, 1, 1, 0.74);
  add(spine, SPH(), top, 0, 0.190, 0.008, 0.098, 0.056, 0.066);
  add(spine, SPH(), top, 0, 0.220, 0, 0.114, 0.040, 0.072);
  add(spine, new RoundedBoxGeometry(0.128, 0.095, 0.036, 4, 0.016), topDark, 0, 0.248, -0.052);
  add(spine, new RoundedBoxGeometry(0.075, 0.014, 0.006, 2, 0.003), topLight, 0, 0.262, -0.070);

  /* ── NECK ── */
  add(spine, cap("neck-v2", 0.034, 0.030), skin, 0, 0.270, 0.002);

  /* Drawstrings, kangaroo pocket, brand patch */
  for (const side of [-1, 1]) {
    seg(spine, V(side * 0.020, 0.250, 0.070), V(side * 0.024, 0.170, 0.078), 0.004, 0.003, topLight);
    add(spine, SPH(), topLight, side * 0.024, 0.167, 0.078, 0.004, 0.006, 0.004);
  }
  add(spine, new RoundedBoxGeometry(0.098, 0.048, 0.012, 4, 0.010), topDark, 0, 0.086, 0.076);
  add(spine, new RoundedBoxGeometry(0.086, 0.036, 0.010, 4, 0.008), top, 0, 0.086, 0.084);
  add(spine, new RoundedBoxGeometry(0.026, 0.018, 0.006, 3, 0.003), M(accentHex), -0.048, 0.205, 0.072);

  /* ── ARMS ── */
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.name = side > 0 ? "Left shoulder" : "Right shoulder";
    shoulder.position.set(side * 0.12, 0.212, 0);
    spine.add(shoulder);
    add(shoulder, SPH(), top, 0, 0, 0, 0.044, 0.046, 0.045);
    add(shoulder, cap("upper-arm", 0.036, 0.090), top, 0, -0.062, 0, 1, 1, 0.98);

    const elbow = new THREE.Group();
    elbow.name = side > 0 ? "Left elbow" : "Right elbow";
    elbow.position.y = -0.135;
    shoulder.add(elbow);
    add(elbow, cap("forearm", 0.031, 0.075), top, 0, -0.045, 0, 1, 1, 0.98);
    add(elbow, cylinder("cuff", 0.033, 0.033, 0.020, 18), topDark, 0, -0.100, 0);
    add(elbow, cylinder("wrist", 0.023, 0.024, 0.060, 16), skin, 0, -0.135, 0);

    const hand = new THREE.Group();
    hand.position.y = -0.174;
    elbow.add(hand);
    add(hand, SPH(), skin, 0, 0, 0.006, 0.026, 0.030, 0.024);
    add(hand, cap("thumb", 0.008, 0.012), skin, -side * 0.008, -0.002, 0.025, 1, 1, 1, -0.45, 0, 0);
    const hold = new THREE.Group();
    hold.position.set(0, -0.006, 0.012);
    hand.add(hold);
    return { shoulder, elbow, hand, hold };
  };
  const leftArm = makeArm(1);
  const rightArm = makeArm(-1);
  c.armL = leftArm.shoulder; c.elbowL = leftArm.elbow; c.handL = leftArm.hand; c.holdL = leftArm.hold;
  c.armR = rightArm.shoulder; c.elbowR = rightArm.elbow; c.handR = rightArm.hand; c.holdR = rightArm.hold;

  /* ── SMARTWATCH ── */
  const watchBand = M(0x252a31);
  add(leftArm.elbow, cylinder("watch-band", 0.027, 0.027, 0.018, 20), watchBand, 0, -0.140, 0);
  add(leftArm.elbow, new RoundedBoxGeometry(0.014, 0.034, 0.030, 3, 0.005), M(0x323b48),
    0.024, -0.140, 0);
  add(leftArm.elbow, new RoundedBoxGeometry(0.002, 0.026, 0.022, 3, 0.001), MB(0x9ed9ed),
    0.031, -0.140, 0);

  /* ── LANYARD + ID CARD (tanpa clip) ──
   *  Connector dihapus. Card top (0.1445) menyentuh ujung tali (0.145)
   *  langsung, jadi card menggantung bebas tanpa penjepit.
   */
  const lanyard = M(shade(accentHex, 0.78));
  const lanyardGroup = new THREE.Group();
  lanyardGroup.name = "Lanyard";
  spine.add(lanyardGroup);
  for (const side of [-1, 1]) {
    seg(lanyardGroup, V(side * 0.036, 0.275, 0.047), V(side * 0.018, 0.205, 0.073), 0.007, 0.003, lanyard);
    seg(lanyardGroup, V(side * 0.018, 0.205, 0.073), V(0, 0.145, 0.079), 0.007, 0.003, lanyard);
  }

  const card = new THREE.Group();
  card.name = "Employee ID card";
  card.position.set(0, 0.103, 0.083);
  card.rotation.x = -0.08;
  lanyardGroup.add(card);
  add(card, new RoundedBoxGeometry(0.062, 0.083, 0.006, 3, 0.004), M(0xffffff), 0, 0, 0);
  const cardFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.058, 0.079),
    new THREE.MeshBasicMaterial({ map: makeIdCard(c, accentHex), toneMapped: false }),
  );
  cardFace.position.z = 0.0035;
  cardFace.renderOrder = 5;
  card.add(cardFace);
  c.nameTag = card;
  c.chestBadge = card;
  c.tie = lanyardGroup;

  /* ── BAG ── */
  const bag = new THREE.Group();
  bag.name = "Cross-body bag";
  spine.add(bag);
  const bagMat = M(c.variant % 2 ? 0x2c3038 : 0x3b414b);
  seg(bag, V(-0.086, 0.27, 0.015), V(-0.068, 0.21, -0.062), 0.011, 0.004, bagMat);
  seg(bag, V(-0.068, 0.21, -0.062), V(0.104, 0.045, -0.075), 0.011, 0.004, bagMat);
  add(bag, new RoundedBoxGeometry(0.068, 0.10, 0.105, 4, 0.018), bagMat, 0.11, -0.075, -0.078);
  add(bag, new RoundedBoxGeometry(0.054, 0.03, 0.009, 3, 0.004), M(0x555d68), 0.11, -0.06, -0.023);
  if (c.variant % 3 === 1) {
    bag.clear();
    add(bag, new RoundedBoxGeometry(0.15, 0.19, 0.085, 4, 0.024), bagMat, 0, 0.11, -0.092);
    add(bag, new RoundedBoxGeometry(0.108, 0.072, 0.014, 3, 0.008), M(0x535b65), 0, 0.075, -0.141);
    for (const side of [-1, 1]) {
      seg(bag, V(side * 0.058, 0.25, -0.045), V(side * 0.07, 0.16, 0.048), 0.012, 0.004, bagMat);
    }
  }
  bag.visible = c.variant % 5 !== 4;
  c.bagProp = bag;

  add(spine, SPH(), M(accentHex), -0.125, 0.12, 0.01, 0.007, 0.009, 0.006);

  c._limbs = { leftLeg, rightLeg, leftArm, rightArm };
  return body;
}