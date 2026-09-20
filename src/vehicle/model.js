/* ============================================================
   model.js — procedural 3D models for every build

   Local space: +Z forward, +Y up, origin at the REAR CONTACT PATCH.
     root            position + yaw
      └ tilt         lean (roll about Z)
         └ body      wheelie pitch (about X, through the rear axle)
            ├ rear wheel + motor
            ├ frame / deck
            ├ steer  → fork → front wheel
            └ riders
   ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp } from '../core/util.js';

/* ---------- geometry helpers ---------- */
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion();

function tube(ax, ay, az, bx, by, bz, r, seg = 7) {
  _a.set(ax, ay, az); _b.set(bx, by, bz);
  _d.subVectors(_b, _a);
  const len = _d.length();
  if (len < 1e-4) return null;
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  _q.setFromUnitVectors(UP, _d.normalize());
  g.applyQuaternion(_q);
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return g;
}

function box(cx, cy, cz, sx, sy, sz, rot) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (rot) { g.rotateX(rot[0] || 0); g.rotateY(rot[1] || 0); g.rotateZ(rot[2] || 0); }
  g.translate(cx, cy, cz);
  return g;
}

function cyl(cx, cy, cz, r1, r2, h, seg, rot) {
  const g = new THREE.CylinderGeometry(r1, r2, h, seg || 10);
  if (rot) { g.rotateX(rot[0] || 0); g.rotateY(rot[1] || 0); g.rotateZ(rot[2] || 0); }
  g.translate(cx, cy, cz);
  return g;
}

function sphere(cx, cy, cz, r, seg = 8) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2));
  g.translate(cx, cy, cz);
  return g;
}

function merge(list) {
  const clean = list.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of clean) { g.deleteAttribute('uv'); }
  return clean.length ? mergeGeometries(clean, false) : null;
}

function meshOf(list, material) {
  const g = merge(list);
  if (!g) return null;
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}

/* ---------- shared materials ---------- */
const MATS = {
  rubber: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.93, metalness: 0.03 }),
  rim:    new THREE.MeshStandardMaterial({ color: 0x9aa2ad, roughness: 0.35, metalness: 0.85 }),
  dark:   new THREE.MeshStandardMaterial({ color: 0x24282f, roughness: 0.55, metalness: 0.45 }),
  motor:  new THREE.MeshStandardMaterial({ color: 0x4d5560, roughness: 0.34, metalness: 0.9 }),
  batt:   new THREE.MeshStandardMaterial({ color: 0x2b303a, roughness: 0.5, metalness: 0.3 }),
  skin:   new THREE.MeshStandardMaterial({ color: 0xc98e6d, roughness: 0.82 }),
  helmet: new THREE.MeshStandardMaterial({ color: 0xe8413f, roughness: 0.3, metalness: 0.2 }),
  visor:  new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.1, metalness: 0.7 }),
  cloth:  new THREE.MeshStandardMaterial({ color: 0x2f3a52, roughness: 0.92 }),
  cloth2: new THREE.MeshStandardMaterial({ color: 0x5a3f6b, roughness: 0.92 }),
  light:  new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffe08a, emissiveIntensity: 1.4, roughness: 0.3 }),
  tail:   new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff2233, emissiveIntensity: 1.1, roughness: 0.3 }),
};

function paintMaterial(paint) {
  const p = paint || { color: 0x39e6a4, metal: 0.4, rough: 0.35 };
  const m = new THREE.MeshStandardMaterial({
    color: p.color, roughness: p.rough ?? 0.35, metalness: p.metal ?? 0.4,
  });
  if (p.glow) { m.emissive = new THREE.Color(p.color); m.emissiveIntensity = p.glow; }
  return m;
}

/* ============================================================
   WHEEL
   ============================================================ */
function buildWheel(radius, widthM, spoked = true) {
  const g = new THREE.Group();
  const tyre = new THREE.TorusGeometry(radius * 0.88, radius * 0.12, 7, 22);
  tyre.rotateY(Math.PI / 2);
  const tm = new THREE.Mesh(tyre, MATS.rubber);
  tm.castShadow = true;
  tm.scale.set(clamp(widthM / 0.05, 0.6, 3.2), 1, 1);
  g.add(tm);

  const parts = [];
  parts.push(cyl(0, 0, 0, radius * 0.78, radius * 0.78, widthM * 0.55, 18, [0, 0, Math.PI / 2]));
  if (spoked) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(tube(0, 0, 0, 0, Math.sin(a) * radius * 0.76, Math.cos(a) * radius * 0.76, radius * 0.022, 4));
    }
  }
  const rim = meshOf(parts, MATS.rim);
  if (rim) g.add(rim);
  return g;
}

