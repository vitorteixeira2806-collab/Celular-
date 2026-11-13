// Partículas leves (fumaça de pneu, poeira, faíscas), simuladas na CPU e desenhadas instanciadas.
const MAX = 90;

export class Particles {
  constructor() {
    this.p = [];
    for (let i = 0; i < MAX; i++) this.p.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, grow: 1, r: 1, g: 1, b: 1, spark: false });
    this.next = 0; this.acc = 0;
  }
  emit(x, y, z, vx, vy, vz, life, size, grow, r, g, b, spark) {
    const q = this.p[this.next];
    this.next = (this.next + 1) % MAX;
    q.life = q.max = life; q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz;
    q.size = size; q.grow = grow; q.r = r; q.g = g; q.b = b; q.spark = !!spark;
  }
  // fumaça nas rodas traseiras quando o carro escorrega; poeira fora do asfalto
  fromCar(v, dt) {
    this.acc += dt;
    if (this.acc < 0.035) return;
    this.acc = 0;
    if (!v.grounded || v.speed < 7) return;
    const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw), side = Math.random() < 0.5 ? -1 : 1;
    const x = v.x - sn * v.halfLen * 0.75 + cs * v.halfWid * 0.8 * side, z = v.z - cs * v.halfLen * 0.75 - sn * v.halfWid * 0.8 * side;
    const slip = Math.max(v.slip, v.drift * 0.8);
    if (v.surface >= 2 && v.surface < 4) {
      const sand = v.surface === 3;
      this.emit(x, v.y + 0.25, z, v.vx * 0.12, 0.9 + Math.random(), v.vz * 0.12, 0.9, 0.7, 2.6, sand ? 0.86 : 0.58, sand ? 0.78 : 0.5, sand ? 0.58 : 0.38);
    } else if (slip > 0.3 && v.surface < 2) {
      const k = 0.78 + Math.random() * 0.15;
      this.emit(x, v.y + 0.2, z, v.vx * 0.18 + (Math.random() - 0.5), 0.7 + Math.random() * 0.8, v.vz * 0.18 + (Math.random() - 0.5), 0.75 + slip * 0.5, 0.55, 3.2, k, k, k);
    }
  }
  sparks(x, y, z, n) {
    for (let i = 0; i < n; i++) this.emit(x, y + 0.4, z, (Math.random() - 0.5) * 9, 2 + Math.random() * 4, (Math.random() - 0.5) * 9, 0.25 + Math.random() * 0.3, 0.16, 0, 1, 0.62, 0.2, true);
  }
  step(dt) {
    for (const q of this.p) {
      if (q.life <= 0) continue;
      q.life -= dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.spark) q.vy -= 14 * dt; else { q.vx *= 1 - 1.8 * dt; q.vz *= 1 - 1.8 * dt; q.vy *= 1 - 1.2 * dt; }
    }
  }
  draw(f, light) {
    for (const q of this.p) {
      if (q.life <= 0) continue;
      const t = 1 - q.life / q.max;
      if (q.spark) f.glow(q.x, q.y, q.z, q.size * (1 - t * 0.6), 0xffa040, 1.6);
      else {
        // cresce e some no fim da vida
        const fade = t < 0.7 ? 1 : (1 - t) / 0.3;
        f.puff(q.x, q.y, q.z, (q.size + q.grow * t) * (0.55 + 0.45 * fade), q.r * light * fade + 0.02, q.g * light * fade + 0.02, q.b * light * fade + 0.02);
      }
    }
  }
}
