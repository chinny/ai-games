// Mud & Iron — teams, entities (squads, vehicles, buildings), orders, movement, engineering work and rendering

const WEATHER = { mode: 'clear', rain: 0, wet: 0, target: 0, next: 0 };
const TEAMS = [];
let ENTS = [];
const BYID = new Map();
let ENT_ID = 1;
let CORPSES = [];
const SEL = [];
const MAN_SCALE = 1.25;
const VET_XP = { squad: [150, 400, 800], veh: [300, 800, 1600] };

function makeTeam(id, nation, ai) {
  return {
    id, nation, ai, supply: 400, pop: 0, popCap: 30, income: 0, research: {}, researching: null, powerCd: {}, hq: null,
    stats: { kills: 0, losses: 0, trained: 0, captured: 0, vehKills: 0, bldLost: 0 }, incomeMult: 1, alive: true,
  };
}
const aliveMen = (e) => e.men.filter((m) => m.alive);

// ---------- instanced soldier meshes ----------
const MEN_IM = {};
const MEN_CAP = 900;
function setupMenMeshes(nations) {
  for (const k in MEN_IM) for (const p in MEN_IM[k]) scene.remove(MEN_IM[k][p]);
  for (const k of Object.keys(MEN_IM)) delete MEN_IM[k];
  for (const n of nations) {
    if (MEN_IM[n]) continue;
    MEN_IM[n] = {};
    for (const pose of SOLDIER_POSES) {
      const m = new THREE.InstancedMesh(soldierGeo(n, pose), MAT.unit, pose === 'dead' ? 500 : MEN_CAP);
      m.count = 0; m.castShadow = pose !== 'dead'; m.receiveShadow = false; m.frustumCulled = false;
      scene.add(m);
      MEN_IM[n][pose] = m;
    }
  }
}
// Selection rings / hover rings under units.
const RINGS = (() => {
  const g = new THREE.RingGeometry(0.86, 1, 28); g.rotateX(-Math.PI / 2);
  const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }), 400);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(400 * 3), 3);
  m.count = 0; m.renderOrder = 2; m.frustumCulled = false;
  scene.add(m);
  return m;
})();
const entGroup = new THREE.Group();
scene.add(entGroup);

// ---------- spawning ----------
function addEnt(e) { e.id = ENT_ID++; ENTS.push(e); BYID.set(e.id, e); return e; }
function spawnUnit(type, team, x, z, ang) {
  const def = UNITS[type], T = TEAMS[team];
  const c = nearestPassable(CLS[def.cls], cellIdx(x, z), 10);
  if (c >= 0 && MAP.cost[CLS[def.cls]][cellIdx(x, z)] <= 0) { x = cellX(c); z = cellZ(c); }
  ang = ang ?? (team === 0 ? Math.PI : 0);
  const e = { kind: def.kind, type, def, team, nation: T.nation, x, z, ang, order: null, queue: [], path: null, pi: 0, tgt: null, acqT: Math.random() * 0.5,
    xp: 0, vet: 0, sight: def.sight, cls: CLS[def.cls], dead: false, vis: team === 0, abCd: {}, moving: false, stuckT: 0, lastX: x, lastZ: z, born: GAME.t, lastFire: -99, lastHit: -99 };
  if (def.kind === 'squad') {
    e.w = WEAPONS[def.weapon];
    e.men = [];
    e.supp = 0; e.broken = false; e.retreat = false; e.overtop = 0; e.setup = 0; e.wcd = 0; e.reinf = 0; e.reinfT = 0; e.barrage = null;
    e.gunAng = ang; e.wx = x; e.wz = z;
    for (let k = 0; k < def.men; k++) addMan(e, k);
    if (def.crew) {
      e.wmesh = new THREE.Mesh(weaponGeo(def.crew, e.nation), MAT.unit);
      e.wmesh.castShadow = true;
      entGroup.add(e.wmesh);
    }
  } else {
    e.hp = e.maxhp = def.hp;
    e.wpn = def.weapons.map((k) => ({ w: WEAPONS[k], cd: Math.random(), tgt: null }));
    e.broken = 0; e.v = 0; e.turretAng = 0; e.exT = 0;
    const m = vehicleModel(def.model, e.nation);
    e.model = m; e.mesh = m.group;
    entGroup.add(e.mesh);
  }
  addEnt(e);
  return e;
}
function addMan(e, k) {
  const def = e.def;
  const [ox, oz] = formSlot(k, def.men);
  const c = Math.cos(e.ang), s = Math.sin(e.ang);
  const x = e.x + ox * c + oz * s, z = e.z - ox * s + oz * c;
  const m = { x, z, y: groundH(x, z), ang: e.ang, hp: def.hp, alive: true, fire: frand(0.2, 2), ph: Math.random() * TAU, pose: 'stand', tx: x, tz: z, k, moving: false };
  e.men.push(m);
  return m;
}
function formSlot(k, n) {
  if (n <= 1) return [0, 0];
  const row = Math.floor(k / 3), col = (k % 3) - 1;
  return [col * 2.1 + (row % 2) * 0.7, -row * 2.0 + (col === 0 ? 0.6 : 0)];
}
function spawnBuilding(type, team, x, z, rot, built = 1) {
  const def = BLDS[type], T = TEAMS[team];
  const e = { kind: 'bld', type, def, team, nation: T.nation, x, z, ang: rot || 0, hp: def.hp * (built >= 1 ? 1 : 0.1), maxhp: def.hp, built, queue: [], rally: null,
    dead: false, vis: team === 0, seen: team === 0, sight: def.sight, cells: [], xp: 0, vet: 0, research: null, born: GAME.t, lastHit: -99 };
  e.y = terrainH(x, z);
  const m = buildingModel(type, T.nation);
  e.mesh = m.group;
  e.mesh.position.set(x, e.y, z); e.mesh.rotation.y = e.ang;
  entGroup.add(e.mesh);
  const [hw, hd] = footprint(type, e.ang);
  for (let c = 0; c < MAP.cw * MAP.ch; c++) {
    const cx = cellX(c), cz = cellZ(c);
    if (Math.abs(cx - x) < hw && Math.abs(cz - z) < hd) {
      e.cells.push(c); MAP.flags[c] |= F.BLOCK; MAP.flags[c] &= ~(F.TRENCH | F.WIRE); MAP.occ[c] = 0; computeCost(c);
      for (const t of MAP.trees) if (t.alive !== false && t.type !== 2 && cellIdx(t.x, t.z) === c) shatterTree(t, true);
    }
  }
  MAP.trenchDirty = MAP.wireDirty = true;
  addEnt(e);
  for (const c of e.cells) MAP.occ[c] = e.id;
  if (type === 'hq') T.hq = e;
  e.rally = { x: x + Math.sin(e.ang) * (hd + 8), z: z + Math.cos(e.ang) * (hd + 8) };
  setBuiltLook(e);
  // anyone standing inside the footprint is pushed out
  for (const o of ENTS) {
    if (o.kind === 'bld' || o.dead) continue;
    if (Math.abs(o.x - x) < hw + 1 && Math.abs(o.z - z) < hd + 1) {
      const c = nearestPassable(o.cls, cellIdx(o.x, o.z), 10);
      if (c >= 0) { o.x = cellX(c); o.z = cellZ(c); if (o.men) for (const m of o.men) { m.x = o.x; m.z = o.z; } }
    }
  }
  return e;
}
function footprint(type, rot) {
  const d = BLDS[type];
  const sw = Math.abs(Math.cos(rot)) > 0.5;
  return [(sw ? d.w : d.d) / 2, (sw ? d.d : d.w) / 2];
}
function setBuiltLook(e) {
  const k = e.built >= 1 ? 1 : 0.12 + e.built * 0.88;
  e.mesh.scale.set(1, k, 1);
}
function canPlace(type, team, x, z, rot) {
  const [hw, hd] = footprint(type, rot);
  if (!inMap(x - hw, z - hd, 4) || !inMap(x + hw, z + hd, 4)) return 'Too close to the edge';
  for (let cz = Math.floor((z - hd) / CS); cz <= Math.floor((z + hd) / CS); cz++) for (let cx = Math.floor((x - hw) / CS); cx <= Math.floor((x + hw) / CS); cx++) {
    const c = cz * MAP.cw + cx, f = MAP.flags[c];
    if (Math.abs(cellX(c) - x) >= hw || Math.abs(cellZ(c) - z) >= hd) continue;
    if (f & (F.WATER | F.BLOCK | F.BRIDGE)) return 'Blocked';
    if (f & (F.TRENCH | F.WIRE)) return 'Trench or wire in the way';
  }
  for (const p of MAP.points) if (dist2(p.x, p.z, x, z) < (p.r + Math.max(hw, hd)) ** 2) return 'Too close to a sector flag';
  if (!inTerritory(team, x, z)) return 'Must be near your HQ or a sector you hold';
  for (const o of ENTS) if (!o.dead && o.team !== team && o.kind !== 'bld' && dist2(o.x, o.z, x, z) < 30 * 30 && visibleTo(team, o.x, o.z)) return 'Enemies nearby';
  return null;
}
function inTerritory(team, x, z) {
  const T = TEAMS[team];
  if (T.hq && !T.hq.dead && dist2(T.hq.x, T.hq.z, x, z) < 55 * 55) return true;
  for (const p of MAP.points) if (p.owner === team && dist2(p.x, p.z, x, z) < 34 * 34) return true;
  for (const e of ENTS) if (e.kind === 'bld' && e.team === team && !e.dead && e.type === 'depot' && dist2(e.x, e.z, x, z) < 30 * 30) return true;
  return false;
}

