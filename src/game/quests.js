/* ============================================================
   quests.js — the job board, challenges and their tracking
   ============================================================ */
import * as THREE from 'three';
import { LANDMARKS, POIS } from '../world/layout.js';
import { makeLabel } from '../world/world.js';
import { clamp, lerp, pick, randInt, rand, uid, fmtDist, fmtTime, makeRng, MS_TO_MPH } from '../core/util.js';
import { ptsToCash } from './tricks.js';

const BOARD_SIZE = 5;
const BOARD_TTL = 1000 * 60 * 8;

const CLIENTS = ['Volta Noodle Bar', 'Cell Works Ltd', 'Bay Pier Bait & Tackle', 'Soron Service Centre',
  'Amp Park Rangers', 'Ridge Coffee', 'Cellside Pharmacy', 'The Swap Meet', 'Downtown Records',
  'Halberd Racing', 'Nyx Dynamics R&D', 'Voltek Depot'];
const CARGO = ['hot noodles', 'a battery pack', 'live crab', 'a spare wheel', 'blood samples',
  'a very heavy box', 'flowers (urgent)', 'bike chains', 'a birthday cake', 'race telemetry',
  'a prototype controller', 'sixty coffees'];

/** earnings scale as you get richer so late-game jobs stay worth doing */
function payMul(economy) {
  const e = economy.data.records.earned || 0;
  return 1 + Math.pow(e / 4200, 0.6);
}

export class QuestSystem {
  constructor(world, economy) {
    this.world = world;
    this.economy = economy;
    this.active = null;
    this.markerGroup = new THREE.Group();
    this.markerGroup.name = 'quest-markers';
    world.root.add(this.markerGroup);
    this._marks = [];
    this._t = 0;
    this._toastCooldown = 0;
  }

  /* ---------------- board generation ---------------- */
  refreshBoard(force = false) {
    const q = this.economy.data.quests;
    const now = Date.now();
    if (!force && q.board && q.board.length && now - (q.boardSeed || 0) < BOARD_TTL) return q.board;
    q.boardSeed = now;
    const rng = makeRng('board' + Math.floor(now / BOARD_TTL));
    const out = [];
    const kinds = ['courier', 'courier', 'checkpoint', 'wheelie', 'speed', 'tour', 'trick'];
    for (let i = 0; i < BOARD_SIZE; i++) {
      out.push(this.generate(kinds[Math.floor(rng() * kinds.length)], rng));
    }
    q.board = out;
    this.economy.save();
    return out;
  }

