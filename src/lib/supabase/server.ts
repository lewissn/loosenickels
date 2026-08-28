import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/* The session lives in cookies rather than in local storage, so the server
   can read it. Every request that needs to know who is asking builds one
   of these; it is cheap, and holding one across requests would leak one
   reader's session into another's. */
export async function getSupabase() {
  const store = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll(written) {
          try {
            for (const { name, value, options } of written) {
              store.set(name, value, options);
            }
          } catch {
            /* Server Components may not write cookies. A refresh that
               lands here is not lost: the proxy runs first on every
               matched request and writes the rotated token there. */
          }
        },
      },
    },
  );
}

/* =========================================================================
   The same session, from a phone.

   The website authenticates with a cookie. The iOS client cannot: it has an
   access token and no cookie jar, and it is talking to these routes from
   another origin.

   So a route that both clients call reads whichever the caller has. The
   token is not trusted for its claims — `auth.getUser()` asks the auth
   server whether it is genuine, exactly as the cookie path does — and it is
   attached to the client itself, so every PostgREST query underneath runs as
   that user and row level security applies unchanged.

   Falling back to cookies rather than refusing means one code path serves
   both clients, and the routes below do not have to know which is calling.
   ========================================================================= */

export async function getSupabaseFor(request: Request) {
  const authorization = request.headers.get("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        /* No cookie jar at all on this path. Handing it the request's
           cookies as well would let a stale browser session in a shared
           context outrank the token that was actually presented. */
        cookies: { getAll: () => [], setAll: () => {} },
        global: { headers: { Authorization: authorization } },
      },
    );
  }

  return getSupabase();
}