function removeEnt(e) {
  e.dead = true;
  if (e.wmesh) { entGroup.remove(e.wmesh); }
  const i = SEL.indexOf(e); if (i >= 0) SEL.splice(i, 1);
}

// ---------- orders ----------
function setPath(e, x, z) {
  const p = findPath(e.cls, e.x, e.z, x, z);
  e.path = p; e.pi = 0; e.stuckT = 0;
  if (p && e.kind === 'squad') e.coverDone = false;
  return !!p;
}
function clearWork(e) {
  // refund engineering work that was paid for but never done
  if (e.order && (e.order.t === 'dig' || e.order.t === 'wire')) {
    const left = e.order.cells.filter((c) => !doneCell(e.order.t, c)).length;
    TEAMS[e.team].supply += left * ABIL[e.order.t === 'dig' ? 'trench' : 'wire'].costPer;
  }
}
function giveOrder(e, o, queue) {
  if (e.dead) return;
  if (queue && e.order && e.order.t !== 'idle') { e.queue.push(o); return; }
  clearWork(e);
  e.queue.length = 0;
  startOrder(e, o);
}
function startOrder(e, o) {
  e.order = o; e.tgt = null;
  if (e.kind === 'bld') return;
  if (e.kind === 'squad' && o.t !== 'retreat') { e.retreat = false; }
  if (e.barrage && o.t !== 'barrage') e.barrage = null;
  switch (o.t) {
    case 'move': setPath(e, o.x, o.z); break;
    case 'retreat': {
      const h = retreatPoint(e);
      e.retreat = true; e.tgt = null;
      if (h) setPath(e, h.x, h.z); else e.order = null;
      break;
    }
    case 'attack': e.tgt = o.id; e.path = null; break;
    case 'stop': e.path = null; e.order = null; break;
    default: e.path = null;
  }
}
function nextOrder(e) {
  if (e.queue.length) startOrder(e, e.queue.shift());
  else { e.order = null; e.path = null; }
}
function retreatPoint(e) {
  const T = TEAMS[e.team];
  let best = null, bd = 1e18;
  for (const b of ENTS) {
    if (b.kind !== 'bld' || b.dead || b.team !== e.team || !b.def.heal || b.built < 1) continue;
    const d = dist2(b.x, b.z, e.x, e.z);
    if (d < bd) { bd = d; best = b; }
  }
  if (!best) best = T.hq && !T.hq.dead ? T.hq : null;
  if (!best) { const b = MAP.bases[e.team]; return b ? { x: b.x, z: b.z } : null; }
  const [hw, hd] = footprint(best.type, best.ang);
  return { x: best.x + Math.sin(best.ang) * (hd + 6) + frand(-4, 4), z: best.z + Math.cos(best.ang) * (hd + 6) + frand(-4, 4), b: best };
}

