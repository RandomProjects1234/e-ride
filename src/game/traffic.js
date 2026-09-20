/* ============================================================
   traffic.js — the thing that makes Volta Bay feel inhabited

   Cars drive the road network, people walk the pavements, and the
   police chase you when you have earned it. Everything spawns in a
   ring around the player and is recycled when it falls out of range,
   so the cost is flat no matter how big the map is.

   Traffic is not scenery: squeezing past a car at speed scores a
   near miss, and hitting one hurts and makes the police interested.
   ============================================================ */
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/util.js';

const CAR_BUDGET = 26;          // live cars around the player
const PED_BUDGET = 22;
const SPAWN_MIN = 55;           // don't pop in right on top of the player
const SPAWN_MAX = 190;
const DESPAWN = 250;

const CAR_COLORS = [
  0xd6dbe4, 0x2c3340, 0x8f2b33, 0x1f4f7a, 0x2f6b4f, 0xc8862a,
  0x6b3f8a, 0xb5b9c2, 0x3a4250, 0x7a2e2e, 0x24608c, 0xe0c24a,
];
const SHIRT_COLORS = [
  0xe05a5a, 0x4f8fd6, 0x53b872, 0xe0b84a, 0x9a6bd6, 0xe0e0e0,
  0x2f3b4a, 0xd67ab0, 0x50c4c0, 0xbf7040,
];

/* ---------------- geometry ----------------
   Built from lathed/extruded profiles rather than stacked boxes, so the
   silhouette reads as a car from a distance: sloped bonnet, raked screen,
   wheel arches, tapered roof. Still cheap enough to instance dozens. */

