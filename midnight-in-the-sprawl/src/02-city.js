// ===================== City generation =====================
const boxes = [];      // building volumes: x,z centre, w,d, y0, h, seed, tint
const footprints = []; // collision + minimap rects (ground level)
const grid = new Map(); // block key -> footprint indices
const neonList = [];   // instanced neon strips: x,y,z,sx,sy,sz,r,g,b
const flickList = [];
const darkList = [];   // masts, sign backs, rooftop clutter
const beacons = [];    // aircraft warning lights
const vendList = [];   // vending machines {x,z,rot}
const billboards = []; // {x,y,z,w,h,rot}
const cables = [];     // line segment points
const signsV = [];     // per sign type: array of instances
const signsH = [];
const signsRoof = [];

const key = (i, j) => i + ',' + j;
function addFootprint(r, i, j) {
  const idx = footprints.push(r) - 1;
  const k = key(i, j);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(idx);
}
const strip = (list, x, y, z, sx, sy, sz, c) => list.push(x, y, z, sx, sy, sz, c[0], c[1], c[2]);

// ---- Sign artwork (drawn to canvas; redrawn once fonts arrive) ----
const V_SIGNS = [
  { t: 'ラーメン', c: 'red' }, { t: '酒場', c: 'amber' }, { t: '夜市', c: 'magenta' }, { t: '電脳', c: 'cyan' },
  { t: 'ホテル', c: 'violet' }, { t: 'カラオケ', c: 'pink' }, { t: '薬局', c: 'teal' }, { t: '居酒屋', c: 'amber', inv: true },
  { t: '義体', c: 'cyan', inv: true }, { t: 'BAR', c: 'magenta' }, { t: '24H', c: 'blue' }, { t: '修理', c: 'red', inv: true },
];
const H_SIGNS = [
  { t: 'NOODLE 夜', c: 'red' }, { t: 'SYNTH CLINIC', c: 'teal' }, { t: 'KARAOKE', c: 'pink' }, { t: 'DATA DEN', c: 'cyan' },
  { t: 'HOTEL ORBIT', c: 'violet' }, { t: 'OPEN 24H', c: 'amber', inv: true }, { t: 'LIVE MUSIC', c: 'magenta' }, { t: 'CHROME REPAIR', c: 'blue' },
  { t: '酒 SAKE', c: 'amber' }, { t: 'IMPLANTS', c: 'cyan', inv: true }, { t: 'CAPSULE INN', c: 'magenta' }, { t: 'PACHI-PACHI', c: 'pink', inv: true },
];
const SIGN_CHARS = Array.from(new Set((V_SIGNS.concat(H_SIGNS)).map((s) => s.t).join('').replace(/[\x00-\x7F]/g, ''))).join('');
const JP_STACK = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
const LAT_STACK = '"Chakra Petch", "Noto Sans JP", "Arial Narrow", sans-serif';

function drawSign(cv, def, vertical) {
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const c = NEON[def.c];
  const hex = hexOf(c);
  const light = hexOf(c.map((v) => v * 0.45 + 0.55));
  g.clearRect(0, 0, W, H);
  g.fillStyle = def.inv ? hexOf(c.map((v) => v * 0.78)) : '#0c0716';
  g.fillRect(0, 0, W, H);
  // frame tube
  g.lineWidth = 6;
  g.strokeStyle = def.inv ? '#1a0c1c' : light;
  g.shadowColor = hex; g.shadowBlur = def.inv ? 0 : 16;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.shadowBlur = 0;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const text = def.t;
  const isLatin = /^[\x00-\x7F]+$/.test(text);
  const ink = def.inv ? '#14060f' : '#fff3fb';
  const pass = (blur, fill) => {
    g.shadowColor = hex; g.shadowBlur = blur; g.fillStyle = fill;
    if (vertical) {
      const chars = Array.from(text);
      const step = (H - 40) / chars.length;
      const size = Math.min(W * 0.7, step * 0.86);
      g.font = `900 ${size}px ${isLatin ? LAT_STACK : JP_STACK}`;
      chars.forEach((ch, k) => g.fillText(ch, W / 2, 20 + step * (k + 0.5)));
    } else {
      let size = H * 0.56;
      g.font = `700 ${size}px ${LAT_STACK}`;
      const m = g.measureText(text).width;
      if (m > W - 48) { size *= (W - 48) / m; g.font = `700 ${size}px ${LAT_STACK}`; }
      g.fillText(text, W / 2, H / 2 + 2);
    }
  };
  if (def.inv) { pass(0, ink); }
  else { pass(26, hex); pass(10, light); pass(0, ink); }
}
const signTex = [];
function makeSignTextures() {
  V_SIGNS.forEach((d) => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 512;
    drawSign(cv, d, true);
    const t = new THREE.CanvasTexture(cv); t.anisotropy = maxAniso; d.tex = t; d.cv = cv; signTex.push([cv, d, true, t]);
  });
  H_SIGNS.forEach((d) => {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112;
    drawSign(cv, d, false);
    const t = new THREE.CanvasTexture(cv); t.anisotropy = maxAniso; d.tex = t; d.cv = cv; signTex.push([cv, d, false, t]);
  });
}
function redrawSigns() { signTex.forEach(([cv, d, v, t]) => { drawSign(cv, d, v); t.needsUpdate = true; }); }
makeSignTextures();
V_SIGNS.forEach(() => signsV.push([]));
H_SIGNS.forEach(() => { signsH.push([]); signsRoof.push([]); });

