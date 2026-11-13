// Pessoas 3D low-poly articuladas (quadril, tronco, cabeça, braços e pernas com cotovelo/joelho),
// animadas por código e desenhadas com instancing: todas as pessoas custam ~10 draw calls.
import * as THREE from 'three';

const CAP = 26;
const HIP = 0.94, THIGH = 0.45, SHIN = 0.43, TORSO = 0.52, UARM = 0.29, FARM = 0.3, SHW = 0.2, HPW = 0.095;
export const PERSON_H = 1.78;

const SKIN = [0xe8b792, 0xc98f62, 0x8d5a3a, 0xf2cba8, 0x6b4428];
const SHIRT = [0xd9412b, 0x2f6f9f, 0xf2f2ee, 0x2e6b4f, 0xf2b632, 0x7a2fb8, 0x30343a, 0xe84f9a, 0x18b0c9];
const PANTS = [0x2a3140, 0x4a4f58, 0x6b5a45, 0x1c1e22, 0x3b4a6b, 0x7a6a50];
const HAIR = [0x1a1410, 0x3a2a1a, 0x6b4a2a, 0xb08a4a, 0x0e0e10, 0x8a8a8a];

export function makeLook(rng, kind) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  if (kind === 'cop') return { skin: pick(SKIN), shirt: 0x1c2a44, pants: 0x161c2a, hair: 0x10141e, shoe: 0x0c0c0e, cap: true };
  if (kind === 'player') return { skin: 0xd9a47c, shirt: 0xf2f2ee, pants: 0x2a3140, hair: 0x1a1410, shoe: 0xe8e8e0, jacket: 0x1c1e22 };
  return { skin: pick(SKIN), shirt: pick(SHIRT), pants: pick(PANTS), hair: pick(HAIR), shoe: rng() < 0.5 ? 0x15171a : 0xe0ddd4 };
}

export function newPerson(kind, look) {
  return {
    kind, look, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, phase: 0,
    aim: 0, aimPitch: 0, recoil: 0, hp: 100, down: 0, downT: 0, armed: kind !== 'civ', active: true,
    flee: 0, dir: 1, fireT: 0, r: 0.34,
  };
}

const _m = [], _c = new THREE.Color();
for (let i = 0; i < 14; i++) _m.push(new THREE.Matrix4());
const _t = new THREE.Matrix4(), _r = new THREE.Matrix4();
// out = a * T(x,y,z) * Rx(rx) * Rz(rz)
function joint(out, a, x, y, z, rx, rz) {
  _t.makeTranslation(x, y, z);
  out.multiplyMatrices(a, _t);
  if (rx) out.multiply(_r.makeRotationX(rx));
  if (rz) out.multiply(_r.makeRotationZ(rz));
  return out;
}

export class People {
  constructor(scene) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const cyl = (rt, rb, len, seg, sx = 1, sz = 1, up = false) => {
      const g = new THREE.CylinderGeometry(rt, rb, len, seg);
      g.scale(sx, 1, sz); g.translate(0, up ? len / 2 : -len / 2, 0);
      return g;
    };
    const head = new THREE.SphereGeometry(0.118, 8, 6); head.scale(0.9, 1.12, 1); head.translate(0, 0.17, 0.01);
    const hair = new THREE.SphereGeometry(0.128, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55); hair.scale(0.92, 1.1, 1.04); hair.translate(0, 0.185, -0.012);
    const foot = new THREE.BoxGeometry(0.095, 0.075, 0.25); foot.translate(0, -0.035, 0.065);
    const gun = new THREE.BoxGeometry(0.045, 0.11, 0.3); gun.translate(0, -0.03, 0.12);
    const geos = {
      torso: cyl(0.215, 0.165, TORSO, 8, 1, 0.6, true), hips: cyl(0.17, 0.155, 0.22, 8, 1, 0.62), head, hair,
      uarm: cyl(0.058, 0.048, UARM, 6), farm: cyl(0.047, 0.038, FARM, 6), thigh: cyl(0.082, 0.062, THIGH, 7), shin: cyl(0.06, 0.045, SHIN, 6), foot, gun,
    };
    this.parts = {};
    for (const k in geos) {
      const n = k === 'uarm' || k === 'farm' || k === 'thigh' || k === 'shin' || k === 'foot' ? CAP * 2 : CAP;
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

  // calcula a pose a partir do estado (andar, correr, mirar, caído) e envia as partes
  draw(p) {
    const L = p.look, root = _m[0], hips = _m[1], torso = _m[2], t = _m[3], u = _m[4];
    const run = Math.min(1, p.speed / 5.5), walk = Math.min(1, p.speed / 1.4);
    const ph = p.phase, s = Math.sin(ph), c = Math.cos(ph);
    const amp = walk * (0.42 + run * 0.5);
    const bob = Math.abs(s) * 0.035 * walk * (1 + run);
    root.makeRotationY(p.yaw).setPosition(p.x, p.y, p.z);
    if (p.down > 0) {
      // cai para trás e fica deitado
      const k = Math.min(1, p.down);
      joint(root, root, 0, 0.12 * k, 0, -k * 1.5, 0);
    }
    joint(hips, root, 0, HIP + bob - p.aim * 0.03, 0, 0, 0);
    this.put('hips', hips, L.pants);
    const lean = run * 0.2 + p.aim * 0.06;
    joint(torso, hips, 0, 0.02, 0, lean, s * 0.05 * walk);
    this.put('torso', torso, L.jacket || L.shirt);
    joint(t, torso, 0, TORSO - 0.03, 0, -lean * 0.6 - p.aimPitch * 0.5 * p.aim, 0);
    this.put('head', t, L.skin);
    this.put('hair', t, L.cap ? 0x0e1320 : L.hair);
    // braços: balanço ao andar; ao mirar, os dois apontam para a frente
    for (const sd of [1, -1]) {
      const sw = -s * sd * amp * 0.9;
      const aimRx = -Math.PI / 2 - p.aimPitch + (sd > 0 ? 0 : 0.12) - p.recoil * 0.18;
      const rx = sw * (1 - p.aim) + aimRx * p.aim;
      const rz = (0.09 * sd) * (1 - p.aim) + (sd > 0 ? -0.1 : 0.52) * p.aim * (sd > 0 ? 1 : 1);
      joint(u, torso, SHW * sd * -1, TORSO - 0.07, 0, rx, rz * -1);
      this.put('uarm', u, L.jacket || L.shirt);
      const el = (0.25 + run * 0.9 + Math.max(0, sw) * 0.5) * (1 - p.aim) + (sd > 0 ? 0.08 : 0.5) * p.aim;
      joint(t, u, 0, -UARM, 0, -el, 0);
      this.put('farm', t, L.skin);
      if (sd > 0 && p.armed && p.down <= 0 && (p.aim > 0.3 || p.kind !== 'player')) {
        joint(u, t, 0, -FARM, 0, Math.PI / 2 * p.aim + 0.2 * (1 - p.aim), 0);
        this.put('gun', u, 0x15171a);
      }
    }
    // pernas
    for (const sd of [1, -1]) {
      const sw = s * sd * amp;
      joint(u, hips, HPW * sd * -1, -0.04, 0, -sw, 0);
      this.put('thigh', u, L.pants);
      const knee = walk * (0.15 + Math.max(0, -c * sd) * (0.7 + run * 0.9));
      joint(t, u, 0, -THIGH, 0, knee, 0);
      this.put('shin', t, L.pants);
      joint(u, t, 0, -SHIN, 0, -knee * 0.35 + Math.max(0, sw) * 0.3, 0);
      this.put('foot', u, L.shoe);
    }
  }
}
