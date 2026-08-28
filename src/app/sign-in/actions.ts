"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { AuthError } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/server";

export type SignInState = {
  status: "idle" | "invalid" | "sent" | "failed";
  email?: string;
};

/* Supabase says this two ways depending on its version — a machine-readable
   code, and before that only prose. Both are read, because getting this
   wrong in the direction of `false` turns the form into an oracle. */
const isClosedToStrangers = (error: AuthError) =>
  error.code === "otp_disabled" || /signups not allowed/i.test(error.message);

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
    /* The door is closed. An address that has no account here is not given
       one by asking; accounts are made deliberately, elsewhere. */
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  /* Refusing to create an account is the one failure that must not show.
     Reported as a failure it would answer a question nobody asked — whether
     this address keeps an archive here — to anyone willing to type one in.
     So it reads the same as success, and no link is sent. Every other
     error is a real fault and says so. */
  if (error && !isClosedToStrangers(error)) return { status: "failed" };

  /* The same answer whether or not the address has an account. Whether a
     person keeps an archive here is not a fact this form gives away. */
  return { status: "sent", email: email.data };
}
