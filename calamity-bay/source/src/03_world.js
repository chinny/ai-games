// Calamity Bay — terrain (bay to the south, Mount Kessel to the north), water, city ground and trees

const R0 = -450, BLK = 100, NROAD = 10, ROAD_HW = 9, LANE = 4.5, WALK_OFF = 11.5;
const roadPos = (i) => R0 + i * BLK;
const CITY_HALF = 528;      // the flat, paved city square
const WATER_Y = -3;
const MAP = { x0: -900, x1: 900, z0: -900, z1: 1100 }; // where the monster may roam

function coastZ(x) {
  const ax = Math.abs(x);
  return 534 + Math.max(0, ax - 520) * 0.45 + (ax > 520 ? (vnoise(x * 0.012, 7.7) - 0.5) * 50 : 0);
}
function landH(x, z) {
  const ax = Math.abs(x);
  let h = smooth(520, 800, ax) * (14 + 60 * fbm(x * 0.0042, z * 0.0042, 3));
  const t = -z - 500;
  if (t > 0) {
    const n = fbm(x * 0.0035 + 5, z * 0.0035, 4);
    const ridge = 1 - Math.abs(vnoise(x * 0.005 + 11, z * 0.005 - 3) * 2 - 1);
    h += Math.min(t, 650) * 0.42 * (0.55 + 0.8 * n) + ridge * ridge * 210 * smooth(40, 380, t);
  }
  return h;
}
function terrainH(x, z) {
  const d = Math.max(0, Math.abs(x) - CITY_HALF, -z - CITY_HALF);
  let h = landH(x, z) * smooth(0, 90, d);
  const cz = coastZ(x);
  if (z > cz - 40) {
    h *= 1 - smooth(cz - 40, cz, z);
    const s = Math.max(0, z - cz);
    h -= smooth(0, 10, s) * 3.5 + s * 0.17 + (vnoise(x * 0.02, z * 0.02) - 0.5) * 6 * smooth(20, 120, s);
  }
  return Math.max(h, -95);
}
const inCity = (x, z) => Math.abs(x) < CITY_HALF && z > -CITY_HALF && z < coastZ(x);

// ---------- terrain mesh ----------
function buildTerrain() {
  const g = new THREE.PlaneGeometry(3600, 3400, 180, 170);
  g.rotateX(-Math.PI / 2);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i);
    let h = terrainH(x, z);
    if (Math.abs(x) < CITY_HALF - 2 && z > -CITY_HALF + 2 && z < CITY_HALF - 2) h = -0.6;
    P.setY(i, h);
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  const NP = ng.attributes.position, NN = ng.attributes.normal;
  const col = new Float32Array(NP.count * 3), c = new THREE.Color();
  for (let i = 0; i < NP.count; i += 3) {
    const x = (NP.getX(i) + NP.getX(i + 1) + NP.getX(i + 2)) / 3;
    const y = (NP.getY(i) + NP.getY(i + 1) + NP.getY(i + 2)) / 3;
    const z = (NP.getZ(i) + NP.getZ(i + 1) + NP.getZ(i + 2)) / 3;
    const ny = NN.getY(i), n = vnoise(x * 0.03, z * 0.03), j = 0.94 + hash2(i, 3) * 0.12;
    const cz = coastZ(x);
    if (y < -4) c.setRGB(0.47, 0.45, 0.36).lerp(new THREE.Color(0.25, 0.33, 0.33), clamp((-y - 4) / 40, 0, 1));
    else if (z > cz - 30 && y < 4) c.setRGB(0.85, 0.77, 0.56);
    else if (y > 330 && ny > 0.55) c.setRGB(0.95, 0.95, 0.97);
    else if (ny < 0.72 || y > 170) c.setRGB(0.47, 0.44, 0.41).lerp(new THREE.Color(0.58, 0.55, 0.5), n);
    else if (z < -520 && y > 25) c.setRGB(0.27, 0.38, 0.22).lerp(new THREE.Color(0.36, 0.44, 0.27), n);
    else c.setRGB(0.42, 0.55, 0.28).lerp(new THREE.Color(0.52, 0.6, 0.3), n);
    c.multiplyScalar(j);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(ng, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.position.z = 0;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// ---------- the bay ----------
const waterMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: {
    uTime: { value: 0 }, uSun: { value: SUN_DIR }, uCam: { value: new V3() },
    uFogColor: { value: scene.fog.color }, uFogNear: { value: scene.fog.near }, uFogFar: { value: scene.fog.far },
    uSky: { value: HORIZON },
  },
  vertexShader: `uniform float uTime; varying vec3 vW; varying float vDepth;
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0);
    w.y += sin(w.x * 0.045 + uTime * 1.1) * 0.5 + sin(w.z * 0.06 - uTime * 0.8) * 0.45;
    vW = w.xyz;
    vec4 mv = viewMatrix * w; vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`,
  fragmentShader: `uniform float uTime; uniform vec3 uSun; uniform vec3 uCam; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform vec3 uSky;
  varying vec3 vW; varying float vDepth;
  void main(){
    vec2 p = vW.xz; float t = uTime;
    float dx = cos(p.x * 0.045 + t * 1.1) * 0.0225 + cos(p.x * 0.21 + p.y * 0.13 + t * 2.1) * 0.03 + cos(p.x * 0.61 - p.y * 0.4 + t * 3.0) * 0.02;
    float dz = -sin(p.y * 0.06 - t * 0.8) * 0.027 + cos(p.x * 0.21 + p.y * 0.13 + t * 2.1) * 0.02 + cos(p.y * 0.55 + p.x * 0.3 - t * 2.6) * 0.025;
    vec3 n = normalize(vec3(-dx, 1.0, -dz));
    vec3 v = normalize(uCam - vW);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    vec3 c = mix(vec3(0.07, 0.25, 0.32), uSky * 0.95, 0.12 + fres * 0.75);
    vec3 h = normalize(uSun + v);
    c += vec3(1.0, 0.82, 0.55) * pow(max(dot(n, h), 0.0), 160.0) * 1.6;
    float f = smoothstep(uFogNear, uFogFar, vDepth);
    gl_FragColor = vec4(mix(c, uFogColor, f), 0.86 + fres * 0.1);
  }`,
});
function buildWater() {
  const g = new THREE.PlaneGeometry(4200, 2600, 140, 80);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, waterMat);
  m.position.set(0, WATER_Y, 520 + 1300);
  m.renderOrder = 2;
  scene.add(m);
}

