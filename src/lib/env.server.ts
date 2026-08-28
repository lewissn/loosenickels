import "server-only";
import { z } from "zod";

/* The bucket's credentials, kept out of `env.ts` so that nothing which can
   reach a client bundle sits in the same object as a secret key.

   Read on first use rather than at import. The public variables are needed
   by every page and are checked eagerly; these are needed only by the
   handful of routes that touch storage, and somebody working on the
   calendar should not need a Cloudflare account to run the site. */

const schema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
});

let cached: z.infer<typeof schema> | undefined;

export function storageEnv() {
  if (cached) return cached;

  const parsed = schema.safeParse({
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Storage is not configured: ${missing}. See README.`);
  }

  cached = parsed.data;
  return cached;
}
