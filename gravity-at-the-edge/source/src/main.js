import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import * as GX from './galaxy.js';
import { World } from './world.js';
import { Input } from './input.js';
import { Hud, fmtCr, fmtDist, COL } from './hud.js';
import { GalMap } from './galmap.js';
import { AudioSys } from './audio.js';

const SAVE_KEY = 'gate-explorer-save-v1';
const NS_MAX = 0.32;
const NS_BOOST = 0.6;
const SC_MIN = 30;
const SC_MAX = 2001 * GX.C_KMS;
const BASE_RANGE = 26;
const FUEL_MAX = 32;
const MAX_FUEL_PER_JUMP = 4.5;
const MASSLOCK_KM = 3;
const DOCK_RANGE = 7.5;

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const FWD = new THREE.Vector3(0, 0, -1);

function defaultSave() {
  return {
    v: 1, cmdr: '', credits: 5000, earned: 0, systemId: GX.HOME_ID, lastStation: GX.HOME_ID, fuel: FUEL_MAX, hull: 100,
    explore: {}, unsold: [], stats: { jumps: 0, ly: 0, mapped: 0, firsts: 0, sold: 0, scooped: 0, honks: 0 }, objDone: [], route: [], started: false,
    settings: { music: 0.65, sfx: 0.75, quality: 'auto', invertY: false, voice: true, sens: 1, cockpit: true },
  };
}

