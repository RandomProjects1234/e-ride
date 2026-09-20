/* ============================================================
   layout.js — hand-authored map data for the city of VOLTA BAY

   The world is 2400 x 2400 m, centred on the origin.
     -X west   +X east
     -Z north  +Z south          (sea is to the south)
   ============================================================ */

export const WORLD = {
  size: 2400,
  half: 1200,
  seaLevel: -1.4,
  name: 'Volta Bay',
};

/* -------------------------------------------------------------
   SURFACES
   ------------------------------------------------------------- */
export const SURF = {
  GRASS: 0,
  ASPHALT: 1,
  DIRT: 2,
  SAND: 3,
  CONCRETE: 4,
  WOOD: 5,
  WATER: 6,
};

export const SURF_PROPS = {
  [SURF.GRASS]:    { grip: 0.72, roll: 0.024, name: 'grass',    dust: 0x6f7d4a },
  [SURF.ASPHALT]:  { grip: 1.00, roll: 0.008, name: 'asphalt',  dust: 0x555a63 },
  [SURF.DIRT]:     { grip: 0.66, roll: 0.030, name: 'dirt',     dust: 0x8c6a45 },
  [SURF.SAND]:     { grip: 0.48, roll: 0.055, name: 'sand',     dust: 0xd8c79a },
  [SURF.CONCRETE]: { grip: 1.04, roll: 0.007, name: 'concrete', dust: 0x8b8f96 },
  [SURF.WOOD]:     { grip: 0.88, roll: 0.012, name: 'boardwalk',dust: 0x9b7a52 },
  [SURF.WATER]:    { grip: 0.18, roll: 0.30,  name: 'water',    dust: 0x3f7fa8 },
};

/* -------------------------------------------------------------
   DISTRICTS  (used for height shaping, prop scatter, labels)
   ------------------------------------------------------------- */
export const DISTRICTS = [
  { id: 'downtown',  name: 'Downtown Volta',  x: 0,     z: -420, rx: 470, rz: 340, flat: 7,   kind: 'city' },
  { id: 'industrial',name: 'Cell Works',      x: -800,  z: 110,  rx: 340, rz: 330, flat: 5,   kind: 'industrial' },
  { id: 'hills',     name: 'Torque Ridge',    x: 800,   z: -160, rx: 300, rz: 500, flat: null,kind: 'hills' },
  { id: 'park',      name: 'Amp Park',        x: -40,   z: 250,  rx: 350, rz: 250, flat: null,kind: 'park' },
  { id: 'beach',     name: 'Bay Front',       x: 60,    z: 830,  rx: 700, rz: 260, flat: null,kind: 'beach' },
  { id: 'strip',     name: 'The Mile',        x: 0,     z: -1010,rx: 1150, rz: 165, flat: 12,  kind: 'strip' },
  { id: 'suburb',    name: 'Cellside',        x: -560,  z: -640, rx: 300, rz: 300, flat: 9,   kind: 'suburb' },
];

/* -------------------------------------------------------------
   ROADS — each is a polyline of [x,z] control points, smoothed
   with a Catmull-Rom spline when baked.
   type: highway | street | lane | trail | boardwalk | pad
   ------------------------------------------------------------- */
