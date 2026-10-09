// Mud & Iron — targeting, small-arms fire, shells and explosions, flamethrowers, grenades, gas,
// aircraft and command powers (recon, strafing, gas attack, creeping barrage)

const SHELLS = [];
let GAS = [];
let PLANES = [];
let CREEPS = [];
let REVEALS = [];
const SHELL_IM = (() => {
  const m = new THREE.InstancedMesh(shellGeo, MAT.unit, 300);
  m.count = 0; m.frustumCulled = false;
  scene.add(m);
  return m;
})();
const GRENADE_W = { dmg: 45, radius: 4, supp: 0.6, at: 0.3, crater: 0, snd: 'grenade' };
const BUNDLE_W = { dmg: 90, radius: 3.2, supp: 0.8, at: 3.2, crater: 0.35, bld: 2, snd: 'explode' };
const STRAFE_DMG = 26;
const CREEP_W = { dmg: 65, radius: 4.5, supp: 0.85, at: 0.9, crater: 0.9, bld: 1.2, snd: 'explode' };
const GASSHELL_W = { dmg: 10, radius: 2, supp: 0.3, at: 0, crater: 0, snd: 'grenade' };

const vetAcc = (e) => 1 + 0.1 * (e.vet || 0);
const vetRes = (e) => 1 - 0.12 * (e.vet || 0);
const tgtRad = (t) => (t.kind === 'veh' ? t.def.rad : t.kind === 'bld' ? Math.max(...footprint(t.type, t.ang)) : 1.5);

function acquire(e, w, range) {
  let best = null, bs = 1e9;
  for (const t of ENTS) {
    if (t.dead || t.team === e.team) continue;
    const dd = Math.hypot(t.x - e.x, t.z - e.z) - (t.kind === 'squad' ? 0 : tgtRad(t));
    if (dd > range || (w.min && dd < w.min)) continue;
    if (!visibleTo(e.team, t.x, t.z)) continue;
    let s = dd;
    if (t.kind === 'veh') {
      if (!w.shell && !w.flame && t.def.armor > 0.9) continue;
      s += w.shell ? (w.at >= 1 ? -40 : 15) : 12;
    } else if (t.kind === 'bld') {
      if (!w.shell) continue;
      s += w.at >= 1 && w.direct ? 30 : 40;
    } else {
      if (w.shell && w.at >= 1.2 && w.direct) s += 20;
      if (t.retreat) s += 10;
    }
    if (s < bs) { bs = s; best = t; }
  }
  return best;
}
function planeTarget(x, z, team, range) {
  for (const p of PLANES) if (!p.dead && p.team !== team && p.y < 70 && Math.hypot(p.x - x, p.z - z) < range + 12) return p;
  return null;
}

// ---------- damage ----------
function addSupp(sq, amt) {
  if (sq.kind !== 'squad' || sq.dead || amt <= 0) return;
  if (sq.overtop > 0) return;
  sq.supp = Math.min(1.05, sq.supp + amt * vetRes(sq) * (sq.retreat ? 0.4 : 1));
  sq.lastSupp = GAME.t;
}
function hurtMan(sq, m, dmg, src) {
  if (!m.alive || dmg <= 0) return;
  m.hp -= dmg; sq.lastHit = GAME.t;
  if (src) src.xp += dmg * 0.5;
  if (m.hp > 0) return;
  m.alive = false;
  CORPSES.push({ x: m.x, y: m.y, z: m.z, ang: m.ang + frand(-0.5, 0.5), n: sq.nation, t: 0, seen: false });
  addSupp(sq, 0.12);
  TEAMS[sq.team].stats.losses++;
  if (src && src.team !== undefined) { TEAMS[src.team].stats.kills++; if (src.xp !== undefined) src.xp += 20; }
  if (!sq.men.some((mm) => mm.alive)) {
    if (sq.team === 0) alertMsg(`${sq.def.name} wiped out`, 'bad', sq);
    killSquad(sq);
  }
}
function hurtVeh(v, dmg, src) {
  if (v.dead || dmg <= 0) return;
  v.hp -= dmg * (1 - 0.06 * v.vet); v.lastHit = GAME.t;
  if (src && src.xp !== undefined) src.xp += dmg * 0.4;
  if (v.team === 0 && GAME.t - (v.alertT || -99) > 15 && v.hp < v.maxhp * 0.5) { v.alertT = GAME.t; alertMsg(`${v.def.name} badly damaged`, 'bad', v); }
  if (v.hp <= 0) {
    v.hp = 0;
    removeEnt(v);
    TEAMS[v.team].stats.losses++;
    if (src && src.team !== undefined) { TEAMS[src.team].stats.kills++; TEAMS[src.team].stats.vehKills++; if (src.xp !== undefined) src.xp += 60; }
    explosionFX(v.x, v.z, 4); sfx('bigexplode', v.x, v.z, 1); addShake(0.4, v.x, v.z);
    // blackened wreck burns, then stays
    v.mesh.traverse((o) => { if (o.isMesh) { o.material = WRECK_MAT; } });
    addEmitter({ kind: 'fire', x: v.x, y: v.y + 1.5, z: v.z, life: 40, rate: 6, size: 1.5 });
    if (v.smoke) v.smoke.life = 0.01;
    if (v.team === 0) alertMsg(`${v.def.name} destroyed`, 'bad', v);
    const mesh = v.mesh;
    later(150, () => { if (mesh.parent) mesh.parent.remove(mesh); });
  }
}
const WRECK_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1, flatShading: true });
function hurtBld(b, dmg, src) {
  if (b.dead || dmg <= 0) return;
  b.hp -= dmg; b.lastHit = GAME.t;
  if (b.team === 0 && GAME.t - (b.alertT || -99) > 20) { b.alertT = GAME.t; alertMsg(`${b.def.name} under attack!`, 'bad', b); sfx('alarm'); }
  if (b.hp < b.maxhp * 0.4 && !b.smoke) b.smoke = addEmitter({ kind: 'smoke', x: b.x, y: b.y + 3, z: b.z, rate: 2, size: 2.5, dark: 0.2 });
  if (b.hp <= 0) { if (b.smoke) b.smoke.life = 0.01; destroyBld(b, src ? src.team : -1); }
}

