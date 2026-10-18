/* ===================================================================== *
 *  Atelier Corp — a miniature startup office seen from above.
 *
 *  Boot order:
 *    1. HUD                       (so failures have somewhere to land)
 *    2. renderer + materials
 *    3. Building                  (rooms, walls, furniture, merged)
 *    4. camera + crew + fx
 *    5. input, player, interaction
 *    6. loop
 * ===================================================================== */

import * as THREE from "three";

import "./styles.css";

import { buildMaterials } from "./world/materials.js";
import { setMaxAnisotropy } from "./world/textures.js";
import { Building } from "./world/Building.js";
import { Fx } from "./gfx/fx.js";
import { Viewmodel } from "./gfx/Viewmodel.js";
import { Crew } from "./systems/Crew.js";
import { Input } from "./systems/Input.js";
import { TopCamera } from "./systems/TopCamera.js";
import { Player } from "./systems/Player.js";
import { Interaction } from "./systems/Interaction.js";
import { HUD } from "./ui/HUD.js";
import { ViewChar } from "./systems/ViewChar.js";
import { Meeting } from "./systems/AI.js";

const POPULATION = 14;
const BG = 0x141922;

const sleepFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

async function boot() {
  let dispatch = () => {};
  const hud = new HUD({ onAction: (name, value, node) => dispatch(name, value, node) });
  let viewChar = null;

  try {
    hud.setProgress(0.06, "Menyiapkan GPU");
    await sleepFrame();

    const canvas = hud.dom.canvas;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      stencil: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);

    // Parallel projection: the isometric look. The frustum is driven by
    // TopCamera, which also fits it to the building + window aspect.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 240);

    hud.setProgress(0.22, "Membuat material");
    await sleepFrame();
    setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
    buildMaterials();

    hud.setProgress(0.44, "Membangun gedung");
    await sleepFrame();
    const building = new Building(scene).build();

    hud.setProgress(0.66, "Memanggil pegawai");
    await sleepFrame();

    const rig = new TopCamera(camera, canvas);
    rig.fit(building.bounds, window.innerWidth / window.innerHeight);
    rig.setFocus(0, 0, true);

    const fx = new Fx(scene);
    // the hands and sleeves visible in first-person view
    rig.viewmodel = new Viewmodel(scene);

    let player = null;
    const crew = new Crew({
      scene,
      building,
      onFootstep: (c) => {
        if (player && player.controlled === c) {
          fx.ripple(c.position, { radius: 0.3, duration: 0.6, speed: 1.2 });
        }
      },
    });
    crew.populate(POPULATION);

    const meeting = new Meeting({ building, crew });

    hud.setProgress(0.86, "Menyambungkan kontrol");
    await sleepFrame();

    const input = new Input(canvas);

    player = new Player({
      building,
      crew,
      rig,
      input,
      fx,
      hud,
      onInteract: () => {},
    });

    const interaction = new Interaction({
      camera,
      building,
      crew,
      input,
      fx,
      hud,
      rig,
      player,
      onPossess: (critter) => player.possess(critter),
    });

    /* ------------------------------------------------------------- state */

    const clock = new THREE.Clock();
    let elapsed = 0;
    let fps = 60;
    let statsAccum = 0;
    let rosterAccum = 0;
    let pendingPhoto = false;

    /* ------------------------------------------------------- hud <-> game */

    const critterById = (id) => crew.members.find((c) => c.id === id) || null;

    function toastStatus(critter) {
      if (!critter) return;
      interaction.selected = critter;
      hud.openCritter({
        name: critter.name,
        emoji: critter.spec.emoji,
        dept: critter.department?.name || "",
        status: critter.status,
        species: critter.spec.name,
        controlled: critter.controlled,
        id: critter.id,
      });
    }

    function setTime(value, quiet = false) {
      const v = Math.max(0, Math.min(1, Number(value) || 0));
      building.setNightness(v);
      hud.setActive("time", String(v));
      if (!quiet) {
        hud.toast(v < 0.25 ? "Pagi di kantor ☀️" : v < 0.75 ? "Sore menjelang 🌇" : "Lampu malam menyala 🌙");
      }
    }

    function reset() {
      meeting.end();
      const btn = document.getElementById("btn-meeting");
      if (btn) { btn.textContent = "Rapat"; btn.classList.remove("is-accent"); }
      player.release();
      interaction.clearSelection();
      rig.follow(null);
      rig.overview(true);
      setTime(0, true);
      hud.toast("Kantor di-reset");
    }

    function onAction(name, value) {
      switch (name) {
        case "spawn-open":
          hud.toggleSpawn(true);
          break;
        case "spawn-close":
          hud.toggleSpawn(false);
          break;
        case "spawn-species":
          hud.setSpeciesSelected(value);
          break;
        case "spawn-confirm": {
          const critter = player.spawn({ species: hud.speciesSelected, name: hud.spawnName });
          hud.toggleSpawn(false);
          toastStatus(critter);
          break;
        }
        case "possess": {
          const c = critterById(value);
          if (c) {
            player.possess(c);
            toastStatus(c);
          }
          break;
        }
        case "focus": {
          const c = critterById(value);
          if (c) {
            rig.follow(c);
            toastStatus(c);
          }
          break;
        }
        case "select-critter": {
          const c = critterById(value);
          if (c) {
            rig.follow(c);
            toastStatus(c);
          }
          break;
        }
        case "release":
          player.release();
          hud.toast("Karakter dilepas — dia kembali bekerja");
          break;
        case "roster":
          hud.toggleRoster();
          break;
        case "zoom":
          if (value === "in") rig.zoomBy(0.78);
          else if (value === "out") rig.zoomBy(1.28);
          else rig.overview();
          break;
        case "rotate":
          rig.targetYaw += value === "left" ? Math.PI / 4 : -Math.PI / 4;
          break;
        case "time":
          setTime(value);
          break;
        case "photo":
          pendingPhoto = true;
          break;
        case "reset":
          reset();
          break;
        case "help":
          hud.toggleHelp();
          break;
        case "help-close":
          hud.toggleHelp(false);
          break;
        case "viewchar-open": {
          hud.toggleViewChar(true);
          const first = hud.speciesSelected || "cat";
          hud.renderViewCharSpecies(first);
          if (!viewChar) viewChar = new ViewChar(hud.dom.viewcharCanvas);
          viewChar.show(first);
          break;
        }
        case "viewchar-close":
          hud.toggleViewChar(false);
          viewChar?.hide();
          break;
        case "viewchar-species": {
          hud.setSpeciesSelected(value);
          // update active state in viewchar grid
          for (const el of hud.dom.viewcharSpecies?.children || []) {
            el.classList.toggle("is-active", el.dataset.value === value);
          }
          viewChar?.show(value);
          break;
        }
        case "meeting": {
          const btn = document.getElementById("btn-meeting");
          if (meeting.active) {
            meeting.end();
            if (btn) { btn.textContent = "Rapat"; btn.classList.remove("is-accent"); }
            hud.toast("Rapat selesai — semua karyawan kembali bekerja ✅", 3000);
          } else if (meeting.start()) {
            if (btn) { btn.textContent = "Akhiri Rapat"; btn.classList.add("is-accent"); }
            hud.toast("Rapat dimulai — semua karyawan menuju ruang meeting 🧑‍💼", 3200);
          } else {
            hud.toast("Rapat sedang berlangsung", 2200);
          }
          break;
        }
        case "close-card":
          interaction.clearSelection();
          break;
        default:
          break;
      }
    }
    dispatch = onAction;

    /* --------------------------------------------------------- shortcuts */

    input.onKey("KeyE", () => player.interact());
    input.onKey("Space", () => {
      if (player.controlled) {
        player.controlled.gesture("wave", 1.4);
        player.controlled.status = "Melambai 👋";
      }
    });
    input.onKey("KeyG", () => hud.toggleRoster());
    input.onKey("KeyN", () => setTime(building.targetNightness < 0.5 ? 1 : 0));
    input.onKey("KeyP", () => {
      pendingPhoto = true;
    });
    input.onKey("KeyR", reset);
    input.onKey("KeyH", () => hud.toggleHelp());
    input.onKey("Escape", () => {
      if (hud.modalOpen) {
        hud.toggleHelp(false);
        hud.toggleSpawn(false);
        hud.toggleViewChar(false);
        viewChar?.hide();
      } else if (input.locked) {
        input.releaseLock(); // first Esc frees the mouse, second steps out
      } else if (player.active) {
        player.release();
      }
    });

    /* ------------------------------------------------------------ resize */

    let resizeRaf = 0;
    function onResize() {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h, false);
        rig.resize(w / h);
      });
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    // Ctrl/Cmd + scroll harus memperbesar DUNIA saja, bukan seluruh halaman —
    // panel HUD (dock, roster, kartu) tetap pada ukurannya.
    const onCtrlWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      // modal & daftar masih boleh scroll biasa; sisanya zoom dunia
      const t = e.target;
      if (t && t.closest && t.closest(".modal, .roster, input, textarea")) return;
      if (rig.firstPerson) return;
      e.preventDefault();
      input.wheel = 0; // cegah zoom ganda dari handler wheel kanvas
      const factor = Math.exp(THREE.MathUtils.clamp(e.deltaY, -240, 240) * 0.0016);
      rig.zoomBy(factor);
    };
    window.addEventListener("wheel", onCtrlWheel, { passive: false });

    /* ------------------------------------------------------------- photo */

    function savePhoto() {
      try {
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `critter-corp-${Date.now()}.png`;
        a.click();
        hud.toast("Foto tersimpan");
      } catch (err) {
        console.warn(err);
        hud.toast("Gagal menyimpan foto");
      }
    }

    /* -------------------------------------------------------------- loop */

    function frame() {
      requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;

      building.update(dt, elapsed);
      player.update(dt); // drive the body first, then let it step
      crew.update(dt, elapsed);
      meeting.update(dt);
      rig.update(dt, input, player.active);
      fx.update(dt, elapsed);

      interaction.enabled = !hud.modalOpen;
      if (interaction.enabled) {
        interaction.update(dt);
        const click = input.consumeClick();
        if (click) {
          // inside a body, the first click grabs the mouse (mouse-look);
          // once locked, clicks are just "interact with what I'm aiming at"
          if (rig.firstPerson && !input.locked) input.requestLock();
          else interaction.handleClick(click);
        }
        const dbl = input.consumeDoubleClick();
        if (dbl) interaction.handleDoubleClick(dbl);
      } else {
        input.consumeClick();
        input.consumeDoubleClick();
        input.consumeDelta();
        interaction.hovered = null;
        hud.hideTooltip();
      }

      renderer.render(scene, rig.activeCamera);
      if (pendingPhoto) {
        pendingPhoto = false;
        savePhoto();
      }

      fps += (1 / Math.max(dt, 1e-4) - fps) * 0.08;
      statsAccum += dt;
      if (statsAccum > 0.25) {
        statsAccum = 0;
        const info = renderer.info.render;
        hud.setStats({
          fps,
          pop: crew.members.length,
          calls: info.calls,
          triangles: info.triangles,
        });
      }
      rosterAccum += dt;
      if (rosterAccum > 0.5) {
        rosterAccum = 0;
        hud.renderRoster(crew.roster());
      }
    }

    /* ----------------------------------------------------------------- go */

    hud.setProgress(1, "Siap");
    hud.setActive("time", "0");
    hud.setControlling(null);
    hud.toggleRoster(true);
    hud.renderRoster(crew.roster());
    setTime(0, true);

    clock.start();
    frame();
    hud.hideLoader(420);

    setTimeout(() => {
      hud.toast("Klik pegawai mana pun untuk melihat statusnya, atau buat karaktermu 👋", 4200);
    }, 1200);

    window.atelierCorp = { THREE, renderer, scene, camera, building, crew, rig, fx, input, player, interaction, hud };
  } catch (err) {
    console.error(err);
    hud.showError(err);
  }
}

boot();
