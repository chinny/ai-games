// Procedural galaxy: star system stubs by sector cell + full system generation
import { RNG, hash3, hashStr, valueNoise2 } from './rng.js';

export const LS = 299792.458; // km per light second
export const C_KMS = 299792.458;
export const SOL_R = 696000; // km
export const CELL = 20; // ly per cell
export const BUBBLE_R = 48; // ly, populated space radius

export const STAR_TYPES = {
  O: { label: 'O (Blue-White) Star', temp: 34000, r: [6, 11], col: [0.55, 0.68, 1.0], scoop: true, val: 9200, lum: 40 },
  B: { label: 'B (Blue-White) Star', temp: 17000, r: [2.6, 5.5], col: [0.62, 0.74, 1.0], scoop: true, val: 6100, lum: 14 },
  A: { label: 'A (Blue-White) Star', temp: 8600, r: [1.5, 2.3], col: [0.8, 0.86, 1.0], scoop: true, val: 4100, lum: 4 },
  F: { label: 'F (White) Star', temp: 6700, r: [1.1, 1.5], col: [1.0, 0.93, 0.8], scoop: true, val: 3200, lum: 1.8 },
  G: { label: 'G (White-Yellow) Star', temp: 5650, r: [0.88, 1.15], col: [1.0, 0.8, 0.48], scoop: true, val: 2600, lum: 1 },
  K: { label: 'K (Yellow-Orange) Star', temp: 4500, r: [0.62, 0.9], col: [1.0, 0.6, 0.26], scoop: true, val: 1700, lum: 0.45 },
  M: { label: 'M (Red Dwarf) Star', temp: 3200, r: [0.22, 0.6], col: [1.0, 0.45, 0.22], scoop: true, val: 1300, lum: 0.08 },
  L: { label: 'L (Brown Dwarf) Star', temp: 1900, r: [0.09, 0.13], col: [0.95, 0.28, 0.2], scoop: false, val: 1100, lum: 0.004 },
  T: { label: 'T (Brown Dwarf) Star', temp: 1150, r: [0.08, 0.11], col: [0.75, 0.22, 0.42], scoop: false, val: 1000, lum: 0.001 },
  D: { label: 'White Dwarf (DA) Star', temp: 14000, r: [0.009, 0.014], col: [0.85, 0.92, 1.0], scoop: false, val: 33700, lum: 0.02, jets: true },
  N: { label: 'Neutron Star', temp: 600000, r: [0.00002, 0.00002], col: [0.7, 0.85, 1.0], scoop: false, val: 54300, lum: 0.02, jets: true },
};

export const BODY_TYPES = {
  metal: { label: 'Metal-Rich Body', disc: 9400, map: 31600, kind: 0 },
  hmc: { label: 'High Metal Content World', disc: 9600, map: 32800, kind: 0 },
  rocky: { label: 'Rocky Body', disc: 500, map: 1500, kind: 0 },
  rockyice: { label: 'Rocky Ice World', disc: 700, map: 2100, kind: 0 },
  icy: { label: 'Icy Body', disc: 500, map: 1600, kind: 0 },
  elw: { label: 'Earth-Like World', disc: 64800, map: 270300, kind: 0 },
  water: { label: 'Water World', disc: 39700, map: 129900, kind: 0 },
  ammonia: { label: 'Ammonia World', disc: 37100, map: 121400, kind: 0 },
  gg1: { label: 'Class I Gas Giant', disc: 3800, map: 12500, kind: 1 },
  gg2: { label: 'Class II Gas Giant', disc: 12600, map: 41200, kind: 1 },
  gg3: { label: 'Class III Gas Giant', disc: 1800, map: 5900, kind: 1 },
  gg4: { label: 'Class IV Gas Giant', disc: 2300, map: 7400, kind: 1 },
  gg5: { label: 'Class V Gas Giant', disc: 2100, map: 6800, kind: 1 },
  gglife: { label: 'Gas Giant with Water-Based Life', disc: 9900, map: 32600, kind: 1 },
};

