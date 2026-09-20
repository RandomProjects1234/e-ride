/* ============================================================
   hud.js — heads-up display
   ============================================================ */
import { $, clamp, fmtMoney, fmtMoneyFull, fmtDist, lerp } from '../core/util.js';
import { settings } from '../core/settings.js';
import { MS_TO_MPH, MS_TO_KMH } from '../core/util.js';
import { WORLD } from '../world/layout.js';

const SPEEDO_LEN = 245;     // stroke-dasharray length of the 270° arc

export class HUD {
  constructor(world) {
    this.world = world;
    this.el = {
      hud: $('#hud'),
      spFill: $('#sp-fill'), spNum: $('#sp-num'), spUnit: $('#sp-unit'),
      battFill: $('#batt-fill'), battPct: $('#batt-pct'),
      cash: $('#cash'), vehname: $('#vehname'), players: $('#playercount'),
      wheelie: $('#wheelie-hud'), whMarker: $('#wh-marker'), whZone: $('#wh-zone'),
      whTime: $('#wh-time'), whDist: $('#wh-dist'),
      combo: $('#combo'), comboMult: $('#combo-mult'), comboPts: $('#combo-pts'),
      toasts: $('#toast-stack'),
      quest: $('#quest-track'), qTitle: $('#qt-title'), qDesc: $('#qt-desc'),
      qReward: $('#qt-reward'), qFill: $('#qt-fill'),
      prompt: $('#prompt'),
      minimapWrap: $('#minimap-wrap'), minimap: $('#minimap'),
      passenger: $('#passenger-badge'),
    };
    this.ctx = this.el.minimap.getContext('2d');
    this._cash = 0;
    this._lastPrompt = '';
    this._fpsEl = null;
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  /* ---------------- speed + battery ---------------- */
  updateVehicle(body, stats) {
    const kmh = settings.get('units') === 'kmh';
    const v = Math.abs(body.speed) * (kmh ? MS_TO_KMH : MS_TO_MPH);
    const max = Math.max(1, stats.topSpeedMs * (kmh ? MS_TO_KMH : MS_TO_MPH));
    this.el.spNum.textContent = Math.round(v);
    this.el.spUnit.textContent = kmh ? 'km/h' : 'mph';
    const f = clamp(v / max, 0, 1.08);
    this.el.spFill.style.strokeDasharray = `${(f * SPEEDO_LEN).toFixed(1)} 327`;
    this.el.spFill.style.stroke = f > 0.94 ? '#ff4d5e' : f > 0.72 ? '#ffb020' : '#39e6a4';

    const pct = Math.round(body.charge * 100);
    this.el.battFill.style.width = clamp(body.charge * 100, 0, 100) + '%';
    this.el.battFill.style.background = body.charge < 0.12 ? '#ff4d5e' : body.charge < 0.3 ? '#ffb020' : '#39e6a4';
    this.el.battPct.textContent = stats.selfFuelled ? '∞' : pct + '%';
  }

  setVehicleName(n) { this.el.vehname.textContent = n; }

  setCash(v, animate = true) {
    if (animate && v !== this._cash) {
      this.el.cash.classList.remove('bump');
      void this.el.cash.offsetWidth;
      this.el.cash.classList.add('bump');
    }
    this._cash = v;
    this.el.cash.textContent = fmtMoney(v);
    this.el.cash.title = fmtMoneyFull(v);
  }

  setPlayers(n, connected) {
    const e = this.el.players;
    e.classList.toggle('off', !connected);
    e.textContent = connected ? `${n} riding` : 'offline';
  }

  /* ---------------- wheelie ---------------- */
  updateWheelie(body, tricks) {
    const on = body.pitch > 0.06 && !body.crashed;
    this.el.wheelie.classList.toggle('hidden', !on);
    if (!on) return;
    const bal = clamp(body.pitch / body.maxPitch, 0, 1.12);
    const sweet0 = 0.55, sweet1 = 0.92;
    this.el.whMarker.style.left = `calc(${clamp(bal, 0, 1) * 100}% - 2.5px)`;
    this.el.whZone.style.left = (sweet0 * 100) + '%';
    this.el.whZone.style.width = ((sweet1 - sweet0) * 100) + '%';
    this.el.wheelie.classList.toggle('danger', bal > 0.93);
    this.el.whTime.textContent = body.wheelieTime.toFixed(1) + 's';
    this.el.whDist.textContent = fmtDist(body.wheelieDist);
  }

  updateCombo(tricks) {
    const on = tricks.comboPts > 0;
    this.el.combo.classList.toggle('hidden', !on);
    if (!on) return;
    this.el.comboMult.textContent = 'x' + tricks.mult.toFixed(1);
    this.el.comboPts.textContent = Math.round(tricks.comboPts).toLocaleString();
    if (tricks.popped) {
      this.el.combo.classList.remove('pop');
      void this.el.combo.offsetWidth;
      this.el.combo.classList.add('pop');
      tricks.popped = false;
    }
  }

  /* ---------------- toasts ---------------- */
  toast(text, kind = '', ms = 2600) {
    const n = document.createElement('div');
    n.className = 'toast ' + kind;
    n.innerHTML = text;
    this.el.toasts.appendChild(n);
    while (this.el.toasts.children.length > 5) this.el.toasts.firstChild.remove();
    setTimeout(() => {
      n.classList.add('fade');
      setTimeout(() => n.remove(), 400);
    }, ms);
  }

  cashToast(amount, label) {
    this.toast(`<b>+${fmtMoneyFull(amount)}</b> <span style="opacity:.75;font-weight:600">${label}</span>`, 'cash', 2400);
  }

  /* ---------------- prompt ---------------- */
  setPrompt(text) {
    if (text === this._lastPrompt) return;
    this._lastPrompt = text;
    this.el.prompt.classList.toggle('hidden', !text);
    if (text) this.el.prompt.querySelector('b').innerHTML = text;
  }

  setPassenger(on, who) {
    this.el.passenger.classList.toggle('hidden', !on);
    if (on) this.el.passenger.querySelector('span').textContent = who ? `riding with ${who}` : 'hold on!';
  }

  /* ---------------- quest tracker ---------------- */
  setQuest(q) {
    this.el.quest.classList.toggle('hidden', !q);
    if (!q) return;
    this.el.qTitle.textContent = q.title;
    this.el.qDesc.textContent = q.hint || q.desc || '';
    this.el.qReward.textContent = fmtMoney(q.reward);
    this.el.qFill.style.width = clamp((q.progress ?? 0) * 100, 0, 100) + '%';
  }

  /* ---------------- minimap ---------------- */
  updateMinimap(body, others = [], markers = []) {
    const show = settings.get('showMinimap');
    this.el.minimapWrap.classList.toggle('hidden', !show);
    if (!show) return;
    const g = this.ctx;
    const S = this.el.minimap.width;
    const src = this.world.minimapCanvas;
    const zoom = 210;                 // metres across the minimap
    const px = (body.pos.x + WORLD.half) / WORLD.size * src.width;
    const pz = (body.pos.z + WORLD.half) / WORLD.size * src.height;
    const srcSpan = (zoom / WORLD.size) * src.width;

    g.save();
    g.clearRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    g.rotate(-body.yaw + Math.PI);
    g.drawImage(src, px - srcSpan / 2, pz - srcSpan / 2, srcSpan, srcSpan, -S / 2, -S / 2, S, S);

    const toLocal = (wx, wz) => [
      ((wx - body.pos.x) / zoom) * S,
      ((wz - body.pos.z) / zoom) * S,
    ];

    // POIs
    for (const p of this.world.pois) {
      const [x, y] = toLocal(p.x, p.z);
      if (Math.hypot(x, y) > S / 2 - 6) continue;
      g.fillStyle = '#' + p.color.toString(16).padStart(6, '0');
      g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1.5; g.stroke();
    }
    // quest / custom markers
    for (const m of markers) {
      let [x, y] = toLocal(m.x, m.z);
      const d = Math.hypot(x, y);
      const edge = S / 2 - 10;
      const clamped = d > edge;
      if (clamped) { x = (x / d) * edge; y = (y / d) * edge; }
      g.fillStyle = m.color || '#ffd34d';
      g.beginPath();
      if (clamped) { g.arc(x, y, 4, 0, 7); }
      else { g.moveTo(x, y - 6); g.lineTo(x + 5, y + 4); g.lineTo(x - 5, y + 4); g.closePath(); }
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1.4; g.stroke();
    }
    // other players
    for (const o of others) {
      const [x, y] = toLocal(o.x, o.z);
      if (Math.hypot(x, y) > S / 2 - 6) continue;
      g.fillStyle = o.color || '#16c2ff';
      g.beginPath(); g.arc(x, y, 3.6, 0, 7); g.fill();
    }
    g.restore();

    // player arrow (always centred, pointing up)
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(S / 2, S / 2 - 8);
    g.lineTo(S / 2 + 6, S / 2 + 6);
    g.lineTo(S / 2, S / 2 + 3);
    g.lineTo(S / 2 - 6, S / 2 + 6);
    g.closePath();
    g.fill();
  }

  /* ---------------- fps ---------------- */
  updateFps(fps) {
    const want = settings.get('showFps');
    if (!want) { if (this._fpsEl) { this._fpsEl.remove(); this._fpsEl = null; } return; }
    if (!this._fpsEl) {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;left:50%;bottom:6px;transform:translateX(-50%);font-size:11px;color:#5c6883;font-weight:700';
      this.el.hud.appendChild(d);
      this._fpsEl = d;
    }
    this._fpsEl.textContent = Math.round(fps) + ' fps';
  }
}
