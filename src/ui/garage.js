/* ============================================================
   garage.js — vehicle list + the part-by-part builder
   ============================================================ */
import { el, escapeHtml, clamp, fmtMoney, fmtMoneyFull, fmtDist, MS_TO_MPH } from '../core/util.js';
import { openPanel, closePanel, panel, tabBar, btn, refreshTop, confirmBox, infoBox, promptBox, cashChip } from './menus.js';
import { economy, SELL_RATE } from '../game/economy.js';
import { PARTS, SLOTS, TIERS, getPart, MOUNTS, partsInSlot } from '../vehicle/parts.js';
import { stats as computeStats, validate, buildValue, autoName, buildTier } from '../vehicle/build.js';
import { audio } from '../core/audio.js';
import { settings } from '../core/settings.js';

/* ============================================================ */
export function openGarage(game) {
  openPanel(() => {
    const body = el('div');
    const list = el('div', 'grid c2');
    const activeId = economy.data.active;

    for (const v of economy.vehicles) {
      const st = computeStats(v.build, { riders: 1 });
      const c = el('div', 'card' + (v.id === activeId ? ' sel' : ''));
      c.innerHTML = `
        <span class="tier t-${st.tier}">${TIERS[st.tier].name}</span>
        <h4>${escapeHtml(v.name)}</h4>
        <div class="muted">${st.cls === 'scooter' ? 'E-scooter' : 'E-bike'} ·
          ${Math.round(st.dryMassKg)} kg · ${st.seats > 1 ? '2 seats' : '1 seat'}
          ${st.valid ? '' : '<span class="chip bad" style="margin-left:6px">won\'t run</span>'}</div>
        <div class="stats">
          ${bar('Top speed', st.topSpeedMph / 310, Math.round(st.topSpeedMph) + ' mph')}
          ${bar('Power', clamp(st.powerW / 300000, 0, 1) ** 0.4, kw(st.powerW))}
          ${bar('Wheelie', st.wheelieEase / 2, st.wheelieEase.toFixed(2))}
          ${bar('Handling', st.handling, Math.round(st.handling * 100))}
        </div>
        <div class="card-row">
          <span class="price">${fmtMoney(buildValue(v.build))}</span>
          <span class="muted">${v.id === activeId ? '<b style="color:#39e6a4">IN USE</b>' : ''}</span>
        </div>`;
      const row = el('div', 'card-row');
      if (v.id !== activeId) {
        row.appendChild(btn('Ride this', 'primary sm', () => {
          economy.setActive(v.id);
          game.syncActiveVehicle();
          game.hud.toast(`Switched to ${escapeHtml(v.name)}`, 'info');
          refreshTop();
        }));
      }
      row.appendChild(btn('Build', 'sm', () => openBuilder(game, v.id)));
      row.appendChild(btn('⋯', 'ghost sm', () => vehicleMenu(game, v)));
      c.appendChild(row);
      list.appendChild(c);
    }
    body.appendChild(list);

    if (economy.data.listings.length) {
      body.appendChild(el('div', 'sec-title', 'Listed on the Swap Meet'));
      const lg = el('div', 'grid c2');
      for (const l of economy.data.listings) {
        const c = el('div', 'card');
        c.innerHTML = `<h4>${escapeHtml(l.name)}</h4>
          <div class="muted">Asking ${fmtMoneyFull(l.price)} · worth about ${fmtMoney(l.value * 0.82)} ·
          ${Math.round(l.views)} views</div>`;
        const r = el('div', 'card-row');
        r.appendChild(btn('Pull the listing', 'ghost sm', () => {
          const res = economy.delistVehicle(l.id);
          game.hud.toast(escapeHtml(res.msg), res.ok ? '' : 'bad');
          refreshTop();
        }));
        c.appendChild(r);
        lg.appendChild(c);
      }
      body.appendChild(lg);
    }

    const foot = el('div');
    foot.appendChild(btn('Build something new', '', () => newBuildFlow(game)));
    foot.appendChild(el('div', 'spacer'));
    foot.appendChild(btn('Close', 'primary', () => closePanel()));

    return panel({
      title: 'The Shed', sub: `${economy.vehicles.length} in the garage`,
      body, foot, headRight: cashChip(economy),
    });
  });
}

