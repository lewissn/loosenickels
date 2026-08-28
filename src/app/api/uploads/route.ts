import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase/server";
import {
  MAX_ORIGINAL_BYTES,
  extensionFor,
  objectKey,
  signedUpload,
} from "@/lib/storage/r2";

/* Asking to file a photograph. The bytes do not come through here: a
   serverless function caps its request body at a few megabytes and a
   photograph from a modern phone is larger than that, so this reserves the
   place in the database and hands back a URL the client uploads to
   directly. Nothing is minted before the session has been checked. */

const request = z.object({
  /* The date as the person's own device understands it. Never derived from
     the server, which is in the wrong place to have an opinion. */
  entryDate: z.iso.date(),
  contentType: z.string(),
  byteSize: z.number().int().positive().max(MAX_ORIGINAL_BYTES),
  capturedAt: z.iso.datetime({ offset: true }).optional(),
  captureTimezone: z.string().max(64).optional(),
});

const problem = (status: number, said: string) =>
  NextResponse.json({ problem: said }, { status });

export async function POST(req: Request) {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return problem(401, "Not signed in.");

  const body = await req.json().catch(() => null);
  const asked = request.safeParse(body);
  if (!asked.success) return problem(400, "That request does not make sense.");

  const { entryDate, contentType, byteSize, capturedAt, captureTimezone } =
    asked.data;

  if (!extensionFor("original", contentType)) {
    return problem(415, `${contentType} is not a photograph this can read.`);
  }

  /* The day exists or comes into being; either way there is exactly one of
     it, because the database says so rather than because this checked. */
  const { data: entry, error: entryFailed } = await supabase
    .from("day_entries")
    .upsert(
      { user_id: user.id, entry_date: entryDate },
      { onConflict: "user_id,entry_date" },
    )
    .select("id")
    .single();

  /* Very nearly always the date guard: a date further ahead than the far
     side of the date line can account for. */
  if (entryFailed || !entry) return problem(422, "That date cannot be filed.");

  const { data: revision, error: revisionFailed } = await supabase
    .from("photo_revisions")
    .insert({
      day_entry_id: entry.id,
      user_id: user.id,
      captured_at: capturedAt ?? null,
      capture_timezone: captureTimezone ?? null,
    })
    .select("id, revision_number")
    .single();

  if (revisionFailed || !revision) {
    return problem(500, "The record could not be opened.");
  }

  const key = objectKey(revision.id, "original", contentType);

  return NextResponse.json(
    {
      revisionId: revision.id,
      revisionNumber: revision.revision_number,
      uploadUrl: await signedUpload(key, contentType, byteSize),
      /* The client must send exactly this, and exactly this many bytes:
         both are inside the signature. */
      contentType,
      byteSize,
      expiresInSeconds: 120,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
