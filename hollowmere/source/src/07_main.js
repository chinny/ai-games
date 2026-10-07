// Hollowmere — player, weather, UI flow and the main loop

const START = { x: 0, z: 88, yaw: 0 };
const P = { x: START.x, z: START.z, yaw: START.yaw, pitch: 0, stam: 1, tired: false, bob: 0, inside: false };
let state = 'title', time = 0, last = performance.now();
let fear = 0, fx = 0, finalPhase = false, deadT = 0, hbT = 0, focus = null, locked = false, touchRun = false, endKind = '';
const found = new Set();
function setState(s) { state = s; document.body.dataset.state = s; }
function fxBurst(v) { fx = Math.max(fx, v); }

resize();
addEventListener('resize', resize);
buildWorld();
if (isTouch) {
  document.body.classList.add('touch');
  $('#help').innerHTML = 'Left thumb: walk · Right thumb: look · READ to pick up pages<br>Find the eight pages. Don\'t look at him for long.';
  $('#noteHint').textContent = 'Tap to put it down';
}

// ---------- weather ----------
const LT = { next: 2, t: -1, power: 1 };
const bolt = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(26 * 3), 3)),
  new THREE.LineBasicMaterial({ color: 0xe8eeff }));
bolt.frustumCulled = false; bolt.visible = false; scene.add(bolt);
function strike() {
  LT.t = 0; LT.power = 0.6 + Math.random() * 0.4;
  const near = Math.random() < 0.3;
  thunder((0.4 + Math.random() * 2.8) * (near ? 0.3 : 1), near);
  const a = Math.random() * TAU, R = 90, pos = bolt.geometry.attributes.position;
  let x = camera.position.x + Math.sin(a) * R, z = camera.position.z + Math.cos(a) * R;
  for (let i = 0; i < 26; i++) {
    pos.setXYZ(i, x, 75 - i * 3, z);
    x += (Math.random() - 0.5) * 6; z += (Math.random() - 0.5) * 6;
  }
  pos.needsUpdate = true;
}
function flashCurve(t) {
  if (t < 0) return 0;
  if (t < 0.06) return 1;
  if (t < 0.11) return 0.12;
  if (t < 0.17) return 0.85;
  if (t < 1) return 0.85 * Math.exp(-(t - 0.17) * 7);
  return 0;
}
function updateLightning(dt) {
  LT.next -= dt;
  if (LT.next <= 0 && endKind !== 'bell') { strike(); LT.next = (6 + Math.random() * 12) * (finalPhase ? 0.6 : 1); }
  if (LT.t >= 0) { LT.t += dt; if (LT.t > 1.2) LT.t = -1; }
  U.uFlash.value = flashCurve(LT.t) * LT.power;
  bolt.visible = LT.t >= 0 && LT.t < 0.22 && (LT.t < 0.06 || LT.t > 0.11);
}

const RN = 900, rainGeo = new THREE.BufferGeometry(), rainArr = new Float32Array(RN * 6), rainY = new Float32Array(RN);
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainArr, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x7d8899, transparent: true, opacity: 0.55 }));
rain.frustumCulled = false; scene.add(rain);
const rainX = new Float32Array(RN), rainZ = new Float32Array(RN);
function dropRespawn(i, top) {
  const cx = camera.position.x, cz = camera.position.z;
  rainX[i] = cx + (Math.random() - 0.5) * 26; rainZ[i] = cz + (Math.random() - 0.5) * 26;
  rainY[i] = camera.position.y + (top ? 8 + Math.random() * 4 : Math.random() * 12 - 2);
  if (inRoof(rainX[i], rainZ[i])) rainY[i] = -100;
}
for (let i = 0; i < RN; i++) dropRespawn(i, false);
function updateRain(dt) {
  rain.visible = endKind !== 'bell';
  for (let i = 0; i < RN; i++) {
    rainY[i] -= 24 * dt; rainX[i] += 2.5 * dt;
    const g = rainY[i] < -50 ? 0 : groundH(rainX[i], rainZ[i]);
    if (rainY[i] < g || Math.abs(rainX[i] - camera.position.x) > 14 || Math.abs(rainZ[i] - camera.position.z) > 14) dropRespawn(i, true);
    const o = i * 6;
    rainArr[o] = rainX[i]; rainArr[o + 1] = rainY[i]; rainArr[o + 2] = rainZ[i];
    rainArr[o + 3] = rainX[i] + 0.06; rainArr[o + 4] = rainY[i] + 0.6; rainArr[o + 5] = rainZ[i];
  }
  rainGeo.attributes.position.needsUpdate = true;
}

