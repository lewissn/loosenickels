import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase/server";
import { archive, SEED_OWNER, SEED_VIEWER } from "@/lib/archive";
import type { ResolvedDay } from "@/lib/archive/schema";
import { Archive } from "@/components/day/Archive";
import { Menu } from "@/components/chrome/Menu";
import { SEED_PROFILE } from "@/content/seed";

export const metadata: Metadata = { title: "Today" };

/* =========================================================================
   The daily viewer

   The landing page is what the most recently recorded day is — not today's,
   necessarily. If the latest photograph is yesterday's, yesterday's is what
   is shown, in full, and the owner is told separately and quietly that today
   is still open. An empty screen for the sin of not having posted yet would
   be the product punishing someone for missing a day, which is precisely
   what it must never do.

   Two things here are still provisional, and both are single lines.

   The archive is the seed source, so the days below are fixtures rather than
   this account's. Writing a Supabase-backed ArchiveSource and changing one
   line in src/lib/archive/index.ts is what replaces them; every surface here
   already reads through the seam.

   And the viewer is the seed account rather than the signed-in one, because
   the seed source only knows about SEED_OWNER. The Supabase user is real and
   already guards this page — it becomes the archive's viewer at the same
   moment the archive becomes real.
   ========================================================================= */

export default async function TodayPage() {
  /* The proxy has already turned anonymous visitors away. This asks again,
     because the page is where the answer has to be true: a guard that only
     runs in front of the door is a guard that can be walked around. */
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const [latest, status] = await Promise.all([
    archive.latestDay(SEED_OWNER, SEED_VIEWER),
    archive.status(SEED_OWNER, SEED_VIEWER),
  ]);

  /* A window of days, walked outward from the latest, so the viewer has
     genuine adjacency to move through. In production this becomes a paged
     window that extends as the user travels — the shape of the call is the
     same, only the size of the window changes. */
  const days = latest ? await walkBack(latest, 24) : [];

  return (
    <>
      <Archive
        days={days}
        timeZone={SEED_PROFILE.timeZone}
        status={status ? { todayRecorded: status.todayRecorded } : undefined}
      />
      <Menu account={user.email} />
    </>
  );
}

/** Newest first, following `neighbours` rather than assuming the archive is
    contiguous — it is not, and the gaps are part of the record. */
async function walkBack(from: ResolvedDay, limit: number): Promise<ResolvedDay[]> {
  const days: ResolvedDay[] = [from];
  let cursor = from;

  while (days.length < limit) {
    const { previous } = await archive.neighbours(SEED_OWNER, cursor.date, SEED_VIEWER);
    if (!previous) break;
    days.push(previous);
    cursor = previous;
  }

  return days;
}
