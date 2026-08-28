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

    private static func all() -> [ResolvedDay] {
        [
            day(
                date: "2026-08-28",
                aspect: 0.75,
                dark: false,
                note: "The beeches at the top of the hill, looking straight up. I have walked past them for eleven years and never once looked up.",
                place: "Hampstead Heath",
                weather: Weather(temperatureC: 19, conditions: "Clear", precipitationMm: 0, windMs: 2.1, daylight: true)
            ),
            day(
                date: "2026-08-27",
                aspect: 1.5,
                dark: true,
                note: nil,
                place: "Southwark",
                weather: Weather(temperatureC: 11, conditions: "Light rain", precipitationMm: 1.4, windMs: 5.0, daylight: false)
            ),
            day(
                date: "2026-08-26",
                aspect: 1.0,
                dark: false,
                note: "Nothing happened today.",
                place: nil,
                weather: nil
            ),
            day(
                date: "2025-12-31",
                aspect: 0.66,
                dark: true,
                note: "The last of it.",
                place: "Edinburgh",
                weather: Weather(temperatureC: 2, conditions: "Snow", precipitationMm: 3.2, windMs: 8.4, daylight: false)
            ),
        ]
    }

    // MARK: Making a photograph out of nothing

    private static func day(
        date: String,
        aspect: Double,
        dark: Bool,
        note: String?,
        place: String?,
        weather: Weather?
    ) -> ResolvedDay {
        let height = 1400
        let width = Int(Double(height) * aspect)
        let (url, lightness, tone) = drawn(width: width, height: height, dark: dark)

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
        width: Int, height: Int, dark: Bool
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
        }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("fixture-\(width)x\(height)-\(dark).jpg")
        try? image.jpegData(compressionQuality: 0.9)?.write(to: url)

        return (
            url,
            dark ? 0.18 : 0.66,
            dark ? "#2a2620" : "#9aa196"
        )
    }
}
#endif
