import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseFor } from "@/lib/supabase/server";
import { signedRead } from "@/lib/storage/blob";

const EXPIRES_IN = 900;

/* The only way to a photograph. There is no permanent URL to guess at:
   this asks the database for the row, and row level security decides
   whether there is one — for a signed-in owner, for an anonymous visitor
   looking at a public day, or for nobody. The policy is the single answer
   to who may see what, rather than a rule written once in SQL and then
   approximately again in TypeScript. */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  if (!z.uuid().safeParse(asset).success) {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = await getSupabaseFor(req);
  const { data } = await supabase
    .from("media_assets")
    .select("storage_key")
    .eq("id", asset)
    .maybeSingle();

  /* No row is indistinguishable from no such asset, which is the point:
     the absence of a photograph and the absence of permission to see it
     read identically from outside. */
  if (!data) return new NextResponse(null, { status: 404 });

  return NextResponse.redirect(await signedRead(data.storage_key, EXPIRES_IN), {
    status: 307,
    headers: {
      /* The redirect is personal and expiring. A shared cache holding it
         would hand one reader's signature to the next. The object it
         points at is immutable, so the browser may keep that as long as
         the signature lasts. */
      "cache-control": `private, max-age=${EXPIRES_IN - 60}`,
    },
  });
}
