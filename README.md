# Loose Nickels

One photograph a day, becoming a life over time.

A person records a single photograph for each date, optionally with a
sentence. Everything else — location, weather, capture time, calendar,
timeline, map, places, the years — is organised by the product rather than
by the person. The user records; the product remembers.

**The name is a codename.** It is not expected to survive. Nothing may
hardcode it: display naming resolves through `src/lib/brand.ts`, and
database identifiers, storage keys and API paths stay neutral so that a
rename is a configuration change rather than a migration.

---

## Status

Early. The previous product — a fictional institute archiving objects,
places and observations under parody accession numbers — was retired at the
tag [`museum`](../../releases/tag/museum) and is recoverable from there.
What stands now is the foundation and the small number of things worth
carrying across.

```bash
npm install
npm run dev
```

| Script              | Does                              |
| ------------------- | --------------------------------- |
| `npm run dev`       | Development server on `:3000`     |
| `npm run build`     | Production build                  |
| `npm run typecheck` | `tsc --noEmit`                    |

Next 16 (App Router), React 19, TypeScript. No CSS framework — styling is
CSS Modules over a token layer.

---

## Architecture

One backend, two clients, and the business rules live on the backend so the
website and the phone cannot disagree about them.

```
                 ┌──────────────────────────┐
                 │  Supabase (Postgres)     │  auth, users, day entries,
                 │  + Supabase Auth         │  revisions, permissions
                 └───────────┬──────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
   ┌──────────┴─────────┐        ┌──────────┴─────────┐
   │  Next.js / Vercel  │        │  Native iOS app    │
   │  public + private  │        │  full client       │
   └──────────┬─────────┘        └──────────┬─────────┘
              │                             │
              └──────────────┬──────────────┘
                             │
                 ┌───────────┴──────────────┐
                 │  Cloudflare R2 (private) │  originals + derivatives
                 └──────────────────────────┘
```

**The data model is `user → day entry → photo revision`.** One current
canonical photograph per user per calendar date, enforced by a database
constraint. Replacing a photograph creates a revision; it never destroys
the previous one.

**Media is never public by default.** R2 has no public access. Route
handlers verify the session and mint short-lived signed URLs, so no
photograph is reachable by a permanent guessable URL and authorisation is
enforced server-side rather than by hiding buttons.

**Dates are genuine calendar dates.** `entry_date`, capture timestamp,
capture timezone and submission timestamp are stored separately. A photo
taken at 23:40 in Tokyo belongs to that day in Tokyo regardless of where
the server lives.

### The database

`supabase/migrations/`, applied in filename order:

```bash
supabase db push          # or paste into the SQL editor, in order
```

Three rules live in the database rather than in either client, because
there are two clients and they are not allowed to disagree.

- **One photograph per user per calendar date** — a unique constraint on
  `(user_id, entry_date)`. `entry_date` has no default, so no code path can
  quietly fall back to the server's idea of today, and a trigger rejects a
  date more than one day ahead of the server: a user on the far side of the
  date line is legitimately a day ahead, and no further.
- **Revisions are never destroyed.** `photo_revisions` has no `DELETE`
  policy and no `DELETE` grant. Replacing a photograph appends.
- **Reach is decided server-side.** Row level security composes: a revision
  is reachable only through an entry the reader can already see, and an
  entry only through a profile they can already see. A public day inside a
  private profile stays private. A public day exposes its *current*
  photograph only — the revision history is private, since what someone
  chose not to show is as revealing as what they did — and never the
  original file, whose embedded EXIF would carry the GPS tag out with it.

### Environment

`.env.local`, never committed:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
```

---

## What survived the pivot

- **`src/styles/tokens.css`** — the token layer. Every colour, size,
  duration and curve in the project. The *structure* is settled; the values
  were chosen for paper and ink and will be re-picked for a photographic
  product.
- **`src/lib/motion/ViewTransitions.tsx`** — route transitions driven
  directly against the View Transitions API, with element names applied
  transiently per navigation. This is the mechanism that lets a day's
  photograph stay physically continuous while shrinking into its position
  in a month, and a month into a year.
- **`tools/ingest.mjs`** — sharp and EXIF: true pixel dimensions with
  orientation resolved before measuring, capture time, and an inlineable
  placeholder. Written as a build step against files in the repo, so it does
  not run as-is; it is the reference for the server-side pipeline.
- **`tools/shot.mjs`** — screenshots any page at any viewport over the
  DevTools protocol. Do not substitute Chrome's `--screenshot` flag: on
  Windows it will not lay out narrower than 500px, so it renders at 500 and
  crops to the width you asked for, and every "mobile" capture is a wider
  layout with a slice taken off the side. That looks exactly like an
  overflow bug and is not one.
- **`ios/`** — the capture app. Its design tokens, component vocabulary,
  photo pipeline and location gathering carry over; its GitHub-contents-API
  networking does not.

---

## The iOS app

`ios/` is a SwiftUI app, currently filing records into this repository
through the GitHub contents API. That model goes away: it becomes a full
client against the same backend as the website, able to browse the
timeline, calendar and map, and not merely to upload.

The Xcode project is generated rather than committed:

```bash
brew install xcodegen
cd ios && xcodegen && open Accession.xcodeproj
```

Put your ten-character Team ID in `ios/project.yml` before generating —
see `ios/README.md`.

---

## Deployment

Vercel, from `main`. The site is no longer a static export and the GitHub
Pages workflow has been removed; `www.loosenickels.com` moves to Vercel
when there is something to point it at.
