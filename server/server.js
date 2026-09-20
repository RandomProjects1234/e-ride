#!/usr/bin/env node
/* ============================================================
   E-Ride relay server

   A small authoritative-enough WebSocket relay: it owns room
   membership and the driver/passenger pairing, and forwards
   position snapshots between up to 6 riders per room.

     npm install && npm start
     PORT=3496 node server.js
   ============================================================ */
'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3496);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 6);
const TICK_HZ = Number(process.env.TICK_HZ || 15);
const MAX_MSG = 8 * 1024;
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 200);
const IDLE_MS = 45_000;

/* ---------------- rooms ---------------- */
/** @type {Map<string, {id:string, players:Map<string,Player>, created:number}>} */
const rooms = new Map();

let nextId = 1;
const newId = () => 'p' + (nextId++).toString(36) + Math.random().toString(36).slice(2, 5);

function randomRoom() {
  const c = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

function getRoom(name) {
  if (name) {
    const key = String(name).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
    if (key) {
      let r = rooms.get(key);
      if (!r) {
        if (rooms.size >= MAX_ROOMS) return null;
        r = { id: key, players: new Map(), created: Date.now() };
        rooms.set(key, r);
      }
      return r;
    }
  }
  // auto-join: first room with space
  for (const r of rooms.values()) if (r.players.size < MAX_PLAYERS) return r;
  if (rooms.size >= MAX_ROOMS) return null;
  const r = { id: randomRoom(), players: new Map(), created: Date.now() };
  rooms.set(r.id, r);
  return r;
}

/* ---------------- player ---------------- */
class Player {
  constructor(ws, ip) {
    this.ws = ws;
    this.ip = ip;
    this.id = newId();
    this.name = 'Rider';
    this.build = null;
    this.room = null;
    this.colorIdx = 0;
    this.s = { x: 0, y: 0, z: 0, yw: 0, sp: 0, pt: 0, ln: 0, st: 0, sn: 0, cr: 0, gr: 1, sv: 0 };
    this.passengerOf = null;   // id of host we ride on
    this.passenger = null;     // id of rider on our back
    this.lastMsg = Date.now();
    this.msgBudget = 60;
    this.joined = false;
  }
  send(o) {
    if (this.ws.readyState !== 1) return;
    try { this.ws.send(JSON.stringify(o)); } catch (e) {}
  }
  info() {
    return {
      id: this.id, name: this.name, build: this.build, colorIdx: this.colorIdx,
      s: this.s, passengerOf: this.passengerOf, passenger: this.passenger,
    };
  }
}

function broadcast(room, obj, except) {
  const msg = JSON.stringify(obj);
  for (const p of room.players.values()) {
    if (p === except) continue;
    if (p.ws.readyState === 1) { try { p.ws.send(msg); } catch (e) {} }
  }
}

function assignColor(room) {
  const used = new Set([...room.players.values()].map((p) => p.colorIdx));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
  return 0;
}

/* ---------------- pairing ---------------- */
function unpair(player, reason) {
  const room = player.room;
  if (!room) return;
  if (player.passengerOf) {
    const host = room.players.get(player.passengerOf);
    if (host) host.passenger = null;
    const msg = { t: 'unpair', host: player.passengerOf, pass: player.id, why: reason };
    player.passengerOf = null;
    broadcast(room, msg);
  }
  if (player.passenger) {
    const pass = room.players.get(player.passenger);
    if (pass) pass.passengerOf = null;
    const msg = { t: 'unpair', host: player.id, pass: player.passenger, why: reason };
    player.passenger = null;
    broadcast(room, msg);
  }
}

/* ---------------- http + ws ---------------- */
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    const body = JSON.stringify({
      ok: true,
      service: 'e-ride-relay',
      rooms: rooms.size,
      players: [...rooms.values()].reduce((n, r) => n + r.players.size, 0),
      maxPlayers: MAX_PLAYERS,
      uptime: Math.round(process.uptime()),
    });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(body);
    return;
  }
  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ server, maxPayload: MAX_MSG });

