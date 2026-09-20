/* ============================================================
   touch.js — on-screen controls for phones and tablets
   ============================================================ */
import { $, $$, clamp } from '../core/util.js';
import { input } from '../core/input.js';
import { settings } from '../core/settings.js';
import { audio } from '../core/audio.js';

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.root = $('#touch');
    this.stick = $('#stick');
    this.knob = $('#stick-knob');
    this.btns = $('#tbtns');
    this.active = false;
    this.stickId = null;
    this.origin = { x: 0, y: 0 };
    this.radius = 54;
    this._bind();
    this.refresh();
  }

  refresh() {
    const want = settings.wantTouch();
    this.root.classList.toggle('hidden', !want);
    this.active = want;
    const left = settings.get('touchLayout') === 'left';
    // swap sides
    this.stick.style.left = left ? '' : `calc(26px + env(safe-area-inset-left, 0px))`;
    this.stick.style.right = left ? `calc(26px + env(safe-area-inset-right, 0px))` : '';
    this.btns.style.right = left ? '' : `calc(20px + env(safe-area-inset-right, 0px))`;
    this.btns.style.left = left ? `calc(20px + env(safe-area-inset-left, 0px))` : '';
    this.btns.style.justifyItems = left ? 'start' : 'end';
    if (!want) {
      input.setAxis(0, 0);
      for (const a of ['throttle', 'brake', 'wheelie', 'interact', 'camera', 'reset']) input.setTouch(a, false);
    }
  }

  _bind() {
    /* ---- analog stick ---- */
    const start = (e) => {
      if (this.stickId !== null) return;
      const t = e.changedTouches ? e.changedTouches[0] : e;
      this.stickId = e.changedTouches ? t.identifier : 'mouse';
      const r = this.stick.getBoundingClientRect();
      this.origin.x = r.left + r.width / 2;
      this.origin.y = r.top + r.height / 2;
      this.radius = r.width / 2 - 8;
      this._move(t);
      e.preventDefault();
      audio.resume();
    };
    const move = (e) => {
      if (this.stickId === null) return;
      const t = this._find(e);
      if (!t) return;
      this._move(t);
      e.preventDefault();
    };
    const end = (e) => {
      if (this.stickId === null) return;
      if (e.changedTouches && !Array.from(e.changedTouches).some((t) => t.identifier === this.stickId)) return;
      this.stickId = null;
      this.knob.style.transform = '';
      input.setAxis(0, 0);
    };

    this.stick.addEventListener('touchstart', start, { passive: false });
    this.stick.addEventListener('mousedown', start);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('mousemove', move);
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    window.addEventListener('mouseup', end);

    /* ---- buttons ---- */
    for (const b of $$('.tbtn')) {
      const act = b.dataset.act;
      const on = (e) => {
        e.preventDefault();
        audio.resume();
        b.classList.add('on');
        if (act === 'throttle') input.setAxis(input.axis.x, -1);
        else input.setTouch(act === 'brake' ? 'back' : act, true);
        if (act === 'interact') { input.setTouch('interact', true); setTimeout(() => input.setTouch('interact', false), 60); }
        if (act === 'camera') { input.setTouch('camera', true); setTimeout(() => input.setTouch('camera', false), 60); }
        if (act === 'reset') { input.setTouch('reset', true); setTimeout(() => input.setTouch('reset', false), 60); }
      };
      const off = (e) => {
        b.classList.remove('on');
        if (act === 'throttle') { this._throttleHeld = false; if (this.stickId === null) input.setAxis(input.axis.x, 0); else input.setAxis(input.axis.x, this._stickY || 0); }
        else if (act === 'brake') input.setTouch('back', false);
        else input.setTouch(act, false);
      };
      b.addEventListener('touchstart', (e) => { this._throttleHeld = act === 'throttle'; on(e); }, { passive: false });
      b.addEventListener('touchend', off);
      b.addEventListener('touchcancel', off);
      b.addEventListener('mousedown', (e) => { this._throttleHeld = act === 'throttle'; on(e); });
      b.addEventListener('mouseup', off);
      b.addEventListener('mouseleave', off);
    }
  }

  _find(e) {
    if (!e.changedTouches) return this.stickId === 'mouse' ? e : null;
    for (const t of e.changedTouches) if (t.identifier === this.stickId) return t;
    return null;
  }

  _move(t) {
    let dx = t.clientX - this.origin.x;
    let dy = t.clientY - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) { dx = (dx / d) * this.radius; dy = (dy / d) * this.radius; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / this.radius;
    const ny = dy / this.radius;
    this._stickY = ny;
    input.setAxis(nx, this._throttleHeld ? -1 : ny);
  }
}
