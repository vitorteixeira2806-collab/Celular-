// Gerador procedural de "Baía Âmbar" (somente dados; nenhuma dependência de render).
// Seed fixa: a cidade é sempre a mesma em qualquer aparelho.
import { mulberry32, clamp, smoothstep, fbm, segDist2, lerp, hash2 } from '../core/util.js';

export const SEED = 0xa3b17;
export const CHUNK = 200;
export const RING = { x0: -940, x1: 940, z0: -620, z1: 430, r: 140 };
export const WORLD = { x0: -1320, x1: 1320, z0: -1420, z1: 900 };
export const WATER_Y = -0.45;

export const ROAD = {
  street: { width: 10, lanes: 1, speed: 12 },
  avenue: { width: 18, lanes: 2, speed: 15 },
  highway: { width: 26, lanes: 3, speed: 25 },
  coast: { width: 26, lanes: 3, speed: 19 },
  mountain: { width: 10, lanes: 1, speed: 13 },
  dock: { width: 12, lanes: 1, speed: 9 },
};

// geometria das faixas (compartilhada por render e trânsito)
const SHOULDER = { street: 1.3, avenue: 1.0, highway: 1.6, coast: 1.6, mountain: 0.9, dock: 1.6 };
export const laneWidth = (e) => (e.width / 2 - SHOULDER[e.type]) / e.lanes;
export const laneCenter = (e, k) => (k + 0.5) * laneWidth(e) + 0.15;

const PAL = {
  tower: [0x8fa3b8, 0x6f879e, 0x9aa7b0, 0xb7b2a6, 0x596b7d, 0xa3b5c2, 0x7d8a96, 0xc2b8a3, 0x4f6272],
  mid: [0xc9b79c, 0xb9a48a, 0xd8cdb8, 0xa9b0a3, 0xc4a78e, 0xbfc5cc, 0xd6b8a0],
  house: [0xf2d6a2, 0xf4b6a0, 0xa9d6c8, 0xf7e3b0, 0xb5cbe8, 0xe8a6a6, 0xfff1d6, 0xc7e0a8],
  roof: [0xb5533c, 0x9c4a36, 0x7a4b3a, 0x8a8a8a, 0xa8614a],
  ind: [0x9aa0a6, 0x8c8f86, 0xa89f91, 0x7f8b94, 0xb3a58c],
  hotel: [0xf5f0e6, 0xf6d9b8, 0xe9e4d8, 0xbfe0e6, 0xf3c9b0],
  cont: [0xc8553d, 0x2f6f9f, 0x3d8f5f, 0xd9a441, 0x8a8f96, 0x7b3f6e],
};

