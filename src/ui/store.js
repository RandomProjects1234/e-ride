/* ============================================================
   store.js — VoltMart: buy parts and complete vehicles
   ============================================================ */
import { el, escapeHtml, clamp, fmtMoney, fmtMoneyFull } from '../core/util.js';
import { openPanel, closePanel, panel, tabBar, btn, refreshTop, confirmBox, infoBox, cashChip } from './menus.js';
import { economy, presetPrice, SELL_RATE } from '../game/economy.js';
import { PARTS, SLOTS, TIERS, getPart, partsInSlot, PRESETS } from '../vehicle/parts.js';
import { stats as computeStats, buildFromPreset, buildValue } from '../vehicle/build.js';
import { statBar as bar, fmtKw as kw, partSummary } from './garage.js';
import { audio } from '../core/audio.js';

export function openStore(game) {
  let tab = 'vehicles';
  let slotFilter = 'frame';
  let tierFilter = 'all';
  let search = '';

  openPanel(() => {
    const body = el('div');

    if (tab === 'vehicles') body.appendChild(vehiclePane(game));
    else if (tab === 'parts') body.appendChild(partsPane(game, {
      slotFilter, tierFilter, search,
      setSlot: (v) => { slotFilter = v; refreshTop(); },
      setTier: (v) => { tierFilter = v; refreshTop(); },
      setSearch: (v) => { search = v; },
    }));
    else body.appendChild(sellPane(game));

    const tabs = tabBar([
      { id: 'vehicles', label: 'Complete rides' },
      { id: 'parts', label: 'Parts' },
      { id: 'sell', label: 'Sell to us' },
    ], tab, (id) => { tab = id; refreshTop(); });

    const foot = el('div');
    foot.appendChild(el('div', '', `<span style="font-size:11.5px;color:#5c6883">
      VoltMart buys anything back at ${Math.round(SELL_RATE * 100)}%. For a better price, list it on the Swap Meet.</span>`));
    foot.appendChild(el('div', 'spacer'));
    foot.appendChild(btn('Close', 'primary', () => closePanel()));

    return panel({ title: 'VoltMart', sub: 'parts & complete machines', body, foot, tabs, headRight: cashChip(economy) });
  });
}

/* ---------------- complete vehicles ---------------- */
function vehiclePane(game) {
  const w = el('div');
  w.appendChild(el('div', 'note info',
    'Buying complete adds every part to your inventory too — handy if you want to strip it for a build.'));
  const g = el('div', 'grid c2');
  g.style.marginTop = '12px';
  const sorted = PRESETS.slice().sort((a, b) => presetPrice(a) - presetPrice(b));
  for (const p of sorted) {
    const st = computeStats(buildFromPreset(p.id), { riders: 1 });
    const price = presetPrice(p);
    const afford = economy.canAfford(price);
    const c = el('div', 'card' + (afford ? '' : ' locked'));
    c.innerHTML = `
      <span class="tier t-${st.tier}">${TIERS[st.tier].name}</span>
      <h4>${escapeHtml(p.name)}</h4>
      <div class="muted">${escapeHtml(p.blurb)}</div>
      <div class="stats">
        ${bar('Top speed', (st.topSpeedMph / 310) ** 0.75, Math.round(st.topSpeedMph) + ' mph')}
        ${bar('Power', clamp(st.powerW / 300000, 0, 1) ** 0.35, kw(st.powerW))}
        ${bar('Wheelie', st.wheelieEase / 2, st.wheelieEase.toFixed(2))}
        ${bar('Handling', st.handling, Math.round(st.handling * 100))}
      </div>
      <div class="card-row"><span class="price">${fmtMoneyFull(price)}</span></div>`;
    const r = el('div', 'card-row');
    const b = btn(afford ? 'Buy' : 'Too expensive', afford ? 'primary sm' : 'ghost sm', () => {
      confirmBox(`Buy a ${p.name}?`, `${fmtMoneyFull(price)} out of your ${fmtMoneyFull(economy.cash)}.`, () => {
        const res = economy.buyPreset(p.id);
        audio.ui(res.ok ? 'ok' : 'err');
        game.hud.toast(escapeHtml(res.msg), res.ok ? 'cash' : 'bad');
        game.hud.setCash(economy.cash);
        refreshTop();
      }, 'Buy it');
    });
    b.disabled = !afford;
    r.appendChild(b);
    r.appendChild(btn('Specs', 'ghost sm', () => showSpecs(p.name, st)));
    c.appendChild(r);
    g.appendChild(c);
  }
  w.appendChild(g);
  return w;
}

