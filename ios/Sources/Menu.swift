import SwiftUI

/*
 Where to go, as typography.

 The previous brief (§20) asked that the menu itself feel designed, and named
 what to avoid: rounded feature cards, icon grids, tab bars, a hamburger
 sheet of plain text links. What is left, once those are gone, is the
 destinations set large and the photograph stepping back behind them.

 It is not a sheet over the viewer. The archive recedes — scaled down and
 dimmed, still visible — and the names arrive in the space it gives up. That
 is the same relationship as the day transition: nothing covers anything;
 something goes back and something comes forward.

 Most of these do not exist yet, and they are listed anyway. An honest empty
 room is better than a menu that pretends to be full, and the shape of the
 architecture is a decision worth being able to look at now.
 */

struct Menu: View {
    let room: Room
    let onGo: (Destination) -> Void
    let onClose: () -> Void

    enum Destination: String, CaseIterable, Identifiable {
        /* `year` and `calendar` were both here, and they are the same
           screen: a field of every day in a year. The brief names them
           separately (§2, §7) because one emphasises the mosaic and the
           other the year as an object, but one view does both and two
           entries pointing at it would be a menu describing its own
           implementation. */
        case latest, calendar, timeline, map, onThisDay, profile

        var id: String { rawValue }

        var name: String {
            switch self {
            case .latest: return "Latest"
            case .calendar: return "Calendar"
            case .timeline: return "Timeline"
            case .map: return "Map"
            case .onThisDay: return "On this day"
            case .profile: return "Profile"
            }
        }

        /// One line, in the product's register — shown beneath the name, not
        /// on hover, because a phone has no hover and hiding the only
        /// explanation behind a gesture nobody makes is hiding it.
        var note: String {
            switch self {
            case .latest: return "The most recent day recorded."
            case .calendar: return "A year at once, and what is missing from it."
            case .timeline: return "Days, months and years at one scale or another."
            case .map: return "Where the days happened."
            case .onThisDay: return "The same date, in every year that has one."
            case .profile: return "Identity, privacy and what is public."
            }
        }

        var ready: Bool {
            switch self {
            case .latest, .calendar, .timeline: return true
            default: return false
            }
        }
    }

    @State private var arrived = false

    var body: some View {
        ZStack(alignment: .topLeading) {
            /* Not opaque. The archive is still there behind this, receded —
               which is what stops the menu feeling like a different screen
               and makes it feel like the same one, stepped back. */
            room.ground.opacity(0.94).ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Spacer()
                    Button(action: onClose) {
                        Signage(text: "Close", tone: room.inkFaint)
                    }
                }
                .padding(.horizontal, Space.margin)
                .padding(.top, Space.s3)

                Spacer(minLength: Space.s6)

                VStack(alignment: .leading, spacing: Space.s5) {
                    ForEach(Array(Destination.allCases.enumerated()), id: \.element.id) { i, place in
                        Button { onGo(place) } label: {
                            row(place)
                        }
                        .buttonStyle(.plain)
                        .disabled(!place.ready)
                        /* Staggered by index rather than by a hand-written
                           delay each, so adding a destination cannot forget
                           to be animated. */
                        .opacity(arrived ? 1 : 0)
                        .offset(y: arrived ? 0 : 14)
                        .animation(
                            .timingCurve(0.16, 1, 0.3, 1, duration: 0.5)
                                .delay(Double(i) * 0.035),
                            value: arrived
                        )
                    }
                }
                .padding(.horizontal, Space.margin)

                Spacer()
                Spacer()
            }
        }
        .onAppear { arrived = true }
    }

    private func row(_ place: Destination) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(place.name)
                .font(.system(size: place.ready ? 34 : 30, design: .serif))
                .foregroundStyle(place.ready ? room.ink : room.ink.opacity(0.34))

            Text(place.note)
                .font(Face.grotesk(Size.micro))
                .foregroundStyle(room.inkFaint)
                .fixedSize(horizontal: false, vertical: true)

            if !place.ready {
                /* On its own line. Beside the note it collided with any
                   note long enough to wrap, and floated in the middle of
                   the row looking like a stray word.

                   Not a disabled link, either. A destination that does not
                   exist is not something you are forbidden from reaching —
                   it is something that has not been built, and saying so
                   plainly is the register this product uses. */
                Text("NOT YET BUILT")
                    .font(Face.grotesk(Size.micro, weight: .medium))
                    .tracking(Size.micro * Track.signage)
                    .foregroundStyle(room.inkFaint.opacity(0.55))
                    .padding(.top, 3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}
