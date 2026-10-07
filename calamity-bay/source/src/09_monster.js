// Calamity Bay — the two monsters: low-poly rigs, procedural animation, movement, attacks, specials

const MDEF = {
  sea: {
    id: 'sea', name: 'TIDEMAW', origin: 'Rises from Calamity Bay', H: 42, rad: 8.5, walk: 11.5, run: 20, hp: 1400, armor: 0.85, stride: 15,
    heal: 'Heals while standing in the bay', heavy: 'Tail Sweep', special: 'Abyssal Beam', roar: 'Shriek',
    blurb: 'An armoured reptile from the trench beyond the harbour. Slow, enormous, and the plates on its back are starting to glow.',
    stats: { HEALTH: 0.95, SPEED: 0.55, POWER: 0.85 }, color: '#4fd8ff',
  },
  mtn: {
    id: 'mtn', name: 'OROGEN', origin: 'Bursts out of Mount Kessel', H: 38, rad: 8.5, walk: 13.5, run: 24, hp: 1100, armor: 1, stride: 13,
    heal: 'Heals while standing on the mountain', heavy: 'Ground Pound', special: 'Magma Leap', roar: 'Chest Beat',
    blurb: 'A lava-veined ape made of the mountain itself. Fast, furious, and it can jump a city block.',
    stats: { HEALTH: 0.75, SPEED: 0.85, POWER: 0.9 }, color: '#ff8a2a',
  },
};
const MON = {
  on: false, def: null, rig: null, x: 0, z: 0, y: 0, yaw: 0, speed: 0, turn: 0, hp: 1, rage: 0, act: null, queue: null, combo: 0, comboT: 0,
  cool: { heavy: 0, roar: 0 }, held: null, phase: 0, hurtT: 0, dead: false, deadT: 0, calm: 0, ctl: true, air: null, run: false, beamOn: false,
};
const AIM = { o: new V3(), d: new V3(0, 0, 1), p: new V3(), yaw: 0, pitch: 0 };

// ---------- rig construction ----------
function mmat(c, emissive) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(...c), flatShading: true, roughness: 0.82, metalness: 0.04, emissive: new THREE.Color(...(emissive || [0, 0, 0])) });
}
function limbGeo(r0, r1, len, seg = 7) { return new THREE.CylinderGeometry(r0, r1, len, seg).translate(0, -len / 2, 0); }
function tailGeo(r0, r1, len) { return new THREE.CylinderGeometry(r0, r1, len, 7).rotateX(Math.PI / 2).translate(0, 0, -len / 2); }
function part(parent, geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p); m.rotation.set(...r); m.scale.set(...s);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function joint(parent, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z); g.rotation.set(rx, ry, rz);
  parent.add(g);
  return g;
}

function buildTidemaw() {
  const skin = mmat([0.2, 0.25, 0.22]), belly = mmat([0.46, 0.44, 0.35]), dark = mmat([0.13, 0.15, 0.14]);
  const claw = mmat([0.82, 0.79, 0.68]), eye = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  const glow = mmat([0.7, 0.86, 0.9], [0.2, 0.75, 1.0]);
  const R = { mats: { skin, belly, dark }, glow, root: new THREE.Group() };
  R.body = joint(R.root, 0, 0, 0);
  R.hips = joint(R.body, 0, 17, 0);
  part(R.hips, new THREE.IcosahedronGeometry(6.2, 1), skin, [0, 0, -0.5], [0, 0, 0], [1.15, 0.9, 1.25]);
  R.legs = [];
  for (const s of [-1, 1]) {
    const hip = joint(R.hips, s * 4.6, -1.2, 0.2);
    part(hip, limbGeo(3.9, 3.0, 8.5), skin);
    const knee = joint(hip, 0, -8.5, 0);
    part(knee, limbGeo(2.9, 2.3, 6.3), skin);
    const ankle = joint(knee, 0, -6.3, 0);
    part(ankle, new THREE.BoxGeometry(4.6, 2.2, 7.2), dark, [0, 0.1, 1.6]);
    for (const dx of [-1.5, 0, 1.5]) part(ankle, new THREE.ConeGeometry(0.6, 2.2, 5), claw, [dx, -0.4, 5.6], [Math.PI / 2, 0, 0]);
    R.legs.push({ hip, knee, ankle, s });
  }
  R.tail = [];
  let par = joint(R.hips, 0, 0.6, -5.2);
  const droop = [-0.55, 0, 0, 0, 0.25, 0.2, 0.05, 0.05, 0.03, 0.02];
  for (let i = 0; i < 10; i++) {
    const len = 5 - i * 0.2, r0 = 4.6 * (1 - i / 11) + 0.35, r1 = 4.6 * (1 - (i + 1) / 11) + 0.35;
    const seg = i === 0 ? par : joint(par, 0, 0, -(5 - (i - 1) * 0.2));
    seg.rotation.x = droop[i];
    part(seg, tailGeo(r0, r1, len), skin);
    if (i < 8) part(seg, new THREE.ConeGeometry(1, 1, 4), glow, [0, r0 * 0.85, -len * 0.5], [-0.6, 0, 0], [0.25 * r0 * 0.6, 2.4 * (1.4 - i * 0.12), 1.3 * r0 * 0.5]);
    R.tail.push(seg);
    par = seg;
  }
  R.torso = joint(R.hips, 0, 1.5, 0.3, 0.28);
  part(R.torso, new THREE.CylinderGeometry(4.8, 6.4, 14, 8).translate(0, 7, 0), skin, [0, 0, 0], [0, 0, 0], [1, 1, 0.95]);
  part(R.torso, new THREE.CylinderGeometry(3.9, 5.1, 11.5, 8).translate(0, 6.4, 0), belly, [0, 0, 1.6]);
  for (let k = 0; k < 6; k++) {
    const sz = [2.4, 3.3, 4.2, 4.6, 4.0, 3.0][k], y = 1.5 + k * 2.3, rz = lerp(6.1, 4.9, k / 5);
    part(R.torso, new THREE.ConeGeometry(1, 1, 4), glow, [0, y, -rz - sz * 0.3], [-0.55, 0, 0], [0.32, sz * 1.25, sz * 0.75]);
    for (const s of [-1, 1]) part(R.torso, new THREE.ConeGeometry(1, 1, 4), glow, [s * 1.7, y - 0.8, -rz - sz * 0.05], [-0.55, 0, s * 0.25], [0.26, sz * 0.8, sz * 0.5]);
  }
  R.neck = joint(R.torso, 0, 13.5, 0.6, -0.35);
  part(R.neck, new THREE.CylinderGeometry(3.4, 4.3, 6, 8).translate(0, 3, 0), skin);
  for (let k = 0; k < 2; k++) part(R.neck, new THREE.ConeGeometry(1, 1, 4), glow, [0, 1.5 + k * 2.4, -3.8], [-0.5, 0, 0], [0.28, 2.6, 1.6]);
  R.head = joint(R.neck, 0, 5.5, 0.8, 0.12);
  part(R.head, new THREE.BoxGeometry(5.2, 4.4, 6), skin, [0, 1.4, 1.2]);
  part(R.head, new THREE.BoxGeometry(4.2, 2.8, 5.5), skin, [0, 0.9, 5.4]);
  part(R.head, new THREE.BoxGeometry(5.6, 1.1, 2.4), dark, [0, 3.3, 3.4], [0.25, 0, 0]);
  for (const s of [-1, 1]) {
    part(R.head, new THREE.BoxGeometry(0.9, 0.55, 0.7), eye, [s * 2.25, 2.55, 4.05]);
    part(R.head, new THREE.ConeGeometry(0.7, 2.6, 4), dark, [s * 1.8, 3.6, -1.2], [-1.0, 0, s * -0.3]);
  }
  R.jaw = joint(R.head, 0, -0.3, 2.4);
  part(R.jaw, new THREE.BoxGeometry(3.9, 1.3, 6), belly, [0, -0.6, 3.1]);
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) part(R.jaw, new THREE.ConeGeometry(0.3, 0.9, 4), claw, [s * 1.5, 0.3, 1.2 + k * 1.3]);
  R.mouthGlow = part(R.head, new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xbff4ff }), [0, 0.2, 6.2]);
  R.mouthGlow.visible = false; R.mouthGlow.castShadow = false;
  R.arms = [];
  for (const s of [-1, 1]) {
    const sh = joint(R.torso, s * 5.6, 11, 1.8, -0.7, 0, s * 0.25);
    part(sh, limbGeo(1.9, 1.6, 6), skin);
    const el = joint(sh, 0, -6, 0, -1.0);
    part(el, limbGeo(1.6, 1.3, 5.5), skin);
    const hand = joint(el, 0, -5.5, 0);
    part(hand, new THREE.BoxGeometry(2, 1.4, 1.8), dark, [0, -0.6, 0]);
    for (const dx of [-0.6, 0, 0.6]) part(hand, new THREE.ConeGeometry(0.3, 1.8, 4), claw, [dx, -1.9, 0.5], [0.4, 0, 0]);
    R.arms.push({ sh, el, hand, s });
  }
  return R;
}

