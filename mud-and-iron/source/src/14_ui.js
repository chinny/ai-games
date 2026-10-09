// Mud & Iron — interface: menus, HUD, selection panel, command card, powers, minimap, overlay drawing,
// selection and command input.

const UI = {
  hover: null, mode: null, md: null, drag: null, groups: {}, lastClick: { t: 0, id: 0 }, lastGroup: { k: '', t: 0 }, alertPos: null, menu: null,
  mx: 0, my: 0, inView: false, markers: [], card: [], cardSig: '', panelSig: '', ghost: null, tipFor: null, setup: null, camp: null, alerts: [],
};
const hudEl = {
  supply: $('#supply'), income: $('#income'), pop: $('#pop'), obj: $('#objWrap'), weather: $('#weatherTag'), powers: $('#powers'), alerts: $('#alerts'),
  sel: $('#selPanel'), cmd: $('#cmd'), tip: $('#tip'), banner: $('#banner'), hint: $('#modeHint'), speed: $('#speedBtn'),
};

// ---------- messages ----------
function alertMsg(text, cls = '', at) {
  if (GAME.state !== 'play') return;
  const now = performance.now();
  const last = UI.alerts.find((a) => a.text === text && now - a.t < 3000);
  if (last) return;
  const el = document.createElement('div');
  el.className = 'al ' + cls; el.textContent = text;
  hudEl.alerts.appendChild(el);
  UI.alerts.push({ text, t: now, el });
  while (hudEl.alerts.children.length > 5) hudEl.alerts.removeChild(hudEl.alerts.firstChild);
  setTimeout(() => el.classList.add('out'), 5200);
  setTimeout(() => el.remove(), 5900);
  if (at) UI.alertPos = { x: at.x, z: at.z, t: now };
  if (cls === 'bad' && at) { UI.pings = UI.pings || []; UI.pings.push({ x: at.x, z: at.z, t: 0 }); }
}
let bannerT = 0;
function banner(title, sub) {
  hudEl.banner.innerHTML = title + (sub ? `<small>${sub}</small>` : '');
  hudEl.banner.classList.add('on');
  bannerT = 3.2;
}

// ---------- menus ----------
function showScreen(id) {
  for (const s of ['title', 'setup', 'camp', 'brief', 'help', 'pause', 'end']) $('#' + s).hidden = s !== id;
}
function flagHTML(n) { return `<div class="flag">${NATIONS[n].flag.map((c) => `<i style="background:${c}"></i>`).join('')}</div>`; }
function nationCards(el, sel, onPick) {
  el.innerHTML = NATION_IDS.map((k) => {
    const N = NATIONS[k];
    return `<div class="nat${k === sel ? ' sel' : ''}" data-n="${k}">${flagHTML(k)}<h2 class="fell">${N.name}</h2><div class="side">${N.side}</div><p>${N.blurb}</p></div>`;
  }).join('');
  el.querySelectorAll('.nat').forEach((d) => d.onclick = () => { sfx('click'); onPick(d.dataset.n); });
}
function segOpt(label, key, opts, cfg, onChange) {
  const div = document.createElement('div'); div.className = 'opt';
  div.innerHTML = `<label>${label}</label><div class="seg">${opts.map(([v, t]) => `<button data-v="${v}" class="${String(cfg[key]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  div.querySelectorAll('button').forEach((b) => b.onclick = () => {
    cfg[key] = b.dataset.v === 'true' ? true : b.dataset.v === 'false' ? false : b.dataset.v;
    div.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    sfx('click'); if (onChange) onChange();
  });
  return div;
}
function openSetup(mode) {
  audioInit();
  const prev = UI.setup && UI.setup.mode === mode ? UI.setup : null;
  const cfg = prev || { mode, nation: (UI.setup && UI.setup.nation) || 'gb', enemy: 'random', size: 'm', diff: 'normal', weather: 'dynamic', fog: true, seed: Math.floor(Math.random() * 99999) };
  cfg.mode = mode;
  UI.setup = cfg;
  $('#setupTitle').textContent = MODES[mode].name;
  $('#setupDesc').textContent = MODES[mode].desc;
  const render = () => {
    nationCards($('#nations'), cfg.nation, (n) => { cfg.nation = n; cfg.enemy = 'random'; render(); });
    const o = $('#opts'); o.innerHTML = '';
    if (mode !== 'survival') o.appendChild(segOpt('Map size', 'size', mode === 'frontline' ? [['s', 'Small'], ['m', 'Large']] : [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], cfg));
    const en = enemiesOf(cfg.nation);
    o.appendChild(segOpt('Enemy', 'enemy', [['random', 'Random']].concat(en.map((k) => [k, NATIONS[k].name])), cfg));
    o.appendChild(segOpt('Difficulty', 'diff', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], cfg));
    o.appendChild(segOpt('Weather', 'weather', [['clear', 'Clear'], ['overcast', 'Grey'], ['rain', 'Rain'], ['dynamic', 'Changing']], cfg));
    o.appendChild(segOpt('Fog of war', 'fog', [[true, 'On'], [false, 'Off']], cfg));
    const sd = document.createElement('div'); sd.className = 'opt';
    sd.innerHTML = `<label>Map seed</label><div class="seedRow"><input id="seedIn" type="number" value="${cfg.seed}"><button class="tbtn" id="seedDice" title="New random seed">Random</button></div>`;
    o.appendChild(sd);
    sd.querySelector('#seedIn').onchange = (ev) => { cfg.seed = Math.abs(parseInt(ev.target.value, 10) || 0); };
    sd.querySelector('#seedDice').onclick = () => { cfg.seed = Math.floor(Math.random() * 99999); sd.querySelector('#seedIn').value = cfg.seed; };
  };
  render();
  showScreen('setup');
}
function launch(cfg) {
  const c = { ...cfg };
  if (c.enemy === 'random' || !c.enemy || SIDE_OF[c.enemy] === SIDE_OF[c.nation]) c.enemy = fpick(enemiesOf(c.nation));
  $('#loading').hidden = false;
  showScreen(null);
  setTimeout(() => {
    try { startMatch(c); } finally { $('#loading').hidden = true; }
    document.body.dataset.state = 'play';
    UI.mode = null; SEL.length = 0; UI.cardSig = ''; UI.panelSig = '';
    buildMinimapBase();
    hudEl.alerts.innerHTML = '';
    const M = GAME.M;
    banner(c.mode === 'campaign' ? M.name : MODES[c.mode].name, c.mode === 'campaign' ? M.when : `${NATIONS[c.nation].name} vs ${NATIONS[c.enemy].name}`);
    if (GAME.hint) setTimeout(() => alertMsg(GAME.hint), 2500);
  }, 30);
}
function campProgress() { try { return JSON.parse(localStorage.getItem('mi-camp') || '{}'); } catch (e) { return {}; } }
function openCampaign() {
  audioInit();
  const cfg = UI.camp || { nation: (UI.setup && UI.setup.nation) || 'gb', diff: 'normal' };
  UI.camp = cfg;
  const render = () => {
    const el = $('#campNations');
    el.innerHTML = '<div id="nations2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px"></div>';
    nationCards($('#nations2'), cfg.nation, (n) => { cfg.nation = n; render(); });
    const o = document.createElement('div'); o.className = 'opts'; o.style.marginTop = '12px';
    o.appendChild(segOpt('Difficulty', 'diff', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], cfg));
    el.appendChild(o);
    const prog = campProgress();
    $('#missions').innerHTML = MISSIONS.map((m, i) => `<div class="mis" data-i="${i}"><div class="no fell">${i + 1}</div><div><h2 class="fell">${m.name}</h2><div class="when">${m.when}</div><p>${m.obj[0]}</p></div><div class="medal">${prog[i] ? 'Completed' : ''}</div></div>`).join('');
    $('#missions').querySelectorAll('.mis').forEach((d) => d.onclick = () => { sfx('click'); openBrief(+d.dataset.i); });
  };
  render();
  showScreen('camp');
}
function openBrief(i) {
  const m = MISSIONS[i], cfg = UI.camp;
  const enemy = SIDE_OF[cfg.nation] === 'entente' ? m.enemies[0] : m.enemies[1];
  $('#briefTitle').textContent = `${i + 1}. ${m.name}`;
  $('#briefWhen').textContent = `${m.when} · ${NATIONS[cfg.nation].name} vs ${NATIONS[enemy].name}`;
  $('#briefText').textContent = m.brief;
  $('#briefObj').innerHTML = m.obj.map((o) => `<li>${o}</li>`).join('');
  $('#briefGo').onclick = () => launch({ mode: 'campaign', mission: i, nation: cfg.nation, enemy, diff: cfg.diff, size: 'm', weather: ['overcast', 'clear', 'dynamic', 'overcast', 'dynamic'][i], fog: true, seed: 1915 + i * 101 });
  showScreen('brief');
}
function showEnd() {
  const win = GAME.result === 'win', T = TEAMS[0];
  $('#endTitle').textContent = win ? 'Victory' : 'Defeat';
  $('#endSub').textContent = GAME.why;
  const st = [[fmtTime(GAME.t), 'Battle time'], [T.stats.kills, 'Enemy killed'], [T.stats.losses, 'Our losses'], [T.stats.trained, 'Units raised'], [T.stats.captured, 'Sectors taken'], [T.stats.vehKills, 'Vehicles destroyed']];
  if (GAME.cfg.mode === 'survival') st.unshift([GAME.M.wave, 'Waves reached']);
  $('#endStats').innerHTML = st.map(([v, l]) => `<div class="st"><b>${v}</b><span>${l}</span></div>`).join('');
  $('#endAgain').textContent = GAME.cfg.mode === 'campaign' ? (win && GAME.cfg.mission < MISSIONS.length - 1 ? 'Next operation' : 'Retry') : 'Play again';
  showScreen('end');
  document.body.dataset.state = 'end';
}
function pauseGame() {
  if (GAME.state !== 'play') return;
  GAME.state = 'paused'; showScreen('pause'); document.body.dataset.state = 'paused';
}
function resumeGame() {
  showScreen(null); GAME.state = 'play'; document.body.dataset.state = 'play';
}
function quitToMenu() {
  GAME.state = 'title'; showScreen('title'); document.body.dataset.state = 'title';
  SEL.length = 0; UI.mode = null;
  startTitleScene();
}