// ---------- small arms ----------
function aimPoint(t, out) {
  if (t.kind === 'squad') {
    const al = t.men.filter((m) => m.alive);
    if (!al.length) return null;
    const m = al[Math.floor(Math.random() * al.length)];
    out.m = m; out.x = m.x; out.y = m.y + 1.0; out.z = m.z;
  } else if (t.kind === 'veh') { out.m = null; out.x = t.x + frand(-1, 1); out.y = t.y + 1.4; out.z = t.z + frand(-1, 1); }
  else { out.m = null; out.x = t.x + frand(-2, 2); out.y = t.y + 2; out.z = t.z + frand(-2, 2); }
  return out;
}
const _aim = { m: null, x: 0, y: 0, z: 0 };
function fireSmall(e, ox, oy, oz, tg, w, moving, k) {
  const shots = w.shots || 1;
  muzzle(ox, oy, oz, w.shots ? 0.8 : 0.55);
  sfx(w.snd, ox, oz, w.snd === 'rifle' ? 0.55 : 0.8);
  e.lastFire = GAME.t;
  for (let s = 0; s < shots; s++) {
    if (tg.dead || !aimPoint(tg, _aim)) break;
    const d = Math.hypot(_aim.x - ox, _aim.z - oz);
    let acc = lerp(w.acc[0], w.acc[1], clamp(d / w.range, 0, 1)) * vetAcc(e);
    if (moving) acc *= w.move || 0.4;
    if (e.kind === 'squad' && e.supp >= 0.6 && e.overtop <= 0) acc *= 0.5;
    if (tg.kind === 'squad') { acc *= 1 - coverAt(_aim.x, _aim.z); if (tg.moving) acc *= 0.85; }
    else acc *= 1.7;
    const hit = Math.random() < acc;
    let tx = _aim.x, ty = _aim.y, tz = _aim.z;
    if (!hit) { tx += frand(-2.5, 2.5); tz += frand(-2.5, 2.5); ty = groundH(tx, tz) + frand(0, 1.2); }
    const tr = w.shots ? 1 : 0.35;
    if (w.shots || Math.random() < 0.6) tracer(ox, oy, oz, tx, ty, tz, tr);
    if (tg.kind === 'squad') {
      if (hit) hurtMan(tg, _aim.m, w.dmg, e);
      else if (Math.random() < 0.5) dirtKick(tx, tz, 1);
      addSupp(tg, w.supp * (1 - coverAt(tg.x, tg.z) * 0.5));
    } else if (tg.kind === 'veh') {
      if (hit) { const dmg = w.dmg * (1 - tg.def.armor); hurtVeh(tg, dmg, e); if (tg.def.armor > 0.5 && Math.random() < 0.4) sparks(tx, ty, tz, 2); }
    } else if (hit) hurtBld(tg, w.dmg * 0.04, e);
  }
}
function fireAtPlane(e, ox, oy, oz, p, w) {
  muzzle(ox, oy, oz, 0.8); sfx(w.snd, ox, oz, 0.7);
  for (let s = 0; s < (w.shots || 1); s++) {
    const hit = Math.random() < 0.13;
    tracer(ox, oy, oz, p.x + frand(-3, 3), p.y + frand(-2, 2), p.z + frand(-3, 3), 1);
    if (hit) { p.hp -= 6; if (p.hp <= 0 && !p.down) shootDown(p, e); }
  }
}

