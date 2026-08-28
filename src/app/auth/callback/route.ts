import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/server";

/* Where an emailed link lands.

   Two shapes arrive here depending on how the project's email template is
   written: `?code=` when the template uses the default confirmation URL,
   and `?token_hash=&type=` when it has been changed to address this route
   directly. Both are one line to honour, and accepting both means the
   template is a preference rather than a thing that has to be right. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const settle = async () => {
    const supabase = await getSupabase();
    if (code) return supabase.auth.exchangeCodeForSession(code);
    if (tokenHash && type) {
      return supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    }
    return { error: { message: "The link carried no credential." } };
  };

  const { error } = await settle();

  const destination = request.nextUrl.clone();
  destination.search = "";
  destination.pathname = error ? "/sign-in" : "/today";
  if (error) destination.searchParams.set("problem", "link");

  return NextResponse.redirect(destination);
}
