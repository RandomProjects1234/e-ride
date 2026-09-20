/* ============================================================
   mpui.js — multiplayer connection + player list + chat
   ============================================================ */
import { el, escapeHtml, uid } from '../core/util.js';
import { openPanel, closePanel, panel, btn, refreshTop, infoBox, tabBar } from './menus.js';
import { MAX_PLAYERS, codeFromUrl } from '../net/client.js';
import { makeCode, normalizeCode } from '../net/peer.js';
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

    /* ---- host or join ---- */
    let codeDraft = net.room || codeFromUrl();

    if (!net.connected) {
      const f3 = el('div', 'field');
      f3.appendChild(el('label', '', 'Your name'));
      const nameIn = el('input');
      nameIn.type = 'text'; nameIn.maxLength = 16;
      nameIn.value = settings.get('name') || '';
      nameIn.onchange = () => { settings.set('name', nameIn.value.slice(0, 16)); game.onNameChanged(); };
      f3.appendChild(nameIn);
      body.appendChild(f3);

      const grid = el('div', 'grid c2');
      grid.style.marginTop = '4px';

      /* host */
      const hostCard = el('div', 'card');
      hostCard.innerHTML = `<h4>Start a ride-out</h4>
        <div class="muted">You host. Your friends get a code to type in. Nothing to install and no server to run.</div>`;
      const hostBtn = btn(net.connecting ? 'Opening\u2026' : 'Open a room', 'primary', () => {
        net.host(makeCode());
        refreshTop();
      });
      hostBtn.disabled = net.connecting;
      const hr = el('div', 'card-row');
      hr.appendChild(hostBtn);
      hostCard.appendChild(hr);
      grid.appendChild(hostCard);

      /* join */
      const joinCard = el('div', 'card');
      joinCard.innerHTML = `<h4>Join a friend</h4>
        <div class="muted">Type the five-character code they gave you.</div>`;
      const codeIn = el('input');
      codeIn.type = 'text'; codeIn.maxLength = 8;
      codeIn.value = codeDraft;
      codeIn.placeholder = 'e.g. K7WQZ';
      codeIn.autocapitalize = 'characters';
      codeIn.spellcheck = false;
      codeIn.style.cssText = 'margin-top:10px;text-transform:uppercase;letter-spacing:.24em;font-weight:900;text-align:center;font-size:18px';
      codeIn.oninput = () => {
        const p0 = codeIn.selectionStart;
        codeIn.value = normalizeCode(codeIn.value);
        codeDraft = codeIn.value;
        try { codeIn.setSelectionRange(p0, p0); } catch (e) {}
      };
      const go = () => { if (codeIn.value.length >= 4) { net.join(codeIn.value); refreshTop(); } };
      codeIn.onkeydown = (e) => { if (e.key === 'Enter') go(); };
      joinCard.appendChild(codeIn);
      const jr = el('div', 'card-row');
      const joinBtn = btn(net.connecting ? 'Connecting\u2026' : 'Join', '', go);
      joinBtn.disabled = net.connecting;
      jr.appendChild(joinBtn);
      joinCard.appendChild(jr);
      grid.appendChild(joinCard);

      body.appendChild(grid);
    } else {
      /* connected: show the code big, with a copyable link */
      const codeBox = el('div', 'note ok');
      codeBox.style.textAlign = 'center';
      codeBox.innerHTML = `
        <div style="font-size:11px;letter-spacing:.2em;color:#8592ad;font-weight:800">
          ${net.isHost ? 'YOUR ROOM CODE' : 'CONNECTED TO'}</div>
        <div style="font-size:34px;font-weight:900;letter-spacing:.3em;color:#39e6a4;margin:4px 0 2px">
          ${escapeHtml(net.room)}</div>
        <div class="muted" style="font-size:11.5px">
          ${net.isHost
            ? 'Friends pick <b>Join a friend</b> and type this in. Keep this tab open \u2014 you are the host.'
            : 'You are riding in someone else\u2019s world.'}</div>`;
      body.appendChild(codeBox);

      const btnRow = el('div', 'row');
      btnRow.style.margin = '12px 0';
      btnRow.appendChild(btn('Copy invite link', '', () => {
        navigator.clipboard?.writeText(net.shareLink || net.room);
        game.hud.toast('Invite link copied \u2014 send it to a friend', 'info');
      }));
      btnRow.appendChild(btn('Copy code', 'ghost', () => {
        navigator.clipboard?.writeText(net.room);
        game.hud.toast('Room code copied', 'info');
      }));
      btnRow.appendChild(btn(net.isHost ? 'Close the room' : 'Leave', 'warn', () => {
        net.disconnect(); refreshTop();
      }));
      body.appendChild(btnRow);
    }

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
          <li>Up to ${MAX_PLAYERS} riders share one world \u2014 one hosts, the rest join with the code.</li>
          <li>Pull alongside someone with a two-seat frame and press <b>E</b> to hop on the back. They drive, you hold on.</li>
          <li>Riding within 45 m of another player pays a ride-out bonus.</li>
        </ul>`));
      body.appendChild(el('div', 'note', `
        <span style="color:#6d7b96;font-size:11.5px">
        Connections are peer-to-peer over WebRTC. A public broker is used only to introduce
        the two browsers to each other \u2014 no game traffic passes through it, and there is no
        server to run. If a friend cannot connect, a strict firewall or symmetric NAT is the
        usual reason; a phone hotspot almost always works.</span>`));
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
