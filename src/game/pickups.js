/* ============================================================
   pickups.js — a reason to go and look at the map

   Two kinds of floating thing:
     · cells   — 120 scattered across Volta Bay, one-time collects,
                 tracked in the save. Finding them all is the closest
                 thing the game has to a completion goal.
     · boosts  — respawning speed gates on the long roads, worth a
                 short burst of extra power and a combo tick.

   They are drawn as one instanced mesh and only the ones near the
   player are simulated, so 120 of them cost nothing.
   ============================================================ */
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { WORLD } from '../world/layout.js';

const CELL_COUNT = 120;
const BOOST_COUNT = 34;
const ACTIVE_RANGE = 220;

export class Pickups {
  constructor(scene, world, saved = []) {
    this.scene = scene;
    this.world = world;
    this.taken = new Set(saved);
    this.cells = [];
    this.boosts = [];
    this.events = [];
    this._place();
    this._buildMesh();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._up = new THREE.Vector3(0, 1, 0);
  }

  /* deterministic placement so a cell is always in the same spot */
  _place() {
    let seed = 20260919;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // cells: spread over the whole map, nudged onto standable ground,
    // and deliberately biased toward the interesting places
    const hotspots = this.world.pois.map((p) => [p.x, p.z]);
    let id = 0;
    let guard = 0;
    while (this.cells.length < CELL_COUNT && guard++ < CELL_COUNT * 40) {
      let x, z;
      if (rnd() < 0.42 && hotspots.length) {
        const h = hotspots[(rnd() * hotspots.length) | 0];
        x = h[0] + (rnd() - 0.5) * 260;
        z = h[1] + (rnd() - 0.5) * 260;
      } else {
        x = (rnd() - 0.5) * WORLD.size * 0.92;
        z = (rnd() - 0.5) * WORLD.size * 0.92;
      }
      const y = this.world.groundAt(x, z);
      if (y < WORLD.seaLevel + 1.2) continue;             // not in the bay
      if (Math.abs(x) > WORLD.half - 90 || Math.abs(z) > WORLD.half - 90) continue;
      let tooClose = false;
      for (const c of this.cells) {
        if (Math.hypot(c.x - x, c.z - z) < 55) { tooClose = true; break; }
      }
      if (tooClose) continue;
      this.cells.push({ id: 'c' + (id++), x, z, y: y + 1.5, spin: rnd() * 6.28 });
    }

    // boosts: along the fast roads
    const fast = this.world.roadNet.roads.filter((r) => r.w >= 10 && r.pts.length > 30);
    for (let i = 0; i < BOOST_COUNT && fast.length; i++) {
      const r = fast[(rnd() * fast.length) | 0];
      const k = 4 + ((rnd() * (r.pts.length - 8)) | 0);
      const p = r.pts[k];
      this.boosts.push({
        x: p[0], z: p[1], y: this.world.groundAt(p[0], p[1]) + 1.3,
        cool: 0, spin: rnd() * 6.28,
      });
    }
  }

  _buildMesh() {
    // an octahedron reads as "pickup" at any distance
    const cellGeo = new THREE.OctahedronGeometry(0.62, 0);
    const boostGeo = new THREE.TorusGeometry(1.5, 0.16, 6, 14);
    boostGeo.rotateY(Math.PI / 2);

    this.cellMesh = new THREE.InstancedMesh(
      cellGeo,
      new THREE.MeshBasicMaterial({ color: 0x39e6a4, transparent: true, opacity: 0.95 }),
      160);
    this.boostMesh = new THREE.InstancedMesh(
      boostGeo,
      new THREE.MeshBasicMaterial({ color: 0x16c2ff, transparent: true, opacity: 0.8 }),
      BOOST_COUNT);

    for (const m of [this.cellMesh, this.boostMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
    }
  }

  get collected() { return this.taken.size; }
  get total() { return this.cells.length; }

  update(dt, body, t) {
    const px = body.pos.x, pz = body.pos.z;
    let n = 0;
    for (const c of this.cells) {
      if (this.taken.has(c.id)) continue;
      const dx = c.x - px, dz = c.z - pz;
      if (Math.abs(dx) > ACTIVE_RANGE || Math.abs(dz) > ACTIVE_RANGE) continue;
      const d = Math.hypot(dx, dz);
      if (d < 2.6 && Math.abs(body.pos.y + 1.0 - c.y) < 3.2) {
        this.taken.add(c.id);
        this.events.push({ t: 'cell', x: c.x, y: c.y, z: c.z, n: this.taken.size, total: this.cells.length });
        continue;
      }
      if (n >= 160) break;
      this._q.setFromAxisAngle(this._up, t * 1.6 + c.spin);
      this._v.set(c.x, c.y + Math.sin(t * 2 + c.spin) * 0.22, c.z);
      this._m.compose(this._v, this._q, this._s);
      this.cellMesh.setMatrixAt(n++, this._m);
    }
    this.cellMesh.count = n;
    this.cellMesh.instanceMatrix.needsUpdate = true;

    let b = 0;
    for (const g of this.boosts) {
      g.cool = Math.max(0, g.cool - dt);
      const dx = g.x - px, dz = g.z - pz;
      if (Math.abs(dx) > ACTIVE_RANGE || Math.abs(dz) > ACTIVE_RANGE) continue;
      if (!g.cool && Math.hypot(dx, dz) < 2.9 && Math.abs(body.pos.y + 1 - g.y) < 3.4 && Math.abs(body.speed) > 4) {
        g.cool = 9;
        this.events.push({ t: 'boost', x: g.x, y: g.y, z: g.z });
        continue;
      }
      if (g.cool) continue;
      this._q.setFromAxisAngle(this._up, t * 0.8 + g.spin);
      this._v.set(g.x, g.y, g.z);
      this._m.compose(this._v, this._q, this._s);
      this.boostMesh.setMatrixAt(b++, this._m);
    }
    this.boostMesh.count = b;
    this.boostMesh.instanceMatrix.needsUpdate = true;
  }

  /** nearest uncollected cell, for the HUD arrow */
  nearestCell(x, z) {
    let best = null, bd = 1e9;
    for (const c of this.cells) {
      if (this.taken.has(c.id)) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best ? { ...best, dist: bd } : null;
  }

  blips(px, pz, range) {
    const out = [];
    for (const c of this.cells) {
      if (this.taken.has(c.id)) continue;
      if (Math.abs(c.x - px) < range && Math.abs(c.z - pz) < range) out.push({ x: c.x, z: c.z, c: '#39e6a4' });
    }
    return out;
  }

  drain() { const e = this.events.slice(); this.events.length = 0; return e; }
  save() { return [...this.taken]; }
}
