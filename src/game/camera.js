/* ============================================================
   camera.js — chase camera with a few modes
   ============================================================ */
import * as THREE from 'three';
import { clamp, damp, lerp, angleDelta } from '../core/util.js';
import { settings } from '../core/settings.js';

export const CAM_MODES = ['chase', 'close', 'far', 'first', 'orbit'];

const CFG = {
  chase: { dist: 5.6, height: 2.3, look: 3.2, lag: 7.0, fovAdd: 16 },
  close: { dist: 3.4, height: 1.7, look: 3.0, lag: 10.0, fovAdd: 20 },
  far:   { dist: 9.5, height: 4.2, look: 4.5, lag: 5.0, fovAdd: 11 },
  first: { dist: -0.15, height: 1.18, look: 8.0, lag: 20.0, fovAdd: 22 },
  orbit: { dist: 7.5, height: 3.0, look: 2.0, lag: 4.0, fovAdd: 6 },
};

export class ChaseCam {
  constructor(camera, world) {
    this.cam = camera;
    this.world = world;
    this.mode = 'chase';
    this.pos = new THREE.Vector3(0, 10, 10);
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.shake = 0;
    this.orbitA = 0;
    this.lookBack = 0;

    /* Roblox-style free look: hold right mouse (or two-finger drag) to swing
       the camera around, wheel to zoom. userYaw is an offset on top of the
       follow angle, so once you have picked a viewpoint the camera keeps it
       while still coming round with you through corners. */
    this.userYaw = 0;
    this.userPitch = 0;
    this.pitch = 0;
    this.zoom = 1;          // multiplier on the mode's distance
    this.zoomWant = 1;
    this.orbiting = false;
    this.sinceOrbit = 99;
    this.firstFromZoom = false;
    this.baseFov = settings.get('fov');
    this._d = new THREE.Vector3();
    this._t = new THREE.Vector3();
    settings.onChange((s) => { this.baseFov = s.fov; });
  }

  cycle() {
    const i = CAM_MODES.indexOf(this.mode);
    this.mode = CAM_MODES[(i + 1) % CAM_MODES.length];
    return this.mode;
  }
  set(mode) { if (CFG[mode]) this.mode = mode; }

  addShake(v) { this.shake = Math.min(1.6, this.shake + v); }

  /** mouse/touch drag, in pixels */
  orbit(dx, dy) {
    if (!dx && !dy) return;
    const sens = 0.0042 * (settings.get('sensitivity') || 1);
    this.userYaw -= dx * sens;
    this.userPitch += dy * sens * (settings.get('invertLook') ? -1 : 1);
    this.userPitch = clamp(this.userPitch, -0.95, 1.25);
    // keep the offset in -PI..PI so it unwinds the short way
    while (this.userYaw > Math.PI) this.userYaw -= Math.PI * 2;
    while (this.userYaw < -Math.PI) this.userYaw += Math.PI * 2;
    this.orbiting = true;
    this.sinceOrbit = 0;
  }

  /** wheel notches: positive = zoom out */
  zoomBy(n) {
    if (!n) return;
    this.zoomWant = clamp(this.zoomWant * (1 + n * 0.16), 0.0, 3.2);
    if (this.zoomWant < 0.18) this.zoomWant = 0;          // snap into first person
    this.sinceOrbit = 0;
  }

  /** put the camera back behind the bike */
  recenter() { this.userYaw = 0; this.userPitch = 0; this.zoomWant = 1; }

