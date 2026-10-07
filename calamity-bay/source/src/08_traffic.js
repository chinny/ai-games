// Calamity Bay — cars on the road grid, pedestrians on the sidewalks, panic and crushing

const CARS = [], PPL = [];
let carMesh, wreckPool, pplMesh;
const CAR_COLS = [[0.8, 0.12, 0.1], [0.95, 0.95, 0.93], [0.12, 0.13, 0.15], [0.2, 0.35, 0.7], [0.6, 0.62, 0.64], [0.95, 0.75, 0.15], [0.15, 0.45, 0.3], [0.55, 0.15, 0.2], [0.85, 0.85, 0.8]];
const CAR_N = isTouch ? 160 : 280, PPL_N = isTouch ? 500 : 1000;
const BUS_SCALE = new V3(1.15, 1.45, 2.5);

function carGeometry(police) {
  const parts = [
    { geo: new THREE.BoxGeometry(2, 0.9, 4.6), p: [0, 0.8, 0], c: [1, 1, 1] },
    { geo: new THREE.BoxGeometry(1.72, 0.72, 2.3), p: [0, 1.6, -0.25], c: [0.22, 0.26, 0.3] },
  ];
  for (const sx of [-1, 1]) for (const sz of [-1.45, 1.45]) parts.push({ geo: new THREE.CylinderGeometry(0.42, 0.42, 0.35, 8), p: [sx * 0.95, 0.42, sz], r: [0, 0, Math.PI / 2], c: [0.08, 0.08, 0.08] });
  if (police) {
    parts.push({ geo: new THREE.BoxGeometry(1.4, 0.22, 0.4), p: [-0.36, 2.06, -0.25], s: [0.5, 1, 1], c: [1.6, 0.1, 0.1] });
    parts.push({ geo: new THREE.BoxGeometry(1.4, 0.22, 0.4), p: [0.36, 2.06, -0.25], s: [0.5, 1, 1], c: [0.1, 0.2, 1.6] });
  }
  return mergeParts(parts);
}
function personGeometry() {
  return mergeParts([
    { geo: new THREE.BoxGeometry(0.55, 1.0, 0.34), p: [0, 0.5, 0], c: [0.22, 0.22, 0.28] },
    { geo: new THREE.BoxGeometry(0.75, 0.95, 0.42), p: [0, 1.45, 0], c: [1, 1, 1] },
    { geo: new THREE.BoxGeometry(0.42, 0.42, 0.42), p: [0, 2.15, 0], c: [0.95, 0.78, 0.62] },
  ]);
}

function initTraffic() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const cg = carGeometry(false);
  carMesh = new THREE.InstancedMesh(cg, mat, CAR_N);
  carMesh.frustumCulled = false; carMesh.castShadow = true;
  wreckPool = makePool(cg, mat, 220, false);
  for (let i = 0; i < CAR_N; i++) { carMesh.setColorAt(i, _col.setRGB(1, 1, 1)); carMesh.setMatrixAt(i, ZERO_M); }
  scene.add(carMesh);
  for (let i = 0; i < CAR_N; i++) { const c = { slot: i, alive: false }; CARS.push(c); spawnCar(c, true); }
  pplMesh = new THREE.InstancedMesh(personGeometry(), mat, PPL_N);
  pplMesh.frustumCulled = false;
  for (let i = 0; i < PPL_N; i++) {
    const p = { slot: i, alive: false, x: 0, z: 0 };
    PPL.push(p);
    const c = pick(CAR_COLS);
    pplMesh.setColorAt(i, _col.setRGB(c[0] * 0.9 + 0.1, c[1] * 0.9 + 0.1, c[2] * 0.9 + 0.1));
    spawnWalker(p, null);
  }
  scene.add(pplMesh);
}

