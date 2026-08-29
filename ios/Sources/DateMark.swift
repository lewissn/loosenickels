import SwiftUI

/*
 The date, as the product's signature.

 §10 of the brief: "Friday 14 August 2026" works and reads like a blog
 heading. It asks for something graphical and recognisable, and lists four
 candidates without choosing between them.

 All four were built and looked at against real photographs. What follows is
 the one that won and why, because the reasoning is the useful part — the
 next person to open this file will want to change it, and should know what
 has already been tried.

   FRI 14.08 2026        Reads as a filename. Compact, and the full stops
                         make it look like data about a day rather than a
                         day. Rejected.

   FRIDAY / 14 AUGUST /  Three left-aligned lines. Handsome, and it occupies
   2026                  a third of a phone screen — which over a photograph
                         is a block of interface where the picture should be.
                         Rejected on §2 grounds: the interface wins.

   Very large 14, small  Striking, and the number carries no meaning on its
   supporting text       own. "14" is not a day you remember; the fourteenth
                         of August is. Rejected.

   14 / August 2026      Chosen, adapted. The day large enough to be the
   Friday                anchor, month and year beside it at reading size,
                         weekday below in the signage face. Two lines, not
                         three. The eye lands on the number, then reads the
                         rest without a second glance.

 The adaptation: the weekday sits *under* the month and year rather than
 beside them, in the grotesk at label size. That keeps the serif line to one
 measure and gives the block a stable left edge whatever the month is called
 — September and May would otherwise change the width of the whole thing.
 */

struct DateMark: View {
    let date: CalendarDate
    let timeZone: TimeZone
    var ink: Color
    var muted: Color
    /// Portraits carry the mark over the photograph and can afford less
    /// weight; on the ground it can be a touch larger.
    var overlaid: Bool = false

    private var parts: (day: String, monthYear: String, weekday: String) {
        let spelled = date.spelled(in: timeZone)   // "Friday 14 August 2026"
        let words = spelled.split(separator: " ").map(String.init)
        guard words.count == 4 else { return (spelled, "", "") }
        return (words[1], "\(words[2]) \(words[3])", words[0])
    }

    var body: some View {
        let (day, monthYear, weekday) = parts

        HStack(alignment: .firstTextBaseline, spacing: Space.s3) {
            Text(day)
                .font(.system(size: overlaid ? 62 : 68, design: .serif))
                /* Tightened: at this size the default fitting leaves the
                   numerals looking loosely set beside a smaller line. */
                .tracking(-1.5)
                .foregroundStyle(ink)

            VStack(alignment: .leading, spacing: 1) {
                Text(monthYear)
                    .font(.system(size: 20, design: .serif))
                    .foregroundStyle(ink)

                Text(weekday.uppercased())
                    .font(Face.grotesk(Size.micro, weight: .medium))
                    .tracking(Size.micro * Track.signage)
                    .foregroundStyle(muted)
            }
            /* Nudged down so the month sits on the numeral's own baseline
               rather than on the line box's, which leaves it floating. */
            .offset(y: -2)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(date.spelled(in: timeZone))
    }
}
