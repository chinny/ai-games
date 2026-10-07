// Studworks — mouse, touch and keyboard input

const ptr = { x: 0, y: 0, over: false, dirty: false };
const touches = new Map();
const held = new Set();
let gesture = null;
const DRAG = 5, TOUCH_DRAG = 10;  // pixels before a press counts as a drag

function hoverAt(x, y) { ptr.x = x; ptr.y = y; ptr.dirty = true; }
function hoverNow(x, y) { hoverAt(x, y); ptr.dirty = false; const h = pickAt(x, y); updateHover(h); return h; }

function removeOne(b) {
  deleteBricks([b]);
  if (state.selection.has(b.id)) setSelection([...state.selection].filter((id) => id !== b.id));
}

function showMarquee(g, x, y) {
  const m = $('#marquee');
  g.rect = [Math.min(g.sx, x), Math.min(g.sy, y), Math.max(g.sx, x), Math.max(g.sy, y)];
  Object.assign(m.style, {
    left: g.rect[0] + 'px', top: g.rect[1] + 'px', width: g.rect[2] - g.rect[0] + 'px', height: g.rect[3] - g.rect[1] + 'px',
  });
  m.hidden = false;
}

// ---------------------------------------------------------------------------
// Mouse and pen
function mouseDown(e) {
  canvas.setPointerCapture(e.pointerId);
  ptr.over = true;
  const hit = hoverNow(e.clientX, e.clientY);
  const g = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, shift: e.shiftKey, alt: e.altKey, kind: 'none' };
  if (e.button === 2) g.kind = e.shiftKey ? 'pan' : 'right';
  else if (e.button === 1) g.kind = 'pan';
  else if (e.button === 0) {
    if (state.carry) g.kind = 'carryClick';
    else if (state.tool === 'select') {
      if (hit && hit.brick) {
        g.brick = hit.brick;
        if (e.shiftKey || e.metaKey || e.ctrlKey) g.kind = 'toggle';
        else {
          if (!state.selection.has(hit.brick.id)) { setSelection([hit.brick.id]); play('select'); g.fresh = true; }
          g.kind = 'pressBrick';
        }
      } else g.kind = 'marquee';
    } else if (state.tool === 'paint' || state.tool === 'erase') {
      g.kind = 'stroke';
      strokeBegin();
      strokeApply(hit && hit.brick);
    } else g.kind = 'click';
  }
  gesture = g;
}

function mouseMove(e) {
  ptr.over = true;
  hoverAt(e.clientX, e.clientY);
  const g = gesture;
  if (!g) return;
  const dx = e.clientX - g.lx, dy = e.clientY - g.ly;
  g.lx = e.clientX; g.ly = e.clientY;
  if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > DRAG) {
    g.moved = true;
    if (g.kind === 'right' || g.kind === 'click' || g.kind === 'carryClick') g.kind = 'orbit';
    else if (g.kind === 'pressBrick') { startCarry(selectedBricks(), g.brick, 'move', true); g.kind = 'carryDrag'; }
    else if (g.kind === 'toggle') g.kind = 'none';
  }
  if (!g.moved) return;
  if (g.kind === 'orbit') orbitBy(dx, dy);
  else if (g.kind === 'pan') panBy(dx, dy);
  else if (g.kind === 'marquee') showMarquee(g, e.clientX, e.clientY);
  else if (g.kind === 'stroke') { const h = hoverNow(e.clientX, e.clientY); strokeApply(h && h.brick); }
}

function mouseUp(e) {
  const g = gesture;
  gesture = null;
  if (!g) return;
  const hit = hoverNow(e.clientX, e.clientY);
  const b = hit && hit.brick;
  switch (g.kind) {
    case 'right':
      if (state.carry) cancelCarry();
      else if (b) removeOne(b);
      break;
    case 'click':
      if (state.tool === 'build') {
        if (g.alt) { if (b) eyedrop(b); } else placeBrick();
      } else if (state.tool === 'pick') {
        if (b) eyedrop(b); else play('error');
      }
      break;
    case 'carryClick':
    case 'carryDrag':
      dropCarry();
      break;
    case 'pressBrick':
      if (!g.fresh && state.selection.size > 1) setSelection([g.brick.id]);
      break;
    case 'toggle': {
      const s = new Set(state.selection);
      if (s.has(g.brick.id)) s.delete(g.brick.id); else s.add(g.brick.id);
      setSelection([...s]);
      play('select');
      break;
    }
    case 'marquee':
      $('#marquee').hidden = true;
      if (g.moved && g.rect) selectInRect(...g.rect, g.shift);
      else if (!g.shift) setSelection([]);
      break;
    case 'stroke':
      strokeEnd();
      break;
  }
  hoverNow(e.clientX, e.clientY);
}

