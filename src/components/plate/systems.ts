import { fbm, isoLines, rng, sampleField } from "./noise";

/* =========================================================================
   Plate systems

   A record with no digitised media is not shown an empty box. It is shown
   a plate: a drawing generated from its accession number, in the drawing
   convention of its department.

   Objects get measured outlines. Places get contours. Field notes get
   isobars. Photographs get a halftone screen. Thoughts get almost nothing.
   Sounds get an envelope. Experiments get a lattice. Research gets a
   figure with axes.

   The point is not that the plates are decorative — it is that a reader
   can tell which department a record belongs to from across the room, and
   that the same record always looks like itself.
   ========================================================================= */

export interface PlateContext {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels. The context is already scaled for device pixel ratio. */
  w: number;
  h: number;
  seed: number;
  ink: [number, number, number];
  env: [number, number, number];
  oxide: [number, number, number];
}

export type PlateSystem = (plate: PlateContext) => void;

const rgba = ([r, g, b]: [number, number, number], a: number): string =>
  `rgba(${r}, ${g}, ${b}, ${a})`;

/**
 * How much heavier to draw, given the size of the plate.
 *
 * Line weight was fixed at one pixel regardless of frame. That is right on
 * a 130px thumbnail, where the drawing reads as dense and solid, and wrong
 * on a 650px hero, where the same lines cover five times the area and the
 * plate looks like it failed to load. Raising the opacity instead — which
 * was the previous attempt, twice — only made the thumbnails muddy while
 * leaving the heroes thin.
 *
 * Returns 1 at about 200px and 2.1 at about 900px.
 */
function strokeScale(w: number, h: number): number {
  const size = Math.min(w, h);
  return Math.max(1, Math.min(2.1, 0.55 + size / 460));
}

/* ---- Shared chrome ------------------------------------------------------
   Every plate carries the same registration marks, in the same places, at
   the same weight. It is the one element common to all eight systems and
   it is what makes them read as a series. */

export function registration(plate: PlateContext): void {
  const { ctx, w, h, ink } = plate;
  const inset = Math.min(w, h) * 0.045;
  const arm = Math.min(14, Math.min(w, h) * 0.035);
  const k = strokeScale(w, h);

  ctx.save();
  ctx.strokeStyle = rgba(ink, 0.42);
  ctx.lineWidth = k;

  for (const [x, y] of [
    [inset, inset],
    [w - inset, inset],
    [inset, h - inset],
    [w - inset, h - inset],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y + arm);
    ctx.stroke();
  }

  ctx.restore();
}

/* ---- OB · contour -------------------------------------------------------
   A measured drawing: an object's outline, then a set of section lines
   stepped inwards from it, with centre lines and dimension ticks. */

