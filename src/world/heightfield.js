/* ============================================================
   heightfield.js — bakes terrain height + surface type grids and
   the smoothed road centre-line network used by everything else.
   ============================================================ */
import { fbm, ridged, ramp } from './noise.js';
import { WORLD, DISTRICTS, ROADS, ROAD_TYPES, SURF } from './layout.js';
import { clamp, lerp } from '../core/util.js';

const RES = 2;                                   // metres per heightfield cell
const N = Math.round(WORLD.size / RES) + 1;      // grid points per axis
const ORIGIN = -WORLD.half;

/* The natural landscape is smooth, so it is evaluated on a coarse grid and
   upsampled; only the road corridors need the full 2 m resolution, and those
   are rasterised straight into the fine grid. This keeps the whole bake
   under a second instead of chewing through 40M noise samples. */
const CRES = 8;
const CN = Math.round(WORLD.size / CRES) + 1;
const STRIDE = CRES / RES;                        // 4 fine cells per coarse cell

/* ---------------- raw terrain shape (before roads) ---------------- */

function districtT(d, x, z) {
  const dx = (x - d.x) / d.rx, dz = (z - d.z) / d.rz;
  const dist = Math.sqrt(dx * dx + dz * dz);
  return 1 - ramp(dist, 0.62, 1.08);
}

export function baseHeight(x, z) {
  // broad rolling landscape
  let h = (fbm(x / 880, z / 880, 4, 11) - 0.5) * 30;
  h += (fbm(x / 250, z / 250, 3, 23) - 0.5) * 8;
  h += (fbm(x / 62, z / 62, 2, 37) - 0.5) * 1.8;
  h += 9;

  // Torque Ridge — big hills to the east
  const hills = DISTRICTS.find((d) => d.id === 'hills');
  const ht = districtT(hills, x, z);
  if (ht > 0) {
    const r = ridged(x / 430, z / 430, 4, 5);
    h += (r * 74 + 10) * ht * ht;
  }

  // Amp Park — gentle mounds
  const park = DISTRICTS.find((d) => d.id === 'park');
  const pt = districtT(park, x, z);
  if (pt > 0) h += (fbm(x / 110, z / 110, 3, 91) - 0.45) * 15 * pt;

  // flattened built-up districts
  for (const d of DISTRICTS) {
    if (d.flat == null) continue;
    const t = districtT(d, x, z);
    if (t > 0) h = lerp(h, d.flat, t * 0.94);
  }

  // coastline: everything slopes into the bay in the far south
  const coast = ramp(z, 640, 950);
  if (coast > 0) {
    const beachWobble = (fbm(x / 130, z / 130, 2, 61) - 0.5) * 6 * (1 - coast);
    h = lerp(h, 0.9, coast) + beachWobble * (1 - coast);   // dry sand, just above the tide
  }
  // shoreline then deep water
  const deep = ramp(z, 950, 1120);
  if (deep > 0) h = lerp(h, -17, deep);

  // soft world border ridge so you can't ride off the edge cleanly
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const eT = ramp(edge, WORLD.half - 55, WORLD.half - 6);
  if (eT > 0 && z < 900) h += eT * 46;

  return h;
}

/* ---------------- geometry helpers ---------------- */

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

/** resample a control polyline into a dense smooth polyline */
export function resampleSpline(pts, closed, step = 4) {
  const n = pts.length;
  const get = (i) => {
    if (closed) return pts[((i % n) + n) % n];
    return pts[clamp(i, 0, n - 1)];
  };
  const raw = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const seglen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const div = Math.max(2, Math.ceil(seglen / step));
    for (let j = 0; j < div; j++) raw.push(catmullRom(p0, p1, p2, p3, j / div));
  }
  if (!closed) raw.push(pts[n - 1].slice());
  else raw.push(raw[0].slice());
  return raw;
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const wx = px - ax, wz = pz - az;
  const L2 = vx * vx + vz * vz;
  let t = L2 > 1e-6 ? (wx * vx + wz * vz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + vx * t, cz = az + vz * t;
  return { d: Math.hypot(px - cx, pz - cz), t };
}

/* ============================================================
   RoadNet — smoothed road centrelines + spatial lookup
   ============================================================ */
