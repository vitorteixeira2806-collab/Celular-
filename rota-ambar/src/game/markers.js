// Marcadores luminosos (checkpoints e pontos de evento): cilindro aditivo com gradiente vertical.
import * as THREE from 'three';

const _geo = new Map();
function beamGeo(seg) {
  if (_geo.has(seg)) return _geo.get(seg);
  const pos = [], col = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const x0 = Math.sin(a0), z0 = Math.cos(a0), x1 = Math.sin(a1), z1 = Math.cos(a1);
    // parede (dois lados) com brilho forte embaixo
    const quad = (ax, az, bx, bz) => {
      pos.push(ax, 0, az, bx, 0, bz, bx, 1, bz, ax, 0, az, bx, 1, bz, ax, 1, az);
      col.push(0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0);
    };
    quad(x0, z0, x1, z1);
    // anel no chão
    pos.push(x0 * 0.78, 0.01, z0 * 0.78, x0, 0.01, z0, x1, 0.01, z1, x0 * 0.78, 0.01, z0 * 0.78, x1, 0.01, z1, x1 * 0.78, 0.01, z1 * 0.78);
    col.push(0.1, 0.1, 0.1, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.1, 0.1, 0.1, 0.6, 0.6, 0.6, 0.1, 0.1, 0.1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  _geo.set(seg, g);
  return g;
}

export function makeBeam(color, r, h) {
  const mat = new THREE.MeshBasicMaterial({ color, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(beamGeo(20), mat);
  m.scale.set(r, h, r);
  m.renderOrder = 4;
  m.frustumCulled = false;
  return m;
}