function bindMenus() {
  document.querySelectorAll('#modes .mode').forEach((d) => d.onclick = () => { sfx('click'); const m = d.dataset.mode; if (m === 'campaign') openCampaign(); else openSetup(m); });
  $('#setupBack').onclick = () => showScreen('title');
  $('#setupGo').onclick = () => launch(UI.setup);
  $('#campBack').onclick = () => showScreen('title');
  $('#briefBack').onclick = () => showScreen('camp');
  $('#helpOpen').onclick = () => { UI.helpFrom = 'title'; showScreen('help'); };
  $('#helpClose').onclick = () => { if (UI.helpFrom === 'pause') showScreen('pause'); else if (UI.helpFrom === 'play') resumeGame(); else showScreen('title'); };
  $('#pauseHelp').onclick = () => { UI.helpFrom = 'pause'; showScreen('help'); };
  $('#helpBtn').onclick = () => { if (GAME.state === 'play') { GAME.state = 'paused'; document.body.dataset.state = 'paused'; UI.helpFrom = 'play'; showScreen('help'); } };
  $('#menuBtn').onclick = () => pauseGame();
  $('#resumeBtn').onclick = () => resumeGame();
  $('#restartBtn').onclick = () => launch(GAME.cfg);
  $('#quitBtn').onclick = () => quitToMenu();
  $('#endMenu').onclick = () => quitToMenu();
  $('#endWatch').onclick = () => { showScreen(null); document.body.dataset.state = 'play'; GAME.state = 'play'; GAME.watching = true; };
  $('#endAgain').onclick = () => {
    const c = GAME.cfg;
    if (c.mode === 'campaign') { const next = GAME.result === 'win' && c.mission < MISSIONS.length - 1; if (next) { openBrief(c.mission + 1); return; } launch(c); return; }
    launch({ ...c, seed: c.mode === 'survival' ? c.seed : Math.floor(Math.random() * 99999) });
  };
  hudEl.speed.onclick = () => { GAME.speed = GAME.speed === 1 ? 2 : GAME.speed === 2 ? 0.5 : 1; hudEl.speed.textContent = (GAME.speed === 0.5 ? '½' : GAME.speed) + '×'; };
}

// ---------- HUD ----------
let hudT = 0;
function updateHUD(dt) {
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) hudEl.banner.classList.remove('on'); }
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.12;
  const T = TEAMS[0];
  hudEl.supply.textContent = Math.floor(T.supply);
  hudEl.income.textContent = `+${Math.round(T.income * 60)}/min`;
  hudEl.pop.textContent = `${T.pop}/${T.popCap}`;
  hudEl.pop.parentElement.classList.toggle('full', T.pop >= T.popCap);
  hudEl.pop.className = T.pop >= T.popCap ? 'full' : '';
  hudEl.obj.innerHTML = (GAME.M.objText ? GAME.M.objText.call(GAME.M) : '') + ` <span style="color:var(--dim)">· ${fmtTime(GAME.t)}</span>`;
  hudEl.weather.textContent = weatherName();
  updatePowersPanel();
  updateSelPanel();
  updateCard();
  if (GAME.over && GAME.endT > 3.5 && !GAME.watching && GAME.state === 'play') { GAME.state = 'end'; showEnd(); }
}
function updatePowersPanel() {
  const parts = [];
  for (const k of POWER_IDS) {
    const P = POWERS[k], st = powerState(0, k);
    const cdf = st.cd > 0 ? st.cd / P.cd : 0;
    parts.push(`<div class="pw${st.ok ? '' : ' off'}${UI.mode === 'power' && UI.md.k === k ? ' armed' : ''}" data-k="${k}"><span class="key">${P.key}</span><span class="nm">${P.name}<small>${!st.has ? 'Needs ' + BLDS[P.req].name : st.cd > 0 ? 'Ready in ' + Math.ceil(st.cd) + 's' : st.free ? GAME.freePowers[0][k] + ' free' : 'Ready'}</small></span><span class="cost">${st.free ? 'FREE' : P.cost}</span>${cdf ? `<i class="cd" style="width:${(1 - cdf) * 100}%"></i>` : ''}</div>`);
  }
  const html = parts.join('');
  if (html !== UI.powersHTML) {
    UI.powersHTML = html; hudEl.powers.innerHTML = html;
    hudEl.powers.querySelectorAll('.pw').forEach((d) => {
      d.onclick = () => armPower(d.dataset.k);
      d.onmouseenter = (ev) => showTip(ev, powerTip(d.dataset.k)); d.onmouseleave = hideTip;
    });
  }
}
function powerTip(k) {
  const P = POWERS[k], st = powerState(0, k);
  return `<h4>${P.name} <span class="tc">${P.cost} supply</span></h4>${P.desc}<p>Cooldown ${P.cd}s · hotkey ${P.key}${st.has ? '' : `<br><span class="req">Requires a completed ${BLDS[P.req].name}</span>`}</p>`;
}
function armPower(k) {
  const st = powerState(0, k);
  if (!st.ok) { sfx('click', undefined, undefined, 0.4); if (!st.has) alertMsg(`${POWERS[k].name} needs a ${BLDS[POWERS[k].req].name}`); else if (!st.afford) alertMsg('Not enough supply'); return; }
  setMode('power', { k });
}
function setMode(m, md) {
  UI.mode = m; UI.md = md || null;
  if (UI.ghost) { scene.remove(UI.ghost); UI.ghost = null; }
  if (m === 'build') {
    const g = buildingModel(md.type, TEAMS[0].nation).group;
    g.traverse((o) => { if (o.isMesh) o.material = GHOST_MAT; });
    scene.add(g); UI.ghost = g;
  }
  const hints = {
    amove: () => 'Attack-move: left-click a destination. Units fight anything they meet on the way.',
    ability: () => `${ABIL[md.k].name}: left-click a target`,
    power: () => `${POWERS[md.k].name}: left-click a target on the map` + (md.k === 'creep' ? '. The barrage walks away from your HQ' : ''),
    build: () => `Place ${BLDS[md.type].name}: left-click near your HQ or a held sector. Shift to place several. Esc to cancel`,
    line: () => `${md.kind === 'dig' ? 'Dig trench' : 'Barbed wire'}: drag a line (or click start and end). Shift to keep drawing`,
    ground: () => 'Fire at ground: left-click a target area',
    buildmenu: () => 'Choose a building to construct',
  };
  hudEl.hint.hidden = !m;
  hudEl.hint.textContent = hints[m] ? hints[m]() : '';
  UI.cardSig = '';
  UI.powersHTML = '';
}
const GHOST_MAT = new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.4, depthWrite: false });

// ---------- tooltips ----------
function showTip(ev, html) {
  const t = hudEl.tip;
  t.innerHTML = html; t.style.display = 'block';
  const r = t.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY - r.height - 12;
  if (x + r.width > VW - 6) x = VW - r.width - 6;
  if (y < 6) y = ev.clientY + 18;
  t.style.left = x + 'px'; t.style.top = y + 'px';
}
function hideTip() { hudEl.tip.style.display = 'none'; }

