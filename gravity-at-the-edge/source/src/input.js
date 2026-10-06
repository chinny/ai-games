// Keyboard, mouse (virtual joystick) and touch input
const KEYMAP = {
  KeyJ: 'sc', KeyH: 'hyper', KeyC: 'scan', KeyT: 'nextTarget', KeyG: 'targetAhead', KeyM: 'map', KeyN: 'nav',
  KeyL: 'dock', Escape: 'menu', KeyP: 'music', Tab: 'boost', KeyX: 'zeroThrottle', KeyB: 'blueZone', KeyK: 'cockpit',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.actions = [];
    this.stick = { x: 0, y: 0 }; // mouse virtual stick
    this.touchStick = { x: 0, y: 0, active: false };
    this.touchThrottle = null; // absolute throttle set by touch slider
    this.wheel = 0;
    this.honkHeld = false;
    this.locked = false;
    this.drag = null;
    this.enabled = true;
    this.invertY = false;
    this.mouseSens = 1;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.honkHeld = true; this.actions.push({ type: 'honkStart' }); }
      const a = KEYMAP[e.code];
      if (a) this.actions.push({ type: a });
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') { this.honkHeld = false; this.actions.push({ type: 'honkEnd' }); }
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.honkHeld = false; });

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (e.button !== 0) return;
      this.drag = { x0: e.clientX, y0: e.clientY, moved: false, t: performance.now() };
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (this.locked) {
        const k = 0.0032 * this.mouseSens;
        this.stick.x = clamp(this.stick.x + e.movementX * k, -1, 1);
        this.stick.y = clamp(this.stick.y + e.movementY * k, -1, 1);
        const l = Math.hypot(this.stick.x, this.stick.y);
        if (l > 1) { this.stick.x /= l; this.stick.y /= l; }
      } else if (this.drag) {
        const dx = e.clientX - this.drag.x0, dy = e.clientY - this.drag.y0;
        if (Math.hypot(dx, dy) > 6) this.drag.moved = true;
        if (this.drag.moved) {
          const R = Math.min(window.innerWidth, window.innerHeight) * 0.22;
          this.stick.x = clamp(dx / R, -1, 1);
          this.stick.y = clamp(dy / R, -1, 1);
        }
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (this.drag) {
        if (!this.drag.moved && !this.locked) {
          this.actions.push({ type: 'tapSelect', x: e.clientX, y: e.clientY });
          this.actions.push({ type: 'requestLock' });
        }
        if (!this.locked) { this.stick.x = 0; this.stick.y = 0; }
        this.drag = null;
      }
    });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.stick.x = 0; this.stick.y = 0; }
    });
  }

  requestLock() {
    if (this.isTouch || this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* not available */ }
  }
  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  takeActions() {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  axes() {
    const k = this.keys;
    const dz = (v, d = 0.06) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
    let pitch = 0, yaw = 0, roll = 0, thr = 0, lat = 0, vert = 0;
    if (k.has('ArrowUp')) pitch += 1;
    if (k.has('ArrowDown')) pitch -= 1;
    if (k.has('ArrowLeft') || k.has('KeyA')) roll -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) roll += 1;
    if (k.has('KeyQ')) yaw -= 1;
    if (k.has('KeyE')) yaw += 1;
    if (k.has('KeyW')) thr += 1;
    if (k.has('KeyS')) thr -= 1;
    if (k.has('KeyR')) vert += 1;
    if (k.has('KeyF')) vert -= 1;
    if (k.has('KeyZ')) lat -= 1;
    if (k.has('KeyV')) lat += 1;
    // mouse stick: x -> yaw (and a bit of roll), y -> pitch
    const sx = dz(this.stick.x), sy = dz(this.stick.y);
    yaw += sx;
    pitch -= sy * (this.invertY ? -1 : 1);
    // touch stick: x -> roll + yaw blend, y -> pitch
    if (this.touchStick.active) {
      const tx = dz(this.touchStick.x, 0.08), ty = dz(this.touchStick.y, 0.08);
      roll += tx * 0.85;
      yaw += tx * 0.35;
      pitch -= ty * (this.invertY ? -1 : 1);
    }
    return {
      pitch: clamp(pitch, -1, 1), yaw: clamp(yaw, -1, 1), roll: clamp(roll, -1, 1), thr, lat, vert,
    };
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
