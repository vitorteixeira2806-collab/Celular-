// A pé: sair/entrar em carros, câmera sobre o ombro, armas com mira pelo centro da tela,
// policiais que desembarcam e atiram, pedestres que fogem, roubo de carros e explosões.
import * as THREE from 'three';
import { Game } from './game.js';
import { People, newPerson, makeLook } from './person.js';
import { CARS, carById, effectiveSpec, MODEL_DIMS } from '../vehicles/cars.js';
import { WATER_Y } from '../world/map.js';
import { clamp, lerp, damp, angleDiff, mulberry32, fmtMoney } from '../core/util.js';
import { persist } from '../core/save.js';
import { vibrate } from '../core/platform.js';

const G = Game.prototype;
export const WEAPONS = [
  { name: 'Pistola', dmg: 34, rate: 0.26, mag: 12, reload: 1.1, spread: 0.008, pellets: 1, range: 110, kick: 0.012 },
  { name: 'Submetralhadora', dmg: 17, rate: 0.085, mag: 32, reload: 1.5, spread: 0.026, pellets: 1, range: 90, kick: 0.007 },
  { name: 'Escopeta', dmg: 14, rate: 0.75, mag: 6, reload: 1.9, spread: 0.08, pellets: 8, range: 40, kick: 0.035 },
];
const STOCK = { top: 50, accel: 7.4, brake: 15, grip: 1.0, steer: 1, mass: 1350 };
const _in = {};
const _hit = { t: 0, type: '', ref: null, x: 0, y: 0, z: 0 };

G.initFoot = function () {
  this.people = new People(this.scene);
  const rng = (this.footRng = mulberry32(77123));
  const f = (this.foot = {
    on: false, me: newPerson('player', makeLook(rng, 'player')), yaw: 0, pitch: 0.08, hp: 100, hurtT: 9, w: 0,
    ammo: WEAPONS.map((w) => w.mag), reloadT: 0, fireT: 0, shotT: 9, cops: [], civs: [], parked: [], booms: [], tracers: [],
    near: null, deadT: 0, spawnT: 0, owned: true, proxy: { x: 0, y: 0, z: 0, vx: 0, vz: 0, speed: 0, yaw: 0, halfLen: 0.3, isFoot: true }, hitT: 0, runT: 0,
  });
  // rastros dos tiros
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 6), 3));
  this.tracerMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  this.tracerMesh.frustumCulled = false;
  this.scene.add(this.tracerMesh);
  this.input.onAction = (k) => this.footAction(k);
  this.input.onPad = (i) => this.padButton(i);
  return f;
};

// alvo que polícia, trânsito e minimapa acompanham: o carro ou a pessoa a pé
G.chaseTarget = function () { return this.foot.on ? this.foot.proxy : this.player; };

G.stockSpec = function (key) {
  const car = CARS.find((c) => c.model === key);
  return effectiveSpec(car || STOCK, null);
};

// volta ao carro próprio e limpa o estado a pé (corridas, oficina, menu)
G.footReset = function () {
  const f = this.foot;
  f.on = false; f.cops.length = 0; f.parked.length = 0; f.booms.length = 0; f.tracers.length = 0; f.civs.length = 0;
  f.hp = 100; f.deadT = 0; f.me.down = 0; f.reloadT = 0;
  for (const u of this.police.units) { u.hold = false; u.officer = null; }
  if (!f.owned) { f.owned = true; this.equipCar(this.save.car); }
  this.touch.setMode('drive'); this.touch.setNear(false);
  document.body.classList.remove('onfoot');
};

// ---------- sair / entrar ----------
G.footAction = function (k) {
  const f = this.foot;
  if (this.paused || this.state !== 'roam') return;
  if (k === 'exit') this.exitCar();
  else if (k === 'enter') this.enterCar();
  else if (k === 'rel') this.reloadGun();
  else if (k === 'wep' && f.on) { f.w = (f.w + 1) % WEAPONS.length; f.reloadT = 0; this.sfx('tick'); this.hud.toast(WEAPONS[f.w].name, 1.2); }
};
G.padButton = function (i) {
  // 3 = triângulo/Y, 2 = quadrado/X, 4/5 = L1/R1, 9 = options, 8 = share, 11 = R3
  if (i === 9 && this.ui) { if (this.ui.screen === 'pause') this.ui.resume(); else this.ui.openPause(); return; }
  if (this.paused) return;
  if (i === 3) this.footAction(this.foot.on ? 'enter' : 'exit');
  else if (i === 2 && this.foot.on) this.footAction('rel');
  else if (i === 4 && this.foot.on) this.footAction('wep');
  else if (i === 11 || i === 8) { if (!this.foot.on) this.cam.cycle(); }
};

