// hero-renderer.js, renderizador-herói 3D (Three.js) do vetor B.
// Mesma interface dos demais: mount(element, getState) -> teardown.
//   getState() -> contrato { bx, by, bz, magnitude, ... }
//
// Cena (vencedora do protótipo): vetor B + gaiola de linhas de campo do dipolo
// (r = L·sin²θ revolucionada em torno do eixo y) + bloom + OrbitControls + rótulos.
// Three.js é vendorizado offline (ver importmap em index.html).

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const MAX_FIELD = 70; // µT, escala de referência

export function mount(element, getState) {
  const w = element.clientWidth, h = element.clientHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  element.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0e16, 0.05);

  const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
  camera.position.set(3.2, 2.4, 3.8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  // Sem auto-rotação: enquadramento estável (o dipolo fica parado e visível, não
  // varre por trás do card de legenda). O apresentador ainda pode orbitar à mão; a
  // vida da cena vem do bloom e do vetor que responde ao slider.
  controls.autoRotate = false;

  // grid em perspectiva
  const grid = new THREE.GridHelper(6, 24, 0x36e0c0, 0x1e2a3a);
  grid.material.transparent = true; grid.material.opacity = 0.35;
  scene.add(grid);

  // linhas de campo do dipolo: r = L·sin²θ, revolucionada em torno do eixo y.
  const fieldMats = [];
  const SHELLS = [0.8, 1.3, 1.9, 2.6];
  const AZ = 8;
  SHELLS.forEach((L, si) => {
    for (let a = 0; a < AZ; a++) {
      const phi = (a / AZ) * Math.PI * 2;
      const pts = [];
      for (let i = 1; i < 180; i++) {           // evita θ=0/π (r→0 degenerado)
        const th = (i / 180) * Math.PI;
        const r = L * Math.sin(th) * Math.sin(th);
        const rho = r * Math.sin(th);
        pts.push(new THREE.Vector3(rho * Math.cos(phi), r * Math.cos(th), rho * Math.sin(phi)));
      }
      const mat = new THREE.LineBasicMaterial({ color: 0x36e0c0, transparent: true, opacity: 0.28 });
      // base reforçada p/ as linhas sobreviverem ao projetor em sala clara
      mat.userData.base = 0.22 + si * 0.05;
      fieldMats.push(mat);
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
  });

  // luzes + eixos
  scene.add(new THREE.AmbientLight(0x88aacc, 0.6));
  const key = new THREE.PointLight(0xffd23f, 30, 20); key.position.set(2, 4, 2);
  scene.add(key);
  const axes = new THREE.AxesHelper(1.4);
  axes.material.transparent = true; axes.material.opacity = 0.4;
  scene.add(axes);

  // vetor B + núcleo na origem
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1.5, 0xffd23f, 0.35, 0.2
  );
  scene.add(arrow);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd23f, emissiveIntensity: 1.5 })
  );
  scene.add(core);

  // bloom
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.5, 0.2));

  // rótulos (CSS2D, DOM nítido sobre o WebGL, sem capturar clique)
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  labelRenderer.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none";
  element.appendChild(labelRenderer.domElement);
  function makeLabel(text, color) {
    const d = document.createElement("div");
    d.textContent = text;
    d.style.cssText = `font-family:var(--mono,monospace);font-size:11px;letter-spacing:.04em;color:${color};`
      + `background:rgba(10,14,22,.6);border:1px solid rgba(255,255,255,.08);border-radius:5px;padding:3px 7px;white-space:nowrap`;
    return new CSS2DObject(d);
  }
  const lblOrigin = makeLabel("ponto de medição", "rgba(232,237,245,.72)");
  core.add(lblOrigin); lblOrigin.position.set(0, -0.25, 0);
  const lblB = makeLabel("vetor B", "#ffd23f"); scene.add(lblB);
  const lblField = makeLabel("campo da Terra", "#36e0c0");
  lblField.position.set(0, 2.8, 0); scene.add(lblField);

  function resize() {
    const W = element.clientWidth, H = element.clientHeight;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H); composer.setSize(W, H); labelRenderer.setSize(W, H);
  }
  window.addEventListener("resize", resize);

  let raf;
  const dir = new THREE.Vector3();
  function frame() {
    const t = getState();
    const tms = performance.now();
    // eixos sensor → cena: x→x, y→z, z→y (z para cima)
    dir.set(t.bx, t.bz, t.by);
    if (dir.lengthSq() > 0) dir.normalize();
    arrow.setDirection(dir);
    const len = (t.magnitude / MAX_FIELD) * 2.6;
    arrow.setLength(len, 0.32, 0.18);
    lblB.position.copy(dir).multiplyScalar(len + 0.25);
    // shimmer sutil nas linhas de campo (fluxo "vivo" sem girar o campo)
    fieldMats.forEach((m, i) => {
      m.opacity = m.userData.base * (0.6 + 0.4 * Math.sin(tms / 700 + i * 0.5));
    });
    controls.update();
    composer.render();
    labelRenderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    labelRenderer.domElement.remove();
  };
}
