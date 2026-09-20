/* ============================================================
   player.js — local rider and networked remote riders
   ============================================================ */
import * as THREE from 'three';
import { VehicleBody } from '../vehicle/physics.js';
import { buildVehicleModel, poseVehicle, setRiders, disposeModel } from '../vehicle/model.js';
import { stats as computeStats } from '../vehicle/build.js';
import { makeLabel } from '../world/world.js';
import { clamp, damp, lerp, angleDelta } from '../core/util.js';

export const RIDER_COLORS = [0x39e6a4, 0x16c2ff, 0xa06bff, 0xffb020, 0xff4d5e, 0x9fe870];

/* ============================================================
   LOCAL PLAYER
   ============================================================ */
export class Player {
  constructor(world, scene, build, opts = {}) {
    this.world = world;
    this.scene = scene;
    this.name = opts.name || 'Rider';
    this.colorIdx = opts.colorIdx ?? 0;
    this.isLocal = true;

    this.stats = computeStats(build, { riders: 1 });
    this.body = new VehicleBody(this.stats, world);
    this.model = buildVehicleModel(this.stats);
    scene.add(this.model);
    setRiders(this.model, true, false);

    this.passenger = null;        // remote/local player riding with us
    this.ridingWith = null;       // host we are a passenger on
    this.stowed = false;          // our vehicle is packed away
    this.build = { ...build };

    this._pose = { lean: 0, pitch: 0, steer: 0, spin: 0, susComp: 0, riderLean: 0, look: 0 };
  }

  setBuild(build, keepPlace = true) {
    const p = { x: this.body.pos.x, z: this.body.pos.z, yaw: this.body.yaw, charge: this.body.charge };
    this.build = { ...build };
    this.stats = computeStats(build, { riders: this.passenger ? 2 : 1 });
    this.body.setStats(this.stats);
    this.scene.remove(this.model);
    disposeModel(this.model);
    this.model = buildVehicleModel(this.stats);
    this.scene.add(this.model);
    setRiders(this.model, !this.stowed, !!this.passenger);
    if (keepPlace) { this.body.placeAt(p.x, p.z, p.yaw); this.body.charge = p.charge; }
  }

  refreshRiderCount() {
    const riders = this.passenger ? 2 : 1;
    this.stats = computeStats(this.build, { riders });
    this.body.setStats(this.stats);
    setRiders(this.model, !this.stowed, !!this.passenger);
  }

  setStowed(on) {
    this.stowed = on;
    this.model.visible = !on;
  }

  update(dt, inp) {
    if (this.ridingWith) {
      // we are a passenger — our transform comes from the host
      this.body.speed = this.ridingWith.body.speed;
      return;
    }
    this.body.step(dt, inp, this.passenger ? 2 : 1);
    this.syncModel(dt, inp);
  }

  syncModel(dt, inp = {}) {
    const b = this.body;
    this.model.position.set(b.pos.x, b.pos.y, b.pos.z);
    this.model.rotation.y = b.yaw;

    // align the model to the ground slope when planted
    const n = b.groundNormal;
    if (b.grounded) {
      const hx = Math.sin(b.yaw), hz = Math.cos(b.yaw);
      const slopePitch = Math.asin(clamp(-(n.x * hx + n.z * hz), -0.8, 0.8));
      const rollAxis = Math.asin(clamp(-(n.x * hz - n.z * hx), -0.8, 0.8));
      this.model.rotation.x = damp(this.model.rotation.x, slopePitch, 12, dt);
      this.model.rotation.z = damp(this.model.rotation.z, rollAxis, 12, dt);
      this.model.rotation.order = 'YXZ';
    } else {
      this.model.rotation.x = damp(this.model.rotation.x, 0, 3, dt);
      this.model.rotation.z = damp(this.model.rotation.z, 0, 3, dt);
    }

    const p = this._pose;
    p.lean = b.lean + (b.crashed ? 0 : 0);
    p.pitch = b.pitch;
    p.steer = -b.steer;
    p.spin = b.spin;
    p.susComp = b.susComp;
    p.riderLean = b.riderLean;
    p.look = inp.lookBehind ? 1 : 0;
    poseVehicle(this.model, p);
  }