G.exitCar = function () {
  const f = this.foot, p = this.player, me = f.me;
  if (f.on || this.state !== 'roam') return;
  if (p.speed > 4) { this.hud.toast('Pare o carro para sair'); return; }
  const cs = Math.cos(p.yaw), sn = Math.sin(p.yaw), d = p.halfWid + 0.75;
  me.x = p.x + cs * d; me.z = p.z - sn * d; me.y = this.map.heightAt(me.x, me.z);
  me.yaw = p.yaw; me.vx = me.vz = 0; me.speed = 0; me.down = 0; me.aim = 0;
  f.yaw = p.yaw; f.pitch = 0.08; f.on = true; f.shotT = 9;
  p.vx = p.vz = 0;
  this.touch.setMode('foot');
  document.body.classList.add('onfoot');
  this.hud.hidePrompt(); this.spotNear = null;
  this.sfx('door');
  if (!this.footHint) { this.footHint = true; this.hud.toast('Arraste à direita para olhar · ATIRAR dispara · ENTRAR perto de um carro', 5); }
};

// carro mais próximo em que dá para entrar
G.findCar = function () {
  const f = this.foot, me = f.me, p = this.player;
  let best = null, bd = 3.6 * 3.6;
  const test = (x, z, ref) => { const d = (x - me.x) ** 2 + (z - me.z) ** 2; if (d < bd) { bd = d; best = ref; } };
  test(p.x, p.z, { type: 'own' });
  f.parked.forEach((c, i) => { if (!c.wreck) test(c.x, c.z, { type: 'parked', i }); });
  for (const c of this.traffic.cars) if (c.active && c.speed < 7) test(c.x, c.z, { type: 'traffic', c });
  return best;
};

G.enterCar = function () {
  const f = this.foot, p = this.player;
  if (!f.on || f.deadT > 0) return;
  const t = this.findCar();
  if (!t) return;
  if (t.type !== 'own') {
    // deixa o carro atual estacionado e assume o outro
    const cur = { key: p.model, color: this.view.paintMat.color.getHex(), x: p.x, y: p.y, z: p.z, yaw: p.yaw, owned: f.owned, t: 0 };
    let nx;
    if (t.type === 'traffic') {
      const c = t.c;
      nx = { key: c.key === 'police' ? 'sedan' : c.key, color: c.color, x: c.x, y: c.y, z: c.z, yaw: c.yaw, owned: false };
      c.active = false;
      // o motorista é expulso e foge
      const drv = this.spawnCiv(c.x + Math.cos(c.yaw) * 1.6, c.z - Math.sin(c.yaw) * 1.6);
      if (drv) drv.flee = 9;
      this.police.crime(0.9, this.police.patrolSees());
      this.hud.toast('Carro roubado');
    } else nx = f.parked.splice(t.i, 1)[0];
    f.parked.push(cur);
    while (f.parked.filter((q) => !q.owned && !q.wreck).length > 2) f.parked.splice(f.parked.findIndex((q) => !q.owned && !q.wreck), 1);
    f.owned = nx.owned;
    const spec = nx.owned ? effectiveSpec(carById(this.save.car), this.save.owned[this.save.car]) : this.stockSpec(nx.key);
    p.setSpec(spec, nx.key);
    p.place(nx.x, nx.z, nx.yaw, this.map);
    p.damage = 0;
    this.view.setCar(nx.key, nx.color);
    this.view.repair();
  }
  f.on = false; f.me.aim = 0;
  for (const u of this.police.units) u.hold = false;
  this.touch.setMode('drive'); this.touch.setNear(false);
  document.body.classList.remove('onfoot');
  this.cam.snap();
  this.sfx('door');
};

G.reloadGun = function () {
  const f = this.foot, w = WEAPONS[f.w];
  if (!f.on || f.reloadT > 0 || f.ammo[f.w] >= w.mag) return;
  f.reloadT = w.reload;
  this.sfx('reload');
};

