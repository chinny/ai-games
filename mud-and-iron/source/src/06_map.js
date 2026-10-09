// Mud & Iron — procedural sector: terrain, river and bridges, villages, roads, woods, no-man's-land,
// sector flags, plus the live nav grid that trenches, wire, craters and buildings write into.

const WATER_Y = 0.4;
const HS = 2;            // height-grid spacing (m)
const CS = 4;            // nav-cell size (m)
const TRENCH_D = 1.7;    // trench depth (m)
const F = { WATER: 1, BRIDGE: 2, ROAD: 4, WOODS: 8, BLOCK: 16, TRENCH: 32, WIRE: 64, RUIN: 128 };
const CLS = { foot: 0, wheel: 1, track: 2 };
const NBR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

const MAP = { W: 320, H: 320, ready: false };
const PAL = {
  grassA: [0.4, 0.42, 0.25], grassB: [0.5, 0.47, 0.29], dry: [0.55, 0.5, 0.35], green: [0.35, 0.42, 0.22],
  mud: [0.35, 0.28, 0.2], mudDark: [0.26, 0.21, 0.15], road: [0.56, 0.5, 0.38], crater: [0.2, 0.16, 0.11],
  trench: [0.2, 0.16, 0.11], bank: [0.3, 0.27, 0.2], wet: [0.24, 0.22, 0.17],
};
const PLACE_NAMES = ['Mametz', 'Thiepval', 'Pozières', 'Guillemont', 'Zonnebeke', 'Bécourt', 'Fricourt', 'Contalmaison', 'Combles', 'Ginchy',
  'Flers', 'Martinpuich', 'Courcelette', 'Bazentin', 'Longueval', 'Hooge', 'Gheluvelt', 'Wytschaete', 'Messines', 'Langemarck'];
const FEATURE_NAMES = ['Hill 60', 'Hill 145', 'Crucifix Corner', 'Dead Man\'s Ridge', 'Mash Valley', 'The Quadrilateral', 'Railway Copse',
  'Sausage Valley', 'Caterpillar Wood', 'Shrine Corner', 'Lone Tree', 'The Mound', 'Windmill Ridge', 'Chalk Pit', 'Sunken Lane', 'Hawthorn Ridge'];

let terrainMat = null, terrainMesh = null, waterMesh = null, outerMesh = null;
const mapGroup = new THREE.Group();
scene.add(mapGroup);

// ---------- sampling ----------
// Height on the rendered triangle (quads split on the b–c diagonal, matching the index buffer).
function terrainH(x, z) {
  const gx = clamp(x / HS, 0, MAP.nx - 1.001), gz = clamp(z / HS, 0, MAP.nz - 1.001);
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const nx = MAP.nx, h = MAP.h, a = h[j * nx + i], b = h[j * nx + i + 1], c = h[(j + 1) * nx + i], d = h[(j + 1) * nx + i + 1];
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}
function cellIdx(x, z) { return clamp(Math.floor(z / CS), 0, MAP.ch - 1) * MAP.cw + clamp(Math.floor(x / CS), 0, MAP.cw - 1); }
const cellX = (i) => (i % MAP.cw) * CS + CS / 2;
const cellZ = (i) => Math.floor(i / MAP.cw) * CS + CS / 2;
function groundH(x, z) {
  const i = cellIdx(x, z);
  const t = terrainH(x, z);
  if (MAP.flags[i] & F.BRIDGE) return Math.max(t, MAP.deck[i]);
  return Math.max(t, WATER_Y);
}
const inMap = (x, z, m = 0) => x >= m && z >= m && x <= MAP.W - m && z <= MAP.H - m;
function coverAt(x, z) {
  const i = cellIdx(x, z), f = MAP.flags[i];
  let c = 0;
  if (f & F.TRENCH) c = 0.75;
  else if (f & F.RUIN) c = 0.55;
  if (MAP.crater[i] && c < 0.45) c = MAP.crater[i] >= 2 ? 0.42 : 0.3;
  if ((f & F.WOODS) && c < 0.3) c = 0.3;
  return c;
}
const coverName = (c) => (c >= 0.7 ? 'Trench' : c >= 0.5 ? 'Ruins' : c >= 0.4 ? 'Shell holes' : c >= 0.3 ? 'Light cover' : 'Open ground');
function passableAt(cls, x, z) { return inMap(x, z) && MAP.cost[cls][cellIdx(x, z)] > 0; }

// Movement speed multiplier for a class standing in a cell.
function speedAt(cls, x, z, trenchK = 2) {
  const i = cellIdx(x, z), f = MAP.flags[i], c = MAP.crater[i], mud = MAP.mud[i] + WEATHER.wet * 0.5;
  let s = 1;
  if (cls === 0) {
    if (f & F.ROAD) s *= 1.1;
    if (f & F.WOODS) s *= 0.85;
    if (f & F.RUIN) s *= 0.8;
    if (f & F.TRENCH) s *= 0.85;
    if (f & F.WIRE) s *= 0.28;
    s *= 1 - c * 0.06;
    s *= 1 - mud * 0.12;
  } else if (cls === 1) {
    if (f & F.ROAD) s *= 1.25; else s *= 1 - mud * 0.45;
    if (f & F.WOODS) s *= 0.45;
    s *= 1 - c * 0.22;
  } else {
    if (f & F.ROAD) s *= 1.05; else s *= 1 - mud * 0.3;
    if (f & F.WOODS) s *= 0.7;
    if (f & F.TRENCH) s /= trenchK;
    if (f & F.WIRE) s *= 0.9;
    if (f & F.RUIN) s *= 0.7;
    s *= 1 - c * 0.08;
  }
  return Math.max(0.12, s);
}