// ---------- selection panel ----------
const stars = (v) => (v ? `<span style="color:var(--brass)">${'★'.repeat(v)}</span>` : '');
function unitState(e) {
  if (e.kind === 'squad') {
    if (e.broken) return '<span class="tagline tag-brk">Broken</span>';
    if (e.retreat) return '<span class="tagline tag-ret">Retreating</span>';
    if (e.overtop > 0) return '<span class="tagline tag-pin">Over the top!</span>';
    if (e.supp >= 0.6) return '<span class="tagline tag-pin">Pinned</span>';
    if (e.def.crew && e.setup < 1 && !e.moving) return '<span class="tagline tag-ret">Setting up</span>';
    if (e.gassed && GAME.t - e.gassed < 2) return '<span class="tagline tag-brk">Gassed</span>';
  } else if (e.kind === 'veh' && e.broken > 0) return `<span class="tagline tag-brk">Broken down ${Math.ceil(e.broken)}s</span>`;
  return '';
}
function entHP(e) {
  if (e.kind === 'squad') { let h = 0; for (const m of e.men) if (m.alive) h += m.hp; return h / (e.def.men * e.def.hp); }
  return e.hp / e.maxhp;
}
function updateSelPanel() {
  const el = hudEl.sel;
  const list = SEL.filter((e) => !e.dead);
  if (!list.length) {
    if (UI.panelSig !== 'none') { UI.panelSig = 'none'; el.className = 'empty'; el.innerHTML = '<div style="color:var(--dim);font-size:15px;padding-top:40px;text-align:center">Select units or buildings. Right-click to give orders.</div>'; }
    return;
  }
  el.className = '';
  if (list.length === 1) {
    const e = list[0];
    let html = '';
    const enemy = e.team !== 0;
    const nm = e.kind === 'bld' ? e.def.name : e.def.name;
    const sub = enemy ? `<span style="color:#ff8a7a">${NATIONS[e.nation].adj} · enemy</span>` : NATIONS[e.nation].adj;
    html += `<div class="selHead"><h3 class="fell">${nm}</h3>${stars(e.vet)}<span class="sub">${sub}</span>${unitState(e)}</div>`;
    const hp = entHP(e);
    html += `<div class="hpbar"><i style="width:${hp * 100}%;background:${hp > 0.5 ? 'var(--green)' : hp > 0.25 ? 'var(--brass)' : 'var(--red)'}"></i></div>`;
    if (e.kind === 'squad') {
      html += `<div class="hpbar sup" title="Suppression"><i style="width:${Math.min(1, e.supp) * 100}%;background:${e.supp >= 0.6 ? 'var(--red)' : 'var(--brass)'}"></i></div>`;
      const al = aliveMen(e).length;
      html += `<div class="selBody"><div class="stats"><span>Men</span><b>${al}/${e.def.men}${e.reinf ? ` (+${e.reinf})` : ''}</b><span>Weapon</span><b>${e.w.name}</b><span>Position</span><b>${coverName(e.cover || 0)}</b><span>Veterancy</span><b>${e.vet}/3 (${Math.floor(e.xp)} xp)</b></div><div class="desc">${e.def.desc}</div></div>`;
    } else if (e.kind === 'veh') {
      html += `<div class="selBody"><div class="stats"><span>Hull</span><b>${Math.ceil(e.hp)}/${e.maxhp}</b><span>Armament</span><b>${e.wpn.map((w) => w.w.name).join(', ')}</b><span>Speed</span><b>${e.moving ? Math.round(e.v * 3.6) + ' km/h' : 'Halted'}</b><span>Veterancy</span><b>${e.vet}/3</b></div><div class="desc">${e.def.desc}</div></div>`;
    } else {
      const bits = [];
      if (e.built < 1) bits.push(`<span>Construction</span><b>${Math.floor(e.built * 100)}%</b>`);
      bits.push(`<span>Structure</span><b>${Math.ceil(e.hp)}/${e.maxhp}</b>`);
      if (e.research) bits.push(`<span>Researching</span><b>${RESEARCH[e.research.k].name} ${Math.floor(e.research.t / RESEARCH[e.research.k].time * 100)}%</b>`);
      html += `<div class="selBody"><div class="stats">${bits.join('')}</div><div class="desc">${e.def.desc}</div></div>`;
      if (e.queue.length && !enemy) {
        html += '<div class="queue">' + e.queue.map((q, i) => `<div class="qi" data-q="${i}" title="Click to cancel">${UNITS[q.type].short}${i === 0 ? `<i style="width:${q.t / UNITS[q.type].time * 100}%"></i>` : ''}</div>`).join('') + '</div>';
        if (TEAMS[0].pop + UNITS[e.queue[0].type].pop > TEAMS[0].popCap && e.queue[0].t === 0) html += '<div style="color:var(--red);font-size:14px;margin-top:4px">Population cap reached. Build a Supply Depot.</div>';
      }
    }
    const sig = html;
    if (sig !== UI.panelSig) {
      UI.panelSig = sig; el.innerHTML = html;
      el.querySelectorAll('.qi').forEach((q) => q.onclick = () => { cancelQueue(e, +q.dataset.q); UI.panelSig = ''; });
    }
    return;
  }
  const chips = list.slice(0, 24).map((e, i) => {
    const hp = entHP(e);
    const cls = e.kind === 'squad' ? (e.broken ? ' broken' : e.supp >= 0.6 ? ' pinned' : '') : '';
    const n = e.kind === 'squad' ? `${aliveMen(e).length}/${e.def.men}` : '';
    return `<div class="chip${cls}" data-i="${i}"><b>${e.def.short || e.def.name}</b><span class="vs">${'★'.repeat(e.vet)}</span> <span style="color:var(--dim)">${n}</span><div class="hb"><i style="width:${hp * 100}%;background:${hp > 0.5 ? 'var(--green)' : hp > 0.25 ? 'var(--brass)' : 'var(--red)'}"></i></div></div>`;
  }).join('');
  const html = `<div class="selHead"><h3 class="fell">${list.length} selected</h3><span class="sub">Click a card to select one · shift-click to remove</span></div><div class="chips">${chips}</div>`;
  if (html !== UI.panelSig) {
    UI.panelSig = html; el.innerHTML = html;
    el.querySelectorAll('.chip').forEach((c) => c.onclick = (ev) => {
      const e = list[+c.dataset.i];
      if (ev.shiftKey) { const k = SEL.indexOf(e); if (k >= 0) SEL.splice(k, 1); } else { SEL.length = 0; SEL.push(e); }
      UI.cardSig = ''; UI.panelSig = '';
    });
  }
}

