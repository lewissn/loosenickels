import {
  discloseLocation,
  type CalendarDate,
  type DaySummary,
  type Instant,
  type ResolvedDay,
  type ResolvedPhoto,
  type UserId,
} from "./schema";
import {
  ANONYMOUS,
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
import { SEED_DAYS, SEED_PROFILE } from "@/content/seed";
import { compareDates, dateIn, sameDayAcrossYears, today, yearOf } from "@/lib/util/calendar";

/* =========================================================================
   Seed source

   An in-memory ArchiveSource over a small fabricated archive, so that the
   interface can be designed and judged before Postgres and object storage
   exist. It is development scaffolding and says so: it holds no real
   photographs, it authenticates nobody, and it is not wired into anything
   that ships.

   It is nonetheless held to the same authorisation rules as the real
   implementation will be. A seed source that answers every question freely
   would let a whole interface get built on the assumption that it can see
   everything, and the leak would only be discovered on the day the real
   source refused.
   ========================================================================= */

const OWNER = SEED_PROFILE.id;

function photoOf(day: (typeof SEED_DAYS)[number]): ResolvedPhoto {
  return {
    assetId: day.assetId,
    width: day.width,
    height: day.height,
    focal: day.focal,
    placeholder: day.placeholder,
    lightness: day.lightness,
    tone: day.tone,
    processing: "ready",
    urls: { thumb: day.src, medium: day.src, large: day.src },
    alt: day.alt,
  };
}

function resolve(day: (typeof SEED_DAYS)[number], viewer: Viewer): ResolvedDay {
  const owner = isOwner(OWNER, viewer);
  return {
    date: day.date,
    note: day.note,
    visibility: day.visibility,
    photo: photoOf(day),
    capturedAt: day.capturedAt,
    captureTimeZone: day.captureTimeZone,
    place: discloseLocation(
      day.location,
      permittedPrecision(OWNER, SEED_PROFILE.locationPrecision, viewer),
    ),
    weather: day.weather,
    camera: day.camera,
    revisionCount: owner ? day.revisionCount : undefined,
  };
}

/** The days this viewer is entitled to see, newest first. */
function visibleTo(viewer: Viewer): typeof SEED_DAYS {
  const sorted = [...SEED_DAYS].sort((a, b) => compareDates(b.date, a.date));
  if (isOwner(OWNER, viewer)) return sorted;
  if (SEED_PROFILE.visibility !== "public") return [];
  return sorted.filter((d) => d.visibility === "public");
}

function publicProfile(viewer: Viewer): PublicProfile {
  const earliest = [...SEED_DAYS].sort((a, b) => compareDates(a.date, b.date))[0];
  return {
    id: SEED_PROFILE.id,
    username: SEED_PROFILE.username,
    displayName: SEED_PROFILE.displayName,
    bio: SEED_PROFILE.bio,
    recordingSince: earliest ? yearOf(earliest.date) : undefined,
    isOwner: isOwner(OWNER, viewer),
  };
}

function requireOwner(owner: UserId, viewer: Viewer): void {
  if (!isOwner(owner, viewer)) {
    throw new ArchiveError("forbidden", "Not yours to change.");
  }
}

/** Writes are refused rather than faked. Nothing here has anywhere to persist. */
function readOnly(): never {
  throw new ArchiveError(
    "forbidden",
    "The seed source is read-only. Writing needs the database implementation.",
  );
}

export const seedSource: ArchiveSource = {
  async profileByUsername(username, viewer) {
    if (username.toLowerCase() !== SEED_PROFILE.username) return null;
    if (SEED_PROFILE.visibility !== "public" && !isOwner(OWNER, viewer)) return null;
    return publicProfile(viewer);
  },

  async profileById(id, viewer) {
    if (id !== OWNER) return null;
    if (SEED_PROFILE.visibility !== "public" && !isOwner(OWNER, viewer)) return null;
    return publicProfile(viewer);
  },

  async latestDay(owner, viewer) {
    if (owner !== OWNER) return null;
    const [latest] = visibleTo(viewer);
    return latest ? resolve(latest, viewer) : null;
  },

  async day(owner, date, viewer) {
    if (owner !== OWNER) return null;
    const found = visibleTo(viewer).find((d) => d.date === date);
    return found ? resolve(found, viewer) : null;
  },

  async neighbours(owner, date, viewer) {
    if (owner !== OWNER) return { previous: null, next: null };
    /* Newest first, so the entry *before* this one in the list is the newer
       day. Naming them by time rather than by array position is the whole
       point: "next" means later, everywhere in this product. */
    const days = visibleTo(viewer);
    const i = days.findIndex((d) => d.date === date);
    if (i === -1) return { previous: null, next: null };
    const newer = days[i - 1];
    const older = days[i + 1];
    return {
      previous: older ? resolve(older, viewer) : null,
      next: newer ? resolve(newer, viewer) : null,
    };
  },

  async summaries(owner, range: DayRange, viewer) {
    if (owner !== OWNER) return [];
    return visibleTo(viewer)
      .filter((d) => compareDates(d.date, range.from) >= 0 && compareDates(d.date, range.to) <= 0)
      .sort((a, b) => compareDates(a.date, b.date))
      .map<DaySummary>((d) => ({
        date: d.date,
        thumbnailUrl: d.src,
        width: d.width,
        height: d.height,
        placeholder: d.placeholder,
        tone: d.tone,
      }));
  },

  async onThisDay(owner, date, viewer) {
    if (owner !== OWNER) return [];
    const days = visibleTo(viewer);
    const years = days.map((d) => yearOf(d.date));
    if (years.length === 0) return [];
    const wanted = new Set<string>(
      sameDayAcrossYears(date, Math.min(...years), Math.max(...years)),
    );
    return days
      .filter((d) => wanted.has(d.date))
      .sort((a, b) => compareDates(a.date, b.date))
      .map((d) => resolve(d, viewer));
  },

  async revisions(owner, date, viewer): Promise<RevisionHistory | null> {
    /* Owner-only, and null rather than an error: a visitor is not told that
       a history exists, only that they have no business asking. */
    if (!isOwner(owner, viewer)) return null;
    const day = SEED_DAYS.find((d) => d.date === date);
    if (!day) return null;
    return {
      dayEntryId: day.id,
      current: day.currentRevisionId,
      revisions: [
        {
          id: day.currentRevisionId,
          revisionNumber: day.revisionCount,
          submittedAt: day.capturedAt ?? day.createdAt,
          thumbnailUrl: day.src,
          isCurrent: true,
        },
      ],
    };
  },

  async status(owner, viewer): Promise<ArchiveStatus | null> {
    if (!isOwner(owner, viewer)) return null;
    const days = [...SEED_DAYS].sort((a, b) => compareDates(a.date, b.date));
    const now = today(SEED_PROFILE.timeZone);
    return {
      today: now,
      todayRecorded: days.some((d) => d.date === now),
      daysRecorded: days.length,
      earliest: days[0]?.date,
      latest: days[days.length - 1]?.date,
    };
  },

  async submit(owner, _input: SubmitPhoto, viewer): Promise<SubmitResult> {
    requireOwner(owner, viewer);
    return readOnly();
  },
  async restore(owner, _revision, viewer) {
    requireOwner(owner, viewer);
    return readOnly();
  },
  async setNote(owner, _date, _note, viewer) {
    requireOwner(owner, viewer);
    return readOnly();
  },
  async setDayVisibility(owner, _date, _visibility, viewer) {
    requireOwner(owner, viewer);
    return readOnly();
  },
  async setDayLocationPrecision(owner, _date, _precision, viewer) {
    requireOwner(owner, viewer);
    return readOnly();
  },
  async deleteDay(owner, _date, viewer) {
    requireOwner(owner, viewer);
    return readOnly();
  },
  async updateProfile(owner, _patch, viewer) {
    requireOwner(owner, viewer);
    return readOnly();
  },

  async findProfiles(query, limit = 10) {
    /* Both consents are required, and this is the shape the real
       implementation must keep: public AND discoverable, never either. */
    if (SEED_PROFILE.visibility !== "public" || !SEED_PROFILE.discoverable) return [];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return [];
    const hit =
      SEED_PROFILE.username.includes(q) ||
      SEED_PROFILE.displayName.toLowerCase().includes(q);
    return hit ? [publicProfile(ANONYMOUS)].slice(0, limit) : [];
  },
};

/** The seed archive's owner, for development surfaces that need a subject. */
export const SEED_OWNER: UserId = OWNER;

/** Convenience for development: sign in as the seed user. */
export const SEED_VIEWER: Viewer = { userId: OWNER };

export type { Instant, CalendarDate };
