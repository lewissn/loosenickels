import { entry, researchPaper, type Entry, type ResearchPaper } from "@/lib/archive/schema";
import { objects } from "./objects";
import { places } from "./places";
import { fieldNotes } from "./field-notes";
import { thoughts } from "./thoughts";
import { photographs, sounds, experiments } from "./media-entries";
import { papers } from "@/content/research/papers";

/* =========================================================================
   The registry

   Every record in the archive passes through validation here, at module
   load, and the process fails loudly if any of them is malformed. There is
   no path by which an invalid record reaches a component.

   This is the only file that knows records currently live in TypeScript.
   When they move to a database, this file is what gets replaced.
   ========================================================================= */

const authored = [
  ...objects,
  ...places,
  ...fieldNotes,
  ...thoughts,
  ...photographs,
  ...sounds,
  ...experiments,
];

function parseAll(): { entries: Entry[]; research: ResearchPaper[] } {
  const entries: Entry[] = [];
  const research: ResearchPaper[] = [];

  for (const record of authored) {
    const result = entry.safeParse(record);
    if (!result.success) {
      throw new Error(
        `Malformed archive record ${String(record.id)}:\n${result.error.message}`,
      );
    }
    entries.push(result.data);
  }

  for (const record of papers) {
    const result = researchPaper.safeParse(record);
    if (!result.success) {
      throw new Error(
        `Malformed research paper ${String(record.id)}:\n${result.error.message}`,
      );
    }
    research.push(result.data);
    entries.push(result.data);
  }

  assertUnique(entries);
  return { entries, research };
}

/** Accession numbers and slugs are both routable, so both must be unique. */
function assertUnique(entries: Entry[]): void {
  const ids = new Set<string>();
  const slugs = new Set<string>();

  for (const e of entries) {
    if (ids.has(e.id)) {
      throw new Error(`Duplicate accession number: ${e.id}`);
    }
    if (slugs.has(e.slug)) {
      throw new Error(`Duplicate slug: ${e.slug} (on ${e.id})`);
    }
    ids.add(e.id);
    slugs.add(e.slug);
  }

  /* Cross-references must resolve. A dangling "related" would render as a
     broken link to a record that was never accessioned. */
  for (const e of entries) {
    for (const ref of e.related) {
      if (!ids.has(ref)) {
        throw new Error(`${e.id} references ${ref}, which is not accessioned.`);
      }
    }
  }
}

const parsed = parseAll();

export const ENTRIES: readonly Entry[] = Object.freeze(parsed.entries);
export const RESEARCH: readonly ResearchPaper[] = Object.freeze(parsed.research);
