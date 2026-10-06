// Scene construction for star systems, skybox, station, effects
import * as THREE from 'three';
import { PLANET_VS, PLANET_FS, ATMO_FS, RING_VS, RING_FS, STAR_FS, JET_VS, JET_FS, SKY_VS, SKY_FS, TUNNEL_VS, TUNNEL_FS } from './shaders.js';
import { RNG } from './rng.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function radialTexture(stops, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flareTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.04, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.12, 'rgba(255,255,255,0.25)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.05)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  // spikes
  g.globalCompositeOperation = 'lighter';
  for (const [ang, len, w] of [[0, 1, 3], [Math.PI / 2, 1, 3], [Math.PI / 4, 0.45, 1.5], [-Math.PI / 4, 0.45, 1.5]]) {
    g.save();
    g.translate(h, h);
    g.rotate(ang);
    const lg = g.createLinearGradient(-h * len, 0, h * len, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(-h * len, -w, h * 2 * len, w * 2);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 1024, 64);
  const r = new RNG(777);
  for (let row = 0; row < 4; row++) {
    for (let x = 0; x < 1024; x += 6) {
      if (r.chance(0.55)) {
        const warm = r.chance(0.8);
        g.fillStyle = warm ? `rgba(255,${180 + r.int(0, 60)},${110 + r.int(0, 60)},${0.5 + r.next() * 0.5})` : 'rgba(160,220,255,0.9)';
        g.fillRect(x, 10 + row * 12, 3, 5);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function panelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = new RNG(99);
  g.fillStyle = '#8a8f96';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) {
    const v = 110 + r.int(0, 50);
    g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    g.fillRect(r.int(0, 256), r.int(0, 256), r.int(8, 60), r.int(4, 30));
  }
  g.strokeStyle = 'rgba(30,30,35,0.6)';
  for (let i = 0; i < 256; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class World {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;
    this.sphereHi = new THREE.SphereGeometry(1, 160, 110);
    this.sphereLo = new THREE.SphereGeometry(1, 72, 48);
    this.glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.15, 'rgba(255,255,255,0.55)'], [0.35, 'rgba(255,255,255,0.14)'], [0.7, 'rgba(255,255,255,0.03)'], [1, 'rgba(255,255,255,0)']]);
    this.dotTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']], 64);
    this.flareTex = flareTexture();
    this.planets = [];
    this.starLight = new THREE.PointLight(0xffffff, 2.2, 0, 0);
    scene.add(this.starLight);
    this.ambient = new THREE.AmbientLight(0x8090a0, 0.12);
    scene.add(this.ambient);
    this.buildSky();
    this.buildDust();
    this.buildTunnel();
    this.stationProto = this.buildStation();
  }

  buildSky() {
    // milky way + nebula into a cubemap (rendered once)
    const skyScene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
      uniforms: { uGalN: { value: new THREE.Vector3(0.18, 0.95, 0.25).normalize() }, uCore: { value: new THREE.Vector3(0.85, -0.05, -0.5).normalize() }, uSeed: { value: 3.7 } },
    });
    skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), mat));
    const isMobile = matchMedia('(pointer: coarse)').matches;
    const rt = new THREE.WebGLCubeRenderTarget(isMobile ? 512 : 1024, { type: THREE.HalfFloatType, generateMipmaps: false });
    const cc = new THREE.CubeCamera(1, 1000, rt);
    const prevTM = this.renderer.toneMapping;
    cc.update(this.renderer, skyScene);
    this.renderer.toneMapping = prevTM;
    this.scene.background = rt.texture;
    this.galN = mat.uniforms.uGalN.value.clone();
    this.galCore = mat.uniforms.uCore.value.clone();
    mat.dispose();

    // star points
    this.skyGroup = new THREE.Group();
    this.scene.add(this.skyGroup);
    const r = new RNG(12345);
    const makeStars = (count, size, bright, bandBias) => {
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const R = 4e8;
      const n = this.galN;
      for (let i = 0; i < count; i++) {
        let v;
        for (;;) {
          v = new THREE.Vector3(r.gauss(), r.gauss(), r.gauss()).normalize();
          const lat = Math.abs(v.dot(n));
          if (!bandBias || r.next() < Math.exp(-lat * lat / 0.03) + 0.15) break;
        }
        pos[i * 3] = v.x * R; pos[i * 3 + 1] = v.y * R; pos[i * 3 + 2] = v.z * R;
        const t = r.next();
        const c = t < 0.15 ? [0.7, 0.8, 1.0] : t < 0.6 ? [1, 0.97, 0.92] : t < 0.85 ? [1, 0.85, 0.65] : [1, 0.65, 0.5];
        const b = bright * (0.35 + r.next() * 0.65);
        col[i * 3] = c[0] * b; col[i * 3 + 1] = c[1] * b; col[i * 3 + 2] = c[2] * b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, map: this.dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      p.renderOrder = -10;
      return p;
    };
    this.skyGroup.add(makeStars(9000, 2.2, 0.55, true));
    this.skyGroup.add(makeStars(2500, 3.2, 1.0, false));
    this.skyGroup.add(makeStars(250, 5.0, 1.6, false));
  }

  buildDust() {
    const N = 260;
    this.dustN = N;
    this.dustBox = 0.18; // km
    this.dustP = new Float32Array(N * 3);
    const r = new RNG(5);
    for (let i = 0; i < N * 3; i++) this.dustP[i] = r.range(-this.dustBox, this.dustBox);
    const g = new THREE.BufferGeometry();
    this.dustPos = new Float32Array(N * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    this.dust = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8a8070, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  updateDust(camPos, delta, vel, mode) {
    const B = this.dustBox;
    const P = this.dustP;
    let streak = 0.06;
    let vx = vel.x, vy = vel.y, vz = vel.z;
    let dx = delta.x, dy = delta.y, dz = delta.z;
    const sp = Math.hypot(vx, vy, vz);
    if (mode === 'sc') {
      // fake slower particles in supercruise
      const s = sp > 0 ? Math.min(0.7, 0.25 + Math.log10(1 + sp) * 0.08) / sp : 0;
      vx *= s; vy *= s; vz *= s;
      const dl = Math.hypot(dx, dy, dz);
      const k = dl > 0 ? (Math.hypot(vx, vy, vz) * (dl / Math.max(sp, 1e-6))) / dl : 0;
      dx *= k; dy *= k; dz *= k;
      streak = 0.035;
    }
    for (let i = 0; i < this.dustN; i++) {
      let x = P[i * 3] - dx, y = P[i * 3 + 1] - dy, z = P[i * 3 + 2] - dz;
      if (x < -B) x += 2 * B; else if (x > B) x -= 2 * B;
      if (y < -B) y += 2 * B; else if (y > B) y -= 2 * B;
      if (z < -B) z += 2 * B; else if (z > B) z -= 2 * B;
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
      const o = i * 6;
      this.dustPos[o] = x; this.dustPos[o + 1] = y; this.dustPos[o + 2] = z;
      this.dustPos[o + 3] = x - vx * streak - 0.0004; this.dustPos[o + 4] = y - vy * streak; this.dustPos[o + 5] = z - vz * streak;
    }
    this.dust.position.copy(camPos);
    this.dust.geometry.attributes.position.needsUpdate = true;
    const a = Math.min(1, sp / 0.05);
    this.dust.material.opacity = mode === 'sc' ? 0.25 : 0.15 + 0.4 * a;
  }

  buildTunnel() {
    this.tunnelScene = new THREE.Scene();
    this.tunnelScene.background = new THREE.Color(0x000000);
    const geo = new THREE.CylinderGeometry(40, 40, 3000, 64, 1, true);
    geo.rotateX(Math.PI / 2);
    this.tunnelMat = new THREE.ShaderMaterial({
      vertexShader: TUNNEL_VS, fragmentShader: TUNNEL_FS, side: THREE.BackSide, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0.3, 0.45, 1.0) }, uFade: { value: 1 } },
    });
    this.tunnel = new THREE.Mesh(geo, this.tunnelMat);
    this.tunnel.frustumCulled = false;
    this.tunnelScene.add(this.tunnel);
    // streak stars
    const N = 600;
    const pos = new Float32Array(N * 6);
    const r = new RNG(42);
    this.tunnelStars = [];
    for (let i = 0; i < N; i++) {
      const a = r.range(0, Math.PI * 2), rad = r.range(4, 36);
      this.tunnelStars.push([Math.cos(a) * rad, Math.sin(a) * rad, r.range(-1500, 0)]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.tunnelLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9fb8e8, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }));
    this.tunnelLines.frustumCulled = false;
    this.tunnelScene.add(this.tunnelLines);
    this.tunnelCam = new THREE.PerspectiveCamera(75, 1, 0.1, 5000);
    this.tunnelScene.add(this.tunnelCam);
  }

  updateTunnel(dt, t, color, fade, quat) {
    this.tunnelMat.uniforms.uTime.value = t;
    this.tunnelMat.uniforms.uColor.value.copy(color);
    this.tunnelMat.uniforms.uFade.value = fade;
    const p = this.tunnelLines.geometry.attributes.position.array;
    const speed = 900;
    for (let i = 0; i < this.tunnelStars.length; i++) {
      const s = this.tunnelStars[i];
      s[2] += speed * dt;
      if (s[2] > 5) s[2] -= 1500;
      const o = i * 6;
      p[o] = s[0]; p[o + 1] = s[1]; p[o + 2] = s[2];
      p[o + 3] = s[0]; p[o + 4] = s[1]; p[o + 5] = s[2] - 60;
    }
    this.tunnelLines.geometry.attributes.position.needsUpdate = true;
    this.tunnelLines.material.opacity = fade * 0.6;
    this.tunnelCam.quaternion.copy(quat);
    // tunnel geometry aligned with camera forward
    this.tunnel.quaternion.copy(quat);
    this.tunnelLines.quaternion.copy(quat);
    this.tunnel.rotateZ(t * 0.6);
  }

  buildStation() {
    const g = new THREE.Group();
    const tex = panelTexture();
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8bec6, map: tex, metalness: 0.55, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.7, roughness: 0.4 });
    const winTex = windowTexture();
    winTex.repeat.set(3, 1);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xc4c8ce, map: tex, metalness: 0.5, roughness: 0.55, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 2.2 });
    // hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.7, 32, 1), metal);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
    // front cap (docking face)
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.18, 32), metal);
    face.rotation.x = Math.PI / 2;
    face.position.z = 0.94;
    g.add(face);
    // slot
    const slotW = 0.34, slotH = 0.11;
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(slotW, slotH), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    slot.position.z = 1.035;
    g.add(slot);
    const glowGreen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.5, 0.6) });
    const glowRed = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.25, 0.15) });
    const glowWhite = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.6) });
    const bar = (w, h, mat, x, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, 1.037); g.add(m); };
    bar(slotW + 0.03, 0.012, glowWhite, 0, slotH / 2 + 0.008);
    bar(slotW + 0.03, 0.012, glowWhite, 0, -slotH / 2 - 0.008);
    bar(0.012, slotH, glowGreen, -slotW / 2 - 0.008, 0);
    bar(0.012, slotH, glowRed, slotW / 2 + 0.008, 0);
    // approach light rings
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), i % 2 ? glowGreen : glowWhite);
      l.position.set(Math.cos(a) * 0.38, Math.sin(a) * 0.38, 1.04);
      g.add(l);
    }
    // ring habitat
    const torus = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.13, 24, 128), ringMat);
    g.add(torus);
    const torus2 = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 12, 128), dark);
    torus2.position.z = -0.2;
    g.add(torus2);
    // spokes
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 10), metal);
      const a = (i / 4) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0);
      s.rotation.z = a - Math.PI / 2;
      g.add(s);
    }
    // rear structures
    const rear = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 0.5, 6), dark);
    rear.rotation.x = Math.PI / 2;
    rear.position.z = -1.05;
    g.add(rear);
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.01, 0.32), new THREE.MeshStandardMaterial({ color: 0x1b2a4a, metalness: 0.8, roughness: 0.25, emissive: 0x050a18 }));
      const a = (i / 3) * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.75, Math.sin(a) * 0.75, -1.15);
      p.rotation.z = a;
      g.add(p);
    }
    // blinking beacons
    this.beacons = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.2) }));
      b.position.set(Math.cos(a) * 1.25, Math.sin(a) * 1.25, 0.14);
      g.add(b);
      this.beacons.push(b);
    }
    return g;
  }

  clear() {
    for (const p of this.planets) {
      p.mats.forEach((m) => m.dispose());
    }
    this.planets = [];
    this.group.clear();
    this.star = null;
    this.station = null;
  }

  load(sys) {
    this.clear();
    this.sys = sys;
    const st = sys.star;
    const scol = new THREE.Color(...st.col);
    this.starColor = scol;
    // star light tint (brighter for planets)
    this.starLightCol = new THREE.Color().copy(scol).lerp(new THREE.Color(1, 1, 1), 0.55);
    this.starLight.color.copy(this.starLightCol);
    this.starLight.position.set(0, 0, 0);
    // star
    const starGroup = new THREE.Group();
    const smat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VS, fragmentShader: STAR_FS,
      uniforms: { uColor: { value: scol.clone() }, uTime: { value: 0 }, uIntensity: { value: st.cls === 'N' || st.cls === 'D' ? 6 : st.cls === 'L' || st.cls === 'T' ? 1.3 : 1.3 } },
    });
    const sm = new THREE.Mesh(this.sphereHi, smat);
    sm.scale.setScalar(st.radius);
    starGroup.add(sm);
    const compact = st.cls === 'N' || st.cls === 'D';
    const glowScale = compact ? (st.cls === 'N' ? 90000 : st.radius * 30) : st.radius * 6.5;
    const glowCol = scol.clone().multiplyScalar(compact ? 2.4 : 1.0);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: glowCol, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(glowScale);
    starGroup.add(glow);
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: scol.clone().multiplyScalar(0.22), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    corona.scale.setScalar(glowScale * 3.5);
    starGroup.add(corona);
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flareTex, color: scol.clone().lerp(new THREE.Color(1, 1, 1), 0.4).multiplyScalar(1.6), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, sizeAttenuation: false }));
    glare.scale.setScalar(0.12);
    starGroup.add(glare);
    this.group.add(starGroup);
    this.star = { group: starGroup, mesh: sm, mat: smat, glare, glow, corona, data: st };
    // jets
    this.jets = null;
    if (st.jets) {
      const len = st.cls === 'N' ? 380000 : st.radius * 45;
      const rad = len * 0.07;
      const jg = new THREE.ConeGeometry(rad, len, 48, 24, true);
      jg.translate(0, -len / 2, 0);
      const jmat = new THREE.ShaderMaterial({
        vertexShader: JET_VS, fragmentShader: JET_FS, side: THREE.DoubleSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(0.45, 0.65, 1.0) }, uTime: { value: 0 } },
      });
      const axis = new THREE.Vector3(...st.jetAxis);
      const j1 = new THREE.Mesh(jg, jmat);
      j1.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis);
      const j2 = new THREE.Mesh(jg, jmat);
      j2.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis.clone().negate());
      const jgGroup = new THREE.Group();
      jgGroup.add(j1, j2);
      this.group.add(jgGroup);
      this.jets = { group: jgGroup, mat: jmat, len, rad, axis };
    }
    // planets
    for (const b of sys.bodies) this.addBody(b);
    // station
    if (sys.station) {
      const s = this.stationProto.clone();
      const pivot = new THREE.Group();
      pivot.position.set(...sys.station.pos);
      pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...sys.station.axis));
      pivot.add(s);
      this.group.add(pivot);
      this.station = { pivot, mesh: s, data: sys.station, beacons: s.children.filter((c) => c.geometry && c.geometry.parameters && c.geometry.parameters.radius === 0.02) };
    }
  }

  addBody(b) {
    const L = b.look;
    const pal = L.pal.map((c) => new THREE.Color(...c));
    const isGG = L.kind === 1;
    const uniforms = {
      uLightDir: { value: new THREE.Vector3(1, 0, 0) },
      uStarColor: { value: this.starLightCol.clone() },
      uKind: { value: L.kind },
      uC0: { value: pal[0] }, uC1: { value: pal[1] }, uC2: { value: pal[2] }, uC3: { value: pal[3] }, uC4: { value: pal[4] },
      uSea: { value: L.sea }, uSeaCol: { value: new THREE.Color(...(L.seaCol || [0, 0, 0.2])) }, uSeaCol2: { value: new THREE.Color(...(L.seaCol2 || [0, 0.1, 0.3])) },
      uIce: { value: L.ice }, uClouds: { value: L.clouds }, uCraters: { value: L.craters }, uRidged: { value: L.ridged || 0 },
      uSeed: { value: new THREE.Vector3(...b.seed).multiplyScalar(0.1) },
      uAtmo: { value: new THREE.Color(...(L.atmo || [0, 0, 0])) }, uAtmoStr: { value: L.atmoStr || 0 },
      uBands: { value: L.bands || 0 }, uTurb: { value: L.turb || 0 }, uLava: { value: L.lava || 0 }, uTime: { value: 0 },
      uRadius: { value: b.radius }, uDetail: { value: 6 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: PLANET_VS, fragmentShader: PLANET_FS, uniforms, extensions: { derivatives: true } });
    const tiltG = new THREE.Group();
    tiltG.position.set(...b.pos);
    tiltG.rotation.z = b.tilt;
    tiltG.rotation.x = b.tilt * 0.4;
    const mesh = new THREE.Mesh(b.kind === 'moon' ? this.sphereLo : this.sphereHi, mat);
    mesh.scale.setScalar(b.radius);
    tiltG.add(mesh);
    const mats = [mat];
    let atmo = null;
    if (L.atmo && L.atmoStr > 0) {
      const k = isGG ? 1.045 : 1.03;
      const amat = new THREE.ShaderMaterial({
        vertexShader: PLANET_VS, fragmentShader: ATMO_FS, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uLightDir: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(...L.atmo) }, uStr: { value: 1.3 * L.atmoStr + 0.3 }, uMuMax: { value: Math.sqrt(1 - 1 / (k * k)) } },
      });
      atmo = new THREE.Mesh(this.sphereLo, amat);
      atmo.scale.setScalar(b.radius * k);
      tiltG.add(atmo);
      mats.push(amat);
    }
    let ring = null;
    if (b.rings) {
      const rg = new THREE.RingGeometry(b.rings.inner, b.rings.outer, 256, 1);
      const rmat = new THREE.ShaderMaterial({
        vertexShader: RING_VS, fragmentShader: RING_FS, side: THREE.DoubleSide, transparent: true, depthWrite: false,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: {
          uInner: { value: b.rings.inner }, uOuter: { value: b.rings.outer }, uC1: { value: new THREE.Color(...b.rings.c1) }, uC2: { value: new THREE.Color(...b.rings.c2) },
          uSeed: { value: b.rings.seed }, uPlanetV: { value: new THREE.Vector3() }, uPR: { value: b.radius }, uLightDir: { value: new THREE.Vector3() },
          uNormalV: { value: new THREE.Vector3() }, uStarColor: { value: this.starLightCol.clone() },
        },
      });
      ring = new THREE.Mesh(rg, rmat);
      ring.rotation.x = -Math.PI / 2;
      tiltG.add(ring);
      mats.push(rmat);
    }
    // distant dot
    const avg = pal[2].clone().lerp(pal[3], 0.5);
    if (L.sea > -1.5 && L.sea > 0.3) avg.setRGB(0.35, 0.55, 0.9);
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dotTex, color: avg.multiplyScalar(1.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: false }));
    dot.scale.setScalar(0.007);
    dot.position.set(...b.pos);
    this.group.add(dot);
    mats.push(dot.material);
    this.group.add(tiltG);
    this.planets.push({ data: b, group: tiltG, mesh, mat, atmo, ring, dot, mats, pos: new THREE.Vector3(...b.pos) });
  }

  update(dt, camera, quality) {
    this.time += dt;
    const t = this.time;
    camera.updateMatrixWorld();
    const viewInv = camera.matrixWorldInverse;
    this.skyGroup.position.copy(camera.position);
    if (this.star) {
      this.star.mat.uniforms.uTime.value = t;
      const d = camera.position.length();
      const ang = this.star.data.radius / Math.max(d, 1);
      // glare fades when star is large on screen
      this.star.glare.material.opacity = THREE.MathUtils.clamp(1.3 - ang * 30, 0, 1.0);
      this.star.glare.visible = this.star.glare.material.opacity > 0.01;
      const compact = this.star.data.cls === 'N' || this.star.data.cls === 'D';
      this.star.glare.scale.setScalar(compact ? 0.16 : 0.1 + Math.min(0.05, ang * 2));
      const gk = THREE.MathUtils.clamp(1.15 - ang * 6, 0.08, 1);
      this.star.glow.material.opacity = gk;
      this.star.corona.material.opacity = gk;
      this.starAng = ang;
      this.star.mesh.rotation.y = t * 0.002;
    }
    if (this.jets) {
      this.jets.mat.uniforms.uTime.value = t;
      this.jets.group.rotation.set(0, 0, 0);
    }
    const detail = quality === 'low' ? 4 : quality === 'med' ? 5 : 6;
    for (const p of this.planets) {
      const lightW = _v.copy(p.pos).negate().normalize();
      const lightV = _v2.copy(lightW).transformDirection(viewInv);
      p.mat.uniforms.uLightDir.value.copy(lightV);
      p.mat.uniforms.uTime.value = t;
      p.mat.uniforms.uDetail.value = detail;
      p.mesh.rotation.y += p.data.rotSpeed * dt * 0.2;
      if (p.atmo) p.atmo.material.uniforms.uLightDir.value.copy(lightV);
      if (p.ring) {
        const u = p.ring.material.uniforms;
        u.uLightDir.value.copy(lightV);
        u.uPlanetV.value.copy(p.pos).applyMatrix4(viewInv);
        u.uNormalV.value.set(0, 1, 0).applyQuaternion(p.group.quaternion).transformDirection(viewInv);
      }
      // distant dot visibility
      const dist = camera.position.distanceTo(p.pos);
      const angR = p.data.radius / Math.max(dist, 1);
      p.dot.material.opacity = THREE.MathUtils.clamp(1 - (angR - 0.0015) / 0.002, 0, 1) * 0.9;
      p.dot.visible = p.dot.material.opacity > 0.01;
    }
    if (this.station) {
      this.station.mesh.rotation.z += dt * 0.09;
      const on = Math.sin(t * 3) > 0.6;
      for (const b of this.station.beacons) b.visible = on;
    }
  }

  stationSlotWorld(out, depth = 1.05) {
    // slot center in world coords at given local z
    const s = this.station;
    out.set(0, 0, depth).applyQuaternion(s.pivot.quaternion).add(s.pivot.position);
    return out;
  }
}
