/* ============================================================
   bots.js — AI riders you can hold a ride-out with

   A ride-out is the best thing in the game and it needed five other
   people online. These are stand-ins: real VehicleBody physics, real
   builds off the catalogue, following the road network in a loose
   pack around you. They crash, wheelie, fall behind and catch up.

   They are deliberately not perfect drivers — a pack that holds a
   millimetre-accurate line looks like a train, not a ride-out.
   ============================================================ */
import * as THREE from 'three';
import { VehicleBody } from '../vehicle/physics.js';
import { stats as computeStats, buildFromPreset } from '../vehicle/build.js';
import { buildVehicleModel, poseVehicle, setRiders, tintRider, disposeModel } from '../vehicle/model.js';
import { RIDER_COLORS } from './player.js';
import { makeLabel } from '../world/world.js';
import { clamp, damp, lerp, angleDelta } from '../core/util.js';

const NAMES = [
  'Rook', 'Dez', 'Marla', 'Tev', 'Ozzy', 'Pike', 'Juno', 'Sable',
  'Nix', 'Corso', 'Bex', 'Halo', 'Wren', 'Tam', 'Vega', 'Kit',
];

/* Machines a bot might turn up on. Which ones get used is decided at
   ride-out time from what the player is riding — a pack on 23 mph
   commuters behind a 44 mph bike is not a pack, it is a queue of dots
   on the minimap. */
const RIDES = ['v-light', 'v-dune', 'v-ultra', 'v-g5', 'v-gravity', 'v-talaria',
               'v-wolf', 'v-hx', 'v-spine', 'v-titan'];

let seq = 0;

class Bot {
  constructor(world, scene, opts) {
    this.id = 'bot-' + (++seq);
    this.isBot = true;
    this.name = opts.name;
    this.colorIdx = opts.colorIdx;
    this.skill = opts.skill;            // 0..1, how tidily they ride
    this.flair = opts.flair;            // how often they pull a wheelie

    this.build = buildFromPreset(opts.preset);
    this.stats = computeStats(this.build, { riders: 1 });
    this.body = new VehicleBody(this.stats, world);
    this.body.assist = 1.0;             // bots never loop themselves on purpose

    this.model = buildVehicleModel(this.stats);
    scene.add(this.model);
    setRiders(this.model, true, false);
    tintRider(this.model, 'driver', RIDER_COLORS[this.colorIdx % RIDER_COLORS.length]);

    this.label = makeLabel(this.name, RIDER_COLORS[this.colorIdx % RIDER_COLORS.length], 0.8);
    this.label.position.y = 2.3;
    this.model.add(this.label);

    this.scene = scene;
    this.world = world;
    this.road = null;
    this.rIdx = 0;
    this.slot = opts.slot;              // where in the pack they like to sit
    this.wheelieT = 0;
    this.recoverT = 0;
    this._pose = {};
    this._retarget = 0;
  }

  dispose() {
    this.scene.remove(this.model);
    disposeModel(this.model);
  }

  placeNear(x, z, yaw) {
    const a = yaw + Math.PI + (this.slot % 2 ? 0.4 : -0.4);
    const d = 6 + this.slot * 2.2;
    const sp = this.world.safeSpot(x + Math.sin(a) * d, z + Math.cos(a) * d);
    this.body.placeAt(sp.x, sp.z, yaw);
    this.body.charge = 1;
  }

