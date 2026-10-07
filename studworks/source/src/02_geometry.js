// Studworks — brick geometry: chamfered shells with hollow undersides, studs, tubes and slope prisms.
// Every part is built in local space with its min corner at the origin: x in [0, w], y in [0, h * PLATE], z in [0, d].

const CHAMFER = 0.035;  // bevel on brick edges; neighbouring bevels form the familiar seams
const WALL = 0.15;      // shell wall thickness
const ROOF = 0.125;     // thickness of the top above the hollow underside
const LIP = 0.2;        // vertical lip at the low edge of a slope

// Collects non-indexed triangles. `hint` is a rough outward direction: triangles facing
// away from it are flipped, so the builders below never have to worry about winding.
class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; }
  tri(a, b, c, hint) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) return;
    nx /= len; ny /= len; nz /= len;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
      const t = b; b = c; c = t;
      nx = -nx; ny = -ny; nz = -nz;
    }
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  }
  quad(a, b, c, d, hint) { this.tri(a, b, c, hint); this.tri(a, c, d, hint); }
  vert(p, n) { this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); }
  // A smooth-shaded surface of revolution between (r0, y0) and (r1, y1) around (cx, cz).
  band(cx, cz, r0, y0, r1, y1, seg, inward) {
    let nr = y1 - y0, ny = -(r1 - r0);
    const nl = Math.hypot(nr, ny); nr /= nl; ny /= nl;
    if (inward) { nr = -nr; ny = -ny; }
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const p00 = [cx + c0 * r0, y0, cz + s0 * r0], p01 = [cx + c0 * r1, y1, cz + s0 * r1];
      const p10 = [cx + c1 * r0, y0, cz + s1 * r0], p11 = [cx + c1 * r1, y1, cz + s1 * r1];
      const n0 = [c0 * nr, ny, s0 * nr], n1 = [c1 * nr, ny, s1 * nr];
      if (!inward) {
        this.vert(p00, n0); this.vert(p01, n0); this.vert(p10, n1);
        this.vert(p10, n1); this.vert(p01, n0); this.vert(p11, n1);
      } else {
        this.vert(p00, n0); this.vert(p10, n1); this.vert(p01, n0);
        this.vert(p10, n1); this.vert(p11, n1); this.vert(p01, n0);
      }
    }
  }
  // Flat ring (or disc when r0 = 0) at height y facing up (dir 1) or down (dir -1).
  ring(cx, cz, r0, r1, y, seg, dir) {
    const h = [0, dir, 0];
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU;
      const o0 = [cx + Math.cos(a0) * r1, y, cz + Math.sin(a0) * r1];
      const o1 = [cx + Math.cos(a1) * r1, y, cz + Math.sin(a1) * r1];
      if (r0 <= 0) { this.tri([cx, y, cz], o0, o1, h); continue; }
      const i0 = [cx + Math.cos(a0) * r0, y, cz + Math.sin(a0) * r0];
      const i1 = [cx + Math.cos(a1) * r0, y, cz + Math.sin(a1) * r0];
      this.quad(i0, o0, o1, i1, h);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

function addStud(g, x, y, z, seg = 16) {
  const r = STUD_R, h = STUD_H, b = 0.03;
  g.band(x, z, r, y, r, y + h - b, seg);
  g.band(x, z, r, y + h - b, r - b, y + h, seg);
  g.ring(x, z, 0, r - b, y + h, seg, 1);
}

// Box with all twelve edges bevelled. With openBottom the bottom face is left out.
function chamferBox(g, lo, hi, c, openBottom) {
  const pt = (spec) => {
    const p = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const [s, outer] = spec[i];
      p[i] = s > 0 ? hi[i] - (outer ? 0 : c) : lo[i] + (outer ? 0 : c);
    }
    return p;
  };
  for (let a = 0; a < 3; a++) {
    for (const s of [-1, 1]) {
      if (openBottom && a === 1 && s < 0) continue;
      const [b, d] = [0, 1, 2].filter((i) => i !== a);
      const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sb, sd]) => {
        const sp = []; sp[a] = [s, true]; sp[b] = [sb, false]; sp[d] = [sd, false];
        return pt(sp);
      });
      const hint = [0, 0, 0]; hint[a] = s;
      g.quad(q[0], q[1], q[2], q[3], hint);
    }
  }
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 3; b++) {
      const d = 3 - a - b;
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          const mk = (oa, ob, sd) => {
            const sp = []; sp[a] = [sa, oa]; sp[b] = [sb, ob]; sp[d] = [sd, false];
            return pt(sp);
          };
          const hint = [0, 0, 0]; hint[a] = sa; hint[b] = sb;
          g.quad(mk(true, false, -1), mk(true, false, 1), mk(false, true, 1), mk(false, true, -1), hint);
        }
      }
    }
  }
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const s = [sx, sy, sz];
        const mk = (o) => pt([0, 1, 2].map((i) => [s[i], i === o]));
        g.tri(mk(0), mk(1), mk(2), s);
      }
    }
  }
}

