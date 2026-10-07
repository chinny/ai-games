// Studworks — the build: brick records, occupancy grid, instanced rendering, undo history and save files.
// A brick record is { id, type, color, x, y, z, rot }: (x, z) is the min corner of its rotated footprint
// in studs, y is its bottom in plates. Bricks of one type and opacity share one InstancedMesh ("pool").

const world = {
  size: 32,
  base: 'green',
  bricks: new Map(),  // id -> brick
  cells: new Map(),   // occupied cell -> brick
  pools: new Map(),
  nextId: 1,
  loading: false,
  lifted: null,       // snapshots of bricks picked up mid-move: still part of the build for saving
};
const listeners = [];
const onWorldChange = (fn) => listeners.push(fn);

const cellKey = (x, y, z) => (y * 64 + z) * 64 + x;  // baseplates are at most 48 studs
const extentOf = (b) => { const t = TYPE[b.type]; const [W, D] = dimsOf(t, b.rot); return [W, D, t.h]; };
const snap = (b) => ({ id: b.id, type: b.type, color: b.color, x: b.x, y: b.y, z: b.z, rot: b.rot });

function eachCell(b, fn) {
  const [W, D, h] = extentOf(b);
  for (let y = b.y; y < b.y + h; y++) {
    for (let z = b.z; z < b.z + D; z++) for (let x = b.x; x < b.x + W; x++) fn(cellKey(x, y, z));
  }
}
function inBounds(b) {
  const [W, D, h] = extentOf(b);
  return b.x >= 0 && b.z >= 0 && b.y >= 0 && b.x + W <= world.size && b.z + D <= world.size && b.y + h <= MAX_Y;
}
function fits(b) {
  if (!inBounds(b)) return false;
  let free = true;
  eachCell(b, (k) => { if (free && world.cells.has(k)) free = false; });
  return free;
}
const groupFits = (list) => list.every(fits);