function buildOrogen() {
  const fur = mmat([0.3, 0.22, 0.17]), face = mmat([0.2, 0.18, 0.18]), rock = mmat([0.44, 0.41, 0.39]);
  const eye = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  const glow = mmat([0.95, 0.5, 0.15], [1.0, 0.38, 0.05]);
  const R = { mats: { skin: fur, belly: face, dark: rock }, glow, root: new THREE.Group() };
  R.body = joint(R.root, 0, 0, 0);
  R.hips = joint(R.body, 0, 14, -1);
  part(R.hips, new THREE.IcosahedronGeometry(6, 1), fur, [0, 0, 0], [0, 0, 0], [1.3, 0.9, 1.1]);
  R.legs = [];
  for (const s of [-1, 1]) {
    const hip = joint(R.hips, s * 5.6, -1, 0);
    part(hip, limbGeo(4.2, 3.5, 7.2), fur);
    const knee = joint(hip, 0, -7.2, 0);
    part(knee, limbGeo(3.4, 3.0, 5.6), fur);
    const ankle = joint(knee, 0, -5.6, 0);
    part(ankle, new THREE.BoxGeometry(5.4, 2.2, 6.6), face, [0, 0.9, 1.2]);
    part(ankle, new THREE.DodecahedronGeometry(2, 0), rock, [s * 1.2, 1.6, -1.2]);
    R.legs.push({ hip, knee, ankle, s });
  }
  R.tail = [];
  R.torso = joint(R.hips, 0, 1, 0, 0.5);
  part(R.torso, new THREE.IcosahedronGeometry(6.5, 1), fur, [0, 4, 0.8], [0, 0, 0], [1.15, 1, 0.95]);
  part(R.torso, new THREE.IcosahedronGeometry(9, 1), fur, [0, 11, 0], [0, 0, 0], [1.3, 1, 0.95]);
  part(R.torso, new THREE.IcosahedronGeometry(5.5, 0), face, [0, 9.5, 5.6], [0, 0, 0], [1.4, 1.1, 0.5]);
  const rocks = [[0, 15, -6.5, 4.4], [-4.5, 9.5, -7, 3.4], [4.5, 9.5, -7, 3.4], [-7, 16, -2.5, 3.6], [7, 16, -2.5, 3.6], [0, 5, -6.5, 3], [-3.5, 19, -3, 2.8], [3.5, 19, -3, 2.8]];
  for (const [x, y, z, r] of rocks) part(R.torso, new THREE.DodecahedronGeometry(r, 0), rock, [x, y, z], [x, y, z]);
  const crystals = [[-2.4, 13, -9.5, 1.5], [2.4, 13, -9.5, 1.5], [0, 9, -9.5, 1.2], [-6.2, 12, -6, 1.1], [6.2, 12, -6, 1.1], [0, 19.5, -6.5, 1.7], [-1.8, 6, -8.6, 1]];
  for (const [x, y, z, r] of crystals) part(R.torso, new THREE.OctahedronGeometry(1, 0), glow, [x, y, z], [-0.6, x * 0.1, x * 0.08], [r * 0.6, r * 2.2, r * 0.6]);
  R.neck = joint(R.torso, 0, 17.5, 4.5, -0.5);
  R.head = joint(R.neck, 0, 0, 0);
  part(R.head, new THREE.IcosahedronGeometry(3.8, 1), fur, [0, 1.5, 0.6], [0, 0, 0], [1.1, 1, 1.05]);
  part(R.head, new THREE.BoxGeometry(4.2, 3, 3), face, [0, 0.6, 3.4]);
  part(R.head, new THREE.BoxGeometry(5.4, 1.4, 2), rock, [0, 3.0, 3.0], [0.2, 0, 0]);
  for (const s of [-1, 1]) part(R.head, new THREE.BoxGeometry(0.8, 0.5, 0.4), eye, [s * 1.3, 2.2, 4.3]);
  R.jaw = joint(R.head, 0, -0.5, 2.6);
  part(R.jaw, new THREE.BoxGeometry(3.6, 1.4, 3.2), face, [0, -0.6, 1.2]);
  R.mouthGlow = part(R.head, new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb060 }), [0, 0.2, 4.2]);
  R.mouthGlow.visible = false;
  R.arms = [];
  for (const s of [-1, 1]) {
    const sh = joint(R.torso, s * 10, 14.5, 0.5, -0.45, 0, s * 0.18);
    part(sh, new THREE.DodecahedronGeometry(4.4, 0), rock, [s * 0.6, 1.6, 0]);
    part(sh, limbGeo(3.8, 3.2, 10.5), fur);
    const el = joint(sh, 0, -10.5, 0, -0.25);
    part(el, limbGeo(3.3, 3.9, 9.5), fur);
    part(el, new THREE.DodecahedronGeometry(2.4, 0), rock, [s * 1.8, -5, -1.5]);
    const hand = joint(el, 0, -9.5, 0);
    part(hand, new THREE.DodecahedronGeometry(3.8, 0), face, [0, -2.2, 0.3]);
    part(hand, new THREE.BoxGeometry(5, 1.6, 2.4), rock, [0, -2.6, 2.6]);
    R.arms.push({ sh, el, hand, s });
  }
  return R;
}

