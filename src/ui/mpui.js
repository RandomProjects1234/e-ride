/* ============================================================
   mpui.js — multiplayer connection + player list + chat
   ============================================================ */
import { el, escapeHtml, uid } from '../core/util.js';
import { openPanel, closePanel, panel, btn, refreshTop, infoBox, tabBar } from './menus.js';
import { MAX_PLAYERS, defaultServerUrl } from '../net/client.js';
import { RIDER_COLORS } from '../game/player.js';
import { settings } from '../core/settings.js';

export function openMultiplayer(game) {
  const net = game.net;
  net.onUpdate = () => refreshTop();

  openPanel(() => {
    const body = el('div');

    /* ---- status ---- */
    const dotColor = net.connected ? '#39e6a4' : net.connecting ? '#ffb020' : net.status === 'error' ? '#ff4d5e' : '#5c6883';
    const statusText = net.connected
      ? `Connected — room “${escapeHtml(net.room)}” · ${net.playerCount}/${MAX_PLAYERS} riders · ${net.ping} ms`
      : net.connecting ? 'Connecting…'
      : net.status === 'error' ? escapeHtml(net.error || 'Connection failed')
      : 'Offline — riding solo';
    const st = el('div', 'prow');
    st.innerHTML = `<span class="dot" style="background:${dotColor}"></span><span style="flex:1">${statusText}</span>`;
    body.appendChild(st);

    /* ---- settings ---- */
    const f1 = el('div', 'field');
    f1.appendChild(el('label', '', 'Server address'));
    const urlIn = el('input');
    urlIn.type = 'text';
    urlIn.value = net.url;
    urlIn.placeholder = 'ws://localhost:3496  or  wss://your-host.example.com';
    urlIn.onchange = () => net.setUrl(urlIn.value);
    f1.appendChild(urlIn);
    body.appendChild(f1);

    const row = el('div', 'row');
    const f2 = el('div', 'field');
    f2.appendChild(el('label', '', 'Room'));
    const roomIn = el('input');
    roomIn.type = 'text'; roomIn.maxLength = 24;
    roomIn.value = net.room;
    roomIn.placeholder = 'leave blank to auto-join';
    roomIn.onchange = () => net.setRoom(roomIn.value);
    f2.appendChild(roomIn);
    row.appendChild(f2);

    const f3 = el('div', 'field');
    f3.appendChild(el('label', '', 'Your name'));
    const nameIn = el('input');
    nameIn.type = 'text'; nameIn.maxLength = 16;
    nameIn.value = settings.get('name') || '';
    nameIn.onchange = () => { settings.set('name', nameIn.value.slice(0, 16)); game.onNameChanged(); };
    f3.appendChild(nameIn);
    row.appendChild(f3);
    body.appendChild(row);

    const btnRow = el('div', 'row');
    btnRow.style.marginBottom = '12px';
    if (net.connected) {
      btnRow.appendChild(btn('Disconnect', 'warn', () => { net.disconnect(); refreshTop(); }));
      btnRow.appendChild(btn('Copy room link', 'ghost', () => {
        const u = new URL(location.href);
        u.searchParams.set('room', net.room);
        u.searchParams.set('server', net.url);
        navigator.clipboard?.writeText(u.toString());
        game.hud.toast('Invite link copied to the clipboard', 'info');
      }));
    } else {
      btnRow.appendChild(btn(net.connecting ? 'Connecting…' : 'Connect', 'primary', () => {
        net.setUrl(urlIn.value); net.setRoom(roomIn.value);
        net.connect(); refreshTop();
      }));
      btnRow.appendChild(btn('New random room', 'ghost', () => {
        roomIn.value = uid(6); net.setRoom(roomIn.value); refreshTop();
      }));
    }
    body.appendChild(btnRow);

    /* ---- players ---- */
    if (net.connected) {
      body.appendChild(el('div', 'sec-title', 'In this world'));
      body.appendChild(playerList(game));
      body.appendChild(el('div', 'sec-title', 'Chat'));
      body.appendChild(chatBox(game));
    } else {
      body.appendChild(el('div', 'note info', `
        <b>Riding together</b>
        <ul>
          <li>Up to ${MAX_PLAYERS} riders share one world.</li>
          <li>Pull alongside someone with a two-seat frame and press <b>E</b> to hop on the back. They drive, you hold on.</li>
          <li>Riding within 45 m of another player pays a ride-out bonus.</li>
        </ul>`));
      body.appendChild(el('div', 'note warn', `
        <b>Running the server</b><br>
        The game client is static and can sit on GitHub Pages, but the relay is a small Node process.
        From the project folder: <code>cd server &amp;&amp; npm install &amp;&amp; npm start</code>, then point this
        box at <code>ws://localhost:3496</code>. To play across the internet, host that process somewhere
        with a <code>wss://</code> address and paste it above.`));
    }

    const foot = el('div');
    foot.appendChild(el('div', '', `<span style="font-size:11.5px;color:#5c6883">Positions, wheelies and rider pairing are all synced.</span>`));
    foot.appendChild(el('div', 'spacer'));
    foot.appendChild(btn('Close', 'primary', () => closePanel()));

    return panel({ title: 'Ride-out', sub: 'multiplayer', size: 'md', body, foot });
  }, { onClose: () => { game.net.onUpdate = null; } });
}

