// Calamity Bay — procedural Web Audio: roars, stomps, collapses, gunfire, rotors, sirens, war drums

let AC = null, master, sfx, musicG, noiseBuf, muted = false;
const loops = {};
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  AC = new Ctx();
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 5;
  master = AC.createGain(); master.gain.value = muted ? 0 : 0.85;
  master.connect(comp); comp.connect(AC.destination);
  sfx = AC.createGain(); sfx.gain.value = 1; sfx.connect(master);
  musicG = AC.createGain(); musicG.gain.value = 0.32; musicG.connect(master);
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // continuous beds whose levels follow the game
  loops.city = noiseLoop('lowpass', 380, 0.7, 0.05);
  loops.heli = noiseLoop('bandpass', 260, 1.4, 0, 13);
  loops.crowd = noiseLoop('bandpass', 1500, 2.5, 0, 5.5);
  loops.beam = noiseLoop('bandpass', 900, 1.2, 0, 31);
  loops.wake = noiseLoop('lowpass', 700, 0.5, 0);
  const so = AC.createOscillator(), sg = AC.createGain(), lfo = AC.createOscillator(), lg = AC.createGain();
  so.type = 'triangle'; so.frequency.value = 900; lfo.frequency.value = 0.22; lg.gain.value = 320;
  lfo.connect(lg); lg.connect(so.frequency); so.connect(sg); sg.gain.value = 0; sg.connect(sfx); so.start(); lfo.start();
  loops.siren = { g: sg };
  const bo = AC.createOscillator(), bg = AC.createGain();
  bo.type = 'sawtooth'; bo.frequency.value = 55; bo.connect(bg); bg.gain.value = 0; bg.connect(sfx); bo.start();
  loops.beamTone = { g: bg, o: bo };
  musicNext = AC.currentTime + 0.5;
}
function noiseLoop(type, f, q, gain, tremolo) {
  const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const flt = AC.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
  const g = AC.createGain(); g.gain.value = gain;
  src.connect(flt);
  if (tremolo) {
    const t = AC.createGain(), lfo = AC.createOscillator(), lg = AC.createGain();
    lfo.frequency.value = tremolo; lg.gain.value = 0.5; t.gain.value = 0.5;
    lfo.connect(lg); lg.connect(t.gain); lfo.start();
    flt.connect(t); t.connect(g);
  } else flt.connect(g);
  g.connect(sfx); src.start();
  return { g, flt };
}
function aSet(param, v, tc = 0.15) { if (AC) param.setTargetAtTime(v, AC.currentTime, tc); }
function setMuted(m) { muted = m; if (AC) aSet(master.gain, m ? 0 : 0.85, 0.05); }

// distance attenuation and stereo pan relative to the camera
function spatial(pos, range = 1400) {
  if (!pos) return [1, 0];
  _v5.copy(pos).sub(camera.position);
  const d = _v5.length();
  const g = Math.pow(clamp(1 - d / range, 0, 1), 1.6);
  _v4.set(1, 0, 0).applyQuaternion(camera.quaternion);
  const pan = d > 1 ? clamp(_v5.dot(_v4) / d, -1, 1) * 0.7 : 0;
  return [g, pan];
}
function out(gain, pan) {
  const g = AC.createGain(); g.gain.value = gain;
  if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(sfx); }
  else g.connect(sfx);
  return g;
}
function nz({ dur = 0.5, type = 'lowpass', f0 = 800, f1, q = 0.8, gain = 0.5, attack = 0.005, pos, range, delay = 0 }) {
  if (!AC) return;
  const [sg, pan] = spatial(pos, range);
  if (sg * gain < 0.005) return;
  const t = AC.currentTime + delay;
  const src = AC.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const flt = AC.createBiquadFilter(); flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t);
  if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = out(0, pan);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain * sg, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt); flt.connect(g);
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}
function tone({ type = 'sine', f0 = 100, f1, dur = 0.4, gain = 0.5, attack = 0.005, pos, range, delay = 0 }) {
  if (!AC) return;
  const [sg, pan] = spatial(pos, range);
  if (sg * gain < 0.005) return;
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = out(0, pan);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain * sg, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); o.start(t); o.stop(t + dur + 0.05);
}

