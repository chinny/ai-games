// Mud & Iron — computer opponent: build plan, production mix, engineers, capture and attack waves,
// abilities and command powers. Also drives scripted waves for Survival and some campaign missions.

const AIS = [];
const AI_SPEED = { easy: 0.85, normal: 1, hard: 1.2 };
const AI_INCOME = { easy: 0.75, normal: 1.0, hard: 1.35 };
const AI_THINK = { easy: 2.6, normal: 1.6, hard: 1.0 };

function initAI(team, diff, opts = {}) {
  const ai = {
    team, diff, t: 0, thinkT: 2, mode: opts.mode || 'full', noBuild: !!opts.noBuild, noProduce: !!opts.noProduce,
    builds: (opts.builds || [['barracks', 35], ['depot', 140], ['artillery', 230], ['workshop', 320], ['airfield', 420], ['depot', 520]]).map(([k, t]) => ({ k, t: t * (diff === 'hard' ? 0.7 : diff === 'easy' ? 1.4 : 1), done: false })),
    role: {}, fortified: new Set(), attack: null, nextAttack: diff === 'hard' ? 150 : diff === 'easy' ? 300 : 210, powerT: 40, abilityT: 3, reconT: 120,
    target: opts.target || null, maxEng: opts.maxEng ?? 2, waveTarget: null, allowPowers: opts.powers !== false,
  };
  AIS[team] = ai;
  TEAMS[team].aiDiff = diff;
  TEAMS[team].incomeMult = AI_INCOME[diff] * (opts.incomeMult || 1);
  return ai;
}

function updateAI(dt) {
  for (const ai of AIS) {
    if (!ai) continue;
    ai.t += dt;
    ai.thinkT -= dt;
    if (ai.thinkT <= 0) { ai.thinkT = AI_THINK[ai.diff]; aiThink(ai); }
    ai.abilityT -= dt;
    if (ai.abilityT <= 0) { ai.abilityT = ai.diff === 'easy' ? 4 : 2; aiAbilities(ai); }
  }
}
function aiUnitReady(ai, u) { ai.role[u.id] = null; }
function aiBuildingDone(ai, b) { if (b.type !== 'hq') b.rally = aiRallyPoint(ai); }

function aiThink(ai) {
  const me = ai.team, T = TEAMS[me];
  const units = [], blds = [];
  for (const e of ENTS) if (!e.dead && e.team === me) (e.kind === 'bld' ? blds : units).push(e);
  // casualties fall back and refill
  for (const e of units) {
    if (e.kind !== 'squad') continue;
    const frac = aliveMen(e).length / e.def.men;
    if (!e.retreat && !e.broken && frac <= 0.34 && !nearHeal(e) && ai.mode !== 'static' && ai.mode !== 'waves') { giveOrder(e, { t: 'retreat' }); ai.role[e.id] = null; }
    if (nearHeal(e) && frac < 1 && T.supply > 160 && !e.reinf) doReinforce(e);
  }
  if (!ai.noProduce) aiProduce(ai, units, blds);
  if (!ai.noBuild) aiEngineers(ai, units.filter((e) => e.kind === 'squad' && e.def.eng), blds);
  if (ai.mode === 'full') aiArmy(ai, units.filter((e) => !(e.kind === 'squad' && e.def.eng)));
  else if (ai.mode === 'waves') aiWaves(ai, units);
  else if (ai.mode === 'defend') aiDefend(ai, units);
  if (ai.allowPowers) aiPowers(ai);
  if (!T.research.gasmask && !T.researching && T.hq && !T.hq.dead && (ai.t > 360 || GAS.length) && T.supply > 260) startResearch(T.hq, 'gasmask');
}

