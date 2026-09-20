/* ============================================================
   noise.js — cheap deterministic value / fbm noise
   ============================================================ */

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 144665477) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** 2D value noise in [0,1] */
export function vnoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

/** fractal brownian motion, returns [0,1] */
export function fbm(x, y, oct = 4, seed = 0, lac = 2.0, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * freq, y * freq, seed + i * 71);
    norm += amp;
    amp *= gain; freq *= lac;
  }
  return sum / norm;
}

/** ridged noise — good for hill crests */
export function ridged(x, y, oct = 4, seed = 0) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(x * freq, y * freq, seed + i * 131) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5; freq *= 2.0;
  }
  return sum / norm;
}

/** smooth 0..1 ramp */
export function ramp(v, a, b) {
  if (a === b) return v >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