// ---------- command card ----------
const POS_KEYS = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];
function cardFor() {
  const list = SEL.filter((e) => !e.dead && e.team === 0);
  const T = TEAMS[0];
  const b = [];
  if (!list.length) return b;
  if (UI.mode === 'buildmenu' || UI.mode === 'build') {
    BUILD_ORDER.forEach((k, i) => {
      const d = BLDS[k];
      b.push({ t: d.name, key: POS_KEYS[i], c: d.cost, off: T.supply < d.cost, armed: UI.mode === 'build' && UI.md.type === k, tip: `<h4>${d.name} <span class="tc">${d.cost} supply</span></h4>${d.desc}<p>Build time ${d.time}s with a full engineer squad.</p>`, fn: () => { if (T.supply >= d.cost) setMode('build', { type: k }); else alertMsg('Not enough supply'); } });
    });
    b.push({ t: 'Back', key: 'Esc', back: true, fn: () => setMode(null) });
    return b;
  }
  const bld = list.length === 1 && list[0].kind === 'bld' ? list[0] : null;
  if (bld) {
    if (bld.built < 1) return [{ t: 'Under construction', off: true, tip: 'Engineers must finish this building first. Right-click it with engineers selected.' }];
    makesFor(bld.type, T.nation).forEach((k, i) => {
      const d = UNITS[k];
      const popOK = T.pop + d.pop <= T.popCap;
      b.push({ t: d.short, key: POS_KEYS[i], c: d.cost, off: T.supply < d.cost || bld.queue.length >= 5, tip: `<h4>${d.name} <span class="tc">${d.cost} supply</span></h4>${d.desc}<p>Population ${d.pop} · ${d.time}s${popOK ? '' : '<br><span class="req">Population cap reached. Build a Supply Depot</span>'}${d.nation ? '<br>Unique to ' + NATIONS[d.nation].name : ''}</p>`, fn: () => { if (queueUnit(bld, k)) sfx('click'); else alertMsg(T.supply < d.cost ? 'Not enough supply' : 'Queue is full'); UI.panelSig = ''; } });
    });
    for (const r of bld.def.research || []) {
      const R = RESEARCH[r];
      const done = T.research[r];
      b.push({ t: R.name, key: POS_KEYS[b.length], c: done ? '' : R.cost, off: done || !!T.researching || T.supply < R.cost, tip: `<h4>${R.name} <span class="tc">${R.cost} supply</span></h4>${R.desc}<p>${done ? 'Researched' : `Research time ${R.time}s`}</p>`, fn: () => { if (startResearch(bld, r)) sfx('click'); } });
    }
    return b;
  }
  if (list.some((e) => e.kind === 'bld')) return b;
  const squads = list.filter((e) => e.kind === 'squad');
  // abilities from the selection
  const abs = [];
  for (const e of list) for (const a of e.def.ab || []) if (!abs.includes(a)) abs.push(a);
  abs.forEach((k, i) => {
    const A = ABIL[k];
    const users = list.filter((e) => (e.def.ab || []).includes(k));
    const ready = users.some((e) => abilityReady(e, k));
    const cd = Math.min(...users.map((e) => (e.abCd[k] || 0) / (A.cd || 1)));
    const cost = A.cost ? A.cost : A.costPer ? A.costPer + '/4m' : '';
    b.push({ t: A.name, key: POS_KEYS[i], c: cost, off: A.menu || A.costPer ? false : !ready, armed: (UI.mode === 'ability' && UI.md.k === k) || (UI.mode === 'line' && UI.md.kind === (k === 'trench' ? 'dig' : 'wire')), cd,
      tip: `<h4>${A.name}${A.cost ? ` <span class="tc">${A.cost} supply</span>` : ''}</h4>${A.desc}${A.cd ? `<p>Cooldown ${A.cd}s</p>` : ''}`,
      fn: () => {
        if (A.menu) { setMode('buildmenu'); return; }
        if (k === 'trench' || k === 'wire') { setMode('line', { kind: k === 'trench' ? 'dig' : 'wire' }); return; }
        if (A.self) { let any = false; for (const e of users) if (useAbility(e, k)) any = true; if (!any) alertMsg('Not ready'); return; }
        if (!ready) { alertMsg(TEAMS[0].supply < (A.cost || 0) ? 'Not enough supply' : 'Not ready yet'); return; }
        setMode('ability', { k });
      } });
  });
  const shellers = squads.filter((e) => e.w && e.w.shell);
  if (shellers.length) b.push({ t: 'Fire at ground', key: POS_KEYS[abs.length], tip: '<h4>Fire at ground</h4>Keep shelling a chosen spot until ordered otherwise.', armed: UI.mode === 'ground', fn: () => setMode('ground') });
  while (b.length < 5) b.push(null);
  b.length = 5;
  b.push({ t: 'Attack-move', key: 'F', tip: '<h4>Attack-move</h4>Move to a point, engaging any enemy met along the way.', armed: UI.mode === 'amove', fn: () => setMode('amove') });
  b.push({ t: 'Stop', key: 'H', tip: '<h4>Stop</h4>Cancel all orders.', fn: () => orderStop(list) });
  if (squads.length) {
    b.push({ t: 'Retreat', key: 'R', tip: '<h4>Retreat</h4>Fall back to the HQ or nearest depot. Retreating squads move faster and shrug off suppression, then heal and can reinforce.', fn: () => orderRetreat(squads) });
    const can = squads.filter((e) => canReinforce(e));
    const rc = can.length ? reinforceCost(can[0]) : 0;
    b.push({ t: 'Reinforce', key: 'T', c: can.length ? rc : '', off: !can.length || T.supply < rc, tip: '<h4>Reinforce</h4>Replace a lost man. Only near your HQ or a Supply Depot.', fn: () => { let any = false; for (const e of can) if (doReinforce(e)) any = true; if (!any) alertMsg(can.length ? 'Not enough supply' : 'Move the squad near the HQ or a Supply Depot to reinforce'); UI.panelSig = ''; } });
  }
  return b;
}
function updateCard() {
  const b = cardFor();
  UI.card = b;
  const sig = JSON.stringify(b.map((x) => x && [x.t, x.key, x.c, x.off, x.armed, x.cd ? Math.round(x.cd * 20) : 0]));
  if (sig === UI.cardSig) return;
  UI.cardSig = sig;
  const el = hudEl.cmd;
  el.innerHTML = '';
  b.forEach((x) => {
    const d = document.createElement('div');
    if (!x) { d.style.visibility = 'hidden'; el.appendChild(d); return; }
    d.className = 'cb' + (x.off ? ' off' : '') + (x.armed ? ' armed' : '') + (x.back ? ' back' : '');
    d.innerHTML = `${x.key ? `<span class="k">${x.key}</span>` : ''}<span class="t">${x.t}</span>${x.c !== undefined && x.c !== '' ? `<span class="c">${x.c}</span>` : '<span></span>'}${x.cd > 0 ? `<i class="cd" style="width:${(1 - x.cd) * 100}%"></i>` : ''}`;
    d.onclick = () => { if (x.fn) { x.fn(); UI.cardSig = ''; } };
    if (x.tip) { d.onmouseenter = (ev) => showTip(ev, x.tip); d.onmouseleave = hideTip; }
    el.appendChild(d);
  });
}

// ---------- picking ----------
const _sp = { x: 0, y: 0 };
function pickEnt(sx, sy, teamOnly) {
  let best = null, bd = 1e9;
  for (const e of ENTS) {
    if (e.dead) continue;
    if (teamOnly !== undefined && e.team !== teamOnly) continue;
    if (e.kind === 'bld' ? !e.seen : !e.vis) continue;
    if (e.kind === 'squad') {
      for (const m of e.men) {
        if (!m.alive) continue;
        if (!project(m.x, m.y + 1.1, m.z, _sp)) continue;
        const d = Math.hypot(_sp.x - sx, _sp.y - sy);
        if (d < 16 && d < bd) { bd = d; best = e; }
      }
    } else if (e.kind === 'veh') {
      if (!project(e.x, e.y + 1.2, e.z, _sp)) continue;
      const r = clamp(e.def.rad * 900 / CAM.dist, 14, 60);
      const d = Math.hypot(_sp.x - sx, _sp.y - sy);
      if (d < r && d - 5 < bd) { bd = d - 5; best = e; }
    } else {
      if (!pickGround(sx, sy, _v4)) continue;
      const [hw, hd] = footprint(e.type, e.ang);
      if (Math.abs(_v4.x - e.x) < hw + 1 && Math.abs(_v4.z - e.z) < hd + 1) { const d = 20; if (d < bd) { bd = d; best = e; } }
    }
  }
  return best;
}
function selectOnly(list) {
  SEL.length = 0;
  for (const e of list) if (!SEL.includes(e)) SEL.push(e);
  UI.cardSig = ''; UI.panelSig = '';
  if (UI.mode && UI.mode !== 'power') setMode(null);
}
function boxSelect(x0, y0, x1, y1, add) {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const units = [], blds = [];
  for (const e of ENTS) {
    if (e.dead || e.team !== 0) continue;
    let inside = false;
    if (e.kind === 'squad') { for (const m of e.men) if (m.alive && project(m.x, m.y + 1, m.z, _sp) && _sp.x >= ax && _sp.x <= bx && _sp.y >= ay && _sp.y <= by) { inside = true; break; } }
    else if (project(e.x, (e.y || 0) + 1, e.z, _sp) && _sp.x >= ax && _sp.x <= bx && _sp.y >= ay && _sp.y <= by) inside = true;
    if (inside) (e.kind === 'bld' ? blds : units).push(e);
  }
  const list = units.length ? units : blds.slice(0, 1);
  if (add) { for (const e of list) if (!SEL.includes(e)) SEL.push(e); UI.cardSig = ''; UI.panelSig = ''; }
  else selectOnly(list);
}
function onScreen(e) { return project(e.x, (e.y || 0) + 1, e.z, _sp) && _sp.x > 0 && _sp.x < VW && _sp.y > 40 && _sp.y < VH - 190; }

