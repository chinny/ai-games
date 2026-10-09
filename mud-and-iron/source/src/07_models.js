// Mud & Iron — low-poly geometry: soldiers in several poses, team weapons, tanks and cars, buildings,
// houses and ruins, trees, sandbags, wire, sector flags and aircraft. All vertex-coloured.

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cy = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const P = (geo, p, c, r, s, o) => ({ geo, p, c, r, s, o });
const SKIN = [0.8, 0.62, 0.5], WOOD = [0.42, 0.3, 0.19], STEEL = [0.24, 0.24, 0.23], DARK = [0.13, 0.12, 0.1], CANVAS = [0.72, 0.68, 0.55];
const SAND = [0.66, 0.58, 0.41], TIMBER = [0.38, 0.29, 0.2], TAR = [0.18, 0.17, 0.16];
// A geometry shared between meshes must not be disposed when one of them goes away.
const shared = (g) => { g.userData.shared = true; return g; };

// ---------- soldiers ----------
const SOLDIER_POSES = ['stand', 'walkA', 'walkB', 'kneel', 'prone', 'dead'];
function helmetParts(kind, c) {
  if (kind === 'brodie') return [P(Cy(0.27, 0.29, 0.04, 10), [0, 1.66, 0], c), P(Cy(0.12, 0.17, 0.1, 8), [0, 1.71, 0], c)];
  if (kind === 'adrian') return [P(Cy(0.2, 0.23, 0.04, 10), [0, 1.65, 0], c), P(new THREE.SphereGeometry(0.15, 8, 4, 0, TAU, 0, Math.PI / 2), [0, 1.66, 0], c), P(B(0.03, 0.06, 0.26), [0, 1.8, 0], c)];
  return [P(Cy(0.15, 0.2, 0.2, 8), [0, 1.69, -0.01], c), P(Cy(0.21, 0.21, 0.05, 8), [0, 1.6, -0.03], c)];
}
function soldierParts(n, pose) {
  const N = NATIONS[n];
  const U = hex(N.uni), U2 = hex(N.uni2), Hc = hex(N.helm), boot = [0.2, 0.16, 0.12], put = shade(U2, 0.9);
  const parts = [];
  let la = 0, ra = 0, drop = 0, kneel = pose === 'kneel';
  if (pose === 'walkA') { la = 0.5; ra = -0.5; }
  if (pose === 'walkB') { la = -0.5; ra = 0.5; }
  const leg = (x, a) => {
    const g = B(0.19, 0.5, 0.21); g.translate(0, -0.25, 0);
    const g2 = B(0.17, 0.36, 0.19); g2.translate(0, -0.66, 0);
    const g3 = B(0.18, 0.12, 0.28); g3.translate(0, -0.86, 0.04);
    parts.push(P(g, [x, 0.9, 0], U, [a, 0, 0]), P(g2, [x, 0.9, 0], put, [a, 0, 0]), P(g3, [x, 0.9, 0], boot, [a, 0, 0]));
  };
  if (kneel) {
    drop = 0.42;
    const g = B(0.19, 0.48, 0.21); g.translate(0, -0.24, 0);
    parts.push(P(g, [0.11, 0.48, 0.05], U, [-1.45, 0, 0]));
    parts.push(P(B(0.18, 0.44, 0.2), [0.11, 0.22, 0.52], put), P(B(0.18, 0.1, 0.28), [0.11, 0.05, 0.58], boot));
    const g2 = B(0.19, 0.48, 0.21); g2.translate(0, -0.24, 0);
    parts.push(P(g2, [-0.11, 0.48, 0], U, [0.2, 0, 0]), P(B(0.17, 0.2, 0.42), [-0.11, 0.06, -0.2], put), P(B(0.18, 0.12, 0.2), [-0.11, 0.08, -0.45], boot));
  } else { leg(0.11, la); leg(-0.11, ra); }
  const y = -drop, lean = pose.startsWith('walk') ? 0.12 : kneel ? 0.05 : 0;
  parts.push(P(B(0.44, 0.58, 0.27), [0, 1.18 + y, 0.02], U, [lean, 0, 0]));
  parts.push(P(B(0.46, 0.08, 0.29), [0, 0.95 + y, 0.02], shade(U2, 0.8)));
  parts.push(P(B(0.32, 0.34, 0.16), [0, 1.24 + y, -0.2], shade(U2, 0.95)));
  parts.push(P(B(0.11, 0.1, 0.12), [0, 1.48 + y, 0.02], SKIN));
  parts.push(P(B(0.2, 0.22, 0.21), [0, 1.6 + y, 0.03], SKIN));
  for (const hp of helmetParts(N.helmet, Hc)) { hp.p[1] += y; parts.push(hp); }
  // arms and rifle
  if (pose === 'prone') {
    parts.push(P(B(0.11, 0.5, 0.12), [0.2, 1.75, 0.12], U, [0, 0, -0.2]), P(B(0.11, 0.5, 0.12), [-0.2, 1.75, 0.12], U, [0, 0, 0.2]));
    parts.push(P(B(0.06, 1.15, 0.07), [0.05, 2.1, 0.2], WOOD), P(B(0.03, 0.4, 0.03), [0.05, 2.85, 0.2], STEEL));
  } else if (kneel) {
    parts.push(P(B(0.11, 0.11, 0.5), [0.2, 1.3 + y, 0.25], U, [0.1, -0.25, 0]), P(B(0.11, 0.11, 0.48), [-0.2, 1.28 + y, 0.3], U, [0.1, 0.35, 0]));
    parts.push(P(B(0.06, 0.07, 1.15), [0.05, 1.36 + y, 0.45], WOOD), P(B(0.03, 0.03, 0.4), [0.05, 1.37 + y, 1.2], STEEL));
  } else {
    const sw = pose === 'walkA' ? 0.25 : pose === 'walkB' ? -0.25 : 0;
    parts.push(P(B(0.11, 0.5, 0.12), [0.27, 1.17 + y, 0.08], U, [-0.5 + sw, 0, 0.1]), P(B(0.11, 0.5, 0.12), [-0.27, 1.17 + y, 0.1], U, [-0.7 - sw, 0, -0.1]));
    parts.push(P(B(0.06, 0.07, 1.15), [0.02, 1.2 + y, 0.25], WOOD, [-0.9, 0.2, 0.5]), P(B(0.03, 0.03, 0.4), [0.2, 1.55 + y, 0.5], STEEL, [-0.9, 0.2, 0.5]));
  }
  return parts;
}
const GEO = {};
function soldierGeo(n, pose) {
  const key = 's_' + n + pose;
  if (GEO[key]) return GEO[key];
  let parts;
  if (pose === 'prone' || pose === 'dead') {
    parts = soldierParts(n, pose === 'prone' ? 'prone' : 'stand');
    const m = new THREE.Matrix4();
    if (pose === 'prone') m.makeRotationX(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, 0.2, -0.8));
    else m.makeRotationX(-Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationY(0.4)).premultiply(new THREE.Matrix4().makeTranslation(0, 0.18, 0.8));
    for (const pt of parts) { pt.m = m; if (pose === 'dead') pt.c = shade(pt.c, 0.7); }
  } else parts = soldierParts(n, pose);
  return (GEO[key] = shared(mergeParts(parts)));
}

