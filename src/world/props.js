import * as THREE from "three";
import { MAT } from "./materials.js";
import { TEX, mulberry32 } from "./textures.js";

/* ===================================================================== *
 *  Prop foundry
 *  Every object returns a THREE.Group with:
 *    userData.api     → imperative controls  (power, brew, water, …)
 *    userData.parts   → named sub-objects    (screen, light, …)
 *    userData.update  → (dt, elapsed) animation hook
 *    userData.anchor  → spot the avatar/UI should look at
 * ===================================================================== */

/* ---------------------------------------------------------------- utils */

const geoCache = new Map();
function cached(key, build) {
  if (!geoCache.has(key)) geoCache.set(key, build());
  return geoCache.get(key);
}

/** Rounded box — the workhorse of the whole set. */
export function roundedBox(w, h, d, r = 0.04, bevel = 0.01) {
  const key = `rb:${w}:${h}:${d}:${r}:${bevel}`;
  return cached(key, () => {
    const rr = Math.min(r, Math.min(w, h) / 2 - 0.001);
    const shape = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    shape.moveTo(x + rr, y);
    shape.lineTo(x + w - rr, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + rr);
    shape.lineTo(x + w, y + h - rr);
    shape.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    shape.lineTo(x + rr, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - rr);
    shape.lineTo(x, y + rr);
    shape.quadraticCurveTo(x, y, x + rr, y);

    const b = Math.max(0.0015, bevel);
    const depth = Math.max(0.002, d - b * 2);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: 2,
      curveSegments: 5,
    });
    geo.translate(0, 0, -depth / 2);
    geo.computeVertexNormals();
    return geo;
  });
}

export function rbox(w, h, d, r = 0.04, mat = MAT.plasticDark, bevel = 0.01) {
  return new THREE.Mesh(roundedBox(w, h, d, r, bevel), mat);
}

export function box(w, h, d, mat) {
  return new THREE.Mesh(cached(`b:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)), mat);
}

export function cyl(rt, rb, h, mat, seg = 20, open = false) {
  return new THREE.Mesh(
    cached(`c:${rt}:${rb}:${h}:${seg}:${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)),
    mat,
  );
}

