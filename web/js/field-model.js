// field-model.js, matemática pura do campo magnético (sem DOM nem rede).
// Gêmeo JS do FieldMath do firmware: mesmas derivadas, mesmos resultados.

// Grandezas derivadas do vetor B { bx, by, bz } (µT).
export function derive(f) {
  const bh = Math.hypot(f.bx, f.by);
  let heading = (Math.atan2(f.by, f.bx) * 180) / Math.PI;
  if (heading < 0) heading += 360;
  return {
    magnitude: Math.hypot(f.bx, f.by, f.bz),
    inclination: (Math.atan2(f.bz, bh) * 180) / Math.PI,
    heading,
  };
}

// Campo sintético tipo-Sobral, espelhando o firmware-mock (Magnetometer.cpp):
// gira lentamente no plano horizontal para provar que o cano de dados está vivo.
// bz pequeno => inclinação baixa (~-11°), coerente com Sobral no equador magnético.
export function mockField(timeMs) {
  const theta = timeMs / 2000;
  const bh = 30;
  return { bx: bh * Math.cos(theta), by: bh * Math.sin(theta), bz: -6 };
}

// Campo sintético modelado para uma latitude magnética λ (graus), usado no simulador
// do Ato 2. Relação do dipolo: tan(I) = 2·tan(λ). λ=0 → I=0 (horizontal, equador);
// λ→90 → I→90 (vertical, polo). Heading estável (by=0) e magnitude constante.
const SYNTH_MAG = 50; // µT

export function syntheticField(latitudeDeg) {
  const lat = (latitudeDeg * Math.PI) / 180;
  const incl = Math.atan(2 * Math.tan(lat)); // rad
  return {
    bx: SYNTH_MAG * Math.cos(incl),
    by: 0,
    bz: SYNTH_MAG * Math.sin(incl),
  };
}

// Linha de campo de um dipolo, no plano do meridiano, para o globo do Ato 2 (#20)
// desenhar linhas fechadas sem duplicar física. Equação da L-shell: r = L·cos²(λ),
// com λ = latitude magnética e L = raio máximo (no equador), em raios terrestres
// (superfície em r = 1). A linha é fechada e simétrica entre hemisférios; emerge da
// superfície na latitude-pé λ_pé = acos(√(1/L)). As coordenadas saem no plano do
// meridiano: x = distância ao eixo do dipolo, z = ao longo do eixo (polos). O
// renderizador gira a linha em torno do eixo. Por construção a inclinação da tangente
// em cada λ é tan(I) = 2·tan(λ), coerente com syntheticField.
export function dipoleFieldLine(L, steps = 64) {
  const latFoot = Math.acos(Math.sqrt(1 / L)); // r=1 quando cos²λ = 1/L
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const lat = -latFoot + (2 * latFoot * i) / steps;
    const r = L * Math.cos(lat) ** 2;
    pts.push({
      lat: (lat * 180) / Math.PI,
      x: r * Math.cos(lat), // distância ao eixo do dipolo (horizontal no meridiano)
      z: r * Math.sin(lat), // ao longo do eixo do dipolo (vertical, polo a polo)
    });
  }
  return pts;
}

// Contrato completo para uma latitude, análogo a mockFrame, fonte do simulador.
export function syntheticFrame(latitudeDeg) {
  const f = syntheticField(latitudeDeg);
  return {
    t: 0,
    bx: f.bx,
    by: f.by,
    bz: f.bz,
    ...derive(f),
    calibrated: false,
    calibrating: false,
  };
}

// Contrato completo gerado a partir do mock, mesma forma do firewall firmware↔web.
export function mockFrame(timeMs) {
  const f = mockField(timeMs);
  return {
    t: Math.trunc(timeMs),
    bx: f.bx,
    by: f.by,
    bz: f.bz,
    ...derive(f),
    calibrated: false,
    calibrating: false,
  };
}
