// ===================== FX, PROJECTILES, ENEMIES, PICKUPS =====================
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _c1 = new THREE.Color();
class Particles {
  constructor(max, additive) {
    this.max = max; this.head = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.sz = new Float32Array(max); this.al = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.ml = new Float32Array(max); this.gr = new Float32Array(max); this.s0 = new Float32Array(max); this.grow = new Float32Array(max); this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.sz, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('palpha', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: 'attribute vec3 pcol; attribute float psize; attribute float palpha; uniform float uScale; varying vec3 vC; varying float vA; void main(){ vC=pcol; vA=palpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=psize>0.0?max(1.5,psize*uScale/-mv.z):0.0; gl_Position=projectionMatrix*mv; }',
      fragmentShader: additive ? 'varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d)*2.0; if(r>1.0) discard; float a=(1.0-r); gl_FragColor=vec4(vC,a*a*vA); }'
        : 'varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d)*2.0; if(r>1.0||vA<0.02) discard; vec3 c= r>0.7 ? vC*0.12 : vC; gl_FragColor=vec4(c,min(1.0,vA*1.6)); }',
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5; scene.add(this.pts);
  }
  spawn(x, y, z, vx, vy, vz, col, size, life, grav = 0, grow = 0, drag = 0) {
    const i = this.head; this.head = (i + 1) % this.max; const c = typeof col === 'number' ? _c1.set(col) : col;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b; this.sz[i] = size; this.s0[i] = size; this.al[i] = 1; this.life[i] = life; this.ml[i] = life; this.gr[i] = grav; this.grow[i] = grow; this.drag[i] = drag;
  }
  burst(p, n, col, spd, size, life, grav = 0, grow = 0, up = 0) { for (let i = 0; i < n; i++) { const a = rnd() * TAU, b = rnd() * 2 - 1, s = spd * (0.4 + rnd() * 0.6), q = Math.sqrt(1 - b * b); this.spawn(p.x, p.y, p.z, Math.cos(a) * q * s, b * s + up, Math.sin(a) * q * s, col, size * (0.7 + rnd() * 0.6), life * (0.6 + rnd() * 0.6), grav, grow, 1.5); } }
  update(dt) {
    const p = this.pos, v = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.al[i] !== 0) { this.al[i] = 0; this.sz[i] = 0; } continue; }
      this.life[i] -= dt; const k = i * 3; const dr = 1 - this.drag[i] * dt;
      v[k + 1] -= this.gr[i] * dt; v[k] *= dr; v[k + 1] *= dr; v[k + 2] *= dr; p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
      const t = Math.max(0, this.life[i] / this.ml[i]); this.al[i] = t; this.sz[i] = this.s0[i] * (1 + this.grow[i] * (1 - t));
    }
    for (const n of ['position', 'pcol', 'psize', 'palpha']) this.geo.attributes[n].needsUpdate = true;
    this.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * DEG / 2));
  }
  clear() { this.life.fill(0); }
}
let FXg, FXi; // glow (additive) & ink (opaque comic dots)

const Tracers = {
  list: [], i: 0,
  init() { for (let k = 0; k < 40; k++) { const m = new THREE.Mesh(gBox(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.visible = false; m.userData.t = 0; scene.add(m); this.list.push(m); } },
  add(a, b, col, w = 0.05, life = 0.08) {
    const m = this.list[this.i]; this.i = (this.i + 1) % this.list.length; const L = a.distanceTo(b); if (L < 0.1) return;
    m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b); m.scale.set(w, w, L); m.material.color.set(col); m.material.opacity = 1; m.visible = true; m.userData.t = life; m.userData.l = life;
  },
  update(dt) { for (const m of this.list) if (m.visible) { m.userData.t -= dt; if (m.userData.t <= 0) m.visible = false; else m.material.opacity = m.userData.t / m.userData.l; } }
};

const DmgNums = {
  act: [], pool: [],
  init() { const host = $('numbers'); for (let k = 0; k < 50; k++) { const d = document.createElement('div'); d.className = 'dn'; d.style.display = 'none'; host.appendChild(d); this.pool.push(d); } },
  add(pos, text, color, crit = false, small = false) {
    let el = this.pool.pop(); if (!el) { const o = this.act.shift(); el = o.el; }
    el.textContent = text; el.style.color = color; el.className = 'dn' + (crit ? ' crit' : '') + (small ? ' small' : ''); el.style.display = 'block';
    this.act.push({ el, p: pos.clone().add(_v3.set(rr(rnd, -0.3, 0.3), 0.3, rr(rnd, -0.3, 0.3))), t: 0, vx: rr(rnd, -1.6, 1.6), vy: crit ? 4.5 : 3.2 });
    if (crit) { const c = this.pool.pop(); if (c) { c.textContent = 'CRITICAL!'; c.style.color = '#ff4a3d'; c.className = 'dn critlbl'; c.style.display = 'block'; this.act.push({ el: c, p: pos.clone().add(_v3.set(0, 0.9, 0)), t: 0, vx: 0, vy: 2.2 }); } }
  },
  update(dt) {
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = this.act.length - 1; i >= 0; i--) {
      const a = this.act[i]; a.t += dt; a.vy -= 5 * dt; a.p.y += a.vy * dt; a.p.x += a.vx * dt * 0.3;
      if (a.t > 1.0) { a.el.style.display = 'none'; this.pool.push(a.el); this.act.splice(i, 1); continue; }
      _v1.copy(a.p).project(camera); if (_v1.z > 1) { a.el.style.opacity = 0; continue; }
      const x = (_v1.x * 0.5 + 0.5) * W, y = (-_v1.y * 0.5 + 0.5) * H; const s = a.t < 0.1 ? 0.6 + a.t * 6 : 1.2 - (a.t - 0.1) * 0.3;
      a.el.style.transform = `translate(${x | 0}px,${y | 0}px) translate(-50%,-50%) scale(${s.toFixed(2)})`; a.el.style.opacity = a.t > 0.7 ? (1 - a.t) / 0.3 : 1;
    }
  },
  clear() { for (const a of this.act) { a.el.style.display = 'none'; this.pool.push(a.el); } this.act = []; }
};