/* ============================================================
   RIDER
   ============================================================ */
function buildRider(standing, cloth) {
  const g = new THREE.Group();
  const body = [];
  const h = standing ? 1.0 : 0.86;

  // torso
  body.push(cyl(0, h * 0.62, 0, 0.16, 0.19, h * 0.48, 8, [standing ? -0.18 : -0.42, 0, 0]));
  // hips
  body.push(sphere(0, h * 0.36, standing ? -0.02 : -0.06, 0.16, 8));
  const torso = meshOf(body, cloth);
  if (torso) g.add(torso);

  // legs
  const legs = [];
  for (const s of [-1, 1]) {
    if (standing) {
      legs.push(tube(s * 0.11, h * 0.34, -0.02, s * 0.12, 0.30, 0.02, 0.065, 6));
      legs.push(tube(s * 0.12, 0.30, 0.02, s * 0.12, 0.04, 0.05, 0.055, 6));
    } else {
      legs.push(tube(s * 0.11, h * 0.34, -0.06, s * 0.15, 0.36, 0.22, 0.07, 6));
      legs.push(tube(s * 0.15, 0.36, 0.22, s * 0.14, 0.10, 0.30, 0.055, 6));
    }
    legs.push(box(s * 0.14, 0.03, standing ? 0.07 : 0.33, 0.09, 0.05, 0.22));
  }
  const legMesh = meshOf(legs, MATS.cloth);
  if (legMesh) g.add(legMesh);

  // arms — animated toward the bars
  const armL = new THREE.Group(), armR = new THREE.Group();
  for (const [grp, s] of [[armL, 1], [armR, -1]]) {
    grp.position.set(s * 0.17, h * 0.80, 0.02);
    const a = meshOf([
      tube(0, 0, 0, s * 0.03, -0.14, 0.24, 0.055, 6),
      tube(s * 0.03, -0.14, 0.24, s * 0.02, -0.20, 0.50, 0.048, 6),
    ], cloth);
    if (a) grp.add(a);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), MATS.skin);
    hand.position.set(s * 0.02, -0.21, 0.53);
    grp.add(hand);
    g.add(grp);
  }

  // head + helmet
  const head = new THREE.Group();
  head.position.set(0, h * 0.96, standing ? 0.04 : 0.02);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 8), MATS.helmet);
  skull.castShadow = true;
  head.add(skull);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.126, 10, 8, 0, Math.PI, 0.9, 0.7), MATS.visor);
  visor.rotation.y = -Math.PI / 2;
  head.add(visor);
  g.add(head);

  g.userData = { armL, armR, head, standing };
  return g;
}

/* ============================================================
   MAIN BUILDER
   ============================================================ */