export function sphere(r, mat, w = 20, h = 14) {
  return new THREE.Mesh(
    cached(`s:${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h)),
    mat,
  );
}

function put(obj, x = 0, y = 0, z = 0) {
  obj.position.set(x, y, z);
  return obj;
}

export function shade(root, cast = true, receive = true) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return root;
}

/* ------------------------------------------------------- small surfaces */

function keyboardTexture() {
  const key = "kbTex";
  return cached(key, () => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 192;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#20242a";
    ctx.fillRect(0, 0, 512, 192);

    const rows = [14, 14, 13, 12, 8];
    let y = 14;
    rows.forEach((n, ri) => {
      let x = 14 + ri * 3;
      const kw = (512 - 28 - ri * 6) / n;
      for (let i = 0; i < n; i++) {
        const wide = ri === 4 && (i === 3 || i === 4);
        const w = wide ? kw * 3 : kw;
        ctx.fillStyle = "#2c3138";
        ctx.beginPath();
        ctx.roundRect(x + 1.5, y + 1.5, w - 3, 26, 4);
        ctx.fill();
        ctx.fillStyle = "#383e46";
        ctx.beginPath();
        ctx.roundRect(x + 1.5, y + 1.5, w - 3, 24, 4);
        ctx.fill();
        x += w;
        if (wide) i++;
      }
      y += 34;
    });
    // glare
    const g = ctx.createLinearGradient(0, 0, 512, 192);
    g.addColorStop(0, "rgba(255,255,255,0.09)");
    g.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 192);

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
}

function screenFaceTexture(file) {
  const key = `face:${file}`;
  return cached(key, () => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 160;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, 256, 160);
    // photo-ish gradient wallpaper
    const g = ctx.createLinearGradient(0, 0, 256, 160);
    g.addColorStop(0, file % 2 ? "#1b3b52" : "#3a2b4d");
    g.addColorStop(0.5, file % 2 ? "#2c6a72" : "#7a4a3a");
    g.addColorStop(1, "#0d1116");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 160);
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.07})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 160, 40 + Math.random() * 90, 1.5);
    }
    ctx.globalAlpha = 1;
    // window chrome
    ctx.fillStyle = "rgba(10,12,16,0.75)";
    ctx.fillRect(0, 0, 256, 22);
    ctx.fillStyle = "#3ddc97";
    ctx.beginPath();
    ctx.arc(14, 11, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = '500 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText("atelier — notes", 34, 15);
    // text lines
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (let l = 0; l < 6; l++) {
      ctx.fillRect(24, 46 + l * 16, 90 + ((l * 37) % 110), 5);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/* ===================================================================== *
 *  Workstation
 * ===================================================================== */

export function createDesk({ width = 1.85, depth = 0.82, height = 0.74 } = {}) {
  const g = new THREE.Group();
  g.name = "Meja kerja";
  g.userData.interactionLabel = "Meja kerja";
  const topT = 0.042;
  const top = rbox(width, topT, depth, 0.028, MAT.deskTop, 0.006);
  put(top, 0, height - topT / 2, 0);
  g.add(top);

  // steel trestle legs
  const legH = height - topT;
  const legR = 0.024;
  [-1, 1].forEach((sx) => {
    const x = sx * (width / 2 - 0.2);
    const bar = cyl(legR, legR, depth - 0.16, MAT.blackMetal, 12);
    bar.rotation.x = Math.PI / 2;
    put(bar, x, legH * 0.62, 0);
    g.add(bar);
    [-1, 1].forEach((sz) => {
      const leg = cyl(0.026, 0.026, legH, MAT.blackMetal, 12);
      put(leg, x, legH / 2, sz * (depth / 2 - 0.11));
      g.add(leg);
      const foot = cyl(0.032, 0.032, 0.012, MAT.rubber, 12);
      put(foot, x, 0.006, sz * (depth / 2 - 0.11));
      g.add(foot);
    });
  });

  // cable tray + modesty panel
  const tray = rbox(width - 0.5, 0.05, 0.16, 0.02, MAT.steel, 0.004);
  put(tray, 0, height - 0.14, -depth / 2 + 0.16);
  g.add(tray);

  const panel = rbox(width - 0.55, 0.34, 0.02, 0.02, MAT.steel, 0.004);
  put(panel, 0, height - 0.3, -depth / 2 + 0.08);
  g.add(panel);

  // under-desk pedestal
  const ped = new THREE.Group();
  const pw = 0.42;
  const pd = depth - 0.16;
  const ph = 0.44;
  const shell = rbox(pw, ph, pd, 0.012, MAT.plasticWhite, 0.005);
  put(shell, 0, ph / 2 + 0.02, 0);
  ped.add(shell);
  for (let i = 0; i < 2; i++) {
    const face = rbox(pw - 0.05, ph / 2 - 0.05, 0.02, 0.008, MAT.deskTop, 0.004);
    put(face, 0, ph * 0.75 - i * (ph / 2), pd / 2 + 0.005);
    ped.add(face);
    const handle = cyl(0.007, 0.007, pw - 0.16, MAT.chrome, 10);
    handle.rotation.z = Math.PI / 2;
    put(handle, 0, ph * 0.75 - i * (ph / 2), pd / 2 + 0.03);
    ped.add(handle);
  }
  put(ped, width / 2 - pw / 2 - 0.06, 0, 0);
  g.add(ped);

  shade(g);
  g.userData.footprint = { w: width, d: depth };
  g.userData.anchor = new THREE.Vector3(0, height, 0);
  return g;
}

export function createMonitor({ width = 0.6, height = 0.355, tilt = -0.05 } = {}) {
  const g = new THREE.Group();
  g.name = "Monitor";
  g.userData.interactionLabel = "Monitor";

  const bezel = rbox(width, height, 0.026, 0.014, MAT.plasticDark, 0.006);
  put(bezel, 0, 0.22 + height / 2, 0);
  g.add(bezel);

  const screenMat = new THREE.MeshStandardMaterial({
    map: TEX.dashboard,
    emissive: 0xffffff,
    emissiveMap: TEX.dashboard,
    emissiveIntensity: 1.25,
    roughness: 0.22,
    metalness: 0,
    toneMapped: false,
  });
  const screen = new THREE.Mesh(
    cached(`scr:${width}:${height}`, () => new THREE.PlaneGeometry(width - 0.016, height - 0.016)),
    screenMat,
  );
  put(screen, 0, 0.22 + height / 2, 0.0145);
  g.add(screen);

  // brand led
  const led = box(0.03, 0.006, 0.004, MAT.ledStrip);
  put(led, 0, 0.232, 0.015);
  g.add(led);

  // stand
  const neck = rbox(0.075, 0.2, 0.022, 0.01, MAT.steel, 0.005);
  put(neck, 0, 0.145, -0.02);
  neck.rotation.x = 0.12;
  g.add(neck);

  const base = cyl(0.15, 0.17, 0.016, MAT.steel, 28);
  put(base, 0, 0.014, 0.01);
  g.add(base);

  g.rotation.x = tilt;
  shade(g);

  let on = true;
  g.userData.parts = { screen: screenMat, led };
  g.userData.api = {
    get isOn() {
      return on;
    },
    setPower(v) {
      on = v;
      screenMat.emissiveIntensity = v ? 1.25 : 0;
      screenMat.map = v ? TEX.dashboard : null;
      LED_MATS(v);
    },
    toggle() {
      this.setPower(!on);
    },
    cycle() {
      const opts = ["dashboard", "face0", "face1"];
      this._i = ((this._i ?? 0) + 1) % opts.length;
      const k = opts[this._i];
      screenMat.map = k === "dashboard" ? TEX.dashboard : screenFaceTexture(this._i);
      screenMat.emissiveMap = screenMat.map;
      screenMat.emissiveIntensity = 1.25;
      screenMat.needsUpdate = true;
    },
  };
  function LED_MATS(v) {
    led.material = v ? MAT.ledStrip : MAT.plasticDark;
  }

  g.userData.update = (dt, t) => {
    if (on) screenMat.emissiveIntensity = 1.2 + Math.sin(t * 9.3) * 0.045;
  };
  return g;
}

export function createKeyboard({ width = 0.42, depth = 0.15 } = {}) {
  const g = new THREE.Group();
  g.name = "Keyboard";
  g.userData.interactionLabel = "Keyboard";
  const body = rbox(width, 0.018, depth, 0.008, MAT.plasticDark, 0.004);
  put(body, 0, 0.009, 0);
  g.add(body);

  const mat = new THREE.MeshStandardMaterial({
    map: keyboardTexture(),
    roughness: 0.55,
    metalness: 0.1,
  });
  const top = new THREE.Mesh(
    cached(`kbtop:${width}:${depth}`, () => new THREE.PlaneGeometry(width - 0.02, depth - 0.02)),
    mat,
  );
  top.rotation.x = -Math.PI / 2;
  put(top, 0, 0.019, 0);
  g.add(top);
  shade(g);
  return g;
}

export function createMouse() {
  const g = new THREE.Group();
  g.name = "Mouse";
  g.userData.interactionLabel = "Mouse";
  const body = sphere(0.045, MAT.plasticDark, 22, 16);
  body.scale.set(0.62, 0.5, 1);
  put(body, 0, 0.022, 0);
  g.add(body);
  const scroll = cyl(0.008, 0.008, 0.016, MAT.plasticDark, 8);
  scroll.rotation.x = Math.PI / 2;
  put(scroll, 0, 0.041, 0.008);
  g.add(scroll);
  shade(g);
  return g;
}

export function createMug({ color = 0xe8e3d8 } = {}) {
  const g = new THREE.Group();
  g.name = "Cangkir";
  g.userData.interactionLabel = "Cangkir";
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.03, envMapIntensity: 0.9 });
  const body = cyl(0.042, 0.036, 0.095, mat, 24, true);
  put(body, 0, 0.0475, 0);
  g.add(body);
  const base = cyl(0.036, 0.036, 0.006, mat, 24);
  put(base, 0, 0.003, 0);
  g.add(base);
  const coffee = cyl(0.036, 0.036, 0.002, new THREE.MeshStandardMaterial({ color: 0x3a2216, roughness: 0.25 }), 20);
  put(coffee, 0, 0.088, 0);
  g.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 20, Math.PI * 1.35), mat);
  handle.rotation.y = Math.PI / 2;
  handle.rotation.z = -0.4;
  put(handle, 0.045, 0.056, 0);
  g.add(handle);
  shade(g);
  return g;
}

export function createNotepad() {
  const g = new THREE.Group();
  g.name = "Notepad";
  g.userData.interactionLabel = "Notepad";
  const paper = rbox(0.22, 0.012, 0.3, 0.004, MAT.paper, 0.002);
  put(paper, 0, 0.006, 0);
  g.add(paper);
  const back = rbox(0.225, 0.01, 0.305, 0.004, MAT.darkWood, 0.002);
  put(back, 0, 0.0, 0);
  g.add(back);

  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 340;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(0, 0, 256, 340);
  ctx.strokeStyle = "rgba(80,110,140,0.35)";
  for (let y = 40; y < 340; y += 26) {
    ctx.beginPath();
    ctx.moveTo(18, y);
    ctx.lineTo(238, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(196,80,70,0.5)";
  ctx.beginPath();
  ctx.moveTo(34, 0);
  ctx.lineTo(34, 340);
  ctx.stroke();
  ctx.fillStyle = "#2b3a4a";
  ctx.font = '600 22px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("standup · 09:00", 44, 34);
  ctx.strokeStyle = "#2b3a4a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(44, 60);
  ctx.bezierCurveTo(90, 52, 120, 74, 170, 62);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(44, 88);
  ctx.bezierCurveTo(96, 96, 140, 74, 210, 90);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.205, 0.28), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
  sheet.rotation.x = -Math.PI / 2;
  put(sheet, 0, 0.0125, 0);
  g.add(sheet);
  shade(g);
  return g;
}

export function createDeskLamp({ color = 0xd8663c } = {}) {
  const g = new THREE.Group();
  g.name = "Lampu meja";
  g.userData.interactionLabel = "Lampu meja";

  const shell = new THREE.MeshStandardMaterial({
    color, roughness: 0.32, metalness: 0.35, envMapIntensity: 1,
  });

  // Base
  const base = cyl(0.085, 0.1, 0.016, shell, 28);
  put(base, 0, 0.008, 0);
  g.add(base);

  // Lower arm — vertical, dari base ke elbow. Menyentuh base tepat.
  const lowerLen = 0.28;
  const lower = cyl(0.012, 0.012, lowerLen, shell, 12);
  put(lower, 0, 0.016 + lowerLen / 2, 0);   // top di y = 0.296
  g.add(lower);

  // Elbow joint (silinder horizontal) — menyentuh ujung lower arm.
  const joint = cylinderJoint();
  put(joint, 0, 0.296, 0);
  g.add(joint);

  // Upper arm — dimulai tepat di elbow, mengarah ke depan.
  const upperLen = 0.24;
  const armAngle = -0.75;
  const upper = new THREE.Group();
  upper.position.set(0, 0.296, 0);
  upper.rotation.z = armAngle;
  g.add(upper);

  const upperArm = cyl(0.011, 0.011, upperLen, shell, 12);
  put(upperArm, 0, upperLen / 2, 0);
  upper.add(upperArm);

  // Shade — dipasang di ujung upper arm, tetap tegak di world.
  const shadeGroup = new THREE.Group();
  shadeGroup.position.set(0, upperLen, 0);
  shadeGroup.rotation.z = -armAngle;   // membatalkan rotasi parent
  upper.add(shadeGroup);

  const shadeMesh = cyl(0.055, 0.095, 0.13, shell, 24, true);
  put(shadeMesh, 0, -0.065, 0);
  shadeGroup.add(shadeMesh);

  const bulb = sphere(0.042, MAT.bulb, 16, 12);
  bulb.scale.set(1, 0.7, 1);
  put(bulb, 0, -0.09, 0);
  shadeGroup.add(bulb);

  const light = new THREE.PointLight(0xffc98a, 0, 4.2, 2);
  put(light, 0, -0.14, 0);
  shadeGroup.add(light);

  shade(g);

  let on = false;
  const pupil = () => {
    light.intensity = on ? 6.5 : 0;
    bulb.visible = on;
  };
  pupil();

  g.userData.parts = { light, bulb, shade: shadeMesh };
  g.userData.api = {
    get isOn() { return on; },
    toggle() { on = !on; pupil(); return on; },
    set(v) { on = v; pupil(); },
  };

  g.userData.update = (dt, t) => {
    if (on) light.intensity = 6.5 + Math.sin(t * 30) * 0.08;
  };

  return g;
}

function cylinderJoint() {
  const m = new THREE.Group();
  const j = cyl(0.022, 0.022, 0.05, MAT.blackMetal, 14);
  j.rotation.z = Math.PI / 2;
  m.add(j);
  return m;
}

export function createOfficeChair({ color = "charcoal" } = {}) {
  const fabric = color === "navy" ? MAT.fabricNavy : MAT.fabricCharcoal;
  const g = new THREE.Group();
  g.name = "Kursi ergonomis";
  g.userData.interactionLabel = "Kursi ergonomis";

  // five-star base
  const base = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = rbox(0.3, 0.028, 0.05, 0.012, MAT.blackMetal, 0.006);
    arm.position.set(Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15);
    arm.rotation.y = -a;
    arm.rotation.z = -0.12;
    base.add(arm);
    const wheel = sphere(0.032, MAT.rubber, 14, 10);
    wheel.scale.set(1, 0.78, 1);
    put(wheel, Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29);
    base.add(wheel);
    const fork = box(0.022, 0.035, 0.03, MAT.blackMetal);
    put(fork, Math.cos(a) * 0.29, 0.055, Math.sin(a) * 0.29);
    base.add(fork);
  }
  g.add(base);

  const column = cyl(0.032, 0.042, 0.24, MAT.chrome, 18);
  put(column, 0, 0.18, 0);
  g.add(column);
  const columnCover = cyl(0.045, 0.05, 0.16, MAT.blackMetal, 18);
  put(columnCover, 0, 0.13, 0);
  g.add(columnCover);

  // seat
  const seat = rbox(0.5, 0.09, 0.48, 0.045, fabric, 0.02);
  put(seat, 0, 0.46, 0);
  g.add(seat);
  const seatFrame = rbox(0.46, 0.05, 0.44, 0.02, MAT.plasticDark, 0.01);
  put(seatFrame, 0, 0.4, 0);
  g.add(seatFrame);

  // lumbar + back
  const back = new THREE.Group();
  const backShell = rbox(0.46, 0.6, 0.09, 0.05, fabric, 0.03);
  put(backShell, 0, 0.72, -0.01);
  back.add(backShell);
  const backFrame = rbox(0.42, 0.5, 0.05, 0.03, MAT.plasticDark, 0.02);
  put(backFrame, 0, 0.72, -0.06);
  back.add(backFrame);
  const headrest = rbox(0.28, 0.14, 0.08, 0.045, fabric, 0.025);
  put(headrest, 0, 1.11, 0.0);
  back.add(headrest);
  const headStem = cyl(0.018, 0.018, 0.16, MAT.plasticDark, 10);
  put(headStem, 0, 1.0, -0.02);
  back.add(headStem);
  back.rotation.x = -0.12;
  g.add(back);

  // armrests
  [-1, 1].forEach((s) => {
    const post = rbox(0.05, 0.16, 0.05, 0.016, MAT.blackMetal, 0.008);
    put(post, s * 0.27, 0.56, 0.02);
    g.add(post);
    const pad = rbox(0.08, 0.035, 0.24, 0.018, MAT.plasticDark, 0.008);
    put(pad, s * 0.27, 0.65, 0.02);
    g.add(pad);
  });

  shade(g);
  g.userData.footprint = { w: 0.72, d: 0.72 };
  g.userData.anchor = new THREE.Vector3(0, 0.9, 0);
  return g;
}

/** Full workstation: desk + monitor + peripherals. */
export function createWorkstation(opts = {}) {
  const g = new THREE.Group();
  g.name = "Workstation";
  g.userData.interactionLabel = "Workstation";
  const desk = createDesk(opts.desk || {});
  g.add(desk);

  const monitor = createMonitor(opts.monitor || {});
  put(monitor, 0, 0.74, -0.22);
  g.add(monitor);

  // Soft desk mat unifies the keyboard and mouse zone; the fine edge seam
  // gives the close-up camera something more tactile than a flat tabletop.
  const deskMat = rbox(0.72, 0.006, 0.26, 0.045, MAT.fabricCharcoal, 0.003);
  put(deskMat, 0.12, 0.742, 0.065);
  g.add(deskMat);
  const kb = createKeyboard();
  put(kb, 0.04, 0.744, 0.06);
  g.add(kb);

  const mousePad = rbox(0.22, 0.005, 0.19, 0.045, MAT.fabricNavy, 0.002);
  put(mousePad, 0.5, 0.743, 0.08);
  g.add(mousePad);
  const mouse = createMouse();
  mouse.rotation.y = -0.3;
  put(mouse, 0.5, 0.74, 0.08);
  g.add(mouse);

  const coaster = cyl(0.056, 0.056, 0.006, MAT.fabricSand, 28);
  put(coaster, -0.62, 0.744, 0.02);
  g.add(coaster);
  const mug = createMug({ color: 0xe8e3d8 });
  put(mug, -0.62, 0.748, 0.02);
  g.add(mug);

  const pad = createNotepad();
  pad.rotation.y = 0.12;
  put(pad, -0.34, 0.74, 0.1);
  g.add(pad);

  const lamp = createDeskLamp();
  put(lamp, -0.82, 0.74, -0.26);
  g.add(lamp);

  g.userData.parts = { monitor, lamp, mug, desk, keyboard: kb, mouse, notepad: pad };
  g.userData.update = (dt, t) => {
    monitor.userData.update?.(dt, t);
    lamp.userData.update?.(dt, t);
  };
  g.userData.footprint = { w: 2.1, d: 1.5 };
  g.userData.anchor = new THREE.Vector3(0, 1.0, -0.1);
  return g;
}

/* ===================================================================== *
 *  Storage / lounge
 * ===================================================================== */

export function createBookshelf({ width = 1.5, height = 2.0, depth = 0.36, shelves = 4 } = {}) {
  const g = new THREE.Group();
  g.name = "Rak buku";
  g.userData.interactionLabel = "Rak buku";
  const t = 0.035;

  [-1, 1].forEach((s) => {
    const side = rbox(t, height, depth, 0.008, MAT.darkWood, 0.006);
    put(side, (s * (width - t)) / 2, height / 2, 0);
    g.add(side);
  });
  const backPanel = rbox(width, height, t, 0.006, MAT.darkWood, 0.004);
  put(backPanel, 0, height / 2, -depth / 2 + t / 2);
  g.add(backPanel);

  const rnd = mulberry32(19);
  const bookGeos = [];
  const bookMats = [
    new THREE.MeshStandardMaterial({ color: 0x8a3f34, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x2f4a63, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.75 }),
    new THREE.MeshStandardMaterial({ color: 0x3f5c46, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xe0d8c8, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x4a3b52, roughness: 0.8 }),
  ];
  const dummy = new THREE.Object3D();

  for (let i = 0; i < shelves; i++) {
    const y = 0.24 + i * ((height - 0.4) / (shelves - 1));
    const board = rbox(width - t * 2, t, depth - 0.02, 0.006, MAT.darkWood, 0.004);
    put(board, 0, y, 0.005);
    g.add(board);

    // books on this shelf
    let x = -width / 2 + 0.1;
    while (x < width / 2 - 0.12) {
      if (rnd() > 0.82) {
        // stacked pile
        const pile = 2 + Math.floor(rnd() * 3);
        for (let k = 0; k < pile; k++) {
          const b = box(0.2, 0.028, 0.15, bookMats[(rnd() * bookMats.length) | 0]);
          put(b, x + 0.05, y + t / 2 + 0.014 + k * 0.028, 0);
          b.rotation.y = (rnd() - 0.5) * 0.12;
          g.add(b);
        }
        x += 0.14;
        continue;
      }
      const bw = 0.026 + rnd() * 0.03;
      const bh = 0.19 + rnd() * 0.09;
      const bd = 0.13 + rnd() * 0.04;
      const b = box(bw, bh, bd, bookMats[(rnd() * bookMats.length) | 0]);
      put(b, x + bw / 2, y + t / 2 + bh / 2, 0.01);
      b.rotation.z = rnd() > 0.92 ? 0.18 : 0;
      g.add(b);
      bookGeos.push(b);
      x += bw + 0.004;
    }

    // occasional decorative object
    if (i === shelves - 1) {
      const vessel = cyl(0.055, 0.075, 0.16, MAT.ceramicWhite, 22);
      put(vessel, width * 0.28, y + t / 2 + 0.08, 0.02);
      g.add(vessel);
      const branch = cyl(0.006, 0.004, 0.34, MAT.darkWood, 8);
      branch.rotation.z = 0.2;
      put(branch, width * 0.28, y + t / 2 + 0.3, 0.02);
      g.add(branch);
    }
  }

  const top = rbox(width, t, depth, 0.006, MAT.darkWood, 0.004);
  put(top, 0, height - t / 2 + 0.02, 0);
  g.add(top);

  const plinth = rbox(width, 0.06, depth - 0.04, 0.006, MAT.blackMetal, 0.004);
  put(plinth, 0, 0.03, 0);
  g.add(plinth);

  shade(g);
  g.userData.footprint = { w: width + 0.1, d: depth + 0.1 };
  g.userData.anchor = new THREE.Vector3(0, 1.2, 0.2);
  void dummy;
  return g;
}

export function createSofa({ width = 2.1, depth = 0.9 } = {}) {
  const g = new THREE.Group();
  g.name = "Sofa";
  g.userData.interactionLabel = "Sofa";
  // Cushion top aligns with the ergonomic office-chair seat at y=0.505.
  const seatY = 0.365;

  const base = rbox(width, 0.16, depth, 0.05, MAT.fabricNavy, 0.03);
  put(base, 0, seatY - 0.08, 0);
  g.add(base);

  const cushions = 3;
  for (let i = 0; i < cushions; i++) {
    const cw = (width - 0.36) / cushions - 0.03;
    const c = rbox(cw, 0.16, depth - 0.14, 0.05, MAT.fabricNavy, 0.03);
    put(c, -width / 2 + 0.18 + cw / 2 + i * (cw + 0.03), seatY + 0.06, 0.02);
    g.add(c);
  }

  const back = rbox(width, 0.62, 0.22, 0.07, MAT.fabricNavy, 0.035);
  put(back, 0, seatY + 0.28, -depth / 2 + 0.11);
  g.add(back);

  [-1, 1].forEach((s) => {
    const arm = rbox(0.22, 0.4, depth, 0.06, MAT.fabricNavy, 0.03);
    put(arm, s * (width / 2 - 0.11), seatY + 0.12, 0);
    g.add(arm);
  });

  // throw pillows
  const pillowMats = [MAT.fabricSand, MAT.fabricRust];
  pillowMats.forEach((m, i) => {
    const p = rbox(0.36, 0.36, 0.13, 0.06, m, 0.04);
    p.rotation.z = i ? -0.22 : 0.18;
    p.rotation.x = -0.16;
    put(p, -width / 2 + 0.42 + i * 0.9, seatY + 0.28, -depth / 2 + 0.26);
    g.add(p);
  });

  [-1, 1].forEach((s) => {
    [0.32, -0.32].forEach((z) => {
      const leg = cyl(0.018, 0.022, 0.16, MAT.brass, 12);
      put(leg, s * (width / 2 - 0.16), 0.08, z);
      g.add(leg);
    });
  });

  shade(g);
  g.userData.footprint = { w: width + 0.1, d: depth + 0.1 };
  g.userData.anchor = new THREE.Vector3(0, 0.6, 0.2);
  return g;
}

export function createCoffeeTable({ r = 0.45 } = {}) {
  const g = new THREE.Group();
  g.name = "Meja kopi";
  g.userData.interactionLabel = "Meja kopi";
  // Conservative square footprint around the circular tabletop and legs.
  g.userData.footprint = { w: r * 2 + 0.12, d: r * 2 + 0.12 };
  const top = cyl(r, r, 0.04, MAT.deskTop, 40);
  put(top, 0, 0.4, 0);
  g.add(top);
  const skirt = cyl(r - 0.02, r - 0.02, 0.05, MAT.blackMetal, 40, true);
  put(skirt, 0, 0.36, 0);
  g.add(skirt);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const leg = cyl(0.014, 0.014, 0.38, MAT.brass, 10);
    leg.position.set(Math.cos(a) * (r - 0.09), 0.19, Math.sin(a) * (r - 0.09));
    leg.rotation.z = Math.cos(a) * 0.1;
    leg.rotation.x = -Math.sin(a) * 0.1;
    g.add(leg);
  }
  // stack of magazines
  for (let i = 0; i < 3; i++) {
    const m = rbox(0.24, 0.014, 0.32, 0.004, i % 2 ? MAT.fabricRust : MAT.paper, 0.002);
    m.rotation.y = 0.3 + i * 0.08;
    put(m, 0.06, 0.428 + i * 0.015, -0.02);
    g.add(m);
  }
  shade(g);
  g.userData.footprint = { w: r * 2, d: r * 2 };
  return g;
}

export function createFloorLamp() {
  const g = new THREE.Group();
  g.name = "Lampu lantai";
  g.userData.interactionLabel = "Lampu lantai";
  const base = cyl(0.16, 0.19, 0.03, MAT.blackMetal, 28);
  put(base, 0, 0.015, 0);
  g.add(base);
  const pole = cyl(0.016, 0.016, 1.5, MAT.blackMetal, 14);
  put(pole, 0, 0.78, 0);
  g.add(pole);
  const arm = cyl(0.014, 0.014, 0.42, MAT.blackMetal, 12);
  arm.rotation.z = Math.PI / 2.2;
  put(arm, 0.16, 1.5, 0);
  g.add(arm);
  const shadeMesh = cyl(0.09, 0.16, 0.22, MAT.fabricSand, 28, true);
  put(shadeMesh, 0.34, 1.4, 0);
  g.add(shadeMesh);
  const bulb = sphere(0.06, MAT.bulb, 16, 12);
  put(bulb, 0.34, 1.34, 0);
  g.add(bulb);
  const light = new THREE.PointLight(0xffd9a8, 0, 6, 2);
  put(light, 0.34, 1.32, 0);
  g.add(light);
  shade(g);
  g.userData.footprint = { w: 0.5, d: 0.5 };
  g.userData.parts = { light, bulb, shade: shadeMesh };
  g.userData.anchor = new THREE.Vector3(0.34, 1.3, 0);
  g.userData.api = {
    on: false,
    toggle() {
      this.on = !this.on;
      light.intensity = this.on ? 9 : 0;
      bulb.visible = this.on;
      return this.on;
    },
  };
  return g;
}

/* ===================================================================== *
 *  Fixtures
 * ===================================================================== */

export function createCeilingPanel({ w = 1.2, d = 0.3 } = {}) {
  const g = new THREE.Group();
  g.name = "Panel lampu";
  g.userData.interactionLabel = "Panel lampu";
  const frame = rbox(w + 0.08, 0.09, d + 0.08, 0.01, MAT.plasticWhite, 0.005);
  put(frame, 0, 0.045, 0);
  g.add(frame);
  const panel = new THREE.Mesh(cached(`cp:${w}:${d}`, () => new THREE.PlaneGeometry(w, d)), MAT.lightPanel);
  panel.rotation.x = Math.PI / 2;
  put(panel, 0, -0.002, 0);
  g.add(panel);
  panel.castShadow = false;
  panel.receiveShadow = false;
  g.userData.parts = { panel, frame };
  g.userData.api = {
    setIntensity(v) {
      panel.material.emissiveIntensity = v;
    },
  };
  return g;
}

export function createPendantLamp({ color = 0x2b3238 } = {}) {
  const g = new THREE.Group();
  g.name = "Lampu gantung";
  g.userData.interactionLabel = "Lampu gantung";
  const shell = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5, envMapIntensity: 1 });
  const cord = cyl(0.004, 0.004, 0.7, MAT.plasticDark, 6);
  put(cord, 0, 0.35, 0);
  g.add(cord);
  const shadeGeo = cached(
    "pendantShade",
    () => new THREE.CylinderGeometry(0.09, 0.2, 0.22, 32, 1, true),
  );
  const shadeMesh = new THREE.Mesh(shadeGeo, shell);
  shadeMesh.material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.55,
    side: THREE.DoubleSide,
    envMapIntensity: 1.1,
  });
  put(shadeMesh, 0, 0, 0);
  g.add(shadeMesh);
  const inner = cyl(0.085, 0.085, 0.002, MAT.bulb, 24);
  put(inner, 0, -0.1, 0);
  g.add(inner);
  const bulb = sphere(0.045, MAT.bulb, 16, 12);
  put(bulb, 0, -0.06, 0);
  g.add(bulb);
  const light = new THREE.PointLight(0xffcf9a, 7, 7, 2);
  put(light, 0, -0.16, 0);
  g.add(light);
  shade(g);
  inner.castShadow = false;
  g.userData.parts = { light, bulb, shade: shadeMesh };
  g.userData.api = {
    on: true,
    toggle() {
      this.on = !this.on;
      light.intensity = this.on ? 7 : 0;
      inner.visible = this.on;
      bulb.visible = this.on;
      return this.on;
    },
  };
  return g;
}

export function createWhiteboard({ w = 2.4, h = 1.4 } = {}) {
  const g = new THREE.Group();
  g.name = "Papan tulis";
  g.userData.interactionLabel = "Papan tulis";
  const frame = rbox(w + 0.1, h + 0.1, 0.05, 0.02, MAT.steel, 0.008);
  g.add(frame);

  const mat = new THREE.MeshStandardMaterial({
    map: TEX.whiteboard,
    roughness: 0.12,
    metalness: 0.05,
    envMapIntensity: 1.2,
  });
  const face = new THREE.Mesh(
    cached(`wb:${w}:${h}`, () => new THREE.PlaneGeometry(w, h)),
    mat,
  );
  put(face, 0, 0, 0.028);
  g.add(face);

  const tray = rbox(w + 0.1, 0.035, 0.11, 0.012, MAT.steel, 0.006);
  put(tray, 0, -h / 2 - 0.06, 0.05);
  g.add(tray);

  const markerCols = [0x2f4a63, 0xc05621, 0x2f855a];
  markerCols.forEach((c, i) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 });
    const body = cyl(0.012, 0.012, 0.13, m, 10);
    body.rotation.z = Math.PI / 2;
    put(body, -w * 0.3 + i * 0.05, -h / 2 - 0.042, 0.06);
    g.add(body);
    const cap = cyl(0.013, 0.013, 0.02, MAT.plasticDark, 10);
    cap.rotation.z = Math.PI / 2;
    put(cap, -w * 0.3 + i * 0.05 + 0.075, -h / 2 - 0.042, 0.06);
    g.add(cap);
  });

  const eraser = rbox(0.12, 0.04, 0.06, 0.01, MAT.plasticDark, 0.005);
  put(eraser, w * 0.34, -h / 2 - 0.04, 0.06);
  g.add(eraser);
  const felt = rbox(0.11, 0.006, 0.05, 0.006, MAT.fabricSand, 0.003);
  put(felt, w * 0.34, -h / 2 - 0.062, 0.06);
  g.add(felt);

  shade(g);
  g.userData.anchor = new THREE.Vector3(0, 0, 0.05);
  return g;
}

export function createClock() {
  const g = new THREE.Group();
  g.name = "Jam dinding";
  g.userData.interactionLabel = "Jam dinding";
  const caseMesh = cyl(0.22, 0.22, 0.05, MAT.blackMetal, 40);
  caseMesh.rotation.x = Math.PI / 2;
  g.add(caseMesh);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.012, 10, 48), MAT.brass);
  put(rim, 0, 0, 0.028);
  g.add(rim);

  // face
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f7f5ef";
  ctx.beginPath();
  ctx.arc(256, 256, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1c1f23";
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const major = i % 5 === 0;
    ctx.lineWidth = major ? 9 : 3;
    ctx.beginPath();
    ctx.moveTo(256 + Math.sin(a) * (major ? 200 : 214), 256 - Math.cos(a) * (major ? 200 : 214));
    ctx.lineTo(256 + Math.sin(a) * 232, 256 - Math.cos(a) * 232);
    ctx.stroke();
  }
  ctx.fillStyle = "#2b3a4a";
  ctx.font = "600 34px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ATELIER", 256, 300);
  const faceTex = new THREE.CanvasTexture(c);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.212, 48), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.35 }));
  put(face, 0, 0, 0.027);
  g.add(face);

  const mkHand = (len, w, mat, z) => {
    const pivot = new THREE.Group();
    const h = rbox(w, len, 0.008, 0.004, mat, 0.003);
    put(h, 0, len / 2 - 0.02, 0);
    pivot.add(h);
    put(pivot, 0, 0, z);
    g.add(pivot);
    return pivot;
  };
  const hourHand = mkHand(0.1, 0.022, MAT.plasticDark, 0.033);
  const minHand = mkHand(0.15, 0.016, MAT.plasticDark, 0.038);
  const secHand = mkHand(0.17, 0.006, MAT.brass, 0.043);
  const cap = cyl(0.014, 0.014, 0.02, MAT.brass, 14);
  cap.rotation.x = Math.PI / 2;
  put(cap, 0, 0, 0.045);
  g.add(cap);

  const hands = [hourHand, minHand, secHand];
  g.userData.update = () => {
    const now = new Date();
    const s = now.getSeconds() + now.getMilliseconds() / 1000;
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;
    secHand.rotation.z = -(s / 60) * Math.PI * 2;
    minHand.rotation.z = -(m / 60) * Math.PI * 2;
    hourHand.rotation.z = -(h / 12) * Math.PI * 2;
  };
  g.userData.anchor = new THREE.Vector3(0, 0, 0.1);
  void hands;
  return g;
}

export function createCoffeeMachine() {
  const g = new THREE.Group();
  g.name = "Mesin kopi";
  g.userData.interactionLabel = "Mesin kopi";
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x30363d, roughness: 0.28, metalness: 0.72, envMapIntensity: 1.1 });
  const body = rbox(0.34, 0.44, 0.34, 0.05, bodyMat, 0.03);
  put(body, 0, 0.22, 0);
  g.add(body);

  const facePlate = rbox(0.3, 0.12, 0.02, 0.03, MAT.blackMetal, 0.01);
  put(facePlate, 0, 0.36, 0.175);
  g.add(facePlate);

  // display
  const dc = document.createElement("canvas");
  dc.width = 256;
  dc.height = 96;
  const dctx = dc.getContext("2d");
  const drawDisplay = (msg = "READY", progress = 1) => {
    dctx.fillStyle = "#08110e";
    dctx.fillRect(0, 0, 256, 96);
    dctx.fillStyle = "#3ddc97";
    dctx.font = "700 30px 'Segoe UI', system-ui, sans-serif";
    dctx.fillText(msg, 16, 44);
    dctx.fillStyle = "rgba(61,220,151,0.25)";
    dctx.fillRect(16, 58, 220, 12);
    dctx.fillStyle = "#3ddc97";
    dctx.fillRect(16, 58, 220 * progress, 12);
    dctx.font = "500 16px 'Segoe UI', system-ui, sans-serif";
    dctx.fillText("ATELIER ONE", 16, 88);
    dispTex.needsUpdate = true;
  };
  const dispTex = new THREE.CanvasTexture(dc);
  dispTex.colorSpace = THREE.SRGBColorSpace;
  const dispMat = new THREE.MeshStandardMaterial({ map: dispTex, emissive: 0xffffff, emissiveMap: dispTex, emissiveIntensity: 1.1, toneMapped: false, roughness: 0.3 });
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.064), dispMat);
  put(disp, 0, 0.36, 0.186);
  g.add(disp);
  drawDisplay();

  // group head + portafilter
  const head = cyl(0.05, 0.055, 0.05, MAT.chrome, 20);
  put(head, 0, 0.245, 0.14);
  g.add(head);
  const pf = new THREE.Group();
  const basket = cyl(0.042, 0.042, 0.03, MAT.chrome, 20);
  pf.add(basket);
  const handle = cyl(0.012, 0.012, 0.11, MAT.plasticDark, 10);
  handle.rotation.x = Math.PI / 2;
  put(handle, 0, 0, 0.08);
  pf.add(handle);
  put(pf, 0, 0.215, 0.15);
  g.add(pf);

  // drip tray
  const tray = rbox(0.28, 0.02, 0.16, 0.01, MAT.steel, 0.005);
  put(tray, 0, 0.13, 0.1);
  g.add(tray);
  const grate = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const bar = rbox(0.026, 0.012, 0.14, 0.004, MAT.blackMetal, 0.003);
    put(bar, -0.12 + i * 0.04, 0.144, 0.1);
    grate.add(bar);
  }
  g.add(grate);

  const cup = createMug({ color: 0xf2f0e8 });
  put(cup, 0.02, 0.15, 0.11);
  g.add(cup);

  const wand = cyl(0.008, 0.008, 0.13, MAT.chrome, 8);
  wand.rotation.x = 0.4;
  put(wand, 0.14, 0.2, 0.16);
  g.add(wand);

  // buttons
  const btnMats = [0x3ddc97, 0xe0a020, 0xc0503c];
  btnMats.forEach((c, i) => {
    const b = cyl(0.014, 0.014, 0.012, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.4 }), 14);
    b.rotation.x = Math.PI / 2;
    put(b, -0.1 + i * 0.04, 0.305, 0.18);
    g.add(b);
  });

  shade(g);

  // steam
  const steamCount = 90;
  const steamGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(steamCount * 3);
  const sData = [];
  for (let i = 0; i < steamCount; i++) {
    sData.push({ life: Math.random(), vel: new THREE.Vector3() });
    sPos[i * 3 + 1] = -99;
  }
  steamGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  const steamMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.055,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const steam = new THREE.Points(steamGeo, steamMat);
  steam.frustumCulled = false;
  g.add(steam);

  let brewing = 0;
  const origin = new THREE.Vector3(0.02, 0.2, 0.11);

  g.userData.parts = { display: dispMat, steam, cup, bodyMat };
  g.userData.api = {
    get isBrewing() {
      return brewing > 0;
    },
    brew(duration = 4) {
      brewing = duration;
      drawDisplay("BREWING", 0);
    },
  };
  g.userData.update = (dt, t) => {
    if (brewing > 0) {
      brewing = Math.max(0, brewing - dt);
      const total = 4;
      drawDisplay(brewing > 0.4 ? "BREWING" : "READY", 1 - brewing / total);
      const pos = steamGeo.attributes.position.array;
      for (let i = 0; i < steamCount; i++) {
        const d = sData[i];
        d.life -= dt * 0.55;
        if (d.life <= 0) {
          d.life = 0.7 + Math.random() * 0.6;
          d.vel.set((Math.random() - 0.5) * 0.05, 0.16 + Math.random() * 0.1, (Math.random() - 0.5) * 0.05);
          pos[i * 3] = origin.x + (Math.random() - 0.5) * 0.03;
          pos[i * 3 + 1] = origin.y;
          pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.03;
        }
        pos[i * 3] += d.vel.x * dt * 0.4;
        pos[i * 3 + 1] += d.vel.y * dt * 0.4;
        pos[i * 3 + 2] += d.vel.z * dt * 0.4;
        if (d.life < 0.4) pos[i * 3 + 1] = -99;
      }
      steamGeo.attributes.position.needsUpdate = true;
      steamMat.opacity = 0.3;
    } else {
      steamMat.opacity *= 0.9;
      if (steamMat.opacity < 0.01) {
        const pos = steamGeo.attributes.position.array;
        for (let i = 0; i < steamCount; i++) pos[i * 3 + 1] = -99;
        steamGeo.attributes.position.needsUpdate = true;
      }
    }
    dispMat.emissiveIntensity = 1.05 + Math.sin(t * 3) * 0.06;
  };
  g.userData.footprint = { w: 0.5, d: 0.5 };
  g.userData.anchor = new THREE.Vector3(0, 0.42, 0.2);
  return g;
}

export function createWaterCooler() {
  const g = new THREE.Group();
  g.name = "Dispenser air";
  g.userData.interactionLabel = "Dispenser air";
  const body = rbox(0.34, 0.92, 0.32, 0.03, MAT.plasticWhite, 0.02);
  put(body, 0, 0.46, 0);
  g.add(body);
  const bottle = new THREE.Mesh(
    cached("bottle", () => new THREE.CylinderGeometry(0.14, 0.16, 0.4, 28)),
    // plain transparency instead of `transmission`: a transmissive material
    // makes three render the whole scene a second time, which is far too
    // expensive for one water jug.
    new THREE.MeshPhysicalMaterial({
      color: 0x9fd8ea,
      roughness: 0.1,
      metalness: 0,
      transparent: true,
      opacity: 0.42,
      envMapIntensity: 1.0,
    }),
  );
  put(bottle, 0, 1.1, 0);
  g.add(bottle);
  const water = cyl(0.11, 0.13, 0.22, new THREE.MeshStandardMaterial({ color: 0x6fb9d8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.75 }), 24);
  put(water, 0, 1.05, 0);
  g.add(water);
  [-1, 1].forEach((s) => {
    const tap = box(0.05, 0.03, 0.08, MAT.plasticDark);
    put(tap, s * 0.09, 0.8, 0.17);
    g.add(tap);
    const drip = cyl(0.02, 0.02, 0.02, MAT.steel, 10);
    put(drip, s * 0.09, 0.77, 0.19);
    g.add(drip);
  });
  const tray = rbox(0.26, 0.02, 0.12, 0.01, MAT.steel, 0.005);
  put(tray, 0, 0.7, 0.14);
  g.add(tray);
  shade(g);
  g.userData.footprint = { w: 0.5, d: 0.5 };
  g.userData.anchor = new THREE.Vector3(0, 1.0, 0.2);
  return g;
}

export function createBin() {
  const g = new THREE.Group();
  g.name = "Tempat sampah";
  g.userData.interactionLabel = "Tempat sampah";
  const shell = cyl(0.16, 0.13, 0.42, MAT.blackMetal, 24, true);
  put(shell, 0, 0.21, 0);
  g.add(shell);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 28), MAT.steel);
  rim.rotation.x = Math.PI / 2;
  put(rim, 0, 0.42, 0);
  g.add(rim);
  const bottom = cyl(0.13, 0.13, 0.01, MAT.blackMetal, 24);
  put(bottom, 0, 0.006, 0);
  g.add(bottom);
  const rnd = mulberry32(7);
  for (let i = 0; i < 4; i++) {
    const ball = sphere(0.035 + rnd() * 0.02, MAT.paper, 8, 6);
    const pos = ball.geometry.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      pos.setXYZ(
        v,
        pos.getX(v) * (1 + (rnd() - 0.5) * 0.4),
        pos.getY(v) * (1 + (rnd() - 0.5) * 0.4),
        pos.getZ(v) * (1 + (rnd() - 0.5) * 0.4),
      );
    }
    pos.needsUpdate = true;
    ball.geometry.computeVertexNormals();
    ball.position.set((rnd() - 0.5) * 0.16, 0.3 + rnd() * 0.1, (rnd() - 0.5) * 0.16);
    g.add(ball);
  }
  shade(g);
  g.userData.footprint = { w: 0.36, d: 0.36 };
  return g;
}

export function createWallArt({ w = 0.7, h = 0.95, variant = 0 } = {}) {
  const g = new THREE.Group();
  g.name = "Dekorasi dinding";
  g.userData.interactionLabel = "Dekorasi dinding";
  const frame = rbox(w + 0.06, h + 0.06, 0.035, 0.008, MAT.darkWood, 0.004);
  g.add(frame);
  const tex = [TEX.posterA, TEX.posterB, TEX.posterC, TEX.posterD][variant % 4];
  const face = new THREE.Mesh(
    cached(`art:${w}:${h}`, () => new THREE.PlaneGeometry(w, h)),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, metalness: 0.02 }),
  );
  put(face, 0, 0, 0.021);
  g.add(face);
  shade(g);
  g.userData.parts = { face };
  g.userData.anchor = new THREE.Vector3(0, 0, 0.05);
  return g;
}

/* ===================================================================== *
 *  Greenery
 * ===================================================================== */

function leafGeometry(len = 0.34, wid = 0.19) {
  return cached(`leaf:${len}:${wid}`, () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(wid * 0.6, len * 0.15, wid * 0.75, len * 0.7, 0, len);
    s.bezierCurveTo(-wid * 0.75, len * 0.7, -wid * 0.6, len * 0.15, 0, 0);
    const geo = new THREE.ShapeGeometry(s, 10);
    // curl the leaf into a shallow cup + tip droop
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, -Math.pow(Math.abs(x) / (wid * 0.75), 2) * 0.045);
      pos.setY(i, y - Math.pow(y / len, 3) * len * 0.08);
    }
    geo.computeVertexNormals();
    return geo;
  });
}

function bladeGeometry(h = 0.9, w = 0.07) {
  return cached(`blade:${h}:${w}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.quadraticCurveTo(-w * 0.9, h * 0.6, 0, h);
    s.quadraticCurveTo(w * 0.9, h * 0.6, w / 2, 0);
    s.lineTo(-w / 2, 0);
    const geo = new THREE.ShapeGeometry(s, 8);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setZ(i, -Math.pow(y / h, 2) * 0.09);
      pos.setX(i, pos.getX(i) + Math.pow(y / h, 2) * 0.05);
    }
    geo.computeVertexNormals();
    return geo;
  });
}

