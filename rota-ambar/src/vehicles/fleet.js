// Frota instanciada: todos os carros de IA (trânsito, rivais, polícia) em poucos draw calls,
// mais sombras falsas, brilhos de faróis/lanternas e manchas de luz no asfalto.
import * as THREE from 'three';
import { carGeometry, detailMat } from './cars.js';

const MODELS = ['compact', 'sedan', 'muscle', 'sport', 'super', 'suv', 'pickup', 'police'];
const _m = new THREE.Matrix4(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _c = new THREE.Color(), _q = new THREE.Quaternion();
const _s = new THREE.Vector3(), _p = new THREE.Vector3();

function fan(seg, inner, outer, alpha) {
  // disco com gradiente do centro (inner) para a borda (outer)
  const pos = [], col = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    pos.push(0, 0, 0, Math.cos(a0), Math.sin(a0), 0, Math.cos(a1), Math.sin(a1), 0);
    col.push(...inner, ...outer, ...outer);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, alpha ? 4 : 3));
  return g;
}

export class Fleet {
  constructor(scene, cap = 44) {
    this.cap = cap;
    this.sets = {};
    const paintMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (const key of MODELS) {
      const g = carGeometry(key === 'police' ? 'sedan' : key, { withWheels: true, police: key === 'police' });
      const paint = new THREE.InstancedMesh(g.paint, paintMat, cap);
      const detail = new THREE.InstancedMesh(g.detail, detailMat, cap);
      paint.setColorAt(0, _c.set(0xffffff));
      for (const m of [paint, detail]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; scene.add(m); }
      this.sets[key] = { paint, detail, n: 0, dims: g.dims };
    }
    // sombras falsas
    const sg = fan(14, [0, 0, 0, 0.52], [0, 0, 0, 0], true);
    sg.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -10 }), cap + 4);
    // brilhos (billboards aditivos)
    const gg = fan(10, [1, 1, 1], [0, 0, 0], false);
    this.glows = new THREE.InstancedMesh(gg, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }), 220);
    this.glows.setColorAt(0, _c.set(0xffffff));
    // manchas de luz dos faróis no chão
    const pg = fan(12, [1, 0.9, 0.7], [0, 0, 0], false);
    pg.rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -12 }), cap + 4);
    this.pools.setColorAt(0, _c.set(0xffffff));
    for (const m of [this.shadows, this.glows, this.pools]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
    this.shadows.renderOrder = 1; this.pools.renderOrder = 2; this.glows.renderOrder = 3;
    this.ns = 0; this.ng = 0; this.np = 0;
    this.camQ = new THREE.Quaternion();
  }
  begin(cam) {
    for (const k in this.sets) this.sets[k].n = 0;
    this.ns = this.ng = this.np = 0;
    this.camQ.copy(cam.quaternion);
  }
  car(key, x, y, z, yaw, pitch, roll, color) {
    const s = this.sets[key];
    if (s.n >= this.cap) return;
    _e.set(pitch, yaw, roll);
    _m.makeRotationFromEuler(_e).setPosition(x, y, z);
    s.paint.setMatrixAt(s.n, _m);
    s.detail.setMatrixAt(s.n, _m);
    s.paint.setColorAt(s.n, _c.set(color));
    s.n++;
  }
  shadow(x, y, z, yaw, pitch, halfLen, halfWid, k = 1) {
    if (this.ns >= this.cap + 4) return;
    _e.set(pitch, yaw, 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y + 0.05, z), _q, _s.set(halfWid * 1.5 * k, 1, halfLen * 1.32 * k));
    this.shadows.setMatrixAt(this.ns++, _m);
  }
  glow(x, y, z, size, color, intensity = 1) {
    if (this.ng >= 220) return;
    _m.compose(_p.set(x, y, z), this.camQ, _s.set(size, size, size));
    this.glows.setMatrixAt(this.ng, _m);
    this.glows.setColorAt(this.ng, _c.set(color).multiplyScalar(intensity));
    this.ng++;
  }
  pool(x, y, z, yaw, len, wid, intensity) {
    if (this.np >= this.cap + 4) return;
    _e.set(0, yaw, 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y + 0.07, z), _q, _s.set(wid, 1, len));
    this.pools.setMatrixAt(this.np, _m);
    this.pools.setColorAt(this.np, _c.setScalar(intensity));
    this.np++;
  }
  // desenha luzes padrão de um carro (faróis, lanternas) à noite
  carLights(v, dims, night, braking) {
    const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
    const hl = dims.len / 2, hw = dims.wid / 2 * 0.72;
    const hy = v.y + dims.hoodF - 0.1, ty = v.y + dims.deck - 0.14;
    if (night > 0.3) {
      for (const sx of [-1, 1]) {
        this.glow(v.x + sn * (hl + 0.05) + cs * hw * sx, hy, v.z + cs * (hl + 0.05) - sn * hw * sx, 0.42, 0xfff0c8, night);
        this.glow(v.x - sn * (hl + 0.05) + cs * hw * sx, ty, v.z - cs * (hl + 0.05) - sn * hw * sx, braking ? 0.32 : 0.2, 0xff2a1a, braking ? 1 : 0.7 * night);
      }
      this.pool(v.x + sn * (hl + 6.5), v.y, v.z + cs * (hl + 6.5), v.yaw, 8, 4.2, 0.32 * night);
    } else if (braking) {
      for (const sx of [-1, 1]) this.glow(v.x - sn * (hl + 0.05) + cs * hw * sx, ty, v.z - cs * (hl + 0.05) - sn * hw * sx, 0.24, 0xff2a1a, 0.8);
    }
  }
  end() {
    for (const k in this.sets) {
      const s = this.sets[k];
      s.paint.count = s.detail.count = s.n;
      if (s.n) {
        s.paint.instanceMatrix.needsUpdate = true; s.detail.instanceMatrix.needsUpdate = true;
        s.paint.instanceColor.needsUpdate = true;
      }
    }
    this.shadows.count = this.ns; this.shadows.instanceMatrix.needsUpdate = true;
    this.glows.count = this.ng; this.glows.instanceMatrix.needsUpdate = true; if (this.glows.instanceColor) this.glows.instanceColor.needsUpdate = true;
    this.pools.count = this.np; this.pools.instanceMatrix.needsUpdate = true; if (this.pools.instanceColor) this.pools.instanceColor.needsUpdate = true;
  }
}
