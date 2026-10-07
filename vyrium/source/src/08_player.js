// ===================== INPUT =====================
const Input = { keys: {}, pressed: new Set(), mdx: 0, mdy: 0, lmb: false, rmb: false, lmbPressed: false, locked: false, wheel: 0, lockFailed: false,
  t: { mx: 0, my: 0, fire: false, firePressed: false, ads: false, sprint: false } };
const SENS = { v: Store.get('sens', 1), invert: Store.get('invert', false) };
function initInput() {
  const cv = renderer.domElement;
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!Input.keys[e.code]) Input.pressed.add(e.code); Input.keys[e.code] = true;
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'KeyQ'].includes(e.code) && Game.state === 'play') e.preventDefault();
    if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyI' || e.code === 'KeyM' || e.code === 'KeyP') Game.hotkey(e.code, e);
  });
  window.addEventListener('keyup', e => { Input.keys[e.code] = false; });
  window.addEventListener('blur', () => { Input.keys = {}; Input.lmb = Input.rmb = false; });
  cv.addEventListener('mousedown', e => {
    Sfx.init();
    if (Game.state !== 'play' || Game.panel) return;
    if (!Input.locked && !Input.lockFailed && !isTouch) { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => { Input.lockFailed = true; }); } catch (err) { Input.lockFailed = true; } }
    if (e.button === 0) { Input.lmb = true; Input.lmbPressed = true; } if (e.button === 2) Input.rmb = true;
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) Input.lmb = false; if (e.button === 2) Input.rmb = false; });
  window.addEventListener('mousemove', e => { if (Input.locked || (Input.lockFailed && (e.buttons & 1 || e.buttons & 2))) { Input.mdx += e.movementX || 0; Input.mdy += e.movementY || 0; } });
  cv.addEventListener('wheel', e => { Input.wheel += Math.sign(e.deltaY); }, { passive: true });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerlockchange', () => { Input.locked = document.pointerLockElement === cv; if (!Input.locked && Game.state === 'play' && !Game.panel && !Game.ignoreUnlock) Game.openPause(); Game.ignoreUnlock = false; });
  document.addEventListener('pointerlockerror', () => { Input.lockFailed = true; });
}
function releasePointer() { if (Input.locked) { Game.ignoreUnlock = true; try { document.exitPointerLock(); } catch (e) { } } }

// ---------- touch ----------
function initTouch() {
  const root = $('touch'); const stick = $('tStick'), knob = $('tKnob'); let moveId = null, lookId = null, ox = 0, oy = 0, lx = 0, ly = 0;
  const btn = (id, down, up) => { const el = $(id); if (!el) return; el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); Sfx.init(); el.classList.add('on'); down(); }, { passive: false }); el.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); el.classList.remove('on'); up && up(); }, { passive: false }); el.addEventListener('touchcancel', () => { el.classList.remove('on'); up && up(); }); };
  btn('tFire', () => { Input.t.fire = true; Input.t.firePressed = true; }, () => { Input.t.fire = false; });
  btn('tAds', () => { Input.t.ads = !Input.t.ads; $('tAds').classList.toggle('lit', Input.t.ads); });
  btn('tJump', () => Input.pressed.add('Space')); btn('tReload', () => Input.pressed.add('KeyR')); btn('tSkill', () => Input.pressed.add('KeyQ'));
  btn('tNade', () => Input.pressed.add('KeyG')); btn('tSwap', () => { Input.wheel += 1; }); btn('tMelee', () => Input.pressed.add('KeyV')); btn('tUse', () => Input.pressed.add('KeyE'));
  btn('tMap', () => Game.hotkey('KeyM')); btn('tBag', () => Game.hotkey('Tab')); btn('tPause', () => Game.hotkey('Escape'));
  root.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.42 && moveId === null) { moveId = t.identifier; ox = t.clientX; oy = t.clientY; stick.style.left = ox + 'px'; stick.style.top = oy + 'px'; stick.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)'; }
      else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  root.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) { let dx = t.clientX - ox, dy = t.clientY - oy; const d = Math.hypot(dx, dy), R = 56; if (d > R) { dx *= R / d; dy *= R / d; } Input.t.mx = dx / R; Input.t.my = -dy / R; Input.t.sprint = d > R * 1.25 && -dy > R * 0.6; knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; }
      else if (t.identifier === lookId) { Input.mdx += (t.clientX - lx) * 2.2; Input.mdy += (t.clientY - ly) * 2.2; lx = t.clientX; ly = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  const end = e => { for (const t of e.changedTouches) { if (t.identifier === moveId) { moveId = null; Input.t.mx = Input.t.my = 0; Input.t.sprint = false; stick.classList.remove('on'); } if (t.identifier === lookId) lookId = null; } };
  root.addEventListener('touchend', end); root.addEventListener('touchcancel', end);
}

