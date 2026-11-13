// Minimapa circular (canto superior esquerdo) e desenho vetorial do mapa (reutilizado no mapa em tela cheia).
import { WORLD, RING } from '../world/map.js';
import { damp } from '../core/util.js';

// desenha o mundo em unidades de mundo (ctx já transformado). minW = largura mínima das vias em metros.
export function drawWorld(ctx, map, minW, detail) {
  const W = WORLD;
  ctx.fillStyle = '#1b3550';
  ctx.fillRect(W.x0 - 400, W.z0 - 400, W.x1 - W.x0 + 800, W.z1 - W.z0 + 800);
  ctx.fillStyle = '#2f4034';
  ctx.fillRect(W.x0 - 400, W.z0 - 400, W.x1 - W.x0 + 800, 446 - W.z0 + 400);
  ctx.fillStyle = '#3a5a3c';
  ctx.fillRect(W.x0 - 400, W.z0 - 400, W.x1 - W.x0 + 800, -650 - W.z0 + 400);
  ctx.fillStyle = '#cdb98a';
  ctx.fillRect(W.x0 - 400, 446, W.x1 - W.x0 + 800, 60);
  const P = map.PORT;
  ctx.fillStyle = '#5a5f66';
  ctx.fillRect(P.x0, P.z0, P.x1 - P.x0, P.z1 - P.z0);
  // quarteirões
  const DC = { centro: '#46505d', misto: '#4a4f52', residencial: '#445a48', industrial: '#4d4a44', orla: '#5b5648', orla2: '#555049', porto: '#4d4a44', parque: '#3f7a45', oficina: '#7a5a2a' };
  for (const b of map.blocks) {
    ctx.fillStyle = DC[b.district] || '#444';
    ctx.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  }
  if (detail) {
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    for (const b of map.buildings) ctx.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pass = (types, color, mul) => {
    ctx.strokeStyle = color;
    for (const e of map.edges) {
      if (!types.includes(e.type)) continue;
      ctx.lineWidth = Math.max(minW * mul, e.width);
      ctx.beginPath();
      const p = e.pts;
      ctx.moveTo(p[0].x, p[0].z);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].z);
      ctx.stroke();
    }
  };
  pass(['street', 'dock'], '#8b939d', 1);
  pass(['mountain'], '#b9a27a', 1.1);
  pass(['avenue'], '#aab2bc', 1.35);
  pass(['highway', 'coast'], '#d2c08a', 1.7);
}

export class Minimap {
  constructor(canvas, map) {
    this.cv = canvas; this.map = map;
    this.size = 112;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(this.size * this.dpr);
    this.ctx = canvas.getContext('2d');
    // mapa base pré-renderizado
    const S = (this.S = 0.4);
    const off = (this.off = document.createElement('canvas'));
    off.width = Math.round((WORLD.x1 - WORLD.x0) * S); off.height = Math.round((WORLD.z1 - WORLD.z0) * S);
    const c = off.getContext('2d');
    c.scale(S, S); c.translate(-WORLD.x0, -WORLD.z0);
    drawWorld(c, map, 7, false);
    this.range = 170;
    this.frame = 0;
  }

  render(g) {
    if (this.frame++ % 3) return;
    const ctx = this.ctx, R = (this.size / 2) * this.dpr, p = g.chaseTarget();
    this.range = damp(this.range, 150 + Math.min(p.speed, 70) * 1.7, 2, 0.05);
    const z = R / this.range;
    const a = p.yaw - Math.PI;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, R * 2, R * 2);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#1b3550'; ctx.fillRect(0, 0, R * 2, R * 2);
    ctx.translate(R, R * 1.18); // jogador um pouco abaixo do centro: mais visão à frente
    ctx.rotate(a);
    ctx.scale(z, z);
    ctx.translate(-p.x, -p.z);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.off, WORLD.x0, WORLD.z0, WORLD.x1 - WORLD.x0, WORLD.z1 - WORLD.z0);
    // rota até o próximo checkpoint / destino
    const rt = g.routePts;
    if (rt && rt.length > 1) {
      ctx.strokeStyle = g.race ? '#ffcf4a' : '#c56bff';
      ctx.lineWidth = 4.2 * this.dpr / z; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(rt[0].x, rt[0].z);
      for (let i = 1; i < rt.length; i++) ctx.lineTo(rt[i].x, rt[i].z);
      ctx.stroke();
    }
    const dot = (x, zz, r, col, ring) => {
      // prende na borda quando fora do alcance
      let dx = x - p.x, dz = zz - p.z;
      const d = Math.hypot(dx, dz), lim = this.range * 0.8;
      if (ring && d > lim) { dx *= lim / d; dz *= lim / d; }
      ctx.beginPath(); ctx.arc(p.x + dx, p.z + dz, (r * this.dpr) / z, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      if (ring) { ctx.lineWidth = (1.5 * this.dpr) / z; ctx.strokeStyle = '#000'; ctx.stroke(); }
    };
    for (const b of g.blips) dot(b.x, b.z, b.r || 3.2, b.c, b.pin);
    ctx.restore();
    // seta do jogador
    const cx = R, cy = R * 1.18, s = 6.5 * this.dpr;
    ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.72, cy + s * 0.8); ctx.lineTo(cx, cy + s * 0.35); ctx.lineTo(cx - s * 0.72, cy + s * 0.8); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5 * this.dpr; ctx.stroke(); ctx.fill();
    // norte
    const nx = R + Math.sin(a) * (R - 9 * this.dpr), ny = R - Math.cos(a) * (R - 9 * this.dpr);
    ctx.font = `bold ${10 * this.dpr}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(nx, ny, 7 * this.dpr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff6a4a'; ctx.fillText('N', nx, ny + 0.5);
  }
}
