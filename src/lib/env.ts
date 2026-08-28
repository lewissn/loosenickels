import { z } from "zod";

/* Configuration is a boundary, so it is checked once, here, and loudly.
   A missing key should stop the build with its own name in the message
   rather than surface later as an undefined halfway through a request.

   Each variable is read by static member access. `process.env` as a whole
   is not passed anywhere: the NEXT_PUBLIC_ values are only substituted
   into the client bundle when they are written out literally. */

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const parsed = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Environment is incomplete: ${missing}. See README.`);
}

export const env = parsed.data;
