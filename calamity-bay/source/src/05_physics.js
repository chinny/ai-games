// Calamity Bay — rigid-body debris: box bodies with impulse contacts, toppling sections, instanced pools

const G = 16;
const bodies = [];
const BODY_FREE = [];
const POOLS = [];
let blockPool, roofPool, rockPool;

function makePool(geo, mat, cap, withInfo, shadow = true) {
  const g = geo.clone();
  let info = null;
  if (withInfo) { info = new Float32Array(cap * 4); g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4)); }
  const mesh = new THREE.InstancedMesh(g, mat, cap);
  mesh.frustumCulled = false; mesh.castShadow = shadow; mesh.receiveShadow = true;
  const c = new THREE.Color(1, 1, 1);
  for (let i = 0; i < cap; i++) { mesh.setMatrixAt(i, ZERO_M); mesh.setColorAt(i, c); }
  scene.add(mesh);
  const free = [];
  for (let i = cap - 1; i >= 0; i--) free.push(i);
  const pool = { mesh, info, cap, free, owner: new Array(cap).fill(null), dirty: true, colDirty: true, infoDirty: true };
  POOLS.push(pool);
  return pool;
}
function initPools() {
  blockPool = makePool(new THREE.BoxGeometry(1, 1, 1), buildMat, isTouch ? 2200 : 4000, true);
  const rg = ROOF_GEO.clone(); rg.translate(0, -0.5, 0);
  roofPool = makePool(rg, roofMesh.material, 500, false);
  rockPool = makePool(flatGeo(new THREE.DodecahedronGeometry(0.62, 0)), new THREE.MeshLambertMaterial({ color: 0xffffff }), 400, false);
}
function poolAlloc(pool) {
  if (pool.free.length) return pool.free.pop();
  // recycle the oldest resting body in this pool
  let best = null;
  for (const b of pool.owner) if (b && !b.held && !b.members && (!best || (b.asleep && !best.asleep) || (b.asleep === best.asleep && b.born < best.born))) best = b;
  if (!best) return -1;
  const slot = best.slot;
  best.slot = -1;
  killBody(best);
  return slot;
}
function trimPool(pool) {
  if (pool.free.length > pool.cap * 0.08) return;
  let n = 0;
  for (const b of pool.owner) {
    if (b && b.asleep && !b.held && !b.members && b.fade === 0 && b.age > 8) { b.fade = 0.001; FADING.push(b); if (++n > 40) break; }
  }
}
const FADING = [];
function poolRelease(pool, slot) {
  if (slot < 0) return;
  pool.owner[slot] = null;
  pool.mesh.setMatrixAt(slot, ZERO_M);
  pool.free.push(slot); pool.dirty = true;
}

let bornN = 0;
function getBody() {
  return BODY_FREE.pop() || { p: new V3(), v: new V3(), q: new THREE.Quaternion(), w: new V3(), h: new V3(), s: new V3(), invI: new V3() };
}
function addBody(pool, x, y, z, hx, hy, hz, o = {}) {
  const slot = pool ? poolAlloc(pool) : -1;
  if (pool && slot < 0) return null;
  const b = getBody();
  b.pool = pool; b.slot = slot; b.p.set(x, y, z); b.v.set(0, 0, 0); b.q.identity(); b.w.set(0, 0, 0);
  b.h.set(hx, hy, hz); b.s.set(hx * 2, hy * 2, hz * 2);
  b.m = Math.max(0.5, 8 * hx * hy * hz * (o.density || 1));
  setInertia(b);
  b.r = Math.min((hx + hy + hz) / 3, Math.max(hx, hy, hz) * 0.75);
  b.sleep = 0; b.asleep = false; b.age = 0; b.life = o.life || 0; b.kind = o.kind || 'block';
  b.proj = null; b.held = false; b.fxT = 0; b.dead = false; b.members = null; b.hinge = null; b.wet = false;
  b.e = o.e !== undefined ? o.e : 0.15; b.mu = 0.6; b.born = bornN++; b.onLand = o.onLand || null; b.fade = 0; b.burn = 0; b.awake = 0;
  if (pool) pool.owner[slot] = b;
  bodies.push(b);
  return b;
}
function setInertia(b) {
  const { x, y, z } = b.h, m = b.m;
  b.invI.set(3 / (m * (y * y + z * z)), 3 / (m * (x * x + z * z)), 3 / (m * (x * x + y * y)));
}
function killBody(b) {
  if (b.dead) return;
  b.dead = true;
  if (b.members) for (const mb of b.members) poolRelease(blockPool, mb.slot);
  else if (b.pool) poolRelease(b.pool, b.slot);
  b.members = null;
}
function wakeBody(b) { if (b.asleep) { b.asleep = false; b.sleep = 0; b.awake = 0; } }

