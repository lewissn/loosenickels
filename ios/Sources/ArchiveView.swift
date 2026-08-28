import SwiftUI

/*
 The archive, one day at a time.

 The website scrolls through days with an inertial gesture that springs onto
 the nearest one. A phone already has that gesture built into a paged
 scroll view, and reimplementing it here would be a worse copy of something
 the platform does properly.

 What is shown is the most recently recorded day — not today's, necessarily.
 If the latest photograph is yesterday's, yesterday's is what is shown, in
 full, and the line about today being open is quiet and to one side. An
 empty screen for the sin of not having posted yet would be the product
 punishing somebody for missing a day, which is what it must never do.
 */

struct ArchiveView: View {
    let profile: Profile

    @EnvironmentObject private var session: Session
    @StateObject private var days = Days()
    @State private var composing = false
    @State private var showingAccount = false

    var body: some View {
        ZStack {
            Paper()

            VStack(spacing: 0) {
                rail

                if days.isEmpty {
                    nothingYet
                } else {
                    pages
                }
            }
        }
        .task { await days.loadIfNeeded(owner: profile.id) }
        .sheet(isPresented: $composing) {
            ComposeView(owner: profile.id, timeZone: days.timeZone) { recorded in
                days.merge(recorded)
            }
        }
        .confirmationDialog(
            profile.displayName ?? profile.handle,
            isPresented: $showingAccount,
            titleVisibility: .visible
        ) {
            Button("Sign out", role: .destructive) {
                Task { await session.signOut() }
            }
        }
    }

    // MARK: The rail

    private var rail: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Signage(
                    text: "Loose Nickels",
                    size: Size.fine,
                    tone: Tone.ink,
                    weight: .semibold
                )
                .fixedSize()

                Spacer()

                /* Stated plainly, never as a streak. A gap is not a failure
                   and the product does not keep score. */
                if let status = days.status {
                    Signage(
                        text: status.daysRecorded == 1
                            ? "1 day"
                            : "\(status.daysRecorded) days",
                        tone: Tone.inkGhost
                    )
                    .fixedSize()
                }

                Button { showingAccount = true } label: {
                    Image(systemName: "person.crop.circle")
                        .font(.system(size: Size.body, weight: .regular))
                        .foregroundStyle(Tone.inkFaint)
                }
                .padding(.leading, Space.s3)
            }
            .padding(.horizontal, Space.margin)
            .padding(.vertical, Space.s3)

            Rule(tone: Tone.ruleStrong)

            if !days.todayRecorded {
                todayOpen
            }
        }
    }

    /// Quiet, and to one side. Not an alarm.
    private var todayOpen: some View {
        /* Baseline-aligned, and the label kept to one line. Set as an
           ordinary HStack the sentence wrapped to two lines and the button
           centred itself against the pair, which read as two unrelated
           things that had collided rather than as a line with an action at
           the end of it. */
        HStack(alignment: .firstTextBaseline, spacing: Space.s4) {
            Signage(text: "Today is not recorded", tone: Tone.inkMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.85)

            Spacer(minLength: 0)

            Button("Record") { composing = true }
                .buttonStyle(QuietButtonStyle())
                .fixedSize()
        }
        .padding(.horizontal, Space.margin)
        .padding(.vertical, Space.s3)
        .background(Tone.wash)
    }

    // MARK: Days

    private var pages: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(days.days) { day in
                    DayPage(day: day, timeZone: days.timeZone)
                        .containerRelativeFrame(.vertical)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollIndicators(.hidden)
        .ignoresSafeArea(edges: .bottom)
        .overlay(alignment: .bottomTrailing) {
            if days.todayRecorded {
                /* Recording is still reachable when today is done, because
                   replacing today's photograph is an ordinary thing to want
                   and so is filling in a day that was missed. */
                Button { composing = true } label: {
                    Image(systemName: "plus")
                        .font(.system(size: Size.lede, weight: .light))
                        .foregroundStyle(Tone.ground)
                        .frame(width: 52, height: 52)
                        .background(Circle().fill(Tone.ink))
                }
                .padding(Space.s5)
            }
        }
    }

    private var nothingYet: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Spacer()

            Text("Nothing recorded yet.")
                .font(.system(size: Size.title, design: .serif))
                .foregroundStyle(Tone.ink)

            Text("A photograph for each day. It becomes worth something because time passes, so the only thing to do is begin.")
                .font(.system(size: Size.body))
                .foregroundStyle(Tone.inkMuted)
                .fixedSize(horizontal: false, vertical: true)

            Button("Record today") { composing = true }
                .buttonStyle(StampButtonStyle())

            if let problem = days.problem {
                Notice(standing: "Not loaded", text: problem)
            }

            Spacer()
            Spacer()
        }
        .padding(.horizontal, Space.margin)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/*
 One day, filling the screen.

 Nothing is ever cropped. A photograph whose orientation disagrees with the
 screen leaves space, and that leftover space is exactly where the writing
 goes — the conflict generates the composition rather than needing to be
 solved.
 */
private struct DayPage: View {
    let day: ResolvedDay
    let timeZone: TimeZone

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            photograph

            VStack(alignment: .leading, spacing: Space.s2) {
                Text(day.date.spelled(in: timeZone))
                    .font(.system(size: Size.lede, design: .serif))
                    .foregroundStyle(Tone.ink)

                if let note = day.note, !note.isEmpty {
                    Text(note)
                        .font(.system(size: Size.body, design: .serif))
                        .foregroundStyle(Tone.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                metadata
            }
            .padding(.horizontal, Space.margin)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var photograph: some View {
        ZStack {
            /* The placeholder is behind the real image rather than replaced
               by it, so the transition is the photograph resolving rather
               than one view swapping for another. */
            if let inline = day.photo.placeholder,
               let image = InlineImage.decode(inline) {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(day.photo.aspect, contentMode: .fit)
                    .blur(radius: 12)
            }

            if let url = day.photo.best {
                AsyncImage(url: url) { image in
                    image.resizable().aspectRatio(contentMode: .fit)
                } placeholder: {
                    Color.clear
                }
            } else if day.photo.processing != .ready {
                /* Honest rather than hidden. The photograph is safe; what
                   does not exist yet is a rendition small enough to show. */
                Signage(text: "Still arriving", tone: Tone.inkGhost)
                    .padding(Space.s5)
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var metadata: some View {
        let parts = [
            day.capturedAt.map { clock($0) },
            day.place?.label,
            day.camera?.model,
        ].compactMap { $0 }

        if !parts.isEmpty {
            Signage(text: parts.joined(separator: "  ·  "), tone: Tone.inkGhost)
                .padding(.top, Space.s1)
        }
    }

    /// The zone the photograph was taken in, where it recorded one — not
    /// the reader's. A time is a measurement of a moment somewhere.
    private func clock(_ moment: Date) -> String {
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_GB")
        out.timeZone = day.captureTimeZone.flatMap(TimeZone.init(identifier:)) ?? timeZone
        out.dateFormat = "HH:mm"
        return out.string(from: moment)
    }
}

enum InlineImage {
    /// `data:image/jpeg;base64,…`, as the placeholder column stores it.
    static func decode(_ inline: String) -> UIImage? {
        guard let comma = inline.firstIndex(of: ","),
              let data = Data(base64Encoded: String(inline[inline.index(after: comma)...]))
        else { return nil }
        return UIImage(data: data)
    }
}