// ---------- commands ----------
function marker(x, z, col) { UI.markers.push({ x, z, t: 0, col }); }
function rightClick(sx, sy, shift) {
  const list = SEL.filter((e) => !e.dead && e.team === 0);
  if (!list.length) return;
  if (!pickGround(sx, sy, _v4)) return;
  const gx = clamp(_v4.x, 1, MAP.W - 1), gz = clamp(_v4.z, 1, MAP.H - 1);
  if (list.every((e) => e.kind === 'bld')) {
    for (const b of list) b.rally = { x: gx, z: gz };
    marker(gx, gz, '#7dff7a'); sfx('click');
    return;
  }
  const units = list.filter((e) => e.kind !== 'bld');
  const tgt = pickEnt(sx, sy);
  const engs = units.filter((e) => e.kind === 'squad' && e.def.eng);
  if (tgt && tgt.team !== 0 && (tgt.vis || tgt.kind === 'bld')) {
    orderAttack(units, tgt, shift);
    const rest = units.filter((e) => !canHurt(e, tgt));
    if (rest.length) orderMove(rest, tgt.x, tgt.z, shift);
    marker(tgt.x, tgt.z, '#ff5b45'); sfx('click');
    return;
  }
  if (tgt && tgt.team === 0 && engs.length && tgt.kind !== 'squad' && (tgt.hp < tgt.maxhp || tgt.broken > 0 || (tgt.kind === 'bld' && tgt.built < 1))) {
    const job = tgt.kind === 'bld' && tgt.built < 1 ? 'build' : 'repair';
    for (const e of engs) giveOrder(e, { t: job, id: tgt.id }, shift);
    const rest = units.filter((e) => !engs.includes(e));
    if (rest.length) orderMove(rest, gx, gz, shift);
    marker(tgt.x, tgt.z, '#ffd75a'); sfx('click');
    return;
  }
  const c = cellIdx(gx, gz);
  if (engs.length && (MAP.flags[c] & F.WIRE)) {
    for (const e of engs) giveOrder(e, { t: 'cut', c }, shift);
    const rest = units.filter((e) => !engs.includes(e));
    if (rest.length) orderMove(rest, gx, gz, shift);
    marker(cellX(c), cellZ(c), '#ffd75a'); sfx('click');
    return;
  }
  orderMove(units, gx, gz, shift, false);
  marker(gx, gz, '#7dff7a'); sfx('click', undefined, undefined, 0.5);
}
function leftAction(sx, sy, shift) {
  // returns true if the click was consumed by a targeting mode
  const m = UI.mode;
  if (!m || m === 'buildmenu') return false;
  if (!pickGround(sx, sy, _v4)) return true;
  const gx = clamp(_v4.x, 1, MAP.W - 1), gz = clamp(_v4.z, 1, MAP.H - 1);
  const list = SEL.filter((e) => !e.dead && e.team === 0 && e.kind !== 'bld');
  if (m === 'amove') {
    const tgt = pickEnt(sx, sy, 1);
    if (tgt && tgt.vis) { orderAttack(list, tgt, shift); marker(tgt.x, tgt.z, '#ff5b45'); }
    else { orderMove(list, gx, gz, shift, true); marker(gx, gz, '#ff9a45'); }
    sfx('click'); if (!shift) setMode(null);
    return true;
  }
  if (m === 'ability') {
    const k = UI.md.k;
    let users = list.filter((e) => (e.def.ab || []).includes(k) && abilityReady(e, k));
    if (k === 'grenade' || k === 'bundle') users = users.sort((a, b) => dist2(a.x, a.z, gx, gz) - dist2(b.x, b.z, gx, gz)).slice(0, 1);
    let any = false;
    for (const e of users) if (useAbility(e, k, gx, gz)) any = true;
    if (any) { marker(gx, gz, '#ff5b45'); sfx('click'); } else alertMsg('Out of range or not ready');
    if (!shift) setMode(null);
    return true;
  }
  if (m === 'ground') {
    for (const e of list) if (e.w && e.w.shell) giveOrder(e, { t: 'ground', x: gx, z: gz }, shift);
    marker(gx, gz, '#ff5b45'); sfx('click');
    if (!shift) setMode(null);
    return true;
  }
  if (m === 'power') {
    if (usePower(0, UI.md.k, gx, gz)) marker(gx, gz, '#ffd75a');
    setMode(null);
    return true;
  }
  if (m === 'build') {
    const type = UI.md.type, rot = Math.PI;
    const why = canPlace(type, 0, gx, gz, rot);
    if (why) { alertMsg(why); return true; }
    const b = orderBuild(list, type, gx, gz, rot);
    if (b) { sfx('build', gx, gz); if (!shift) setMode(null); }
    else alertMsg(TEAMS[0].supply < BLDS[type].cost ? 'Not enough supply' : 'Select engineers to build');
    return true;
  }
  return true;
}
function commitLine(x0, z0, x1, z1) {
  const kind = UI.md.kind;
  const cells = lineCells(x0, z0, x1, z1, kind === 'dig' ? 1 : 0);
  const n = orderLine(SEL.filter((e) => e.team === 0), kind, cells);
  if (!n) alertMsg(TEAMS[0].supply < ABIL[kind === 'dig' ? 'trench' : 'wire'].costPer ? 'Not enough supply' : 'Nothing to build there');
  else sfx('dig', x1, z1);
}

