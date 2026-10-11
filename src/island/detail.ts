/* How much island a device gets.

   A phone gets a coarser terrain, a smaller shadow map and fewer trees,
   flowers and particles; the island is the same shape either way. */

export interface Detail {
  mobile: boolean;
  reducedMotion: boolean;
  pixelRatio: number;
  shadowMap: number;
  terrainSegments: number;
  waterSegments: number;
  trees: number;
  flowers: number;
  particles: number;
}

export function detectDetail(): Detail {
  const mobile = matchMedia("(pointer: coarse)").matches;
  return {
    mobile,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    pixelRatio: Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2),
    shadowMap: mobile ? 1024 : 2048,
    terrainSegments: mobile ? 120 : 150,
    waterSegments: mobile ? 60 : 80,
    trees: mobile ? 280 : 420,
    flowers: mobile ? 350 : 600,
    particles: mobile ? 900 : 1600,
  };
}