function vehicleMenu(game, v) {
  openPanel(() => {
    const st = computeStats(v.build, { riders: 1 });
    const body = el('div');
    body.appendChild(el('div', '', specTable(st, v)));
    const foot = el('div');
    foot.appendChild(btn('Rename', 'ghost', () => {
      promptBox('Rename', 'Vehicle name', v.name, (n) => { economy.renameVehicle(v.id, n); refreshTop(); }, { maxlength: 32 });
    }));
    foot.appendChild(btn('Duplicate', 'ghost', () => {
      const cost = buildValue(v.build);
      confirmBox('Build a copy?', `Buying a second set of every part costs <b>${fmtMoneyFull(cost)}</b>.`, () => {
        if (!economy.canAfford(cost)) { game.hud.toast('Not enough cash.', 'bad'); return; }
        economy.spend(cost);
        for (const s of SLOTS) if (v.build[s.id]) economy.addPart(v.build[s.id], 1, true);
        economy.addVehicle(v.name + ' II', v.build, { custom: true });
        economy.save();
        closePanel(); refreshTop();
      }, 'Build it');
    }));
    foot.appendChild(el('div', 'spacer'));
    if (economy.vehicles.length > 1) {
      foot.appendChild(btn(`Scrap for ${fmtMoney(buildValue(v.build) * SELL_RATE)}`, 'warn', () => {
        confirmBox('Scrap it?', `VoltMart pays ${Math.round(SELL_RATE * 100)}% of parts value. The vehicle and all of its parts are gone.`, () => {
          const r = economy.sellVehicle(v.id);
          game.hud.toast(escapeHtml(r.msg), r.ok ? 'cash' : 'bad');
          if (r.ok) { closePanel(); game.syncActiveVehicle(); }
          refreshTop();
        }, 'Scrap it', true);
      }));
    }
    foot.appendChild(btn('Done', 'primary', () => closePanel()));
    return panel({ title: v.name, sub: 'specification', size: 'sm', body, foot, onBack: () => closePanel() });
  });
}

function newBuildFlow(game) {
  // start from a blank frame — the player buys everything
  const base = {};
  for (const s of SLOTS) base[s.id] = null;
  const v = economy.addVehicle(autoName(base), base, { custom: true });
  openBuilder(game, v.id, true);
}

/* ============================================================
   THE BUILDER
   ============================================================ */
