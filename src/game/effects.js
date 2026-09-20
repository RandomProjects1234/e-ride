/* ============================================================
   effects.js — dust, skid marks, sparks, speed streaks
   ============================================================ */
import * as THREE from 'three';
import { clamp, lerp, rand } from '../core/util.js';
import { settings } from '../core/settings.js';

const MAX_P = 260;
const MAX_MARKS = 900;

export class Effects {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;

    /* ---- particles ---- */
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_P * 3);
    this.pCol = new Float32Array(MAX_P * 3);
    this.pSize = new Float32Array(MAX_P);
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    const m = new THREE.PointsMaterial({
      size: 0.5, vertexColors: true, transparent: true, opacity: 0.75,
      depthWrite: false, sizeAttenuation: true, map: dotTexture(),
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAX_P; i++) this.parts.push({ life: 0, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, s: 1, r: 1, g: 1, b: 1, max: 1 });
    this.pi = 0;

    /* ---- skid marks (a growing line strip of quads) ---- */
    const mg = new THREE.BufferGeometry();
    this.mPos = new Float32Array(MAX_MARKS * 6 * 3);
    this.mAlpha = new Float32Array(MAX_MARKS * 6);
    mg.setAttribute('position', new THREE.BufferAttribute(this.mPos, 3));
    mg.setAttribute('aAlpha', new THREE.BufferAttribute(this.mAlpha, 1));
    const mm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `attribute float aAlpha; varying float vA;
        void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vA;
        void main(){ if(vA<=0.001) discard; gl_FragColor = vec4(0.03,0.03,0.04, vA*0.55); }`,
    });
    this.marks = new THREE.Mesh(mg, mm);
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 3;
    scene.add(this.marks);
    this.mi = 0;
    this.lastMark = null;
    this.markCount = 0;

    this._v = new THREE.Vector3();
    this._acc = 0;
  }

  emit(x, y, z, vx, vy, vz, size, color, life) {
    const p = this.parts[this.pi];
    this.pi = (this.pi + 1) % MAX_P;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.s = size; p.life = life; p.max = life;
    p.r = ((color >> 16) & 255) / 255;
    p.g = ((color >> 8) & 255) / 255;
    p.b = (color & 255) / 255;
  }

  dust(pos, dir, amount, color) {
    for (let i = 0; i < amount; i++) {
      this.emit(
        pos.x + rand(-0.2, 0.2), pos.y + 0.08, pos.z + rand(-0.2, 0.2),
        -dir.x * rand(0.5, 2.4) + rand(-1, 1), rand(0.4, 2.0), -dir.z * rand(0.5, 2.4) + rand(-1, 1),
        rand(0.25, 0.7), color, rand(0.5, 1.2),
      );
    }
  }

  landPuff(pos, impact) {
    const surf = this.world.surfaceProps(pos.x, pos.z);
    const n = Math.round(clamp(impact, 0, 1) * 16) + 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit(pos.x, pos.y + 0.06, pos.z,
        Math.cos(a) * rand(1, 4), rand(0.3, 1.6), Math.sin(a) * rand(1, 4),
        rand(0.3, 0.9), surf.dust, rand(0.5, 1.1));
    }
  }

  crashBurst(pos) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit(pos.x, pos.y + 0.4, pos.z,
        Math.cos(a) * rand(1, 7), rand(1, 5), Math.sin(a) * rand(1, 7),
        rand(0.16, 0.5), i % 3 === 0 ? 0xffb020 : 0x9aa2ad, rand(0.5, 1.4));
    }
  }

  spark(pos, dir) {
    for (let i = 0; i < 4; i++) {
      this.emit(pos.x, pos.y + 0.12, pos.z,
        -dir.x * rand(2, 7) + rand(-1.5, 1.5), rand(0.4, 2.4), -dir.z * rand(2, 7) + rand(-1.5, 1.5),
        rand(0.07, 0.18), 0xffc24d, rand(0.18, 0.4));
    }
  }

  addMark(x, y, z, hx, hz, width) {
    if (this.markCount >= MAX_MARKS) this.markCount = MAX_MARKS;
    const i = this.mi;
    this.mi = (this.mi + 1) % MAX_MARKS;
    this.markCount = Math.min(MAX_MARKS, this.markCount + 1);
    const lx = -hz * width, lz = hx * width;
    const prev = this.lastMark;
    const base = i * 18;
    if (!prev) { this.lastMark = { x, y, z, lx, lz }; return; }
    const P = this.mPos, A = this.mAlpha;
    const v = [
      [prev.x + prev.lx, prev.y + 0.02, prev.z + prev.lz],
      [prev.x - prev.lx, prev.y + 0.02, prev.z - prev.lz],
      [x - lx, y + 0.02, z - lz],
      [prev.x + prev.lx, prev.y + 0.02, prev.z + prev.lz],
      [x - lx, y + 0.02, z - lz],
      [x + lx, y + 0.02, z + lz],
    ];
    for (let k = 0; k < 6; k++) {
      P[base + k * 3] = v[k][0]; P[base + k * 3 + 1] = v[k][1]; P[base + k * 3 + 2] = v[k][2];
      A[i * 6 + k] = 1;
    }
    this.lastMark = { x, y, z, lx, lz };
    this.marks.geometry.attributes.position.needsUpdate = true;
    this.marks.geometry.attributes.aAlpha.needsUpdate = true;
  }

  update(dt, body, world) {
    /* particles */
    const P = this.pPos, C = this.pCol, S = this.pSize;
    for (let i = 0; i < MAX_P; i++) {
      const p = this.parts[i];
      if (p.life <= 0) { P[i * 3 + 1] = -9999; S[i] = 0; continue; }
      p.life -= dt;
      p.vy -= 6 * dt;
      p.vx *= 1 - 1.8 * dt; p.vz *= 1 - 1.8 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = clamp(p.life / p.max, 0, 1);
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
      C[i * 3] = p.r * t; C[i * 3 + 1] = p.g * t; C[i * 3 + 2] = p.b * t;
      S[i] = p.s * (1.6 - t * 0.6);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.size.needsUpdate = true;

    if (!body || body.crashed) { this.lastMark = null; return; }

    /* contact effects */
    const speed = Math.abs(body.speed);
    const surf = world.surfaceProps(body.pos.x, body.pos.z);
    const hx = Math.sin(body.yaw), hz = Math.cos(body.yaw);
    this._v.set(hx, 0, hz);

    if (body.grounded && speed > 2) {
      this._acc += dt;
      const loose = surf.roll > 0.02;
      const rate = body.slipping > 0.3 ? 0.03 : loose ? 0.07 : 0.3;
      if (this._acc > rate) {
        this._acc = 0;
        if (body.slipping > 0.25 || loose) {
          this.dust(body.pos, this._v, body.slipping > 0.5 ? 3 : 1, surf.dust);
        }
      }
      if (body.slipping > 0.3 && surf.roll < 0.02) {
        this.addMark(body.pos.x, body.pos.y, body.pos.z, hx, hz, 0.06 + body.slipping * 0.05);
        if (body.slipping > 0.75 && Math.random() < 0.25) this.spark(body.pos, this._v);
      } else {
        this.lastMark = null;
      }
    } else {
      this.lastMark = null;
    }

    /* fade marks */
    const A = this.mAlpha;
    let touched = false;
    for (let i = 0; i < A.length; i += 6) {
      if (A[i] > 0) {
        const v = Math.max(0, A[i] - dt * 0.018);
        for (let k = 0; k < 6; k++) A[i + k] = v;
        touched = true;
      }
    }
    if (touched) this.marks.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

let _dotTex = null;
function dotTexture() {
  if (_dotTex) return _dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.65)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  _dotTex = new THREE.CanvasTexture(c);
  return _dotTex;
}
