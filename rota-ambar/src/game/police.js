// Fuga da polícia: nível de procurado (1-5 estrelas), viaturas que perseguem e fazem bloqueios.
// Escapa-se saindo do campo de visão por alguns segundos.
import { Vehicle } from '../vehicles/vehicle.js';
import { MODEL_DIMS } from '../vehicles/cars.js';
import { clamp, angleDiff, mulberry32, fmtMoney, segDist2 } from '../core/util.js';
import { persist } from '../core/save.js';

const LEVEL = [
  null,
  { n: 1, top: 40, accel: 7, grip: 1.0 },
  { n: 2, top: 46, accel: 8, grip: 1.05 },
  { n: 3, top: 54, accel: 9.5, grip: 1.12 },
  { n: 4, top: 63, accel: 11, grip: 1.2 },
  { n: 5, top: 73, accel: 12.5, grip: 1.28 },
];
const COLOR = 0x1c2a44;
const DIMS = MODEL_DIMS.sedan;

export class Police {
  constructor(game) {
    this.g = game; this.map = game.map;
    this.rng = mulberry32(4242);
    this.stars = 0; this.heat = 0; this.base = 0; this.evade = 0; this.offense = 0;
    this.units = []; this.blocks = [];
    this.last = { x: 0, z: 0 };
    this.spawnT = 0; this.blockT = 10; this.bustT = 0; this.seen = false; this.speedT = 0;
    this.challenge = null; this.chaseTime = 0; this.siren = 0;
  }

  spec(level) {
    const L = LEVEL[level];
    return { top: L.top, accel: L.accel, brake: 17, grip: L.grip, steer: 1.1, mass: 1650, nitroDur: 3, nitroPow: 1.4 };
  }

  setStars(n) {
    n = clamp(n, 0, 5);
    if (n === this.stars) return;
    const up = n > this.stars;
    this.stars = n;
    if (n > 0) {
      for (const u of this.units) u.v.setSpec(this.spec(n), 'sedan');
      if (up) { this.g.hud.msg('PROCURADO', 'Saia do campo de visão da polícia', 2); this.g.sfx('alert'); }
    }
  }

  // infração no passeio livre
  crime(points, witnessed) {
    if (this.g.state !== 'roam') return;
    if (this.stars > 0) { this.heat += points * 0.35; return; }
    this.offense += points;
    if (witnessed || this.offense >= 1.5) this.begin(1);
  }

  begin(stars) {
    this.base = stars; this.heat = 0; this.evade = 0; this.chaseTime = 0; this.bustT = 0; this.offense = 0;
    this.engaged = false; // só dá para despistar depois que alguma viatura avistar o jogador
    this.last.x = this.g.player.x; this.last.z = this.g.player.z;
    this.setStars(stars);
    // viaturas em patrulha por perto entram na perseguição
    for (const c of this.g.traffic.cars) {
      if (!c.active || !c.police) continue;
      if (Math.hypot(c.x - this.g.player.x, c.z - this.g.player.z) < 160 && this.units.length < 5) {
        c.active = false;
        const u = this.addUnit(c.x, c.z, c.yaw);
        u.v.vx = c.vx; u.v.vz = c.vz;
      }
    }
    this.spawnT = 0.5; this.blockT = 12;
  }

  startChallenge(c) {
    this.challenge = c;
    this.begin(c.stars);
  }

  addUnit(x, z, yaw) {
    const v = new Vehicle(this.spec(Math.max(1, this.stars)), 'sedan');
    v.kind = 'police';
    v.place(x, z, yaw, this.map);
    const u = { v, route: null, ri: 0, routeT: 0, stuck: 0, rev: 0, phase: this.rng() * 6, los: false, life: 0, hits: 0 };
    this.units.push(u);
    return u;
  }

  clear() {
    this.units.length = 0; this.blocks.length = 0;
    this.stars = 0; this.heat = 0; this.evade = 0; this.challenge = null; this.bustT = 0; this.siren = 0;
  }

