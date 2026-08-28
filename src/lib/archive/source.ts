import type {
  AssetId,
  CalendarDate,
  DayEntry,
  DaySummary,
  DayVisibility,
  Instant,
  LocationPrecision,
  PhotoRevision,
  Profile,
  ResolvedDay,
  RevisionId,
  UserId,
} from "./schema";

/* =========================================================================
   Archive source

   The seam between the product and its data, and the contract that the
   website and the iOS application both speak. There are no "web posts" and
   "app posts": both clients are presentation layers over the behaviour
   described here, and neither is permitted to invent a rule of its own.

   Two things are different from an ordinary data layer, and both are
   deliberate.

   First, every method takes a Viewer. Authorisation is not a question of
   which buttons the interface chooses to render — hiding a control protects
   nothing from anyone holding a fetch client. An implementation of this
   interface is required to answer as though the caller is hostile, because
   sooner or later one will be.

   Second, the methods are async and return already-resolved shapes with
   signed URLs, rather than rows. A caller cannot accidentally serialise a
   private coordinate to a public page, because it was never handed one.
   ========================================================================= */

/**
 * Who is asking.
 *
 * `null` is an anonymous visitor and is the correct default: a surface that
 * forgets to pass a viewer gets the least privilege, not the most.
 */
export interface Viewer {
  userId: UserId | null;
}

export const ANONYMOUS: Viewer = { userId: null };

/** A profile as a visitor may see it. Never carries account or contact data. */
export interface PublicProfile {
  id: UserId;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  /** The year of the earliest recorded day: "Recording since 2027". */
  recordingSince?: number;
  /** Present for the owner only. */
  isOwner: boolean;
}

export interface DayRange {
  /** Inclusive. */
  from: CalendarDate;
  /** Inclusive. */
  to: CalendarDate;
}

/** A day's revision history. Owner-only, in every implementation. */
export interface RevisionHistory {
  dayEntryId: DayEntry["id"];
  current: RevisionId;
  revisions: Array<{
    id: RevisionId;
    revisionNumber: number;
    submittedAt: Instant;
    thumbnailUrl?: string;
    isCurrent: boolean;
  }>;
}

/** What the owner is told about their own archive, and nobody else is. */
export interface ArchiveStatus {
  /** The user's today, in their own zone — not the server's. */
  today: CalendarDate;
  /** Whether today has been recorded. Drives "Today remains unrecorded." */
  todayRecorded: boolean;
  /** Days with an entry. Stated plainly, never as a streak. */
  daysRecorded: number;
  earliest?: CalendarDate;
  latest?: CalendarDate;
}

/* ---- Submission ---------------------------------------------------------
   Uploading is the one operation where failure costs the user something they
   cannot get back, so the contract is unusually explicit about it. */

export interface SubmitPhoto {
  /**
   * An asset that has already been uploaded to object storage and
   * registered. Submission is a separate step from transfer so that a failed
   * commit does not mean re-sending the bytes over a bad connection.
   */
  assetId: AssetId;

  /**
   * Which day this is for. Supplied by the client, because only the client
   * knows the zone the photograph was taken in — but validated by the
   * implementation, which must refuse a date the user could not plausibly be
   * recording yet.
   */
  date: CalendarDate;

  note?: string;
  visibility?: DayVisibility;

  capturedAt?: Instant;
  captureTimeZone?: string;

  /**
   * A client-generated key, stable across retries of the same submission.
   *
   * This is what makes a retry safe. Two requests carrying the same key are
   * the same submission, and the second returns the result of the first
   * rather than writing a duplicate revision — which is exactly what happens
   * on a phone that loses signal after the request left but before the
   * response arrived.
   */
  idempotencyKey: string;
}

export interface SubmitResult {
  day: ResolvedDay;
  /** True when this call created the revision; false when it replayed one. */
  created: boolean;
  revisionNumber: number;
}

/* ---- The interface ------------------------------------------------------ */

export interface ArchiveSource {
  /* -- Identity -- */

  /** Resolve a handle. Returns null for private profiles to non-owners. */
  profileByUsername(username: string, viewer: Viewer): Promise<PublicProfile | null>;
  profileById(id: UserId, viewer: Viewer): Promise<PublicProfile | null>;

  /**
   * The most recent recorded day.
   *
   * The homepage never shows an empty screen merely because today has not
   * been recorded yet: if the latest is yesterday's, yesterday's is what the
   * viewer sees.
   */
  latestDay(owner: UserId, viewer: Viewer): Promise<ResolvedDay | null>;

  /** One day. Null when absent, and equally null when not permitted. */
  day(owner: UserId, date: CalendarDate, viewer: Viewer): Promise<ResolvedDay | null>;

  /**
   * The days either side, already resolved.
   *
   * The viewer scrolls through time, so it needs the next photograph decoded
   * before the gesture that reveals it begins. This exists so that
   * preloading is a property of the contract rather than something each
   * client reinvents.
   */
  neighbours(
    owner: UserId,
    date: CalendarDate,
    viewer: Viewer,
  ): Promise<{ previous: ResolvedDay | null; next: ResolvedDay | null }>;

