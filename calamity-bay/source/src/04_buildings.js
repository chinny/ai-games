// Calamity Bay — buildings as grids of breakable blocks, structural collapse, procedural facades

// Facade styles (the shader draws windows from these): 0 glass tower, 1 office, 2 apartment,
// 3 house, 4 industrial, 5 container, 6 plain steel/concrete, 7 rock.
const ST = { GLASS: 0, OFFICE: 1, APT: 2, HOUSE: 3, IND: 4, BOX: 5, PLAIN: 6, ROCK: 7 };
const ST_HP = [150, 120, 85, 38, 60, 40, 80, 200];
const ST_RATE = [2600, 2100, 1500, 2200, 600, 900, 1400, 0]; // $ per unit volume

const buildMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
buildMat.onBeforeCompile = (sh) => {
  sh.vertexShader = 'attribute vec4 aInfo;\nvarying vec3 vP; varying vec3 vN2; varying float vSt;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vec3 sc_ = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vP = aInfo.xyz + position * sc_; vN2 = normal; vSt = aInfo.w;`);
  sh.fragmentShader = 'varying vec3 vP; varying vec3 vN2; varying float vSt;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float st = floor(vSt + 0.001);
    float dmg = clamp(vSt - st, 0.0, 1.0);
    vec3 N = normalize(vN2);
    vec3 base = diffuseColor.rgb;
    if (abs(N.y) < 0.5) {
      float u = abs(N.x) > 0.5 ? vP.z : vP.x;
      float y = vP.y;
      float fh = 3.6, cs = 3.2; vec2 ww = vec2(0.0);
      if (st < 0.5) { cs = 3.0; ww = vec2(0.84, 0.8); }
      else if (st < 1.5) { cs = 3.6; ww = vec2(0.93, 0.46); }
      else if (st < 2.5) { cs = 4.2; ww = vec2(0.42, 0.5); }
      else if (st < 3.5) { fh = 3.4; cs = 4.4; ww = vec2(0.3, 0.4); }
      else if (st < 4.5) { fh = 6.5; cs = 7.0; ww = vec2(0.75, 0.16); base *= 0.9 + 0.1 * step(0.5, fract(u * 0.9)); }
      else if (st < 5.5) { base *= 0.84 + 0.16 * step(0.45, fract(u * 1.5)); }
      if (st < 2.5 && y < 4.6) { fh = 4.6; ww = vec2(0.86, 0.6); }
      if (ww.x > 0.0) {
        vec2 g = vec2(u / cs, y / fh);
        vec2 f = fract(g);
        vec2 fw = fwidth(g) * 1.2;
        vec2 lo = 0.5 - ww * 0.5, hi = 0.5 + ww * 0.5;
        vec2 m = smoothstep(lo - fw, lo + fw, f) * (1.0 - smoothstep(hi - fw, hi + fw, f));
        float win = m.x * m.y;
        float far = clamp(max(fw.x, fw.y) * 1.6 - 0.3, 0.0, 1.0);
        win = mix(win, ww.x * ww.y, far);
        float r = fract(sin(dot(floor(g), vec2(12.9898, 78.233)) + floor(vP.x * 0.01) * 7.0) * 43758.5453);
        vec3 glass = mix(vec3(0.12, 0.2, 0.28), base * 0.5, 0.3) * (0.8 + 0.4 * r);
        if (st < 0.5) glass = mix(vec3(0.22, 0.36, 0.48), base * 0.75, 0.45) * (0.85 + 0.3 * r);
        base = mix(base, glass, win);
        float lit = step(0.94, r) * (1.0 - far);
        totalEmissiveRadiance += (vec3(0.06, 0.08, 0.11) + vec3(0.6, 0.45, 0.22) * lit) * win * (1.0 - dmg);
      }
    } else if (N.y > 0.5) base = base * 0.7 + 0.05;
    else base *= 0.4;
    diffuseColor.rgb = mix(base, vec3(0.09, 0.08, 0.075), dmg * 0.85);
  }`);
};
buildMat.customProgramCacheKey = () => 'cb-building';

const BLD = [];
const BLK_ = [];       // every block: {x,y,z,hx,hy,hz,hp,max,b,ci,j,alive,vol,w,info:[4],col:[3]}
const STATS = { volTotal: 0, wTotal: 0, wGone: 0, money: 0, blocks: 0, down: 0, cars: 0, units: 0, people: 0 };
let staticMesh = null, staticInfo = null, staticDirtyM = false, staticDirtyI = false;
let roofMesh = null;
const ROOFS = [];
const dirtyB = [];

// ---------- spatial grid of buildings ----------
const BG_CELL = 32, BG_N = 44, BG_OFF = 22;
const BGRID = Array.from({ length: BG_N * BG_N }, () => []);
const bgIdx = (x, z) => {
  const gx = Math.floor(x / BG_CELL) + BG_OFF, gz = Math.floor(z / BG_CELL) + BG_OFF;
  return gx < 0 || gz < 0 || gx >= BG_N || gz >= BG_N ? -1 : gz * BG_N + gx;
};

function makeBuilding(o) {
  const b = {
    id: BLD.length, x0: o.x0, z0: o.z0, nx: o.nx, ny: o.ny, nz: o.nz, cw: o.cw, cd: o.cd, ch: o.ch,
    style: o.style, kind: o.kind || 'bld', name: o.name || '',
    cells: new Int32Array(o.nx * o.ny * o.nz).fill(-1), occ0: new Uint8Array(o.nx * o.ny * o.nz),
    layerOrig: new Int32Array(o.ny), layerNow: new Int32Array(o.ny), alive: 0, vol: 0, volLeft: 0, wPer: 1,
    dirty: false, touched: false, down: false, roof: -1, fireT: 0, lastHit: new V3(1, 0, 0),
  };
  b.x1 = b.x0 + b.nx * b.cw; b.z1 = b.z0 + b.nz * b.cd; b.y1 = b.ny * b.ch;
  const hp = o.hp || ST_HP[o.style];
  for (let j = 0; j < b.ny; j++) for (let k = 0; k < b.nz; k++) for (let i = 0; i < b.nx; i++) {
    if (o.occ && !o.occ(i, j, k)) continue;
    const ci = (j * b.nz + k) * b.nx + i;
    const lx = (i + 0.5) * b.cw, ly = (j + 0.5) * b.ch, lz = (k + 0.5) * b.cd;
    const col = o.color(i, j, k);
    const vol = b.cw * b.ch * b.cd;
    const id = BLK_.length;
    BLK_.push({
      x: b.x0 + lx, y: ly, z: b.z0 + lz, hx: b.cw / 2, hy: b.ch / 2, hz: b.cd / 2,
      hp, max: hp, b: b.id, ci, j, alive: true, vol, w: 0, info: [lx, ly, lz, o.style], col,
    });
    b.cells[ci] = id; b.occ0[ci] = 1;
    b.layerOrig[j]++; b.layerNow[j]++; b.alive++; b.vol += vol;
  }
  if (!b.alive) return null;
  b.volLeft = b.vol;
  BLD.push(b);
  for (let gx = Math.floor(b.x0 / BG_CELL); gx <= Math.floor((b.x1 - 0.01) / BG_CELL); gx++)
    for (let gz = Math.floor(b.z0 / BG_CELL); gz <= Math.floor((b.z1 - 0.01) / BG_CELL); gz++) {
      const gi = (gz + BG_OFF) * BG_N + gx + BG_OFF;
      if (gi >= 0 && gi < BGRID.length) BGRID[gi].push(b);
    }
  return b;
}

// Pastel-to-concrete palettes
const PAL = {
  glass: [[0.62, 0.67, 0.72], [0.36, 0.46, 0.56], [0.58, 0.5, 0.4], [0.3, 0.33, 0.37], [0.74, 0.76, 0.74], [0.42, 0.55, 0.58]],
  office: [[0.82, 0.78, 0.68], [0.72, 0.72, 0.7], [0.88, 0.86, 0.8], [0.7, 0.62, 0.52], [0.6, 0.64, 0.66]],
  apt: [[0.66, 0.36, 0.28], [0.56, 0.38, 0.3], [0.84, 0.76, 0.62], [0.78, 0.55, 0.45], [0.62, 0.58, 0.5], [0.85, 0.82, 0.74]],
  house: [[0.92, 0.88, 0.76], [0.78, 0.86, 0.9], [0.95, 0.82, 0.7], [0.8, 0.9, 0.78], [0.96, 0.95, 0.9], [0.86, 0.78, 0.86], [0.95, 0.9, 0.62]],
  roof: [[0.55, 0.25, 0.2], [0.35, 0.33, 0.35], [0.45, 0.3, 0.22], [0.3, 0.38, 0.45], [0.5, 0.45, 0.4]],
  ind: [[0.6, 0.62, 0.6], [0.48, 0.56, 0.6], [0.55, 0.6, 0.5], [0.7, 0.66, 0.58]],
  box: [[0.75, 0.2, 0.15], [0.15, 0.35, 0.65], [0.9, 0.55, 0.15], [0.2, 0.55, 0.3], [0.85, 0.82, 0.2], [0.85, 0.85, 0.85], [0.5, 0.25, 0.5]],
};
const jit = (c, a = 0.06) => c.map((v) => clamp(v * (1 - a + rand() * a * 2), 0, 1));

function tower(x0, z0, w, d, h, style, opts = {}) {
  const nx = clamp(Math.round(w / 8), 2, 6), nz = clamp(Math.round(d / 8), 2, 6);
  const ch = opts.ch || 8, ny = Math.max(3, Math.round(h / ch));
  const s1 = rand() < 0.6 ? Math.floor(ny * rr(0.55, 0.75)) : 999;
  const s2 = s1 < 999 && rand() < 0.5 ? Math.floor(lerp(s1, ny, rr(0.4, 0.7))) : 999;
  const base = jit(pick(style === ST.GLASS ? PAL.glass : PAL.office));
  const band = rand() < 0.35;
  return makeBuilding({
    x0, z0, nx, nz, ny, cw: w / nx, cd: d / nz, ch, style, kind: 'tower', name: opts.name,
    occ: (i, j, k) => {
      const ins = j >= s2 ? 2 : j >= s1 ? 1 : 0;
      const ix = Math.min(ins, Math.floor((nx - 1) / 2)), iz = Math.min(ins, Math.floor((nz - 1) / 2));
      return i >= ix && i < nx - ix && k >= iz && k < nz - iz;
    },
    color: (i, j) => band && j % 4 === 3 ? base.map((v) => v * 0.8) : base,
  });
}
function midrise(x0, z0, w, d, h, style) {
  const nx = clamp(Math.round(w / 7.5), 2, 5), nz = clamp(Math.round(d / 7.5), 2, 5);
  const ch = 7, ny = Math.max(2, Math.round(h / ch));
  const base = jit(pick(style === ST.APT ? PAL.apt : PAL.office));
  const lShape = rand() < 0.3 && nx >= 3 && nz >= 3, cut = ri(0, 3), cutH = ri(1, ny - 1);
  return makeBuilding({
    x0, z0, nx, nz, ny, cw: w / nx, cd: d / nz, ch, style, kind: 'mid',
    occ: (i, j, k) => {
      if (!lShape || j < cutH) return true;
      const hi = i >= nx / 2, hk = k >= nz / 2;
      return !(hi === !!(cut & 1) && hk === !!(cut & 2));
    },
    color: (i, j) => j === 0 && style === ST.APT ? base.map((v) => v * 0.85) : base,
  });
}
function house(x0, z0, w, d) {
  const two = rand() < 0.3;
  const base = jit(pick(PAL.house), 0.04);
  const b = makeBuilding({ x0, z0, nx: 1, nz: 1, ny: two ? 2 : 1, cw: w, cd: d, ch: 3.4 * (two ? 1 : 2) / (two ? 1 : 1), style: ST.HOUSE, kind: 'house', color: () => base });
  if (b) {
    const along = w > d ? 0 : 1;
    ROOFS.push({ b: b.id, x: x0 + w / 2, y: b.y1, z: z0 + d / 2, w: (along ? d : w) + 1.2, d: (along ? w : d) + 1.2, h: Math.min(w, d) * 0.45, rot: along ? Math.PI / 2 : 0, col: jit(pick(PAL.roof)), alive: true });
    b.roof = ROOFS.length - 1;
  }
  return b;
}
function warehouse(x0, z0, w, d) {
  const nx = clamp(Math.round(w / 9), 2, 7), nz = clamp(Math.round(d / 9), 2, 5);
  const base = jit(pick(PAL.ind));
  return makeBuilding({ x0, z0, nx, nz, ny: 2, cw: w / nx, cd: d / nz, ch: 6.5, style: ST.IND, kind: 'warehouse', color: () => base });
}
function containers(x0, z0, rows, len) {
  for (let r = 0; r < rows; r++) for (let c = 0; c < len; c++) {
    const n = ri(1, 4);
    makeBuilding({ x0: x0 + c * 13, z0: z0 + r * 6, nx: 1, nz: 1, ny: n, cw: 12, cd: 5, ch: 2.8, style: ST.BOX, kind: 'box', color: () => jit(pick(PAL.box), 0.05) });
  }
}
function crane(x0, z0) {
  const c = [0.86, 0.36, 0.14], w = [0.92, 0.9, 0.86];
  makeBuilding({
    x0, z0, nx: 1, nz: 11, ny: 9, cw: 4, cd: 6, ch: 5.2, style: ST.PLAIN, kind: 'crane', hp: 70,
    occ: (i, j, k) => (j < 7 && (k === 1 || k === 5)) || j === 7 || (j === 8 && (k === 2 || k === 3)),
    color: (i, j) => (j === 8 ? w : c),
  });
}
function radioTower(x0, z0) {
  const red = [0.85, 0.2, 0.15], white = [0.93, 0.93, 0.9];
  return makeBuilding({
    x0, z0, nx: 3, nz: 3, ny: 22, cw: 6, cd: 6, ch: 9, style: ST.PLAIN, kind: 'radio', name: 'KBAY Broadcast Tower', hp: 90,
    occ: (i, j, k) => j < 2 || (i === 1 && k === 1),
    color: (i, j) => (j < 2 ? [0.6, 0.6, 0.58] : Math.floor(j / 2) % 2 ? red : white),
  });
}
function landmark(x0, z0) {
  const cream = [0.86, 0.8, 0.66], gold = [0.85, 0.68, 0.32];
  return makeBuilding({
    x0, z0, nx: 4, nz: 4, ny: 29, cw: 8.5, cd: 8.5, ch: 8, style: ST.OFFICE, kind: 'tower', name: 'Meridian Tower', hp: 170,
    occ: (i, j, k) => {
      if (j < 16) return true;
      if (j < 25) return i >= 1 && i <= 2 && k >= 1 && k <= 2;
      return i === 1 && k === 1;
    },
    color: (i, j) => (j === 15 || j === 24 ? gold : j >= 25 ? gold : cream),
  });
}

function fillLot(L) {
  const { x0, z0, x1, z1 } = L, W = x1 - x0, D = z1 - z0;
  if (L.kind === 'plaza') {
    landmark(L.cx - 17, L.cz - 17);
    return;
  }
  if (L.kind === 'park') return;
  if (L.kind === 'downtown') {
    const r = rand();
    if (r < 0.3) {
      const w = rr(40, 56), d = rr(40, 56);
      tower(L.cx - w / 2, L.cz - d / 2, w, d, rr(120, 185), rand() < 0.6 ? ST.GLASS : ST.OFFICE);
    } else if (r < 0.65) {
      const alongX = rand() < 0.5;
      for (let s = 0; s < 2; s++) {
        const w = rr(26, 32), d = rr(28, 36), h = rr(75, 165);
        const cx = alongX ? x0 + W * (s ? 0.75 : 0.25) : L.cx, cz = alongX ? L.cz : z0 + D * (s ? 0.75 : 0.25);
        tower(cx - (alongX ? w : d) / 2, cz - (alongX ? d : w) / 2, alongX ? w : d, alongX ? d : w, h, rand() < 0.55 ? ST.GLASS : ST.OFFICE);
      }
    } else {
      for (let s = 0; s < 4; s++) {
        const cx = x0 + W * (s & 1 ? 0.75 : 0.25), cz = z0 + D * (s & 2 ? 0.75 : 0.25);
        const w = rr(22, 30), d = rr(22, 30);
        tower(cx - w / 2, cz - d / 2, w, d, rr(48, 120), rand() < 0.5 ? ST.GLASS : ST.OFFICE);
      }
    }
    return;
  }
  if (L.kind === 'midtown') {
    for (let s = 0; s < 4; s++) {
      const cx = x0 + W * (s & 1 ? 0.75 : 0.25), cz = z0 + D * (s & 2 ? 0.75 : 0.25);
      if (L.bi === 6 && L.bj === 4 && s === 0) { radioTower(cx - 9, cz - 9); continue; }
      if (rand() < 0.08) { for (let t = 0; t < 4; t++) addTree(cx + rr(-12, 12), cz + rr(-12, 12), 0, 0.7); continue; }
      const w = rr(22, 32), d = rr(22, 32);
      midrise(cx - w / 2, cz - d / 2, w, d, rr(22, 62), rand() < 0.5 ? ST.APT : ST.OFFICE);
    }
    return;
  }
  if (L.kind === 'residential' || L.kind === 'suburb') {
    const n = 3, pw = W / n, pd = D / n;
    const shops = L.kind === 'residential' && rand() < 0.45;
    for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) {
      const cx = x0 + pw * (a + 0.5), cz = z0 + pd * (c + 0.5);
      const edge = a !== 1 || c !== 1;
      if (shops && edge && (c === 0 || c === 2) && rand() < 0.7) {
        midrise(cx - pw * 0.42, cz - pd * 0.4, pw * 0.84, pd * 0.8, rr(10, 24), ST.APT);
        continue;
      }
      if (!edge && rand() < 0.5) { for (let t = 0; t < 3; t++) addTree(cx + rr(-8, 8), cz + rr(-8, 8), 0, rr(0.6, 0.9)); continue; }
      const w = rr(10, 15), d = rr(10, 14);
      house(cx - w / 2 + rr(-2, 2), cz - d / 2 + rr(-2, 2), w, d);
      if (rand() < (L.kind === 'suburb' ? 0.9 : 0.5)) addTree(cx + (rand() < 0.5 ? -1 : 1) * rr(8, 10), cz + rr(-6, 6), L.kind === 'suburb' && rand() < 0.3 ? 1 : 0, rr(0.6, 0.85));
    }
    return;
  }
  if (L.kind === 'port') {
    const mode = L.bi % 3;
    if (mode === 0) {
      warehouse(x0 + 4, z0 + 4, W - 8, rr(26, 34));
      containers(x0 + 6, z1 - 18, 2, Math.floor((W - 12) / 13));
    } else if (mode === 1) {
      containers(x0 + 4, z0 + 4, 5, Math.floor((W - 8) / 13));
    } else {
      containers(x0 + 4, z0 + 4, 3, Math.floor((W - 30) / 13));
      crane(x1 - 22, z0 + 2); crane(x1 - 10, z0 + 2);
    }
  }
}

function genCity() {
  planLots();
  for (const L of LOTS) fillLot(L);
  // structural weighting: very large buildings count a little less per unit volume
  for (const b of BLD) b.wPer = Math.pow(b.vol, -0.2);
  for (const k of BLK_) { k.w = k.vol * BLD[k.b].wPer; STATS.wTotal += k.w; STATS.volTotal += k.vol; }
  // static instanced mesh for every block in the city
  const n = BLK_.length;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  staticInfo = new Float32Array(n * 4);
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(staticInfo, 4));
  staticMesh = new THREE.InstancedMesh(geo, buildMat, n);
  staticMesh.frustumCulled = false;
  staticMesh.castShadow = true; staticMesh.receiveShadow = true;
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const k = BLK_[i];
    _m4.makeScale(k.hx * 2, k.hy * 2, k.hz * 2).setPosition(k.x, k.y, k.z);
    staticMesh.setMatrixAt(i, _m4);
    staticMesh.setColorAt(i, c.setRGB(k.col[0], k.col[1], k.col[2]));
    staticInfo.set(k.info, i * 4);
  }
  scene.add(staticMesh);
  // gabled roofs for houses
  const rg = new THREE.BufferGeometry();
  const P = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, 0, 1, 0.5,
    -0.5, 0, -0.5, 0, 1, -0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1, 0.5, -0.5, 0, 0.5,
    0.5, 0, -0.5, 0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5];
  rg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  rg.computeVertexNormals();
  ROOF_GEO = rg;
  roofMesh = new THREE.InstancedMesh(rg, new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, ROOFS.length));
  roofMesh.castShadow = true; roofMesh.receiveShadow = true; roofMesh.frustumCulled = false;
  ROOFS.forEach((r, i) => {
    _m4.compose(_v1.set(r.x, r.y, r.z), _q1.setFromAxisAngle(UP, r.rot), _v2.set(r.w, r.h, r.d));
    roofMesh.setMatrixAt(i, _m4);
    roofMesh.setColorAt(i, c.setRGB(...r.col));
  });
  scene.add(roofMesh);
}
let ROOF_GEO = null;

// ---------- queries ----------
let bStamp = 1;
function staticAt(x, y, z) {
  if (y < 0) return -1;
  const gi = bgIdx(x, z);
  if (gi < 0) return -1;
  for (const b of BGRID[gi]) {
    if (x < b.x0 || x >= b.x1 || z < b.z0 || z >= b.z1 || y >= b.y1 || !b.alive) continue;
    const i = ((x - b.x0) / b.cw) | 0, k = ((z - b.z0) / b.cd) | 0, j = (y / b.ch) | 0;
    const id = b.cells[(j * b.nz + k) * b.nx + i];
    if (id >= 0) return id;
  }
  return -1;
}
// Visit each live block whose box comes within r of (cx,cy,cz). fn(blockId, dist)
function blocksInSphere(cx, cy, cz, r, fn) {
  const stamp = ++bStamp;
  for (let gx = Math.floor((cx - r) / BG_CELL); gx <= Math.floor((cx + r) / BG_CELL); gx++)
    for (let gz = Math.floor((cz - r) / BG_CELL); gz <= Math.floor((cz + r) / BG_CELL); gz++) {
      const gi = (gz + BG_OFF) * BG_N + gx + BG_OFF;
      if (gx + BG_OFF < 0 || gz + BG_OFF < 0 || gx + BG_OFF >= BG_N || gz + BG_OFF >= BG_N) continue;
      for (const b of BGRID[gi]) {
        if (b._s === stamp || !b.alive) continue;
        b._s = stamp;
        if (cx + r < b.x0 || cx - r > b.x1 || cz + r < b.z0 || cz - r > b.z1 || cy - r > b.y1 || cy + r < 0) continue;
        const i0 = clamp(Math.floor((cx - r - b.x0) / b.cw), 0, b.nx - 1), i1 = clamp(Math.floor((cx + r - b.x0) / b.cw), 0, b.nx - 1);
        const k0 = clamp(Math.floor((cz - r - b.z0) / b.cd), 0, b.nz - 1), k1 = clamp(Math.floor((cz + r - b.z0) / b.cd), 0, b.nz - 1);
        const j0 = clamp(Math.floor((cy - r) / b.ch), 0, b.ny - 1), j1 = clamp(Math.floor((cy + r) / b.ch), 0, b.ny - 1);
        for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
          const id = b.cells[(j * b.nz + k) * b.nx + i];
          if (id < 0) continue;
          const B = BLK_[id];
          const dx = Math.max(Math.abs(cx - B.x) - B.hx, 0), dy = Math.max(Math.abs(cy - B.y) - B.hy, 0), dz = Math.max(Math.abs(cz - B.z) - B.hz, 0);
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d <= r) fn(id, d);
        }
      }
    }
}
// March a ray through the city: returns {t, id} for the first block (id -1 for ground).
function raycastCity(ox, oy, oz, dx, dy, dz, maxT, step = 2) {
  for (let t = 0; t < maxT; t += step) {
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    if (y < terrainH(x, z)) return { t, id: -1, x, y, z };
    const id = staticAt(x, y, z);
    if (id >= 0) return { t, id, x, y, z };
  }
  return null;
}

// ---------- damage ----------
let frameCrumble = 0;
function setTint(id) {
  const B = BLK_[id];
  staticInfo[id * 4 + 3] = B.info[3] + clamp(1 - B.hp / B.max, 0, 1) * 0.85;
  staticDirtyI = true;
}
function damageBlock(id, dmg, ix, iy, iz, split) {
  const B = BLK_[id];
  if (!B.alive) return false;
  B.hp -= dmg;
  const b = BLD[B.b];
  if (ix || iz) b.lastHit.set(ix, 0, iz).normalize();
  if (!b.touched) firstDamage(b);
  if (B.hp <= 0) { detachBlock(id, ix, iy, iz, split); return true; }
  setTint(id);
  return false;
}
function firstDamage(b) {
  b.touched = true;
  if (typeof onBuildingHit === 'function') onBuildingHit(b);
  if (b.roof >= 0) {
    const r = ROOFS[b.roof];
    if (r.alive) {
      r.alive = false;
      roofMesh.setMatrixAt(b.roof, ZERO_M); roofMesh.instanceMatrix.needsUpdate = true;
      spawnRoof(r);
    }
  }
}
function removeStatic(id) {
  const B = BLK_[id], b = BLD[B.b];
  B.alive = false;
  b.cells[B.ci] = -1; b.layerNow[B.j]--; b.alive--; b.volLeft -= B.vol;
  staticMesh.setMatrixAt(id, ZERO_M); staticDirtyM = true;
  STATS.wGone += B.w; STATS.money += B.vol * ST_RATE[B.info[3] | 0]; STATS.blocks++;
  if (!b.down && b.volLeft < b.vol * 0.3) { b.down = true; STATS.down++; if (typeof onBuildingDown === 'function') onBuildingDown(b); }
  if (!b.dirty) { b.dirty = true; dirtyB.push(b); }
  if (!b.touched) firstDamage(b);
  if (b.roof >= 0 && ROOFS[b.roof].alive) firstDamage(b);
  wakeNear(B.x, B.y + B.hy, B.z, Math.max(B.hx, B.hz) * 1.6);
  frameCrumble += B.vol;
}
function detachBlock(id, ix = 0, iy = 0, iz = 0, split = false) {
  const B = BLK_[id];
  if (!B.alive) return;
  removeStatic(id);
  const big = B.hx * B.hy * B.hz > 30;
  if (split && big) {
    // shatter into 2-4 pieces split along the longest axes
    const ax = B.hx >= B.hz ? 0 : 2;
    const parts = [];
    for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) {
      const off = [0, 0, 0], h = [B.hx, B.hy / 2, B.hz];
      off[1] = t * B.hy / 2;
      if (ax === 0) { h[0] = B.hx / 2; off[0] = s * B.hx / 2; } else { h[2] = B.hz / 2; off[2] = s * B.hz / 2; }
      parts.push([off, h]);
    }
    for (const [off, h] of parts) {
      const spread = 3;
      spawnBlockBody(B, off, h, ix + off[0] / B.hx * spread + frand(-2, 2), iy + frand(0, 4), iz + off[2] / B.hz * spread + frand(-2, 2), 30);
    }
  } else {
    spawnBlockBody(B, [0, 0, 0], [B.hx, B.hy, B.hz], ix + frand(-1, 1), iy, iz + frand(-1, 1), big ? 0 : 40);
  }
  if (Math.random() < 0.6) dustAt(B.x, B.y, B.z, Math.max(B.hx, B.hy, B.hz) * 1.6, 2);
  if (Math.random() < 0.35) sparkBurst(B.x, B.y, B.z, 3);
}

// ---------- structural checks ----------
function processDirty() {
  let n = 0;
  while (dirtyB.length && n < 6) {
    const b = dirtyB.shift();
    b.dirty = false;
    checkBuilding(b);
    n++;
  }
}
function checkBuilding(b) {
  if (b.alive <= 0) return;
  let above = b.alive;
  for (let j = 0; j < b.ny; j++) {
    const now = b.layerNow[j], orig = b.layerOrig[j];
    above -= now;
    if (orig === 0 || above <= 0) continue;
    const r = now / orig;
    if (r < 0.34 || (r <= 0.5 && above > now * 5)) { collapseFrom(b, j); return; }
  }
  // connectivity to the ground through face-adjacent blocks
  const { nx, ny, nz, cells } = b, N = cells.length;
  const seen = new Uint8Array(N), q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (let c = 0; c < nx * nz; c++) if (cells[c] >= 0) { seen[c] = 1; q[qt++] = c; }
  while (qh < qt) {
    const c = q[qh++], i = c % nx, k = ((c / nx) | 0) % nz, j = (c / (nx * nz)) | 0;
    const nb = [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, k > 0 ? c - nx : -1, k < nz - 1 ? c + nx : -1, j > 0 ? c - nx * nz : -1, j < ny - 1 ? c + nx * nz : -1];
    for (const d of nb) if (d >= 0 && !seen[d] && cells[d] >= 0) { seen[d] = 1; q[qt++] = d; }
  }
  const loose = [];
  for (let c = 0; c < N; c++) if (cells[c] >= 0 && !seen[c]) loose.push(cells[c]);
  if (!loose.length) return;
  if (loose.length >= 6) makeFalling(b, loose, b.lastHit, 0.15);
  else for (const id of loose) detachBlock(id, frand(-1, 1), 0, frand(-1, 1));
}
function collapseFrom(b, j) {
  const { nx, nz, cells } = b;
  // which way does it tip? toward the side that lost the most support
  let ox = 0, oz = 0, on = 0, rx = 0, rz = 0, rn = 0;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const c = (j * nz + k) * nx + i;
    if (b.occ0[c]) { ox += i; oz += k; on++; }
    if (cells[c] >= 0) { rx += i; rz += k; rn++; }
  }
  const dir = new V3(0, 0, 0);
  if (rn && on) dir.set(ox / on - rx / rn, 0, oz / on - rz / rn);
  dir.multiplyScalar(2).add(b.lastHit);
  if (dir.lengthSq() < 0.01) dir.set(frand(-1, 1), 0, frand(-1, 1));
  dir.normalize();
  // the crushed layer crumbles
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const id = cells[(j * nz + k) * nx + i];
    if (id >= 0) detachBlock(id, dir.x * 3 + frand(-2, 2), 0, dir.z * 3 + frand(-2, 2), true);
  }
  const sec = [];
  for (let c = (j + 1) * nx * nz; c < cells.length; c++) if (cells[c] >= 0) sec.push(cells[c]);
  if (sec.length >= 4) makeFalling(b, sec, dir, 0.32);
  else for (const id of sec) detachBlock(id, dir.x * 2, 0, dir.z * 2);
  if (sec.length > 20) collapseRumble(b, sec.length);
}
function makeFalling(b, ids, dir, tip) {
  for (const id of ids) removeStatic(id);
  spawnCompound(ids, dir, tip);
}

// ---------- fires and smoke on damaged buildings ----------
function updateBuildingFires(dt) {
  for (const b of BLD) {
    if (!b.touched || b.alive <= 0) continue;
    const dmg = 1 - b.volLeft / b.vol;
    if (dmg < 0.12) continue;
    b.fireT -= dt;
    if (b.fireT > 0) continue;
    b.fireT = rr(4, 9) / (0.5 + dmg);
    // set a random surviving outer block alight
    for (let t = 0; t < 6; t++) {
      const id = b.cells[Math.floor(Math.random() * b.cells.length)];
      if (id < 0) continue;
      const B = BLK_[id];
      addEmitter({ kind: 'fire', x: B.x + frand(-B.hx, B.hx), y: B.y, z: B.z + frand(-B.hz, B.hz), life: rr(14, 30), block: id, size: Math.max(B.hx, B.hz) });
      break;
    }
  }
}