function computeCost(i) {
  const f = MAP.flags[i], c = MAP.crater[i], mud = MAP.mud[i];
  let foot = 1, wheel = 1, track = 1;
  if ((f & F.BLOCK) || ((f & F.WATER) && !(f & F.BRIDGE))) { foot = wheel = track = 0; }
  else {
    if (f & F.ROAD) { foot = 0.85; wheel = 0.55; track = 0.85; }
    if (f & F.WOODS) { foot += 0.3; wheel += 2.5; track += 1.2; }
    if (c) { foot += 0.12 * c; wheel += 1.2 * c; track += 0.3 * c; }
    foot += 0.25 * mud; wheel += 1.5 * mud; track += 0.6 * mud;
    if (f & F.RUIN) { foot += 0.6; wheel = 0; track += 1.5; }
    if (f & F.TRENCH) { foot += 0.15; wheel = 0; track += 2.5; }
    if (f & F.WIRE) { foot += 5; wheel = 0; track += 0.3; }
  }
  MAP.cost[0][i] = foot; MAP.cost[1][i] = wheel; MAP.cost[2][i] = track;
}

// ---------- generation ----------
function genMap(L) {
  seedRand(L.seed);
  const W = L.W, H = L.H;
  Object.assign(MAP, { W, H, L, nx: W / HS + 1, nz: H / HS + 1, cw: W / CS, ch: H / CS, seed: L.seed });
  const nv = MAP.nx * MAP.nz, nc = MAP.cw * MAP.ch;
  MAP.h = new Float32Array(nv); MAP.h0 = new Float32Array(nv);
  MAP.col = new Float32Array(nv * 3);
  MAP.flags = new Uint8Array(nc); MAP.crater = new Uint8Array(nc); MAP.wire = new Uint8Array(nc);
  MAP.mud = new Float32Array(nc); MAP.deck = new Float32Array(nc); MAP.occ = new Int32Array(nc);
  MAP.cost = [new Float32Array(nc), new Float32Array(nc), new Float32Array(nc)];
  MAP.houses = []; MAP.trees = []; MAP.points = []; MAP.bridges = []; MAP.roads = []; MAP.roadV = null;
  MAP.trenchDirty = MAP.wireDirty = true; MAP.hDirty = [1e9, -1];
  MAP.band = L.band ?? 0.16;
  const mir = (x, z) => [W - x, H - z];
  const nameBag = PLACE_NAMES.slice(), featBag = FEATURE_NAMES.slice();
  const takeName = (bag) => bag.splice(Math.floor(rand() * bag.length), 1)[0] || 'Sector';

  // heights: gentle symmetric rolling ground
  const f = (x, z) => 3.4 + (fbm(x / 120, z / 120, 4) - 0.5) * 10 + (fbm(x / 26 + 50, z / 26, 2) - 0.5) * 1.3;
  for (let j = 0; j < MAP.nz; j++) for (let i = 0; i < MAP.nx; i++) {
    const x = i * HS, z = j * HS;
    MAP.h[j * MAP.nx + i] = Math.max(1.5, 0.5 * (f(x, z) + f(W - x, H - z)));
  }
  // river: point-symmetric meander through the centre
  MAP.river = null;
  if (L.river) {
    const A = rr(8, 20), k = TAU / rr(W * 0.7, W * 1.2);
    const zr = (x) => H / 2 + A * Math.sin(k * (x - W / 2));
    MAP.river = { zr, A, k };
    for (let j = 0; j < MAP.nz; j++) for (let i = 0; i < MAP.nx; i++) {
      const x = i * HS, z = j * HS, d = Math.abs(z - zr(x));
      if (d < 15) MAP.h[j * MAP.nx + i] = lerp(-1.3, MAP.h[j * MAP.nx + i], smooth(3, 15, d));
    }
  }
  // bases
  MAP.bases = (L.bases || [{ x: W / 2, z: H - 34 }, { x: W / 2, z: 34 }]).map((b) => b && { x: b.x, z: b.z });
  for (const b of MAP.bases) if (b) flattenAround(b.x, b.z, 26, 40);

  // villages
  const villages = [];
  const riverOK = (x, z, m) => !MAP.river || Math.abs(z - MAP.river.zr(x)) > m;
  const vspec = L.villages === undefined ? 'auto' : L.villages;
  if (vspec === 'auto') {
    const nPairs = W <= 240 ? 1 : W >= 400 ? 2 : 1 + (rand() < 0.5 ? 1 : 0);
    for (let p = 0; p < nPairs; p++) {
      for (let tries = 0; tries < 40; tries++) {
        const x = W * (p === 0 ? rr(0.18, 0.34) : rr(0.62, 0.8)), z = H * rr(0.56, 0.68);
        if (!riverOK(x, z, 34)) continue;
        if (villages.some((v) => dist2(v.x, v.z, x, z) < 70 * 70)) continue;
        const [mx, mz] = mir(x, z);
        villages.push({ x, z, name: takeName(nameBag), church: true }, { x: mx, z: mz, name: takeName(nameBag), church: true, mirrorOf: villages.length });
        break;
      }
    }
    if (!MAP.river && rand() < 0.75) villages.push({ x: W / 2, z: H / 2, name: takeName(nameBag), center: true });
  } else if (Array.isArray(vspec)) {
    for (const v of vspec) villages.push({ ...v, name: v.name || takeName(nameBag) });
  }
  MAP.villages = villages;
  for (const v of villages) flattenAround(v.x, v.z, 24, 34, 0.7);

  // houses: each village is generated once and its pair mirrored, so both sides match
  const specs = [];
  for (let vi = 0; vi < villages.length; vi++) {
    const v = villages[vi];
    if (v.mirrorOf !== undefined) {
      for (const s of specs.filter((s) => s.v === v.mirrorOf)) { const [x, z] = mir(s.x, s.z); specs.push({ ...s, x, z, rot: s.rot + Math.PI, v: vi }); }
      continue;
    }
    const local = [];
    const tryAdd = (s) => {
      const hw = (s.rot % Math.PI === 0 ? s.w : s.d) / 2 + 1.5, hd = (s.rot % Math.PI === 0 ? s.d : s.w) / 2 + 1.5;
      for (const o of local) {
        const ow = (o.rot % Math.PI === 0 ? o.w : o.d) / 2, od = (o.rot % Math.PI === 0 ? o.d : o.w) / 2;
        if (Math.abs(o.x - s.x) < hw + ow && Math.abs(o.z - s.z) < hd + od) return false;
      }
      if (Math.hypot(s.x - v.x, s.z - v.z) < 11) return false;
      if (!riverOK(s.x, s.z, 16) || !inMap(s.x, s.z, 12)) return false;
      local.push(s); return true;
    };
    const nb = v.center ? 4 : ri(6, 8);
    for (let k = 0, tries = 0; k < nb && tries < 80; tries++) {
      const side = v.center ? 1 : rand() < 0.5 ? -1 : 1;
      const along = rr(-26, 26), across = side * rr(8, 11);
      const street = rand() < 0.75;
      const s = street
        ? { x: v.x + across, z: v.z + along, w: rr(6, 9), d: rr(5, 7), rot: (rand() < 0.5 ? 0 : 1) * Math.PI / 2 }
        : { x: v.x + along, z: v.z + across * 1.2, w: rr(6, 9), d: rr(5, 7), rot: (rand() < 0.5 ? 0 : 1) * Math.PI / 2 };
      s.kind = 'house'; s.style = ri(0, 3);
      if (tryAdd(s)) k++;
    }
    if (v.church) {
      for (let t = 0; t < 12; t++) {
        const s = { x: v.x + (rand() < 0.5 ? -1 : 1) * rr(13, 16), z: v.z + rr(-8, 8), w: 14, d: 8, rot: 0, kind: 'church', style: 0 };
        if (tryAdd(s)) break;
      }
    }
    for (const s of local) { s.v = vi; specs.push(s); }
    if (v.center) for (const s of local) { const [x, z] = mir(s.x, s.z); specs.push({ ...s, x, z, rot: s.rot + Math.PI }); }
  }
  for (const s of specs) {
    const band = 1 - Math.abs(s.z - H / 2) / (H / 2);
    const ruined = rand() < (L.ruinBias ?? 0.15) + band * 0.55;
    addHouse(s, ruined);
  }

  // bridges
  if (MAP.river) {
    const xs = L.bridges || (rand() < 0.5 ? [W / 2, W * 0.17, W * 0.83] : [W * 0.3, W * 0.7]);
    for (const bx of xs) addBridge(bx);
  }

  // roads (team-0 half generated, then mirrored)
  const segs = [];
  const b0 = MAP.bases[0] || { x: W / 2, z: H - 20 };
  const homeVill = villages.filter((v) => v.z > H / 2 + 1);
  if (MAP.river) {
    const near = (x) => MAP.bridges.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
    for (const bdg of MAP.bridges) segs.push([b0.x, b0.z - 16, bdg.x, bdg.z1 + 2]);
    for (const v of homeVill) { const bd = near(v.x); segs.push([v.x, v.z, bd.x, bd.z1 + 2], [v.x, v.z, b0.x, b0.z - 16]); }
  } else {
    segs.push([b0.x, b0.z - 16, W / 2, H / 2]);
    for (const v of homeVill) segs.push([v.x, v.z, b0.x, b0.z - 16], [v.x, v.z, W / 2, H / 2]);
  }
  for (const v of villages) if (v.mirrorOf === undefined && !v.center) segs.push([v.x, v.z - 30, v.x, v.z + 30, 0]);
  for (const v of villages) if (v.center) segs.push([v.x, v.z, v.x, v.z + 30, 0], [v.x - 28, v.z, v.x, v.z, 0]);
  if (L.extraRoads) segs.push(...L.extraRoads);
  for (const s of segs) {
    const bend = s[4] === 0 ? 0 : rr(-0.18, 0.18);
    paintRoad(s[0], s[1], s[2], s[3], bend);
    const [ax, az] = mir(s[0], s[1]), [bx, bz] = mir(s[2], s[3]);
    paintRoad(ax, az, bx, bz, bend);
  }
  for (const bdg of MAP.bridges) paintRoad(bdg.x, bdg.z0 - 3, bdg.x, bdg.z1 + 3, 0);

  // sector flags
  const pts = [];
  if (Array.isArray(L.points)) {
    for (const p of L.points) pts.push({ ...p, name: p.name || takeName(featBag) });
  } else {
    for (const v of villages) pts.push({ x: v.x, z: v.z, value: v.center ? 1.0 : 0.8, name: v.name, village: true });
    if (MAP.river && MAP.bridges.some((b) => Math.abs(b.x - W / 2) < 1)) pts.push({ x: W / 2, z: H / 2, value: 1.1, name: 'The Bridge' });
    else if (!villages.some((v) => v.center)) pts.push({ x: W / 2, z: H / 2, value: 1.1, name: takeName(featBag) });
    const want = L.pointCount || (W <= 240 ? 5 : W >= 400 ? 9 : 7);
    for (let tries = 0; pts.length < want - 1 && tries < 400; tries++) {
      const x = rr(26, W - 26), z = rr(H * 0.53, H - 70);
      const [mx, mz] = mir(x, z);
      const all = pts.concat([{ x: mx, z: mz }]);
      if (all.some((p) => dist2(p.x, p.z, x, z) < 44 * 44)) continue;
      if (Math.hypot(x - mx, z - mz) < 44) continue;
      if (MAP.bases.some((b) => b && dist2(b.x, b.z, x, z) < 60 * 60)) continue;
      if (!riverOK(x, z, 16) || isBlockedNear(x, z, 8)) continue;
      const nm = takeName(featBag);
      pts.push({ x, z, value: 0.7, name: nm }, { x: mx, z: mz, value: 0.7, name: takeName(featBag) });
    }
  }
  for (const p of pts) addPoint(p);

  // woods and poplar-lined roads
  const nearThings = (x, z, m) => MAP.points.some((p) => dist2(p.x, p.z, x, z) < m * m) || MAP.bases.some((b) => b && dist2(b.x, b.z, x, z) < (m + 26) ** 2)
    || villages.some((v) => dist2(v.x, v.z, x, z) < (m + 16) ** 2);
  const treeAt = [];
  const nWood = Math.round((W <= 240 ? 3 : W >= 400 ? 6 : 4) * (L.woods ?? 1));
  for (let w = 0, tries = 0; w < nWood && tries < 200; tries++) {
    const x = rr(20, W - 20), z = rr(H * 0.5, H - 20), r = rr(10, 22);
    if (nearThings(x, z, r) || !riverOK(x, z, r + 8)) continue;
    w++;
    const n = Math.round(r * r * 0.07);
    for (let t = 0; t < n; t++) {
      const a = rand() * TAU, d = Math.sqrt(rand()) * r;
      treeAt.push([x + Math.cos(a) * d, z + Math.sin(a) * d, rand() < 0.25 ? 1 : 0]);
    }
  }
  for (const s of segs) {
    if (rand() < 0.45) continue;
    const len = Math.hypot(s[2] - s[0], s[3] - s[1]), n = Math.floor(len / 9), side = rand() < 0.5 ? -1 : 1;
    const px = -(s[3] - s[1]) / len, pz = (s[2] - s[0]) / len;
    for (let k = 1; k < n; k++) {
      if (rand() < 0.3) continue;
      const t = k / n;
      treeAt.push([lerp(s[0], s[2], t) + px * 4.5 * side, lerp(s[1], s[3], t) + pz * 4.5 * side, 1]);
    }
  }
  for (let t = 0; t < (W * H) / 1600 * (L.woods ?? 1); t++) treeAt.push([rr(10, W - 10), rr(H / 2, H - 10), rand() < 0.3 ? 1 : 0]);
  const tlist = [];
  for (const [x, z, pop] of treeAt) {
    for (const [tx, tz] of [[x, z], mir(x, z)]) {
      if (!inMap(tx, tz, 3)) continue;
      const i = cellIdx(tx, tz), fl = MAP.flags[i];
      if (fl & (F.WATER | F.BLOCK | F.ROAD | F.BRIDGE)) continue;
      if (MAP.points.some((p) => dist2(p.x, p.z, tx, tz) < 100)) continue;
      if (MAP.bases.some((b) => b && dist2(b.x, b.z, tx, tz) < 28 * 28)) continue;
      const band = Math.abs(tz - H / 2) < H * MAP.band * 1.25;
      tlist.push({ x: tx, z: tz, type: band && rand() < 0.8 ? 2 : pop ? 1 : 0, s: rr(0.8, 1.25), r: rand() * TAU });
      MAP.flags[i] |= F.WOODS;
    }
  }
  MAP.trees = tlist;

  // ground colour and no-man's-land mud
  const bw = H * MAP.band;
  for (let j = 0; j < MAP.nz; j++) for (let i = 0; i < MAP.nx; i++) {
    const v = j * MAP.nx + i, x = i * HS, z = j * HS;
    const n1 = fbm(x / 30, z / 30, 3), n2 = vnoise(x / 7 + 9, z / 7);
    let c = mix3(PAL.grassA, PAL.grassB, n1);
    c = mix3(c, PAL.dry, smooth(0.6, 0.8, n2) * 0.5);
    c = mix3(c, PAL.green, smooth(0.55, 0.3, n1) * 0.4);
    const mk = smooth(bw, bw * 0.45, Math.abs(z - H / 2)) * (L.mudless ? 0 : 1);
    c = mix3(c, mix3(PAL.mud, PAL.mudDark, n2), mk * 0.9);
    if (MAP.h[v] < WATER_Y + 1.2) c = mix3(c, PAL.bank, smooth(WATER_Y + 1.2, WATER_Y, MAP.h[v]));
    if (MAP.roadV && MAP.roadV[v]) c = mix3(c, PAL.road, MAP.roadV[v]);
    const jit = 0.94 + hash2(i * 3, j * 7) * 0.1;
    MAP.col[v * 3] = c[0] * jit; MAP.col[v * 3 + 1] = c[1] * jit; MAP.col[v * 3 + 2] = c[2] * jit;
  }
  for (let c = 0; c < nc; c++) MAP.mud[c] = smooth(bw, bw * 0.45, Math.abs(cellZ(c) - H / 2)) * (L.mudless ? 0 : 1);
  MAP.h0.set(MAP.h);
  for (let c = 0; c < nc; c++) {
    if (MAP.flags[c] & F.BRIDGE) continue;
    if (terrainH(cellX(c), cellZ(c)) < WATER_Y + 0.2) MAP.flags[c] |= F.WATER;
  }
  buildTerrainMesh();
  buildTrees();

  // shell-torn no-man's-land
  const nCr = Math.round(W * bw * 2 / 110 * (L.craters ?? 1));
  for (let k = 0; k < nCr; k++) {
    const x = rr(4, W - 4), z = H / 2 + (rand() + rand() + rand() - 1.5) * bw * 0.95, r = rr(1.6, 4);
    for (const [cx, cz] of [[x, z], mir(x, z)]) addCrater(cx, cz, r, true);
  }
  for (let k = 0; k < nCr * 0.08; k++) { const x = rr(4, W - 4), z = rr(H / 2, H - 4), r = rr(1.5, 3); for (const [cx, cz] of [[x, z], mir(x, z)]) addCrater(cx, cz, r, true); }
  if (L.oldTrenches) {
    for (let k = 0; k < (W >= 320 ? 2 : 1); k++) {
      const x0 = rr(20, W - 80), z0 = H / 2 + bw * rr(0.35, 0.8), len = rr(28, 56);
      trenchLine(x0, z0, x0 + len, z0 + rr(-8, 8), 1, true);
      trenchLine(W - x0, H - z0, W - x0 - len, H - z0, 1, true);
    }
  }
  if (L.nmlWire) {
    for (let k = 0; k < L.nmlWire; k++) {
      const x0 = rr(10, W - 50), z0 = H / 2 + bw * rr(-0.2, 0.7), len = rr(14, 34);
      wireLine(x0, z0, x0 + len, z0 + rr(-6, 6), true);
      wireLine(W - x0, H - z0, W - x0 - len, H - z0, true);
    }
  }
  for (const t of L.trenches || []) {
    trenchLine(t.x0, t.z0, t.x1, t.z1, t.zig ?? 1, true);
    if (t.wire) wireLine(t.x0, t.z0 + t.wire, t.x1, t.z1 + t.wire, true);
  }
  for (const w of L.wires || []) wireLine(w.x0, w.z0, w.x1, w.z1, true);
  for (const p of MAP.points) clearCellsAround(p.x, p.z, 6);
  for (let c = 0; c < nc; c++) computeCost(c);
  MAP.ready = true;
  flushMap(true);
}