// ---------- team weapons ----------
function weaponGeo(kind, n) {
  const key = 'w_' + kind + n;
  if (GEO[key]) return GEO[key];
  const N = NATIONS[n], V = hex(N.veh), V2 = hex(N.veh2);
  let parts = [];
  if (kind === 'mg') {
    parts = [
      P(B(0.04, 0.7, 0.04), [0, 0.3, 0.25], STEEL, [0.5, 0, 0]), P(B(0.04, 0.7, 0.04), [0.25, 0.3, -0.18], STEEL, [-0.4, 0, -0.4]), P(B(0.04, 0.7, 0.04), [-0.25, 0.3, -0.18], STEEL, [-0.4, 0, 0.4]),
      P(B(0.2, 0.2, 0.42), [0, 0.62, -0.05], DARK), P(Cy(0.08, 0.08, 0.75, 8), [0, 0.64, 0.5], STEEL, [Math.PI / 2, 0, 0]), P(Cy(0.025, 0.025, 0.3, 6), [0, 0.64, 1.0], DARK, [Math.PI / 2, 0, 0]),
      P(B(0.14, 0.18, 0.3), [0.25, 0.1, -0.1], V2),
    ];
  } else if (kind === 'mortar') {
    parts = [P(B(0.5, 0.06, 0.5), [0, 0.03, 0], STEEL), P(Cy(0.07, 0.07, 1.0, 8), [0, 0.42, 0.22], DARK, [0.75, 0, 0]),
      P(B(0.03, 0.62, 0.03), [0.18, 0.3, 0.5], STEEL, [-0.3, 0, -0.25]), P(B(0.03, 0.62, 0.03), [-0.18, 0.3, 0.5], STEEL, [-0.3, 0, 0.25]), P(B(0.25, 0.15, 0.3), [0.45, 0.08, -0.2], V2)];
  } else if (kind === 'fgun') {
    parts = [
      P(Cy(0.68, 0.68, 0.1, 12), [0.85, 0.68, 0], WOOD, [0, 0, Math.PI / 2]), P(Cy(0.68, 0.68, 0.1, 12), [-0.85, 0.68, 0], WOOD, [0, 0, Math.PI / 2]),
      P(Cy(0.07, 0.07, 1.8, 6), [0, 0.68, 0], STEEL, [0, 0, Math.PI / 2]),
      P(B(1.5, 1.0, 0.06), [0, 1.05, 0.3], V), P(B(0.4, 0.35, 1.4), [0, 0.95, 0.1], V2),
      P(Cy(0.09, 0.08, 2.3, 8), [0, 1.0, 1.4], V2, [Math.PI / 2, 0, 0]), P(B(0.25, 0.2, 2.4), [0, 0.45, -1.3], V, [-0.3, 0, 0]),
    ];
  } else if (kind === 'skoda') {
    parts = [
      P(B(2.6, 0.5, 2.6), [0, 0.25, 0], V2), P(B(1.6, 0.9, 1.4), [0, 0.95, 0], V), P(Cy(0.36, 0.34, 2.6, 10), [0, 1.9, 0.6], V, [0.85, 0, 0]),
      P(Cy(0.42, 0.42, 0.5, 10), [0, 1.3, -0.05], V2, [0.85, 0, 0]), P(B(0.3, 0.4, 0.3), [1.2, 0.7, -1.1], STEEL),
    ];
  }
  return (GEO[key] = shared(mergeParts(parts)));
}

