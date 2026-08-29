import SwiftUI
import MapKit

/*
 Places, which nobody made.

 §5. The requirement under everything else here is that a place must feel
 generated from the days rather than maintained as a folder. That is not a
 visual decision — it decides what a place *is*. There is no place record in
 this schema and there should not be one: a place is what you get when the
 days that share a name are stood next to each other, and it comes into
 existence the third time you photograph the same town without anyone
 declaring anything.

 Which means places appear and merge and disappear on their own, and a place
 with one day in it is not a place yet. Two is the floor. It is arbitrary and
 it is the difference between a page of recurring chapters and a page listing
 everywhere you have ever been once.

 The index is not cards. A card is a thing you pick from a set of like things,
 and these are not alike — they are chapters of different lengths, and what
 distinguishes them is the photographs and the geography, not a rounded
 rectangle with a chevron. So each is a band the full width of the screen with
 its name set across the photograph, which is how a chapter opens.
 */

/// A place, assembled from the days that happened there.
struct Chapter: Identifiable, Equatable {
    let name: String
    /// Newest first, throughout.
    let days: [PlacedDay]

    var id: String { name }

    var centre: CLLocationCoordinate2D {
        CLLocationCoordinate2D(
            latitude: days.map(\.coordinates.lat).reduce(0, +) / Double(days.count),
            longitude: days.map(\.coordinates.lon).reduce(0, +) / Double(days.count)
        )
    }

    /// The years this place has been in a life, in order. Not a range: a
    /// place visited in 2021 and again in 2026 is not a place you were at
    /// for five years, and "2021–2026" would say it was.
    var years: [Int] {
        Array(Set(days.map(\.date.year))).sorted()
    }

    /// "2021, 2024–2026" — runs collapsed, gaps kept. The gaps are the shape
    /// of the returning, which is the whole subject of the page.
    var spelledYears: String {
        var runs: [[Int]] = []
        for year in years {
            if let last = runs.last?.last, year == last + 1 {
                runs[runs.count - 1].append(year)
            } else {
                runs.append([year])
            }
        }
        return runs.map { run in
            run.count == 1
                ? String(run[0])
                : "\(run[0])–\(run[run.count - 1])"
        }
        .joined(separator: ", ")
    }

    /// Assemble from days. Nothing is stored; this is the whole of what a
    /// place is in this archive.
    static func gathered(from days: [PlacedDay]) -> [Chapter] {
        var byName: [String: [PlacedDay]] = [:]
        for day in days {
            guard let name = day.name else { continue }
            byName[name, default: []].append(day)
        }

        return byName
            .filter { $0.value.count > 1 }
            .map { name, days in
                Chapter(name: name, days: days.sorted { $0.date > $1.date })
            }
            /* By how recently you were there, not alphabetically. An index
               ordered A to Z is a directory; this one opens on where you
               have been lately, which is what a person is looking for. */
            .sorted { ($0.days[0].date, $0.name) > ($1.days[0].date, $1.name) }
    }
}

// MARK: - The index

struct PlacesView: View {
    let days: [PlacedDay]
    let room: Room
    let onOpen: (Chapter) -> Void
    let onClose: () -> Void

