/* ============================================================
   physics.js — the ride model

   Arcade-flavoured but built on the real numbers from build.js:
   power-limited thrust, aero drag, rolling resistance, slope,
   traction-limited launch, and a wheelie that is a genuine
   balance problem rather than an animation.
   ============================================================ */
import * as THREE from 'three';
import { clamp, lerp, damp, angleDelta, MS_TO_MPH } from '../core/util.js';
import { SURF } from '../world/layout.js';

const G = 9.81;
const RHO = 1.225;

/* ------------------------------------------------------------------
   Wheelie tuning.

   The rider is modelled as a controller, not as a fixed torque: they
   pick a target angle with the throttle and track it with whatever
   authority the build gives them (wheelieEase). Gravity pulls the
   nose down below the balance point and shoves it over above it, and
   the rider's ability to SAVE a wheelie fades the further past
   balance it goes — so a low wheelie is easy and safe, and a deep one
   pays far better but wobbles and will loop you if you get greedy.
   ------------------------------------------------------------------ */
const GRAV_K = 6.2;      // restoring angular accel at pitch 0 (rad/s²)
const PULL_K = 11.0;     // rider authority multiplier on wheelieEase
const LEAN_K = 8.0;      // lean-forward / catch authority
const P_GAIN = 26;       // rider tracking stiffness
const D_GAIN = 7.5;      // rider tracking damping
const LOOP_MARGIN = 0.30;

