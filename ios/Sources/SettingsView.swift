import SwiftUI

/*
 Settings.

 §21 allows conventional structure here and asks that it still be resolved
 rather than assembled: strong section hierarchy, restrained separators,
 minimal iconography, careful spacing, native controls where they are the
 right answer.

 So the sections are headings in the signage face with air between them, and
 the controls are the system's own — a Toggle is a Toggle, and a hand-drawn
 one would be worse in every way a person can measure. What is avoided is the
 grouped-inset list: a stack of white rounded boxes on grey, which is the
 default and which would be the only screen in the product that looks like
 every other application on the phone.

 §22 governs the privacy section and is the reason it is worded the way it
 is. Every control says what it does to somebody else's view of the archive,
 in a sentence, underneath. "Discoverable" is not a word anybody should have
 to interpret.
 */

struct SettingsView: View {
    let profile: Profile
    let email: String?
    let room: Room
    @ObservedObject var reminders: Reminders
    let onChange: (ProfileVisibility?, LocationPrecision?) async -> Void
    let onSignOut: () -> Void
    let onClose: () -> Void

    @State private var visibility: ProfileVisibility
    @State private var precision: LocationPrecision
    @State private var saving = false

    init(
        profile: Profile,
        email: String?,
        room: Room,
        reminders: Reminders,
        onChange: @escaping (ProfileVisibility?, LocationPrecision?) async -> Void,
        onSignOut: @escaping () -> Void,
        onClose: @escaping () -> Void
    ) {
        self.profile = profile
        self.email = email
        self.room = room
        self.reminders = reminders
        self.onChange = onChange
        self.onSignOut = onSignOut
        self.onClose = onClose
        _visibility = State(initialValue: profile.visibility)
        _precision = State(initialValue: profile.locationPrecision)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s8) {
                header
                account
                reminderSection
                privacy
                unbuilt
            }
            .padding(.horizontal, Space.margin)
            .padding(.bottom, Space.s8)
        }
        .background(room.ground)
        .tint(Tone.oxide)
    }

    // MARK: Sections

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Settings")
                .font(.system(size: 40, design: .serif))
                .foregroundStyle(room.ink)
            Spacer()
            Button(action: onClose) {
                Signage(text: "Close", tone: room.inkFaint)
            }
        }
        .padding(.top, Space.s5)
    }

    private var account: some View {
        section("Account") {
            fact("Signed in as", email ?? "—")
            fact("Handle", "@\(profile.handle)")
            fact("Days reckoned in", profile.timeZone.identifier)

            Button(action: onSignOut) {
                Signage(text: "Sign out", tone: Tone.oxide, weight: .semibold)
            }
            .padding(.top, Space.s2)
        }
    }

    private var reminderSection: some View {
        section("Reminders") {
            Toggle(isOn: Binding(
                get: { reminders.schedule.enabled },
                set: { reminders.schedule.enabled = $0 }
            )) {
                copy("Remind me to record the day", "Nothing about this leaves your phone. Reminders stop as soon as the day is recorded.")
            }

            if reminders.schedule.enabled {
                /* Three, per §23, and no more: a repeat rule, weekday
                   selection or a snooze would make this a habit tracker,
                   which the brief says plainly it is not. */
                time("First", \.first)
                time("Later", \.later)
                time("Last", \.last)
            }

            if reminders.permission == .denied {
                copy(
                    "Notifications are turned off for this app",
                    "These settings will do nothing until they are allowed in the phone's own Settings."
                )
                .padding(.top, Space.s2)
            }
        }
    }

    private var privacy: some View {
        section("Privacy") {
            copy(
                "Who can see this archive",
                "Days are private one by one as well. This decides whether the archive answers at all."
            )

            /* Three rows rather than a segmented control. The labels that
               actually say what these do — "anyone with the address",
               "anyone, and findable" — truncate to "Anyone with the..." in a
               segment, and §22 asks for exceptional clarity in precisely
               this place. A control that has to abbreviate the difference
               between public and findable is hiding the distinction it
               exists to expose. */
            VStack(alignment: .leading, spacing: 0) {
                choice("Only me", "Nobody else can reach it.", .private, $visibility)
                choice("Anyone with the address", "Reachable by anyone you give the link to. Not listed anywhere.", .public, $visibility)
                choice("Anyone, and findable", "As above, and it may be returned by a search.", .discoverable, $visibility)
            }
            .onChange(of: visibility) { _, now in
                Task { saving = true; await onChange(now, nil); saving = false }
            }

            copy(
                "How precisely places are shown",
                "Where a photograph was taken is always stored exactly. This is the most anybody else is ever told, and a day can be set to show less."
            )
            .padding(.top, Space.s4)

            Picker("", selection: $precision) {
                Text("Nothing").tag(LocationPrecision.hidden)
                Text("Region").tag(LocationPrecision.region)
                Text("Town").tag(LocationPrecision.locality)
                Text("Nearby").tag(LocationPrecision.approximate)
                Text("Exact").tag(LocationPrecision.precise)
            }
            .pickerStyle(.segmented)
            .onChange(of: precision) { _, now in
                Task { saving = true; await onChange(nil, now); saving = false }
            }
        }
    }

    /// Said plainly rather than hidden. §21 lists sections that do not exist
    /// yet, and a settings screen that quietly omits them looks finished
    /// when it is not.
    private var unbuilt: some View {
        section("Not yet built") {
            copy("Export", "Everything you have recorded, as files you keep.")
            copy("Delete account", "Not built deliberately: it has to remove photographs from storage as well as rows from a database, and doing half of that is worse than none.")
        }
    }

    // MARK: Pieces

    @ViewBuilder
    private func section<Content: View>(
        _ title: String,
        @ViewBuilder _ content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Signage(text: title, tone: room.inkFaint)
            content()
        }
    }

    private func fact(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(Face.grotesk(Size.micro))
                .foregroundStyle(room.inkFaint)
            Text(value)
                .font(Face.mono(Size.small))
                .foregroundStyle(room.ink)
        }
    }

    /// A statement and the sentence that explains it. §22 asks for plain
    /// language and no burying, which in practice means every control that
    /// affects what other people see says so directly underneath it.
    private func copy(_ line: String, _ note: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(line)
                .font(.system(size: Size.body, design: .serif))
                .foregroundStyle(room.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(note)
                .font(Face.grotesk(Size.micro))
                .foregroundStyle(room.inkFaint)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// One option, and what choosing it means. Marked rather than boxed: a
    /// rule under the chosen row and the ink at full strength is enough, and
    /// a filled capsule would be the only such shape in the product.
    private func choice<T: Equatable>(
        _ label: String,
        _ note: String,
        _ value: T,
        _ selection: Binding<T>
    ) -> some View {
        let chosen = selection.wrappedValue == value

        return Button { selection.wrappedValue = value } label: {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: Space.s2) {
                    Text(label)
                        .font(.system(size: Size.body, design: .serif))
                        .foregroundStyle(chosen ? room.ink : room.inkMuted)
                    if chosen {
                        Rectangle()
                            .fill(Tone.oxide)
                            .frame(width: 14, height: 1.5)
                    }
                    Spacer()
                }
                Text(note)
                    .font(Face.grotesk(Size.micro))
                    .foregroundStyle(room.inkFaint)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, Space.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func time(_ label: String, _ slot: WritableKeyPath<Reminders.Schedule, Reminders.Schedule.Slot>) -> some View {
        HStack {
            Toggle(isOn: Binding(
                get: { reminders.schedule[keyPath: slot].on },
                set: { reminders.schedule[keyPath: slot].on = $0 }
            )) {
                Text(label)
                    .font(Face.grotesk(Size.small))
                    .foregroundStyle(room.ink)
            }
            .labelsHidden()

            Text(label)
                .font(Face.grotesk(Size.small))
                .foregroundStyle(room.ink)

            Spacer()

            DatePicker(
                "",
                selection: Binding(
                    get: {
                        var parts = DateComponents()
                        parts.hour = reminders.schedule[keyPath: slot].hour
                        parts.minute = reminders.schedule[keyPath: slot].minute
                        return Calendar.current.date(from: parts) ?? Date()
                    },
                    set: { picked in
                        let parts = Calendar.current.dateComponents([.hour, .minute], from: picked)
                        reminders.schedule[keyPath: slot].hour = parts.hour ?? 12
                        reminders.schedule[keyPath: slot].minute = parts.minute ?? 0
                    }
                ),
                displayedComponents: .hourAndMinute
            )
            .labelsHidden()
            .disabled(!reminders.schedule[keyPath: slot].on)
            .opacity(reminders.schedule[keyPath: slot].on ? 1 : 0.4)
        }
    }
}
