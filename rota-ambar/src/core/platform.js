// Recursos do aparelho: wake lock, tela cheia/orientação, vibração, bloqueios de gestos.
let wake = null;
export async function requestWake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch (e) { /* sem suporte ou negado */ }
}
export function releaseWake() { try { if (wake) wake.release(); } catch (e) { /* ignore */ } wake = null; }

// tenta tela cheia + trava em paisagem (Android/Chrome). No iOS a trava vem do manifest quando instalado.
export async function lockLandscape() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (!coarse) return;
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
  } catch (e) { /* ignore */ }
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) { /* ignore */ }
}

export function vibrate(pattern, enabled) {
  if (!enabled) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ }
}

export function isPortrait() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  return innerHeight > innerWidth && (coarse || innerWidth < 700);
}

// bloqueia zoom, pull-to-refresh, seleção e menu de contexto
export function blockGestures() {
  const stop = (e) => e.preventDefault();
  document.addEventListener('contextmenu', stop);
  document.addEventListener('selectstart', stop);
  document.addEventListener('dragstart', stop);
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, stop, { passive: false }));
  document.addEventListener('touchmove', (e) => {
    // permite rolagem apenas dentro de listas marcadas com .scroll
    let el = e.target;
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('scroll') && el.scrollHeight > el.clientHeight && e.touches.length === 1) return;
      if (el.tagName === 'INPUT') return;
      el = el.parentNode;
    }
    e.preventDefault();
  }, { passive: false });
  let last = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - last < 320 && !(e.target.closest && e.target.closest('button,.btn,.tb,input'))) e.preventDefault(); // zoom por toque duplo
    last = now;
  }, { passive: false });
  document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); });
}