// ---------- vehicles ----------
function extrudeSide(points, depth) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
}
// Returns { group, turret?, gunZ } facing +z, with a separate turret mesh where the model has one.
function vehicleModel(model, n) {
  const N = NATIONS[n], V = hex(N.veh), V2 = hex(N.veh2), TR = [0.2, 0.18, 0.15];
  const group = new THREE.Group();
  let parts = [], tparts = null, tpos = null, gunZ = 3, gunY = 1.4, muzzles = null;
  if (model === 'mark4') {
    const rh = [[-4, 0.9], [-3.4, 2.45], [3.0, 2.55], [4.2, 1.2], [3.2, 0], [-3.2, 0]];
    parts.push(P(extrudeSide(rh, 0.7), [1.65, 0, 0], V, [0, -Math.PI / 2, 0]), P(extrudeSide(rh, 0.7), [-0.95, 0, 0], V, [0, -Math.PI / 2, 0]));
    const tr = [[-4.08, 0.86], [-3.45, 2.52], [3.05, 2.62], [4.3, 1.2], [3.25, -0.06], [-3.25, -0.06]];
    parts.push(P(extrudeSide(tr, 0.62), [1.62, 0, 0], TR, [0, -Math.PI / 2, 0]), P(extrudeSide(tr, 0.62), [-1.0, 0, 0], TR, [0, -Math.PI / 2, 0]));
    parts.push(P(B(1.9, 1.8, 6.0), [0, 1.35, 0], shade(V, 0.92)), P(B(1.2, 0.6, 1.2), [0, 2.5, 2.1], V2), P(B(0.4, 0.4, 0.4), [0.5, 2.4, -2.6], DARK));
    for (const sx of [1, -1]) {
      parts.push(P(B(0.6, 1.0, 1.7), [sx * 1.95, 1.25, 0.4], V2), P(Cy(0.08, 0.08, 1.2, 6), [sx * 2.35, 1.35, 1.1], DARK, [Math.PI / 2, 0, 0]));
    }
    muzzles = [[2.35, 1.35, 1.7], [-2.35, 1.35, 1.7]]; gunZ = 1.7;
  } else if (model === 'a7v') {
    const prof = [[-3.6, 0.8], [-3.2, 2.8], [3.0, 2.8], [3.7, 1.6], [3.4, 0.8]];
    parts.push(P(extrudeSide(prof, 3.0), [1.5, 0, 0], V, [0, -Math.PI / 2, 0]));
    parts.push(P(B(0.9, 0.9, 6.4), [1.0, 0.45, 0], TR), P(B(0.9, 0.9, 6.4), [-1.0, 0.45, 0], TR));
    parts.push(P(B(1.4, 0.6, 1.6), [0, 3.1, 0.6], V2), P(Cy(0.11, 0.11, 0.9, 6), [0, 1.9, 3.9], DARK, [Math.PI / 2, 0, 0]));
    for (const sx of [1, -1]) for (const z of [-1.5, 0.5, 2]) parts.push(P(B(0.1, 0.25, 0.3), [sx * 1.53, 2.1, z], DARK));
    muzzles = [[0, 1.9, 4.3]]; gunZ = 4.3; gunY = 1.9;
  } else if (model === 'stchamond') {
    const prof = [[-3.6, 0.9], [-3.4, 2.4], [2.2, 2.4], [4.6, 1.6], [4.6, 0.9]];
    parts.push(P(extrudeSide(prof, 2.6), [1.3, 0, 0], V, [0, -Math.PI / 2, 0]));
    parts.push(P(B(0.8, 0.9, 6.0), [0.9, 0.45, -0.4], TR), P(B(0.8, 0.9, 6.0), [-0.9, 0.45, -0.4], TR));
    parts.push(P(Cy(0.4, 0.45, 0.4, 8), [0.6, 2.6, 1.5], V2), P(Cy(0.4, 0.45, 0.4, 8), [-0.6, 2.6, -2.6], V2), P(Cy(0.11, 0.1, 1.6, 6), [0, 1.4, 5.0], DARK, [Math.PI / 2, 0, 0]));
    muzzles = [[0, 1.4, 5.8]]; gunZ = 5.8;
  } else if (model === 'ft') {
    const tr = [[-2.4, 0.5], [-2.0, 1.1], [1.0, 1.35], [2.3, 1.2], [2.0, 0.1], [-1.6, 0]];
    parts.push(P(extrudeSide(tr, 0.35), [0.95, 0, 0], TR, [0, -Math.PI / 2, 0]), P(extrudeSide(tr, 0.35), [-0.6, 0, 0], TR, [0, -Math.PI / 2, 0]));
    parts.push(P(B(1.2, 1.1, 3.4), [0, 1.0, -0.2], V), P(B(1.1, 0.5, 0.9), [0, 1.2, 1.5], V2, [0.4, 0, 0]), P(B(0.9, 0.3, 1.0), [0, 0.6, -2.6], V2, [0.3, 0, 0]));
    tparts = [P(Cy(0.5, 0.55, 0.85, 8), [0, 0.42, 0], V), P(new THREE.SphereGeometry(0.3, 8, 4, 0, TAU, 0, Math.PI / 2), [0, 0.85, 0], V2), P(Cy(0.07, 0.07, 0.8, 6), [0, 0.45, 0.8], DARK, [Math.PI / 2, 0, 0])];
    tpos = [0, 1.55, 0.1]; gunZ = 1.2; gunY = 2;
  } else if (model === 'ac') {
    for (const [x, z] of [[0.95, 1.4], [-0.95, 1.4], [0.95, -1.4], [-0.95, -1.4]]) parts.push(P(Cy(0.48, 0.48, 0.3, 10), [x, 0.48, z], DARK, [0, 0, Math.PI / 2]));
    parts.push(P(B(1.7, 1.0, 3.6), [0, 1.15, -0.2], V), P(B(1.4, 0.6, 1.2), [0, 0.95, 2.0], V2, [0.25, 0, 0]), P(B(1.9, 0.08, 1.2), [0, 0.95, 1.4], V2), P(B(1.9, 0.08, 1.2), [0, 0.95, -1.5], V2));
    tparts = [P(Cy(0.6, 0.65, 0.55, 8), [0, 0.28, 0], V2), P(Cy(0.05, 0.05, 0.7, 6), [0, 0.3, 0.85], DARK, [Math.PI / 2, 0, 0])];
    tpos = [0, 1.65, -0.4]; gunZ = 1.1; gunY = 2;
  }
  const body = new THREE.Mesh(mergeParts(parts), MAT.unit);
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);
  let turret = null;
  if (tparts) {
    turret = new THREE.Mesh(mergeParts(tparts), MAT.unit);
    turret.position.set(...tpos); turret.castShadow = true;
    group.add(turret);
  }
  return { group, body, turret, gunZ, gunY, muzzles };
}

