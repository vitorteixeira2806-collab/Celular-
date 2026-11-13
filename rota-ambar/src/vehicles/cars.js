// Catálogo de carros (todos originais) e geometria procedural low-poly.
import * as THREE from 'three';
import { Geo, C } from '../world/geo.js';
import { glossy } from '../world/env.js';

// top = velocidade máxima (m/s), accel (m/s²), grip (multiplicador), steer (agilidade)
export const CARS = [
  { id: 'faisca', name: 'Nimbo Faísca', cls: 'Compacto', price: 0, model: 'compact', top: 44, accel: 6.4, brake: 15, grip: 1.0, steer: 1.08, mass: 1000, color: 0xf2b632 },
  { id: 'tropeira', name: 'Tropeiro Cargueira', cls: 'Picape', price: 4500, model: 'pickup', top: 48, accel: 6.9, brake: 14, grip: 0.92, steer: 0.9, mass: 1750, color: 0xb23a2e },
  { id: 'rochedo', name: 'Serrano Rochedo', cls: 'SUV', price: 7500, model: 'suv', top: 52, accel: 7.5, brake: 14.5, grip: 0.97, steer: 0.94, mass: 1900, color: 0x2e6b4f },
  { id: 'trovao', name: 'Vulcano Trovão', cls: 'Muscle', price: 15000, model: 'muscle', top: 62, accel: 9.8, brake: 15, grip: 0.95, steer: 0.96, mass: 1550, color: 0x1f4fa8 },
  { id: 'lince', name: 'Áurea Lince', cls: 'Esportivo', price: 28000, model: 'sport', top: 69, accel: 10.8, brake: 17, grip: 1.16, steer: 1.1, mass: 1250, color: 0xd9412b },
  { id: 'cometa', name: 'Kyra Cometa', cls: 'Super', price: 55000, model: 'super', top: 81, accel: 13.2, brake: 19, grip: 1.3, steer: 1.15, mass: 1300, color: 0xf07a13 },
];
export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];

export const PAINTS = [0xf2b632, 0xd9412b, 0x1f4fa8, 0x2e6b4f, 0xf07a13, 0xf4f4f0, 0x16181c, 0x8a8f96, 0x7a2fb8, 0x18b0c9, 0xe84f9a, 0x9bd13a];
export const TRAFFIC_COLORS = [0xd8d8d4, 0x9aa0a6, 0x30343a, 0x8c2b22, 0x23467a, 0xc9b98f, 0x3f6b52, 0xe0e0e0, 0x5a5e66, 0xb5651d, 0x101216];

// especificação efetiva com melhorias (motor, pneus, nitro: níveis 0..3)
export function effectiveSpec(car, up) {
  const e = (up && up.engine) || 0, t = (up && up.tires) || 0, n = (up && up.nitro) || 0;
  return {
    top: car.top * (1 + 0.04 * e), accel: car.accel * (1 + 0.075 * e), brake: car.brake * (1 + 0.05 * t),
    grip: car.grip * (1 + 0.06 * t), steer: car.steer * (1 + 0.02 * t), mass: car.mass,
    nitroDur: 3.2 * (1 + 0.28 * n), nitroPow: 1.55 + 0.12 * n,
  };
}
export const upgradeCost = (car, kind, level) => Math.round(((car.price || 3000) * 0.11 + 500) * (level + 1) * (kind === 'engine' ? 1.25 : 1) / 50) * 50;

