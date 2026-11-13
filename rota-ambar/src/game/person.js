// Pessoas 3D articuladas e armas modeladas, tudo gerado por código e desenhado com instancing.
// Corpo: quadril, tronco com ombros e pescoço, cabeça com rosto, braços (ombro, cotovelo, mão) e pernas.
// Os braços usam cinemática inversa: as mãos realmente seguram a arma (empunhadura e apoio).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const CAP = 26;
const HIP = 0.95, THIGH = 0.45, SHIN = 0.44, TORSO = 0.5, UARM = 0.29, FARM = 0.265, SHW = 0.205, HPW = 0.095;
export const PERSON_H = 1.78;

const SKIN = [0xe8b792, 0xc98f62, 0x8d5a3a, 0xf2cba8, 0x6b4428];
const SHIRT = [0xd9412b, 0x2f6f9f, 0xf2f2ee, 0x2e6b4f, 0xf2b632, 0x7a2fb8, 0x30343a, 0xe84f9a, 0x18b0c9];
const PANTS = [0x2a3140, 0x4a4f58, 0x6b5a45, 0x1c1e22, 0x3b4a6b, 0x7a6a50];
const HAIR = [0x1a1410, 0x3a2a1a, 0x6b4a2a, 0xb08a4a, 0x0e0e10, 0x8a8a8a];

export function makeLook(rng, kind) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  if (kind === 'cop') return { skin: pick(SKIN), shirt: 0x24365c, sleeve: 0x24365c, pants: 0x161c2a, hair: 0x10141e, shoe: 0x0c0c0e, cap: true };
  if (kind === 'player') return { skin: 0xd9a47c, shirt: 0x5b6878, sleeve: 0x5b6878, pants: 0x2b3550, hair: 0x1a1410, shoe: 0xe4e2da };
  const shirt = pick(SHIRT), skin = pick(SKIN);
  return { skin, shirt, sleeve: rng() < 0.6 ? skin : shirt, pants: pick(PANTS), hair: pick(HAIR), shoe: rng() < 0.5 ? 0x15171a : 0xe0ddd4 };
}

export function newPerson(kind, look) {
  return {
    kind, look, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, phase: 0,
    aim: 0, aimPitch: 0, recoil: 0, reload: 0, weapon: 0, hp: 100, down: 0, downT: 0, armed: kind !== 'civ', active: true,
    flee: 0, dir: 1, fireT: 0, r: 0.34, mx: 0, my: 0, mz: 0,
  };
}

// ---------- geometria ----------
// superfície de revolução elíptica: anéis {y, rx, rz, x, z, c} em ordem crescente de y
function loft(rings, seg = 10, capBot = true, capTop = true) {
  const pos = [], col = [], idx = [];
  for (const r of rings) for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, c = r.c == null ? 1 : r.c;
    pos.push((r.x || 0) + Math.sin(a) * r.rx, r.y, (r.z || 0) + Math.cos(a) * r.rz);
    col.push(c, c, c);
  }
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < seg; i++) {
    const a = k * seg + i, b = k * seg + ((i + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, b, d, a, d, c);
  }
  const cap = (k, up) => {
    const r = rings[k], ci = pos.length / 3, c = r.c == null ? 1 : r.c;
    pos.push(r.x || 0, r.y, r.z || 0); col.push(c, c, c);
    for (let i = 0; i < seg; i++) { const a = k * seg + i, b = k * seg + ((i + 1) % seg); if (up) idx.push(ci, a, b); else idx.push(ci, b, a); }
  };
  if (capBot) cap(0, false);
  if (capTop) cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}
function tint(g, hexOrMul) {
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  let r, gg, b;
  if (hexOrMul < 16) r = gg = b = hexOrMul; // multiplicador da cor da instância (pele, roupa)
  else { const c = new THREE.Color(hexOrMul); r = c.r; gg = c.g; b = c.b; }
  for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}
