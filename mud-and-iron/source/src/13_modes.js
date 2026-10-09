// Mud & Iron — match setup and rules: Skirmish, Frontline, Survival and the campaign; sector capture,
// income, population, weather and victory.

const GAME = { timers: [], state: 'title', t: 0, speed: 1, cfg: null, M: null, over: false, result: null, objectives: [], freePowers: null, endT: 0, hint: '' };
const SIZES = { s: 240, m: 320, l: 400 };


// ---------- matches ----------
function startMatch(cfg) {
  clearEntities(); clearCombat(); clearFX(); clearMap();
  AIS.length = 0;
  for (const k of Object.keys(UI.groups)) delete UI.groups[k];
  GAME.timers = [];
  GAME.cfg = cfg; GAME.t = 0; GAME.over = false; GAME.result = null; GAME.objectives = []; GAME.freePowers = [{}, {}]; GAME.endT = 0; GAME.hint = '';
  GAME.speed = 1; GAME.cheatFast = false;
  TEAMS.length = 0;
  TEAMS.push(makeTeam(0, cfg.nation, false), makeTeam(1, cfg.enemy, true));
  const M = cfg.mode === 'campaign' ? MISSIONS[cfg.mission] : MODES[cfg.mode];
  GAME.M = M;
  seedRand(cfg.seed);
  const L = M.layout(cfg);
  L.seed = cfg.seed;
  genMap(L);
  initFOW();
  FOW.on = cfg.fog !== false;
  setupMenMeshes([cfg.nation, cfg.enemy]);
  const wa = rand() * TAU;
  WIND.x = Math.cos(wa) * 1.3; WIND.z = Math.sin(wa) * 1.3;
  initWeather(cfg.weather || 'clear');
  M.setup(cfg);
  for (const p of MAP.points) setPointLook(p);
  const h = TEAMS[0].hq || MAP.bases[0];
  CAM.x = h.x; CAM.z = h.z - 30; CAM.yaw = Math.PI; CAM.dist = CAM.tdist = 95; CAM.pitch = 0.95;
  GAME.state = 'play';
  updateFOW(1);
  for (let i = 0; i < FOGV.length; i++) FOGV[i] = fogTarget(i);
  uploadFog();
}

function spawnHQ(team, x, z) { return spawnBuilding('hq', team, x, z, team === 0 ? Math.PI : 0, 1); }
function spawnGroup(team, list, x, z, spread = 10, face) {
  const out = [];
  list.forEach((type, i) => {
    const a = (i / Math.max(1, list.length)) * TAU, r = list.length > 1 ? spread * (0.4 + (i % 3) * 0.3) : 0;
    const u = spawnUnit(type, team, x + Math.cos(a) * r, z + Math.sin(a) * r, face);
    if (face !== undefined) u.face = face;
    out.push(u);
  });
  return out;
}
// Put squads into the trench cells nearest a point, facing the enemy.
function garrison(team, types, x, z, face) {
  const out = [];
  for (const type of types) {
    let best = -1, bd = 1e18;
    for (let c = 0; c < MAP.cw * MAP.ch; c++) {
      if (!(MAP.flags[c] & F.TRENCH) || MAP.occ[c] === -999) continue;
      const d = dist2(cellX(c), cellZ(c), x, z);
      if (d < bd) { bd = d; best = c; }
    }
    let px = x, pz = z;
    if (best >= 0 && bd < 40 * 40) { px = cellX(best); pz = cellZ(best); MAP.occ[best] = -999; for (const [dx, dz] of NBR8) { const n = best + dx + dz * MAP.cw; if (n >= 0 && n < MAP.occ.length && MAP.occ[n] === 0) MAP.occ[n] = -999; } }
    const u = spawnUnit(type, team, px, pz, face);
    u.face = face; u.ang = face; u.holdPos = true;
    for (const m of u.men) { m.ang = face; }
    out.push(u);
  }
  for (let c = 0; c < MAP.occ.length; c++) if (MAP.occ[c] === -999) MAP.occ[c] = 0;
  return out;
}