function segSphere(a, b, c, r) { _v1.subVectors(b, a); const L2 = _v1.lengthSq(); let t = L2 > 0 ? _v2.subVectors(c, a).dot(_v1) / L2 : 0; t = clamp(t, 0, 1); _v2.copy(a).addScaledVector(_v1, t); return _v2.distanceToSquared(c) < r * r ? t : -1; }

function explode(pos, radius, dmg, el, owner, opts = {}) {
  Sfx.play('explode'); const col = el !== 'kinetic' ? ELEMENTS[el].hex : 0xffa040;
  FXg.burst(pos, 40, col, radius * 3, radius * 0.5, 0.5, 0, 1.5); FXg.burst(pos, 16, 0xfff0c0, radius * 2, radius * 0.4, 0.25);
  FXi.burst(pos, 18, 0x3a3430, radius * 1.4, radius * 0.45, 1.2, -1.5, 2, 1.5); FXi.burst(pos, 12, col, radius * 4, 0.3, 0.8, 18);
  if (owner === 'player') {
    for (const e of enemies) { if (e.dead || !e.hostile) continue; e.center(_v3); const d = _v3.distanceTo(pos); if (d < radius + e.r) { const f = 1 - 0.55 * clamp(d / radius, 0, 1); dealDamage(e, dmg * f, el, false, _v3.clone(), { splash: true, src: opts.src }); } }
  } else if (!P.dead) { const d = P.chest(_v3).distanceTo(pos); if (d < radius + 0.5) P.damage(dmg * (1 - 0.5 * clamp(d / radius, 0, 1)), pos, el); }
  const dp = camera.position.distanceTo(pos); P.shake = Math.max(P.shake, clamp(1 - dp / (radius * 6), 0, 1) * 0.6); postMat.uniforms.flash.value = Math.max(postMat.uniforms.flash.value, clamp(0.25 - dp / 200, 0, 0.25));
}

// ---------- projectiles ----------
const projs = [];
function spawnProj(o) {
  let m;
  if (o.kind === 'rocket') { m = new THREE.Group(); mk(gCyl(0.08, 0.08, 0.6, 6), toon(0x5a5a5a), m, 0, 0, 0, Math.PI / 2, 0, 0); mk(gCone(0.09, 0.2, 6), toon(0xd83a2a), m, 0, 0, 0.4, Math.PI / 2, 0, 0); mk(gSph(0.12, 0), glowMat(0xffc060), m, 0, 0, -0.35); }
  else if (o.kind === 'grenade') { m = new THREE.Group(); mk(gSph(0.16, 1), toon(0x3a4a3a), m); mk(gTorus(0.16, 0.03, 4, 10), glowMat(0x9be22d), m); }
  else if (o.kind === 'laser' || o.kind === 'bullet') { m = new THREE.Mesh(gBox(1, 1, 1), glowMat(o.color, 1, true)); m.scale.set(o.size, o.size, o.kind === 'laser' ? 2.4 : 1.2); }
  else { m = new THREE.Mesh(gSph(1, 1), glowMat(o.color, 0.9, true)); m.scale.setScalar(o.size); const core = mk(gSph(0.55, 1), glowMat(0xffffff), m); }
  m.position.copy(o.pos); scene.add(m);
  const p = Object.assign({ t: 0, life: 4, grav: 0, mesh: m, vel: o.dir.clone().multiplyScalar(o.speed), bounces: 0 }, o); p.pos = o.pos.clone(); projs.push(p); return p;
}
function killProj(i) { const p = projs[i]; scene.remove(p.mesh); projs.splice(i, 1); }
function updateProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.t += dt; const prev = _v3.copy(p.pos); const a = prev.clone();
    p.vel.y -= p.grav * dt; p.pos.addScaledVector(p.vel, dt); p.mesh.position.copy(p.pos);
    if (p.kind === 'laser' || p.kind === 'bullet' || p.kind === 'rocket') p.mesh.lookAt(_v1.copy(p.pos).add(p.vel));
    if (p.kind === 'rocket') FXi.spawn(p.pos.x, p.pos.y, p.pos.z, rr(rnd, -0.5, 0.5), 0.6, rr(rnd, -0.5, 0.5), 0x8a8580, 0.45, 0.7, -0.5, 2, 1);
    else if (p.kind === 'lance' || p.kind === 'orb' || p.kind === 'plasma') { if (rnd() < 0.7) FXg.spawn(p.pos.x, p.pos.y, p.pos.z, rr(rnd, -0.6, 0.6), rr(rnd, -0.6, 0.6), rr(rnd, -0.6, 0.6), p.color, p.size * 1.2, 0.35); }
    else if (p.kind === 'grenade') p.mesh.rotation.x += dt * 8;
    const seg = p.pos.clone().sub(a); const len = seg.length(); if (len < 1e-5) continue; seg.divideScalar(len);
    let hit = false, hitPt = null;
    // targets
    if (p.owner === 'player') {
      for (const e of enemies) { if (e.dead || !e.hostile) continue; e.center(_v2); const r = e.r + (p.size || 0.2) + 0.2; const t = segSphere(a, p.pos, _v2.clone(), r); if (t >= 0) { hit = true; hitPt = a.clone().addScaledVector(seg, len * t); if (!p.splash) dealDamage(e, p.dmg, p.el, false, hitPt, { src: p.src }); break; } }
    } else if (!P.dead || P.downed) {
      const c = P.chest(_v2.set(0, 0, 0)).clone(); const t = segSphere(a, p.pos, c, 0.75 + p.size * 0.5);
      if (t >= 0) { hit = true; hitPt = c; if (!p.splash) P.damage(p.dmg, a, p.el, null, p); }
      if (!hit && sentry) { const t2 = segSphere(a, p.pos, sentry.pos, 0.8); if (t2 >= 0) { hit = true; hitPt = sentry.pos.clone(); } }
    }
    if (!hit) { const tw = zone.rayWorld(a, seg, len); if (tw < len) {
      hitPt = a.clone().addScaledVector(seg, tw);
      if (p.kind === 'grenade' && p.t < p.fuse) { p.pos.copy(hitPt).addScaledVector(seg, -0.1); p.vel.y = Math.abs(p.vel.y) * 0.4; p.vel.x *= 0.6; p.vel.z *= 0.6; continue; }
      hit = true; } }
    if (p.kind === 'grenade' && p.t >= p.fuse) { hit = true; hitPt = p.pos.clone(); }
    if (hit) {
      if (p.splash) explode(hitPt, p.splash, p.dmg, p.el, p.owner, { src: p.src });
      else { FXg.burst(hitPt, 8, p.color || 0xffd27a, 4, 0.18, 0.18); }
      killProj(i); continue;
    }
    if (p.t > p.life) { if (p.splash && p.kind === 'rocket') explode(p.pos, p.splash, p.dmg, p.el, p.owner); killProj(i); }
  }
}

