// HUD compacto: minimapa, velocímetro, nitro, posição/volta/tempo, estrelas, mensagens e botões do topo.
import { Minimap } from './minimap.js';
import { fmtTime, fmtMoney } from '../core/util.js';
import { WEAPONS } from '../game/onfoot.js';

const IC = {
  reset: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/></svg>',
  radio: '<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 2 3 6.6 7.2.8-5.4 4.9 1.6 7.1L12 17.8 5.6 21.4l1.6-7.1L1.8 9.4 9 8.6z"/></svg>',
};

export class Hud {
  constructor(root, game) {
    this.g = game; this.root = root;
    root.innerHTML = `
      <canvas id="mini"></canvas>
      <div class="h-money"></div>
      <div class="h-race hidden">
        <div><small>POS</small><b class="pos">1<em>/6</em></b></div>
        <div class="lapbox"><small>VOLTA</small><b class="lap">1<em>/2</em></b></div>
        <div><small>TEMPO</small><b class="time">0:00.0</b></div>
      </div>
      <div class="h-stars hidden">${IC.star.repeat(5)}<div class="evade"><i></i></div></div>
      <div class="h-top">
        <button class="hb" data-a="reset" aria-label="Recolocar na pista">${IC.reset}</button>
        <button class="hb" data-a="radio" aria-label="Rádio">${IC.radio}</button>
        <button class="hb" data-a="cam" aria-label="Câmera">${IC.cam}</button>
        <button class="hb" data-a="map" aria-label="Mapa">${IC.map}</button>
        <button class="hb" data-a="pause" aria-label="Pausa">${IC.pause}</button>
      </div>
      <div class="h-speed"><span class="gear">1</span><span class="num">0</span><span class="unit">km/h</span><div class="nbar"><i></i></div></div>
      <div class="h-foot hidden"><div class="hp"><i></i></div><div class="wp"><b class="wname">Pistola</b><span class="wammo">12</span></div></div>
      <div class="h-cross hidden"><i></i></div>
      <div class="h-msg"></div>
      <div class="h-toast"></div>
      <div class="h-wrong hidden">CONTRAMÃO</div>
      <div class="h-prompt hidden"></div>
      <div class="h-fps hidden"></div>`;
    const q = (s) => root.querySelector(s);
    this.el = {
      money: q('.h-money'), race: q('.h-race'), pos: q('.pos'), lap: q('.lap'), lapbox: q('.lapbox'), time: q('.time'),
      stars: q('.h-stars'), starEls: [...root.querySelectorAll('.h-stars svg')], evade: q('.evade'), evadeBar: q('.evade i'),
      num: q('.num'), gear: q('.gear'), nbar: q('.nbar'), nfill: q('.nbar i'), msg: q('.h-msg'), toast: q('.h-toast'),
      wrong: q('.h-wrong'), foot: q('.h-foot'), hp: q('.hp i'), wname: q('.wname'), wammo: q('.wammo'), cross: q('.h-cross'), speed: q('.h-speed'), prompt: q('.h-prompt'), fps: q('.h-fps'), radioBtn: q('[data-a="radio"]'),
    };
    this.mini = new Minimap(q('#mini'), game.map);
    this.cache = {};
    this.msgT = 0; this.toastT = 0;
    root.querySelector('.h-top').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.hb');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      game.hudAction(b.dataset.a);
    });
    this.el.prompt.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (this.promptCb) this.promptCb(b.dataset.p);
    });
  }
  set(key, el, val, prop = 'textContent') {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    el[prop] = val;
  }
  msg(text, sub = '', dur = 1.6, big = false) {
    const m = this.el.msg;
    m.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    m.classList.toggle('big', !!big);
    m.classList.add('show');
    this.msgT = dur;
  }
  toast(text, dur = 2.6) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastT = dur;
  }
  // html com botões [data-p]; cb recebe o valor
  prompt(html, cb) {
    if (this.promptHtml === html) return;
    this.promptHtml = html; this.promptCb = cb;
    this.el.prompt.innerHTML = html;
    this.el.prompt.classList.remove('hidden');
  }
  hidePrompt() {
    if (!this.promptHtml) return;
    this.promptHtml = null;
    this.el.prompt.classList.add('hidden');
  }

  update(dt) {
    const g = this.g, p = g.player, el = this.el;
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) el.msg.classList.remove('show'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) el.toast.classList.remove('show'); }
    this.set('spd', el.num, String(Math.round(p.speed * 3.6)));
    this.set('gear', el.gear, p.vf < -0.5 ? 'R' : String(p.gear + 1));
    const nf = Math.round(p.nitro * 50) / 50;
    if (this.cache.n !== nf) { this.cache.n = nf; el.nfill.style.transform = `scaleX(${nf})`; }
    if (this.cache.non !== p.nitroOn) { this.cache.non = p.nitroOn; el.nbar.classList.toggle('on', p.nitroOn); }
    this.set('money', el.money, fmtMoney(g.save.money));
    // a pé: vida, arma e mira no lugar do velocímetro
    const f = g.foot, on = f.on;
    if (this.cache.foot !== on) {
      this.cache.foot = on;
      el.foot.classList.toggle('hidden', !on); el.cross.classList.toggle('hidden', !on); el.speed.classList.toggle('hidden', on);
    }
    if (on) {
      const hp = Math.round(f.hp);
      if (this.cache.hp !== hp) { this.cache.hp = hp; el.hp.style.transform = `scaleX(${hp / 100})`; el.hp.classList.toggle('low', hp < 35); }
      this.set('wn', el.wname, WEAPONS[f.w].name);
      this.set('wa', el.wammo, f.reloadT > 0 ? 'recarga…' : f.ammo[f.w] + ' / ' + WEAPONS[f.w].mag);
      const hit = f.hitT > 0;
      if (this.cache.hit !== hit) { this.cache.hit = hit; el.cross.classList.toggle('hit', hit); }
    }
    const r = g.race;
    if (this.cache.race !== !!r) { this.cache.race = !!r; el.race.classList.toggle('hidden', !r); }
    if (r) {
      const tot = r.rivals.length + 1;
      this.set('pos', el.pos, r.mode === 'tt' ? '<em>solo</em>' : `${r.position}<em>/${tot}</em>`, 'innerHTML');
      this.set('lap', el.lap, `${Math.min(r.laps, r.lap + 1)}<em>/${r.laps}</em>`, 'innerHTML');
      if (this.cache.lapbox !== (r.laps > 1)) { this.cache.lapbox = r.laps > 1; el.lapbox.classList.toggle('hidden', r.laps <= 1); }
      this.set('time', el.time, fmtTime(r.time));
      const w = r.wrong > 1.2;
      if (this.cache.wrong !== w) { this.cache.wrong = w; el.wrong.classList.toggle('hidden', !w); }
    } else if (this.cache.wrong) { this.cache.wrong = false; el.wrong.classList.add('hidden'); }
    const st = g.police ? g.police.stars : 0;
    if (this.cache.stars !== st) {
      this.cache.stars = st;
      el.stars.classList.toggle('hidden', st === 0);
      el.starEls.forEach((s, i) => s.classList.toggle('on', i < st));
    }
    if (st > 0) {
      const ev = g.police.evade;
      const evOn = ev > 0.02;
      if (this.cache.evOn !== evOn) { this.cache.evOn = evOn; el.stars.classList.toggle('flash', evOn); el.evade.style.visibility = evOn ? 'visible' : 'hidden'; }
      if (evOn) el.evadeBar.style.width = Math.round(ev * 100) + '%';
    }
    this.mini.render(g);
  }
}
