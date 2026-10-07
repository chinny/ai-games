// Studworks — the interface: catalog with rendered thumbnails, palette, tools, menus, dialogs and toasts

const ICONS = {
  build: '<rect x="3" y="10" width="18" height="10" rx="1.5"/><rect x="5.5" y="6" width="5" height="4" rx="1"/><rect x="13.5" y="6" width="5" height="4" rx="1"/>',
  select: '<path d="M6 3.5l12 8.6-5.6 1.1-3 5.3z"/><path d="M3 21h4M3 17v4"/>',
  paint: '<rect x="3.5" y="3.5" width="14" height="6" rx="1.5"/><path d="M17.5 6.5h2.5v5.5h-8v2.5"/><rect x="10" y="14.5" width="4" height="6.5" rx="1"/>',
  pick: '<path d="M14.5 4.5l5 5"/><path d="M16.5 2.8a2.3 2.3 0 0 1 3.3 0l1.4 1.4a2.3 2.3 0 0 1 0 3.3l-2.4 2.4-4.7-4.7z"/><path d="M14.4 7.6l-9.1 9.1-.8 3.8 3.8-.8 9.1-9.1"/>',
  erase: '<path d="M8.5 20.5h12"/><path d="M4.6 15.4l9.3-9.3a2 2 0 0 1 2.8 0l2.5 2.5a2 2 0 0 1 0 2.8l-8.9 8.9H8.4l-3.8-3.8a.8.8 0 0 1 0-1.1z"/><path d="M9.5 10.5l5.3 5.3"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20.5 3.5v5h-5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  soundOn: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18.3 6.3a8 8 0 0 1 0 11.4"/>',
  soundOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  menu: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  open: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  save: '<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/>',
  photo: '<path d="M4 8.5h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6"/><path d="M12 17.2v.1"/>',
  move: '<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const MOD = isMac ? '⌘' : 'Ctrl';

const TOOLS = [
  { id: 'build', name: 'Build', key: 'B' },
  { id: 'select', name: 'Select & move', key: 'V' },
  { id: 'paint', name: 'Paint', key: 'P' },
  { id: 'pick', name: 'Eyedropper', key: 'I' },
  { id: 'erase', name: 'Erase', key: 'E' },
];

// ---------------------------------------------------------------------------
// Thumbnails: a small second renderer draws each part, which is then copied into 2D canvases.
const thumbs = {};
function initThumbs() {
  const c = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(132, 132, false);
  r.outputEncoding = THREE.sRGBEncoding;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 0.78;
  r.setClearColor(0x000000, 0);
  const s = new THREE.Scene();
  s.environment = makeEnvironment(r);
  s.add(new THREE.HemisphereLight(0xffffff, 0x8f887c, 0.15));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.25);
  key.position.set(3, 6, 4);
  s.add(key);
  const mat = brickMat.clone(), matT = transMat.clone();
  matT.depthWrite = true;
  const mesh = new THREE.Mesh(undefined, mat);
  s.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  Object.assign(thumbs, { r, s, mat, matT, mesh, cam });
}
const _corner = new V3();
function drawThumb(type, colorId, target) {
  const { r, s, mat, matT, mesh, cam } = thumbs;
  const col = COLOR[colorId];
  const m = col.trans ? matT : mat;
  m.color.copy(col.linear);
  mesh.material = m;
  mesh.geometry = typeGeometry(type);
  const bb = mesh.geometry.boundingBox;
  const center = bb.getCenter(new V3());
  mesh.position.copy(center).negate();
  cam.position.set(Math.sin(0.62) * 40, 26, Math.cos(0.62) * 40);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    _corner.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
      .sub(center).applyMatrix4(cam.matrixWorldInverse);
    x0 = Math.min(x0, _corner.x); x1 = Math.max(x1, _corner.x);
    y0 = Math.min(y0, _corner.y); y1 = Math.max(y1, _corner.y);
  }
  const half = Math.max(x1 - x0, y1 - y0) * 0.56, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  Object.assign(cam, { left: mx - half, right: mx + half, top: my + half, bottom: my - half });
  cam.updateProjectionMatrix();
  r.render(s, cam);
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(r.domElement, 0, 0, target.width, target.height);
}

