import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/server";
import { signedRead } from "@/lib/storage/blob";
import { dateIn, today as todayIn } from "@/lib/util/calendar";
import {
  calendarDate,
  discloseLocation,
  instant,
  isDiscoverable,
  userId as asUserId,
  assetId as asAssetId,
  revisionId as asRevisionId,
  dayEntryId as asDayEntryId,
  type CalendarDate,
  type Camera,
  type DaySummary,
  type Instant,
  type LocationPrecision,
  type ProfileVisibility,
  type ResolvedDay,
  type ResolvedPhoto,
  type UserId,
  type VariantName,
  type Weather,
} from "./schema";
import {
  ArchiveError,
  isOwner,
  permittedPrecision,
  type ArchiveSource,
  type ArchiveStatus,
  type DayRange,
  type PublicProfile,
  type RevisionHistory,
  type SubmitPhoto,
  type SubmitResult,
  type Viewer,
} from "./source";

/* =========================================================================
   The archive, over Postgres.

   Row level security is the authority here, not this file. Almost every
   read below is an ordinary select against a client carrying the caller's
   session, and the policy decides whether there is a row — for the owner,
   for a visitor looking at a public day, or for nobody. The `viewer`
   argument is used for two things only: to know whether to ask for the
   owner-only extras, and to decide how much of a location to disclose.

   That division matters. A check written here would be a second opinion
   about permission, and a second opinion is a place for the two to
   disagree. Where this file does refuse something itself — the writes — it
   refuses *in addition to* the policy, never instead of it.

   The one thing that cannot come from the database is a signed URL, so
   media rows are turned into URLs at the end of every read, after the
   policy has already decided the row may be seen.
   ========================================================================= */

type Db = SupabaseClient;

/* -------------------------------------------------------------------------
   The shape of what is selected

   Written out once rather than inline at each call site, so that adding a
   column is one edit and so the mapper below can be typed against exactly
   what was asked for.
   ------------------------------------------------------------------------- */

const REVISION_COLUMNS = `
  id, day_entry_id, user_id, revision_number, state, placeholder,
  width, height, orientation,
  captured_at, capture_timezone, submitted_at,
  camera_make, camera_model, lens, focal_length_mm, aperture,
  exposure_seconds, iso,
  latitude, longitude, altitude_m, accuracy_m,
  place_name, locality, region, country, location_privacy,
  weather, weather_recorded_at,
  media_assets ( id, variant, storage_key, width, height )
`;

/* The embed names its foreign key, because `day_entries` reaches
   `photo_revisions` by two of them — the entry's pointer at its current
   revision, and every revision's pointer back at its entry — and PostgREST
   refuses an ambiguous embed rather than guessing.

   The name is the constraint's own, `current_revision_belongs_to_entry`,
   which migration 1 states outright. This carried PostgREST's *generated*
   form instead, which no constraint here has. The embed matched nothing and
   returned no revision, so every day resolved to a day with no photograph in
   it — and `submit` wrote its row, revision and asset correctly, then failed
   reading its own work back and reported "That day has gone." */
const DAY_COLUMNS = `
  id, user_id, entry_date, note, visibility, current_revision_id,
  photo_revisions!current_revision_belongs_to_entry (
    ${REVISION_COLUMNS}
  )
`;

/* Supabase returns embedded rows as `unknown` shapes; these describe what
   the two selects above actually produce. */
interface AssetRow {
  id: string;
  variant: VariantName;
  storage_key: string;
  width: number;
  height: number;
}

interface RevisionRow {
  id: string;
  day_entry_id: string;
  user_id: string;
  revision_number: number;
  state: "pending" | "processing" | "ready" | "failed";
  placeholder: string | null;
  width: number | null;
  height: number | null;
  orientation: number | null;
  captured_at: string | null;
  capture_timezone: string | null;
  submitted_at: string;
  camera_make: string | null;
  camera_model: string | null;
  lens: string | null;
  focal_length_mm: number | null;
  aperture: number | null;
  exposure_seconds: number | null;
  iso: number | null;
  latitude: number | null;
  longitude: number | null;
  altitude_m: number | null;
  accuracy_m: number | null;
  place_name: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  location_privacy: LocationPrecision;
  weather: Weather | null;
  weather_recorded_at: string | null;
  media_assets: AssetRow[] | null;
}