  generate(kind, rng = Math.random) {
    const mul = payMul(this.economy);
    const lm = LANDMARKS;
    const pickLm = () => lm[Math.floor(rng() * lm.length)];

    if (kind === 'courier') {
      let a = pickLm(), b = pickLm();
      let guard = 0;
      while ((b.id === a.id || Math.hypot(a.x - b.x, a.z - b.z) < 350) && guard++ < 40) b = pickLm();
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      const urgency = rng() < 0.45;
      const base = 55 + dist * 0.22;
      return {
        id: uid(6), kind: 'courier',
        title: urgency ? 'Rush delivery' : 'Courier run',
        client: pick(CLIENTS), cargo: pick(CARGO),
        desc: `Collect ${'from ' + a.name} and drop at ${b.name}.`,
        from: { x: a.x, z: a.z, name: a.name },
        to: { x: b.x, z: b.z, name: b.name },
        dist,
        timeLimit: urgency ? Math.max(40, dist / 11) : 0,
        reward: Math.round(base * (urgency ? 1.75 : 1) * mul),
        stage: 0,
      };
    }

    if (kind === 'checkpoint') {
      const n = 3 + Math.floor(rng() * 3);
      const pts = [];
      let last = pickLm();
      pts.push(last);
      for (let i = 1; i < n; i++) {
        let c = pickLm(), guard = 0;
        while ((pts.some((p) => p.id === c.id) || Math.hypot(c.x - last.x, c.z - last.z) < 260) && guard++ < 50) c = pickLm();
        pts.push(c); last = c;
      }
      let dist = 0;
      for (let i = 1; i < pts.length; i++) dist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      return {
        id: uid(6), kind: 'checkpoint',
        title: 'Checkpoint dash',
        client: pick(CLIENTS),
        desc: `Hit ${n} checkpoints in order before the clock runs out.`,
        points: pts.map((p) => ({ x: p.x, z: p.z, name: p.name })),
        dist,
        timeLimit: Math.max(50, dist / 10.5),
        reward: Math.round((80 + dist * 0.26) * mul),
        stage: 0,
      };
    }

    if (kind === 'wheelie') {
      const secs = [6, 9, 12, 16, 22][Math.floor(rng() * 5)];
      return {
        id: uid(6), kind: 'wheelie',
        title: `${secs}-second wheelie`,
        client: pick(['Volta Wheelie Club', 'DeckDemon', 'the internet', 'Amp Park Rangers']),
        desc: `Hold a single wheelie for ${secs} seconds. Touching down resets it.`,
        target: secs,
        reward: Math.round((90 + secs * 26) * mul),
        stage: 0,
      };
    }

    if (kind === 'speed') {
      const mph = [35, 50, 70, 100, 140, 190, 250][Math.floor(rng() * 7)];
      return {
        id: uid(6), kind: 'speed',
        title: `Hit ${mph} mph`,
        client: 'Volta Speed Trap',
        desc: `Get a build to ${mph} mph anywhere in Volta Bay. The Mile is the obvious place.`,
        target: mph,
        reward: Math.round((60 + mph * 5.2) * mul),
        stage: 0,
      };
    }

    if (kind === 'tour') {
      const n = 3 + Math.floor(rng() * 2);
      const chosen = [];
      while (chosen.length < n) {
        const c = pickLm();
        if (!chosen.some((x) => x.id === c.id)) chosen.push(c);
      }
      return {
        id: uid(6), kind: 'tour',
        title: 'Sightseeing loop',
        client: 'Volta Bay Tourism',
        desc: `Visit ${n} spots in any order. No timer — go and look at the place.`,
        points: chosen.map((p) => ({ x: p.x, z: p.z, name: p.name, hit: false })),
        reward: Math.round((110 + n * 55) * mul),
        stage: 0,
      };
    }

    // trick
    const target = [1200, 2400, 4200, 7000][Math.floor(rng() * 4)];
    return {
      id: uid(6), kind: 'trick',
      title: 'Trick contract',
      client: pick(['Amp Bowl', 'Cell Works Yard', 'Volta Wheelie Club']),
      desc: `Bank ${target.toLocaleString()} trick points in one session. Wheelies, air and links all count.`,
      target,
      progressPts: 0,
      reward: Math.round((target * 0.18 + 80) * mul),
      stage: 0,
    };
  }

  /* ---------------- lifecycle ---------------- */
  accept(q) {
    this.active = JSON.parse(JSON.stringify(q));
    this.active.startedAt = Date.now();
    this.active.timeLeft = this.active.timeLimit || 0;
    this.active.progressPts = 0;
    this.economy.data.quests.active = this.active;
    this.economy.data.quests.board = this.economy.data.quests.board.filter((b) => b.id !== q.id);
    this.economy.save();
    this.rebuildMarkers();
    return this.active;
  }

  abandon() {
    this.active = null;
    this.economy.data.quests.active = null;
    this.economy.save();
    this.rebuildMarkers();
  }

  restore() {
    const a = this.economy.data.quests.active;
    if (a) { this.active = a; this.rebuildMarkers(); }
  }

  complete(game) {
    const q = this.active;
    if (!q) return;
    let reward = q.reward;
    let bonusText = '';
    if (q.timeLimit && q.timeLeft > 0) {
      const frac = q.timeLeft / q.timeLimit;
      if (frac > 0.35) { reward = Math.round(reward * (1 + frac * 0.5)); bonusText = ' + time bonus'; }
    }
    this.economy.earn(reward);
    this.economy.data.records.questsDone++;
    this.economy.data.quests.done.push({ id: q.id, kind: q.kind, at: Date.now(), reward });
    if (this.economy.data.quests.done.length > 60) this.economy.data.quests.done.shift();
    this.active = null;
    this.economy.data.quests.active = null;
    this.economy.save();
    this.rebuildMarkers();
    game.hud.setCash(this.economy.cash);
    game.hud.cashToast(reward, q.title + bonusText);
    game.hud.toast(`✅ <b>${q.title}</b> complete`, '', 3200);
    import('../core/audio.js').then(({ audio }) => audio.levelUp());
  }

  fail(game, why) {
    if (!this.active) return;
    const t = this.active.title;
    this.active = null;
    this.economy.data.quests.active = null;
    this.economy.save();
    this.rebuildMarkers();
    game.hud.toast(`❌ <b>${t}</b> failed — ${why}`, 'bad', 3200);
  }

