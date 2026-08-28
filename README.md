# One photograph a day

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
What stands now is the foundation, the small number of things worth carrying
across, and the daily viewer.

| | |
| --- | --- |
| Data model | Written, twice — `schema.ts` and the SQL migrations |
| Source interface | Written. `src/lib/archive/source.ts` |
| Seed implementation | Written, read-only, in memory |
| Daily viewer | First version, on seed data, at `/today` |
| Compose | First version. Recorded photographs do not persist yet |
| Authentication | Magic links, working |
| Database | Supabase, schema and RLS written |
| Object storage | Vercel Blob (private), upload routes written |
| Viewer on live data | **Not built** — needs a Supabase `ArchiveSource` |
| Calendar, map, On This Day | **Not built** |

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
                 │  Vercel Blob (private)   │  originals + derivatives
                 └──────────────────────────┘
```

**The data model is `user → day entry → photo revision`.** One current
canonical photograph per user per calendar date, enforced by a database
constraint. Replacing a photograph creates a revision; it never destroys
the previous one.

**Media is never public by default.** The Blob store is created in
private mode, which cannot be changed afterwards. Route
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

### Signing in

An emailed link, and no password. A lifelong private archive is a poor
thing to protect with a credential people reuse elsewhere, and a link is
the same one gesture on the phone as on the desktop.

The session lives in cookies rather than local storage so the server can
read it. `src/proxy.ts` refreshes it on every navigation and turns
anonymous visitors away from private routes; each private page then asks
again with `getUser()`, because a guard that only stands in front of the
door is a guard that can be walked around.

Two settings in the Supabase dashboard, under **Authentication → URL
Configuration**, without which the link will send but not return:

```
Site URL       https://www.loosenickels.com
Redirect URLs  http://localhost:3000/auth/callback
               https://www.loosenickels.com/auth/callback
               https://*-<your-team>.vercel.app/auth/callback
```

`/auth/callback` accepts both shapes Supabase can send — `?code=` from the
default email template, and `?token_hash=&type=` from a template rewritten
to address it directly — so the template is a preference rather than
something that has to be right.

### Registration is closed

Asking for a link does not create an account. The sign-in action passes
`shouldCreateUser: false`, but that is the courtesy, not the lock: the anon
key is public, so anyone can call the OTP endpoint themselves and ask for
`create_user: true`. The lock is one switch in the dashboard, under
**Authentication → Sign In / Providers**:

```
Allow new users to sign up    off
```

With it off, Supabase refuses an unknown address and the form quietly
reports success anyway. This is deliberate. Reported as a failure it would
answer, to anyone willing to type addresses in, the question of who keeps an
archive here — so the closure is stated once on the page, where it is true
of everybody, rather than in the reply to a particular address.

Accounts are made in the dashboard, under **Authentication → Users → Add
user**. `handle_new_user()` fires on insert and the profile follows.

### Storage

One **private** Vercel Blob store. Private is chosen at creation and cannot
be changed afterwards, which is the right way round: a store that could be
made public later is a store that will be, by somebody in a hurry.

Photographs do not pass through the server. A serverless function caps its
request body at a few megabytes and a photograph from a modern phone is
larger than that, so an upload is three steps:

```
POST /api/uploads             → reserves the day and a revision,
                                returns a URL signed for 120 seconds
PUT  <that URL>               → browser or phone, straight to Blob
POST /api/uploads/{revision}  → the server asks Blob whether it arrived,
                                and writes down Blob's answer, not the client's
```

The content type and the exact byte ceiling are carried in the delegation
payload and enforced by the CDN, so a URL minted for one photograph cannot
be spent on a hundred megabytes of something else. `allowOverwrite` is
false: a revision is written once, which is what makes a retry safe.

There is no CORS rule to set and no bucket policy to get wrong. There is
also no storage secret: on Vercel the SDK authenticates with a short-lived
OIDC token the platform rotates by itself, and `vercel env pull` supplies
the same locally.

Reading goes back through `GET /api/media/{asset}`, which asks the
database for the row and redirects to a URL signed for fifteen minutes.
Row level security decides whether there is a row — for the owner, for an
anonymous visitor looking at a public day, or for nobody — so permission is
answered once in SQL rather than once in SQL and approximately again in
TypeScript. A missing photograph and a forbidden one both come back 404.

Read URLs are signed from one store-wide delegation, cached in memory and
renewed a minute before it lapses. Issuing a delegation is a call to the
Blob control API and signing a URL from one is local HMAC — a page showing
two dozen days would otherwise make two dozen round-trips before it could
render. Widening the delegation does not widen what anybody receives: the
signing key never leaves the server, and a reader is only ever handed a URL
already signed for a single pathname.

The `original` is never served to anyone but the owner. It still carries
its EXIF, and the GPS tag with it. Neither is `source`, for exactly the same
reason — see below.

### HEIC, and why there are two uploads

sharp reads HEIC metadata and decodes none of it: the prebuilt binaries ship
without an HEVC decoder, for licensing reasons rather than technical ones. An
iPhone shooting its default format therefore produces an original the server
cannot turn into a thumbnail.

The one-line fix is to transcode on the phone and upload the JPEG as the
original, which throws the camera's own file away for ever on a product whose
whole claim is that it keeps what you gave it. So both are kept:

| variant | what it is | who may see it |
| --- | --- | --- |
| `original` | exactly what the camera wrote | the owner |
| `source` | a JPEG transcode, made on the device | the owner |
| `large` `medium` `thumbnail` | WebP, made by the pipeline | anyone the day is visible to |

`source` exists only so the pipeline has something to read, and only when the
original is a format the server cannot open — a browser never sends one,
because a browser cannot decode HEIC either. It is owner-only because it is a
faithful transcode and carries the same EXIF, and the same GPS tag. Once the
renditions exist it has no further purpose and may be swept.

`processPending` prefers `source` and falls back to `original`. Where neither
can be decoded the revision goes to `failed` and stays there, with a reason
the owner can read: retrying a HEIC on a schedule costs money and changes
nothing.

### Environment

`.env.local`, never committed — and mostly not hand-written either. Run
`vercel env pull` and the Supabase and Blob variables arrive from the
project, because both are provisioned through Vercel.

The two `NEXT_PUBLIC_` values are checked at startup, by name, so a missing
one stops the build with its own name in the message rather than surfacing
later as an `undefined` halfway through a request.

Storage has no entry here at all. It authenticates with `BLOB_STORE_ID`
(an identifier, not a secret) and a rotating OIDC token the SDK reads for
itself, so there is no long-lived storage credential to leak from a `.env`
and nothing for someone working on the calendar to obtain first.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
```

