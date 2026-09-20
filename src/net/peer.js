/* ============================================================
   peer.js — PeerJS transport

   No server to host. One player hosts the room and the others join
   with a five-character code; everything goes peer-to-peer over
   WebRTC through PeerJS's free broker, which is only used to
   introduce the two browsers.

   The host runs the Room (the same relay logic the Node server ran)
   and is also a player, so its own client talks to the room through
   a loopback rather than the network.
   ============================================================ */
import { Room, MAX_PLAYERS } from './room.js';

const PEERJS_SRC = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
const PREFIX = 'eride-';
/* no 0/O/1/I/5/S — codes get read out loud and typed in by hand */
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';

export function makeCode(n = 5) {
  let s = '';
  const buf = new Uint32Array(n);
  (crypto || window.crypto).getRandomValues(buf);
  for (let i = 0; i < n; i++) s += ALPHABET[buf[i] % ALPHABET.length];
  return s;
}

export function normalizeCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

let _loading = null;
/** pull PeerJS in only when somebody actually wants multiplayer */
export function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (_loading) return _loading;
  _loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PEERJS_SRC;
    s.async = true;
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS loaded but did not register')));
    s.onerror = () => { _loading = null; reject(new Error('Could not load PeerJS — check your connection.')); };
    document.head.appendChild(s);
  });
  return _loading;
}

/* ============================================================
   PeerLink — one object for both modes
   ============================================================ */
export class PeerLink {
  /**
   * @param {object} handlers  { onMessage, onStatus, onError, onCount }
   */
  constructor(handlers = {}) {
    this.on = handlers;
    this.peer = null;
    this.mode = null;          // 'host' | 'guest'
    this.code = '';
    this.room = null;          // host only
    this.conns = new Map();    // host: peerId -> DataConnection
    this.hostConn = null;      // guest only
    this.selfId = 'host';      // the host's own id inside its room
    this.open = false;
    this.closing = false;
  }

  _status(s, detail) { this.on.onStatus && this.on.onStatus(s, detail); }
  _fail(msg) { this.closing = true; this.on.onError && this.on.onError(msg); }

  /* ---------------- hosting ---------------- */
  async host(code) {
    const Peer = await loadPeerJS();
    this.mode = 'host';
    this.code = normalizeCode(code) || makeCode();
    this.closing = false;

    this.room = new Room(this.code, (id, msg) => {
      if (id === this.selfId) this.on.onMessage && this.on.onMessage(msg);
      else {
        const c = this.conns.get(id);
        if (c && c.open) { try { c.send(msg); } catch (e) { /* dropped */ } }
      }
    });
    this.room.add(this.selfId);          // the host is a player too

    this._status('connecting');
    await this._makePeer(PREFIX + this.code, (err) => {
      if (err && /unavailable|taken/i.test(err.message || '')) {
        this._fail('That room code is already in use. Try another.');
      } else this._fail(err.message || 'Could not open the room.');
    });
    if (this.closing) return;

    this.peer.on('connection', (conn) => this._acceptGuest(conn));
    this.open = true;
    this._status('hosting', this.code);
    this.on.onCount && this.on.onCount(this.room.size);
  }

  _acceptGuest(conn) {
    if (this.room.size >= MAX_PLAYERS) {
      conn.on('open', () => { try { conn.send({ t: 'full' }); conn.close(); } catch (e) {} });
      return;
    }
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      this.room.add(conn.peer);
      this.on.onCount && this.on.onCount(this.room.size);
    });
    conn.on('data', (m) => { try { this.room.handle(conn.peer, m); } catch (e) { /* bad frame */ } });
    const gone = () => {
      if (!this.conns.has(conn.peer)) return;
      this.conns.delete(conn.peer);
      this.room.remove(conn.peer);
      this.on.onCount && this.on.onCount(this.room.size);
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  /* ---------------- joining ---------------- */
  async join(code) {
    const Peer = await loadPeerJS();
    this.mode = 'guest';
    this.code = normalizeCode(code);
    this.closing = false;
    if (!this.code) { this._fail('Enter a room code.'); return; }

    this._status('connecting');
    await this._makePeer(undefined, (err) => this._fail(err.message || 'Could not start a connection.'));
    if (this.closing) return;

    const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
    this.hostConn = conn;

    const timeout = setTimeout(() => {
      if (!this.open) {
        this._fail(`No room found with the code ${this.code}. Check it and make sure the host still has the game open.`);
        this.close();
      }
    }, 12000);

    conn.on('open', () => {
      clearTimeout(timeout);
      this.open = true;
      this._status('connected', this.code);
    });
    conn.on('data', (m) => this.on.onMessage && this.on.onMessage(m));
    conn.on('close', () => {
      clearTimeout(timeout);
      if (this.closing) return;
      this.open = false;
      this._status('offline');
      this._fail('The host closed the room.');
    });
    conn.on('error', () => {
      clearTimeout(timeout);
      if (!this.open) this._fail(`Could not reach the room ${this.code}.`);
    });
  }

  _makePeer(id, onErr) {
    return new Promise((resolve) => {
      const Peer = window.Peer;
      this.peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
      let settled = false;
      this.peer.on('open', () => { if (!settled) { settled = true; resolve(); } });
      this.peer.on('error', (err) => {
        // once we are running, transient peer errors are not fatal
        if (!settled) { settled = true; onErr(err); resolve(); }
        else if (/network|server-error|socket/i.test(err.type || '')) this._status('unstable');
      });
      this.peer.on('disconnected', () => {
        if (!this.closing && this.peer && !this.peer.destroyed) {
          try { this.peer.reconnect(); } catch (e) {}
        }
      });
    });
  }

  /* ---------------- traffic ---------------- */
  send(msg) {
    if (this.mode === 'host') {
      if (this.room) this.room.handle(this.selfId, msg);
    } else if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send(msg); } catch (e) { /* dropped */ }
    }
  }

  tick(dt) { if (this.mode === 'host' && this.room) this.room.tick(dt); }

  get playerCount() {
    if (this.mode === 'host') return this.room ? this.room.size : 1;
    return this._guestCount || 1;
  }
  setGuestCount(n) { this._guestCount = n; }

  get shareLink() {
    if (!this.code) return '';
    const u = new URL(location.href);
    u.hash = '';
    u.searchParams.set('join', this.code);
    return u.toString();
  }

  close() {
    this.closing = true;
    this.open = false;
    for (const c of this.conns.values()) { try { c.close(); } catch (e) {} }
    this.conns.clear();
    if (this.hostConn) { try { this.hostConn.close(); } catch (e) {} this.hostConn = null; }
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
    this.room = null;
    this.mode = null;
    this._status('offline');
  }
}