// ---------------------------------------------------------------------------
// Touch: one finger taps or orbits, two fingers pinch-zoom and pan.
function pinchState() {
  const [a, b] = [...touches.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}
function touchDown(e) {
  canvas.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  closeSheet();
  if (touches.size === 1) {
    gesture = { kind: 'tap', sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY };
    ptr.over = true;
    hoverNow(e.clientX, e.clientY);  // preview what a tap here would do
  } else if (touches.size === 2) {
    gesture = { kind: 'pinch', ...pinchState() };
    ptr.over = false;
    if (!state.carry) clearHover();
  } else gesture = { kind: 'none' };
}
function touchMove(e) {
  const t = touches.get(e.pointerId);
  if (!t) return;
  t.x = e.clientX; t.y = e.clientY;
  const g = gesture;
  if (!g) return;
  if (g.kind === 'tap' && Math.hypot(t.x - g.sx, t.y - g.sy) > TOUCH_DRAG) {
    g.kind = 'orbit';
    ptr.over = false;
    if (!state.carry) clearHover();
  }
  if (g.kind === 'orbit') {
    orbitBy((t.x - g.lx) * 1.15, (t.y - g.ly) * 1.15);
    g.lx = t.x; g.ly = t.y;
  } else if (g.kind === 'pinch' && touches.size === 2) {
    const p = pinchState();
    zoomBy(g.d / p.d);
    panBy(p.mx - g.mx, p.my - g.my);
    Object.assign(g, p);
  }
}
function touchUp(e) {
  touches.delete(e.pointerId);
  const g = gesture;
  if (g && g.kind === 'tap' && !touches.size && e.type === 'pointerup') {
    const hit = hoverNow(e.clientX, e.clientY);
    tapAction(hit);
    ptr.over = false;
    if (!state.carry) clearHover();
  }
  if (!touches.size) gesture = null;
  else if (g && g.kind === 'pinch') gesture = { kind: 'none' };
}
function tapAction(hit) {
  const b = hit && hit.brick;
  if (state.carry) { dropCarry(); return; }
  switch (state.tool) {
    case 'build': placeBrick(); break;
    case 'select': {
      if (!b) { setSelection([]); break; }
      const s = new Set(state.selection);
      if (s.has(b.id)) s.delete(b.id); else s.add(b.id);
      setSelection([...s]);
      play('select');
      break;
    }
    case 'paint':
    case 'erase':
      strokeBegin(); strokeApply(b); strokeEnd();
      if (!b) play('error');
      break;
    case 'pick':
      if (b) eyedrop(b); else play('error');
      break;
  }
}

// ---------------------------------------------------------------------------
// Keyboard
function cycleColor(step) {
  const i = (COLOR[state.color].idx + step + COLORS.length) % COLORS.length;
  setColor(COLORS[i].id);
  play('ui');
}
function onKey(e) {
  if (modalOpen()) {
    if (e.key === 'Escape') for (const m of $$('.modal')) if (!m.hidden) closeModal(m);
    return;
  }
  const k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    const handled = {
      z: () => (e.shiftKey ? doRedo() : doUndo()),
      y: doRedo,
      c: () => { if (copySelection()) { toast(`Copied ${state.clipboard.length} brick${state.clipboard.length === 1 ? '' : 's'}`); play('select'); } },
      v: pasteClipboard,
      d: duplicateSelection,
      a: selectAll,
      s: saveFile,
      o: () => $('#fileIn').click(),
    }[k];
    if (handled) { e.preventDefault(); handled(); }
    return;
  }
  if (e.altKey) return;
  const tools = { b: 'build', 1: 'build', v: 'select', 2: 'select', p: 'paint', 3: 'paint', i: 'pick', 4: 'pick', e: 'erase', 5: 'erase' };
  if (tools[k] && !e.repeat) { setTool(tools[k]); play('ui'); return; }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '=', '+', '-', '_'].includes(k)) {
    held.add(k);
    e.preventDefault();
    return;
  }
  switch (k) {
    case 'r': rotate(e.shiftKey ? -1 : 1); break;
    case 'x': case 'delete': case 'backspace':
      e.preventDefault();
      if (state.tool === 'select' && state.selection.size) deleteSelection();
      else if (state.hit && state.hit.brick && !state.carry) removeOne(state.hit.brick);
      break;
    case 'escape':
      if (state.carry) cancelCarry();
      else if (state.selection.size) setSelection([]);
      else if (!$('#menu').hidden) $('#menu').hidden = true;
      else closeSheet();
      break;
    case '[': cycleColor(-1); break;
    case ']': cycleColor(1); break;
    case 'f': case 'home': frameBaseplate(world.size); break;
    case '?': case 'h': openModal('#helpDlg'); break;
    default: return;
  }
}
// Held keys move the camera smoothly.
function keyCamera(dt) {
  if (!held.size) return;
  const px = 520 * dt, ang = 260 * dt;
  if (held.has('w')) panBy(0, px);
  if (held.has('s')) panBy(0, -px);
  if (held.has('a')) panBy(px, 0);
  if (held.has('d')) panBy(-px, 0);
  if (held.has('arrowleft')) orbitBy(-ang, 0);
  if (held.has('arrowright')) orbitBy(ang, 0);
  if (held.has('arrowup')) orbitBy(0, ang * 0.6);
  if (held.has('arrowdown')) orbitBy(0, -ang * 0.6);
  if (held.has('=') || held.has('+')) zoomBy(Math.exp(-1.6 * dt));
  if (held.has('-') || held.has('_')) zoomBy(Math.exp(1.6 * dt));
}

function initInput() {
  canvas.addEventListener('pointerdown', (e) => {
    ensureAudio();
    if (modalOpen()) return;
    $('#menu').hidden = true;
    if (e.pointerType === 'touch') touchDown(e); else mouseDown(e);
  });
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') touchMove(e); else mouseMove(e); });
  canvas.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') touchUp(e); else mouseUp(e); });
  canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'touch') { touchUp(e); return; }
    if (gesture && gesture.kind === 'stroke') strokeEnd();
    if (gesture && gesture.kind === 'carryDrag') cancelCarry();
    $('#marquee').hidden = true;
    gesture = null;
  });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'touch' || gesture) return;
    ptr.over = false;
    if (!state.carry) clearHover();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const d = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    zoomBy(Math.exp(clamp(d, -120, 120) * (e.ctrlKey ? 0.01 : 0.0012)));
  }, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => held.clear());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}
