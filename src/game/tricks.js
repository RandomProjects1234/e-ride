/* ============================================================
   tricks.js — wheelie / air scoring and the combo chain
   ============================================================ */
import { clamp, lerp, fmtDist } from '../core/util.js';

const BANK_DELAY = 2.6;

export class Tricks {
  constructor() {
    this.comboPts = 0;
    this.mult = 1;
    this.sinceTrick = 99;
    this.popped = false;
    this.events = [];          // {label, pts}
    this.currentWheelie = 0;
    this.bestWheelieTime = 0;
    this.bestWheelieDist = 0;
    this.bestAir = 0;
    this.sessionEarned = 0;
    this.onBank = null;        // (pts, summary) => void
    this.onEvent = null;       // (label, pts) => void
    this._airPeak = 0;
    this._wheelieHot = 0;
  }

  reset() {
    this.comboPts = 0; this.mult = 1; this.sinceTrick = 99; this.events.length = 0;
  }

  add(label, pts) {
    if (pts <= 0) return;
    this.comboPts += pts;
    this.sinceTrick = 0;
    this.popped = true;
    const e = this.events.find((x) => x.label === label);
    if (e) e.pts += pts; else this.events.push({ label, pts });
    this.onEvent && this.onEvent(label, pts);
  }

  bumpMult(by, cap = 12) {
    this.mult = clamp(this.mult + by, 1, cap);
    this.popped = true;
  }

  update(dt, body) {
    this.sinceTrick += dt;

    /* ---- wheelie accrual ---- */
    if (body.isWheelieing() && !body.crashed) {
      const bal = body.pitch / body.maxPitch;
      // sweet spot near the balance point pays far better
      const quality = 0.35 + Math.exp(-((bal - 0.76) ** 2) / 0.018) * 0.85;
      const speedBonus = clamp(Math.abs(body.speed) / 14, 0.35, 2.1);
      this.add('Wheelie', dt * 26 * quality * speedBonus);
      this.currentWheelie += dt;
      this._wheelieHot = 0.5;

      // milestones
      const t = body.wheelieTime;
      for (const m of [3, 6, 10, 15, 25, 40, 60]) {
        if (t >= m && this.currentWheelieMark !== m && (this.currentWheelieMark ?? 0) < m) {
          this.currentWheelieMark = m;
          this.bumpMult(0.5);
          this.add(`${m}s wheelie`, m * 22);
        }
      }
      if (body.wheelieTime > this.bestWheelieTime) this.bestWheelieTime = body.wheelieTime;
      if (body.wheelieDist > this.bestWheelieDist) this.bestWheelieDist = body.wheelieDist;
    } else {
      if (this.currentWheelie > 0.8) this.bumpMult(0.25);
      this.currentWheelie = 0;
      this.currentWheelieMark = 0;
      this._wheelieHot = Math.max(0, this._wheelieHot - dt);
    }

    /* ---- air ---- */
    if (!body.grounded && !body.crashed) {
      this._airPeak = Math.max(this._airPeak, body.pos.y - (body.airborneStart || body.pos.y));
    }

    /* ---- banking ---- */
    if (this.comboPts > 0 && this.sinceTrick > BANK_DELAY && body.grounded && !body.crashed) {
      this.bank();
    }
  }

  /** called by the player when a landing happens */
  onLand(airTime, impact, body) {
    if (airTime < 0.35) return;
    const h = Math.max(0, this._airPeak);
    this._airPeak = 0;
    let pts = airTime * 90 + h * 28;
    let label = 'Air';
    if (airTime > 2.6) { label = 'Huge air'; pts *= 1.5; }
    else if (airTime > 1.4) { label = 'Big air'; pts *= 1.2; }
    if (body.pitch > 0.2) { label += ' + nose-up landing'; pts *= 1.3; }
    this.add(label, pts);
    this.bumpMult(airTime > 1.4 ? 0.75 : 0.4);
    if (airTime > this.bestAir) this.bestAir = airTime;
    if (this._wheelieHot > 0) { this.add('Wheelie→air link', 140); this.bumpMult(0.5); }
  }

  onCrash() {
    const lost = this.comboPts;
    this.reset();
    return lost;
  }

  /** cash out the combo */
  bank() {
    const pts = this.comboPts * this.mult;
    const summary = {
      pts,
      mult: this.mult,
      events: this.events.slice().sort((a, b) => b.pts - a.pts),
    };
    this.reset();
    if (pts > 1) {
      this.sessionEarned += pts;
      this.onBank && this.onBank(pts, summary);
    }
    return pts;
  }
}

/** points → dollars */
export const ptsToCash = (pts) => Math.round(pts * 0.55);
