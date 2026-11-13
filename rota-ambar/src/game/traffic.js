// Trânsito de IA: carros sobre "trilhos" nas faixas, respeitando semáforos e preferenciais.
// Ao serem atingidos viram corpos livres (empurráveis) até pararem.
import { laneCenter } from '../world/map.js';
import { signalColor } from '../world/signals.js';
import { Vehicle } from '../vehicles/vehicle.js';
import { MODEL_DIMS, TRAFFIC_COLORS } from '../vehicles/cars.js';
import { mulberry32, angleDiff, clamp } from '../core/util.js';

const KINDS = ['compact', 'sedan', 'sedan', 'suv', 'pickup', 'compact', 'sedan', 'muscle', 'suv', 'sport'];
export const DENSITY = [0, 8, 15, 24];

class TCar {
  constructor() {
    this.active = false; this.kind = 'traffic';
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.vx = 0; this.vz = 0; this.yawRate = 0; this.speed = 0; this.damage = 0;
    this.onImpact = null; this.police = false;
  }
  setModel(key) {
    this.key = key;
    const d = (this.dims = MODEL_DIMS[key === 'police' ? 'sedan' : key]);
    this.halfLen = d.len / 2; this.halfWid = d.wid / 2; this.cr = d.wid / 2; this.co = d.len / 2 - d.wid / 2;
    this.mass = key === 'suv' || key === 'pickup' ? 1900 : 1300;
  }
  onCarHit(imp) {
    if (imp > 1.0 && this.mode !== 2) { this.mode = 2; this.bumpT = 0; this.restT = 0; }
    this.hitT = 0.4;
  }
}
TCar.prototype.collideStatic = Vehicle.prototype.collideStatic;
TCar.prototype._resolve = Vehicle.prototype._resolve;
TCar.prototype._emitImpact = Vehicle.prototype._emitImpact;

const _L = {}, _P = {};

export class Traffic {
  constructor(map) {
    this.map = map;
    this.rng = mulberry32(991);
    this.cars = [];
    for (let i = 0; i < 26; i++) this.cars.push(new TCar());
    this.target = 15;
    this.spawnT = 0;
    this.enabled = true;
  }
  setDensity(level, scale = 1) { this.target = Math.round(DENSITY[level] * scale); }
  clear() { for (const c of this.cars) c.active = false; }

  lanePos(e, dir, lane, sTravel, o) {
    const P = this.map.pointOnEdge(e, dir === 0 ? sTravel : e.len - sTravel, _P);
    const off = laneCenter(e, lane) * (dir === 0 ? 1 : -1);
    o.x = P.x + P.nx * off; o.z = P.z + P.nz * off; o.y = P.y;
    o.hx = dir === 0 ? P.dx : -P.dx; o.hz = dir === 0 ? P.dz : -P.dz;
    return o;
  }

  spawn(player, camDir) {
    const map = this.map, rng = this.rng;
    const c = this.cars.find((q) => !q.active);
    if (!c) return;
    for (let attempt = 0; attempt < 5; attempt++) {
      // preferência por pontos à frente do jogador
      const sp = Math.hypot(player.vx, player.vz);
      let ang = rng() * Math.PI * 2;
      if (sp > 6 && rng() < 0.65) ang = Math.atan2(player.vx, player.vz) + (rng() - 0.5) * 1.3;
      const r = 120 + rng() * 230;
      const px = player.x + Math.sin(ang) * r, pz = player.z + Math.cos(ang) * r;
      const ne = map.nearestEdge(px, pz);
      if (!ne || ne.dist > 30) continue;
      const e = ne.edge;
      if (e.type === 'dock' && rng() < 0.75) continue;
      const dir = rng() < 0.5 ? 0 : 1;
      const sT = dir === 0 ? ne.s : e.len - ne.s;
      const nA = map.nodes[dir === 0 ? e.a : e.b], nB = map.nodes[dir === 0 ? e.b : e.a];
      const t0 = nA.edges.length >= 3 ? nA.r : 0, t1 = nB.edges.length >= 3 ? nB.r : 0;
      if (sT < t0 + 5 || sT > e.len - t1 - 12) continue;
      const lane = Math.floor(rng() * e.lanes);
      this.lanePos(e, dir, lane, sT, _L);
      const dx = _L.x - player.x, dz = _L.z - player.z, d = Math.hypot(dx, dz);
      if (d < 105) continue;
      // evita aparecer bem na frente da câmera
      if (d < 170 && (dx * camDir.x + dz * camDir.z) / d > 0.55) continue;
      let ok = true;
      for (const o of this.cars) if (o.active && Math.hypot(o.x - _L.x, o.z - _L.z) < 16) { ok = false; break; }
      if (!ok) continue;
      c.active = true; c.mode = 0; c.edge = e; c.dir = dir; c.lane = lane; c.s = sT;
      c.police = rng() < 0.085;
      c.setModel(c.police ? 'police' : KINDS[Math.floor(rng() * KINDS.length)]);
      c.color = c.police ? 0x1c2a44 : TRAFFIC_COLORS[Math.floor(rng() * TRAFFIC_COLORS.length)];
      c.pace = 0.82 + rng() * 0.3;
      c.speed = e.speed * c.pace * 0.8;
      c.x = _L.x; c.z = _L.z; c.y = _L.y; c.yaw = Math.atan2(_L.hx, _L.hz); c.pitch = 0;
      c.wait = 0; c.cleared = false; c.stuckT = 0; c.ghostT = 0; c.yawRate = 0; c.damage = 0; c.hitT = 0;
      return;
    }
  }