export function createPlant({ variant = 0, scale = 1, seed = 3 } = {}) {
  const g = new THREE.Group();
  g.name = "Tanaman indoor";
  g.userData.interactionLabel = "Tanaman indoor";
  const rnd = mulberry32(seed * 977 + variant * 13);

  const potH = [0.3, 0.22, 0.13][variant % 3];
  const profile = [
    new THREE.Vector2(0.0, 0),
    new THREE.Vector2(0.13, 0),
    new THREE.Vector2(0.16, 0.05),
    new THREE.Vector2(0.19, potH),
    new THREE.Vector2(0.185, potH + 0.012),
    new THREE.Vector2(0.16, potH + 0.012),
    new THREE.Vector2(0.15, potH * 0.94),
    new THREE.Vector2(0.13, 0.06),
    new THREE.Vector2(0.0, 0.05),
  ];
  const potGeo = cached(`pot:${potH}`, () => new THREE.LatheGeometry(profile, 28));
  const potMat = variant === 2 ? MAT.ceramicWhite : MAT.terracotta;
  const pot = new THREE.Mesh(potGeo, potMat);
  g.add(pot);

  const soil = cyl(0.15, 0.15, 0.02, MAT.soil, 24);
  put(soil, 0, potH + 0.005, 0);
  g.add(soil);

  if (variant === 0) {
    // tall ficus
    const trunk = cyl(0.022, 0.03, 0.85, MAT.darkWood, 12);
    put(trunk, 0, 0.42 + potH, 0);
    g.add(trunk);
    const branches = 12;
    for (let i = 0; i < branches; i++) {
      const h = 0.3 + rnd() * 0.75;
      const a = rnd() * Math.PI * 2;
      const len = 0.28 + rnd() * 0.2;
      const stem = cyl(0.006, 0.009, len, MAT.leaf, 6);
      stem.position.set(Math.cos(a) * len * 0.4, potH + h + len * 0.25, Math.sin(a) * len * 0.4);
      stem.rotation.z = Math.cos(a) * 0.9;
      stem.rotation.x = -Math.sin(a) * 0.9;
      g.add(stem);
      const leafCount = 3 + ((rnd() * 3) | 0);
      for (let l = 0; l < leafCount; l++) {
        const leaf = new THREE.Mesh(leafGeometry(0.2 + rnd() * 0.1, 0.09 + rnd() * 0.04), rnd() > 0.5 ? MAT.leaf : MAT.leafLight);
        const la = a + (rnd() - 0.5) * 1.4;
        const lr = 0.13 + rnd() * 0.14;
        leaf.position.set(
          Math.cos(a) * len * 0.7 + Math.cos(la) * lr,
          potH + h + len * 0.45 + (rnd() - 0.5) * 0.1,
          Math.sin(a) * len * 0.7 + Math.sin(la) * lr,
        );
        leaf.rotation.set(-Math.PI / 2 + 0.5 + rnd() * 0.4, Math.atan2(Math.cos(la), Math.sin(la)) - Math.PI / 2, 0, "YXZ");
        leaf.rotation.z = (rnd() - 0.5) * 0.9;
        leaf.castShadow = true;
        g.add(leaf);
      }
    }
  } else if (variant === 1) {
    // snake plant — fan of blades
    const blades = 11;
    for (let i = 0; i < blades; i++) {
      const h = 0.55 + rnd() * 0.55;
      const blade = new THREE.Mesh(bladeGeometry(h, 0.06 + rnd() * 0.04), rnd() > 0.4 ? MAT.leaf : MAT.leafLight);
      const a = (i / blades) * Math.PI * 2 + rnd() * 0.3;
      const r = 0.02 + rnd() * 0.07;
      blade.position.set(Math.cos(a) * r, potH - 0.01, Math.sin(a) * r);
      blade.rotation.y = -a + Math.PI / 2;
      blade.rotation.z = (rnd() - 0.5) * 0.3;
      blade.castShadow = true;
      g.add(blade);
    }
  } else {
    // low succulent cluster
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 0.09;
      const leaf = new THREE.Mesh(leafGeometry(0.11 + rnd() * 0.06, 0.045), rnd() > 0.5 ? MAT.leaf : MAT.leafLight);
      leaf.position.set(Math.cos(a) * r, potH + 0.01, Math.sin(a) * r);
      leaf.rotation.set(-Math.PI / 2 + 0.9 + rnd() * 0.5, a, (rnd() - 0.5) * 0.6, "YXZ");
      leaf.castShadow = true;
      g.add(leaf);
    }
  }

  shade(g);
  g.scale.setScalar(scale);
  g.userData.footprint = { w: 0.42 * scale, d: 0.42 * scale };
  g.userData.anchor = new THREE.Vector3(0, (potH + 0.6) * scale, 0);
  g.userData.parts = { pot, soil };
  g.userData.api = {
    watered: 0,
    water() {
      this.watered = 1;
    },
  };
  return g;
}