// ---------------------------------------------------------------------------
// Carrocerias modernas: superfície contínua gerada por seções transversais ("loft"),
// com normais suaves, vidros rentes, faróis finos e rodas de liga com raios.
// Todos os desenhos são originais; cada modelo é só um conjunto de medidas.
// cab = [base do vidro traseiro, início do teto, fim do teto, base do para-brisa] em fração do comprimento.
const SILVER = 0xc6ccd4, GUN = 0x3b3f46, BLACKRIM = 0x17191c;
const M = {
  compact: { doors4: 1, len: 4.05, wid: 1.78, ride: 0.17, wr: 0.32, wb: 2.56, tailH: 0.96, deckH: 1.02, beltR: 0.93, beltF: 0.84, cowlH: 0.9, noseH: 0.69, roofH: 1.46, cab: [-0.455, -0.31, 0.05, 0.25], roofK: 0.76, noseT: 0.2, tailT: 0.1, spokes: 5, rim: SILVER, lip: 0.06 },
  sedan: { doors4: 1, len: 4.6, wid: 1.84, ride: 0.17, wr: 0.33, wb: 2.75, tailH: 0.9, deckH: 0.97, beltR: 0.92, beltF: 0.84, cowlH: 0.9, noseH: 0.68, roofH: 1.41, cab: [-0.31, -0.19, 0.1, 0.27], roofK: 0.74, noseT: 0.2, tailT: 0.14, spokes: 7, rim: SILVER },
  muscle: { len: 4.85, wid: 1.95, ride: 0.16, wr: 0.36, wb: 2.86, tailH: 0.9, deckH: 0.99, beltR: 0.94, beltF: 0.86, cowlH: 0.93, noseH: 0.75, roofH: 1.31, cab: [-0.35, -0.18, 0.04, 0.19], roofK: 0.72, noseT: 0.13, tailT: 0.12, spokes: 5, rim: GUN, stripes: 0x101216, lip: 0.1, splitter: 1, wide: 1 },
  sport: { len: 4.45, wid: 1.93, ride: 0.13, wr: 0.345, wb: 2.62, tailH: 0.84, deckH: 0.9, beltR: 0.84, beltF: 0.76, cowlH: 0.83, noseH: 0.57, roofH: 1.22, cab: [-0.36, -0.17, 0.04, 0.21], roofK: 0.7, noseT: 0.24, tailT: 0.16, spokes: 6, rim: GUN, bar: 1, lip: 0.07, splitter: 1 },
  super: { len: 4.62, wid: 2.03, ride: 0.11, wr: 0.35, wb: 2.72, tailH: 0.8, deckH: 0.86, beltR: 0.8, beltF: 0.66, cowlH: 0.72, noseH: 0.45, roofH: 1.1, cab: [-0.17, -0.06, 0.1, 0.3], roofK: 0.66, noseT: 0.26, tailT: 0.1, spokes: 8, rim: BLACKRIM, bar: 1, wing: 0.3, splitter: 1, intakes: 1, wide: 1 },
  suv: { doors4: 1, len: 4.75, wid: 1.97, ride: 0.27, wr: 0.4, wb: 2.86, tailH: 1.1, deckH: 1.16, beltR: 1.12, beltF: 1.06, cowlH: 1.14, noseH: 0.97, roofH: 1.75, cab: [-0.47, -0.37, 0.07, 0.25], roofK: 0.8, noseT: 0.14, tailT: 0.08, spokes: 6, rim: SILVER, clad: 1, rails: 1, bar: 1 },
  pickup: { doors4: 1, len: 5.3, wid: 1.99, ride: 0.3, wr: 0.41, wb: 3.28, tailH: 1.1, deckH: 1.12, beltR: 1.1, beltF: 1.08, cowlH: 1.17, noseH: 1.02, roofH: 1.8, cab: [-0.1, -0.06, 0.16, 0.29], roofK: 0.82, noseT: 0.12, tailT: 0.05, spokes: 6, rim: GUN, clad: 1, bed: 1 },
};
for (const k in M) { const m = M[k]; m.belt = m.beltF; m.roof = m.roofH; m.hoodF = Math.min(m.beltF, m.noseH - 0.07) - 0.02; m.deck = m.beltR + 0.04; }
export const MODEL_DIMS = M;