// ---------- movimento com colisão (prédios, árvores, carros) ----------
G.movePerson = function (p, dt) {
  const map = this.map, r = p.r;
  const ox = p.x, oz = p.z;
  p.x += p.vx * dt; p.z += p.vz * dt;
  const ix0 = Math.floor((p.x - r) / 32), ix1 = Math.floor((p.x + r) / 32), iz0 = Math.floor((p.z - r) / 32), iz1 = Math.floor((p.z + r) / 32);
  for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
    const cell = map.colGet(ix, iz);
    if (!cell) continue;
    for (const bi of cell.b) {
      const b = map.boxes[bi];
      if (b[4] < 0.6) continue;
      const qx = clamp(p.x, b[0], b[2]), qz = clamp(p.z, b[1], b[3]);
      const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x += (dx / d) * (r - d); p.z += (dz / d) * (r - d); } else { p.x = ox; p.z = oz; }
    }
    for (const ci of cell.c) {
      const c = map.circles[ci], dx = p.x - c[0], dz = p.z - c[1], rr = r + c[2], d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2); p.x += (dx / d) * (rr - d); p.z += (dz / d) * (rr - d); }
    }
  }
  // carros
  const cars = this.bodies;
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (c.active === false) continue;
    const dx0 = p.x - c.x, dz0 = p.z - c.z;
    if (dx0 * dx0 + dz0 * dz0 > 16) continue;
    const sn = Math.sin(c.yaw), cs = Math.cos(c.yaw);
    for (let k = -1; k <= 1; k++) {
      const cx = c.x + sn * c.co * k, cz = c.z + cs * c.co * k, dx = p.x - cx, dz = p.z - cz, rr = r + c.cr, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2); p.x += (dx / d) * (rr - d); p.z += (dz / d) * (rr - d); }
    }
  }
  const h = map.heightAt(p.x, p.z);
  if (h < WATER_Y - 0.5 || h - p.y > 1.2) { p.x = ox; p.z = oz; } else p.y = h;
};

// ---------- traçado do tiro: pessoas, carros, prédios e chão ----------
G.trace = function (ox, oy, oz, dx, dy, dz, tMin, range, skip) {
  const f = this.foot, map = this.map;
  let best = range; _hit.type = ''; _hit.ref = null;
  const cyl = (px, pz, y0, y1, r, type, ref) => {
    const ex = ox - px, ez = oz - pz, a = dx * dx + dz * dz;
    if (a < 1e-9) return;
    const b = 2 * (ex * dx + ez * dz), c = ex * ex + ez * ez - r * r, disc = b * b - 4 * a * c;
    if (disc < 0) return;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < tMin || t > best) return;
    const y = oy + dy * t;
    if (y < y0 || y > y1) return;
    best = t; _hit.type = type; _hit.ref = ref;
  };
  for (const p of f.cops) if (p !== skip && p.down <= 0) cyl(p.x, p.z, p.y - 0.05, p.y + 1.85, 0.42, 'cop', p);
  for (const p of f.civs) if (p.down <= 0) cyl(p.x, p.z, p.y - 0.05, p.y + 1.85, 0.4, 'civ', p);
  if (skip && f.on && f.me.down <= 0) cyl(f.me.x, f.me.z, f.me.y, f.me.y + 1.8, 0.4, 'me', f.me);
  for (const c of this.bodies) {
    if (c.active === false) continue;
    const ddx = c.x - ox, ddz = c.z - oz;
    if (ddx * ddx + ddz * ddz > (range + 4) * (range + 4)) continue;
    const sn = Math.sin(c.yaw), cs = Math.cos(c.yaw);
    for (let k = -1; k <= 1; k++) cyl(c.x + sn * c.co * k, c.z + cs * c.co * k, c.y, c.y + 1.45, c.cr, 'car', c);
  }
  // mundo: avança pelo raio até cruzar o chão ou um prédio
  for (let t = Math.max(tMin, 0.5); t < best; t += 0.7) {
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    let blocked = y < map.heightAt(x, z);
    if (!blocked) {
      const cell = map.colCell(x, z);
      if (cell) for (const bi of cell.b) { const b = map.boxes[bi]; if (y < b[4] && x > b[0] && x < b[2] && z > b[1] && z < b[3]) { blocked = true; break; } }
    }
    if (blocked) { best = t - 0.35; _hit.type = 'world'; _hit.ref = null; break; }
  }
  _hit.t = best; _hit.x = ox + dx * best; _hit.y = oy + dy * best; _hit.z = oz + dz * best;
  return _hit;
};

G.addTracer = function (ax, ay, az, bx, by, bz) {
  const tr = this.foot.tracers;
  if (tr.length >= 24) tr.shift();
  tr.push({ ax, ay, az, bx, by, bz, t: 0.07 });
};