function captureRest(R) {
  R.joints = [];
  R.root.traverse((o) => { if (o.isGroup) { o.userData.r0 = o.rotation.clone(); o.userData.p0 = o.position.clone(); R.joints.push(o); } });
}
function createMonster(id) {
  if (MON.rig) scene.remove(MON.rig.root);
  const def = MDEF[id];
  const R = id === 'sea' ? buildTidemaw() : buildOrogen();
  captureRest(R);
  scene.add(R.root);
  Object.assign(MON, { on: true, def, rig: R, hp: def.hp, rage: 0, act: null, queue: null, combo: 0, comboT: 0, held: null, speed: 0, turn: 0, dead: false, deadT: 0, hurtT: 0, air: null, beamOn: false, ctl: false });
  MON.cool.heavy = 0; MON.cool.roar = 0;
  return R;
}

// ---------- helpers ----------
const wp = new V3(), wp2 = new V3();
function jointPos(j, out, x = 0, y = 0, z = 0) { return out.set(x, y, z).applyMatrix4(j.matrixWorld); }
function handPos(out, side = 1) {
  const a = MON.rig.arms[side > 0 ? 1 : 0];
  return jointPos(a.hand, out, 0, MON.def.id === 'mtn' ? -2.4 : -1.2, 0.5);
}
function mouthPos(out) { return jointPos(MON.rig.head, out, 0, 0.6, MON.def.id === 'sea' ? 7.5 : 4.5); }
function facing(out) { return out.set(Math.sin(MON.yaw), 0, Math.cos(MON.yaw)); }
const ease = (k) => k * k * (3 - 2 * k);
const seg01 = (k, a, b) => clamp((k - a) / (b - a), 0, 1);

// ---------- attacks ----------
// pose(R, k) adds to the rest pose; win = [k0, k1, fn] active hit windows; ev = [[k, fn]] one-shot events
const ATK = {
  swipe: {
    dur: 0.62,
    pose(R, k, s) {
      const a = R.arms[s > 0 ? 1 : 0], w = ease(seg01(k, 0, 0.35)), st = ease(seg01(k, 0.35, 0.62)), back = 1 - ease(seg01(k, 0.7, 1));
      a.sh.rotation.x -= (1.25 * w) * back + (st > 0 ? 0 : 0);
      a.sh.rotation.z += s * (0.7 * w - 1.6 * st) * back;
      a.el.rotation.x += 0.7 * w * back;
      R.torso.rotation.y += s * (0.35 * w - 0.85 * st) * back;
    },
    win: [[0.33, 0.62, (s) => armHit(s, 10, 170, 15)]],
    ev: [[0.3, () => whoosh(1)]],
  },
  punch: {
    dur: 0.56,
    pose(R, k, s) {
      const a = R.arms[s > 0 ? 1 : 0], w = ease(seg01(k, 0, 0.32)), st = ease(seg01(k, 0.32, 0.48)), back = 1 - ease(seg01(k, 0.62, 1));
      a.sh.rotation.x += (0.7 * w - 2.0 * st) * back;
      a.el.rotation.x += (-1.3 * w + 1.3 * st) * back;
      a.sh.rotation.z -= s * 0.25 * st * back;
      R.torso.rotation.y += s * (0.35 * w - 0.7 * st) * back;
      R.torso.rotation.x += 0.15 * st * back;
    },
    win: [[0.36, 0.56, (s) => armHit(s, 9.5, 190, 18)]],
    ev: [[0.3, () => whoosh(1.1)]],
  },
  stompSlam: {
    dur: 0.95,
    pose(R, k) {
      const L = R.legs[1], up = ease(seg01(k, 0, 0.5)), dn = ease(seg01(k, 0.5, 0.62)), back = 1 - ease(seg01(k, 0.75, 1));
      L.hip.rotation.x -= (1.1 * up - 1.1 * dn) * back;
      L.knee.rotation.x += (1.3 * up - 1.3 * dn) * back;
      R.torso.rotation.x -= 0.2 * up * (1 - dn) * back;
      R.body.rotation.z += 0.06 * up * (1 - dn) * back;
      R.arms.forEach((a) => { a.sh.rotation.z += a.s * 0.5 * up * back; });
    },
    ev: [[0.62, () => { jointPos(MON.rig.legs[1].ankle, wp); groundImpact(wp.x, wp.z, 16, 240, 22, 0.8); }]],
  },
  smash: {
    dur: 1.0,
    pose(R, k) {
      const up = ease(seg01(k, 0, 0.45)), dn = ease(seg01(k, 0.45, 0.6)), back = 1 - ease(seg01(k, 0.72, 1));
      R.arms.forEach((a) => { a.sh.rotation.x -= (2.4 * up - 1.2 * dn) * back; a.el.rotation.x += 0.4 * up * (1 - dn) * back; a.sh.rotation.z -= a.s * 0.15 * up * back; });
      R.torso.rotation.x += (-0.35 * up + 0.75 * dn) * back;
      R.hips.position.y -= 2.5 * dn * back;
    },
    ev: [[0.58, () => { facing(wp); groundImpact(MON.x + wp.x * 14, MON.z + wp.z * 14, 17, 280, 26, 0.9); }]],
  },
  tailSpin: {
    dur: 1.3,
    pose(R, k) {
      const sp = ease(seg01(k, 0.12, 0.85));
      R.body.rotation.y += sp * TAU;
      R.body.position.y -= Math.sin(sp * Math.PI) * 1.5;
      R.tail.forEach((t, i) => { t.rotation.y += Math.sin(sp * Math.PI) * 0.12 * (i < 6 ? 1 : 0.5); t.rotation.x += Math.sin(sp * Math.PI) * (i === 0 ? 0.3 : 0.02); });
      R.arms.forEach((a) => { a.sh.rotation.z += a.s * 0.6 * Math.sin(sp * Math.PI); });
    },
    win: [[0.2, 0.85, () => tailHit()]],
    ev: [[0.18, () => whoosh(1.8)], [0.5, () => whoosh(1.5)]],
  },
  pound: {
    dur: 1.35,
    pose(R, k) {
      const up = ease(seg01(k, 0, 0.5)), dn = ease(seg01(k, 0.5, 0.62)), back = 1 - ease(seg01(k, 0.75, 1));
      R.torso.rotation.x += (-0.55 * up + 0.95 * dn) * back;
      R.arms.forEach((a) => { a.sh.rotation.x -= (2.8 * up - 1.5 * dn) * back; a.sh.rotation.z += a.s * 0.3 * up * (1 - dn) * back; a.el.rotation.x += 0.3 * up * back; });
      R.hips.position.y += (1.5 * up - 4 * dn) * back;
      R.legs.forEach((l) => { l.knee.rotation.x += 0.6 * dn * back; l.hip.rotation.x -= 0.4 * dn * back; });
    },
    ev: [[0.6, () => { facing(wp); shockwave(MON.x + wp.x * 10, MON.z + wp.z * 10, 52, 230, 14); }]],
  },
  grab: {
    dur: 0.55,
    pose(R, k) {
      const a = R.arms[1], w = Math.sin(seg01(k, 0, 1) * Math.PI);
      a.sh.rotation.x -= 1.1 * w; a.el.rotation.x += 0.5 * w;
      R.torso.rotation.x += 0.35 * w;
    },
    ev: [[0.5, () => tryGrab()]],
  },
  throw: {
    dur: 0.6,
    pose(R, k) {
      const a = R.arms[1], w = ease(seg01(k, 0, 0.4)), st = ease(seg01(k, 0.4, 0.55)), back = 1 - ease(seg01(k, 0.65, 1));
      a.sh.rotation.x += (-2.6 * w + 1.2 * st) * back;
      a.el.rotation.x += 0.9 * w * (1 - st) * back;
      R.torso.rotation.y += (0.4 * w - 0.8 * st) * back;
      R.torso.rotation.x += (-0.2 * w + 0.35 * st) * back;
    },
    ev: [[0.5, () => throwHeld()], [0.42, () => whoosh(1.3)]],
  },
  roar: {
    dur: 2.3,
    pose(R, k) {
      const w = Math.sin(clamp(k * 1.25, 0, 1) * Math.PI);
      R.neck.rotation.x -= 0.45 * w; R.head.rotation.x -= 0.3 * w;
      R.jaw.rotation.x += 0.7 * w;
      R.torso.rotation.x -= 0.2 * w;
      if (MON.def.id === 'mtn') {
        R.arms.forEach((a, i) => {
          const beat = Math.max(0, Math.sin(k * 26 + i * Math.PI));
          a.sh.rotation.x -= (1.2 + 0.4 * beat) * w; a.el.rotation.x -= 1.4 * w; a.sh.rotation.z -= a.s * (0.6 + 0.35 * beat) * w;
        });
      } else R.arms.forEach((a) => { a.sh.rotation.z += a.s * 0.7 * w; a.sh.rotation.x -= 0.3 * w; });
    },
    ev: [[0.12, () => doRoar()]],
  },
  leap: {
    dur: 0.42,
    pose(R, k) {
      const c = Math.sin(seg01(k, 0, 1) * Math.PI * 0.5);
      R.hips.position.y -= 5 * c;
      R.legs.forEach((l) => { l.hip.rotation.x -= 0.9 * c; l.knee.rotation.x += 1.5 * c; l.ankle.rotation.x -= 0.6 * c; });
      R.torso.rotation.x += 0.35 * c;
      R.arms.forEach((a) => { a.sh.rotation.x += 0.8 * c; });
    },
    ev: [[1, () => launchLeap()]],
  },
  beam: {
    dur: 999,
    pose(R, k, s, t) {
      const ch = clamp(t / 0.9, 0, 1);
      R.jaw.rotation.x += 0.55 * ch;
      R.torso.rotation.x -= 0.1 * ch;
      R.arms.forEach((a) => { a.sh.rotation.z += a.s * 0.3 * ch; });
      R.tail.forEach((tl, i) => { tl.rotation.y += Math.sin(t * 9 - i) * 0.03 * ch; });
    },
  },
};

