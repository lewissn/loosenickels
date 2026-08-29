import SwiftUI

/*
 Moving between days.

 §15–17. A paging `ScrollView` got the mechanics right and the feeling wrong:
 one screen slides off, the next slides on, and the two are strangers passing.
 It also cannot be told anything about velocity — the system owns the physics,
 and a fifth fast swipe plays at exactly the pace of the first.

 So the days are stacked rather than queued, and the gesture drives the stack
 directly.

 The day being left does not slide away. It recedes — scales down a little,
 loses light — and the next one rises over it from below. Which is what makes
 the movement feel like depth rather than like pages: nothing exits stage
 left, one thing goes back and another comes forward.

 Everything below is a function of `progress`, which is the finger's distance
 as a fraction of the screen. Drag a third of the way and the transition is a
 third done. Let go early and it returns. Nothing is played *at* the reader
 after they have stopped touching it — the only animation is the settle, and
 it is short.
 */

struct Viewer<Content: View>: View {
    let count: Int
    @Binding var index: Int
    /// Built on demand so only the two or three days on screen exist.
    let content: (Int) -> Content

    @State private var offset: CGFloat = 0
    @State private var settling = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// How far a drag must go to commit, as a fraction of the screen. A
    /// quarter: far enough that a graze does not move the archive, close
    /// enough that a deliberate flick never feels resisted.
    private let threshold: CGFloat = 0.25

    /// Points per second past which a short drag still commits. Below this a
    /// small movement is somebody looking rather than travelling.
    private let escapeVelocity: CGFloat = 520

    var body: some View {
        GeometryReader { screen in
            let height = screen.size.height
            let progress = max(-1, min(1, -offset / height))

            /* Clamped rather than trusted. The caller is meant to guarantee
               a valid index and did not, once, at launch — and the failure
               was a crash rather than a blank screen, which is the worst way
               for a view to be wrong about its own bounds. */
            let here = max(0, min(count - 1, index))

            ZStack {
                /* Drawn back to front: the day arriving is beneath the day
                   leaving, and rises through it. */
                if count > 0, let next = neighbour(after: progress, from: here) {
                    content(next)
                        .modifier(Arriving(progress: abs(progress), flat: reduceMotion))
                }

                if count > 0 {
                    content(here)
                        .modifier(Leaving(progress: abs(progress), flat: reduceMotion))
                }
            }
            .frame(width: screen.size.width, height: height)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 8)
                    .onChanged { move in
                        guard !settling else { return }
                        offset = resisted(move.translation.height, height: height)
                    }
                    .onEnded { move in
                        finish(move, height: height)
                    }
            )
        }
    }

    // MARK: Which day is arriving

    private func neighbour(after progress: CGFloat, from here: Int) -> Int? {
        /* Dragging up moves forward through the archive, which is backwards
           through time — the days are newest first, so up goes older. That
           matches the website, where down and right go backward in time. */
        let wanted = progress > 0 ? here + 1 : here - 1
        guard progress != 0, wanted >= 0, wanted < count else { return nil }
        return wanted
    }

    /// Rubber-banding at the ends. Pulling past the newest or oldest day
    /// moves, but grudgingly — the archive has an edge and hiding it makes
    /// the gesture feel broken rather than bounded.
    private func resisted(_ raw: CGFloat, height: CGFloat) -> CGFloat {
        let atEnd = (raw < 0 && index >= count - 1) || (raw > 0 && index <= 0)
        return atEnd ? raw * 0.28 : raw
    }

    // MARK: Letting go

    private func finish(_ move: DragGesture.Value, height: CGFloat) {
        let travelled = -move.translation.height / height
        /* `predictedEndTranslation` is where the system thinks the finger was
           going. The difference between that and where it actually stopped is
           the velocity, and it is what lets a short fast flick commit while a
           long slow drag of the same distance does not. */
        let velocity = (move.predictedEndTranslation.height - move.translation.height) * 4

        let forward = travelled > 0
        let far = abs(travelled) > threshold
        let fast = abs(velocity) > escapeVelocity && (velocity < 0) == forward

        let target = forward ? index + 1 : index - 1
        let possible = target >= 0 && target < count

        guard (far || fast), possible else {
            /* Returns to where it came from. Softer than the commit: coming
               back should feel like nothing happened, not like a decision. */
            withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
                offset = 0
            }
            return
        }

        settling = true

        /* Faster the harder it was thrown — §17. A reader moving quickly
           through years should not wait out the same settle five times, and
           a slow deliberate drag should not snap. */
        let hurried = min(1, abs(velocity) / 2600)
        let response = reduceMotion ? 0.001 : 0.42 - 0.20 * hurried

        withAnimation(.spring(response: response, dampingFraction: 0.90)) {
            offset = forward ? -height : height
        } completion: {
            /* Index and offset change together, in one frame, with no
               animation — the new day is already where the old one was
               going, so moving it back to zero must not be seen. */
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                index = target
                offset = 0
                settling = false
            }
        }
    }
}

// MARK: - The two halves of the movement

/*
 The day being left.

 It does not travel. It goes back: a little smaller, a little dimmer, and
 drifting a fraction in the direction of the gesture — far less than the
 finger, which is what reads as distance rather than as sliding.
 */
private struct Leaving: ViewModifier {
    let progress: CGFloat
    let flat: Bool

    func body(content: Content) -> some View {
        content
            .scaleEffect(flat ? 1 : 1 - progress * 0.06)
            .opacity(Double(1 - progress * (flat ? 1.0 : 0.55)))
            .blur(radius: flat ? 0 : progress * 3)
    }
}

/*
 The day arriving.

 Rises from beneath, already almost the right size — starting it small and
 far away makes the movement a zoom, and this should read as one surface
 passing in front of another rather than as approaching from a distance.
 */
private struct Arriving: ViewModifier {
    let progress: CGFloat
    let flat: Bool

    func body(content: Content) -> some View {
        content
            .scaleEffect(flat ? 1 : 0.97 + progress * 0.03)
            .opacity(Double(flat ? progress : 0.25 + progress * 0.75))
            .offset(y: flat ? 0 : (1 - progress) * 90)
    }
}
