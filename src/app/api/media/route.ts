import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseFor } from "@/lib/supabase/server";
import { signedRead } from "@/lib/storage/blob";

const EXPIRES_IN = 900;

/* =========================================================================
   Signed URLs, in a batch.

   `GET /api/media/{asset}` redirects to a signed URL, which suits a browser
   — an <img> follows the redirect and carries its cookie on the way. It does
   not suit the app at all: `AsyncImage` fetches a URL and cannot be given an
   Authorization header, so every request arrived anonymous, row level
   security correctly found nothing, and the photograph rendered as its
   placeholder — a twenty-pixel blur, which is exactly what it looked like.

   So the app asks for the URLs instead of the bytes, once, for a page of
   days at a time. One authenticated request rather than one per rendition
   per day, which on a mobile connection is the difference between a screen
   that fills and a screen that trickles.

   The policy still decides. This asks the database for the rows by id as
   whoever is calling, and signs only what comes back — an id belonging to
   someone else simply is not in the result.
   ========================================================================= */

const request = z.object({
  assetIds: z.array(z.uuid()).min(1).max(200),
});

export async function POST(req: Request) {
  const supabase = await getSupabaseFor(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return new NextResponse(null, { status: 401 });

  const body = await req.json().catch(() => null);
  const asked = request.safeParse(body);
  if (!asked.success) {
    return NextResponse.json({ problem: "That request does not make sense." }, { status: 400 });
  }

  const { data } = await supabase
    .from("media_assets")
    .select("id, storage_key")
    .in("id", asked.data.assetIds)
    .returns<Array<{ id: string; storage_key: string }>>();

  const urls: Record<string, string> = {};
  for (const asset of data ?? []) {
    urls[asset.id] = await signedRead(asset.storage_key, EXPIRES_IN);
  }

  /* Absent ids are absent rather than an error: a photograph that is not
     there and one the caller may not see read identically, which is the
     same rule the single-asset route follows. */
  return NextResponse.json(
    { urls, expiresInSeconds: EXPIRES_IN },
    { headers: { "cache-control": "no-store" } },
  );
}