// Group move: spread destinations so units don't pile onto one spot.
function orderMove(list, x, z, queue, amove) {
  list = list.filter((e) => e.kind !== 'bld' && !e.dead);
  if (!list.length) return;
  let cx = 0, cz = 0;
  for (const e of list) { cx += e.x; cz += e.z; }
  cx /= list.length; cz /= list.length;
  const ang = Math.atan2(x - cx, z - cz);
  const n = list.length, cols = Math.ceil(Math.sqrt(n * 2));
  const sorted = list.slice().sort((a, b) => (a.x - cx) * Math.cos(ang) - (b.x - cx) * Math.cos(ang) + (b.z - cz) * Math.sin(ang) - (a.z - cz) * Math.sin(ang));
  sorted.forEach((e, k) => {
    const row = Math.floor(k / cols), col = (k % cols) - (Math.min(cols, n - row * cols) - 1) / 2;
    const sp = e.kind === 'veh' ? 9 : 8;
    const ox = col * sp, oz = -row * sp;
    const c = Math.cos(ang), s = Math.sin(ang);
    let tx = x + ox * c + oz * s, tz = z - ox * s + oz * c;
    tx = clamp(tx, 2, MAP.W - 2); tz = clamp(tz, 2, MAP.H - 2);
    giveOrder(e, { t: 'move', x: tx, z: tz, amove: !!amove, face: ang }, queue);
  });
}
function orderAttack(list, tgt, queue) {
  for (const e of list) if (e.kind !== 'bld' && !e.dead && canHurt(e, tgt)) giveOrder(e, { t: 'attack', id: tgt.id }, queue);
}
function orderRetreat(list) { for (const e of list) if (e.kind === 'squad' && !e.dead) giveOrder(e, { t: 'retreat' }); }
function orderStop(list) { for (const e of list) if (e.kind !== 'bld' && !e.dead) { giveOrder(e, { t: 'stop' }); if (e.kind === 'squad') e.barrage = null; } }
function canHurt(e, tgt) {
  if (!tgt || tgt.dead || tgt.team === e.team) return false;
  if (e.kind === 'squad') {
    if (e.def.eng && tgt.kind !== 'squad') return false;
    return true;
  }
  return true;
}

// ---------- updates ----------
function updateEntities(dt) {
  for (let i = 0; i < ENTS.length; i++) {
    const e = ENTS[i];
    if (e.dead) continue;
    if (e.kind === 'squad') updateSquad(e, dt);
    else if (e.kind === 'veh') updateVeh(e, dt);
    else updateBld(e, dt);
  }
  separate(dt);
  // drop dead entities that have finished their death effects
  if (ENTS.some((e) => e.dead && e.gone)) { ENTS = ENTS.filter((e) => !(e.dead && e.gone)); }
  for (let i = SEL.length - 1; i >= 0; i--) if (SEL[i].dead) SEL.splice(i, 1);
  // corpses sink after a while
  for (const c of CORPSES) c.t += dt;
  if (CORPSES.length > 450 || (CORPSES.length && CORPSES[0].t > 150)) CORPSES = CORPSES.filter((c, i) => c.t < 150 && i >= CORPSES.length - 450);
}

function moveAlong(e, dt, speed) {
  if (!e.path) return false;
  const wp = e.path[e.pi];
  if (!wp) { e.path = null; return false; }
  const dx = wp.x - e.x, dz = wp.z - e.z, d = Math.hypot(dx, dz);
  const step = speed * dt;
  if (d <= Math.max(step, 0.5)) {
    e.x = wp.x; e.z = wp.z; e.pi++;
    if (e.pi >= e.path.length) { e.path = null; return false; }
    return true;
  }
  // re-path if the next step has become impassable (a new trench in front of a car, a building)
  const nx = e.x + (dx / d) * step, nz = e.z + (dz / d) * step;
  if (!passableAt(e.cls, nx, nz) && passableAt(e.cls, e.x, e.z)) {
    const last = e.path[e.path.length - 1];
    if (!setPath(e, last.x, last.z)) { e.path = null; return false; }
    return true;
  }
  e.x = nx; e.z = nz;
  e.ang = turnTo(e.ang, Math.atan2(dx, dz), dt * 5);
  return true;
}

function squadSpeed(e) {
  let s = e.def.speed * speedAt(0, e.x, e.z) * (1 - WEATHER.rain * 0.12);
  if (e.overtop > 0) s *= 1.35;
  else if (e.supp >= 0.6 && !e.retreat) s *= 0.45;
  if (e.retreat) s *= 1.3;
  if (e.def.crew === 'fgun' || e.def.crew === 'skoda') s *= Math.min(1, aliveMen(e).length / 3);
  return s;
}

