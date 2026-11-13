// Catálogo de carros (todos originais) e geometria procedural low-poly.
import * as THREE from 'three';
import { Geo, C } from '../world/geo.js';

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

// dimensões e perfil de cada carroceria
const M = {
  compact: { len: 3.85, wid: 1.72, ride: 0.2, wr: 0.31, wb: 2.45, belt: 0.88, roof: 1.44, hoodF: 0.72, deck: 0.9, hood: 0.95, deckLen: 0.12, wsRake: 0.55, rearRake: 0.38 },
  sedan: { len: 4.5, wid: 1.8, ride: 0.2, wr: 0.33, wb: 2.7, belt: 0.88, roof: 1.4, hoodF: 0.72, deck: 0.86, hood: 1.25, deckLen: 0.85, wsRake: 0.6, rearRake: 0.55 },
  muscle: { len: 4.8, wid: 1.92, ride: 0.19, wr: 0.36, wb: 2.85, belt: 0.86, roof: 1.3, hoodF: 0.76, deck: 0.84, hood: 1.75, deckLen: 0.8, wsRake: 0.55, rearRake: 0.75, scoop: 1, spoiler: 0.12, stripes: 1 },
  sport: { len: 4.4, wid: 1.9, ride: 0.15, wr: 0.34, wb: 2.6, belt: 0.78, roof: 1.2, hoodF: 0.56, deck: 0.78, hood: 1.4, deckLen: 0.45, wsRake: 0.75, rearRake: 0.95, spoiler: 0.2 },
  super: { len: 4.55, wid: 2.0, ride: 0.12, wr: 0.35, wb: 2.7, belt: 0.7, roof: 1.08, hoodF: 0.42, deck: 0.78, hood: 1.15, deckLen: 0.75, wsRake: 0.95, rearRake: 0.9, spoiler: 0.34, wing: 1, intakes: 1 },
  suv: { len: 4.7, wid: 1.95, ride: 0.3, wr: 0.39, wb: 2.8, belt: 1.08, roof: 1.78, hoodF: 0.98, deck: 1.1, hood: 1.2, deckLen: 0.1, wsRake: 0.45, rearRake: 0.25, rails: 1 },
  pickup: { len: 5.2, wid: 1.95, ride: 0.32, wr: 0.4, wb: 3.2, belt: 1.1, roof: 1.78, hoodF: 1.0, deck: 1.1, hood: 1.3, deckLen: 1.95, wsRake: 0.4, rearRake: 0.12, bed: 1 },
};
export const MODEL_DIMS = M;

const GLASS = C(0x18222e), TIRE = C(0x121416), HUB = C(0x9aa3ad), TRIM = C(0x1e2226), HEAD = C(0xfff4cc), TAIL = C(0xc8261b), WHITE = [1, 1, 1], CHROME = C(0xaab2ba);

function wheelGeo(g, x, y, z, R, W, side) {
  const seg = 10;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const y0 = y + Math.cos(a0) * R, z0 = z + Math.sin(a0) * R, y1 = y + Math.cos(a1) * R, z1 = z + Math.sin(a1) * R;
    const xi = x - W / 2, xo = x + W / 2;
    // banda de rodagem (normal para fora independe da ordem; usamos dupla verificação via side)
    g.quad([xo, y0, z0], [xi, y0, z0], [xi, y1, z1], [xo, y1, z1], TIRE);
    const xs = side > 0 ? xo : xi;
    const hy0 = y + Math.cos(a0) * R * 0.58, hz0 = z + Math.sin(a0) * R * 0.58, hy1 = y + Math.cos(a1) * R * 0.58, hz1 = z + Math.sin(a1) * R * 0.58;
    if (side < 0) {
      g.quad([xs, y0, z0], [xs, hy0, hz0], [xs, hy1, hz1], [xs, y1, z1], TIRE);
      g.tri([xs - 0.02, y, z], [xs, hy1, hz1], [xs, hy0, hz0], HUB);
    } else {
      g.quad([xs, y1, z1], [xs, hy1, hz1], [xs, hy0, hz0], [xs, y0, z0], TIRE);
      g.tri([xs + 0.02, y, z], [xs, hy0, hz0], [xs, hy1, hz1], HUB);
    }
  }
}

const _cache = new Map();

