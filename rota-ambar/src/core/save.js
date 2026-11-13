// Progresso e opções em localStorage.
const KEY = 'rota-ambar-v1';
const GHOST = 'rota-ambar-ghost-';

const DEFAULTS = () => ({
  money: 1500,
  car: 'faisca',
  owned: { faisca: { engine: 0, tires: 0, nitro: 0, color: 0xf2b632 } },
  best: {}, // id do evento -> { race: tempo, tt: tempo, pos: melhor posição }
  stats: { races: 0, wins: 0, escapes: 0 },
  options: {
    control: 'buttons', autoGas: false, assist: true, tiltInvert: false,
    btnSize: 1, btnOpacity: 0.55, vibrate: true, shake: true,
    traffic: 2, quality: 'auto', battery: false, shadows: false,
    volMaster: 0.8, volMusic: 0.55, volSfx: 0.9, mute: false, station: 0, radioOn: true,
  },
});

export function loadSave() {
  const d = DEFAULTS();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      Object.assign(d, s, { options: Object.assign(d.options, s.options || {}), stats: Object.assign(d.stats, s.stats || {}) });
      if (!d.owned[d.car]) d.car = Object.keys(d.owned)[0] || 'faisca';
    }
  } catch (e) { /* save corrompido: usa padrão */ }
  return d;
}

let timer = 0;
export function persist(save, now) {
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* sem espaço */ } };
  if (now) { clearTimeout(timer); write(); return; }
  clearTimeout(timer);
  timer = setTimeout(write, 300);
}

export function resetSave() {
  try {
    localStorage.removeItem(KEY);
    Object.keys(localStorage).filter((k) => k.startsWith(GHOST)).forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* ignore */ }
}

export function loadGhost(id) {
  try { const r = localStorage.getItem(GHOST + id); return r ? JSON.parse(r) : null; } catch (e) { return null; }
}
export function saveGhost(id, data) {
  try { localStorage.setItem(GHOST + id, JSON.stringify(data)); } catch (e) { /* ignore */ }
}
