// Plugin Vite: gera os ícones PNG em código (sem arquivos de imagem no repositório),
// o manifest e um service worker que pré-carrega todos os arquivos do build.
import zlib from 'node:zlib';
import crypto from 'node:crypto';

// ---------- PNG mínimo ----------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Desenho do ícone: pôr do sol âmbar, skyline e pista ----------
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function iconColor(u, v, pad) {
  // u,v em [0,1]; pad = margem segura (ícone maskable)
  const x = (u - 0.5) / (1 - pad * 2) + 0.5, y = (v - 0.5) / (1 - pad * 2) + 0.5;
  const top = [0x2a, 0x16, 0x4a], mid = [0xe8, 0x5a, 0x2c], low = [0xff, 0xb8, 0x3d];
  let c = y < 0.45 ? mixc(top, mid, ss(0, 0.45, y)) : mixc(mid, low, ss(0.45, 0.62, y));
  // sol
  const sd = Math.hypot(x - 0.5, y - 0.56);
  if (sd < 0.2) c = mixc(c, [0xff, 0xe9, 0xa8], 1 - ss(0.17, 0.2, sd));
  else c = mixc(c, [0xff, 0xd0, 0x70], 0.35 * (1 - ss(0.2, 0.42, sd)));
  // skyline
  const heights = [0.1, 0.17, 0.12, 0.24, 0.15, 0.3, 0.2, 0.26, 0.13, 0.21, 0.11, 0.16];
  const bi = Math.floor(x * heights.length);
  const bh = heights[Math.max(0, Math.min(heights.length - 1, bi))];
  const horizon = 0.62;
  if (y > horizon - bh && y <= horizon && x >= 0 && x <= 1) {
    c = [0x1a, 0x12, 0x30];
    const wx = (x * heights.length) % 1, wy = ((horizon - y) * 30) % 1;
    if (wx > 0.25 && wx < 0.75 && wy > 0.3 && wy < 0.7 && ((bi * 7 + Math.floor((horizon - y) * 30) * 3) % 5 < 2)) c = [0xff, 0xc8, 0x60];
  }
  if (y > horizon) {
    // chão e pista em perspectiva
    const d = (y - horizon) / (1 - horizon);
    c = mixc([0x24, 0x1a, 0x36], [0x12, 0x10, 0x1c], d);
    const half = 0.04 + d * 0.42;
    const rx = Math.abs(x - 0.5);
    if (rx < half) {
      c = mixc([0x3a, 0x36, 0x48], [0x22, 0x20, 0x2c], d);
      const dash = Math.pow(d, 0.55) * 7;
      if (rx < 0.008 + d * 0.03 && dash % 1 < 0.55) c = [0xff, 0xc2, 0x3a];
      if (rx > half * 0.9) c = [0xf4, 0xf0, 0xe6];
    }
  }
  return c;
}
function makeIcon(size, pad) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 3;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const c = iconColor((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size, pad);
      r += c[0]; g += c[1]; b += c[2];
    }
    const i = (py * size + px) * 4;
    buf[i] = r / (S * S); buf[i + 1] = g / (S * S); buf[i + 2] = b / (S * S); buf[i + 3] = 255;
  }
  return encodePNG(size, buf);
}

const ICONS = [
  { file: 'icons/icon-192.png', size: 192, pad: 0 },
  { file: 'icons/icon-512.png', size: 512, pad: 0 },
  { file: 'icons/icon-maskable-512.png', size: 512, pad: 0.1 },
  { file: 'icons/apple-touch-icon.png', size: 180, pad: 0 },
];

const manifest = () => JSON.stringify({
  name: 'Rota Âmbar — Corridas de Rua',
  short_name: 'Rota Âmbar',
  description: 'Corridas de rua em mundo aberto, 3D, 100% offline.',
  lang: 'pt-BR',
  start_url: './',
  scope: './',
  display: 'fullscreen',
  display_override: ['fullscreen', 'standalone'],
  orientation: 'landscape',
  background_color: '#0b0f17',
  theme_color: '#0b0f17',
  categories: ['games'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2);

const swSource = (version, assets) => `// Service worker gerado no build: guarda tudo em cache na primeira visita.
const CACHE = 'rota-ambar-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('rota-ambar-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html', { ignoreVary: true }) : Response.error()));
    })
  );
});
`;

export function pwaPlugin() {
  let cache = null;
  const icons = () => cache || (cache = ICONS.map((i) => ({ file: i.file, data: makeIcon(i.size, i.pad) })));
  return {
    name: 'rota-ambar-pwa',
    enforce: 'post',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const ic = icons().find((i) => url === '/' + i.file);
        if (ic) { res.setHeader('Content-Type', 'image/png'); res.end(ic.data); return; }
        if (url === '/manifest.webmanifest') { res.setHeader('Content-Type', 'application/manifest+json'); res.end(manifest()); return; }
        next();
      });
    },
    generateBundle(_, bundle) {
      for (const ic of icons()) this.emitFile({ type: 'asset', fileName: ic.file, source: ic.data });
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() });
      const files = new Set(['./', './index.html', './manifest.webmanifest']);
      for (const name of Object.keys(bundle)) if (!name.endsWith('.map')) files.add('./' + name);
      for (const ic of ICONS) files.add('./' + ic.file);
      const list = [...files].sort();
      const h = crypto.createHash('sha1');
      for (const name of Object.keys(bundle).sort()) {
        const f = bundle[name];
        h.update(name);
        h.update(f.type === 'chunk' ? f.code : typeof f.source === 'string' ? f.source : Buffer.from(f.source));
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(h.digest('hex').slice(0, 10), list) });
    },
  };
}
