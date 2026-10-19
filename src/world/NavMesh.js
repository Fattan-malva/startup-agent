/* ===================================================================== *
 *  NavMesh — jaring jalan (navigation mesh) untuk karakter.
 *
 *  Ide besarnya hanya TIGA langkah yang gampang dibaca:
 *
 *    1. BAGI    — sel jalan (grid 25 cm dari Building) dikelompokkan jadi
 *                 kotak-kotak besar ("poligon cembung"). Ribuan sel jadi
 *                 cuma puluhan/ratusan kotak.
 *    2. SAMBUNG — dua kotak yang bersebelahan disambung lewat "portal"
 *                 (ruas garis yang mereka bagi). Lahirlah graf kecil
 *                 antar-kotak.
 *    3. JALAN   — rute dicari dengan A* di graf kotak (sangat cepat),
 *                 lalu dihaluskan dengan FUNNEL / string-pulling supaya
 *                 jalurnya lurus dan wajar — bukan patah-patah mengikuti
 *                 sel grid.
 *
 *  Kenapa ini "overpower" tapi tetap sederhana:
 *    • A* berjalan di atas puluhan kotak, bukan ~20.000 sel → instan,
 *      jadi karakter boleh merencanakan ulang sesering apa pun.
 *    • Funnel menghasilkan jalur taut (hampir selalu yang terpendek) dan
 *      otomatis "memotong sudut" seperti manusia.
 *    • Kerumunan tetap diperhitungkan: portal yang dekat karakter lain
 *      diberi biaya ekstra, jadi NPC memilih lorong yang lebih lega.
 *
 *  Modul ini read-only terhadap Building: kalau NavMesh gagal dipakai,
 *  Building.route() masih punya A* grid lama sebagai cadangan.
 * ===================================================================== */

/** Heap biner minimum super kecil (indeks + skor paralel). */
class MinHeap {
  constructor() {
    this.i = [];
    this.f = [];
  }
  get size() { return this.i.length; }
  push(item, score) {
    const { i, f } = this;
    i.push(item);
    f.push(score);
    let c = i.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (f[p] <= f[c]) break;
      [i[p], i[c]] = [i[c], i[p]];
      [f[p], f[c]] = [f[c], f[p]];
      c = p;
    }
  }
  pop() {
    const { i, f } = this;
    const top = i[0];
    const last = i.length - 1;
    i[0] = i[last];
    f[0] = f[last];
    i.pop();
    f.pop();
    let c = 0;
    for (;;) {
      const l = c * 2 + 1;
      const r = l + 1;
      let m = c;
      if (l < i.length && f[l] < f[m]) m = l;
      if (r < i.length && f[r] < f[m]) m = r;
      if (m === c) break;
      [i[m], i[c]] = [i[c], i[m]];
      [f[m], f[c]] = [f[c], f[m]];
      c = m;
    }
    return top;
  }
}

/** Luas dua kali segitiga (a,b,c) di bidang XZ — dipakai funnel. */
function tri(aX, aZ, bX, bZ, cX, cZ) {
  return (bX - aX) * (cZ - aZ) - (bZ - aZ) * (cX - aX);
}

export class NavMesh {
  /** Bangun NavMesh dari grid jalan milik Building. */
  static build(grid) {
    const nm = new NavMesh();
    nm._build(grid);
    return nm;
  }