function updateSquad(e, dt) {
  const men = e.men, alive = aliveMen(e);
  if (!alive.length) { killSquad(e); return; }
  const w = e.w;
  e.overtop = Math.max(0, e.overtop - dt);
  for (const k in e.abCd) e.abCd[k] = Math.max(0, e.abCd[k] - dt);
  // suppression recovers when nobody is shooting at us
  if (GAME.t - (e.lastSupp || -99) > 1.5) e.supp = Math.max(0, e.supp - dt * (0.09 + (e.cover || 0) * 0.08));
  if (e.overtop > 0) e.supp = Math.min(e.supp, 0.3);
  if (!e.broken && e.supp >= 1 && !e.retreat) {
    e.broken = true;
    if (e.team === 0) alertMsg(`${e.def.name} have broken and are running!`, 'bad', e);
    giveOrder(e, { t: 'retreat' });
  }
  if (e.reinf > 0) {
    e.reinfT -= dt;
    if (e.reinfT <= 0) {
      if (alive.length < e.def.men && nearHeal(e)) {
        const dead = men.find((m) => !m.alive);
        const k = dead ? dead.k : men.length;
        if (dead) men.splice(men.indexOf(dead), 1);
        const m = addMan(e, k); const h = nearHeal(e); m.x = h.x; m.z = h.z;
        sfx('click', e.x, e.z, 0.4);
      } else TEAMS[e.team].supply += reinforceCost(e);
      e.reinf--; e.reinfT = 2.5;
    }
  }
  const o = e.order;
  let moving = false;
  // team weapons must pack up to move
  const crew = e.def.crew;
  if (o && (o.t === 'move' || o.t === 'retreat') && e.path) {
    if (crew && e.setup > 0) { e.setup = Math.max(0, e.setup - dt * 1.5); }
    else moving = moveAlong(e, dt, squadSpeed(e));
  }
  if (o && o.t === 'move' && !e.path) {
    if (o.face !== undefined) e.face = o.face;
    nextOrder(e);
  }
  if (o && o.t === 'retreat' && !e.path) {
    e.retreat = false;
    if (e.broken) { e.broken = false; e.supp = 0.2; }
    nextOrder(e);
  }
  // engineering work, abilities and barrages
  if (o && o.t === 'attack') moving = attackChase(e, dt) || moving;
  if (o && (o.t === 'dig' || o.t === 'wire' || o.t === 'build' || o.t === 'repair' || o.t === 'cut')) moving = workUpdate(e, dt) || moving;
  if (o && o.t === 'ability') moving = abilityUpdate(e, dt) || moving;
  if (o && o.t === 'ground') moving = groundUpdate(e, dt) || moving;
  e.moving = moving;
  if (moving) { e.idleT = 0; e.coverDone = false; } else e.idleT = (e.idleT || 0) + dt;
  // stuck detection
  if (e.path) {
    if (dist2(e.x, e.z, e.lastX, e.lastZ) < 0.04) { e.stuckT += dt; if (e.stuckT > 3) { const l = e.path[e.path.length - 1]; if (!setPath(e, l.x, l.z) || e.stuckT > 6) { e.path = null; e.stuckT = 0; } } }
    else { e.stuckT = 0; e.lastX = e.x; e.lastZ = e.z; }
  }
  // set up team weapon when stationary
  if (crew && !moving && !e.retreat) {
    if (e.setup <= 0) { e.wx = e.x; e.wz = e.z; if (crew === 'fgun' || crew === 'skoda') e.gunAng = e.face ?? e.ang; }
    e.setup = Math.min(1, e.setup + dt / (w.setup || 1));
  }
  // cover position for the squad's centre
  e.cover = coverAt(e.x, e.z);
  // healing near HQ / depots
  if (!moving && GAME.t - e.lastHit > 6 && (e.healT = (e.healT || 0) - dt) <= 0) {
    e.healT = 1;
    if (nearHeal(e)) for (const m of alive) m.hp = Math.min(e.def.hp, m.hp + 4);
  }
  // targeting and fire
  if (!e.retreat) squadCombat(e, dt, moving);
  // men follow their slots
  placeMen(e, dt, moving);
  if (e.wmesh) placeWeapon(e, dt);
  // veterancy
  const vx = VET_XP.squad;
  const nv = e.xp >= vx[2] ? 3 : e.xp >= vx[1] ? 2 : e.xp >= vx[0] ? 1 : 0;
  if (nv > e.vet) { e.vet = nv; if (e.team === 0) alertMsg(`${e.def.name} reached veterancy ${'★'.repeat(nv)}`, 'good', e); }
}
function nearHeal(e) {
  for (const b of ENTS) if (b.kind === 'bld' && !b.dead && b.team === e.team && b.def.heal && b.built >= 1 && dist2(b.x, b.z, e.x, e.z) < 28 * 28) return b;
  return null;
}
function reinforceCost(e) { return Math.round(e.def.cost / e.def.men * 0.55); }
function canReinforce(e) { return e.kind === 'squad' && aliveMen(e).length + e.reinf < e.def.men && !!nearHeal(e); }
function doReinforce(e) {
  if (!canReinforce(e)) return false;
  const c = reinforceCost(e), T = TEAMS[e.team];
  if (T.supply < c) return false;
  T.supply -= c; e.reinf++; if (e.reinfT <= 0) e.reinfT = 2.5;
  return true;
}