function squadCombat(e, dt, moving) {
  const w = e.w;
  if (!w) return;
  e.acqT -= dt;
  const forced = e.order && e.order.t === 'attack' ? BYID.get(e.order.id) : null;
  if (e.acqT <= 0) {
    e.acqT = 0.35 + Math.random() * 0.2;
    if (forced && !forced.dead && visibleTo(e.team, forced.x, forced.z)) e.tgt = forced.id;
    else if (e.order && e.order.t === 'ground') e.tgt = null;
    else { const t = acquire(e, w, w.range); e.tgt = t ? t.id : null; }
  }
  const tg = e.tgt ? BYID.get(e.tgt) : null;
  const alive = e.men.filter((m) => m.alive);
  const pinned = e.supp >= 0.6 && e.overtop <= 0;
  if (!tg || tg.dead) {
    e.tgt = null;
    // MGs with nothing on the ground will shoot at aircraft
    if (w.air && e.setup >= 1 && !moving && (e.airCd = (e.airCd || 0) - dt) <= 0) {
      const p = planeTarget(e.x, e.z, e.team, w.range);
      if (p) { e.airCd = w.cd; const m = alive[0]; fireAtPlane(e, m.x, m.y + 1, m.z, p, w); }
    }
    return;
  }
  const d = Math.hypot(tg.x - e.x, tg.z - e.z) - (tg.kind === 'squad' ? 0 : tgtRad(tg));
  if (w.shell) {
    if (moving || e.setup < 1 || d > w.range || d < (w.min || 0)) return;
    const want = Math.atan2(tg.x - e.wx, tg.z - e.wz);
    if (Math.abs(angWrap(want - e.gunAng)) > 0.2) return;
    e.wcd -= dt;
    if (e.wcd > 0) return;
    const full = e.def.men, crewK = Math.sqrt(full / Math.max(1, alive.length));
    e.wcd = w.cd * crewK * (1 - 0.06 * e.vet) * frand(0.9, 1.15);
    const direct = w.direct && tg.kind === 'veh' && d < w.direct;
    fireShellAt(e, e.wx, e.wz, tg, w, direct);
    return;
  }
  if (w.team) {
    // heavy MG: only the gunner fires, and only once set up and traversed onto the target
    if (moving || e.setup < 1) return;
    const want = Math.atan2(tg.x - e.wx, tg.z - e.wz);
    if (Math.abs(angWrap(want - e.gunAng)) > 0.35) return;
    if (d > w.range) return;
    e.wcd -= dt;
    if (e.wcd > 0) return;
    e.wcd = w.cd * frand(0.85, 1.2) * (pinned ? 1.8 : 1) * (alive.length < 2 ? 1.6 : 1);
    const mx = e.wx + Math.sin(e.gunAng) * 1.1, mz = e.wz + Math.cos(e.gunAng) * 1.1;
    fireSmall(e, mx, groundH(e.wx, e.wz) + 0.8, mz, tg, w, false);
    return;
  }
  for (const m of alive) {
    m.fire -= dt;
    if (m.fire > 0) continue;
    if (moving && !w.move) { m.fire = 0.3; continue; }
    const dm = Math.hypot(tg.x - m.x, tg.z - m.z) - (tg.kind === 'squad' ? 0 : tgtRad(tg));
    if (dm > w.range) { m.fire = 0.3; continue; }
    m.fire = w.cd * frand(0.8, 1.25) * (pinned ? 1.7 : 1);
    if (w.flame) { flameAt(e, m, tg, w); continue; }
    const fa = Math.atan2(tg.x - m.x, tg.z - m.z);
    fireSmall(e, m.x + Math.sin(fa) * 0.9, m.y + (m.pose === 'prone' ? 0.4 : m.pose === 'kneel' ? 1.15 : 1.75), m.z + Math.cos(fa) * 0.9, tg, w, moving);
  }
}

function flameAt(e, m, tg, w) {
  if (!aimPoint(tg, _aim)) return;
  const dx = _aim.x - m.x, dz = _aim.z - m.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  flameJet(m.x + ux * 0.8, m.y + 1.1, m.z + uz * 0.8, ux, uz, Math.min(d, w.range));
  sfx('flame', m.x, m.z, 0.8);
  e.lastFire = GAME.t;
  if (tg.kind === 'squad') {
    for (const tm of tg.men) {
      if (!tm.alive) continue;
      const ex = tm.x - m.x, ez = tm.z - m.z, ed = Math.hypot(ex, ez);
      if (ed > w.range + 1) continue;
      const cosA = (ex * ux + ez * uz) / (ed || 1);
      if (cosA < 0.88) continue;
      hurtMan(tg, tm, w.dmg * (1 - coverAt(tm.x, tm.z) * 0.3), e);
    }
    addSupp(tg, w.supp);
    if (Math.random() < 0.15) addEmitter({ kind: 'fire', x: _aim.x, y: groundH(_aim.x, _aim.z), z: _aim.z, life: 4, rate: 6, size: 0.9 });
  } else if (tg.kind === 'veh') hurtVeh(tg, 4, e);
  else hurtBld(tg, 5, e);
}