function flattenAround(x, z, r0, r1, k = 1) {
  let s = 0, n = 0;
  for (let j = 0; j < MAP.nz; j++) for (let i = 0; i < MAP.nx; i++) { const d = Math.hypot(i * HS - x, j * HS - z); if (d < r0) { s += MAP.h[j * MAP.nx + i]; n++; } }
  const avg = n ? Math.max(1.6, s / n) : 3;
  for (let j = 0; j < MAP.nz; j++) for (let i = 0; i < MAP.nx; i++) {
    const d = Math.hypot(i * HS - x, j * HS - z);
    if (d < r1) { const v = j * MAP.nx + i; MAP.h[v] = lerp(MAP.h[v], avg, smooth(r1, r0, d) * k); }
  }
}
function isBlockedNear(x, z, r) {
  for (let dz = -r; dz <= r; dz += CS) for (let dx = -r; dx <= r; dx += CS) {
    if (!inMap(x + dx, z + dz)) return true;
    if (MAP.flags[cellIdx(x + dx, z + dz)] & (F.BLOCK | F.WATER)) return true;
  }
  return false;
}
function clearCellsAround(x, z, r) {
  for (const t of MAP.trees) if (t.alive !== false && dist2(t.x, t.z, x, z) < r * r) shatterTree(t, true);
}