function startAct(type, side = 1) {
  const A = ATK[type];
  MON.act = { type, t: 0, dur: A.dur, side, fired: new Set(), tags: new Set(), id: Math.random() };
  // attacks go where the camera looks
  if (type !== 'leap' && type !== 'grab') MON.yawT = AIM.yaw;
}
function armHit(s, r, dmg, force) {
  const a = MON.rig.arms[s > 0 ? 1 : 0];
  facing(wp2);
  jointPos(a.hand, wp, 0, -2, 0.5);
  hitSphere(wp.x, wp.y, wp.z, r, dmg, wp2.x, 0.15, wp2.z, force, MON.act.tags);
  jointPos(a.el, wp, 0, -2, 0);
  hitSphere(wp.x, wp.y, wp.z, r * 0.8, dmg * 0.6, wp2.x, 0.1, wp2.z, force * 0.7, MON.act.tags);
}
function tailHit() {
  const T = MON.rig.tail;
  for (let i = 3; i < T.length; i += 2) {
    jointPos(T[i], wp, 0, 0, -2);
    wp2.set(wp.x - MON.x, 0, wp.z - MON.z).normalize();
    const tx = -wp2.z, tz = wp2.x; // tangential fling
    hitSphere(wp.x, Math.max(wp.y, 4), wp.z, 8 + i * 0.3, 170, tx * 0.6 + wp2.x * 0.6, 0.25, tz * 0.6 + wp2.z * 0.6, 20, MON.act.tags);
  }
}