  _build(grid) {
    const { cell, x0, z0, nx, nz, walk } = grid;
    this.grid = grid;
    this.cell = cell;
    this.x0 = x0;
    this.z0 = z0;
    this.nx = nx;
    this.nz = nz;

    /* ── 1. BAGI: greedy rectangle decomposition ─────────────────────── */
    const owner = new Int32Array(nx * nz).fill(-1);
    const rects = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!walk[k] || owner[k] >= 0) continue;
        // melebar ke kanan selama masih jalan & belum dimiliki
        let w = 1;
        while (i + w < nx && walk[k + w] && owner[k + w] < 0) w++;
        // meninggi selama baris berikutnya jalan penuh selebar w
        let h = 1;
        grow: while (j + h < nz) {
          const row = (j + h) * nx + i;
          for (let t = 0; t < w; t++) {
            if (!walk[row + t] || owner[row + t] >= 0) break grow;
          }
          h++;
        }
        const id = rects.length;
        for (let dj = 0; dj < h; dj++) {
          const row = (j + dj) * nx + i;
          for (let di = 0; di < w; di++) owner[row + di] = id;
        }
        rects.push({
          id,
          cx: x0 + (i + w / 2) * cell,
          cz: z0 + (j + h / 2) * cell,
        });
      }
    }

    /* ── 2. SAMBUNG: portal antar kotak bersebelahan ─────────────────── */
    const portals = [];
    const adj = rects.map(() => []);
    const addPortal = (a, b, ax, az, bx, bz) => {
      const p = { a, b, ax, az, bx, bz, mx: (ax + bx) / 2, mz: (az + bz) / 2 };
      const id = portals.length;
      portals.push(p);
      adj[a].push({ to: b, portal: id });
      adj[b].push({ to: a, portal: id });
    };
    const samePair = (k, a, b) => owner[k] === a && owner[k + 1] === b;

    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const a = owner[k];
        if (a < 0) continue;
        // sisi +x (portal vertikal): gabungkan run ke bawah
        if (i + 1 < nx) {
          const b = owner[k + 1];
          const prev = j > 0 ? (j - 1) * nx + i : -1;
          if (b >= 0 && b !== a && !(prev >= 0 && samePair(prev, a, b))) {
            let e = j;
            while (e + 1 < nz && samePair((e + 1) * nx + i, a, b)) e++;
            const wx = x0 + (i + 1) * cell;
            addPortal(a, b, wx, z0 + j * cell, wx, z0 + (e + 1) * cell);
          }
        }
        // sisi +z (portal horizontal): gabungkan run ke kanan
        if (j + 1 < nz) {
          const b = owner[k + nx];
          const prev = i > 0 ? k - 1 : -1;
          if (b >= 0 && b !== a && !(prev >= 0 && owner[prev] === a && owner[prev + nx] === b)) {
            let e = i;
            while (e + 1 < nx && owner[j * nx + e + 1] === a && owner[(j + 1) * nx + e + 1] === b) e++;
            const wz = z0 + (j + 1) * cell;
            addPortal(a, b, x0 + i * cell, wz, x0 + (e + 1) * cell, wz);
          }
        }
      }
    }

    this.owner = owner;
    this.rects = rects;
    this.portals = portals;
    this.adj = adj;
  }

  /** Kotak yang memuat titik (x,z), atau -1. */
  rectAt(x, z) {
    const i = Math.floor((x - this.x0) / this.cell);
    const j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return this.owner[j * this.nx + i];
  }

  /**
   * Rute dari `start` ke `goal` (dua-duanya titik sel jalan), menghindari
   * kerumunan bila `avoid` (daftar objek ber-`.position`) diberikan.
   *
   * `check(x1,z1,x2,z2)` opsional: penyaring keamanan (dipakai Building
   * untuk memastikan tiap ruas benar-benar bebas rintangan). Bila jalur
   * funnel gagal, otomatis jatuh ke jalur titik-tengah portal yang lebih
   * konservatif.
   *
   * Mengembalikan deretan titik {x,z}, atau null.
   */
  path(start, goal, avoid = null, check = null) {
    const ra = this.rectAt(start.x, start.z);
    const rb = this.rectAt(goal.x, goal.z);
    if (ra < 0 || rb < 0) return null;

    // satu kotak = cembung → garis lurus selalu sah di dalamnya
    if (ra === rb) {
      return [{ x: start.x, z: start.z }, { x: goal.x, z: goal.z }];
    }

    const R = this.rects;
    const n = R.length;
    const g = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const via = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const goalR = R[rb];
    const h = (i) => Math.hypot(R[i].cx - goalR.cx, R[i].cz - goalR.cz);

    g[ra] = 0;
    heap.push(ra, h(ra));
    while (heap.size) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === rb) break;
      for (const e of this.adj[cur]) {
        if (closed[e.to]) continue;
        const p = this.portals[e.portal];
        let cost = Math.hypot(R[e.to].cx - R[cur].cx, R[e.to].cz - R[cur].cz);
        // kerumunan: portal yang dekat karakter lain jadi lebih "mahal"
        if (avoid) {
          for (let a = 0; a < avoid.length; a++) {
            const o = avoid[a];
            const dx = o.position.x - p.mx;
            const dz = o.position.z - p.mz;
            const d2 = dx * dx + dz * dz;
            if (d2 < 2.25) cost += (1.5 - Math.sqrt(d2)) * 0.6;
          }
        }
        const ng = g[cur] + cost;
        if (ng < g[e.to]) {
          g[e.to] = ng;
          from[e.to] = cur;
          via[e.to] = e.portal;
          heap.push(e.to, ng + h(e.to));
        }
      }
    }
    if (!isFinite(g[rb])) return null;

    // rangkai kotak + portal yang dilewati
    const chain = [];
    for (let c = rb; c !== -1; c = from[c]) chain.push(c);
    chain.reverse();
    const gates = [];
    for (let i = 1; i < chain.length; i++) gates.push(this.portals[via[chain[i]]]);

    // ── 3. JALAN: funnel / string-pulling ─────────────────────────────
    const funnel = this._funnel(start, goal, gates);
    if (!check || this._clear(funnel, check)) return funnel;

    // Jalur cadangan (lebih konservatif): titik tengah tiap portal.
    // Selalu berada di tengah lorong, jadi paling aman dari sudut.
    const mids = [{ x: start.x, z: start.z }];
    for (const g of gates) mids.push({ x: g.mx, z: g.mz });
    mids.push({ x: goal.x, z: goal.z });
    return mids;
  }

  /** Semua ruas jalur lolos pemeriksaan `check`? */
  _clear(pts, check) {
    for (let i = 1; i < pts.length; i++) {
      if (!check(pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z)) return false;
    }
    return true;
  }

  /**
   * "Simple Stupid Funnel": tarik jalur sekencang mungkin melalui portal.
   * Hasilnya titik-titik sudut saja — jalur lurus, bukan zig-zag sel.
   */
  _funnel(start, goal, gates) {
    const out = [{ x: start.x, z: start.z }];

    // arah datang: dipakai menomori tiap portal jadi (kiri, kanan)
    let px = start.x;
    let pz = start.z;
    const L = new Float64Array(gates.length);
    const Rx = new Float64Array(gates.length);
    const Rz = new Float64Array(gates.length);
    const Lx = new Float64Array(gates.length);
    for (let i = 0; i < gates.length; i++) {
      const p = gates[i];
      const dx = p.mx - px;
      const dz = p.mz - pz;
      // tri(prev, prev+arah, titik) > 0 → titik ada di sisi KANAN perjalanan
      // (di bidang XZ, "kanan" pemain yang menghadap +x adalah +z).
      const left = tri(px, pz, px + dx, pz + dz, p.ax, p.az) < 0;
      Lx[i] = left ? p.ax : p.bx;
      L[i] = left ? p.az : p.bz;
      Rx[i] = left ? p.bx : p.ax;
      Rz[i] = left ? p.bz : p.az;
      px = p.mx;
      pz = p.mz;
    }

    let apexX = start.x, apexZ = start.z, apexI = -1;
    let leftX = start.x, leftZ = start.z, leftI = -1;
    let rightX = start.x, rightZ = start.z, rightI = -1;

    let i = 0;
    const total = gates.length;
    let guard = total * 4 + 16;
    while (i <= total && guard-- > 0) {
      const isEnd = i === total;
      const lX = isEnd ? goal.x : Lx[i];
      const lZ = isEnd ? goal.z : L[i];
      const rX = isEnd ? goal.x : Rx[i];
      const rZ = isEnd ? goal.z : Rz[i];

      // perbarui sisi kanan
      if (tri(apexX, apexZ, rightX, rightZ, rX, rZ) <= 0) {
        if (apexI === rightI || tri(apexX, apexZ, leftX, leftZ, rX, rZ) > 0) {
          rightX = rX; rightZ = rZ; rightI = i;
        } else {
          out.push({ x: leftX, z: leftZ });
          apexX = leftX; apexZ = leftZ; apexI = leftI;
          rightX = apexX; rightZ = apexZ; rightI = apexI;
          leftX = apexX; leftZ = apexZ; leftI = apexI;
          continue;
        }
      }
      // perbarui sisi kiri
      if (tri(apexX, apexZ, leftX, leftZ, lX, lZ) >= 0) {
        if (apexI === leftI || tri(apexX, apexZ, rightX, rightZ, lX, lZ) < 0) {
          leftX = lX; leftZ = lZ; leftI = i;
        } else {
          out.push({ x: rightX, z: rightZ });
          apexX = rightX; apexZ = rightZ; apexI = rightI;
          rightX = apexX; rightZ = apexZ; rightI = apexI;
          leftX = apexX; leftZ = apexZ; leftI = apexI;
          continue;
        }
      }
      i++;
    }

    out.push({ x: goal.x, z: goal.z });
    return out;
  }
}