// Faces: outward normal + yaw for a +Z-facing plane
const FACES = {
  W: { nx: -1, nz: 0, yaw: -Math.PI / 2 },
  E: { nx: 1, nz: 0, yaw: Math.PI / 2 },
  N: { nx: 0, nz: -1, yaw: Math.PI },
  S: { nx: 0, nz: 1, yaw: 0 },
};
// face geometry for a rect: point on the face centre, tangent axis, length
function faceInfo(b, f) {
  if (f === 'W') return { cx: b.x0, cz: (b.z0 + b.z1) / 2, len: b.z1 - b.z0, tx: 0, tz: 1 };
  if (f === 'E') return { cx: b.x1, cz: (b.z0 + b.z1) / 2, len: b.z1 - b.z0, tx: 0, tz: 1 };
  if (f === 'N') return { cx: (b.x0 + b.x1) / 2, cz: b.z0, len: b.x1 - b.x0, tx: 1, tz: 0 };
  return { cx: (b.x0 + b.x1) / 2, cz: b.z1, len: b.x1 - b.x0, tx: 1, tz: 0 };
}

function splitSpan(a, b, maxParts) {
  const parts = RI(1, maxParts);
  const cuts = [a];
  for (let k = 1; k < parts; k++) cuts.push(a + ((b - a) * k) / parts + R(-3, 3));
  cuts.push(b);
  const out = [];
  for (let k = 0; k < parts; k++) {
    const alley = k > 0 && chance(0.35) ? 1.6 : 0;
    const alleyR = k < parts - 1 && chance(0.35) ? 1.6 : 0;
    out.push({ a: cuts[k] + alley, b: cuts[k + 1] - alleyR, first: k === 0, last: k === parts - 1 });
  }
  return out;
}

function addBox(x0, x1, z0, z1, y0, h, seed, tint) {
  boxes.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, y0, h, seed, tint });
}

function neonRing(list, b, y, th, c, out = 0.1) {
  const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  strip(list, cx, y, b.z0 - out, w + out * 2, th, th, c);
  strip(list, cx, y, b.z1 + out, w + out * 2, th, th, c);
  strip(list, b.x0 - out, y, cz, th, th, d + out * 2, c);
  strip(list, b.x1 + out, y, cz, th, th, d + out * 2, c);
}