export const ROADS = [
  /* ---- ring road: the main loop around everything ---- */
  { id: 'ring', type: 'highway', w: 13, closed: true, pts: [
    [-950, -880], [-460, -1040], [ 180, -1080], [ 700, -980], [1010, -700],
    [1110, -380], [1120,  -60], [1060,  330], [ 800,  700], [ 300,  940], [-260,  960],
    [-720,  790], [-1000, 420], [-1080, -180], [-1050, -600],
  ]},

  /* ---- the Mile: dead-straight drag strip along the north ---- */
  { id: 'mile', type: 'highway', w: 26, level: true, pts: [
    [-880, -1010], [-560, -1010], [-240, -1010], [80, -1010], [400, -1010], [700, -1010], [880, -1010],
  ]},
  { id: 'mile-link-w', type: 'street', w: 10, pts: [ [-880, -1010], [-930, -950], [-950, -880] ]},
  { id: 'mile-link-e', type: 'street', w: 10, pts: [ [880, -1010], [930, -930], [900, -840], [830, -790], [760, -800], [690, -880], [690, -960] ]},
  { id: 'mile-feed',   type: 'street', w: 10, pts: [ [0, -1010], [20, -900], [10, -800], [0, -740] ]},

  /* ---- downtown grid ---- */
  { id: 'dt-av-1', type: 'street', w: 11, pts: [ [-380, -700], [-380, -140] ]},
  { id: 'dt-av-2', type: 'street', w: 11, pts: [ [-190, -720], [-190, -120] ]},
  { id: 'dt-av-3', type: 'street', w: 12, pts: [ [   0, -740], [   0,  -80] ]},
  { id: 'dt-av-4', type: 'street', w: 11, pts: [ [ 190, -720], [ 190, -120] ]},
  { id: 'dt-av-5', type: 'street', w: 11, pts: [ [ 380, -700], [ 380, -160] ]},
  { id: 'dt-st-1', type: 'street', w: 11, pts: [ [-420, -660], [ 420, -660] ]},
  { id: 'dt-st-2', type: 'street', w: 11, pts: [ [-430, -500], [ 430, -500] ]},
  { id: 'dt-st-3', type: 'street', w: 12, pts: [ [-450, -340], [ 450, -340] ]},
  { id: 'dt-st-4', type: 'street', w: 11, pts: [ [-420, -190], [ 420, -190] ]},
  /* diagonal boulevard cutting the grid — the fun one */
  { id: 'dt-blvd', type: 'street', w: 14, pts: [
    [-450, -720], [-300, -600], [-120, -470], [ 60, -350], [ 230, -250], [ 400, -170], [ 520, -120],
  ]},

  /* ---- connectors out of downtown ---- */
  { id: 'c-west', type: 'street', w: 12, pts: [ [-420, -340], [-620, -320], [-820, -280], [-980, -220], [-1080, -180] ]},
  { id: 'c-east', type: 'street', w: 12, pts: [ [ 450, -340], [ 540, -338], [ 650, -330] ]},
  { id: 'c-south',type: 'street', w: 13, pts: [ [   0,  -80], [  10,   40], [   0,  160], [ -20,  300], [ -10,  440], [ 30, 580], [ 60, 720], [ 70, 900] ]},
  { id: 'c-nw',   type: 'street', w: 11, pts: [ [-380, -700], [-470, -760], [-560, -820], [-700, -880], [-860, -900] ]},

  /* ---- suburbs (Cellside) ---- */
  { id: 'sub-1', type: 'lane', w: 8, pts: [ [-560, -820], [-620, -740], [-660, -640], [-640, -540], [-560, -470], [-460, -450] ]},
  { id: 'sub-2', type: 'lane', w: 8, pts: [ [-660, -640], [-760, -620], [-860, -580], [-960, -570], [-1035, -590] ]},
  { id: 'sub-3', type: 'lane', w: 8, pts: [ [-640, -540], [-740, -500], [-820, -430], [-880, -360] ]},

  /* ---- industrial (Cell Works) ---- */
  { id: 'ind-main', type: 'street', w: 14, pts: [ [-880, -360], [-900, -220], [-880, -80], [-830, 60], [-760, 180], [-720, 300], [-740, 430] ]},
  { id: 'ind-a',    type: 'street', w: 11, pts: [ [-900, -220], [-1010, -190], [-1080, -180] ]},
  { id: 'ind-b',    type: 'street', w: 11, pts: [ [-830, 60], [-960, 90], [-1035, 145], [-1010, 290], [-997, 400] ]},
  { id: 'ind-c',    type: 'street', w: 11, pts: [ [-760, 180], [-620, 200], [-470, 220], [-362, 249] ]},
  { id: 'ind-lot',  type: 'pad',    w: 150, pts: [ [-660, 40], [-560, 40] ]},

  /* ---- Torque Ridge: switchback climb ---- */
  { id: 'hill-climb', type: 'street', w: 13, pts: [
    [ 650, -330], [ 725, -405], [ 830, -452], [ 935, -420], [1000, -340],
    [1016, -240], [ 972, -152], [ 884, -104], [ 806,  -42], [ 826,   46],
    [ 896,   74], [ 942,   42],
  ]},
  { id: 'hill-view', type: 'lane', w: 10, pts: [ [1000, -340], [1004, -412], [990, -478], [973, -532] ]},
  { id: 'hill-down', type: 'street', w: 13, pts: [ [ 940, 40], [ 900, 160], [ 840, 300], [ 810, 450], [ 800, 600], [ 798, 698] ]},

  /* ---- Amp Park: dirt trails ---- */
  { id: 'trail-1', type: 'trail', w: 6, pts: [ [-360, 250], [-280, 200], [-190, 180], [-100, 215], [-40, 280], [ 10, 340], [ 90, 370], [ 190, 350], [ 260, 290] ]},
  { id: 'trail-2', type: 'trail', w: 5, pts: [ [-190, 180], [-160, 110], [-90, 70], [ 10, 60], [ 90, 95], [ 140, 170], [ 190, 250], [ 190, 350] ]},
  { id: 'trail-3', type: 'trail', w: 5, pts: [ [-40, 280], [-90, 360], [-120, 450], [-70, 520], [ 30, 540], [ 60, 470] ]},
  { id: 'park-loop', type: 'lane', w: 7, pts: [ [-360, 250], [-380, 360], [-330, 460], [-220, 520], [-110, 545], [ 10, 566], [ 30, 580] ]},

  /* ---- Bay Front ---- */
  { id: 'bay-rd', type: 'street', w: 12, pts: [ [-720, 790], [-480, 820], [-220, 845], [ 70, 860], [ 350, 840], [ 620, 782], [ 792, 700] ]},
  { id: 'boardwalk', type: 'boardwalk', w: 9, y: 2.1, pts: [ [-420, 900], [-180, 918], [ 90, 928], [ 340, 915], [ 540, 878] ]},
  { id: 'pier', type: 'boardwalk', w: 7, y: 2.1, pts: [ [ 90, 928], [ 95, 1005], [ 100, 1082] ]},

  /* ---- skatepark pad ---- */
  { id: 'skate-pad', type: 'pad', w: 110, pts: [ [-190, 430], [-120, 430] ]},
];

