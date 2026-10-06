// GLSL shaders. Simplex noise: Ashima Arts / Stefan Gustavson (MIT license).
export const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float fbm(vec3 p, int oct){
  float a = 0.5, s = 0.0, n = 0.0;
  for(int i=0;i<8;i++){
    if(i>=oct) break;
    s += a*snoise(p); n += a; p = p*2.03 + vec3(1.7,9.2,3.1); a *= 0.5;
  }
  return s/n;
}
float ridged(vec3 p, int oct){
  float a = 0.5, s = 0.0, n = 0.0, prev = 1.0;
  for(int i=0;i<8;i++){
    if(i>=oct) break;
    float r = 1.0 - abs(snoise(p)); r *= r;
    s += a*r*prev; n += a; prev = r; p = p*2.1 + vec3(3.3,1.1,7.7); a *= 0.5;
  }
  return s/n;
}
vec3 hash33(vec3 p){
  p = fract(p*vec3(0.1031,0.1030,0.0973));
  p += dot(p, p.yxz+33.33);
  return fract((p.xxy+p.yxx)*p.zyx);
}
float craterField(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  float h = 0.0;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){
    vec3 o = vec3(float(x),float(y),float(z));
    vec3 r = hash33(i+o);
    if(r.z > 0.55) continue;
    vec3 c = o + r - f;
    float d = length(c);
    float size = mix(0.12, 0.5, r.x*r.x);
    float t = d/size;
    float bowl = t < 1.0 ? (t*t - 1.0) : 0.0;
    float rim = exp(-(t-1.0)*(t-1.0)*14.0);
    h += (bowl*0.9 + rim*0.45) * size;
  }
  return h;
}
`;

const LOGV_PARS = `#include <common>\n#include <logdepthbuf_pars_vertex>\n`;
const LOGF_PARS = `#include <logdepthbuf_pars_fragment>\n`;

