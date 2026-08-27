# Loose Nickels

An independent institute for things of questionable significance.

A digital archive of objects, places, observations and other material of
uncertain importance, presented with a level of care the material does not
warrant. The disproportion is the point.

---

## Running it

```bash
npm install
npm run dev
```

| Script            | Does                                            |
| ----------------- | ----------------------------------------------- |
| `npm run dev`     | Development server on `localhost:3000`          |
| `npm run build`   | Production build                                |
| `npm run start`   | Serve the production build                      |
| `npm run typecheck` | `tsc --noEmit`                                |

Next 16 (App Router), React 19, TypeScript. Two runtime dependencies beyond
the framework: `zod` for schema validation and `motion`. No CSS framework —
styling is CSS Modules over a token layer.

---

## The one thing to understand

**Content is not in the components.** Every surface reads through a single
interface, `ArchiveSource`, and no page imports a content file directly.

```
src/lib/archive/
  schema.ts        The contract. Plain serialisable JSON, Postgres-shaped.
  source.ts        The ArchiveSource interface + shared query helpers.
  local-source.ts  The current implementation, backed by files in src/content.
  index.ts         Exports `archive` — the single binding everything reads.
  accession.ts     Accession numbers: parse, format, mint, seed.
```

To move the archive onto a database, write a second `ArchiveSource` and
change one line in `src/lib/archive/index.ts`. No component changes. The
methods are already `async` for exactly this reason.

`src/content/entries/index.ts` is the registry: it validates every record
through zod at module load and **fails the build** on a malformed record, a
duplicate accession number or slug, or a cross-reference to a record that was
never accessioned. That file is the other thing a database migration would
replace.

### Adding a record today

Add an object to the relevant file in `src/content/entries/`. It is typed as
`EntryInput`; the schema will tell you what is missing. Accession numbers run
`LN-XX-0000` — hyphens in storage, en-dashes only in display, handled by
`format()`.

---

## Looking at it

`tools/shot.mjs` screenshots any page at any viewport, driving Chrome over
the DevTools protocol.

```bash
node tools/shot.mjs ./shots http://localhost:3000 390 844 home=/ ledger=/ledger
```

Width and height are CSS pixels; height `0` captures the full page. It
waits on `document.fonts.ready` rather than guessing at a delay.

Do not use Chrome's `--screenshot` flag for this. On Windows it will not
lay out narrower than 500px: ask for 390 and it renders at 500 and crops
the image to 390, so every "mobile" capture is a wider layout with a slice
taken off the side — which looks exactly like an overflow bug and is not
one. That cost an afternoon.

---

## Structure

```
src/
  app/                    Routes. Thin — they fetch and compose, nothing else.
  components/
    archive/              Record cards, prose, metadata, the five record layouts
    chrome/               Rail, index layer, enquiries, institutional readout
    places/               The survey plot
    plate/                Generative plates
    primitives/           Reveal, Masthead — the reusable pieces
  content/                Records, collections, research papers
  lib/
    archive/              Schema and source (above)
    motion/               View transitions, reveal observer, transition names
    util/                 Time, season, moon phase, coordinate formatting
  styles/
    tokens.css            Every colour, size, duration and curve in the project
    global.css            Reset, focus, paper, route transitions, reduced motion
```

### Departments

Eight, each with a two-letter code that appears in every accession number,
scopes the environmental colour, and selects the plate system.

`OB` Objects · `PL` Places · `FN` Field Notes · `PH` Photographs ·
`TH` Thoughts · `AU` Sounds · `XP` Experiments · `DR` Research

---

## Design system

**Tokens.** `src/styles/tokens.css` is the single source. No component
invents a colour, a duration or a step of the type scale. Day and night are
the same tokens with different values, resolved by `data-light` on `<html>`
before first paint.

**Type.** Three families with three jobs. Newsreader (editorial — carries the
voice, has a true optical size axis) · Archivo (signage — navigation and
labels) · IBM Plex Mono (measurement — accession numbers, coordinates,
readouts). Nothing is set in a family whose job it isn't.

**Motion.** Five durations and five curves, in tokens. Four reveal movements
(`rise`, `wipe`, `settle`, `rule`) in one primitive over one shared
IntersectionObserver. Route transitions drive the View Transitions API
directly — see `src/lib/motion/ViewTransitions.tsx` — so a record's plate
stays physically continuous from index to record. Names are applied
transiently, per navigation, rather than left on every card.

**Layouts.** Records get one of five compositions by department, not one
template with options: catalogue (objects), field (places, notes), exhibit
(photographs, sounds, experiments), text (thoughts), paper (research). The
archive index is a mosaic whose spans are a function of department and
recorded significance — the page composes differently as the archive's
opinion of itself changes.

---

## Plates

Records without photography draw a **plate**: a generated drawing in the
convention of their department — measured outlines for objects, contours for
places, isobars for field notes, a halftone screen for photographs, almost
nothing for thoughts.

A plate is a pure function of the accession number, so it is identical on
every device and in every session, forever. Real media always takes
precedence; the plate is a stated condition, not a fallback.

`src/components/plate/` — `noise.ts` (seeded fields, marching squares),
`systems.ts` (the eight drawing conventions), `Plate.tsx` (canvas, reads its
colours from the cascade so it follows day and night).

---

## Accessibility and robustness

- Every element that reveals from zero opacity is gated on `:root[data-js]`,
  set by the head script. Without JavaScript the page is served complete.
- `prefers-reduced-motion` resolves reveals instantly rather than leaving
  them hidden, and disables view transitions.
- Full-screen layers set `inert` on the page behind them and trap focus.
- The survey plot's markers are real SVG elements — focusable, labelled,
  arrow-key navigable.
- One `<h1>` per page, alt text on every image, `en-GB`, skip link.

---

## Not yet built

- **Media pipeline.** The schema carries `width`, `height`, `focal`,
  `placeholder` and EXIF `captured`; nothing generates them yet. Photographs
  dropped in today need those fields filled by hand.
- **Audio playback.** Sound records carry `duration` and `peaks` in the
  schema and render a generated waveform plate. There is no player.
- **`/admin`.** Architected for, not built. The intended split is: brutally
  practical to publish, extravagantly impractical to read.

---

## Deployment

Vercel. `/random` is the only dynamic route; the home page revalidates hourly
so the record on display turns over daily. Everything else is static.

`CNAME` in the repo root is left over from GitHub Pages and is inert on
Vercel. The domain in the brief (`loosenickels.co.uk`) and the one in `CNAME`
(`www.loosenickels.com`) do not match — canonical URLs and metadata still
need pointing at whichever is real.