export function buildVehicleModel(st) {
  const paint = paintMaterial(st.paint);
  const scooter = st.cls === 'scooter';
  const R = st.wheelR;
  const WB = st.wheelbase;
  const tireW = (st.parts?.tires?.width ?? 55) / 1000;
  const style = st.style || (scooter ? 'scoot' : 'bmx');

  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const body = new THREE.Group();
  root.add(tilt); tilt.add(body);
  body.position.y = R;                       // pivot on the rear axle

  /* ---- wheels ---- */
  const rearW = buildWheel(R, tireW, !scooter);
  body.add(rearW);

  const steer = new THREE.Group();           // steering pivot at the head tube
  const headZ = WB * 0.94;
  const headY = scooter ? R * 0.35 : R * 0.62;
  steer.position.set(0, headY, headZ);
  body.add(steer);

  const fork = new THREE.Group();
  steer.add(fork);
  const frontW = buildWheel(R, tireW, !scooter);
  frontW.position.set(0, -headY, WB - headZ);
  fork.add(frontW);

  /* ---- frame ---- */
  const frameParts = [];
  const darkParts = [];
  let barY, barZ;

  if (scooter) {
    const deckH = R * 0.34;
    const deckW = 0.26 + (style === 'scoot-perf' ? 0.08 : 0);
    // deck
    frameParts.push(box(0, deckH, WB * 0.44, deckW, 0.075, WB * 0.80));
    darkParts.push(box(0, deckH + 0.045, WB * 0.44, deckW * 0.88, 0.02, WB * 0.72));
    // rear fender / mudguard
    darkParts.push(box(0, R * 0.92, 0.02, deckW * 0.6, 0.05, R * 1.3));
    // stem
    const stemTop = R * 0.34 + (scooter ? 1.02 : 0.9) * (style === 'scoot-perf' ? 1.06 : 1);
    frameParts.push(tube(0, deckH, WB * 0.86, 0, stemTop, WB * 0.94, 0.045, 8));
    if (style === 'scoot-perf') {
      frameParts.push(tube(0.06, deckH, WB * 0.84, 0.05, stemTop * 0.7, WB * 0.90, 0.026, 6));
      frameParts.push(tube(-0.06, deckH, WB * 0.84, -0.05, stemTop * 0.7, WB * 0.90, 0.026, 6));
    }
    barY = stemTop - headY; barZ = WB * 0.94 - headZ;
    // bars live on the steering group
    const bars = meshOf([
      tube(-0.30, barY, barZ, 0.30, barY, barZ, 0.022, 7),
      cyl(-0.25, barY, barZ, 0.032, 0.032, 0.11, 8, [0, 0, Math.PI / 2]),
      cyl(0.25, barY, barZ, 0.032, 0.032, 0.11, 8, [0, 0, Math.PI / 2]),
    ], MATS.dark);
    if (bars) fork.add(bars);
    // fork legs
    const legs = meshOf([
      tube(-0.055, 0, 0, -0.055, -headY, WB - headZ, 0.022, 6),
      tube(0.055, 0, 0, 0.055, -headY, WB - headZ, 0.022, 6),
    ], MATS.dark);
    if (legs) fork.add(legs);
  } else {
    // --- bicycle / moto geometry ---
    const bbZ = WB * 0.38, bbY = R * 0.30;
    const seatY = R * 0.62 + (style === 'dh' ? 0.42 : style === 'moto' || style === 'hyper' || style === 'nuclear' ? 0.44 : 0.62);
    const seatZ = WB * 0.12;
    const htB = headY - 0.06, htT = headY + 0.30;

    const fat = style === 'moto' || style === 'hyper' || style === 'nuclear' ? 1.7 : style === 'dh' ? 1.3 : 1;
    const r0 = 0.026 * fat;

    frameParts.push(tube(0, 0, 0, 0, bbY, bbZ, r0 * 0.9, 7));                    // chainstay
    frameParts.push(tube(0, 0, 0, 0, seatY - 0.06, seatZ, r0 * 0.85, 7));        // seatstay
    frameParts.push(tube(0, bbY, bbZ, 0, seatY - 0.06, seatZ, r0, 7));           // seat tube
    frameParts.push(tube(0, bbY, bbZ, 0, htB, headZ, r0 * 1.25, 8));             // down tube
    frameParts.push(tube(0, seatY - 0.06, seatZ, 0, htT - 0.06, headZ, r0, 7));  // top tube
    frameParts.push(tube(0, htB, headZ, 0, htT, headZ, r0 * 1.3, 8));            // head tube
    if (style === 'moto' || style === 'hyper' || style === 'nuclear' || style === 'dh') {
      frameParts.push(tube(0, bbY + 0.10, bbZ - 0.14, 0, seatY - 0.20, seatZ + 0.10, r0 * 0.9, 6));
      frameParts.push(box(0, bbY + 0.22, bbZ * 0.72, 0.13, 0.30, 0.40));         // side panel
    }
    if (style === 'race' || style === 'hyper') {
      frameParts.push(box(0, (bbY + seatY) / 2, bbZ * 0.75, 0.085, seatY - bbY, WB * 0.5)); // monocoque spine
    }

    // seat
    darkParts.push(box(0, seatY + 0.03, seatZ + (st.seats > 1 ? -0.10 : 0), 0.15, 0.06,
      st.seats > 1 ? 0.62 : 0.34, [0.06, 0, 0]));
    darkParts.push(tube(0, seatY - 0.06, seatZ, 0, seatY + 0.01, seatZ, 0.022, 6));

    // fork
    const legs = [];
    const trail = style === 'dh' || style === 'moto' ? 0.06 : 0.035;
    for (const s of [-1, 1]) {
      legs.push(tube(s * 0.06, 0, 0, s * 0.075, -headY, WB - headZ + trail, 0.024 * fat, 6));
    }
    if (style === 'dh' || style === 'moto' || style === 'hyper') {
      legs.push(tube(-0.09, 0.02, 0, 0.09, 0.02, 0, 0.03, 6));
      legs.push(tube(-0.09, 0.22, -0.02, 0.09, 0.22, -0.02, 0.03, 6));
    }
    const forkMesh = meshOf(legs, MATS.dark);
    if (forkMesh) fork.add(forkMesh);

    // bars
    barY = 0.26; barZ = -0.03;
    const barW = 0.32 * (style === 'moto' || style === 'dh' ? 1.18 : 1);
    const bars = meshOf([
      tube(0, 0.04, 0, 0, barY - 0.02, barZ, 0.022, 6),
      tube(-barW, barY, barZ, barW, barY, barZ, 0.019, 7),
      tube(-barW, barY, barZ, -barW * 0.98, barY + 0.05, barZ - 0.05, 0.019, 6),
      tube(barW, barY, barZ, barW * 0.98, barY + 0.05, barZ - 0.05, 0.019, 6),
      cyl(-barW * 0.8, barY, barZ, 0.029, 0.029, 0.12, 8, [0, 0, Math.PI / 2]),
      cyl(barW * 0.8, barY, barZ, 0.029, 0.029, 0.12, 8, [0, 0, Math.PI / 2]),
    ], MATS.dark);
    if (bars) fork.add(bars);
  }

  /* ---- motor ---- */
  const motorPart = st.parts?.motor;
  if (motorPart) {
    const mount = motorPart.mount;
    const mGeo = [];
    if (mount === 'mid-drive' || mount === 'direct-shaft') {
      const bz = scooter ? WB * 0.22 : WB * 0.38;
      const by = scooter ? R * 0.42 : R * 0.30;
      const s = clamp(Math.cbrt(motorPart.weight / 7) * 0.13, 0.08, 0.30);
      mGeo.push(cyl(0, by, bz, s, s, s * 1.5, 12, [0, 0, Math.PI / 2]));
      mGeo.push(box(0, by - s * 0.5, bz + s * 0.6, s * 1.2, s * 0.8, s * 1.1));
    } else {
      const s = clamp(Math.cbrt(motorPart.weight / 5) * 0.11, 0.06, 0.24);
      const hub = cyl(0, 0, 0, s, s, s * 1.8, 12, [0, 0, Math.PI / 2]);
      const hubMesh = new THREE.Mesh(hub, MATS.motor);
      hubMesh.castShadow = true;
      (mount === 'hub-front' ? frontW : rearW).add(hubMesh);
      if (mount === 'dual-hub') {
        const h2 = new THREE.Mesh(cyl(0, 0, 0, s, s, s * 1.8, 12, [0, 0, Math.PI / 2]), MATS.motor);
        frontW.add(h2);
      }
    }
    const mm = meshOf(mGeo, MATS.motor);
    if (mm) body.add(mm);
  }

  /* ---- battery ---- */
  const battPart = st.parts?.battery;
  if (battPart) {
    const vol = clamp(Math.cbrt(battPart.wh / 700) * 0.5, 0.18, 1.5);
    if (scooter) {
      darkParts.push(box(0, R * 0.30, WB * 0.44, clamp(0.24 * vol * 1.6, 0.18, 0.42), clamp(0.07 * vol * 2.2, 0.05, 0.3), clamp(WB * 0.66 * vol * 1.4, 0.3, WB * 0.9)));
    } else {
      const L = clamp(0.52 * vol, 0.22, 0.78);
      const H = clamp(0.20 * vol, 0.09, 0.42);
      darkParts.push(box(0, R * 0.30 + H * 0.5 + 0.06, WB * 0.52, clamp(0.13 * vol * 1.5, 0.09, 0.30), H, L, [-0.22, 0, 0]));
    }
  }

  /* ---- controller box ---- */
  if (st.parts?.controller) {
    const s = clamp(Math.cbrt(st.parts.controller.weight / 2) * 0.13, 0.05, 0.26);
    darkParts.push(box(scooter ? 0 : 0.055, R * 0.42, scooter ? WB * 0.14 : WB * 0.22, s * 1.1, s * 1.3, s * 1.8));
  }

  /* ---- lights ---- */
  const lightMesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), MATS.light);
  lightMesh.position.set(0, barY ? barY - 0.10 : 0.1, (barZ ?? 0) + 0.06);
  fork.add(lightMesh);
  const tailMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.03), MATS.tail);
  tailMesh.position.set(0, scooter ? R * 0.9 : R * 0.55 + 0.5, -0.1);
  body.add(tailMesh);

  /* ---- aero fairing ---- */
  const aeroPart = st.parts?.aero;
  if (aeroPart && aeroPart.cdMul < 0.99) {
    const cover = 1 - aeroPart.cdMul;             // 0 none → ~0.9 full shell
    const fgeo = [];
    const noseZ = WB * 1.02, tailZ = cover > 0.55 ? -R * 1.2 : WB * 0.35;
    const hgt = R * (cover > 0.55 ? 2.2 : 1.35);
    const wid = 0.20 + cover * 0.22;
    if (cover > 0.55) {
      // full streamliner shell — a stretched, squashed capsule
      const g = new THREE.SphereGeometry(1, 16, 10);
      g.scale(wid, hgt * 0.5, (noseZ - tailZ) * 0.5);
      g.translate(0, R * 0.9, (noseZ + tailZ) / 2);
      fgeo.push(g);
    } else {
      const g = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
      g.scale(wid, hgt * 0.6, 0.42);
      g.rotateX(0.5);
      g.translate(0, R * 1.5, WB * 0.92);
      fgeo.push(g);
      if (cover > 0.3) fgeo.push(box(0, R * 0.3, WB * 0.5, wid * 1.5, 0.05, WB * 0.7));
    }
    const fm = merge(fgeo);
    if (fm) {
      const mat = paintMaterial(st.paint);
      mat.transparent = cover > 0.55;
      mat.opacity = cover > 0.55 ? 0.78 : 1;
      mat.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(fm, mat);
      mesh.castShadow = true;
      mesh.renderOrder = 2;
      body.add(mesh);
    }
  }

  /* ---- commit merged meshes ---- */
  const frameMesh = meshOf(frameParts, paint);
  if (frameMesh) body.add(frameMesh);
  const darkMesh = meshOf(darkParts, MATS.dark);
  if (darkMesh) body.add(darkMesh);

  /* ---- rider mount points ---- */
  const driverPos = scooter
    ? new THREE.Vector3(0, R * 0.38, WB * 0.34)
    : new THREE.Vector3(0, R * 0.30, WB * 0.16);
  const passPos = scooter
    ? new THREE.Vector3(0, R * 0.38, WB * 0.05)
    : new THREE.Vector3(0, R * 0.30, -R * 0.35);

  const driver = buildRider(scooter, MATS.cloth);
  driver.position.copy(driverPos);
  driver.visible = false;
  body.add(driver);

  const passenger = buildRider(scooter, MATS.cloth2);
  passenger.position.copy(passPos);
  passenger.visible = false;
  body.add(passenger);

  root.userData = {
    tilt, body, steer, fork, rearW, frontW, driver, passenger,
    wheelR: R, wheelbase: WB, scooter, headY, headZ, barY, barZ,
    seats: st.seats,
  };
  return root;
}

