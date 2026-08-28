import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase/server";

/* POST only. A signed-in reader must not be able to be signed out by an
   image tag on somebody else's page. */
export async function POST(request: NextRequest) {
  const supabase = await getSupabase();
  await supabase.auth.signOut();

  const destination = request.nextUrl.clone();
  destination.pathname = "/";
  destination.search = "";
  return NextResponse.redirect(destination, { status: 303 });
}
