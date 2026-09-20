/* ============================================================
   settings.js — persisted user settings + key bindings
   ============================================================ */
import { isCoarse, isTouchDevice } from './util.js';

const KEY = 'eride.settings.v1';

/** Every rebindable action. `def` is an array so an action can have
 *  a primary + alternate binding. Codes are KeyboardEvent.code values,
 *  or "Mouse0".."Mouse4" for mouse buttons. */
export const ACTIONS = [
  { id: 'forward',   label: 'Throttle / Forward', group: 'Riding', def: ['KeyW', 'ArrowUp'] },
  { id: 'back',      label: 'Brake / Reverse',    group: 'Riding', def: ['KeyS', 'ArrowDown'] },
  { id: 'left',      label: 'Steer Left',         group: 'Riding', def: ['KeyA', 'ArrowLeft'] },
  { id: 'right',     label: 'Steer Right',        group: 'Riding', def: ['KeyD', 'ArrowRight'] },
  { id: 'wheelie',   label: 'Wheelie',            group: 'Riding', def: ['ShiftLeft', 'ShiftRight'], hint: 'hold + throttle' },
  { id: 'brake',     label: 'Handbrake',          group: 'Riding', def: ['Space'] },
  { id: 'boost',     label: 'Sprint Boost',       group: 'Riding', def: ['KeyQ'], hint: 'drains battery' },
  { id: 'lean',      label: 'Lean Forward',       group: 'Riding', def: ['KeyC'], hint: 'kills a wheelie fast' },

  { id: 'interact',  label: 'Interact / Mount',   group: 'General', def: ['KeyE'] },
  { id: 'dismount',  label: 'Dismount',           group: 'General', def: ['KeyF'] },
  { id: 'reset',     label: 'Reset Vehicle',      group: 'General', def: ['KeyR'] },
  { id: 'camera',    label: 'Cycle Camera',       group: 'General', def: ['KeyV'], hint: 're-centres after a look-around' },
  { id: 'look',      label: 'Look Behind',        group: 'General', def: ['KeyB'] },
  { id: 'horn',      label: 'Horn / Bell',        group: 'General', def: ['KeyH'] },

  { id: 'garage',    label: 'Open Garage',        group: 'Menus', def: ['KeyG'] },
  { id: 'store',     label: 'Open Store',         group: 'Menus', def: ['KeyT'] },
  { id: 'quests',    label: 'Quest Board',        group: 'Menus', def: ['KeyJ'] },
  { id: 'map',       label: 'Big Map',            group: 'Menus', def: ['KeyM'] },
  { id: 'players',   label: 'Player List',        group: 'Menus', def: ['Tab'] },
  { id: 'chat',      label: 'Chat',               group: 'Menus', def: ['Enter'] },
  { id: 'suggest',   label: 'Suggestion box',     group: 'Menus', def: ['F1'], hint: 'report a bug or idea' },
];

function defaultBinds() {
  const b = {};
  for (const a of ACTIONS) b[a.id] = a.def.slice();
  return b;
}

export const DEFAULTS = {
  // controls
  binds: defaultBinds(),
  sensitivity: 1.0,        // right-drag look sensitivity
  invertLook: false,       // invert the vertical of the look-around
  touchControls: 'auto',   // auto | on | off
  touchLayout: 'right',    // right | left  (handedness)

  // display
  units: 'mph',            // mph | kmh
  quality: 'auto',         // low | medium | high | auto
  shadows: true,
  fov: 72,
  motionBlurFx: true,
  cameraShake: 0.8,
  showMinimap: true,
  showFps: false,

  // audio
  master: 0.7,
  sfx: 0.8,
  music: 0.35,

  // gameplay
  assistWheelie: 0.35,     // 0 = raw, 1 = very forgiving
  autoBrakeAssist: false,
  name: '',
};

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

class Settings {
  constructor() {
    this.data = deepClone(DEFAULTS);
    this.load();
    this._listeners = new Set();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      // shallow merge, with binds merged per-action so new actions get defaults
      for (const k of Object.keys(DEFAULTS)) {
        if (k === 'binds') continue;
        if (saved[k] !== undefined) this.data[k] = saved[k];
      }
      if (saved.binds) {
        for (const a of ACTIONS) {
          if (Array.isArray(saved.binds[a.id])) this.data.binds[a.id] = saved.binds[a.id].slice();
        }
      }
    } catch (e) { console.warn('[settings] load failed', e); }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); }
    catch (e) { console.warn('[settings] save failed', e); }
    this._listeners.forEach((f) => f(this.data));
  }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  get(k) { return this.data[k]; }
  set(k, v) { this.data[k] = v; this.save(); }

  bindsFor(action) { return this.data.binds[action] || []; }

  /** assign `code` to slot (0 primary / 1 alt) of action, clearing it elsewhere */
  rebind(action, slot, code) {
    for (const id of Object.keys(this.data.binds)) {
      this.data.binds[id] = this.data.binds[id].map((c) => (c === code ? null : c));
    }
    const arr = this.data.binds[action] || (this.data.binds[action] = [null, null]);
    while (arr.length < 2) arr.push(null);
    arr[slot] = code;
    this.save();
  }

  clearBind(action, slot) {
    const arr = this.data.binds[action];
    if (arr) { arr[slot] = null; this.save(); }
  }

  resetBinds() { this.data.binds = defaultBinds(); this.save(); }

  resetAll() { this.data = deepClone(DEFAULTS); this.save(); }

  /** should on-screen touch controls be visible? */
  wantTouch() {
    const m = this.data.touchControls;
    if (m === 'on') return true;
    if (m === 'off') return false;
    return isTouchDevice() && isCoarse();
  }
}

export const settings = new Settings();

/* ---- pretty key names ---- */
const NICE = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: 'L Shift', ShiftRight: 'R Shift',
  ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
  AltLeft: 'L Alt', AltRight: 'R Alt',
  Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  CapsLock: 'Caps', Backspace: '⌫', Delete: 'Del',
  Mouse0: 'L Mouse', Mouse1: 'M Mouse', Mouse2: 'R Mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
};

export function keyName(code) {
  if (!code) return '—';
  if (NICE[code]) return NICE[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