export function openBuilder(game, vehicleId, isNew = false) {
  const vehicle = economy.vehicles.find((x) => x.id === vehicleId);
  if (!vehicle) return;

  let draft = { ...vehicle.build };
  let slot = 'frame';
  let hover = null;          // part id being previewed
  let showIncompatible = true;

  const baseStats = computeStats(vehicle.build, { riders: 1 });

  openPanel(() => {
    const cur = computeStats(draft, { riders: 1 });
    const prev = hover ? computeStats({ ...draft, [slot]: hover }, { riders: 1 }) : null;
    const shown = prev || cur;

    const wrap = el('div', 'builder');

    /* ---------- column 1: slots ---------- */
    const col1 = el('div', 'slot-list');
    for (const s of SLOTS) {
      const p = draft[s.id] ? getPart(draft[s.id]) : null;
      const bad = cur.validation.errors.some((e) => e.slot === s.id);
      const warn = cur.validation.warnings.some((e) => e.slot === s.id);
      const b = el('button', 'slot' + (slot === s.id ? ' on' : '') + (bad ? ' bad' : ''));
      b.innerHTML = `<span class="ic">${s.icon}</span>
        <span class="nm"><em>${s.name}</em><b>${p ? escapeHtml(p.name) : (s.req ? '— required —' : '— none —')}</b></span>
        ${bad || warn ? `<span class="warn-dot" style="background:${bad ? '#ff4d5e' : '#ffb020'}"></span>` : ''}`;
      b.onclick = () => { slot = s.id; hover = null; audio.ui('click'); refreshTop(); };
      col1.appendChild(b);
    }
    wrap.appendChild(col1);

    /* ---------- column 2: part choices ---------- */
    const col2 = el('div', 'bcol parts-col');
    const head = el('div', '');
    head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap';
    head.appendChild(el('div', 'sec-title', SLOTS.find((s) => s.id === slot).name));
    head.appendChild(el('div', 'spacer'));
    const tg = el('button', 'btn ghost sm', showIncompatible ? 'Hiding nothing' : 'Compatible only');
    tg.onclick = () => { showIncompatible = !showIncompatible; refreshTop(); };
    head.appendChild(tg);
    col2.appendChild(head);

    const listWrap = el('div', 'part-list');
    const frame = draft.frame ? getPart(draft.frame) : null;

    let choices = partsInSlot(slot).slice();
    choices.sort((a, b) => (TIERS[a.tier].order - TIERS[b.tier].order) || (a.price - b.price));

    for (const p of choices) {
      const test = { ...draft, [slot]: p.id };
      const v = validate(test);
      const slotErr = v.errors.filter((e) => e.slot === slot);
      const compatible = slotErr.length === 0;
      if (!compatible && !showIncompatible) continue;

      const owned = economy.spareCount(p.id, vehicleId) > 0 || vehicle.build[slot] === p.id;
      const fitted = draft[slot] === p.id;

      const row = el('button', 'part' + (fitted ? ' on' : '') + (compatible ? '' : ' incompat'));
      row.innerHTML = `
        <span class="pi">
          <b>${escapeHtml(p.name)}</b>
          <small>${escapeHtml(partSummary(p, slot))}</small>
          ${slotErr.length ? `<small style="color:#ff9ba5">${escapeHtml(slotErr[0].msg)}</small>` : ''}
        </span>
        <span class="pp">
          <b>${owned ? '<span style="color:#39e6a4">OWNED</span>' : fmtMoney(p.price)}</b>
          <small style="color:${TIERS[p.tier].color}">${TIERS[p.tier].name}</small>
        </span>`;
      row.onmouseenter = () => { if (hover !== p.id) { hover = p.id; refreshTop(); } };
      row.onmouseleave = () => { if (hover === p.id) { hover = null; refreshTop(); } };
      row.onclick = () => {
        audio.ui(compatible ? 'click' : 'err');
        draft[slot] = draft[slot] === p.id && !SLOTS.find((s) => s.id === slot).req ? null : p.id;
        hover = null;
        refreshTop();
      };
      listWrap.appendChild(row);
    }
    if (!listWrap.children.length) listWrap.appendChild(el('div', 'empty', 'Nothing fits this frame yet.'));
    col2.appendChild(listWrap);
    wrap.appendChild(col2);

    /* ---------- column 3: spec ---------- */
    const col3 = el('div', 'bcol spec-col');
    const spec = el('div', 'spec-box');
    spec.innerHTML = buildSpecHtml(shown, cur, prev, draft);
    col3.appendChild(spec);

    const issues = el('div');
    for (const e of cur.validation.errors) issues.appendChild(el('div', 'note err', `<b>✕</b> ${escapeHtml(e.msg)}`));
    for (const w of cur.validation.warnings) issues.appendChild(el('div', 'note warn', `<b>!</b> ${escapeHtml(w.msg)}`));
    if (!cur.validation.errors.length && !cur.validation.warnings.length && draft.frame) {
      issues.appendChild(el('div', 'note ok', '<b>✓</b> Everything fits and nothing is going to catch fire.'));
    }
    for (const n of cur.validation.notes) issues.appendChild(el('div', 'note info', escapeHtml(n)));
    col3.appendChild(issues);
    wrap.appendChild(col3);

    /* ---------- footer ---------- */
    const cost = fitCost(draft, vehicle);
    const foot = el('div');
    foot.appendChild(el('div', '', `<span style="font-size:11.5px;color:#8592ad">Parts to buy</span>
      <b style="display:block;font-size:16px;color:${cost > economy.cash ? '#ff4d5e' : '#ffd34d'}">${fmtMoneyFull(cost)}</b>`));
    foot.appendChild(el('div', 'spacer'));
    foot.appendChild(btn('Revert', 'ghost', () => { draft = { ...vehicle.build }; hover = null; refreshTop(); }));
    const fitBtn = btn(cost > 0 ? `Buy & fit (${fmtMoney(cost)})` : 'Fit', 'primary', () => {
      const res = economy.applyBuild(vehicleId, draft);
      if (!res.ok) { game.hud.toast(escapeHtml(res.msg), 'bad'); audio.ui('err'); return; }
      audio.ui('ok');
      game.hud.toast(escapeHtml(res.msg), 'cash');
      if (economy.data.active === vehicleId) game.syncActiveVehicle();
      game.hud.setCash(economy.cash);
      closePanel();
    });
    if (cost > economy.cash) fitBtn.disabled = true;
    foot.appendChild(fitBtn);

    const tabs = el('div');
    tabs.appendChild(btn('Rename', 'ghost sm', () => {
      promptBox('Name this machine', 'Vehicle name', vehicle.name, (n) => { economy.renameVehicle(vehicleId, n); refreshTop(); }, { maxlength: 32 });
    }));
    tabs.appendChild(btn('Suggest a name', 'ghost sm', () => {
      economy.renameVehicle(vehicleId, autoName(draft)); refreshTop();
    }));

    return panel({
      title: vehicle.name,
      sub: isNew ? 'a bare frame — start with a frame, then hang parts off it' : 'build & tune',
      body: wrap, foot, tabs, headRight: cashChip(economy), fill: true,
      onBack: () => closePanel(),
    });
  }, {
    onClose: () => {
      // a brand-new empty vehicle that was never finished shouldn't linger
      if (isNew && !vehicle.build.frame) economy.removeVehicle(vehicleId);
    },
  });
}