const GLASS = C(0x18222e), TIRE = C(0x0f1012), TRIM = C(0x1b1e22), HEAD = C(0xfff6d8), DRL = C(0xdff2ff), TAIL = C(0xd42418), WHITE = [1, 1, 1], PLATE = C(0xd9d9d2), BED = C(0x0d0e10);
const lerp = (a, b, t) => a + (b - a) * t;
const cl01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// triângulo/quad com a face voltada para a direção (dx,dy,dz)
function triDir(g, a, b, c, col, dx, dy, dz) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const d = (uy * vz - uz * vy) * dx + (uz * vx - ux * vz) * dy + (ux * vy - uy * vx) * dz;
  if (d >= 0) g.tri(a, b, c, col); else g.tri(a, c, b, col);
}
function quadDir(g, a, b, c, d, col, dx, dy, dz) { triDir(g, a, b, c, col, dx, dy, dz); triDir(g, a, c, d, col, dx, dy, dz); }

// roda de liga: pneu, aro e raios. side = +1 quando a face externa aponta para +x
function wheelGeo(g, x, y, z, R, W, side, m, seg = 14) {
  const xi = x - (W / 2) * side, xo = x + (W / 2) * side;
  const rim = C(m.rim), rimDark = C(0x0b0c0e), hub = C(0x8d949c);
  const pt = (px, r, a) => [px, y + Math.cos(a) * r, z + Math.sin(a) * r];
  const rr = R * 0.7;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
    const ry = Math.cos(am), rz = Math.sin(am);
    // banda de rodagem com ombro chanfrado
    quadDir(g, pt(xi, R, a0), pt(xo - 0.035 * side, R, a0), pt(xo - 0.035 * side, R, a1), pt(xi, R, a1), TIRE, 0, ry, rz);
    quadDir(g, pt(xo - 0.035 * side, R, a0), pt(xo, R - 0.035, a0), pt(xo, R - 0.035, a1), pt(xo - 0.035 * side, R, a1), TIRE, side * 0.7, ry, rz);
    quadDir(g, pt(xo, R - 0.035, a0), pt(xo, rr, a0), pt(xo, rr, a1), pt(xo, R - 0.035, a1), TIRE, side, 0, 0);
    triDir(g, [xi, y, z], pt(xi, R, a0), pt(xi, R, a1), rimDark, -side, 0, 0);
    // aro: borda, fundo escuro e cubo
    quadDir(g, pt(xo, rr, a0), pt(xo - 0.012 * side, rr * 0.88, a0), pt(xo - 0.012 * side, rr * 0.88, a1), pt(xo, rr, a1), rim, side, -ry * 0.6, -rz * 0.6);
    triDir(g, [xo - 0.06 * side, y, z], pt(xo - 0.06 * side, rr * 0.9, a0), pt(xo - 0.06 * side, rr * 0.9, a1), rimDark, side, 0, 0);
    triDir(g, [xo - 0.012 * side, y, z], pt(xo - 0.015 * side, R * 0.17, a0), pt(xo - 0.015 * side, R * 0.17, a1), hub, side, 0, 0);
  }
  // raios
  const n = m.spokes, xs = xo - 0.02 * side;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, wi = 0.34, wo = (Math.PI / n) * 0.42;
    quadDir(g, pt(xs, R * 0.15, a - wi), pt(xs, rr * 0.9, a - wo), pt(xs, rr * 0.9, a + wo), pt(xs, R * 0.15, a + wi), rim, side, 0, 0);
  }
}

const _cache = new Map();

