// Mud & Iron — renderer, overcast lighting, sky, weather look and fog-of-war shader injection

const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.25 : 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 1, 2400);

const SUN_DIR = new V3(-0.55, 0.62, 0.42).normalize();
const SKY = { hor: new THREE.Color(0xc4bba4), zen: new THREE.Color(0x76818c) };
scene.fog = new THREE.Fog(0xb7ae98, 260, 900);
renderer.setClearColor(scene.fog.color);

const hemi = new THREE.HemisphereLight(0xd6dbe0, 0x5c4a34, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d4, 0.95);
sun.castShadow = true;
const SHADOW_R = 110;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -SHADOW_R, right: SHADOW_R, top: SHADOW_R, bottom: -SHADOW_R, near: 10, far: 800 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.3;
scene.add(sun, sun.target);

function placeSun(x, z) {
  const texel = (SHADOW_R * 2) / sun.shadow.mapSize.x * 4;
  x = Math.round(x / texel) * texel; z = Math.round(z / texel) * texel;
  sun.target.position.set(x, 0, z);
  sun.position.set(x + SUN_DIR.x * 400, SUN_DIR.y * 400, z + SUN_DIR.z * 400);
}

// Overcast sky dome with slow cloud banks.
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uHor: { value: SKY.hor }, uZen: { value: SKY.zen }, uTime: { value: 0 }, uFlash: { value: 0 }, uCloud: { value: 0.6 } },
  vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `uniform vec3 uHor; uniform vec3 uZen; uniform float uTime; uniform float uFlash; uniform float uCloud; varying vec3 vD;
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main(){
    float h = clamp(vD.y, -0.2, 1.0);
    vec3 c = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.6));
    vec2 p = vD.xz / max(vD.y + 0.08, 0.08) * 1.3 + vec2(uTime * 0.01, uTime * 0.004);
    float n = vn(p) * 0.55 + vn(p * 2.3 + 3.7) * 0.3 + vn(p * 4.7 - 1.3) * 0.15;
    float cl = smoothstep(0.62 - uCloud * 0.35, 0.85, n) * smoothstep(0.0, 0.25, h);
    c = mix(c, mix(uHor * 1.05, uZen * 0.85, n), cl * 0.8);
    gl_FragColor = vec4(c + uFlash, 1.0);
  }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), skyMat);
sky.frustumCulled = false; sky.renderOrder = -1;
scene.add(sky);

// Weather presets blended by setWeatherLook(rain 0..1).
const LOOK = {
  dry: { hor: new THREE.Color(0xc9bfa6), zen: new THREE.Color(0x7a8996), fog: new THREE.Color(0xb9af97), near: 260, far: 900, sun: 0.95, hemi: 0.8, cloud: 0.45 },
  wet: { hor: new THREE.Color(0x8d8f8c), zen: new THREE.Color(0x4f5862), fog: new THREE.Color(0x7f8280), near: 90, far: 480, sun: 0.35, hemi: 0.72, cloud: 1 },
};
function setWeatherLook(k) {
  const a = LOOK.dry, b = LOOK.wet;
  SKY.hor.copy(a.hor).lerp(b.hor, k); SKY.zen.copy(a.zen).lerp(b.zen, k);
  scene.fog.color.copy(a.fog).lerp(b.fog, k);
  scene.fog.near = lerp(a.near, b.near, k); scene.fog.far = lerp(a.far, b.far, k);
  renderer.setClearColor(scene.fog.color);
  sun.intensity = lerp(a.sun, b.sun, k); hemi.intensity = lerp(a.hemi, b.hemi, k);
  skyMat.uniforms.uCloud.value = lerp(a.cloud, b.cloud, k);
}
setWeatherLook(0);

// Fog of war: materials passed through fogify() darken by the player's visibility texture.
const FOGU = {
  tex: { value: new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat) },
  inv: { value: new THREE.Vector2(1 / 320, 1 / 320) },
};
FOGU.tex.value.needsUpdate = true;
function fogify(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFogTex = FOGU.tex; sh.uniforms.uFogInv = FOGU.inv;
    sh.vertexShader = 'varying vec2 vFogW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 fwp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
      fwp = instanceMatrix * fwp;
      #endif
      vFogW = (modelMatrix * fwp).xz;`);
    sh.fragmentShader = 'uniform sampler2D uFogTex; uniform vec2 uFogInv; varying vec2 vFogW;\n' +
      sh.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb *= texture2D(uFogTex, vFogW * uFogInv).r;\n#include <fog_fragment>');
  };
  mat.customProgramCacheKey = () => 'mi-fog';
  return mat;
}
// Shared vertex-coloured, flat-shaded materials.
const MAT = {
  vc: fogify(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 })),
  unit: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.05 }),
};

const ovCanvas = $('#ov');
const ov = ovCanvas.getContext('2d');
let VW = innerWidth, VH = innerHeight;
function resize() {
  VW = innerWidth; VH = innerHeight;
  renderer.setSize(VW, VH, false);
  camera.aspect = VW / VH;
  camera.updateProjectionMatrix();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  ovCanvas.width = Math.round(VW * dpr); ovCanvas.height = Math.round(VH * dpr);
  ov.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (typeof PS !== 'undefined') for (const p of PS) p.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
}

// Project a world point to CSS pixels. Returns false if behind the camera.
const _pj = new V3();
function project(x, y, z, out) {
  _pj.set(x, y, z).project(camera);
  out.x = (_pj.x * 0.5 + 0.5) * VW; out.y = (-_pj.y * 0.5 + 0.5) * VH;
  return _pj.z < 1;
}
