/* ============================================================
   market.js — The Swap Meet: player-facing vehicle marketplace
   ============================================================ */
import { el, escapeHtml, clamp, fmtMoney, fmtMoneyFull } from '../core/util.js';
import { openPanel, closePanel, panel, tabBar, btn, refreshTop, confirmBox, infoBox, promptBox, cashChip } from './menus.js';
import { economy, LIST_FEE } from '../game/economy.js';
import { SLOTS, TIERS, getPart } from '../vehicle/parts.js';
import { stats as computeStats, buildValue } from '../vehicle/build.js';
import { statBar as bar, fmtKw as kw } from './garage.js';
import { audio } from '../core/audio.js';

export function openMarket(game) {
  let tab = 'buy';
  economy.refreshMarket();

  openPanel(() => {
    const body = el('div');
    if (tab === 'buy') body.appendChild(buyPane(game));
    else body.appendChild(sellPane(game));

    const tabs = tabBar([
      { id: 'buy', label: `Buying (${economy.data.market.length})` },
      { id: 'sell', label: `Your listings (${economy.data.listings.length})` },
    ], tab, (id) => { tab = id; refreshTop(); });

    const foot = el('div');
    foot.appendChild(btn('Refresh listings', 'ghost', () => { economy.refreshMarket(true); refreshTop(); }));
    foot.appendChild(el('div', 'spacer'));
    foot.appendChild(btn('Close', 'primary', () => closePanel()));

    return panel({ title: 'The Swap Meet', sub: 'built machines, bought and sold', body, foot, tabs, headRight: cashChip(economy) });
  });
}

function buyPane(game) {
  const w = el('div');
  w.appendChild(el('div', 'note info',
    'Everything here was thrown together by somebody else. Some of it is a bargain; some of it does not run. Check the spec before you hand over cash.'));
  const g = el('div', 'grid c2');
  g.style.marginTop = '12px';

  if (!economy.data.market.length) g.appendChild(el('div', 'empty', 'Nothing for sale right now.'));

  for (const l of economy.data.market) {
    const st = computeStats(l.build, { riders: 1 });
    const val = buildValue(l.build);
    const deal = val / Math.max(l.price, 1);
    const c = el('div', 'card');
    c.innerHTML = `
      <span class="tier t-${st.tier}">${TIERS[st.tier].name}</span>
      <h4>${escapeHtml(l.name)}</h4>
      <div class="muted">listed by <b style="color:#8fa3c9">${escapeHtml(l.seller)}</b>
        ${l.broken ? '<span class="chip bad" style="margin-left:6px">does not run</span>' : ''}
        ${deal > 1.5 && !l.broken ? '<span class="chip good" style="margin-left:6px">bargain</span>' : ''}
        ${deal < 0.95 ? '<span class="chip" style="margin-left:6px">overpriced</span>' : ''}</div>
      <div class="stats">
        ${bar('Top speed', (st.topSpeedMph / 310) ** 0.75, st.valid ? Math.round(st.topSpeedMph) + ' mph' : '—')}
        ${bar('Power', clamp(st.powerW / 300000, 0, 1) ** 0.35, kw(st.powerW))}
        ${bar('Wheelie', st.wheelieEase / 2, st.wheelieEase.toFixed(2))}
      </div>
      <div class="card-row">
        <span class="price">${fmtMoneyFull(l.price)}</span>
        <span class="muted">parts worth ${fmtMoney(val)}</span>
      </div>`;
    const r = el('div', 'card-row');
    const afford = economy.canAfford(l.price);
    const b = btn(afford ? 'Buy' : 'Too expensive', afford ? 'primary sm' : 'ghost sm', () => {
      confirmBox(`Buy ${l.name}?`, l.broken
        ? `It <b>does not run</b> as configured — you would be buying it for parts or to fix. ${fmtMoneyFull(l.price)}.`
        : `${fmtMoneyFull(l.price)} from ${escapeHtml(l.seller)}. The parts alone are worth about ${fmtMoney(val)}.`,
        () => {
          const res = economy.buyListing(l.id);
          audio.ui(res.ok ? 'ok' : 'err');
          game.hud.toast(escapeHtml(res.msg), res.ok ? 'cash' : 'bad');
          game.hud.setCash(economy.cash);
          refreshTop();
        }, 'Buy it');
    });
    b.disabled = !afford;
    r.appendChild(b);
    r.appendChild(btn('Inspect', 'ghost sm', () => inspect(l, st)));
    c.appendChild(r);
    g.appendChild(c);
  }
  w.appendChild(g);
  return w;
}

