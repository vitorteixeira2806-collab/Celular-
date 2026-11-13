// Modos de jogo sobre o núcleo: passeio livre com marcadores, corridas, contra o relógio e navegação.
import { Game } from './game.js';
import { Race } from './race.js';
import { Police } from './police.js';
import { buildEvents, chaseSpots, medalOf, MEDAL } from './events.js';
import { makeBeam } from './markers.js';
import { Hud } from '../ui/hud.js';
import { laneCenter } from '../world/map.js';
import { idx, pathDir } from './path.js';
import { persist } from '../core/save.js';
import { fmtTime, fmtMoney } from '../core/util.js';

const POS_PAY = [1, 0.6, 0.35, 0.15, 0.1, 0.05];
const _d = { x: 0, z: 1 };
const G = Game.prototype;

G.initModes = function () {
  const map = this.map;
  this.events = buildEvents(map);
  this.chases = chaseSpots(map);
  this.hud = new Hud(this.els.hud, this);
  this.race = null; this.police = new Police(this);
  this.blips = []; this.routePts = null; this.waypoint = null; this.navT = 0; this.routeT = 0;
  this.spots = [];
  const addSpot = (type, x, z, color, data) => {
    const beam = makeBeam(color, 3.6, 8);
    beam.position.set(x, map.heightAt(x, z), z);
    this.scene.add(beam);
    this.spots.push({ type, x, z, beam, data, color: '#' + color.toString(16).padStart(6, '0') });
  };
  for (const ev of this.events) {
    const p = ev.path;
    pathDir(p, 0, _d);
    const off = p.hw[0] - 2.6;
    ev.spot = { x: p.px[0] - _d.z * off, z: p.pz[0] + _d.x * off };
    addSpot('event', ev.spot.x, ev.spot.z, 0xff8a1f, ev);
  }
  addSpot('garage', map.garage.x, map.garage.z, 0x39d0ff, null);
  for (const c of this.chases) addSpot('chase', c.x, c.z, 0xff3b3b, c);
  this.spotNear = null;
};

G.sfx = function (name, a) { if (this.audio) this.audio.play(name, a); };

G.collectDynamics = function (dyn) {
  if (this.race) this.race.collect(dyn);
  if (this.police) this.police.collect(dyn);
};
G.stepSystems = function (dt) {
  if (this.race) this.race.step(dt);
  if (this.police) this.police.step(dt);
  if (this.state === 'roam') this.updateRoam(dt);
  const p = this.player;
  if (p.waterT > 1.4 && (this.state === 'roam' || this.state === 'race')) {
    this.resetCar();
    this.hud.toast('Resgatado da água');
  }
  this.navT -= dt;
  if (this.navT <= 0) { this.navT = 0.2; this.updateNav(); }
};
G.drawSystems = function (f, night) {
  if (this.race) this.race.draw(f, night);
  if (this.police) this.police.draw(f, night);
  const t = this.time;
  for (const s of this.spots) {
    s.beam.visible = this.state === 'roam' && !(this.police && this.police.stars > 0) && s !== this.spotNear;
    if (s.beam.visible) s.beam.scale.y = 8 + Math.sin(t * 3 + s.x) * 0.6;
  }
};

