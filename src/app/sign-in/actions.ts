"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase/server";

export type SignInState = {
  status: "idle" | "invalid" | "sent" | "failed";
  email?: string;
};

export async function requestLink(
  _previous: SignInState,
  form: FormData,
): Promise<SignInState> {
  const email = z.email().safeParse(String(form.get("email") ?? "").trim());
  if (!email.success) return { status: "invalid" };

  /* The origin is taken from the request rather than configured, so this
     works on localhost, on a preview deployment and in production without
     three different settings. A forged Host header cannot redirect the
     link anywhere useful: Supabase only honours redirect targets on its
     own allow-list, and rejects the rest. */
  const head = await headers();
  const origin = `${head.get("x-forwarded-proto") ?? "http"}://${head.get("host")}`;

  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) return { status: "failed" };

  /* The same answer whether or not the address has an account. Whether a
     person keeps an archive here is not a fact this form gives away. */
  return { status: "sent", email: email.data };
}
