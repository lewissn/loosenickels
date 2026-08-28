import SwiftUI

/*
 One day, filling the screen.

 Three things carry the design, and all three are consequences of a single
 decision: the photograph is the subject and the interface is its room.

 Nothing is ever cropped. A photograph whose shape disagrees with the screen
 leaves space, and that leftover space is where the writing goes — the
 conflict generates the composition rather than being a problem to solve. A
 portrait picture on a phone leaves a band beneath it; a landscape one leaves
 two, and the writing takes the lower.

 The room takes its light from the picture. Ground, ink and rules all come
 from the photograph's own measured lightness and tone, so a dark photograph
 is surrounded by darkness and a bright one by paper — and the writing stays
 legible in both without ever being set over the image itself.

 And the motion belongs to the scroll rather than to a timer. Everything
 below is a function of how far this day is from the middle of the screen:
 nothing plays, nothing has a duration, and letting go halfway leaves it
 halfway. That is what makes it feel attached to the hand.
 */

struct DayPage: View {
    let day: ResolvedDay
    let timeZone: TimeZone
    let isFirst: Bool

    var body: some View {
        let room = Room.lit(by: day.photo)

        GeometryReader { screen in
            /* The photograph takes the height its own shape asks for, and
               the writing sits directly beneath it — then the pair is
               centred in what is left.

               An earlier version gave the picture a fixed fraction of the
               screen, three quarters for a tall one and just over half for a
               wide one. A tall photograph filled its allowance and looked
               right; a wide one sat marooned in the middle of a frame far
               taller than itself, with dead air above it and the writing
               stranded below. Aspect-fitting inside a box the wrong shape is
               how that happens, and the fix is to stop choosing the box. */
            let natural = screen.size.width / max(day.photo.aspect, 0.01)
            /* The ceiling leaves room for a date, a note of a few lines and
               the measurements under it, whatever the photograph's shape. */
            let pictureHeight = min(natural, screen.size.height * 0.66)

            VStack(alignment: .leading, spacing: Space.s5) {
                photograph(in: room)
                    .frame(width: screen.size.width, height: pictureHeight)
                    .clipped()

                writing(in: room)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Space.margin)
            }
            .frame(
                width: screen.size.width,
                height: screen.size.height,
                alignment: .center
            )
            .background(room.ground)
        }
    }

    // MARK: The photograph

    private func photograph(in room: Room) -> some View {
        Plate(photo: day.photo, room: room)
            /* Parallax. The picture drifts against its own frame as the day
               crosses the screen — a little slower than the scroll, which is
               what makes the surface read as having depth rather than as a
               list of cards going past. */
            .scrollTransition(axis: .vertical) { content, phase in
                content
                    .offset(y: phase.value * -34)
                    .scaleEffect(1 - abs(phase.value) * 0.035)
                    .opacity(1 - abs(phase.value) * 0.35)
            }
    }

    // MARK: The writing

    private func writing(in room: Room) -> some View {
        VStack(alignment: .leading, spacing: Space.s3) {
                VStack(alignment: .leading, spacing: Space.s2) {
                Text(day.date.spelled(in: timeZone))
                    .font(.system(size: Size.title, design: .serif))
                    .foregroundStyle(room.ink)
                    .fixedSize(horizontal: false, vertical: true)

                if let note = day.note, !note.isEmpty {
                    Text(note)
                        .font(.system(size: Size.body, design: .serif))
                        .foregroundStyle(room.inkMuted)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }

                metadata(in: room)
            }
        }
        /* The writing arrives a beat after the picture and from slightly
           below it, which reads as the page settling rather than as two
           things animating at once. */
        .scrollTransition(axis: .vertical) { content, phase in
            content
                .offset(y: phase.value * 22)
                .opacity(1 - abs(phase.value) * 1.4)
        }
    }

    /// A measurement, not prose — so it is set in the family that carries
    /// measurements, and it says only what the photograph actually recorded.
    @ViewBuilder
    private func metadata(in room: Room) -> some View {
        let parts: [String] = [
            day.capturedAt.map(clock),
            day.place?.label,
            day.weather.flatMap(summary),
            day.camera?.model,
        ].compactMap { $0 }

        if !parts.isEmpty {
            HStack(spacing: 0) {
                ForEach(Array(parts.enumerated()), id: \.offset) { index, part in
                    if index > 0 {
                        Text("·")
                            .font(Face.mono(Size.micro))
                            .foregroundStyle(room.inkFaint.opacity(0.5))
                            .padding(.horizontal, Space.s2)
                    }
                    Text(part)
                        .font(Face.mono(Size.micro))
                        .foregroundStyle(room.inkFaint)
                }
            }
            .padding(.top, Space.s2)
        }
    }

    /// "Light rain 14°" — the phrase and the number, and nothing else. Wind
    /// and rainfall are recorded but not shown: they are worth having in the
    /// archive and are not worth a line under every photograph.
    private func summary(_ weather: Weather) -> String? {
        guard !weather.isEmpty else { return nil }
        return [
            weather.conditions,
            weather.temperatureC.map { "\(Int($0.rounded()))°" },
        ]
        .compactMap { $0 }
        .joined(separator: " ")
    }

    /// The zone the photograph was taken in, where it recorded one — not the
    /// reader's. A time is a measurement of a moment somewhere.
    private func clock(_ moment: Date) -> String {
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_GB")
        out.timeZone = day.captureTimeZone.flatMap(TimeZone.init(identifier:)) ?? timeZone
        out.dateFormat = "HH:mm"
        return out.string(from: moment)
    }
}

enum InlineImage {
    /// `data:image/webp;base64,…`, as the placeholder column stores it.
    static func decode(_ inline: String) -> UIImage? {
        guard let comma = inline.firstIndex(of: ","),
              let data = Data(base64Encoded: String(inline[inline.index(after: comma)...]))
        else { return nil }
        return UIImage(data: data)
    }
}

/*
 The photograph itself.

 Replaces `AsyncImage`, which begins downloading when the view appears and
 caches by URL — neither of which survives contact with a paging scroll over
 signed, expiring URLs. See Photographs.swift.

 The placeholder sits behind rather than instead of, so the transition is a
 picture resolving rather than one view replacing another.
 */
private struct Plate: View {
    let photo: ResolvedPhoto
    let room: Room

    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if image == nil, let inline = photo.placeholder,
               let blurred = InlineImage.decode(inline) {
                Image(uiImage: blurred)
                    .resizable()
                    .aspectRatio(photo.aspect, contentMode: .fit)
                    .blur(radius: 18)
                    .opacity(0.9)
                    .transition(.opacity)
            }

            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .transition(.opacity)
            } else if photo.forThisScreen == nil, photo.processing != .ready {
                /* Honest rather than hidden. The photograph is safe; what
                   does not exist yet is a rendition small enough to show. */
                Signage(text: "Still arriving", tone: room.inkFaint)
            }
        }
        .animation(Tempo.out, value: image != nil)
        .task(id: photo.assetId) {
            /* Very often already held, because the day either side of this
               one was prefetched while the reader was looking at it. */
            if let held = await Photographs.shared.cached(photo.assetId) {
                image = held
                return
            }
            guard let url = photo.forThisScreen else { return }
            image = await Photographs.shared.image(for: photo.assetId, at: url)
        }
    }
}
