// Hollowmere — the village: terrain, buildings, props, forest, colliders, pages

const STORY = [
  { t: 'Notice — Village Council', b: 'By order of the Council:\nNo soul is to pass the treeline after dusk.\nShutters to be barred. Lamps to burn until dawn.\n\nThe search for young Thomas Abbott is ended. May God keep him.\n\n— Elder J. Crane, 3rd October 1888' },
  { t: 'Diary — Martha Abbott', b: '21st Sept.\nThomas says there is a man who stands in the trees behind the privy. Taller than the door, he says, with arms down to his knees and no face at all.\n\nI told him it was the dead pine.\n\nHe said the dead pine waves back.' },
  { t: 'Hollowmere Timber Co. — Ledger', b: '9th Sept. Felled the great white oak at the Hollow, for the new church beams. Eleven men, two days. Hard as iron.\n\n10th Sept. Men will not burn the stump. Jacob Reeve swears it bled when the saw went in. Docked his wages for drink.' },
  { t: 'A letter, never sent', b: 'Margaret —\nI shan\'t stay another night. The landlord nails his shutters at sundown and leaves a plate of bread and salt by the door "for the tall gentleman."\n\nLast night the church bell rang at midnight with no one in the tower.\n\nI\'ll come home by the coach road.\n— Your loving Edwin' },
  { t: 'Pell\'s Dry Goods — Day Book', b: 'Sold out: lamp oil, candles, nails, salt.\n\nMrs. Pell bought every candle I had and asked would the light keep him off. I said I hadn\'t the faintest.\n\nTruth is he doesn\'t mind the light. He minds being watched. Never look at him for long, they say. It makes the head ring like a bell.' },
  { t: 'Scrawled on a sexton\'s chit', b: 'We dug them up to be sure.\n\nEvery coffin we buried this autumn — the Hollis girl, both Pell boys, old Reeve — every one of them empty, and packed tight with white oak roots.\n\nReverend says we are to tell no one.' },
  { t: 'Case notes — Dr. H. Lowell', b: '11th Oct. Seven more walking in their sleep, always toward the Hollow. On waking each says the same words: "He only takes back what was taken from him."\n\nThe Abbott girl said it in a voice I did not recognise.\n\nI have lit a candle in the window. For my own sake.' },
  { t: 'To whoever comes after', b: 'The beams of this church were cut from his tree. We built our house of God out of his body, and he has come for what we owe.\n\nThe Council believes the bell keeps him off. It does not. The bell calls us to him.\n\nTonight we ring it together and walk into the trees, all of us, to give back what was taken.\n\nIf you have found this, leave by the coach road and do not look back. Or ring the bell, and come find us.\n\n— Rev. Ambrose Hale' },
];

const boxes = [];   // [x0, z0, x1, z1, blocksSight]
const circles = []; // [x, z, r]
const roofs = [];   // covered areas: [x0, z0, x1, z1]
const inter = [];   // pages and the bell rope

function groundH(x, z) {
  let k = smooth(42, 68, Math.hypot(x, z));
  if (z > 0) k *= smooth(3, 7, Math.abs(x)); // keep the coach road flat
  if (k <= 0) return 0;
  return k * ((vnoise(x * 0.05 + 10, z * 0.05) - 0.5) * 5 + (vnoise(x * 0.21, z * 0.21 + 5) - 0.5) * 1.0);
}
function inBounds(x, z) { return x * x + z * z < 63 * 63 || (Math.abs(x) < 4 && z > 0 && z < 93); }
function inRoof(x, z) { for (const r of roofs) if (x > r[0] && x < r[2] && z > r[1] && z < r[3]) return true; return false; }
function pointBlocked(x, z, r) {
  for (const b of boxes) if (x > b[0] - r && x < b[2] + r && z > b[1] - r && z < b[3] + r) return true;
  for (const c of circles) if (Math.hypot(x - c[0], z - c[1]) < c[2] + r) return true;
  return false;
}

function aabbLocal(x0, z0, x1, z1) {
  const pts = [tp(x0, 0, z0), tp(x1, 0, z0), tp(x1, 0, z1), tp(x0, 0, z1)];
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[2])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[2]))];
}
function colLocal(x0, z0, x1, z1, opaque = false) { boxes.push([...aabbLocal(x0, z0, x1, z1), opaque]); }
function circLocal(x, z, r) { const p = tp(x, 0, z); circles.push([p[0], p[2], r]); }

// ---------- pages ----------
function page(id, x, y, z, facing = 'up') {
  const g = new Geo({ ao: false });
  if (facing === 'up') plane(g, [x - 0.13, y, z + 0.17], [0.26, 0, 0], [0, 0, -0.34], { tsu: 0.26, tsv: 0.34, seg: 9 });
  else if (facing === 's' || facing === 'n') decal(g, facing, x, y - 0.17, 0.26, 0.34, z);
  else decal(g, facing, z, y - 0.17, 0.26, 0.34, x);
  const mesh = g.build(MAT.paper);
  scene.add(mesh);
  inter.push({ kind: 'page', id, pos: tp(x, y, z), mesh, taken: false });
}

