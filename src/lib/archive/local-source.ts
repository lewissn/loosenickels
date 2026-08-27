import { ENTRIES, RESEARCH } from "@/content/entries";
import { collections as COLLECTIONS } from "@/content/collections";
import {
  DEPARTMENT_CODES,
  toSummary,
  type AccessionId,
  type Collection,
  type DepartmentCode,
  type Entry,
  type EntrySummary,
  type ResearchPaper,
} from "./schema";
import {
  haversine,
  mulberry32,
  orderEntries,
  type ArchiveSource,
  type ArchiveStats,
  type EntryQuery,
  type SearchHit,
} from "./source";

/* =========================================================================
   File-backed ArchiveSource

   Reads the in-repo registry. Everything is resolved in memory, which is
   correct for an archive of this size and would be the wrong shape at ten
   thousand records — at which point this file is replaced and nothing
   above it changes.
   ========================================================================= */

const PUBLIC = ENTRIES.filter(
  (e) => e.visibility === "public" && e.status !== "withdrawn",
);

const BY_ID = new Map<string, Entry>(ENTRIES.map((e) => [e.id, e]));
const BY_SLUG = new Map<string, Entry>(ENTRIES.map((e) => [e.slug, e]));

function matches(e: Entry, q: EntryQuery): boolean {
  const status = q.status ?? ["accessioned"];
  if (!status.includes(e.status)) return false;
  if (q.excluding && e.id === q.excluding) return false;

  if (q.dept) {
    const wanted = Array.isArray(q.dept) ? q.dept : [q.dept];
    if (!wanted.includes(e.dept)) return false;
  }
  if (q.collection && !e.collections.includes(q.collection)) return false;
  if (q.tag && !e.tags.includes(q.tag)) return false;
  if (q.significance && e.significance !== q.significance) return false;
  if (q.placed === true && !e.place?.coordinates) return false;
  if (q.placed === false && e.place?.coordinates) return false;

  return true;
}

function select(q: EntryQuery = {}): EntrySummary[] {
  const found = PUBLIC.filter((e) => matches(e, q)).map(toSummary);
  const ordered = orderEntries(found, q.order);
  const from = q.offset ?? 0;
  return q.limit === undefined
    ? ordered.slice(from)
    : ordered.slice(from, from + q.limit);
}

/* ---- Search -------------------------------------------------------------
   Deliberately more capable than an archive this size requires. Fields are
   weighted so that an accession number typed in full always wins, a title
   match beats a body match, and a place name is worth more than a tag. */

const FIELD_WEIGHT: Record<SearchHit["field"], number> = {
  accession: 0,
  title: 1,
  place: 2,
  collection: 3,
  summary: 4,
  tag: 5,
  body: 6,
};

function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    /* En-dashes in displayed accession numbers must match hyphens typed. */
    .replace(/[–—]/g, "-");
}