// ---------- the lantern in your hand ----------
const hand = new THREE.Group(), lamp = new THREE.Group();
(function buildLantern() {
  const iron = new Geo({ ao: false }), glow = new Geo({ ao: false });
  box(iron, 0, -0.11, 0, 0.13, 0.02, 0.13, { ts: 0.2, skip: '' });
  box(iron, 0, 0.09, 0, 0.13, 0.02, 0.13, { ts: 0.2, skip: '' });
  for (const sx of [-0.06, 0.06]) for (const sz of [-0.06, 0.06]) limb(iron, [sx, -0.1, sz], [sx, 0.1, sz], 0.007, 3);
  limb(iron, [0, 0.11, 0], [0, 0.17, 0], 0.03, 4, { r1: 0.005 });
  limb(iron, [-0.05, 0.11, 0], [0, 0.2, 0], 0.005, 3); limb(iron, [0.05, 0.11, 0], [0, 0.2, 0], 0.005, 3);
  box(glow, 0, -0.09, 0, 0.1, 0.18, 0.1, { ts: 0.2, col: [1, 0.72, 0.38], skip: '' });
  lamp.add(iron.build(MAT.iron), glow.build(MAT.glow));
  lamp.position.set(0.3, -0.34, -0.8);
  lamp.scale.setScalar(0.75);
  hand.add(lamp);
  handScene.add(hand);
})();

// ---------- player ----------
function collide(x, z, r) {
  for (const b of boxes) {
    if (x < b[0] - r || x > b[2] + r || z < b[1] - r || z > b[3] + r) continue;
    const cx = clamp(x, b[0], b[2]), cz = clamp(z, b[1], b[3]), dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-9) { const d = Math.sqrt(d2); x = cx + dx / d * r; z = cz + dz / d * r; }
    else {
      const pushes = [[b[0] - r - x, 0], [b[2] + r - x, 0], [0, b[1] - r - z], [0, b[3] + r - z]];
      pushes.sort((p, q) => Math.abs(p[0] + p[1]) - Math.abs(q[0] + q[1]));
      x += pushes[0][0]; z += pushes[0][1];
    }
  }
  for (const c of circles) {
    const dx = x - c[0], dz = z - c[1], rr2 = c[2] + r, d2 = dx * dx + dz * dz;
    if (d2 < rr2 * rr2 && d2 > 1e-9) { const d = Math.sqrt(d2); x = c[0] + dx / d * rr2; z = c[1] + dz / d * rr2; }
  }
  return [x, z];
}

const TJ = { id: null, x0: 0, y0: 0, x: 0, y: 0 }, TL = { id: null, x: 0, y: 0 };
let lastStep = 0;
function updatePlayer(dt) {
  P.yaw -= mouse.dx * 0.0022; P.pitch = clamp(P.pitch - mouse.dy * 0.0022, -1.35, 1.35);
  mouse.dx = mouse.dy = 0;
  let f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1;
  if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyD || keys.ArrowRight) s += 1;
  if (keys.KeyA || keys.ArrowLeft) s -= 1;
  if (TJ.id !== null) { s += clamp((TJ.x - TJ.x0) / 50, -1, 1); f -= clamp((TJ.y - TJ.y0) / 50, -1, 1); }
  const len = Math.hypot(f, s);
  if (len > 1) { f /= len; s /= len; }
  const moving = len > 0.15;
  if (P.stam < 0.03) P.tired = true;
  if (P.tired && P.stam > 0.4) P.tired = false;
  const run = (keys.ShiftLeft || keys.ShiftRight || touchRun) && moving && f > 0 && !P.tired;
  P.stam = clamp(P.stam + (run ? -0.19 : 0.11) * dt, 0, 1);
  const spd = run ? 5.4 : 2.9;
  const fx_ = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  let nx = P.x + (fx_ * f + rx * s) * spd * dt, nz = P.z + (fz * f + rz * s) * spd * dt;
  [nx, nz] = collide(nx, nz, 0.35);
  if (inBounds(nx, nz)) { P.x = nx; P.z = nz; }
  else if (inBounds(nx, P.z)) P.x = nx;
  else if (inBounds(P.x, nz)) P.z = nz;
  if (P.z > 89.5) {
    if (finalPhase) { ending('escape'); return; }
    P.z = 89.5; say('Not yet. You came to find out what happened here.', 3.5);
  }
  if (moving) P.bob += dt * spd * 2.1;
  const stepN = Math.floor(P.bob / Math.PI);
  P.inside = inRoof(P.x, P.z);
  if (stepN !== lastStep) { lastStep = stepN; footstep(P.inside); }
  const shake = fear * fear * 0.03;
  camera.position.set(P.x, groundH(P.x, P.z) + 1.62 + Math.sin(P.bob) * 0.045 * (moving ? 1 : 0), P.z);
  camera.rotation.set(P.pitch + (Math.random() - 0.5) * shake, P.yaw + (Math.random() - 0.5) * shake, 0);
  U.uLantern.value.set(P.x + rx * 0.3 + fx_ * 0.45, camera.position.y - 0.3, P.z + rz * 0.3 + fz * 0.45);
  lamp.rotation.z = Math.sin(P.bob * 0.5) * 0.08; lamp.rotation.x = Math.cos(P.bob) * 0.04;
  $('#stam').style.opacity = P.stam < 0.98 ? 1 : 0;
  $('#stam i').style.width = (P.stam * 100) + '%';
}

