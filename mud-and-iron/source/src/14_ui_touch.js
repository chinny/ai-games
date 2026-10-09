// Mud & Iron — touchscreen controls. Tap to select and command, drag to pan, pinch to zoom, twist to rotate,
// long-press and drag to box-select, double-tap to select a type, tap twice to confirm a building or power,
// long-press a button for its tooltip, plus a toolbar for the actions that otherwise need a keyboard.

const TOUCH = { on: false, pts: new Map(), tap: null, two: null, box: false, longT: 0, addSel: false, confirm: null, lastTap: { t: 0, id: 0 }, tipOK: false, suppress: false, mmTap: 0, longMs: 420, tapMs: 450, dblMs: 350 };
UI.lastInput = isTouch ? 'touch' : 'mouse';

function enableTouchUI() {
  UI.lastInput = 'touch';
  if (TOUCH.on) return;
  TOUCH.on = true;
  document.body.classList.add('touch');
  const c = $('.credit');
  if (c) c.innerHTML = 'Touch: tap to select and command, drag to pan, pinch to zoom. Best in landscape. Part of <a href="../">Chinny\'s AI Games</a>.';
}

const tpos = (t) => ({ x: t.clientX, y: t.clientY });
function twoInfo() {
  const [a, b] = [...TOUCH.pts.values()];
  return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x) };
}
function touchHint(text) { hudEl.hint.hidden = false; hudEl.hint.textContent = text; }

function onTap(x, y) {
  UI.mx = x; UI.my = y; UI.inView = true;
  const m = UI.mode;
  // placements: first tap shows the preview, a second tap on the same spot confirms
  if (m === 'build' || m === 'power') {
    const c = TOUCH.confirm;
    if (c && c.mode === m && Math.hypot(c.x - x, c.y - y) < 46) { TOUCH.confirm = null; leftAction(x, y, false); return; }
    TOUCH.confirm = { x, y, mode: m };
    touchHint(m === 'build' ? 'Tap again on the same spot to build here' : 'Tap again on the same spot to call it in');
    return;
  }
  if (m === 'line') {
    if (!pickGround(x, y, _v4)) return;
    if (UI.md.start) { commitLine(UI.md.start.x, UI.md.start.z, _v4.x, _v4.z); setMode(null); }
    else { UI.md.start = { x: _v4.x, z: _v4.z, sx: x, sy: y, down: false }; touchHint('Now tap where the line should end, or drag it out'); }
    return;
  }
  if (m && m !== 'buildmenu') { leftAction(x, y, TOUCH.addSel); return; }
  const e = pickEnt(x, y);
  const own = SEL.filter((o) => !o.dead && o.team === 0);
  const engs = own.filter((o) => o.kind === 'squad' && o.def.eng);
  const now = performance.now();
  if (e && e.team === 0) {
    // engineers tapping a damaged or unfinished friendly vehicle/building get to work on it
    if (engs.length && e.kind !== 'squad' && !SEL.includes(e) && (e.hp < e.maxhp || e.broken > 0 || (e.kind === 'bld' && e.built < 1))) { rightClick(x, y, false); return; }
    if (now - TOUCH.lastTap.t < TOUCH.dblMs && TOUCH.lastTap.id === e.id) selectOnly(ENTS.filter((o) => !o.dead && o.team === 0 && o.type === e.type && onScreen(o)));
    else if (TOUCH.addSel) { const k = SEL.indexOf(e); if (k >= 0) SEL.splice(k, 1); else if (!SEL.some((o) => o.team !== 0)) SEL.push(e); else selectOnly([e]); UI.cardSig = ''; UI.panelSig = ''; }
    else selectOnly([e]);
    TOUCH.lastTap = { t: now, id: e.id };
    return;
  }
  if (own.length) { rightClick(x, y, false); return; }
  if (e) selectOnly([e]);
}

