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
    /// What shows at the edges as the receding day scales down. The room of
    /// the day being left, not the archive's default — a pale border around
    /// a dark photograph reads as a frame lifting off a page, which is the
    /// wrong idea entirely and only appears mid-gesture where it is hardest
    /// to notice while designing.
    let ground: Color
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
                /* Order matters more than anything else here.

                   This was the other way round — the day leaving on top,
                   translucent, with the arriving one showing through it. Two
                   semi-transparent photographs over each other do not read
                   as one passing in front of another; they read as a
                   dissolve, which is what it looked like. And because the
                   leaving one faded to a fraction rather than to nothing, it
                   was still visibly present when the spring finished and
                   then vanished as the index changed: a blend, and then a
                   pop.

                   The day arriving is on top and it is opaque. It covers.
                   The one behind recedes and is progressively hidden rather
                   than progressively transparent, so by the time the
                   transition completes it is not merely faint — it is
                   underneath, entirely, and swapping the index is invisible. */
                if count > 0 {
                    content(here)
                        .modifier(Leaving(progress: abs(progress), flat: reduceMotion))
                }

                if count > 0, let next = neighbour(after: progress, from: here) {
                    content(next)
                        .modifier(
                            Arriving(
                                progress: abs(progress),
                                fromBelow: progress > 0,
                                height: height,
                                flat: reduceMotion
                            )
                        )
                }
            }
            /* A ground behind both layers. At the ends of the archive the
               drag rubber-bands with nothing behind it, and without this the
               window shows through at the edge — black, on a product that
               does not otherwise contain any. */
            .background(ground)
            .frame(width: screen.size.width, height: height)
            .contentShape(Rectangle())
            #if DEBUG
            /* `-mid <0..1>` freezes the transition part-way so it can be
               looked at. The harness cannot drag, and a transition that can
               only be seen at its two endpoints is a transition nobody has
               actually reviewed. */
            .onAppear {
                guard let i = CommandLine.arguments.firstIndex(of: "-mid"),
                      i + 1 < CommandLine.arguments.count,
                      let fraction = Double(CommandLine.arguments[i + 1])
                else { return }
                offset = -height * CGFloat(fraction)
            }
            #endif
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

 It does not travel and it does not dissolve. It goes back — a little
 smaller, a little dimmer — and is covered by the one arriving.

 The dimming is deliberately slight. It exists so that the receding day reads
 as being *behind* something rather than as being turned down, and most of it
 is never seen anyway: by the time the transition is half done the arriving
 photograph is over most of it.
 */
private struct Leaving: ViewModifier {
    let progress: CGFloat
    let flat: Bool

    func body(content: Content) -> some View {
        content
            .scaleEffect(flat ? 1 : 1 - progress * 0.08)
            .opacity(Double(flat ? 1 - progress : 1 - progress * 0.30))
    }
}

/*
 The day arriving.

 Opaque, and it moves the whole way. Starting it at a fraction of the screen
 and fading it in is what produced a blend: a photograph that is only ever
 partly there never occludes the one behind it, and the eye reads two images
 at once rather than one in front of the other.

 It is slightly small as it arrives and reaches full size exactly as it
 lands, which is the only part of this that is decoration — it gives the
 movement somewhere to settle into rather than simply stopping.
 */
private struct Arriving: ViewModifier {
    let progress: CGFloat
    let fromBelow: Bool
    let height: CGFloat
    let flat: Bool

    func body(content: Content) -> some View {
        let remaining = 1 - progress

        return content
            .scaleEffect(flat ? 1 : 0.98 + progress * 0.02)
            .offset(y: flat ? 0 : (fromBelow ? height : -height) * remaining)
            .opacity(flat ? Double(progress) : 1)
    }
}
