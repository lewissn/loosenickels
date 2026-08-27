import SwiftUI

@main
struct AccessionApp: App {
    @StateObject private var settings = Settings()

    var body: some Scene {
        WindowGroup {
            CaptureView()
                .environmentObject(settings)
        }
    }
}
