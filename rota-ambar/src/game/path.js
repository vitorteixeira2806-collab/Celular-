// Constrói a linha de corrida de um evento: rota pelo grafo -> curvas arredondadas -> amostras a cada 5 m.
import { clamp } from '../core/util.js';

export const DS = 5;

export function buildDrivePath(map, waypoints, closed, shift = 0) {
  const idOf = (w) => map.nearestNode(w[0], w[1]).id;
  const seq = [];
  let lastDir = null;
  const first = idOf(waypoints[0]);
  let cur = first;
  const go = (b) => {
    if (b === cur) return;
    const r = map.findRoute(cur, b, { fast: false, startDir: lastDir, avoidEdge: seq.length ? seq[seq.length - 1] >> 1 : -1 });
    if (!r) throw new Error('rota impossível');
    for (const k of r) seq.push(k);
    const k = r[r.length - 1];
    lastDir = map.edgeDir(map.edges[k >> 1], k & 1, true);
    cur = b;
  };
  for (let i = 1; i < waypoints.length; i++) {
    const w = waypoints[i];
    if (w === 'M') {
      // atravessa a estrada da serra a partir do nó atual
      const e = map.mountainEdge, dir = e.a === cur ? 0 : 1;
      seq.push(e.id * 2 + dir);
      lastDir = map.edgeDir(e, dir, true);
      cur = dir === 0 ? e.b : e.a;
    } else go(idOf(w));
  }
  if (closed) go(first);
  const raw = map.routePoints(seq);
  const widths = [];
  // largura por ponto (para limitar o desvio lateral da IA)
  {
    let q = 0;
    for (const k of seq) {
      const e = map.edges[k >> 1];
      const n = e.pts.length - (q === 0 ? 0 : 1);
      for (let i = 0; i < n; i++) widths.push(e.width / 2);
      q++;
    }
  }
  if (closed) { raw.pop(); widths.pop(); }
  // arredonda cantos
  const pts = [], hws = [];
  const N = raw.length;
  for (let i = 0; i < N; i++) {
    const p = raw[i];
    const hasPrev = closed || i > 0, hasNext = closed || i < N - 1;
    if (!hasPrev || !hasNext) { pts.push({ x: p.x, z: p.z }); hws.push(widths[i]); continue; }
    const a = raw[(i - 1 + N) % N], b = raw[(i + 1) % N];
    let ax = p.x - a.x, az = p.z - a.z, bx = b.x - p.x, bz = b.z - p.z;
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    ax /= la; az /= la; bx /= lb; bz /= lb;
    const dot = ax * bx + az * bz;
    if (dot > 0.975) { pts.push({ x: p.x, z: p.z }); hws.push(widths[i]); continue; }
    const d = Math.min(widths[i] > 8 ? 30 : 20, la * 0.48, lb * 0.48);
    const p0x = p.x - ax * d, p0z = p.z - az * d, p2x = p.x + bx * d, p2z = p.z + bz * d;
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, u = 1 - t;
      pts.push({ x: u * u * p0x + 2 * u * t * p.x + t * t * p2x, z: u * u * p0z + 2 * u * t * p.z + t * t * p2z });
      hws.push(widths[i]);
    }
  }
  // reamostra
  const M = pts.length;
  const segs = closed ? M : M - 1;
  const cum = [0];
  for (let i = 0; i < segs; i++) { const a = pts[i], b = pts[(i + 1) % M]; cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z)); }
  const total = cum[segs];
  const n = Math.max(4, Math.floor(total / DS));
  const ds = total / n;
  const cnt = closed ? n : n + 1;
  const px = new Float32Array(cnt), pz = new Float32Array(cnt), hw = new Float32Array(cnt), rad = new Float32Array(cnt);
  let j = 0;
  for (let i = 0; i < cnt; i++) {
    const s = Math.min(total, i * ds);
    while (j < segs - 1 && cum[j + 1] < s) j++;
    const a = pts[j], b = pts[(j + 1) % M];
    const t = clamp((s - cum[j]) / (cum[j + 1] - cum[j] || 1), 0, 1);
    px[i] = a.x + (b.x - a.x) * t; pz[i] = a.z + (b.z - a.z) * t; hw[i] = hws[j];
  }
  const path = { px, pz, hw, rad, n: cnt, ds, total, closed, seq };
  if (closed && shift) rotate(path, shift);
  // raio de curvatura (3 pontos espaçados)
  const W = 2;
  for (let i = 0; i < cnt; i++) {
    const ia = idx(path, i - W), ib = idx(path, i + W);
    const ax = px[ia], az = pz[ia], bx = px[i], bz = pz[i], cx = px[ib], cz = pz[ib];
    const A = Math.hypot(bx - ax, bz - az), B = Math.hypot(cx - bx, cz - bz), Cc = Math.hypot(cx - ax, cz - az);
    const area = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
    rad[i] = area < 1e-3 ? 1e4 : Math.min(1e4, (A * B * Cc) / (4 * area));
  }
  // suaviza o raio (mínimo local)
  const r2 = rad.slice();
  for (let i = 0; i < cnt; i++) rad[i] = Math.min(r2[idx(path, i - 1)], r2[i], r2[idx(path, i + 1)]);
  return path;
}

function rotate(p, k) {
  const n = p.n;
  for (const key of ['px', 'pz', 'hw']) {
    const a = p[key], b = new Float32Array(n);
    for (let i = 0; i < n; i++) b[i] = a[(i + k) % n];
    p[key] = b;
  }
}

export function idx(path, i) {
  if (path.closed) return ((i % path.n) + path.n) % path.n;
  return i < 0 ? 0 : i >= path.n ? path.n - 1 : i;
}

// direção (unitária) da pista na amostra i
export function pathDir(path, i, out) {
  const a = idx(path, i - 1), b = idx(path, i + 1);
  let dx = path.px[b] - path.px[a], dz = path.pz[b] - path.pz[a];
  const l = Math.hypot(dx, dz) || 1;
  out.x = dx / l; out.z = dz / l;
  return out;
}

// perfil de velocidade para um carro (aLat = aceleração lateral disponível, brake = desaceleração)
export function speedProfile(path, top, aLat, brake) {
  const n = path.n, lim = new Float32Array(n);
  for (let i = 0; i < n; i++) lim[i] = Math.min(top, Math.sqrt(aLat * path.rad[i]));
  const passes = path.closed ? 2 : 1;
  for (let p = 0; p < passes; p++) {
    for (let i = n - 2 + (path.closed ? 1 : 0); i >= 0; i--) {
      const nx = path.closed ? (i + 1) % n : i + 1;
      const v = Math.sqrt(lim[nx] * lim[nx] + 2 * brake * path.ds);
      if (v < lim[i]) lim[i] = v;
    }
  }
  return lim;
}

// tempo de referência (s) para percorrer o trajeto com um carro
export function parTime(path, top, accel, aLat, brake, laps = 1) {
  const lim = speedProfile(path, top, aLat, brake);
  let t = 0, v = 0;
  const N = path.n * laps;
  for (let k = 0; k < N; k++) {
    const i = k % path.n;
    const k2 = Math.min(1, v / top);
    v = Math.min(lim[i], Math.sqrt(v * v + 2 * accel * (1 - k2 * k2 * k2 * 0.9) * path.ds));
    t += path.ds / Math.max(3, v);
  }
  return t;
}