export class RoadNet {
  constructor() {
    this.roads = [];
    this.cell = 48;
    this.grid = new Map();
    this._build();
  }

  _key(cx, cz) { return cx * 10007 + cz; }

  _build() {
    /* 1. raw profile from the land, per road */
    for (const def of ROADS) {
      const tp = ROAD_TYPES[def.type];
      const pts = resampleSpline(def.pts, !!def.closed, 4);
      let ys = pts.map((p) => baseHeight(p[0], p[1]));

      // `level` = dead flat at its own mean height (the drag strip);
      // `y` = pinned to an absolute height (the boardwalk and pier, which
      // have to sit above the water rather than follow the seabed)
      if (def.y !== undefined) {
        ys = ys.map(() => def.y);
      } else if (def.level) {
        const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
        ys = ys.map(() => mean);
      }

      const road = {
        id: def.id, type: def.type, w: def.w, half: def.w / 2,
        shoulder: tp.shoulder, surf: tp.surf, color: tp.color,
        markings: tp.markings, curb: tp.curb, closed: !!def.closed,
        pinned: !!def.level || def.y !== undefined,
        maxSlope: def.type === 'trail' ? 0.30 : def.type === 'highway' ? 0.07
                  : def.type === 'pad' ? 0.03 : def.type === 'lane' ? 0.22 : 0.18,
        // how far a road may sit above/below the natural land before it
        // stops looking like a road and starts looking like a viaduct
        maxDev: def.type === 'highway' ? 11 : def.type === 'pad' ? 9
                : def.type === 'trail' ? 3 : def.type === 'lane' ? 5 : 6.5,
        nat: null,
        pts, ys, length: 0,
      };
      for (let i = 1; i < pts.length; i++) {
        road.length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      }
      this.roads.push(road);
    }

    /* 2. grade each road, then reconcile junctions so two roads that cross
          agree on a height — otherwise every intersection is a step you
          launch off. Reconcile / re-grade a few times to settle. */
    for (const r of this.roads) {
      // smoothed natural ground along the centreline, used as the anchor
      let nat = r.pts.map((p) => baseHeight(p[0], p[1]));
      for (let k = 0; k < 8; k++) {
        const out = nat.slice();
        for (let i = 1; i < nat.length - 1; i++) out[i] = nat[i - 1] * 0.25 + nat[i] * 0.5 + nat[i + 1] * 0.25;
        nat = out;
      }
      r.nat = nat;
    }
    for (const r of this.roads) {
      this._gradeRoad(r, r.type === 'trail' ? 6 : r.type === 'pad' ? 30 : 18);
      this._clampToTerrain(r);
    }
    this._indexSamples();
    for (let pass = 0; pass < 6; pass++) {
      this._reconcileJunctions(pass >= 4 ? 0.55 : 0.85);
      for (const r of this.roads) { this._gradeRoad(r, 4); this._clampToTerrain(r); }
    }
    // a final smooth: clamping to the land leaves small kinks, and a road
    // you can see the polygons of is a road you bounce along
    for (const r of this.roads) this._gradeRoad(r, 12);

    // spatial hash of segments
    for (let ri = 0; ri < this.roads.length; ri++) {
      const r = this.roads[ri];
      const reach = r.half + r.shoulder + 3;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const ax = r.pts[i][0], az = r.pts[i][1], bx = r.pts[i + 1][0], bz = r.pts[i + 1][1];
        const minx = Math.min(ax, bx) - reach, maxx = Math.max(ax, bx) + reach;
        const minz = Math.min(az, bz) - reach, maxz = Math.max(az, bz) + reach;
        const c0x = Math.floor(minx / this.cell), c1x = Math.floor(maxx / this.cell);
        const c0z = Math.floor(minz / this.cell), c1z = Math.floor(maxz / this.cell);
        for (let cx = c0x; cx <= c1x; cx++) {
          for (let cz = c0z; cz <= c1z; cz++) {
            const k = this._key(cx, cz);
            let arr = this.grid.get(k);
            if (!arr) { arr = []; this.grid.set(k, arr); }
            arr.push([ri, i]);
          }
        }
      }
    }
  }

  /** smooth a road's elevation profile and cap its gradient */
  _gradeRoad(r, passes) {
    if (r.pinned) return;
    let ys = r.ys;
    const n = ys.length;
    for (let k = 0; k < passes; k++) {
      const out = ys.slice();
      for (let i = 0; i < n; i++) {
        const a = ys[r.closed ? (i - 1 + n - 1) % (n - 1) : Math.max(0, i - 1)];
        const b = ys[r.closed ? (i + 1) % (n - 1) : Math.min(n - 1, i + 1)];
        out[i] = a * 0.25 + ys[i] * 0.5 + b * 0.25;
      }
      ys = out;
    }
    for (let rep = 0; rep < 3; rep++) {
      for (let i = 1; i < n; i++) {
        const ds = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]) || 1;
        const lim = r.maxSlope * ds;
        const dy = ys[i] - ys[i - 1];
        if (dy > lim) ys[i] = ys[i - 1] + lim;
        else if (dy < -lim) ys[i] = ys[i - 1] - lim;
      }
      for (let i = n - 2; i >= 0; i--) {
        const ds = Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]) || 1;
        const lim = r.maxSlope * ds;
        const dy = ys[i] - ys[i + 1];
        if (dy > lim) ys[i] = ys[i + 1] + lim;
        else if (dy < -lim) ys[i] = ys[i + 1] - lim;
      }
    }
    r.ys = ys;
  }

  _indexSamples() {
    const CELL = 8;
    this._sampleGrid = new Map();
    for (let ri = 0; ri < this.roads.length; ri++) {
      const r = this.roads[ri];
      for (let i = 0; i < r.pts.length; i++) {
        const k = Math.floor(r.pts[i][0] / CELL) * 10007 + Math.floor(r.pts[i][1] / CELL);
        let a = this._sampleGrid.get(k); if (!a) { a = []; this._sampleGrid.set(k, a); }
        a.push([ri, i]);
      }
    }
  }

  /** keep a road within a sane cut/fill of the natural ground so it hugs
   *  the land instead of flying over it on an invisible viaduct */
  _clampToTerrain(r) {
    if (r.pinned || !r.nat) return;
    const d = r.maxDev;
    for (let i = 0; i < r.ys.length; i++) {
      const lo = r.nat[i] - d, hi = r.nat[i] + d;
      if (r.ys[i] < lo) r.ys[i] = lo;
      else if (r.ys[i] > hi) r.ys[i] = hi;
    }
  }

  /** pull crossing roads toward a shared height at their junctions */
  _reconcileJunctions(strength) {
    const CELL = 8, REACH = 14;
    const grid = new Map();
    for (let ri = 0; ri < this.roads.length; ri++) {
      const r = this.roads[ri];
      for (let i = 0; i < r.pts.length; i++) {
        const k = Math.floor(r.pts[i][0] / CELL) * 10007 + Math.floor(r.pts[i][1] / CELL);
        let a = grid.get(k); if (!a) { a = []; grid.set(k, a); }
        a.push([ri, i]);
      }
    }
    const next = this.roads.map((r) => r.ys.slice());
    for (let ri = 0; ri < this.roads.length; ri++) {
      const r = this.roads[ri];
      if (r.pinned) continue;
      for (let i = 0; i < r.pts.length; i++) {
        const px = r.pts[i][0], pz = r.pts[i][1];
        let sum = r.ys[i], wsum = 1;
        const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
        for (let ox = -1; ox <= 1; ox++) {
          for (let oz = -1; oz <= 1; oz++) {
            const arr = grid.get((cx + ox) * 10007 + (cz + oz));
            if (!arr) continue;
            for (const [rj, j] of arr) {
              // a road can cross itself (switchbacks) — reconcile those too,
              // but never a sample against its own neighbours
              if (rj === ri && Math.abs(j - i) < 30) continue;
              const o = this.roads[rj];
              const d = Math.hypot(o.pts[j][0] - px, o.pts[j][1] - pz);
              if (d > REACH) continue;
              // a pinned road (the drag strip) wins outright
              const w = (1 - d / REACH) * (o.pinned ? 6 : 1);
              sum += o.ys[j] * w; wsum += w;
            }
          }
        }
        next[ri][i] = lerp(r.ys[i], sum / wsum, strength);
      }
    }
    for (let ri = 0; ri < this.roads.length; ri++) this.roads[ri].ys = next[ri];
  }

  /** true distance to the closest road centreline within `maxDist`.
   *  query() only sees inside a road's corridor, which is useless for
   *  "is this building sitting in the road" checks on wide roads. */
  nearest(x, z, maxDist = 30) {
    const span = Math.ceil(maxDist / this.cell) + 1;
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = null;
    for (let ox = -span; ox <= span; ox++) {
      for (let oz = -span; oz <= span; oz++) {
        const arr = this.grid.get(this._key(cx + ox, cz + oz));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const r = this.roads[arr[k][0]], i = arr[k][1];
          const res = distToSeg(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
          if (res.d > maxDist) continue;
          if (!best || res.d < best.dist) best = { dist: res.d, road: r, t: res.t };
        }
      }
    }
    return best;
  }

  /** nearest road influence at (x,z) → {h, w, surf, dist} or null */
  query(x, z) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = null;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const arr = this.grid.get(this._key(cx + ox, cz + oz));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const ri = arr[k][0], i = arr[k][1];
          const r = this.roads[ri];
          const res = distToSeg(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
          const reach = r.half + r.shoulder;
          if (res.d > reach) continue;
          const y = lerp(r.ys[i], r.ys[i + 1], res.t);
          // weight: 1 on the road, fading through the shoulder
          const w = 1 - ramp(res.d, r.half - 0.5, reach);
          if (!best || w > best.w || (w === best.w && res.d < best.dist)) {
            best = { h: y, w, surf: r.surf, dist: res.d, road: r, onRoad: res.d <= r.half };
          }
        }
      }
    }
    return best;
  }
}