function decorate(b, h, streetFaces, perimeter, hTop = h) {
  const c1 = neonPick(), c2 = neonPick();
  // corner tubes
  if (chance(0.38)) {
    const corners = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]];
    const top = h * R(0.45, 1);
    corners.forEach(([x, z]) => {
      if (!chance(0.6)) return;
      const len = top - 5;
      if (len < 4) return;
      strip(chance(0.08) ? flickList : neonList, x + Math.sign(x - (b.x0 + b.x1) / 2) * 0.08, 5 + len / 2, z + Math.sign(z - (b.z0 + b.z1) / 2) * 0.08, 0.22, len, 0.22, c1);
    });
  }
  // floor bands
  if (chance(0.42)) {
    const nb = RI(1, 3);
    for (let k = 0; k < nb; k++) {
      const y = Math.floor(R(3, h / 3.4 - 1)) * 3.4 + 0.1;
      if (y > 6 && y < h - 1) neonRing(chance(0.06) ? flickList : neonList, b, y, 0.16, chance(0.6) ? c1 : c2);
    }
  }
  // roof outline
  if (chance(h > 90 ? 0.6 : 0.33)) neonRing(neonList, b, h - 0.1, 0.24, c2, 0.05);
  if (perimeter) return;

  streetFaces.forEach((fk) => {
    const F = FACES[fk], fi = faceInfo(b, fk);
    if (fi.len < 4) return;
    const px = (t) => fi.cx + fi.tx * t, pz = (t) => fi.cz + fi.tz * t;
    // canopy line over shops
    if (chance(0.75)) {
      const y = R(4.0, 4.4);
      strip(chance(0.07) ? flickList : neonList, fi.cx + F.nx * 0.15, y, fi.cz + F.nz * 0.15,
        fi.tx ? fi.len - 0.4 : 0.12, 0.12, fi.tz ? fi.len - 0.4 : 0.12, chance(0.5) ? c1 : neonPick());
    }
    // flat shop sign above the canopy
    if (chance(0.6)) {
      const si = RI(0, H_SIGNS.length - 1);
      const w = Math.min(fi.len - 1.2, R(4.5, 8.5));
      if (w > 3) {
        const t = R(-(fi.len - w) / 2, (fi.len - w) / 2);
        signsH[si].push({ x: px(t) + F.nx * 0.14, y: R(5.5, 6.5), z: pz(t) + F.nz * 0.14, w, h: w / 4.57, yaw: F.yaw });
      }
    }
    // vertical blade signs sticking out over the sidewalk
    const blades = chance(0.55) ? RI(1, fi.len > 20 ? 3 : 2) : 0;
    for (let k = 0; k < blades; k++) {
      const si = RI(0, V_SIGNS.length - 1);
      const s = R(1.0, 1.6);
      const bw = s * 1.25, bh = s * 5;
      const t = R(-fi.len / 2 + 1.2, fi.len / 2 - 1.2);
      const y = R(6.5, Math.min(14, h - bh - 1)) + bh / 2;
      if (y + bh / 2 > h - 0.5) continue;
      const out = 0.35 + bw / 2;
      const cx = px(t) + F.nx * out, cz = pz(t) + F.nz * out;
      // plane perpendicular to the facade: its normal runs along the tangent
      const yawA = fi.tx ? Math.PI / 2 : 0;
      const ox = fi.tx * 0.07, oz = fi.tz * 0.07;
      signsV[si].push({ x: cx + ox, y, z: cz + oz, w: bw, h: bh, yaw: yawA });
      signsV[si].push({ x: cx - ox, y, z: cz - oz, w: bw, h: bh, yaw: yawA + Math.PI });
      strip(neonList, px(t) + F.nx * (0.35 + bw + 0.05), y, pz(t) + F.nz * (0.35 + bw + 0.05), 0.1, bh, 0.1, NEON[V_SIGNS[si].c]);
      strip(darkList, px(t) + F.nx * 0.2, y + bh / 2 - 0.2, pz(t) + F.nz * 0.2, F.nx ? 0.5 : 0.12, 0.12, F.nz ? 0.5 : 0.12, [0, 0, 0]);
    }
    // vending machines
    if (chance(0.14)) {
      const t = R(-fi.len / 2 + 1, fi.len / 2 - 1);
      const vx = px(t) + F.nx * 0.45, vz = pz(t) + F.nz * 0.45;
      vendList.push({ x: vx, z: vz, yaw: F.yaw });
      const hw = F.nx ? 0.45 : 0.6, hd = F.nz ? 0.45 : 0.6;
      addFootprint({ x0: vx - hw, x1: vx + hw, z0: vz - hd, z1: vz + hd, small: true }, curI, curJ);
    }
    // LED fins
    if (h > 40 && chance(0.08)) {
      const nf = Math.floor(fi.len / 1.6);
      for (let k = 1; k < nf; k++) {
        const t = -fi.len / 2 + k * 1.6;
        strip(neonList, px(t) + F.nx * 0.1, (8 + h - 2) / 2, pz(t) + F.nz * 0.1, 0.12, h - 10, 0.12, c2);
      }
    }
    // rooftop sign
    if (h > 18 && h < 75 && chance(0.12)) {
      const si = RI(0, H_SIGNS.length - 1);
      const w = Math.min(fi.len * 0.85, R(9, 16));
      const sh = w / 4.57;
      const y = h + 0.7 + sh / 2;
      signsRoof[si].push({ x: fi.cx - F.nx * 0.6, y, z: fi.cz - F.nz * 0.6, w, h: sh, yaw: F.yaw });
      strip(darkList, fi.cx - F.nx * 0.8, h + (sh + 0.7) / 2, fi.cz - F.nz * 0.8, F.nx ? 0.25 : w, sh + 0.7, F.nz ? 0.25 : w, [0, 0, 0]);
    }
    // giant screens
    if (h > 70 && chance(0.16) && billboards.length < 12) {
      const w = Math.min(fi.len * 0.85, R(18, 28));
      const bh = w * 0.5;
      const y = R(28, h - bh / 2 - 6);
      if (y > bh / 2 + 18) addBillboard(fi.cx + F.nx * 0.3, y, fi.cz + F.nz * 0.3, w, bh, F.yaw, fk);
    }
  });
  // rooftop clutter + masts
  const nc = RI(0, 3);
  for (let k = 0; k < nc; k++) {
    const cw = R(1.5, 4), cd = R(1.5, 4), chh = R(1.2, 3.5);
    const x = R(b.x0 + cw, b.x1 - cw), z = R(b.z0 + cd, b.z1 - cd);
    if (b.x1 - b.x0 > cw * 2 + 1 && b.z1 - b.z0 > cd * 2 + 1) strip(darkList, x, h + chh / 2, z, cw, chh, cd, [0, 0, 0]);
  }
  if (hTop > 95) {
    const mh = R(8, 22);
    const x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2;
    strip(darkList, x, hTop + mh / 2, z, 0.35, mh, 0.35, [0, 0, 0]);
    beacons.push(x, hTop + mh + 0.3, z);
  }
}

