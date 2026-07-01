// fox-vision.js, "visão da raposa" (Ato 3): HUD com anel pulsante que trava (✓)
// quando o campo está alinhado com a direção-alvo (NE magnético, heading ≈ 45°).
// Interface comum: mount(element, getState) -> teardown.
//   getState() -> contrato { heading, inclination, magnitude, ... }
//
// "Alinhado" = heading dentro de ±TOL do alvo. Usa heading (relativo ao sensor),
// NÃO declination (que não é medível), coerente com o contrato honesto.

import { normalize360, isAligned } from "./fox-alignment.js";

const TARGET = 45; // NE magnético (graus)
const TOL = 12;    // tolerância de alinhamento (graus)

function draw(ctx, w, h, state, t) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.36;

  const heading = normalize360(state.heading || 0);
  const aligned = isAligned(heading, TARGET, TOL);

  const pulse = 1 + 0.04 * Math.sin(t / 220);
  const glow = aligned ? "#36e08a" : "#ffd23f";

  // Halo externo.
  const grad = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.4);
  grad.addColorStop(0, aligned ? "rgba(54,224,138,0.10)" : "rgba(255,210,63,0.06)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Anéis concêntricos do HUD.
  ctx.lineWidth = 1.5;
  [0.62, 0.82, 1.0].forEach((f, i) => {
    ctx.strokeStyle = `rgba(255,210,63,${0.12 + i * 0.06})`;
    ctx.beginPath();
    ctx.arc(cx, cy, R * f * pulse, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Marcas de bússola (N/L/S/O).
  ctx.font = "12px ui-monospace, monospace";
  ctx.fillStyle = "rgba(200,210,230,0.55)";
  const marks = [["N", -90], ["L", 0], ["S", 90], ["O", 180]];
  marks.forEach(([label, deg]) => {
    const a = (deg * Math.PI) / 180;
    const px = cx + Math.cos(a) * R * 1.12;
    const py = cy + Math.sin(a) * R * 1.12;
    ctx.fillText(label, px - 4, py + 4);
  });

  // Setor-alvo (NE).
  const ta = ((TARGET - 90) * Math.PI) / 180; // 0°=N no topo → offset -90
  ctx.strokeStyle = aligned ? "rgba(54,224,138,0.5)" : "rgba(255,210,63,0.3)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.0 * pulse, ta - (TOL * Math.PI) / 180, ta + (TOL * Math.PI) / 180);
  ctx.stroke();

  // Agulha do campo (heading atual). 0°=N no topo.
  const ha = ((heading - 90) * Math.PI) / 180;
  ctx.strokeStyle = glow;
  ctx.lineWidth = 4;
  ctx.shadowColor = glow;
  ctx.shadowBlur = aligned ? 18 : 8;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(ha) * R * 0.92, cy + Math.sin(ha) * R * 0.92);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Núcleo central + status.
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, 6 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "bold 16px ui-monospace, monospace";
  ctx.fillStyle = glow;
  ctx.textAlign = "center";
  ctx.fillText(aligned ? "ALINHADO  ✓" : "PROCURANDO  ✗", cx, cy + R * 1.34);
  ctx.textAlign = "left";
}

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
    draw(ctx, canvas.width, canvas.height, getState(), performance.now());
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    canvas.remove();
  };
}

export { TARGET, TOL };