/* ---------------- helpers ---------------- */
function fitCost(draft, vehicle) {
  let cost = 0;
  for (const s of SLOTS) {
    const id = draft[s.id];
    if (!id || vehicle.build[s.id] === id) continue;
    if (economy.spareCount(id, vehicle.id) < 1) cost += getPart(id).price;
  }
  return cost;
}

const kw = (w) => (w >= 1000 ? (w / 1000).toFixed(w >= 10000 ? 0 : 1) + ' kW' : Math.round(w) + ' W');

function partSummary(p, slot) {
  switch (slot) {
    case 'frame':
      return `${p.cls} · ${p.wheelSize}" · ${p.weight} kg · up to ${kw(p.maxMotorW)} · ${p.bayWh} Wh bay · ${p.seats} seat${p.seats > 1 ? 's' : ''}`;
    case 'motor':
      return `${MOUNTS[p.mount]} · ${kw(p.powerW)} (${kw(p.peakW)} peak) · ${p.voltMin}–${p.voltMax}V · ${p.ampsMax}A · ${p.torqueNm} Nm · ${p.weight} kg`;
    case 'battery':
      return `${p.volts}V ${p.ah}Ah = ${p.wh} Wh · ${p.maxA}A max · ${p.chem} · ${p.weight} kg`;
    case 'controller':
      return `${p.maxAmps}A · ${p.voltMin}–${p.voltMax}V · ${Math.round(p.eff * 100)}% efficient · ${p.weight} kg`;
    case 'tires':
      return `${p.size}" × ${p.width} mm · grip ${p.grip.toFixed(2)} · rated ${p.speedMph} mph · ${p.weight} kg`;
    case 'brakes':
      return `${p.force.toFixed(1)} m/s² · fade resistance ${Math.round(p.fade * 100)}% · ${p.weight} kg`;
    case 'suspension':
      return `${p.travel} mm travel · damping ${Math.round(p.damp * 100)}% · fits ${p.fits.join('/')}`;
    case 'cockpit':
      return `wheelie ×${p.wheelie.toFixed(2)} · control ×${p.control.toFixed(2)} · ${p.weight} kg`;
    case 'aero':
      return `drag ×${p.cdMul.toFixed(2)} · ${p.weight} kg`;
    case 'paint':
      return p.glow ? 'glows in the dark' : p.metal > 0.8 ? 'high metallic' : 'satin finish';
    default: return '';
  }
}

function bar(label, frac, value, cls = '') {
  return `<div class="stat ${cls}"><span>${label}</span><div class="bar"><i style="width:${clamp(frac, 0, 1) * 100}%"></i></div><b>${value}</b></div>`;
}

function delta(a, b) {
  if (b == null || Math.abs(a - b) < 1e-6) return '';
  return a > b ? 'delta-up' : 'delta-down';
}

