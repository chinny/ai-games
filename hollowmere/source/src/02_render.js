// Hollowmere — renderer, PS1-style shader, procedural textures, materials

const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.autoClear = false;
const scene = new THREE.Scene();
const handScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 4 / 3, 0.08, 220);
camera.rotation.order = 'YXZ';
const LOW_H = 240; // PlayStation-ish vertical resolution

// Uniforms shared by every world material (the same objects, so one write updates all).
const U = {
  uRes: { value: new THREE.Vector2(320, 240) },
  uLantern: { value: new THREE.Vector3() },
  uLanternI: { value: 0 },
  uLanternR: { value: 13 },
  uAmbient: { value: new THREE.Color(0.10, 0.11, 0.16) },
  uMoonDir: { value: new THREE.Vector3(0.35, 0.8, -0.45).normalize() },
  uMoon: { value: new THREE.Color(0.07, 0.08, 0.13) },
  uFlash: { value: 0 },
  uFogColor: { value: new THREE.Color(0.035, 0.04, 0.06) },
  uFogNear: { value: 4 },
  uFogFar: { value: 34 },
};

function resize() {
  const a = innerWidth / innerHeight;
  const h = LOW_H, w = Math.round(h * a);
  renderer.setSize(w, h, false);
  camera.aspect = a;
  camera.updateProjectionMatrix();
  U.uRes.value.set(w, h);
}

const DITHER = `
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
vec3 psx(vec3 c){ c += (bayer4(gl_FragCoord.xy) - 0.5) / 22.0; return floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5) / 31.0; }
`;

const VS = `
attribute vec3 acol;
uniform vec2 uRes;
uniform vec3 uLantern; uniform float uLanternI; uniform float uLanternR;
uniform vec3 uAmbient; uniform vec3 uMoonDir; uniform vec3 uMoon; uniform float uFlash;
uniform float uFogNear; uniform float uFogFar; uniform float uEmit;
varying vec3 vUvw; varying vec3 vLight; varying float vFog;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * wp;
  vec4 cp = projectionMatrix * mv;
  // Snap vertices to the low-res pixel grid: the PS1 "wobble".
  vec2 grid = uRes * 0.5;
  if (cp.w > 0.0) cp.xy = floor(cp.xy / cp.w * grid + 0.5) / grid * cp.w;
  gl_Position = cp;
  // Affine texture mapping: interpolate uv*w and w, divide per pixel.
  vUvw = vec3(uv * cp.w, cp.w);
  vec3 L = uLantern - wp.xyz; float d = length(L);
  float att = clamp(1.0 - d / uLanternR, 0.0, 1.0); att *= att;
  float lam = 0.3 + 0.7 * max(dot(n, L / max(d, 0.001)), 0.0);
  vec3 lant = vec3(1.0, 0.72, 0.42) * uLanternI * att * lam * 1.7;
  float sky = max(dot(n, uMoonDir), 0.0);
  vec3 flash = vec3(0.75, 0.8, 1.0) * uFlash * (0.45 + 0.55 * sky);
  vLight = acol * (uAmbient + uMoon * sky + flash + lant);
  vLight = max(vLight, acol * uEmit);
  vFog = clamp((-mv.z - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
}`;

const FS = `
uniform sampler2D map; uniform vec3 uFogColor; uniform float uFlash; uniform float uFogAmt;
varying vec3 vUvw; varying vec3 vLight; varying float vFog;
${DITHER}
void main(){
  vec4 t = texture2D(map, vUvw.xy / vUvw.z);
  if (t.a < 0.5) discard;
  vec3 c = t.rgb * vLight;
  vec3 fogc = uFogColor + vec3(0.30, 0.33, 0.42) * uFlash;
  c = mix(c, fogc, vFog * uFogAmt);
  gl_FragColor = vec4(psx(c), 1.0);
}`;

function makeMat(map, o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, {
      map: { value: map },
      uEmit: { value: o.emit || 0 },
      uFogAmt: { value: o.fog === false ? 0 : 1 },
    }),
    vertexShader: VS,
    fragmentShader: FS,
    side: o.side || THREE.FrontSide,
  });
}

