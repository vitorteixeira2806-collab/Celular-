// Progressão e opções: garagem (carros, melhorias, pintura), aplicação de opções e fluxo de telas.
import { Game } from './game.js';
import { AIDriver } from './aidriver.js';
import { CARS, carById, effectiveSpec, upgradeCost } from '../vehicles/cars.js';
import { persist, resetSave, loadSave } from '../core/save.js';
import { clamp, angleDiff } from '../core/util.js';
import * as THREE from 'three';

const G = Game.prototype;
export const PAINT_COST = 250;

G.equipCar = function (id) {
  const car = carById(id), own = this.save.owned[id];
  if (!own) return false;
  this.save.car = id;
  this.player.setSpec(effectiveSpec(car, own), car.model);
  this.view.setCar(car.model, own.color);
  this.view.repair();
  this.player.damage = 0;
  persist(this.save);
  return true;
};
// só visual (navegando na oficina)
G.previewCar = function (id) {
  const car = carById(id), own = this.save.owned[id];
  this.view.setCar(car.model, own ? own.color : car.color);
  this.view.repair();
};
G.buyCar = function (id) {
  const car = carById(id), s = this.save;
  if (s.owned[id] || s.money < car.price) return false;
  s.money -= car.price;
  s.owned[id] = { engine: 0, tires: 0, nitro: 0, color: car.color };
  this.equipCar(id);
  this.sfx('buy');
  persist(s, true);
  return true;
};
G.buyUpgrade = function (id, kind) {
  const car = carById(id), s = this.save, own = s.owned[id];
  if (!own || own[kind] >= 3) return false;
  const cost = upgradeCost(car, kind, own[kind]);
  if (s.money < cost) return false;
  s.money -= cost;
  own[kind]++;
  if (s.car === id) this.player.setSpec(effectiveSpec(car, own), car.model);
  this.sfx('buy');
  persist(s, true);
  return true;
};
G.setPaint = function (id, color) {
  const s = this.save, own = s.owned[id];
  if (!own || own.color === color) return false;
  if (s.money < PAINT_COST) return false;
  s.money -= PAINT_COST;
  own.color = color;
  this.view.paintMat.color.set(color);
  this.sfx('buy');
  persist(s, true);
  return true;
};

// aplica as opções atuais em todos os sistemas
G.applyOptions = function (what) {
  const o = this.opt;
  this.touch.apply();
  if (!this.race) this.traffic.setDensity(o.traffic);
  if (what === 'quality' || what === 'all') { this.autoLevel = null; this.applyQuality(); }
  if (what === 'shadows' || what === 'all') this.applyShadows();
  if (this.audio) this.audio.applyOptions();
  this.hud.el.fps.classList.toggle('hidden', !o.showFps);
  persist(this.save);
};

G.applyShadows = function () {
  const on = !!this.opt.shadows, r = this.renderer, sun = this.sun;
  if (r.shadowMap.enabled === on) return;
  r.shadowMap.enabled = on;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = on;
  if (on) {
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 50; c.far = 600;
    c.updateProjectionMatrix();
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6; sun.shadow.radius = 3;
  }
  this.scene.traverse((ob) => { if (ob.material) { const ms = Array.isArray(ob.material) ? ob.material : [ob.material]; for (const m of ms) m.needsUpdate = true; } });
};

// ---------- Fluxo ----------
// tela inicial: o carro passeia sozinho pela orla
G.toTitle = function () {
  if (this.race) this.endEvent();
  this.police.clear();
  this.equipCar(this.save.car);
  const ev = this.events.find((e) => e.id === 'orla'), p = ev.path;
  const i = 40;
  this.player.place(p.px[i] + 3, p.pz[i], Math.PI / 2, this.map);
  this.autopilot = new AIDriver(this.player, p, { skill: 0.55, lat: 4, start: i });
  this.autopilot.lim = this.autopilot.lim.map((v) => Math.min(v, 17));
  this.setState('title');
  this.setPaused(false);
  this.cam.orbit = { angle: 2.2, dist: 9.5, height: 2.8, spin: 0.12, shift: 2.4 };
  this.world.preload(this.player.x, this.player.z);
};

G.startRoam = function () {
  this.autopilot = null;
  this.cam.orbit = null;
  this.equipCar(this.save.car);
  this.setState('roam');
  this.setPaused(false);
  this.cam.snap();
  this.traffic.setDensity(this.opt.traffic);
  if (!this.hinted) { this.hinted = true; this.hud.toast('Pare sobre um marcador luminoso para abrir um evento', 5); }
};

G.enterGarage = function () {
  if (this.race) this.endEvent();
  if (this.police.stars > 0) { this.hud.toast('Despiste a polícia antes de entrar na oficina'); return false; }
  this.police.clear();
  this.autopilot = null;
  this.hud.hidePrompt(); this.spotNear = null;
  const g = this.map.garage;
  this.player.place(g.x, g.z, 0, this.map);
  this.world.preload(g.x, g.z);
  this.setState('garage');
  this.setPaused(false);
  this.cam.orbit = { angle: 0.7, dist: 8, height: 2.1, spin: 0.1, shift: 2.3 };
  return true;
};
G.leaveGarage = function () {
  this.equipCar(this.save.car);
  this.cam.orbit = null;
};
G.openGarage = function () { if (this.ui) this.ui.open('garage', 'roam'); };

G.wipeProgress = function () {
  resetSave();
  const fresh = loadSave();
  const keep = this.save.options;
  Object.assign(this.save, fresh, { options: keep });
  persist(this.save, true);
  this.equipCar(this.save.car);
};

// assistência leve: alinha o carro à via quando não há comando de direção
const _ne = {};
G.steerAssist = function () {
  const p = this.player;
  if (!this.opt.assist || !p.grounded || p.speed < 7 || Math.abs(p.in.steer) > 0.05 || p.in.handbrake || p.vf < 0) return;
  const ne = this.map.nearestEdge(p.x, p.z, _ne);
  if (!ne || ne.dist > ne.edge.width / 2 + 1.5) return;
  let hx = ne.dx, hz = ne.dz;
  if (Math.sin(p.yaw) * hx + Math.cos(p.yaw) * hz < 0) { hx = -hx; hz = -hz; }
  const err = angleDiff(Math.atan2(hx, hz), p.yaw);
  if (Math.abs(err) < 0.3) p.in.steer = clamp(-err * 1.7, -0.3, 0.3);
};

export { CARS, upgradeCost };
