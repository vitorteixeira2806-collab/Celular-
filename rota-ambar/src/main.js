import './style.css';
import { Game } from './game/game.js';
import './game/modes.js';
import { blockGestures } from './core/platform.js';

blockGestures();
const $ = (id) => document.getElementById(id);
const game = new Game({ canvas: $('c'), hud: $('hud'), touch: $('touch'), ui: $('ui') });
window.__game = game; // gancho de depuração/testes
game.setState('roam');
addEventListener('pointerdown', () => game.firstGesture(), { once: true });
game.start();
