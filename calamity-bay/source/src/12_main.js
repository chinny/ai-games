// Calamity Bay — game flow, third-person camera, emergence intros, input and the main loop

let state = 'title', clock = 0, last = performance.now(), locked = false, selected = 'sea';
let playT = 0, won = false, winT = 0, endT = 0, introT = 0, touchRun = false, fpsAcc = 0, fpsN = 0;
const CAM = { yaw: Math.PI, pitch: 0.22, distT: 1, dist: 1, pos: new V3(0, 200, 600), tgt: new V3(), init: false };
function setState(s) { state = s; document.body.dataset.state = s; }
if (isTouch) document.body.classList.add('touch');

// ---------- world setup ----------
genCity();
buildTerrain();
buildWater();
buildCityGround();
buildTrees();
finishTrees();
initPools();
initTraffic();
initMilitary();
buildCards();
resize();
addEventListener('resize', resize);
setState('title');
function onBuildingHit(b) { spawnPanic(b); }
function onBuildingDown(b) {
  if (b.name) say(`${b.name.toUpperCase()} IS DOWN`, 2.6, 'mil');
}

// ---------- starting a rampage ----------
function startGame() {
  audioInit();
  $('#title').hidden = true;
  createMonster(selected);
  setKeysHelp();
  playT = 0; won = false; introT = 0;
  MIL.t = 0;
  MON.roared = MON.burst = MON.rumbled = false;
  const d = MON.def;
  if (d.id === 'sea') {
    MON.x = 0; MON.z = 860; MON.yaw = Math.PI; MON.y = terrainH(0, 860);
    CAM.pos.set(-70, 26, 470);
  } else {
    MON.x = 0; MON.z = -650; MON.yaw = 0; MON.surf = terrainH(0, -650); MON.y = MON.surf - 48;
    CAM.pos.set(120, MON.surf + 30, -470);
    MON.rig.root.visible = false;
  }
  placeRig();
  setState('intro');
  if (!isTouch) canvas.requestPointerLock();
}
function updateIntro(dt) {
  introT += dt;
  AIM.yaw = MON.yaw; AIM.pitch = 0;
  const d = MON.def;
  const t = introT;
  if (d.id === 'sea') {
    // wade in from the deep, head breaking the surface, then come ashore
    const done = MON.z <= 560;
    updateMonster(dt, done ? null : { f: 0, s: 0, auto: { x: 0, z: -1 }, autoSpeed: 24 });
    if (t > 0.5 && t < 6 && Math.random() < dt * 8) splashAt(MON.x + frand(-14, 14), MON.z + frand(-14, 14), 3);
    if (t > 0.3 && t < 1.4 && Math.random() < dt * 20) emit(smokePS, MON.x + frand(-20, 20), WATER_Y + 0.5, MON.z + frand(-20, 20), 0, 2, 0, 6, 4, 2, 0.9, 0.95, 1, 0.6, 0.5, 0);
    if (!MON.roared && MON.y + d.H > WATER_Y + 18) { MON.roared = true; startAct('roar'); }
    _v1.set(MON.x, MON.y + d.H * 0.7, MON.z);
    const k = smooth(5, 11, t);
    const cx = lerp(-70, MON.x + 60, k), cy = lerp(26, MON.y + d.H * 1.1, k), cz = lerp(470, MON.z - 120, k);
    CAM.pos.lerp(_v2.set(cx, cy, cz), 1 - Math.exp(-dt * 3));
    camera.position.copy(CAM.pos);
    camera.lookAt(_v1);
    if (done && t > 6 && !MON.act) endIntro();
  } else {
    const R = MON.rig;
    if (t < 2.6) {
      addShake(dt * 0.9);
      if (Math.random() < dt * 9) {
        const a = Math.random() * TAU, r = rr(10, 45);
        const x = MON.x + Math.cos(a) * r, z = MON.z + Math.sin(a) * r;
        groundDust(x, z, 8, 3);
        if (Math.random() < 0.4) spawnRock(x, terrainH(x, z) + 3, z, rr(1.5, 3), frand(-3, 3), rr(2, 8), frand(2, 8));
      }
      if (t > 1 && !MON.rumbled) { MON.rumbled = true; stompSound(_v3.set(MON.x, MON.surf, MON.z), 1.6); tone({ f0: 40, f1: 22, dur: 3, gain: 0.7, attack: 1 }); }
    } else if (!MON.burst) {
      MON.burst = true;
      R.root.visible = true;
      boom(_v3.set(MON.x, MON.surf, MON.z), 1.6);
      addShake(1.3);
      crushTrees(MON.x, MON.z, 40, _v4.set(0, 0, 0));
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * TAU, r = rr(0, 18);
        spawnRock(MON.x + Math.cos(a) * r, MON.surf + rr(0, 8), MON.z + Math.sin(a) * r, rr(1.6, 4.5), Math.cos(a) * rr(6, 22), rr(14, 38), Math.sin(a) * rr(6, 22));
      }
      for (let i = 0; i < 12; i++) addEmitter({ kind: 'lava', x: MON.x + frand(-16, 16), y: MON.surf, z: MON.z + frand(-16, 16), life: rr(6, 12) });
      groundDust(MON.x, MON.z, 40, 60);
      for (let i = 0; i < 20; i++) smokePuff(MON.x + frand(-20, 20), MON.surf + frand(0, 20), MON.z + frand(-20, 20), rr(10, 18), 0.35);
    }
    if (t >= 2.6) {
      const k = clamp((t - 2.6) / 2.2, 0, 1);
      if (k < 1) {
        MON.y = lerp(MON.surf - 48, terrainH(MON.x, MON.z), ease(k));
        for (const j of R.joints) { j.rotation.copy(j.userData.r0); j.position.copy(j.userData.p0); }
        R.arms.forEach((a) => { a.sh.rotation.x -= 2.6 * (1 - k); a.el.rotation.x += 0.5; });
        R.torso.rotation.x -= 0.3 * (1 - k);
        if (Math.random() < 0.6) groundDust(MON.x + frand(-10, 10), MON.z + frand(-10, 10), 10, 2);
        placeRig();
      } else {
        if (!MON.roared) { MON.roared = true; startAct('roar'); }
        const walk = t > 6.8;
        updateMonster(dt, walk ? { f: 0, s: 0, auto: { x: 0, z: 1 } } : { f: 0, s: 0 });
      }
    }
    _v1.set(MON.x, MON.surf + 20, MON.z);
    const k = smooth(6.5, 10.5, t);
    if (MON.burst) _v1.y = MON.y + d.H * 0.75;
    const cx = lerp(120, MON.x - 40, k), cy = lerp(MON.surf + 30, MON.y + d.H * 1.15, k), cz = lerp(-470, MON.z - 110, k);
    CAM.pos.lerp(_v2.set(cx, cy, cz), 1 - Math.exp(-dt * 3));
    camera.position.copy(CAM.pos);
    applyShake(dt);
    camera.lookAt(_v1);
    if (t > 11) endIntro();
  }
  placeSun(MON.x, MON.z);
}
function skipIntro() {
  if (state !== 'intro' || introT < 0.8) return;
  const d = MON.def;
  MON.act = null;
  if (d.id === 'sea') { MON.z = 560; }
  else {
    if (!MON.burst) { introT = 2.6; return; }
    MON.z = Math.max(MON.z, -600);
  }
  MON.rig.root.visible = true;
  MON.y = terrainH(MON.x, MON.z);
  endIntro();
}
function endIntro() {
  if (state !== 'intro') return;
  setState('play');
  MON.ctl = true;
  CAM.yaw = MON.yaw; CAM.pitch = 0.22; CAM.init = false;
  mouse.dx = mouse.dy = 0;
  say(MON.def.id === 'sea' ? 'TIDEMAW HAS COME ASHORE' : 'OROGEN HAS AWAKENED', 3);
  setTimeout(() => showHint(`Destroy ${GOAL * 100}% of Calamity Bay`, 5), 2600);
}

