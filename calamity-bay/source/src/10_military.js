// Calamity Bay — the city fights back: police, tanks, attack helicopters and jet strikes

const UNITS = [], PROJ = [];
let policeMesh, tankHull, tankTurret, tankWreckPool;
const HELI_POOL = [], JET_POOL = [];
const MIL = { level: 0, t: 0, spawnT: 0, jetT: 30, announced: 0 };
const LEVELS = [
  { police: 0, tanks: 0, helis: 0, jets: 0 },
  { police: 6, tanks: 0, helis: 0, jets: 0, msg: 'POLICE RESPONDING' },
  { police: 8, tanks: 3, helis: 0, jets: 0, msg: 'ARMY DEPLOYED · TANKS ROLLING IN' },
  { police: 8, tanks: 4, helis: 2, jets: 0, msg: 'AIR CAVALRY INBOUND' },
  { police: 6, tanks: 5, helis: 3, jets: 26, msg: 'AIR FORCE SCRAMBLED' },
  { police: 6, tanks: 5, helis: 3, jets: 16, msg: 'ALL FORCES ENGAGE' },
];
const THRESH = [0, 0.008, 0.05, 0.14, 0.26, 0.38];

function initMilitary() {
  const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
  policeMesh = new THREE.InstancedMesh(carGeometry(true), lam, 12);
  policeMesh.frustumCulled = false; policeMesh.castShadow = true;
  for (let i = 0; i < 12; i++) { policeMesh.setMatrixAt(i, ZERO_M); policeMesh.setColorAt(i, _col.setRGB(0.95, 0.95, 0.97)); }
  scene.add(policeMesh);
  const olive = [0.36, 0.4, 0.26], dark = [0.13, 0.13, 0.12];
  const hullG = mergeParts([
    { geo: new THREE.BoxGeometry(3.4, 1.3, 7), p: [0, 1.25, 0], c: olive },
    { geo: new THREE.BoxGeometry(1, 1.2, 7.4), p: [-1.95, 0.7, 0], c: dark },
    { geo: new THREE.BoxGeometry(1, 1.2, 7.4), p: [1.95, 0.7, 0], c: dark },
    { geo: new THREE.BoxGeometry(3.2, 0.5, 1.2), p: [0, 1.6, 3.2], r: [0.4, 0, 0], c: olive },
  ]);
  const turG = mergeParts([
    { geo: new THREE.BoxGeometry(2.6, 1.1, 3.2), p: [0, 0.55, -0.3], c: [0.33, 0.37, 0.24] },
    { geo: new THREE.CylinderGeometry(0.22, 0.26, 5.2, 6), p: [0, 0.6, 3.6], r: [Math.PI / 2, 0, 0], c: dark },
  ]);
  tankHull = new THREE.InstancedMesh(hullG, lam, 10); tankTurret = new THREE.InstancedMesh(turG, lam, 10);
  for (const m of [tankHull, tankTurret]) { m.frustumCulled = false; m.castShadow = true; for (let i = 0; i < 10; i++) { m.setMatrixAt(i, ZERO_M); m.setColorAt(i, _col.setRGB(1, 1, 1)); } scene.add(m); }
  tankWreckPool = makePool(hullG, lam, 40, false);
  // helicopters and jets are small groups
  const heliMat = (c) => new THREE.MeshLambertMaterial({ color: new THREE.Color(...c) });
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group(), body = heliMat([0.3, 0.34, 0.27]), blk = heliMat([0.1, 0.1, 0.1]);
    const add = (geo, m, p, r = [0, 0, 0], s = [1, 1, 1]) => { const o = new THREE.Mesh(geo, m); o.position.set(...p); o.rotation.set(...r); o.scale.set(...s); o.castShadow = true; g.add(o); return o; };
    add(new THREE.IcosahedronGeometry(1.8, 1), body, [0, 0, 0.6], [0, 0, 0], [1, 1, 2]);
    add(new THREE.BoxGeometry(1.6, 0.9, 1.6), heliMat([0.2, 0.28, 0.35]), [0, 0.3, 3.2]);
    add(new THREE.CylinderGeometry(0.45, 0.25, 7, 6), body, [0, 0.4, -4.2], [Math.PI / 2, 0, 0]);
    add(new THREE.BoxGeometry(0.2, 2.2, 1.4), body, [0, 1.2, -7.6]);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.2, 0.2, 4.4), blk, [s * 1.2, -1.9, 0.6]);
      add(new THREE.BoxGeometry(2.6, 0.3, 0.6), body, [s * 1.5, -0.2, 0.2]);
      add(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 6), blk, [s * 2.6, -0.4, 0.4], [Math.PI / 2, 0, 0]);
    }
    const rotor = new THREE.Group(); rotor.position.set(0, 2, 0.4); g.add(rotor);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 0.6), blk); rotor.add(blade);
    const b2 = blade.clone(); b2.rotation.y = Math.PI / 2; rotor.add(b2);
    const tr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.3), blk); tr.position.set(0.3, 1.2, -7.6); g.add(tr);
    g.userData = { rotor, tr };
    g.visible = false; scene.add(g);
    HELI_POOL.push(g);
  }
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(), m = heliMat([0.55, 0.58, 0.6]), dk = heliMat([0.25, 0.27, 0.3]);
    const add = (geo, mt, p, r = [0, 0, 0], s = [1, 1, 1]) => { const o = new THREE.Mesh(geo, mt); o.position.set(...p); o.rotation.set(...r); o.scale.set(...s); g.add(o); return o; };
    add(new THREE.CylinderGeometry(0.4, 1.1, 14, 7), m, [0, 0, 0], [Math.PI / 2, 0, 0]);
    add(new THREE.ConeGeometry(0.4, 3, 7), m, [0, 0, 8.4], [Math.PI / 2, 0, 0]);
    add(new THREE.BoxGeometry(0.9, 0.6, 2.2), dk, [0, 0.8, 3.4]);
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 3, -7, 0, -3, 7, 0, -3, 0, 0, 3, 7, 0, -3, -7, 0, -3], 3));
    wing.computeVertexNormals();
    add(wing, m, [0, -0.2, -0.5]);
    add(new THREE.BoxGeometry(0.2, 3, 2.2), m, [0, 1.6, -6]);
    add(new THREE.BoxGeometry(5, 0.15, 1.6), m, [0, 0, -6.2]);
    g.visible = false; scene.add(g);
    JET_POOL.push(g);
  }
}

