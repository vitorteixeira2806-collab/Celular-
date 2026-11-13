// Os 8 eventos de corrida de rua (circuitos e ponto a ponto) e os desafios de fuga.
import { buildDrivePath, parTime } from './path.js';
import { CARS } from '../vehicles/cars.js';

// way: pontos (x,z) aproximados; a rota segue as vias entre eles.
const DEFS = (m) => {
  const X = m.GX, Z = m.GZ, R = { x0: -940, x1: 940, z0: -620, z1: 430 };
  return [
    { id: 'centro', name: 'Circuito do Centro', kind: 'circuit', laps: 2, tier: 0, prize: 800, shift: 9,
      desc: 'Quadras fechadas entre os arranha-céus.',
      way: [[X[7], Z[2]], [X[9], Z[2]], [X[9], Z[6]], [X[5], Z[6]], [X[5], Z[2]]] },
    { id: 'orla', name: 'Volta da Orla', kind: 'circuit', laps: 2, tier: 0, prize: 1000, shift: 12,
      desc: 'Via costeira, coqueiros e retorno pelas ruas dos hotéis.',
      way: [[X[6], R.z1], [X[10], R.z1], [X[10], Z[6]], [X[2], Z[6]], [X[2], R.z1]] },
    { id: 'travessia', name: 'Travessia Leste', kind: 'sprint', laps: 1, tier: 1, prize: 1500,
      desc: 'Do bairro residencial até as docas, costurando o centro.',
      way: [[X[0], Z[1]], [X[4], Z[1]], [X[4], Z[6]], [X[9], Z[6]], [X[9], Z[2]], [X[14], Z[2]], [X[14], R.z1], [X[13], R.z1], [X[13], 600], [X[11], 600], [X[11], 520]] },
    { id: 'anel', name: 'Anel Viário', kind: 'circuit', laps: 1, tier: 1, prize: 1800, shift: 14,
      desc: 'Uma volta completa na rodovia que contorna a baía.',
      way: [[X[7], R.z0], [800, R.z0], [R.x1, -480], [R.x1, Z[3]], [R.x1, 290], [800, R.z1], [X[7], R.z1], [-800, R.z1], [R.x0, 290], [R.x0, Z[3]], [R.x0, -480], [-800, R.z0]] },
    { id: 'serra', name: 'Subida da Serra', kind: 'sprint', laps: 1, tier: 1, prize: 2200,
      desc: 'Curvas fechadas morro acima e descida até a rodovia.',
      way: [[X[7], R.z0], [X[3], R.z0], 'M', [800, R.z0], [R.x1, -480], [R.x1, Z[1]]] },
    { id: 'docas', name: 'Docas', kind: 'circuit', laps: 2, tier: 2, prize: 2800, shift: 10,
      desc: 'Galpões, contêineres e o cais do porto.',
      way: [[X[12], Z[3]], [X[14], Z[3]], [X[14], R.z1], [X[13], R.z1], [X[13], 600], [X[11], 600], [X[11], R.z1], [X[10], R.z1], [X[10], Z[3]]] },
    { id: 'serramar', name: 'Serra e Mar', kind: 'sprint', laps: 1, tier: 2, prize: 3500,
      desc: 'Do porto pela orla, rodovia oeste e travessia da serra.',
      way: [[X[11], 520], [X[11], R.z1], [X[4], R.z1], [-800, R.z1], [R.x0, 290], [R.x0, Z[4]], [R.x0, -480], [-800, R.z0], [X[3], R.z0], 'M'] },
    { id: 'gp', name: 'Grande Prêmio de Âmbar', kind: 'circuit', laps: 2, tier: 3, prize: 5000, shift: 8,
      desc: 'O circuito completo: avenida, rodovia, orla e centro.',
      way: [[X[8], Z[4]], [R.x1, Z[4]], [R.x1, 290], [800, R.z1], [X[12], R.z1], [X[2], R.z1], [X[2], Z[1]], [X[7], Z[1]], [X[7], Z[4]]] },
  ];
};

const TIER_CARS = [['compact', 'compact', 'pickup', 'sedan', 'compact'], ['pickup', 'suv', 'muscle', 'suv', 'sedan'], ['muscle', 'sport', 'muscle', 'sport', 'suv'], ['sport', 'super', 'sport', 'super', 'muscle']];
// desempenho-base dos rivais por nível (top, accel, grip)
const TIER_SPEC = [
  { top: 43, accel: 6.0, grip: 0.98, brake: 15 },
  { top: 52, accel: 7.6, grip: 1.0, brake: 15 },
  { top: 64, accel: 10, grip: 1.1, brake: 17 },
  { top: 78, accel: 12.5, grip: 1.25, brake: 19 },
];
export const RIVAL_NAMES = ['Raio', 'Vespa', 'Dália', 'Brasa', 'Neblina', 'Zarco', 'Mirim', 'Tita', 'Corisco', 'Lume'];
export const RIVAL_COLORS = [0xd9412b, 0x18b0c9, 0x9bd13a, 0x7a2fb8, 0xf4f4f0, 0xe84f9a, 0x1f4fa8, 0xf07a13];

export function buildEvents(map) {
  return DEFS(map).map((d, i) => {
    const path = buildDrivePath(map, d.way, d.kind === 'circuit', d.shift || 0);
    const ts = TIER_SPEC[d.tier];
    const lapPar = parTime(path, ts.top, ts.accel, 11.5 * ts.grip * 0.9, ts.brake * 0.8, 1);
    return Object.assign({}, d, {
      index: i, path, length: path.total, rivalCars: TIER_CARS[d.tier], rivalSpec: ts,
      // tempos-alvo do contra o relógio (1 volta ou o trajeto todo)
      gold: lapPar * 0.97, silver: lapPar * 1.1, bronze: lapPar * 1.28,
      start: { x: path.px[0], z: path.pz[0] },
    });
  });
}

// desafios de fuga da polícia (marcadores no passeio livre)
export function chaseSpots(map) {
  const X = map.GX, Z = map.GZ;
  return [
    { id: 'fuga1', name: 'Fuga: Centro', stars: 2, x: X[6] + 3, z: (Z[4] + Z[5]) / 2 },
    { id: 'fuga2', name: 'Fuga: Zona Industrial', stars: 3, x: (X[12] + X[13]) / 2, z: Z[2] + 3 },
    { id: 'fuga3', name: 'Fuga: Residencial', stars: 4, x: X[2] + 3, z: (Z[3] + Z[4]) / 2 },
  ];
}

export const medalOf = (ev, t) => (t == null ? 0 : t <= ev.gold ? 3 : t <= ev.silver ? 2 : t <= ev.bronze ? 1 : 0);
export const MEDAL = ['—', 'Bronze', 'Prata', 'Ouro'];
export const tierCarName = (tier) => ['Compacto', 'Picape/SUV', 'Muscle/Esportivo', 'Super'][tier];
export { CARS };
