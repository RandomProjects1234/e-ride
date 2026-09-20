/* ============================================================
   client.js — WebSocket multiplayer client

   The client is static (GitHub Pages friendly); the relay server
   lives wherever you run it. The URL is configurable in-game and
   remembered in localStorage.
   ============================================================ */
import { RemotePlayer, RIDER_COLORS } from '../game/player.js';
import { economy } from '../game/economy.js';
import { settings } from '../core/settings.js';
import { escapeHtml, uid } from '../core/util.js';
import { audio } from '../core/audio.js';

const LS_URL = 'eride.server';
const LS_ROOM = 'eride.room';
const SEND_HZ = 15;
export const MAX_PLAYERS = 6;

export function defaultServerUrl() {
  const saved = localStorage.getItem(LS_URL);
  if (saved) return saved;
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '') return 'ws://localhost:3496';
  return '';
}

export class NetClient {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.connected = false;
    this.connecting = false;
    this.id = null;
    this.room = localStorage.getItem(LS_ROOM) || '';
    this.url = defaultServerUrl();
    this.playerCount = 1;
    this.ping = 0;
    this._acc = 0;
    this._pingAcc = 0;
    this.status = 'offline';
    this.error = '';
    this.chat = [];
    this.onUpdate = null;         // UI hook
    this._reconnectAt = 0;
    this._retries = 0;
    this._wantConnected = false;
  }

  setUrl(u) { this.url = u.trim(); localStorage.setItem(LS_URL, this.url); }
  setRoom(r) { this.room = (r || '').trim().slice(0, 24); localStorage.setItem(LS_ROOM, this.room); }

  /* ---------------- connection ---------------- */
  connect() {
    if (this.connecting || this.connected) return;
    if (!this.url) { this.error = 'No server address set.'; this._emit(); return; }
    let url = this.url;
    if (!/^wss?:\/\//.test(url)) url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + url;
    if (location.protocol === 'https:' && url.startsWith('ws://')) {
      this.error = 'This page is served over HTTPS, so the server must be wss:// (a secure WebSocket).';
      this.status = 'error'; this._emit(); return;
    }

    this._wantConnected = true;
    this.connecting = true;
    this.status = 'connecting';
    this.error = '';
    this._emit();

    let ws;
    try { ws = new WebSocket(url); }
    catch (e) { this.connecting = false; this.status = 'error'; this.error = e.message; this._emit(); return; }
    this.ws = ws;

    const timeout = setTimeout(() => {
      if (!this.connected) { try { ws.close(); } catch (e) {} }
    }, 9000);

    ws.onopen = () => {
      clearTimeout(timeout);
      this.connecting = false;
      this.connected = true;
      this.status = 'connected';
      this._retries = 0;
      this.sendHello();
      this._emit();
      this.game.hud.toast('🛰️ Connected to the ride-out server', 'info');
    };

    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      this._handle(m);
    };

    ws.onerror = () => {
      this.error = 'Could not reach ' + url;
      this.status = 'error';
      this._emit();
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      const wasConnected = this.connected;
      this.connected = false;
      this.connecting = false;
      this.id = null;
      this.playerCount = 1;
      this.clearRemotes();
      if (this.status !== 'error') this.status = 'offline';
      this._emit();
      if (wasConnected) this.game.hud.toast('Disconnected from the server', 'bad');
      if (this._wantConnected && this._retries < 5) {
        this._retries++;
        this._reconnectAt = performance.now() + 2500 * this._retries;
      }
    };
  }

  disconnect() {
    this._wantConnected = false;
    this._retries = 99;
    if (this.ws) { try { this.ws.close(); } catch (e) {} }
    this.clearRemotes();
    this.status = 'offline';
    this._emit();
  }

  clearRemotes() {
    for (const r of this.game.remote.values()) r.dispose();
    this.game.remote.clear();
    if (this.game.player) {
      this.game.player.ridingWith = null;
      this.game.player.passenger = null;
      this.game.player.setStowed(false);
      this.game.player.refreshRiderCount();
    }
  }

  _emit() { this.onUpdate && this.onUpdate(this); }

  send(o) {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return;
    try { this.ws.send(JSON.stringify(o)); } catch (e) {}
  }

  /* ---------------- outgoing ---------------- */
  sendHello() {
    this.send({
      t: 'hello',
      name: (settings.get('name') || economy.data?.name || 'Rider').slice(0, 16),
      build: this.game.player ? this.game.player.build : null,
      room: this.room,
    });
  }

  sendBuild() {
    if (this.game.player) this.send({ t: 'build', b: this.game.player.build });
  }

  sendEvent(k, d) { this.send({ t: 'ev', k, d }); }
  sendChat(m) { this.send({ t: 'chat', m: String(m).slice(0, 180) }); }
  requestMount(hostId) { this.send({ t: 'mount', id: hostId }); }
  requestDismount() { this.send({ t: 'dismount' }); }
  kickPassenger() { this.send({ t: 'kick' }); }

  update(dt) {
    if (!this.connected) {
      if (this._wantConnected && this._reconnectAt && performance.now() > this._reconnectAt) {
        this._reconnectAt = 0;
        this.connect();
      }
      return;
    }
    this._acc += dt;
    if (this._acc >= 1 / SEND_HZ) {
      this._acc = 0;
      if (this.game.player && !this.game.player.ridingWith) {
        this.send({ t: 's', s: this.game.player.snapshot() });
      }
    }
    this._pingAcc += dt;
    if (this._pingAcc > 3) { this._pingAcc = 0; this.send({ t: 'ping', ts: Date.now() }); }

    // drop ghosts
    const now = performance.now();
    for (const [id, r] of this.game.remote) {
      if (now - r.lastSeen > 12000) { r.dispose(); this.game.remote.delete(id); }
    }
  }

  /* ---------------- incoming ---------------- */
  _handle(m) {
    const g = this.game;
    switch (m.t) {
      case 'welcome': {
        this.id = m.id;
        this.room = m.room;
        localStorage.setItem(LS_ROOM, this.room);
        this.playerCount = (m.players?.length || 0) + 1;
        for (const p of m.players || []) this._addRemote(p);
        this._emit();
        break;
      }
      case 'join': {
        this._addRemote(m.p);
        this.playerCount = g.remote.size + 1;
        g.hud.toast(`👋 <b>${escapeHtml(m.p.name)}</b> joined the ride`, 'info');
        this._emit();
        break;
      }
      case 'leave': {
        const r = g.remote.get(m.id);
        if (r) {
          if (g.player.ridingWith === r) { g.player.ridingWith = null; g.player.setStowed(false); }
          if (g.player.passenger === r) { g.player.passenger = null; g.player.refreshRiderCount(); }
          g.hud.toast(`<b>${escapeHtml(r.name)}</b> left`, '', 2000);
          r.dispose();
          g.remote.delete(m.id);
        }
        this.playerCount = g.remote.size + 1;
        this._emit();
        break;
      }
      case 'S': {              // batched states
        for (const e of m.a) {
          const r = g.remote.get(e.i);
          if (r) r.applySnapshot(e.s);
        }
        break;
      }
      case 'build': {
        const r = g.remote.get(m.id);
        if (r && m.b) r.setBuild(m.b);
        break;
      }
      case 'pair': {
        this._applyPair(m.host, m.pass, true);
        break;
      }
      case 'unpair': {
        this._applyPair(m.host, m.pass, false);
        break;
      }
      case 'ev': {
        const r = g.remote.get(m.id);
        if (m.k === 'bell') {
          const d = r ? Math.hypot(r.cur.x - g.player.body.pos.x, r.cur.z - g.player.body.pos.z) : 999;
          if (d < 80) audio.bell();
        } else if (m.k === 'crash' && r) {
          g.hud.toast(`💥 <b>${escapeHtml(r.name)}</b> — ${escapeHtml(String(m.d?.r || 'crashed'))}`, '', 2200);
        }
        break;
      }
      case 'chat': {
        const r = g.remote.get(m.id);
        const who = m.id === this.id ? 'You' : (r ? r.name : 'someone');
        this.chat.push({ who, msg: m.m, at: Date.now() });
        if (this.chat.length > 60) this.chat.shift();
        g.hud.toast(`<b>${escapeHtml(who)}:</b> ${escapeHtml(m.m)}`, 'info', 4200);
        this._emit();
        break;
      }
      case 'pong': { this.ping = Date.now() - m.ts; break; }
      case 'full': {
        this.error = 'That room is full (max ' + MAX_PLAYERS + ' riders).';
        this.status = 'error';
        this._emit();
        break;
      }
      case 'err': {
        this.error = String(m.m || 'server error');
        this._emit();
        break;
      }
    }
  }

  _addRemote(p) {
    const g = this.game;
    if (g.remote.has(p.id)) return;
    const r = new RemotePlayer(g.world, g.engine.scene, {
      id: p.id, name: p.name, colorIdx: p.colorIdx ?? 1,
      build: p.build || g.player.build,
    });
    if (p.s) { r.applySnapshot(p.s); Object.assign(r.cur, p.s); }
    g.remote.set(p.id, r);
    if (p.passengerOf) this._applyPair(p.passengerOf, p.id, true);
    if (p.passenger) this._applyPair(p.id, p.passenger, true);
  }

  /** host carries pass */
  _applyPair(hostId, passId, on) {
    const g = this.game;
    const me = this.id;
    const hostR = g.remote.get(hostId);
    const passR = g.remote.get(passId);

    if (passId === me) {
      g.player.ridingWith = on ? hostR : null;
      g.player.setStowed(on && !!hostR);
      if (on && hostR) g.hud.toast(`🧍 Riding with <b>${escapeHtml(hostR.name)}</b>`, 'info');
      if (!on) {
        g.hud.setPassenger(false);
        if (hostR) {
          // hop off just behind the host
          const a = hostR.cur.yw + Math.PI;
          g.player.body.placeAt(hostR.cur.x + Math.sin(a) * 2.6, hostR.cur.z + Math.cos(a) * 2.6, hostR.cur.yw);
          g.cam.snap(g.player.body);
        }
      }
      g.hud.setPassenger(on, hostR ? hostR.name : '');
    } else if (hostId === me) {
      g.player.passenger = on ? passR : null;
      g.player.refreshRiderCount();
      if (passR) g.hud.toast(on ? `🧍 <b>${escapeHtml(passR.name)}</b> hopped on the back` : `<b>${escapeHtml(passR.name)}</b> hopped off`, 'info');
    }

    if (hostR) hostR.setPassenger(on);
    if (passR) { passR.passengerOf = on ? hostId : null; passR.setHidden(on); }
  }
}
