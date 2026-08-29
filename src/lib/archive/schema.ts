import { z } from "zod";

/* =========================================================================
   Schema

   The contract between the product and the data. Every shape here is plain
   serialisable JSON that maps cleanly onto Postgres columns and jsonb, so
   the web client, the iOS client and the database are all describing the
   same objects rather than three similar ones.

   The whole product is one sentence of structure:

       User -> DayEntry -> PhotoRevision -> MediaAsset

   A user has at most one day entry per calendar date. A day entry points at
   one current revision. A revision points at one stored image. Replacing a
   photograph adds a revision; it never removes one.

   Rules observed here:
     - No React, no presentation, no rendering decisions stored on a record.
     - Optional means genuinely optional. Photographs arrive without
       metadata all the time and must still be accepted.
     - Nothing is named after the codename.
   ========================================================================= */

/* ---- Identifiers --------------------------------------------------------
   Postgres will issue uuids. Validating that shape here would mean seed and
   fixture data had to carry real uuids to be legal, which buys nothing — the
   database is the thing that actually enforces identity. So: a non-empty
   opaque string, branded per entity so a user id cannot be passed where a
   day id is expected. The compiler catches the mistake that would actually
   happen; zod catches the malformed record. */

const opaqueId = z.string().min(1);

export const userId = opaqueId.brand<"UserId">();
export const dayEntryId = opaqueId.brand<"DayEntryId">();
export const revisionId = opaqueId.brand<"RevisionId">();
export const assetId = opaqueId.brand<"AssetId">();

export type UserId = z.infer<typeof userId>;
export type DayEntryId = z.infer<typeof dayEntryId>;
export type RevisionId = z.infer<typeof revisionId>;
export type AssetId = z.infer<typeof assetId>;

/* ---- Time ---------------------------------------------------------------
   The most important distinction in this schema, and the one most easily got
   wrong.

   A CalendarDate is a date in the human sense: the day the photograph
   belongs to, as the person who took it would name it. It is not a moment,
   and it is never derived by converting a UTC timestamp — a photograph taken
   at 23:40 in Tokyo belongs to that Tokyo day regardless of where the server
   happens to live.

   An Instant is a genuine moment, stored as ISO 8601 with an offset. Capture
   time and submission time are instants. The date an entry belongs to is not.

   The two are separate branded types precisely so that nobody can assign one
   to the other by accident. */

export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "A calendar date takes the form YYYY-MM-DD.",
  })
  .brand<"CalendarDate">();

export type CalendarDate = z.infer<typeof calendarDate>;

export const instant = z.iso.datetime({ offset: true }).brand<"Instant">();
export type Instant = z.infer<typeof instant>;

/** IANA zone name — "Europe/London", "Asia/Tokyo". Never a raw offset:
    offsets do not survive daylight saving and cannot be reasoned about. */
export const timeZone = z.string().min(1);

/* ---- Visibility ---------------------------------------------------------
   Private by default, everywhere, without exception. Every default in this
   file that concerns who can see something resolves to the closed option, so
   that forgetting to set a value can never leak anything. */

export const dayVisibility = z.enum(["private", "public", "unlisted"]);
export type DayVisibility = z.infer<typeof dayVisibility>;

/* Three levels, matching `profile_visibility` in the migration. The middle
   one is the point: `public` means a profile answers when its address is
   known, `discoverable` additionally means it may be *found* — returned by
   `findProfiles`, listed, suggested. Someone who publishes an archive for
   the people they gave the link to has not thereby volunteered to be
   searchable by strangers, and collapsing the two would make that choice
   for them. */
export const profileVisibility = z.enum(["private", "public", "discoverable"]);
export type ProfileVisibility = z.infer<typeof profileVisibility>;

/** Whether a profile may be returned by a search. Never a private one. */
export function isDiscoverable(v: ProfileVisibility): boolean {
  return v === "discoverable";
}

/** Whether a profile answers at all to someone who is not its owner. */
export function isReachable(v: ProfileVisibility): boolean {
  return v !== "private";
}

/* ---- Location precision -------------------------------------------------
   A photograph can carry the coordinates of someone's front door. The
   product stores that precisely, because a private map is one of the things
   that makes an archive worth keeping, and publishes only what the owner has
   chosen to publish.

   The ladder is strictly monotonic in how much it reveals, which is what
   makes it safe to reason about: a comparison is then enough to decide
   whether a given field may be shown.

     hidden       nothing at all
     region       "Scotland", "Kansai"
     locality     "Reykjavik, Iceland"
     approximate  coordinates deliberately blurred to roughly a kilometre
     precise      the coordinates as recorded

   The brief lists these in a slightly different order. They are ordered here
   by disclosure rather than by kind, because the whole value of the ladder is
   that a >= comparison means "reveals at least as much". */