// Men walk to formation slots while moving, or to cover positions once the squad has stopped.
function placeMen(e, dt, moving) {
  const alive = aliveMen(e);
  const n = alive.length;
  const ang = moving ? e.ang : (e.face ?? e.ang);
  if (!moving && !e.coverDone && e.idleT > 0.2) { assignCover(e, alive); e.coverDone = true; }
  const c = Math.cos(ang), s = Math.sin(ang);
  const crew = e.def.crew;
  const pinned = e.supp >= 0.6 && e.overtop <= 0;
  for (let k = 0; k < n; k++) {
    const m = alive[k];
    let tx, tz;
    if (crew && e.setup > 0 && !moving) {
      const a = e.gunAng, ca = Math.cos(a), sa = Math.sin(a);
      const slots = [[0, -1.0], [1.1, -0.6], [-1.1, -0.7], [0.6, -2], [-0.7, -2.1]];
      const [ox, oz] = slots[k % slots.length];
      tx = e.wx + ox * ca + oz * sa; tz = e.wz - ox * sa + oz * ca;
    } else if (!moving && m.cx !== undefined && e.coverDone) { tx = m.cx; tz = m.cz; }
    else {
      const [ox, oz] = formSlot(k, n);
      tx = e.x + ox * c + oz * s; tz = e.z - ox * s + oz * c;
      if (!passableAt(0, tx, tz)) { tx = e.x; tz = e.z; }
    }
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    const sp = (moving ? squadSpeed(e) * 1.35 : 3.2) * (e.retreat ? 1.1 : 1);
    if (d > 0.12) {
      const st = Math.min(d, sp * dt * (d > 4 ? 1.6 : 1) * speedAt(0, m.x, m.z) / Math.max(0.3, speedAt(0, e.x, e.z)));
      m.x += (dx / d) * st; m.z += (dz / d) * st;
      m.ang = turnTo(m.ang, Math.atan2(dx, dz), dt * 8);
      m.moving = d > 0.25;
      m.ph += dt * 9;
    } else m.moving = false;
    m.y = groundH(m.x, m.z);
    // face the enemy when stopped
    if (!m.moving) {
      const tg = e.tgt && BYID.get(e.tgt);
      const fa = tg ? Math.atan2(tg.x - m.x, tg.z - m.z) : crew && e.setup > 0 ? e.gunAng : ang;
      m.ang = turnTo(m.ang, fa, dt * 4);
    }
    const inCov = coverAt(m.x, m.z);
    m.pose = m.moving ? (Math.sin(m.ph) > 0 ? 'walkA' : 'walkB') : pinned || (crew === 'mg' && e.setup >= 1 && k === 0) ? 'prone'
      : (inCov >= 0.3 || GAME.t - e.lastFire < 3 || crew) ? 'kneel' : 'stand';
  }
}
function assignCover(e, alive) {
  for (const m of alive) { m.cx = undefined; }
  if (e.def.crew && e.def.crew !== 'mg') return;
  const cands = [];
  const ci = Math.floor(e.x / CS), cj = Math.floor(e.z / CS);
  for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= MAP.cw || j >= MAP.ch) continue;
    const c = j * MAP.cw + i;
    const cv = coverAt(cellX(c), cellZ(c));
    if (cv < 0.28 || MAP.cost[0][c] <= 0 || (MAP.flags[c] & F.WIRE)) continue;
    const d = Math.hypot(cellX(c) - e.x, cellZ(c) - e.z);
    if (d > 13) continue;
    const per = cv >= 0.7 ? 2 : 1;
    for (let q = 0; q < per; q++) {
      const ox = per === 2 ? (q ? 0.9 : -0.9) : (hash2(c, 5) - 0.5) * 1.6, oz = per === 2 ? (q ? -0.5 : 0.5) : (hash2(c, 9) - 0.5) * 1.6;
      cands.push({ x: cellX(c) + ox, z: cellZ(c) + oz, s: cv * 10 - d * 0.35, used: false });
    }
  }
  if (!cands.length) return;
  cands.sort((a, b) => b.s - a.s);
  // only use cover that's genuinely around us; squads in the open just spread out
  const top = cands.slice(0, Math.max(alive.length + 2, 6));
  for (const m of alive) {
    let best = null, bd = 1e9;
    for (const c of top) { if (c.used) continue; const d = dist2(c.x, c.z, m.x, m.z) - c.s * 3; if (d < bd) { bd = d; best = c; } }
    if (best) { best.used = true; m.cx = best.x; m.cz = best.z; }
  }
}
function placeWeapon(e, dt) {
  const wm = e.wmesh, crew = e.def.crew;
  const towed = crew === 'fgun' || crew === 'skoda';
  if (!towed && (e.setup <= 0 || e.moving)) { wm.visible = false; return; }
  wm.visible = e.vis;
  const tg = e.tgt && BYID.get(e.tgt);
  let want = e.gunAng;
  if (tg) want = Math.atan2(tg.x - e.wx, tg.z - e.wz);
  else if (e.barrage) want = Math.atan2(e.barrage.x - e.wx, e.barrage.z - e.wz);
  else if (e.groundT) want = Math.atan2(e.groundT.x - e.wx, e.groundT.z - e.wz);
  if (towed && (e.moving || e.setup <= 0)) { e.wx = e.x; e.wz = e.z; e.gunAng = e.ang + Math.PI; }
  else e.gunAng = turnTo(e.gunAng, want, dt * (crew === 'skoda' ? 0.3 : crew === 'fgun' ? 0.6 : 1.4));
  wm.position.set(e.wx, groundH(e.wx, e.wz), e.wz);
  wm.rotation.y = e.gunAng;
}

function killSquad(e) {
  if (e.dead) return;
  removeEnt(e);
  if (e.wmesh) {
    // the abandoned weapon stays on the field as a wreck for a while
    const m = e.wmesh; m.visible = true;
    m.material = MAT.vc; entGroup.add(m);
    later(60, () => entGroup.remove(m));
  }
  e.gone = true;
}

