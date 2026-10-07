// Hollowmere — the tall man
// He only moves while unseen. Looking at him fills the "fear" meter (static);
// let it fill, or let him reach you, and you are taken.

const M = {
  group: new THREE.Group(), x: -11, z: 60, dist: 99,
  active: false, intro: true, seen: false, seenT: 0, tp: 10, grace: 0, lastSting: -99,
};
(function buildMonster() {
  const cloth = new Geo({ ao: false }), skin = new Geo({ ao: false });
  for (const s of [-1, 1]) {
    limb(cloth, [s * 0.13, 0, 0], [s * 0.11, 1.5, 0], 0.07, 4);
    limb(cloth, [s * 0.27, 2.36, 0], [s * 0.37, 0.98, 0.06], 0.05, 4);
    limb(skin, [s * 0.37, 0.98, 0.06], [s * 0.4, 0.62, 0.1], 0.035, 4, { r1: 0.01 });
  }
  box(cloth, 0, 1.45, 0, 0.48, 1.0, 0.24, { ts: 1, skip: '' });
  box(skin, 0, 1.75, 0.125, 0.1, 0.65, 0.01, { ts: 1, skip: '' });
  limb(skin, [0, 2.4, 0], [0, 2.6, 0], 0.05, 4);
  ellipsoid(skin, 0, 2.78, 0, 0.15, 0.22, 0.16, 6, 5);
  M.group.add(cloth.build(MAT.cloth), skin.build(MAT.skin));
  M.group.position.set(M.x, 0, M.z);
  scene.add(M.group);
})();

const _v = new THREE.Vector3();
function segHitsBox(x0, z0, dx, dz, b) {
  let t0 = 0, t1 = 1;
  for (const [o, d, lo, hi] of [[x0, dx, b[0], b[2]], [z0, dz, b[1], b[3]]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
    let ta = (lo - o) / d, tb = (hi - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
function lineOfSight(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  for (const b of boxes) if (b[4] && segHitsBox(x0, z0, dx, dz, b)) return false;
  return true;
}
function monsterSeen(dist, reach) {
  const range = U.uFlash.value > 0.35 ? reach + 16 : reach;
  if (!M.group.visible || dist > range) return false;
  _v.set(M.x, groundH(M.x, M.z) + 1.9, M.z).project(camera);
  if (_v.z > 1 || Math.abs(_v.x) > 0.9 || Math.abs(_v.y) > 1) return false;
  return lineOfSight(camera.position.x, camera.position.z, M.x, M.z);
}

function teleportMonster(lvl, minD = 0) {
  const d = Math.max(minD, Math.max(11, 34 - lvl * 2.6));
  for (let i = 0; i < 30; i++) {
    const a = Math.random() < 0.5 ? P.yaw + (Math.random() - 0.5) * 2.4 : Math.random() * TAU;
    const r = d * (0.85 + Math.random() * 0.3);
    const x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
    if (!inBounds(x, z) || pointBlocked(x, z, 0.6) || inRoof(x, z)) continue;
    M.x = x; M.z = z;
    return true;
  }
  return false;
}

function updateMonster(dt) {
  const dx = P.x - M.x, dz = P.z - M.z, dist = Math.hypot(dx, dz);
  M.dist = dist;
  if (!M.active) {
    // The opening glimpse: he stands at the treeline until you notice him.
    if (M.intro) {
      if (monsterSeen(dist, 30)) M.seenT += dt;
      if (M.seenT > 0.5 || dist < 16) { M.intro = false; M.group.visible = false; fxBurst(0.7); blip(); }
    }
    placeMonster(dx, dz, 0);
    return;
  }
  const lvl = finalPhase ? 9 : found.size;
  const seen = monsterSeen(dist, 26);
  if (M.grace > 0) M.grace -= dt;
  if (seen) {
    if (!M.seen && time - M.lastSting > 12) { sting(clamp(1.3 - dist / 30, 0.35, 1)); M.lastSting = time; }
    fear += dt * (0.08 + 1.1 / Math.max(dist, 2.5)) * (0.7 + lvl * 0.06);
  } else {
    fear = Math.max(0, fear - dt * 0.1);
    if (M.grace <= 0 && dist > 0.5) {
      const spd = 0.5 + lvl * 0.32;
      M.x += dx / dist * spd * dt; M.z += dz / dist * spd * dt;
    }
  }
  M.seen = seen;
  M.tp -= dt;
  if (M.tp <= 0 && !seen && M.grace <= 0) {
    if (teleportMonster(lvl)) blip(0.08);
    M.tp = Math.max(5, 20 - lvl * 1.8) * (0.7 + Math.random() * 0.6);
  }
  if (fear >= 1 || dist < 1.3) caught();
  placeMonster(dx, dz, seen ? fear : 0);
}

function placeMonster(dx, dz, jitter) {
  M.group.position.set(M.x + (Math.random() - 0.5) * 0.12 * jitter, groundH(M.x, M.z), M.z + (Math.random() - 0.5) * 0.12 * jitter);
  M.group.rotation.y = Math.atan2(dx, dz);
  M.group.rotation.z = Math.sin(time * 0.7) * 0.015;
}