/* ============================================================
   Heightfield — baked grids
   ============================================================ */
export class Heightfield {
  constructor(roadNet) {
    this.res = RES; this.n = N; this.origin = ORIGIN;
    this.h = new Float32Array(N * N);
    this.s = new Uint8Array(N * N);
    this.roadNet = roadNet;
    this.minH = 1e9; this.maxH = -1e9;
    this.ch = new Float32Array(CN * CN);
    this.cs = new Uint8Array(CN * CN);
  }

  baseSurface(x, z) {
    if (z > 990) return SURF.WATER;
    if (z > 700) return SURF.SAND;
    for (const d of DISTRICTS) {
      if (d.kind !== 'city' && d.kind !== 'industrial' && d.kind !== 'strip') continue;
      const dx = (x - d.x) / d.rx, dz = (z - d.z) / d.rz;
      if (Math.sqrt(dx * dx + dz * dz) < 0.92) return SURF.CONCRETE;
    }
    return SURF.GRASS;
  }

  /** step 1 — natural landscape on the coarse grid (rows [r0,r1) of CN) */
  bakeCoarseRows(r0, r1) {
    for (let j = r0; j < r1; j++) {
      const z = ORIGIN + j * CRES;
      for (let i = 0; i < CN; i++) {
        const x = ORIGIN + i * CRES;
        this.ch[j * CN + i] = baseHeight(x, z);
        this.cs[j * CN + i] = this.baseSurface(x, z);
      }
    }
  }

