// ===================== ZONE GENERATION =====================
let zone = null;
const GRID_G = 16;

class Zone {
  constructor(def) {
    this.def = def; this.id = def.id; this.k = def.k; this.B = BIOMES[def.b];
    this.seed = hashStr(def.id); this.rng = mulberry32(this.seed); this.nz = new Noise(this.seed);
    this.group = new THREE.Group(); scene.add(this.group);
    this.colliders = []; this.grid = new Map(); this.stamp = 0;
    this.interact = []; this.triggers = []; this.anims = []; this.pads = []; this.spawnList = []; this.arrivals = {}; this.booths = [];
    this.statics = []; this.glows = [];
    this.waterY = -999; this.lvl = def.l || [1, 1];
    this.size = { city: 300, town: 210, platform: 250, dungeon: 170 }[def.k] || 400; this.half = this.size / 2;
    const B = this.B, vt = def.k === 'veil' ? VEIL_TINTS[def.id] : null;
    this.pal = vt ? Object.assign({}, B, { g: vt.g, sky: vt.sky, fog: vt.fog, w: vt.w, hi: vt.g[0], cl: new THREE.Color(vt.g[0]).multiplyScalar(0.7).getHex(), sh: vt.g[2], glow: vt.glow }) : B;
    if (def.k === 'dungeon') this.ds = DUNGEON_STYLES[def.st];
  }
  // ---------- colliders ----------
  addCol(x0, z0, x1, z1, y0, y1, tag) {
    const c = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1, s: 0, tag };
    this.colliders.push(c);
    for (let gx = Math.floor(c.x0 / GRID_G); gx <= Math.floor(c.x1 / GRID_G); gx++) for (let gz = Math.floor(c.z0 / GRID_G); gz <= Math.floor(c.z1 / GRID_G); gz++) {
      const k = (gx + 512) * 4096 + gz + 512; let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); } a.push(c);
    }
    return c;
  }
  addBoxCol(cx, cz, w, d, y0, y1) { return this.addCol(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y0, y1); }
  query(x, z, r) {
    const out = []; this.stamp++;
    for (let gx = Math.floor((x - r) / GRID_G); gx <= Math.floor((x + r) / GRID_G); gx++) for (let gz = Math.floor((z - r) / GRID_G); gz <= Math.floor((z + r) / GRID_G); gz++) {
      const a = this.grid.get((gx + 512) * 4096 + gz + 512); if (!a) continue;
      for (const c of a) if (c.s !== this.stamp) { c.s = this.stamp; out.push(c); }
    }
    return out;
  }
  heightAt(x, z) {
    if (!this.H) return 0;
    const N = this.res, W = N + 1; let fx = (x + this.half) / this.step, fz = (z + this.half) / this.step;
    fx = clamp(fx, 0, N - 0.0001); fz = clamp(fz, 0, N - 0.0001);
    const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, H = this.H;
    const h00 = H[iz * W + ix], h10 = H[iz * W + ix + 1], h01 = H[(iz + 1) * W + ix], h11 = H[(iz + 1) * W + ix + 1];
    return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }
  groundAt(x, z, y, r = 0.3) {
    let h = this.heightAt(x, z);
    for (const c of this.query(x, z, r)) {
      if (x >= c.x0 - r * 0.5 && x <= c.x1 + r * 0.5 && z >= c.z0 - r * 0.5 && z <= c.z1 + r * 0.5 && c.y1 <= y + 0.75 && c.y1 > h) h = c.y1;
    }
    return h;
  }
  pushOut(p, r, feet, height) { // resolve circle vs boxes in XZ; p is Vector3 (feet)
    let hit = false;
    for (const c of this.query(p.x, p.z, r + 0.5)) {
      if (feet >= c.y1 - 0.05 || feet + height <= c.y0) continue;
      const cx = clamp(p.x, c.x0, c.x1), cz = clamp(p.z, c.z0, c.z1); let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (c.y1 - feet <= 0.6 && c.y1 - feet > 0) continue; // step up handled by groundAt
      hit = true;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
      else { const px0 = p.x - c.x0, px1 = c.x1 - p.x, pz0 = p.z - c.z0, pz1 = c.z1 - p.z; const m = Math.min(px0, px1, pz0, pz1);
        if (m === px0) p.x = c.x0 - r; else if (m === px1) p.x = c.x1 + r; else if (m === pz0) p.z = c.z0 - r; else p.z = c.z1 + r; }
    }
    const lim = this.half - 3; if (this.k === 'platform') { const d = Math.hypot(p.x, p.z); if (d > 112) { p.x *= 112 / d; p.z *= 112 / d; } }
    p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
    return hit;
  }
  rayWorld(o, d, maxT) { // returns t of first world hit
    let best = maxT;
    // boxes (slab)
    const cands = maxT < 60 ? this.query(o.x + d.x * maxT * 0.5, o.z + d.z * maxT * 0.5, maxT * 0.5 + 1) : this.colliders;
    for (const c of cands) {
      let t0 = 0, t1 = best;
      for (const [oa, da, a0, a1] of [[o.x, d.x, c.x0, c.x1], [o.y, d.y, c.y0, c.y1], [o.z, d.z, c.z0, c.z1]]) {
        if (Math.abs(da) < 1e-9) { if (oa < a0 || oa > a1) { t0 = 1; t1 = 0; break; } continue; }
        let ta = (a0 - oa) / da, tb = (a1 - oa) / da; if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
        if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 < best && t0 > 0) best = t0;
    }
    // terrain march
    const stp = 1.2; let prev = 0;
    for (let t = stp; t < best; t += stp) {
      const y = o.y + d.y * t; if (y < this.heightAt(o.x + d.x * t, o.z + d.z * t)) {
        let a = prev, b = t; for (let i = 0; i < 5; i++) { const m = (a + b) / 2; if (o.y + d.y * m < this.heightAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
        best = Math.min(best, b); break;
      }
      prev = t; if (y > 140 && d.y > 0) break;
    }
    return best;
  }
  los(a, b) { const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); d.divideScalar(L); return this.rayWorld(a, d, L) >= L - 0.6; }

  // ---------- static geometry batching ----------
  st(g, m, c) { this.statics.push({ g, m, c }); }
  gl(g, m, c) { this.glows.push({ g, m, c }); }
  box(x, y, z, w, h, d, c, ry = 0, col = true) { this.st(gBox(w, h, d), mat4(x, y + h / 2, z, 0, ry, 0), c); if (col) { if (Math.abs(ry) < 0.01) this.addBoxCol(x, z, w, d, y - 2, y + h); else { const r = Math.max(w, d) * 0.5; this.addBoxCol(x, z, r * 1.3, r * 1.3, y - 2, y + h); } } }
  flushStatics() {
    if (this.statics.length) { const g = mergeGeos(this.statics); const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradTex })); this.group.add(m); this.statics = []; }
    if (this.glows.length) { const g = mergeGeos(this.glows); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true })); this.group.add(m); this.glows = []; }
  }
  inst(g, mat, list) {
    if (!list.length || !g) return null; const m = new THREE.InstancedMesh(g, mat, list.length); m.frustumCulled = false; const c = new THREE.Color();
    list.forEach((t, i) => { m.setMatrixAt(i, mat4(t.x, t.y, t.z, t.rx || 0, t.ry || 0, t.rz || 0, t.s, t.s * (t.sy || 1), t.s)); if (t.c !== undefined) m.setColorAt(i, c.set(t.c)); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; this.group.add(m); return m;
  }
  pad(x, z, r, opt = {}) { const p = Object.assign({ x, z, r, h: null }, opt); this.pads.push(p); return p; }
  nearPad(x, z, extra = 0) { for (const p of this.pads) if (Math.hypot(x - p.x, z - p.z) < p.r + extra) return p; return null; }

  // ---------- terrain ----------
  buildTerrain(hfn, colfn, N = 96) {
    const S = this.size, half = this.half, step = S / N; this.res = N; this.step = step;
    const W = N + 1, H = new Float32Array(W * W);
    for (let iz = 0; iz <= N; iz++) for (let ix = 0; ix <= N; ix++) H[iz * W + ix] = hfn(-half + ix * step, -half + iz * step);
    this.H = H;
    const pos = new Float32Array(N * N * 18), col = new Float32Array(N * N * 18); let p = 0; const c = new THREE.Color(); const r = mulberry32(this.seed + 5);
    const put = (x, y, z) => { pos[p] = x; pos[p + 1] = y; pos[p + 2] = z; p += 3; };
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
      const x0 = -half + ix * step, z0 = -half + iz * step, x1 = x0 + step, z1 = z0 + step;
      const h00 = H[iz * W + ix], h10 = H[iz * W + ix + 1], h01 = H[(iz + 1) * W + ix], h11 = H[(iz + 1) * W + ix + 1];
      for (let t = 0; t < 2; t++) {
        const st = p;
        if (t === 0) { put(x0, h00, z0); put(x0, h01, z1); put(x1, h10, z0); } else { put(x1, h10, z0); put(x0, h01, z1); put(x1, h11, z1); }
        const ax = pos[st + 3] - pos[st], ay = pos[st + 4] - pos[st + 1], az = pos[st + 5] - pos[st + 2], bx = pos[st + 6] - pos[st], by = pos[st + 7] - pos[st + 1], bz = pos[st + 8] - pos[st + 2];
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nzv = ax * by - ay * bx; const nl = Math.hypot(nx, ny, nzv) || 1;
        const cx = (pos[st] + pos[st + 3] + pos[st + 6]) / 3, cz = (pos[st + 2] + pos[st + 5] + pos[st + 8]) / 3, ch = (pos[st + 1] + pos[st + 4] + pos[st + 7]) / 3;
        colfn(c, cx, cz, ch, Math.abs(ny / nl)); c.offsetHSL(0, 0, (r() - 0.5) * 0.035);
        for (let k = 0; k < 3; k++) { col[st + k * 3] = c.r; col[st + k * 3 + 1] = c.g; col[st + k * 3 + 2] = c.b; }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradTex })); this.group.add(m); this.terrain = m;
  }
  baseHeight(x, z) {
    const B = this.B, nz = this.nz, amp = B.amp, sc = B.sc; let h = nz.fbm(x * sc, z * sc, 4) * amp * 2.2;
    if (B.ridge) h += (nz.ridge(x * sc * 0.6 + 11, z * sc * 0.6 - 7, 3) - 0.55) * amp * 1.8;
    if (B.mesas) { const m = nz.n2(x * 0.018 + 40, z * 0.018 + 40); h += smooth(0.28, 0.34, m) * amp * 1.7; }
    if (this.craters) for (const c of this.craters) { const d = Math.hypot(x - c.x, z - c.z) / c.r; if (d < 1.3) h += (d < 1 ? -(1 - d * d) * c.depth : 0) + Math.max(0, 1 - Math.abs(d - 1) * 3.5) * c.depth * 0.35; }
    if (B.river) { const rz = Math.sin(x * 0.011 + this.seed % 7) * 38 + nz.n2(x * 0.008, 3.3) * 30; const dd = Math.abs(z - rz); h = lerp(-5.5, h + 1.5, smooth(9, 26, dd)); }
    if (B.coast) { const s = (x * this.coastDir[0] + z * this.coastDir[1]); h = lerp(h + 2, -7, smooth(10, 110, s)); }
    if (this.k === 'island') { const d = Math.hypot(x, z) / this.half; h = h * 0.6 + 5 - Math.pow(d, 2.4) * 22; }
    if (B.toxic) { const t = nz.n2(x * 0.03 + 90, z * 0.03 - 50); if (t > 0.35) h -= smooth(0.35, 0.5, t) * 4; }
    if (this.k === 'veil' && this.id === 'cinderdeep') { const t = nz.n2(x * 0.02 + 20, z * 0.02 + 20); if (t > 0.2) h -= smooth(0.2, 0.32, t) * 6; }
    return h;
  }
  fullHeight(x, z) {
    let h = this.baseHeight(x, z);
    if (this.k !== 'island' && this.k !== 'platform') {
      const e = Math.max(Math.abs(x), Math.abs(z)) / this.half; let wall = smooth(0.82, 0.97, e) * (26 + this.nz.n2(x * 0.05, z * 0.05) * 10);
      for (const g of this.gateSpots) { const d = Math.hypot(x - g.x, z - g.z); wall *= smooth(9, 24, d); }
      h += wall;
    }
    for (const p of this.pads) {
      if (p.h === null) p.h = Math.max(this.baseHeight(p.x, p.z), this.waterY + 0.9);
      const d = Math.hypot(x - p.x, z - p.z); const t = 1 - smooth(p.r * 0.6, p.r + 4, d); if (t > 0) h = lerp(h, p.h, t);
    }
    return h;
  }
  terrainColor(c, x, z, h, ny) {
    const P = this.pal, B = this.B; const n = this.nz.n2(x * 0.045 + 3, z * 0.045 - 8);
    const g = P.g; c.set(n < -0.2 ? g[0] : n < 0.25 ? g[1] : g[2]);
    if (B.farm) { const fx = Math.floor((x + 400) / 26), fz = Math.floor((z + 400) / 34); const v = (fx * 7 + fz * 13) % 4; if (v === 1) c.set(0xd8c070); else if (v === 2) c.set(0x6f9a4a); else if (v === 3 && Math.floor(x / 3) % 2 === 0) c.lerp(new THREE.Color(0x8a6a40), 0.4); }
    if (h > B.amp * 1.4) c.lerp(new THREE.Color(P.hi), clamp((h - B.amp * 1.4) / (B.amp * 1.5), 0, 0.85));
    if (B.snowcap && h > 22) c.set(0xeef3f6);
    if (ny < 0.72) c.set(P.cl).lerp(new THREE.Color(P.hi), clamp(n + 0.3, 0, 0.5));
    if (this.waterY > -100 && h < this.waterY + 0.9) c.set(P.sh);
    const pd = this.nearPad(x, z); if (pd && pd.paved) c.set(pd.paved);
    if (h > 23 && this.k !== 'island' && Math.max(Math.abs(x), Math.abs(z)) > this.half * 0.85) c.lerp(new THREE.Color(P.cl), 0.5);
  }
  addWater(color, y, opacity = 0.82) {
    this.waterY = y; const m = new THREE.Mesh(new THREE.PlaneGeometry(this.size * 3, this.size * 3), new THREE.MeshToonMaterial({ color, gradientMap: gradTex, transparent: true, opacity }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; this.group.add(m); this.water = m;
  }

  // ---------- lighting / sky ----------
  setupAtmos() {
    const P = this.pal, d = this.def; const r = this.rng;
    const sunDir = new THREE.Vector3(Math.cos(this.seed % 6), 0.55 + (this.seed % 5) * 0.08, Math.sin(this.seed % 6));
    if (d.k === 'dungeon') { scene.background = new THREE.Color(this.ds.fog); scene.fog = new THREE.Fog(this.ds.fog, 8, 85); }
    else {
      scene.background = new THREE.Color(P.sky[1]); scene.fog = new THREE.Fog(P.fog, 40, P.ff);
      const dark = new THREE.Color(P.sky[0]).getHSL({}).l < 0.15;
      this.sky = makeSky(P.sky[0], P.sky[1], P.sky[2], sunDir, d.k === 'veil' ? P.glow : P.sun, { planet: P.planet || (d.k === 'veil' ? P.glow : 0), planetAng: (this.seed % 628) / 100, planetY: 260 + this.seed % 200, stars: dark ? 0.9 : (d.k === 'veil' ? 0.4 : 0), clouds: d.k !== 'veil' && d.b !== 'polluted', seed: this.seed, cloudCol: d.b === 'wasteland' ? 0xd8c0b0 : 0xffffff });
      this.group.add(this.sky);
    }
    const hemi = new THREE.HemisphereLight(d.k === 'dungeon' ? this.ds.light : P.sky[1], d.k === 'dungeon' ? this.ds.floor : P.g[0], d.k === 'dungeon' ? 0.55 : 0.5);
    const sun = new THREE.DirectionalLight(d.k === 'dungeon' ? this.ds.light : P.sun, d.k === 'dungeon' ? 0.55 : 0.82); sun.position.copy(sunDir).multiplyScalar(100);
    this.group.add(hemi, sun);
  }

  // ---------- master build ----------
  build() {
    const d = this.def;
    if (d.k === 'dungeon') this.buildDungeon();
    else if (d.k === 'city' || d.k === 'town' || d.k === 'platform') this.buildCity();
    else this.buildWild();
    this.setupAtmos();
    this.flushStatics();
  }
  placeGates(inset) {
    const d = this.def, here = d.p; this.gateSpots = []; const used = [];
    for (const ex of d.ex) {
      const t = ZMAP[ex]; if (!t) continue; let ang = Math.atan2(t.p[1] - here[1], t.p[0] - here[0]);
      for (let k = 0; k < 8; k++) { if (used.some(a => Math.abs(Math.atan2(Math.sin(a - ang), Math.cos(a - ang))) < 0.45)) ang += (k % 2 ? -1 : 1) * 0.5 * (k + 1); else break; }
      used.push(ang);
      const cx = Math.cos(ang), cz = Math.sin(ang); const m = Math.max(Math.abs(cx), Math.abs(cz)); const R = this.half - inset;
      const x = cx / m * R, z = cz / m * R; this.gateSpots.push({ x, z, ang, to: ex });
    }
  }
  makeGates() {
    for (const g of this.gateSpots) {
      const t = ZMAP[g.to]; const portal = t.k === 'veil' || this.def.k === 'veil' || t.k === 'dungeon' || this.def.k === 'dungeon';
      const col = portal ? 0xc26bff : t.f ? FACTIONS[t.f].hex : 0x4fd6ff;
      const label = t.n + (t.l && t.k !== 'city' ? `  ·  LV ${t.l[0]}-${t.l[1]}` : '');
      const m = buildGate(label, col, portal); const y = this.heightAt(g.x, g.z); m.position.set(g.x, y, g.z); m.rotation.y = -g.ang + Math.PI / 2; this.group.add(m);
      this.anims.push((t2) => { m.userData.portal.material.opacity = 0.28 + Math.sin(t2 * 3) * 0.1; });
      const tx = Math.cos(g.ang), tz = Math.sin(g.ang);
      this.addBoxCol(g.x - tz * 4.4, g.z + tx * 4.4, 1.4, 1.4, y - 2, y + 9); this.addBoxCol(g.x + tz * 4.4, g.z - tx * 4.4, 1.4, 1.4, y - 2, y + 9);
      this.triggers.push({ x: g.x + tx * 0.8, z: g.z + tz * 0.8, r: 3.2, to: g.to, kind: 'gate' });
      this.arrivals[g.to] = { x: g.x - tx * 12, z: g.z - tz * 12, yaw: Math.atan2(tx, tz) };
    }
  }
  pickSpots(n, minFromPads, minDist, extent, rngf) {
    const out = []; const r = rngf || this.rng;
    for (let tries = 0; tries < n * 60 && out.length < n; tries++) {
      const x = rr(r, -extent, extent), z = rr(r, -extent, extent);
      if (this.nearPad(x, z, minFromPads)) continue; if (out.some(o => Math.hypot(o.x - x, o.z - z) < minDist)) continue;
      if (this.gateSpots && this.gateSpots.some(g => Math.hypot(g.x - x, g.z - z) < 40)) continue;
      if (this.k === 'island' && Math.hypot(x, z) > this.half * 0.62) continue;
      if (this.B.coast && (x * this.coastDir[0] + z * this.coastDir[1]) > 30) continue;
      out.push({ x, z });
    }
    return out;
  }

  // ---------- WILD ----------
  buildWild() {
    const d = this.def, B = this.B, r = this.rng, P = this.pal;
    if (B.coast) { const a = r() * TAU; this.coastDir = [Math.cos(a), Math.sin(a)]; }
    if (B.craters) { this.craters = []; for (let i = 0; i < B.craters; i++) this.craters.push({ x: rr(r, -130, 130), z: rr(r, -130, 130), r: rr(r, 24, 46), depth: rr(r, 6, 12) }); }
    if (B.wy !== undefined || B.river || B.coast || this.k === 'island') this.waterY = B.wy !== undefined ? B.wy : (B.river ? -2.2 : 0);
    if (B.river) this.waterY = -2.2;
    this.placeGates(this.k === 'island' ? this.half * 0.4 : 12);
    for (const g of this.gateSpots) { this.pad(g.x, g.z, 12); const tx = Math.cos(g.ang), tz = Math.sin(g.ang); this.pad(g.x - tx * 16, g.z - tz * 16, 12); }
    const isle = this.k === 'island';
    // outpost / spawn hub
    const hub = isle ? { x: 0, z: 0 } : (this.pickSpots(1, 30, 0, 60)[0] || { x: 0, z: 0 });
    this.hub = this.pad(hub.x, hub.z, 20, { paved: P.cl });
    const ext = isle ? this.half * 0.55 : this.half * 0.72;
    // dungeon entrances
    this.doorSpots = (d.dg || []).map(() => { const s = this.pickSpots(1, 30, 0, ext)[0] || { x: 40, z: 40 }; this.pad(s.x, s.z, 14); return s; });
    // boss arena: farthest from gates/hub
    let best = null, bd = -1; for (let i = 0; i < 120; i++) { const x = rr(r, -ext, ext), z = rr(r, -ext, ext); if (isle && Math.hypot(x, z) > this.half * 0.5) continue; if (B.coast && (x * this.coastDir[0] + z * this.coastDir[1]) > 20) continue; let m = Math.hypot(x - hub.x, z - hub.z); for (const g of this.gateSpots) m = Math.min(m, Math.hypot(x - g.x, z - g.z)); for (const p of this.pads) m = Math.min(m, Math.hypot(x - p.x, z - p.z) + 10); if (m > bd) { bd = m; best = { x, z }; } }
    this.bossSpot = best; this.pad(best.x, best.z, 22);
    // tower site
    if (d.towers) { const s = this.pickSpots(1, 40, 0, ext)[0]; if (s) { this.towerSite = s; this.pad(s.x, s.z, 24, { paved: 0x5a5e66 }); } }
    // camps
    const nCamps = isle ? 6 : this.k === 'veil' ? 8 : 9;
    this.campSpots = this.pickSpots(nCamps, 22, 45, ext); for (const c of this.campSpots) this.pad(c.x, c.z, 13);
    this.chestSpots = this.pickSpots(isle ? 3 : 5, 10, 30, ext);
    // terrain
    this.buildTerrain((x, z) => this.fullHeight(x, z), (c, x, z, h, ny) => this.terrainColor(c, x, z, h, ny), 100);
    if (this.waterY > -100) this.addWater(P.w, this.waterY, B.toxic ? 0.9 : 0.8);
    this.makeGates();
    this.buildHub(hub);
    this.doorSpots.forEach((s, i) => this.makeDoor(s, d.dg[i]));
    this.scatterProps(ext);
    for (const c of this.campSpots) this.buildCamp(c);
    if (this.towerSite) this.buildTowerSite(this.towerSite);
    this.chestSpots.forEach(s => this.makeChest(s.x, s.z, false));
    this.makeChest(this.bossSpot.x + 9, this.bossSpot.z + 4, true);
    this.buildBossArena(this.bossSpot);
    if (B.floaters || this.k === 'veil') this.buildFloaters();
    if (B.crystals) for (let i = 0; i < 18; i++) { const x = rr(r, -ext, ext), z = rr(r, -ext, ext); if (this.nearPad(x, z, 4)) continue; const cc = buildCrystalCluster(P.glow || 0x7ad8ff); cc.position.set(x, this.heightAt(x, z), z); cc.scale.setScalar(rr(r, 0.8, 1.8)); this.group.add(cc); }
    // spawns
    const L = this.lvl;
    const pool = POOLS[this.k === 'veil' ? 'veil' : d.b] || POOLS.plains;
    this.campSpots.forEach((c, i) => {
      const dist = Math.hypot(c.x - hub.x, c.z - hub.z) / (this.half * 1.2); const lv = Math.round(lerp(L[0], L[1], clamp(dist + rr(r, -0.15, 0.15), 0, 1)));
      const type = pick(r, pool); const n = type === 'brute' || type === 'hornback' ? ri(r, 2, 3) : ri(r, 3, 5);
      for (let k = 0; k < n; k++) { const a = rr(r, 0, TAU), rad = rr(r, 3, 9); this.spawnList.push({ type: k === 0 && rnd() < 0.5 ? pick(r, pool) : type, x: c.x + Math.cos(a) * rad, z: c.z + Math.sin(a) * rad, lvl: lv, camp: i }); }
    });
    // roaming singles
    for (let i = 0; i < (isle ? 6 : 10); i++) { const s = this.pickSpots(1, 12, 0, ext, rnd)[0]; if (s) this.spawnList.push({ type: pick(rnd, pool), x: s.x, z: s.z, lvl: ri(rnd, L[0], L[1]), roam: true }); }
    if (d.boss) this.spawnList.push({ type: d.boss[1], x: this.bossSpot.x, z: this.bossSpot.z, lvl: this.k === 'island' ? L[1] : L[1] + 1, boss: true });
  }
  buildHub(h) {
    const y = this.heightAt(h.x, h.z), P = this.pal;
    const booth = buildBooth(); booth.position.set(h.x + 7, y, h.z - 5); this.group.add(booth); this.addBoxCol(h.x + 7, h.z - 5, 2.4, 2.4, y - 1, y + 3.5);
    this.booths.push({ x: h.x + 7, z: h.z - 2 });
    this.box(h.x - 8, y, h.z + 6, 6, 3.2, 5, 0x6a6e72); this.box(h.x - 8, y + 3.2, h.z + 6, 7, 0.4, 6, 0x3a3e44, 0, false);
    this.gl(gBox(0.2, 1.4, 0.2), mat4(h.x - 4.9, y + 1.8, h.z + 6), 0xffc23a);
    for (const [ox, oz] of [[-12, -10], [12, 10], [12, -12]]) { this.st(gCyl(0.1, 0.14, 4, 5), mat4(h.x + ox, y + 2, h.z + oz), 0x3a3e44); this.gl(gSph(0.3, 0), mat4(h.x + ox, y + 4.1, h.z + oz), 0xfff0c0); }
    if (this.def.r) { const rl = buildRelay(0x4fd6ff); rl.position.set(h.x, y, h.z); this.group.add(rl); this.addBoxCol(h.x, h.z, 3, 3, y - 1, y + 11); this.interact.push({ x: h.x, z: h.z, y, r: 5, kind: 'relay', label: 'Use Relay Pylon' }); this.anims.push(t => rl.userData.rings.forEach((g, i) => g.rotation.z = t * (0.6 + i * 0.3) * (i % 2 ? -1 : 1))); }
    if (this.k === 'island') { const k = buildKiosk('ARMS', 0xffc23a); k.position.set(h.x - 9, y, h.z - 8); k.rotation.y = 0.8; this.group.add(k); this.addBoxCol(h.x - 9, h.z - 8, 2.4, 2.4, y - 1, y + 2.5); this.interact.push({ x: h.x - 9, z: h.z - 8, y, r: 3.4, kind: 'vendor', label: 'Browse Arms Vendor' }); }
    this.arrivals._relay = { x: h.x, z: h.z + 8, yaw: Math.PI };
    this.arrivals._hub = { x: h.x + 2, z: h.z + 13, yaw: Math.PI };
  }
  makeDoor(s, dgId) {
    const y = this.heightAt(s.x, s.z); const t = ZMAP[dgId]; const col = t.st === 'hive' ? 0x3affd0 : 0xc26bff;
    const ang = Math.atan2(-s.x, -s.z); const m = buildDungeonDoor(col); m.position.set(s.x, y, s.z); m.rotation.y = ang; this.group.add(m);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.2), new THREE.MeshBasicMaterial({ map: textTexture(`${t.n.toUpperCase()}  ·  LV ${t.l[0]}-${t.l[1]}`, '#' + new THREE.Color(col).getHexString(), '#0b1018', 768, 128), transparent: true, side: THREE.DoubleSide }));
    sign.position.set(0, 8, 3); m.add(sign);
    const fx = Math.sin(ang), fz = Math.cos(ang);
    this.addBoxCol(s.x - fx * 2, s.z - fz * 2, 9, 9, y - 2, y + 5);
    this.triggers.push({ x: s.x + fx * 3.6, z: s.z + fz * 3.6, r: 2.4, to: dgId, kind: 'door' });
    this.arrivals[dgId] = { x: s.x + fx * 10, z: s.z + fz * 10, yaw: ang + Math.PI };
  }
  makeChest(x, z, rare) {
    const y = this.heightAt(x, z); const m = buildChest(rare); m.position.set(x, y, z); m.rotation.y = rnd() * TAU; this.group.add(m);
    this.addBoxCol(x, z, 1.3, 1.3, y - 1, y + 0.9);
    this.interact.push({ x, z, y, r: 2.8, kind: 'chest', label: rare ? 'Open Vyrium Cache' : 'Open Chest', obj: m, rare });
  }
  scatterProps(ext) {
    const B = this.B, P = this.pal, r = this.rng; const byType = {};
    const crownCols = this.k === 'veil' ? [P.glow, new THREE.Color(P.glow).offsetHSL(0.05, 0, 0).getHex()] :
      B.trees.includes('glowtree') ? [0xff7ae0, 0x7affe0, 0xffe07a] : null;
    const cnt = B.tn;
    for (let i = 0; i < cnt * 1.6 && i < 700; i++) {
      const x = rr(r, -this.half * 0.95, this.half * 0.95), z = rr(r, -this.half * 0.95, this.half * 0.95);
      if (this.nearPad(x, z, 3)) continue; if (this.gateSpots.some(g => Math.hypot(g.x - x, g.z - z) < 20)) continue;
      const y = this.heightAt(x, z); if (y < this.waterY + 0.4) continue;
      const cl = this.nz.n2(x * 0.02 + 70, z * 0.02 + 70); if (cl < -0.15 && r() < 0.7) continue; // clustering
      const type = pick(r, B.trees); const s = rr(r, 0.75, 1.45) * (type === 'mushroom' ? 1.2 : 1);
      (byType[type] = byType[type] || []).push({ x, y: y - 0.2, z, s, ry: r() * TAU });
      if (Object.values(byType).reduce((a, b) => a + b.length, 0) >= cnt) break;
    }
    for (const type in byType) {
      const G = treeGeo(type), list = byType[type];
      const trunkCol = type === 'cactus' ? 0x5a8a4a : type === 'spire' ? P.cl : type === 'dead' ? (B.snowy ? 0x5a5048 : 0x4a4038) : type === 'glowtree' ? 0x3a2a4a : 0x5a4030;
      if (G.trunk) this.inst(G.trunk, toon(0xffffff, { vertexColors: false }), list.map(t => Object.assign({}, t, { c: new THREE.Color(trunkCol).offsetHSL(0, 0, (rnd() - 0.5) * 0.08).getHex() })));
      if (G.crown) {
        const base = type === 'mushroom' ? [0xd8504a, 0x4fb3c8, 0xc87ae0, 0xe0a040] : type === 'pine' ? (B.snowy ? [0xe8f0f4, 0xd0e0e8] : [0x2f5a3a, 0x3a6a40, 0x28503a]) : type === 'palm' ? [0x4a9a3a, 0x5aaa40] :
          B === BIOMES.darkforest ? [0x3a4a5a, 0x4a3a5a, 0x2f4a40] : [P.g[0], P.g[1], 0x4f8a3a, 0x6aa048];
        const cols = crownCols && G.glow ? crownCols : base;
        const mat = G.glow ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : toon(0xffffff);
        this.inst(G.crown, mat, list.map(t => Object.assign({}, t, { c: pick(rnd, cols) })));
      }
      for (const t of list) if (type !== 'crystal') { const rad = (type === 'spire' ? 1.2 : type === 'mushroom' ? 0.5 : 0.35) * t.s; this.addBoxCol(t.x, t.z, rad * 2, rad * 2, t.y - 1, t.y + 6 * t.s); }
    }
    // rocks
    const rocks = [];
    for (let i = 0; i < B.rn; i++) {
      const x = rr(r, -this.half * 0.92, this.half * 0.92), z = rr(r, -this.half * 0.92, this.half * 0.92); if (this.nearPad(x, z, 2)) continue;
      const y = this.heightAt(x, z); const s = rr(r, 0.6, r() < 0.15 ? 4.5 : 2.2); rocks.push({ x, y: y + s * 0.2, z, s, sy: rr(r, 0.6, 1.1), ry: r() * TAU, rx: r(), c: new THREE.Color(P.cl).offsetHSL(0, 0, (r() - 0.5) * 0.12).getHex() });
      if (s > 1.4) this.addBoxCol(x, z, s * 1.3, s * 1.3, y - 1, y + s * 0.9);
    }
    this.inst(geo('rock', () => new THREE.DodecahedronGeometry(1, 0)), toon(0xffffff), rocks);
    // pipes & farm props
    if (B.pipes) for (let i = 0; i < 6; i++) { const x = rr(r, -ext, ext), z = rr(r, -ext, ext); if (this.nearPad(x, z, 6)) continue; const y = this.heightAt(x, z); const L = rr(r, 20, 50), ry = r() * TAU; this.st(gCyl(1.1, 1.1, L, 8), mat4(x, y + 1.8, z, Math.PI / 2, ry, 0), 0x6a6458); for (let k = -1; k <= 1; k++) this.st(gBox(0.6, 2, 0.6), mat4(x + Math.sin(ry) * k * L * 0.35, y + 0.8, z + Math.cos(ry) * k * L * 0.35), 0x4a463e); }
    if (B.farm) for (let i = 0; i < 4; i++) { const s = this.pickSpots(1, 10, 0, ext)[0]; if (!s) continue; const y = this.heightAt(s.x, s.z); this.st(gCyl(3, 3, 12, 10), mat4(s.x, y + 6, s.z), 0xd8d0c0); this.st(new THREE.SphereGeometry(3, 10, 5, 0, TAU, 0, Math.PI / 2), mat4(s.x, y + 12, s.z), 0x8a3a2a); this.addBoxCol(s.x, s.z, 6, 6, y - 1, y + 15); this.box(s.x + 8, y, s.z + 2, 8, 4, 6, 0xa83a2a); }
  }
  buildCamp(c) {
    const r = this.rng, y = this.heightAt(c.x, c.z); const style = this.k === 'veil' ? 'ruin' : pick(r, this.B === BIOMES.darkforest ? ['bandit', 'creature', 'ruin'] : ['bandit', 'creature', 'ruin', 'scrap']);
    if (style === 'bandit') {
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + r(), x = c.x + Math.cos(a) * 7, z = c.z + Math.sin(a) * 7; const col = pick(r, [0x8a6a4a, 0x6a7a5a, 0xa8563a]); this.st(gCone(2.4, 3, 4), mat4(x, y + 1.5, z, 0, a, 0), col); this.addBoxCol(x, z, 3, 3, y - 1, y + 2.5); }
      this.gl(gCone(0.6, 1.2, 5), mat4(c.x, y + 0.6, c.z), 0xff8a2a); this.st(gTorus(0.9, 0.25, 4, 8), mat4(c.x, y + 0.1, c.z, Math.PI / 2, 0, 0), 0x4a4a4a);
      for (let i = 0; i < 4; i++) { const x = c.x + rr(r, -9, 9), z = c.z + rr(r, -9, 9); if (Math.hypot(x - c.x, z - c.z) < 3) continue; this.box(x, this.heightAt(x, z), z, 1.4, 1.2, 1.4, 0x7a5a3a, r()); }
      this.box(c.x + 10, y, c.z - 3, 1, 1.6, 6, 0x6a6458, 0.3);
    } else if (style === 'scrap') {
      for (let i = 0; i < 5; i++) { const a = r() * TAU, x = c.x + Math.cos(a) * rr(r, 5, 10), z = c.z + Math.sin(a) * rr(r, 5, 10); this.box(x, this.heightAt(x, z), z, rr(r, 2, 5), rr(r, 1.5, 3.5), rr(r, 1, 2), pick(r, [0x7a7a80, 0x8a6a4a, 0x5a6a7a]), a); }
      this.st(gCyl(1.2, 1.2, 2.2, 8), mat4(c.x, y + 1.1, c.z), 0x4a4e56); this.gl(gTorus(1.25, 0.12, 4, 12), mat4(c.x, y + 1.6, c.z, Math.PI / 2, 0, 0), 0x4fd6ff); this.addBoxCol(c.x, c.z, 2.4, 2.4, y - 1, y + 2.2);
    } else if (style === 'creature') {
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + r() * 0.4, x = c.x + Math.cos(a) * 9, z = c.z + Math.sin(a) * 9, s = rr(r, 1.2, 2.4); this.st(new THREE.DodecahedronGeometry(s, 0), mat4(x, this.heightAt(x, z) + s * 0.3, z, r(), r(), 0), this.pal.cl); }
      for (let i = 0; i < 5; i++) this.st(gCyl(0.08, 0.1, 1.6, 4), mat4(c.x + rr(r, -4, 4), y + 0.1, c.z + rr(r, -4, 4), Math.PI / 2, r() * 3, 0), 0xe8e0d0);
    } else {
      const col = this.k === 'veil' ? new THREE.Color(this.pal.g[2]).lerp(new THREE.Color(0xffffff), 0.4).getHex() : 0xb8b0a0;
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, x = c.x + Math.cos(a) * 10, z = c.z + Math.sin(a) * 10, h = rr(r, 2, 8); this.box(x, this.heightAt(x, z), z, 1.4, h, 1.4, col); if (h > 6 && i % 2 === 0) this.st(gBox(1.8, 0.6, 1.8), mat4(x, this.heightAt(x, z) + h + 0.3, z), col); }
      this.box(c.x - 4, y, c.z + 6, 8, 2.5, 1, col, 0.4);
      if (this.k === 'veil') this.gl(gSph(1, 1), mat4(c.x, y + 3, c.z), this.pal.glow);
    }
  }
  buildTowerSite(s) {
    const y = this.heightAt(s.x, s.z);
    this.st(gCyl(3, 4, 30, 8), mat4(s.x, y + 15, s.z), 0x5a5e66); this.addBoxCol(s.x, s.z, 7, 7, y - 1, y + 30);
    this.gl(gSph(2.2, 1), mat4(s.x, y + 32, s.z), 0x4fd6ff); this.st(gCyl(4.5, 3, 2, 8), mat4(s.x, y + 30, s.z), 0x3a3e46);
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.4, x = s.x + Math.cos(a) * 16, z = s.z + Math.sin(a) * 16; this.box(x, y, z, 8, 3.5, 1.2, 0x6a6e76, -a + Math.PI / 2); }
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3, x = s.x + Math.cos(a) * 10, z = s.z + Math.sin(a) * 10; this.spawnList.push({ type: 'turret', x, z, lvl: this.lvl[1], tower: true }); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 2), new THREE.MeshBasicMaterial({ map: textTexture('CONTESTED VYRIUM TOWER', '#4fd6ff', '#0b1018', 768, 128), side: THREE.DoubleSide }));
    sign.position.set(s.x, y + 36, s.z); this.group.add(sign); this.anims.push(() => sign.lookAt(camera.position.x, sign.position.y, camera.position.z));
    this.makeChest(s.x + 4, s.z + 5, true);
  }
  buildBossArena(s) {
    const y = this.heightAt(s.x, s.z), r = this.rng; const col = this.k === 'veil' ? this.pal.cl : 0x6a6258;
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, x = s.x + Math.cos(a) * 20, z = s.z + Math.sin(a) * 20, h = rr(r, 3, 9); this.box(x, this.heightAt(x, z) - 0.5, z, 2, h, 2, col, a); }
    const glowc = this.k === 'veil' ? this.pal.glow : 0xff4a3a;
    this.gl(gTorus(14, 0.2, 4, 40), mat4(s.x, y + 0.15, s.z, Math.PI / 2, 0, 0), glowc);
  }
  buildFloaters() {
    const r = this.rng, P = this.pal; const list = [];
    for (let i = 0; i < 14; i++) { const x = rr(r, -this.half, this.half), z = rr(r, -this.half, this.half), y = rr(r, 30, 80), s = rr(r, 3, 9); const g = new THREE.Group();
      mk(new THREE.DodecahedronGeometry(1, 0), toon(P.g[1]), g, 0, 0, 0, 0, 0, 0, 1.3, 0.35, 1.3); mk(gCone(1, 2.2, 6), toon(P.cl), g, 0, -1.2, 0, Math.PI, 0, 0);
      if (r() < 0.5) mk(gSph(0.25, 0), glowMat(P.glow || 0xffffff), g, 0, 0.6, 0);
      g.position.set(x, y, z); g.scale.setScalar(s); this.group.add(g); const ph = r() * TAU; this.anims.push(t => { g.position.y = y + Math.sin(t * 0.4 + ph) * 2; g.rotation.y = t * 0.05 + ph; }); }
  }

  // ---------- CITIES ----------
  buildCity() {
    const d = this.def, r = this.rng, style = d.f || 'neutral', town = d.k === 'town', plat = d.k === 'platform';
    this.placeGates(10);
    const plazaR = town ? 26 : 34;
    for (const g of this.gateSpots) { this.pad(g.x, g.z, 12); const tx = Math.cos(g.ang), tz = Math.sin(g.ang); this.pad(g.x - tx * 18, g.z - tz * 18, 12); }
    const paved = style === 'corp' ? 0x6c7888 : style === 'clan' ? 0x7a6a56 : 0x74806e;
    this.pad(0, 0, plazaR, { paved });
    const roadCol = style === 'corp' ? 0x4a5058 : style === 'clan' ? 0x5a5044 : 0x55605a;
    const BS = town ? 40 : 38;
    this.roads = [];
    this.buildTerrain((x, z) => {
      if (plat) { const dd = Math.hypot(x, z); return dd < 116 ? 0 : -140; }
      return this.fullHeight(x, z) * 0.3;
    }, (c, x, z, h, ny) => {
      if (plat && h < -10) { c.set(0x6a7ab0); return; }
      this.terrainColor(c, x, z, h, ny);
      const ax = Math.abs(((x % BS) + BS) % BS - BS / 2), az = Math.abs(((z % BS) + BS) % BS - BS / 2);
      if ((ax > BS / 2 - 5 || az > BS / 2 - 5) && Math.hypot(x, z) > plazaR) c.set(roadCol);
      if (Math.hypot(x, z) < plazaR) { const ring = Math.floor(Math.hypot(x, z) / 6) % 2; c.set(paved); if (ring) c.offsetHSL(0, 0, -0.04); }
    }, 90);
    this.makeGates();
    if (plat) { this.st(gCyl(118, 40, 60, 24), mat4(0, -31, 0), 0x5a6270); this.st(gCyl(119, 119, 1.6, 48), mat4(0, -0.6, 0), 0x8a96a8); this.gl(gTorus(118, 0.4, 4, 64), mat4(0, 1.2, 0, Math.PI / 2, 0, 0), 0x4fd6ff);
      for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; this.st(gCyl(0.15, 0.15, 1.6, 4), mat4(Math.cos(a) * 117, 0.8, Math.sin(a) * 117), 0x8a96a8); } }
    // buildings
    const winLit = style === 'corp' ? '#7ae0ff' : style === 'clan' ? '#ffc070' : '#d8ffb0';
    const bmatList = []; const signs = SIGNS[style].slice(); let signCount = 0; const towers = [];
    const lim = (plat ? 100 : this.half - 30);
    for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) {
      const cx = i * BS, cz = j * BS; if (Math.abs(cx) > lim || Math.abs(cz) > lim) continue; if (plat && Math.hypot(cx, cz) > 92) continue;
      if (Math.hypot(cx, cz) < plazaR + BS * 0.5) continue;
      if (this.gateSpots.some(g => { const L = Math.hypot(g.x, g.z); const t = clamp((cx * g.x + cz * g.z) / (L * L), 0, 1); return Math.hypot(cx - g.x * t, cz - g.z * t) < 22; })) continue;
      const inner = BS - 12; const n = style === 'corp' ? ri(r, 1, 2) : ri(r, 2, 3);
      const cells = n === 1 ? [[0, 0, inner, inner]] : n === 2 ? [[-inner / 4, 0, inner / 2 - 1, inner], [inner / 4, 0, inner / 2 - 1, inner]] : [[-inner / 4, -inner / 4, inner / 2 - 1, inner / 2 - 1], [inner / 4, -inner / 4, inner / 2 - 1, inner / 2 - 1], [0, inner / 4, inner - 1, inner / 2 - 1]];
      const centrality = 1 - clamp(Math.hypot(cx, cz) / (this.half * 0.9), 0, 1);
      for (const [ox, oz, mw, md] of cells) {
        const w = rr(r, mw * 0.65, mw), dd = rr(r, md * 0.65, md), x = cx + ox, z = cz + oz; const y = this.heightAt(x, z) - 0.3;
        let h, col;
        if (style === 'corp') { h = rr(r, 18, 46) * (0.7 + centrality * 1.1); col = pick(r, [0xe8eef4, 0xdce6f0, 0xc8d6e4, 0xf4f6f8, 0xb8c8d8, 0x4a5e7a, 0x3a4c66]); }
        else if (style === 'clan') { h = rr(r, 5, 15) * (0.8 + centrality * 0.6); col = pick(r, [0x9a6a4a, 0x8a7a5a, 0xa8845a, 0x7a6a5a, 0xb07050, 0x6a7058]); }
        else { h = rr(r, 8, 26) * (0.8 + centrality * 0.8); col = pick(r, [0xb8c4b0, 0xa8b8b0, 0xd8dcd0, 0x98a8a0, 0xc8c0a8]); }
        if (town) h *= 0.6;
        bmatList.push({ x, y, z, w, h, d: dd, col });
        this.addBoxCol(x, z, w, dd, y - 3, y + h);
        this.st(gBox(w + 0.6, 0.8, dd + 0.6), mat4(x, y + 0.4, z), style === 'corp' ? 0x3a4656 : style === 'clan' ? 0x4a3a2c : 0x4a5648);
        this.gl(gBox(w + 0.7, 0.18, dd + 0.7), mat4(x, y + 3.4, z), style === 'corp' ? 0x4fd6ff : style === 'clan' ? 0xff9a3d : 0x9be37a);
        // tops
        if (style === 'corp') {
          if (r() < 0.6) { const w2 = w * rr(r, 0.5, 0.75), d2 = dd * rr(r, 0.5, 0.75), h2 = rr(r, 6, 18); bmatList.push({ x, y: y + h, z, w: w2, h: h2, d: d2, col }); this.addBoxCol(x, z, w2, d2, y + h, y + h + h2); h += h2; }
          this.st(gCyl(0.2, 0.3, 6, 4), mat4(x + w * 0.2, y + h + 3, z), 0x8a96a8); this.gl(gSph(0.4, 0), mat4(x + w * 0.2, y + h + 6.2, z), 0xff3a4a);
          this.gl(gBox(w + 0.3, 0.35, dd + 0.3), mat4(x, y + h - 0.6, z), 0x4fd6ff);
          towers.push({ x, z, y, h, w, d: dd });
        } else if (style === 'clan') {
          this.st(gBox(w + 1.2, 0.5, dd + 1.2), mat4(x, y + h + 0.25, z), 0x4a3a30);
          if (r() < 0.35) this.st(new THREE.SphereGeometry(Math.min(w, dd) * 0.45, 10, 6, 0, TAU, 0, Math.PI / 2), mat4(x, y + h + 0.5, z), pick(r, [0xa8845a, 0x8a5a3a, 0xc8a070]));
          if (r() < 0.3) { this.st(gCyl(1.6, 1.6, 3, 8), mat4(x + w * 0.25, y + h + 4.5, z), 0x7a6050); for (const s of [-1, 1]) this.st(gBox(0.2, 3, 0.2), mat4(x + w * 0.25 + s, y + h + 1.5, z), 0x3a3028); }
          if (r() < 0.5) { const bc = pick(r, [0xc83a2a, 0xe87a2a, 0xe8c040]); this.st(gBox(0.1, rr(r, 2, 4), 1.6), mat4(x + w / 2 + 0.1, y + h * 0.6, z), bc); }
          if (r() < 0.4) this.st(gCyl(0.4, 0.5, 4, 6), mat4(x - w * 0.3, y + h + 2, z - dd * 0.25), 0x3a3430);
        } else {
          if (r() < 0.45) this.st(new THREE.SphereGeometry(Math.min(w, dd) * 0.48, 12, 6, 0, TAU, 0, Math.PI / 2), mat4(x, y + h, z), pick(r, [0x7ab0a0, 0xd8dcd0, 0x9ac0b8]));
          else this.gl(gBox(w + 0.3, 0.3, dd + 0.3), mat4(x, y + h - 0.5, z), 0x9be37a);
        }
        // signs
        if (signCount < (town ? 3 : 9) && r() < 0.45 && h > 8) {
          signCount++; const txt = signs[signCount % signs.length]; const fg = style === 'corp' ? '#7ae0ff' : style === 'clan' ? '#ffb070' : '#c8ff9a';
          const sm = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.9, 12), 2.6), new THREE.MeshBasicMaterial({ map: textTexture(txt, fg, style === 'clan' ? '#1a120c' : '#08121c'), side: THREE.DoubleSide }));
          const face = pick(r, [0, 1, 2, 3]); const fx = [0, 0, 1, -1][face], fz = [1, -1, 0, 0][face];
          sm.position.set(x + fx * (w / 2 + 0.15), y + Math.min(h - 2, rr(r, 6, 14)), z + fz * (dd / 2 + 0.15)); sm.rotation.y = Math.atan2(fx, fz); this.group.add(sm);
        }
      }
    }
    // build merged buildings with window textures
    if (bmatList.length) {
      const WS = 14; const items = [];
      for (const b of bmatList) {
        const g = new THREE.BoxGeometry(b.w, b.h, b.d); const uv = g.attributes.uv;
        const dims = [[b.d, b.h], [b.d, b.h], [0, 0], [0, 0], [b.w, b.h], [b.w, b.h]];
        for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; if (f === 2 || f === 3) uv.setXY(i, 0.1, 0.9); else uv.setXY(i, uv.getX(i) * dims[f][0] / WS, uv.getY(i) * dims[f][1] / WS); }
        items.push({ g, m: mat4(b.x, b.y + b.h / 2, b.z), c: b.col });
      }
      const geom = mergeGeos(items); items.forEach(i => i.g.dispose());
      const frame = style === 'corp' ? '#9aa8b8' : style === 'clan' ? '#3a2a20' : '#6a7a70';
      const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradTex, map: windowTexture(winLit, '#f4f4f4', frame, this.seed), emissiveMap: glowTexture(winLit, this.seed), emissive: 0xffffff, emissiveIntensity: 0.9 });
      this.group.add(new THREE.Mesh(geom, mat));
    }
    // skybridges
    if (style === 'corp') for (let i = 0; i < towers.length; i++) for (let j = i + 1; j < towers.length; j++) {
      const a = towers[i], b = towers[j]; const dd = Math.hypot(a.x - b.x, a.z - b.z); if (dd > BS * 1.2 || r() > 0.35) continue; const hy = a.y + Math.min(a.h, b.h) * rr(r, 0.4, 0.7);
      this.st(gBox(3, 2, dd), mat4((a.x + b.x) / 2, hy, (a.z + b.z) / 2, 0, Math.atan2(b.x - a.x, b.z - a.z), 0), 0xd8e2ec); this.gl(gBox(3.1, 0.3, dd), mat4((a.x + b.x) / 2, hy + 0.6, (a.z + b.z) / 2, 0, Math.atan2(b.x - a.x, b.z - a.z), 0), 0x4fd6ff);
    }
    // street lamps at intersections
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) { const x = i * BS + BS / 2, z = j * BS + BS / 2; if (Math.abs(x) > lim || Math.abs(z) > lim || Math.hypot(x, z) < plazaR) continue; if (plat && Math.hypot(x, z) > 108) continue; const y = this.heightAt(x, z); this.st(gCyl(0.12, 0.18, 6, 5), mat4(x + 3, y + 3, z + 3), 0x2a2e34); this.gl(gBox(0.6, 0.3, 0.6), mat4(x + 3, y + 6.1, z + 3), style === 'clan' ? 0xffb050 : 0xe0f8ff); }
    // plaza centerpiece
    const y0 = this.heightAt(0, 0);
    if (style === 'corp') {
      this.st(gCyl(4, 5, 1.2, 8), mat4(0, y0 + 0.6, -18), 0xdce6f0); this.st(gCyl(0.8, 1.2, 16, 6), mat4(0, y0 + 8, -18), 0xe8eef4); this.addBoxCol(0, -18, 8, 8, y0 - 1, y0 + 16);
      const rings = []; for (let i = 0; i < 3; i++) { const m = mk(gTorus(4 + i * 1.6, 0.18, 5, 32), glowMat(0x4fd6ff), this.group, 0, y0 + 12 + i * 2.5, -18); rings.push(m); }
      this.anims.push(t => rings.forEach((m, i) => { m.rotation.x = t * (0.3 + i * 0.2); m.rotation.y = t * 0.4 * (i % 2 ? 1 : -1); }));
      const holo = new THREE.Mesh(new THREE.PlaneGeometry(22, 5), new THREE.MeshBasicMaterial({ map: textTexture('CYREX CONSOLIDATED', '#7ae0ff', null, 1024, 160), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      holo.position.set(0, y0 + 24, -18); this.group.add(holo); this.anims.push(t => { holo.rotation.y = t * 0.3; });
    } else if (style === 'clan') {
      this.st(gCyl(3, 3.6, 1.6, 8), mat4(0, y0 + 0.8, -16), 0x4a3a30); this.gl(gCone(2.2, 4.5, 6), mat4(0, y0 + 3.6, -16), 0xff7a2a); this.gl(gCone(1.2, 3, 6), mat4(0, y0 + 4.5, -16), 0xffd04a); this.addBoxCol(0, -16, 7, 7, y0 - 1, y0 + 2);
      for (const s of [-1, 1]) { this.box(s * 9, y0, -18, 1.4, 12, 1.4, 0x5a4030); this.st(gBox(0.1, 6, 3), mat4(s * 9 + 0.8, y0 + 8, -18), 0xc83a2a); }
    } else {
      this.st(gCyl(7, 7.6, 1.2, 16), mat4(0, y0 + 0.6, -16), 0xb8c0b0); this.gl(gCyl(6.2, 6.2, 0.2, 16), mat4(0, y0 + 1.1, -16), 0x7ae0e8); this.st(gCyl(0.8, 1.2, 5, 8), mat4(0, y0 + 2.5, -16), 0xd8dcd0); this.gl(gSph(1.2, 1), mat4(0, y0 + 5.6, -16), 0x9be37a); this.addBoxCol(0, -16, 14, 14, y0 - 1, y0 + 1.2);
      for (let i = 0; i < 6; i++) { const a = 2.3 + i * 0.32, x = Math.cos(a) * 27, z = Math.sin(a) * 27, ry = -a + Math.PI / 2; this.box(x, y0, z, 2.6, 1.1, 1.4, 0x6a5a4a, ry); for (const s of [-1, 1]) this.st(gCyl(0.06, 0.06, 2.6, 4), mat4(x + Math.cos(ry) * s * 1.2, y0 + 1.3, z - Math.sin(ry) * s * 1.2), 0x3a3430); this.st(gBox(3.2, 0.15, 2.2), mat4(x, y0 + 2.7, z, 0.18, ry, 0), pick(r, [0xc83a3a, 0x3a8ac8, 0xe8c040, 0x5ab05a])); this.gl(gBox(0.5, 0.4, 0.5), mat4(x + 0.5, y0 + 1.3, z), pick(r, [0xff8a3a, 0x9be37a, 0x4fd6ff])); }
    }
    // planters around the plaza
    const pl = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + 0.26, x = Math.cos(a) * (plazaR - 3), z = Math.sin(a) * (plazaR - 3); if (this.gateSpots.some(g => Math.hypot(g.x - x, g.z - z) < 70 && Math.abs(Math.atan2(g.z, g.x) - Math.atan2(z, x)) < 0.3)) continue; if (z > 4 && Math.abs(x) < 8) continue; const y = this.heightAt(x, z); this.box(x, y, z, 3.2, 0.9, 3.2, style === 'clan' ? 0x6a5040 : 0x5a6676); pl.push({ x, y: y + 0.8, z, s: rr(r, 0.7, 0.95), ry: r() * 3, c: style === 'clan' ? 0x8a8a3a : pick(r, [0x4f8a3a, 0x5aa048, 0x3f7a40]) }); }
    { const G = treeGeo(style === 'clan' ? 'dead' : 'broad'); this.inst(G.trunk, toon(0xffffff), pl.map(t => Object.assign({}, t, { c: 0x5a4030 }))); if (G.crown) this.inst(G.crown, toon(0xffffff), pl); }
    // POIs
    const fac = FACTIONS[style]; const facCol = fac.hex;
    const relay = buildRelay(facCol); relay.position.set(0, y0, 8); this.group.add(relay); this.addBoxCol(0, 8, 3, 3, y0 - 1, y0 + 11);
    this.interact.push({ x: 0, z: 8, y: y0, r: 5, kind: 'relay', label: 'Use Relay Pylon' }); this.anims.push(t => relay.userData.rings.forEach((g, i) => g.rotation.z = t * (0.6 + i * 0.3) * (i % 2 ? -1 : 1)));
    const k1 = buildKiosk('ARMS', 0xffc23a); k1.position.set(-15, y0, 0); k1.rotation.y = Math.PI / 2; this.group.add(k1); this.addBoxCol(-15, 0, 1.6, 2.6, y0 - 1, y0 + 2.4);
    this.interact.push({ x: -13.6, z: 0, y: y0, r: 3.4, kind: 'vendor', label: 'Browse Arms Vendor' });
    const k2 = buildKiosk('SUPPLY', 0x5cf0a0); k2.position.set(15, y0, 0); k2.rotation.y = -Math.PI / 2; this.group.add(k2); this.addBoxCol(15, 0, 1.6, 2.6, y0 - 1, y0 + 2.4);
    this.interact.push({ x: 13.6, z: 0, y: y0, r: 3.4, kind: 'supply', label: 'Browse Supply Vendor' });
    const tm = buildTerminal(); tm.position.set(-9, y0, 16); this.group.add(tm); this.addBoxCol(-9, 16, 1.8, 1.8, y0 - 1, y0 + 2);
    this.interact.push({ x: -9, z: 16, y: y0, r: 3.4, kind: 'terminal', label: 'Open Mission Terminal' }); this.anims.push(t => { tm.userData.rings[0].rotation.z = t; tm.userData.sign.lookAt(camera.position.x, tm.userData.sign.getWorldPosition(_v).y, camera.position.z); });
    const bo = buildBooth(); bo.position.set(10, y0, 16); this.group.add(bo); this.addBoxCol(10, 16, 2.4, 2.4, y0 - 1, y0 + 3.5); this.booths.push({ x: 10, z: 18.5 });
    this.arrivals._relay = { x: 0, z: 15, yaw: Math.PI }; this.arrivals._hub = this.arrivals._relay;
    (this.def.dg || []).forEach((dg) => { const ang = r() * TAU; const s = { x: Math.cos(ang) * (plat ? 60 : 70), z: Math.sin(ang) * (plat ? 60 : 70) }; this.makeDoor(s, dg); });
    // hover cars
    if (style !== 'clan') for (let i = 0; i < (town ? 4 : 10); i++) {
      const car = new THREE.Group(); mk(gBox(2.2, 0.9, 4.4), toon(pick(r, [0xe84a3a, 0x3a8ae8, 0xf2f2f2, 0xf2c230, 0x2a2a2a])), car, 0, 0, 0); mk(gBox(1.8, 0.7, 2), toon(0x2a3a4a), car, 0, 0.7, -0.3);
      mk(gBox(2, 0.15, 0.2), glowMat(0xff3a3a), car, 0, 0.1, -2.25); mk(gBox(2, 0.15, 0.2), glowMat(0xffffff), car, 0, 0.1, 2.25); this.group.add(car);
      const rad = rr(r, 50, plat ? 100 : 130), hy = rr(r, 22, 48), sp = rr(r, 0.05, 0.12) * (r() < 0.5 ? -1 : 1), ph = r() * TAU;
      compactModel(car); this.anims.push(t => { const a = ph + t * sp; car.position.set(Math.cos(a) * rad, hy, Math.sin(a) * rad); car.rotation.y = -a + (sp > 0 ? 0 : Math.PI); });
    }
    // guards and civilians
    const L = 60; const gp = [[-20, 22], [20, 22], [-22, -10], [22, -10]];
    for (const g of this.gateSpots) { const tx = Math.cos(g.ang), tz = Math.sin(g.ang); gp.push([g.x - tx * 10 - tz * 6, g.z - tz * 10 + tx * 6], [g.x - tx * 10 + tz * 6, g.z - tz * 10 - tx * 6]); }
    for (const [x, z] of gp) this.spawnList.push({ type: 'guard', x, z, lvl: L, guard: true, faction: style });
    this.civilians = [];
    for (let i = 0; i < (town ? 6 : 14); i++) { const a = r() * TAU, rad = rr(r, 8, plazaR + 40); this.spawnList.push({ type: 'civ', x: Math.cos(a) * rad, z: Math.sin(a) * rad, civ: true }); }
  }

  // ---------- DUNGEONS ----------
  buildDungeon() {
    const d = this.def, r = this.rng, S = this.ds; const GW = 5, CS = 30, off = -(GW * CS) / 2 + CS / 2; const WH = 7.5;
    const cells = []; for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) cells.push({ i, j, links: new Set(), w: rr(r, 15, 24), d: rr(r, 15, 24) });
    const C = (i, j) => cells[j * GW + i];
    const start = C(0, 2); const stack = [start]; const vis = new Set([start]);
    while (stack.length) { const c = stack[stack.length - 1]; const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [c.i + a, c.j + b]).filter(([a, b]) => a >= 0 && b >= 0 && a < GW && b < GW && !vis.has(C(a, b)));
      if (!nb.length) { stack.pop(); continue; } const [a, b] = pick(r, nb); const n = C(a, b); c.links.add(n); n.links.add(c); vis.add(n); stack.push(n); }
    for (let k = 0; k < 4; k++) { const c = pick(r, cells); const nb = [[1, 0], [0, 1]].map(([a, b]) => [c.i + a, c.j + b]).filter(([a, b]) => a < GW && b < GW); if (nb.length) { const n = C(...pick(r, nb)); c.links.add(n); n.links.add(c); } }
    // BFS for farthest
    const dist = new Map([[start, 0]]); const q = [start]; while (q.length) { const c = q.shift(); for (const n of c.links) if (!dist.has(n)) { dist.set(n, dist.get(c) + 1); q.push(n); } }
    let bossCell = start; for (const [c, dd] of dist) if (dd > dist.get(bossCell)) bossCell = c;
    bossCell.w = 26; bossCell.d = 26; start.w = 20; start.d = 20;
    this.buildTerrain(() => 0, (c, x, z) => { c.set(S.floor); if ((Math.floor(x / 4) + Math.floor(z / 4)) % 2 === 0) c.offsetHSL(0, 0, -0.03); }, 40);
    const wallC = S.wall, trim = S.trim; const DW = 6;
    const wall = (x0, z0, x1, z1) => { const w = Math.abs(x1 - x0) || 1, dd = Math.abs(z1 - z0) || 1; this.box((x0 + x1) / 2, 0, (z0 + z1) / 2, w, WH, dd, wallC); };
    const wallWithGap = (x0, z0, x1, z1, gap) => { if (!gap) return wall(x0, z0, x1, z1); if (x0 === x1) { const m = (z0 + z1) / 2; wall(x0, z0, x0, m - DW / 2); wall(x0, m + DW / 2, x0, z1); } else { const m = (x0 + x1) / 2; wall(x0, z0, m - DW / 2, z0); wall(m + DW / 2, z0, x1, z0); } };
    for (const c of cells) {
      const cx = off + c.i * CS, cz = off + c.j * CS; c.x = cx; c.z = cz; const hw = c.w / 2, hd = c.d / 2;
      const has = (a, b) => [...c.links].some(n => n.i === c.i + a && n.j === c.j + b);
      wallWithGap(cx - hw, cz - hd, cx + hw, cz - hd, has(0, -1)); wallWithGap(cx - hw, cz + hd, cx + hw, cz + hd, has(0, 1));
      wallWithGap(cx - hw, cz - hd, cx - hw, cz + hd, has(-1, 0)); wallWithGap(cx + hw, cz - hd, cx + hw, cz + hd, has(1, 0));
      for (const n of c.links) { if (n.i < c.i || n.j < c.j) continue; const nx = off + n.i * CS, nzz = off + n.j * CS;
        if (n.i > c.i) { const a = cx + hw, b = nx - n.w / 2; wall(a, cz - DW / 2 - 0.5, b, cz - DW / 2 - 0.5); wall(a, cz + DW / 2 + 0.5, b, cz + DW / 2 + 0.5); this.gl(gBox(Math.abs(b - a), 0.2, 0.2), mat4((a + b) / 2, WH - 0.6, cz - DW / 2), trim); }
        else { const a = cz + hd, b = nzz - n.d / 2; wall(cx - DW / 2 - 0.5, a, cx - DW / 2 - 0.5, b); wall(cx + DW / 2 + 0.5, a, cx + DW / 2 + 0.5, b); this.gl(gBox(0.2, 0.2, Math.abs(b - a)), mat4(cx - DW / 2, WH - 0.6, (a + b) / 2), trim); } }
      // light strips + deco
      this.gl(gBox(c.w - 2, 0.25, 0.2), mat4(cx, WH - 0.8, cz - hd + 0.6), trim); this.gl(gBox(c.w - 2, 0.25, 0.2), mat4(cx, WH - 0.8, cz + hd - 0.6), trim);
      if (c.w > 19 && c.d > 19) for (const [px, pz] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) { if (r() < 0.6) this.box(cx + px * c.w * 0.25, 0, cz + pz * c.d * 0.25, 1.6, WH, 1.6, d.st === 'hive' ? 0x8a4a9a : wallC); }
      if (d.st === 'hive') for (let k = 0; k < 4; k++) this.gl(gSph(rr(r, 0.4, 0.9), 0), mat4(cx + rr(r, -hw + 1, hw - 1), rr(r, 0.5, 5), cz + (r() < 0.5 ? -hd + 0.8 : hd - 0.8)), trim);
      else if (r() < 0.6) for (let k = 0; k < 3; k++) { const x = cx + rr(r, -hw + 2, hw - 2), z = cz + rr(r, -hd + 2, hd - 2); if (Math.hypot(x - cx, z - cz) < 4) continue; this.box(x, 0, z, 1.4, 1.2, 1.4, d.st === 'temple' ? 0x9a8a6a : 0x6a5a4a, r()); }
    }
    this.st(gBox(GW * CS + 10, 1, GW * CS + 10), mat4(0, WH + 0.5, 0), new THREE.Color(wallC).multiplyScalar(0.55).getHex());
    // portal back
    const sx = start.x - start.w / 2 + 3; const portalTo = d.par; const pg = buildGate(ZMAP[portalTo].n, 0xc26bff, true); pg.scale.setScalar(0.7); pg.position.set(sx - 1.5, 0, start.z); pg.rotation.y = Math.PI / 2; this.group.add(pg);
    this.anims.push(t => { pg.userData.portal.material.opacity = 0.3 + Math.sin(t * 3) * 0.1; });
    this.triggers.push({ x: sx - 1.6, z: start.z, r: 2.2, to: portalTo, kind: 'gate' });
    const fl = [...start.links][0]; const fdx = fl.i - start.i, fdz = fl.j - start.j; this.arrivals[portalTo] = { x: start.x, z: start.z, yaw: Math.atan2(-fdx, -fdz) }; this.arrivals._relay = this.arrivals[portalTo]; this.arrivals._hub = this.arrivals[portalTo];
    const bo = buildBooth(); bo.position.set(start.x + 4, 0, start.z - start.d / 2 + 2.5); this.group.add(bo); this.addBoxCol(start.x + 4, start.z - start.d / 2 + 2.5, 2.4, 2.4, -1, 3.5); this.booths.push({ x: start.x + 4, z: start.z - start.d / 2 + 5 });
    this.gateSpots = [];
    const L = this.lvl; const pool = POOLS[d.st === 'hive' ? 'hive' : 'dungeon'];
    for (const c of cells) {
      if (c === start) continue;
      if (c === bossCell) { this.spawnList.push({ type: d.boss[1], x: c.x, z: c.z, lvl: L[1] + 1, boss: true }); this.makeChest(c.x + 6, c.z + 6, true); this.bossSpot = { x: c.x, z: c.z }; continue; }
      const dd = dist.get(c) / dist.get(bossCell); const n = r() < 0.2 ? 0 : ri(r, 1, 3);
      for (let k = 0; k < n; k++) this.spawnList.push({ type: pick(r, pool), x: c.x + rr(r, -c.w / 3, c.w / 3), z: c.z + rr(r, -c.d / 3, c.d / 3), lvl: Math.round(lerp(L[0], L[1], dd)) });
      if (c.links.size === 1) this.makeChest(c.x + rr(r, -3, 3), c.z + rr(r, -3, 3), r() < 0.3);
    }
  }

  update(t) { for (const a of this.anims) a(t); if (this.sky) this.sky.position.copy(camera.position); }
  dispose() {
    scene.remove(this.group); const cached = new Set(GEO.values()); Object.values(TREE_GEO).forEach(g => { if (g.trunk) cached.add(g.trunk); if (g.crown) cached.add(g.crown); });
    const mats = new Set(matCache.values());
    this.group.traverse(o => { if (o.isMesh || o.isPoints || o.isInstancedMesh) { if (o.geometry && !cached.has(o.geometry)) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m && !mats.has(m) && m !== INK_MAT) { if (m.map) m.map.dispose(); if (m.emissiveMap) m.emissiveMap.dispose(); m.dispose(); } } });
  }
}
