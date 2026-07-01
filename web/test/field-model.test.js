import { test } from "node:test";
import assert from "node:assert/strict";

import { derive, dipoleFieldLine, mockField, mockFrame, syntheticField, syntheticFrame } from "../js/field-model.js";

const near = (a, b) => Math.abs(a - b) < 0.01;

// Inclinação local (graus, magnitude) a partir de dois pontos vizinhos da linha de
// campo: projeta a direção da linha no radial (vertical local) e no tangencial
// (horizontal local). Usa só geometria, não consulta syntheticField (evita teste
// circular).
const lineInclination = (a, b) => {
  const xm = (a.x + b.x) / 2;
  const zm = (a.z + b.z) / 2;
  const r = Math.hypot(xm, zm);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const vert = (dx * xm + dz * zm) / r; // componente radial (vertical)
  const horiz = (-dx * zm + dz * xm) / r; // componente tangencial (horizontal)
  let inc = Math.abs((Math.atan2(vert, horiz) * 180) / Math.PI);
  return inc > 90 ? 180 - inc : inc;
};

// Ciclo 1 (tracer): magnitude de um vetor conhecido. {30,40,0} -> 50.
test("derive: magnitude de {30,40,0} é 50", () => {
  assert.ok(near(derive({ bx: 30, by: 40, bz: 0 }).magnitude, 50));
});

// Ciclo 2: inclinação de campo vertical (só bz) -> 90° (caso polo).
test("derive: inclinação de {0,0,45} é 90°", () => {
  assert.ok(near(derive({ bx: 0, by: 0, bz: 45 }).inclination, 90));
});

// Ciclo 3: campo puramente horizontal -> 0° (caso Sobral, perto do equador).
test("derive: inclinação de {25,10,0} é 0° (Sobral)", () => {
  assert.ok(near(derive({ bx: 25, by: 10, bz: 0 }).inclination, 0));
});

// Ciclo 4: heading no eixo +by (bx=0, by>0) -> 90°, normalizado [0,360).
test("derive: heading de {0,20,-5} é 90°", () => {
  assert.ok(near(derive({ bx: 0, by: 20, bz: -5 }).heading, 90));
});

// Ciclo 5: mockField reproduz a fórmula do firmware. Em t=0: θ=0 -> {30,0,-6}.
test("mockField(0) é {bx:30, by:0, bz:-6}", () => {
  const f = mockField(0);
  assert.ok(near(f.bx, 30) && near(f.by, 0) && near(f.bz, -6));
});

// Ciclo W3-1 (tracer): no equador (λ=0) o campo é horizontal -> inclinação ≈ 0.
test("syntheticField(0): inclinação ≈ 0 (equador, horizontal)", () => {
  assert.ok(near(derive(syntheticField(0)).inclination, 0));
});

// Ciclo W3-2: no polo (λ=90) o campo é vertical -> inclinação ≈ 90.
test("syntheticField(90): inclinação ≈ 90 (polo, vertical)", () => {
  assert.ok(near(derive(syntheticField(90)).inclination, 90));
});

// Ciclo W3-3: λ=45 -> tan(I)=2·tan(45)=2 -> I = atan(2) ≈ 63.43°.
test("syntheticField(45): inclinação ≈ atan(2) ≈ 63.43°", () => {
  const expected = (Math.atan(2) * 180) / Math.PI;
  assert.ok(near(derive(syntheticField(45)).inclination, expected));
});

// Ciclo W3-4: magnitude é constante (~50) independente da latitude.
test("syntheticField: |B| ≈ 50 em qualquer latitude", () => {
  [0, 30, 45, 60, 89].forEach((lat) => {
    assert.ok(near(derive(syntheticField(lat)).magnitude, 50));
  });
});

// Ciclo W3-5: syntheticFrame entrega o contrato completo, coerente com derive.
test("syntheticFrame carrega o contrato completo, coerente com derive", () => {
  const frame = syntheticFrame(30);
  assert.equal(frame.calibrated, false);
  assert.equal(frame.calibrating, false);
  const d = derive({ bx: frame.bx, by: frame.by, bz: frame.bz });
  assert.ok(near(frame.magnitude, d.magnitude));
  assert.ok(near(frame.inclination, d.inclination));
  assert.ok(near(frame.heading, d.heading));
});

// Ciclo W7-1 (tracer): a linha de campo do dipolo segue a L-shell r = L·cos²(λ).
test("dipoleFieldLine: cada ponto satisfaz r = L·cos²(λ)", () => {
  const L = 2;
  for (const p of dipoleFieldLine(L, 32)) {
    const r = Math.hypot(p.x, p.z);
    const lat = (p.lat * Math.PI) / 180;
    assert.ok(near(r, L * Math.cos(lat) ** 2));
  }
});

// Ciclo W7-2: a linha é fechada/simétrica, emerge da superfície (r≈1) nos dois
// hemisférios e cruza o equador no raio máximo r = L.
test("dipoleFieldLine: simétrica, pés na superfície e ápice r = L no equador", () => {
  const L = 3;
  const pts = dipoleFieldLine(L, 64);
  const first = pts[0];
  const last = pts[pts.length - 1];
  assert.ok(near(Math.hypot(first.x, first.z), 1)); // pé sul na superfície
  assert.ok(near(Math.hypot(last.x, last.z), 1)); // pé norte na superfície
  assert.ok(near(first.lat, -last.lat)); // latitudes-pé simétricas
  const apex = pts.reduce((m, p) => (Math.hypot(p.x, p.z) > Math.hypot(m.x, m.z) ? p : m));
  assert.ok(near(Math.hypot(apex.x, apex.z), L) && near(apex.lat, 0)); // ápice no equador
});

// Ciclo W7-3: no equador a tangente da linha é horizontal -> inclinação local ≈ 0.
test("dipoleFieldLine: inclinação ≈ 0 no equador (campo deitado)", () => {
  const pts = dipoleFieldLine(4, 200);
  const mid = pts.length >> 1; // ponto no equador (lat ≈ 0)
  assert.ok(lineInclination(pts[mid - 1], pts[mid + 1]) < 0.5);
});

// Ciclo W7-4: a inclinação local ao longo da linha bate com derive(syntheticField(λ))
// no mesmo λ, ou seja, a geometria É a mesma física do dipolo (tan I = 2·tan λ).
test("dipoleFieldLine: inclinação local coincide com syntheticField(λ)", () => {
  const pts = dipoleFieldLine(8, 400);
  for (const targetLat of [20, 40, 55]) {
    // acha o par de pontos que cerca a latitude alvo no hemisfério norte
    const i = pts.findIndex((p) => p.lat >= targetLat);
    const lat = pts[i].lat;
    const expected = derive(syntheticField(lat)).inclination;
    assert.ok(Math.abs(lineInclination(pts[i - 1], pts[i + 1]) - expected) < 0.5);
  }
});

// Ciclo 6: mockFrame entrega o contrato completo, flags false e derivadas coerentes.
test("mockFrame carrega o contrato completo, coerente com derive", () => {
  const frame = mockFrame(0);
  assert.equal(frame.t, 0);
  assert.equal(frame.calibrated, false);
  assert.equal(frame.calibrating, false);
  const d = derive({ bx: frame.bx, by: frame.by, bz: frame.bz });
  assert.ok(near(frame.magnitude, d.magnitude));
  assert.ok(near(frame.inclination, d.inclination));
  assert.ok(near(frame.heading, d.heading));
});
