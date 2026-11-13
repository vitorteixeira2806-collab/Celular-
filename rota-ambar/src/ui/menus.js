// Menus (tudo navegável por toque): título, pausa, corridas, oficina, opções, resultados e mapa em tela cheia.
import { CARS, carById, effectiveSpec, upgradeCost, PAINTS } from '../vehicles/cars.js';
import { PAINT_COST } from '../game/meta.js';
import { medalOf, MEDAL, tierCarName } from '../game/events.js';
import { drawWorld } from './minimap.js';
import { fmtTime, fmtMoney, clamp } from '../core/util.js';
import { persist } from '../core/save.js';
import { WORLD } from '../world/map.js';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const STATIONS = ['Onda FM', 'Brasa 99', 'Maré Calma'];

export class UI {
  constructor(root, game) {
    this.root = root; this.g = game;
    this.screen = null; this.back = null; this.started = false;
    this.sel = { ev: 0, car: CARS.findIndex((c) => c.id === game.save.car), tab: 'up' };
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      this.act(b.dataset.act, b.dataset.v, b);
    });
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.opt) this.setOpt(t.dataset.opt, parseFloat(t.value), true);
    });
    game.onAutoPause = () => { if (!this.screen && (game.state === 'roam' || game.state === 'race')) this.openPause(); };
  }

  open(screen, back) {
    const g = this.g;
    if (screen === 'garage') { if (!g.enterGarage()) return; this.sel.car = CARS.findIndex((c) => c.id === g.save.car); }
    if (this.screen === 'garage' && screen !== 'garage') g.leaveGarage();
    if (this.screen === 'map' && screen !== 'map') this.closeMap();
    this.screen = screen;
    if (back !== undefined) this.back = back;
    document.body.classList.add('menu');
    this.render();
  }
  close() {
    if (this.screen === 'garage') this.g.leaveGarage();
    if (this.screen === 'map') this.closeMap();
    this.screen = null;
    this.root.innerHTML = '';
    document.body.classList.remove('menu');
  }

  showTitle() { this.g.toTitle(); this.open('title'); }
  openPause() {
    const g = this.g;
    if (g.state !== 'roam' && g.state !== 'race') return;
    g.setPaused(true);
    if (g.audio) g.audio.setPaused(true);
    this.pausedFrom = g.state;
    this.open('pause');
  }
  resume() {
    const g = this.g;
    this.close();
    g.setState(this.pausedFrom || 'roam');
    g.setPaused(false);
    if (g.audio) g.audio.setPaused(false);
  }
  openMap() {
    const g = this.g;
    if (g.state !== 'roam' && g.state !== 'race') return;
    g.setPaused(true);
    this.pausedFrom = g.state;
    this.open('map');
  }

  // ---------- Ações ----------
  act(a, v, el) {
    const g = this.g;
    g.sfx('tick');
    switch (a) {
      case 'start':
        this.started = true;
        g.firstGesture();
        this.render();
        break;
      case 'roam': this.close(); g.startRoam(); break;
      case 'events': this.open('events', this.screen); break;
      case 'garage': this.open('garage', this.screen); break;
      case 'options': this.open('options', this.screen); break;
      case 'map': this.open('map'); break;
      case 'resume': this.resume(); break;
      case 'restart': { const r = g.race; this.close(); if (g.audio) g.audio.setPaused(false); g.startEvent(r.ev.id, r.mode); break; }
      case 'quit': g.setPaused(false); if (g.audio) g.audio.setPaused(false); g.endEvent(); this.close(); break;
      case 'title': g.setPaused(false); if (g.audio) g.audio.setPaused(false); this.showTitle(); break;
      case 'back': this.goBack(); break;
      case 'ev': this.sel.ev = +v; this.render(); break;
      case 'go': { const ev = g.events[this.sel.ev]; this.close(); g.setPaused(false); if (g.audio) g.audio.setPaused(false); g.autopilot = null; g.startEvent(ev.id, v); break; }
      case 'car': this.sel.car = (this.sel.car + (+v) + CARS.length) % CARS.length; g.previewCar(CARS[this.sel.car].id); this.render(); break;
      case 'buy': if (g.buyCar(CARS[this.sel.car].id)) this.render(); else this.deny(el); break;
      case 'equip': g.equipCar(CARS[this.sel.car].id); this.render(); break;
      case 'tab': this.sel.tab = v; this.render(); break;
      case 'up': if (g.buyUpgrade(CARS[this.sel.car].id, v)) this.render(); else this.deny(el); break;
      case 'paint': if (g.setPaint(CARS[this.sel.car].id, +v)) this.render(); else this.deny(el); break;
      case 'opt': this.setOpt(el.dataset.k, v); break;
      case 'tog': this.setOpt(v, !g.opt[v]); break;
      case 'wipe':
        if (this.wipeArmed) { g.wipeProgress(); this.wipeArmed = false; this.sel.car = 0; g.hud.toast('Progresso apagado'); } else this.wipeArmed = true;
        this.render();
        break;
      case 'again': { const r = g.race; this.close(); g.startEvent(r.ev.id, r.mode); break; }
      case 'cont': g.endEvent(); this.close(); break;
      case 'clearwp': g.setWaypoint(null); this.drawMap(); break;
      default:
    }
  }
  deny(el) {
    this.g.sfx('deny');
    if (el && el.animate) el.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 180 });
  }
  goBack() {
    const g = this.g, b = this.back;
    if (this.screen === 'garage') g.leaveGarage();
    if (b === 'pause') { this.screen = null; this.open('pause'); if (this.pausedFrom) g.setState(this.pausedFrom); g.setPaused(true); }
    else if (b === 'title') { this.screen = null; if (g.state === 'title') this.open('title'); else this.showTitle(); }
    else if (b === 'roam') { this.close(); g.startRoam(); }
    else this.resume();
  }

  async setOpt(k, v, live) {
    const g = this.g, o = g.opt;
    if (v === 'true') v = true; else if (v === 'false') v = false; else if (typeof v === 'string' && v !== '' && !isNaN(v)) v = +v;
    if (k === 'control' && v === 'tilt') {
      const ok = await g.input.enableTilt();
      if (!ok) { g.hud.toast('Sensor de movimento indisponível ou sem permissão'); this.toastInMenu('Sensor de movimento indisponível ou sem permissão'); return; }
    } else if (k === 'control') g.input.disableTilt();
    if (k === 'radio') { o.radioOn = v >= 0; if (v >= 0) o.station = v; }
    else o[k] = v;
    g.applyOptions(k === 'quality' ? 'quality' : k === 'shadows' ? 'shadows' : '');
    if (!live) this.render();
  }
  toastInMenu(t) {
    const d = document.createElement('div');
    d.className = 'map-hint'; d.textContent = t;
    this.root.appendChild(d);
    setTimeout(() => d.remove(), 2600);
  }

  // ---------- Telas ----------
  render() {
    const s = this.screen;
    if (!s) { this.root.innerHTML = ''; return; }
    const keep = this.root.querySelector('.scroll');
    const st = keep ? keep.scrollTop : 0;
    this.root.innerHTML = this[s]();
    const sc = this.root.querySelector('.scroll');
    if (sc && st) sc.scrollTop = st;
    if (s === 'garage') this.bindGarage();
    if (s === 'map') this.bindMap();
  }

  title() {
    const g = this.g;
    return `<div class="scr"><div class="title-wrap">
      <div><div class="logo">ROTA <span>ÂMBAR</span></div><div class="tag">Corridas de rua · Baía Âmbar</div></div>
      ${this.started ? `<div class="menu-col">
        <button class="btn pri" data-act="roam">PASSEIO LIVRE</button>
        <button class="btn" data-act="events">CORRIDAS</button>
        <button class="btn" data-act="garage">OFICINA</button>
        <button class="btn" data-act="options">OPÇÕES</button>
      </div>` : '<button class="btn pri" data-act="start" style="width:min(300px,44vw)">TOQUE PARA COMEÇAR</button>'}
      </div><div class="foot">${fmtMoney(g.save.money)} · ${Object.keys(g.save.owned).length}/${CARS.length} carros · ${g.save.stats.wins} vitórias</div></div>`;
  }

  pause() {
    const g = this.g, r = g.race;
    return `<div class="scr"><div class="bar"><h1>PAUSA<small>${r ? r.ev.name : 'Passeio livre'}</small></h1><span class="sp"></span><span class="money">${fmtMoney(g.save.money)}</span></div>
      <div class="menu-grid">
        <button class="btn pri" data-act="resume">CONTINUAR</button>
        ${r ? '<button class="btn" data-act="restart">REINICIAR</button><button class="btn" data-act="quit">ABANDONAR</button>' : '<button class="btn" data-act="events">CORRIDAS</button><button class="btn" data-act="garage">OFICINA</button>'}
        <button class="btn" data-act="map">MAPA</button>
        <button class="btn" data-act="options">OPÇÕES</button>
        <button class="btn" data-act="title">MENU INICIAL</button>
      </div></div>`;
  }

  events() {
    const g = this.g, evs = g.events, sel = evs[this.sel.ev];
    const card = (ev, i) => {
      const b = g.save.best[ev.id] || {};
      const md = medalOf(ev, b.tt);
      return `<button class="ev ${i === this.sel.ev ? 'sel' : ''}" data-act="ev" data-v="${i}">
        <b>${i + 1}. ${ev.name}</b>
        <small>${ev.kind === 'circuit' ? ev.laps + ' voltas' : 'Ponto a ponto'} · ${((ev.length * ev.laps) / 1000).toFixed(1)} km</small>
        <small>Rivais: ${tierCarName(ev.tier)}</small>
        <span class="medal">${b.pos ? b.pos + 'º lugar' : 'Sem resultado'}${md ? ' · ' + MEDAL[md] : ''}</span></button>`;
    };
    const b = g.save.best[sel.id] || {};
    return `<div class="scr solid"><div class="bar"><button class="btn sm" data-act="back">‹ VOLTAR</button><h1>CORRIDAS</h1><span class="sp"></span><span class="money">${fmtMoney(g.save.money)}</span></div>
      <div class="grow scroll"><div class="ev-grid">${evs.map(card).join('')}</div></div>
      <div class="ev-info"><div class="txt"><b>${sel.name}</b> — ${sel.desc}<br>
        Prêmio ${fmtMoney(sel.prize)} · Melhor corrida ${fmtTime(b.race)} · Relógio ${fmtTime(b.tt)} (ouro ${fmtTime(sel.gold)})</div>
        <button class="btn pri" data-act="go" data-v="race">CORRER</button><button class="btn" data-act="go" data-v="tt">RELÓGIO</button></div></div>`;
  }

  garage() {
    const g = this.g, s = g.save, car = CARS[this.sel.car], own = s.owned[car.id];
    const sp = effectiveSpec(car, own);
    const bar = (label, v) => `<div class="stat"><span>${label}</span><div class="trk"><i style="width:${Math.round(clamp(v, 0.05, 1) * 100)}%"></i></div></div>`;
    let body;
    if (!own) {
      body = `<button class="btn pri wide" data-act="buy" ${s.money < car.price ? 'disabled' : ''}>COMPRAR · ${fmtMoney(car.price)}</button>
        ${s.money < car.price ? `<div class="foot">Faltam ${fmtMoney(car.price - s.money)}. Vença corridas para juntar dinheiro.</div>` : ''}`;
    } else {
      const eq = s.car === car.id;
      const ups = [['engine', 'Motor', 'velocidade e aceleração'], ['tires', 'Pneus', 'aderência e freio'], ['nitro', 'Nitro', 'duração e potência']];
      const upHtml = ups.map(([k, n, d]) => {
        const lv = own[k], cost = upgradeCost(car, k, lv);
        return `<div class="up"><div><b>${n}</b> <span class="foot">${d}</span><div class="pips">${[0, 1, 2].map((i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
          ${lv >= 3 ? '<span class="foot">MÁX</span>' : `<button class="btn sm" data-act="up" data-v="${k}" ${s.money < cost ? 'disabled' : ''}>${fmtMoney(cost)}</button>`}</div>`;
      }).join('');
      const paintHtml = `<div class="foot" style="margin:4px 0">Trocar a pintura custa ${fmtMoney(PAINT_COST)}</div><div class="swatches">${PAINTS.map((c) => `<button class="sw ${own.color === c ? 'sel' : ''}" style="background:${hex(c)}" data-act="paint" data-v="${c}" aria-label="Pintura"></button>`).join('')}</div>`;
      body = `<button class="btn ${eq ? '' : 'pri'} wide" data-act="equip" ${eq ? 'disabled' : ''}>${eq ? 'CARRO ATUAL' : 'USAR ESTE CARRO'}</button>
        <div class="tabs"><button class="btn sm ${this.sel.tab === 'up' ? 'sel' : ''}" data-act="tab" data-v="up">MELHORIAS</button><button class="btn sm ${this.sel.tab === 'paint' ? 'sel' : ''}" data-act="tab" data-v="paint">PINTURA</button></div>
        ${this.sel.tab === 'up' ? upHtml : paintHtml}`;
    }
    return `<div class="scr clear" style="background:linear-gradient(90deg, rgba(8,11,18,.92) 0%, rgba(8,11,18,.8) 38%, rgba(8,11,18,0) 62%)">
      <div class="bar"><button class="btn sm" data-act="back">‹ SAIR</button><h1>OFICINA</h1><span class="sp"></span><span class="money">${fmtMoney(s.money)}</span></div>
      <div class="gar"><div class="gar-left scroll">
        <div class="car-nav"><button class="btn sm" data-act="car" data-v="-1" aria-label="Carro anterior">‹</button>
          <div class="nm"><b>${car.name}</b><small>${car.cls}${own ? '' : ' · ' + fmtMoney(car.price)}</small></div>
          <button class="btn sm" data-act="car" data-v="1" aria-label="Próximo carro">›</button></div>
        ${bar('Velocidade', sp.top / 86)}${bar('Aceleração', sp.accel / 15.5)}${bar('Controle', (sp.grip * sp.steer) / 1.7)}
        <div class="foot">${Math.round(sp.top * 3.6)} km/h · 0–100 em ${(27.8 / sp.accel * 1.12).toFixed(1)} s</div>
        ${body}
      </div><div class="gar-right"><div class="foot">Arraste para girar o carro</div></div></div></div>`;
  }
  bindGarage() {
    const area = this.root.querySelector('.gar-right');
    if (!area) return;
    let px = null;
    area.style.touchAction = 'none';
    area.addEventListener('pointerdown', (e) => { px = e.clientX; try { area.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
    area.addEventListener('pointermove', (e) => {
      if (px == null || !this.g.cam.orbit) return;
      this.g.cam.orbit.angle -= (e.clientX - px) * 0.012;
      this.g.cam.orbit.spin = 0;
      px = e.clientX;
    });
    const up = () => { px = null; };
    area.addEventListener('pointerup', up); area.addEventListener('pointercancel', up);
  }

  options() {
    const o = this.g.opt;
    const seg = (k, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'sel' : ''}" data-act="opt" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const tog = (k) => `<button class="tog ${o[k] ? 'on' : ''}" data-act="tog" data-v="${k}" role="switch" aria-checked="${!!o[k]}"></button>`;
    const rng = (k, min, max, step) => `<input type="range" min="${min}" max="${max}" step="${step}" value="${o[k]}" data-opt="${k}">`;
    const row = (label, ctl, hint) => `<div class="opt"><label>${label}${hint ? `<small>${hint}</small>` : ''}</label>${ctl}</div>`;
    return `<div class="scr solid"><div class="bar"><button class="btn sm" data-act="back">‹ VOLTAR</button><h1>OPÇÕES</h1></div>
      <div class="grow scroll"><div class="opt-grid">
        ${row('Direção', seg('control', [['buttons', 'Botões'], ['wheel', 'Volante'], ['tilt', 'Inclinar']], o.control))}
        ${row('Aceleração automática', tog('autoGas'), 'Jogue só com direção e freio')}
        ${row('Assistência de direção', tog('assist'), 'Alinha o carro à pista')}
        ${row('Inverter inclinação', tog('tiltInvert'))}
        ${row('Tamanho dos botões', rng('btnSize', 0.9, 1.4, 0.05), 'Mínimo de 64 px')}
        ${row('Opacidade dos botões', rng('btnOpacity', 0.25, 1, 0.05))}
        ${row('Vibração', tog('vibrate'), 'Batidas e nitro')}
        ${row('Tremor da câmera', tog('shake'))}
        ${row('Trânsito', seg('traffic', [[0, 'Nenhum'], [1, 'Leve'], [2, 'Médio'], [3, 'Intenso']], o.traffic))}
        ${row('Qualidade', seg('quality', [['auto', 'Auto'], ['low', 'Baixa'], ['med', 'Média'], ['high', 'Alta']], o.quality))}
        ${row('Economia de bateria', tog('battery'), 'Limita a 30 fps')}
        ${row('Sombras em tempo real', tog('shadows'), 'Mais pesado')}
        ${row('Volume geral', rng('volMaster', 0, 1, 0.05))}
        ${row('Música (rádio)', rng('volMusic', 0, 1, 0.05))}
        ${row('Efeitos', rng('volSfx', 0, 1, 0.05))}
        ${row('Mudo', tog('mute'))}
        ${row('Rádio', seg('radio', [[-1, 'Desl.'], ...STATIONS.map((n, i) => [i, n])], o.radioOn ? o.station : -1))}
        ${row('Mostrar FPS', tog('showFps'))}
        ${row('Apagar progresso', `<button class="btn sm danger" data-act="wipe">${this.wipeArmed ? 'TOQUE DE NOVO' : 'APAGAR'}</button>`, 'Dinheiro, carros e tempos')}
      </div></div></div>`;
  }

  showResults(race) {
    const g = this.g;
    g.setPaused(false);
    if (g.audio) g.audio.setPaused(false);
    this.race = race;
    this.open('results');
  }
  results() {
    const r = this.race, res = r.result, ev = r.ev;
    let head, table = '';
    if (r.mode === 'race') {
      head = `<h2>${res.pos === 1 ? 'VITÓRIA!' : res.pos <= 3 ? 'PÓDIO!' : 'FIM DE PROVA'}</h2><div class="big">${res.pos}º</div>`;
      table = '<table>' + r.table().map((row, i) => `<tr class="${row.me ? 'me' : ''}"><td>${i + 1}º</td><td>${row.name}</td><td>${fmtTime(row.time)}</td></tr>`).join('') + '</table>';
    } else {
      head = `<h2>CONTRA O RELÓGIO</h2><div class="big">${fmtTime(res.time)}</div>
        <div style="margin:6px 0;font-size:13px">Medalha: <b>${MEDAL[res.medal]}</b>${res.newGhost ? ' · novo fantasma salvo' : ''}</div>
        <table><tr><td>Ouro</td><td>${fmtTime(ev.gold)}</td></tr><tr><td>Prata</td><td>${fmtTime(ev.silver)}</td></tr><tr><td>Bronze</td><td>${fmtTime(ev.bronze)}</td></tr></table>`;
    }
    return `<div class="dlg-bg"><div class="res">${head}${table}
      <div style="font-size:14px"><b style="color:var(--amber)">+${fmtMoney(res.earn)}</b>${res.record ? ' · Novo recorde pessoal!' : ''}</div>
      <div class="row"><button class="btn" data-act="again">REPETIR</button><button class="btn pri" data-act="cont">CONTINUAR</button></div></div></div>`;
  }

  // ---------- Mapa em tela cheia (arrastar e pinça) ----------
  map() {
    return `<div class="scr solid" style="padding:0"><canvas id="mapcv"></canvas>
      <div class="map-bar"><button class="btn sm" data-act="resume">‹ FECHAR</button>
        <div class="legend"><span><i style="background:#ff8a1f"></i>Corrida</span><span><i style="background:#39d0ff"></i>Oficina</span><span><i style="background:#ff3b3b"></i>Fuga</span><span><i style="background:#c56bff"></i>Destino</span></div>
        <span class="sp" style="flex:1"></span><button class="btn sm" data-act="clearwp">LIMPAR DESTINO</button></div>
      <div class="map-hint">Arraste para mover · pinça para zoom · toque para marcar destino</div></div>`;
  }
  bindMap() {
    const g = this.g, cv = this.root.querySelector('#mapcv');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const m = (this.mapState = this.mapState || { scale: 0.42, cx: g.player.x, cz: g.player.z });
    m.cx = g.player.x; m.cz = g.player.z;
    const fit = () => { cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); this.drawMap(); };
    this.mapCv = cv; this.mapDpr = dpr;
    const ptrs = new Map();
    let moved = 0, t0 = 0, lastD = 0;
    const lim = () => {
      m.scale = clamp(m.scale, 0.16, 3);
      m.cx = clamp(m.cx, WORLD.x0, WORLD.x1); m.cz = clamp(m.cz, WORLD.z0, WORLD.z1);
    };
    cv.addEventListener('pointerdown', (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { moved = 0; t0 = performance.now(); }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; lastD = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (ptrs.size === 1) { m.cx -= dx / m.scale; m.cz -= dy / m.scale; moved += Math.abs(dx) + Math.abs(dy); }
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (lastD > 0) {
          // zoom em torno do ponto médio dos dedos
          const wx = m.cx + (mx - innerWidth / 2) / m.scale, wz = m.cz + (my - innerHeight / 2) / m.scale;
          m.scale = clamp(m.scale * (d / lastD), 0.16, 3);
          m.cx = wx - (mx - innerWidth / 2) / m.scale; m.cz = wz - (my - innerHeight / 2) / m.scale;
        }
        lastD = d; moved += 20;
      }
      lim(); this.drawMap();
    });
    const up = (e) => {
      const had = ptrs.has(e.pointerId);
      ptrs.delete(e.pointerId);
      lastD = 0;
      if (had && ptrs.size === 0 && moved < 10 && performance.now() - t0 < 450 && e.type === 'pointerup') {
        // toque: marca destino (encaixa na via mais próxima)
        let wx = m.cx + (e.clientX - innerWidth / 2) / m.scale, wz = m.cz + (e.clientY - innerHeight / 2) / m.scale;
        const ne = g.map.nearestEdge(wx, wz);
        if (ne && ne.dist < 60) { wx = ne.x; wz = ne.z; }
        g.setWaypoint(wx, wz);
        g.sfx('tick');
        this.drawMap();
      }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { m.scale = clamp(m.scale * (e.deltaY < 0 ? 1.15 : 0.87), 0.16, 3); this.drawMap(); }, { passive: true });
    this._fit = fit;
    addEventListener('resize', fit);
    fit();
  }
  closeMap() { if (this._fit) removeEventListener('resize', this._fit); this._fit = null; this.mapCv = null; }
  drawMap() {
    const cv = this.mapCv;
    if (!cv) return;
    const g = this.g, m = this.mapState, dpr = this.mapDpr, ctx = cv.getContext('2d');
    const z = m.scale * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1b3550'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(z, 0, 0, z, cv.width / 2 - m.cx * z, cv.height / 2 - m.cz * z);
    drawWorld(ctx, g.map, 3.2 / m.scale, m.scale > 0.7);
    const px = (v) => (v * dpr) / z;
    const rt = g.routePts;
    if (rt && rt.length > 1) {
      ctx.strokeStyle = g.race ? '#ffcf4a' : '#c56bff'; ctx.lineWidth = px(4); ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(rt[0].x, rt[0].z);
      for (let i = 1; i < rt.length; i++) ctx.lineTo(rt[i].x, rt[i].z);
      ctx.stroke();
    }
    if (g.race) {
      // traçado completo da prova
      const p = g.race.path;
      ctx.strokeStyle = 'rgba(255,207,74,0.45)'; ctx.lineWidth = px(2.5);
      ctx.beginPath(); ctx.moveTo(p.px[0], p.pz[0]);
      for (let i = 1; i < p.n; i += 2) ctx.lineTo(p.px[i], p.pz[i]);
      if (p.closed) ctx.closePath();
      ctx.stroke();
    }
    const dot = (x, zz, r, c, label) => {
      ctx.beginPath(); ctx.arc(x, zz, px(r), 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
      ctx.lineWidth = px(1.5); ctx.strokeStyle = '#000'; ctx.stroke();
      if (label) { ctx.fillStyle = '#000'; ctx.font = `bold ${px(10)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, zz + px(0.5)); }
    };
    if (!g.race) g.spots.forEach((s) => dot(s.x, s.z, 8, s.color, s.type === 'event' ? String(s.data.index + 1) : s.type === 'garage' ? 'O' : '!'));
    for (const b of g.blips) if (b.pin || g.race || (g.police.stars > 0)) dot(b.x, b.z, b.r + 1.5, b.c);
    // jogador
    const p = g.player, s = px(9);
    ctx.save(); ctx.translate(p.x, p.z); ctx.rotate(Math.PI - p.yaw);
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.72, s * 0.8); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.72, s * 0.8); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = px(1.6); ctx.stroke(); ctx.fill();
    ctx.restore();
  }
}
