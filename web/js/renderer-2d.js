// renderer-2d.js, renderizador mínimo do vetor B em Canvas 2D (projeção isométrica).
// Interface comum a todos os renderizadores: mount(element, getState) -> teardown.
//   getState() -> contrato { bx, by, bz, magnitude, ... }
// É também o fallback do HeroRenderer 3D (W2) quando o WebGL não está disponível.

const MAX_FIELD = 70; // µT, escala de referência (campo terrestre ~25–65 µT)
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);

function project(x, y, z, cx, cy, scale) {
  return {
    x: cx + (x - y) * COS30 * scale,
    y: cy + (x + y) * SIN30 * scale - z * scale,
  };
}

function drawArrow(ctx, x1, y1, x2, y2, color, width) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 12;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function draw(ctx, w, h, state) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2 + h * 0.12;
  const scale = Math.min(w, h) * 0.32;

  // Plano de grade (chão) para dar sensação de profundidade.
  ctx.strokeStyle = "rgba(120,140,170,0.12)";
  ctx.lineWidth = 1;
  const g = 1;
  for (let i = -g; i <= g; i += 0.5) {
    const a = project(i, -g, 0, cx, cy, scale);
    const b = project(i, g, 0, cx, cy, scale);
    const c = project(-g, i, 0, cx, cy, scale);
    const d = project(g, i, 0, cx, cy, scale);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
  }

  const O = project(0, 0, 0, cx, cy, scale);

  // Eixos de referência (curtos, semitransparentes).
  const ax = project(1.15, 0, 0, cx, cy, scale);
  const ay = project(0, 1.15, 0, cx, cy, scale);
  const az = project(0, 0, 1.15, cx, cy, scale);
  drawArrow(ctx, O.x, O.y, ax.x, ax.y, "rgba(255,90,95,0.45)", 1.5);
  drawArrow(ctx, O.x, O.y, ay.x, ay.y, "rgba(80,220,140,0.45)", 1.5);
  drawArrow(ctx, O.x, O.y, az.x, az.y, "rgba(90,150,255,0.45)", 1.5);
  ctx.fillStyle = "rgba(200,210,230,0.6)";
  ctx.font = "13px ui-monospace, monospace";
  ctx.fillText("x", ax.x + 4, ax.y);
  ctx.fillText("y", ay.x + 4, ay.y);
  ctx.fillText("z", az.x + 4, az.y - 4);

  // Vetor B.
  const m = state.magnitude || Math.hypot(state.bx, state.by, state.bz) || 0;
  const k = Math.min(m / MAX_FIELD, 1) || 0;
  const nx = (state.bx / (m || 1)) * k;
  const ny = (state.by / (m || 1)) * k;
  const nz = (state.bz / (m || 1)) * k;
  const B = project(nx, ny, nz, cx, cy, scale);

  // Projeção do vetor no chão (linha tracejada) para leitura da inclinação.
  const Bfloor = project(nx, ny, 0, cx, cy, scale);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(255,210,120,0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(Bfloor.x, Bfloor.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(O.x, O.y); ctx.lineTo(Bfloor.x, Bfloor.y); ctx.stroke();
  ctx.setLineDash([]);

  drawArrow(ctx, O.x, O.y, B.x, B.y, "#ffd23f", 3.5);

  // Ponto na origem.
  ctx.fillStyle = "#e8edf5";
  ctx.beginPath();
  ctx.arc(O.x, O.y, 4, 0, Math.PI * 2);
  ctx.fill();
}

// Monta o renderizador num elemento (cria o canvas, inicia o loop de animação).
// Retorna uma função teardown() que para o loop e remove o canvas.
export function mount(element, getState) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:100%;display:block";
  element.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let raf;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = element.clientWidth * dpr;
    canvas.height = element.clientHeight * dpr;
  }
  resize();
  window.addEventListener("resize", resize);

  function frame() {
    draw(ctx, canvas.width, canvas.height, getState());
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    canvas.remove();
  };
}