// ---------- procedural textures ----------
const tr = mulberry32(42);
const C = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
function finishTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function makeTex(w, h, fn) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = fn(x, y), i = (y * w + x) * 4;
    img.data[i] = p[0]; img.data[i + 1] = p[1]; img.data[i + 2] = p[2]; img.data[i + 3] = p[3] === undefined ? 255 : p[3];
  }
  ctx.putImageData(img, 0, 0);
  return finishTex(cv);
}
function planksFn(x, y) {
  const b = Math.floor(x / 8);
  if (x % 8 === 0 || (y + b * 11) % 32 === 0) return [20, 16, 13];
  if (x % 8 === 4 && (y + b * 11) % 32 === 3) return [24, 22, 22];
  const k = (0.72 + 0.45 * hash2(b, 3)) * (0.8 + 0.25 * hash2(x, Math.floor(y / 4) + b * 9)) * (0.92 + 0.16 * tr());
  return C([84, 68, 52], k);
}
const T = {
  grass: makeTex(32, 32, (x, y) => {
    const n = vnoiseW(x / 4, y / 4, 8), k = 0.65 + 0.5 * n + 0.25 * (tr() - 0.5);
    if (tr() < 0.07) return C([74, 80, 42], k);
    if (n < 0.28) return C([46, 38, 28], k + 0.2);
    return C([38, 48, 28], k);
  }),
  mud: makeTex(32, 32, (x, y) => {
    const n = vnoiseW(x / 5.33, y / 5.33, 6), k = 0.75 + 0.4 * tr();
    if (n > 0.7) return (x + y) % 7 === 0 ? [70, 80, 96] : C([26, 30, 38], k);
    return C([62, 48, 36], k * (0.8 + 0.4 * n));
  }),
  planks: makeTex(32, 32, planksFn),
  floor: makeTex(32, 32, (x, y) => planksFn(y, x)),
  shingle: makeTex(32, 32, (x, y) => {
    const row = Math.floor(y / 6), off = (row % 2) * 4, col = Math.floor((x + off) / 8);
    if (y % 6 === 0 || (x + off) % 8 === 0) return [18, 16, 18];
    const k = 0.7 + 0.5 * hash2(col, row) + 0.15 * (tr() - 0.5);
    return hash2(col * 3, row * 5) > 0.82 ? C([46, 58, 38], k) : C([60, 54, 58], k);
  }),
  stone: makeTex(32, 32, (x, y) => {
    const row = Math.floor(y / 8), off = (row % 2) * 8, bx = Math.floor((x + off) / 16);
    if (y % 8 === 0 || (x + off) % 16 === 0) return [36, 36, 34];
    const k = 0.7 + 0.4 * hash2(bx, row) + 0.2 * (tr() - 0.5);
    return C([96, 94, 88], k);
  }),
  bark: makeTex(32, 32, (x, y) => {
    const k = (0.6 + 0.5 * hash2(x, 0)) * (0.85 + 0.3 * tr());
    return hash2(x, 7) < 0.2 ? C([30, 24, 20], k) : C([58, 46, 36], k);
  }),
  pine: makeTex(32, 32, (x, y) => {
    let k = 0.55 + 0.6 * tr();
    if (y % 8 < 2) k *= 0.55;
    return C([28, 44, 32], k);
  }),
  window: makeTex(32, 32, (x, y) => {
    if (x < 3 || x > 28 || y < 3 || y > 28 || x === 15 || x === 16 || y === 15 || y === 16) return C([56, 44, 34], 0.8 + 0.3 * tr());
    const r = (((x - y) % 32) + 32) % 32;
    return r > 4 && r < 9 ? [30, 38, 52] : [10, 13, 20];
  }),
  windowLit: makeTex(32, 32, (x, y) => {
    if (x < 3 || x > 28 || y < 3 || y > 28 || x === 15 || x === 16 || y === 15 || y === 16) return C([56, 44, 34], 0.5);
    const k = 0.55 + 0.45 * (1 - Math.hypot(x - 22, y - 9) / 26);
    return C([235, 160, 70], k);
  }),
  boarded: makeTex(32, 32, (x, y) => {
    const a = Math.abs(((x + y) % 32) - 16) < 4, b = Math.abs(((x - y + 64) % 32) - 10) < 4;
    if (a || b) return planksFn(x + 3, y);
    if (x < 3 || x > 28 || y < 3 || y > 28) return C([56, 44, 34], 0.8);
    return [8, 8, 10];
  }),
  door: makeTex(32, 32, (x, y) => {
    if ((y >= 5 && y <= 7) || (y >= 24 && y <= 26)) return [30, 30, 33];
    if (x >= 25 && x <= 27 && y >= 14 && y <= 17) return [92, 88, 76];
    if (x % 6 === 0) return [16, 12, 10];
    return C([62, 44, 30], 0.75 + 0.35 * hash2(Math.floor(x / 6), 1) + 0.1 * tr());
  }),
  paper: makeTex(16, 16, (x, y) => {
    if (y % 3 === 1 && x > 1 && x < 6 + hash2(y, 1) * 9 && y > 1 && y < 14) return [74, 62, 52];
    return C([210, 198, 166], 0.9 + 0.1 * tr());
  }),
  cloth: makeTex(8, 8, () => C([16, 16, 19], 0.7 + 0.6 * tr())),
  skin: makeTex(16, 16, () => C([200, 196, 188], 0.85 + 0.15 * tr())),
  grave: makeTex(32, 32, (x, y) => {
    if ((x >= 15 && x <= 16 && y >= 6 && y <= 18) || (y >= 9 && y <= 10 && x >= 11 && x <= 20)) return [44, 46, 48];
    if (tr() < 0.06) return [72, 84, 60];
    return C([104, 106, 108], 0.75 + 0.3 * vnoiseW(x / 4, y / 4, 8) + 0.1 * tr());
  }),
  iron: makeTex(16, 16, () => C([48, 48, 52], 0.7 + 0.5 * tr())),
  stained: makeTex(32, 32, (x, y) => {
    if (x % 8 === 0 || y % 8 === 0 || x < 2 || x > 29) return [8, 8, 8];
    const pal = [[130, 24, 26], [28, 44, 120], [160, 116, 34], [34, 96, 56]];
    return C(pal[Math.floor(hash2(Math.floor(x / 8), Math.floor(y / 8)) * 4)], 0.75 + 0.2 * tr());
  }),
  dirt: makeTex(16, 16, () => C([48, 36, 28], 0.6 + 0.6 * tr())),
  linen: makeTex(16, 16, (x, y) => C([150, 140, 120], (0.8 + 0.2 * tr()) * (y % 4 === 0 ? 0.85 : 1))),
  hole: makeTex(4, 4, () => [3, 3, 4]),
  white: makeTex(4, 4, () => [255, 255, 255]),
  clouds: makeTex(64, 64, (x, y) => {
    let v = 0, a = 0.5, f = 1 / 16, p = 4;
    for (let o = 0; o < 4; o++) { v += vnoiseW(x * f, y * f, p) * a; a *= 0.5; f *= 2; p *= 2; }
    const g = clamp((v - 0.3) * 2.2, 0, 1) * 255;
    return [g, g, g];
  }),
};
T.sign = (() => {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) { const p = planksFn(y, x); ctx.fillStyle = `rgb(${p[0] | 0},${p[1] | 0},${p[2] | 0})`; ctx.fillRect(x, y, 1, 1); }
  ctx.fillStyle = '#d6cbb0'; ctx.font = 'bold 10px Georgia, serif'; ctx.textAlign = 'center';
  ctx.fillText('HOLLOWMERE', 32, 14);
  ctx.font = '7px Georgia, serif'; ctx.fillText('pop. 61', 32, 25);
  return finishTex(cv);
})();

