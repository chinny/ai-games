// ===================== CORE UTILITIES =====================
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const rnd = Math.random;
const rr = (rng, a, b) => a + (b - a) * rng();
const ri = (rng, a, b) => Math.floor(a + (b - a + 1) * rng());
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
function wpick(rng, entries) { let s = 0; for (const e of entries) s += e[1]; let r = rng() * s; for (const e of entries) { if ((r -= e[1]) <= 0) return e[0]; } return entries[entries.length - 1][0]; }
const S = (l) => Math.pow(1.13, Math.max(0, l - 1)); // level scale
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : Math.round(n).toString();
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const uid = () => Math.random().toString(36).slice(2, 10);
const $ = (id) => document.getElementById(id);
const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class Noise {
  constructor(seed) {
    const r = mulberry32(seed); this.p = new Uint16Array(512); const p = [];
    for (let i = 0; i < 256; i++) p.push(i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) this.p[i] = p[i & 255];
    this.v = new Float32Array(256); for (let i = 0; i < 256; i++) this.v[i] = r() * 2 - 1;
  }
  n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, p = this.p, v = this.v, X = xi & 255, Y = yi & 255;
    const a = v[p[p[X] + Y] & 255], b = v[p[p[X + 1] + Y] & 255], c = v[p[p[X] + Y + 1] & 255], d = v[p[p[X + 1] + Y + 1] & 255];
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    return lerp(lerp(a, b, u), lerp(c, d, u), w);
  }
  fbm(x, y, o = 4) { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < o; i++) { s += this.n2(x * f + i * 17.3, y * f - i * 9.1) * a; n += a; a *= 0.5; f *= 2.03; } return s / n; }
  ridge(x, y, o = 4) { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < o; i++) { s += (1 - Math.abs(this.n2(x * f + i * 5.7, y * f + i * 3.3))) * a; n += a; a *= 0.5; f *= 2.03; } return s / n; }
}

