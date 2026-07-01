// telemetry-source.js, fonte única de telemetria para a web.
// Abstrai a origem do dado (WebSocket da ESP vs browser-mock) por trás de uma
// interface simples: getState() devolve o contrato; status diz "live"/"simulado".
//
// Testabilidade: relógio (now) e construtor de WebSocket são injetáveis; a decisão
// live↔simulado é avaliada PREGUIÇOSAMENTE em now(), sem timers na lógica.

export function createTelemetrySource({
  url,
  WebSocketCtor,
  mockFrame,
  now,
  fallbackMs,
  // agenda a reconexão; injetável para teste. Produção: espera antes de tentar de novo.
  schedule = (fn) => setTimeout(fn, 1000),
}) {
  let lastFrame = null;
  let lastFrameAt = -Infinity;
  let socket = null; // WS ativo, para enviar comandos ({cmd:...})

  function connect() {
    const ws = new WebSocketCtor(url);
    socket = ws;
    ws.onmessage = (ev) => {
      lastFrame = JSON.parse(ev.data);
      lastFrameAt = now();
    };
    ws.onclose = () => {
      lastFrame = null; // cai para SIMULADO imediatamente
      socket = null;
      schedule(connect); // tenta reconectar em background
    };
    return ws;
  }

  connect();

  // Frame é considerado "vivo" só enquanto está fresco (dentro da janela de fallback).
  function isFresh() {
    return lastFrame !== null && now() - lastFrameAt <= fallbackMs;
  }

  return {
    get status() {
      return isFresh() ? "live" : "simulado";
    },
    getState() {
      return isFresh() ? lastFrame : mockFrame(now());
    },
    // Envia um comando pelo WS ativo. Retorna true se despachou, false se offline.
    send(obj) {
      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify(obj));
        return true;
      }
      return false;
    },
  };
}
