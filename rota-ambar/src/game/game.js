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
import { AudioSys } from '../audio/audio.js';
import { Particles } from './particles.js';
import { TouchControls } from '../ui/touch.js';
import { loadSave, persist } from '../core/save.js';
import { requestWake, releaseWake, lockLandscape, vibrate, isPortrait } from '../core/platform.js';
import { clamp } from '../core/util.js';

const STEP = 1 / 60;
// escada de qualidade (0 = mais leve). cap = pixel ratio máximo (nunca acima de 2)
const QUALITY = [
  { cap: 1, scale: 0.75, radius: 2, propDist: 170, fogFar: 380, spot: false, clouds: false },
  { cap: 1, scale: 1, radius: 2, propDist: 200, fogFar: 400, spot: false, clouds: false },
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
    // tone mapping cinematográfico: realça o contraste e deixa luzes fortes estourarem com suavidade
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
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
    this.player.onLand = (imp) => { if (imp > 5) { this.cam.kick(clamp(imp * 0.03, 0, 0.5)); vibrate(30, this.opt.vibrate); this.sfx('land', imp / 16); } };

    this.audio = new AudioSys(this);
    this.fxp = new Particles();
    // farol real do jogador (só em qualidade média/alta, à noite)
    this.spot = new THREE.SpotLight(0xfff0d0, 0, 75, 0.55, 0.7, 1.0);
    this.spot.visible = false;
    this.scene.add(this.spot, this.spot.target);
    this.input = new Input(this.opt);
    this.touch = new TouchControls(els.touch, this.input, this.opt);
    this.input.onKey = (code) => this.onKey(code);

    this.initWorld();
    this.fleet = new Fleet(this.scene);
    this.traffic = new Traffic(this.map);
    this.traffic.setDensity(this.opt.traffic);
    this.dyn = []; this.bodies = [];
    this.camDir = { x: 0, z: 1 };
    this.initModes();
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
    this.audio.init();
    // iOS só libera o áudio em gestos "completos": tenta de novo a cada toque
    for (const ev of ['pointerdown', 'touchend', 'click']) addEventListener(ev, () => this.audio.resume(), { passive: true });
    if (this.opt.control === 'tilt') this.input.enableTilt().then((ok) => { if (!ok) { this.opt.control = 'buttons'; this.touch.apply(); } });
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
      this.audio.suspend();
      if (this.onAutoPause) this.onAutoPause();
    } else {
      this.hiddenPause = false;
      this.last = 0;
      if (this.gestured) { requestWake(); this.audio.resume(); }
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
    const ui = this.ui, driving = (this.state === 'roam' || this.state === 'race') && !this.paused;
    if (code === 'KeyF' && driving) this.footAction(this.foot.on ? 'enter' : 'exit');
    else if (code === 'KeyR' && driving && this.foot.on) this.footAction('rel');
    else if (code === 'KeyQ' && driving) this.footAction('wep');
    else if (code === 'KeyC' && driving && !this.foot.on) this.cam.cycle();
    else if (code === 'KeyR' && driving) this.resetCar();
    else if (code === 'KeyM' && ui) { if (ui.screen === 'map') ui.resume(); else if (driving) ui.openMap(); }
    else if ((code === 'Escape' || code === 'KeyP') && ui) { if (ui.screen === 'pause' || ui.screen === 'map') ui.resume(); else if (driving) ui.openPause(); }
  }

  onPlayerImpact(imp, lx, lz, nx, nz) {
    if (imp < 2.5) return;
    const s = clamp(imp / 22, 0, 1);
    this.cam.kick(s * 0.6);
    vibrate(Math.round(20 + s * 80), this.opt.vibrate);
    this.sfx('crash', s);
    if (imp > 6) { const p = this.player, sn = Math.sin(p.yaw), cs = Math.cos(p.yaw); this.fxp.sparks(p.x + lx * cs + lz * sn, p.y, p.z - lx * sn + lz * cs, 3 + Math.round(s * 6)); }
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
    // em pausa (menus sobre o jogo) renderiza na metade da taxa para poupar bateria
    if (this.paused && (this.frameNo & 1)) return;
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
    const drive = (this.state === 'roam' && !this.foot.on) || (this.state === 'race' && this.race && this.race.state === 'run');
    if (this.autopilot && (drive || this.state === 'title')) this.autopilot.update(dt, this.bodies, true);
    else if (drive) { this.input.read(p.in); this.steerAssist(); }
    else { p.in.throttle = 0; p.in.brake = 1; p.in.steer = 0; p.in.handbrake = true; p.in.nitro = false; }
    p.step(dt, this.map);
    if (p.nitroOn && !this.wasNitro) { this.sfx('nitro'); vibrate([20, 30, 40], this.opt.vibrate); }
    this.wasNitro = p.nitroOn;
    this.fxp.fromCar(p, dt);
    this.fxp.step(dt);

    // corpos dinâmicos (jogador, rivais, polícia) e trânsito
    const dyn = this.dyn, bodies = this.bodies, tc = this.traffic.cars;
    dyn.length = 0; bodies.length = 0;
    dyn.push(p);
    this.collectDynamics(dyn);
    for (let i = 0; i < dyn.length; i++) bodies.push(dyn[i]);
    for (let i = 0; i < tc.length; i++) if (tc[i].active) bodies.push(tc[i]);
    this.stepSystems(dt);
    this.traffic.step(dt, this.time, bodies, this.chaseTarget(), this.camDir);
    for (let i = 0; i < dyn.length; i++) {
      for (let j = i + 1; j < dyn.length; j++) {
        const imp = collideCars(dyn[i], dyn[j]);
        if (i === 0 && imp > 1 && dyn[j].kind !== 'parked') this.police.onPlayerHit(dyn[j], imp);
      }
      for (let j = 0; j < tc.length; j++) {
        if (!tc[j].active) continue;
        const imp = collideCars(dyn[i], tc[j]);
        if (i === 0 && imp > 1) this.police.onPlayerHit(tc[j], imp);
      }
    }
    for (let i = 0; i < tc.length; i++) {
      const c = tc[i];
      if (!c.active || c.mode !== 2) continue;
      for (let j = 0; j < tc.length; j++) if (j !== i && tc[j].active) collideCars(c, tc[j]);
    }
  }


  render(dt) {
    const p = this.player;
    this.view.update(p, dt);
    this.input.pollPad();
    if (this.foot.on && !this.cam.orbit) this.cam.updateFoot(dt, this.foot, this.map, this.opt.shake);
    else this.cam.update(dt, p, this.map, this.view.dims, this.opt.shake);
    this.world.update(dt, this.cam.cam, this.time, this.paused);
    const cyaw = this.foot.on ? this.foot.yaw : this.cam.yaw;
    this.camDir.x = Math.sin(cyaw); this.camDir.z = Math.cos(cyaw);
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
    if (p.nitroOn) {
      const sn = Math.sin(p.yaw), cs = Math.cos(p.yaw), hl = p.halfLen + 0.25;
      for (const sx of [-0.35, 0.35]) f.glow(p.x - sn * hl + cs * sx, p.y + 0.35, p.z - cs * hl - sn * sx, 0.5 + Math.random() * 0.25, 0x58b8ff, 1.2);
    }
    this.fxp.draw(f, 1 - night * 0.72);
    f.end();
    // farol real
    const spotOn = this.q.spot && night > 0.35 && this.state !== 'garage';
    if (this.spot.visible !== spotOn) this.spot.visible = spotOn;
    if (spotOn) {
      const sn = Math.sin(p.yaw), cs = Math.cos(p.yaw);
      this.spot.intensity = 42 * night;
      this.spot.position.set(p.x + sn * 1.2, p.y + 1.1, p.z + cs * 1.2);
      this.spot.target.position.set(p.x + sn * 22, p.y - 0.4, p.z + cs * 22);
      this.spot.target.updateMatrixWorld();
    }
    this.audio.update(dt);
    if (this.opt.showFps && (this.frameNo & 15) === 0) {
      const ri = this.renderer.info.render;
      this.hud.el.fps.textContent = `${Math.round(this.fps)} fps · ${ri.calls} dc · ${(ri.triangles / 1000).toFixed(0)}k tri · q${this.opt.quality === 'auto' ? this.autoLevel : this.opt.quality}`;
    }
    this.autoQuality(dt);
    if (this.state === 'roam' || this.state === 'race') this.hud.update(dt);
    this.renderer.render(this.scene, this.cam.cam);
  }
}