function showSpecs(name, st) {
  const rng = st.rangeKm === Infinity ? '∞' : Math.round(st.rangeKm) + ' km';
  let rows = '';
  for (const s of SLOTS) {
    const p = st.parts[s.id];
    rows += `<div class="kv"><span>${s.icon} ${s.name}</span><b>${p ? escapeHtml(p.name) : '—'}</b></div>`;
  }
  infoBox(name, `
    <div class="stats">
      ${bar('Top speed', (st.topSpeedMph / 310) ** 0.75, Math.round(st.topSpeedMph) + ' mph')}
      ${bar('Power', clamp(st.powerW / 300000, 0, 1) ** 0.35, kw(st.powerW))}
      ${bar('Torque', clamp(st.torqueNm / 5000, 0, 1) ** 0.35, Math.round(st.torqueNm) + ' Nm')}
      ${bar('Wheelie', st.wheelieEase / 2, st.wheelieEase.toFixed(2))}
      ${bar('Handling', st.handling, Math.round(st.handling * 100))}
      ${bar('Stability', st.stability, Math.round(st.stability * 100))}
      ${bar('Range', clamp((st.rangeKm === Infinity ? 400 : st.rangeKm) / 400, 0, 1) ** 0.6, rng)}
    </div>
    <div class="hr"></div>
    <div class="kv"><span>0–30 / 0–60 mph</span><b>${st.t30 ? st.t30.toFixed(1) + 's' : '—'} / ${st.t60 ? st.t60.toFixed(1) + 's' : '—'}</b></div>
    <div class="kv"><span>Weight (dry)</span><b>${st.dryMassKg.toFixed(1)} kg</b></div>
    <div class="kv"><span>Limited by</span><b>${st.topLimit}</b></div>
    <div class="hr"></div>${rows}`, { size: 'sm' });
}

