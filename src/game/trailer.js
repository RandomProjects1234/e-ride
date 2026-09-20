/* ============================================================
   trailer.js — scripted 30-second gameplay capture

   Runs a shot list against the live game (real physics, real world,
   no fakery), composites the WebGL frame with title cards onto a
   720p canvas and records it with MediaRecorder.

   Kick it off with ?trailer=1, or window.__G.recordTrailer().
   ============================================================ */
import * as THREE from 'three';
import { clamp, lerp, damp, MS_TO_MPH } from '../core/util.js';
import { economy } from './economy.js';
import { buildFromPreset } from '../vehicle/build.js';
import { PRESET_BY_ID } from '../vehicle/parts.js';

const W = 1280, H = 720;

/* ---------------- shot list ---------------- */
/* Each shot: seconds, the vehicle to ride, where to start, how to drive,
   how to frame it, and what to put on screen. */
const SHOTS = [
  {
    t: 4.0, title: 'E-RIDE', sub: 'VOLTA BAY',
    preset: 'v-light', at: [0, -340, Math.PI / 2], road: 'dt-st-3',
    cam: 'crane', throttle: 0.75, bigTitle: true,
  },
  {
    t: 3.6, caption: 'Ride the whole city',
    preset: 'v-light', at: null, road: 'dt-blvd', cam: 'chase', throttle: 1,
  },
  {
    t: 4.2, caption: 'Wheelie for cash',
    preset: 'v-ultra', road: 'dt-av-3', cam: 'close', throttle: 1, wheelie: true, hud: true,
  },
  {
    t: 3.4, caption: 'Send it in Amp Park',
    preset: 'v-gravity', at: [-98, 277, Math.atan2(Math.cos(0.49), Math.sin(0.49))],
    cam: 'side', throttle: 1,
  },
  {
    t: 3.2, caption: 'Torque Ridge',
    preset: 'v-hx', road: 'hill-climb', cam: 'far', throttle: 1,
  },
  {
    t: 3.4, caption: 'Build anything',
    preset: 'v-titan', at: [-155, 392, 0], cam: 'orbit', throttle: 0.9, showBuild: true,
  },
  {
    t: 5.0, caption: '268 mph on the Mile',
    preset: 'v-exo', at: [-830, -1010, Math.PI / 2], cam: 'lowchase', throttle: 1, hud: true,
  },
  {
    t: 3.2, caption: null,
    preset: 'v-omega', at: [770, -1010, Math.PI / 2], cam: 'chase', throttle: 1, hud: true,
  },
  {
    t: 3.0, title: 'E-RIDE', sub: 'build it · ride it · sell it',
    preset: 'v-omega', at: null, cam: 'hold', throttle: 0.2, bigTitle: true, endCard: true,
  },
];

export class Trailer {
  constructor(game) {
    this.game = game;
    this.active = false;
  }

  async record() {
    const g = this.game;
    if (this.active) return null;
    this.active = true;

    /* ---- take over the game ---- */
    const prev = {
      hud: !g.hud.el.hud.classList.contains('hidden'),
      pixelRatio: g.engine.renderer.getPixelRatio(),
      fov: g.engine.camera.fov,
      shadows: g.engine.renderer.shadowMap.enabled,
      active: economy.data.active,
    };
    g.hud.show(false);
    document.getElementById('pause-btn').classList.add('hidden');
    document.getElementById('touch').classList.add('hidden');
    g.trailerMode = true;

    g.engine.renderer.setPixelRatio(1);
    g.engine.renderer.setSize(W, H, false);
    g.engine.renderer.shadowMap.enabled = true;
    g.engine.camera.aspect = W / H;
    g.engine.camera.updateProjectionMatrix();

    /* ---- compositor ---- */
    const cc = document.createElement('canvas');
    cc.width = W; cc.height = H;
    const cx = cc.getContext('2d');
    this.cx = cx; this.cc = cc;

    /* Frames are pushed manually: a hidden browser pane gives us no
       requestAnimationFrame at all, so the trailer drives its own clock
       from a Worker (worker timers are not throttled) and pushes each
       finished frame into the stream itself. */
    const stream = cc.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    /* ---- build the shot state ---- */
    this.shotIdx = -1;
    this.shotT = 0;
    this.total = SHOTS.reduce((a, s) => a + s.t, 0);
    this.elapsed = 0;
    this._cam = new THREE.Vector3();
    this._vehicles = new Map();

    rec.start();
    const stopped = new Promise((res) => { rec.onstop = () => res(new Blob(chunks, { type: mime })); });

    /* ---- unthrottled tick source ---- */
    const src = URL.createObjectURL(new Blob(
      ['let i=setInterval(()=>postMessage(0),33);onmessage=()=>{clearInterval(i);close();}'],
      { type: 'text/javascript' }));
    const worker = new Worker(src);

    let last = performance.now();
    const finished = new Promise((res) => {
      worker.onmessage = () => {
        if (this._done) return;
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 1 / 20);
        last = now;
        try {
          this.tick(dt);
          if (this._done) { res(); return; }
          g.engine.render();
          this.composite();
          if (track.requestFrame) track.requestFrame();
          else if (stream.requestFrame) stream.requestFrame();
        } catch (err) {
          this._error = err;
          this._done = true;
          res();
        }
      };
    });

