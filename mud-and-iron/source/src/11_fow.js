// Mud & Iron — fog of war: per-team visibility grids, the player's explored map and the fog texture

const VIS = [null, null];
let EXPLORED = null, FOGV = null, fogTex = null, fogData = null;
const FOW = { t: 0, off: {}, on: true };

function initFOW() {
  const n = MAP.cw * MAP.ch;
  VIS[0] = new Uint16Array(n); VIS[1] = new Uint16Array(n);
  EXPLORED = new Uint8Array(n); FOGV = new Float32Array(n).fill(0.2);
  fogData = new Uint8Array(n * 4);
  if (fogTex) fogTex.dispose();
  fogTex = new THREE.DataTexture(fogData, MAP.cw, MAP.ch, THREE.RGBAFormat);
  fogTex.magFilter = THREE.LinearFilter; fogTex.minFilter = THREE.LinearFilter;
  fogTex.wrapS = fogTex.wrapT = THREE.ClampToEdgeWrapping;
  FOGU.tex.value = fogTex; FOGU.inv.value.set(1 / MAP.W, 1 / MAP.H);
  FOW.t = 0;
  computeVis();
  for (let i = 0; i < n; i++) FOGV[i] = fogTarget(i);
  uploadFog();
}
function discOffsets(r) {
  if (FOW.off[r]) return FOW.off[r];
  const o = [];
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.6) o.push(i, j);
  return (FOW.off[r] = o);
}
function stamp(vis, x, z, rm) {
  const r = Math.max(1, Math.round(rm / CS)), off = discOffsets(r);
  const ci = Math.floor(x / CS), cj = Math.floor(z / CS), cw = MAP.cw, ch = MAP.ch;
  for (let k = 0; k < off.length; k += 2) {
    const i = ci + off[k], j = cj + off[k + 1];
    if (i < 0 || j < 0 || i >= cw || j >= ch) continue;
    vis[j * cw + i]++;
  }
}
function computeVis() {
  VIS[0].fill(0); VIS[1].fill(0);
  const wk = 1 - WEATHER.rain * 0.25;
  for (const e of ENTS) {
    if (e.dead || e.team < 0 || e.team > 1) continue;
    let s = e.sight * wk;
    if (e.kind === 'bld') s = e.built >= 1 ? e.def.sight : 14;
    else if (e.kind === 'squad' && e.retreat) s *= 0.6;
    stamp(VIS[e.team], e.x, e.z, s);
  }
  for (const p of MAP.points) if (p.owner >= 0) stamp(VIS[p.owner], p.x, p.z, 16);
  for (const p of PLANES) if (!p.down && inMap(p.x, p.z)) stamp(VIS[p.team], p.x, p.z, p.kind === 'recon' ? 30 : 16);
  for (const r of REVEALS) stamp(VIS[r.team], r.x, r.z, r.r);
}
function visibleTo(team, x, z) {
  if (team < 0 || team > 1 || !VIS[team]) return false;
  if (team === 0 && !FOW.on) return true;
  return VIS[team][cellIdx(x, z)] > 0;
}
const fogTarget = (i) => (!FOW.on || VIS[0][i] ? 1 : EXPLORED[i] ? 0.6 : 0.32);
// Upload with a light 3x3 blur so the 4 m cells don't read as blocks.
function uploadFog() {
  const cw = MAP.cw, ch = MAP.ch;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    let s = 0, wsum = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const x = i + di, y = j + dj;
      if (x < 0 || y < 0 || x >= cw || y >= ch) continue;
      const w = di || dj ? (di && dj ? 0.5 : 1) : 2;
      s += FOGV[y * cw + x] * w; wsum += w;
    }
    const k = j * cw + i, v = Math.round(s / wsum * 255);
    fogData[k * 4] = fogData[k * 4 + 1] = fogData[k * 4 + 2] = v; fogData[k * 4 + 3] = 255;
  }
  fogTex.needsUpdate = true;
}
function updateFOW(dt) {
  FOW.t -= dt;
  if (FOW.t <= 0) {
    FOW.t = 0.2;
    computeVis();
    const v0 = VIS[0], n = v0.length;
    for (let i = 0; i < n; i++) if (v0[i]) EXPLORED[i] = 1;
    for (const e of ENTS) {
      if (e.dead) continue;
      e.vis = e.team === 0 || visibleTo(0, e.x, e.z);
      if (e.kind === 'bld' && e.vis) e.seen = true;
    }
  }
  // fade the texture toward the current state
  const n = FOGV.length, k = 1 - Math.exp(-dt * 6);
  let changed = false;
  for (let i = 0; i < n; i++) {
    const t = fogTarget(i), v = FOGV[i];
    if (Math.abs(t - v) > 0.004) { FOGV[i] = v + (t - v) * k; changed = true; }
  }
  if (changed) uploadFog();
}