const SYL_A = ['Ae', 'Bo', 'Ca', 'Dra', 'Eo', 'Fla', 'Gru', 'Hy', 'Io', 'Ja', 'Ko', 'Lu', 'Mo', 'Ny', 'Oo', 'Pha', 'Qua', 'Ru', 'Sy', 'Tho', 'Ua', 'Vo', 'Wre', 'Xa', 'Za', 'Ple', 'Bla', 'Cro', 'Sko', 'Sti', 'Thue', 'Phoo', 'Eor', 'Gria', 'Hypa', 'Myo', 'Prae', 'Swoi', 'Byea', 'Dryau'];
const SYL_B = ['ck', 'rl', 'th', 'sk', 'ng', 'ph', 'tch', 'rr', 'ss', 'lm', 'nd', 'x', 'v', 'z', 'm', 'n', 'r', 'l', 'st', 'br', 'sch', 'gs'];
const SYL_C = ['ae', 'ia', 'oe', 'ou', 'ea', 'ai', 'eu', 'io', 'a', 'o', 'i', 'e', 'u', 'y', 'aa', 'ao'];
const PROPER_A = ['Al', 'Ves', 'Kor', 'Tal', 'Mer', 'Hal', 'Or', 'Syl', 'Cal', 'Dun', 'Ery', 'Fen', 'Gal', 'Ith', 'Lyr', 'Nar', 'Pel', 'Rhe', 'Sel', 'Tor', 'Ul', 'Var', 'Wen', 'Zan', 'Bel', 'Cas', 'Dei', 'Ema', 'Hes', 'Kal'];
const PROPER_B = ['ara', 'enn', 'ion', 'ux', 'ova', 'aris', 'eth', 'ani', 'oro', 'ys', 'ade', 'ura', 'imor', 'esk', 'ani', 'ira', 'oth', 'anth', 'ea', 'is', 'olt', 'una'];
const PROPER_SUF = ['', '', '', '', ' Prime', ' Minor', "'s Star", ' Reach', ' Haven', ' Gate'];
const STATION_A = ['Calloway', 'Meridian', 'Torvald', 'Okonkwo', 'Haldane', 'Vasquez', 'Ishida', 'Lindqvist', 'Abernathy', 'Kowal', 'Sato', 'Delacroix', 'Mbeki', 'Ferreira', 'Nakamura', 'Oduya', 'Petrov', 'Quill', 'Reyes', 'Strand'];
const STATION_B = ['Orbital', 'Station', 'Port', 'Hub', 'Dock', 'Terminal', 'Ring', 'Exchange', 'Platform', 'Gateway'];

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function sectorName(sx, sz) {
  const r = new RNG(hash3(sx, 0, sz, 99));
  const w1 = r.pick(SYL_A) + r.pick(SYL_B) + r.pick(SYL_C);
  const w2 = r.pick(SYL_A) + r.pick(SYL_C) + (r.chance(0.5) ? r.pick(SYL_B) + r.pick(SYL_C) : '');
  return cap(w1.toLowerCase()) + ' ' + cap(w2.toLowerCase());
}

const MASS_CODE = { O: 'g', B: 'f', A: 'e', F: 'd', G: 'd', K: 'c', M: 'b', L: 'a', T: 'a', D: 'b', N: 'c' };
const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function proceduralName(rng, cls, pos, inBubble) {
  if (inBubble) {
    return rng.pick(PROPER_A) + rng.pick(PROPER_B) + rng.pick(PROPER_SUF);
  }
  const sx = Math.floor(pos.x / 120), sz = Math.floor(pos.z / 120);
  const code = `${L[rng.int(0, 25)]}${L[rng.int(0, 25)]}-${L[rng.int(0, 25)]} ${MASS_CODE[cls]}${rng.int(0, 30)}-${rng.int(0, 120)}`;
  return `${sectorName(sx, sz)} ${code}`;
}

function rollStarClass(rng) {
  return rng.weighted([
    ['O', 0.4], ['B', 2], ['A', 5], ['F', 9], ['G', 13], ['K', 20], ['M', 33], ['L', 5], ['T', 3], ['D', 6], ['N', 3],
  ]);
}

export const HOME_ID = 'home';
const HOME = {
  id: HOME_ID, name: 'Aurelian Reach', pos: { x: 0.5, y: 2.0, z: 0.5 }, cls: 'G', seed: 424242, station: true, home: true, inBubble: true,
};

const cellCache = new Map();