// Damage everything inside a sphere. dir* is the push direction, force its strength.
function hitSphere(x, y, z, r, dmg, dx, dy, dz, force, tags) {
  let blocks = 0;
  blocksInSphere(x, y, z, r, (id, d) => {
    if (tags) { if (tags.has(id)) return; tags.add(id); }
    const B = BLK_[id];
    const f = 1 - 0.55 * d / r;
    const rx = B.x - x, rz = B.z - z, rl = Math.hypot(rx, rz) || 1;
    if (damageBlock(id, dmg * f, dx * force + rx / rl * force * 0.4, dy * force + 2, dz * force + rz / rl * force * 0.4, true)) blocks++;
  });
  bodiesNear(x, y, z, r, (b) => {
    if (b.held || b.members || b.hinge) return;
    if (tags) { if (tags.has(b)) return; tags.add(b); }
    wakeBody(b);
    const k = clamp(80 / b.m, 0.2, 1.4) * force;
    b.v.x += dx * k + frand(-2, 2); b.v.y += Math.max(dy * k, 0) + k * 0.35; b.v.z += dz * k + frand(-2, 2);
    b.w.x += frand(-2, 2); b.w.z += frand(-2, 2);
  });
  if (y - r < 6) {
    agentsNear(x, z, r, (o) => {
      if (o.vmax !== undefined) wreckCar(o, dx * force * 1.5 + frand(-3, 3), force * 0.8 + frand(2, 6), dz * force * 1.5 + frand(-3, 3), false);
      else killPerson(o);
    });
    crushTrees(x, z, r * 0.8, _v4.set(dx * force, 0, dz * force));
  }
  hitUnits(x, y, z, r, dx, dz, force);
  if (blocks) { addShake(Math.min(0.5, 0.08 + blocks * 0.03), _v3.set(x, y, z)); MON.rage = Math.min(100, MON.rage + blocks * 0.6); }
  return blocks;
}
// A foot or fist hitting the ground: crush the small stuff, crack the base of big things.
function groundImpact(x, z, r, dmg, force, sh) {
  const gy = Math.max(terrainH(x, z), 0);
  blocksInSphere(x, gy + 3, z, r, (id, d) => {
    const B = BLK_[id];
    const low = B.y + B.hy < 10;
    damageBlock(id, (low ? dmg : dmg * 0.3) * (1 - 0.5 * d / r), (B.x - x) * 0.4, 6, (B.z - z) * 0.4, true);
  });
  bodiesNear(x, gy, z, r * 1.6, (b) => {
    if (b.held || b.members) return;
    wakeBody(b);
    const dx = b.p.x - x, dz = b.p.z - z, dl = Math.hypot(dx, dz) || 1, k = clamp(60 / b.m, 0.25, 1.2) * force * (1 - dl / (r * 1.8));
    b.v.x += dx / dl * k * 0.4; b.v.y += k; b.v.z += dz / dl * k * 0.4;
  });
  crushAt(x, z, r * 0.7, null, force);
  agentsNear(x, z, r * 1.5, (o) => { if (o.vmax !== undefined) wreckCar(o, (o.x - x) * 0.3, force * 0.7, (o.z - z) * 0.3, false); });
  if (gy < WATER_Y + 0.5 && terrainH(x, z) < WATER_Y) splashAt(x, z, r * 0.4);
  else groundDust(x, z, r, 14);
  ring(x, gy + 0.6, z, r * 2.2, 0.7);
  stompSound(_v3.set(x, gy, z), 1.3);
  addShake(sh, _v3);
}
function shockwave(x, z, R, dmg, height) {
  const gy = Math.max(terrainH(x, z), 0);
  for (let h = 3; h < height; h += 7) {
    blocksInSphere(x, gy + h, z, R, (id, d) => {
      const B = BLK_[id];
      if (B.y - B.hy > height) return;
      const dd = Math.hypot(B.x - x, B.z - z);
      if (dd > R) return;
      const f = 1 - dd / R;
      damageBlock(id, dmg * (0.25 + 0.75 * f) * (B.y < 12 ? 1 : 0.5), (B.x - x) / (dd + 1) * 12, 5, (B.z - z) / (dd + 1) * 12, true);
    });
  }
  bodiesNear(x, gy, z, R, (b) => {
    if (b.held || b.members) return;
    wakeBody(b);
    const dx = b.p.x - x, dz = b.p.z - z, dl = Math.hypot(dx, dz) || 1, f = 1 - dl / R, k = clamp(80 / b.m, 0.3, 1.5) * 26 * f;
    b.v.x += dx / dl * k; b.v.y += k * 0.9; b.v.z += dz / dl * k;
    b.w.x += frand(-3, 3); b.w.z += frand(-3, 3);
  });
  agentsNear(x, z, R * 1.1, (o) => {
    const dx = o.x - x, dz = o.z - z, dl = Math.hypot(dx, dz) || 1, f = 1 - dl / (R * 1.1);
    if (o.vmax !== undefined) wreckCar(o, dx / dl * 22 * f, 10 + 20 * f, dz / dl * 22 * f, false);
    else killPerson(o);
  });
  crushTrees(x, z, R * 0.8, _v4.set(0, 0, 0));
  crushUnits(x, z, R, 20);
  hitUnits(x, gy + 10, z, R * 0.6, 0, 0, 20);
  for (let i = 0; i < 3; i++) setTimeout(() => ring(x, gy + 0.8, z, R * (1 + i * 0.25), 0.9 + i * 0.2, i ? 0xc8a77a : 0xffe2b0), i * 90);
  groundDust(x, z, R * 0.7, 40);
  if (terrainH(x, z) < WATER_Y) splashAt(x, z, 8);
  stompSound(_v3.set(x, gy, z), 1.6);
  boom(_v3, 1.2);
  addShake(1.1, _v3);
}

// ---------- grab and throw ----------
function tryGrab() {
  if (MON.held) return;
  handPos(wp, 1);
  facing(wp2);
  // look in front of the monster, from hand height down to the street
  const cx = MON.x + wp2.x * 13, cz = MON.z + wp2.z * 13;
  let best = null, bd = 24;
  for (const u of UNITS) {
    if (!u.alive || u.type === 'heli' || u.type === 'jet') continue;
    const d = Math.hypot(u.x - cx, u.z - cz);
    if (d < bd) { bd = d; best = { u }; }
  }
  agentsNear(cx, cz, 24, (o) => {
    if (o.vmax === undefined) return;
    const d = Math.hypot(o.x - cx, o.z - cz) + 2;
    if (d < bd) { bd = d; best = { c: o }; }
  });
  for (const y of [wp.y, MON.y + 4]) bodiesNear(cx, y, cz, 18, (b) => {
    if (b.members || b.hinge || b.held || b.m > 1600) return;
    const d = Math.hypot(b.p.x - cx, b.p.z - cz) + 4;
    if (d < bd) { bd = d; best = { b }; }
  });
  let body = null;
  if (best && best.u) body = wreckUnit(best.u, true);
  else if (best && best.c) body = wreckCar(best.c, 0, 0, 0, false);
  else if (best && best.b) { body = best.b; if (body.fade) { body.fade = 0; body.s.copy(body.h).multiplyScalar(2); } }
  else {
    // rip a chunk out of the nearest building
    let bid = -1, bdd = 18;
    for (const y of [wp.y, MON.y + 12, MON.y + 4]) blocksInSphere(wp.x + wp2.x * 6, y, wp.z + wp2.z * 6, 16, (id, d) => { if (d < bdd && BLK_[id].hx * BLK_[id].hy * BLK_[id].hz < 900) { bdd = d; bid = id; } });
    if (bid >= 0) {
      const B = BLK_[bid];
      removeStatic(bid);
      body = spawnBlockBody(B, [0, 0, 0], [B.hx, B.hy, B.hz], 0, 0, 0, 0);
      crumbleSound(B.vol, _v3.set(B.x, B.y, B.z));
      dustAt(B.x, B.y, B.z, 6, 4);
    }
  }
  if (body && !body.dead) {
    MON.held = body; body.held = true; body.asleep = false;
    showHint(isTouch ? 'Tap GRAB again to throw' : 'Click or press E to throw', 2.5);
  } else showHint('Nothing in reach to grab', 1.5);
}
function throwHeld() {
  const b = MON.held;
  if (!b) return;
  MON.held = null;
  b.held = false;
  handPos(wp, 1);
  const tgt = AIM.p, dx = tgt.x - wp.x, dz = tgt.z - wp.z, dist = Math.max(20, Math.hypot(dx, dz));
  const sp = 125, tt = Math.min(dist / sp, 2.5);
  b.v.set(dx / tt, (tgt.y - wp.y) / tt + 0.5 * G * tt, dz / tt);
  if (b.v.length() > 190) b.v.setLength(190);
  b.w.set(frand(-3, 3), frand(-3, 3), frand(-3, 3));
  b.proj = { dmg: 260 + Math.min(300, b.m * 0.15), r: 9 + Math.min(8, b.r) };
  b.thrown = 3;
  b.age = 0; b.sleep = 0;
  THROWN.push(b);
}
const THROWN = [];
function projectileImpact(b, p) {
  explosionFx(b.p.x, b.p.y, b.p.z, 2.2);
  boom(b.p, 1.1);
  _v1.copy(b.v).normalize();
  hitSphere(b.p.x, b.p.y, b.p.z, p.r, p.dmg, _v1.x, 0.2, _v1.z, 12, null);
  addShake(0.4, b.p);
  b.v.multiplyScalar(0.3);
}