function finish(win) {
  setState('end');
  if (document.exitPointerLock) document.exitPointerLock();
  showEnd(win);
}

// ---------- camera ----------
function applyShake(dt) {
  if (shake > 0.001) {
    const s = shake * shake * 2.2;
    camera.position.x += frand(-s, s); camera.position.y += frand(-s, s); camera.position.z += frand(-s, s);
    shake = Math.max(0, shake - dt * 2.2);
  }
}
function updateCamera(dt) {
  const H = MON.def.H;
  CAM.yaw -= mouse.dx * 0.0024;
  CAM.pitch = clamp(CAM.pitch + mouse.dy * 0.002, -0.3, 1.2);
  mouse.dx = mouse.dy = 0;
  if (mouse.wheel) { CAM.distT = clamp(CAM.distT * (1 + mouse.wheel * 0.0012), 0.55, 2.2); mouse.wheel = 0; }
  const cy = Math.cos(CAM.pitch), sy = Math.sin(CAM.pitch);
  const dir = _v1.set(Math.sin(CAM.yaw) * cy, -sy, Math.cos(CAM.yaw) * cy);
  const right = _v2.set(-Math.cos(CAM.yaw), 0, Math.sin(CAM.yaw));
  const tgt = _v3.set(MON.x, MON.y + H * 0.9, MON.z).addScaledVector(right, H * 0.42 * clamp(CAM.distT, 0.7, 1.2));
  let dist = H * 2.3 * CAM.distT;
  // keep the camera out of buildings
  const hit = raycastCity(tgt.x, tgt.y, tgt.z, -dir.x, -dir.y, -dir.z, dist, 3);
  if (hit) dist = Math.max(H * 0.45, hit.t - 4);
  CAM.dist = dist < CAM.dist ? dist : lerp(CAM.dist, dist, 1 - Math.exp(-dt * 2));
  const want = _v4.copy(tgt).addScaledVector(dir, -CAM.dist);
  want.y = Math.max(want.y, Math.max(terrainH(want.x, want.z), WATER_Y) + 4);
  if (!CAM.init) { CAM.dist = dist; want.copy(tgt).addScaledVector(dir, -dist); CAM.pos.copy(want); CAM.tgt.copy(tgt); CAM.init = true; }
  CAM.pos.lerp(want, 1 - Math.exp(-dt * 14));
  CAM.tgt.lerp(tgt, 1 - Math.exp(-dt * 14));
  camera.position.copy(CAM.pos);
  camera.lookAt(CAM.tgt);
  // aim: the point under the crosshair, past the monster
  camera.getWorldDirection(AIM.d);
  AIM.o.copy(camera.position);
  AIM.yaw = CAM.yaw;
  AIM.pitch = Math.asin(clamp(AIM.d.y, -1, 1));
  const t0 = CAM.dist + MON.def.rad;
  const ah = raycastCity(AIM.o.x + AIM.d.x * t0, AIM.o.y + AIM.d.y * t0, AIM.o.z + AIM.d.z * t0, AIM.d.x, AIM.d.y, AIM.d.z, 650, 3);
  if (ah) AIM.p.set(ah.x, ah.y, ah.z); else AIM.p.copy(AIM.o).addScaledVector(AIM.d, 650);
  applyShake(dt);
  placeSun(MON.x + Math.sin(CAM.yaw) * 70, MON.z + Math.cos(CAM.yaw) * 70);
}
function titleCamera(dt) {
  const a = clock * 0.03 + 2.2;
  camera.position.set(Math.sin(a) * 560, 170 + Math.sin(clock * 0.07) * 30, Math.cos(a) * 560);
  camera.lookAt(0, 40, 0);
  placeSun(0, 0);
}

