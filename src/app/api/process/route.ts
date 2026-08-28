import { NextResponse } from "next/server";
import { processPending } from "@/lib/media/process";
import { getSupabaseFor } from "@/lib/supabase/server";

/* Making the renditions.

   Called immediately after a photograph is recorded — that is the path that
   actually matters — and once a day by Vercel Cron as a sweep for anything
   the nudge missed.

   The sweep is daily rather than every few minutes because the Hobby plan
   permits exactly that: a schedule firing more than once a day is rejected
   at deploy time, not ignored, so a five-minute schedule here would have
   broken the deployment rather than merely running slowly. (Written out in
   words on purpose: the cron expression for it contains a star followed by
   a slash, which ends a block comment early and does exactly this.) On Pro
   the schedule can be minutes.

   Resizing a 12-megapixel photograph three times is not a ten-second job on
   a cold function, so this asks for the longer ceiling. */
export const maxDuration = 60;

/**
 * Vercel signs its cron requests with a bearer token. Anything else needs
 * the same secret, which is what lets the record path trigger a pass
 * without leaving the route open — it does no damage if called, but an open
 * endpoint that spends money on image processing is an invitation.
 */
function permitted(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  /* The cron, holding the secret, drains everybody's queue. */
  if (permitted(request)) {
    const result = await processPending();
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
    });
  }

  /* A signed-in client may ask for its own photograph to be finished, and
     only its own. The iOS app writes through PostgREST rather than through
     this server, so nothing was nudging the pipeline on its behalf and a
     photograph taken on a phone sat unprocessed until the daily sweep —
     visible, but as an original, at full size, with no thumbnail anywhere.

     The work still runs as the service role, because finishing a photograph
     is not answering a viewer. What the caller controls is only whose queue
     is drained, and it is theirs. */
  const supabase = await getSupabaseFor(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return new NextResponse(null, { status: 401 });

  const result = await processPending(undefined, user.id);
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}

export const POST = GET;
