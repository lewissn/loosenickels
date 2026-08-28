import Foundation
import Supabase

/*
 Where the app is pointed, and who is holding it.

 The GitHub token this replaced was a credential the archivist pasted in by
 hand, scoped to one repository, and it went in the keychain because a
 file-system backup should not pick it up. The reasoning survives; the
 credential does not. There is no token to paste now — a link arrives by
 email, Safari hands it back to this app, and supabase-swift keeps the
 resulting session in the keychain and refreshes it before it lapses.

 The project's URL and publishable key are compiled in. Neither is a secret:
 the key is the one the website ships to every browser, and row level
 security is what stands between it and anybody's photographs. Putting them
 in a settings screen would only invite someone to change them.
 */

/// The website. The app uploads through its routes rather than signing its
/// own storage URLs, so that the rule about who may fetch a photograph is
/// implemented once and read by both clients.
enum Site {
    static let origin = "https://www.loosenickels.com"
}

enum Backend {
    /* ---------------------------------------------------------------
       Fill both in from the Supabase dashboard: Project Settings ->
       API. The URL ends in `.supabase.co`; the key is the publishable
       (anon) one, never the service role key — that one bypasses row
       level security entirely and must never leave a server.
       --------------------------------------------------------------- */
    static let url = URL(string: "https://YOUR-PROJECT.supabase.co")!
    static let publishableKey = "YOUR-PUBLISHABLE-KEY"

    /// Where a magic link comes back to. Registered in `project.yml` as a
    /// URL scheme and in the Supabase dashboard as a permitted redirect;
    /// it has to be in both or the link opens the website instead.
    static let callback = URL(string: "loosenickels://auth-callback")!

    static var isConfigured: Bool {
        !url.absoluteString.contains("YOUR-PROJECT")
            && !publishableKey.hasPrefix("YOUR-")
    }

    static let client = SupabaseClient(
        supabaseURL: url,
        supabaseKey: publishableKey
    )
}

/// Where the reader is in the business of being signed in.
enum Standing: Equatable {
    case unknown
    case signedOut
    case signedIn(Profile)

    var profile: Profile? {
        if case .signedIn(let profile) = self { return profile }
        return nil
    }
}

@MainActor
final class Session: ObservableObject {
    @Published private(set) var standing: Standing = .unknown
    @Published private(set) var isWorking = false

    /// Set after a link is requested, and deliberately not cleared by an
    /// error: the sentence on screen must not depend on whether the
    /// address exists.
    @Published var linkSentTo: String?
    @Published var problem: String?

    private let archive: ArchiveSource

    init(archive: ArchiveSource = SupabaseArchive()) {
        self.archive = archive
    }

    /// Called once at launch, and again whenever the app returns to the
    /// foreground — a session can lapse while the phone is in a pocket.
    func refresh() async {
        guard Backend.isConfigured else {
            standing = .signedOut
            problem = "This build has no backend configured. See ios/README.md."
            return
        }

        do {
            let profile = try await archive.me()
            standing = profile.map(Standing.signedIn) ?? .signedOut
        } catch {
            standing = .signedOut
        }
    }

    /**
     Ask for a link.

     What this says on success and what it says when the address has no
     account must be the same sentence. Registration is closed, and a
     refusal that read differently would answer, to anybody willing to type
     addresses in, the question of who keeps an archive here. The closure is
     stated once on the screen, where it is true of everybody.
     */
    func requestLink(to email: String) async {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard address.contains("@") else {
            problem = "That does not look like an email address."
            return
        }

        isWorking = true
        problem = nil
        defer { isWorking = false }

        do {
            try await Backend.client.auth.signInWithOTP(
                email: address,
                redirectTo: Backend.callback,
                /* Belt to the dashboard's braces. The switch in the
                   Supabase dashboard is the real lock — this key is public,
                   so anybody can call this endpoint themselves and ask for
                   a user to be created. This only stops *us* asking. */
                shouldCreateUser: false
            )
        } catch {
            /* Swallowed on purpose. See the note above: a refused address
               and a sent link look identical from here. Anything that is
               genuinely wrong — no network, the project unreachable —
               surfaces when the link is opened and nothing happens. */
        }

        linkSentTo = address
    }

    /// Safari hands the link back here.
    func handle(_ url: URL) async {
        isWorking = true
        defer { isWorking = false }

        do {
            try await Backend.client.auth.session(from: url)
            linkSentTo = nil
            problem = nil
            await refresh()
        } catch {
            problem = "That link did not work. It may have already been used, or expired."
        }
    }

    func signOut() async {
        try? await Backend.client.auth.signOut()
        linkSentTo = nil
        standing = .signedOut
    }
}