// ---------- effects ----------
function stompSound(pos, big = 1) {
  tone({ f0: 62, f1: 26, dur: 0.6 * big, gain: 0.9 * big, pos, range: 2200 });
  nz({ f0: 420, f1: 90, dur: 0.45, gain: 0.45 * big, pos, range: 2000 });
}
let impactBudget = 0;
function impactSound(m, v, pos) {
  if (impactBudget <= 0) return;
  impactBudget--;
  const s = clamp(Math.log10(m * v) / 5, 0.1, 1);
  nz({ f0: 1400 - s * 1000, f1: 120, dur: 0.25 + s * 0.6, gain: 0.25 + s * 0.4, pos });
  if (s > 0.6) tone({ f0: 80, f1: 35, dur: 0.4, gain: s * 0.4, pos });
}
function crumbleSound(vol, pos) {
  const s = clamp(Math.log10(1 + vol) / 4, 0.1, 1);
  nz({ f0: 1600, f1: 160, dur: 0.6 + s, gain: 0.35 + s * 0.35, q: 0.6, pos });
  for (let i = 0; i < 3 + s * 6; i++) nz({ type: 'bandpass', f0: 1800 + Math.random() * 2500, dur: 0.06, gain: 0.18, q: 3, pos, delay: Math.random() * (0.4 + s) });
}
function collapseRumble(b, n) {
  const pos = new V3((b.x0 + b.x1) / 2, b.y1 / 2, (b.z0 + b.z1) / 2);
  nz({ f0: 260, f1: 50, dur: 4, gain: 0.9, attack: 0.3, pos, range: 2600 });
  tone({ f0: 45, f1: 25, dur: 3.5, gain: 0.6, attack: 0.4, pos, range: 2600 });
  for (let i = 0; i < 14; i++) nz({ type: 'bandpass', f0: 600 + Math.random() * 2400, dur: 0.12, gain: 0.25, q: 2, pos, delay: Math.random() * 3 });
  addShake(0.6, pos);
}
function boom(pos, size = 1, kind) {
  nz({ f0: 2200, f1: 90, dur: 0.6 + size * 0.6, gain: 0.4 + size * 0.35, pos, range: 2400 });
  tone({ f0: 90, f1: 30, dur: 0.5 + size * 0.5, gain: 0.35 + size * 0.3, pos, range: 2400 });
  if (kind === 'crash') nz({ type: 'bandpass', f0: 900, f1: 300, dur: 1.2, gain: 0.4, q: 1.5, pos });
}
function whoosh(big = 1) {
  nz({ type: 'bandpass', f0: 250, f1: 1300, dur: 0.35 * big, gain: 0.32 * big, q: 1.2, attack: 0.1 });
}
let gunT = 0;
function gunshot(pos) { if (gunT > 0) return; gunT = 0.05; nz({ type: 'highpass', f0: 1800, dur: 0.06, gain: 0.25, pos, range: 900 }); }
function cannon(pos) { nz({ f0: 3000, f1: 200, dur: 0.5, gain: 0.5, pos, range: 2000 }); tone({ f0: 110, f1: 40, dur: 0.35, gain: 0.35, pos }); }
function rocketSound(pos) { nz({ type: 'bandpass', f0: 2600, f1: 600, dur: 0.9, gain: 0.3, q: 1.5, pos, range: 1500 }); }
function jetSound(pos) { nz({ type: 'bandpass', f0: 500, f1: 2600, dur: 2.6, gain: 0.7, q: 0.7, attack: 1.2, pos, range: 3000 }); }
function hornSound(pos) { tone({ type: 'square', f0: 410, dur: 0.35, gain: 0.06, pos, range: 600 }); tone({ type: 'square', f0: 520, dur: 0.35, gain: 0.05, pos, range: 600 }); }
function roarSound(kind, pos) {
  if (!AC) return;
  const t = AC.currentTime, dur = kind === 'sea' ? 2.6 : 2.4;
  const [sg, pan] = spatial(pos, 4000);
  const g = out(0, pan);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.75 * sg, t + 0.25);
  g.gain.setValueAtTime(0.75 * sg, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const shaper = AC.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); }
  shaper.curve = curve;
  const flt = AC.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 4;
  shaper.connect(flt); flt.connect(g);
  const freqs = kind === 'sea' ? [[330, 520, 260], [334, 527, 262], [166, 262, 130]] : [[72, 118, 58], [74, 121, 60], [36, 59, 29]];
  for (const [a, b, c] of freqs) {
    const o = AC.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(a, t);
    o.frequency.linearRampToValueAtTime(b, t + dur * 0.35);
    o.frequency.exponentialRampToValueAtTime(c, t + dur);
    if (kind !== 'sea') {
      const lfo = AC.createOscillator(), lg = AC.createGain();
      lfo.frequency.value = 17; lg.gain.value = 9; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur);
    }
    o.connect(shaper); o.start(t); o.stop(t + dur + 0.1);
  }
  flt.frequency.setValueAtTime(kind === 'sea' ? 900 : 500, t);
  flt.frequency.linearRampToValueAtTime(kind === 'sea' ? 2600 : 1400, t + dur * 0.35);
  flt.frequency.exponentialRampToValueAtTime(400, t + dur);
  nz({ type: 'bandpass', f0: kind === 'sea' ? 1800 : 700, f1: 500, dur, gain: 0.35, q: 1.2, attack: 0.2, pos, range: 4000 });
}
function chargeSound() { tone({ type: 'sawtooth', f0: 80, f1: 900, dur: 0.9, gain: 0.25, attack: 0.6 }); nz({ type: 'bandpass', f0: 300, f1: 3000, dur: 0.9, gain: 0.25, q: 2, attack: 0.7 }); }
function hurtSound() { nz({ f0: 2400, f1: 400, dur: 0.25, gain: 0.25 }); }

