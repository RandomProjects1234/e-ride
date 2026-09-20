/* ============================================================
   parts.js — the parts catalogue

   Everything is loosely modelled on real e-bike / e-scooter
   engineering: a frame has a battery bay, a motor mount, a
   structural power limit and a wheel size; a controller has a
   current and voltage window; a pack has a nominal voltage and a
   continuous discharge limit. Build something silly and it tells
   you exactly which way it will break.

   Above the real-world tiers sit the exotic / hyper / nuclear
   parts, which are absurd on purpose.
   ============================================================ */

export const SLOTS = [
  { id: 'frame',      name: 'Frame',       icon: '🔩', req: true },
  { id: 'motor',      name: 'Motor',       icon: '⚙️', req: true },
  { id: 'battery',    name: 'Battery',     icon: '🔋', req: true },
  { id: 'controller', name: 'Controller',  icon: '🎛️', req: true },
  { id: 'tires',      name: 'Tires',       icon: '🛞', req: true },
  { id: 'brakes',     name: 'Brakes',      icon: '🛑', req: true },
  { id: 'suspension', name: 'Suspension',  icon: '🌀', req: false },
  { id: 'cockpit',    name: 'Cockpit',     icon: '🕹️', req: false },
  { id: 'aero',       name: 'Aero',        icon: '💨', req: false },
  { id: 'paint',      name: 'Paint',       icon: '🎨', req: false },
];

export const TIERS = {
  budget:      { name: 'Budget',      order: 0, color: '#9fb0cf' },
  standard:    { name: 'Standard',    order: 1, color: '#16c2ff' },
  performance: { name: 'Performance', order: 2, color: '#39e6a4' },
  exotic:      { name: 'Exotic',      order: 3, color: '#a06bff' },
  hyper:       { name: 'Hyper',       order: 4, color: '#ffb020' },
  nuclear:     { name: 'Nuclear',     order: 5, color: '#ff4d5e' },
};

export const MOUNTS = {
  'hub-rear':    'Rear hub',
  'hub-front':   'Front hub',
  'mid-drive':   'Mid-drive (BB)',
  'hub-scooter': 'Scooter hub',
  'dual-hub':    'Dual hub',
  'direct-shaft':'Direct shaft',
};

/* ============================================================
   FRAMES
   ============================================================ */
