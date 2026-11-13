// Física arcade com peso: aceleração, freio, drift com freio de mão, saltos e colisões.
import { clamp, lerp, damp } from '../core/util.js';
import { MODEL_DIMS } from './cars.js';
import { WORLD, WATER_Y } from '../world/map.js';

const GRAV = 19;
const GRIP = [1, 0.96, 0.74, 0.62, 0.35]; // pista, calçada, grama, areia, água
const DRAG = [0, 0.012, 0.11, 0.2, 1.4];
const NG = 5;

export class Vehicle {
  constructor(spec, model) {
    this.in = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0;
    this.vx = 0; this.vz = 0; this.vy = 0; this.yawRate = 0;
    this.steer = 0; this.pitch = 0; this.roll = 0; this.slope = 0;
    this.grounded = true; this.airTime = 0; this.drift = 0; this.slip = 0;
    this.nitro = 1; this.nitroOn = false; this.rpm = 0.2; this.gear = 0;
    this.surface = 0; this.speed = 0; this.vf = 0; this.damage = 0; this.waterT = 0;
    this.accelLong = 0; this.accelLat = 0;
    this.onImpact = null; this.onLand = null;
    this.detail = false; // amostra rolagem do terreno (só o jogador)
    this.kind = 'car';
    this.setSpec(spec, model);
  }
  setSpec(spec, model) {
    this.spec = spec; this.model = model;
    const d = MODEL_DIMS[model];
    this.halfLen = d.len / 2; this.halfWid = d.wid / 2; this.wb = d.wb;
    this.mass = spec.mass; this.cr = d.wid / 2; this.co = d.len / 2 - d.wid / 2;
  }
  place(x, z, yaw, map) {
    this.x = x; this.z = z; this.yaw = yaw; this.y = map.heightAt(x, z);
    this.vx = this.vz = this.vy = this.yawRate = 0; this.steer = 0; this.drift = 0;
    this.grounded = true; this.pitch = this.roll = 0; this.waterT = 0;
  }

