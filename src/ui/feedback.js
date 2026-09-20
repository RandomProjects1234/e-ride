/* ============================================================
   feedback.js (ui) — the suggestion box and the owner's inbox
   ============================================================ */
import { el, escapeHtml, clamp, fmtTime } from '../core/util.js';
import { openPanel, closePanel, panel, tabBar, btn, refreshTop, confirmBox, infoBox, promptBox } from './menus.js';
import { feedback, KINDS, STATUS } from '../game/feedback.js';
import { VERSION } from '../core/version.js';
import { settings } from '../core/settings.js';
import { audio } from '../core/audio.js';
import { MS_TO_MPH } from '../core/util.js';

const REPO = 'RandomProjects1234/e-ride';

export function openFeedback(game, startTab = 'submit') {
  let tab = startTab;
  let kind = 'idea';
  let draftTitle = '', draftDetail = '';
  let filter = 'new';

  openPanel(() => {
    const body = el('div');
    const counts = feedback.counts();

    if (tab === 'submit') body.appendChild(submitPane(game, {
      kind, draftTitle, draftDetail,
      setKind: (k) => { kind = k; refreshTop(); },
      setTitle: (v) => { draftTitle = v; },
      setDetail: (v) => { draftDetail = v; },
      clear: () => { draftTitle = ''; draftDetail = ''; refreshTop(); },
    }));
    else if (tab === 'inbox') body.appendChild(inboxPane(game, filter, (f) => { filter = f; refreshTop(); }));
    else body.appendChild(changelogPane());

    const tabs = tabBar([
      { id: 'submit', label: '✍️ Suggest' },
      { id: 'inbox', label: `📥 Inbox (${counts.new || 0})` },
      { id: 'changelog', label: '📋 Roadmap' },
    ], tab, (id) => { tab = id; refreshTop(); });

    const foot = el('div');
    foot.appendChild(el('div', '', `<span style="font-size:11.5px;color:#5c6883">
      ${VERSION} · ${feedback.items.length} report${feedback.items.length === 1 ? '' : 's'} on this device
      ${feedback.serverAvailable === true ? '· <b style="color:#39e6a4">dev server connected</b>' : ''}</span>`));
    foot.appendChild(el('div', 'spacer'));
    foot.appendChild(btn('Close', 'primary', () => closePanel()));

    return panel({
      title: 'Suggestion box',
      sub: 'tell the developer what to build next',
      size: 'md', body, foot, tabs,
    });
  });
}

/* ---------------- submit ---------------- */
function submitPane(game, o) {
  const w = el('div');
  w.appendChild(el('div', 'note info',
    `Found a bug, or want something added? Write it here. Every report is read before the next update — the ones the developer approves are what gets built.`));

  w.appendChild(el('div', 'sec-title', 'What kind of report is it?'));
  const grid = el('div', 'grid c3');
  for (const k of KINDS) {
    const c = el('div', 'card' + (o.kind === k.id ? ' sel' : ''));
    c.style.cursor = 'pointer';
    c.innerHTML = `<h4>${k.icon} ${k.label}</h4><div class="muted">${escapeHtml(k.hint)}</div>`;
    c.onclick = () => { audio.ui('click'); o.setKind(k.id); };
    grid.appendChild(c);
  }
  w.appendChild(grid);

  const f1 = el('div', 'field');
  f1.style.marginTop = '14px';
  f1.appendChild(el('label', '', 'One-line summary'));
  const t = el('input');
  t.type = 'text'; t.maxLength = 90; t.value = o.draftTitle;
  t.placeholder = o.kind === 'bug' ? 'e.g. the bike falls through the pier' : 'e.g. add a night mode';
  t.oninput = () => o.setTitle(t.value);
  f1.appendChild(t);
  w.appendChild(f1);

  const f2 = el('div', 'field');
  f2.appendChild(el('label', '', 'Details — what happened, or how it should work'));
  const d = el('textarea');
  d.rows = 5; d.maxLength = 1200; d.value = o.draftDetail;
  d.placeholder = o.kind === 'bug'
    ? 'What were you riding, where were you, and what did you do just before it went wrong?'
    : 'Describe it. Be specific — "a 6-bike convoy mission" beats "more multiplayer stuff".';
  d.oninput = () => o.setDetail(d.value);
  f2.appendChild(d);
  w.appendChild(f2);

  const ctx = grabContext(game);
  w.appendChild(el('div', 'note', `<span style="color:#5c6883;font-size:11.5px">
    Attached automatically: ${escapeHtml(ctx.district || 'unknown area')} (${ctx.x}, ${ctx.z}) ·
    riding a ${escapeHtml(ctx.vehicle)} · ${ctx.fps} fps · ${VERSION}</span>`));

  const row = el('div', 'row');
  row.style.marginTop = '12px';
  const send = btn('Send it', 'primary', () => {
    const res = feedback.add({
      kind: o.kind, title: t.value, detail: d.value,
      from: settings.get('name') || 'anonymous',
      context: ctx,
    });
    if (!res.ok) { game.hud.toast(escapeHtml(res.msg), 'bad'); audio.ui('err'); return; }
    audio.ui('ok');
    game.hud.toast('📬 Suggestion filed — thank you', 'info', 3000);
    o.clear();
    setTimeout(() => {
      if (feedback.serverAvailable === false) offerManualDelivery(res.item);
    }, 250);
  });
  send.style.flex = '0 0 auto';
  row.appendChild(send);
  row.appendChild(btn('Clear', 'ghost', () => o.clear()));
  w.appendChild(row);
  return w;
}