function bindTouch() {
  if (isTouch) enableTouchUI();
  addEventListener('touchstart', () => enableTouchUI(), { capture: true, passive: true });
  const cv = canvas;
  cv.addEventListener('touchstart', (ev) => {
    ev.preventDefault();
    audioInit(); hideTip();
    for (const t of ev.changedTouches) TOUCH.pts.set(t.identifier, tpos(t));
    clearTimeout(TOUCH.longT);
    if (GAME.state !== 'play') return;
    if (TOUCH.pts.size === 1) {
      const p = tpos(ev.changedTouches[0]);
      TOUCH.tap = { ...p, t: performance.now(), moved: false };
      UI.mx = p.x; UI.my = p.y; UI.inView = true;
      if (UI.mode === 'line' && !UI.md.start && pickGround(p.x, p.y, _v4)) UI.md.start = { x: _v4.x, z: _v4.z, sx: p.x, sy: p.y, down: true };
      else if (!UI.mode) {
        // hold still to start a selection box
        TOUCH.longT = setTimeout(() => {
          if (!TOUCH.tap || TOUCH.tap.moved || TOUCH.pts.size !== 1) return;
          TOUCH.box = true; TOUCH.tap = null;
          UI.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, shift: TOUCH.addSel };
          if (navigator.vibrate) navigator.vibrate(12);
        }, TOUCH.longMs);
      }
    } else if (TOUCH.pts.size === 2) {
      TOUCH.tap = null; TOUCH.box = false; UI.drag = null;
      if (UI.mode === 'line' && UI.md.start && UI.md.start.down) UI.md.start = null;
      const i = twoInfo();
      TOUCH.two = { ...i, dist: CAM.tdist, yaw: CAM.yaw };
    }
  }, { passive: false });
  cv.addEventListener('touchmove', (ev) => {
    ev.preventDefault();
    const prev = new Map(TOUCH.pts);
    for (const t of ev.changedTouches) if (TOUCH.pts.has(t.identifier)) TOUCH.pts.set(t.identifier, tpos(t));
    if (GAME.state !== 'play') return;
    if (TOUCH.pts.size === 2 && TOUCH.two) {
      const i = twoInfo(), s = TOUCH.two;
      CAM.tdist = clamp(s.dist * s.d / Math.max(20, i.d), 26, 170);
      CAM.yaw = s.yaw + angWrap(i.a - s.a);
      panBy(-(i.cx - s.cx), -(i.cy - s.cy));
      s.cx = i.cx; s.cy = i.cy;
      return;
    }
    if (TOUCH.pts.size !== 1) return;
    const t = ev.changedTouches[0], p = tpos(t), o = prev.get(t.identifier) || p;
    UI.mx = p.x; UI.my = p.y;
    if (TOUCH.box) { UI.drag.x1 = p.x; UI.drag.y1 = p.y; return; }
    if (UI.mode === 'line' && UI.md.start && UI.md.start.down) { if (TOUCH.tap && Math.hypot(p.x - TOUCH.tap.x, p.y - TOUCH.tap.y) > 10) TOUCH.tap.moved = true; return; }
    if (TOUCH.tap && Math.hypot(p.x - TOUCH.tap.x, p.y - TOUCH.tap.y) > 10) { TOUCH.tap.moved = true; clearTimeout(TOUCH.longT); }
    if (!TOUCH.tap || TOUCH.tap.moved) panBy(-(p.x - o.x), -(p.y - o.y));
  }, { passive: false });
  const end = (ev) => {
    ev.preventDefault();
    for (const t of ev.changedTouches) TOUCH.pts.delete(t.identifier);
    clearTimeout(TOUCH.longT);
    if (TOUCH.pts.size < 2) TOUCH.two = null;
    if (GAME.state !== 'play' || TOUCH.pts.size) return;
    const t = ev.changedTouches[0], p = tpos(t);
    if (TOUCH.box) {
      const d = UI.drag; TOUCH.box = false; UI.drag = null;
      if (d && Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > 12) boxSelect(d.x0, d.y0, d.x1, d.y1, TOUCH.addSel);
      else if (d) onTap(d.x0, d.y0);
      return;
    }
    if (UI.mode === 'line' && UI.md.start && UI.md.start.down) {
      UI.md.start.down = false;
      if (TOUCH.tap && TOUCH.tap.moved && pickGround(p.x, p.y, _v4)) { commitLine(UI.md.start.x, UI.md.start.z, _v4.x, _v4.z); setMode(null); }
      else touchHint('Now tap where the line should end, or drag it out');
      TOUCH.tap = null;
      return;
    }
    // with a targeting mode armed there is no long-press, so slower taps still count
    if (TOUCH.tap && !TOUCH.tap.moved && performance.now() - TOUCH.tap.t < (UI.mode ? TOUCH.tapMs * 2.5 : TOUCH.tapMs)) onTap(p.x, p.y);
    TOUCH.tap = null;
  };
  cv.addEventListener('touchend', end, { passive: false });
  cv.addEventListener('touchcancel', (ev) => { for (const t of ev.changedTouches) TOUCH.pts.delete(t.identifier); TOUCH.tap = null; TOUCH.two = null; TOUCH.box = false; UI.drag = null; clearTimeout(TOUCH.longT); });

  // minimap: tap or drag to look, double-tap to send the selection there
  const mm = $('#mm');
  const mmPos = (t) => { const r = mm.getBoundingClientRect(); return { x: clamp((t.clientX - r.left) / r.width, 0, 1) * MAP.W, z: clamp((t.clientY - r.top) / r.height, 0, 1) * MAP.H }; };
  mm.addEventListener('touchstart', (ev) => {
    ev.preventDefault();
    if (GAME.state !== 'play') return;
    const p = mmPos(ev.changedTouches[0]), now = performance.now();
    if (UI.mode === 'power') { usePower(0, UI.md.k, p.x, p.z); setMode(null); return; }
    const own = SEL.filter((e) => !e.dead && e.team === 0);
    if (now - TOUCH.mmTap < TOUCH.dblMs && own.length) {
      if (own.every((e) => e.kind === 'bld')) for (const b of own) b.rally = { x: p.x, z: p.z };
      else orderMove(own, p.x, p.z, false, UI.mode === 'amove');
      if (UI.mode === 'amove') setMode(null);
      marker(p.x, p.z, '#7dff7a'); sfx('click');
      TOUCH.mmTap = 0;
      return;
    }
    TOUCH.mmTap = now;
    CAM.x = p.x; CAM.z = p.z;
  }, { passive: false });
  mm.addEventListener('touchmove', (ev) => { ev.preventDefault(); if (GAME.state !== 'play') return; const p = mmPos(ev.changedTouches[0]); CAM.x = p.x; CAM.z = p.z; TOUCH.mmTap = 0; }, { passive: false });

  // long-press a command or power button to read its tooltip instead of pressing it
  for (const el of [hudEl.cmd, hudEl.powers]) {
    el.addEventListener('touchstart', (ev) => {
      const b = ev.target.closest('.cb, .pw');
      TOUCH.suppress = false;
      if (!b) return;
      const t = ev.touches[0], pos = { clientX: t.clientX, clientY: t.clientY };
      clearTimeout(TOUCH.btnT);
      TOUCH.btnT = setTimeout(() => { if (b.onmouseenter) { TOUCH.tipOK = true; b.onmouseenter(pos); TOUCH.tipOK = false; TOUCH.suppress = true; } }, 450);
    }, { passive: true });
    el.addEventListener('touchend', () => { clearTimeout(TOUCH.btnT); if (TOUCH.suppress) setTimeout(hideTip, 1800); }, { passive: true });
    el.addEventListener('click', (ev) => { if (TOUCH.suppress) { ev.stopPropagation(); ev.preventDefault(); TOUCH.suppress = false; } }, true);
  }

  // toolbar for things a keyboard would do
  $('#rotateDismiss').onclick = () => document.body.classList.add('rotateOK');
  const bar = $('#tbar');
  bar.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || GAME.state !== 'play') return;
    sfx('click');
    const a = b.dataset.a;
    if (a === 'army') selectOnly(ENTS.filter((e) => !e.dead && e.team === 0 && e.kind !== 'bld' && !(e.kind === 'squad' && e.def.eng)));
    else if (a === 'eng') {
      const idle = ENTS.filter((e) => !e.dead && e.team === 0 && e.kind === 'squad' && e.def.eng && !e.order);
      const list = idle.length ? idle : ENTS.filter((e) => !e.dead && e.team === 0 && e.kind === 'squad' && e.def.eng);
      if (list.length) { UI.engI = ((UI.engI || 0) + 1) % list.length; selectOnly([list[UI.engI]]); centerOn([list[UI.engI]]); }
    } else if (a === 'hq') { const h = TEAMS[0].hq; if (h && !h.dead) { selectOnly([h]); centerOn([h]); } }
    else if (a === 'add') { TOUCH.addSel = !TOUCH.addSel; b.classList.toggle('on', TOUCH.addSel); }
    else if (a === 'jump') jumpCamera();
    else if (a === 'clear') { TOUCH.confirm = null; if (UI.mode) setMode(UI.mode === 'build' ? 'buildmenu' : null); else selectOnly([]); }
  });
}
