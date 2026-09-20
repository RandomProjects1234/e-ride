/* ============================================================
   questui.js — the job board
   ============================================================ */
import { el, escapeHtml, clamp, fmtMoney, fmtMoneyFull, fmtDist, fmtTime } from '../core/util.js';
import { openPanel, closePanel, panel, tabBar, btn, refreshTop, confirmBox, cashChip } from './menus.js';
import { economy } from '../game/economy.js';
import { audio } from '../core/audio.js';

const ICON = {
  courier: '📦', checkpoint: '🚩', wheelie: '🔥', speed: '⚡', tour: '📸', trick: '🎪',
};

export function openQuestBoard(game) {
  const qs = game.quests;
  qs.refreshBoard();
  let tab = 'board';

  openPanel(() => {
    const body = el('div');

    if (tab === 'board') {
      if (qs.active) {
        body.appendChild(el('div', 'sec-title', 'In progress'));
        body.appendChild(activeCard(game, qs));
        body.appendChild(el('div', 'hr'));
      }
      body.appendChild(el('div', 'note info',
        'Jobs refresh every few minutes and pay more as you earn more. You can only run one at a time.'));
      const g = el('div', 'grid c2');
      g.style.marginTop = '12px';
      const board = economy.data.quests.board || [];
      if (!board.length) g.appendChild(el('div', 'empty', 'The board is empty. Check back shortly.'));
      for (const q of board) g.appendChild(jobCard(game, qs, q));
      body.appendChild(g);
    } else {
      body.appendChild(historyPane());
    }

    const tabs = tabBar([
      { id: 'board', label: 'Job board' },
      { id: 'history', label: 'History' },
    ], tab, (id) => { tab = id; refreshTop(); });

    const foot = el('div');
    foot.appendChild(btn('Refresh board', 'ghost', () => { qs.refreshBoard(true); refreshTop(); }));
    foot.appendChild(el('div', 'spacer'));
    foot.appendChild(btn('Close', 'primary', () => closePanel()));

    return panel({ title: 'Courier Depot', sub: 'contracts & challenges', body, foot, tabs, headRight: cashChip(economy) });
  });
}

function jobCard(game, qs, q) {
  const c = el('div', 'card');
  const dist = q.dist ? `· ${fmtDist(q.dist)}` : '';
  const timer = q.timeLimit ? `· ${fmtTime(q.timeLimit)} limit` : '· no timer';
  c.innerHTML = `
    <h4>${ICON[q.kind] || '•'} ${escapeHtml(q.title)}</h4>
    <div class="muted">${escapeHtml(q.client)} ${dist} ${timer}</div>
    <div class="muted" style="margin-top:7px">${escapeHtml(q.desc)}</div>
    ${q.cargo ? `<div class="muted" style="margin-top:5px;font-style:italic">Cargo: ${escapeHtml(q.cargo)}</div>` : ''}
    <div class="card-row"><span class="price">${fmtMoneyFull(q.reward)}</span></div>`;
  const r = el('div', 'card-row');
  const b = btn(qs.active ? 'Busy' : 'Accept', qs.active ? 'ghost sm' : 'primary sm', () => {
    qs.accept(q);
    audio.ui('ok');
    game.hud.toast(`📋 <b>${escapeHtml(q.title)}</b> accepted`, 'info', 3000);
    closePanel();
  });
  b.disabled = !!qs.active;
  r.appendChild(b);
  c.appendChild(r);
  return c;
}

function activeCard(game, qs) {
  const q = qs.active;
  const info = qs.trackerInfo();
  const c = el('div', 'card sel');
  c.innerHTML = `
    <h4>${ICON[q.kind] || '•'} ${escapeHtml(q.title)}</h4>
    <div class="muted">${escapeHtml(info.hint)}</div>
    <div class="qt-bar" style="margin-top:9px"><i style="width:${clamp(info.progress * 100, 0, 100)}%"></i></div>
    <div class="card-row"><span class="price">${fmtMoneyFull(q.reward)}</span></div>`;
  const r = el('div', 'card-row');
  r.appendChild(btn('Abandon', 'warn sm', () => {
    confirmBox('Abandon the job?', 'No penalty, but it leaves the board.', () => {
      qs.abandon(); game.hud.toast('Job abandoned.', 'bad'); refreshTop();
    }, 'Abandon', true);
  }));
  c.appendChild(r);
  return c;
}

function historyPane() {
  const w = el('div');
  const done = (economy.data.quests.done || []).slice().reverse();
  const r = economy.data.records;
  w.appendChild(el('div', '', `
    <div class="grid c3">
      ${statCard('Jobs done', r.questsDone)}
      ${statCard('Total earned', fmtMoney(r.earned))}
      ${statCard('Distance ridden', fmtDist(r.distance))}
      ${statCard('Best wheelie', r.bestWheelieTime.toFixed(1) + 's')}
      ${statCard('Longest wheelie', fmtDist(r.bestWheelieDist))}
      ${statCard('Crashes', r.crashes)}
    </div>`));
  w.appendChild(el('div', 'sec-title', 'Recent jobs'));
  if (!done.length) w.appendChild(el('div', 'empty', 'Nothing yet. Go and earn something.'));
  const list = el('div', 'plist');
  for (const d of done.slice(0, 25)) {
    const row = el('div', 'prow');
    row.innerHTML = `<span>${ICON[d.kind] || '•'}</span>
      <span style="flex:1">${escapeHtml(d.kind)}</span>
      <span style="color:#ffd34d;font-weight:800">${fmtMoney(d.reward)}</span>
      <span style="color:#5c6883;font-size:11px">${new Date(d.at).toLocaleDateString()}</span>`;
    list.appendChild(row);
  }
  w.appendChild(list);
  return w;
}

function statCard(label, value) {
  return `<div class="card" style="text-align:center">
    <div class="muted" style="font-size:10.5px;letter-spacing:.14em;text-transform:uppercase">${label}</div>
    <div style="font-size:23px;font-weight:900;margin-top:4px">${value}</div></div>`;
}
