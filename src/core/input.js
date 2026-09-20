/* ============================================================
   input.js — unified action input (keyboard / mouse / touch / gamepad)

   Everything in the game asks `input.down('wheelie')` rather than
   looking at raw keys, so rebinding Just Works.
   ============================================================ */
import { settings, ACTIONS } from './settings.js';
import { clamp } from './util.js';

class Input {
  constructor() {
    this.keys = new Set();              // raw codes currently held
    this.actions = {};                  // id -> bool
    this.pressed = {};                  // id -> bool (this frame only)
    this.released = {};
    this.touch = {};                    // id -> bool, set by touch layer
    this.axis = { x: 0, y: 0 };         // analog stick from touch/gamepad (-1..1)
    // dx/dy accumulate while the camera is being dragged (or pointer-locked);
    // wheel accumulates notches for zoom. Both are cleared each frame.
    this.mouse = { dx: 0, dy: 0, wheel: 0, down: false, right: false, dragging: false };
    this.enabled = true;                // false while a text field / menu has focus
    this.captureMode = null;            // {cb} while rebinding
    this._suppress = new Set();         // codes bound to menus that we preventDefault on

    for (const a of ACTIONS) { this.actions[a.id] = false; this.pressed[a.id] = false; this.released[a.id] = false; }

    this._bindEvents();
    this._rebuildMap();
    settings.onChange(() => this._rebuildMap());
  }

  _rebuildMap() {
    // code -> [actionIds]
    this.map = new Map();
    for (const id of Object.keys(settings.data.binds)) {
      for (const code of settings.data.binds[id]) {
        if (!code) continue;
        if (!this.map.has(code)) this.map.set(code, []);
        this.map.get(code).push(id);
      }
    }
  }

