// Ciclo dos semáforos. Cada cruzamento tem classe 0/1 (defasadas) e dois eixos (0 leste-oeste, 1 norte-sul).
export const SIG_T = 26;
// 0 vermelho, 1 amarelo, 2 verde
export function signalColor(cls, axis, time) {
  let t = (time + cls * 13) % SIG_T;
  if (axis === 0) t = (t + 13) % SIG_T;
  if (t < 10) return 2;
  if (t < 12.5) return 1;
  return 0;
}
