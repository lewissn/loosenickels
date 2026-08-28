import { seedSource } from "./seed-source";
import type { ArchiveSource } from "./source";

/* =========================================================================
   The archive

   One binding. Every page, every component and every route handler reads
   through it, and none of them know or care what is behind it.

   It is the seed source today because there is no database yet. Moving onto
   Postgres and object storage is a matter of writing a second ArchiveSource
   and changing the line below — the surfaces above it are already written
   against the contract rather than against an implementation, and the
   authorisation rules already live on this side of the seam rather than in
   the interface.
   ========================================================================= */

export const archive: ArchiveSource = seedSource;

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
export { SEED_OWNER, SEED_VIEWER } from "./seed-source";
