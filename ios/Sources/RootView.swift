import SwiftUI

/*
 The rail.

 The website keeps a fixed institutional rail at the top of every page —
 the one thing that never gives up the top of the screen, which is what
 makes everything below it read as the interface changing state rather
 than as a menu covering it over. This is that, on a phone.
 */

struct RootView: View {
    @EnvironmentObject private var settings: Settings
    @StateObject private var register = Register()

    @State private var section: Section = .register
    @State private var showingSettings = false

    enum Section: String, CaseIterable, Identifiable {
        case register
        case accession

        var id: String { rawValue }
        var name: String { self == .register ? "Register" : "Accession" }
    }

    var body: some View {
        ZStack {
            Paper()

            VStack(spacing: 0) {
                rail

                switch section {
                case .register:
                    RegisterView(register: register)
                case .accession:
                    CaptureView(onFiled: showRegister)
                }
            }
        }
        .tint(Tone.oxide)
        .sheet(isPresented: $showingSettings) {
            SettingsView().environmentObject(settings)
        }
    }

    // MARK: The rail

    private var rail: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Signage(text: "Loose Nickels", size: Size.fine, tone: Tone.ink, weight: .semibold)
                    .fixedSize()

                Spacer()

                Signage(text: "Accession", tone: Tone.inkGhost)
                    .fixedSize()

                Button {
                    showingSettings = true
                } label: {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: Size.small, weight: .regular))
                        .foregroundStyle(Tone.inkFaint)
                }
                .padding(.leading, Space.s3)
            }
            .padding(.horizontal, Space.margin)
            .padding(.top, Space.s3)
            .padding(.bottom, Space.s3)

            Rule(tone: Tone.ruleFaint)

            HStack(spacing: Space.s5) {
                ForEach(Section.allCases) { candidate in
                    Button {
                        withAnimation(Tempo.inOut) { section = candidate }
                    } label: {
                        VStack(spacing: Space.s2) {
                            Signage(
                                text: candidate.name,
                                tone: section == candidate ? Tone.ink : Tone.inkGhost,
                                weight: section == candidate ? .semibold : .regular
                            )
                            Rectangle()
                                .fill(section == candidate ? Tone.oxide : Color.clear)
                                .frame(height: 1.5)
                        }
                        .fixedSize()
                    }
                    .buttonStyle(.plain)
                }

                Spacer()
            }
            .padding(.horizontal, Space.margin)
            .padding(.top, Space.s3)

            Rule(tone: Tone.ruleStrong)
        }
    }

    /// After filing, the archive is one record larger than the register
    /// last saw. Showing it is more useful than an alert saying so.
    private func showRegister() {
        register.invalidate()
        withAnimation(Tempo.inOut) { section = .register }
        Task { await register.load(using: settings) }
    }
}
