import type {
  AccessionId,
  Collection,
  DepartmentCode,
  Entry,
  EntrySummary,
  EntryStatus,
  ResearchPaper,
  Significance,
} from "./schema";

/* =========================================================================
   ArchiveSource

   The seam between the archive and the website.

   Every surface in the application reads through this interface and none
   of them import a content file directly. Replacing the file-backed
   implementation with one that speaks to Postgres — or to the API that a
   private publishing client also writes through — is a matter of
   supplying a different object here. No component changes.

   The methods are async even though the current implementation is
   synchronous. That is deliberate: it is the only part of the contract
   that would otherwise have to change later, and it costs nothing now.
   ========================================================================= */

export type EntryOrder =
  | "chronological"
  | "reverse-chronological"
  | "accession"
  | "recently-accessioned";

export interface EntryQuery {
  dept?: DepartmentCode | DepartmentCode[];
  collection?: string;
  tag?: string;
  significance?: Significance;
  /** Defaults to `["accessioned"]`. Withdrawn records are never public. */
  status?: EntryStatus[];
  /** Only records carrying coordinates. */
  placed?: boolean;
  order?: EntryOrder;
  limit?: number;
  offset?: number;
  /** Exclude a record — used for "related" and "elsewhere in the archive". */
  excluding?: AccessionId;
}

export interface ArchiveStats {
  total: number;
  byDepartment: Record<DepartmentCode, number>;
  collections: number;
  /** Records carrying coordinates. */
  placed: number;
  /** ISO date of the oldest and newest record, by subject date. */
  earliest?: string;
  latest?: string;
  /** Records whose significance remains undetermined. Usually most of them. */
  undetermined: number;
}

export interface SearchHit {
  entry: EntrySummary;
  /** Lower is better. */
  score: number;
  /** Which field matched, for display in the search surface. */
  field: "title" | "summary" | "accession" | "place" | "tag" | "collection" | "body";
  /** The matched text, for highlighting. */
  excerpt?: string;
}

export interface ArchiveSource {
  /** Listing projection. Never returns withdrawn or restricted records. */
  entries(query?: EntryQuery): Promise<EntrySummary[]>;

  /** Full record by accession number or slug. */
  entry(idOrSlug: string): Promise<Entry | null>;

  /** Records explicitly cross-referenced by another, in declared order. */
  related(id: AccessionId): Promise<EntrySummary[]>;

  /**
   * Records the archive considers adjacent but which were not explicitly
   * linked: shared collection, shared place, or nearest in the chronology.
   */
  adjacent(id: AccessionId, limit?: number): Promise<EntrySummary[]>;

  collections(): Promise<Collection[]>;
  collection(slug: string): Promise<Collection | null>;

  research(): Promise<ResearchPaper[]>;
  paper(slug: string): Promise<ResearchPaper | null>;

  stats(): Promise<ArchiveStats>;

  search(query: string, limit?: number): Promise<SearchHit[]>;

  /**
   * Random discovery is a first-class navigation mode, not a novelty, so
   * it belongs in the source rather than in a component.
   *
   * `seed` makes a draw reproducible, which matters because the server and
   * the client must agree on what was drawn.
   */
  random(seed?: number, query?: EntryQuery): Promise<EntrySummary | null>;
}

/* ---- Shared helpers -----------------------------------------------------
   Sorting and filtering live here rather than in an implementation so that
   a future remote source can reuse them for anything it cannot push down
   into the query. */

export function compareByDate(a: { date: string }, b: { date: string }): number {
  return a.date.localeCompare(b.date);
}

export function orderEntries<T extends EntrySummary>(
  list: T[],
  order: EntryOrder = "reverse-chronological",
): T[] {
  const sorted = [...list];
  switch (order) {
    case "chronological":
      return sorted.sort(compareByDate);
    case "reverse-chronological":
      return sorted.sort((a, b) => compareByDate(b, a));
    case "accession":
      return sorted.sort((a, b) => a.id.localeCompare(b.id));
    case "recently-accessioned":
      return sorted.sort((a, b) => b.id.localeCompare(a.id));
  }
}

/**
 * Deterministic PRNG. Used for seeded random draws so that a record chosen
 * on the server is the same record the client hydrates with.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Great-circle distance in metres. Used by the survey plot and by `adjacent`. */
export function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type { Entry, EntrySummary, Collection, ResearchPaper };
