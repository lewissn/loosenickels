import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase/server";
import { describeObject, extensionFor, objectKey } from "@/lib/storage/blob";

/* Saying the upload finished. The claim comes from the client, so it is
   not taken on trust: the bucket is asked whether the object is there, and
   its answer — not the client's — is what gets written down. */

const request = z.object({
  contentType: z.string(),
  /* The one thing only the client knows, because reading it here would
     mean pulling the whole photograph back out of the bucket to decode it.
     These are facts about a person's own photograph rather than about what
     they are allowed to see, so a wrong number costs them a wrong number
     and nobody else anything. */
  width: z.number().int().positive().max(100_000),
  height: z.number().int().positive().max(100_000),
});

const problem = (status: number, said: string) =>
  NextResponse.json({ problem: said }, { status });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ revision: string }> },
) {
  const { revision: revisionId } = await params;
  if (!z.uuid().safeParse(revisionId).success) {
    return problem(404, "No such record.");
  }

  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return problem(401, "Not signed in.");

  const body = await req.json().catch(() => null);
  const asked = request.safeParse(body);
  if (!asked.success) return problem(400, "That request does not make sense.");

  const { contentType, width, height } = asked.data;
  if (!extensionFor("original", contentType)) {
    return problem(415, `${contentType} is not a photograph this can read.`);
  }

  /* Row level security will already hand back a public revision belonging
     to somebody else, which is right for reading and wrong for writing.
     Ownership is asked separately. */
  const { data: revision } = await supabase
    .from("photo_revisions")
    .select("id, day_entry_id, user_id, state")
    .eq("id", revisionId)
    .maybeSingle();

  if (!revision || revision.user_id !== user.id) {
    return problem(404, "No such record.");
  }
  if (revision.state !== "pending") {
    return problem(409, "That photograph has already arrived.");
  }

  const key = objectKey(revisionId, "original", contentType);
  const object = await describeObject(key);
  if (!object) return problem(409, "Nothing arrived in the bucket.");

  const { error: assetFailed } = await supabase.from("media_assets").insert({
    photo_revision_id: revisionId,
    variant: "original",
    storage_key: key,
    content_type: object.contentType,
    byte_size: object.byteSize,
    width,
    height,
    checksum: object.checksum,
  });

  if (assetFailed) return problem(500, "The photograph could not be recorded.");

  await supabase
    .from("photo_revisions")
    .update({ width, height })
    .eq("id", revisionId);

  /* The day now points at this photograph, and the previous one keeps its
     number and its bytes. Replacing appends; it never overwrites. */
  await supabase
    .from("day_entries")
    .update({ current_revision_id: revisionId })
    .eq("id", revision.day_entry_id);

  /* Still `pending`, and honestly so: the original is safe but the
     derivatives do not exist yet. Until they do, only the owner can see
     this — row level security withholds the original from everyone else,
     because the original still carries its EXIF, and the GPS tag with it.
     Public reach begins when there is a stripped rendition to reach for. */
  return NextResponse.json(
    { revisionId, state: "pending" },
    { headers: { "cache-control": "no-store" } },
  );
}
