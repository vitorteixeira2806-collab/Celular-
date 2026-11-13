import './style.css';
import { Game } from './game/game.js';
import './game/modes.js';
import './game/meta.js';
import { UI } from './ui/menus.js';
import { blockGestures } from './core/platform.js';

blockGestures();
const $ = (id) => document.getElementById(id);
const game = new Game({ canvas: $('c'), hud: $('hud'), touch: $('touch'), ui: $('ui') });
const ui = new UI($('ui'), game);
game.ui = ui;
window.__game = game; // gancho de depuração/testes
ui.showTitle();
game.applyOptions('all');
addEventListener('pointerdown', () => game.firstGesture(), { once: true });
game.start();

// PWA: registra o service worker (somente no build de produção)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
