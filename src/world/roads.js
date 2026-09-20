/* ============================================================
   roads.js — ribbon geometry for the road network
   ============================================================ */
import * as THREE from 'three';
import { MeshBuilder, hexRGB } from './meshbuilder.js';
import { SURF } from './layout.js';

const Y_ROAD = 0.09;
const Y_MARK = 0.155;
const Y_CURB = 0.10;

function tangents(pts, i) {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  let tx = b[0] - a[0], tz = b[1] - a[1];
  const l = Math.hypot(tx, tz) || 1;
  return [tx / l, tz / l];
}

export function buildRoads(roadNet) {
  const surfB = new MeshBuilder();
  const markB = new MeshBuilder();
  const curbB = new MeshBuilder();

  for (const r of roadNet.roads) {
    const n = r.pts.length;
    const base = hexRGB(r.color);
    const halfW = r.half;

    // ----- surface ribbon -----
    let prevL = -1, prevR = -1;
    let run = 0;
    for (let i = 0; i < n; i++) {
      const [tx, tz] = tangents(r.pts, i);
      const lx = -tz, lz = tx;                  // left normal in XZ
      const x = r.pts[i][0], z = r.pts[i][1], y = r.ys[i] + Y_ROAD;
      if (i > 0) run += Math.hypot(x - r.pts[i - 1][0], z - r.pts[i - 1][1]);

      // slight per-metre colour variation so long roads aren't dead flat
      const v = 0.92 + ((Math.sin(run * 0.21) + Math.sin(run * 0.07 + 2)) * 0.04);
      const cr = base[0] * v, cg = base[1] * v, cb = base[2] * v;

      const L = surfB.vert(x + lx * halfW, y, z + lz * halfW, 0, 1, 0, cr, cg, cb, 0, run / 8);
      const R = surfB.vert(x - lx * halfW, y, z - lz * halfW, 0, 1, 0, cr, cg, cb, 1, run / 8);
      if (i > 0) surfB.quad(prevL, L, R, prevR);
      prevL = L; prevR = R;

      // ----- curbs -----
      if (r.curb && i > 0 && i % 2 === 0) {
        for (const s of [1, -1]) {
          const px = x + lx * halfW * s, pz = z + lz * halfW * s;
          curbB.box(px + lx * 0.28 * s, r.ys[i] + Y_CURB + 0.06, pz + lz * 0.28 * s,
            0.55, 0.22, 0.55, 0.53, 0.54, 0.56);
        }
      }
    }

    // ----- markings -----
    if (r.markings === 'dashed' && r.type !== 'trail') {
      // centre dashes
      let d = 0, acc = 0;
      const period = r.type === 'highway' ? 12 : 10;
      const dashLen = period * 0.45;
      for (let i = 0; i < n - 1; i++) {
        const ax = r.pts[i][0], az = r.pts[i][1], ay = r.ys[i];
        const bx = r.pts[i + 1][0], bz = r.pts[i + 1][1], by = r.ys[i + 1];
        const segLen = Math.hypot(bx - ax, bz - az);
        if (segLen < 0.01) continue;
        const phase = acc % period;
        if (phase < dashLen) {
          const [tx, tz] = tangents(r.pts, i);
          const lx = -tz, lz = tx;
          const hw = 0.19;
          const A = markB.vert(ax + lx * hw, ay + Y_MARK, az + lz * hw, 0, 1, 0, 0.85, 0.83, 0.7);
          const B = markB.vert(ax - lx * hw, ay + Y_MARK, az - lz * hw, 0, 1, 0, 0.85, 0.83, 0.7);
          const Cc = markB.vert(bx - lx * hw, by + Y_MARK, bz - lz * hw, 0, 1, 0, 0.85, 0.83, 0.7);
          const D = markB.vert(bx + lx * hw, by + Y_MARK, bz + lz * hw, 0, 1, 0, 0.85, 0.83, 0.7);
          markB.quad(A, D, Cc, B);
        }
        acc += segLen; d += segLen;
      }
      // solid edge lines
      for (const s of [1, -1]) {
        let pl = -1, pr = -1;
        for (let i = 0; i < n; i++) {
          const [tx, tz] = tangents(r.pts, i);
          const lx = -tz, lz = tx;
          const off = (halfW - 0.75) * s;
          const x = r.pts[i][0] + lx * off, z = r.pts[i][1] + lz * off, y = r.ys[i] + Y_MARK;
          const hw = 0.13;
          const A = markB.vert(x + lx * hw, y, z + lz * hw, 0, 1, 0, 0.78, 0.76, 0.66);
          const B = markB.vert(x - lx * hw, y, z - lz * hw, 0, 1, 0, 0.78, 0.76, 0.66);
          if (i > 0) markB.quad(pl, A, B, pr);
          pl = A; pr = B;
        }
      }
    }

    if (r.markings === 'planks') {
      for (let i = 1; i < n; i += 2) {
        const [tx, tz] = tangents(r.pts, i);
        const lx = -tz, lz = tx;
        const x = r.pts[i][0], z = r.pts[i][1], y = r.ys[i] + Y_MARK - 0.06;
        const hw = 0.07;
        const A = markB.vert(x + lx * halfW, y, z + lz * halfW, 0, 1, 0, 0.30, 0.21, 0.13);
        const B = markB.vert(x - lx * halfW, y, z - lz * halfW, 0, 1, 0, 0.30, 0.21, 0.13);
        const [tx2, tz2] = [tx * hw, tz * hw];
        const Cc = markB.vert(x - lx * halfW + tx2 * 4, y, z - lz * halfW + tz2 * 4, 0, 1, 0, 0.30, 0.21, 0.13);
        const D = markB.vert(x + lx * halfW + tx2 * 4, y, z + lz * halfW + tz2 * 4, 0, 1, 0, 0.30, 0.21, 0.13);
        markB.quad(A, D, Cc, B);
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'roads';

  const surfMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.02 });
  const road = surfB.build(surfMat);
  road.receiveShadow = true;
  group.add(road);

  if (!markB.empty) {
    const markMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    group.add(markB.build(markMat));
  }
  if (!curbB.empty) {
    const curbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const c = curbB.build(curbMat);
    c.receiveShadow = true;
    group.add(c);
  }
  return group;
}

/** start-line / finish-line stripes for the drag strip */
export function buildStripDecor(roadNet) {
  const mile = roadNet.roads.find((r) => r.id === 'mile');
  if (!mile) return null;
  const b = new MeshBuilder();
  const drawLine = (idx, col) => {
    const i = Math.max(1, Math.min(mile.pts.length - 2, idx));
    const x = mile.pts[i][0], z = mile.pts[i][1], y = mile.ys[i] + 0.17;
    for (let k = -6; k <= 6; k++) {
      const c = ((k + 6) % 2 === 0) ? [0.92, 0.92, 0.92] : [0.1, 0.1, 0.11];
      b.box(x, y, z + k * 2, 2.6, 0.03, 2, c[0] * col[0], c[1] * col[1], c[2] * col[2]);
    }
  };
  drawLine(2, [1, 1, 1]);
  drawLine(mile.pts.length - 3, [1, 1, 1]);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
  return b.build(mat);
}

export { SURF };