// ---------- Passeio livre: parar em um marcador abre o evento ----------
G.updateRoam = function () {
  const p = this.player;
  const wanted = this.police && this.police.stars > 0;
  let near = null;
  if (!wanted) for (const s of this.spots) {
    const dx = s.x - p.x, dz = s.z - p.z;
    if (dx * dx + dz * dz < 30) { near = s; break; }
  }
  if (near && p.speed < 2.2) {
    if (this.spotNear !== near) {
      this.spotNear = near;
      if (near.type === 'event') {
        const ev = near.data;
        this.hud.prompt(`<div><b>${ev.name}</b><br>${ev.kind === 'circuit' ? ev.laps + ' voltas' : 'Ponto a ponto'} · ${(ev.length * ev.laps / 1000).toFixed(1)} km · ${fmtMoney(ev.prize)}</div>
          <button class="btn pri sm" data-p="race">CORRER</button><button class="btn sm" data-p="tt">RELÓGIO</button>`, (a) => this.startEvent(ev.id, a));
      } else if (near.type === 'garage') {
        this.hud.prompt('<div><b>Oficina Âmbar</b><br>Carros, melhorias e pintura</div><button class="btn pri sm" data-p="go">ENTRAR</button>', () => this.openGarage && this.openGarage());
      } else {
        const c = near.data;
        this.hud.prompt(`<div><b>${c.name}</b><br>Comece com ${c.stars} estrelas e despiste a polícia</div><button class="btn pri sm" data-p="go">PROVOCAR</button>`, () => { this.hud.hidePrompt(); if (this.police) this.police.startChallenge(c); });
      }
    }
  } else if (this.spotNear) { this.spotNear = null; this.hud.hidePrompt(); }
};

// ---------- Eventos ----------
G.startEvent = function (id, mode) {
  const ev = this.events.find((e) => e.id === id);
  if (!ev) return;
  if (this.race) { this.race.dispose(); this.race = null; }
  if (this.police) this.police.clear();
  this.hud.hidePrompt(); this.spotNear = null;
  this.traffic.clear();
  this.traffic.setDensity(this.opt.traffic, mode === 'tt' ? 0 : 0.55);
  this.view.repair();
  this.race = new Race(this, ev, mode);
  this.setState('race');
  this.setPaused(false);
  this.cam.orbit = null;
  this.world.preload(this.player.x, this.player.z);
  this.cam.snap();
  this.waypoint = null;
  this.hud.msg(ev.name, mode === 'tt' ? 'Contra o relógio' : ev.kind === 'circuit' ? ev.laps + ' voltas' : 'Ponto a ponto', 2.2);
  this.updateNav();
};

G.endEvent = function () {
  if (this.race) { this.race.dispose(); this.race = null; }
  this.traffic.setDensity(this.opt.traffic, 1);
  this.cam.orbit = null;
  this.setState('roam');
  this.updateNav();
};

G.onRaceFinished = function (race) {
  const ev = race.ev, save = this.save, res = race.result;
  const best = save.best[ev.id] || (save.best[ev.id] = {});
  let earn = 0;
  res.lines = [];
  if (race.mode === 'race') {
    earn = Math.round((ev.prize * POS_PAY[res.pos - 1]) / 10) * 10;
    save.stats.races++;
    if (res.pos === 1) save.stats.wins++;
    res.record = best.race == null || res.time < best.race;
    if (res.record) best.race = res.time;
    if (best.pos == null || res.pos < best.pos) best.pos = res.pos;
    this.sfx(res.pos <= 3 ? 'win' : 'lose');
  } else {
    const before = medalOf(ev, best.tt), now = medalOf(ev, res.time);
    const pay = [0, 0.25, 0.45, 0.7];
    if (now > before) earn = Math.round((ev.prize * (pay[now] - pay[before])) / 10) * 10;
    res.record = best.tt == null || res.time < best.tt;
    if (res.record) { best.tt = res.time; if (!earn) earn = 50; }
    res.medal = now;
    this.sfx(now ? 'win' : 'lose');
  }
  res.earn = earn;
  save.money += earn;
  persist(save, true);
  this.cam.orbit = { angle: this.player.yaw + 2.4, dist: 8, height: 2.6 };
  setTimeout(() => {
    if (this.race !== race) return;
    if (this.ui && this.ui.showResults) this.ui.showResults(race);
    else this.endEvent();
  }, 1600);
};