  /** step 2 — bilinear upsample into the fine grid (rows [r0,r1) of N) */
  upsampleRows(r0, r1) {
    const { h, s } = this;
    for (let j = r0; j < r1; j++) {
      const cj = Math.min(CN - 2, Math.floor(j / STRIDE));
      const tz = (j - cj * STRIDE) / STRIDE;
      const rowA = cj * CN, rowB = (cj + 1) * CN;
      const sj = Math.min(CN - 1, Math.round(j / STRIDE));
      const sRow = sj * CN;
      for (let i = 0; i < N; i++) {
        const ci = Math.min(CN - 2, Math.floor(i / STRIDE));
        const tx = (i - ci * STRIDE) / STRIDE;
        const h00 = this.ch[rowA + ci], h10 = this.ch[rowA + ci + 1];
        const h01 = this.ch[rowB + ci], h11 = this.ch[rowB + ci + 1];
        const y = (h00 + (h10 - h00) * tx) * (1 - tz) + (h01 + (h11 - h01) * tx) * tz;
        const idx = j * N + i;
        h[idx] = y;
        s[idx] = this.cs[sRow + Math.min(CN - 1, Math.round(i / STRIDE))];
        if (y < this.minH) this.minH = y;
        if (y > this.maxH) this.maxH = y;
      }
    }
  }

