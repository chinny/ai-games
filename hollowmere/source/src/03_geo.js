// Hollowmere — low-poly geometry builder
// Everything is baked into one mesh per material. A "transform frame" (TF) lets
// buildings and props be authored in local coordinates, then rotated/placed.

let TF = null;
function setTF(cx, cz, ang) { TF = { cx, cz, c: Math.cos(ang), s: Math.sin(ang) }; }
function clearTF() { TF = null; }
function tp(x, y, z) {
  if (!TF) return [x, y, z];
  return [TF.cx + x * TF.c + z * TF.s, y, TF.cz - x * TF.s + z * TF.c];
}
const W1 = [1, 1, 1];

class Geo {
  constructor(o = {}) { this.p = []; this.n = []; this.uv = []; this.c = []; this.ao = o.ao !== false; }
  // ref: a point inside the solid; the triangle is flipped if it faces it.
  tri(a, b, c, ua, ub, uc, col = W1, ref = null, raw = false) {
    if (!raw) { a = tp(a[0], a[1], a[2]); b = tp(b[0], b[1], b[2]); c = tp(c[0], c[1], c[2]); if (ref) ref = tp(ref[0], ref[1], ref[2]); }
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-10) return;
    nx /= l; ny /= l; nz /= l;
    if (ref) {
      const mx = (a[0] + b[0] + c[0]) / 3 - ref[0], my = (a[1] + b[1] + c[1]) / 3 - ref[1], mz = (a[2] + b[2] + c[2]) / 3 - ref[2];
      if (nx * mx + ny * my + nz * mz < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; nx = -nx; ny = -ny; nz = -nz; }
    }
    for (const [v, u] of [[a, ua], [b, ub], [c, uc]]) {
      this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); this.uv.push(u[0], u[1]);
      let k = 0.86 + 0.28 * hash2(Math.round(v[0] * 5), Math.round(v[2] * 5) + Math.round(v[1] * 7) * 131);
      if (this.ao) k *= 0.5 + 0.5 * smooth(0, 1.6, v[1] - groundH(v[0], v[2]));
      this.c.push(col[0] * k, col[1] * k, col[2] * k);
    }
  }
  quad(a, b, c, d, ua, ub, uc, ud, col, ref) { this.tri(a, b, c, ua, ub, uc, col, ref); this.tri(a, c, d, ua, uc, ud, col, ref); }
  build(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('acol', new THREE.Float32BufferAttribute(this.c, 3));
    return new THREE.Mesh(g, mat);
  }
}

const GEOS = {};
function G(name, o) { return GEOS[name] || (GEOS[name] = new Geo(o)); }

// Subdivided quad o + U*i + V*j; faces along U×V. Subdivision keeps the
// per-vertex lantern light and the affine texture warp in check.
function plane(g, o, U, V, opt = {}) {
  const lu = Math.hypot(U[0], U[1], U[2]), lv = Math.hypot(V[0], V[1], V[2]);
  const seg = opt.seg || 2.5, su = Math.max(1, Math.ceil(lu / seg)), sv = Math.max(1, Math.ceil(lv / seg));
  const tsu = opt.tsu || opt.ts || 2, tsv = opt.tsv || opt.ts || 2, u0 = opt.u0 || 0, v0 = opt.v0 || 0;
  const col = opt.col || W1;
  const P = (i, j) => [o[0] + U[0] * i / su + V[0] * j / sv, o[1] + U[1] * i / su + V[1] * j / sv, o[2] + U[2] * i / su + V[2] * j / sv];
  const T2 = (i, j) => [u0 + lu * i / su / tsu, v0 + lv * j / sv / tsv];
  for (let i = 0; i < su; i++) for (let j = 0; j < sv; j++) {
    g.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), T2(i, j), T2(i + 1, j), T2(i + 1, j + 1), T2(i, j + 1), col);
    if (opt.two) g.quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), T2(i, j), T2(i, j + 1), T2(i + 1, j + 1), T2(i + 1, j), col);
  }
}

// Axis-aligned (in the current frame) box. opt.skip: letters of faces to omit (b t n s e w).
function box(g, cx, y0, cz, w, h, d, opt = {}) {
  const skip = opt.skip === undefined ? 'b' : opt.skip;
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
  const o = Object.assign({}, opt); delete o.skip;
  if (!skip.includes('s')) plane(g, [x0, y0, z1], [w, 0, 0], [0, h, 0], o);
  if (!skip.includes('n')) plane(g, [x1, y0, z0], [-w, 0, 0], [0, h, 0], o);
  if (!skip.includes('e')) plane(g, [x1, y0, z1], [0, 0, -d], [0, h, 0], o);
  if (!skip.includes('w')) plane(g, [x0, y0, z0], [0, 0, d], [0, h, 0], o);
  if (!skip.includes('t')) plane(g, [x0, y1, z1], [w, 0, 0], [0, 0, -d], o);
  if (!skip.includes('b')) plane(g, [x0, y0, z0], [w, 0, 0], [0, 0, d], o);
}