// ---------- vehicles ----------
function vehCombat(e, dt) {
  const hasTurret = !!e.model.turret;
  let turretWant = null;
  for (const wp of e.wpn) {
    const w = wp.w;
    wp.acqT = (wp.acqT || 0) - dt;
    const forced = e.order && e.order.t === 'attack' ? BYID.get(e.order.id) : null;
    if (wp.acqT <= 0) {
      wp.acqT = 0.4 + Math.random() * 0.2;
      if (forced && !forced.dead && visibleTo(e.team, forced.x, forced.z) && (w.shell || forced.kind !== 'bld')) wp.tgt = forced.id;
      else { const t = acquire(e, w, w.range); wp.tgt = t ? t.id : null; }
    }
    const tg = wp.tgt ? BYID.get(wp.tgt) : null;
    if (!tg || tg.dead) {
      wp.tgt = null;
      if (w.air && wp.cd <= 0) { const p = planeTarget(e.x, e.z, e.team, w.range); if (p) { wp.cd = w.cd; fireAtPlane(e, e.x, e.y + 2.2, e.z, p, w); } }
      continue;
    }
    const d = Math.hypot(tg.x - e.x, tg.z - e.z) - tgtRad(tg);
    if (d > w.range) continue;
    const fa = Math.atan2(tg.x - e.x, tg.z - e.z);
    if (w.shell) {
      if (hasTurret) {
        turretWant = fa - e.ang;
        if (Math.abs(angWrap(turretWant - e.turretAng)) > 0.15) continue;
      } else {
        const arc = e.def.model === 'mark4' ? 1.9 : 0.5;
        const off = angWrap(fa - e.ang);
        if (Math.abs(off) > arc) {
          if (!e.path && !e.moving && e.broken <= 0) e.ang = turnTo(e.ang, fa, dt * 0.5);
          continue;
        }
      }
      if (wp.cd > 0) continue;
      wp.cd = w.cd * (1 - 0.06 * e.vet) * frand(0.9, 1.1);
      let mx = e.x, mz = e.z, my = e.y + e.model.gunY;
      if (hasTurret) { const a = e.ang + e.turretAng; mx += Math.sin(a) * e.model.gunZ; mz += Math.cos(a) * e.model.gunZ; }
      else if (e.model.muzzles) {
        let mm = e.model.muzzles[0];
        if (e.model.muzzles.length > 1) { const off = angWrap(fa - e.ang); mm = e.model.muzzles[off < 0 ? 0 : 1]; }
        const c = Math.cos(e.ang), s = Math.sin(e.ang);
        mx = e.x + mm[0] * c + mm[2] * s; mz = e.z - mm[0] * s + mm[2] * c; my = e.y + mm[1];
      }
      fireShellFrom(e, mx, my, mz, tg, w, true);
    } else {
      if (wp.cd > 0) continue;
      wp.cd = w.cd * frand(0.85, 1.2);
      if (hasTurret && turretWant === null) turretWant = fa - e.ang;
      fireSmall(e, e.x + Math.sin(fa) * 1.5, e.y + 1.8, e.z + Math.cos(fa) * 1.5, tg, w, e.moving);
    }
  }
  if (hasTurret) e.turretAng = turnTo(e.turretAng, turretWant ?? 0, dt * (turretWant === null ? 0.8 : 1.8));
}

// ---------- shells ----------
function fireShellAt(e, x, z, tg, w, direct) {
  const y = groundH(x, z) + (e.def.crew === 'mortar' ? 0.8 : 1.2);
  const mx = x + Math.sin(e.gunAng) * (e.def.crew === 'fgun' ? 2.4 : 0.6), mz = z + Math.cos(e.gunAng) * (e.def.crew === 'fgun' ? 2.4 : 0.6);
  fireShellFrom(e, mx, y, mz, tg, w, direct);
}
function fireShellFrom(e, x, y, z, tg, w, direct, gx, gz) {
  let tx, tz;
  if (tg) { tx = tg.x; tz = tg.z; } else { tx = gx; tz = gz; }
  const d = Math.hypot(tx - x, tz - z);
  let hitDirect = false;
  if (direct && tg && tg.kind === 'veh') {
    hitDirect = Math.random() < clamp(0.75 - d / w.range * 0.35, 0.3, 0.8) * vetAcc(e);
    if (!hitDirect) { const a = Math.random() * TAU, r = frand(2.5, 6); tx += Math.cos(a) * r; tz += Math.sin(a) * r; }
  } else {
    const sc = lerp(w.scatter[0], w.scatter[1], clamp(d / w.range, 0, 1)) / vetAcc(e);
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * sc;
    tx += Math.cos(a) * r; tz += Math.sin(a) * r;
    if (tg && tg.kind === 'veh' && tg.moving) { tx += Math.sin(tg.ang) * tg.v * 1.5; tz += Math.cos(tg.ang) * tg.v * 1.5; }
  }
  launchShell(x, y, z, tx, tz, w, e.team, e, hitDirect ? tg : null);
  muzzle(x, y, z, w.radius > 6 ? 4 : 2.2);
  for (let k = 0; k < 4; k++) smokePuff(x + frand(-0.5, 0.5), y, z + frand(-0.5, 0.5), w.radius > 6 ? 3 : 1.5, 0.55, 3);
  sfx(w.snd, x, z, 1);
  e.lastFire = GAME.t;
  if (w.radius > 6) addShake(0.25, x, z);
}
function launchShell(x, y, z, tx, tz, w, team, src, directTgt, opts = {}) {
  const d = Math.hypot(tx - x, tz - z);
  const ty = groundH(tx, tz);
  const speed = w.arc >= 1 ? 28 : w.arc >= 0.3 ? 70 : w.arc ? 130 : 22;
  const T = opts.T || clamp(d / speed + (w.arc >= 1 ? 1.2 : 0), 0.15, 9);
  const h = opts.h ?? (w.arc ? Math.max(1.5, d * w.arc * 0.5) : Math.max(1, d * 0.25));
  SHELLS.push({ x0: x, y0: y, z0: z, x1: tx, y1: ty, z1: tz, t: 0, T, h, w, team, src, tgt: directTgt, x, y, z, whistled: !(w.arc >= 0.3 || opts.whistle), gas: opts.gas, vis: opts.vis ?? true });
}
function updateShells(dt) {
  let n = 0;
  for (let i = SHELLS.length - 1; i >= 0; i--) {
    const s = SHELLS[i];
    s.t += dt;
    const u = Math.min(1, s.t / s.T);
    const px = s.x, py = s.y, pz = s.z;
    s.x = lerp(s.x0, s.x1, u); s.z = lerp(s.z0, s.z1, u); s.y = lerp(s.y0, s.y1, u) + s.h * 4 * u * (1 - u);
    if (!s.whistled && s.T - s.t < 1.1) { s.whistled = true; sfx('whistle', s.x1, s.z1, 0.9); }
    if (u >= 1) {
      SHELLS.splice(i, 1);
      if (s.tgt && !s.tgt.dead) { s.x1 = s.tgt.x; s.z1 = s.tgt.z; }
      if (s.gas) { gasCloud(s.x1, s.z1, s.team); explode(s.x1, s.z1, GASSHELL_W, s.team, s.src); }
      else explode(s.x1, s.z1, s.w, s.team, s.src);
      continue;
    }
    if (n < SHELL_IM.instanceMatrix.count && s.vis && visibleTo(0, s.x, s.z)) {
      _v1.set(s.x - px, s.y - py, s.z - pz);
      if (_v1.lengthSq() > 1e-6) { _v1.normalize(); _q1.setFromUnitVectors(_v2.set(0, 0, 1), _v1); }
      _m4.compose(_v3.set(s.x, s.y, s.z), _q1, _s1.set(s.w.radius > 6 ? 3 : 1.4, s.w.radius > 6 ? 3 : 1.4, s.w.radius > 6 ? 3 : 1.4));
      SHELL_IM.setMatrixAt(n++, _m4);
    }
  }
  SHELL_IM.count = n; SHELL_IM.instanceMatrix.needsUpdate = true;
}