// ---------- war drums ----------
let musicNext = 0, musicBeat = 0, musicLevel = 0;
const BASS = [38, 38, 41, 40, 38, 38, 43, 41];
function drum(t, f, gain, dur) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.45, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(musicG); o.start(t); o.stop(t + dur + 0.02);
  const s = AC.createBufferSource(), sf = AC.createBiquadFilter(), sg = AC.createGain();
  s.buffer = noiseBuf; sf.type = 'lowpass'; sf.frequency.value = f * 9;
  sg.gain.setValueAtTime(gain * 0.5, t); sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  s.connect(sf); sf.connect(sg); sg.connect(musicG); s.start(t, Math.random()); s.stop(t + 0.15);
}
function bassNote(t, midi, dur) {
  const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain();
  o.type = 'sawtooth'; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(160, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(musicG); o.start(t); o.stop(t + dur + 0.05);
}
function updateMusic(level) {
  if (!AC) return;
  musicLevel = level;
  const spb = 60 / (78 + level * 6) / 2; // eighth notes
  while (musicNext < AC.currentTime + 0.25) {
    const t = musicNext, b = musicBeat % 16;
    if (level >= 0) {
      if (b === 0 || b === 6 || b === 10) drum(t, 64, 0.9, 0.7);
      if (level >= 1 && (b === 4 || b === 12)) drum(t, 120, 0.5, 0.25);
      if (level >= 2 && b % 2 === 1 && Math.random() < 0.6) drum(t, 190, 0.18 + Math.random() * 0.12, 0.1);
      if (level >= 3 && (b === 14 || b === 15)) drum(t, 90, 0.6, 0.3);
      if (level >= 1 && b % 4 === 0) bassNote(t, BASS[(musicBeat >> 2) % 8], spb * 3.6);
    }
    musicNext += spb; musicBeat++;
  }
}