// ---------------------------------------------------------------------------
const ui = {
  family: 'brick',
  pieces: new Map(),  // type id -> { el, canvas, drawn }
  selectionChanged() {},
  toolChanged() {},
  pieceChanged() {},
  carryChanged() {},
  toast() {},
};

function initUI() {
  initThumbs();

  // Family tabs and catalog
  const tabs = $('#famTabs'), cat = $('#catalog');
  for (const f of FAMILIES) {
    const b = document.createElement('button');
    b.textContent = f.name;
    b.dataset.fam = f.id;
    b.onclick = () => { play('ui'); showFamily(f.id); };
    tabs.append(b);
  }
  for (const t of TYPES) {
    const el = document.createElement('button');
    el.className = 'piece';
    el.title = t.name;
    el.innerHTML = '<canvas width="132" height="132"></canvas><span></span>';
    el.querySelector('span').textContent = t.short;
    el.onclick = () => {
      play('ui');
      setType(t);
      if (document.body.classList.contains('sheet')) closeSheet();
    };
    cat.append(el);
    ui.pieces.set(t.id, { el, canvas: el.querySelector('canvas'), drawn: null });
  }
  function showFamily(id) {
    ui.family = id;
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.fam === id);
    for (const t of TYPES) ui.pieces.get(t.id).el.hidden = t.fam !== id;
    drawVisibleThumbs();
  }
  ui.showFamily = showFamily;

  // Palette
  const pal = $('#palette');
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'sw' + (c.trans ? ' trans' : '');
    b.style.setProperty('--c', c.trans ? c.hex + 'a0' : c.hex);
    b.title = c.name;
    b.setAttribute('aria-label', c.name);
    b.dataset.color = c.id;
    b.onclick = () => { play('ui'); setColor(c.id); };
    pal.append(b);
  }

  // Tools
  const tools = $('#tools');
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.className = 'ibtn';
    b.dataset.tool = t.id;
    b.dataset.tip = `${t.name}  ${t.key}`;
    b.setAttribute('aria-label', t.name);
    b.innerHTML = icon(t.id);
    b.onclick = () => { play('ui'); setTool(t.id); };
    tools.append(b);
  }
  tools.insertAdjacentHTML('beforeend', '<div class="sep"></div>');
  const rot = document.createElement('button');
  rot.className = 'ibtn';
  rot.dataset.tip = 'Rotate  R';
  rot.setAttribute('aria-label', 'Rotate');
  rot.innerHTML = icon('rotate');
  rot.onclick = () => rotate(1);
  tools.append(rot);

  // Header actions and menu
  $('#undoBtn').innerHTML = icon('undo');
  $('#undoBtn').dataset.tip = `Undo  ${MOD}+Z`;
  $('#undoBtn').onclick = doUndo;
  $('#redoBtn').innerHTML = icon('redo');
  $('#redoBtn').dataset.tip = `Redo  ${MOD}+Y`;
  $('#redoBtn').onclick = doRedo;
  const sb = $('#soundBtn');
  const drawSound = () => { sb.innerHTML = icon(sfx.muted ? 'soundOff' : 'soundOn'); sb.dataset.tip = sfx.muted ? 'Sound off' : 'Sound on'; };
  sb.onclick = () => { ensureAudio(); setMuted(!sfx.muted); drawSound(); play('ui'); };
  drawSound();
  $('#menuBtn').innerHTML = icon('menu');
  const menu = $('#menu');
  const items = [
    ['plus', 'New build…', '', () => openNewDialog()],
    ['open', 'Open file…', `${MOD}+O`, () => $('#fileIn').click()],
    ['save', 'Save to file', `${MOD}+S`, saveFile],
    ['photo', 'Take a photo', '', takePhoto],
    null,
    ['help', 'Controls & help', '?', () => openModal('#helpDlg')],
  ];
  for (const it of items) {
    if (!it) { menu.append(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.innerHTML = `${icon(it[0])}<span>${it[1]}</span>${it[2] ? `<kbd>${it[2]}</kbd>` : ''}`;
    b.onclick = () => { menu.hidden = true; play('ui'); it[3](); };
    menu.append(b);
  }
  $('#menuBtn').onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; play('ui'); };
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== $('#menuBtn')) menu.hidden = true;
  });
  $('#fileIn').onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) openFile(f);
  };

  // Mobile sheet
  $('#sheetClose').innerHTML = icon('close');
  $('#sheetClose').onclick = closeSheet;
  $('#panelToggle').onclick = () => { play('ui'); document.body.classList.add('sheet'); drawVisibleThumbs(); };

  // Dialogs
  for (const m of $$('.modal')) {
    m.addEventListener('pointerdown', (e) => { if (e.target === m) closeModal(m); });
    for (const b of m.querySelectorAll('[data-close]')) b.onclick = () => closeModal(m);
  }
  buildNewDialog();
  buildHelp();

  ui.selectionChanged = updateBars;
  ui.carryChanged = updateBars;
  ui.toolChanged = () => {
    for (const b of $$('#tools [data-tool]')) b.classList.toggle('on', b.dataset.tool === state.tool);
    canvas.style.cursor = state.tool === 'select' ? 'default' : 'crosshair';
    updateBars();
    updateHint();
  };
  ui.pieceChanged = () => {
    for (const [id, p] of ui.pieces) p.el.classList.toggle('on', id === state.type.id);
    for (const b of pal.children) b.classList.toggle('on', b.dataset.color === state.color);
    $('#colorName').textContent = COLOR[state.color].name;
    drawVisibleThumbs();
    drawThumb(state.type, state.color, $('#panelToggle canvas'));
    $('#panelToggle span').textContent = state.type.short;
  };
  ui.toast = toast;
  onWorldChange(updateCounts);

  showFamily(state.type.fam);
  ui.pieceChanged();
  ui.toolChanged();
  updateCounts();
}