  /** step 3 — burn road corridors into the fine grid (roads [r0,r1)) */
  rasterizeRoads(r0, r1, acc) {
    const { h, s } = this;
    const roads = this.roadNet.roads;
    for (let ri = r0; ri < r1 && ri < roads.length; ri++) {
      const r = roads[ri];
      const reach = r.half + r.shoulder;
      for (let k = 0; k < r.pts.length - 1; k++) {
        const ax = r.pts[k][0], az = r.pts[k][1], ay = r.ys[k];
        const bx = r.pts[k + 1][0], bz = r.pts[k + 1][1], by = r.ys[k + 1];
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - ORIGIN) / RES));
        const i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + reach - ORIGIN) / RES));
        const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach - ORIGIN) / RES));
        const j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + reach - ORIGIN) / RES));
        const vx = bx - ax, vz = bz - az;
        const L2 = vx * vx + vz * vz;
        const invL2 = L2 > 1e-6 ? 1 / L2 : 0;
        for (let j = j0; j <= j1; j++) {
          const pz = ORIGIN + j * RES;
          const row = j * N;
          for (let i = i0; i <= i1; i++) {
            const px = ORIGIN + i * RES;
            let t = ((px - ax) * vx + (pz - az) * vz) * invL2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const cx = ax + vx * t, cz = az + vz * t;
            const d = Math.hypot(px - cx, pz - cz);
            if (d > reach) continue;
            const w = 1 - ramp(d, r.half - 0.5, reach);
            if (w <= 0.002) continue;
            const idx = row + i;
            if (w <= acc.w[idx]) continue;
            acc.w[idx] = w;
            acc.y[idx] = ay + (by - ay) * t;
            acc.surf[idx] = r.surf;
            acc.on[idx] = d <= r.half ? 1 : 0;
          }
        }
      }
    }
  }

  /** step 4 — blend the rasterised corridors over the landscape */
  applyRoads(acc, r0, r1) {
    const { h, s } = this;
    for (let idx = r0; idx < r1; idx++) {
      const w = acc.w[idx];
      if (w <= 0.002) continue;
      const y = lerp(h[idx], acc.y[idx], w);
      h[idx] = y;
      if (acc.on[idx]) s[idx] = acc.surf[idx];
      else if (w > 0.4 && acc.surf[idx] === SURF.DIRT) s[idx] = SURF.DIRT;
      if (y < this.minH) this.minH = y;
      if (y > this.maxH) this.maxH = y;
    }
  }

  makeRoadAcc() {
    return {
      w: new Float32Array(N * N),
      y: new Float32Array(N * N),
      surf: new Uint8Array(N * N),
      on: new Uint8Array(N * N),
    };
  }

  /** bilinear height sample */
  height(x, z) {
    const fx = (x - this.origin) / this.res;
    const fz = (z - this.origin) / this.res;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0) i = 0; if (j < 0) j = 0;
    if (i > this.n - 2) i = this.n - 2;
    if (j > this.n - 2) j = this.n - 2;
    const tx = clamp(fx - i, 0, 1), tz = clamp(fz - j, 0, 1);
    const n = this.n, h = this.h;
    const h00 = h[j * n + i], h10 = h[j * n + i + 1];
    const h01 = h[(j + 1) * n + i], h11 = h[(j + 1) * n + i + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  /** surface id (nearest cell) */
  surface(x, z) {
    const i = Math.round((x - this.origin) / this.res);
    const j = Math.round((z - this.origin) / this.res);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return SURF.GRASS;
    return this.s[j * this.n + i];
  }

  /** terrain normal via central differences */
  normal(x, z, out) {
    const e = 1.6;
    const hl = this.height(x - e, z), hr = this.height(x + e, z);
    const hd = this.height(x, z - e), hu = this.height(x, z + e);
    const nx = hl - hr, ny = 2 * e, nz = hd - hu;
    const len = Math.hypot(nx, ny, nz) || 1;
    if (out) { out.set(nx / len, ny / len, nz / len); return out; }
    return [nx / len, ny / len, nz / len];
  }
}

export { RES as HF_RES, N as HF_N, CN as HF_CN };