function paintRoad(ax, az, bx, bz, bend) {
  if (!MAP.roadV) MAP.roadV = new Float32Array(MAP.nx * MAP.nz);
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 1) return;
  const px = -(bz - az) / len, pz = (bx - ax) / len;
  const cx = (ax + bx) / 2 + px * bend * len, cz = (az + bz) / 2 + pz * bend * len;
  MAP.roads.push([ax, az, cx, cz, bx, bz]);
  const n = Math.ceil(len / 1.5);
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    const x = u * u * ax + 2 * u * t * cx + t * t * bx, z = u * u * az + 2 * u * t * cz + t * t * bz;
    const gi = Math.round(x / HS), gj = Math.round(z / HS);
    for (let j = gj - 2; j <= gj + 2; j++) for (let i = gi - 2; i <= gi + 2; i++) {
      if (i < 0 || j < 0 || i >= MAP.nx || j >= MAP.nz) continue;
      const d = Math.hypot(i * HS - x, j * HS - z);
      const v = j * MAP.nx + i;
      MAP.roadV[v] = Math.max(MAP.roadV[v], smooth(3.2, 1.6, d));
    }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx * 2.2, zz = z + dz * 2.2;
      if (!inMap(xx, zz)) continue;
      const c = cellIdx(xx, zz);
      if (!(MAP.flags[c] & F.BLOCK)) MAP.flags[c] |= F.ROAD;
    }
  }
}

