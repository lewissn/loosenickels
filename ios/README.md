# The app

A SwiftUI client for the same archive the website serves, speaking the same
contract: `Sources/ArchiveSource.swift` is a mirror of
`src/lib/archive/source.ts`, and both are mirrors of what row level security
actually permits. Neither client is allowed a second opinion about
permission — this one least of all, since it runs on a device its owner
controls, where any check it made could simply be deleted.

The museum that used to be here — departments, accession numbers,
significance ratings, and a write path that committed records to this git
repository through the GitHub contents API — is gone. It is preserved
complete at the tag `institute-final`.

---

## Building it

The Xcode project is generated rather than committed. Regenerate it rather
than editing it, and keep anything that must survive in `project.yml`.

```bash
cd ios && xcodegen && open Daily.xcodeproj
```

**You do not have Homebrew on this machine**, so the usual
`brew install xcodegen` will not work. Two ways round it.

Build xcodegen from source — no admin password, and this is the one that was
actually used to generate and build the project:

```bash
git clone --depth 1 https://github.com/yonaskolb/XcodeGen.git /tmp/xcodegen && (cd /tmp/xcodegen && swift build -c release)
```

That leaves the binary at `/tmp/xcodegen/.build/release/xcodegen`. Run it by
that full path, or copy it somewhere on your `PATH`.

Or install Homebrew first, which needs your password and is worth having
anyway:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Put your ten-character Team ID in `project.yml` under `DEVELOPMENT_TEAM`
before generating. Leaving it empty still produces a working project, but
Xcode will ask for a team on the Signing & Capabilities tab and that choice
is lost the next time the project is regenerated.

One dependency, resolved by Xcode on first build: **supabase-swift**. It
carries the session — keychain storage, refresh before expiry, and parsing
the magic link that creates it — and speaks PostgREST. Hand-rolling token
refresh is the kind of code that works until somebody leaves the app open
overnight.

## Pointing it somewhere

`Sources/Backend.swift` has two constants to fill in, from the Supabase
dashboard under **Project Settings → API**:

```swift
static let url = URL(string: "https://YOUR-PROJECT.supabase.co")!
static let publishableKey = "YOUR-PUBLISHABLE-KEY"
```

Use the **publishable (anon)** key. Never the service role key — that one
bypasses row level security entirely and must never leave a server.

Neither value is a secret: the key is the same one the website ships to
every browser. They are compiled in rather than put behind a settings screen
because a settings screen only invites someone to change them.

Until they are filled in the app says so on its own first screen, rather
than failing at the first request with something unreadable.

## The magic link

This is the part with three places to get right, and it fails silently if
any one of them is wrong — the link opens the website on the phone and the
app simply stays signed out.

1. **The URL scheme**, in `project.yml` under `CFBundleURLTypes`. Already
   set to `loosenickels`.
2. **The redirect**, in `Sources/Backend.swift` as
   `loosenickels://auth-callback`.
3. **The allow-list**, in the Supabase dashboard under **Authentication →
   URL Configuration**. Add `loosenickels://auth-callback` alongside the web
   callbacks.

All three must agree.

## What it does

**Sign in.** A link, no password. What the screen says when a link was sent
and what it says when the address has no account are deliberately the same
sentence: registration is closed, and a refusal that read differently would
answer, to anybody willing to type addresses in, the question of who keeps
an archive here.

**Look at the archive.** One day filling the screen, paged with the
platform's own scrolling rather than a worse copy of the website's gesture.
What opens is the most recently recorded day — not today's, necessarily. An
empty screen for the sin of not having posted yet would be the product
punishing somebody for missing a day.

**Record a day.** Three separate steps, and the separation is the point:

```
read on device   →   bytes to storage   →   tell a day which photograph is its own
```

The server never sees the file, only an object key, so anything not read on
the device is lost. The middle step is the one that fails outdoors, and
because it is separate a failed commit can be retried without sending the
photograph again. An idempotency key, generated once per chosen photograph
and kept across retries, means a reply that never arrived cannot produce a
second copy of the same day.

## Two things worth not breaking

**The original is uploaded untouched.** This app used to downscale to
2400px and re-encode as JPEG, because git was keeping every version of every
file forever. Object storage removed that reason. Full resolution, original
format, and the EXIF intact.

**And a second upload, when the server cannot read the first.** sharp has no
HEVC decoder, so an iPhone HEIC is an original nothing on the server can
resize. This phone has a decoder, so the conversion happens where it is
possible: `Photograph.read` attaches a JPEG transcode as `source`, uploaded
alongside the original and used by the pipeline as its input. The camera's
file is still kept. `source` is owner-only, exactly as the original is,
because it carries exactly the same EXIF.

**EXIF capture time is local time at the camera.** `Photograph.swift` parses
`DateTimeOriginal` in the zone the offset tag names, or the device's zone if
the file carries none — never as UTC. Parsing it as UTC is exactly what
files a Tokyo evening on the wrong day. Where a file records no capture time
at all, the day is today *in the archive owner's zone*, which comes from
their profile and not from the phone: the phone is in a different zone
whenever they are travelling.

## What is not here yet

- Calendar, map, on-this-day, and public profiles. The website has not built
  them either; the contract has the methods.
- Editing a note or a day's visibility after the fact. `ArchiveSource` has
  `setNote` and `setVisibility` and no screen calls them.
- Location from the device at the moment of recording. `Field.swift` still
  reads position and weather and nothing uses it — the photograph's own EXIF
  coordinates are what get recorded. It is kept because a photograph from a
  screenshot has no position and the phone does.
- WeatherKit. Deliberately not enabled: the entitlement fails to sign until
  the App ID is registered for it, which would block the very first build
  for a field the app is written to do without.
