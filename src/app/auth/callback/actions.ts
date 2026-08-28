"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/server";

/* Spending the credential.

   Deliberately a POST, and deliberately the only thing here that verifies
   anything. See the page beside this file for why. */
export async function completeSignIn(form: FormData): Promise<void> {
  const code = String(form.get("code") ?? "");
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "magiclink") as EmailOtpType;

  const supabase = await getSupabase();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: { message: "The link carried no credential." } };

  /* `redirect` unwinds by throwing, so it sits after every branch rather
     than inside a try — catching it would swallow the navigation itself. */
  redirect(error ? "/sign-in?problem=link" : "/today");
}
