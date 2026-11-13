// Entrada unificada: toque (botões / volante deslizante / inclinação) + teclado de apoio.
import { clamp } from '../core/util.js';

export class Input {
  constructor(options) {
    this.opt = options;
    this.keys = new Set();
    this.t = { left: false, right: false, wheel: 0, gas: false, brake: false, hand: false, nitro: false };
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
    t.left = t.right = t.gas = t.brake = t.hand = t.nitro = false; t.wheel = 0;
    this.keys.clear();
  }
  read(out) {
    const k = this.keys, t = this.t, o = this.opt;
    let steer = 0;
    if (o.control === 'wheel') steer = t.wheel;
    else if (o.control === 'tilt') { const d = 0.06; steer = Math.abs(this.tilt) < d ? 0 : (this.tilt - Math.sign(this.tilt) * d) / (1 - d); }
    else steer = (t.right ? 1 : 0) - (t.left ? 1 : 0);
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    const brake = t.brake || k.has('KeyS') || k.has('ArrowDown');
    let gas = t.gas || k.has('KeyW') || k.has('ArrowUp');
    if (o.autoGas && !brake) gas = true;
    out.steer = clamp(steer, -1, 1);
    out.throttle = gas ? 1 : 0;
    out.brake = brake ? 1 : 0;
    out.handbrake = t.hand || k.has('Space');
    out.nitro = t.nitro || k.has('ShiftLeft') || k.has('ShiftRight');
    return out;
  }
}