// Run fn after a delay in game time (respects pause and game speed; cleared on a new match).
function later(sec, fn) { GAME.timers.push({ t: GAME.t + sec, fn }); }
function runTimers() {
  if (!GAME.timers.length) return;
  const due = GAME.timers.filter((x) => x.t <= GAME.t);
  if (!due.length) return;
  GAME.timers = GAME.timers.filter((x) => x.t > GAME.t);
  for (const x of due) x.fn();
}
function canCapture(team, p) {
  const M = GAME.M;
  if (M && M.canCapture) return M.canCapture(team, p);
  return true;
}
function updatePoints(dt) {
  for (const p of MAP.points) {
    const n = [0, 0];
    for (const e of ENTS) {
      if (e.dead || e.kind !== 'squad' || e.retreat || e.broken || e.def.crew === 'fgun' || e.def.crew === 'skoda') continue;
      if (dist2(e.x, e.z, p.x, p.z) < (p.r + 1) ** 2) n[e.team]++;
    }
    p.contested = n[0] > 0 && n[1] > 0;
    p.capturing = -1;
    if (p.contested) continue;
    const t = n[0] ? 0 : n[1] ? 1 : -1;
    if (t >= 0 && canCapture(t, p)) {
      const rate = 0.1 * Math.min(n[t], 2) * (GAME.cheatFast ? 5 : 1);
      p.capturing = t;
      if (p.capT === t) {
        if (p.prog < 1) {
          p.prog = Math.min(1, p.prog + rate * dt);
          if (p.prog >= 1 && p.owner !== t) {
            p.owner = t; TEAMS[t].stats.captured++;
            setPointLook(p);
            if (t === 0) { alertMsg(`Sector captured: ${p.name}`, 'good', p); sfx('bugle'); }
            else if (p.lostBy0) { alertMsg(`Sector lost: ${p.name}`, 'bad', p); sfx('lost'); }
            else if (visibleTo(0, p.x, p.z)) alertMsg(`The enemy has taken ${p.name}`, '', p);
            p.lostBy0 = false;
          }
        }
      } else {
        p.prog = Math.max(0, p.prog - rate * dt);
        if (p.prog <= 0) {
          if (p.owner >= 0) { const was = p.owner; p.owner = -1; setPointLook(p); if (was === 0) { p.lostBy0 = true; alertMsg(`${p.name} is being taken!`, 'bad', p); } }
          p.capT = t;
        }
      }
    } else if (t < 0) {
      // nobody there: partial progress drifts back to the owner
      if (p.owner >= 0) { if (p.capT !== p.owner) { p.prog = Math.max(0, p.prog - dt * 0.05); if (p.prog <= 0) { p.capT = p.owner; } } else p.prog = Math.min(1, p.prog + dt * 0.05); }
      else p.prog = Math.max(0, p.prog - dt * 0.03);
    }
    const pm = p.mesh.userData.prog;
    if (pm) {
      pm.geometry.setDrawRange(0, Math.round(p.prog * RING_SEG) * 6);
      pm.material.color.set(p.capT >= 0 ? TEAMCOL[p.capT] : '#ffffff');
      pm.visible = p.prog > 0.01 && p.prog < 0.999 || p.contested;
    }
  }
}

function updateEconomy(dt) {
  for (const T of TEAMS) {
    let inc = 0, cap = 0, pop = 0;
    for (const e of ENTS) {
      if (e.dead || e.team !== T.id) continue;
      if (e.kind === 'bld') { if (e.built >= 1) { inc += e.def.income || 0; cap += e.def.pop || 0; } }
      else pop += e.def.pop;
    }
    for (const p of MAP.points) if (p.owner === T.id) inc += p.value;
    if (GAME.M && GAME.M.income) inc += GAME.M.income(T.id);
    T.income = inc * T.incomeMult;
    T.supply += T.income * dt;
    T.pop = pop; T.popCap = Math.min(100, cap + (GAME.M && GAME.M.popBonus ? GAME.M.popBonus(T.id) : 0));
  }
}

// ---------- weather ----------
function initWeather(mode) {
  WEATHER.mode = mode;
  const st = { clear: [0, 0], overcast: [0.35, 0], rain: [1, 1], dynamic: [0.2, 0] }[mode] || [0, 0];
  WEATHER.look = WEATHER.lookT = st[0]; WEATHER.rain = WEATHER.rainT = st[1]; WEATHER.wet = st[1] * 0.6;
  WEATHER.next = frand(90, 160);
  setWeatherLook(WEATHER.look);
}
function updateWeather(dt) {
  if (WEATHER.mode === 'dynamic') {
    WEATHER.next -= dt;
    if (WEATHER.next <= 0) {
      WEATHER.next = frand(110, 220);
      const k = fpick(['clear', 'overcast', 'rain', 'rain']);
      const st = { clear: [0, 0], overcast: [0.4, 0], rain: [1, 1] }[k];
      if (st[1] > WEATHER.rainT) alertMsg('Rain is setting in. The ground will turn to mud', '');
      else if (st[1] < WEATHER.rainT) alertMsg('The rain is easing off', '');
      WEATHER.lookT = st[0]; WEATHER.rainT = st[1];
    }
  }
  WEATHER.look += (WEATHER.lookT - WEATHER.look) * Math.min(1, dt * 0.08);
  WEATHER.rain += (WEATHER.rainT - WEATHER.rain) * Math.min(1, dt * 0.08);
  WEATHER.wet = clamp(WEATHER.wet + (WEATHER.rain > 0.5 ? dt / 70 : -dt / 260), 0, 1);
  setWeatherLook(WEATHER.look);
  if (terrainMat) { terrainMat.color.setScalar(1 - WEATHER.wet * 0.2); terrainMat.roughness = lerp(0.95, 0.55, WEATHER.wet); }
}
const weatherName = () => (WEATHER.rain > 0.5 ? (WEATHER.wet > 0.6 ? 'Rain · deep mud' : 'Rain') : WEATHER.look > 0.25 ? 'Overcast' : 'Clear') + (WEATHER.wet > 0.3 && WEATHER.rain <= 0.5 ? ' · mud' : '');