// Retorna { paint, detail, wheel, wheelPos, dims } — geometrias compartilhadas (clone para deformar)
export function carGeometry(model, opts = {}) {
  const key = model + (opts.police ? '_p' : '') + (opts.withWheels ? '_w' : '');
  if (_cache.has(key)) return _cache.get(key);
  const m = M[model];
  const P = new Geo(), D = new Geo();
  const L = m.len, zr = -L / 2, zf = L / 2, W = m.wid / 2;
  const [cA, cB, cC, cD] = m.cab.map((f) => f * L);
  const gA = lerp(cA, cB, 0.4), gD = lerp(cD, cC, 0.34); // limites dos vidros laterais
  const bp = m.doors4 ? lerp(gA, gD, 0.5) : 1e9;           // coluna central (4 portas)
  const crit = m.doors4 ? [cA, cB, cC, cD, gA, gD, bp - 0.06, bp + 0.06] : [cA, cB, cC, cD, gA, gD];

  // linha superior (capô, para-brisa, teto, vidro traseiro, tampa)
  const topY = (z) => {
    if (z < cA) return lerp(m.tailH, m.deckH, cl01((z - zr) / (cA - zr)) ** 0.7);
    if (z < cB) return lerp(m.deckH, m.roofH, 1 - (1 - (z - cA) / (cB - cA)) ** 1.5);
    if (z <= cC) return m.roofH + 0.022 * Math.sin(((z - cB) / (cC - cB)) * Math.PI);
    if (z < cD) return lerp(m.roofH, m.cowlH, ((z - cC) / (cD - cC)) ** 1.2);
    return lerp(m.cowlH, m.noseH, ((z - cD) / (zf - cD)) ** 1.7);
  };
  const endK = (z) => { const e = Math.abs(z) / (L / 2); return e < 0.56 ? 0 : (e - 0.56) / 0.44; };
  const halfW = (z) => { const k = endK(z); return W * (1 - (z > 0 ? m.noseT : m.tailT) * k * k) * (1 - 0.07 * k ** 9); };
  const botY = (z) => { const k = endK(z); return m.ride + (z > 0 ? 0.06 : 0.1) * k * k; };
  const beltY = (z) => Math.min(lerp(m.beltR, m.beltF, (z - zr) / L), topY(z) - 0.07);
  const cabK = (z) => (z <= cA || z >= cD ? 0 : z < cB ? (z - cA) / (cB - cA) : z <= cC ? 1 : 1 - (z - cC) / (cD - cC));

  // estações ao longo do comprimento (mais densas nas pontas, e exatamente nas quebras da cabine)
  const zs = [];
  const NS = 20;
  for (let i = 0; i <= NS; i++) zs.push((-Math.cos((i / NS) * Math.PI) * L) / 2);
  for (const v of crit) zs.push(v);
  zs.sort((a, b) => a - b);
  const st = [zs[0]];
  for (let i = 1; i < zs.length; i++) {
    const v = zs[i], isCrit = crit.includes(v);
    if (v - st[st.length - 1] < 0.07) { if (isCrit && !crit.includes(st[st.length - 1])) st[st.length - 1] = v; else if (isCrit) st.push(v); continue; }
    st.push(v);
  }
  st[0] = zr; st[st.length - 1] = zf;

  // anel de cada estação (metade direita, x >= 0): fundo, soleira, lateral, ombro, borda do teto/capô, topo
  const NR = 7;
  const ring = st.map((z) => {
    const w = halfW(z), yb = botY(z), ys = beltY(z), yt = topY(z), k = cabK(z);
    const we = lerp(w * (m.bed && z < cA ? 0.9 : 0.8), W * m.roofK * (halfW(z) / W) ** 0.5, k), ye = yt - lerp(0.035, 0.055, k);
    return [[0, yb, z], [w * 0.87, yb, z], [w, yb + (ys - yb) * 0.48, z], [w * 0.965, ys, z], [we, Math.max(ye, ys + 0.01), z], [we * (m.bed && z < cA ? 0.9 : 0.52), yt - 0.012, z], [0, yt, z]];
  });
  // normais suaves
  const nrm = ring.map((r) => r.map(() => [0, 0, 0]));
  for (let i = 0; i < ring.length - 1; i++) for (let j = 0; j < NR - 1; j++) {
    const A = ring[i][j], B = ring[i + 1][j], Dq = ring[i][j + 1];
    const ux = Dq[0] - A[0], uy = Dq[1] - A[1], uz = Dq[2] - A[2], vx = B[0] - A[0], vy = B[1] - A[1], vz = B[2] - A[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const q of [nrm[i][j], nrm[i + 1][j], nrm[i + 1][j + 1], nrm[i][j + 1]]) { q[0] += n[0]; q[1] += n[1]; q[2] += n[2]; }
  }
  for (const r of nrm) r.forEach((n, j) => {
    if (j === 0 || j === NR - 1) n[0] = 0;
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n[0] /= l; n[1] /= l; n[2] /= l;
  });

  const put = (g, p, n, col, sx) => g._v(p[0] * sx, p[1], p[2], n[0] * sx, n[1], n[2], col, -1, -1);
  const doorWhite = C(0xf2f2ee);
  // material de cada faixa da superfície
  const bandMat = (j, zm) => {
    if (j === 0) return [D, TRIM];
    if (j === 1 && m.clad) return [D, TRIM];
    if (j <= 2) return opts.police && zm > cB && zm < cD ? [D, doorWhite] : [P, WHITE];
    // colunas escuras (teto "flutuante") e vidros laterais
    if (j === 3) return zm > cA && zm < cD ? (zm > gA && zm < gD && Math.abs(zm - bp) > 0.06 ? [D, GLASS] : [D, TRIM]) : [P, WHITE];
    if ((zm > cA && zm < cB) || (zm > cC && zm < cD)) return [D, GLASS];
    if (m.bed && zm < cA && j === 5) return [D, BED];
    return [P, WHITE];
  };
  for (let i = 0; i < ring.length - 1; i++) {
    const zm = (st[i] + st[i + 1]) / 2;
    for (let j = 0; j < NR - 1; j++) {
      const [g, col] = bandMat(j, zm);
      const A = ring[i][j], B = ring[i + 1][j], Cc = ring[i + 1][j + 1], Dq = ring[i][j + 1];
      const nA = nrm[i][j], nB = nrm[i + 1][j], nC = nrm[i + 1][j + 1], nD = nrm[i][j + 1];
      // lado direito (A, D, C, B) e espelho (A, B, C, D)
      put(g, A, nA, col, 1); put(g, Dq, nD, col, 1); put(g, Cc, nC, col, 1);
      put(g, A, nA, col, 1); put(g, Cc, nC, col, 1); put(g, B, nB, col, 1);
      put(g, A, nA, col, -1); put(g, B, nB, col, -1); put(g, Cc, nC, col, -1);
      put(g, A, nA, col, -1); put(g, Cc, nC, col, -1); put(g, Dq, nD, col, -1);
    }
  }
  // frente e traseira (painéis planos onde ficam faróis, grade e lanternas)
  for (const [ri, dz] of [[0, -1], [ring.length - 1, 1]]) {
    const r = ring[ri], cy = (r[0][1] + r[NR - 1][1]) / 2, c = [0, cy, r[0][2]];
    for (let j = 0; j < NR - 1; j++) for (const sx of [1, -1]) {
      triDir(P, c, [r[j][0] * sx, r[j][1], r[j][2]], [r[j + 1][0] * sx, r[j + 1][1], r[j + 1][2]], WHITE, 0, 0, dz);
    }
  }

  // ---------- frente ----------
  const wN = halfW(zf), ybN = botY(zf), ysN = beltY(zf), zN = zf + 0.012;
  const fq = (x0, y0, x1, y1, col, zz) => { for (const sx of [1, -1]) quadDir(D, [x0 * sx, y0, zz], [x1 * sx, y0, zz], [x1 * sx, y1, zz], [x0 * sx, y1, zz], col, 0, 0, 1); };
  fq(wN * 0.5, ysN - 0.17, wN * 0.985, ysN - 0.06, TRIM, zN);           // carcaça do farol
  fq(wN * 0.54, ysN - 0.15, wN * 0.96, ysN - 0.085, HEAD, zN + 0.006);   // farol fino
  fq(wN * 0.5, ysN - 0.05, wN * 0.985, ysN - 0.025, DRL, zN + 0.006);    // luz diurna
  quadDir(D, [-wN * 0.46, ybN + 0.07, zN], [wN * 0.46, ybN + 0.07, zN], [wN * 0.4, ysN - 0.1, zN], [-wN * 0.4, ysN - 0.1, zN], TRIM, 0, 0, 1); // grade
  fq(wN * 0.56, ybN + 0.06, wN * 0.92, ybN + 0.17, TRIM, zN);            // entradas de ar
  if (m.splitter) D.box(-wN * 1.0, ybN - 0.03, zf - 0.22, wN * 1.0, ybN + 0.025, zf + 0.07, TRIM, { bottom: true });
  // ---------- traseira ----------
  const wT = halfW(zr), ybT = botY(zr), ysT = beltY(zr), zT = zr - 0.012;
  const rq = (x0, y0, x1, y1, col, zz) => { for (const sx of [1, -1]) quadDir(D, [x0 * sx, y0, zz], [x1 * sx, y0, zz], [x1 * sx, y1, zz], [x0 * sx, y1, zz], col, 0, 0, -1); };
  rq(wT * 0.5, ysT - 0.16, wT * 0.985, ysT - 0.05, TAIL, zT);
  if (m.bar) quadDir(D, [-wT * 0.5, ysT - 0.125, zT], [wT * 0.5, ysT - 0.125, zT], [wT * 0.5, ysT - 0.085, zT], [-wT * 0.5, ysT - 0.085, zT], TAIL, 0, 0, -1);
  quadDir(D, [-0.26, ybT + 0.2, zT], [0.26, ybT + 0.2, zT], [0.26, ybT + 0.33, zT], [-0.26, ybT + 0.33, zT], PLATE, 0, 0, -1);
  quadDir(D, [-wT * 0.8, ybT + 0.0, zT], [wT * 0.8, ybT + 0.0, zT], [wT * 0.74, ybT + 0.15, zT], [-wT * 0.74, ybT + 0.15, zT], TRIM, 0, 0, -1); // difusor
  for (const sx of [1, -1]) D.box(sx * wT * 0.5 - 0.07, ybT + 0.03, zr - 0.06, sx * wT * 0.5 + 0.07, ybT + 0.11, zr + 0.05, C(0x6b7078));

  // ---------- faixas, retrovisores, aerofólio ----------
  if (m.stripes != null) {
    const sc = C(m.stripes);
    for (let i = 0; i < ring.length - 1; i++) {
      const zm = (st[i] + st[i + 1]) / 2;
      if ((zm > cA && zm < cB) || (zm > cC && zm < cD)) continue;
      const y0 = topY(st[i]) + 0.004, y1 = topY(st[i + 1]) + 0.004;
      for (const [xa, xb] of [[0.09, 0.3], [-0.3, -0.09]]) D.up([xa, y0, st[i]], [xb, y0, st[i]], [xb, y1, st[i + 1]], [xa, y1, st[i + 1]], sc);
    }
  }
  {
    const mz = cD - 0.12, my = beltY(mz) + 0.07, mw = halfW(mz);
    for (const sx of [1, -1]) {
      const x0 = sx * (mw - 0.04), x1 = sx * (mw + 0.15);
      P.box(Math.min(x0, x1), my - 0.03, mz - 0.045, Math.max(x0, x1), my + 0.055, mz + 0.045, WHITE, { bottom: true });
      quadDir(D, [sx * (mw + 0.02), my - 0.02, mz - 0.047], [sx * (mw + 0.14), my - 0.02, mz - 0.047], [sx * (mw + 0.14), my + 0.045, mz - 0.047], [sx * (mw + 0.02), my + 0.045, mz - 0.047], GLASS, 0, 0, -1);
    }
  }
  if (m.lip) {
    const sy = topY(zr + 0.2);
    P.box(-wT * 0.84, sy - 0.03, zr + 0.05, wT * 0.84, sy + m.lip * 0.7, zr + 0.2, WHITE);
  }
  if (m.wing) {
    const sy = m.deckH + m.wing;
    for (const sx of [1, -1]) D.box(sx * W * 0.62 - 0.035, m.deckH - 0.06, zr + 0.2, sx * W * 0.62 + 0.035, sy, zr + 0.36, TRIM);
    P.box(-W * 0.98, sy, zr + 0.06, W * 0.98, sy + 0.045, zr + 0.46, WHITE, { bottom: true });
    for (const sx of [1, -1]) P.box(Math.min(sx * W * 0.98, sx * W), sy - 0.1, zr + 0.06, Math.max(sx * W * 0.98, sx * W), sy + 0.1, zr + 0.46, WHITE, { bottom: true });
  }
  if (m.intakes) {
    const iz = cA - 0.25;
    for (const sx of [1, -1]) quadDir(D, [sx * (halfW(iz) + 0.012), botY(iz) + 0.22, iz - 0.3], [sx * (halfW(iz) + 0.012), botY(iz) + 0.22, iz + 0.25], [sx * (halfW(iz) + 0.012), beltY(iz) - 0.12, iz + 0.12], [sx * (halfW(iz) + 0.012), beltY(iz) - 0.12, iz - 0.3], TRIM, sx, 0, 0);
  }
  if (m.rails) {
    const rw = W * m.roofK;
    for (const sx of [1, -1]) D.box(sx * rw * 0.9 - 0.03, m.roofH - 0.01, cB + 0.1, sx * rw * 0.9 + 0.03, m.roofH + 0.06, cC - 0.1, TRIM);
  }
  if (opts.police) {
    const pz = (cB + cC) / 2, py = m.roofH + 0.01;
    D.box(-0.52, py, pz - 0.15, -0.04, py + 0.13, pz + 0.15, C(0xd61f1f));
    D.box(0.04, py, pz - 0.15, 0.52, py + 0.13, pz + 0.15, C(0x1f4fd6));
    D.box(-0.04, py, pz - 0.11, 0.04, py + 0.1, pz + 0.11, C(0xaab2ba));
    D.box(-wN * 0.72, ybN + 0.05, zf + 0.02, wN * 0.72, ybN + 0.34, zf + 0.1, TRIM); // quebra-mato
  }

  // ---------- caixas de roda e rodas ----------
  const WW = m.wide ? 0.31 : 0.26;
  const wheelPos = [];
  for (const wz of [m.wb / 2, -m.wb / 2]) for (const sx of [1, -1]) {
    const bw = halfW(wz), ax = sx * (bw + 0.014), ra = m.wr + 0.055, yb = botY(wz) + 0.01;
    const arch = C(0x08090a);
    for (let k = 0; k < 12; k++) {
      const a0 = -0.5 + (k / 12) * (Math.PI + 1.0), a1 = -0.5 + ((k + 1) / 12) * (Math.PI + 1.0);
      triDir(D, [ax, Math.max(yb, m.wr), wz], [ax, Math.max(yb, m.wr + Math.sin(a0) * ra), wz + Math.cos(a0) * ra], [ax, Math.max(yb, m.wr + Math.sin(a1) * ra), wz + Math.cos(a1) * ra], arch, sx, 0, 0);
      if (m.clad) quadDir(D, [ax + sx * 0.006, Math.max(yb, m.wr + Math.sin(a0) * ra), wz + Math.cos(a0) * ra], [ax + sx * 0.006, Math.max(yb, m.wr + Math.sin(a0) * (ra + 0.07)), wz + Math.cos(a0) * (ra + 0.07)],
        [ax + sx * 0.006, Math.max(yb, m.wr + Math.sin(a1) * (ra + 0.07)), wz + Math.cos(a1) * (ra + 0.07)], [ax + sx * 0.006, Math.max(yb, m.wr + Math.sin(a1) * ra), wz + Math.cos(a1) * ra], TRIM, sx, 0, 0);
    }
    wheelPos.push([sx * (bw + 0.05 - WW / 2), m.wr, wz]);
  }
  if (opts.withWheels) for (const [x, y, z] of wheelPos) wheelGeo(D, x, y, z, m.wr, WW, Math.sign(x), m, 12);
  const wg = new Geo();
  wheelGeo(wg, 0, 0, 0, m.wr, WW, 1, m, 16);
  const out = { paint: P.build(), detail: D.build(), wheel: wg.build(), wheelPos, dims: m, model };
  _cache.set(key, out);
  return out;
}

// material compartilhado para detalhes (vidros refletem o céu)
export const detailMat = glossy(new THREE.MeshLambertMaterial({ vertexColors: true }), 'detail');