  /** network snapshot */
  snapshot() {
    const b = this.body;
    return {
      x: +b.pos.x.toFixed(2), y: +b.pos.y.toFixed(2), z: +b.pos.z.toFixed(2),
      yw: +b.yaw.toFixed(3), sp: +b.speed.toFixed(2),
      pt: +b.pitch.toFixed(3), ln: +b.lean.toFixed(3), st: +b.steer.toFixed(3),
      sn: +(b.spin % (Math.PI * 2)).toFixed(2),
      cr: b.crashed ? 1 : 0, gr: b.grounded ? 1 : 0,
      sv: b.susComp ? +b.susComp.toFixed(3) : 0,
    };
  }

  dispose() {
    this.scene.remove(this.model);
    disposeModel(this.model);
  }
}

/* ============================================================
   REMOTE PLAYER — interpolated
   ============================================================ */
export class RemotePlayer {
  constructor(world, scene, info) {
    this.world = world;
    this.scene = scene;
    this.id = info.id;
    this.name = info.name || 'Rider';
    this.colorIdx = info.colorIdx ?? 1;
    this.isLocal = false;
    this.build = info.build;
    this.stats = computeStats(info.build, { riders: 1 });
    this.model = buildVehicleModel(this.stats);
    scene.add(this.model);
    setRiders(this.model, true, false);

    this.label = makeLabel(this.name, RIDER_COLORS[this.colorIdx % RIDER_COLORS.length], 0.85);
    this.label.position.y = 2.3;
    this.model.add(this.label);

    this.cur = { x: 0, y: 0, z: 0, yw: 0, pt: 0, ln: 0, st: 0, sn: 0, sv: 0, sp: 0 };
    this.target = { ...this.cur };
    this.prev = { ...this.cur };
    this.crashed = false;
    this.passengerOf = null;      // id of the host we are riding
    this.hasPassenger = false;
    this.lastSeen = performance.now();
    this._pose = {};
  }

  setBuild(build) {
    if (JSON.stringify(build) === JSON.stringify(this.build)) return;
    this.build = build;
    this.stats = computeStats(build, { riders: 1 });
    const old = this.model;
    this.model = buildVehicleModel(this.stats);
    this.model.position.copy(old.position);
    this.model.rotation.copy(old.rotation);
    this.model.add(this.label);
    this.scene.add(this.model);
    this.scene.remove(old);
    disposeModel(old);
    setRiders(this.model, true, this.hasPassenger);
  }

  applySnapshot(s) {
    this.prev = { ...this.cur };
    Object.assign(this.target, s);
    this.crashed = !!s.cr;
    this.lastSeen = performance.now();
  }

  setPassenger(on) {
    if (this.hasPassenger === on) return;
    this.hasPassenger = on;
    setRiders(this.model, !this.passengerOf, on);
  }

  setHidden(on) {
    this.model.visible = !on;
  }

  update(dt) {
    const c = this.cur, t = this.target;
    const k = 11;
    c.x = damp(c.x, t.x, k, dt);
    c.y = damp(c.y, t.y, k, dt);
    c.z = damp(c.z, t.z, k, dt);
    c.yw += angleDelta(c.yw, t.yw) * clamp(k * dt, 0, 1);
    c.pt = damp(c.pt, t.pt, k, dt);
    c.ln = damp(c.ln, t.ln, k, dt);
    c.st = damp(c.st, t.st, k, dt);
    c.sv = damp(c.sv, t.sv ?? 0, k, dt);
    c.sp = damp(c.sp, t.sp ?? 0, 6, dt);
    c.sn += (c.sp / Math.max(this.stats.wheelR, 0.05)) * dt;

    this.model.position.set(c.x, c.y, c.z);
    this.model.rotation.y = c.yw;
    const p = this._pose;
    p.lean = c.ln + (this.crashed ? 1.1 : 0);
    p.pitch = c.pt; p.steer = -c.st; p.spin = c.sn; p.susComp = c.sv;
    p.riderLean = clamp(c.pt / 0.7, 0, 1);
    poseVehicle(this.model, p);
  }

  dispose() {
    this.scene.remove(this.model);
    disposeModel(this.model);
    this.label.material.map?.dispose();
    this.label.material.dispose();
  }
}