// ---------- props (local coordinates, current TF) ----------
const WOOD = [0.8, 0.68, 0.58];
function table(x, z, w, d, h = 0.78) {
  const g = G('planks');
  box(g, x, h - 0.06, z, w, 0.06, d, { ts: 1, col: WOOD, skip: '' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, x + sx * (w / 2 - 0.07), 0, z + sz * (d / 2 - 0.07), 0.07, h - 0.06, 0.07, { ts: 1, col: WOOD });
  colLocal(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  return h;
}
function chair(x, z, back = 1) {
  const g = G('planks');
  box(g, x, 0.44, z, 0.42, 0.05, 0.42, { ts: 1, col: WOOD, skip: '' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, x + sx * 0.18, 0, z + sz * 0.18, 0.05, 0.44, 0.05, { ts: 1, col: WOOD });
  box(g, x, 0.49, z + back * 0.19, 0.42, 0.5, 0.05, { ts: 1, col: WOOD });
}
function bed(x, z, w = 1.0, d = 2.0) {
  box(G('planks'), x, 0, z, w, 0.35, d, { ts: 1, col: WOOD });
  box(G('linen'), x, 0.35, z + 0.05, w - 0.08, 0.14, d - 0.2, { ts: 1, col: [0.9, 0.75, 0.7] });
  box(G('linen'), x, 0.49, z - d / 2 + 0.3, w * 0.6, 0.1, 0.32, { ts: 1 });
  box(G('planks'), x, 0, z - d / 2 + 0.03, w, 0.95, 0.06, { ts: 1, col: WOOD });
  colLocal(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
}
function shelf(x, z, w, d, h) {
  // along x: faces +z (back walls); along z: faces +x (west walls)
  const g = G('planks'), col = [0.6, 0.5, 0.42], along = w > d, n = Math.floor((along ? w : d) / 0.3);
  box(g, x, 0, z, w, h, d, { ts: 1, col });
  for (let y = 0.5, row = 0; y < h - 0.3; y += 0.55, row++) {
    const lx = along ? x : x + w / 2 + 0.1, lz = along ? z + d / 2 + 0.1 : z;
    box(g, lx, y - 0.04, lz, along ? w : 0.2, 0.04, along ? 0.2 : d, { ts: 1, col: WOOD, skip: '' });
    for (let i = 0; i < n; i++) {
      const hv = hash2(i * 7 + row * 31, Math.round((x + z) * 10));
      if (hv < 0.35) continue;
      const t = (i + 0.5) / n - 0.5, k = 0.5 + hv;
      box(G('iron'), along ? x + t * w : lx, y, along ? lz : z + t * d, 0.12, 0.16 + 0.12 * hv, 0.12, { ts: 0.5, col: [k * 1.5, k * 1.1, k * 0.7], skip: 'b' });
    }
  }
  colLocal(x - w / 2, z - d / 2, x + w / 2 + (along ? 0 : 0.2), z + d / 2 + (along ? 0.2 : 0));
}
function counter(x, z, w, d, h = 1.0) {
  box(G('planks'), x, 0, z, w, h, d, { ts: 1, col: [0.62, 0.5, 0.42] });
  box(G('planks'), x, h, z, w + 0.1, 0.05, d + 0.1, { ts: 1, col: WOOD, skip: '' });
  colLocal(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  return h + 0.05;
}
function barrel(x, z, s = 1) {
  cyl(G('planks'), x, 0, z, 0.32 * s, 0.3 * s, 0.9 * s, 8, { top: true, col: [0.7, 0.56, 0.46], ts: 1, ur: 2 });
  circLocal(x, z, 0.36 * s);
}
function crate(x, z, s, y0 = 0) {
  box(G('planks'), x, y0, z, s, s, s, { tsu: s, tsv: s, col: [0.95, 0.8, 0.6], skip: '' });
  if (y0 === 0) colLocal(x - s / 2, z - s / 2, x + s / 2, z + s / 2);
}
function fireplace(x, z, w, topY) {
  box(G('stone'), x, 0, z, w, 1.2, 0.6, { ts: 1.5 });
  decal(G('hole'), 's', x, 0.04, w * 0.55, 0.72, z + 0.31);
  box(G('stone'), x, 1.2, z - 0.05, w * 0.6, topY - 1.2, 0.45, { ts: 1.5 });
  colLocal(x - w / 2, z - 0.3, x + w / 2, z + 0.3);
}
function pew(x, z, w) {
  const g = G('planks'), col = [0.55, 0.42, 0.34];
  box(g, x, 0.42, z, w, 0.06, 0.45, { ts: 1, col, skip: '' });
  box(g, x, 0, z + 0.22, w, 1.0, 0.06, { ts: 1, col });
  box(g, x - w / 2 + 0.03, 0, z, 0.06, 0.48, 0.45, { ts: 1, col });
  box(g, x + w / 2 - 0.03, 0, z, 0.06, 0.48, 0.45, { ts: 1, col });
  colLocal(x - w / 2, z - 0.25, x + w / 2, z + 0.27);
}
function lamppost(x, z) {
  limb(G('iron'), [x, 0, z], [x, 3.1, z], 0.06, 4);
  limb(G('iron'), [x, 2.9, z], [x + 0.55, 2.9, z], 0.03, 4);
  box(G('iron'), x + 0.55, 2.75, z, 0.24, 0.05, 0.24, { ts: 0.5, skip: '' });
  for (const f of ['s', 'n']) decal(G('window'), f, x + 0.55, 2.4, 0.2, 0.34, z + (f === 's' ? 0.1 : -0.1));
  circLocal(x, z, 0.15);
}
function fenceRun(x0, z0, x1, z1, seed) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.2)), g = G('planks'), col = [0.7, 0.62, 0.55];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t);
    if (hash2(i, seed) < 0.12) continue;
    limb(g, [x, 0, z], [x, 1.05, z], 0.06, 4, { col });
    if (i < n && hash2(i, seed + 1) > 0.15) {
      const xb = lerp(x0, x1, (i + 1) / n), zb = lerp(z0, z1, (i + 1) / n);
      limb(g, [x, 0.45, z], [xb, 0.45, zb], 0.035, 4, { col });
      if (hash2(i, seed + 2) > 0.3) limb(g, [x, 0.9, z], [xb, 0.92 - hash2(i, seed + 3) * 0.5, zb], 0.035, 4, { col });
    }
  }
  colLocal(Math.min(x0, x1) - 0.08, Math.min(z0, z1) - 0.08, Math.max(x0, x1) + 0.08, Math.max(z0, z1) + 0.08);
}
function deadTree(x, z, s) {
  const y = groundH(x, z), g = G('bark'), col = [0.7, 0.66, 0.62];
  cyl(g, x, y - 0.2, z, 0.3 * s, 0.1 * s, 5.4 * s, 6, { col, ts: 2 });
  const nb = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < nb; i++) {
    const a = rand() * TAU, hy = y + rr(2, 4.6) * s, L = rr(1.2, 2.4) * s;
    const end = [x + Math.cos(a) * L, hy + rr(0.6, 1.6) * s, z + Math.sin(a) * L];
    limb(g, [x, hy, z], end, 0.09 * s, 4, { r1: 0.02, col });
    const a2 = a + rr(-0.9, 0.9);
    limb(g, end, [end[0] + Math.cos(a2) * L * 0.5, end[1] + rr(0.2, 0.8), end[2] + Math.sin(a2) * L * 0.5], 0.03, 3, { r1: 0.01, col });
  }
  circles.push([x, z, 0.3 * s]);
}
function pine(x, z, s, collide) {
  const y = groundH(x, z), k = 0.75 + rand() * 0.5, col = [k, k * (0.9 + rand() * 0.2), k];
  const ck = '#' + Math.floor(x / 40) + ',' + Math.floor(z / 40);
  cyl(G('bark' + ck), x, y - 0.2, z, 0.28 * s, 0.14 * s, 2.4 * s, 5, { ts: 2 });
  const tiers = [[1.1, 2.0, 3.0], [2.6, 1.55, 2.7], [4.0, 1.0, 2.5]];
  for (const [ty, r, h] of tiers) cyl(G('pine' + ck), x, y + ty * s, z, r * s, 0, h * s, 7, { col, bottom: true, ts: 1.5, ur: 3 });
  if (collide) circles.push([x, z, 0.35 * s]);
}