// Retorna { paint, detail, wheel, wheelPos, dims } — geometrias compartilhadas (não modificar; clone para deformar)
export function carGeometry(model, opts = {}) {
  const key = model + (opts.police ? '_p' : '') + (opts.withWheels ? '_w' : '');
  if (_cache.has(key)) return _cache.get(key);
  const m = M[model];
  const P = new Geo(), D = new Geo();
  const w = m.wid / 2, zf = m.len / 2, zr = -m.len / 2;
  const y0 = m.ride;
  const cf0 = zf - m.hood, cf1 = cf0 - m.wsRake, cr0 = zr + m.deckLen, cr1 = cr0 + m.rearRake;
  // perfil lateral do casco (z,y), de trás-baixo até frente-baixo
  const prof = [
    [zr + 0.06, y0], [zr, y0 + 0.3], [zr + 0.04, m.deck], [cr0, m.belt], [cf0, m.belt],
    [zf - 0.18, m.hoodF], [zf, m.hoodF - 0.2], [zf - 0.03, y0 + 0.02],
  ];
  const wb = w * 0.93; // largura na base
  const widthAt = (y) => (y <= y0 + 0.05 ? wb : w);
  // tampos e faces frente/trás
  for (let i = 0; i < prof.length - 1; i++) {
    const [za, ya] = prof[i], [zb, yb] = prof[i + 1];
    const wa = widthAt(ya), wb2 = widthAt(yb);
    P.quad([wa, ya, za], [-wa, ya, za], [-wb2, yb, zb], [wb2, yb, zb], WHITE);
  }
  // laterais (leque a partir do centro)
  const cy = (y0 + m.belt) / 2;
  for (let i = 0; i < prof.length; i++) {
    const [za, ya] = prof[i], [zb, yb] = prof[(i + 1) % prof.length];
    const wa = widthAt(ya), wb2 = widthAt(yb);
    P.tri([w, cy, 0], [wa, ya, za], [wb2, yb, zb], WHITE);
    P.tri([-w, cy, 0], [-wb2, yb, zb], [-wa, ya, za], WHITE);
  }
  // fundo
  D.quad([-wb, y0, zr + 0.06], [wb, y0, zr + 0.06], [wb, y0 + 0.02, zf - 0.03], [-wb, y0 + 0.02, zf - 0.03], TRIM);

  // cabine
  const wB = w * 0.93, wT = w * 0.74;
  const A = [wB, m.belt, cr0], B = [wB, m.belt, cf0], Cc = [wT, m.roof, cf1], Dd = [wT, m.roof, cr1];
  const A2 = [-wB, m.belt, cr0], B2 = [-wB, m.belt, cf0], C2 = [-wT, m.roof, cf1], D2 = [-wT, m.roof, cr1];
  D.quad(B2, B, Cc, C2, GLASS); // para-brisa
  D.quad(A, A2, D2, Dd, GLASS); // vidro traseiro
  D.quad(B, A, Dd, Cc, GLASS); // lateral direita (+x)
  D.quad(A2, B2, C2, D2, GLASS);
  P.quad(Dd, D2, C2, Cc, WHITE); // teto
  // colunas pintadas (finas) nas laterais
  const pil = (za, zb, ta, tb) => {
    P.quad([wB + 0.012, m.belt, zb], [wB + 0.012, m.belt, za], [wT + 0.012, m.roof, ta], [wT + 0.012, m.roof, tb], WHITE);
    P.quad([-wB - 0.012, m.belt, za], [-wB - 0.012, m.belt, zb], [-wT - 0.012, m.roof, tb], [-wT - 0.012, m.roof, ta], WHITE);
  };
  const midB = (cr0 + cf0) / 2, midT = (cr1 + cf1) / 2;
  pil(midB - 0.06, midB + 0.06, midT - 0.06, midT + 0.06);
  if (model === 'suv' || model === 'compact') pil(cr0, cr0 + 0.18, cr1, cr1 + 0.14);

  // faróis e lanternas
  const hy = m.hoodF - 0.1;
  D.box(w * 0.5, hy - 0.09, zf - 0.1, w * 0.92, hy + 0.05, zf + 0.012, HEAD);
  D.box(-w * 0.92, hy - 0.09, zf - 0.1, -w * 0.5, hy + 0.05, zf + 0.012, HEAD);
  D.box(-w * 0.42, hy - 0.2, zf - 0.1, w * 0.42, hy - 0.02, zf + 0.008, TRIM); // grade
  const ty = m.deck - 0.14;
  D.box(w * 0.48, ty - 0.08, zr - 0.012, w * 0.94, ty + 0.06, zr + 0.1, TAIL);
  D.box(-w * 0.94, ty - 0.08, zr - 0.012, -w * 0.48, ty + 0.06, zr + 0.1, TAIL);
  // para-choques
  D.box(-w * 0.97, y0, zf - 0.12, w * 0.97, y0 + 0.2, zf + 0.03, TRIM);
  D.box(-w * 0.97, y0, zr - 0.03, w * 0.97, y0 + 0.22, zr + 0.12, TRIM);
  // saias laterais
  D.box(w * 0.94, y0, -m.wb / 2 + m.wr + 0.1, w + 0.01, y0 + 0.16, m.wb / 2 - m.wr - 0.1, TRIM);
  D.box(-w - 0.01, y0, -m.wb / 2 + m.wr + 0.1, -w * 0.94, y0 + 0.16, m.wb / 2 - m.wr - 0.1, TRIM);

  if (m.scoop) P.box(-0.28, m.belt - 0.04, cf0 + 0.35, 0.28, m.belt + 0.09, cf0 + 1.15, WHITE);
  if (m.stripes) {
    for (const sx of [-0.2, 0.2]) {
      D.quad([sx + 0.09, m.belt + 0.095, cf0 + 0.35], [sx - 0.09, m.belt + 0.095, cf0 + 0.35], [sx - 0.09, m.belt + 0.095, cf0 + 1.15], [sx + 0.09, m.belt + 0.095, cf0 + 1.15], C(0xf4f4f0));
      D.quad([sx + 0.09, m.roof + 0.01, cr1], [sx - 0.09, m.roof + 0.01, cr1], [sx - 0.09, m.roof + 0.01, cf1], [sx + 0.09, m.roof + 0.01, cf1], C(0xf4f4f0));
    }
  }
  if (m.spoiler) {
    const sy = m.deck + m.spoiler;
    if (m.wing) {
      D.box(-w * 0.7, m.deck - 0.05, zr + 0.12, -w * 0.62, sy, zr + 0.3, TRIM);
      D.box(w * 0.62, m.deck - 0.05, zr + 0.12, w * 0.7, sy, zr + 0.3, TRIM);
      P.box(-w * 1.0, sy, zr + 0.02, w * 1.0, sy + 0.05, zr + 0.4, WHITE, { bottom: true });
    } else {
      P.box(-w * 0.9, m.deck - 0.02, zr + 0.01, w * 0.9, sy, zr + 0.2, WHITE);
    }
  }
  if (m.intakes) {
    D.box(w - 0.02, y0 + 0.2, cr0 - 0.1, w + 0.015, m.belt - 0.08, cr0 + 0.55, TRIM);
    D.box(-w - 0.015, y0 + 0.2, cr0 - 0.1, -w + 0.02, m.belt - 0.08, cr0 + 0.55, TRIM);
  }
  if (m.rails) {
    D.box(wT - 0.12, m.roof, cr1 + 0.15, wT - 0.05, m.roof + 0.07, cf1 - 0.15, TRIM);
    D.box(-wT + 0.05, m.roof, cr1 + 0.15, -wT + 0.12, m.roof + 0.07, cf1 - 0.15, TRIM);
  }
  if (m.bed) {
    // caçamba: piso escuro rebaixado visualmente
    D.quad([w - 0.12, m.deck + 0.012, zr + 0.14], [-w + 0.12, m.deck + 0.012, zr + 0.14], [-w + 0.12, m.belt + 0.012, cr0 - 0.12], [w - 0.12, m.belt + 0.012, cr0 - 0.12], C(0x0c0d0f));
    P.box(-w * 0.9, m.belt, cr0 - 0.1, w * 0.9, m.belt + 0.3, cr0 + 0.02, WHITE);
  }
  if (opts.police) {
    D.box(-0.5, m.roof, midT - 0.14, -0.04, m.roof + 0.13, midT + 0.14, C(0xd61f1f));
    D.box(0.04, m.roof, midT - 0.14, 0.5, m.roof + 0.13, midT + 0.14, C(0x1f4fd6));
    D.box(-0.04, m.roof, midT - 0.1, 0.04, m.roof + 0.1, midT + 0.1, CHROME);
    // portas brancas e faixa
    D.box(w + 0.006, y0 + 0.2, cr0 + 0.2, w + 0.02, m.belt - 0.03, cf0 - 0.1, C(0xf2f2ee));
    D.box(-w - 0.02, y0 + 0.2, cr0 + 0.2, -w - 0.006, m.belt - 0.03, cf0 - 0.1, C(0xf2f2ee));
    D.box(-w * 0.7, y0 + 0.24, zf + 0.03, w * 0.7, y0 + 0.5, zf + 0.12, TRIM); // quebra-mato
  }

  const wheelPos = [
    [w - 0.13, m.wr, m.wb / 2], [-(w - 0.13), m.wr, m.wb / 2],
    [w - 0.13, m.wr, -m.wb / 2], [-(w - 0.13), m.wr, -m.wb / 2],
  ];
  const WW = model === 'super' || model === 'muscle' ? 0.3 : 0.25;
  if (opts.withWheels) for (const [x, y, z] of wheelPos) wheelGeo(D, x, y, z, m.wr, WW, Math.sign(x));
  const wg = new Geo();
  wheelGeo(wg, 0, 0, 0, m.wr, WW, 1);
  const out = { paint: P.build(), detail: D.build(), wheel: wg.build(), wheelPos, dims: m, model };
  _cache.set(key, out);
  return out;
}

// material compartilhado para detalhes
export const detailMat = new THREE.MeshLambertMaterial({ vertexColors: true });