// ---------- city plan ----------
// 9 x 9 blocks between 10 roads each way, plus a port strip on the bay.
const LOTS = [];
const PARKS = new Set(['2,6', '6,2', '1,3', '7,6', '3,1', '5,7']);
function planLots() {
  for (let bi = 0; bi < 9; bi++) for (let bj = 0; bj < 9; bj++) {
    const x0 = roadPos(bi) + ROAD_HW + 4, x1 = roadPos(bi + 1) - ROAD_HW - 4;
    const z0 = roadPos(bj) + ROAD_HW + 4, z1 = roadPos(bj + 1) - ROAD_HW - 4;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = Math.max(Math.abs(cx), Math.abs(cz));
    let kind = d < 150 ? 'downtown' : d < 250 ? 'midtown' : 'residential';
    if (bj === 0) kind = 'suburb';
    if (PARKS.has(bi + ',' + bj)) kind = 'park';
    if (bi === 4 && bj === 4) kind = 'plaza';
    LOTS.push({ bi, bj, x0, z0, x1, z1, cx, cz, kind });
  }
  for (let bi = 0; bi < 9; bi++) {
    const x0 = roadPos(bi) + 4, x1 = roadPos(bi + 1) - 4;
    LOTS.push({ bi, bj: 9, x0, z0: 450 + ROAD_HW + 4, x1, z1: 526, cx: (x0 + x1) / 2, cz: 492, kind: 'port' });
  }
}