  /**
   * Thumbnails across a date range, for calendars, mosaics and maps.
   *
   * Returns only days that exist. Absent days are absent, and the caller
   * draws the gap — the archive does not invent placeholder records for days
   * that were never recorded.
   */
  summaries(owner: UserId, range: DayRange, viewer: Viewer): Promise<DaySummary[]>;

  /** The same calendar date across every year that has one. */
  onThisDay(owner: UserId, date: CalendarDate, viewer: Viewer): Promise<ResolvedDay[]>;

  /** Owner-only. A visitor is not told that a day was ever revised. */
  revisions(owner: UserId, date: CalendarDate, viewer: Viewer): Promise<RevisionHistory | null>;

  /** Owner-only status. Drives the private "Today remains unrecorded." line. */
  status(owner: UserId, viewer: Viewer): Promise<ArchiveStatus | null>;

  /* -- Writes --
     Every one of these is owner-only and every one must verify that for
     itself. None of them may be reached by a viewer who merely knows an id. */

  /**
   * Record or replace a day's photograph.
   *
   * There is one method rather than a create and an update, because from the
   * user's side there is one action: this is the photograph for this day. If
   * the day already has one, this becomes revision n+1 and the previous
   * revision is kept.
   */
  submit(owner: UserId, input: SubmitPhoto, viewer: Viewer): Promise<SubmitResult>;

  /** Make an earlier revision current again. Appends; destroys nothing. */
  restore(owner: UserId, revision: RevisionId, viewer: Viewer): Promise<ResolvedDay>;

  setNote(owner: UserId, date: CalendarDate, note: string | null, viewer: Viewer): Promise<ResolvedDay>;

  setDayVisibility(
    owner: UserId,
    date: CalendarDate,
    visibility: DayVisibility,
    viewer: Viewer,
  ): Promise<ResolvedDay>;

  setDayLocationPrecision(
    owner: UserId,
    date: CalendarDate,
    precision: LocationPrecision,
    viewer: Viewer,
  ): Promise<ResolvedDay>;

  /**
   * Soft-delete a day.
   *
   * Deletion is explicit, reversible for a period, and is not what replacing
   * a photograph does. Nothing in this product destroys a user's material as
   * a side effect of something else.
   */
  deleteDay(owner: UserId, date: CalendarDate, viewer: Viewer): Promise<void>;

  updateProfile(
    owner: UserId,
    patch: Partial<Pick<Profile, "displayName" | "bio" | "visibility" | "discoverable" | "timeZone" | "locationPrecision">>,
    viewer: Viewer,
  ): Promise<PublicProfile>;

  /* -- Discovery --
     Deliberately thin. This must never grow into a feed. */

  /**
   * Find profiles by handle or display name.
   *
   * Only profiles that are both public and discoverable may ever appear.
   * Those are two separate consents and both are required.
   */
  findProfiles(query: string, limit?: number): Promise<PublicProfile[]>;
}

/* ---- Errors -------------------------------------------------------------
   A refusal is a domain outcome, not an exception to be stringified into a
   toast. Clients switch on `reason`. */

export type ArchiveErrorReason =
  | "not-found"
  | "forbidden"
  | "invalid-date"
  | "conflict"
  | "asset-not-ready";

export class ArchiveError extends Error {
  constructor(
    readonly reason: ArchiveErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "ArchiveError";
  }
}

/**
 * Whether a viewer is the owner.
 *
 * Trivial, and given a name so that every authorisation check in every
 * implementation reads identically and can be found with one search.
 */
export function isOwner(owner: UserId, viewer: Viewer): boolean {
  return viewer.userId !== null && viewer.userId === owner;
}

/**
 * The location precision a viewer is entitled to.
 *
 * The owner sees everything they recorded. Everyone else is capped by what
 * the profile publishes, which the per-day setting can then narrow further
 * but never widen.
 */
export function permittedPrecision(
  owner: UserId,
  profilePrecision: LocationPrecision,
  viewer: Viewer,
): LocationPrecision {
  return isOwner(owner, viewer) ? "precise" : profilePrecision;
}

/** Whether a day may be shown to this viewer at all. */
export function dayIsVisible(
  owner: UserId,
  day: Pick<DayEntry, "visibility" | "deletedAt">,
  profileVisibility: Profile["visibility"],
  viewer: Viewer,
): boolean {
  if (isOwner(owner, viewer)) return day.deletedAt === undefined;
  if (day.deletedAt !== undefined) return false;
  if (profileVisibility !== "public") return false;
  /* Unlisted days are reachable by direct link but never listed, which is a
     decision for the caller — this function answers reachability only. */
  return day.visibility === "public" || day.visibility === "unlisted";
}

export type { DayEntry, PhotoRevision, Profile, ResolvedDay, DaySummary };
