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
                ArchiveView(
                    profile: Fixtures.profile,
                    fixtures: Fixtures.days()
                )
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
            /* Safari hands the magic link back here. Without this the link
               opens the website in a browser and the app stays signed out,
               with nothing on screen to explain why. */
            .onOpenURL { url in
                Task { await session.handle(url) }
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
