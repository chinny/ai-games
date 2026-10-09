// Mud & Iron — synthesized sound: gunfire, shellfire, engines, aircraft, whistles, rain and distant guns

let AC = null, MASTER = null, NOISE = null, SFXBUS = null;
const AUD = { voices: 0, last: {}, engine: null, rain: null, rumbleT: 3, muted: false };

function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  MASTER = AC.createGain(); MASTER.gain.value = 0.55;
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
  MASTER.connect(comp); comp.connect(AC.destination);
  SFXBUS = AC.createGain(); SFXBUS.connect(MASTER);
  const len = AC.sampleRate * 2;
  NOISE = AC.createBuffer(1, len, AC.sampleRate);
  const d = NOISE.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  // engine drone shared by all vehicles in earshot
  {
    const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38;
    const o2 = AC.createOscillator(); o2.type = 'square'; o2.frequency.value = 19.5;
    const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
    const g = AC.createGain(); g.gain.value = 0;
    const g2 = AC.createGain(); g2.gain.value = 0.5;
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(MASTER);
    o.start(); o2.start();
    AUD.engine = { o, g, f };
  }
  {
    const s = AC.createBufferSource(); s.buffer = NOISE; s.loop = true;
    const f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    const f2 = AC.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 7000;
    const g = AC.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(f2); f2.connect(g); g.connect(MASTER); s.start();
    AUD.rain = g;
  }
}

