/* ============================================================
   build.js — compatibility rules and derived performance

   A "build" is just { frame, motor, battery, ... } of part ids.
   validate() explains what will break; stats() turns it into the
   numbers the physics and the UI both use.
   ============================================================ */
import { getPart, SLOTS, PRESET_BY_ID, TIERS } from './parts.js';
import { clamp, lerp, MS_TO_MPH } from '../core/util.js';

const RHO = 1.225;        // air density kg/m³
const G = 9.81;
export const RIDER_KG = 78;

/* frontal-area baseline by frame style (m²) */
const CDA_BASE = {
  city: 0.66, bmx: 0.62, moto: 0.60, fat: 0.68, dh: 0.58,
  race: 0.50, hyper: 0.42, nuclear: 0.45,
  scoot: 0.70, 'scoot-perf': 0.64,
};

export function emptyBuild() {
  const b = {};
  for (const s of SLOTS) b[s.id] = null;
  return b;
}

export function buildFromPreset(presetId) {
  const p = PRESET_BY_ID.get(presetId);
  if (!p) return emptyBuild();
  return { ...emptyBuild(), ...p.parts };
}

export function buildParts(build) {
  const out = {};
  for (const s of SLOTS) out[s.id] = build[s.id] ? getPart(build[s.id]) : null;
  return out;
}

export function buildValue(build) {
  let v = 0;
  for (const s of SLOTS) {
    const p = build[s.id] ? getPart(build[s.id]) : null;
    if (p) v += p.price;
  }
  return v;
}

export function buildTier(build) {
  let best = 'budget';
  for (const s of SLOTS) {
    const p = build[s.id] ? getPart(build[s.id]) : null;
    if (p && TIERS[p.tier] && TIERS[p.tier].order > TIERS[best].order) best = p.tier;
  }
  return best;
}

/* ============================================================
   VALIDATION
   ============================================================ */

/**
 * @returns {{ok:boolean, errors:Array, warnings:Array, notes:Array,
 *            derate:number, blowoutRisk:number, fireRisk:number}}
 */
