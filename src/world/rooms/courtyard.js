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
 *    - air mancur DIY di sisi timur, lampu taman ×2 (interaktif)
 *    - planter divider di tepi selatan menyisakan gerbang x -1.6..1.6
 * ===================================================================== */
import * as THREE from "three";

import { MAT } from "../materials.js";
import {
  cyl,
  sphere,
  shade,
  createBench,
  createDivider,
  createFloorLamp,
} from "../props.js";

/* ------------------------------------------------------------------ *
 *  Air mancur taman (DIY) — bak beton + air + pilar + mangkuk.        *
 * ------------------------------------------------------------------ */
function courtyardFountain() {
  const g = new THREE.Group();
  g.name = "Air mancur taman";
  g.userData.interactionLabel = "Air mancur taman";

  const basin = cyl(1.0, 1.06, 0.44, MAT.concrete, 40, true);
  basin.position.y = 0.22;
  g.add(basin);

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x4f93b8,
    roughness: 0.06,
    metalness: 0.25,
    transparent: true,
    opacity: 0.78,
  });
  const water = cyl(0.97, 0.97, 0.05, waterMat, 40);
  water.position.y = 0.38;
  g.add(water);

  const pedestal = cyl(0.22, 0.3, 0.52, MAT.concrete, 24);
  pedestal.position.y = 0.62;
  g.add(pedestal);

  const bowl = cyl(0.44, 0.3, 0.15, MAT.concrete, 32, true);
  bowl.position.y = 0.94;
  g.add(bowl);

  const bowlWater = cyl(0.4, 0.4, 0.04, waterMat, 32);
  bowlWater.position.y = 0.98;
  g.add(bowlWater);

  const column = cyl(0.07, 0.1, 0.5, MAT.concrete, 18);
  column.position.y = 1.25;
  g.add(column);

  const finial = sphere(0.15, MAT.steel, 20, 14);
  finial.position.y = 1.55;
  g.add(finial);

  shade(g);
  g.userData.footprint = { w: 2.12, d: 2.12 };
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