function drawVisibleThumbs() {
  for (const t of TYPES) {
    if (t.fam !== ui.family) continue;
    const p = ui.pieces.get(t.id);
    if (p.drawn === state.color) continue;
    drawThumb(t, state.color, p.canvas);
    p.drawn = state.color;
  }
}
function closeSheet() { document.body.classList.remove('sheet'); }

function updateCounts() {
  const n = world.bricks.size;
  $('#count').textContent = `${n.toLocaleString()} brick${n === 1 ? '' : 's'}`;
  $('#undoBtn').disabled = !history.undo.length;
  $('#redoBtn').disabled = !history.redo.length;
}

function barButton(iconName, label, fn, cls = '') {
  const b = document.createElement('button');
  b.className = 'tbtn ' + cls;
  b.innerHTML = `${icon(iconName)}<span>${label}</span>`;
  b.onclick = () => { play('ui'); fn(); };
  return b;
}
function updateBars() {
  const sel = $('#selbar'), car = $('#carrybar');
  const n = state.selection.size;
  sel.hidden = !!state.carry || !n;
  car.hidden = !state.carry;
  if (!sel.hidden) {
    sel.innerHTML = `<span class="lbl">${n} selected</span>`;
    sel.append(
      barButton('move', 'Move', moveSelection),
      barButton('copy', 'Duplicate', duplicateSelection),
      barButton('rotate', 'Rotate', () => rotate(1)),
      barButton('trash', 'Delete', deleteSelection, 'danger'),
      barButton('close', 'Done', () => setSelection([])));
  }
  if (!car.hidden) {
    const k = state.carry.items.length, what = state.carry.originals ? 'Moving' : 'Placing';
    car.innerHTML = `<span class="lbl">${what} ${k} brick${k === 1 ? '' : 's'}<small>${isTouch ? 'tap to drop' : 'click to drop'}</small></span>`;
    car.append(barButton('rotate', 'Rotate', () => rotate(1)), barButton('close', 'Cancel', cancelCarry));
  }
  updateHint();
}