export function createDivider({ w = 1.6, h = 1.1 } = {}) {
  const g = new THREE.Group();
  g.name = "Sekat tanaman";
  g.userData.interactionLabel = "Sekat tanaman";
  const planter = rbox(w, 0.32, 0.34, 0.02, MAT.darkWood, 0.01);
  put(planter, 0, 0.16, 0);
  g.add(planter);
  const soilTop = rbox(w - 0.08, 0.02, 0.26, 0.01, MAT.soil, 0.005);
  put(soilTop, 0, 0.325, 0);
  g.add(soilTop);

  const rnd = mulberry32(41);
  const count = 9;
  for (let i = 0; i < count; i++) {
    const bh = 0.4 + rnd() * 0.6;
    const blade = new THREE.Mesh(bladeGeometry(bh, 0.07 + rnd() * 0.05), rnd() > 0.5 ? MAT.leaf : MAT.leafLight);
    blade.position.set(-w / 2 + 0.14 + (i / (count - 1)) * (w - 0.28), 0.33, (rnd() - 0.5) * 0.14);
    blade.rotation.y = rnd() * Math.PI;
    blade.rotation.z = (rnd() - 0.5) * 0.35;
    blade.castShadow = true;
    g.add(blade);
  }
  const rail = rbox(w, 0.05, 0.05, 0.01, MAT.steel, 0.005);
  put(rail, 0, h, 0);
  g.add(rail);
  shade(g);
  g.userData.footprint = { w: w + 0.06, d: 0.42 };
  return g;
}