function updateInteract() {
  focus = null;
  let best = 2.3;
  const fxv = -Math.sin(P.yaw), fzv = -Math.cos(P.yaw);
  for (const it of inter) {
    if (it.taken) continue;
    const dx = it.pos[0] - P.x, dz = it.pos[2] - P.z, d = Math.hypot(dx, dz);
    if (d > best || (d > 0.5 && (dx * fxv + dz * fzv) / d < 0.5)) continue;
    best = d; focus = it;
  }
  const verb = isTouch ? 'READ' : '[E]';
  $('#prompt').textContent = !focus ? '' : focus.kind === 'page' ? `${verb} Read` : `${verb} ${finalPhase ? 'Ring the bell' : 'Pull the rope'}`;
  $('#tRead').textContent = focus && focus.kind === 'rope' ? 'PULL' : 'READ';
}
function interact() {
  if (state === 'note') { closeNote(); return; }
  if (state !== 'play' || !focus) return;
  if (focus.kind === 'page') openNote(focus);
  else if (finalPhase) ending('bell');
  else say('Your hand closes on the rope, and stops. Not until you know what it\'s for.', 4);
}
function openNote(it) {
  it.taken = true; it.mesh.visible = false; found.add(it.id);
  pageSound();
  $('#noteTitle').textContent = STORY[it.id].t;
  $('#noteBody').textContent = STORY[it.id].b;
  $('#note').hidden = false;
  setState('note');
  $('#pages').textContent = `PAGES ${found.size}/8`;
}
function closeNote() {
  $('#note').hidden = true;
  setState('play');
  const n = found.size;
  if (n === 1 && !M.active) {
    M.active = true; M.intro = false; M.group.visible = true; M.grace = 5; M.tp = 8;
    teleportMonster(1, 30);
    say('Something in the trees has noticed you.', 4);
  } else if (n === 8 && !finalPhase) {
    finalPhase = true; M.tp = 2;
    $('#obj').textContent = 'Leave by the coach road — or ring the church bell.';
    say('Leave by the coach road, or ring the church bell.', 6);
  }
  if (!isTouch && !locked) pause();
}

let sayTimer = 0;
function say(text, secs = 4) {
  const m = $('#msg');
  if (m.textContent === text && m.classList.contains('on')) return;
  m.textContent = text; m.classList.add('on');
  clearTimeout(sayTimer); sayTimer = setTimeout(() => m.classList.remove('on'), secs * 1000);
}

// ---------- fear, static, sound mix ----------
const stCv = $('#static'), stCtx = stCv.getContext('2d'), stImg = stCtx.createImageData(160, 120);
function updateFX(dt) {
  const prox = M.active && M.group.visible && state !== 'title' ? clamp(1 - M.dist / 20, 0, 1) : 0;
  fx = Math.max(0, fx - dt * 1.2);
  let st = clamp(fear * 0.95 + prox * 0.3 + fx, 0, 1);
  if (state === 'dead') st = deadT < 1.5 ? 0.55 + Math.random() * 0.45 : 0;
  if (st > 0.01) {
    const d = stImg.data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    stCtx.putImageData(stImg, 0, 0);
  }
  stCv.style.opacity = (st * 0.8).toFixed(3);
  if (AC) {
    aSet(staticG.gain, st * 0.32);
    aSet(droneG.gain, prox * 0.55 + fear * 0.3);
    aSet(rainLP.frequency, P.inside ? 700 : 5200, 0.3);
    aSet(rainG.gain, endKind === 'bell' ? 0 : P.inside ? 0.11 : 0.16, endKind === 'bell' ? 1.5 : 0.3);
  }
  let li = state === 'title' || endKind ? 0 : 0.88 + 0.12 * vnoise(time * 9, 3.3);
  if (prox > 0.35 && Math.random() < prox * 0.12) li *= 0.25;
  U.uLanternI.value = li;
  MAT.glow.uniforms.uEmit.value = 0.4 + li * 0.7;
  if (fear > 0.35 && state === 'play') { hbT -= dt; if (hbT <= 0) { heartbeat(fear); hbT = 1.1 - fear * 0.6; } }
}