export function validate(build) {
  const P = buildParts(build);
  const errors = [], warnings = [], notes = [];
  let derate = 1, blowoutRisk = 0, fireRisk = 0;

  const { frame, motor, battery, controller, tires, brakes, suspension, cockpit, aero } = P;

  for (const s of SLOTS) {
    if (s.req && !P[s.id]) errors.push({ slot: s.id, msg: `No ${s.name.toLowerCase()} fitted.` });
  }
  if (!frame) return { ok: false, errors, warnings, notes, derate, blowoutRisk, fireRisk, parts: P };

  /* ---- motor ---- */
  if (motor) {
    if (!frame.mounts.includes(motor.mount)) {
      errors.push({ slot: 'motor', msg: `${motor.name} is a ${motor.mount} motor — the ${frame.name} only takes ${frame.mounts.join(', ')}.` });
    }
    if (motor.peakW > frame.maxMotorW) {
      const over = Math.round((motor.peakW / frame.maxMotorW - 1) * 100);
      if (motor.peakW > frame.maxMotorW * 1.6) {
        errors.push({ slot: 'motor', msg: `${(motor.peakW / 1000).toFixed(1)} kW peak into a frame rated for ${(frame.maxMotorW / 1000).toFixed(1)} kW — ${over}% over. The dropouts will tear out.` });
      } else {
        warnings.push({ slot: 'motor', msg: `${over}% over the frame's power rating. Expect flex, cracked welds and poor handling.` });
        notes.push('Frame over-power: handling and durability reduced.');
      }
    }
  }

  /* ---- pack voltage ---- */
  if (battery && motor) {
    if (battery.volts < motor.voltMin) {
      errors.push({ slot: 'battery', msg: `${battery.volts}V pack is below the ${motor.name}'s ${motor.voltMin}V minimum — it will barely turn.` });
    } else if (battery.volts > motor.voltMax) {
      errors.push({ slot: 'battery', msg: `${battery.volts}V into a motor rated to ${motor.voltMax}V. The windings will cook.` });
    }
  }
  if (battery && controller) {
    if (battery.volts < controller.voltMin) {
      errors.push({ slot: 'controller', msg: `${controller.name} needs at least ${controller.voltMin}V — the pack is ${battery.volts}V.` });
    } else if (battery.volts > controller.voltMax) {
      errors.push({ slot: 'controller', msg: `${battery.volts}V will pop the ${controller.name} (rated ${controller.voltMax}V). Magic smoke.` });
    }
  }
  if (battery && battery.volts > frame.maxVolts) {
    warnings.push({ slot: 'battery', msg: `${battery.volts}V on a frame insulated for ${frame.maxVolts}V. Legally and electrically questionable.` });
  }

  /* ---- battery bay ---- */
  if (battery) {
    if (battery.wh > frame.bayWh) {
      const over = Math.round((battery.wh / frame.bayWh - 1) * 100);
      if (battery.wh > frame.bayWh * 1.35) {
        errors.push({ slot: 'battery', msg: `${battery.wh} Wh will not fit a ${frame.bayWh} Wh bay (${over}% over). Nowhere to bolt it.` });
      } else {
        warnings.push({ slot: 'battery', msg: `Pack is ${over}% bigger than the bay — it'll hang off the frame and raise the centre of gravity.` });
      }
    }
  }

  /* ---- current path ---- */
  if (motor && controller) {
    if (controller.maxAmps < motor.ampsMax * 0.45) {
      errors.push({ slot: 'controller', msg: `${controller.maxAmps}A cannot feed a motor that wants ${motor.ampsMax}A. It will trip instantly.` });
    } else if (controller.maxAmps < motor.ampsMax) {
      const pct = Math.round((controller.maxAmps / motor.ampsMax) * 100);
      derate *= controller.maxAmps / motor.ampsMax;
      warnings.push({ slot: 'controller', msg: `Controller only delivers ${pct}% of the motor's ${motor.ampsMax}A. You'll get ${pct}% of the punch.` });
    }
  }
  if (battery && controller) {
    if (battery.maxA < controller.maxAmps * 0.5) {
      errors.push({ slot: 'battery', msg: `Pack is rated ${battery.maxA}A continuous against a ${controller.maxAmps}A controller. It will sag, overheat and quite possibly vent.` });
      fireRisk = 0.9;
    } else if (battery.maxA < controller.maxAmps) {
      const pct = Math.round((battery.maxA / controller.maxAmps) * 100);
      warnings.push({ slot: 'battery', msg: `Pack supplies only ${pct}% of what the controller will ask for. Expect voltage sag under load.` });
      fireRisk = Math.max(fireRisk, 0.3 * (1 - battery.maxA / controller.maxAmps));
    }
  }

  /* ---- wheels & tyres ---- */
  if (tires) {
    if (tires.size !== frame.wheelSize) {
      errors.push({ slot: 'tires', msg: `${tires.size}" tyres on a ${frame.wheelSize}" frame. They simply do not go on.` });
    }
    if (tires.width > frame.maxTireW) {
      const over = tires.width - frame.maxTireW;
      if (over > 25) errors.push({ slot: 'tires', msg: `${tires.width} mm tyre in a ${frame.maxTireW} mm gap. It fouls the stays.` });
      else warnings.push({ slot: 'tires', msg: `${tires.width} mm tyre is ${over} mm wider than the frame likes — it will rub under load.` });
    }
  }

  /* ---- fitment classes ---- */
  if (suspension && suspension.fits && !suspension.fits.includes(frame.cls)) {
    errors.push({ slot: 'suspension', msg: `${suspension.name} does not fit a ${frame.cls}.` });
  }
  if (cockpit && cockpit.fits && !cockpit.fits.includes(frame.cls)) {
    errors.push({ slot: 'cockpit', msg: `${cockpit.name} does not fit a ${frame.cls}.` });
  }
  if (aero && aero.fits && !aero.fits.includes(frame.cls)) {
    errors.push({ slot: 'aero', msg: `${aero.name} does not fit a ${frame.cls}.` });
  }

  /* ---- mass ---- */
  const dry = dryMass(P);
  if (dry + RIDER_KG > frame.maxLoadKg) {
    const over = Math.round(dry + RIDER_KG - frame.maxLoadKg);
    if (dry + RIDER_KG > frame.maxLoadKg * 1.3) {
      errors.push({ slot: 'frame', msg: `${Math.round(dry)} kg of parts plus a rider is ${over} kg over the frame's ${frame.maxLoadKg} kg limit.` });
    } else {
      warnings.push({ slot: 'frame', msg: `${over} kg over the frame's rated load. It'll hold, but it won't like it.` });
    }
  }

  /* ---- the tyre speed rating check needs the speed, so do it last ---- */
  const est = rawTopSpeed(P, dry + RIDER_KG, derate);
  if (tires) {
    const ratingMs = tires.speedMph / MS_TO_MPH;
    if (est.vUnlimited > ratingMs * 1.02) {
      const pct = est.vUnlimited / ratingMs;
      blowoutRisk = clamp((pct - 1) * 1.6, 0, 1);
      if (pct > 1.35) {
        warnings.push({ slot: 'tires', msg: `This build wants ${Math.round(est.vUnlimited * MS_TO_MPH)} mph but the tyres are rated to ${tires.speedMph} mph. They WILL let go. Speed is capped and every fast run risks a blowout.` });
      } else {
        warnings.push({ slot: 'tires', msg: `Tyres rated ${tires.speedMph} mph, build wants ${Math.round(est.vUnlimited * MS_TO_MPH)} mph. Capped at the tyre rating — fit better rubber to use the power.` });
      }
    }
  }

  /* ---- brakes vs speed ---- */
  if (brakes && est.v > 30) {
    const need = est.v / 9;    // crude "can it stop from top speed" heuristic
    if (brakes.force < need) {
      warnings.push({ slot: 'brakes', msg: `${brakes.name} will not stop this from ${Math.round(est.v * MS_TO_MPH)} mph. Braking distance is going to be a problem.` });
    }
  }

  /* ---- friendly notes ---- */
  if (motor && controller && battery && !errors.length) {
    const busA = Math.min(controller.maxAmps, battery.maxA);
    notes.push(`Bus: ${battery.volts}V × ${busA}A = ${(battery.volts * busA / 1000).toFixed(1)} kW electrical.`);
  }
  if (aero && aero.cdMul < 0.6) notes.push('Full fairing: much faster in a straight line, twitchy in crosswinds.');
  if (frame.seats < 2) notes.push('Single-seat frame — no passenger.');

  return { ok: errors.length === 0, errors, warnings, notes, derate, blowoutRisk, fireRisk, parts: P };
}

