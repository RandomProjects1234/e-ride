/* ============================================================
   meshbuilder.js — tiny accumulator for hand-built geometry
   ============================================================ */
import * as THREE from 'three';

export class MeshBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = [];
    this.v = 0;
  }
  vert(x, y, z, nx, ny, nz, r, g, b, u = 0, w = 0) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(r, g, b);
    this.uv.push(u, w);
    return this.v++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  /** axis-aligned box (cheap, flat-shaded, one colour) */
  box(cx, cy, cz, sx, sy, sz, r, g, b) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const faces = [
      [[1, 0, 0], [[hx, -hy, -hz], [hx, -hy, hz], [hx, hy, hz], [hx, hy, -hz]]],
      [[-1, 0, 0], [[-hx, -hy, hz], [-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz]]],
      [[0, 1, 0], [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]]],
      [[0, -1, 0], [[-hx, -hy, hz], [hx, -hy, hz], [hx, -hy, -hz], [-hx, -hy, -hz]]],
      [[0, 0, 1], [[-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz], [hx, -hy, hz]]],
      [[0, 0, -1], [[hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, -hz]]],
    ];
    for (const [n, vs] of faces) {
      const base = this.v;
      for (const p of vs) this.vert(cx + p[0], cy + p[1], cz + p[2], n[0], n[1], n[2], r, g, b);
      this.quad(base, base + 1, base + 2, base + 3);
    }
  }

  get empty() { return this.v === 0; }

  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.v > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1)
                              : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    return m;
  }
}

export const hexRGB = (hex) => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];