// ---------- roar ----------
function doRoar() {
  const d = MON.def;
  roarSound(d.id, mouthPos(wp));
  ring(MON.x, MON.y + d.H * 0.8, MON.z, 160, 1.4, d.id === 'sea' ? 0x8fe8ff : 0xffb070);
  addShake(0.5);
  stunUnits(MON.x, MON.z, 220, 3.5);
  for (const p of PPL) if (p.alive && Math.hypot(p.x - MON.x, p.z - MON.z) < 300) { p.flee = true; p.speed = rr(6, 8); p.fx = p.x - MON.x; p.fz = p.z - MON.z; }
  MON.rage = Math.min(100, MON.rage + 10);
}

// ---------- specials ----------
function startSpecial() {
  if (MON.rage < 100 || MON.act || MON.air) return;
  if (MON.def.id === 'sea') {
    startAct('beam');
    MON.beamOn = true;
    chargeSound();
    say('ABYSSAL BEAM', 1.4, 'sp');
  } else {
    startAct('leap');
    say('MAGMA LEAP', 1.4, 'sp');
  }
}
function stopBeam() {
  MON.beamOn = false;
  beam.visible = false;
  MON.rig.mouthGlow.visible = false;
  if (AC) { aSet(loops.beam.g.gain, 0, 0.1); aSet(loops.beamTone.g.gain, 0, 0.1); }
  if (MON.act && MON.act.type === 'beam') MON.act = null;
}
let beamTick = 0;
function updateBeam(dt) {
  const t = MON.act.t;
  const R = MON.rig;
  R.glow.emissiveIntensity = 1 + Math.min(1, t / 0.9) * 2.5 + Math.sin(t * 40) * 0.3;
  if (t < 0.9) { mouthPos(wp); for (let i = 0; i < 3; i++) emit(glowPS, wp.x + frand(-6, 6), wp.y + frand(-6, 6), wp.z + frand(-6, 6), 0, 0, 0, 2, -1.5, 0.3, 0.4, 0.9, 1, 0.8); return; }
  MON.rage -= dt * 27;
  if (MON.rage <= 0) { MON.rage = 0; stopBeam(); return; }
  R.mouthGlow.visible = true;
  const from = mouthPos(wp);
  const dir = _v1.copy(AIM.p).sub(from).normalize();
  const hit = raycastCity(from.x, from.y, from.z, dir.x, dir.y, dir.z, 700, 2.5);
  const to = hit ? _v2.set(hit.x, hit.y, hit.z) : _v2.copy(from).addScaledVector(dir, 700);
  setBeam(from, to, 1 + Math.sin(t * 50) * 0.12);
  beamTick -= dt;
  if (hit) {
    hitSphere(to.x, to.y, to.z, 9, 1800 * dt, dir.x, 0.1, dir.z, 10, null);
    if (beamTick <= 0) { explosionFx(to.x, to.y, to.z, 1.8); beamTick = 0.09; if (Math.random() < 0.4) boom(to, 0.6); }
    for (let i = 0; i < 3; i++) fireAt(to.x + frand(-4, 4), to.y + frand(-4, 4), to.z + frand(-4, 4), 4);
  }
  beamUnits(from, to);
  for (let i = 0; i < 2; i++) { const k = Math.random(); emit(glowPS, lerp(from.x, to.x, k), lerp(from.y, to.y, k), lerp(from.z, to.z, k), frand(-3, 3), frand(-3, 3), frand(-3, 3), 3, -2, 0.4, 0.5, 0.9, 1, 0.7); }
  addShake(0.04);
  if (AC) { aSet(loops.beam.g.gain, 0.3, 0.05); aSet(loops.beamTone.g.gain, 0.12, 0.05); loops.beamTone.o.frequency.value = 55 + Math.sin(t * 7) * 6; }
}
function launchLeap() {
  facing(wp2);
  const ax = AIM.p.x - MON.x, az = AIM.p.z - MON.z;
  let d = Math.hypot(ax, az);
  let dx = d > 1 ? ax / d : wp2.x, dz = d > 1 ? az / d : wp2.z;
  d = clamp(d, 50, 170);
  const tx = clamp(MON.x + dx * d, MAP.x0, MAP.x1), tz = clamp(MON.z + dz * d, MAP.z0, MAP.z1);
  MON.air = { t: 0, T: 1.5, x0: MON.x, z0: MON.z, y0: MON.y, x1: tx, z1: tz, y1: terrainH(tx, tz), h: 60, tags: new Set() };
  MON.yaw = Math.atan2(dx, dz);
  MON.rage = 0;
  roarSound('mtn', _v3.set(MON.x, MON.y + 30, MON.z));
  groundDust(MON.x, MON.z, 20, 20);
  stompSound(_v3, 1);
}
function updateLeap(dt) {
  const A = MON.air;
  A.t += dt;
  const k = clamp(A.t / A.T, 0, 1);
  MON.x = lerp(A.x0, A.x1, k); MON.z = lerp(A.z0, A.z1, k);
  MON.y = lerp(A.y0, A.y1, k) + Math.sin(k * Math.PI) * A.h;
  const R = MON.rig;
  R.body.rotation.x = Math.sin(k * Math.PI) * 0.35 - 0.2 * k;
  R.arms.forEach((a) => { a.sh.rotation.x -= 2.4 * Math.sin(k * Math.PI); a.sh.rotation.z += a.s * 0.4; });
  R.legs.forEach((l) => { l.knee.rotation.x += 0.9 * Math.sin(k * Math.PI); l.hip.rotation.x -= 0.5 * Math.sin(k * Math.PI); });
  hitUnits(MON.x, MON.y + MON.def.H * 0.5, MON.z, 24, 0, 0, 30);
  if (Math.random() < 0.5) fireAt(MON.x + frand(-6, 6), MON.y + frand(5, 25), MON.z + frand(-6, 6), 4);
  if (k >= 1) {
    MON.air = null;
    R.body.rotation.x = 0;
    shockwave(MON.x, MON.z, 85, 360, 34);
    hitSphere(MON.x, MON.y + 8, MON.z, 22, 600, 0, 0.3, 0, 25, null);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + Math.random() * 0.4, r = rr(14, 55);
      const x = MON.x + Math.cos(a) * r, z = MON.z + Math.sin(a) * r;
      addEmitter({ kind: 'lava', x, y: Math.max(0, terrainH(x, z)), z, life: rr(8, 14) });
    }
    for (let i = 0; i < 18; i++) spawnRock(MON.x + frand(-8, 8), MON.y + 2, MON.z + frand(-8, 8), rr(1.5, 3.5), frand(-18, 18), rr(12, 30), frand(-18, 18), [0.35, 0.3, 0.28]);
    MON.act = null;
  }
}

