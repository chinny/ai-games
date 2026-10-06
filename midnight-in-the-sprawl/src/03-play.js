// ===================== Post-processing & quality =====================
let composer = null, bloom = null;
if (HAS_POST) {
  const rt = new THREE.WebGLRenderTarget(2, 2, { samples: isWebGL2 ? 4 : 0 });
  composer = new THREE.EffectComposer(renderer, rt);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.95, 0.55, 0.5);
  composer.addPass(bloom);
}
let quality = HAS_POST ? 'high' : 'low';
const bQ = $('#b-q'), bMusic = $('#b-music');

function resize() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  const high = quality === 'high';
  const pr = Math.min(window.devicePixelRatio || 1, high ? 1.5 : 1);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(pr); composer.setSize(w, h); }
  if (reflector) reflector.getRenderTarget().setSize(Math.max(2, Math.round(w * pr * 0.5)), Math.max(2, Math.round(h * pr * 0.5)));
}
function applyQuality() {
  const high = quality === 'high';
  if (reflector) reflector.visible = high;
  plainGround.visible = !high || !reflector;
  bQ.textContent = high ? 'HQ' : 'LQ';
  bQ.setAttribute('aria-pressed', String(high));
  bQ.title = high ? 'Graphics: high (bloom + reflections)' : 'Graphics: low (faster)';
  resize();
}
function toggleQuality() {
  if (!HAS_POST) { showHint('High graphics need the bloom library, which did not load.'); return; }
  quality = quality === 'high' ? 'low' : 'high';
  autoChecked = true;
  applyQuality();
  showHint(quality === 'high' ? 'Graphics: high. Bloom and wet-street reflections on.' : 'Graphics: low. Faster, flatter.');
}
function render() {
  if (quality === 'high' && composer) composer.render();
  else renderer.render(scene, camera);
}
addEventListener('resize', resize);

// ===================== Music =====================
const SONG_URL = 'midnight_in_the_sprawl.mp3';
const audio = new Audio();
audio.preload = 'auto';
audio.loop = true;
audio.src = SONG_URL;
let actx = null, analyser = null, gainNode = null, freq = null;
let songMode = 'element';     // 'element' | 'buffer' | 'none'
let songState = 'idle';       // 'idle' | 'loading' | 'playing' | 'error'
let elementFailed = false;
let bufStart = 0, bufDur = 0;
let musicOn = true;
audio.addEventListener('error', () => {
  elementFailed = true;
  if (actx && songMode === 'element') loadBuffer();
  else if (!actx && songState !== 'idle') songState = 'error';
});
audio.addEventListener('playing', () => { if (songMode === 'element') songState = 'playing'; });
audio.addEventListener('waiting', () => { if (songMode === 'element' && songState !== 'error') songState = 'loading'; });