const MAT = {
  grass: makeMat(T.grass), mud: makeMat(T.mud), planks: makeMat(T.planks), floor: makeMat(T.floor),
  shingle: makeMat(T.shingle), stone: makeMat(T.stone), bark: makeMat(T.bark), pine: makeMat(T.pine),
  window: makeMat(T.window), windowLit: makeMat(T.windowLit, { emit: 1.1 }), boarded: makeMat(T.boarded),
  door: makeMat(T.door), paper: makeMat(T.paper, { emit: 0.55 }), oldpaper: makeMat(T.paper),
  cloth: makeMat(T.cloth), skin: makeMat(T.skin, { emit: 0.2 }), grave: makeMat(T.grave), iron: makeMat(T.iron),
  stained: makeMat(T.stained, { emit: 0.12 }), dirt: makeMat(T.dirt), linen: makeMat(T.linen), hole: makeMat(T.hole, { fog: false }),
  sign: makeMat(T.sign), glow: makeMat(T.white, { emit: 1, fog: false }), flame: makeMat(T.white, { emit: 1.2 }),
};

// ---------- sky dome ----------
const skyMat = new THREE.ShaderMaterial({
  uniforms: { uFlash: U.uFlash, uFogColor: U.uFogColor, uTime: { value: 0 }, uClouds: { value: T.clouds } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
  fragmentShader: `uniform float uFlash; uniform vec3 uFogColor; uniform float uTime; uniform sampler2D uClouds; varying vec3 vDir;
    ${DITHER}
    void main(){
      vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0);
      vec2 uv = d.xz / (d.y + 0.25) * 0.3 + vec2(uTime * 0.006, uTime * 0.003);
      float cl = texture2D(uClouds, uv).r;
      vec3 fogc = uFogColor + vec3(0.30, 0.33, 0.42) * uFlash;
      vec3 top = vec3(0.012, 0.014, 0.022) + cl * vec3(0.05, 0.055, 0.075) + cl * vec3(0.5, 0.55, 0.7) * uFlash;
      gl_FragColor = vec4(psx(mix(fogc, top, smoothstep(0.0, 0.3, h))), 1.0);
    }`,
  side: THREE.BackSide, depthWrite: false, depthTest: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 16, 10), skyMat);
sky.renderOrder = -100;
sky.frustumCulled = false;
scene.add(sky);