/* ============================================================
   PHYSICS-DERIVED STATS
   ============================================================ */
function dryMass(P) {
  let m = 2.5;  // cables, bolts, bodge
  for (const s of SLOTS) { const p = P[s.id]; if (p) m += p.weight || 0; }
  return m;
}

function wheelRadius(P) {
  const size = P.tires ? P.tires.size : (P.frame ? P.frame.wheelSize : 26);
  return (size * 0.0254) / 2;
}

function cdA(P) {
  const base = CDA_BASE[P.frame?.style] ?? 0.62;
  return base * (P.aero ? P.aero.cdMul : 1);
}

/** solve  Pwheel = ½ρ·CdA·v³ + Crr·m·g·v  for v */
function solveTopSpeed(Pw, area, crr, m) {
  if (Pw <= 0) return 0;
  const a = 0.5 * RHO * area;
  const b = crr * m * G;
  let v = Math.cbrt(Pw / Math.max(a, 1e-6));
  for (let i = 0; i < 40; i++) {
    const f = a * v * v * v + b * v - Pw;
    const df = 3 * a * v * v + b;
    const nv = v - f / df;
    if (!isFinite(nv) || nv <= 0) break;
    if (Math.abs(nv - v) < 1e-4) { v = nv; break; }
    v = nv;
  }
  return Math.max(0, v);
}