function initAudio() {
  // must run inside the click/tap that starts the game
  if (actx) { if (actx.state === 'suspended') actx.resume(); if (songMode === 'element' && audio.paused) audio.play().catch(() => {}); return; }
  songState = 'loading';
  if (location.protocol === 'file:') {
    // opened straight from disk: browsers mute Web Audio for local files, so play the song directly (no beat-sync)
    audio.play().catch(() => { songState = 'error'; });
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) {
    songMode = 'element';
    audio.play().catch(() => { songState = 'error'; });
    return;
  }
  actx = new AC();
  analyser = actx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.75;
  freq = new Uint8Array(analyser.frequencyBinCount);
  gainNode = actx.createGain();
  gainNode.gain.value = musicOn ? 1 : 0;
  analyser.connect(gainNode);
  gainNode.connect(actx.destination);
  if (elementFailed) { loadBuffer(); return; }
  try {
    const src = actx.createMediaElementSource(audio);
    src.connect(analyser);
  } catch (e) { loadBuffer(); return; }
  const p = audio.play();
  if (p && p.catch) p.catch((err) => { if (!err || err.name !== 'AbortError') loadBuffer(); });
}
async function loadBuffer() {
  if (songMode === 'buffer') return;
  songMode = 'buffer';
  songState = 'loading';
  try { audio.pause(); } catch (e) { /* ignore */ }
  try {
    const res = await fetch(SONG_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ab = await res.arrayBuffer();
    const buf = await new Promise((ok, bad) => actx.decodeAudioData(ab, ok, bad));
    const src = actx.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.connect(analyser);
    src.start();
    bufStart = actx.currentTime; bufDur = buf.duration;
    songState = 'playing';
  } catch (e) {
    console.warn('Song could not load', e);
    songMode = 'none';
    songState = 'error';
  }
}
function songTime() {
  if (songMode === 'buffer' && bufDur) return [(actx.currentTime - bufStart) % bufDur, bufDur];
  if (songMode === 'element') return [audio.currentTime || 0, isFinite(audio.duration) ? audio.duration : 175];
  return [0, 175];
}
function toggleMusic() {
  musicOn = !musicOn;
  if (gainNode) gainNode.gain.setTargetAtTime(musicOn ? 1 : 0, actx.currentTime, 0.05);
  else audio.muted = !musicOn;
  bMusic.textContent = musicOn ? 'Music on' : 'Music off';
  bMusic.setAttribute('aria-pressed', String(musicOn));
}

let pulse = 0, bassAvg = 0.3;
function updateAudio(dt) {
  if (analyser && songState === 'playing') {
    analyser.getByteFrequencyData(freq);
    let b = 0;
    for (let i = 1; i < 7; i++) b += freq[i];
    b /= 6 * 255;
    bassAvg += (b - bassAvg) * Math.min(1, dt * 1.5);
    const kick = Math.max(0, b - bassAvg * 1.04) * 5;
    const target = Math.min(1, kick + Math.max(0, b - 0.3) * 0.5);
    pulse = Math.max(pulse * Math.exp(-dt * 7), target);
  } else {
    pulse *= Math.exp(-dt * 4);
  }
}

// ===================== Billboard =====================
const BIN = [];
for (let i = 0; i < 40; i++) BIN.push(Math.min(200, Math.floor(2 * Math.pow(160 / 2, i / 39))));
const fmt = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function drawBillboard(t) {
  const g = bbCtx, W = 512, H = 256;
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, '#1d0630'); gr.addColorStop(1, '#03142a');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const live = analyser && songState === 'playing';
  const bars = 40, bw = (W - 40) / bars;
  for (let i = 0; i < bars; i++) {
    let v = live ? freq[BIN[i]] / 255 : 0.22 + 0.16 * Math.sin(t * 1.6 + i * 0.45) + 0.07 * Math.sin(t * 3.3 + i * 1.3);
    v = Math.pow(Math.max(0, v), 1.35);
    const bh = 6 + v * 96;
    g.fillStyle = `hsl(${305 - i * 3.3}, 100%, ${58 + v * 14}%)`;
    g.fillRect(20 + i * bw + 1, H - 30 - bh, bw - 3, bh);
  }
  g.save();
  g.shadowColor = '#ff3fc4'; g.shadowBlur = 18;
  g.fillStyle = '#ffe9fa';
  g.font = '700 50px "Chakra Petch", "Arial Narrow", sans-serif';
  g.textBaseline = 'alphabetic';
  g.fillText('MIDNIGHT IN', 22, 60);
  g.fillText('THE SPRAWL', 22, 110);
  g.restore();
  g.font = '500 15px "IBM Plex Mono", monospace';
  g.fillStyle = '#7ff6ff';
  const [ct, du] = songTime();
  g.fillText(live ? `NOW PLAYING  ${fmt(ct)} / ${fmt(du)}` : 'SECTOR 7 · ALL NIGHT', 22, H - 9);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
}

// ===================== Fonts for sign artwork =====================
{
  const jp = document.createElement('link');
  jp.rel = 'stylesheet';
  jp.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@900&display=swap&text=' + encodeURIComponent(SIGN_CHARS);
  jp.onload = () => {
    if (document.fonts && document.fonts.load) document.fonts.load('900 64px "Noto Sans JP"', SIGN_CHARS).then(redrawSigns, () => {});
  };
  document.head.appendChild(jp);
  if (document.fonts && document.fonts.ready) {
    document.fonts.load('700 48px "Chakra Petch"').then(redrawSigns, () => {});
  }
}