// ---------------------------------------------------------------------------
// Instanced pools
const _m = new THREE.Matrix4();
function growPool(p, cap) {
  const mesh = new THREE.InstancedMesh(typeGeometry(p.type), p.trans ? transMat : brickMat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  mesh.castShadow = true;
  mesh.receiveShadow = !p.trans;
  mesh.frustumCulled = false;  // instances sit far from the mesh origin
  mesh.userData.pool = p;
  if (p.mesh) {
    mesh.instanceMatrix.array.set(p.mesh.instanceMatrix.array);
    mesh.instanceColor.array.set(p.mesh.instanceColor.array);
    bricksGroup.remove(p.mesh);
    p.mesh.dispose();
  }
  mesh.count = p.n;
  p.mesh = mesh;
  p.cap = cap;
  bricksGroup.add(mesh);
}
function poolFor(type, trans) {
  const key = type.id + (trans ? '/t' : '');
  let p = world.pools.get(key);
  if (!p) {
    p = { type, trans, n: 0, cap: 0, list: [], mesh: null };
    growPool(p, 16);
    world.pools.set(key, p);
  }
  if (p.n >= p.cap) growPool(p, p.cap * 2);
  return p;
}
function writeInstance(b) {
  const p = b.pool;
  p.mesh.setMatrixAt(b.slot, brickMatrix(TYPE[b.type], b.x, b.y, b.z, b.rot, _m));
  p.mesh.setColorAt(b.slot, COLOR[b.color].linear);
  p.mesh.instanceMatrix.needsUpdate = true;
  p.mesh.instanceColor.needsUpdate = true;
}

function addBrick(s) {
  const b = { id: s.id || world.nextId++, type: s.type, color: s.color, x: s.x, y: s.y, z: s.z, rot: s.rot & 3 };
  world.nextId = Math.max(world.nextId, b.id + 1);
  const p = poolFor(TYPE[b.type], !!COLOR[b.color].trans);
  b.pool = p;
  b.slot = p.n;
  p.list[p.n++] = b;
  p.mesh.count = p.n;
  writeInstance(b);
  eachCell(b, (k) => world.cells.set(k, b));
  world.bricks.set(b.id, b);
  changed();
  return b;
}
function removeBrick(b) {
  const p = b.pool;
  if (!p) return;
  const last = p.list[p.n - 1];
  if (last !== b) {
    last.slot = b.slot;
    p.list[b.slot] = last;
    writeInstance(last);
  }
  p.n--;
  p.list.length = p.n;
  p.mesh.count = p.n;
  p.mesh.instanceMatrix.needsUpdate = true;
  eachCell(b, (k) => { if (world.cells.get(k) === b) world.cells.delete(k); });
  world.bricks.delete(b.id);
  b.pool = null;
  changed();
}
function clearBricks() {
  for (const p of world.pools.values()) { bricksGroup.remove(p.mesh); p.mesh.dispose(); }
  world.pools.clear();
  world.bricks.clear();
  world.cells.clear();
  changed();
}

let saveTimer = 0;
function changed() {
  renderer.shadowMap.needsUpdate = true;
  invalidate();
  if (world.loading) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(autosave, 400);
  for (const fn of listeners) fn();
}

// ---------------------------------------------------------------------------
// History: every edit is "these snapshots went away, these arrived".
const history = { undo: [], redo: [] };
function applyEdit(rem, add) {
  for (const s of rem) { const b = world.bricks.get(s.id); if (b) removeBrick(b); }
  for (const s of add) addBrick(s);
}
function record(rem, add) {
  if (!rem.length && !add.length) return;
  history.undo.push({ rem, add });
  if (history.undo.length > 500) history.undo.shift();
  history.redo.length = 0;
  for (const fn of listeners) fn();
}
function perform(rem, add) { applyEdit(rem, add); record(rem, add); }
function undo() {
  const e = history.undo.pop();
  if (!e) return false;
  applyEdit(e.add, e.rem);
  history.redo.push(e);
  for (const fn of listeners) fn();
  return true;
}
function redo() {
  const e = history.redo.pop();
  if (!e) return false;
  applyEdit(e.rem, e.add);
  history.undo.push(e);
  for (const fn of listeners) fn();
  return true;
}

// ---------------------------------------------------------------------------
// Save files: { app, v, size, base, bricks: [[type, color, x, y, z, rot], ...] }
const SAVE_KEY = 'studworks.build.v1';
function serialize() {
  const bricks = [];
  for (const b of world.bricks.values()) bricks.push([b.type, b.color, b.x, b.y, b.z, b.rot]);
  for (const b of world.lifted || []) bricks.push([b.type, b.color, b.x, b.y, b.z, b.rot]);
  return { app: 'studworks', v: 1, size: world.size, base: world.base, bricks };
}
function autosave() { clearTimeout(saveTimer); saveTimer = 0; store(SAVE_KEY, JSON.stringify(serialize())); }
// Don't lose the last few hundred milliseconds of edits when the tab closes.
const flushSave = () => { if (saveTimer) autosave(); };
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });

// Loads a save (or a resize of the current build). Returns how many bricks were dropped.
function loadBuild(data) {
  const size = SIZES.includes(data && data.size) ? data.size : 32;
  const base = BASE_COLORS.includes(data && data.base) ? data.base : 'green';
  const list = Array.isArray(data && data.bricks) ? data.bricks : [];
  world.loading = true;
  world.lifted = null;
  clearBricks();
  world.size = size;
  world.base = base;
  world.nextId = 1;
  buildBaseplate(size, base);
  let dropped = 0;
  for (const r of list) {
    const s = Array.isArray(r) ? { type: r[0], color: r[1], x: r[2], y: r[3], z: r[4], rot: r[5] } : null;
    const ok = s && TYPE[s.type] && COLOR[s.color] && [s.x, s.y, s.z, s.rot].every(Number.isInteger);
    if (ok && fits({ ...s, rot: s.rot & 3 })) addBrick(s);
    else dropped++;
  }
  world.loading = false;
  history.undo.length = 0;
  history.redo.length = 0;
  changed();
  return dropped;
}
