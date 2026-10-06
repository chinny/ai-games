// Cockpit HUD: canvas overlay (brackets, radar, compass, gauges) + DOM panels
import * as THREE from 'three';
import { LS, C_KMS } from './galaxy.js';

export const COL = {
  or: '#ff8a1e', orA: (a) => `rgba(255,138,30,${a})`, hi: '#ffd9a8', blue: '#58b6ff', blueA: (a) => `rgba(88,182,255,${a})`,
  red: '#ff4a36', redA: (a) => `rgba(255,74,54,${a})`, white: '#fff3e2', green: '#7dffb0',
};

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _d = new THREE.Vector3();

export function fmtDist(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 1000) return `${km.toFixed(km < 10 ? 2 : 1)} km`;
  if (km < 0.5 * LS) return `${(km / 1000).toFixed(km < 1e5 ? 1 : 0)} Mm`;
  const ls = km / LS;
  if (ls < 100) return `${ls.toFixed(2)} Ls`;
  return `${Math.round(ls).toLocaleString()} Ls`;
}
export function fmtSpeed(kms) {
  if (kms < 1) return `${Math.round(kms * 1000)} m/s`;
  if (kms < 1000) return `${Math.round(kms)} km/s`;
  if (kms < C_KMS * 0.95) return `${(kms / 1000).toFixed(0)} Mm/s`;
  const c = kms / C_KMS;
  return `${c < 10 ? c.toFixed(2) : c < 100 ? c.toFixed(1) : Math.round(c)} c`;
}
export function fmtCr(n) { return Math.round(n).toLocaleString('en-US') + ' CR'; }
export function fmtTime(s) {
  if (!isFinite(s) || s > 359999) return '--:--';
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60), r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export class Hud {
  constructor(game, canvas) {
    this.g = game;
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.domT = 0;
    this.el = (id) => document.getElementById(id);
    this.comms = [];
    this.centerMsg = null;
    this.flash = 0;
    this.pulses = [];
  }

  resize(w, h) {
    const cs = getComputedStyle(document.documentElement);
    const px = (v) => parseFloat(cs.getPropertyValue(v)) || 0;
    this.safeL = px('--sal'); this.safeR = px('--sar'); this.safeB = px('--sab');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
    this.w = w;
    this.h = h;
  }

  layout() {
    const { w, h } = this;
    const touch = this.g.touchMode;
    const portrait = h > w;
    const s = Math.max(0.6, Math.min(1.2, Math.min(w, h * 1.7) / 1050));
    const L = { s, cx: w / 2, rx: 150 * s, ry: 56 * s, touch, portrait };
    if (touch) {
      const sl = (this.safeL || 0), sb = (this.safeB || 0);
      if (portrait) {
        L.rx = Math.min(110, w * 0.27);
        L.cy = h - 270 - sb;
        L.gx = 50 + sl; L.gy = L.cy + L.rx * 0.38 + 16;
      } else {
        const stickR = 154 + sl, btnL = w - 316 - (this.safeR || 0);
        L.rx = Math.max(70, Math.min(118, (btnL - stickR - 170) / 2));
        L.cx = stickR + 66 + L.rx;
        L.cy = h - 58 - sb;
        L.gx = L.cx + L.rx + 44; L.gy = L.cy + 21;
      }
      L.ry = L.rx * 0.38;
    } else {
      L.cy = h - 92 * s;
    }
    return L;
  }

  // project world position into screen space
  project(pos, out = {}) {
    const cam = this.g.camera;
    _p.copy(pos).applyMatrix4(cam.matrixWorldInverse);
    out.behind = _p.z > 0;
    out.dist = _p.length();
    const v = _p.clone().applyMatrix4(cam.projectionMatrix);
    out.x = (v.x * 0.5 + 0.5) * this.w;
    out.y = (-v.y * 0.5 + 0.5) * this.h;
    out.vx = _p.x; out.vy = _p.y; out.vz = _p.z;
    out.on = !out.behind && out.x > 0 && out.x < this.w && out.y > 0 && out.y < this.h;
    return out;
  }

  // pixel radius of a sphere
  pxRadius(radius, dist) {
    const cam = this.g.camera;
    const f = 1 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    return (Math.atan(radius / Math.max(dist, 1e-6)) * f * this.h) / 2;
  }

  draw(dt) {
    const g = this.g;
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    if (g.state !== 'flight' && g.state !== 'docking') {
      this.updateDom(dt, true);
      return;
    }
    const L = this.layout();
    c.lineJoin = 'round';
    this.drawMarkers(c, L);
    this.drawReticle(c, L);
    this.drawHyperMarker(c, L);
    this.drawTarget(c, L);
    this.drawPulses(c, dt);
    this.drawRadar(c, L);
    this.drawCompass(c, L);
    this.drawGauges(c, L);
    if (g.input.locked || (g.input.drag && g.input.drag.moved)) this.drawMouseWidget(c, L);
    this.updateDom(dt, false);
  }

  text(c, str, x, y, size = 12, color = COL.or, align = 'left', weight = 600, font = 'Rajdhani') {
    c.font = `${weight} ${size}px ${font}, "Arial Narrow", sans-serif`;
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(str, x, y);
  }

  drawReticle(c, L) {
    const x = this.w / 2, y = this.h / 2;
    c.strokeStyle = COL.orA(0.75);
    c.lineWidth = 1.5;
    const r = 9;
    c.beginPath();
    c.moveTo(x - r - 8, y); c.lineTo(x - r, y);
    c.moveTo(x + r, y); c.lineTo(x + r + 8, y);
    c.moveTo(x, y - r - 8); c.lineTo(x, y - r);
    c.moveTo(x, y + r); c.lineTo(x, y + r + 4);
    c.stroke();
    c.beginPath();
    c.arc(x, y, 1.6, 0, Math.PI * 2);
    c.fillStyle = COL.orA(0.9);
    c.fill();
    // FSD charge ring
    const f = this.g.ship.fsd;
    if (f) {
      const p = Math.min(1, f.t / f.dur);
      c.strokeStyle = f.kind === 'hyper' ? COL.blue : COL.or;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(x, y, 34, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      c.stroke();
    }
    // honk charge
    const hk = this.g.honk;
    if (hk && hk.charging) {
      const p = Math.min(1, hk.t / hk.dur);
      c.strokeStyle = COL.white;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, 46, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      c.stroke();
    }
  }

  drawMouseWidget(c) {
    const x = this.w / 2, y = this.h / 2;
    const R = 70;
    const st = this.g.input.stick;
    c.strokeStyle = COL.orA(0.22);
    c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(x, y, R * 0.06, 0, Math.PI * 2); c.stroke();
    c.fillStyle = COL.orA(0.85);
    c.beginPath(); c.arc(x + st.x * R, y + st.y * R, 3.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = COL.orA(0.4);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + st.x * R, y + st.y * R); c.stroke();
  }

  edgeArrow(c, pr, color, label) {
    // clamp to ellipse inside screen
    const cx = this.w / 2, cy = this.h / 2;
    let dx = pr.vx, dy = -pr.vy;
    if (!pr.behind) { dx = pr.x - cx; dy = pr.y - cy; }
    const a = Math.atan2(dy, dx);
    const rx = this.w / 2 - 40, ry = this.h / 2 - 40;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(12, 0); c.lineTo(-6, -8); c.lineTo(-2, 0); c.lineTo(-6, 8);
    c.closePath();
    c.fill();
    c.restore();
    if (label) this.text(c, label, x - Math.cos(a) * 18, y - Math.sin(a) * 18 + 4, 11, color, 'center');
  }

  drawMarkers(c) {
    const g = this.g;
    const pr = {};
    const cx = this.w / 2, cy = this.h / 2;
    for (const b of g.markerBodies()) {
      if (g.target && g.target.data === b.data) continue;
      this.project(b.pos, pr);
      if (!pr.on) continue;
      const rpx = this.pxRadius(b.data.radius, pr.dist);
      const s = Math.max(5, Math.min(rpx + 6, 40));
      const near = Math.hypot(pr.x - cx, pr.y - cy) < 90;
      const col = b.data.kind === 'station' ? COL.green : b.mapped ? COL.blueA(0.8) : COL.orA(0.7);
      c.strokeStyle = col;
      c.lineWidth = 1.2;
      if (rpx > 70) { /* body fills the view: label only */ }
      else if (b.data.kind === 'star') {
        c.beginPath(); c.arc(pr.x, pr.y, s, 0, Math.PI * 2); c.stroke();
      } else if (b.data.kind === 'station') {
        c.strokeRect(pr.x - s, pr.y - s, s * 2, s * 2);
      } else {
        c.beginPath();
        c.moveTo(pr.x, pr.y - s); c.lineTo(pr.x + s, pr.y); c.lineTo(pr.x, pr.y + s); c.lineTo(pr.x - s, pr.y);
        c.closePath(); c.stroke();
      }
      if (near || rpx > 30) {
        this.text(c, b.data.name.toUpperCase(), pr.x + s + 6, pr.y - 2, 11, col);
        this.text(c, fmtDist(Math.max(0, pr.dist - b.data.radius)), pr.x + s + 6, pr.y + 11, 10, COL.orA(0.6));
      }
    }
  }

  drawTarget(c, L) {
    const g = this.g;
    const t = g.target;
    if (!t) return;
    const pr = this.project(t.pos, {});
    const surf = Math.max(0, pr.dist - (t.data.kind === 'station' ? 0 : t.data.radius));
    if (!pr.on) {
      this.edgeArrow(c, pr, COL.or, fmtDist(surf));
      return;
    }
    const rpx = this.pxRadius(t.data.kind === 'station' ? 1.5 : t.data.radius, pr.dist);
    const s = Math.max(16, Math.min(rpx + 8, this.h * 0.4));
    const k = Math.min(14, s * 0.5);
    c.strokeStyle = COL.or;
    c.lineWidth = 2;
    c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = pr.x + sx * s, y = pr.y + sy * s;
      c.moveTo(x, y - sy * k); c.lineTo(x, y); c.lineTo(x - sx * k, y);
    }
    c.stroke();
    // scan progress ring
    if (g.scan && g.scan.target === t) {
      const p = g.scan.t / g.scan.dur;
      c.strokeStyle = COL.blue;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(pr.x, pr.y, s + 10, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      c.stroke();
      this.text(c, `MAPPING ${Math.round(p * 100)}%`, pr.x, pr.y - s - 18, 12, COL.blue, 'center', 700);
    }
    const name = t.data.name.toUpperCase();
    this.text(c, name, pr.x, pr.y + s + 16, 13, COL.or, 'center', 700);
    let sub = fmtDist(surf);
    if (g.ship.mode === 'sc' && g.ship.scSpeed > 0) {
      const closing = g.ship.vel.dot(_d.copy(t.pos).sub(g.ship.pos).normalize());
      if (closing > 0) sub += '   ' + fmtTime(surf / closing);
    }
    this.text(c, sub, pr.x, pr.y + s + 30, 11, COL.orA(0.8), 'center');
  }

  drawHyperMarker(c) {
    const g = this.g;
    if (!g.hyperTarget) return;
    const dir = g.hyperDir();
    _p.copy(dir).multiplyScalar(1e9).add(g.camera.position);
    const pr = this.project(_p, {});
    const label = `${g.hyperTarget.name.toUpperCase()}`;
    if (!pr.on) {
      this.edgeArrow(c, pr, COL.blue, '');
      return;
    }
    c.strokeStyle = COL.blue;
    c.lineWidth = 1.6;
    const r = 16;
    c.beginPath(); c.arc(pr.x, pr.y, r, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(pr.x - 5, pr.y - 6); c.lineTo(pr.x + 1, pr.y); c.lineTo(pr.x - 5, pr.y + 6);
    c.moveTo(pr.x + 1, pr.y - 6); c.lineTo(pr.x + 7, pr.y); c.lineTo(pr.x + 1, pr.y + 6);
    c.stroke();
    this.text(c, label, pr.x, pr.y - r - 8, 11, COL.blue, 'center', 700);
    this.text(c, `${g.hyperDist().toFixed(2)} LY`, pr.x, pr.y + r + 14, 10, COL.blueA(0.8), 'center');
  }

  drawPulses(c, dt) {
    for (const p of this.pulses) {
      p.t += dt;
      const k = p.t / p.dur;
      const r = k * Math.max(this.w, this.h) * 0.9;
      c.strokeStyle = `rgba(255,240,220,${(1 - k) * 0.7})`;
      c.lineWidth = 3 * (1 - k) + 0.5;
      c.beginPath();
      c.ellipse(this.w / 2, this.h / 2, r, r * 0.55, 0, 0, Math.PI * 2);
      c.stroke();
    }
    this.pulses = this.pulses.filter((p) => p.t < p.dur);
  }

  drawRadar(c, L) {
    const g = this.g;
    const { cx, cy, rx, ry } = L;
    // base
    const grd = c.createRadialGradient(cx, cy, 0, cx, cy, rx);
    grd.addColorStop(0, COL.orA(0.08));
    grd.addColorStop(1, COL.orA(0.02));
    c.fillStyle = grd;
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = COL.orA(0.55);
    c.lineWidth = 1.2;
    c.stroke();
    c.strokeStyle = COL.orA(0.22);
    c.lineWidth = 1;
    for (const k of [0.33, 0.66]) { c.beginPath(); c.ellipse(cx, cy, rx * k, ry * k, 0, 0, Math.PI * 2); c.stroke(); }
    c.beginPath();
    c.moveTo(cx - rx, cy); c.lineTo(cx + rx, cy);
    c.moveTo(cx, cy - ry); c.lineTo(cx, cy + ry);
    c.moveTo(cx, cy); c.lineTo(cx - rx * 0.7, cy - ry * 0.7);
    c.moveTo(cx, cy); c.lineTo(cx + rx * 0.7, cy - ry * 0.7);
    c.stroke();
    // own ship
    c.fillStyle = COL.white;
    c.beginPath(); c.moveTo(cx, cy - 5); c.lineTo(cx + 4, cy + 4); c.lineTo(cx - 4, cy + 4); c.closePath(); c.fill();
    const sc = g.ship.mode === 'sc';
    const maxR = sc ? 2e9 : 8; // km
    const range = sc ? 'SC' : '8 KM';
    this.text(c, range, cx + rx - 4, cy + ry + 13 * L.s + 2, 10, COL.orA(0.6), 'right');
    _q.copy(g.ship.quat).invert();
    const contacts = g.radarContacts();
    for (const ct of contacts) {
      _d.copy(ct.pos).sub(g.ship.pos);
      const dist = _d.length();
      if (!sc && dist > maxR) continue;
      _d.applyQuaternion(_q); // ship local: x right, y up, -z forward
      let r;
      if (sc) r = Math.min(1, Math.log10(1 + dist / 1000) / Math.log10(1 + maxR / 1000));
      else r = Math.min(1, dist / maxR);
      const n = _d.clone().normalize();
      const hl = Math.hypot(n.x, n.z) || 1;
      const px = cx + (n.x / hl) * r * rx * Math.min(1, hl * 1.4);
      const pz = cy + (n.z / hl) * r * ry * Math.min(1, hl * 1.4);
      const py = pz - n.y * r * ry * 1.6;
      const isT = g.target && g.target.data === ct.data;
      const col = isT ? COL.white : ct.data.kind === 'station' ? COL.green : COL.or;
      c.strokeStyle = col;
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(px, pz); c.lineTo(px, py); c.stroke();
      c.fillStyle = col;
      const sz = isT ? 4.5 : 3.2;
      if (ct.data.kind === 'star') { c.beginPath(); c.arc(px, py, sz + 1, 0, Math.PI * 2); c.fill(); }
      else if (ct.data.kind === 'station') c.fillRect(px - sz, py - sz, sz * 2, sz * 2);
      else { c.strokeRect(px - sz, py - sz, sz * 2, sz * 2); }
    }
  }

  drawCompass(c, L) {
    const g = this.g;
    const x = L.cx - L.rx - 46 * L.s - (L.touch ? 0 : 8), y = L.cy - 6;
    const r = 24 * Math.max(0.8, L.s);
    c.strokeStyle = COL.orA(0.7);
    c.lineWidth = 1.4;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = COL.orA(0.25);
    c.beginPath(); c.arc(x, y, r * 0.5, 0, Math.PI * 2); c.stroke();
    const tp = g.target ? g.target.pos : g.hyperTarget ? _p.copy(g.hyperDir()).multiplyScalar(1e12).add(g.ship.pos) : null;
    if (tp) {
      _d.copy(tp).sub(g.ship.pos).normalize().applyQuaternion(_q.copy(g.ship.quat).invert());
      const px = x + _d.x * r * 0.85, py = y - _d.y * r * 0.85;
      const col = g.target ? COL.or : COL.blue;
      c.fillStyle = col; c.strokeStyle = col;
      c.beginPath(); c.arc(px, py, 3.6, 0, Math.PI * 2);
      if (_d.z < 0) c.fill(); else { c.lineWidth = 1.5; c.stroke(); }
    }
    this.text(c, 'NAV', x, y + r + 13, 10, COL.orA(0.55), 'center');
  }

  bar(c, x, y, w, h, frac, col, label, vertical = true, warn = false) {
    c.strokeStyle = COL.orA(0.45);
    c.lineWidth = 1;
    c.strokeRect(x, y, w, h);
    c.fillStyle = warn ? COL.red : col;
    frac = Math.max(0, Math.min(1, frac));
    if (vertical) c.fillRect(x + 2, y + 2 + (h - 4) * (1 - frac), w - 4, (h - 4) * frac);
    else c.fillRect(x + 2, y + 2, (w - 4) * frac, h - 4);
    if (label) this.text(c, label, vertical ? x + w / 2 : x - 4, vertical ? y + h + 12 : y + h - 1, 10, COL.orA(0.7), vertical ? 'center' : 'right');
  }

  drawGauges(c, L) {
    const g = this.g;
    const sh = g.ship;
    const s = L.s;
    // throttle & speed (right of radar)
    const tx = L.cx + L.rx + 34 * s, ty = L.cy - 58 * s, th = 104 * s, tw = 14 * s;
    if (!L.touch) {
      c.strokeStyle = COL.orA(0.5);
      c.lineWidth = 1;
      c.strokeRect(tx, ty, tw, th);
      if (sh.mode === 'sc') {
        // blue zone 50-75%
        c.fillStyle = COL.blueA(0.22);
        c.fillRect(tx + 1, ty + th * 0.25, tw - 2, th * 0.25);
      }
      const thr = sh.throttle;
      const zeroY = sh.mode === 'sc' ? ty + th : ty + th * 0.75;
      const fillH = sh.mode === 'sc' ? th * thr : th * 0.75 * Math.max(0, thr);
      c.fillStyle = sh.mode === 'sc' && thr >= 0.5 && thr <= 0.76 ? COL.blue : COL.or;
      if (thr >= 0) c.fillRect(tx + 3, zeroY - fillH, tw - 6, fillH);
      else { c.fillStyle = COL.orA(0.7); c.fillRect(tx + 3, zeroY, tw - 6, th * 0.25 * -thr * 2); }
      if (sh.mode !== 'sc') { c.strokeStyle = COL.orA(0.6); c.beginPath(); c.moveTo(tx - 3, zeroY); c.lineTo(tx + tw + 3, zeroY); c.stroke(); }
      this.text(c, 'THR', tx + tw / 2, ty + th + 13, 10, COL.orA(0.6), 'center');
    }
    // speed
    const spd = sh.mode === 'sc' ? sh.scSpeed : sh.vel.length();
    const sx = L.touch ? L.cx + L.rx + 12 : tx + tw + 12 * s;
    const sy = L.touch ? L.cy - 4 : ty + 20 * s;
    this.text(c, fmtSpeed(spd), sx, sy, Math.round(19 * Math.max(0.85, s)), COL.white, 'left', 700, 'Rajdhani');
    this.text(c, sh.mode === 'sc' ? 'SUPERCRUISE' : 'NORMAL', sx, sy + 15, 10, sh.mode === 'sc' ? COL.blue : COL.orA(0.7));
    if (sh.boostT > 0) this.text(c, 'BOOST', sx, sy + 28, 11, COL.white, 'left', 700);
    // left gauges: fuel / heat / hull
    const lx = L.touch ? L.cx - L.rx - 12 : L.cx - L.rx - 190 * s;
    if (L.touch) {
      const bw = 64, bh = 7;
      const bx = L.gx, by = L.gy;
      this.bar(c, bx, by, bw, bh, sh.fuel / g.FUEL_MAX, COL.or, 'FUEL', false, sh.fuel < 4);
      this.bar(c, bx, by + 12, bw, bh, sh.heat / 120, COL.or, 'HEAT', false, sh.heat > 80);
      this.bar(c, bx, by + 24, bw, bh, sh.hull / 100, COL.or, 'HULL', false, sh.hull < 35);
    } else {
      const by = L.cy - 52 * s, bh = 92 * s, bw = 11 * s;
      const gap = 34 * s;
      this.bar(c, lx, by, bw, bh, sh.fuel / g.FUEL_MAX, COL.or, 'FUEL', true, sh.fuel < 4);
      this.bar(c, lx + gap, by, bw, bh, sh.heat / 120, COL.or, 'HEAT', true, sh.heat > 80);
      this.bar(c, lx + gap * 2, by, bw, bh, sh.hull / 100, COL.or, 'HULL', true, sh.hull < 35);
      this.text(c, `${sh.fuel.toFixed(1)}T`, lx + bw / 2, by - 6, 10, COL.orA(0.8), 'center');
      this.text(c, `${Math.round(sh.heat)}%`, lx + gap + bw / 2, by - 6, 10, sh.heat > 80 ? COL.red : COL.orA(0.8), 'center');
      this.text(c, `${Math.round(sh.hull)}%`, lx + gap * 2 + bw / 2, by - 6, 10, COL.orA(0.8), 'center');
    }
  }

  log(msg, kind = '') {
    this.comms.push({ msg, kind, t: 0 });
    if (this.comms.length > 6) this.comms.shift();
    this.domDirty = true;
  }

  center(msg, sub = '', dur = 3, kind = '') {
    this.centerMsg = { msg, sub, t: 0, dur, kind };
    this.domDirty = true;
  }

  updateDom(dt, hidden) {
    const g = this.g;
    this.domT += dt;
    for (const m of this.comms) m.t += dt;
    if (this.centerMsg) {
      this.centerMsg.t += dt;
      if (this.centerMsg.t > this.centerMsg.dur) { this.centerMsg = null; this.domDirty = true; }
    }
    if (this.domT < 0.1 && !this.domDirty) return;
    this.domT = 0;
    this.domDirty = false;
    const hud = this.el('hud-dom');
    hud.hidden = hidden;
    if (hidden) return;
    const sh = g.ship;
    const sys = g.sys;
    // system panel
    const st = sys.star;
    const ex = g.exploreFor(sys.id);
    const total = sys.bodies.length + 1 + (sys.station ? 0 : 0);
    const known = ex.honk ? sys.bodies.length + 1 : 1;
    this.setText('sys-name', sys.name.toUpperCase());
    this.setText('sys-class', `${st.label}${sys.stub.inBubble ? ' · CHARTED SPACE' : ex.first ? ' · UNEXPLORED' : ''}`);
    this.setText('sys-bodies', ex.honk ? `${known} BODIES · ${ex.m.length} MAPPED` : 'BODIES UNKNOWN · HOLD DISCOVERY SCAN');
    // credits panel
    this.setText('cr-val', fmtCr(g.save.credits));
    this.setText('data-val', fmtCr(g.unsoldValue()));
    this.setText('rank-val', g.rank().name.toUpperCase());
    // target panel
    const tp = this.el('target-panel');
    if (g.target) {
      tp.hidden = false;
      const d = g.target.data;
      const dist = Math.max(0, g.ship.pos.distanceTo(g.target.pos) - (d.kind === 'station' ? 0 : d.radius));
      this.setText('tgt-name', d.name.toUpperCase());
      let type = d.label;
      if (d.terraform) type += ' · TERRAFORMABLE';
      this.setText('tgt-type', type.toUpperCase());
      this.setText('tgt-dist', fmtDist(dist));
      const mapped = ex.m.includes(d.id);
      let status = '';
      if (d.kind === 'station') status = 'DOCKING AVAILABLE · UNIVERSAL CARTOGRAPHICS';
      else if (d.kind === 'star') status = `${d.temp.toLocaleString()} K · ${st.scoop ? 'SCOOPABLE' : 'NOT SCOOPABLE'}`;
      else if (mapped) status = 'SURFACE MAPPED';
      else {
        const rng = g.scanRange(d);
        status = dist < rng ? 'IN SCAN RANGE — PRESS ' + g.keyLabel('scan') : `SCAN RANGE ${fmtDist(rng)}`;
      }
      this.setText('tgt-status', status);
      const val = d.kind === 'station' ? '' : `EST. VALUE ${fmtCr(g.bodyValue(d, mapped || d.kind === 'star'))}`;
      this.setText('tgt-val', val);
      tp.classList.toggle('mapped', mapped);
    } else tp.hidden = true;
    // comms
    const cm = this.el('comms');
    const lines = this.comms.filter((m) => m.t < 14);
    const html = lines.map((m) => `<div class="cm ${m.kind}" style="opacity:${Math.max(0.15, 1 - Math.max(0, m.t - 9) / 5)}">${m.msg}</div>`).join('');
    if (cm._h !== html) { cm.innerHTML = html; cm._h = html; }
    // center message
    const cmsg = this.el('center-msg');
    if (this.centerMsg) {
      cmsg.hidden = false;
      const h = `<div class="cm-main ${this.centerMsg.kind}">${this.centerMsg.msg}</div>${this.centerMsg.sub ? `<div class="cm-sub">${this.centerMsg.sub}</div>` : ''}`;
      if (cmsg._h !== h) { cmsg.innerHTML = h; cmsg._h = h; }
    } else cmsg.hidden = true;
    // status line
    this.setText('status-line', g.statusLine());
    const hint = g.hintLine();
    this.setText('hint-line', hint);
    this.el('hint-line').hidden = !hint;
    // alerts
    const alerts = [];
    if (sh.heat > 100) alerts.push(['HEAT DAMAGE', 'red']);
    else if (sh.heat > 80) alerts.push(['HEAT WARNING', 'red']);
    if (g.massLocked()) alerts.push(['MASS LOCKED', '']);
    if (g.scooping > 0) alerts.push([`FUEL SCOOPING ${(g.scooping).toFixed(2)} T/S`, 'blue']);
    if (g.supercharged > 1) alerts.push([`FSD SUPERCHARGED ×${g.supercharged}`, 'blue']);
    if (sh.fuel < 3) alerts.push(['FUEL LOW', 'red']);
    if (sh.hull < 30) alerts.push(['HULL CRITICAL', 'red']);
    const ah = alerts.map(([t, k]) => `<span class="alert ${k}">${t}</span>`).join('');
    const ael = this.el('alerts');
    if (ael._h !== ah) { ael.innerHTML = ah; ael._h = ah; }
    // objective
    const obj = g.objectiveText();
    this.setText('objective', obj ? obj : '');
    this.el('objective').hidden = !obj;
  }

  setText(id, t) {
    const e = this.el(id);
    if (e && e._t !== t) { e.textContent = t; e._t = t; }
  }
}
