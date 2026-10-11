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
  /** Walkable ground: above the tide, below the scree, not too steep, not indoors. */
  isLand(x: number, z: number): boolean;
  /** Where the cottage stands, facing the sea. */
  site: Site;
  /** Whether (x, z) is within `margin` of the cottage. */
  nearSite(x: number, z: number, margin: number): boolean;
  clearPath(x0: number, z0: number, x1: number, z1: number): boolean;
}

export interface Site { x: number; z: number; y: number; /** Angle the front door faces, about y. */ facing: number }

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

  const site = findSite(height, normalY);
  const nearSite = (x: number, z: number, margin: number) => Math.hypot(x - site.x, z - site.z) < margin;

  function isLand(x: number, z: number) {
    const h = height(x, z);
    return h > 0.8 && h < 22 && normalY(x, z) > 0.72 && !nearSite(x, z, 5);
  }

  function clearPath(x0: number, z0: number, x1: number, z1: number) {
    for (let i = 1; i <= 6; i++) {
      const f = i / 6;
      if (!isLand(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f)) return false;
    }
    return true;
  }

  return { seed, rand, noise, noise2, height, normalY, isLand, clearPath, site, nearSite };
}

/**
 * The flattest ground a little way up from the shore, with the sea in front.
 * A plain search over a grid — no random draws — so it never disturbs where
 * anything else grows.
 */
function findSite(height: (x: number, z: number) => number, normalY: (x: number, z: number) => number): Site {
  let best: Site = { x: 30, z: 30, y: height(30, 30), facing: Math.PI / 4 }, bestScore = -Infinity;
  for (let x = -75; x <= 75; x += 2.5) {
    for (let z = -75; z <= 75; z += 2.5) {
      const h = height(x, z);
      if (h < 2.2 || h > 8 || normalY(x, z) < 0.94) continue;
      // Level across the whole footprint and garden.
      let spread = 0;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        spread = Math.max(spread, Math.abs(height(x + Math.cos(a) * 6, z + Math.sin(a) * 6) - h));
      }
      if (spread > 1.4) continue;
      // Facing out to sea, which should be near: water within 25 units that way.
      const facing = Math.atan2(z, x);
      let shore = 99;
      for (let d = 6; d < 40; d += 2) if (height(x + Math.cos(facing) * d, z + Math.sin(facing) * d) < 0) { shore = d; break; }
      const score = -spread * 2 - Math.abs(h - 4) * 0.5 - Math.abs(shore - 16) * 0.15 - Math.hypot(x - 20, z + 15) * 0.002;
      if (score > bestScore) { bestScore = score; best = { x, z, y: h, facing }; }
    }
  }
  return best;
}
