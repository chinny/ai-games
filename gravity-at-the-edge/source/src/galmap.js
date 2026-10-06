// Galaxy map overlay: 3D-projected star chart drawn on a 2D canvas
import { systemsNear, distLy, STAR_TYPES, plotRoute } from './galaxy.js';
import { COL } from './hud.js';

const STAR_HEX = { O: '#9bb0ff', B: '#a9c0ff', A: '#d4e0ff', F: '#fff6ec', G: '#ffe6a8', K: '#ffbe78', M: '#ff8a5a', L: '#e0503a', T: '#b04070', D: '#e8f0ff', N: '#9fd8ff' };

export class GalMap {
  constructor(game) {
    this.g = game;
    this.root = document.getElementById('galmap');
    this.cv = document.getElementById('gm-canvas');
    this.ctx = this.cv.getContext('2d');
    this.info = document.getElementById('gm-info');
    this.open = false;
    this.yaw = 0.6;
    this.pitch = 0.85;
    this.dist = 70;
    this.focus = { x: 0, y: 0, z: 0 };
    this.sel = null;
    this.pointers = new Map();
    this.systems = [];
    this.lastFocusKey = '';
    this.bind();
  }

  bind() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, button: e.button });
      this.moved = false;
      if (this.pointers.size === 2) this.pinch = this.pinchDist();
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > 6) this.moved = true;
      if (this.pointers.size === 2) {
        const d = this.pinchDist();
        if (this.pinch) this.dist = clamp(this.dist * (this.pinch / d), 12, 400);
        this.pinch = d;
        this.pan(dx * 0.5, dy * 0.5);
      } else if (p.button === 2 || e.shiftKey) {
        this.pan(dx, dy);
      } else {
        this.yaw -= dx * 0.006;
        this.pitch = clamp(this.pitch + dy * 0.005, 0.05, 1.5);
      }
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (p && !this.moved && this.pointers.size === 0) this.pick(e.clientX, e.clientY);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.dist = clamp(this.dist * (e.deltaY > 0 ? 1.12 : 0.89), 12, 400); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    document.getElementById('gm-close').addEventListener('click', () => this.g.toggleMap(false));
    document.getElementById('gm-center').addEventListener('click', () => { const c = this.g.sys.pos; this.focus = { ...c }; this.g.audio.blip(); });
    document.getElementById('gm-zin').addEventListener('click', () => { this.dist = clamp(this.dist * 0.75, 12, 400); });
    document.getElementById('gm-zout').addEventListener('click', () => { this.dist = clamp(this.dist * 1.33, 12, 400); });
    this.info.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'route' && this.sel) this.g.plotTo(this.sel);
      if (b.dataset.act === 'clear') this.g.clearRoute();
      if (b.dataset.act === 'focus' && this.sel) this.focus = { ...this.sel.pos };
      this.renderInfo();
    });
  }

  pinchDist() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  pan(dx, dy) {
    const k = this.dist / 500;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    // screen right = (cos yaw, 0, -sin yaw) ; screen up on plane = (sin yaw, 0, cos yaw)
    this.focus.x -= (dx * cy + dy * sy) * k;
    this.focus.z -= (-dx * sy + dy * cy) * k;
  }

  show() {
    this.open = true;
    this.root.hidden = false;
    this.focus = { ...this.g.sys.pos };
    this.sel = this.g.hyperTarget || this.g.routeEnd() || null;
    this.resize();
    this.renderInfo();
  }
  hide() {
    this.open = false;
    this.root.hidden = true;
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.max(1, Math.round(r.width * this.dpr));
    this.cv.height = Math.max(1, Math.round(r.height * this.dpr));
    this.W = r.width;
    this.H = r.height;
  }

  camBasis() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    // camera position relative to focus
    const eye = { x: this.focus.x + this.dist * cp * sy, y: this.focus.y + this.dist * sp, z: this.focus.z + this.dist * cp * cy };
    let fx = this.focus.x - eye.x, fy = this.focus.y - eye.y, fz = this.focus.z - eye.z;
    const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    // right = f x up(0,1,0)
    let rx = -fz, ry = 0, rz = fx;
    const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
    // up = r x f
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    return { eye, f: [fx, fy, fz], r: [rx, ry, rz], u: [ux, uy, uz] };
  }

  proj(p, B) {
    const dx = p.x - B.eye.x, dy = p.y - B.eye.y, dz = p.z - B.eye.z;
    const z = dx * B.f[0] + dy * B.f[1] + dz * B.f[2];
    if (z < 0.5) return null;
    const x = dx * B.r[0] + dy * B.r[1] + dz * B.r[2];
    const y = dx * B.u[0] + dy * B.u[1] + dz * B.u[2];
    const f = (Math.min(this.W, this.H) * 0.9) / z;
    return { x: this.W / 2 + x * f, y: this.H / 2 - y * f, z, f };
  }

  pick(x, y) {
    const r = this.cv.getBoundingClientRect();
    x -= r.left; y -= r.top;
    let best = null, bd = 26;
    for (const s of this.drawn || []) {
      const d = Math.hypot(s.sx - x, s.sy - y);
      if (d < bd) { bd = d; best = s.sys; }
    }
    if (best) {
      this.sel = best;
      this.g.audio.select();
      this.renderInfo();
    }
  }

  renderInfo() {
    const g = this.g;
    const s = this.sel;
    const range = g.jumpRange();
    let h = '';
    if (!s) {
      h = `<div class="gm-title">GALAXY MAP</div><div class="gm-row">Tap a star system to inspect it. Drag to rotate, pinch or scroll to zoom${g.touchMode ? '' : ', right-drag to pan'}.</div>
      <div class="gm-row">Jump range <b>${range.toFixed(1)} LY</b> · Fuel <b>${g.ship.fuel.toFixed(1)} T</b></div>`;
    } else {
      const d = distLy(g.sys.stub, s);
      const st = STAR_TYPES[s.cls];
      const ex = g.save.explore[s.id];
      const cur = s.id === g.sys.id;
      const route = g.route;
      const inRoute = route.length && route[route.length - 1].id === s.id;
      h = `<div class="gm-title">${s.name.toUpperCase()}</div>
      <div class="gm-row"><span class="gm-dot" style="background:${STAR_HEX[s.cls]}"></span>${st.label}${st.scoop ? ' · <span class="scoop">SCOOPABLE</span>' : ''}</div>
      <div class="gm-row">${cur ? 'CURRENT SYSTEM' : `DISTANCE <b>${d.toFixed(2)} LY</b>`}${s.station ? ' · <span class="stn">STATION</span>' : ''}</div>
      <div class="gm-row">${s.inBubble ? 'Charted space' : ex ? (ex.first ? 'First discovered by you' : 'Visited') : 'Unexplored'}${ex ? ' · visited' : ''}</div>`;
      if (inRoute) h += `<div class="gm-row route">ROUTE: <b>${route.length}</b> JUMP${route.length > 1 ? 'S' : ''} · NEXT <b>${route[0].name}</b></div>`;
      if (!cur) {
        h += `<div class="gm-btns"><button data-act="route" class="btn primary">${inRoute ? 'RE-PLOT' : 'PLOT ROUTE'}</button><button data-act="focus" class="btn">FOCUS</button>${route.length ? '<button data-act="clear" class="btn">CLEAR</button>' : ''}</div>`;
      }
      if (this.err) h += `<div class="gm-row err">${this.err}</div>`;
    }
    this.info.innerHTML = h;
    this.err = null;
  }

  draw() {
    if (!this.open) return;
    const c = this.ctx;
    const g = this.g;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#05070c';
    c.fillRect(0, 0, this.W, this.H);
    const B = this.camBasis();
    // refresh nearby systems around focus
    const fk = `${Math.round(this.focus.x / 10)},${Math.round(this.focus.z / 10)},${Math.round(this.dist / 20)}`;
    if (fk !== this.lastFocusKey) {
      this.systems = systemsNear(this.focus, Math.min(160, this.dist * 1.6 + 20));
      this.lastFocusKey = fk;
    }
    // grid on galactic plane through current system height
    const gy = g.sys.pos.y;
    const step = this.dist > 150 ? 50 : 10;
    const ext = Math.ceil((this.dist * 1.4) / step) * step;
    c.lineWidth = 1;
    const fx0 = Math.round(this.focus.x / step) * step, fz0 = Math.round(this.focus.z / step) * step;
    for (let i = -ext; i <= ext; i += step) {
      for (const [a, b] of [[{ x: fx0 + i, y: gy, z: fz0 - ext }, { x: fx0 + i, y: gy, z: fz0 + ext }], [{ x: fx0 - ext, y: gy, z: fz0 + i }, { x: fx0 + ext, y: gy, z: fz0 + i }]]) {
        const pa = this.proj(a, B), pb = this.proj(b, B);
        if (!pa || !pb) continue;
        c.strokeStyle = 'rgba(88,140,255,0.08)';
        c.beginPath(); c.moveTo(pa.x, pa.y); c.lineTo(pb.x, pb.y); c.stroke();
      }
    }
    // jump range circle around current
    const cur = g.sys.pos;
    const R = g.jumpRange();
    c.strokeStyle = COL.blueA(0.5);
    c.setLineDash([4, 5]);
    c.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const p = this.proj({ x: cur.x + Math.cos(a) * R, y: gy, z: cur.z + Math.sin(a) * R }, B);
      if (!p) continue;
      if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
    }
    c.stroke();
    c.setLineDash([]);
    // bubble boundary
    c.strokeStyle = 'rgba(125,255,176,0.15)';
    c.beginPath();
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const p = this.proj({ x: Math.cos(a) * 48, y: gy, z: Math.sin(a) * 48 }, B);
      if (!p) continue;
      if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
    }
    c.stroke();
    // systems
    const list = [];
    for (const s of this.systems) {
      const p = this.proj(s.pos, B);
      if (!p || p.x < -20 || p.x > this.W + 20 || p.y < -20 || p.y > this.H + 20) continue;
      list.push({ sys: s, sx: p.x, sy: p.y, z: p.z, f: p.f });
    }
    list.sort((a, b) => b.z - a.z);
    this.drawn = list;
    const sel = this.sel;
    for (const it of list) {
      const s = it.sys;
      // stalk to plane
      const fd = Math.hypot(s.pos.x - this.focus.x, s.pos.z - this.focus.z);
      const pb = fd < Math.max(30, this.dist * 0.45) ? this.proj({ x: s.pos.x, y: gy, z: s.pos.z }, B) : null;
      if (pb) {
        c.strokeStyle = s.pos.y > gy ? 'rgba(88,182,255,0.13)' : 'rgba(255,138,30,0.10)';
        c.beginPath(); c.moveTo(it.sx, it.sy); c.lineTo(pb.x, pb.y); c.stroke();
      }
      const big = ['O', 'B', 'A'].includes(s.cls) ? 1.5 : ['L', 'T', 'D', 'N'].includes(s.cls) ? 0.8 : 1;
      const r = Math.max(1.4, Math.min(6, it.f * 0.35 * big));
      const visited = !!g.save.explore[s.id];
      c.fillStyle = STAR_HEX[s.cls];
      c.globalAlpha = visited ? 1 : 0.85;
      c.beginPath(); c.arc(it.sx, it.sy, r, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
      if (s.station) { c.strokeStyle = 'rgba(125,255,176,0.45)'; c.lineWidth = 0.8; c.strokeRect(it.sx - r - 2.5, it.sy - r - 2.5, (r + 2.5) * 2, (r + 2.5) * 2); c.lineWidth = 1; }
      if (visited) { c.strokeStyle = COL.orA(0.6); c.beginPath(); c.arc(it.sx, it.sy, r + 2.5, 0, Math.PI * 2); c.stroke(); }
      const showLabel = s === sel || s.id === g.sys.id || (this.dist < 45 && it.f > 9);
      if (showLabel) {
        c.font = '600 11px Rajdhani, sans-serif';
        c.fillStyle = s === sel ? COL.white : COL.orA(0.65);
        c.textAlign = 'left';
        c.fillText(s.name.toUpperCase(), it.sx + r + 5, it.sy + 4);
      }
    }
    // route
    const route = g.route;
    if (route.length) {
      c.strokeStyle = COL.blue;
      c.lineWidth = 2;
      c.beginPath();
      let p0 = this.proj(cur, B);
      if (p0) c.moveTo(p0.x, p0.y);
      for (const s of route) {
        const p = this.proj(s.pos, B);
        if (p) c.lineTo(p.x, p.y);
      }
      c.stroke();
      c.lineWidth = 1;
    }
    // current system marker
    const pc = this.proj(cur, B);
    if (pc) {
      c.strokeStyle = COL.or;
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(pc.x, pc.y, 9, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(pc.x, pc.y - 14); c.lineTo(pc.x, pc.y - 20); c.moveTo(pc.x, pc.y + 14); c.lineTo(pc.x, pc.y + 20);
      c.moveTo(pc.x - 14, pc.y); c.lineTo(pc.x - 20, pc.y); c.moveTo(pc.x + 14, pc.y); c.lineTo(pc.x + 20, pc.y); c.stroke();
    }
    if (sel) {
      const ps = this.proj(sel.pos, B);
      if (ps) {
        c.strokeStyle = COL.white;
        c.lineWidth = 1.5;
        const k = 11;
        c.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const x = ps.x + sx * k, y = ps.y + sy * k;
          c.moveTo(x, y - sy * 5); c.lineTo(x, y); c.lineTo(x - sx * 5, y);
        }
        c.stroke();
      }
    }
    // scale text
    c.font = '600 11px Rajdhani, sans-serif';
    c.fillStyle = COL.orA(0.6);
    c.textAlign = 'left';
    c.fillText(`GRID ${step} LY · JUMP RANGE ${R.toFixed(1)} LY · SYSTEMS SHOWN ${list.length}`, 14, this.H - 14);
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export { plotRoute };