/* ============================================================
   runtime pose helpers
   ============================================================ */
export function poseVehicle(model, s) {
  const u = model.userData;
  u.tilt.rotation.z = s.lean || 0;
  u.body.rotation.x = -(s.pitch || 0);
  u.steer.rotation.y = s.steer || 0;
  u.rearW.rotation.x = s.spin || 0;
  u.frontW.rotation.x = s.spin || 0;
  if (u.fork) u.fork.position.y = -(s.susComp || 0);
  if (u.driver.visible) leanRider(u.driver, s, false);
  if (u.passenger.visible) leanRider(u.passenger, s, true);
}

function leanRider(r, s, isPass) {
  const p = s.pitch || 0;
  const lean = clamp((s.riderLean ?? 0), -1, 1);
  r.rotation.x = lerp(0.06, -0.30, clamp(lean * 0.5 + 0.5, 0, 1)) + p * 0.35;
  r.rotation.z = -(s.lean || 0) * 0.35;
  const d = r.userData;
  if (d && d.head) d.head.rotation.x = -p * 0.5 - (s.look || 0) * 0.3;
  if (d && d.armL) {
    const reach = isPass ? -0.55 : 0;
    d.armL.rotation.x = p * 0.5 + reach;
    d.armR.rotation.x = p * 0.5 + reach;
  }
}

export function setRiders(model, driver, passenger) {
  model.userData.driver.visible = !!driver;
  model.userData.passenger.visible = !!passenger;
}

export function tintRider(model, which, hex) {
  const g = model.userData[which];
  if (!g) return;
  g.traverse((o) => {
    if (o.isMesh && o.material === MATS.cloth) o.material = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92 });
  });
}

export function disposeModel(model) {
  model.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      if (o.material && !Object.values(MATS).includes(o.material)) o.material.dispose();
    }
  });
}

export { MATS as VEHICLE_MATS };
