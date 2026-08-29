import SwiftUI

/*
 The versions of a day.

 §19 calls this inherently utilitarian and asks that it still be elegant:
 a large current version with the earlier ones arranged chronologically
 beneath it, and a restrained restore.

 The shape carries the meaning. Replacing a photograph in this product does
 not overwrite anything — it writes a new version and repoints the day — so
 the history is not a log of what was lost, it is the day's other
 photographs, still there. Setting the current one large and the rest as a
 row beneath it says that without a sentence: these are alternatives, and one
 of them is showing.

 Nothing is destructive here and the screen should not imply otherwise. There
 is no delete. Restoring is repointing, and the version being replaced stays
 exactly where it is.
 */

struct RevisionsView: View {
    let date: CalendarDate
    let timeZone: TimeZone
    let revisions: [Revision]
    let room: Room
    let onRestore: (Revision) -> Void
    let onClose: () -> Void

    @State private var restoring: String?

    private var current: Revision? { revisions.first(where: \.isCurrent) }
    private var earlier: [Revision] { revisions.filter { !$0.isCurrent } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s6) {
                header

                if let current {
                    plate(current, height: 320)

                    VStack(alignment: .leading, spacing: 2) {
                        Signage(text: "Showing now", tone: Tone.oxide)
                        stamp(current)
                    }
                }

                if !earlier.isEmpty {
                    VStack(alignment: .leading, spacing: Space.s4) {
                        Signage(
                            text: earlier.count == 1 ? "One earlier version" : "\(earlier.count) earlier versions",
                            tone: room.inkFaint
                        )

                        /* A row rather than a stack. These are alternatives
                           to the one above, not entries in a log, and a
                           vertical list of equal-sized rows would make them
                           read as records of an action. */
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(alignment: .top, spacing: Space.s3) {
                                ForEach(earlier) { revision in
                                    earlierVersion(revision)
                                }
                            }
                        }
                    }
                }

                Text("Nothing here is ever deleted. Restoring shows an earlier photograph again; the one it replaces keeps its place and its number.")
                    .font(Face.grotesk(Size.micro))
                    .foregroundStyle(room.inkFaint)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Space.s4)
            }
            .padding(.horizontal, Space.margin)
            .padding(.bottom, Space.s8)
        }
        .background(room.ground)
    }

    // MARK: Pieces

    private var header: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            HStack(alignment: .firstTextBaseline) {
                Text("Versions")
                    .font(.system(size: 40, design: .serif))
                    .foregroundStyle(room.ink)
                Spacer()
                Button(action: onClose) {
                    Signage(text: "Close", tone: room.inkFaint)
                }
            }
            Text(date.spelled(in: timeZone))
                .font(.system(size: Size.body, design: .serif))
                .foregroundStyle(room.inkMuted)
        }
        .padding(.top, Space.s5)
    }

    private func earlierVersion(_ revision: Revision) -> some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            plate(revision, height: 148)
                .frame(width: 118)

            stamp(revision)

            Button { restoring = revision.id } label: {
                /* Restrained, per §19. A word, in the accent, doing nothing
                   until it is confirmed — this is the only action on the
                   screen and it does not need to look like one. */
                Signage(text: "Restore", tone: Tone.oxide)
            }
            .confirmationDialog(
                "Show this photograph for \(date.spelled(in: timeZone))?",
                isPresented: Binding(
                    get: { restoring == revision.id },
                    set: { if !$0 { restoring = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Restore") {
                    restoring = nil
                    onRestore(revision)
                }
                Button("Cancel", role: .cancel) { restoring = nil }
            } message: {
                Text("The photograph showing now keeps its place and can be restored in turn.")
            }
        }
        .frame(width: 118, alignment: .leading)
    }

    private func plate(_ revision: Revision, height: CGFloat) -> some View {
        ZStack {
            room.ink.opacity(0.06)

            if let url = revision.thumbnailUrl {
                Loaded(id: revision.id, url: url)
            }
        }
        .frame(maxWidth: .infinity, minHeight: height, maxHeight: height)
        .clipped()
    }

    /// Two times, and they are usually different. When a photograph was
    /// taken is a fact about the day; when it was submitted is a fact about
    /// the archive, and a version filed weeks later is worth being able to
    /// see as one.
    private func stamp(_ revision: Revision) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let captured = revision.capturedAt {
                Text(clock(captured))
                    .font(Face.mono(Size.micro))
                    .foregroundStyle(room.inkMuted)
            }
            Text("filed \(day(revision.submittedAt))")
                .font(Face.mono(Size.micro))
                .foregroundStyle(room.inkFaint)
        }
    }

    private func clock(_ moment: Date) -> String {
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_GB")
        out.timeZone = timeZone
        out.dateFormat = "HH:mm"
        return out.string(from: moment)
    }

    private func day(_ moment: Date) -> String {
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_GB")
        out.timeZone = timeZone
        out.dateFormat = "d MMM"
        return out.string(from: moment)
    }
}

/// A thumbnail by id and URL, going through the same cache as everything
/// else so a version already looked at is already held.
private struct Loaded: View {
    let id: String
    let url: URL

    @State private var image: UIImage?

    var body: some View {
        ZStack {
            /* This clear layer is load-bearing, which is not obvious and cost
               an afternoon.

               Written as `Group { if let image { ... } }` this view produces
               an `EmptyView` until the photograph arrives — and SwiftUI
               discards modifiers applied to an `EmptyView`, including
               `.task`. So the task that fetches the image never ran, so the
               image never arrived, so the view stayed empty: a wait for
               something that could only be started by no longer waiting.

               It failed silently and it failed uniformly, which is what made
               it read like a broken URL rather than broken lifecycle — every
               plate was grey, and a diagnostic placed inside the same Group
               was swallowed by the same rule it was there to report.

               `Color.clear` gives the view something real to be, so the
               modifiers have a host. */
            Color.clear

            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .transition(.opacity)
            }
        }
        .animation(Tempo.out, value: image != nil)
        .task(id: id) {
            if let held = await Photographs.shared.cached(id) {
                image = held
                return
            }
            image = await Photographs.shared.image(for: id, at: url)
        }
    }
}
