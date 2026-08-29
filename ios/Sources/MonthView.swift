import SwiftUI

/*
 A month, between the pattern and the photograph.

 §3. The year is a field you read from arm's length: what it shows is
 attendance, and no single day in it is a picture. The day viewer is one
 photograph and nothing else. The month is the rung between them, and its job
 is the one thing neither of the others does — letting a stretch of days be
 recognisable *as photographs* while still being read as a shape.

 So the cells are portrait rather than square. A square is the year's shape,
 because a square is a mark; a photograph is taller than it is wide more often
 than not, and giving the month cell that proportion is the difference between
 a grid of swatches and a contact sheet. At this size a picture is not legible
 but it is identifiable — you know which day was the beach — which is exactly
 what §3 asks for.

 Weekday alignment survives from the year, so a month is not a fresh idea
 about time: the same column is the same weekday it was one screen ago. The
 seven initials across the top are the only chrome, and they earn their place
 here where they would be noise above fifty-three rows.

 Dates are set into the cells rather than beside them. A number over the foot
 of its own photograph is a caption; a number in a box beside a photograph is
 a form.
 */

struct MonthView: View {
    let year: Int
    let month: Int
    let summaries: [DaySummary]
    /// The day the reader came from, if they came from one. Held so the month
    /// can say where they are rather than making them find it again.
    let selected: CalendarDate?
    let today: CalendarDate
    let room: Room
    let onOpen: (CalendarDate) -> Void
    /// −1 and +1. The month view does not know what a year boundary is; the
    /// shell does, because only the shell can fetch across one.
    let onStep: (Int) -> Void
    let onClose: () -> Void

    private let columns = 7
    private let gap: CGFloat = 1

    @State private var drag: CGFloat = 0

    private var recorded: [String: DaySummary] {
        Dictionary(uniqueKeysWithValues: summaries.map { ($0.date.value, $0) })
    }

    /// Only this month's, and only for the count — the caller hands over a
    /// whole year because a year is one request, not because the month should
    /// draw all of it.
    private var mine: [DaySummary] {
        let prefix = String(format: "%04d-%02d", year, month)
        return summaries.filter { $0.date.value.hasPrefix(prefix) }
    }

    var body: some View {
        GeometryReader { screen in
            /* Edge to edge, where the year is inset behind a gutter of month
               names. The month has no gutter to keep — it is one month — and
               spending that width on the photographs is most of what makes
               this screen a closer look rather than a smaller year. */
            let side = (screen.size.width - gap * CGFloat(columns - 1)) / CGFloat(columns)
            /* Four to three, upright. See above: the proportion is the whole
               argument for the month existing. */
            let tall = side * 4 / 3

            VStack(alignment: .leading, spacing: Space.s6) {
                header

                VStack(alignment: .leading, spacing: Space.s3) {
                    initials(side: side)

                    VStack(spacing: gap) {
                        ForEach(Array(weeks.enumerated()), id: \.offset) { _, week in
                            HStack(spacing: gap) {
                                ForEach(Array(week.enumerated()), id: \.offset) { _, day in
                                    cell(day, side: side, tall: tall)
                                }
                            }
                        }
                    }
                }

                /* §24. A month is over when it is over, and the screen is
                   allowed to say so by stopping. Filling the foot of a short
                   month would be filling it. */
                Spacer(minLength: 0)
            }
            .padding(.top, Space.s5)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(room.ground)
            /* The month moves with the hand and settles back if the hand
               changes its mind. Damped hard, because this is a page turn and
               not a scroll — it should feel like the month is heavier than
               the finger. */
            .offset(x: drag * 0.30)
            .animation(Tempo.out, value: drag)
            .gesture(
                DragGesture(minimumDistance: 18)
                    .onChanged { drag = $0.translation.width }
                    .onEnded { done in
                        let far = abs(done.translation.width) > 70
                        let fast = abs(done.predictedEndTranslation.width) > 240
                        if far || fast {
                            onStep(done.translation.width < 0 ? 1 : -1)
                        }
                        drag = 0
                    }
            )
        }
    }

    // MARK: The month

