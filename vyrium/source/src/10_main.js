// ===================== GAME =====================
const TIPS = [
  'Headshots are critical hits. Crits from Helix guns hit even harder.',
  'Shock eats shields, Corrosive melts armor, Incendiary burns flesh, Nano tears through Veil spirits.',
  'Downed? Kill something during Fight For Your Life to get a Second Wind.',
  'Reclaim Booths save where you respawn. Walk past one to update it.',
  'Relay Pylons fast travel between every Relay you have discovered.',
  'Mission Terminals in cities offer contracts matched to your level.',
  'Red chests hold loot. Purple Vyrium Caches hold better loot.',
  'Badass enemies glow amber. They hit harder and drop better guns.',
  'Spend attribute points in Inventory › Stats after you level up.',
  'Your Glim floats over your shoulder and lights up after dark. Press T to switch it off. Better ones drop from loot or sell at Arms Vendors.',
];
const Game = {
  state: 'boot', panel: null, t: 0, saveT: 0, clock: null, gateLock: 0, titleT: 0,
  boot() {
    initRenderer();
    FXg = new Particles(1600, true); FXi = new Particles(1000, false); Tracers.init(); DmgNums.init(); VM.init(); Glim.init();
    enemyRoot = new THREE.Group(); scene.add(enemyRoot);
    initInput(); if (isTouch) initTouch(); UI.init();
    const hd = window.claude && window.claude.hot && window.claude.hot.data; if (hd && hd.save) Store.set('save', hd.save);
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ save: this.state === 'play' ? P.serialize() : Store.get('save', null) }));
    this.clock = new THREE.Clock(); this.showTitle(); this.loop();
  },
  showTitle() {
    this.state = 'title'; document.body.classList.remove('playing'); $('hud').hidden = true; $('touch').hidden = true; P.faction = undefined; P.pos.set(0, 0, 0);
    clearEntities(); if (zone) zone.dispose(); zone = new Zone(ZMAP[pick(rnd, ['aurora', 'cyrex-arcade', 'kesh', 'avelaine', 'newhaven'])]); zone.build(); spawnZoneEntities();
    for (const e of enemies) if (e.hostile) { enemyRoot.remove(e.g); e.gone = true; }
    Music.set('title'); UI.showTitle();
  },
  quitToTitle() { releasePointer(); this.showTitle(); },
  newGame(name, fac, prof) { P.newGame(name, fac, prof); Store.set('save', P.serialize()); this.enterZone('landfall', '_start', () => { UI.comm(MAIN_QUEST[0].say); setTimeout(() => UI.toast(isTouch ? 'Left side moves · right side looks' : 'Click to capture the mouse · WASD to move', 'ok'), 3500); }); },
  continueGame() { const s = Store.get('save', null); if (!s) return; P.load(s); this.enterZone(P.zone, '_reclaim', () => { const q = MAIN_QUEST[P.quest]; if (q) UI.comm(q.say); }); },
  enterZone(id, from, cb) {
    $('loading').hidden = false; $('screen-title').hidden = true; $('ldZone').textContent = ZMAP[id].n; $('ldTip').textContent = pick(rnd, TIPS);
    this.state = 'loading';
    setTimeout(() => {
      clearEntities(); if (zone) zone.dispose(); zone = new Zone(ZMAP[id]); zone.build(); P.zone = id;
      spawnZoneEntities(); this.missionSpawn();
      let a = null;
      if (from === '_reclaim' && P.reclaim && P.reclaim.zone === id) { a = { x: P.reclaim.x, z: P.reclaim.z, yaw: 0 }; P.booth = P.reclaim; }
      a = a || zone.arrivals[from] || zone.arrivals._hub || { x: 0, z: 0, yaw: 0 };
      P.pos.set(a.x, 0, a.z); P.pos.y = zone.groundAt(a.x, a.z, zone.heightAt(a.x, a.z) + 1); P.yaw = a.yaw; P.pitch = 0; P.vel.set(0, 0, 0); P.downed = false; P.dead = false; UI.ffyl(false);
      if (zone.def.r && !P.discovered.includes(id)) { P.discovered.push(id); setTimeout(() => { if (zone.id === id) UI.toast('Relay Pylon discovered', 'ok'); }, 3600); }
      const d = zone.def; if (d.l && d.l[0] > P.level + 6) setTimeout(() => { if (zone.id === id) UI.toast(`Danger: this zone is level ${d.l[0]}-${d.l[1]}`, 'warn'); }, 3400);
      VM.set(P.gun()); UI.setZoneMarks(); UI.banner(); UI.dirty = true;
      Music.set(d.k === 'dungeon' ? (d.st === 'hive' ? 'hive' : 'dungeon') : zone.B.mood);
      this.gateLock = 1.2; this.state = 'play'; document.body.classList.add('playing'); $('hud').hidden = false; $('touch').hidden = !isTouch; $('loading').hidden = true;
      this.save(); if (cb) cb();
    }, 60);
  },
  travel(to, from) { if (this.state !== 'play') return; Sfx.play('gate'); releasePointer(); Game.ignoreUnlock = false; this.enterZone(to, from || zone.id); },
  hotkey(code, e) {
    if (this.state !== 'play') { if (code === 'Escape' && this.panel && UI.ctx.fromTitle) UI.closePanel(false); return; }
    if (e) e.preventDefault();
    if (P.dead) return;
    if (code === 'Escape' || code === 'KeyP') { if (this.panel) UI.closePanel(true); else this.openPause(); }
    else if (code === 'Tab' || code === 'KeyI') { if (this.panel === 'inventory' || this.panel === 'stats') UI.closePanel(true); else UI.openPanel('inventory'); }
    else if (code === 'KeyM') { if (this.panel === 'atlas') UI.closePanel(true); else UI.openPanel('atlas'); }
  },
  openPause() { if (this.state === 'play' && !this.panel && !P.dead) UI.openPanel('system'); },
  nearestInteract() {
    let best = null, bd = 1e9;
    for (const p of pickups) { if (p.kind !== 'item') continue; const d = Math.hypot(p.pos.x - P.pos.x, p.pos.z - P.pos.z) + Math.abs(p.pos.y - P.pos.y - 0.5) * 0.5; if (d < 2.8 && d < bd) { bd = d; best = { type: 'pickup', p }; } }
    if (!best) for (const i of zone.interact) { if (i.used) continue; const d = Math.hypot(i.x - P.pos.x, i.z - P.pos.z); if (d < i.r && d < bd && Math.abs(i.y - P.pos.y) < 4) { bd = d; best = { type: 'poi', i }; } }
    return best;
  },
  interact() {
    const n = this.nearestInteract(); if (!n) return;
    if (n.type === 'pickup') { if (P.takeItem(n.p.item)) { Sfx.play('pickup', n.p.item.rar); scene.remove(n.p.g); pickups.splice(pickups.indexOf(n.p), 1); UI.dirty = true; } return; }
    const i = n.i; Sfx.play('ui');
    if (i.kind === 'relay') { if (zone.id === 'landfall' && P.quest === 0) { UI.comm('The Relay stays locked until the Brood-Mother is dealt with. Check the cliffs, contractor.'); return; } UI.atlasSel = zone.id; UI.openPanel('atlas', { relay: true }); }
    else if (i.kind === 'vendor') UI.openPanel('vendor', { vendor: 'arms' });
    else if (i.kind === 'supply') UI.openPanel('vendor', { vendor: 'supply' });
    else if (i.kind === 'terminal') UI.openPanel('missions', { terminal: true });
    else if (i.kind === 'chest') this.openChest(i);
    else if (i.kind === 'cache') { i.used = true; scene.remove(i.obj); zone.group.remove(i.obj); this.completeMission(); }
  },
  openChest(i) {
    i.used = true; Sfx.play('chest'); const lid = i.obj.userData.lid; let t = 0; zone.anims.push(() => { if (t < 1) { t += 0.05; lid.rotation.x = -1.9 * Math.min(1, t); } });
    const L = zone.lvl[0] === zone.lvl[1] ? P.level : clamp(P.level, zone.lvl[0], zone.lvl[1] + 2); const c = new THREE.Vector3(i.x, i.y + 1, i.z);
    const n = i.rare ? ri(rnd, 2, 3) : rnd() < 0.7 ? 1 : 2; for (let k = 0; k < n; k++) dropPickup('item', c, { item: lootDrop(L, i.rare ? 3.5 : 1) });
    for (let k = 0; k < ri(rnd, 1, 3); k++) dropPickup('credits', c, { amount: Math.round((6 + L * 4) * rr(rnd, 0.7, 1.5) * (i.rare ? 2 : 1)) });
    if (rnd() < 0.6) dropPickup('ammo', c); FXg.burst(c, 24, i.rare ? 0xc26bff : 0xffc23a, 5, 0.3, 0.6);
  },
  vendorStock(kind) { if (kind !== 'arms') return null; const L = P.level; const s = []; for (let i = 0; i < 7; i++) s.push(makeGun(L + ri(rnd, -1, 1), rollRarity(1.5))); s.push(makeShield(L, rollRarity(1.5)), makeShield(L, rollRarity(1)), makeGlim(L, rollRarity(1.5)), makeGlim(L, Math.max(1, rollRarity(2)))); s.push(makeGun(L + 1, rnd() < 0.15 ? 4 : 3)); return s; },
  // ---------- missions ----------
  genOffers() {
    let cand = ZONES.filter(z => (z.k === 'wild' || z.k === 'island' || z.k === 'veil') && z.l[0] <= P.level + 3 && z.l[1] >= P.level - 6 && z.id !== 'landfall');
    if (cand.length < 2) cand = ZONES.filter(z => z.k === 'wild').sort((a, b) => Math.abs((a.l[0] + a.l[1]) / 2 - P.level) - Math.abs((b.l[0] + b.l[1]) / 2 - P.level)).slice(0, 4);
    const out = [];
    for (let i = 0; i < 3; i++) {
      const z = pick(rnd, cand); const type = pick(rnd, ['purge', 'assassinate', 'retrieve']); const lvl = clamp(P.level + i - 1, z.l[0], z.l[1] + 2);
      const rar = [rnd() < 0.5 ? 1 : 2, rnd() < 0.6 ? 2 : 3, rnd() < 0.8 ? 3 : 4][i];
      out.push({ id: uid(), type, zone: z.id, diff: i, lvl, n: type === 'purge' ? 8 + i * 4 : 1, prog: 0,
        target: `${pick(rnd, ['Fixer', 'Smuggler', 'Deserter', 'Cultist', 'Foreman', 'Courier', 'Broker', 'Raider-Captain'])} ${pick(rnd, ['Rook', 'Varga', 'Kessa', 'Dorn', 'Pell', 'Maro', 'Ysolde', 'Tibbet', 'Krane', 'Osk', 'Halloran', 'Zee'])}`,
        cargo: pick(rnd, ['Cyrex data core', 'Clan ledger', 'Vyrium sample case', 'prototype nano-pack', 'stolen relay key', 'survey drive']),
        reward: { xp: Math.round(xpNeed(P.level) * (0.2 + i * 0.1)), cr: Math.round((40 + P.level * 26) * (1 + i * 0.6)), item: rnd() < 0.8 ? makeGun(lvl + 1, rar) : makeShield(lvl + 1, rar) } });
    }
    return out;
  },
  missionTitle(m) { return m.type === 'purge' ? `Purge contract` : m.type === 'assassinate' ? `Eliminate ${m.target}` : `Recover the ${m.cargo}`; },
  missionText(m) { const z = ZMAP[m.zone].n; return m.type === 'purge' ? `Kill ${m.n} hostiles in ${z}.` : m.type === 'assassinate' ? `${m.target} is hiding in ${z} with a crew. End the contract.` : `A ${m.cargo} went missing in ${z}. Find the glowing cache and bring it back.`; },
  missionSpawn() {
    const m = P.mission; this.objective = null; if (!m || m.zone !== zone.id || !zone.campSpots || !zone.campSpots.length) return;
    const r = mulberry32(hashStr(m.id)); const c = zone.campSpots[Math.floor(r() * zone.campSpots.length)];
    if (m.type === 'assassinate') { const pool = POOLS[zone.k === 'veil' ? 'veil' : zone.def.b] || POOLS.plains; const type = ['bandit', 'borg', 'xyrr'].find(t => pool.includes(t)) || 'bandit';
      const e = new Enemy({ type, x: c.x, z: c.z, lvl: m.lvl + 1 }); e.name = m.target; e.maxHp = e.hp = e.maxHp * 5; e.dmg *= 1.3; e.missionTarget = true; e.badass = true; e.g.scale.setScalar(1.3); enemies.push(e);
      this.objective = { e, label: m.target }; }
    else if (m.type === 'retrieve') { const y = zone.heightAt(c.x + 3, c.z + 3); const g = buildChest(true); g.scale.setScalar(0.8); mk(gSph(0.5, 1), glowMat(0xffb52e, 0.7, true), g, 0, 1.4, 0); g.position.set(c.x + 3, y, c.z + 3); zone.group.add(g);
      zone.interact.push({ x: c.x + 3, z: c.z + 3, y, r: 3, kind: 'cache', label: `Recover ${m.cargo}`, obj: g }); this.objective = { x: c.x + 3, z: c.z + 3, label: 'Cache' }; }
  },
  objectiveSpot() {
    const o = this.objective; if (o) { if (o.e) { if (!o.e.dead) return { x: o.e.pos.x, z: o.e.pos.z, label: o.label }; } else if (P.mission) return o; }
    const q = MAIN_QUEST[P.quest]; if (q && q.z === zone.id && zone.bossSpot) { const b = enemies.find(e => e.boss && !e.dead); if (b) return { x: b.pos.x, z: b.pos.z, label: 'Boss' }; }
    return null;
  },
  completeMission() {
    const m = P.mission; if (!m) return; P.mission = null; P.missionsDone++; Sfx.play('mission');
    P.credits += m.reward.cr; P.addXP(m.reward.xp); if (!P.takeItem(m.reward.item)) dropPickup('item', P.pos.clone().setY(P.pos.y + 1.5), { item: m.reward.item });
    UI.toast('MISSION COMPLETE', 'big'); UI.feed(`+${fmtInt(m.reward.cr)} cr · +${fmtInt(m.reward.xp)} XP`, '#ffd84a'); this.objective = null; UI.dirty = true; this.save();
  },
  onKill(e) {
    const m = P.mission;
    if (m && m.zone === zone.id) { if (m.type === 'purge' && e.hostile && !e.guard) { m.prog++; if (m.prog >= m.n) this.completeMission(); } if (m.type === 'assassinate' && e.missionTarget) this.completeMission(); }
    if (e.boss) {
      if (!P.bosses.includes(zone.id)) P.bosses.push(zone.id);
      const q = MAIN_QUEST[P.quest];
      if (q && q.z === zone.id) {
        P.quest++; P.addXP(xpNeed(P.level) * 0.45); P.credits += 100 + P.level * 40; Sfx.play('mission');
        const nx = MAIN_QUEST[P.quest];
        setTimeout(() => { if (nx) { UI.toast('CONTRACT UPDATED', 'big'); UI.comm(nx.say); } else { P.finished = true; UI.toast('THE RIFTS ARE CLOSING', 'big'); UI.comm('You did it. Every rift on Vesh just went quiet. Come home, contractor. Then go wherever you like. The planet is yours to roam.'); } }, 2500);
      }
      this.save();
    }
  },
  save() { DayClock.save(); if (this.state === 'play' || this.state === 'loading') { try { Store.set('save', P.serialize()); } catch (e) { } } },
  checkTriggers(dt) {
    this.gateLock -= dt; if (this.gateLock > 0) return;
    for (const t of zone.triggers) if (Math.hypot(t.x - P.pos.x, t.z - P.pos.z) < t.r && Math.abs(zone.heightAt(t.x, t.z) - P.pos.y) < 4) { this.gateLock = 3; this.travel(t.to, zone.id); return; }
  },
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05); this.t += dt; const t = this.t;
    if (this.state === 'title') {
      this.titleT += dt; DayClock.update(dt); const a = this.titleT * 0.05; const R = zone.k === 'wild' ? 60 : 85; camera.position.set(Math.cos(a) * R, 26 + Math.sin(a * 0.7) * 6, Math.sin(a) * R); camera.lookAt(0, 8, 0);
      for (const c of civs) c.update(dt); for (const e of enemies) if (!e.gone && !e.hostile) e.update(dt);
    } else if (this.state === 'play') {
      if (!this.panel) {
        P.update(dt); DayClock.update(dt); if (!P.dead) this.checkTriggers(dt);
        for (let i = enemies.length - 1; i >= 0; i--) { const e = enemies[i]; e.update(dt); if (e.gone) enemies.splice(i, 1); }
        for (const c of civs) c.update(dt);
        updateProjs(dt); updatePickups(dt); if (sentry) sentry.update(dt);
      }
      VM.update(dt); UI.update(dt);
      const low = P.hp / P.maxHp < 0.3 && !P.dead ? 0.25 + Math.sin(t * 6) * 0.1 : 0; postMat.uniforms.hurt.value = clamp(P.hurtT * 0.8 + low, 0, 1);
      postMat.uniforms.cloak.value = P.cloak > 0 ? Math.min(1, P.cloak) : 0; postMat.uniforms.down.value = P.downed ? 1 : 0;
      this.saveT += dt; if (this.saveT > 40) { this.saveT = 0; this.save(); }
    }
    postMat.uniforms.flash.value = Math.max(0, postMat.uniforms.flash.value - dt * 1.5);
    if (zone) zone.update(t);
    Glim.update(dt);
    FXg.update(dt); FXi.update(dt); Tracers.update(dt); DmgNums.update(dt); Music.update();
    Input.pressed.clear();
    renderFrame(t);
  }
};
window.addEventListener('beforeunload', () => Game.save());
document.addEventListener('visibilitychange', () => { if (document.hidden) Game.save(); });
Game.boot();
window.__vy = { Game, P, DayClock, Glim, makeGlim, get zone() { return zone; }, enemies, pickups, ZONES, Zone, UI, get renderer() { return renderer; }, GFX, Input, makeGun, makeShield, dropPickup };