const LOT_COL = { downtown: '#8f8d88', plaza: '#a29d93', midtown: '#97948c', residential: '#6f9150', suburb: '#729552', park: '#5f8f45', port: '#8a877f' };
function buildCityGround() {
  const N = 2048, W = CITY_HALF * 2, s = N / W;
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const X = (x) => (x + CITY_HALF) * s, Z = (z) => (z + CITY_HALF) * s;
  const rect = (x0, z0, x1, z1, c) => { g.fillStyle = c; g.fillRect(X(x0), Z(z0), (x1 - x0) * s, (z1 - z0) * s); };
  rect(-CITY_HALF, -CITY_HALF, CITY_HALF, CITY_HALF, '#6e8f4c');
  // ground speckle
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + Math.random() * 0.04})`;
    g.fillRect(Math.random() * N, Math.random() * N, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }
  for (const L of LOTS) {
    rect(L.x0 - 4, L.z0 - 4, L.x1 + 4, L.z1 + 4, '#b9b5ab');             // sidewalk
    rect(L.x0, L.z0, L.x1, L.z1, LOT_COL[L.kind]);
    if (L.kind === 'park') {
      g.strokeStyle = '#c9bf9f'; g.lineWidth = 3 * s;
      g.beginPath(); g.moveTo(X(L.x0), Z(L.z0)); g.lineTo(X(L.x1), Z(L.z1)); g.moveTo(X(L.x1), Z(L.z0)); g.lineTo(X(L.x0), Z(L.z1)); g.stroke();
      g.fillStyle = '#c9bf9f'; g.beginPath(); g.arc(X(L.cx), Z(L.cz), 9 * s, 0, TAU); g.fill();
      g.fillStyle = '#4f8fb0'; g.beginPath(); g.arc(X(L.cx), Z(L.cz), 5 * s, 0, TAU); g.fill();
    }
    if (L.kind === 'plaza') {
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
      for (let k = L.x0; k < L.x1; k += 6) { g.beginPath(); g.moveTo(X(k), Z(L.z0)); g.lineTo(X(k), Z(L.z1)); g.stroke(); }
      for (let k = L.z0; k < L.z1; k += 6) { g.beginPath(); g.moveTo(X(L.x0), Z(k)); g.lineTo(X(L.x1), Z(k)); g.stroke(); }
    }
    if (L.kind === 'port') {
      g.strokeStyle = 'rgba(240,200,60,0.55)'; g.lineWidth = 1.2 * s;
      for (let k = L.x0 + 6; k < L.x1; k += 14) { g.beginPath(); g.moveTo(X(k), Z(L.z0 + 4)); g.lineTo(X(k), Z(L.z1 - 6)); g.stroke(); }
    }
  }
  // quay edge
  rect(-CITY_HALF, 522, CITY_HALF, 528, '#a8a49a');
  // roads
  const asphalt = '#3d3f44';
  for (let i = 0; i < NROAD; i++) {
    const r = roadPos(i);
    rect(r - ROAD_HW, R0 - ROAD_HW, r + ROAD_HW, -R0 + ROAD_HW, asphalt);
    rect(R0 - ROAD_HW, r - ROAD_HW, -R0 + ROAD_HW, r + ROAD_HW, asphalt);
  }
  g.lineWidth = 0.5 * s;
  for (let i = 0; i < NROAD; i++) {
    const r = roadPos(i);
    for (let j = 0; j < NROAD - 1; j++) {
      const a = roadPos(j) + ROAD_HW + 2, b = roadPos(j + 1) - ROAD_HW - 2;
      // centre dashes (yellow) and edge lines (white), both axes
      g.strokeStyle = '#e2b93b'; g.setLineDash([6 * s, 5 * s]);
      g.beginPath(); g.moveTo(X(r), Z(a)); g.lineTo(X(r), Z(b)); g.moveTo(X(a), Z(r)); g.lineTo(X(b), Z(r)); g.stroke();
      g.strokeStyle = 'rgba(235,235,230,0.8)'; g.setLineDash([]);
      for (const o of [-ROAD_HW + 1, ROAD_HW - 1]) {
        g.beginPath(); g.moveTo(X(r + o), Z(a)); g.lineTo(X(r + o), Z(b)); g.moveTo(X(a), Z(r + o)); g.lineTo(X(b), Z(r + o)); g.stroke();
      }
    }
    // crosswalk stripes at each intersection
    g.fillStyle = 'rgba(240,240,235,0.85)';
    for (let j = 0; j < NROAD; j++) {
      const q = roadPos(j);
      for (let k = -ROAD_HW + 1.5; k < ROAD_HW - 1; k += 2.6) {
        g.fillRect(X(r + k), Z(q - ROAD_HW - 0.5), 1.3 * s, 3 * s);
        g.fillRect(X(r + k), Z(q + ROAD_HW - 2.5), 1.3 * s, 3 * s);
        g.fillRect(X(q - ROAD_HW - 0.5), Z(r + k), 3 * s, 1.3 * s);
        g.fillRect(X(q + ROAD_HW - 2.5), Z(r + k), 3 * s, 1.3 * s);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const geo = new THREE.PlaneGeometry(W, W);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// ---------- trees ----------
const TREES = { x: [], y: [], z: [], s: [], kind: [], alive: [], slot: [], grid: new Map(), mesh: [] };
const treeKey = (x, z) => (Math.floor(x / 25) + 200) * 1000 + (Math.floor(z / 25) + 200);
function addTree(x, z, kind, s) {
  const i = TREES.x.length;
  TREES.x.push(x); TREES.z.push(z); TREES.y.push(terrainH(x, z)); TREES.s.push(s); TREES.kind.push(kind); TREES.alive.push(true);
  const k = treeKey(x, z);
  if (!TREES.grid.has(k)) TREES.grid.set(k, []);
  TREES.grid.get(k).push(i);
}
function buildTrees() {
  // outskirts and mountains
  let n = 0;
  for (let tries = 0; n < (isTouch ? 1800 : 3200) && tries < 40000; tries++) {
    const x = rr(-1500, 1500), z = rr(-1350, 900);
    if (Math.abs(x) < CITY_HALF + 15 && z > -CITY_HALF - 15) continue;
    const h = terrainH(x, z);
    if (h < 1.5 || h > 260) continue;
    const slope = Math.abs(terrainH(x + 4, z) - h) + Math.abs(terrainH(x, z + 4) - h);
    if (slope > 7) continue;
    if (vnoise(x * 0.008, z * 0.008) < 0.38) continue;   // clumps and clearings
    addTree(x, z, z < -480 || h > 40 ? 1 : (rand() < 0.3 ? 1 : 0), rr(0.8, 1.35));
    n++;
  }
  // parks and street trees
  for (const L of LOTS) {
    if (L.kind === 'park') {
      for (let k = 0; k < 34; k++) {
        const x = rr(L.x0 + 3, L.x1 - 3), z = rr(L.z0 + 3, L.z1 - 3);
        if (Math.hypot(x - L.cx, z - L.cz) < 14 || Math.abs(Math.abs(x - L.cx) - Math.abs(z - L.cz)) < 4) continue;
        addTree(x, z, rand() < 0.15 ? 1 : 0, rr(0.75, 1.15));
      }
    } else if (L.kind !== 'port') {
      const step = L.kind === 'downtown' ? 0 : 18;
      if (!step) continue;
      for (let x = L.x0 + 6; x < L.x1; x += step) { addTree(x, L.z0 - 2, 0, 0.6); addTree(x, L.z1 + 2, 0, 0.6); }
    }
  }
}
function finishTrees() {
  const leaf = mergeParts([
    { geo: new THREE.CylinderGeometry(0.5, 0.8, 4, 5), p: [0, 2, 0], c: [0.42, 0.3, 0.2] },
    { geo: new THREE.IcosahedronGeometry(4, 0), p: [0, 7, 0], s: [1, 0.95, 1], c: [0.36, 0.55, 0.25] },
    { geo: new THREE.IcosahedronGeometry(2.8, 0), p: [1.6, 9, 0.8], c: [0.42, 0.6, 0.28] },
  ]);
  const pine = mergeParts([
    { geo: new THREE.CylinderGeometry(0.5, 0.8, 4, 5), p: [0, 2, 0], c: [0.4, 0.28, 0.2] },
    { geo: new THREE.ConeGeometry(4.6, 8, 6), p: [0, 7, 0], c: [0.2, 0.36, 0.22] },
    { geo: new THREE.ConeGeometry(3.4, 7, 6), p: [0, 11.5, 0], c: [0.23, 0.4, 0.25] },
  ]);
  const geos = [leaf, pine];
  const counts = [0, 0];
  for (let i = 0; i < TREES.x.length; i++) counts[TREES.kind[i]]++;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const used = [0, 0], c = new THREE.Color();
  for (let k = 0; k < 2; k++) {
    const m = new THREE.InstancedMesh(geos[k], mat, Math.max(1, counts[k]));
    m.castShadow = true; m.receiveShadow = false;
    TREES.mesh.push(m); scene.add(m);
  }
  for (let i = 0; i < TREES.x.length; i++) {
    const k = TREES.kind[i], slot = used[k]++;
    TREES.slot.push(slot);
    const s = TREES.s[i];
    _m4.compose(_v1.set(TREES.x[i], TREES.y[i], TREES.z[i]), _q1.setFromAxisAngle(UP, hash2(i, 9) * TAU), _v2.set(s, s * (0.85 + hash2(i, 4) * 0.3), s));
    TREES.mesh[k].setMatrixAt(slot, _m4);
    const j = 0.8 + hash2(i, 1) * 0.35;
    TREES.mesh[k].setColorAt(slot, c.setRGB(j * (0.95 + hash2(i, 2) * 0.15), j, j * 0.9));
  }
  for (const m of TREES.mesh) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}
function crushTrees(x, z, r, fling) {
  let hit = 0;
  const x0 = Math.floor((x - r) / 25), x1 = Math.floor((x + r) / 25), z0 = Math.floor((z - r) / 25), z1 = Math.floor((z + r) / 25);
  for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
    const list = TREES.grid.get((gx + 200) * 1000 + gz + 200);
    if (!list) continue;
    for (const i of list) {
      if (!TREES.alive[i]) continue;
      const dx = TREES.x[i] - x, dz = TREES.z[i] - z;
      if (dx * dx + dz * dz > r * r) continue;
      TREES.alive[i] = false; hit++;
      const m = TREES.mesh[TREES.kind[i]];
      m.setMatrixAt(TREES.slot[i], ZERO_M); m.instanceMatrix.needsUpdate = true;
      leafBurst(TREES.x[i], TREES.y[i] + 6 * TREES.s[i], TREES.z[i], TREES.kind[i], fling);
    }
  }
  return hit;
}
