import "server-only";

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { entry, researchPaper, type Entry, type ResearchPaper } from "@/lib/archive/schema";

/* =========================================================================
   The registry

   One JSON file per accession number, in src/content/records, named for
   the number it carries. That naming is not decoration: it is how a new
   record is minted from outside this repository. A client listing the
   directory sees every number that has been used, and creating a file
   that already exists fails rather than overwriting — so two records can
   never quietly claim the same accession.

   Every record passes through validation here, at module load, and the
   build fails loudly if any of them is malformed. There is no path by
   which an invalid record reaches a component. That matters more now than
   it did when these were hand-authored TypeScript: a record arriving from
   a phone has had no compiler anywhere near it, and this is the only
   thing standing between a fat-fingered upload and a broken archive.

   This file is the only place that knows records currently live on disk.
   When they move to a database, this is what gets replaced.
   ========================================================================= */

const RECORDS = path.join(process.cwd(), "src/content/records");

function readRecords(): unknown[] {
  const files = readdirSync(RECORDS)
    .filter((name) => name.endsWith(".json"))
    /* Read in accession order so the registry is deterministic and a diff
       of the build output is legible. */
    .sort();

  return files.map((name) => {
    const raw = readFileSync(path.join(RECORDS, name), "utf8");
    try {
      return JSON.parse(raw);
    } catch (cause) {
      throw new Error(`${name} is not valid JSON.`, { cause });
    }
  });
}

function parseAll(): { entries: Entry[]; research: ResearchPaper[] } {
  const entries: Entry[] = [];
  const research: ResearchPaper[] = [];

  for (const record of readRecords()) {
    const dept = (record as { dept?: unknown }).dept;
    const id = String((record as { id?: unknown }).id ?? "unidentified");

    /* Research papers are entries with three extra fields. They are held
       in both collections: the archive lists them alongside everything
       else, and the Research department reads them as papers. */
    if (dept === "DR") {
      const result = researchPaper.safeParse(record);
      if (!result.success) {
        throw new Error(
          `Malformed research paper ${id}:\n${result.error.message}`,
        );
      }
      research.push(result.data);
      entries.push(result.data);
      continue;
    }

    const result = entry.safeParse(record);
    if (!result.success) {
      throw new Error(`Malformed archive record ${id}:\n${result.error.message}`);
    }
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