/* road-type presets */
export const ROAD_TYPES = {
  highway:   { surf: SURF.ASPHALT,  color: 0x30343c, shoulder: 5, markings: 'dashed', curb: false },
  street:    { surf: SURF.ASPHALT,  color: 0x34383f, shoulder: 4.5, markings: 'dashed', curb: true },
  lane:      { surf: SURF.ASPHALT,  color: 0x3a3e46, shoulder: 3.5, markings: 'none', curb: true },
  trail:     { surf: SURF.DIRT,     color: 0x7a5c3b, shoulder: 3, markings: 'none', curb: false },
  boardwalk: { surf: SURF.WOOD,     color: 0x8a6743, shoulder: 3.5, markings: 'planks', curb: false },
  pad:       { surf: SURF.CONCRETE, color: 0x6e7279, shoulder: 6, markings: 'none', curb: false },
};

/* -------------------------------------------------------------
   POINTS OF INTEREST — interactable hubs
   ------------------------------------------------------------- */
export const POIS = [
  { id: 'garage',  name: 'The Shed',        sub: 'Your garage — build & customise',  x: 62,   z: -60,  kind: 'garage',  color: 0x39e6a4, r: 11 },
  { id: 'store',   name: 'VoltMart',        sub: 'Parts & complete rides',           x: -152, z: -300, kind: 'store',   color: 0xffd34d, r: 11 },
  { id: 'market',  name: 'The Swap Meet',   sub: 'Player marketplace',               x: 236,  z: -182, kind: 'market',  color: 0xa06bff, r: 11 },
  { id: 'jobs',    name: 'Courier Depot',   sub: 'Quests & contracts',               x: -320, z: -186, kind: 'jobs',    color: 0x16c2ff, r: 11 },
  { id: 'strip',   name: 'The Mile',        sub: 'Top-speed runs',                   x: -820, z: -1010,kind: 'strip',   color: 0xff4d5e, r: 16 },
  { id: 'skate',   name: 'Amp Bowl',        sub: 'Trick park',                       x: -155, z: 430,  kind: 'skate',   color: 0xffb020, r: 16 },
  { id: 'view',    name: 'Ridge Lookout',   sub: 'Best view in Volta Bay',           x: 973,  z: -532, kind: 'view',    color: 0x9fe870, r: 14 },
  { id: 'pier',    name: 'Bay Pier',        sub: 'Ride-out meeting spot',            x: 100,  z: 1076, kind: 'meet',    color: 0x16c2ff, r: 13 },
  { id: 'works',   name: 'Cell Works Yard', sub: 'Industrial obstacle course',       x: -610, z: 40,   kind: 'course',  color: 0xffb020, r: 18 },
];