  step(dt, map) {
    const S = this.spec, inp = this.in;
    const st = clamp(inp.steer, -1, 1);
    const rate = Math.abs(st) < Math.abs(this.steer) || st * this.steer < 0 ? 9 : 5.5;
    this.steer += clamp(st - this.steer, -rate * dt, rate * dt);

    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    let vf = this.vx * sn + this.vz * cs;
    let vl = -this.vx * cs + this.vz * sn;
    const vf0 = vf;
    const sp = Math.abs(vf);
    const surf = (this.surface = map.surfaceAt(this.x, this.z, this.y));
    const gm = GRIP[surf];
    let nitroOn = false;

    if (this.grounded) {
      const thr = inp.throttle, brk = inp.brake;
      let a = 0;
      const offTop = surf >= 2 ? (surf === 4 ? 0.22 : 0.72) : 1;
      nitroOn = inp.nitro && thr > 0.1 && this.nitro > 0 && (this.nitroOn || this.nitro > 0.1);
      const top = S.top * offTop * (nitroOn ? 1.2 : 1) * (1 - this.damage * 0.12);
      if (thr > 0) {
        if (vf >= -0.5) {
          const k = clamp(vf / top, 0, 1.3);
          a += thr * S.accel * (nitroOn ? S.nitroPow : 1) * Math.max(0, 1 - k * k * k) * (0.5 + 0.5 * gm);
        } else a += thr * S.brake;
      }
      if (brk > 0) {
        if (vf > 0.8) a -= brk * S.brake * (0.4 + 0.6 * gm);
        else a -= brk * S.accel * 0.6 * Math.max(0, 1 + vf / 13);
      }
      a -= 9.5 * this.slope;
      vf += a * dt;
      let fr = 0.3 + DRAG[surf] * sp + (thr < 0.05 && brk < 0.05 ? 0.8 + 0.012 * sp : 0);
      if (inp.handbrake) fr += 6 * gm;
      if (sp > top) fr += (sp - top) * 1.6;
      fr *= dt;
      vf = vf > 0 ? Math.max(0, vf - fr) : Math.min(0, vf + fr);

      // direção
      const k = clamp(sp / 58, 0, 1);
      const ang = this.steer * lerp(0.58, 0.075, Math.pow(k, 0.6)) * S.steer;
      let yr = -(vf / this.wb) * Math.tan(ang);
      const hb = inp.handbrake && sp > 5;
      if (hb) this.drift = Math.min(1, this.drift + dt * 5);
      else {
        const slipA = Math.abs(Math.atan2(vl, Math.max(sp, 1)));
        this.drift = Math.max(0, this.drift - dt * (slipA > 0.2 && thr > 0.4 ? 0.55 : 2.4));
      }
      const aLat = 11.5 * S.grip * gm;
      const yrMax = (aLat / Math.max(sp, 5)) * (1.22 + this.drift * 0.9);
      yr = clamp(yr, -yrMax, yrMax);
      this.yawRate = damp(this.yawRate, yr, 10, dt);
      if (sp > 3) this.yawRate -= Math.sign(vf) * Math.atan2(vl, sp) * (1.7 - this.drift * 1.2) * 3 * dt;
      // aderência lateral
      const lg = lerp(10, 1.8, this.drift) * gm;
      let dv = vl * Math.min(1, lg * dt);
      const lim = aLat * (1 - 0.45 * this.drift) * dt * 1.3;
      dv = clamp(dv, -lim, lim);
      vl -= dv;
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), Math.abs(dv) * 0.1);
      this.accelLat = damp(this.accelLat, -dv / dt, 8, dt);
      this.slip = clamp((Math.abs(vl) - 1.4) / 7, 0, 1);
      if (brk > 0.8 && sp > 14) this.slip = Math.max(this.slip, 0.25);
      if (this.drift > 0.3) this.nitro = Math.min(1, this.nitro + this.drift * sp * dt * 0.0011);
    } else {
      this.yawRate *= 1 - 0.5 * dt;
      this.yawRate -= this.steer * 0.5 * dt;
      this.slip = 0;
      this.accelLat = damp(this.accelLat, 0, 4, dt);
    }
    this.nitroOn = nitroOn;
    if (nitroOn) this.nitro = Math.max(0, this.nitro - dt / S.nitroDur);
    else this.nitro = Math.min(1, this.nitro + dt / 38);
    this.accelLong = damp(this.accelLong, (vf - vf0) / dt, 8, dt);

    this.vx = sn * vf - cs * vl;
    this.vz = cs * vf + sn * vl;
    this.yaw += this.yawRate * dt;
    const px = this.x, pz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    // limites do mundo
    if (this.x < WORLD.x0 + 25) { this.x = WORLD.x0 + 25; if (this.vx < 0) this.vx = 0; }
    if (this.x > WORLD.x1 - 25) { this.x = WORLD.x1 - 25; if (this.vx > 0) this.vx = 0; }
    if (this.z < WORLD.z0 + 25) { this.z = WORLD.z0 + 25; if (this.vz < 0) this.vz = 0; }
    if (this.z > WORLD.z1 - 25) { this.z = WORLD.z1 - 25; if (this.vz > 0) this.vz = 0; }

    this.collideStatic(map);

    // vertical
    const sn2 = Math.sin(this.yaw), cs2 = Math.cos(this.yaw), hl = this.wb / 2;
    const hF = map.heightAt(this.x + sn2 * hl, this.z + cs2 * hl);
    const hB = map.heightAt(this.x - sn2 * hl, this.z - cs2 * hl);
    const gy = (hF + hB) / 2;
    const slope = clamp((hF - hB) / this.wb, -0.6, 0.6);
    if (this.grounded) {
      if (Math.max(hF, hB) - this.y > 1.1) {
        // degrau alto: trata como parede
        const imp = Math.hypot(this.vx, this.vz);
        this.x = px; this.z = pz;
        this.vx *= -0.3; this.vz *= -0.3;
        if (this.onImpact && imp > 2) this.onImpact(imp, 0, Math.sign(vf) * this.halfLen, 0, 0);
      } else {
        const yFree = this.y + this.vy * dt - 0.5 * GRAV * dt * dt;
        if (gy < yFree - 0.03) {
          this.grounded = false; this.airTime = 0;
          this.vy -= GRAV * dt; this.y = yFree;
        } else {
          this.y = gy; this.slope = slope;
          this.vy = (this.vx * sn2 + this.vz * cs2) * slope;
        }
      }
    } else {
      this.airTime += dt;
      this.vy -= GRAV * dt;
      this.y += this.vy * dt;
      this.slope = 0;
      if (this.y <= gy) {
        const imp = -this.vy;
        this.y = gy; this.grounded = true; this.vy = 0;
        if (this.airTime > 0.25) {
          this.nitro = Math.min(1, this.nitro + this.airTime * 0.12);
          if (this.onLand) this.onLand(imp, this.airTime);
        }
      }
    }
    // inclinação visual
    let tp, tr = 0;
    if (this.grounded) {
      tp = -Math.atan2(hF - hB, this.wb);
      if (this.detail) {
        const hw = this.halfWid;
        tr = Math.atan2(map.heightAt(this.x + cs2 * hw, this.z - sn2 * hw) - map.heightAt(this.x - cs2 * hw, this.z + sn2 * hw), hw * 2);
      }
    } else tp = clamp(this.pitch + (this.vy < 0 ? 0.25 : -0.05) * dt, -0.5, 0.45);
    this.pitch = damp(this.pitch, tp, 14, dt);
    this.roll = damp(this.roll, tr, 12, dt);

    if (this.y < WATER_Y - 0.25) this.waterT += dt; else this.waterT = 0;

    // rotação e marcha (para o áudio)
    this.vf = this.vx * sn2 + this.vz * cs2;
    this.speed = Math.hypot(this.vx, this.vz);
    const frac = clamp(Math.abs(this.vf) / (S.top * 1.04), 0, 0.999);
    const gf = Math.pow(frac, 0.72) * NG;
    const g = Math.floor(gf);
    let r = gf - g;
    if (g === 0) r = 0.15 + r * 0.85; else r = 0.35 + r * 0.65;
    if (!this.grounded) r = Math.min(1, r + 0.25 * inp.throttle);
    if (g !== this.gear) { this.gear = g; this.shiftT = 0.12; }
    this.shiftT = Math.max(0, (this.shiftT || 0) - dt);
    this.rpm = damp(this.rpm, r * (0.8 + 0.2 * inp.throttle), this.shiftT > 0 ? 25 : 9, dt);
  }

  collideStatic(map) {
    const r = this.cr, off = this.co;
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    for (let k = -1; k <= 1; k++) {
      const ox = sn * off * k, oz = cs * off * k;
      const cx0 = this.x + ox, cz0 = this.z + oz;
      const ix0 = Math.floor((cx0 - r) / 32), ix1 = Math.floor((cx0 + r) / 32);
      const iz0 = Math.floor((cz0 - r) / 32), iz1 = Math.floor((cz0 + r) / 32);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
        const cell = map.colGet(ix, iz);
        if (!cell) continue;
        const bl = cell.b;
        for (let q = 0; q < bl.length; q++) {
          const b = map.boxes[bl[q]];
          if (this.y > b[4] - 0.4) continue;
          const cx = this.x + ox, cz = this.z + oz;
          const qx = cx < b[0] ? b[0] : cx > b[2] ? b[2] : cx;
          const qz = cz < b[1] ? b[1] : cz > b[3] ? b[3] : cz;
          let dx = cx - qx, dz = cz - qz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          let nx, nz, pen;
          if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
          else {
            const l = cx - b[0], rr = b[2] - cx, t = cz - b[1], bb = b[3] - cz;
            const m = Math.min(l, rr, t, bb);
            if (m === l) { nx = -1; nz = 0; } else if (m === rr) { nx = 1; nz = 0; } else if (m === t) { nx = 0; nz = -1; } else { nx = 0; nz = 1; }
            pen = m + r;
          }
          this._resolve(nx, nz, pen, ox, oz, cx - nx * (r - pen), cz - nz * (r - pen));
        }
        const cl = cell.c;
        for (let q = 0; q < cl.length; q++) {
          const c = map.circles[cl[q]];
          const cx = this.x + ox, cz = this.z + oz;
          const dx = cx - c[0], dz = cz - c[1];
          const rr = r + c[2];
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr || d2 < 1e-8) continue;
          if (this.y > map.heightAt(c[0], c[1]) + 3) continue;
          const d = Math.sqrt(d2);
          this._resolve(dx / d, dz / d, rr - d, ox, oz, c[0], c[1]);
        }
      }
    }
  }

  _resolve(nx, nz, pen, ox, oz, wx, wz) {
    this.x += nx * pen; this.z += nz * pen;
    const vn = this.vx * nx + this.vz * nz;
    if (vn >= 0) return;
    const imp = -vn;
    this.vx -= 1.2 * vn * nx; this.vz -= 1.2 * vn * nz;
    const f = 1 - Math.min(0.45, imp * 0.035);
    const tx = -nz, tz = nx;
    const vt = this.vx * tx + this.vz * tz, vn2 = this.vx * nx + this.vz * nz;
    this.vx = tx * vt * f + nx * vn2; this.vz = tz * vt * f + nz * vn2;
    this.yawRate += clamp((oz * nx - ox * nz) * imp * 0.1, -2.5, 2.5);
    this._emitImpact(imp, wx, wz, nx, nz);
  }

  _emitImpact(imp, wx, wz, nx, nz) {
    if (imp > 3) this.damage = Math.min(1, this.damage + imp * 0.006);
    if (!this.onImpact) return;
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    const rx = wx - this.x, rz = wz - this.z;
    this.onImpact(imp, rx * cs - rz * sn, rx * sn + rz * cs, nx * cs - nz * sn, nx * sn + nz * cs);
  }
}