const HINTS = {
  build: '<b>Click</b> to place · <b>R</b> rotate · <b>Right-click</b> delete · <b>Right-drag</b> orbit · <b>Scroll</b> zoom',
  select: '<b>Click</b> or <b>drag a box</b> to select · <b>Drag</b> a brick to move it · <b>Shift</b> adds · <b>R</b> rotates',
  paint: '<b>Click</b> or <b>drag</b> over bricks to paint them · <b>Right-drag</b> orbit',
  pick: '<b>Click</b> a brick to copy its shape, color and rotation',
  erase: '<b>Click</b> or <b>drag</b> over bricks to remove them · <b>Right-drag</b> orbit',
  carry: '<b>Click</b> to drop · <b>R</b> rotate · <b>Esc</b> cancel',
};
function updateHint() { $('#hint').innerHTML = HINTS[state.carry ? 'carry' : state.tool]; }

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}

function openModal(sel) {
  if (state.carry) cancelCarry();
  $(sel).hidden = false;
  clearHover();
}
function closeModal(m) { m.hidden = true; play('ui'); }
const modalOpen = () => $$('.modal').some((m) => !m.hidden);

// ---------------------------------------------------------------------------
// New build / baseplate dialog
const newChoice = { size: 32, base: 'green' };
function buildNewDialog() {
  const so = $('#sizeOpts'), bo = $('#baseOpts');
  const labels = { 16: 'Small', 32: 'Medium', 48: 'Large' };
  for (const s of SIZES) {
    const b = document.createElement('button');
    b.className = 'opt';
    b.dataset.size = s;
    b.innerHTML = `<b>${s} × ${s}</b><span>${labels[s]}</span>`;
    b.onclick = () => { newChoice.size = s; play('ui'); syncNewDialog(); };
    so.append(b);
  }
  for (const id of BASE_COLORS) {
    const c = COLOR[id];
    const b = document.createElement('button');
    b.className = 'sw';
    b.style.setProperty('--c', c.hex);
    b.title = c.name;
    b.setAttribute('aria-label', c.name);
    b.dataset.base = id;
    b.onclick = () => { newChoice.base = id; play('ui'); syncNewDialog(); };
    bo.append(b);
  }
  $('#applyBase').onclick = () => {
    const data = serialize();
    data.size = newChoice.size;
    data.base = newChoice.base;
    const dropped = loadBuild(data);
    afterLoad();
    $('#newDlg').hidden = true;
    toast(dropped ? `Baseplate changed · ${dropped} brick${dropped === 1 ? '' : 's'} didn't fit` : 'Baseplate changed');
  };
  $('#freshBase').onclick = () => {
    loadBuild({ size: newChoice.size, base: newChoice.base, bricks: [] });
    afterLoad();
    $('#newDlg').hidden = true;
    toast('New build started');
  };
}
function syncNewDialog() {
  for (const b of $$('#sizeOpts .opt')) b.classList.toggle('on', +b.dataset.size === newChoice.size);
  for (const b of $$('#baseOpts .sw')) b.classList.toggle('on', b.dataset.base === newChoice.base);
  const n = world.bricks.size;
  let note = n ? `Starting a new build clears your ${n} brick${n === 1 ? '' : 's'}. Save to a file first if you want to keep ${n === 1 ? 'it' : 'them'}.` : '';
  if (n && newChoice.size < world.size) note += ' Shrinking removes bricks outside the smaller plate.';
  $('#newNote').textContent = note;
  $('#newNote').hidden = !note;
  $('#applyBase').hidden = !n;
}
function openNewDialog() {
  newChoice.size = world.size;
  newChoice.base = world.base;
  syncNewDialog();
  openModal('#newDlg');
}

