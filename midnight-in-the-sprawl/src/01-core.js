// ===================== Core: helpers, renderer, scene, shaders =====================
const $ = (s) => document.querySelector(s);
const startBtn = $('#start');
if (!window.THREE) {
  startBtn.textContent = "3D engine didn't load. Check your connection and reload.";
  return;
}
const HAS_POST = !!(THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass);
const HAS_REFLECT = !!THREE.Reflector;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261004);
const R = (a, b) => a + (b - a) * rand();
const RI = (a, b) => Math.floor(R(a, b + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- City grid ----
const P = 64;            // street-centre to street-centre
const ST = 16;           // street width incl. sidewalks
const BLK = P - ST;      // 48 m blocks
const N = 10;            // blocks per side (walkable)
const HALF = (N * P) / 2; // 320
const sLine = (k) => -HALF + k * P;
const PLAZA = { i: 5, j: 4 };
const TOWER = { i: 6, j: 4 }; // the big screen across from the plaza
const blockRect = (i, j) => ({ x0: sLine(i) + ST / 2, x1: sLine(i + 1) - ST / 2, z0: sLine(j) + ST / 2, z1: sLine(j + 1) - ST / 2 });
const PR = blockRect(PLAZA.i, PLAZA.j);
const PLAZA_C = { x: (PR.x0 + PR.x1) / 2, z: (PR.z0 + PR.z1) / 2 };

const AVES = ['Ashida Ave', 'Kessler Ave', 'Chrome Ave', 'Lantern Ave', 'Meridian Ave', 'Hikari Ave', 'Ozu Ave', 'Vector Ave', 'Ferro Ave', 'Kowa Ave', 'Rimwall Ave'];
const STS = ['Nightjar St', 'Static St', 'Sodium St', 'Mizu St', 'Paper Moon St', 'Cobalt St', 'Tenjin St', 'Relay St', 'Gutter St', 'Halcyon St', 'Outer St'];

// ---- Palette (display-space; bright enough to cross the bloom threshold) ----
const NEON = {
  magenta: [1.0, 0.24, 0.86],
  pink: [1.0, 0.36, 0.6],
  cyan: [0.25, 0.95, 1.0],
  blue: [0.38, 0.58, 1.0],
  violet: [0.7, 0.42, 1.0],
  amber: [1.0, 0.7, 0.22],
  red: [1.0, 0.25, 0.32],
  teal: [0.25, 1.0, 0.72],
};
const NEON_WEIGHTED = ['magenta', 'magenta', 'cyan', 'cyan', 'cyan', 'pink', 'blue', 'violet', 'violet', 'amber', 'red', 'teal'];
const neonPick = () => NEON[pick(NEON_WEIGHTED)];
const hexOf = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');

const FOG_COLOR = new THREE.Color(0.105, 0.052, 0.16);
const FOG_DENSITY = 0.0052;

// ---- Renderer ----
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(FOG_COLOR);
const isWebGL2 = renderer.capabilities.isWebGL2;
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
scene.background = FOG_COLOR;

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 1400);
camera.rotation.order = 'YXZ';

// ---- Shared GLSL ----
const GLSL_NOISE = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), f.x), mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
`;
const GLSL_FOG = `
vec3 applyFog(vec3 col, vec3 wp){ float d = length(wp - cameraPosition); float f = 1.0 - exp(-uFogDensity*uFogDensity*d*d); return mix(col, uFogColor, clamp(f,0.0,1.0)); }
`;

// ---- Building shader: procedural windows, storefronts, street glow ----
const buildingMat = new THREE.ShaderMaterial({
  extensions: { derivatives: true },
  uniforms: {
    uTime: { value: 0 },
    uFogColor: { value: FOG_COLOR },
    uFogDensity: { value: FOG_DENSITY },
  },
  vertexShader: `
    attribute float aSeed;
    attribute vec3 aTint;
    varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying float vSeed; varying vec3 vTint;
    void main(){
      vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      vLocal = vec3((position.x + 0.5) * s.x, position.y * s.y, (position.z + 0.5) * s.z);
      vN = normal; vWorld = wp.xyz; vSeed = aSeed; vTint = aTint;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: `
    uniform float uTime; uniform vec3 uFogColor; uniform float uFogDensity;
    varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying float vSeed; varying vec3 vTint;
    ${GLSL_NOISE}
    ${GLSL_FOG}
    vec3 winPalette(float r){
      if (r < 0.45) return vec3(1.0, 0.78, 0.5);
      if (r < 0.72) return vec3(0.78, 0.88, 1.0);
      if (r < 0.86) return vec3(0.35, 0.92, 1.0);
      if (r < 0.95) return vec3(1.0, 0.42, 0.82);
      return vec3(0.75, 0.55, 1.0);
    }
    float box(float x, float a, float b, float w){ return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
    void main(){
      // interpolated varyings drift by tiny amounts; snap the seed so per-window hashes stay stable
      float seed = (floor(vSeed * 1000.0) + 0.5) / 1000.0;
      vec3 n = normalize(vN);
      vec3 col;
      float v = vWorld.y;
      if (n.y > 0.5) {
        col = vec3(0.028, 0.026, 0.04) + vTint * 0.02;
        col += vec3(0.05, 0.02, 0.06) * vnoise(vWorld.xz * 0.4);
      } else if (n.y < -0.5) {
        col = vec3(0.02);
      } else {
        bool sideX = abs(n.x) > 0.5;
        float u = sideX ? vLocal.z : vLocal.x;
        float face = sideX ? (n.x > 0.0 ? 1.0 : 2.0) : (n.z > 0.0 ? 3.0 : 4.0);
        float cw = 2.3 + fract(seed * 13.7) * 1.7;
        float ch = 3.4;
        vec2 g = vec2(u / cw, v / ch);
        vec2 cell = floor(g);
        vec2 f = fract(g);
        vec2 fw = fwidth(g);
        float aa = max(fw.x, fw.y);
        float style = floor(fract(seed * 7.31) * 4.0);
        vec3 wall = vec3(0.042, 0.04, 0.06) + vTint * 0.04;
        wall *= 0.72 + 0.28 * abs(n.z);
        wall *= 0.85 + 0.3 * vnoise(vec2(u * 0.3, v * 0.05) + seed * 40.0);
        float e = 0.02 + aa * 0.6;
        float win;
        float cov;
        if (style < 0.5)      { win = box(f.x, 0.16, 0.84, e) * box(f.y, 0.26, 0.86, e); cov = 0.68 * 0.6; }
        else if (style < 1.5) { win = box(f.y, 0.2, 0.9, e); cov = 0.7; cell.x = floor(cell.x / 3.0); }
        else if (style < 2.5) { win = box(f.x, 0.36, 0.64, e); cov = 0.28; cell.y = floor(cell.y / 2.0); }
        else                  { win = box(f.x, 0.08, 0.92, e) * box(f.y, 0.14, 0.92, e); cov = 0.84 * 0.78; }
        float litChance = 0.16 + fract(seed * 3.17) * 0.42;
        float r = hash12(cell + face * 37.0 + seed * 913.0);
        // a few windows switch on and off over time
        float slow = hash12(cell * 1.3 + floor(uTime * 0.07 + r * 30.0));
        float lit = step(1.0 - litChance, r);
        lit = mix(lit, step(0.5, slow), step(0.93, hash12(cell + 4.1)));
        float r2 = hash12(cell * 2.7 + face + seed * 31.0);
        vec3 wc = winPalette(fract(r2 + seed * 0.37)) * (0.32 + 0.4 * hash12(cell + 9.2));
        vec3 glass = vec3(0.035, 0.04, 0.075) + vec3(0.08, 0.03, 0.1) * f.y * 0.4;
        vec3 winCol = mix(glass, wc * (0.75 + 0.35 * f.y), lit);
        col = mix(wall, winCol, win);
        // far away: blend to the average so windows don't shimmer
        vec3 avg = mix(wall, mix(glass, winPalette(0.3) * 0.48, litChance), cov);
        col = mix(col, avg, smoothstep(0.22, 0.6, aa));
        // ground-floor shopfronts
        if (v < 4.7) {
          float sw = 5.0 + fract(seed * 5.3) * 2.0;
          float seg = floor(u / sw);
          float fu = fract(u / sw);
          float sr = hash12(vec2(seg, face + seed * 13.0));
          vec3 shop = winPalette(fract(sr * 3.7)) * (0.2 + 0.24 * sr);
          // shelves, a counter and the odd silhouette inside
          shop *= 0.55 + 0.45 * smoothstep(0.6, 3.4, v);
          shop *= 0.7 + 0.3 * step(0.3, fract(v * 1.25 + 0.2));
          float fig = step(abs(fu - fract(sr * 7.1) * 0.7 - 0.15), 0.035) * step(v, 2.4 - abs(fu - 0.5) * 0.3);
          shop *= 1.0 - 0.75 * fig * step(0.5, fract(sr * 11.0));
          float shutterLines = 0.6 + 0.4 * step(0.5, fract(v * 4.0));
          vec3 shutter = vec3(0.07, 0.068, 0.08) * shutterLines;
          float glassMask = box(v, 0.5, 3.7, 0.02) * box(fu, 0.06, 0.94, 0.01);
          vec3 front = sr > 0.32 ? shop : shutter;
          col = mix(vec3(0.03, 0.028, 0.036), front, glassMask);
        }
        // neon spill on the lower facade
        float spill = 1.0 - smoothstep(0.0, 26.0, v);
        col += mix(vec3(0.22, 0.04, 0.3), vec3(0.03, 0.18, 0.3), vnoise(vWorld.xz * 0.05)) * 0.11 * spill;
        col *= 0.55 + 0.45 * smoothstep(0.0, 1.2, v);
      }
      gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
    }`,
});

