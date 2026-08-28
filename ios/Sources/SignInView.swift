import SwiftUI

/*
 The door.

 There is no password field, and there is no way to make an account. A link
 arrives by email and opens the app.

 The sentence under the form is the important part. What it says when a link
 was sent and what it says when the address has no account are the same
 sentence, because a refusal that read differently would answer, to anybody
 willing to type addresses in, the question of who keeps an archive here.
 The closure is stated once, where it is true of everybody.
 */

struct SignInView: View {
    @EnvironmentObject private var session: Session
    @State private var email = ""
    @FocusState private var writing: Bool

    var body: some View {
        ZStack {
            Paper()

            VStack(alignment: .leading, spacing: Space.s5) {
                Spacer()

                VStack(alignment: .leading, spacing: Space.s3) {
                    Signage(text: "Loose Nickels", tone: Tone.inkGhost)

                    Text("One photograph a day.")
                        .font(.system(size: Size.title, design: .serif))
                        .tracking(Track.title)
                        .foregroundStyle(Tone.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let sent = session.linkSentTo {
                    sentTo(sent)
                } else {
                    form
                }

                Spacer()
                Spacer()
            }
            .padding(.horizontal, Space.margin)
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            VStack(alignment: .leading, spacing: Space.s2) {
                Signage(text: "Email", tone: Tone.inkFaint)

                TextField("", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused($writing)
                    .font(.system(size: Size.body))
                    .foregroundStyle(Tone.ink)
                    .padding(.vertical, Space.s2)
                    .onSubmit { request() }

                Rule(tone: Tone.rule)
            }

            Button(action: request) {
                Text(session.isWorking ? "Sending" : "Send a link")
            }
            .buttonStyle(StampButtonStyle())
            .disabled(session.isWorking || email.isEmpty)

            closure

            if let problem = session.problem {
                Notice(standing: "Problem", text: problem)
            }
        }
    }

    private func sentTo(_ address: String) -> some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Text("A link is on its way to \(address).")
                .font(.system(size: Size.lede, design: .serif))
                .foregroundStyle(Tone.ink)
                .fixedSize(horizontal: false, vertical: true)

            Text("Open it on this phone and it will bring you back here.")
                .font(.system(size: Size.small))
                .foregroundStyle(Tone.inkMuted)
                .fixedSize(horizontal: false, vertical: true)

            closure

            Button("Use a different address") {
                session.linkSentTo = nil
            }
            .buttonStyle(QuietButtonStyle())
        }
    }

    /// Stated once, of everybody. Never in reply to a particular address.
    private var closure: some View {
        Text("Not yet open. A link only arrives for an account that exists.")
            .font(.system(size: Size.fine))
            .foregroundStyle(Tone.inkGhost)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func request() {
        writing = false
        Task { await session.requestLink(to: email) }
    }
}
