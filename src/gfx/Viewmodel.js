import * as THREE from "three";

/* ===================================================================== *
 *  Viewmodel — the human avatar's hands and casual sleeves in first person.
 *  Positions are camera-relative: x right, y up, z toward the viewer.
 * ===================================================================== */

const M = (hex) => new THREE.MeshLambertMaterial({ color: hex });

/** Where the two hands sit relative to the eye. */
const HAND_X = 0.3; // sideways
const HAND_Y = -0.235; // just inside the bottom of the frame at 64° fov
const HAND_Z = -0.46; // in front of the lens

export class Viewmodel {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "Viewmodel";
    this.group.visible = false;
    this.group.frustumCulled = false;
    scene.add(this.group);

    this._bob = 0;
    this._sway = 0;
    this._build();
  }

  _build() {
    const g = this.group;

    // slightly darker skin and sleeve tones keep the hands readable
    // against the bright office lights
    this.furMat = M(0xd08a3a); // retained as a compatibility alias for hand skin
    this.skinMat = M(0xe8d5bf);
    this.sleeveMat = M(0x506a85);
    this.darkMat = M(0x26262b);
    this.ceramicMat = M(0xe9e4da);

    /** One cuffed forearm and hand, splayed toward the lower screen corners. */
    const arm = (sign, y, z) => {
      const pivot = new THREE.Group();
      pivot.position.set(HAND_X * sign, y, z);
      pivot.rotation.set(-1.0, 0, 0.55 * sign);

      const sleeve = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.038, 0.17, 4, 10),
        this.sleeveMat,
      );
      sleeve.position.y = -0.12;
      pivot.add(sleeve);

      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.041, 0.041, 0.024, 12),
        this.sleeveMat,
      );
      cuff.position.y = -0.03;
      pivot.add(cuff);

      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 12), this.skinMat);
      palm.scale.set(0.94, 0.9, 1.12);
      pivot.add(palm);

      g.add(pivot);
      return pivot;
    };

    /* ---- tangan kanan: cangkir kopi ---- */
    // catatan: kanan/kiri mengikuti tangan si karakter (cangkir memang
    // digantung di holdR), tanpa ini tampilan first-person kebalik
    this.rightArm = arm(1, HAND_Y, HAND_Z);
    const mug = new THREE.Group();
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.029, 0.072, 16),
      this.ceramicMat,
    );
    mug.add(cup);
    const brew = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.005, 14),
      M(0x43291b),
    );
    brew.position.y = 0.034;
    mug.add(brew);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.007, 8, 14), this.ceramicMat);
    handle.position.set(0.038, 0, 0);
    handle.rotation.y = Math.PI / 2;
    mug.add(handle);
    // sits in the fist: base just above the palm
    mug.position.set(HAND_X - 0.012, HAND_Y + 0.055, HAND_Z - 0.03);
    mug.rotation.set(0.12, 0, -0.08);
    g.add(mug);
    this.mug = mug;

    /* ---- tangan kiri: ponsel, layar menyala ---- */
    this.leftArm = arm(-1, HAND_Y - 0.01, HAND_Z - 0.02);
    const phone = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.132, 0.011), this.darkMat);
    phone.add(shell);
    this.screenMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ea });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.116), this.screenMat);
    screen.position.z = 0.0065;
    phone.add(screen);
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.05, 4, 8), this.skinMat);
    grip.position.set(0, -0.005, -0.02);
    phone.add(grip);
    phone.position.set(-(HAND_X + 0.015), HAND_Y + 0.05, HAND_Z - 0.035);
    phone.rotation.set(-0.42, -0.16, -0.06);
    g.add(phone);
    this.phone = phone;
  }

  /** Show hands with the employee's skin tone and outfit-coloured sleeves. */
  show(spec) {
    if (spec) {
      this.skinMat.color.setHex(spec.skin ?? 0xe8c0a4);
      this.sleeveMat.color.setHex(spec.outfit ?? spec.fur ?? 0x506a85);
      this.furMat.color.copy(this.skinMat.color); // legacy alias
    }
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  /**
   * Ride in front of the camera. `state` carries what the body is doing so
   * the hands can match: walking speed and whether we are seated.
   */
  update(dt, elapsed, camera, state = {}) {
    if (!this.group.visible) return;
    const speed = state.speed || 0;
    const amp = Math.min(1, speed / 2);
    const moving = speed > 0.15;

    const bobT = moving ? Math.sin(elapsed * 9) * 0.013 * amp : Math.sin(elapsed * 1.6) * 0.004;
    const swayT = moving ? Math.cos(elapsed * 4.5) * 0.011 * amp : Math.sin(elapsed * 1.1) * 0.003;
    const k = 1 - Math.exp(-14 * dt);
    this._bob += (bobT - this._bob) * k;
    this._sway += (swayT - this._sway) * k;

    const sink = state.sitting ? -0.05 : 0;
    this.group.position.copy(camera.position);
    this.group.position.y += this._bob + sink;
    this.group.quaternion.copy(camera.quaternion);
    this.group.rotateX(-this._bob * 0.5);
    this.group.rotateZ(-this._sway * 0.6);
    this.group.translateX(this._sway * 0.5); // sway sideways, camera-relative
  }
}
