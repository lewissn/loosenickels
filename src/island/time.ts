import { SEASON_NAMES } from "./seasons";

/* The island's clock. A day lasts two minutes and a season two days, so a
   year goes round in about sixteen minutes.

   Days are long and nights short: the clock runs through "sun time" (where
   0.25 is sunrise, 0.5 noon and 0.75 sunset) slowly by day and quickly by
   night, on a smooth curve, so about two-thirds of every day is daylight.
   Everything that follows the hour — the sky, the cottage's lights, the
   mist, the farmer's day — reads sun time.

   Simulated time is counted in seconds from midnight on the first day of
   spring. Debug links describe it in days, with the fraction in sun time
   (?t=7.75 is sunset on the first day of winter), which is easier to reason
   about. */

export const DAY = 120;
export const SEASON_DAYS = 2;
export const YEAR_DAYS = SEASON_DAYS * 4;

/** How much slower the sun moves at noon than on average (and faster at midnight). */
const LINGER = 0.5;

/** Just after sunrise, early spring, in days (sun time). */
export const START_DAY = 0.27;

/** 0–1 through the current day by the clock, from midnight. */
export const dayFraction = (simT: number) => (((simT % DAY) + DAY) % DAY) / DAY;

/** The clock's day fraction as sun time: 0.25 sunrise, 0.5 noon, 0.75 sunset. */
export const sunTime = (dayF: number) => dayF + (LINGER / (2 * Math.PI)) * Math.sin(2 * Math.PI * dayF);

/** How fast sun time moves at a given clock time, relative to the clock. */
export const sunRate = (dayF: number) => 1 + LINGER * Math.cos(2 * Math.PI * dayF);

/** The clock time at which the sun reaches a given sun time (0–1). */
export function clockAt(sun: number) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (sunTime(mid) < sun) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Simulated seconds for a start given in days, the fraction in sun time. */
export function simTimeAt(days: number) {
  const whole = Math.floor(days);
  return (whole + clockAt(days - whole)) * DAY;
}

/** 0–4 through the year, one unit per season. */
export const yearPosition = (simT: number) => (((simT / (DAY * SEASON_DAYS)) % 4) + 4) % 4;

const timeName = (f: number) =>
  f < 0.21 ? "night" : f < 0.3 ? "dawn" : f < 0.45 ? "morning" : f < 0.55 ? "midday" : f < 0.7 ? "afternoon" : f < 0.79 ? "dusk" : "night";

/** "early spring · dawn" */
export function describe(simT: number) {
  const yearPos = yearPosition(simT);
  const f = yearPos % 1, stage = f < 0.33 ? "early" : f < 0.66 ? "mid" : "late";
  return `${stage} ${SEASON_NAMES[Math.floor(yearPos) % 4]} · ${timeName(sunTime(dayFraction(simT)))}`;
}