export const PLANET_VS = /* glsl */ `
${LOGV_PARS}
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main(){
  vObj = normalize(position);
  vNormalV = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

export const PLANET_FS = /* glsl */ `
${LOGF_PARS}
uniform vec3 uLightDir;
uniform vec3 uStarColor;
uniform int uKind;
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4;
uniform float uSea; uniform vec3 uSeaCol; uniform vec3 uSeaCol2;
uniform float uIce; uniform float uClouds; uniform float uCraters; uniform float uRidged;
uniform vec3 uSeed; uniform vec3 uAtmo; uniform float uAtmoStr;
uniform float uBands; uniform float uTurb; uniform float uLava; uniform float uTime;
uniform float uRadius; uniform float uDetail;
varying vec3 vObj; varying vec3 vNormalV; varying vec3 vViewPos;
${NOISE}
vec3 ramp(float t){
  t = clamp(t, 0.0, 1.0) * 4.0;
  if(t < 1.0) return mix(uC0, uC1, t);
  if(t < 2.0) return mix(uC1, uC2, t-1.0);
  if(t < 3.0) return mix(uC2, uC3, t-2.0);
  return mix(uC3, uC4, t-3.0);
}
void main(){
  #include <logdepthbuf_fragment>
  vec3 p = normalize(vObj);
  vec3 N = normalize(vNormalV);
  vec3 Ng = N;
  vec3 V = normalize(-vViewPos);
  vec3 L = normalize(uLightDir);
  vec3 col; float h = 0.0; float spec = 0.0; vec3 emissive = vec3(0.0);
  int oct = int(uDetail);
  if(uKind == 1){
    // gas giant / banded
    float t = uTime * 0.004;
    vec3 w = vec3(snoise(p*2.2 + vec3(t,0.0,0.0) + uSeed), snoise(p*2.2 + vec3(0.0,t,5.2) + uSeed), snoise(p*2.2 + vec3(3.1,0.0,t) + uSeed));
    vec3 pp = p + w * 0.06 * uTurb;
    float fine = fbm(vec3(pp.x*1.2, pp.y*uBands*1.6, pp.z*1.2) + uSeed, oct);
    float lat = pp.y + fine * 0.06 * uTurb;
    float band = sin(lat * uBands * 3.14159 + uSeed.x) * 0.5 + 0.5;
    float band2 = sin(lat * uBands * 7.3 + uSeed.y) * 0.5 + 0.5;
    float v = mix(band, band2, 0.3) + fine * 0.35;
    // storm oval
    vec3 sc = normalize(vec3(cos(uSeed.z), sin(uSeed.x*0.1)*0.5, sin(uSeed.z)));
    float sd = length((p - sc) * vec3(1.0, 2.6, 1.0));
    float storm = smoothstep(0.16, 0.0, sd + fine*0.05);
    col = ramp(v);
    col = mix(col, uC4 * 1.15, storm * 0.8);
    h = fine * 0.002;
  } else {
    vec3 q = p * 2.2 + uSeed;
    float base = fbm(q, oct);
    float rid = ridged(q * 1.7, max(oct - 1, 1));
    h = base + (rid - 0.45) * uRidged * 0.8;
    float cr = 0.0;
    if(uCraters > 0.0){
      cr = craterField(p * 5.0 + uSeed) * 0.9 + craterField(p * 13.0 + uSeed.yzx) * 0.45;
      h += cr * uCraters;
    }
    float hn = h * 0.5 + 0.5;
    if(uSea > -1.5 && h < uSea){
      float depth = clamp((uSea - h) * 3.0, 0.0, 1.0);
      col = mix(uSeaCol2, uSeaCol, depth);
      spec = 0.6;
      h = uSea;
    } else {
      float landT = uSea > -1.5 ? (h - uSea) / (1.0 - uSea) : hn;
      landT += abs(p.y) * 0.25 * (uSea > -1.5 ? 1.0 : 0.0);
      col = ramp(landT + fbm(q*6.0, 2) * 0.12);
    }
    float capN = fbm(p*6.0 + uSeed, 3) * 0.06;
    if(abs(p.y) + capN > uIce){ col = mix(col, vec3(0.92,0.95,0.98), smoothstep(uIce, uIce + 0.04, abs(p.y) + capN)); spec = 0.1; }
    if(uLava > 0.0){
      float cracks = smoothstep(0.82, 0.95, rid);
      emissive = vec3(1.6, 0.45, 0.08) * cracks * uLava;
    }
    // screen-space bump from height
    float bumpH = h * uRadius * 0.012;
    vec3 dpdx = dFdx(vViewPos), dpdy = dFdy(vViewPos);
    float dhdx = dFdx(bumpH), dhdy = dFdy(bumpH);
    vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx);
    float det = dot(dpdx, r1);
    if(abs(det) > 1e-12){
      vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
      N = normalize(abs(det) * N - grad);
    }
  }
  float ndl = dot(N, L);
  float term = smoothstep(-0.12, 0.25, dot(Ng, L));
  float diff = max(ndl, 0.0) * 0.85 + 0.15 * term;
  diff *= term;
  vec3 lit = col * diff * uStarColor * 1.05;
  if(spec > 0.0){
    vec3 H = normalize(L + V);
    lit += uStarColor * pow(max(dot(Ng, H), 0.0), 70.0) * spec * term;
  }
  // clouds
  if(uClouds > 0.0){
    float t = uTime * 0.003;
    vec3 cq = p * 3.0 + uSeed * 1.3 + vec3(t, 0.0, -t);
    float cw = fbm(cq + vec3(fbm(cq*1.5, 3)), 5);
    float cl = smoothstep(0.05, 0.55, cw) * uClouds;
    vec3 cloudLit = vec3(0.9) * (max(dot(Ng, L), 0.0) * 0.9 + 0.1 * term) * term * uStarColor * 1.05;
    lit = mix(lit, cloudLit, cl);
  }
  // atmosphere rim tint
  float fres = pow(1.0 - max(dot(Ng, V), 0.0), 3.0);
  lit += uAtmo * fres * uAtmoStr * smoothstep(-0.25, 0.6, dot(Ng, L)) * 1.4;
  // ambient
  lit += col * 0.022;
  gl_FragColor = vec4(lit + emissive * (1.0 - term * 0.6), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const ATMO_VS = PLANET_VS;
export const ATMO_FS = /* glsl */ `
${LOGF_PARS}
uniform vec3 uLightDir; uniform vec3 uColor; uniform float uStr; uniform float uMuMax;
varying vec3 vObj; varying vec3 vNormalV; varying vec3 vViewPos;
void main(){
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(-vViewPos);
  float mu = abs(dot(N, V));
  float rim = pow(clamp(mu / uMuMax, 0.0, 1.0), 1.6);
  float lit = smoothstep(-0.35, 0.45, dot(N, normalize(uLightDir)));
  vec3 col = uColor * rim * lit * uStr;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const RING_VS = /* glsl */ `
${LOGV_PARS}
varying vec3 vLocal; varying vec3 vViewPos;
void main(){
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

export const RING_FS = /* glsl */ `
${LOGF_PARS}
uniform float uInner; uniform float uOuter; uniform vec3 uC1; uniform vec3 uC2; uniform float uSeed;
uniform vec3 uPlanetV; uniform float uPR; uniform vec3 uLightDir; uniform vec3 uNormalV; uniform vec3 uStarColor;
varying vec3 vLocal; varying vec3 vViewPos;
float h1(float n){ return fract(sin(n)*43758.5453123); }
float vn(float x){ float i = floor(x); float f = fract(x); f = f*f*(3.0-2.0*f); return mix(h1(i), h1(i+1.0), f); }
void main(){
  #include <logdepthbuf_fragment>
  float r = length(vLocal.xy);
  float t = (r - uInner) / (uOuter - uInner);
  if(t < 0.0 || t > 1.0) discard;
  float d = vn(t*40.0 + uSeed)*0.5 + vn(t*130.0 + uSeed*2.0)*0.3 + vn(t*420.0 + uSeed*3.0)*0.2;
  float gap = smoothstep(0.02, 0.05, abs(t - 0.62 - sin(uSeed)*0.08)) * smoothstep(0.005, 0.02, abs(t - 0.3));
  float a = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.9, t) * (0.25 + 0.75*d) * gap;
  vec3 col = mix(uC2, uC1, d);
  vec3 L = normalize(uLightDir);
  vec3 P = vViewPos; vec3 oc = P - uPlanetV;
  float b = dot(oc, L); float c = dot(oc, oc) - uPR*uPR; float hh = b*b - c;
  float shadow = (hh > 0.0 && b < 0.0) ? 0.05 : 1.0;
  float lit = 0.35 + 0.65 * abs(dot(normalize(uNormalV), L));
  vec3 outc = col * lit * shadow * uStarColor * 1.1;
  gl_FragColor = vec4(outc * a, a * 0.92);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const STAR_VS = PLANET_VS;
export const STAR_FS = /* glsl */ `
${LOGF_PARS}
uniform vec3 uColor; uniform float uTime; uniform float uIntensity;
varying vec3 vObj; varying vec3 vNormalV; varying vec3 vViewPos;
${NOISE}
void main(){
  #include <logdepthbuf_fragment>
  vec3 p = normalize(vObj);
  vec3 N = normalize(vNormalV); vec3 V = normalize(-vViewPos);
  float mu = max(dot(N, V), 0.0);
  float t = uTime * 0.02;
  float g = fbm(p * 9.0 + vec3(t, -t, t*0.5), 4);
  float g2 = fbm(p * 30.0 - vec3(t*2.0), 3);
  float spots = smoothstep(0.45, 0.7, fbm(p*3.0 + vec3(0.0, t*0.3, 0.0), 3));
  float limb = pow(mu, 0.45);
  vec3 base = pow(uColor, vec3(1.7));
  vec3 hot = mix(base, vec3(1.0), 0.22);
  vec3 col = mix(base * 0.8, hot, 0.5 + 0.35*g + 0.15*g2);
  col *= (1.0 - spots * 0.45);
  col *= (0.35 + 0.65*limb) * uIntensity;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const JET_VS = /* glsl */ `
${LOGV_PARS}
varying vec2 vUv; varying vec3 vViewPos;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

export const JET_FS = /* glsl */ `
${LOGF_PARS}
uniform vec3 uColor; uniform float uTime;
varying vec2 vUv; varying vec3 vViewPos;
${NOISE}
void main(){
  #include <logdepthbuf_fragment>
  float along = vUv.y; // 0 at tip, 1 at base for cone geometry
  float n = snoise(vec3(cos(vUv.x*6.2831)*1.5, sin(vUv.x*6.2831)*1.5, along*2.5 - uTime*0.8))*0.5+0.5;
  float fade = pow(along, 2.6);
  vec3 col = uColor * fade * (0.45 + 0.7*n) * 1.5;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const SKY_FS = /* glsl */ `
varying vec3 vDir;
uniform vec3 uGalN; uniform vec3 uCore; uniform float uSeed;
${NOISE}
void main(){
  vec3 d = normalize(vDir);
  float lat = dot(d, uGalN);
  float band = exp(-lat*lat / 0.018);
  float wide = exp(-lat*lat / 0.12);
  float coreAng = max(dot(d, uCore), 0.0);
  float bulge = pow(coreAng, 6.0);
  float n = fbm(d * 3.0 + uSeed, 6) * 0.5 + 0.5;
  float n2 = fbm(d * 9.0 + uSeed*2.0, 5) * 0.5 + 0.5;
  float dust = smoothstep(0.45, 0.75, fbm(d * 5.0 + vec3(uSeed, 1.0, 2.0), 5) * 0.5 + 0.5);
  vec3 warm = vec3(1.0, 0.78, 0.55);
  vec3 cool = vec3(0.55, 0.65, 1.0);
  vec3 col = mix(cool, warm, bulge * 0.8 + 0.2) * (band * (0.35 + 0.65*n2) + wide * 0.18 * n) * (1.0 + bulge * 3.0);
  col *= (1.0 - dust * band * 0.85);
  // nebula patches
  float neb = smoothstep(0.62, 0.9, fbm(d * 1.7 + vec3(7.0, uSeed, 3.0), 5) * 0.5 + 0.5);
  float neb2 = smoothstep(0.64, 0.92, fbm(d * 2.1 + vec3(uSeed, 11.0, 5.0), 5) * 0.5 + 0.5);
  col += vec3(0.75, 0.22, 0.32) * neb * 0.22 * (0.5 + n2);
  col += vec3(0.18, 0.4, 0.75) * neb2 * 0.18 * (0.5 + n);
  col *= 0.11;
  col += vec3(0.002, 0.003, 0.006);
  gl_FragColor = vec4(col, 1.0);
}`;

export const TUNNEL_VS = /* glsl */ `
${LOGV_PARS}
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

export const TUNNEL_FS = /* glsl */ `
${LOGF_PARS}
uniform float uTime; uniform vec3 uColor; uniform float uFade;
varying vec2 vUv;
${NOISE}
void main(){
  #include <logdepthbuf_fragment>
  float ang = vUv.x * 6.2831853;
  float z = vUv.y;
  vec3 q = vec3(cos(ang)*2.0, sin(ang)*2.0, z*14.0 - uTime*6.0);
  float n = fbm(q, 4) * 0.5 + 0.5;
  float streak = pow(snoise(vec3(vUv.x*60.0, z*2.0 - uTime*3.0, 0.0))*0.5+0.5, 6.0);
  float swirl = sin(ang*3.0 + z*20.0 - uTime*4.0)*0.5+0.5;
  float endFade = smoothstep(0.0, 0.25, z) * smoothstep(1.0, 0.7, z);
  vec3 col = uColor * (n*n*0.75 + swirl*0.06) + vec3(0.55,0.65,0.9) * streak * 0.9;
  col *= endFade * uFade * 0.8;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