const FRAMES = [
  { id: 'f-city', name: 'Soron Commuter C1', brand: 'Soron', tier: 'budget', price: 340, weight: 13.5,
    cls: 'bike', mounts: ['hub-rear', 'hub-front'], maxMotorW: 900, maxVolts: 52, bayWh: 620, wheelSize: 26,
    maxTireW: 55, stiffness: 0.42, maxLoadKg: 120, seats: 1, wheelbase: 1.08, cogH: 0.62, style: 'city',
    desc: 'Aluminium step-through. Sensible, cheap, will not love you back.' },

  { id: 'f-light', name: 'Soron Light BX', brand: 'Soron', tier: 'standard', price: 690, weight: 11.2,
    cls: 'bike', mounts: ['hub-rear', 'hub-front', 'mid-drive'], maxMotorW: 1600, maxVolts: 60, bayWh: 760, wheelSize: 27.5,
    maxTireW: 62, stiffness: 0.58, maxLoadKg: 130, seats: 2, wheelbase: 1.12, cogH: 0.60, style: 'bmx',
    desc: 'The bike everyone starts on. Light, flickable, loves a wheelie.' },

  { id: 'f-ultra', name: 'Soron Ultra BX', brand: 'Soron', tier: 'performance', price: 1650, weight: 15.8,
    cls: 'bike', mounts: ['hub-rear', 'hub-front', 'mid-drive', 'dual-hub'], maxMotorW: 6000, maxVolts: 90, bayWh: 2800, wheelSize: 26,
    maxTireW: 76, stiffness: 0.74, maxLoadKg: 170, seats: 2, wheelbase: 1.20, cogH: 0.58, style: 'moto',
    desc: 'Beefed-up BX with moto dropouts and a proper battery bay.' },

  { id: 'f-fat', name: 'Kestrel Dune FT', brand: 'Kestrel', tier: 'standard', price: 980, weight: 19.4,
    cls: 'bike', mounts: ['hub-rear', 'mid-drive'], maxMotorW: 2200, maxVolts: 60, bayWh: 1150, wheelSize: 26,
    maxTireW: 110, stiffness: 0.62, maxLoadKg: 180, seats: 2, wheelbase: 1.24, cogH: 0.64, style: 'fat',
    desc: 'Fat-tyre cruiser. Eats sand and kerbs, hates going round corners.' },

  { id: 'f-dh', name: 'Kestrel Gravity DH', brand: 'Kestrel', tier: 'performance', price: 2400, weight: 17.1,
    cls: 'bike', mounts: ['mid-drive', 'hub-rear'], maxMotorW: 5000, maxVolts: 84, bayWh: 1400, wheelSize: 29,
    maxTireW: 72, stiffness: 0.86, maxLoadKg: 165, seats: 1, wheelbase: 1.28, cogH: 0.54, style: 'dh',
    desc: 'Downhill chassis. Long, slack, absurdly stable in the air.' },

  { id: 'f-surron', name: 'Halberd HX Moto', brand: 'Halberd', tier: 'exotic', price: 6200, weight: 34.0,
    cls: 'bike', mounts: ['mid-drive', 'dual-hub', 'hub-rear'], maxMotorW: 24000, maxVolts: 144, bayWh: 4200, wheelSize: 19,
    maxTireW: 120, stiffness: 0.93, maxLoadKg: 260, seats: 2, wheelbase: 1.34, cogH: 0.52, style: 'moto',
    desc: 'Chromoly light-moto frame. This is where "e-bike" stops being honest.' },

  { id: 'f-carbon', name: 'Nyx Carbon Spine', brand: 'Nyx Dynamics', tier: 'exotic', price: 11400, weight: 8.9,
    cls: 'bike', mounts: ['mid-drive', 'hub-rear', 'dual-hub'], maxMotorW: 40000, maxVolts: 200, bayWh: 5200, wheelSize: 27.5,
    maxTireW: 80, stiffness: 0.97, maxLoadKg: 210, seats: 2, wheelbase: 1.22, cogH: 0.56, style: 'race',
    desc: 'Monocoque carbon. Nine kilos of frame rated for forty kilowatts.' },

  { id: 'f-exo', name: 'Orbital EXO-9', brand: 'Orbital', tier: 'hyper', price: 48000, weight: 21.0,
    cls: 'bike', mounts: ['dual-hub', 'direct-shaft', 'mid-drive'], maxMotorW: 260000, maxVolts: 900, bayWh: 42000, wheelSize: 24,
    maxTireW: 150, stiffness: 0.99, maxLoadKg: 340, seats: 2, wheelbase: 1.46, cogH: 0.44, style: 'hyper',
    desc: 'Titanium-lattice hyperframe with an active anti-loop mass damper.' },

  { id: 'f-chernov', name: 'Chernov RB-Ω', brand: 'Chernov', tier: 'nuclear', price: 240000, weight: 46.0,
    cls: 'bike', mounts: ['direct-shaft', 'dual-hub'], maxMotorW: 1300000, maxVolts: 3000, bayWh: 1400000, wheelSize: 24,
    maxTireW: 190, stiffness: 1.0, maxLoadKg: 620, seats: 2, wheelbase: 1.62, cogH: 0.40, style: 'nuclear',
    desc: 'Reactor-rated spaceframe. Shielding included. Sanity not included.' },

  /* ---- scooters ---- */
  { id: 'f-g2', name: 'Voltek G2', brand: 'Voltek', tier: 'budget', price: 260, weight: 12.6,
    cls: 'scooter', mounts: ['hub-scooter'], maxMotorW: 700, maxVolts: 42, bayWh: 380, wheelSize: 8.5,
    maxTireW: 60, stiffness: 0.38, maxLoadKg: 100, seats: 1, wheelbase: 0.88, cogH: 0.50, style: 'scoot',
    desc: 'The commuter scooter everybody has. Folds. Rattles. Endearing.' },

  { id: 'f-g5', name: 'Voltek G5 Deck', brand: 'Voltek', tier: 'standard', price: 720, weight: 18.2,
    cls: 'scooter', mounts: ['hub-scooter', 'dual-hub'], maxMotorW: 2400, maxVolts: 60, bayWh: 1080, wheelSize: 10,
    maxTireW: 75, stiffness: 0.58, maxLoadKg: 130, seats: 2, wheelbase: 0.98, cogH: 0.46, style: 'scoot',
    desc: 'Wide deck, twin-stem. First scooter that can carry a mate.' },

  { id: 'f-wolf', name: 'Ampere Wolfpack', brand: 'Ampere Industries', tier: 'performance', price: 2150, weight: 31.5,
    cls: 'scooter', mounts: ['hub-scooter', 'dual-hub'], maxMotorW: 7000, maxVolts: 84, bayWh: 2600, wheelSize: 11,
    maxTireW: 95, stiffness: 0.80, maxLoadKg: 170, seats: 2, wheelbase: 1.10, cogH: 0.44, style: 'scoot-perf',
    desc: 'Dual-motor performance scooter. Genuinely faster than it should be.' },

  { id: 'f-titan', name: 'Ampere Titan X', brand: 'Ampere Industries', tier: 'exotic', price: 9800, weight: 52.0,
    cls: 'scooter', mounts: ['dual-hub', 'direct-shaft'], maxMotorW: 32000, maxVolts: 160, bayWh: 7200, wheelSize: 12,
    maxTireW: 130, stiffness: 0.92, maxLoadKg: 240, seats: 2, wheelbase: 1.22, cogH: 0.40, style: 'scoot-perf',
    desc: 'Fifty-two kilos of scooter. Hydraulic everything. Terrifying.' },

  { id: 'f-void', name: 'Orbital Void Deck', brand: 'Orbital', tier: 'hyper', price: 62000, weight: 38.0,
    cls: 'scooter', mounts: ['direct-shaft', 'dual-hub'], maxMotorW: 260000, maxVolts: 900, bayWh: 90000, wheelSize: 12,
    maxTireW: 170, stiffness: 0.99, maxLoadKg: 300, seats: 2, wheelbase: 1.34, cogH: 0.34, style: 'hyper',
    desc: 'A scooter deck with a land-speed-record chassis bolted under it.' },
];

/* ============================================================
   MOTORS
   ============================================================ */