// ---------- actions ----------
const COMBO = new Set(['swipe', 'punch']);
function nextCombo() {
  const sea = MON.def.id === 'sea', step = MON.combo % 3;
  if (step < 2) startAct(sea ? 'swipe' : 'punch', step === 0 ? 1 : -1);
  else startAct(sea ? 'stompSlam' : 'smash');
  MON.combo++; MON.comboT = 1.2;
}
function primary() {
  if (state !== 'play' || MON.dead || MON.air) return;
  if (MON.beamOn) return;
  if (MON.held) { if (!MON.act) startAct('throw'); return; }
  if (MON.act) { if (COMBO.has(MON.act.type) && MON.act.t > MON.act.dur * 0.4) MON.queue = nextCombo; return; }
  nextCombo();
}
function heavy() {
  if (state !== 'play' || MON.dead || MON.air || MON.act || MON.held || MON.cool.heavy > 0) return;
  startAct(MON.def.id === 'sea' ? 'tailSpin' : 'pound');
  MON.cool.heavy = 1.8;
}
function grabThrow() {
  if (state !== 'play' || MON.dead || MON.air || MON.act) return;
  startAct(MON.held ? 'throw' : 'grab');
}
function special() {
  if (state !== 'play' || MON.dead || MON.air) return;
  if (MON.beamOn) { stopBeam(); return; }
  if (MON.rage < 100) { showHint('Rage builds as you destroy things', 2); return; }
  if (MON.held) return;
  startSpecial();
}
function roarAct() {
  if (state !== 'play' || MON.dead || MON.air || MON.act || MON.cool.roar > 0) return;
  startAct('roar'); MON.cool.roar = 9;
}
function pause() { if (state === 'play') { setState('paused'); $('#pause').hidden = false; } }
function resume() { if (state !== 'paused') return; $('#pause').hidden = true; setState('play'); if (!isTouch) canvas.requestPointerLock(); }