// disparo do jogador: mira pelo centro da tela, rastro sai do cano até o ponto atingido
G.fireGun = function () {
  const f = this.foot, me = f.me, w = WEAPONS[f.w], cam = this.cam.cam;
  if (f.reloadT > 0 || f.fireT > 0) return;
  if (f.ammo[f.w] <= 0) { this.reloadGun(); return; }
  f.ammo[f.w]--; f.fireT = w.rate; f.shotT = 0; me.recoil = 1;
  const cp = Math.cos(f.pitch), sn = Math.sin(f.yaw), cs = Math.cos(f.yaw);
  let dx = sn * cp, dy = Math.sin(f.pitch), dz = cs * cp;
  const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
  const tMin = Math.hypot(me.x - ox, me.z - oz) + 0.5;
  // assistência de mira: puxa o tiro para um policial perto do centro da tela
  let tgt = null, bestDot = 0.985;
  for (const c of f.cops) {
    if (c.down > 0) continue;
    const ex = c.x - ox, ey = c.y + 1.2 - oy, ez = c.z - oz, l = Math.hypot(ex, ey, ez);
    if (l > w.range) continue;
    const dot = (ex * dx + ey * dy + ez * dz) / l;
    if (dot > bestDot) { bestDot = dot; tgt = [ex / l, ey / l, ez / l]; }
  }
  if (tgt) { dx = lerp(dx, tgt[0], 0.75); dy = lerp(dy, tgt[1], 0.75); dz = lerp(dz, tgt[2], 0.75); }
  const mx = me.x + Math.sin(me.yaw) * 0.55 - Math.cos(me.yaw) * 0.2, my = me.y + 1.42 + f.pitch * 0.4, mz = me.z + Math.cos(me.yaw) * 0.55 + Math.sin(me.yaw) * 0.2;
  let hitSomething = false;
  for (let k = 0; k < w.pellets; k++) {
    const sx = (Math.random() - 0.5) * 2 * w.spread, sy = (Math.random() - 0.5) * 2 * w.spread, sz = (Math.random() - 0.5) * 2 * w.spread;
    const h = this.trace(ox, oy, oz, dx + sx, dy + sy, dz + sz, tMin, w.range, null);
    this.addTracer(mx, my, mz, h.x, h.y, h.z);
    if (h.type === 'cop' || h.type === 'civ') { this.hurtPerson(h.ref, w.dmg, h.type); hitSomething = true; }
    else if (h.type === 'car') { this.hurtCar(h.ref, w.dmg); this.fxp.sparks(h.x, h.y - 0.3, h.z, 2); hitSomething = true; }
    else if (h.type === 'world') { this.fxp.sparks(h.x, h.y - 0.35, h.z, 1); this.fxp.emit(h.x, h.y, h.z, 0, 0.6, 0, 0.5, 0.25, 0.9, 0.7, 0.68, 0.62); }
  }
  if (hitSomething) f.hitT = 0.12;
  f.pitch = clamp(f.pitch + w.kick, -0.6, 0.9);
  this.cam.kick(0.06 + w.kick);
  this.sfx('shot', f.w);
  vibrate(12, this.opt.vibrate);
  // barulho: pedestres fogem; a polícia reage
  for (const c of f.civs) if (c.down <= 0 && (c.x - me.x) ** 2 + (c.z - me.z) ** 2 < 60 * 60) c.flee = 8;
  if (this.police.stars === 0) this.police.crime(0.35, this.police.patrolSees());
};

G.hurtPerson = function (p, dmg, type) {
  p.hp -= dmg;
  if (type === 'civ') { p.flee = 9; this.police.raise(2); }
  else { this.police.raise(3); this.police.heat += 0.12; }
  if (p.hp <= 0 && p.down <= 0) {
    p.down = 0.01; p.downT = 0; p.vx = p.vz = 0; p.speed = 0;
    if (type === 'cop') this.police.heat += 0.45; else this.police.heat += 0.6;
  }
};

G.hurtCar = function (c, dmg) {
  if (c === this.player || c.kind === 'parked') return;
  c.hp = (c.hp == null ? (c.kind === 'traffic' ? 110 : 190) : c.hp) - dmg;
  if (c.kind === 'traffic') {
    if (c.mode !== 2) {
      c.onCarHit(5);
      if (!c.fled && !c.police) { c.fled = true; const d = this.spawnCiv(c.x + Math.cos(c.yaw) * 1.6, c.z - Math.sin(c.yaw) * 1.6); if (d) d.flee = 9; }
    }
    this.police.crime(0.3, this.police.patrolSees());
    if (c.police) this.police.raise(2);
  } else this.police.heat += 0.05;
  if (c.hp <= 0) this.explode(c);
};