  gapAhead(c, bodies) {
    const hx = Math.sin(c.yaw), hz = Math.cos(c.yaw);
    const look = 9 + c.speed * 1.9;
    let best = 1e9;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b === c || b.active === false) continue;
      const dx = b.x - c.x, dz = b.z - c.z;
      const f = dx * hx + dz * hz;
      if (f <= 0 || f > look + 6) continue;
      const l = -dx * hz + dz * hx;
      if (Math.abs(l) > 1.85) continue;
      if (Math.abs(b.y - c.y) > 2) continue;
      const gap = f - c.halfLen - b.halfLen;
      if (gap < best) best = gap;
    }
    return best;
  }

  ringClear(node, me, player) {
    for (const c of this.cars) {
      if (!c.active || c === me || c.mode !== 0) continue;
      const t = c.edge.type;
      if (t !== 'highway' && t !== 'coast') continue;
      const end = c.dir === 0 ? c.edge.b : c.edge.a;
      if (end === node.id && c.edge.len - c.s < 48) return false;
    }
    if (Math.hypot(player.x - node.x, player.z - node.z) < 34 && player.speed > 6) return false;
    return true;
  }

  step(dt, time, bodies, player, camDir) {
    const map = this.map;
    let n = 0;
    for (const c of this.cars) {
      if (!c.active) continue;
      n++;
      const dp = Math.hypot(c.x - player.x, c.z - player.z);
      if (dp > 430) { c.active = false; continue; }
      c.hitT = Math.max(0, (c.hitT || 0) - dt);
      if (c.mode === 2) {
        // corpo livre após colisão
        c.x += c.vx * dt; c.z += c.vz * dt; c.yaw += c.yawRate * dt;
        const sn = Math.sin(c.yaw), cs = Math.cos(c.yaw);
        let vf = c.vx * sn + c.vz * cs, vl = -c.vx * cs + c.vz * sn;
        vf -= Math.sign(vf) * Math.min(Math.abs(vf), 4 * dt);
        vl -= Math.sign(vl) * Math.min(Math.abs(vl), 10 * dt);
        c.vx = sn * vf - cs * vl; c.vz = cs * vf + sn * vl;
        c.yawRate *= Math.exp(-2.5 * dt);
        c.collideStatic(map);
        c.y = map.heightAt(c.x, c.z);
        c.speed = Math.hypot(c.vx, c.vz);
        c.bumpT += dt;
        if (c.speed < 0.4) c.restT += dt;
        if ((c.restT > 5 && dp > 90) || c.bumpT > 45) c.active = false;
        continue;
      }
      const e = c.edge;
      const endNode = map.nodes[c.dir === 0 ? e.b : e.a];
      const trimEnd = endNode.edges.length >= 3 ? endNode.r : 0;
      const sEnd = e.len - trimEnd;
      let target = e.speed * c.pace;
      c.ghostT = Math.max(0, c.ghostT - dt);
      if (c.ghostT <= 0) {
        const gap = this.gapAhead(c, bodies);
        if (gap < 60) target = Math.min(target, Math.max(0, (gap - 2.6) * 0.85));
        if (gap < 3.2 && c.speed < 0.3) { c.stuckT += dt; if (c.stuckT > (c.mode === 1 ? 4 : 9)) { c.ghostT = 2.5; c.stuckT = 0; } } else c.stuckT = 0;
      }
      if (c.mode === 0) {
        const dEnd = sEnd - c.s;
        let stop = false;
        if (endNode.signal >= 0) {
          const col = signalColor(endNode.signal, e.axis, time);
          if (col === 0 || (col === 1 && dEnd > 9)) stop = true;
        } else if (endNode.signal === -2 && e.type !== 'highway' && e.type !== 'coast' && !c.cleared) {
          stop = true;
          if (dEnd < 2 && c.speed < 0.6) {
            c.wait += dt;
            if (c.wait > 0.7 && (c.wait > 7 || this.ringClear(endNode, c, player))) c.cleared = true;
          }
        }
        if (stop) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 4 * (dEnd - 1))));
        if (dEnd < 14 && trimEnd > 0) target = Math.min(target, 9.5);
      } else target = Math.min(target, c.straight ? 11 : 6.5);
      if (c.speed < target) c.speed = Math.min(target, c.speed + 2.8 * dt); else c.speed = Math.max(target, c.speed - 8 * dt);

      let hx, hz;
      const py = c.y;
      if (c.mode === 0) {
        c.s += c.speed * dt;
        if (c.s >= sEnd) this.nextEdge(c, endNode, sEnd);
      }
      if (c.mode === 0) {
        this.lanePos(c.edge, c.dir, c.lane, c.s, _L);
        c.x = _L.x; c.z = _L.z; c.y = _L.y; hx = _L.hx; hz = _L.hz;
      } else {
        c.t += (c.speed * dt) / c.tlen;
        if (c.t >= 1) {
          c.mode = 0; c.edge = c.nEdge; c.dir = c.nDir; c.lane = c.nLane; c.s = c.nS; c.wait = 0; c.cleared = false;
          this.lanePos(c.edge, c.dir, c.lane, c.s, _L);
          c.x = _L.x; c.z = _L.z; c.y = _L.y; hx = _L.hx; hz = _L.hz;
        } else {
          const t = c.t, u = 1 - t;
          c.x = u * u * c.p0x + 2 * u * t * c.p1x + t * t * c.p2x;
          c.z = u * u * c.p0z + 2 * u * t * c.p1z + t * t * c.p2z;
          hx = 2 * u * (c.p1x - c.p0x) + 2 * t * (c.p2x - c.p1x);
          hz = 2 * u * (c.p1z - c.p0z) + 2 * t * (c.p2z - c.p1z);
          const l = Math.hypot(hx, hz) || 1; hx /= l; hz /= l;
        }
      }
      const ty = Math.atan2(hx, hz);
      c.yaw += angleDiff(ty, c.yaw) * (1 - Math.exp(-12 * dt));
      c.vx = hx * c.speed; c.vz = hz * c.speed;
      c.pitch = c.edge.type === 'mountain' && c.speed > 1 ? clamp(-Math.atan2(c.y - py, c.speed * dt), -0.3, 0.3) : 0;
    }
    // reposição
    this.spawnT -= dt;
    if (this.enabled && n < this.target && this.spawnT <= 0) { this.spawnT = 0.12; this.spawn(player, camDir); }
  }

  nextEdge(c, node, sEnd) {
    const map = this.map, rng = this.rng, e = c.edge;
    const opts = node.edges.filter((id) => id !== e.id);
    let e2;
    if (!opts.length) e2 = e;
    else {
      // peso maior para seguir reto
      const d0 = map.edgeDir(e, c.dir, true);
      let tot = 0;
      const ws = opts.map((id) => {
        const o = map.edges[id];
        const d1 = map.edgeDir(o, o.a === node.id ? 0 : 1, false);
        let w = d0[0] * d1[0] + d0[1] * d1[1] > 0.7 ? 3 : 1;
        if (o.type === 'dock') w *= 0.25;
        if (o.type === 'mountain') w *= 0.5;
        tot += w;
        return w;
      });
      let r = rng() * tot, k = 0;
      while (k < ws.length - 1 && r > ws[k]) { r -= ws[k]; k++; }
      e2 = map.edges[opts[k]];
    }
    const dir2 = e2 === e ? 1 - c.dir : e2.a === node.id ? 0 : 1;
    const lane2 = Math.min(e2.lanes - 1, e2.lanes > e.lanes ? Math.floor(rng() * e2.lanes) : c.lane);
    const trim = node.edges.length >= 3 ? node.r : 0;
    if (trim === 0 && e2 !== e) {
      c.edge = e2; c.dir = dir2; c.lane = lane2; c.s = Math.max(0, c.s - sEnd); c.wait = 0; c.cleared = false;
      return;
    }
    this.lanePos(e, c.dir, c.lane, sEnd, _L);
    const p0x = _L.x, p0z = _L.z, h0x = _L.hx, h0z = _L.hz;
    const nS = e2 === e ? e.len - sEnd + 0.01 : trim;
    this.lanePos(e2, dir2, lane2, nS, _L);
    const p2x = _L.x, p2z = _L.z, h2x = _L.hx, h2z = _L.hz;
    const den = h0x * h2z - h0z * h2x;
    let p1x, p1z;
    c.straight = Math.abs(den) < 0.2 && h0x * h2x + h0z * h2z > 0;
    if (Math.abs(den) < 0.2) {
      if (c.straight) { p1x = (p0x + p2x) / 2; p1z = (p0z + p2z) / 2; }
      else { p1x = (p0x + p2x) / 2 + h0x * 7; p1z = (p0z + p2z) / 2 + h0z * 7; } // retorno
    } else {
      const t = clamp(((p2x - p0x) * h2z - (p2z - p0z) * h2x) / den, 1, 40);
      p1x = p0x + h0x * t; p1z = p0z + h0z * t;
    }
    c.p0x = p0x; c.p0z = p0z; c.p1x = p1x; c.p1z = p1z; c.p2x = p2x; c.p2z = p2z;
    c.tlen = Math.max(2, (Math.hypot(p2x - p0x, p2z - p0z) + Math.hypot(p1x - p0x, p1z - p0z) + Math.hypot(p2x - p1x, p2z - p1z)) / 2);
    c.t = 0; c.mode = 1; c.nEdge = e2; c.nDir = dir2; c.nLane = lane2; c.nS = nS;
  }
}
