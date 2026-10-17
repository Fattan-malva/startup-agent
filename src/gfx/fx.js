import * as THREE from "three";
import { createHoloMaterial } from "./shaders.js";

/* ===================================================================== *
 *  Fx — the little pieces of feedback that make a scene feel responsive:
 *  footstep ripples, a walk-target marker, and a hover ring.
 *  All of them ride the hologram shader.
 * ===================================================================== */

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "Fx";
    scene.add(this.group);

    this._box = new THREE.Box3();
    this._size = new THREE.Vector3();
    this._center = new THREE.Vector3();

    /* ---- ripple pool ---------------------------------------------- */
    this.rippleGeo = new THREE.RingGeometry(0.34, 0.42, 64);
    this.ripples = [];
    for (let i = 0; i < 14; i++) {
      const mat = createHoloMaterial({ color: 0x8fe8ff, rings: 0 });
      mat.uniforms.uThickness.value = 0.5;
      const mesh = new THREE.Mesh(this.rippleGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.group.add(mesh);
      this.ripples.push({ mesh, mat, life: 0, dur: 1, speed: 1 });
    }

    /* ---- walk target marker -------------------------------------- */
    this.marker = new THREE.Group();
    const mkMat = createHoloMaterial({ color: 0x63e0ff, rings: 3 });
    this.markerMat = mkMat;
    const mRing = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.44, 64), mkMat);
    mRing.rotation.x = -Math.PI / 2;
    this.marker.add(mRing);

    const discMat = new THREE.MeshBasicMaterial({
      color: 0x63e0ff,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), discMat);
    disc.rotation.x = -Math.PI / 2;
    this.marker.add(disc);

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x9ff0ff,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 1.6, 24, 1, true), beamMat);
    this.beam.position.y = 0.8;
    this.marker.add(this.beam);

    this.marker.visible = false;
    this.marker.renderOrder = 6;
    this.group.add(this.marker);

    /* ---- hover ring ---------------------------------------------- */
    const hvMat = createHoloMaterial({ color: 0xffd08a, rings: 2 });
    hvMat.uniforms.uThickness.value = 0.35;
    this.hoverMat = hvMat;
    this.hover = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.5, 64), hvMat);
    this.hover.rotation.x = -Math.PI / 2;
    this.hover.visible = false;
    this.hover.renderOrder = 6;
    this.group.add(this.hover);

    this.elapsed = 0;
  }

  /** Expanding ground ring, e.g. on each footstep. */
  ripple(position, { radius = 0.34, duration = 0.75, color = null, speed = 1 } = {}) {
    const slot = this.ripples.find((r) => r.life <= 0) || this.ripples[0];
    slot.life = duration;
    slot.dur = duration;
    slot.speed = speed;
    slot.baseScale = radius / 0.34;
    slot.mesh.visible = true;
    slot.mesh.position.set(position.x, 0.012, position.z);
    slot.mesh.scale.setScalar(slot.baseScale * 0.4);
    if (color !== null) slot.mat.uniforms.uColor.value.setHex(color);
    else slot.mat.uniforms.uColor.value.setHex(0x8fe8ff);
    return slot;
  }

  setWalkTarget(position) {
    if (!position) {
      this.marker.visible = false;
      return;
    }
    this.marker.visible = true;
    this.marker.position.set(position.x, 0.014, position.z);
  }

  setHover(object, radius = 0.6) {
    if (!object) {
      this.hover.visible = false;
      return;
    }
    this._box.setFromObject(object);
    if (this._box.isEmpty()) {
      this.hover.visible = false;
      return;
    }
    this._box.getSize(this._size);
    this._box.getCenter(this._center);
    const r = Math.max(radius, Math.max(this._size.x, this._size.z) * 0.5 + 0.12);
    this.hover.visible = true;
    this.hover.position.set(this._center.x, 0.016, this._center.z);
    this.hover.scale.setScalar(r / 0.5);
  }

  update(dt, elapsed) {
    this.elapsed = elapsed;

    for (const r of this.ripples) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const p = 1 - Math.max(0, r.life) / r.dur;
      r.mat.uniforms.uTime.value = elapsed;
      r.mat.uniforms.uProgress.value = Math.min(1, p * r.speed);
      r.mat.uniforms.uOpacity.value = Math.pow(1 - p, 1.6) * 0.85;
      r.mesh.scale.setScalar((r.baseScale || 1) * (0.4 + p * 1.45));
      if (r.life <= 0) r.mesh.visible = false;
    }

    if (this.marker.visible) {
      const p = (elapsed % 1.15) / 1.15;
      this.markerMat.uniforms.uTime.value = elapsed;
      this.markerMat.uniforms.uProgress.value = p;
      this.markerMat.uniforms.uOpacity.value = 0.85;
      this.beam.material.opacity = 0.1 + Math.sin(elapsed * 3) * 0.04;
      this.beam.scale.setScalar(1 + Math.sin(elapsed * 2.2) * 0.03);
    }

    if (this.hover.visible) {
      this.hoverMat.uniforms.uTime.value = elapsed;
      this.hoverMat.uniforms.uProgress.value = (elapsed % 1.6) / 1.6;
      this.hoverMat.uniforms.uOpacity.value = 0.9;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
}