// ---------- input ----------
const TJ = { id: null, x0: 0, y0: 0, x: 0, y: 0 }, TL = { id: null, x: 0, y: 0 };
function readInput() {
  let f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1;
  if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyD || keys.ArrowRight) s += 1;
  if (keys.KeyA || keys.ArrowLeft) s -= 1;
  if (TJ.id !== null) { s += clamp((TJ.x - TJ.x0) / 50, -1, 1); f -= clamp((TJ.y - TJ.y0) / 50, -1, 1); }
  MON.run = !!(keys.ShiftLeft || keys.ShiftRight || touchRun);
  return { f, s };
}
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyM') setMuted(!muted);
  if (state === 'title' && e.code === 'Enter') { startGame(); return; }
  if (state === 'intro' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) { skipIntro(); return; }
  if (state !== 'play') return;
  if (e.code === 'KeyE') grabThrow();
  else if (e.code === 'KeyF') special();
  else if (e.code === 'Space') { roarAct(); e.preventDefault(); }
  else if (e.code === 'KeyQ') heavy();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('mousemove', (e) => {
  if (locked) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
  else if ((state === 'play' || state === 'intro') && (e.buttons & 1) && DEBUG) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
});
addEventListener('wheel', (e) => { if (state === 'play') mouse.wheel += e.deltaY; }, { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (isTouch) return;
  if (state === 'intro') { skipIntro(); return; }
  if (state !== 'play') return;
  if (!locked && !DEBUG) { canvas.requestPointerLock(); return; }
  if (e.button === 0) primary();
  else if (e.button === 2) heavy();
});
$('#pause').addEventListener('mousedown', resume);
$('#pause').addEventListener('touchstart', (e) => { resume(); e.preventDefault(); }, { passive: false });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && state === 'play' && !DEBUG) pause();
});
$('#start').addEventListener('click', startGame);
$('#cont').addEventListener('click', () => { $('#end').hidden = true; setState('play'); if (!isTouch) canvas.requestPointerLock(); });
$('#again').addEventListener('click', () => location.reload());

if (isTouch) {
  const joy = $('#joy');
  document.addEventListener('touchstart', (e) => {
    if (state === 'intro') { skipIntro(); return; }
    if (state !== 'play') return;
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest('button')) continue;
      if (t.clientX < innerWidth * 0.42 && TJ.id === null) {
        TJ.id = t.identifier; TJ.x0 = TJ.x = t.clientX; TJ.y0 = TJ.y = t.clientY;
        joy.style.display = 'block'; joy.style.left = t.clientX + 'px'; joy.style.top = t.clientY + 'px';
      } else if (TL.id === null) { TL.id = t.identifier; TL.x = t.clientX; TL.y = t.clientY; }
    }
    if (!(e.target.closest && e.target.closest('button,.card'))) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === TJ.id) {
        TJ.x = t.clientX; TJ.y = t.clientY;
        joy.firstChild.style.transform = `translate(${clamp(TJ.x - TJ.x0, -45, 45)}px, ${clamp(TJ.y - TJ.y0, -45, 45)}px)`;
      } else if (t.identifier === TL.id) {
        mouse.dx += (t.clientX - TL.x) * 1.6; mouse.dy += (t.clientY - TL.y) * 1.6;
        TL.x = t.clientX; TL.y = t.clientY;
      }
    }
    if (state === 'play') e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === TJ.id) { TJ.id = null; joy.style.display = 'none'; joy.firstChild.style.transform = ''; }
      if (t.identifier === TL.id) TL.id = null;
    }
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
  const btn = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
  btn('#tAtk', primary); btn('#tHvy', heavy); btn('#tGrab', grabThrow); btn('#tSp', special); btn('#tRoar', roarAct);
  btn('#tRun', () => { touchRun = !touchRun; $('#tRun').classList.toggle('on', touchRun); });
  btn('#tPause', pause);
}