function buildSpecHtml(shown, cur, prev, draft) {
  const s = shown;
  const c = prev ? cur : null;      // compare target
  const d = (key, val) => (c ? delta(val, c[key] ?? 0) : '');
  const rng = s.rangeKm === Infinity ? '∞' : Math.round(s.rangeKm) + ' km';

  return `
    <div style="font-size:11px;letter-spacing:.18em;color:#5c6883;font-weight:800;text-transform:uppercase">Performance</div>
    <div class="stats" style="margin-top:9px">
      ${bar('Top speed', (s.topSpeedMph / 310) ** 0.75, Math.round(s.topSpeedMph) + ' mph', d('topSpeedMph', s.topSpeedMph))}
      ${bar('Power', clamp(s.powerW / 300000, 0, 1) ** 0.35, kw(s.powerW), d('powerW', s.powerW))}
      ${bar('Torque', clamp(s.torqueNm / 5000, 0, 1) ** 0.35, Math.round(s.torqueNm) + ' Nm', d('torqueNm', s.torqueNm))}
      ${bar('Wheelie', s.wheelieEase / 2, s.wheelieEase.toFixed(2), d('wheelieEase', s.wheelieEase))}
      ${bar('Handling', s.handling, Math.round(s.handling * 100), d('handling', s.handling))}
      ${bar('Stability', s.stability, Math.round(s.stability * 100), d('stability', s.stability))}
      ${bar('Braking', clamp(s.brakeDecel / 30, 0, 1), s.brakeDecel.toFixed(1) + ' m/s²', d('brakeDecel', s.brakeDecel))}
      ${bar('Range', clamp((s.rangeKm === Infinity ? 400 : s.rangeKm) / 400, 0, 1) ** 0.6, rng, d('rangeKm', s.rangeKm === Infinity ? 1e9 : s.rangeKm))}
      ${bar('Durability', s.durability, Math.round(s.durability * 100), d('durability', s.durability))}
    </div>
    <div class="hr"></div>
    <div class="kv"><span>0–30 mph</span><b>${s.t30 ? s.t30.toFixed(1) + ' s' : '—'}</b></div>
    <div class="kv"><span>0–60 mph</span><b>${s.t60 ? s.t60.toFixed(1) + ' s' : '—'}</b></div>
    <div class="kv"><span>Weight (dry)</span><b>${s.dryMassKg.toFixed(1)} kg</b></div>
    <div class="kv"><span>Pack</span><b>${s.volts ? `${s.volts}V · ${s.wh} Wh · ${s.amps}A bus` : '—'}</b></div>
    <div class="kv"><span>Drag area</span><b>${s.cdA.toFixed(3)} m²</b></div>
    <div class="kv"><span>Speed limited by</span><b>${s.topLimit}</b></div>
    <div class="kv"><span>Seats</span><b>${s.seats}</b></div>
    <div class="hr"></div>
    <div class="kv"><span>Parts value</span><b style="color:#ffd34d">${fmtMoneyFull(buildValue(draft))}</b></div>
    ${prev ? '<div class="note info" style="margin-top:8px">Previewing — click to fit.</div>' : ''}`;
}

function specTable(st, v) {
  const rng = st.rangeKm === Infinity ? '∞' : Math.round(st.rangeKm) + ' km';
  let parts = '';
  for (const s of SLOTS) {
    const p = v.build[s.id] ? getPart(v.build[s.id]) : null;
    parts += `<div class="kv"><span>${s.icon} ${s.name}</span><b>${p ? escapeHtml(p.name) : '—'}</b></div>`;
  }
  return `
    <div class="stats">
      ${bar('Top speed', (st.topSpeedMph / 310) ** 0.75, Math.round(st.topSpeedMph) + ' mph')}
      ${bar('Power', clamp(st.powerW / 300000, 0, 1) ** 0.35, kw(st.powerW))}
      ${bar('Wheelie', st.wheelieEase / 2, st.wheelieEase.toFixed(2))}
      ${bar('Handling', st.handling, Math.round(st.handling * 100))}
      ${bar('Range', clamp((st.rangeKm === Infinity ? 400 : st.rangeKm) / 400, 0, 1) ** 0.6, rng)}
    </div>
    <div class="hr"></div>${parts}
    <div class="hr"></div>
    <div class="kv"><span>Odometer</span><b>${fmtDist(v.odo || 0)}</b></div>
    <div class="kv"><span>Parts value</span><b style="color:#ffd34d">${fmtMoneyFull(buildValue(v.build))}</b></div>`;
}

export { bar as statBar, kw as fmtKw, partSummary };
