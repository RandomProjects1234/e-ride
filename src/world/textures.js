/* ============================================================
   textures.js — procedural textures, drawn once at boot

   Everything here is generated on a canvas rather than downloaded,
   so the game stays a folder of files with no asset pipeline and
   nothing to 404. They are all tileable: façades tile by bay and
   floor, surfaces tile by metre.
   ============================================================ */
import * as THREE from 'three';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function finish(c, { repeat = [1, 1], aniso = 8, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/* ---------------- façades ----------------
   One tile = one floor tall by one bay wide, so a wall's UVs can just
   be (bays, floors) and the texture lands on the right scale. */

function glassFacade(tint) {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');

  /* Light aluminium mullions and a pale spandrel band. The reference city
     is pale concrete and glass, not black glass — a dark frame here turns
     every tower into a navy slab no matter what the vertex tint says. */
  g.fillStyle = '#c8ccd2';
  g.fillRect(0, 0, S, S);

  // spandrel band under each floor
  g.fillStyle = '#d8dbdf';
  g.fillRect(0, S * 0.78, S, S * 0.22);

  // the glass itself, with a vertical sky-to-ground gradient so it reads
  // as a reflection rather than a flat colour
  const pane = g.createLinearGradient(0, 0, 0, S * 0.78);
  pane.addColorStop(0, tint.top);
  pane.addColorStop(0.55, tint.mid);
  pane.addColorStop(1, tint.bot);
  const bays = 2;
  const pad = 6;
  for (let i = 0; i < bays; i++) {
    const x = (i * S) / bays + pad;
    const w = S / bays - pad * 2;
    g.fillStyle = pane;
    g.fillRect(x, pad, w, S * 0.78 - pad * 2);
    // a bright streak across the top of the pane
    g.fillStyle = 'rgba(255,255,255,0.13)';
    g.fillRect(x, pad, w, (S * 0.78 - pad * 2) * 0.22);
    // random blinds / occupied floors
    if (Math.random() < 0.22) {
      g.fillStyle = 'rgba(232,226,210,0.40)';
      g.fillRect(x, pad, w, (S * 0.78 - pad * 2) * (0.3 + Math.random() * 0.4));
    }
  }

  // floor slab edge
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(0, S * 0.78, S, 3);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, S - 3, S, 3);
  return c;
}

function concreteFacade() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');

  g.fillStyle = '#c9c4ba';
  g.fillRect(0, 0, S, S);

  // subtle concrete mottle
  for (let i = 0; i < 900; i++) {
    const v = 178 + Math.random() * 62;
    g.fillStyle = `rgba(${v},${v - 5},${v - 14},${Math.random() * 0.12})`;
    g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 6, 2 + Math.random() * 5);
  }

  // punched windows, two per bay tile
  const bays = 2;
  for (let i = 0; i < bays; i++) {
    const w = S / bays * 0.52;
    const h = S * 0.44;
    const x = (i * S) / bays + (S / bays - w) / 2;
    const y = S * 0.16;
    // reveal
    g.fillStyle = 'rgba(0,0,0,0.30)';
    g.fillRect(x - 3, y - 3, w + 6, h + 6);
    const pane = g.createLinearGradient(0, y, 0, y + h);
    pane.addColorStop(0, '#5d7fa0');
    pane.addColorStop(0.5, '#3d566f');
    pane.addColorStop(1, '#2b3b4c');
    g.fillStyle = pane;
    g.fillRect(x, y, w, h);
    // sill
    g.fillStyle = '#ddd8ce';
    g.fillRect(x - 4, y + h, w + 8, 5);
    if (Math.random() < 0.3) {
      g.fillStyle = 'rgba(240,235,220,0.35)';
      g.fillRect(x, y, w, h * (0.25 + Math.random() * 0.45));
    }
  }
  // floor line
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(0, S - 4, S, 4);
  return c;
}

function brickFacade() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#6d4a3c';
  g.fillRect(0, 0, S, S);

  const bh = 11, bw = 26;
  for (let y = 0, row = 0; y < S; y += bh, row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < S + bw; x += bw) {
      const v = 0.82 + Math.random() * 0.36;
      g.fillStyle = `rgb(${Math.round(124 * v)},${Math.round(80 * v)},${Math.round(62 * v)})`;
      g.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
    }
  }
  // shopfront-ish window band
  const y = S * 0.18, h = S * 0.4;
  for (let i = 0; i < 2; i++) {
    const w = S / 2 * 0.56;
    const x = (i * S) / 2 + (S / 2 - w) / 2;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x - 4, y - 4, w + 8, h + 8);
    const pane = g.createLinearGradient(0, y, 0, y + h);
    pane.addColorStop(0, '#6b8399');
    pane.addColorStop(1, '#33465a');
    g.fillStyle = pane;
    g.fillRect(x, y, w, h);
  }
  return c;
}