function addBillboard(x, y, z, w, h, yaw, fk) {
  billboards.push({ x, y, z, w, h, yaw });
  const F = FACES[fk];
  const c = NEON.cyan;
  const tx = F.nx ? 0 : 1, tz = F.nx ? 1 : 0;
  const ox = F.nx * 0.12, oz = F.nz * 0.12;
  strip(neonList, x + ox, y + h / 2 + 0.25, z + oz, tx ? w + 0.6 : 0.18, 0.18, tz ? w + 0.6 : 0.18, c);
  strip(neonList, x + ox, y - h / 2 - 0.25, z + oz, tx ? w + 0.6 : 0.18, 0.18, tz ? w + 0.6 : 0.18, c);
}

let curI = 0, curJ = 0;
function buildCity() {
  for (let i = -1; i <= N; i++) {
    for (let j = -1; j <= N; j++) {
      curI = i; curJ = j;
      const blk = blockRect(i, j);
      const perimeter = i < 0 || j < 0 || i >= N || j >= N;
      if (i === PLAZA.i && j === PLAZA.j) continue;
      const cx = (blk.x0 + blk.x1) / 2, cz = (blk.z0 + blk.z1) / 2;
      const dc = Math.hypot(cx - PLAZA_C.x, cz - PLAZA_C.z) / (HALF * 1.2);
      if (i === TOWER.i && j === TOWER.j) {
        // landmark tower with the big screen facing the plaza
        const b = { x0: blk.x0 + 1, x1: blk.x1 - 1, z0: blk.z0 + 1, z1: blk.z1 - 1 };
        const seed = rand();
        addBox(b.x0, b.x1, b.z0, b.z1, 0, 92, seed, [0.2, 0.05, 0.3]);
        addBox(b.x0 + 6, b.x1 - 6, b.z0 + 6, b.z1 - 6, 92, 64, seed, [0.2, 0.05, 0.3]);
        addBox(b.x0 + 14, b.x1 - 14, b.z0 + 14, b.z1 - 14, 156, 36, seed, [0.2, 0.05, 0.3]);
        addFootprint(b, i, j);
        decorate(b, 92, ['W', 'N', 'S'], false);
        neonRing(neonList, { x0: b.x0 + 6, x1: b.x1 - 6, z0: b.z0 + 6, z1: b.z1 - 6 }, 155.9, 0.3, NEON.magenta);
        neonRing(neonList, { x0: b.x0 + 14, x1: b.x1 - 14, z0: b.z0 + 14, z1: b.z1 - 14 }, 191.9, 0.3, NEON.cyan);
        strip(darkList, (b.x0 + b.x1) / 2, 192 + 14, (b.z0 + b.z1) / 2, 0.5, 28, 0.5, [0, 0, 0]);
        beacons.push((b.x0 + b.x1) / 2, 220.4, (b.z0 + b.z1) / 2);
        addBillboard(b.x0 - 0.3, 46, PLAZA_C.z, 40, 20, -Math.PI / 2, 'W');
        continue;
      }
      const xs = splitSpan(blk.x0, blk.x1, 3);
      const zs = splitSpan(blk.z0, blk.z1, 3);
      xs.forEach((sx) => zs.forEach((sz) => {
        const inset = chance(0.5) ? 0 : R(0.3, 1.4);
        const b = { x0: sx.a + inset, x1: sx.b - inset, z0: sz.a + inset, z1: sz.b - inset };
        if (b.x1 - b.x0 < 5 || b.z1 - b.z0 < 5) return;
        let h = 10 + Math.pow(rand(), 2.1) * 80;
        h *= 1.55 - 0.75 * Math.min(1, dc);
        if (chance(0.07)) h = R(130, 210);
        if (perimeter) h = R(55, 190);
        h = Math.max(8, Math.round(h / 3.4) * 3.4);
        const seed = rand();
        const tint = pick([[0.2, 0.05, 0.3], [0.03, 0.12, 0.25], [0.1, 0.1, 0.18], [0.0, 0.18, 0.2], [0.25, 0.08, 0.12]]);
        let baseH = h;
        if (h > 48 && chance(0.6)) {
          const h1 = Math.round((h * R(0.45, 0.7)) / 3.4) * 3.4;
          addBox(b.x0, b.x1, b.z0, b.z1, 0, h1, seed, tint);
          const sxw = (b.x1 - b.x0) * R(0.12, 0.25), szw = (b.z1 - b.z0) * R(0.12, 0.25);
          const t2 = { x0: b.x0 + sxw, x1: b.x1 - sxw, z0: b.z0 + szw, z1: b.z1 - szw };
          addBox(t2.x0, t2.x1, t2.z0, t2.z1, h1, h - h1, seed, tint);
          if (chance(0.5)) neonRing(neonList, t2, h - 0.1, 0.22, neonPick(), 0.05);
          baseH = h1;
        } else {
          addBox(b.x0, b.x1, b.z0, b.z1, 0, h, seed, tint);
        }
        if (!perimeter) addFootprint(b, i, j); else footprints.push(b);
        const faces = [];
        if (sx.first) faces.push('W');
        if (sx.last) faces.push('E');
        if (sz.first) faces.push('N');
        if (sz.last) faces.push('S');
        decorate(b, baseH, faces, perimeter, h);
      }));
    }
  }
  // overhead cables (some strung with lanterns) across streets
  const lantern = [NEON.amber, NEON.red, NEON.amber, NEON.pink];
  for (let k = 0; k <= N; k++) {
    for (let j = 0; j < N; j++) {
      for (const axis of ['x', 'z']) {
        const nb = axis === 'x' ? [[k - 1, j], [k, j]] : [[j, k - 1], [j, k]];
        if (nb.some(([a, b2]) => a === PLAZA.i && b2 === PLAZA.j)) continue;
        const nCab = RI(0, 3);
        for (let c = 0; c < nCab; c++) {
          const along = sLine(j) + ST / 2 + R(2, BLK - 2);
          const y0 = R(7, 20), y1 = y0 + R(-2, 2), sag = R(0.6, 2.2);
          const a = sLine(k) - 8.6, bnd = sLine(k) + 8.6;
          const pts = [];
          const segs = 10;
          for (let s = 0; s <= segs; s++) {
            const t = s / segs;
            const across = a + (bnd - a) * t;
            const y = y0 + (y1 - y0) * t - sag * 4 * t * (1 - t);
            pts.push(axis === 'x' ? [across, y, along] : [along, y, across]);
          }
          for (let s = 0; s < segs; s++) cables.push(...pts[s], ...pts[s + 1]);
          if (chance(0.3)) {
            for (let s = 1; s < segs; s++) {
              const p = pts[s];
              strip(neonList, p[0], p[1] - 0.25, p[2], 0.26, 0.34, 0.26, lantern[s % lantern.length]);
            }
          }
        }
      }
    }
  }
}
buildCity();

