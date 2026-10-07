// Studworks — renderer, studio lighting, materials, baseplate and the orbit camera

const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;  // r128 ACES divides by 0.6 internally
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;  // shadows are redrawn only when the build changes
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
const UP = new V3(0, 1, 0);

let needsRender = true;
const invalidate = () => { needsRender = true; };

// A soft photo-studio sky with a few bright softboxes, baked into a reflection map.
function makeEnvironment(r) {
  const env = new THREE.Scene();
  const sky = new THREE.SphereGeometry(40, 32, 16);
  const P = sky.attributes.position, col = [];
  for (let i = 0; i < P.count; i++) {
    const t = clamp((P.getY(i) / 40 + 0.3) / 1.0, 0, 1);
    const s = t * t * (3 - 2 * t);
    col.push(lerp(0.32, 1.0, s), lerp(0.31, 1.0, s), lerp(0.30, 1.03, s));
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w, h, x, y, z, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(26, 16, 18, 26, 14, 5);    // key, above front right
  panel(18, 18, -26, 14, 8, 2.2);  // fill, left
  panel(30, 8, -6, 10, -30, 2.6);  // rim, behind
  panel(30, 30, 0, 36, 0, 1.6);    // overhead
  const pm = new THREE.PMREMGenerator(r);
  const tex = pm.fromScene(env, 0.035).texture;
  pm.dispose();
  return tex;
}
scene.environment = makeEnvironment(renderer);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8f887c, 0.12));
const sun = new THREE.DirectionalLight(0xfff4e6, 1.25);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 2048 : 4096, isTouch ? 2048 : 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.025;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 400;
scene.add(sun, sun.target);

// Bricks: glossy ABS. The instance colour tints the white base colour.
const brickMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0.24, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.12, envMapIntensity: 0.6,
});
const transMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.9,
  transparent: true, opacity: 0.5, depthWrite: false,
});

const bricksGroup = new THREE.Group();
scene.add(bricksGroup);

// ---------------------------------------------------------------------------
// Baseplate: a thin studded plate from (0, 0) to (size, size), top surface at y = 0.
const baseplate = { group: new THREE.Group(), mat: null };
scene.add(baseplate.group);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.ShadowMaterial({ opacity: 0.16 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.121;
ground.receiveShadow = true;
scene.add(ground);

function buildBaseplate(size, colorId) {
  const g = baseplate.group;
  for (const c of g.children.slice()) {
    g.remove(c);
    if (c.geometry !== studGeometry()) c.geometry.dispose();
  }
  if (!baseplate.mat) {
    baseplate.mat = new THREE.MeshPhysicalMaterial({
      roughness: 0.38, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.3, envMapIntensity: 0.45,
    });
  }
  baseplate.mat.color.copy(COLOR[colorId].linear);
  const gb = new GeoBuilder();
  chamferBox(gb, [0, -0.12, 0], [size, 0, size], 0.05, false);
  const body = new THREE.Mesh(gb.build(), baseplate.mat);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const studs = new THREE.InstancedMesh(studGeometry(), baseplate.mat, size * size);
  const m = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) studs.setMatrixAt(k++, m.makeTranslation(i + 0.5, 0, j + 0.5));
  }
  studs.receiveShadow = true;
  studs.frustumCulled = false;
  g.add(studs);

  const c = size / 2, r = size * 0.78 + 8;
  sun.position.set(c - 38, 72, c + 34);
  sun.target.position.set(c, 0, c);
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r });
  sun.shadow.camera.updateProjectionMatrix();
  renderer.shadowMap.needsUpdate = true;
  invalidate();
}

function setBaseplateColor(colorId) {
  baseplate.mat.color.copy(COLOR[colorId].linear);
  invalidate();
}

// ---------------------------------------------------------------------------
// Orbit camera. Input moves `goal`; the view eases toward it each frame.
const view = { target: new V3(16, 0, 16), yaw: 0.65, pitch: 0.6, dist: 52 };
const goal = { target: new V3(16, 0, 16), yaw: 0.65, pitch: 0.6, dist: 52 };

function frameBaseplate(size, instant) {
  goal.target.set(size / 2, 1.5, size / 2);
  goal.yaw = 0.65;
  goal.pitch = 0.62;
  goal.dist = size * 1.35 + 10;
  if (instant) { view.target.copy(goal.target); Object.assign(view, { yaw: goal.yaw, pitch: goal.pitch, dist: goal.dist }); }
}

function orbitBy(dx, dy) {
  goal.yaw -= dx * 0.0075;
  goal.pitch = clamp(goal.pitch + dy * 0.0065, 0.04, 1.52);
}
// Screen-space drag in pixels: the build follows the pointer.
function panBy(dx, dy) {
  const h = canvas.clientHeight || 1;
  const s = (2 * goal.dist * Math.tan((camera.fov * Math.PI) / 360)) / h;
  const right = new V3(Math.cos(goal.yaw), 0, -Math.sin(goal.yaw));
  const fwd = new V3(-Math.sin(goal.yaw), 0, -Math.cos(goal.yaw));
  // Looking from high up a vertical drag slides along the ground; from low down it lifts the view.
  const sp = Math.sin(goal.pitch), cp = Math.cos(goal.pitch);
  goal.target.addScaledVector(right, -dx * s);
  goal.target.addScaledVector(fwd, dy * s * sp);
  goal.target.y += dy * s * cp;
  clampTarget();
}
function zoomBy(f) { goal.dist = clamp(goal.dist * f, 4, 260); }
function clampTarget() {
  const S = world.size;
  goal.target.x = clamp(goal.target.x, -6, S + 6);
  goal.target.z = clamp(goal.target.z, -6, S + 6);
  goal.target.y = clamp(goal.target.y, 0, MAX_Y * PLATE);
}

// Returns true while the camera is still moving.
function updateCamera(dt) {
  const k = 1 - Math.exp(-dt * 16);
  const before = view.yaw + view.pitch + view.dist + view.target.x + view.target.y + view.target.z;
  view.yaw = lerp(view.yaw, goal.yaw, k);
  view.pitch = lerp(view.pitch, goal.pitch, k);
  view.dist = lerp(view.dist, goal.dist, k);
  view.target.lerp(goal.target, k);
  const after = view.yaw + view.pitch + view.dist + view.target.x + view.target.y + view.target.z;
  const cp = Math.cos(view.pitch);
  camera.position.set(
    view.target.x + view.dist * cp * Math.sin(view.yaw),
    view.target.y + view.dist * Math.sin(view.pitch),
    view.target.z + view.dist * cp * Math.cos(view.yaw));
  camera.lookAt(view.target);
  return Math.abs(after - before) > 1e-5;
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  invalidate();
}
window.addEventListener('resize', resize);