const Store = {
  get(k, d) { try { const v = localStorage.getItem('vyrium:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('vyrium:' + k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem('vyrium:' + k); } catch (e) { } }
};

// ===================== AUDIO =====================
const Sfx = {
  ctx: null, out: null, sfx: null, mus: null, nb: null, last: {},
  vol: Store.get('vol', 0.7), mvol: Store.get('mvol', 0.45),
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const c = this.ctx;
    this.out = c.createDynamicsCompressor(); this.out.threshold.value = -14; this.out.ratio.value = 6; this.out.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = this.vol; this.sfx.connect(this.out);
    this.mus = c.createGain(); this.mus.gain.value = this.mvol;
    const dl = c.createDelay(1); dl.delayTime.value = 0.42; const fb = c.createGain(); fb.gain.value = 0.38; const wet = c.createGain(); wet.gain.value = 0.5;
    this.mus.connect(this.out); this.mus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(this.out);
    const len = c.sampleRate; this.nb = c.createBuffer(1, len, c.sampleRate); const d = this.nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  setVol(v) { this.vol = v; Store.set('vol', v); if (this.sfx) this.sfx.gain.value = v; },
  setMusic(v) { this.mvol = v; Store.set('mvol', v); if (this.mus) this.mus.gain.value = v; },
  gate(key, gap) { if (!this.ctx) return false; const t = this.ctx.currentTime; if (this.last[key] && t - this.last[key] < gap) return false; this.last[key] = t; return true; },
  noise(dur, f, q, v, type = 'bandpass', f2, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay; const s = c.createBufferSource(); s.buffer = this.nb; s.loop = true;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },
  tone(f, dur, type, v, f2, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  },
  play(name, opt) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      switch (name) {
        case 'pistol': this.noise(0.14, 2600, 0.7, 0.5, 'bandpass', 500); this.tone(230, 0.08, 'square', 0.12, 70); break;
        case 'smg': this.noise(0.08, 3200, 0.8, 0.32, 'bandpass', 900); this.tone(320, 0.05, 'square', 0.07, 110); break;
        case 'rifle': this.noise(0.12, 2100, 0.6, 0.45, 'bandpass', 450); this.tone(170, 0.08, 'sawtooth', 0.12, 55); break;
        case 'shotgun': this.noise(0.32, 1300, 0.5, 0.85, 'lowpass', 180); this.tone(95, 0.22, 'sine', 0.45, 40); break;
        case 'sniper': this.noise(0.5, 1900, 0.4, 0.9, 'lowpass', 140); this.tone(130, 0.35, 'sawtooth', 0.28, 30); break;
        case 'launcher': this.noise(0.3, 700, 0.6, 0.5, 'lowpass', 100); this.tone(170, 0.25, 'triangle', 0.3, 80); break;
        case 'el_fire': this.noise(0.18, 4500, 2, 0.12, 'highpass'); break;
        case 'el_shock': this.tone(1300, 0.09, 'square', 0.05, 2600); break;
        case 'el_acid': this.tone(620, 0.12, 'sine', 0.06, 1500); break;
        case 'el_nano': this.tone(900, 0.14, 'triangle', 0.07, 1800); break;
        case 'hit': if (this.gate('hit', 0.035)) this.tone(1700, 0.035, 'square', 0.05); break;
        case 'crit': if (this.gate('crit', 0.05)) { this.tone(2300, 0.07, 'square', 0.08, 1400); this.noise(0.06, 5000, 1, 0.12, 'highpass'); } break;
        case 'eshot': if (this.gate('eshot', 0.06)) this.noise(0.1, 1500, 1, 0.14, 'bandpass', 600); break;
        case 'laser': if (this.gate('laser', 0.06)) this.tone(1500, 0.14, 'sawtooth', 0.05, 280); break;
        case 'orb': if (this.gate('orb', 0.08)) this.tone(500, 0.25, 'sine', 0.08, 1100); break;
        case 'explode': this.noise(0.9, 900, 0.4, 1.0, 'lowpass', 60); this.tone(75, 0.6, 'sine', 0.6, 25); break;
        case 'hurt': if (this.gate('hurt', 0.18)) this.tone(150, 0.16, 'sawtooth', 0.14, 80); break;
        case 'shieldHit': if (this.gate('sh', 0.08)) this.tone(950, 0.08, 'sine', 0.07, 520); break;
        case 'shieldBreak': this.noise(0.4, 3000, 1, 0.3, 'bandpass', 300); this.tone(620, 0.3, 'square', 0.1, 100); break;
        case 'shieldUp': this.tone(420, 0.3, 'sine', 0.1, 1250); break;
        case 'reload': this.noise(0.05, 3200, 3, 0.25); this.tone(820, 0.03, 'square', 0.07, null, 0.22); this.noise(0.04, 2500, 4, 0.2, 'bandpass', null, 0.4); break;
        case 'empty': if (this.gate('empty', 0.2)) this.tone(1250, 0.03, 'square', 0.05); break;
        case 'pickup': { const r = opt || 0; const notes = [660, 830, 990, 1320, 1660]; for (let i = 0; i <= r; i++) this.tone(notes[i], 0.12, 'triangle', 0.09, null, i * 0.06); break; }
        case 'credits': if (this.gate('cr', 0.05)) { this.tone(1800, 0.06, 'triangle', 0.07); this.tone(2400, 0.08, 'triangle', 0.07, null, 0.05); } break;
        case 'ammo': if (this.gate('am', 0.05)) { this.noise(0.05, 2000, 2, 0.2); this.tone(1000, 0.05, 'square', 0.05, null, 0.04); } break;
        case 'levelup': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.12, null, i * 0.09)); break;
        case 'ui': if (this.gate('ui', 0.04)) this.tone(1050, 0.03, 'square', 0.035); break;
        case 'deny': this.tone(220, 0.12, 'square', 0.06, 160); break;
        case 'edeath': if (this.gate('ed', 0.05)) this.noise(0.28, 900, 1, 0.25, 'bandpass', 200); break;
        case 'skill': this.tone(300, 0.5, 'sawtooth', 0.12, 1200); this.noise(0.4, 2000, 1, 0.15, 'bandpass', 6000); break;
        case 'melee': this.noise(0.14, 700, 1, 0.5, 'lowpass', 200); break;
        case 'gate': this.tone(200, 0.9, 'sine', 0.18, 820); this.noise(0.8, 1200, 2, 0.12, 'bandpass', 4000); break;
        case 'boss': this.tone(55, 1.6, 'sawtooth', 0.22, 48); this.tone(82, 1.6, 'sawtooth', 0.16, 70); this.noise(1.2, 300, 1, 0.3, 'lowpass', 80); break;
        case 'chest': this.tone(500, 0.12, 'square', 0.07, 900); this.noise(0.2, 1500, 2, 0.15, 'bandpass', 400); break;
        case 'slam': this.noise(0.5, 400, 0.7, 0.7, 'lowpass', 60); this.tone(60, 0.4, 'sine', 0.5, 30); break;
        case 'throw': this.noise(0.15, 1200, 1, 0.2, 'bandpass', 500); break;
        case 'down': this.tone(300, 1.2, 'sawtooth', 0.15, 60); break;
        case 'revive': [392, 523, 784].forEach((f, i) => this.tone(f, 0.3, 'square', 0.08, null, i * 0.08)); break;
        case 'mission': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.1, null, i * 0.1)); break;
        case 'comm': this.tone(1400, 0.05, 'square', 0.04); this.tone(1800, 0.05, 'square', 0.04, null, 0.07); break;
      }
    } catch (e) { }
  }
};