// ===================== Meshes =====================
const dummy = new THREE.Object3D();
const unitBox = new THREE.BoxGeometry(1, 1, 1);

// buildings
const bGeo = new THREE.BoxGeometry(1, 1, 1);
bGeo.translate(0, 0.5, 0);
const bSeed = new Float32Array(boxes.length);
const bTint = new Float32Array(boxes.length * 3);
const buildingMesh = new THREE.InstancedMesh(bGeo, buildingMat, boxes.length);
boxes.forEach((b, k) => {
  dummy.position.set(b.x, b.y0, b.z); dummy.scale.set(b.w, b.h, b.d); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
  buildingMesh.setMatrixAt(k, dummy.matrix);
  bSeed[k] = (Math.floor(b.seed * 1000) + 0.5) / 1000; bTint.set(b.tint, k * 3);
});
bGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(bSeed, 1));
bGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(bTint, 3));
buildingMesh.frustumCulled = false;
scene.add(buildingMesh);

function stripsMesh(list, mat) {
  const n = list.length / 9;
  const m = new THREE.InstancedMesh(unitBox, mat, Math.max(1, n));
  const col = new THREE.Color();
  for (let k = 0; k < n; k++) {
    const o = k * 9;
    dummy.position.set(list[o], list[o + 1], list[o + 2]);
    dummy.scale.set(list[o + 3], list[o + 4], list[o + 5]);
    dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    m.setMatrixAt(k, dummy.matrix);
    m.setColorAt(k, col.setRGB(list[o + 6], list[o + 7], list[o + 8]));
  }
  m.count = n;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}
const neonMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
const flickMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
stripsMesh(neonList, neonMat);
stripsMesh(flickList, flickMat);
stripsMesh(darkList, new THREE.MeshBasicMaterial({ color: 0x07060c }));

// beacons
const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false });
{
  const n = beacons.length / 3;
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 8, 6), beaconMat, Math.max(1, n));
  for (let k = 0; k < n; k++) { dummy.position.set(beacons[k * 3], beacons[k * 3 + 1], beacons[k * 3 + 2]); dummy.scale.setScalar(1); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix); }
  m.count = n; m.frustumCulled = false; scene.add(m);
}

// signs
const planeGeo = new THREE.PlaneGeometry(1, 1);
function signMeshes(defs, lists) {
  defs.forEach((d, si) => {
    const list = lists[si];
    if (!list.length) return;
    const mat = new THREE.MeshBasicMaterial({ map: d.tex, toneMapped: false });
    const m = new THREE.InstancedMesh(planeGeo, mat, list.length);
    list.forEach((s, k) => {
      dummy.position.set(s.x, s.y, s.z); dummy.rotation.set(0, s.yaw, 0); dummy.scale.set(s.w, s.h, 1); dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
    });
    m.frustumCulled = false;
    scene.add(m);
  });
}
signMeshes(V_SIGNS, signsV);
signMeshes(H_SIGNS, signsH);
signMeshes(H_SIGNS, signsRoof);

// vending machines
{
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#dfe9ff'; g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#ff3b6b'; g.fillRect(0, 0, 64, 18);
  const cans = ['#ff4b4b', '#3ad1ff', '#ffd23a', '#7a5cff', '#2bd38a', '#ff8a2b'];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) { g.fillStyle = cans[(r * 5 + c * 3) % cans.length]; g.fillRect(6 + c * 11, 24 + r * 17, 7, 12); }
  g.fillStyle = '#1b1d2a'; g.fillRect(6, 98, 52, 22);
  g.fillStyle = '#9fffe0'; g.fillRect(44, 102, 10, 4);
  const tex = new THREE.CanvasTexture(cv);
  const side = new THREE.MeshBasicMaterial({ color: 0x8a9ccf });
  const mats = [side, side, new THREE.MeshBasicMaterial({ color: 0x20222e }), side, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), side];
  const geo = new THREE.BoxGeometry(1.2, 1.95, 0.85); geo.translate(0, 0.975, 0);
  const m = new THREE.InstancedMesh(geo, mats, Math.max(1, vendList.length));
  vendList.forEach((v, k) => { dummy.position.set(v.x, 0, v.z); dummy.rotation.set(0, v.yaw, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix); });
  m.count = vendList.length; m.frustumCulled = false; scene.add(m);
}