// ---------- production ----------
const AI_MIX = { rifle: 5, mg: 2.2, raid: 1.4, mortar: 1.1, lewis: 1.6, flamer: 1.2, fgun: 1, skoda: 0.6, ac: 1, mark4: 1.6, stchamond: 1.4, a7v: 1.4, beute: 1.5, ft: 1.6 };
function aiProduce(ai, units, blds) {
  const me = ai.team, T = TEAMS[me];
  const engs = units.filter((e) => e.kind === 'squad' && e.def.eng).length + blds.reduce((n, b) => n + b.queue.filter((q) => q.type === 'eng').length, 0);
  const due = ai.builds.find((b) => !b.done && ai.t >= b.t);
  const reserve = due && !ENTS.some((e) => !e.dead && e.team === me && e.kind === 'bld' && e.type === due.k && e.built < 1) ? BLDS[due.k].cost : 0;
  const counts = {};
  for (const u of units) counts[u.type] = (counts[u.type] || 0) + 1;
  for (const b of blds) for (const q of b.queue) counts[q.type] = (counts[q.type] || 0) + 1;
  const free = blds.filter((b) => b.built >= 1 && b.queue.length < 1 && makesFor(b.type, T.nation).length);
  if (!free.length) return;
  const hq = free.find((b) => b.type === 'hq');
  if (hq && engs < Math.min(ai.maxEng, 1 + Math.floor(ai.t / 240))) { if (T.supply >= UNITS.eng.cost) queueUnit(hq, 'eng'); return; }
  // decide on one unit across every building, then save up for it rather than spending on whatever is cheapest
  if (!ai.want || !free.some((b) => b === ai.want.b)) {
    const cands = [];
    for (const b of free) for (const k of makesFor(b.type, T.nation)) if (k !== 'eng') cands.push({ b, k });
    let tot = 0;
    const wts = cands.map(({ k }) => { let w = AI_MIX[k] || 1; w /= 1 + (counts[k] || 0) * 0.45; if (k === 'rifle' && (counts.rifle || 0) < 3) w *= 3; tot += w; return w; });
    let r = Math.random() * tot;
    ai.want = null;
    for (let i = 0; i < cands.length; i++) { r -= wts[i]; if (r <= 0) { ai.want = { ...cands[i], t: 0 }; break; } }
    if (!ai.want) return;
  }
  const { b, k } = ai.want, def = UNITS[k];
  ai.want.t += AI_THINK[ai.diff];
  if (T.pop + def.pop > T.popCap || ai.want.t > 90) { ai.want = null; return; }
  if (T.supply - def.cost < reserve) return;
  if (queueUnit(b, k)) ai.want = null;
}

// ---------- engineers ----------
function aiEngineers(ai, engs, blds) {
  const me = ai.team, T = TEAMS[me];
  const building = blds.filter((b) => b.built < 1);
  for (const e of engs) {
    if (e.retreat) continue;
    if (e.order && e.order.t !== 'move') continue;
    if (e.order && e.order.t === 'move' && e.path) continue;
    if (building.length) { giveOrder(e, { t: 'build', id: building[0].id }); continue; }
    const due = ai.builds.find((b) => !b.done && ai.t >= b.t);
    if (due && T.supply >= BLDS[due.k].cost) {
      const spot = aiFindSpot(ai, due.k);
      if (spot) { const b = orderBuild([e], due.k, spot.x, spot.z, spot.rot); if (b) { due.done = true; continue; } }
      else due.t += 30;
    }
    if (T.pop > T.popCap - 6 && T.popCap < 90 && !ai.builds.some((b) => !b.done && b.k === 'depot')) ai.builds.push({ k: 'depot', t: ai.t, done: false });
    // repairs
    const hurt = ENTS.find((o) => !o.dead && o.team === me && (o.kind === 'veh' || (o.kind === 'bld' && o.built >= 1)) && (o.hp < o.maxhp * 0.6 || o.broken > 0) && dist2(o.x, o.z, e.x, e.z) < 120 * 120);
    if (hurt) { giveOrder(e, { t: 'repair', id: hurt.id }); continue; }
    // fortify the front-most sector we hold
    if (T.supply > 260 && ai.mode === 'full') {
      const pts = MAP.points.filter((p) => p.owner === me && !ai.fortified.has(p.id));
      const en = enemyHome(me);
      pts.sort((a, b) => dist2(a.x, a.z, en.x, en.z) - dist2(b.x, b.z, en.x, en.z));
      const p = pts[0];
      if (p) {
        ai.fortified.add(p.id);
        let dx = en.x - p.x, dz = en.z - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
        const cx = p.x + dx * 11, cz = p.z + dz * 11, px = -dz, pz = dx;
        const cells = lineCells(cx - px * 12, cz - pz * 12, cx + px * 12, cz + pz * 12, 1);
        orderLine([e], 'dig', cells);
        if (T.supply > 200) {
          const wc = lineCells(cx + dx * 9 - px * 12, cz + dz * 9 - pz * 12, cx + dx * 9 + px * 12, cz + dz * 9 + pz * 12, 0);
          e.queue.push({ t: 'wire', cells: wc.filter((c) => !(MAP.flags[c] & (F.WIRE | F.TRENCH | F.BLOCK | F.WATER))), prog: {}, paid: false });
        }
        continue;
      }
    }
    const h = T.hq && !T.hq.dead ? T.hq : null;
    if (h && dist2(h.x, h.z, e.x, e.z) > 30 * 30) giveOrder(e, { t: 'move', x: h.x + frand(-12, 12), z: h.z + (me === 0 ? -14 : 14) });
  }
}
function enemyHome(team) {
  const T = TEAMS[1 - team];
  if (T && T.hq && !T.hq.dead) return T.hq;
  return MAP.bases[1 - team] || { x: MAP.W / 2, z: team === 0 ? 0 : MAP.H };
}
function aiFindSpot(ai, type) {
  const me = ai.team, T = TEAMS[me];
  const h = T.hq && !T.hq.dead ? T.hq : MAP.bases[me];
  if (!h) return null;
  const rot = me === 0 ? Math.PI : 0;
  const back = me === 0 ? 1 : -1;
  for (let k = 0; k < 60; k++) {
    const a = rand() * TAU, r = 20 + Math.random() * 30;
    const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r * 0.8 + back * 6;
    if (!canPlace(type, me, x, z, rot)) return { x, z, rot };
  }
  return null;
}
function aiRallyPoint(ai) {
  const me = ai.team, T = TEAMS[me];
  const h = T.hq && !T.hq.dead ? T.hq : MAP.bases[me];
  const en = enemyHome(me);
  return { x: lerp(h.x, en.x, 0.12) + frand(-10, 10), z: lerp(h.z, en.z, 0.12) };
}