const MOTORS = [
  { id: 'm-250', name: 'Soron 250 Hub', brand: 'Soron', tier: 'budget', price: 120, weight: 2.9,
    mount: 'hub-rear', powerW: 250, peakW: 400, voltMin: 24, voltMax: 42, ampsMax: 14, torqueNm: 32,
    rpmMax: 320, eff: 0.78, desc: 'Legal-class hub motor. Gets you up a hill. Slowly.' },

  { id: 'm-350s', name: 'Voltek 350 Scoot', brand: 'Voltek', tier: 'budget', price: 140, weight: 2.4,
    mount: 'hub-scooter', powerW: 350, peakW: 600, voltMin: 30, voltMax: 42, ampsMax: 18, torqueNm: 14,
    rpmMax: 1450, eff: 0.79, desc: 'The little front-wheel hub in every commuter scooter.' },

  { id: 'm-500', name: 'Soron 500 Hub', brand: 'Soron', tier: 'standard', price: 260, weight: 3.6,
    mount: 'hub-rear', powerW: 500, peakW: 850, voltMin: 36, voltMax: 52, ampsMax: 22, torqueNm: 48,
    rpmMax: 340, eff: 0.81, desc: 'The sensible upgrade. Torquey enough to loft the front on gravel.' },

  { id: 'm-750g', name: 'Kestrel 750 Geared', brand: 'Kestrel', tier: 'standard', price: 420, weight: 3.2,
    mount: 'hub-rear', powerW: 750, peakW: 1300, voltMin: 36, voltMax: 60, ampsMax: 28, torqueNm: 82,
    rpmMax: 385, eff: 0.83, desc: 'Planetary-geared hub: huge low-speed torque, modest top end.' },

  { id: 'm-1000s', name: 'Voltek 1000 Scoot', brand: 'Voltek', tier: 'standard', price: 380, weight: 4.1,
    mount: 'hub-scooter', powerW: 1000, peakW: 1700, voltMin: 42, voltMax: 60, ampsMax: 34, torqueNm: 34,
    rpmMax: 1700, eff: 0.83, desc: 'Fat scooter hub. Pulls the front wheel off the deck if you lean back.' },

  { id: 'm-1500', name: 'Kestrel 1500 DD', brand: 'Kestrel', tier: 'performance', price: 640, weight: 6.4,
    mount: 'hub-rear', powerW: 1500, peakW: 2600, voltMin: 48, voltMax: 72, ampsMax: 45, torqueNm: 74,
    rpmMax: 420, eff: 0.86, desc: 'Direct-drive hub. Silent, heavy, happy at speed.' },

  { id: 'm-mid3k', name: 'Halberd M3 Mid', brand: 'Halberd', tier: 'performance', price: 1450, weight: 6.9,
    mount: 'mid-drive', powerW: 3000, peakW: 5200, voltMin: 48, voltMax: 84, ampsMax: 72, torqueNm: 128,
    rpmMax: 4800, gear: 5.4, eff: 0.89, desc: 'Mid-drive through the gearbox. Torque multiplication is a drug.' },

  { id: 'm-dual2k', name: 'Ampere Twin 2K', brand: 'Ampere Industries', tier: 'performance', price: 1280, weight: 8.8,
    mount: 'dual-hub', powerW: 2400, peakW: 4400, voltMin: 52, voltMax: 84, ampsMax: 68, torqueNm: 96,
    rpmMax: 1500, eff: 0.85, desc: 'Two hubs, one throttle. Traction for days.' },

  { id: 'm-surron', name: 'Halberd HX8 Mid', brand: 'Halberd', tier: 'exotic', price: 3900, weight: 11.2,
    mount: 'mid-drive', powerW: 8000, peakW: 14000, voltMin: 60, voltMax: 144, ampsMax: 180, torqueNm: 240,
    rpmMax: 7600, gear: 6.2, eff: 0.91, desc: 'Light-moto motor. Eight kilowatts of "please hold on".' },

  { id: 'm-dual8k', name: 'Ampere Twin 8K', brand: 'Ampere Industries', tier: 'exotic', price: 4700, weight: 15.6,
    mount: 'dual-hub', powerW: 8000, peakW: 15000, voltMin: 72, voltMax: 160, ampsMax: 190, torqueNm: 210,
    rpmMax: 2400, eff: 0.88, desc: 'Twin high-voltage hubs. Launches like a catapult.' },

  { id: 'm-nyx20', name: 'Nyx Axial 20', brand: 'Nyx Dynamics', tier: 'exotic', price: 14500, weight: 13.4,
    mount: 'mid-drive', powerW: 20000, peakW: 34000, voltMin: 96, voltMax: 200, ampsMax: 300, torqueNm: 310,
    rpmMax: 11000, gear: 5.8, eff: 0.94, desc: 'Axial-flux pancake motor. Power density that borders on rude.' },

  { id: 'm-shaft60', name: 'Orbital Shaft 60', brand: 'Orbital', tier: 'hyper', price: 42000, weight: 24.0,
    mount: 'direct-shaft', powerW: 60000, peakW: 96000, voltMin: 300, voltMax: 800, ampsMax: 340, torqueNm: 520,
    rpmMax: 16000, gear: 3.4, eff: 0.95, desc: 'Sixty kilowatts through a sealed shaft drive. Aircraft parts.' },

  { id: 'm-shaft150', name: 'Orbital Shaft 150', brand: 'Orbital', tier: 'hyper', price: 128000, weight: 37.0,
    mount: 'direct-shaft', powerW: 150000, peakW: 240000, voltMin: 400, voltMax: 900, ampsMax: 620, torqueNm: 880,
    rpmMax: 21000, gear: 3.0, eff: 0.96, desc: 'Land-speed-record hardware. Requires aero. Requires courage.' },

  { id: 'm-super', name: 'Orbital SUPER-300', brand: 'Orbital', tier: 'hyper', price: 265000, weight: 52.0,
    mount: 'direct-shaft', powerW: 300000, peakW: 430000, voltMin: 600, voltMax: 1600, ampsMax: 760, torqueNm: 1350,
    rpmMax: 26000, gear: 2.7, eff: 0.96, desc: '300 kW. Three hundred. In a thing with handlebars.' },

  { id: 'm-nuke', name: 'Chernov RD-600 "Nuclear"', brand: 'Chernov', tier: 'nuclear', price: 520000, weight: 88.0,
    mount: 'direct-shaft', powerW: 600000, peakW: 820000, voltMin: 1200, voltMax: 3000, ampsMax: 1100, torqueNm: 2400,
    rpmMax: 34000, gear: 2.4, eff: 0.97, desc: 'Reactor-fed superconducting drive. 300 mph is a design target, not a joke.' },

  { id: 'm-nuke2', name: 'Chernov RD-900 "Meltdown"', brand: 'Chernov', tier: 'nuclear', price: 980000, weight: 124.0,
    mount: 'direct-shaft', powerW: 900000, peakW: 1250000, voltMin: 1600, voltMax: 3000, ampsMax: 1500, torqueNm: 3600,
    rpmMax: 41000, gear: 2.2, eff: 0.97, desc: 'Nine hundred kilowatts. The frame is the safety system. There is no safety system.' },
];

/* ============================================================
   BATTERIES
   ============================================================ */