function box(w, h, d, x, y, z, c, rx = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return tint(g, c);
}
// cilindro ao longo de z (cano)
function tube(r, len, x, y, z, c, seg = 8) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2); g.translate(x, y, z + len / 2);
  return tint(g, c);
}
const merge = (list) => mergeGeometries(list, false);

function buildBody() {
  const torso = loft([
    { y: 0.0, rx: 0.15, rz: 0.1 }, { y: 0.1, rx: 0.152, rz: 0.104 }, { y: 0.24, rx: 0.172, rz: 0.118, z: 0.006 },
    { y: 0.36, rx: 0.198, rz: 0.126, z: 0.012 }, { y: 0.44, rx: 0.205, rz: 0.112, z: 0.004 }, { y: 0.485, rx: 0.15, rz: 0.09 },
    { y: 0.51, rx: 0.066, rz: 0.066, c: 1 },
  ], 12);
  // pescoço na cor da pele é parte da cabeça
  const head = merge([
    loft([{ y: -0.02, rx: 0.052, rz: 0.055 }, { y: 0.05, rx: 0.05, rz: 0.054 }, { y: 0.075, rx: 0.062, rz: 0.07, z: 0.012 }, { y: 0.11, rx: 0.082, rz: 0.094, z: 0.008 },
      { y: 0.165, rx: 0.092, rz: 0.104 }, { y: 0.22, rx: 0.093, rz: 0.106 }, { y: 0.262, rx: 0.08, rz: 0.094 }, { y: 0.288, rx: 0.045, rz: 0.055 }], 10),
    box(0.024, 0.04, 0.03, 0, 0.158, 0.108, 0.92, -0.25),                       // nariz
    box(0.026, 0.01, 0.01, 0.034, 0.188, 0.1, 0.07), box(0.026, 0.01, 0.01, -0.034, 0.188, 0.1, 0.07), // olhos
    box(0.034, 0.008, 0.012, 0.034, 0.204, 0.1, 0.35), box(0.034, 0.008, 0.012, -0.034, 0.204, 0.1, 0.35), // sobrancelhas
    box(0.04, 0.007, 0.01, 0, 0.118, 0.098, 0.45),                              // boca
    box(0.016, 0.045, 0.03, 0.094, 0.172, 0.0, 0.9), box(0.016, 0.045, 0.03, -0.094, 0.172, 0.0, 0.9), // orelhas
  ]);
  const hair = merge([
    loft([{ y: 0.115, rx: 0.086, rz: 0.07, z: -0.04 }, { y: 0.16, rx: 0.097, rz: 0.088, z: -0.03 }, { y: 0.205, rx: 0.099, rz: 0.108, z: -0.014 }, { y: 0.25, rx: 0.097, rz: 0.109, z: -0.008 }, { y: 0.285, rx: 0.076, rz: 0.091, z: -0.004 }, { y: 0.306, rx: 0.03, rz: 0.04 }], 10, true, true),
  ]);
  const hat = merge([ // quepe policial
    loft([{ y: 0.225, rx: 0.102, rz: 0.114, c: 0.25 }, { y: 0.25, rx: 0.104, rz: 0.116, c: 0.25 }, { y: 0.252, rx: 0.104, rz: 0.116 }, { y: 0.3, rx: 0.118, rz: 0.128 }, { y: 0.312, rx: 0.1, rz: 0.11 }], 12, false, true),
    box(0.15, 0.012, 0.075, 0, 0.228, 0.135, 0.12, 0.12),  // aba
    box(0.032, 0.03, 0.006, 0, 0.275, 0.127, 4.5),          // distintivo
  ]);
  const hips = merge([
    loft([{ y: -0.2, rx: 0.14, rz: 0.1 }, { y: -0.08, rx: 0.166, rz: 0.116 }, { y: -0.01, rx: 0.156, rz: 0.106 }, { y: 0.0, rx: 0.158, rz: 0.108, c: 0.22 }, { y: 0.035, rx: 0.158, rz: 0.108, c: 0.22 }], 12),
    box(0.04, 0.036, 0.012, 0, 0.018, 0.108, 3.2), // fivela
  ]);
  const uarm = merge([
    loft([{ y: -UARM, rx: 0.046, rz: 0.049 }, { y: -UARM * 0.55, rx: 0.057, rz: 0.061 }, { y: -0.04, rx: 0.066, rz: 0.068 }, { y: 0.015, rx: 0.058, rz: 0.06 }], 8),
  ]);
  const farm = loft([{ y: -FARM, rx: 0.033, rz: 0.036 }, { y: -FARM * 0.5, rx: 0.044, rz: 0.047 }, { y: -0.03, rx: 0.049, rz: 0.051 }, { y: 0.012, rx: 0.046, rz: 0.048 }], 8);
  const hand = merge([
    box(0.036, 0.09, 0.075, 0, -0.045, 0.008, 1),            // palma
    box(0.034, 0.045, 0.07, 0, -0.105, 0.016, 0.94, 0.35),   // dedos dobrados
    box(0.03, 0.05, 0.026, 0.006, -0.05, 0.05, 0.96, -0.4),  // polegar
  ]);
  const thigh = loft([{ y: -THIGH, rx: 0.058, rz: 0.062 }, { y: -THIGH * 0.5, rx: 0.074, rz: 0.08 }, { y: -0.05, rx: 0.086, rz: 0.09 }, { y: 0.02, rx: 0.08, rz: 0.084 }], 9);
  const shin = loft([{ y: -SHIN, rx: 0.042, rz: 0.046 }, { y: -SHIN * 0.62, rx: 0.058, rz: 0.066, z: -0.008 }, { y: -0.04, rx: 0.058, rz: 0.062 }, { y: 0.015, rx: 0.056, rz: 0.06 }], 8);
  const foot = merge([
    box(0.092, 0.05, 0.27, 0, -0.045, 0.07, 1),              // cabedal
    box(0.088, 0.045, 0.1, 0, -0.012, -0.015, 1),            // tornozelo
    box(0.085, 0.03, 0.09, 0, -0.03, 0.17, 0.9, 0.3),        // bico
    box(0.098, 0.022, 0.285, 0, -0.078, 0.07, 0.3),          // sola
  ]);
  return { torso, head, hair, hat, hips, uarm, farm, hand, thigh, shin, foot };
}