// recoloca o carro na via mais próxima (ou no último checkpoint, em corrida)
G.resetCar = function () {
  const p = this.player, map = this.map;
  if (this.race && !this.race.finished) { this.race.resetPlayer(); this.cam.snap(); return; }
  let ne = map.nearestEdge(p.x, p.z);
  if (!ne) {
    const n = map.nearestNode(p.x, p.z, (q) => q.kind === 'grid' || q.kind === 'ring');
    ne = map.nearestEdge(n.x + 1, n.z + 1);
  }
  const e = ne.edge;
  let hx = ne.dx, hz = ne.dz, side = 1;
  if (Math.sin(p.yaw) * hx + Math.cos(p.yaw) * hz < 0) { hx = -hx; hz = -hz; side = -1; }
  const P = map.pointOnEdge(e, ne.s);
  const off = laneCenter(e, 0) * side;
  p.place(P.x + P.nx * off, P.z + P.nz * off, Math.atan2(hx, hz), map);
  p.y = map.heightAt(p.x, p.z);
  this.cam.snap();
};

G.hudAction = function (a) {
  if (a === 'cam') { this.cam.cycle(); this.sfx('tick'); }
  else if (a === 'reset') { this.resetCar(); this.sfx('tick'); }
  else if (a === 'radio') { if (this.audio) this.audio.nextStation(); }
  else if (a === 'map') { if (this.ui && this.ui.openMap) this.ui.openMap(); }
  else if (a === 'pause') { if (this.ui && this.ui.openPause) this.ui.openPause(); }
};

// ---------- Navegação: rota no minimapa e pontos de interesse ----------
G.setWaypoint = function (x, z) {
  this.waypoint = x == null ? null : { x, z };
  this.routeT = 0;
  this.updateNav();
};

G.updateNav = function () {
  const p = this.player, map = this.map, b = this.blips;
  b.length = 0;
  const r = this.race;
  if (r) {
    const path = r.path, pts = [{ x: p.x, z: p.z }];
    if (!r.finished) {
      const n = Math.min(90, path.closed ? 90 : path.n - 1 - r.pi);
      for (let k = 2; k <= n; k += 2) { const j = idx(path, r.pi + k); pts.push({ x: path.px[j], z: path.pz[j] }); }
      const t = r.target;
      b.push({ x: t.x, z: t.z, c: '#ffcf4a', r: 4.5, pin: true });
    }
    this.routePts = pts;
    for (const rv of r.rivals) b.push({ x: rv.v.x, z: rv.v.z, c: '#' + rv.color.toString(16).padStart(6, '0'), r: 3 });
    if (r.ghostMesh && r.ghostMesh.visible) b.push({ x: r.ghostMesh.position.x, z: r.ghostMesh.position.z, c: '#9fd8ff', r: 3 });
    return;
  }
  const wanted = this.police && this.police.stars > 0;
  if (!wanted) for (const s of this.spots) b.push({ x: s.x, z: s.z, c: s.color, r: 3.6 });
  if (this.police) this.police.blips(b);
  const w = this.waypoint;
  if (w) {
    b.push({ x: w.x, z: w.z, c: '#c56bff', r: 4.5, pin: true });
    if (Math.hypot(w.x - p.x, w.z - p.z) < 28) { this.waypoint = null; this.routePts = null; this.hud.toast('Você chegou ao destino'); return; }
    this.routeT -= 0.2;
    if (this.routeT <= 0) {
      this.routeT = 1.2;
      const a = map.nearestNode(p.x, p.z), c = map.nearestNode(w.x, w.z);
      const seq = a.id !== c.id ? map.findRoute(a.id, c.id, { startDir: p.speed > 4 ? [p.vx / p.speed, p.vz / p.speed] : null }) : null;
      const pts = [{ x: p.x, z: p.z }];
      if (seq) for (const q of map.routePoints(seq)) pts.push(q);
      pts.push({ x: w.x, z: w.z });
      this.routePts = pts;
    } else if (this.routePts && this.routePts.length) { this.routePts[0].x = p.x; this.routePts[0].z = p.z; }
  } else this.routePts = null;
};

export { MEDAL, medalOf, fmtTime };
