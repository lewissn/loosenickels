import SwiftUI

@main
struct DailyApp: App {
    @StateObject private var session = Session()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                /* Safari hands the magic link back here. Without this the
                   link opens the website in a browser and the app stays
                   signed out, with nothing on screen to explain why. */
                .onOpenURL { url in
                    Task { await session.handle(url) }
                }
                .task { await session.refresh() }
                .onChange(of: phase) { _, now in
                    /* A session can lapse while the phone is in a pocket.
                       Asking again on return costs one request and avoids
                       a screen that is quietly signed out. */
                    if now == .active { Task { await session.refresh() } }
                }
        }
    }
}
