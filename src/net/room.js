/* ============================================================
   room.js — the relay logic, with no transport attached

   This is the same room the Node server ran, lifted out so it can
   run inside whichever browser is hosting. It never touches the
   network itself: it is handed messages with a sender id and calls
   back with messages to deliver, so the PeerJS layer (or a socket,
   or a loopback for the host's own client) can carry them.
   ============================================================ */

export const MAX_PLAYERS = 6;
const STATE_HZ = 15;

const num = (v) => (Number.isFinite(v) ? v : 0);
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);

function smallObj(o) {
  if (!o || typeof o !== 'object') return undefined;
  const out = {};
  let n = 0;
  for (const k of Object.keys(o)) {
    if (n++ > 8) break;
    const v = o[k];
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 60);
  }
  return out;
}

function sanitizeBuild(b) {
  if (!b || typeof b !== 'object') return null;
  const out = {};
  for (const k of Object.keys(b).slice(0, 14)) {
    const v = b[k];
    if (v == null) out[k] = null;
    else if (typeof v === 'string') out[k] = v.slice(0, 40);
  }
  return out;
}

class Member {
  constructor(id) {
    this.id = id;
    this.name = 'Rider';
    this.build = null;
    this.colorIdx = 0;
    this.joined = false;
    this.s = { x: 0, y: 0, z: 0, yw: 0, sp: 0, pt: 0, ln: 0, st: 0, sn: 0, cr: 0, gr: 1, sv: 0 };
    this.passengerOf = null;
    this.passenger = null;
    this.lastSeen = Date.now();
  }
  info() {
    return {
      id: this.id, name: this.name, build: this.build, colorIdx: this.colorIdx,
      s: this.s, passengerOf: this.passengerOf, passenger: this.passenger,
    };
  }
}

export class Room {
  /**
   * @param {string} code      the room code players share
   * @param {(id:string, msg:object)=>void} deliver   send to one member
   */
  constructor(code, deliver) {
    this.code = code;
    this.deliver = deliver;
    this.players = new Map();
    this._acc = 0;
  }

  get size() { return this.players.size; }

  broadcast(msg, exceptId) {
    for (const id of this.players.keys()) {
      if (id !== exceptId) this.deliver(id, msg);
    }
  }

  _assignColor() {
    const used = new Set([...this.players.values()].map((p) => p.colorIdx));
    for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return 0;
  }

  /** a transport reports a new connection */
  add(id) {
    const had = this.players.get(id);
    if (had) { had.lastSeen = Date.now(); return had; }
    if (this.players.size >= MAX_PLAYERS) {
      this.deliver(id, { t: 'full' });
      return null;
    }
    const m = new Member(id);
    this.players.set(id, m);
    return m;
  }

  /** a transport reports a dropped connection */
  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    this._unpair(p, 'left');
    this.players.delete(id);
    if (p.joined) this.broadcast({ t: 'leave', id });
  }

  _unpair(player, reason) {
    if (player.passengerOf) {
      const host = this.players.get(player.passengerOf);
      if (host) host.passenger = null;
      const msg = { t: 'unpair', host: player.passengerOf, pass: player.id, why: reason };
      player.passengerOf = null;
      this.broadcast(msg);
    }
    if (player.passenger) {
      const pass = this.players.get(player.passenger);
      if (pass) pass.passengerOf = null;
      const msg = { t: 'unpair', host: player.id, pass: player.passenger, why: reason };
      player.passenger = null;
      this.broadcast(msg);
    }
  }

  /** a message arrived from `id` */
  handle(id, m) {
    const player = this.players.get(id);
    if (!player || !m || typeof m !== 'object') return;
    player.lastSeen = Date.now();

    switch (m.t) {
      case 'hello': {
        player.name = clean(m.name, 16) || 'Rider';
        player.build = sanitizeBuild(m.build);
        const rejoin = player.joined;
        if (!rejoin) {
          player.joined = true;
          player.colorIdx = this._assignColor();
        }
        /* A repeat hello is a client asking to be re-synced — it has lost
           track of somebody (a backgrounded tab stops rendering and times
           its peers out). Send the full picture again rather than ignoring
           it, or that player stays invisible forever. */
        this.deliver(id, {
          t: 'welcome',
          id: player.id,
          room: this.code,
          max: MAX_PLAYERS,
          players: [...this.players.values()].filter((p) => p !== player && p.joined).map((p) => p.info()),
        });
        this.broadcast({ t: 'join', p: player.info() }, player.id);
        break;
      }

      case 's': {
        if (!player.joined || !m.s) return;
        const s = m.s;
        player.s = {
          x: num(s.x), y: num(s.y), z: num(s.z), yw: num(s.yw),
          sp: num(s.sp), pt: num(s.pt), ln: num(s.ln), st: num(s.st),
          sn: num(s.sn), cr: s.cr ? 1 : 0, gr: s.gr ? 1 : 0, sv: num(s.sv),
        };
        break;
      }

      case 'build': {
        if (!player.joined) return;
        player.build = sanitizeBuild(m.b);
        this.broadcast({ t: 'build', id: player.id, b: player.build }, player.id);
        break;
      }

      case 'mount': {
        if (!player.joined) return;
        const host = this.players.get(String(m.id));
        if (!host || host === player) return;
        if (host.passenger || host.passengerOf || player.passenger || player.passengerOf) return;
        const d = Math.hypot(host.s.x - player.s.x, host.s.z - player.s.z);
        if (d > 12) return;
        host.passenger = player.id;
        player.passengerOf = host.id;
        this.broadcast({ t: 'pair', host: host.id, pass: player.id });
        break;
      }

      case 'dismount': {
        if (player.joined && player.passengerOf) this._unpair(player, 'dismount');
        break;
      }

      case 'kick': {
        if (player.joined && player.passenger) this._unpair(player, 'dropped off');
        break;
      }

      case 'ev': {
        if (!player.joined) return;
        const k = clean(m.k, 16);
        if (!k) return;
        this.broadcast({ t: 'ev', id: player.id, k, d: smallObj(m.d) }, player.id);
        break;
      }

      case 'chat': {
        if (!player.joined) return;
        const msg = clean(m.m, 180);
        if (!msg) return;
        this.broadcast({ t: 'chat', id: player.id, m: msg });
        break;
      }

      case 'ping': {
        this.deliver(id, { t: 'pong', ts: m.ts });
        break;
      }
    }
  }

  /* A peer can open a data channel and then never send a hello — a tab
     closed mid-handshake, a reconnect that replaced itself, a connection
     that half-opened. Those members sat in the room forever holding one
     of the six slots and showing as "Rider" at the origin. */
  _reap() {
    const now = Date.now();
    for (const [id, p] of this.players) {
      if (id === 'host') continue;
      const idle = now - p.lastSeen;
      if (!p.joined && idle > 12000) { this.remove(id); continue; }
      if (p.joined && idle > 25000) this.remove(id);
    }
  }

  /** batched state fan-out, driven by the host's game loop */
  tick(dt) {
    this._reapAcc = (this._reapAcc || 0) + dt;
    if (this._reapAcc > 2) { this._reapAcc = 0; this._reap(); }
    this._acc += dt;
    if (this._acc < 1 / STATE_HZ) return;
    this._acc = 0;
    const all = [...this.players.values()].filter((p) => p.joined);
    if (all.length < 2) return;
    for (const p of all) {
      const a = [];
      for (const o of all) {
        if (o === p || o.passengerOf) continue;   // passengers ride their host
        a.push({ i: o.id, s: o.s });
      }
      if (a.length) this.deliver(p.id, { t: 'S', a });
    }
  }
}
