import SwiftUI

/// Where the app is pointed and what it is allowed to do there.
struct SettingsView: View {
    @EnvironmentObject private var settings: Settings
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Paper()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Signage(text: "Settings", size: Size.fine, tone: Tone.ink, weight: .semibold)
                        Spacer()
                        Button { dismiss() } label: {
                            Signage(text: "Done", tone: Tone.oxide)
                        }
                    }
                    .padding(.top, Space.s5)
                    .padding(.bottom, Space.s4)

                    Rule(tone: Tone.ruleStrong)

                    Panel(
                        title: "Repository",
                        note: "Records are written to src/content/records, photographs to public/media."
                    ) {
                        plain("Owner", text: $settings.repository.owner)
                        plain("Repository", text: $settings.repository.name)
                        plain("Branch", text: $settings.repository.branch)
                    }

                    Rule()

                    Panel(
                        title: "Access token",
                        note: "A fine-grained personal access token with Contents: read and write, on this repository only. Held in the keychain, on this device, while it is unlocked."
                    ) {
                        VStack(alignment: .leading, spacing: Space.s2) {
                            Signage(text: "Fine-grained token")
                            SecureField("", text: $settings.token)
                                .font(Face.mono(Size.small))
                                .foregroundStyle(Tone.ink)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .tint(Tone.oxide)
                            Rule()
                        }
                        .padding(.vertical, Space.s2)
                    }

                    Rule()

                    Panel(
                        title: "Deployed site",
                        note: "Read by the register to fetch photographs, and asked before filing whether a slug is already in use."
                    ) {
                        plain("Site", text: $settings.repository.site, keyboard: .URL)
                    }
                }
                .padding(.horizontal, Space.margin)
                .padding(.bottom, Space.s8)
            }
        }
    }

    /// A setting is a short exact string. None of them wants a capital
    /// letter it was not given, or a correction.
    private func plain(
        _ label: String,
        text: Binding<String>,
        keyboard: UIKeyboardType = .default
    ) -> some View {
        WritingField(
            label,
            text: text,
            face: Face.mono(Size.small),
            autocapitalisation: .never
        )
        .keyboardType(keyboard)
        .autocorrectionDisabled()
    }
}
