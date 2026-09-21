/* ============================================================
   glbmodels.js — real 3D models, loaded on demand

   Most of the catalogue is procedural, but a few machines are real
   bikes with real models in models/*.glb. Those load asynchronously
   and swap in over the procedural build, so the game is playable the
   instant it starts and never blocks or breaks if a file is missing.

   Models are decimated and converted offline (see MODELS.md); the
   loader here only has to place, scale and light them.
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* Every real machine in the game. `url` is relative to the page, so
   this works identically from a file server and from GitHub Pages. */
export const REAL_MODELS = {
  'talaria-sting-r': {
    url: 'models/talaria-sting-r.glb',
    // the converter sits it on y=0, points it down +Z, and splits it into
    // frame / wheelF / wheelR so the wheels can actually turn
    name: 'Talaria Sting R MX4',
    // measured off the converted model
    rearAxle: [0, 0.372, -0.666],
    frontAxle: [0, 0.360, 0.685],
    wheelR: 0.366,
    wheelbase: 1.351,
    // where the rider sits and holds on, in model space
    seat: [0, 0.80, -0.16],
    bars: [0, 1.07, 0.40],
    pegs: [0.21, 0.40, -0.30],
    credit: 'Talaria Sting R MX4 — model via Sketchfab',
  },
};

const cache = new Map();      // id -> Promise<{def, root}>
const ready = new Map();      // id -> {def, root}  once resolved
let loader = null;

function getLoader() {
  if (!loader) loader = new GLTFLoader();
  return loader;
}

/** Load a real model once and hand out clones. Resolves to null if the
 *  file is missing, so callers keep their procedural fallback. */
export function loadRealModel(id) {
  const def = REAL_MODELS[id];
  if (!def) return Promise.resolve(null);
  if (cache.has(id)) return cache.get(id);

  const p = new Promise((resolve) => {
    getLoader().load(
      def.url,
      (gltf) => {
        const root = gltf.scene;
        root.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          // the converter writes one flat material; make it behave like
          // painted metal under the scene's environment map
          const m = o.material;
          if (m && m.isMeshStandardMaterial) {
            m.envMapIntensity = 1.1;
            m.flatShading = false;
            m.needsUpdate = true;
          }
        });
        const got = { def, root };
        ready.set(id, got);
        resolve(got);
      },
      undefined,
      (err) => {
        console.warn(`[models] ${id} did not load, using the procedural build:`, err?.message || err);
        resolve(null);
      },
    );
  });
  cache.set(id, p);
  return p;
}

/** A fresh, independently-colourable instance of a real model. */
export async function instantiateRealModel(id, paintHex) {
  const got = await loadRealModel(id);
  if (!got) return null;
  const g = got.root.clone(true);

  // clone materials so two of the same bike can be different colours
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if (paintHex != null && o.material.color) {
      o.material.color.setHex(paintHex);
    }
  });

  const holder = new THREE.Group();
  holder.add(g);
  g.scale.setScalar(got.def.scale);
  g.rotation.y = got.def.yaw;
  g.position.y = got.def.lift;
  holder.userData.def = got.def;
  return holder;
}

/** Warm the cache so the first spawn does not pop. */
export function preloadRealModels() {
  return Promise.all(Object.keys(REAL_MODELS).map((id) => loadRealModel(id)));
}

export function hasRealModel(id) { return !!REAL_MODELS[id]; }

/** Already-loaded model, or null. Lets the synchronous model builder use a
 *  real mesh when one is available and fall back silently when it is not. */
export function getLoadedModel(id) { return ready.get(id) || null; }

/** Pull the three animatable parts out of a loaded real bike.
 *  Returns clones, so several riders can be on the same machine. */
export function cloneRealBikeParts(id, paintHex) {
  const got = ready.get(id);
  if (!got) return null;
  const find = (n) => got.root.getObjectByName(n);
  const frame = find('frame'), wheelF = find('wheelF'), wheelR = find('wheelR');
  if (!frame || !wheelF || !wheelR) return null;

  const dup = (o, paint) => {
    const c = o.clone(true);
    c.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.envMapIntensity = 1.15;
      if (paint != null && m.material.color) m.material.color.setHex(paint);
      m.castShadow = true;
      m.receiveShadow = true;
    });
    c.position.set(0, 0, 0);
    c.rotation.set(0, 0, 0);
    return c;
  };
  return { def: got.def, frame: dup(frame, paintHex), wheelF: dup(wheelF), wheelR: dup(wheelR) };
}
