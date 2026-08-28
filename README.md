# One photograph a day

A daily photographic archive. A person records one photograph for each day;
the product organises everything else and gets more valuable simply because
time passes.

    User → DayEntry → PhotoRevision → MediaAsset

**"Loose Nickels" is a working codename.** It appears in the repository name
and in `src/lib/brand.ts`, and nowhere else — not in database names, API
paths, storage keys, browser storage or copy. A rename should be an edit to
that one file plus a domain change.

---

## Status

This is a rebuild in progress. The repository previously held a different
product — a fictional institute with eight departments, accession numbers,
collections and research papers. That build is finished and preserved at the
tag `institute-final`; check it out if you want to see it.

```bash
git show institute-final:README.md
```

What exists now:

| | |
| --- | --- |
| Data model | Written. `src/lib/archive/schema.ts` |
| Source interface | Written. `src/lib/archive/source.ts` |
| Seed implementation | Written, read-only, in memory |
| Daily viewer | First version. Scroll, keyboard and touch through days |
| Authentication | **Not built** |
| Database | **Not built** |
| Object storage | **Not built** |
| Upload | **Not built** |
| Calendar, map, On This Day | **Not built** |

---

## Running it

```bash
npm install
npm run dev
```

| Script | Does |
| --- | --- |
| `npm run dev` | Development server on `localhost:3000` |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |

Next 16 (App Router), React 19, TypeScript. Two runtime dependencies beyond
the framework: `zod` and `motion`. No CSS framework — CSS Modules over a
token layer.

---

## The one thing to understand

**Every surface reads through `ArchiveSource`, and every method takes a
viewer.**

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

To move onto Postgres, write a second `ArchiveSource` and change one line in
`index.ts`.

### Two distinctions worth not breaking

**`CalendarDate` is not an `Instant`.** A calendar date is the day a
photograph belongs to, as the person who took it would name it. An instant is
a moment. They are separate branded types so neither can be assigned to the
other by accident, and `src/lib/util/calendar.ts` never reads the system time
zone — the server's zone is never the right answer. A photograph taken at
23:40 in Tokyo belongs to that Tokyo day. There is a seed record that exists
purely to prove this; if `2026-08-20` ever renders as the 19th or the 21st,
that is the bug.

**Location precision is a monotonic ladder.**

    hidden < region < locality < approximate < precise

Ordered by disclosure, so `<=` means "reveals no more than". Every surface
that shows a place goes through `discloseLocation()`, so there is one
function to get right and one to audit. Coordinates are blurred by *rounding*
rather than jittering — a fresh random offset per read can be averaged back
to the true position.

---

## Design system

**Tokens.** `src/styles/tokens.css` is the single source. No component
invents a colour, a duration or a step of the type scale. Day and night are
the same tokens with different values, resolved before first paint.

**Type.** Three families with three jobs. Newsreader (editorial — has a true
optical size axis) · Archivo (signage) · IBM Plex Mono (measurement: times,
temperatures, coordinates). Nothing is set in a family whose job it isn't.

**Motion.** Five durations and five curves, in tokens. The viewer's gesture
drives a `--p` custom property from -1 to 1 and every transform is a function
of it, so the motion is attached to the hand rather than played at it. View
transitions are driven directly against the API — see
`src/lib/motion/ViewTransitions.tsx`.

**The viewport is a stage.** The daily viewer does not scroll. Wheel, arrow
keys and vertical drag move through days: down and right go *backward* in
time, up and left move toward today.

---

## Looking at it

`tools/shot.mjs` screenshots any page at any viewport over the DevTools
protocol.

```bash
MSYS_NO_PATHCONV=1 node tools/shot.mjs ./shots http://localhost:3000 390 844 home=/
```

Two Windows traps, both real, both recorded in the file itself:

- Chrome's `--screenshot` flag will not lay out narrower than 500px. Ask for
  390 and it renders at 500 and crops, so every "mobile" capture is a wider
  layout with a slice taken off the side — which looks exactly like an
  overflow bug and is not one. This tool sets real device metrics instead.
- Git Bash rewrites arguments that look like paths, so `home=/` arrives as
  `home=C:/Program Files/Git/`. Hence `MSYS_NO_PATHCONV=1`.

---

## Deployment

Currently a static export to GitHub Pages (`.github/workflows/deploy-pages.yml`),
which is left over from the previous product and **cannot carry this one**:
there is no server to check who is asking, so every photograph would be a
permanently guessable public URL.

The intended stack is Vercel + Neon (Postgres) + Cloudflare R2 (photographs
behind signed URLs). Moving there means removing `output: "export"` from
`next.config.ts` and retiring the Pages workflow — do that once Vercel is
actually serving, not before, or the live site goes dark in between.

`CNAME` is load-bearing while Pages is still the deploy target: the workflow
copies it into `out/`.

---

## Not yet built

- **Authentication.** `src/app/page.tsx` is signed in as the seed account on
  one line, marked as the line that changes.
- **The database and object storage.** No `ArchiveSource` writes yet; the
  seed source refuses rather than pretending.
- **Photographs.** There are none in the repo. `src/content/seed.ts` draws
  generated fields with honest aspect ratios and tones so the composition has
  something to react to. They look like exactly what they are.
- **The rest of the surfaces.** Timeline, calendar, map, places, On This Day,
  profile, upload.
- **The iOS client**, which lives on another machine and consumes this same
  contract.