/** an extruded profile swept along Z — the workhorse for car bodies */
function sweep(profile, sections, color) {
  // profile: [[y, halfWidth], ...] bottom to top at a section
  // sections: [[z, scaleW, scaleH, yOff], ...] front to back
  const pos = [], nor = [], idx = [];
  const rows = sections.length, cols = profile.length;
  for (let si = 0; si < rows; si++) {
    const [z, sw, sh, yo] = sections[si];
    for (let pi = 0; pi < cols; pi++) {
      const [y, hw] = profile[pi];
      pos.push(hw * sw, y * sh + yo, z);
    }
  }
  // mirror to the other side by building both halves
  const half = pos.length / 3;
  for (let i = 0; i < half; i++) pos.push(-pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);

  const quad = (a, b, c, d) => { idx.push(a, b, c, a, c, d); };
  for (let si = 0; si < rows - 1; si++) {
    for (let pi = 0; pi < cols - 1; pi++) {
      const a = si * cols + pi, b = (si + 1) * cols + pi;
      quad(a, b, b + 1, a + 1);
      const A = half + a, B = half + b;
      quad(A, A + 1, B + 1, B);
    }
    // close the top and bottom seams between the two halves
    const t0 = si * cols + cols - 1, t1 = (si + 1) * cols + cols - 1;
    quad(t0, t1, half + t1, half + t0);
    const b0 = si * cols, b1 = (si + 1) * cols;
    quad(half + b0, half + b1, b1, b0);
  }
  // caps
  for (const si of [0, rows - 1]) {
    for (let pi = 0; pi < cols - 1; pi++) {
      const a = si * cols + pi;
      if (si === 0) quad(a, a + 1, half + a + 1, half + a);
      else quad(half + a, half + a + 1, a + 1, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wheelGeo(r, width, seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, width, seg);
  g.rotateZ(Math.PI / 2);
  return g;
}

function carGeometry() {
  const parts = [];
  const push = (g, x, y, z) => { g.translate(x, y, z); parts.push(g); };

  // saloon: low nose, raked screen, tapered tail
  const profile = [[0.00, 0.86], [0.30, 0.94], [0.62, 0.90], [0.80, 0.62], [0.92, 0.30]];
  const sections = [
    [-2.20, 0.62, 0.42, 0.34],   // nose
    [-1.70, 0.92, 0.62, 0.26],
    [-0.95, 1.00, 0.80, 0.20],   // windscreen base
    [-0.10, 1.00, 1.00, 0.18],   // roof front
    [ 0.85, 0.99, 1.00, 0.18],   // roof rear
    [ 1.60, 0.95, 0.74, 0.22],
    [ 2.15, 0.70, 0.48, 0.30],   // tail
  ];
  push(sweep(profile, sections), 0, 0.18, 0);

  for (const [x, z] of [[-0.82, 1.42], [0.82, 1.42], [-0.82, -1.42], [0.82, -1.42]]) {
    push(wheelGeo(0.34, 0.22), x, 0.34, z);
  }
  return mergeGeoms(parts);
}

function vanGeometry() {
  const parts = [];
  const push = (g, x, y, z) => { g.translate(x, y, z); parts.push(g); };
  const profile = [[0.00, 0.95], [0.45, 1.02], [1.10, 1.00], [1.45, 0.86], [1.58, 0.52]];
  const sections = [
    [-2.60, 0.70, 0.46, 0.30],
    [-2.05, 0.95, 0.70, 0.22],
    [-1.45, 1.00, 0.98, 0.18],
    [ 0.30, 1.00, 1.00, 0.18],
    [ 2.10, 1.00, 1.00, 0.18],
    [ 2.55, 0.94, 0.94, 0.20],
  ];
  push(sweep(profile, sections), 0, 0.20, 0);
  for (const [x, z] of [[-0.92, 1.72], [0.92, 1.72], [-0.92, -1.76], [0.92, -1.76]]) {
    push(wheelGeo(0.40, 0.26), x, 0.40, z);
  }
  return mergeGeoms(parts);
}

function copGeometry() {
  const parts = [];
  const push = (g, x, y, z) => { g.translate(x, y, z); parts.push(g); };
  // an estate-shaped patrol car with a light bar
  const profile = [[0.00, 0.88], [0.32, 0.96], [0.68, 0.94], [0.88, 0.66], [0.98, 0.32]];
  const sections = [
    [-2.35, 0.64, 0.44, 0.34],
    [-1.80, 0.94, 0.64, 0.26],
    [-1.00, 1.00, 0.84, 0.20],
    [-0.05, 1.00, 1.02, 0.18],
    [ 1.20, 1.00, 1.02, 0.18],
    [ 1.95, 0.97, 0.86, 0.20],
    [ 2.35, 0.74, 0.54, 0.28],
  ];
  push(sweep(profile, sections), 0, 0.18, 0);
  for (const [x, z] of [[-0.84, 1.50], [0.84, 1.50], [-0.84, -1.50], [0.84, -1.50]]) {
    push(wheelGeo(0.35, 0.23), x, 0.35, z);
  }
  // light bar
  const bar = new THREE.BoxGeometry(1.15, 0.16, 0.30);
  push(bar, 0, 1.36, -0.15);
  return mergeGeoms(parts);
}

/* ---------------- pedestrians ----------------
   A capsule-and-tapered-limb figure. Not a mannequin, but at street
   distance it reads as a person walking rather than a stack of bricks. */
function pedGeometry() {
  const parts = [];
  const push = (g, x, y, z, rx = 0, rz = 0) => {
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g);
  };
  // hips → chest, tapered
  const torso = new THREE.CylinderGeometry(0.19, 0.15, 0.56, 8);
  push(torso, 0, 1.06, 0);
  // shoulders
  const sh = new THREE.SphereGeometry(0.19, 8, 6);
  sh.scale(1.35, 0.7, 0.9);
  push(sh, 0, 1.31, 0);
  // neck + head
  push(new THREE.CylinderGeometry(0.055, 0.06, 0.09, 6), 0, 1.40, 0);
  const head = new THREE.SphereGeometry(0.115, 10, 8);
  head.scale(0.92, 1.12, 1.0);
  push(head, 0, 1.53, 0.005);
  // arms
  for (const sx of [-1, 1]) {
    const up = new THREE.CylinderGeometry(0.055, 0.048, 0.30, 6);
    push(up, sx * 0.23, 1.18, 0, 0, sx * 0.10);
    const lo = new THREE.CylinderGeometry(0.048, 0.042, 0.28, 6);
    push(lo, sx * 0.27, 0.90, 0.02);
    const hand = new THREE.SphereGeometry(0.052, 6, 5);
    push(hand, sx * 0.285, 0.75, 0.03);
  }
  // legs
  for (const sx of [-1, 1]) {
    const th = new THREE.CylinderGeometry(0.082, 0.068, 0.38, 7);
    push(th, sx * 0.095, 0.60, 0);
    const sk = new THREE.CylinderGeometry(0.062, 0.050, 0.36, 7);
    push(sk, sx * 0.095, 0.23, 0.01);
    const foot = new THREE.BoxGeometry(0.11, 0.075, 0.25);
    push(foot, sx * 0.095, 0.038, 0.045);
  }
  return mergeGeoms(parts);
}

/** minimal BufferGeometry merge — avoids pulling in an addon */
function mergeGeoms(list) {
  let vCount = 0, iCount = 0;
  for (const g of list) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  // 16-bit indices silently wrap past 65535 vertices, which is a very
  // confusing way for a model to explode; pick the width that fits
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    pos.set(p, vo * 3); nor.set(n, vo * 3);
    const gi = g.index ? g.index.array : null;
    const c = g.attributes.position.count;
    if (gi) for (let i = 0; i < gi.length; i++) idx[io++] = gi[i] + vo;
    else for (let i = 0; i < c; i++) idx[io++] = i + vo;
    vo += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* ============================================================ */
export class Traffic {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cars = [];
    this.peds = [];
    this.enabled = true;

    // roads wide enough to carry traffic, with a usable lane offset
    this.driveRoads = world.roadNet.roads.filter(
      (r) => r.type !== 'trail' && r.type !== 'pad' && r.w >= 8 && r.pts.length > 12);
    this.walkRoads = world.roadNet.roads.filter(
      (r) => (r.type === 'street' || r.type === 'lane' || r.type === 'boardwalk') && r.pts.length > 10);

    this._buildMeshes();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._up = new THREE.Vector3(0, 1, 0);
  }

  _buildMeshes() {
    // car paint wants a little gloss and something to reflect; people do not
    const paint = () => new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.15, envMapIntensity: 1.0 });
    const skin = () => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0, envMapIntensity: 0.4 });

    this.carMesh = new THREE.InstancedMesh(carGeometry(), paint(), CAR_BUDGET);
    this.vanMesh = new THREE.InstancedMesh(vanGeometry(), paint(), CAR_BUDGET);
    this.pedMesh = new THREE.InstancedMesh(pedGeometry(), skin(), PED_BUDGET);

    for (const m of [this.carMesh, this.vanMesh, this.pedMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.count = 0;
      m.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(m.count === 0 ? (m === this.pedMesh ? PED_BUDGET : CAR_BUDGET) * 3 : 0), 3);
      this.scene.add(m);
    }
    // police get their own mesh so they can be liveried and lit
    this.copMesh = new THREE.InstancedMesh(copGeometry(), paint(), 8);
    this.copMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.copMesh.castShadow = true;
    this.copMesh.frustumCulled = false;
    this.copMesh.count = 0;
    this.copMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(8 * 3), 3);
    this.scene.add(this.copMesh);
  }

  /* ---------------- spawning ---------------- */
  _pickRoadPoint(roads, px, pz) {
    for (let tries = 0; tries < 24; tries++) {
      const r = roads[(Math.random() * roads.length) | 0];
      const i = 2 + ((Math.random() * (r.pts.length - 4)) | 0);
      const d = Math.hypot(r.pts[i][0] - px, r.pts[i][1] - pz);
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
      return { road: r, i };
    }
    return null;
  }

  _spawnCar(px, pz) {
    const pick = this._pickRoadPoint(this.driveRoads, px, pz);
    if (!pick) return null;
    const { road, i } = pick;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = road.half * 0.48 * dir;      // drive on the correct side
    const van = Math.random() < 0.26;
    const c = {
      road, i, dir, lane, van,
      t: 0,
      speed: (van ? 7 : 10) + Math.random() * (van ? 4 : 9),
      want: 0,
      color: CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0],
      x: 0, z: 0, y: 0, yaw: 0,
      brake: 0,
      honk: 0,
      cop: false,
    };
    // place it on the road now — otherwise it sits at the world origin for
    // a frame and the despawn check culls it the instant it is created
    this._advance(c, 0);
    return c;
  }

  _spawnPed(px, pz) {
    const pick = this._pickRoadPoint(this.walkRoads, px, pz);
    if (!pick) return null;
    const { road, i } = pick;
    const p = {
      road, i,
      dir: Math.random() < 0.5 ? 1 : -1,
      lane: (road.half + 2.2 + Math.random() * 1.4) * (Math.random() < 0.5 ? 1 : -1),
      speed: 1.1 + Math.random() * 0.7,
      color: SHIRT_COLORS[(Math.random() * SHIRT_COLORS.length) | 0],
      x: 0, z: 0, y: 0, yaw: 0, bob: Math.random() * 6.28,
      flee: 0,
    };
    this._advance(p, 0);
    return p;
  }

  /** advance an agent along its road, returning false when it runs out */
  _advance(a, dt) {
    const r = a.road;
    const step = a.speed * dt * a.dir;
    let moved = 0;
    while (moved < Math.abs(step)) {
      const ni = a.i + (a.dir > 0 ? 1 : -1);
      if (ni < 1 || ni > r.pts.length - 2) {
        if (r.closed) a.i = a.dir > 0 ? 1 : r.pts.length - 2;
        else a.dir *= -1;                     // turn round at a dead end
        continue;
      }
      const seg = Math.hypot(r.pts[ni][0] - r.pts[a.i][0], r.pts[ni][1] - r.pts[a.i][1]) || 1;
      const remain = Math.abs(step) - moved;
      if (remain < seg * (1 - a.t)) { a.t += remain / seg; moved = Math.abs(step); }
      else { moved += seg * (1 - a.t); a.t = 0; a.i = ni; }
    }
    const i = clamp(a.i, 0, r.pts.length - 2);
    const p0 = r.pts[i], p1 = r.pts[i + 1];
    const tx = p1[0] - p0[0], tz = p1[1] - p0[1];
    const len = Math.hypot(tx, tz) || 1;
    const ux = tx / len, uz = tz / len;
    a.x = lerp(p0[0], p1[0], a.t) + (-uz) * a.lane;
    a.z = lerp(p0[1], p1[1], a.t) + (ux) * a.lane;
    a.yaw = Math.atan2(ux * a.dir, uz * a.dir);
    a.y = this.world.groundAt(a.x, a.z);
    return true;
  }

  /* ---------------- per frame ---------------- */
  update(dt, player, police) {
    if (!this.enabled) return;
    const px = player.pos.x, pz = player.pos.z;

    // top up / recycle
    // top up a few per frame; a failed pick just means try again next frame
    for (let n = 0; n < 4 && this.cars.length < CAR_BUDGET; n++) {
      const c = this._spawnCar(px, pz);
      if (!c) break;
      this.cars.push(c);
    }
    for (let n = 0; n < 4 && this.peds.length < PED_BUDGET; n++) {
      const p = this._spawnPed(px, pz);
      if (!p) break;
      this.peds.push(p);
    }

    const pspeed = Math.abs(player.speed);
    this.nearMiss = null;

    /* ---- cars ---- */
    let ci = 0, vi = 0;
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const c = this.cars[k];
      if (Math.hypot(c.x - px, c.z - pz) > DESPAWN) { this.cars.splice(k, 1); continue; }

      // slow for the car in front
      let block = 0;
      for (const o of this.cars) {
        if (o === c) continue;
        const dx = o.x - c.x, dz = o.z - c.z;
        const fwd = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw);
        if (fwd > 0.5 && fwd < 11 && Math.abs(dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw)) < 2.2) {
          block = Math.max(block, 1 - fwd / 11);
        }
      }
      // and for the maniac on the bike
      const dpx = px - c.x, dpz = pz - c.z;
      const pf = dpx * Math.sin(c.yaw) + dpz * Math.cos(c.yaw);
      const pl = dpx * Math.cos(c.yaw) - dpz * Math.sin(c.yaw);
      const pd = Math.hypot(dpx, dpz);
      if (pf > 0 && pf < 14 && Math.abs(pl) < 2.6) { block = Math.max(block, 1 - pf / 14); c.honk = Math.max(c.honk, 1); }

      c.brake = damp(c.brake, block, 6, dt);
      const cruise = (c.van ? 9 : 14) * (1 - c.brake * 0.92);
      c.speed = damp(c.speed, Math.max(0, cruise), 2.2, dt);
      c.honk = Math.max(0, c.honk - dt);
      this._advance(c, dt);

      // near miss: fast, close, and not a collision
      if (pd < 3.4 && pd > 1.25 && pspeed > 9) {
        if (!this.nearMiss || pd < this.nearMiss.d) this.nearMiss = { d: pd, speed: pspeed, x: c.x, z: c.z };
      }

      const mesh = c.van ? this.vanMesh : this.carMesh;
      const n = c.van ? vi++ : ci++;
      this._writeInstance(mesh, n, c.x, c.y, c.z, c.yaw, c.color);
    }
    this.carMesh.count = ci;
    this.vanMesh.count = vi;
    this.carMesh.instanceMatrix.needsUpdate = true;
    this.vanMesh.instanceMatrix.needsUpdate = true;
    if (this.carMesh.instanceColor) this.carMesh.instanceColor.needsUpdate = true;
    if (this.vanMesh.instanceColor) this.vanMesh.instanceColor.needsUpdate = true;

    /* ---- pedestrians ---- */
    let pi = 0;
    for (let k = this.peds.length - 1; k >= 0; k--) {
      const p = this.peds[k];
      if (Math.hypot(p.x - px, p.z - pz) > DESPAWN) { this.peds.splice(k, 1); continue; }
      const d = Math.hypot(p.x - px, p.z - pz);
      // scatter when a bike comes at them quickly
      if (d < 9 && pspeed > 7) {
        p.flee = 1.6;
        p.lane += Math.sign(p.lane || 1) * dt * 5.5;
        p.lane = clamp(p.lane, -14, 14);
      }
      p.flee = Math.max(0, p.flee - dt);
      p.speed = damp(p.speed, p.flee > 0 ? 4.2 : 1.35, 5, dt);
      p.bob += dt * p.speed * 4.5;
      this._advance(p, dt);
      this._writeInstance(this.pedMesh, pi++, p.x, p.y + Math.abs(Math.sin(p.bob)) * 0.06, p.z, p.yaw, p.color);
    }
    this.pedMesh.count = pi;
    this.pedMesh.instanceMatrix.needsUpdate = true;
    if (this.pedMesh.instanceColor) this.pedMesh.instanceColor.needsUpdate = true;

    /* ---- police ---- */
    if (police) this._drawCops(police, dt);
  }

  _drawCops(police, dt) {
    let n = 0;
    // a white patrol car that pulses blue/red, rather than a solid slab of
    // colour — the body stays readable and only the tint shifts
    const flash = (performance.now() * 0.005) % 1;
    const tint = flash < 0.5 ? 0x7f9bdd : 0xdd8f9b;
    for (const c of police.units) {
      this._writeInstance(this.copMesh, n++, c.x, c.y, c.z, c.yaw, tint);
      if (n >= 8) break;
    }
    this.copMesh.count = n;
    this.copMesh.instanceMatrix.needsUpdate = true;
    if (this.copMesh.instanceColor) this.copMesh.instanceColor.needsUpdate = true;
  }

  _writeInstance(mesh, n, x, y, z, yaw, color) {
    this._q.setFromAxisAngle(this._up, yaw);
    this._v.set(x, y, z);
    this._m.compose(this._v, this._q, this._s);
    mesh.setMatrixAt(n, this._m);
    if (mesh.instanceColor) {
      const c = mesh.instanceColor.array;
      c[n * 3] = ((color >> 16) & 255) / 255;
      c[n * 3 + 1] = ((color >> 8) & 255) / 255;
      c[n * 3 + 2] = (color & 255) / 255;
    }
  }

  /** the closest vehicle body the bike could hit, or null.
   *  Police units are solid too — riding straight through a patrol car
   *  that is chasing you is not a chase. */
  hitTest(x, z, r, police) {
    const box = (o, hx, hz) => {
      const dx = x - o.x, dz = z - o.z;
      const lx = dx * Math.cos(-o.yaw) - dz * Math.sin(-o.yaw);
      const lz = dx * Math.sin(-o.yaw) + dz * Math.cos(-o.yaw);
      return Math.abs(lx) < hx + r && Math.abs(lz) < hz + r;
    };
    for (const c of this.cars) {
      if (box(c, 1.0, c.van ? 2.7 : 2.25)) return c;
    }
    if (police) {
      for (const u of police.units) {
        if (box(u, 1.0, 2.4)) return Object.assign(u, { isCop: true });
      }
    }
    return null;
  }

  /** minimap blips */
  blips(px, pz, range) {
    const out = [];
    for (const c of this.cars) {
      if (Math.abs(c.x - px) < range && Math.abs(c.z - pz) < range) out.push({ x: c.x, z: c.z, c: '#6b7688' });
    }
    return out;
  }

  clear() {
    this.cars.length = 0;
    this.peds.length = 0;
    this.carMesh.count = this.vanMesh.count = this.pedMesh.count = this.copMesh.count = 0;
  }
}
