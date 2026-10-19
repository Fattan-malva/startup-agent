/* ===================================================================== *
 *  Taman Tengah (courtyard) — x -5..5, z -1..9, TERBUKA ke langit.
 *
 *  Ruangan ini terdaftar di ROOMS (floor: "grass", outdoor: true) supaya
 *  dapat overlay rumput + label HUD yang benar; lantainya sudah ditutup
 *  modul ini dengan jalur gravel, jadi tidak ada lantai dalam di taman.
 *
 *  Isi:
 *    - jalur gravel 1.7 m dari pintu kaca (x 0.8) sampai gerbang selatan
 *    - 4 pohon (createPlant scale besar) + keset/bench kayu
 *    - air mancur batu klasik berukir di sisi timur, lampu taman ×2
 *    - planter divider di tepi selatan menyisakan gerbang x -1.6..1.6
 * ===================================================================== */
import * as THREE from "three";

import { MAT } from "../materials.js";
import {
  cyl,
  shade,
  createBench,
  createDivider,
  createFloorLamp,
} from "../props.js";

/* ------------------------------------------------------------------ *
 *  Air mancur klasik — batu pahat berukir: bak melebar dengan relief
 *  bunga, pilar beralur, mangkuk bertingkat, nozzle perunggu, serta
 *  aliran air yang dianimasikan (jet puncak + lengkungan + riak).
 *
 *  Ukiran berulang (kelopak, daun, manik, alur) dibangun sebagai
 *  InstancedMesh supaya draw call tetap kecil — grup ini "live"
 *  (punya userData.update) jadi tidak ikut di-merge oleh Building.
 * ------------------------------------------------------------------ */
