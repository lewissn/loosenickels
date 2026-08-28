import SwiftUI

/*
 The shell.

 Three states, and the middle one matters: `unknown` is not "signed out". At
 launch there is a keychain session to check, and rendering the sign-in
 screen while that check is in flight makes every cold start flash a door
 the reader has already been through.
 */

struct RootView: View {
    @EnvironmentObject private var session: Session

    var body: some View {
        Group {
            switch session.standing {
            case .unknown:
                ZStack { Paper() }
            case .signedOut:
                SignInView()
            case .signedIn(let profile):
                ArchiveView(profile: profile)
            }
        }
        .tint(Tone.oxide)
        .animation(Tempo.inOut, value: session.standing)
    }
}
