/* ============================================================
   world.js — builds and owns the whole map
   ============================================================ */
import * as THREE from 'three';
import { WORLD, SURF, SURF_PROPS, POIS, SPAWNS, LANDMARKS, DISTRICTS } from './layout.js';
import { Heightfield, RoadNet, HF_N, HF_CN } from './heightfield.js';
import { buildTerrain, buildWater } from './terrain.js';
import { buildRoads, buildStripDecor } from './roads.js';
import { buildProps } from './props.js';
import { FeatureSet, Kicker, Table, Quarter, Hump, Plinth, Bowl, FEATURE_MAT } from './features.js';
import { clamp, makeRng } from '../core/util.js';

const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    this.colliders = [];
    this.colGrid = new Map();
    this.colCell = 24;
    this.pois = POIS.map((p) => ({ ...p }));
    this.landmarks = LANDMARKS;
    this.spawns = SPAWNS;
    this.jumpRamps = [];      // for quest/trick detection
  }

  async build(onProgress = () => {}) {
    onProgress(0.02, 'laying out Volta Bay…');
    this.roadNet = new RoadNet();
    await sleep();

    onProgress(0.08, 'sculpting terrain…');
    this.hf = new Heightfield(this.roadNet);

    for (let r = 0; r < HF_CN; r += 40) {
      this.hf.bakeCoarseRows(r, Math.min(HF_CN, r + 40));
      onProgress(0.08 + 0.16 * (r / HF_CN), 'sculpting terrain…');
      await sleep();
    }
    for (let r = 0; r < HF_N; r += 200) {
      this.hf.upsampleRows(r, Math.min(HF_N, r + 200));
      onProgress(0.24 + 0.10 * (r / HF_N), 'smoothing hills…');
      await sleep();
    }

    onProgress(0.35, 'grading roads…');
    {
      const acc = this.hf.makeRoadAcc();
      const nRoads = this.roadNet.roads.length;
      for (let r = 0; r < nRoads; r += 6) {
        this.hf.rasterizeRoads(r, r + 6, acc);
        onProgress(0.35 + 0.14 * (r / nRoads), 'grading roads…');
        await sleep();
      }
      this.hf.applyRoads(acc, 0, HF_N * HF_N);
    }

    onProgress(0.54, 'pouring concrete…');
    this._buildFeatures();
    this.features.index();
    await sleep();

    onProgress(0.60, 'building terrain mesh…');
    this.terrain = buildTerrain(this.hf);
    this.root.add(this.terrain);
    await sleep();

    onProgress(0.72, 'painting roads…');
    this.roads = buildRoads(this.roadNet);
    this.root.add(this.roads);
    const strip = buildStripDecor(this.roadNet);
    if (strip) this.root.add(strip);
    await sleep();

    onProgress(0.78, 'welding ramps…');
    const fMesh = this.features.buildMesh((x, z) => this.groundAt(x, z));
    this.root.add(fMesh);
    await sleep();

    onProgress(0.84, 'raising the skyline…');
    const { group, colliders } = buildProps(this);
    this.root.add(group);
    this.colliders = colliders;
    this._indexColliders();
    await sleep();

    onProgress(0.94, 'switching on the lights…');
    this.root.add(buildWater());
    this._buildPoiMarkers();
    this._buildMinimapTexture();
    await sleep();

    onProgress(1, 'ready');
    return this;
  }

  /* ---------------- ground ---------------- */
  groundAt(x, z) {
    return this.features.apply(x, z, this.hf.height(x, z));
  }

  groundNormal(x, z, out) {
    const e = 0.9;
    const hl = this.groundAt(x - e, z), hr = this.groundAt(x + e, z);
    const hd = this.groundAt(x, z - e), hu = this.groundAt(x, z + e);
    const nx = hl - hr, ny = 2 * e, nz = hd - hu;
    const len = Math.hypot(nx, ny, nz) || 1;
    out.set(nx / len, ny / len, nz / len);
    return out;
  }

  surfaceAt(x, z) {
    const ids = this.features.near(x, z);
    if (ids) {
      for (const i of ids) {
        const f = this.features.list[i];
        if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
        if (f.weight(x, z) > 0.55) return f.surf ?? SURF.CONCRETE;
      }
    }
    return this.hf.surface(x, z);
  }

  surfaceProps(x, z) { return SURF_PROPS[this.surfaceAt(x, z)] || SURF_PROPS[SURF.GRASS]; }

  inWater(x, z, y) {
    return z > 900 && y < WORLD.seaLevel + 0.5;
  }

  /* ---------------- features ---------------- */
  _buildFeatures() {
    const F = new FeatureSet();
    this.features = F;
    const g = (x, z) => this.hf.height(x, z);
    const rng = makeRng('features');

    /* ---- AMP BOWL skatepark (-155, 430) ---- */
    F.add(new Bowl({
      x: -155, z: 430, bowlR: 19, rimR: 31, slope: 12, lip: 3.8, depth: 3.2,
      color: FEATURE_MAT.concrete, surf: SURF.CONCRETE, priority: 1,
    }));
    // quarter pipes on the deck
    for (const [ang, h] of [[0.5, 2.6], [2.2, 3.1], [4.0, 2.4]]) {
      const r = 26;
      F.add(new Quarter({
        x: -155 + Math.cos(ang) * r, z: 430 + Math.sin(ang) * r,
        yaw: ang, len: 8, wid: 13, h, priority: 2,
        color: FEATURE_MAT.concreteDark, surf: SURF.CONCRETE, margin: 1.2,
      }));
    }
    // a couple of boxes/tables on the flat deck
    F.add(new Table({ x: -178, z: 452, yaw: 0.7, len: 11, wid: 5, h: 1.1, up: 0.28, down: 0.28, priority: 2, color: FEATURE_MAT.concreteDark, surf: SURF.CONCRETE }));
    F.add(new Kicker({ x: -132, z: 408, yaw: -2.1, len: 7, wid: 4.6, h: 1.5, priority: 2, color: FEATURE_MAT.paint, surf: SURF.CONCRETE }));

    /* ---- park dirt jump line ---- */
    for (let i = 0; i < 5; i++) {
      F.add(new Table({
        x: -60 + i * 26, z: 300 + i * 14, yaw: 0.49, len: 13 + i, wid: 7, h: 1.4 + i * 0.35,
        up: 0.3, down: 0.32, color: FEATURE_MAT.dirt, surf: SURF.DIRT, priority: 1,
      }));
    }
    // a big dirt booter at the end
    this._ramp(F, { x: 90, z: 386, yaw: 0.49, len: 14, wid: 8, h: 3.4, color: FEATURE_MAT.dirt, surf: SURF.DIRT, tag: 'Park Booter' });

    /* ---- park rollers along trail-2 ---- */
    F.add(new Hump({ x: 10, z: 60, yaw: 0.2, len: 34, wid: 6, h: 0.9, count: 4, color: FEATURE_MAT.dirt, surf: SURF.DIRT }));

    /* ---- industrial yard course ---- */
    F.add(new Plinth({ x: -660, z: 40, len: 44, wid: 26, h: 1.25, slope: 5, color: FEATURE_MAT.concrete, surf: SURF.CONCRETE }));
    F.add(new Plinth({ x: -560, z: -20, len: 26, wid: 18, h: 2.1, slope: 6, color: FEATURE_MAT.concreteDark, surf: SURF.CONCRETE }));
    this._ramp(F, { x: -600, z: 110, yaw: 1.2, len: 12, wid: 6.5, h: 2.8, color: FEATURE_MAT.wood, surf: SURF.WOOD, tag: 'Dock Launch' });
    this._ramp(F, { x: -700, z: -40, yaw: -0.6, len: 10, wid: 6, h: 2.2, color: FEATURE_MAT.metal, surf: SURF.CONCRETE, tag: 'Yard Kicker' });
    F.add(new Hump({ x: -740, z: 300, yaw: 1.5, len: 26, wid: 9, h: 0.7, count: 3, color: FEATURE_MAT.concrete, surf: SURF.CONCRETE }));
    for (let i = 0; i < 4; i++) {
      F.add(new Quarter({ x: -640 + i * 18, z: 160, yaw: Math.PI / 2, len: 7, wid: 11, h: 2.0 + i * 0.3, color: FEATURE_MAT.concreteDark, surf: SURF.CONCRETE }));
    }

    /* ---- the Mile: launch ramp at each end ---- */
    this._ramp(F, { x: 902, z: -1010, yaw: 0, len: 15, wid: 13, h: 5.0, curve: 1.45, color: FEATURE_MAT.metal, surf: SURF.CONCRETE, tag: 'Mile Launch' });
    this._ramp(F, { x: -902, z: -1010, yaw: Math.PI, len: 15, wid: 13, h: 5.0, curve: 1.45, color: FEATURE_MAT.metal, surf: SURF.CONCRETE, tag: 'Mile Launch West' });

    /* ---- downtown street spots ---- */
    F.add(new Plinth({ x: 0, z: -420, len: 46, wid: 38, h: 0.9, slope: 4, color: FEATURE_MAT.concrete, surf: SURF.CONCRETE }));
    this._ramp(F, { x: 96, z: -252, yaw: -1.2, len: 8, wid: 5, h: 1.6, color: FEATURE_MAT.concreteDark, surf: SURF.CONCRETE, tag: 'Plaza Kicker' });
    this._ramp(F, { x: -250, z: -560, yaw: 2.4, len: 9, wid: 5.5, h: 1.9, color: FEATURE_MAT.paint, surf: SURF.CONCRETE, tag: 'Sixth St Gap' });
    F.add(new Hump({ x: 0, z: -190, yaw: 0, len: 20, wid: 12, h: 0.32, count: 2, color: 0x4a4e56, surf: SURF.ASPHALT }));

    /* ---- ridge jump ---- */
    this._ramp(F, { x: 900, z: -118, yaw: -2.5, len: 13, wid: 7, h: 3.0, color: FEATURE_MAT.dirt, surf: SURF.DIRT, tag: 'Ridge Booter' });
    this._ramp(F, { x: 986, z: -498, yaw: 1.65, len: 12, wid: 7, h: 2.6, color: FEATURE_MAT.dirt, surf: SURF.DIRT, tag: 'Lookout Drop' });

    /* ---- beach ---- */
    for (let i = 0; i < 6; i++) {
      const x = -300 + i * 130 + rng() * 40;
      F.add(new Hump({ x, z: 880, yaw: 0, len: 18, wid: 10, h: 0.8, count: 1, color: 0xc8b88e, surf: SURF.SAND }));
    }
    this._ramp(F, { x: 430, z: 890, yaw: -0.2, len: 11, wid: 6, h: 2.4, color: FEATURE_MAT.wood, surf: SURF.WOOD, tag: 'Beach Booter' });
  }

  _ramp(F, o) {
    const k = new Kicker({ ...o, priority: o.priority ?? 2 });
    F.add(k);
    if (o.tag) {
      const lipX = o.x + Math.cos(o.yaw) * (o.len / 2);
      const lipZ = o.z + Math.sin(o.yaw) * (o.len / 2);
      this.jumpRamps.push({ name: o.tag, x: lipX, z: lipZ, h: o.h, yaw: o.yaw });
    }
    return k;
  }

  /* ---------------- colliders ---------------- */
  _indexColliders() {
    this.colGrid.clear();
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      const reach = c.t === 'cyl' ? c.r : Math.hypot(c.hx, c.hz);
      const c0x = Math.floor((c.x - reach) / this.colCell), c1x = Math.floor((c.x + reach) / this.colCell);
      const c0z = Math.floor((c.z - reach) / this.colCell), c1z = Math.floor((c.z + reach) / this.colCell);
      for (let cx = c0x; cx <= c1x; cx++)
        for (let cz = c0z; cz <= c1z; cz++) {
          const k = cx * 10007 + cz;
          let a = this.colGrid.get(k); if (!a) { a = []; this.colGrid.set(k, a); }
          a.push(i);
        }
    }
  }

  /** push a circle (x,z,r) out of solid props. returns {hit, nx, nz, depth} */
  collide(x, z, r, y) {
    const cx = Math.floor(x / this.colCell), cz = Math.floor(z / this.colCell);
    let hit = false, px = 0, pz = 0, best = 0, light = false;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const arr = this.colGrid.get((cx + ox) * 10007 + (cz + oz));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const c = this.colliders[arr[k]];
          if (y > c.top - 0.25) continue;        // we're on top of it
          let nx, nz, depth;
          if (c.t === 'cyl') {
            const dx = x - c.x, dz = z - c.z;
            const d = Math.hypot(dx, dz);
            depth = c.r + r - d;
            if (depth <= 0) continue;
            const inv = d > 1e-4 ? 1 / d : 0;
            nx = dx * inv || 1; nz = dz * inv || 0;
          } else {
            const cs = Math.cos(-c.yaw), sn = Math.sin(-c.yaw);
            const dx = x - c.x, dz = z - c.z;
            const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
            const qx = Math.abs(lx) - c.hx, qz = Math.abs(lz) - c.hz;
            if (qx > r || qz > r) continue;
            if (qx < 0 && qz < 0) {
              // deep inside: push along the shallower axis
              if (qx > qz) { depth = -qx + r; nx = Math.sign(lx) || 1; nz = 0; }
              else { depth = -qz + r; nx = 0; nz = Math.sign(lz) || 1; }
            } else {
              const ex = Math.max(qx, 0), ez = Math.max(qz, 0);
              const d = Math.hypot(ex, ez);
              depth = r - d;
              if (depth <= 0) continue;
              const inv = d > 1e-4 ? 1 / d : 0;
              nx = (ex * Math.sign(lx) || 0) * inv; nz = (ez * Math.sign(lz) || 0) * inv;
              if (!nx && !nz) { nx = Math.sign(lx) || 1; nz = 0; }
            }
            // back to world space
            const cs2 = Math.cos(c.yaw), sn2 = Math.sin(c.yaw);
            const wx = nx * cs2 - nz * sn2, wz = nx * sn2 + nz * cs2;
            nx = wx; nz = wz;
          }
          if (depth > best) { best = depth; px = nx; pz = nz; hit = true; light = !!c.light; }
        }
      }
    }
    return hit ? { hit, nx: px, nz: pz, depth: best, light } : null;
  }

  /* ---------------- POI markers ---------------- */
  _buildPoiMarkers() {
    const grp = new THREE.Group();
    grp.name = 'pois';
    this.poiGroup = grp;
    this.root.add(grp);

    for (const p of this.pois) {
      p.y = this.groundAt(p.x, p.z);
      const g = new THREE.Group();
      g.position.set(p.x, p.y, p.z);

      const ringGeo = new THREE.RingGeometry(p.r - 0.55, p.r, 48);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.16;
      g.add(ring);

      const pillarGeo = new THREE.CylinderGeometry(0.55, 0.9, 9, 10, 1, true);
      const pillarMat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.y = 4.5;
      g.add(pillar);

      const spr = makeLabel(p.name, p.color);
      spr.position.y = 10.4;
      g.add(spr);

      p.obj = g; p.ring = ring; p.pillar = pillar; p.label = spr;
      grp.add(g);
    }
  }

  updatePois(t, playerPos) {
    for (const p of this.pois) {
      if (!p.obj) continue;
      p.ring.rotation.y = t * 0.4;
      const d = Math.hypot(playerPos.x - p.x, playerPos.z - p.z);
      const vis = d < 260;
      p.obj.visible = vis;
      if (!vis) continue;
      const near = clamp(1 - (d - p.r) / 40, 0, 1);
      p.ring.material.opacity = 0.35 + near * 0.45 + Math.sin(t * 2.4) * 0.06;
      p.pillar.material.opacity = 0.09 + near * 0.16;
      p.label.material.opacity = clamp(1 - (d - 40) / 150, 0.15, 1);
      p.label.position.y = 10.4 + Math.sin(t * 1.6) * 0.3;
    }
  }

  poiNear(x, z) {
    for (const p of this.pois) {
      if (Math.hypot(x - p.x, z - p.z) < p.r) return p;
    }
    return null;
  }

  /* ---------------- minimap ---------------- */
  _buildMinimapTexture() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const toPx = (v) => ((v + WORLD.half) / WORLD.size) * S;

    g.fillStyle = '#10181f'; g.fillRect(0, 0, S, S);

    // land mass tinted by surface
    const img = g.createImageData(S, S);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = (i / S) * WORLD.size - WORLD.half;
        const z = (j / S) * WORLD.size - WORLD.half;
        const s = this.hf.surface(x, z);
        const h = this.hf.height(x, z);
        let r, gg, b;
        if (h < WORLD.seaLevel) { r = 30; gg = 62; b = 86; }
        else if (s === SURF.SAND) { r = 140; gg = 126; b = 90; }
        else if (s === SURF.CONCRETE) { r = 58; gg = 62; b = 70; }
        else if (s === SURF.ASPHALT) { r = 44; gg = 48; b = 56; }
        else if (s === SURF.DIRT) { r = 84; gg = 62; b = 40; }
        else { r = 38; gg = 58; b = 34; }
        const shade = clamp(0.62 + h / 170, 0.5, 1.4);
        const k = (j * S + i) * 4;
        img.data[k] = r * shade; img.data[k + 1] = gg * shade; img.data[k + 2] = b * shade; img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    // roads on top for crispness
    for (const r of this.roadNet.roads) {
      if (r.type === 'pad') continue;
      g.strokeStyle = r.type === 'highway' ? '#8b94a6' : r.type === 'trail' ? '#7d5f3e' : '#5c6576';
      g.lineWidth = Math.max(1, (r.w / WORLD.size) * S * 1.5);
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < r.pts.length; i++) {
        const px = toPx(r.pts[i][0]), pz = toPx(r.pts[i][1]);
        if (i === 0) g.moveTo(px, pz); else g.lineTo(px, pz);
      }
      g.stroke();
    }

    this.minimapCanvas = c;
    this.minimapToPx = toPx;
  }

  /** nearest spawn point, optionally away from a position */
  spawnPoint(i = 0) {
    const s = this.spawns[i % this.spawns.length];
    return { x: s.x, z: s.z, y: this.groundAt(s.x, s.z), yaw: s.yaw };
  }

  /** find a safe respawn near a position (on a road if possible) */
  safeSpot(x, z) {
    let best = null;
    for (let r = 0; r < 90; r += 6) {
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2 + r * 0.2;
        const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
        if (Math.abs(px) > WORLD.half - 40 || Math.abs(pz) > WORLD.half - 40) continue;
        const q = this.roadNet.query(px, pz);
        if (q && q.onRoad) {
          const y = this.groundAt(px, pz);
          if (!this.collide(px, pz, 1.2, y)) return { x: px, z: pz, y };
        }
        if (!best) {
          const y = this.groundAt(px, pz);
          if (y > 0.5 && !this.collide(px, pz, 1.2, y)) best = { x: px, z: pz, y };
        }
      }
    }
    return best || this.spawnPoint(0);
  }

  districtAt(x, z) {
    let best = null, bd = 1e9;
    for (const d of DISTRICTS) {
      const dx = (x - d.x) / d.rx, dz = (z - d.z) / d.rz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 1.05 && dist < bd) { bd = dist; best = d; }
    }
    return best;
  }
}

/* ---------------- label sprite ---------------- */
export function makeLabel(text, color = 0xffffff, scale = 1) {
  const pad = 22, fs = 44;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `800 ${fs}px Inter, system-ui, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  c.width = w; c.height = fs + pad * 2;
  const g2 = c.getContext('2d');
  g2.font = `800 ${fs}px Inter, system-ui, sans-serif`;
  g2.textBaseline = 'middle';
  g2.fillStyle = 'rgba(8,11,19,0.72)';
  roundRect(g2, 0, 0, c.width, c.height, 18); g2.fill();
  g2.strokeStyle = '#' + new THREE.Color(color).getHexString();
  g2.lineWidth = 3; roundRect(g2, 1.5, 1.5, c.width - 3, c.height - 3, 17); g2.stroke();
  g2.fillStyle = '#ffffff';
  g2.fillText(text, pad, c.height / 2 + 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const s = new THREE.Sprite(mat);
  const k = 0.019 * scale;
  s.scale.set(c.width * k, c.height * k, 1);
  s.renderOrder = 900;
  return s;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export { WORLD, SURF };