// ---------- enemies ----------
const enemies = [], civs = [], pickups = []; let enemyRoot, sentry = null;
const lerpAng = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * clamp(t, 0, 1);
class Enemy {
  constructor(s) {
    this.type = s.type; const D = this.D = ENEMIES[s.type]; this.lvl = Math.max(1, s.lvl | 0); this.boss = !!s.boss; this.guard = !!s.guard; this.faction = s.faction; this.tower = !!s.tower;
    this.badass = !this.boss && !this.guard && !this.tower && this.lvl >= 3 && rnd() < 0.07;
    const zd = zone.def; const m = buildEnemyModel(this.type, zd, { faction: s.faction }); this.g = m.group; this.parts = m.parts;
    this.sc = this.boss ? ({ skitter: 3.4, rollrat: 2.6, brute: 1.6, hornback: 1.9, drone: 2.6, turret: 1.6 }[this.type] || 2.0) : this.badass ? 1.35 : 1;
    this.g.scale.setScalar(this.sc);
    const nm = ENEMY_NAMES[this.type]; const key = zd.st === 'hive' ? 'hive' : zd.k === 'dungeon' ? 'dungeon' : zd.k === 'veil' ? 'veil' : zd.b;
    this.name = this.boss ? zd.boss[0] : this.guard ? FACTIONS[s.faction].short + ' Guard' : (this.badass ? 'Badass ' : '') + (nm && nm[key] || D.n);
    const hpm = this.boss ? (zd.k === 'dungeon' ? 15 : 11) : this.badass ? 3.2 : 1;
    this.maxHp = this.hp = D.hp * S(this.lvl) * hpm;
    this.maxSh = this.sh = D.shield ? this.maxHp * D.shield : (this.boss && D.human ? this.maxHp * 0.25 : 0);
    this.dmg = D.dmg * S(this.lvl) * (this.boss ? 1.45 : this.badass ? 1.3 : 1) * 0.9;
    this.pos = new THREE.Vector3(s.x, zone.heightAt(s.x, s.z), s.z); this.home = this.pos.clone(); this.yaw = rnd() * TAU; this.vel = new THREE.Vector3();
    this.state = 'idle'; this.cd = rr(rnd, 0.6, 2); this.cd2 = 4; this.burst = 0; this.burstT = 0; this.at = rnd() * 10; this.flash = 0; this.dots = {}; this.losT = rnd() * 0.3; this.los = false; this.wind = 0; this.chargeT = 0; this.strafe = rnd() < 0.5 ? 1 : -1; this.wT = rr(rnd, 1, 4); this.wTgt = null; this.lastSpecial = 0;
    this.hostile = this.guard ? HOSTILE(P.faction, s.faction) : true; this.camp = s.camp; this.r = D.r * this.sc; this.fly = D.fly || 0; this.spdNow = 0; this.shT = 0;
    if (this.fly) this.pos.y += this.fly;
    this.mats = []; this.g.traverse(o => { if (o.isMesh) this.mats.push([o, o.material]); });
    if (this.boss || this.badass) { const ring = mk(gTorus(this.D.r * 1.4, 0.05, 4, 24), glowMat(this.boss ? 0xff4a3a : 0xffb02a, 0.8, true), this.g, 0, 0.08 - (this.fly ? this.fly / this.sc : 0), 0, Math.PI / 2, 0, 0); this.ring = ring; }
    this.g.position.copy(this.pos); enemyRoot.add(this.g);
  }
  center(out) { return out.set(this.pos.x, this.pos.y + this.D.hb[0] * this.sc, this.pos.z); }
  head(out) { const h = this.D.hh; return out.set(this.pos.x + Math.sin(this.yaw) * h[2] * this.sc, this.pos.y + h[0] * this.sc, this.pos.z + Math.cos(this.yaw) * h[2] * this.sc); }
  aggro() {
    if (this.state === 'chase' || this.dead || !this.hostile) return; this.state = 'chase';
    if (this.boss && !this.introDone) { this.introDone = true; UI.bossIntro(this); }
    for (const e of enemies) if (!e.dead && e !== this && e.hostile && e.state !== 'chase' && ((this.camp !== undefined && e.camp === this.camp) || e.pos.distanceTo(this.pos) < 16)) { e.state = 'chase'; if (e.boss && !e.introDone) { e.introDone = true; UI.bossIntro(e); } }
  }
  hurt(amt, el = 'kinetic', crit = false, point = null, o = {}) {
    if (this.dead || !this.hostile) return 0;
    let dealt = 0, a = amt, onShield = false;
    if (this.sh > 0) { onShield = true; const m = ELEM_MULT[el].shield; const s = a * m; if (s >= this.sh) { dealt += this.sh; a = (s - this.sh) / m; this.sh = 0; FXg.burst(this.center(_v1), 16, 0x7ad8ff, 6, 0.3, 0.3); } else { this.sh -= s; dealt += s; a = 0; } }
    if (a > 0) { const h = a * ELEM_MULT[el][this.D.body]; this.hp -= h; dealt += h; }
    this.shT = 4; this.flash = 0.06; if (this.state !== 'chase') this.aggro();
    const pt = point || this.center(_v1).clone();
    if (!o.silent) DmgNums.add(pt, fmt(dealt), crit ? '#ffe14a' : el !== 'kinetic' ? ELEMENTS[el].c : onShield ? '#7ad8ff' : '#ffffff', crit, !!o.dot);
    if (!o.dot) FXi.burst(pt, crit ? 10 : 5, onShield ? 0x7ad8ff : this.D.blood, 5, 0.22, 0.5, 14);
    if (this.hp <= 0) this.die(el, crit, o);
    return dealt;
  }
  die(el, crit, o = {}) {
    this.dead = true; this.deathT = 0; this.deathEl = o.splash && el === 'kinetic' ? 'gib' : el; Sfx.play('edeath'); this.restoreMats();
    if (this.ring) this.ring.visible = false;
    P.onKill(this);
    const c = this.center(_v1).clone(); const lv = this.lvl;
    const nCr = this.boss ? 6 : ri(rnd, 0, 2); for (let i = 0; i < nCr; i++) dropPickup('credits', c, { amount: Math.round((4 + lv * 3.2) * rr(rnd, 0.6, 1.4) * (this.boss ? 2 : 1)) });
    if (rnd() < 0.35 || this.boss) dropPickup('ammo', c); if (rnd() < 0.14 || this.boss) dropPickup('health', c);
    const itemChance = this.boss ? 1 : this.badass ? 0.75 : this.tower ? 0.5 : 0.17;
    if (rnd() < itemChance) dropPickup('item', c, { item: lootDrop(lv, this.boss ? 4 : this.badass ? 2 : 0) });
    if (this.boss) { dropPickup('item', c, { item: lootDrop(lv, 5) }); dropPickup('item', c, { item: makeGun(lv, rnd() < 0.35 ? 4 : 3) }); }
    if (this.deathEl === 'gib' || crit && rnd() < 0.4) FXi.burst(c, 22, this.D.blood, 9, 0.35, 0.9, 18);
  }
  restoreMats() { for (const [m, mat] of this.mats) m.material = mat; }
  fire() {
    const src = this.parts.muzzle ? this.parts.muzzle.getWorldPosition(new THREE.Vector3()) : this.center(new THREE.Vector3()).add(_v1.set(0, 0.3 * this.sc, 0));
    const tgt = P.chest(new THREE.Vector3()); const d = src.distanceTo(tgt);
    const kind = this.D.proj; const spd = { bullet: 70, laser: 85, orb: 26, plasma: 48 }[kind];
    tgt.addScaledVector(P.vel, d / spd * 0.5); const dir = tgt.sub(src).normalize(); const spread = (this.boss ? 0.025 : 0.045) + (P.sprint ? 0.02 : 0);
    dir.x += rr(rnd, -spread, spread); dir.y += rr(rnd, -spread, spread) * 0.6; dir.z += rr(rnd, -spread, spread); dir.normalize();
    const col = kind === 'bullet' ? 0xffd27a : kind === 'laser' ? (this.type === 'guard' ? FACTIONS[this.faction].hex : 0xff4a3a) : kind === 'orb' ? (zone.pal.glow || 0xb07aff) : 0x3affd0;
    spawnProj({ pos: src, dir, speed: spd, owner: 'enemy', dmg: this.dmg / Math.sqrt(this.D.burst || 1), el: kind === 'orb' ? 'nano' : kind === 'plasma' ? 'shock' : 'kinetic', kind, color: col, size: kind === 'orb' ? 0.42 * Math.min(this.sc, 1.6) : kind === 'plasma' ? 0.28 : 0.09, life: 3 });
    Sfx.play(kind === 'laser' || kind === 'plasma' ? 'laser' : kind === 'orb' ? 'orb' : 'eshot');
    FXg.spawn(src.x, src.y, src.z, 0, 0, 0, col, 0.5, 0.06);
  }
  special(dist) {
    const c = this.center(new THREE.Vector3());
    if (this.D.atk === 'ranged' || this.type === 'wraith') { for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; spawnProj({ pos: c.clone(), dir: new THREE.Vector3(Math.cos(a), 0.05, Math.sin(a)), speed: 18, owner: 'enemy', dmg: this.dmg * 0.6, el: 'nano', kind: 'orb', color: zone.pal.glow || 0xff4a3a, size: 0.5, life: 4 }); } Sfx.play('orb'); }
    else if (dist < 30) { // leap slam
      this.wind = 0.6; this.slamBig = true;
    }
    if (this.boss && (this.type === 'skitter' || this.type === 'rollrat' || this.type === 'hound' || this.type === 'mantid') && enemies.filter(e => !e.dead).length < 30) for (let i = 0; i < 3; i++) { const a = rnd() * TAU; const e = new Enemy({ type: this.type, x: this.pos.x + Math.cos(a) * 5, z: this.pos.z + Math.sin(a) * 5, lvl: Math.max(1, this.lvl - 3) }); e.state = 'chase'; enemies.push(e); }
  }
  update(dt) {
    if (this.dead) { this.deathAnim(dt); return; }
    this.at += dt; this.cd -= dt; this.cd2 -= dt; this.flash = Math.max(0, this.flash - dt);
    for (const k of ['fire', 'acid']) { const d = this.dots[k]; if (d && d.t > 0) { d.t -= dt; d.tick -= dt; if (rnd() < 0.5) { const c = this.center(_v1); FXg.spawn(c.x + rr(rnd, -0.4, 0.4), c.y + rr(rnd, -0.3, 0.6), c.z + rr(rnd, -0.4, 0.4), 0, 1.5, 0, ELEMENTS[k].hex, 0.35, 0.4); } if (d.tick <= 0) { d.tick = 0.5; this.hurt(d.dps * 0.5, k, false, null, { dot: true }); if (this.dead) return; } } }
    if (this.shT > 0) this.shT -= dt; else if (this.sh < this.maxSh) this.sh = Math.min(this.maxSh, this.sh + this.maxSh * 0.2 * dt);
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.g.visible = dist < (zone.k === 'dungeon' ? 80 : Math.min(zone.pal.ff || 300, 230)) || (this.boss && dist < 300);
    let mvx = 0, mvz = 0, spd = this.D.spd * (this.badass ? 1.15 : 1), face = null;
    if (!this.hostile) {
      if (dist < 7) face = Math.atan2(dx, dz); else if ((this.wT -= dt) < 0) { this.wT = rr(rnd, 3, 8); this.wTgt = rnd() < 0.5 ? null : this.home.clone().add(_v1.set(rr(rnd, -4, 4), 0, rr(rnd, -4, 4))); }
      if (this.wTgt) { const wx = this.wTgt.x - this.pos.x, wz = this.wTgt.z - this.pos.z, wd = Math.hypot(wx, wz); if (wd > 0.6) { mvx = wx / wd * 0.4; mvz = wz / wd * 0.4; } }
    } else {
      const aggroR = this.boss ? 62 : this.D.atk === 'ranged' ? 46 : 34;
      this.losT -= dt; if (this.losT <= 0) { this.losT = 0.3 + rnd() * 0.25; this.los = dist < aggroR * 1.6 && zone.los(this.center(_v1).clone().add(_v2.set(0, 0.4, 0)), P.eyePos(_v3)); }
      if ((this.state === 'idle' || this.state === 'return') && !P.cloak && !P.dead && ((this.los && dist < aggroR) || dist < 7)) this.aggro();
      if (this.state === 'chase') {
        if (P.cloak > 0 || P.dead) { this.lostT = (this.lostT || 0) + dt; if (this.lostT > 1.2) { this.state = 'return'; this.lostT = 0; } } else this.lostT = 0;
        if (!this.boss && !this.guard && this.pos.distanceTo(this.home) > 120) this.state = 'return';
      }
      if (this.state === 'chase' && !P.cloak) {
        const nx = dx / (dist || 1), nz = dz / (dist || 1); face = Math.atan2(dx, dz); const reach = this.D.rng * Math.max(1, this.sc * 0.7) + 0.5;
        if (this.boss && this.at - this.lastSpecial > 9 && this.los) { this.lastSpecial = this.at; this.special(dist); }
        switch (this.D.atk) {
          case 'melee':
            if (this.wind > 0) { this.wind -= dt; if (this.wind <= 0) { if (dist < reach + 1.2) this.meleeHit(1); this.cd = this.D.cd * rr(rnd, 0.8, 1.2); } }
            else if (dist < reach && this.cd <= 0) this.wind = 0.3;
            else if (dist > reach * 0.7) { mvx = nx; mvz = nz; }
            break;
          case 'charge':
            if (this.chargeT > 0) { this.chargeT -= dt; mvx = this.cdx; mvz = this.cdz; spd *= 3.3; face = Math.atan2(mvx, mvz); if (!this.chargeHit && dist < 2.2 * this.sc + 0.6) { this.chargeHit = true; this.meleeHit(1.4); P.knock(nx * 14, 6, nz * 14); } if (this.chargeT <= 0) this.cd = this.D.cd * 1.5; if (rnd() < 0.5) FXi.spawn(this.pos.x, this.pos.y + 0.2, this.pos.z, rr(rnd, -1, 1), 1, rr(rnd, -1, 1), zone.pal.g[2], 0.6, 0.6, 0, 2); }
            else if (this.wind > 0) { this.wind -= dt; if (this.wind <= 0) { this.chargeT = 1.1; this.chargeHit = false; this.cdx = nx; this.cdz = nz; } }
            else if (dist > 7 && dist < 30 && this.cd <= 0 && this.los) this.wind = 0.55;
            else if (dist < reach && this.cd <= 0) { this.meleeHit(1); this.cd = this.D.cd; }
            else { mvx = nx; mvz = nz; }
            break;
          case 'slam':
            if (this.wind > 0) { this.wind -= dt; if (this.slamBig) { mvx = nx; mvz = nz; spd *= 2.2; } if (this.wind <= 0) this.slam(dist); }
            else if (dist < reach + 0.4 && this.cd <= 0) this.wind = 0.6;
            else { mvx = nx; mvz = nz; }
            if (this.cd2 <= 0 && dist > 12 && dist < 45 && this.los) { this.cd2 = this.boss ? 2.5 : 5; const src = this.center(new THREE.Vector3()).add(_v1.set(0, 1 * this.sc, 0)); const dir = P.chest(new THREE.Vector3()).sub(src); dir.y += dist * 0.12; dir.normalize(); spawnProj({ pos: src, dir, speed: 30, owner: 'enemy', dmg: this.dmg * 0.8, el: 'kinetic', kind: 'orb', color: 0x9a8a6a, size: 0.55 * this.sc, life: 4, grav: 9, splash: 3 }); }
            break;
          case 'ranged': {
            const pref = this.D.static ? 0 : this.boss ? 15 : 18;
            if (!this.D.static) { if (dist > pref + 7 || !this.los) { mvx = nx; mvz = nz; } else if (dist < pref - 6) { mvx = -nx; mvz = -nz; } else { mvx = -nz * this.strafe * 0.7; mvz = nx * this.strafe * 0.7; if (rnd() < dt * 0.5) this.strafe *= -1; } }
            if (this.burst > 0) { this.burstT -= dt; if (this.burstT <= 0) { this.fire(); this.burst--; this.burstT = 0.13; } }
            else if (this.cd <= 0 && this.los && dist < this.D.rng * 1.3) { this.burst = this.D.burst || 1; this.burstT = 0; this.cd = this.D.cd * rr(rnd, 0.8, 1.3) * (this.boss ? 0.7 : 1); }
            break;
          }
        }
      } else if (this.state === 'return') {
        const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, hd = Math.hypot(hx, hz);
        if (hd < 2) { this.state = 'idle'; } else { mvx = hx / hd; mvz = hz / hd; } this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.15 * dt);
      } else {
        if ((this.wT -= dt) < 0) { this.wT = rr(rnd, 2, 6); this.wTgt = rnd() < 0.35 ? null : this.home.clone().add(_v1.set(rr(rnd, -8, 8), 0, rr(rnd, -8, 8))); }
        if (this.wTgt && !this.D.static) { const wx = this.wTgt.x - this.pos.x, wz = this.wTgt.z - this.pos.z, wd = Math.hypot(wx, wz); if (wd > 0.8) { mvx = wx / wd * 0.35; mvz = wz / wd * 0.35; } else this.wTgt = null; }
      }
    }
    // movement
    if (this.D.static) { mvx = 0; mvz = 0; }
    const k = 1 - Math.exp(-dt * 8); this.vel.x += (mvx * spd - this.vel.x) * k; this.vel.z += (mvz * spd - this.vel.z) * k;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (!this.D.static) {
      for (const o of enemies) { if (o === this || o.dead || Math.abs(o.pos.x - this.pos.x) > 4 || Math.abs(o.pos.z - this.pos.z) > 4) continue; const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, od = Math.hypot(ox, oz), mr = (this.r + o.r) * 0.8; if (od < mr && od > 0.001) { this.pos.x += ox / od * (mr - od) * 0.5; this.pos.z += oz / od * (mr - od) * 0.5; } }
      if (this.hostile && !P.dead) { const pd = Math.hypot(this.pos.x - P.pos.x, this.pos.z - P.pos.z), mr = this.r * 0.8 + 0.4; if (pd < mr && pd > 0.001) { this.pos.x += (this.pos.x - P.pos.x) / pd * (mr - pd); this.pos.z += (this.pos.z - P.pos.z) / pd * (mr - pd); } }
      zone.pushOut(this.pos, this.r * 0.7, this.pos.y - this.fly, 2 * this.sc);
    }
    const gy = zone.groundAt(this.pos.x, this.pos.z, this.pos.y - this.fly + 0.4, this.r * 0.5);
    if (this.fly) this.pos.y = lerp(this.pos.y, gy + this.fly * Math.min(this.sc, 1.6) + Math.sin(this.at * 2) * 0.3, Math.min(1, dt * 3)); else this.pos.y = gy;
    this.spdNow = Math.hypot(this.vel.x, this.vel.z);
    const tf = face != null ? face : this.spdNow > 0.3 ? Math.atan2(this.vel.x, this.vel.z) : this.yaw; this.yaw = lerpAng(this.yaw, tf, dt * 7);
    this.g.position.copy(this.pos); this.g.rotation.y = this.yaw;
    this.animate(dt);
    if (this.flash > 0 && !this.flashOn) { this.flashOn = true; for (const [m] of this.mats) m.material = FLASH_MAT; } else if (this.flash <= 0 && this.flashOn) { this.flashOn = false; this.restoreMats(); }
    if (this.ring) this.ring.rotation.z += dt;
  }
  meleeHit(mult) { P.damage(this.dmg * mult, this.pos, 'kinetic', this); Sfx.play('melee'); if (P.shieldItem && P.shieldItem.fx === 'spike' && P.sh > 0) this.hurt(P.shieldItem.cap * 0.8, 'kinetic', false, null, {}); }
  slam(dist) {
    Sfx.play('slam'); const R = (this.slamBig ? 9 : 5.5) * Math.sqrt(this.sc); this.slamBig = false; this.cd = this.D.cd;
    for (let i = 0; i < 30; i++) { const a = i / 30 * TAU; FXi.spawn(this.pos.x + Math.cos(a) * 1.5, this.pos.y + 0.3, this.pos.z + Math.sin(a) * 1.5, Math.cos(a) * R * 2, 2, Math.sin(a) * R * 2, zone.pal.g[2], 0.9, 0.5, 4, 1, 2); }
    if (dist < R && P.pos.y - this.pos.y < 3) { P.damage(this.dmg * 1.2, this.pos, 'kinetic', this); P.knock((P.pos.x - this.pos.x) / (dist || 1) * 10, 7, (P.pos.z - this.pos.z) / (dist || 1) * 10); }
    P.shake = Math.max(P.shake, clamp(1 - dist / 30, 0, 1) * 0.7);
  }
  animate(dt) {
    const P2 = this.parts, t = this.at, s = this.spdNow / Math.max(1, this.D.spd); const sw = Math.sin(t * (6 + this.D.spd)) * Math.min(1, s * 1.5);
    if (P2.legL) { P2.legL.rotation.x = sw * 0.7; P2.legR.rotation.x = -sw * 0.7; if (!P2.gun) { P2.armL.rotation.x = -sw * 0.6 + (this.wind > 0 ? -2.4 : 0); P2.armR.rotation.x = sw * 0.6 + (this.wind > 0 ? -2.4 : 0); } P2.root.position.y = Math.abs(sw) * 0.06; }
    if (P2.legs) P2.legs.forEach((L, i) => L.rotation.x = (i % 2 === (i < 2 ? 0 : 1) ? 1 : -1) * sw * 0.8);
    if (this.type === 'skitter') P2.body.position.y = s > 0.1 ? Math.abs(Math.sin(t * 9)) * 0.45 : 0;
    if (this.type === 'drone') { P2.body.rotation.z = Math.sin(t * 2) * 0.15; }
    if (this.type === 'wraith') { P2.body.rotation.z = Math.sin(t * 1.5) * 0.08; P2.body.rotation.x = s * 0.3; }
    if (this.type === 'mantid' && P2.arms) P2.arms.forEach((a, i) => a.rotation.x = this.wind > 0 ? -1.4 : Math.sin(t * 2 + i) * 0.15);
    if (this.type === 'hornback' && P2.head) P2.head.rotation.x = this.wind > 0 ? Math.sin(t * 20) * 0.2 + 0.3 : 0;
    if (this.type === 'turret' && P2.head) { P2.head.rotation.y = this.state === 'chase' ? Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) - this.yaw : Math.sin(t * 0.5) * 1.2; }
    if (this.type === 'brute' && this.wind > 0) { P2.armL.rotation.x = -2.8; P2.armR.rotation.x = -2.8; }
  }
  deathAnim(dt) {
    this.deathT += dt; const t = this.deathT, el = this.deathEl, g = this.g;
    if (el === 'fire') { if (!this.burnt) { this.burnt = true; const b = toon(0x1a1410); for (const [m] of this.mats) m.material = b; } if (rnd() < 0.6) FXg.spawn(this.pos.x + rr(rnd, -0.5, 0.5), this.pos.y + rr(rnd, 0, 1.5) * this.sc, this.pos.z + rr(rnd, -0.5, 0.5), 0, 2, 0, 0xff7a1f, 0.4, 0.5); g.scale.setScalar(this.sc * (1 - t * 0.25)); }
    else if (el === 'acid') { g.scale.set(this.sc * (1 + t * 0.3), this.sc * Math.max(0.05, 1 - t * 0.7), this.sc * (1 + t * 0.3)); if (rnd() < 0.5) FXi.spawn(this.pos.x, this.pos.y + 0.2, this.pos.z, rr(rnd, -2, 2), 2, rr(rnd, -2, 2), 0x9be22d, 0.35, 0.6, 10); }
    else if (el === 'shock') { g.position.set(this.pos.x + rr(rnd, -0.08, 0.08), this.pos.y + (t < 1 ? rr(rnd, 0, 0.1) : 0), this.pos.z + rr(rnd, -0.08, 0.08)); if (rnd() < 0.5) FXg.spawn(this.pos.x + rr(rnd, -0.6, 0.6), this.pos.y + rr(rnd, 0, 1.8) * this.sc, this.pos.z + rr(rnd, -0.6, 0.6), 0, 0, 0, 0x7ad8ff, 0.35, 0.12); if (t > 0.8) g.rotation.x = Math.max(g.rotation.x - dt * 4, -Math.PI / 2); }
    else if (el === 'nano') { g.position.y = this.pos.y + t * 1.5; g.scale.setScalar(this.sc * Math.max(0.01, 1 - t * 0.6)); if (rnd() < 0.8) FXg.spawn(this.pos.x + rr(rnd, -0.6, 0.6), g.position.y + rr(rnd, 0, 1.5) * this.sc, this.pos.z + rr(rnd, -0.6, 0.6), 0, 1, 0, 0xc26bff, 0.4, 0.5); }
    else if (el === 'gib') { g.visible = false; }
    else { if (this.fly) { g.position.y = Math.max(zone.heightAt(this.pos.x, this.pos.z) + 0.3, g.position.y - dt * 9); } g.rotation.x = Math.max(g.rotation.x - dt * 5, -Math.PI / 2 + 0.1); if (t > 1.6) g.position.y -= dt * 1.5; }
    if (t > 2.4) { enemyRoot.remove(g); disposeOwn(g); this.gone = true; }
  }
}
class Civilian {
  constructor(s) { const m = buildCivilian(); this.g = m.group; this.parts = m.parts; this.pos = new THREE.Vector3(s.x, zone.heightAt(s.x, s.z), s.z); this.spd = rr(rnd, 1.3, 2.2); this.t = rnd() * 10; this.tgt = null; this.wait = rnd() * 3; this.yaw = 0; enemyRoot.add(this.g); }
  update(dt) {
    this.t += dt; if (!this.tgt) { this.wait -= dt; if (this.wait < 0) { const a = rnd() * TAU, r = rr(rnd, 6, 70); this.tgt = { x: Math.cos(a) * r, z: Math.sin(a) * r }; } }
    let moving = false;
    if (this.tgt) { const dx = this.tgt.x - this.pos.x, dz = this.tgt.z - this.pos.z, d = Math.hypot(dx, dz); if (d < 1 || this.t % 30 < dt) { this.tgt = null; this.wait = rr(rnd, 1, 5); } else { this.pos.x += dx / d * this.spd * dt; this.pos.z += dz / d * this.spd * dt; this.yaw = lerpAng(this.yaw, Math.atan2(dx, dz), dt * 5); moving = true; } }
    if (zone.pushOut(this.pos, 0.4, this.pos.y, 1.8) && this.tgt) { this.tgt = null; this.wait = 0.2; }
    this.pos.y = zone.heightAt(this.pos.x, this.pos.z); this.g.position.copy(this.pos); this.g.rotation.y = this.yaw;
    const sw = moving ? Math.sin(this.t * 8) : 0; this.parts.legL.rotation.x = sw * 0.6; this.parts.legR.rotation.x = -sw * 0.6; this.parts.armL.rotation.x = -sw * 0.5; this.parts.armR.rotation.x = sw * 0.5;
    this.g.visible = this.pos.distanceTo(P.pos) < 180;
  }
}