// ---------- spawning ----------
function spawnGround(type) {
  const slotOf = (mesh, max) => { for (let i = 0; i < max; i++) if (!UNITS.some((u) => u.alive && u.mesh === mesh && u.slot === i)) return i; return -1; };
  const mesh = type === 'police' ? policeMesh : tankHull;
  const slot = slotOf(mesh, type === 'police' ? 12 : 10);
  if (slot < 0) return;
  let best = null;
  for (let t = 0; t < 30; t++) {
    const edge = Math.random() < 0.7;
    const i = edge ? (Math.random() < 0.5 ? 0 : 9) : ri(0, 9), j = ri(0, 9);
    const swap = Math.random() < 0.5;
    const x = roadPos(swap ? j : i), z = roadPos(swap ? i : j);
    const d = Math.hypot(x - MON.x, z - MON.z);
    if (d > 300 && (!best || d < best.d)) best = { x, z, d };
  }
  if (!best) return;
  const u = { type, alive: true, mesh, slot, hp: type === 'tank' ? 2 : 1, stun: 0, fireT: rr(1, 3), x: best.x, z: best.z, y: 0, yaw: 0, tyaw: 0, speed: 0 };
  // pick the road heading most toward the monster
  const dx = MON.x - u.x, dz = MON.z - u.z;
  if (Math.abs(dx) > Math.abs(dz)) { u.axis = 0; u.line = Math.round((u.z - R0) / BLK); u.dir = Math.sign(dx) || 1; u.s = u.x; }
  else { u.axis = 1; u.line = Math.round((u.x - R0) / BLK); u.dir = Math.sign(dz) || 1; u.s = u.z; }
  u.s += u.dir * 0.01;
  nextRoad(u);
  u.vmax = type === 'tank' ? 9 : 24;
  u.range = type === 'tank' ? 175 : 110;
  carPos(u); u.x = u.tx; u.z = u.tz;
  UNITS.push(u);
}
function spawnHeli() {
  const g = HELI_POOL.find((h) => !h.visible);
  if (!g) return;
  const a = Math.random() * TAU;
  const u = { type: 'heli', alive: true, g, x: MON.x + Math.cos(a) * 900, z: MON.z + Math.sin(a) * 900, y: 95, yaw: 0, stun: 0, fireT: rr(5, 8), orb: a, R: rr(85, 115), alt: rr(55, 80), vx: 0, vy: 0, vz: 0, salvo: 0, run: 0, falling: false };
  g.visible = true; g.position.set(u.x, u.y, u.z);
  UNITS.push(u);
}
function spawnJets() {
  const a = Math.random() * TAU, ca = Math.cos(a), sa = Math.sin(a);
  for (let k = 0; k < 2; k++) {
    const g = JET_POOL.find((h) => !h.visible);
    if (!g) return;
    const off = (k ? 1 : -1) * 22;
    const u = { type: 'jet', alive: true, g, x: MON.x - ca * 1500 - sa * off, z: MON.z - sa * 1500 + ca * off, y: 150 + k * 8, vx: ca * 170, vz: sa * 170, fired: false, life: 20 };
    g.visible = true;
    UNITS.push(u);
  }
  jetSound(_v3.set(MON.x - ca * 600, 150, MON.z - sa * 600));
}