function warehouseFacade() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#7d848c';
  g.fillRect(0, 0, S, S);
  // corrugated steel: vertical ribs
  for (let x = 0; x < S; x += 8) {
    const grd = g.createLinearGradient(x, 0, x + 8, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.20)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.10)');
    grd.addColorStop(1, 'rgba(0,0,0,0.20)');
    g.fillStyle = grd;
    g.fillRect(x, 0, 8, S);
  }
  // streak rust / grime
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(90,70,55,${0.05 + Math.random() * 0.1})`;
    g.fillRect(Math.random() * S, 0, 2 + Math.random() * 5, S);
  }
  // high strip window
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, S * 0.12, S, S * 0.16);
  const pane = g.createLinearGradient(0, S * 0.12, 0, S * 0.28);
  pane.addColorStop(0, '#7f9ab0');
  pane.addColorStop(1, '#46596b');
  g.fillStyle = pane;
  g.fillRect(4, S * 0.13, S - 8, S * 0.14);
  return c;
}

const GLASS_TINTS = [
  { top: '#cfe2f2', mid: '#9dbcd8', bot: '#7191b0' },   // cool blue
  { top: '#d8e8e4', mid: '#a7c6c0', bot: '#7e9d97' },   // green glass
  { top: '#e2e6ec', mid: '#bfc6d0', bot: '#969da8' },   // neutral silver
  { top: '#eadfce', mid: '#c8b89e', bot: '#9e8f78' },   // bronze
];

/** façade texture for a building style; cached per style+variant */
export function facadeTexture(style, variant = 0) {
  const key = `fac:${style}:${variant}`;
  if (cache.has(key)) return cache.get(key);
  let c;
  if (style === 'tower') c = glassFacade(GLASS_TINTS[variant % GLASS_TINTS.length]);
  else if (style === 'ware') c = warehouseFacade();
  else if (style === 'house' || style === 'hut') c = brickFacade();
  else c = concreteFacade();
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** a matching roughness map so glass is glossy and spandrel is not */
export function facadeRoughness(style) {
  const key = `rough:${style}`;
  if (cache.has(key)) return cache.get(key);
  const S = 128;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  if (style === 'tower') {
    g.fillStyle = '#c8c8c8';               // frame: rough
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#1e1e1e';               // glass: glossy
    for (let i = 0; i < 2; i++) g.fillRect((i * S) / 2 + 3, 3, S / 2 - 6, S * 0.78 - 6);
  } else {
    g.fillStyle = '#d0d0d0';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#3a3a3a';
    for (let i = 0; i < 2; i++) {
      const w = S / 2 * 0.52;
      g.fillRect((i * S) / 2 + (S / 2 - w) / 2, S * 0.16, w, S * 0.44);
    }
  }
  const t = finish(c, { srgb: false });
  cache.set(key, t);
  return t;
}

/* ---------------- ground surfaces ---------------- */

/** tileable asphalt, 1 tile = 4 m */
export function asphaltTexture() {
  if (cache.has('asphalt')) return cache.get('asphalt');
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#41454b';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 5200; i++) {
    const v = 40 + Math.random() * 60;
    g.fillStyle = `rgba(${v},${v + 2},${v + 6},${0.10 + Math.random() * 0.25})`;
    const s = 1 + Math.random() * 2.4;
    g.fillRect(Math.random() * S, Math.random() * S, s, s);
  }
  // faint patch repairs
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `rgba(30,32,36,${0.10 + Math.random() * 0.12})`;
    g.fillRect(Math.random() * S, Math.random() * S, 20 + Math.random() * 60, 14 + Math.random() * 40);
  }
  const t = finish(c, { repeat: [1, 1] });
  cache.set('asphalt', t);
  return t;
}

/** a normal map for the same asphalt, so the sun catches the grain */
export function asphaltNormal() {
  if (cache.has('asphaltN')) return cache.get('asphaltN');
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#8080ff';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const a = Math.random() * Math.PI * 2;
    const nx = 128 + Math.cos(a) * 42, ny = 128 + Math.sin(a) * 42;
    g.fillStyle = `rgba(${nx | 0},${ny | 0},235,${0.20 + Math.random() * 0.3})`;
    const s = 1 + Math.random() * 2.6;
    g.fillRect(Math.random() * S, Math.random() * S, s, s);
  }
  const t = finish(c, { srgb: false });
  cache.set('asphaltN', t);
  return t;
}

/* ---------------- sky environment ----------------
   A PMREM-filtered sky so metal and glass have something real to
   reflect. Built from a gradient dome plus a sun disc. */
export function skyEnvironment(renderer, sunDir) {
  const S = 512;
  const c = canvas(S, S / 2);
  const g = c.getContext('2d');

  const grd = g.createLinearGradient(0, 0, 0, S / 2);
  grd.addColorStop(0.00, '#20518f');
  grd.addColorStop(0.28, '#4f8fd0');
  grd.addColorStop(0.50, '#a9d2ea');
  grd.addColorStop(0.58, '#d6e6f0');
  grd.addColorStop(0.70, '#8e9782');
  grd.addColorStop(1.00, '#4c4f45');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S / 2);

  // sun, placed from the light direction
  const az = Math.atan2(sunDir.x, sunDir.z);
  const el = Math.asin(Math.max(-1, Math.min(1, sunDir.y / (sunDir.length() || 1))));
  const sx = ((az / (Math.PI * 2) + 0.5) % 1) * S;
  const sy = (0.5 - el / Math.PI) * (S / 2);
  const sun = g.createRadialGradient(sx, sy, 0, sx, sy, S * 0.10);
  sun.addColorStop(0, 'rgba(255,252,240,1)');
  sun.addColorStop(0.25, 'rgba(255,240,205,0.75)');
  sun.addColorStop(1, 'rgba(255,240,205,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, S, S / 2);

  // a few soft clouds to break up the reflection
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * S, y = (S / 2) * (0.10 + Math.random() * 0.3);
    const r = 18 + Math.random() * 46;
    const cl = g.createRadialGradient(x, y, 0, x, y, r);
    cl.addColorStop(0, 'rgba(255,255,255,0.55)');
    cl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cl;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

export function disposeTextureCache() {
  for (const t of cache.values()) t.dispose && t.dispose();
  cache.clear();
}
