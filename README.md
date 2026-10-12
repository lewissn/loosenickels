# The Island

A small, living, low-poly island in the browser. You watch it the way you'd
watch a fish tank: seasons turn, days pass, animals go about their lives, and
you can orbit around, zoom in and follow any creature.

There is no sign-in, no uploads, no database and no paid services.
Everything runs in the visitor's browser, so the site costs nothing to keep
running.

**The name is a codename.** Display naming resolves through
`src/lib/brand.ts`, and the name appears nowhere else but the repository's.

```bash
npm install
npm run dev
```

| Script              | Does                          |
| ------------------- | ----------------------------- |
| `npm run dev`       | Development server on `:3000` |
| `npm run build`     | Production build              |
| `npm run typecheck` | `tsc --noEmit`                |
| `npm run lint`      | ESLint                        |

Next 16 (App Router), React 19, TypeScript and plain three.js. The island is
a client-only page at `/`, deployed on Vercel from `main`.

---

## The island

- **One day lasts two minutes**, about 80 seconds of it daylight (the sun
  lingers by day and hurries through the night), and a season lasts two
  days, so a year goes round in about sixteen minutes. It starts in early
  spring, just after dawn.
- **The same island on every visit**, grown from a seed: an irregular coast,
  rolling hills, one peak, small lakes, pines on the high ground and meadows
  left open.
- **Seasons blend** rather than switch: blossom and petals in spring, full
  canopies in summer, orange leaves thinning and falling in autumn, bare trees,
  snow and a creeping snowline in winter. Rabbits turn white.
- **Weather:** showers come and go to a schedule set by the seed — most
  often in autumn, least in summer, never in winter, which has snow.
  Clouds gather first and the wind gets up; the ground stays wet a while
  after. Summer showers are the likeliest to become thunderstorms.
- **Mist** pools in the low meadows and along the shore at dawn, most of
  all in autumn, and after rain.
- **A cottage** stands above the shore. Its rooms light up through the
  evening, the lantern by the door burns all night, and the chimney smokes.
- **The couple who live there** come out after breakfast and are back in
  just before the kitchen light comes on. In between they sit side by side
  on the bench, stand together above the shore looking at the sea, take
  turns in the vegetable patch, and potter about. Rain sends them in at a
  run. Come close while following either of them and they wave.
- **Animals:** six deer (two stags) who graze, wander, sleep at night and
  startle if you get too close; ten rabbits who bolt; a fox that sleeps by
  day and hunts the rabbits at night (they always get away); swallows that
  loop over the island and roost in a tree; gulls that circle the coast and
  roost on the beach. Fireflies come out on summer nights.
- **Drag** to orbit, **pinch or scroll** to zoom. **Tap an animal** to follow
  it; tap empty space to let go. Left alone, the camera slowly turns.
- **Walk as him** or **walk as her** (bottom right, once the couple have
  arrived) to walk the island as either of them, switching between the two
  with Q or the link: WASD or the arrow keys, Shift to run,
  drag to look, scroll or I/O to zoom (right in to first person), Esc to
  stop — or on a phone, a thumbstick wherever your left thumb lands, pushed
  further to run, with another finger to look and two to pinch-zoom. He walks round trees, rocks and the
  house, wade into the shallows but no further, and can sit on the bench.
  Whoever you're not walking carries on with their day, and when you stop,
  both go back to theirs.
  While you follow an animal or take a walk, the screen is kept from
  dimming (where the browser allows).
- Detail scales by device (shadow map, terrain, trees, grass, flowers,
  particles), the render resolution is capped at 1.5x, and
  `prefers-reduced-motion` slows the camera.
- In development, `window.island` in the browser console holds the camera,
  controls, renderer, post-processing, shared uniforms and tap targets, and
  `tick(ms)` steps a frame by hand.

### Links for looking at it

| Parameter   | Does                                                         |
| ----------- | ------------------------------------------------------------ |
| `?seed=42`  | Grows a different island                                     |
| `?t=6.75`   | Starts the clock at a given day (see below)                  |
| `?speed=0`  | Holds the clock still. `2` runs it twice as fast, `0.1` slower |
| `?weather=` | `clear`, `rain` or `storm`, overriding the weather's schedule |

`t` counts days from midnight on the first day of spring. The whole part
picks the day — spring is 0–2, summer 2–4, autumn 4–6, winter 6–8 — and the
fraction is the sun's hour: `.25` sunrise, `.5` midday, `.75` sunset, `.0`
midnight. So `?t=3.5&speed=0` is summer at noon, held still, and
`?t=6.75&speed=0` is a winter dusk.

### Where things are

```
src/island/
  engine.ts        the renderer and the frame loop; wires everything below
  IslandView.tsx   the page: canvas plus the four lines of text over it
  noise.ts         seeded random numbers and simplex noise
  world.ts         the island's shape: height, slope, walkable ground
  detail.ts        how much island a device gets
  time.ts          the clock: day length, seasons, "early spring · dawn"
  seasons.ts       the four palettes and the blend between them
  shared.ts        uniforms every shader reads (time, wind, sun, sky,
                   season) and the GLSL noise and wind they share
  post.ts          bloom, tone mapping, FXAA and the colour grade
  sky.ts           the sky dome, sun, moon, stars, light and fog
  terrain.ts       smooth ground, coloured per pixel in a shader
  water.ts         the sea: GPU swell, depth colour, foam, Fresnel, glints
  shapes.ts        grown tree, pine and boulder shapes; the sway shader
  vegetation.ts    where the trees, rocks and flowers go
  grass.ts         instanced blades bending in the wind
  weather.ts       soft clouds, and the petals, leaves and snow that fall
  rain.ts          the weather's schedule, rain, and lightning
  mist.ts          mist pooling in the hollows at dawn
  cottage.ts       the cottage, its lit windows, lantern and smoke
  fireflies.ts     summer nights
  viewer.ts        camera, orbit controls, tapping, following, riding along
  walk.ts          walking as either of the couple: input, movement, collisions
  creatures/       deer, rabbits, the fox, flocks of birds, the couple; models.ts
                   loads the animal models and plays their animations
```

### Models

The deer, stags, fox and the couple are CC0 models by Quaternius, credited in
`public/models/CREDITS.md`. `node tools/models.mjs` rebuilds them from
their sources, keeping only the animations the island uses and compressing
them (about 280 KB each). They load after the island is on screen. The
rabbits, swallows and gulls are made in code (`creatures/bodies.ts`): soft
bodies with the joints their behaviour moves — a rabbit's haunches, feet,
head and ears; a bird's wings at shoulder and wrist.

### Screenshots

`tools/shot.mjs` drives Chrome over the DevTools protocol at any viewport
size. Hold the clock with `?speed=0` and give WebGL a moment to settle:

```bash
SHOT_SETTLE=4000 node tools/shot.mjs ./shots http://localhost:3000 390 844 winter-dusk="/?t=6.75&speed=0"
```

---

## History

This repository has held three things. The earlier two are kept at tags:

- [`museum`](../../tree/museum): a fictional institute archiving objects
  under parody accession numbers.
- [`photo-a-day`](../../tree/photo-a-day): a one-photograph-a-day life
  archive, with Supabase, Vercel Blob and an iOS app.

`ios/` is the photo-a-day iOS app. The website no longer uses it.