function explode(x, z, w, team, src) {
  if (!inMap(x, z)) return;
  const r = w.radius, gy = groundH(x, z);
  const wet = gy <= WATER_Y + 0.05;
  explosionFX(x, z, r, wet);
  sfx(r > 6 ? 'bigexplode' : w.snd === 'grenade' ? 'grenade' : 'explode', x, z, 1);
  addShake(r > 6 ? 0.7 : r > 4 ? 0.22 : 0.08, x, z);
  if (w.crater) addCrater(x, z, r * 0.55 * w.crater);
  else for (const t of MAP.trees) if (t.alive && dist2(t.x, t.z, x, z) < r * r * 0.25) shatterTree(t, false);
  for (const e of ENTS) {
    if (e.dead) continue;
    const ff = e.team === team ? 0.5 : 1;
    if (e.kind === 'squad') {
      const dc = Math.hypot(e.x - x, e.z - z);
      if (dc > r * 2.6 + 12) continue;
      for (const m of e.men) {
        if (!m.alive) continue;
        const d = Math.hypot(m.x - x, m.z - z);
        if (d > r) continue;
        const cv = coverAt(m.x, m.z);
        const fall = Math.pow(1 - d / r, 0.7);
        hurtMan(e, m, w.dmg * fall * (1 - cv * 0.6) * ff * frand(0.75, 1.25), src);
      }
      if (dc < r * 2.6) addSupp(e, w.supp * (1 - dc / (r * 2.6)) * (1 - e.cover * 0.4) * ff);
    } else if (e.kind === 'veh') {
      const d = Math.max(0, Math.hypot(e.x - x, e.z - z) - e.def.rad);
      if (d < r) hurtVeh(e, w.dmg * (1 - d / r) * (w.at ?? 0.5) * ff, src);
    } else {
      const [hw, hd] = footprint(e.type, e.ang);
      const dx = Math.max(0, Math.abs(e.x - x) - hw), dz = Math.max(0, Math.abs(e.z - z) - hd), d = Math.hypot(dx, dz);
      if (d < r) hurtBld(e, w.dmg * (1 - d / r) * (w.bld ?? 1) * 0.6 * ff, src);
    }
  }
  for (const h of MAP.houses) {
    if (h.ruined) continue;
    const dx = Math.max(0, Math.abs(h.x - x) - h.hw), dz = Math.max(0, Math.abs(h.z - z) - h.hd), d = Math.hypot(dx, dz);
    if (d < r) { h.hp -= w.dmg * (1 - d / r) * (w.bld ?? 1); if (h.hp <= 0) ruinHouse(h); }
  }
}