// ---------- buildings ----------
function prism(w, h, d) { // gable roof: ridge along z
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return g;
}
function halfCyl(r, len, seg = 10) { const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false, -Math.PI / 2, Math.PI); g.rotateX(-Math.PI / 2); return g; }
function flagParts(n, x, y, z, s = 1) {
  const fl = NATIONS[n].flag.map(hex);
  const vertical = n === 'fr';
  return fl.map((c, i) => vertical
    ? P(B(0.04, 1.0 * s, 0.6 * s), [x, y, z + (i - 1) * 0.6 * s + 0.9 * s], c)
    : P(B(0.04, 0.34 * s, 1.8 * s), [x, y + (1 - i) * 0.34 * s, z + 0.9 * s], c));
}
function buildingModel(type, n) {
  const N = NATIONS[n], V = hex(N.veh);
  let parts = [];
  if (type === 'hq') {
    for (let k = -3; k <= 3; k++) parts.push(P(B(1.8, 0.9, 0.9), [k * 1.85, 0.45, -4.5], SAND), P(B(1.8, 0.9, 0.9), [k * 1.85, 1.3, -4.5], shade(SAND, 0.92)));
    for (let k = -2; k <= 2; k++) parts.push(P(B(0.9, 0.9, 1.8), [-6.3, 0.45, k * 1.85], SAND), P(B(0.9, 0.9, 1.8), [6.3, 0.45, k * 1.85], SAND));
    parts.push(P(B(5, 2.2, 4), [-2.2, 1.1, 0], TIMBER), P(prism(5.6, 1.6, 4.6), [-2.2, 2.2, 0], TAR));
    parts.push(P(B(3.2, 2.6, 3.4), [3, 1.3, 0.4], CANVAS), P(prism(3.6, 1.4, 3.8), [3, 2.6, 0.4], shade(CANVAS, 0.85)));
    parts.push(P(B(1.2, 1.8, 0.2), [-2.2, 0.9, 2.05], DARK), P(B(1.6, 0.25, 0.3), [-2.2, 1.9, 2.1], TIMBER));
    parts.push(P(Cy(0.08, 0.1, 9, 6), [5.4, 4.5, -3.2], WOOD), ...flagParts(n, 5.45, 8.2, -3.2, 1.3));
    parts.push(P(Cy(0.04, 0.05, 7, 4), [-5, 3.5, 2.5], STEEL), P(B(1.5, 0.05, 0.05), [-5, 6.8, 2.5], STEEL));
  } else if (type === 'barracks') {
    parts.push(P(B(12, 2.6, 6), [0, 1.3, 0], TIMBER, [0, 0, 0]), P(prism(6.8, 2.0, 12.6), [0, 2.6, 0], TAR, [0, Math.PI / 2, 0]));
    parts.push(P(B(1.2, 2, 0.2), [0, 1, 3.05], DARK), P(B(0.9, 0.7, 0.1), [-3, 1.5, 3.03], [0.55, 0.6, 0.6]), P(B(0.9, 0.7, 0.1), [3, 1.5, 3.03], [0.55, 0.6, 0.6]));
    parts.push(P(Cy(0.07, 0.08, 6, 6), [6.6, 3, 3.2], WOOD), ...flagParts(n, 6.65, 5.5, 3.2, 0.9));
  } else if (type === 'depot') {
    parts.push(P(B(5, 2.4, 5), [-1.8, 1.2, -1], V), P(prism(5.6, 1.6, 5.6), [-1.8, 2.4, -1], shade(V, 0.8)));
    for (let k = 0; k < 7; k++) parts.push(P(B(1.1, 0.8, 0.8), [2 + (k % 3) * 1.2, 0.4 + Math.floor(k / 3) * 0.82, 2.5 - (k % 2) * 0.9], WOOD));
    for (let k = 0; k < 5; k++) parts.push(P(Cy(0.35, 0.35, 1, 8), [-4 + k * 0.8, 0.5, 3.6], [0.32, 0.34, 0.3]));
    parts.push(P(B(2.4, 1.6, 3.6), [3.2, 0.8, -2.5], [0.3, 0.3, 0.26]), P(Cy(0.4, 0.4, 0.4, 8), [2.4, 0.4, -0.4], DARK, [0, 0, Math.PI / 2]), P(Cy(0.4, 0.4, 0.4, 8), [4.0, 0.4, -0.4], DARK, [0, 0, Math.PI / 2]));
    parts.push(P(Cy(0.07, 0.08, 6, 6), [-4.6, 3, 4.5], WOOD), ...flagParts(n, -4.55, 5.5, 4.5, 0.9));
  } else if (type === 'artillery') {
    for (let a = 0; a < 12; a++) { const t = (a / 12) * TAU; if (t > 1.1 && t < 2.1) continue; parts.push(P(B(1.8, 1.0, 0.9), [Math.cos(t) * 5.3, 0.5, Math.sin(t) * 5.3], SAND, [0, -t + Math.PI / 2, 0])); }
    for (let k = 0; k < 12; k++) parts.push(P(Cy(0.12, 0.14, 0.7, 6), [-2 + (k % 6) * 0.3, 0.35, -2 + Math.floor(k / 6) * 0.3], [0.62, 0.5, 0.25]));
    for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) parts.push(P(Cy(0.07, 0.07, 3.2, 4), [x, 1.6, z], WOOD));
    parts.push(P(B(9, 0.08, 9), [0, 3.2, 0], [0.32, 0.36, 0.22]), P(B(1.4, 0.9, 1.0), [2, 0.45, 1.5], WOOD), P(B(1.4, 0.9, 1.0), [2.2, 1.35, 1.5], WOOD));
    parts.push(P(Cy(0.07, 0.08, 6, 6), [5.6, 3, -4], WOOD), ...flagParts(n, 5.65, 5.5, -4, 0.9));
  } else if (type === 'workshop') {
    parts.push(P(halfCyl(4.2, 14, 12), [0, 0, 0], [0.42, 0.42, 0.38]));
    parts.push(P(B(7.6, 3.4, 0.2), [0, 1.7, 7.0], DARK), P(B(0.3, 5.2, 0.3), [-5.5, 2.6, 6.5], STEEL), P(B(0.3, 5.2, 0.3), [5.5, 2.6, 6.5], STEEL), P(B(11.2, 0.35, 0.35), [0, 5.2, 6.5], STEEL));
    parts.push(P(B(1.0, 1.0, 1.0), [-6.5, 0.5, 2], V), P(Cy(0.35, 0.35, 1, 8), [-6.4, 0.5, -1], [0.32, 0.34, 0.3]), P(Cy(0.35, 0.35, 1, 8), [-6.4, 0.5, -2], [0.32, 0.34, 0.3]));
    parts.push(P(Cy(0.07, 0.08, 7, 6), [6.6, 3.5, -5], WOOD), ...flagParts(n, 6.65, 6.5, -5, 0.9));
  } else if (type === 'airfield') {
    parts.push(P(halfCyl(4.8, 9, 12), [-4, 0, -2], CANVAS), P(B(8.5, 4.4, 0.1), [-4, 2.2, 2.55], shade(CANVAS, 0.6)));
    parts.push(P(Cy(0.05, 0.06, 5, 4), [7, 2.5, -5], WOOD), P(Cy(0.25, 0.08, 1.4, 6), [7.6, 4.8, -5], [0.9, 0.55, 0.25], [0, 0, Math.PI / 2]));
    parts.push(P(Cy(0.07, 0.08, 6, 6), [-8.5, 3, 4.5], WOOD), ...flagParts(n, -8.45, 5.5, 4.5, 0.9));
  }
  const g = mergeParts(parts);
  const mesh = new THREE.Mesh(g, MAT.vc);
  mesh.castShadow = mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  if (type === 'airfield') { const pl = planeModel(n); pl.group.position.set(3.5, 1.1, 1); pl.group.rotation.y = 2.6; pl.group.rotation.x = -0.12; group.add(pl.group); }
  return { group, mesh };
}
function rubbleGeo(w, d, seed) {
  const parts = [];
  for (let k = 0; k < 14; k++) {
    const s = hash2(seed, k), t = hash2(k, seed);
    parts.push(P(B(0.8 + s * 1.8, 0.4 + t * 0.8, 0.8 + t * 1.6), [(s - 0.5) * w * 0.8, 0.2 + t * 0.3, (t - 0.5) * d * 0.8], shade([0.45, 0.4, 0.33], 0.7 + s * 0.4), [0, s * 3, (t - 0.5) * 0.5]));
  }
  parts.push(P(B(w * 0.8, 0.25, d * 0.8), [0, 0.12, 0], [0.3, 0.27, 0.22]));
  return mergeParts(parts);
}

