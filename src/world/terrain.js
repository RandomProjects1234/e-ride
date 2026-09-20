/* ============================================================
   terrain.js — tiled terrain mesh with baked vertex colours
   ============================================================ */
import * as THREE from 'three';
import { WORLD, SURF } from './layout.js';
import { fbm } from './noise.js';
import { clamp, lerp } from '../core/util.js';

const TILES = 12;                       // per axis
const TILE_SIZE = WORLD.size / TILES;   // 200 m
const SEGS = 50;                        // 4 m per quad

const C = {
  grassA: [0.24, 0.36, 0.16],
  grassB: [0.34, 0.45, 0.20],
  grassDry: [0.45, 0.45, 0.24],
  dirt: [0.40, 0.29, 0.18],
  sand: [0.74, 0.67, 0.47],
  rock: [0.35, 0.34, 0.33],
  concrete: [0.42, 0.43, 0.45],
  asphalt: [0.15, 0.16, 0.18],
  wood: [0.40, 0.29, 0.19],
  seabed: [0.20, 0.25, 0.26],
};

function surfColor(surf, x, z, y, slope, out) {
  let c;
  switch (surf) {
    case SURF.SAND: c = C.sand; break;
    case SURF.DIRT: c = C.dirt; break;
    case SURF.CONCRETE: c = C.concrete; break;
    case SURF.ASPHALT: c = C.asphalt; break;
    case SURF.WOOD: c = C.wood; break;
    case SURF.WATER: c = C.seabed; break;
    default: {
      const t = fbm(x / 95, z / 95, 3, 7);
      const dry = clamp((y - 55) / 55, 0, 1);
      c = [
        lerp(lerp(C.grassA[0], C.grassB[0], t), C.grassDry[0], dry),
        lerp(lerp(C.grassA[1], C.grassB[1], t), C.grassDry[1], dry),
        lerp(lerp(C.grassA[2], C.grassB[2], t), C.grassDry[2], dry),
      ];
    }
  }
  // steep ground shows rock
  const rk = clamp((slope - 0.42) / 0.36, 0, 1);
  const n = 0.9 + fbm(x / 13, z / 13, 2, 19) * 0.22;
  out[0] = lerp(c[0], C.rock[0], rk) * n;
  out[1] = lerp(c[1], C.rock[1], rk) * n;
  out[2] = lerp(c[2], C.rock[2], rk) * n;
}

export function buildTerrain(hf) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96, metalness: 0.0,
  });

  const tmp = [0, 0, 0];
  const nrm = new THREE.Vector3();

  for (let tz = 0; tz < TILES; tz++) {
    for (let tx = 0; tx < TILES; tx++) {
      const ox = -WORLD.half + tx * TILE_SIZE;
      const oz = -WORLD.half + tz * TILE_SIZE;

      const verts = (SEGS + 1) * (SEGS + 1);
      const pos = new Float32Array(verts * 3);
      const col = new Float32Array(verts * 3);
      const nor = new Float32Array(verts * 3);
      const uv = new Float32Array(verts * 2);
      const idx = new Uint32Array(SEGS * SEGS * 6);

      let v = 0;
      for (let j = 0; j <= SEGS; j++) {
        for (let i = 0; i <= SEGS; i++) {
          const x = ox + (i / SEGS) * TILE_SIZE;
          const z = oz + (j / SEGS) * TILE_SIZE;
          const y = hf.height(x, z);
          pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
          hf.normal(x, z, nrm);
          nor[v * 3] = nrm.x; nor[v * 3 + 1] = nrm.y; nor[v * 3 + 2] = nrm.z;
          const slope = 1 - nrm.y;
          surfColor(hf.surface(x, z), x, z, y, slope, tmp);
          col[v * 3] = tmp[0]; col[v * 3 + 1] = tmp[1]; col[v * 3 + 2] = tmp[2];
          uv[v * 2] = x / 24; uv[v * 2 + 1] = z / 24;
          v++;
        }
      }
      let t = 0;
      for (let j = 0; j < SEGS; j++) {
        for (let i = 0; i < SEGS; i++) {
          const a = j * (SEGS + 1) + i;
          const b = a + 1;
          const c = a + SEGS + 1;
          const d = c + 1;
          idx[t++] = a; idx[t++] = c; idx[t++] = b;
          idx[t++] = b; idx[t++] = c; idx[t++] = d;
        }
      }

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();

      const m = new THREE.Mesh(g, material);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      group.add(m);
    }
  }
  return group;
}

/** animated-ish bay water */
export function buildWater() {
  const g = new THREE.PlaneGeometry(WORLD.size * 1.6, 900, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({
    color: 0x2f7fa8, roughness: 0.14, metalness: 0.32,
    transparent: true, opacity: 0.88,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(0, WORLD.seaLevel, 1180);
  mesh.renderOrder = 1;
  mesh.name = 'water';
  return mesh;
}

export { TILE_SIZE, TILES };