// ---------- vehicles ----------
function updateVeh(e, dt) {
  const def = e.def;
  for (const wp of e.wpn) wp.cd = Math.max(0, wp.cd - dt);
  const o = e.order;
  let moving = false;
  if (e.broken > 0) {
    e.broken -= dt;
    if (e.broken <= 0) { e.broken = 0; if (e.smoke) { e.smoke.life = 0.01; e.smoke = null; } if (e.team === 0) alertMsg(`${def.name} is running again`, 'good', e); }
  }
  if (o && (o.t === 'move' || o.t === 'attack') && e.path && e.broken <= 0) {
    const wp = e.path[e.pi];
    if (wp) {
      const dx = wp.x - e.x, dz = wp.z - e.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz), da = angWrap(want - e.ang);
      const turn = def.cls === 'wheel' ? 1.6 : def.model === 'ft' ? 1.1 : 0.6;
      e.ang = turnTo(e.ang, want, dt * turn);
      const vmax = def.speed * speedAt(e.cls, e.x, e.z, def.trench || 2) * (1 - WEATHER.rain * (def.cls === 'wheel' ? 0.3 : 0.22));
      const vt = Math.abs(da) > 0.7 ? 0 : vmax * (1 - Math.abs(da) / 1.2);
      e.v = lerp(e.v, vt, 1 - Math.exp(-dt * 2));
      if (d < Math.max(e.v * dt, 0.7)) { e.pi++; if (e.pi >= e.path.length) { e.path = null; } }
      else {
        const nx = e.x + Math.sin(e.ang) * e.v * dt, nz = e.z + Math.cos(e.ang) * e.v * dt;
        if (passableAt(e.cls, nx, nz)) { e.x = nx; e.z = nz; }
        else { const l = e.path[e.path.length - 1]; if (!setPath(e, l.x, l.z)) e.path = null; e.v = 0; }
      }
      moving = true;
    } else e.path = null;
  } else e.v = lerp(e.v, 0, 1 - Math.exp(-dt * 3));
  if (o && o.t === 'move' && !e.path) nextOrder(e);
  if (o && o.t === 'attack') attackChase(e, dt);
  e.moving = moving && e.v > 0.2;
  if (e.path) {
    if (dist2(e.x, e.z, e.lastX, e.lastZ) < 0.02) { e.stuckT += dt; if (e.stuckT > 4) { const l = e.path[e.path.length - 1]; if (!setPath(e, l.x, l.z) || e.stuckT > 8) { e.path = null; e.stuckT = 0; } } }
    else { e.stuckT = 0; e.lastX = e.x; e.lastZ = e.z; }
  }
  // tracks crush wire; tanks roll over infantry
  if (e.moving && e.cls === 2) {
    const c = cellIdx(e.x, e.z);
    if (MAP.flags[c] & F.WIRE) { setWire(c, false); sfx('crunch', e.x, e.z, 0.6); }
    for (const t of MAP.trees) if (t.alive && dist2(t.x, t.z, e.x, e.z) < 9) shatterTree(t, false);
    if ((e.crushT = (e.crushT || 0) - dt) <= 0) {
      e.crushT = 0.25;
      for (const o2 of ENTS) {
        if (o2.dead || o2.kind !== 'squad' || o2.team === e.team) continue;
        if (dist2(o2.x, o2.z, e.x, e.z) > 100) continue;
        for (const m of o2.men) if (m.alive && dist2(m.x, m.z, e.x, e.z) < (def.rad * 0.8) ** 2) { hurtMan(o2, m, 80, e); addSupp(o2, 0.2); }
      }
    }
  }
  // breakdowns: early tanks were notoriously unreliable
  if (e.moving && def.cls === 'track' && def.model !== 'ft' && e.broken <= 0 && Math.random() < dt * 0.0035 * (1 + WEATHER.rain * 1.5)) {
    e.broken = 25; e.path = null;
    e.smoke = addEmitter({ kind: 'engine', ent: e, dy: 2.5, rate: 3, size: 1.4, dark: 0.15 });
    if (e.team === 0) alertMsg(`${def.name} has broken down! Engineers can repair it`, 'bad', e);
  }
  if (e.moving && (e.exT -= dt) <= 0) { e.exT = 0.25; exhaust(e.x - Math.sin(e.ang) * def.rad, groundH(e.x, e.z) + 2.4, e.z - Math.cos(e.ang) * def.rad); }
  vehCombat(e, dt);
  // workshop repairs
  if ((e.healT = (e.healT || 0) - dt) <= 0) {
    e.healT = 1;
    for (const b of ENTS) if (b.kind === 'bld' && b.def.repair && !b.dead && b.team === e.team && b.built >= 1 && dist2(b.x, b.z, e.x, e.z) < 26 * 26) { e.hp = Math.min(e.maxhp, e.hp + 10); if (e.broken > 0) e.broken = Math.min(e.broken, 1); }
  }
  // place mesh
  const y = groundH(e.x, e.z);
  const fy = groundH(e.x + Math.sin(e.ang) * 2.5, e.z + Math.cos(e.ang) * 2.5), by = groundH(e.x - Math.sin(e.ang) * 2.5, e.z - Math.cos(e.ang) * 2.5);
  e.pitch = lerp(e.pitch || 0, clamp(Math.atan2(by - fy, 5), -0.35, 0.35), 1 - Math.exp(-dt * 4));
  e.y = y;
  e.mesh.position.set(e.x, y + (e.moving ? Math.sin(GAME.t * 18) * 0.03 : 0), e.z);
  e.mesh.rotation.set(e.pitch, e.ang, 0, 'YXZ');
  if (e.model.turret) e.model.turret.rotation.y = e.turretAng;
  const vx = VET_XP.veh;
  const nv = e.xp >= vx[2] ? 3 : e.xp >= vx[1] ? 2 : e.xp >= vx[0] ? 1 : 0;
  if (nv > e.vet) { e.vet = nv; if (e.team === 0) alertMsg(`${def.name} reached veterancy ${'★'.repeat(nv)}`, 'good', e); }
}

