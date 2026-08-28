import { seedSource } from "./seed-source";
import { supabaseArchive } from "./supabase-source";
import type { ArchiveSource } from "./source";

/* =========================================================================
   The archive

   One binding. Every page, every component and every route handler reads
   through it, and none of them know or care what is behind it.

   It is Postgres now. The seed source is kept, and kept working, for one
   narrow job: laying out surfaces against fixtures without a database — the
   screenshots, the empty states, the compositions that need a photograph in
   an awkward aspect ratio to react to. Set `ARCHIVE_SOURCE=seed` for that.
   It is read-only and refuses every write rather than pretending.

   The default is deliberately the real one. A development default that
   silently serves fixtures is a development default that eventually ships,
   and the failure mode — a live site showing somebody else's invented days
   — is far worse than a local site that says it has no database.
   ========================================================================= */

export const archive: ArchiveSource =
  process.env.ARCHIVE_SOURCE === "seed" ? seedSource : supabaseArchive();

export * from "./schema";
export {
  ANONYMOUS,
  ArchiveError,
  dayIsVisible,
  isOwner,
  permittedPrecision,
} from "./source";
export type {
  ArchiveSource,
  ArchiveStatus,
  ArchiveErrorReason,
  DayRange,
  PublicProfile,
  RevisionHistory,
  SubmitPhoto,
  SubmitResult,
  Viewer,
} from "./source";
export { supabaseArchive } from "./supabase-source";
export { seedSource, SEED_OWNER, SEED_VIEWER } from "./seed-source";