// Colisão entre dois corpos (Vehicle ou carro de trânsito). Retorna a intensidade do impacto.
export function collideCars(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const R = a.halfLen + b.halfLen + 0.4;
  if (dx * dx + dz * dz > R * R) return 0;
  if (Math.abs(a.y - b.y) > 1.6) return 0;
  const sa = Math.sin(a.yaw), ca = Math.cos(a.yaw), sb = Math.sin(b.yaw), cb = Math.cos(b.yaw);
  const ra = a.cr, rb = b.cr;
  let best = 0, bnx = 0, bnz = 0, pax = 0, paz = 0, pbx = 0, pbz = 0;
  for (let i = -1; i <= 1; i++) {
    const ax = a.x + sa * a.co * i, az = a.z + ca * a.co * i;
    for (let j = -1; j <= 1; j++) {
      const bx = b.x + sb * b.co * j, bz = b.z + cb * b.co * j;
      const ex = bx - ax, ez = bz - az;
      const d2 = ex * ex + ez * ez, rr = ra + rb;
      if (d2 < rr * rr && d2 > 1e-8) {
        const d = Math.sqrt(d2), pen = rr - d;
        if (pen > best) { best = pen; bnx = ex / d; bnz = ez / d; pax = ax - a.x; paz = az - a.z; pbx = bx - b.x; pbz = bz - b.z; }
      }
    }
  }
  if (best <= 0) return 0;
  const ia = 1 / a.mass, ib = 1 / b.mass, it = ia + ib;
  a.x -= bnx * best * (ia / it); a.z -= bnz * best * (ia / it);
  b.x += bnx * best * (ib / it); b.z += bnz * best * (ib / it);
  const rvn = (b.vx - a.vx) * bnx + (b.vz - a.vz) * bnz;
  if (rvn >= 0) return 0.01;
  const j = (-1.25 * rvn) / it;
  a.vx -= j * ia * bnx; a.vz -= j * ia * bnz;
  b.vx += j * ib * bnx; b.vz += j * ib * bnz;
  const imp = -rvn;
  a.yawRate += clamp(-(paz * bnx - pax * bnz) * j * ia * 0.35, -2, 2);
  b.yawRate += clamp((pbz * bnx - pbx * bnz) * j * ib * 0.35, -2, 2);
  const cxw = a.x + pax + bnx * ra, czw = a.z + paz + bnz * ra;
  if (a._emitImpact) a._emitImpact(imp * (ib / it) * 2, cxw, czw, -bnx, -bnz);
  if (b._emitImpact) b._emitImpact(imp * (ia / it) * 2, cxw, czw, bnx, bnz);
  if (a.onCarHit) a.onCarHit(imp, b);
  if (b.onCarHit) b.onCarHit(imp, a);
  return imp;
}