// ===================== VIEWMODEL =====================
const VM = {
  root: null, gun: null, uid: null, kick: 0, kickR: 0, swayX: 0, swayY: 0, bob: 0, melee: 0, swapT: 0, flash: null, flashT: 0,
  init() { this.root = new THREE.Group(); vmCamera.add(this.root);
    const fm = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flash = new THREE.Group(); for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), fm); p.rotation.set(i === 2 ? Math.PI / 2 : 0, i * Math.PI / 2, Math.PI / 4); this.flash.add(p); } this.flash.visible = false; this.fm = fm; },
  set(it) {
    if ((it ? it.uid : null) === this.uid) return;
    if (this.gun) { this.root.remove(this.gun); this.gun = null; }
    if (it) { const g = buildGun(it); g.scale.setScalar(0.82); g.rotation.y = 0.04; addHulls(g, 0.006); this.root.add(g); this.gun = g; g.userData.muzzle.add(this.flash); this.fm.color.set(it.el !== 'kinetic' ? ELEMENTS[it.el].hex : 0xffe0a0); }
    this.uid = it ? it.uid : null; this.swapT = 0.35;
  },
  update(dt) {
    if (!this.gun) return; const it = P.gun(); const ads = P.adsT; const sn = it && it.kind === 'sniper';
    const moving = P.onGround && Math.hypot(P.vel.x, P.vel.z) > 1; this.bob += dt * (moving ? Math.hypot(P.vel.x, P.vel.z) * 1.1 : 0);
    const bA = moving ? (P.sprint ? 0.028 : 0.014) * (1 - ads * 0.8) : 0;
    this.swayX = lerp(this.swayX, clamp(-Input.mdx * 0.0006, -0.05, 0.05), Math.min(1, dt * 10)); this.swayY = lerp(this.swayY, clamp(Input.mdy * 0.0006, -0.05, 0.05), Math.min(1, dt * 10));
    this.kick = lerp(this.kick, 0, Math.min(1, dt * 14)); this.kickR = lerp(this.kickR, 0, Math.min(1, dt * 12)); this.swapT = Math.max(0, this.swapT - dt);
    const rl = P.reloadT > 0 ? Math.sin((1 - P.reloadT / P.reloadMax) * Math.PI) : 0; const ml = this.melee > 0 ? Math.sin((1 - this.melee / 0.35) * Math.PI) : 0; this.melee = Math.max(0, this.melee - dt);
    const hx = 0.25, hy = -0.25, hz = -0.56; const ax = 0, ay = sn ? -0.12 : -0.1, az = -0.3;
    this.root.position.set(lerp(hx, ax, ads) + Math.sin(this.bob) * bA + this.swayX, lerp(hy, ay, ads) - Math.abs(Math.cos(this.bob)) * bA + this.swayY - rl * 0.16 - this.swapT * 0.9 - (P.sprint ? 0.04 : 0), lerp(hz, az, ads) + this.kick - ml * 0.25 + (P.downed ? 0.05 : 0));
    this.root.rotation.set(this.kickR - rl * 0.9 + (P.sprint ? -0.25 : 0) + ml * 0.4, (P.sprint ? 0.5 : 0) * (1 - ads) + this.swayX * 2, -rl * 0.5 + (P.sprint ? 0.15 : 0));
    this.root.visible = !(sn && ads > 0.9) && !P.dead;
    if (this.flashT > 0) { this.flashT -= dt; this.flash.visible = true; this.flash.rotation.z = rnd() * TAU; this.flash.scale.setScalar(rr(rnd, 0.8, 1.4)); } else this.flash.visible = false;
  }
};

