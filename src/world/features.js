/* ============================================================
   features.js — analytic rideable surfaces (ramps, bowls, humps)

   A feature owns the ground height inside its footprint and blends
   back to the terrain across a margin, so physics and the visual
   mesh are guaranteed to agree: both read groundAt().
   ============================================================ */
import * as THREE from 'three';
import { MeshBuilder, hexRGB } from './meshbuilder.js';
import { clamp, lerp } from '../core/util.js';
import { ramp } from './noise.js';

const MAT = {
  concrete: 0x8b9099,
  concreteDark: 0x6d727a,
  dirt: 0x8a6743,
  wood: 0xa07a4c,
  metal: 0x9aa3ad,
  paint: 0x3a7fc4,
};

class Feature {
  constructor(o) {
    Object.assign(this, o);
    this.yaw = o.yaw || 0;
    this.cos = Math.cos(-this.yaw);
    this.sin = Math.sin(-this.yaw);
    this.margin = o.margin ?? 2.5;
    this.color = o.color ?? MAT.concrete;
    this.priority = o.priority ?? 1;
    this._computeBounds();
  }
  toLocal(x, z) {
    const dx = x - this.x, dz = z - this.z;
    return [dx * this.cos - dz * this.sin, dx * this.sin + dz * this.cos];
  }
  _computeBounds() {
    const reach = (this.radius ?? Math.max(this.len ?? 0, this.wid ?? 0)) + this.margin + 2;
    this.minX = this.x - reach; this.maxX = this.x + reach;
    this.minZ = this.z - reach; this.maxZ = this.z + reach;
  }
  /** influence 0..1 */
  weight() { return 0; }
  /** height of the feature surface (absolute Y) */
  surface() { return 0; }
}

/* ---- rectangular footprint helper (len along local X, wid along local Z) ---- */
function rectWeight(lx, lz, len, wid, margin) {
  const hx = len / 2, hz = wid / 2;
  const ax = Math.abs(lx) - hx, az = Math.abs(lz) - hz;
  if (ax <= 0 && az <= 0) return 1;
  const d = Math.hypot(Math.max(ax, 0), Math.max(az, 0));
  return 1 - ramp(d, 0, margin);
}

/** ramp that rises from the -X edge to the +X edge */
export class Kicker extends Feature {
  constructor(o) { super({ margin: 1.6, ...o }); }
  weight(x, z) { const [lx, lz] = this.toLocal(x, z); return rectWeight(lx, lz, this.len, this.wid, this.margin); }
  surface(x, z, base) {
    const [lx] = this.toLocal(x, z);
    let t = clamp((lx + this.len / 2) / this.len, 0, 1);
    const curve = this.curve ?? 1.7;
    return base + this.h * Math.pow(t, curve);
  }
}

/** ramp up → flat top → ramp down */
export class Table extends Feature {
  constructor(o) { super({ margin: 1.6, ...o }); }
  weight(x, z) { const [lx, lz] = this.toLocal(x, z); return rectWeight(lx, lz, this.len, this.wid, this.margin); }
  surface(x, z, base) {
    const [lx] = this.toLocal(x, z);
    const t = clamp((lx + this.len / 2) / this.len, 0, 1);
    const up = this.up ?? 0.3, down = this.down ?? 0.3;
    let f;
    if (t < up) f = Math.pow(t / up, 1.6);
    else if (t < 1 - down) f = 1;
    else f = Math.pow((1 - t) / down, 1.6);
    return base + this.h * f;
  }
}

/** quarter-pipe: arc rising along +X to `h` at the lip */
export class Quarter extends Feature {
  constructor(o) { super({ margin: 1.4, ...o }); }
  weight(x, z) { const [lx, lz] = this.toLocal(x, z); return rectWeight(lx, lz, this.len, this.wid, this.margin); }
  surface(x, z, base) {
    const [lx] = this.toLocal(x, z);
    const t = clamp((lx + this.len / 2) / this.len, 0, 1);
    // circular: y = h * (1 - sqrt(1 - t^2))
    return base + this.h * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
  }
}

/** rounded roller / speed hump across the path */
export class Hump extends Feature {
  constructor(o) { super({ margin: 1.2, ...o }); }
  weight(x, z) { const [lx, lz] = this.toLocal(x, z); return rectWeight(lx, lz, this.len, this.wid, this.margin); }
  surface(x, z, base) {
    const [lx] = this.toLocal(x, z);
    const t = clamp((lx + this.len / 2) / this.len, 0, 1);
    const n = this.count ?? 1;
    return base + this.h * Math.pow(Math.sin(Math.PI * t * n) , 2);
  }
}

/** raised flat platform with sloped sides (loading dock, plaza) */
export class Plinth extends Feature {
  constructor(o) { super({ margin: 0.6, ...o }); }
  weight(x, z) {
    const [lx, lz] = this.toLocal(x, z);
    return rectWeight(lx, lz, this.len + this.slope * 2, this.wid + this.slope * 2, this.margin);
  }
  surface(x, z, base) {
    const [lx, lz] = this.toLocal(x, z);
    const hx = this.len / 2, hz = this.wid / 2, s = this.slope;
    const ax = Math.max(0, Math.abs(lx) - hx), az = Math.max(0, Math.abs(lz) - hz);
    const d = Math.max(ax, az);
    const f = 1 - clamp(d / s, 0, 1);
    return base + this.h * (f * f * (3 - 2 * f));
  }
}