G.explode = function (c) {
  const f = this.foot;
  f.booms.push({ x: c.x, y: c.y + 0.8, z: c.z, t: 0 });
  f.parked.push({ key: c.key || 'police', color: 0x141414, x: c.x, y: c.y, z: c.z, yaw: c.yaw, wreck: true, t: 0, owned: false });
  if (c.kind === 'traffic') c.active = false;
  else { const i = this.police.units.findIndex((u) => u.v === c); if (i >= 0) this.police.units.splice(i, 1); const j = this.police.blocks.findIndex((u) => u.v === c); if (j >= 0) this.police.blocks.splice(j, 1); this.police.heat += 0.5; }
  this.fxp.sparks(c.x, c.y + 0.6, c.z, 14);
  for (let k = 0; k < 8; k++) this.fxp.emit(c.x + (Math.random() - 0.5) * 2, c.y + 1 + Math.random(), c.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 3, 1.6 + Math.random(), 1.2, 5, 0.16, 0.15, 0.14);
  this.sfx('boom');
  this.cam.kick(0.7);
  vibrate([40, 30, 80], this.opt.vibrate);
  // dano em área
  const R = 8.5;
  const hit = (p, type) => { const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < R && p.down <= 0) this.hurtPerson(p, 130 * (1 - d / R), type); };
  f.cops.forEach((p) => hit(p, 'cop')); f.civs.forEach((p) => hit(p, 'civ'));
  if (f.on) { const d = Math.hypot(f.me.x - c.x, f.me.z - c.z); if (d < R) this.hurtPlayer(95 * (1 - d / R)); }
  for (const o of this.traffic.cars) if (o.active && o !== c && Math.hypot(o.x - c.x, o.z - c.z) < R) this.hurtCar(o, 70);
  this.police.raise(2);
};

G.hurtPlayer = function (dmg) {
  const f = this.foot;
  if (!f.on || f.deadT > 0) return;
  f.hp -= dmg; f.hurtT = 0;
  this.cam.kick(0.15);
  this.sfx('hurt');
  vibrate(25, this.opt.vibrate);
  if (f.hp <= 0) {
    f.hp = 0; f.deadT = 0.01; f.me.down = 0.01;
    this.hud.msg('ABATIDO', 'Você acorda na oficina', 3);
    this.sfx('lose');
  }
};

// ---------- pedestres e policiais ----------
G.spawnCiv = function (x, z) {
  const f = this.foot;
  if (f.civs.length >= 12) return null;
  const p = newPerson('civ', makeLook(this.footRng, 'civ'));
  p.hp = 60; p.x = x; p.z = z; p.y = this.map.heightAt(x, z); p.yaw = this.footRng() * 6.28;
  f.civs.push(p);
  return p;
};
G.spawnWalker = function () {
  const f = this.foot, map = this.map, rng = this.footRng, c = this.chaseTarget();
  const a = rng() * 6.28, r = 38 + rng() * 60;
  const ne = map.nearestEdge(c.x + Math.sin(a) * r, c.z + Math.cos(a) * r);
  if (!ne || ne.dist > 25 || !(ne.edge.type === 'street' || ne.edge.type === 'avenue')) return;
  const e = ne.edge, side = rng() < 0.5 ? 1 : -1;
  const p = this.spawnCiv(ne.x, ne.z);
  if (!p) return;
  p.e = e; p.s = ne.s; p.side = side; p.dir = rng() < 0.5 ? 1 : -1; p.pace = 1.1 + rng() * 0.5;
};

G.spawnCop = function (u) {
  const f = this.foot, v = u.v;
  if (f.cops.length >= 6) return null;
  const p = newPerson('cop', makeLook(this.footRng, 'cop'));
  p.hp = 90 + this.police.stars * 12;
  p.x = v.x + Math.cos(v.yaw) * 1.7; p.z = v.z - Math.sin(v.yaw) * 1.7; p.y = this.map.heightAt(p.x, p.z); p.yaw = v.yaw;
  p.fireT = 0.8 + this.footRng();
  f.cops.push(p);
  return p;
};