// ---------- spawners ----------
function spawnBlockBody(B, off, h, vx, vy, vz, life) {
  const s = 0.94;
  const b = addBody(blockPool, B.x + off[0], B.y + off[1], B.z + off[2], h[0] * s, h[1] * s, h[2] * s, { life, kind: 'block' });
  if (!b) return null;
  b.v.set(vx, vy, vz);
  const spin = 1.2 / Math.sqrt(Math.max(1, b.r));
  b.w.set(frand(-spin, spin), frand(-spin, spin), frand(-spin, spin));
  setBlockLook(b.slot, B, off);
  return b;
}
function setBlockLook(slot, B, off) {
  const dmg = clamp(1 - B.hp / B.max, 0, 1) * 0.5 + 0.15;
  blockPool.info.set([B.info[0] + off[0], B.info[1] + off[1], B.info[2] + off[2], B.info[3] + dmg], slot * 4);
  blockPool.mesh.setColorAt(slot, _col.setRGB(B.col[0], B.col[1], B.col[2]));
  blockPool.infoDirty = blockPool.colDirty = true;
}
const _col = new THREE.Color();
function spawnRoof(r) {
  const b = addBody(roofPool, r.x, r.y + r.h / 2, r.z, r.w / 2, r.h / 2, r.d / 2, { kind: 'roof', life: 45, density: 0.3 });
  if (!b) return;
  b.q.setFromAxisAngle(UP, r.rot);
  b.v.set(frand(-3, 3), frand(3, 8), frand(-3, 3));
  b.w.set(frand(-1, 1), frand(-0.5, 0.5), frand(-1, 1));
  roofPool.mesh.setColorAt(b.slot, _col.setRGB(...r.col)); roofPool.colDirty = true;
}
function spawnRock(x, y, z, size, vx, vy, vz, col) {
  const b = addBody(rockPool, x, y, z, size * 0.5, size * 0.5, size * 0.5, { kind: 'rock', life: 60, e: 0.25 });
  if (!b) return null;
  b.s.set(size * 1.6, size * 1.6, size * 1.6);
  b.v.set(vx, vy, vz); b.w.set(frand(-2, 2), frand(-2, 2), frand(-2, 2));
  const j = 0.85 + Math.random() * 0.3;
  rockPool.mesh.setColorAt(b.slot, _col.setRGB((col ? col[0] : 0.5) * j, (col ? col[1] : 0.47) * j, (col ? col[2] : 0.43) * j)); rockPool.colDirty = true;
  return b;
}

