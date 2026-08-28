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

    /// The room the day currently on screen has made. The rail and the
    /// ground behind everything take their colours from it, so the chrome
    /// belongs to the photograph rather than sitting on top of it.
    private var room: Room {
        days.days.first.map { Room.lit(by: $0.photo) } ?? .unlit
    }

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
                ForEach(Array(days.days.enumerated()), id: \.element.id) { index, day in
                    DayPage(day: day, timeZone: days.timeZone, isFirst: index == 0)
                        .containerRelativeFrame(.vertical)
                        .id(day.id)
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
