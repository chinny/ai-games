// ===================== RENDERER =====================
let renderer, scene, camera, vmScene, vmCamera, rt, postScene, postCam, postMat, vmHemi, vmSun;
const GFX = { quality: Store.get('quality', isTouch ? 0 : 1), fov: Store.get('fov', 78) };
const QUALITY = [{ pr: 0.75, name: 'Low' }, { pr: 1, name: 'Medium' }, { pr: 1.5, name: 'High' }];

const gradTex = (() => {
  const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
})();
const matCache = new Map();
function toon(color, opts) {
  const key = color + (opts ? JSON.stringify(opts) : '');
  let m = matCache.get(key); if (m) return m;
  m = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: gradTex }, opts || {}));
  matCache.set(key, m); return m;
}
function glowMat(color, opacity = 1, additive = false) {
  const key = 'glow' + color + '|' + opacity + additive;
  let m = matCache.get(key); if (m) return m;
  m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1 || additive, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !additive && opacity >= 1, fog: !additive });
  matCache.set(key, m); return m;
}
const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
const INK_MAT = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, side: THREE.BackSide });

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.autoClear = false; renderer.info.autoReset = false;
  $('game').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(GFX.fov, 1, 0.15, 1500); camera.rotation.order = 'YXZ';
  vmScene = new THREE.Scene(); vmCamera = new THREE.PerspectiveCamera(56, 1, 0.01, 10);
  vmHemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.75); vmScene.add(vmHemi);
  vmSun = new THREE.DirectionalLight(0xffffff, 0.75); vmSun.position.set(0.5, 1, 0.6); vmScene.add(vmSun);
  vmScene.add(vmCamera);
  rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true });
  rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType;
  postMat = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, res: { value: new THREE.Vector2(4, 4) }, cNear: { value: 0.1 }, cFar: { value: 1500 },
      ink: { value: new THREE.Color(0x0b0b10) }, hurt: { value: 0 }, cloak: { value: 0 }, flash: { value: 0 }, down: { value: 0 }, edgeK: { value: 0.004 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `
      varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 res; uniform float cNear, cFar, hurt, cloak, flash, down, edgeK, time; uniform vec3 ink;
      float ld(vec2 uv){ float z=texture2D(tDepth,uv).x; float n=z*2.0-1.0; return (2.0*cNear*cFar)/(cFar+cNear-n*(cFar-cNear)); }
      void main(){
        vec2 px=1.0/res; vec3 col=texture2D(tColor,vUv).rgb; float d=ld(vUv); float w=1.0/d;
        float wl=1.0/ld(vUv-vec2(px.x,0.)), wr=1.0/ld(vUv+vec2(px.x,0.)), wu=1.0/ld(vUv+vec2(0.,px.y)), wd=1.0/ld(vUv-vec2(0.,px.y));
        float lap=max(abs(wl+wr-2.0*w),abs(wu+wd-2.0*w))/w;
        float edge=smoothstep(edgeK,edgeK*3.0,lap);
        edge*=1.0-smoothstep(300.0,800.0,d);
        col=mix(col,ink,edge*0.88);
        vec2 q=vUv-0.5; float r=length(q);
        col*=1.0-r*r*0.55;
        if(cloak>0.0){ float g=dot(col,vec3(0.3,0.59,0.11)); col=mix(col,vec3(g*0.6,g*0.9,g*1.2),cloak*0.7); col+=vec3(0.0,0.08,0.12)*cloak*sin(vUv.y*400.0+time*20.0); }
        if(down>0.0){ float g=dot(col,vec3(0.3,0.59,0.11)); col=mix(col,vec3(g,g*0.4,g*0.35),down*0.8); col*=1.0-smoothstep(0.2,0.7,r)*down; }
        col=mix(col,vec3(0.75,0.02,0.0),hurt*smoothstep(0.18,0.62,r));
        col+=flash;
        gl_FragColor=vec4(col,1.0);
      }`,
    depthTest: false, depthWrite: false
  });
  postScene = new THREE.Scene(); postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat); q.frustumCulled = false; postScene.add(q);
  onResize(); window.addEventListener('resize', onResize);
}
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio || 1, QUALITY[GFX.quality].pr);
  renderer.setPixelRatio(pr); renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix(); vmCamera.aspect = w / h; vmCamera.updateProjectionMatrix();
  const W = Math.floor(w * pr), H = Math.floor(h * pr);
  rt.setSize(W, H); postMat.uniforms.res.value.set(W, H);
}
function renderFrame(t) {
  postMat.uniforms.cNear.value = camera.near; postMat.uniforms.cFar.value = camera.far; postMat.uniforms.time.value = t;
  renderer.info.reset(); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera); GFX.calls = renderer.info.render.calls; GFX.tris = renderer.info.render.triangles;
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(postScene, postCam);
  renderer.clearDepth(); renderer.render(vmScene, vmCamera);
}

