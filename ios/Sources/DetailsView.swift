import SwiftUI

/*
 Everything the archive knows about one day.

 §20 asks for this without a dense settings table: "typographic grouping and
 generous spacing". So there are no rows, no separators, no chevrons and no
 boxes — only headings in the signage face and facts set beneath them, with
 enough air that the groups are legible as groups without anything drawn
 around them.

 The order is not arbitrary. It runs outward from the day itself: what it
 was, then when, then where, then what the weather was doing, then finally
 the apparatus. §12's rule that the primary viewer must not feel technical
 applies here too — the camera has not disappeared, it has simply been put
 last, where somebody looking for it will find it and nobody else will trip
 over it.

 Facts that do not exist are absent rather than shown empty. A screen of
 dashes is a screen of dashes.
 */

struct DetailsView: View {
    let day: ResolvedDay
    let timeZone: TimeZone
    let room: Room
    let onClose: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s8) {
                header
                group("The day", theDay)
                group("The moment", theMoment)
                group("The place", thePlace)
                group("The weather", theWeather)
                group("The photograph", thePhotograph)
            }
            .padding(.horizontal, Space.margin)
            .padding(.bottom, Space.s8)
        }
        .background(room.ground)
    }

    // MARK: The facts
    //
    // Built one at a time rather than as array literals of optional tuples.
    // Swift's type checker gives up on those at about this size, and the
    // error it gives — "unable to type-check this expression in reasonable
    // time" — points at the whole body rather than at the literal.

    private struct Facts {
        private(set) var all: [(String, String)] = []

        mutating func add(_ label: String, _ value: String?) {
            guard let value, !value.isEmpty else { return }
            all.append((label, value))
        }
    }

    private var theDay: [(String, String)] {
        var facts = Facts()
        facts.add("Date", day.date.spelled(in: timeZone))
        facts.add("Note", day.note)
        facts.add("Visible to", day.visibility.name)
        if let count = day.revisionCount, count > 1 {
            facts.add("Versions", "\(count)")
        }
        return facts.all
    }

    private var theMoment: [(String, String)] {
        var facts = Facts()
        facts.add("Captured", day.capturedAt.map(clock))
        /* The zone is shown as itself rather than folded into the time,
           because "17:15" and "17:15 in Europe/London" are different facts,
           and the second is the one that explains why this photograph is
           filed on the day it is. */
        facts.add("Reckoned in", day.captureTimeZone)
        return facts.all
    }

    private var thePlace: [(String, String)] {
        var facts = Facts()
        facts.add("Place", day.place?.label)
        if let where_ = day.place?.coordinates {
            facts.add("Position", String(format: "%.5f, %.5f", where_.lat, where_.lon))
            facts.add("Accurate to", where_.accuracy.map { "\(Int($0.rounded())) m" })
            facts.add("Elevation", where_.elevation.map { "\(Int($0.rounded())) m" })
        }
        return facts.all
    }

    private var theWeather: [(String, String)] {
        var facts = Facts()
        facts.add("Conditions", day.weather?.conditions)
        facts.add("Temperature", day.weather?.temperatureC.map { "\(Int($0.rounded()))°C" })
        facts.add("Rainfall", day.weather?.precipitationMm.map { String(format: "%.1f mm", $0) })
        facts.add("Wind", day.weather?.windMs.map { String(format: "%.1f m/s", $0) })
        return facts.all
    }

    private var thePhotograph: [(String, String)] {
        var facts = Facts()
        facts.add("Dimensions", "\(day.photo.width) × \(day.photo.height)")
        facts.add("Camera", camera)
        facts.add("Lens", day.camera?.lens)
        facts.add("Focal length", day.camera?.focalLength.map { "\(Int($0.rounded())) mm" })
        facts.add("Aperture", day.camera?.aperture.map { String(format: "ƒ/%.1f", $0) })
        facts.add("Exposure", day.camera?.shutterSpeed.map(shutter))
        facts.add("ISO", day.camera?.iso.map { "\($0)" })
        facts.add("Renditions", processing)
        return facts.all
    }

    // MARK: Pieces

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Details")
                .font(.system(size: 40, design: .serif))
                .foregroundStyle(room.ink)
            Spacer()
            Button(action: onClose) {
                Signage(text: "Close", tone: room.inkFaint)
            }
        }
        .padding(.top, Space.s5)
    }

    /// A heading and its facts. Nothing is drawn: the grouping is done by
    /// space and by the heading's own weight, which is what §20 asks for and
    /// what a separator would be doing badly.
    @ViewBuilder
    private func group(_ title: String, _ present: [(String, String)]) -> some View {
        if !present.isEmpty {
            VStack(alignment: .leading, spacing: Space.s4) {
                Signage(text: title, tone: room.inkFaint)

                VStack(alignment: .leading, spacing: Space.s3) {
                    ForEach(present, id: \.0) { label, value in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(label)
                                .font(Face.grotesk(Size.micro))
                                .foregroundStyle(room.inkFaint)
                            Text(value)
                                /* Measurements in the mono face, prose in the
                                   serif — the same division the metadata line
                                   under a photograph uses. */
                                .font(measurement(value)
                                    ? Face.mono(Size.small)
                                    : .system(size: Size.body, design: .serif))
                                .foregroundStyle(room.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }

    /// Whether a value is a measurement rather than a name. Crude and
    /// deliberately so: anything beginning with a digit is a number about
    /// the world, and everything else is a word for something.
    private func measurement(_ value: String) -> Bool {
        guard let first = value.first else { return false }
        return first.isNumber || first == "ƒ" || first == "-"
    }

    private var camera: String? {
        let make = day.camera?.make
        let model = day.camera?.model
        guard make != nil || model != nil else { return nil }
        /* "Apple iPhone 16" rather than "Apple" and "iPhone 16" on two
           lines: the make is only ever read as a prefix to the model. */
        return [make, model].compactMap { $0 }.joined(separator: " ")
    }

    private var processing: String? {
        switch day.photo.processing {
        case .ready: return day.photo.urls.count == 1 ? nil : "\(day.photo.urls.count) sizes"
        case .pending, .processing: return "Still being made"
        case .failed: return "Could not be made"
        }
    }

    private func shutter(_ seconds: Double) -> String {
        /* Photographers read 1/250, not 0.004. Below a second the reciprocal
           is the only form anybody recognises. */
        seconds >= 1
            ? String(format: "%.1f s", seconds)
            : "1/\(Int((1 / seconds).rounded()))"
    }

    private func clock(_ moment: Date) -> String {
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_GB")
        out.timeZone = day.captureTimeZone.flatMap(TimeZone.init(identifier:)) ?? timeZone
        out.dateFormat = "HH:mm:ss"
        return out.string(from: moment)
    }
}