// A whole section of building that falls as one rigid piece, optionally hinging over its base edge first.
function spawnCompound(ids, dir, tip) {
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (const id of ids) {
    const B = BLK_[id];
    x0 = Math.min(x0, B.x - B.hx); x1 = Math.max(x1, B.x + B.hx);
    y0 = Math.min(y0, B.y - B.hy); y1 = Math.max(y1, B.y + B.hy);
    z0 = Math.min(z0, B.z - B.hz); z1 = Math.max(z1, B.z + B.hz);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const b = addBody(null, cx, cy, cz, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, { kind: 'compound', density: 0.6 });
  b.members = [];
  for (const id of ids) {
    const B = BLK_[id];
    const slot = poolAlloc(blockPool);
    if (slot < 0) { spawnBlockBody(B, [0, 0, 0], [B.hx, B.hy, B.hz], 0, 0, 0, 0); continue; }
    blockPool.owner[slot] = b;
    setBlockLook(slot, B, [0, 0, 0]);
    b.members.push({ slot, off: new V3(B.x - cx, B.y - cy, B.z - cz), h: new V3(B.hx * 0.96, B.hy * 0.96, B.hz * 0.96), B });
  }
  if (tip > 0.2 && b.h.y > Math.max(b.h.x, b.h.z) * 0.6) {
    const axis = new V3().crossVectors(UP, dir).normalize();
    b.hinge = {
      pivot: new V3(cx + dir.x * b.h.x, y0, cz + dir.z * b.h.z), axis, ang: 0, av: tip * 0.6,
      q0: b.q.clone(), p0: b.p.clone(), L: Math.max(8, b.h.y * 2),
    };
  } else {
    b.v.set(dir.x * 2, -1, dir.z * 2);
    b.w.copy(dir).cross(UP).multiplyScalar(-tip);
  }
  b.lat = latticeFor(b.h);
  return b;
}
function latticeFor(h) {
  const n = [h.x, h.y, h.z].map((v) => clamp(Math.round((v * 2) / 9), 1, 6));
  const pts = [];
  for (let a = 0; a <= n[0]; a++) for (let c = 0; c <= n[1]; c++) for (let e = 0; e <= n[2]; e++)
    pts.push(new V3((a / n[0] * 2 - 1) * h.x, (c / n[1] * 2 - 1) * h.y, (e / n[2] * 2 - 1) * h.z));
  return pts;
}
function breakCompound(b) {
  const r = new V3();
  for (const mb of b.members) {
    const nb = getBody();
    r.copy(mb.off).applyQuaternion(b.q);
    nb.pool = blockPool; nb.slot = mb.slot; blockPool.owner[mb.slot] = nb;
    nb.p.copy(b.p).add(r); nb.q.copy(b.q);
    nb.v.copy(b.w).cross(r).add(b.v);
    nb.v.x += frand(-1.5, 1.5); nb.v.z += frand(-1.5, 1.5);
    nb.w.copy(b.w).multiplyScalar(0.6); nb.w.x += frand(-0.6, 0.6); nb.w.z += frand(-0.6, 0.6);
    nb.h.copy(mb.h); nb.s.copy(mb.h).multiplyScalar(2);
    nb.m = 8 * nb.h.x * nb.h.y * nb.h.z; setInertia(nb);
    nb.r = Math.min((nb.h.x + nb.h.y + nb.h.z) / 3, Math.max(nb.h.x, nb.h.y, nb.h.z) * 0.75);
    Object.assign(nb, { awake: 0, sleep: 0, asleep: false, age: 0, life: 0, kind: 'block', proj: null, held: false, fxT: 0, dead: false, members: null, hinge: null, wet: false, e: 0.12, mu: 0.6, born: bornN++, onLand: null, fade: 0, burn: 0 });
    bodies.push(nb);
  }
  b.members = null; b.dead = true;
  dustAt(b.p.x, Math.max(2, b.p.y - b.h.y), b.p.z, Math.max(b.h.x, b.h.z) * 2.2, 10);
  boom(b.p, 0.9, 'crash');
  addShake(0.5, b.p);
}

// ---------- integration ----------
const pr = new V3(), pn = new V3(), pt1 = new V3(), pt2 = new V3(), pt3 = new V3(), pq = new THREE.Quaternion();
// Rotation matrix of the body being stepped (column-major), so contacts avoid quaternion maths.
const RM = new Float64Array(9);
function rotOf(q) {
  const x = q.x, y = q.y, z = q.z, w = q.w, x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  RM[0] = 1 - (yy + zz); RM[3] = xy - wz; RM[6] = xz + wy;
  RM[1] = xy + wz; RM[4] = 1 - (xx + zz); RM[7] = yz - wx;
  RM[2] = xz - wy; RM[5] = yz + wx; RM[8] = 1 - (xx + yy);
}
function applyInvI(b, v) {
  const lx = (RM[0] * v.x + RM[1] * v.y + RM[2] * v.z) * b.invI.x;
  const ly = (RM[3] * v.x + RM[4] * v.y + RM[5] * v.z) * b.invI.y;
  const lz = (RM[6] * v.x + RM[7] * v.y + RM[8] * v.z) * b.invI.z;
  v.x = RM[0] * lx + RM[3] * ly + RM[6] * lz;
  v.y = RM[1] * lx + RM[4] * ly + RM[7] * lz;
  v.z = RM[2] * lx + RM[5] * ly + RM[8] * lz;
  return v;
}
function applyImpulse(b, jx, jy, jz, rx, ry, rz) {
  b.v.x += jx / b.m; b.v.y += jy / b.m; b.v.z += jz / b.m;
  pt3.set(ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx);
  applyInvI(b, pt3);
  b.w.add(pt3);
}
function contact(b, rx, ry, rz, nx, ny, nz) {
  const v = b.v, w = b.w;
  const vpx = v.x + (w.y * rz - w.z * ry), vpy = v.y + (w.z * rx - w.x * rz), vpz = v.z + (w.x * ry - w.y * rx);
  const vn = vpx * nx + vpy * ny + vpz * nz;
  if (vn >= 0) return 0;
  pt1.set(ry * nz - rz * ny, rz * nx - rx * nz, rx * ny - ry * nx); applyInvI(b, pt1);
  pt2.set(pt1.y * rz - pt1.z * ry, pt1.z * rx - pt1.x * rz, pt1.x * ry - pt1.y * rx);
  const k = 1 / b.m + pt2.x * nx + pt2.y * ny + pt2.z * nz;
  const j = -(1 + (vn < -2 ? b.e : 0)) * vn / k;
  applyImpulse(b, nx * j, ny * j, nz * j, rx, ry, rz);
  const tx = vpx - vn * nx, ty = vpy - vn * ny, tz = vpz - vn * nz, tl = Math.hypot(tx, ty, tz);
  if (tl > 1e-4) {
    const ux = tx / tl, uy = ty / tl, uz = tz / tl;
    pt1.set(ry * uz - rz * uy, rz * ux - rx * uz, rx * uy - ry * ux); applyInvI(b, pt1);
    pt2.set(pt1.y * rz - pt1.z * ry, pt1.z * rx - pt1.x * rz, pt1.x * ry - pt1.y * rx);
    const kt = 1 / b.m + pt2.x * ux + pt2.y * uy + pt2.z * uz;
    const jt = Math.min(tl / kt, b.mu * j);
    applyImpulse(b, -ux * jt, -uy * jt, -uz * jt, rx, ry, rz);
  }
  return -vn;
}
// Normal for a point inside a static block: the shallowest face that isn't buried in a neighbour.
function staticNormal(id, x, y, z, out) {
  const B = BLK_[id];
  const dx = x - B.x, dy = y - B.y, dz = z - B.z;
  const c = [[B.hx - Math.abs(dx), Math.sign(dx) || 1, 0], [B.hy - Math.abs(dy), Math.sign(dy) || 1, 1], [B.hz - Math.abs(dz), Math.sign(dz) || 1, 2]];
  c.sort((a, b) => a[0] - b[0]);
  for (const [pen, s, ax] of c) {
    const nx = ax === 0 ? s : 0, ny = ax === 1 ? s : 0, nz = ax === 2 ? s : 0;
    if (staticAt(B.x + nx * (B.hx * 2 + 0.1), B.y + ny * (B.hy * 2 + 0.1), B.z + nz * (B.hz * 2 + 0.1)) >= 0) continue;
    out.set(nx, ny, nz);
    return pen;
  }
  out.set(0, 1, 0);
  return B.hy - dy;
}

// Broadphase: a flat grid of 8-unit cells with linked lists, rebuilt each step.
const GC = 8, GN = 256, GOFF = 128;
const GHEAD = new Int32Array(GN * GN).fill(-1);
let GNEXT = new Int32Array(8192), GX = new Float32Array(8192), GY = new Float32Array(8192), GZ = new Float32Array(8192), GR = new Float32Array(8192);
const GB = [];
let gCount = 0, maxR = 1;
const gcell = (v) => { const c = Math.floor(v / GC) + GOFF; return c < 0 ? 0 : c >= GN ? GN - 1 : c; };
function ensureGrid(k) {
  if (k < GNEXT.length) return;
  const n = GNEXT.length * 2, grow = (A, T) => { const B = new T(n); B.set(A); return B; };
  GNEXT = grow(GNEXT, Int32Array); GX = grow(GX, Float32Array); GY = grow(GY, Float32Array); GZ = grow(GZ, Float32Array); GR = grow(GR, Float32Array);
}
function rebuildGrid() {
  GHEAD.fill(-1);
  gCount = 0; maxR = 4;
  for (const b of bodies) {
    if (b.dead || b.held || b.members) continue;
    const i = gCount++;
    ensureGrid(i);
    GB[i] = b; GX[i] = b.p.x; GY[i] = b.p.y; GZ[i] = b.p.z; GR[i] = b.r;
    if (b.r <= 4) {
      const c = gcell(b.p.z) * GN + gcell(b.p.x);
      GNEXT[i] = GHEAD[c]; GHEAD[c] = i;
    } else {
      // large pieces: one grid entry per overlapped cell (extra entries share the same data)
      const ax0 = gcell(b.p.x - b.r + 4), ax1 = gcell(b.p.x + b.r - 4), az0 = gcell(b.p.z - b.r + 4), az1 = gcell(b.p.z + b.r - 4);
      let first = true;
      for (let cz = az0; cz <= az1; cz++) for (let cx = ax0; cx <= ax1; cx++) {
        let k = i;
        if (!first) { k = gCount++; ensureGrid(k); GB[k] = b; GX[k] = GX[i]; GY[k] = GY[i]; GZ[k] = GZ[i]; GR[k] = GR[i]; }
        first = false;
        const c = cz * GN + cx;
        GNEXT[k] = GHEAD[c]; GHEAD[c] = k;
      }
    }
  }
  GB.length = gCount;
}
let nearStamp = 0;
function bodiesNear(x, y, z, r, fn) {
  const R = r + maxR, st = ++nearStamp;
  const x0 = gcell(x - R), x1 = gcell(x + R), z0 = gcell(z - R), z1 = gcell(z + R);
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    for (let i = GHEAD[cz * GN + cx]; i >= 0; i = GNEXT[i]) {
      const dx = GX[i] - x, dy = GY[i] - y, dz = GZ[i] - z, rr2 = r + GR[i];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rr2 * rr2) continue;
      const b = GB[i];
      if (b.dead || b._ns === st) continue;
      b._ns = st;
      fn(b, Math.sqrt(d2));
    }
  }
}
function wakeNear(x, y, z, r) { bodiesNear(x, y, z, r, (b) => wakeBody(b)); }

