import "server-only";
import type { Weather } from "@/lib/archive/schema";

/* =========================================================================
   The weather as it stood.

   Looked up rather than measured. A photograph carries where and when; the
   rest is a matter of historical record, and asking a weather archive after
   the fact is better than asking a phone at the time — it works for
   photographs taken before this app existed, it works identically for both
   clients, and it needs no entitlement from anybody.

   Open-Meteo's archive, which wants no key and asks nothing in return. If it
   is unreachable the day simply has no weather, which is a fact about the
   day rather than a failure of it: nothing here may fail a recording.
   ========================================================================= */

const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

/* WMO present-weather codes, as words. The full table has a hundred entries
   distinguishing "slight" from "moderate" drizzle; a memory needs the word
   somebody would use, so these are grouped to the phrase a person actually
   says about a day. */
const CONDITIONS: Array<[number[], string]> = [
  [[0], "Clear"],
  [[1, 2], "Mostly clear"],
  [[3], "Overcast"],
  [[45, 48], "Fog"],
  [[51, 53, 55, 56, 57], "Drizzle"],
  [[61, 63, 66, 80, 81], "Rain"],
  [[65, 67, 82], "Heavy rain"],
  [[71, 73, 75, 77, 85, 86], "Snow"],
  [[95, 96, 99], "Thunderstorm"],
];

function phrase(code: number | null | undefined): string | undefined {
  if (code === null || code === undefined) return undefined;
  return CONDITIONS.find(([codes]) => codes.includes(code))?.[1];
}

/**
 * @param at   The moment of capture. The hour of it is what is looked up —
 *             a day's weather is not one thing, and the temperature at the
 *             moment the shutter went is the only one that describes this
 *             photograph.
 */
export async function weatherAt(
  latitude: number,
  longitude: number,
  at: Date,
): Promise<Weather | undefined> {
  /* The archive lags real time by a few days, so a photograph taken this
     morning has no historical record yet. Asking anyway returns nulls, which
     is handled below — but the day is worth re-trying later, and returning
     undefined rather than an empty object is what lets the caller tell
     "no weather" from "not yet". */
  const day = at.toISOString().slice(0, 10);

  const url =
    `${ARCHIVE}?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
    `&start_date=${day}&end_date=${day}` +
    `&hourly=temperature_2m,precipitation,wind_speed_10m,weather_code` +
    `&timezone=UTC`;

  let body: {
    hourly?: {
      time?: string[];
      temperature_2m?: (number | null)[];
      precipitation?: (number | null)[];
      wind_speed_10m?: (number | null)[];
      weather_code?: (number | null)[];
    };
  };

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return undefined;
    body = await response.json();
  } catch {
    /* Unreachable, timed out, rate limited. The photograph is already safe
       and the day simply has no weather; nothing here may fail a recording. */
    return undefined;
  }

  const times = body.hourly?.time ?? [];
  if (!times.length) return undefined;

  /* The hour of capture, found by name rather than by index arithmetic —
     the array is hourly from midnight UTC, but trusting that and being wrong
     silently attributes one hour's weather to another. */
  const wanted = `${day}T${String(at.getUTCHours()).padStart(2, "0")}:00`;
  const i = times.indexOf(wanted);
  if (i < 0) return undefined;

  const temperature = body.hourly?.temperature_2m?.[i];
  const precipitation = body.hourly?.precipitation?.[i];
  const wind = body.hourly?.wind_speed_10m?.[i];
  const conditions = phrase(body.hourly?.weather_code?.[i]);

  const weather: Weather = {
    temperatureC: temperature ?? undefined,
    conditions,
    precipitationMm: precipitation ?? undefined,
    /* km/h from the API, metres per second in the schema. Storage does not
       convert for presentation, but it does insist on one unit. */
    windMs: wind === null || wind === undefined
      ? undefined
      : Number((wind / 3.6).toFixed(1)),
  };

  /* An hour the archive has not filled in yet reads as an object of
     undefineds, which would be stored and then never retried. */
  return Object.values(weather).some((v) => v !== undefined) ? weather : undefined;
}
