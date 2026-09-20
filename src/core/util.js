/* ============================================================
   util.js — small helpers used everywhere
   ============================================================ */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

/** shortest signed angle from a to b */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** deterministic 32-bit hash of a string */
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 seeded PRNG */
export function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed | 0) >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- units ---- */
export const MS_TO_MPH = 2.2369362920544;
export const MS_TO_KMH = 3.6;

export function fmtMoney(n) {
  const neg = n < 0;
  n = Math.abs(Math.round(n));
  let s;
  if (n >= 1e9) s = (n / 1e9).toFixed(n >= 1e10 ? 0 : 2) + 'B';
  else if (n >= 1e6) s = (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M';
  else s = n.toLocaleString('en-US');
  return (neg ? '-$' : '$') + s;
}

export function fmtMoneyFull(n) {
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
}

export function fmtTime(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

export function fmtDist(m) {
  return m >= 1000 ? (m / 1000).toFixed(2) + 'km' : Math.round(m) + 'm';
}

/* ---- dom ---- */
export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** on(root,'click','.sel',fn) — delegated listener */
export function on(root, type, sel, fn) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest(sel);
    if (t && root.contains(t)) fn(e, t);
  });
}

/* ---- misc ---- */
export function uid(n = 8) {
  const c = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

export const isTouchDevice = () =>
  ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

export const isCoarse = () =>
  window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
