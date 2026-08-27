import { localSource } from "./local-source";
import type { ArchiveSource } from "./source";

/* =========================================================================
   The archive

   One binding. Every page, every component and every route handler reads
   through it and none of them know or care what is behind it.

   To move the archive onto a database, write a second ArchiveSource and
   change this line. Nothing else in the application is aware of the
   difference.
   ========================================================================= */

export const archive: ArchiveSource = localSource;

export * from "./schema";
export * from "./accession";
export type {
  ArchiveSource,
  ArchiveStats,
  EntryQuery,
  EntryOrder,
  SearchHit,
} from "./source";
export { haversine, mulberry32, orderEntries } from "./source";
export { runSearch, scoreRecord, toSearchable, normalise } from "./search";
export type { SearchableRecord, Match, MatchField } from "./search";