wss.on('connection', (ws, req) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  const player = new Player(ws, ip);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    if (raw.length > MAX_MSG) return ws.close();
    const now = Date.now();
    // simple token-bucket rate limit
    player.msgBudget = Math.min(90, player.msgBudget + (now - player.lastMsg) * 0.05);
    player.lastMsg = now;
    if (player.msgBudget < 1) return;
    player.msgBudget -= 1;

    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;

    switch (m.t) {
      case 'hello': {
        if (player.joined) {           // a rename
          player.name = clean(m.name, 16) || player.name;
          if (m.build) player.build = m.build;
          broadcast(player.room, { t: 'join', p: player.info() }, player);
          return;
        }
        const room = getRoom(m.room);
        if (!room) { player.send({ t: 'err', m: 'Server is at capacity.' }); return ws.close(); }
        if (room.players.size >= MAX_PLAYERS) { player.send({ t: 'full' }); return ws.close(); }

        player.name = clean(m.name, 16) || 'Rider';
        player.build = sanitizeBuild(m.build);
        player.room = room;
        player.colorIdx = assignColor(room);
        player.joined = true;
        room.players.set(player.id, player);

        player.send({
          t: 'welcome',
          id: player.id,
          room: room.id,
          max: MAX_PLAYERS,
          players: [...room.players.values()].filter((p) => p !== player).map((p) => p.info()),
        });
        broadcast(room, { t: 'join', p: player.info() }, player);
        console.log(`[+] ${player.name} (${player.id}) → room ${room.id} (${room.players.size}/${MAX_PLAYERS})`);
        break;
      }

      case 's': {
        if (!player.joined || !m.s) return;
        const s = m.s;
        // keep it inside the world and numeric
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
        broadcast(player.room, { t: 'build', id: player.id, b: player.build }, player);
        break;
      }

      case 'mount': {
        if (!player.joined) return;
        const host = player.room.players.get(String(m.id));
        if (!host || host === player) return;
        if (host.passenger || host.passengerOf || player.passenger || player.passengerOf) return;
        // proximity check so you can't teleport onto someone
        const d = Math.hypot(host.s.x - player.s.x, host.s.z - player.s.z);
        if (d > 12) return;
        host.passenger = player.id;
        player.passengerOf = host.id;
        broadcast(player.room, { t: 'pair', host: host.id, pass: player.id });
        break;
      }

      case 'dismount': {
        if (!player.joined) return;
        if (player.passengerOf) unpair(player, 'dismount');
        break;
      }

      case 'kick': {
        if (!player.joined) return;
        if (player.passenger) unpair(player, 'dropped off');
        break;
      }

      case 'ev': {
        if (!player.joined) return;
        const k = clean(m.k, 16);
        if (!k) return;
        broadcast(player.room, { t: 'ev', id: player.id, k, d: smallObj(m.d) }, player);
        break;
      }

      case 'chat': {
        if (!player.joined) return;
        const msg = clean(m.m, 180);
        if (!msg) return;
        broadcast(player.room, { t: 'chat', id: player.id, m: msg });
        break;
      }

      case 'ping': {
        player.send({ t: 'pong', ts: m.ts });
        break;
      }
    }
  });

  ws.on('close', () => {
    const room = player.room;
    if (!room) return;
    unpair(player, 'left');
    room.players.delete(player.id);
    broadcast(room, { t: 'leave', id: player.id });
    console.log(`[-] ${player.name} (${player.id}) left room ${room.id} (${room.players.size} left)`);
    if (room.players.size === 0) {
      rooms.delete(room.id);
      console.log(`[x] room ${room.id} closed`);
    }
  });

  ws.on('error', () => {});
});

/* ---------------- state broadcast tick ---------------- */
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.players.size < 2) continue;
    const all = [...room.players.values()];
    for (const p of all) {
      const a = [];
      for (const o of all) {
        if (o === p) continue;
        if (o.passengerOf) continue;         // passengers ride along with their host
        a.push({ i: o.id, s: o.s });
      }
      if (a.length) p.send({ t: 'S', a });
    }
  }
}, Math.round(1000 / TICK_HZ));

/* ---------------- keepalive ---------------- */
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 20_000);

/* ---------------- helpers ---------------- */
function num(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(-5000, Math.min(5000, n)) : 0; }
function clean(v, max) {
  if (typeof v !== 'string') return '';
  // strip control characters, keep it short
  return v.replace(/[ -]/g, '').trim().slice(0, max);
}
function smallObj(o) {
  if (!o || typeof o !== 'object') return undefined;
  const out = {};
  let n = 0;
  for (const k of Object.keys(o)) {
    if (n++ > 6) break;
    const v = o[k];
    if (typeof v === 'string') out[k] = v.slice(0, 80);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}
const SLOT_KEYS = ['frame', 'motor', 'battery', 'controller', 'tires', 'brakes', 'suspension', 'cockpit', 'aero', 'paint'];
function sanitizeBuild(b) {
  if (!b || typeof b !== 'object') return null;
  const out = {};
  for (const k of SLOT_KEYS) {
    const v = b[k];
    if (typeof v === 'string' && /^[a-z0-9-]{1,24}$/.test(v)) out[k] = v;
    else out[k] = null;
  }
  return out;
}

server.listen(PORT, () => {
  console.log(`E-Ride relay listening on :${PORT}`);
  console.log(`  ws://localhost:${PORT}     (point the game's Multiplayer panel here)`);
  console.log(`  http://localhost:${PORT}/health`);
  console.log(`  max ${MAX_PLAYERS} riders per room, ${TICK_HZ} Hz state broadcast`);
});

process.on('SIGINT', () => { console.log('\nshutting down'); wss.close(); server.close(() => process.exit(0)); });
