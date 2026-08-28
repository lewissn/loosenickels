import "server-only";

/* Storage used to need four secrets here — an account id, a key pair and a
   bucket name — kept out of `env.ts` so that nothing which can reach a
   client bundle sat in the same object as a secret key.

   It needs none of them now. Vercel Blob authenticates with a short-lived
   OIDC token that the platform issues and rotates, paired with a store id
   that is an identifier rather than a secret; the SDK reads both itself.
   Locally, `vercel env pull` writes the same variables into `.env.local`.

   The file is kept, empty of configuration, because the reasoning above is
   the answer to "where did the storage credentials go" and that question
   will be asked again. See docs/going-live.md.  */

export {};