// armas: cano em +z, empunhadura na origem. grip = ponto da mão direita, fore = apoio da esquerda
const STEEL = 0x2b2e33, BLACK = 0x121315, POLY = 0x1c1e22, WOOD = 0x6a4326, BRASS = 0xb08a3a;
export const GUNS = [
  { // pistola
    len: 0.2, fore: 0.035, foreY: -0.045, two: false,
    geo: () => merge([
      box(0.028, 0.036, 0.19, 0, 0.052, 0.07, STEEL), box(0.024, 0.024, 0.16, 0, 0.026, 0.065, POLY),
      tube(0.008, 0.02, 0, 0.05, 0.16, BLACK), box(0.027, 0.105, 0.046, 0, -0.03, -0.012, POLY, 0.22),
      box(0.006, 0.01, 0.006, 0, 0.074, 0.155, BLACK), box(0.014, 0.01, 0.008, 0, 0.074, -0.018, BLACK),
      box(0.008, 0.006, 0.05, 0, -0.004, 0.045, BLACK), box(0.008, 0.03, 0.006, 0, 0.008, 0.07, BLACK),
      box(0.02, 0.012, 0.03, 0, 0.052, 0.035, 0x3a3e44),
    ]),
  },
  { // submetralhadora
    len: 0.36, fore: 0.2, foreY: -0.01, two: true,
    geo: () => merge([
      box(0.042, 0.062, 0.3, 0, 0.05, 0.1, STEEL), box(0.036, 0.04, 0.12, 0, 0.045, 0.3, POLY),
      tube(0.011, 0.07, 0, 0.05, 0.34, BLACK), box(0.03, 0.1, 0.042, 0, -0.03, -0.01, POLY, 0.25),
      box(0.026, 0.19, 0.036, 0, -0.085, 0.13, BLACK, -0.1), box(0.03, 0.05, 0.05, 0, -0.01, 0.24, POLY),
      box(0.012, 0.012, 0.22, 0.018, 0.06, -0.15, BLACK), box(0.012, 0.012, 0.22, -0.018, 0.06, -0.15, BLACK), box(0.05, 0.085, 0.016, 0, 0.045, -0.265, POLY),
      box(0.02, 0.014, 0.16, 0, 0.088, 0.09, BLACK), box(0.008, 0.022, 0.008, 0, 0.102, 0.2, BLACK), box(0.014, 0.022, 0.008, 0, 0.102, 0.0, BLACK),
      box(0.008, 0.006, 0.05, 0, 0.004, 0.045, BLACK),
    ]),
  },
  { // escopeta
    len: 0.78, fore: 0.36, foreY: 0.0, two: true,
    geo: () => merge([
      box(0.044, 0.066, 0.24, 0, 0.045, 0.06, STEEL), tube(0.014, 0.62, 0, 0.058, 0.16, STEEL), tube(0.013, 0.46, 0, 0.026, 0.17, BLACK),
      box(0.05, 0.05, 0.2, 0, 0.03, 0.34, WOOD), box(0.03, 0.09, 0.04, 0, -0.03, -0.02, WOOD, 0.4),
      box(0.04, 0.085, 0.3, 0, 0.012, -0.21, WOOD, -0.09), box(0.044, 0.1, 0.02, 0, 0.0, -0.36, BLACK),
      box(0.006, 0.012, 0.006, 0, 0.076, 0.76, BRASS), box(0.008, 0.006, 0.055, 0, -0.002, 0.05, BLACK),
    ]),
  },
];