// ---------- abilities ----------
function abilityReady(e, k) {
  const A = ABIL[k];
  if ((e.abCd[k] || 0) > 0) return false;
  if (A.cost && TEAMS[e.team].supply < A.cost) return false;
  if (k === 'barrage' && e.setup !== undefined && e.order && e.order.barrage) return false;
  return true;
}
function useAbility(e, k, x, z) {
  const A = ABIL[k];
  if (!abilityReady(e, k) || e.dead) return false;
  if (k === 'overtop') {
    TEAMS[e.team].supply -= A.cost; e.abCd[k] = A.cd;
    e.overtop = A.dur; e.supp = 0;
    if (e.broken) { e.broken = false; e.retreat = false; if (e.order && e.order.t === 'retreat') giveOrder(e, { t: 'stop' }); }
    sfx('officer', e.x, e.z, 1);
    return true;
  }
  if (k === 'barrage') {
    const w = e.w, d = Math.hypot(x - e.x, z - e.z);
    if (d < (w.min || 0)) return false;
    TEAMS[e.team].supply -= A.cost; e.abCd[k] = A.cd;
    giveOrder(e, { t: 'ground', x, z, barrage: A.rounds });
    return true;
  }
  TEAMS[e.team].supply -= A.cost;
  giveOrder(e, { t: 'ability', ab: k, x, z });
  return true;
}
function abilityUpdate(e, dt) {
  const o = e.order, A = ABIL[o.ab];
  const d = Math.hypot(o.x - e.x, o.z - e.z);
  if (d > A.range - 1) {
    if (!e.path) { const k = (d - A.range + 3) / d; setPath(e, e.x + (o.x - e.x) * k, e.z + (o.z - e.z) * k); if (!e.path) { TEAMS[e.team].supply += A.cost; nextOrder(e); return false; } }
    return moveAlong(e, dt, squadSpeed(e));
  }
  e.path = null;
  const al = e.men.filter((m) => m.alive);
  const throwers = o.ab === 'bundle' ? al.slice(0, 1) : al.slice(0, 2);
  for (const m of throwers) {
    const sc = o.ab === 'bundle' ? 1 : 2.5;
    launchShell(m.x, m.y + 1.6, m.z, o.x + frand(-sc, sc), o.z + frand(-sc, sc), o.ab === 'bundle' ? BUNDLE_W : GRENADE_W, e.team, e, null, { T: 1.1, h: 3 });
  }
  e.abCd[o.ab] = A.cd;
  e.face = Math.atan2(o.x - e.x, o.z - e.z);
  nextOrder(e);
  return false;
}
// Team weapons: attack-ground and barrages.
function groundUpdate(e, dt) {
  const o = e.order, w = e.w;
  if (!w || !w.shell) { nextOrder(e); return false; }
  const d = Math.hypot(o.x - e.x, o.z - e.z);
  if (d > w.range - 1 || d < (w.min || 0)) {
    if (d < (w.min || 0)) { nextOrder(e); return false; }
    if (!e.path) { const k = (d - w.range + 6) / d; setPath(e, e.x + (o.x - e.x) * k, e.z + (o.z - e.z) * k); if (!e.path) { nextOrder(e); return false; } }
    if (e.setup > 0) { e.setup = Math.max(0, e.setup - dt * 1.5); return false; }
    return moveAlong(e, dt, squadSpeed(e));
  }
  e.path = null;
  e.groundT = o;
  if (e.setup < 1) return false;
  const want = Math.atan2(o.x - e.wx, o.z - e.wz);
  if (Math.abs(angWrap(want - e.gunAng)) > 0.2) return false;
  e.wcd -= dt;
  if (e.wcd > 0) return false;
  const alive = e.men.filter((m) => m.alive).length;
  e.wcd = (o.barrage ? Math.max(1.2, w.cd * 0.25) : w.cd) * Math.sqrt(e.def.men / Math.max(1, alive));
  const y = groundH(e.wx, e.wz) + 1;
  fireShellFrom(e, e.wx + Math.sin(e.gunAng) * 1.5, y, e.wz + Math.cos(e.gunAng) * 1.5, null, w, false, o.x, o.z);
  if (o.barrage) { o.barrage--; if (o.barrage <= 0) { e.groundT = null; nextOrder(e); } }
  return false;
}
function attackChase(e, dt) {
  const o = e.order, tg = BYID.get(o.id);
  if (!tg || tg.dead) { nextOrder(e); return false; }
  const seen = visibleTo(e.team, tg.x, tg.z);
  const w = e.kind === 'squad' ? e.w : e.wpn[0].w;
  if (!w) { nextOrder(e); return false; }
  const d = Math.hypot(tg.x - e.x, tg.z - e.z) - tgtRad(tg);
  const want = seen ? w.range * 0.85 : 4;
  if (d > want) {
    o.rp = (o.rp || 0) - dt;
    if (!e.path || o.rp <= 0) { o.rp = 2; setPath(e, tg.x, tg.z); if (!e.path) { nextOrder(e); return false; } }
    if (e.kind === 'squad') {
      if (e.def.crew && e.setup > 0) { e.setup = Math.max(0, e.setup - dt * 1.5); return false; }
      return moveAlong(e, dt, squadSpeed(e));
    }
    return true;
  }
  if (!seen) { nextOrder(e); return false; }
  e.path = null;
  return false;
}