export const LOCATION_PRECISION = [
  "hidden",
  "region",
  "locality",
  "approximate",
  "precise",
] as const;

export const locationPrecision = z.enum(LOCATION_PRECISION);
export type LocationPrecision = z.infer<typeof locationPrecision>;

/** Rank on the disclosure ladder. Higher reveals more. */
export function precisionRank(p: LocationPrecision): number {
  return LOCATION_PRECISION.indexOf(p);
}

/** Whether `have` may be shown to someone allowed only `allowed`. */
export function precisionPermits(
  allowed: LocationPrecision,
  have: LocationPrecision,
): boolean {
  return precisionRank(have) <= precisionRank(allowed);
}

/* ---- Coordinates -------------------------------------------------------- */

export const coordinates = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Metres of uncertainty as reported by the capturing device, if it said. */
  accuracy: z.number().positive().optional(),
  /** Metres above sea level, where known. */
  elevation: z.number().optional(),
});

export type Coordinates = z.infer<typeof coordinates>;

/**
 * Where a photograph was taken.
 *
 * `coordinates` is the private truth and is never serialised to a client
 * that has not earned it. `label` is the human place name, resolved once at
 * processing time and then kept. `precision` is the most that may be
 * disclosed to anyone who is not the owner.
 */
export const location = z.object({
  coordinates: coordinates.optional(),
  /** "Reykjavik, Iceland". Resolved when the entry is processed, then kept. */
  label: z.string().optional(),
  /** The broader containing area, for when only `region` may be shown. */
  region: z.string().optional(),
  country: z.string().optional(),
  /** Defaults closed. Opening it is always a deliberate act. */
  precision: locationPrecision.default("hidden"),
});

export type EntryLocation = z.infer<typeof location>;

/* ---- Weather ------------------------------------------------------------
   Resolved once, when the entry is processed, and then stored. The
   alternative — querying a weather service every time an old photograph is
   viewed — would be slower, would cost money forever, and would quietly
   rewrite history as providers revise their records.

   Supplementary, always. A memory is not a weather dashboard. */

export const weather = z.object({
  /** Degrees Celsius. Presentation converts; storage does not. */
  temperatureC: z.number().optional(),
  /** Short human phrase: "Light rain", "Clear". */
  conditions: z.string().optional(),
  /** Millimetres in the hour of capture. */
  precipitationMm: z.number().nonnegative().optional(),
  /** Metres per second. */
  windMs: z.number().nonnegative().optional(),
  sunrise: instant.optional(),
  sunset: instant.optional(),
  /** Whether the photograph was taken between sunrise and sunset. */
  daylight: z.boolean().optional(),
});

export type Weather = z.infer<typeof weather>;

/* ---- Camera -------------------------------------------------------------
   Read from EXIF where it exists. Screenshots, exports and edited images
   carry none of this, and that must never block a submission. */

export const camera = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  lens: z.string().optional(),
  /** Millimetres, as recorded — not 35mm-equivalent unless the file said so. */
  focalLength: z.number().positive().optional(),
  /** The denominator of the aperture: 1.8 for f/1.8. */
  aperture: z.number().positive().optional(),
  /** Seconds. 0.004 for 1/250. */
  shutterSpeed: z.number().positive().optional(),
  iso: z.number().int().positive().optional(),
});

export type Camera = z.infer<typeof camera>;

/* ---- Media assets -------------------------------------------------------
   A stored image, independent of whatever points at it.

   Originals are preserved and never served into a mosaic. The client asks
   for a variant by intent — a thumbnail for a year view, a large for the
   cinematic viewer — never by pixel dimension, so that changing the ladder
   later stays a server-side decision.

   `storageKey` is an object-storage key, not a URL. URLs are minted at read
   time, signed and expiring, because a permanent guessable URL to a private
   photograph is a permanent leak. */

/* The names are `media_variant` in the migration, not a parallel vocabulary.
   `original` is in the list because the original is a stored object like any
   other and the pipeline has to be able to name it — but it is the one
   variant never handed to a non-owner, because its embedded EXIF carries the
   GPS tag out past any redaction of the location columns. */
export const VARIANTS = [
  "original",
  /* A decodable transcode of an original the server cannot open — an iPhone
     HEIC, in practice. It exists only so the pipeline has something to read,
     is owner-only exactly as the original is (it carries the same EXIF, and
     the same GPS tag with it), and may be swept once the renditions exist. */
  "source",
  "large",
  "medium",
  "thumbnail",
] as const;
export const variantName = z.enum(VARIANTS);
export type VariantName = z.infer<typeof variantName>;

export const variant = z.object({
  storageKey: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteSize: z.number().int().positive().optional(),
});

export type Variant = z.infer<typeof variant>;