// ---------- buildings ----------
function roof(gr, gg, hw, hd, h, ov, pitch, gcol) {
  const two = { ts: 2, two: true };
  let rh;
  if (hd >= hw) {
    rh = hw * pitch; const L = 2 * (hd + ov), dy = ov * pitch;
    plane(gr, [-hw - ov, h - dy, -hd - ov], [0, 0, L], [hw + ov, rh + dy, 0], two);
    plane(gr, [hw + ov, h - dy, hd + ov], [0, 0, -L], [-(hw + ov), rh + dy, 0], two);
    for (const s of [1, -1]) {
      const a = [-hw * s, h, hd * s], b = [hw * s, h, hd * s], c = [0, h + rh, hd * s];
      const ua = [a[0] / 2, a[1] / 2], ub = [b[0] / 2, b[1] / 2], uc = [0, c[1] / 2];
      gg.tri(a, b, c, ua, ub, uc, gcol); gg.tri(a, c, b, ua, uc, ub, gcol);
    }
  } else {
    rh = hd * pitch; const L = 2 * (hw + ov), dy = ov * pitch;
    plane(gr, [hw + ov, h - dy, -hd - ov], [-L, 0, 0], [0, rh + dy, hd + ov], two);
    plane(gr, [-hw - ov, h - dy, hd + ov], [L, 0, 0], [0, rh + dy, -(hd + ov)], two);
    for (const s of [1, -1]) {
      const a = [hw * s, h, hd * s], b = [hw * s, h, -hd * s], c = [hw * s, h + rh, 0];
      const ua = [a[2] / 2, a[1] / 2], ub = [b[2] / 2, b[1] / 2], uc = [0, c[1] / 2];
      gg.tri(a, b, c, ua, ub, uc, gcol); gg.tri(a, c, b, ua, uc, ub, gcol);
    }
  }
  return rh;
}