// ---------- gas ----------
function gasCloud(x, z, team) {
  GAS.push({ x, z, r: 5, team, t: 0, life: 30, acc: 0 });
}
function updateGas(dt) {
  for (let i = GAS.length - 1; i >= 0; i--) {
    const g = GAS[i];
    g.t += dt;
    if (g.t > g.life) { GAS.splice(i, 1); continue; }
    g.x += WIND.x * 0.35 * dt; g.z += WIND.z * 0.35 * dt;
    g.r = Math.min(11, g.r + dt * 0.6);
    const k = 1 - smooth(g.life * 0.7, g.life, g.t);
    g.acc += dt * 20 * k;
    while (g.acc > 1) {
      g.acc -= 1;
      const a = Math.random() * TAU, rr2 = Math.sqrt(Math.random()) * g.r;
      gasPuff(g.x + Math.cos(a) * rr2, groundH(g.x, g.z) + frand(0.3, 1.5), g.z + Math.sin(a) * rr2, frand(3, 5.5));
    }
    if ((g.dmgT = (g.dmgT || 0) - dt) > 0) continue;
    g.dmgT = 0.5;
    for (const e of ENTS) {
      if (e.dead || e.kind !== 'squad') continue;
      if (dist2(e.x, e.z, g.x, g.z) > (g.r + 8) ** 2) continue;
      const mask = TEAMS[e.team].research.gasmask;
      let any = false;
      for (const m of e.men) {
        if (!m.alive) continue;
        if (dist2(m.x, m.z, g.x, g.z) > g.r * g.r) continue;
        any = true;
        hurtMan(e, m, 3.2 * k * (mask ? 0.2 : 1) * (coverAt(m.x, m.z) >= 0.7 ? 1.3 : 1), null);
      }
      if (any) { addSupp(e, 0.07 * k * (mask ? 0.35 : 1)); e.gassed = GAME.t; }
    }
  }
}

// ---------- aircraft ----------
function launchPlane(team, kind, x, z) {
  const T = TEAMS[team];
  const fromZ = team === 0 ? MAP.H + 120 : -120;
  const sx = clamp(x + frand(-40, 40), -50, MAP.W + 50);
  const dx = x - sx, dz = z - fromZ, d = Math.hypot(dx, dz);
  const ux = dx / d, uz = dz / d;
  const m = planeModel(T.nation);
  scene.add(m.group);
  const p = { team, kind, x: sx, z: fromZ, y: kind === 'recon' ? 55 : 48, ux, uz, tx: x, tz: z, sp: kind === 'recon' ? 40 : 46, hp: 60, model: m, t: 0, voice: planeVoice(), dead: false, down: false, fireT: 0, roll: 0 };
  PLANES.push(p);
  return p;
}
function shootDown(p, by) {
  p.down = true;
  if (by && by.team !== undefined) { TEAMS[by.team].stats.kills++; if (by.xp !== undefined) by.xp += 40; }
  if (p.team === 0) alertMsg('Our aircraft has been shot down!', 'bad');
  else alertMsg('Enemy aircraft shot down!', 'good');
}
function updatePlanes(dt) {
  for (let i = PLANES.length - 1; i >= 0; i--) {
    const p = PLANES[i];
    p.t += dt;
    if (p.down) {
      p.y -= dt * (12 + p.t * 0.5); p.roll += dt * 2;
      p.x += p.ux * p.sp * 0.7 * dt; p.z += p.uz * p.sp * 0.7 * dt;
      if (Math.random() < 0.8) smokePuff(p.x, p.y, p.z, 2, 0.12, 4);
      const g = groundH(clamp(p.x, 0, MAP.W), clamp(p.z, 0, MAP.H));
      if (p.y <= g) { explode(clamp(p.x, 1, MAP.W - 1), clamp(p.z, 1, MAP.H - 1), { dmg: 40, radius: 5, supp: 0.5, at: 0.5, crater: 0.6, snd: 'explode' }, -1, null); removePlane(p, i); continue; }
    } else {
      p.x += p.ux * p.sp * dt; p.z += p.uz * p.sp * dt;
      const along = (p.x - p.tx) * p.ux + (p.z - p.tz) * p.uz;
      if (p.kind === 'strafe') {
        p.y = lerp(p.y, along > -90 && along < 30 ? 20 : 50, 1 - Math.exp(-dt * 1.2));
        if (along > -45 && along < 25) {
          p.fireT -= dt;
          if (p.fireT <= 0) {
            p.fireT = 0.07;
            const gx = p.x + p.ux * 22 + frand(-3, 3), gz = p.z + p.uz * 22 + frand(-3, 3);
            tracer(p.x, p.y - 0.5, p.z, gx, groundH(gx, gz), gz, 1);
            dirtKick(gx, gz, 1);
            sfx('mg', p.x, p.z, 0.8);
            for (const e of ENTS) {
              if (e.dead || e.team === p.team) continue;
              if (dist2(e.x, e.z, gx, gz) > 100) continue;
              if (e.kind === 'squad') {
                for (const m of e.men) if (m.alive && dist2(m.x, m.z, gx, gz) < 6.5) hurtMan(e, m, STRAFE_DMG * (1 - coverAt(m.x, m.z) * 0.5), null);
                addSupp(e, 0.08);
              } else if (e.kind === 'veh') hurtVeh(e, 8 * (1 - e.def.armor) + 1, null);
            }
          }
        }
      } else if (along > -200 && along < 200 && (p.revT = (p.revT || 0) - dt) <= 0) {
        p.revT = 0.4;
        if (inMap(p.x, p.z)) REVEALS.push({ x: p.x, z: p.z, r: 30, t: 25, team: p.team });
      }
      if (along > 320 || !inMap(p.x, p.z, -260)) { removePlane(p, i); continue; }
    }
    p.model.group.position.set(p.x, p.y, p.z);
    p.model.group.rotation.set(p.down ? 0.4 : 0, Math.atan2(p.ux, p.uz), p.roll, 'YXZ');
    p.model.prop.rotation.z += dt * 40;
    p.model.group.visible = p.team === 0 || visibleTo(0, p.x, p.z) || p.y > 30;
    updatePlaneVoice(p.voice, p.x, p.z);
  }
  for (let i = REVEALS.length - 1; i >= 0; i--) { REVEALS[i].t -= dt; if (REVEALS[i].t <= 0) REVEALS.splice(i, 1); }
}
function removePlane(p, i) {
  scene.remove(p.model.group);
  stopPlaneVoice(p.voice);
  p.dead = true;
  PLANES.splice(i, 1);
}

