import { archive, SEED_OWNER, SEED_VIEWER } from "@/lib/archive";
import { Archive } from "@/components/day/Archive";
import { SEED_PROFILE } from "@/content/seed";
import type { ResolvedDay } from "@/lib/archive/schema";

/* =========================================================================
   Latest

   The homepage is the most recently recorded day — not today's, necessarily.
   If the latest photograph is yesterday's, yesterday's is what is shown, in
   full, and the owner is told separately and quietly that today is still
   open. An empty screen for the sin of not having posted yet would be the
   product punishing someone for missing a day, which is precisely what it
   must never do.

   The viewer is signed in as the seed account, because authentication does
   not exist yet. That is the one line in this file that will change when it
   does: the viewer will come from the session, and every authorisation
   decision already happens behind the archive interface rather than here.
   ========================================================================= */

const viewer = SEED_VIEWER;

export default async function Latest() {
  const [latest, status] = await Promise.all([
    archive.latestDay(SEED_OWNER, viewer),
    archive.status(SEED_OWNER, viewer),
  ]);

  if (!latest) {
    return <Archive days={[]} timeZone={SEED_PROFILE.timeZone} />;
  }

  /* A window of days, walked outward from the latest, so the viewer has
     genuine adjacency to move through. In production this becomes a paged
     window that extends as the user travels — the shape of the call is the
     same, only the size of the window changes. */
  const days = await walkBack(latest, 24);

  return (
    <Archive
      days={days}
      timeZone={SEED_PROFILE.timeZone}
      status={status ? { todayRecorded: status.todayRecorded } : undefined}
    />
  );
}

/** Newest first, following `neighbours` rather than assuming the archive is
    contiguous — it is not, and the gaps are part of the record. */
async function walkBack(from: ResolvedDay, limit: number): Promise<ResolvedDay[]> {
  const days: ResolvedDay[] = [from];
  let cursor = from;

  while (days.length < limit) {
    const { previous } = await archive.neighbours(SEED_OWNER, cursor.date, viewer);
    if (!previous) break;
    days.push(previous);
    cursor = previous;
  }

  return days;
}