const BATTERIES = [
  { id: 'b-36-8', name: 'Soron 36V 8Ah', brand: 'Soron', tier: 'budget', price: 150, weight: 2.6,
    volts: 36, ah: 8, maxA: 20, chem: 'Li-ion 18650', cycles: 500, desc: 'Downtube pack. Honest little thing.' },
  { id: 'b-36-13', name: 'Soron 36V 13Ah', brand: 'Soron', tier: 'budget', price: 230, weight: 3.6,
    volts: 36, ah: 13, maxA: 26, chem: 'Li-ion 18650', cycles: 600, desc: 'More range, same modest punch.' },
  { id: 'b-42-8', name: 'Voltek 36V 7.8Ah Scoot', brand: 'Voltek', tier: 'budget', price: 135, weight: 2.3,
    volts: 36, ah: 7.8, maxA: 22, chem: 'Li-ion 18650', cycles: 450, desc: 'In-deck scooter pack. Slim by necessity.' },
  { id: 'b-48-14', name: 'Kestrel 48V 14Ah', brand: 'Kestrel', tier: 'standard', price: 390, weight: 4.4,
    volts: 48, ah: 14, maxA: 40, chem: 'Li-ion 21700', cycles: 800, desc: '21700 cells. The sweet spot for most builds.' },
  { id: 'b-52-18', name: 'Kestrel 52V 17.5Ah', brand: 'Kestrel', tier: 'standard', price: 520, weight: 5.4,
    volts: 52, ah: 17.5, maxA: 50, chem: 'Li-ion 21700', cycles: 800, desc: 'The classic 52V long-range pack.' },
  { id: 'b-60-24', name: 'Ampere 60V 24Ah', brand: 'Ampere Industries', tier: 'performance', price: 880, weight: 8.9,
    volts: 60, ah: 24, maxA: 80, chem: 'Li-ion 21700', cycles: 900, desc: 'Fat 60V brick. Serious current on tap.' },
  { id: 'b-72-32', name: 'Ampere 72V 32Ah', brand: 'Ampere Industries', tier: 'performance', price: 1450, weight: 14.2,
    volts: 72, ah: 32, maxA: 120, chem: 'Li-ion 21700', cycles: 900, desc: '2.3 kWh. Heavy, but it will not sag on you.' },
  { id: 'b-84-30', name: 'Halberd 84V 30Ah LiPo', brand: 'Halberd', tier: 'performance', price: 2100, weight: 12.8,
    volts: 84, ah: 30, maxA: 260, chem: 'LiPo 20C', cycles: 300, desc: 'LiPo. Enormous current, short life, mild fire risk.' },
  { id: 'b-144-40', name: 'Nyx 144V 40Ah', brand: 'Nyx Dynamics', tier: 'exotic', price: 8400, weight: 31.0,
    volts: 144, ah: 40, maxA: 400, chem: 'Solid-state', cycles: 2500, desc: 'Solid-state. Light for the energy, and it does not care about heat.' },
  { id: 'b-200-60', name: 'Nyx 200V 60Ah', brand: 'Nyx Dynamics', tier: 'exotic', price: 19500, weight: 52.0,
    volts: 200, ah: 60, maxA: 620, chem: 'Solid-state', cycles: 2500, desc: '12 kWh in a battery bay. Do check your frame rating.' },
  { id: 'b-800-45', name: 'Orbital HV800', brand: 'Orbital', tier: 'hyper', price: 74000, weight: 86.0,
    volts: 800, ah: 45, maxA: 900, chem: 'Graphene HV', cycles: 1400, desc: '800 volts. Rubber gloves are part of the kit.' },
  { id: 'b-900-90', name: 'Orbital HV900-XL', brand: 'Orbital', tier: 'hyper', price: 156000, weight: 158.0,
    volts: 900, ah: 90, maxA: 1400, chem: 'Graphene HV', cycles: 1400, desc: '81 kWh. Weighs more than you. Range for days at 250 mph.' },
  { id: 'b-rtg', name: 'Chernov RTG Cell', brand: 'Chernov', tier: 'nuclear', price: 420000, weight: 190.0,
    volts: 2400, ah: 160, maxA: 2000, chem: 'Radioisotope', cycles: 99999, desc: 'A radioisotope thermoelectric core. It never needs charging. It also never stops being warm.' },
  { id: 'b-fusion', name: 'Chernov Pocket Tokamak', brand: 'Chernov', tier: 'nuclear', price: 890000, weight: 240.0,
    volts: 3000, ah: 400, maxA: 3200, chem: 'Aneutronic fusion', cycles: 99999, desc: 'A fusion reactor where the water bottle goes. 1.2 MWh. Officially "not a weapon".' },
];
for (const b of BATTERIES) b.wh = Math.round(b.volts * b.ah);

/* ============================================================
   CONTROLLERS
   ============================================================ */
const CONTROLLERS = [
  { id: 'c-15', name: 'Soron 15A Basic', brand: 'Soron', tier: 'budget', price: 60, weight: 0.7,
    maxAmps: 15, voltMin: 24, voltMax: 48, eff: 0.88, ramp: 0.55, desc: 'Square-wave controller. Cheap, jerky, fine.' },
  { id: 'c-25', name: 'Voltek 25A Sine', brand: 'Voltek', tier: 'budget', price: 110, weight: 0.9,
    maxAmps: 25, voltMin: 30, voltMax: 60, eff: 0.90, ramp: 0.7, desc: 'Sine-wave. Smoother, quieter, kinder to the motor.' },
  { id: 'c-45', name: 'Kestrel 45A FOC', brand: 'Kestrel', tier: 'standard', price: 240, weight: 1.3,
    maxAmps: 45, voltMin: 36, voltMax: 72, eff: 0.93, ramp: 0.82, desc: 'Field-oriented control. Where throttle response gets good.' },
  { id: 'c-80', name: 'Halberd 80A FOC', brand: 'Halberd', tier: 'performance', price: 520, weight: 2.1,
    maxAmps: 80, voltMin: 48, voltMax: 100, eff: 0.94, ramp: 0.9, desc: 'Proper phase current. Anti-spark, regen, the lot.' },
  { id: 'c-200', name: 'Halberd 200A Race', brand: 'Halberd', tier: 'performance', price: 1250, weight: 3.4,
    maxAmps: 200, voltMin: 60, voltMax: 150, eff: 0.95, ramp: 0.95, desc: 'Race controller with a liquid-cooled cold plate.' },
  { id: 'c-400', name: 'Nyx VCU-400', brand: 'Nyx Dynamics', tier: 'exotic', price: 5600, weight: 5.2,
    maxAmps: 400, voltMin: 96, voltMax: 220, eff: 0.96, ramp: 0.97, desc: 'Vehicle control unit with traction and wheelie assist.' },
  { id: 'c-900', name: 'Orbital SiC-900', brand: 'Orbital', tier: 'hyper', price: 34000, weight: 11.0,
    maxAmps: 900, voltMin: 300, voltMax: 1000, eff: 0.975, ramp: 0.99, desc: 'Silicon-carbide inverter. Barely warms up at 700 amps.' },
  { id: 'c-1600', name: 'Orbital SiC-1600', brand: 'Orbital', tier: 'hyper', price: 78000, weight: 18.0,
    maxAmps: 1600, voltMin: 400, voltMax: 1600, eff: 0.98, ramp: 0.99, desc: 'The inverter from the record bike. Absurd headroom.' },
  { id: 'c-omega', name: 'Chernov Ω-Drive', brand: 'Chernov', tier: 'nuclear', price: 310000, weight: 34.0,
    maxAmps: 3400, voltMin: 1000, voltMax: 3000, eff: 0.985, ramp: 1.0, desc: 'Superconducting switchgear. Has its own coolant loop and its own opinions.' },
];