// ---------- death, endings, flow ----------
function caught() {
  if (state !== 'play') return;
  setState('dead'); deadT = 0; scream();
  $('#intro').classList.remove('on'); $('#msg').classList.remove('on');
  if (document.exitPointerLock) document.exitPointerLock();
  M.x = P.x - Math.sin(P.yaw) * 1.2; M.z = P.z - Math.cos(P.yaw) * 1.2;
  M.group.visible = true;
}
function updateDead(dt) {
  deadT += dt;
  P.pitch = lerp(P.pitch, 0.72, Math.min(1, dt * 10));
  camera.rotation.set(P.pitch + (Math.random() - 0.5) * 0.05, P.yaw + (Math.random() - 0.5) * 0.05, 0);
  placeMonster(P.x - M.x, P.z - M.z, 1);
  if (deadT > 1.5 && $('#dead').hidden) {
    const n = found.size;
    $('#deadText').textContent = n ? `The ${n === 1 ? 'page' : n + ' pages'} you found stay found. He is still out there.` : 'He is still out there.';
    $('#dead').hidden = false;
  }
}
function retry() {
  $('#dead').hidden = true;
  Object.assign(P, { x: START.x, z: START.z, yaw: START.yaw, pitch: 0, stam: 1, tired: false });
  fear = 0; M.seen = false; M.grace = 6; M.tp = 8;
  if (M.active) teleportMonster(found.size, 30); else M.group.visible = false;
  setState('play');
  if (!isTouch) canvas.requestPointerLock();
}
const ENDINGS = {
  escape: 'You ran. The coach road was longer than you remembered, and the storm followed you all the way to the bridge.\n\nBehind you, the bell of Hollowmere began to ring, though there was no one left to ring it.\n\nAshford never sent anyone else. And some nights, at the edge of the trees outside your window, something tall stands very still.',
  bell: 'You pulled the rope. The bell spoke once, low and enormous, and the rain stopped.\n\nOut in the forest, one by one, lanterns were lit. Dozens of them, waiting among the trees. You recognised none of the faces. Every one of them recognised you.\n\nYou took up your lantern and went to join them.\n\nHollowmere was found empty in the spring.',
};
function ending(kind) {
  if (endKind) return;
  endKind = kind; setState('ending');
  if (document.exitPointerLock) document.exitPointerLock();
  const fade = $('#fade');
  if (kind === 'bell') {
    bellToll(0); bellToll(2.8); bellToll(5.6);
    M.group.visible = false;
    fade.classList.add('white'); fade.style.opacity = 0.9;
    setTimeout(() => { fade.classList.remove('white'); fade.style.opacity = 0; }, 160);
    setTimeout(() => { fade.style.opacity = 1; }, 2600);
  } else {
    thunder(0.1, true);
    fade.style.opacity = 1;
  }
  setTimeout(() => {
    $('#ending').hidden = false;
    const p = $('#endtext');
    p.textContent = ENDINGS[kind];
    const em = document.createElement('em'); em.textContent = `${found.size} of 8 pages · ${kind === 'bell' ? 'The Bell' : 'The Coach Road'} ending`;
    p.appendChild(em);
    requestAnimationFrame(() => p.classList.add('on'));
    setTimeout(() => { $('#again').hidden = false; }, 3000);
  }, kind === 'bell' ? 6000 : 3200);
}
function pause() { if (state === 'play') { setState('paused'); $('#pause').hidden = false; } }
function resume() { $('#pause').hidden = true; setState('play'); if (!isTouch) canvas.requestPointerLock(); }