    private var chapters: [Chapter] { Chapter.gathered(from: days) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s6) {
                heading

                if chapters.isEmpty {
                    empty
                } else {
                    VStack(spacing: Space.s5) {
                        ForEach(chapters) { chapter in
                            Button { onOpen(chapter) } label: {
                                band(chapter)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.bottom, Space.s8)
        }
        .background(room.ground)
    }

    /// A chapter opening: the most recent photograph from the place, full
    /// width, with the name across it.
    private func band(_ chapter: Chapter) -> some View {
        ZStack(alignment: .bottomLeading) {
            Sheet(rendition: chapter.days[0].large ?? chapter.days[0].small, room: room)
                .frame(height: 190)
                .frame(maxWidth: .infinity)
                .clipped()

            /* Held to the foot rather than run over the whole band. Across
               the full height it darkens two thirds of the photograph, and a
               chapter opening whose picture has been dimmed to make room for
               its title is a title with a picture behind it — which is the
               opposite arrangement to the one intended. */
            LinearGradient(
                colors: [.black.opacity(0.60), .black.opacity(0)],
                startPoint: .bottom,
                endPoint: .top
            )
            .frame(height: 96)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .allowsHitTesting(false)

            VStack(alignment: .leading, spacing: Space.s1) {
                Text(chapter.name)
                    .font(.system(size: 30, design: .serif))
                    .foregroundStyle(.white)

                Signage(
                    text: "\(chapter.spelledYears)  ·  \(chapter.days.count) days",
                    tone: .white.opacity(0.72)
                )
            }
            .padding(Space.margin)
        }
        .frame(height: 190)
        .clipped()
    }

    private var heading: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: Space.s1) {
                Text("Places")
                    .font(.system(size: 44, design: .serif))
                    .tracking(44 * Track.display)
                    .foregroundStyle(room.ink)

                Signage(
                    text: chapters.count == 1
                        ? "1 place returned to"
                        : "\(chapters.count) places returned to",
                    tone: room.inkFaint
                )
            }

            Spacer()

            Button(action: onClose) {
                Signage(text: "Close", tone: room.inkFaint)
            }
        }
        .padding(.horizontal, Space.margin)
        .padding(.top, Space.s5)
    }

    /// §25. What is missing is stated once and not dressed up. A place needs
    /// to have been returned to, and saying so is the whole explanation.
    private var empty: some View {
        Text("A place appears here once two days have happened in it.")
            .font(.system(size: Size.lede, design: .serif))
            .foregroundStyle(room.inkFaint)
            .padding(.horizontal, Space.margin)
            .padding(.top, Space.s6)
    }
}

// MARK: - One place

