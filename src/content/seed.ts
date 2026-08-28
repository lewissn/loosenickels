import {
  assetId,
  calendarDate,
  dayEntryId,
  instant,
  profile,
  revisionId,
  userId,
  type Camera,
  type DayVisibility,
  type EntryLocation,
  type Weather,
} from "@/lib/archive/schema";

/* =========================================================================
   Seed archive

   Development scaffolding. A fabricated fortnight or so of days, spread
   across three years, existing so that the viewer, the calendar and the
   metadata typography can be designed against something with real shape.

   It carries no photographs. The images below are generated fields, not
   pictures — they exist to give the composition honest aspect ratios and
   honest tones to react to, and they will look like exactly what they are.
   Real photographs replace them the moment there are any.

   Everything is validated at module load, so a malformed seed record fails
   the build rather than the page.
   ========================================================================= */

/* ---- Generated fields ---------------------------------------------------
   A soft two-tone SVG, deterministic in its seed. Not decoration and not a
   design element: a stand-in with a known lightness, so that the
   image-responsive parts of the interface have something to respond to. */

function field(from: string, to: string, w: number, h: number, angle = 20): string {
  /* The width and height attributes are not optional here. An SVG carrying
     only a viewBox has no intrinsic size, so `width: auto` resolves against
     the browser's 300x150 default rather than against the picture — which
     collapses any layout that sizes a photograph from its own dimensions.
     A real photograph always states its size; the stand-in must too. */
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" gradientTransform="rotate(${angle})">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/* ---- The account -------------------------------------------------------- */

export const SEED_PROFILE = profile.parse({
  id: userId.parse("seed-user"),
  username: "seed",
  displayName: "Seed Account",
  bio: "Development data. Not a person.",
  /* Public, so that the public-profile surfaces can be built and looked at.
     The real default is private, and the schema enforces that; this is an
     explicit override for a fixture, which is the only way it should ever
     happen. */
  visibility: "public",
  discoverable: false,
  timeZone: "Europe/London",
  locationPrecision: "locality",
  createdAt: instant.parse("2024-01-01T00:00:00+00:00"),
  updatedAt: instant.parse("2024-01-01T00:00:00+00:00"),
});

/* ---- Days --------------------------------------------------------------- */

interface SeedDay {
  id: ReturnType<typeof dayEntryId.parse>;
  currentRevisionId: ReturnType<typeof revisionId.parse>;
  assetId: ReturnType<typeof assetId.parse>;
  date: ReturnType<typeof calendarDate.parse>;
  src: string;
  alt: string;
  width: number;
  height: number;
  focal?: [number, number];
  placeholder?: string;
  lightness: number;
  tone: string;
  note?: string;
  visibility: DayVisibility;
  capturedAt?: ReturnType<typeof instant.parse>;
  captureTimeZone?: string;
  location?: EntryLocation;
  weather?: Weather;
  camera?: Camera;
  revisionCount: number;
  createdAt: ReturnType<typeof instant.parse>;
}

interface SeedInput {
  date: string;
  from: string;
  to: string;
  /** Shape, as a ratio. Scaled to real pixel dimensions by `day()`. */
  w: number;
  h: number;
  lightness: number;
  tone: string;
  alt: string;
  note?: string;
  visibility?: DayVisibility;
  at?: string;
  zone?: string;
  place?: EntryLocation;
  weather?: Weather;
  camera?: Camera;
  revisions?: number;
}

let counter = 0;

/**
 * Long edge, in pixels.
 *
 * The entries below state their shape as a ratio, because that is what is
 * worth reading at a glance, but `width` and `height` on a MediaAsset are
 * genuine pixel dimensions and everything downstream treats them as such —
 * the <img> carries them as attributes, which is what reserves the right
 * space before the image decodes. Handing it a 3 and a 2 produces a
 * three-pixel-wide photograph, which is precisely what happened.
 */
const LONG_EDGE = 3600;

function day(input: SeedInput): SeedDay {
  const n = ++counter;
  const date = calendarDate.parse(input.date);
  const captured = input.at ? instant.parse(input.at) : undefined;

  const scale = LONG_EDGE / Math.max(input.w, input.h);
  const width = Math.round(input.w * scale);
  const height = Math.round(input.h * scale);

  return {
    id: dayEntryId.parse(`seed-day-${n}`),
    currentRevisionId: revisionId.parse(`seed-rev-${n}`),
    assetId: assetId.parse(`seed-asset-${n}`),
    date,
    src: field(input.from, input.to, width, height),
    alt: input.alt,
    width,
    height,
    lightness: input.lightness,
    tone: input.tone,
    note: input.note,
    visibility: input.visibility ?? "public",
    capturedAt: captured,
    captureTimeZone: input.zone ?? "Europe/London",
    location: input.place,
    weather: input.weather,
    camera: input.camera,
    revisionCount: input.revisions ?? 1,
    createdAt: captured ?? instant.parse(`${input.date}T12:00:00+00:00`),
  };
}

const LEICA: Camera = { make: "Leica", model: "Q2", focalLength: 28, aperture: 1.7, shutterSpeed: 0.004, iso: 200 };
const PHONE: Camera = { make: "Apple", model: "iPhone 15 Pro", focalLength: 6.9, aperture: 1.78, iso: 64 };

export const SEED_DAYS: SeedDay[] = [
  /* A run of consecutive days, so the scroll-through-time viewer has
     genuine adjacency to move through rather than isolated samples. */
  day({
    date: "2026-08-28", from: "#2a2f36", to: "#0e1013", w: 3, h: 2, lightness: 0.18,
    tone: "#1b1f24", alt: "A dark field, weighted to the lower right.",
    note: "We walked until neither of us knew where the hotel was.",
    at: "2026-08-28T18:42:00+00:00", zone: "Atlantic/Reykjavik",
    place: { label: "Reykjavik, Iceland", region: "Capital Region", country: "Iceland", precision: "locality", coordinates: { lat: 64.1466, lon: -21.9426 } },
    weather: { temperatureC: 11, conditions: "Light rain", daylight: true },
    camera: LEICA, revisions: 3,
  }),
  day({
    date: "2026-08-27", from: "#d8d2c4", to: "#b6ab97", w: 2, h: 3, lightness: 0.76,
    tone: "#cbc3b2", alt: "A pale upright field, warm at the top.",
    at: "2026-08-27T09:15:00+01:00",
    place: { label: "London, England", region: "England", country: "United Kingdom", precision: "locality", coordinates: { lat: 51.5024, lon: -0.1249 } },
    weather: { temperatureC: 19, conditions: "Clear", daylight: true },
    camera: PHONE,
  }),
  day({
    date: "2026-08-26", from: "#6b7c6a", to: "#2f3a30", w: 3, h: 2, lightness: 0.38,
    tone: "#4a5749", alt: "A green field falling into shadow.",
    note: "Rain all afternoon. Went anyway.",
    at: "2026-08-26T16:03:00+01:00",
    place: { label: "Glen Coe, Scotland", region: "Scotland", country: "United Kingdom", precision: "region", coordinates: { lat: 56.6667, lon: -5.1 } },
    weather: { temperatureC: 9, conditions: "Heavy rain", precipitationMm: 4.2, windMs: 11, daylight: true },
    camera: LEICA,
  }),
  day({
    date: "2026-08-25", from: "#c9633f", to: "#5e2417", w: 1, h: 1, lightness: 0.44,
    tone: "#8f4028", alt: "A square field, rust to deep brown.",
    at: "2026-08-25T20:31:00+01:00",
    /* Private: the interface must be built knowing that a private day sits
       inside a public archive without announcing itself. */
    visibility: "private",
    weather: { temperatureC: 16, conditions: "Clear", daylight: false },
  }),
  day({
    date: "2026-08-24", from: "#e6e2d8", to: "#cfc9bb", w: 3, h: 2, lightness: 0.85,
    tone: "#dcd7cb", alt: "An almost white field.",
    note: "Nothing happened. Recorded anyway.",
    at: "2026-08-24T12:00:00+01:00", camera: PHONE,
  }),
  day({
    date: "2026-08-22", from: "#3d4a63", to: "#151a26", w: 2, h: 3, lightness: 0.22,
    tone: "#26304a", alt: "An upright field in deep blue.",
    at: "2026-08-22T22:14:00+01:00",
    weather: { temperatureC: 13, conditions: "Overcast", daylight: false },
    camera: LEICA,
  }),
  /* A deliberate gap at 23 August. Missing days are part of the record and
     the interface must draw the absence rather than close over it. */
  day({
    date: "2026-08-21", from: "#8a7f6b", to: "#4a4235", w: 3, h: 2, lightness: 0.42,
    tone: "#6a6050", alt: "A field the colour of dry grass.",
    at: "2026-08-21T14:47:00+01:00",
    place: { label: "Kansai, Japan", region: "Kansai", country: "Japan", precision: "region", coordinates: { lat: 34.6851, lon: 135.8048 } },
    weather: { temperatureC: 31, conditions: "Clear", daylight: true }, camera: PHONE,
  }),
  /* Late evening in Tokyo. The single most important record in this fixture:
     23:40 local is already the 20th in UTC, and if the date ever renders as
     the 19th then the timezone handling has broken. */
  day({
    date: "2026-08-20", from: "#1f2430", to: "#090b10", w: 3, h: 2, lightness: 0.12,
    tone: "#141822", alt: "A near black field with a faint horizon.",
    note: "23:40, and still the twentieth.",
    at: "2026-08-20T23:40:00+09:00", zone: "Asia/Tokyo",
    place: { label: "Tokyo, Japan", region: "Kanto", country: "Japan", precision: "locality", coordinates: { lat: 35.6762, lon: 139.6503 } },
    weather: { temperatureC: 27, conditions: "Clear", daylight: false }, camera: PHONE,
  }),

  /* Earlier years, so On This Day and the year mosaics have something to
     reach back into. */
  day({
    date: "2025-08-28", from: "#a8bcc4", to: "#5b737e", w: 3, h: 2, lightness: 0.62,
    tone: "#7f97a1", alt: "A pale blue field.",
    note: "Same date, different year.",
    at: "2025-08-28T11:20:00+01:00",
    place: { label: "Brighton, England", region: "England", country: "United Kingdom", precision: "locality", coordinates: { lat: 50.8225, lon: -0.1372 } },
    weather: { temperatureC: 22, conditions: "Clear", daylight: true }, camera: LEICA,
  }),
  day({
    date: "2025-12-31", from: "#40323f", to: "#16111a", w: 2, h: 3, lightness: 0.2,
    tone: "#2a2029", alt: "An upright field in dim plum.",
    at: "2025-12-31T23:55:00+00:00",
    weather: { temperatureC: 3, conditions: "Clear", daylight: false },
  }),
  day({
    date: "2026-01-01", from: "#f0ece1", to: "#cdc6b6", w: 3, h: 2, lightness: 0.88,
    tone: "#e0dacd", alt: "A bright pale field.",
    note: "First of the year.",
    at: "2026-01-01T09:02:00+00:00",
    weather: { temperatureC: 1, conditions: "Fog", daylight: true },
  }),
  day({
    date: "2024-08-28", from: "#6e5a44", to: "#2c2319", w: 1, h: 1, lightness: 0.3,
    tone: "#4b3d2e", alt: "A square field in brown.",
    at: "2024-08-28T17:30:00+01:00", camera: PHONE,
  }),
];

/** Guards the fixture's own invariant: one entry per user per date. */
const seen = new Set<string>();
for (const d of SEED_DAYS) {
  if (seen.has(d.date)) {
    throw new Error(`Seed archive has two entries for ${d.date}.`);
  }
  seen.add(d.date);
}
