// Studworks — synthesized plastic clicks and clacks (no audio files)

const sfx = {
  ctx: null,
  out: null,
  muted: store('studworks.muted') === '1',
  noise: null,
};

function ensureAudio() {
  if (sfx.ctx) { if (sfx.ctx.state === 'suspended') sfx.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  sfx.ctx = new AC();
  sfx.out = sfx.ctx.createGain();
  sfx.out.gain.value = 0.55;
  sfx.out.connect(sfx.ctx.destination);
  const len = sfx.ctx.sampleRate * 0.25;
  sfx.noise = sfx.ctx.createBuffer(1, len, sfx.ctx.sampleRate);
  const d = sfx.noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

function setMuted(m) {
  sfx.muted = m;
  store('studworks.muted', m ? '1' : '0');
}

// A short filtered noise burst: the "tick" of plastic on plastic.
function burst(t, freq, q, dur, gain) {
  const c = sfx.ctx;
  const src = c.createBufferSource();
  src.buffer = sfx.noise;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f).connect(g).connect(sfx.out);
  src.start(t, Math.random() * 0.1, dur + 0.02);
}
// A decaying sine: the body of the brick resonating.
function knock(t, f0, f1, dur, gain, type = 'sine') {
  const c = sfx.ctx;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(sfx.out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SOUNDS = {
  // Two quick clicks as the studs seat, then a low knock.
  place(t, k) {
    const p = 1 + (Math.random() - 0.5) * 0.12;
    burst(t, 3200 * p, 2.2, 0.03, 0.9 * k);
    burst(t + 0.018, 2300 * p, 2.5, 0.045, 0.7 * k);
    knock(t + 0.012, 420 * p, 260 * p, 0.07, 0.35 * k);
  },
  remove(t, k) {
    const p = 1 + (Math.random() - 0.5) * 0.12;
    burst(t, 1500 * p, 1.6, 0.05, 0.7 * k);
    knock(t, 300 * p, 620 * p, 0.06, 0.25 * k);
  },
  rotate(t) { burst(t, 4200, 4, 0.02, 0.35); },
  paint(t) { knock(t, 880, 1320, 0.08, 0.12, 'triangle'); burst(t, 5200, 3, 0.03, 0.2); },
  pick(t) { knock(t, 1320, 990, 0.07, 0.12, 'triangle'); },
  select(t) { burst(t, 5000, 5, 0.018, 0.25); },
  error(t) { knock(t, 150, 110, 0.12, 0.22, 'square'); },
  ui(t) { burst(t, 3800, 4, 0.015, 0.22); },
};

// count > 1 plays a quick cascade, e.g. for dropping a group of bricks.
function play(name, count = 1) {
  if (sfx.muted || !sfx.ctx || sfx.ctx.state !== 'running') return;
  const t = sfx.ctx.currentTime + 0.005;
  const n = Math.min(count, 6);
  for (let i = 0; i < n; i++) SOUNDS[name](t + i * 0.035, i ? 0.6 : 1);
}
