import SwiftUI

/*
 One day, as a scene rather than a page.

 The old version was a photograph in a frame with a caption under it. This is
 a composition: the picture takes the screen where its shape allows, the
 writing goes where the picture leaves room, and the colours come from the
 photograph itself.

 Three layers, per §27:

   the memory     photograph, date, note, context — the default
   the photograph a single tap removes everything else
   the details    a deliberate gesture, not built yet

 Nothing here decides anything. The shape of the composition comes from
 `Composition`, the colours from `Room`, the date's form from `DateMark`. This
 file only arranges what they hand it, which is why it is short.
 */

struct DayScene: View {
    let day: ResolvedDay
    let timeZone: TimeZone
    /// Whether the interface is showing. Held by the viewer rather than here,
    /// so a tap on one day does not leave the next one dressed differently.
    let dressed: Bool
    let onTap: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var composition: Composition { Composition.of(day.photo) }
    private var room: Room { Room.lit(by: day.photo) }

    var body: some View {
        GeometryReader { screen in
            ZStack {
                room.ground

                switch composition.shape {
                case .portrait:
                    fullBleed(in: screen.size)
                default:
                    seated(in: screen.size)
                }
            }
            .frame(width: screen.size.width, height: screen.size.height)
            .contentShape(Rectangle())
            .onTapGesture(perform: onTap)
        }
    }

    // MARK: Portrait — the photograph is the screen

    private func fullBleed(in size: CGSize) -> some View {
        ZStack(alignment: composition.placement == .overlaidHigh ? .top : .bottom) {
            /* Filled while dressed, fitted while not.

               Filling is the one place the product crops, and §4 permits it
               for portraits: a portrait photograph on a portrait screen
               loses a sliver of its long edge, where a landscape one would
               lose its subject.

               But §5 asks that a tap let the image "be appreciated
               completely unobstructed", and a cropped photograph is
               obstructed by the frame. Taking the interface away and leaving
               a crop answers half the request. So isolating also releases
               the crop, and the picture settles into its whole shape. */
            Plate(photo: day.photo, room: room, fill: dressed)
                .frame(width: size.width, height: size.height)
                .clipped()

            if dressed {
                writing(over: true)
                    .padding(.horizontal, Space.margin)
                    .padding(.vertical, Space.s7)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    /* A scrim, not a blur. §6 rejects blurred backgrounds and
                       the same argument applies here: the point is to keep
                       the writing legible, and a gradient of the room's own
                       ground does that without smearing the photograph. */
                    .background(
                        Scrim(
                            dark: overlaidOnDark,
                            strongest: composition.placement == .overlaidHigh ? .top : .bottom
                        )
                    )
                    .transition(.opacity)
            }
        }
    }

    private var overlaidOnDark: Bool {
        day.photo.lightnessBehind(composition.placement) < 0.55
    }

    // MARK: Everything else — the photograph is seated in the room

    private func seated(in size: CGSize) -> some View {
        let natural = size.width / max(day.photo.aspect, 0.01)
        let height = min(natural, size.height * composition.heightFraction)

        return VStack(alignment: .leading, spacing: Space.s6) {
            if composition.placement == .above {
                Spacer(minLength: 0)
                writing(over: false).padding(.horizontal, Space.margin)
                Plate(photo: day.photo, room: room, fill: false)
                    .frame(width: size.width, height: height)
                Spacer(minLength: 0)
            } else {
                Spacer(minLength: 0)
                Plate(photo: day.photo, room: room, fill: false)
                    .frame(width: size.width, height: height)
                if dressed {
                    writing(over: false)
                        .padding(.horizontal, Space.margin)
                        .transition(.opacity)
                }
                Spacer(minLength: 0)
            }
        }
        .frame(width: size.width, height: size.height)
    }

    // MARK: The writing