/* ---------------- parts ---------------- */
function partsPane(game, o) {
  const w = el('div');

  const filters = el('div');
  filters.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center';
  const slotTabs = el('div', 'tabs');
  for (const s of SLOTS) {
    const b = el('button', 'tab' + (o.slotFilter === s.id ? ' on' : ''), `${s.icon} ${s.name}`);
    b.onclick = () => o.setSlot(s.id);
    slotTabs.appendChild(b);
  }
  filters.appendChild(slotTabs);
  w.appendChild(filters);

  const row2 = el('div');
  row2.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center';
  const tierTabs = el('div', 'tabs');
  const tierOpts = [{ id: 'all', label: 'All tiers' }, ...Object.keys(TIERS).map((k) => ({ id: k, label: TIERS[k].name }))];
  for (const t of tierOpts) {
    const b = el('button', 'tab' + (o.tierFilter === t.id ? ' on' : ''), t.label);
    if (t.id !== 'all') b.style.color = TIERS[t.id].color;
    b.onclick = () => o.setTier(t.id);
    tierTabs.appendChild(b);
  }
  row2.appendChild(tierTabs);
  const si = el('input');
  si.type = 'text'; si.placeholder = 'search…'; si.value = o.search;
  si.style.cssText = 'background:#10182b;border:1px solid #27324f;border-radius:9px;padding:6px 11px;color:#e7ecf7;font:inherit;font-size:12.5px;width:150px';
  si.oninput = () => { o.setSearch(si.value); renderList(); };
  row2.appendChild(si);
  w.appendChild(row2);

  const list = el('div', 'part-list');
  list.style.maxHeight = '420px';
  w.appendChild(list);

  function renderList() {
    list.innerHTML = '';
    let items = partsInSlot(o.slotFilter);
    if (o.tierFilter !== 'all') items = items.filter((p) => p.tier === o.tierFilter);
    const q = (si.value || '').toLowerCase().trim();
    if (q) items = items.filter((p) => (p.name + ' ' + (p.brand || '') + ' ' + (p.desc || '')).toLowerCase().includes(q));
    items = items.slice().sort((a, b) => (TIERS[a.tier].order - TIERS[b.tier].order) || (a.price - b.price));

    if (!items.length) { list.appendChild(el('div', 'empty', 'Nothing matches.')); return; }

    for (const p of items) {
      const owned = economy.ownedCount(p.id);
      const afford = economy.canAfford(p.price);
      const row = el('div', 'part');
      row.style.cursor = 'default';
      row.innerHTML = `
        <span class="pi">
          <b>${escapeHtml(p.name)} ${owned ? `<span class="chip good">×${owned}</span>` : ''}</b>
          <small>${escapeHtml(partSummary(p, o.slotFilter))}</small>
          ${p.desc ? `<small style="color:#6d7b96;font-style:italic">${escapeHtml(p.desc)}</small>` : ''}
        </span>
        <span class="pp">
          <b>${fmtMoneyFull(p.price)}</b>
          <small style="color:${TIERS[p.tier].color}">${TIERS[p.tier].name}</small>
        </span>`;
      const b = btn('Buy', afford ? 'primary sm' : 'ghost sm', () => {
        const res = economy.buyPart(p.id);
        audio.ui(res.ok ? 'ok' : 'err');
        game.hud.toast(escapeHtml(res.msg), res.ok ? 'cash' : 'bad');
        game.hud.setCash(economy.cash);
        renderList();
      });
      b.disabled = !afford;
      b.style.marginLeft = '8px';
      row.appendChild(b);
      list.appendChild(row);
    }
  }
  renderList();
  return w;
}

/* ---------------- sell parts back ---------------- */
function sellPane(game) {
  const w = el('div');
  w.appendChild(el('div', 'note info',
    `Only spare parts can be sold — anything bolted to a vehicle in your garage stays put. VoltMart pays ${Math.round(SELL_RATE * 100)}% of list.`));
  const list = el('div', 'part-list');
  list.style.maxHeight = '440px';
  list.style.marginTop = '12px';

  const ids = Object.keys(economy.data.ownedParts);
  const spares = ids.map((id) => ({ p: getPart(id), n: economy.spareCount(id) }))
    .filter((x) => x.p && x.n > 0)
    .sort((a, b) => b.p.price - a.p.price);

  if (!spares.length) list.appendChild(el('div', 'empty', 'No spare parts. Everything you own is fitted to something.'));

  for (const { p, n } of spares) {
    const price = Math.round(p.price * SELL_RATE);
    const row = el('div', 'part');
    row.style.cursor = 'default';
    row.innerHTML = `
      <span class="pi"><b>${escapeHtml(p.name)} <span class="chip">×${n} spare</span></b>
      <small>${escapeHtml(partSummary(p, p.slot))}</small></span>
      <span class="pp"><b>${fmtMoneyFull(price)}</b><small>each</small></span>`;
    const b = btn('Sell one', 'sm', () => {
      const res = economy.sellPart(p.id);
      audio.ui(res.ok ? 'ok' : 'err');
      game.hud.toast(escapeHtml(res.msg), res.ok ? 'cash' : 'bad');
      game.hud.setCash(economy.cash);
      refreshTop();
    });
    b.style.marginLeft = '8px';
    row.appendChild(b);
    list.appendChild(row);
  }
  w.appendChild(list);
  return w;
}
