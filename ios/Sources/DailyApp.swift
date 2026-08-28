import SwiftUI

@main
struct DailyApp: App {
    @StateObject private var session = Session()

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if Fixtures.requested {
                /* The design harness: invented days, no session, no network,
                   so the viewer can be looked at rather than only reasoned
                   about. See Fixtures.swift. */
                ArchiveView(profile: Fixtures.profile, fixtures: Fixtures.days())
                    .environmentObject(session)
                    .tint(Tone.oxide)
            } else {
                Archive().environmentObject(session)
            }
            #else
            Archive().environmentObject(session)
            #endif
        }
    }
}

/// The app proper. Extracted so the fixture branch above can stand beside it
/// without either having to know about the other.
private struct Archive: View {
    @EnvironmentObject private var session: Session
    @Environment(\.scenePhase) private var phase

    var body: some View {
        RootView()
            /* One handler for every way in — the website's sign-in hand-off,
               a tapped reminder, the widget's buttons. Two handlers on the
               same scheme is two ideas about what a URL means, and they
               disagree quietly rather than loudly. */
            .onOpenURL { url in
                guard let link = Deeplink(url) else { return }
                switch link {
                case .signIn(let url):
                    Task { await session.handle(url) }
                case .record(let source):
                    session.pendingRecord = source
                }
            }
            .task { await session.refresh() }
            .onChange(of: phase) { _, now in
                /* A session can lapse while the phone is in a pocket. Asking
                   again on return costs one request and avoids a screen that
                   is quietly signed out. */
                if now == .active { Task { await session.refresh() } }
            }
    }
}