// ---------- command powers ----------
function powerState(team, k) {
  const T = TEAMS[team], P = POWERS[k];
  const has = ENTS.some((e) => e.kind === 'bld' && !e.dead && e.team === team && e.type === P.req && e.built >= 1) || (GAME.freePowers && GAME.freePowers[team] && GAME.freePowers[team][k] > 0);
  const cd = T.powerCd[k] || 0;
  const free = GAME.freePowers && GAME.freePowers[team] && GAME.freePowers[team][k] > 0;
  return { has, cd, afford: free || T.supply >= P.cost, free, ok: has && cd <= 0 && (free || T.supply >= P.cost) };
}
function usePower(team, k, x, z) {
  const st = powerState(team, k), T = TEAMS[team], P = POWERS[k];
  if (!st.ok || !inMap(x, z)) return false;
  if (st.free) GAME.freePowers[team][k]--; else T.supply -= P.cost;
  T.powerCd[k] = P.cd;
  if (k === 'recon') launchPlane(team, 'recon', x, z);
  else if (k === 'strafe') launchPlane(team, 'strafe', x, z);
  else if (k === 'gas') {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * P.radius;
      const fromZ = team === 0 ? MAP.H + 200 : -200;
      later(i * 0.45, () => { launchShell(x + frand(-80, 80), 30, fromZ, x + Math.cos(a) * r, z + Math.sin(a) * r, { arc: 1, radius: 2, snd: 'grenade' }, team, null, null, { T: frand(2.5, 3.5), h: 120, gas: true, whistle: true, vis: false }); });
    }
    if (team !== 0 && visibleTo(0, x, z)) alertMsg('GAS! GAS! Enemy gas shells incoming', 'bad');
  } else if (k === 'creep') {
    const hq = T.hq && !T.hq.dead ? T.hq : MAP.bases[team] || { x: MAP.W / 2, z: team === 0 ? MAP.H : 0 };
    let dx = x - hq.x, dz = z - hq.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    CREEPS.push({ team, x, z, dx, dz, t: 0, dur: 16, sp: 2.6, fireT: 0 });
    if (team !== 0) alertMsg('Enemy barrage falling!', 'bad');
  }
  if (team === 0) sfx('click');
  return true;
}
function updateCreeps(dt) {
  for (let i = CREEPS.length - 1; i >= 0; i--) {
    const c = CREEPS[i];
    c.t += dt;
    if (c.t > c.dur) { CREEPS.splice(i, 1); continue; }
    c.fireT -= dt;
    while (c.fireT <= 0) {
      c.fireT += 0.16;
      const lat = frand(-20, 20), fwd = c.t * c.sp + frand(-4, 4);
      const px = -c.dz, pz = c.dx;
      const tx = c.x + c.dx * fwd + px * lat, tz = c.z + c.dz * fwd + pz * lat;
      if (inMap(tx, tz)) launchShell(tx - c.dx * 200, 80, tz - c.dz * 200, tx, tz, CREEP_W, c.team, null, null, { T: 1.5, h: 40, vis: false, whistle: Math.random() < 0.25 });
    }
  }
  for (const k in TEAMS) for (const p in TEAMS[k].powerCd) TEAMS[k].powerCd[p] = Math.max(0, TEAMS[k].powerCd[p] - dt);
}

function clearCombat() {
  SHELLS.length = 0; GAS = []; CREEPS = []; REVEALS = [];
  for (const p of PLANES) { scene.remove(p.model.group); stopPlaneVoice(p.voice); }
  PLANES = [];
  SHELL_IM.count = 0;
}