// The hollow underside: bottom rim, inner walls, ceiling, and the tubes or pins that grip studs.
function hollowUnderside(g, t, lo, hi) {
  const H = t.h * PLATE, yc = H - ROOF, c = CHAMFER;
  const o = [[lo[0] + c, lo[2] + c], [hi[0] - c, lo[2] + c], [hi[0] - c, hi[2] - c], [lo[0] + c, hi[2] - c]];
  const i = [[lo[0] + WALL, lo[2] + WALL], [hi[0] - WALL, lo[2] + WALL], [hi[0] - WALL, hi[2] - WALL], [lo[0] + WALL, hi[2] - WALL]];
  const at = (p, y) => [p[0], y, p[1]];
  const mid = [(lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2];
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4;
    g.quad(at(o[k], 0), at(o[n], 0), at(i[n], 0), at(i[k], 0), [0, -1, 0]);
    const inward = [mid[0] - (i[k][0] + i[n][0]) / 2, 0, mid[1] - (i[k][1] + i[n][1]) / 2];
    g.quad(at(i[k], 0), at(i[n], 0), at(i[n], yc), at(i[k], yc), inward);
  }
  g.quad(at(i[0], yc), at(i[1], yc), at(i[2], yc), at(i[3], yc), [0, -1, 0]);
  if (t.w >= 2 && t.d >= 2) {
    for (let x = 1; x < t.w; x++) {
      for (let z = 1; z < t.d; z++) {
        g.band(x, z, 0.407, 0, 0.407, yc, 14);
        g.band(x, z, 0.3, 0, 0.3, yc, 14, true);
        g.ring(x, z, 0.3, 0.407, 0, 14, -1);
      }
    }
  } else if (t.w > 1 || t.d > 1) {
    const long = Math.max(t.w, t.d);
    for (let k = 1; k < long; k++) {
      const x = t.w > 1 ? k : 0.5, z = t.w > 1 ? 0.5 : k;
      g.band(x, z, 0.15, 0, 0.15, yc, 10);
      g.ring(x, z, 0, 0.15, 0, 10, -1);
    }
  }
}

// Convex profile in the (z, y) plane, extruded along x.
function prism(g, pts, x0, x1) {
  let cz = 0, cy = 0;
  for (const p of pts) { cz += p[0]; cy += p[1]; }
  cz /= pts.length; cy /= pts.length;
  const P = (x, p) => [x, p[1], p[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    g.tri(P(x0, pts[0]), P(x0, pts[i]), P(x0, pts[i + 1]), [-1, 0, 0]);
    g.tri(P(x1, pts[0]), P(x1, pts[i]), P(x1, pts[i + 1]), [1, 0, 0]);
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const hint = [0, (a[1] + b[1]) / 2 - cy, (a[0] + b[0]) / 2 - cz];
    g.quad(P(x0, a), P(x1, a), P(x1, b), P(x0, b), hint);
  }
}

function buildTypeGeometry(t) {
  const g = new GeoBuilder();
  const H = t.h * PLATE;
  const lo = [GAP, 0, GAP], hi = [t.w - GAP, H, t.d - GAP];
  if (t.shape === 'box') {
    chamferBox(g, lo, hi, CHAMFER, true);
    hollowUnderside(g, t, lo, hi);
  } else {
    const z0 = GAP, z1 = t.d - GAP;
    let pts;
    if (t.shape === 'slope') pts = [[z0, 0], [z1, 0], [z1, LIP], [1, H], [z0, H]];
    else if (t.shape === 'inv') pts = [[z0, 0], [1, 0], [z1, H - LIP], [z1, H], [z0, H]];
    else pts = [[z0, 0], [z1, 0], [z1, LIP], [t.d / 2, H], [z0, LIP]];
    prism(g, pts, GAP, t.w - GAP);
  }
  for (const [x, z] of t.studs) addStud(g, x, H, z);
  return g.build();
}

function typeGeometry(t) {
  if (!t.geo) t.geo = buildTypeGeometry(t);
  return t.geo;
}

let _studGeo = null;
function studGeometry() {
  if (!_studGeo) {
    const g = new GeoBuilder();
    addStud(g, 0, 0, 0, 14);
    _studGeo = g.build();
  }
  return _studGeo;
}

// Local-to-world transform for a brick placed at grid (x, y, z) with rotation rot.
const _rotM = new THREE.Matrix4(), _offM = new THREE.Matrix4();
function brickMatrix(type, x, y, z, rot, out) {
  const [W, D] = dimsOf(type, rot);
  out.makeTranslation(x + W / 2, y * PLATE, z + D / 2);
  _rotM.makeRotationY(rot * Math.PI / 2);
  _offM.makeTranslation(-type.w / 2, 0, -type.d / 2);
  return out.multiply(_rotM).multiply(_offM);
}