/* ===================================================================== *
 *  Architectural and office fit-out pieces
 * ===================================================================== */

export function createStorageCabinet({ w = 0.92, h = 1.18, d = 0.42, color = "wood" } = {}) {
  const g = new THREE.Group();
  g.name = "Lemari arsip";
  g.userData.interactionLabel = "Lemari arsip";
  const shellMat = color === "light" ? MAT.plasticWhite : MAT.darkWood;
  const body = rbox(w, h, d, 0.025, shellMat, 0.008);
  put(body, 0, h / 2, 0);
  g.add(body);
  const top = rbox(w + 0.035, 0.045, d + 0.035, 0.018, MAT.deskTop, 0.008);
  put(top, 0, h + 0.015, 0);
  g.add(top);
  const kick = rbox(w - 0.12, 0.09, d - 0.06, 0.01, MAT.blackMetal, 0.004);
  put(kick, 0, 0.055, 0);
  g.add(kick);

  const drawers = [];
  for (let i = 0; i < 3; i++) {
    const drawer = new THREE.Group();
    const dh = (h - 0.22) / 3;
    const front = rbox(w - 0.11, dh - 0.025, 0.025, 0.012, color === "light" ? MAT.deskTop : MAT.wallAccent, 0.005);
    put(front, 0, 0, d / 2 + 0.014);
    drawer.add(front);
    const handle = rbox(0.18, 0.025, 0.025, 0.01, MAT.brass, 0.004);
    put(handle, 0, 0, d / 2 + 0.035);
    drawer.add(handle);
    put(drawer, 0, 0.18 + i * dh, 0);
    g.add(drawer);
    drawers.push(drawer);
  }
  const feet = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
    const foot = cyl(0.025, 0.025, 0.08, MAT.blackMetal, 10);
    put(foot, sx * (w / 2 - 0.09), 0.04, sz * (d / 2 - 0.07));
    g.add(foot);
    return foot;
  }));
  let opened = false;
  g.userData.parts = { drawers, feet };
  g.userData.api = {
    get opened() { return opened; },
    toggle() {
      opened = !opened;
      drawers.forEach((drawer, i) => { drawer.position.z = opened ? 0.18 + i * 0.02 : 0; });
      return opened;
    },
  };
  g.userData.footprint = { w: w + 0.06, d: d + 0.06 };
  shade(g);
  return g;
}

