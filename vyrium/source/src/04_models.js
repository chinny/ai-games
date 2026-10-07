// ===================== GEOMETRY + MODELS =====================
const GEO = new Map();
function geo(key, fn) { let g = GEO.get(key); if (!g) { g = fn(); GEO.set(key, g); } return g; }
const gBox = (w, h, d) => geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
const gSph = (r, det = 1) => geo(`s${r}_${det}`, () => new THREE.IcosahedronGeometry(r, det));
const gCyl = (rt, rb, h, s = 8) => geo(`c${rt}_${rb}_${h}_${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const gCone = (r, h, s = 8) => geo(`k${r}_${h}_${s}`, () => new THREE.ConeGeometry(r, h, s));
const gTorus = (r, t, s = 6, rs = 20) => geo(`t${r}_${t}_${s}_${rs}`, () => new THREE.TorusGeometry(r, t, s, rs));
function mk(g, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); parent.add(m); return m;
}
function piv(parent, x = 0, y = 0, z = 0) { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; }

// merge geometries: items [{g, m:Matrix4, c:Color|hex}] -> non-indexed BufferGeometry with position/normal/uv/color
function mergeGeos(items, withColor = true) {
  let total = 0; const prepared = [];
  for (const it of items) { let g = it.g.index ? it.g.toNonIndexed() : it.g.clone(); g.applyMatrix4(it.m); prepared.push([g, it]); total += g.attributes.position.count; }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = withColor ? new Float32Array(total * 3) : null;
  let o = 0; const tc = new THREE.Color();
  for (const [g, it] of prepared) {
    const n = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (col) { tc.set(it.c !== undefined ? it.c : 0xffffff); for (let i = 0; i < n; i++) { col[(o + i) * 3] = tc.r; col[(o + i) * 3 + 1] = tc.g; col[(o + i) * 3 + 2] = tc.b; } }
    o += n; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere(); return out;
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function mat4(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) { _e.set(rx, ry, rz); _q.setFromEuler(_e); return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx, sy, sz)); }

const VC_TOON = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradTex });
const VC_BASIC = new THREE.MeshBasicMaterial({ vertexColors: true });
// Merge each pivot's plain child meshes into one vertex-coloured mesh (keeps animation pivots, cuts draw calls)
function compactModel(root) {
  const nodes = []; root.traverse(o => { if (!o.isMesh) nodes.push(o); });
  for (const n of nodes) {
    const ti = [], gi = [], rm = [];
    for (const c of n.children) {
      if (!c.isMesh || c.children.length) continue; const m = c.material; if (m.transparent || m.vertexColors) continue;
      c.updateMatrix(); if (m.isMeshToonMaterial) { ti.push({ g: c.geometry, m: c.matrix.clone(), c: m.color.getHex() }); rm.push(c); } else if (m.isMeshBasicMaterial) { gi.push({ g: c.geometry, m: c.matrix.clone(), c: m.color.getHex() }); rm.push(c); }
    }
    if (ti.length + gi.length < 2) continue; rm.forEach(c => n.remove(c));
    if (ti.length) { const mm = new THREE.Mesh(mergeGeos(ti), VC_TOON); mm.userData.own = true; n.add(mm); }
    if (gi.length) { const mm = new THREE.Mesh(mergeGeos(gi), VC_BASIC); mm.userData.own = true; n.add(mm); }
  }
  return root;
}
function disposeOwn(root) { root.traverse(o => { if (o.isMesh && o.userData.own) o.geometry.dispose(); }); }

// ---------- Tree / prop geometry (unit-ish, instanced) ----------
const TREE_GEO = {};
function treeGeo(type) {
  if (TREE_GEO[type]) return TREE_GEO[type];
  let trunk, crown, glow = false;
  switch (type) {
    case 'broad': trunk = mergeGeos([{ g: new THREE.CylinderGeometry(0.22, 0.38, 3.2, 6), m: mat4(0, 1.6, 0) }]);
      crown = mergeGeos([{ g: new THREE.IcosahedronGeometry(2.2, 0), m: mat4(0, 4.3, 0, 0, 0, 0, 1, 0.85, 1) }, { g: new THREE.IcosahedronGeometry(1.5, 0), m: mat4(1.1, 3.7, 0.4) }, { g: new THREE.IcosahedronGeometry(1.4, 0), m: mat4(-1.0, 3.8, -0.5) }]); break;
    case 'pine': trunk = mergeGeos([{ g: new THREE.CylinderGeometry(0.18, 0.3, 2.4, 5), m: mat4(0, 1.2, 0) }]);
      crown = mergeGeos([{ g: new THREE.ConeGeometry(1.9, 3.6, 7), m: mat4(0, 3.3, 0) }, { g: new THREE.ConeGeometry(1.4, 3.0, 7), m: mat4(0, 5.0, 0) }, { g: new THREE.ConeGeometry(0.9, 2.2, 7), m: mat4(0, 6.5, 0) }]); break;
    case 'mushroom': trunk = mergeGeos([{ g: new THREE.CylinderGeometry(0.35, 0.6, 4.4, 7), m: mat4(0, 2.2, 0) }]);
      crown = mergeGeos([{ g: new THREE.SphereGeometry(2.8, 9, 5, 0, TAU, 0, Math.PI / 2), m: mat4(0, 4.0, 0, 0, 0, 0, 1, 0.55, 1) }, { g: new THREE.CylinderGeometry(2.75, 2.2, 0.3, 9), m: mat4(0, 4.0, 0) }]); break;
    case 'palm': trunk = mergeGeos([{ g: new THREE.CylinderGeometry(0.16, 0.3, 5.5, 5), m: mat4(0.4, 2.7, 0, 0, 0, -0.15) }]);
      { const fr = []; for (let i = 0; i < 6; i++) fr.push({ g: new THREE.ConeGeometry(0.5, 3.4, 3), m: mat4(0.8 + Math.cos(i * TAU / 6) * 1.4, 5.3, Math.sin(i * TAU / 6) * 1.4, Math.sin(i * TAU / 6) * 1.2, 0, -Math.cos(i * TAU / 6) * 1.2, 1, 1, 0.3) }); crown = mergeGeos(fr); } break;
    case 'dead': trunk = mergeGeos([{ g: new THREE.CylinderGeometry(0.12, 0.34, 4.5, 5), m: mat4(0, 2.25, 0) }, { g: new THREE.CylinderGeometry(0.05, 0.12, 2.0, 4), m: mat4(0.7, 3.4, 0, 0, 0, -0.9) }, { g: new THREE.CylinderGeometry(0.05, 0.1, 1.6, 4), m: mat4(-0.5, 3.0, 0.3, 0.4, 0, 0.9) }, { g: new THREE.CylinderGeometry(0.04, 0.09, 1.4, 4), m: mat4(0.1, 4.2, -0.5, -0.8, 0, 0.2) }]);
      crown = null; break;
    case 'cactus': trunk = mergeGeos([{ g: new THREE.CylinderGeometry(0.4, 0.45, 4, 7), m: mat4(0, 2, 0) }, { g: new THREE.CylinderGeometry(0.25, 0.25, 1.4, 6), m: mat4(0.7, 2.2, 0, 0, 0, 1.57) }, { g: new THREE.CylinderGeometry(0.25, 0.25, 1.4, 6), m: mat4(1.15, 2.9, 0) }, { g: new THREE.CylinderGeometry(0.22, 0.22, 1.0, 6), m: mat4(-0.6, 1.6, 0, 0, 0, 1.57) }, { g: new THREE.CylinderGeometry(0.22, 0.22, 1.2, 6), m: mat4(-1.0, 2.1, 0) }]);
      crown = null; break;
    case 'spire': trunk = mergeGeos([{ g: new THREE.ConeGeometry(1.6, 9, 5), m: mat4(0, 4.5, 0) }, { g: new THREE.ConeGeometry(0.9, 5, 5), m: mat4(1.2, 2.5, 0.6, 0, 0, -0.2) }]); crown = null; break;
    case 'glowtree': trunk = mergeGeos([{ g: new THREE.CylinderGeometry(0.25, 0.55, 5, 6), m: mat4(0, 2.5, 0, 0, 0, 0.12) }, { g: new THREE.CylinderGeometry(0.1, 0.22, 2.4, 5), m: mat4(0.9, 4.8, 0, 0, 0, -0.7) }, { g: new THREE.CylinderGeometry(0.1, 0.22, 2.4, 5), m: mat4(-0.7, 5.0, 0.2, 0.2, 0, 0.8) }]);
      crown = mergeGeos([{ g: new THREE.IcosahedronGeometry(1.1, 0), m: mat4(1.7, 5.9, 0) }, { g: new THREE.IcosahedronGeometry(0.9, 0), m: mat4(-1.5, 6.0, 0.3) }, { g: new THREE.IcosahedronGeometry(1.3, 0), m: mat4(0.3, 6.6, -0.2) }]); glow = true; break;
    case 'crystal': trunk = null; crown = mergeGeos([{ g: new THREE.ConeGeometry(0.7, 5, 5), m: mat4(0, 2.5, 0) }, { g: new THREE.ConeGeometry(0.45, 3, 5), m: mat4(0.7, 1.4, 0.2, 0, 0, -0.45) }, { g: new THREE.ConeGeometry(0.4, 2.6, 5), m: mat4(-0.6, 1.2, -0.3, 0.3, 0, 0.5) }]); glow = true; break;
  }
  return TREE_GEO[type] = { trunk, crown, glow };
}

// ---------- Ink hull for viewmodel ----------
function addHulls(group, t = 0.008) {
  const list = []; group.traverse(o => { if (o.isMesh && !o.userData.noHull) list.push(o); });
  for (const m of list) {
    m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
    const h = new THREE.Mesh(m.geometry, INK_MAT); h.userData.noHull = true; h.scale.set(1 + 2 * t / Math.max(sx, 0.01), 1 + 2 * t / Math.max(sy, 0.01), 1 + 2 * t / Math.max(sz, 0.01)); m.add(h);
  }
}

// ---------- Humanoid ----------
function buildHumanoid(o) {
  const g = new THREE.Group(); const P = {}; const b = o.bulk || 1, t = o.tall || 1;
  const mb = toon(o.body), ma = toon(o.accent), md = toon(o.dark || 0x26282c), ms = toon(o.skin || 0xc89a7a), mg = glowMat(o.glow || 0x4fd6ff);
  const root = piv(g); P.root = root;
  for (const s of [-1, 1]) {
    const L = piv(root, s * 0.15 * b, 0.95 * t, 0); mk(gBox(0.19 * b, 0.5 * t, 0.21 * b), md, L, 0, -0.25 * t, 0);
    mk(gBox(0.17 * b, 0.46 * t, 0.19 * b), mb, L, 0, -0.72 * t, 0); mk(gBox(0.21 * b, 0.12, 0.32 * b), md, L, 0, -0.92 * t, 0.05);
    P[s < 0 ? 'legL' : 'legR'] = L;
  }
  const torso = piv(root, 0, 0.95 * t, 0); P.torso = torso;
  mk(gBox(0.46 * b, 0.2, 0.28 * b), md, torso, 0, 0.08, 0);
  mk(gBox(0.54 * b, 0.52 * t, 0.33 * b), mb, torso, 0, 0.44 * t, 0);
  mk(gBox(0.4 * b, 0.28 * t, 0.06), ma, torso, 0, 0.5 * t, 0.18 * b);
  if (o.pads !== false) for (const s of [-1, 1]) mk(gBox(0.22 * b, 0.14, 0.28 * b), ma, torso, s * 0.35 * b, 0.7 * t, 0);
  if (o.pack) mk(gBox(0.36 * b, 0.4 * t, 0.18), md, torso, 0, 0.46 * t, -0.24 * b);
  const head = piv(torso, 0, 0.78 * t, 0); P.head = head;
  switch (o.head) {
    case 'visor': mk(gBox(0.27, 0.29, 0.29), mb, head, 0, 0.15, 0); mk(gBox(0.25, 0.08, 0.05), mg, head, 0, 0.17, 0.15); break;
    case 'helmet': mk(gSph(0.2, 1), ma, head, 0, 0.16, 0); mk(gBox(0.3, 0.08, 0.08), mg, head, 0, 0.15, 0.15); mk(gBox(0.06, 0.12, 0.3), ma, head, 0, 0.34, -0.02); break;
    case 'hood': mk(gSph(0.18, 1), ms, head, 0, 0.14, 0); mk(gCone(0.25, 0.46, 6), md, head, 0, 0.22, -0.04); mk(gBox(0.22, 0.06, 0.05), mg, head, 0, 0.15, 0.16); break;
    case 'alien': mk(gSph(0.17, 1), mb, head, 0, 0.24, -0.08, 0.55, 0, 0, 1, 2.0, 1.1); mk(gSph(0.05, 0), mg, head, 0.07, 0.2, 0.14); mk(gSph(0.05, 0), mg, head, -0.07, 0.2, 0.14); break;
    default: mk(gSph(0.17, 1), ms, head, 0, 0.14, 0); mk(gBox(0.3, 0.1, 0.3), md, head, 0, 0.28, -0.02); mk(gBox(0.2, 0.05, 0.04), mg, head, 0, 0.16, 0.16);
  }
  for (const s of [-1, 1]) {
    const A = piv(torso, s * 0.37 * b, 0.66 * t, 0); mk(gBox(0.15 * b, 0.34 * t, 0.16 * b), mb, A, 0, -0.17 * t, 0);
    const F = piv(A, 0, -0.34 * t, 0); mk(gBox(0.14 * b, 0.32 * t, 0.15 * b), md, F, 0, -0.16 * t, 0);
    mk(o.fists ? gSph(0.17 * b, 0) : gBox(0.12, 0.12, 0.12), o.fists ? ms : md, F, 0, -0.36 * t, 0);
    P[s < 0 ? 'armL' : 'armR'] = A; P[s < 0 ? 'foreL' : 'foreR'] = F;
  }
  if (o.gun) {
    P.armR.rotation.x = -1.15; P.foreR.rotation.x = -0.25; P.armL.rotation.set(-1.25, 0, 0.5); P.foreL.rotation.x = -0.5;
    const gun = piv(torso, 0.17 * b, 0.47 * t, 0.42); mk(gBox(0.09, 0.13, 0.55), toon(0x2a2c30), gun); mk(gBox(0.04, 0.04, 0.12), mg, gun, 0, 0.08, 0.1);
    mk(gCyl(0.03, 0.03, 0.3, 5), toon(0x1a1a1a), gun, 0, 0.02, 0.4, Math.PI / 2, 0, 0);
    const mz = piv(gun, 0, 0.02, 0.6); P.muzzle = mz; P.gun = gun;
  }
  return { group: g, parts: P };
}

// ---------- Creatures ----------
function buildCreature(type, pal) {
  const g = new THREE.Group(); const P = { root: piv(g) }; const R = P.root;
  const c1 = toon(pal[0]), c2 = toon(pal[1]), c3 = toon(pal[2] || 0x222222), gl = glowMat(pal[3] || 0xff3a2a), blk = toon(0x141414);
  switch (type) {
    case 'skitter': {
      const B = piv(R, 0, 0, 0); P.body = B;
      mk(gSph(0.46, 1), c1, B, 0, 0.5, 0, 0, 0, 0, 1, 0.92, 1.05); mk(gSph(0.3, 1), c2, B, 0, 0.42, 0.22);
      for (const s of [-1, 1]) { mk(gCone(0.14, 0.7, 5), c1, B, s * 0.24, 1.02, -0.05, -0.2, 0, s * -0.35); mk(gCone(0.08, 0.5, 5), c2, B, s * 0.25, 0.98, -0.01, -0.2, 0, s * -0.35); mk(gSph(0.08, 0), blk, B, s * 0.17, 0.66, 0.38); mk(gSph(0.12, 0), c2, B, s * 0.2, 0.1, 0.12); }
      mk(gSph(0.06, 0), c3, B, 0, 0.56, 0.45); break;
    }
    case 'rollrat': {
      const B = piv(R, 0, 0, 0); P.body = B;
      mk(gSph(0.5, 1), c1, B, 0, 0.55, -0.1, 0, 0, 0, 0.9, 0.8, 1.35); mk(gSph(0.32, 1), c1, B, 0, 0.6, 0.62); mk(gCone(0.16, 0.4, 5), c2, B, 0, 0.55, 0.98, Math.PI / 2, 0, 0);
      for (const s of [-1, 1]) { mk(gSph(0.12, 0), c2, B, s * 0.2, 0.9, 0.55, 0, 0, 0, 1, 1.4, 0.5); mk(gSph(0.06, 0), gl, B, s * 0.14, 0.7, 0.86); }
      mk(gCyl(0.03, 0.08, 1.4, 4), c2, B, 0, 0.6, -1.15, -1.2, 0, 0);
      P.legs = []; for (const [x, z] of [[-0.3, 0.4], [0.3, 0.4], [-0.3, -0.5], [0.3, -0.5]]) { const L = piv(R, x, 0.35, z); mk(gBox(0.12, 0.35, 0.14), c3, L, 0, -0.17, 0); P.legs.push(L); }
      break;
    }
    case 'hornback': {
      const B = piv(R, 0, 0, 0); P.body = B;
      mk(gBox(1.35, 1.0, 2.0), c1, B, 0, 1.15, 0); mk(gSph(0.8, 0), c2, B, 0, 1.75, -0.2, 0, 0, 0, 1.2, 0.7, 1.4);
      for (let i = 0; i < 3; i++) mk(gBox(1.1, 0.18, 0.4), c3, B, 0, 1.72 + i * 0.05, -0.6 + i * 0.5);
      const H = piv(B, 0, 1.15, 1.05); P.head = H; mk(gBox(0.75, 0.65, 0.8), c1, H, 0, 0, 0.3); mk(gBox(0.5, 0.3, 0.3), c2, H, 0, -0.2, 0.75);
      for (const s of [-1, 1]) { mk(gCone(0.14, 0.9, 5), toon(0xf0e6d0), H, s * 0.45, 0.25, 0.55, 1.2, 0, s * -0.6); mk(gSph(0.07, 0), gl, H, s * 0.3, 0.12, 0.72); }
      P.legs = []; for (const [x, z] of [[-0.5, 0.7], [0.5, 0.7], [-0.5, -0.7], [0.5, -0.7]]) { const L = piv(R, x, 0.75, z); mk(gCyl(0.16, 0.2, 0.75, 6), c3, L, 0, -0.38, 0); P.legs.push(L); }
      break;
    }
    case 'mantid': {
      const B = piv(R, 0, 0, 0); P.body = B;
      mk(gSph(0.42, 1), c1, B, 0, 1.45, 0, 0, 0, 0, 0.9, 1.2, 0.9); mk(gSph(0.5, 1), c2, B, 0, 1.2, -0.75, 0.5, 0, 0, 0.8, 0.7, 1.4);
      const H = piv(B, 0, 2.0, 0.25); P.head = H; mk(gCone(0.28, 0.5, 3), c1, H, 0, 0, 0, Math.PI, 0, 0); for (const s of [-1, 1]) mk(gSph(0.08, 0), gl, H, s * 0.17, 0.08, 0.1);
      P.arms = []; for (const s of [-1, 1]) { const A = piv(B, s * 0.32, 1.75, 0.2); mk(gBox(0.1, 0.6, 0.12), c1, A, 0, -0.25, 0.15, 0.6, 0, 0); const bl = mk(gBox(0.06, 0.9, 0.16), c3, A, 0, -0.4, 0.55, -0.4, 0, 0); P.arms.push(A); }
      P.legs = []; for (const [x, z] of [[-0.35, 0.15], [0.35, 0.15], [-0.35, -0.55], [0.35, -0.55]]) { const L = piv(R, x, 1.2, z); mk(gCyl(0.05, 0.07, 1.4, 4), c3, L, x > 0 ? 0.35 : -0.35, -0.6, 0, 0, 0, x > 0 ? 0.55 : -0.55); P.legs.push(L); }
      break;
    }
    case 'drone': {
      const B = piv(R, 0, 0, 0); P.body = B;
      mk(gSph(0.5, 1), c1, B, 0, 0, 0); mk(gTorus(0.62, 0.07), c3, B, 0, 0, 0, Math.PI / 2, 0, 0); mk(gSph(0.18, 1), gl, B, 0, 0, 0.42);
      mk(gBox(0.08, 0.5, 0.4), c2, B, 0, 0.45, -0.2); for (const s of [-1, 1]) mk(gBox(0.5, 0.06, 0.3), c2, B, s * 0.65, 0, -0.1);
      mk(gCyl(0.02, 0.02, 0.5, 4), c3, B, 0.2, 0.6, 0); break;
    }
    case 'wraith': {
      const B = piv(R, 0, 0, 0); P.body = B; const cl = toon(pal[0], { transparent: true, opacity: 0.85 });
      mk(gCone(0.65, 1.9, 7), cl, B, 0, 0.95, 0, Math.PI, 0, 0); mk(gSph(0.24, 1), c2, B, 0, 1.75, 0); mk(gCone(0.32, 0.6, 6), cl, B, 0, 1.9, -0.05);
      for (const s of [-1, 1]) { mk(gSph(0.06, 0), gl, B, s * 0.09, 1.76, 0.2); const A = piv(B, s * 0.42, 1.4, 0); mk(gCone(0.12, 0.9, 4), cl, A, 0, -0.35, 0.2, -0.6, 0, s * 0.3); }
      mk(gTorus(0.4, 0.04), gl, B, 0, 2.2, 0, Math.PI / 2, 0, 0); break;
    }
    case 'hound': {
      const B = piv(R, 0, 0, 0); P.body = B;
      mk(gBox(0.7, 0.6, 1.5), c1, B, 0, 0.85, 0); mk(gBox(0.5, 0.08, 1.3), gl, B, 0, 1.17, 0);
      for (let i = 0; i < 4; i++) mk(gCone(0.1, 0.4, 4), c3, B, 0, 1.3, -0.5 + i * 0.32);
      const H = piv(B, 0, 1.0, 0.8); P.head = H; mk(gBox(0.5, 0.42, 0.6), c1, H, 0, 0, 0.15); mk(gBox(0.4, 0.14, 0.4), c2, H, 0, -0.2, 0.45);
      for (const s of [-1, 1]) { mk(gSph(0.06, 0), gl, H, s * 0.16, 0.08, 0.45); mk(gCone(0.08, 0.35, 4), c3, H, s * 0.18, 0.32, -0.05); }
      P.legs = []; for (const [x, z] of [[-0.28, 0.55], [0.28, 0.55], [-0.28, -0.55], [0.28, -0.55]]) { const L = piv(R, x, 0.6, z); mk(gBox(0.14, 0.6, 0.16), c3, L, 0, -0.3, 0); P.legs.push(L); }
      break;
    }
    case 'turret': {
      mk(gCyl(0.9, 1.1, 0.6, 8), c3, R, 0, 0.3, 0); mk(gCyl(0.35, 0.45, 1.0, 8), c1, R, 0, 1.0, 0);
      const H = piv(R, 0, 1.65, 0); P.head = H; mk(gBox(0.9, 0.6, 0.9), c1, H); mk(gBox(0.92, 0.12, 0.6), c2, H, 0, 0.3, 0); mk(gSph(0.13, 0), gl, H, 0, 0.05, 0.46);
      for (const s of [-1, 1]) mk(gCyl(0.06, 0.06, 0.9, 6), c3, H, s * 0.22, -0.05, 0.75, Math.PI / 2, 0, 0);
      P.muzzle = piv(H, 0, 0, 1.2); break;
    }
  }
  return { group: g, parts: P };
}

function enemyPalette(type, zone) {
  const veil = zone && zone.k === 'veil'; const vt = veil ? VEIL_TINTS[zone.id] : null;
  const r = Math.random;
  switch (type) {
    case 'skitter': return pick(r, [[0xf0d9a8, 0xfff4e0, 0x7a4a2a, 0x000000], [0x9fd0c9, 0xe0fff8, 0x2a4a4a], [0xe8a070, 0xffe0c0, 0x5a2a1a]]);
    case 'rollrat': return pick(r, [[0x7a6a5a, 0xc8a890, 0x3a2e28, 0xff3a2a], [0x5a6a5a, 0xa8b890, 0x2a3028, 0xffd02a], [0x8a5a6a, 0xd8a0b0, 0x3a2028, 0xff3a2a]]);
    case 'hornback': return zone && zone.b === 'snow' ? [0xd8e0e8, 0xffffff, 0x6a7a8a, 0x4fd6ff] : zone && zone.b === 'lush' ? [0xc8a83a, 0xffe08a, 0x5a4a2a, 0x7affc0] : pick(r, [[0x8a5a3a, 0xa87a50, 0x3a2a20, 0xff6a2a], [0x6a6a5a, 0x9a9a7a, 0x2a2a20, 0xffd02a]]);
    case 'mantid': return veil ? [vt.g[1], vt.g[2], 0x1a1a1a, vt.glow] : pick(r, [[0x5aa040, 0x8ad060, 0x2a4a1a, 0xffe02a], [0xa0a040, 0xd0d070, 0x4a4a1a, 0xff3a2a], [0xe0e0d8, 0xffffff, 0x8a8a80, 0xff3a6a]]);
    case 'drone': return zone && zone.st === 'hive' ? [0x5a3a6a, 0x8a5aa0, 0x2a1a30, 0x3affd0] : [0x9aa4ac, 0xd8dee2, 0x3a4048, pick(r, [0xff3a2a, 0xffb02a, 0x4fd6ff])];
    case 'wraith': return vt ? [0x2a2238, vt.g[2], 0x111111, vt.glow] : [0x2a2238, 0xc8b8e8, 0x111111, 0xb07aff];
    case 'hound': return vt ? [vt.g[0], vt.g[1], 0x1a1018, vt.glow] : [0x3a2a4a, 0x6a4a8a, 0x1a1018, 0xc89aff];
    case 'turret': return zone && zone.st === 'hive' ? [0x5a3a6a, 0x3affd0, 0x2a1a30, 0x3affd0] : [0x6a7078, 0xf2c230, 0x2a2e34, 0xff3a2a];
  }
  return [0x888888, 0xaaaaaa, 0x333333, 0xff3a2a];
}
function buildEnemyModel(type, zone, ctx) { const m = buildEnemyModelRaw(type, zone, ctx); compactModel(m.group); return m; }
function buildEnemyModelRaw(type, zone, ctx) {
  const def = ENEMIES[type];
  if (def.human || type === 'brute') {
    if (type === 'bandit') {
      const pal = pick(rnd, [[0x8a7050, 0xc8562a, 0x3a3028], [0x6a6a50, 0xd8b030, 0x2a2a20], [0x5a5048, 0x3a8a8a, 0x2a2420], [0x7a5a4a, 0xa83a3a, 0x30241e]]);
      return buildHumanoid({ body: pal[0], accent: pal[1], dark: pal[2], head: pick(rnd, ['hood', 'bare', 'hood']), gun: true, glow: 0xffb02a, pack: rnd() < 0.5 });
    }
    if (type === 'borg') return buildHumanoid({ body: 0x8a929a, accent: 0x5a6068, dark: 0x2a2e34, head: 'visor', gun: true, glow: 0xff3a2a, bulk: 1.12 });
    if (type === 'xyrr') return buildHumanoid({ body: 0x4a2a6a, accent: 0x7a4aa0, dark: 0x1a1024, head: 'alien', gun: true, glow: 0x3affd0, bulk: 0.85, tall: 1.28, pads: true });
    if (type === 'guard') { const F = FACTIONS[ctx && ctx.faction || 'neutral']; return buildHumanoid({ body: F.alt, accent: F.hex, dark: 0x22262c, head: 'helmet', gun: true, glow: F.hex, bulk: 1.15, tall: 1.05, pack: true }); }
    if (type === 'brute') {
      const vt = zone && zone.k === 'veil' ? VEIL_TINTS[zone.id] : null;
      const skin = vt ? vt.g[1] : zone && zone.b === 'snow' ? 0xd8e4ee : pick(rnd, [0x7a9a5a, 0x9a8a5a, 0x8a6a7a]);
      const m = buildHumanoid({ body: skin, accent: 0x5a4a3a, dark: 0x3a3028, skin, head: 'bare', bulk: 1.75, tall: 1.2, fists: true, glow: vt ? vt.glow : 0xffe02a, pads: true });
      m.parts.torso.rotation.x = 0.3; m.parts.head.position.z += 0.1; return m;
    }
  }
  return buildCreature(type, enemyPalette(type, zone));
}
function buildCivilian() {
  const body = pick(rnd, [0x3a6a9a, 0x9a3a4a, 0x6a6a6a, 0xd8c8a0, 0x4a8a5a, 0x2a2a3a, 0xa86a3a]);
  const m = buildHumanoid({ body, accent: pick(rnd, [0xe8e8e8, 0x2a2a2a, 0xf2c230, 0x4fd6ff]), dark: 0x2a2a30, head: pick(rnd, ['bare', 'bare', 'visor', 'hood']), pads: false, glow: pick(rnd, [0x4fd6ff, 0xffb02a, 0xff6ab0]), bulk: rr(rnd, 0.9, 1.05) }); compactModel(m.group); return m;
}

// ---------- Guns ----------
const MFG = {
  cyrex: { n: 'Cyrex Arms', c: [0xe9eef3, 0x2a3a4f, 0x4fb3ff], kinds: ['pistol', 'smg', 'rifle', 'sniper', 'shotgun'] },
  clanforge: { n: 'Clanforge', c: [0x8a5a3a, 0x3b2a20, 0xff7a3d], kinds: ['pistol', 'rifle', 'shotgun', 'launcher', 'smg'] },
  nanodyne: { n: 'Nanodyne', c: [0x3a2f5c, 0x19152b, 0xc26bff], kinds: ['pistol', 'smg', 'rifle', 'sniper', 'launcher'] },
  vektor: { n: 'Vektor Ballistics', c: [0xe8c52a, 0x1d1d1d, 0xffde59], kinds: ['pistol', 'smg', 'rifle', 'shotgun'] },
  dustline: { n: 'Dustline', c: [0x8c8a5c, 0x4a4733, 0xb9ff6a], kinds: ['pistol', 'smg', 'rifle', 'shotgun', 'launcher', 'sniper'] },
  helix: { n: 'Helix Precision', c: [0x1b1b1f, 0xb0242c, 0xff4256], kinds: ['pistol', 'sniper', 'rifle'] },
};
function buildGun(it) {
  const g = new THREE.Group(); const M = MFG[it.mfg] || MFG.dustline;
  const c1 = toon(M.c[0]), c2 = toon(M.c[1]), acc = glowMat(it.el !== 'kinetic' ? ELEMENTS[it.el].hex : M.c[2]); const dark = toon(0x18181a);
  const K = it.kind; let front = -0.4;
  const stripe = (len, z) => mk(gBox(0.012, 0.02, len), acc, g, 0.045, 0.02, z);
  if (K === 'pistol') {
    mk(gBox(0.07, 0.1, 0.28), c1, g, 0, 0, -0.1); mk(gBox(0.06, 0.15, 0.08), c2, g, 0, -0.11, -0.01, 0.25, 0, 0);
    mk(gCyl(0.022, 0.022, 0.12, 6), dark, g, 0, 0.015, -0.29, Math.PI / 2, 0, 0); stripe(0.18, -0.12); front = -0.36;
  } else if (K === 'smg') {
    mk(gBox(0.08, 0.11, 0.38), c1, g, 0, 0, -0.14); mk(gBox(0.05, 0.2, 0.07), c2, g, 0, -0.14, -0.14); mk(gBox(0.06, 0.13, 0.07), c2, g, 0, -0.1, 0.02, 0.25, 0, 0);
    mk(gCyl(0.024, 0.024, 0.16, 6), dark, g, 0, 0.01, -0.4, Math.PI / 2, 0, 0); mk(gBox(0.04, 0.05, 0.16), c2, g, 0, 0, 0.1); stripe(0.26, -0.14); front = -0.48;
  } else if (K === 'rifle') {
    mk(gBox(0.08, 0.12, 0.5), c1, g, 0, 0, -0.18); mk(gBox(0.055, 0.2, 0.08), c2, g, 0, -0.14, -0.2, -0.2, 0, 0); mk(gBox(0.06, 0.13, 0.07), c2, g, 0, -0.1, 0.02, 0.25, 0, 0);
    mk(gBox(0.06, 0.11, 0.22), c2, g, 0, -0.01, 0.17); mk(gCyl(0.024, 0.024, 0.28, 6), dark, g, 0, 0.015, -0.56, Math.PI / 2, 0, 0); stripe(0.36, -0.18);
    if (it.rar >= 2) { mk(gBox(0.05, 0.05, 0.14), dark, g, 0, 0.1, -0.14); mk(gBox(0.03, 0.03, 0.02), acc, g, 0, 0.1, -0.215); } front = -0.7;
  } else if (K === 'shotgun') {
    mk(gBox(0.1, 0.13, 0.42), c1, g, 0, 0, -0.14); const dbl = it.mfg === 'clanforge';
    for (const s of (dbl ? [-1, 1] : [0])) mk(gCyl(0.035, 0.035, 0.4, 7), dark, g, s * 0.035, 0.02, -0.5, Math.PI / 2, 0, 0);
    mk(gBox(0.08, 0.07, 0.22), c2, g, 0, -0.07, -0.42); mk(gBox(0.065, 0.14, 0.08), c2, g, 0, -0.12, 0.02, 0.25, 0, 0); mk(gBox(0.07, 0.12, 0.24), c2, g, 0, -0.02, 0.18); stripe(0.3, -0.14); front = -0.72;
  } else if (K === 'sniper') {
    mk(gBox(0.075, 0.12, 0.58), c1, g, 0, 0, -0.2); mk(gCyl(0.02, 0.022, 0.55, 6), dark, g, 0, 0.015, -0.76, Math.PI / 2, 0, 0);
    mk(gCyl(0.04, 0.04, 0.3, 8), dark, g, 0, 0.11, -0.2, Math.PI / 2, 0, 0); mk(gCyl(0.03, 0.03, 0.01, 8), acc, g, 0, 0.11, -0.355, Math.PI / 2, 0, 0);
    mk(gBox(0.06, 0.13, 0.08), c2, g, 0, -0.11, 0.03, 0.25, 0, 0); mk(gBox(0.065, 0.13, 0.28), c2, g, 0, -0.02, 0.22); mk(gBox(0.045, 0.12, 0.07), c2, g, 0, -0.12, -0.2); stripe(0.4, -0.2); front = -1.04;
  } else {
    mk(gCyl(0.09, 0.09, 0.85, 10), c1, g, 0, 0.03, -0.25, Math.PI / 2, 0, 0); mk(gCyl(0.1, 0.1, 0.06, 10), c2, g, 0, 0.03, -0.68, Math.PI / 2, 0, 0);
    mk(gTorus(0.095, 0.015), acc, g, 0, 0.03, -0.1); mk(gBox(0.06, 0.15, 0.08), c2, g, 0, -0.12, -0.05, 0.25, 0, 0); mk(gBox(0.05, 0.08, 0.12), dark, g, 0, 0.16, -0.25); front = -0.72;
  }
  if (K !== 'launcher' && K !== 'sniper') { mk(gBox(0.03, 0.035, 0.03), dark, g, 0, 0.075, front * 0.55); mk(gBox(0.05, 0.03, 0.04), dark, g, 0, 0.07, -0.02); }
  if (K === 'rifle' || K === 'smg') mk(gBox(0.05, 0.06, 0.09), c2, g, 0, -0.08, front * 0.6);
  if (it.rar >= 3) mk(gBox(0.11, 0.015, 0.06), acc, g, 0, -0.065, -0.1);
  if (it.rar >= 4) { mk(gTorus(0.05, 0.01), glowMat(0xff9a1f), g, 0, 0.02, front + 0.08); mk(gBox(0.014, 0.08, 0.1), glowMat(0xff9a1f), g, -0.045, 0.0, -0.1); }
  const mz = piv(g, 0, 0.02, front); g.userData.muzzle = mz;
  return g;
}

// ---------- Interactable props ----------
function buildRelay(color) {
  const g = new THREE.Group(); const c = toon(0x3a4250), gl = glowMat(color), ga = glowMat(color, 0.6, true);
  mk(gCyl(3.2, 3.6, 0.8, 8), c, g, 0, 0.4, 0); mk(gCyl(2.4, 2.8, 0.5, 8), toon(0x5a6474), g, 0, 1.0, 0);
  mk(gCyl(0.5, 1.1, 9, 6), toon(0x8a96a8), g, 0, 5.6, 0); mk(gCyl(0.2, 0.2, 8.6, 6), gl, g, 0, 5.6, 0, 0, 0, 0, 1.3, 1, 1.3);
  const rings = []; for (let i = 0; i < 3; i++) { const r = mk(gTorus(1.8 - i * 0.35, 0.08, 6, 24), gl, g, 0, 4 + i * 2.6, 0, Math.PI / 2, 0, 0); rings.push(r); }
  mk(gSph(0.8, 1), ga, g, 0, 11, 0); g.userData.rings = rings; return g;
}
function buildBooth() {
  const g = new THREE.Group(); const fr = toon(0xdfe6ee), gl = glowMat(0x5cf0a0);
  mk(gBox(2.2, 0.3, 2.2), toon(0x4a525c), g, 0, 0.15, 0); mk(gBox(2.2, 0.3, 2.2), fr, g, 0, 3.4, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mk(gBox(0.2, 3.1, 0.2), fr, g, x, 1.8, z);
  mk(gBox(1.9, 2.9, 1.9), toon(0x5cf0a0, { transparent: true, opacity: 0.25 }), g, 0, 1.75, 0); mk(gBox(2.0, 0.12, 2.0), gl, g, 0, 3.2, 0);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: textTexture('RECLAIM', '#5cf0a0', '#0d1a14'), transparent: true }));
  sign.position.set(0, 4.0, 1.12); g.add(sign); const s2 = sign.clone(); s2.position.z = -1.12; s2.rotation.y = Math.PI; g.add(s2); return g;
}
function buildKiosk(label, color) {
  const g = new THREE.Group(); const hex = new THREE.Color(color);
  mk(gBox(2.2, 1.2, 1.2), toon(0x3a4250), g, 0, 0.6, 0); mk(gBox(2.0, 1.3, 0.25), toon(0x252a32), g, 0, 1.85, -0.3, -0.15, 0, 0);
  mk(gBox(1.7, 1.0, 0.05), glowMat(color), g, 0, 1.87, -0.15, -0.15, 0, 0); mk(gBox(2.4, 0.15, 1.4), glowMat(color), g, 0, 1.25, 0);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: textTexture(label, '#' + hex.getHexString(), '#0b1018'), transparent: true }));
  sign.position.set(0, 2.95, -0.3); g.add(sign); const s2 = sign.clone(); s2.rotation.y = Math.PI; s2.position.z = -0.32; g.add(s2); return g;
}
function buildTerminal() {
  const g = new THREE.Group(); mk(gCyl(0.6, 0.9, 1.2, 6), toon(0x3a4250), g, 0, 0.6, 0); mk(gBox(1.6, 1.0, 0.12), toon(0x252a32), g, 0, 1.7, 0, -0.5, 0, 0);
  mk(gBox(1.4, 0.8, 0.04), glowMat(0xffc23a), g, 0, 1.72, 0.06, -0.5, 0, 0);
  const ring = mk(gTorus(0.9, 0.04), glowMat(0xffc23a, 0.8, true), g, 0, 2.7, 0, Math.PI / 2, 0, 0); g.userData.rings = [ring];
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: textTexture('MISSIONS', '#ffc23a', '#16110a'), transparent: true, side: THREE.DoubleSide }));
  sign.position.set(0, 3.3, 0); g.add(sign); g.userData.sign = sign; return g;
}
function buildGate(label, color, portal = false) {
  const g = new THREE.Group(); const st = toon(portal ? 0x2a2238 : 0x4a5260), gl = glowMat(color);
  for (const s of [-1, 1]) { mk(gBox(1.4, 9, 1.4), st, g, s * 4.4, 4.5, 0); mk(gBox(0.3, 8, 0.3), gl, g, s * 3.6, 4.5, 0); }
  mk(gBox(10.2, 1.4, 1.6), st, g, 0, 9.4, 0); mk(gBox(8, 0.25, 0.3), gl, g, 0, 8.6, 0.5);
  const pm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 8.4), pm); plane.position.set(0, 4.2, 0); g.add(plane); g.userData.portal = plane;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.2), new THREE.MeshBasicMaterial({ map: textTexture(label.toUpperCase(), '#' + new THREE.Color(color).getHexString(), '#0b1018', 768, 128), transparent: true, side: THREE.DoubleSide }));
  sign.position.set(0, 11, 0); g.add(sign); return g;
}
function buildChest(rare) {
  const g = new THREE.Group(); const base = toon(rare ? 0x2a2f45 : 0x9a2a22), trim = toon(rare ? 0xc26bff : 0x2a2a2a), gl = glowMat(rare ? 0xc26bff : 0xffc23a);
  mk(gBox(1.6, 0.8, 0.9), base, g, 0, 0.4, 0); mk(gBox(1.65, 0.1, 0.95), trim, g, 0, 0.2, 0);
  const lid = piv(g, 0, 0.8, -0.45); mk(gBox(1.62, 0.3, 0.92), base, lid, 0, 0.15, 0.45); mk(gBox(0.3, 0.12, 0.05), gl, lid, 0, 0.12, 0.92);
  mk(gBox(1.62, 0.04, 0.04), gl, g, 0, 0.78, 0.46); g.userData.lid = lid; return g;
}
function buildDungeonDoor(color) {
  const g = new THREE.Group(); const rock = toon(0x6a6258);
  mk(gSph(7, 0), rock, g, 0, 1, -3, 0, 0, 0, 1.3, 0.8, 1); mk(gBox(6, 7, 1), toon(0x3a3a40), g, 0, 3.5, 2.6);
  mk(gBox(4, 5, 0.3), new THREE.MeshBasicMaterial({ color: 0x050508 }), g, 0, 2.5, 3.15);
  for (const s of [-1, 1]) mk(gBox(0.3, 5.4, 0.3), glowMat(color), g, s * 2.2, 2.7, 3.2);
  mk(gBox(4.6, 0.3, 0.3), glowMat(color), g, 0, 5.3, 3.2); return g;
}
function buildCrystalCluster(color) {
  const g = new THREE.Group(); const m = glowMat(color); const m2 = toon(new THREE.Color(color).multiplyScalar(0.6).getHex());
  for (let i = 0; i < 5; i++) { const h = 1 + rnd() * 2.5; mk(gCone(0.3 + rnd() * 0.3, h, 5), i % 2 ? m : m2, g, rr(rnd, -0.8, 0.8), h / 2, rr(rnd, -0.8, 0.8), rr(rnd, -0.4, 0.4), 0, rr(rnd, -0.4, 0.4)); }
  return g;
}