// ---------- input ----------
function bindInput() {
  const cv = canvas;
  cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
  addEventListener('mousemove', (ev) => {
    UI.mx = ev.clientX; UI.my = ev.clientY;
    if (UI.drag) { UI.drag.x1 = ev.clientX; UI.drag.y1 = ev.clientY; }
    if (CAM.mdrag) { CAM.mdrag.dx += ev.movementX; CAM.mdrag.dy += ev.movementY; }
  });
  cv.addEventListener('mouseenter', () => { UI.inView = true; });
  cv.addEventListener('mouseleave', () => { UI.inView = false; });
  cv.addEventListener('mousedown', (ev) => {
    audioInit();
    if (GAME.state !== 'play') return;
    hideTip();
    if (ev.button === 1 || (ev.button === 0 && ev.altKey)) { ev.preventDefault(); CAM.mdrag = { dx: 0, dy: 0, rot: ev.altKey }; return; }
    if (ev.button === 2) {
      if (UI.mode && UI.mode !== 'buildmenu') { setMode(null); return; }
      rightClick(ev.clientX, ev.clientY, ev.shiftKey);
      return;
    }
    if (ev.button !== 0) return;
    if (UI.mode === 'line') {
      if (!pickGround(ev.clientX, ev.clientY, _v4)) return;
      if (UI.md.start) { commitLine(UI.md.start.x, UI.md.start.z, _v4.x, _v4.z); UI.md.start = null; if (!ev.shiftKey) setMode(null); return; }
      UI.md.start = { x: _v4.x, z: _v4.z, sx: ev.clientX, sy: ev.clientY, down: true };
      return;
    }
    if (leftAction(ev.clientX, ev.clientY, ev.shiftKey)) return;
    UI.drag = { x0: ev.clientX, y0: ev.clientY, x1: ev.clientX, y1: ev.clientY, shift: ev.shiftKey, ctrl: ev.ctrlKey };
  });
  addEventListener('mouseup', (ev) => {
    if (ev.button === 1 || CAM.mdrag) { CAM.mdrag = null; if (ev.button === 1) return; }
    if (GAME.state !== 'play') { UI.drag = null; return; }
    if (UI.mode === 'line' && UI.md.start && UI.md.start.down && ev.button === 0) {
      UI.md.start.down = false;
      if (Math.hypot(ev.clientX - UI.md.start.sx, ev.clientY - UI.md.start.sy) > 8 && pickGround(ev.clientX, ev.clientY, _v4)) {
        commitLine(UI.md.start.x, UI.md.start.z, _v4.x, _v4.z); UI.md.start = null;
        if (!ev.shiftKey) setMode(null);
      }
      return;
    }
    const d = UI.drag;
    if (!d || ev.button !== 0) return;
    UI.drag = null;
    if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > 6) { boxSelect(d.x0, d.y0, d.x1, d.y1, d.shift); return; }
    const e = pickEnt(ev.clientX, ev.clientY);
    const now = performance.now();
    if (e && e.team === 0) {
      if (now - UI.lastClick.t < 350 && UI.lastClick.id === e.id) {
        selectOnly(ENTS.filter((o) => !o.dead && o.team === 0 && o.type === e.type && onScreen(o)));
      } else if (d.shift) {
        const k = SEL.indexOf(e);
        if (k >= 0) SEL.splice(k, 1); else if (!SEL.some((o) => o.team !== 0)) SEL.push(e); else selectOnly([e]);
        UI.cardSig = ''; UI.panelSig = '';
      } else selectOnly([e]);
      UI.lastClick = { t: now, id: e.id };
    } else if (e) { selectOnly([e]); }
    else if (!d.shift) selectOnly([]);
  });
  cv.addEventListener('wheel', (ev) => { ev.preventDefault(); CAM.tdist = clamp(CAM.tdist * (1 + Math.sign(ev.deltaY) * 0.12), 26, 170); }, { passive: false });
  cv.addEventListener('dblclick', (ev) => ev.preventDefault());

  addEventListener('keydown', (ev) => {
    const k = ev.key;
    keys[ev.code] = true;
    if (ev.target && ev.target.tagName === 'INPUT') return;
    if (k === 'F1' || k === '?') { ev.preventDefault(); if (GAME.state === 'play') $('#helpBtn').onclick(); return; }
    if (GAME.state === 'paused' && (k === 'Escape' || k === 'p' || k === 'P')) { resumeGame(); return; }
    if (GAME.state !== 'play') return;
    if (k === 'Escape') {
      if (UI.mode) setMode(UI.mode === 'build' ? 'buildmenu' : null);
      else if (SEL.length) selectOnly([]);
      else pauseGame();
      return;
    }
    if (k === 'p' || k === 'P') { pauseGame(); return; }
    if (k === ' ') { ev.preventDefault(); jumpCamera(); return; }
    // control groups
    if (/^Digit[1-9]$/.test(ev.code)) {
      const g = ev.code.slice(5);
      if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); UI.groups[g] = SEL.filter((e) => e.team === 0).slice(); alertMsg(`Group ${g} set`); return; }
      const grp = (UI.groups[g] || []).filter((e) => !e.dead);
      if (!grp.length) return;
      const now = performance.now();
      if (UI.lastGroup.k === g && now - UI.lastGroup.t < 400) centerOn(grp);
      UI.lastGroup = { k: g, t: now };
      if (ev.shiftKey) { for (const e of grp) if (!SEL.includes(e)) SEL.push(e); UI.cardSig = ''; UI.panelSig = ''; } else selectOnly(grp);
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (k === 'a' || k === 'A')) { ev.preventDefault(); selectOnly(ENTS.filter((e) => !e.dead && e.team === 0 && e.kind !== 'bld' && !(e.kind === 'squad' && e.def.eng))); return; }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (k === '.') { const idle = ENTS.filter((e) => !e.dead && e.team === 0 && e.kind === 'squad' && e.def.eng && !e.order); const list = idle.length ? idle : ENTS.filter((e) => !e.dead && e.team === 0 && e.kind === 'squad' && e.def.eng); if (list.length) { UI.engI = ((UI.engI || 0) + 1) % list.length; selectOnly([list[UI.engI]]); centerOn([list[UI.engI]]); } return; }
    const up = k.toUpperCase();
    for (const pk of POWER_IDS) if (POWERS[pk].key === up) { armPower(pk); return; }
    UI.card = cardFor();
    for (const b of UI.card) if (b && b.key === up && !ev.repeat) { if (b.fn) { b.fn(); UI.cardSig = ''; } return; }
  });
  addEventListener('keyup', (ev) => { keys[ev.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // minimap
  const mm = $('#mm');
  const mmPos = (ev) => { const r = mm.getBoundingClientRect(); return { x: clamp((ev.clientX - r.left) / r.width, 0, 1) * MAP.W, z: clamp((ev.clientY - r.top) / r.height, 0, 1) * MAP.H }; };
  mm.addEventListener('contextmenu', (ev) => ev.preventDefault());
  mm.addEventListener('mousedown', (ev) => {
    if (GAME.state !== 'play') return;
    const p = mmPos(ev);
    if (ev.button === 2) {
      const list = SEL.filter((e) => !e.dead && e.team === 0);
      if (list.every((e) => e.kind === 'bld')) { for (const b of list) b.rally = { x: p.x, z: p.z }; return; }
      if (UI.mode === 'amove') { orderMove(list, p.x, p.z, ev.shiftKey, true); setMode(null); }
      else orderMove(list, p.x, p.z, ev.shiftKey);
      marker(p.x, p.z, '#7dff7a');
      return;
    }
    if (UI.mode === 'power') { usePower(0, UI.md.k, p.x, p.z); setMode(null); return; }
    UI.mmDrag = true; CAM.x = p.x; CAM.z = p.z;
  });
  addEventListener('mousemove', (ev) => { if (UI.mmDrag) { const p = mmPos(ev); CAM.x = p.x; CAM.z = p.z; } });
  addEventListener('mouseup', () => { UI.mmDrag = false; });

  // touch: one finger pans or taps, two fingers zoom
  let touches = {}, tapStart = null, pinch = null;
  cv.addEventListener('touchstart', (ev) => {
    audioInit();
    for (const t of ev.changedTouches) touches[t.identifier] = { x: t.clientX, y: t.clientY };
    const ids = Object.keys(touches);
    if (ids.length === 1) { const t = ev.changedTouches[0]; tapStart = { x: t.clientX, y: t.clientY, t: performance.now(), moved: false }; }
    if (ids.length === 2) { const [a, b] = ids.map((i) => touches[i]); pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: CAM.tdist }; tapStart = null; }
    ev.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', (ev) => {
    for (const t of ev.changedTouches) {
      const o = touches[t.identifier]; if (!o) continue;
      const dx = t.clientX - o.x, dy = t.clientY - o.y;
      if (Object.keys(touches).length === 1) { panBy(-dx, -dy); if (tapStart && Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) > 10) tapStart.moved = true; }
      o.x = t.clientX; o.y = t.clientY;
    }
    if (pinch) { const ids = Object.keys(touches); if (ids.length === 2) { const [a, b] = ids.map((i) => touches[i]); CAM.tdist = clamp(pinch.dist * pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), 26, 170); } }
    ev.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchend', (ev) => {
    for (const t of ev.changedTouches) delete touches[t.identifier];
    if (!Object.keys(touches).length) pinch = null;
    if (tapStart && !tapStart.moved && performance.now() - tapStart.t < 400 && GAME.state === 'play') {
      const t = ev.changedTouches[0];
      if (UI.mode && leftAction(t.clientX, t.clientY, false)) { tapStart = null; return; }
      const e = pickEnt(t.clientX, t.clientY);
      if (e && e.team === 0) selectOnly([e]);
      else if (SEL.length) rightClick(t.clientX, t.clientY, false);
      else if (e) selectOnly([e]);
    }
    tapStart = null;
  });
}
function centerOn(list) {
  if (!list.length) return;
  let x = 0, z = 0; for (const e of list) { x += e.x; z += e.z; }
  CAM.x = x / list.length; CAM.z = z / list.length;
}
function jumpCamera() {
  if (UI.alertPos && performance.now() - UI.alertPos.t < 6000 && !UI.alertJumped) { CAM.x = UI.alertPos.x; CAM.z = UI.alertPos.z; UI.alertJumped = true; return; }
  UI.alertJumped = false;
  const list = SEL.filter((e) => !e.dead);
  if (list.length) centerOn(list);
  else if (TEAMS[0].hq && !TEAMS[0].hq.dead) centerOn([TEAMS[0].hq]);
}