function density(cx, cz) {
  const n = valueNoise2(cx / 7, cz / 7, 7) * 0.7 + valueNoise2(cx / 2.3, cz / 2.3, 11) * 0.3;
  return 0.45 + n * 1.1;
}

export function getCell(cx, cy, cz) {
  const key = cx + ',' + cy + ',' + cz;
  let c = cellCache.get(key);
  if (c) return c;
  const rng = new RNG(hash3(cx, cy, cz, 1337));
  const layerF = cy === 0 || cy === -1 ? 1 : 0.4;
  const n = Math.floor(rng.next() * 7 * density(cx, cz) * layerF + rng.next());
  c = [];
  if (cx === 0 && cy === 0 && cz === 0) c.push(HOME);
  for (let i = 0; i < n; i++) {
    const pos = { x: (cx + rng.next()) * CELL, y: (cy + rng.next()) * CELL, z: (cz + rng.next()) * CELL };
    const distHome = Math.hypot(pos.x - HOME.pos.x, pos.y - HOME.pos.y, pos.z - HOME.pos.z);
    if (distHome < 4) continue;
    const cls = rollStarClass(rng);
    const inBubble = distHome < BUBBLE_R;
    const seed = hash3(cx, cy, cz, 5000 + i);
    const nrng = new RNG(seed ^ 0x9e3779b9);
    const station = inBubble ? (cls !== 'N' && cls !== 'T' && rng.chance(0.62)) : (rng.chance(0.035) && cls !== 'N');
    c.push({ id: key + ':' + i, name: proceduralName(nrng, cls, pos, inBubble), pos, cls, seed, station, inBubble });
  }
  cellCache.set(key, c);
  return c;
}

export function systemsNear(p, radius) {
  const out = [];
  const x0 = Math.floor((p.x - radius) / CELL), x1 = Math.floor((p.x + radius) / CELL);
  const z0 = Math.floor((p.z - radius) / CELL), z1 = Math.floor((p.z + radius) / CELL);
  const y0 = Math.max(-2, Math.floor((p.y - radius) / CELL)), y1 = Math.min(1, Math.floor((p.y + radius) / CELL));
  const r2 = radius * radius;
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        for (const s of getCell(x, y, z)) {
          const dx = s.pos.x - p.x, dy = s.pos.y - p.y, dz = s.pos.z - p.z;
          if (dx * dx + dy * dy + dz * dz <= r2) out.push(s);
        }
      }
  return out;
}

export function findSystem(id) {
  if (id === HOME_ID) return HOME;
  const [cellKey, idx] = id.split(':');
  const [cx, cy, cz] = cellKey.split(',').map(Number);
  return getCell(cx, cy, cz).find((s) => s.id === id) || null;
}

export function distLy(a, b) {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
}

// Route plotting: fewest jumps, then shortest distance
export function plotRoute(from, to, range) {
  const direct = distLy(from, to);
  if (direct <= range) return [to];
  if (direct > 900) return null;
  const pad = Math.min(60, range * 1.5 + 10);
  const minX = Math.min(from.pos.x, to.pos.x) - pad, maxX = Math.max(from.pos.x, to.pos.x) + pad;
  const minZ = Math.min(from.pos.z, to.pos.z) - pad, maxZ = Math.max(from.pos.z, to.pos.z) + pad;
  // corridor: distance from segment
  const ax = from.pos.x, az = from.pos.z, bx = to.pos.x, bz = to.pos.z;
  const abx = bx - ax, abz = bz - az, ab2 = abx * abx + abz * abz;
  const nodes = [];
  for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++)
    for (let y = -2; y <= 1; y++)
      for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++) {
        for (const s of getCell(x, y, z)) {
          const t = Math.max(0, Math.min(1, ((s.pos.x - ax) * abx + (s.pos.z - az) * abz) / ab2));
          const px = ax + abx * t, pz = az + abz * t;
          if (Math.hypot(s.pos.x - px, s.pos.z - pz) <= pad) nodes.push(s);
        }
      }
  if (!nodes.includes(from)) nodes.push(from);
  if (!nodes.includes(to)) nodes.push(to);
  const n = nodes.length;
  const idx = new Map(nodes.map((s, i) => [s, i]));
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const s0 = idx.get(from), t0 = idx.get(to);
  cost[s0] = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && cost[i] < best) { best = cost[i]; u = i; }
    if (u < 0 || u === t0) break;
    done[u] = 1;
    const su = nodes[u];
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      const d = distLy(su, nodes[v]);
      if (d > range || d < 0.01) continue;
      // cost: 1 per jump + slight preference for progress toward target
      const c = cost[u] + 1 + d * 0.002 + distLy(nodes[v], to) * 0.0005;
      if (c < cost[v]) { cost[v] = c; prev[v] = u; }
    }
  }
  if (!isFinite(cost[t0])) return null;
  const route = [];
  for (let v = t0; v !== s0; v = prev[v]) route.unshift(nodes[v]);
  return route;
}