// ===================== PLAYER =====================
const xpNeed = (L) => Math.round(80 * Math.pow(L, 1.35) + 40);
const P = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: false, radius: 0.42, height: 1.75,
  chest(o) { return o.set(this.pos.x, this.pos.y + (this.downed ? 0.5 : 1.2), this.pos.z); },
  eyePos(o) { return o.set(this.pos.x, this.pos.y + this.eye(), this.pos.z); },
  eye() { return this.downed ? 0.55 : 1.62; },
  gun() { return this.weapons[this.cur]; },
  newGame(name, faction, prof) {
    Object.assign(this, { name, faction, prof, level: 1, xp: 0, credits: 60, attrs: { str: 0, agi: 0, sta: 0, int: 0, sen: 0, psy: 0 }, pts: 0, weapons: [null, null, null, null], cur: 0, pack: [], packMax: 24,
      ammo: {}, grenades: 3, discovered: ['landfall', HOME_CITY[faction], 'jovan'], quest: 0, mission: null, missionsDone: 0, kills: 0, bosses: [], zone: 'landfall', reclaim: null, offers: null, playTime: 0, finished: false });
    for (const k in AMMO) this.ammo[k] = Math.round(AMMO[k].max * 0.5);
    const mf = faction === 'corp' ? 'cyrex' : faction === 'clan' ? 'clanforge' : 'dustline';
    const kit = { soldier: ['rifle', 'pistol'], nanocaster: ['smg', 'pistol'], engineer: ['shotgun', 'pistol'], agent: ['sniper', 'pistol'], doctor: ['smg', 'pistol'] }[prof];
    this.weapons[0] = makeGun(1, 1, kit[0], prof === 'nanocaster' ? 'nanodyne' : MFG[mf].kinds.includes(kit[0]) ? mf : undefined); this.weapons[1] = makeGun(1, 0, kit[1], mf);
    this.shieldItem = makeShield(1, 0); this.weapons.forEach(w => w && (w.cur = w.mag));
    this.resetRuntime(); this.recalc(); this.hp = this.maxHp; this.sh = this.maxSh; this.nano = this.maxNano;
  },
  resetRuntime() { Object.assign(this, { fireCd: 0, reloadT: 0, reloadMax: 1, bloom: 0, adsT: 0, sprint: false, skillCd: 0, overdrive: 0, cloak: 0, cloakCrit: false, regenField: 0, downed: false, downT: 0, dead: false, hurtT: 0, shake: 0, recoil: 0, shDelayT: 0, calmT: 0, meleeCd: 0, godT: 0, booth: null, inWater: false, moving: false, regenT: 0 }); this.vel.set(0, 0, 0); },
  serialize() { const s = {}; for (const k of ['name', 'faction', 'prof', 'level', 'xp', 'credits', 'attrs', 'pts', 'weapons', 'cur', 'pack', 'packMax', 'ammo', 'grenades', 'discovered', 'quest', 'mission', 'missionsDone', 'kills', 'bosses', 'zone', 'reclaim', 'shieldItem', 'offers', 'playTime', 'finished']) s[k] = this[k]; s.hp = this.hp; s.sh = this.sh; return JSON.parse(JSON.stringify(s)); },
  load(s) { Object.assign(this, s); if (!this.discovered.includes('jovan')) this.discovered.push('jovan'); this.resetRuntime(); this.recalc(); this.hp = clamp(s.hp || this.maxHp, 1, this.maxHp); this.sh = this.maxSh; this.nano = this.maxNano; },
  recalc() {
    const pr = PROFESSIONS[this.prof], A = this.attrs;
    this.maxHp = 100 * S(this.level) * (1 + A.sta * 0.03 + A.str * 0.02) * (pr.hp || 1);
    this.maxSh = this.shieldItem ? this.shieldItem.cap * (1 + A.sta * 0.02) * (pr.sh || 1) : 0;
    this.maxNano = 100 * (1 + A.psy * 0.03) * (pr.np || 1);
    this.spdMul = (1 + A.agi * 0.01) * (1 + (pr.spd || 0)); this.rlMul = 1 / (1 + A.agi * 0.02 + (pr.rl || 0));
    this.critMul = 1 + A.sen * 0.03 + (pr.crit || 0); this.accMul = Math.max(0.4, 1 - A.sen * 0.01);
    this.elMul = 1 + A.int * 0.02; this.elChance = A.int * 0.02 + (pr.el || 0); this.cdMul = Math.max(0.4, 1 - A.psy * 0.015); this.magMul = 1 + (pr.mag || 0);
    this.hp = Math.min(this.hp || 0, this.maxHp); this.sh = Math.min(this.sh || 0, this.maxSh);
  },
  magSize(it) { return Math.max(1, Math.round(it.mag * this.magMul)); },
  setWeapon(i) { if (!this.weapons[i] || this.downed && false) return; if (i !== this.cur) { this.cur = i; this.reloadT = 0; this.fireCd = 0.3; Sfx.play('ui'); } VM.set(this.weapons[i]); UI.dirty = true; },
  cycleWeapon(dir) { for (let k = 1; k <= 4; k++) { const i = (this.cur + dir * k + 8) % 4; if (this.weapons[i]) { this.setWeapon(i); return; } } },
  startReload() {
    const it = this.gun(); if (!it || this.reloadT > 0 || it.cur >= this.magSize(it)) return;
    if (this.ammo[it.kind] <= 0) { Sfx.play('empty'); UI.toast('Out of ' + AMMO[it.kind].n + ' ammo', 'warn'); return; }
    this.reloadMax = this.reloadT = it.rl * this.rlMul; Sfx.play('reload');
  },
  fire() {
    const it = this.gun(); if (!it || this.reloadT > 0 || this.fireCd > 0) return;
    if (it.cur <= 0) { Sfx.play('empty'); this.startReload(); this.fireCd = 0.25; return; }
    const od = this.overdrive > 0; this.fireCd = 1 / (it.rof * (od ? 1.4 : 1)); if (!od) it.cur--;
    const K = KINDS[it.kind]; const o = camera.position.clone(); const fwd = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize(), up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const ads = this.adsT > 0.5; const spread = it.sp * this.accMul * (ads ? 0.4 : 1) * (1 + this.bloom) * (this.moving ? 1.3 : 1) * (this.onGround ? 1 : 1.5) * (this.downed ? 1.3 : 1);
    const muzzle = o.clone().addScaledVector(fwd, 0.7).addScaledVector(right, ads ? 0.02 : 0.2).addScaledVector(up, ads ? -0.08 : -0.17);
    const shots = it.leg === 'twin' ? 2 : 1; let tr = 0;
    for (let s = 0; s < shots; s++) for (let p = 0; p < it.pel; p++) {
      let rx, ry; if (it.leg === 'ring' && p > 0) { const a = p / (it.pel - 1) * TAU; rx = Math.cos(a) * 0.7; ry = Math.sin(a) * 0.7; } else { const a = rnd() * TAU, r = Math.sqrt(rnd()); rx = Math.cos(a) * r; ry = Math.sin(a) * r; }
      const d = fwd.clone().addScaledVector(right, rx * spread + (shots > 1 ? (s - 0.5) * 0.012 : 0)).addScaledVector(up, ry * spread).normalize();
      if (K.proj) { spawnProj({ pos: muzzle.clone(), dir: d, speed: 46, owner: 'player', dmg: it.dmg, el: it.el, kind: 'rocket', color: 0xffc060, size: 0.2, splash: K.splash * (1 + it.rar * 0.08), src: it, life: 5 }); continue; }
      const h = hitscan(o, d, K.rng);
      if (tr++ < 3 || rnd() < 0.3) Tracers.add(muzzle, h.point, it.el !== 'kinetic' ? ELEMENTS[it.el].hex : 0xffe6a0, it.kind === 'sniper' ? 0.06 : 0.035, it.kind === 'sniper' ? 0.15 : 0.06);
      if (h.e) dealDamage(h.e, it.dmg, it.el, h.crit, h.point, { src: it });
      else if (h.t < K.rng) { FXg.burst(h.point, 4, 0xffd890, 3, 0.12, 0.15); FXi.burst(h.point, 3, zone.pal.g[1], 3, 0.18, 0.4, 10); }
      if (it.leg === 'boom' && h.t < K.rng) explode(h.point, 2.5, it.dmg * 0.6, it.el, 'player', { src: it });
    }
    this.bloom = Math.min(1.6, this.bloom + K.kick * 6); this.recoil += K.kick * (ads ? 0.55 : 1) * (it.mfg === 'vektor' ? 1.3 : 1);
    VM.kick += 0.03 + K.kick * 0.6; VM.kickR += K.kick * 3; VM.flashT = 0.045;
    Sfx.play(it.kind); if (it.el !== 'kinetic') Sfx.play('el_' + it.el);
    if (it.cur <= 0 && !od) setTimeout(() => this.startReload(), 180);
    UI.dirty = true;
  },
  melee() {
    if (this.meleeCd > 0 || this.dead) return; this.meleeCd = 0.75; VM.melee = 0.35; Sfx.play('melee');
    const o = camera.position.clone(), fwd = camera.getWorldDirection(new THREE.Vector3()); let best = null, bd = 3.2;
    for (const e of enemies) { if (e.dead || !e.hostile) continue; e.center(_v1); const d = _v1.distanceTo(o); if (d - e.r < bd && _v2.subVectors(_v1, o).normalize().dot(fwd) > 0.55) { bd = d; best = e; } }
    if (best) { const dmg = 32 * S(this.level) * (1 + this.attrs.str * 0.06) * (this.prof === 'soldier' ? 1.2 : 1); dealDamage(best, dmg, 'kinetic', false, best.center(new THREE.Vector3()), { melee: true }); best.vel.addScaledVector(fwd, 10); this.shake = Math.max(this.shake, 0.15); }
  },
  grenade() {
    if (this.grenades <= 0 || this.dead) { Sfx.play('deny'); return; } this.grenades--; Sfx.play('throw');
    const fwd = camera.getWorldDirection(new THREE.Vector3()); const d = fwd.clone(); d.y += 0.22; d.normalize();
    spawnProj({ pos: camera.position.clone().addScaledVector(fwd, 0.6), dir: d, speed: 24, owner: 'player', dmg: 75 * S(this.level) * (1 + this.attrs.str * 0.03), el: this.prof === 'nanocaster' ? 'nano' : 'kinetic', kind: 'grenade', color: 0x9be22d, size: 0.2, grav: 20, fuse: 1.6, splash: 6.5, life: 6 });
    UI.dirty = true;
  },
  useSkill() {
    const pr = PROFESSIONS[this.prof]; if (this.dead) return;
    if (this.skillCd > 0 || this.nano < pr.cost) { Sfx.play('deny'); UI.toast(this.skillCd > 0 ? `${pr.skill} recharging` : 'Not enough Nano', 'warn'); return; }
    this.nano -= pr.cost; this.skillCd = pr.cd * this.cdMul; Sfx.play('skill');
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    switch (this.prof) {
      case 'soldier': this.overdrive = 8; break;
      case 'nanocaster': spawnProj({ pos: camera.position.clone().addScaledVector(fwd, 1), dir: fwd, speed: 60, owner: 'player', dmg: 130 * S(this.level) * this.elMul * (1 + this.attrs.psy * 0.02), el: 'nano', kind: 'lance', color: 0xc26bff, size: 0.55, splash: 9, life: 3 }); break;
      case 'engineer': if (sentry) { scene.remove(sentry.g); } sentry = new Sentry(); break;
      case 'agent': this.cloak = 6; this.cloakCrit = true; for (const e of enemies) if (e.state === 'chase') e.lostT = 2; break;
      case 'doctor': this.regenField = 4; FXg.burst(this.pos.clone().setY(this.pos.y + 1), 40, 0x5cf0a0, 6, 0.4, 0.8); break;
    }
    UI.toast(pr.skill.toUpperCase(), 'skill');
  },
  damage(amt, srcPos, el, srcEnemy, proj) {
    if (this.dead || this.downed || this.godT > 0) return;
    if (proj && this.shieldItem && this.shieldItem.fx === 'absorb' && rnd() < 0.25) { const it = this.gun(); if (it) this.ammo[it.kind] = Math.min(AMMO[it.kind].max, this.ammo[it.kind] + 2); FXg.burst(this.chest(_v1), 6, 0xffc23a, 3, 0.2, 0.3); return; }
    this.calmT = 0;
    if (this.sh > 0) { const s = Math.min(this.sh, amt); this.sh -= s; amt -= s; Sfx.play('shieldHit'); if (this.sh <= 0.01) { this.sh = 0; Sfx.play('shieldBreak'); if (this.shieldItem && this.shieldItem.fx === 'nova') explode(this.chest(new THREE.Vector3()), 8, this.shieldItem.cap * 1.5, 'shock', 'player'); } }
    if (amt > 0) { this.hp -= amt; Sfx.play('hurt'); this.hurtT = Math.min(1, this.hurtT + 0.35 + amt / this.maxHp); }
    this.shDelayT = this.shieldItem ? this.shieldItem.del : 4; this.shake = Math.max(this.shake, 0.12);
    if (srcPos) UI.dmgDir(srcPos);
    if (this.hp <= 0) this.goDown();
    UI.dirty = true;
  },
  heal(n) { if (this.dead) return; this.hp = Math.min(this.maxHp, this.hp + n); },
  knock(x, y, z) { this.vel.x += x; this.vel.y = Math.max(this.vel.y, y); this.vel.z += z; this.onGround = false; },
  goDown() { this.hp = 0; this.downed = true; this.downT = 10; this.reloadT = 0; this.overdrive = 0; Sfx.play('down'); UI.ffyl(true); },
  die() { this.downed = false; this.dead = true; UI.ffyl(false); releasePointer(); const fee = Math.round(this.credits * 0.07); this.credits -= fee; UI.death(fee); },
  respawn() {
    const b = this.booth && this.booth.zone === zone.id ? this.booth : null; const a = b ? { x: b.x, z: b.z, yaw: this.yaw } : (zone.arrivals._hub || { x: 0, z: 0, yaw: 0 });
    this.dead = false; this.downed = false; this.hp = this.maxHp; this.sh = this.maxSh; this.nano = this.maxNano; this.godT = 3;
    this.pos.set(a.x, zone.groundAt(a.x, a.z, 999), a.z); this.vel.set(0, 0, 0); for (const e of enemies) if (e.state === 'chase') e.state = 'return';
    UI.hideDeath(); UI.dirty = true; Game.save();
  },
  collect(p) {
    if (p.kind === 'credits') { this.credits += p.amount; Sfx.play('credits'); UI.feed(`+${fmtInt(p.amount)} cr`, '#f2c230'); }
    else if (p.kind === 'ammo') { let any = false; for (const w of this.weapons) if (w) { const k = w.kind, before = this.ammo[k]; this.ammo[k] = Math.min(AMMO[k].max, before + AMMO[k].pack * (w === this.gun() ? 1 : 0.5)); if (this.ammo[k] > before) any = true; } if (this.grenades < 4 && rnd() < 0.35) { this.grenades++; any = true; } if (!any) return false; Sfx.play('ammo'); UI.feed('Ammo', '#ffc23a'); }
    else if (p.kind === 'health') { if (this.hp >= this.maxHp - 1) return false; this.heal(this.maxHp * 0.3); Sfx.play('pickup', 0); UI.feed('+Health', '#ff6a5a'); }
    UI.dirty = true; return true;
  },
  takeItem(it) {
    if (it.type === 'gun') { const e = this.weapons.findIndex(w => !w); if (e >= 0) { it.cur = this.magSize(it); this.weapons[e] = it; UI.feed(`Equipped ${it.name}`, RARITY[it.rar].c); if (e === this.cur) VM.set(it); return true; } }
    if (this.pack.length >= this.packMax) { UI.toast('Backpack full. Sell or drop something.', 'warn'); Sfx.play('deny'); return false; }
    if (it.type === 'gun' && it.cur == null) it.cur = this.magSize(it);
    this.pack.push(it); UI.feed(`${it.name}${it.type === 'shield' ? ' Shield' : ''} → backpack`, RARITY[it.rar].c); return true;
  },
  addXP(n) {
    if (this.level >= 70 || n <= 0) return; this.xp += Math.round(n);
    while (this.xp >= xpNeed(this.level) && this.level < 70) { this.xp -= xpNeed(this.level); this.level++; this.pts += 3; this.recalc(); this.hp = this.maxHp; this.sh = this.maxSh; Sfx.play('levelup'); UI.levelUp(this.level); }
    UI.dirty = true;
  },
  onKill(e) {
    this.kills++;
    const xp = (12 + e.lvl * 6) * e.D.xp * (e.boss ? 12 : e.badass ? 4 : 1) * clamp(1 + (e.lvl - this.level) * 0.1, 0.15, 2); if (e.hostile) this.addXP(xp);
    if (this.downed) { this.downed = false; this.hp = this.maxHp * 0.4; this.godT = 1.5; Sfx.play('revive'); UI.ffyl(false); UI.toast('SECOND WIND!', 'big'); }
    Game.onKill(e);
  },
  update(dt) {
    this.playTime += dt;
    if (this.dead) return;
    const pr = PROFESSIONS[this.prof];
    // timers
    this.fireCd -= dt; this.meleeCd -= dt; this.godT -= dt; this.skillCd = Math.max(0, this.skillCd - dt); this.hurtT = Math.max(0, this.hurtT - dt * 0.8); this.bloom = Math.max(0, this.bloom - dt * 3);
    this.overdrive = Math.max(0, this.overdrive - dt); this.cloak = Math.max(0, this.cloak - dt); if (this.cloak <= 0) this.cloakCrit = false;
    this.nano = Math.min(this.maxNano, this.nano + this.maxNano * 0.045 * dt * (1 + this.attrs.psy * 0.03) * (pr.np || 1));
    if (this.regenField > 0) { this.regenField -= dt; this.heal(this.maxHp * 0.15 * dt); this.sh = Math.min(this.maxSh, this.sh + this.maxSh * 0.3 * dt); }
    if (pr.regen && !this.downed) this.heal(this.maxHp * pr.regen * dt);
    this.calmT += dt; if (this.calmT > 7 && !this.downed && this.hp < this.maxHp) this.heal(this.maxHp * 0.025 * dt);
    if (this.shDelayT > 0) this.shDelayT -= dt; else if (this.sh < this.maxSh && !this.downed) { if (this.sh <= 0.01) Sfx.play('shieldUp'); this.sh = Math.min(this.maxSh, this.sh + this.maxSh * (this.shieldItem ? this.shieldItem.rate : 0.3) * dt); }
    if (this.downed) { this.downT -= dt; if (this.downT <= 0) { this.die(); return; } }
    const it = this.gun();
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0 && it) { const take = Math.min(this.magSize(it) - it.cur, this.ammo[it.kind]); it.cur += take; this.ammo[it.kind] -= take; UI.dirty = true; } }
    if (it && it.leg === 'regen' && this.fireCd < -0.6 && it.cur < this.magSize(it)) { this.regenT += dt; if (this.regenT > 0.25) { this.regenT = 0; it.cur++; UI.dirty = true; } }
    // input
    const k = Input.keys, pr2 = Input.pressed;
    let mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + Input.t.mx, mz = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + Input.t.my;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const adsWant = (Input.rmb || Input.t.ads) && !this.downed && this.reloadT <= 0;
    this.adsT = clamp(this.adsT + (adsWant ? dt : -dt) * 7, 0, 1);
    this.sprint = (k.ShiftLeft || k.ShiftRight || Input.t.sprint) && mz > 0.3 && !this.downed && this.adsT < 0.3 && this.reloadT <= 0;
    // look
    const sens = 0.0022 * SENS.v * (this.adsT > 0.5 ? (it && it.kind === 'sniper' ? 0.35 : 0.65) : 1);
    this.yaw -= Input.mdx * sens; this.pitch -= Input.mdy * sens * (SENS.invert ? -1 : 1); Input.mdx = 0; Input.mdy = 0;
    if (k.KeyJ) this.yaw += dt * 2.2; if (k.KeyL) this.yaw -= dt * 2.2; if (k.KeyI && false) this.pitch += dt;
    this.pitch = clamp(this.pitch, -1.45, 1.45);
    // actions
    const firing = Input.lmb || Input.t.fire; const pressedFire = Input.lmbPressed || Input.t.firePressed; Input.lmbPressed = false; Input.t.firePressed = false;
    if (it && !this.sprint) { if (KINDS[it.kind].auto ? firing : (pressedFire || (firing && (isTouch || Input.lockFailed) && this.fireCd < -0.12))) this.fire(); }
    else if (it && this.sprint && pressedFire) { this.sprint = false; this.fire(); }
    if (pr2.has('KeyR')) this.startReload();
    if (pr2.has('KeyQ')) this.useSkill();
    if (pr2.has('KeyG')) this.grenade();
    if (pr2.has('KeyV') || pr2.has('KeyF')) this.melee();
    for (let i = 0; i < 4; i++) if (pr2.has('Digit' + (i + 1))) this.setWeapon(i);
    if (Input.wheel) { this.cycleWeapon(Input.wheel > 0 ? 1 : -1); Input.wheel = 0; }
    if (pr2.has('KeyE')) Game.interact();
    // movement
    const sp = 8.2 * this.spdMul * (this.sprint ? 1.55 : 1) * (this.adsT > 0.5 ? 0.6 : 1) * (this.downed ? 0.22 : 1) * (this.inWater ? 0.65 : 1) * (this.overdrive > 0 ? 1.1 : 1);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const wx = (fx * mz + rx * mx) * sp, wz = (fz * mz + rz * mx) * sp; const acc = this.onGround ? 12 : 2.5; const a = Math.min(1, acc * dt);
    this.vel.x += (wx - this.vel.x) * a; this.vel.z += (wz - this.vel.z) * a; this.moving = ml > 0.1;
    if (pr2.has('Space') && this.onGround && !this.downed) { this.vel.y = 8.6; this.onGround = false; }
    this.vel.y -= 24 * dt;
    this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
    zone.pushOut(this.pos, this.radius, this.pos.y, this.height);
    let g = zone.groundAt(this.pos.x, this.pos.z, this.pos.y, this.radius * 0.6); this.inWater = false;
    if (zone.waterY > -100 && g < zone.waterY - 1.1) { g = zone.waterY - 1.1; this.inWater = true; }
    if (this.pos.y <= g) { if (this.vel.y < -22) this.damage(this.maxHp * 0.1 * (-this.vel.y - 22) / 6, null); this.pos.y = g; this.vel.y = 0; this.onGround = true; }
    else if (this.onGround && this.pos.y - g < 0.5 && this.vel.y <= 0) { this.pos.y = g; this.vel.y = 0; }
    else this.onGround = false;
    if (this.pos.y < -60) { this.damage(this.maxHp * 0.25, null); const a2 = zone.arrivals._hub; this.pos.set(a2.x, zone.groundAt(a2.x, a2.z, 999), a2.z); this.vel.set(0, 0, 0); }
    // camera
    this.recoil = lerp(this.recoil, 0, Math.min(1, dt * 9)); this.shake = Math.max(0, this.shake - dt * 1.5);
    const bobY = this.onGround && this.moving ? Math.sin(VM.bob * 2) * 0.04 * (this.sprint ? 1.6 : 1) : 0; const sh = this.shake * this.shake;
    camera.position.set(this.pos.x + rr(rnd, -sh, sh) * 0.4, this.pos.y + this.eye() + bobY + rr(rnd, -sh, sh) * 0.4, this.pos.z + rr(rnd, -sh, sh) * 0.4);
    camera.rotation.set(this.pitch + this.recoil, this.yaw, this.downed ? 0.25 : 0);
    const tf = GFX.fov * (this.adsT > 0.5 ? (it && it.kind === 'sniper' ? 0.32 : 0.74) : 1) * (this.sprint ? 1.07 : 1);
    if (Math.abs(camera.fov - tf) > 0.05) { camera.fov = lerp(camera.fov, tf, Math.min(1, dt * 12)); camera.updateProjectionMatrix(); }
    // booths
    for (const b of zone.booths) if (Math.hypot(b.x - this.pos.x, b.z - this.pos.z) < 4.5 && (!this.booth || this.booth.x !== b.x || this.booth.z !== b.z || this.booth.zone !== zone.id)) { this.booth = { zone: zone.id, x: b.x, z: b.z }; this.reclaim = this.booth; UI.toast('Reclaim signature saved', 'ok'); Sfx.play('pickup', 1); Game.save(); }
  }
};