  _bindEvents() {
    const isTextTarget = (t) =>
      t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

    window.addEventListener('keydown', (e) => {
      if (this.captureMode) {
        e.preventDefault();
        if (e.code === 'Escape') { const cb = this.captureMode.cb; this.captureMode = null; cb(null); }
        else { const cb = this.captureMode.cb; this.captureMode = null; cb(e.code); }
        return;
      }
      if (isTextTarget(e.target)) return;
      if (e.repeat) { if (this._shouldPrevent(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      this._fire(e.code, true);
      if (this._shouldPrevent(e.code)) e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      if (isTextTarget(e.target)) return;
      this.keys.delete(e.code);
      this._fire(e.code, false);
    });

    window.addEventListener('blur', () => this.clearAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearAll(); });

    // mouse buttons as bindable inputs
    window.addEventListener('mousedown', (e) => {
      const code = 'Mouse' + e.button;
      if (this.captureMode) {
        e.preventDefault();
        const cb = this.captureMode.cb; this.captureMode = null; cb(code);
        return;
      }
      if (isTextTarget(e.target) || e.target.closest('#menu-root, #touch, #pause-btn')) return;
      this.keys.add(code);
      this._fire(code, true);
      this.mouse.down = true;

      // right-drag orbits the camera, Roblox style: grab the pointer so the
      // drag is unbounded, and fall back to raw deltas if the lock is refused
      if (e.button === 2 && this.enabled) {
        this.mouse.right = true;
        this.mouse.dragging = true;
        const cv = document.getElementById('gl');
        if (cv && cv.requestPointerLock && !document.pointerLockElement) {
          try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* fall back */ }
        }
      }
    });
    window.addEventListener('mouseup', (e) => {
      const code = 'Mouse' + e.button;
      this.keys.delete(code);
      this._fire(code, false);
      this.mouse.down = false;
      if (e.button === 2) {
        this.mouse.right = false;
        this.mouse.dragging = false;
        if (document.pointerLockElement) document.exitPointerLock();
      }
    });
    window.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('#menu-root')) e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement || this.mouse.dragging) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      }
    });

    // losing the lock (Esc, alt-tab) must also end the drag
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && !this.mouse.right) this.mouse.dragging = false;
    });

    // wheel zooms the camera
    window.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      if (e.target && e.target.closest && e.target.closest('#menu-root, #touch')) return;
      this.mouse.wheel += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 50 + 0.5);
      e.preventDefault();
    }, { passive: false });

    // two-finger drag on touch orbits the camera too
    let tPrev = null;
    window.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2 && !e.target.closest('#menu-root, #touch')) {
        tPrev = [(e.touches[0].clientX + e.touches[1].clientX) / 2,
                 (e.touches[0].clientY + e.touches[1].clientY) / 2];
        this.mouse.dragging = true;
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (tPrev && e.touches.length === 2) {
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        this.mouse.dx += cx - tPrev[0];
        this.mouse.dy += cy - tPrev[1];
        tPrev = [cx, cy];
      }
    }, { passive: true });
    const endTouch = () => { tPrev = null; this.mouse.dragging = false; };
    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);
  }

  _shouldPrevent(code) {
    // stop the browser eating gameplay keys
    return ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote'].includes(code);
  }

  _fire(code, down) {
    const ids = this.map.get(code);
    if (!ids) return;
    for (const id of ids) {
      if (down) {
        if (!this.actions[id]) this.pressed[id] = true;
        this.actions[id] = true;
      } else {
        if (this.actions[id]) this.released[id] = true;
        // only clear if no other bound key for this action is still held
        const binds = settings.data.binds[id] || [];
        const stillHeld = binds.some((c) => c && this.keys.has(c));
        if (!stillHeld) this.actions[id] = false;
      }
    }
  }

  clearAll() {
    this.mouse.right = false;
    this.mouse.dragging = false;
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.keys.clear();
    for (const id of Object.keys(this.actions)) this.actions[id] = false;
    this.axis.x = 0; this.axis.y = 0;
  }

  /** ask the user to press a key; cb(code|null) */
  capture(cb) { this.captureMode = { cb }; }

  /* ---- touch bridge ---- */
  setTouch(id, v) {
    if (!!this.touch[id] === !!v) return;
    this.touch[id] = !!v;
    if (v) this.pressed[id] = true; else this.released[id] = true;
  }
  setAxis(x, y) { this.axis.x = clamp(x, -1, 1); this.axis.y = clamp(y, -1, 1); }

  /* ---- queries ---- */
  down(id) {
    if (!this.enabled) return false;
    return !!(this.actions[id] || this.touch[id] || this.pad?.[id]);
  }
  justPressed(id) { return this.enabled && !!this.pressed[id]; }
  justReleased(id) { return this.enabled && !!this.released[id]; }

  /** steering: -1 left .. +1 right  (keys OR analog stick) */
  steer() {
    if (!this.enabled) return 0;
    let v = 0;
    if (this.down('left')) v -= 1;
    if (this.down('right')) v += 1;
    if (Math.abs(this.axis.x) > 0.08) v = clamp(v + this.axis.x, -1, 1);
    return clamp(v, -1, 1);
  }

  /** throttle: -1 brake/reverse .. +1 forward */
  drive() {
    if (!this.enabled) return 0;
    let v = 0;
    if (this.down('forward')) v += 1;
    if (this.down('back')) v -= 1;
    if (Math.abs(this.axis.y) > 0.12 && !this.down('forward') && !this.down('back')) {
      v = clamp(v - this.axis.y, -1, 1); // stick up = forward
    }
    return clamp(v, -1, 1);
  }

  /* ---- gamepad ---- */
  pollGamepad() {
    if (!navigator.getGamepads) return;
    const gps = navigator.getGamepads();
    let gp = null;
    for (const g of gps) if (g && g.connected) { gp = g; break; }
    if (!gp) { this.pad = null; return; }
    this.pad = this.pad || {};
    const dz = (v) => (Math.abs(v) < 0.16 ? 0 : v);
    const ax = dz(gp.axes[0] || 0), ay = dz(gp.axes[1] || 0);
    if (ax || ay) this.setAxis(ax, ay);
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const set = (id, v) => {
      if (!!this.pad[id] === !!v) return;
      this.pad[id] = v;
      if (v) this.pressed[id] = true; else this.released[id] = true;
    };
    set('forward', (gp.buttons[7]?.value || 0) > 0.12);
    set('back', (gp.buttons[6]?.value || 0) > 0.12);
    set('wheelie', b(0));
    set('brake', b(1));
    set('interact', b(2));
    set('camera', b(3));
    set('boost', b(5));
    set('reset', b(9));
  }

  /** call at the very end of each frame */
  endFrame() {
    for (const id of Object.keys(this.pressed)) { this.pressed[id] = false; this.released[id] = false; }
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
  }
}

export const input = new Input();