  /** pick the road we should be on to get toward `target` */
  _retargetRoad(target) {
    const q = this.world.roadNet.nearest(this.body.pos.x, this.body.pos.z, 70);
    if (!q) return;
    this.road = q.road;
    // start from the closest point on that road and head the way the
    // target lies, so the pack flows with the player rather than against
    let best = 0, bd = 1e9;
    for (let i = 0; i < this.road.pts.length; i++) {
      const d = (this.road.pts[i][0] - this.body.pos.x) ** 2 + (this.road.pts[i][1] - this.body.pos.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    const fwd = this.road.pts[Math.min(best + 4, this.road.pts.length - 1)];
    const back = this.road.pts[Math.max(best - 4, 0)];
    const df = Math.hypot(fwd[0] - target.x, fwd[1] - target.z);
    const db = Math.hypot(back[0] - target.x, back[1] - target.z);
    this.dir = df <= db ? 1 : -1;
    this.rIdx = best;
  }

  update(dt, target, t, camPos) {
    const b = this.body;
    b.charge = 1;
    if (camPos) this._camDist = Math.hypot(camPos.x - b.pos.x, camPos.z - b.pos.z);

    if (b.crashed) {
      this.recoverT += dt;
      if (this.recoverT > 1.0) { b.recover(); this.recoverT = 0; }
      this._sync(dt);
      return;
    }
    this.recoverT = 0;

    const toPlayer = Math.hypot(target.x - b.pos.x, target.z - b.pos.z);

    /* Too far behind and they cut straight to you; the alternative is a
       pack that silently dissolves the moment you take a corner quickly. */
    if (toPlayer > 150) {
      this.placeNear(target.x, target.z, target.yaw);
      return;
    }

    this._retarget -= dt;
    if (!this.road || this._retarget <= 0) { this._retargetRoad(target); this._retarget = 1.5; }

    /* Steering: follow the road, but bias toward the slot in the pack this
       rider likes, so they fan out instead of queueing nose to tail. */
    let wantX, wantZ;
    if (this.road && toPlayer > 24) {
      const r = this.road;
      while (this.rIdx > 0 && this.rIdx < r.pts.length - 1 &&
             Math.hypot(r.pts[this.rIdx][0] - b.pos.x, r.pts[this.rIdx][1] - b.pos.z) < 13) {
        this.rIdx += this.dir;
      }
      this.rIdx = clamp(this.rIdx, 0, r.pts.length - 1);
      wantX = r.pts[this.rIdx][0]; wantZ = r.pts[this.rIdx][1];
    } else {
      // close enough to just ride with the player
      const side = (this.slot % 2 ? 1 : -1) * (2.4 + (this.slot >> 1) * 1.8);
      const back = 4 + this.slot * 1.6;
      wantX = target.x + Math.sin(target.yaw) * -back + Math.cos(target.yaw) * side;
      wantZ = target.z + Math.cos(target.yaw) * -back - Math.sin(target.yaw) * side;
    }

    const want = Math.atan2(wantX - b.pos.x, wantZ - b.pos.z);
    const err = angleDelta(b.yaw, want);
    const wobble = Math.sin(t * (1.3 + this.slot * 0.31) + this.slot) * (1 - this.skill) * 0.12;
    const steer = clamp(err * (2.0 + this.skill * 1.6) + wobble, -1, 1);

    /* Throttle: match the player's pace, back off in corners, and shut off
       entirely if they are about to run into the back of them.

       Riders also get a catch-up allowance the further back they are.
       Without it a pack simply evaporates the first time you open the
       throttle, which is the opposite of what a ride-out is for. */
    const chase = 1 + clamp((toPlayer - 30) / 90, 0, 1) * 0.45;
    const targetSpeed = Math.max(9, Math.abs(target.speed) * (0.96 + this.skill * 0.12) * chase);
    const corner = 1 - clamp(Math.abs(err) * 1.1, 0, 0.72);
    let throttle = clamp((targetSpeed * corner - Math.abs(b.speed)) * 0.5, -0.5, 1);
    if (toPlayer < 5.5 && Math.abs(b.speed) > Math.abs(target.speed)) throttle = -0.3;

    // showing off, but only with room to spare and nobody to catch
    this.wheelieT -= dt;
    if (this.wheelieT < -4 && toPlayer < 40 && Math.abs(err) < 0.10 &&
        Math.abs(b.speed) > 8 && Math.random() < this.flair * dt * 1.2) {
      this.wheelieT = 1.0 + Math.random() * 1.8;
    }
    const wheelie = this.wheelieT > 0 && Math.abs(err) < 0.25 && toPlayer < 50;

    b.step(dt, { throttle, steer, wheelie, brake: false, boost: false }, 1);

    this._sync(dt);
  }

  /** same pose pipeline the local player uses */
  _sync(dt) {
    const b = this.body;
    this.model.position.set(b.pos.x, b.pos.y, b.pos.z);
    this.model.rotation.order = 'YXZ';
    this.model.rotation.y = b.yaw;
    const n = b.groundNormal;
    if (b.grounded) {
      const hx = Math.sin(b.yaw), hz = Math.cos(b.yaw);
      this.model.rotation.x = damp(this.model.rotation.x,
        Math.asin(clamp(-(n.x * hx + n.z * hz), -0.8, 0.8)), 12, dt);
      this.model.rotation.z = damp(this.model.rotation.z,
        Math.asin(clamp(-(n.x * hz - n.z * hx), -0.8, 0.8)), 12, dt);
    } else {
      this.model.rotation.x = damp(this.model.rotation.x, 0, 3, dt);
      this.model.rotation.z = damp(this.model.rotation.z, 0, 3, dt);
    }
    const p = this._pose;
    p.lean = b.lean; p.pitch = b.pitch; p.steer = -b.steer;
    p.spin = b.spin; p.susComp = b.susComp; p.riderLean = b.riderLean; p.look = 0;
    poseVehicle(this.model, p);

    // a name tag on a rider you are overlapping just blocks the view
    if (this.label && this._camDist != null) {
      const m = this.label.material;
      m.opacity = clamp((this._camDist - 3.5) / 5, 0, 1);
      this.label.visible = m.opacity > 0.02;
    }
  }
}

/* ============================================================ */
export class BotPack {
  constructor(game) {
    this.game = game;
    this.bots = [];
    this.active = false;
  }

  get count() { return this.bots.length; }

  /** start a ride-out with `n` AI riders */
  start(n = 4, opts = {}) {
    this.stop();
    const g = this.game;
    const names = NAMES.slice().sort(() => Math.random() - 0.5);
    let rides = (opts.rides && opts.rides.length) ? opts.rides : this._ridesFor(g.player.stats);
    n = clamp(n | 0, 1, 8);
    for (let i = 0; i < n; i++) {
      const bot = new Bot(g.world, g.engine.scene, {
        name: names[i % names.length],
        colorIdx: (i + 1) % RIDER_COLORS.length,
        preset: rides[(Math.random() * rides.length) | 0],
        skill: 0.45 + Math.random() * 0.5,
        flair: 0.15 + Math.random() * 0.5,
        slot: i,
      });
      const b = g.player.body;
      bot.placeNear(b.pos.x, b.pos.z, b.yaw);
      this.bots.push(bot);
    }
    this.active = true;
    return this.bots.length;
  }

  /** machines that can actually live with what the player is riding */
  _ridesFor(playerStats) {
    const mine = playerStats?.topSpeedMph || 25;
    const scored = [];
    for (const id of RIDES) {
      try {
        const st = computeStats(buildFromPreset(id), { riders: 1 });
        if (!Number.isFinite(st.topSpeedMph)) continue;
        scored.push({ id, top: st.topSpeedMph });
      } catch (e) { /* a preset that will not build is simply not offered */ }
    }
    // anything from a bit slower than the player up to comfortably faster
    let ok = scored.filter((r) => r.top >= mine * 0.92 && r.top <= mine * 2.2);
    if (!ok.length) {
      // player is on something exotic: send the fastest things available
      scored.sort((a, b) => b.top - a.top);
      ok = scored.slice(0, 3);
    }
    return ok.map((r) => r.id);
  }

  stop() {
    for (const b of this.bots) b.dispose();
    this.bots.length = 0;
    this.active = false;
  }

  update(dt, playerBody, t) {
    if (!this.active) return;
    const target = {
      x: playerBody.pos.x, z: playerBody.pos.z,
      yaw: playerBody.yaw, speed: playerBody.speed,
    };
    for (const b of this.bots) b.update(dt, target, t, this.game.engine.camera.position);
  }

  /** how many bots are riding close enough to count as a pack */
  nearCount(pos, radius = 45) {
    let n = 0;
    for (const b of this.bots) {
      if (Math.hypot(b.body.pos.x - pos.x, b.body.pos.z - pos.z) < radius) n++;
    }
    return n;
  }

  blips() {
    return this.bots.map((b) => ({ x: b.body.pos.x, z: b.body.pos.z, c: '#a06bff' }));
  }
}