// ---------- loop ----------
let crumbleT = 0;
const PT = { traffic: 0, phys: 0, struct: 0, fx: 0 };
function tick(dt) {
  clock += dt;
  impactBudget = Math.min(10, impactBudget + dt * 30);
  gunT -= dt;
  if (state === 'title') titleCamera(dt);
  else if (state === 'intro') updateIntro(dt);
  else if (state === 'play' || state === 'end') {
    if (state === 'play') { playT += dt; updateMonster(dt, readInput()); updateCamera(dt); }
    else { mouse.dx = mouse.dy = 0; updateMonster(dt, null); updateCamera(dt); }
    updateMilitary(dt);
    const pct = STATS.wGone / STATS.wTotal;
    if (!won && pct >= GOAL && state === 'play' && !MON.dead) { won = true; winT = 2.5; say('CALAMITY BAY HAS FALLEN', 3); }
    if (winT > 0 && state === 'play') { winT -= dt; if (winT <= 0) finish(true); }
    if (MON.dead && state === 'play') { endT += dt; if (endT > 4.5) finish(won); }
    updateHUD(dt);
    updateMusic(MIL.level);
  }
  let t0 = DEBUG ? performance.now() : 0;
  if (state !== 'title') rebuildAgents();
  updateCars(dt); updatePeople(dt);
  if (DEBUG) { PT.traffic += performance.now() - t0; t0 = performance.now(); }
  const sub = dt > 1 / 45 ? 2 : 1;
  for (let i = 0; i < sub; i++) stepBodies(dt / sub);
  if (DEBUG) { PT.phys += performance.now() - t0; t0 = performance.now(); }
  processDirty();
  if (DEBUG) { PT.struct += performance.now() - t0; t0 = performance.now(); }
  updateBuildingFires(dt);
  updateEmitters(dt);
  updatePS(smokePS, dt); updatePS(glowPS, dt);
  updateRings(dt);
  renderBodies();
  if (DEBUG) { PT.fx += performance.now() - t0; }
  crumbleT -= dt;
  if (frameCrumble > 0 && crumbleT <= 0) { crumbleSound(frameCrumble, MON.on ? _v3.set(MON.x, MON.y + 20, MON.z) : null); frameCrumble = 0; crumbleT = 0.12; }
  waterMat.uniforms.uTime.value = clock;
  skyMat.uniforms.uTime.value = clock;
  waterMat.uniforms.uCam.value.copy(camera.position);
  if (AC) aSet(loops.city.g.gain, state === 'title' ? 0.02 : 0.05, 0.5);
}
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, rawDt);
  last = now;
  fpsAcc += rawDt; fpsN++;
  if (fpsAcc > 0.5) { if (DEBUG) { $('#fps').hidden = false; $('#fps').textContent = Math.round(fpsN / fpsAcc) + ' fps · ' + bodies.length + ' bodies · ' + physAwake + ' awake'; } fpsAcc = 0; fpsN = 0; }
  if (state !== 'paused') tick(dt);
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Test hook: open the page with #debug to drive the game from the console.
if (DEBUG) window.CB = {
  MON, STATS, BLD, BLK_, bodies, UNITS, CARS, PPL, MIL, AIM, CAM, camera, scene, renderer, startGame, skipIntro, hitSphere, shockwave,
  selectMonster, primary, heavy, grabThrow, special, roarAct, keys, mouse, startAct, damageBlock, staticAt, terrainH, spawnJets, spawnHeli, spawnGround,
  audioOff() { AC = null; }, PT, get awake() { return physAwake; }, tryGrab, AG, agentsNear, blocksInSphere, handPos, LOTS, THROWN, PROJ,
  sim(sec, dt = 1 / 30) { const t0 = performance.now(); for (let t = 0; t < sec; t += dt) tick(dt); return performance.now() - t0; }, get state() { return state; }, set state(s) { setState(s); }, get pct() { return STATS.wGone / STATS.wTotal; },
};