export function createSideTable({ w = 0.62, d = 0.48, h = 0.52, finish = "wood" } = {}) {
  const g = new THREE.Group();
  g.name = "Meja samping";
  g.userData.interactionLabel = "Meja samping";
  const topMat = finish === "stone" ? MAT.concrete : MAT.deskTop;
  const top = rbox(w, 0.045, d, 0.045, topMat, 0.012);
  put(top, 0, h - 0.0225, 0);
  g.add(top);
  const apron = rbox(w - 0.08, 0.1, d - 0.08, 0.015, MAT.darkWood, 0.005);
  put(apron, 0, h - 0.105, 0);
  g.add(apron);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = rbox(0.035, h - 0.12, 0.035, 0.012, MAT.blackMetal, 0.004);
    put(leg, sx * (w / 2 - 0.075), (h - 0.12) / 2, sz * (d / 2 - 0.075));
    g.add(leg);
    const ferrule = cyl(0.025, 0.025, 0.025, MAT.brass, 10);
    put(ferrule, sx * (w / 2 - 0.075), 0.025, sz * (d / 2 - 0.075));
    g.add(ferrule);
  }
  g.userData.footprint = { w: w + 0.04, d: d + 0.04 };
  shade(g);
  return g;
}

export function createPrinterStation({ w = 0.9, h = 0.72, d = 0.58 } = {}) {
  const g = new THREE.Group();
  g.name = "Stasiun printer";
  g.userData.interactionLabel = "Stasiun printer";
  const cabinet = rbox(w, h * 0.63, d, 0.025, MAT.plasticWhite, 0.008);
  put(cabinet, 0, h * 0.315, 0);
  g.add(cabinet);
  const foot = rbox(w - 0.1, 0.055, d - 0.08, 0.01, MAT.blackMetal, 0.004);
  put(foot, 0, 0.028, 0);
  g.add(foot);
  const printerBody = rbox(w * 0.82, h * 0.34, d * 0.78, 0.045, MAT.plasticDark, 0.012);
  put(printerBody, 0, h * 0.76, -0.015);
  g.add(printerBody);
  const scanner = rbox(w * 0.78, 0.045, d * 0.75, 0.02, MAT.steel, 0.006);
  put(scanner, 0, h * 0.94, -0.015);
  g.add(scanner);
  const tray = rbox(w * 0.55, 0.025, 0.22, 0.01, MAT.blackMetal, 0.004);
  put(tray, 0, h * 0.57, d * 0.53);
  g.add(tray);
  const paper = rbox(w * 0.42, 0.012, 0.16, 0.003, MAT.paper, 0.002);
  put(paper, 0, h * 0.6, d * 0.53);
  g.add(paper);
  const led = sphere(0.018, MAT.ledStrip, 10, 8);
  put(led, w * 0.31, h * 0.81, d * 0.38);
  g.add(led);
  g.userData.parts = { paper, led };
  g.userData.api = {
    copies: 0,
    print() {
      this.copies += 1;
      paper.position.y = h * 0.6 + (this.copies % 2 ? 0.025 : 0);
      led.material = this.copies % 2 ? MAT.bulb : MAT.ledStrip;
      return this.copies;
    },
  };
  g.userData.footprint = { w: w + 0.05, d: d + 0.05 };
  shade(g);
  return g;
}

