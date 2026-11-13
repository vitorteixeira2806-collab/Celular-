// Núcleo do jogo: renderer, laço de física com passo fixo, estados e integração dos sistemas.
import * as THREE from 'three';
import { generateMap } from '../world/map.js';
import { WorldView } from '../world/worldview.js';
import { Vehicle, collideCars } from '../vehicles/vehicle.js';
import { Fleet } from '../vehicles/fleet.js';
import { Traffic } from './traffic.js';
import { CarView } from '../vehicles/carview.js';
import { carById, effectiveSpec } from '../vehicles/cars.js';
import { ChaseCamera } from './camera.js';
import { Input } from '../ui/input.js';
import { TouchControls } from '../ui/touch.js';
import { loadSave, persist } from '../core/save.js';
import { requestWake, releaseWake, lockLandscape, vibrate, isPortrait } from '../core/platform.js';
import { clamp } from '../core/util.js';

const STEP = 1 / 60;
// escada de qualidade (0 = mais leve). cap = pixel ratio máximo (nunca acima de 2)
const QUALITY = [
  { cap: 1, scale: 0.75, radius: 2, propDist: 170, fogFar: 380, spot: false },
  { cap: 1, scale: 1, radius: 2, propDist: 200, fogFar: 400, spot: false },
  { cap: 1.25, scale: 1, radius: 3, propDist: 260, fogFar: 520, spot: false },
  { cap: 1.5, scale: 1, radius: 3, propDist: 300, fogFar: 580, spot: true },
  { cap: 1.75, scale: 1, radius: 4, propDist: 380, fogFar: 720, spot: true },
  { cap: 2, scale: 1, radius: 4, propDist: 460, fogFar: 780, spot: true },
];