function addBridge(bx) {
  const zr = MAP.river.zr(bx);
  const z0 = zr - 13, z1 = zr + 13;
  const deckY = Math.max(terrainH(bx, z0 - 2), terrainH(bx, z1 + 2), WATER_Y + 1.2) + 0.15;
  const b = { x: bx, z: zr, z0, z1, y: deckY };
  MAP.bridges.push(b);
  for (let c = 0; c < MAP.cw * MAP.ch; c++) {
    const x = cellX(c), z = cellZ(c);
    if (Math.abs(x - bx) <= 2.6 && z >= z0 - 1 && z <= z1 + 1) { MAP.flags[c] |= F.BRIDGE; MAP.deck[c] = deckY; }
  }
}

function addHouse(s, ruined) {
  const h = { ...s, hp: s.kind === 'church' ? 900 : 500, ruined: false, cells: [], id: MAP.houses.length };
  h.y = terrainH(s.x, s.z);
  const rw = Math.abs(Math.cos(s.rot)) > 0.5 ? s.w : s.d, rd = Math.abs(Math.cos(s.rot)) > 0.5 ? s.d : s.w;
  h.hw = rw / 2; h.hd = rd / 2;
  for (let c = 0; c < MAP.cw * MAP.ch; c++) {
    const x = cellX(c), z = cellZ(c);
    if (Math.abs(x - s.x) < rw / 2 + 1 && Math.abs(z - s.z) < rd / 2 + 1) { h.cells.push(c); MAP.flags[c] |= F.BLOCK; MAP.occ[c] = -(h.id + 1); }
  }
  MAP.houses.push(h);
  h.mesh = new THREE.Mesh(houseGeo(h), MAT.vc);
  h.mesh.position.set(s.x, h.y - 0.3, s.z); h.mesh.rotation.y = s.rot;
  h.mesh.castShadow = h.mesh.receiveShadow = true;
  mapGroup.add(h.mesh);
  if (ruined) ruinHouse(h, true);
}
function ruinHouse(h, quiet) {
  if (h.ruined) return;
  h.ruined = true; h.hp = 0;
  mapGroup.remove(h.mesh); h.mesh.geometry.dispose();
  h.mesh = new THREE.Mesh(ruinGeo(h), MAT.vc);
  h.mesh.position.set(h.x, h.y - 0.3, h.z); h.mesh.rotation.y = h.rot;
  h.mesh.castShadow = h.mesh.receiveShadow = true;
  mapGroup.add(h.mesh);
  for (const c of h.cells) { MAP.flags[c] = (MAP.flags[c] & ~F.BLOCK) | F.RUIN; MAP.occ[c] = 0; if (MAP.ready) computeCost(c); }
  if (!quiet) {
    for (let k = 0; k < 10; k++) smokePuff(h.x + frand(-h.hw, h.hw), h.y + frand(1, 4), h.z + frand(-h.hd, h.hd), frand(3, 6), 0.45, 7);
    sfx('crunch', h.x, h.z, 1);
  }
}