const Music = {
  mood: null, next: 0, step: 0,
  moods: {
    title: { root: 52, scale: [0, 3, 7, 10, 14, 15], wave: 'sawtooth', tempo: 3.4, cut: 900, pl: 0.6 },
    corp: { root: 57, scale: [0, 4, 7, 11, 14], wave: 'triangle', tempo: 2.8, cut: 2200, pl: 0.8 },
    clan: { root: 50, scale: [0, 2, 3, 7, 9, 10], wave: 'sawtooth', tempo: 3.0, cut: 800, pl: 0.7 },
    neutral: { root: 55, scale: [0, 2, 4, 7, 9], wave: 'triangle', tempo: 2.9, cut: 1500, pl: 0.7 },
    wild: { root: 52, scale: [0, 3, 5, 7, 10], wave: 'sine', tempo: 3.3, cut: 1300, pl: 0.55 },
    desert: { root: 50, scale: [0, 1, 4, 5, 7, 8, 10], wave: 'triangle', tempo: 3.5, cut: 1100, pl: 0.5 },
    cold: { root: 54, scale: [0, 2, 3, 7, 8], wave: 'sine', tempo: 3.8, cut: 1600, pl: 0.45 },
    dungeon: { root: 45, scale: [0, 1, 5, 6, 10], wave: 'sawtooth', tempo: 4.2, cut: 520, pl: 0.35 },
    veil: { root: 48, scale: [0, 2, 4, 6, 8, 10], wave: 'sine', tempo: 3.7, cut: 2600, pl: 0.7 },
    hive: { root: 44, scale: [0, 1, 6, 7, 11], wave: 'square', tempo: 3.9, cut: 600, pl: 0.4 },
  },
  set(m) { this.mood = this.moods[m] || this.moods.wild; this.next = 0; },
  hz: (n) => 440 * Math.pow(2, (n - 69) / 12),
  update() {
    const c = Sfx.ctx; if (!c || c.state !== 'running' || !this.mood || Sfx.mvol <= 0) return;
    if (c.currentTime < this.next) return;
    const md = this.mood, t = c.currentTime + 0.05, L = md.scale.length; this.next = t + md.tempo; this.step++;
    const prog = [0, 3, 1, 4, 0, 2, 3, 1]; const deg = prog[this.step % prog.length];
    for (const i of [0, 2, 4]) { const k = deg + i; const n = md.root + md.scale[k % L] + 12 * Math.floor(k / L) - 12; this.pad(this.hz(n), t, md.tempo * 1.35, md); }
    this.pad(this.hz(md.root - 24 + md.scale[deg % L]), t, md.tempo * 1.2, md, 0.05);
    if (Math.random() < md.pl) {
      const cnt = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < cnt; k++) { if (Math.random() < 0.75) this.pluck(this.hz(md.root + 12 + md.scale[Math.floor(Math.random() * L)]), t + k * md.tempo / cnt); }
    }
  },
  pad(f, t, dur, md, vol = 0.035) {
    const c = Sfx.ctx; const g = c.createGain(); const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = md.cut; fl.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const det of [-6, 6]) { const o = c.createOscillator(); o.type = md.wave; o.frequency.value = f; o.detune.value = det; o.connect(fl); o.start(t); o.stop(t + dur + 0.1); }
    fl.connect(g); g.connect(Sfx.mus);
  },
  pluck(f, t) {
    const c = Sfx.ctx; const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.1);
    o.connect(g); g.connect(Sfx.mus); o.start(t); o.stop(t + 1.2);
  }
};