// ===================== Player & controls =====================
const player = { x: 0, z: 118, yaw: 0, pitch: 0.08, vx: 0, vz: 0, bob: 0 };
const keys = new Set();
let state = 'title'; // 'title' | 'play' | 'paused'
const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
let lookMode = coarse ? 'touch' : 'lock'; // 'lock' | 'drag' | 'touch'
let hadLock = false, dragging = false;
const joy = { id: null, x: 0, y: 0, ox: 0, oy: 0, mag: 0 };
const lookTouches = new Map();
const joyEl = $('#joy'), joyKnob = $('#joy i');
const overlay = $('#overlay'), hud = $('#hud'), crosshair = $('#crosshair'), hintEl = $('#hint');
if (coarse) { $('#keys-desktop').hidden = true; $('#keys-touch').hidden = false; }

let hintTimer = 0;
function showHint(msg, secs = 4.5) {
  hintEl.textContent = msg;
  hintEl.classList.remove('fade');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.add('fade'), secs * 1000);
}

function look(dx, dy, s) {
  player.yaw -= dx * s;
  player.pitch = clamp(player.pitch - dy * s, -1.35, 1.35);
}
function requestLock() {
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(onLockError);
  } catch (e) { onLockError(); }
}
function onLockError() {
  if (hadLock) { if (state === 'play') pause('Click Resume to keep walking.'); return; }
  lookMode = 'drag';
  if (state === 'play') showHint('Hold the mouse button and drag to look. WASD to walk.', 6);
}
document.addEventListener('pointerlockerror', onLockError);
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) { hadLock = true; return; }
  if (state === 'play' && lookMode === 'lock') pause();
});

function pause(note) {
  state = 'paused';
  keys.clear();
  $('#eyebrow').textContent = 'Paused · ' + locateText().title;
  $('#lede').textContent = note || 'The city keeps running while you take a breather. The music keeps playing.';
  startBtn.textContent = 'Resume';
  overlay.hidden = false;
  crosshair.hidden = true;
}
function play() {
  initAudio();
  const first = state === 'title';
  state = 'play';
  overlay.hidden = true;
  hud.hidden = false;
  crosshair.hidden = lookMode === 'touch';
  if (lookMode === 'lock') requestLock();
  try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  if (first) {
    if (lookMode === 'touch') showHint('Left thumb walks · right thumb looks around', 6);
    else if (lookMode === 'lock') showHint('WASD to walk · Shift to run · Esc to pause', 6);
    else showHint('Drag to look · WASD to walk · Shift to run', 6);
    autoT = -1.5; autoFrames = 0;
  }
}
startBtn.addEventListener('click', play);
bMusic.addEventListener('click', (e) => { e.stopPropagation(); toggleMusic(); });
bQ.addEventListener('click', (e) => { e.stopPropagation(); toggleQuality(); });

addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') toggleMusic();
  else if (e.code === 'KeyQ') toggleQuality();
  else if (e.code === 'Escape' && state === 'play' && lookMode !== 'lock') pause();
  else if ((e.code === 'Enter' || e.code === 'Space') && state !== 'play' && !startBtn.disabled && document.activeElement !== startBtn) play();
  if (state === 'play') {
    keys.add(e.code);
    if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); dragging = false; });

canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'play') return;
  if (e.pointerType === 'mouse') {
    if (lookMode === 'lock' && document.pointerLockElement !== canvas) requestLock();
    else if (lookMode === 'drag') dragging = true;
    return;
  }
  // touch / pen
  if (lookMode !== 'touch') { lookMode = 'touch'; crosshair.hidden = true; }
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (joy.id === null && e.clientX < innerWidth * 0.45) {
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = joy.mag = 0;
    joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px';
    joyKnob.style.transform = '';
    joyEl.hidden = false;
  } else {
    lookTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
});
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    if (state !== 'play') return;
    if (lookMode === 'lock' && document.pointerLockElement === canvas) look(e.movementX || 0, e.movementY || 0, 0.0022);
    else if (lookMode === 'drag' && dragging) look(e.movementX || 0, e.movementY || 0, 0.0045);
    return;
  }
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const d = Math.hypot(dx, dy), max = 56;
    if (d > max) { dx *= max / d; dy *= max / d; }
    joy.x = dx / max; joy.y = dy / max; joy.mag = Math.min(1, d / max);
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  } else if (lookTouches.has(e.pointerId)) {
    const p = lookTouches.get(e.pointerId);
    look(e.clientX - p.x, e.clientY - p.y, 0.0052);
    p.x = e.clientX; p.y = e.clientY;
  }
});
function endPointer(e) {
  if (e.pointerType === 'mouse') { dragging = false; return; }
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = joy.mag = 0; joyEl.hidden = true; }
  lookTouches.delete(e.pointerId);
}
addEventListener('pointerup', endPointer);
addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---- Movement & collision ----
const RAD = 0.45;
function pushOut(r) {
  const cx = clamp(player.x, r.x0, r.x1), cz = clamp(player.z, r.z0, r.z1);
  const dx = player.x - cx, dz = player.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= RAD * RAD) return;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    player.x = cx + (dx / d) * RAD; player.z = cz + (dz / d) * RAD;
  } else {
    const l = player.x - r.x0, rr = r.x1 - player.x, t = player.z - r.z0, b = r.z1 - player.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) player.x = r.x0 - RAD; else if (m === rr) player.x = r.x1 + RAD;
    else if (m === t) player.z = r.z0 - RAD; else player.z = r.z1 + RAD;
  }
}
function collide() {
  const lim = HALF + ST / 2 - 1;
  player.x = clamp(player.x, -lim, lim);
  player.z = clamp(player.z, -lim, lim);
  const bi = Math.floor((player.x + HALF) / P), bj = Math.floor((player.z + HALF) / P);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const list = grid.get(key(bi + di, bj + dj));
    if (list) for (let k = 0; k < list.length; k++) pushOut(footprints[list[k]]);
  }
  const hx = player.x - PLAZA_C.x, hz = player.z - PLAZA_C.z, hd = Math.hypot(hx, hz), hr = 3.6 + RAD;
  if (hd < hr && hd > 1e-6) { player.x = PLAZA_C.x + (hx / hd) * hr; player.z = PLAZA_C.z + (hz / hd) * hr; }
}
function updatePlayer(dt) {
  let fx = 0, fz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fz += 1;
  if (keys.has('KeyA')) fx -= 1;
  if (keys.has('KeyD')) fx += 1;
  if (keys.has('ArrowLeft')) player.yaw += dt * 1.9;
  if (keys.has('ArrowRight')) player.yaw -= dt * 1.9;
  fx += joy.x; fz += joy.y;
  const len = Math.hypot(fx, fz);
  if (len > 1) { fx /= len; fz /= len; }
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || joy.mag > 0.92;
  const speed = run ? 10.5 : 5.2;
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  const wx = fx * c + fz * s, wz = -fx * s + fz * c;
  const k = 1 - Math.exp(-dt * 10);
  player.vx += (wx * speed - player.vx) * k;
  player.vz += (wz * speed - player.vz) * k;
  player.x += player.vx * dt;
  player.z += player.vz * dt;
  collide();
  const sp = Math.hypot(player.vx, player.vz);
  player.bob += dt * sp * 1.35;
  const bob = reducedMotion ? 0 : Math.sin(player.bob * 2) * 0.045 * Math.min(1, sp / 5);
  camera.position.set(player.x, 1.7 + bob, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
}
function attract(dt, t) {
  // title screen: drift slowly up Hikari Ave towards the plaza
  player.z -= dt * (reducedMotion ? 0.6 : 1.8);
  if (player.z < -150) player.z = 118;
  player.yaw = Math.sin(t * 0.07) * 0.32 - 0.12;
  player.pitch = 0.1 + Math.sin(t * 0.05) * 0.05;
  camera.position.set(player.x, 1.7, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
}

// ===================== HUD =====================
const streetEl = $('#street'), subEl = $('#sub'), npLabel = $('#np-label'), npTime = $('#np-time'), npBar = $('#np-bar');
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const dirOf = (deg) => DIRS[Math.round(deg / 45) % 8];
function locateText() {
  const x = player.x, z = player.z;
  const kx = Math.round((x + HALF) / P), kz = Math.round((z + HALF) / P);
  const edge = ST / 2 + 1.6; // count the strip along shopfronts as part of the street
  const onAve = Math.abs(x - sLine(kx)) < edge && kx >= 0 && kx <= N;
  const onSt = Math.abs(z - sLine(kz)) < edge && kz >= 0 && kz <= N;
  const bi = Math.floor((x + HALF) / P), bj = Math.floor((z + HALF) / P);
  const blockName = 'Block ' + String.fromCharCode(65 + clamp(bi, 0, 25)) + '-' + (clamp(bj, 0, 98) + 1);
  if (onAve && onSt) return { title: `${AVES[kx]} × ${STS[kz]}`, block: 'Intersection' };
  if (onAve) return { title: AVES[kx], block: blockName };
  if (onSt) return { title: STS[kz], block: blockName };
  if (bi === PLAZA.i && bj === PLAZA.j) return { title: 'Sprawl Plaza', block: 'Hologram' };
  return { title: 'Back alley', block: blockName };
}
function updateHud() {
  const L = locateText();
  streetEl.textContent = L.title;
  const heading = (((-player.yaw * 180) / Math.PI) % 360 + 360) % 360;
  const dx = PLAZA_C.x - player.x, dz = PLAZA_C.z - player.z;
  const dist = Math.hypot(dx, dz);
  const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  const plaza = dist < 26 ? 'At the plaza' : `Plaza ${Math.round(dist)} m ${dirOf(bearing)}`;
  subEl.textContent = `${dirOf(heading)} ${String(Math.round(heading) % 360).padStart(3, '0')}° · ${plaza}`;
  const [ct, du] = songTime();
  if (songState === 'error') { npLabel.textContent = "Song couldn't load"; npTime.textContent = ''; npBar.style.width = '0'; }
  else if (songState === 'loading' || songState === 'idle') { npLabel.textContent = '♪ Loading song…'; npTime.textContent = ''; }
  else {
    npLabel.textContent = musicOn ? '♪ Midnight in the Sprawl' : '♪ Muted';
    npTime.textContent = `${fmt(ct)} / ${fmt(du)}`;
    npBar.style.width = ((ct / du) * 100).toFixed(2) + '%';
  }
}

// ---- Minimap ----
const mm = $('#mm'), mctx = mm.getContext('2d');
function drawMap() {
  const S = mm.width, view = 230, sc = S / view;
  mctx.fillStyle = '#100c1e';
  mctx.fillRect(0, 0, S, S);
  const px = player.x, pz = player.z;
  const X = (x) => (x - px) * sc + S / 2, Z = (z) => (z - pz) * sc + S / 2;
  // plaza
  mctx.fillStyle = 'rgba(69,240,255,0.12)';
  mctx.fillRect(X(PR.x0), Z(PR.z0), (PR.x1 - PR.x0) * sc, (PR.z1 - PR.z0) * sc);
  mctx.strokeStyle = 'rgba(69,240,255,0.8)'; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.arc(X(PLAZA_C.x), Z(PLAZA_C.z), 4 * sc, 0, Math.PI * 2); mctx.stroke();
  for (let k = 0; k < footprints.length; k++) {
    const r = footprints[k];
    if (r.small) continue;
    if (r.x1 < px - view / 2 || r.x0 > px + view / 2 || r.z1 < pz - view / 2 || r.z0 > pz + view / 2) continue;
    mctx.fillStyle = '#3a2f5c';
    mctx.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * sc, (r.z1 - r.z0) * sc);
  }
  // player arrow
  const hd = -player.yaw;
  mctx.save();
  mctx.translate(S / 2, S / 2); mctx.rotate(hd);
  mctx.fillStyle = '#ff3fc4'; mctx.shadowColor = '#ff3fc4'; mctx.shadowBlur = 8;
  mctx.beginPath(); mctx.moveTo(0, -11); mctx.lineTo(7, 8); mctx.lineTo(0, 4); mctx.lineTo(-7, 8); mctx.closePath(); mctx.fill();
  mctx.restore();
  mctx.fillStyle = '#9a93c4'; mctx.font = '500 18px "IBM Plex Mono", monospace'; mctx.textAlign = 'center';
  mctx.fillText('N', S / 2, 20);
}

// ===================== Main loop =====================
let t = 0, last = performance.now(), hudT = 0, mapT = 0, bbT = 0, flickT = 0, flickOn = true;
let autoT = 0, autoFrames = 0, autoChecked = false;
const tick = (now) => {
  requestAnimationFrame(tick);
  const rawDt = Math.max(0, (now - last) / 1000);
  const dt = Math.min(0.05, rawDt);
  last = now; t += dt;
  updateAudio(dt);
  if (state === 'play') updatePlayer(dt);
  else if (state === 'title') attract(dt, t);
  updateCars(dt);

  holoKnot.rotation.y += dt * 0.35;
  holoKnot.rotation.x = Math.sin(t * 0.3) * 0.25;
  holoKnot.scale.setScalar(1 + pulse * 0.12);
  holoKnot.material.opacity = 0.26 + pulse * 0.22 + (Math.random() < 0.04 ? 0.15 : 0);
  holoCore.rotation.y -= dt * 0.8; holoCore.rotation.z += dt * 0.4;
  holoCore.scale.setScalar(1 + pulse * 0.3);
  const neonI = 0.9 + pulse * 0.5;
  neonMat.color.setScalar(neonI);
  flickT -= dt;
  if (flickT <= 0) { flickOn = Math.random() < (flickOn ? 0.35 : 0.85); flickT = flickOn ? 0.2 + Math.random() * 2.5 : 0.04 + Math.random() * 0.12; }
  flickMat.color.setScalar(flickOn ? neonI : 0.07);
  beaconMat.color.setRGB((t % 2.4) < 0.5 ? 1 : 0.12, 0.08, 0.1);

  buildingMat.uniforms.uTime.value = t;
  groundUniformSets.forEach((u) => { u.uTime.value = t; u.uPulse.value = pulse; });
  skyMat.uniforms.uTime.value = t;
  rainMat.uniforms.uTime.value = t;
  rainMat.uniforms.uCam.value.copy(camera.position);
  beamMat.uniforms.uTime.value = t; beamMat.uniforms.uPulse.value = pulse;
  sky.position.copy(camera.position);
  if (bloom) bloom.strength = 0.9 + pulse * 0.45;

  bbT -= dt;
  if (bbT <= 0) { drawBillboard(t); bbTex.needsUpdate = true; bbT = 1 / 24; }

  render();

  if (state === 'play') {
    hudT -= dt; if (hudT <= 0) { updateHud(); hudT = 0.15; }
    mapT -= dt; if (mapT <= 0) { drawMap(); mapT = 0.08; }
    // drop to low graphics once if the device is struggling
    if (!autoChecked && quality === 'high') {
      autoT += rawDt;
      if (autoT > 0) autoFrames++;
      if (autoT > 3) {
        autoChecked = true;
        if (autoFrames / autoT < 30) {
          quality = 'low'; applyQuality();
          showHint('Switched to lighter graphics for smoother walking. Tap HQ/LQ (or press Q) to change.', 7);
        }
      }
    }
  }
};

// ===================== Boot =====================
function boot(data) {
  if (data && typeof data.x === 'number') {
    player.x = data.x; player.z = data.z; player.yaw = data.yaw || 0; player.pitch = data.pitch || 0;
    if (data.started) {
      state = 'paused';
      $('#eyebrow').textContent = 'Paused · ' + locateText().title;
      $('#lede').textContent = 'The city was just updated. Pick up where you left off.';
    }
  }
  applyQuality();
  camera.position.set(player.x, 1.7, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  drawBillboard(0); bbTex.needsUpdate = true;
  render();
  startBtn.disabled = false;
  startBtn.textContent = state === 'paused' ? 'Resume' : 'Enter the city';
  last = performance.now();
  requestAnimationFrame(tick);
}
const hot = window.claude && window.claude.hot;
try {
  if (hot && hot.snapshot) hot.snapshot(() => ({ x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch, started: state !== 'title' }));
} catch (e) { /* optional */ }
if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
