import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getSupabase } from "@/lib/supabase/server";
import {
  MAX_ORIGINAL_BYTES,
  extensionFor,
  objectKey,
  signedUpload,
} from "@/lib/storage/blob";

/* =========================================================================
   Transfer, step one: ask to send a photograph.

   The bytes do not come through here. A serverless function caps its
   request body at a few megabytes and a photograph from a modern phone is
   larger than that, so this hands back a URL the client uploads to
   directly.

   Nothing about a *day* happens here, and that is the change from the first
   version of this route. Transfer and submission are separate steps — the
   interface says so and gives the reason: a failed commit must not mean
   re-sending the bytes over a bad connection. Opening a day entry here
   meant every abandoned upload left a half-written day behind it.
   ========================================================================= */

const request = z.object({
  contentType: z.string(),
  byteSize: z.number().int().positive().max(MAX_ORIGINAL_BYTES),
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

  const { contentType, byteSize } = asked.data;

  if (!extensionFor("original", contentType)) {
    return problem(415, `${contentType} is not a photograph this can read.`);
  }

  /* The key is minted here rather than by the client, from a uuid the
     client never chooses. It is not derived from anything a visitor can
     see, and the store has no public access, so it is unguessable in both
     directions. */
  const key = objectKey(randomUUID(), "original", contentType);

  return NextResponse.json(
    {
      storageKey: key,
      uploadUrl: await signedUpload(key, contentType, byteSize),
      /* The client must send exactly this type, and no more than this many
         bytes: both are carried in the delegation and enforced by the CDN. */
      contentType,
      byteSize,
      expiresInSeconds: 120,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