export function generateMap() {
  const rng = mulberry32(SEED);
  const nodes = [];
  const edges = [];

  const addNode = (x, z, kind) => {
    const n = { id: nodes.length, x, z, kind, edges: [], r: 6, signal: -1 };
    nodes.push(n);
    return n;
  };

  // pts: polilinha de a até b (inclui extremos). Segmentos longos são subdivididos.
  const addEdge = (a, b, type, pts) => {
    const R = ROAD[type];
    let raw = pts || [{ x: a.x, z: a.z }, { x: b.x, z: b.z }];
    const p = [raw[0]];
    for (let i = 1; i < raw.length; i++) {
      const q0 = raw[i - 1], q1 = raw[i];
      const d = Math.hypot(q1.x - q0.x, q1.z - q0.z);
      const n = Math.max(1, Math.ceil(d / 60));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        p.push({ x: lerp(q0.x, q1.x, t), z: lerp(q0.z, q1.z, t), y: q0.y != null ? lerp(q0.y, q1.y, t) : 0 });
      }
    }
    p[0].y = p[0].y || 0;
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z));
    const dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z);
    const e = {
      id: edges.length, a: a.id, b: b.id, type, pts: p, cum, len: cum[cum.length - 1],
      width: R.width, lanes: R.lanes, speed: R.speed, axis: dx > dz ? 0 : 1, // 0 = leste-oeste, 1 = norte-sul
    };
    edges.push(e);
    a.edges.push(e.id);
    b.edges.push(e.id);
    return e;
  };

  // ---------- Malha do centro ----------
  const NX = 15, NZ = 8, AV_I = 7, AV_J = 4;
  const axis = (n, lo, hi) => {
    const sp = [];
    let tot = 0;
    for (let i = 0; i < n - 1; i++) { const s = rng.range(0.82, 1.22); sp.push(s); tot += s; }
    const out = [lo];
    for (let i = 0; i < n - 1; i++) out.push(out[i] + (sp[i] / tot) * (hi - lo));
    return out.map((v) => Math.round(v));
  };
  const GX = axis(NX, -756, 756);
  const GZ = axis(NZ, -460, 296);
  const hwX = (i) => (i === AV_I ? ROAD.avenue.width : ROAD.street.width) / 2;
  const hwZ = (j) => (j === AV_J ? ROAD.avenue.width : ROAD.street.width) / 2;

  const g = [];
  for (let i = 0; i < NX; i++) {
    g.push([]);
    for (let j = 0; j < NZ; j++) g[i].push(addNode(GX[i], GZ[j], 'grid'));
  }

  // remove alguns trechos para criar quarteirões maiores (praças, pátios)
  const cellMerged = [];
  for (let i = 0; i < NX - 1; i++) cellMerged.push(new Array(NZ - 1).fill(-1));
  const removedV = new Set(), removedH = new Set(); // "i,j"
  const merges = [];
  let tries = 0;
  while (merges.length < 9 && tries++ < 200) {
    if (rng.chance(0.5)) {
      // trecho vertical entre (i,j)-(i,j+1): une células (i-1,j) e (i,j)
      const i = rng.int(1, NX - 2), j = rng.int(0, NZ - 2);
      if (i === AV_I || cellMerged[i - 1][j] >= 0 || cellMerged[i][j] >= 0) continue;
      cellMerged[i - 1][j] = cellMerged[i][j] = merges.length;
      merges.push({ i0: i - 1, j0: j, i1: i, j1: j });
      removedV.add(i + ',' + j);
    } else {
      const i = rng.int(0, NX - 2), j = rng.int(1, NZ - 2);
      if (j === AV_J || cellMerged[i][j - 1] >= 0 || cellMerged[i][j] >= 0) continue;
      cellMerged[i][j - 1] = cellMerged[i][j] = merges.length;
      merges.push({ i0: i, j0: j - 1, i1: i, j1: j });
      removedH.add(i + ',' + j);
    }
  }

  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      if (j < NZ - 1 && !removedV.has(i + ',' + j)) addEdge(g[i][j], g[i][j + 1], i === AV_I ? 'avenue' : 'street');
      if (i < NX - 1 && !removedH.has(i + ',' + j)) addEdge(g[i][j], g[i + 1][j], j === AV_J ? 'avenue' : 'street');
    }
  }

  // ---------- Anel viário ----------
  const { x0: RX0, x1: RX1, z0: RZ0, z1: RZ1, r: RR } = RING;
  const ringSeq = []; // sequência de {node} ou {arc:[pts]}
  const sideNodes = (list) => list.map(([x, z, link, type]) => {
    const n = addNode(x, z, 'ring');
    if (link) addEdge(link, n, type || 'street');
    return n;
  });
  const arc = (cx, cz, a0, a1) => {
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const a = lerp(a0, a1, k / 8);
      pts.push({ x: cx + Math.cos(a) * RR, z: cz + Math.sin(a) * RR });
    }
    return pts;
  };
  // norte (oeste -> leste)
  const northJ = [];
  for (let i = 1; i < NX; i += 2) northJ.push([GX[i], RZ0, g[i][0], i === AV_I ? 'avenue' : 'street']);
  const eastJ = [1, 3, 4, 6].map((j) => [RX1, GZ[j], g[NX - 1][j], j === AV_J ? 'avenue' : 'street']);
  const southJ = [];
  for (let i = NX - 1; i >= 0; i--) southJ.push([GX[i], RZ1, g[i][NZ - 1], i === AV_I ? 'avenue' : 'street']);
  const westJ = [6, 4, 3, 1].map((j) => [RX0, GZ[j], g[0][j], j === AV_J ? 'avenue' : 'street']);

  const bend = (x, z) => addNode(x, z, 'bend');
  const nN = [bend(RX0 + RR, RZ0), ...sideNodes(northJ), bend(RX1 - RR, RZ0)];
  const nE = [bend(RX1, RZ0 + RR), ...sideNodes(eastJ), bend(RX1, RZ1 - RR)];
  const nS = [bend(RX1 - RR, RZ1), ...sideNodes(southJ), bend(RX0 + RR, RZ1)];
  const nW = [bend(RX0, RZ1 - RR), ...sideNodes(westJ), bend(RX0, RZ0 + RR)];
  const chain = (arr, type) => { for (let i = 0; i < arr.length - 1; i++) addEdge(arr[i], arr[i + 1], type); };
  chain(nN, 'highway');
  addEdge(nN[nN.length - 1], nE[0], 'highway', arc(RX1 - RR, RZ0 + RR, -Math.PI / 2, 0));
  chain(nE, 'highway');
  addEdge(nE[nE.length - 1], nS[0], 'highway', arc(RX1 - RR, RZ1 - RR, 0, Math.PI / 2));
  chain(nS, 'coast');
  addEdge(nS[nS.length - 1], nW[0], 'highway', arc(RX0 + RR, RZ1 - RR, Math.PI / 2, Math.PI));
  chain(nW, 'highway');
  addEdge(nW[nW.length - 1], nN[0], 'highway', arc(RX0 + RR, RZ0 + RR, Math.PI, Math.PI * 1.5));
  const ringNorth = nN, ringSouth = nS;

  // ---------- Porto ----------
  const PORT = { x0: GX[10] + 30, x1: 792, z0: 444, z1: 650 };
  const southNodeAt = (i) => ringSouth[1 + (NX - 1 - i)];
  const pA = addNode(GX[11], 600, 'grid'), pB = addNode(GX[13], 600, 'grid');
  const pA2 = addNode(GX[11], 520, 'grid'), pB2 = addNode(GX[13], 520, 'grid');
  addEdge(southNodeAt(11), pA2, 'dock');
  addEdge(pA2, pA, 'dock');
  addEdge(southNodeAt(13), pB2, 'dock');
  addEdge(pB2, pB, 'dock');
  addEdge(pA, pB, 'dock');
  addEdge(pA2, pB2, 'dock');

  // ---------- Estrada da serra ----------
  const baseHill = (x, z) => {
    const n = smoothstep(-650, -900, z);
    const w = smoothstep(985, 1200, Math.abs(x)) * (1 - smoothstep(330, 430, z));
    if (n <= 0 && w <= 0) return 0;
    const f = fbm(x / 260 + 7.3, z / 260 + 2.1, 3);
    const rdg = fbm(x / 80 + 1.7, z / 80 + 9.2, 2);
    return n * (26 + 100 * f + 9 * rdg) + w * (1 - n) * (6 + 44 * f);
  };
  const mA = ringNorth[1 + 1], mB = ringNorth[1 + 5]; // junções em GX[3] e GX[11]
  const xa = mA.x, xb = mB.x;
  const ctrl = [
    [xa, -620], [xa - 15, -715], [xa - 140, -790], [xa - 185, -905], [xa - 70, -965], [xa + 45, -905],
    [xa + 150, -950], [xa + 135, -1075], [xa + 265, -1165], [-25, -1125], [55, -1015], [185, -1060],
    [xb - 150, -1175], [xb - 25, -1115], [xb + 45, -985], [xb + 170, -935], [xb + 150, -815], [xb + 25, -735], [xb, -620],
  ];
  const mpts = [];
  const cr = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.round(segLen / 13));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      mpts.push({ x: cr(p0[0], p1[0], p2[0], p3[0], t), z: cr(p0[1], p1[1], p2[1], p3[1], t) });
    }
  }
  mpts.push({ x: xb, z: -620 });
  // perfil de altura: terreno suavizado ao longo do traçado
  let hs = mpts.map((p) => baseHill(p.x, p.z));
  for (let pass = 0; pass < 6; pass++) {
    const o = hs.slice();
    for (let i = 1; i < hs.length - 1; i++) {
      let s = 0, c = 0;
      for (let k = -4; k <= 4; k++) { const q = clamp(i + k, 0, hs.length - 1); s += o[q]; c++; }
      hs[i] = s / c;
    }
  }
  hs[0] = hs[hs.length - 1] = 0;
  // limita a inclinação (~13%) e suaviza de novo
  const dsOf = (i) => Math.hypot(mpts[i].x - mpts[i - 1].x, mpts[i].z - mpts[i - 1].z);
  for (let i = 1; i < hs.length; i++) hs[i] = Math.min(hs[i], hs[i - 1] + 0.13 * dsOf(i));
  for (let i = hs.length - 2; i >= 0; i--) hs[i] = Math.min(hs[i], hs[i + 1] + 0.13 * dsOf(i + 1));
  for (let pass = 0; pass < 3; pass++) {
    const o = hs.slice();
    for (let i = 1; i < hs.length - 1; i++) hs[i] = (o[i - 1] + o[i] * 2 + o[i + 1]) / 4;
  }
  mpts.forEach((p, i) => { p.y = hs[i]; });
  const mountainEdge = addEdge(mA, mB, 'mountain', mpts);
  // addEdge subdivide: guardamos a polilinha final
  const MP = mountainEdge.pts;
  const mGrid = new Map();
  const MG = 48;
  for (let i = 0; i < MP.length - 1; i++) {
    const a = MP[i], b = MP[i + 1];
    const cx0 = Math.floor((Math.min(a.x, b.x) - 50) / MG), cx1 = Math.floor((Math.max(a.x, b.x) + 50) / MG);
    const cz0 = Math.floor((Math.min(a.z, b.z) - 50) / MG), cz1 = Math.floor((Math.max(a.z, b.z) + 50) / MG);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const k = cx * 4096 + cz;
      let l = mGrid.get(k);
      if (!l) mGrid.set(k, (l = []));
      l.push(i);
    }
  }
  const _sd = { t: 0, x: 0, z: 0 };
  const _mi = { d: 1e9, y: 0 };
  // distância até a estrada da serra e altura da pista no ponto mais próximo
  const mountainInfo = (x, z) => {
    _mi.d = 1e9; _mi.y = 0;
    const l = mGrid.get(Math.floor(x / MG) * 4096 + Math.floor(z / MG));
    if (!l) return _mi;
    let best = 1e12;
    for (let q = 0; q < l.length; q++) {
      const i = l[q], a = MP[i], b = MP[i + 1];
      const d2 = segDist2(x, z, a.x, a.z, b.x, b.z, _sd);
      if (d2 < best) { best = d2; _mi.y = lerp(a.y, b.y, _sd.t); }
    }
    _mi.d = Math.sqrt(best);
    return _mi;
  };

  // ---------- Rampas ----------
  const ramps = [
    { x: -330, z: 468, yaw: Math.PI / 2, len: 11, w: 6, h: 2.4 },
    { x: -60, z: 470, yaw: -Math.PI / 2, len: 11, w: 6, h: 2.4 },
    { x: 210, z: 466, yaw: Math.PI / 2, len: 12, w: 6, h: 2.8 },
    { x: (GX[11] + GX[13]) / 2 - 40, z: 560, yaw: Math.PI / 2, len: 11, w: 6, h: 2.6 },
    { x: PORT.x0 + 40, z: 632, yaw: 0, len: 12, w: 6, h: 2.8 },
    { x: -600, z: -645, yaw: Math.PI / 2, len: 12, w: 6, h: 2.6 },
    { x: 965, z: -100, yaw: 0, len: 12, w: 6, h: 2.6 },
  ];
  for (const r of ramps) { r.s = Math.sin(r.yaw); r.c = Math.cos(r.yaw); }

  const inPort = (x, z) => x > PORT.x0 && x < PORT.x1 && z > PORT.z0 - 4 && z < PORT.z1;

  const groundBase = (x, z) => {
    if (z > 440) {
      if (inPort(x, z)) return 0;
      return -smoothstep(476, 560, z) * 3.2 - smoothstep(560, 800, z) * 6;
    }
    if (z > -636 && x > -966 && x < 966) return 0;
    let h = baseHill(x, z);
    if (z < -600) {
      const m = mountainInfo(x, z);
      if (m.d < 50) {
        // acostamento: cai 1.2 m entre 5 e 9 m do eixo e depois se funde ao morro
        const sh = m.d < 5 ? 0 : m.d < 9 ? ((m.d - 5) / 4) * 1.2 : 1.2;
        h = lerp(m.y - sh, h, smoothstep(20, 50, m.d));
      }
    }
    return h;
  };

  const rampH = (x, z) => {
    let h = 0;
    for (let i = 0; i < ramps.length; i++) {
      const r = ramps[i];
      const dx = x - r.x, dz = z - r.z;
      if (dx * dx + dz * dz > 200) continue;
      const lz = dx * r.s + dz * r.c, lx = dx * r.c - dz * r.s;
      if (lz >= 0 && lz <= r.len && Math.abs(lx) <= r.w / 2) h = Math.max(h, (lz / r.len) * r.h);
    }
    return h;
  };
  const heightAt = (x, z) => groundBase(x, z) + rampH(x, z);

  // ---------- Raio das interseções e semáforos ----------
  for (const n of nodes) {
    let hw = 4;
    for (const id of n.edges) hw = Math.max(hw, edges[id].width / 2);
    n.r = n.edges.length >= 3 ? hw + 3.5 : n.kind === 'ring' ? hw : 2;
    if (n.kind === 'grid' && n.edges.length >= 3) n.signal = ((Math.round(n.x / 100) + Math.round(n.z / 100)) & 1);
    if (n.kind === 'ring' && n.edges.length >= 3) n.signal = -2; // preferencial (via lateral cede passagem)
  }

  // ---------- Índices espaciais ----------
  const SG = 40;
  const segGrid = new Map();
  for (const e of edges) {
    for (let i = 0; i < e.pts.length - 1; i++) {
      const a = e.pts[i], b = e.pts[i + 1];
      const pad = e.width / 2 + 6;
      const cx0 = Math.floor((Math.min(a.x, b.x) - pad) / SG), cx1 = Math.floor((Math.max(a.x, b.x) + pad) / SG);
      const cz0 = Math.floor((Math.min(a.z, b.z) - pad) / SG), cz1 = Math.floor((Math.max(a.z, b.z) + pad) / SG);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const k = cx * 4096 + cz;
        let l = segGrid.get(k);
        if (!l) segGrid.set(k, (l = []));
        l.push(e.id, i);
      }
    }
  }
  const _ne = { edge: null, seg: 0, t: 0, dist: 1e9, x: 0, z: 0, s: 0, dx: 0, dz: 0 };
  // aresta mais próxima (busca local). Retorna objeto reutilizado ou null.
  function nearestEdge(x, z, out) {
    const o = out || _ne;
    const l = segGrid.get(Math.floor(x / SG) * 4096 + Math.floor(z / SG));
    if (!l) return null;
    let best = 1e12;
    for (let q = 0; q < l.length; q += 2) {
      const e = edges[l[q]], i = l[q + 1];
      const a = e.pts[i], b = e.pts[i + 1];
      const d2 = segDist2(x, z, a.x, a.z, b.x, b.z, _sd) - e.width * e.width * 0.2; // favorece vias largas em cruzamentos
      if (d2 < best) {
        best = d2;
        o.edge = e; o.seg = i; o.t = _sd.t; o.x = _sd.x; o.z = _sd.z;
        const sl = e.cum[i + 1] - e.cum[i];
        o.s = e.cum[i] + sl * _sd.t;
        o.dx = (b.x - a.x) / sl; o.dz = (b.z - a.z) / sl;
      }
    }
    if (best > 1e11) return null;
    o.dist = Math.hypot(x - o.x, z - o.z);
    return o;
  }

  // ---------- Quarteirões ----------
  const blocks = [];
  const districtOf = (cx, cz) => {
    if (cz > 300) return cx > GX[10] ? 'porto' : 'orla';
    if (cx > 330) return 'industrial';
    if (Math.abs(cx) < 265 && cz > -270 && cz < 205) return 'centro';
    if (cx < -265) return 'residencial';
    if (cz > 200) return 'orla2';
    return 'misto';
  };
  const done = new Set();
  for (let i = 0; i < NX - 1; i++) {
    for (let j = 0; j < NZ - 1; j++) {
      const m = cellMerged[i][j];
      let i0 = i, j0 = j, i1 = i, j1 = j;
      if (m >= 0) {
        if (done.has(m)) continue;
        done.add(m);
        ({ i0, j0, i1, j1 } = merges[m]);
      }
      const b = {
        x0: GX[i0] + hwX(i0), x1: GX[i1 + 1] - hwX(i1 + 1),
        z0: GZ[j0] + hwZ(j0), z1: GZ[j1 + 1] - hwZ(j1 + 1), merged: m >= 0,
      };
      b.district = districtOf((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      blocks.push(b);
    }
  }
  for (let i = 0; i < NX - 1; i++) {
    const b = { x0: GX[i] + hwX(i), x1: GX[i + 1] - hwX(i + 1), z0: GZ[NZ - 1] + hwZ(NZ - 1), z1: RZ1 - 13 };
    b.district = districtOf((b.x0 + b.x1) / 2, 360);
    blocks.push(b);
  }
  // praças e oficina
  const pickBlock = (pred) => { const c = blocks.filter(pred); return c[Math.floor(rng() * c.length)]; };
  const pk1 = pickBlock((b) => b.district === 'centro' && !b.merged); pk1.district = 'parque';
  const pk2 = pickBlock((b) => b.district === 'residencial' && b.merged) || pickBlock((b) => b.district === 'residencial'); pk2.district = 'parque';
  const pk3 = pickBlock((b) => b.district === 'misto'); pk3.district = 'parque';
  const garageBlock = pickBlock((b) => b.district === 'misto' && !b.merged && Math.abs((b.x0 + b.x1) / 2) < 420 && (b.z0 + b.z1) / 2 < -200);
  garageBlock.district = 'oficina';

  // ---------- Prédios, objetos ----------
  const buildings = [];
  const props = [];
  const boxes = []; // colisores AABB: x0,z0,x1,z1,top
  const circles = []; // colisores circulares: x,z,r
  const addBuilding = (b) => { buildings.push(b); boxes.push([b.x0, b.z0, b.x1, b.z1, b.h]); };
  const addProp = (t, x, z, o) => { const p = Object.assign({ t, x, z, s: 1, r: 0, c: 0 }, o); props.push(p); return p; };
  const tree = (x, z, s) => { addProp('tree', x, z, { s: s || rng.range(0.8, 1.35), r: rng() * 6.28, c: rng() }); circles.push([x, z, 0.45]); };
  const palm = (x, z) => { addProp('palm', x, z, { s: rng.range(0.85, 1.25), r: rng() * 6.28 }); circles.push([x, z, 0.3]); };

  const split = (x0, z0, x1, z1, target, out) => {
    const w = x1 - x0, d = z1 - z0;
    if (w <= target * 1.45 && d <= target * 1.45) { out.push([x0, z0, x1, z1]); return; }
    if (w > d) {
      const m = x0 + w * rng.range(0.42, 0.58);
      split(x0, z0, m, z1, target, out); split(m, z0, x1, z1, target, out);
    } else {
      const m = z0 + d * rng.range(0.42, 0.58);
      split(x0, z0, x1, m, target, out); split(x0, m, x1, z1, target, out);
    }
  };

  for (const b of blocks) {
    const SW = 3.5; // calçada
    const x0 = b.x0 + SW, x1 = b.x1 - SW, z0 = b.z0 + SW, z1 = b.z1 - SW;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const lots = [];
    const D = b.district;
    // postes de luz no meio-fio
    const lampSide = (ax0, az0, ax1, az1) => {
      const len = Math.hypot(ax1 - ax0, az1 - az0);
      const n = Math.max(1, Math.round(len / 38));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const px = lerp(ax0, ax1, t), pz = lerp(az0, az1, t);
        addProp('lamp', px, pz, { r: Math.atan2(cx - px, cz - pz) + Math.PI });
      }
    };
    lampSide(b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z0 + 1);
    lampSide(b.x0 + 1, b.z1 - 1, b.x1 - 1, b.z1 - 1);
    if (b.z1 - b.z0 > 70) { lampSide(b.x0 + 1, b.z0 + 20, b.x0 + 1, b.z1 - 20); lampSide(b.x1 - 1, b.z0 + 20, b.x1 - 1, b.z1 - 20); }

    if (D === 'parque') {
      const n = Math.round(((x1 - x0) * (z1 - z0)) / 190);
      for (let k = 0; k < n; k++) {
        const px = rng.range(x0 + 2, x1 - 2), pz = rng.range(z0 + 2, z1 - 2);
        if (Math.abs(px - cx) < 7 || Math.abs(pz - cz) < 7) continue; // caminhos em cruz
        tree(px, pz);
      }
      addProp('kiosk', cx, cz, { c: rng() });
      boxes.push([cx - 2.5, cz - 2.5, cx + 2.5, cz + 2.5, 4]);
      ramps.push({ x: cx - 5.5, z: cz + 14, yaw: 0, len: 10, w: 5, h: 2, s: 0, c: 1, park: true });
      continue;
    }
    if (D === 'oficina') {
      const bx0 = x0 + 6, bx1 = x1 - 6, bz0 = z0 + 6, bz1 = cz - 4;
      addBuilding({ x0: bx0, z0: bz0, x1: bx1, z1: bz1, h: 9, kind: 'garage', color: 0x2c3a4a, color2: 0xff8a1f, seed: rng(), style: 3 });
      b.garage = { x: cx, z: bz1 + 16 };
      for (let k = 0; k < 6; k++) palm(lerp(x0 + 4, x1 - 4, k / 5), z1 - 4);
      continue;
    }
    if (D === 'centro') {
      split(x0, z0, x1, z1, 40, lots);
      for (const [lx0, lz0, lx1, lz1] of lots) {
        const m = 2;
        const dc = Math.hypot((lx0 + lx1) / 2, (lz0 + lz1) / 2 + 30) / 340;
        const h = Math.round(lerp(120, 34, clamp(dc, 0, 1)) * rng.range(0.55, 1.15));
        const tiers = [];
        if (h > 60 && rng.chance(0.7)) { tiers.push({ inset: rng.range(2.5, 5), from: h * rng.range(0.55, 0.8) }); }
        addBuilding({ x0: lx0 + m, z0: lz0 + m, x1: lx1 - m, z1: lz1 - m, h, kind: 'tower', color: rng.pick(PAL.tower), seed: rng(), style: 1, tiers, lit: rng.range(0.35, 0.75) });
      }
    } else if (D === 'misto' || D === 'orla2') {
      split(x0, z0, x1, z1, 30, lots);
      for (const [lx0, lz0, lx1, lz1] of lots) {
        if (rng.chance(0.08)) { tree((lx0 + lx1) / 2, (lz0 + lz1) / 2); continue; }
        const m = rng.range(1.5, 3.5);
        const h = Math.round(rng.range(11, D === 'orla2' ? 44 : 34));
        addBuilding({ x0: lx0 + m, z0: lz0 + m, x1: lx1 - m, z1: lz1 - m, h, kind: 'mid', color: rng.pick(D === 'orla2' ? PAL.hotel : PAL.mid), seed: rng(), style: 2, lit: rng.range(0.3, 0.6) });
      }
    } else if (D === 'residencial') {
      split(x0, z0, x1, z1, 17, lots);
      for (const [lx0, lz0, lx1, lz1] of lots) {
        const w = lx1 - lx0, d = lz1 - lz0;
        if (w < 9 || d < 9) continue;
        const m = rng.range(2.5, 4.2);
        const ridgeX = w > d;
        addBuilding({
          x0: lx0 + m, z0: lz0 + m, x1: lx1 - m, z1: lz1 - m, h: rng.chance(0.3) ? 6.4 : 3.6, kind: 'house',
          color: rng.pick(PAL.house), color2: rng.pick(PAL.roof), seed: rng(), style: 4, ridgeX, lit: rng.range(0.4, 0.8),
        });
        if (rng.chance(0.55)) tree(lx0 + 1.4 + rng() * 0.6, lz0 + 1.4 + rng() * 0.6, rng.range(0.7, 1.05));
      }
    } else if (D === 'industrial') {
      split(x0, z0, x1, z1, 52, lots);
      for (const [lx0, lz0, lx1, lz1] of lots) {
        const m = rng.range(4, 7);
        const kind = rng();
        if (kind < 0.62) {
          addBuilding({ x0: lx0 + m, z0: lz0 + m, x1: lx1 - m, z1: lz1 - m, h: rng.range(8, 15), kind: 'warehouse', color: rng.pick(PAL.ind), color2: 0x6d747b, seed: rng(), style: 3, saw: rng.chance(0.5), lit: 0.25 });
        } else if (kind < 0.82) {
          const r = Math.min(lx1 - lx0, lz1 - lz0) / 2 - m - 1;
          const n = r > 9 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const tx = (lx0 + lx1) / 2 + (n > 1 ? (k - 0.5) * r * 1.1 : 0), tz = (lz0 + lz1) / 2, tr = n > 1 ? r * 0.5 : Math.min(r, 9);
            addProp('tank', tx, tz, { s: tr, c: rng() });
            circles.push([tx, tz, tr]);
          }
        } else {
          containerYard(lx0 + m, lz0 + m, lx1 - m, lz1 - m);
        }
      }
    } else if (D === 'orla') {
      split(x0, z0, x1, z1 - 14, 34, lots);
      for (const [lx0, lz0, lx1, lz1] of lots) {
        const m = rng.range(2, 4);
        addBuilding({ x0: lx0 + m, z0: lz0 + m, x1: lx1 - m, z1: lz1 - m, h: Math.round(rng.range(18, 52)), kind: 'hotel', color: rng.pick(PAL.hotel), seed: rng(), style: 2, lit: rng.range(0.45, 0.8) });
      }
      for (let px = x0 + 4; px < x1 - 2; px += 13) palm(px, z1 - 5 + rng.range(-1.5, 1.5));
    } else if (D === 'porto') {
      split(x0, z0, x1, z1, 50, lots);
      for (const [lx0, lz0, lx1, lz1] of lots) {
        const m = 5;
        if (rng.chance(0.6)) addBuilding({ x0: lx0 + m, z0: lz0 + m, x1: lx1 - m, z1: lz1 - m, h: rng.range(9, 14), kind: 'warehouse', color: rng.pick(PAL.ind), color2: 0x6d747b, seed: rng(), style: 3, saw: rng.chance(0.4), lit: 0.25 });
        else containerYard(lx0 + m, lz0 + m, lx1 - m, lz1 - m);
      }
    }
  }

  function containerYard(x0, z0, x1, z1) {
    const alongX = x1 - x0 > z1 - z0;
    const L = 12.2, W = 2.5, H = 2.6;
    if (alongX) {
      for (let z = z0 + 2; z + W < z1; z += W + (rng.chance(0.3) ? 6 : 0.4)) {
        for (let x = x0; x + L < x1; x += L + 0.6) {
          if (rng.chance(0.22)) continue;
          const st = rng.int(1, 3);
          addProp('cont', x + L / 2, z + W / 2, { s: st, r: 0, c: rng() });
          boxes.push([x, z, x + L, z + W, st * H]);
        }
      }
    } else {
      for (let x = x0 + 2; x + W < x1; x += W + (rng.chance(0.3) ? 6 : 0.4)) {
        for (let z = z0; z + L < z1; z += L + 0.6) {
          if (rng.chance(0.22)) continue;
          const st = rng.int(1, 3);
          addProp('cont', x + W / 2, z + L / 2, { s: st, r: Math.PI / 2, c: rng() });
          boxes.push([x, z, x + W, z + L, st * H]);
        }
      }
    }
  }

  // pátio do porto (plataforma ao sul da via costeira)
  {
    const xa2 = GX[11] + 12, xb2 = GX[13] - 12;
    containerYard(xa2 + 6, 446 + 8, xb2 - 6, 520 - 12);
    containerYard(xa2 + 6, 520 + 12, xb2 - 60, 600 - 10);
    containerYard(PORT.x0 + 10, 470, GX[11] - 14, 600);
    containerYard(GX[13] + 14, 460, PORT.x1 - 12, 610);
    for (const x of [GX[11] + 50, (GX[11] + GX[13]) / 2 + 20, GX[13] - 20]) {
      addProp('crane', x, 632, { c: rng() });
      boxes.push([x - 9, 624, x - 7, 640, 30]);
      boxes.push([x + 7, 624, x + 9, 640, 30]);
    }
    addProp('lighthouse', PORT.x0 + 14, 636, {});
    circles.push([PORT.x0 + 14, 636, 4]);
  }

  // praia: quiosques, guarda-sóis e coqueiros
  for (let x = -900; x < PORT.x0 - 20; x += 22) {
    if (rng.chance(0.75)) palm(x + rng.range(-4, 4), 449 + rng.range(0, 3));
    const n = rng.int(0, 2);
    for (let k = 0; k < n; k++) addProp('umbrella', x + rng.range(-9, 9), rng.range(458, 474), { c: rng(), r: rng() * 6 });
    if (rng.chance(0.07)) {
      const kx = x + 6;
      addProp('kiosk', kx, 456, { c: rng() });
      boxes.push([kx - 2.5, 453.5, kx + 2.5, 458.5, 4]);
    }
  }
  // remove guarda-sóis sobre rampas
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];
    if (p.t !== 'umbrella') continue;
    for (const r of ramps) if (Math.hypot(p.x - r.x, p.z - r.z) < 16) { props.splice(i, 1); break; }
  }

  // iluminação do anel e canteiros
  for (const e of edges) {
    if (e.type !== 'highway' && e.type !== 'coast' && e.type !== 'mountain' && e.type !== 'dock') continue;
    const step = e.type === 'mountain' ? 24 : 46;
    for (let s = step / 2; s < e.len; s += step) {
      const P = pointOnEdge(e, s);
      const off = e.width / 2 + (e.type === 'mountain' ? 1.2 : 2);
      if (e.type === 'mountain') {
        addProp('post', P.x + P.nx * off, P.z + P.nz * off, { y: P.y });
        addProp('post', P.x - P.nx * off, P.z - P.nz * off, { y: P.y });
        if (((s / step) | 0) % 3 === 0) addProp('lamp', P.x + P.nx * (off + 0.6), P.z + P.nz * (off + 0.6), { r: Math.atan2(-P.nx, -P.nz), y: P.y });
      } else {
        const side = e.type === 'coast' ? -1 : 1;
        // lado externo do anel
        const ox = P.x + P.nx * off * side, oz = P.z + P.nz * off * side;
        const cxr = Math.abs(ox) > Math.abs(P.x) || Math.abs(oz) > Math.abs(P.z) ? side : -side;
        const lx = P.x + P.nx * off * cxr, lz = P.z + P.nz * off * cxr;
        addProp('lamp', lx, lz, { r: Math.atan2(P.x - lx, P.z - lz), big: 1 });
      }
    }
  }

  // vegetação fora da malha (dentro do anel) e nas serras
  const nearRoad = (x, z, pad) => {
    const ne = nearestEdge(x, z);
    return ne && ne.dist < ne.edge.width / 2 + pad;
  };
  for (let x = WORLD.x0 + 20; x < WORLD.x1 - 20; x += 23) {
    for (let z = WORLD.z0 + 20; z < 436; z += 23) {
      const jx = x + (hash2(x, z) - 0.5) * 18, jz = z + (hash2(z + 99, x - 7) - 0.5) * 18;
      const insideGrid = jx > GX[0] - 10 && jx < GX[NX - 1] + 10 && jz > GZ[0] - 10 && jz < RZ1;
      if (insideGrid) continue;
      const dens = fbm(jx / 140 + 3, jz / 140 + 5, 2);
      const insideRing = jz > -636 && Math.abs(jx) < 966;
      if (dens < (insideRing ? 0.52 : 0.42)) continue;
      if (nearRoad(jx, jz, insideRing ? 5 : 4.5)) continue;
      const h = groundBase(jx, jz);
      if (h > 120) continue;
      addProp('tree', jx, jz, { s: rng.range(0.9, 1.7), r: rng() * 6.28, c: rng(), y: h, pine: h > 55 ? 1 : 0 });
      circles.push([jx, jz, 0.45]);
    }
  }
  // torre de rádio no ponto mais alto da serra
  {
    let bi = 0;
    for (let i = 0; i < MP.length; i++) if (MP[i].y > MP[bi].y) bi = i;
    const P = MP[bi], Q = MP[Math.min(MP.length - 1, bi + 1)];
    const dx = Q.x - P.x, dz = Q.z - P.z, l = Math.hypot(dx, dz) || 1;
    const tx = P.x + (dz / l) * 22, tz = P.z - (dx / l) * 22;
    addProp('tower', tx, tz, { y: groundBase(tx, tz) });
    circles.push([tx, tz, 2.5]);
  }

  function nearestNode(x, z, filter) {
    let best = null, bd = 1e12;
    for (const n of nodes) {
      if (filter && !filter(n)) continue;
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // ponto, tangente e normal (direita no sentido a->b) a uma distância s na aresta
  function pointOnEdge(e, s, out) {
    const o = out || {};
    s = clamp(s, 0, e.len);
    let i = 0;
    const cum = e.cum;
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const a = e.pts[i], b = e.pts[i + 1];
    const sl = cum[i + 1] - cum[i] || 1;
    const t = (s - cum[i]) / sl;
    o.x = lerp(a.x, b.x, t); o.z = lerp(a.z, b.z, t); o.y = lerp(a.y || 0, b.y || 0, t);
    o.dx = (b.x - a.x) / sl; o.dz = (b.z - a.z) / sl;
    o.nx = -o.dz; o.nz = o.dx; // direita de quem vai de a para b
    return o;
  }

  const CG = 32;
  const colGrid = new Map();
  const cell = (cx, cz) => { const k = cx * 4096 + cz; let c = colGrid.get(k); if (!c) colGrid.set(k, (c = { b: [], c: [] })); return c; };
  boxes.forEach((b, i) => {
    for (let cx = Math.floor(b[0] / CG); cx <= Math.floor(b[2] / CG); cx++)
      for (let cz = Math.floor(b[1] / CG); cz <= Math.floor(b[3] / CG); cz++) cell(cx, cz).b.push(i);
  });
  circles.forEach((c, i) => {
    for (let cx = Math.floor((c[0] - c[2]) / CG); cx <= Math.floor((c[0] + c[2]) / CG); cx++)
      for (let cz = Math.floor((c[1] - c[2]) / CG); cz <= Math.floor((c[1] + c[2]) / CG); cz++) cell(cx, cz).c.push(i);
  });
  const colCell = (x, z) => colGrid.get(Math.floor(x / CG) * 4096 + Math.floor(z / CG));
  const colGet = (ix, iz) => colGrid.get(ix * 4096 + iz);

  // linha de visão 2D contra prédios (para a polícia)
  function lineOfSight(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 9);
    for (let k = 1; k < n; k++) {
      const t = k / n, x = lerp(ax, bx, t), z = lerp(az, bz, t);
      const c = colCell(x, z);
      if (!c) continue;
      for (let q = 0; q < c.b.length; q++) {
        const b = boxes[c.b[q]];
        if (b[4] > 5 && x > b[0] && x < b[2] && z > b[1] && z < b[3]) return false;
      }
    }
    return true;
  }

  // tipo de piso: 0 pista, 1 calçada/pátio, 2 grama/terra, 3 areia, 4 água
  const _se = {};
  function surfaceAt(x, z, y) {
    if (y < WATER_Y - 0.25) return 4;
    const ne = nearestEdge(x, z, _se);
    if (ne && ne.dist < ne.edge.width / 2 + 0.8) return 0;
    if (z > 440) return inPort(x, z) ? 1 : 3;
    if (x > GX[0] - 6 && x < GX[NX - 1] + 6 && z > GZ[0] - 6 && z < RZ1) {
      return 1;
    }
    return 2;
  }

  // ---------- Rotas (Dijkstra sobre arestas direcionadas, com custo de curva) ----------
  const edgeDir = (e, dir, atEnd) => {
    // vetor de direção no início (atEnd=false) ou fim (atEnd=true) do percurso
    const p = e.pts, n = p.length;
    let a, b;
    if (dir === 0) { a = atEnd ? p[n - 2] : p[0]; b = atEnd ? p[n - 1] : p[1]; }
    else { a = atEnd ? p[1] : p[n - 1]; b = atEnd ? p[0] : p[n - 2]; }
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return [(b.x - a.x) / l, (b.z - a.z) / l];
  };
  const COSTF = { street: 1, avenue: 0.85, highway: 0.6, coast: 0.65, mountain: 1.1, dock: 1.2 };

  function findRoute(fromId, toId, opt) {
    if (fromId === toId) return null;
    const fast = !opt || opt.fast !== false;
    const N = edges.length * 2;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const heap = [];
    const push = (d, k) => {
      heap.push([d, k]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    const cost = (e) => e.len * (fast ? COSTF[e.type] : 1);
    const avoid = opt && opt.avoidEdge != null ? opt.avoidEdge : -1;
    for (const id of nodes[fromId].edges) {
      if (id === avoid) continue;
      const e = edges[id];
      const k = id * 2 + (e.a === fromId ? 0 : 1);
      if (opt && opt.startDir) {
        const d = edgeDir(e, k & 1, false);
        if (d[0] * opt.startDir[0] + d[1] * opt.startDir[1] < -0.3) { dist[k] = cost(e) + 400; push(dist[k], k); continue; }
      }
      dist[k] = cost(e);
      push(dist[k], k);
    }
    let endK = -1;
    while (heap.length) {
      const [d, k] = pop();
      if (d > dist[k]) continue;
      const e = edges[k >> 1], dir = k & 1;
      const at = dir === 0 ? e.b : e.a;
      if (at === toId) { endK = k; break; }
      const d0 = edgeDir(e, dir, true);
      for (const id of nodes[at].edges) {
        if (id === e.id) continue;
        const e2 = edges[id];
        const k2 = id * 2 + (e2.a === at ? 0 : 1);
        const d1 = edgeDir(e2, k2 & 1, false);
        const dot = d0[0] * d1[0] + d0[1] * d1[1];
        const nd = d + cost(e2) + (dot < 0.85 ? 30 : 0);
        if (nd < dist[k2]) { dist[k2] = nd; prev[k2] = k; push(nd, k2); }
      }
    }
    if (endK < 0) return null;
    const seq = [];
    for (let k = endK; k >= 0; k = prev[k]) seq.push(k);
    seq.reverse();
    return seq; // lista de arestas direcionadas (id*2+dir)
  }

  // converte rota em polilinha [{x,z,y}]
  function routePoints(seq) {
    const out = [];
    for (const k of seq) {
      const e = edges[k >> 1];
      const p = e.pts;
      if (k & 1) { for (let i = p.length - 1; i >= 0; i--) if (!(out.length && i === p.length - 1)) out.push(p[i]); }
      else { for (let i = 0; i < p.length; i++) if (!(out.length && i === 0)) out.push(p[i]); }
    }
    return out;
  }

  // ---------- Agrupamento por chunk ----------
  const chunks = new Map();
  const ck = (cx, cz) => cx * 4096 + cz;
  const chunkAt = (x, z) => {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const k = ck(cx, cz);
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = { cx, cz, blocks: [], buildings: [], props: [], segs: [], nodes: [], ramps: [] }));
    return c;
  };
  for (const b of blocks) chunkAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2).blocks.push(b);
  for (const b of buildings) chunkAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2).buildings.push(b);
  for (const p of props) chunkAt(p.x, p.z).props.push(p);
  for (const n of nodes) chunkAt(n.x, n.z).nodes.push(n);
  for (const r of ramps) chunkAt(r.x, r.z).ramps.push(r);
  for (const e of edges) for (let i = 0; i < e.pts.length - 1; i++) {
    const a = e.pts[i], b = e.pts[i + 1];
    chunkAt((a.x + b.x) / 2, (a.z + b.z) / 2).segs.push([e, i]);
  }

  const garage = garageBlock.garage;

  return {
    nodes, edges, blocks, buildings, props, ramps, boxes, circles, chunks, GX, GZ, NX, NZ, AV_I, AV_J, PORT, garage,
    mountainEdge, hwX, hwZ,
    heightAt, groundBase, baseHill, mountainInfo, nearestEdge, nearestNode, pointOnEdge, colCell, colGet, lineOfSight, surfaceAt,
    findRoute, routePoints, inPort, edgeDir,
    chunkKey: ck,
  };
}
