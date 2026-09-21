/* ============================================================
   props.js — buildings, trees, street furniture, scenery
   Everything merges/instances down to a handful of draw calls.
   ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBuilder, hexRGB } from './meshbuilder.js';
import { WORLD, DISTRICTS, SURF } from './layout.js';
import { facadeTexture, facadeRoughness } from './textures.js';
import { makeRng, clamp, lerp } from '../core/util.js';

/* ---------------- shared small geometries ---------------- */

/** mergeGeometries() needs every part to agree on indexed-ness — the
 *  polyhedra (Icosahedron/Dodecahedron) are non-indexed while
 *  Cylinder/Box/Cone are indexed, so flatten everything first. */
function colorize(geo, hex) {
  if (geo.index) geo = geo.toNonIndexed();
  const [r, g, b] = hexRGB(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = r; arr[i * 3 + 1] = g; arr[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
}

function treeGeometry(kind) {
  const parts = [];
  if (kind === 'palm') {
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, 6.2, 6);
    trunk.translate(0, 3.1, 0);
    parts.push(colorize(trunk, 0x8a6c47));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const f = new THREE.ConeGeometry(0.5, 3.6, 4, 1, true);
      f.rotateZ(Math.PI / 2.35);
      f.rotateY(a);
      f.translate(Math.cos(a) * 1.35, 6.1, Math.sin(a) * 1.35);
      parts.push(colorize(f, i % 2 ? 0x3f7a35 : 0x498a3c));
    }
  } else if (kind === 'pine') {
    const trunk = new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6);
    trunk.translate(0, 1.2, 0);
    parts.push(colorize(trunk, 0x5a4530));
    for (let i = 0; i < 3; i++) {
      const c = new THREE.ConeGeometry(2.4 - i * 0.6, 3.2 - i * 0.4, 7);
      c.translate(0, 2.6 + i * 1.9, 0);
      parts.push(colorize(c, i === 2 ? 0x2f5a2c : 0x274d26));
    }
  } else {
    const trunk = new THREE.CylinderGeometry(0.22, 0.34, 3.0, 6);
    trunk.translate(0, 1.5, 0);
    parts.push(colorize(trunk, 0x6b5136));
    const a = new THREE.IcosahedronGeometry(2.1, 0); a.translate(0, 4.3, 0); parts.push(colorize(a, 0x3d6b30));
    const b = new THREE.IcosahedronGeometry(1.5, 0); b.translate(1.1, 3.5, 0.7); parts.push(colorize(b, 0x457a36));
    const c = new THREE.IcosahedronGeometry(1.3, 0); c.translate(-1.0, 3.8, -0.6); parts.push(colorize(c, 0x355f2a));
  }
  return mergeGeometries(parts, false);
}

function lampGeometry() {
  const parts = [];
  const pole = new THREE.CylinderGeometry(0.11, 0.15, 7.4, 6); pole.translate(0, 3.7, 0);
  parts.push(colorize(pole, 0x3c4550));
  const arm = new THREE.BoxGeometry(1.5, 0.14, 0.14); arm.translate(0.75, 7.3, 0);
  parts.push(colorize(arm, 0x3c4550));
  const head = new THREE.BoxGeometry(0.85, 0.22, 0.44); head.translate(1.4, 7.16, 0);
  parts.push(colorize(head, 0xd8dbe0));
  return mergeGeometries(parts, false);
}

function benchGeometry() {
  const parts = [];
  const seat = new THREE.BoxGeometry(1.9, 0.11, 0.55); seat.translate(0, 0.48, 0);
  parts.push(colorize(seat, 0x8a6743));
  const back = new THREE.BoxGeometry(1.9, 0.44, 0.1); back.translate(0, 0.76, -0.24);
  parts.push(colorize(back, 0x8a6743));
  for (const s of [-0.78, 0.78]) {
    const leg = new THREE.BoxGeometry(0.1, 0.48, 0.5); leg.translate(s, 0.24, 0);
    parts.push(colorize(leg, 0x40474f));
  }
  return mergeGeometries(parts, false);
}

function barrierGeometry() {
  const parts = [];
  const b = new THREE.BoxGeometry(2.2, 0.62, 0.34); b.translate(0, 0.31, 0);
  parts.push(colorize(b, 0xd8d3c4));
  const st = new THREE.BoxGeometry(2.2, 0.16, 0.36); st.translate(0, 0.52, 0);
  parts.push(colorize(st, 0xd0453f));
  return mergeGeometries(parts, false);
}