// ---------- cars ----------
function carPos(c) {
  if (c.axis === 0) { c.tx = c.s; c.tz = roadPos(c.line) + c.dir * LANE; }
  else { c.tx = roadPos(c.line) - c.dir * LANE; c.tz = c.s; }
}
function nextRoad(c) {
  const u = (c.s - R0) / BLK;
  c.nk = c.dir > 0 ? Math.floor(u + 1e-6) + 1 : Math.ceil(u - 1e-6) - 1;
}
function spawnCar(c, anywhere) {
  for (let t = 0; t < 30; t++) {
    c.axis = rand() < 0.5 ? 0 : 1; c.line = ri(0, NROAD - 1); c.dir = rand() < 0.5 ? 1 : -1;
    const seg = ri(0, NROAD - 2);
    c.s = roadPos(seg) + rr(15, BLK - 15);
    carPos(c);
    if (anywhere || !MON.on || Math.hypot(c.tx - MON.x, c.tz - MON.z) > 350) break;
  }
  nextRoad(c);
  c.kind = rand() < 0.08 ? 1 : 0;
  c.vmax = c.kind ? rr(9, 12) : rr(12, 17); c.speed = c.vmax * 0.5;
  c.alive = true; c.panic = false; c.stuck = 0; c.honk = rr(5, 30);
  c.x = c.tx; c.z = c.tz; c.yaw = c.axis === 0 ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
  const col = c.kind ? (rand() < 0.5 ? [0.95, 0.75, 0.15] : [0.9, 0.9, 0.88]) : pick(CAR_COLS);
  c.col = col;
  carMesh.setColorAt(c.slot, _col.setRGB(...col));
  if (carMesh.instanceColor) carMesh.instanceColor.needsUpdate = true;
}
function chooseTurn(c) {
  const k = c.nk, opts = [];
  if (k > 0 && k < NROAD - 1) opts.push({ axis: c.axis, line: c.line, dir: c.dir, w: c.panic ? 1 : 3 });
  if (c.line < NROAD - 1) opts.push({ axis: 1 - c.axis, line: k, dir: 1, w: 1 });
  if (c.line > 0) opts.push({ axis: 1 - c.axis, line: k, dir: -1, w: 1 });
  let o = null;
  if (c.panic && MON.on) {
    let best = -1e9;
    for (const q of opts) {
      const fx = q.axis === 0 ? q.dir : 0, fz = q.axis === 1 ? q.dir : 0;
      const sc = fx * (c.tx - MON.x) + fz * (c.tz - MON.z) + Math.random() * 30;
      if (sc > best) { best = sc; o = q; }
    }
  } else {
    let tot = 0; for (const q of opts) tot += q.w;
    let r = Math.random() * tot;
    for (const q of opts) { r -= q.w; if (r <= 0) { o = q; break; } }
  }
  if (!o) o = opts[0];
  if (o.axis !== c.axis) { c.s = roadPos(c.line); c.axis = o.axis; c.line = o.line; }
  c.dir = o.dir;
  c.s += c.dir * 0.01;
  nextRoad(c);
}
function updateCars(dt) {
  // leader following within each lane
  const lanes = new Map();
  for (const c of CARS) {
    if (!c.alive) continue;
    const key = c.axis * 1000 + c.line * 10 + (c.dir > 0 ? 1 : 0);
    let l = lanes.get(key); if (!l) lanes.set(key, l = []);
    l.push(c);
  }
  for (const l of lanes.values()) {
    l.sort((a, b) => (a.s - b.s) * a.dir);
    for (let i = 0; i < l.length; i++) l[i].gap = i < l.length - 1 ? (l[i + 1].s - l[i].s) * l[i].dir : 999;
  }
  const mx = MON.x, mz = MON.z;
  let honks = 0;
  for (const c of CARS) {
    if (!c.alive) continue;
    const dm = MON.on ? Math.hypot(c.x - mx, c.z - mz) : 1e9;
    c.panic = dm < 170 || (c.panic && dm < 260);
    let want = c.panic ? c.vmax * 1.8 : c.vmax;
    if (c.gap < 9) want = 0; else if (c.gap < 18) want = Math.min(want, (c.gap - 9) * 2);
    // rubble or a building in the way
    const fx = c.axis === 0 ? c.dir : 0, fz = c.axis === 1 ? c.dir : 0;
    let blocked = false;
    bodiesNear(c.tx + fx * 4, 1.5, c.tz + fz * 4, 1.5, (b) => { if (b.m > 30 && b.p.y - b.h.y < 2.5) blocked = true; });
    if (blocked) { want = 0; c.stuck += dt; if (c.stuck > 1.6) { c.dir = -c.dir; c.stuck = 0; nextRoad(c); } }
    else c.stuck = Math.max(0, c.stuck - dt);
    c.speed += clamp(want - c.speed, -30 * dt, 10 * dt);
    c.s += c.speed * c.dir * dt;
    if ((roadPos(c.nk) - c.s) * c.dir <= 0) {
      if (c.nk < 0 || c.nk > NROAD - 1) { c.dir = -c.dir; nextRoad(c); }
      else chooseTurn(c);
    }
    carPos(c);
    const k = 1 - Math.exp(-8 * dt);
    c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k;
    const yaw = c.axis === 0 ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
    c.yaw += angWrap(yaw - c.yaw) * Math.min(1, dt * 7);
    _m4.compose(_v1.set(c.x, 0, c.z), _q1.setFromAxisAngle(UP, c.yaw), c.kind ? BUS_SCALE : _v2.set(1, 1, 1));
    carMesh.setMatrixAt(c.slot, _m4);
    if (c.panic && c.speed < 2) { c.honk -= dt; if (c.honk < 0 && honks < 2) { c.honk = rr(1, 4); honks++; hornSound(_v3.set(c.x, 1, c.z)); } }
  }
  carMesh.instanceMatrix.needsUpdate = true;
}
function wreckCar(c, vx, vy, vz, flat) {
  if (!c.alive) return null;
  c.alive = false;
  carMesh.setMatrixAt(c.slot, ZERO_M);
  STATS.cars++; STATS.money += c.kind ? 450000 : 35000;
  const sc = c.kind ? BUS_SCALE : _v2.set(1, 1, 1);
  const b = addBody(wreckPool, c.x, 1.2 * sc.y, c.z, 1.0 * sc.x, 0.9 * sc.y, 2.3 * sc.z, { kind: 'car', life: 50, density: 0.25 });
  respawnLater(c);
  if (!b) return null;
  b.q.setFromAxisAngle(UP, c.yaw);
  b.s.set(sc.x, sc.y * (flat ? 0.35 : 1), sc.z);
  if (flat) { b.h.y *= 0.35; b.p.y = 0.4; }
  b.v.set(vx, vy, vz);
  b.w.set(frand(-2, 2), frand(-2, 2), frand(-2, 2)).multiplyScalar(Math.min(1, (Math.abs(vx) + Math.abs(vy) + Math.abs(vz)) / 10));
  wreckPool.mesh.setColorAt(b.slot, _col.setRGB(c.col[0] * 0.45, c.col[1] * 0.45, c.col[2] * 0.45)); wreckPool.colDirty = true;
  if (Math.random() < 0.55) {
    addEmitter({ kind: 'wreck', body: b, life: rr(10, 25), x: b.p.x, y: b.p.y, z: b.p.z });
    if (Math.random() < 0.5) setTimeout(() => { if (!b.dead) { explosionFx(b.p.x, b.p.y + 1, b.p.z, 1.3); boom(b.p, 0.5); wakeBody(b); b.v.y += 9; } }, rr(400, 4000));
  }
  return b;
}
function respawnLater(c) { setTimeout(() => { if (state !== 'title') spawnCar(c, false); }, rr(6000, 16000)); }