  /* ---------------- per-frame ---------------- */
  update(dt, game, body) {
    this._t += dt;
    this._toastCooldown = Math.max(0, this._toastCooldown - dt);
    const q = this.active;

    // spin the markers
    for (const m of this._marks) {
      m.obj.rotation.y += dt * 0.8;
      m.obj.children[0].scale.setScalar(1 + Math.sin(this._t * 3 + m.i) * 0.06);
    }

    if (!q) return;

    if (q.timeLimit) {
      q.timeLeft -= dt;
      if (q.timeLeft <= 0) { this.fail(game, 'out of time'); return; }
    }

    const px = body.pos.x, pz = body.pos.z;
    const near = (p, r = 13) => Math.hypot(px - p.x, pz - p.z) < r;

    switch (q.kind) {
      case 'courier': {
        if (q.stage === 0) {
          if (near(q.from)) {
            q.stage = 1;
            this.rebuildMarkers();
            game.hud.toast(`📦 Picked up ${q.cargo}. Take it to ${q.to.name}.`, 'info', 3000);
          }
        } else if (near(q.to)) {
          this.complete(game);
        }
        break;
      }
      case 'checkpoint': {
        const cp = q.points[q.stage];
        if (cp && near(cp, 15)) {
          q.stage++;
          this.rebuildMarkers();
          if (q.stage >= q.points.length) this.complete(game);
          else {
            game.hud.toast(`Checkpoint ${q.stage}/${q.points.length}`, 'info', 1500);
            q.timeLeft += 4;
          }
        }
        break;
      }
      case 'tour': {
        let all = true;
        for (const p of q.points) {
          if (!p.hit && near(p, 18)) {
            p.hit = true;
            this.rebuildMarkers();
            game.hud.toast(`📸 ${p.name}`, 'info', 1800);
          }
          if (!p.hit) all = false;
        }
        if (all) this.complete(game);
        break;
      }
      case 'wheelie': {
        q.best = Math.max(q.best || 0, body.wheelieTime);
        if (body.wheelieTime >= q.target) this.complete(game);
        break;
      }
      case 'speed': {
        const mph = Math.abs(body.speed) * MS_TO_MPH;
        q.best = Math.max(q.best || 0, mph);
        if (mph >= q.target) this.complete(game);
        break;
      }
      case 'trick': {
        if (q.progressPts >= q.target) this.complete(game);
        break;
      }
      case 'timed-zone': {
        q.timeLeft = q.timeLeft;
        break;
      }
    }
  }

  /** called from the trick banker */
  addTrickPoints(pts, game) {
    if (this.active && this.active.kind === 'trick') {
      this.active.progressPts = (this.active.progressPts || 0) + pts;
    }
  }

  /* ---------------- HUD plumbing ---------------- */
  trackerInfo() {
    const q = this.active;
    if (!q) return null;
    let hint = q.desc, progress = 0;
    switch (q.kind) {
      case 'courier':
        hint = q.stage === 0 ? `Pick up from ${q.from.name}` : `Deliver to ${q.to.name}`;
        progress = q.stage === 0 ? 0.15 : 0.6;
        break;
      case 'checkpoint':
        hint = `Checkpoint ${q.stage + 1} of ${q.points.length} — ${q.points[Math.min(q.stage, q.points.length - 1)].name}`;
        progress = q.stage / q.points.length;
        break;
      case 'tour': {
        const hit = q.points.filter((p) => p.hit).length;
        hint = `${hit}/${q.points.length} visited`;
        progress = hit / q.points.length;
        break;
      }
      case 'wheelie':
        hint = `Best so far ${(q.best || 0).toFixed(1)}s of ${q.target}s`;
        progress = clamp((q.best || 0) / q.target, 0, 1);
        break;
      case 'speed':
        hint = `Best ${Math.round(q.best || 0)} mph of ${q.target} mph`;
        progress = clamp((q.best || 0) / q.target, 0, 1);
        break;
      case 'trick':
        hint = `${Math.round(q.progressPts || 0).toLocaleString()} / ${q.target.toLocaleString()} pts banked`;
        progress = clamp((q.progressPts || 0) / q.target, 0, 1);
        break;
    }
    if (q.timeLimit) hint += ` · ${fmtTime(q.timeLeft)}`;
    return { title: q.title, hint, reward: q.reward, progress };
  }

