import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { derive, UndecodableImage } from "./derive";

/* =========================================================================
   The work queue.

   A photograph is recorded the moment its original is safe. Making the
   renditions is separate, and deliberately so: the person who took it has
   finished, and should not be watching a spinner while a server resizes
   something. `photo_revisions_unfinished` — an index the foundation already
   carried for exactly this — is the queue.

   This runs with the service role key, which bypasses row level security.
   That is correct here and nowhere else: the pipeline is not acting for a
   viewer, it is acting for the archive, and it must be able to finish a
   photograph belonging to someone who is not currently asking for anything.
   Nothing in this file takes a viewer, and nothing in it may ever return a
   row to a caller — the moment it does, it is a way around every policy.
   ========================================================================= */

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface Processed {
  attempted: number;
  ready: number;
  failed: number;
  problems: string[];
}

/** How many to take in one pass. Small: a function has a time limit, and a
    queue that never empties is better than a run that never finishes. */
const BATCH = 3;

export async function processPending(limit = BATCH): Promise<Processed> {
  const db = serviceClient();
  const out: Processed = { attempted: 0, ready: 0, failed: 0, problems: [] };

  const { data: waiting } = await db
    .from("photo_revisions")
    .select("id, user_id, media_assets!inner ( id, variant, storage_key )")
    .eq("state", "pending")
    .eq("media_assets.variant", "original")
    .order("created_at", { ascending: true })
    .limit(limit)
    .returns<
      Array<{
        id: string;
        user_id: string;
        media_assets: Array<{ storage_key: string }>;
      }>
    >();

  for (const revision of waiting ?? []) {
    const original = revision.media_assets?.[0];
    if (!original) continue;

    out.attempted += 1;

    /* Claimed before the work starts, and only if it is still pending. Two
       overlapping runs — a cron and a just-recorded photograph — would
       otherwise both resize the same image and race to write the same
       rows. The update is the lock. */
    const { data: claimed } = await db
      .from("photo_revisions")
      .update({ state: "processing" })
      .eq("id", revision.id)
      .eq("state", "pending")
      .select("id")
      .maybeSingle<{ id: string }>();

    if (!claimed) continue;

    try {
      const derived = await derive(revision.id, original.storage_key);

      const { error: written } = await db.from("media_assets").upsert(
        derived.variants.map((v) => ({
          photo_revision_id: revision.id,
          /* Carried from the revision. `media_assets.user_id` is NOT NULL,
             and omitting it made every one of these inserts fail — silently,
             because this call's error was discarded, so a revision with no
             renditions at all was still marked ready. */
          user_id: revision.user_id,
          variant: v.variant,
          storage_key: v.storageKey,
          content_type: v.contentType,
          byte_size: v.byteSize,
          width: v.width,
          height: v.height,
        })),
        { onConflict: "photo_revision_id,variant" },
      );

      /* Thrown, not logged. A revision is only `ready` when something can
         actually be shown for it, and marking it ready on the strength of a
         resize that was never recorded is worse than failing: it stops the
         queue ever coming back to it. */
      if (written) {
        throw new Error(`The renditions could not be recorded: ${written.message}`);
      }

      await db
        .from("photo_revisions")
        .update({
          state: "ready",
          failure_reason: null,
          width: derived.width,
          height: derived.height,
          placeholder: derived.placeholder,
        })
        .eq("id", revision.id);

      out.ready += 1;
    } catch (error) {
      /* A photograph the pipeline cannot read is `failed` and stays failed:
         retrying a HEIC forever costs money and changes nothing. Anything
         else goes back to `pending`, because the usual cause is a timeout
         or a blip and the next pass should pick it up. */
      const permanent = error instanceof UndecodableImage;
      const said = error instanceof Error ? error.message : String(error);

      await db
        .from("photo_revisions")
        .update({
          state: permanent ? "failed" : "pending",
          failure_reason: said.slice(0, 500),
        })
        .eq("id", revision.id);

      out.failed += 1;
      out.problems.push(said);
    }
  }

  return out;
}