// ---------- full system generation ----------
function jitterColor(rng, c, amt = 0.08) {
  return c.map((v) => Math.max(0, Math.min(1, v + (rng.next() - 0.5) * amt)));
}

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

function planetLook(type, rng, temp) {
  // returns shader params
  const L = { kind: BODY_TYPES[type].kind, sea: -2, ice: 2, clouds: 0, craters: 0, atmo: null, atmoStr: 0, bands: 0, turb: 0, lava: 0, ridged: 0 };
  const pal = (arr) => arr.map((h) => jitterColor(rng, hex(h), 0.07));
  switch (type) {
    case 'metal':
      L.pal = pal([0x1d1a18, 0x3a332c, 0x5a4a3c, 0x7d6a55, 0xa08a70]);
      L.craters = 1; L.ridged = 0.6; L.lava = temp > 900 ? 1 : 0;
      break;
    case 'hmc':
      L.pal = pal(rng.pick([[0x2b2420, 0x4e4238, 0x7a6552, 0x9c8670, 0xc2ad94], [0x25221f, 0x4a3b33, 0x6f5040, 0x8f6c55, 0xb39272]]));
      L.craters = 0.7; L.ridged = 0.5; L.lava = temp > 1000 ? 0.7 : 0;
      if (temp > 200 && temp < 500 && rng.chance(0.6)) { L.atmo = jitterColor(rng, [0.9, 0.7, 0.45]); L.atmoStr = 0.6; L.craters = 0.25; }
      break;
    case 'rocky':
      L.pal = pal(rng.pick([[0x3a332d, 0x5d5249, 0x857565, 0xa89683, 0xcbbca8], [0x40342a, 0x6b5440, 0x936f50, 0xb48b66, 0xd4b088], [0x3a3a3c, 0x58585a, 0x7a7876, 0x9c9894, 0xc0bcb6]]));
      L.craters = 1; L.ridged = 0.3;
      break;
    case 'rockyice':
      L.pal = pal([0x4a4540, 0x6e665e, 0x9a958f, 0xc8d0d6, 0xeef3f7]);
      L.craters = 0.8; L.ice = 0.55;
      break;
    case 'icy':
      L.pal = pal(rng.pick([[0x8a9aa8, 0xaab8c4, 0xc8d4dc, 0xe0e8ee, 0xf6fafc], [0x9a8f86, 0xb8aea4, 0xd4ccc4, 0xe8e2dc, 0xfaf7f3], [0x7c94a8, 0x9fb6c6, 0xbfd2de, 0xdbe8f0, 0xf4f9fc]]));
      L.craters = 0.9; L.ridged = 0.4;
      break;
    case 'elw':
      L.pal = pal([0x2f5d2a, 0x4a7a35, 0x8a8a4a, 0xa88d62, 0xd8d0c0]);
      L.sea = rng.range(0.0, 0.18); L.seaCol = [0.02, 0.09, 0.24]; L.seaCol2 = [0.05, 0.25, 0.42];
      L.ice = rng.range(0.78, 0.9); L.clouds = rng.range(0.55, 0.8); L.atmo = [0.35, 0.6, 1.0]; L.atmoStr = 1.0;
      break;
    case 'water':
      L.pal = pal([0x2a4a5a, 0x3c6070, 0x5a7a80, 0x8aa0a0, 0xd0dcdc]);
      L.sea = 0.55; L.seaCol = jitterColor(rng, [0.02, 0.07, 0.22]); L.seaCol2 = jitterColor(rng, [0.06, 0.2, 0.42]);
      L.ice = rng.range(0.8, 0.95); L.clouds = rng.range(0.45, 0.75); L.atmo = [0.4, 0.62, 1.0]; L.atmoStr = 0.9;
      break;
    case 'ammonia':
      L.kind = 1; L.pal = pal([0x5a4a2a, 0x7a6a3a, 0x8f8a52, 0xa29a6a, 0xc8b88a]); L.bands = rng.range(3, 6); L.turb = 1.6;
      L.atmo = [0.75, 0.7, 0.4]; L.atmoStr = 0.8;
      break;
    case 'gg1':
      L.pal = pal(rng.pick([[0x8a5a3a, 0xb98a5e, 0xd8b88f, 0xeadbc0, 0xa8704a], [0x7a5236, 0xa8784c, 0xcfa678, 0xe6d2b2, 0x9a6040]]));
      L.bands = rng.range(9, 16); L.turb = rng.range(0.8, 1.6); L.atmo = [0.9, 0.75, 0.55]; L.atmoStr = 0.5;
      break;
    case 'gg2':
      L.pal = pal([0xb8b0a0, 0xd6cebc, 0xece4d4, 0xf8f4ea, 0xc8bca6]);
      L.bands = rng.range(7, 13); L.turb = 1.0; L.atmo = [0.95, 0.92, 0.85]; L.atmoStr = 0.5;
      break;
    case 'gglife':
      L.pal = pal([0x3a6a68, 0x5a8a80, 0x8ab0a0, 0xc0d8c8, 0x4a7a6a]);
      L.bands = rng.range(7, 12); L.turb = 1.2; L.atmo = [0.6, 0.9, 0.85]; L.atmoStr = 0.6;
      break;
    case 'gg3':
      L.pal = pal(rng.pick([[0x3a6a9a, 0x5a8ab8, 0x8ab0d4, 0xbcd4ea, 0x4a78a8], [0x4a7a8a, 0x6a9aa8, 0x94bcc8, 0xc4dce4, 0x5a8a9a]]));
      L.bands = rng.range(5, 10); L.turb = 0.7; L.atmo = [0.5, 0.75, 1.0]; L.atmoStr = 0.7;
      break;
    case 'gg4':
      L.pal = pal([0x5a2a1a, 0x8a4a2a, 0xa86a40, 0xc48a5a, 0x6a3020]);
      L.bands = rng.range(8, 14); L.turb = 1.4; L.atmo = [1.0, 0.6, 0.35]; L.atmoStr = 0.5;
      break;
    case 'gg5':
      L.pal = pal([0x6a6a6a, 0x8a8a8c, 0xaaaaae, 0xd0d0d4, 0x7a7a80]);
      L.bands = rng.range(10, 18); L.turb = 1.2; L.atmo = [0.85, 0.85, 0.9]; L.atmoStr = 0.4;
      break;
  }
  return L;
}

