/* ============================================================
   economy.js — money, garage, inventory, marketplace, save file
   ============================================================ */
import { PARTS, PRESETS, PRESET_BY_ID, getPart, SLOTS, TIERS } from '../vehicle/parts.js';
import { buildFromPreset, buildValue, stats, autoName, buildTier } from '../vehicle/build.js';
import { uid, makeRng, clamp, pick, randInt } from '../core/util.js';

const KEY = 'eride.save.v1';
const START_CASH = 850;

/* how much VoltMart pays you for a used build / part */
export const SELL_RATE = 0.55;
/** marketplace listing fee */
export const LIST_FEE = 0.03;

export class Economy {
  constructor() {
    this.data = null;
    this.listeners = new Set();
    this.load();
  }

  fresh(name = 'Rider', starterPresetId = 'v-light') {
    const preset = PRESET_BY_ID.get(starterPresetId) || PRESETS[0];
    const vid = uid();
    this.data = {
      v: 1,
      name,
      cash: START_CASH,
      created: Date.now(),
      played: 0,
      ownedParts: {},
      garage: [{
        id: vid,
        name: preset.name,
        preset: preset.id,
        build: { ...preset.parts },
        odo: 0,
        charge: 1,
        bought: Date.now(),
      }],
      active: vid,
      listings: [],
      market: [],
      marketSeed: Date.now(),
      marketRefreshed: 0,
      quests: { done: [], active: null, board: [], boardSeed: 0, streak: 0 },
      cells: [],
      records: {
        distance: 0, topSpeedMs: 0, bestWheelieTime: 0, bestWheelieDist: 0,
        bestAir: 0, crashes: 0, earned: 0, spent: 0, tricksBanked: 0,
        questsDone: 0, milesRidden: 0, rideOutMeters: 0,
      },
      seen: {},
    };
    // the starter's parts are owned
    for (const k of Object.keys(preset.parts)) this.addPart(preset.parts[k], 1, true);
    this.refreshMarket(true);
    this.save();
    return this.data;
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.v === 1 && d.garage) { this.data = d; this._migrate(); return true; }
      }
    } catch (e) { console.warn('[economy] load failed', e); }
    return false;
  }

  _migrate() {
    const d = this.data;

    /* An early trailer-recorder build created vehicles named after the
       preset id ("v-ultra") rather than the preset's actual name. Repair
       those in place so existing saves stop showing an id in the HUD. */
    for (const v of d.garage || []) {
      if (typeof v.name === 'string' && /^v-[a-z0-9]+$/i.test(v.name)) {
        const p = PRESET_BY_ID.get(v.name.toLowerCase());
        if (p) v.name = p.name;
      }
    }
    if (!Array.isArray(d.cells)) d.cells = [];
    d.records = Object.assign({
      distance: 0, topSpeedMs: 0, bestWheelieTime: 0, bestWheelieDist: 0,
      bestAir: 0, crashes: 0, earned: 0, spent: 0, tricksBanked: 0,
      questsDone: 0, milesRidden: 0, rideOutMeters: 0,
    }, d.records || {});
    d.quests = Object.assign({ done: [], active: null, board: [], boardSeed: 0, streak: 0 }, d.quests || {});
    d.listings = d.listings || [];
    d.market = d.market || [];
    d.seen = d.seen || {};
    for (const v of d.garage) { v.charge = v.charge ?? 1; v.odo = v.odo ?? 0; }
  }

  get exists() { return !!this.data; }

  save() {
    if (!this.data) return;
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); }
    catch (e) { console.warn('[economy] save failed', e); }
    this.listeners.forEach((f) => f(this.data));
  }

  onChange(f) { this.listeners.add(f); return () => this.listeners.delete(f); }

  wipe() { try { localStorage.removeItem(KEY); } catch (e) {} this.data = null; }

  /* ---------------- money ---------------- */
  get cash() { return this.data.cash; }
  canAfford(n) { return this.data.cash >= n; }

  earn(n, why = '') {
    n = Math.round(n);
    if (n <= 0) return 0;
    this.data.cash += n;
    this.data.records.earned += n;
    this.save();
    return n;
  }

  spend(n) {
    n = Math.round(n);
    if (this.data.cash < n) return false;
    this.data.cash -= n;
    this.data.records.spent += n;
    this.save();
    return true;
  }

  /* ---------------- parts inventory ---------------- */
  addPart(id, qty = 1, silent = false) {
    if (!getPart(id)) return;
    this.data.ownedParts[id] = (this.data.ownedParts[id] || 0) + qty;
    if (!silent) this.save();
  }

  removePart(id, qty = 1) {
    const have = this.data.ownedParts[id] || 0;
    if (have < qty) return false;
    if (have === qty) delete this.data.ownedParts[id];
    else this.data.ownedParts[id] = have - qty;
    this.save();
    return true;
  }

  ownedCount(id) { return this.data.ownedParts[id] || 0; }

  /** how many of this part are currently bolted to a vehicle */
  fittedCount(id, exceptVehicleId = null) {
    let n = 0;
    for (const v of this.data.garage) {
      if (v.id === exceptVehicleId) continue;
      for (const s of SLOTS) if (v.build[s.id] === id) n++;
    }
    return n;
  }

  /** spare (unfitted) copies available to bolt on */
  spareCount(id, forVehicleId = null) {
    return this.ownedCount(id) - this.fittedCount(id, forVehicleId);
  }

  buyPart(id) {
    const p = getPart(id);
    if (!p) return { ok: false, msg: 'Unknown part.' };
    if (!this.canAfford(p.price)) return { ok: false, msg: 'Not enough cash.' };
    this.spend(p.price);
    this.addPart(id, 1);
    return { ok: true, msg: `Bought ${p.name}.` };
  }

  sellPart(id) {
    const p = getPart(id);
    if (!p) return { ok: false, msg: 'Unknown part.' };
    if (this.spareCount(id) < 1) return { ok: false, msg: 'That part is fitted to a vehicle.' };
    const price = Math.round(p.price * SELL_RATE);
    this.removePart(id, 1);
    this.earn(price);
    return { ok: true, msg: `Sold ${p.name} for $${price.toLocaleString()}.`, price };
  }

  /* ---------------- garage ---------------- */
  get vehicles() { return this.data.garage; }
  get activeVehicle() {
    return this.data.garage.find((v) => v.id === this.data.active) || this.data.garage[0] || null;
  }

  setActive(id) {
    if (this.data.garage.some((v) => v.id === id)) { this.data.active = id; this.save(); }
  }

  addVehicle(name, build, opts = {}) {
    const v = {
      id: uid(), name, build: { ...build }, odo: 0, charge: 1,
      bought: Date.now(), custom: !!opts.custom, preset: opts.preset || null,
    };
    this.data.garage.push(v);
    this.save();
    return v;
  }

  removeVehicle(id) {
    const i = this.data.garage.findIndex((v) => v.id === id);
    if (i < 0) return false;
    if (this.data.garage.length <= 1) return false;
    this.data.garage.splice(i, 1);
    if (this.data.active === id) this.data.active = this.data.garage[0].id;
    this.save();
    return true;
  }

  /** buy a complete vehicle from the dealer (adds every part to inventory too) */
  buyPreset(presetId) {
    const p = PRESET_BY_ID.get(presetId);
    if (!p) return { ok: false, msg: 'Unknown vehicle.' };
    const price = presetPrice(p);
    if (!this.canAfford(price)) return { ok: false, msg: 'Not enough cash.' };
    this.spend(price);
    for (const k of Object.keys(p.parts)) this.addPart(p.parts[k], 1, true);
    const v = this.addVehicle(p.name, p.parts, { preset: p.id });
    return { ok: true, msg: `Bought a ${p.name}.`, vehicle: v };
  }

  /** scrap a whole vehicle back to the dealer */
  sellVehicle(id) {
    const v = this.data.garage.find((x) => x.id === id);
    if (!v) return { ok: false, msg: 'No such vehicle.' };
    if (this.data.garage.length <= 1) return { ok: false, msg: 'You need at least one ride.' };
    const price = Math.round(buildValue(v.build) * SELL_RATE);
    for (const s of SLOTS) if (v.build[s.id]) this.removePart(v.build[s.id], 1);
    this.removeVehicle(id);
    this.earn(price);
    return { ok: true, msg: `Sold ${v.name} for $${price.toLocaleString()}.`, price };
  }

  /** apply a new build to a vehicle, buying any missing parts */
  applyBuild(vehicleId, build) {
    const v = this.data.garage.find((x) => x.id === vehicleId);
    if (!v) return { ok: false, msg: 'No such vehicle.' };
    let cost = 0;
    const toBuy = [];
    for (const s of SLOTS) {
      const id = build[s.id];
      if (!id) continue;
      if (v.build[s.id] === id) continue;
      if (this.spareCount(id, vehicleId) < 1) { const p = getPart(id); cost += p.price; toBuy.push(id); }
    }
    if (cost > 0 && !this.canAfford(cost)) {
      return { ok: false, msg: `Need $${cost.toLocaleString()} for the new parts.`, cost };
    }
    if (cost > 0) { this.spend(cost); for (const id of toBuy) this.addPart(id, 1, true); }
    v.build = { ...build };
    this.save();
    return { ok: true, msg: cost > 0 ? `Fitted. Parts cost $${cost.toLocaleString()}.` : 'Fitted.', cost };
  }

  renameVehicle(id, name) {
    const v = this.data.garage.find((x) => x.id === id);
    if (v) { v.name = name.slice(0, 32) || v.name; this.save(); }
  }

  /* ---------------- marketplace ---------------- */
  /** NPC listings — other "riders" selling built machines */
  refreshMarket(force = false) {
    const d = this.data;
    const now = Date.now();
    if (!force && now - (d.marketRefreshed || 0) < 1000 * 60 * 6) return;
    d.marketRefreshed = now;
    const rng = makeRng('mkt' + Math.floor(now / 60000));
    const sellers = ['bolt_kid', 'AmpereAnnie', 'wheelie_wren', 'Torque_Ted', 'VOLTA_RAT', 'grinderjo',
      'nikko.rides', 'DeckDemon', 'SparkPlug', 'hub_haver', 'cellworks_sam', 'mx_lena'];
    const out = [];
    const n = 6 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const base = PRESETS[Math.floor(rng() * PRESETS.length)];
      const build = { ...base.parts };
      // mutate one or two slots for variety
      const muts = 1 + Math.floor(rng() * 2);
      for (let m = 0; m < muts; m++) {
        const slot = ['motor', 'battery', 'controller', 'tires', 'paint', 'aero', 'cockpit'][Math.floor(rng() * 7)];
        const opts = PARTS.filter((p) => p.slot === slot);
        build[slot] = opts[Math.floor(rng() * opts.length)].id;
      }
      const st = stats(build, { riders: 1 });
      const val = buildValue(build);
      // condition and a haggle factor — broken builds go cheap
      const cond = st.valid ? 0.80 + rng() * 0.45 : 0.36 + rng() * 0.22;
      out.push({
        id: 'm' + uid(6),
        seller: sellers[Math.floor(rng() * sellers.length)],
        name: st.valid ? autoName(build, rng) : base.name + ' (project)',
        build,
        price: Math.max(40, Math.round(val * cond)),
        listedAt: now - Math.floor(rng() * 8e6),
        npc: true,
        broken: !st.valid,
      });
    }
    d.market = out;
    this.save();
  }

  buyListing(listingId) {
    const d = this.data;
    const idx = d.market.findIndex((l) => l.id === listingId);
    if (idx < 0) return { ok: false, msg: 'That listing is gone.' };
    const l = d.market[idx];
    if (!this.canAfford(l.price)) return { ok: false, msg: 'Not enough cash.' };
    this.spend(l.price);
    for (const s of SLOTS) if (l.build[s.id]) this.addPart(l.build[s.id], 1, true);
    const v = this.addVehicle(l.name, l.build, { custom: true });
    d.market.splice(idx, 1);
    this.save();
    return { ok: true, msg: `Bought ${l.name}.`, vehicle: v };
  }

  /** list one of your own vehicles for sale */
  listVehicle(vehicleId, price) {
    const d = this.data;
    const v = d.garage.find((x) => x.id === vehicleId);
    if (!v) return { ok: false, msg: 'No such vehicle.' };
    if (d.garage.length <= 1) return { ok: false, msg: 'You need at least one ride.' };
    const fee = Math.max(5, Math.round(price * LIST_FEE));
    if (!this.canAfford(fee)) return { ok: false, msg: `Listing fee is $${fee}.` };
    this.spend(fee);
    for (const s of SLOTS) if (v.build[s.id]) this.removePart(v.build[s.id], 1);
    this.removeVehicle(vehicleId);
    d.listings.push({
      id: 'l' + uid(6),
      name: v.name, build: v.build, price,
      listedAt: Date.now(),
      value: buildValue(v.build),
      views: 0, offers: [],
    });
    this.save();
    return { ok: true, msg: `Listed ${v.name} for $${price.toLocaleString()} (fee $${fee}).`, fee };
  }

  delistVehicle(listingId) {
    const d = this.data;
    const i = d.listings.findIndex((l) => l.id === listingId);
    if (i < 0) return { ok: false, msg: 'Not listed.' };
    const l = d.listings[i];
    for (const s of SLOTS) if (l.build[s.id]) this.addPart(l.build[s.id], 1, true);
    this.addVehicle(l.name, l.build, { custom: true });
    d.listings.splice(i, 1);
    this.save();
    return { ok: true, msg: `${l.name} is back in the garage.` };
  }

  /** buyers nibble over time; call periodically */
  tickListings(dtSeconds) {
    const d = this.data;
    if (!d.listings.length) return [];
    const sold = [];
    for (let i = d.listings.length - 1; i >= 0; i--) {
      const l = d.listings[i];
      const fair = l.value * 0.82;
      // over-priced listings basically never sell
      const ratio = clamp(fair / Math.max(l.price, 1), 0, 2.2);
      const chancePerSec = 0.0016 * Math.pow(ratio, 3.1);
      l.views += dtSeconds * (0.35 + ratio * 0.9);
      if (Math.random() < chancePerSec * dtSeconds) {
        this.earn(l.price);
        sold.push(l);
        d.listings.splice(i, 1);
      } else if (Math.random() < 0.0009 * dtSeconds * 60 && l.offers.length < 3 && ratio < 1) {
        l.offers.push({ from: pick(['bolt_kid', 'AmpereAnnie', 'Torque_Ted', 'DeckDemon', 'mx_lena']),
                        amount: Math.round(l.price * (0.62 + Math.random() * 0.26)) });
      }
    }
    if (sold.length) this.save();
    return sold;
  }

  acceptOffer(listingId, offerIdx) {
    const l = this.data.listings.find((x) => x.id === listingId);
    if (!l || !l.offers[offerIdx]) return { ok: false, msg: 'Offer expired.' };
    const amt = l.offers[offerIdx].amount;
    this.earn(amt);
    this.data.listings = this.data.listings.filter((x) => x.id !== listingId);
    this.save();
    return { ok: true, msg: `Sold ${l.name} for $${amt.toLocaleString()}.`, amount: amt };
  }

  /* ---------------- records ---------------- */
  record(key, value, mode = 'max') {
    const r = this.data.records;
    if (mode === 'max') { if (value > (r[key] || 0)) { r[key] = value; this.save(); return true; } }
    else { r[key] = (r[key] || 0) + value; }
    return false;
  }
}

export function presetPrice(p) {
  return Math.round(buildValue(p.parts) * 1.12);   // dealer markup
}

export const economy = new Economy();
