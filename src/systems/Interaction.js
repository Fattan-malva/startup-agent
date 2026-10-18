import * as THREE from "three";

/* ===================================================================== *
 *  Interaction — hover, click and double-click routing.
 *
 *  Hover raycasts are throttled; everything a click can do is funnelled
 *  into the shared callbacks so main.js stays the single wiring point.
 * ===================================================================== */

const HOVER_PERIOD = 1 / 30;

export class Interaction {
  constructor({ camera, building, crew, input, fx, hud, rig, player, onPossess = null, onSpawnRequest = null, onStaffModal = null }) {
    this.camera = camera;
    this.building = building;
    this.crew = crew;
    this.input = input;
    this.fx = fx;
    this.hud = hud;
    this.rig = rig;
    this.player = player;
    this.onPossess = onPossess;
    this.onSpawnRequest = onSpawnRequest;
    this.onStaffModal = onStaffModal;

    this.enabled = true;
    this.hovered = null;
    this.selected = null;

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._aim = new THREE.Vector2(0, 0);
    this._tmp = new THREE.Vector3();
    this._box = new THREE.Box3();
    this._center = new THREE.Vector3();
    this._timer = 0;
    this._ground = new THREE.Vector3();
  }

  /* -------------------------------------------------------------- hover */

  update(dt) {
    this._timer += dt;
    if (this._timer < HOVER_PERIOD) {
      this._trackTooltip();
      return;
    }
    this._timer = 0;

    const aim = this._aimNdc();
    const hit = this._pick(aim.x, aim.y);
    const meta = hit ? this._metaFor(hit) : null;

    if (hit !== this.hovered) {
      this.hovered = hit;
      this.hud.setCursor(hit ? "pointer" : "default");
      if (hit) {
        const c = this._critterOf(hit);
        this.fx.setHover(hit, c ? 0.55 : undefined);
      } else {
        this.fx.setHover(null);
      }
    }
    if (this.rig.firstPerson) this.hud.setCrosshairHot(!!hit);

    if (meta) this.hud.showTooltip(meta);
    else this.hud.hideTooltip();

    this._trackTooltip();
  }

  /** Where the player is aiming: the crosshair inside a body, else the mouse. */
  _aimNdc() {
    if (this.rig.firstPerson) return this._aim.set(0, 0);
    return this._aim.set(this.input.ndc.x, this.input.ndc.y);
  }

  _trackTooltip() {
    if (!this.hovered) return;
    const meta = this._metaFor(this.hovered);
    if (!meta) return;
    this._anchorOf(this.hovered, this._tmp);
    this._tmp.project(this.rig.activeCamera);
    this.hud.placeTooltip(this._tmp, meta);
  }

  _pick(ndcX, ndcY) {
    const targets = [];
    for (const m of this.crew.members) {
      if (m.root.visible) targets.push(m.root); // never pick the body you wear
    }
    for (const o of this.building.interactives) targets.push(o);
    this._ndc.set(ndcX, ndcY);
    this._raycaster.setFromCamera(this._ndc, this.rig.activeCamera);
    this._raycaster.far = 120;
    const hits = this._raycaster.intersectObjects(targets, true);
    return hits.length ? hits[0].object : null;
  }

  _critterOf(obj) {
    let n = obj;
    while (n) {
      if (n.userData && n.userData.critter) return n.userData.critter;
      n = n.parent;
    }
    return null;
  }

  _interactiveOf(obj) {
    let n = obj;
    while (n) {
      if (n.userData && n.userData.interactive) return n;
      n = n.parent;
    }
    return null;
  }

  _metaFor(obj) {
    const critter = this._critterOf(obj);
    if (critter) {
      return {
        label: `${critter.spec.emoji} ${critter.name}`,
        hint: critter.status,
        critter,
      };
    }
    // Furnitur tidak lagi menampilkan tooltip — hanya karakter.
    return null;
  }

  _anchorOf(obj, out) {
    const critter = this._critterOf(obj);
    if (critter) return out.set(critter.position.x, 0.85, critter.position.z);
    this._box.setFromObject(obj);
    if (!this._box.isEmpty()) {
      this._box.getCenter(out);
      out.y = Math.max(out.y, 0.5);
      return out;
    }
    return obj.getWorldPosition(out);
  }

  /* -------------------------------------------------------------- clicks */

  handleClick(click) {
    const fp = this.rig.firstPerson;
    const aim = fp ? this._aim.set(0, 0) : click.ndc;
    const hit = this._pick(aim.x, aim.y);
    if (!hit) {
      if (fp) return; // inside a body: nothing to walk to, the camera is you
      // click on the floor → walk there (or focus the camera)
      const ground = this.rig.screenToGround(aim.x, aim.y, this._ground);
      if (!ground) return;
      this.fx.ripple(ground, { radius: 0.4, duration: 0.6 });
      if (this.player.active) this.player.setWalkTarget(ground);
      else this.rig.setFocus(ground.x, ground.z);
      this.hud.hideTooltip();
      return;
    }

    const critter = this._critterOf(hit);
    if (critter) {
      this.selected = critter;
      this.hud.openCritter({
        name: critter.name,
        emoji: critter.spec.emoji,
        dept: critter.department?.name || "",
        status: critter.status,
        species: critter.spec.name,
        controlled: critter.controlled,
        id: critter.id,
      });
      this.fx.ripple(critter.position, { radius: 0.4, duration: 0.6, color: 0xffd08a });
      return;
    }

    const prop = this._interactiveOf(hit);
    if (prop) {
      const meta = prop.userData.interactive;
      if (meta.openStaffModal) {
        this.onStaffModal?.();
        this.hud.hideTooltip();
        return;
      }
      // Semua kursi bisa diklik untuk diduduki (pemain yang sedang
      // mengendalikan tubuh). Kartu biasa hanya kalau tidak ada kursi.
      if (meta.seat && this.player?.active) {
        this.player.sitOn(meta.seat);
        prop.getWorldPosition(this._tmp);
        this.fx.ripple(this._tmp, { radius: 0.42, duration: 0.7 });
        this.hud.hideTooltip();
        return;
      }
      const msg = typeof meta.onClick === "function" ? meta.onClick(prop) : meta.hint || "";
      this.hud.openCard(meta, msg);
      prop.getWorldPosition(this._tmp);
      this.fx.ripple(this._tmp, { radius: 0.42, duration: 0.7 });
    }
  }

  handleDoubleClick(dbl) {
    if (this.rig.firstPerson) return;
    const hit = this._pick(dbl.ndc.x, dbl.ndc.y);
    if (!hit) return;
    const critter = this._critterOf(hit);
    if (critter) {
      this.rig.setFocus(critter.position.x, critter.position.z);
      return;
    }
    const prop = this._interactiveOf(hit);
    if (prop) {
      prop.getWorldPosition(this._tmp);
      this.rig.setFocus(this._tmp.x, this._tmp.z);
    }
  }

  clearSelection() {
    this.selected = null;
    this.hud.closeCard();
  }

  /** Called by the HUD when the "take control" button is pressed. */
  possessSelected() {
    if (this.selected) this.onPossess?.(this.selected);
  }
}