  update(dt, body, opts = {}) {
    // wheel-in past the bike becomes first person, and back out leaves it
    this.zoom = damp(this.zoom, this.zoomWant, 12, dt);
    this.firstFromZoom = this.zoomWant <= 0.001 && this.mode !== 'first';
    const effMode = this.firstFromZoom ? 'first' : this.mode;
    const c = CFG[effMode] || CFG.chase;
    this.sinceOrbit += dt;
    this.orbiting = false;
    const speed = Math.abs(body.speed);
    const topRef = Math.max(12, body.stats.topSpeedMs);
    const sp01 = clamp(speed / topRef, 0, 1.15);

    // where the bike is
    const wr = body.stats.wheelR;
    this._t.set(body.pos.x, body.pos.y + wr + 0.55, body.pos.z);

    // desired camera yaw: behind the bike, but hold still at low speed
    let wantYaw = body.yaw + Math.PI + this.userYaw;
    if (this.mode === 'orbit') {
      this.orbitA += dt * 0.35;
      wantYaw = this.orbitA + this.userYaw;
    }
    if (opts.lookBehind) wantYaw += Math.PI;

    // while you are dragging, the camera holds the angle you are pointing at
    // instead of being hauled back behind the bike
    const dragging = this.sinceOrbit < 0.12;
    const turnLag = dragging ? 26 : effMode === 'first' ? 18 : lerp(3.0, 8.5, sp01);
    this.yaw += angleDelta(this.yaw, wantYaw) * clamp(turnLag * dt, 0, 1);
    this.pitch = damp(this.pitch, this.userPitch, dragging ? 26 : 10, dt);

    const zoomMul = this.firstFromZoom ? 1 : clamp(this.zoom, 0.22, 3.2);
    const dist = c.dist * (1 + sp01 * 0.32) * (opts.wide ? 1.35 : 1) * zoomMul;
    const height = c.height + sp01 * 0.55 + clamp(body.pitch, 0, 1) * 0.65;

    // spherical offset so dragging up looks down on the bike and vice versa
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const flat = Math.max(0.12, dist * cp);
    const wx = body.pos.x + Math.sin(this.yaw) * flat;
    const wz = body.pos.z + Math.cos(this.yaw) * flat;
    let wy = body.pos.y + height + dist * sp;

    if (effMode === 'first') {
      const f = body.stats.wheelbase * 0.30;
      this._d.set(
        body.pos.x + Math.sin(body.yaw) * f,
        body.pos.y + wr + c.height + body.pitch * 0.5,
        body.pos.z + Math.cos(body.yaw) * f,
      );
    } else {
      // keep the camera out of the ground
      const gy = this.world.groundAt(wx, wz) + 1.0;
      wy = Math.max(wy, gy);
      this._d.set(wx, wy, wz);
    }

    const lag = effMode === 'first' ? 26 : dragging ? 22 : c.lag;
    this.pos.x = damp(this.pos.x, this._d.x, lag, dt);
    this.pos.y = damp(this.pos.y, this._d.y, lag * 0.85, dt);
    this.pos.z = damp(this.pos.z, this._d.z, lag, dt);

    /* Aim ahead of the bike — but the further you have swung the camera
       round, the more it just looks at the bike itself, so free look does
       not fling the view off into the scenery. */
    const off = Math.abs(this.userYaw);
    const centreOnBike = clamp(off / 1.1, 0, 1);
    const ahead = (c.look + sp01 * 6) * (1 - centreOnBike * 0.92);
    const lookDir = opts.lookBehind ? -1 : 1;
    this.target.set(
      body.pos.x + Math.sin(body.yaw) * ahead * lookDir,
      body.pos.y + wr + 0.9 + clamp(body.pitch, 0, 1.2) * 0.9 - this.pitch * dist * 0.22,
      body.pos.z + Math.cos(body.yaw) * ahead * lookDir,
    );

    // shake from speed, slip and impacts
    const sk = settings.get('cameraShake');
    this.shake = damp(this.shake, 0, 4, dt);
    const rumble = (sp01 > 0.55 ? (sp01 - 0.55) * 0.9 : 0) + body.slipping * 0.35 + this.shake;
    const amp = rumble * 0.09 * sk;
    const t = performance.now() * 0.001;

    this.cam.position.set(
      this.pos.x + Math.sin(t * 37) * amp,
      this.pos.y + Math.sin(t * 43 + 1.3) * amp,
      this.pos.z + Math.cos(t * 31 + 2.1) * amp,
    );
    this.cam.lookAt(this.target);
    this.cam.rotation.z += body.lean * (effMode === 'first' ? 0.55 : 0.16) + Math.sin(t * 27) * amp * 0.12;

    // speed FOV
    const wantFov = this.baseFov + sp01 * c.fovAdd + (body.slipping * 3);
    this.cam.fov = damp(this.cam.fov, wantFov, 4, dt);
    this.cam.updateProjectionMatrix();
  }

  snap(body) {
    this.yaw = body.yaw + Math.PI + this.userYaw;
    this.pitch = this.userPitch;
    const c = CFG[this.mode] || CFG.chase;
    this.pos.set(
      body.pos.x + Math.sin(this.yaw) * c.dist,
      body.pos.y + c.height,
      body.pos.z + Math.cos(this.yaw) * c.dist,
    );
  }
}
