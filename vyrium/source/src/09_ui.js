// ===================== UI =====================
const UI = {
  dirty: true, sel: null, ctx: {}, toastT: 0, commT: 0, hitT: 0, dirI: 0, tgtT: 0, qT: 0, tgt: null, marks: [], mPool: [], pendingDrops: [],
  init() {
    if (isTouch) document.body.classList.add('touch');
    const cm = $('compassMarks'); for (let i = 0; i < 60; i++) { const d = document.createElement('div'); d.className = 'cm'; d.style.display = 'none'; cm.appendChild(d); this.mPool.push(d); }
    $('pnClose').onclick = () => this.closePanel(true);
    $('respawnBtn').onclick = () => { if (P.dead) P.respawn(); };
    $('pnTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { Sfx.play('ui'); this.showTab(b.dataset.tab); } });
    $('pnBody').addEventListener('click', e => this.onPanelClick(e));
    $('pnBody').addEventListener('input', e => this.onSetting(e));
    $('pnBody').addEventListener('change', e => this.onSetting(e));
  },
  // ---------- title / create ----------
  showTitle() {
    $('screen-title').hidden = false; $('screen-create').hidden = true; const s = Store.get('save', null); const m = $('titleMenu');
    m.innerHTML = (s ? `<button class="btn primary" data-a="continue">Continue</button><div class="save-info">${esc(s.name)} · LV ${s.level} ${PROFESSIONS[s.prof].name} · ${esc(ZMAP[s.zone] ? ZMAP[s.zone].n : '')}</div>` : '') +
      `<button class="btn ${s ? '' : 'primary'}" data-a="new">New contract</button><button class="btn" data-a="settings">Settings & controls</button>`;
    m.onclick = (e) => { const a = e.target.closest('[data-a]'); if (!a) return; Sfx.init(); Sfx.play('ui');
      if (a.dataset.a === 'continue') Game.continueGame(); else if (a.dataset.a === 'new') this.showCreate(); else { this.openPanel('system', { fromTitle: true }); } };
  },
  showCreate() {
    $('screen-title').hidden = true; $('screen-create').hidden = false; const st = this.cst = this.cst || { fac: 'neutral', prof: 'soldier' };
    const draw = () => {
      $('cFac').innerHTML = Object.values(FACTIONS).map(f => `<button class="pick ${st.fac === f.id ? 'sel' : ''}" style="--pc:${f.color}" data-f="${f.id}"><h4>${f.name}</h4><p>${f.blurb}</p><div class="pas">Starts in ${ZMAP[HOME_CITY[f.id]].n}</div></button>`).join('');
      $('cProf').innerHTML = Object.values(PROFESSIONS).map(p => `<button class="pick ${st.prof === p.id ? 'sel' : ''}" style="--pc:${p.color}" data-p="${p.id}"><h4>${p.name}</h4><div class="sk">Skill: ${p.skill}</div><p>${p.desc}</p><div class="pas">${p.passive}</div></button>`).join('');
      $('cSum').textContent = `${FACTIONS[st.fac].short} ${PROFESSIONS[st.prof].name}`;
    };
    draw();
    $('cFac').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { st.fac = b.dataset.f; Sfx.play('ui'); draw(); } };
    $('cProf').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { st.prof = b.dataset.p; Sfx.play('ui'); draw(); } };
    $('cBack').onclick = () => { $('screen-create').hidden = true; this.showTitle(); };
    $('cGo').onclick = () => { Sfx.init(); const n = ($('cName').value || 'Contractor').trim().slice(0, 18) || 'Contractor'; $('screen-create').hidden = true; Game.newGame(n, st.fac, st.prof); };
  },
  // ---------- HUD ----------
  setZoneMarks() {
    this.marks = [];
    for (const g of zone.gateSpots || []) { const t = ZMAP[g.to]; this.marks.push({ x: g.x, z: g.z, label: t.n, color: t.f ? FACTIONS[t.f].color : t.k === 'veil' || t.k === 'dungeon' ? '#c26bff' : '#8fd8ff' }); }
    for (const tr of zone.triggers) if (tr.kind === 'door' || zone.k === 'dungeon') { const t = ZMAP[tr.to]; this.marks.push({ x: tr.x, z: tr.z, label: t.n, color: '#c26bff' }); }
    for (const i of zone.interact) { if (i.kind === 'relay') this.marks.push({ x: i.x, z: i.z, label: 'Relay', color: '#4fd6ff' }); if (i.kind === 'vendor') this.marks.push({ x: i.x, z: i.z, label: 'Arms', color: '#ffc23a' }); if (i.kind === 'terminal') this.marks.push({ x: i.x, z: i.z, label: 'Missions', color: '#ffc23a' }); }
  },
  update(dt) {
    if (Game.state !== 'play') return;
    const zt = $('zoneTime'), tl = zone.day ? DayClock.label() : ''; if (zt.textContent !== tl) zt.textContent = tl;
    const w = (el, f) => { el.style.width = (clamp(f, 0, 1) * 100).toFixed(1) + '%'; };
    const sh = $('bSh'), hp = $('bHp');
    w(sh.firstElementChild, P.maxSh ? P.sh / P.maxSh : 0); sh.lastElementChild.textContent = fmt(P.sh);
    w(hp.firstElementChild, P.hp / P.maxHp); hp.lastElementChild.textContent = fmt(Math.max(0, P.hp));
    w($('bNano').firstElementChild, P.nano / P.maxNano);
    w($('xpFill'), P.xp / xpNeed(P.level));
    const it = P.gun();
    if (this.dirty) {
      this.dirty = false;
      $('lvlTag').textContent = `LV ${P.level}  ·  ${P.name}${P.pts ? `  ·  ${P.pts} PTS` : ''}`; $('credits').textContent = fmtInt(P.credits) + ' cr';
      $('wName').textContent = it ? it.name : 'Unarmed'; $('wName').style.color = it ? RARITY[it.rar].c : '#aaa';
      $('wSlots').innerHTML = P.weapons.map((x, i) => `<span class="${x ? 'has' : ''} ${i === P.cur ? 'cur' : ''}"></span>`).join('');
      $('nades').textContent = `Grenades ${P.grenades}`; $('skillName').textContent = PROFESSIONS[P.prof].skill;
    }
    if (it) { $('wAmmo').innerHTML = `${P.overdrive > 0 ? '∞' : it.cur}<small> / ${P.ammo[it.kind]}</small>`; $('wMeta').innerHTML = P.reloadT > 0 ? '<span style="color:#ffb52e">Reloading…</span>' : `${KINDS[it.kind].n}${it.el !== 'kinetic' ? ` · <span style="color:${ELEMENTS[it.el].c}">${ELEMENTS[it.el].n}</span>` : ''}`; }
    const pr = PROFESSIONS[P.prof]; const ico = $('skillIco'); ico.firstElementChild.style.height = (P.skillCd / (pr.cd * P.cdMul) * 100) + '%'; ico.classList.toggle('ready', P.skillCd <= 0 && P.nano >= pr.cost);
    // crosshair
    const sniperAds = it && it.kind === 'sniper' && P.adsT > 0.9; $('scope').hidden = !sniperAds; $('crosshair').style.display = sniperAds ? 'none' : '';
    if (it) { const sp = 5 + it.sp * P.accMul * (P.adsT > 0.5 ? 0.4 : 1) * (1 + P.bloom) * (P.moving ? 1.3 : 1) * 700; const ch = $('crosshair').children; ch[0].style.top = (-sp - 8) + 'px'; ch[1].style.top = sp + 'px'; ch[2].style.left = (-sp - 8) + 'px'; ch[3].style.left = sp + 'px'; }
    this.hitT -= dt; $('hitmark').style.opacity = Math.max(0, this.hitT * 5);
    this.compass();
    // prompt / loot card
    const ni = Game.nearestInteract(); const pe = $('prompt'), lc = $('lootCard');
    if (ni && ni.type === 'pickup') { pe.hidden = true; lc.hidden = false; if (lc.dataset.uid !== ni.p.item.uid) { lc.dataset.uid = ni.p.item.uid; const cmp = equippedFor(ni.p.item); lc.innerHTML = itemCard(ni.p.item, cmp) + `<div class="pick-hint"><kbd>${isTouch ? 'USE' : 'E'}</kbd> Pick up</div>`; } }
    else { lc.hidden = true; lc.dataset.uid = ''; if (ni) { pe.hidden = false; pe.innerHTML = `<kbd>${isTouch ? 'USE' : 'E'}</kbd>${ni.i.label}`; } else pe.hidden = true; }
    if (isTouch) $('tUse').hidden = !ni;
    // target
    this.tgtT -= dt; if (this.tgtT <= 0) { this.tgtT = 0.1; const o = camera.position, d = camera.getWorldDirection(_v3.set(0, 0, 0)); let best = null, bt = 140;
      for (const e of enemies) { if (e.dead) continue; const c = e.center(new THREE.Vector3()); const t = raySphere(o, d, c, e.r * 1.4 + 0.3); if (t > 0 && t < bt) { bt = t; best = e; } } this.tgt = best && zone.rayWorld(o, d, bt) >= bt - 0.5 ? best : null; }
    const te = $('target'), tg = this.tgt;
    if (tg && !tg.dead && !tg.boss) { te.hidden = false; const diff = tg.lvl - P.level; const col = !tg.hostile ? '#9be37a' : diff >= 5 ? '#ff4a3d' : diff >= 2 ? '#ffd84a' : diff <= -5 ? '#8a9aa8' : '#ffffff';
      te.firstElementChild.innerHTML = `<span style="color:${col}">${diff >= 5 && tg.hostile ? '☠ ' : ''}${esc(tg.name)}</span><em>LV ${tg.lvl}</em>`; const m = te.lastElementChild; m.firstElementChild.style.width = (tg.hp / tg.maxHp * 100) + '%'; m.lastElementChild.style.width = (tg.maxSh ? tg.sh / tg.maxHp * 100 : 0) + '%'; }
    else te.hidden = true;
    const boss = enemies.find(e => e.boss && !e.dead && e.state === 'chase'); const bb = $('bossBar');
    if (boss) { bb.hidden = false; bb.firstElementChild.textContent = `${boss.name}  ·  LV ${boss.lvl}`; const m = bb.lastElementChild; m.firstElementChild.style.width = (boss.hp / boss.maxHp * 100) + '%'; m.lastElementChild.style.width = (boss.maxSh ? boss.sh / boss.maxHp * 100 : 0) + '%'; } else bb.hidden = true;
    this.qT -= dt; if (this.qT <= 0) { this.qT = 0.4; this.renderQuest(); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').hidden = true; }
    if (this.commT > 0) { this.commT -= dt; if (this.commT <= 0) $('comm').hidden = true; }
    if (P.downed) $('ffylBar').firstElementChild.style.width = (P.downT / 10 * 100) + '%';
    for (const i of $('dmgDir').children) { const o = parseFloat(i.style.opacity || 0); if (o > 0) i.style.opacity = Math.max(0, o - dt * 1.2); }
    const feed = $('feed'); for (const c of [...feed.children]) { c._t = (c._t || 0) + dt; if (c._t > 3) c.remove(); else if (c._t > 2.4) c.style.opacity = (3 - c._t) / 0.6; }
  },
  bearing(x, z) { const yt = Math.atan2(-(x - P.pos.x), -(z - P.pos.z)); return Math.atan2(Math.sin(yt - P.yaw), Math.cos(yt - P.yaw)); },
  compass() {
    const el = $('compass'); const W = el.clientWidth; const span = Math.PI * 0.8; let k = 0; const pool = this.mPool;
    const place = (rel, cls, text, color) => { if (Math.abs(rel) > span / 2 || k >= pool.length) return; const d = pool[k++]; d.style.display = 'block'; d.className = 'cm ' + cls; d.style.left = (W / 2 - rel / (span / 2) * (W / 2)).toFixed(1) + 'px'; d.textContent = text; d.style.color = color || ''; };
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    [['N', 0], ['E', -Math.PI / 2], ['S', Math.PI], ['W', Math.PI / 2]].forEach(([n, a]) => place(wrap(a - P.yaw), 'card', n));
    for (let a = 0; a < 24; a++) if (a % 6) place(wrap(a * TAU / 24 - P.yaw), 'tick', '');
    for (const m of this.marks) { const d = Math.hypot(m.x - P.pos.x, m.z - P.pos.z); if (d < 4) continue; place(this.bearing(m.x, m.z), 'mk', m.label + (d > 30 ? ` ${Math.round(d)}m` : ''), m.color); }
    const obj = Game.objectiveSpot(); if (obj) place(this.bearing(obj.x, obj.z), 'mk', obj.label + ` ${Math.round(Math.hypot(obj.x - P.pos.x, obj.z - P.pos.z))}m`, '#ffb52e');
    for (; k < pool.length; k++) pool[k].style.display = 'none';
  },
  renderQuest() {
    const q = MAIN_QUEST[P.quest]; let h = '';
    if (q) { const z = ZMAP[q.z]; h += `<div class="q-h">Main contract</div><div class="q-t">${q.t}${zone.id !== q.z ? ` <span style="color:var(--dim)">(Lv ${z.l[0]}-${z.l[1]})</span>` : ''}</div>`; }
    else if (P.finished) h += `<div class="q-h">Main contract</div><div class="q-t">Complete. Vesh is free to roam.</div>`;
    const m = P.mission; if (m) { const z = ZMAP[m.zone]; h += `<div class="q-h">Mission</div><div class="q-t q-m">${esc(Game.missionText(m))}${zone.id !== m.zone ? `<br><span style="color:var(--dim)">Travel to ${z.n}</span>` : m.type === 'purge' ? ` · ${m.prog}/${m.n}` : ''}</div>`; }
    if (this._qh !== h) { this._qh = h; $('quest').innerHTML = h; }
  },
  hitmark(crit, kill) { this.hitT = 0.2; const h = $('hitmark'); h.className = kill ? 'kill' : crit ? 'crit' : ''; },
  dmgDir(src) { const rel = this.bearing(src.x, src.z); const i = $('dmgDir').children[this.dirI++ % 4]; i.style.transform = `rotate(${(-rel).toFixed(2)}rad)`; i.style.opacity = 1; },
  toast(text, cls = '') { const t = $('toast'); t.textContent = text; t.className = cls; t.hidden = false; this.toastT = cls === 'big' ? 2.2 : 1.8; },
  feed(text, color) { const d = document.createElement('div'); d.textContent = text; d.style.color = color || '#fff'; $('feed').prepend(d); while ($('feed').children.length > 6) $('feed').lastChild.remove(); },
  comm(text, who = 'Ilsa Marr · Relay Ops') { const c = $('comm'); c.querySelector('.c-who').textContent = who; c.querySelector('.c-text').textContent = text; c.hidden = false; this.commT = 9; Sfx.play('comm'); },
  banner() { const d = zone.def, b = $('banner'); b.querySelector('.b-reg').textContent = d.reg || ''; b.querySelector('.b-name').textContent = d.n; b.querySelector('.b-lvl').textContent = d.l && d.k !== 'city' ? `LEVEL ${d.l[0]} – ${d.l[1]}` : d.f ? FACTIONS[d.f].name.toUpperCase() : ''; b.hidden = false; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    $('zoneName').textContent = d.n; $('zoneSub').textContent = (d.l && d.k !== 'city' ? `Lv ${d.l[0]}-${d.l[1]} · ` : '') + (d.reg || ''); },
  bossIntro(e) { const b = $('bossCard'); b.querySelector('.bc-name').textContent = e.name; b.querySelector('.bc-flavor').textContent = zone.def.boss ? zone.def.boss[2] : ''; b.hidden = false; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); Sfx.play('boss'); },
  levelUp(l) { const b = $('levelUp'); b.innerHTML = `LEVEL ${l}<small>+3 attribute points · open Inventory › Stats</small>`; b.hidden = false; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); this.dirty = true; },
  ffyl(on) { $('ffyl').hidden = !on; },
  death(fee) { $('deathTxt').textContent = `Reclaim fee: ${fmtInt(fee)} credits. Your body is being reprinted at the last Reclaim Booth.`; $('deathScreen').hidden = false; this.deathTimer = setTimeout(() => { if (P.dead) P.respawn(); }, 4500); },
  hideDeath() { $('deathScreen').hidden = true; clearTimeout(this.deathTimer); },

  // ---------- panel ----------
  openPanel(tab, ctx = {}) {
    this.ctx = ctx; Game.panel = tab; releasePointer(); $('panel').hidden = false; $('touch').hidden = true; this.sel = null;
    if (ctx.vendor && !ctx.stock) ctx.stock = Game.vendorStock(ctx.vendor);
    if (ctx.terminal && !P.offers) P.offers = Game.genOffers();
    this.showTab(tab);
  },
  closePanel(relock) {
    if (this.ctx.fromTitle) { $('panel').hidden = true; Game.panel = null; return; }
    $('panel').hidden = true; Game.panel = null; if (isTouch && Game.state === 'play') $('touch').hidden = false;
    for (const it of this.pendingDrops) { const f = camera.getWorldDirection(new THREE.Vector3()); dropPickup('item', P.pos.clone().add(new THREE.Vector3(f.x * 2, 1.2, f.z * 2)), { item: it }); } this.pendingDrops = [];
    this.dirty = true; Game.save();
    if (relock && !isTouch && !Input.lockFailed && Game.state === 'play') { try { const r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } }
  },
  tabs() {
    if (this.ctx.fromTitle) return [['system', 'Settings']];
    const t = [['inventory', 'Inventory'], ['stats', 'Stats'], ['atlas', 'Atlas'], ['missions', 'Missions']];
    if (this.ctx.vendor) t.unshift(['vendor', this.ctx.vendor === 'arms' ? 'Arms Vendor' : 'Supply']);
    t.push(['system', 'System']); return t;
  },
  showTab(tab) {
    Game.panel = tab; this.tab = tab; $('pnTabs').innerHTML = this.tabs().map(([k, n]) => `<button class="pn-tab ${k === tab ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('');
    const b = $('pnBody'); b.scrollTop = 0;
    if (tab === 'inventory') this.renderInv(); else if (tab === 'stats') this.renderStats(); else if (tab === 'atlas') this.renderAtlas(); else if (tab === 'missions') this.renderMissions(); else if (tab === 'vendor') this.renderVendor(); else this.renderSystem();
  },
  row(it, attrs, key, extra = '') {
    if (!it) return `<div class="irow empty" ${attrs}><span class="k">${key || ''}</span><span class="n">Empty</span></div>`;
    const sel = this.sel && attrs.includes(`data-${this.sel.w}="${this.sel.i}"`) ? 'sel' : '';
    const meta = it.type === 'gun' ? `${KINDS[it.kind].n} · ${fmt(it.dmg)}${it.pel > 1 ? '×' + it.pel : ''} · LV ${it.lvl}` : it.type === 'glim' ? `Glim · ${it.reach.toFixed(0)}m light · LV ${it.lvl}` : `Shield · ${fmt(it.cap)} · LV ${it.lvl}`;
    return `<div class="irow ${sel}" style="--rc:${RARITY[it.rar].c}" ${attrs}><span class="k">${key || ''}</span><span class="nm"><span class="n">${esc(it.name)}${it.el && it.el !== 'kinetic' ? ` <span style="color:${ELEMENTS[it.el].c}">●</span>` : ''}</span><span class="m">${meta}${extra}</span></span></div>`;
  },
  selItem() { const s = this.sel; if (!s) return null; if (s.w === 'w') return P.weapons[s.i]; if (s.w === 's') return P.shieldItem; if (s.w === 'g') return P.glimItem; if (s.w === 'p') return P.pack[s.i]; if (s.w === 'b') return this.ctx.stock && this.ctx.stock[s.i]; return null; },
  renderInv() {
    const it = this.selItem(); const s = this.sel; let acts = '';
    if (it && s.w === 'p') { if (it.type === 'gun') acts += [0, 1, 2, 3].map(i => `<button class="btn small" data-act="equip" data-slot="${i}">Equip → ${i + 1}</button>`).join(''); else if (it.type === 'glim') acts += `<button class="btn small" data-act="equipGlim">Equip glim</button>`; else acts += `<button class="btn small" data-act="equipShield">Equip shield</button>`; acts += `<button class="btn small" data-act="drop">Drop</button>`; if (this.ctx.vendor) acts += `<button class="btn small primary" data-act="sell">Sell ${fmtInt(it.value)} cr</button>`; }
    if (it && s.w === 'g') acts += `<button class="btn small" data-act="glimToggle">${P.glimOn ? 'Turn light off' : 'Turn light on'}</button>`;
    if (it && s.w === 'w') { acts += `<button class="btn small" data-act="active">Make active</button><button class="btn small" data-act="unequip">Move to backpack</button>`; }
    const cmp = it && s.w !== 'w' && s.w !== 's' && s.w !== 'g' ? equippedFor(it) : null;
    $('pnBody').innerHTML = `<div class="inv">
      <div><h3>Equipped <span>${fmtInt(P.credits)} cr</span></h3>${P.weapons.map((w, i) => this.row(w, `data-w="${i}"`, i + 1, i === P.cur ? ' · active' : '')).join('')}${this.row(P.shieldItem, 'data-s="0"', '◆')}${this.row(P.glimItem, 'data-g="0"', '✦', P.glimItem ? (P.glimOn ? ' · auto' : ' · off') : '')}
        <h3 style="margin-top:14px">Ammo <span>Grenades ${P.grenades}</span></h3><div class="stats2">${Object.keys(AMMO).map(k => `<div class="stat"><span>${AMMO[k].n}</span><b>${P.ammo[k]} / ${AMMO[k].max}</b></div>`).join('')}</div></div>
      <div><h3>Backpack <span>${P.pack.length} / ${P.packMax}</span></h3>${P.pack.length ? P.pack.map((p, i) => this.row(p, `data-p="${i}"`, '')).join('') : '<div class="irow empty">Nothing yet. Loot drops, chests and vendors fill this.</div>'}</div>
      <div>${it ? itemCard(it, cmp) + `<div class="acts">${acts}</div>` : '<h3>Select an item</h3><p style="color:var(--dim);font-size:13px">Tap any item to compare it with what you have equipped. Green arrows are upgrades.</p>'}</div></div>`;
  },
  renderStats() {
    const pr = PROFESSIONS[P.prof]; const f = FACTIONS[P.faction];
    $('pnBody').innerHTML = `<div class="inv" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
      <div><h3>Attributes <span style="color:var(--amber)">${P.pts} points</span></h3>${ATTRS.map(([k, n, d]) => `<div class="attr"><div><b>${n}</b><small>${d}</small></div><span class="v">${P.attrs[k]}</span><button class="btn small" data-act="attr" data-k="${k}" ${P.pts ? '' : 'disabled'}>+1</button></div>`).join('')}</div>
      <div><h3>${esc(P.name)} <span style="color:${f.color}">${f.name}</span></h3>
        <div class="stats2">${[['Level', P.level], ['Profession', pr.name], ['Max health', fmt(P.maxHp)], ['Max shield', fmt(P.maxSh)], ['Nano pool', fmt(P.maxNano)], ['Crit damage', '+' + Math.round((P.critMul - 1) * 100) + '%'], ['Reload speed', '+' + Math.round((1 / P.rlMul - 1) * 100) + '%'], ['Move speed', '+' + Math.round((P.spdMul - 1) * 100) + '%'], ['Elemental dmg', '+' + Math.round((P.elMul - 1) * 100) + '%'], ['Skill cooldown', '-' + Math.round((1 - P.cdMul) * 100) + '%'], ['Kills', fmtInt(P.kills)], ['Bosses', P.bosses.length], ['Missions', P.missionsDone], ['Time played', Math.floor(P.playTime / 3600) + 'h ' + Math.floor(P.playTime % 3600 / 60) + 'm']].map(([a, b]) => `<div class="stat"><span>${a}</span><b>${b}</b></div>`).join('')}</div>
        <h3 style="margin-top:14px">${pr.skill} <span>${pr.cost} Nano · ${Math.round(pr.cd * P.cdMul)}s</span></h3><p style="font-size:13px;color:#b9cbd8;margin:0">${pr.desc}</p><p style="font-size:12px;color:var(--ok)">${pr.passive}</p></div></div>`;
  },
  renderMissions() {
    const m = P.mission; let h = '';
    if (m) h += `<h3>Active mission</h3><div class="mcards"><div class="mcard" style="border-color:var(--amber)">${this.missionCard(m)}<div class="acts"><button class="btn small" data-act="abandon">Abandon</button></div></div></div>`;
    if (this.ctx.terminal) {
      const offs = P.offers || []; h += `<h3 style="margin-top:16px">Terminal offers <span><button class="btn small" data-act="reroll">New offers · ${fmtInt(10 + P.level * 4)} cr</button></span></h3><div class="mcards">${offs.map((o, i) => `<div class="mcard">${this.missionCard(o)}<div class="acts"><button class="btn small primary" data-act="accept" data-i="${i}" ${m ? 'disabled' : ''}>${m ? 'Finish active mission first' : 'Accept'}</button></div></div>`).join('')}</div>`;
    } else if (!m) h += `<p style="color:var(--dim)">No active mission. Mission Terminals in every city and town hand out contracts matched to your level.</p>`;
    $('pnBody').innerHTML = h;
  },
  missionCard(m) { const z = ZMAP[m.zone]; const dc = ['#3fe06b', '#ffd84a', '#ff6a4a'][m.diff]; return `<div class="diff" style="color:${dc}">${['Easy', 'Standard', 'Hard'][m.diff]} · ${z.n} · LV ${m.lvl}</div><h4>${esc(Game.missionTitle(m))}</h4><p>${esc(Game.missionText(m))}</p><div class="lbl">Reward: ${fmtInt(m.reward.cr)} cr · ${fmtInt(m.reward.xp)} XP</div>${itemCard(m.reward.item)}`; },
  renderVendor() {
    const c = this.ctx; const it = this.selItem(); const s = this.sel;
    if (c.vendor === 'arms') {
      let acts = ''; if (it && s.w === 'b') acts = `<button class="btn small primary" data-act="buy" ${P.credits >= it.value * 2.5 ? '' : 'disabled'}>Buy ${fmtInt(it.value * 2.5)} cr</button>`; if (it && s.w === 'p') acts = `<button class="btn small primary" data-act="sell">Sell ${fmtInt(it.value)} cr</button>`;
      const cmp = equippedFor(it);
      $('pnBody').innerHTML = `<div class="shop"><div><h3>For sale <span>${fmtInt(P.credits)} cr</span></h3>${c.stock.map((x, i) => x ? this.row(x, `data-b="${i}"`, '', ` · ${fmtInt(x.value * 2.5)} cr`) : '').join('')}
        <h3 style="margin-top:14px">Sell from backpack</h3>${P.pack.length ? P.pack.map((p, i) => this.row(p, `data-p="${i}"`, '', ` · ${fmtInt(p.value)} cr`)).join('') : '<div class="irow empty">Backpack is empty</div>'}</div>
        <div>${it ? itemCard(it, cmp) + `<div class="acts">${acts}</div>` : '<h3>Select an item</h3>'}</div></div>`;
    } else {
      const L = P.level; const rows = Object.keys(AMMO).map(k => { const miss = AMMO[k].max - P.ammo[k]; const cost = Math.ceil(miss / AMMO[k].max * (20 + L * 12)); return `<div class="irow" style="--rc:var(--ok)"><span class="n" style="color:var(--fg)">${AMMO[k].n} ammo</span><span class="m">${P.ammo[k]}/${AMMO[k].max}</span><button class="btn small" data-act="ammo" data-k="${k}" data-c="${cost}" ${miss > 0 && P.credits >= cost ? '' : 'disabled'}>Fill · ${cost} cr</button></div>`; }).join('');
      const nadeC = 25 + L * 6, healC = 15 + L * 8, packN = (P.packMax - 24) / 4, packC = 400 * Math.pow(2, packN);
      $('pnBody').innerHTML = `<h3>Supply <span>${fmtInt(P.credits)} cr</span></h3><div class="supply">${rows}
        <div class="irow" style="--rc:var(--ok)"><span class="n" style="color:var(--fg)">Grenade</span><span class="m">${P.grenades}/4</span><button class="btn small" data-act="nade" data-c="${nadeC}" ${P.grenades < 4 && P.credits >= nadeC ? '' : 'disabled'}>Buy · ${nadeC} cr</button></div>
        <div class="irow" style="--rc:var(--ok)"><span class="n" style="color:var(--fg)">Med-nano infusion</span><span class="m">${fmt(P.hp)}/${fmt(P.maxHp)}</span><button class="btn small" data-act="heal" data-c="${healC}" ${P.hp < P.maxHp && P.credits >= healC ? '' : 'disabled'}>Full heal · ${healC} cr</button></div>
        <div class="irow" style="--rc:var(--ok)"><span class="n" style="color:var(--fg)">Backpack expansion</span><span class="m">${P.packMax} slots</span><button class="btn small" data-act="pack" data-c="${packC}" ${packN < 6 && P.credits >= packC ? '' : 'disabled'}>+4 slots · ${fmtInt(packC)} cr</button></div></div>`;
    }
  },
  renderSystem() {
    const fromTitle = this.ctx.fromTitle;
    $('pnBody').innerHTML = `<div class="inv" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div>
      ${fromTitle ? '' : `<h3>Game</h3><div class="pause-menu" style="margin:0 0 16px;max-width:none"><button class="btn primary" data-act="resume">Resume</button><button class="btn" data-act="save">Save now</button><button class="btn" data-act="quit">Save and quit to title</button></div>`}
      <h3>Settings</h3>
      <div class="set"><label for="sVol">Sound effects</label><input type="range" id="sVol" min="0" max="1" step="0.05" value="${Sfx.vol}"><output>${Math.round(Sfx.vol * 100)}</output></div>
      <div class="set"><label for="sMus">Music</label><input type="range" id="sMus" min="0" max="1" step="0.05" value="${Sfx.mvol}"><output>${Math.round(Sfx.mvol * 100)}</output></div>
      <div class="set"><label for="sSens">Look sensitivity</label><input type="range" id="sSens" min="0.2" max="3" step="0.05" value="${SENS.v}"><output>${SENS.v.toFixed(2)}</output></div>
      <div class="set"><label for="sFov">Field of view</label><input type="range" id="sFov" min="60" max="100" step="1" value="${GFX.fov}"><output>${GFX.fov}</output></div>
      <div class="set"><label for="sQ">Render quality</label><input type="range" id="sQ" min="0" max="2" step="1" value="${GFX.quality}"><output>${QUALITY[GFX.quality].name}</output></div>
      <div class="set"><label for="sDay">Day length</label><input type="range" id="sDay" min="0" max="${DAY_LENS.length - 1}" step="1" value="${DayClock.len}"><output>${DAY_LENS[DayClock.len].name}</output></div>
      <div class="set"><label for="sInv">Invert look</label><input type="checkbox" id="sInv" ${SENS.invert ? 'checked' : ''}><output></output></div>
      </div><div><h3>Controls</h3><div class="keys">${[['Move', 'WASD'], ['Look', 'Mouse'], ['Fire', 'LMB'], ['Aim down sights', 'RMB'], ['Jump', 'Space'], ['Sprint', 'Shift'], ['Reload', 'R'], ['Profession skill', 'Q'], ['Grenade', 'G'], ['Melee', 'V'], ['Interact / pick up', 'E'], ['Shoulder light', 'T'], ['Weapons', '1-4 / Wheel'], ['Inventory', 'Tab / I'], ['Atlas', 'M'], ['Menu', 'Esc / P']].map(([a, b]) => `<div><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</div>
      <p style="font-size:12px;color:var(--dim);line-height:1.5;margin-top:12px">On touch screens: drag the left side to move (push to the top edge to sprint), drag the right side to look, and use the on-screen buttons. Progress saves automatically in this browser.</p>
      ${fromTitle ? '' : `<h3 style="margin-top:14px">Danger zone</h3><button class="btn small" data-act="wipe">Delete save and restart</button><span id="wipeConfirm"></span>`}</div></div>`;
  },
  onSetting(e) {
    const t = e.target; if (!t.id) return; const out = t.nextElementSibling; const v = t.type === 'checkbox' ? t.checked : parseFloat(t.value);
    if (t.id === 'sVol') { Sfx.setVol(v); out.textContent = Math.round(v * 100); } else if (t.id === 'sMus') { Sfx.setMusic(v); out.textContent = Math.round(v * 100); }
    else if (t.id === 'sSens') { SENS.v = v; Store.set('sens', v); out.textContent = v.toFixed(2); } else if (t.id === 'sFov') { GFX.fov = v; Store.set('fov', v); camera.fov = v; camera.updateProjectionMatrix(); out.textContent = v; }
    else if (t.id === 'sQ') { GFX.quality = v; Store.set('quality', v); onResize(); out.textContent = QUALITY[v].name; } else if (t.id === 'sInv') { SENS.invert = v; Store.set('invert', v); }
    else if (t.id === 'sDay') { DayClock.setLen(v); out.textContent = DAY_LENS[v].name; }
  },
  onPanelClick(e) {
    const r = e.target.closest('[data-w],[data-p],[data-s],[data-g],[data-b]'); const a = e.target.closest('[data-act]');
    if (a) { this.act(a.dataset.act, a.dataset); return; }
    if (r && !r.classList.contains('empty')) { Sfx.play('ui'); const k = ['w', 'p', 's', 'g', 'b'].find(x => r.dataset[x] !== undefined); this.sel = { w: k, i: +r.dataset[k] }; this.showTab(this.tab); }
  },
  act(act, d) {
    const s = this.sel; const it = this.selItem(); Sfx.play('ui');
    switch (act) {
      case 'equip': { const slot = +d.slot; const old = P.weapons[slot]; P.weapons[slot] = it; P.pack.splice(s.i, 1); if (old) P.pack.push(old); if (it.cur == null) it.cur = P.magSize(it); if (slot === P.cur || !old) { VM.set(P.weapons[P.cur]); } this.sel = null; break; }
      case 'equipGlim': { const old = P.glimItem; P.glimItem = it; P.pack.splice(s.i, 1); if (old) P.pack.push(old); this.sel = null; break; }
      case 'glimToggle': Glim.toggle(); break;
      case 'equipShield': { const old = P.shieldItem; P.shieldItem = it; P.pack.splice(s.i, 1); if (old) P.pack.push(old); P.recalc(); P.sh = Math.min(P.sh, P.maxSh); this.sel = null; break; }
      case 'drop': P.pack.splice(s.i, 1); this.pendingDrops.push(it); this.sel = null; break;
      case 'sell': P.credits += it.value; P.pack.splice(s.i, 1); Sfx.play('credits'); this.sel = null; break;
      case 'active': P.setWeapon(s.i); break;
      case 'unequip': { if (P.weapons.filter(Boolean).length < 2) { this.toast('Keep at least one gun equipped', 'warn'); break; } if (P.pack.length >= P.packMax) { this.toast('Backpack full', 'warn'); break; } P.pack.push(it); P.weapons[s.i] = null; if (s.i === P.cur) P.cycleWeapon(1); this.sel = null; break; }
      case 'attr': if (P.pts > 0) { P.attrs[d.k]++; P.pts--; const hf = P.hp / P.maxHp; P.recalc(); P.hp = P.maxHp * hf; } break;
      case 'buy': { const c = it.value * 2.5; if (P.credits < c) break; if (P.takeItem(it)) { P.credits -= c; this.ctx.stock[s.i] = null; Sfx.play('pickup', it.rar); this.sel = null; } break; }
      case 'ammo': P.credits -= +d.c; P.ammo[d.k] = AMMO[d.k].max; Sfx.play('ammo'); break;
      case 'nade': P.credits -= +d.c; P.grenades++; break;
      case 'heal': P.credits -= +d.c; P.hp = P.maxHp; break;
      case 'pack': P.credits -= +d.c; P.packMax += 4; break;
      case 'accept': if (!P.mission) { P.mission = P.offers[+d.i]; P.offers = null; P.mission.prog = 0; this.toast('Mission accepted', 'ok'); Game.missionSpawn(); } break;
      case 'abandon': P.mission = null; break;
      case 'reroll': { const c = 10 + P.level * 4; if (P.credits >= c) { P.credits -= c; P.offers = Game.genOffers(); } break; }
      case 'resume': this.closePanel(true); return;
      case 'save': Game.save(); this.toast('Saved', 'ok'); return;
      case 'quit': Game.save(); this.closePanel(false); Game.quitToTitle(); return;
      case 'wipe': { const w = $('wipeConfirm'); if (!w.dataset.armed) { w.dataset.armed = '1'; w.innerHTML = ' <button class="btn small primary" data-act="wipe2">Yes, delete everything</button>'; } return; }
      case 'wipe2': Store.del('save'); this.closePanel(false); Game.quitToTitle(); return;
      case 'travel': Game.travel(d.z, '_relay'); this.closePanel(true); return;
    }
    this.dirty = true; this.showTab(this.tab);
  },

  // ---------- atlas ----------
  renderAtlas() {
    const travel = !!this.ctx.relay; const sel = this.atlasSel || zone.id;
    $('pnBody').innerHTML = `<div class="atlas"><div><canvas id="atlasCv"></canvas><div class="legend"><span><i style="background:#4fb3ff"></i>Cyrex city</span><span><i style="background:#ff7a3d"></i>Clan city</span><span><i style="background:#9be37a"></i>Neutral city</span><span><i style="background:#c26bff"></i>Dungeon / Veil</span><span><i style="background:#fff;border-radius:50%"></i>Wilds (color = danger)</span><span><i style="background:transparent;border:2px solid #4fd6ff;border-radius:50%"></i>Relay discovered</span></div></div><div class="zinfo" id="zInfo"></div></div>`;
    const cv = $('atlasCv'); const W = cv.clientWidth; const H = Math.round(W * 0.64); const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    const x = cv.getContext('2d'); x.scale(dpr, dpr); const sx = W / 128, sy = H / 82; const X = (p) => 2 + p[0] * sx * 0.98, Y = (p) => 2 + p[1] * sy * 0.97;
    x.fillStyle = '#06111c'; x.fillRect(0, 0, W, H); x.strokeStyle = 'rgba(79,214,255,.07)'; x.lineWidth = 1;
    for (let i = 0; i < 128; i += 8) { x.beginPath(); x.moveTo(X([i, 0]), 0); x.lineTo(X([i, 0]), H); x.stroke(); } for (let j = 0; j < 82; j += 8) { x.beginPath(); x.moveTo(0, Y([0, j])); x.lineTo(W, Y([0, j])); x.stroke(); }
    x.fillStyle = 'rgba(194,107,255,.08)'; x.fillRect(X([106, 0]), 0, W - X([106, 0]), H); x.fillStyle = '#c26bff'; x.font = `700 ${Math.max(9, 11 * sx / 6)}px Chakra Petch, sans-serif`; x.fillText('THE VEIL', X([107, 0]), Y([0, 78]));
    x.fillStyle = 'rgba(255,255,255,.18)'; x.font = `600 ${Math.max(9, 10 * sx / 6)}px Chakra Petch, sans-serif`; [['CYREX TERRITORY', 2, 46], ['NEUTRAL HEARTLAND', 34, 47], ['CLAN FRONTIER', 74, 22], ['SOUTHERN WASTES', 58, 66], ['NORTHERN REACHES', 62, 12]].forEach(([t, a, b]) => x.fillText(t, X([a, 0]), Y([0, b])));
    const drawn = new Set(); x.lineWidth = 1.5;
    for (const z of ZONES) for (const e of z.ex) { const t = ZMAP[e]; const k = [z.id, e].sort().join('|'); if (drawn.has(k) || !t) continue; drawn.add(k); x.strokeStyle = t.k === 'veil' || z.k === 'veil' || t.k === 'dungeon' || z.k === 'dungeon' ? 'rgba(194,107,255,.5)' : 'rgba(143,216,255,.35)'; x.setLineDash(t.k === 'dungeon' || z.k === 'dungeon' ? [3, 3] : []); x.beginPath(); x.moveTo(X(z.p), Y(z.p)); x.lineTo(X(t.p), Y(t.p)); x.stroke(); }
    x.setLineDash([]);
    const mq = MAIN_QUEST[P.quest]; const small = W < 560;
    for (const z of ZONES) {
      const px = X(z.p), py = Y(z.p); const disc = P.discovered.includes(z.id);
      let col = '#fff'; if (z.f && (z.k === 'city' || z.k === 'town' || z.k === 'platform')) col = FACTIONS[z.f].color; else if (z.k === 'dungeon' || z.k === 'veil') col = '#c26bff'; else if (z.l) { const d = z.l[0] - P.level; col = d >= 6 ? '#ff4a3d' : d >= 2 ? '#ffd84a' : z.l[1] < P.level - 6 ? '#7d8d9a' : '#e8f4ff'; }
      x.fillStyle = col; x.beginPath();
      if (z.k === 'city' || z.k === 'platform') x.rect(px - 6, py - 6, 12, 12); else if (z.k === 'town') x.rect(px - 4.5, py - 4.5, 9, 9); else if (z.k === 'dungeon') { x.moveTo(px, py - 6); x.lineTo(px + 6, py); x.lineTo(px, py + 6); x.lineTo(px - 6, py); x.closePath(); } else x.arc(px, py, 5, 0, TAU);
      x.fill(); x.strokeStyle = '#000'; x.lineWidth = 1.5; x.stroke();
      if (z.r && disc) { x.strokeStyle = '#4fd6ff'; x.lineWidth = 2; x.beginPath(); x.arc(px, py, 10, 0, TAU); x.stroke(); }
      if (z.id === zone.id) { x.strokeStyle = '#ffb52e'; x.lineWidth = 3; x.beginPath(); x.arc(px, py, 14, 0, TAU); x.stroke(); }
      if (mq && mq.z === z.id) { x.fillStyle = '#ff4a3d'; x.font = '700 14px Chakra Petch, sans-serif'; x.fillText('★', px + 7, py - 7); }
      if (P.mission && P.mission.zone === z.id) { x.fillStyle = '#ffb52e'; x.font = '700 14px Chakra Petch, sans-serif'; x.fillText('◆', px - 16, py - 7); }
      if (!small || z.k === 'city' || z.id === zone.id || z.id === sel) { x.fillStyle = z.id === sel ? '#ffb52e' : 'rgba(227,238,246,.85)'; x.font = `${z.id === sel ? 700 : 500} ${small ? 9 : 11}px Chakra Petch, sans-serif`; const lab = z.n.replace('Cyrex Prime: ', ''); if (z.p[0] > 104) { x.textAlign = 'right'; x.fillText(lab, px - 9, py + 4); x.textAlign = 'left'; } else x.fillText(lab, px + 8, py + 4); }
    }
    cv.onclick = (ev) => { const r = cv.getBoundingClientRect(); const mx = ev.clientX - r.left, my = ev.clientY - r.top; let best = null, bd = 18; for (const z of ZONES) { const d = Math.hypot(X(z.p) - mx, Y(z.p) - my); if (d < bd) { bd = d; best = z; } } if (best) { this.atlasSel = best.id; Sfx.play('ui'); this.renderAtlas(); } };
    const z = ZMAP[sel]; const disc = P.discovered.includes(z.id);
    const canTravel = travel && z.r && disc && z.id !== zone.id && !(zone.id === 'landfall' && P.quest === 0);
    $('zInfo').innerHTML = `<div class="lbl">${z.reg || ''}</div><h4>${z.n}</h4><div style="margin:6px 0">${z.l && z.k !== 'city' ? `<span class="chip" style="color:#ffd84a">Lv ${z.l[0]}-${z.l[1]}</span>` : ''}${z.f ? `<span class="chip" style="color:${FACTIONS[z.f].color}">${FACTIONS[z.f].short}</span>` : ''}<span class="chip" style="color:#8fd8ff">${{ city: 'City', town: 'Town', wild: 'Wilds', dungeon: 'Dungeon', veil: 'Veil', island: 'Island', platform: 'Sky city' }[z.k]}</span>${z.r ? `<span class="chip" style="color:${disc ? '#4fd6ff' : '#557'}">${disc ? 'Relay found' : 'Relay unknown'}</span>` : ''}</div>
      <p>${z.d}</p>${z.boss ? `<p><b style="color:#ff6a5a">Boss:</b> ${z.boss[0]}${P.bosses.includes(z.id) ? ' <span style="color:var(--ok)">· defeated</span>' : ''}</p>` : ''}
      ${z.ex.length ? `<p style="font-size:12px"><b>Exits:</b> ${z.ex.map(e => ZMAP[e].n).join(', ')}</p>` : ''}${z.dg ? `<p style="font-size:12px"><b>Dungeon:</b> ${z.dg.map(e => ZMAP[e].n).join(', ')}</p>` : ''}${z.par ? `<p style="font-size:12px"><b>Entrance in:</b> ${ZMAP[z.par].n}</p>` : ''}
      ${canTravel ? `<button class="btn primary" data-act="travel" data-z="${z.id}">Relay to ${z.n}</button>` : travel ? `<p class="lbl">${z.id === zone.id ? 'You are here' : !z.r ? 'No Relay Pylon here. Walk in through a zone gate.' : !disc ? 'Visit this zone once to unlock its Relay.' : 'The Relay unlocks after the Brood-Mother falls.'}</p>` : '<p class="lbl">Use a Relay Pylon to fast travel</p>'}
      <p class="ao">Anarchy Online counterpart: ${z.ao}</p>`;
  },
};
