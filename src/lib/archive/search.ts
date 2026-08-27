import type { DepartmentCode, Entry } from "./schema";
import { format } from "./accession";
import { DEPARTMENTS } from "./schema";

/* =========================================================================
   Search

   One implementation, used by both the source and the enquiry surface.

   It was previously two: a weighted search in the file-backed source that
   matched tags and body text and extracted excerpts, and a second, weaker
   one written inline in the palette that matched neither. The palette is
   the only search anybody can actually reach, so the good one was dead
   code and the archive quietly could not find a record by any word that
   appeared only in its tags — "stone", "rain", "frost", "iron" all
   returned nothing.

   The fix is not to make the palette call the server. It is to have one
   scoring function that both sides run over the same shape.
   ========================================================================= */

/** Everything the scorer needs, and nothing it does not. */
export interface SearchableRecord {
  id: string;
  /** Accession number in display form, with en-dashes. */
  display: string;
  dept: DepartmentCode;
  department: string;
  slug: string;
  title: string;
  summary?: string;
  /** Place name and region, already joined. */
  place?: string;
  collections: string[];
  tags: string[];
  /** The body, flattened to plain text. */
  text?: string;
  date: string;
}

export type MatchField =
  | "accession"
  | "title"
  | "place"
  | "collection"
  | "tag"
  | "summary"
  | "body"
  | "department";

/* Fields are weighted rather than concatenated, and the order is the
   argument: an accession number typed in full always wins, a title beats a
   place, a place beats a tag, and a body match is the last resort. Ranking
   by where the match occurred is the difference between a search that
   feels considered and one that feels like a filter. */
const WEIGHT: Record<MatchField, number> = {
  accession: 0,
  title: 1,
  place: 3,
  collection: 4,
  tag: 5,
  summary: 6,
  department: 7,
  body: 8,
};

export interface Match {
  record: SearchableRecord;
  field: MatchField;
  score: number;
  /** The matched text, for display under the title. */
  excerpt?: string;
}

/** Case, accents and dash style are all levelled before comparison. */
export function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[–—]/g, "-");
}

function excerptAround(text: string, needle: string): string {
  const at = normalise(text).indexOf(needle);
  if (at < 0) return text.slice(0, 120);
  const from = Math.max(0, at - 40);
  const to = Math.min(text.length, at + needle.length + 90);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

export function scoreRecord(
  record: SearchableRecord,
  needle: string,
): Match | null {
  const hit = (field: MatchField, excerpt?: string, bonus = 0): Match => ({
    record,
    field,
    score: WEIGHT[field] + bonus,
    excerpt,
  });

  const id = normalise(record.id);
  if (id.includes(needle)) {
    return hit("accession", record.display, id.startsWith(needle) ? 0 : 0.5);
  }

  const title = normalise(record.title);
  if (title.includes(needle)) {
    /* A title that begins with the query outranks one that merely
       contains it. */
    return hit("title", record.summary, title.startsWith(needle) ? 0 : 0.5);
  }

  if (record.place && normalise(record.place).includes(needle)) {
    return hit("place", record.place);
  }

  const collection = record.collections.find((c) =>
    normalise(c).includes(needle),
  );
  if (collection) return hit("collection", collection.replace(/-/g, " "));

  const tag = record.tags.find((t) => normalise(t).includes(needle));
  if (tag) return hit("tag", record.summary ?? tag);

  if (record.summary && normalise(record.summary).includes(needle)) {
    return hit("summary", excerptAround(record.summary, needle));
  }

  if (normalise(record.department).includes(needle)) {
    return hit("department", record.summary);
  }

  if (record.text && normalise(record.text).includes(needle)) {
    return hit("body", excerptAround(record.text, needle));
  }

  return null;
}

export function runSearch(
  records: readonly SearchableRecord[],
  query: string,
  limit = 12,
): Match[] {
  const needle = normalise(query.trim());
  /* One character matches most of the archive and answers nothing. */
  if (needle.length < 2) return [];

  return records
    .map((record) => scoreRecord(record, needle))
    .filter((match): match is Match => match !== null)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.record.title.localeCompare(b.record.title, "en-GB"),
    )
    .slice(0, limit);
}

/* ---- Projection ---------------------------------------------------------
   Turning a full record into the shape the scorer wants. The body is
   flattened and capped: enough text for a body match to be meaningful,
   not so much that the whole archive's prose ships to the client. */

const BODY_BUDGET = 900;

export function toSearchable(entry: Entry): SearchableRecord {
  const text = entry.body
    .map((block) => {
      if ("text" in block) return block.text;
      if (block.type === "list") return block.items.join(" ");
      if (block.type === "measurements") {
        return block.rows.map(([key, value]) => `${key} ${value}`).join(" ");
      }
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .slice(0, BODY_BUDGET);

  return {
    id: entry.id,
    display: format(entry.id),
    dept: entry.dept,
    department: DEPARTMENTS[entry.dept].name,
    slug: entry.slug,
    title: entry.title,
    summary: entry.summary,
    place: entry.place
      ? [entry.place.name, entry.place.region].filter(Boolean).join(", ")
      : undefined,
    collections: entry.collections,
    tags: entry.tags,
    text,
    date: entry.date,
  };
}
