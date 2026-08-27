# Accession

The archive's capture app. One screen, on a phone, that files a record
into this repository.

There is no server. The app draws the next accession number from the
records directory, writes a JSON file and a photograph through the GitHub
contents API, and the site rebuilds. Everything the archive is fussy
about — position, the accuracy of that position, altitude, weather, the
moment the photograph was taken — arrives on its own. What is left to
type is a title.

**This has never been compiled.** It was written without a Mac. The
record shape it produces has been validated against the site's own schema
end to end, and the slug algorithm has been tested against the schema's
pattern, but the Swift itself has not been through a compiler. Expect to
fix something on the first build.

---

## Building it

There is no `.xcodeproj` here, because a hand-written one is more likely
to be broken than useful. Make a fresh project and add these files.

1. **Xcode → New Project → iOS → App.**
   - Product Name: `Accession`
   - Interface: SwiftUI, Language: Swift
   - Minimum deployment: **iOS 17.0**
2. Delete the `ContentView.swift` and `AccessionApp.swift` Xcode
   generated — the ones here replace them.
3. Drag everything in `ios/Sources` into the project. Tick *Copy items if
   needed* is not necessary if you would rather they stay in the repo.
4. **Signing & Capabilities** → select your team. A development build on
   a paid developer account is good for a year before it needs
   reinstalling.
5. Add these to the target's **Info** tab, or to `Info.plist`:

   | Key | Value |
   | --- | --- |
   | `NSLocationWhenInUseUsageDescription` | The archive records where a thing was found, and how accurately it is able to say so. |
   | `NSCameraUsageDescription` | For photographing what is being accessioned. |
   | `NSPhotoLibraryUsageDescription` | For filing a photograph that has already been taken. |

6. Build to the phone.

Swift 5 language mode is assumed — the default for a new project. Swift 6
strict concurrency will want annotations this code does not carry.

### WeatherKit is optional

The weather line fills itself in from WeatherKit, which needs the
capability enabled on the target *and* the App ID registered for
WeatherKit on the developer portal. It takes about thirty minutes to
propagate.

Until that is done, the app works exactly as it otherwise would and
simply leaves the weather off the record. Get everything else running
first; the weather is the one part that can wait.

---

## The token

Settings wants a **fine-grained personal access token**:

- GitHub → Settings → Developer settings → Personal access tokens →
  Fine-grained tokens
- Repository access: **only** `lewissn/loosenickels`
- Permissions: **Contents: read and write**
- Nothing else

It is held in the keychain, marked as this-device-only and
unlocked-only. It is a token scoped to one repository, on the phone of
the person who owns that repository — the exposure is proportionate, and
it is the reason the app needs no backend at all.

---

## What it writes

Two files per record, both created and never updated:

```
src/content/records/LN-XX-0000.json
public/media/LN-XX-0000/plate.jpg      (when there is a photograph)
```

The photograph goes first. A failure part-way then leaves at worst an
orphaned image under a number that was never issued — invisible and
harmless. The other order would leave a record pointing at a photograph
that does not exist, which fails the build.

### Accession numbers cannot collide

The filenames in `src/content/records` *are* the accession numbers, so
listing that directory is reading the register. The next number is the
highest yet issued in that department plus one — sequences are never
reused, including after a withdrawal.

The write carries no blob SHA, which means GitHub creates or refuses; it
never overwrites. That refusal is the collision check, and it is exact.

### Slugs might

Two things can honestly have the same title, and a duplicate slug fails
the build rather than the write. So before filing, the app asks the
deployed site whether `/archive/record/<slug>/` already answers, and
suffixes if it does.

That only knows about records already deployed. Two identically titled
records filed inside the same build window would still collide — at which
point the build says so by name and the title can be changed. Rare enough
to leave loud rather than engineer around.

---

## What the phone knows

The schema was written before any of this existed and turns out to fit a
phone almost exactly:

| Schema field | Where it comes from |
| --- | --- |
| `place.coordinates.lat` / `lon` | `CLLocation.coordinate` |
| `place.coordinates.precision` | `CLLocation.horizontalAccuracy` — metres, the instrument's own figure |
| `place.coordinates.elevation` | `CLLocation.altitude`, when vertical accuracy is valid |
| `place.name` / `region` / `country` | `CLGeocoder` reverse geocode |
| `weather` | WeatherKit current conditions |
| `media[].captured` | EXIF `DateTimeOriginal`, read before re-encoding |
| `media[].width` / `height` | measured after downscaling |

`precision` is the one worth noticing. The About page claims positions
are recorded to the accuracy the archive is willing to claim rather than
the accuracy the instrument offers. On a phone those are the same number,
so the claim is now literally true, and the rings on the survey plot are
real GPS accuracy radii.

Photographs are redrawn at no more than 2400px on the long edge and
encoded as JPEG at 0.85 — every version is kept forever by git, and a
12-megapixel HEIC is not a reasonable thing to keep forever. Redrawing
also resolves EXIF orientation into the pixels, so a rotated photograph
is not filed with its aspect inverted.

The build corrects the dimensions anyway. `tools/ingest.mjs` reads every
image on the way through and treats the file as the authority, so a
device that reports its own size badly is simply overruled.
