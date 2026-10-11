/* Seeded randomness and 2D simplex noise.

   Everything that shapes the island draws from these, so the same seed
   grows the same island on every visit and on every device. */

export type Rand = () => number;
export type Noise2D = (x: number, y: number) => number;

export function mulberry32(seed: number): Rand {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1],
] as const;
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export function makeNoise(seed: number): Noise2D {
  const r = mulberry32(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  return (x, y) => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0, c: number;
    c = 0.5 - x0 * x0 - y0 * y0;
    if (c > 0) { const g = GRAD[p[ii + p[jj]] & 7]; c *= c; n += c * c * (g[0] * x0 + g[1] * y0); }
    c = 0.5 - x1 * x1 - y1 * y1;
    if (c > 0) { const g = GRAD[p[ii + i1 + p[jj + j1]] & 7]; c *= c; n += c * c * (g[0] * x1 + g[1] * y1); }
    c = 0.5 - x2 * x2 - y2 * y2;
    if (c > 0) { const g = GRAD[p[ii + 1 + p[jj + 1]] & 7]; c *= c; n += c * c * (g[0] * x2 + g[1] * y2); }
    return 70 * n;
  };
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Smoothstep from a to b. */
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