function courtyardFountain() {
  const g = new THREE.Group();
  g.name = "Air mancur taman";
  g.userData.interactionLabel = "Air mancur taman";

  /* ── material batu & logam (gaya klasik) ──────────────────────────── */
  const stone = new THREE.MeshStandardMaterial({
    color: 0xc9c1b1,
    roughness: 0.9,
    metalness: 0.015,
    side: THREE.DoubleSide,
  });
  const stoneDark = new THREE.MeshStandardMaterial({
    color: 0x817a6e,
    roughness: 0.96,
    metalness: 0,
  });
  const bronze = new THREE.MeshStandardMaterial({
    color: 0x887552,
    roughness: 0.48,
    metalness: 0.42,
  });
  const reliefMat = new THREE.MeshStandardMaterial({
    color: 0xd9d0be,
    roughness: 0.9,
    metalness: 0,
  });
  const recessMat = new THREE.MeshStandardMaterial({
    color: 0x70695e,
    roughness: 1,
    metalness: 0,
  });

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x4f93b8,
    roughness: 0.06,
    metalness: 0.25,
    transparent: true,
    opacity: 0.78,
  });
  const streamMat = new THREE.MeshStandardMaterial({
    color: 0xbfe3f2,
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.5,
    emissive: 0x2f6f8f,
    emissiveIntensity: 0.35,
    depthWrite: false,
  });

  /* ── 1. bak melebar (r 0.82 → 1.05) ───────────────────────────────── */
  const foot = cyl(0.86, 0.9, 0.09, stoneDark, 48);
  foot.position.y = 0.045;
  g.add(foot);

  const basin = cyl(1.05, 0.82, 0.36, stone, 48, true);
  basin.position.y = 0.22;
  g.add(basin);

  const basinFloor = cyl(0.78, 0.78, 0.03, stone, 48);
  basinFloor.position.y = 0.055;
  g.add(basinFloor);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(1.02, 0.035, 10, 48),
    stone,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.408;
  g.add(rim);

  const water = cyl(0.99, 0.99, 0.04, waterMat, 44);
  water.position.y = 0.34;
  g.add(water);

  /* ── 2. pilar tengah (0.30 → 0.22) ────────────────────────────────── */
  const stem = cyl(0.24, 0.24, 0.34, stone, 28);
  stem.position.y = 0.21;
  g.add(stem);

  const pedestal = cyl(0.22, 0.3, 0.52, stone, 32);
  pedestal.position.y = 0.62;
  g.add(pedestal);

  const pedBase = cyl(0.34, 0.36, 0.06, stoneDark, 32);
  pedBase.position.y = 0.375;
  g.add(pedBase);

  const pedCap = cyl(0.3, 0.24, 0.06, stoneDark, 32);
  pedCap.position.y = 0.88;
  g.add(pedCap);

  /* ── 3. mangkuk atas (0.44 → 0.30) ────────────────────────────────── */
  const bowl = cyl(0.44, 0.3, 0.15, stone, 40, true);
  bowl.position.y = 0.94;
  g.add(bowl);

  const bowlFloor = cyl(0.31, 0.31, 0.03, stone, 40);
  bowlFloor.position.y = 0.872;
  g.add(bowlFloor);

  const bowlWater = cyl(0.4, 0.4, 0.03, waterMat, 36);
  bowlWater.position.y = 0.985;
  g.add(bowlWater);

  /* ── 4. tiang atas + nozzle perunggu ──────────────────────────────── */
  const column = cyl(0.075, 0.1, 0.5, stone, 24);
  column.position.y = 1.25;
  g.add(column);

  const columnRing = cyl(0.12, 0.12, 0.04, stoneDark, 24);
  columnRing.position.y = 1.02;
  g.add(columnRing);

  const nozzle = cyl(0.03, 0.06, 0.12, bronze, 16);
  nozzle.position.y = 1.56;
  g.add(nozzle);

  const nozzleLip = cyl(0.052, 0.038, 0.03, bronze, 16);
  nozzleLip.position.y = 1.635;
  g.add(nozzleLip);

  /* =================================================================
   *  UKIRAN BATU: ROSETTE, DAUN, MANIK-MANIK, DAN PILAR BERULIR
   *  Transform tiap ornamen dikumpulkan dulu, lalu dibangun sekali
   *  sebagai InstancedMesh (7 draw call, bukan ratusan mesh).
   * ================================================================= */
  const ornamentSphereGeo = new THREE.SphereGeometry(1, 12, 8);

  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -0.05);
  leafShape.quadraticCurveTo(0.045, -0.02, 0, 0.05);
  leafShape.quadraticCurveTo(-0.045, -0.02, 0, -0.05);

  const leafGeo = new THREE.ExtrudeGeometry(leafShape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.003,
    bevelThickness: 0.002,
  });
  leafGeo.translate(0, 0, -0.006);

  const backingXf = [];
  const petalXf = [];
  const centerXf = [];
  const leafXf = [];
  const beadLightXf = [];
  const beadDarkXf = [];
  const fluteXf = [];

  const panelRoot = new THREE.Object3D();
  const tmp = new THREE.Object3D();

  // Medali ukiran bunga pada permukaan melingkar. Sudut mengarahkan
  // ornamen agar menghadap ke luar kolam.
  function addCarvedPanel(radius, y, angle, size = 1) {
    panelRoot.position.set(
      Math.cos(angle) * radius,
      y,
      Math.sin(angle) * radius,
    );
    panelRoot.rotation.set(0, Math.PI / 2 - angle, 0);
    panelRoot.updateMatrixWorld(true);

    const put = (list, px, py, pz, sx, sy, sz, rz = 0) => {
      tmp.position.set(px, py, pz);
      tmp.rotation.set(0, 0, rz);
      tmp.scale.set(sx, sy, sz);
      tmp.updateMatrix();
      list.push(tmp.matrix.clone().premultiply(panelRoot.matrixWorld));
    };

    // Dasar gelap untuk memberi kedalaman visual pada ukiran
    put(backingXf, 0, 0, 0.006, 0.052 * size, 0.058 * size, 0.007 * size);

    // Delapan kelopak bunga
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      put(
        petalXf,
        Math.cos(a) * 0.027 * size,
        Math.sin(a) * 0.027 * size,
        0.014 * size,
        0.011 * size,
        0.023 * size,
        0.006 * size,
        Math.PI / 2 - a,
      );
    }

    // Pusat bunga (logam)
    put(centerXf, 0, 0, 0.022 * size, 0.013 * size, 0.013 * size, 0.008 * size);

    // Dua daun ukiran di kiri dan kanan rosette
    for (const side of [-1, 1]) {
      put(
        leafXf,
        side * 0.061 * size,
        -0.006 * size,
        0.009,
        0.78 * size,
        0.78 * size,
        0.78 * size,
        side * 0.75,
      );
    }
  }

  // Manik-manik batu kecil pada bibir kolam.
  function addCarvedBeadRing(radius, y, count, beadSize, list) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      tmp.position.set(
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius,
      );
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(beadSize);
      tmp.updateMatrix();
      list.push(tmp.matrix.clone());
    }
  }

  // A. Panel ukiran bunga mengelilingi badan kolam
  for (let i = 0; i < 14; i++) {
    addCarvedPanel(0.97, 0.265, (i / 14) * Math.PI * 2, 0.85);
  }
  // B. Ukiran lebih kecil pada mangkuk atas
  for (let i = 0; i < 10; i++) {
    addCarvedPanel(0.405, 0.97, (i / 10) * Math.PI * 2, 0.45);
  }
  // C. Detail manik pada bibir kolam utama
  addCarvedBeadRing(1.06, 0.408, 48, 0.011, beadLightXf);
  // D. Detail dekoratif pada bagian bawah kolam
  addCarvedBeadRing(0.895, 0.16, 36, 0.008, beadDarkXf);
  // E. Deretan batu kecil di bibir mangkuk atas
  addCarvedBeadRing(0.449, 1.018, 32, 0.0075, beadLightXf);

  // F. Alur vertikal pada pilar tengah, mengikuti kemiringan pilar agar
  //    tidak terlihat menembus batu.
  function pedestalRadiusAt(y) {
    return 0.3 - 0.08 * ((y - 0.36) / 0.52);
  }
  const fluteGeo = new THREE.CylinderGeometry(0.0045, 0.007, 1, 6);
  const up = new THREE.Vector3(0, 1, 0);
  const fluteBottomY = 0.47;
  const fluteTopY = 0.77;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const br = pedestalRadiusAt(fluteBottomY) + 0.002;
    const tr = pedestalRadiusAt(fluteTopY) + 0.002;
    const bottom = new THREE.Vector3(
      Math.cos(angle) * br,
      fluteBottomY,
      Math.sin(angle) * br,
    );
    const top = new THREE.Vector3(
      Math.cos(angle) * tr,
      fluteTopY,
      Math.sin(angle) * tr,
    );
    const dir = top.clone().sub(bottom);
    const len = dir.length();
    const mid = bottom.clone().add(top).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
    fluteXf.push(
      new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, len, 1)),
    );
  }

  function instanced(geo, mat, list) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    for (let i = 0; i < list.length; i++) m.setMatrixAt(i, list[i]);
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    g.add(m);
    return m;
  }

  instanced(ornamentSphereGeo, recessMat, backingXf);
  instanced(ornamentSphereGeo, reliefMat, petalXf);
  instanced(ornamentSphereGeo, bronze, centerXf);
  instanced(leafGeo, reliefMat, leafXf);
  instanced(ornamentSphereGeo, reliefMat, beadLightXf);
  instanced(ornamentSphereGeo, stoneDark, beadDarkXf);
  instanced(fluteGeo, reliefMat, fluteXf);

  /* ── 5. air: jet puncak, aliran melengkung, dan riak ──────────────── */
  const jetGeo = new THREE.CylinderGeometry(0.014, 0.03, 0.55, 12);
  jetGeo.translate(0, 0.275, 0);
  const jet = new THREE.Mesh(jetGeo, streamMat);
  jet.position.y = 1.645;
  g.add(jet);

  const arcs = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 1.63, 0),
      new THREE.Vector3(dx * 0.5, 2.12, dz * 0.5),
      new THREE.Vector3(dx * 0.9, 0.36, dz * 0.9),
    );
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 22, 0.011, 6, false),
      streamMat.clone(),
    );
    tube.castShadow = false;
    g.add(tube);
    arcs.push(tube);
  }

  const ripples = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xcfeaf5,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.84, 1.0, 40), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.365, 0);
    ring.renderOrder = 2;
    g.add(ring);
    ripples.push({ mesh: ring, phase: i / 3 });
  }

  const bowlRippleMat = new THREE.MeshBasicMaterial({
    color: 0xcfeaf5,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bowlRipple = new THREE.Mesh(
    new THREE.RingGeometry(0.84, 1.0, 40),
    bowlRippleMat,
  );
  bowlRipple.rotation.x = -Math.PI / 2;
  bowlRipple.position.set(0, 1.0, 0);
  bowlRipple.renderOrder = 2;
  g.add(bowlRipple);

  shade(g);
  for (const m of [
    water,
    bowlWater,
    jet,
    ...arcs,
    bowlRipple,
    ...ripples.map((r) => r.mesh),
  ]) {
    m.castShadow = false;
  }

  g.userData.update = (dt, t) => {
    // jet puncak berdenyut halus
    jet.scale.set(1, 1 + Math.sin(t * 6.2) * 0.035, 1);
    streamMat.opacity = 0.46 + Math.sin(t * 11) * 0.06;

    // aliran melengkung — fase berbeda supaya tampak mengalir
    for (let i = 0; i < arcs.length; i++) {
      arcs[i].material.opacity = 0.42 + Math.sin(t * 7.5 + i * 0.85) * 0.14;
    }

    // riak menyebar di bak
    for (const r of ripples) {
      const s = (t * 0.4 + r.phase) % 1;
      r.mesh.scale.setScalar(0.15 + s * 0.8);
      r.mesh.material.opacity = (1 - s) * 0.3;
    }

    // riak kecil di mangkuk atas
    const bs = (t * 0.75) % 1;
    bowlRipple.scale.setScalar(0.1 + bs * 0.28);
    bowlRippleMat.opacity = (1 - bs) * 0.35;

    // permukaan air berdenyut halus
    water.position.y = 0.34 + Math.sin(t * 2.1) * 0.0022;
    bowlWater.position.y = 0.985 + Math.sin(t * 2.8 + 1) * 0.0018;
  };

  g.userData.footprint = { w: 2.16, d: 2.16 };
  return g;
}

export function build(b) {
  /* ── Jalur gravel pintu masuk → gerbang taman ──────────────────────
   *  Sumbu simetri bangunan: x = 0. Jalur ini LURUS (z -1..9) dan selebar
   *  pintu kaca (2.0 m) supaya benar-benar segaris dengan pintu Lobby.
   *  Material gravel di-clone supaya repeat-nya persegi di jalur. */
  const gravelMat = MAT.gravel.clone();
  gravelMat.map = MAT.gravel.map.clone();
  gravelMat.normalMap = MAT.gravel.normalMap.clone();
  for (const t of [gravelMat.map, gravelMat.normalMap]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3.5, 17);
    t.needsUpdate = true;
  }

  const path = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 10.0), gravelMat);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0.0, 0.016, 4.0);
  path.receiveShadow = true;
  b.staticGroup.add(path);

  /* ── Pohon peneduh (4 sudut taman) ───────────────────────────────── */
  b._plant(-3.4, 1.6, 0, { variant: 0, scale: 1.6, seed: 201 }, "Pohon taman");
  b._plant(3.4, 1.6, 0, { variant: 1, scale: 1.6, seed: 202 }, "Pohon taman");
  b._plant(-3.4, 6.4, 0, { variant: 2, scale: 1.6, seed: 203 }, "Pohon taman");
  b._plant(3.4, 6.4, 0, { variant: 0, scale: 1.6, seed: 204 }, "Pohon taman");

  /* ── Bangku taman di sisi jalur (menghadap jalur) ────────────────── */
  b._static(createBench({ w: 1.35, d: 0.44, h: 0.48 }), -1.75, 3.0, Math.PI / 2);
  b._static(createBench({ w: 1.35, d: 0.44, h: 0.48 }), 1.75, 3.0, -Math.PI / 2);
  b._static(createBench({ w: 1.35, d: 0.44, h: 0.48 }), -1.8, 7.4, Math.PI / 2);
  b._static(createBench({ w: 1.35, d: 0.44, h: 0.48 }), 1.8, 7.4, -Math.PI / 2);

  /* ── Air mancur + lampu taman ────────────────────────────────────── */
  const fountain = courtyardFountain();
  b._static(fountain, 2.9, 4.6, 0);
  b._interactive(fountain, {
    id: "courtyard-fountain",
    label: "Air mancur taman",
    hint: "Klik untuk mendengarkan gemericik air",
    radius: 1.7,
    onClick: () => "Gemericik air menenangkan — pikiran jadi ringan 🌊",
  });

  for (const [lx, lz, i] of [[-4.2, 3.4, 0], [4.2, 3.4, 1]]) {
    const lamp = createFloorLamp();
    b._static(lamp, lx, lz, 0);
    b._interactive(lamp, {
      id: `courtyard-lamp-${i}`,
      label: "Lampu taman",
      hint: "Klik untuk nyala / mati",
      radius: 0.9,
      onClick: (self) => (self.userData.api.toggle() ? "Lampu taman nyala" : "Lampu taman mati"),
    });
  }

  /* ── Tanaman kecil dekat pintu kaca (simetris terhadap sumbu x = 0) ── */
  b._plant(-1.75, -0.35, 0, { variant: 2, scale: 0.62, seed: 205 }, "Tanaman taman");
  b._plant(1.75, -0.35, 0, { variant: 1, scale: 0.62, seed: 206 }, "Tanaman taman");

  /* ── Planter tepi selatan: menyisakan gerbang x -1.6..1.6 ────────── */
  for (const dx of [-4.1, -2.4, 2.4, 4.1]) {
    b._static(createDivider({ w: 1.6, h: 1.0 }), dx, 8.6, 0);
  }
}
