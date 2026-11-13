// Câmera em terceira pessoa com atraso e tremor em alta velocidade; alterna para câmera do capô.
import * as THREE from 'three';
import { clamp, damp, angleDiff, lerp } from '../core/util.js';

export class ChaseCamera {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(58, aspect, 0.3, 2600);
    this.mode = 0; // 0 perseguição, 1 perseguição distante, 2 capô
    this.yaw = 0; this.shake = 0; this.t = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.first = true;
    this.orbit = null; // {angle, dist, height} para garagem/menu
  }
  cycle() { this.mode = (this.mode + 1) % 3; return this.mode; }
  kick(a) { this.shake = Math.min(1, this.shake + a); }
  snap() { this.first = true; }
  update(dt, v, map, dims, shakeOn = true) {
    const cam = this.cam;
    this.t += dt;
    const sp = v.speed;
    const k = clamp(sp / 75, 0, 1);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const amp = shakeOn ? Math.max(0, sp - 38) * 0.0011 + this.shake * 0.28 + (v.nitroOn ? 0.018 : 0) : 0;
    const jx = (Math.sin(this.t * 47.3) + Math.sin(this.t * 31.7)) * amp;
    const jy = (Math.sin(this.t * 53.1) + Math.cos(this.t * 37.9)) * amp;
    cam.fov = damp(cam.fov, 58 + k * 15 + (v.nitroOn ? 7 : 0), 4, dt);
    cam.updateProjectionMatrix();

    if (this.orbit) {
      const o = this.orbit;
      cam.position.set(v.x + Math.sin(o.angle) * o.dist, v.y + o.height, v.z + Math.cos(o.angle) * o.dist);
      cam.lookAt(v.x, v.y + 0.7, v.z);
      this.first = true;
      return;
    }
    if (this.mode === 2) {
      const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
      const h = dims.belt + 0.32, f = dims.len * 0.08;
      cam.position.set(v.x + sn * f + jx * 0.4, v.y + h + jy * 0.4, v.z + cs * f);
      cam.rotation.order = 'YXZ';
      cam.rotation.set(-v.pitch * 0.7 - 0.02, v.yaw + Math.PI, -v.roll * 0.7);
      this.yaw = v.yaw;
      return;
    }
    // direção alvo: mistura rumo do carro e direção da velocidade (mostra o drift)
    let ty = v.yaw;
    if (sp > 6 && v.vf > 0) ty = v.yaw + angleDiff(Math.atan2(v.vx, v.vz), v.yaw) * 0.35;
    if (this.first) { this.yaw = ty; }
    this.yaw += angleDiff(ty, this.yaw) * (1 - Math.exp(-(4.2 + k * 3) * dt));
    const far = this.mode === 1;
    const dist = (far ? 9.5 : 6.3) + k * 1.6 + dims.len * 0.25;
    const height = (far ? 3.9 : 2.35) + dims.roof * 0.35;
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    let tx = v.x - sn * dist, tz = v.z - cs * dist, tyy = v.y + height;
    const gh = map.heightAt(tx, tz) + 0.9;
    if (tyy < gh) tyy = gh;
    if (this.first) { this.pos.set(tx, tyy, tz); this.first = false; }
    this.pos.x = tx; this.pos.z = tz;
    this.pos.y = damp(this.pos.y, tyy, 7, dt);
    cam.position.set(this.pos.x + jx, this.pos.y + jy, this.pos.z);
    const fs = Math.sin(v.yaw), fc = Math.cos(v.yaw);
    this.look.set(v.x + fs * 2.2, v.y + 1.15 + (far ? 0.2 : 0), v.z + fc * 2.2);
    cam.rotation.order = 'XYZ';
    cam.lookAt(this.look);
  }
}