// ---- Ground shader (wet streets). Works as a Reflector shader, or plain with NO_REFLECT ----
const GROUND_UNIFORMS = {
  color: { value: new THREE.Color(0xffffff) },
  tDiffuse: { value: null },
  textureMatrix: { value: new THREE.Matrix4() },
  uTime: { value: 0 },
  uPulse: { value: 0 },
  uFogColor: { value: FOG_COLOR },
  uFogDensity: { value: FOG_DENSITY },
  uPlaza: { value: new THREE.Vector4(PR.x0, PR.z0, PR.x1, PR.z1) },
};
const GROUND_VERT = `
  uniform mat4 textureMatrix;
  varying vec4 vUv; varying vec3 vWorld;
  void main(){
    vUv = textureMatrix * vec4(position, 1.0);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const GROUND_FRAG = `
  uniform vec3 color; uniform sampler2D tDiffuse;
  uniform float uTime; uniform float uPulse; uniform vec3 uFogColor; uniform float uFogDensity; uniform vec4 uPlaza;
  varying vec4 vUv; varying vec3 vWorld;
  ${GLSL_NOISE}
  ${GLSL_FOG}
  void main(){
    vec2 w = vWorld.xz;
    vec2 p = w + ${HALF.toFixed(1)};
    vec2 q = mod(p, ${P.toFixed(1)});
    vec2 d = min(q, ${P.toFixed(1)} - q);
    bool roadA = d.x < 5.0;
    bool roadB = d.y < 5.0;
    bool road = roadA || roadB;
    bool walk = !road && (d.x < 8.0 || d.y < 8.0);
    float grain = vnoise(w * 3.1) * 0.5 + vnoise(w * 13.0) * 0.5;
    vec3 base; float rough;
    if (road) {
      base = vec3(0.02, 0.02, 0.028) * (0.75 + 0.5 * grain);
      rough = 0.55;
      float m = 0.0; vec3 mc = vec3(0.3);
      if (roadA && !roadB) {
        if (d.y > 5.3 && d.y < 7.8) m = step(0.5, fract(p.x / 1.1)) * step(d.x, 4.4);
        else if (d.y > 8.5) { m = step(d.x, 0.1) * step(fract(p.y / 6.0), 0.55); if (m > 0.5) mc = vec3(0.45, 0.32, 0.08); m = max(m, step(4.5, d.x) * step(d.x, 4.66) * 0.7); }
      }
      if (roadB && !roadA) {
        if (d.x > 5.3 && d.x < 7.8) m = step(0.5, fract(p.y / 1.1)) * step(d.y, 4.4);
        else if (d.x > 8.5) { m = step(d.y, 0.1) * step(fract(p.x / 6.0), 0.55); if (m > 0.5) mc = vec3(0.45, 0.32, 0.08); m = max(m, step(4.5, d.y) * step(d.y, 4.66) * 0.7); }
      }
      base = mix(base, mc * (0.55 + 0.45 * vnoise(w * 2.0)), m * 0.8);
    } else if (walk) {
      vec2 t = fract(p / 1.6);
      float joint = max(step(t.x, 0.04), step(t.y, 0.04));
      base = vec3(0.05, 0.047, 0.062) * (0.85 + 0.3 * grain) * (1.0 - 0.45 * joint);
      float dc = min(d.x < 8.0 ? d.x : 99.0, d.y < 8.0 ? d.y : 99.0);
      base += vec3(0.06) * step(dc, 5.25);
      rough = 0.7;
    } else {
      base = vec3(0.04, 0.038, 0.048) * (0.8 + 0.4 * grain);
      rough = 0.8;
    }
    // Plaza: polished stone and rings of light around the hologram
    bool plaza = w.x > uPlaza.x && w.x < uPlaza.z && w.y > uPlaza.y && w.y < uPlaza.w;
    if (plaza) {
      vec2 c = (uPlaza.xy + uPlaza.zw) * 0.5;
      float rr = length(w - c);
      vec2 t = fract(w / 3.0);
      float joint = max(step(t.x, 0.02), step(t.y, 0.02));
      base = vec3(0.03, 0.03, 0.045) * (1.0 - 0.3 * joint);
      rough = 0.22;
      float ring = exp(-pow(fract(rr / 5.0 - uTime * 0.18) - 0.5, 2.0) * 180.0) * (1.0 - smoothstep(6.0, 24.0, rr));
      base += vec3(0.1, 0.65, 0.85) * ring * (0.22 + 0.4 * uPulse);
      base += vec3(0.25, 0.9, 1.0) * 0.5 * (smoothstep(4.2, 3.9, rr) - smoothstep(3.6, 3.3, rr));
    }
    // Rain: puddles are darker and mirror-sharp
    float puddle = smoothstep(0.5, 0.62, fbm(w * 0.07 + 3.1));
    puddle *= road ? 1.0 : 0.65;
    rough = mix(rough, 0.04, puddle);
    base *= 1.0 - 0.35 * puddle;
    vec3 col = base;
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = mix(0.3, 1.0, pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0));
  #ifndef NO_REFLECT
    vec4 uv = vUv;
    vec2 jit = (vec2(vnoise(w * 1.7), vnoise(w * 1.7 + 9.0)) - 0.5) * 0.05 * rough;
    uv.xy += jit * uv.w;
    float sp = 0.014 * rough * uv.w;
    vec3 r = texture2DProj(tDiffuse, uv).rgb * 0.34;
    r += texture2DProj(tDiffuse, uv + vec4(0.0, sp, 0.0, 0.0)).rgb * 0.22;
    r += texture2DProj(tDiffuse, uv - vec4(0.0, sp, 0.0, 0.0)).rgb * 0.22;
    r += texture2DProj(tDiffuse, uv + vec4(0.0, sp * 2.2, 0.0, 0.0)).rgb * 0.22;
    float amt = mix(0.5, 0.95, puddle) * fres * (1.0 - 0.4 * rough);
    col += r * amt;
  #else
    col += vec3(0.08, 0.03, 0.1) * fres * (0.4 + puddle);
  #endif
    gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  }`;

// ---- Sky dome ----
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uTime: { value: 0 }, uHorizon: { value: FOG_COLOR }, uZenith: { value: new THREE.Color(0.012, 0.01, 0.03) } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
  fragmentShader: `
    uniform float uTime; uniform vec3 uHorizon; uniform vec3 uZenith; varying vec3 vDir;
    ${GLSL_NOISE}
    void main(){
      float y = vDir.y;
      vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.5, y));
      col += vec3(0.32, 0.07, 0.3) * exp(-max(y, 0.0) * 8.0) * 0.32;
      vec2 cp = vDir.xz / (max(y, 0.03) + 0.18) * 1.4 + vec2(uTime * 0.012, uTime * 0.004);
      float c = fbm(cp);
      float band = smoothstep(0.02, 0.25, y) * (1.0 - smoothstep(0.55, 0.95, y));
      col += mix(vec3(0.16, 0.05, 0.2), vec3(0.05, 0.1, 0.2), vDir.x * 0.5 + 0.5) * smoothstep(0.45, 0.85, c) * band;
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -1;
scene.add(sky);