    private func writing(over photograph: Bool) -> some View {
        /* Over a photograph the ink is decided by what is behind it, not by
           the picture's overall lightness — a dark photograph with a bright
           sky exactly where the date goes would otherwise get pale text on
           pale cloud. */
        let ink = photograph
            ? (overlaidOnDark ? Tone.inkNight : Tone.inkDay)
            : room.ink

        /* Over a photograph the ladder is opacity on the primary rather than
           the muted and faint tokens. Those are tuned against a known ground
           and a scrim is not one: a photograph sitting near the light/dark
           threshold gave a mid-grey scrim under a mid-grey "SATURDAY", which
           is the weakest thing on the screen at exactly the moment it should
           not be. Relative opacity keeps the three ranks apart whatever is
           underneath. */
        let muted = photograph ? ink.opacity(0.78) : room.inkMuted
        let faint = photograph ? ink.opacity(0.62) : room.inkFaint

        return VStack(alignment: .leading, spacing: Space.s3) {
            DateMark(
                date: day.date,
                timeZone: timeZone,
                ink: ink,
                muted: muted,
                overlaid: photograph
            )

            /* A fragment, not a caption. No label, no card, no quotation
               marks — §11. Where there is none the space is simply not
               taken. */
            if let note = day.note, !note.isEmpty {
                Text(note)
                    .font(.system(size: Size.lede, design: .serif))
                    .italic()
                    .foregroundStyle(muted)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }

            context(faint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Time, place, weather — §12. The camera is not here; it is technical,
    /// and this is a memory rather than a record of equipment.
    @ViewBuilder
    private func context(_ faint: Color) -> some View {
        let parts = [
            day.capturedAt.map(clock),
            day.place?.label,
            day.weather.flatMap(summary),
        ].compactMap { $0 }

        if !parts.isEmpty {
            Text(parts.joined(separator: "   ·   "))
                .font(Face.mono(Size.micro))
                .tracking(0.3)
                .foregroundStyle(faint)
                .padding(.top, Space.s1)
        }
    }

    private func summary(_ weather: Weather) -> String? {
        guard !weather.isEmpty else { return nil }
        return [
            weather.conditions,
            weather.temperatureC.map { "\(Int($0.rounded()))°" },
        ].compactMap { $0 }.joined(separator: " ")
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

/*
 The photograph itself.

 Replaces `AsyncImage`, which starts downloading when the view appears and
 caches by URL — neither of which survives a paging scroll over signed,
 expiring URLs. See Photographs.swift.
 */
struct Plate: View {
    let photo: ResolvedPhoto
    let room: Room
    /// True for a full-bleed portrait, which fills and crops; false
    /// everywhere else, which fits and never crops.
    var fill: Bool = false

    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if image == nil, let inline = photo.placeholder,
               let blurred = InlineImage.decode(inline) {
                Image(uiImage: blurred)
                    .resizable()
                    .aspectRatio(photo.aspect, contentMode: fill ? .fill : .fit)
                    .blur(radius: 20)
                    .transition(.opacity)
            }

            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: fill ? .fill : .fit)
                    .transition(.opacity)
            } else if photo.forThisScreen == nil, photo.processing != .ready {
                Signage(text: "Still arriving", tone: room.inkFaint)
            }
        }
        .animation(Tempo.out, value: image != nil)
        .task(id: photo.assetId) {
            if let held = await Photographs.shared.cached(photo.assetId) {
                image = held
                return
            }
            guard let url = photo.forThisScreen else { return }
            image = await Photographs.shared.image(for: photo.assetId, at: url)
        }
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
 A gradient that makes writing legible over a photograph.

 Not a blur — §6 rejects those, and the argument holds here: the point is to
 let the writing be read, and a blur smears the picture to do it.

 The colour follows what is underneath. Over a dark area it darkens, over a
 bright one it lightens, so the band reads as the photograph shading off at
 its edge rather than as a panel laid on top. Always darkening would be more
 reliable and would put a heavy bar across the top of every bright sky.
 */
struct Scrim: View {
    let dark: Bool
    /// The edge the scrim is *strongest* at, and fades away from.
    ///
    /// Named for the strong end rather than the gradient's start point,
    /// which is what it was and which I read backwards the first time —
    /// the rail's scrim came out transparent at the top and opaque at the
    /// bottom, leaving a hard line under it and doing nothing for the
    /// writing it was there to lift.
    let strongest: Edge

    enum Edge { case top, bottom }

    var body: some View {
        LinearGradient(
            colors: [
                base.opacity(0.78),
                base.opacity(0.40),
                base.opacity(0),
            ],
            startPoint: strongest == .top ? .top : .bottom,
            endPoint: strongest == .top ? .bottom : .top
        )
        .allowsHitTesting(false)
    }

    /* Not pure black and not pure white. The archive's own ground and ink,
       so a scrim over a photograph is the same two colours as everything
       else in the product rather than a third thing. */
    private var base: Color {
        dark ? Color(fixed: 0x0c0c09) : Color(fixed: 0xe8e5da)
    }
}
