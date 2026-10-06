// Music playback + synthesized ship sounds (WebAudio)
export class AudioSys {
  constructor(musicUrl) {
    this.ctx = null;
    this.musicUrl = musicUrl;
    this.musicVol = 0.65;
    this.sfxVol = 0.75;
    this.musicOn = true;
    this.voiceOn = true;
    this.status = 'loading';
    this.prefetch = fetch(musicUrl)
      .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
      .catch(() => null);
    this.lastSpeak = 0;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    ctx.resume();
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicOn ? this.musicVol : 0;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.7;
    this.musicGain.connect(this.musicFilter);
    this.musicFilter.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.buildEngine();
    this.startMusic();
  }

  async startMusic() {
    const ab = await this.prefetch;
    if (!ab) { this.useElementFallback(); return; }
    try {
      const buf = await new Promise((res, rej) => {
        const p = this.ctx.decodeAudioData(ab.slice(0), res, rej);
        if (p && p.then) p.then(res, rej);
      });
      this.musicBuf = buf;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.musicGain);
      src.start();
      this.musicSrc = src;
      this.status = 'playing';
    } catch (e) {
      this.useElementFallback();
    }
  }

  useElementFallback() {
    try {
      const el = new Audio(this.musicUrl);
      el.loop = true;
      el.volume = this.musicOn ? this.musicVol : 0;
      this.el = el;
      el.play().then(() => (this.status = 'playing')).catch(() => (this.status = 'tap'));
    } catch (e) {
      this.status = 'unavailable';
    }
  }

  retryElement() {
    if (this.el && this.el.paused) this.el.play().then(() => (this.status = 'playing')).catch(() => {});
  }

  setMusicVol(v) {
    this.musicVol = v;
    this.applyMusic();
  }
  setSfxVol(v) {
    this.sfxVol = v;
    if (this.sfx) this.sfx.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
  toggleMusic() {
    this.musicOn = !this.musicOn;
    this.applyMusic();
    return this.musicOn;
  }
  applyMusic() {
    const v = this.musicOn ? this.musicVol : 0;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
    if (this.el) this.el.volume = v;
  }
  muffle(on) {
    if (!this.musicFilter) return;
    this.musicFilter.frequency.cancelScheduledValues(this.ctx.currentTime);
    this.musicFilter.frequency.setTargetAtTime(on ? 900 : 20000, this.ctx.currentTime, on ? 0.4 : 0.8);
  }

  buildEngine() {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 300;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    n.connect(this.engFilter);
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.sfx);
    n.start();
    this.hum = ctx.createOscillator();
    this.hum.type = 'sawtooth';
    this.hum.frequency.value = 46;
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 160;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.hum.connect(hf);
    hf.connect(this.humGain);
    this.humGain.connect(this.sfx);
    this.hum.start();
    // supercruise / hyperspace rumble
    const r = ctx.createBufferSource();
    r.buffer = this.noise;
    r.loop = true;
    this.rumbleF = ctx.createBiquadFilter();
    this.rumbleF.type = 'bandpass';
    this.rumbleF.frequency.value = 90;
    this.rumbleF.Q.value = 0.8;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    r.connect(this.rumbleF);
    this.rumbleF.connect(this.rumbleGain);
    this.rumbleGain.connect(this.sfx);
    r.start();
  }

  updateEngine(throttle, speedN, mode) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const a = Math.abs(throttle);
    let eng = 0.05 + a * 0.22, hum = 0.03 + a * 0.05, rum = 0;
    let ef = 220 + a * 700 + speedN * 400;
    if (mode === 'sc') { eng = 0.1 + a * 0.12; hum = 0.06; rum = 0.25 + speedN * 0.25; ef = 500 + speedN * 800; }
    else if (mode === 'hyper') { eng = 0.3; hum = 0.1; rum = 0.9; ef = 1600; }
    else if (mode === 'docked' || mode === 'off') { eng = 0; hum = 0.01; rum = 0; }
    this.engGain.gain.setTargetAtTime(eng, t, 0.2);
    this.engFilter.frequency.setTargetAtTime(ef, t, 0.2);
    this.humGain.gain.setTargetAtTime(hum, t, 0.3);
    this.hum.frequency.setTargetAtTime(42 + a * 18 + (mode === 'sc' ? 10 : 0), t, 0.3);
    this.rumbleGain.gain.setTargetAtTime(rum, t, 0.4);
    this.rumbleF.frequency.setTargetAtTime(mode === 'hyper' ? 140 : 70 + speedN * 60, t, 0.4);
  }

  _env(node, peak, a, d, start) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + a);
    g.gain.exponentialRampToValueAtTime(0.0001, start + a + d);
    node.connect(g);
    g.connect(this.sfx);
    return g;
  }

  tone(freq, dur = 0.12, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    this._env(o, vol, 0.005, dur, t);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(dur, vol, f0, f1, type = 'lowpass', delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    n.connect(f);
    this._env(f, vol, 0.02, dur, t);
    n.start(t);
    n.stop(t + dur + 0.1);
  }

  blip() { this.tone(1400, 0.05, 'square', 0.04); }
  select() { this.tone(880, 0.06, 'triangle', 0.08); this.tone(1320, 0.08, 'triangle', 0.06, null, 0.05); }
  deny() { this.tone(220, 0.15, 'square', 0.07); this.tone(180, 0.2, 'square', 0.06, null, 0.12); }
  chime() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.1, null, i * 0.09)); }
  credits() { [988, 1319, 1760, 2093].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.07, null, i * 0.06)); }
  alarm() { this.tone(740, 0.12, 'square', 0.06); this.tone(740, 0.12, 'square', 0.06, null, 0.22); }
  scanTick(p) { this.tone(500 + p * 900, 0.04, 'sine', 0.05); }

  charge(dur) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(60, t);
    o.frequency.exponentialRampToValueAtTime(420, t + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + dur);
    o.connect(f);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
    f.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.3);
    this.chargeNode = { o, g };
    this.noiseBurst(dur, 0.12, 200, 3000, 'bandpass');
  }
  cancelCharge() {
    if (this.chargeNode && this.ctx) {
      try {
        this.chargeNode.g.gain.cancelScheduledValues(this.ctx.currentTime);
        this.chargeNode.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
      } catch (e) { /* ignore */ }
    }
  }

  boom() {
    this.tone(90, 1.4, 'sine', 0.5, 28);
    this.noiseBurst(1.6, 0.4, 1200, 60);
  }
  honkCharge() { this.tone(80, 1.2, 'sawtooth', 0.05, 260); }
  honk() {
    this.tone(55, 2.6, 'sine', 0.55, 30);
    this.tone(110, 1.8, 'triangle', 0.18, 55);
    this.noiseBurst(2.4, 0.3, 900, 40);
    [0.4, 0.8, 1.2].forEach((d) => this.tone(70, 0.8, 'sine', 0.12, 40, d));
  }
  whoosh() { this.noiseBurst(1.2, 0.35, 300, 4000, 'bandpass'); }
  thud() { this.tone(70, 0.4, 'sine', 0.4, 35); this.noiseBurst(0.3, 0.25, 600, 80); }

  speak(text) {
    if (!this.voiceOn || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (now - this.lastSpeak < 1200) return;
    this.lastSpeak = now;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 0.9;
      u.volume = Math.min(1, this.sfxVol + 0.2);
      const voices = speechSynthesis.getVoices();
      const v = voices.find((v) => /en-GB/i.test(v.lang) && /female|Serena|Kate|Libby|Sonia|Google UK English Female/i.test(v.name)) || voices.find((v) => /en-GB/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang));
      if (v) u.voice = v;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }
}