// ---------- pose ----------
const _m = [], _c = new THREE.Color();
for (let i = 0; i < 16; i++) _m.push(new THREE.Matrix4());
const _t = new THREE.Matrix4(), _r = new THREE.Matrix4();
const _vx = new THREE.Vector3(), _vy = new THREE.Vector3(), _vz = new THREE.Vector3(), _p = new THREE.Vector3();
// out = a * T(x,y,z) * Rx(rx) * Rz(rz)
function joint(out, a, x, y, z, rx, rz) {
  _t.makeTranslation(x, y, z);
  out.multiplyMatrices(a, _t);
  if (rx) out.multiply(_r.makeRotationX(rx));
  if (rz) out.multiply(_r.makeRotationZ(rz));
  return out;
}
// matriz (no espaço do pai) de um membro que nasce em o e aponta para dir (o membro cresce em -y local)
function limbTo(out, parent, ox, oy, oz, dx, dy, dz, fx, fy, fz) {
  const l = Math.hypot(dx, dy, dz) || 1;
  _vy.set(-dx / l, -dy / l, -dz / l);
  _vz.set(fx, fy, fz); // "frente" desejada para as costas da mão
  _vx.crossVectors(_vy, _vz);
  if (_vx.lengthSq() < 1e-6) _vx.set(1, 0, 0);
  _vx.normalize();
  _vz.crossVectors(_vx, _vy);
  _t.makeBasis(_vx, _vy, _vz).setPosition(ox, oy, oz);
  return out.multiplyMatrices(parent, _t);
}
// arma: origem em p, cano na direção f
function gunBasis(out, parent, px, py, pz, fx, fy, fz, roll) {
  _vz.set(fx, fy, fz).normalize();
  _vx.set(0, 1, 0).cross(_vz);
  if (_vx.lengthSq() < 1e-6) _vx.set(1, 0, 0);
  _vx.normalize();
  _vy.crossVectors(_vz, _vx);
  _t.makeBasis(_vx, _vy, _vz).setPosition(px, py, pz);
  out.multiplyMatrices(parent, _t);
  if (roll) out.multiply(_r.makeRotationZ(roll));
  return out;
}
const lerp = (a, b, t) => a + (b - a) * t;