// Distance and stereo position relative to the camera's view.
function spatial(x, z, maxD) {
  if (x === undefined) return { g: 1, p: 0 };
  const dx = x - CAM.x, dz = z - CAM.z;
  const d = Math.hypot(dx, dz, CAM.dist * 0.6);
  const g = clamp(1 - d / maxD, 0, 1);
  const rx = Math.cos(CAM.yaw), rz = -Math.sin(CAM.yaw);
  const p = clamp((dx * rx + dz * rz) / 60, -0.9, 0.9);
  return { g: g * g, p };
}
function outNode(gain, pan) {
  const g = AC.createGain(); g.gain.value = gain;
  if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(SFXBUS); }
  else g.connect(SFXBUS);
  return g;
}
function noiseBurst(dest, t0, dur, type, f0, f1, q, a0, attack = 0.002) {
  const s = AC.createBufferSource(); s.buffer = NOISE;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = AC.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(a0, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
}
function toneAt(dest, t0, dur, type, f0, f1, a0, attack = 0.005) {
  const o = AC.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t0 + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(a0, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
}

const SFX_RANGE = { rifle: 150, lmg: 170, mg: 190, pistol: 120, mortar: 220, gun: 320, tgun: 260, big: 420, explode: 340, bigexplode: 480, flame: 120, whistle: 160, officer: 160, grenade: 220, crunch: 120, plane: 300, wirecut: 60, dig: 60, build: 80 };
const SFX_GAP = { rifle: 0.025, lmg: 0.05, mg: 0.06, pistol: 0.03, flame: 0.12, explode: 0.03, dig: 0.4, build: 0.35 };

function sfx(name, x, z, vol = 1) {
  if (!AC || AUD.muted || AC.state !== 'running') return;
  const now = AC.currentTime;
  const gap = SFX_GAP[name] || 0;
  if (gap && AUD.last[name] && now - AUD.last[name] < gap) return;
  const sp = spatial(x, z, SFX_RANGE[name] || 200);
  const v = sp.g * vol;
  if (v < 0.02) return;
  if (AUD.voices > 40) return;
  AUD.last[name] = now;
  AUD.voices++; setTimeout(() => AUD.voices--, 900);
  const out = outNode(v, sp.p), t = now + 0.005;
  switch (name) {
    case 'rifle':
      noiseBurst(out, t, 0.16, 'bandpass', 2400, 700, 0.8, 0.5);
      noiseBurst(out, t, 0.32, 'lowpass', 900, 120, 0.5, 0.25);
      break;
    case 'pistol':
      noiseBurst(out, t, 0.1, 'bandpass', 3000, 1200, 1, 0.35);
      break;
    case 'lmg':
      for (let i = 0; i < 3; i++) noiseBurst(out, t + i * 0.085, 0.09, 'bandpass', 2200, 800, 0.9, 0.32);
      break;
    case 'mg':
      for (let i = 0; i < 3; i++) { noiseBurst(out, t + i * 0.1, 0.1, 'bandpass', 1700, 600, 0.8, 0.36); noiseBurst(out, t + i * 0.1, 0.12, 'lowpass', 500, 90, 0.5, 0.2); }
      break;
    case 'mortar':
      toneAt(out, t, 0.25, 'sine', 160, 55, 0.6); noiseBurst(out, t, 0.25, 'lowpass', 1200, 200, 0.7, 0.35);
      break;
    case 'gun': case 'tgun':
      noiseBurst(out, t, name === 'gun' ? 1.2 : 0.7, 'lowpass', 1400, 60, 0.6, 0.9);
      toneAt(out, t, 0.6, 'sine', 90, 30, 0.8);
      break;
    case 'big':
      noiseBurst(out, t, 2.4, 'lowpass', 600, 30, 0.6, 1);
      toneAt(out, t, 1.4, 'sine', 55, 20, 1);
      break;
    case 'explode': case 'grenade':
      noiseBurst(out, t, name === 'grenade' ? 0.8 : 1.6, 'lowpass', 1600, 70, 0.7, 0.95);
      toneAt(out, t, 0.9, 'sine', 75, 24, 0.9);
      break;
    case 'bigexplode':
      noiseBurst(out, t, 3, 'lowpass', 900, 40, 0.6, 1);
      toneAt(out, t, 1.8, 'sine', 48, 18, 1);
      noiseBurst(out, t + 0.05, 1.2, 'bandpass', 2400, 400, 0.6, 0.3);
      break;
    case 'whistle':
      toneAt(out, t, 1.1, 'sine', 1500 + Math.random() * 300, 520, 0.22, 0.25);
      break;
    case 'flame':
      noiseBurst(out, t, 0.5, 'bandpass', 500, 300, 0.5, 0.6, 0.05);
      break;
    case 'officer': // trench whistle trill
      for (let i = 0; i < 6; i++) toneAt(out, t + i * 0.07, 0.08, 'sine', 2900, 2700, 0.25, 0.01);
      toneAt(out, t + 0.45, 0.5, 'sine', 2950, 2800, 0.3, 0.01);
      break;
    case 'crunch':
      noiseBurst(out, t, 0.35, 'lowpass', 2500, 300, 0.6, 0.6);
      break;
    case 'wirecut':
      noiseBurst(out, t, 0.06, 'highpass', 5000, 4000, 1, 0.5);
      noiseBurst(out, t + 0.12, 0.06, 'highpass', 5000, 4000, 1, 0.5);
      break;
    case 'dig':
      noiseBurst(out, t, 0.18, 'bandpass', 900, 400, 1.2, 0.35, 0.02);
      break;
    case 'build':
      toneAt(out, t, 0.08, 'square', 420, 380, 0.15); noiseBurst(out, t, 0.06, 'bandpass', 2000, 1500, 2, 0.25);
      break;
    case 'click':
      toneAt(out, t, 0.04, 'square', 900, 700, 0.06);
      break;
    case 'bugle': { // three notes: capture / ready
      const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; f.connect(out);
      [392, 523, 659].forEach((hz, i) => toneAt(f, t + i * 0.16, i === 2 ? 0.5 : 0.15, 'sawtooth', hz, hz * 0.99, 0.18, 0.02));
      break;
    }
    case 'lost': {
      const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200; f.connect(out);
      [523, 392, 330].forEach((hz, i) => toneAt(f, t + i * 0.2, i === 2 ? 0.6 : 0.18, 'sawtooth', hz, hz * 0.98, 0.15, 0.02));
      break;
    }
    case 'alarm':
      toneAt(out, t, 0.25, 'triangle', 220, 200, 0.22); toneAt(out, t + 0.3, 0.25, 'triangle', 220, 200, 0.22);
      break;
  }
}

// Planes get their own drone voices that follow them.
function planeVoice() {
  if (!AC) return null;
  const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 85;
  const lfo = AC.createOscillator(); lfo.frequency.value = 23; const lg = AC.createGain(); lg.gain.value = 9;
  lfo.connect(lg); lg.connect(o.frequency);
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
  const g = AC.createGain(); g.gain.value = 0;
  const p = AC.createStereoPanner ? AC.createStereoPanner() : null;
  o.connect(f); f.connect(g);
  if (p) { g.connect(p); p.connect(SFXBUS); } else g.connect(SFXBUS);
  o.start(); lfo.start();
  return { o, lfo, g, p };
}
function updatePlaneVoice(v, x, z) {
  if (!v) return;
  const sp = spatial(x, z, SFX_RANGE.plane);
  v.g.gain.setTargetAtTime(sp.g * 0.16, AC.currentTime, 0.1);
  if (v.p) v.p.pan.setTargetAtTime(sp.p, AC.currentTime, 0.1);
}
function stopPlaneVoice(v) {
  if (!v) return;
  v.g.gain.setTargetAtTime(0, AC.currentTime, 0.2);
  setTimeout(() => { try { v.o.stop(); v.lfo.stop(); } catch (e) { /* already stopped */ } }, 900);
}

// Per-frame ambience: engines near the camera, rain, and the endless distant guns.
function updateAudio(dt, engineLoad, rainK, inPlay) {
  if (!AC || AC.state !== 'running') return;
  const t = AC.currentTime;
  AUD.engine.g.gain.setTargetAtTime(Math.min(0.32, engineLoad * 0.12), t, 0.3);
  AUD.engine.o.frequency.setTargetAtTime(36 + Math.min(10, engineLoad * 3), t, 0.5);
  AUD.rain.gain.setTargetAtTime(rainK * 0.07, t, 0.5);
  if (!inPlay) return;
  AUD.rumbleT -= dt;
  if (AUD.rumbleT <= 0) {
    AUD.rumbleT = frand(2.5, 9);
    const out = outNode(frand(0.08, 0.2), frand(-0.8, 0.8));
    noiseBurst(out, t, frand(1.5, 3), 'lowpass', 260, 30, 0.5, 1, 0.05);
    if (Math.random() < 0.4) noiseBurst(out, t + frand(0.3, 0.8), frand(1.2, 2), 'lowpass', 200, 30, 0.5, 0.7, 0.05);
  }
}