// ---------- people ----------
function spawnWalker(p, near) {
  for (let t = 0; t < 40; t++) {
    p.axis = rand() < 0.5 ? 0 : 1; p.line = ri(0, NROAD - 1); p.side = rand() < 0.5 ? 1 : -1;
    p.s = rr(R0 + 5, -R0 - 5);
    if (p.axis === 0) { p.x = p.s; p.z = roadPos(p.line) + p.side * WALK_OFF; }
    else { p.x = roadPos(p.line) + p.side * WALK_OFF; p.z = p.s; }
    if (!near || !MON.on || Math.hypot(p.x - MON.x, p.z - MON.z) > 300) break;
  }
  p.dir = rand() < 0.5 ? 1 : -1; p.speed = rr(1.2, 1.8); p.flee = false; p.alive = true; p.ph = rr(0, TAU); p.yaw = 0;
}
function spawnPanic(b) {
  if (!MON.on) return;
  let n = Math.min(14, 3 + Math.floor(b.vol / 4000));
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  for (const p of PPL) {
    if (n <= 0) break;
    if (p.alive && Math.hypot(p.x - MON.x, p.z - MON.z) < 500) continue;
    const side = Math.floor(Math.random() * 4), u = Math.random();
    p.x = side < 2 ? lerp(b.x0, b.x1, u) : side === 2 ? b.x0 - 1.5 : b.x1 + 1.5;
    p.z = side >= 2 ? lerp(b.z0, b.z1, u) : side === 0 ? b.z0 - 1.5 : b.z1 + 1.5;
    p.alive = true; p.flee = true; p.speed = rr(5, 7.5); p.ph = rr(0, TAU);
    p.fx = p.x - cx; p.fz = p.z - cz;
    n--;
  }
}
function updatePeople(dt) {
  const mx = MON.x, mz = MON.z;
  let near = 0;
  for (const p of PPL) {
    if (!p.alive) continue;
    const dx = p.x - mx, dz = p.z - mz, dm = MON.on ? Math.hypot(dx, dz) : 1e9;
    if (dm < 180 && !p.flee) { p.flee = true; p.speed = rr(5, 7.5); p.fx = dx; p.fz = dz; }
    if (p.flee) {
      if (dm < 300) near++;
      // run away from the monster, sliding around buildings
      const l = Math.hypot(p.fx, p.fz) || 1;
      let ax = p.fx / l * 0.8 + (dm < 400 ? dx / dm : 0) * 0.6, az = p.fz / l * 0.8 + (dm < 400 ? dz / dm : 0) * 0.6;
      const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
      let nx = p.x + ax * p.speed * dt, nz = p.z + az * p.speed * dt;
      if (staticAt(nx + ax * 1.5, 1, nz + az * 1.5) >= 0 || !inCity(nx, nz)) {
        const rot = Math.random() < 0.5 ? 1 : -1;
        p.fx = -az * rot + ax * 0.2; p.fz = ax * rot + az * 0.2;
        nx = p.x; nz = p.z;
      } else { p.fx = ax; p.fz = az; }
      p.x = clamp(nx, -CITY_HALF + 2, CITY_HALF - 2); p.z = clamp(nz, -CITY_HALF + 2, 524);
      p.yaw = Math.atan2(ax, az);
      if (dm > 420) {
        // calm down onto the nearest sidewalk
        p.flee = false; p.speed = rr(1.2, 1.8);
        const ix = Math.round((p.x - R0) / BLK), iz = Math.round((p.z - R0) / BLK);
        const ox = p.x - roadPos(clamp(ix, 0, 9)), oz = p.z - roadPos(clamp(iz, 0, 9));
        if (Math.abs(ox) < Math.abs(oz)) { p.axis = 1; p.line = clamp(ix, 0, 9); p.side = ox >= 0 ? 1 : -1; p.s = p.z; }
        else { p.axis = 0; p.line = clamp(iz, 0, 9); p.side = oz >= 0 ? 1 : -1; p.s = p.x; }
        p.dir = Math.random() < 0.5 ? 1 : -1;
      }
    } else {
      p.s += p.dir * p.speed * dt;
      if (Math.abs(p.s) > -R0 + 8) p.dir = -p.dir;
      const tx = p.axis === 0 ? p.s : roadPos(p.line) + p.side * WALK_OFF;
      const tz = p.axis === 0 ? roadPos(p.line) + p.side * WALK_OFF : p.s;
      p.x += (tx - p.x) * Math.min(1, dt * 2); p.z += (tz - p.z) * Math.min(1, dt * 2);
      p.yaw = p.axis === 0 ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
      if (Math.random() < dt * 0.02) p.dir = -p.dir;
    }
    p.ph += dt * p.speed * 3;
    _m4.compose(_v1.set(p.x, Math.abs(Math.sin(p.ph)) * 0.25 * (p.flee ? 1.5 : 1), p.z), _q1.setFromAxisAngle(UP, p.yaw), _v2.set(1, 1, 1));
    pplMesh.setMatrixAt(p.slot, _m4);
  }
  pplMesh.instanceMatrix.needsUpdate = true;
  if (AC) aSet(loops.crowd.g.gain, clamp(near / 60, 0, 1) * 0.12, 0.5);
}
function killPerson(p) {
  p.alive = false;
  pplMesh.setMatrixAt(p.slot, ZERO_M);
  STATS.people++;
  setTimeout(() => { if (state !== 'title') spawnWalker(p, true); }, rr(8000, 20000));
}

