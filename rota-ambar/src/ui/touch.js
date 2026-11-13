// Controles de toque com multitoque real (Pointer Events).
// Dirigindo: polegar esquerdo esterça, direito acelera/freia. A pé: analógico à esquerda, câmera e tiro à direita.
import { clamp } from '../core/util.js';

const ICON = {
  left: '<svg viewBox="0 0 24 24"><path d="M15.5 4.5 7 12l8.5 7.5z"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M8.5 4.5 17 12l-8.5 7.5z"/></svg>',
  gas: '<svg viewBox="0 0 24 24"><path d="M12 4 20 15h-5v5H9v-5H4z"/></svg>',
  brake: '<svg viewBox="0 0 24 24"><path d="M12 20 4 9h5V4h6v5h5z"/></svg>',
  person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5.5" r="3"/><path d="M7 21v-7l-1.5-3.5L9 9h6l3.5 1.5L17 14v7h-3v-6h-4v6z"/></svg>',
  target: '<svg viewBox="0 0 24 24" style="fill:none;stroke:currentColor;stroke-width:2"><circle cx="12" cy="12" r="6.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
};
const EDGE = ['exit', 'enter', 'rel', 'wep']; // disparam uma vez ao tocar

export class TouchControls {
  constructor(root, input, options) {
    this.root = root; this.input = input; this.opt = options;
    this.ptr = new Map();
    this.onNitro = null;
    root.innerHTML = `
      <div class="tb steerL drv" data-k="left">${ICON.left}</div>
      <div class="tb steerR drv" data-k="right">${ICON.right}</div>
      <div class="twheel drv"><div class="ttrack"></div><div class="tknob">${ICON.left}${ICON.right}</div></div>
      <div class="tb gas drv" data-k="gas">${ICON.gas}<span>ACEL</span></div>
      <div class="tb brake drv" data-k="brake">${ICON.brake}<span>FREIO</span></div>
      <div class="tb hand drv" data-k="hand"><b>DRIFT</b></div>
      <div class="tb nitro drv" data-k="nitro"><b>NITRO</b></div>
      <div class="tb exit drv" data-k="exit">${ICON.person}<span>SAIR</span></div>
      <div class="tjoy ft"><div class="tjbase"></div><div class="tjknob"></div></div>
      <div class="tb fire ft" data-k="fire">${ICON.target}<span>ATIRAR</span></div>
      <div class="tb aim ft" data-k="aim"><b>MIRAR</b></div>
      <div class="tb rel ft" data-k="rel"><b>RECARGA</b></div>
      <div class="tb wep ft" data-k="wep"><b>ARMA</b></div>
      <div class="tb enter ft" data-k="enter">${ICON.gas}<span>ENTRAR</span></div>`;
    this.btns = [...root.querySelectorAll('.tb')].map((el) => ({ el, k: el.dataset.k, r: null }));
    this.wheel = root.querySelector('.twheel');
    this.knob = root.querySelector('.tknob');
    this.joy = root.querySelector('.tjoy');
    this.jknob = root.querySelector('.tjknob');
    this.mode = 'drive';
    const down = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try { root.setPointerCapture(e.pointerId); } catch (err) { /* sem captura */ }
      const p = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, steer: false, stick: false, btn: null };
      const leftSide = e.clientX < innerWidth * 0.45;
      p.btn = this.hit(p.x, p.y);
      if (this.mode === 'foot') {
        if (!p.btn && leftSide && !this.has('stick')) {
          p.stick = true;
          this.joy.style.left = e.clientX + 'px'; this.joy.style.top = e.clientY + 'px';
          this.joy.classList.add('on');
        }
      } else if (!p.btn && this.opt.control === 'wheel' && leftSide && !this.has('steer')) {
        p.steer = true;
        this.wheel.style.left = e.clientX + 'px';
        this.wheel.style.top = clamp(e.clientY, innerHeight * 0.45, innerHeight - 50) + 'px';
        this.wheel.classList.add('on');
      }
      if (p.btn && EDGE.includes(p.btn.k) && this.input.onAction) this.input.onAction(p.btn.k);
      this.ptr.set(e.pointerId, p);
      this.refresh();
    };
    const move = (e) => {
      const p = this.ptr.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      // a pé: arrastar no lado direito (inclusive sobre ATIRAR) gira a câmera
      if (this.mode === 'foot' && !p.stick) {
        this.input.t.lookX += p.x - p.lx; this.input.t.lookY += p.y - p.ly;
      }
      p.lx = p.x; p.ly = p.y;
      this.refresh();
    };
    const up = (e) => {
      const p = this.ptr.get(e.pointerId);
      if (!p) return;
      this.ptr.delete(e.pointerId);
      if (p.steer) this.wheel.classList.remove('on');
      if (p.stick) this.joy.classList.remove('on');
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
  has(kind) { for (const p of this.ptr.values()) if (p[kind]) return true; return false; }
  hit(x, y) {
    let best = null, bd = 1e9;
    for (const b of this.btns) {
      if (!b.r) continue;
      const pad = 12;
      if (x < b.r.left - pad || x > b.r.right + pad || y < b.r.top - pad || y > b.r.bottom + pad) continue;
      const d = Math.hypot(x - (b.r.left + b.r.right) / 2, y - (b.r.top + b.r.bottom) / 2);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    this.clear();
    this.apply();
  }
  setNear(on) { if (this.near !== on) { this.near = on; this.root.classList.toggle('cannear', on); this.layout(); } }
  // aplica opções (esquema, tamanho, opacidade)
  apply() {
    const o = this.opt, r = this.root;
    r.dataset.scheme = o.control;
    r.dataset.mode = this.mode;
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
    this.wheel.classList.remove('on'); this.joy.classList.remove('on');
    this.refresh();
  }
  refresh() {
    const t = this.input.t;
    const st = { left: false, right: false, gas: false, brake: false, hand: false, nitro: false, fire: false, aim: false };
    let wheel = 0, sx = 0, sy = 0;
    const range = 62 * this.opt.btnSize, jr = 52 * this.opt.btnSize;
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
      if (p.stick) {
        let dx = p.x - p.sx, dy = p.y - p.sy;
        const d = Math.hypot(dx, dy);
        if (d > jr) { dx *= jr / d; dy *= jr / d; }
        sx = dx / jr; sy = -dy / jr;
        this.jknob.style.transform = `translate(${dx}px,${dy}px)`;
        continue;
      }
      // dirigindo, o dedo pode deslizar de um botão para o outro
      const b = this.mode === 'foot' ? p.btn : this.hit(p.x, p.y);
      if (b && b.k in st) st[b.k] = true;
    }
    const wasNitro = t.nitro;
    Object.assign(t, st);
    t.wheel = Math.sign(wheel) * Math.pow(Math.abs(wheel), 1.25);
    t.stickX = sx; t.stickY = sy;
    for (const b of this.btns) b.el.classList.toggle('on', !!st[b.k]);
    if (st.nitro && !wasNitro && this.onNitro) this.onNitro();
  }
}