// Body-vs-body: spheres, sleeping bodies act as fixed supports.
function collideBodies(b, out) {
  const r = b.r, R = r + maxR + 1, x = b.p.x, y = b.p.y, z = b.p.z, st = ++nearStamp;
  const x0 = gcell(x - R), x1 = gcell(x + R), z0 = gcell(z - R), z1 = gcell(z + R);
  let touched = false, hitV = 0;
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    for (let i = GHEAD[cz * GN + cx]; i >= 0; i = GNEXT[i]) {
      // cheap reject on cached positions (with a margin for this step's motion)
      const qx = x - GX[i], qy = y - GY[i], qz = z - GZ[i], qr = r + GR[i] + 1;
      if (qx * qx + qy * qy + qz * qz >= qr * qr) continue;
      const o = GB[i];
      if (o === b || o.dead || o.held || o._ns === st) continue;
      o._ns = st;
      const dx = b.p.x - o.p.x, dy = b.p.y - o.p.y, dz = b.p.z - o.p.z, rs = r + o.r;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rs * rs || d2 < 1e-8) continue;
      if (!o.asleep && o.born < b.born) continue; // pair handled from the other side
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d;
      const pen = rs - d;
      const rel = (b.v.x - o.v.x) * nx + (b.v.y - o.v.y) * ny + (b.v.z - o.v.z) * nz;
      if (o.asleep && rel < -6 && b.m > o.m * 0.3) wakeBody(o);
      const iA = 1 / b.m, iB = o.asleep ? 0 : 1 / o.m, tot = iA + iB, ka = iA / tot * 0.7;
      b.p.x += nx * pen * ka; b.p.y += ny * pen * ka; b.p.z += nz * pen * ka;
      if (iB) { const kb = iB / tot * 0.7; o.p.x -= nx * pen * kb; o.p.y -= ny * pen * kb; o.p.z -= nz * pen * kb; }
      if (rel < 0) {
        const j = -1.1 * rel / tot;
        b.v.x += nx * j * iA; b.v.y += ny * j * iA; b.v.z += nz * j * iA;
        if (iB) { o.v.x -= nx * j * iB; o.v.y -= ny * j * iB; o.v.z -= nz * j * iB; }
        if (-rel > hitV) hitV = -rel;
      }
      if (ny > 0.5) touched = true;
    }
  }
  out.t = touched; out.v = hitV;
}
const bbOut = { t: false, v: 0 };

