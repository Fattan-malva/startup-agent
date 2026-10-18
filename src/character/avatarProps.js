import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { G, M, MB, add } from "./critterShared.js";

export function buildProps(c) {
  const a = c.appearance;
  const accentHex = a.tieColor ?? 0x597ca7;
  const cup = new THREE.Group();
  cup.name = "Coffee cup";
  c.holdR.add(cup);
  const inner = new THREE.Group();
  inner.position.y = 0.02;
  cup.add(inner);
  add(inner, G("avatar-cup-body", () => new THREE.CylinderGeometry(0.027, 0.021, 0.064, 20)), M(0xf1eee8));
  add(inner, G("avatar-cup-sleeve", () => new THREE.CylinderGeometry(0.026, 0.023, 0.027, 20)), M(0xa8764a), 0, -0.003, 0);
  add(inner, G("avatar-cup-lid", () => new THREE.CylinderGeometry(0.030, 0.028, 0.008, 20)), M(0x2b2d31), 0, 0.036, 0);
  add(inner, G("avatar-cup-logo", () => new THREE.CircleGeometry(0.008, 16)), MB(accentHex), 0, -0.002, 0.024);
  cup.visible = false;
  c.cupProp = cup;

  const phone = new THREE.Group();
  phone.name = "Smartphone";
  c.holdL.add(phone);
  const device = new THREE.Group();
  // digeser ke bagian dalam (menuju tengah badan) supaya pas di telapak,
  // tidak melayang di sisi luar tangan
  device.position.set(-0.016, 0.02, 0.004);
  device.rotation.set(0, Math.PI, -0.12);
  phone.add(device);
  add(device, new RoundedBoxGeometry(0.039, 0.075, 0.006, 3, 0.004), M(0x1d2128));
  add(device, new RoundedBoxGeometry(0.033, 0.066, 0.002, 2, 0.002), MB(0x8fb8d7), 0, 0, 0.004);
  add(device, new RoundedBoxGeometry(0.011, 0.002, 0.001, 2, 0.0008), MB(0xf6f7f8), 0, 0.026, 0.0055);
  phone.visible = false;
  c.phoneProp = phone;

  const laptop = new THREE.Group();
  laptop.name = "Laptop";
  // Sedikit lebih maju & naik supaya saat duduk tidak menembus kaki.
  laptop.position.set(0, 0.075, 0.16);
  c.body.add(laptop);
  const alu = M(0xb7bdc5, { metalness: 0.46, roughness: 0.36 });
  add(laptop, new RoundedBoxGeometry(0.21, 0.012, 0.145, 3, 0.005), alu);
  add(laptop, new RoundedBoxGeometry(0.176, 0.002, 0.073, 2, 0.002), MB(0x353b45), 0, 0.007, -0.015);
  for (let row = 0; row < 3; row++) {
    add(laptop,
      G(`laptop-key-${row}`, () => new THREE.BoxGeometry(0.13, 0.0015, 0.0018)),
      MB(0x8f969f), 0, 0.0085, -0.04 + row * 0.014);
  }
  const screen = new THREE.Group();
  screen.position.set(0, 0.009, 0.068);
  screen.rotation.x = -0.22;
  laptop.add(screen);
  add(screen, new RoundedBoxGeometry(0.21, 0.142, 0.007, 3, 0.005), M(0x9da5af, { metalness: 0.35, roughness: 0.4 }), 0, 0.071, 0);
  add(screen, new RoundedBoxGeometry(0.19, 0.121, 0.002, 2, 0.002), MB(0x152638), 0, 0.071, 0.0045);
  add(screen, new RoundedBoxGeometry(0.12, 0.006, 0.002, 2, 0.001), MB(0x65c6b0), -0.015, 0.092, 0.006);
  add(screen, new RoundedBoxGeometry(0.085, 0.004, 0.002, 2, 0.001), MB(0x7195df), 0.025, 0.073, 0.006);
  add(screen, new RoundedBoxGeometry(0.15, 0.004, 0.002, 2, 0.001), MB(0xb4c0cf), 0, 0.053, 0.006);
  laptop.visible = false;
  c.laptopProp = laptop;
}