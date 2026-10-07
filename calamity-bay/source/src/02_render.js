// Calamity Bay — renderer, camera, golden-hour lighting and sky

const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.25 : 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 16 / 9, 1, 6000);

const SUN_DIR = new V3(-0.72, 0.42, 0.3).normalize();
const HORIZON = new THREE.Color(0xf0c49a);
const ZENITH = new THREE.Color(0x4f79b8);
scene.fog = new THREE.Fog(0xe4bf9c, 420, 2900);
renderer.setClearColor(scene.fog.color);

const hemi = new THREE.HemisphereLight(0xb9d0ef, 0x6e5b48, 0.72);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd4a0, 1.05);
sun.castShadow = true;
const SHADOW_R = 190;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -SHADOW_R, right: SHADOW_R, top: SHADOW_R, bottom: -SHADOW_R, near: 10, far: 1400 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.4;
scene.add(sun, sun.target);

// Keep the shadow frustum centred on the action, snapped to texels so edges don't crawl.
function placeSun(x, z) {
  const texel = (SHADOW_R * 2) / sun.shadow.mapSize.x;
  // Snap in light space approximately by snapping world xz on a coarse grid.
  x = Math.round(x / texel) * texel; z = Math.round(z / texel) * texel;
  sun.target.position.set(x, 0, z);
  sun.position.set(x + SUN_DIR.x * 600, SUN_DIR.y * 600, z + SUN_DIR.z * 600);
}

// Sky dome: horizon-to-zenith gradient with a warm sun glow.
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uSun: { value: SUN_DIR }, uHor: { value: HORIZON }, uZen: { value: ZENITH }, uFlash: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `uniform vec3 uSun; uniform vec3 uHor; uniform vec3 uZen; uniform float uFlash; uniform float uTime; varying vec3 vD;
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main(){
    float h = clamp(vD.y, -0.2, 1.0);
    vec3 c = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.55));
    c = mix(c, uHor * 0.8, clamp(-h * 5.0, 0.0, 1.0));
    float s = max(dot(vD, uSun), 0.0);
    c += vec3(1.0, 0.75, 0.45) * pow(s, 9.0) * 0.45 + vec3(1.0, 0.92, 0.75) * pow(s, 900.0) * 2.5;
    // drifting low-poly-ish cumulus on a plane above the bay
    vec2 p = vD.xz / max(vD.y + 0.06, 0.06) * 1.6 + vec2(uTime * 0.012, 0.0);
    float n = vn(p) * 0.55 + vn(p * 2.1 + 3.7) * 0.3 + vn(p * 4.3 - 1.3) * 0.15;
    float cl = smoothstep(0.56, 0.78, n) * smoothstep(0.02, 0.22, h);
    vec3 cc = mix(vec3(1.0, 0.86, 0.74), vec3(1.0, 0.97, 0.92), smoothstep(0.6, 0.85, n)) + vec3(0.25, 0.15, 0.05) * pow(s, 4.0);
    c = mix(c, cc, cl * 0.75);
    gl_FragColor = vec4(c + uFlash, 1.0);
  }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), skyMat);
sky.frustumCulled = false; sky.renderOrder = -1;
scene.add(sky);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // Point sprites are sized in world units; this converts to pixels. (Called only after 06_fx has run.)
  for (const p of PS) p.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
}
