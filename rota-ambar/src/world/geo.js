// Construtor de geometria low-poly mesclada (um draw call por malha), com cor por vértice.
import * as THREE from 'three';

const _cc = new Map();
const _tmp = new THREE.Color();
// cor hex sRGB -> [r,g,b] linear (cache)
export function C(hex) {
  let c = _cc.get(hex);
  if (!c) { _tmp.set(hex); c = [_tmp.r, _tmp.g, _tmp.b]; _cc.set(hex, c); }
  return c;
}
export const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class Geo {
  constructor(o = {}) {
    this.p = []; this.n = []; this.c = [];
    this.uv = o.uv ? [] : null;
    this.info = o.info ? [] : null;
    this.alpha = !!o.alpha; // cor RGBA
    this.ci = [0, 0, 0];
    this.a = 1;
  }
  get count() { return this.p.length / 3; }
  _v(x, y, z, nx, ny, nz, c, u, v) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz);
    if (this.alpha) this.c.push(c[0], c[1], c[2], c.length > 3 ? c[3] : this.a); else this.c.push(c[0], c[1], c[2]);
    if (this.uv) this.uv.push(u || 0, v || 0);
    if (this.info) this.info.push(this.ci[0], this.ci[1], this.ci[2]);
  }
  tri(a, b, c, col, colB, colC) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this._v(a[0], a[1], a[2], nx, ny, nz, col, -1, -1);
    this._v(b[0], b[1], b[2], nx, ny, nz, colB || col, -1, -1);
    this._v(c[0], c[1], c[2], nx, ny, nz, colC || col, -1, -1);
  }
  // a,b,c,d em sentido anti-horário visto de fora. uv opcional: [u0,v0,u1,v1]
  quad(a, b, c, d, col, uv) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    let u0 = -1, v0 = -1, u1 = -1, v1 = -1;
    if (uv) { u0 = uv[0]; v0 = uv[1]; u1 = uv[2]; v1 = uv[3]; }
    this._v(a[0], a[1], a[2], nx, ny, nz, col, u0, v0);
    this._v(b[0], b[1], b[2], nx, ny, nz, col, u1, v0);
    this._v(c[0], c[1], c[2], nx, ny, nz, col, u1, v1);
    this._v(a[0], a[1], a[2], nx, ny, nz, col, u0, v0);
    this._v(c[0], c[1], c[2], nx, ny, nz, col, u1, v1);
    this._v(d[0], d[1], d[2], nx, ny, nz, col, u0, v1);
  }
  // quad horizontal: corrige a ordem para a normal apontar para cima
  up(a, b, c, d, col) {
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny >= 0) this.quad(a, b, c, d, col); else this.quad(d, c, b, a, col);
  }
  // caixa alinhada aos eixos. o: {top, bottom, sides, uv (paredes com uv em metros), topCol}
  box(x0, y0, z0, x1, y1, z1, col, o = {}) {
    const uv = o.uv;
    const w = x1 - x0, d = z1 - z0;
    if (o.sides !== false) {
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col, uv ? [0, y0, d, y1] : null);
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, uv ? [d + w, y0, d + w + d, y1] : null);
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, uv ? [d + w + d, y0, d + w + d + w, y1] : null);
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col, uv ? [d, y0, d + w, y1] : null);
    }
    if (o.top !== false) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], o.topCol || col);
    if (o.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col);
  }
  // caixa orientada (yaw em torno de Y)
  obox(cx, cy, cz, hx, hy, hz, yaw, col, o = {}) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const P = (lx, ly, lz) => [cx + lx * c + lz * s, cy + ly, cz - lx * s + lz * c];
    const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz)];
    this.quad(v[2], v[1], v[5], v[6], col);
    this.quad(v[0], v[3], v[7], v[4], col);
    this.quad(v[3], v[2], v[6], v[7], col);
    this.quad(v[1], v[0], v[4], v[5], col);
    if (o.top !== false) this.quad(v[7], v[6], v[5], v[4], o.topCol || col);
    if (o.bottom) this.quad(v[0], v[1], v[2], v[3], col);
  }
  // cilindro/tronco de cone vertical
  cyl(cx, y0, cz, r0, r1, h, seg, col, o = {}) {
    const y1 = y0 + h;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const s0 = Math.sin(a0), c0 = Math.cos(a0), s1 = Math.sin(a1), c1 = Math.cos(a1);
      const A = [cx + s0 * r0, y0, cz + c0 * r0], B = [cx + s1 * r0, y0, cz + c1 * r0];
      const Cc = [cx + s1 * r1, y1, cz + c1 * r1], D = [cx + s0 * r1, y1, cz + c0 * r1];
      if (r1 > 0.001) this.quad(A, B, Cc, D, o.cols ? o.cols[i % o.cols.length] : col); else this.tri(A, B, [cx, y1, cz], o.cols ? o.cols[i % o.cols.length] : col);
      if (o.cap !== false && r1 > 0.001) this.tri([cx, y1, cz], D, Cc, o.capCol || col);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, this.alpha ? 4 : 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.info) g.setAttribute('binfo', new THREE.Float32BufferAttribute(this.info, 3));
    g.computeBoundingSphere();
    return g;
  }
}