function rawTopSpeed(P, mass, derate = 1) {
  const { motor, battery, controller, tires } = P;
  if (!motor || !battery || !controller) return { v: 0, vUnlimited: 0, limit: 'incomplete' };

  const busA = Math.min(controller.maxAmps, battery.maxA);
  const pElecCont = Math.min(motor.powerW, battery.volts * busA);
  const pWheel = pElecCont * motor.eff * controller.eff * 0.97 * derate;

  const r = wheelRadius(P);
  const gear = motor.gear || 1;
  // a motor's kV is fixed, so no-load rpm tracks pack voltage: running a
  // 48V motor on a 72V pack really does raise the ceiling (and the risk).
  const voltRatio = clamp(battery.volts / motor.voltMax, 0.35, 2.2);
  const vMech = ((motor.rpmMax * voltRatio / gear) / 60) * (Math.PI * 2 * r);

  const crr = (tires ? tires.roll : 0.012) + 0.002;
  const vAero = solveTopSpeed(pWheel, cdA(P), crr, mass);

  const vUnlimited = Math.min(vAero, vMech);
  const vTire = tires ? tires.speedMph / MS_TO_MPH : 1e9;
  const v = Math.min(vUnlimited, vTire);

  let limit = 'aero';
  if (vMech < vAero) limit = 'motor rpm';
  if (vTire < vUnlimited) limit = 'tyre rating';
  return { v, vUnlimited, vAero, vMech, vTire, limit, pWheel };
}

/**
 * Full stat block. Safe to call with an invalid build (it degrades
 * rather than throwing) so the builder UI can preview anything.
 */
export function stats(build, opts = {}) {
  const riders = opts.riders ?? 1;
  const P = buildParts(build);
  const v = validate(build);
  const frame = P.frame;

  const dry = dryMass(P);
  const mass = dry + RIDER_KG * riders;
  const r = wheelRadius(P);

  const top = rawTopSpeed(P, mass, v.derate);

  /* --- torque / acceleration --- */
  const gear = P.motor ? (P.motor.gear || 1) : 1;
  const wheelTorque = P.motor ? P.motor.torqueNm * gear * 0.97 * v.derate : 0;
  const fTorque = wheelTorque / Math.max(r, 0.05);

  const busA = P.controller && P.battery ? Math.min(P.controller.maxAmps, P.battery.maxA) : 0;
  const pPeak = P.motor && P.battery
    ? Math.min(P.motor.peakW, P.battery.volts * busA * 1.15) * P.motor.eff * (P.controller?.eff ?? 0.9) * v.derate
    : 0;

  const grip = (P.tires ? P.tires.grip : 0.8) * (1 + (P.suspension ? P.suspension.damp * 0.10 : 0));
  const fGrip = grip * mass * G * 0.94;
  const fLaunch = Math.min(fTorque, fGrip);
  const a0 = fLaunch / mass;

  // rough 0-30 mph / 0-60 mph including the power-limited region
  const t30 = timeToSpeed(13.41, mass, fLaunch, pPeak, cdA(P), (P.tires?.roll ?? 0.012), top.v);
  const t60 = timeToSpeed(26.82, mass, fLaunch, pPeak, cdA(P), (P.tires?.roll ?? 0.012), top.v);

  /* --- range --- */
  const wh = P.battery ? P.battery.wh : 0;
  const selfFuelled = !!P.battery && (P.battery.chem === 'Radioisotope' || P.battery.chem === 'Aneutronic fusion');
  const vCruise = clamp(top.v * 0.62, 4, 38);
  const pCruise = (0.5 * RHO * cdA(P) * vCruise ** 3 + (P.tires?.roll ?? 0.012) * mass * G * vCruise)
                  / ((P.motor?.eff ?? 0.8) * (P.controller?.eff ?? 0.9));
  // 0.72 accounts for stopping, starting, hills and generally not cruising
  const rangeKm = selfFuelled ? Infinity : (pCruise > 1 ? (wh / pCruise) * vCruise * 3.6 * 0.72 : 0);

  /* --- handling / stability / wheelie --- */
  const stiff = frame ? frame.stiffness : 0.5;
  const control = P.cockpit ? P.cockpit.control : 1;
  const damp = P.suspension ? P.suspension.damp : 0.15;
  const overPower = frame && P.motor ? clamp(P.motor.peakW / frame.maxMotorW, 0, 3) : 0;
  const overPenalty = overPower > 1 ? (overPower - 1) * 0.28 : 0;

  const handling = clamp(
    (stiff * 0.34 + grip * 0.32 + control * 0.20 + damp * 0.14)
    * (1 - clamp((mass - 100) / 620, 0, 0.45))
    * (1 - overPenalty) * (frame ? clamp(1.28 - frame.wheelbase * 0.22, 0.7, 1.12) : 1),
    0.05, 1);

  const stability = clamp(
    stiff * 0.34 + clamp(frame ? (frame.wheelbase - 0.85) / 0.9 : 0.3, 0, 1) * 0.26
    + clamp(mass / 320, 0, 1) * 0.18 + (1 - (P.aero ? P.aero.cdMul : 1)) * 0.12 + damp * 0.10,
    0.05, 1);

  /* Wheelie ease, 0..2 where ~1.0 is "comes up when you ask".
     A real 750 W hub motor cannot power-wheelie from rest — riders do it
     with a yank on the bars and a weight shift — so body english is the
     base term and motor torque is the multiplier on top of it. */
  const cogH = frame ? frame.cogH : 0.55;
  const wb = frame ? frame.wheelbase : 1.1;
  const torqueTerm = clamp(fTorque / (mass * G * 0.5), 0, 1.4);
  const geom = clamp(cogH / (wb * 0.42), 0.7, 1.45);
  const wheelieEase = clamp(
    (0.35 + torqueTerm * 0.75) * (P.cockpit ? P.cockpit.wheelie : 1)
    * geom * (frame?.cls === 'scooter' ? 0.72 : 1),
    0.12, 2);

  const brakeDecel = (P.brakes ? P.brakes.force : 4) * (grip / 0.95);

  const durability = clamp(
    0.4 + stiff * 0.4 - overPenalty * 0.8 - v.blowoutRisk * 0.3 - v.fireRisk * 0.3
    + (buildTier(build) === 'nuclear' ? 0.2 : 0), 0.05, 1);

  return {
    valid: v.ok,
    validation: v,
    parts: P,
    cls: frame ? frame.cls : 'bike',
    style: frame ? frame.style : 'bmx',
    seats: frame ? frame.seats : 1,

    dryMassKg: dry,
    massKg: mass,
    wheelR: r,
    wheelbase: wb,
    cogH,
    cdA: cdA(P),

    volts: P.battery ? P.battery.volts : 0,
    amps: busA,
    wh,
    powerW: top.pWheel || 0,
    peakW: pPeak,
    torqueNm: wheelTorque,

    topSpeedMs: top.v,
    topSpeedMph: top.v * MS_TO_MPH,
    topLimit: top.limit,
    uncappedMph: (top.vUnlimited || 0) * MS_TO_MPH,

    accelMs2: a0,
    t30, t60,
    rangeKm, selfFuelled,

    grip,
    roll: (P.tires ? P.tires.roll : 0.012),
    brakeDecel,
    handling, stability, wheelieEase, durability,
    blowoutRisk: v.blowoutRisk,
    fireRisk: v.fireRisk,

    paint: P.paint || null,
    value: buildValue(build),
    tier: buildTier(build),
  };
}