// ---------- army ----------
function unitValue(e) { return e.kind === 'squad' ? e.def.cost * (aliveMen(e).length / e.def.men) : e.def.cost * (e.hp / e.maxhp); }
function aiArmy(ai, army) {
  const me = ai.team, T = TEAMS[me];
  const home = T.hq && !T.hq.dead ? T.hq : MAP.bases[me];
  const en = enemyHome(me);
  const free = army.filter((e) => !e.retreat && !(e.kind === 'squad' && e.def.crew && e.def.crew !== 'mg'));
  const arty = army.filter((e) => e.kind === 'squad' && e.def.crew && e.def.crew !== 'mg' && !e.retreat);
  const capturable = MAP.points.filter((p) => canCapture(me, p));
  // defend: anything threatening our HQ or a sector we hold pulls nearby units
  let threat = null;
  for (const o of ENTS) {
    if (o.dead || o.team === me || o.kind === 'bld') continue;
    if (home && dist2(o.x, o.z, home.x, home.z) < 60 * 60) { threat = o; break; }
  }
  if (threat) {
    const near = free.filter((e) => dist2(e.x, e.z, threat.x, threat.z) < 110 * 110 && (!e.order || e.order.t !== 'attack'));
    if (near.length) orderMove(near, threat.x, threat.z, false, true);
  }
  // attack waves
  const strength = free.reduce((s, e) => s + unitValue(e), 0);
  const need = (ai.diff === 'hard' ? 350 : ai.diff === 'easy' ? 600 : 450) + ai.t * 0.25;
  if (!ai.attack && ai.t > ai.nextAttack && strength > need) {
    const enemyPts = MAP.points.filter((p) => p.owner === 1 - me && canCapture(me, p));
    enemyPts.sort((a, b) => dist2(a.x, a.z, home.x, home.z) - dist2(b.x, b.z, home.x, home.z));
    const tgt = (ai.t > 600 && Math.random() < 0.35) || !enemyPts.length ? en : enemyPts[0];
    ai.attack = { x: tgt.x, z: tgt.z, t: 0, units: free.map((e) => e.id), barrage: false, id: tgt.kind === 'bld' ? tgt.id : null };
    orderMove(free, tgt.x, tgt.z, false, true);
    for (const e of free) ai.role[e.id] = 'attack';
  }
  if (ai.attack) {
    const A = ai.attack;
    A.t += AI_THINK[ai.diff];
    const left = A.units.map((id) => BYID.get(id)).filter((e) => e && !e.dead && !e.retreat);
    // creeping barrage ahead of the advance
    if (!A.barrage && A.t > 8) {
      let cx = 0, cz = 0; for (const e of left) { cx += e.x; cz += e.z; }
      if (left.length) { cx /= left.length; cz /= left.length; }
      const dd = Math.hypot(A.x - cx, A.z - cz);
      if (dd < 90 && dd > 40 && powerState(me, 'creep').ok) { A.barrage = true; usePower(me, 'creep', lerp(cx, A.x, 0.35), lerp(cz, A.z, 0.35)); }
    }
    const hqT = A.id && BYID.get(A.id);
    for (const e of left) {
      // guns and tanks go for the headquarters itself once they are close
      if (hqT && !hqT.dead && (e.kind === 'veh' || (e.w && e.w.shell) || e.type === 'raid') && dist2(e.x, e.z, hqT.x, hqT.z) < 90 * 90 && (!e.order || e.order.t !== 'attack')) { giveOrder(e, { t: 'attack', id: hqT.id }); continue; }
      if (!e.order || (e.order.t === 'move' && !e.path)) giveOrder(e, { t: 'move', x: A.x + frand(-10, 10), z: A.z + frand(-10, 10), amove: true });
    }
    const p = MAP.points.find((q) => q.x === A.x && q.z === A.z);
    if (left.length < Math.max(2, A.units.length * 0.3) || A.t > 200 || (p && p.owner === me)) {
      ai.attack = null;
      ai.nextAttack = ai.t + (ai.diff === 'hard' ? 50 : ai.diff === 'easy' ? 120 : 80);
      for (const e of left) ai.role[e.id] = null;
    }
  }
  // the rest capture and hold sectors
  const idle = free.filter((e) => ai.role[e.id] !== 'attack' && (!e.order || (e.order.t === 'move' && !e.path)));
  const want = capturable.filter((p) => p.owner !== me).sort((a, b) => scorePt(a, home) - scorePt(b, home));
  for (const e of idle) {
    if (ai.role[e.id] && ai.role[e.id].startsWith('hold')) {
      const pid = +ai.role[e.id].slice(5), p = MAP.points[pid];
      if (p && p.owner === me) continue;
    }
    // vehicles and infantry go for the nearest wanted sector; one squad stays behind on each held sector
    const held = MAP.points.filter((p) => p.owner === me && !Object.values(ai.role).includes('hold:' + p.id));
    if (held.length && e.kind === 'squad' && Math.random() < 0.5) {
      held.sort((a, b) => dist2(a.x, a.z, en.x, en.z) - dist2(b.x, b.z, en.x, en.z));
      const p = held[0];
      ai.role[e.id] = 'hold:' + p.id;
      let dx = en.x - p.x, dz = en.z - p.z; const d = Math.hypot(dx, dz) || 1;
      giveOrder(e, { t: 'move', x: p.x + dx / d * 8 + frand(-4, 4), z: p.z + dz / d * 8 + frand(-4, 4), face: Math.atan2(dx, dz) });
      continue;
    }
    const tgt = want.length ? want[Math.floor(Math.random() * Math.min(2, want.length))] : null;
    if (tgt) { ai.role[e.id] = 'cap'; giveOrder(e, { t: 'move', x: tgt.x + frand(-4, 4), z: tgt.z + frand(-4, 4), amove: true }); }
  }
  // artillery sits behind the front and shells whatever the army can see, or known enemy buildings
  for (const g of arty) {
    if (g.order && g.order.t !== 'move') continue;
    if (g.order && g.path) continue;
    const front = MAP.points.filter((p) => p.owner === me).sort((a, b) => dist2(a.x, a.z, en.x, en.z) - dist2(b.x, b.z, en.x, en.z))[0] || home;
    let dx = home.x - front.x, dz = home.z - front.z; const d = Math.hypot(dx, dz) || 1;
    const back = g.def.crew === 'skoda' ? 45 : g.def.crew === 'fgun' ? 30 : 14;
    const px = front.x + dx / d * back, pz = front.z + dz / d * back;
    if (dist2(px, pz, g.x, g.z) > 15 * 15) { giveOrder(g, { t: 'move', x: px, z: pz, face: Math.atan2(-dx, -dz) }); continue; }
    if (g.tgt) continue;
    const bt = ENTS.find((o) => !o.dead && o.team !== me && o.kind === 'bld' && o.seen !== false && Math.hypot(o.x - g.x, o.z - g.z) < g.w.range - 2 && Math.hypot(o.x - g.x, o.z - g.z) > (g.w.min || 0) + 2);
    if (bt && (g.def.crew === 'skoda' || g.def.crew === 'fgun')) giveOrder(g, { t: 'ground', x: bt.x, z: bt.z });
  }
}
function scorePt(p, home) { return Math.hypot(p.x - home.x, p.z - home.z) - p.value * 40 + (p.owner >= 0 ? 30 : 0); }

