/* ============================================================
   E-RIDE — main.js
   ============================================================ */
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { input } from './core/input.js';
import { audio } from './core/audio.js';
import { settings } from './core/settings.js';
import { $, clamp, damp, fmtMoney, fmtMoneyFull, fmtDist, el, escapeHtml, MS_TO_MPH } from './core/util.js';

import { World } from './world/world.js';
import { WORLD } from './world/layout.js';
import { VERSION, IS_BETA } from './core/version.js';

import { economy, presetPrice } from './game/economy.js';
import { Player, RemotePlayer, RIDER_COLORS } from './game/player.js';
import { ChaseCam } from './game/camera.js';
import { Tricks, ptsToCash } from './game/tricks.js';
import { QuestSystem } from './game/quests.js';
import { Effects } from './game/effects.js';
import { Traffic } from './game/traffic.js';
import { Police } from './game/police.js';
import { Pickups } from './game/pickups.js';
import { Trailer } from './game/trailer.js';

import { HUD } from './ui/hud.js';
import { openPanel, closePanel, closeAll, panel, tabBar, btn, isMenuOpen, openSettings,
         confirmBox, infoBox, promptBox, refreshTop, setCloseHandler } from './ui/menus.js';
import { openGarage } from './ui/garage.js';
import { openStore } from './ui/store.js';
import { openMarket } from './ui/market.js';
import { openQuestBoard } from './ui/questui.js';
import { openBigMap } from './ui/bigmap.js';
import { TouchControls } from './ui/touch.js';
import { openMultiplayer, playerListPanel } from './ui/mpui.js';
import { openFeedback } from './ui/feedback.js';

import { NetClient, codeFromUrl } from './net/client.js';
import { PRESETS, PRESET_BY_ID } from './vehicle/parts.js';
import { stats as computeStats, buildFromPreset } from './vehicle/build.js';