// Light push-apart between units so they don't stack.
function separate(dt) {
  const n = ENTS.length;
  for (let i = 0; i < n; i++) {
    const a = ENTS[i];
    if (a.dead || a.kind === 'bld') continue;
    const ra = a.kind === 'veh' ? a.def.rad : 1.6;
    for (let j = i + 1; j < n; j++) {
      const b = ENTS[j];
      if (b.dead || b.kind === 'bld') continue;
      if (a.kind === 'squad' && b.kind === 'squad') continue;
      const rb = b.kind === 'veh' ? b.def.rad : 1.6;
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, R = ra + rb;
      if (d2 >= R * R || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (R - d) * 0.5 * Math.min(1, dt * 4);
      const ux = dx / d, uz = dz / d;
      const aw = a.kind === 'veh' ? (b.kind === 'veh' ? 0.5 : 0.1) : 0.9, bw = 1 - aw;
      const ax = a.x - ux * push * aw * 2, az = a.z - uz * push * aw * 2, bx = b.x + ux * push * bw * 2, bz = b.z + uz * push * bw * 2;
      if (passableAt(a.cls, ax, az)) { a.x = ax; a.z = az; }
      if (passableAt(b.cls, bx, bz)) { b.x = bx; b.z = bz; }
    }
  }
}

// ---------- buildings ----------
function updateBld(e, dt) {
  const T = TEAMS[e.team];
  if (e.built < 1) return;
  if (e.queue.length) {
    const q = e.queue[0], def = UNITS[q.type];
    if (T.pop + def.pop <= T.popCap || q.t > 0) {
      q.t += dt * (GAME.cheatFast ? 20 : 1) * (T.ai ? AI_SPEED[T.aiDiff || 'normal'] : 1);
      if (q.t >= def.time) {
        e.queue.shift();
        const [hw, hd] = footprint(e.type, e.ang);
        const sx = e.x + Math.sin(e.ang) * (hd + 3), sz = e.z + Math.cos(e.ang) * (hd + 3);
        const u = spawnUnit(q.type, e.team, sx, sz, e.ang);
        T.stats.trained++;
        if (e.rally) giveOrder(u, { t: 'move', x: e.rally.x + frand(-3, 3), z: e.rally.z + frand(-3, 3) });
        if (e.team === 0) { alertMsg(`${def.name} ready`, '', u); sfx('click', e.x, e.z, 0.6); }
        if (T.ai && AIS[e.team]) aiUnitReady(AIS[e.team], u);
      }
    } else q.blocked = true;
  }
  if (e.research) {
    e.research.t += dt * (GAME.cheatFast ? 20 : 1);
    const R = RESEARCH[e.research.k];
    if (e.research.t >= R.time) {
      T.research[e.research.k] = true; T.researching = null;
      if (e.team === 0) { alertMsg(`Research complete: ${R.name}`, 'good'); sfx('bugle', e.x, e.z, 0.5); }
      e.research = null;
    }
  }
}
function queueUnit(b, type) {
  const T = TEAMS[b.team], def = UNITS[type];
  if (b.built < 1 || b.dead || b.queue.length >= 5) return false;
  if (T.supply < def.cost) return false;
  T.supply -= def.cost;
  b.queue.push({ type, t: 0 });
  return true;
}
function cancelQueue(b, i) {
  const q = b.queue[i];
  if (!q) return;
  TEAMS[b.team].supply += UNITS[q.type].cost;
  b.queue.splice(i, 1);
}
function startResearch(b, k) {
  const T = TEAMS[b.team], R = RESEARCH[k];
  if (T.research[k] || T.researching || b.research || T.supply < R.cost) return false;
  T.supply -= R.cost; T.researching = k; b.research = { k, t: 0 };
  return true;
}
function destroyBld(e, killer) {
  if (e.dead) return;
  removeEnt(e);
  e.gone = true;
  entGroup.remove(e.mesh);
  const [hw, hd] = footprint(e.type, e.ang);
  const rub = new THREE.Mesh(rubbleGeo(hw * 2, hd * 2, e.id), MAT.vc);
  rub.position.set(e.x, e.y, e.z); rub.rotation.y = e.ang; rub.castShadow = rub.receiveShadow = true;
  entGroup.add(rub);
  for (const c of e.cells) { MAP.flags[c] = (MAP.flags[c] & ~F.BLOCK) | F.RUIN; MAP.occ[c] = 0; computeCost(c); }
  for (let k = 0; k < 4; k++) addEmitter({ kind: 'fire', x: e.x + frand(-hw, hw) * 0.7, y: e.y + 0.5, z: e.z + frand(-hd, hd) * 0.7, life: frand(20, 40), rate: 5, size: 1.6 });
  explosionFX(e.x, e.z, 6); sfx('bigexplode', e.x, e.z, 1); addShake(0.5, e.x, e.z);
  const T = TEAMS[e.team];
  T.stats.bldLost++;
  if (killer !== undefined && killer >= 0) TEAMS[killer].stats.kills++;
  if (e.team === 0) alertMsg(`${e.def.name} destroyed!`, 'bad', e);
  else alertMsg(`Enemy ${e.def.name} destroyed`, 'good', e);
  for (const q of e.queue) T.supply += UNITS[q.type].cost;
  if (e.research) T.researching = null;
}

// ---------- engineering ----------
function doneCell(kind, c) { return kind === 'dig' ? !!(MAP.flags[c] & F.TRENCH) : !!(MAP.flags[c] & F.WIRE); }
function orderLine(list, kind, cells) {
  const engs = list.filter((e) => e.kind === 'squad' && e.def.eng && !e.dead);
  if (!engs.length || !cells.length) return 0;
  const T = TEAMS[engs[0].team];
  const per = ABIL[kind === 'dig' ? 'trench' : 'wire'].costPer;
  const valid = cells.filter((c) => !(MAP.flags[c] & (F.WATER | F.BLOCK | F.BRIDGE)) && !doneCell(kind, c) && !(kind === 'wire' && (MAP.flags[c] & F.TRENCH)));
  const afford = Math.min(valid.length, Math.floor(T.supply / per));
  if (afford <= 0) return 0;
  const use = valid.slice(0, afford);
  T.supply -= use.length * per;
  // split the line between the engineer squads
  const chunk = Math.ceil(use.length / engs.length);
  engs.forEach((e, i) => {
    const part = use.slice(i * chunk, (i + 1) * chunk);
    if (part.length) giveOrder(e, { t: kind, cells: part, prog: {} });
  });
  return use.length;
}
function orderBuild(list, type, x, z, rot) {
  const engs = list.filter((e) => e.kind === 'squad' && e.def.eng && !e.dead);
  if (!engs.length) return null;
  const T = TEAMS[engs[0].team], def = BLDS[type];
  if (T.supply < def.cost) return null;
  if (canPlace(type, engs[0].team, x, z, rot)) return null;
  T.supply -= def.cost;
  const b = spawnBuilding(type, engs[0].team, x, z, rot, 0);
  for (const e of engs) giveOrder(e, { t: 'build', id: b.id });
  return b;
}
function workSpot(e, x, z, r) {
  // walk to a passable spot next to the job
  const a = Math.atan2(e.x - x, e.z - z);
  for (let k = 0; k < 8; k++) {
    const aa = a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.7;
    const px = x + Math.sin(aa) * r, pz = z + Math.cos(aa) * r;
    if (passableAt(0, px, pz) && !(MAP.flags[cellIdx(px, pz)] & F.WIRE)) return { x: px, z: pz };
  }
  return { x, z };
}
function workUpdate(e, dt) {
  const o = e.order, men = aliveMen(e).length, rate = men / 4;
  let jx, jz, r = 3;
  if (o.t === 'dig' || o.t === 'wire') {
    o.cells = o.cells.filter((c) => !doneCell(o.t, c) && !(MAP.flags[c] & (F.BLOCK | F.WATER)));
    if (!o.cells.length) { nextOrder(e); return false; }
    // nearest unfinished cell
    let best = o.cells[0], bd = 1e18;
    for (const c of o.cells) { const d = dist2(cellX(c), cellZ(c), e.x, e.z); if (d < bd) { bd = d; best = c; } }
    o.cur = best; jx = cellX(best); jz = cellZ(best); r = o.t === 'dig' ? 1.5 : 3.2;
    if (o.t === 'dig') { jx = cellX(best); jz = cellZ(best); }
  } else if (o.t === 'build' || o.t === 'repair') {
    const b = BYID.get(o.id);
    if (!b || b.dead) { nextOrder(e); return false; }
    if (o.t === 'build' && b.built >= 1) { nextOrder(e); return false; }
    if (o.t === 'repair' && b.hp >= b.maxhp && !(b.broken > 0)) { nextOrder(e); return false; }
    jx = b.x; jz = b.z; r = b.kind === 'bld' ? Math.max(...footprint(b.type, b.ang)) + 2 : b.def.rad + 1.5;
  } else if (o.t === 'cut') {
    if (!(MAP.flags[o.c] & F.WIRE)) { nextOrder(e); return false; }
    jx = cellX(o.c); jz = cellZ(o.c); r = 3.2;
  }
  const d = Math.hypot(jx - e.x, jz - e.z);
  if (d > r + 1.5) {
    if (!e.path || o.goal !== (o.cur ?? o.id ?? o.c)) {
      const s = o.t === 'dig' ? { x: jx, z: jz } : workSpot(e, jx, jz, r);
      setPath(e, s.x, s.z); o.goal = o.cur ?? o.id ?? o.c;
      if (!e.path) { nextOrder(e); return false; }
    }
    return moveAlong(e, dt, squadSpeed(e));
  }
  e.path = null;
  e.face = Math.atan2(jx - e.x, jz - e.z);
  // working
  if (o.t === 'dig' || o.t === 'wire') {
    const need = o.t === 'dig' ? 3.5 : 2.5;
    o.prog[o.cur] = (o.prog[o.cur] || 0) + dt * rate * (GAME.cheatFast ? 10 : 1);
    if (Math.random() < dt * 3) sfx('dig', jx, jz, 0.5);
    if (Math.random() < dt * 4) dirtKick(jx + frand(-1.5, 1.5), jz + frand(-1.5, 1.5), 1);
    if (o.prog[o.cur] >= need) { if (o.t === 'dig') dig(o.cur, true); else setWire(o.cur, true); }
  } else if (o.t === 'build') {
    const b = BYID.get(o.id);
    b.built = Math.min(1, b.built + dt * rate / b.def.time * (GAME.cheatFast ? 20 : 1));
    b.hp = Math.min(b.maxhp, b.hp + b.maxhp * dt * rate / b.def.time * 0.9);
    if (Math.random() < dt * 3) sfx('build', b.x, b.z, 0.5);
    setBuiltLook(b);
    if (b.built >= 1) {
      b.hp = Math.max(b.hp, b.maxhp * 0.6);
      if (b.team === 0) { alertMsg(`${b.def.name} complete`, 'good', b); sfx('bugle', b.x, b.z, 0.4); }
      if (TEAMS[b.team].ai && AIS[b.team]) aiBuildingDone(AIS[b.team], b);
      nextOrder(e);
    }
  } else if (o.t === 'repair') {
    const b = BYID.get(o.id);
    b.hp = Math.min(b.maxhp, b.hp + dt * 14 * rate);
    if (b.broken > 0) b.broken = Math.max(0, b.broken - dt * 6 * rate);
    if (Math.random() < dt * 3) { sfx('build', b.x, b.z, 0.5); sparks(b.x + frand(-1, 1), (b.y || 0) + 1.5, b.z + frand(-1, 1), 2); }
  } else if (o.t === 'cut') {
    o.prog = (o.prog || 0) + dt * rate;
    if (o.prog > 2.5) { setWire(o.c, false); sfx('wirecut', jx, jz, 0.8); nextOrder(e); }
  }
  return false;
}

// ---------- rendering ----------
const _mm = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _sc = new V3(MAN_SCALE, MAN_SCALE, MAN_SCALE), _pp = new V3();
function syncRender() {
  const counts = {};
  for (const n in MEN_IM) { counts[n] = {}; for (const p of SOLDIER_POSES) counts[n][p] = 0; }
  const put = (n, pose, x, y, z, ang, s = 1) => {
    const im = MEN_IM[n] && MEN_IM[n][pose];
    if (!im) return;
    const i = counts[n][pose];
    if (i >= im.instanceMatrix.count) return;
    _qq.setFromAxisAngle(UP, ang);
    _sc.setScalar(MAN_SCALE * s);
    _mm.compose(_pp.set(x, y, z), _qq, _sc);
    im.setMatrixAt(i, _mm);
    counts[n][pose] = i + 1;
  };
  for (const e of ENTS) {
    if (e.dead) continue;
    if (e.kind === 'squad') {
      if (!e.vis) { if (e.wmesh) e.wmesh.visible = false; continue; }
      for (const m of e.men) if (m.alive) put(e.nation, m.pose, m.x, m.y, m.z, m.ang);
    } else {
      e.mesh.visible = e.kind === 'bld' ? e.seen : e.vis;
    }
  }
  for (const c of CORPSES) {
    if (!c.seen) { c.seen = visibleTo(0, c.x, c.z); if (!c.seen) continue; }
    const sink = c.t > 120 ? (c.t - 120) / 30 : 0;
    put(c.n, 'dead', c.x, c.y - sink * 0.6, c.z, c.ang);
  }
  for (const n in MEN_IM) for (const p of SOLDIER_POSES) { const im = MEN_IM[n][p]; im.count = counts[n][p]; im.instanceMatrix.needsUpdate = true; }
  // selection rings
  let r = 0;
  const ring = (x, z, rad, col) => {
    if (r >= 400) return;
    _mm.compose(_pp.set(x, groundH(x, z) + 0.25, z), _qq.identity(), _sc.set(rad, 1, rad));
    RINGS.setMatrixAt(r, _mm);
    _col.set(col); RINGS.instanceColor.setXYZ(r, _col.r, _col.g, _col.b);
    r++;
  };
  for (const e of SEL) {
    if (e.dead) continue;
    if (e.kind === 'squad') for (const m of e.men) { if (m.alive) ring(m.x, m.z, 0.75, '#7dff7a'); }
    else if (e.kind === 'veh') ring(e.x, e.z, e.def.rad + 0.8, '#7dff7a');
    else ring(e.x, e.z, Math.max(...footprint(e.type, e.ang)) + 1.5, '#7dff7a');
  }
  if (UI.hover && !UI.hover.dead && !SEL.includes(UI.hover) && (UI.hover.vis || UI.hover.seen)) {
    const h = UI.hover, col = h.team === 0 ? '#bfffbf' : '#ff8a7a';
    if (h.kind === 'squad') for (const m of h.men) { if (m.alive) ring(m.x, m.z, 0.7, col); }
    else ring(h.x, h.z, h.kind === 'veh' ? h.def.rad + 0.8 : Math.max(...footprint(h.type, h.ang)) + 1.5, col);
  }
  RINGS.count = r; RINGS.instanceMatrix.needsUpdate = true; RINGS.instanceColor.needsUpdate = true;
}

function clearEntities() {
  for (const e of ENTS) { if (e.mesh) entGroup.remove(e.mesh); if (e.wmesh) entGroup.remove(e.wmesh); }
  while (entGroup.children.length) entGroup.remove(entGroup.children[0]);
  ENTS = []; BYID.clear(); CORPSES = []; SEL.length = 0;
}