// Survival / scripted waves: everything presses toward the target.
function aiWaves(ai, units) {
  if (!ai.waveTarget) return;
  for (const e of units) {
    if (e.retreat || e.holdPos) continue;
    const tgt = ai.waveTarget(e);
    if (!tgt) continue;
    if (e.kind === 'squad' && e.def.crew && e.def.crew !== 'mg') {
      if (!e.order) { const d = Math.hypot(tgt.x - e.x, tgt.z - e.z); if (d > e.w.range * 0.8) giveOrder(e, { t: 'move', x: lerp(e.x, tgt.x, (d - e.w.range * 0.7) / d), z: lerp(e.z, tgt.z, (d - e.w.range * 0.7) / d) }); }
      continue;
    }
    if (!e.order || (e.order.t === 'move' && !e.path)) giveOrder(e, { t: 'move', x: tgt.x + frand(-14, 14), z: tgt.z + frand(-10, 10), amove: true });
  }
}
// Defenders hold their ground; if a held sector falls they try to retake it.
function aiDefend(ai, units) {
  if (!ai.counter) return;
  const lost = MAP.points.filter((p) => p.owner !== ai.team && ai.counter.includes(p.id));
  if (!lost.length) return;
  const p = lost[0];
  for (const e of units) if (!e.order && !e.retreat && !(e.def.crew && e.def.crew !== 'mg') && e.kind === 'squad' && Math.random() < 0.3) giveOrder(e, { t: 'move', x: p.x + frand(-6, 6), z: p.z + frand(-6, 6), amove: true });
}