G.footStep = function (dt) {
  const f = this.foot, me = f.me, map = this.map, P = this.police, pv = this.player;
  // carros estacionados/destroços envelhecem
  for (let i = f.parked.length - 1; i >= 0; i--) {
    const c = f.parked[i];
    c.t += dt;
    const far = Math.hypot(c.x - this.chaseTarget().x, c.z - this.chaseTarget().z) > 260;
    if ((c.wreck && c.t > 40) || (!c.owned && far)) f.parked.splice(i, 1);
  }
  for (let i = f.booms.length - 1; i >= 0; i--) { f.booms[i].t += dt; if (f.booms[i].t > 0.7) f.booms.splice(i, 1); }
  for (let i = f.tracers.length - 1; i >= 0; i--) { f.tracers[i].t -= dt; if (f.tracers[i].t <= 0) f.tracers.splice(i, 1); }
  f.hitT = Math.max(0, f.hitT - dt);

  if (f.on) {
    const inp = this.input.readFoot(_in);
    if (f.deadT > 0) {
      f.deadT += dt; me.down = Math.min(1, me.down + dt * 2.2); me.speed = 0;
      if (f.deadT > 3) {
        const fee = Math.min(5000, Math.round((this.save.money * 0.05) / 10) * 10);
        this.save.money -= fee; persist(this.save, true);
        P.clear(); this.footReset();
        const g = map.garage;
        pv.place(g.x, g.z, 0, map); this.world.preload(g.x, g.z); this.cam.snap();
        this.hud.toast(fee ? 'Despesas médicas: ' + fmtMoney(fee) : 'De volta à oficina');
      }
    } else {
      f.yaw -= inp.lookX; f.pitch = clamp(f.pitch - inp.lookY, -0.55, 0.8);
      const aiming = inp.aim || inp.fire || f.shotT < 0.7;
      const sn = Math.sin(f.yaw), cs = Math.cos(f.yaw);
      const l = Math.hypot(inp.mx, inp.mz);
      const sp = l < 0.12 ? 0 : (inp.aim ? 2.3 : l > 0.78 ? 5.8 : 2.4) * Math.min(1, l * 1.2);
      const wx = l > 0 ? (sn * inp.mz - cs * inp.mx) / l : 0, wz = l > 0 ? (cs * inp.mz + sn * inp.mx) / l : 0;
      me.vx = damp(me.vx, wx * sp, 12, dt); me.vz = damp(me.vz, wz * sp, 12, dt);
      this.movePerson(me, dt);
      me.speed = Math.hypot(me.vx, me.vz);
      const face = aiming ? f.yaw : me.speed > 0.4 ? Math.atan2(me.vx, me.vz) : me.yaw;
      me.yaw += angleDiff(face, me.yaw) * (1 - Math.exp(-(aiming ? 22 : 12) * dt));
      me.aim = damp(me.aim, aiming ? 1 : 0, 14, dt); me.aimPitch = f.pitch;
      f.fireT = Math.max(0, f.fireT - dt); f.shotT += dt;
      if (f.reloadT > 0) { f.reloadT -= dt; if (f.reloadT <= 0) f.ammo[f.w] = WEAPONS[f.w].mag; }
      if (inp.fire) this.fireGun();
      f.hurtT += dt;
      if (f.hurtT > 7 && f.hp < 100) f.hp = Math.min(100, f.hp + dt * 7);
      f.near = this.findCar();
      this.touch.setNear(!!f.near);
    }
    me.phase += dt * (me.speed * 1.75 + (me.speed > 0.2 ? 1.2 : 0));
    me.recoil = Math.max(0, me.recoil - dt * 9);
    const px = f.proxy; px.x = me.x; px.y = me.y; px.z = me.z; px.vx = me.vx; px.vz = me.vz; px.speed = me.speed; px.yaw = f.yaw;
  }

  // policiais desembarcam quando a viatura chega perto de quem está a pé
  if (f.on && P.stars > 0) {
    for (const u of P.units) {
      const d = Math.hypot(u.v.x - me.x, u.v.z - me.z);
      if (!u.officer && d < 27) { u.hold = true; if (u.v.speed < 2.5) u.officer = this.spawnCop(u) || u.officer; }
    }
  }
  for (let i = f.cops.length - 1; i >= 0; i--) {
    const c = f.cops[i];
    if (c.down > 0) { c.down = Math.min(1, c.down + dt * 2.2); c.downT += dt; if (c.downT > 25) f.cops.splice(i, 1); continue; }
    const dx = me.x - c.x, dz = me.z - c.z, d = Math.hypot(dx, dz);
    if (!f.on || P.stars === 0 || d > 140) { c.aim = damp(c.aim, 0, 8, dt); c.speed = 0; c.downT += dt; if (c.downT > 4) f.cops.splice(i, 1); continue; }
    c.downT = 0;
    const los = d < 70 && map.lineOfSight(c.x, c.z, me.x, me.z);
    const want = Math.atan2(dx, dz);
    c.yaw += angleDiff(want, c.yaw) * (1 - Math.exp(-10 * dt));
    const shootRange = P.stars >= 2 ? 26 : 2.4;
    if (d > shootRange || !los) {
      // corre até ter visada
      c.vx = damp(c.vx, (dx / d) * 4.6, 8, dt); c.vz = damp(c.vz, (dz / d) * 4.6, 8, dt);
      this.movePerson(c, dt);
      c.aim = damp(c.aim, 0, 8, dt);
    } else {
      c.vx = damp(c.vx, 0, 10, dt); c.vz = damp(c.vz, 0, 10, dt);
      this.movePerson(c, dt);
      if (P.stars >= 2) {
        c.aim = damp(c.aim, 1, 10, dt); c.aimPitch = Math.atan2(me.y - c.y, d) * 0.6;
        c.fireT -= dt;
        if (c.fireT <= 0 && f.deadT <= 0) {
          c.fireT = Math.max(0.5, 1.45 - P.stars * 0.15) * (0.8 + Math.random() * 0.5);
          c.recoil = 1;
          const acc = clamp(0.5 - d * 0.012 + P.stars * 0.03 - (me.speed > 3 ? 0.2 : 0), 0.06, 0.6);
          const hit = Math.random() < acc;
          const ex = me.x + (hit ? 0 : (Math.random() - 0.5) * 3), ey = me.y + (hit ? 1.1 : 0.4 + Math.random() * 2), ez = me.z + (hit ? 0 : (Math.random() - 0.5) * 3);
          this.addTracer(c.x + Math.sin(c.yaw) * 0.5, c.y + 1.42, c.z + Math.cos(c.yaw) * 0.5, ex, ey, ez);
          this.sfx('shot2', clamp(1 - d / 60, 0.15, 1));
          if (hit) this.hurtPlayer(4 + P.stars * 1.5);
        }
      } else {
        // 1 estrela: voz de prisão
        c.aim = damp(c.aim, 0.6, 8, dt);
        if (me.speed < 1.5) { P.bustT += dt; if (P.bustT > 1.6) { P.busted(); this.footReset(); return; } }
      }
    }
    c.speed = Math.hypot(c.vx, c.vz);
    c.phase += dt * (c.speed * 1.75 + (c.speed > 0.2 ? 1.2 : 0));
    c.recoil = Math.max(0, c.recoil - dt * 9);
  }

  // pedestres: andam na calçada; fogem de tiros; podem ser atropelados
  f.spawnT -= dt;
  const wantCiv = [0, 5, 7, 9][this.opt.traffic] || 0;
  if (f.spawnT <= 0 && this.state === 'roam') { f.spawnT = 0.4; if (f.civs.length < wantCiv) this.spawnWalker(); }
  const ct = this.chaseTarget();
  for (let i = f.civs.length - 1; i >= 0; i--) {
    const c = f.civs[i];
    const d = Math.hypot(c.x - ct.x, c.z - ct.z);
    if (c.down > 0) { c.down = Math.min(1, c.down + dt * 2.2); c.downT += dt; if (c.downT > 25 || d > 150) f.civs.splice(i, 1); continue; }
    if (d > 135) { f.civs.splice(i, 1); continue; }
    if (c.flee > 0) {
      c.flee -= dt;
      const tx = c.x - (f.on ? me.x : pv.x), tz = c.z - (f.on ? me.z : pv.z), l = Math.hypot(tx, tz) || 1;
      c.vx = damp(c.vx, (tx / l) * 5.2, 6, dt); c.vz = damp(c.vz, (tz / l) * 5.2, 6, dt);
      this.movePerson(c, dt);
      c.yaw += angleDiff(Math.atan2(c.vx, c.vz), c.yaw) * (1 - Math.exp(-10 * dt));
      c.e = null;
    } else if (c.e) {
      const e = c.e;
      c.s += c.dir * c.pace * dt;
      if (c.s < 9 || c.s > e.len - 9) { c.dir *= -1; c.s = clamp(c.s, 9, e.len - 9); }
      const Pp = map.pointOnEdge(e, c.s), off = (e.width / 2 + 1.9) * c.side;
      c.x = Pp.x + Pp.nx * off; c.z = Pp.z + Pp.nz * off; c.y = map.heightAt(c.x, c.z);
      c.vx = Pp.dx * c.dir * c.pace; c.vz = Pp.dz * c.dir * c.pace;
      c.yaw += angleDiff(Math.atan2(c.vx, c.vz), c.yaw) * (1 - Math.exp(-8 * dt));
    } else { c.vx = damp(c.vx, 0, 6, dt); c.vz = damp(c.vz, 0, 6, dt); }
    c.speed = Math.hypot(c.vx, c.vz);
    c.phase += dt * (c.speed * 1.75 + (c.speed > 0.2 ? 1.2 : 0));
    // atropelamento pelo carro do jogador
    if (!f.on && pv.speed > 5) {
      const sn = Math.sin(pv.yaw), cs = Math.cos(pv.yaw);
      for (let k = -1; k <= 1; k++) {
        const dx = c.x - (pv.x + sn * pv.co * k), dz = c.z - (pv.z + cs * pv.co * k);
        if (dx * dx + dz * dz < (pv.cr + 0.3) ** 2) { this.hurtPerson(c, pv.speed * 9, 'civ'); c.yaw = pv.yaw; this.sfx('crash', 0.3); break; }
      }
    }
  }
  // a pé também se é atropelado
  f.runT -= dt;
  if (f.on && f.deadT <= 0 && f.runT <= 0) for (const b of this.bodies) {
    if (b === pv || b.active === false) continue;
    const sp = Math.hypot(b.vx, b.vz);
    if (sp < 5) continue;
    const dx = me.x - b.x, dz = me.z - b.z, sn = Math.sin(b.yaw), cs = Math.cos(b.yaw);
    if (Math.abs(dx * sn + dz * cs) < b.halfLen + 0.3 && Math.abs(dx * cs - dz * sn) < b.halfWid + 0.25) { this.hurtPlayer(sp * 3); f.runT = 0.8; break; }
  }
};

