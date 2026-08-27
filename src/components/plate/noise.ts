/* =========================================================================
   Seeded fields

   Everything a plate draws comes from here. No Math.random anywhere in the
   plate system: a record's plate is part of its identity and must be
   identical on every device, in every session, for as long as the record
   exists.
   ========================================================================= */

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Value noise on a lattice of pseudo-random gradients. Smoother and much
 * cheaper than Perlin, and at the scales these plates work at the
 * difference is not visible.
 */
export function valueNoise(seed: number) {
  const size = 256;
  const mask = size - 1;
  const table = new Float32Array(size * size);
  const next = rng(seed);
  for (let i = 0; i < table.length; i += 1) table[i] = next();

  const at = (x: number, y: number): number =>
    table[((y & mask) * size + (x & mask)) as number] ?? 0;

  return function sample(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = fade(x - xi);
    const yf = fade(y - yi);

    const top = lerp(at(xi, yi), at(xi + 1, yi), xf);
    const bottom = lerp(at(xi, yi + 1), at(xi + 1, yi + 1), xf);
    return lerp(top, bottom, yf);
  };
}

/**
 * Layered noise. `octaves` controls how much fine structure the field
 * carries; a survey contour wants three or four, a weather chart wants two.
 */
export function fbm(
  seed: number,
  octaves = 4,
  gain = 0.5,
  lacunarity = 2,
): (x: number, y: number) => number {
  const layers = Array.from({ length: octaves }, (_, i) => valueNoise(seed + i * 977));

  return function sample(x: number, y: number): number {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let norm = 0;

    for (const layer of layers) {
      total += layer(x * frequency, y * frequency) * amplitude;
      norm += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return total / norm;
  };
}

/* ---- Marching squares ---------------------------------------------------
   Extracts iso-lines from a sampled scalar field. This is what makes the
   topographic and isobar plates read as survey documents rather than as
   generated texture: the lines genuinely close, nest and never cross.

   Segments are emitted independently rather than chained into polylines.
   For stroke rendering the distinction is invisible and the code that
   would chain them is not worth the weight. */

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function isoLines(
  field: Float32Array,
  cols: number,
  rows: number,
  level: number,
  cellW: number,
  cellH: number,
): Segment[] {
  const segments: Segment[] = [];
  const value = (c: number, r: number): number => field[r * cols + c] ?? 0;

  /* Interpolate the crossing point along an edge rather than taking the
     midpoint — midpoints produce visibly faceted contours. */
  const cross = (a: number, b: number): number => {
    const d = b - a;
    return Math.abs(d) < 1e-9 ? 0.5 : (level - a) / d;
  };

  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const tl = value(c, r);
      const tr = value(c + 1, r);
      const br = value(c + 1, r + 1);
      const bl = value(c, r + 1);

      let index = 0;
      if (tl > level) index |= 8;
      if (tr > level) index |= 4;
      if (br > level) index |= 2;
      if (bl > level) index |= 1;

      if (index === 0 || index === 15) continue;

      const x = c * cellW;
      const y = r * cellH;

      const top = { x: x + cross(tl, tr) * cellW, y };
      const right = { x: x + cellW, y: y + cross(tr, br) * cellH };
      const bottom = { x: x + cross(bl, br) * cellW, y: y + cellH };
      const left = { x, y: y + cross(tl, bl) * cellH };

      const push = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });

      switch (index) {
        case 1:
        case 14:
          push(left, bottom);
          break;
        case 2:
        case 13:
          push(bottom, right);
          break;
        case 3:
        case 12:
          push(left, right);
          break;
        case 4:
        case 11:
          push(top, right);
          break;
        case 6:
        case 9:
          push(top, bottom);
          break;
        case 7:
        case 8:
          push(left, top);
          break;
        /* Saddles. Resolved consistently rather than by the field average:
           an inconsistent resolution shows up as contours that appear to
           cross, which a survey plate never does. */
        case 5:
          push(left, top);
          push(bottom, right);
          break;
        case 10:
          push(top, right);
          push(left, bottom);
          break;
      }
    }
  }

  return segments;
}

/** Samples a field function into the flat array marching squares expects. */
export function sampleField(
  cols: number,
  rows: number,
  sample: (x: number, y: number) => number,
): Float32Array {
  const field = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      field[r * cols + c] = sample(c, r);
    }
  }
  return field;
}
