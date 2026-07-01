// fox-alignment.js, lógica pura de alinhamento da "visão da raposa" (sem DOM).
// A raposa "trava" o salto quando o heading do campo está dentro de uma tolerância
// angular de uma direção-alvo. Funções puras, testáveis isoladamente.

// Normaliza um ângulo em graus para [0, 360).
export function normalize360(deg) {
  return ((deg % 360) + 360) % 360;
}

// Menor diferença angular absoluta entre dois ângulos (graus), tratando o wrap de 360°.
export function angularDiff(a, b) {
  const d = (((a - b + 180) % 360) + 360) % 360 - 180;
  return Math.abs(d);
}

// Verdadeiro quando o heading está a no máximo `tol` graus do alvo.
export function isAligned(heading, target, tol) {
  return angularDiff(normalize360(heading), normalize360(target)) <= tol;
}