// ---------- end of match ----------
function endMatch(result, why) {
  if (GAME.over) return;
  GAME.over = true; GAME.result = result; GAME.why = why || '';
  GAME.endT = 0;
  if (result === 'win') { sfx('bugle'); setTimeout(() => sfx('bugle'), 700); }
  else sfx('lost');
  banner(result === 'win' ? 'Victory' : 'Defeat', why);
  if (GAME.cfg.mode === 'campaign' && result === 'win') { try { const k = 'mi-camp'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s[GAME.cfg.mission] = 1; localStorage.setItem(k, JSON.stringify(s)); } catch (e) { /* storage unavailable */ } }
}
function hqCheck() {
  if (TEAMS[0].hq && TEAMS[0].hq.dead) { endMatch('lose', 'Your headquarters has been overrun.'); return true; }
  if (TEAMS[1].hq && TEAMS[1].hq.dead) { endMatch('win', 'The enemy headquarters has fallen.'); return true; }
  return false;
}
function updateMode(dt) {
  updatePoints(dt);
  updateEconomy(dt);
  updateWeather(dt);
  if (!GAME.over && GAME.M.update) GAME.M.update(dt);
  if (GAME.over) GAME.endT += dt;
}

// ---------- modes ----------
const MODES = {
  skirmish: {
    name: 'Skirmish',
    desc: 'Build a base, take the sectors and destroy the enemy headquarters. The enemy does the same.',
    layout: (cfg) => ({ W: SIZES[cfg.size], H: SIZES[cfg.size], river: (cfg.seed % 100) < 45, villages: 'auto', nmlWire: 4, oldTrenches: true, band: 0.16 }),
    setup(cfg) {
      for (const t of [0, 1]) {
        const b = MAP.bases[t];
        spawnHQ(t, b.x, b.z);
        const fz = t === 0 ? -14 : 14;
        spawnGroup(t, ['rifle', 'rifle', 'eng'], b.x, b.z + fz, 6, t === 0 ? Math.PI : 0);
      }
      initAI(1, cfg.diff);
      GAME.objectives = [{ text: 'Destroy the enemy headquarters' }, { text: 'Or hold every sector for 90 seconds to force a surrender' }];
      this.hold = [0, 0];
    },
    update(dt) {
      if (hqCheck()) return;
      for (const t of [0, 1]) {
        const all = MAP.points.every((p) => p.owner === t);
        this.hold[t] = all ? this.hold[t] + dt : 0;
        if (all && this.hold[t] - dt <= 0 && t === 0) alertMsg('You hold every sector. Keep them for 90 seconds and the enemy will surrender', 'good');
        if (all && this.hold[t] - dt <= 0 && t === 1) alertMsg('The enemy holds every sector! Retake one within 90 seconds or we surrender', 'bad');
        if (this.hold[t] >= 90) endMatch(t === 0 ? 'win' : 'lose', t === 0 ? 'Cut off from every sector, the enemy has surrendered.' : 'Cut off from every sector, your army has surrendered.');
      }
    },
    objText() {
      const h = this.hold || [0, 0];
      if (h[0] > 0) return `Hold every sector · enemy surrenders in <b>${fmtTime(90 - h[0])}</b>`;
      if (h[1] > 0) return `<span style="color:#ff8a75">Enemy holds every sector · retake one within <b>${fmtTime(90 - h[1])}</b></span>`;
      return 'Destroy the enemy headquarters';
    },
  },
  frontline: {
    name: 'Frontline',
    desc: 'Five rows of sectors between two trench systems. You can only attack a sector next to one you hold. Take two of the three sectors in the enemy\'s rear line to break through.',
    layout(cfg) {
      const W = SIZES[cfg.size === 's' ? 's' : 'm'], H = Math.round(W * 1.4 / 4) * 4;
      const rows = [0.8, 0.65, 0.5, 0.35, 0.2], cols = [0.2, 0.5, 0.8];
      const pts = [];
      rows.forEach((rz, r) => cols.forEach((cx, c) => pts.push({ x: W * cx + (r % 2 ? 0 : 0), z: H * rz, row: r, col: c, owner: r === 0 ? 0 : r === 4 ? 1 : -1, value: r === 2 ? 0.6 : 0.45 })));
      const trenches = [];
      for (const [r, dir] of [[0, -1], [1, -1]]) {
        const z = H * rows[r] + dir * 12;
        trenches.push({ x0: W * 0.04, z0: z, x1: W * 0.33, z1: z, wire: dir * 11 }, { x0: W * 0.39, z0: z, x1: W * 0.61, z1: z, wire: dir * 11 }, { x0: W * 0.67, z0: z, x1: W * 0.96, z1: z, wire: dir * 11 });
        // mirror for the enemy rows
        const mz = H - z;
        trenches.push({ x0: W * 0.04, z0: mz, x1: W * 0.33, z1: mz, wire: -dir * 11 }, { x0: W * 0.39, z0: mz, x1: W * 0.61, z1: mz, wire: -dir * 11 }, { x0: W * 0.67, z0: mz, x1: W * 0.96, z1: mz, wire: -dir * 11 });
      }
      return { W, H, river: false, villages: [{ x: W * 0.2, z: H * 0.65, church: true }, { x: W * 0.8, z: H * 0.35, church: true, mirrorOf: 0 }], points: pts, trenches,
        bases: [{ x: W / 2, z: H - 26 }, { x: W / 2, z: 26 }], band: 0.1, nmlWire: 3, woods: 0.7, pointCount: 15 };
    },
    canCapture(team, p) {
      if (p.row < 0) return true;
      if (team === 0 && p.row === 0) return true;
      if (team === 1 && p.row === 4) return true;
      const need = team === 0 ? p.row - 1 : p.row + 1;
      return MAP.points.some((q) => q.row === need && q.owner === team && Math.abs(q.col - p.col) <= 1);
    },
    setup(cfg) {
      for (const t of [0, 1]) {
        const b = MAP.bases[t];
        spawnHQ(t, b.x, b.z);
        const face = t === 0 ? Math.PI : 0;
        const row = t === 0 ? 0 : 4;
        for (const p of MAP.points.filter((q) => q.row === row)) garrison(t, ['rifle'], p.x, p.z + (t === 0 ? -12 : 12), face);
        spawnGroup(t, ['rifle', 'mg', 'eng'], b.x, b.z + (t === 0 ? -14 : 14), 6, face);
        TEAMS[t].supply = 450;
      }
      initAI(1, cfg.diff);
      GAME.objectives = [{ text: 'Break through: hold 2 of the 3 sectors in the enemy rear line' }, { text: 'Sectors can only be taken from an adjacent sector you hold' }];
    },
    update() {
      if (hqCheck()) return;
      const r0 = MAP.points.filter((p) => p.row === 4 && p.owner === 0).length, r1 = MAP.points.filter((p) => p.row === 0 && p.owner === 1).length;
      if (r0 >= 2) endMatch('win', 'Your troops have broken through the enemy rear line.');
      else if (r1 >= 2) endMatch('lose', 'The enemy has broken through your rear line.');
    },
    objText() {
      const a = MAP.points.filter((p) => p.row === 4 && p.owner === 0).length, b = MAP.points.filter((p) => p.row === 0 && p.owner === 1).length;
      return `Break through: <b>${a}/2</b> enemy rear sectors held · enemy holds <b>${b}/2</b> of yours`;
    },
  },
  survival: {
    name: 'Survival',
    desc: 'Hold your trench line against endless waves. Each wave is bigger than the last, and later waves bring gas, tanks and barrages. Your HQ must not fall.',
    layout(cfg) {
      const W = 300, H = 320;
      const z1 = H * 0.62;
      return { W, H, river: false, villages: [{ x: W * 0.5, z: H * 0.4, center: false, church: true }],
        points: [{ x: W * 0.25, z: z1 + 8, owner: 0, value: 0.5 }, { x: W * 0.5, z: z1 + 8, owner: 0, value: 0.5 }, { x: W * 0.75, z: z1 + 8, owner: 0, value: 0.5 },
          { x: W * 0.5, z: H * 0.4, value: 0.8 }, { x: W * 0.2, z: H * 0.36, value: 0.6 }, { x: W * 0.8, z: H * 0.36, value: 0.6 }],
        trenches: [{ x0: W * 0.08, z0: z1, x1: W * 0.92, z1: z1, wire: -13 }, { x0: W * 0.3, z0: H * 0.74, x1: W * 0.7, z1: H * 0.74 }],
        bases: [{ x: W / 2, z: H - 30 }, null], band: 0.2, craters: 1.3, woods: 0.6, mudless: false };
    },
    setup(cfg) {
      const b = MAP.bases[0];
      spawnHQ(0, b.x, b.z);
      const z1 = MAP.H * 0.62;
      garrison(0, ['rifle', 'mg', 'rifle', 'mg', 'rifle'], MAP.W / 2, z1, Math.PI);
      spawnGroup(0, ['eng'], b.x, b.z - 14, 4, Math.PI);
      TEAMS[0].supply = 500;
      const ai = initAI(1, cfg.diff, { mode: 'waves', noBuild: true, noProduce: true });
      ai.waveTarget = nearestHeld;
      this.wave = 0; this.next = 50; this.best = +(localStorage.getItem('mi-survival') || 0);
      GAME.objectives = [{ text: 'Survive as many waves as you can' }, { text: 'Research gas masks before the gas comes' }];
    },
    update(dt) {
      if (hqCheck()) { this.saveBest(); return; }
      this.next -= dt;
      if (this.next <= 0) {
        this.wave++;
        this.next = Math.max(55, 85 - this.wave * 2);
        spawnWave(this.wave, MAP.W, 8);
        if (this.wave > 1) { TEAMS[0].supply += 60 + this.wave * 10; }
        banner(`Wave ${this.wave}`, this.wave === 1 ? 'Stand to!' : `${waveUnits(this.wave).length} enemy units incoming`);
        sfx('officer');
        if (this.wave >= 3 && this.wave % 3 === 0) { GAME.freePowers[1].gas = 1; TEAMS[1].powerCd.gas = 0; later(25, () => { const p = fpick(MAP.points.filter((q) => q.owner === 0)) || TEAMS[0].hq; if (p && !GAME.over) usePower(1, 'gas', p.x, p.z - 6); }); }
        if (this.wave >= 5 && this.wave % 2 === 1) { GAME.freePowers[1].creep = 1; TEAMS[1].powerCd.creep = 0; later(20, () => { const p = fpick(MAP.points.filter((q) => q.owner === 0)) || TEAMS[0].hq; if (p && !GAME.over) usePower(1, 'creep', p.x, p.z - 30); }); }
        if (this.wave >= 7 && this.wave % 2 === 0) { GAME.freePowers[1].strafe = 1; TEAMS[1].powerCd.strafe = 0; }
      }
      if (this.wave > this.best) { this.best = this.wave; }
    },
    saveBest() { try { localStorage.setItem('mi-survival', String(Math.max(this.best, +(localStorage.getItem('mi-survival') || 0)))); } catch (e) { /* storage unavailable */ } },
    objText() { return `Wave <b>${this.wave}</b> · next in <b>${fmtTime(this.next)}</b> · best <b>${this.best}</b>`; },
    income: (t) => (t === 0 ? 0.4 : 0),
  },
};