// ---------- update ----------
function updateMilitary(dt) {
  if (!MON.on || MON.dead) return;
  MIL.t += dt;
  const d = STATS.wGone / STATS.wTotal;
  let lvl = 0;
  for (let i = THRESH.length - 1; i >= 0; i--) if (d >= THRESH[i]) { lvl = i; break; }
  if (MIL.t > 30) lvl = Math.max(lvl, 1);
  if (MIL.t > 150) lvl = Math.max(lvl, 2);
  if (lvl > MIL.level) {
    MIL.level = lvl;
    if (LEVELS[lvl].msg) say(LEVELS[lvl].msg, 3.2, 'mil');
    MIL.spawnT = 0;
    if (lvl >= 4) MIL.jetT = 8;
  }
  const L = LEVELS[MIL.level];
  MIL.spawnT -= dt;
  if (MIL.spawnT <= 0) {
    MIL.spawnT = 4;
    const count = (t) => UNITS.filter((u) => u.alive && u.type === t).length;
    if (count('police') < L.police) spawnGround('police');
    if (count('tank') < L.tanks) spawnGround('tank');
    if (count('heli') < L.helis) spawnHeli();
  }
  if (L.jets) { MIL.jetT -= dt; if (MIL.jetT <= 0) { MIL.jetT = L.jets + rr(-3, 5); spawnJets(); } }

  let heliNear = 1e9, policeNear = 1e9;
  for (const u of UNITS) {
    if (!u.alive) continue;
    u.stun -= dt;
    if (u.type === 'police' || u.type === 'tank') updateGround(u, dt);
    else if (u.type === 'heli') { updateHeli(u, dt); heliNear = Math.min(heliNear, Math.hypot(u.x - camera.position.x, u.y - camera.position.y, u.z - camera.position.z)); }
    else if (u.type === 'jet') updateJet(u, dt);
    if (u.type === 'police') policeNear = Math.min(policeNear, Math.hypot(u.x - camera.position.x, u.z - camera.position.z));
  }
  for (let i = UNITS.length - 1; i >= 0; i--) if (!UNITS[i].alive && !UNITS[i].falling) UNITS.splice(i, 1);
  // render ground units
  for (let i = 0; i < 12; i++) policeMesh.setMatrixAt(i, ZERO_M);
  for (let i = 0; i < 10; i++) { tankHull.setMatrixAt(i, ZERO_M); tankTurret.setMatrixAt(i, ZERO_M); }
  for (const u of UNITS) {
    if (!u.alive || u.type === 'heli' || u.type === 'jet') continue;
    _m4.compose(_v1.set(u.x, 0, u.z), _q1.setFromAxisAngle(UP, u.yaw), _v2.set(1, 1, 1));
    u.mesh.setMatrixAt(u.slot, _m4);
    if (u.type === 'tank') {
      _m4.compose(_v1.set(u.x, 2.0, u.z), _q1.setFromAxisAngle(UP, u.tur || u.yaw), _v2.set(1, 1, 1));
      tankTurret.setMatrixAt(u.slot, _m4);
    } else if (Math.floor(clock * 6 + u.slot) % 2 === 0) {
      emit(glowPS, u.x, 2.3, u.z, 0, 0, 0, 1.6, 0, 0.09, (Math.floor(clock * 3) % 2) ? 1 : 0.2, 0.15, (Math.floor(clock * 3) % 2) ? 0.15 : 1, 1, 0, 0);
    }
  }
  policeMesh.instanceMatrix.needsUpdate = true; tankHull.instanceMatrix.needsUpdate = true; tankTurret.instanceMatrix.needsUpdate = true;
  updateProjectiles(dt);
  updateThrown(dt);
  if (AC) {
    aSet(loops.heli.g.gain, clamp(1 - heliNear / 500, 0, 1) * 0.35, 0.3);
    aSet(loops.siren.g.gain, clamp(1 - policeNear / 450, 0, 1) * 0.05, 0.4);
  }
}
function aimAtMonster(x, y, z, spread, out) {
  const ty = MON.y + MON.def.H * rr(0.35, 0.8);
  out.set(MON.x + frand(-3, 3) - x, ty - y, MON.z + frand(-3, 3) - z).normalize();
  out.x += frand(-spread, spread); out.y += frand(-spread, spread); out.z += frand(-spread, spread);
  return out.normalize();
}
function updateGround(u, dt) {
  const dm = Math.hypot(MON.x - u.x, MON.z - u.z);
  const engaged = dm < u.range;
  let want = engaged ? 0 : u.vmax;
  if (dm < 45 && u.type === 'police') want = -8; // back off
  u.speed += clamp(want - u.speed, -20 * dt, 8 * dt);
  u.s += u.speed * u.dir * dt;
  if ((roadPos(u.nk) - u.s) * u.dir <= 0) {
    if (u.nk < 0 || u.nk > NROAD - 1) { u.dir = -u.dir; nextRoad(u); }
    else {
      // at an intersection: head toward the monster
      const opts = [];
      if (u.nk > 0 && u.nk < NROAD - 1) opts.push([u.axis, u.line, u.dir]);
      if (u.line < NROAD - 1) opts.push([1 - u.axis, u.nk, 1]);
      if (u.line > 0) opts.push([1 - u.axis, u.nk, -1]);
      let best = opts[0], bs = -1e9;
      for (const o of opts) {
        const fx = o[0] === 0 ? o[2] : 0, fz = o[0] === 1 ? o[2] : 0;
        const sc = fx * (MON.x - u.tx) + fz * (MON.z - u.tz) + Math.random() * 20;
        if (sc > bs) { bs = sc; best = o; }
      }
      if (best[0] !== u.axis) { u.s = roadPos(u.line); u.axis = best[0]; u.line = best[1]; }
      u.dir = best[2]; u.s += u.dir * 0.01; nextRoad(u);
    }
  }
  carPos(u);
  const k = 1 - Math.exp(-8 * dt);
  u.x += (u.tx - u.x) * k; u.z += (u.tz - u.z) * k;
  const yaw = u.axis === 0 ? (u.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (u.dir > 0 ? 0 : Math.PI);
  u.yaw += angWrap(yaw - u.yaw) * Math.min(1, dt * 6);
  if (u.type === 'tank') u.tur = (u.tur || u.yaw) + angWrap(Math.atan2(MON.x - u.x, MON.z - u.z) - (u.tur || u.yaw)) * Math.min(1, dt * 2);
  if (!engaged || u.stun > 0) return;
  u.fireT -= dt;
  if (u.fireT > 0) return;
  if (u.type === 'police') {
    u.fireT = rr(0.4, 0.9);
    _v1.set(u.x, 1.6, u.z);
    aimAtMonster(_v1.x, _v1.y, _v1.z, 0.04, _v2);
    fire('bullet', _v1, _v2, 320, 0.4);
    muzzle(_v1.x, _v1.y, _v1.z, 0.8); gunshot(_v1);
  } else {
    u.fireT = rr(4, 6);
    const t = u.tur || u.yaw;
    _v1.set(u.x + Math.sin(t) * 6, 2.7, u.z + Math.cos(t) * 6);
    aimAtMonster(_v1.x, _v1.y, _v1.z, 0.025, _v2);
    fire('shell', _v1, _v2, 230, 12);
    muzzle(_v1.x, _v1.y, _v1.z, 3); smokePuff(_v1.x, _v1.y, _v1.z, 3, 0.5); cannon(_v1);
  }
}
function updateHeli(u, dt) {
  const g = u.g;
  g.userData.rotor.rotation.y += dt * 30; g.userData.tr.rotation.x += dt * 40;
  if (u.falling) {
    u.vy -= G * dt; u.x += u.vx * dt; u.y += u.vy * dt; u.z += u.vz * dt;
    g.rotation.y += dt * 6; g.rotation.z = 0.5;
    if (Math.random() < 0.6) { fireAt(u.x, u.y, u.z, 3); smokePuff(u.x, u.y, u.z, 4, 0.12); }
    const gy = Math.max(terrainH(u.x, u.z), WATER_Y);
    const sid = staticAt(u.x, u.y, u.z);
    if (u.y < gy + 1 || sid >= 0) {
      u.falling = false; g.visible = false;
      explosionFx(u.x, u.y, u.z, 3); boom(_v3.set(u.x, u.y, u.z), 1.3);
      hitSphere(u.x, u.y, u.z, 10, 300, 0, 0.3, 0, 8, null);
      if (gy <= WATER_Y + 0.1) splashAt(u.x, u.z, 4);
    }
    g.position.set(u.x, u.y, u.z);
    return;
  }
  // orbit the monster, dipping in for rocket runs
  u.orb += dt * 22 / u.R;
  u.run -= dt;
  const R = u.run > 0 ? 62 : u.R, alt = u.run > 0 ? Math.max(38, u.alt - 18) : u.alt;
  let tx = MON.x + Math.cos(u.orb) * R, tz = MON.z + Math.sin(u.orb) * R, ty = Math.max(terrainH(tx, tz), 0) + alt;
  if (staticAt(tx, ty, tz) >= 0 || staticAt(tx, ty - 15, tz) >= 0) ty += 40;
  const k = 1 - Math.exp(-dt * (u.stun > 0 ? 0.5 : 0.9));
  if (u.stun > 0) { tx = u.x + (u.x - MON.x) * 0.2; tz = u.z + (u.z - MON.z) * 0.2; }
  const ox = u.x, oz = u.z;
  u.x += (tx - u.x) * k; u.y += (ty - u.y) * k; u.z += (tz - u.z) * k;
  const yaw = Math.atan2(MON.x - u.x, MON.z - u.z);
  g.position.set(u.x, u.y, u.z);
  g.rotation.set(clamp(Math.hypot(u.x - ox, u.z - oz) / dt * 0.004, 0, 0.3), yaw, 0, 'YXZ');
  if (u.stun > 0) return;
  u.fireT -= dt;
  if (u.fireT <= 0 && Math.hypot(u.x - MON.x, u.z - MON.z) < 260) {
    u.fireT = rr(8, 11); u.salvo = 4; u.salvoT = 0; u.run = 3;
  }
  if (u.salvo > 0) {
    u.salvoT -= dt;
    if (u.salvoT <= 0) {
      u.salvoT = 0.18; u.salvo--;
      const s = u.salvo % 2 ? 1 : -1;
      _v1.set(u.x + Math.cos(yaw) * s * 2.6, u.y - 0.5, u.z - Math.sin(yaw) * s * 2.6);
      aimAtMonster(_v1.x, _v1.y, _v1.z, 0.05, _v2);
      fire('rocket', _v1, _v2, 110, 9);
      rocketSound(_v1); muzzle(_v1.x, _v1.y, _v1.z, 1.5);
    }
  } else if (Math.random() < dt * 3) {
    _v1.set(u.x, u.y - 1.5, u.z);
    aimAtMonster(_v1.x, _v1.y, _v1.z, 0.05, _v2);
    fire('bullet', _v1, _v2, 360, 0.8);
    gunshot(_v1);
  }
}
function updateJet(u, dt) {
  u.x += u.vx * dt; u.z += u.vz * dt; u.life -= dt;
  u.g.position.set(u.x, u.y, u.z);
  u.g.rotation.set(0, Math.atan2(u.vx, u.vz), 0);
  if (Math.random() < 0.5) emit(smokePS, u.x - u.vx * 0.05, u.y, u.z - u.vz * 0.05, 0, 0, 0, 2.5, 3, 1.5, 0.92, 0.92, 0.92, 0.35, 0.2, 0);
  const d = Math.hypot(u.x - MON.x, u.z - MON.z);
  if (!u.fired && d < 520) {
    u.fired = true;
    for (let k = 0; k < 2; k++) {
      _v1.set(u.x + frand(-3, 3), u.y - 2, u.z + frand(-3, 3));
      aimAtMonster(_v1.x, _v1.y, _v1.z, 0.02, _v2);
      fire('missile', _v1, _v2, 165, 20);
    }
    rocketSound(_v1);
  }
  if (u.life <= 0) { u.alive = false; u.g.visible = false; }
}

// ---------- projectiles ----------
function fire(type, from, dir, speed, dmg) {
  PROJ.push({ type, x: from.x, y: from.y, z: from.z, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, dmg, life: type === 'bullet' ? 1.5 : 5, sp: speed, homing: type === 'rocket' ? 0.8 : type === 'missile' ? 1.6 : 0 });
}
function updateProjectiles(dt) {
  for (let i = PROJ.length - 1; i >= 0; i--) {
    const p = PROJ[i];
    p.life -= dt;
    if (p.homing && MON.on) {
      aimAtMonster(p.x, p.y, p.z, 0, _v1);
      const k = Math.min(1, p.homing * dt);
      _v2.set(p.vx, p.vy, p.vz).normalize().lerp(_v1, k).normalize().multiplyScalar(p.sp);
      p.vx = _v2.x; p.vy = _v2.y; p.vz = _v2.z;
    }
    const steps = p.type === 'bullet' ? 2 : 1;
    let done = false;
    for (let s = 0; s < steps && !done; s++) {
      p.x += p.vx * dt / steps; p.y += p.vy * dt / steps; p.z += p.vz * dt / steps;
      if (MON.on && !MON.dead && monsterCapsuleDist(p.x, p.y, p.z) < 0) {
        hurtMonster(p.dmg, null);
        if (p.type === 'bullet') sparkBurst(p.x, p.y, p.z, 2);
        else { explosionFx(p.x, p.y, p.z, p.type === 'shell' ? 1.6 : 1.3); boom(_v3.set(p.x, p.y, p.z), 0.6); }
        done = true;
      } else if (p.y < terrainH(p.x, p.z) || staticAt(p.x, p.y, p.z) >= 0) {
        if (p.type !== 'bullet') {
          explosionFx(p.x, p.y, p.z, 1.4); boom(_v3.set(p.x, p.y, p.z), 0.5);
          blocksInSphere(p.x, p.y, p.z, 5, (id) => damageBlock(id, 70, 0, 0, 0, true));
        } else sparkBurst(p.x, p.y, p.z, 1);
        done = true;
      }
    }
    if (done || p.life <= 0) { PROJ.splice(i, 1); continue; }
    if (p.type === 'bullet') emit(glowPS, p.x, p.y, p.z, 0, 0, 0, 0.9, 0, 0.05, 1, 0.9, 0.5, 1, 0, 0);
    else {
      emit(glowPS, p.x, p.y, p.z, 0, 0, 0, p.type === 'shell' ? 1.6 : 2, -1, 0.12, 1, 0.75, 0.35, 1, 0, 0);
      if (p.type !== 'shell') emit(smokePS, p.x, p.y, p.z, frand(-0.5, 0.5), frand(0, 1), frand(-0.5, 0.5), 1.5, 2.2, 1.6, 0.85, 0.85, 0.85, 0.45, 0.3, 0);
    }
  }
}
function updateThrown(dt) {
  for (let i = THROWN.length - 1; i >= 0; i--) {
    const b = THROWN[i];
    if (b.dead || !b.proj || b.age > 6) { THROWN.splice(i, 1); continue; }
    for (const u of UNITS) {
      if (!u.alive || (u.type !== 'heli' && u.type !== 'jet')) continue;
      if (Math.hypot(u.x - b.p.x, u.y - b.p.y, u.z - b.p.z) < 9 + b.r) { downAir(u, b.v.x * 0.3, b.v.z * 0.3); projectileImpact(b, b.proj); b.proj = null; break; }
    }
  }
}

// ---------- taking hits ----------
function wreckUnit(u, grab) {
  if (!u.alive) return null;
  u.alive = false;
  STATS.units++; STATS.money += u.type === 'tank' ? 8e6 : 60000;
  MON.rage = Math.min(100, MON.rage + (u.type === 'tank' ? 8 : 3));
  if (u.type === 'heli' || u.type === 'jet') { downAir(u, 0, 0); return null; }
  u.mesh.setMatrixAt(u.slot, ZERO_M);
  const pool = u.type === 'tank' ? tankWreckPool : wreckPool;
  const b = addBody(pool, u.x, 1.4, u.z, u.type === 'tank' ? 2.2 : 1, 1, u.type === 'tank' ? 3.6 : 2.3, { kind: 'car', life: 60, density: u.type === 'tank' ? 0.8 : 0.25 });
  if (!b) return null;
  b.s.set(1, 1, 1);
  b.q.setFromAxisAngle(UP, u.yaw);
  pool.mesh.setColorAt(b.slot, _col.setRGB(0.3, 0.3, 0.3)); pool.colDirty = true;
  if (!grab) { explosionFx(u.x, 2, u.z, u.type === 'tank' ? 2 : 1.2); boom(_v3.set(u.x, 2, u.z), u.type === 'tank' ? 0.9 : 0.5); }
  addEmitter({ kind: 'wreck', body: b, life: rr(12, 25), x: u.x, y: 1, z: u.z });
  return b;
}
function downAir(u, vx, vz) {
  if (u.falling) return;
  if (u.type === 'jet') {
    u.alive = false; u.g.visible = false;
    explosionFx(u.x, u.y, u.z, 4); boom(_v3.set(u.x, u.y, u.z), 1.4);
    for (let i = 0; i < 6; i++) spawnRock(u.x, u.y, u.z, rr(1, 2.4), u.vx * 0.4 + frand(-15, 15), frand(-5, 15), u.vz * 0.4 + frand(-15, 15), [0.4, 0.42, 0.44]);
    STATS.units++; STATS.money += 80e6;
    return;
  }
  if (u.alive) { STATS.units++; STATS.money += 25e6; }
  u.alive = false; u.falling = true;
  u.vx = vx + frand(-6, 6); u.vy = 4; u.vz = vz + frand(-6, 6);
  explosionFx(u.x, u.y, u.z, 2); boom(_v3.set(u.x, u.y, u.z), 0.9);
  MON.rage = Math.min(100, MON.rage + 10);
}
function hitUnits(x, y, z, r, dx, dz, force) {
  for (const u of UNITS) {
    if (!u.alive) continue;
    const uy = u.y || 1.5;
    if (Math.hypot(u.x - x, uy - y, u.z - z) > r + (u.type === 'heli' ? 7 : 3)) continue;
    if (u.type === 'heli' || u.type === 'jet') downAir(u, dx * force, dz * force);
    else {
      const b = wreckUnit(u, false);
      if (b) { b.v.set(dx * force * 1.2 + frand(-3, 3), force * 0.7 + 4, dz * force * 1.2 + frand(-3, 3)); b.w.set(frand(-3, 3), frand(-3, 3), frand(-3, 3)); }
    }
  }
}
function crushUnits(x, z, r, fling) {
  for (const u of UNITS) {
    if (!u.alive || u.type === 'heli' || u.type === 'jet') continue;
    const dx = u.x - x, dz = u.z - z, d = Math.hypot(dx, dz);
    if (d > r) continue;
    const b = wreckUnit(u, false);
    if (b) {
      if (fling) b.v.set(dx / (d + 1) * fling, fling * 0.6, dz / (d + 1) * fling);
      else { b.s.y = 0.4; b.h.y *= 0.4; b.p.y = 0.6; }
    }
  }
}
function stunUnits(x, z, r, t) {
  for (const u of UNITS) if (u.alive && Math.hypot(u.x - x, u.z - z) < r) u.stun = t;
}
function beamUnits(a, b) {
  _v4.copy(b).sub(a);
  const L2 = _v4.lengthSq();
  for (const u of UNITS) {
    if (!u.alive) continue;
    _v5.set(u.x - a.x, (u.y || 1.5) - a.y, u.z - a.z);
    const t = clamp(_v5.dot(_v4) / L2, 0, 1);
    _v5.set(a.x + _v4.x * t - u.x, a.y + _v4.y * t - (u.y || 1.5), a.z + _v4.z * t - u.z);
    if (_v5.length() < (u.type === 'heli' || u.type === 'jet' ? 10 : 6)) {
      if (u.type === 'heli' || u.type === 'jet') downAir(u, 0, 0); else wreckUnit(u, false);
    }
  }
}
