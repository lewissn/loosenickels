import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseFor } from "@/lib/supabase/server";
import { describeObject, extensionFor } from "@/lib/storage/blob";

/* =========================================================================
   Transfer, step two: say the bytes arrived.

   The claim comes from the client, so it is not taken on trust: the store
   is asked whether the object is there, and its answer — not the client's —
   is what gets written down.

   This registers an asset and stops. The asset belongs to whoever uploaded
   it and to no day yet. Attaching it to a date is `archive.submit`, which
   is a separate call and can be retried without re-sending anything.
   ========================================================================= */

const request = z.object({
  storageKey: z.string().min(1),
  contentType: z.string(),
  /* The one thing only the client knows, because reading it here would mean
     pulling the whole photograph back out of the store to decode it. These
     are facts about a person's own photograph rather than about what they
     are allowed to see, so a wrong number costs them a wrong number and
     nobody else anything. */
  width: z.number().int().positive().max(100_000),
  height: z.number().int().positive().max(100_000),
  variant: z.enum(["original", "source"]).default("original"),
});

const problem = (status: number, said: string) =>
  NextResponse.json({ problem: said }, { status });

export async function POST(req: Request) {
  const supabase = await getSupabaseFor(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return problem(401, "Not signed in.");

  const body = await req.json().catch(() => null);
  const asked = request.safeParse(body);
  if (!asked.success) return problem(400, "That request does not make sense.");

  const { storageKey, contentType, width, height, variant } = asked.data;

  if (!extensionFor(variant, contentType)) {
    return problem(415, `${contentType} is not a photograph this can read.`);
  }

  /* The key was minted by the route above, which put the caller's own
     upload behind it. Checking the shape here stops a signed-in user
     naming somebody else's object and registering it as their own. */
  if (!storageKey.startsWith("photos/")) {
    return problem(400, "That is not an upload key.");
  }

  const object = await describeObject(storageKey);
  if (!object) return problem(409, "Nothing arrived in the store.");

  /* A retry of the same registration finds the row already there —
     `storage_key` is unique — and returns it rather than failing. The key
     came from one signed URL, so this is idempotent for free. */
  const { data: existing } = await supabase
    .from("media_assets")
    .select("id")
    .eq("storage_key", storageKey)
    .maybeSingle<{ id: string }>();

  if (existing) {
    return NextResponse.json(
      { assetId: existing.id, registered: false },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const { data: asset, error } = await supabase
    .from("media_assets")
    .insert({
      user_id: user.id,
      photo_revision_id: null,
      variant,
      storage_key: storageKey,
      content_type: object.contentType,
      byte_size: object.byteSize,
      width,
      height,
      checksum: object.checksum,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !asset) {
    return problem(500, "The photograph could not be recorded.");
  }

  return NextResponse.json(
    { assetId: asset.id, registered: true },
    { headers: { "cache-control": "no-store" } },
  );
}
