import { MeshStandardMaterial, type MeshStandardMaterialParameters } from "three";

/** The house material: flat-shaded, matte, no metal. */
export const mat = (color: number, extra: MeshStandardMaterialParameters = {}) =>
  new MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0, ...extra });
