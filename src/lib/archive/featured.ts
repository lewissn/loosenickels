import { mulberry32 } from "./source";

/* =========================================================================
   Which record is on display

   The home page shows a different record each day. That used to be a
   server concern, refreshed on a revalidation interval — which worked
   until the site became a static export, at which point the interval
   became decoration and the record froze on whatever the last deploy
   happened to draw.

   So the choice is made here instead: a pure function of the day and the
   pool, agreed on by the server at build time and by the browser on the
   day it is actually being read. The server's answer is what gets served
   and what a reader without JavaScript sees; the browser corrects it if
   the build has since gone stale, which it will have by the following
   morning.
   ========================================================================= */

/** Days since the epoch. Stable within a day, different the next. */
export function dayIndex(now: number = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

/**
 * The record on display for a given day.
 *
 * Deterministic, so the same day and the same pool give the same answer
 * on either side of the wire. Adding a record reshuffles which record
 * falls on which day, which is a property the archive can live with.
 */
export function featuredFor<T>(pool: readonly T[], day: number): T | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(mulberry32(day)() * pool.length)] ?? null;
}
