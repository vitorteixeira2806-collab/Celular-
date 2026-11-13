// Visual do carro do jogador: carroceria deformável, rodas que giram e esterçam.
import * as THREE from 'three';
import { carGeometry, detailMat } from './cars.js';
import { hash2 } from '../core/util.js';
import { glossy } from '../world/env.js';

export class CarView {
  constructor() {
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.paintMat = glossy(new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, shininess: 90, specular: 0x222222 }), 'paint');
    this.wheels = [];
    this.spin = 0;
    this.model = null;
  }
  setCar(model, color) {
    if (this.model !== model) {
      this.model = model;
      while (this.body.children.length) this.body.remove(this.body.children[0]);
      for (const w of this.wheels) this.group.remove(w.pivot);
      if (this.paintGeo) { this.paintGeo.dispose(); this.detailGeo.dispose(); }
      const g = carGeometry(model);
      this.geo = g;
      this.paintGeo = g.paint.clone();
      this.detailGeo = g.detail.clone();
      this.orig = [this.paintGeo.attributes.position.array.slice(), this.detailGeo.attributes.position.array.slice()];
      this.paint = new THREE.Mesh(this.paintGeo, this.paintMat);
      this.detailMesh = new THREE.Mesh(this.detailGeo, detailMat);
      this.paint.castShadow = this.detailMesh.castShadow = true;
      this.body.add(this.paint, this.detailMesh);
      this.wheels = g.wheelPos.map(([x, y, z], i) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, z);
        const mesh = new THREE.Mesh(g.wheel, detailMat);
        pivot.add(mesh);
        this.group.add(pivot);
        return { pivot, mesh, left: x > 0, front: i < 2 };
      });
      this.dims = g.dims;
      this.dirty = false;
    }
    this.paintMat.color.set(color);
  }
  update(v, dt) {
    const g = this.group;
    g.position.set(v.x, v.y, v.z);
    g.rotation.set(v.pitch, v.yaw, v.roll);
    // balanço da carroceria
    this.body.rotation.x = -v.accelLong * 0.0035;
    this.body.rotation.z = v.accelLat * 0.0045;
    this.spin += (v.vf / this.dims.wr) * dt;
    const ang = -v.steer * 0.5;
    for (const w of this.wheels) {
      w.pivot.rotation.y = (w.left ? 0 : Math.PI) + (w.front ? ang : 0);
      w.mesh.rotation.x = w.left ? this.spin : -this.spin;
    }
  }
  // amassa a lataria perto do ponto local (lx,lz), empurrando na direção (nx,nz)
  dent(lx, lz, nx, nz, strength) {
    const R = 1.1, s = Math.min(0.3, strength);
    const geos = [this.paintGeo, this.detailGeo];
    for (let gi = 0; gi < 2; gi++) {
      const pos = geos[gi].attributes.position, arr = pos.array, o = this.orig[gi];
      for (let i = 0; i < arr.length; i += 3) {
        const dx = o[i] - lx, dz = o[i + 2] - lz;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        const f = 1 - Math.sqrt(d2) / R;
        const h = hash2(Math.round(o[i] * 40) + Math.round(o[i + 1] * 40) * 131, Math.round(o[i + 2] * 40));
        const k = s * f * (0.55 + 0.9 * h);
        let px = arr[i] + nx * k, pz = arr[i + 2] + nz * k, py = arr[i + 1] - k * 0.25 * h;
        // limita a deformação total
        const ex = px - o[i], ez = pz - o[i + 2], el = Math.hypot(ex, ez);
        if (el > 0.34) { px = o[i] + (ex / el) * 0.34; pz = o[i + 2] + (ez / el) * 0.34; }
        arr[i] = px; arr[i + 2] = pz; arr[i + 1] = Math.max(o[i + 1] - 0.12, py);
      }
      pos.needsUpdate = true;
      geos[gi].computeVertexNormals();
    }
    this.dirty = true;
  }
  repair() {
    if (!this.dirty) return;
    [this.paintGeo, this.detailGeo].forEach((g, gi) => {
      g.attributes.position.array.set(this.orig[gi]);
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    });
    this.dirty = false;
  }
}
