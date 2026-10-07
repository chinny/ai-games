// Hollowmere — synthesized sound (Web Audio, no samples)

let AC = null, master, NB, rainLP, rainG, staticG, droneG, bedG;

function audioInit() {
  if (AC) { AC.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  AC = new Ctx();
  const comp = AC.createDynamicsCompressor();
  comp.connect(AC.destination);
  master = gainNode(0.9); master.connect(comp);
  NB = AC.createBuffer(1, AC.sampleRate * 3, AC.sampleRate);
  const d = NB.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const loop = (rate) => { const s = AC.createBufferSource(); s.buffer = NB; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * 2); return s; };
  // rain
  rainLP = biquad('lowpass', 5200); rainG = gainNode(0.16);
  loop(1).connect(biquad('highpass', 450)).connect(rainLP).connect(rainG).connect(master);
  // wind, slowly swelling
  const bp = biquad('bandpass', 350, 0.9), windG = gainNode(0.11), lfo = AC.createOscillator(), lg = gainNode(170);
  lfo.frequency.value = 0.07; lfo.connect(lg).connect(bp.frequency); lfo.start();
  loop(0.5).connect(bp).connect(windG).connect(master);
  // static (fear)
  staticG = gainNode(0);
  loop(1.3).connect(biquad('highpass', 2600)).connect(staticG).connect(master);
  // low drone (proximity)
  droneG = gainNode(0);
  const dl = biquad('lowpass', 260); dl.connect(droneG).connect(master);
  for (const f of [43.65, 44.1, 65.4]) { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(dl); o.start(); }
  // a quiet bed of unease
  bedG = gainNode(0.03); bedG.connect(master);
  for (const f of [55, 58.27]) { const o = AC.createOscillator(); o.frequency.value = f; o.connect(bedG); o.start(); }
}
function biquad(type, f, Q) { const b = AC.createBiquadFilter(); b.type = type; b.frequency.value = f; if (Q !== undefined) b.Q.value = Q; return b; }
function gainNode(v) { const g = AC.createGain(); g.gain.value = v; return g; }
function aSet(param, v, k = 0.1) { if (AC) param.setTargetAtTime(v, AC.currentTime, k); }

function burst(t, dur, type, f0, f1, peak, rate = 1, attack = 0.005) {
  const s = AC.createBufferSource(); s.buffer = NB; s.playbackRate.value = rate;
  const f = biquad(type, f0);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = gainNode(0);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
}
function tone(t, f, dur, peak, type = 'sine', f1) {
  const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = gainNode(0);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}

function thunder(delay, near) {
  if (!AC) return;
  const t = AC.currentTime + delay;
  if (near) burst(t, 0.5, 'highpass', 1400, 300, 0.55);
  burst(t, 4.8, 'lowpass', near ? 900 : 380, 45, near ? 0.95 : 0.6, 0.6, 0.06);
  burst(t + 0.5 + Math.random(), 3.5, 'lowpass', 280, 40, 0.45, 0.45, 0.4);
}
function footstep(wood) {
  if (!AC) return;
  const t = AC.currentTime;
  if (wood) { burst(t, 0.08, 'bandpass', 950, 450, 0.2); tone(t, 95 + Math.random() * 20, 0.09, 0.07, 'triangle'); }
  else burst(t, 0.16, 'lowpass', 650 + Math.random() * 200, 180, 0.24);
}
function sting(k) {
  if (!AC) return;
  const t = AC.currentTime;
  for (const f of [98, 103.8, 146.8, 207.7, 311.1]) tone(t, f, 3.2, 0.07 * k, 'sawtooth');
  burst(t, 1.3, 'highpass', 3000, 3000, 0.3 * k);
  tone(t, 42, 2.6, 0.45 * k, 'sine', 30);
}
function pageSound() {
  if (!AC) return;
  const t = AC.currentTime;
  burst(t, 0.3, 'highpass', 2500, 4500, 0.22);
  tone(t + 0.05, 196, 2.6, 0.1, 'triangle'); tone(t + 0.05, 233.1, 2.6, 0.07, 'triangle'); tone(t + 0.05, 277.2, 2.6, 0.05, 'triangle');
}
function heartbeat(k) {
  if (!AC) return;
  const t = AC.currentTime;
  tone(t, 58, 0.18, 0.5 * k, 'sine', 36); tone(t + 0.22, 55, 0.2, 0.4 * k, 'sine', 34);
}
function bellToll(delay) {
  if (!AC) return;
  const t = AC.currentTime + delay, f = 146.8;
  for (const [m, a, dcy] of [[0.5, 0.3, 7], [1, 0.35, 6], [1.19, 0.2, 3.5], [1.5, 0.15, 3], [2, 0.18, 2.6], [2.74, 0.1, 1.6], [3.0, 0.08, 1.2], [4.1, 0.05, 0.8]]) tone(t, f * m, dcy, a);
  burst(t, 0.08, 'bandpass', 2400, 2400, 0.25);
}
function scream() {
  if (!AC) return;
  const t = AC.currentTime;
  burst(t, 1.7, 'bandpass', 2200, 500, 0.95, 1, 0.002);
  for (const f of [440, 466.2, 622.3]) tone(t, f, 1.5, 0.22, 'sawtooth', f * 0.4);
  tone(t, 62, 1.6, 0.7, 'square', 24);
}
function blip(v = 0.18) { if (AC) burst(AC.currentTime, 0.35, 'highpass', 3000, 3000, v); }