function buildHelp() {
  if (isTouch) $('#helpLede').textContent = 'Tap the Bricks button to choose a brick and a color, then tap the baseplate to build. Your build saves itself in this browser.';
  const rows = isTouch ? [
    ['Tap', 'Use the current tool: place, select, paint, pick or erase'],
    ['Drag', 'Orbit the camera'],
    ['Pinch', 'Zoom'],
    ['Two-finger drag', 'Pan'],
    ['Bricks button', 'Choose a brick and a color'],
    ['Select tool', 'Tap bricks to select several, then move, duplicate, rotate or delete them'],
  ] : [
    ['Left click', 'Use the current tool. In Build and Eyedropper, left-drag also orbits'],
    ['Right-drag', 'Orbit the camera'],
    ['Right-click', 'Delete the brick under the cursor'],
    ['Middle-drag / Shift+right-drag', 'Pan'],
    ['Scroll', 'Zoom'],
    ['W A S D / arrows', 'Pan / orbit with the keyboard'],
    ['B V P I E', 'Build, Select, Paint, Eyedropper, Erase'],
    ['R / Shift+R', 'Rotate the brick, the carried group, or the selection'],
    ['Alt+click', 'Eyedropper while building'],
    ['X / Delete', 'Delete the hovered brick or the selection'],
    ['[ / ]', 'Previous / next color'],
    [`${MOD}+Z / ${MOD}+Y`, 'Undo / redo'],
    [`${MOD}+C / ${MOD}+V / ${MOD}+D`, 'Copy / paste / duplicate the selection'],
    [`${MOD}+A`, 'Select everything'],
    ['F', 'Reset the view'],
    ['Esc', 'Cancel, or clear the selection'],
  ];
  const dl = document.createElement('dl');
  dl.className = 'keys';
  dl.style.marginTop = '16px';
  for (const [k, d] of rows) {
    const dt = document.createElement('dt');
    dt.innerHTML = k.split(' / ').map((s) => `<kbd>${s}</kbd>`).join(' ');
    const dd = document.createElement('dd');
    dd.textContent = d;
    dl.append(dt, dd);
  }
  $('#helpKeys').append(dl);
}

// ---------------------------------------------------------------------------
// Files and photos
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function saveFile() {
  download(new Blob([JSON.stringify(serialize())], { type: 'application/json' }), 'studworks-build.json');
  toast('Saved studworks-build.json');
}
function openFile(file) {
  const r = new FileReader();
  r.onload = () => {
    let data = null;
    try { data = JSON.parse(r.result); } catch (e) { /* handled below */ }
    if (!data || data.app !== 'studworks' || !Array.isArray(data.bricks)) {
      play('error');
      toast("That file isn't a Studworks build");
      return;
    }
    const dropped = loadBuild(data);
    afterLoad();
    play('place');
    toast(`Opened ${world.bricks.size} bricks` + (dropped ? ` · skipped ${dropped}` : ''));
  };
  r.readAsText(file);
}
function takePhoto() {
  const vis = [ghost.visible, selGroup.visible, hoverBox.visible];
  ghost.visible = selGroup.visible = hoverBox.visible = false;
  renderer.render(scene, camera);
  // Composite the studio backdrop behind the transparent canvas.
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  const g = ctx.createRadialGradient(out.width / 2, out.height * 0.18, 0, out.width / 2, out.height * 0.18, Math.max(out.width, out.height) * 1.1);
  g.addColorStop(0, '#fdfdfe'); g.addColorStop(0.5, '#eaeef3'); g.addColorStop(1, '#d3d9e1');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  [ghost.visible, selGroup.visible, hoverBox.visible] = vis;
  invalidate();
  out.toBlob((b) => { download(b, 'studworks-photo.png'); toast('Photo saved'); });
  play('select');
}
function afterLoad() {
  state.selection.clear();
  state.carry = null;
  refreshSelection();
  ui.carryChanged();
  frameBaseplate(world.size);
  clearHover();
}