function pickPlanetType(rng, temp, big) {
  if (big) {
    if (temp > 700) return rng.weighted([['gg5', 3], ['gg4', 4], ['hmc', 2]]);
    if (temp > 330) return rng.weighted([['gg4', 3], ['gg5', 1], ['gg2', 1]]);
    if (temp > 180) return rng.weighted([['gg2', 4], ['gglife', 2], ['gg1', 2]]);
    if (temp > 90) return rng.weighted([['gg1', 6], ['gglife', 1], ['gg3', 2]]);
    return rng.weighted([['gg3', 5], ['gg1', 2]]);
  }
  if (temp > 800) return rng.weighted([['metal', 4], ['hmc', 4], ['rocky', 2]]);
  if (temp > 350) return rng.weighted([['hmc', 5], ['rocky', 5], ['metal', 1]]);
  if (temp > 220) return rng.weighted([['elw', 1.4], ['water', 2.2], ['hmc', 3], ['rocky', 3], ['ammonia', 0.4]]);
  if (temp > 130) return rng.weighted([['rocky', 3], ['ammonia', 1.6], ['water', 0.8], ['rockyice', 2], ['icy', 2], ['hmc', 1]]);
  return rng.weighted([['icy', 6], ['rockyice', 3], ['rocky', 1]]);
}

