/* ============================================================
   menus.js — panel shell, main menu, pause, settings, controls
   ============================================================ */
import { $, el, on, escapeHtml, fmtMoneyFull, fmtMoney, clamp } from '../core/util.js';
import { settings, ACTIONS, keyName } from '../core/settings.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';

const root = $('#menu-root');
const overlay = $('#overlay');

let stack = [];
let onCloseAll = null;

export function isMenuOpen() { return stack.length > 0; }

export function openPanel(render, opts = {}) {
  const entry = { render, opts, node: null };
  stack.push(entry);
  draw();
  return entry;
}

export function closePanel() {
  const e = stack.pop();
  if (e && e.opts.onClose) e.opts.onClose();
  draw();
}

export function closeAll() {
  while (stack.length) { const e = stack.pop(); if (e.opts.onClose) e.opts.onClose(); }
  draw();
}

export function refreshTop() {
  if (stack.length) draw();
}

export function setCloseHandler(fn) { onCloseAll = fn; }

function draw() {
  root.innerHTML = '';
  const open = stack.length > 0;
  root.classList.toggle('on', open);
  overlay.classList.toggle('hidden', !open);
  input.enabled = !open;
  if (!open) { onCloseAll && onCloseAll(); return; }
  const top = stack[stack.length - 1];
  const node = top.render();
  top.node = node;
  root.appendChild(node);
}

/* ---------------- panel builder ---------------- */
export function panel({ title, sub, size = '', body, foot, tabs, onBack, headRight, fill = false }) {
  const p = el('div', 'panel ' + size);
  const head = el('div', 'panel-head');
  if (onBack) {
    const b = el('button', 'btn ghost sm', '←');
    b.onclick = () => { audio.ui('click'); onBack(); };
    head.appendChild(b);
  }
  const tw = el('div');
  tw.appendChild(el('h2', '', escapeHtml(title)));
  if (sub) tw.appendChild(el('div', 'sub', sub));
  head.appendChild(tw);
  head.appendChild(el('div', 'spacer'));
  if (tabs) head.appendChild(tabs);
  if (headRight) head.appendChild(headRight);
  p.appendChild(head);

  const b = el('div', 'panel-body' + (fill ? ' fill' : ''));
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  p.appendChild(b);

  if (foot) {
    const f = el('div', 'panel-foot');
    if (typeof foot === 'string') f.innerHTML = foot; else f.appendChild(foot);
    p.appendChild(f);
  }
  return p;
}

export function tabBar(items, active, onPick) {
  const t = el('div', 'tabs');
  for (const it of items) {
    const b = el('button', 'tab' + (it.id === active ? ' on' : ''), escapeHtml(it.label));
    b.onclick = () => { audio.ui('click'); onPick(it.id); };
    t.appendChild(b);
  }
  return t;
}

export function btn(label, cls = '', fn) {
  const b = el('button', 'btn ' + cls, label);
  if (fn) b.onclick = (e) => { audio.ui('click'); fn(e); };
  return b;
}

export function cashChip(economy) {
  const c = el('div', '', `<span style="color:#8592ad;font-size:11px;font-weight:700;letter-spacing:.1em">BALANCE</span>
     <b style="display:block;color:#ffd34d;font-size:19px;font-weight:900">${fmtMoneyFull(economy.cash)}</b>`);
  c.style.textAlign = 'right';
  return c;
}

/* ============================================================
   CONFIRM / PROMPT
   ============================================================ */
export function confirmBox(title, message, onYes, yesLabel = 'Confirm', danger = false) {
  openPanel(() => {
    const body = el('div', '', `<p style="font-size:13.5px;line-height:1.6;color:#b9c3d6;margin:0">${message}</p>`);
    const foot = el('div');
    foot.appendChild(btn('Cancel', 'ghost', () => closePanel()));
    foot.appendChild(btn(yesLabel, danger ? 'warn' : 'primary', () => { closePanel(); onYes(); }));
    return panel({ title, size: 'sm', body, foot });
  });
}

export function promptBox(title, label, value, onOk, opts = {}) {
  openPanel(() => {
    const body = el('div');
    const f = el('div', 'field');
    f.appendChild(el('label', '', label));
    const inp = el('input');
    inp.type = opts.number ? 'number' : 'text';
    inp.value = value;
    if (opts.min != null) inp.min = opts.min;
    if (opts.max != null) inp.max = opts.max;
    if (opts.maxlength) inp.maxLength = opts.maxlength;
    f.appendChild(inp);
    body.appendChild(f);
    if (opts.note) body.appendChild(el('div', 'note info', opts.note));
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    const go = () => { const v = opts.number ? Number(inp.value) : inp.value; closePanel(); onOk(v); };
    const foot = el('div');
    foot.appendChild(btn('Cancel', 'ghost', () => closePanel()));
    foot.appendChild(btn(opts.okLabel || 'OK', 'primary', go));
    return panel({ title, size: 'sm', body, foot });
  });
}

