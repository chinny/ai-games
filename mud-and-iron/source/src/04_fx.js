// Mud & Iron — particles (smoke, dirt, fire, gas), tracers, rain, effect recipes and camera shake

function puffTexture(soft) {
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  if (soft) {
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  } else {
    for (let i = 0; i < 9; i++) {
      const x = S / 2 + (Math.random() - 0.5) * S * 0.36, y = S / 2 + (Math.random() - 0.5) * S * 0.36, r = S * (0.18 + Math.random() * 0.16);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const sh = 215 + Math.floor(Math.random() * 40);
      gr.addColorStop(0, `rgba(${sh},${sh},${sh},0.85)`); gr.addColorStop(1, `rgba(${sh},${sh},${sh},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }
  }
  return new THREE.CanvasTexture(cv);
}

const PS = [];
function makePS(cap, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 4), size = new Float32Array(cap);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uScale: { value: 800 }, uTex: { value: puffTexture(additive) }, uFogColor: { value: scene.fog.color }, uFogNear: { value: 200 }, uFogFar: { value: 900 } },
    vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; uniform float uFogNear; uniform float uFogFar;
      varying vec4 vCol; varying float vFog;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uScale / max(-mv.z, 1.0), 0.0, 500.0); vCol = aCol; vFog = smoothstep(uFogNear, uFogFar, -mv.z); }`,
    fragmentShader: additive
      ? `uniform sampler2D uTex; varying vec4 vCol; varying float vFog;
         void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vCol.rgb, t.a * vCol.a * (1.0 - vFog)); }`
      : `uniform sampler2D uTex; uniform vec3 uFogColor; varying vec4 vCol; varying float vFog;
         void main(){ vec4 t = texture2D(uTex, gl_PointCoord); float a = t.a * vCol.a; if (a < 0.01) discard;
           gl_FragColor = vec4(mix(vCol.rgb * t.rgb, uFogColor, vFog), a); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = additive ? 4 : 3;
  scene.add(pts);
  const s = {
    cap, n: 0, pos, col, size, geo, mat,
    vel: new Float32Array(cap * 3), life: new Float32Array(cap), max: new Float32Array(cap), grow: new Float32Array(cap),
    drag: new Float32Array(cap), g: new Float32Array(cap), c0: new Float32Array(cap * 4), c1: new Float32Array(cap * 3),
  };
  PS.push(s);
  return s;
}
const smokePS = makePS(isTouch ? 2500 : 5000, false);
const glowPS = makePS(isTouch ? 1500 : 3000, true);

// Spawn one particle; c1 is the colour it drifts toward over its life.
function emit(s, x, y, z, vx, vy, vz, size, grow, life, r, g, b, a, drag = 0.5, grav = 0, r1 = r, g1 = g, b1 = b) {
  let i = s.n;
  if (i >= s.cap) i = Math.floor(Math.random() * s.cap); else s.n++;
  s.pos[i * 3] = x; s.pos[i * 3 + 1] = y; s.pos[i * 3 + 2] = z;
  s.vel[i * 3] = vx; s.vel[i * 3 + 1] = vy; s.vel[i * 3 + 2] = vz;
  s.size[i] = size; s.grow[i] = grow; s.life[i] = 0; s.max[i] = life; s.drag[i] = drag; s.g[i] = grav;
  s.c0[i * 4] = r; s.c0[i * 4 + 1] = g; s.c0[i * 4 + 2] = b; s.c0[i * 4 + 3] = a;
  s.c1[i * 3] = r1; s.c1[i * 3 + 1] = g1; s.c1[i * 3 + 2] = b1;
}
function updatePS(s, dt) {
  const { pos, vel, col, size, life, max, grow, drag, g, c0, c1 } = s;
  for (let i = 0; i < s.n; i++) {
    life[i] += dt;
    if (life[i] >= max[i]) {
      const l = --s.n;
      if (i !== l) {
        pos[i * 3] = pos[l * 3]; pos[i * 3 + 1] = pos[l * 3 + 1]; pos[i * 3 + 2] = pos[l * 3 + 2];
        vel[i * 3] = vel[l * 3]; vel[i * 3 + 1] = vel[l * 3 + 1]; vel[i * 3 + 2] = vel[l * 3 + 2];
        size[i] = size[l]; grow[i] = grow[l]; life[i] = life[l]; max[i] = max[l]; drag[i] = drag[l]; g[i] = g[l];
        for (let k = 0; k < 4; k++) c0[i * 4 + k] = c0[l * 4 + k];
        for (let k = 0; k < 3; k++) c1[i * 3 + k] = c1[l * 3 + k];
        i--;
      }
      continue;
    }
    const k = Math.exp(-drag[i] * dt);
    vel[i * 3] = vel[i * 3] * k + WIND.x * (1 - k) * 0.6; vel[i * 3 + 1] = vel[i * 3 + 1] * k - g[i] * dt; vel[i * 3 + 2] = vel[i * 3 + 2] * k + WIND.z * (1 - k) * 0.6;
    pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    if (g[i] > 0 && pos[i * 3 + 1] < -2) life[i] = max[i];
    size[i] = Math.max(0, size[i] + grow[i] * dt);
    const t = life[i] / max[i];
    const fade = Math.min(1, t * 8) * (1 - smooth(0.45, 1, t));
    col[i * 4] = lerp(c0[i * 4], c1[i * 3], t); col[i * 4 + 1] = lerp(c0[i * 4 + 1], c1[i * 3 + 1], t); col[i * 4 + 2] = lerp(c0[i * 4 + 2], c1[i * 3 + 2], t);
    col[i * 4 + 3] = c0[i * 4 + 3] * fade;
  }
  s.geo.setDrawRange(0, s.n);
  s.geo.attributes.position.needsUpdate = true;
  s.geo.attributes.aCol.needsUpdate = true;
  s.geo.attributes.aSize.needsUpdate = true;
  s.mat.uniforms.uFogNear.value = scene.fog.near; s.mat.uniforms.uFogFar.value = scene.fog.far;
}
function clearFX() { for (const s of PS) { s.n = 0; s.geo.setDrawRange(0, 0); } TRC.n = 0; EMITTERS.length = 0; shake = 0; }

// Wind pushes smoke and gas; set per match.
const WIND = { x: 0.8, z: 0.3 };

// ---------- tracers ----------
const TRC = (() => {
  const cap = 600;
  const pos = new Float32Array(cap * 6), col = new Float32Array(cap * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false; lines.renderOrder = 5;
  scene.add(lines);
  return { cap, n: 0, pos, col, geo, a: new Float32Array(cap * 6), t: new Float32Array(cap), T: new Float32Array(cap), k: new Float32Array(cap) };
})();
function tracer(x1, y1, z1, x2, y2, z2, bright = 1) {
  let i = TRC.n;
  if (i >= TRC.cap) i = Math.floor(Math.random() * TRC.cap); else TRC.n++;
  const a = TRC.a;
  a[i * 6] = x1; a[i * 6 + 1] = y1; a[i * 6 + 2] = z1; a[i * 6 + 3] = x2; a[i * 6 + 4] = y2; a[i * 6 + 5] = z2;
  const d = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  TRC.t[i] = 0; TRC.T[i] = Math.max(0.05, d / 320); TRC.k[i] = bright;
}
function updateTracers(dt) {
  const { a, t, T, k, pos, col } = TRC;
  for (let i = 0; i < TRC.n; i++) {
    t[i] += dt;
    if (t[i] >= T[i]) {
      const l = --TRC.n;
      if (i !== l) { for (let j = 0; j < 6; j++) a[i * 6 + j] = a[l * 6 + j]; t[i] = t[l]; T[i] = T[l]; k[i] = k[l]; i--; }
      continue;
    }
    const u = t[i] / T[i], dx = a[i * 6 + 3] - a[i * 6], dy = a[i * 6 + 4] - a[i * 6 + 1], dz = a[i * 6 + 5] - a[i * 6 + 2];
    const d = Math.hypot(dx, dy, dz) || 1, L = Math.min(1, 4 / d);
    const u0 = Math.max(0, u - L);
    pos[i * 6] = a[i * 6] + dx * u0; pos[i * 6 + 1] = a[i * 6 + 1] + dy * u0; pos[i * 6 + 2] = a[i * 6 + 2] + dz * u0;
    pos[i * 6 + 3] = a[i * 6] + dx * u; pos[i * 6 + 4] = a[i * 6 + 1] + dy * u; pos[i * 6 + 5] = a[i * 6 + 2] + dz * u;
    const b = k[i];
    col[i * 6] = 0.5 * b; col[i * 6 + 1] = 0.35 * b; col[i * 6 + 2] = 0.12 * b;
    col[i * 6 + 3] = 1.0 * b; col[i * 6 + 4] = 0.85 * b; col[i * 6 + 5] = 0.45 * b;
  }
  TRC.geo.setDrawRange(0, TRC.n * 2);
  TRC.geo.attributes.position.needsUpdate = true;
  TRC.geo.attributes.color.needsUpdate = true;
}

// ---------- rain ----------
const RAIN = (() => {
  const n = isTouch ? 900 : 2200;
  const pos = new Float32Array(n * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.LineBasicMaterial({ color: 0xb8c4cc, transparent: true, opacity: 0, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false; lines.renderOrder = 6;
  scene.add(lines);
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { p[i * 3] = frand(-70, 70); p[i * 3 + 1] = frand(0, 60); p[i * 3 + 2] = frand(-70, 70); }
  return { n, pos, p, geo, mat, lines, k: 0 };
})();
function updateRain(dt, cx, cy, cz, k) {
  RAIN.k = k;
  RAIN.mat.opacity = 0.32 * k;
  RAIN.lines.visible = k > 0.02;
  if (!RAIN.lines.visible) return;
  const { n, p, pos } = RAIN, R = 70, sp = 32;
  const m = Math.floor(n * clamp(k * 1.2, 0, 1));
  for (let i = 0; i < n; i++) {
    let y = p[i * 3 + 1] - sp * dt;
    if (y < 0) { y += 60; p[i * 3] = frand(-R, R); p[i * 3 + 2] = frand(-R, R); }
    p[i * 3 + 1] = y;
    const x = cx + p[i * 3], z = cz + p[i * 3 + 2], yy = cy - 25 + y;
    if (i >= m) { pos[i * 6 + 1] = pos[i * 6 + 4] = -999; continue; }
    pos[i * 6] = x; pos[i * 6 + 1] = yy; pos[i * 6 + 2] = z;
    pos[i * 6 + 3] = x + WIND.x * 0.08; pos[i * 6 + 4] = yy + 1.3; pos[i * 6 + 5] = z + WIND.z * 0.08;
  }
  RAIN.geo.attributes.position.needsUpdate = true;
}

// ---------- recipes ----------
function muzzle(x, y, z, big = 0.6) {
  emit(glowPS, x, y, z, 0, 0.3, 0, big, -big * 2, 0.09, 1, 0.8, 0.4, 1, 0, 0);
}
function dirtKick(x, z, n = 2) {
  const y = groundH(x, z) + 0.2;
  for (let i = 0; i < n; i++) emit(smokePS, x, y, z, frand(-1, 1), frand(1.5, 3), frand(-1, 1), frand(0.5, 0.9), 0.8, frand(0.5, 0.9), 0.38, 0.3, 0.22, 0.75, 1.5, 5);
}
function sparks(x, y, z, n = 4) {
  for (let i = 0; i < n; i++) emit(glowPS, x, y, z, frand(-4, 4), frand(1, 5), frand(-4, 4), 0.35, -0.3, frand(0.15, 0.35), 1, 0.75, 0.35, 1, 1, 9);
}
function explosionFX(x, z, r, wet) {
  const y = groundH(x, z);
  const k = r / 4;
  emit(glowPS, x, y + 1, z, 0, 2, 0, r * 2.4, r * 2, 0.18, 1, 0.75, 0.4, 1, 0, 0);
  for (let i = 0; i < 4 + k * 3; i++) emit(glowPS, x + frand(-r, r) * 0.3, y + frand(0.5, 2) * k, z + frand(-r, r) * 0.3, frand(-3, 3), frand(3, 8), frand(-3, 3), r * frand(0.6, 1), r * 0.8, frand(0.25, 0.45), 1, 0.55, 0.2, 0.9, 1, 0, 0.4, 0.15, 0.05);
  // fountain of mud
  for (let i = 0; i < 10 + k * 12; i++) {
    const a = Math.random() * TAU, sp = frand(2, 7) * k;
    emit(smokePS, x, y + 0.5, z, Math.cos(a) * sp, frand(8, 20) * Math.sqrt(k), Math.sin(a) * sp, frand(0.6, 1.3) * k, 0.5, frand(1, 1.8), 0.26, 0.2, 0.14, 0.95, 0.4, 16);
  }
  // rising smoke
  for (let i = 0; i < 4 + k * 4; i++) {
    const sh = frand(0.28, 0.42);
    emit(smokePS, x + frand(-r, r) * 0.4, y + frand(0.5, 2.5), z + frand(-r, r) * 0.4, frand(-1, 1), frand(1.5, 4), frand(-1, 1), r * frand(0.8, 1.3), r * 0.5, frand(3.5, 6.5), sh, sh * 0.95, sh * 0.9, 0.75, 0.6, -0.15, 0.55, 0.53, 0.5);
  }
  if (wet) for (let i = 0; i < 12; i++) emit(smokePS, x, y + 0.5, z, frand(-3, 3), frand(6, 12), frand(-3, 3), 0.8, 1.5, 1.2, 0.6, 0.65, 0.68, 0.8, 0.5, 12);
}
function smokePuff(x, y, z, size, dark = 0.25, life = 6) {
  emit(smokePS, x, y, z, frand(-0.6, 0.6), frand(1.2, 2.6), frand(-0.6, 0.6), size, size * 0.4, frand(life * 0.7, life * 1.2), dark, dark, dark * 1.04, 0.7, 0.3, -0.25, dark + 0.25, dark + 0.23, dark + 0.2);
}
function fireAt(x, y, z, size) {
  emit(glowPS, x + frand(-size, size) * 0.3, y, z + frand(-size, size) * 0.3, frand(-0.5, 0.5), frand(1.5, 3.5), frand(-0.5, 0.5), size * frand(0.7, 1.1), -size * 0.6, frand(0.4, 0.8), 1, 0.55, 0.15, 0.9, 0.5, -1, 0.7, 0.15, 0.02);
}
function flameJet(x, y, z, dx, dz, len) {
  for (let i = 0; i < 4; i++) {
    const sp = len * frand(1.6, 2.4);
    emit(glowPS, x, y, z, dx * sp + frand(-1, 1), frand(0.2, 1.6), dz * sp + frand(-1, 1), frand(0.5, 0.9), 2.2, frand(0.35, 0.55), 1, 0.65, 0.2, 1, 0.6, -1.5, 0.9, 0.2, 0.02);
  }
  if (Math.random() < 0.4) emit(smokePS, x + dx * len, y + 1, z + dz * len, frand(-0.5, 0.5), 2, frand(-0.5, 0.5), 1.5, 1.5, 2.5, 0.12, 0.1, 0.09, 0.6, 0.4, -0.3, 0.3, 0.29, 0.27);
}
function gasPuff(x, y, z, size) {
  emit(smokePS, x, y, z, frand(-0.5, 0.5), frand(0.1, 0.5), frand(-0.5, 0.5), size, size * 0.2, frand(4, 7), 0.74, 0.8, 0.3, 0.6, 0.25, -0.02, 0.66, 0.7, 0.38);
}
function exhaust(x, y, z) {
  emit(smokePS, x, y, z, frand(-0.4, 0.4), frand(0.8, 1.6), frand(-0.4, 0.4), 0.7, 1.1, 1.6, 0.22, 0.21, 0.2, 0.45, 0.4, -0.2, 0.45, 0.44, 0.42);
}

// Long-lived emitters: burning wrecks, smoking buildings, broken-down engines.
const EMITTERS = [];
function addEmitter(e) { e.t = 0; e.acc = 0; EMITTERS.push(e); return e; }
function updateEmitters(dt) {
  for (let i = EMITTERS.length - 1; i >= 0; i--) {
    const e = EMITTERS[i];
    e.t += dt;
    if (e.life && e.t > e.life) { EMITTERS.splice(i, 1); continue; }
    if (e.ent && e.ent.dead && e.kind === 'engine') { EMITTERS.splice(i, 1); continue; }
    const x = e.ent ? e.ent.x : e.x, z = e.ent ? e.ent.z : e.z, y = (e.ent ? groundH(x, z) : e.y) + (e.dy || 0);
    const fade = e.life ? 1 - smooth(e.life * 0.6, e.life, e.t) : 1;
    e.acc += dt * (e.rate || 6) * fade;
    while (e.acc > 1) {
      e.acc -= 1;
      if (e.kind === 'fire') { fireAt(x, y, z, e.size || 1.5); if (Math.random() < 0.5) smokePuff(x, y + 1, z, (e.size || 1.5) * 1.6, 0.12, 7); }
      else if (e.kind === 'smoke' || e.kind === 'engine') smokePuff(x + frand(-0.5, 0.5), y, z + frand(-0.5, 0.5), e.size || 1.5, e.dark ?? 0.3, 5);
    }
  }
}

let shake = 0;
function addShake(a, x, z) {
  if (x !== undefined) { const d = Math.hypot(x - CAM.x, z - CAM.z); a *= clamp(1 - d / 140, 0, 1); }
  shake = Math.min(1.2, shake + a);
}