/* ============================================================ */
class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.engine = new Engine(this.canvas);
    this.world = new World(this.engine.scene);
    this.state = 'loading';
    this.remote = new Map();
    this.tricks = new Tricks();
    this.freeRoamMeters = 0;
    this.rideOutTimer = 0;
    this.lastSave = 0;
    this.sessionStart = performance.now();
    this.paused = false;
    this._v = new THREE.Vector3();
  }

  /* ---------------- boot ---------------- */
  async boot() {
    const fill = $('#loadfill'), msg = $('#loadmsg');
    await this.world.build((p, m) => {
      fill.style.width = (p * 100).toFixed(1) + '%';
      msg.textContent = m;
    });

    this.hud = new HUD(this.world);
    this.cam = new ChaseCam(this.engine.camera, this.world);
    this.fx = new Effects(this.engine.scene, this.world);
    this.traffic = new Traffic(this.engine.scene, this.world);
    this.police = new Police(this.world);
    this.pickups = new Pickups(this.engine.scene, this.world, economy.data.cells || []);
    this.slowmo = 1;
    this.tricks.onTrick = (label, pts, mult) => {
      if (pts < 8) return;
      const big = pts >= 180;
      this.hud.popup(label.toUpperCase(), '+' + pts, big ? '#ffd34d' : '#39e6a4');
      if (big) this.cam.addShake(0.35);
    };
    this.quests = new QuestSystem(this.world, economy);
    this.net = new NetClient(this);
    this.touch = new TouchControls(this);

    setCloseHandler(() => { this.paused = false; });

    $('#loading').classList.add('hidden');
    this.engine.render();

    // idle camera over the city behind the menu
    this.menuCamT = Math.random() * 100;

    if (economy.exists) this.showMainMenu();
    else this.showIntro();

    // a ?join=CODE invite link drops you straight into that room
    const invite = codeFromUrl();
    if (invite && economy.exists) {
      this.net.join(invite);
      this.hud.toast(`Joining room <b>${escapeHtml(invite)}</b>…`, 'info', 4000);
    }

    this.loop();

    window.__G = this;
  }

  /* ---------------- menus ---------------- */
  showIntro() {
    this.state = 'menu';
    openPanel(() => {
      const body = el('div', 'home');
      body.appendChild(el('div', 'logo', 'E&#8209;RIDE'));
      body.appendChild(el('div', 'tagline', `volta bay · ${VERSION}`));
      body.appendChild(el('div', 'home-foot', `
        Ride e&#8209;bikes and e&#8209;scooters around Volta Bay. Pull wheelies, run courier jobs and
        ride out with other players to earn cash — then build, tune and sell machines
        from a catalogue that runs from a 250&nbsp;W commuter hub all the way to a
        900&nbsp;kW reactor-fed shaft drive.`));
      const b = el('div', 'home-btns');
      b.appendChild(btn('Pick your first ride', 'primary', () => this.pickStarter()));
      body.appendChild(b);
      return panel({ title: 'Welcome to Volta Bay', sub: 'a brand new save', size: 'md', body });
    });
  }

  pickStarter() {
    let sel = 'v-light';
    openPanel(() => {
      const body = el('div');
      body.appendChild(el('div', 'note info',
        'Pick the machine you learn on. You can buy the others later — and eventually build things that make all three look like bicycles.'));
      const grid = el('div', 'grid c2');
      grid.style.marginTop = '12px';
      for (const p of PRESETS.filter((x) => x.starter)) {
        const st = computeStats(buildFromPreset(p.id), { riders: 1 });
        const c = el('div', 'card' + (sel === p.id ? ' sel' : ''));
        c.innerHTML = `
          <span class="tier t-${st.tier}">${p.cls === 'scooter' ? 'E-SCOOTER' : 'E-BIKE'}</span>
          <h4>${escapeHtml(p.name)}</h4>
          <div class="muted">${escapeHtml(p.blurb)}</div>
          <div class="stats">
            ${statBar('Top speed', st.topSpeedMph / 60, Math.round(st.topSpeedMph) + ' mph')}
            ${statBar('Wheelie', st.wheelieEase / 2, st.wheelieEase > 1.4 ? 'Easy' : st.wheelieEase > 0.85 ? 'Fair' : 'Tricky')}
            ${statBar('Handling', st.handling, Math.round(st.handling * 100))}
            ${statBar('Range', clamp(st.rangeKm / 120, 0, 1), Math.round(st.rangeKm) + ' km')}
          </div>
          <div class="card-row"><span class="muted">${st.seats > 1 ? '2 seats' : '1 seat'} · ${Math.round(st.massKg - 78)} kg</span>
          <span class="price owned">FREE START</span></div>`;
        c.onclick = () => { sel = p.id; audio.ui('click'); refreshTop(); };
        grid.appendChild(c);
      }
      body.appendChild(grid);

      const foot = el('div');
      const nameIn = el('input');
      nameIn.type = 'text'; nameIn.placeholder = 'Rider name'; nameIn.maxLength = 16;
      nameIn.value = settings.get('name') || '';
      nameIn.style.cssText = 'background:#10182b;border:1px solid #27324f;border-radius:10px;padding:9px 12px;color:#e7ecf7;font:inherit;font-size:13px;max-width:180px';
      foot.appendChild(nameIn);
      foot.appendChild(el('div', 'spacer'));
      foot.appendChild(btn('Start riding', 'primary', () => {
        const nm = (nameIn.value || 'Rider').slice(0, 16);
        settings.set('name', nm);
        economy.fresh(nm, sel);
        closeAll();
        this.startPlay(true);
      }));
      return panel({ title: 'Your first ride', sub: 'choose a starter', size: '', body, foot, onBack: () => closePanel() });
    });
  }

  showMainMenu() {
    this.state = 'menu';
    openPanel(() => {
      const body = el('div', 'home');
      body.appendChild(el('div', 'logo', 'E&#8209;RIDE'));
      const v = economy.activeVehicle;
      body.appendChild(el('div', 'tagline',
        `${escapeHtml(economy.data.name)} · ${fmtMoneyFull(economy.cash)} · ${escapeHtml(v ? v.name : '—')}`));
      body.appendChild(el('div', 'vtag', VERSION + (IS_BETA ? ' — early build, expect rough edges' : '')));
      const b = el('div', 'home-btns');
      b.appendChild(btn('Ride', 'primary', () => { closeAll(); this.startPlay(); }));
      b.appendChild(btn('Garage', '', () => openGarage(this)));
      b.appendChild(btn('VoltMart', '', () => openStore(this)));
      b.appendChild(btn('Multiplayer', '', () => openMultiplayer(this)));
      b.appendChild(btn('Settings', '', () => openSettings(this)));
      b.appendChild(btn('💡 Suggestion box', 'ghost', () => openFeedback(this)));
      body.appendChild(b);
      body.appendChild(el('div', 'home-foot',
        'WASD to ride · Shift to wheelie · E to interact · right-drag to look around · scroll to zoom · Esc for the menu.'));
      return panel({ title: 'Volta Bay', sub: 'main menu', size: 'md', body });
    });
  }

  /* ---------------- play ---------------- */
  startPlay(firstTime = false) {
    audio.resume();
    if (!this.player) this.spawnPlayer();
    else this.syncActiveVehicle();

    this.state = 'play';
    this.hud.show(true);
    this.hud.setCash(economy.cash, false);
    $('#pause-btn').classList.remove('hidden');
    $('#pause-btn').style.opacity = '1';
    $('#pause-btn').style.pointerEvents = 'auto';
    this.refreshTouch();
    this.cam.snap(this.player.body);
    this.quests.refreshBoard();

    if (firstTime) {
      this.hud.toast('Ride to the glowing rings — 🟢 garage, 🟡 store, 🔵 jobs.', 'info', 6000);
      setTimeout(() => this.hud.toast('Hold <b>Shift</b> + throttle for a wheelie. The longer you hold it, the more it pays.', 'info', 7000), 3500);
    }
  }

  spawnPlayer() {
    const v = economy.activeVehicle;
    const sp = this.world.spawnPoint(0);
    this.player = new Player(this.world, this.engine.scene, v.build, {
      name: economy.data.name, colorIdx: 0,
    });
    this.player.body.placeAt(sp.x, sp.z, sp.yaw);
    this.player.body.charge = v.charge ?? 1;
    this.applyAssist();
    this.bindBodyEvents();
    this.hud.setVehicleName(v.name);
  }

  syncActiveVehicle() {
    const v = economy.activeVehicle;
    if (!v) return;
    if (JSON.stringify(v.build) !== JSON.stringify(this.player.build)) {
      this.player.setBuild(v.build);
      this.bindBodyEvents();
      this.applyAssist();
      this.player.body.charge = v.charge ?? 1;
      this.net.sendBuild();
    }
    this.hud.setVehicleName(v.name);
  }

  bindBodyEvents() {
    const b = this.player.body;
    b.onCrash = (reason) => {
      const lost = this.tricks.onCrash();
      audio.crash();
      this.cam.addShake(1.1);
      this.fx.crashBurst(b.pos);
      economy.data.records.crashes++;
      this.hud.toast(`💥 ${escapeHtml(reason)}${lost > 400 ? ` — lost ${Math.round(lost).toLocaleString()} pts` : ''}`, 'bad', 2600);
      this.net.sendEvent('crash', { r: reason });
      setTimeout(() => { if (this.player.body.crashed) this.recover(); }, 1700);
    };
    b.onLanded = (impact, air) => {
      if (air > 0.3) { audio.land(impact); this.cam.addShake(impact * 0.6); this.fx.landPuff(b.pos, impact); }
      this.tricks.onLand(air, impact, b);
    };
    b.onBump = (sev) => { this.cam.addShake(sev * 0.5); audio.land(sev * 0.6); };
    this.tricks.onBank = (pts, summary) => {
      const cash = ptsToCash(pts);
      if (cash < 1) return;
      economy.earn(cash);
      economy.data.records.tricksBanked += pts;
      this.hud.setCash(economy.cash);
      this.hud.cashToast(cash, `${Math.round(pts).toLocaleString()} pts ×${summary.mult.toFixed(1)}`);
      audio.cash(summary.mult);
    };
  }

  applyAssist() {
    if (this.player) this.player.body.assist = settings.get('assistWheelie');
  }

  onNameChanged() {
    if (economy.exists) { economy.data.name = settings.get('name') || 'Rider'; economy.save(); }
    this.net.sendHello();
  }

  wipeSave() {
    economy.wipe();
    location.reload();
  }

  recover() {
    const b = this.player.body;
    b.recover();
    this.cam.snap(b);
    this.tricks.reset();
  }

  refreshTouch() { this.touch.refresh(); }

  /* ---------------- pause ---------------- */
  pause() {
    if (isMenuOpen()) { closeAll(); return; }
    this.paused = true;
    audio.updateMotor({ active: false });
    openPanel(() => {
      const body = el('div', 'home');
      const r = economy.data.records;
      body.appendChild(el('div', '', `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;font-size:12.5px;width:min(420px,84vw)">
          <div class="kv"><span>Cash</span><b style="color:#ffd34d">${fmtMoneyFull(economy.cash)}</b></div>
          <div class="kv"><span>Distance</span><b>${fmtDist(r.distance)}</b></div>
          <div class="kv"><span>Best wheelie</span><b>${r.bestWheelieTime.toFixed(1)}s</b></div>
          <div class="kv"><span>Longest wheelie</span><b>${fmtDist(r.bestWheelieDist)}</b></div>
          <div class="kv"><span>Top speed</span><b>${Math.round(r.topSpeedMs * MS_TO_MPH)} mph</b></div>
          <div class="kv"><span>Jobs done</span><b>${r.questsDone}</b></div>
        </div>`));
      const b = el('div', 'home-btns');
      b.appendChild(btn('Resume', 'primary', () => closeAll()));
      b.appendChild(btn('Garage', '', () => openGarage(this)));
      b.appendChild(btn('VoltMart', '', () => openStore(this)));
      b.appendChild(btn('Swap Meet', '', () => openMarket(this)));
      b.appendChild(btn('Jobs', '', () => openQuestBoard(this)));
      b.appendChild(btn('Multiplayer', '', () => openMultiplayer(this)));
      b.appendChild(btn('Settings', '', () => openSettings(this)));
      b.appendChild(btn('💡 Suggest / report a bug', 'ghost', () => openFeedback(this)));
      body.appendChild(b);
      return panel({ title: 'Paused', sub: escapeHtml(economy.data.name), size: 'sm', body });
    }, { onClose: () => { this.paused = false; } });
  }

  /* ---------------- interaction ---------------- */
  updatePrompt() {
    const b = this.player.body;
    if (this.player.ridingWith) {
      this.hud.setPrompt(`<b>F</b> hop off`);
      return;
    }
    // a nearby vehicle with a free seat?
    const host = this.findMountTarget();
    if (host) { this.hud.setPrompt(`<b>E</b> ride with ${escapeHtml(host.name)}`); return; }

    const poi = this.world.poiNear(b.pos.x, b.pos.z);
    if (poi) {
      const charging = b.charge < 1 && Math.abs(b.speed) < 2.5 && !b.stats.selfFuelled;
      this.hud.setPrompt(charging
        ? `⚡ charging <b>${Math.round(b.charge * 100)}%</b> &nbsp;·&nbsp; <b>E</b> ${escapeHtml(poi.name)}`
        : `<b>E</b> ${escapeHtml(poi.sub)} — ${escapeHtml(poi.name)}`);
      return;
    }

    if (this.player.passenger) { this.hud.setPrompt(`<b>F</b> drop off ${escapeHtml(this.player.passenger.name)}`); return; }
    this.hud.setPrompt('');
  }

  findMountTarget() {
    if (this.player.ridingWith || this.player.passenger) return null;
    const p = this.player.body.pos;
    let best = null, bd = 6.5;
    for (const r of this.remote.values()) {
      if (r.passengerOf || r.hasPassenger) continue;
      if (r.stats.seats < 2) continue;
      const d = Math.hypot(r.cur.x - p.x, r.cur.z - p.z);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  interact() {
    const b = this.player.body;
    if (this.player.ridingWith) { this.net.requestDismount(); return; }
    const host = this.findMountTarget();
    if (host) { this.net.requestMount(host.id); return; }
    const poi = this.world.poiNear(b.pos.x, b.pos.z);
    if (poi) this.openPoi(poi);
  }

  openPoi(poi) {
    audio.ui('open');
    switch (poi.kind) {
      case 'garage': openGarage(this); break;
      case 'store': openStore(this); break;
      case 'market': openMarket(this); break;
      case 'jobs': openQuestBoard(this); break;
      case 'strip': this.quests.startSpeedRun(this); break;
      case 'skate': this.quests.startTrickJam(this, 'Amp Bowl'); break;
      case 'course': this.quests.startTrickJam(this, 'Cell Works Yard'); break;
      case 'view': this.quests.visitView(this); break;
      case 'meet': openMultiplayer(this); break;
      default: infoBox(poi.name, `<p>${escapeHtml(poi.sub)}</p>`);
    }
  }

  /* ---------------- loop ---------------- */
  loop = () => {
    requestAnimationFrame(this.loop);
    const dt = this.engine.tick();
    if (this.trailerMode) {
      this.trailerTick(dt);
      this.engine.render();
      if (this.afterRender) this.afterRender();
      input.endFrame();
      return;
    }
    if (this.state === 'menu' || !this.player) { this.menuCam(dt); this.engine.render(); return; }
    if (!this.paused && !isMenuOpen()) this.update(dt * this.slowmo);
    else this.updatePausedVisuals(dt);
    this.engine.render();
    if (this.afterRender) this.afterRender();
    input.endFrame();
  };

  /** record the 30-second trailer and POST it to the dev server */
  async recordTrailer() {
    if (!this.player) { closeAll(); this.startPlay(); }
    await new Promise((r) => setTimeout(r, 400));
    const t = new Trailer(this);
    const out = await t.record();
    if (!out || !out.blob) return { ok: false, error: out && out.error };
    const blob = out.blob;
    if (out.error) console.warn('[trailer] finished with an error:', out.error);
    try {
      const res = await fetch('/__save?name=trailer.webm', { method: 'POST', body: blob });
      return { ok: res.ok, bytes: blob.size, type: blob.type, error: out.error };
    } catch (e) {
      // fall back to a browser download
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'e-ride-trailer.webm';
      a.click();
      return { ok: false, downloaded: true, bytes: blob.size, err: e.message };
    }
  }

  menuCam(dt) {
    this.menuCamT += dt * 0.055;
    const t = this.menuCamT;
    const r = 520 + Math.sin(t * 0.4) * 130;
    const tgt = new THREE.Vector3(0, 24, -380);
    this.engine.camera.position.set(
      Math.cos(t) * r, 120 + Math.sin(t * 0.7) * 55, Math.sin(t) * r - 380);
    this.engine.camera.lookAt(tgt);
    this.engine.focusShadows(tgt);
    this.world.updatePois(this.engine.elapsed, this.engine.camera.position);
  }

  updatePausedVisuals(dt) {
    audio.updateMotor({ active: false });
    if (this.player) this.cam.update(dt, this.player.body, {});
    if (this.player) this.engine.focusShadows(this.player.body.pos);
    this.engine.focusShadows(this.player.body.pos);
  }

  update(dt) {
    input.pollGamepad();
    const p = this.player, b = p.body;

    /* ---- free look: hold right mouse (or two fingers) to swing the camera ---- */
    this.cam.orbit(input.mouse.dx, input.mouse.dy);
    this.cam.zoomBy(input.mouse.wheel);

    /* ---- hotkeys ---- */
    if (input.justPressed('interact')) this.interact();
    if (input.justPressed('dismount')) {
      if (p.ridingWith) this.net.requestDismount();
      else if (p.passenger) this.net.kickPassenger();
    }
    if (input.justPressed('reset')) this.recover();
    if (input.justPressed('camera')) {
      // a plain tap cycles the mode; after free-looking it re-centres first
      if (Math.abs(this.cam.userYaw) > 0.08 || Math.abs(this.cam.userPitch) > 0.08 || this.cam.zoomWant !== 1) {
        this.cam.recenter();
        this.hud.toast('Camera re-centred', 'info', 1100);
      } else {
        this.hud.toast('Camera: ' + this.cam.cycle(), 'info', 1200);
      }
    }
    if (input.justPressed('horn')) { audio.bell(); this.net.sendEvent('bell'); }
    if (input.justPressed('garage')) openGarage(this);
    if (input.justPressed('store')) openStore(this);
    if (input.justPressed('quests')) openQuestBoard(this);
    if (input.justPressed('map')) openBigMap(this);
    if (input.justPressed('players')) playerListPanel(this);
    if (input.justPressed('suggest')) openFeedback(this);

    /* ---- ride ---- */
    const riding = !p.ridingWith;
    const inp = riding ? {
      throttle: input.drive(),
      steer: input.steer(),
      wheelie: input.down('wheelie'),
      brake: input.down('brake'),
      boost: input.down('boost'),
      leanFwd: input.down('lean'),
      lookBehind: input.down('look'),
    } : { throttle: 0, steer: 0 };

    const before = b.distance;
    p.update(dt, inp);

    if (p.ridingWith) {
      this.ridePassenger(dt);
    } else {
      this.tricks.update(dt, b);
    }

    /* ---- records + free-roam pay ---- */
    const moved = b.distance - before;
    if (moved > 0 && !p.ridingWith) {
      economy.data.records.distance += moved;
      this.freeRoamMeters += moved;
      if (this.freeRoamMeters > 70) {
        this.freeRoamMeters -= 70;
        let pay = 1;
        const surf = this.world.surfaceAt(b.pos.x, b.pos.z);
        if (Math.abs(b.speed) > b.stats.topSpeedMs * 0.75) pay += 1;
        if (b.pitch > 0.2) pay += 2;
        if (this.rideOutTimer > 3) pay += 2;
        economy.earn(pay);
        this.hud.setCash(economy.cash, false);
      }
    }
    if (Math.abs(b.speed) > economy.data.records.topSpeedMs) {
      economy.data.records.topSpeedMs = Math.abs(b.speed);
    }
    if (this.tricks.bestWheelieTime > economy.data.records.bestWheelieTime)
      economy.data.records.bestWheelieTime = this.tricks.bestWheelieTime;
    if (this.tricks.bestWheelieDist > economy.data.records.bestWheelieDist)
      economy.data.records.bestWheelieDist = this.tricks.bestWheelieDist;

    /* ---- remote players ---- */
    for (const r of this.remote.values()) r.update(dt);
    this.updatePassengerRigs();
    this.updateRideOut(dt);

    /* ---- charging ---- */
    this.updateCharging(dt, b);

    /* ---- a city that is actually doing something ---- */
    this.traffic.update(dt, b, this.police);
    this.police.sample(dt, b, this.world, this.traffic);
    this.police.update(dt, b);
    this.pickups.update(dt, b, this.engine.elapsed);
    this.handleNearMiss(dt, b);
    this.handleTrafficHit(b);
    this.handlePickups(b);
    this.handlePolice(b);

    /* ---- feel: slow-mo on a big one, speed lines when you are flying ---- */
    const bigAir = !b.grounded && b.airTime > 0.85;
    this.slowmo = damp(this.slowmo, bigAir ? 0.45 : 1, bigAir ? 9 : 5, dt);
    document.body.classList.toggle('slowmo', this.slowmo < 0.9);
    document.body.classList.toggle('fast', Math.abs(b.speed) > b.stats.topSpeedMs * 0.82);
    this.hud.updateWanted(this.police);
    this.hud.setCells(this.pickups.collected, this.pickups.total);

    /* ---- systems ---- */
    this.quests.update(dt, this, b);
    this.net.update(dt);
    this.fx.update(dt, b, this.world);
    this.cam.update(dt, p.ridingWith ? p.ridingWith.bodyLike || b : b, { lookBehind: inp.lookBehind });
    this.engine.focusShadows(b.pos);
    this.world.updatePois(this.engine.elapsed, b.pos);

    /* ---- audio ---- */
    audio.updateMotor({
      speed: Math.abs(b.speed), throttle: Math.abs(inp.throttle || 0),
      maxSpeed: b.stats.topSpeedMs, grounded: b.grounded, active: true,
    });
    audio.skid(b.slipping > 0.35 && b.grounded && Math.abs(b.speed) > 3);

    /* ---- hud ---- */
    this.hud.updateVehicle(b, b.stats);
    this.hud.updateWheelie(b, this.tricks);
    this.hud.updateCombo(this.tricks);
    this.hud.setQuest(this.quests.trackerInfo());
    this.hud.updateMinimap(b, this.minimapPlayers(), this.quests.markers().concat(this.minimapExtra(b)));
    this.hud.updateFps(this.engine.fps);
    this.hud.setPlayers(this.net.playerCount, this.net.connected);
    this.updatePrompt();

    /* ---- autosave ---- */
    this.lastSave += dt;
    if (this.lastSave > 8) {
      this.lastSave = 0;
      const v = economy.activeVehicle;
      if (v) { v.charge = b.charge; v.odo = (v.odo || 0) + 0; }
      economy.data.played = (economy.data.played || 0) + 8;
      const sold = economy.tickListings(8);
      for (const s of sold) {
        this.hud.cashToast(s.price, `sold ${s.name} on the Swap Meet`);
        audio.cash(3);
      }
      economy.save();
      this.hud.setCash(economy.cash, false);
    }
  }

  /** squeezing past traffic at speed is worth points and a bit of heat */
  handleNearMiss(dt, b) {
    const nm = this.traffic.nearMiss;
    this._nmCool = Math.max(0, (this._nmCool || 0) - dt);
    if (!nm || this._nmCool > 0 || b.crashed) return;
    this._nmCool = 0.45;
    const mph = nm.speed * MS_TO_MPH;
    const tight = 1 - (nm.d - 1.25) / 2.15;               // 0..1, 1 = paint-scraping
    const pts = Math.round((14 + mph * 0.5) * (0.6 + tight));
    this.tricks.add(tight > 0.62 ? 'Paint scrape!' : 'Near miss', pts);
    this.tricks.bumpMult(tight > 0.62 ? 0.22 : 0.12);
    this.police.addHeat(0.16 + tight * 0.14);
    this.cam.addShake(0.16 + tight * 0.22);
    audio.ui('click');
    this.hud.popup(tight > 0.62 ? 'PAINT SCRAPE' : 'NEAR MISS', '+' + pts, '#16c2ff');
  }

  /** riding into a car is exactly as good an idea as it sounds */
  handleTrafficHit(b) {
    if (b.crashed || !this.traffic.enabled) return;
    const car = this.traffic.hitTest(b.pos.x, b.pos.z, 0.5, this.police);
    if (!car) return;
    const mph = Math.abs(b.speed) * MS_TO_MPH;
    if (car.isCop) {
      // ramming a patrol car is a very fast route to being arrested
      this.police.addHeat(1.1);
      b.crash('Hit a patrol car');
      this.fx.crashBurst(b.pos);
      this.cam.addShake(1.3);
      this.police.caughtT = 1.4;
      return;
    }
    this.police.addHeat(0.55);
    if (mph > 16) {
      b.crash('Hit a car');
      this.fx.crashBurst(b.pos);
      this.cam.addShake(1.1);
    } else {
      b.speed *= -0.25;
      this.cam.addShake(0.5);
    }
    car.honk = 1.4;
  }

  handlePickups(b) {
    for (const e of this.pickups.drain()) {
      if (e.t === 'cell') {
        economy.earn(45);
        economy.data.cells = this.pickups.save();
        this.hud.setCash(economy.cash);
        this.fx.emit(e.x, e.y, e.z, 0, 2.4, 0, 0.45, 0x39e6a4, 0.9);
        audio.ui('ok');
        const done = e.n >= e.total;
        this.hud.toast(done
          ? `⚡ ALL ${e.total} CELLS FOUND — the city is yours`
          : `⚡ Energy cell ${e.n}/${e.total} &nbsp;<b>+$45</b>`, 'cash', done ? 6000 : 2200);
        if (done) economy.earn(25000);
      } else if (e.t === 'boost') {
        b.speed = Math.min(b.speed * 1.22 + 3.5, b.stats.topSpeedMs * 1.02);
        b.charge = clamp(b.charge + 0.06, 0, 1);
        this.tricks.add('Boost gate', 20);
        this.tricks.bumpMult(0.1);
        this.cam.addShake(0.5);
        this.fx.emit(e.x, e.y, e.z, 0, 1.5, 0, 0.6, 0x16c2ff, 0.7);
        audio.ui('ok');
        this.hud.popup('BOOST', '', '#16c2ff');
      }
    }
  }

  handlePolice(b) {
    for (const e of this.police.drain()) {
      if (e.t === 'level') {
        this.hud.toast(`🚨 <b>${escapeHtml(e.name)}</b> — level ${e.level}`, 'bad', 2600);
        audio.ui('err');
        this.cam.addShake(0.4);
      } else if (e.t === 'escaped') {
        economy.earn(e.payout);
        this.hud.setCash(economy.cash);
        this.hud.toast(`🏁 <b>Lost them</b> after ${e.seconds}s &nbsp;<b>+${fmtMoney(e.payout)}</b>`, 'cash', 5000);
        this.tricks.add('Clean getaway', 150 * e.level);
        audio.ui('ok');
        economy.data.records.escapes = (economy.data.records.escapes || 0) + 1;
      } else if (e.t === 'busted') {
        economy.spend(Math.min(e.fine, economy.cash));
        this.hud.setCash(economy.cash);
        this.hud.toast(`🚔 <b>Busted</b> — fined ${fmtMoney(e.fine)}`, 'bad', 4500);
        this.tricks.onCrash();
        b.crash('Pulled over');
        audio.ui('err');
      }
    }
  }

  /** every POI ring doubles as a charge point — stop on one to top up */
  updateCharging(dt, b) {
    if (b.stats.selfFuelled) { b.charge = 1; return; }
    const poi = this.world.poiNear(b.pos.x, b.pos.z);
    const stopped = Math.abs(b.speed) < 2.5;
    if (poi && stopped && b.charge < 1) {
      this._charging = (this._charging || 0) + dt;
      b.charge = clamp(b.charge + dt * 0.09, 0, 1);
      if (b.charge >= 1) {
        this.hud.toast('🔌 Fully charged', 'info', 2200);
        audio.ui('ok');
      } else if (this._charging > 0.9) {
        this._charging = 0;
        this.hud.setPrompt(`⚡ charging — <b>${Math.round(b.charge * 100)}%</b>`);
      }
    }
    // low battery warning, once per drain cycle
    if (b.charge < 0.15 && !this._warnedLow) {
      this._warnedLow = true;
      this.hud.toast('🪫 Battery low — stop on any glowing ring to charge', 'bad', 4500);
    } else if (b.charge > 0.35) this._warnedLow = false;
  }

  minimapExtra(b) {
    const out = this.pickups.blips(b.pos.x, b.pos.z, 170);
    for (const u of this.police.units) out.push({ x: u.x, z: u.z, c: '#ff4d5e' });
    return out;
  }

  minimapPlayers() {
    const out = [];
    for (const r of this.remote.values()) {
      out.push({ x: r.cur.x, z: r.cur.z, color: '#' + RIDER_COLORS[r.colorIdx % RIDER_COLORS.length].toString(16).padStart(6, '0') });
    }
    return out;
  }

  /* ---------------- passenger rigging ---------------- */
  ridePassenger(dt) {
    const host = this.player.ridingWith;
    if (!host) return;
    const b = this.player.body;
    b.pos.set(host.cur.x, host.cur.y, host.cur.z);
    b.yaw = host.cur.yw;
    b.speed = host.cur.sp || 0;
    b.pitch = host.cur.pt || 0;
    b.lean = host.cur.ln || 0;
  }

  updatePassengerRigs() {
    // show/hide the pillion figure on every model
    for (const r of this.remote.values()) {
      r.setHidden(!!r.passengerOf);
    }
    this.player.setStowed(!!this.player.ridingWith);
  }

  updateRideOut(dt) {
    // riding within 45 m of another player pays a group bonus
    let near = 0;
    const p = this.player.body.pos;
    for (const r of this.remote.values()) {
      if (Math.hypot(r.cur.x - p.x, r.cur.z - p.z) < 45) near++;
    }
    if (near > 0 && Math.abs(this.player.body.speed) > 4) {
      this.rideOutTimer += dt;
      economy.data.records.rideOutMeters += Math.abs(this.player.body.speed) * dt;
      if (this.rideOutTimer > 20) {
        this.rideOutTimer = 3;
        const pay = 18 * near;
        economy.earn(pay);
        this.hud.cashToast(pay, `ride-out bonus (${near} rider${near > 1 ? 's' : ''})`);
      }
    } else {
      this.rideOutTimer = Math.max(0, this.rideOutTimer - dt * 2);
    }
  }
}

function statBar(label, frac, value) {
  return `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${clamp(frac, 0, 1) * 100}%"></i></div><b>${value}</b></div>`;
}

/* ============================================================ */
const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  const m = $('#loadmsg');
  if (m) m.innerHTML = 'Failed to start: ' + escapeHtml(e.message) + '<br><span style="opacity:.6">check the console</span>';
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && game.state === 'play') { e.preventDefault(); game.pause(); }
});
$('#pause-btn').addEventListener('click', () => game.pause());
window.addEventListener('pointerdown', () => audio.resume(), { once: true });
window.addEventListener('keydown', () => audio.resume(), { once: true });
window.addEventListener('beforeunload', () => { if (economy.exists) economy.save(); });

export { game, statBar };