export class People {
  constructor(scene) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    const geos = buildBody();
    GUNS.forEach((g, i) => { geos['gun' + i] = g.geo(); });
    this.parts = {};
    for (const k in geos) {
      const n = ['uarm', 'farm', 'hand', 'thigh', 'shin', 'foot'].includes(k) ? CAP * 2 : CAP;
      const im = new THREE.InstancedMesh(geos[k], mat, n);
      im.setColorAt(0, _c.set(0xffffff));
      im.count = 0; im.frustumCulled = false; im.castShadow = true;
      scene.add(im);
      this.parts[k] = { im, n: 0 };
    }
  }
  begin() { for (const k in this.parts) this.parts[k].n = 0; }
  put(k, m, color) {
    const p = this.parts[k];
    if (p.n >= p.im.instanceMatrix.count) return;
    p.im.setMatrixAt(p.n, m);
    p.im.setColorAt(p.n, _c.set(color));
    p.n++;
  }
  end() {
    for (const k in this.parts) {
      const p = this.parts[k];
      p.im.count = p.n;
      if (p.n) { p.im.instanceMatrix.needsUpdate = true; p.im.instanceColor.needsUpdate = true; }
    }
  }

  // braço com cinemática inversa: do ombro S até a mão em T (espaço do tronco)
  arm(torso, sd, tx, ty, tz, L) {
    const sx = -SHW * sd, sy = TORSO - 0.065, sz = 0;
    let dx = tx - sx, dy = ty - sy, dz = tz - sz;
    const dl = Math.hypot(dx, dy, dz) || 1e-3;
    const D = Math.min(Math.max(dl, 0.08), UARM + FARM - 0.004);
    dx /= dl; dy /= dl; dz /= dl;
    const a = (UARM * UARM - FARM * FARM + D * D) / (2 * D), h = Math.sqrt(Math.max(0, UARM * UARM - a * a));
    // cotovelo abre para fora e para baixo/trás
    let px = -sd * 0.55, py = -0.75, pz = -0.35;
    const dot = px * dx + py * dy + pz * dz;
    px -= dx * dot; py -= dy * dot; pz -= dz * dot;
    const pl = Math.hypot(px, py, pz) || 1;
    const ex = sx + dx * a + (px / pl) * h, ey = sy + dy * a + (py / pl) * h, ez = sz + dz * a + (pz / pl) * h;
    const u = _m[8], f = _m[9];
    limbTo(u, torso, sx, sy, sz, ex - sx, ey - sy, ez - sz, 0, 0, 1);
    this.put('uarm', u, L.sleeve === L.skin ? L.shirt : L.sleeve);
    const hx = sx + dx * D, hy = sy + dy * D, hz = sz + dz * D;
    limbTo(f, torso, ex, ey, ez, hx - ex, hy - ey, hz - ez, 0, 0.3, 1);
    this.put('farm', f, L.sleeve);
    joint(u, f, 0, -FARM, 0, 0, 0);
    this.put('hand', u, L.skin);
  }

  // calcula a pose a partir do estado (andar, correr, mirar, recarregar, caído) e envia as partes
  draw(p) {
    const L = p.look, root = _m[0], hips = _m[1], torso = _m[2], t = _m[3], u = _m[4], gm = _m[5];
    const run = Math.min(1, p.speed / 5.5), walk = Math.min(1, p.speed / 1.4);
    const ph = p.phase, s = Math.sin(ph), c = Math.cos(ph);
    const amp = walk * (0.42 + run * 0.3);
    const bob = Math.abs(s) * 0.035 * walk * (1 + run);
    const alive = p.down <= 0;
    root.makeRotationY(p.yaw).setPosition(p.x, p.y, p.z);
    if (!alive) { const k = Math.min(1, p.down); joint(root, root, 0, 0.13 * k, 0, -k * 1.5, 0); } // cai para trás
    joint(hips, root, 0, HIP + bob - p.aim * 0.03, 0, 0, 0);
    this.put('hips', hips, L.pants);
    const lean = run * 0.2 * (1 - p.aim * 0.6) + p.aim * 0.07;
    joint(torso, hips, 0, 0.02, 0, lean, s * 0.045 * walk);
    this.put('torso', torso, L.shirt);
    joint(t, torso, 0, TORSO, 0, -lean * 0.6 - p.aimPitch * 0.55 * p.aim, 0);
    this.put('head', t, L.skin);
    if (L.cap) this.put('hat', t, 0x1a2540); else this.put('hair', t, L.hair);

    // ---------- arma e braços ----------
    const armed = p.armed && alive, G = GUNS[p.weapon] || GUNS[0];
    const sw = s * amp;
    // mãos relaxadas (balanço oposto às pernas)
    const relY = TORSO - 0.065 - (UARM + FARM) * (0.985 - run * 0.16), relZ = (k) => k * sw * 0.34 + run * 0.1;
    let rx = -SHW - 0.045, ry = relY, rz = relZ(-1), lx = SHW + 0.045, ly = relY, lz = relZ(1);
    if (armed) {
      const a = p.aim, rl = Math.sin(Math.min(1, p.reload) * Math.PI), kick = p.recoil;
      // pose de espera (arma baixa) e pose de mira (arma à altura do ombro), misturadas por a
      let gx, gy, gz, fx, fy, fz;
      const pc = Math.cos(p.aimPitch), ps = Math.sin(p.aimPitch);
      if (G.two) {
        gx = lerp(-0.1, -0.135, a); gy = lerp(0.16, TORSO - 0.135, a); gz = lerp(0.2, 0.2, a);
        fx = lerp(0.5, 0, a); fy = lerp(-0.45, ps, a); fz = lerp(0.74, pc, a);
      } else {
        gx = lerp(-SHW - 0.05, -0.03, a); gy = lerp(relY + 0.03, TORSO - 0.1, a); gz = lerp(0.06 + rz * 0.5, 0.5, a);
        fx = 0; fy = lerp(-0.92, ps, a); fz = lerp(0.38, pc, a);
      }
      // mira: sobe/desce em torno do ombro
      gy += ps * 0.3 * a; gz -= (1 - pc) * 0.2 * a;
      // recuo e recarga
      const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      gx -= fx * kick * 0.045; gy -= fy * kick * 0.045 - kick * 0.012; gz -= fz * kick * 0.045;
      fy += kick * 0.07 + rl * 0.45; gy -= rl * 0.05;
      gunBasis(gm, torso, gx, gy, gz, fx, fy, fz, rl * 0.5);
      this.put('gun' + (p.weapon || 0), gm, 0xffffff);
      // boca do cano em coordenadas do mundo (clarão e rastro)
      _p.set(0, 0.05, G.len).applyMatrix4(gm);
      p.mx = _p.x; p.my = _p.y; p.mz = _p.z;
      rx = gx; ry = gy - 0.02; rz = gz - 0.005;
      const w = G.two ? 1 : a;
      const f2 = Math.hypot(fx, fy, fz) || 1;
      const tx = gx + (fx / f2) * G.fore, ty = gy + (fy / f2) * G.fore + G.foreY - rl * 0.16, tz = gz + (fz / f2) * G.fore - rl * 0.05;
      lx = lerp(lx, tx + (G.two ? 0.01 : 0.03), w); ly = lerp(ly, ty, w); lz = lerp(lz, tz, w);
    }
    this.arm(torso, 1, rx, ry, rz, L);
    this.arm(torso, -1, lx, ly, lz, L);

    // ---------- pernas ----------
    for (const sd of [1, -1]) {
      const lsw = s * sd * amp;
      joint(u, hips, -HPW * sd, -0.06, 0, -lsw, sd * -0.03);
      this.put('thigh', u, L.pants);
      const knee = walk * (0.15 + Math.max(0, -c * sd) * (0.7 + run * 0.9)) + p.aim * 0.1 * (1 - walk);
      joint(t, u, 0, -THIGH, 0, knee, 0);
      this.put('shin', t, L.pants);
      joint(u, t, 0, -SHIN, 0, -knee * 0.35 + Math.max(0, lsw) * 0.3, 0);
      this.put('foot', u, L.shoe);
    }
  }
}