/* ============================================================
   TIRES
   ============================================================ */
const TIRES = [
  { id: 't-city26', name: 'Soron City 26×1.95', brand: 'Soron', tier: 'budget', price: 48, weight: 1.6,
    size: 26, width: 50, grip: 0.82, roll: 0.010, speedMph: 40, desc: 'Slick commuter rubber. Fine until it is wet.' },
  { id: 't-knob26', name: 'Kestrel Knobby 26×2.4', brand: 'Kestrel', tier: 'budget', price: 72, weight: 2.2,
    size: 26, width: 61, grip: 0.90, roll: 0.018, speedMph: 45, desc: 'Off-road knobbly. Loud on tarmac, hooks up on dirt.' },
  { id: 't-street275', name: 'Soron Street 27.5×2.3', brand: 'Soron', tier: 'standard', price: 96, weight: 1.9,
    size: 27.5, width: 58, grip: 0.94, roll: 0.009, speedMph: 62, desc: 'Sticky street compound. The default good choice.' },
  { id: 't-dh29', name: 'Kestrel DH 29×2.5', brand: 'Kestrel', tier: 'standard', price: 140, weight: 2.7,
    size: 29, width: 64, grip: 0.98, roll: 0.016, speedMph: 58, desc: 'Dual-ply downhill casing. Nearly unpuncturable.' },
  { id: 't-fat26', name: 'Kestrel Dune 26×4.0', brand: 'Kestrel', tier: 'standard', price: 165, weight: 4.1,
    size: 26, width: 102, grip: 1.02, roll: 0.026, speedMph: 40, desc: 'Four-inch balloon. Floats over sand, drags everywhere else.' },
  { id: 't-scoot85', name: 'Voltek 8.5" Solid', brand: 'Voltek', tier: 'budget', price: 34, weight: 0.9,
    size: 8.5, width: 50, grip: 0.74, roll: 0.017, speedMph: 28, desc: 'Solid honeycomb. Never punctures, never comfortable.' },
  { id: 't-scoot10', name: 'Voltek 10" Pneumatic', brand: 'Voltek', tier: 'standard', price: 58, weight: 1.1,
    size: 10, width: 66, grip: 0.88, roll: 0.011, speedMph: 45, desc: 'Tubeless pneumatic. Night-and-day over solids.' },
  { id: 't-scoot11', name: 'Ampere 11" Street', brand: 'Ampere Industries', tier: 'performance', price: 110, weight: 1.6,
    size: 11, width: 90, grip: 0.99, roll: 0.010, speedMph: 72, desc: 'Wide 11-inch performance scooter tyre.' },
  { id: 't-moto19', name: 'Halberd Moto 19×2.75', brand: 'Halberd', tier: 'performance', price: 190, weight: 5.2,
    size: 19, width: 108, grip: 1.08, roll: 0.013, speedMph: 95, desc: 'Real motorcycle rubber on a light-moto rim.' },
  { id: 't-slick275', name: 'Nyx Race Slick 27.5', brand: 'Nyx Dynamics', tier: 'exotic', price: 580, weight: 2.9,
    size: 27.5, width: 76, grip: 1.20, roll: 0.008, speedMph: 155, desc: 'Full slick on a 27.5" rim. Race compound, zero tread, zero mercy in the wet.' },
  { id: 't-slick24', name: 'Nyx Race Slick 24', brand: 'Nyx Dynamics', tier: 'exotic', price: 620, weight: 3.4,
    size: 24, width: 120, grip: 1.22, roll: 0.008, speedMph: 165, desc: 'Racing slick, warmers recommended, zero wet grip.' },
  { id: 't-slick12', name: 'Nyx Race Slick 12', brand: 'Nyx Dynamics', tier: 'exotic', price: 540, weight: 2.4,
    size: 12, width: 118, grip: 1.18, roll: 0.008, speedMph: 158, desc: 'The 12-inch slick from the scooter race series.' },
  { id: 't-ln24', name: 'Orbital Landspeed 24', brand: 'Orbital', tier: 'hyper', price: 4800, weight: 6.8,
    size: 24, width: 145, grip: 1.16, roll: 0.006, speedMph: 268, desc: 'Kevlar-belted land-speed casing. Rated to 268 mph and not a mile more.' },
  { id: 't-ln12', name: 'Orbital Landspeed 12', brand: 'Orbital', tier: 'hyper', price: 4400, weight: 5.4,
    size: 12, width: 140, grip: 1.12, roll: 0.006, speedMph: 260, desc: 'The small-wheel land-speed tyre. Spins to 90,000 rpm.' },
  { id: 't-plasma', name: 'Chernov Plasma-Bonded', brand: 'Chernov', tier: 'nuclear', price: 96000, weight: 9.2,
    size: 24, width: 185, grip: 1.45, roll: 0.004, speedMph: 306, desc: 'Ceramic-matrix tyre with an electrostatic contact patch. 306 mph rating — the highest anyone has certified.' },
  { id: 't-plasma12', name: 'Chernov Plasma-Bonded 12', brand: 'Chernov', tier: 'nuclear', price: 92000, weight: 8.1,
    size: 12, width: 168, grip: 1.40, roll: 0.004, speedMph: 298, desc: 'Same witchcraft, scooter sized.' },
];

