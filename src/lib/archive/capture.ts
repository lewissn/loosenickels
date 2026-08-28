import { calendarDate, instant, type CalendarDate, type Instant } from "./schema";
import { today } from "@/lib/util/calendar";

/* =========================================================================
   Which day a photograph belongs to

   The rule this file exists to get right, stated once:

     EXIF's DateTimeOriginal is *local time at the camera*. Its date
     component is therefore already the calendar date the photographer would
     name, whatever zone they were standing in and whatever zone the server
     is in.

   That is the whole trick, and it is why a photograph taken at 23:40 in
   Tokyo files under that Tokyo day without anyone having to know it was
   Tokyo. The naive implementation — parse to a UTC instant, then format it
   back — is what moves it to the wrong day.

   The offset tag, where a camera records one, is only needed to turn the
   reading into a real moment. It is not needed to decide the date.
   ========================================================================= */

export interface CaptureInput {
  /** "2026-08-28T18:42:11", as the camera wrote it. No zone. */
  capturedAtLocal?: string;
  /** "+09:00", where the camera recorded it. Often absent. */
  captureOffset?: string;
  /** The archive owner's zone, used only when the file says nothing. */
  timeZone: string;
}

export interface Capture {
  /** The day this photograph belongs to. */
  date: CalendarDate;
  /** A real moment, where one could be established. */
  capturedAt?: Instant;
  /** The zone the reading is expressed in. */
  captureTimeZone?: string;
  /**
   * How the date was arrived at, so the interface can say so. A date derived
   * from the clock rather than from the file is a guess, and the person
   * recording the day should be able to see that and change it.
   */
  source: "exif-offset" | "exif-local" | "clock";
}

export function resolveCapture(input: CaptureInput): Capture {
  const local = input.capturedAtLocal;

  if (local && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) {
    const date = calendarDate.parse(local.slice(0, 10));

    /* The camera recorded its offset: the reading is a genuine moment. */
    if (input.captureOffset && /^[+-]\d{2}:\d{2}$/.test(input.captureOffset)) {
      return {
        date,
        capturedAt: instant.parse(`${withSeconds(local)}${input.captureOffset}`),
        captureTimeZone: input.captureOffset,
        source: "exif-offset",
      };
    }

    /* No offset. The date is still certain — it is the local date the camera
       wrote. The *moment* is not, so it is inferred using the owner's zone,
       which is right for the overwhelmingly common case of someone at home
       and merely approximate when travelling. The date, which is the thing
       the archive is organised by, is unaffected either way. */
    const offset = offsetOf(local, input.timeZone);
    return {
      date,
      capturedAt: offset ? instant.parse(`${withSeconds(local)}${offset}`) : undefined,
      captureTimeZone: input.timeZone,
      source: "exif-local",
    };
  }

  /* Nothing in the file. Fall back to now, in the owner's zone — never the
     server's. */
  return {
    date: today(input.timeZone),
    capturedAt: instant.parse(new Date().toISOString().replace("Z", "+00:00")),
    captureTimeZone: input.timeZone,
    source: "clock",
  };
}

function withSeconds(local: string): string {
  return local.length === 16 ? `${local}:00` : local.slice(0, 19);
}

/**
 * The UTC offset a zone was using at a given wall-clock reading.
 *
 * Asked of the platform rather than computed, because the answer depends on
 * daylight saving and on decades of political decisions that no arithmetic
 * will reproduce. Returns undefined rather than guessing if the zone is not
 * one the runtime recognises.
 */
export function offsetOf(localReading: string, timeZone: string): string | undefined {
  try {
    /* Interpreting the reading as UTC gets the right side of any transition
       in every case except the hour or two around one, which is close enough
       to name the offset — and the date, which is what matters, is taken from
       the reading itself rather than from this. */
    const probe = new Date(`${withSeconds(localReading)}Z`);
    if (Number.isNaN(probe.getTime())) return undefined;

    const name = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(probe)
      .find((p) => p.type === "timeZoneName")?.value;

    if (!name) return undefined;
    if (name === "GMT" || name === "UTC") return "+00:00";

    const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return undefined;

    const [, sign, hours, minutes] = m;
    return `${sign}${(hours ?? "0").padStart(2, "0")}:${minutes ?? "00"}`;
  } catch {
    return undefined;
  }
}