// Wave units head for whichever player-held sector is nearest to them, then the HQ.
function nearestHeld(e) {
  let best = null, bd = 1e18;
  for (const p of MAP.points) if (p.owner === 0 || (p.capT === 0 && p.prog > 0)) { const d = dist2(p.x, p.z, e.x, e.z); if (d < bd) { bd = d; best = p; } }
  return best || (TEAMS[0].hq && !TEAMS[0].hq.dead ? TEAMS[0].hq : MAP.points[0]);
}
function waveUnits(n) {
  const u = [];
  const rifles = 2 + Math.floor(n * 0.8);
  for (let i = 0; i < rifles; i++) u.push('rifle');
  if (n >= 2) for (let i = 0; i < Math.floor(n / 3) + 1; i++) u.push('mg');
  if (n >= 3) for (let i = 0; i < Math.floor(n / 3); i++) u.push('raid');
  if (n >= 4) for (let i = 0; i < Math.floor((n - 2) / 3); i++) u.push('mortar');
  if (n >= 5) u.push('ac');
  if (n >= 6) for (let i = 0; i < 1 + Math.floor((n - 6) / 3); i++) u.push('$tank');
  if (n >= 7) { const un = NATIONS[TEAMS[1].nation].unique; if (UNITS[un].kind === 'squad') u.push(un); else u.push(un); }
  if (n >= 8) for (let i = 0; i < Math.floor((n - 6) / 2); i++) u.push('fgun');
  return u.slice(0, 26);
}
function spawnWave(n, W, z) {
  const list = waveUnits(n).map((k) => (k === '$tank' ? NATIONS[TEAMS[1].nation].tank : k));
  list.forEach((type, i) => {
    const x = W * (0.12 + 0.76 * ((i * 0.618) % 1));
    spawnUnit(type, 1, x, z + frand(0, 14), 0);
  });
}

