// Corrida de rua (5 rivais) e contra o relógio (fantasma da melhor volta).
import * as THREE from 'three';
import { Vehicle } from '../vehicles/vehicle.js';
import { AIDriver } from './aidriver.js';
import { idx, pathDir } from './path.js';
import { RIVAL_NAMES, RIVAL_COLORS } from './events.js';
import { carGeometry, MODEL_DIMS } from '../vehicles/cars.js';
import { makeBeam } from './markers.js';
import { loadGhost, saveGhost } from '../core/save.js';
import { clamp, angleDiff, lerp } from '../core/util.js';

const _d = { x: 0, z: 1 };
const GHOST_DT = 0.1;

export class Race {
  constructor(game, ev, mode) {
    this.game = game; this.ev = ev; this.mode = mode;
    const p = (this.path = ev.path);
    this.laps = mode === 'tt' ? 1 : ev.laps;
    this.state = 'grid'; this.count = 3.6; this.time = 0;
    this.finished = false; this.result = null; this.wrong = 0; this.doneT = 0;
    // checkpoints
    const nC = (this.nC = Math.max(3, Math.round(p.total / 190)));
    this.cps = []; this.cpDist = [];
    for (let k = 1; k <= nC; k++) {
      const i = p.closed ? Math.round((k * p.n) / nC) % p.n : Math.round((k * (p.n - 1)) / nC);
      this.cps.push(i);
      this.cpDist.push(p.closed ? (k * p.total) / nC : i * p.ds);
    }
    this.cpNext = 0; this.lap = 0; this.pi = 0; this.lastCpSample = 0;
    this.beamA = makeBeam(0xffb238, 8, 11);
    this.beamB = makeBeam(0x5aa8ff, 6, 7);
    game.scene.add(this.beamA, this.beamB);

    // rivais
    this.rivals = [];
    const pl = game.player;
    const nR = mode === 'race' ? 5 : 0;
    const order = [...RIVAL_NAMES].sort((a, b) => ((a.charCodeAt(0) * 7 + ev.index * 13) % 11) - ((b.charCodeAt(0) * 7 + ev.index * 13) % 11));
    for (let k = 0; k < nR; k++) {
      const key = ev.rivalCars[k], ts = ev.rivalSpec;
      const sk = (0.93 + ev.index * 0.008) * (1 - k * 0.03);
      const spec = { top: ts.top * (0.97 + sk * 0.03), accel: ts.accel * sk, brake: ts.brake, grip: ts.grip, steer: 1.05, mass: key === 'suv' || key === 'pickup' ? 1800 : 1350, nitroDur: 3, nitroPow: 1.5 };
      const v = new Vehicle(spec, key);
      v.kind = 'rival';
      const g = this.gridPos(k);
      v.place(g.x, g.z, g.yaw, game.map);
      const ai = new AIDriver(v, p, { skill: sk, lat: (k % 2 ? 1 : -1) * (1.2 + (k % 3) * 0.5), start: g.i });
      if (p.closed) ai.lap = -1;
      this.rivals.push({ v, ai, key, name: order[k], color: RIVAL_COLORS[(k + ev.index) % RIVAL_COLORS.length], fin: false, time: 0, dims: MODEL_DIMS[key] });
    }
    const g = this.gridPos(mode === 'race' ? 5 : 0);
    pl.place(g.x, g.z, g.yaw, game.map);
    pl.nitro = 1; pl.damage = 0;
    this.pi = g.i;
    this.order = [];
    this.position = nR + 1;

    // fantasma
    this.rec = [];
    this.recT = 0;
    this.ghost = null;
    if (mode === 'tt') {
      const gd = loadGhost(ev.id);
      if (gd && gd.d && gd.d.length > 8) {
        this.ghost = gd;
        const cg = carGeometry(gd.model || 'compact', { withWheels: true });
        const mat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.32, depthWrite: false });
        const grp = new THREE.Group();
        grp.add(new THREE.Mesh(cg.paint, mat), new THREE.Mesh(cg.detail, mat));
        grp.rotation.order = 'YXZ';
        game.scene.add(grp);
        this.ghostMesh = grp;
      }
    }
    this.placeBeams();
  }

  // posição no grid: k=0 é a pole
  gridPos(k) {
    const p = this.path;
    const row = Math.floor(k / 2), side = k % 2 ? 1 : -1;
    const back = 7 + row * 7.5;
    const lat = side * Math.min(2.4, p.hw[0] - 2);
    let x, z, i;
    if (p.closed) {
      i = idx(p, -Math.round(back / p.ds));
      pathDir(p, i, _d);
      x = p.px[i]; z = p.pz[i];
    } else {
      pathDir(p, 0, _d);
      x = p.px[0] - _d.x * back; z = p.pz[0] - _d.z * back; i = 0;
    }
    return { x: x - _d.z * lat, z: z + _d.x * lat, yaw: Math.atan2(_d.x, _d.z), i };
  }

  placeBeams() {
    const p = this.path, m = this.game.map;
    const i = this.cps[this.cpNext];
    const last = this.lap === this.laps - 1 && this.cpNext === this.nC - 1;
    this.beamA.position.set(p.px[i], m.heightAt(p.px[i], p.pz[i]), p.pz[i]);
    this.beamA.material.color.set(last ? 0xffffff : 0xffb238);
    const r = p.hw[i] + 3;
    this.beamA.scale.set(r, 11, r);
    this.cpR = r + 2.5;
    if (last) this.beamB.visible = false;
    else {
      const j = this.cps[(this.cpNext + 1) % this.nC];
      this.beamB.visible = true;
      this.beamB.position.set(p.px[j], m.heightAt(p.px[j], p.pz[j]), p.pz[j]);
    }
  }
  get target() { const i = this.cps[this.cpNext]; return { x: this.path.px[i], z: this.path.pz[i] }; }

  playerProgress() {
    const p = this.path;
    const prevD = this.cpNext === 0 ? 0 : this.cpDist[this.cpNext - 1], nextD = this.cpDist[this.cpNext];
    let d = this.pi * p.ds;
    if (d > nextD + p.total / 2) d = prevD;
    return this.lap * p.total + clamp(d, prevD, nextD);
  }

  step(dt) {
    const game = this.game, p = this.path, pl = game.player;
    if (this.state === 'grid') {
      this.count -= dt;
      const n = Math.ceil(this.count - 0.6);
      if (n !== this.lastN) {
        this.lastN = n;
        if (n >= 1 && n <= 3) { game.hud.msg(String(n), '', 0.9, true); game.sfx('beep'); }
      }
      if (this.count <= 0.6) { this.state = 'run'; game.hud.msg('VAI!', '', 1.1, true); game.sfx('go'); }
    } else if (this.state === 'run') this.time += dt;
    else this.doneT += dt;
    const running = this.state === 'run' || this.state === 'done';

    // jogador: rastreia a amostra mais próxima
    let best = this.pi, bd = 1e12;
    for (let k = -4; k <= 18; k++) {
      const j = idx(p, this.pi + k);
      const dx = p.px[j] - pl.x, dz = p.pz[j] - pl.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = j; }
    }
    this.pi = best;
    this.offTrack = Math.sqrt(bd);

    if (this.state === 'run') {
      // checkpoint
      const ci = this.cps[this.cpNext];
      const dx = p.px[ci] - pl.x, dz = p.pz[ci] - pl.z;
      if (dx * dx + dz * dz < this.cpR * this.cpR) {
        this.lastCpSample = ci;
        this.cpNext++;
        if (this.cpNext === this.nC) {
          this.cpNext = 0; this.lap++;
          if (this.lap >= this.laps) this.finish();
          else { game.hud.msg(this.lap === this.laps - 1 ? 'ÚLTIMA VOLTA' : 'VOLTA ' + (this.lap + 1), '', 1.6); game.sfx('lap'); }
        } else game.sfx('cp');
        if (!this.finished) { this.pi = ci; this.placeBeams(); }
      }
      // contramão
      pathDir(p, this.pi, _d);
      const along = pl.vx * _d.x + pl.vz * _d.z;
      if (along < -4 && pl.speed > 6) this.wrong += dt; else this.wrong = 0;
      // gravação do fantasma
      if (this.mode === 'tt') {
        this.recT += dt;
        while (this.recT >= GHOST_DT) {
          this.recT -= GHOST_DT;
          this.rec.push(Math.round(pl.x * 100) / 100, Math.round(pl.y * 100) / 100, Math.round(pl.z * 100) / 100, Math.round(pl.yaw * 1000) / 1000);
        }
      }
    }

    // rivais
    const pprog = this.playerProgress();
    const obs = game.bodies;
    for (const r of this.rivals) {
      const ai = r.ai;
      // elástico leve em relação ao jogador
      const gap = pprog - ai.progress;
      ai.boost = r.fin ? 0.5 : 1 + clamp(gap / 500, -0.06, 0.08);
      ai.update(dt, obs, running);
      if (r.fin && !p.closed) { r.v.in.throttle = 0; r.v.in.brake = 1; }
      r.v.step(dt, game.map);
      if (!r.fin && this.state !== 'grid') {
        const done = p.closed ? ai.lap >= this.laps : ai.i >= p.n - 3;
        if (done) { r.fin = true; r.time = this.time; }
      }
      // IA muito presa: reposiciona na pista (fora da vista de preferência)
      if (ai.fails >= 3 || ai.off2 > 45 * 45) {
        pathDir(p, ai.i, _d);
        r.v.place(p.px[ai.i] - _d.z * ai.lat, p.pz[ai.i] + _d.x * ai.lat, Math.atan2(_d.x, _d.z), game.map);
        ai.fails = 0; ai.stuck = 0;
      }
    }
    // classificação
    let pos = 1;
    for (const r of this.rivals) if (r.fin ? !this.finished || r.time < this.finishTime : !this.finished && r.ai.progress > pprog) pos++;
    if (!this.finished) this.position = pos;

    // fantasma
    if (this.ghostMesh) {
      const d = this.ghost.d, f = this.time / GHOST_DT, i = Math.floor(f), n = d.length / 4;
      if (i >= n - 1 || this.state === 'grid') {
        const k = this.state === 'grid' ? 0 : n - 1;
        this.ghostMesh.position.set(d[k * 4], d[k * 4 + 1], d[k * 4 + 2]);
        this.ghostMesh.rotation.y = d[k * 4 + 3];
        this.ghostMesh.visible = this.state === 'grid' || i < n + 20;
      } else {
        const t = f - i, a = i * 4, b = a + 4;
        this.ghostMesh.position.set(lerp(d[a], d[b], t), lerp(d[a + 1], d[b + 1], t), lerp(d[a + 2], d[b + 2], t));
        this.ghostMesh.rotation.y = d[a + 3] + angleDiff(d[b + 3], d[a + 3]) * t;
        const dx = this.ghostMesh.position.x - pl.x, dz = this.ghostMesh.position.z - pl.z;
        this.ghostMesh.visible = dx * dx + dz * dz > 9;
      }
    }
    const pulse = 1 + Math.sin(game.time * 5) * 0.05;
    this.beamA.scale.y = 11 * pulse;
  }

  finish() {
    const game = this.game;
    this.finished = true; this.state = 'done';
    this.finishTime = this.time;
    this.beamA.visible = this.beamB.visible = false;
    let pos = 1;
    for (const r of this.rivals) if (r.fin) pos++;
    this.position = pos;
    let newGhost = false;
    if (this.mode === 'tt') {
      const prev = this.ghost ? this.ghost.t : Infinity;
      if (this.time < prev) {
        saveGhost(this.ev.id, { t: this.time, model: game.player.model, d: this.rec });
        newGhost = true;
      }
    }
    this.result = { pos, time: this.time, newGhost };
    game.onRaceFinished(this);
  }

  // tabela final (rivais ainda na pista recebem tempo estimado)
  table() {
    const p = this.path, totalD = p.total * this.laps;
    const rows = this.rivals.map((r) => {
      let t = r.time;
      if (!r.fin) {
        const prog = clamp(r.ai.progress, 1, totalD);
        t = this.finishTime + 0.5 + (totalD - prog) / Math.max(14, prog / Math.max(1, this.finishTime));
      }
      return { name: r.name, time: t, me: false };
    });
    rows.push({ name: 'Você', time: this.finishTime, me: true });
    rows.sort((a, b) => a.time - b.time);
    return rows;
  }

  // recoloca o jogador na pista (último checkpoint)
  resetPlayer() {
    const p = this.path, pl = this.game.player;
    const i = this.cpNext === 0 && this.lap === 0 ? idx(p, 0) : this.lastCpSample;
    pathDir(p, i, _d);
    pl.place(p.px[i], p.pz[i], Math.atan2(_d.x, _d.z), this.game.map);
    this.pi = i;
  }

  collect(dyn) { for (const r of this.rivals) dyn.push(r.v); }

  draw(f, night) {
    for (const r of this.rivals) {
      const v = r.v;
      f.car(r.key, v.x, v.y, v.z, v.yaw, v.pitch, v.roll, r.color);
      const gy = v.grounded ? v.y : this.game.map.heightAt(v.x, v.z);
      f.shadow(v.x, gy, v.z, v.yaw, v.pitch, v.halfLen, v.halfWid);
      f.carLights(v, r.dims, night, v.in.brake > 0.2 && v.vf > 1);
    }
  }

  dispose() {
    const s = this.game.scene;
    s.remove(this.beamA, this.beamB);
    this.beamA.material.dispose(); this.beamB.material.dispose();
    if (this.ghostMesh) { s.remove(this.ghostMesh); this.ghostMesh.children[0].material.dispose(); }
  }
}
