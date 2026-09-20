/* ============================================================
   client.js - multiplayer client (PeerJS, no server to run)

   One player hosts and gets a five-character room code; everyone
   else types it in. The connection is peer-to-peer over WebRTC -
   PeerJS's public broker is only used to introduce the browsers to
   each other, and no game traffic goes through it.

   The host also runs the room logic in-process (src/net/room.js),
   so the protocol below is identical to the one the old Node relay
   spoke and nothing above this layer had to change.
   ============================================================ */
import { RemotePlayer, RIDER_COLORS } from '../game/player.js';
import { economy } from '../game/economy.js';
import { settings } from '../core/settings.js';
import { escapeHtml, uid } from '../core/util.js';
import { audio } from '../core/audio.js';
import { PeerLink, makeCode, normalizeCode } from './peer.js';
import { MAX_PLAYERS } from './room.js';

const LS_ROOM = 'eride.room';
const SEND_HZ = 15;
export { MAX_PLAYERS };

/** a ?join=CODE link drops you straight into someone's room */
export function codeFromUrl() {
  try {
    const c = new URL(location.href).searchParams.get('join');
    return c ? normalizeCode(c) : '';
  } catch (e) { return ''; }
}

export class NetClient {
  constructor(game) {
    this.game = game;
    this.link = null;
    this.connected = false;
    this.connecting = false;
    this.id = null;
    this.mode = null;                 // 'host' | 'guest'
    this.room = localStorage.getItem(LS_ROOM) || '';
    this.playerCount = 1;
    this.ping = 0;
    this._acc = 0;
    this._pingAcc = 0;
    this.status = 'offline';
    this.error = '';
    this.chat = [];
    this.onUpdate = null;             // UI hook
  }

  get isHost() { return this.mode === 'host'; }
  get shareLink() { return this.link ? this.link.shareLink : ''; }

  setRoom(r) { this.room = normalizeCode(r); localStorage.setItem(LS_ROOM, this.room); }

  /* ---------------- connection ---------------- */
  _link() {
    return new PeerLink({
      onMessage: (m) => this._handle(m),
      onStatus: (st, detail) => {
        if (st === 'hosting' || st === 'connected') {
          this.connecting = false;
          this.connected = true;
          this.status = 'connected';
          this.error = '';
          this.sendHello();
        } else if (st === 'connecting') {
          this.connecting = true;
          this.status = 'connecting';
        } else if (st === 'offline') {
          const was = this.connected;
          this.connected = false;
          this.connecting = false;
          this.id = null;
          this.playerCount = 1;
          this.clearRemotes();
          if (this.status !== 'error') this.status = 'offline';
          if (was) this.game.hud.toast('Ride-out ended', 'bad');
        }
        this._emit();
      },
      onError: (msg) => {
        this.error = msg;
        this.status = 'error';
        this.connecting = false;
        this._emit();
      },
      onCount: (n) => { this.playerCount = n; this._emit(); },
    });
  }

  /** open a room and become its host */
  async host(code) {
    if (this.connecting || this.connected) return;
    this.disconnect();
    this.mode = 'host';
    this.link = this._link();
    this.room = normalizeCode(code) || makeCode();
    localStorage.setItem(LS_ROOM, this.room);
    try { await this.link.host(this.room); }
    catch (e) { this.error = e.message; this.status = 'error'; this.connecting = false; this._emit(); return; }
    if (this.status !== 'error') {
      this.game.hud.toast(`Room <b>${escapeHtml(this.room)}</b> is open - share the code`, 'info', 5000);
    }
  }

  /** join somebody else's room */
  async join(code) {
    if (this.connecting || this.connected) return;
    this.disconnect();
    this.mode = 'guest';
    this.link = this._link();
    this.room = normalizeCode(code);
    localStorage.setItem(LS_ROOM, this.room);
    try { await this.link.join(this.room); }
    catch (e) { this.error = e.message; this.status = 'error'; this.connecting = false; this._emit(); return; }
  }

  /** kept so old call sites (and the ?join= link) still work */
  connect() {
    if (this.room) this.join(this.room);
    else this.host(makeCode());
  }

  disconnect() {
    if (this.link) { this.link.close(); this.link = null; }
    this.mode = null;
    this.connected = false;
    this.connecting = false;
    this.id = null;
    this.playerCount = 1;
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
    if (!this.link) return;
    this.link.send(o);
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
    if (!this.connected) return;
    // the host is also the relay, so it has to run the room every frame
    if (this.link) this.link.tick(dt);
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
        if (this.link) this.link.setGuestCount(this.playerCount);
        for (const p of m.players || []) this._addRemote(p);
        this._emit();
        break;
      }
      case 'join': {
        this._addRemote(m.p);
        this.playerCount = g.remote.size + 1;
        if (this.link) this.link.setGuestCount(this.playerCount);
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
        let unknown = false;
        for (const e of m.a) {
          const r = g.remote.get(e.i);
          if (r) r.applySnapshot(e.s);
          else if (e.i !== this.id) unknown = true;
        }
        // somebody is being sent to us that we have no model for — ask for
        // the full picture again, at most once every few seconds
        if (unknown) {
          const now = performance.now();
          if (now - (this._lastResync || 0) > 4000) { this._lastResync = now; this.sendHello(); }
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
        this.error = `That room is full (max ${MAX_PLAYERS} riders).`;
        this.status = 'error';
        this.disconnect();
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
    if (p.id === this.id) return;
    const existing = g.remote.get(p.id);
    if (existing) {
      existing.name = p.name;
      if (p.build) existing.setBuild(p.build);
      if (p.s) existing.applySnapshot(p.s);
      return;
    }
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