class Game {
  constructor(hotData) {
    this.FUEL_MAX = FUEL_MAX;
    this.GX = GX;
    this.state = 'title';
    this.loadSave(hotData);
    this.input = new Input($('gl'));
    this.touchMode = this.input.isTouch;
    document.body.classList.toggle('touch', this.touchMode);
    this.setupRenderer();
    this.world = new World(this.renderer, this.scene);
    this.hud = new Hud(this, $('hud'));
    this.galmap = new GalMap(this);
    this.audio = new AudioSys('gravity_at_the_edge.mp3');
    this.applySettings();
    this.ship = {
      pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), angVel: new THREE.Vector3(),
      throttle: 0, mode: 'normal', scSpeed: 0, scDir: new THREE.Vector3(0, 0, -1), boostT: 0, boostCd: 0,
      fsd: null, heat: 20, hull: this.save.hull, fuel: this.save.fuel,
    };
    this.target = null;
    this.route = (this.save.route || []).map((id) => GX.findSystem(id)).filter(Boolean);
    this.hyperTarget = this.route[0] || null;
    this.scan = null;
    this.honk = null;
    this.scooping = 0;
    this.supercharged = 1;
    this.jetCharge = 0;
    this.shake = 0;
    this.titleT = 0;
    this.saveT = 0;
    this.prevPos = new THREE.Vector3();
    this.enterSystem(GX.findSystem(this.save.systemId) || GX.findSystem(GX.HOME_ID));
    this.bindUI();
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    this.last = performance.now();
    this.showTitle();
    requestAnimationFrame((t) => this.loop(t));
    window.claude?.hot?.snapshot?.(() => ({ save: this.serialize() }));
  }

  // ---------------- persistence ----------------
  loadSave(hotData) {
    let s = null;
    if (hotData && hotData.save) s = hotData.save;
    if (!s) {
      try { const raw = localStorage.getItem(SAVE_KEY); if (raw) s = JSON.parse(raw); } catch (e) { s = null; }
    }
    const d = defaultSave();
    if (s && s.v === 1) {
      this.save = { ...d, ...s, stats: { ...d.stats, ...(s.stats || {}) }, settings: { ...d.settings, ...(s.settings || {}) } };
    } else this.save = d;
  }
  serialize() {
    const s = this.save;
    if (this.ship) { s.fuel = this.ship.fuel; s.hull = this.ship.hull; }
    if (this.sys) s.systemId = this.sys.id;
    s.route = (this.route || []).map((r) => r.id);
    return s;
  }
  persist() {
    const s = this.serialize();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
  }

  // ---------------- rendering setup ----------------
  setupRenderer() {
    const canvas = $('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.touchMode, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.004, 4e10);
    this.scene.add(this.camera);
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.8, 0.55, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  quality() {
    const q = this.save.settings.quality;
    if (q !== 'auto') return q;
    return this.touchMode ? 'med' : 'high';
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    const q = this.quality();
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'med' ? 1.5 : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * dpr * 0.5, h * dpr * 0.5);
    this.camera.aspect = w / h;
    this.baseFov = clamp((2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(82) / 2) / this.camera.aspect) * 180) / Math.PI, 50, 92);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.world.tunnelCam.aspect = w / h;
    this.world.tunnelCam.fov = this.baseFov + 10;
    this.world.tunnelCam.updateProjectionMatrix();
    this.hud.resize(w, h);
    if (this.galmap.open) this.galmap.resize();
  }

  applySettings() {
    const st = this.save.settings;
    this.audio.musicVol = st.music;
    this.audio.sfxVol = st.sfx;
    this.audio.voiceOn = st.voice;
    this.input.invertY = st.invertY;
    this.input.mouseSens = st.sens;
    if (this.audio.ctx) { this.audio.applyMusic(); this.audio.setSfxVol(st.sfx); }
    document.body.classList.toggle('no-cockpit', !st.cockpit);
  }

  // ---------------- systems ----------------
  exploreFor(id) {
    let e = this.save.explore[id];
    if (!e) {
      const stub = GX.findSystem(id);
      e = this.save.explore[id] = { name: stub ? stub.name : id, honk: false, m: [], first: stub ? !stub.inBubble : false };
    }
    return e;
  }

  enterSystem(stub) {
    this.sys = GX.generateSystem(stub);
    this.world.load(this.sys);
    this.bodies = [];
    const st = this.sys.star;
    this.bodies.push({ data: st, pos: new THREE.Vector3(0, 0, 0) });
    for (const b of this.sys.bodies) this.bodies.push({ data: b, pos: new THREE.Vector3(...b.pos) });
    this.stationBody = this.sys.station ? { data: this.sys.station, pos: new THREE.Vector3(...this.sys.station.pos) } : null;
    this.target = null;
    this.scan = null;
    this.save.systemId = stub.id;
  }

  markerBodies() {
    const ex = this.exploreFor(this.sys.id);
    const out = [];
    out.push({ data: this.sys.star, pos: this.bodies[0].pos, mapped: true });
    if (this.stationBody) out.push({ ...this.stationBody, mapped: false });
    if (ex.honk) for (let i = 1; i < this.bodies.length; i++) out.push({ ...this.bodies[i], mapped: ex.m.includes(this.bodies[i].data.id) });
    return out;
  }
  radarContacts() { return this.markerBodies(); }

  hyperDir() {
    const a = this.sys.pos, b = this.hyperTarget.pos;
    return _v2.set(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
  }
  hyperDist() { return GX.distLy(this.sys.stub, this.hyperTarget); }
  jumpRange() { return BASE_RANGE * this.supercharged; }
  fuelCost(d) { return Math.max(0.3, MAX_FUEL_PER_JUMP * Math.pow(d / this.jumpRange(), 2)); }
  routeEnd() { return this.route.length ? this.route[this.route.length - 1] : null; }

  plotTo(dest) {
    const direct = GX.distLy(this.sys.stub, dest);
    const r = direct <= this.jumpRange() ? [dest] : GX.plotRoute(this.sys.stub, dest, BASE_RANGE);
    if (!r) {
      this.galmap.err = 'NO ROUTE FOUND — TOO FAR OR TOO SPARSE';
      this.audio.deny();
      return;
    }
    this.route = r;
    this.hyperTarget = r[0];
    this.audio.select();
    this.hud.log(`Route plotted to <b>${dest.name}</b> · ${r.length} jump${r.length > 1 ? 's' : ''}`);
    this.persist();
  }
  clearRoute() { this.route = []; this.hyperTarget = null; this.persist(); }

  bodyValue(d, mapped) {
    const ex = this.exploreFor(this.sys.id);
    const fb = ex.first ? 1.5 : 1;
    if (d.kind === 'star') return d.value.disc * fb;
    return (d.value.disc + (mapped ? d.value.map : 0)) * fb;
  }
  unsoldValue() { return this.save.unsold.reduce((a, u) => a + u.value, 0); }
  addData(kind, d, value) {
    this.save.unsold.push({ sys: this.sys.id, sysName: this.sys.name, body: d.id, name: d.name, kind, value: Math.round(value) });
  }
  rank() { return GX.rankFor(this.save.earned); }

  scanRange(d) { return d.radius * 10 + 15000; }

  massLocked() {
    if (this.ship.mode !== 'normal' || !this.stationBody) return false;
    return this.ship.pos.distanceTo(this.stationBody.pos) < MASSLOCK_KM;
  }

  keyLabel(a) {
    const t = this.touchMode;
    const map = {
      sc: t ? 'FSD' : 'J', hyper: t ? 'JUMP' : 'H', scan: t ? 'SURVEY' : 'C', honk: t ? 'HONK' : 'SPACE', nav: t ? 'SYSTEM' : 'N', map: t ? 'GALAXY' : 'M',
      dock: t ? 'DOCK' : 'L', target: t ? 'TARGET' : 'T', boost: t ? 'BOOST' : 'TAB',
    };
    return map[a] || a;
  }

  // ---------------- UI binding ----------------
  bindUI() {
    // title
    $('cmdr-input').value = this.save.cmdr || '';
    $('btn-launch').addEventListener('click', () => this.launchGame(false));
    $('btn-new').addEventListener('click', () => {
      const n = $('new-confirm');
      if (n.hidden) { n.hidden = false; return; }
    });
    $('btn-new-yes').addEventListener('click', () => this.launchGame(true));
    $('btn-new-no').addEventListener('click', () => ($('new-confirm').hidden = true));
    // top buttons
    document.querySelectorAll('[data-ui]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = b.dataset.ui;
      this.audio.blip();
      if (a === 'nav') this.toggleNav();
      if (a === 'map') this.toggleMap();
      if (a === 'menu') this.toggleMenu();
    }));
    $('nav-close').addEventListener('click', () => this.toggleNav(false));
    $('nav-list').addEventListener('click', (e) => {
      const row = e.target.closest('[data-body]');
      if (!row) return;
      const id = row.dataset.body;
      const b = id === 'station' ? this.stationBody : this.bodies.find((x) => x.data.id === id);
      if (b) { this.setTarget(b); this.toggleNav(false); }
    });
    $('nav-honk').addEventListener('click', () => { this.toggleNav(false); this.hud.log(`Hold <b>${this.keyLabel('honk')}</b> to charge the discovery scanner`); });
    // menu
    $('menu-resume').addEventListener('click', () => this.toggleMenu(false));
    const st = this.save.settings;
    const bindRange = (id, key, fn) => { const el = $(id); el.value = st[key]; el.addEventListener('input', () => { st[key] = parseFloat(el.value); fn && fn(); this.applySettings(); this.persist(); }); };
    bindRange('set-music', 'music', () => this.audio.setMusicVol(st.music));
    bindRange('set-sfx', 'sfx');
    bindRange('set-sens', 'sens');
    const bindCheck = (id, key) => { const el = $(id); el.checked = st[key]; el.addEventListener('change', () => { st[key] = el.checked; this.applySettings(); this.persist(); }); };
    bindCheck('set-invert', 'invertY');
    bindCheck('set-voice', 'voice');
    bindCheck('set-cockpit', 'cockpit');
    const qs = $('set-quality');
    qs.value = st.quality;
    qs.addEventListener('change', () => { st.quality = qs.value; this.onResize(); this.persist(); });
    $('menu-fuel').addEventListener('click', () => this.emergencyFuel());
    $('menu-title').addEventListener('click', () => { this.toggleMenu(false); this.persist(); this.showTitle(); });
    // station
    $('st-sell').addEventListener('click', () => this.sellData());
    $('st-refuel').addEventListener('click', () => this.refuel());
    $('st-repair').addEventListener('click', () => this.repair());
    $('st-launch').addEventListener('click', () => this.launchFromStation());
    $('st-map').addEventListener('click', () => this.toggleMap(true));
    $('dead-rebuy').addEventListener('click', () => this.rebuy());
    // touch controls
    this.bindTouch();
    // tap on canvas (touch) for targeting
    const gl = $('gl');
    gl.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') this._tap = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    gl.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' || !this._tap) return;
      if (Math.hypot(e.clientX - this._tap.x, e.clientY - this._tap.y) < 12) this.input.actions.push({ type: 'tapSelect', x: e.clientX, y: e.clientY });
      this._tap = null;
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.persist(); });
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('#hud-btns button, #tbtns button, #st-launch, #btn-launch, #btn-new-yes, #nav-list button, #nav-close, #menu-resume, #gm-close');
      if (b) setTimeout(() => b.blur(), 0);
    });
  }

  bindTouch() {
    const zone = $('stick-zone'), base = $('stick-base'), knob = $('stick-knob');
    let sid = null, ox = 0, oy = 0;
    const R = 56;
    zone.addEventListener('pointerdown', (e) => {
      if (sid !== null) return;
      sid = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      ox = e.clientX; oy = e.clientY;
      base.style.left = ox - r.left + 'px';
      base.style.top = oy - r.top + 'px';
      base.classList.add('active');
      this.input.touchStick.active = true;
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== sid) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.touchStick.x = dx / R;
      this.input.touchStick.y = dy / R;
    });
    const end = (e) => {
      if (e.pointerId !== sid) return;
      sid = null;
      knob.style.transform = '';
      base.classList.remove('active');
      this.input.touchStick.active = false;
      this.input.touchStick.x = this.input.touchStick.y = 0;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    // throttle slider
    const track = $('thr-track');
    let tid = null;
    const setThr = (e) => {
      const r = track.getBoundingClientRect();
      const v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
      this.input.touchThrottle = v < 0.04 ? 0 : v;
    };
    track.addEventListener('pointerdown', (e) => { tid = e.pointerId; track.setPointerCapture(e.pointerId); setThr(e); });
    track.addEventListener('pointermove', (e) => { if (e.pointerId === tid) setThr(e); });
    const tend = (e) => { if (e.pointerId === tid) tid = null; };
    track.addEventListener('pointerup', tend);
    track.addEventListener('pointercancel', tend);
    // buttons
    document.querySelectorAll('#tbtns [data-act]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.actions.push({ type: b.dataset.act }); b.classList.add('down'); });
      b.addEventListener('pointerup', () => b.classList.remove('down'));
      b.addEventListener('pointerleave', () => b.classList.remove('down'));
    });
    const hb = $('b-honk');
    hb.addEventListener('pointerdown', (e) => { e.preventDefault(); hb.setPointerCapture(e.pointerId); this.input.actions.push({ type: 'honkStart' }); hb.classList.add('down'); });
    const he = () => { this.input.actions.push({ type: 'honkEnd' }); hb.classList.remove('down'); };
    hb.addEventListener('pointerup', he);
    hb.addEventListener('pointercancel', he);
  }

  updateTouchUI() {
    if (!this.touchMode) return;
    const sh = this.ship;
    const t = sh.throttle;
    $('thr-fill').style.height = `${clamp(t, 0, 1) * 100}%`;
    $('thr-knob').style.bottom = `calc(${clamp(t, 0, 1) * 100}% - 3px)`;
    $('thr-blue').hidden = sh.mode !== 'sc';
    const scanOK = this.target && (this.target.data.kind === 'planet' || this.target.data.kind === 'moon');
    $('b-map').classList.toggle('dim', !scanOK);
    $('b-hyper').classList.toggle('dim', !this.hyperTarget);
    const nearSt = this.stationBody && sh.mode === 'normal' && sh.pos.distanceTo(this.stationBody.pos) < DOCK_RANGE;
    $('b-dock').classList.toggle('dim', !nearSt);
    $('b-sc').textContent = sh.mode === 'sc' ? 'DROP' : 'FSD';
    $('b-boost').classList.toggle('dim', sh.mode === 'sc');
  }

  // ---------------- screens ----------------
  showTitle() {
    this.state = 'title';
    this.input.releaseLock();
    $('title').hidden = false;
    $('touch').hidden = true;
    $('hud-btns').hidden = true;
    $('btn-launch').textContent = this.save.started ? 'CONTINUE' : 'LAUNCH';
    $('btn-new').hidden = !this.save.started;
    $('new-confirm').hidden = true;
    const r = this.rank();
    $('title-stats').innerHTML = this.save.started
      ? `<span>CMDR <b>${escapeHtml(this.save.cmdr || 'UNKNOWN')}</b></span><span>${r.name.toUpperCase()}</span><span>${fmtCr(this.save.credits)}</span><span>${this.save.stats.jumps} JUMPS</span>`
      : '';
    this.audio.updateEngine(0, 0, 'off');
  }

  launchGame(fresh) {
    this.audio.init();
    if (this.audio.status === 'tap') this.audio.retryElement();
    if (fresh) {
      const keep = this.save.settings;
      this.save = defaultSave();
      this.save.settings = keep;
      this.route = [];
      this.hyperTarget = null;
      this.supercharged = 1;
      this.ship.fuel = FUEL_MAX;
      this.ship.hull = 100;
      this.enterSystem(GX.findSystem(GX.HOME_ID));
    }
    const name = ($('cmdr-input').value || '').trim().slice(0, 24);
    this.save.cmdr = name || this.save.cmdr || 'Nova';
    $('title').hidden = true;
    $('hud-btns').hidden = false;
    $('touch').hidden = !this.touchMode;
    const firstTime = !this.save.started;
    this.save.started = true;
    this.ship.fuel = this.save.fuel;
    this.ship.hull = this.save.hull;
    if (this.sys.station) {
      this.launchFromStation(true);
    } else {
      this.arriveAt(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.7), true);
    }
    this.exploreFor(this.sys.id);
    if (!this.touchMode) this.hud.log('Click the view to capture the mouse for steering · Esc releases it');
    if (firstTime) {
      this.hud.center(`WELCOME, CMDR ${escapeHtml(this.save.cmdr.toUpperCase())}`, 'Your explorer is fuelled and clear for launch', 5);
      this.audio.speak('Welcome, Commander. Launch sequence complete.');
    } else {
      this.hud.center(this.sys.name.toUpperCase(), this.sys.star.label, 3.5);
    }
    this.persist();
  }

  toggleNav(force) {
    const el = $('nav-panel');
    const open = force === undefined ? el.hidden : force;
    if (open && this.state !== 'flight') return;
    el.hidden = !open;
    if (open) { this.input.releaseLock(); this.renderNav(); }
  }

  renderNav() {
    const ex = this.exploreFor(this.sys.id);
    $('nav-title').textContent = this.sys.name.toUpperCase();
    const rows = [];
    const sp = this.ship.pos;
    const row = (b, icon, idOverride) => {
      const d = b.data;
      const dist = Math.max(0, sp.distanceTo(b.pos) - (d.kind === 'station' ? 0 : d.radius));
      const mapped = ex.m.includes(d.id);
      const isT = this.target && this.target.data === d;
      let tags = '';
      if (d.terraform) tags += '<span class="tag tf">TERRAFORMABLE</span>';
      if (mapped) tags += '<span class="tag mp">MAPPED</span>';
      if (d.rings) tags += '<span class="tag">RINGED</span>';
      if (d.kind === 'star' && d.scoop) tags += '<span class="tag sc">SCOOPABLE</span>';
      const val = d.kind === 'station' ? 'Universal Cartographics' : fmtCr(this.bodyValue(d, mapped || d.kind === 'star'));
      rows.push(`<button class="nrow ${isT ? 'sel' : ''} k-${d.kind}" data-body="${idOverride || d.id}">
        <span class="nicon ${icon}"></span>
        <span class="nmain"><span class="nname">${escapeHtml(d.name)}</span><span class="ntype">${d.label}${d.kind === 'moon' ? '' : ''}</span>${tags ? `<span class="ntags">${tags}</span>` : ''}</span>
        <span class="nside"><span class="ndist">${fmtDist(dist)}</span><span class="nval">${val}</span></span></button>`);
    };
    row(this.bodies[0], 'star');
    if (this.stationBody) row(this.stationBody, 'station', 'station');
    if (ex.honk) {
      for (let i = 1; i < this.bodies.length; i++) row(this.bodies[i], this.bodies[i].data.kind === 'moon' ? 'moon' : 'planet');
    }
    $('nav-list').innerHTML = rows.join('');
    $('nav-honk').hidden = ex.honk;
    const total = this.sys.bodies.length + 1;
    $('nav-foot').textContent = ex.honk
      ? `${total} bodies · ${ex.m.length} mapped · system value ${fmtCr(this.sys.bodies.reduce((a, b) => a + this.bodyValue(b, true), this.bodyValue(this.sys.star, true)))}`
      : 'Unknown signals detected — run a discovery scan to reveal this system';
  }

  updateNavDist() {
    const sp = this.ship.pos;
    document.querySelectorAll('#nav-list [data-body]').forEach((row) => {
      const id = row.dataset.body;
      const b = id === 'station' ? this.stationBody : this.bodies.find((x) => x.data.id === id);
      if (!b) return;
      const d = Math.max(0, sp.distanceTo(b.pos) - (b.data.kind === 'station' ? 0 : b.data.radius));
      const el = row.querySelector('.ndist');
      const t = fmtDist(d);
      if (el && el.textContent !== t) el.textContent = t;
    });
  }

  toggleMap(force) {
    const open = force === undefined ? !this.galmap.open : force;
    if (open && this.state !== 'flight' && this.state !== 'docked') return;
    if (open) { this.input.releaseLock(); this.toggleNav(false); this.galmap.show(); } else this.galmap.hide();
  }

  toggleMenu(force) {
    const el = $('menu');
    const open = force === undefined ? el.hidden : force;
    if (this.state === 'title') return;
    el.hidden = !open;
    if (open) {
      this.input.releaseLock();
      $('menu-fuel').hidden = !(this.ship.fuel < 8 && this.state === 'flight');
      const s = this.save.stats;
      $('menu-stats').innerHTML = `<div><b>${escapeHtml(this.save.cmdr)}</b> · ${this.rank().name}</div><div>${s.jumps} jumps · ${s.ly.toFixed(1)} LY travelled · ${s.mapped} bodies mapped · ${s.firsts} first discoveries</div><div>Earned ${fmtCr(this.save.earned)}</div>`;
    }
  }

  overlayOpen() {
    return !$('menu').hidden || this.galmap.open || !$('nav-panel').hidden;
  }

  // ---------------- main loop ----------------
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    try {
      this.update(dt);
      this.render(dt);
    } catch (e) {
      console.error(e);
    }
  }

  update(dt) {
    for (const a of this.input.takeActions()) this.handleAction(a);
    if (this.state === 'title') this.updateTitle(dt);
    else if (this.state === 'flight') this.updateFlight(dt);
    else if (this.state === 'docking') this.updateDocking(dt);
    else if (this.state === 'hyper') this.updateHyper(dt);
    else if (this.state === 'docked') this.updateDocked(dt);
    if (this.state !== 'hyper') this.world.update(dt, this.camera, this.quality());
    const sh = this.ship;
    if (this.state === 'flight' || this.state === 'docking') {
      _v.copy(sh.pos).sub(this.prevPos);
      if (_v.length() > 1e5) _v.set(0, 0, 0);
      this.world.dust.visible = true;
      this.world.updateDust(this.camera.position, _v, sh.mode === 'sc' ? sh.vel : sh.vel, sh.mode);
    } else this.world.dust.visible = false;
    this.prevPos.copy(sh.pos);
    const speedN = sh.mode === 'sc' ? clamp(Math.log10(1 + sh.scSpeed / 30) / 7, 0, 1) : sh.vel.length() / NS_BOOST;
    this.audio.updateEngine(sh.throttle, speedN, this.state === 'hyper' ? 'hyper' : this.state === 'docked' ? 'docked' : this.state === 'title' ? 'off' : sh.mode);
    this.updateTouchUI();
    this.saveT += dt;
    if (this.saveT > 20 && this.state !== 'title') { this.saveT = 0; this.persist(); }
    if (!$('nav-panel').hidden) { this.navT = (this.navT || 0) + dt; if (this.navT > 0.5) { this.navT = 0; this.updateNavDist(); } }
  }

  adaptResolution(dt) {
    if (this.state === 'title' || document.hidden) return;
    this.dtEma = this.dtEma === undefined ? dt : this.dtEma * 0.95 + dt * 0.05;
    this.adaptT = (this.adaptT || 0) + dt;
    if (this.adaptT < 2.5) return;
    this.adaptT = 0;
    const q = this.quality();
    const maxR = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'med' ? 1.5 : 1);
    const minR = Math.min(0.6, maxR);
    let r = this.renderer.getPixelRatio();
    if (this.dtEma > 0.028 && r > minR + 0.01) r = Math.max(minR, r * 0.82);
    else if (this.dtEma < 0.018 && r < maxR - 0.01) r = Math.min(maxR, r * 1.12);
    else return;
    this.renderer.setPixelRatio(r);
    this.renderer.setSize(this.w, this.h, false);
    this.composer.setPixelRatio(r);
    this.composer.setSize(this.w, this.h);
  }

  render(dt) {
    this.adaptResolution(dt);
    const q = this.quality();
    if (this.state === 'hyper') {
      this.renderPass.scene = this.world.tunnelScene;
      this.renderPass.camera = this.world.tunnelCam;
    } else {
      this.renderPass.scene = this.scene;
      this.renderPass.camera = this.camera;
    }
    // crude auto-exposure: dim when a star fills the view
    const ang = this.state === 'hyper' ? 0 : this.world.starAng || 0;
    const target = 1.05 / (1 + 5 * Math.pow(ang, 1.4));
    this.exposure = this.exposure === undefined ? target : this.exposure + (target - this.exposure) * Math.min(1, dt * 3);
    this.renderer.toneMappingExposure = this.exposure;
    this.bloom.strength = 0.8 * (1 - clamp(ang * 2.2, 0, 0.75));
    if (q === 'low') this.renderer.render(this.renderPass.scene, this.renderPass.camera);
    else this.composer.render(dt);
    this.hud.draw(dt);
    this.galmap.draw();
  }

  handleAction(a) {
    if (this.state === 'title') return;
    switch (a.type) {
      case 'menu':
        if (this.galmap.open) this.toggleMap(false);
        else if (!$('nav-panel').hidden) this.toggleNav(false);
        else this.toggleMenu();
        return;
      case 'map': this.toggleMap(); return;
      case 'nav': this.toggleNav(); return;
      case 'music': {
        const on = this.audio.toggleMusic();
        this.hud.log(on ? 'Music on' : 'Music muted');
        return;
      }
      case 'cockpit': this.save.settings.cockpit = !this.save.settings.cockpit; this.applySettings(); return;
    }
    if (this.state === 'docking' && a.type === 'dock') { this.dockT = this.dockDur; return; }
    if (this.state !== 'flight') return;
    if (a.type === 'honkEnd') { this.honkRelease(); return; }
    if (this.overlayOpen()) return;
    switch (a.type) {
      case 'sc': this.toggleSupercruise(); break;
      case 'hyper': this.startHyper(); break;
      case 'scan': this.startScan(); break;
      case 'nextTarget': this.cycleTarget(); break;
      case 'targetAhead': this.targetAhead(); break;
      case 'dock': this.requestDock(); break;
      case 'boost': this.boost(); break;
      case 'zeroThrottle': this.ship.throttle = 0; this.input.touchThrottle = null; break;
      case 'blueZone': this.ship.throttle = 0.75; this.input.touchThrottle = null; break;
      case 'honkStart': this.honkStart(); break;
      case 'tapSelect': this.tapSelect(a.x, a.y); break;
      case 'requestLock': this.input.requestLock(); break;
    }
  }

  // ---------------- title showcase ----------------
  updateTitle(dt) {
    this.titleT += dt;
    const sb = this.stationBody || this.bodies[1] || this.bodies[0];
    const host = this.stationBody ? this.bodies.find((b) => b.data.id === this.sys.station.host) : this.bodies[0];
    const t = this.titleT * 0.035;
    const center = sb.pos;
    const toHost = _v.copy(host.pos).sub(center).normalize();
    const side = new THREE.Vector3().crossVectors(toHost, new THREE.Vector3(0, 1, 0)).normalize();
    const R = this.stationBody ? 5.5 : sb.data.radius * 3;
    const camPos = center.clone().addScaledVector(toHost, -R * Math.cos(t) * 0.9).addScaledVector(side, R * Math.sin(t)).add(new THREE.Vector3(0, R * 0.25, 0));
    this.camera.position.copy(camPos);
    const look = center.clone().lerp(host.pos, 0.02);
    _m.lookAt(camPos, look, new THREE.Vector3(0, 1, 0));
    this.camera.quaternion.setFromRotationMatrix(_m);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.ship.pos.copy(camPos);
  }

  // ---------------- flight ----------------
  updateFlight(dt) {
    const sh = this.ship;
    const ax = this.overlayOpen() ? { pitch: 0, yaw: 0, roll: 0, thr: 0, lat: 0, vert: 0 } : this.input.axes();
    const sc = sh.mode === 'sc';
    // throttle
    if (this.input.touchThrottle !== null && this.input.touchThrottle !== undefined) {
      sh.throttle = this.input.touchThrottle;
    }
    if (ax.thr) { sh.throttle += ax.thr * dt * 0.7; this.input.touchThrottle = null; }
    if (this.input.wheel) { sh.throttle -= this.input.wheel * 0.05; this.input.wheel = 0; this.input.touchThrottle = null; }
    sh.throttle = clamp(sh.throttle, sc ? 0 : -0.5, 1);
    // rotation
    let rp = sc ? 0.72 : 1.05, ry = sc ? 0.42 : 0.62, rr = sc ? 1.5 : 2.1;
    if (sc) {
      const bz = 1 - clamp(Math.abs(sh.throttle - 0.625) / 0.5, 0, 1) * 0.35;
      rp *= bz; ry *= bz; rr *= bz;
    }
    _v.set(ax.pitch * rp, -ax.yaw * ry, -ax.roll * rr);
    sh.angVel.lerp(_v, 1 - Math.exp(-dt * 5.5));
    const w = sh.angVel.length();
    if (w > 1e-6) {
      _q.setFromAxisAngle(_v.copy(sh.angVel).divideScalar(w), w * dt);
      sh.quat.multiply(_q).normalize();
    }
    const fwd = _v2.copy(FWD).applyQuaternion(sh.quat);
    if (!sc) this.flyNormal(dt, ax, fwd);
    else this.flySC(dt, fwd);
    this.updateHeatFuel(dt);
    this.updateFsd(dt);
    this.updateHonk(dt);
    this.updateScan(dt);
    this.updateObjectives();
    this.updateCamera(dt);
    if (sh.hull <= 0) this.destroyed();
  }

  flyNormal(dt, ax, fwd) {
    const sh = this.ship;
    sh.boostT = Math.max(0, sh.boostT - dt);
    sh.boostCd = Math.max(0, sh.boostCd - dt);
    const fwdT = sh.boostT > 0 ? NS_BOOST : sh.throttle * NS_MAX;
    _q.copy(sh.quat).invert();
    const local = _v.copy(sh.vel).applyQuaternion(_q);
    const approach = (v, t, a) => (v < t ? Math.min(t, v + a) : Math.max(t, v - a));
    local.x = approach(local.x, ax.lat * 0.1, 0.07 * dt);
    local.y = approach(local.y, ax.vert * 0.1, 0.07 * dt);
    local.z = approach(local.z, -fwdT, (sh.boostT > 0 ? 0.4 : 0.11) * dt);
    sh.vel.copy(local).applyQuaternion(sh.quat);
    sh.pos.addScaledVector(sh.vel, dt);
    this.collide(dt);
  }

  collide() {
    const sh = this.ship;
    for (const b of this.bodies) {
      const R = b.data.radius + 0.4;
      _v.copy(sh.pos).sub(b.pos);
      const d = _v.length();
      if (d < R) {
        _v.divideScalar(d || 1);
        sh.pos.copy(b.pos).addScaledVector(_v, R);
        const vr = sh.vel.dot(_v);
        if (vr < 0) {
          sh.vel.addScaledVector(_v, -vr * 1.5);
          if (-vr > 0.03) this.impact(-vr);
        }
      }
    }
    if (this.stationBody && this.state === 'flight') {
      const st = this.world.station;
      _q.copy(st.pivot.quaternion).invert();
      const lp = _v.copy(sh.pos).sub(st.pivot.position).applyQuaternion(_q);
      const rxy = Math.hypot(lp.x, lp.y);
      let n = null, pen = 0;
      // hub
      if (rxy < 0.45 && Math.abs(lp.z) < 1.08) {
        const pr = 0.45 - rxy, pz = 1.08 - Math.abs(lp.z);
        if (pr < pz) { n = new THREE.Vector3(lp.x, lp.y, 0).normalize(); pen = pr; }
        else { n = new THREE.Vector3(0, 0, Math.sign(lp.z) || 1); pen = pz; }
      }
      // torus
      const tq = Math.hypot(rxy - 1.25, lp.z);
      if (tq < 0.17) {
        const radial = new THREE.Vector3(lp.x, lp.y, 0).normalize();
        n = new THREE.Vector3(radial.x * (rxy - 1.25), radial.y * (rxy - 1.25), lp.z).normalize();
        pen = 0.17 - tq;
      }
      if (n) {
        n.applyQuaternion(st.pivot.quaternion);
        sh.pos.addScaledVector(n, pen);
        const vr = sh.vel.dot(n);
        if (vr < 0) { sh.vel.addScaledVector(n, -vr * 1.5); if (-vr > 0.02) this.impact(-vr); }
      }
    }
  }

  impact(v) {
    const dmg = clamp(v * 60, 1, 40);
    this.ship.hull -= dmg;
    this.shake = Math.max(this.shake, 0.6);
    this.audio.thud();
    this.hud.log(`<span class="r">Collision — hull ${Math.round(this.ship.hull)}%</span>`, 'warn');
  }

  scVmax() {
    // gravity-well limited supercruise speed
    let dEff = Infinity;
    const sh = this.ship;
    for (const b of this.bodies) {
      const d = Math.max(1, sh.pos.distanceTo(b.pos) - b.data.radius);
      const k = b.data.kind === 'star' ? 2.2 : b.data.gravity || 1;
      dEff = Math.min(dEff, d / k);
    }
    if (this.target && this.target.data.kind === 'station') dEff = Math.min(dEff, Math.max(1, sh.pos.distanceTo(this.target.pos)) / 1.2);
    return clamp(dEff * 0.55, SC_MIN, SC_MAX);
  }

  flySC(dt, fwd) {
    const sh = this.ship;
    const vmax = this.scVmax();
    this.vmax = vmax;
    const tgt = Math.max(SC_MIN, sh.throttle * vmax);
    if (tgt > sh.scSpeed) sh.scSpeed = Math.min(tgt, sh.scSpeed * (1 + 1.05 * dt) + 25 * dt, sh.scSpeed + (tgt - sh.scSpeed) * (1 - Math.exp(-dt * 1.2)));
    else sh.scSpeed = tgt + (sh.scSpeed - tgt) * Math.exp(-dt * 2.6);
    sh.scDir.lerp(fwd, 1 - Math.exp(-dt * 3.2)).normalize();
    sh.vel.copy(sh.scDir).multiplyScalar(sh.scSpeed);
    sh.pos.addScaledVector(sh.vel, dt);
    // stars force an emergency drop; planets make you glide along the gravity well
    let gliding = false;
    for (const b of this.bodies) {
      const d = sh.pos.distanceTo(b.pos);
      const R = b.data.radius;
      if (b.data.kind === 'star') {
        if (d < R * 1.1 + 2) { this.emergencyDrop(b); return; }
        continue;
      }
      if (d < R * 1.06 + 30) {
        gliding = true;
        const n = _v.copy(sh.pos).sub(b.pos).divideScalar(d);
        const floor = R * 1.02 + 10;
        if (d < floor) sh.pos.copy(b.pos).addScaledVector(n, floor);
        const vr = sh.scDir.dot(n);
        if (vr < 0) {
          sh.scDir.addScaledVector(n, -vr);
          if (sh.scDir.lengthSq() < 0.01) sh.scDir.crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
          sh.scDir.normalize();
          sh.vel.copy(sh.scDir).multiplyScalar(sh.scSpeed);
        }
        if (!this._glideMsg) {
          this._glideMsg = true;
          this.hud.log(`Too close to ${b.data.name} for supercruise — gliding. Press ${this.keyLabel('sc')} to drop to normal space.`);
          this.audio.blip();
        }
      }
    }
    if (!gliding) this._glideMsg = false;
    // jet cone
    this.jetCheck(dt);
  }

  jetCheck(dt) {
    const j = this.world.jets;
    if (!j) { this.jetCharge = 0; return; }
    const sh = this.ship;
    const along = sh.pos.dot(j.axis);
    const perp = _v.copy(j.axis).multiplyScalar(along).sub(sh.pos).length();
    const a = Math.abs(along);
    const inCone = a < j.len * 0.95 && a > this.sys.star.radius * 3 && perp < j.rad * (a / j.len) * 1.1 + 200;
    if (inCone) {
      this.jetCharge += dt;
      this.shake = Math.max(this.shake, 0.35);
      sh.hull -= dt * 0.8;
      const mult = this.sys.star.cls === 'N' ? 4 : 1.5;
      if (this.jetCharge > 2.5 && this.supercharged < mult) {
        this.supercharged = mult;
        this.hud.center('FSD SUPERCHARGED', `Jump range ×${mult} for your next jump`, 4, 'blue');
        this.audio.chime();
        this.audio.speak('Frame shift drive supercharged.');
      }
    } else this.jetCharge = 0;
  }

  emergencyDrop(b) {
    const sh = this.ship;
    _v.copy(sh.pos).sub(b.pos).normalize();
    const R = b.data.radius;
    sh.pos.copy(b.pos).addScaledVector(_v, b.data.kind === 'star' ? R * 1.18 : R * 1.08 + 5);
    sh.mode = 'normal';
    sh.vel.set(0, 0, 0);
    sh.throttle = 0;
    this.input.touchThrottle = this.touchMode ? 0 : null;
    sh.hull -= 12;
    sh.fsd = null;
    this.audio.cancelCharge();
    this.shake = 1.2;
    this.flash('#ffffff', 0.5);
    this.audio.boom();
    this.audio.alarm();
    this.hud.center('EMERGENCY DROP', `Too close to ${b.data.name}`, 4, 'red');
    this.audio.speak('Emergency drop.');
    this.fsdCooldown = 4;
  }

  updateHeatFuel(dt) {
    const sh = this.ship;
    const st = this.sys.star;
    let heatT = 20;
    if (sh.fsd) heatT += 14;
    if (sh.boostT > 0) heatT += 12;
    const ds = sh.pos.length();
    const x = st.radius / Math.max(ds, 1);
    const compact = st.cls === 'N' || st.cls === 'D';
    if (!compact) heatT += 150 * Math.pow(Math.max(0, x - 0.36), 2) * (sh.mode === 'normal' ? 2.2 : 1);
    this.scooping = 0;
    if (st.scoop && x > 0.5 && sh.fuel < FUEL_MAX) {
      const rate = 1.25 * Math.pow(clamp((x - 0.5) / 0.37, 0, 1), 1.5);
      if (rate > 0.005) {
        const add = Math.min(FUEL_MAX - sh.fuel, rate * dt);
        sh.fuel += add;
        this.save.stats.scooped += add;
        this.scooping = rate;
        heatT += rate * 16;
        if (!this._scoopMsg) { this._scoopMsg = true; this.hud.log('Fuel scoop deployed'); this.audio.blip(); }
      }
    } else if (x < 0.45) this._scoopMsg = false;
    const rate = heatT > sh.heat ? 0.55 : 0.32;
    sh.heat += (heatT - sh.heat) * (1 - Math.exp(-dt * rate));
    if (sh.heat > 100) {
      sh.hull -= (sh.heat - 100) * 0.12 * dt;
      this.alarmT = (this.alarmT || 0) - dt;
      if (this.alarmT <= 0) { this.alarmT = 1.6; this.audio.alarm(); }
    }
    if (sh.heat > 80 && !this._heatWarn) { this._heatWarn = true; this.audio.speak('Heat warning.'); }
    if (sh.heat < 70) this._heatWarn = false;
    this.fsdCooldown = Math.max(0, (this.fsdCooldown || 0) - dt);
  }

  // ---------------- FSD ----------------
  toggleSupercruise() {
    const sh = this.ship;
    if (sh.fsd) {
      this.cancelFsd('Frame shift drive charge cancelled');
      return;
    }
    if (sh.mode === 'sc') { this.dropOut(); return; }
    if (this.massLocked()) { this.deny('MASS LOCKED', `Fly ${MASSLOCK_KM} km clear of the station first`); return; }
    if (this.fsdCooldown > 0) { this.deny('FSD COOLING DOWN'); return; }
    sh.fsd = { kind: 'sc', t: 0, dur: 3 };
    this.audio.charge(3);
    this.hud.log('Frame shift drive charging — supercruise');
    this.setFsdFx(true);
  }

  startHyper() {
    const sh = this.ship;
    if (sh.fsd && sh.fsd.kind === 'hyper') { this.cancelFsd('Hyperspace jump cancelled'); return; }
    if (!this.hyperTarget) { this.deny('NO DESTINATION', `Open the galaxy map (${this.keyLabel('map')}) and plot a route`); return; }
    if (this.massLocked()) { this.deny('MASS LOCKED', `Fly ${MASSLOCK_KM} km clear of the station first`); return; }
    const d = this.hyperDist();
    if (d > this.jumpRange()) { this.deny('DESTINATION OUT OF RANGE', `${d.toFixed(1)} LY · range ${this.jumpRange().toFixed(1)} LY`); return; }
    const cost = this.fuelCost(d);
    if (cost > sh.fuel) { this.deny('INSUFFICIENT FUEL', `Jump needs ${cost.toFixed(1)} T · scoop a star or call a fuel drone (menu)`); return; }
    if (this.fsdCooldown > 0) { this.deny('FSD COOLING DOWN'); return; }
    if (sh.fsd) this.cancelFsd();
    sh.fsd = { kind: 'hyper', t: 0, dur: 4.5, wait: 0 };
    this.audio.charge(4.5);
    this.audio.speak('Frame shift drive charging.');
    this.hud.log(`Charging for hyperspace jump to <b>${this.hyperTarget.name}</b>`);
    this.setFsdFx(true);
  }

  cancelFsd(msg) {
    this.ship.fsd = null;
    this.audio.cancelCharge();
    this.setFsdFx(false);
    if (msg) this.hud.log(msg);
  }

  setFsdFx(on) { $('fsdfx').classList.toggle('on', on); }

  deny(msg, sub = '') {
    this.audio.deny();
    this.hud.center(msg, sub, 2.6, 'red');
  }

  updateFsd(dt) {
    const sh = this.ship;
    const f = sh.fsd;
    if (!f) return;
    if (this.massLocked()) { this.cancelFsd('Charge interrupted — mass locked'); this.deny('MASS LOCKED'); return; }
    f.t += dt;
    this.shake = Math.max(this.shake, 0.15 * Math.min(1, f.t / f.dur));
    if (f.t < f.dur) return;
    if (f.kind === 'sc') {
      sh.fsd = null;
      this.setFsdFx(false);
      sh.mode = 'sc';
      sh.scSpeed = Math.max(SC_MIN, sh.vel.length());
      sh.scDir.copy(FWD).applyQuaternion(sh.quat);
      sh.throttle = Math.max(sh.throttle, 0.4);
      this.input.touchThrottle = this.touchMode ? sh.throttle : null;
      this.flash('#bcd8ff', 0.35);
      this.audio.boom();
      this.shake = 0.8;
      this.hud.center('SUPERCRUISE', 'Throttle to the blue zone (~75%) to arrive smoothly', 2.5, 'blue');
    } else if (f.kind === 'hyper') {
      const dir = this.hyperDir();
      const fwd = _v.copy(FWD).applyQuaternion(sh.quat);
      const ang = Math.acos(clamp(fwd.dot(dir), -1, 1));
      if (ang > THREE.MathUtils.degToRad(15)) {
        f.wait += dt;
        f.t = f.dur;
        if (f.wait > 14) { this.cancelFsd('Jump aborted — not aligned'); this.deny('JUMP ABORTED', 'Align with the blue destination marker'); }
        return;
      }
      sh.fsd = null;
      this.setFsdFx(false);
      this.beginHyper();
    }
  }

  dropOut() {
    const sh = this.ship;
    const t = this.target;
    sh.mode = 'normal';
    this.flash('#bcd8ff', 0.3);
    this.audio.boom();
    this.shake = 0.6;
    if (t && t.data.kind === 'station' && sh.pos.distanceTo(t.pos) < 2500 && sh.scSpeed < 6000) {
      const st = this.world.station;
      // arrive in front of the docking slot side at ~6.5km
      const axis = _v.set(0, 0, 1).applyQuaternion(st.pivot.quaternion);
      const from = _v2.copy(sh.pos).sub(t.pos).normalize();
      const dir = from.clone().lerp(axis, 0.6).normalize();
      sh.pos.copy(t.pos).addScaledVector(dir, 6.5);
      _m.lookAt(sh.pos, t.pos, new THREE.Vector3(0, 1, 0));
      sh.quat.setFromRotationMatrix(_m);
      sh.vel.copy(FWD).applyQuaternion(sh.quat).multiplyScalar(0.12);
      sh.throttle = 0.35;
      this.hud.center('SAFE DISENGAGE', `Press ${this.keyLabel('dock')} to request docking`, 4, 'green');
      this.audio.speak('Supercruise disengaged.');
    } else {
      const sp = sh.scSpeed;
      sh.vel.copy(FWD).applyQuaternion(sh.quat).multiplyScalar(NS_MAX * 0.75);
      sh.throttle = 0.75;
      if (sp > 1e5) { sh.hull -= 3; this.hud.log('Hard drop — minor hull stress'); }
      this.hud.center('NORMAL SPACE', '', 1.8);
    }
    this.input.touchThrottle = this.touchMode ? sh.throttle : null;
    this.fsdCooldown = 2;
  }

  boost() {
    const sh = this.ship;
    if (sh.mode !== 'normal') return;
    if (sh.boostCd > 0) return;
    sh.boostT = 2.6;
    sh.boostCd = 6;
    this.audio.whoosh();
    this.shake = 0.4;
  }

  // ---------------- hyperspace ----------------
  beginHyper() {
    const dest = this.hyperTarget;
    const d = this.hyperDist();
    const dir = this.hyperDir().clone();
    this.ship.fuel -= this.fuelCost(d);
    this.save.stats.jumps++;
    this.save.stats.ly += d;
    this.supercharged = 1;
    this.hyper = { t: 0, dur: 5.6, dest, dir, loaded: false, col: new THREE.Color(...GX.STAR_TYPES[dest.cls].col) };
    this.state = 'hyper';
    this.galmap.hide();
    this.toggleNav(false);
    this.flash('#ffffff', 0.4);
    this.audio.boom();
    this.audio.muffle(true);
    this.hud.log(`Jumping to <b>${dest.name}</b>`);
    $('hyper-info').hidden = false;
    $('hud-btns').hidden = true;
    $('hyper-dest').textContent = dest.name.toUpperCase();
    $('hyper-sub').textContent = `${GX.STAR_TYPES[dest.cls].label.toUpperCase()} · ${d.toFixed(2)} LY`;
  }

  updateHyper(dt) {
    const h = this.hyper;
    h.t += dt;
    const fade = clamp(h.t / 0.6, 0, 1) * clamp((h.dur - h.t) / 0.5, 0, 1);
    this.world.updateTunnel(dt, h.t, h.col, fade, this.ship.quat);
    this.shake = 0.25;
    if (!h.loaded && h.t > 0.4) {
      h.loaded = true;
      this.enterSystem(h.dest);
      // place ship before compiling so the camera is sensible
      this.placeArrival(h.dir);
      this.updateCamera(0);
      try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* ignore */ }
    }
    if (h.t >= h.dur) this.finishHyper();
  }

  placeArrival(dir) {
    const sh = this.ship;
    const st = this.sys.star;
    let D = st.radius * 7;
    if (st.cls === 'N') D = 260000;
    if (st.cls === 'D') D = st.radius * 30;
    sh.pos.copy(dir).multiplyScalar(-D);
    _m.lookAt(sh.pos, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    // look slightly off-centre so the star isn't dead ahead
    sh.quat.setFromRotationMatrix(_m);
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.18);
    sh.quat.multiply(_q);
    sh.mode = 'sc';
    sh.scSpeed = SC_MIN;
    sh.scDir.copy(FWD).applyQuaternion(sh.quat);
    sh.throttle = 0;
    this.input.touchThrottle = this.touchMode ? 0 : null;
    sh.vel.copy(sh.scDir).multiplyScalar(SC_MIN);
    sh.angVel.set(0, 0, 0);
    this.prevPos.copy(sh.pos);
  }

  arriveAt(dir, silent) {
    this.placeArrival(dir);
    this.state = 'flight';
    if (!silent) this.onArrival();
  }

  finishHyper() {
    this.state = 'flight';
    $('hyper-info').hidden = true;
    $('hud-btns').hidden = false;
    this.flash('#ffffff', 0.6);
    this.audio.muffle(false);
    this.audio.whoosh();
    if (this.route.length && this.route[0].id === this.sys.id) this.route.shift();
    else this.route = [];
    this.hyperTarget = this.route[0] || null;
    this.onArrival();
    this.persist();
  }

  onArrival() {
    const isNew = !this.save.explore[this.sys.id];
    const ex = this.exploreFor(this.sys.id);
    const st = this.sys.star;
    if (isNew) {
      const v = this.bodyValue(st, true);
      this.addData('star', st, v);
      if (ex.first) this.save.stats.firsts++;
    }
    const tag = ex.first ? (isNew ? 'FIRST DISCOVERY' : 'DISCOVERED BY YOU') : this.sys.stub.inBubble ? 'CHARTED SPACE' : '';
    this.hud.center(this.sys.name.toUpperCase(), `${st.label}${tag ? ' · ' + tag : ''}`, 4.5, ex.first && isNew ? 'blue' : '');
    if (st.scoop) this.hud.log(`Star is scoopable — skim the corona to refuel`);
    if (st.jets) this.hud.log(`<span class="b">Jet cones detected — fly into a cone to supercharge your FSD</span>`);
    if (this.sys.station) this.hud.log(`Station in system: <b>${this.sys.station.name}</b>`);
    if (this.route.length) this.hud.log(`Next jump: <b>${this.route[0].name}</b> · ${this.route.length} remaining`);
    else if (this.save.stats.jumps > 0) this.hud.log('Route complete');
    if (isNew && ex.first) this.audio.chime();
    this.audio.speak(isNew && ex.first ? 'New system discovered.' : 'Arrived.');
  }

  // ---------------- targeting ----------------
  setTarget(b) {
    if (!b) { this.target = null; return; }
    this.target = b;
    this.audio.select();
  }

  targetables() {
    return this.markerBodies();
  }

  cycleTarget() {
    const list = this.targetables();
    if (!list.length) return;
    // sort by distance
    list.sort((a, b) => a.pos.distanceToSquared(this.ship.pos) - b.pos.distanceToSquared(this.ship.pos));
    let i = this.target ? list.findIndex((x) => x.data === this.target.data) : -1;
    const next = list[(i + 1) % list.length];
    this.setTarget(next.data.kind === 'station' ? this.stationBody : this.bodies.find((b) => b.data === next.data));
  }

  targetAhead() {
    const fwd = _v.copy(FWD).applyQuaternion(this.ship.quat);
    let best = null, ba = 0.3;
    for (const b of this.targetables()) {
      const dir = _v2.copy(b.pos).sub(this.ship.pos).normalize();
      const a = Math.acos(clamp(dir.dot(fwd), -1, 1));
      if (a < ba) { ba = a; best = b; }
    }
    if (best) this.setTarget(best.data.kind === 'station' ? this.stationBody : this.bodies.find((b) => b.data === best.data));
  }

  tapSelect(x, y) {
    let best = null, bd = this.touchMode ? 48 : 32;
    const pr = {};
    for (const b of this.targetables()) {
      this.hud.project(b.pos, pr);
      if (!pr.on) continue;
      const d = Math.hypot(pr.x - x, pr.y - y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) this.setTarget(best.data.kind === 'station' ? this.stationBody : this.bodies.find((b) => b.data === best.data));
  }

  // ---------------- scanning ----------------
  honkStart() {
    if (this.honk && (this.honk.charging || this.honk.cool > 0)) return;
    this.honk = { charging: true, t: 0, dur: 1.4, cool: 0 };
    this.audio.honkCharge();
  }
  honkRelease() {
    if (this.honk && this.honk.charging && this.honk.t < this.honk.dur) {
      this.honk = null;
      this.hud.log('Discovery scanner: hold until fully charged');
    }
  }
  updateHonk(dt) {
    const h = this.honk;
    if (!h) return;
    if (h.charging) {
      h.t += dt;
      if (h.t >= h.dur) { h.charging = false; h.cool = 3; this.fireHonk(); }
    } else {
      h.cool -= dt;
      if (h.cool <= 0) this.honk = null;
    }
  }
  fireHonk() {
    this.audio.honk();
    this.hud.pulses.push({ t: 0, dur: 1.6 });
    this.shake = 0.5;
    const ex = this.exploreFor(this.sys.id);
    this.save.stats.honks++;
    if (ex.honk) {
      this.hud.center('DISCOVERY SCAN', 'No new signals', 2.5);
      return;
    }
    ex.honk = true;
    let total = 0;
    for (const b of this.sys.bodies) {
      const v = this.bodyValue(b, false);
      total += v;
      this.addData('disc', b, v);
    }
    const n = this.sys.bodies.length;
    const special = this.sys.bodies.filter((b) => ['elw', 'water', 'ammonia'].includes(b.type) || b.terraform);
    this.hud.center('DISCOVERY SCAN COMPLETE', `${n + 1} bodies resolved · ${fmtCr(total)} of new data`, 4.5, 'blue');
    for (const s of special) this.hud.log(`<span class="b">High-value body: <b>${s.name}</b> — ${s.label}${s.terraform ? ' (terraformable)' : ''}</span>`);
    if (!n) this.hud.log('No planetary bodies in this system');
    this.persist();
  }

  startScan() {
    const t = this.target;
    if (this.scan) { this.scan = null; this.hud.log('Surface survey cancelled'); return; }
    if (!t || (t.data.kind !== 'planet' && t.data.kind !== 'moon')) { this.deny('NO SURVEY TARGET', 'Target a planet or moon first'); return; }
    const ex = this.exploreFor(this.sys.id);
    if (ex.m.includes(t.data.id)) { this.deny('ALREADY MAPPED', t.data.name); return; }
    const dist = this.ship.pos.distanceTo(t.pos) - t.data.radius;
    const range = this.scanRange(t.data);
    if (dist > range) { this.deny('OUT OF SURVEY RANGE', `Approach within ${fmtDist(range)} of ${t.data.name}`); return; }
    this.scan = { target: t, t: 0, dur: 4.5, tick: 0 };
    this.audio.blip();
    this.hud.log(`Surface survey of <b>${t.data.name}</b> started`);
  }

  updateScan(dt) {
    const s = this.scan;
    if (!s) return;
    if (this.target !== s.target) { this.scan = null; this.hud.log('Survey interrupted — target changed'); return; }
    const dist = this.ship.pos.distanceTo(s.target.pos) - s.target.data.radius;
    if (dist > this.scanRange(s.target.data) * 1.2) { this.scan = null; this.deny('SURVEY INTERRUPTED', 'Left survey range'); return; }
    s.t += dt;
    s.tick -= dt;
    if (s.tick <= 0) { s.tick = 0.25; this.audio.scanTick(s.t / s.dur); }
    if (s.t >= s.dur) {
      this.scan = null;
      const d = s.target.data;
      const ex = this.exploreFor(this.sys.id);
      ex.m.push(d.id);
      const ex2 = this.exploreFor(this.sys.id);
      const v = (d.value.map) * (ex2.first ? 1.5 : 1);
      this.addData('map', d, v);
      this.save.stats.mapped++;
      this.audio.credits();
      this.hud.center('SURFACE MAPPED', `${d.name} · +${fmtCr(v)}`, 3.5, 'blue');
      this.audio.speak('Body mapped.');
      this.persist();
    }
  }

  // ---------------- docking ----------------
  requestDock() {
    const sh = this.ship;
    if (!this.stationBody) { this.deny('NO STATION IN SYSTEM'); return; }
    if (sh.mode === 'sc') { this.deny('IN SUPERCRUISE', 'Target the station and drop out within 2,500 km'); return; }
    const d = sh.pos.distanceTo(this.stationBody.pos);
    if (d > DOCK_RANGE) { this.deny('TOO FAR TO DOCK', `Approach within ${DOCK_RANGE} km of ${this.sys.station.name}`); return; }
    if (sh.fsd) this.cancelFsd();
    const pad = 1 + Math.floor(Math.random() * 40);
    this.hud.center('DOCKING GRANTED', `Pad ${String(pad).padStart(2, '0')} · docking computer engaged`, 3.5, 'green');
    this.audio.speak(`Docking request granted. Pad ${pad}.`);
    this.audio.chime();
    this.setTarget(this.stationBody);
    this.startDocking();
  }

  startDocking() {
    const st = this.world.station;
    const sh = this.ship;
    const inv = st.pivot.quaternion.clone().invert();
    const toLocal = (p) => p.clone().sub(st.pivot.position).applyQuaternion(inv);
    const toWorld = (p) => p.clone().applyQuaternion(st.pivot.quaternion).add(st.pivot.position);
    const lp = toLocal(sh.pos);
    const pts = [lp.clone()];
    let rad = new THREE.Vector2(lp.x, lp.y);
    if (rad.length() < 0.1) rad.set(1, 0);
    rad.normalize();
    if (lp.z < 2.2) {
      pts.push(new THREE.Vector3(rad.x * 3.0, rad.y * 3.0, Math.max(lp.z, -1)));
      pts.push(new THREE.Vector3(rad.x * 2.4, rad.y * 2.4, 3.0));
    }
    pts.push(new THREE.Vector3(rad.x * 0.3, rad.y * 0.3, 3.4));
    pts.push(new THREE.Vector3(0, 0, 1.9));
    pts.push(new THREE.Vector3(0, 0, 1.1));
    pts.push(new THREE.Vector3(0, 0, 0.75));
    this.dockCurve = new THREE.CatmullRomCurve3(pts.map(toWorld), false, 'centripetal');
    const len = this.dockCurve.getLength();
    this.dockDur = clamp(len / 0.45, 7, 22);
    this.dockT = 0;
    this.state = 'docking';
    this.scan = null;
    sh.vel.set(0, 0, 0);
  }

  updateDocking(dt) {
    const sh = this.ship;
    const st = this.world.station;
    this.dockT += dt;
    const u = clamp(this.dockT / this.dockDur, 0, 1);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const p = this.dockCurve.getPointAt(e);
    const ahead = this.dockCurve.getPointAt(Math.min(1, e + 0.02));
    sh.vel.copy(p).sub(sh.pos).divideScalar(Math.max(dt, 1e-3));
    sh.pos.copy(p);
    // orientation: look along path, roll matched to station spin near the end
    const up = new THREE.Vector3(0, 1, 0);
    if (u > 0.55) {
      const spinUp = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), st.mesh.rotation.z).applyQuaternion(st.pivot.quaternion);
      up.lerp(spinUp, clamp((u - 0.55) / 0.3, 0, 1)).normalize();
    }
    if (ahead.distanceTo(p) > 1e-5) {
      _m.lookAt(p, ahead, up);
      _q.setFromRotationMatrix(_m);
      sh.quat.slerp(_q, 1 - Math.exp(-dt * 3));
    }
    sh.throttle = 0.3;
    const f = clamp((u - 0.86) / 0.12, 0, 1);
    $('fade').style.opacity = f;
    $('fade').style.background = '#000';
    this.updateCamera(dt);
    if (u >= 1) this.docked();
  }

  docked() {
    this.state = 'docked';
    this.input.releaseLock();
    this.ship.vel.set(0, 0, 0);
    this.ship.mode = 'normal';
    this.save.lastStation = this.sys.id;
    $('fade').style.opacity = 1;
    $('station').hidden = false;
    $('touch').hidden = true;
    this.audio.chime();
    this.renderStation();
    this.persist();
  }

  updateDocked() {
    // camera sits inside the hangar (fade is opaque)
  }

  renderStation() {
    const sh = this.ship;
    const st = this.sys.station;
    $('st-name').textContent = st.name.toUpperCase();
    $('st-sys').textContent = this.sys.name.toUpperCase();
    const total = this.unsoldValue();
    const bySys = {};
    for (const u of this.save.unsold) {
      bySys[u.sys] = bySys[u.sys] || { name: u.sysName, v: 0, n: 0 };
      bySys[u.sys].v += u.value;
      bySys[u.sys].n++;
    }
    const rows = Object.values(bySys).map((s) => `<div class="st-row"><span>${escapeHtml(s.name)}</span><span>${s.n} entries</span><b>${fmtCr(s.v)}</b></div>`).join('');
    $('st-data').innerHTML = rows || '<div class="st-empty">No unsold exploration data. Go find something new.</div>';
    $('st-total').textContent = fmtCr(total);
    $('st-sell').disabled = total <= 0;
    const fuelNeed = FUEL_MAX - sh.fuel;
    const fuelCost = Math.ceil(fuelNeed * 55);
    $('st-fuel').textContent = `${sh.fuel.toFixed(1)} / ${FUEL_MAX} T`;
    $('st-refuel').textContent = fuelNeed < 0.05 ? 'TANK FULL' : `REFUEL · ${fmtCr(Math.min(fuelCost, this.save.credits) || 0)}`;
    $('st-refuel').disabled = fuelNeed < 0.05;
    const hullNeed = 100 - sh.hull;
    const hullCost = Math.ceil(hullNeed * 140);
    $('st-hull').textContent = `${Math.round(sh.hull)}%`;
    $('st-repair').textContent = hullNeed < 0.5 ? 'HULL INTACT' : `REPAIR · ${fmtCr(Math.min(hullCost, this.save.credits))}`;
    $('st-repair').disabled = hullNeed < 0.5;
    $('st-cr').textContent = fmtCr(this.save.credits);
    const r = this.rank();
    $('st-rank').textContent = r.name.toUpperCase();
    $('st-rankbar').style.width = `${Math.round(r.progress * 100)}%`;
    $('st-next').textContent = r.next ? `Next: ${r.next[1]} at ${fmtCr(r.next[0])} earned` : 'Highest rank achieved';
  }

  sellData() {
    const v = this.unsoldValue();
    if (v <= 0) return;
    const before = this.rank().name;
    this.save.credits += v;
    this.save.earned += v;
    this.save.stats.sold += v;
    this.save.unsold = [];
    this.audio.credits();
    const after = this.rank().name;
    if (after !== before) {
      $('st-promo').hidden = false;
      $('st-promo').textContent = `PROMOTED: ${after.toUpperCase()}`;
      this.audio.speak(`Promotion. Explorer rank ${after}.`);
    }
    this.renderStation();
    this.updateObjectives();
    this.persist();
  }
  refuel() {
    const sh = this.ship;
    const need = FUEL_MAX - sh.fuel;
    const cost = Math.ceil(need * 55);
    const pay = Math.min(cost, this.save.credits);
    const got = cost > 0 ? need * (pay / cost) : need;
    sh.fuel += cost > this.save.credits ? Math.max(got, Math.min(need, 4)) : need;
    this.save.credits -= pay;
    this.audio.blip();
    this.renderStation();
    this.persist();
  }
  repair() {
    const sh = this.ship;
    const need = 100 - sh.hull;
    const cost = Math.ceil(need * 140);
    const pay = Math.min(cost, this.save.credits);
    sh.hull = cost > this.save.credits ? Math.max(sh.hull + need * (pay / cost), 60) : 100;
    this.save.credits -= pay;
    this.audio.blip();
    this.renderStation();
    this.persist();
  }

  launchFromStation(initial) {
    const st = this.world.station;
    const sh = this.ship;
    $('station').hidden = true;
    $('st-promo').hidden = true;
    $('touch').hidden = !this.touchMode;
    const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(st.pivot.quaternion);
    sh.pos.copy(st.pivot.position).addScaledVector(axis, 1.25);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(st.pivot.quaternion);
    _m.lookAt(sh.pos, sh.pos.clone().add(axis), up);
    sh.quat.setFromRotationMatrix(_m);
    sh.vel.copy(axis).multiplyScalar(0.18);
    sh.mode = 'normal';
    sh.throttle = 0.6;
    sh.angVel.set(0, 0, 0);
    sh.fsd = null;
    sh.heat = 20;
    this.input.touchThrottle = this.touchMode ? 0.6 : null;
    this.prevPos.copy(sh.pos);
    this.state = 'flight';
    this.target = null;
    this.launchedAt = performance.now();
    this.fadeTo(0, 1.2);
    this.audio.whoosh();
    if (!initial) this.hud.center('LAUNCHED', `${this.sys.station.name} · fly ${MASSLOCK_KM} km clear before engaging FSD`, 3);
    this.updateCamera(0);
    this.persist();
  }

  // ---------------- misc ----------------
  emergencyFuel() {
    const sh = this.ship;
    const cost = Math.min(this.save.credits, 15000);
    this.save.credits -= cost;
    sh.fuel = Math.min(FUEL_MAX, sh.fuel + 8);
    this.toggleMenu(false);
    this.hud.center('FUEL DRONE ARRIVED', `+8 T · ${fmtCr(cost)}`, 3, 'blue');
    this.audio.chime();
    this.persist();
  }

  destroyed() {
    this.state = 'dead';
    this.ship.hull = 0;
    this.input.releaseLock();
    this.flash('#ff6a3a', 1);
    this.audio.boom();
    this.audio.speak('Hull integrity critical.');
    const lost = this.unsoldValue();
    $('dead-sub').textContent = lost > 0 ? `Unsold exploration data lost: ${fmtCr(lost)}` : 'No exploration data was lost.';
    $('dead').hidden = false;
    $('touch').hidden = true;
  }

  rebuy() {
    $('dead').hidden = true;
    this.save.unsold = [];
    const cost = Math.min(this.save.credits, 25000);
    this.save.credits -= cost;
    this.ship.hull = 100;
    this.ship.fuel = FUEL_MAX;
    this.ship.heat = 20;
    this.route = [];
    this.hyperTarget = null;
    const stub = GX.findSystem(this.save.lastStation) || GX.findSystem(GX.HOME_ID);
    this.enterSystem(stub);
    this.docked();
  }

  flash(color, dur) {
    const f = $('flash');
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = 0.85;
    void f.offsetWidth;
    f.style.transition = `opacity ${dur}s ease-out`;
    f.style.opacity = 0;
  }
  fadeTo(v, dur) {
    const f = $('fade');
    f.style.transition = `opacity ${dur}s ease`;
    f.style.opacity = v;
    setTimeout(() => (f.style.transition = ''), dur * 1000 + 50);
  }

  updateCamera(dt) {
    const sh = this.ship;
    this.camera.position.copy(sh.pos);
    this.camera.quaternion.copy(sh.quat);
    if (this.shake > 0) {
      const s = this.shake * 0.006;
      _q.setFromEuler(new THREE.Euler((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s * 0.5));
      this.camera.quaternion.multiply(_q);
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    let fov = this.baseFov;
    if (sh.mode === 'sc') fov += clamp(Math.log10(1 + sh.scSpeed / 30) * 0.8, 0, 5);
    if (sh.boostT > 0) fov += 4;
    if (sh.fsd) fov -= 3 * Math.min(1, sh.fsd.t / sh.fsd.dur);
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 4));
    if (dt === 0) this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  // ---------------- guidance ----------------
  objectives() {
    const k = (a) => `<b>${this.keyLabel(a)}</b>`;
    return [
      { text: `Fly ${MASSLOCK_KM} km clear of the station, then engage supercruise with ${k('sc')}`, done: () => this.ship.mode === 'sc' },
      { text: `${this.touchMode ? 'Hold' : 'Hold'} ${k('honk')} to fire the discovery scanner`, done: () => this.exploreFor(this.sys.id).honk },
      { text: `Open the system list ${k('nav')} and target a planet`, done: () => this.target && (this.target.data.kind === 'planet' || this.target.data.kind === 'moon') },
      { text: `Fly to it — throttle to the blue zone as you arrive — then survey it with ${k('scan')}`, done: () => this.save.stats.mapped > 0 },
      { text: `Open the galaxy map ${k('map')}, pick a star system and plot a route`, done: () => this.route.length > 0 || this.save.stats.jumps > 0 },
      { text: `Turn toward the blue destination marker and jump with ${k('hyper')}`, done: () => this.save.stats.jumps > 0 },
      { text: 'Skim a scoopable star (K, G, B, F, O, A, M) to refuel — watch your heat', done: () => this.save.stats.scooped > 1.5 },
      { text: `Dock at a station ${k('dock')} and sell your exploration data`, done: () => this.save.stats.sold > 0 },
    ];
  }
  updateObjectives() {
    const list = this.objectives();
    const done = (this.save.objDone = this.save.objDone || []);
    if (done.length >= list.length) return;
    let changed = false;
    for (let i = 0; i < list.length; i++) {
      if (!done.includes(i) && list[i].done()) { done.push(i); changed = true; }
    }
    if (changed) {
      this.audio.chime();
      if (done.length >= list.length) this.hud.log('<span class="b">Training complete. The galaxy is yours, Commander.</span>');
    }
  }
  objectiveText() {
    if (this.state !== 'flight') return '';
    const list = this.objectives();
    const done = this.save.objDone || [];
    const i = list.findIndex((o, k) => !done.includes(k));
    return i >= 0 ? list[i].text.replace(/<[^>]+>/g, '') : '';
  }

  statusLine() {
    const sh = this.ship;
    if (this.state === 'docking') return 'DOCKING COMPUTER ENGAGED';
    if (sh.fsd) {
      if (sh.fsd.kind === 'hyper' && sh.fsd.t >= sh.fsd.dur) return 'ALIGN WITH DESTINATION';
      const left = Math.ceil(sh.fsd.dur - sh.fsd.t);
      return sh.fsd.kind === 'hyper' ? `HYPERSPACE CHARGING · ${left}` : `FRAME SHIFT DRIVE CHARGING · ${left}`;
    }
    return sh.mode === 'sc' ? 'SUPERCRUISE' : 'NORMAL SPACE';
  }

  hintLine() {
    const sh = this.ship;
    if (this.state !== 'flight') return '';
    if (this.stationBody && sh.mode === 'normal' && sh.pos.distanceTo(this.stationBody.pos) < DOCK_RANGE && performance.now() - (this.launchedAt || 0) > 30000) return `Press ${this.keyLabel('dock')} to request docking`;
    const t = this.target;
    if (sh.mode === 'sc' && t) {
      const d = sh.pos.distanceTo(t.pos) - (t.data.kind === 'station' ? 0 : t.data.radius);
      if (t.data.kind === 'station' && d < 2500 && sh.scSpeed < 6000) return `Safe disengage ready — press ${this.keyLabel('sc')}`;
      const closing = sh.vel.dot(_v.copy(t.pos).sub(sh.pos).normalize());
      if (closing > 0 && d / closing < 8 && sh.throttle > 0.8) return 'Approaching target — throttle to the blue zone';
      if ((t.data.kind === 'planet' || t.data.kind === 'moon') && d < this.scanRange(t.data) && !this.exploreFor(this.sys.id).m.includes(t.data.id) && !this.scan)
        return `In survey range — press ${this.keyLabel('scan')}`;
    }
    if (sh.mode === 'sc' && !t && !this.hyperTarget && this.exploreFor(this.sys.id).honk) return `Target a body with ${this.keyLabel('target')} or the system list`;
    return '';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function start(data) {
  const go = () => {
    try {
      window.__game = new Game(data || {});
    } catch (e) {
      console.error(e);
      const el = document.getElementById('boot-error');
      if (el) { el.hidden = false; el.textContent = 'This device could not start the 3D renderer (WebGL 2 is required). ' + (e && e.message ? e.message : ''); }
    }
  };
  if (document.fonts && document.fonts.load) {
    Promise.race([
      Promise.all([document.fonts.load('600 12px Rajdhani'), document.fonts.load('400 12px Michroma')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]).then(go, go);
  } else go();
}

if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
