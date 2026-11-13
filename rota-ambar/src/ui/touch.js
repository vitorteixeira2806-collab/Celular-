// Controles de toque com multitoque real (Pointer Events): polegar esquerdo dirige, direito acelera/freia.
import { clamp } from '../core/util.js';

const ICON = {
  left: '<svg viewBox="0 0 24 24"><path d="M15.5 4.5 7 12l8.5 7.5z"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M8.5 4.5 17 12l-8.5 7.5z"/></svg>',
  gas: '<svg viewBox="0 0 24 24"><path d="M12 4 20 15h-5v5H9v-5H4z"/></svg>',
  brake: '<svg viewBox="0 0 24 24"><path d="M12 20 4 9h5V4h6v5h5z"/></svg>',
};

export class TouchControls {
  constructor(root, input, options) {
    this.root = root; this.input = input; this.opt = options;
    this.ptr = new Map();
    this.onNitro = null;
    root.innerHTML = `
      <div class="tb steerL" data-k="left">${ICON.left}</div>
      <div class="tb steerR" data-k="right">${ICON.right}</div>
      <div class="twheel"><div class="ttrack"></div><div class="tknob">${ICON.left}${ICON.right}</div></div>
      <div class="tb gas" data-k="gas">${ICON.gas}<span>ACEL</span></div>
      <div class="tb brake" data-k="brake">${ICON.brake}<span>FREIO</span></div>
      <div class="tb hand" data-k="hand"><b>DRIFT</b></div>
      <div class="tb nitro" data-k="nitro"><b>NITRO</b></div>`;
    this.btns = [...root.querySelectorAll('.tb')].map((el) => ({ el, k: el.dataset.k, r: null }));
    this.wheel = root.querySelector('.twheel');
    this.knob = root.querySelector('.tknob');
    const down = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try { root.setPointerCapture(e.pointerId); } catch (err) { /* sem captura */ }
      const p = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, steer: false };
      if (this.opt.control === 'wheel' && e.clientX < innerWidth * 0.45 && !this.hasSteerPtr()) {
        p.steer = true;
        this.wheel.style.left = e.clientX + 'px';
        this.wheel.style.top = clamp(e.clientY, innerHeight * 0.45, innerHeight - 50) + 'px';
        this.wheel.classList.add('on');
      }
      this.ptr.set(e.pointerId, p);
      this.refresh();
    };
    const move = (e) => {
      const p = this.ptr.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      this.refresh();
    };
    const up = (e) => {
      const p = this.ptr.get(e.pointerId);
      if (!p) return;
      this.ptr.delete(e.pointerId);
      if (p.steer) this.wheel.classList.remove('on');
      this.refresh();
    };
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('lostpointercapture', up);
    addEventListener('resize', () => this.layout());
    this.apply();
  }
  hasSteerPtr() { for (const p of this.ptr.values()) if (p.steer) return true; return false; }
  // aplica opções (esquema, tamanho, opacidade)
  apply() {
    const o = this.opt, r = this.root;
    r.dataset.scheme = o.control;
    r.classList.toggle('autogas', !!o.autoGas);
    r.style.setProperty('--ts', o.btnSize);
    r.style.setProperty('--to', o.btnOpacity);
    this.layout();
  }
  layout() {
    requestAnimationFrame(() => {
      for (const b of this.btns) b.r = b.el.offsetParent ? b.el.getBoundingClientRect() : null;
    });
  }
  clear() {
    this.ptr.clear();
    this.wheel.classList.remove('on');
    this.refresh();
  }
  refresh() {
    const t = this.input.t;
    const st = { left: false, right: false, gas: false, brake: false, hand: false, nitro: false };
    let wheel = 0;
    const range = 62 * this.opt.btnSize;
    for (const p of this.ptr.values()) {
      if (p.steer) {
        wheel = clamp((p.x - p.sx) / range, -1, 1);
        // âncora acompanha o dedo quando ultrapassa o curso
        if (p.x - p.sx > range) p.sx = p.x - range;
        if (p.x - p.sx < -range) p.sx = p.x + range;
        this.wheel.style.left = p.sx + 'px';
        this.knob.style.transform = `translate(${wheel * range}px,0)`;
        continue;
      }
      let best = null, bd = 1e9;
      for (const b of this.btns) {
        if (!b.r) continue;
        const pad = 14;
        if (p.x < b.r.left - pad || p.x > b.r.right + pad || p.y < b.r.top - pad || p.y > b.r.bottom + pad) continue;
        const d = Math.hypot(p.x - (b.r.left + b.r.right) / 2, p.y - (b.r.top + b.r.bottom) / 2);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) st[best.k] = true;
    }
    const wasNitro = t.nitro;
    Object.assign(t, st);
    t.wheel = Math.sign(wheel) * Math.pow(Math.abs(wheel), 1.25);
    for (const b of this.btns) b.el.classList.toggle('on', !!st[b.k]);
    if (st.nitro && !wasNitro && this.onNitro) this.onNitro();
  }
}
