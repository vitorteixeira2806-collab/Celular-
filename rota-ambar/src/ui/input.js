// Entrada unificada: toque (botões / volante deslizante / inclinação) + teclado de apoio.
import { clamp } from '../core/util.js';

export class Input {
  constructor(options) {
    this.opt = options;
    this.keys = new Set();
    this.t = { left: false, right: false, wheel: 0, gas: false, brake: false, hand: false, nitro: false, stickX: 0, stickY: 0, lookX: 0, lookY: 0, fire: false, aim: false };
    this.onAction = null; // ações de um toque (sair/entrar, recarregar, trocar arma)
    this.pad = { lx: 0, ly: 0, rx: 0, ry: 0, r2: 0, l2: 0, b: [], prev: [] };
    this.tilt = 0;
    this.tiltOk = false;
    this.onKey = null; // atalhos (câmera, mapa, pausa)
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); });
    this._orient = (e) => {
      if (e.beta == null) return;
      this.tiltOk = true;
      const ang = (screen.orientation && screen.orientation.angle != null ? screen.orientation.angle : window.orientation) || 0;
      let v;
      if (ang === 90) v = e.beta; else if (ang === 270 || ang === -90) v = -e.beta; else v = e.gamma;
      this.tilt = clamp(v / 24, -1, 1) * (this.opt.tiltInvert ? -1 : 1);
    };
  }
  // precisa ser chamado dentro de um gesto do usuário (exigência do iOS)
  async enableTilt() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return false;
      }
      removeEventListener('deviceorientation', this._orient);
      addEventListener('deviceorientation', this._orient);
      return true;
    } catch (e) { return false; }
  }
  disableTilt() { removeEventListener('deviceorientation', this._orient); this.tilt = 0; }
  releaseAll() {
    const t = this.t;
    t.left = t.right = t.gas = t.brake = t.hand = t.nitro = t.fire = t.aim = false; t.wheel = 0; t.stickX = t.stickY = t.lookX = t.lookY = 0;
    this.keys.clear();
  }
  // controle (padrão "standard": funciona com controles de PlayStation, Xbox e similares)
  pollPad() {
    const g = this.pad;
    let gp = null;
    try { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (const q of l) if (q && q.connected && q.mapping === 'standard') { gp = q; break; } } catch (e) { /* ignore */ }
    g.on = !!gp;
    if (!gp) { g.lx = g.ly = g.rx = g.ry = g.r2 = g.l2 = 0; g.b.length = 0; return; }
    const dz = (v) => (Math.abs(v) < 0.14 ? 0 : (v - Math.sign(v) * 0.14) / 0.86);
    g.lx = dz(gp.axes[0] || 0); g.ly = dz(gp.axes[1] || 0); g.rx = dz(gp.axes[2] || 0); g.ry = dz(gp.axes[3] || 0);
    g.r2 = gp.buttons[7] ? gp.buttons[7].value : 0; g.l2 = gp.buttons[6] ? gp.buttons[6].value : 0;
    for (let i = 0; i < 16; i++) {
      const down = !!(gp.buttons[i] && gp.buttons[i].pressed);
      if (down && !g.prev[i] && this.onPad) this.onPad(i);
      g.prev[i] = down; g.b[i] = down;
    }
  }
  // a pé: movimento, câmera e tiro
  readFoot(out) {
    const k = this.keys, t = this.t, g = this.pad;
    let mx = t.stickX + g.lx, mz = t.stickY - g.ly;
    if (k.has('KeyA')) mx -= 1; if (k.has('KeyD')) mx += 1;
    if (k.has('KeyW')) mz += 1; if (k.has('KeyS')) mz -= 1;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    out.mx = mx; out.mz = mz;
    // olhar: toque em pixels; teclado e controle em taxa
    out.lookX = t.lookX * 0.0052 + ((k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0) + g.rx * 1.6) * 0.035;
    out.lookY = t.lookY * 0.0042 + ((k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0) + g.ry * 1.2) * 0.028;
    t.lookX = t.lookY = 0;
    out.fire = t.fire || k.has('Space') || g.r2 > 0.4;
    out.aim = t.aim || k.has('KeyE') || g.l2 > 0.4;
    return out;
  }
  read(out) {
    const k = this.keys, t = this.t, o = this.opt, g = this.pad;
    let steer = 0;
    if (o.control === 'wheel') steer = t.wheel;
    else if (o.control === 'tilt') { const d = 0.06; steer = Math.abs(this.tilt) < d ? 0 : (this.tilt - Math.sign(this.tilt) * d) / (1 - d); }
    else steer = (t.right ? 1 : 0) - (t.left ? 1 : 0);
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    steer += g.lx;
    const brake = t.brake || k.has('KeyS') || k.has('ArrowDown') || g.l2 > 0.2;
    let gas = t.gas || k.has('KeyW') || k.has('ArrowUp') || g.r2 > 0.2;
    if (o.autoGas && !brake) gas = true;
    out.steer = clamp(steer, -1, 1);
    out.throttle = gas ? 1 : 0;
    out.brake = brake ? 1 : 0;
    out.handbrake = t.hand || k.has('Space') || !!g.b[5] || !!g.b[1];
    out.nitro = t.nitro || k.has('ShiftLeft') || k.has('ShiftRight') || !!g.b[0];
    return out;
  }
}