function addPoint(p) {
  const pt = { id: MAP.points.length, x: p.x, z: p.z, owner: p.owner ?? -1, prog: p.owner >= 0 ? 1 : 0, capT: p.owner ?? -1, value: p.value ?? 0.5,
    name: p.name, row: p.row ?? -1, col: p.col ?? -1, village: !!p.village, contested: false, r: 9 };
  pt.y = terrainH(pt.x, pt.z);
  pt.mesh = flagMesh();
  pt.mesh.position.set(pt.x, pt.y, pt.z);
  mapGroup.add(pt.mesh);
  MAP.points.push(pt);
  setPointLook(pt);
}

// ---------- terrain mesh ----------
function buildTerrainMesh() {
  const { nx, nz } = MAP;
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const v = j * nx + i; pos[v * 3] = i * HS; pos[v * 3 + 1] = MAP.h[v]; pos[v * 3 + 2] = j * HS; }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = c; idx[k++] = d; idx[k++] = b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(MAP.col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  if (!terrainMat) terrainMat = fogify(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }));
  terrainMesh = new THREE.Mesh(geo, terrainMat);
  terrainMesh.receiveShadow = true;
  mapGroup.add(terrainMesh);
  MAP.geo = geo;
  // water
  if (!MAP.river) waterMesh = null;
  else {
    const wm = fogify(new THREE.MeshStandardMaterial({ color: 0x3c4a44, roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.88 }));
    waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(MAP.W, MAP.H), wm);
    waterMesh.rotation.x = -Math.PI / 2; waterMesh.position.set(MAP.W / 2, WATER_Y, MAP.H / 2);
    mapGroup.add(waterMesh);
    for (const b of MAP.bridges) { const m = new THREE.Mesh(bridgeGeo(b.z1 - b.z0 + 4), MAT.vc); m.position.set(b.x, b.y, b.z); m.castShadow = m.receiveShadow = true; mapGroup.add(m); }
  }
  // puddles fill shell holes that dip below the water line, even without a river
  if (!waterMesh) {
    const wm = fogify(new THREE.MeshStandardMaterial({ color: 0x4a4f45, roughness: 0.2, metalness: 0.15 }));
    waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(MAP.W, MAP.H), wm);
    waterMesh.rotation.x = -Math.PI / 2; waterMesh.position.set(MAP.W / 2, WATER_Y, MAP.H / 2);
    mapGroup.add(waterMesh);
  }
  // dark ground beyond the sector edge
  const om = new THREE.MeshStandardMaterial({ color: 0x2e2b22, roughness: 1, flatShading: true });
  outerMesh = new THREE.Mesh(new THREE.PlaneGeometry(MAP.W + 1600, MAP.H + 1600, 1, 1), om);
  outerMesh.rotation.x = -Math.PI / 2; outerMesh.position.set(MAP.W / 2, 1.2, MAP.H / 2);
  outerMesh.renderOrder = -1;
  mapGroup.add(outerMesh);
  // sandbags and wire decor
  MAP.bagIM = new THREE.InstancedMesh(sandbagGeo(), MAT.vc, 9000); MAP.bagIM.count = 0; MAP.bagIM.castShadow = true; MAP.bagIM.receiveShadow = true;
  MAP.wireIM = new THREE.InstancedMesh(wireGeo(), MAT.vc, 3000); MAP.wireIM.count = 0;
  mapGroup.add(MAP.bagIM, MAP.wireIM);
}

function buildTrees() {
  const n = MAP.trees.length;
  MAP.treeIM = [treeGeo(0), treeGeo(1), stumpGeo()].map((g) => { const m = new THREE.InstancedMesh(g, MAT.vc, Math.max(1, n)); m.count = n; m.castShadow = true; m.receiveShadow = true; mapGroup.add(m); return m; });
  for (let k = 0; k < n; k++) {
    const t = MAP.trees[k];
    t.alive = t.type !== 2; t.k = k;
    for (let m = 0; m < 3; m++) MAP.treeIM[m].setMatrixAt(k, ZERO_M);
    setTreeMatrix(t);
  }
  for (const m of MAP.treeIM) m.instanceMatrix.needsUpdate = true;
}
function setTreeMatrix(t) {
  const y = terrainH(t.x, t.z) - 0.2;
  _q1.setFromAxisAngle(UP, t.r);
  _s1.set(t.s, t.s * (t.type === 2 ? 1 : 1), t.s);
  _m4.compose(_v1.set(t.x, y, t.z), _q1, _s1);
  MAP.treeIM[t.type].setMatrixAt(t.k, _m4);
}
function shatterTree(t, quiet) {
  if (t.type === 2) return;
  MAP.treeIM[t.type].setMatrixAt(t.k, ZERO_M);
  MAP.treeIM[t.type].instanceMatrix.needsUpdate = true;
  t.type = 2; t.alive = false;
  setTreeMatrix(t);
  MAP.treeIM[2].instanceMatrix.needsUpdate = true;
  if (!quiet) { const y = terrainH(t.x, t.z); for (let k = 0; k < 6; k++) emit(smokePS, t.x, y + frand(2, 6), t.z, frand(-4, 4), frand(2, 7), frand(-4, 4), 0.5, 0.2, 1.5, 0.3, 0.24, 0.16, 1, 0.3, 12); }
}

// ---------- live modifications ----------
function markDirty(j0, j1) { MAP.hDirty[0] = Math.min(MAP.hDirty[0], Math.max(0, j0)); MAP.hDirty[1] = Math.max(MAP.hDirty[1], Math.min(MAP.nz - 1, j1)); }

