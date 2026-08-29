#if DEBUG
import SwiftUI
import UIKit

/*
 A design harness.

 Launch with `-fixtures` and the app renders invented days instead of asking
 anybody to sign in. It exists because the alternative was iterating on a
 layout by reasoning about it: signing in needs a deep link, a deep link
 raises a system prompt, and a system prompt cannot be dismissed from a
 script — so the viewer could be compiled but never looked at.

 DEBUG only, and nothing outside this file knows it exists. The fixtures are
 drawn rather than bundled: a real photograph in a public repository would be
 somebody's actual day, and a checked-in asset is how that happens by
 accident.

 The four below are chosen to break the layout rather than to flatter it —
 tall and short, dark and bright, a long note and none at all.
 */

enum Fixtures {
    static var requested: Bool {
        CommandLine.arguments.contains("-fixtures")
    }

    static let profile = Profile(
        id: "fixture",
        handle: "lewis",
        displayName: nil,
        bio: nil,
        visibility: .private,
        timeZone: TimeZone(identifier: "Europe/London")!,
        locationPrecision: .hidden
    )

    /// `-start 1` opens on the second fixture. The dark landscape one is
    /// where this design is most likely to be wrong, and it is otherwise
    /// reachable only by scrolling, which a script cannot do.
    private static var start: Int {
        guard let i = CommandLine.arguments.firstIndex(of: "-start"),
              i + 1 < CommandLine.arguments.count,
              let n = Int(CommandLine.arguments[i + 1])
        else { return 0 }
        return n
    }

    static func days() -> [ResolvedDay] {
        let all = all()
        guard start > 0, start < all.count else { return all }
        return Array(all[start...]) + Array(all[..<start])
    }

    /* §34: build rules that generalise, and test them against the cases
       that break rules. Every shape the composition system claims to handle,
       both extremes of lightness, a note of each length and none, and one
       photograph whose bottom third is busier than its top — which is the
       only thing that makes the placement logic do anything. */
    private static func all() -> [ResolvedDay] {
        [
            /* Bright and busy at the top: a canopy. The case that showed the
               rail was illegible, which smooth gradients never would have —
               dark ink over bright branches is lost at any tone, and only a
               scrim fixes it. */
            day("2026-08-29", aspect: 0.75, dark: false, busyBottom: false, busyTop: true,
                note: "The beeches at the top of the hill, looking straight up. I have walked past them for eleven years and never once looked up.",
                place: "Hampstead Heath",
                weather: Weather(temperatureC: 19, conditions: "Clear", precipitationMm: 0, windMs: 2.1, daylight: true)),

            // Portrait, dark, no note — the sparsest a scene ever gets.
            day("2026-08-28", aspect: 0.75, dark: true, busyBottom: false,
                note: nil, place: "Southwark",
                weather: Weather(temperatureC: 11, conditions: "Light rain", precipitationMm: 1.4, windMs: 5.0, daylight: false)),

            // Portrait whose lower third is busy: the date should move up.
            day("2026-08-27", aspect: 0.72, dark: false, busyBottom: true,
                note: "Low tide.", place: "Wells-next-the-Sea",
                weather: Weather(temperatureC: 15, conditions: "Overcast", precipitationMm: 0, windMs: 7.2, daylight: true)),

            // Landscape: a band, with the writing seated beneath it.
            day("2026-08-26", aspect: 1.5, dark: false, busyBottom: false,
                note: "Avoiding Fort William", place: "Fort William",
                weather: Weather(temperatureC: 16, conditions: "Overcast", precipitationMm: 0, windMs: 3.9, daylight: true)),

            // Square: large, seated, no note.
            day("2026-08-25", aspect: 1.0, dark: false, busyBottom: false,
                note: nil, place: nil, weather: nil),

            // Panorama: a strip in deliberate emptiness, writing above.
            day("2026-08-24", aspect: 2.6, dark: true, busyBottom: false,
                note: "We stayed until the light disappeared.", place: "Rannoch Moor",
                weather: Weather(temperatureC: 4, conditions: "Clear", precipitationMm: 0, windMs: 1.1, daylight: false)),
        ]
    }

    /**
     A year of days, for designing anything that zooms out.

     Four recorded days is not a density any of the wider views can be judged
     at — a calendar of a year with four cells filled tells you nothing about
     whether the calendar works. This is a year with the gaps a real one has:
     dense stretches, thin months, and a handful of weeks missing entirely,
     because a mosaic whose whole point is that absences are visible has to
     be looked at with absences in it.

     Twelve drawn images reused across the year rather than 366 of them. The
     layouts care about shape, tone and presence; drawing each day its own
     picture would cost seconds at launch and prove nothing extra.
     */
    static func year(_ which: Int = 2026) -> [DaySummary] {
        var summaries: [DaySummary] = []
        var seed = UInt64(0xD1B54A32D192ED03)
        let random = { () -> Double in
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            return Double((seed >> 33) % 10_000) / 10_000
        }

        let plates: [(URL, Int, Int, Double, String)] = (0..<12).map { i in
            let dark = i % 4 == 0
            let aspect = [0.75, 0.75, 1.0, 1.5, 0.72][i % 5]
            let height = 900
            let width = Int(Double(height) * aspect)
            let (url, lightness, tone) = drawn(width: width, height: height, dark: dark)
            return (url, width, height, lightness, tone)
        }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/London")!

        for month in 1...12 {
            /* Some months are thin and one is nearly empty. A year of
               perfect attendance is not what this product produces and is
               not what its calendar has to look good against. */
            let attendance: Double = month == 2 ? 0.18 : (month % 4 == 0 ? 0.55 : 0.86)
            let days = calendar.range(
                of: .day, in: .month,
                for: calendar.date(from: DateComponents(year: which, month: month, day: 1))!
            )!

            for day in days {
                guard random() < attendance else { continue }
                let plate = plates[(month * 31 + day) % plates.count]
                summaries.append(
                    DaySummary(
                        date: CalendarDate(String(format: "%04d-%02d-%02d", which, month, day))!,
                        thumbnailUrl: plate.0,
                        width: plate.1,
                        height: plate.2,
                        placeholder: nil
                    )
                )
            }
        }

        return summaries
    }