function grabContext(game) {
  const b = game && game.player ? game.player.body : null;
  const d = b ? game.world.districtAt(b.pos.x, b.pos.z) : null;
  const v = game && game.player ? (game.player.stats.parts.frame?.name || 'unknown') : 'unknown';
  return {
    x: b ? Math.round(b.pos.x) : 0,
    z: b ? Math.round(b.pos.z) : 0,
    district: d ? d.name : null,
    vehicle: v,
    speedMph: b ? Math.round(Math.abs(b.speed) * MS_TO_MPH) : 0,
    fps: game ? Math.round(game.engine.fps) : 0,
    ua: navigator.userAgent.slice(0, 90),
  };
}

function offerManualDelivery(item) {
  const url = feedback.issueUrl(item, REPO);
  openPanel(() => {
    const body = el('div');
    body.appendChild(el('div', 'note warn',
      `This build has no server to send to, so the report is saved on your device. Pass it to the developer one of these ways:`));
    const row = el('div', 'row');
    row.style.marginTop = '12px';
    row.appendChild(btn('Copy the report', '', () => {
      navigator.clipboard?.writeText(feedback.exportMarkdown((x) => x.id === item.id));
      audio.ui('ok');
    }));
    if (url) {
      row.appendChild(btn('Open a GitHub issue', 'primary', () => window.open(url, '_blank', 'noopener')));
    }
    body.appendChild(row);
    const foot = el('div');
    foot.appendChild(btn('Done', 'primary', () => closePanel()));
    return panel({ title: 'Saved locally', size: 'sm', body, foot });
  });
}