export function infoBox(title, html, opts = {}) {
  openPanel(() => {
    const body = el('div', '', html);
    const foot = el('div');
    foot.appendChild(btn(opts.okLabel || 'Got it', 'primary', () => closePanel()));
    return panel({ title, size: opts.size || 'sm', body, foot });
  });
}

/* ============================================================
   SETTINGS
   ============================================================ */
export function openSettings(game) {
  let tab = 'controls';
  openPanel(() => {
    const body = el('div');
    if (tab === 'controls') body.appendChild(controlsPane());
    else if (tab === 'display') body.appendChild(displayPane(game));
    else if (tab === 'audio') body.appendChild(audioPane());
    else body.appendChild(gamePane(game));

    const tabs = tabBar([
      { id: 'controls', label: 'Controls' },
      { id: 'display', label: 'Display' },
      { id: 'audio', label: 'Audio' },
      { id: 'game', label: 'Gameplay' },
    ], tab, (id) => { tab = id; refreshTop(); });

    const foot = el('div');
    foot.appendChild(btn('Reset all settings', 'ghost', () => {
      confirmBox('Reset settings?', 'Every control binding and preference goes back to default. Your garage and cash are untouched.',
        () => { settings.resetAll(); refreshTop(); }, 'Reset', true);
    }));
    foot.appendChild(el('div', 'spacer'));
    foot.appendChild(btn('Done', 'primary', () => closePanel()));
    return panel({ title: 'Settings', sub: 'saved automatically', size: 'md', body, tabs, foot });
  });
}

function controlsPane() {
  const w = el('div');
  w.appendChild(el('div', 'note info',
    'Click a key to rebind. <b>Esc</b> cancels, and a binding already used elsewhere is cleared automatically. Every action takes a primary and an alternate key; mouse buttons work too.'));

  const groups = {};
  for (const a of ACTIONS) (groups[a.group] ||= []).push(a);

  for (const g of Object.keys(groups)) {
    w.appendChild(el('div', 'sec-title', g));
    for (const a of groups[g]) {
      const row = el('div', 'bind-row');
      const lab = el('div', 'lab', escapeHtml(a.label) + (a.hint ? `<em>${escapeHtml(a.hint)}</em>` : ''));
      row.appendChild(lab);
      for (let slot = 0; slot < 2; slot++) {
        const code = settings.bindsFor(a.id)[slot];
        const k = el('button', 'keycap', escapeHtml(keyName(code)));
        k.title = slot === 0 ? 'Primary' : 'Alternate — right-click to clear';
        k.oncontextmenu = (e) => { e.preventDefault(); settings.clearBind(a.id, slot); refreshTop(); };
        k.onclick = () => {
          k.classList.add('listening');
          k.textContent = 'press…';
          input.capture((c) => {
            if (c) settings.rebind(a.id, slot, c);
            refreshTop();
          });
        };
        row.appendChild(k);
      }
      w.appendChild(row);
    }
  }

  const f = el('div');
  f.style.marginTop = '14px';
  f.appendChild(btn('Restore default bindings', 'ghost', () => { settings.resetBinds(); refreshTop(); }));
  w.appendChild(f);
  return w;
}

function toggleRow(label, hint, key, onChange) {
  const r = el('div', 'switch');
  r.appendChild(el('div', 'lab', escapeHtml(label) + (hint ? `<em>${escapeHtml(hint)}</em>` : '')));
  const t = el('button', 'toggle' + (settings.get(key) ? ' on' : ''));
  t.onclick = () => {
    settings.set(key, !settings.get(key));
    t.classList.toggle('on', settings.get(key));
    audio.ui('click');
    onChange && onChange(settings.get(key));
  };
  r.appendChild(t);
  return r;
}