interface DayRow {
  id: string;
  user_id: string;
  entry_date: string;
  note: string | null;
  visibility: "private" | "unlisted" | "public";
  current_revision_id: string | null;
  photo_revisions: RevisionRow[] | RevisionRow | null;
}

interface ProfileRow {
  id: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
  visibility: ProfileVisibility;
  time_zone: string;
  location_precision: LocationPrecision;
  created_at: string;
}

const PROFILE_COLUMNS =
  "id, handle, display_name, bio, visibility, time_zone, location_precision, created_at";

/* -------------------------------------------------------------------------
   Mapping
   ------------------------------------------------------------------------- */

/** Postgres hands back an array for an embedded relation even when the
    foreign key guarantees one row. */
function one<T>(embedded: T[] | T | null): T | null {
  if (embedded === null) return null;
  return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
}

/** A revision's variants, each signed for this reader and this visit.
    The original is never among them for anyone but the owner: it still
    carries its EXIF, and the GPS tag with it. */
async function urlsFor(
  assets: AssetRow[],
  owner: UserId,
  viewer: Viewer,
): Promise<Partial<Record<VariantName, string>>> {
  const permitted = assets.filter(
    (a) => a.variant !== "original" || isOwner(owner, viewer),
  );

  const signed = await Promise.all(
    permitted.map(async (a) => [a.variant, await signedRead(a.storage_key)] as const),
  );

  return Object.fromEntries(signed);
}

function cameraFrom(r: RevisionRow): Camera | undefined {
  const camera: Camera = {
    make: r.camera_make ?? undefined,
    model: r.camera_model ?? undefined,
    lens: r.lens ?? undefined,
    focalLength: r.focal_length_mm ?? undefined,
    aperture: r.aperture ?? undefined,
    shutterSpeed: r.exposure_seconds ?? undefined,
    iso: r.iso ?? undefined,
  };

  /* A photograph from a screenshot knows none of this. An object of seven
     undefineds is not a camera, and rendering it would produce a metadata
     line made entirely of separators. */
  return Object.values(camera).some((v) => v !== undefined) ? camera : undefined;
}

async function resolvePhoto(
  r: RevisionRow,
  owner: UserId,
  viewer: Viewer,
): Promise<ResolvedPhoto> {
  const assets = r.media_assets ?? [];
  /* Dimensions from the original asset where the revision has not been
     told its own, which is the case until the pipeline has run. */
  const original = assets.find((a) => a.variant === "original");

  return {
    assetId: asAssetId.parse(original?.id ?? r.id),
    width: r.width ?? original?.width ?? 0,
    height: r.height ?? original?.height ?? 0,
    placeholder: r.placeholder ?? undefined,
    processing: r.state,
    urls: await urlsFor(assets, owner, viewer),
    /* Alt text is not yet a field anybody fills in. Saying what the
       photograph *is* — one day's photograph, and which day — is more use
       to a screen reader than an empty string, and it is honest. */
    alt: `Photograph for ${r.captured_at ? dateIn(instant.parse(r.captured_at), r.capture_timezone ?? "Etc/UTC") : "this day"}`,
  };
}