function addCrater(x, z, r, quiet) {
  if (!inMap(x, z)) return;
  const depth = Math.min(1.6, r * 0.36);
  const R = r * 1.35, gi0 = Math.max(0, Math.floor((x - R) / HS)), gi1 = Math.min(MAP.nx - 1, Math.ceil((x + R) / HS));
  const gj0 = Math.max(0, Math.floor((z - R) / HS)), gj1 = Math.min(MAP.nz - 1, Math.ceil((z + R) / HS));
  for (let j = gj0; j <= gj1; j++) for (let i = gi0; i <= gi1; i++) {
    const v = j * MAP.nx + i, d = Math.hypot(i * HS - x, j * HS - z) / r;
    if (d >= 1.35) continue;
    let dh = d < 1 ? -depth * (1 - d * d) : depth * 0.14 * (1 - (d - 1) / 0.35);
    MAP.h[v] = Math.max(-1.2, MAP.h[v] + dh); MAP.h0[v] = Math.max(-1.2, MAP.h0[v] + dh * 0.6);
    const k = d < 1 ? (1 - d) * 0.85 : 0.15;
    for (let c = 0; c < 3; c++) MAP.col[v * 3 + c] = lerp(MAP.col[v * 3 + c], PAL.crater[c] * (0.9 + hash2(i, j) * 0.2), k);
  }
  markDirty(gj0, gj1);
  const cr = r + 1.5;
  for (let cz = Math.floor((z - cr) / CS); cz <= Math.floor((z + cr) / CS); cz++) for (let cx = Math.floor((x - cr) / CS); cx <= Math.floor((x + cr) / CS); cx++) {
    if (cx < 0 || cz < 0 || cx >= MAP.cw || cz >= MAP.ch) continue;
    const c = cz * MAP.cw + cx;
    if (Math.hypot(cellX(c) - x, cellZ(c) - z) > r + 1) continue;
    if (MAP.crater[c] < 3) MAP.crater[c]++;
    MAP.mud[c] = Math.min(1, MAP.mud[c] + 0.08);
    if (MAP.wire[c] && (quiet ? rand() : Math.random()) < 0.5) setWire(c, false);
    if (MAP.ready) computeCost(c);
  }
  for (const t of MAP.trees) if (t.alive && dist2(t.x, t.z, x, z) < (r + 2) * (r + 2)) shatterTree(t, quiet);
}

function dig(c, on = true) {
  const f = MAP.flags[c];
  if (on && (f & (F.WATER | F.BLOCK | F.BRIDGE | F.TRENCH))) return false;
  if (on) MAP.flags[c] |= F.TRENCH; else MAP.flags[c] &= ~F.TRENCH;
  const ci = c % MAP.cw, cj = Math.floor(c / MAP.cw);
  const lower = (vi, vj) => {
    if (vi < 0 || vj < 0 || vi >= MAP.nx || vj >= MAP.nz) return;
    const v = vj * MAP.nx + vi;
    MAP.h[v] = Math.min(MAP.h[v], MAP.h0[v] - TRENCH_D);
    for (let k = 0; k < 3; k++) MAP.col[v * 3 + k] = PAL.trench[k] * (0.9 + hash2(vi, vj) * 0.2);
  };
  lower(ci * 2 + 1, cj * 2 + 1);
  for (const [dx, dz] of NBR8) {
    const nI = ci + dx, nJ = cj + dz;
    if (nI < 0 || nJ < 0 || nI >= MAP.cw || nJ >= MAP.ch) continue;
    if (!(MAP.flags[nJ * MAP.cw + nI] & F.TRENCH)) continue;
    if (dx && dz) {
      // only join diagonals that are not already joined through an orthogonal neighbour
      if ((MAP.flags[cj * MAP.cw + nI] & F.TRENCH) || (MAP.flags[nJ * MAP.cw + ci] & F.TRENCH)) continue;
      lower(ci * 2 + 1 + dx, cj * 2 + 1 + dz);
    } else lower(ci * 2 + 1 + dx, cj * 2 + 1 + dz);
  }
  // darken the rim
  for (let vj = cj * 2; vj <= cj * 2 + 2; vj++) for (let vi = ci * 2; vi <= ci * 2 + 2; vi++) {
    if (vi < 0 || vj < 0 || vi >= MAP.nx || vj >= MAP.nz) continue;
    const v = vj * MAP.nx + vi;
    if (MAP.h[v] > MAP.h0[v] - 0.5) for (let k = 0; k < 3; k++) MAP.col[v * 3 + k] = lerp(MAP.col[v * 3 + k], PAL.mudDark[k], 0.5);
  }
  markDirty(cj * 2 - 1, cj * 2 + 3);
  for (const t of MAP.trees) if (t.alive && cellIdx(t.x, t.z) === c) shatterTree(t, true);
  MAP.trenchDirty = true;
  if (MAP.ready) computeCost(c);
  return true;
}
function setWire(c, on) {
  if (on) { if (MAP.flags[c] & (F.WATER | F.BLOCK | F.BRIDGE)) return false; MAP.flags[c] |= F.WIRE; MAP.wire[c] = 1; }
  else { MAP.flags[c] &= ~F.WIRE; MAP.wire[c] = 0; }
  MAP.wireDirty = true;
  if (MAP.ready) computeCost(c);
  return true;
}

// Cells along a line, as a crenellated trench (zig = bay depth in cells) or straight (zig 0).
function lineCells(x0, z0, x1, z1, zig) {
  const cells = [], seen = new Set();
  const add = (cx, cz) => { if (cx < 0 || cz < 0 || cx >= MAP.cw || cz >= MAP.ch) return; const c = cz * MAP.cw + cx; if (!seen.has(c)) { seen.add(c); cells.push(c); } };
  const ax = Math.floor(x0 / CS), az = Math.floor(z0 / CS), bx = Math.floor(x1 / CS), bz = Math.floor(z1 / CS);
  const dx = bx - ax, dz = bz - az, n = Math.max(Math.abs(dx), Math.abs(dz));
  if (n === 0) { add(ax, az); return cells; }
  const horiz = Math.abs(dx) >= Math.abs(dz);
  let prevOff = 0, prev = null;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    let cx = Math.round(ax + dx * t), cz = Math.round(az + dz * t);
    const off = zig ? (Math.floor(k / 3) % 2) * zig : 0;
    if (horiz) cz += off; else cx += off;
    if (prev && off !== prevOff) { if (horiz) add(cx, prev[1]); else add(prev[0], cz); }
    if (prev && Math.abs(prev[0] - cx) + Math.abs(prev[1] - cz) === 2 && !zig) add(cx, prev[1]);
    add(cx, cz);
    prev = [cx, cz]; prevOff = off;
  }
  return cells;
}
function trenchLine(x0, z0, x1, z1, zig, instant) {
  const cells = lineCells(x0, z0, x1, z1, zig);
  if (instant) for (const c of cells) dig(c, true);
  return cells;
}
function wireLine(x0, z0, x1, z1, instant) {
  const cells = lineCells(x0, z0, x1, z1, 0);
  if (instant) for (const c of cells) if (!(MAP.flags[c] & F.TRENCH)) setWire(c, true);
  return cells;
}