export class VehicleBody {
  constructor(stats, world) {
    this.world = world;
    this.setStats(stats);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();     // world velocity, for airborne + collisions
    this.yaw = 0;
    this.speed = 0;                     // signed along-heading ground speed
    this.vy = 0;
    this.grounded = true;
    this.airTime = 0;
    this.lastAirTime = 0;

    this.pitch = 0;                     // wheelie angle (rad)
    this.pitchVel = 0;
    this.lean = 0;
    this.steer = 0;
    this.spin = 0;
    this.susComp = 0;
    this.riderLean = 0;

    this.charge = 1;                    // 0..1
    this.crashed = false;
    this.crashTimer = 0;
    this.crashReason = '';
    this.slipping = 0;
    this.motorLoad = 0;
    this.heat = 0;

    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.surf = null;
    this.onRamp = false;
    this.lastLandImpact = 0;
    this.distance = 0;
    this.wheelieTime = 0;
    this.wheelieDist = 0;
    this.airborneStart = 0;

    this._n = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  setStats(s) {
    this.stats = s;
    const b = s.wheelbase * 0.45;
    const h = s.cogH;
    this.cogB = b; this.cogH = h;
    this.theta0 = Math.atan2(h, b);
    this.balance = Math.PI / 2 - this.theta0;     // pitch where gravity torque is zero
    this.maxPitch = this.balance + LOOP_MARGIN;
  }

  get wh() { return this.stats.wh || 1; }
  get speedMph() { return Math.abs(this.speed) * MS_TO_MPH; }

  placeAt(x, z, yaw) {
    this.pos.set(x, this.world.groundAt(x, z), z);
    this.yaw = yaw ?? 0;
    this.speed = 0; this.vy = 0;
    this.pitch = 0; this.pitchVel = 0; this.lean = 0;
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this._lastGy = undefined;
    this._vUpS = undefined;
    this.crashed = false; this.crashTimer = 0;
  }

  forward(out) {
    return (out || this._tmp).set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /* --------------------------------------------------------
     main step
     inp = { throttle, steer, wheelie, brake, boost, leanFwd }
     -------------------------------------------------------- */
  step(dt, inp, riders = 1) {
    const w = this.world;
    const s = this.stats;

    if (this.crashed) {
      this.crashTimer -= dt;
      this.speed = damp(this.speed, 0, 6, dt);
      this.pitch = damp(this.pitch, 0, 5, dt);
      this.lean = damp(this.lean, this._crashLean || 1.2, 7, dt);
      this._integrateVertical(dt);
      this.spin += this.speed / Math.max(s.wheelR, 0.05) * dt;
      return;
    }

    const throttleIn = inp.throttle ?? 0;
    const steerIn = inp.steer ?? 0;
    const wheelieHeld = !!inp.wheelie;
    const brakeHeld = !!inp.brake;

    /* ---- ground sampling ---- */
    const gy = w.groundAt(this.pos.x, this.pos.z);
    w.groundNormal(this.pos.x, this.pos.z, this._n);
    this.groundNormal.copy(this._n);
    const sp = w.surfaceProps(this.pos.x, this.pos.z);
    this.surf = sp;

    /* Ground contact is owned by _integrateVertical(): deriving it here
       from vy as well used to treat "climbing a hill quickly" as "leaving
       the ground", which launched you off every incline. */
    if (this.grounded) {
      this.pos.y = gy;
      this.vy = 0;
      this.airTime = 0;
    } else {
      this.airTime += dt;
      if (this.pos.y <= gy) this._land(gy);
    }

    /* ---- battery ---- */
    const empty = this.charge <= 0.001;
    const chargeFade = clamp(this.charge / 0.06, 0, 1);

    /* ---- drive force ---- */
    const v = Math.abs(this.speed);
    const mass = s.massKg + (riders - 1) * 78;
    let pAvail = (inp.boost ? s.peakW : s.powerW * 1.25) * chargeFade;
    if (empty) pAvail = 0;

    const fPower = v > 0.6 ? pAvail / v : Infinity;
    const fTorqueMax = (s.torqueNm / Math.max(s.wheelR, 0.05)) * chargeFade;
    // rear-wheel load rises with wheelie angle → more grip when lofted
    const loadShift = 1 + clamp(this.pitch / Math.max(this.balance, 0.2), 0, 1) * 0.35;
    const gripMu = s.grip * sp.grip * loadShift;
    const fGrip = gripMu * mass * G * (this.grounded ? 1 : 0);

    let drive = 0;
    if (this.grounded) {
      if (throttleIn > 0) {
        drive = Math.min(fTorqueMax, fPower, fGrip) * throttleIn;
        this.slipping = fTorqueMax * throttleIn > fGrip * 1.02 ? clamp((fTorqueMax * throttleIn) / fGrip - 1, 0, 1) : 0;
      } else if (throttleIn < 0) {
        if (this.speed > 0.4) {
          drive = -Math.min(s.brakeDecel * mass, fGrip) * (-throttleIn);
        } else {
          drive = Math.max(-fTorqueMax * 0.35, -fPower) * (-throttleIn);  // reverse
        }
        this.slipping = 0;
      } else this.slipping = damp(this.slipping, 0, 6, dt);

      if (brakeHeld) {
        drive -= Math.sign(this.speed) * Math.min(s.brakeDecel * mass * 1.15, fGrip * 1.1);
        this.slipping = Math.max(this.slipping, clamp(v / 14, 0, 1) * 0.7);
      }
    }

    this.motorLoad = pAvail > 0 ? clamp(Math.abs(drive) * Math.max(v, 1) / pAvail, 0, 1) : 0;

    /* ---- resistive forces ---- */
    const fDrag = 0.5 * RHO * s.cdA * v * v;
    const fRoll = this.grounded ? (s.roll + sp.roll) * mass * G * this.groundNormal.y : 0;
    const hx = Math.sin(this.yaw), hz = Math.cos(this.yaw);
    // gravity along the heading on a slope: +ve downhill, -ve climbing.
    // (n·h) is negative when h points uphill, so this needs a PLUS sign.
    const slopeAcc = G * (this.groundNormal.x * hx + this.groundNormal.z * hz) * this.groundNormal.y;

    let acc = drive / mass
      - Math.sign(this.speed) * (fDrag + fRoll) / mass
      + (this.grounded ? slopeAcc : 0);

    // stiction: hold still only when nothing is actually trying to move us
    if (Math.abs(this.speed) < 0.05 && Math.abs(drive) + Math.abs(slopeAcc) * mass < fRoll) acc = -this.speed * 8;

    this.speed += acc * dt;

    // top speed is a real limit (tyre rating / motor rpm / drag), so hold it
    const cap = s.topSpeedMs * (inp.boost ? 1.04 : 1);
    if (this.speed > cap) this.speed = Math.min(damp(this.speed, cap, 14, dt), cap * 1.012);
    if (this.speed < -3.5) this.speed = -3.5;

    /* ---- tyre blowout risk ---- */
    if (s.blowoutRisk > 0 && this.speedMph > (s.parts.tires?.speedMph ?? 999) * 0.92) {
      // ~3%/s at maximum risk: dramatic on a wildly over-tyred build,
      // negligible on a sensible one
      if (Math.random() < s.blowoutRisk * dt * 0.03) {
        this.crash('Tyre blowout at ' + Math.round(this.speedMph) + ' mph');
        return;
      }
    }
    /* ---- electrical fire risk under sustained full load ---- */
    if (s.fireRisk > 0) {
      this.heat = clamp(this.heat + (this.motorLoad > 0.8 ? dt * 0.35 : -dt * 0.5), 0, 4);
      if (this.heat > 2.6 && Math.random() < s.fireRisk * dt * 0.05) {
        this.crash('Pack vented — battery cannot feed the controller');
        return;
      }
    }

    /* ---- steering ---- */
    const speedFactor = clamp(1 - v / (s.topSpeedMs * 0.8 + 6), 0.16, 1);
    const maxSteer = lerp(0.10, 0.62, speedFactor) * (s.handling * 0.5 + 0.6);
    this.steer = damp(this.steer, steerIn * maxSteer, 11, dt);

    const wheelieCut = 1 - clamp(this.pitch / Math.max(this.balance, 0.2), 0, 1) * 0.62;
    let turn = 0;
    if (this.grounded && v > 0.15) {
      turn = (this.speed / s.wheelbase) * Math.tan(this.steer) * wheelieCut;
      // grip-limited cornering: too much lateral demand and you slide
      const latA = Math.abs(turn * this.speed);
      const latMax = gripMu * G * 0.92;
      if (latA > latMax) {
        const over = latMax / latA;
        turn *= over;
        this.slipping = Math.max(this.slipping, clamp(1 - over, 0, 1));
      }
    } else if (!this.grounded) {
      turn = steerIn * 1.1 * dt * 30 * 0.02;   // a little air steering
    }
    this.yaw += turn * dt;

    /* ---- lean (visual + feel) ---- */
    const targetLean = clamp(-turn * v * 0.10, -0.62, 0.62) + (inp.leanFwd ? 0 : 0);
    this.lean = damp(this.lean, targetLean, 7, dt);

    /* ---- wheelie balance ---- */
    this._stepWheelie(dt, inp, acc, mass, empty);

    /* ---- integrate position ---- */
    const move = this.speed * dt;
    this.pos.x += hx * move;
    this.pos.z += hz * move;
    this.distance += Math.abs(move);
    this.spin += move / Math.max(s.wheelR, 0.05);

    this._integrateVertical(dt);
    this._collide(dt);
    this._bounds();

    /* ---- suspension visual ---- */
    const travel = (s.parts.suspension?.travel ?? 40) / 1000;
    const target = clamp(travel * (0.25 + this.lastLandImpact * 1.6), 0, travel);
    this.susComp = damp(this.susComp, target, 9, dt);
    this.lastLandImpact = damp(this.lastLandImpact, 0, 5, dt);

    /* ---- battery drain ---- */
    if (!empty) {
      const pDraw = Math.max(0, drive) * Math.max(v, 1.2) / 0.88 + (v > 1 ? 18 : 4);
      const whUsed = (pDraw * dt) / 3600;
      if (!s.selfFuelled) this.charge = clamp(this.charge - whUsed / this.wh, 0, 1);
      // a little regen under braking
      if (drive < 0 && v > 2 && !s.selfFuelled) {
        this.charge = clamp(this.charge + (-drive * v * dt * 0.10) / 3600 / this.wh, 0, 1);
      }
    }

    /* ---- wheelie bookkeeping ---- */
    if (this.isWheelieing()) {
      this.wheelieTime += dt;
      this.wheelieDist += Math.abs(move);
    } else if (this.wheelieTime > 0 && this.pitch < 0.06) {
      this.wheelieTime = 0; this.wheelieDist = 0;
    }

    /* ---- water ---- */
    if (w.inWater(this.pos.x, this.pos.z, this.pos.y)) {
      this.speed = damp(this.speed, 0, 3.5, dt);
      this._wet = (this._wet || 0) + dt;
      if (this._wet > 1.6) this.crash('Into the bay');
    } else this._wet = 0;
  }

  isWheelieing() { return this.grounded && this.pitch > 0.14 && Math.abs(this.speed) > 1.2; }

  /** 0 = flat, 1 = at the loop-out point */
  wheelieBalance() { return clamp(this.pitch / this.maxPitch, 0, 1.2); }

  _stepWheelie(dt, inp, acc, mass, empty) {
    const s = this.stats;
    const p = this.pitch;
    const assist = this.assist ?? 0;

    // gravity: restoring below the balance point, tipping you over above it
    const aGrav = -GRAV_K * (Math.cos(this.theta0 + p) / Math.cos(this.theta0));
    let a = aGrav;

    if (this.grounded) {
      // real acceleration transfers weight rearward
      a += clamp(acc, -6, 30) * (this.cogH / 0.5) * 0.42;

      if (inp.wheelie && !empty) {
        const cmd = clamp(inp.throttle, 0, 1);
        // throttle picks how high you ask for it
        const target = this.balance * (0.55 + cmd * 0.48);
        const authority = s.wheelieEase * PULL_K;

        // the higher past balance, the less the rider can do about it
        const hot = clamp((p - this.balance * 0.85) / Math.max(this.maxPitch - this.balance * 0.85, 0.05), 0, 1);
        const grip = 1 - hot * 0.55 * (1 - assist * 0.8);
        const save = LEAN_K * 1.5 * clamp(1 - hot * (1 - assist * 0.7), 0.18, 1);

        let rider = ((target - p) * P_GAIN - this.pitchVel * D_GAIN) * grip;
        rider = clamp(rider, -save, authority);
        a += rider;

        // a deep wheelie is never perfectly steady
        if (hot > 0.02) {
          this._wob = (this._wob || 0) + dt;
          const n = Math.sin(this._wob * 6.1) + Math.sin(this._wob * 9.7 + 1.7) * 0.6 + Math.sin(this._wob * 15.3) * 0.3;
          a += n * hot * 4.2 * (1 - assist * 0.72);
        }
      } else {
        this._wob = 0;
      }

      if (inp.leanFwd) a -= LEAN_K;
      if (inp.brake) a -= 6.0;
      if (inp.throttle < 0) a += inp.throttle * 4.5;
    } else {
      // in the air you set up the landing angle with throttle / brake —
      // enough authority to matter, not enough to loop yourself by accident
      a = 0;
      if (inp.throttle > 0) a += 1.6 * inp.throttle;
      if (inp.throttle < 0 || inp.brake) a -= 3.2;
      if (inp.leanFwd) a -= 3.6;
      a -= this.pitchVel * 1.25;
    }

    this.pitchVel += a * dt;
    this.pitchVel *= Math.exp(-2.6 * dt);
    this.pitch += this.pitchVel * dt;

    if (this.pitch <= 0) {
      if (this.pitchVel < -1.8 && this.grounded) this.lastLandImpact = Math.min(1, -this.pitchVel / 9);
      this.pitch = 0;
      if (this.pitchVel < 0) this.pitchVel = 0;
    }

    if (this.grounded && this.pitch > this.maxPitch) this.crash('Looped it');
    if (!this.grounded && this.pitch > this.maxPitch * 0.92) {
      this.pitch = this.maxPitch * 0.92;              // can't loop it mid-air
      if (this.pitchVel > 0) this.pitchVel = 0;
    }
    if (this.pitch > 1.45) this.pitch = 1.45;

    this.riderLean = clamp(this.pitch / Math.max(this.balance, 0.3), 0, 1) - (inp.leanFwd ? 0.6 : 0);
  }

  _integrateVertical(dt) {
    const w = this.world;
    const gy = w.groundAt(this.pos.x, this.pos.z);
    if (!this.grounded) {
      this.vy -= G * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gy) { this.pos.y = gy; this._land(gy); }
      return;
    }

    /* Grounded: follow the surface, and leave it when a ballistic arc from
       our CURRENT velocity would clear the ground a moment from now.

       The vertical velocity is measured from how far the ground actually
       moved us last frame, not from a slope sample — sampling the slope
       ahead straddles the lip of a jump and reads it as flat. */
    const v = Math.abs(this.speed);
    const dirS = this.speed < 0 ? -1 : 1;
    const hx = Math.sin(this.yaw) * dirS, hz = Math.cos(this.yaw) * dirS;

    let vUpRaw = 0;
    if (this._lastGy !== undefined && dt > 1e-5) {
      vUpRaw = clamp((gy - this._lastGy) / dt, -v - 2, v + 2);
    }
    this._lastGy = gy;
    // the heightfield is bilinear, so its slope steps at every cell edge;
    // smooth both the rate and the lookahead or the bike chatters along
    // every road as if it were a series of tiny kickers
    this._vUpS = this._vUpS === undefined ? vUpRaw : lerp(this._vUpS, vUpRaw, 1 - Math.exp(-14 * dt));
    const vUp = this._vUpS;

    const look = 0.13;
    const vHoriz = Math.sqrt(Math.max(0, v * v - vUp * vUp));
    const d1 = vHoriz * look;
    const yGround = (
      w.groundAt(this.pos.x + hx * d1 * 0.75, this.pos.z + hz * d1 * 0.75) +
      w.groundAt(this.pos.x + hx * d1, this.pos.z + hz * d1) +
      w.groundAt(this.pos.x + hx * d1 * 1.25, this.pos.z + hz * d1 * 1.25)
    ) / 3;
    const yBallistic = gy + vUp * look - 0.5 * G * look * look;

    if (v > 3 && yBallistic > yGround + 0.13) {
      this.grounded = false;
      this.airborneStart = this.pos.y;
      this.vy = clamp(vUp, -16, 26);
      this.pos.y = gy + 0.03;
      this._lastGy = undefined;
      this._vUpS = undefined;
      if (vUp > 1.5) this.speed *= 0.97;         // a lip scrubs a little speed
    } else {
      this.pos.y = gy;
      this.vy = 0;
    }
  }

  _land(gy) {
    this._lastGy = undefined;
    this._vUpS = undefined;
    const impact = clamp(-this.vy / 16, 0, 1.4);
    this.lastAirTime = this.airTime;
    this.lastLandImpact = impact;
    this.grounded = true;
    this.pos.y = gy;
    const damping = this.stats.parts.suspension?.damp ?? 0.15;

    // nose-down or way-over landings hurt
    if (impact > 0.30 + damping * 0.55) {
      if (this.pitch > this.balance + 0.12 || this.pitch < -0.1) {
        this.crash('Bad landing');
        return;
      }
      this.speed *= 1 - clamp((impact - 0.3) * 0.5, 0, 0.5);
    }
    if (impact > 0.9 && Math.random() > damping) {
      this.crash('Cased it');
      return;
    }
    this.vy = 0;
    this.onLanded && this.onLanded(impact, this.airTime);
    this.airTime = 0;
  }

  _collide(dt) {
    const w = this.world;
    const r = 0.55;
    const hit = w.collide(this.pos.x, this.pos.z, r, this.pos.y);
    if (!hit) return;
    this.pos.x += hit.nx * hit.depth;
    this.pos.z += hit.nz * hit.depth;

    const hx = Math.sin(this.yaw), hz = Math.cos(this.yaw);
    const dot = hx * hit.nx + hz * hit.nz;          // <0 means head-on
    const closing = -dot * this.speed;
    if (closing > 1) {
      const sev = closing / 12;
      if (sev > (hit.light ? 1.25 : 0.62)) {
        this.crash(hit.light ? 'Flattened a barrier' : 'Hit something solid');
      } else {
        this.speed *= clamp(1 - sev * 1.4, 0, 1);
        this.pitchVel -= sev * 4;
        this.onBump && this.onBump(sev);
      }
    } else {
      // glancing: scrub a bit of speed and slide along
      this.speed *= 1 - clamp(Math.abs(dot) * 0.45, 0, 0.4);
    }
  }

  _bounds() {
    const L = 1180;
    if (this.pos.x < -L) { this.pos.x = -L; this.speed *= 0.4; }
    if (this.pos.x > L) { this.pos.x = L; this.speed *= 0.4; }
    if (this.pos.z < -L) { this.pos.z = -L; this.speed *= 0.4; }
    if (this.pos.z > 1190) { this.pos.z = 1190; this.speed *= 0.4; }
  }

  crash(reason) {
    if (this.crashed) return;
    this.crashed = true;
    this.crashTimer = 2.0;
    this.crashReason = reason;
    this._crashLean = (Math.random() < 0.5 ? -1 : 1) * (1.0 + Math.random() * 0.5);
    this.pitchVel = 0;
    this.wheelieTime = 0; this.wheelieDist = 0;
    this.onCrash && this.onCrash(reason);
  }

  recover() {
    const spot = this.world.safeSpot(this.pos.x, this.pos.z);
    this.placeAt(spot.x, spot.z, this.yaw);
    this.crashed = false;
    this.crashTimer = 0;
  }

  /** the point a passenger / camera should track */
  seatPos(out) {
    const f = this.stats.wheelbase * 0.2;
    return out.set(
      this.pos.x + Math.sin(this.yaw) * f,
      this.pos.y + this.stats.wheelR + this.cogH * 0.8,
      this.pos.z + Math.cos(this.yaw) * f,
    );
  }
}