function raySphere(o, d, c, r) { const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z; const b = ox * d.x + oy * d.y + oz * d.z; const cc = ox * ox + oy * oy + oz * oz - r * r; const disc = b * b - cc; if (disc < 0) return -1; const s = Math.sqrt(disc); let t = -b - s; if (t < 0) t = -b + s; return t; }
function hitscan(o, d, range) {
  let best = range, he = null, crit = false; const hc = new THREE.Vector3(), bc = new THREE.Vector3();
  for (const e of enemies) {
    if (e.dead || !e.hostile) continue; e.center(bc); const rough = bc.distanceTo(o); if (rough > range + 10) continue;
    e.head(hc); let t = raySphere(o, d, hc, e.D.hh[1] * e.sc * 1.15); if (t > 0 && t < best) { best = t; he = e; crit = true; }
    t = raySphere(o, d, bc, e.D.hb[1] * e.sc); if (t > 0 && t < best - 0.05) { best = t; he = e; crit = false; }
  }
  const tw = zone.rayWorld(o, d, best); if (tw < best - 0.01) { best = tw; he = null; crit = false; }
  return { e: he, crit, t: best, point: o.clone().addScaledVector(d, best) };
}
function dealDamage(e, base, el, crit, point, o = {}) {
  let dmg = base;
  if (crit) dmg *= 2 * P.critMul * (1 + (o.src && o.src.crit || 0));
  if (P.cloakCrit && !o.dot && !o.chained) { dmg *= 3; crit = true; P.cloakCrit = false; P.cloak = 0; }
  if (el !== 'kinetic') dmg *= P.elMul;
  if (P.overdrive > 0) dmg *= 1.25;
  if (P.shieldItem && P.shieldItem.fx === 'amp' && P.sh >= P.maxSh * 0.99) dmg *= 1.2;
  const wasDead = e.dead; const dealt = e.hurt(dmg, el, crit, point, o);
  if (!o.noProc && el !== 'kinetic' && o.src && !e.dead) { const ch = (o.src.elc || 0) * (1 + P.elChance); if (rnd() < ch * (o.splash ? 0.6 : 1)) proc(e, el, base * (crit ? 1.5 : 1)); }
  if (o.src && o.src.leg === 'leech') P.heal(dealt * 0.06);
  if (o.src && o.src.leg === 'chain' && !o.chained) chainArc(e, base * 0.4);
  if (!o.dot) { Sfx.play(crit ? 'crit' : 'hit'); UI.hitmark(crit, e.dead && !wasDead); }
  return dealt;
}
function chainArc(e, dmg) {
  let n = 0; const c = e.center(new THREE.Vector3());
  for (const o of enemies) { if (o === e || o.dead || !o.hostile || n >= 2) continue; const oc = o.center(new THREE.Vector3()); if (oc.distanceTo(c) < 9) { n++; Tracers.add(c, oc, 0x7ad8ff, 0.06, 0.18); dealDamage(o, dmg, 'shock', false, oc, { noProc: true, chained: true }); } }
}
function proc(e, el, dmg) {
  if (el === 'fire' || el === 'acid') { e.dots[el] = { t: 3.2, tick: 0.5, dps: dmg * 0.5 }; }
  else if (el === 'shock') { e.hurt(dmg * 0.35, 'shock', false, null, { dot: true }); chainArc(e, dmg * 0.45); }
  else if (el === 'nano') { e.hurt(dmg * 0.55, 'nano', false, null, { dot: true }); FXg.burst(e.center(new THREE.Vector3()), 14, 0xc26bff, 6, 0.35, 0.4); }
}
