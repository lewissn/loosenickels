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
            let portrait = day.photo.aspect < 1
            /* A tall photograph is given the room it needs and the writing
               sits under it; a wide one is held to two thirds so the band
               beneath is a deliberate proportion rather than whatever is
               left. */
            let pictureHeight = portrait
                ? screen.size.height * 0.74
                : screen.size.height * 0.56

            VStack(alignment: .leading, spacing: 0) {
                photograph(in: room)
                    .frame(width: screen.size.width, height: pictureHeight)
                    .clipped()

                writing(in: room)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Space.margin)
                    .padding(.top, Space.s5)

                Spacer(minLength: 0)
            }
            .frame(width: screen.size.width, height: screen.size.height)
            .background(room.ground)
        }
    }

    // MARK: The photograph

    private func photograph(in room: Room) -> some View {
        ZStack {
            /* Behind, not instead of. The placeholder stays put while the
               real one arrives on top of it, so the transition is a picture
               resolving rather than one view replacing another. */
            if let inline = day.photo.placeholder,
               let image = InlineImage.decode(inline) {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(day.photo.aspect, contentMode: .fit)
                    .blur(radius: 18)
                    .opacity(0.9)
            }

            if let url = day.photo.best {
                AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.45))) { phase in
                    if let image = phase.image {
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .transition(.opacity)
                    } else {
                        Color.clear
                    }
                }
            } else if day.photo.processing != .ready {
                /* Honest rather than hidden. The photograph is safe; what
                   does not exist yet is a rendition small enough to show. */
                Signage(text: "Still arriving", tone: room.inkFaint)
            }
        }
        /* Parallax. The picture drifts against its own frame as the day
           crosses the screen — a little slower than the scroll, which is
           what makes the surface read as having depth rather than as a list
           of cards going past. */
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
            /* The year, oversized and barely there, sitting behind the date.
               It is the one piece of ornament in the design and it earns its
               place by doing a job: at a glance, across a scroll, it is how
               you know roughly where in a life you are. */
            ZStack(alignment: .topLeading) {
                Text(String(day.date.year))
                    .font(.system(size: 84, weight: .regular, design: .serif))
                    .foregroundStyle(room.ink.opacity(0.07))
                    .offset(x: -Space.s2, y: -Space.s6)
                    .allowsHitTesting(false)

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
