import { makeNoise, mulberry32, smooth, type Noise2D, type Rand } from "./noise";

/* The island's shape: one height function, and the questions everything
   else asks of it (is this land, can an animal walk from here to there). */

/** Rough radius of the island, in world units. */
export const ISLAND = 85;

export interface World {
  seed: number;
  /** Seeded. Draw order matters: trees, then rocks, flowers and clouds. */
  rand: Rand;
  noise: Noise2D;
  noise2: Noise2D;
  height(x: number, z: number): number;
  normalY(x: number, z: number): number;
  /** Walkable ground: above the tide, below the scree, not too steep. */
  isLand(x: number, z: number): boolean;
  clearPath(x0: number, z0: number, x1: number, z1: number): boolean;
}

export function createWorld(seed: number): World {
  const rand = mulberry32(seed);
  const noise = makeNoise(seed);
  const noise2 = makeNoise(seed * 7 + 3);
  const fbm = (x: number, y: number) => {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < 4; i++) { s += a * noise(x * f, y * f); f *= 2.03; a *= 0.5; }
    return s;
  };

  function height(x: number, z: number) {
    const d = Math.hypot(x, z) / ISLAND + noise(x * 0.012 + 40, z * 0.012 - 10) * 0.22;
    const land = 1 - smooth(0.55, 1.0, d);
    const hills = fbm(x * 0.022, z * 0.022) * 0.5 + 0.5;
    const peak = Math.max(0, 1 - Math.hypot(x - 18, z + 14) / 42);
    let h = land * (2.5 + hills * 11) + peak * peak * 26 * land + fbm(x * 0.08, z * 0.08) * 0.8 * land - 2.2;
    if (d > 1) h -= (d - 1) * 14;
    return h;
  }

  function normalY(x: number, z: number) {
    const e = 0.8;
    const hx = height(x + e, z) - height(x - e, z), hz = height(x, z + e) - height(x, z - e);
    return 1 / Math.sqrt(1 + (hx * hx + hz * hz) / (4 * e * e));
  }

  function isLand(x: number, z: number) {
    const h = height(x, z);
    return h > 0.8 && h < 22 && normalY(x, z) > 0.72;
  }

  function clearPath(x0: number, z0: number, x1: number, z1: number) {
    for (let i = 1; i <= 6; i++) {
      const f = i / 6;
      if (!isLand(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f)) return false;
    }
    return true;
  }

  return { seed, rand, noise, noise2, height, normalY, isLand, clearPath };
}
