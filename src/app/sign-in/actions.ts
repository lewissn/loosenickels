"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import type { AuthError } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/server";

export type SignInState = {
  status: "idle" | "invalid" | "sent" | "waiting" | "failed";
  email?: string;
  /** Seconds left on the cooldown, for `waiting`. */
  seconds?: number;
};

/* =========================================================================
   Asking for a link.

   Two rules govern this file and they pull in opposite directions.

   Nothing here may reveal whether an address has an account. Registration is
   closed, so a refusal that read differently from a success would answer, to
   anyone willing to type addresses in, the question of who keeps an archive
   here.

   And the person actually signing in has to be told enough to succeed. A
   form that silently swallows everything is safe and useless: the sending
   quota is small, and somebody who cannot tell "sent" from "you have used
   this hour's allowance" will sit waiting for an email that was never sent.

   The resolution is that everything said here is true of *everybody*. The
   cooldown below is a property of this browser, not of the address typed
   into it, so saying it out loud discloses nothing.
   ========================================================================= */

/** How long between requests from one browser. Long enough to stop a
    mistyped address burning the hour's allowance; short enough not to be a
    punishment for a genuine second attempt. */
const COOLDOWN_SECONDS = 60;
const COOLDOWN_COOKIE = "link-asked";

/**
 * Failures that must read exactly like success.
 *
 * `otp_disabled` is the closed door — the address has no account. Supabase
 * says it two ways depending on version, a machine-readable code and, before
 * that, only prose; both are read, because getting this wrong in the
 * direction of `false` turns the form into an oracle.
 *
 * The rate limits are here for a subtler reason. Supabase applies one per
 * address as well as one per project, and an address with no account never
 * gets far enough to be limited — so reporting "too many requests" would
 * say, precisely, "this address exists". It is the cooldown above, which
 * knows nothing about addresses, that gets to speak.
 */
const mustNotBeReported = (error: AuthError) =>
  error.code === "otp_disabled" ||
  error.code === "over_email_send_rate_limit" ||
  error.status === 429 ||
  /signups not allowed/i.test(error.message);

export async function requestLink(
  _previous: SignInState,
  form: FormData,
): Promise<SignInState> {
  const email = z.email().safeParse(String(form.get("email") ?? "").trim());
  if (!email.success) return { status: "invalid" };

  /* Checked before Supabase is called at all, and checked identically for
     every address, which is what makes it safe to report. */
  const jar = await cookies();
  const asked = Number(jar.get(COOLDOWN_COOKIE)?.value ?? 0);
  const elapsed = (Date.now() - asked) / 1000;

  if (asked && elapsed < COOLDOWN_SECONDS) {
    return {
      status: "waiting",
      seconds: Math.ceil(COOLDOWN_SECONDS - elapsed),
      email: email.data,
    };
  }

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

  if (error && !mustNotBeReported(error)) return { status: "failed" };

  /* Set after the attempt rather than before, so a genuine fault above does
     not also cost a minute's wait. */
  jar.set(COOLDOWN_COOKIE, String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOLDOWN_SECONDS,
    path: "/sign-in",
  });

  /* The same answer whether or not the address has an account. Whether a
     person keeps an archive here is not a fact this form gives away. */
  return { status: "sent", email: email.data };
}
