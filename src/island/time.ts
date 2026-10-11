import { SEASON_NAMES } from "./seasons";

/* The island's clock. A day lasts 48 seconds and a season two and a half
   days, so a year goes round in about eight minutes.

   Simulated time is counted in seconds from midnight on the first day of
   spring. Debug links describe it in days instead (?t=7.75 is dusk on the
   first day of winter), which is easier to reason about. */

export const DAY = 48;
export const SEASON_DAYS = 2.5;
export const YEAR_DAYS = SEASON_DAYS * 4;

/** Just after dawn, early spring. */
export const START_DAY = 0.27;

/** 0–1 through the current day, from midnight. */
export const dayFraction = (simT: number) => (((simT % DAY) + DAY) % DAY) / DAY;

/** 0–4 through the year, one unit per season. */
export const yearPosition = (simT: number) => (((simT / (DAY * SEASON_DAYS)) % 4) + 4) % 4;

const timeName = (f: number) =>
  f < 0.21 ? "night" : f < 0.3 ? "dawn" : f < 0.45 ? "morning" : f < 0.55 ? "midday" : f < 0.7 ? "afternoon" : f < 0.79 ? "dusk" : "night";

/** "early spring · dawn" */
export function describe(simT: number) {
  const yearPos = yearPosition(simT);
  const f = yearPos % 1, stage = f < 0.33 ? "early" : f < 0.66 ? "mid" : "late";
  return `${stage} ${SEASON_NAMES[Math.floor(yearPos) % 4]} · ${timeName(dayFraction(simT))}`;
}
