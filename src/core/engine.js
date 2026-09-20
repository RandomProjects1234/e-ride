/* ============================================================
   engine.js — renderer, scene, lights, sky, post-ish effects
   ============================================================ */
import * as THREE from 'three';
import { settings } from './settings.js';
import { skyEnvironment } from '../world/textures.js';
import { clamp, damp } from './util.js';

export const SKY = {
  top: new THREE.Color(0x2a5ea8),
  mid: new THREE.Color(0x8fc4e8),
  bot: new THREE.Color(0xd9e6ef),
  sun: new THREE.Color(0xfff2d8),
  fog: new THREE.Color(0xa9c6db),
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.fps = 60;
    this._fpsAcc = 0; this._fpsN = 0;

    const q = this._pickQuality();
    this.quality = q;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: q !== 'low',
      powerPreference: 'high-performance',
      stencil: false,
      // the trailer recorder reads the frame back with drawImage(), which
      // needs the buffer to survive past the render call
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = settings.get('shadows') && q !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = this._makeSkyTexture();
    this.scene.fog = new THREE.Fog(SKY.fog.getHex(), 240, q === 'low' ? 700 : 1250);

    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.25, 4000);
    this.camera.position.set(0, 12, 22);

    this._lights();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this._resize());

    settings.onChange((d) => {
      this.camera.fov = d.fov; this.camera.updateProjectionMatrix();
      this.renderer.shadowMap.enabled = d.shadows && this.quality !== 'low';
    });
  }

  _pickQuality() {
    const s = settings.get('quality');
    if (s !== 'auto') return s;
    const mem = navigator.deviceMemory || 4;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const small = Math.min(innerWidth, innerHeight) < 700;
    if (coarse && (mem <= 4 || small)) return 'low';
    if (coarse) return 'medium';
    return mem >= 8 ? 'high' : 'medium';
  }

  _makeSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0.0, '#1d4d93');
    grd.addColorStop(0.32, '#4f8fd0');
    grd.addColorStop(0.62, '#a3cfe9');
    grd.addColorStop(0.86, '#d8e8f2');
    grd.addColorStop(1.0, '#e8eef2');
    g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  }

  _lights() {
    const hemi = new THREE.HemisphereLight(0xbcd9f5, 0x54503f, 0.38);
    this.scene.add(hemi);
    this.hemi = hemi;

    const sun = new THREE.DirectionalLight(0xfff6e2, 1.95);
    sun.position.set(-230, 340, 180);
    sun.castShadow = true;
    const S = this.quality === 'high' ? 4096 : this.quality === 'medium' ? 2048 : 1024;
    sun.shadow.mapSize.set(S, S);
    // a tighter frustum over the same map size is what actually makes
    // shadows crisp — 130 m of coverage was spending most of the texels
    // on ground the player never looks at
    const d = this.quality === 'low' ? 110 : 85;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 720;
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // gentle fill from the opposite side so dark sides aren't flat
    const fill = new THREE.DirectionalLight(0x9fc6ff, 0.20);
    fill.position.set(200, 120, -180);
    this.scene.add(fill);

    /* A filtered sky as the environment map. Without one, every metal and
       glass surface has nothing to reflect and reads as flat paint — this
       is most of the difference between "untextured boxes" and a city. */
    try {
      this.scene.environment = skyEnvironment(this.renderer, sun.position.clone().normalize());
      this.scene.environmentIntensity = 0.55;
    } catch (e) {
      console.warn('[engine] no environment map:', e.message);
    }
  }

  /** keep the shadow frustum around the player */
  focusShadows(pos) {
    const s = this.sun;
    s.target.position.copy(pos);
    s.position.set(pos.x - 230, pos.y + 340, pos.z + 180);
    s.target.updateMatrixWorld();
    s.updateMatrixWorld();
  }

  _resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  tick() {
    let dt = this.clock.getDelta();
    if (dt > 0.1) dt = 0.1;          // tab-switch guard
    this.elapsed += dt;
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
    return dt;
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

/* ---------------- shared material helpers ---------------- */
const matCache = new Map();

export function mat(key, opts) {
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial(opts);
  matCache.set(key, m);
  return m;
}

export function litColor(hex, rough = 0.85, metal = 0.0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, ...extra });
}

/** flat-ish canvas texture generator, cached by key */
const texCache = new Map();
export function canvasTex(key, w, h, draw, repeat = [1, 1]) {
  const ck = key + '|' + repeat.join(',');
  if (texCache.has(ck)) return texCache.get(ck);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  texCache.set(ck, t);
  return t;
}

export { THREE, damp, clamp };