// ---------- spatial hash of agents for crush tests ----------
const AG = new Map();
const agKey = (x, z) => ((Math.floor(x / 16) + 300) << 10) | (Math.floor(z / 16) + 300);
function rebuildAgents() {
  AG.clear();
  const add = (x, z, o) => { const k = agKey(x, z); let l = AG.get(k); if (!l) AG.set(k, l = []); l.push(o); };
  for (const c of CARS) if (c.alive) add(c.x, c.z, c);
  for (const p of PPL) if (p.alive) add(p.x, p.z, p);
}
// Something big came down at (x,z): crush cars, people, trees and ground units underneath.
function crushAt(x, z, r, src, fling) {
  const x0 = Math.floor((x - r) / 16), x1 = Math.floor((x + r) / 16), z0 = Math.floor((z - r) / 16), z1 = Math.floor((z + r) / 16);
  let n = 0;
  for (let a = x0; a <= x1; a++) for (let c = z0; c <= z1; c++) {
    const l = AG.get(((a + 300) << 10) | (c + 300));
    if (!l) continue;
    for (const o of l) {
      if (!o.alive) continue;
      const dx = o.x - x, dz = o.z - z;
      if (dx * dx + dz * dz > r * r) continue;
      if (o.vmax !== undefined) {
        if (fling) { const d = Math.hypot(dx, dz) || 1; wreckCar(o, dx / d * fling + frand(-2, 2), fling * 0.6 + frand(0, 4), dz / d * fling + frand(-2, 2), false); }
        else wreckCar(o, 0, 0, 0, true);
      } else {
        killPerson(o);
        if (Math.random() < 0.3) dustAt(o.x, 1, o.z, 1.5, 1);
      }
      n++;
    }
  }
  crushTrees(x, z, r, fling ? _v4.set(0, 0, 0) : null);
  crushUnits(x, z, r, fling);
  return n;
}
function agentsNear(x, z, r, fn) {
  const x0 = Math.floor((x - r) / 16), x1 = Math.floor((x + r) / 16), z0 = Math.floor((z - r) / 16), z1 = Math.floor((z + r) / 16);
  for (let a = x0; a <= x1; a++) for (let c = z0; c <= z1; c++) {
    const l = AG.get(((a + 300) << 10) | (c + 300));
    if (l) for (const o of l) if (o.alive && Math.hypot(o.x - x, o.z - z) < r) fn(o);
  }
}
