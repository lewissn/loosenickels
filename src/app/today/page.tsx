import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase/server";
import { archive } from "@/lib/archive";
import { userId as asUserId, type ResolvedDay } from "@/lib/archive/schema";
import type { Viewer } from "@/lib/archive/source";
import { Archive } from "@/components/day/Archive";
import { Menu } from "@/components/chrome/Menu";

export const metadata: Metadata = { title: "Today" };

/* =========================================================================
   The daily viewer

   What is shown is the most recently recorded day — not today's,
   necessarily. If the latest photograph is yesterday's, yesterday's is what
   is shown, in full, and the owner is told separately and quietly that
   today is still open. An empty screen for the sin of not having posted yet
   would be the product punishing someone for missing a day, which is
   precisely what it must never do.

   Owner and viewer are the same person here, because this is the private
   surface. They are still passed separately, because the archive interface
   takes both and the public profile pages will pass different ones.
   ========================================================================= */

/* Two dozen days of adjacency. In production this becomes a window that
   extends as the reader travels; the shape of the call does not change,
   only how many times it is made. */
const WINDOW = 24;

export default async function TodayPage() {
  /* The proxy has already turned anonymous visitors away. This asks again,
     because the page is where the answer has to be true: a guard that only
     runs in front of the door is a guard that can be walked around. */
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const owner = asUserId.parse(user.id);
  const viewer: Viewer = { userId: owner };

  const [latest, status] = await Promise.all([
    archive.latestDay(owner, viewer),
    archive.status(owner, viewer),
  ]);

  const days = latest ? await walkBack(latest, owner, viewer, WINDOW) : [];

  return (
    <>
      <Archive
        days={days}
        /* Their zone, from their profile — the server's is never the right
           answer and is not consulted. `status` is owner-only and is always
           present here, since the owner is who is asking. */
        timeZone={status?.timeZone ?? "Etc/UTC"}
        status={status ? { todayRecorded: status.todayRecorded } : undefined}
      />
      <Menu account={user.email} />
    </>
  );
}

/** Newest first, following `neighbours` rather than assuming the archive is
    contiguous — it is not, and the gaps are part of the record. */
async function walkBack(
  from: ResolvedDay,
  owner: ReturnType<typeof asUserId.parse>,
  viewer: Viewer,
  limit: number,
): Promise<ResolvedDay[]> {
  const days: ResolvedDay[] = [from];
  let cursor = from;

  while (days.length < limit) {
    const { previous } = await archive.neighbours(owner, cursor.date, viewer);
    if (!previous) break;
    days.push(previous);
    cursor = previous;
  }

  return days;
}