const corner = new V3(), nrm = new V3();
let physAwake = 0;
function stepBodies(dt) {
  rebuildGrid();
  physAwake = 0;
  for (let bi = 0; bi < bodies.length; bi++) {
    const b = bodies[bi];
    if (b.dead || b.held) continue;
    b.age += dt;
    if (b.hinge) { stepHinge(b, dt); continue; }
    if (b.asleep) {
      if (b.life && b.age > b.life) fadeBody(b, dt);
      continue;
    }
    physAwake++;
    // gravity, water drag and buoyancy
    b.v.y -= G * dt;
    const th = terrainH(b.p.x, b.p.z);
    if (b.p.y < WATER_Y && th < WATER_Y) {
      if (!b.wet) { b.wet = true; if (b.v.y < -6) splashAt(b.p.x, b.p.z, Math.min(4, b.r)); }
      const k = Math.exp(-1.8 * dt);
      b.v.multiplyScalar(k); b.w.multiplyScalar(k);
      b.v.y += G * 0.75 * dt;
      if (b.age > 25 || b.p.y < WATER_Y - 30) { fadeBody(b, dt * 3); }
    }
    b.p.addScaledVector(b.v, dt);
    pq.set(b.w.x * dt * 0.5, b.w.y * dt * 0.5, b.w.z * dt * 0.5, 0).multiply(b.q);
    b.q.x += pq.x; b.q.y += pq.y; b.q.z += pq.z; b.q.w += pq.w; b.q.normalize();
    if (b.p.y < -120) { killBody(b); continue; }
    if (b.members) { stepCompoundContacts(b, dt); continue; }
    // corner contacts against ground and standing blocks
    let maxPen = 0, hitV = 0, touched = false;
    pn.set(0, 1, 0);
    rotOf(b.q);
    const flat = Math.abs(b.p.x) < CITY_HALF && b.p.z > -CITY_HALF && b.p.z < 520;
    const nearB = b.p.y - b.r * 2 < 235 && bgIdx(b.p.x, b.p.z) >= 0 && BGRID[bgIdx(b.p.x, b.p.z)].length > 0;
    const hx = b.h.x, hy = b.h.y, hz = b.h.z;
    for (let c = 0; c < 8; c++) {
      const lx = c & 1 ? hx : -hx, ly = c & 2 ? hy : -hy, lz = c & 4 ? hz : -hz;
      corner.set(RM[0] * lx + RM[3] * ly + RM[6] * lz, RM[1] * lx + RM[4] * ly + RM[7] * lz, RM[2] * lx + RM[5] * ly + RM[8] * lz);
      const wx = b.p.x + corner.x, wy = b.p.y + corner.y, wz = b.p.z + corner.z;
      const gh = flat ? 0 : terrainH(wx, wz);
      if (wy < gh) {
        if (flat) nrm.set(0, 1, 0);
        else nrm.set(terrainH(wx - 1, wz) - terrainH(wx + 1, wz), 2, terrainH(wx, wz - 1) - terrainH(wx, wz + 1)).normalize();
        const pen = (gh - wy) * nrm.y;
        hitV = Math.max(hitV, contact(b, corner.x, corner.y, corner.z, nrm.x, nrm.y, nrm.z));
        touched = true;
        if (pen > maxPen) { maxPen = pen; pn.copy(nrm); }
        continue;
      }
      const sid = nearB ? staticAt(wx, wy, wz) : -1;
      if (sid >= 0) {
        const pen = staticNormal(sid, wx, wy, wz, nrm);
        const iv = contact(b, corner.x, corner.y, corner.z, nrm.x, nrm.y, nrm.z);
        hitV = Math.max(hitV, iv);
        touched = true;
        if (pen > maxPen) { maxPen = Math.min(pen, 2); pn.copy(nrm); }
        if (iv > 8) damageBlock(sid, Math.min(220, b.m * iv * 0.006), b.v.x * 0.2, 0, b.v.z * 0.2, false);
      }
    }
    if (maxPen > 0) b.p.addScaledVector(pn, maxPen * 0.8);
    // other bodies
    collideBodies(b, bbOut);
    if (bbOut.t) touched = true;
    if (bbOut.v > hitV) hitV = bbOut.v;
    if (touched && hitV > 3) onBodyImpact(b, hitV);
    // crush whatever is underneath a fast falling piece
    if (b.v.lengthSq() > 30 && b.p.y - b.r < 4 && b.m > 10) crushAt(b.p.x, b.p.z, b.r + 1, b);
    // sleep
    b.awake = (b.awake || 0) + dt;
    const v2 = b.v.lengthSq(), w2 = b.w.lengthSq();
    if (touched && ((v2 < 1.2 && w2 < 0.8) || (b.awake > 5 && v2 < 6 && w2 < 3) || b.awake > 14)) {
      b.sleep += dt;
      if (b.sleep > (b.awake > 5 ? 0.15 : 0.4)) { b.asleep = true; b.v.set(0, 0, 0); b.w.set(0, 0, 0); }
    } else b.sleep = 0;
    if (b.v.lengthSq() > 4e4) b.v.setLength(200);
  }
  // fade out recycled rubble
  for (let i = FADING.length - 1; i >= 0; i--) { const b = FADING[i]; if (b.dead) { FADING.splice(i, 1); continue; } fadeBody(b, dt); if (b.dead) FADING.splice(i, 1); }
  if (blockPool) trimPool(blockPool);
  // compact
  let j = 0;
  for (let i = 0; i < bodies.length; i++) { const b = bodies[i]; if (!b.dead) bodies[j++] = b; else if (b.slot !== undefined) BODY_FREE.push(b); }
  bodies.length = j;
}
function fadeBody(b, dt) {
  b.fade += dt;
  if (b.fade > 1.2) { killBody(b); return; }
  b.s.multiplyScalar(Math.max(0, 1 - dt * 1.2));
  b.asleep = true;
  writeBody(b);
}
function onBodyImpact(b, v) {
  if (b.proj) { const p = b.proj; b.proj = null; projectileImpact(b, p); return; }
  if (b.onLand) { const f = b.onLand; b.onLand = null; f(b, v); }
  if (b.fxT > 0 && b.age - b.fxT < 0.6) return;
  b.fxT = b.age || 0.001;
  if (v > 6 && b.m > 60) {
    if (Math.random() < 0.5) dustAt(b.p.x, b.p.y, b.p.z, b.r * 1.6, 1);
    impactSound(b.m, v, b.p);
    if (b.m > 600 && v > 9) addShake(Math.min(0.35, b.m * v * 1e-5), b.p);
  }
}
function stepHinge(b, dt) {
  const H = b.hinge;
  H.av += (1.5 * G / H.L) * Math.sin(H.ang + 0.08) * dt;
  H.ang += H.av * dt;
  pq.setFromAxisAngle(H.axis, H.ang);
  b.q.copy(pq).multiply(H.q0);
  pr.copy(H.p0).sub(H.pivot).applyQuaternion(pq);
  b.p.copy(H.pivot).add(pr);
  // plough through anything the falling section swings into
  for (let i = 0; i < b.lat.length; i += 2) {
    corner.copy(b.lat[i]).applyQuaternion(b.q).add(b.p);
    const sid = staticAt(corner.x, corner.y, corner.z);
    if (sid >= 0 && BLK_[sid].b !== b.members[0].B.b) damageBlock(sid, 500, H.axis.z * -4, 0, H.axis.x * 4, true);
  }
  if (H.ang > 0.6 || b.age > 4) {
    b.w.copy(H.axis).multiplyScalar(H.av);
    b.v.copy(b.w).cross(pr);
    b.hinge = null;
  }
  writeBody(b);
}
function stepCompoundContacts(b, dt) {
  let hit = false;
  for (const lp of b.lat) {
    corner.copy(lp).applyQuaternion(b.q).add(b.p);
    if (corner.y < terrainH(corner.x, corner.z)) { hit = true; break; }
    const sid = staticAt(corner.x, corner.y, corner.z);
    if (sid >= 0) { damageBlock(sid, 300 + b.m * 0.004, b.v.x * 0.3, 0, b.v.z * 0.3, true); hit = true; }
  }
  if (hit || b.age > 6) breakCompound(b);
  else writeBody(b);
}