function building(o) {
  const { w, d, h } = o, t = 0.22, dw = o.door || 1.5, dh = Math.min(2.3, h - 0.4);
  const hw = w / 2, hd = d / 2, wall = G(o.wall || 'planks'), wt = o.wall === 'stone' ? 2.5 : 2, wcol = o.col || W1;
  setTF(o.x, o.z, o.rot * Math.PI / 2);
  plane(G('floor'), [-hw, 0.03, hd], [w, 0, 0], [0, 0, -d], { ts: 2.5, col: [0.8, 0.75, 0.7] });
  const wb = (cx, cz, bw, bd, y0 = 0, bh = h) => {
    box(wall, cx, y0, cz, bw, bh, bd, { ts: wt, col: wcol });
    if (y0 < 1) colLocal(cx - bw / 2, cz - bd / 2, cx + bw / 2, cz + bd / 2, true);
  };
  const sw = (w - dw) / 2;
  wb(0, -hd + t / 2, w, t);
  wb(-hw + t / 2, 0, t, d - 2 * t);
  wb(hw - t / 2, 0, t, d - 2 * t);
  wb(-hw + sw / 2, hd - t / 2, sw, t);
  wb(hw - sw / 2, hd - t / 2, sw, t);
  wb(0, hd - t / 2, dw, t, dh, h - dh);
  // door left open, swung inward against the jamb
  box(G('door'), -dw / 2 + 0.06, 0, hd - t - dw / 2, 0.06, dh, dw - 0.05, { tsu: dw, tsv: dh, skip: '' });
  colLocal(-dw / 2 + 0.02, hd - t - dw, -dw / 2 + 0.1, hd - t);
  const opp = { s: 'n', n: 's', e: 'w', w: 'e' };
  const outer = { s: hd + 0.02, n: -hd - 0.02, e: hw + 0.02, w: -hw - 0.02 };
  const inner = { s: hd - t - 0.02, n: -hd + t + 0.02, e: hw - t - 0.02, w: -hw + t + 0.02 };
  const [ww, wh, wy] = o.winSize || [1.0, 1.2, 1.0];
  for (const [f, a, kind] of o.win || []) {
    decal(G(kind || 'window'), f, a, wy, ww, wh, outer[f]);
    decal(G(kind || 'window'), opp[f], a, wy, ww, wh, inner[f]);
  }
  const rh = roof(G(o.roof || 'shingle'), wall, hw, hd, h, 0.45, o.pitch || 0.75, wcol);
  roofs.push(aabbLocal(-hw, -hd, hw, hd));
  if (o.inside) o.inside(hw, hd, h, t, rh);
  clearTF();
}