/* ============================================================
   BRAKES
   ============================================================ */
const BRAKES = [
  { id: 'br-rim', name: 'Soron V-Brake', brand: 'Soron', tier: 'budget', price: 28, weight: 0.5,
    force: 4.2, fade: 0.55, desc: 'Rim brakes. Technically a deceleration device.' },
  { id: 'br-mech', name: 'Soron Mech Disc 160', brand: 'Soron', tier: 'budget', price: 65, weight: 0.9,
    force: 6.0, fade: 0.68, desc: 'Cable discs. Predictable, unexciting.' },
  { id: 'br-hyd', name: 'Kestrel Hydraulic 180', brand: 'Kestrel', tier: 'standard', price: 180, weight: 1.2,
    force: 8.4, fade: 0.82, desc: 'Two-piston hydraulics. The first brake worth having.' },
  { id: 'br-4pot', name: 'Halberd 4-Pot 220', brand: 'Halberd', tier: 'performance', price: 420, weight: 1.9,
    force: 11.5, fade: 0.9, desc: 'Four-piston, 220 mm rotors. Will stop a light moto.' },
  { id: 'br-race', name: 'Nyx Carbon-Ceramic', brand: 'Nyx Dynamics', tier: 'exotic', price: 3200, weight: 2.4,
    force: 15.0, fade: 0.97, desc: 'Carbon-ceramic discs that like being red hot.' },
  { id: 'br-mag', name: 'Orbital Magnetorheological', brand: 'Orbital', tier: 'hyper', price: 26000, weight: 7.5,
    force: 21.0, fade: 0.995, desc: 'MR-fluid brakes with regenerative blending. No fade. Ever.' },
  { id: 'br-inertial', name: 'Chernov Inertial Damper', brand: 'Chernov', tier: 'nuclear', price: 180000, weight: 22.0,
    force: 34.0, fade: 1.0, desc: 'Reacts against the planet. Stopping from 300 mph is the easy part.' },
];

/* ============================================================
   SUSPENSION
   ============================================================ */
const SUSPENSION = [
  { id: 's-rigid', name: 'Rigid Fork', brand: 'Soron', tier: 'budget', price: 0, weight: 1.2,
    travel: 0, damp: 0.1, fits: ['bike', 'scooter'], desc: 'No suspension. Every kerb is information.' },
  { id: 's-coil', name: 'Soron Coil 80', brand: 'Soron', tier: 'budget', price: 90, weight: 2.8,
    travel: 80, damp: 0.35, fits: ['bike'], desc: 'Coil-sprung fork. Bouncy, but better than nothing.' },
  { id: 's-scoot', name: 'Voltek Scoot Spring', brand: 'Voltek', tier: 'budget', price: 70, weight: 1.4,
    travel: 55, damp: 0.30, fits: ['scooter'], desc: 'Rubber-and-spring scooter suspension. Takes the edge off.' },
  { id: 's-air', name: 'Kestrel Air 140', brand: 'Kestrel', tier: 'standard', price: 380, weight: 2.1,
    travel: 140, damp: 0.66, fits: ['bike'], desc: 'Air fork with a real damper. Landings stop hurting.' },
  { id: 's-dual', name: 'Ampere Dual Hydraulic', brand: 'Ampere Industries', tier: 'performance', price: 540, weight: 4.2,
    travel: 120, damp: 0.74, fits: ['scooter'], desc: 'Hydraulic front and rear on a scooter. Rare and wonderful.' },
  { id: 's-dh', name: 'Halberd DH Triple', brand: 'Halberd', tier: 'performance', price: 1250, weight: 4.8,
    travel: 200, damp: 0.88, fits: ['bike'], desc: 'Triple-clamp downhill fork. Land anything.' },
  { id: 's-active', name: 'Nyx Active Damper', brand: 'Nyx Dynamics', tier: 'exotic', price: 9800, weight: 6.4,
    travel: 180, damp: 0.96, fits: ['bike', 'scooter'], desc: 'Electronically controlled. Reads the road 500 times a second.' },
  { id: 's-mag', name: 'Orbital Maglev Float', brand: 'Orbital', tier: 'hyper', price: 58000, weight: 14.0,
    travel: 260, damp: 1.0, fits: ['bike', 'scooter'], desc: 'Magnetically levitated axles. The wheels move; you do not.' },
];

/* ============================================================
   COCKPIT (bars / stem / seat)
   ============================================================ */
const COCKPIT = [
  { id: 'k-stock', name: 'Stock Bars', brand: 'Soron', tier: 'budget', price: 0, weight: 0.9,
    wheelie: 1.0, control: 1.0, fits: ['bike', 'scooter'], desc: 'Whatever came in the box.' },
  { id: 'k-riser', name: 'Kestrel Riser Bars', brand: 'Kestrel', tier: 'budget', price: 60, weight: 1.1,
    wheelie: 1.16, control: 1.05, fits: ['bike'], desc: 'Tall risers. Easier to loft, easier to hold.' },
  { id: 'k-moto', name: 'Halberd Moto Bar + Fatbar', brand: 'Halberd', tier: 'standard', price: 180, weight: 1.4,
    wheelie: 1.24, control: 1.12, fits: ['bike'], desc: 'Motocross bend with a crossbar. Leverage for days.' },
  { id: 'k-scoot', name: 'Voltek Wide Stem', brand: 'Voltek', tier: 'standard', price: 120, weight: 1.2,
    wheelie: 1.14, control: 1.10, fits: ['scooter'], desc: 'Wide, rigid scooter stem. Kills the wobble.' },
  { id: 'k-carbon', name: 'Nyx Carbon Cockpit', brand: 'Nyx Dynamics', tier: 'exotic', price: 1900, weight: 0.5,
    wheelie: 1.3, control: 1.24, fits: ['bike', 'scooter'], desc: 'Half a kilo. Telepathic steering.' },
  { id: 'k-gyro', name: 'Orbital Gyro-Assist Bars', brand: 'Orbital', tier: 'hyper', price: 31000, weight: 5.0,
    wheelie: 1.55, control: 1.45, fits: ['bike', 'scooter'], desc: 'Control-moment gyros in the bar ends. Balances the wheelie for you.' },
  { id: 'k-neural', name: 'Chernov Neural Link Grips', brand: 'Chernov', tier: 'nuclear', price: 145000, weight: 1.8,
    wheelie: 1.9, control: 1.7, fits: ['bike', 'scooter'], desc: 'Reads your intent 200 ms before you have it.' },
];