/** crude numerical integration for 0→target time */
function timeToSpeed(target, m, fMax, pPeak, area, crr, vTop) {
  if (vTop < target * 0.995) return null;
  let v = 0, t = 0;
  const dt = 0.02;
  for (let i = 0; i < 6000 && v < target; i++) {
    const fPower = v > 0.5 ? pPeak / v : Infinity;
    const f = Math.min(fMax, fPower) - 0.5 * RHO * area * v * v - crr * m * G;
    if (f <= 0) return null;
    v += (f / m) * dt;
    t += dt;
  }
  return v >= target ? t : null;
}

/* ============================================================
   naming helper for player-built machines
   ============================================================ */
const ADJ = ['Feral', 'Midnight', 'Copper', 'Vex', 'Static', 'Hollow', 'Rogue', 'Quiet', 'Bright', 'Iron', 'Salt', 'Neon', 'Dust', 'Grim', 'Lucky'];
const NOUN = ['Whip', 'Sled', 'Bolt', 'Runner', 'Comet', 'Jackal', 'Spark', 'Ghost', 'Rocket', 'Hornet', 'Mule', 'Dart', 'Shard', 'Pigeon', 'Wolf'];

export function autoName(build, rnd = Math.random) {
  const f = build.frame ? getPart(build.frame) : null;
  const a = ADJ[Math.floor(rnd() * ADJ.length)];
  const n = NOUN[Math.floor(rnd() * NOUN.length)];
  return `${a} ${n}` + (f ? ` ${f.cls === 'scooter' ? 'Deck' : 'BX'}` : '');
}

export { cdA as buildCdA, dryMass, wheelRadius, CDA_BASE };