// ---------- village houses ----------
const HOUSE_STYLES = [[0.72, 0.66, 0.55], [0.62, 0.38, 0.3], [0.78, 0.74, 0.66], [0.55, 0.52, 0.47]];
function houseGeo(h) {
  const parts = [];
  const wall = HOUSE_STYLES[h.style % 4], roof = h.style % 2 ? [0.45, 0.24, 0.19] : [0.3, 0.3, 0.33];
  if (h.kind === 'church') {
    parts.push(P(B(h.w, 5, h.d), [0, 2.5, 0], [0.7, 0.68, 0.62]), P(prism(h.d + 0.6, 3, h.w + 0.6), [0, 5, 0], [0.3, 0.3, 0.33], [0, Math.PI / 2, 0]));
    parts.push(P(B(3.4, 11, 3.4), [-h.w / 2 + 1.7, 5.5, 0], [0.66, 0.64, 0.58]), P(new THREE.ConeGeometry(2.6, 5, 4), [-h.w / 2 + 1.7, 13.5, 0], [0.3, 0.3, 0.33], [0, Math.PI / 4, 0]));
    for (let k = -1; k <= 1; k++) parts.push(P(B(0.1, 1.6, 0.8), [h.w / 2 + 0.02, 2.8, k * 2], [0.25, 0.3, 0.38]));
  } else {
    const hh = 3.2 + (h.style % 3) * 0.4;
    parts.push(P(B(h.w, hh, h.d), [0, hh / 2, 0], wall), P(prism(h.d + 0.6, 2.2, h.w + 0.6), [0, hh, 0], roof, [0, Math.PI / 2, 0]));
    parts.push(P(B(0.7, 1.4, 0.7), [h.w * 0.25, hh + 1.4, 0], shade(wall, 0.85)));
    parts.push(P(B(1.0, 1.9, 0.1), [0, 0.95, h.d / 2 + 0.02], [0.3, 0.22, 0.15]));
    for (const sx of [-1, 1]) parts.push(P(B(0.9, 0.9, 0.1), [sx * h.w * 0.3, hh * 0.62, h.d / 2 + 0.02], [0.25, 0.3, 0.38]), P(B(0.9, 0.9, 0.1), [sx * h.w * 0.3, hh * 0.62, -h.d / 2 - 0.02], [0.25, 0.3, 0.38]));
  }
  return mergeParts(parts);
}
function ruinGeo(h) {
  const parts = [], wall = h.kind === 'church' ? [0.66, 0.64, 0.58] : HOUSE_STYLES[h.style % 4];
  const sd = (k) => hash2(h.id * 13 + k, 77);
  const wh = (k) => 0.8 + sd(k) * (h.kind === 'church' ? 4 : 2.6);
  // jagged wall stubs around the footprint
  for (let k = 0; k < 4; k++) {
    const segs = 3;
    for (let s = 0; s < segs; s++) {
      if (sd(k * 7 + s) < 0.25) continue;
      const along = (s + 0.5) / segs - 0.5, ht = wh(k * 5 + s);
      if (k < 2) parts.push(P(B(h.w / segs, ht, 0.35), [along * h.w, ht / 2, (k ? 1 : -1) * h.d / 2], shade(wall, 0.8)));
      else parts.push(P(B(0.35, ht, h.d / segs), [(k === 3 ? 1 : -1) * h.w / 2, ht / 2, along * h.d], shade(wall, 0.8)));
    }
  }
  if (h.kind === 'church') parts.push(P(B(3.4, 6 + sd(9) * 2, 3.4), [-h.w / 2 + 1.7, 3.5, 0], shade(wall, 0.8)));
  return mergeGeos([mergeParts(parts), rubbleGeo(h.w, h.d, h.id * 3 + 1)]);
}
function mergeGeos(list) {
  const pos = [], nor = [], col = [];
  for (const g of list) {
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); col.push(...g.attributes.color.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
function bridgeGeo(len) {
  const parts = [P(B(8, 0.5, len), [0, -0.25, 0], [0.48, 0.44, 0.38])];
  for (const sx of [-1, 1]) {
    parts.push(P(B(0.3, 0.8, len), [sx * 3.9, 0.4, 0], [0.5, 0.46, 0.4]));
    for (let k = -1; k <= 1; k++) parts.push(P(B(1.2, 4, 1.2), [sx * 2.5, -2.4, k * len / 3.2], [0.42, 0.4, 0.36]));
  }
  return mergeParts(parts);
}

// ---------- props ----------
function treeGeo(type) {
  if (type === 1) return shared(mergeParts([P(Cy(0.18, 0.28, 3, 5), [0, 1.5, 0], [0.32, 0.26, 0.2]), P(new THREE.ConeGeometry(1.2, 8, 6), [0, 6.2, 0], [0.27, 0.36, 0.18]), P(new THREE.ConeGeometry(0.9, 4, 6), [0, 9.2, 0], [0.3, 0.4, 0.2])]));
  return shared(mergeParts([P(Cy(0.25, 0.4, 3, 5), [0, 1.5, 0], [0.32, 0.26, 0.2]), P(new THREE.IcosahedronGeometry(2.6, 0), [0, 4.6, 0], [0.3, 0.38, 0.2]), P(new THREE.IcosahedronGeometry(1.8, 0), [1.2, 5.6, 0.6], [0.34, 0.42, 0.22])]));
}
function stumpGeo() {
  return shared(mergeParts([P(Cy(0.18, 0.32, 2.6, 5), [0, 1.3, 0], [0.26, 0.22, 0.18], [0.1, 0, 0.08]), P(new THREE.ConeGeometry(0.2, 0.9, 4), [0.05, 2.9, 0], [0.3, 0.25, 0.2], [0, 0, 0.4]),
    P(B(0.12, 1.2, 0.12), [0.25, 2.1, 0], [0.26, 0.22, 0.18], [0, 0, -0.8])]));
}
function sandbagGeo() {
  return shared(mergeParts([P(B(1.85, 0.42, 0.75), [0, 0.21, 0], SAND), P(B(1.85, 0.38, 0.65), [0, 0.6, -0.04], shade(SAND, 0.9))]));
}
function wireGeo() {
  const parts = [];
  for (const x of [-1.8, 0, 1.8]) parts.push(P(B(0.08, 1.3, 0.08), [x, 0.65, 0], WOOD), P(B(0.07, 1.4, 0.07), [x + 0.1, 0.6, 0.5], WOOD, [0.5, 0, 0]));
  for (let k = 0; k < 4; k++) parts.push(P(B(4, 0.025, 0.025), [0, 0.35 + k * 0.28, 0.1 + (k % 2) * 0.15], [0.35, 0.3, 0.25], [0, 0, (k % 2 ? 1 : -1) * 0.2]));
  for (let k = 0; k < 6; k++) parts.push(P(B(0.025, 1.3, 0.025), [-1.8 + k * 0.72, 0.65, 0.15], [0.35, 0.3, 0.25], [0, 0, 0.9 * (k % 2 ? 1 : -1)]));
  return shared(mergeParts(parts));
}

// Sector flags: pole, owner-coloured flag, and a terrain-hugging ring with a capture-progress arc.
function flagMesh() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(mergeParts([P(Cy(0.07, 0.1, 7, 6), [0, 3.5, 0], WOOD), P(new THREE.SphereGeometry(0.14, 6, 4), [0, 7.05, 0], [0.75, 0.62, 0.3])]), MAT.vc);
  pole.castShadow = true;
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.BufferGeometry(), MAT.vc);
  flag.castShadow = true;
  g.add(flag);
  g.userData.flag = flag;
  return g;
}
const RING_SEG = 48;
function ringGeoAt(x, z, r0, r1, lift = 0.25) {
  const pos = [], idx = [];
  for (let k = 0; k <= RING_SEG; k++) {
    const a = (k / RING_SEG) * TAU, c = Math.cos(a), s = Math.sin(a);
    for (const r of [r0, r1]) { const px = c * r, pz = s * r; pos.push(px, groundH(x + px, z + pz) - groundH(x, z) + lift, pz); }
  }
  for (let k = 0; k < RING_SEG; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
function setPointLook(pt) {
  const g = pt.mesh, flag = g.userData.flag;
  const own = pt.owner;
  let parts;
  if (own < 0) parts = [P(B(0.04, 1.1, 1.8), [0.06, 6.3, 0.95], [0.82, 0.8, 0.74])];
  else parts = flagParts(TEAMS[own].nation, 0.06, 6.35, 0.05, 1);
  flag.geometry.dispose(); flag.geometry = mergeParts(parts);
  flag.position.y = own < 0 ? 0 : 0;
  if (!g.userData.ring) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
    const ring = new THREE.Mesh(ringGeoAt(pt.x, pt.z, pt.r - 0.35, pt.r), mat);
    ring.renderOrder = 2; g.add(ring); g.userData.ring = ring;
    const pm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
    const prog = new THREE.Mesh(ringGeoAt(pt.x, pt.z, pt.r - 1.1, pt.r - 0.45, 0.3), pm);
    prog.renderOrder = 2; g.add(prog); g.userData.prog = prog;
  }
  g.userData.ring.material.color.set(own < 0 ? '#d8d2c0' : TEAMCOL[own]);
}

// ---------- aircraft ----------
function planeModel(n) {
  const N = NATIONS[n], side = SIDE_OF[n];
  const body = side === 'entente' ? [0.55, 0.5, 0.36] : [0.48, 0.5, 0.44], wing = side === 'entente' ? [0.62, 0.58, 0.42] : [0.52, 0.5, 0.42];
  const mark = side === 'entente' ? hex(N.flag[0]) : [0.1, 0.1, 0.1];
  const parts = [
    P(Cy(0.45, 0.2, 5.5, 6), [0, 0, 0], body, [Math.PI / 2, 0, 0]), P(B(9, 0.1, 1.5), [0, 0.75, 0.6], wing), P(B(8, 0.1, 1.3), [0, -0.45, 0.7], wing),
    P(B(3, 0.08, 1.0), [0, 0.1, -2.6], wing), P(B(0.08, 1.0, 1.0), [0, 0.55, -2.6], body),
    P(B(0.06, 1.2, 0.06), [2.5, 0.15, 0.7], WOOD), P(B(0.06, 1.2, 0.06), [-2.5, 0.15, 0.7], WOOD),
    P(Cy(0.08, 0.08, 1, 4), [0.6, -1, 1.2], WOOD), P(Cy(0.08, 0.08, 1, 4), [-0.6, -1, 1.2], WOOD),
    P(Cy(0.3, 0.3, 0.12, 8), [0.7, -1.4, 1.2], DARK, [0, 0, Math.PI / 2]), P(Cy(0.3, 0.3, 0.12, 8), [-0.7, -1.4, 1.2], DARK, [0, 0, Math.PI / 2]),
    P(Cy(0.5, 0.5, 0.04, 10), [3.5, 0.81, 0.6], mark), P(Cy(0.5, 0.5, 0.04, 10), [-3.5, 0.81, 0.6], mark),
  ];
  const group = new THREE.Group();
  const m = new THREE.Mesh(mergeParts(parts), MAT.unit); m.castShadow = true;
  const prop = new THREE.Mesh(mergeParts([P(B(2.2, 0.15, 0.06), [0, 0, 0], WOOD)]), MAT.unit);
  prop.position.set(0, 0, 2.85);
  group.add(m, prop);
  return { group, prop };
}

const shellGeo = shared(mergeParts([P(Cy(0.09, 0.12, 0.5, 6), [0, 0, 0], [0.3, 0.28, 0.22], [Math.PI / 2, 0, 0])]));