/* ============================================================
   AERO
   ============================================================ */
const AERO = [
  { id: 'a-none', name: 'No Fairing', brand: '—', tier: 'budget', price: 0, weight: 0,
    cdMul: 1.0, fits: ['bike', 'scooter'], desc: 'Upright and proud. A barn door at 60 mph.' },
  { id: 'a-visor', name: 'Soron Wind Visor', brand: 'Soron', tier: 'budget', price: 85, weight: 1.1,
    cdMul: 0.93, fits: ['bike', 'scooter'], desc: 'A small screen. Helps more than it looks like it should.' },
  { id: 'a-half', name: 'Kestrel Half Fairing', brand: 'Kestrel', tier: 'standard', price: 460, weight: 3.2,
    cdMul: 0.78, fits: ['bike', 'scooter'], desc: 'Nose fairing and belly pan. Noticeably quicker on the flat.' },
  { id: 'a-full', name: 'Halberd Full Fairing', brand: 'Halberd', tier: 'performance', price: 2400, weight: 7.5,
    cdMul: 0.56, fits: ['bike', 'scooter'], desc: 'Full dustbin fairing. Terrible in crosswinds, fast in a straight line.' },
  { id: 'a-tail', name: 'Nyx Streamliner Tail', brand: 'Nyx Dynamics', tier: 'exotic', price: 14000, weight: 12.0,
    cdMul: 0.34, fits: ['bike', 'scooter'], desc: 'Teardrop tail section. The shape matters more than the nose.' },
  { id: 'a-shell', name: 'Orbital Streamliner Shell', brand: 'Orbital', tier: 'hyper', price: 66000, weight: 26.0,
    cdMul: 0.19, fits: ['bike', 'scooter'], desc: 'Full enclosed streamliner. This is how you get to 300 mph.' },
  { id: 'a-plasma', name: 'Chernov Plasma Sheath', brand: 'Chernov', tier: 'nuclear', price: 390000, weight: 44.0,
    cdMul: 0.09, fits: ['bike', 'scooter'], desc: 'Ionises the boundary layer. Drag becomes a rounding error.' },
];

/* ============================================================
   PAINT (cosmetic)
   ============================================================ */
const PAINT = [
  { id: 'p-black',  name: 'Satin Black',     tier: 'budget', price: 0,    weight: 0, color: 0x1c1f26, metal: 0.25, rough: 0.55 },
  { id: 'p-white',  name: 'Arctic White',    tier: 'budget', price: 40,   weight: 0, color: 0xe8ecef, metal: 0.1,  rough: 0.45 },
  { id: 'p-red',    name: 'Signal Red',      tier: 'budget', price: 60,   weight: 0, color: 0xd6273a, metal: 0.2,  rough: 0.4 },
  { id: 'p-volt',   name: 'Volt Green',      tier: 'standard', price: 140,weight: 0, color: 0x39e6a4, metal: 0.3,  rough: 0.32 },
  { id: 'p-cyan',   name: 'Bay Cyan',        tier: 'standard', price: 140,weight: 0, color: 0x16c2ff, metal: 0.3,  rough: 0.32 },
  { id: 'p-violet', name: 'Ultraviolet',     tier: 'standard', price: 180,weight: 0, color: 0xa06bff, metal: 0.35, rough: 0.3 },
  { id: 'p-orange', name: 'Hazard Orange',   tier: 'standard', price: 160,weight: 0, color: 0xff7a1a, metal: 0.25, rough: 0.35 },
  { id: 'p-gold',   name: 'Brushed Gold',    tier: 'performance', price: 900, weight: 0, color: 0xd6a63c, metal: 0.92, rough: 0.28 },
  { id: 'p-chrome', name: 'Liquid Chrome',   tier: 'exotic', price: 3400, weight: 0, color: 0xdfe6ef, metal: 1.0,  rough: 0.06 },
  { id: 'p-carbon', name: 'Raw Carbon',      tier: 'exotic', price: 2600, weight: 0, color: 0x23262c, metal: 0.55, rough: 0.22 },
  { id: 'p-oil',    name: 'Oil Slick',       tier: 'exotic', price: 5200, weight: 0, color: 0x6a4fd6, metal: 0.95, rough: 0.1, iridescent: true },
  { id: 'p-nuclear',name: 'Cherenkov Blue',  tier: 'nuclear', price: 42000, weight: 0, color: 0x4fd6ff, metal: 0.7, rough: 0.12, glow: 0.7 },
  { id: 'p-molten', name: 'Molten Core',     tier: 'nuclear', price: 58000, weight: 0, color: 0xff5a1a, metal: 0.6, rough: 0.2, glow: 0.9 },
];

/* ============================================================
   assemble
   ============================================================ */
function tag(list, slot) { return list.map((p) => ({ ...p, slot })); }

export const PARTS = [
  ...tag(FRAMES, 'frame'),
  ...tag(MOTORS, 'motor'),
  ...tag(BATTERIES, 'battery'),
  ...tag(CONTROLLERS, 'controller'),
  ...tag(TIRES, 'tires'),
  ...tag(BRAKES, 'brakes'),
  ...tag(SUSPENSION, 'suspension'),
  ...tag(COCKPIT, 'cockpit'),
  ...tag(AERO, 'aero'),
  ...tag(PAINT, 'paint'),
];

export const PART_BY_ID = new Map(PARTS.map((p) => [p.id, p]));
export const partsInSlot = (slot) => PARTS.filter((p) => p.slot === slot);
export const getPart = (id) => PART_BY_ID.get(id) || null;

/* ============================================================
   PRESET VEHICLES — the three starters plus dealer stock
   ============================================================ */