function sliderRow(label, hint, key, min, max, step, fmt, onChange) {
  const r = el('div', 'field');
  const v = settings.get(key);
  const lb = el('label', '', `${escapeHtml(label)} — <b style="color:#e7ecf7">${fmt ? fmt(v) : v}</b>`);
  r.appendChild(lb);
  const s = el('input');
  s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = v;
  s.oninput = () => {
    const nv = Number(s.value);
    settings.set(key, nv);
    lb.innerHTML = `${escapeHtml(label)} — <b style="color:#e7ecf7">${fmt ? fmt(nv) : nv}</b>`;
    onChange && onChange(nv);
  };
  r.appendChild(s);
  if (hint) r.appendChild(el('div', '', `<span style="font-size:11px;color:#5c6883">${escapeHtml(hint)}</span>`));
  return r;
}

function selectRow(label, key, opts, onChange) {
  const r = el('div', 'field');
  r.appendChild(el('label', '', label));
  const s = el('select');
  for (const o of opts) {
    const op = el('option', '', escapeHtml(o.label));
    op.value = o.id;
    if (settings.get(key) === o.id) op.selected = true;
    s.appendChild(op);
  }
  s.onchange = () => { settings.set(key, s.value); onChange && onChange(s.value); };
  r.appendChild(s);
  return r;
}

function displayPane(game) {
  const w = el('div');
  w.appendChild(selectRow('Units', 'units', [{ id: 'mph', label: 'Miles per hour' }, { id: 'kmh', label: 'Kilometres per hour' }]));
  w.appendChild(selectRow('Quality', 'quality', [
    { id: 'auto', label: 'Auto' }, { id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' },
  ], () => infoBox('Reload needed', 'Quality changes apply when you reload the page.')));
  w.appendChild(sliderRow('Field of view', 'Higher feels faster.', 'fov', 55, 100, 1, (v) => v + '°'));
  w.appendChild(sliderRow('Camera shake', '', 'cameraShake', 0, 1.5, 0.05, (v) => Math.round(v * 100) + '%'));
  w.appendChild(el('div', 'hr'));
  w.appendChild(toggleRow('Shadows', 'Costs a few frames', 'shadows'));
  w.appendChild(toggleRow('Minimap', '', 'showMinimap'));
  w.appendChild(toggleRow('Show FPS', '', 'showFps'));
  w.appendChild(el('div', 'hr'));
  w.appendChild(selectRow('On-screen touch controls', 'touchControls', [
    { id: 'auto', label: 'Automatic (touch devices)' }, { id: 'on', label: 'Always on' }, { id: 'off', label: 'Off' },
  ], () => game && game.refreshTouch()));
  w.appendChild(selectRow('Touch layout', 'touchLayout', [
    { id: 'right', label: 'Buttons on the right' }, { id: 'left', label: 'Buttons on the left' },
  ], () => game && game.refreshTouch()));
  return w;
}

function audioPane() {
  const w = el('div');
  w.appendChild(sliderRow('Master volume', '', 'master', 0, 1, 0.02, (v) => Math.round(v * 100) + '%'));
  w.appendChild(sliderRow('Effects', '', 'sfx', 0, 1, 0.02, (v) => Math.round(v * 100) + '%'));
  w.appendChild(el('div', 'note info', 'All sound in E-Ride is generated live from the vehicle you built — motor pitch tracks wheel speed and pack voltage, so a 3000-rpm hub and a 26 000-rpm shaft drive really do sound different.'));
  return w;
}

function gamePane(game) {
  const w = el('div');
  w.appendChild(sliderRow('Wheelie assist', 'How much the game helps you hold the balance point.', 'assistWheelie', 0, 1, 0.05,
    (v) => v < 0.05 ? 'Off (raw)' : v < 0.4 ? Math.round(v * 100) + '% — light' : v < 0.75 ? Math.round(v * 100) + '% — helpful' : Math.round(v * 100) + '% — very forgiving',
    () => game && game.applyAssist()));
  w.appendChild(el('div', 'hr'));
  w.appendChild(el('div', 'sec-title', 'Rider'));
  const f = el('div', 'field');
  f.appendChild(el('label', '', 'Display name'));
  const i = el('input');
  i.type = 'text'; i.maxLength = 16; i.value = settings.get('name') || '';
  i.placeholder = 'Rider';
  i.onchange = () => { settings.set('name', i.value.slice(0, 16)); game && game.onNameChanged(); };
  f.appendChild(i);
  w.appendChild(f);
  w.appendChild(el('div', 'hr'));
  const dz = el('div');
  dz.appendChild(btn('Erase save & start over', 'warn', () => {
    confirmBox('Erase everything?', 'Your cash, garage, parts and records are all deleted. This cannot be undone.',
      () => { game.wipeSave(); }, 'Erase it all', true);
  }));
  w.appendChild(dz);
  return w;
}

export { root as menuRoot };