function playerList(game) {
  const net = game.net;
  const list = el('div', 'plist');
  const me = el('div', 'prow');
  me.innerHTML = `<span class="dot" style="background:#${RIDER_COLORS[0].toString(16)}"></span>
    <span style="flex:1"><b>${escapeHtml(settings.get('name') || 'You')}</b> <span class="chip">you</span></span>
    <span style="color:#8592ad;font-size:11.5px">${escapeHtml(game.player ? game.player.stats.cls : '')}</span>`;
  list.appendChild(me);

  for (const r of game.remote.values()) {
    const row = el('div', 'prow');
    const c = RIDER_COLORS[r.colorIdx % RIDER_COLORS.length].toString(16).padStart(6, '0');
    const dist = game.player ? Math.round(Math.hypot(r.cur.x - game.player.body.pos.x, r.cur.z - game.player.body.pos.z)) : 0;
    row.innerHTML = `<span class="dot" style="background:#${c}"></span>
      <span style="flex:1"><b>${escapeHtml(r.name)}</b>
        ${r.passengerOf ? '<span class="chip violet">passenger</span>' : ''}
        ${r.hasPassenger ? '<span class="chip violet">carrying</span>' : ''}
        ${r.stats.seats > 1 && !r.hasPassenger && !r.passengerOf ? '<span class="chip good">seat free</span>' : ''}
      </span>
      <span style="color:#8592ad;font-size:11.5px">${dist} m</span>`;
    list.appendChild(row);
  }
  if (game.remote.size === 0) list.appendChild(el('div', 'empty', 'Nobody else here yet — share the room link.'));
  return list;
}

function chatBox(game) {
  const w = el('div');
  const log = el('div');
  log.style.cssText = 'max-height:150px;overflow:auto;background:#0d1220;border:1px solid #1e2740;border-radius:11px;padding:10px;font-size:12.5px;display:flex;flex-direction:column;gap:5px';
  const msgs = game.net.chat.slice(-30);
  if (!msgs.length) log.appendChild(el('div', 'empty', 'No messages yet.'));
  for (const m of msgs) {
    log.appendChild(el('div', '', `<b style="color:#8fa3c9">${escapeHtml(m.who)}</b> <span style="color:#b9c3d6">${escapeHtml(m.msg)}</span>`));
  }
  w.appendChild(log);
  const r = el('div', 'row');
  r.style.marginTop = '8px';
  const i = el('input');
  i.type = 'text'; i.maxLength = 180; i.placeholder = 'say something…';
  i.style.cssText = 'background:#10182b;border:1px solid #27324f;border-radius:10px;padding:9px 12px;color:#e7ecf7;font:inherit;font-size:13px';
  i.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && i.value.trim()) { game.net.sendChat(i.value.trim()); i.value = ''; }
  });
  r.appendChild(i);
  const b = btn('Send', 'sm', () => { if (i.value.trim()) { game.net.sendChat(i.value.trim()); i.value = ''; } });
  b.style.flex = '0 0 auto';
  r.appendChild(b);
  w.appendChild(r);
  setTimeout(() => { log.scrollTop = log.scrollHeight; }, 10);
  return w;
}

export function playerListPanel(game) {
  openPanel(() => {
    const body = el('div');
    body.appendChild(playerList(game));
    const foot = el('div');
    foot.appendChild(btn('Multiplayer settings', 'ghost', () => { closePanel(); openMultiplayer(game); }));
    foot.appendChild(el('div', 'spacer'));
    foot.appendChild(btn('Close', 'primary', () => closePanel()));
    return panel({ title: 'Riders', sub: game.net.connected ? `room “${escapeHtml(game.net.room)}”` : 'offline', size: 'sm', body, foot });
  });
}