// ---------- footsteps ----------
let lastStepPh = 0;
function footstep(side) {
  const L = MON.rig.legs[side > 0 ? 1 : 0];
  jointPos(L.ankle, wp, 0, 0, 1.6);
  const fx = wp.x, fz = wp.z, gy = terrainH(fx, fz);
  const run = MON.speed > MON.def.walk * 1.2;
  crushAt(fx, fz, 6.5, 'foot');
  blocksInSphere(fx, Math.max(gy, 0) + 2, fz, 6.5, (id, d) => {
    const B = BLK_[id];
    damageBlock(id, B.y + B.hy < 9 ? 320 : 35, frand(-2, 2), 2, frand(-2, 2), true);
  });
  bodiesNear(fx, gy + 2, fz, 9, (b) => { if (!b.held && !b.members) { wakeBody(b); b.v.y += clamp(30 / b.m, 0.5, 6); b.v.x += frand(-2, 2); b.v.z += frand(-2, 2); } });
  if (gy < WATER_Y && MON.y + 6 > WATER_Y) splashAt(fx, fz, 4);
  else if (gy >= WATER_Y) { groundDust(fx, fz, 7, run ? 5 : 3); if (!inCity(fx, fz)) crushTrees(fx, fz, 7, null); }
  stompSound(_v3.set(fx, gy, fz), run ? 1 : 0.8);
  addShake(run ? 0.22 : 0.14, _v3);
}