  markers() {
    const q = this.active;
    if (!q) return [];
    const out = [];
    if (q.kind === 'courier') out.push(q.stage === 0 ? { ...q.from, color: '#16c2ff' } : { ...q.to, color: '#39e6a4' });
    if (q.kind === 'checkpoint' && q.points[q.stage]) out.push({ ...q.points[q.stage], color: '#ffd34d' });
    if (q.kind === 'tour') for (const p of q.points) if (!p.hit) out.push({ ...p, color: '#a06bff' });
    return out;
  }

  /* ---------------- 3D markers ---------------- */
  rebuildMarkers() {
    for (const m of this._marks) {
      this.markerGroup.remove(m.obj);
      m.obj.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    this._marks.length = 0;
    const list = this.markers();
    let i = 0;
    for (const p of list) {
      const g = new THREE.Group();
      const y = this.world.groundAt(p.x, p.z);
      g.position.set(p.x, y, p.z);
      const col = new THREE.Color(p.color || '#ffd34d');

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(9, 0.35, 6, 40),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.3;
      g.add(ring);

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 2.4, 26, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
      );
      beam.position.y = 13;
      g.add(beam);

      const lbl = makeLabel(p.name || 'Marker', col.getHex(), 0.9);
      lbl.position.y = 28;
      g.add(lbl);

      this.markerGroup.add(g);
      this._marks.push({ obj: g, i: i++ });
    }
  }

  /* ---------------- POI mini-events ---------------- */
  startSpeedRun(game) {
    const best = Math.round((this.economy.data.records.topSpeedMs || 0) * MS_TO_MPH);
    const st = game.player.body.stats;
    import('../ui/menus.js').then(({ infoBox }) => {
      infoBox('The Mile', `
        <p style="font-size:13.5px;line-height:1.6;color:#b9c3d6">
        1 760 m of dead-straight tarmac with a launch ramp at each end. Nothing to hit, nothing to
        slow you down — this is where you find out what your build actually does.</p>
        <div class="hr"></div>
        <div class="kv"><span>Your record</span><b>${best} mph</b></div>
        <div class="kv"><span>This build's theoretical top</span><b>${Math.round(st.topSpeedMph)} mph</b></div>
        <div class="kv"><span>Limited by</span><b>${st.topLimit}</b></div>
        <div class="note ${st.topLimit === 'tyre rating' ? 'warn' : 'info'}" style="margin-top:10px">
          ${st.topLimit === 'tyre rating'
            ? 'Your tyres are the limit. Fit higher-rated rubber and the same motor will pull a lot harder.'
            : st.topLimit === 'motor rpm'
              ? 'You are out of motor revs, not out of power. A higher-voltage pack raises the ceiling.'
              : 'You are drag-limited. A fairing is worth more than another kilowatt from here.'}
        </div>`, { size: 'sm' });
    });
  }

  startTrickJam(game, spot) {
    if (this.active) {
      game.hud.toast('Finish or abandon your current job first.', 'bad');
      return;
    }
    const target = Math.round(1400 * payMul(this.economy) ** 0.6);
    const q = {
      id: uid(6), kind: 'trick', title: `${spot} jam`,
      client: spot, desc: `Bank ${target.toLocaleString()} trick points. The clock is 120 seconds.`,
      target, progressPts: 0, timeLimit: 120,
      reward: Math.round((target * 0.3 + 120) * 1),
    };
    this.accept(q);
    game.hud.toast(`🎪 <b>${spot} jam</b> — ${target.toLocaleString()} pts in 2 minutes`, 'info', 4000);
  }

  visitView(game) {
    const seen = this.economy.data.seen;
    if (!seen.view) {
      seen.view = true;
      const pay = Math.round(400 * payMul(this.economy));
      this.economy.earn(pay);
      game.hud.setCash(this.economy.cash);
      game.hud.cashToast(pay, 'first visit to Ridge Lookout');
    }
    import('../ui/menus.js').then(({ infoBox }) => {
      infoBox('Ridge Lookout', `<p style="font-size:13.5px;line-height:1.6;color:#b9c3d6">
        The whole of Volta Bay from 130 metres up: the grid downtown, the Mile running along the
        north edge, Cell Works smoking away to the west, and the bay opening out to the south.
        Worth the climb.</p>`, { size: 'sm' });
    });
  }
}