function buildWorld() {
  // ground, roads and the square
  for (let gx = -112; gx < 112; gx += 56) for (let gz = -112; gz < 112; gz += 56)
    terrain(G('grass#' + gx + ',' + gz, { ao: false }), gx, gz, gx + 56, gz + 56, 3, 4, 0);
  const mud = G('mud', { ao: false });
  terrain(mud, -2.4, 13, 2.4, 96, 2.4, 3, 0.05);
  terrain(mud, -1.6, -27.6, 1.6, -12.5, 2, 3, 0.05);
  terrain(mud, -20.6, -1.6, -12.5, 1.6, 2, 3, 0.05);
  terrain(mud, 12.5, -1.6, 21.1, 1.6, 2, 3, 0.05);
  disc(mud, 0, 0, 13.5, 0.06, 3);
  G('hole', { ao: false });

  // --- church (north) ---
  building({
    x: 0, z: -36, rot: 0, w: 10, d: 18, h: 6, wall: 'stone', door: 2.0, pitch: 0.75,
    win: [['e', -5, 'stained'], ['e', 0, 'stained'], ['e', 5, 'stained'], ['w', -5, 'stained'], ['w', 0, 'stained'], ['w', 5, 'stained']],
    winSize: [1.1, 2.6, 1.7],
    inside(hw, hd, h, t, rh) {
      for (let z = -3.5; z <= 5; z += 1.5) { pew(-2.4, z, 3.2); pew(2.4, z, 3.2); }
      box(G('stone'), 0, 0, -hd + 1.7, 2.4, 1.0, 1.0, { ts: 1 });
      colLocal(-1.2, -hd + 1.2, 1.2, -hd + 2.2);
      page(7, 0.3, 1.01, -hd + 1.7);
      for (const sx of [-0.9, 0.9]) limb(G('iron'), [sx, 1.0, -hd + 1.6], [sx, 1.45, -hd + 1.6], 0.03, 4);
      box(G('planks'), 0, 1.4, -hd + t + 0.06, 0.18, 2.6, 0.1, { ts: 1, col: [0.5, 0.4, 0.34], skip: '' });
      box(G('planks'), 0, 3.25, -hd + t + 0.06, 1.3, 0.18, 0.1, { ts: 1, col: [0.5, 0.4, 0.34], skip: '' });
      box(G('planks'), -3.2, 0, -hd + 3.6, 0.6, 1.15, 0.5, { ts: 1, col: WOOD });
      colLocal(-3.5, -hd + 3.35, -2.9, -hd + 3.85);
      // bell rope hangs from the belfry, just inside the doors
      const rz = hd - 1.6;
      limb(G('linen'), [0, 0.85, rz], [0, h + rh, rz], 0.03, 4, { col: [1.2, 1.0, 0.7] });
      limb(G('linen'), [0, 0.75, rz], [0, 0.95, rz], 0.06, 4, { col: [1.2, 1.0, 0.7] });
      inter.push({ kind: 'rope', pos: tp(0, 1.3, rz) });
      // belfry and spire over the front gable
      const yb = h + rh, bz = hd - 1.6;
      box(G('stone'), 0, yb - 1.8, bz, 2.6, 1.8, 2.6, { ts: 2.5 });
      box(G('stone'), 0, yb, bz, 2.9, 0.25, 2.9, { ts: 2.5, skip: '' });
      for (const sx of [-1.15, 1.15]) for (const sz of [-1.15, 1.15]) box(G('stone'), sx, yb + 0.25, bz + sz, 0.4, 2.3, 0.4, { ts: 2.5 });
      box(G('stone'), 0, yb + 2.55, bz, 2.9, 0.25, 2.9, { ts: 2.5, skip: '' });
      cyl(G('iron'), 0, yb + 1.0, bz, 0.6, 0.32, 0.95, 10, { top: true });
      const ya = yb + 2.8, apex = [0, ya + 5.5, bz];
      const cs = [[-1.45, -1.45], [1.45, -1.45], [1.45, 1.45], [-1.45, 1.45]];
      for (let i = 0; i < 4; i++) {
        const a = [cs[i][0], ya, bz + cs[i][1]], b = [cs[(i + 1) % 4][0], ya, bz + cs[(i + 1) % 4][1]];
        G('shingle').tri(a, b, apex, [0, 0], [1.5, 0], [0.75, 3], W1, [0, ya + 1, bz]);
      }
      limb(G('iron'), [0, ya + 5.4, bz], [0, ya + 6.6, bz], 0.05, 4);
      limb(G('iron'), [-0.4, ya + 6.2, bz], [0.4, ya + 6.2, bz], 0.05, 4);
    },
  });

  // --- inn (west) ---
  building({
    x: -25, z: 2, rot: 1, w: 12, d: 9, h: 5, door: 1.6,
    win: [['s', -4], ['s', 4], ['n', -3], ['n', 3], ['e', 0, 'boarded'], ['w', 0, 'boarded']],
    inside(hw, hd, h, t) {
      const ct = counter(0, -hd + 1.4, 6.5, 0.6);
      shelf(0, -hd + t + 0.18, 6.5, 0.3, 2.2);
      barrel(-hw + 0.7, -hd + 0.7); barrel(hw - 0.7, -hd + 0.7); barrel(hw - 0.7, -hd + 1.5, 0.9);
      limb(G('iron'), [-1.8, ct, -hd + 1.4], [-1.8, ct + 0.22, -hd + 1.4], 0.05, 6, { r1: 0.03 });
      for (const [tx, tz] of [[-3, 0.6], [3, 0.6], [-3.2, 2.7]]) {
        const th = table(tx, tz, 1.3, 1.1);
        chair(tx, tz - 0.8, -1); chair(tx, tz + 0.8, 1);
        if (tx === 3) page(3, tx + 0.2, th + 0.01, tz - 0.1);
      }
      // bread and salt "for the tall gentleman"
      cyl(G('linen'), 1.4, 0, hd - 0.75, 0.22, 0.24, 0.04, 8, { top: true });
      ellipsoid(G('dirt'), 1.35, 0.1, hd - 0.75, 0.13, 0.07, 0.09, 6, 4, [2.6, 1.9, 1.3]);
      cyl(G('linen'), 1.52, 0.04, hd - 0.68, 0.05, 0, 0.07, 6, { col: [1.8, 1.8, 1.8] });
    },
  });

  // --- general store (east) ---
  building({
    x: 25, z: 2, rot: 3, w: 10, d: 8, h: 4.2, door: 1.5,
    win: [['s', -3], ['s', 3], ['e', 1], ['w', -1, 'boarded']],
    inside(hw, hd, h, t) {
      const ct = counter(0, -0.8, 4.6, 0.7);
      page(4, 0.9, ct + 0.01, -0.8);
      shelf(0, -hd + t + 0.2, hw * 2 - 1, 0.35, 2.4);
      shelf(-hw + t + 0.2, 0.5, 0.35, 3.0, 2.0);
      barrel(hw - 0.8, hd - 1.2); barrel(hw - 0.8, hd - 2.0, 0.85);
      crate(-hw + 1.0, hd - 1.0, 0.7); crate(-hw + 1.0, hd - 1.0, 0.55, 0.7); crate(-hw + 1.8, hd - 1.0, 0.6);
      for (let i = 0; i < 4; i++) ellipsoid(G('linen'), 2.6 + (i % 2) * 0.55, 0.3, -hd + 1.4 + Math.floor(i / 2) * 0.6, 0.26, 0.3, 0.22, 6, 4, [0.85, 0.75, 0.6]);
    },
  });

  // --- the Abbott house (page 2) ---
  building({
    x: -19, z: -20, rot: 1, w: 7, d: 6, h: 3.2,
    win: [['s', 2.2], ['n', 0], ['e', 0], ['w', 0]],
    inside(hw, hd, h, t, rh) {
      bed(-hw + 0.8, -hd + 1.25, 0.9, 1.7);
      // a rag doll on the child's bed
      ellipsoid(G('linen'), -hw + 0.8, 0.62, -hd + 1.0, 0.07, 0.08, 0.07, 5, 4, [1.1, 1.0, 0.9]);
      limb(G('cloth'), [-hw + 0.8, 0.5, -hd + 1.0], [-hw + 0.8, 0.55, -hd + 1.3], 0.06, 4, { col: [3, 2, 2] });
      fireplace(1.4, -hd + t + 0.3, 1.4, h + rh + 0.4);
      const th = table(1.2, 0.3, 1.2, 0.8);
      chair(1.2, -0.5, -1); chair(1.2, 1.1, 1);
      page(1, 1.1, th + 0.01, 0.3);
    },
  });

  // --- doctor's house (page 7) — a candle still burns in the window ---
  building({
    x: 19, z: 24, rot: 3, w: 8, d: 7, h: 3.4,
    win: [['s', 2.6, 'windowLit'], ['n', -1.5], ['n', 1.5], ['e', 0], ['w', 0]],
    inside(hw, hd, h, t, rh) {
      const th = table(-hw + 1.2, -hd + 1.0, 1.4, 0.7);
      chair(-hw + 1.2, -hd + 1.7, 1);
      page(6, -hw + 1.0, th + 0.01, -hd + 1.0);
      bed(hw - 0.8, -hd + 1.3);
      shelf(-hw + t + 0.2, 1.0, 0.35, 2.0, 2.0);
      cyl(G('linen'), 2.6, 0.9, hd - t - 0.15, 0.035, 0.035, 0.18, 5, { top: true });
      ellipsoid(G('flame'), 2.6, 1.13, hd - t - 0.15, 0.025, 0.05, 0.025, 4, 3, [1, 0.75, 0.35]);
      box(G('planks'), 2.6, 0.84, hd - t - 0.15, 1.1, 0.06, 0.25, { ts: 1, col: WOOD, skip: '' });
    },
  });

  // --- empty houses ---
  building({
    x: -19, z: 24, rot: 1, w: 7, d: 6, h: 3.2,
    win: [['s', 2.2, 'boarded'], ['n', 0], ['e', 1], ['w', 0, 'boarded']],
    inside(hw, hd, h, t, rh) {
      fireplace(-1.0, -hd + t + 0.3, 1.4, h + rh + 0.4);
      bed(hw - 0.75, -hd + 1.25);
      table(-1.2, 1.0, 1.1, 0.8); chair(-1.2, 1.7, 1);
    },
  });
  building({
    x: 31, z: -16, rot: 3, w: 6, d: 6, h: 3.0,
    win: [['s', 1.8], ['n', 0, 'boarded'], ['e', 0], ['w', 0]],
    inside(hw, hd, h, t, rh) {
      fireplace(0.8, -hd + t + 0.3, 1.3, h + rh + 0.4);
      table(-1.2, 0, 1.0, 1.0); chair(-1.2, 0.75, 1);
      crate(1.8, 1.6, 0.6);
    },
  });

  // --- the square: well and notice board (page 1) ---
  cyl(G('stone'), 0, 0, 0, 1.1, 1.1, 0.8, 10, { ts: 1.5, ur: 3 });
  disc(G('hole'), 0, 0, 0.95, 0.72, 1, 1, 10);
  for (const s of [-1, 1]) limb(G('planks'), [s * 1.0, 0, 0], [s * 1.0, 2.3, 0], 0.08, 4, { col: WOOD });
  limb(G('planks'), [-1.15, 2.1, 0], [1.15, 2.1, 0], 0.06, 6, { col: WOOD });
  plane(G('shingle'), [1.35, 2.15, -0.9], [-2.7, 0, 0], [0, 0.45, 0.9], { two: true, ts: 1.5 });
  plane(G('shingle'), [-1.35, 2.15, 0.9], [2.7, 0, 0], [0, 0.45, -0.9], { two: true, ts: 1.5 });
  limb(G('linen'), [0.2, 2.1, 0], [0.2, 1.25, 0], 0.015, 3);
  cyl(G('planks'), 0.2, 1.0, 0, 0.15, 0.17, 0.25, 6, { col: WOOD, ts: 1 });
  circles.push([0, 0, 1.3]);

  setTF(6, 6.5, 0);
  for (const s of [-0.9, 0.9]) limb(G('planks'), [s, 0, 0], [s, 2.4, 0], 0.07, 4, { col: WOOD });
  box(G('planks'), 0, 1.0, 0, 2.0, 1.1, 0.08, { ts: 1, col: [0.6, 0.5, 0.4], skip: '' });
  plane(G('shingle'), [1.2, 2.25, -0.35], [-2.4, 0, 0], [0, 0.25, 0.4], { two: true, ts: 1.5 });
  plane(G('shingle'), [-1.2, 2.25, 0.45], [2.4, 0, 0], [0, 0.25, -0.4], { two: true, ts: 1.5 });
  for (const [px, py] of [[-0.6, 1.6], [-0.3, 1.35], [0.7, 1.75]]) decal(G('oldpaper'), 's', px, py, 0.3, 0.4, 0.045, { col: [0.55, 0.5, 0.42] });
  page(0, 0.3, 1.55, 0.05, 's');
  colLocal(-1.0, -0.1, 1.0, 0.1);
  clearTF();

  // abandoned cart
  setTF(-8, 9.5, 0.45);
  box(G('planks'), 0, 0.6, 0, 1.4, 0.1, 2.4, { ts: 1, col: WOOD, skip: '' });
  for (const s of [-1, 1]) box(G('planks'), s * 0.68, 0.7, 0, 0.06, 0.35, 2.4, { ts: 1, col: WOOD, skip: '' });
  for (const sx of [-1, 1]) for (const sz of [-0.7, 0.7]) limb(G('planks'), [sx * 0.75, 0.52, sz], [sx * 0.85, 0.52, sz], 0.5, 8, { caps: true, col: [0.6, 0.5, 0.4] });
  for (const s of [-0.45, 0.45]) limb(G('planks'), [s, 0.6, 1.2], [s * 0.8, 0.05, 3.0], 0.05, 4, { col: WOOD });
  crate(0.2, -0.4, 0.5, 0.7);
  colLocal(-0.9, -1.3, 0.9, 1.3);
  clearTF();

  // --- timber yard (page 3) ---
  setTF(-28, -38, 0);
  for (const sx of [-3.6, 3.6]) for (const sz of [-2.4, 2.4]) { box(G('planks'), sx, 0, sz, 0.25, sz < 0 ? 3.3 : 2.7, 0.25, { ts: 1, col: WOOD }); colLocal(sx - 0.13, sz - 0.13, sx + 0.13, sz + 0.13); }
  plane(G('shingle'), [4.0, 3.3, -2.9], [-8, 0, 0], [0, -0.7, 5.8], { two: true, ts: 2 });
  roofs.push(aabbLocal(-4, -2.9, 4, 2.9));
  const bh = table(0.3, -1.4, 2.4, 0.8, 0.9);
  page(2, 0.0, bh + 0.01, -1.4);
  box(G('iron'), 0.9, bh, -1.4, 0.9, 0.02, 0.2, { ts: 0.5, skip: 'b' });
  for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++)
    limb(G('bark'), [-3.2, 0.28 + row * 0.46, 4.2 + k * 0.52 + row * 0.26], [1.6, 0.28 + row * 0.46, 4.2 + k * 0.52 + row * 0.26], 0.26, 6, { caps: true, col: [0.9, 0.85, 0.8] });
  colLocal(-3.3, 3.9, 1.7, 6.3);
  cyl(G('bark'), 5.5, 0, 1.5, 0.45, 0.42, 0.55, 7, { top: true });
  limb(G('planks'), [5.5, 0.55, 1.5], [5.9, 1.25, 1.7], 0.03, 4, { col: WOOD });
  box(G('iron'), 5.5, 0.5, 1.5, 0.22, 0.12, 0.05, { ts: 0.5 });
  circLocal(5.5, 1.5, 0.5);
  clearTF();

  // the stump of the white oak, out at the Hollow
  const sx = -22, sz = -54, sy = groundH(sx, sz);
  cyl(G('bark'), sx, sy - 0.3, sz, 2.5, 2.2, 1.4, 12, { col: [1.9, 1.8, 1.65] });
  cyl(G('floor'), sx, sy + 1.08, sz, 2.2, 2.2, 0.03, 12, { top: true, col: [1.6, 0.75, 0.6] });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + 0.2;
    limb(G('bark'), [sx + Math.cos(a) * 1.9, sy + 0.6, sz + Math.sin(a) * 1.9], [sx + Math.cos(a) * 4.4, sy - 0.25, sz + Math.sin(a) * 4.4], 0.4, 5, { r1: 0.12, col: [1.8, 1.7, 1.55] });
  }
  circles.push([sx, sz, 2.7]);

  // --- graveyard (page 6) ---
  setTF(19, -38, 0);
  const pick = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.5);
    for (let i = 0; i <= n; i++) {
      const x = lerp(x0, x1, i / n), z = lerp(z0, z1, i / n);
      if (hash2(i, Math.round(x0 * 3 + z0)) < 0.06) continue;
      limb(G('iron'), [x, 0, z], [x, 1.25, z], 0.025, 3, { r1: 0.005 });
    }
    limb(G('iron'), [x0, 1.0, z0], [x1, 1.0, z1], 0.02, 3); limb(G('iron'), [x0, 0.25, z0], [x1, 0.25, z1], 0.02, 3);
    colLocal(Math.min(x0, x1) - 0.06, Math.min(z0, z1) - 0.06, Math.max(x0, x1) + 0.06, Math.max(z0, z1) + 0.06);
  };
  pick(-9, -12, 9, -12); pick(-9, 12, 9, 12); pick(9, -12, 9, 12); pick(-9, -12, -9, -1.5); pick(-9, 1.5, -9, 12);
  for (const z of [-9, -6, -3, 3, 6, 9]) for (let x = -6; x <= 6.1; x += 2.4) {
    const h = hash2(Math.round(x * 10), z + 40);
    if (h < 0.12) continue;
    if (h < 0.3) {
      // dug up: open hole, spoil heap, coffin lid, pale roots
      plane(G('hole'), [x - 0.45, 0.03, z + 1.0], [0.9, 0, 0], [0, 0, -2.0], { ts: 1, seg: 9 });
      box(G('dirt'), x + 0.85, 0, z, 0.55, 0.45, 1.8, { ts: 1 });
      box(G('planks'), x - 0.85, 0, z, 0.55, 0.06, 1.9, { ts: 1, col: [0.5, 0.42, 0.36] });
      for (let r = 0; r < 4; r++) limb(G('bark'), [x + rr(-0.3, 0.3), -0.4, z + rr(-0.8, 0.8)], [x + rr(-0.35, 0.35), rr(0.2, 0.7), z + rr(-0.8, 0.8)], 0.05, 3, { r1: 0.01, col: [1.8, 1.7, 1.55] });
    }
    if (h > 0.75) {
      limb(G('grave'), [x, 0, z - 0.95], [x, 1.25, z - 0.95], 0.08, 4, { col: [0.9, 0.9, 0.9] });
      limb(G('grave'), [x - 0.35, 0.9, z - 0.95], [x + 0.35, 0.9, z - 0.95], 0.07, 4, { col: [0.9, 0.9, 0.9] });
    } else box(G('grave'), x, 0, z - 0.95, 0.7, 0.75 + h * 0.4, 0.16, { tsu: 0.7, tsv: 1.0 });
    colLocal(x - 0.38, z - 1.05, x + 0.38, z - 0.85);
  }
  box(G('grave'), 6.0, 0, -0.2, 0.95, 0.38, 2.0, { tsu: 0.95, tsv: 1.0 });
  colLocal(5.5, -1.2, 6.5, 0.8);
  page(5, 6.0, 0.39, -0.2);
  clearTF();
  deadTree(13.5, -27.5, 1.2);

  // --- along the coach road ---
  fenceRun(-6, 20, -6, 46, 11); fenceRun(-6, 52, -6, 76, 12);
  fenceRun(6, 30, 6, 58, 13); fenceRun(6, 62, 6, 78, 14);
  for (const [x, z] of [[3.4, 24], [-3.4, 44], [3.4, 64], [-3.4, 82], [9.8, -9.8], [-9.8, -9.8], [-9.8, 9.8]]) lamppost(x, z);
  setTF(3.8, 81, 0);
  for (const s of [-0.85, 0.85]) limb(G('planks'), [s, 0, 0], [s, 1.9, 0], 0.07, 4, { col: WOOD });
  box(G('sign'), 0, 1.15, 0, 2.0, 0.9, 0.08, { tsu: 2.0, tsv: 0.9, skip: '' });
  colLocal(-1, -0.1, 1, 0.1);
  clearTF();
  // clutter by the inn and the store
  for (const [x, z] of [[-19.4, -3.2], [-19.6, -2.4]]) { setTF(x, z, 0); barrel(0, 0); clearTF(); }
  for (const [x, z] of [[19.9, -2.4], [20.0, 6.6]]) { setTF(x, z, 0); barrel(0, 0); clearTF(); }
  setTF(20.2, 7.5, 0.3); crate(0, 0, 0.7); crate(0, 0, 0.5, 0.7); clearTF();

  // --- trees ---
  for (const [x, z] of [[-8, -20], [9, -14], [-34, 10], [36, 8], [-10, 40], [12, 44], [-30, -10], [7, 33], [-37, -34], [24, 16], [-6, 27], [33, 30], [-28, 26]]) {
    if (!pointBlocked(x, z, 1.5)) deadTree(x, z, rr(0.9, 1.3));
  }
  let placed = 0, tries = 0;
  while (placed < 26 && tries < 2000) {
    tries++;
    const a = rand() * TAU, r = rr(30, 46), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 8 && z > 0) continue;
    if (pointBlocked(x, z, 3)) continue;
    pine(x, z, rr(0.8, 1.3), true); placed++;
  }
  placed = 0; tries = 0;
  while (placed < 850 && tries < 30000) {
    tries++;
    const a = rand() * TAU, r = Math.sqrt(rr(46 * 46, 100 * 100)), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 25 && Math.abs(x) < 5.5) continue;
    if (Math.hypot(x - sx, z - sz) < 6.5) continue;
    if (Math.hypot(x + 28, z + 38) < 8) continue;
    if (r < 62 && rand() < 0.5) continue;
    if (r < 66 && pointBlocked(x, z, 1.2)) continue;
    pine(x, z, rr(0.85, 1.6), r < 66);
    placed++;
  }

  for (const k in GEOS) scene.add(GEOS[k].build(MAT[k.split('#')[0]]));
}
