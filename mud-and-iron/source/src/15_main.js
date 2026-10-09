// Mud & Iron — RTS camera, simulation loop, title-screen battle and debug hook

const CAM = { x: 160, z: 200, yaw: Math.PI, pitch: 0.95, dist: 95, tdist: 95, mdrag: null, gy: 3 };
let lastT = performance.now(), fpsAcc = 0, fpsN = 0, hoverT = 0;

// Move the view by a screen-space delta (px right, py down).
function panBy(px, py) {
  const s = CAM.dist / VH * 1.4;
  const fx = Math.sin(CAM.yaw), fz = Math.cos(CAM.yaw);
  CAM.x += (-fz * px - fx * py) * s;
  CAM.z += (fx * px - fz * py) * s;
}
function updateCamera(dt, free) {
  if (free) {
    let mx = 0, mz = 0;
    if (keys.KeyW || keys.ArrowUp) mz += 1;
    if (keys.KeyS || keys.ArrowDown) mz -= 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (UI.inView && !UI.drag && document.hasFocus()) {
      const m = 6;
      if (UI.mx <= m) mx -= 1; else if (UI.mx >= VW - m) mx += 1;
      if (UI.my <= m) mz += 1; else if (UI.my >= VH - m) mz -= 1;
    }
    if (keys.KeyQ) CAM.yaw -= dt * 1.6;
    if (keys.KeyE) CAM.yaw += dt * 1.6;
    const sp = CAM.dist * 1.15 * dt * (keys.ShiftLeft || keys.ShiftRight ? 2 : 1);
    const fx = Math.sin(CAM.yaw), fz = Math.cos(CAM.yaw);
    // forward = (fx, fz); right = (-fz, fx) when looking along forward with y up
    CAM.x += (fx * mz - fz * mx) * sp;
    CAM.z += (fz * mz + fx * mx) * sp;
    if (CAM.mdrag) {
      const { dx, dy, rot } = CAM.mdrag;
      if (rot) { CAM.yaw += dx * 0.006; }
      else {
        const s = CAM.dist / VH * 1.5;
        CAM.x += (fz * dx + fx * dy) * s;
        CAM.z += (-fx * dx + fz * dy) * s;
      }
      CAM.mdrag.dx = CAM.mdrag.dy = 0;
    }
  }
  CAM.x = clamp(CAM.x, 0, MAP.W); CAM.z = clamp(CAM.z, 0, MAP.H);
  CAM.dist += (CAM.tdist - CAM.dist) * (1 - Math.exp(-dt * 8));
  const p = lerp(0.7, 1.02, smooth(26, 170, CAM.dist));
  CAM.pitch = p;
  CAM.gy += (groundH(CAM.x, CAM.z) - CAM.gy) * (1 - Math.exp(-dt * 4));
  const cp = Math.cos(p), sp2 = Math.sin(p);
  camera.position.set(CAM.x - Math.sin(CAM.yaw) * cp * CAM.dist, CAM.gy + sp2 * CAM.dist, CAM.z - Math.cos(CAM.yaw) * cp * CAM.dist);
  if (shake > 0.001) {
    const s = shake * shake * 1.6;
    camera.position.x += frand(-s, s); camera.position.y += frand(-s, s); camera.position.z += frand(-s, s);
    shake = Math.max(0, shake - dt * 2.5);
  }
  camera.lookAt(CAM.x, CAM.gy, CAM.z);
  placeSun(CAM.x, CAM.z);
}

// ---------- simulation ----------
function sim(dt) {
  GAME.t += dt;
  updateEntities(dt);
  updateShells(dt);
  updateGas(dt);
  updatePlanes(dt);
  updateCreeps(dt);
  updateAI(dt);
  updateMode(dt);
  runTimers();
  updateFOW(dt);
  flushMap(false);
}
function frameFX(dt) {
  updateEmitters(dt);
  for (const s of PS) updatePS(s, dt);
  updateTracers(dt);
  updateRain(dt, CAM.x, CAM.gy + CAM.dist * 0.4, CAM.z, WEATHER.rain);
  skyMat.uniforms.uTime.value += dt;
  sky.position.copy(camera.position);
  let eng = 0;
  for (const e of ENTS) if (!e.dead && e.kind === 'veh' && e.vis) { const d = Math.hypot(e.x - CAM.x, e.z - CAM.z); if (d < 120) eng += (e.moving ? 1 : 0.4) * (1 - d / 120); }
  if (SFXBUS) SFXBUS.gain.value = GAME.state === 'title' ? 0.3 : 1;
  updateAudio(dt, eng, WEATHER.rain, GAME.state === 'play' || GAME.state === 'title');
}