function bodyRadius(rng, type) {
  switch (type) {
    case 'metal': return rng.range(900, 4200);
    case 'hmc': return rng.range(1800, 8000);
    case 'rocky': return rng.range(700, 5200);
    case 'rockyice': return rng.range(900, 5000);
    case 'icy': return rng.range(600, 7000);
    case 'elw': return rng.range(5200, 7800);
    case 'water': return rng.range(4200, 9500);
    case 'ammonia': return rng.range(4000, 8200);
    default: return rng.range(22000, 78000);
  }
}

function orbitPos(rng, a, incl = 0.06) {
  const th = rng.range(0, Math.PI * 2);
  const i = rng.gauss() * incl;
  return [a * Math.cos(th), a * Math.sin(th) * Math.sin(i), a * Math.sin(th) * Math.cos(i)];
}

const BODY_LETTERS = 'abcdefgh';

export function generateSystem(stub) {
  const rng = new RNG(stub.seed);
  const st = STAR_TYPES[stub.cls];
  let rSol = rng.range(st.r[0], st.r[1]);
  const starR = stub.cls === 'N' ? 15 : rSol * SOL_R;
  const sys = {
    id: stub.id, name: stub.name, stub, pos: stub.pos,
    star: {
      id: stub.id + '/star', name: stub.name, kind: 'star', cls: stub.cls, type: 'star', label: st.label,
      radius: starR, col: jitterColor(rng, st.col, 0.04), temp: Math.round(st.temp * rng.range(0.92, 1.08)),
      scoop: st.scoop, pos: [0, 0, 0], value: { disc: st.val, map: 0 }, jets: !!st.jets,
      jetAxis: null,
    },
    bodies: [],
    station: null,
  };
  if (sys.star.jets) {
    const a = [rng.gauss(), rng.gauss(), rng.gauss()];
    const l = Math.hypot(...a);
    sys.star.jetAxis = a.map((v) => v / l);
  }
  // planets
  let nPlanets;
  if (stub.cls === 'N' || stub.cls === 'D') nPlanets = rng.int(0, 3);
  else if (stub.cls === 'L' || stub.cls === 'T') nPlanets = rng.int(1, 4);
  else nPlanets = rng.int(3, 10);
  if (stub.home) nPlanets = 6;
  const lumRoot = Math.sqrt(st.lum);
  let a = Math.max((starR * 5) / LS, rng.range(5, 22) * Math.max(0.35, lumRoot));
  if (stub.cls === 'N') a = rng.range(30, 90);
  const k = rng.range(1.45, 1.95);
  const starTempEff = stub.cls === 'N' ? 3000 : st.temp;
  const starRForTemp = stub.cls === 'N' ? SOL_R * 0.02 : starR;
  let pIndex = 0;
  for (let i = 0; i < nPlanets; i++) {
    if (a > 6500) break;
    const aKm = a * LS;
    const temp = starTempEff * Math.sqrt(starRForTemp / (2 * aKm));
    const big = rng.chance(temp < 200 ? 0.5 : 0.28);
    let type = pickPlanetType(rng, temp, big);
    if (stub.home) type = ['hmc', 'rocky', 'elw', 'gg1', 'gg3', 'icy'][i];
    pIndex++;
    const radius = stub.home && type === 'elw' ? 6300 : bodyRadius(rng, type);
    const pos = orbitPos(rng, aKm);
    const look = planetLook(type, rng, temp);
    const terraform = ['hmc', 'water', 'rocky'].includes(type) && temp > 190 && temp < 360 && rng.chance(0.4);
    const p = {
      id: `${stub.id}/p${pIndex}`, name: `${stub.name} ${pIndex}`, kind: 'planet', type, label: BODY_TYPES[type].label,
      radius, pos, temp: Math.round(temp), look, terraform,
      rings: null, parent: null, tilt: rng.gauss() * 0.35, rotSpeed: rng.range(0.002, 0.02) * (rng.chance(0.5) ? 1 : -1),
      seed: [rng.range(-50, 50), rng.range(-50, 50), rng.range(-50, 50)],
      gravity: radius > 15000 ? 1.4 : 1,
    };
    const base = BODY_TYPES[type];
    const tf = terraform ? 3 : 1;
    p.value = { disc: Math.round(base.disc * tf), map: Math.round(base.map * tf) };
    const isGG = BODY_TYPES[type].kind === 1 && type !== 'ammonia';
    if ((isGG && rng.chance(0.5)) || (!isGG && type === 'icy' && rng.chance(0.15)) || (stub.home && type === 'gg1')) {
      const inner = radius * rng.range(1.35, 1.7);
      p.rings = {
        inner, outer: inner * rng.range(1.35, 2.1),
        c1: jitterColor(rng, temp < 150 ? [0.75, 0.78, 0.8] : [0.7, 0.58, 0.45], 0.1),
        c2: jitterColor(rng, temp < 150 ? [0.55, 0.6, 0.66] : [0.48, 0.38, 0.3], 0.1),
        seed: rng.range(0, 100),
      };
    }
    sys.bodies.push(p);
    // moons
    const nMoons = isGG ? rng.int(0, 4) : rng.chance(0.25) ? 1 : 0;
    let moonA = radius * (p.rings ? p.rings.outer / radius + 1.5 : rng.range(3, 6));
    for (let m = 0; m < nMoons; m++) {
      moonA *= rng.range(1.5, 2.6);
      const mt = temp > 300 ? rng.pick(['rocky', 'hmc', 'metal']) : rng.pick(['icy', 'rockyice', 'rocky', 'icy']);
      const mr = Math.min(radius * 0.15, rng.range(300, 3000));
      const off = orbitPos(rng, moonA, 0.15);
      const mb = BODY_TYPES[mt];
      sys.bodies.push({
        id: `${p.id}${BODY_LETTERS[m]}`, name: `${p.name} ${BODY_LETTERS[m]}`, kind: 'moon', type: mt, label: mb.label,
        radius: mr, pos: [pos[0] + off[0], pos[1] + off[1], pos[2] + off[2]], temp: Math.round(temp), look: planetLook(mt, rng, temp),
        terraform: false, rings: null, parent: p.id, tilt: rng.gauss() * 0.3, rotSpeed: rng.range(0.003, 0.02),
        seed: [rng.range(-50, 50), rng.range(-50, 50), rng.range(-50, 50)], value: { disc: mb.disc, map: mb.map }, gravity: 0.8,
      });
    }
    a *= k * rng.range(0.9, 1.15);
  }
  // station
  if (stub.station && sys.bodies.length) {
    const candidates = sys.bodies.filter((b) => b.kind === 'planet');
    const pref = candidates.filter((b) => ['elw', 'water', 'gg1', 'gg2', 'gglife', 'hmc'].includes(b.type));
    const host = (stub.home ? candidates.find((b) => b.type === 'elw') : null) || (pref.length ? rng.pick(pref) : rng.pick(candidates));
    const dist = (host.rings ? host.rings.outer : host.radius) * 1.6 + 4000;
    const th = rng.range(0, Math.PI * 2);
    const off = [Math.cos(th) * dist, rng.range(-0.1, 0.1) * dist, Math.sin(th) * dist];
    const spos = [host.pos[0] + off[0], host.pos[1] + off[1], host.pos[2] + off[2]];
    const l = Math.hypot(...off);
    sys.station = {
      id: stub.id + '/station', name: `${rng.pick(STATION_A)} ${rng.pick(STATION_B)}`, kind: 'station', type: 'station',
      label: 'Orbital Station', radius: 1.4, pos: spos, host: host.id, axis: [off[0] / l, off[1] / l, off[2] / l], value: { disc: 0, map: 0 },
    };
    if (stub.home) sys.station.name = 'Halloran Orbital';
  }
  return sys;
}

export function rankFor(earned) {
  const ranks = [
    [0, 'Drifter'], [20000, 'Wayfarer'], [120000, 'Scout'], [500000, 'Surveyor'], [1500000, 'Trailblazer'],
    [4000000, 'Pathfinder'], [10000000, 'Ranger'], [25000000, 'Pioneer'], [60000000, 'Luminary'],
  ];
  let r = ranks[0], next = null;
  for (let i = 0; i < ranks.length; i++) {
    if (earned >= ranks[i][0]) { r = ranks[i]; next = ranks[i + 1] || null; }
  }
  return { name: r[1], next, progress: next ? (earned - r[0]) / (next[0] - r[0]) : 1 };
}