// ---------- pickups ----------
function dropPickup(kind, pos, o = {}) {
  const g = new THREE.Group(); let beam = null; const it = o.item;
  if (kind === 'item') {
    const R = RARITY[it.rar];
    if (it.type === 'gun') { const gm = compactModel(buildGun(it)); gm.scale.setScalar(1.7); gm.rotation.y = Math.PI / 2; g.add(gm); }
    else { mk(gCyl(0.35, 0.35, 0.1, 6), toon(0x3a4250), g, 0, 0, 0, Math.PI / 2, 0, 0); mk(gCyl(0.25, 0.25, 0.12, 6), glowMat(R.hex), g, 0, 0, 0, Math.PI / 2, 0, 0); }
    beam = mk(gCyl(0.06, 0.06, 1, 6), glowMat(R.hex, 0.75, true), g, 0, 0, 0); beam.scale.y = 2 + it.rar * 2.2; beam.position.y = beam.scale.y / 2;
    if (it.rar >= 2) mk(gTorus(0.6, 0.04, 4, 20), glowMat(R.hex, 0.8, true), g, 0, -0.35, 0, Math.PI / 2, 0, 0);
  } else if (kind === 'credits') { for (let i = 0; i < 3; i++) mk(gCyl(0.16, 0.16, 0.05, 8), toon(0xf2c230), g, rr(rnd, -0.06, 0.06), i * 0.06, rr(rnd, -0.06, 0.06)); }
  else if (kind === 'ammo') { mk(gBox(0.45, 0.28, 0.3), toon(0x4a5a3a), g); mk(gBox(0.47, 0.06, 0.32), glowMat(0xffc23a), g, 0, 0.05, 0); }
  else if (kind === 'health') { mk(gBox(0.4, 0.4, 0.4), toon(0xf2f2f2), g); mk(gBox(0.42, 0.12, 0.42), glowMat(0xff3a3a), g); mk(gBox(0.12, 0.42, 0.42), glowMat(0xff3a3a), g); }
  g.position.copy(pos); scene.add(g);
  const pk = { kind, item: it, amount: o.amount || 0, g, beam, pos: pos.clone(), vel: new THREE.Vector3(rr(rnd, -3.5, 3.5), rr(rnd, 5, 8), rr(rnd, -3.5, 3.5)), t: 0, landed: false };
  pickups.push(pk); return pk;
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += dt;
    if (!p.landed) { p.vel.y -= 22 * dt; p.pos.addScaledVector(p.vel, dt); const gy = zone.groundAt(p.pos.x, p.pos.z, p.pos.y + 0.5) + 0.35; if (p.pos.y < gy) { p.pos.y = gy; if (p.vel.y < -3) { p.vel.y *= -0.3; p.vel.x *= 0.5; p.vel.z *= 0.5; } else { p.landed = true; } } zone.pushOut(p.pos, 0.3, p.pos.y - 0.3, 0.6); }
    const d = p.pos.distanceTo(P.pos.clone().setY(P.pos.y + 0.6));
    if (p.kind !== 'item' && !P.dead && p.t > 0.4) {
      if (d < 5.5) { p.pos.lerp(_v1.copy(P.pos).setY(P.pos.y + 0.8), Math.min(1, dt * 7)); p.landed = true; }
      if (d < 1.4 && P.collect(p)) { scene.remove(p.g); disposeOwn(p.g); pickups.splice(i, 1); continue; }
    }
    p.g.position.copy(p.pos); p.g.position.y += p.kind === 'item' ? 0.1 + Math.sin(p.t * 2) * 0.08 : Math.sin(p.t * 3) * 0.05; p.g.rotation.y += dt * 1.2;
    if (p.t > 240 && p.kind !== 'item') { scene.remove(p.g); pickups.splice(i, 1); }
  }
}