function excerptAround(text: string, needle: string): string {
  const at = normalise(text).indexOf(needle);
  if (at < 0) return text.slice(0, 120);
  const from = Math.max(0, at - 40);
  const to = Math.min(text.length, at + needle.length + 80);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

function searchEntry(e: Entry, needle: string): SearchHit | null {
  const summary = toSummary(e);
  const hit = (field: SearchHit["field"], excerpt?: string): SearchHit => ({
    entry: summary,
    score: FIELD_WEIGHT[field],
    field,
    excerpt,
  });

  if (normalise(e.id).includes(needle)) return hit("accession", e.id);
  if (normalise(e.title).includes(needle)) return hit("title", e.title);

  if (e.place) {
    const where = [e.place.name, e.place.region, e.place.country]
      .filter(Boolean)
      .join(", ");
    if (normalise(where).includes(needle)) return hit("place", where);
  }

  const collection = e.collections.find((c) => normalise(c).includes(needle));
  if (collection) return hit("collection", collection.replace(/-/g, " "));

  if (e.summary && normalise(e.summary).includes(needle)) {
    return hit("summary", excerptAround(e.summary, needle));
  }

  const tag = e.tags.find((t) => normalise(t).includes(needle));
  if (tag) return hit("tag", tag);

  for (const block of e.body) {
    const text =
      "text" in block
        ? block.text
        : block.type === "list"
          ? block.items.join(" ")
          : "";
    if (text && normalise(text).includes(needle)) {
      return hit("body", excerptAround(text, needle));
    }
  }

  return null;
}

/* ---- Adjacency ----------------------------------------------------------
   What the archive considers nearby when nothing was explicitly linked:
   shared collection first, then physical proximity, then the chronology.
   Each of these is a genuinely different sense of "related" and the source
   returns them blended rather than making the caller choose. */

function adjacencyScore(a: Entry, b: Entry): number {
  let score = 0;

  const shared = a.collections.filter((c) => b.collections.includes(c)).length;
  score += shared * 40;

  if (a.place?.coordinates && b.place?.coordinates) {
    const metres = haversine(a.place.coordinates, b.place.coordinates);
    if (metres < 50_000) score += Math.round(40 * (1 - metres / 50_000));
  }

  const sharedTags = a.tags.filter((t) => b.tags.includes(t)).length;
  score += sharedTags * 8;

  if (a.dept === b.dept) score += 6;

  const days =
    Math.abs(Date.parse(a.date) - Date.parse(b.date)) / 86_400_000;
  if (days < 30) score += Math.round(12 * (1 - days / 30));

  return score;
}

export const localSource: ArchiveSource = {
  async entries(query) {
    return select(query);
  },

  async entry(idOrSlug) {
    const key = idOrSlug.trim();
    const found =
      BY_ID.get(key.toUpperCase().replace(/[–—]/g, "-")) ?? BY_SLUG.get(key);
    if (!found) return null;
    if (found.visibility !== "public" || found.status === "withdrawn") return null;
    return found;
  },

  async related(id) {
    const source = BY_ID.get(id);
    if (!source) return [];
    return source.related
      .map((ref) => BY_ID.get(ref))
      .filter((e): e is Entry => Boolean(e))
      .filter((e) => e.visibility === "public" && e.status !== "withdrawn")
      .map(toSummary);
  },

  async adjacent(id, limit = 4) {
    const source = BY_ID.get(id);
    if (!source) return [];

    return PUBLIC.filter(
      (e) => e.id !== id && !source.related.includes(e.id as AccessionId),
    )
      .map((e) => ({ entry: e, score: adjacencyScore(source, e) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
      .slice(0, limit)
      .map((row) => toSummary(row.entry));
  },

  async collections() {
    return [...COLLECTIONS].sort((a, b) => a.title.localeCompare(b.title));
  },

  async collection(slug) {
    return COLLECTIONS.find((c) => c.slug === slug) ?? null;
  },

  async research() {
    return [...RESEARCH].sort((a, b) => b.date.localeCompare(a.date));
  },

  async paper(slug) {
    return RESEARCH.find((p) => p.slug === slug) ?? null;
  },

  async stats() {
    const byDepartment = Object.fromEntries(
      DEPARTMENT_CODES.map((code) => [
        code,
        PUBLIC.filter((e) => e.dept === code).length,
      ]),
    ) as Record<DepartmentCode, number>;

    const dates = PUBLIC.map((e) => e.date).sort();

    return {
      total: PUBLIC.length,
      byDepartment,
      collections: COLLECTIONS.length,
      placed: PUBLIC.filter((e) => e.place?.coordinates).length,
      earliest: dates[0],
      latest: dates[dates.length - 1],
      undetermined: PUBLIC.filter((e) => e.significance === "undetermined").length,
    } satisfies ArchiveStats;
  },

  async search(query, limit = 8) {
    const needle = normalise(query.trim());
    if (needle.length < 2) return [];

    return PUBLIC.map((e) => searchEntry(e, needle))
      .filter((hit): hit is SearchHit => hit !== null)
      .sort(
        (a, b) => a.score - b.score || a.entry.id.localeCompare(b.entry.id),
      )
      .slice(0, limit);
  },

  async random(seed, query) {
    const pool = select({ ...query, limit: undefined, offset: undefined });
    if (pool.length === 0) return null;
    const next = mulberry32(seed ?? Math.floor(Math.random() * 0xffffffff));
    return pool[Math.floor(next() * pool.length)] ?? null;
  },
};

export type { Collection, ResearchPaper };