// ---------- campaign ----------
const MISSIONS = [
  {
    name: 'Hold the Line', when: 'Ypres, Belgium · April 1915',
    brief: 'The salient is quiet, which nobody trusts. Reports speak of strange cylinders being dug in opposite our line.\n\nYour battalion holds three sectors of the front trench. Keep the enemy out of them until relief arrives. If what the reports say is true, the gas masks in stores at HQ will be worth every penny.',
    obj: ['Hold at least one front-line sector until relief arrives (7:00)', 'Keep your HQ standing', 'Tip: research Gas Masks at your HQ'],
    layout() {
      const W = 280, H = 320, z1 = H * 0.6;
      return { W, H, river: false, villages: [{ x: W * 0.5, z: H * 0.36, church: true }], points: [{ x: W * 0.25, z: z1 + 8, owner: 0 }, { x: W * 0.5, z: z1 + 8, owner: 0 }, { x: W * 0.75, z: z1 + 8, owner: 0 }, { x: W * 0.5, z: H * 0.36, value: 0.6 }],
        trenches: [{ x0: W * 0.08, z0: z1, x1: W * 0.92, z1: z1, wire: -13 }, { x0: W * 0.12, z0: H * 0.3, x1: W * 0.88, z1: H * 0.3 }], bases: [{ x: W / 2, z: H - 28 }, null], band: 0.18, craters: 0.8 };
    },
    setup(cfg) {
      spawnHQ(0, MAP.bases[0].x, MAP.bases[0].z);
      garrison(0, ['rifle', 'mg', 'rifle', 'rifle', 'mg', 'rifle'], MAP.W / 2, MAP.H * 0.6, Math.PI);
      spawnGroup(0, ['eng'], MAP.bases[0].x, MAP.bases[0].z - 14, 4, Math.PI);
      garrison(1, ['rifle', 'rifle', 'mg', 'rifle'], MAP.W / 2, MAP.H * 0.3, 0);
      TEAMS[0].supply = 350;
      const ai = initAI(1, cfg.diff, { mode: 'waves', noBuild: true, noProduce: true });
      ai.waveTarget = nearestHeld;
      this.next = 40; this.wave = 0; this.gassed = false;
      GAME.objectives = this.obj.map((t) => ({ text: t }));
      GAME.hint = 'Your squads are in the trench. Right-click to move, and research gas masks at the HQ.';
    },
    update(dt) {
      if (hqCheck()) return;
      this.next -= dt;
      if (this.next <= 0 && GAME.t < 400) {
        this.wave++; this.next = 60;
        const list = ['rifle', 'rifle', 'rifle'].concat(this.wave >= 2 ? ['rifle', 'mg'] : []).concat(this.wave >= 4 ? ['raid', 'rifle', 'mortar'] : []).concat(this.wave >= 6 ? ['raid', 'rifle'] : []);
        list.forEach((type, i) => spawnUnit(type, 1, MAP.W * (0.15 + 0.7 * ((i * 0.618) % 1)), 10 + frand(0, 10), 0));
        if (this.wave === 1) alertMsg('Enemy infantry advancing across no-man\'s-land!', 'bad');
      }
      if (!this.gassed && GAME.t > 150) {
        this.gassed = true;
        GAME.freePowers[1].gas = 2;
        const p = MAP.points.filter((q) => q.owner === 0)[1] || MAP.points[0];
        usePower(1, 'gas', p.x - 30, p.z - 4); later(1.5, () => { TEAMS[1].powerCd.gas = 0; if (!GAME.over) usePower(1, 'gas', p.x + 30, p.z - 4); });
        banner('Gas!', 'A yellow-green cloud is rolling toward the line');
      }
      const held = MAP.points.filter((p) => p.owner === 0 && p.z > MAP.H / 2).length;
      if (GAME.t > 60 && held === 0) endMatch('lose', 'The enemy has taken the whole front line.');
      if (GAME.t >= 420) endMatch('win', 'Relief has arrived. The line held.');
    },
    objText() { return `Hold the line · relief in <b>${fmtTime(420 - GAME.t)}</b> · <b>${MAP.points.filter((p) => p.owner === 0 && p.z > MAP.H / 2).length}</b> sectors held`; },
    popBonus: () => 20,
  },
  {
    name: 'Over the Top', when: 'The Somme, France · July 1916',
    brief: 'For a week the guns have pounded the enemy line. At zero hour the barrage lifts and the whistles blow.\n\nTake the three sectors of the enemy front trench. Your corps artillery has allotted you two creeping barrages: walk your infantry in close behind the curtain of shells and you will be in their trench before the machine gunners are out of their dugouts.',
    obj: ['Capture all three enemy front-line sectors (15:00)', 'Two free Creeping Barrages are available (top right)'],
    layout() {
      const W = 320, H = 340;
      return { W, H, river: false, villages: [{ x: W * 0.5, z: H * 0.2, church: true }],
        points: [{ x: W * 0.22, z: H * 0.36, owner: 1, value: 0.6 }, { x: W * 0.5, z: H * 0.36, owner: 1, value: 0.6 }, { x: W * 0.78, z: H * 0.36, owner: 1, value: 0.6 }, { x: W * 0.5, z: H * 0.2, owner: 1 }],
        trenches: [{ x0: W * 0.06, z0: H * 0.72, x1: W * 0.94, z1: H * 0.72 }, { x0: W * 0.06, z0: H * 0.38, x1: W * 0.94, z1: H * 0.38, wire: 12 }, { x0: W * 0.1, z0: H * 0.27, x1: W * 0.9, z1: H * 0.27 }],
        wires: [{ x0: W * 0.06, z0: H * 0.38 + 16, x1: W * 0.94, z1: H * 0.38 + 16 }],
        bases: [{ x: W / 2, z: H - 28 }, null], band: 0.18, craters: 2.2, woods: 0.4 };
    },
    setup(cfg) {
      spawnHQ(0, MAP.bases[0].x, MAP.bases[0].z);
      spawnBuilding('barracks', 0, MAP.bases[0].x + 26, MAP.bases[0].z + 2, Math.PI, 1);
      garrison(0, ['rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'mg', 'mg', 'mortar'], MAP.W / 2, MAP.H * 0.72, Math.PI);
      spawnGroup(0, ['eng'], MAP.bases[0].x, MAP.bases[0].z - 14, 4, Math.PI);
      const z = MAP.H * 0.38;
      garrison(1, ['mg', 'rifle', 'rifle'], MAP.W * 0.22, z, 0);
      garrison(1, ['mg', 'rifle', 'rifle'], MAP.W * 0.5, z, 0);
      garrison(1, ['mg', 'rifle', 'rifle'], MAP.W * 0.78, z, 0);
      garrison(1, ['rifle', 'mortar', 'rifle', 'mortar'], MAP.W * 0.5, MAP.H * 0.27, 0);
      TEAMS[0].supply = 300;
      GAME.freePowers[0].creep = 2;
      const ai = initAI(1, cfg.diff, { mode: 'defend', noBuild: true, noProduce: true });
      ai.counter = [0, 1, 2];
      this.next = 90;
      GAME.objectives = this.obj.map((t) => ({ text: t }));
      GAME.hint = 'Call a Creeping Barrage (O) on the enemy wire, then advance behind it.';
    },
    update(dt) {
      this.next -= dt;
      if (this.next <= 0) { this.next = 80; spawnGroup(1, ['rifle', 'rifle'], MAP.W * frand(0.3, 0.7), 12, 6, 0); }
      const taken = MAP.points.filter((p, i) => i < 3 && p.owner === 0).length;
      if (taken === 3) endMatch('win', 'The enemy front line is yours. A great day for the regiment.');
      else if (GAME.t > 900) endMatch('lose', 'The attack has stalled. The enemy line still holds.');
      else if (TEAMS[0].hq.dead) endMatch('lose', 'Your headquarters has been overrun.');
    },
    objText() { return `Take the enemy front line · <b>${MAP.points.filter((p, i) => i < 3 && p.owner === 0).length}/3</b> sectors · <b>${fmtTime(900 - GAME.t)}</b> left`; },
  },
  {
    name: 'The Village', when: 'Fleury, near Verdun · June 1916',
    brief: 'The village has changed hands eleven times this month. It is a heap of brick dust now, but it is the only high ground for a mile and both armies want it.\n\nDrive the enemy out of the village, then hold all three of its sectors against the counter-attack that will surely come.',
    obj: ['Capture the three village sectors', 'Then hold them for 4:00 against the counter-attack'],
    layout() {
      const W = 300, H = 320;
      return { W, H, river: false, villages: [{ x: W * 0.5, z: H * 0.45, center: true }],
        points: [{ x: W * 0.5, z: H * 0.45, owner: 1, value: 0.8, name: 'Village Square' }, { x: W * 0.3, z: H * 0.42, owner: 1, value: 0.5, name: 'The Mill' }, { x: W * 0.7, z: H * 0.48, owner: 1, value: 0.5, name: 'Church Ruins' }],
        trenches: [{ x0: W * 0.25, z0: H * 0.53, x1: W * 0.75, z1: H * 0.53 }], ruinBias: 0.5, bases: [{ x: W / 2, z: H - 28 }, { x: W / 2, z: 26 }], band: 0.2, craters: 1.4 };
    },
    setup(cfg) {
      spawnHQ(0, MAP.bases[0].x, MAP.bases[0].z);
      spawnBuilding('barracks', 0, MAP.bases[0].x + 26, MAP.bases[0].z + 2, Math.PI, 1);
      spawnBuilding('depot', 0, MAP.bases[0].x - 24, MAP.bases[0].z + 2, Math.PI, 1);
      spawnGroup(0, ['rifle', 'rifle', 'rifle', 'rifle', 'mg', 'raid', 'eng'], MAP.bases[0].x, MAP.bases[0].z - 22, 10, Math.PI);
      spawnHQ(1, MAP.bases[1].x, MAP.bases[1].z);
      spawnBuilding('barracks', 1, MAP.bases[1].x + 26, MAP.bases[1].z, 0, 1);
      garrison(1, ['mg', 'rifle', 'rifle'], MAP.W * 0.5, MAP.H * 0.53, 0);
      spawnGroup(1, ['rifle', 'mg'], MAP.W * 0.3, MAP.H * 0.42, 5, 0);
      spawnGroup(1, ['rifle', 'rifle'], MAP.W * 0.7, MAP.H * 0.48, 5, 0);
      TEAMS[0].supply = 500;
      const ai = initAI(1, cfg.diff, { mode: 'defend', noBuild: true, incomeMult: 0.6, builds: [] });
      ai.counter = [0, 1, 2];
      this.phase = 0; this.hold = 240; this.next = 30;
      GAME.objectives = this.obj.map((t) => ({ text: t }));
      GAME.hint = 'Clear the village. Raiders are deadly at close range among the ruins.';
    },
    update(dt) {
      if (TEAMS[0].hq.dead) { endMatch('lose', 'Your headquarters has been overrun.'); return; }
      const held = MAP.points.filter((p) => p.owner === 0).length;
      if (this.phase === 0 && held === 3) {
        this.phase = 1; banner('Village taken', 'Dig in! The counter-attack is coming');
        GAME.objectives[0].done = true;
        const ai = AIS[1]; ai.mode = 'waves'; ai.waveTarget = nearestHeld;
        TEAMS[0].supply += 250;
      }
      if (this.phase === 1) {
        this.hold -= dt;
        this.next -= dt;
        if (this.next <= 0) {
          this.next = 45;
          const n = Math.floor((240 - this.hold) / 45);
          const list = ['rifle', 'rifle', 'raid'].concat(n >= 1 ? ['mg', 'rifle'] : []).concat(n >= 2 ? ['mortar', 'raid', NATIONS[TEAMS[1].nation].unique === 'flamer' ? 'flamer' : 'rifle'] : []).concat(n >= 3 ? ['ac', 'rifle', 'raid'] : []);
          list.forEach((type, i) => spawnUnit(type, 1, MAP.W * (0.2 + 0.6 * ((i * 0.618) % 1)), 40 + frand(0, 10), 0));
        }
        if (this.hold <= 0 && held >= 2) endMatch('win', 'The village is ours, for now.');
        else if (this.hold <= 0) this.hold = 20;
      }
    },
    objText() {
      const held = MAP.points.filter((p) => p.owner === 0).length;
      return this.phase === 0 ? `Take the village · <b>${held}/3</b> sectors` : `Hold the village · <b>${fmtTime(this.hold)}</b> · <b>${held}/3</b> sectors held`;
    },
  },
  {
    name: 'Iron Monsters', when: 'Cambrai, France · November 1917',
    brief: 'No preliminary bombardment this time. The tanks will go first, crushing the wire, and the infantry will follow in their tracks.\n\nBehind the enemy\'s deep trench system sits a battery of four field guns. Destroy all four. Watch out for the enemy\'s raiders: their grenade bundles are made for killing tanks. Engineers can repair a tank that breaks down.',
    obj: ['Destroy the four enemy field guns', 'Keep your HQ standing'],
    layout() {
      const W = 320, H = 380;
      return { W, H, river: false, villages: [{ x: W * 0.25, z: H * 0.28, church: true }], points: [{ x: W * 0.25, z: H * 0.28, owner: 1, value: 0.6 }, { x: W * 0.75, z: H * 0.45, owner: 1, value: 0.5 }, { x: W * 0.5, z: H * 0.6, value: 0.5 }],
        trenches: [{ x0: W * 0.05, z0: H * 0.48, x1: W * 0.95, z1: H * 0.48, wire: 12 }, { x0: W * 0.05, z0: H * 0.38, x1: W * 0.95, z1: H * 0.38, wire: 10 }, { x0: W * 0.08, z0: H * 0.74, x1: W * 0.92, z1: H * 0.74 }],
        wires: [{ x0: W * 0.05, z0: H * 0.48 + 18, x1: W * 0.95, z1: H * 0.48 + 18 }],
        bases: [{ x: W / 2, z: H - 28 }, null], band: 0.14, craters: 0.5, woods: 0.6 };
    },
    setup(cfg) {
      const b = MAP.bases[0];
      spawnHQ(0, b.x, b.z);
      spawnBuilding('workshop', 0, b.x + 28, b.z + 2, Math.PI, 1);
      spawnBuilding('barracks', 0, b.x - 26, b.z + 2, Math.PI, 1);
      const tank = NATIONS[TEAMS[0].nation].tank;
      spawnGroup(0, [tank, tank, tank], b.x, MAP.H * 0.66, 14, Math.PI);
      garrison(0, ['rifle', 'rifle', 'rifle', 'rifle', 'raid'], MAP.W / 2, MAP.H * 0.74, Math.PI);
      spawnGroup(0, ['eng'], b.x, b.z - 14, 4, Math.PI);
      garrison(1, ['mg', 'rifle', 'rifle', 'mg', 'rifle', 'raid'], MAP.W / 2, MAP.H * 0.48, 0);
      garrison(1, ['rifle', 'raid', 'mg', 'rifle'], MAP.W / 2, MAP.H * 0.38, 0);
      this.guns = [];
      for (const fx of [0.3, 0.45, 0.6, 0.75]) { const g = spawnUnit('fgun', 1, MAP.W * fx, MAP.H * 0.2, 0); g.face = 0; g.ang = 0; this.guns.push(g); }
      TEAMS[0].supply = 450;
      const ai = initAI(1, cfg.diff, { mode: 'defend', noBuild: true, noProduce: true });
      ai.counter = [1];
      this.next = 70;
      GAME.objectives = this.obj.map((t) => ({ text: t }));
      GAME.hint = 'Send the tanks through the wire first; the infantry should follow close behind.';
    },
    update(dt) {
      if (TEAMS[0].hq.dead) { endMatch('lose', 'Your headquarters has been overrun.'); return; }
      this.next -= dt;
      if (this.next <= 0) { this.next = 75; spawnGroup(1, ['raid', 'rifle'], MAP.W * frand(0.3, 0.7), 14, 6, 0); }
      const left = this.guns.filter((g) => !g.dead).length;
      if (left === 0) endMatch('win', 'The battery is silenced. The tanks have proved themselves.');
    },
    objText() { return `Destroy the enemy battery · <b>${this.guns.filter((g) => !g.dead).length}</b> field guns remaining`; },
  },
  {
    name: 'The Hundred Days', when: 'Amiens, France · August 1918',
    brief: 'The war of movement has returned. Both armies are worn thin, and whoever breaks first will lose the war.\n\nThis is a full battle on a large, river-cut sector against a determined enemy commander. Build your forces, take the bridges and destroy the enemy headquarters.',
    obj: ['Destroy the enemy headquarters', 'Keep your HQ standing'],
    layout() { return { W: 400, H: 400, river: true, villages: 'auto', nmlWire: 6, oldTrenches: true, band: 0.16 }; },
    setup(cfg) {
      for (const t of [0, 1]) {
        const b = MAP.bases[t];
        spawnHQ(t, b.x, b.z);
        spawnGroup(t, ['rifle', 'rifle', 'mg', 'eng'], b.x, b.z + (t === 0 ? -14 : 14), 6, t === 0 ? Math.PI : 0);
        TEAMS[t].supply = 500;
      }
      initAI(1, cfg.diff === 'easy' ? 'normal' : 'hard');
      GAME.objectives = this.obj.map((t) => ({ text: t }));
    },
    update() { hqCheck(); },
    objText: () => 'Destroy the enemy headquarters',
  },
];
MISSIONS.forEach((m, i) => { m.idx = i; if (!m.popBonus) m.popBonus = () => 20; m.enemies = [['de', 'gb'], ['de', 'fr'], ['de', 'fr'], ['de', 'gb'], ['de', 'gb']][i]; });
