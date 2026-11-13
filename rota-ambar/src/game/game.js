// Núcleo do jogo: renderer, laço de física com passo fixo, estados e integração dos sistemas.
import * as THREE from 'three';
import { generateMap } from '../world/map.js';
import { Vehicle } from '../vehicles/vehicle.js';
import { CarView } from '../vehicles/carview.js';
import { carById, effectiveSpec } from '../vehicles/cars.js';
import { ChaseCamera } from './camera.js';
import { Input } from '../ui/input.js';
import { TouchControls } from '../ui/touch.js';
import { loadSave, persist } from '../core/save.js';
import { requestWake, releaseWake, lockLandscape, vibrate, isPortrait } from '../core/platform.js';
import { clamp } from '../core/util.js';

const STEP = 1 / 60;

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
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    addEventListener('pagehide', () => persist(this.save, true));
    this.frame = this.frame.bind(this);
  }

  initWorld() {
    // provisório (etapa 1): chão plano
    const g = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: 0x4a5058 }));
    g.rotation.x = -Math.PI / 2;
    this.scene.add(g);
    const grid = new THREE.GridHelper(2000, 200, 0xffb238, 0x7a8088);
    grid.position.y = 0.02;
    this.scene.add(grid);
    this.scene.fog = new THREE.Fog(0x87b5d6, 150, 700);
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
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2) * this.pixelScale);
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
  }

  render(dt) {
    const p = this.player;
    this.view.update(p, dt);
    this.cam.update(dt, p, this.map, this.view.dims, this.opt.shake);
    this.renderer.render(this.scene, this.cam.cam);
  }
}
