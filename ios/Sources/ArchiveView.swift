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
    /// Which day is on screen, by position rather than by id — the viewer
    /// moves between neighbours and needs to know where it is in the run.
    @State private var at = 0
    /// Whether the interface is showing. Held here rather than per-day, so a
    /// tap on one photograph does not leave the next one dressed differently.
    @State private var dressed = {
        #if DEBUG
        /* `-undressed` starts in pure-photograph mode. The harness cannot
           tap, and this is the state where the crop is released — which is
           precisely the thing worth looking at and the only way to see it. */
        return !CommandLine.arguments.contains("-undressed")
        #else
        return true
        #endif
    }()

    var body: some View {
        ZStack {
            room.ground.ignoresSafeArea()

            /* The rail floats over the photograph rather than sitting on a
               shelf above it — §19, and the reason portraits can fill the
               screen at all. */
            /* Branching on the array itself, not on `Days.isEmpty` — which
               means "empty *and* finished loading" and is therefore false at
               launch, when the array is empty and the load is in flight.

               That is what crashed the app on opening: this took the second
               branch, the viewer asked for day zero of an array with no days
               in it, and the index was out of range. The design harness never
               reached it because fixtures fill the array synchronously and a
               real load does not — the one difference between the two paths,
               and it hid the only crash in the app. */
            if days.days.isEmpty {
                if days.isLoading {
                    /* Nothing at all, on the archive's own ground. A
                       spinner here would be the first thing a reader sees
                       every morning, in place of a photograph. */
                    Color.clear
                } else {
                    VStack(spacing: 0) { rail; nothingYet }
                }
            } else {
                /* The photograph ignores the safe area entirely and the rail
                   does not — §19. Stacked rather than overlaid, because an
                   overlay inherits the ignored insets from what it is over
                   and would put the brand mark under the clock. */
                ZStack(alignment: .top) {
                    pages.ignoresSafeArea()

                    if dressed {
                        /* The scrim is its own layer with a height of its
                           own, not the rail's background.

                           As a background it was exactly as tall as the rail
                           — status bar plus one line — and strongest at the
                           very top of that. Which put the words themselves
                           at about eighty percent down the gradient, where
                           it had already faded to nothing. It was doing its
                           work above the text and none behind it.

                           Given room to fade over, the words sit in the
                           strong part and the transition to the photograph
                           happens well below them. */
                        Scrim(dark: railOverDark, strongest: .top)
                            /* Tall enough to cover the status bar and the
                               rail with a little fade beyond, and no taller.
                               240 put a wash across a sixth of every
                               photograph to lift two short lines. */
                            .frame(height: 150)
                            .ignoresSafeArea(edges: .top)
                            .frame(maxHeight: .infinity, alignment: .top)
                            .transition(.opacity)

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
                #if DEBUG
                /* `-slow` holds the fixtures back for a moment, so the
                   harness goes through the state a real load does: array
                   empty, loading true, view already on screen. That state
                   crashed the app on every launch and the harness could not
                   reach it, because `present` fills synchronously. It can
                   now. */
                if CommandLine.arguments.contains("-slow") {
                    days.beginLoading()
                    try? await Task.sleep(for: .seconds(1.5))
                }
                #endif
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
                /* A recorded day goes to the top of the run, so the reader
                   is shown what they just did rather than left wherever they
                   happened to be. */
                at = days.days.firstIndex { $0.date == recorded.date } ?? 0
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
        currentDay.map { Room.lit(by: $0.photo) } ?? .unlit
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
                tone: railInk.opacity(0.82),
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
                /* Monochrome, over a photograph.

                   The date was oxide, and oxide over a green canopy is red
                   on green — the worst contrast pair there is, and unreadable
                   at label size however good the scrim behind it.

                   It also spent the one accent the product has on a piece of
                   permanent furniture. The token's own note says its scarcity
                   is what gives it authority; a mark that appears on every
                   screen has none to give.

                   Nothing is lost by dropping it: the date is shown *only*
                   when today is unrecorded, so its presence is the signal and
                   the colour was saying the same thing twice. */
                HStack(spacing: Space.s2) {
                    if !days.todayRecorded, let today = days.today {
                        Signage(
                            text: stampOf(today),
                            size: Size.micro,
                            tone: railInk
                        )
                    }
                    Image(systemName: "plus")
                        .font(.system(size: Size.body, weight: .light))
                        .foregroundStyle(railInk)
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
                    .foregroundStyle(railInk.opacity(0.7))
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
        guard onPhotograph else { return room.ink }
        return railOverDark ? Tone.inkNight : Tone.inkDay
    }

    /// Whether the rail is floating over a picture at all — only portraits
    /// reach the top of the screen; everything else has ground up there.
    private var onPhotograph: Bool {
        guard let day = currentDay else { return false }
        return Composition.of(day.photo).shape == .portrait
    }

    private var railOverDark: Bool {
        guard let day = currentDay else { return room.isNight }
        return day.photo.lightnessBehind(.overlaidHigh) < 0.55
    }

    private var currentDay: ResolvedDay? {
        days.days.indices.contains(at) ? days.days[at] : days.days.first
    }

    // MARK: Days

    private var pages: some View {
        Viewer(count: days.days.count, index: $at) { i in
            DayScene(
                day: days.days[i],
                timeZone: days.timeZone,
                dressed: dressed
            ) {
                /* §5: one tap takes the interface away and leaves the
                   photograph. A gesture rather than a control, because a
                   control to hide the controls is a contradiction. */
                withAnimation(Tempo.considered) { dressed.toggle() }
            }
        }
        .onChange(of: at) { _, now in
            /* Fetch the days on either side of wherever the reader is, so
               the next photograph is usually already held by the time the
               gesture that reveals it finishes. Two ahead and one behind:
               scrolling back is common enough to be worth one, and rare
               enough not to be worth two. */
            let window = days.days[
                max(0, now - 1)...min(days.days.count - 1, now + 2)
            ]

            let wanted = window.compactMap { day -> (assetId: String, url: URL)? in
                guard let url = day.photo.forThisScreen else { return nil }
                return (day.photo.assetId, url)
            }

            Task { await Photographs.shared.prefetch(wanted) }
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