export function createFridge({ w = 0.78, h = 1.72, d = 0.68 } = {}) {
  const g = new THREE.Group();
  g.name = "Kulkas pantry";
  g.userData.interactionLabel = "Kulkas pantry";
  const body = rbox(w, h, d, 0.055, MAT.plasticWhite, 0.015);
  put(body, 0, h / 2, 0);
  g.add(body);
  const innerShadow = rbox(w - 0.09, h - 0.1, 0.025, 0.025, MAT.plasticDark, 0.008);
  put(innerShadow, 0, h / 2, d / 2 + 0.009);
  g.add(innerShadow);
  const doorPivot = new THREE.Group();
  put(doorPivot, -w / 2 + 0.03, 0, d / 2 + 0.03);
  g.add(doorPivot);
  const door = rbox(w - 0.07, h - 0.1, 0.045, 0.04, MAT.plasticWhite, 0.012);
  put(door, (w - 0.07) / 2 - 0.015, h / 2, 0);
  doorPivot.add(door);
  const handle = rbox(0.035, 0.42, 0.035, 0.015, MAT.chrome, 0.006);
  put(handle, w - 0.13, h * 0.57, 0.032);
  doorPivot.add(handle);
  const freezerLine = rbox(w - 0.12, 0.018, 0.012, 0.004, MAT.steel, 0.002);
  put(freezerLine, (w - 0.07) / 2 - 0.015, h * 0.73, 0.026);
  doorPivot.add(freezerLine);
  let open = false;
  g.userData.parts = { door, doorPivot, handle };
  g.userData.api = {
    get open() { return open; },
    toggle() {
      open = !open;
      doorPivot.rotation.y = open ? -0.95 : 0;
      return open;
    },
  };
  g.userData.footprint = { w: w + 0.08, d: d + 0.08 };
  shade(g);
  return g;
}

export function createArmchair({ color = "navy" } = {}) {
  const g = new THREE.Group();
  g.name = "Armchair lounge";
  g.userData.interactionLabel = "Armchair lounge";
  const fabric = color === "sand" ? MAT.fabricSand : color === "rust" ? MAT.fabricRust : color === "olive" ? MAT.fabricOlive : MAT.fabricNavy;
  const base = rbox(0.82, 0.24, 0.72, 0.055, MAT.darkWood, 0.012);
  put(base, 0, 0.29, 0);
  g.add(base);
  const seat = rbox(0.86, 0.19, 0.76, 0.085, fabric, 0.025);
  put(seat, 0, 0.41, 0.015);
  g.add(seat);
  const back = rbox(0.86, 0.76, 0.2, 0.07, fabric, 0.022);
  put(back, 0, 0.86, -0.28);
  back.rotation.x = -0.07;
  g.add(back);
  for (const sx of [-1, 1]) {
    const arm = rbox(0.16, 0.38, 0.7, 0.055, fabric, 0.018);
    put(arm, sx * 0.43, 0.59, 0.01);
    g.add(arm);
    const armCap = rbox(0.16, 0.035, 0.56, 0.025, color === "sand" ? MAT.deskTop : fabric, 0.008);
    put(armCap, sx * 0.43, 0.79, 0.015);
    g.add(armCap);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = rbox(0.055, 0.19, 0.055, 0.014, MAT.blackMetal, 0.005);
    put(leg, sx * 0.32, 0.095, sz * 0.27);
    g.add(leg);
    const foot = cyl(0.034, 0.034, 0.018, MAT.brass, 10);
    put(foot, sx * 0.32, 0.009, sz * 0.27);
    g.add(foot);
  }
  g.userData.footprint = { w: 1.02, d: 0.94 };
  g.userData.anchor = new THREE.Vector3(0, 0.82, 0.12);
  shade(g);
  return g;
}

