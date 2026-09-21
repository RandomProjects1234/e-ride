/* ============================================================
   audio.js — fully procedural WebAudio (no asset files)
   ============================================================ */
import { settings } from './settings.js';
import { clamp } from './util.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.nodes = {};
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    const master = this.ctx.createGain();
    master.gain.value = settings.get('master');
    master.connect(this.ctx.destination);
    this.master = master;

    const sfxBus = this.ctx.createGain();
    sfxBus.gain.value = settings.get('sfx');
    sfxBus.connect(master);
    this.sfxBus = sfxBus;

    this._buildMotor();
    this._buildWind();
    this._noiseBuf = this._makeNoise(2);

    settings.onChange((d) => {
      if (!this.ctx) return;
      this.master.gain.value = d.master;
      this.sfxBus.gain.value = d.sfx;
    });

    this.ready = true;
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _makeNoise(sec) {
    const n = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* ---------- continuous motor whine ---------- */
  _buildMotor() {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0; g.connect(this.sfxBus);

    // two saws an octave apart + a sub sine = e-motor-ish whine
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const o3 = ctx.createOscillator(); o3.type = 'sine';
    const g1 = ctx.createGain(); g1.gain.value = 0.28;
    const g2 = ctx.createGain(); g2.gain.value = 0.10;
    const g3 = ctx.createGain(); g3.gain.value = 0.42;

    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 3;

    o1.connect(g1); o2.connect(g2); o3.connect(g3);
    g1.connect(lp); g2.connect(lp); g3.connect(lp);
    lp.connect(g);

    o1.start(); o2.start(); o3.start();
    this.motor = { g, o1, o2, o3, lp };
  }

  _buildWind() {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0; g.connect(this.sfxBus);
    const src = ctx.createBufferSource();
    src.buffer = this._makeNoise(3); src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.7;
    src.connect(bp); bp.connect(g); src.start();
    this.wind = { g, bp };
  }

  /** called every frame with vehicle state */
  updateMotor({ speed = 0, throttle = 0, maxSpeed = 30, grounded = true, active = true }) {
    if (!this.ready || !this.motor) return;
    const t = this.ctx.currentTime;
    /* An invalid build (missing part, incompatible tyre) computes NaN stats,
       and a NaN reaching setTargetAtTime throws and takes the whole frame
       with it. Sanitise here: the audio layer should never be the thing
       that crashes the game. */
    if (!Number.isFinite(speed)) speed = 0;
    if (!Number.isFinite(throttle)) throttle = 0;
    if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) maxSpeed = 30;
    const sp = clamp(speed / Math.max(8, maxSpeed), 0, 1.4);
    const base = 42 + sp * 560 + throttle * 34;
    this.motor.o1.frequency.setTargetAtTime(base, t, 0.06);
    this.motor.o2.frequency.setTargetAtTime(base * 2.01, t, 0.06);
    this.motor.o3.frequency.setTargetAtTime(base * 0.5, t, 0.08);
    this.motor.lp.frequency.setTargetAtTime(700 + sp * 4200, t, 0.1);
    const vol = active ? clamp(0.045 + Math.abs(throttle) * 0.10 + sp * 0.09, 0, 0.26) * (grounded ? 1 : 0.55) : 0;
    this.motor.g.gain.setTargetAtTime(vol, t, 0.08);

    const w = clamp((speed - 6) / 42, 0, 1);
    this.wind.g.gain.setTargetAtTime(active ? w * 0.16 : 0, t, 0.15);
    this.wind.bp.frequency.setTargetAtTime(420 + w * 1500, t, 0.2);
  }

  /* ---------- one-shots ---------- */
  _env(g, t, a, d, peak) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  blip(freq = 660, dur = 0.09, type = 'sine', vol = 0.16) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain(); this._env(g, t, 0.006, dur, vol);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }

  ui(kind = 'click') {
    if (!this.ready) return;
    if (kind === 'click') this.blip(520, 0.05, 'triangle', 0.09);
    else if (kind === 'ok') { this.blip(660, 0.08, 'sine', 0.12); setTimeout(() => this.blip(990, 0.1, 'sine', 0.1), 65); }
    else if (kind === 'err') this.blip(150, 0.16, 'square', 0.1);
    else if (kind === 'open') this.blip(380, 0.09, 'sine', 0.08);
  }

  cash(mult = 1) {
    if (!this.ready) return;
    const base = 720 + Math.min(mult, 8) * 55;
    this.blip(base, 0.07, 'triangle', 0.12);
    setTimeout(() => this.blip(base * 1.5, 0.09, 'triangle', 0.1), 55);
    setTimeout(() => this.blip(base * 2, 0.12, 'sine', 0.08), 115);
  }

  bell() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [1720, 2480, 3260].forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = this.ctx.createGain(); this._env(g, t + i * 0.004, 0.003, 0.7 - i * 0.16, 0.10 - i * 0.03);
      o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 1);
    });
  }

  crash() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    const g = this.ctx.createGain(); this._env(g, t, 0.004, 0.55, 0.26);
    src.connect(bp); bp.connect(g); g.connect(this.sfxBus);
    bp.frequency.setValueAtTime(1600, t);
    bp.frequency.exponentialRampToValueAtTime(140, t + 0.5);
    src.start(t); src.stop(t + 0.7);
    this.blip(72, 0.3, 'square', 0.14);
  }

  land(force = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = this.ctx.createGain(); this._env(g, t, 0.003, 0.16, clamp(force, 0, 1) * 0.15);
    src.connect(lp); lp.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + 0.3);
  }

  skid(on) {
    if (!this.ready) return;
    if (on && !this._skid) {
      const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf; src.loop = true;
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.6;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(this.sfxBus); src.start();
      g.gain.setTargetAtTime(0.07, this.ctx.currentTime, 0.05);
      this._skid = { src, g };
    } else if (!on && this._skid) {
      const s = this._skid; this._skid = null;
      s.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      setTimeout(() => { try { s.src.stop(); } catch (e) {} }, 400);
    }
  }

  levelUp() {
    if (!this.ready) return;
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.11), i * 85));
  }

  mute(on) { if (this.master) this.master.gain.value = on ? 0 : settings.get('master'); }
}

export const audio = new AudioEngine();