function rebuildTrenchDecor() {
  const im = MAP.bagIM; let n = 0;
  const cw = MAP.cw, ch = MAP.ch;
  for (let c = 0; c < cw * ch; c++) {
    if (!(MAP.flags[c] & F.TRENCH)) continue;
    const ci = c % cw, cj = Math.floor(c / cw), x = cellX(c), z = cellZ(c);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + dx, nj = cj + dz;
      if (ni >= 0 && nj >= 0 && ni < cw && nj < ch && (MAP.flags[nj * cw + ni] & F.TRENCH)) continue;
      for (let s = -1; s <= 1; s += 2) {
        if (n >= im.instanceMatrix.count) break;
        const ex = x + dx * 2.15 + (dz ? s : 0) * 0.95, ez = z + dz * 2.15 + (dx ? s : 0) * 0.95;
        const y = Math.max(MAP.h0[Math.round(ez / HS) * MAP.nx + Math.round(ex / HS)], terrainH(ex, ez)) - 0.05;
        _q1.setFromAxisAngle(UP, dx ? Math.PI / 2 : 0);
        _m4.compose(_v1.set(ex, y, ez), _q1, _s1.set(1, 1, 1));
        im.setMatrixAt(n++, _m4);
      }
    }
  }
  im.count = n; im.instanceMatrix.needsUpdate = true;
}
function rebuildWireDecor() {
  const im = MAP.wireIM; let n = 0;
  const cw = MAP.cw;
  for (let c = 0; c < cw * MAP.ch; c++) {
    if (!(MAP.flags[c] & F.WIRE)) continue;
    if (n >= im.instanceMatrix.count) break;
    const x = cellX(c), z = cellZ(c);
    const ew = ((MAP.flags[c + 1] || 0) & F.WIRE) || ((MAP.flags[c - 1] || 0) & F.WIRE);
    const ns = ((MAP.flags[c + cw] || 0) & F.WIRE) || ((MAP.flags[c - cw] || 0) & F.WIRE);
    const rot = (ns && !ew ? Math.PI / 2 : 0) + (hash2(c, 7) - 0.5) * 0.3;
    _q1.setFromAxisAngle(UP, rot);
    _m4.compose(_v1.set(x, terrainH(x, z) - 0.1, z), _q1, _s1.set(1, 0.9 + hash2(c, 3) * 0.3, 1));
    im.setMatrixAt(n++, _m4);
  }
  im.count = n; im.instanceMatrix.needsUpdate = true;
}

function flushMap(all) {
  const g = MAP.geo;
  if (!g) return;
  let [j0, j1] = MAP.hDirty;
  if (all) { j0 = 0; j1 = MAP.nz - 1; }
  if (j1 >= j0) {
    const pos = g.attributes.position.array, nx = MAP.nx;
    for (let v = j0 * nx; v < (j1 + 1) * nx; v++) pos[v * 3 + 1] = MAP.h[v];
    const pa = g.attributes.position, ca = g.attributes.color;
    pa.updateRange.offset = j0 * nx * 3; pa.updateRange.count = (j1 - j0 + 1) * nx * 3; pa.needsUpdate = true;
    ca.updateRange.offset = j0 * nx * 3; ca.updateRange.count = (j1 - j0 + 1) * nx * 3; ca.needsUpdate = true;
    MAP.hDirty = [1e9, -1];
  }
  if (MAP.trenchDirty) { rebuildTrenchDecor(); MAP.trenchDirty = false; }
  if (MAP.wireDirty) { rebuildWireDecor(); MAP.wireDirty = false; }
}

function clearMap() {
  while (mapGroup.children.length) {
    const o = mapGroup.children.pop();
    o.traverse((m) => { if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); });
  }
  MAP.ready = false; MAP.geo = null;
}

// Ray from the camera through a screen point, intersected with the ground.
function pickGround(sx, sy, out) {
  _v1.set((sx / VW) * 2 - 1, -(sy / VH) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
  const o = camera.position;
  let t = 0, prevT = 0, step = 2;
  let above = o.y - groundH(o.x, o.z) > 0;
  if (!above) { out.set(o.x, groundH(o.x, o.z), o.z); return true; }
  for (let k = 0; k < 600; k++) {
    t += step;
    const x = o.x + _v1.x * t, y = o.y + _v1.y * t, z = o.z + _v1.z * t;
    const gh = groundH(clamp(x, 0, MAP.W), clamp(z, 0, MAP.H));
    if (y <= gh) {
      let lo = prevT, hi = t;
      for (let b = 0; b < 12; b++) { const m = (lo + hi) / 2; const yy = o.y + _v1.y * m; const xx = o.x + _v1.x * m, zz = o.z + _v1.z * m; if (yy <= groundH(clamp(xx, 0, MAP.W), clamp(zz, 0, MAP.H))) hi = m; else lo = m; }
      out.set(o.x + _v1.x * hi, o.y + _v1.y * hi, o.z + _v1.z * hi);
      return true;
    }
    prevT = t;
    if (y < -10) break;
  }
  // fall back to the y=2 plane
  const tt = (o.y - 2) / -_v1.y;
  if (tt > 0) { out.set(o.x + _v1.x * tt, 2, o.z + _v1.z * tt); return true; }
  return false;
}