export function createOttoman({ w = 0.62, d = 0.58, h = 0.36, color = "olive" } = {}) {
  const g = new THREE.Group();
  g.name = "Ottoman";
  g.userData.interactionLabel = "Ottoman";
  const fabric = color === "rust" ? MAT.fabricRust : color === "sand" ? MAT.fabricSand : color === "navy" ? MAT.fabricNavy : MAT.fabricOlive;
  const frame = rbox(w - 0.06, h * 0.58, d - 0.06, 0.025, MAT.darkWood, 0.008);
  put(frame, 0, h * 0.3, 0);
  g.add(frame);
  const cushion = rbox(w, h * 0.45, d, 0.075, fabric, 0.018);
  put(cushion, 0, h * 0.77, 0);
  g.add(cushion);
  const seam = rbox(w * 0.78, 0.012, 0.012, 0.004, MAT.fabricCharcoal, 0.002);
  put(seam, 0, h * 0.99, d / 2 - 0.09);
  g.add(seam);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const foot = rbox(0.045, h * 0.3, 0.045, 0.012, MAT.blackMetal, 0.004);
    put(foot, sx * (w / 2 - 0.1), h * 0.15, sz * (d / 2 - 0.1));
    g.add(foot);
  }
  g.userData.footprint = { w: w + 0.04, d: d + 0.04 };
  shade(g);
  return g;
}

export function createMagazineRack({ w = 0.72, h = 0.9, d = 0.3 } = {}) {
  const g = new THREE.Group();
  g.name = "Rak majalah";
  g.userData.interactionLabel = "Rak majalah";
  const base = rbox(w, 0.07, d, 0.025, MAT.darkWood, 0.008);
  put(base, 0, 0.035, 0);
  g.add(base);
  const sideGeo = cached(`magSide:${h}:${d}`, () => new THREE.BoxGeometry(0.035, h, d));
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(sideGeo, MAT.blackMetal);
    put(side, sx * (w / 2 - 0.02), h / 2, 0);
    g.add(side);
  }
  for (let i = 0; i < 3; i++) {
    const shelf = rbox(w - 0.08, 0.035, d, 0.01, MAT.deskTop, 0.005);
    put(shelf, 0, 0.22 + i * 0.24, 0);
    g.add(shelf);
    for (let j = 0; j < 3; j++) {
      const cover = rbox(0.15, 0.19, 0.018, 0.006, [MAT.wallAccent, MAT.terracotta, MAT.fabricNavy][(i + j) % 3], 0.003);
      put(cover, -0.22 + j * 0.19, 0.32 + i * 0.24, d / 2 - 0.015);
      cover.rotation.z = (j - 1) * 0.06;
      g.add(cover);
    }
  }
  g.userData.footprint = { w: w + 0.05, d: d + 0.05 };
  shade(g);
  return g;
}

export function createWallShelf({ w = 1.0, d = 0.24, shelves = 2 } = {}) {
  const g = new THREE.Group();
  g.name = "Rak dinding";
  g.userData.interactionLabel = "Rak dinding";
  for (let i = 0; i < shelves; i++) {
    const shelf = rbox(w, 0.045, d, 0.018, MAT.deskTop, 0.008);
    put(shelf, 0, i * 0.36, 0);
    g.add(shelf);
    for (const sx of [-1, 1]) {
      const bracket = rbox(0.035, 0.15, 0.03, 0.008, MAT.blackMetal, 0.004);
      put(bracket, sx * (w / 2 - 0.12), i * 0.36 - 0.075, -0.03);
      g.add(bracket);
    }
    // Individually modeled books add a little asymmetry to the clean profile.
    for (let b = 0; b < 5; b++) {
      const book = rbox(0.07 + (b % 2) * 0.015, 0.15 + (b % 3) * 0.018, 0.11, 0.004,
        [MAT.fabricNavy, MAT.terracotta, MAT.wallAccent, MAT.fabricSand, MAT.leaf][(b + i) % 5], 0.002);
      put(book, -w * 0.29 + b * 0.105, i * 0.36 + 0.09, 0);
      book.rotation.z = (b % 2 ? 1 : -1) * 0.035;
      g.add(book);
    }
  }
  g.userData.footprint = { w: w + 0.04, d: d + 0.04 };
  shade(g);
  return g;
}

export function createBench({ w = 1.35, d = 0.44, h = 0.48 } = {}) {
  const g = new THREE.Group();
  g.name = "Bangku koridor";
  g.userData.interactionLabel = "Bangku koridor";
  const seat = rbox(w, 0.09, d, 0.055, MAT.fabricOlive || MAT.fabricNavy, 0.012);
  put(seat, 0, h - 0.02, 0);
  g.add(seat);
  const seatInset = rbox(w - 0.14, 0.006, d - 0.12, 0.04, MAT.fabricSand, 0.002);
  put(seatInset, 0, h + 0.022, 0.005);
  g.add(seatInset);
  const backRail = rbox(w - 0.12, 0.26, 0.065, 0.025, MAT.darkWood, 0.008);
  put(backRail, 0, h + 0.15, -d / 2 + 0.025);
  g.add(backRail);
  for (let i = 0; i < 5; i++) {
    const slat = rbox(0.025, 0.18, 0.014, 0.007, MAT.blackMetal, 0.003);
    put(slat, -w * 0.34 + i * (w * 0.17), h + 0.15, -d / 2 + 0.061);
    g.add(slat);
  }
  const frame = rbox(w - 0.12, 0.05, d - 0.09, 0.012, MAT.blackMetal, 0.004);
  put(frame, 0, h - 0.11, 0);
  g.add(frame);
  for (const sx of [-1, 1]) {
    const leg = rbox(0.06, h - 0.12, d - 0.1, 0.015, MAT.blackMetal, 0.005);
    put(leg, sx * (w / 2 - 0.15), (h - 0.12) / 2, 0);
    g.add(leg);
    const foot = rbox(0.16, 0.025, d - 0.04, 0.008, MAT.brass, 0.003);
    put(foot, sx * (w / 2 - 0.15), 0.015, 0);
    g.add(foot);
  }
  g.userData.footprint = { w: w + 0.04, d: d + 0.04 };
  shade(g);
  return g;
}

export function createAcousticPanel({ w = 0.58, h = 0.92, color = "navy" } = {}) {
  const g = new THREE.Group();
  g.name = "Panel akustik";
  g.userData.interactionLabel = "Panel akustik";
  const panelMat = color === "rust" ? MAT.fabricRust : color === "sand" ? MAT.fabricSand : color === "sage" ? MAT.wallSage : color === "olive" ? MAT.fabricOlive : MAT.fabricNavy;
  const backing = rbox(w, h, 0.075, 0.04, MAT.blackMetal, 0.012);
  g.add(backing);
  const fabric = rbox(w - 0.05, h - 0.05, 0.04, 0.035, panelMat, 0.008);
  put(fabric, 0, 0, 0.05);
  g.add(fabric);
  // Ribbing gives the soft-fabric panel visible depth under side lighting.
  for (let i = 0; i < 5; i++) {
    const rib = rbox(0.012, h - 0.12, 0.008, 0.004, MAT.fabricCharcoal, 0.002);
    put(rib, -w * 0.34 + i * (w * 0.17), 0, 0.077);
    g.add(rib);
  }
  g.userData.footprint = { w: w + 0.03, d: 0.1 };
  shade(g);
  return g;
}

/* ===================================================================== *
 *  Meeting / collaboration
 * ===================================================================== */

export function createMeetingTable({ w = 2.6, d = 1.2, h = 0.74 } = {}) {
  const g = new THREE.Group();
  g.name = "Meja rapat";
  g.userData.interactionLabel = "Meja rapat";
  const top = rbox(w, 0.05, d, 0.03, MAT.deskTop, 0.008);
  put(top, 0, h - 0.025, 0);
  g.add(top);

  const spine = rbox(w * 0.5, 0.34, 0.16, 0.02, MAT.blackMetal, 0.01);
  put(spine, 0, h - 0.24, 0);
  g.add(spine);

  [-1, 1].forEach((s) => {
    const leg = rbox(0.1, h - 0.05, d * 0.62, 0.02, MAT.blackMetal, 0.01);
    put(leg, s * (w / 2 - 0.4), (h - 0.05) / 2, 0);
    g.add(leg);
  });

  // Integrated cable hatch and compact pop-up conference power hub.
  const hatch = rbox(0.36, 0.012, 0.2, 0.008, MAT.plasticDark, 0.004);
  put(hatch, 0, h + 0.001, -0.2);
  g.add(hatch);
  const hub = rbox(0.22, 0.028, 0.115, 0.018, MAT.blackMetal, 0.006);
  put(hub, -w * 0.24, h + 0.018, -d / 2 + 0.19);
  g.add(hub);
  for (let port = 0; port < 3; port++) {
    const socket = rbox(0.032, 0.003, 0.022, 0.004, port === 2 ? MAT.ledStrip : MAT.chrome, 0.0015);
    put(socket, -w * 0.24 - 0.06 + port * 0.06, h + 0.034, -d / 2 + 0.19);
    g.add(socket);
  }
  // Fine brass inlay on both long edges catches warm light without overdecorating.
  for (const side of [-1, 1]) {
    const inlay = rbox(w - 0.16, 0.006, 0.012, 0.004, MAT.brass, 0.0015);
    put(inlay, 0, h + 0.002, side * (d / 2 - 0.055));
    g.add(inlay);
  }
  const vase = cyl(0.06, 0.08, 0.16, MAT.ceramicWhite, 24);
  put(vase, 0, h + 0.08, 0);
  g.add(vase);
  const sprig = cyl(0.005, 0.004, 0.3, MAT.leaf, 6);
  sprig.rotation.z = 0.22;
  put(sprig, 0.02, h + 0.28, 0);
  g.add(sprig);
  const leaf = new THREE.Mesh(leafGeometry(0.13, 0.06), MAT.leafLight);
  leaf.rotation.set(-1.2, 0.3, 0);
  put(leaf, 0.05, h + 0.4, 0);
  g.add(leaf);

  shade(g);
  g.userData.footprint = { w, d };
  g.userData.anchor = new THREE.Vector3(0, h, 0);
  return g;
}