// cables
{
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(cables, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x0c0a14 }));
  lines.frustumCulled = false;
  scene.add(lines);
}

// ---- Live billboard texture (song title + spectrum) ----
const bbCanvas = document.createElement('canvas'); bbCanvas.width = 512; bbCanvas.height = 256;
const bbCtx = bbCanvas.getContext('2d');
const bbTex = new THREE.CanvasTexture(bbCanvas);
bbTex.anisotropy = maxAniso;
const bbMat = new THREE.MeshBasicMaterial({ map: bbTex, toneMapped: false });
billboards.forEach((b) => {
  const m = new THREE.Mesh(planeGeo, bbMat);
  m.position.set(b.x, b.y, b.z); m.rotation.set(0, b.yaw, 0); m.scale.set(b.w, b.h, 1);
  scene.add(m);
});

// ---- Ground ----
const GROUND_SIZE = (N + 4) * P;
const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
let reflector = null;
if (HAS_REFLECT) {
  reflector = new THREE.Reflector(groundGeo, {
    textureWidth: 512, textureHeight: 512, multisample: 0, clipBias: 0.003,
    shader: { uniforms: GROUND_UNIFORMS, vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG },
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.material.extensions = { derivatives: true };
  scene.add(reflector);
}
const plainGround = new THREE.Mesh(groundGeo, new THREE.ShaderMaterial({
  defines: { NO_REFLECT: 1 },
  uniforms: THREE.UniformsUtils.clone(GROUND_UNIFORMS),
  vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG,
}));
plainGround.rotation.x = -Math.PI / 2;
scene.add(plainGround);
const groundUniformSets = [plainGround.material.uniforms].concat(reflector ? [reflector.material.uniforms] : []);

// ---- Rain (GPU-animated streaks that wrap around the camera) ----
const RAIN_N = isTouch ? 1800 : 3200;
const rainMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } },
  vertexShader: `
    attribute vec3 aOff; attribute float aEnd;
    uniform float uTime; uniform vec3 uCam;
    varying float vA;
    void main(){
      vec3 B = vec3(70.0, 46.0, 70.0);
      vec3 p;
      float sp = 26.0 * (0.85 + 0.3 * fract(aOff.x * 7.13));
      p.y = mod(aOff.y - uTime * sp, B.y) + uCam.y - 14.0;
      p.xz = uCam.xz + mod(aOff.xz - uCam.xz, B.xz) - B.xz * 0.5;
      p.y += aEnd * 0.95;
      p.x += aEnd * 0.14;
      vec4 mv = viewMatrix * vec4(p, 1.0);
      float d = length(mv.xyz);
      vA = 0.3 * (1.0 - smoothstep(12.0, 34.0, d)) * smoothstep(0.6, 2.5, d) * (0.35 + 0.65 * aEnd) * step(0.0, p.y);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.72, 0.8, 1.0, vA); }`,
});
{
  const off = new Float32Array(RAIN_N * 2 * 3), end = new Float32Array(RAIN_N * 2), pos = new Float32Array(RAIN_N * 2 * 3);
  for (let k = 0; k < RAIN_N; k++) {
    const x = Math.random() * 70, y = Math.random() * 46, z = Math.random() * 70;
    off.set([x, y, z, x, y, z], k * 6);
    end[k * 2] = 0; end[k * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aOff', new THREE.BufferAttribute(off, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const rain = new THREE.LineSegments(geo, rainMat);
  rain.frustumCulled = false;
  rain.renderOrder = 10;
  scene.add(rain);
}

// ---- Plaza hologram ----
const holo = new THREE.Group();
holo.position.set(PLAZA_C.x, 0, PLAZA_C.z);
scene.add(holo);
const holoKnot = new THREE.Mesh(new THREE.TorusKnotGeometry(6, 1.4, 96, 7, 2, 3),
  new THREE.MeshBasicMaterial({ color: 0x2fc8ff, wireframe: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
holoKnot.position.y = 22;
holo.add(holoKnot);
const holoCore = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1),
  new THREE.MeshBasicMaterial({ color: 0xff40c8, wireframe: true, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
holoCore.position.y = 22;
holo.add(holoCore);
const beamMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform float uTime; uniform float uPulse; varying vec2 vUv;
    void main(){ float a = (1.0 - vUv.y) * 0.22 * (0.7 + 0.3 * sin(vUv.y * 40.0 - uTime * 6.0)) * (0.8 + uPulse);
      gl_FragColor = vec4(vec3(0.3, 0.9, 1.0) * a, a); }`,
});
const beam = new THREE.Mesh(new THREE.CylinderGeometry(7, 3.2, 24, 40, 1, true), beamMat);
beam.position.y = 13;
holo.add(beam);
const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 1.1, 40), new THREE.MeshBasicMaterial({ color: 0x0b0a14 }));
pedestal.position.y = 0.55;
holo.add(pedestal);
const pedRing = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.09, 6, 64), new THREE.MeshBasicMaterial({ color: 0x45f0ff, toneMapped: false }));
pedRing.rotation.x = Math.PI / 2; pedRing.position.y = 1.1;
holo.add(pedRing);
// plaza benches / planters ring
for (let k = 0; k < 6; k++) {
  const a = (k / 6) * Math.PI * 2 + 0.3;
  const x = PLAZA_C.x + Math.cos(a) * 15, z = PLAZA_C.z + Math.sin(a) * 15;
  const bench = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: 0x0e0c18 }));
  bench.position.set(x, 0.3, z); bench.scale.set(3.4, 0.6, 1.0); bench.rotation.y = -a + Math.PI / 2;
  scene.add(bench);
  const edge = new THREE.Mesh(unitBox, neonMat);
  edge.position.set(x, 0.62, z); edge.scale.set(3.4, 0.05, 0.08); edge.rotation.y = -a + Math.PI / 2;
  scene.add(edge);
}

// ---- Flying cars ----
const CAR_N = 64;
const cars = [];
for (let k = 0; k < CAR_N; k++) {
  const axis = chance(0.5) ? 'x' : 'z';
  const lane = sLine(RI(0, N)) + R(-3, 3);
  cars.push({ axis, lane, alt: pick([28, 38, 52, 68, 85]) + R(-3, 3), pos: R(-HALF - P, HALF + P), speed: R(14, 34) * (chance(0.5) ? 1 : -1), col: neonPick() });
}
const carBody = new THREE.InstancedMesh(unitBox, new THREE.MeshBasicMaterial({ color: 0x13111d }), CAR_N);
const carHead = new THREE.InstancedMesh(unitBox, new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false }), CAR_N);
const carTail = new THREE.InstancedMesh(unitBox, new THREE.MeshBasicMaterial({ color: 0xff2a3a, toneMapped: false }), CAR_N);
const carGlow = new THREE.InstancedMesh(unitBox, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), CAR_N);
{
  const c = new THREE.Color();
  cars.forEach((car, k) => carGlow.setColorAt(k, c.setRGB(...car.col)));
}
[carBody, carHead, carTail, carGlow].forEach((m) => { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); });
function setCar(mesh, k, car, off, sx, sy, sz, yOff) {
  const d = Math.sign(car.speed);
  if (car.axis === 'x') { dummy.position.set(car.pos + off * d, car.alt + yOff, car.lane); dummy.scale.set(sx, sy, sz); }
  else { dummy.position.set(car.lane, car.alt + yOff, car.pos + off * d); dummy.scale.set(sz, sy, sx); }
  dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
  mesh.setMatrixAt(k, dummy.matrix);
}
function updateCars(dt) {
  const lim = HALF + P * 1.5;
  cars.forEach((car, k) => {
    car.pos += car.speed * dt;
    if (car.pos > lim) car.pos -= lim * 2;
    if (car.pos < -lim) car.pos += lim * 2;
    setCar(carBody, k, car, 0, 4.6, 1.1, 2.1, 0);
    setCar(carHead, k, car, 2.33, 0.08, 0.28, 1.7, 0.05);
    setCar(carTail, k, car, -2.33, 0.08, 0.22, 1.9, 0.12);
    setCar(carGlow, k, car, 0, 3.8, 0.06, 1.7, -0.6);
  });
  carBody.instanceMatrix.needsUpdate = carHead.instanceMatrix.needsUpdate = carTail.instanceMatrix.needsUpdate = carGlow.instanceMatrix.needsUpdate = true;
}
updateCars(0);