export class Game {
  constructor(els) {
    this.els = els;
    this.save = loadSave();
    this.opt = this.save.options;
    this.map = generateMap();
    this.time = 0; this.acc = 0; this.last = 0; this.frameNo = 0;
    this.paused = false; this.hiddenPause = false; this.state = 'title';
    this.fps = 60; this.fpsAcc = 0; this.fpsN = 0;

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: false, powerPreference: 'high-performance', stencil: false }));
    r.setClearColor(0x87b5d6);
    this.scene = new THREE.Scene();
    this.cam = new ChaseCamera(innerWidth / innerHeight);
    this.pixelScale = 1;

    this.pixelCap = 2;
    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6b6558, 1.15);
    this.sun = new THREE.DirectionalLight(0xfff1d8, 1.6);
    this.sun.position.set(120, 200, 80);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    // jogador
    const car = carById(this.save.car), own = this.save.owned[car.id];
    this.player = new Vehicle(effectiveSpec(car, own), car.model);
    this.player.detail = true;
    this.player.kind = 'player';
    this.view = new CarView();
    this.view.setCar(car.model, own.color);
    this.scene.add(this.view.group);
    const m = this.map;
    this.player.place(m.GX[m.AV_I] + 4.5, m.GZ[m.AV_J + 1] - 50, Math.PI, m);
    this.player.onImpact = (imp, lx, lz, nx, nz) => this.onPlayerImpact(imp, lx, lz, nx, nz);
    this.player.onLand = (imp) => { if (imp > 5) { this.cam.kick(clamp(imp * 0.03, 0, 0.5)); vibrate(30, this.opt.vibrate); } };

    this.input = new Input(this.opt);
    this.touch = new TouchControls(els.touch, this.input, this.opt);
    this.input.onKey = (code) => this.onKey(code);

    this.initWorld();
    this.fleet = new Fleet(this.scene);
    this.traffic = new Traffic(this.map);
    this.traffic.setDensity(this.opt.traffic);
    this.dyn = []; this.bodies = [];
    this.camDir = { x: 0, z: 1 };
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    addEventListener('pagehide', () => persist(this.save, true));
    this.frame = this.frame.bind(this);
  }

  initWorld() {
    this.world = new WorldView(this.scene, this.map, { hemi: this.hemi, sun: this.sun });
    this.applyQuality();
    this.world.preload(this.player.x, this.player.z);
  }

  // qualidade: nível manual (low/med/high) ou automático conforme o fps
  applyQuality() {
    const o = this.opt;
    let lvl = o.quality;
    if (lvl === 'auto') lvl = this.autoLevel == null ? (this.autoLevel = 3) : this.autoLevel;
    else lvl = { low: 1, med: 3, high: 5 }[lvl];
    const L = QUALITY[lvl];
    this.q = L;
    this.pixelScale = L.scale;
    this.pixelCap = L.cap;
    this.world.setQuality(L);
    this.resize();
  }

  autoQuality(dt) {
    if (this.opt.quality !== 'auto' || this.paused || this.world.loading) return;
    const target = this.opt.battery ? 30 : 60;
    this.aqT = (this.aqT || 0) + dt;
    this.aqN = (this.aqN || 0) + 1;
    if (this.aqT < 2.5) return;
    const fps = this.aqN / this.aqT;
    this.aqT = 0; this.aqN = 0;
    this.aqCool = Math.max(0, (this.aqCool || 0) - 1);
    if (fps < target * 0.8 && this.autoLevel > 0) {
      this.autoLevel--; this.aqFail = this.autoLevel + 1; this.aqCool = 8; this.applyQuality();
    } else if (fps > target * 0.96 && this.autoLevel < 5 && !this.aqCool) {
      // só sobe se o nível acima não falhou recentemente
      if (this.aqFail === this.autoLevel + 1) { this.aqStable = (this.aqStable || 0) + 1; if (this.aqStable < 10) return; this.aqStable = 0; }
      this.autoLevel++; this.aqCool = 3; this.applyQuality();
    }
  }

  start() { requestAnimationFrame(this.frame); }

  // primeiro toque: libera áudio, wake lock e orientação
  async firstGesture() {
    if (this.gestured) return;
    this.gestured = true;
    requestWake();
    lockLandscape();
  }

  setState(s) {
    this.state = s;
    const driving = s === 'roam' || s === 'race';
    this.els.hud.classList.toggle('hidden', !driving);
    this.els.touch.classList.toggle('hidden', !driving);
    if (driving) this.touch.layout(); else { this.touch.clear(); this.input.releaseAll(); }
  }

  setPaused(p) {
    if (this.paused === p) return;
    this.paused = p;
    if (p) { this.touch.clear(); this.input.releaseAll(); }
  }

  onVisibility() {
    if (document.visibilityState === 'hidden') {
      this.hiddenPause = true;
      persist(this.save, true);
      releaseWake();
      if (this.onAutoPause) this.onAutoPause();
    } else {
      this.hiddenPause = false;
      this.last = 0;
      if (this.gestured) requestWake();
    }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const portrait = isPortrait();
    document.body.classList.toggle('portrait', portrait);
    this.portrait = portrait;
    if (portrait && this.onAutoPause && (this.state === 'roam' || this.state === 'race')) this.onAutoPause();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.pixelCap || 2, 2) * this.pixelScale);
    this.renderer.setSize(w, h, false);
    this.cam.cam.aspect = w / h;
    this.cam.cam.updateProjectionMatrix();
    this.touch.layout();
  }

  onKey(code) {
    if (code === 'KeyC') this.cam.cycle();
  }

  onPlayerImpact(imp, lx, lz, nx, nz) {
    if (imp < 2.5) return;
    const s = clamp(imp / 22, 0, 1);
    this.cam.kick(s * 0.6);
    vibrate(Math.round(20 + s * 80), this.opt.vibrate);
    if (imp > 5) this.view.dent(lx, lz, nx, nz, 0.05 + s * 0.22);
  }

  frame(now) {
    requestAnimationFrame(this.frame);
    if (this.opt.battery && this.last && now - this.last < 1000 / 30 - 3) return;
    let dt = this.last ? (now - this.last) / 1000 : STEP;
    this.last = now;
    if (dt > 0.25) dt = 0.25;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    if (this.hiddenPause || this.portrait) return;
    this.frameNo++;
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 4) { this.step(STEP); this.acc -= STEP; n++; }
      if (n === 4) this.acc = 0;
    }
    this.render(dt);
  }

  step(dt) {
    this.time += dt;
    const p = this.player;
    if (this.state === 'roam' || this.state === 'race') this.input.read(p.in);
    else { p.in.throttle = 0; p.in.brake = 1; p.in.steer = 0; p.in.handbrake = true; p.in.nitro = false; }
    p.step(dt, this.map);

    // corpos dinâmicos (jogador, rivais, polícia) e trânsito
    const dyn = this.dyn, bodies = this.bodies, tc = this.traffic.cars;
    dyn.length = 0; bodies.length = 0;
    dyn.push(p);
    this.collectDynamics(dyn);
    for (let i = 0; i < dyn.length; i++) bodies.push(dyn[i]);
    for (let i = 0; i < tc.length; i++) if (tc[i].active) bodies.push(tc[i]);
    this.stepSystems(dt);
    this.traffic.step(dt, this.time, bodies, p, this.camDir);
    for (let i = 0; i < dyn.length; i++) {
      for (let j = i + 1; j < dyn.length; j++) collideCars(dyn[i], dyn[j]);
      for (let j = 0; j < tc.length; j++) if (tc[j].active) collideCars(dyn[i], tc[j]);
    }
    for (let i = 0; i < tc.length; i++) {
      const c = tc[i];
      if (!c.active || c.mode !== 2) continue;
      for (let j = 0; j < tc.length; j++) if (j !== i && tc[j].active) collideCars(c, tc[j]);
    }
  }

  // ganchos preenchidos pelos modos de jogo (rivais, polícia)
  collectDynamics() {}
  stepSystems() {}
  drawSystems() {}

  render(dt) {
    const p = this.player;
    this.view.update(p, dt);
    this.cam.update(dt, p, this.map, this.view.dims, this.opt.shake);
    this.world.update(dt, this.cam.cam, this.time, this.paused);
    this.camDir.x = Math.sin(this.cam.yaw); this.camDir.z = Math.cos(this.cam.yaw);
    // frota instanciada + efeitos
    const f = this.fleet, night = this.world.night, map = this.map;
    f.begin(this.cam.cam);
    for (const c of this.traffic.cars) {
      if (!c.active) continue;
      f.car(c.key, c.x, c.y, c.z, c.yaw, c.pitch, 0, c.color);
      f.shadow(c.x, c.y, c.z, c.yaw, c.pitch, c.halfLen, c.halfWid);
      const dx = c.x - p.x, dz = c.z - p.z;
      if (dx * dx + dz * dz < 190 * 190) f.carLights(c, c.dims, night, c.mode === 0 && c.speed < 2);
    }
    this.drawSystems(f, night);
    const gy = p.grounded ? p.y : map.heightAt(p.x, p.z);
    f.shadow(p.x, gy, p.z, p.yaw, p.grounded ? p.pitch : 0, p.halfLen, p.halfWid, clamp(1 - (p.y - gy) * 0.07, 0.45, 1));
    f.carLights(p, this.view.dims, night, p.in.brake > 0 && p.vf > 1);
    f.end();
    this.autoQuality(dt);
    this.renderer.render(this.scene, this.cam.cam);
  }
}