async function resolveDay(
  row: DayRow,
  owner: UserId,
  profilePrecision: LocationPrecision,
  viewer: Viewer,
  revisionCount?: number,
): Promise<ResolvedDay | null> {
  const revision = one(row.photo_revisions);
  /* A day entry with no current revision is a day that was reserved and
     never completed — an upload that failed halfway. It is not a day. */
  if (!revision) return null;

  const precision = permittedPrecision(owner, profilePrecision, viewer);
  /* The per-day setting narrows; it can never widen past the profile's
     ceiling, which is what taking the lesser of the two means here. */
  const place = discloseLocation(
    {
      /* The schema keeps one label plus the two broader containers, so the
         narrowest name the database has becomes the label and `locality`
         has no separate slot — which is right: at `locality` precision the
         label *is* the locality. */
      label:
        revision.place_name ??
        revision.locality ??
        revision.region ??
        revision.country ??
        undefined,
      region: revision.region ?? undefined,
      country: revision.country ?? undefined,
      coordinates:
        revision.latitude !== null && revision.longitude !== null
          ? {
              lat: revision.latitude,
              lon: revision.longitude,
              accuracy: revision.accuracy_m ?? undefined,
              elevation: revision.altitude_m ?? undefined,
            }
          : undefined,
      precision: revision.location_privacy,
    },
    precision,
  );

  return {
    date: calendarDate.parse(row.entry_date),
    note: row.note ?? undefined,
    visibility: row.visibility,
    photo: await resolvePhoto(revision, owner, viewer),
    capturedAt: revision.captured_at
      ? instant.parse(revision.captured_at)
      : undefined,
    captureTimeZone: revision.capture_timezone ?? undefined,
    place,
    weather: revision.weather ?? undefined,
    camera: cameraFrom(revision),
    /* Visitors are not told that a day was ever revised. */
    revisionCount: isOwner(owner, viewer) ? revisionCount : undefined,
  };
}

function toPublicProfile(
  row: ProfileRow,
  viewer: Viewer,
  recordingSince?: number,
): PublicProfile {
  return {
    id: asUserId.parse(row.id),
    username: row.handle,
    displayName: row.display_name ?? row.handle,
    bio: row.bio ?? undefined,
    recordingSince,
    isOwner: isOwner(asUserId.parse(row.id), viewer),
  };
}

/* -------------------------------------------------------------------------
   Shared reads
   ------------------------------------------------------------------------- */

/** The owner's profile, for the two things every read needs from it: the
    zone their days are reckoned in, and the ceiling on disclosed location.
    Returns null when the policy says this viewer may not see the profile,
    which is also the correct answer for "may not see their days". */
async function ownerProfile(db: Db, owner: UserId): Promise<ProfileRow | null> {
  const { data } = await db
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", owner)
    .maybeSingle<ProfileRow>();

  return data ?? null;
}

async function dayRow(
  db: Db,
  owner: UserId,
  date: CalendarDate,
): Promise<DayRow | null> {
  const { data } = await db
    .from("day_entries")
    .select(DAY_COLUMNS)
    .eq("user_id", owner)
    .eq("entry_date", date)
    .maybeSingle<DayRow>();

  return data ?? null;
}

async function countRevisions(db: Db, dayEntryId: string): Promise<number> {
  const { count } = await db
    .from("photo_revisions")
    .select("id", { count: "exact", head: true })
    .eq("day_entry_id", dayEntryId);

  return count ?? 0;
}

/* Writes verify ownership here as well as in the policy. The policy is
   still the authority — this exists so that a refusal is a domain outcome
   with a reason a client can switch on, rather than an empty result set
   the caller has to interpret. */
function requireOwner(owner: UserId, viewer: Viewer) {
  if (!isOwner(owner, viewer)) {
    throw new ArchiveError("forbidden", "That is not yours to change.");
  }
}

/* -------------------------------------------------------------------------
   The source
   ------------------------------------------------------------------------- */