function coneGeometry() {
  const parts = [];
  const c = new THREE.ConeGeometry(0.28, 0.72, 8); c.translate(0, 0.36, 0);
  parts.push(colorize(c, 0xef6a21));
  const base = new THREE.BoxGeometry(0.62, 0.06, 0.62); base.translate(0, 0.03, 0);
  parts.push(colorize(base, 0x31363d));
  return mergeGeometries(parts, false);
}

function rockGeometry() {
  const g = new THREE.DodecahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * (0.7 + Math.random() * 0.6), p.getY(i) * (0.55 + Math.random() * 0.5), p.getZ(i) * (0.7 + Math.random() * 0.6));
  }
  g.computeVertexNormals();
  return colorize(g, 0x6c6a66);
}

/* ---------------- main builder ---------------- */
export function buildProps(world) {
  const rng = makeRng('volta-bay-props');
  const group = new THREE.Group();
  group.name = 'props';
  const colliders = [];

  const occ = [];  // simple rejection list {x,z,r}
  const free = (x, z, r) => {
    for (let i = 0; i < occ.length; i++) {
      const o = occ[i];
      if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2) return false;
    }
    return true;
  };
  const claim = (x, z, r) => occ.push({ x, z, r });

  const nearRoad = (x, z, pad = 2) => {
    const q = world.roadNet.nearest(x, z, 40);
    if (q && q.dist < q.road.half + pad) return true;
    // ramps, bowls and plinths are riding surfaces — keep them clear
    return world.features.coverage(x, z) > 0.06;
  };

  /* ================= BUILDINGS ================= */
  const bld = new MeshBuilder();

  /* One MeshBuilder per facade style: each style needs its own texture,
     and a texture per material means a mesh per material. Four extra draw
     calls buys windows on every building in the city. */
  const facadeBld = {
    'tower:0': new MeshBuilder(), 'tower:1': new MeshBuilder(),
    'tower:2': new MeshBuilder(), 'tower:3': new MeshBuilder(),
    'block:0': new MeshBuilder(), 'ware:0': new MeshBuilder(), 'house:0': new MeshBuilder(),
  };

  function building(x, z, w, d, h, style, yaw = 0) {
    const fStyle = style === 'hut' ? 'house' : style;
    // towers come in four glazing tints so downtown is not one navy monolith
    const fVar = fStyle === 'tower' ? Math.floor(rng() * 4) : 0;
    const fb = facadeBld[`${fStyle}:${fVar}`] || facadeBld['block:0'];
    const y0 = world.hf.height(x, z);
    const palettes = {
      tower:  [0xb9c4d2, 0xa8b6c6, 0xc8d0da, 0x94a3b5, 0xd2d8de, 0x8fa0b4],
      block:  [0xc4bbac, 0xd3cabb, 0xb0a596, 0xded6c6, 0xa89d8d],
      ware:   [0x9aa1a9, 0x8d949c, 0xa7aeb6],
      house:  [0xb0a191, 0xc2b3a1, 0x9d8f80, 0xa8b0a2, 0xc9bda8],
      hut:    [0xd8c6a6, 0xc9b28c, 0xe0d2b8],
    };
    const pal = palettes[style] || palettes.block;
    const base = hexRGB(pal[Math.floor(rng() * pal.length)]);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rot = (px, pz) => [x + px * c - pz * s, z + px * s + pz * c];

    // main mass, built as a rotated box
    const hw = w / 2, hd = d / 2;
    /* Corner order decides the winding of every face derived from it. This
       used to run the other way, which wound all four walls and the roof
       INWARD: with a double-sided material that merely looked odd, but a
       textured single-sided one shows you the back of the facade, so every
       building appeared to have its texture mirrored. */
    const corners = [rot(-hw, hd), rot(hw, hd), rot(hw, -hd), rot(-hw, -hd)];
    const top = y0 + h;
    /* Walls are UV'd in units of bays across and floors up, so the facade
       texture lands at a believable scale whatever size the building is.
       The vertex colour still tints it, which is what keeps every tower
       from looking like the same tower. */
    const floorH = style === 'house' || style === 'hut' ? 3.0 : style === 'ware' ? 4.6 : 3.6;
    const bayW = style === 'ware' ? 6.0 : 3.4;
    const floors = Math.max(1, Math.round(h / floorH));
    const tint = 0.80 + rng() * 0.34;
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const nx = -(b[1] - a[1]), nz = (b[0] - a[0]);
      const nl = Math.hypot(nx, nz) || 1;
      const side = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const bays = Math.max(1, Math.round(side / bayW));
      const shade = (0.80 + 0.20 * Math.abs(nx / nl)) * tint;
      const r0 = base[0] * shade, g0 = base[1] * shade, b0 = base[2] * shade;
      // a little ambient occlusion at street level, which is most of what
      // makes a building look planted rather than floating
      const ao = 0.55;
      const v0 = fb.vert(a[0], y0 - 1, a[1], nx / nl, 0, nz / nl, r0 * ao, g0 * ao, b0 * ao, 0, 0);
      const v1 = fb.vert(b[0], y0 - 1, b[1], nx / nl, 0, nz / nl, r0 * ao, g0 * ao, b0 * ao, bays, 0);
      const v2 = fb.vert(b[0], top, b[1], nx / nl, 0, nz / nl, r0 * 1.06, g0 * 1.06, b0 * 1.06, bays, floors);
      const v3 = fb.vert(a[0], top, a[1], nx / nl, 0, nz / nl, r0 * 1.06, g0 * 1.06, b0 * 1.06, 0, floors);
      fb.quad(v0, v1, v2, v3);
    }
    // roof
    const rc = style === 'tower' ? 0.34 : 0.4;
    const t0 = bld.vert(corners[0][0], top, corners[0][1], 0, 1, 0, base[0] * rc, base[1] * rc, base[2] * rc);
    const t1 = bld.vert(corners[1][0], top, corners[1][1], 0, 1, 0, base[0] * rc, base[1] * rc, base[2] * rc);
    const t2 = bld.vert(corners[2][0], top, corners[2][1], 0, 1, 0, base[0] * rc, base[1] * rc, base[2] * rc);
    const t3 = bld.vert(corners[3][0], top, corners[3][1], 0, 1, 0, base[0] * rc, base[1] * rc, base[2] * rc);
    bld.quad(t0, t1, t2, t3);

    // parapet, so a roof is not just a flat lid
    if (style === 'tower' || style === 'block') {
      const ph = 0.9;
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        const nx = -(b[1] - a[1]), nz = (b[0] - a[0]);
        const nl = Math.hypot(nx, nz) || 1;
        const cc2 = [base[0] * 0.5, base[1] * 0.5, base[2] * 0.5];
        const q0 = bld.vert(a[0], top, a[1], nx / nl, 0, nz / nl, cc2[0], cc2[1], cc2[2]);
        const q1 = bld.vert(b[0], top, b[1], nx / nl, 0, nz / nl, cc2[0], cc2[1], cc2[2]);
        const q2 = bld.vert(b[0], top + ph, b[1], nx / nl, 0, nz / nl, cc2[0] * 1.3, cc2[1] * 1.3, cc2[2] * 1.3);
        const q3 = bld.vert(a[0], top + ph, a[1], nx / nl, 0, nz / nl, cc2[0] * 1.3, cc2[1] * 1.3, cc2[2] * 1.3);
        bld.quad(q0, q1, q2, q3);
      }
    }

    // rooftop clutter
    if (style === 'tower' && rng() < 0.7) {
      bld.box(x + (rng() - 0.5) * w * 0.4, top + 1, z + (rng() - 0.5) * d * 0.4, 3, 2, 3, 0.28, 0.3, 0.33);
    }
    if (style === 'house') {
      // pitched roof cap
      const rh = 1.8 + rng() * 1.2;
      const p0 = rot(-hw - 0.3, 0), p1 = rot(hw + 0.3, 0);
      const cc = [0.42, 0.26, 0.22];
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        const useRidge = i % 2 === 0;
        const rA = useRidge ? p0 : p1;
        const v0 = bld.vert(a[0], top, a[1], 0, 0.7, 0, cc[0], cc[1], cc[2]);
        const v1 = bld.vert(b[0], top, b[1], 0, 0.7, 0, cc[0], cc[1], cc[2]);
        const v2 = bld.vert(rA[0], top + rh, rA[1], 0, 1, 0, cc[0] * 1.15, cc[1] * 1.15, cc[2] * 1.15);
        bld.tri(v0, v1, v2);
      }
    }

    colliders.push({ t: 'box', x, z, hx: hw + 0.2, hz: hd + 0.2, yaw, top, solid: true });
    claim(x, z, Math.max(w, d) * 0.62);
  }

  /* --- downtown --- */
  const dt = DISTRICTS.find((d) => d.id === 'downtown');
  for (let x = -460; x <= 460; x += 26) {
    for (let z = -760; z <= -110; z += 26) {
      const jx = x + (rng() - 0.5) * 9, jz = z + (rng() - 0.5) * 9;
      const dx = (jx - dt.x) / dt.rx, dz = (jz - dt.z) / dt.rz;
      if (Math.sqrt(dx * dx + dz * dz) > 1.0) continue;
      const w = 15 + rng() * 11, d = 15 + rng() * 11;
      const rad = Math.max(w, d) * 0.72;
      if (nearRoad(jx, jz, Math.max(w, d) * 0.72 + 2.5)) continue;
      if (!free(jx, jz, rad)) continue;
      const distC = Math.hypot(jx, jz + 420) / 400;
      const h = clamp((1 - distC) * 62 + 9 + rng() * 22, 9, 96);
      building(jx, jz, w, d, h, h > 26 ? 'tower' : 'block', (rng() - 0.5) * 0.14);
    }
  }

  /* --- suburbs --- */
  for (let i = 0; i < 90; i++) {
    const x = -560 + (rng() - 0.5) * 520, z = -640 + (rng() - 0.5) * 500;
    if (nearRoad(x, z, 12)) continue;
    const q = world.roadNet.nearest(x, z, 40);
    if (!q || q.dist > 34) continue;                 // only line the streets
    if (!free(x, z, 12)) continue;
    building(x, z, 9 + rng() * 5, 8 + rng() * 5, 5 + rng() * 3.5, 'house', rng() * Math.PI);
  }

  /* --- industrial warehouses --- */
  for (let i = 0; i < 40; i++) {
    const x = -830 + (rng() - 0.5) * 460, z = 90 + (rng() - 0.5) * 520;
    if (nearRoad(x, z, 16)) continue;
    if (!free(x, z, 26)) continue;
    building(x, z, 26 + rng() * 22, 18 + rng() * 16, 8 + rng() * 7, 'ware', Math.round(rng() * 2) * Math.PI / 2);
  }

  /* --- beach huts --- */
  for (let i = 0; i < 26; i++) {
    const x = -450 + rng() * 950, z = 760 + rng() * 110;
    if (nearRoad(x, z, 9)) continue;
    if (!free(x, z, 10)) continue;
    building(x, z, 5 + rng() * 3, 4 + rng() * 3, 3 + rng() * 1.6, 'hut', rng() * Math.PI);
  }

  // roofs, parapets and pitched caps: untextured, vertex-coloured
  const bMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.04, side: THREE.DoubleSide });
  const bMesh = bld.build(bMat);
  bMesh.castShadow = true; bMesh.receiveShadow = true;
  group.add(bMesh);

  // one textured mesh per facade style
  const FACADE_MAT = {
    tower: { rough: 0.30, metal: 0.20, env: 1.35 },
    block: { rough: 0.86, metal: 0.03, env: 0.45 },
    ware:  { rough: 0.58, metal: 0.32, env: 0.75 },
    house: { rough: 0.92, metal: 0.02, env: 0.35 },
  };
  for (const key of Object.keys(facadeBld)) {
    const b2 = facadeBld[key];
    if (!b2.v) continue;
    const [style, variant] = key.split(':');
    const cfg = FACADE_MAT[style];
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: facadeTexture(style, +variant),
      roughnessMap: facadeRoughness(style),
      roughness: cfg.rough,
      metalness: cfg.metal,
      envMapIntensity: cfg.env,
    });
    const m = b2.build(mat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }

  /* ================= INSTANCED SCATTER ================= */
  const instMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02 });

  function instance(geo, placements, cast = true) {
    if (!placements.length) return;
    const m = new THREE.InstancedMesh(geo, instMat, placements.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw || 0, 0);
      const s = p.s || 1;
      dummy.scale.set(s, p.sy || s, s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = cast; m.receiveShadow = true;
    m.frustumCulled = true;
    group.add(m);
    return m;
  }

  /* --- trees --- */
  const oaks = [], pines = [], palms = [];
  for (let i = 0; i < 2600; i++) {
    const x = (rng() - 0.5) * WORLD.size * 0.96;
    const z = (rng() - 0.5) * WORLD.size * 0.96;
    const surf = world.hf.surface(x, z);
    if (surf === SURF.WATER) continue;
    if (nearRoad(x, z, 4)) continue;
    const y = world.groundAt(x, z);
    if (y < -1) continue;
    const n = world.hf.normal(x, z);
    if (n[1] < 0.78) continue;
    if (!free(x, z, 3.4)) continue;

    let kind = 'oak';
    if (z > 700 && surf === SURF.SAND) kind = 'palm';
    else if (y > 48 || (x > 560 && z < 200)) kind = 'pine';
    else if (surf === SURF.CONCRETE && rng() < 0.75) continue;  // sparse street trees
    else if (surf === SURF.SAND && rng() < 0.85) continue;

    const p = { x, y: y - 0.2, z, yaw: rng() * Math.PI * 2, s: 0.75 + rng() * 0.7, sy: 0.8 + rng() * 0.8 };
    (kind === 'palm' ? palms : kind === 'pine' ? pines : oaks).push(p);
    claim(x, z, 2.6);
    colliders.push({ t: 'cyl', x, z, r: 0.55, top: y + 4, solid: true });
  }
  instance(treeGeometry('oak'), oaks);
  instance(treeGeometry('pine'), pines);
  instance(treeGeometry('palm'), palms);

  /* --- street lamps along roads --- */
  const lamps = [];
  for (const r of world.roadNet.roads) {
    if (r.type === 'trail' || r.type === 'pad') continue;
    const every = r.type === 'highway' ? 11 : 9;
    for (let i = 4; i < r.pts.length - 4; i += every) {
      const s = (i % (every * 2) === 0) ? 1 : -1;
      const a = r.pts[i - 1], b = r.pts[i + 1];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const lx = -tz, lz = tx;
      const off = r.half + 1.5;
      const x = r.pts[i][0] + lx * off * s, z = r.pts[i][1] + lz * off * s;
      // roads cross each other — never drop a lamp post into another one
      if (nearRoad(x, z, 1.2)) continue;
      if (!free(x, z, 1.6)) continue;
      const y = world.groundAt(x, z);
      lamps.push({ x, y, z, yaw: Math.atan2(-lz * s, -lx * s) });
      claim(x, z, 1.6);
      colliders.push({ t: 'cyl', x, z, r: 0.28, top: y + 7, solid: true });
    }
  }
  instance(lampGeometry(), lamps);

  /* --- benches & bins in the park + boardwalk --- */
  const benches = [];
  for (const r of world.roadNet.roads) {
    if (!['trail', 'boardwalk', 'lane'].includes(r.type)) continue;
    for (let i = 6; i < r.pts.length - 6; i += 14) {
      const a = r.pts[i - 1], b = r.pts[i + 1];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const s = rng() < 0.5 ? 1 : -1;
      const x = r.pts[i][0] + (-tz) * (r.half + 1.6) * s;
      const z = r.pts[i][1] + (tx) * (r.half + 1.6) * s;
      if (nearRoad(x, z, 1.0) || !free(x, z, 1.4)) continue;
      claim(x, z, 1.4);
      benches.push({ x, y: world.groundAt(x, z), z, yaw: Math.atan2(tx, tz) });
    }
  }
  instance(benchGeometry(), benches);

  /* --- construction barriers & cones around the yard --- */
  const barriers = [], cones = [];
  for (let i = 0; i < 140; i++) {
    const a = rng() * Math.PI * 2, rr = 40 + rng() * 120;
    const x = -610 + Math.cos(a) * rr, z = 40 + Math.sin(a) * rr;
    if (!free(x, z, 2)) continue;
    const y = world.groundAt(x, z);
    if (rng() < 0.55) { barriers.push({ x, y, z, yaw: a + Math.PI / 2 }); colliders.push({ t: 'box', x, z, hx: 1.1, hz: 0.22, yaw: a + Math.PI / 2, top: y + 0.7, solid: true, light: true }); }
    else cones.push({ x, y, z, yaw: rng() * 3 });
  }
  instance(barrierGeometry(), barriers);
  instance(coneGeometry(), cones, false);

  /* --- rocks on the ridge --- */
  const rocks = [];
  for (let i = 0; i < 320; i++) {
    const x = 820 + (rng() - 0.5) * 660, z = -180 + (rng() - 0.5) * 900;
    if (nearRoad(x, z, 5)) continue;
    const y = world.groundAt(x, z);
    if (y < 20) continue;
    const s = 0.8 + rng() * 2.6;
    rocks.push({ x, y: y - s * 0.25, z, yaw: rng() * 6, s });
    if (s > 1.4) colliders.push({ t: 'cyl', x, z, r: s * 0.75, top: y + s * 0.6, solid: true });
  }
  instance(rockGeometry(), rocks);

  /* --- shipping containers in the industrial zone --- */
  const cont = new MeshBuilder();
  const contColors = [0xc0562f, 0x2f6fa8, 0x3f8a52, 0xb8a13a, 0x8a4a86];
  for (let i = 0; i < 70; i++) {
    const x = -640 + (rng() - 0.5) * 330, z = 60 + (rng() - 0.5) * 300;
    if (nearRoad(x, z, 8)) continue;
    if (!free(x, z, 8)) continue;
    const y = world.groundAt(x, z);
    const yaw = Math.round(rng() * 2) * Math.PI / 2;
    const stack = rng() < 0.3 ? 2 : 1;
    for (let s = 0; s < stack; s++) {
      const c = hexRGB(contColors[Math.floor(rng() * contColors.length)]);
      const L = 12, W = 2.9, H = 2.7;
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const hw = L / 2, hd = W / 2, cy = y + H / 2 + s * H;
      const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => [x + a * cs - b * sn, z + a * sn + b * cs]);
      for (let k = 0; k < 4; k++) {
        const A = corners[k], B = corners[(k + 1) % 4];
        const nx = -(B[1] - A[1]), nz = (B[0] - A[0]); const nl = Math.hypot(nx, nz) || 1;
        const sh = 0.72 + 0.28 * Math.abs(nx / nl);
        const v0 = cont.vert(A[0], cy - H / 2, A[1], nx / nl, 0, nz / nl, c[0] * sh, c[1] * sh, c[2] * sh);
        const v1 = cont.vert(B[0], cy - H / 2, B[1], nx / nl, 0, nz / nl, c[0] * sh, c[1] * sh, c[2] * sh);
        const v2 = cont.vert(B[0], cy + H / 2, B[1], nx / nl, 0, nz / nl, c[0] * sh * 1.1, c[1] * sh * 1.1, c[2] * sh * 1.1);
        const v3 = cont.vert(A[0], cy + H / 2, A[1], nx / nl, 0, nz / nl, c[0] * sh * 1.1, c[1] * sh * 1.1, c[2] * sh * 1.1);
        cont.quad(v0, v1, v2, v3);
      }
      const t0 = cont.vert(corners[0][0], cy + H / 2, corners[0][1], 0, 1, 0, c[0] * 1.2, c[1] * 1.2, c[2] * 1.2);
      const t1 = cont.vert(corners[1][0], cy + H / 2, corners[1][1], 0, 1, 0, c[0] * 1.2, c[1] * 1.2, c[2] * 1.2);
      const t2 = cont.vert(corners[2][0], cy + H / 2, corners[2][1], 0, 1, 0, c[0] * 1.2, c[1] * 1.2, c[2] * 1.2);
      const t3 = cont.vert(corners[3][0], cy + H / 2, corners[3][1], 0, 1, 0, c[0] * 1.2, c[1] * 1.2, c[2] * 1.2);
      cont.quad(t0, t1, t2, t3);
    }
    colliders.push({ t: 'box', x, z, hx: 6.1, hz: 1.55, yaw, top: y + 2.8 * stack, solid: true });
    claim(x, z, 7.5);
  }
  if (!cont.empty) { const cm = cont.build(bMat); cm.castShadow = true; cm.receiveShadow = true; group.add(cm); }

  /* --- silos --- */
  const siloGeo = mergeGeometries([
    colorize((() => { const g = new THREE.CylinderGeometry(3.4, 3.4, 16, 12); g.translate(0, 8, 0); return g; })(), 0xb9bec6),
    colorize((() => { const g = new THREE.ConeGeometry(3.6, 2.6, 12); g.translate(0, 17.2, 0); return g; })(), 0x8b9199),
  ], false);
  const silos = [];
  for (let i = 0; i < 9; i++) {
    const x = -905 + (i % 3) * 9, z = -40 + Math.floor(i / 3) * 9;
    const y = world.groundAt(x, z);
    silos.push({ x, y, z });
    colliders.push({ t: 'cyl', x, z, r: 3.6, top: y + 18, solid: true });
    claim(x, z, 5);
  }
  instance(siloGeo, silos);

  /* --- pier pilings --- */
  const pileGeo = colorize((() => { const g = new THREE.CylinderGeometry(0.28, 0.32, 9, 6); g.translate(0, 4.5, 0); return g; })(), 0x5e4a33);
  const piles = [];
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const z = 935 + t * 155;
    for (const s of [-3.2, 3.2]) piles.push({ x: 92 + s, y: WORLD.seaLevel - 6, z });
  }
  instance(pileGeo, piles, false);

  return { group, colliders };
}
