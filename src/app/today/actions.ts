"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase/server";
import { archive, ArchiveError } from "@/lib/archive";
import { userId as asUserId, assetId as asAssetId } from "@/lib/archive/schema";
import type { ResolvedDay } from "@/lib/archive/schema";
import type { SubmitPhoto } from "@/lib/archive/source";

/* =========================================================================
   Recording a day.

   The bytes went straight from the browser to object storage and were
   registered as an asset; this is the separate step that says which day
   that asset is the photograph for. Splitting the two is what lets a failed
   commit be retried without re-sending a photograph over a bad connection.

   The owner is read from the session and never from the request. A client
   that could name whose archive it was writing to would be a client that
   could write to anyone's.
   ========================================================================= */

export type Recorded =
  | { ok: true; day: ResolvedDay; created: boolean }
  | { ok: false; problem: string };

export async function recordDay(
  input: Omit<SubmitPhoto, "assetId"> & { assetId: string },
): Promise<Recorded> {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, problem: "Not signed in." };

  const owner = asUserId.parse(user.id);

  try {
    const result = await archive.submit(
      owner,
      { ...input, assetId: asAssetId.parse(input.assetId) },
      { userId: owner },
    );

    /* The viewer is a server component reading through the archive, so the
       new day only appears on a fresh render. The client shows it
       immediately from the returned object; this is what makes a reload
       agree with the screen. */
    revalidatePath("/today");

    return { ok: true, day: result.day, created: result.created };
  } catch (error) {
    if (error instanceof ArchiveError) {
      /* A refusal is a domain outcome with a reason, not a stack trace to
         put in front of somebody who has just taken a photograph. */
      return { ok: false, problem: humanly(error) };
    }
    return { ok: false, problem: "That could not be recorded. Try again." };
  }
}

function humanly(error: ArchiveError): string {
  switch (error.reason) {
    case "invalid-date":
      return "That date is further ahead than any calendar has reached.";
    case "asset-not-ready":
      return "That photograph has not finished arriving.";
    case "forbidden":
      return "That is not yours to change.";
    case "not-found":
      return "That day has gone.";
    case "conflict":
      return "Something else was writing to that day. Try again.";
  }
}