    @ViewBuilder
    private func cell(_ day: CalendarDate?, side: CGFloat, tall: CGFloat) -> some View {
        if let day, let summary = recorded[day.value] {
            Button { onOpen(day) } label: {
                /* The date goes on in an overlay rather than inside the
                   stack. A photograph set to fill is wider than its cell, so
                   a stack containing one is wider than its cell too, and
                   anything aligned to that stack's leading edge is aligned to
                   a point off the side of the screen — the number was there
                   the whole time, cropped away by the same clip that makes
                   the picture fit. Overlaying after the frame gives the
                   caption the cell's edges rather than the picture's. */
                Thumbnail(summary: summary, room: room)
                    .frame(width: side, height: tall)
                    .clipped()
                    .overlay(alignment: .bottom) {
                        /* Just enough dark under the number to hold it
                           against a bright sky, and not one step more — the
                           point of the cell is the photograph. */
                        LinearGradient(
                            colors: [.black.opacity(0.55), .black.opacity(0)],
                            startPoint: .bottom,
                            endPoint: .top
                        )
                        .frame(height: tall * 0.45)
                        .allowsHitTesting(false)
                    }
                    .overlay(alignment: .bottomLeading) {
                        number(day, tone: .white.opacity(0.92))
                    }
                    .overlay(marking(day))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(day.spelled(in: .gmt))
        } else if let day {
            /* A day that happened and holds nothing. It keeps its number and
               its place; §3 asks for gaps that are subtle, and a date with
               nothing behind it is already the whole statement. */
            Rectangle()
                .fill(day == selected ? Tone.oxideSoft : room.ink.opacity(0.045))
                .frame(width: side, height: tall)
                .overlay(alignment: .bottomLeading) {
                    number(day, tone: room.inkFaint.opacity(0.55))
                }
        } else {
            Color.clear.frame(width: side, height: tall)
        }
    }

    private func number(_ day: CalendarDate, tone: Color) -> some View {
        Text(String(Int(day.value.suffix(2)) ?? 0))
            .font(Face.grotesk(Size.micro, weight: .medium))
            .tracking(Size.micro * Track.accession)
            .foregroundStyle(day == today ? Tone.oxide : tone)
            .padding(.leading, 4)
            .padding(.bottom, 3)
    }

    /* The day being looked at, marked twice over because an empty cell and a
       photograph need opposite treatments. Around a photograph a hairline is
       the only thing that will read at all; around an empty cell the same
       hairline is a box drawn around nothing, which is the universal shape of
       a form field that has been filled in wrong. The empty cell is tinted
       instead — see above — and only the recorded one is outlined. */
    @ViewBuilder
    private func marking(_ day: CalendarDate) -> some View {
        if day == selected {
            Rectangle().strokeBorder(Tone.oxide, lineWidth: 1.5)
        }
    }

    private func initials(side: CGFloat) -> some View {
        HStack(spacing: gap) {
            ForEach(Array(["M","T","W","T","F","S","S"].enumerated()), id: \.offset) { _, letter in
                Text(letter)
                    .font(Face.grotesk(Size.micro, weight: .medium))
                    .tracking(Size.micro * Track.signage)
                    .foregroundStyle(room.inkFaint.opacity(0.5))
                    .frame(width: side)
            }
        }
    }

    // MARK: Around it

    private var header: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            HStack(alignment: .firstTextBaseline) {
                /* The month is the title and the year is an aside. Tapping the
                   year is how you get back out to it, which means the way up
                   is the thing you would point at anyway. */
                Text(Self.months[max(0, min(11, month - 1))])
                    .font(.system(size: 44, design: .serif))
                    .tracking(44 * Track.display)
                    .foregroundStyle(room.ink)

                Button(action: onClose) {
                    Text(String(year))
                        .font(.system(size: 19, design: .serif))
                        .foregroundStyle(room.inkFaint)
                }
                .buttonStyle(.plain)

                Spacer()

                Button(action: onClose) {
                    Signage(text: "Year", tone: room.inkFaint)
                }
            }

            Signage(
                text: mine.count == 1 ? "1 day recorded" : "\(mine.count) days recorded",
                tone: room.inkFaint
            )
        }
        .padding(.horizontal, Space.margin)
    }

    // MARK: The calendar itself

    /// The weeks this month touches, Monday first, with nils either side of
    /// it. Same reasoning as the year, and the same trap: `component(.weekday:)`
    /// counts from Sunday whatever `firstWeekday` is set to.
    private var weeks: [[CalendarDate?]] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2
        calendar.timeZone = .gmt

        guard let first = calendar.date(from: DateComponents(year: year, month: month, day: 1)),
              let range = calendar.range(of: .day, in: .month, for: first)
        else { return [] }

        let lead = (calendar.component(.weekday, from: first) + 5) % 7
        var days: [CalendarDate?] = Array(repeating: nil, count: lead)

        for offset in 0..<range.count {
            guard let day = calendar.date(byAdding: .day, value: offset, to: first) else { continue }
            days.append(CalendarDate(day, in: .gmt))
        }
        while days.count % 7 != 0 { days.append(nil) }

        return stride(from: 0, to: days.count, by: 7).map {
            Array(days[$0..<min($0 + 7, days.count)])
        }
    }

    private static let months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ]
}
