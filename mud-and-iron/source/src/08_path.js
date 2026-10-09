// Mud & Iron — A* over the nav grid (per movement class), with nearest-passable fallback and string pulling

const PF = { g: null, f: null, from: null, gen: null, closed: null, heap: null, stamp: 0, n: 0 };
function pfAlloc() {
  const n = MAP.cw * MAP.ch;
  if (PF.n === n) return;
  PF.n = n;
  PF.g = new Float32Array(n); PF.f = new Float32Array(n); PF.from = new Int32Array(n);
  PF.gen = new Uint32Array(n); PF.closed = new Uint32Array(n); PF.heap = new Int32Array(n * 8); PF.stamp = 0;
  PF.mark = new Uint32Array(n);
}
function nearestPassable(cls, c, maxR = 12) {
  const cost = MAP.cost[cls], cw = MAP.cw, ch = MAP.ch;
  if (cost[c] > 0) return c;
  const ci = c % cw, cj = Math.floor(c / cw);
  for (let r = 1; r <= maxR; r++) {
    let best = -1, bd = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= cw || j >= ch) continue;
      const k = j * cw + i;
      if (cost[k] > 0) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = k; } }
    }
    if (best >= 0) return best;
  }
  return -1;
}

// Returns an array of {x, z} waypoints (excluding the start), or null if unreachable.
function findPath(cls, sx, sz, tx, tz, maxNodes = 14000) {
  pfAlloc();
  const cost = MAP.cost[cls], cw = MAP.cw, ch = MAP.ch;
  let s = nearestPassable(cls, cellIdx(sx, sz), 4);
  let t = nearestPassable(cls, cellIdx(tx, tz), 20);
  if (s < 0 || t < 0) return null;
  const tcell = cellIdx(tx, tz);
  const exact = t === tcell;
  if (s === t) return [{ x: exact ? tx : cellX(t), z: exact ? tz : cellZ(t) }];
  const stamp = ++PF.stamp;
  const { g, f, from, gen, closed, heap } = PF;
  const ti = t % cw, tj = Math.floor(t / cw);
  const hfun = (k) => { const dx = Math.abs(k % cw - ti), dz = Math.abs(Math.floor(k / cw) - tj); return (dx + dz + (1.4142 - 2) * Math.min(dx, dz)) * 0.85; };
  let hn = 0;
  const push = (k) => {
    let i = hn++; heap[i] = k;
    while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[k]) break; heap[i] = heap[p]; i = p; }
    heap[i] = k;
  };
  const pop = () => {
    const top = heap[0], last = heap[--hn];
    let i = 0;
    while (true) {
      let l = i * 2 + 1; if (l >= hn) break;
      if (l + 1 < hn && f[heap[l + 1]] < f[heap[l]]) l++;
      if (f[heap[l]] >= f[last]) break;
      heap[i] = heap[l]; i = l;
    }
    heap[i] = last;
    return top;
  };
  gen[s] = stamp; g[s] = 0; f[s] = hfun(s); from[s] = -1; push(s);
  let found = false, expanded = 0, best = s, bestH = hfun(s);
  while (hn > 0) {
    const k = pop();
    if (closed[k] === stamp) continue;
    closed[k] = stamp;
    if (k === t) { found = true; break; }
    const hk = f[k] - g[k];
    if (hk < bestH) { bestH = hk; best = k; }
    if (++expanded > maxNodes) break;
    const ki = k % cw, kj = Math.floor(k / cw);
    for (let d = 0; d < 8; d++) {
      const di = NBR8[d][0], dj = NBR8[d][1], ni = ki + di, nj = kj + dj;
      if (ni < 0 || nj < 0 || ni >= cw || nj >= ch) continue;
      const nk = nj * cw + ni, c = cost[nk];
      if (c <= 0 || closed[nk] === stamp) continue;
      let step = c;
      if (di && dj) {
        if (cost[kj * cw + ni] <= 0 || cost[nj * cw + ki] <= 0) continue; // no corner cutting
        step *= 1.4142;
      }
      const ng = g[k] + step;
      if (gen[nk] !== stamp || ng < g[nk]) {
        gen[nk] = stamp; g[nk] = ng; f[nk] = ng + hfun(nk); from[nk] = k;
        if (hn < heap.length) push(nk);
      }
    }
  }
  const end = found ? t : best;
  if (end === s) return null;
  const cells = [];
  for (let k = end; k !== -1; k = from[k]) cells.push(k);
  cells.reverse();
  // string-pull: drop waypoints that a straight walk can skip without entering costlier ground
  const mark = PF.mark;
  for (const c of cells) mark[c] = stamp;
  const out = [];
  let a = 0;
  const lineOK = (ax, az, bx, bz, maxCost) => {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 1.5);
    for (let k = 1; k < n; k++) {
      const x = lerp(ax, bx, k / n), z = lerp(az, bz, k / n), c = cellIdx(x, z), cc = cost[c];
      if (cc <= 0) return false;
      if (cc > maxCost && mark[c] !== stamp) return false;
      // keep clear of blocked corners
      for (const [ox, oz] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) if (cost[cellIdx(x + ox, z + oz)] <= 0 && cc > 0 && mark[c] !== stamp) return false;
    }
    return true;
  };
  let ax = sx, az = sz;
  while (a < cells.length - 1) {
    let b = cells.length - 1;
    const maxC = Math.max(1.35, cost[cells[a]]);
    while (b > a + 1 && !lineOK(ax, az, cellX(cells[b]), cellZ(cells[b]), maxC)) b--;
    ax = cellX(cells[b]); az = cellZ(cells[b]);
    out.push({ x: ax, z: az });
    a = b;
  }
  if (found && exact) out[out.length - 1] = { x: tx, z: tz };
  if (!out.length) out.push({ x: cellX(end), z: cellZ(end) });
  return out;
}