// ---------- minimap ----------
let mmBase = null, mmT = 0;
function buildMinimapBase() {
  const S = 180;
  if (!mmBase) { mmBase = document.createElement('canvas'); }
  mmBase.width = mmBase.height = S;
  const g = mmBase.getContext('2d');
  const img = g.createImageData(S, S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = (i + 0.5) / S * MAP.W, z = (j + 0.5) / S * MAP.H;
    const vi = Math.round(x / HS), vj = Math.round(z / HS), v = vj * MAP.nx + vi;
    let r = MAP.col[v * 3], gg = MAP.col[v * 3 + 1], b = MAP.col[v * 3 + 2];
    const c = cellIdx(x, z), f = MAP.flags[c];
    const h = terrainH(x, z);
    if (h < WATER_Y && !(f & F.BRIDGE)) { r = 0.22; gg = 0.3; b = 0.3; }
    if (f & F.BRIDGE) { r = 0.55; gg = 0.5; b = 0.42; }
    if (f & F.BLOCK) { r = 0.5; gg = 0.45; b = 0.4; }
    if (f & F.RUIN) { r *= 1.1; gg *= 1.05; b *= 1; }
    if (f & F.WOODS) { r *= 0.75; gg *= 0.85; b *= 0.7; }
    if (f & F.TRENCH) { r = 0.14; gg = 0.11; b = 0.08; }
    if (f & F.WIRE) { r = 0.45; gg = 0.4; b = 0.35; }
    const k = (j * S + i) * 4, sh = 1.15 + (h - 3) * 0.04;
    img.data[k] = clamp(r * sh * 255, 0, 255); img.data[k + 1] = clamp(gg * sh * 255, 0, 255); img.data[k + 2] = clamp(b * sh * 255, 0, 255); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
function drawMinimap(dt) {
  mmT -= dt;
  if (mmT <= 0) { mmT = 4; buildMinimapBase(); }
  const cv = $('#mm'), g = cv.getContext('2d'), S = cv.width;
  g.imageSmoothingEnabled = true;
  g.drawImage(mmBase, 0, 0, S, S);
  const sx = S / MAP.W, sz = S / MAP.H;
  // fog
  if (FOW.on) {
    g.fillStyle = 'rgba(10,8,5,0.55)';
    const cw = MAP.cw, ch = MAP.ch, w = S / cw, h = S / ch;
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const c = j * cw + i;
      if (VIS[0][c]) continue;
      g.fillStyle = EXPLORED[c] ? 'rgba(10,8,5,0.42)' : 'rgba(10,8,5,0.8)';
      g.fillRect(i * w, j * h, w + 0.6, h + 0.6);
    }
  }
  for (const p of MAP.points) {
    g.beginPath(); g.arc(p.x * sx, p.z * sz, 6, 0, TAU);
    g.fillStyle = p.owner < 0 ? 'rgba(230,225,210,0.9)' : TEAMCOL[p.owner]; g.fill();
    g.lineWidth = 2; g.strokeStyle = p.contested ? '#fff' : 'rgba(0,0,0,0.7)'; g.stroke();
  }
  for (const e of ENTS) {
    if (e.dead) continue;
    if (e.kind === 'bld') {
      if (!e.seen) continue;
      const [hw, hd] = footprint(e.type, e.ang);
      g.fillStyle = TEAMCOL[e.team]; g.fillRect((e.x - hw) * sx, (e.z - hd) * sz, hw * 2 * sx, hd * 2 * sz);
      g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect((e.x - hw) * sx, (e.z - hd) * sz, hw * 2 * sx, hd * 2 * sz);
      continue;
    }
    if (!e.vis) continue;
    const r = e.kind === 'veh' ? 4.5 : 3.2;
    g.fillStyle = SEL.includes(e) ? '#ffffff' : TEAMCOL[e.team];
    g.fillRect(e.x * sx - r, e.z * sz - r, r * 2, r * 2);
  }
  for (const p of PLANES) { if (p.team !== 0 && !visibleTo(0, p.x, p.z)) continue; g.fillStyle = TEAMCOL[p.team]; g.beginPath(); g.arc(p.x * sx, p.z * sz, 4, 0, TAU); g.fill(); }
  // alert pings
  if (UI.pings) {
    for (const p of UI.pings) {
      p.t += dt;
      g.beginPath(); g.arc(p.x * sx, p.z * sz, 6 + p.t * 18, 0, TAU);
      g.strokeStyle = `rgba(255,80,60,${Math.max(0, 1 - p.t / 2)})`; g.lineWidth = 2; g.stroke();
    }
    UI.pings = UI.pings.filter((p) => p.t < 2);
  }
  // camera view footprint
  const corners = [[0, 40], [VW, 40], [VW, VH - 190], [0, VH - 190]];
  g.beginPath();
  corners.forEach(([x, y], i) => { if (pickGround(x, y, _v5)) { const px = clamp(_v5.x, -50, MAP.W + 50) * sx, pz = clamp(_v5.z, -50, MAP.H + 50) * sz; if (i) g.lineTo(px, pz); else g.moveTo(px, pz); } });
  g.closePath(); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5; g.stroke();
}

// ---------- overlay ----------
function projectedCircle(x, z, r, col, fill) {
  ov.beginPath();
  for (let k = 0; k <= 36; k++) {
    const a = (k / 36) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    project(px, groundH(clamp(px, 0, MAP.W), clamp(pz, 0, MAP.H)) + 0.3, pz, _sp);
    if (k) ov.lineTo(_sp.x, _sp.y); else ov.moveTo(_sp.x, _sp.y);
  }
  ov.strokeStyle = col; ov.lineWidth = 2; ov.stroke();
  if (fill) { ov.fillStyle = fill; ov.fill(); }
}
function cellQuad(c, col, fill) {
  const x = cellX(c), z = cellZ(c), pts = [[-2, -2], [2, -2], [2, 2], [-2, 2]];
  ov.beginPath();
  pts.forEach(([dx, dz], i) => { project(x + dx, MAP.h0[Math.round((z + dz) / HS) * MAP.nx + Math.round((x + dx) / HS)] + 0.15, z + dz, _sp); if (i) ov.lineTo(_sp.x, _sp.y); else ov.moveTo(_sp.x, _sp.y); });
  ov.closePath();
  if (fill) { ov.fillStyle = fill; ov.fill(); }
  ov.strokeStyle = col; ov.lineWidth = 1; ov.stroke();
}
function drawOverlay(dt) {
  ov.clearRect(0, 0, VW, VH);
  if (GAME.state !== 'play' && GAME.state !== 'paused' && GAME.state !== 'end') return;
  // planned engineering
  for (const e of ENTS) {
    if (e.dead || e.team !== 0 || e.kind !== 'squad' || !e.def.eng) continue;
    const orders = [e.order, ...e.queue].filter((o) => o && (o.t === 'dig' || o.t === 'wire'));
    for (const o of orders) for (const c of o.cells) if (!doneCell(o.t, c)) cellQuad(c, o.t === 'dig' ? 'rgba(255,215,90,0.8)' : 'rgba(200,200,200,0.8)', o.t === 'dig' ? 'rgba(255,215,90,0.12)' : 'rgba(200,200,200,0.1)');
  }
  // sector labels
  ov.font = '600 13px "Barlow Condensed", sans-serif'; ov.textAlign = 'center';
  for (const p of MAP.points) {
    if (!project(p.x, p.y + 8.2, p.z, _sp) || _sp.x < -50 || _sp.x > VW + 50 || _sp.y < 0 || _sp.y > VH) continue;
    const txt = p.name + (p.contested ? ' · contested' : '') + (!canCapture(0, p) && p.owner !== 0 ? ' · out of reach' : '');
    ov.fillStyle = 'rgba(0,0,0,0.55)';
    const w = ov.measureText(txt).width + 10;
    ov.fillRect(_sp.x - w / 2, _sp.y - 13, w, 17);
    ov.fillStyle = p.owner < 0 ? '#eee6d0' : TEAMCOL[p.owner];
    ov.fillText(txt, _sp.x, _sp.y);
  }
  // unit bars
  for (const e of ENTS) {
    if (e.dead) continue;
    if (e.kind === 'bld' ? !e.seen : !e.vis) continue;
    const sel = SEL.includes(e), hov = UI.hover === e;
    let x = e.x, z = e.z, y = (e.y || 0);
    if (e.kind === 'squad') {
      let n = 0, sx = 0, sz = 0, sy = 0; for (const m of e.men) if (m.alive) { sx += m.x; sz += m.z; sy += m.y; n++; }
      if (!n) continue; x = sx / n; z = sz / n; y = sy / n + 3.2;
    } else if (e.kind === 'veh') y += 4.2; else y += 9;
    if (!project(x, y, z, _sp) || _sp.x < -40 || _sp.x > VW + 40 || _sp.y < -20 || _sp.y > VH) continue;
    const col = e.team === 0 ? TEAMCOL[0] : TEAMCOL[1];
    if (e.kind === 'squad') {
      const n = e.def.men, w = Math.min(46, n * 7);
      const x0 = _sp.x - w / 2;
      for (let k = 0; k < n; k++) {
        const m = e.men[k];
        const pw = w / n - 1.5;
        ov.fillStyle = 'rgba(0,0,0,0.65)'; ov.fillRect(x0 + k * (w / n) - 1, _sp.y - 1, pw + 2, 7);
        if (m && m.alive) { const f = m.hp / e.def.hp; ov.fillStyle = f > 0.5 ? col : f > 0.25 ? '#ffd75a' : '#ff6a50'; ov.fillRect(x0 + k * (w / n), _sp.y, pw, 5); }
      }
      if (e.supp > 0.05) { ov.fillStyle = 'rgba(0,0,0,0.6)'; ov.fillRect(x0 - 1, _sp.y + 7, w + 2, 4); ov.fillStyle = e.supp >= 0.6 ? '#ff6a50' : '#ffd75a'; ov.fillRect(x0, _sp.y + 8, w * Math.min(1, e.supp), 2); }
      let tag = '';
      if (e.broken) tag = 'BROKEN'; else if (e.retreat) tag = 'RETREAT'; else if (e.overtop > 0) tag = 'OVER THE TOP'; else if (e.supp >= 0.6) tag = 'PINNED';
      if (tag) { ov.font = '700 11px "Barlow Condensed", sans-serif'; ov.fillStyle = e.broken ? '#ff8a75' : e.retreat ? '#9cc3ff' : '#ffd75a'; ov.fillText(tag, _sp.x, _sp.y - 5); }
      if (e.vet) { ov.font = '11px sans-serif'; ov.fillStyle = '#ffd75a'; ov.fillText('★'.repeat(e.vet), _sp.x + w / 2 + 12, _sp.y + 6); }
      if (e.reinf) { ov.font = '700 11px sans-serif'; ov.fillStyle = '#9cff9c'; ov.fillText('+' + e.reinf, _sp.x - w / 2 - 10, _sp.y + 6); }
    } else {
      const hp = e.kind === 'bld' && e.built < 1 ? e.built : e.hp / e.maxhp;
      if (e.kind === 'bld' && !sel && !hov && hp >= 1) continue;
      const w = e.kind === 'veh' ? 46 : 64;
      ov.fillStyle = 'rgba(0,0,0,0.65)'; ov.fillRect(_sp.x - w / 2 - 1, _sp.y - 1, w + 2, 7);
      ov.fillStyle = e.kind === 'bld' && e.built < 1 ? '#ffd75a' : hp > 0.5 ? col : hp > 0.25 ? '#ffd75a' : '#ff6a50';
      ov.fillRect(_sp.x - w / 2, _sp.y, w * hp, 5);
      if (e.kind === 'veh' && e.broken > 0) { ov.font = '700 11px "Barlow Condensed", sans-serif'; ov.fillStyle = '#ff8a75'; ov.fillText('BROKEN DOWN', _sp.x, _sp.y - 5); }
      if (e.vet) { ov.font = '11px sans-serif'; ov.fillStyle = '#ffd75a'; ov.fillText('★'.repeat(e.vet), _sp.x + w / 2 + 12, _sp.y + 6); }
      if (e.kind === 'bld' && e.queue && e.queue.length && e.team === 0) { ov.font = '600 12px "Barlow Condensed", sans-serif'; ov.fillStyle = '#eee6d0'; ov.fillText(`${UNITS[e.queue[0].type].short} ${Math.floor(e.queue[0].t / UNITS[e.queue[0].type].time * 100)}%`, _sp.x, _sp.y - 6); }
    }
  }
  // orders of selected units
  ov.setLineDash([4, 5]);
  for (const e of SEL) {
    if (e.dead || e.team !== 0) continue;
    if (e.kind === 'bld') {
      if (e.rally && project(e.x, e.y + 2, e.z, _sp)) {
        const a = { x: _sp.x, y: _sp.y };
        if (project(e.rally.x, groundH(e.rally.x, e.rally.z) + 0.3, e.rally.z, _sp)) { ov.beginPath(); ov.moveTo(a.x, a.y); ov.lineTo(_sp.x, _sp.y); ov.strokeStyle = 'rgba(125,255,122,0.7)'; ov.lineWidth = 1.5; ov.stroke(); ov.fillStyle = '#7dff7a'; ov.fillRect(_sp.x - 3, _sp.y - 3, 6, 6); }
      }
      continue;
    }
    const pts = [];
    if (e.path) for (let i = e.pi; i < e.path.length; i++) pts.push(e.path[i]);
    for (const q of e.queue) if (q.x !== undefined) pts.push(q);
    if (!pts.length) continue;
    project(e.x, groundH(e.x, e.z) + 0.3, e.z, _sp);
    ov.beginPath(); ov.moveTo(_sp.x, _sp.y);
    for (const p of pts) { project(p.x, groundH(p.x, p.z) + 0.3, p.z, _sp); ov.lineTo(_sp.x, _sp.y); }
    ov.strokeStyle = e.order && e.order.amove ? 'rgba(255,160,80,0.6)' : 'rgba(125,255,122,0.5)'; ov.lineWidth = 1.5; ov.stroke();
  }
  ov.setLineDash([]);
  // markers
  for (const m of UI.markers) { m.t += dt; projectedCircle(m.x, m.z, 1 + m.t * 4, m.col); }
  UI.markers = UI.markers.filter((m) => m.t < 0.5);
  // targeting previews
  const ground = UI.inView && pickGround(UI.mx, UI.my, _v4);
  const gx = _v4.x, gz = _v4.z;
  if (UI.mode === 'ability' && ground) {
    const A = ABIL[UI.md.k];
    projectedCircle(gx, gz, A.radius || 5, 'rgba(255,100,80,0.9)', 'rgba(255,100,80,0.12)');
    for (const e of SEL) if (!e.dead && (e.def.ab || []).includes(UI.md.k) && A.range) projectedCircle(e.x, e.z, A.range, 'rgba(255,255,255,0.35)');
  } else if (UI.mode === 'ground' && ground) {
    projectedCircle(gx, gz, 5, 'rgba(255,100,80,0.9)', 'rgba(255,100,80,0.12)');
    for (const e of SEL) if (!e.dead && e.w && e.w.shell) { projectedCircle(e.x, e.z, e.w.range, 'rgba(255,255,255,0.35)'); if (e.w.min) projectedCircle(e.x, e.z, e.w.min, 'rgba(255,120,100,0.35)'); }
  } else if (UI.mode === 'power' && ground) {
    const k = UI.md.k;
    if (k === 'gas') projectedCircle(gx, gz, POWERS.gas.radius, 'rgba(200,215,90,0.95)', 'rgba(200,215,90,0.15)');
    else if (k === 'creep') {
      const hq = TEAMS[0].hq || MAP.bases[0];
      let dx = gx - hq.x, dz = gz - hq.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      const px = -dz, pz = dx;
      const quad = [[-20, 0], [20, 0], [20, 42], [-20, 42]].map(([l, f]) => [gx + px * l + dx * f, gz + pz * l + dz * f]);
      ov.beginPath();
      quad.forEach(([x, z], i) => { project(x, groundH(clamp(x, 0, MAP.W), clamp(z, 0, MAP.H)) + 0.3, z, _sp); if (i) ov.lineTo(_sp.x, _sp.y); else ov.moveTo(_sp.x, _sp.y); });
      ov.closePath(); ov.fillStyle = 'rgba(255,90,60,0.15)'; ov.fill(); ov.strokeStyle = 'rgba(255,90,60,0.9)'; ov.lineWidth = 2; ov.stroke();
    } else if (k === 'strafe') {
      const fromZ = MAP.H + 120; let dx = gx - gx, dz = gz - fromZ; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      project(gx - dx * 45, groundH(gx, gz) + 0.3, gz - dz * 45, _sp); const a = { x: _sp.x, y: _sp.y };
      project(gx + dx * 25, groundH(gx, gz) + 0.3, gz + dz * 25, _sp);
      ov.beginPath(); ov.moveTo(a.x, a.y); ov.lineTo(_sp.x, _sp.y); ov.strokeStyle = 'rgba(255,90,60,0.9)'; ov.lineWidth = 8; ov.globalAlpha = 0.4; ov.stroke(); ov.globalAlpha = 1;
    } else projectedCircle(gx, gz, 30, 'rgba(160,200,255,0.9)', 'rgba(160,200,255,0.1)');
  } else if (UI.mode === 'line' && ground) {
    const st = UI.md.start;
    const cells = st ? lineCells(st.x, st.z, gx, gz, UI.md.kind === 'dig' ? 1 : 0) : [cellIdx(gx, gz)];
    const per = ABIL[UI.md.kind === 'dig' ? 'trench' : 'wire'].costPer;
    let n = 0;
    for (const c of cells) {
      const bad = MAP.flags[c] & (F.WATER | F.BLOCK | F.BRIDGE) || (UI.md.kind === 'wire' && (MAP.flags[c] & F.TRENCH));
      if (!bad && !doneCell(UI.md.kind, c)) n++;
      cellQuad(c, bad ? 'rgba(255,90,60,0.9)' : 'rgba(255,215,90,0.95)', bad ? 'rgba(255,90,60,0.15)' : 'rgba(255,215,90,0.2)');
    }
    ov.font = '700 14px "Barlow Condensed", sans-serif'; ov.fillStyle = n * per > TEAMS[0].supply ? '#ff8a75' : '#ffd75a';
    ov.fillText(`${n} sections · ${n * per} supply`, UI.mx + 50, UI.my - 12);
  }
  if (UI.mode === 'build' && UI.ghost) {
    if (ground) {
      const rot = Math.PI, why = canPlace(UI.md.type, 0, gx, gz, rot);
      UI.ghost.visible = true;
      UI.ghost.position.set(gx, terrainH(gx, gz), gz); UI.ghost.rotation.y = rot;
      GHOST_MAT.color.set(why ? 0xff5040 : 0x66ff66);
      if (why) { ov.font = '700 14px "Barlow Condensed", sans-serif'; ov.fillStyle = '#ff8a75'; ov.fillText(why, UI.mx, UI.my - 18); }
    } else UI.ghost.visible = false;
  }
  // box select
  const d = UI.drag;
  if (d && Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > 6) {
    ov.strokeStyle = 'rgba(125,255,122,0.9)'; ov.lineWidth = 1; ov.fillStyle = 'rgba(125,255,122,0.08)';
    ov.fillRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
    ov.strokeRect(Math.min(d.x0, d.x1) + 0.5, Math.min(d.y0, d.y1) + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
  }
}