function start() {
  audioInit();
  $('#title').hidden = true;
  setState('play');
  U.uAmbient.value.setRGB(0.10, 0.11, 0.16);
  hand.visible = true;
  if (!isTouch) canvas.requestPointerLock();
  LT.next = 6;
  const intro = $('#intro');
  intro.innerHTML = 'October, 1888.<br>Hollowmere has not answered a letter in six weeks.<br>The coachman would go no further than the bridge.';
  intro.classList.add('on');
  setTimeout(() => intro.classList.remove('on'), 8000);
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (state === 'title' && (e.code === 'Enter' || e.code === 'Space')) { start(); return; }
  if (e.code === 'KeyE' || e.code === 'Enter') interact();
  if (e.code === 'Escape' && state === 'note') closeNote();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('mousemove', (e) => {
  if (locked) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
  else if (state === 'play' && (e.buttons & 1)) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
});
canvas.addEventListener('mousedown', () => { if (state === 'play' && !locked && !isTouch) canvas.requestPointerLock(); });
$('#note').addEventListener('mousedown', () => { if (!isTouch) closeNote(); });
$('#pause').addEventListener('mousedown', resume);
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && state === 'play') pause();
});
$('#start').addEventListener('click', start);
$('#retry').addEventListener('click', retry);
$('#again').addEventListener('click', () => location.reload());

if (isTouch) {
  const joy = $('#joy');
  document.addEventListener('touchstart', (e) => {
    if (state === 'note') { closeNote(); e.preventDefault(); return; }
    if (state === 'paused') { resume(); return; }
    if (state !== 'play') return;
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest('button')) continue;
      if (t.clientX < innerWidth * 0.45 && TJ.id === null) {
        TJ.id = t.identifier; TJ.x0 = TJ.x = t.clientX; TJ.y0 = TJ.y = t.clientY;
        joy.style.display = 'block'; joy.style.left = t.clientX + 'px'; joy.style.top = t.clientY + 'px';
      } else if (TL.id === null) { TL.id = t.identifier; TL.x = t.clientX; TL.y = t.clientY; }
    }
    if (!(e.target.closest && e.target.closest('button'))) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === TJ.id) {
        TJ.x = t.clientX; TJ.y = t.clientY;
        const dx = clamp(TJ.x - TJ.x0, -40, 40), dy = clamp(TJ.y - TJ.y0, -40, 40);
        joy.firstChild.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (t.identifier === TL.id) {
        mouse.dx += (t.clientX - TL.x) * 1.5; mouse.dy += (t.clientY - TL.y) * 1.5;
        TL.x = t.clientX; TL.y = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === TJ.id) { TJ.id = null; joy.style.display = 'none'; joy.firstChild.style.transform = ''; }
      if (t.identifier === TL.id) TL.id = null;
    }
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
  $('#tRead').addEventListener('pointerdown', (e) => { e.preventDefault(); interact(); });
  $('#tRun').addEventListener('pointerdown', (e) => { e.preventDefault(); touchRun = !touchRun; $('#tRun').classList.toggle('on', touchRun); });
}

// ---------- loop ----------
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state !== 'paused') {
    time += dt;
    skyMat.uniforms.uTime.value = time;
    if (state === 'title') {
      U.uAmbient.value.setRGB(0.24, 0.26, 0.34);
      const a = time * 0.035 + 0.6;
      camera.position.set(Math.sin(a) * 17, 4.5, Math.cos(a) * 17);
      camera.lookAt(0, 2.5, 0);
      hand.visible = false;
    } else if (state === 'play') {
      updatePlayer(dt);
      if (state === 'play') { updateMonster(dt); updateInteract(); }
    } else if (state === 'dead') updateDead(dt);
    updateLightning(dt);
    updateRain(dt);
    updateFX(dt);
  }
  hand.position.copy(camera.position);
  hand.quaternion.copy(camera.quaternion);
  sky.position.copy(camera.position);
  const fc = U.uFogColor.value, fl = U.uFlash.value;
  renderer.setClearColor(new THREE.Color(fc.r + 0.3 * fl, fc.g + 0.33 * fl, fc.b + 0.42 * fl));
  renderer.clear();
  renderer.render(scene, camera);
  if (hand.visible && state !== 'dead') { renderer.clearDepth(); renderer.render(handScene, camera); }
}
setState('title');
requestAnimationFrame(frame);

// Test hook: open the page with #debug to drive the game from the console.
if (location.hash === '#debug') window.HM = { P, M, U, LT, inter, found, boxes, circles, pointBlocked, inBounds, start, openNote, closeNote, strike, teleportMonster, caught, ending, get state() { return state; }, get fear() { return fear; } };