export function supabaseArchive(client?: Db): ArchiveSource {
  /* The client is built per call rather than held, because it carries a
     session: one held across requests would answer a second reader with
     the first reader's permissions. */
  const conn = async (): Promise<Db> => client ?? (await getSupabase());

  const source: ArchiveSource = {
    async profileByUsername(username, viewer) {
      const db = await conn();
      const { data } = await db
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("handle", username.toLowerCase())
        .maybeSingle<ProfileRow>();

      if (!data) return null;
      return toPublicProfile(data, viewer, await since(db, data.id));
    },

    async profileById(id, viewer) {
      const db = await conn();
      const data = await ownerProfile(db, id);
      if (!data) return null;
      return toPublicProfile(data, viewer, await since(db, data.id));
    },

    async latestDay(owner, viewer) {
      const db = await conn();
      const profile = await ownerProfile(db, owner);
      if (!profile) return null;

      const { data } = await db
        .from("day_entries")
        .select(DAY_COLUMNS)
        .eq("user_id", owner)
        .not("current_revision_id", "is", null)
        .order("entry_date", { ascending: false })
        .limit(1)
        .maybeSingle<DayRow>();

      if (!data) return null;
      return resolveDay(
        data,
        owner,
        profile.location_precision,
        viewer,
        await countRevisions(db, data.id),
      );
    },

    async day(owner, date, viewer) {
      const db = await conn();
      const profile = await ownerProfile(db, owner);
      if (!profile) return null;

      const row = await dayRow(db, owner, date);
      if (!row) return null;

      return resolveDay(
        row,
        owner,
        profile.location_precision,
        viewer,
        await countRevisions(db, row.id),
      );
    },

    async recentDays(owner, viewer, options) {
      const db = await conn();
      const profile = await ownerProfile(db, owner);
      if (!profile) return [];

      let query = db
        .from("day_entries")
        .select(DAY_COLUMNS)
        .eq("user_id", owner)
        .not("current_revision_id", "is", null);

      if (options?.before) query = query.lt("entry_date", options.before);

      const { data } = await query
        .order("entry_date", { ascending: false })
        .limit(options?.limit ?? 24)
        .returns<DayRow[]>();

      if (!data) return [];

      /* The signing is concurrent even though the fetch is one round trip.
         Each day's URLs are independent, and awaiting them in sequence
         would put the round trips back in a different place. */
      const days = await Promise.all(
        data.map((row) =>
          resolveDay(row, owner, profile.location_precision, viewer),
        ),
      );

      return days.filter((d): d is ResolvedDay => d !== null);
    },

    async neighbours(owner, date, viewer) {
      const db = await conn();
      const profile = await ownerProfile(db, owner);
      if (!profile) return { previous: null, next: null };

      /* Adjacency by what exists, not by arithmetic on the date. The
         archive has gaps and the gaps are part of the record: the day
         before 3 March may be 27 February, and walking one day at a time
         would return an empty result and stop the viewer dead. */
      const step = async (
        direction: "before" | "after",
      ): Promise<ResolvedDay | null> => {
        const { data } = await db
          .from("day_entries")
          .select(DAY_COLUMNS)
          .eq("user_id", owner)
          .not("current_revision_id", "is", null)
          [direction === "before" ? "lt" : "gt"]("entry_date", date)
          .order("entry_date", { ascending: direction === "after" })
          .limit(1)
          .maybeSingle<DayRow>();

        if (!data) return null;
        return resolveDay(data, owner, profile.location_precision, viewer);
      };

      const [previous, next] = await Promise.all([step("before"), step("after")]);
      return { previous, next };
    },

    async summaries(owner, range, viewer) {
      const db = await conn();
      const profile = await ownerProfile(db, owner);
      if (!profile) return [];

      const { data } = await db
        .from("day_entries")
        .select(DAY_COLUMNS)
        .eq("user_id", owner)
        .not("current_revision_id", "is", null)
        .gte("entry_date", range.from)
        .lte("entry_date", range.to)
        .order("entry_date", { ascending: true })
        .returns<DayRow[]>();

      if (!data) return [];

      const summaries = await Promise.all(
        data.map(async (row): Promise<DaySummary | null> => {
          const revision = one(row.photo_revisions);
          if (!revision) return null;

          const assets = revision.media_assets ?? [];
          /* A year view must never fetch full-size images, so a day with no
             thumbnail yet contributes its placeholder and its shape and no
             URL at all — rather than quietly falling back to the large. */
          const thumb = assets.find((a) => a.variant === "thumbnail");
          const original = assets.find((a) => a.variant === "original");

          return {
            date: calendarDate.parse(row.entry_date),
            thumbnailUrl: thumb ? await signedRead(thumb.storage_key) : undefined,
            width: revision.width ?? original?.width ?? 0,
            height: revision.height ?? original?.height ?? 0,
            placeholder: revision.placeholder ?? undefined,
          };
        }),
      );

      return summaries.filter((s): s is DaySummary => s !== null);
    },

    async onThisDay(owner, date, viewer) {
      const db = await conn();
      const profile = await ownerProfile(db, owner);
      if (!profile) return [];

      /* Same month and day, every year, this one excluded. Postgres can
         answer that directly; pulling every day and filtering in
         TypeScript would fetch an entire archive to keep a handful. */
      const [, month, day] = date.split("-");
      const { data } = await db
        .from("day_entries")
        .select(DAY_COLUMNS)
        .eq("user_id", owner)
        .not("current_revision_id", "is", null)
        .neq("entry_date", date)
        .like("entry_date", `%-${month}-${day}`)
        .order("entry_date", { ascending: false })
        .returns<DayRow[]>();

      if (!data) return [];

      const days = await Promise.all(
        data.map((row) =>
          resolveDay(row, owner, profile.location_precision, viewer),
        ),
      );

      return days.filter((d): d is ResolvedDay => d !== null);
    },

    async revisions(owner, date, viewer) {
      /* Owner-only, and refused rather than emptied: a visitor is not told
         that a day was ever revised, and an empty history would tell them
         it was not. */
      if (!isOwner(owner, viewer)) return null;

      const db = await conn();
      const row = await dayRow(db, owner, date);
      if (!row || !row.current_revision_id) return null;

      const { data } = await db
        .from("photo_revisions")
        .select("id, revision_number, submitted_at, media_assets ( variant, storage_key )")
        .eq("day_entry_id", row.id)
        .order("revision_number", { ascending: false })
        .returns<
          Array<{
            id: string;
            revision_number: number;
            submitted_at: string;
            media_assets: Array<{ variant: VariantName; storage_key: string }> | null;
          }>
        >();

      if (!data) return null;

      return {
        dayEntryId: asDayEntryId.parse(row.id),
        current: asRevisionId.parse(row.current_revision_id),
        revisions: await Promise.all(
          data.map(async (r) => {
            const thumb = (r.media_assets ?? []).find(
              (a) => a.variant === "thumbnail",
            );
            return {
              id: asRevisionId.parse(r.id),
              revisionNumber: r.revision_number,
              submittedAt: instant.parse(r.submitted_at),
              thumbnailUrl: thumb
                ? await signedRead(thumb.storage_key)
                : undefined,
              isCurrent: r.id === row.current_revision_id,
            };
          }),
        ),
      } satisfies RevisionHistory;
    },

    async status(owner, viewer) {
      if (!isOwner(owner, viewer)) return null;

      const db = await conn();
      const profile = await ownerProfile(db, owner);
      if (!profile) return null;

      /* Their today, in their zone. The server's date is never the right
         answer and is not consulted. */
      const today = todayIn(profile.time_zone);

      const [{ count }, edges] = await Promise.all([
        db
          .from("day_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", owner)
          .not("current_revision_id", "is", null),
        db
          .from("day_entries")
          .select("entry_date")
          .eq("user_id", owner)
          .not("current_revision_id", "is", null)
          .order("entry_date", { ascending: true })
          .returns<Array<{ entry_date: string }>>(),
      ]);

      const dates = edges.data ?? [];

      return {
        today,
        timeZone: profile.time_zone,
        todayRecorded: dates.some((d) => d.entry_date === today),
        /* Stated plainly, never as a streak. A gap is not a failure and the
           product does not keep score. */
        daysRecorded: count ?? 0,
        earliest: dates.length
          ? calendarDate.parse(dates[0]!.entry_date)
          : undefined,
        latest: dates.length
          ? calendarDate.parse(dates[dates.length - 1]!.entry_date)
          : undefined,
      } satisfies ArchiveStatus;
    },

    /* -- Writes ------------------------------------------------------- */

    async submit(owner, input, viewer) {
      requireOwner(owner, viewer);
      const db = await conn();

      /* The replay check comes first, because the whole point of the key is
         that the second request must not write anything. */
      const { data: existing } = await db
        .from("photo_revisions")
        .select("id, day_entry_id, revision_number")
        .eq("user_id", owner)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle<{
          id: string;
          day_entry_id: string;
          revision_number: number;
        }>();

      if (existing) {
        const day = await source.day(owner, input.date, viewer);
        if (!day) throw new ArchiveError("not-found", "That day has gone.");
        return { day, created: false, revisionNumber: existing.revision_number };
      }

      const { data: entry, error: entryFailed } = await db
        .from("day_entries")
        .upsert(
          { user_id: owner, entry_date: input.date, deleted_at: null },
          { onConflict: "user_id,entry_date" },
        )
        .select("id")
        .single<{ id: string }>();

      /* Very nearly always the date guard: a date further ahead than the far
         side of the date line can account for. */
      if (entryFailed || !entry) {
        throw new ArchiveError("invalid-date", "That date cannot be filed.");
      }

      const { data: revision, error: revisionFailed } = await db
        .from("photo_revisions")
        .insert({
          day_entry_id: entry.id,
          user_id: owner,
          captured_at: input.capturedAt ?? null,
          capture_timezone: input.captureTimeZone ?? null,
          idempotency_key: input.idempotencyKey,
        })
        .select("id, revision_number")
        .single<{ id: string; revision_number: number }>();

      if (revisionFailed || !revision) {
        throw new ArchiveError("conflict", "The record could not be opened.");
      }

      /* The asset was uploaded and registered before this call; point it at
         the revision that now owns it.

         `is("photo_revision_id", null)` is the guard that matters. An asset
         already attached to a day must not be re-attached to another —
         otherwise a replayed request with a fresh idempotency key could
         move somebody's photograph from one date to a different one. RLS
         has already restricted this to the caller's own assets; this stops
         them doing it to themselves. */
      const { data: attached } = await db
        .from("media_assets")
        .update({ photo_revision_id: revision.id })
        .eq("id", input.assetId)
        .eq("user_id", owner)
        .is("photo_revision_id", null)
        .select("id, width, height")
        .maybeSingle<{ id: string; width: number; height: number }>();

      if (!attached) {
        throw new ArchiveError(
          "asset-not-ready",
          "That photograph has not arrived, or belongs to another day.",
        );
      }

      /* What the photograph knows about itself, written onto the revision
         rather than the day: it describes this photograph, and replacing
         the photograph tomorrow must not inherit today's camera. */
      await db
        .from("photo_revisions")
        .update({
          width: input.width ?? attached.width,
          height: input.height ?? attached.height,
          placeholder: input.placeholder ?? null,
          camera_make: input.camera?.make ?? null,
          camera_model: input.camera?.model ?? null,
          lens: input.camera?.lens ?? null,
          focal_length_mm: input.camera?.focalLength ?? null,
          aperture: input.camera?.aperture ?? null,
          exposure_seconds: input.camera?.shutterSpeed ?? null,
          iso: input.camera?.iso ?? null,
          latitude: input.place?.coordinates?.lat ?? null,
          longitude: input.place?.coordinates?.lon ?? null,
          accuracy_m: input.place?.coordinates?.accuracy ?? null,
          altitude_m: input.place?.coordinates?.elevation ?? null,
          place_name: input.place?.label ?? null,
          region: input.place?.region ?? null,
          country: input.place?.country ?? null,
          /* Withheld until the owner decides otherwise, every time. A
             default carried over from a previous day would publish a
             location the owner never looked at. */
          location_privacy: "hidden",
        })
        .eq("id", revision.id);

      const patch: Record<string, unknown> = {
        current_revision_id: revision.id,
      };
      if (input.note !== undefined) patch.note = input.note;
      if (input.visibility !== undefined) patch.visibility = input.visibility;

      await db.from("day_entries").update(patch).eq("id", entry.id);

      const day = await source.day(owner, input.date, viewer);
      if (!day) throw new ArchiveError("not-found", "That day has gone.");

      return { day, created: true, revisionNumber: revision.revision_number };
    },

    async restore(owner, revision, viewer) {
      requireOwner(owner, viewer);
      const db = await conn();

      const { data: found } = await db
        .from("photo_revisions")
        .select("id, day_entry_id, day_entries ( entry_date )")
        .eq("id", revision)
        .eq("user_id", owner)
        .maybeSingle<{
          id: string;
          day_entry_id: string;
          day_entries: { entry_date: string } | { entry_date: string }[] | null;
        }>();

      if (!found) throw new ArchiveError("not-found", "No such revision.");

      /* Repointing, not copying. The revision keeps its number and its
         bytes; restoring is as reversible as replacing was. */
      await db
        .from("day_entries")
        .update({ current_revision_id: found.id })
        .eq("id", found.day_entry_id);

      const entry = one(found.day_entries);
      const date = calendarDate.parse(entry!.entry_date);
      const day = await source.day(owner, date, viewer);
      if (!day) throw new ArchiveError("not-found", "That day has gone.");
      return day;
    },

    async setNote(owner, date, note, viewer) {
      return patchDay(owner, date, { note }, viewer);
    },

    async setDayVisibility(owner, date, visibility, viewer) {
      return patchDay(owner, date, { visibility }, viewer);
    },

    async setDayLocationPrecision(owner, date, precision, viewer) {
      requireOwner(owner, viewer);
      const db = await conn();

      const row = await dayRow(db, owner, date);
      if (!row || !row.current_revision_id) {
        throw new ArchiveError("not-found", "No such day.");
      }

      /* Precision lives on the revision, because it describes the
         photograph's own location rather than the day's. */
      await db
        .from("photo_revisions")
        .update({ location_privacy: precision })
        .eq("id", row.current_revision_id);

      const day = await source.day(owner, date, viewer);
      if (!day) throw new ArchiveError("not-found", "No such day.");
      return day;
    },

    async deleteDay(owner, date, viewer) {
      requireOwner(owner, viewer);
      const db = await conn();

      /* Soft. A real delete would cascade into the revisions and the media
         rows, and deleting a day is not meant to destroy the photographs
         that were in it. */
      const { error } = await db
        .from("day_entries")
        .update({ deleted_at: new Date().toISOString() })
        .eq("user_id", owner)
        .eq("entry_date", date);

      if (error) throw new ArchiveError("not-found", "No such day.");
    },

    async updateProfile(owner, patch, viewer) {
      requireOwner(owner, viewer);
      const db = await conn();

      const columns: Record<string, unknown> = {};
      if (patch.displayName !== undefined) columns.display_name = patch.displayName;
      if (patch.bio !== undefined) columns.bio = patch.bio;
      if (patch.visibility !== undefined) columns.visibility = patch.visibility;
      if (patch.timeZone !== undefined) columns.time_zone = patch.timeZone;
      if (patch.locationPrecision !== undefined) {
        columns.location_precision = patch.locationPrecision;
      }

      const { data, error } = await db
        .from("profiles")
        .update(columns)
        .eq("id", owner)
        .select(PROFILE_COLUMNS)
        .single<ProfileRow>();

      if (error || !data) {
        throw new ArchiveError("conflict", "The profile could not be changed.");
      }

      return toPublicProfile(data, viewer, await since(db, data.id));
    },

    async findProfiles(query, limit = 10) {
      const q = query.trim();
      /* An empty query is not "everybody". Search is deliberately thin and
         must never become a way to enumerate the userbase. */
      if (q.length === 0) return [];

      const db = await conn();
      const { data } = await db
        .from("profiles")
        .select(PROFILE_COLUMNS)
        /* Both consents, expressed as the top rung: `public` answers when
           its address is known, `discoverable` may also be found. */
        .eq("visibility", "discoverable")
        .or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(limit)
        .returns<ProfileRow[]>();

      return (data ?? [])
        .filter((row) => isDiscoverable(row.visibility))
        .map((row) => toPublicProfile(row, { userId: null }));
    },
  };

  /* Shared by setNote and setDayVisibility, which differ only in the
     column they write. */
  async function patchDay(
    owner: UserId,
    date: CalendarDate,
    columns: Record<string, unknown>,
    viewer: Viewer,
  ): Promise<ResolvedDay> {
    requireOwner(owner, viewer);
    const db = await conn();

    const { error } = await db
      .from("day_entries")
      .update(columns)
      .eq("user_id", owner)
      .eq("entry_date", date);

    if (error) throw new ArchiveError("conflict", "That day could not be changed.");

    const day = await source.day(owner, date, viewer);
    if (!day) throw new ArchiveError("not-found", "No such day.");
    return day;
  }

  return source;
}

/** The year of the earliest recorded day: "Recording since 2027". */
async function since(db: Db, owner: string): Promise<number | undefined> {
  const { data } = await db
    .from("day_entries")
    .select("entry_date")
    .eq("user_id", owner)
    .not("current_revision_id", "is", null)
    .order("entry_date", { ascending: true })
    .limit(1)
    .maybeSingle<{ entry_date: string }>();

  return data ? Number(data.entry_date.slice(0, 4)) : undefined;
}