/** spawn / respawn points */
export const SPAWNS = [
  { x: 40, z: -40, yaw: Math.PI },
  { x: 0, z: -190, yaw: 0 },
  { x: -150, z: -340, yaw: Math.PI / 2 },
  { x: 230, z: -220, yaw: -Math.PI / 2 },
  { x: -820, z: -1000, yaw: 0 },
  { x: -150, z: 400, yaw: 0 },
];

/** named checkpoints used to build quests procedurally */
export const LANDMARKS = [
  { id: 'lm-dt-n',   name: 'North Plaza',      x: 0,     z: -660 },
  { id: 'lm-dt-c',   name: 'Central Cross',    x: 0,     z: -340 },
  { id: 'lm-dt-e',   name: 'East Market',      x: 380,   z: -340 },
  { id: 'lm-dt-w',   name: 'West Gate',        x: -380,  z: -340 },
  { id: 'lm-sub',    name: 'Cellside Loop',    x: -640,  z: -540 },
  { id: 'lm-ind',    name: 'Cell Works',       x: -820,  z: 60 },
  { id: 'lm-ind-s',  name: 'South Docks',      x: -740,  z: 430 },
  { id: 'lm-park',   name: 'Amp Park Gate',    x: -360,  z: 250 },
  { id: 'lm-pond',   name: 'Park Pond',        x: 30,    z: 540 },
  { id: 'lm-bay-w',  name: 'West Bay',         x: -480,  z: 820 },
  { id: 'lm-bay-e',  name: 'East Bay',         x: 600,   z: 780 },
  { id: 'lm-pier',   name: 'Bay Pier',         x: 97,    z: 1005 },
  { id: 'lm-hill-1', name: 'Ridge Switchback', x: 935,   z: -420 },
  { id: 'lm-hill-2', name: 'Ridge Summit',     x: 880,   z: 60 },
  { id: 'lm-hill-3', name: 'Ridge Lookout',    x: 1012,  z: -540 },
  { id: 'lm-mile-w', name: 'Mile Start',       x: -850,  z: -1010 },
  { id: 'lm-mile-e', name: 'Mile End',         x: 850,   z: -1010 },
  { id: 'lm-ring-n', name: 'North Ring',       x: 180,   z: -1080 },
  { id: 'lm-ring-s', name: 'South Ring',       x: -260,  z: 960 },
  { id: 'lm-skate',  name: 'Amp Bowl',         x: -155,  z: 430 },
];
