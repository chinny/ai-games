// Calamity Bay — HUD, banners, monster select, results

const GOAL = 0.5;
let bannerT = 0, hintT = 0;
function say(text, secs = 2.5, cls = '') {
  const b = $('#banner');
  b.textContent = text; b.className = 'bebas on ' + cls;
  clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('on'), secs * 1000);
}
function showHint(text, secs = 4) {
  const h = $('#hint');
  h.textContent = text; h.classList.add('on');
  clearTimeout(hintT); hintT = setTimeout(() => h.classList.remove('on'), secs * 1000);
}

function buildCards() {
  const wrap = $('#cards');
  for (const id of ['sea', 'mtn']) {
    const d = MDEF[id];
    const el = document.createElement('div');
    el.className = 'card'; el.dataset.id = id; el.style.setProperty('--c', d.color);
    el.tabIndex = 0;
    el.innerHTML = `<h2 class="bebas">${d.name}</h2><div class="origin">${d.origin}</div><p>${d.blurb}</p>` +
      Object.entries(d.stats).map(([k, v]) => `<div class="stat">${k}<div><i style="width:${v * 100}%"></i></div></div>`).join('') +
      `<div class="moves">${d.heavy} <span>·</span> ${d.special} <span>·</span> ${d.roar}<br><span>${d.heal}</span></div>`;
    el.addEventListener('click', () => selectMonster(id));
    el.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Space') { selectMonster(id); e.preventDefault(); } });
    wrap.appendChild(el);
  }
  selectMonster('sea');
  $('#help').innerHTML = isTouch
    ? 'Left thumb: walk · Right thumb: look · <b>SMASH</b> combo · <b>HEAVY</b> · <b>GRAB</b> then throw · <b>SPECIAL</b> when rage is full<br>Destroy half the city before the military brings you down.'
    : '<b>WASD</b> move · <b>Shift</b> charge · <b>Mouse</b> look · <b>Left click</b> combo · <b>Right click</b> heavy · <b>E</b> grab / throw · <b>F</b> special · <b>Space</b> roar<br>Destroy half the city before the military brings you down.';
  try { const best = JSON.parse(localStorage.getItem('calamity-bay-best') || 'null'); if (best) $('#best').textContent = `BEST RAMPAGE · ${best.pct}% DESTROYED · ${fmtMoney(best.money)} · ${best.name}`; } catch (e) { /* storage blocked */ }
}
function selectMonster(id) {
  selected = id;
  for (const c of document.querySelectorAll('.card')) c.classList.toggle('sel', c.dataset.id === id);
  document.documentElement.style.setProperty('--accent', MDEF[id].color);
}

let hudT = 0;
function updateHUD(dt) {
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.1;
  const d = MON.def;
  $('#mname').textContent = d.name;
  const hp = MON.hp / d.hp;
  $('#hp i').style.width = (hp * 100).toFixed(1) + '%';
  $('#hp').classList.toggle('low', hp < 0.25);
  $('#rage i').style.width = MON.rage.toFixed(1) + '%';
  $('#rage').classList.toggle('full', MON.rage >= 100);
  $('#ready').textContent = MON.beamOn ? 'F TO STOP' : MON.rage >= 100 ? (isTouch ? `${d.special.toUpperCase()} READY` : `F · ${d.special.toUpperCase()} READY`) : '';
  $('#homeTag').textContent = MON.home && MON.hp < d.hp ? 'HEALING' : '';
  const pct = STATS.wGone / STATS.wTotal;
  $('#pct').innerHTML = `${Math.floor(pct * 100)}%<small>DESTROYED</small>`;
  $('#dbar i').style.width = Math.min(100, pct / GOAL * 100) + '%';
  $('#dbar b').style.left = 'calc(100% - 2px)';
  $('#threat span').innerHTML = '★'.repeat(MIL.level) + '<em>' + '☆'.repeat(5 - MIL.level) + '</em>';
  $('#money').textContent = fmtMoney(STATS.money) + ' IN DAMAGE';
}
function setKeysHelp() {
  const d = MON.def;
  $('#keys').innerHTML = isTouch ? '' : `<b>LMB</b> combo · <b>RMB</b> ${d.heavy} · <b>E</b> grab/throw · <b>F</b> ${d.special} · <b>Space</b> ${d.roar} · <b>Shift</b> charge · <b>Wheel</b> zoom · <b>M</b> mute`;
  setTimeout(() => { $('#keys').style.opacity = 0.35; }, 20000);
}

function gradeFor(p) { return p >= 0.8 ? 'S' : p >= 0.6 ? 'A' : p >= 0.45 ? 'B' : p >= 0.3 ? 'C' : 'D'; }
function showEnd(win) {
  const pct = STATS.wGone / STATS.wTotal;
  const E = $('#end');
  E.classList.toggle('lose', !win);
  $('#endTitle').textContent = win ? 'CALAMITY BAY HAS FALLEN' : 'THE CITY STANDS';
  $('#endSub').textContent = win && MON.dead
    ? `${MON.def.name} levelled the city before the military finally brought it down at ${fmtTime(playT)}. Nobody is calling that a victory.`
    : win
    ? `${MON.def.name} reduced half the skyline to rubble in ${fmtTime(playT)}. The evacuation is going well, all things considered.`
    : `${MON.def.name} went down after ${fmtTime(playT)}. They'll be rebuilding for years anyway.`;
  $('#grade').textContent = gradeFor(pct);
  const st = [
    ['DESTROYED', Math.floor(pct * 100) + '%'], ['DAMAGE', fmtMoney(STATS.money)], ['BUILDINGS DOWN', STATS.down],
    ['VEHICLES', STATS.cars], ['MILITARY', STATS.units], ['TIME', fmtTime(playT)],
  ];
  $('#stats').innerHTML = st.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
  $('#cont').hidden = !win || MON.dead;
  E.hidden = false;
  try {
    const best = JSON.parse(localStorage.getItem('calamity-bay-best') || 'null');
    if (!best || STATS.money > best.money) localStorage.setItem('calamity-bay-best', JSON.stringify({ pct: Math.floor(pct * 100), money: STATS.money, name: MON.def.name }));
  } catch (e) { /* storage blocked */ }
}
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