// ---------- abilities and powers ----------
function aiAbilities(ai) {
  const me = ai.team, T = TEAMS[me];
  if (T.supply < 40) return;
  for (const e of ENTS) {
    if (e.dead || e.team !== me || e.kind !== 'squad') continue;
    const ab = e.def.ab || [];
    if (ab.includes('overtop') && abilityReady(e, 'overtop') && e.supp > 0.55 && e.order && e.order.t === 'move' && e.order.amove) { useAbility(e, 'overtop'); continue; }
    if (e.retreat) continue;
    if (ab.includes('grenade') || ab.includes('bundle')) {
      const k = ab.includes('bundle') ? 'bundle' : 'grenade';
      if (!abilityReady(e, k)) continue;
      for (const o of ENTS) {
        if (o.dead || o.team === me) continue;
        if (k === 'grenade' && o.kind !== 'squad') continue;
        const d = Math.hypot(o.x - e.x, o.z - e.z);
        if (d > ABIL[k].range || !visibleTo(me, o.x, o.z)) continue;
        if (k === 'grenade' && coverAt(o.x, o.z) < 0.4) continue;
        if (k === 'bundle' && o.kind === 'squad' && coverAt(o.x, o.z) < 0.6) continue;
        useAbility(e, k, o.x, o.z); break;
      }
    }
    if (ab.includes('barrage') && abilityReady(e, 'barrage') && e.setup >= 1 && e.tgt) {
      const o = BYID.get(e.tgt);
      if (o && o.kind === 'squad' && coverAt(o.x, o.z) >= 0.5) useAbility(e, 'barrage', o.x, o.z);
    }
  }
}
function aiPowers(ai) {
  const me = ai.team;
  ai.powerT -= AI_THINK[ai.diff];
  ai.reconT -= AI_THINK[ai.diff];
  if (ai.powerT > 0) return;
  ai.powerT = ai.diff === 'hard' ? 8 : 14;
  // find the juiciest visible cluster of enemy infantry
  let best = null, bs = 0;
  for (const e of ENTS) {
    if (e.dead || e.team === me || e.kind !== 'squad' || !visibleTo(me, e.x, e.z)) continue;
    let s = 0, trench = 0, friends = false;
    for (const o of ENTS) {
      if (o.dead || o.kind === 'bld') continue;
      const d2 = dist2(o.x, o.z, e.x, e.z);
      if (d2 > 18 * 18) continue;
      if (o.team === me) { friends = true; break; }
      s += o.kind === 'squad' ? 1 : 0.5;
      if (o.kind === 'squad' && coverAt(o.x, o.z) >= 0.7) trench++;
    }
    if (friends) continue;
    if (s > bs) { bs = s; best = { x: e.x, z: e.z, trench }; }
  }
  if (best && bs >= 2) {
    if (best.trench >= 2 && powerState(me, 'gas').ok && !TEAMS[1 - me].research.gasmask) { usePower(me, 'gas', best.x, best.z); return; }
    if (powerState(me, 'strafe').ok && bs >= 2.5) { usePower(me, 'strafe', best.x, best.z); return; }
    if (best.trench >= 2 && powerState(me, 'gas').ok && Math.random() < 0.3) { usePower(me, 'gas', best.x, best.z); return; }
  }
  if (ai.reconT <= 0 && powerState(me, 'recon').ok) {
    ai.reconT = 150;
    const en = enemyHome(me);
    usePower(me, 'recon', lerp(MAP.W / 2, en.x, 0.6) + frand(-40, 40), lerp(MAP.H / 2, en.z, 0.6));
  }
}