See [docs/going-live.md](docs/going-live.md) for the account setup this
assumes.

---

---

## The seam

Every surface reads through `ArchiveSource`, and **every method takes a
viewer**.

```
src/lib/archive/
  schema.ts       The contract. Plain serialisable JSON, Postgres-shaped.
  source.ts       The interface both clients speak, plus authorisation helpers.
  seed-source.ts  In-memory implementation over src/content/seed.ts.
  index.ts        Exports `archive` — the single binding everything reads.
```

Authorisation lives behind that seam, not in the components. A page cannot
accidentally render a private day, because it is never handed one. Hiding a
button protects nothing from anyone holding a fetch client, so the rule is:
**an implementation of `ArchiveSource` answers as though the caller is
hostile.**

`schema.ts` is the TypeScript mirror of `supabase/migrations/*_foundation.sql`
— same tables, same enums, same location ladder. They are not yet reconciled
field for field; see *Known divergences* below. To move the viewer onto
Postgres, write a second `ArchiveSource` against Supabase and change one line
in `index.ts`.

### Two distinctions worth not breaking

**`CalendarDate` is not an `Instant`.** A calendar date is the day a
photograph belongs to, as the person who took it would name it. An instant is
a moment. They are separate branded types so neither can be assigned to the
other by accident, and `src/lib/util/calendar.ts` never reads the system time
zone — the server's zone is never the right answer. EXIF's `DateTimeOriginal`
is local time at the camera, so its date component is already correct wherever
anyone is standing; parsing it to UTC and formatting it back is what files a
Tokyo evening on the wrong day. There is a seed record at 23:40 Asia/Tokyo
that exists purely to catch that regression.

**Location precision is a ladder ordered by disclosure** — hidden, region,
locality, approximate, precise — so a comparison means "reveals no more than".
Every surface showing a place goes through `discloseLocation()`, so there is
one function to get right and one to audit. Coordinates blur by rounding
rather than jitter: a fresh random offset per read can be averaged back to the
true position.

### The viewer

`src/components/day/` is the daily viewer and the compose flow.

The viewport is a stage: the viewer does not scroll. Wheel, arrow keys and
vertical drag move through days — down and right go *backward* in time, up and
left move toward today. The position is a single float in a ref and no part of
the gesture lives in React state; one `requestAnimationFrame` loop integrates
inertia, projects where a flick was going to land, springs onto the nearest day
and writes transforms directly. There are no CSS transitions on anything the
gesture drives. Wheel deltas are normalised for `deltaMode`, because many mice
report lines rather than pixels.

Two layout states, because looking at a photograph and reading a day are
different activities. Composed gives the writing a column; immersive gives the
photograph the viewport. Nothing is ever cropped — the leftover space when a
picture's orientation disagrees with the screen is exactly where the writing
goes. The room is lit by the photograph: a dark image tints the ground and puts
the document into the night palette, published to the document root rather than
scoped to the viewer so chrome outside it resolves the same palette.

Breakpoints ask about viewport *orientation*, not width. A phone held sideways
is 844×390: wide enough to pass a width test and far too short to stack a
photograph above a paragraph.

### Known divergences

The viewer arrived from a branch cut before the backend existed, so two pairs
of definitions do not yet agree:

- **Profile visibility.** SQL has `private | public | discoverable`;
  `schema.ts` has `private | public`.
- **Media variants.** SQL has `original | large | medium | thumbnail`;
  `schema.ts` has `thumb | medium | large`.

Reconcile these before writing the Supabase-backed `ArchiveSource`.

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
