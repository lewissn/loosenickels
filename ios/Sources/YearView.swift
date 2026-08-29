import SwiftUI

/*
 A year, as a field rather than a calendar.

 §2 and §7. The requirement that shapes everything else is that missing days
 remain empty — so the year is drawn as a continuous grid of every day it
 contains, and the days that were not recorded are simply not there. What you
 see from arm's length is the pattern of a life's attendance: dense summers,
 a thin February, a fortnight gone entirely. That pattern is the content.

 Seven columns, one per weekday, running down the year in weeks. Not twelve
 month blocks: a month block resets the alignment every four or five rows and
 the field stops being continuous, which is exactly what makes an ordinary
 calendar read as a form. Here a day occupies the same column all year, so a
 run of Saturdays is a vertical line and the eye can find it.

 Months are named in the margin at the week they begin. No boxes, no rules,
 no headers — §2 asks for months readable without heavy chrome, and a name
 beside the row it starts on is enough.
 */

struct YearView: View {
    let year: Int
    let summaries: [DaySummary]
    let room: Room
    let onOpen: (CalendarDate) -> Void
    let onClose: () -> Void

    /// Columns are weekdays, Monday first — a week that begins on Sunday
    /// splits every weekend across two rows, which breaks the one pattern
    /// most people can actually see in their own year.
    private let columns = 7

    private var recorded: [String: DaySummary] {
        Dictionary(uniqueKeysWithValues: summaries.map { ($0.date.value, $0) })
    }

    var body: some View {
        GeometryReader { screen in
            let margin = Space.margin
            /* The month names live in a gutter rather than above the grid,
               so the field is never interrupted. */
            let gutter: CGFloat = 46
            let side = (screen.size.width - margin * 2 - gutter) / CGFloat(columns)

            ScrollView {
                VStack(alignment: .leading, spacing: Space.s6) {
                    header

                    HStack(alignment: .top, spacing: 0) {
                        months(side: side, gutter: gutter)

                        VStack(spacing: 1) {
                            ForEach(weeks, id: \.first) { week in
                                HStack(spacing: 1) {
                                    ForEach(week, id: \.self) { day in
                                        cell(day, side: side)
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, margin)

                    footing
                }
                .padding(.bottom, Space.s8)
            }
            .background(room.ground)
        }
    }

    // MARK: The field

    @ViewBuilder
    private func cell(_ day: CalendarDate?, side: CGFloat) -> some View {
        if let day, let summary = recorded[day.value] {
            Button { onOpen(day) } label: {
                Thumbnail(summary: summary, room: room)
                    .frame(width: side, height: side)
                    .clipped()
            }
            .buttonStyle(.plain)
            .accessibilityLabel(day.value)
        } else if day != nil {
            /* A day that happened and was not recorded. Barely there: enough
               to keep the grid legible as a grid, far too little to read as
               a thing missing. A gap is part of the record, not a reproach. */
            Rectangle()
                .fill(room.ink.opacity(0.045))
                .frame(width: side, height: side)
        } else {
            /* Before the first of January or after the thirty-first of
               December. Nothing at all — the year has edges and they are not
               absences. */
            Color.clear.frame(width: side, height: side)
        }
    }

    private func months(side: CGFloat, gutter: CGFloat) -> some View {
        VStack(spacing: 1) {
            ForEach(Array(weeks.enumerated()), id: \.offset) { index, week in
                /* A month is named on the row where its first day falls, and
                   nowhere else. */
                let starting = week.compactMap { $0 }.first { day in
                    Int(day.value.suffix(2)) == 1
                }

                Text(starting.map { monthName(of: $0) } ?? "")
                    .font(Face.grotesk(Size.micro, weight: .medium))
                    .tracking(Size.micro * Track.signage)
                    .foregroundStyle(room.inkFaint)
                    .frame(width: gutter, height: side, alignment: .leading)
            }
        }
    }

    // MARK: Around it

    private var header: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            HStack(alignment: .firstTextBaseline) {
                Text(String(year))
                    .font(.system(size: 64, design: .serif))
                    .tracking(-1.5)
                    .foregroundStyle(room.ink)

                Spacer()

                Button(action: onClose) {
                    Signage(text: "Close", tone: room.inkFaint)
                }
            }

            /* One number, stated plainly, and never as a streak — §8 forbids
               invented psychology and the product forbids keeping score. */
            Signage(
                text: summaries.count == 1
                    ? "1 day recorded"
                    : "\(summaries.count) days recorded",
                tone: room.inkFaint
            )
        }
        .padding(.horizontal, Space.margin)
        .padding(.top, Space.s5)
    }

    /// Deliberately nothing. §24: an empty stretch of screen at the foot of a
    /// year is the year ending, and filling it would be filling it.
    private var footing: some View {
        Color.clear.frame(height: Space.s6)
    }

    // MARK: The calendar itself

    /// Every week of the year, as rows of seven, with nils where the first
    /// and last weeks fall outside it.
    private var weeks: [[CalendarDate?]] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2  // Monday
        calendar.timeZone = .gmt

        guard let first = calendar.date(from: DateComponents(year: year, month: 1, day: 1)),
              let last = calendar.date(from: DateComponents(year: year, month: 12, day: 31))
        else { return [] }

        /* Weekday, remapped so Monday is zero. `component(.weekday:)` counts
           from Sunday whatever `firstWeekday` says, which is a distinction
           that costs an hour the first time it is met. */
        let lead = (calendar.component(.weekday, from: first) + 5) % 7

        var days: [CalendarDate?] = Array(repeating: nil, count: lead)
        var cursor = first
        while cursor <= last {
            days.append(CalendarDate(cursor, in: .gmt))
            cursor = calendar.date(byAdding: .day, value: 1, to: cursor) ?? last.addingTimeInterval(1)
        }
        while days.count % 7 != 0 { days.append(nil) }

        return stride(from: 0, to: days.count, by: 7).map {
            Array(days[$0..<min($0 + 7, days.count)])
        }
    }

    private func monthName(of day: CalendarDate) -> String {
        let months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]
        let month = Int(day.value.dropFirst(5).prefix(2)) ?? 1
        return months[max(0, min(11, month - 1))]
    }
}
