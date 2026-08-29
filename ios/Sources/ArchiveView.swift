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

    /// Days to show instead of loading any, for the design harness. Nil in
    /// every build anybody but me runs.
    var fixtures: [ResolvedDay]? = nil

    @EnvironmentObject private var session: Session
    @StateObject private var days = Days()
    @StateObject private var reminders = Reminders()
    @State private var offeringReminders = false
    @State private var composing = false
    @State private var showingAccount = false
    /// The day currently filling the screen. The rail takes its light from
    /// this one, so the chrome changes as the archive is scrolled rather
    /// than being fixed to whatever happened to load first.
    @State private var visible: String?
    /// Whether the interface is showing. Held here rather than per-day, so a
    /// tap on one photograph does not leave the next one dressed differently.
    @State private var dressed = true

    var body: some View {
        ZStack {
            room.ground.ignoresSafeArea()

            /* The rail floats over the photograph rather than sitting on a
               shelf above it — §19, and the reason portraits can fill the
               screen at all. */
            if days.isEmpty {
                VStack(spacing: 0) { rail; nothingYet }
            } else {
                /* The photograph ignores the safe area entirely and the rail
                   does not — §19. Stacked rather than overlaid, because an
                   overlay inherits the ignored insets from what it is over
                   and would put the brand mark under the clock. */
                ZStack(alignment: .top) {
                    pages.ignoresSafeArea()

                    if dressed {
                        rail.transition(.opacity)
                    }
                }
            }
        }
        /* One line does a surprising amount of work. Every adaptive token in
           this subtree — the rail's ink, its rules, the compose sheet — then
           resolves against the photograph rather than against the phone, and
           the status bar goes dark over a pale picture without being asked.
           Setting each of those by hand would be the same decision made in
           nine places, and eight of them would eventually disagree. */
        .preferredColorScheme(room.isNight ? .dark : .light)
        .statusBarHidden(!dressed)
        .animation(Tempo.considered, value: room)
        .task {
            if let fixtures {
                days.present(fixtures)
                #if DEBUG
                /* `-compose` opens the sheet straight away, because its
                   interesting state is the one after a photograph has been
                   chosen and there is no way to choose one from a script. */
                if CommandLine.arguments.contains("-compose") { composing = true }
                #endif
            } else {
                await days.loadIfNeeded(owner: profile.id)
                await reminders.refreshPermission()
                await scheduleReminders()
            }
        }
        .sheet(isPresented: $composing) {
            ComposeView(owner: profile.id, timeZone: days.timeZone) { recorded in
                days.merge(recorded)
                Task { await settleReminders(after: recorded.date) }
            }
        }
        /* Something outside the app asked to record — a reminder, a widget.
           Acted on here rather than where it arrived, because this is the
           first point at which there is a sheet to present and an owner to
           present it for. */
        .onChange(of: session.pendingRecord) { _, asked in
            guard asked != nil else { return }
            composing = true
            session.pendingRecord = nil
        }
        .alert("Remind you?", isPresented: $offeringReminders) {
            Button("Yes, remind me") {
                Task {
                    _ = await reminders.ask()
                    await scheduleReminders()
                }
            }
            Button("No", role: .cancel) {}
        } message: {
            Text("Three times a day, and none once the day is recorded. Nothing leaves your phone.")
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
    /// Stop today's remaining reminders at once, then offer them to somebody
    /// who has just recorded for the first time — which is the first moment
    /// "remind you to do that again tomorrow" is a sentence about something
    /// they can picture. Asking at launch is asking about nothing.
    private func settleReminders(after date: CalendarDate) async {
        await reminders.clear(date)

        if reminders.permission == .notDetermined {
            offeringReminders = true
        } else {
            await scheduleReminders()
        }
    }

    private func scheduleReminders() async {
        await reminders.reschedule(
            recorded: days.recorded,
            timeZone: days.timeZone,
            today: days.today ?? CalendarDate.today(in: days.timeZone)
        )
    }

    private var room: Room {
        let day = days.days.first { $0.id == visible } ?? days.days.first
        return day.map { Room.lit(by: $0.photo) } ?? .unlit
    }

    /**
     Almost no chrome — §14.

     What was here: a brand mark, a running count of recorded days, a profile
     icon, and beneath it a full-width bar announcing that today was not
     recorded. Four pieces of furniture above a photograph, one of which
     (the count) belongs in a profile and none of which is what the reader
     came for.

     What is here now: the mark, and one control. The unrecorded state is
     said by that control changing rather than by a bar of its own, and it
     leaves with everything else on a tap.
     */
    private var rail: some View {
        HStack(alignment: .firstTextBaseline) {
            Signage(
                text: "Loose Nickels",
                size: Size.micro,
                tone: railInk.opacity(0.75),
                weight: .semibold
            )

            Spacer()

            Button { composing = true } label: {
                /* One control, two states, and the word "unrecorded" is not
                   in either. It was, and with the brand mark beside it the
                   rail became a sentence running the width of the screen —
                   four pieces of furniture again, in a thinner disguise.

                   The date alone says which day is open, and the oxide says
                   it is open. Colour carrying meaning needs the label below
                   to carry it too, which it does. */
                HStack(spacing: Space.s2) {
                    if !days.todayRecorded, let today = days.today {
                        Signage(
                            text: stampOf(today),
                            size: Size.micro,
                            tone: Tone.oxide
                        )
                    }
                    Image(systemName: "plus")
                        .font(.system(size: Size.body, weight: .light))
                        .foregroundStyle(days.todayRecorded ? railInk.opacity(0.7) : Tone.oxide)
                }
            }
            .accessibilityLabel(
                days.todayRecorded
                    ? "Record a day"
                    : "Today is not recorded. Record today."
            )

            Button { showingAccount = true } label: {
                Image(systemName: "person")
                    .font(.system(size: Size.small, weight: .light))
                    .foregroundStyle(railInk.opacity(0.6))
            }
            .padding(.leading, Space.s4)
            .accessibilityLabel("Account")
        }
        .padding(.horizontal, Space.margin)
        .padding(.top, Space.s2)
        .padding(.bottom, Space.s3)
    }

    private func stampOf(_ date: CalendarDate) -> String {
        let months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]
        let month = Int(date.value.dropFirst(5).prefix(2)) ?? 1
        let day = Int(date.value.suffix(2)) ?? 1
        return "\(day) \(months[max(0, min(11, month - 1))])"
    }

    /* The rail floats over a full-bleed photograph, so its ink comes from
       what is behind it rather than from the room — which for a portrait is
       the top of the picture, not the ground. */
    private var railInk: Color {
        guard let day = days.days.first(where: { $0.id == visible }) ?? days.days.first
        else { return Tone.ink }

        let composition = Composition.of(day.photo)
        guard composition.shape == .portrait else { return room.ink }
        return day.photo.lightnessBehind(.overlaidHigh) < 0.55 ? Tone.inkNight : Tone.inkDay
    }

    // MARK: Days

    private var pages: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(Array(days.days.enumerated()), id: \.element.id) { index, day in
                    DayScene(
                        day: day,
                        timeZone: days.timeZone,
                        dressed: dressed
                    ) {
                        /* §5: one tap takes the interface away and leaves
                           the photograph. A gesture rather than a control,
                           because a control to hide the controls is a
                           contradiction. */
                        withAnimation(Tempo.considered) { dressed.toggle() }
                    }
                        .containerRelativeFrame(.vertical)
                        .id(day.id)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollIndicators(.hidden)
        .scrollPosition(id: $visible)
        /* Fetch the days on either side of wherever the reader is, so the
           next photograph is usually already held by the time the gesture
           that reveals it finishes. Two ahead and one behind: scrolling back
           is common enough to be worth one, and rare enough not to be worth
           two. */
        .onChange(of: visible) { _, now in
            guard let now, let at = days.days.firstIndex(where: { $0.id == now })
            else { return }

            let window = days.days[
                max(0, at - 1)...min(days.days.count - 1, at + 2)
            ]

            let wanted = window.compactMap { day -> (assetId: String, url: URL)? in
                guard let url = day.photo.forThisScreen else { return nil }
                return (day.photo.assetId, url)
            }

            Task { await Photographs.shared.prefetch(wanted) }
        }
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