    await finished;
    worker.postMessage(0);
    URL.revokeObjectURL(src);
    rec.stop();
    const blob = await stopped;

    /* ---- hand the game back ---- */
    g.trailerMode = false;
    g.afterRender = null;
    g.trailerTick = null;
    if (this._error) console.error('[trailer]', this._error);
    g.hud.show(prev.hud);
    document.getElementById('pause-btn').classList.remove('hidden');
    g.engine.renderer.setPixelRatio(prev.pixelRatio);
    g.engine.renderer.shadowMap.enabled = prev.shadows;
    g.engine._resize();
    economy.setActive(prev.active);
    g.syncActiveVehicle();
    g.cam.set('chase');
    g.cam.snap(g.player.body);
    this.active = false;
    const err = this._error;
    this._done = false;
    this._error = null;

    return { blob, error: err ? String(err && err.stack || err) : null };
  }

  /* ---------------- per-frame ---------------- */
  tick(dt) {
    dt = Math.min(dt, 1 / 24);
    const g = this.game;
    this.elapsed += dt;
    this.shotT += dt;

    let shot = SHOTS[this.shotIdx];
    if (!shot || this.shotT >= shot.t) {
      this.shotIdx++;
      this.shotT = 0;
      shot = SHOTS[this.shotIdx];
      if (!shot) { this._done = true; return; }
      this.beginShot(shot);
    }

    const b = g.player.body;
    b.charge = 1;

    /* ---- driving ---- */
    let steer = 0;
    if (this.road) {
      const r = this.road;
      while (this.rIdx < r.pts.length - 1 &&
             Math.hypot(r.pts[this.rIdx][0] - b.pos.x, r.pts[this.rIdx][1] - b.pos.z) < 14) this.rIdx++;
      const p = r.pts[Math.min(this.rIdx, r.pts.length - 1)];
      let d = ((Math.atan2(p[0] - b.pos.x, p[1] - b.pos.z) - b.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      steer = clamp(d * 2.4, -1, 1);
    }
    const wheelie = shot.wheelie && this.shotT > 0.6;
    b.step(dt, {
      throttle: shot.throttle ?? 1,
      steer,
      wheelie,
      brake: false,
      leanFwd: false,
    }, 1);
    if (b.crashed) { b.recover(); b.charge = 1; }
    g.player.syncModel(dt, {});

    /* ---- camera ---- */
    this.frame(shot, dt);
    g.engine.focusShadows(b.pos);
    g.world.updatePois(g.engine.elapsed, b.pos);
    g.fx.update(dt, b, g.world);
  }

  beginShot(shot) {
    const g = this.game;
    if (shot.preset) {
      let id = this._vehicles.get(shot.preset);
      if (!id) {
        const existing = economy.vehicles.find((v) => v.preset === shot.preset);
        if (existing) id = existing.id;
        else {
          const p = PRESET_BY_ID[shot.preset];
          const v = economy.addVehicle(p ? p.name : shot.preset, buildFromPreset(shot.preset), { preset: shot.preset });
          id = v.id;
        }
        this._vehicles.set(shot.preset, id);
      }
      economy.setActive(id);
      g.syncActiveVehicle();
    }
    const b = g.player.body;
    this.road = shot.road ? g.world.roadNet.roads.find((r) => r.id === shot.road) : null;
    if (this.road) {
      this.rIdx = 3;
      const start = shot.at || [this.road.pts[0][0], this.road.pts[0][1],
        Math.atan2(this.road.pts[3][0] - this.road.pts[0][0], this.road.pts[3][1] - this.road.pts[0][1])];
      b.placeAt(start[0], start[1], start[2]);
      // enter the shot already moving
      b.speed = Math.min(b.stats.topSpeedMs * 0.55, 16);
    } else if (shot.at) {
      b.placeAt(shot.at[0], shot.at[1], shot.at[2]);
      b.speed = Math.min(b.stats.topSpeedMs * 0.45, 14);
    }
    b.charge = 1;
    this._camInit = false;
    g.cam.snap(b);
  }

  frame(shot, dt) {
    const g = this.game;
    const b = g.player.body;
    const cam = g.engine.camera;
    const t01 = this.shotT / shot.t;

    switch (shot.cam) {
      case 'crane': {
        const a = -0.6 + t01 * 0.5;
        const r = lerp(70, 34, t01);
        cam.position.set(b.pos.x + Math.sin(a) * r, b.pos.y + lerp(38, 9, t01), b.pos.z + Math.cos(a) * r);
        cam.lookAt(b.pos.x, b.pos.y + 1.4, b.pos.z);
        cam.fov = 48; cam.updateProjectionMatrix();
        break;
      }
      case 'side': {
        const off = 13;
        const a = b.yaw + Math.PI / 2;
        this._cam.set(b.pos.x + Math.sin(a) * off, b.pos.y + 3.2, b.pos.z + Math.cos(a) * off);
        if (!this._camInit) { cam.position.copy(this._cam); this._camInit = true; }
        cam.position.lerp(this._cam, 1 - Math.exp(-6 * dt));
        cam.lookAt(b.pos.x, b.pos.y + 1.2, b.pos.z);
        cam.fov = 52; cam.updateProjectionMatrix();
        break;
      }
      case 'orbit': {
        const a = this.shotT * 0.55;
        cam.position.set(b.pos.x + Math.sin(a) * 15, b.pos.y + 6.5, b.pos.z + Math.cos(a) * 15);
        cam.lookAt(b.pos.x, b.pos.y + 1.1, b.pos.z);
        cam.fov = 54; cam.updateProjectionMatrix();
        break;
      }
      case 'lowchase': {
        const a = b.yaw + Math.PI;
        const sp = clamp(Math.abs(b.speed) / b.stats.topSpeedMs, 0, 1);
        this._cam.set(b.pos.x + Math.sin(a) * (7 + sp * 5), b.pos.y + 1.15, b.pos.z + Math.cos(a) * (7 + sp * 5));
        if (!this._camInit) { cam.position.copy(this._cam); this._camInit = true; }
        cam.position.lerp(this._cam, 1 - Math.exp(-9 * dt));
        cam.lookAt(b.pos.x + Math.sin(b.yaw) * 10, b.pos.y + 1.2, b.pos.z + Math.cos(b.yaw) * 10);
        cam.fov = 62 + sp * 26; cam.updateProjectionMatrix();
        break;
      }
      case 'hold': {
        const a = -0.9 - this.shotT * 0.16;
        cam.position.set(b.pos.x + Math.sin(a) * 16, b.pos.y + 5.5, b.pos.z + Math.cos(a) * 16);
        cam.lookAt(b.pos.x, b.pos.y + 1.2, b.pos.z);
        cam.fov = 50; cam.updateProjectionMatrix();
        break;
      }
      default:
        g.cam.set(shot.cam === 'close' ? 'close' : shot.cam === 'far' ? 'far' : 'chase');
        g.cam.update(dt, b, {});
    }
  }

  /* ---------------- overlay ---------------- */
  composite() {
    const cx = this.cx;
    const g = this.game;
    const shot = SHOTS[this.shotIdx];
    if (!shot) return;
    const t01 = this.shotT / shot.t;

    cx.drawImage(g.engine.renderer.domElement, 0, 0, W, H);

    // filmic letterbox
    const bar = 46;
    cx.fillStyle = '#000';
    cx.fillRect(0, 0, W, bar);
    cx.fillRect(0, H - bar, W, bar);

    // vignette
    const vg = cx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    cx.fillStyle = vg;
    cx.fillRect(0, bar, W, H - bar * 2);

    // fade in / out of each shot
    const fade = Math.min(1, t01 / 0.10) * Math.min(1, (1 - t01) / 0.10);
    if (fade < 1) {
      cx.fillStyle = `rgba(0,0,0,${(1 - fade).toFixed(3)})`;
      cx.fillRect(0, bar, W, H - bar * 2);
    }

    const b = g.player.body;

    /* speed + build readout */
    if (shot.hud) {
      const mph = Math.round(Math.abs(b.speed) * MS_TO_MPH);
      cx.save();
      cx.globalAlpha = fade;
      cx.textAlign = 'right';
      cx.font = '900 76px Inter, system-ui, sans-serif';
      cx.fillStyle = mph > 200 ? '#ff4d5e' : '#39e6a4';
      cx.shadowColor = 'rgba(0,0,0,.8)'; cx.shadowBlur = 18;
      cx.fillText(String(mph), W - 56, H - bar - 46);
      cx.font = '800 20px Inter, system-ui, sans-serif';
      cx.fillStyle = '#e7ecf7';
      cx.fillText('MPH', W - 56, H - bar - 20);
      cx.restore();
    }

    if (shot.showBuild) {
      const st = b.stats;
      const rows = [
        ['MOTOR', st.parts.motor?.name || '—'],
        ['PACK', st.parts.battery ? `${st.parts.battery.volts}V · ${st.parts.battery.wh} Wh` : '—'],
        ['POWER', `${(st.powerW / 1000).toFixed(1)} kW`],
        ['TOP', `${Math.round(st.topSpeedMph)} mph`],
      ];
      cx.save();
      cx.globalAlpha = fade * 0.95;
      cx.textAlign = 'left';
      let y = bar + 64;
      for (const [k, v] of rows) {
        cx.font = '800 13px Inter, system-ui, sans-serif';
        cx.fillStyle = '#8592ad';
        cx.fillText(k, 58, y);
        cx.font = '800 24px Inter, system-ui, sans-serif';
        cx.fillStyle = '#e7ecf7';
        cx.shadowColor = 'rgba(0,0,0,.75)'; cx.shadowBlur = 10;
        cx.fillText(v, 58, y + 26);
        cx.shadowBlur = 0;
        y += 62;
      }
      cx.restore();
    }

    /* captions */
    if (shot.caption) {
      cx.save();
      cx.globalAlpha = fade;
      cx.textAlign = 'left';
      cx.font = '900 38px Inter, system-ui, sans-serif';
      cx.shadowColor = 'rgba(0,0,0,.85)'; cx.shadowBlur = 16;
      cx.fillStyle = '#ffffff';
      cx.fillText(shot.caption, 58, H - bar - 34);
      cx.fillStyle = '#39e6a4';
      cx.fillRect(58, H - bar - 22, Math.min(1, t01 * 2.2) * 190, 4);
      cx.restore();
    }

    /* title cards */
    if (shot.bigTitle) {
      cx.save();
      cx.globalAlpha = fade;
      cx.textAlign = 'center';
      const grd = cx.createLinearGradient(W / 2 - 300, 0, W / 2 + 300, 0);
      grd.addColorStop(0, '#39e6a4');
      grd.addColorStop(0.55, '#16c2ff');
      grd.addColorStop(1, '#a06bff');
      cx.font = '900 132px Inter, system-ui, sans-serif';
      cx.shadowColor = 'rgba(0,0,0,.6)'; cx.shadowBlur = 30;
      cx.fillStyle = grd;
      cx.fillText(shot.title, W / 2, H / 2 + (shot.endCard ? -6 : 10));
      cx.shadowBlur = 0;
      cx.font = '800 22px Inter, system-ui, sans-serif';
      cx.fillStyle = 'rgba(231,236,247,.86)';
      cx.letterSpacing = '10px';
      cx.fillText(shot.sub.toUpperCase(), W / 2, H / 2 + (shot.endCard ? 44 : 58));
      cx.letterSpacing = '0px';
      if (shot.endCard) {
        cx.font = '700 16px Inter, system-ui, sans-serif';
        cx.fillStyle = 'rgba(133,146,173,.9)';
        cx.fillText('update 1 · volta bay', W / 2, H / 2 + 86);
      }
      cx.restore();
    }

    /* progress ticks along the bottom bar */
    cx.fillStyle = 'rgba(57,230,164,.55)';
    cx.fillRect(0, H - bar, (this.elapsed / this.total) * W, 3);
  }
}
