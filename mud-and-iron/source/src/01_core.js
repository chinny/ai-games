// Mud & Iron — shared helpers: math, seeded RNG, noise, geometry merging, input state

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const $ = (s) => document.querySelector(s);
const DEBUG = location.hash === '#debug';
const isTouch = matchMedia('(pointer: coarse)').matches;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Map generation draws from a seeded stream so a seed always gives the same sector.
let rand = mulberry32(1);
let NSEED = 1;
function seedRand(s) { rand = mulberry32(s); NSEED = (s * 2654435761) | 0; }
const rr = (a, b) => a + (b - a) * rand();
const ri = (a, b) => Math.floor(rr(a, b + 1));
// Gameplay randomness (combat rolls, effects) is unseeded.
const frand = (a, b) => a + (b - a) * Math.random();
const fpick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function hash2(x, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + NSEED) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash2(xi, zi), hash2(xi + 1, zi), u), lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), u), v);
}
function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f + i * 17.3, z * f - i * 9.1) * a; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
function angWrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
function turnTo(a, b, step) { const d = angWrap(b - a); return Math.abs(d) <= step ? b : a + Math.sign(d) * step; }
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
const fmtTime = (t) => { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

const V3 = THREE.Vector3;
const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _v4 = new V3(), _v5 = new V3();
const _q1 = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _s1 = new V3(1, 1, 1);
const UP = new V3(0, 1, 0);
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const _col = new THREE.Color();

// Merge several (geometry, transform, vertex colour) parts into one flat-shaded, non-indexed geometry.
function mergeParts(parts) {
  const pos = [], nor = [], col = [];
  const m = new THREE.Matrix4();
  for (const pt of parts) {
    const g = pt.geo.index ? pt.geo.toNonIndexed() : pt.geo.clone();
    m.compose(new V3(...(pt.p || [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(pt.r || [0, 0, 0]), pt.o || 'XYZ')), new V3(...(pt.s || [1, 1, 1])));
    if (pt.m) m.premultiply(pt.m);
    g.applyMatrix4(m);
    g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal, c = pt.c || [1, 1, 1];
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      col.push(c[0], c[1], c[2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
const hex = (h) => { _col.set(h); return [_col.r, _col.g, _col.b]; };
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const keys = {};