    /* A plausible 4x6 map. Not measured from the drawn image — these are
       gradients and would map as uniformly quiet, which would exercise
       nothing. Invented so the placement logic has something to decide
       between. */
    private static func grid(dark: Bool, busyBottom: Bool) -> [Region] {
        (0..<24).map { i in
            let row = i / 4
            let low = row >= 4
            return Region(
                l: dark ? 0.16 + Double(row) * 0.02 : 0.72 - Double(row) * 0.04,
                v: busyBottom
                    ? (low ? 0.62 : 0.14)
                    : (low ? 0.11 : 0.30)
            )
        }
    }

    /// A chosen-but-not-yet-sent photograph, for looking at the compose
    /// sheet in the only state that matters.
    static func prepared() -> Photograph.Prepared? {
        let (url, _, _) = drawn(width: 1050, height: 1400, dark: false)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return Photograph.read(data, filename: "jpg")
    }

    // MARK: Making a photograph out of nothing

    private static func day(
        _ date: String,
        aspect: Double,
        dark: Bool,
        busyBottom: Bool,
        busyTop: Bool = false,
        note: String?,
        place: String?,
        weather: Weather?
    ) -> ResolvedDay {
        let height = 1400
        let width = Int(Double(height) * aspect)
        let (url, lightness, tone) = drawn(width: width, height: height, dark: dark, busy: busyTop)

        return ResolvedDay(
            date: CalendarDate(date)!,
            note: note,
            visibility: .private,
            photo: ResolvedPhoto(
                assetId: date,
                width: width,
                height: height,
                placeholder: nil,
                lightness: lightness,
                tone: tone,
                regions: grid(dark: dark, busyBottom: busyBottom),
                processing: .ready,
                urls: [.large: url],
                alt: "Fixture for \(date)"
            ),
            capturedAt: Date(),
            captureTimeZone: "Europe/London",
            place: place.map { Place(label: $0, coordinates: nil) },
            weather: weather,
            camera: Camera(make: "Apple", model: "iPhone 16", lens: nil, focalLength: nil, aperture: nil, shutterSpeed: nil, iso: nil),
            revisionCount: 1
        )
    }

    /// Drawn to a file and handed back as a `file://` URL, because that is
    /// what `AsyncImage` takes and it keeps the viewer itself unaware that
    /// any of this exists.
    private static func drawn(
        width: Int, height: Int, dark: Bool, busy: Bool = false
    ) -> (URL, Double, String) {
        let size = CGSize(width: width, height: height)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1

        let top = dark
            ? UIColor(red: 0.09, green: 0.11, blue: 0.14, alpha: 1)
            : UIColor(red: 0.55, green: 0.68, blue: 0.78, alpha: 1)
        let bottom = dark
            ? UIColor(red: 0.20, green: 0.17, blue: 0.13, alpha: 1)
            : UIColor(red: 0.78, green: 0.76, blue: 0.62, alpha: 1)

        let image = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            let space = CGColorSpaceCreateDeviceRGB()
            let gradient = CGGradient(
                colorsSpace: space,
                colors: [top.cgColor, bottom.cgColor] as CFArray,
                locations: [0, 1]
            )!
            ctx.cgContext.drawLinearGradient(
                gradient,
                start: .zero,
                end: CGPoint(x: 0, y: size.height),
                options: []
            )

            /* A few bands, so the picture has somewhere for the eye to go
               and the parallax has something to move against. */
            UIColor(white: dark ? 1 : 0, alpha: 0.06).setFill()
            for i in stride(from: 0, to: Int(size.height), by: 190) {
                ctx.cgContext.fill(
                    CGRect(x: 0, y: CGFloat(i), width: size.width, height: 62)
                )
            }

            /* Branches, for the fixtures that need to be genuinely busy
               rather than merely mid-toned. High-frequency dark detail over
               a bright ground is what actually defeats overlaid text, and a
               gradient — however dark — never reproduces it. */
            if busy {
                var seed = UInt64(0x9E3779B97F4A7C15)
                let random = { () -> Double in
                    seed = seed &* 6364136223846793005 &+ 1442695040888963407
                    return Double((seed >> 33) % 10_000) / 10_000
                }

                ctx.cgContext.setLineCap(.round)
                for _ in 0..<220 {
                    let x = random() * size.width
                    let y = random() * size.height * 0.55
                    let length = 40 + random() * 190
                    let angle = (random() - 0.5) * 2.4

                    UIColor(white: 0.10, alpha: 0.30 + random() * 0.45).setStroke()
                    ctx.cgContext.setLineWidth(1.5 + random() * 5)
                    ctx.cgContext.move(to: CGPoint(x: x, y: y))
                    ctx.cgContext.addLine(
                        to: CGPoint(
                            x: x + cos(angle) * length,
                            y: y + sin(angle) * length
                        )
                    )
                    ctx.cgContext.strokePath()
                }
            }
        }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("fixture-\(width)x\(height)-\(dark)-\(busy).jpg")
        try? image.jpegData(compressionQuality: 0.9)?.write(to: url)

        return (
            url,
            dark ? 0.18 : 0.66,
            dark ? "#2a2620" : "#9aa196"
        )
    }
}
#endif
