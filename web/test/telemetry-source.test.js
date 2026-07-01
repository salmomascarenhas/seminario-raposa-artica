import { test } from "node:test";
import assert from "node:assert/strict";

import { createTelemetrySource } from "../js/telemetry-source.js";
import { mockFrame } from "../js/field-model.js";

// WebSocket fake injetável: captura handlers e deixa o teste disparar eventos.
function fakeSocket() {
  const sockets = [];
  function Ctor(url) {
    const s = { url, onmessage: null, onopen: null, onclose: null, onerror: null, closed: false };
    s.close = () => { s.closed = true; };
    sockets.push(s);
    return s;
  }
  Ctor.sockets = sockets;
  Ctor.last = () => sockets[sockets.length - 1];
  return Ctor;
}

// Relógio injetável.
function clock(start = 0) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

function makeSource(now, WebSocketCtor, fallbackMs = 2000) {
  return createTelemetrySource({
    url: "ws://test/ws",
    WebSocketCtor,
    mockFrame,
    now,
    fallbackMs,
    schedule: (fn) => fn(), // reconexão síncrona no teste
  });
}

const liveFrame = {
  t: 555, bx: 1, by: 2, bz: 3, magnitude: 10,
  inclination: 20, heading: 30, calibrated: true, calibrating: false,
};

// Ciclo 7 (tracer): antes de qualquer frame, a fonte está em SIMULADO e
// getState() devolve o frame de mock.
test("sem frame: status simulado e getState é mock", () => {
  const now = clock(0);
  const src = makeSource(now, fakeSocket());
  assert.equal(src.status, "simulado");
  assert.deepEqual(src.getState(), mockFrame(0));
});

// Ciclo 8: ao chegar um frame pelo socket, vai para AO VIVO e getState reflete o frame.
test("frame recebido: status live e getState é o frame", () => {
  const now = clock(0);
  const Ctor = fakeSocket();
  const src = makeSource(now, Ctor);
  Ctor.last().onmessage({ data: JSON.stringify(liveFrame) });
  assert.equal(src.status, "live");
  assert.deepEqual(src.getState(), liveFrame);
});

// Ciclo 9: sem frame novo por mais que fallbackMs, volta a SIMULADO (frame travado).
test("frame velho (> fallbackMs): volta a simulado e getState é mock", () => {
  const now = clock(0);
  const Ctor = fakeSocket();
  const src = makeSource(now, Ctor, 2000);
  Ctor.last().onmessage({ data: JSON.stringify(liveFrame) });
  now.advance(2500); // ultrapassa o fallback sem novo frame
  assert.equal(src.status, "simulado");
  assert.deepEqual(src.getState(), mockFrame(2500));
});

// Ciclo 10: socket fecha -> SIMULADO imediato e abre um novo socket (reconexão).
test("socket fecha: simulado e reconecta (novo socket)", () => {
  const now = clock(0);
  const Ctor = fakeSocket();
  const src = makeSource(now, Ctor, 2000);
  Ctor.last().onmessage({ data: JSON.stringify(liveFrame) });
  assert.equal(src.status, "live");
  Ctor.last().onclose();
  assert.equal(src.status, "simulado");
  assert.equal(Ctor.sockets.length, 2); // tentou reconectar
});

// Ciclo 11: depois de cair para SIMULADO, um novo frame restaura AO VIVO.
test("novo frame após fallback: volta a live", () => {
  const now = clock(0);
  const Ctor = fakeSocket();
  const src = makeSource(now, Ctor, 2000);
  Ctor.last().onmessage({ data: JSON.stringify(liveFrame) });
  now.advance(2500); // expira
  assert.equal(src.status, "simulado");
  Ctor.last().onmessage({ data: JSON.stringify(liveFrame) }); // novo frame
  assert.equal(src.status, "live");
  assert.deepEqual(src.getState(), liveFrame);
});
