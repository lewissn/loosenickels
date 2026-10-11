import { Color } from "three";
import { smooth } from "./noise";

/* The four seasons as palettes and amounts, and a blend between them.

   Each season holds still for most of its length and then turns into the
   next over its last stretch, so the island is never switched, only
   changed. */

interface Palette {
  name: string;
  grass: number; leaf: number; blossom: number; pine: number; fx: number;
  /** How full the deciduous canopies are. */
  leafAmt: number;
  flowers: number;
  snow: number;
  /** Falling things: petals, leaves, snow. */
  fxAmt: number; fxSpeed: number; fxSize: number;
}

const PALETTES: Palette[] = [
  { name: "spring", grass: 0x7fbf5c, leaf: 0x8fcf5e, blossom: 0xf6b3c9, pine: 0x3f7d4a, leafAmt: 0.85, flowers: 1, snow: 0, fx: 0xf9c9d9, fxAmt: 0.45, fxSpeed: 2.2, fxSize: 0.6 },
  { name: "summer", grass: 0x5d9b3f, leaf: 0x4c8c35, blossom: 0x5c9b3d, pine: 0x2f6b3c, leafAmt: 1, flowers: 0.6, snow: 0, fx: 0xfff1a8, fxAmt: 0, fxSpeed: 2, fxSize: 0.5 },
  { name: "autumn", grass: 0xa8a052, leaf: 0xdb822b, blossom: 0xc4492f, pine: 0x335f3c, leafAmt: 0.65, flowers: 0, snow: 0, fx: 0xd9752a, fxAmt: 0.65, fxSpeed: 3.4, fxSize: 0.85 },
  { name: "winter", grass: 0x7f8c74, leaf: 0x8a6d4a, blossom: 0x8a6d4a, pine: 0x3c5f48, leafAmt: 0, flowers: 0, snow: 0.92, fx: 0xffffff, fxAmt: 1, fxSpeed: 3, fxSize: 0.6 },
];

export const SEASON_NAMES = PALETTES.map((p) => p.name);

const COLOURS = ["grass", "leaf", "blossom", "pine", "fx"] as const;
const AMOUNTS = ["leafAmt", "flowers", "snow", "fxAmt", "fxSpeed", "fxSize"] as const;

const RESOLVED = PALETTES.map((p) => ({
  ...p,
  colours: Object.fromEntries(COLOURS.map((k) => [k, new Color(p[k])])) as Record<(typeof COLOURS)[number], Color>,
}));

/** The season as it stands right now, somewhere between two palettes. */
export class Season {
  grass = new Color();
  leaf = new Color();
  blossom = new Color();
  pine = new Color();
  fx = new Color();
  leafAmt = 0;
  flowers = 0;
  snow = 0;
  fxAmt = 0;
  fxSpeed = 0;
  fxSize = 0;

  /** yearPos runs 0–4, one unit per season. Returns the blended position. */
  blend(yearPos: number): number {
    const i = Math.floor(yearPos) % 4, f = yearPos - Math.floor(yearPos);
    const k = smooth(0.62, 1, f);
    const a = RESOLVED[i], b = RESOLVED[(i + 1) % 4];
    for (const key of COLOURS) this[key].copy(a.colours[key]).lerp(b.colours[key], k);
    for (const key of AMOUNTS) this[key] = a[key] + (b[key] - a[key]) * k;
    return i + k;
  }
}