// ---------- rendering ----------
const rq = new V3(), rs = new V3();
function writeBody(b) {
  if (b.members) {
    for (const mb of b.members) {
      rq.copy(mb.off).applyQuaternion(b.q).add(b.p);
      rs.copy(mb.h).multiplyScalar(2);
      _m4.compose(rq, b.q, rs);
      blockPool.mesh.setMatrixAt(mb.slot, _m4);
    }
    blockPool.dirty = true;
    return;
  }
  if (!b.pool || b.slot < 0) return;
  _m4.compose(b.p, b.q, b.s);
  b.pool.mesh.setMatrixAt(b.slot, _m4);
  b.pool.dirty = true;
}
function renderBodies() {
  for (const b of bodies) if (!b.dead && (!b.asleep || b.held) && !b.hinge) writeBody(b);
  for (const p of POOLS) {
    if (p.dirty) { p.mesh.instanceMatrix.needsUpdate = true; p.dirty = false; }
    if (p.colDirty && p.mesh.instanceColor) { p.mesh.instanceColor.needsUpdate = true; p.colDirty = false; }
    if (p.infoDirty && p.info) { p.mesh.geometry.attributes.aInfo.needsUpdate = true; p.infoDirty = false; }
  }
  if (staticDirtyM) { staticMesh.instanceMatrix.needsUpdate = true; staticDirtyM = false; }
  if (staticDirtyI) { staticMesh.geometry.attributes.aInfo.needsUpdate = true; staticDirtyI = false; }
}