// ---------- per-frame update ----------
const prevHeld = new V3();
function updateMonster(dt, input) {
  const d = MON.def, R = MON.rig;
  MON.cool.heavy -= dt; MON.cool.roar -= dt; MON.comboT -= dt;
  if (MON.comboT <= 0) MON.combo = 0;
  // reset pose
  for (const j of R.joints) { j.rotation.copy(j.userData.r0); j.position.copy(j.userData.p0); }
  R.glow.emissiveIntensity = 0.9 + Math.sin(clock * 2.2) * 0.25 + MON.rage / 100 * 1.2;

  if (MON.dead) { updateDeath(dt); placeRig(); return; }
  if (MON.air) { updateLeap(dt); placeRig(); updateHeld(dt); return; }

  // movement intent relative to the camera
  let mx = 0, mz = 0, mag = 0;
  if (MON.ctl && input) {
    const fy = AIM.yaw;
    mx = Math.sin(fy) * input.f + -Math.cos(fy) * input.s;
    mz = Math.cos(fy) * input.f + Math.sin(fy) * input.s;
    mag = Math.min(1, Math.hypot(mx, mz));
  }
  if (input && input.auto) { mx = input.auto.x; mz = input.auto.z; mag = 1; }
  const A = MON.act;
  let target = 0;
  let yawT = MON.yaw;
  if (mag > 0.1) {
    yawT = Math.atan2(mx, mz);
    const face = Math.max(0.15, Math.cos(angWrap(yawT - MON.yaw)));
    target = (MON.run && !(input && input.auto) ? d.run : (input && input.autoSpeed) || d.walk) * mag * face;
  }
  if (A) {
    target *= A.type === 'beam' ? 0 : 0.25;
    if (MON.yawT !== undefined && A.t < 0.15 && A.type !== 'beam') yawT = MON.yawT;
    if (A.type === 'beam') yawT = AIM.yaw;
  }
  const turnRate = (A ? 3 : 2.3) * (MON.speed > d.walk * 1.2 ? 0.75 : 1);
  const dy = angWrap(yawT - MON.yaw);
  const turn = clamp(dy, -turnRate * dt, turnRate * dt);
  MON.yaw += turn; MON.turn = lerp(MON.turn, turn / Math.max(dt, 1e-4), 0.1);
  MON.speed += clamp(target - MON.speed, -28 * dt, 14 * dt);
  // move, bulldozing what we walk into
  const fx = Math.sin(MON.yaw), fz = Math.cos(MON.yaw);
  let nx = MON.x + fx * MON.speed * dt, nz = MON.z + fz * MON.speed * dt;
  const run = MON.speed > d.walk * 1.15;
  let resist = 0;
  const bt = { x: nx, z: nz };
  for (const hh of [6, 16, 27]) {
    blocksInSphere(nx, MON.y + hh, nz, d.rad, (id) => {
      const B = BLK_[id];
      const top = B.y + B.hy;
      if (top < 8) { damageBlock(id, 900, fx * 8, 3, fz * 8, true); return; }
      const killed = damageBlock(id, (run ? 520 : 200) * dt * Math.max(0.4, MON.speed / d.walk), fx * 10 + frand(-3, 3), 2, fz * 10 + frand(-3, 3), true);
      if (!killed) {
        // push out of the block in xz
        const cx = clamp(bt.x, B.x - B.hx, B.x + B.hx), cz = clamp(bt.z, B.z - B.hz, B.z + B.hz);
        const ddx = bt.x - cx, ddz = bt.z - cz, dl = Math.hypot(ddx, ddz);
        if (dl > 1e-3 && dl < d.rad) { bt.x = cx + ddx / dl * d.rad; bt.z = cz + ddz / dl * d.rad; }
        resist++;
      }
    });
  }
  nx = bt.x; nz = bt.z;
  if (resist) { MON.speed *= Math.pow(0.15, dt); addShake(0.03); }
  MON.x = clamp(nx, MAP.x0, MAP.x1); MON.z = clamp(nz, MAP.z0, MAP.z1);
  MON.y = lerp(MON.y, terrainH(MON.x, MON.z), Math.min(1, dt * 8));
  // shove rubble and units aside
  bodiesNear(MON.x, MON.y + 4, MON.z, d.rad + 3, (b, dd) => {
    if (b.held || b.members || b.hinge) return;
    const ex = b.p.x - MON.x, ez = b.p.z - MON.z, el = Math.hypot(ex, ez) || 1;
    if (el > d.rad + b.r) return;
    wakeBody(b);
    b.v.x += ex / el * 6 + fx * MON.speed * 0.5; b.v.z += ez / el * 6 + fz * MON.speed * 0.5; b.v.y += 2;
  });
  // walk cycle and footsteps
  const prevPh = MON.phase;
  MON.phase += dt * MON.speed / d.stride * TAU;
  const a = clamp(MON.speed / d.walk, 0, 1.5);
  const s0 = Math.floor((prevPh - Math.PI / 2) / Math.PI), s1 = Math.floor((MON.phase - Math.PI / 2) / Math.PI);
  if (s1 !== s0 && MON.speed > 1.5) footstep(s1 % 2 ? 1 : -1);
  animateBase(dt, a);
  if (A) {
    A.t += dt;
    const def = ATK[A.type], k = Math.min(1, A.t / A.dur);
    def.pose(R, k, A.side, A.t);
    if (def.win) for (const [k0, k1, fn] of def.win) if (k >= k0 && k <= k1) { R.root.updateMatrixWorld(true); placeRig(); R.root.updateMatrixWorld(true); fn(A.side); }
    if (def.ev) for (const [ke, fn] of def.ev) if (k >= ke && !A.fired.has(ke)) { A.fired.add(ke); placeRig(); R.root.updateMatrixWorld(true); fn(A.side); }
    if (A.type === 'beam') { placeRig(); R.root.updateMatrixWorld(true); if (MON.beamOn) updateBeam(dt); }
    if (MON.act === A && A.t >= A.dur) { MON.act = null; if (MON.queue) { const q = MON.queue; MON.queue = null; q(); } }
  }
  placeRig();
  updateHeld(dt);
  // healing in home terrain
  const th = terrainH(MON.x, MON.z);
  MON.home = (d.id === 'sea' && th < WATER_Y - 2) || (d.id === 'mtn' && th > 22);
  MON.calm += dt;
  if (MON.home) MON.hp = Math.min(d.hp, MON.hp + 40 * dt);
  else if (MON.calm > 8) MON.hp = Math.min(d.hp, MON.hp + 2 * dt);
  // hurt flash
  MON.hurtT -= dt;
  const hf = Math.max(0, MON.hurtT) * 4;
  R.mats.skin.emissive.setRGB(hf * 0.6, hf * 0.05, 0);
  if (AC) aSet(loops.wake.g.gain, d.id === 'sea' && th < WATER_Y && MON.speed > 2 ? 0.15 : 0, 0.3);
  if (th < WATER_Y && MON.speed > 3 && Math.random() < dt * 10) {
    const wa = Math.random() * TAU;
    splashAt(MON.x + Math.cos(wa) * d.rad * 1.4, MON.z + Math.sin(wa) * d.rad * 1.4, 2.5);
  }
}
function animateBase(dt, a) {
  const R = MON.rig, d = MON.def, ph = MON.phase, t = clock;
  const ap = d.id === 'mtn' ? 1.3 : 1;
  R.legs.forEach((L) => {
    const sg = L.s, sw = Math.sin(ph + (sg > 0 ? Math.PI : 0));
    L.hip.rotation.x += -sw * 0.48 * a;
    L.knee.rotation.x += Math.max(0, Math.cos(ph + (sg > 0 ? Math.PI : 0))) * 0.95 * a;
    L.ankle.rotation.x += -(L.hip.rotation.x - L.hip.userData.r0.x + L.knee.rotation.x - L.knee.userData.r0.x) * 0.6;
  });
  R.hips.position.y -= Math.abs(Math.cos(ph)) * 0.9 * a;
  R.hips.rotation.z += Math.sin(ph) * 0.05 * a;
  R.torso.rotation.y += -Math.sin(ph) * 0.09 * a;
  R.torso.rotation.x += 0.06 * Math.max(0, a - 1) + Math.sin(t * 1.3) * 0.025;
  R.arms.forEach((ar) => { ar.sh.rotation.x += Math.sin(ph + (ar.s > 0 ? 0 : Math.PI)) * 0.32 * a * ap; });
  R.tail.forEach((s, i) => {
    s.rotation.y += Math.sin(t * 1.6 - i * 0.55) * 0.06 * (1 + a) - clamp(MON.turn, -2, 2) * 0.05;
    s.rotation.x += Math.sin(t * 1.1 - i * 0.45) * 0.015;
  });
  // look toward the aim
  const look = clamp(angWrap(AIM.yaw - MON.yaw), -0.7, 0.7);
  R.neck.rotation.y += look * 0.55;
  R.head.rotation.x += clamp(-AIM.pitch, -0.5, 0.4) * 0.5;
  R.jaw.rotation.x += Math.max(0, Math.sin(t * 0.7)) * 0.05;
}
function placeRig() {
  const R = MON.rig;
  R.root.position.set(MON.x, MON.y, MON.z);
  R.root.rotation.y = MON.yaw;
  R.root.updateMatrixWorld(true);
}
function updateHeld(dt) {
  const b = MON.held;
  if (!b) return;
  if (b.dead) { MON.held = null; return; }
  handPos(wp, 1);
  prevHeld.copy(b.p);
  b.p.set(wp.x, wp.y - b.h.y * 0.6, wp.z);
  b.q.setFromAxisAngle(UP, MON.yaw);
  b.v.copy(b.p).sub(prevHeld).divideScalar(Math.max(dt, 1e-3));
  b.age = 0;
}
function hurtMonster(dmg, pos) {
  if (MON.dead || !MON.on) return;
  MON.hp -= dmg * MON.def.armor;
  MON.hurtT = Math.max(MON.hurtT, Math.min(0.25, dmg * 0.014)); MON.calm = 0;
  MON.rage = Math.min(100, MON.rage + dmg * 0.08);
  if (Math.random() < 0.15) hurtSound();
  if (MON.hp <= 0) { MON.hp = 0; monsterDies(); }
}
function monsterCapsuleDist(x, y, z) {
  const y0 = MON.y + 4, y1 = MON.y + MON.def.H * 0.85;
  const cy = clamp(y, y0, y1);
  return Math.hypot(x - MON.x, y - cy, z - MON.z) - MON.def.rad - 1.5;
}

// ---------- death ----------
function monsterDies() {
  MON.dead = true; MON.deadT = 0; MON.act = null;
  if (MON.beamOn) stopBeam();
  if (MON.held) { MON.held.held = false; MON.held = null; }
  roarSound(MON.def.id, _v3.set(MON.x, MON.y + 30, MON.z));
}
function updateDeath(dt) {
  const R = MON.rig;
  MON.deadT += dt;
  const k = ease(clamp((MON.deadT - 1.2) / 1.6, 0, 1));
  R.neck.rotation.x -= 0.5 * Math.min(1, MON.deadT);
  R.jaw.rotation.x += 0.5 * Math.min(1, MON.deadT);
  R.body.rotation.z = k * 1.45;
  R.body.position.y = -k * 2;
  R.legs.forEach((l) => { l.knee.rotation.x += 0.6 * k; });
  if (k >= 1 && !MON.landed) {
    MON.landed = true;
    _v1.set(-Math.cos(MON.yaw), 0, Math.sin(MON.yaw));
    for (let i = 0; i < 4; i++) groundImpact(MON.x + _v1.x * (8 + i * 8), MON.z + _v1.z * (8 + i * 8), 12, 260, 12, 0.6);
  }
  R.glow.emissiveIntensity = Math.max(0, 1 - MON.deadT * 0.4);
}
