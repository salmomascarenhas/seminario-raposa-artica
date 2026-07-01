// pick-renderer.js, escolhe o renderizador e o monta, com fallback automático.
// Primário: HeroRenderer 3D (Three.js). Fallback: renderer-2d (Canvas), quando o
// WebGL não está disponível OU o módulo 3D falha ao carregar (ex.: Three.js ausente).
//
// Mesma interface de saída dos renderizadores: devolve teardown().
// É async porque o módulo 3D é importado sob demanda.

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

export async function mountRenderer(element, getState) {
  if (hasWebGL()) {
    try {
      const hero = await import("./hero-renderer.js");
      return hero.mount(element, getState);
    } catch (err) {
      console.warn("[pick-renderer] HeroRenderer 3D indisponível, caindo para 2D:", err);
    }
  }
  const r2d = await import("./renderer-2d.js");
  return r2d.mount(element, getState);
}