// ---------- title screen: a live battle in the background ----------
let titleT = 0;
function startTitleScene() {
  startMatch({ mode: 'skirmish', nation: fpick(['gb', 'fr']), enemy: fpick(['de', 'ah']), size: 's', diff: 'hard', weather: 'overcast', fog: false, seed: 1917 + Math.floor(Math.random() * 50) });
  GAME.state = 'title';
  TEAMS[0].ai = true;
  initAI(0, 'hard');
  for (const t of [0, 1]) {
    TEAMS[t].supply = 1500;
    AIS[t].nextAttack = 20;
    const face = t === 0 ? Math.PI : 0, z = t === 0 ? MAP.H * 0.64 : MAP.H * 0.36;
    spawnGroup(t, ['rifle', 'rifle', 'mg', 'rifle', 'mortar', NATIONS[TEAMS[t].nation].tank], MAP.W / 2, z, 18, face);
  }
  titleT = 0;
  document.body.dataset.state = 'title';
}
function titleCamera(dt) {
  titleT += dt;
  const a = titleT * 0.035 + 0.6;
  CAM.x = MAP.W / 2 + Math.sin(titleT * 0.05) * 20; CAM.z = MAP.H / 2 + Math.cos(titleT * 0.04) * 16;
  CAM.yaw = a; CAM.tdist = 120;
  updateCamera(dt, false);
}

// ---------- loop ----------
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const rdt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  if (GAME.state === 'play') {
    let t = rdt * GAME.speed;
    while (t > 0) { const s = Math.min(0.05, t); sim(s); t -= s; }
    updateCamera(rdt, true);
    hoverT -= rdt;
    if (hoverT <= 0) { hoverT = 0.08; UI.hover = UI.inView && !UI.drag ? pickEnt(UI.mx, UI.my) : null; canvas.style.cursor = UI.mode ? 'crosshair' : UI.hover && UI.hover.team !== 0 && SEL.some((e) => e.team === 0 && e.kind !== 'bld') ? 'crosshair' : 'default'; }
    frameFX(rdt);
    syncRender();
    updateHUD(rdt);
    drawMinimap(rdt);
  } else if (GAME.state === 'title') {
    sim(rdt);
    titleCamera(rdt);
    frameFX(rdt);
    syncRender();
    if (GAME.over || titleT > 420) startTitleScene();
  } else {
    updateCamera(rdt, false);
    syncRender();
  }
  drawOverlay(rdt);
  renderer.render(scene, camera);
  fpsAcc += rdt; fpsN++;
  if (fpsAcc > 1) { if (DEBUG) $('#fps').textContent = Math.round(fpsN / fpsAcc) + ' fps · ' + renderer.info.render.calls + ' calls'; fpsAcc = 0; fpsN = 0; }
}

// ---------- boot ----------
resize();
addEventListener('resize', resize);
bindMenus();
bindInput();
startTitleScene();
showScreen('title');
requestAnimationFrame(frame);

if (DEBUG) {
  window.MI = {
    GAME, TEAMS, MAP, UI, SEL, CAM, AIS, WEATHER, FOW,
    get ENTS() { return ENTS; },
    sim(sec, step = 0.05) { for (let t = 0; t < sec; t += step) sim(step); syncRender(); },
    start(cfg) { launch(Object.assign({ mode: 'skirmish', nation: 'gb', enemy: 'de', size: 'm', diff: 'normal', weather: 'clear', fog: true, seed: 1234 }, cfg)); },
    initAI, acquire, visibleTo, VIS, coverAt, terrainH, groundH, pickEnt, rightClick, boxSelect,
    spawnUnit, spawnBuilding, giveOrder, orderMove, useAbility, usePower, setMode, selectOnly, endMatch, startTitleScene, findPath, lineCells, orderLine, orderBuild, canPlace,
    units: (team) => ENTS.filter((e) => !e.dead && (team === undefined || e.team === team)),
    render() { syncRender(); renderer.render(scene, camera); },
  };
}