// corpos imóveis (carros estacionados e destroços) para as colisões
G.footBodies = function (dyn) {
  for (const c of this.foot.parked) {
    if (!c.body) { const d = MODEL_DIMS[c.key === 'police' ? 'sedan' : c.key]; c.body = { kind: 'parked', x: c.x, y: c.y, z: c.z, yaw: c.yaw, vx: 0, vz: 0, yawRate: 0, mass: 1e6, halfLen: d.len / 2, halfWid: d.wid / 2, cr: d.wid / 2, co: d.len / 2 - d.wid / 2 }; }
    c.body.x = c.x; c.body.z = c.z; c.body.vx = c.body.vz = 0;
    dyn.push(c.body);
  }
};

G.footDraw = function (fl, night) {
  const f = this.foot, pp = this.people;
  pp.begin();
  if (f.on) { pp.draw(f.me); fl.shadow(f.me.x, f.me.y, f.me.z, f.me.yaw, 0, 0.42, 0.42, 1); }
  for (const c of f.cops) { pp.draw(c); fl.shadow(c.x, c.y, c.z, c.yaw, 0, 0.42, 0.42, 1); }
  for (const c of f.civs) { pp.draw(c); fl.shadow(c.x, c.y, c.z, c.yaw, 0, 0.42, 0.42, 1); }
  pp.end();
  for (const c of f.parked) {
    const d = MODEL_DIMS[c.key === 'police' ? 'sedan' : c.key];
    fl.car(c.key, c.x, c.y, c.z, c.yaw, 0, 0, c.color);
    fl.shadow(c.x, c.y, c.z, c.yaw, 0, d.len / 2, d.wid / 2);
    if (c.wreck && c.t < 30 && Math.random() < 0.25) this.fxp.emit(c.x + (Math.random() - 0.5), c.y + 1.2, c.z + (Math.random() - 0.5), 0, 1.6, 0, 1.8, 0.8, 3, 0.12, 0.11, 0.1);
  }
  for (const b of f.booms) {
    const k = 1 - b.t / 0.7;
    fl.glow(b.x, b.y + b.t * 3, b.z, 3 + b.t * 9, 0xff8a2a, 2.2 * k);
    fl.glow(b.x, b.y + b.t * 2, b.z, 1.5 + b.t * 5, 0xfff0c0, 2.5 * k);
  }
  // clarão do cano
  const flash = (p) => { if (p.recoil > 0.7) fl.glow(p.x + Math.sin(p.yaw) * 0.75, p.y + 1.42, p.z + Math.cos(p.yaw) * 0.75, 0.38, 0xffd27a, 2); };
  if (f.on) flash(f.me);
  f.cops.forEach(flash);
  // rastros
  const pos = this.tracerMesh.geometry.attributes.position, a = pos.array;
  let n = 0;
  for (const t of f.tracers) { a[n++] = t.ax; a[n++] = t.ay; a[n++] = t.az; a[n++] = t.bx; a[n++] = t.by; a[n++] = t.bz; }
  pos.needsUpdate = true;
  this.tracerMesh.geometry.setDrawRange(0, f.tracers.length * 2);
};