function inspect(l, st) {
  let rows = '';
  for (const s of SLOTS) {
    const p = st.parts[s.id];
    rows += `<div class="kv"><span>${s.icon} ${s.name}</span><b>${p ? escapeHtml(p.name) : '—'}</b></div>`;
  }
  let issues = '';
  for (const e of st.validation.errors) issues += `<div class="note err">${escapeHtml(e.msg)}</div>`;
  for (const e of st.validation.warnings) issues += `<div class="note warn">${escapeHtml(e.msg)}</div>`;
  infoBox(l.name, `
    <div class="muted" style="margin-bottom:10px">Listed by ${escapeHtml(l.seller)} for ${fmtMoneyFull(l.price)}</div>
    ${rows}${issues || '<div class="note ok">No problems found — it will run as it is.</div>'}`, { size: 'sm' });
}

/* ---------------- selling ---------------- */
function sellPane(game) {
  const w = el('div');
  w.appendChild(el('div', 'note info',
    `List a machine and other riders will make offers over time. Price it near its real worth and it sells fast;
     get greedy and it sits there. Listing fee is ${Math.round(LIST_FEE * 100)}%.`));

  if (economy.data.listings.length) {
    w.appendChild(el('div', 'sec-title', 'Live listings'));
    const g = el('div', 'grid c2');
    for (const l of economy.data.listings) {
      const fair = l.value * 0.82;
      const ratio = fair / Math.max(l.price, 1);
      const c = el('div', 'card');
      c.innerHTML = `
        <h4>${escapeHtml(l.name)}</h4>
        <div class="muted">Asking <b style="color:#ffd34d">${fmtMoneyFull(l.price)}</b> ·
          fair value about ${fmtMoney(fair)} · ${Math.round(l.views)} views</div>
        <div class="note ${ratio > 1.1 ? 'ok' : ratio > 0.8 ? 'info' : 'warn'}">
          ${ratio > 1.1 ? 'Priced to move — expect a buyer soon.'
            : ratio > 0.8 ? 'Fairly priced. Someone will bite eventually.'
            : 'Well over the odds. This may never sell.'}
        </div>`;
      if (l.offers.length) {
        const oh = el('div');
        oh.style.marginTop = '8px';
        for (let i = 0; i < l.offers.length; i++) {
          const o = l.offers[i];
          const r = el('div', 'card-row');
          r.style.margin = '5px 0';
          r.appendChild(el('span', 'muted', `${escapeHtml(o.from)} offers <b style="color:#ffd34d">${fmtMoneyFull(o.amount)}</b>`));
          r.appendChild(btn('Accept', 'primary sm', () => {
            const res = economy.acceptOffer(l.id, i);
            audio.ui('ok');
            game.hud.toast(escapeHtml(res.msg), 'cash');
            game.hud.setCash(economy.cash);
            refreshTop();
          }));
          oh.appendChild(r);
        }
        c.appendChild(oh);
      }
      const r = el('div', 'card-row');
      r.appendChild(btn('Change price', 'ghost sm', () => {
        promptBox('New asking price', 'Price ($)', l.price, (v) => {
          l.price = Math.max(1, Math.round(v)); economy.save(); refreshTop();
        }, { number: true, min: 1 });
      }));
      r.appendChild(btn('Pull it', 'warn sm', () => {
        const res = economy.delistVehicle(l.id);
        game.hud.toast(escapeHtml(res.msg), res.ok ? '' : 'bad');
        refreshTop();
      }));
      c.appendChild(r);
      g.appendChild(c);
    }
    w.appendChild(g);
  }

  w.appendChild(el('div', 'sec-title', 'List one of yours'));
  const g2 = el('div', 'grid c2');
  const sellable = economy.vehicles.filter((v) => economy.vehicles.length > 1);
  if (!sellable.length) g2.appendChild(el('div', 'empty', 'You need more than one vehicle before you can sell one.'));
  for (const v of sellable) {
    const val = buildValue(v.build);
    const st = computeStats(v.build, { riders: 1 });
    const c = el('div', 'card');
    c.innerHTML = `
      <span class="tier t-${st.tier}">${TIERS[st.tier].name}</span>
      <h4>${escapeHtml(v.name)}</h4>
      <div class="muted">Parts value ${fmtMoney(val)} · suggested ask ${fmtMoney(val * 0.86)}</div>`;
    const r = el('div', 'card-row');
    r.appendChild(btn('List it', 'primary sm', () => {
      promptBox(`List ${v.name}`, 'Asking price ($)', Math.round(val * 0.86), (price) => {
        const res = economy.listVehicle(v.id, Math.max(1, Math.round(price)));
        audio.ui(res.ok ? 'ok' : 'err');
        game.hud.toast(escapeHtml(res.msg), res.ok ? 'cash' : 'bad');
        game.hud.setCash(economy.cash);
        if (res.ok) game.syncActiveVehicle();
        refreshTop();
      }, { number: true, min: 1, okLabel: 'List it', note: `Fee is ${Math.round(LIST_FEE * 100)}% of the asking price, paid now.` });
    }));
    c.appendChild(r);
    g2.appendChild(c);
  }
  w.appendChild(g2);
  return w;
}