struct PlaceView: View {
    let chapter: Chapter
    let room: Room
    let onOpen: (CalendarDate) -> Void
    let onClose: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s6) {
                heading
                context
                sequence
            }
            .padding(.bottom, Space.s8)
        }
        .background(room.ground)
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack(alignment: .firstTextBaseline) {
                Spacer(minLength: 0)
                Button(action: onClose) {
                    Signage(text: "Places", tone: room.inkFaint)
                }
            }

            Text(chapter.name)
                .font(.system(size: 44, design: .serif))
                .tracking(44 * Track.display)
                .foregroundStyle(room.ink)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: Space.s4) {
                Signage(text: chapter.spelledYears, tone: room.inkFaint)
                Signage(
                    text: chapter.days.count == 1
                        ? "1 day" : "\(chapter.days.count) days",
                    tone: room.inkFaint
                )
            }
        }
        .padding(.horizontal, Space.margin)
        .padding(.top, Space.s5)
    }

    /// Quiet map context. Not a map you can use — one you can read. It says
    /// where this is in a way no place name does, and then stops: no
    /// controls, no interaction, no photographs on it, because the
    /// photographs are directly below and putting them here as well would be
    /// saying the same thing twice at two sizes.
    private var context: some View {
        Map(
            initialPosition: .region(
                MKCoordinateRegion(
                    center: chapter.centre,
                    span: MKCoordinateSpan(latitudeDelta: 0.4, longitudeDelta: 0.4)
                )
            ),
            interactionModes: []
        )
        .mapStyle(
            .standard(elevation: .flat, emphasis: .muted, pointsOfInterest: .excludingAll)
        )
        .mapControlVisibility(.hidden)
        /* Quieter than the map page, because this one is not being read for
           where things are — only for roughly where this is. Pale enough
           that the motorway shields and road numbers, which no map style
           will turn off, sink to about the weight of a watermark. */
        .saturation(0.18)
        .overlay(room.ground.opacity(0.34).allowsHitTesting(false))
        .overlay {
            /* One mark, where the place is. A dot rather than a photograph:
               see above. */
            Circle()
                .fill(Tone.oxide)
                .frame(width: 9, height: 9)
                .shadow(color: .black.opacity(0.3), radius: 3)
        }
        /* A definite width rather than a flexible one, on purpose. A map
           view is another thing that answers a height-only proposal with a
           width of its own choosing, and `containerRelativeFrame` settles it
           against the scroll view rather than trusting it. See `Sheet` for
           what an unconstrained width did to this page. */
        .frame(height: 150)
        .containerRelativeFrame(.horizontal)
        .clipped()
        .allowsHitTesting(false)
    }

    /**
     The days, composed rather than tiled.

     A uniform grid would be the obvious thing and it is what makes a place
     look like a folder — every day the same size means no day is worth more
     than any other, which is true of a file listing and false of a life. So
     the sequence runs in a repeating measure: one full width, then two, then
     three, then two. It is regular enough not to look like an accident and
     irregular enough that scrolling it has a rhythm.

     Newest first, because a place is a thing you are still going to.
     */
    private var sequence: some View {
        VStack(spacing: Space.s2) {
            ForEach(Array(groups.enumerated()), id: \.offset) { _, group in
                if group.count == 1 {
                    plate(group[0], height: 420, caption: true)
                        .padding(.horizontal, Space.margin)
                } else {
                    HStack(spacing: Space.s2) {
                        ForEach(group) { day in
                            plate(day, height: group.count == 2 ? 210 : 140, caption: false)
                        }
                    }
                    .padding(.horizontal, Space.margin)
                }
            }
        }
    }

    private func plate(_ day: PlacedDay, height: CGFloat, caption: Bool) -> some View {
        Button { onOpen(day.date) } label: {
            VStack(alignment: .leading, spacing: Space.s2) {
                Sheet(
                    rendition: height > 200 ? (day.large ?? day.small) : (day.small ?? day.large),
                    room: room
                )
                .frame(maxWidth: .infinity)
                .frame(height: height)
                .clipped()

                if caption {
                    Signage(text: day.date.spelled(in: .gmt), tone: room.inkFaint)
                }
            }
        }
        .buttonStyle(.plain)
    }

    /// One, two, three, two — and never a row left with a single orphan on
    /// it, which is the one arrangement that reads as a mistake.
    private var groups: [[PlacedDay]] {
        let measure = [1, 2, 3, 2]
        var out: [[PlacedDay]] = []
        var index = 0
        var beat = 0

        while index < chapter.days.count {
            let want = measure[beat % measure.count]
            let left = chapter.days.count - index
            let take = left < want ? left : want
            out.append(Array(chapter.days[index..<(index + take)]))
            index += take
            beat += 1
        }
        return out
    }
}

// MARK: - Shared

/// A photograph filling whatever it is given, held by asset id.
private struct Sheet: View {
    let rendition: Rendition?
    let room: Room

    @State private var image: UIImage?

    var body: some View {
        /* The photograph is an overlay on the ground, not a sibling of it.

           A resizable image set to fill answers a proposal with whatever
           size covers both dimensions, and that is routinely wider than it
           was offered: a square photograph asked for 172 by 210 comes back
           210 by 210. Stacked, it makes the stack that wide. `.frame(maxWidth:
           .infinity)` does not cap it — that reads as "no wider than
           infinity" and reports back whatever the child said — and
           `.clipped()` only trims what is drawn, never what was claimed. So
           a row of three photographs quietly measured wider than the screen,
           the scroll view widened its whole column to fit, and every heading
           and caption on the page was centred against a width that was not
           there. It presents as a page shifted left with both edges cut, and
           looks for all the world like a broken transition.

           An overlay is measured by its parent and cannot argue. The ground
           takes the proposal, the photograph is clipped to it, and the width
           the row reports is the width it was given. */
        Rectangle()
            .fill(room.ink.opacity(0.07))
            .overlay {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .transition(.opacity)
                }
            }
            .clipped()
            .animation(Tempo.out, value: image != nil)
        .task(id: rendition?.id) {
            guard let rendition else { return }
            if let already = await Photographs.shared.cached(rendition.id) {
                image = already
                return
            }
            image = await Photographs.shared.image(for: rendition.id, at: rendition.url)
        }
    }
}