/**
 * How far an upload has got.
 *
 * The interface must remain usable at every one of these states. A
 * photograph that has been received but not yet resized is a photograph the
 * user has successfully recorded: the day is done. It simply displays from
 * whatever is ready.
 */
export const processingState = z.enum([
  "pending",
  "processing",
  "ready",
  "failed",
]);
export type ProcessingState = z.infer<typeof processingState>;

export const mediaAsset = z.object({
  id: assetId,
  ownerId: userId,

  /** Key of the preserved original. Never served directly into a mosaic. */
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().positive(),
  /** SHA-256 of the original bytes. This is what makes retries idempotent. */
  checksum: z.string().min(1).optional(),

  width: z.number().int().positive(),
  height: z.number().int().positive(),

  /**
   * Normalised 0-1 focal point. The viewer composes around the image rather
   * than centre-cropping it, and this is where it learns what matters.
   */
  focal: z
    .tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
    .optional(),

  /** Tiny inline base64 image, shown while the real one decodes. */
  placeholder: z.string().optional(),

  /**
   * Average perceived lightness, 0-1, and a restrained ambient tone drawn
   * from the image. The interface adapts to the photograph rather than the
   * photograph being forced into the interface.
   */
  lightness: z.number().min(0).max(1).optional(),
  tone: z.string().optional(),

  processing: processingState.default("pending"),
  /* Partial: an asset that has only just arrived has no variants yet, and
     one that failed halfway may have some but not all. The interface is
     required to cope with either. */
  variants: z.partialRecord(variantName, variant).default({}),

  createdAt: instant,
});

export type MediaAsset = z.infer<typeof mediaAsset>;

/* ---- Photo revisions ----------------------------------------------------
   One submitted photograph, for one day.

   Revisions are append-only. Replacing today's photograph writes revision
   n+1 and repoints the day entry; restoring an earlier one repoints the day
   entry again. Neither destroys anything. */

export const photoRevision = z.object({
  id: revisionId,
  dayEntryId: dayEntryId,
  assetId: assetId,

  /** 1-based, per day entry, and never reused even after a restore. */
  revisionNumber: z.number().int().positive(),

  /** When the photograph was taken, if the file knew. */
  capturedAt: instant.optional(),
  /** The zone it was taken in, which is how the calendar date was decided. */
  captureTimeZone: timeZone.optional(),
  /** When it reached us. Always known, because we were there. */
  submittedAt: instant,

  location: location.optional(),
  weather: weather.optional(),
  camera: camera.optional(),

  createdAt: instant,
});

export type PhotoRevision = z.infer<typeof photoRevision>;

/* ---- Day entries --------------------------------------------------------
   The day itself. At most one per user per calendar date — a constraint the
   database enforces with a unique index on (user_id, entry_date), not
   something the application hopes to remember.

   A day with no entry is not a failure and is not stored as anything. It is
   simply absent, and the interface draws the absence. */

export const dayEntry = z.object({
  id: dayEntryId,
  userId: userId,

  /** The day this belongs to, in the user's terms. See CalendarDate above. */
  date: calendarDate,

  /** The revision currently standing as the day's photograph. */
  currentRevisionId: revisionId,

  /** Optional, one sentence usually. Never required, never prompted for. */
  note: z.string().optional(),

  visibility: dayVisibility.default("private"),

  createdAt: instant,
  updatedAt: instant,
  /** Soft deletion. Set, not destroyed, and recoverable for a period. */
  deletedAt: instant.optional(),
});

export type DayEntry = z.infer<typeof dayEntry>;

/* ---- Profiles -----------------------------------------------------------
   Identity, separate from the account. The account is credentials and is the
   authentication layer's business; the profile is the person as the product
   presents them, and is the only half that is ever public. */

export const username = z
  .string()
  .min(2)
  .max(30)
  .regex(/^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$/, {
    message:
      "A username is lowercase letters, digits and underscores, and does not begin or end with an underscore.",
  });

export const profile = z.object({
  id: userId,

  username,
  displayName: z.string().min(1).max(60),
  bio: z.string().max(280).optional(),
  avatarAssetId: assetId.optional(),

  /**
   * Closed by default. Opening a profile is always deliberate, and opening
   * it to search is a second deliberate step: `public` means the profile
   * answers when its address is known, `discoverable` additionally means it
   * may be found by someone who does not know it.
   *
   * These were briefly two fields, a ladder here and a boolean beside it.
   * One of them had to be the authority and it was always going to be this
   * one, because the row level security policies read it — a boolean the
   * policies did not consult would have been a consent the database ignored.
   */
  visibility: profileVisibility.default("private"),

  /**
   * The zone this user's days are reckoned in. Governs which calendar date a
   * photograph submitted near midnight belongs to, and therefore has to live
   * on the profile rather than being guessed per request.
   */
  timeZone: timeZone.default("Etc/UTC"),

  /** Public location precision ceiling. Per-day settings cannot exceed it. */
  locationPrecision: locationPrecision.default("hidden"),

  createdAt: instant,
  updatedAt: instant,
});

