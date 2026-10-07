// Calamity Bay — particles (dust, smoke, fire, sparks, splashes), emitters, shockwaves, beam, camera shake

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
  const t = new THREE.CanvasTexture(cv);
  return t;
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
    uniforms: { uScale: { value: 800 }, uTex: { value: puffTexture(additive) }, uFogColor: { value: scene.fog.color }, uFogNear: { value: scene.fog.near }, uFogFar: { value: scene.fog.far } },
    vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; uniform float uFogNear; uniform float uFogFar;
      varying vec4 vCol; varying float vFog;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uScale / max(-mv.z, 1.0), 0.0, 600.0); vCol = aCol; vFog = smoothstep(uFogNear, uFogFar, -mv.z); }`,
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
const glowPS = makePS(isTouch ? 2000 : 4000, true);

// spawn one particle; c1 is the colour it drifts toward over its life
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
    vel[i * 3] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - g[i] * dt; vel[i * 3 + 2] *= k;
    pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    if (pos[i * 3 + 1] < -4 && g[i] > 0) { life[i] = max[i]; }
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
}

// ---------- effect recipes ----------
function dustAt(x, y, z, size, n = 3) {
  for (let i = 0; i < n; i++) {
    const s = size * frand(0.6, 1.2), sh = frand(0.52, 0.66);
    emit(smokePS, x + frand(-size, size) * 0.4, y + frand(-size, size) * 0.3, z + frand(-size, size) * 0.4,
      frand(-3, 3), frand(0.5, 3), frand(-3, 3), s, s * 0.35, frand(3, 6), sh, sh * 0.95, sh * 0.88, 0.6, 0.7, -0.2);
  }
}
function groundDust(x, z, r, n) {
  const y = Math.max(terrainH(x, z), WATER_Y) + 1;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, d = r * frand(0.3, 1), sp = frand(6, 14);
    const sh = frand(0.55, 0.68);
    emit(smokePS, x + Math.cos(a) * d, y + frand(0, 2), z + Math.sin(a) * d, Math.cos(a) * sp, frand(0.5, 2.5), Math.sin(a) * sp,
      frand(5, 10), 3, frand(2.5, 4.5), sh, sh * 0.94, sh * 0.85, 0.55, 1.2, -0.1);
  }
}
function smokePuff(x, y, z, size, dark = 0.2) {
  emit(smokePS, x, y, z, frand(-1.5, 1.5), frand(4, 7), frand(-1.5, 1.5), size, size * 0.45, frand(6, 10), dark, dark, dark * 1.05, 0.55, 0.15, -0.6, dark + 0.25, dark + 0.22, dark + 0.2);
}
function fireAt(x, y, z, size) {
  emit(glowPS, x, y, z, frand(-1, 1), frand(3, 7), frand(-1, 1), size * frand(0.7, 1.2), -size * 0.6, frand(0.5, 1.0), 1, 0.75, 0.3, 0.9, 0.6, -2, 0.9, 0.25, 0.05);
}
function sparkBurst(x, y, z, n) {
  for (let i = 0; i < n; i++)
    emit(glowPS, x, y, z, frand(-14, 14), frand(2, 16), frand(-14, 14), frand(0.6, 1.2), -0.6, frand(0.5, 1.1), 1, 0.85, 0.5, 1, 0.3, 18, 1, 0.4, 0.1);
}
function explosionFx(x, y, z, s) {
  emit(glowPS, x, y, z, 0, 0, 0, s * 9, s * 6, 0.22, 1, 0.95, 0.75, 1, 0, 0);
  const n = Math.round(6 + s * 4);
  for (let i = 0; i < n; i++) {
    _v1.set(frand(-1, 1), frand(-0.2, 1), frand(-1, 1)).normalize().multiplyScalar(frand(4, 11) * s);
    emit(glowPS, x, y, z, _v1.x, _v1.y, _v1.z, s * frand(2.5, 4.5), s * 2, frand(0.45, 0.9), 1, 0.7, 0.25, 0.95, 2.2, -2, 0.7, 0.15, 0.02);
  }
  for (let i = 0; i < n * 0.7; i++)
    emit(smokePS, x + frand(-s, s) * 2, y + frand(0, s * 2), z + frand(-s, s) * 2, frand(-3, 3) * s, frand(2, 6) * s * 0.6, frand(-3, 3) * s,
      s * frand(3, 5), s * 1.6, frand(3, 6), 0.16, 0.15, 0.14, 0.7, 0.9, -0.8, 0.4, 0.38, 0.36);
  sparkBurst(x, y, z, Math.round(4 + s * 3));
}
function splashAt(x, z, s) {
  const y = WATER_Y + 0.5;
  for (let i = 0; i < 6 + s * 5; i++) {
    const a = Math.random() * TAU, sp = frand(2, 7) * Math.sqrt(s);
    emit(smokePS, x + Math.cos(a) * s, y, z + Math.sin(a) * s, Math.cos(a) * sp, frand(8, 18) * Math.sqrt(s), Math.sin(a) * sp,
      frand(2, 4) * Math.sqrt(s), s * 1.2, frand(1.2, 2.2), 0.92, 0.96, 1, 0.85, 0.4, 16);
  }
  for (let i = 0; i < 4; i++)
    emit(smokePS, x + frand(-s, s) * 2, y + 1, z + frand(-s, s) * 2, frand(-2, 2), frand(0.5, 2), frand(-2, 2), s * 3, s * 2, frand(2, 3.5), 0.86, 0.92, 0.95, 0.6, 1, -0.1);
}
function leafBurst(x, y, z, kind, fling) {
  for (let i = 0; i < 6; i++)
    emit(smokePS, x + frand(-3, 3), y + frand(-2, 2), z + frand(-3, 3), frand(-6, 6) + (fling ? fling.x : 0), frand(2, 9), frand(-6, 6) + (fling ? fling.z : 0),
      frand(1.2, 2.4), -0.2, frand(1.5, 3), kind ? 0.18 : 0.3, kind ? 0.32 : 0.5, kind ? 0.2 : 0.2, 1, 0.8, 9);
}
function muzzle(x, y, z, s = 1) { emit(glowPS, x, y, z, 0, 0, 0, s * 2.2, 0, 0.07, 1, 0.85, 0.5, 1, 0, 0); }

// ---------- emitters (burning buildings, wrecks, lava) ----------
const EMIT = [];
function addEmitter(o) {
  if (EMIT.length > 70) EMIT.shift();
  o.t = 0; o.size = o.size || 3;
  EMIT.push(o);
  return o;
}
function updateEmitters(dt) {
  for (let i = EMIT.length - 1; i >= 0; i--) {
    const e = EMIT[i];
    e.life -= dt;
    if (e.life <= 0 || (e.block !== undefined && !BLK_[e.block].alive) || (e.body && e.body.dead)) { EMIT.splice(i, 1); continue; }
    if (e.body) { e.x = e.body.p.x; e.y = e.body.p.y + e.body.h.y; e.z = e.body.p.z; }
    e.t -= dt;
    if (e.t > 0) continue;
    const far = camera.position.distanceToSquared(_v1.set(e.x, e.y, e.z)) > 1.6e6;
    if (e.kind === 'fire') {
      e.t = far ? 0.25 : 0.08;
      fireAt(e.x + frand(-e.size, e.size) * 0.5, e.y, e.z + frand(-e.size, e.size) * 0.5, e.size * 1.2);
      if (Math.random() < 0.3) smokePuff(e.x, e.y + e.size, e.z, e.size * 2.2, 0.14);
    } else if (e.kind === 'wreck') {
      e.t = far ? 0.3 : 0.12;
      fireAt(e.x + frand(-1, 1), e.y, e.z + frand(-1, 1), 2.4);
      if (Math.random() < 0.35) smokePuff(e.x, e.y + 2, e.z, 4, 0.12);
    } else if (e.kind === 'lava') {
      e.t = 0.1;
      fireAt(e.x + frand(-4, 4), e.y + 0.5, e.z + frand(-4, 4), 4);
      if (Math.random() < 0.2) smokePuff(e.x, e.y + 2, e.z, 6, 0.25);
    } else if (e.kind === 'steam') {
      e.t = 0.15;
      emit(smokePS, e.x + frand(-2, 2), e.y, e.z + frand(-2, 2), frand(-1, 1), frand(4, 8), frand(-1, 1), 5, 4, 3, 0.9, 0.92, 0.95, 0.45, 0.4, -0.5);
    }
  }
}

// ---------- shockwave rings ----------
const RINGS = [];
const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
for (let i = 0; i < 8; i++) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.visible = false; m.renderOrder = 5;
  scene.add(m);
  RINGS.push({ m, t: 1, dur: 1, r: 10 });
}
function ring(x, y, z, r, dur, color) {
  const R = RINGS.find((q) => q.t >= q.dur) || RINGS[0];
  R.t = 0; R.dur = dur; R.r = r;
  R.m.position.set(x, y, z); R.m.visible = true;
  R.m.material.color.set(color || 0xffe2b0);
}
function updateRings(dt) {
  for (const R of RINGS) {
    if (R.t >= R.dur) { R.m.visible = false; continue; }
    R.t += dt;
    const k = R.t / R.dur, s = R.r * (0.15 + 0.85 * Math.sqrt(k));
    R.m.scale.set(s, 1, s);
    R.m.material.opacity = (1 - k) * 0.8;
  }
}

// ---------- energy beam ----------
const beam = new THREE.Group();
(function () {
  const g = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const outer = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x3fd8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  const inner = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe8fdff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  outer.scale.set(3.2, 3.2, 1); inner.scale.set(1.2, 1.2, 1);
  beam.add(outer, inner);
  beam.userData = { outer, inner };
  beam.visible = false; beam.renderOrder = 6;
  scene.add(beam);
})();
function setBeam(from, to, w) {
  beam.visible = true;
  beam.position.copy(from);
  beam.lookAt(to);
  const L = from.distanceTo(to);
  beam.scale.set(w, w, L);
}

// ---------- camera shake ----------
let shake = 0;
function addShake(a, pos) {
  if (pos) a *= clamp(1 - camera.position.distanceTo(pos) / 700, 0.15, 1);
  shake = Math.min(1.6, shake + a);
}