/* ---------------- inbox (owner review) ---------------- */
function inboxPane(game, filter, setFilter) {
  const w = el('div');
  const counts = feedback.counts();

  w.appendChild(el('div', 'note info',
    'Every report filed on this device. Approve the ones worth building — approved items are the to-do list for the next update.'));

  const fr = el('div', 'tabs');
  fr.style.margin = '12px 0';
  for (const f of [
    { id: 'new', label: `New (${counts.new || 0})` },
    { id: 'approved', label: `Approved (${counts.approved || 0})` },
    { id: 'rejected', label: `Rejected (${counts.rejected || 0})` },
    { id: 'shipped', label: `Shipped (${counts.shipped || 0})` },
    { id: 'all', label: 'All' },
  ]) {
    const b = el('button', 'tab' + (filter === f.id ? ' on' : ''), f.label);
    b.onclick = () => setFilter(f.id);
    fr.appendChild(b);
  }
  w.appendChild(fr);

  const items = feedback.items.filter((i) => filter === 'all' || i.status === filter);
  if (!items.length) {
    w.appendChild(el('div', 'empty', filter === 'new'
      ? 'Nothing new. Anything players file shows up here.'
      : 'Nothing in this list.'));
  }

  for (const it of items) {
    const k = KINDS.find((x) => x.id === it.kind) || KINDS[1];
    const st = STATUS[it.status];
    const c = el('div', 'card');
    c.innerHTML = `
      <span class="tier" style="background:${st.color}22;color:${st.color}">${st.label.toUpperCase()}</span>
      <h4>${k.icon} #${it.n} ${escapeHtml(it.title)}</h4>
      <div class="muted">${escapeHtml(it.from)} · ${new Date(it.at).toLocaleString()} · ${escapeHtml(it.version)}
        ${it.votes > 1 ? `· <b style="color:#39e6a4">${it.votes} votes</b>` : ''}
        ${it.sent ? '· <span style="color:#39e6a4">delivered</span>' : ''}</div>
      ${it.detail ? `<div class="muted" style="margin-top:8px;white-space:pre-wrap">${escapeHtml(it.detail)}</div>` : ''}
      ${it.context ? `<div class="muted" style="margin-top:7px;font-size:10.5px;color:#5c6883">
        ${escapeHtml(it.context.district || 'unknown')} (${it.context.x}, ${it.context.z}) ·
        ${escapeHtml(it.context.vehicle)} · ${it.context.fps} fps</div>` : ''}`;
    const row = el('div', 'card-row');
    if (it.status !== 'approved') {
      row.appendChild(btn('✓ Approve', 'primary sm', () => {
        feedback.setStatus(it.id, 'approved'); audio.ui('ok');
        game.hud.toast(`Approved: ${escapeHtml(it.title)}`, 'info');
        refreshTop();
      }));
    }
    if (it.status !== 'rejected') {
      row.appendChild(btn('✕ Reject', 'ghost sm', () => { feedback.setStatus(it.id, 'rejected'); refreshTop(); }));
    }
    if (it.status === 'approved') {
      row.appendChild(btn('Mark shipped', 'ghost sm', () => { feedback.setStatus(it.id, 'shipped'); refreshTop(); }));
    }
    row.appendChild(btn('🗑', 'ghost sm', () => {
      confirmBox('Delete this report?', escapeHtml(it.title), () => { feedback.remove(it.id); refreshTop(); }, 'Delete', true);
    }));
    c.appendChild(row);
    w.appendChild(c);
  }

  const tools = el('div', 'row');
  tools.style.marginTop = '14px';
  tools.appendChild(btn('Copy approved as a to-do list', '', () => {
    navigator.clipboard?.writeText(feedback.exportMarkdown((x) => x.status === 'approved'));
    game.hud.toast('Approved list copied to the clipboard', 'info');
    audio.ui('ok');
  }));
  tools.appendChild(btn('Copy everything (JSON)', 'ghost', () => {
    navigator.clipboard?.writeText(feedback.exportJson());
    game.hud.toast('All reports copied as JSON', 'info');
  }));
  tools.appendChild(btn('Download for the dev', 'ghost', () => {
    const blob = new Blob([feedback.exportMarkdown()], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'e-ride-suggestions.md';
    a.click();
  }));
  if (feedback.items.some((i) => !i.sent)) {
    tools.appendChild(btn('Retry delivery', 'ghost', async () => {
      const n = await feedback.flush();
      game.hud.toast(n ? `Delivered ${n} report${n === 1 ? '' : 's'}` : 'No dev server reachable', n ? 'info' : 'bad');
      refreshTop();
    }));
  }
  w.appendChild(tools);
  return w;
}

/* ---------------- roadmap ---------------- */
const CHANGELOG = [
  {
    v: VERSION, when: 'First public beta — Volta Bay',
    lines: [
      'The whole of Volta Bay: downtown, Cellside, Cell Works, Torque Ridge, Amp Park, the Bay Front and the Mile.',
      'Three starter machines and ten more to buy, from a 250 W commuter hub to a 900 kW reactor drive.',
      'Part-by-part building with real compatibility rules — voltage, current, mounts, bay size, tyre ratings.',
      'Wheelie balance, air, trick combos and the ride-out bonus.',
      'Courier runs, checkpoint dashes, wheelie contracts, speed traps and trick jams.',
      'Six-player multiplayer with shared bikes — driver and passenger on one machine.',
      'Roblox-style camera: hold right mouse to look around, scroll to zoom.',
      'Touch controls and fully rebindable keys.',
      'This suggestion box — tell me what to build for BETA 0.2.',
    ],
  },
];

function changelogPane() {
  const w = el('div');
  const approved = feedback.items.filter((i) => i.status === 'approved');
  w.appendChild(el('div', 'sec-title', 'Coming in the next update'));
  if (!approved.length) {
    w.appendChild(el('div', 'empty', 'Nothing approved yet. Approved suggestions appear here as the plan for the next version.'));
  } else {
    const list = el('div', 'plist');
    for (const i of approved) {
      const k = KINDS.find((x) => x.id === i.kind) || KINDS[1];
      const r = el('div', 'prow');
      r.innerHTML = `<span>${k.icon}</span><span style="flex:1">${escapeHtml(i.title)}</span>
        <span class="chip good">approved</span>`;
      list.appendChild(r);
    }
    w.appendChild(list);
  }

  for (const c of CHANGELOG) {
    w.appendChild(el('div', 'sec-title', `${c.when} · ${c.v}`));
    const ul = el('div');
    ul.innerHTML = '<ul style="margin:0;padding-left:18px;font-size:12.5px;color:#b9c3d6;line-height:1.75">' +
      c.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('') + '</ul>';
    w.appendChild(ul);
  }
  return w;
}