export type Profile = z.infer<typeof profile>;
export type ProfileInput = z.input<typeof profile>;

/* ---- Composed shapes ----------------------------------------------------
   What the interface actually receives. The tables above are the storage
   truth; a surface wants a day and its photograph together, already resolved
   and already stripped of anything this viewer may not see. */

/** A photograph, resolved for display, with URLs already minted. */
/** One cell of the photograph's coarse map. See `regions` below. */
export interface Region {
  /** Mean Rec. 709 luma, 0–1. */
  l: number;
  /** Normalised variance, 0–1. High means busy, and busy swallows text. */
  v: number;
}

export interface ResolvedPhoto {
  assetId: AssetId;
  width: number;
  height: number;
  focal?: [number, number];
  placeholder?: string;
  lightness?: number;
  tone?: string;
  processing: ProcessingState;
  /**
   * A 4x6 grid, row-major from the top-left, of how bright and how busy each
   * part of the photograph is. What lets a surface put the writing where the
   * picture leaves room rather than always in the same place.
   *
   * Absent for anything processed before this existed, so every reader must
   * cope without it.
   */
  regions?: Region[];
  /** Signed, expiring URLs by intent. Absent variants are not yet generated. */
  urls: Partial<Record<VariantName, string>>;
  alt: string;
}

/**
 * The best rendition this viewer was actually given.
 *
 * Surfaces asked for `urls.large` directly, which was fine against fixtures
 * — the seed source filled every variant — and wrong against a real archive,
 * where a photograph recorded a moment ago has only its original and no
 * derivatives at all. The picture then rendered as a broken image with its
 * alt text, which is a poor way to be told the resizer has not run yet.
 *
 * `original` is last, and it is only ever *present* for the owner:
 * `urlsFor` removes it for everyone else, because its embedded EXIF carries
 * the GPS tag out past any redaction of the location columns. So this
 * falling through to it cannot disclose anything — there is nothing here to
 * fall through to unless the viewer already owns the photograph.
 */
export function bestRendition(photo: ResolvedPhoto): string | undefined {
  const { urls } = photo;
  return urls.large ?? urls.medium ?? urls.original ?? urls.thumbnail;
}

/** A day, resolved for display: what a viewer is entitled to, and no more. */
export interface ResolvedDay {
  date: CalendarDate;
  note?: string;
  visibility: DayVisibility;
  photo: ResolvedPhoto;
  capturedAt?: Instant;
  captureTimeZone?: string;
  /** Already reduced to the precision this viewer is allowed. */
  place?: { label?: string; coordinates?: Coordinates };
  weather?: Weather;
  camera?: Camera;
  /** Present only for the owner. Visitors are not told that a day was revised. */
  revisionCount?: number;
}

/** The listing projection: a year mosaic, a calendar, a map cluster. */
export interface DaySummary {
  date: CalendarDate;
  /** Thumbnail only. A year view must never fetch full-size images. */
  thumbnailUrl?: string;
  width: number;
  height: number;
  placeholder?: string;
  tone?: string;
}

/**
 * Reduce a location to what a given precision permits.
 *
 * The single place this decision is made. Every surface that shows a place
 * goes through here, so there is exactly one function to get right and
 * exactly one to audit.
 */
export function discloseLocation(
  loc: EntryLocation | undefined,
  allowed: LocationPrecision,
): { label?: string; coordinates?: Coordinates } | undefined {
  if (!loc) return undefined;

  /* The entry's own setting and the viewer's allowance are both ceilings.
     The stricter of the two wins. */
  const ceiling: LocationPrecision = precisionPermits(allowed, loc.precision)
    ? loc.precision
    : allowed;

  switch (ceiling) {
    case "hidden":
      return undefined;
    case "region":
      return { label: loc.region ?? loc.country };
    case "locality":
      return { label: loc.label ?? loc.region ?? loc.country };
    case "approximate":
      return {
        label: loc.label ?? loc.region,
        coordinates: loc.coordinates && blur(loc.coordinates),
      };
    case "precise":
      return { label: loc.label ?? loc.region, coordinates: loc.coordinates };
  }
}

/**
 * Round coordinates to roughly a kilometre.
 *
 * Two decimal places is about 1.1km of latitude, and less of longitude away
 * from the equator — which is the right direction to err. Rounding rather
 * than jittering is deliberate: a random offset applied afresh on each read
 * would let anyone average repeated requests back to the true position.
 */
function blur(c: Coordinates): Coordinates {
  return {
    ...c,
    lat: Math.round(c.lat * 100) / 100,
    lon: Math.round(c.lon * 100) / 100,
    accuracy: Math.max(c.accuracy ?? 0, 1000),
  };
}