// Vertical cylinder / cone (r1 = 0).
function cyl(g, x, y0, z, r0, r1, h, sides, opt = {}) {
  const col = opt.col || W1, ts = opt.ts || 2, ur = opt.ur || 1;
  const ref = [x, y0 + h * 0.3, z];
  const pt = (i, r, y) => { const a = i / sides * TAU; return [x + Math.cos(a) * r, y, z + Math.sin(a) * r]; };
  for (let i = 0; i < sides; i++) {
    const u0 = i / sides * ur, u1 = (i + 1) / sides * ur;
    g.quad(pt(i, r0, y0), pt(i + 1, r0, y0), pt(i + 1, r1, y0 + h), pt(i, r1, y0 + h), [u0, 0], [u1, 0], [u1, h / ts], [u0, h / ts], col, ref);
    if (opt.top) g.tri([x, y0 + h, z], pt(i, r1, y0 + h), pt(i + 1, r1, y0 + h), [0.5, 0.5], [0.5 + Math.cos(i / sides * TAU) / 2, 0.5], [0.5, 1], col, [x, y0 + h - 1, z]);
    if (opt.bottom) g.tri([x, y0, z], pt(i, r0, y0), pt(i + 1, r0, y0), [0.5, 0.5], [1, 0.5], [0.5, 1], col, [x, y0 + 1, z]);
  }
}

// Prism between two arbitrary points (branches, limbs, logs, wheels).
function limb(g, a, b, r, sides = 4, opt = {}) {
  const col = opt.col || W1, r1 = opt.r1 === undefined ? r : opt.r1, ts = opt.ts || 1;
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]);
  d[0] /= len; d[1] /= len; d[2] /= len;
  const up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let u = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
  const ul = Math.hypot(u[0], u[1], u[2]); u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const ring = (c, rad, i) => { const t = i / sides * TAU, cs = Math.cos(t) * rad, sn = Math.sin(t) * rad; return [c[0] + u[0] * cs + v[0] * sn, c[1] + u[1] * cs + v[1] * sn, c[2] + u[2] * cs + v[2] * sn]; };
  const ref = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  for (let i = 0; i < sides; i++) {
    g.quad(ring(a, r, i), ring(a, r, i + 1), ring(b, r1, i + 1), ring(b, r1, i), [i / sides, 0], [(i + 1) / sides, 0], [(i + 1) / sides, len / ts], [i / sides, len / ts], col, ref);
    if (opt.caps) {
      g.tri(a, ring(a, r, i), ring(a, r, i + 1), [0.5, 0.5], [1, 0.5], [0.5, 1], col, b);
      g.tri(b, ring(b, r1, i + 1), ring(b, r1, i), [0.5, 0.5], [1, 0.5], [0.5, 1], col, a);
    }
  }
}

function ellipsoid(g, x, y, z, rx, ry, rz, seg = 6, rings = 5, col = W1) {
  const p = (i, j) => { const th = j / rings * Math.PI, ph = i / seg * TAU; return [x + Math.sin(th) * Math.cos(ph) * rx, y + Math.cos(th) * ry, z + Math.sin(th) * Math.sin(ph) * rz]; };
  for (let i = 0; i < seg; i++) for (let j = 0; j < rings; j++)
    g.quad(p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1), [i / seg, j / rings], [(i + 1) / seg, j / rings], [(i + 1) / seg, (j + 1) / rings], [i / seg, (j + 1) / rings], col, [x, y, z]);
}

// Flat decal on a wall plane. facing: s/n/e/w; a: centre along the wall; c: the wall's coordinate.
function decal(g, facing, a, y, wd, ht, c, opt = {}) {
  let o, Uv;
  if (facing === 's') { o = [a - wd / 2, y, c]; Uv = [wd, 0, 0]; }
  else if (facing === 'n') { o = [a + wd / 2, y, c]; Uv = [-wd, 0, 0]; }
  else if (facing === 'e') { o = [c, y, a + wd / 2]; Uv = [0, 0, -wd]; }
  else { o = [c, y, a - wd / 2]; Uv = [0, 0, wd]; }
  plane(g, o, Uv, [0, ht, 0], Object.assign({ tsu: wd, tsv: ht, seg: 9 }, opt));
}

// Terrain patch following groundH, faces up.
function terrain(g, x0, z0, x1, z1, cell, ts, yoff) {
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  const V = (x, z) => [x, groundH(x, z) + yoff, z], UV = (x, z) => [x / ts, z / ts];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx;
    const za = z0 + (z1 - z0) * j / nz, zb = z0 + (z1 - z0) * (j + 1) / nz;
    g.quad(V(xa, zb), V(xb, zb), V(xb, za), V(xa, za), UV(xa, zb), UV(xb, zb), UV(xb, za), UV(xa, za), W1, [xa, -50, za]);
  }
}
function disc(g, cx, cz, R, y, ts, rings = 4, segs = 24) {
  const P = (k, i) => { const r = R * k / rings, a = i / segs * TAU; return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]; };
  const UV = (p) => [p[0] / ts, p[2] / ts];
  for (let k = 0; k < rings; k++) for (let i = 0; i < segs; i++) {
    const a = P(k, i), b = P(k, i + 1), c = P(k + 1, i + 1), d = P(k + 1, i);
    g.quad(a, b, c, d, UV(a), UV(b), UV(c), UV(d), W1, [cx, y - 5, cz]);
  }
}
