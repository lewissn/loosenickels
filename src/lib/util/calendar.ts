import { calendarDate, type CalendarDate, type Instant } from "@/lib/archive/schema";

/* =========================================================================
   Calendar dates

   A calendar date is not a moment. This file exists because conflating the
   two is the single most damaging bug this product could ship: it would
   silently file photographs under the wrong day, and the damage would only
   become visible years later when somebody scrolled back through a holiday.

   The rules:

     - A day is decided in a time zone, always an explicit one. There is no
       function here that reads the system zone, because the server's zone is
       never the right answer.
     - Arithmetic on dates is done in UTC, where every day is exactly 24
       hours. Adding a day in a zone with daylight saving is how you end up
       with two 31 Octobers or none.
     - Nothing here formats for display in a locale-dependent way without
       being told which locale. The product is en-GB; that is stated, not
       inherited.
   ========================================================================= */

/** Unsafe cast used only where the value has just been constructed correctly. */
function asDate(value: string): CalendarDate {
  return calendarDate.parse(value);
}

/**
 * The calendar date an instant falls on, in a given zone.
 *
 * This is the function that decides which day a photograph belongs to. A
 * photograph taken at 23:40 in Tokyo and submitted from a server in Virginia
 * belongs to the Tokyo day, and it is this call — with the capture zone, not
 * the server zone — that says so.
 *
 * en-CA is used because its short date format is exactly ISO order. It is a
 * formatting trick, not a locale choice, and it is the only reliable way to
 * ask the platform "what was the wall-clock date there".
 */
export function dateIn(when: Date | Instant, timeZone: string): CalendarDate {
  const at = typeof when === "string" ? new Date(when) : when;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  return asDate(parts);
}

/** Today, in a given zone. The zone is required, deliberately. */
export function today(timeZone: string): CalendarDate {
  return dateIn(new Date(), timeZone);
}

/* ---- Arithmetic ---------------------------------------------------------
   All of it goes through UTC midnight, where a day is always 86,400,000
   milliseconds and no clock ever moves. */

function toUTC(date: CalendarDate): number {
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
}

function fromUTC(ms: number): CalendarDate {
  const at = new Date(ms);
  const y = String(at.getUTCFullYear()).padStart(4, "0");
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  const d = String(at.getUTCDate()).padStart(2, "0");
  return asDate(`${y}-${m}-${d}`);
}

const DAY_MS = 86_400_000;

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: CalendarDate, b: CalendarDate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** Sorts ascending. Lexical comparison is correct for this format. */
export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/* ---- Parts -------------------------------------------------------------- */

export function yearOf(date: CalendarDate): number {
  return Number(date.slice(0, 4));
}

/** 1-based, as humans count months. */
export function monthOf(date: CalendarDate): number {
  return Number(date.slice(5, 7));
}

export function dayOf(date: CalendarDate): number {
  return Number(date.slice(8, 10));
}

/** 0 = Monday, through 6 = Sunday. Weeks begin on Monday in en-GB. */
export function weekdayOf(date: CalendarDate): number {
  return (new Date(toUTC(date)).getUTCDay() + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** First and last dates of a month, for building a calendar grid. */
export function monthBounds(
  year: number,
  month: number,
): { first: CalendarDate; last: CalendarDate } {
  const mm = String(month).padStart(2, "0");
  return {
    first: asDate(`${year}-${mm}-01`),
    last: asDate(`${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, "0")}`),
  };
}

/** Every date in a year, in order. The spine a year mosaic is built on. */
export function datesInYear(year: number): CalendarDate[] {
  const out: CalendarDate[] = [];
  let cursor = asDate(`${year}-01-01`);
  const end = asDate(`${year}-12-31`);
  while (compareDates(cursor, end) <= 0) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/**
 * The same day and month in other years — the spine of On This Day.
 *
 * 29 February is handled by simply not existing in years that do not have
 * it. Silently sliding it to the 28th or the 1st of March would be inventing
 * a memory on a date it did not happen.
 */
export function sameDayAcrossYears(
  date: CalendarDate,
  fromYear: number,
  toYear: number,
): CalendarDate[] {
  const md = date.slice(5);
  const out: CalendarDate[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    if (md === "02-29" && !isLeapYear(y)) continue;
    out.push(asDate(`${y}-${md}`));
  }
  return out;
}

/* ---- Display ------------------------------------------------------------
   Dates are a major visual element in this product, not a caption. The three
   forms below are the only ones used, and each has a job:

     stamp    28 AUG 2026     the metadata line, set in mono
     full     28 August 2026  prose and page titles
     monument AUGUST          when the year or month is the composition   */

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS_SHORT = MONTHS_LONG.map((m) => m.slice(0, 3).toUpperCase());

/** Months are 1-12 from a validated date, so the fallback is unreachable —
    it exists to keep the lookup total rather than to handle a real case. */
export function monthName(month: number, short = false): string {
  return (short ? MONTHS_SHORT[month - 1] : MONTHS_LONG[month - 1]) ?? "";
}

export function stamp(date: CalendarDate): string {
  return `${dayOf(date)} ${monthName(monthOf(date), true)} ${yearOf(date)}`;
}

export function full(date: CalendarDate): string {
  return `${dayOf(date)} ${monthName(monthOf(date))} ${yearOf(date)}`;
}

/**
 * Time of day, in the zone the photograph was taken in.
 *
 * "18:42", never "6:42 PM". The product is en-GB and the metadata line is
 * set in mono, where a 24-hour clock is both shorter and steadier.
 */
export function clockTime(when: Instant, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(when));
}

/**
 * How a day is described relative to today, where that is worth saying.
 *
 * Returns null for anything more than a week old, because "347 days ago" is
 * a number, not a memory, and the date itself says more.
 */
export function relativeDay(
  date: CalendarDate,
  now: CalendarDate,
): string | null {
  const delta = daysBetween(date, now);
  if (delta === 0) return "Today";
  if (delta === 1) return "Yesterday";
  if (delta > 1 && delta < 7) {
    return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" })
      .format(new Date(toUTC(date)));
  }
  return null;
}
