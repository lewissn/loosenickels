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
