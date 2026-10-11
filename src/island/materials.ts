import { CanvasTexture, MeshStandardMaterial, type MeshStandardMaterialParameters } from "three";

/** The house material: flat-shaded, matte, no metal. */
export const mat = (color: number, extra: MeshStandardMaterialParameters = {}) =>
  new MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0, ...extra });

/** A soft white dot, for sprites: falling snow and petals, fireflies. */
export function softDot() {
  const dot = document.createElement("canvas");
  dot.width = dot.height = 32;
  const g = dot.getContext("2d");
  if (g) {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, "#fff");
    r.addColorStop(0.5, "rgba(255,255,255,.8)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
  }
  return new CanvasTexture(dot);
}
