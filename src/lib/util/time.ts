/* =========================================================================
   Time

   The archive treats time as metadata rather than as decoration. It knows
   the season, the phase of the moon and whether it is dark, and it uses
   that knowledge sparingly: the palette shifts after dark, and the
   institutional readouts state the facts without comment.

   Nothing here is a gimmick and nothing here animates.
   ========================================================================= */

export type Season = "winter" | "spring" | "summer" | "autumn";
export type Light = "day" | "dark";

/** Northern hemisphere, by meteorological convention — whole months. */
export function seasonOf(date: Date): Season {
  const month = date.getMonth();
  if (month <= 1 || month === 11) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
}

/**
 * Whether the institution considers itself to be after dark.
 *
 * Deliberately not a sunrise calculation. The archive is not attempting to
 * track the sun; it is observing that a website read at eleven at night
 * should not be the same colour as one read at eleven in the morning.
 */
export function lightOf(date: Date): Light {
  const hour = date.getHours();
  return hour < 7 || hour >= 20 ? "dark" : "day";
}

const SYNODIC = 29.530588853;
/** A known new moon: 2000-01-06 18:14 UTC. */
const EPOCH = Date.UTC(2000, 0, 6, 18, 14) / 86_400_000;

export interface MoonPhase {
  /** 0 at new, 0.5 at full. */
  fraction: number;
  /** Proportion of the disc illuminated, 0–1. */
  illumination: number;
  name: string;
}

export function moonPhase(date: Date): MoonPhase {
  const days = date.getTime() / 86_400_000 - EPOCH;
  const fraction = ((days / SYNODIC) % 1 + 1) % 1;
  const illumination = (1 - Math.cos(fraction * Math.PI * 2)) / 2;

  const names = [
    "New",
    "Waxing crescent",
    "First quarter",
    "Waxing gibbous",
    "Full",
    "Waning gibbous",
    "Last quarter",
    "Waning crescent",
  ] as const;

  /* Offset by half a segment so each name is centred on its phase rather
     than starting at it. */
  const index = Math.floor(((fraction + 1 / 16) % 1) * 8) % 8;

  return { fraction, illumination, name: names[index] ?? "New" };
}

/* ---- Formatting ---------------------------------------------------------
   The institution writes dates one way. These are the only functions that
   decide what that way is. */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** 2026-10-04 → 4 October 2026 */
export function longDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** 2026-10-04 → October 2026 */
export function monthYear(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** 2026-10-04 → 2026.10.04 — for use in tabular and metadata settings. */
export function stampDate(iso: string): string {
  return iso.replace(/-/g, ".");
}

export function yearOf(iso: string): string {
  return iso.slice(0, 4);
}

/* ---- Coordinates --------------------------------------------------------
   Degrees and decimal minutes, which is the convention the archive has
   settled on and applies without exception. */

export function formatCoordinates(lat: number, lon: number): string {
  const part = (value: number, positive: string, negative: string): string => {
    const hemisphere = value >= 0 ? positive : negative;
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutes = (absolute - degrees) * 60;
    return `${degrees}° ${minutes.toFixed(3)}′ ${hemisphere}`;
  };

  return `${part(lat, "N", "S")}  ${part(lon, "E", "W")}`;
}
