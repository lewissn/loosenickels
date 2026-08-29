import SwiftUI

/*
 The same date, in every year that has one.

 §6. What the brief asks for is a feeling, and it names it precisely: calm
 and slightly uncanny rather than sentimental. That rules out almost every
 convention this idea normally arrives with — the stacked cards, the
 carousel, the swelling label saying how long ago something was. Those all
 work by telling you how to feel about the passage of time. The uncanny
 version does the opposite: it states the fact and lets it sit.

 So the date does not move. Twenty-ninth of August is pinned to the top of
 the screen and stays exactly where it is, in the same weight, while the
 years pass underneath it. Nothing about it animates, ever. That single held
 element is the whole effect — it is the same date each time, and the
 evidence that it is not the same day is entirely in the photographs.

 The years move vertically because time is not a shelf. A horizontal
 carousel is a rack of things to browse; downward is the direction a record
 goes, and paging it one year at a time means arriving somewhere rather than
 scrolling past. Each year recedes as it leaves — smaller and dimmer, not
 slid aside — which is depth rather than sequence, and is the difference
 between looking back through something and flipping through it.

 There is no "5 years ago". The year is written and the arithmetic is left
 to the reader, who can do it and does not need to be told what it means.
 */

struct OnThisDayView: View {
    let month: Int
    let day: Int
    let years: [Anniversary]
    let onOpen: (CalendarDate) -> Void
    let onClose: () -> Void

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()

            if years.isEmpty {
                empty
            } else {
                pages
            }

            /* Fixed. Not pinned by a scroll view, not a navigation title
               that shrinks — drawn outside the scrolling entirely, so there
               is no mechanism by which it could move. */
            heading
        }
        .preferredColorScheme(.dark)
    }

    private var pages: some View {
        ScrollView(.vertical) {
            LazyVStack(spacing: 0) {
                ForEach(years) { year in
                    Page(anniversary: year, onOpen: onOpen)
                        .containerRelativeFrame([.horizontal, .vertical])
                        /* Receding rather than sliding. The year leaving
                           does not travel further than the year arriving —
                           it goes back. */
                        .scrollTransition(.interactive, axis: .vertical) { view, phase in
                            view
                                .opacity(phase.isIdentity ? 1 : 0.35)
                                .scaleEffect(phase.isIdentity ? 1 : 0.90)
                        }
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollIndicators(.hidden)
        .ignoresSafeArea()
    }

    private var heading: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(Self.spelled(month: month, day: day))
                .font(Face.grotesk(Size.small, weight: .medium))
                .tracking(Size.small * Track.signage)
                .foregroundStyle(.white)

            Spacer()

            Button(action: onClose) {
                Signage(text: "Close", tone: .white.opacity(0.75))
            }
        }
        .padding(.horizontal, Space.margin)
        .padding(.top, Space.s5)
        .padding(.bottom, Space.s4)
        .background {
            LinearGradient(
                colors: [.black.opacity(0.55), .black.opacity(0)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea(edges: .top)
            .allowsHitTesting(false)
        }
    }

    /// §25. Said once, plainly, and not made into an invitation.
    private var empty: some View {
        Text("Nothing has happened on this date yet.")
            .font(.system(size: Size.lede, design: .serif))
            .foregroundStyle(.white.opacity(0.7))
            .padding(.horizontal, Space.margin)
    }

    /// "29 AUGUST". The month spelled rather than numbered, because 08/29 is
    /// a field and the twenty-ninth of August is a date.
    private static func spelled(month: Int, day: Int) -> String {
        let months = [
            "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
            "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
        ]
        return "\(day) \(months[max(0, min(11, month - 1))])"
    }
}

// MARK: - One year

private struct Page: View {
    let anniversary: Anniversary
    let onOpen: (CalendarDate) -> Void

    @State private var image: UIImage?

    private var room: Room {
        Room.lit(lightness: anniversary.lightness, tone: anniversary.tone)
    }

    var body: some View {
        Button { onOpen(anniversary.date) } label: {
            /* Ground first, photograph as an overlay on it. A resizable
               image set to fill reports back whatever size covers the
               proposal, which is wider than the proposal more often than
               not, and a page that measures wider than the screen drags
               everything around it out of alignment. An overlay is measured
               by its parent and cannot. */
            Rectangle()
                .fill(room.ground)
                .overlay {
                    if let image {
                        Image(uiImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .transition(.opacity)
                    }
                }
                .clipped()
                /* The scrim is a sibling of the photograph, not the year's
                   background. As a background it is sized to the text, which
                   is a short dark band under one word rather than a foot to
                   the picture — and over a pale photograph that is the
                   difference between white type that reads and white type
                   that is simply lost. */
                .overlay(alignment: .bottom) {
                    LinearGradient(
                        colors: [.black.opacity(0.66), .black.opacity(0)],
                        startPoint: .bottom,
                        endPoint: .top
                    )
                    .frame(height: 260)
                    .allowsHitTesting(false)
                }
                .overlay(alignment: .bottomLeading) { year }
        }
        .buttonStyle(.plain)
        .animation(Tempo.out, value: image != nil)
        .task(id: anniversary.id) {
            guard let held = anniversary.photograph else { return }
            if let already = await Photographs.shared.cached(held.id) {
                image = already
                return
            }
            image = await Photographs.shared.image(for: held.id, at: held.url)
        }
    }

    /// The year, and nothing else. No elapsed time, no day of the week, no
    /// caption — those are all ways of explaining a photograph to somebody
    /// who was there.
    private var year: some View {
        Text(String(anniversary.year))
            .font(.system(size: 64, design: .serif))
            .tracking(64 * Track.display)
            .foregroundStyle(.white)
            .padding(.horizontal, Space.margin)
            .padding(.bottom, Space.s8)
    }
}