export const PRESETS = [
  {
    id: 'v-light', name: 'Soron Light BX', cls: 'bike', starter: true,
    blurb: 'Nimble, light and the easiest thing in the world to wheelie. Slow, but forgiving.',
    parts: { frame: 'f-light', motor: 'm-750g', battery: 'b-52-18', controller: 'c-45',
             tires: 't-street275', brakes: 'br-mech', suspension: 's-coil', cockpit: 'k-riser', aero: 'a-none', paint: 'p-volt' },
  },
  {
    id: 'v-ultra', name: 'Soron Ultra BX', cls: 'bike', starter: true,
    blurb: 'Heavier and far punchier. Harder to loft, much harder to catch out at speed.',
    parts: { frame: 'f-ultra', motor: 'm-mid3k', battery: 'b-84-30', controller: 'c-80',
             tires: 't-knob26', brakes: 'br-hyd', suspension: 's-air', cockpit: 'k-moto', aero: 'a-none', paint: 'p-black' },
  },
  {
    id: 'v-g2', name: 'Voltek G2', cls: 'scooter', starter: true,
    blurb: 'A humble commuter scooter. Cheap to run, surprisingly good in traffic, wheelies badly.',
    parts: { frame: 'f-g2', motor: 'm-350s', battery: 'b-42-8', controller: 'c-25',
             tires: 't-scoot85', brakes: 'br-rim', suspension: 's-scoot', cockpit: 'k-stock', aero: 'a-none', paint: 'p-white' },
  },

  /* dealer stock — bought whole from VoltMart */
  {
    id: 'v-dune', name: 'Kestrel Dune FT', cls: 'bike',
    blurb: 'Fat-tyre cruiser. Rides the beach and the dirt jumps without complaining.',
    parts: { frame: 'f-fat', motor: 'm-750g', battery: 'b-52-18', controller: 'c-45',
             tires: 't-fat26', brakes: 'br-hyd', suspension: 's-coil', cockpit: 'k-riser', aero: 'a-none', paint: 'p-orange' },
  },
  {
    id: 'v-g5', name: 'Voltek G5 Deck', cls: 'scooter',
    blurb: 'Two-up scooter with a real pneumatic tyre. The first scooter worth owning.',
    parts: { frame: 'f-g5', motor: 'm-1000s', battery: 'b-48-14', controller: 'c-45',
             tires: 't-scoot10', brakes: 'br-mech', suspension: 's-scoot', cockpit: 'k-scoot', aero: 'a-none', paint: 'p-cyan' },
  },
  {
    id: 'v-gravity', name: 'Kestrel Gravity DH', cls: 'bike',
    blurb: 'Downhill chassis with a mid-drive. Built for the bowl and the ridge.',
    parts: { frame: 'f-dh', motor: 'm-mid3k', battery: 'b-60-24', controller: 'c-80',
             tires: 't-dh29', brakes: 'br-4pot', suspension: 's-dh', cockpit: 'k-moto', aero: 'a-none', paint: 'p-red' },
  },
  {
    id: 'v-wolf', name: 'Ampere Wolfpack', cls: 'scooter',
    blurb: 'Dual-motor performance scooter. Launches harder than most motorbikes.',
    parts: { frame: 'f-wolf', motor: 'm-dual2k', battery: 'b-72-32', controller: 'c-80',
             tires: 't-scoot11', brakes: 'br-4pot', suspension: 's-dual', cockpit: 'k-scoot', aero: 'a-visor', paint: 'p-violet' },
  },
  {
    id: 'v-hx', name: 'Halberd HX Moto', cls: 'bike',
    blurb: 'Light-moto. Eight kilowatts, moto rubber, and no pedals worth mentioning.',
    parts: { frame: 'f-surron', motor: 'm-surron', battery: 'b-84-30', controller: 'c-200',
             tires: 't-moto19', brakes: 'br-4pot', suspension: 's-dh', cockpit: 'k-moto', aero: 'a-visor', paint: 'p-black' },
  },
  {
    id: 'v-spine', name: 'Nyx Carbon Spine', cls: 'bike',
    blurb: 'Twenty kilowatts through nine kilos of carbon. Street-legal in no country.',
    parts: { frame: 'f-carbon', motor: 'm-nyx20', battery: 'b-144-40', controller: 'c-400',
             tires: 't-slick275', brakes: 'br-race', suspension: 's-active', cockpit: 'k-carbon', aero: 'a-half', paint: 'p-carbon' },
  },
  {
    id: 'v-titan', name: 'Ampere Titan X', cls: 'scooter',
    blurb: 'Fifty-two kilos of hydraulically damped scooter with a 32 kW rating.',
    parts: { frame: 'f-titan', motor: 'm-dual8k', battery: 'b-144-40', controller: 'c-400',
             tires: 't-slick12', brakes: 'br-race', suspension: 's-active', cockpit: 'k-carbon', aero: 'a-half', paint: 'p-gold' },
  },
  {
    id: 'v-exo', name: 'Orbital EXO-9 Streamliner', cls: 'bike',
    blurb: '150 kW, full streamliner shell, land-speed tyres. Built for one thing.',
    parts: { frame: 'f-exo', motor: 'm-shaft150', battery: 'b-800-45', controller: 'c-900',
             tires: 't-ln24', brakes: 'br-mag', suspension: 's-mag', cockpit: 'k-gyro', aero: 'a-shell', paint: 'p-chrome' },
  },
  {
    id: 'v-void', name: 'Orbital Void Deck', cls: 'scooter',
    blurb: 'The hyper-scooter. A streamliner shell over a 150 kW shaft drive.',
    parts: { frame: 'f-void', motor: 'm-shaft150', battery: 'b-900-90', controller: 'c-1600',
             tires: 't-ln12', brakes: 'br-mag', suspension: 's-mag', cockpit: 'k-gyro', aero: 'a-shell', paint: 'p-oil' },
  },
  {
    id: 'v-omega', name: 'Chernov RB-Ω "Meltdown"', cls: 'bike',
    blurb: '900 kW. A fusion cell. A plasma sheath. Officially the fastest thing in Volta Bay.',
    parts: { frame: 'f-chernov', motor: 'm-nuke2', battery: 'b-fusion', controller: 'c-omega',
             tires: 't-plasma', brakes: 'br-inertial', suspension: 's-mag', cockpit: 'k-neural', aero: 'a-plasma', paint: 'p-molten' },
  },
];

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));
