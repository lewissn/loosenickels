# Going live

Infrastructure steps only Lewis can do. Nothing in the application works
until these exist; the code work happens in parallel and does not depend on
them being finished first.

Two accounts, one bill: **Vercel** (hosting + Blob) and **Supabase**
(Postgres + Auth), with Supabase installed *through* the Vercel Marketplace
so it is provisioned and invoiced from the Vercel dashboard.

---

## 1. The Vercel project

Import the repository at <https://vercel.com/new>. Framework detection
should pick Next.js on its own; nothing needs overriding.

Do **not** point `www.loosenickels.com` at it yet. The domain currently
answers from GitHub Pages, and moving it before there is something worth
serving takes the old site down in between for no gain. Vercel's preview
URL is enough until the archive holds photographs.

## 2. Supabase, from the Vercel Marketplace

Not from supabase.com — install it from Vercel, so the credentials are
injected automatically and the invoice arrives in one place.

```bash
npx vercel install supabase
```

Or: Vercel dashboard → **Storage** → **Marketplace** → Supabase → Install.

Choose the region closest to you (London/`eu-west-2` if offered). The
integration provisions a full Supabase project — Postgres, Auth, Storage,
Realtime — and syncs its environment variables into the Vercel project.

You still use the Supabase dashboard for the auth settings below. The
Marketplace changes who bills you and who holds the credentials, not where
the switches live.

## 3. The Blob store

Vercel dashboard → **Storage** → **Create** → **Blob**.

**Choose `Private` access.** This cannot be changed after the store is
created, and the whole media model depends on it: an original photograph
carries its EXIF GPS tag, so a publicly reachable URL discloses where the
photographer was standing regardless of what the location columns say.

Same region as Supabase. Connect it to the project — Vercel then injects
`BLOB_STORE_ID` and issues short-lived OIDC tokens, so there is no
long-lived storage secret to leak.

## 4. Push the schema

With the Supabase CLI, from the repository root:

```bash
npx supabase link --project-ref <ref-from-the-supabase-dashboard>
npx supabase db push
```

That applies `supabase/migrations/` — the tables and the row-level security
policies. RLS is the only authority over who may see what; both clients
trust it rather than reimplementing it.

## 5. Close registration

Supabase dashboard → **Authentication** → **Sign In / Providers** →
**Allow new users to sign up** → **off**.

This switch is the real lock. `shouldCreateUser: false` in the sign-in
action is a courtesy, not a defence: the publishable key is public, so
anyone can call the OTP endpoint themselves and ask it to create a user.

## 6. Redirect allow-list

Supabase dashboard → **Authentication** → **URL Configuration** → add:

```
https://<your-vercel-project>.vercel.app/auth/callback
http://localhost:3000/auth/callback
https://www.loosenickels.com/auth/callback
```

A magic link whose redirect is not on this list fails after the click,
which looks exactly like an expired link and is not one.

## 7. Your account, by hand

Supabase dashboard → **Authentication** → **Users** → **Add user**, with
your email address. Registration is closed, so this is the only way an
account comes into existence.

## 8. Local development

```bash
npx vercel link
npx vercel env pull
```

That writes `.env.local` with the Supabase and Blob credentials, so the
site runs locally against the real backend.

---

## Then confirm one thing

Sign in once, and watch what happens when you request a link for an address
that has **no** account.

It must read *identically* to a successful request. If a refused signup
produces a visibly different message, the sign-in form has become an
account-enumeration oracle — anyone can discover whether a given person
uses the product. `isClosedToStrangers` in `src/app/sign-in/actions.ts`
guesses at two possible Supabase error shapes because this could not be
verified without a live project. Confirm which one arrives, and drop the
hedge.