  spawnUnit() {
    const map = this.map, p = this.g.player, rng = this.rng, cd = this.g.camDir;
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = rng() * Math.PI * 2, r = 130 + rng() * 90;
      const px = p.x + Math.sin(ang) * r, pz = p.z + Math.cos(ang) * r;
      const ne = map.nearestEdge(px, pz);
      if (!ne || ne.dist > 25) continue;
      const x = ne.x, z = ne.z;
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < 110) continue;
      // fora do campo de visão da câmera, se possível
      const los = map.lineOfSight(x, z, p.x, p.z);
      if ((dx * cd.x + dz * cd.z) / d > 0.6 && d < 190 && los) continue;
      // enquanto o jogador está despistando, reforços não nascem com visada para ele
      if (los && this.engaged && !this.seen) continue;
      const yaw = Math.atan2(-dx, -dz);
      this.addUnit(x, z, yaw);
      return true;
    }
    return false;
  }

  // bloqueio à frente do jogador, atravessado na via
  spawnBlock() {
    const map = this.map, p = this.g.player;
    const ne = map.nearestEdge(p.x, p.z);
    if (!ne || p.speed < 10) return false;
    let e = ne.edge;
    let dir = p.vx * ne.dx + p.vz * ne.dz > 0 ? 0 : 1;
    let s = dir === 0 ? ne.s : e.len - ne.s;
    let need = 150 + p.speed * 1.6;
    for (let hop = 0; hop < 8; hop++) {
      const rem = e.len - s;
      if (rem > need) { s += need; need = 0; break; }
      need -= rem;
      const node = map.nodes[dir === 0 ? e.b : e.a];
      const d0 = map.edgeDir(e, dir, true);
      let best = null, bd = -2, bdir = 0;
      for (const id of node.edges) {
        if (id === e.id) continue;
        const o = map.edges[id], od = o.a === node.id ? 0 : 1;
        const d1 = map.edgeDir(o, od, false);
        const dot = d0[0] * d1[0] + d0[1] * d1[1];
        if (dot > bd) { bd = dot; best = o; bdir = od; }
      }
      if (!best) return false;
      e = best; dir = bdir; s = 0;
    }
    if (need > 0) return false;
    const P = map.pointOnEdge(e, dir === 0 ? s : e.len - s);
    if (Math.hypot(P.x - p.x, P.z - p.z) < 110) return false;
    const yaw = Math.atan2(P.dx, P.dz) + Math.PI / 2;
    const hw = e.width / 2;
    // cobre a pista deixando uma brecha estreita em um dos lados
    const span = e.width - 3.4;
    const n = Math.max(1, Math.floor(span / 4.7)), step = span / n;
    const gapSide = this.rng() < 0.5 ? -1 : 1;
    for (let k = 0; k < n; k++) {
      const o = gapSide > 0 ? -hw + 0.4 + step * (k + 0.5) : hw - 0.4 - step * (k + 0.5);
      const v = new Vehicle(this.spec(this.stars), 'sedan');
      v.kind = 'block'; v.mass = 2300;
      v.place(P.x + P.nx * o, P.z + P.nz * o, yaw + (k % 2 ? Math.PI : 0), map);
      v.in.handbrake = true; v.in.brake = 1;
      this.blocks.push({ v, life: 0, phase: this.rng() * 6 });
    }
    this.g.hud.toast('Bloqueio policial à frente!');
    return true;
  }

  onPlayerHit(other, imp) {
    if (other.kind === 'police' || other.kind === 'block') {
      if (imp > 6 && this.stars > 0) this.heat += 0.14;
    } else if (other.kind === 'traffic') {
      if (imp > 5) {
        if (other.police) { if (this.stars === 0) this.begin(2); else this.heat += 0.3; } else this.crime(0.55, this.patrolSees());
      }
    }
  }

  // alguma viatura em patrulha vê o jogador?
  patrolSees() {
    const p = this.g.player;
    for (const c of this.g.traffic.cars) {
      if (!c.active || !c.police || c.mode === 2) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < 90 && this.map.lineOfSight(c.x, c.z, p.x, p.z)) return true;
    }
    return false;
  }

  step(dt) {
    const g = this.g, p = g.player, map = this.map;
    if (g.state !== 'roam') return;
    if (this.stars === 0) {
      this.offense = Math.max(0, this.offense - dt * 0.03);
      // excesso de velocidade perto de uma patrulha
      if (p.speed > 37) {
        this.speedT += dt;
        if (this.speedT > 0.8) { this.speedT = 0; if (this.patrolSees()) { g.hud.toast('Radar: excesso de velocidade'); this.begin(1); } }
      } else this.speedT = 0;
      // unidades que sobraram de uma perseguição vão embora
      for (let i = this.units.length - 1; i >= 0; i--) {
        const u = this.units[i];
        u.life += dt;
        u.v.in.throttle = 0; u.v.in.brake = 0.6; u.v.in.steer = 0; u.v.in.handbrake = false;
        u.v.step(dt, map);
        if (u.life > 7 || Math.hypot(u.v.x - p.x, u.v.z - p.z) > 170) this.units.splice(i, 1);
      }
      for (let i = this.blocks.length - 1; i >= 0; i--) {
        const b = this.blocks[i];
        b.life += dt; b.v.step(dt, map);
        if (b.life > 12 || Math.hypot(b.v.x - p.x, b.v.z - p.z) > 200) this.blocks.splice(i, 1);
      }
      this.siren = 0;
      return;
    }

    this.chaseTime += dt;
    const L = LEVEL[this.stars];
    // reforços
    this.spawnT -= dt;
    if (this.units.length < L.n && this.spawnT <= 0) { this.spawnT = this.spawnUnit() ? 2.2 : 0.4; }
    if (this.stars >= 3) {
      this.blockT -= dt;
      if (this.blockT <= 0 && this.blocks.length === 0 && this.seen) this.blockT = this.spawnBlock() ? 22 - this.stars * 2 : 3;
    }

    let seen = false, nearest = 1e9, close = false;
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i], v = u.v;
      const dx = p.x - v.x, dz = p.z - v.z, d = Math.hypot(dx, dz);
      if (d > 420 || u.hits > 40) { this.units.splice(i, 1); continue; }
      u.life += dt;
      // los = visada livre (dirige direto); perto demais também conta como "visto"
      u.los = d < 230 && map.lineOfSight(v.x, v.z, p.x, p.z);
      if (u.los || d < 45) seen = true;
      if (d < nearest) nearest = d;
      if (d < 7.6) close = true;
      this.drive(u, dt, d);
      v.step(dt, map);
    }
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      b.life += dt;
      b.v.in.throttle = 0; b.v.in.brake = 1; b.v.in.handbrake = true;
      b.v.step(dt, map);
      const d = Math.hypot(b.v.x - p.x, b.v.z - p.z);
      if (d < 60 && map.lineOfSight(b.v.x, b.v.z, p.x, p.z)) seen = true;
      if (d < 6.8) close = true;
      if (d < nearest) nearest = d;
      if (b.life > 40 || d > 320) this.blocks.splice(i, 1);
    }
    this.seen = seen;
    this.siren = clamp(1 - nearest / 220, 0, 1);

    if (seen || !this.engaged) {
      // até o primeiro contato visual, a central informa a posição do jogador
      this.last.x = p.x; this.last.z = p.z;
      if (seen) { this.engaged = true; this.heat += dt / 55; }
      this.evade = Math.max(0, this.evade - dt * 0.6);
    } else {
      this.evade += dt / (6 + this.stars * 1.5);
      if (this.evade >= 1) return this.escaped();
    }
    const want = Math.min(5, this.base + Math.floor(this.heat));
    if (want > this.stars) this.setStars(want);

    // preso: parado com viatura encostada
    if (close && p.speed < 3) {
      this.bustT += dt;
      if (this.bustT > 2.2) this.busted();
    } else this.bustT = Math.max(0, this.bustT - dt * 0.7);
  }

  drive(u, dt, dist) {
    const v = u.v, p = this.g.player, map = this.map, inp = v.in;
    let tx, tz, direct = false;
    u.noDirect = Math.max(0, (u.noDirect || 0) - dt);
    if (u.los && u.noDirect <= 0) {
      // mira à frente do jogador
      const lead = clamp(dist / (v.speed + 12), 0, 1.1);
      tx = p.x + p.vx * lead; tz = p.z + p.vz * lead;
      direct = true; u.route = null;
    } else {
      u.routeT -= dt;
      const moved = u.route ? Math.hypot(this.last.x - u.gx, this.last.z - u.gz) : 1e9;
      if (!u.route || (u.routeT <= 0 && moved > 20) || u.routeT < -4) {
        u.routeT = 1.5;
        u.gx = this.last.x; u.gz = this.last.z;
        const a = map.nearestNode(v.x, v.z), b = map.nearestNode(this.last.x, this.last.z);
        const seq = a.id !== b.id ? map.findRoute(a.id, b.id, { startDir: [Math.sin(v.yaw), Math.cos(v.yaw)] }) : null;
        const rt = seq ? map.routePoints(seq) : [{ x: a.x, z: a.z }];
        rt.push({ x: this.last.x, z: this.last.z });
        u.route = rt;
        // começa no trecho mais próximo da viatura (não volta até o primeiro nó)
        let bi = 0, bd = 1e12;
        const nSeg = Math.min(rt.length - 1, 6);
        for (let i = 0; i < nSeg; i++) {
          const d2 = segDist2(v.x, v.z, rt[i].x, rt[i].z, rt[i + 1].x, rt[i + 1].z);
          if (d2 < bd) { bd = d2; bi = i + 1; }
        }
        u.ri = bd < 30 * 30 ? bi : 0;
      }
      const rt = u.route;
      while (u.ri < rt.length - 1 && Math.hypot(rt[u.ri].x - v.x, rt[u.ri].z - v.z) < 13) u.ri++;
      tx = rt[u.ri].x; tz = rt[u.ri].z;
    }
    const err = angleDiff(Math.atan2(tx - v.x, tz - v.z), v.yaw);
    if (u.rev > 0) {
      u.rev -= dt;
      inp.throttle = 0; inp.brake = 1; inp.steer = clamp(err * 2, -1, 1); inp.handbrake = false;
      return;
    }
    inp.steer = clamp(-err * 2.6, -1, 1);
    const ae = Math.abs(err);
    let vt = v.spec.top;
    if (!direct) {
      // em rota: reduz para as curvas
      const dn = Math.hypot(tx - v.x, tz - v.z);
      vt = Math.min(vt, 13 + dn * 0.55);
    } else if (dist < 28) vt = p.speed < 3 && dist < 10 ? 0 : Math.min(vt, p.speed + 7 + dist * 0.25);
    if (ae > 0.45) vt = Math.min(vt, 16 - ae * 5);
    inp.handbrake = ae > 1.1 && v.speed > 12;
    if (v.speed < vt - 0.5) { inp.throttle = 1; inp.brake = 0; }
    else if (v.speed > vt + 1.5) { inp.throttle = 0; inp.brake = clamp((v.speed - vt) / 4, 0.3, 1); }
    else { inp.throttle = 0.3; inp.brake = 0; }
    inp.nitro = false;
    if (v.speed < 1.2 && inp.throttle > 0.5 && dist > 9) u.stuck += dt; else u.stuck = Math.max(0, u.stuck - dt);
    if (u.stuck > 1.4) { u.rev = 1.0; u.stuck = 0; u.hits += 8; u.noDirect = 3; u.route = null; }
  }

  escaped() {
    const g = this.g, s = this.stars;
    let reward = 120 * s * s + Math.round(this.chaseTime) * 2;
    if (this.challenge) reward = Math.round(reward * 1.8);
    reward = Math.round(reward / 10) * 10;
    g.save.money += reward;
    g.save.stats.escapes++;
    persist(g.save, true);
    g.hud.msg('DESPISTOU!', '+' + fmtMoney(reward), 3);
    g.sfx('win');
    this.stars = 0; this.heat = 0; this.evade = 0; this.challenge = null; this.siren = 0;
    for (const u of this.units) u.life = 0;
    for (const b of this.blocks) b.life = 0;
  }

  busted() {
    const g = this.g;
    const fine = Math.min(g.save.money, Math.round((100 * this.stars + g.save.money * 0.06) / 10) * 10);
    g.save.money -= fine;
    persist(g.save, true);
    g.hud.msg('PRESO!', fine ? 'Multa de ' + fmtMoney(fine) : 'Sem dinheiro para a multa', 3);
    g.sfx('lose');
    this.clear();
    g.player.vx = g.player.vz = 0;
  }

  collect(dyn) {
    for (const u of this.units) dyn.push(u.v);
    for (const b of this.blocks) dyn.push(b.v);
  }

  draw(f, night) {
    const t = this.g.time, map = this.map;
    const one = (v, phase, lights) => {
      f.car('police', v.x, v.y, v.z, v.yaw, v.pitch, v.roll, COLOR);
      const gy = v.grounded ? v.y : map.heightAt(v.x, v.z);
      f.shadow(v.x, gy, v.z, v.yaw, v.pitch, v.halfLen, v.halfWid);
      f.carLights(v, DIMS, night, false);
      if (lights) {
        // giroflex alternando vermelho/azul
        const on = Math.floor(t * 5 + phase) & 1;
        const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw), y = v.y + DIMS.roof + 0.22;
        const big = 0.42 + night * 0.3;
        f.glow(v.x + cs * 0.3, y, v.z - sn * 0.3, on ? big : 0.2, 0x2f6bff, on ? 1.1 : 0.35);
        f.glow(v.x - cs * 0.3, y, v.z + sn * 0.3, on ? 0.2 : big, 0xff2a1a, on ? 0.35 : 1.1);
        if (night > 0.3) f.pool(v.x, v.y, v.z, v.yaw, 7, 7, 0.12 * night);
      }
    };
    for (const u of this.units) one(u.v, u.phase, this.stars > 0);
    for (const b of this.blocks) one(b.v, b.phase, true);
  }

  blips(b) {
    const on = Math.floor(this.g.time * 4) & 1;
    for (const u of this.units) b.push({ x: u.v.x, z: u.v.z, c: on ? '#ff4030' : '#4080ff', r: 3.4 });
    for (const k of this.blocks) b.push({ x: k.v.x, z: k.v.z, c: '#ffffff', r: 2.6 });
  }
}
