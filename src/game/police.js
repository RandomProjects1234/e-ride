/* ============================================================
   police.js — heat, pursuit and the payout for getting away

   Heat is earned by riding like an idiot: speeding past traffic,
   near misses, clipping cars, and being airborne over the street.
   Past a threshold the police turn up and chase you. Break line of
   sight and hold distance and they lose you — and the longer the
   chase ran, the bigger the payout for escaping it.

   The units are simple pursuit drivers that steer toward an
   intercept point and get dragged back onto the road network, which
   is enough to feel dangerous without needing real path-finding.
   ============================================================ */
import { clamp, damp, lerp } from '../core/util.js';

const LEVELS = [
  { at: 0, name: '', units: 0, top: 0 },
  { at: 1, name: 'Noticed', units: 1, top: 24 },
  { at: 2, name: 'Wanted', units: 2, top: 30 },
  { at: 3, name: 'Pursued', units: 3, top: 36 },
  { at: 4, name: 'Manhunt', units: 5, top: 44 },
];

const ESCAPE_DIST = 165;      // far enough away and they start losing you
const ESCAPE_TIME = 7.5;      // seconds clear before the chase ends

export class Police {
  constructor(world) {
    this.world = world;
    this.heat = 0;            // 0..4+, fractional
    this.level = 0;
    this.units = [];
    this.chasing = false;
    this.chaseTime = 0;
    this.clearTime = 0;
    this.cooldown = 0;
    this.sinceNaughty = 0;
    this.lastBust = 0;
    this.busted = false;
    this.enabled = true;
    this.events = [];         // drained by the game for toasts
    this._spawnT = 0;
  }

  reset() {
    this.heat = 0; this.level = 0; this.units.length = 0;
    this.chasing = false; this.chaseTime = 0; this.clearTime = 0;
    this.busted = false; this.events.length = 0;
  }

  /** something reckless happened */
  addHeat(v, why) {
    if (!this.enabled) return;
    const before = this.level;
    this.heat = clamp(this.heat + v, 0, 5.2);
    const lv = this.levelFor(this.heat);
    if (lv > before) {
      this.events.push({ t: 'level', level: lv, name: LEVELS[Math.min(lv, 4)].name, why });
      if (!this.chasing && lv >= 1) {
        this.chasing = true;
        this.chaseTime = 0;
        this.events.push({ t: 'start' });
      }
    }
    this.level = lv;
  }

  levelFor(h) { return clamp(Math.floor(h), 0, 4); }

  /** heat from how you are riding, called every frame */
  sample(dt, body, world, traffic) {
    if (!this.enabled || this.busted) return;
    const mph = Math.abs(body.speed) * 2.23694;
    const onRoad = world.roadNet.nearest(body.pos.x, body.pos.z, 26);
    const inStreet = onRoad && onRoad.dist < onRoad.road.half + 3;
    const before = this.heat;

    // speeding — the limit is 38, and the faster you go the faster it climbs
    if (inStreet && mph > 38) this.addHeat(dt * (0.030 + (mph - 38) * 0.0022));
    // riding on the pavement
    if (!inStreet && mph > 22 && world.surfaceProps(body.pos.x, body.pos.z).name === 'concrete') {
      this.addHeat(dt * 0.075);
    }
    // a wheelie down a public road is, regrettably, also illegal
    if (inStreet && body.pitch > 0.4 && mph > 20) this.addHeat(dt * 0.06);
    // jumping over the street is quite hard for them to ignore
    if (!body.grounded && body.airTime > 0.4 && inStreet) this.addHeat(dt * 0.11);

    if (this.heat > before + 1e-6) this.sinceNaughty = 0;
    else this.sinceNaughty = (this.sinceNaughty || 0) + dt;

    if (this.chasing) this.chaseTime += dt;
    else if (this.sinceNaughty > 4) {
      // only starts cooling once you have actually behaved for a moment
      this.heat = Math.max(0, this.heat - dt * 0.05);
    }
    this.level = this.levelFor(this.heat);
  }

  update(dt, body) {
    if (!this.enabled) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.busted) { this.bustTimer -= dt; if (this.bustTimer <= 0) this.clearBust(); return; }
    if (!this.chasing) { if (this.units.length) this._retire(dt); return; }

    const want = LEVELS[Math.min(this.level, 4)].units;
    this._spawnT -= dt;
    if (this.units.length < want && this._spawnT <= 0) {
      const u = this._spawn(body);
      if (u) { this.units.push(u); this._spawnT = 2.2; }
    }
    while (this.units.length > want) this.units.pop();

    let nearest = 1e9;
    for (const u of this.units) {
      this._driveUnit(u, dt, body);
      nearest = Math.min(nearest, Math.hypot(u.x - body.pos.x, u.z - body.pos.z));
    }

    // escaping
    if (nearest > ESCAPE_DIST || !this.units.length) {
      this.clearTime += dt;
      if (this.clearTime > ESCAPE_TIME) this.escape();
    } else {
      this.clearTime = Math.max(0, this.clearTime - dt * 1.6);
    }
    this.nearest = nearest;

