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
import { EditMode } from "./systems/EditMode.js";
import { HUD } from "./ui/HUD.js";
import { ViewChar } from "./systems/ViewChar.js";
import { Meeting } from "./systems/AI.js";

const POPULATION = 14;
const BG = 0x141922;
// Sudut kamera preset: 4 sudut diagonal mengelilingi gedung (derajat).
// 45° = arah awal; 225° = lawannya.
const VIEW_ANGLES = [45, 135, 225, 315];

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

    // Input sudah dipasang lebih awal supaya Mode Edit bisa memakainya
    // sebelum kru dipanggil.
    const input = new Input(canvas);

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

    // Mode Edit world — muat tata ruang tersimpan SEBELUM kru dipanggil
    // supaya rute & titik spawn sudah memperhitungkan perabot yang dipindah.
    const edit = new EditMode({ scene, building, rig, fx, hud, input });
    edit.loadSaved();

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
          if (edit.enabled) edit.setEnabled(false);
          const critter = player.spawn({ species: hud.speciesSelected, name: hud.spawnName });
          hud.toggleSpawn(false);
          toastStatus(critter);
          break;
        }
        case "possess": {
          const c = critterById(value);
          if (c) {
            if (edit.enabled) edit.setEnabled(false);
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
        case "view": {
          const deg = Number(value);
          if (Number.isFinite(deg)) rig.targetYaw = (deg * Math.PI) / 180;
          break;
        }
        case "view-cycle": {
          const deg = ((THREE.MathUtils.radToDeg(rig.targetYaw) % 360) + 360) % 360;
          const VIEW_LABELS = ["Tg", "Tl", "Bl", "Bd"];
          let idx = 0, best = Infinity;
          for (let i = 0; i < VIEW_ANGLES.length; i++) {
            const a = VIEW_ANGLES[i];
            const d = Math.abs(((deg - a + 540) % 360) - 180);
            if (d < best) { best = d; idx = i; }
          }
          const next = VIEW_ANGLES[(idx + 1) % VIEW_ANGLES.length];
          rig.targetYaw = (next * Math.PI) / 180;
          const nextIdx = VIEW_ANGLES.indexOf(next);
          hud.setViewCycle(`Arah: ${VIEW_LABELS[nextIdx]}`);
          break;
        }
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
        /* ---- mode edit (tata ulang world) ------------------------ */
        case "edit-mode":
          if (!edit.enabled) {
            if (player.active) player.release();
            input.releaseLock();
          }
          edit.toggle();
          break;
        case "edit-close":
          edit.setEnabled(false);
          break;
        case "edit-rotate":
          edit.rotateSelected(Number(value) || 0);
          break;
        case "edit-snap":
          edit.setSnap(!edit.snap);
          hud.setEditSnap(edit.snap);
          break;
        case "edit-mat":
          edit.applyMaterial(value);
          break;
        case "edit-reset":
          edit.resetSelected();
          break;
        case "edit-reset-all":
          edit.resetAll();
          break;
        case "edit-save":
          edit.saveNow(true);
          break;
        case "edit-export":
          edit.exportEdits();
          break;
        case "edit-import":
          hud.dom.editFile?.click();
          break;
        case "edit-copy":
          edit.copySelected();
          break;
        case "edit-delete":
          edit.deleteSelected();
          break;
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
    input.onKey("BracketLeft", () => {
      if (edit.enabled) edit.rotateSelected(-15);
    });
    input.onKey("BracketRight", () => {
      if (edit.enabled) edit.rotateSelected(15);
    });
    input.onKey("Delete", () => {
      if (edit.enabled) edit.deleteSelected();
    });
    input.onKey("Backspace", (e) => {
      if (!edit.enabled) return;
      e.preventDefault(); // jangan "kembali" di browser
      edit.deleteSelected();
    });
    input.onKey("KeyD", (e) => {
      if (!edit.enabled || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault(); // Ctrl+D = bookmark di browser → matikan
      edit.copySelected();
    });
    input.onKey("Escape", () => {
      if (edit.enabled) {
        edit.setEnabled(false);
      } else if (hud.modalOpen) {
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

    // Impor layout dunia dari file JSON
    hud.dom.editFile?.addEventListener("change", (e) => {
      const file = e.target.files?.[0] || null;
      edit.importEdits(file);
      e.target.value = "";
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
      edit.update(dt); // Mode Edit: hover & drag perabot (sebelum kamera)
      player.update(dt); // drive the body first, then let it step
      crew.update(dt, elapsed);
      meeting.update(dt);
      rig.suppressDragPan = edit.dragging || !!edit.pressedItem;
      rig.update(dt, input, player.active);
      fx.update(dt, elapsed);

      interaction.enabled = !hud.modalOpen && !edit.enabled;
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

        // Sinkronkan label tombol arah kamera dengan yaw sekarang
        const deg = ((THREE.MathUtils.radToDeg(rig.targetYaw) % 360) + 360) % 360;
        const VIEW_LABELS = ["Tg", "Tl", "Bl", "Bd"];
        let bestA = VIEW_ANGLES[0], bestD = Infinity;
        for (const a of VIEW_ANGLES) {
          const d = Math.abs(((deg - a + 540) % 360) - 180);
          if (d < bestD) { bestD = d; bestA = a; }
        }
        if (bestD <= 5) hud.setViewCycle(`Arah: ${VIEW_LABELS[VIEW_ANGLES.indexOf(bestA)]}`);
      }
      rosterAccum += dt;
      if (rosterAccum > 0.5) {
        rosterAccum = 0;
        hud.renderRoster(crew.roster());
      }
    }

    /* ----------------------------------------------------------------- go */

    hud.setProgress(1, "Siap");
    try { window.lucide?.createIcons?.(); } catch { /* lucide belum termuat */ }
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

    /* Diagnostik singkat dari konsol browser (F12):
       atelierCorp.seatReport() → status tiap kursi (dipakai/terpakai/kursi)
       atelierCorp.navReport()  → komponen jaringan jalan (kantong buntu) */
    window.atelierCorp = {
      THREE, renderer, scene, camera, building, crew, rig, fx, input, player, interaction, hud, edit,
      seatReport() {
        const rows = building.seats.map((s) => ({
          id: s.id,
          type: s.type,
          room: building.roomAt(s.x, s.z),
          x: +s.x.toFixed(2),
          z: +s.z.toFixed(2),
          taken: !!s.taken,
          uses: s.uses || 0,
          approach: !!building.approachTo(s),
        }));
        const summary = {
          total: rows.length,
          taken: rows.filter((r) => r.taken).length,
          bisaDidekati: rows.filter((r) => r.approach).length,
          pernahDipakai: rows.filter((r) => r.uses > 0).length,
          perTipe: rows.reduce((a, r) => ((a[r.type] = (a[r.type] || 0) + 1), a), {}),
        };
        console.table(rows);
        console.info("Ringkasan kursi", summary);
        return summary;
      },
      navReport() {
        const nav = building._navEnsure();
        const sizes = new Map();
        for (const c of nav.comp) {
          if (c < 0) continue;
          sizes.set(c, (sizes.get(c) || 0) + 1);
        }
        const comps = [...sizes.entries()].sort((a, b) => b[1] - a[1]);
        let walk = 0;
        for (const v of nav.walk) walk += v;
        const summary = {
          sel: nav.walk.length,
          jalan: walk,
          komponen: comps.length,
          utama: nav.mainComp,
          kecil: comps.filter(([, n]) => n > 0 && n <= 6).length,
        };
        console.table(comps.slice(0, 10).map(([id, n]) => ({ komponen: id, sel: n, utama: id === nav.mainComp })));
        console.info("Ringkasan navigasi", summary);
        return summary;
      },
    };
  } catch (err) {
    console.error(err);
    hud.showError(err);
  }
}

boot();
