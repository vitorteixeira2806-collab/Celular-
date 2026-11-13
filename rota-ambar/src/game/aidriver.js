// Piloto de IA: segue a linha de corrida com antecipação, freia para as curvas e desvia de obstáculos.
import { clamp, angleDiff } from '../core/util.js';
import { idx, pathDir, speedProfile } from './path.js';

const _d = { x: 0, z: 1 };

export class AIDriver {
  constructor(veh, path, o = {}) {
    this.v = veh; this.path = path;
    this.skill = o.skill || 1;
    this.lat = this.baseLat = o.lat || 0;
    this.i = o.start || 0;
    this.lap = 0;
    this.stuck = 0; this.rev = 0; this.boost = 1;
    this.setProfile();
  }
  setProfile() {
    const S = this.v.spec;
    this.lim = speedProfile(this.path, S.top, 11.5 * S.grip * 0.8 * this.skill, S.brake * 0.6);
  }
  // distância percorrida no trajeto (para classificação)
  get progress() { return (this.lap * this.path.n + this.i) * this.path.ds; }

  track() {
    const p = this.path, v = this.v;
    let best = this.i, bd = 1e12;
    for (let k = -4; k <= 16; k++) {
      const j = idx(p, this.i + k);
      const dx = p.px[j] - v.x, dz = p.pz[j] - v.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = j; }
    }
    if (p.closed) {
      if (best < this.i - p.n / 2) this.lap++;
      else if (best > this.i + p.n / 2) this.lap--;
    }
    this.i = best;
    this.off2 = bd;
  }

  update(dt, obstacles, active) {
    const v = this.v, p = this.path, inp = v.in;
    this.track();
    if (!active) { inp.throttle = 0; inp.brake = 1; inp.steer = 0; inp.handbrake = true; inp.nitro = false; return; }
    inp.handbrake = false;
    const sp = v.speed;
    // desvio lateral para evitar obstáculos à frente
    const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
    let want = this.baseLat, slow = 1e9;
    const look = 12 + sp * 1.1;
    for (let k = 0; k < obstacles.length; k++) {
      const o = obstacles[k];
      if (o === v || o.active === false) continue;
      const dx = o.x - v.x, dz = o.z - v.z;
      const f = dx * sn + dz * cs;
      if (f < 1 || f > look) continue;
      const l = -dx * cs + dz * sn; // + = à direita
      if (Math.abs(l) > 3.2) continue;
      const closing = sp - (o.vx * sn + o.vz * cs);
      if (closing < 1.5) continue;
      want += (l > 0 ? -1 : 1) * (3.4 - Math.abs(l)) * 1.3;
      if (Math.abs(l) < 1.9 && f < 5 + closing * 0.55) slow = Math.min(slow, Math.max(2, sp - closing * 0.8));
    }
    const hwI = p.hw[this.i] - 1.6;
    want = clamp(want, -hwI, hwI);
    this.lat += clamp(want - this.lat, -5 * dt, 5 * dt);

    // ponto-alvo à frente
    const L = 7 + sp * 0.42;
    const jt = idx(p, this.i + Math.ceil(L / p.ds));
    pathDir(p, jt, _d);
    // direita da pista = (-dz, dx)
    const tx = p.px[jt] - _d.z * this.lat, tz = p.pz[jt] + _d.x * this.lat;
    const err = angleDiff(Math.atan2(tx - v.x, tz - v.z), v.yaw);

    if (this.rev > 0) {
      // manobra de ré para se soltar
      this.rev -= dt;
      inp.throttle = 0; inp.brake = 1; inp.steer = clamp(err * 2, -1, 1); inp.nitro = false;
      return;
    }
    inp.steer = clamp(-err * 2.4, -1, 1);
    const ahead = Math.ceil((sp * 0.22) / p.ds);
    let vt = Math.min(this.lim[idx(p, this.i + 1)], this.lim[idx(p, this.i + 2)], this.lim[idx(p, this.i + 2 + ahead)]) * this.boost;
    if (Math.abs(err) > 0.5) vt = Math.min(vt, 12);
    vt = Math.min(vt, slow);
    if (sp < vt - 0.6) { inp.throttle = 1; inp.brake = 0; }
    else if (sp > vt + 0.8) { inp.throttle = 0; inp.brake = clamp((sp - vt) / 2.2, 0.3, 1); }
    else { inp.throttle = 0.35; inp.brake = 0; }
    inp.nitro = this.boost > 1.02 && vt > sp + 8 && Math.abs(err) < 0.08;

    // preso?
    if (sp < 1.3 && inp.throttle > 0.5) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt * 2);
    if (this.stuck > 1.6) { this.rev = 1.1; this.stuck = 0; this.fails = (this.fails || 0) + 1; }
    if (sp > 8) this.fails = 0;
  }
}
