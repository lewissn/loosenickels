import SwiftUI

/*
 A chronology, not a gallery.

 §1 rules out almost everything by name — identical rounded cards, Instagram
 grids, masonry, a `LazyVGrid` with captions underneath — and asks instead for
 an "irregular but ordered photographic field" with "varying image scale based
 on available space".

 That description has one honest answer: justified rows. Consecutive days are
 gathered until they fill the width, then scaled to whatever common height
 makes them fill it exactly. Every photograph keeps its own proportion,
 nothing is cropped, and the sizes vary because the pictures do — a run of
 portraits makes a tall row, a landscape and two squares a short one. The
 irregularity is the archive's, not a decoration applied to it.

 A grid would have to crop to squares to stay a grid. Masonry would break
 chronology, since its columns advance at different rates and the eye stops
 being able to read order. Rows keep time strictly left to right, top to
 bottom, which is the one thing a chronology cannot give up.

 Months anchor it. The name is set in the margin at the month's first row and
 nowhere else, and the year appears only when it changes — §1 asks for date
 labels as anchors and subtle year markers, and anything more becomes chrome
 between the reader and a continuous field.
 */

struct Timeline: View {
    let summaries: [DaySummary]
    let room: Room
    let onOpen: (CalendarDate) -> Void
    let onClose: () -> Void

    /// What a row aims for before it is scaled to fit. Not a maximum: a row
    /// of wide photographs settles shorter and a row of tall ones taller,
    /// which is where the rhythm comes from.
    /* Three photographs to a row reads as a gallery of large images; five
       reads as a field you are moving through. §1 asks for a chronology
       rather than a gallery, and the difference between the two turned out
       to be almost entirely this number. */
    private let preferredRowHeight: CGFloat = 118

    /// Hairline. Enough that two photographs do not bleed into one, far too
    /// little to read as a gutter between cards.
    private let gap: CGFloat = 2

    var body: some View {
        GeometryReader { screen in
            let width = screen.size.width - Space.margin * 2

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: []) {
                    header

                    ForEach(months, id: \.key) { month in
                        anchor(month.key, first: month.key == months.first?.key)

                        ForEach(Array(rows(of: month.days, width: width).enumerated()), id: \.offset) { _, row in
                            HStack(spacing: gap) {
                                ForEach(row.days) { day in
                                    Button { onOpen(day.date) } label: {
                                        Thumbnail(summary: day, room: room)
                                            .frame(
                                                width: spanned(day, at: row.height),
                                                height: row.height
                                            )
                                            .clipped()
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(day.date.value)
                                }
                            }
                            .padding(.bottom, gap)
                        }
                    }
                }
                .padding(.horizontal, Space.margin)
                .padding(.bottom, Space.s8)
            }
            .background(room.ground)
        }
    }

    // MARK: Anchors

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Timeline")
                .font(.system(size: 40, design: .serif))
                .foregroundStyle(room.ink)
            Spacer()
            Button(action: onClose) {
                Signage(text: "Close", tone: room.inkFaint)
            }
        }
        .padding(.top, Space.s5)
        .padding(.bottom, Space.s6)
    }

    /// The month's name, and its year only when the year has changed. A year
    /// repeated above every month is noise; a year that appears exactly when
    /// it turns is a marker.
    private func anchor(_ key: String, first: Bool) -> some View {
        let year = String(key.prefix(4))
        let month = Int(key.suffix(2)) ?? 1
        let changed = first || key.suffix(2) == "01"

        return HStack(alignment: .firstTextBaseline, spacing: Space.s3) {
            Text(Self.months[max(0, min(11, month - 1))])
                .font(.system(size: 22, design: .serif))
                .foregroundStyle(room.ink)

            if changed {
                Text(year)
                    .font(Face.grotesk(Size.micro, weight: .medium))
                    .tracking(Size.micro * Track.signage)
                    .foregroundStyle(room.inkFaint)
            }

            Spacer()
        }
        .padding(.top, Space.s6)
        .padding(.bottom, Space.s3)
    }

    private static let months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]

    // MARK: Grouping and packing

    private struct Month {
        let key: String       // "2026-08"
        let days: [DaySummary]
    }

    private var months: [Month] {
        let ordered = summaries.sorted { $0.date > $1.date }
        var out: [Month] = []
        var current: String?
        var run: [DaySummary] = []

        for day in ordered {
            let key = String(day.date.value.prefix(7))
            if key != current {
                if let current, !run.isEmpty { out.append(Month(key: current, days: run)) }
                current = key
                run = []
            }
            run.append(day)
        }
        if let current, !run.isEmpty { out.append(Month(key: current, days: run)) }
        return out
    }

    private struct Row {
        let days: [DaySummary]
        let height: CGFloat
    }

    /// Named for what it produces rather than `width`, which the layout
    /// already uses for the space available and which shadowed this.
    private func spanned(_ day: DaySummary, at height: CGFloat) -> CGFloat {
        height * aspect(of: day)
    }

    private func aspect(of day: DaySummary) -> CGFloat {
        guard day.height > 0 else { return 1 }
        /* Clamped. One panorama in a row of portraits would otherwise take
           the entire width and squash its neighbours to slivers — the row is
           a shared space and no photograph gets to own it. */
        return max(0.5, min(2.4, CGFloat(day.width) / CGFloat(day.height)))
    }

    /**
     Pack consecutive days into rows that fill the width exactly.

     Days are added until their combined width at the preferred height
     overflows, then the row is scaled to whatever height makes it fit. The
     last row of a month is left at its natural height rather than stretched:
     a single photograph scaled to span the screen is not a row, it is an
     accident, and it reads as one.
     */
    private func rows(of days: [DaySummary], width: CGFloat) -> [Row] {
        var out: [Row] = []
        var run: [DaySummary] = []
        var sum: CGFloat = 0

        for day in days {
            run.append(day)
            sum += aspect(of: day)

            let gaps = gap * CGFloat(run.count - 1)
            if sum * preferredRowHeight + gaps >= width {
                out.append(Row(days: run, height: (width - gaps) / sum))
                run = []
                sum = 0
            }
        }

        if !run.isEmpty {
            let gaps = gap * CGFloat(run.count - 1)
            let ideal = (width - gaps) / sum
            out.append(Row(days: run, height: min(ideal, preferredRowHeight)))
        }

        return out
    }
}

/// One day in a field. Shared by the timeline and the year, so a photograph
/// looked at in one is already held when it appears in the other.
struct Thumbnail: View {
    let summary: DaySummary
    let room: Room

    @State private var image: UIImage?

    var body: some View {
        ZStack {
            room.ink.opacity(0.06)

            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .transition(.opacity)
            }
        }
        .animation(Tempo.out, value: image != nil)
        .task(id: summary.id) {
            guard let url = summary.thumbnailUrl else { return }
            if let held = await Photographs.shared.cached(summary.id) {
                image = held
                return
            }
            image = await Photographs.shared.image(for: summary.id, at: url)
        }
    }
}
