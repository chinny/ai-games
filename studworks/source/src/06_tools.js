// Studworks — picking, snapping, the ghost preview, selection and every tool's actions

const state = {
  tool: 'build',          // build | select | paint | pick | erase
  type: TYPE['brick-2x4'],
  color: 'red',
  rot: 0,
  hit: null,              // what the pointer is over: { brick, point, normal } or null
  placement: null,        // where the ghost would land: { bricks, ok }
  selection: new Set(),   // brick ids
  carry: null,            // bricks being moved or copied: { items, originals, drag }
  clipboard: null,        // items
};

// ---------------------------------------------------------------------------
// Picking
const raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
function pickAt(cx, cy) {
  const r = canvas.getBoundingClientRect();
  _ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  let best = null;
  const hits = raycaster.intersectObjects(bricksGroup.children, false);
  if (hits.length) {
    const h = hits[0];
    const b = h.object.userData.pool.list[h.instanceId];
    const normal = h.face.normal.clone().applyAxisAngle(UP, (b.rot * Math.PI) / 2);
    best = { brick: b, point: h.point.clone(), normal, dist: h.distance };
  }
  const ray = raycaster.ray;
  if (ray.direction.y < -1e-6) {
    const t = -ray.origin.y / ray.direction.y;
    const p = ray.at(t, new V3());
    const S = world.size;
    if (t > 0 && (!best || t < best.dist) && p.x >= 0 && p.z >= 0 && p.x <= S && p.z <= S) {
      best = { brick: null, point: p, normal: UP.clone(), dist: t };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Snapping. A group is a list of items { type, color, rot, dx, dy, dz } relative to items[0], the anchor
// (a single new brick is a group of one). The anchor goes where the pointer is and the rest follow.
function groupExtent(items) {
  const e = { x0: 0, x1: 0, z0: 0, z1: 0 };
  for (const it of items) {
    const [W, D] = dimsOf(TYPE[it.type], it.rot);
    e.x0 = Math.min(e.x0, it.dx); e.x1 = Math.max(e.x1, it.dx + W);
    e.z0 = Math.min(e.z0, it.dz); e.z1 = Math.max(e.z1, it.dz + D);
  }
  return e;
}

// Where the anchor's min corner goes for a hit. `push` means the group may rise until it fits.
function anchorFor(hit, items) {
  const a = TYPE[items[0].type];
  const [W, D] = dimsOf(a, items[0].rot);
  const h = a.h, S = world.size, p = hit.point, e = groupExtent(items);
  const cx = (v) => clamp(Math.round(v - W / 2), -e.x0, S - e.x1);
  const cz = (v) => clamp(Math.round(v - D / 2), -e.z0, S - e.z1);
  if (!hit.brick) return { x: cx(p.x), y: 0, z: cz(p.z), push: true };

  const b = hit.brick, n = hit.normal;
  const [bW, bD, bh] = extentOf(b);
  const top = (b.y + bh) * PLATE, bottom = b.y * PLATE;
  if (p.y >= top - 1e-3 || n.y > 0.9) return { x: cx(p.x), y: b.y + bh, z: cz(p.z), push: true };
  if (n.y < -0.9 || p.y <= bottom + 1e-3) return { x: cx(p.x), y: b.y - h, z: cz(p.z), push: false };

  // A side (or a sloped face): attach next to the brick.
  const mx = b.x + bW / 2, mz = b.z + bD / 2;
  let ax, sgn;
  if (Math.hypot(n.x, n.z) > 0.3 && n.x * (p.x - mx) + n.z * (p.z - mz) > 0) {
    ax = Math.abs(n.x) > Math.abs(n.z) ? 'x' : 'z';
    sgn = Math.sign(ax === 'x' ? n.x : n.z);
  } else {
    const d = [[p.x - b.x, 'x', -1], [b.x + bW - p.x, 'x', 1], [p.z - b.z, 'z', -1], [b.z + bD - p.z, 'z', 1]];
    d.sort((u, v) => u[0] - v[0]);
    ax = d[0][1]; sgn = d[0][2];
  }
  const y = h >= bh ? b.y : b.y + clamp(Math.floor(p.y / PLATE - b.y), 0, bh - h);
  if (ax === 'x') return { x: sgn > 0 ? b.x + bW : b.x - W, y, z: cz(p.z), push: false };
  return { x: cx(p.x), y, z: sgn > 0 ? b.z + bD : b.z - D, push: false };
}

function placeGroup(items, hit) {
  if (!hit) return null;
  const at = anchorFor(hit, items);
  const bricks = items.map((it) => ({
    type: it.type, color: it.color, rot: it.rot, x: at.x + it.dx, y: at.y + it.dy, z: at.z + it.dz,
  }));
  if (at.push) {
    for (let k = 0; k < MAX_Y; k++) {
      if (groupFits(bricks)) return { bricks, ok: true };
      if (bricks.some((b) => b.y + TYPE[b.type].h >= MAX_Y)) break;
      for (const b of bricks) b.y++;
    }
  }
  return { bricks, ok: groupFits(bricks) };
}

// Turn a group a quarter turn clockwise (seen from above), keeping the anchor at the origin.
function rotateItems(items, turns = 1) {
  let out = items;
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) {
    out = out.map((it) => {
      const [W] = dimsOf(TYPE[it.type], it.rot);
      return { ...it, rot: (it.rot + 1) & 3, dx: it.dz, dz: -(it.dx + W) };
    });
    const a = out[0];
    out = out.map((it) => ({ ...it, dx: it.dx - a.dx, dz: it.dz - a.dz }));
  }
  return out;
}

function itemsFrom(bricks, anchor) {
  const list = [anchor, ...bricks.filter((b) => b !== anchor)];
  return list.map((b) => ({ type: b.type, color: b.color, rot: b.rot, dx: b.x - anchor.x, dy: b.y - anchor.y, dz: b.z - anchor.z }));
}

// ---------------------------------------------------------------------------
// Ghost preview and highlight boxes
const ghost = new THREE.Group();
ghost.visible = false;
scene.add(ghost);
const ghostMats = {};
function ghostMat(colorId, ok) {
  const key = ok ? colorId : 'bad';
  if (!ghostMats[key]) {
    const c = ok ? COLOR[colorId].linear : new THREE.Color(0xff3030).convertSRGBToLinear();
    ghostMats[key] = new THREE.MeshStandardMaterial({
      color: c, emissive: c.clone().multiplyScalar(ok ? 0.35 : 0.6), roughness: 0.35,
      transparent: true, opacity: ok ? 0.62 : 0.5, depthWrite: false,
    });
  }
  return ghostMats[key];
}
function showGhost(pl) {
  if (!pl) { if (ghost.visible) { ghost.visible = false; invalidate(); } return; }
  while (ghost.children.length > pl.bricks.length) ghost.remove(ghost.children[ghost.children.length - 1]);
  pl.bricks.forEach((b, i) => {
    let m = ghost.children[i];
    if (!m) {
      m = new THREE.Mesh(typeGeometry(TYPE[b.type]), ghostMat(b.color, pl.ok));
      m.matrixAutoUpdate = false;
      m.renderOrder = 2;
      ghost.add(m);
    }
    m.geometry = typeGeometry(TYPE[b.type]);
    m.material = ghostMat(b.color, pl.ok);
    brickMatrix(TYPE[b.type], b.x, b.y, b.z, b.rot, m.matrix);
  });
  ghost.visible = true;
  invalidate();
}

const boxGeos = {};
function boxGeo(W, H, D) {
  const k = `${W}|${H}|${D}`;
  if (!boxGeos[k]) {
    const box = new THREE.BoxGeometry(W + 0.06, H + 0.06, D + 0.06);
    boxGeos[k] = { edges: new THREE.EdgesGeometry(box), fill: box };
  }
  return boxGeos[k];
}
const selLineMat = new THREE.LineBasicMaterial({ color: 0x1f6feb, transparent: true, opacity: 0.95 });
const selFillMat = new THREE.MeshBasicMaterial({ color: 0x3d8bff, transparent: true, opacity: 0.16, depthWrite: false });
const hoverMats = {
  select: new THREE.LineBasicMaterial({ color: 0x1f6feb }),
  paint: new THREE.LineBasicMaterial({ color: 0x1f6feb }),
  pick: new THREE.LineBasicMaterial({ color: 0x1f6feb }),
  erase: new THREE.LineBasicMaterial({ color: 0xe5484d }),
};
const selGroup = new THREE.Group();
scene.add(selGroup);
const hoverBox = new THREE.LineSegments(new THREE.BufferGeometry(), hoverMats.select);
hoverBox.visible = false;
hoverBox.renderOrder = 3;
scene.add(hoverBox);

function placeBox(obj, b) {
  const [W, D, h] = extentOf(b);
  obj.position.set(b.x + W / 2, (b.y + h / 2) * PLATE, b.z + D / 2);
}
function refreshSelection() {
  selGroup.clear();
  for (const id of state.selection) {
    const b = world.bricks.get(id);
    if (!b) continue;
    const [W, D, h] = extentOf(b);
    const g = boxGeo(W, h * PLATE, D);
    const line = new THREE.LineSegments(g.edges, selLineMat);
    const fill = new THREE.Mesh(g.fill, selFillMat);
    placeBox(line, b); placeBox(fill, b);
    fill.renderOrder = 1;
    selGroup.add(line, fill);
  }
  invalidate();
  ui.selectionChanged();
}
function setHoverBox(b) {
  if (!b) { if (hoverBox.visible) { hoverBox.visible = false; invalidate(); } return; }
  const [W, D, h] = extentOf(b);
  hoverBox.geometry = boxGeo(W, h * PLATE, D).edges;
  hoverBox.material = hoverMats[state.tool] || hoverMats.select;
  placeBox(hoverBox, b);
  hoverBox.visible = true;
  invalidate();
}

// ---------------------------------------------------------------------------
// Hover: called whenever the pointer or the camera moves.
function currentItems() {
  if (state.carry) return state.carry.items;
  return [{ type: state.type.id, color: state.color, rot: state.rot, dx: 0, dy: 0, dz: 0 }];
}
function updateHover(hit) {
  state.hit = hit;
  if (state.carry || state.tool === 'build') {
    state.placement = placeGroup(currentItems(), hit);
    showGhost(state.placement);
    setHoverBox(null);
  } else {
    state.placement = null;
    showGhost(null);
    setHoverBox(hit && hit.brick);
  }
}
function clearHover() { state.hit = null; state.placement = null; showGhost(null); setHoverBox(null); }
const refreshGhost = () => updateHover(state.hit);

// ---------------------------------------------------------------------------
// Actions
function setTool(tool) {
  if (state.carry) cancelCarry();
  if (tool !== 'select') setSelection([]);
  state.tool = tool;
  ui.toolChanged();
  refreshGhost();
}
function setSelection(ids) {
  state.selection = new Set(ids);
  refreshSelection();
}

function placeBrick() {
  const pl = state.placement;
  if (!pl || !pl.ok) { play('error'); return false; }
  perform([], pl.bricks.map((b) => ({ ...b, id: world.nextId++ })));
  play('place');
  refreshGhost();
  return true;
}

function rotate(turns = 1) {
  play('rotate');
  if (state.carry) {
    state.carry.items = rotateItems(state.carry.items, turns);
  } else if (state.tool === 'select' && state.selection.size) {
    rotateSelectionInPlace(turns);
    return;
  } else {
    state.rot = (state.rot + turns + 4) & 3;
  }
  refreshGhost();
}

function rotateSelectionInPlace(turns) {
  const list = selectedBricks();
  const originals = list.map(snap);
  const items = rotateItems(itemsFrom(list, list[0]), turns);
  // Keep the group's footprint centred where it was.
  const before = groupExtent(itemsFrom(list, list[0]));
  const cx = list[0].x + (before.x0 + before.x1) / 2, cz = list[0].z + (before.z0 + before.z1) / 2;
  const after = groupExtent(items);
  const ax = Math.round(cx - (after.x0 + after.x1) / 2), az = Math.round(cz - (after.z0 + after.z1) / 2);
  for (const b of list) removeBrick(b);
  const moved = items.map((it, i) => ({
    id: originals[i].id, type: it.type, color: it.color, rot: it.rot, x: ax + it.dx, y: originals[0].y + it.dy, z: az + it.dz,
  }));
  if (groupFits(moved)) {
    applyEdit([], moved);
    record(originals, moved);
  } else {
    applyEdit([], originals);
    play('error');
    ui.toast('No room to rotate here');
  }
  refreshSelection();
}

const selectedBricks = () => [...state.selection].map((id) => world.bricks.get(id)).filter(Boolean);

function deleteBricks(list) {
  if (!list.length) return;
  perform(list.map(snap), []);
  play('remove', list.length);
}
function deleteSelection() {
  const list = selectedBricks();
  setSelection([]);
  deleteBricks(list);
}

function eyedrop(b) {
  state.type = TYPE[b.type];
  state.color = b.color;
  state.rot = b.rot;
  play('pick');
  ui.showFamily(state.type.fam);
  ui.pieceChanged();
  setTool('build');
}

function setColor(id) {
  state.color = id;
  ui.pieceChanged();
  if (state.tool === 'select' && state.selection.size) {
    const list = selectedBricks().filter((b) => b.color !== id);
    if (list.length) {
      const rem = list.map(snap);
      perform(rem, rem.map((s) => ({ ...s, color: id })));
      play('paint');
      refreshSelection();
    }
  }
  refreshGhost();
}
function setType(t) {
  state.type = t;
  ui.pieceChanged();
  if (state.tool !== 'build') setTool('build');
  else refreshGhost();
}

// Paint and erase strokes gather every brick touched during one drag into one undo step.
let stroke = null;
function strokeBegin() { stroke = { rem: [], add: [], seen: new Set() }; }
function strokeApply(b) {
  if (!b || !stroke || stroke.seen.has(b.id)) return;
  stroke.seen.add(b.id);
  if (state.tool === 'paint') {
    if (b.color === state.color) return;
    const before = snap(b), after = { ...before, color: state.color };
    applyEdit([before], [after]);
    stroke.rem.push(before); stroke.add.push(after);
    play('paint');
  } else if (state.tool === 'erase') {
    const before = snap(b);
    applyEdit([before], []);
    stroke.rem.push(before);
    play('remove');
  }
  clearHover();
}
function strokeEnd() {
  if (stroke) record(stroke.rem, stroke.add);
  stroke = null;
}

// ---------------------------------------------------------------------------
// Carrying: moving existing bricks, or placing copies from the clipboard.
function startCarry(bricks, anchor, mode, drag) {
  if (!bricks.length) return;
  const items = itemsFrom(bricks, anchor);  // anchor first, then the rest in order
  let originals = null;
  if (mode === 'move') {
    originals = [anchor, ...bricks.filter((b) => b !== anchor)].map(snap);
    world.lifted = originals;
    world.loading = true;  // a lift is not an edit until it is dropped
    for (const b of bricks) removeBrick(b);
    world.loading = false;
  }
  setSelection([]);
  state.carry = { items, originals, drag };
  play('select');
  ui.carryChanged();
  refreshGhost();
}
function dropCarry() {
  const c = state.carry, pl = state.placement;
  if (!c) return false;
  if (!pl || !pl.ok) {
    play('error');
    if (c.drag) cancelCarry();
    return false;
  }
  const added = pl.bricks.map((b, i) => ({ ...b, id: c.originals ? c.originals[i].id : world.nextId++ }));
  world.lifted = null;
  applyEdit([], added);
  record(c.originals || [], added);
  state.carry = null;
  play('place', added.length);
  ui.carryChanged();
  setSelection(added.map((s) => s.id));
  refreshGhost();
  return true;
}
function cancelCarry() {
  const c = state.carry;
  if (!c) return;
  state.carry = null;
  world.lifted = null;
  if (c.originals) {
    world.loading = true;
    applyEdit([], c.originals);
    world.loading = false;
    changed();
    setSelection(c.originals.map((s) => s.id));
  }
  ui.carryChanged();
  refreshGhost();
}

function copySelection() {
  const list = selectedBricks();
  if (!list.length) return false;
  state.clipboard = itemsFrom(list, list[0]);
  return true;
}
function pasteClipboard() {
  if (!state.clipboard) return;
  if (state.carry) cancelCarry();
  if (state.tool !== 'select') setTool('select');
  setSelection([]);
  state.carry = { items: state.clipboard.map((it) => ({ ...it })), originals: null, drag: false };
  play('select');
  ui.carryChanged();
  refreshGhost();
}
function duplicateSelection() { if (copySelection()) pasteClipboard(); }
function moveSelection() {
  const list = selectedBricks();
  if (list.length) startCarry(list, list[0], 'move', false);
}

function selectAll() {
  if (state.tool !== 'select') setTool('select');
  setSelection([...world.bricks.keys()]);
}

function doUndo() {
  if (state.carry) cancelCarry();
  if (undo()) { play('remove'); afterHistory(); } else play('error');
}
function doRedo() {
  if (state.carry) cancelCarry();
  if (redo()) { play('place'); afterHistory(); } else play('error');
}
function afterHistory() {
  setSelection([...state.selection].filter((id) => world.bricks.has(id)));
  refreshGhost();
}

// Screen-space box selection.
function selectInRect(x0, y0, x1, y1, additive) {
  const r = canvas.getBoundingClientRect();
  const ids = additive ? new Set(state.selection) : new Set();
  const v = new V3();
  for (const b of world.bricks.values()) {
    const [W, D, h] = extentOf(b);
    v.set(b.x + W / 2, (b.y + h / 2) * PLATE, b.z + D / 2).project(camera);
    if (v.z > 1) continue;
    const sx = r.left + ((v.x + 1) / 2) * r.width, sy = r.top + ((1 - v.y) / 2) * r.height;
    if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) ids.add(b.id);
  }
  setSelection([...ids]);
  if (ids.size) play('select');
}