// ---------- Sky ----------
function makeSky(top, hor, bot, sunDir, sunCol, opts = {}) {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(top) }, hor: { value: new THREE.Color(hor) }, bot: { value: new THREE.Color(bot) }, sunDir: { value: sunDir.clone().normalize() }, sunCol: { value: new THREE.Color(sunCol) }, sunSize: { value: opts.sunSize || 1 }, sunVis: { value: 1 }, moonDir: { value: sunDir.clone().normalize().negate() }, moonVis: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top,hor,bot,sunCol,sunDir,moonDir; uniform float sunSize,sunVis,moonVis;
      void main(){ float h=vP.y; vec3 c= h>0.0 ? mix(hor,top,pow(clamp(h,0.,1.),0.55)) : mix(hor,bot,pow(clamp(-h*3.0,0.,1.),0.6));
        float s=max(dot(vP,sunDir),0.0); c+=sunCol*sunVis*(smoothstep(0.9985-0.0015*sunSize,0.9992-0.0012*sunSize,s)*1.2+pow(s,10.0)*0.22);
        float m=max(dot(vP,moonDir),0.0); c+=vec3(0.85,0.9,1.0)*moonVis*(smoothstep(0.9994,0.9997,m)*0.9+pow(m,40.0)*0.08);
        c=floor(c*24.0+0.5)/24.0; gl_FragColor=vec4(c,1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1300, 32, 16), mat); dome.renderOrder = -10; g.add(dome); g.userData.mat = mat;
  if (opts.planet) {
    const pg = new THREE.Group(); const pc = opts.planet;
    const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(150, 3), new THREE.MeshToonMaterial({ color: pc, gradientMap: gradTex, fog: false }));
    pg.add(pl);
    const ring = new THREE.Mesh(new THREE.RingGeometry(200, 290, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(pc).lerp(new THREE.Color(0xffffff), 0.35), side: THREE.DoubleSide, transparent: true, opacity: 0.55, fog: false }));
    ring.rotation.x = Math.PI / 2.4; ring.rotation.y = 0.3; pg.add(ring);
    const ang = opts.planetAng || 0.9; pg.position.set(Math.cos(ang) * 1000, opts.planetY || 330, Math.sin(ang) * 1000); pg.lookAt(0, 0, 0); g.add(pg);
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(38, 2), new THREE.MeshToonMaterial({ color: 0xdedad0, gradientMap: gradTex, fog: false }));
    moon.position.set(Math.cos(ang + 1.1) * 1050, (opts.planetY || 330) + 200, Math.sin(ang + 1.1) * 1050); g.add(moon);
  }
  if (opts.stars !== undefined) {
    const n = 600, pos = new Float32Array(n * 3); const r = mulberry32(7);
    for (let i = 0; i < n; i++) { const u = r() * 2 - 1, th = r() * TAU, y = Math.abs(u); const s = Math.sqrt(1 - y * y); pos[i * 3] = Math.cos(th) * s * 1200; pos[i * 3 + 1] = y * 1200; pos[i * 3 + 2] = Math.sin(th) * s * 1200; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const st = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: opts.stars })); g.add(st); g.userData.stars = st;
  }
  if (opts.clouds) {
    const cg = new THREE.IcosahedronGeometry(1, 0); const cm = new THREE.MeshToonMaterial({ color: opts.cloudCol || 0xffffff, gradientMap: gradTex, fog: false });
    const n = 16, inst = new THREE.InstancedMesh(cg, cm, n * 4); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(); const r = mulberry32(opts.seed || 3); let k = 0;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = 500 + r() * 500, y = 160 + r() * 140; const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
      for (let j = 0; j < 4; j++) { p.set(bx + (j - 1.5) * 40 + r() * 20, y + r() * 15, bz + r() * 30); sc.set(30 + r() * 30, 14 + r() * 10, 26 + r() * 20); q.setFromEuler(new THREE.Euler(0, r() * 3, 0)); m4.compose(p, q, sc); inst.setMatrixAt(k++, m4); }
    }
    g.add(inst);
  }
  return g;
}

// ---------- Canvas textures ----------
function windowTexture(lit, wall, frame, seed) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); const r = mulberry32(seed);
  x.fillStyle = wall; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if (i === 0 && j === 0) continue;
    const on = r() < 0.55; x.fillStyle = frame; x.fillRect(i * 16 + 2, j * 16 + 3, 12, 10);
    x.fillStyle = on ? lit : '#1a2230'; x.fillRect(i * 16 + 3, j * 16 + 4, 10, 8);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t;
}
function glowTexture(lit, seed) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); const r = mulberry32(seed);
  x.fillStyle = '#000'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { if (i === 0 && j === 0) continue; if (r() < 0.55) { x.fillStyle = lit; x.fillRect(i * 16 + 3, j * 16 + 4, 10, 8); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t;
}
function textTexture(text, fg, bg, w = 512, h = 128, font = 'Black Ops One') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  x.strokeStyle = fg; x.lineWidth = 6; if (bg) x.strokeRect(6, 6, w - 12, h - 12);
  let size = h * 0.55; x.font = `${size}px "${font}", Impact, sans-serif`;
  while (x.measureText(text).width > w * 0.88 && size > 10) { size -= 2; x.font = `${size}px "${font}", Impact, sans-serif`; }
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); return t;
}