const contour: PlateSystem = (plate) => {
  const { ctx, w, h, seed, ink, env } = plate;
  const next = rng(seed);
  const cx = w * (0.42 + next() * 0.16);
  const cy = h * (0.44 + next() * 0.12);
  const radius = Math.min(w, h) * (0.26 + next() * 0.08);

  /* A closed radial profile, smoothed so the object reads as solid rather
     than as a spiky star. */
  const lobes = 5 + Math.floor(next() * 4);
  const phase = Array.from({ length: lobes }, () => next() * Math.PI * 2);
  const weight = Array.from({ length: lobes }, () => 0.05 + next() * 0.16);

  const profile = (angle: number): number => {
    let r = 1;
    for (let i = 0; i < lobes; i += 1) {
      r += Math.sin(angle * (i + 2) + (phase[i] ?? 0)) * (weight[i] ?? 0);
    }
    return r;
  };

  const outline = (scale: number) => {
    ctx.beginPath();
    const steps = 180;
    for (let i = 0; i <= steps; i += 1) {
      const a = (i / steps) * Math.PI * 2;
      const r = radius * scale * profile(a);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.86;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  /* Centre lines first, so the outline sits over them. */
  const k = strokeScale(w, h);

  ctx.save();
  ctx.strokeStyle = rgba(ink, 0.26);
  ctx.lineWidth = k;
  ctx.setLineDash([6 * k, 3 * k, 1.5 * k, 3 * k]);
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.08);
  ctx.lineTo(cx, h * 0.92);
  ctx.moveTo(w * 0.08, cy);
  ctx.lineTo(w * 0.92, cy);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  /* Section lines scale with the frame: seven is a measured drawing at
     thumbnail size and a sparse contour map at hero size. */
  const steps = Math.round(7 * Math.min(1.9, Math.max(1, k)));
  for (let i = steps; i >= 1; i -= 1) {
    const scale = i / steps;
    ctx.strokeStyle = rgba(env, 0.34 + (1 - scale) * 0.5);
    ctx.lineWidth = (i === steps ? 1.9 : 1.15) * k;
    outline(scale * 0.94 + 0.06);
    ctx.stroke();
  }
  ctx.restore();

  /* Dimension ticks along the lower edge, as on a catalogue drawing. */
  ctx.save();
  ctx.strokeStyle = rgba(ink, 0.4);
  ctx.lineWidth = k;
  const baseline = h * 0.9;
  const left = cx - radius * 1.1;
  const right = cx + radius * 1.1;
  ctx.beginPath();
  ctx.moveTo(left, baseline);
  ctx.lineTo(right, baseline);
  for (const x of [left, right]) {
    ctx.moveTo(x, baseline - 4 * k);
    ctx.lineTo(x, baseline + 4 * k);
  }
  ctx.stroke();
  ctx.restore();
};

/* ---- PL · topography ----------------------------------------------------
   Contours from a layered noise field, with every fifth line drawn heavy
   as an index contour. This is the convention on a real 1:25 000 sheet and
   it is the whole reason the plate reads as terrain. */

const topography: PlateSystem = (plate) => {
  const { ctx, w, h, seed, ink, env } = plate;
  const k = strokeScale(w, h);
  /* The contour interval stays proportional to the frame, so a hero plate
     carries more terrain rather than the same terrain stretched. */
  const cell = Math.max(5, Math.min(w, h) / (46 * Math.min(1.5, k)));
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;

  const noise = fbm(seed, 4, 0.5, 2.05);
  const scale = 0.055;
  const field = sampleField(cols, rows, (x, y) => noise(x * scale, y * scale));

  const levels = 16;
  ctx.save();
  ctx.lineCap = "round";

  for (let i = 1; i < levels; i += 1) {
    const level = i / levels;
    const index = i % 5 === 0;
    ctx.strokeStyle = rgba(env, index ? 0.75 : 0.45);
    ctx.lineWidth = (index ? 1.6 : 0.95) * k;

    ctx.beginPath();
    for (const s of isoLines(field, cols, rows, level, cell, cell)) {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
  }
  ctx.restore();

  /* A single spot height, placed on the highest sampled cell. */
  let peak = -1;
  let px = 0;
  let py = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const v = field[r * cols + c] ?? 0;
      if (v > peak) {
        peak = v;
        px = c * cell;
        py = r * cell;
      }
    }
  }

  ctx.save();
  ctx.fillStyle = rgba(ink, 0.7);
  ctx.beginPath();
  ctx.arc(px, py, 2.4 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/* ---- FN · isobar --------------------------------------------------------
   The same extraction at a much larger scale and with fewer levels, which
   is exactly what distinguishes a synoptic chart from a terrain map. */

const isobar: PlateSystem = (plate) => {
  const { ctx, w, h, seed, ink, env } = plate;
  const k = strokeScale(w, h);
  const cell = Math.max(6, Math.min(w, h) / (34 * Math.min(1.5, k)));
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;

  const noise = fbm(seed, 2, 0.45, 2);
  const scale = 0.032;
  const field = sampleField(cols, rows, (x, y) => noise(x * scale, y * scale));

  ctx.save();
  const levels = 9;
  for (let i = 1; i < levels; i += 1) {
    ctx.strokeStyle = rgba(env, 0.55);
    ctx.lineWidth = 1.15 * k;
    ctx.beginPath();
    for (const s of isoLines(field, cols, rows, i / levels, cell, cell)) {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
  }
  ctx.restore();

  /* A pressure centre, marked as it would be on a chart. */
  const next = rng(seed);
  const lx = w * (0.25 + next() * 0.5);
  const ly = h * (0.25 + next() * 0.5);
  const r = Math.min(w, h) * 0.05;

  ctx.save();
  ctx.strokeStyle = rgba(ink, 0.55);
  ctx.lineWidth = 1.6 * k;
  ctx.beginPath();
  ctx.moveTo(lx - r, ly);
  ctx.lineTo(lx + r, ly);
  ctx.moveTo(lx, ly - r);
  ctx.lineTo(lx, ly + r);
  ctx.stroke();
  ctx.restore();
};

/* ---- PH · halftone ------------------------------------------------------
   A screen rotated to 15°, as a real one-colour halftone is, with dot area
   driven by a soft noise field. Rotation is what stops it reading as a
   grid of dots. */

const halftone: PlateSystem = (plate) => {
  const { ctx, w, h, seed, env } = plate;
  const pitch = Math.max(5, Math.min(w, h) / 30);
  const angle = (15 * Math.PI) / 180;
  const noise = fbm(seed, 3, 0.55, 2);
  const scale = 0.06;

  /* Cover the rotated frame's diagonal so no corner is left unscreened. */
  const reach = Math.hypot(w, h) / 2 + pitch * 2;
  const cx = w / 2;
  const cy = h / 2;

  ctx.save();
  ctx.fillStyle = rgba(env, 0.72);

  for (let y = -reach; y <= reach; y += pitch) {
    for (let x = -reach; x <= reach; x += pitch) {
      const px = cx + x * Math.cos(angle) - y * Math.sin(angle);
      const py = cy + x * Math.sin(angle) + y * Math.cos(angle);
      if (px < -pitch || px > w + pitch || py < -pitch || py > h + pitch) continue;

      const v = noise(px * scale, py * scale);
      /* Bias towards the light end: a plate that is mostly dark reads as a
         mistake rather than as an image. */
      const radius = Math.max(0, (v - 0.28)) * pitch * 0.72;
      if (radius <= 0.25) continue;

      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
};

/* ---- TH · rule ----------------------------------------------------------
   A thought is typography. Its plate is a rule, a tick, and a great deal of
   nothing — and holding that restraint is the hardest of the eight. */

const rule: PlateSystem = (plate) => {
  const { ctx, w, h, seed, ink, oxide } = plate;
  const next = rng(seed);
  const y = h * (0.42 + next() * 0.16);
  const from = w * (0.12 + next() * 0.1);
  const to = w * (0.72 + next() * 0.16);

  ctx.save();
  const k = strokeScale(w, h);
  ctx.strokeStyle = rgba(ink, 0.52);
  ctx.lineWidth = 1.15 * k;
  ctx.beginPath();
  ctx.moveTo(from, y);
  ctx.lineTo(to, y);
  ctx.stroke();

  ctx.strokeStyle = rgba(oxide, 0.8);
  ctx.lineWidth = 1.4 * k;
  const tick = from + (to - from) * (0.2 + next() * 0.6);
  ctx.beginPath();
  ctx.moveTo(tick, y - 5 * k);
  ctx.lineTo(tick, y + 5 * k);
  ctx.stroke();
  ctx.restore();
};

/* ---- AU · waveform ------------------------------------------------------
   An amplitude envelope with a decay, mirrored about the centre line, drawn
   as discrete samples rather than as a smooth curve. */

const waveform: PlateSystem = (plate) => {
  const { ctx, w, h, seed, ink, env } = plate;
  const next = rng(seed);
  const noise = fbm(seed + 41, 3, 0.6, 2.2);
  const mid = h / 2;
  const bar = 3;
  const gap = 2;
  const count = Math.floor(w / (bar + gap));
  const decay = 0.4 + next() * 0.5;

  ctx.save();
  ctx.fillStyle = rgba(env, 0.72);

  for (let i = 0; i < count; i += 1) {
    const t = i / count;
    const envelope = Math.exp(-t * decay * 2.4) * (0.35 + noise(t * 9, 0.5) * 0.75);
    const amplitude = Math.max(1.5, envelope * h * 0.42);
    const x = i * (bar + gap) + gap;
    ctx.fillRect(x, mid - amplitude, bar, amplitude * 2);
  }

  ctx.strokeStyle = rgba(ink, 0.32);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();
  ctx.restore();
};

/* ---- XP · lattice -------------------------------------------------------
   A seeded point set with short-range connections. Nodes are drawn over
   the edges so that junctions resolve cleanly. */

const lattice: PlateSystem = (plate) => {
  const { ctx, w, h, seed, ink, env } = plate;
  const next = rng(seed);
  /* Nodes per unit area rather than per plate, so a lattice at hero size
     is a lattice and not a handful of dots in a large empty box. */
  const count = Math.round(
    Math.min(120, Math.max(24, (w * h) / 5200)) + next() * 14,
  );
  const points = Array.from({ length: count }, () => ({
    x: w * (0.08 + next() * 0.84),
    y: h * (0.1 + next() * 0.8),
  }));

  const reach = Math.min(w, h) * (0.26 * Math.sqrt(34 / count) + 0.06);

  ctx.save();
  ctx.strokeStyle = rgba(env, 0.55);
  ctx.lineWidth = 0.95 * strokeScale(w, h);
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      if (!a || !b) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) > reach) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
  }
  ctx.stroke();

  ctx.fillStyle = rgba(ink, 0.6);
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

/* ---- DR · diagram -------------------------------------------------------
   A figure: axes, a scatter, and the line somebody fitted through it. The
   fit is a real least-squares regression on the plotted points, because a
   drawn-on trend line would be visible as a lie. */

const diagram: PlateSystem = (plate) => {
  const { ctx, w, h, seed, ink, env, oxide } = plate;
  const next = rng(seed);

  const left = w * 0.14;
  const right = w * 0.9;
  const top = h * 0.14;
  const bottom = h * 0.84;

  const k = strokeScale(w, h);

  ctx.save();
  ctx.strokeStyle = rgba(ink, 0.55);
  ctx.lineWidth = 1.15 * k;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();

  ctx.strokeStyle = rgba(ink, 0.34);
  ctx.lineWidth = k;
  ctx.beginPath();
  for (let i = 1; i <= 4; i += 1) {
    const y = bottom - ((bottom - top) * i) / 5;
    ctx.moveTo(left - 3, y);
    ctx.lineTo(left + 3, y);
    const x = left + ((right - left) * i) / 5;
    ctx.moveTo(x, bottom - 3);
    ctx.lineTo(x, bottom + 3);
  }
  ctx.stroke();
  ctx.restore();

  /* Minor ticks between the majors. Without them the axes read as two
     bare lines at any size above a thumbnail. */
  ctx.save();
  ctx.strokeStyle = rgba(ink, 0.14);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 20; i += 1) {
    if (i % 4 === 0) continue;
    const y = bottom - ((bottom - top) * i) / 20;
    ctx.moveTo(left - 2, y);
    ctx.lineTo(left + 2, y);
    const x = left + ((right - left) * i) / 20;
    ctx.moveTo(x, bottom - 2);
    ctx.lineTo(x, bottom + 2);
  }
  ctx.stroke();

  /* Gridlines on the majors, very faint. A figure this size with nothing
     between its axes and its data reads as an empty chart. */
  ctx.strokeStyle = rgba(ink, 0.08);
  ctx.beginPath();
  for (let i = 1; i <= 4; i += 1) {
    const y = bottom - ((bottom - top) * i) / 5;
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
  ctx.restore();

  const slope = (next() - 0.35) * 0.9;
  /* The sample scales with the width of the plot. A fixed count is right
     at thumbnail size and looks like a rounding error at full width. */
  const sampleSize = Math.round(
    Math.min(64, Math.max(14, (right - left) / 22)) + next() * 8,
  );
  const points = Array.from({ length: sampleSize }, () => {
    const t = next();
    const spread = (next() - 0.5) * 0.34;
    return {
      x: left + t * (right - left),
      y: bottom - (0.2 + t * slope + spread + 0.3) * (bottom - top) * 0.82,
      error: next() < 0.28 ? 3 + next() * 9 : 0,
    };
  }).filter((p) => p.y > top && p.y < bottom);

  ctx.save();
  ctx.fillStyle = rgba(env, 0.85);
  ctx.strokeStyle = rgba(env, 0.4);
  ctx.lineWidth = 1;
  for (const p of points) {
    /* Roughly one point in four carries an error bar. Real measurements
       have uncertainty and a scatter that admits none looks invented. */
    if (p.error > 0) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - p.error);
      ctx.lineTo(p.x, p.y + p.error);
      ctx.moveTo(p.x - 2.5, p.y - p.error);
      ctx.lineTo(p.x + 2.5, p.y - p.error);
      ctx.moveTo(p.x - 2.5, p.y + p.error);
      ctx.lineTo(p.x + 2.5, p.y + p.error);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (points.length > 2) {
    const n = points.length;
    const sx = points.reduce((s, p) => s + p.x, 0);
    const sy = points.reduce((s, p) => s + p.y, 0);
    const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
    const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
    const denominator = n * sxx - sx * sx;

    if (Math.abs(denominator) > 1e-6) {
      const m = (n * sxy - sx * sy) / denominator;
      const c = (sy - m * sx) / n;

      ctx.save();
      ctx.strokeStyle = rgba(oxide, 0.65);
      ctx.lineWidth = 1.2 * k;
      ctx.setLineDash([5 * k, 4 * k]);
      ctx.beginPath();
      ctx.moveTo(left, m * left + c);
      ctx.lineTo(right, m * right + c);
      ctx.stroke();
      ctx.restore();
    }
  }
};

export const PLATE_SYSTEMS = {
  contour,
  topography,
  isobar,
  halftone,
  rule,
  waveform,
  lattice,
  diagram,
} satisfies Record<string, PlateSystem>;

export type PlateSystemName = keyof typeof PLATE_SYSTEMS;