    // getting caught: a unit on top of you while you are barely moving
    if (nearest < 4.2 && Math.abs(body.speed) < 4.5) {
      this.caughtT = (this.caughtT || 0) + dt;
      if (this.caughtT > 1.6) this.bust();
    } else this.caughtT = 0;
  }

  _spawn(body) {
    const roads = this.world.roadNet.roads.filter((r) => r.w >= 9 && r.pts.length > 12);
    if (!roads.length) return null;
    let best = null, bestD = 1e9;
    for (let i = 0; i < 40; i++) {
      const r = roads[(Math.random() * roads.length) | 0];
      const k = (Math.random() * r.pts.length) | 0;
      const d = Math.hypot(r.pts[k][0] - body.pos.x, r.pts[k][1] - body.pos.z);
      // arrive from somewhere ahead-ish but off screen
      if (d < 70 || d > 190) continue;
      if (d < bestD) { bestD = d; best = r.pts[k]; }
    }
    if (!best) return null;
    return {
      x: best[0], z: best[1], y: this.world.groundAt(best[0], best[1]),
      yaw: 0, speed: 16, vx: 0, vz: 0, siren: Math.random() * 6.28,
    };
  }

  _driveUnit(u, dt, body) {
    // aim at where the bike is going, not where it is
    const lead = clamp(Math.hypot(u.x - body.pos.x, u.z - body.pos.z) / 30, 0, 1.4);
    const tx = body.pos.x + Math.sin(body.yaw) * body.speed * lead;
    const tz = body.pos.z + Math.cos(body.yaw) * body.speed * lead;

    let dx = tx - u.x, dz = tz - u.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;

    // stay on the tarmac: blend the chase direction toward the nearest road
    const q = this.world.roadNet.nearest(u.x, u.z, 40);
    if (q && q.dist > q.road.half * 0.8) {
      const seg = q.road.pts;
      let bi = 0, bd = 1e9;
      for (let i = 0; i < seg.length; i += 2) {
        const dd = (seg[i][0] - u.x) ** 2 + (seg[i][1] - u.z) ** 2;
        if (dd < bd) { bd = dd; bi = i; }
      }
      const rx = seg[bi][0] - u.x, rz = seg[bi][1] - u.z;
      const rl = Math.hypot(rx, rz) || 1;
      const pull = clamp((q.dist - q.road.half * 0.8) / 14, 0, 0.8);
      dx = lerp(dx, rx / rl, pull); dz = lerp(dz, rz / rl, pull);
      const nl = Math.hypot(dx, dz) || 1; dx /= nl; dz /= nl;
    }

    /* Pull up alongside rather than driving through the bike — a car
       occupying the same space as you reads as a rendering bug, not a
       pursuit. Inside the standoff radius they back off instead. */
    const STANDOFF = 3.8;
    // measure the standoff against the bike itself, not the lead-intercept
    // point, which sits metres ahead of it whenever the bike is moving
    const realD = Math.hypot(body.pos.x - u.x, body.pos.z - u.z);
    const top = LEVELS[Math.min(this.level, 4)].top;
    let want = realD < 11 ? 9 : top;
    if (realD < STANDOFF) { want = 0; dx = -dx; dz = -dz; }
    u.speed = damp(u.speed, want, realD < STANDOFF * 1.6 ? 9 : 1.6, dt);
    // never close more than the remaining gap in one step
    const step = Math.min(u.speed, realD < STANDOFF ? 2.5 : Math.max(0, (realD - STANDOFF) / Math.max(dt, 1e-4)));
    u.x += dx * step * dt;
    u.z += dz * step * dt;

    // and never let two units stack on the same square metre
    for (const o of this.units) {
      if (o === u) continue;
      const ox = u.x - o.x, oz = u.z - o.z;
      const od = Math.hypot(ox, oz);
      if (od > 0.01 && od < 3.4) {
        const push = (3.4 - od) * 0.5;
        u.x += (ox / od) * push; u.z += (oz / od) * push;
      }
    }
    u.y = damp(u.y, this.world.groundAt(u.x, u.z), 10, dt);
    const wantYaw = Math.atan2(dx, dz);
    let delta = ((wantYaw - u.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    u.yaw += delta * clamp(6 * dt, 0, 1);
    u.siren += dt * 9;
  }

  _retire(dt) {
    this.retireT = (this.retireT || 0) + dt;
    if (this.retireT > 1.2) { this.units.pop(); this.retireT = 0; }
  }

  escape() {
    const secs = this.chaseTime;
    const lv = Math.max(1, this.level);
    const payout = Math.round((60 + secs * 26) * lv * (1 + lv * 0.35));
    this.events.push({ t: 'escaped', seconds: Math.round(secs), payout, level: lv });
    this.chasing = false;
    this.chaseTime = 0;
    this.clearTime = 0;
    this.heat = 0;
    this.level = 0;
    this.units.length = 0;
    return payout;
  }

  bust() {
    const lv = Math.max(1, this.level);
    const fine = Math.round(120 * lv * lv);
    this.busted = true;
    this.bustTimer = 2.6;
    this.units.length = 0;
    this.chasing = false;
    this.events.push({ t: 'busted', fine, level: lv });
    return fine;
  }

  clearBust() {
    this.busted = false;
    this.heat = 0;
    this.level = 0;
    this.chaseTime = 0;
    this.clearTime = 0;
    this.cooldown = 12;
  }

  get levelName() { return LEVELS[Math.min(this.level, 4)].name; }
  get escapeProgress() { return this.chasing ? clamp(this.clearTime / ESCAPE_TIME, 0, 1) : 0; }

  drain() { const e = this.events.slice(); this.events.length = 0; return e; }
}