/** circular concrete plinth with a paraboloid bowl carved into it */
export class Bowl extends Feature {
  constructor(o) { super({ margin: 1.0, ...o }); this.radius = o.rimR + o.slope; this._computeBounds(); }
  weight(x, z) {
    const d = Math.hypot(x - this.x, z - this.z);
    return 1 - ramp(d, this.rimR + this.slope - 1, this.rimR + this.slope + this.margin);
  }
  surface(x, z, base) {
    const d = Math.hypot(x - this.x, z - this.z);
    const top = base + this.lip;
    if (d > this.rimR) {
      // outer apron sloping down to grade
      const f = 1 - clamp((d - this.rimR) / this.slope, 0, 1);
      return base + this.lip * (f * f * (3 - 2 * f));
    }
    if (d > this.bowlR) return top;                         // flat deck
    const t = d / this.bowlR;                               // 0 centre → 1 wall
    // smooth transition wall: cosine profile gives a proper bowl
    const prof = 0.5 - 0.5 * Math.cos(Math.PI * t);
    return top - this.depth * (1 - prof);
  }
}

/* ============================================================
   FeatureSet — registry + lookup + mesh generation
   ============================================================ */
export class FeatureSet {
  constructor() { this.list = []; this.cell = 40; this.grid = new Map(); }

  add(f) { this.list.push(f); return f; }

  index() {
    this.grid.clear();
    for (let i = 0; i < this.list.length; i++) {
      const f = this.list[i];
      const c0x = Math.floor(f.minX / this.cell), c1x = Math.floor(f.maxX / this.cell);
      const c0z = Math.floor(f.minZ / this.cell), c1z = Math.floor(f.maxZ / this.cell);
      for (let cx = c0x; cx <= c1x; cx++)
        for (let cz = c0z; cz <= c1z; cz++) {
          const k = cx * 10007 + cz;
          let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); }
          a.push(i);
        }
    }
  }

  near(x, z) {
    return this.grid.get(Math.floor(x / this.cell) * 10007 + Math.floor(z / this.cell));
  }

  /** strongest feature influence at a point, 0..1 — used to keep props
   *  from being scattered on top of ramps, bowls and plinths */
  coverage(x, z) {
    const ids = this.near(x, z);
    if (!ids) return 0;
    let w = 0;
    for (let k = 0; k < ids.length; k++) {
      const f = this.list[ids[k]];
      if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      const v = f.weight(x, z);
      if (v > w) w = v;
    }
    return w;
  }

  /** blend all overlapping features on top of the terrain height */
  apply(x, z, baseY) {
    const ids = this.near(x, z);
    if (!ids) return baseY;
    let y = baseY;
    // low priority first so high priority wins on top
    for (let p = 0; p <= 3; p++) {
      for (let k = 0; k < ids.length; k++) {
        const f = this.list[ids[k]];
        if (f.priority !== p) continue;
        if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
        const w = f.weight(x, z);
        if (w <= 0.001) continue;
        y = lerp(y, f.surface(x, z, baseY), w);
      }
    }
    return y;
  }

  /** build one merged mesh sampling the *final* ground function */
  buildMesh(groundAt) {
    const b = new MeshBuilder();
    const step = 0.85;
    for (const f of this.list) {
      const w = f.maxX - f.minX, d = f.maxZ - f.minZ;
      const nx = Math.min(150, Math.max(6, Math.ceil(w / step)));
      const nz = Math.min(150, Math.max(6, Math.ceil(d / step)));
      const col = hexRGB(f.color);
      const base = b.v;
      const wts = new Float32Array((nx + 1) * (nz + 1));
      for (let j = 0; j <= nz; j++) {
        for (let i = 0; i <= nx; i++) {
          const x = f.minX + (i / nx) * w;
          const z = f.minZ + (j / nz) * d;
          const y = groundAt(x, z) + 0.025;
          const wt = clamp(f.weight(x, z), 0, 1);
          wts[j * (nx + 1) + i] = wt;
          // fade the concrete/dirt colour out into the surrounding ground
          const v = (0.93 + ((i * 7 + j * 13) % 5) * 0.018) * (0.62 + 0.38 * wt);
          b.vert(x, y, z, 0, 1, 0, col[0] * v, col[1] * v, col[2] * v, i / nx, j / nz);
        }
      }
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const a = base + j * (nx + 1) + i;
          const k = j * (nx + 1) + i;
          const mw = Math.max(wts[k], wts[k + 1], wts[k + nx + 1], wts[k + nx + 2]);
          if (mw < 0.03) continue;       // don't paint a square patch over open ground
          b.quad(a, a + nx + 1, a + nx + 2, a + 1);
        }
      }
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.03 });
    const mesh = b.build(mat);
    mesh.geometry.computeVertexNormals();
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'features';
    return mesh;
  }
}

export { MAT as FEATURE_MAT };