// ---------- sentry drone (Engineer) ----------
class Sentry {
  constructor() { const m = buildCreature('drone', [0xe8eef4, 0xffc23a, 0x2a2e34, 0x4fd6ff]); this.g = m.group; this.g.scale.setScalar(0.8); this.pos = P.pos.clone().add(_v1.set(1.5, 2.6, 0)); this.life = 18; this.cd = 0; this.tgt = null; this.scanT = 0; this.a = 0; scene.add(this.g); }
  update(dt) {
    this.life -= dt; this.a += dt; this.cd -= dt; this.scanT -= dt;
    const want = _v1.set(P.pos.x + Math.cos(this.a * 0.8) * 2.2, P.pos.y + 2.8 + Math.sin(this.a * 2) * 0.3, P.pos.z + Math.sin(this.a * 0.8) * 2.2); this.pos.lerp(want, Math.min(1, dt * 3));
    if (this.scanT <= 0) { this.scanT = 0.3; this.tgt = null; let bd = 50; for (const e of enemies) { if (e.dead || !e.hostile) continue; const d = e.pos.distanceTo(this.pos); if (d < bd && zone.los(this.pos, e.center(_v2).clone())) { bd = d; this.tgt = e; } } }
    if (this.tgt && !this.tgt.dead) { const c = this.tgt.center(_v2).clone(); this.g.rotation.y = Math.atan2(c.x - this.pos.x, c.z - this.pos.z);
      if (this.cd <= 0) { this.cd = 0.32; const d = 9 * S(P.level) * (1 + P.attrs.int * 0.02); Tracers.add(this.pos.clone(), c, 0x4fd6ff, 0.06); dealDamage(this.tgt, d, 'shock', false, c, { src: null, noProc: true }); Sfx.play('laser'); } }
    this.g.position.copy(this.pos);
    if (this.life <= 0) { scene.remove(this.g); FXg.burst(this.pos, 20, 0x4fd6ff, 5, 0.3, 0.4); sentry = null; }
  }
}

function clearEntities() {
  for (const e of enemies) { enemyRoot.remove(e.g); disposeOwn(e.g); } enemies.length = 0;
  for (const c of civs) { enemyRoot.remove(c.g); disposeOwn(c.g); } civs.length = 0;
  for (let i = projs.length - 1; i >= 0; i--) killProj(i);
  for (const p of pickups) { scene.remove(p.g); disposeOwn(p.g); } pickups.length = 0;
  if (sentry) { scene.remove(sentry.g); sentry = null; }
  FXg.clear(); FXi.clear(); DmgNums.clear();
}
function spawnZoneEntities() { for (const s of zone.spawnList) { if (s.civ) civs.push(new Civilian(s)); else enemies.push(new Enemy(s)); } }
