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
    /* The Vercel address, not the domain.
       `www.loosenickels.com` still answers from GitHub Pages — the old
       static site, which has no routes and no idea what an upload is — and
       will keep doing so until the domain is moved deliberately. Pointing
       the app at a name that resolves to the wrong server is a failure with
       no useful error message at either end: the upload simply 404s against
       a static host.
       Change this line and the redirect allow-list together, on the day the
       domain moves, and not before. */
    static let origin = "https://loosenickels.vercel.app"
}

enum Backend {
    /* Both come from the Supabase dashboard, under Project Settings -> API.

       They are committed, and this repository is public, which is a
       deliberate choice rather than an oversight: the publishable key is the
       same string the website hands to every browser that loads it. What
       stands between it and anybody's photographs is row level security, and
       if that were not true the website would already be wide open.

       The service role key is the opposite of this and must never appear
       here or anywhere else outside a server. It bypasses row level security
       completely — every policy in the schema stops applying to whoever
       holds it. */
    static let url = URL(string: "https://yfkrdytoycksodqpljcb.supabase.co")!
    static let publishableKey =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlma3JkeXRveWNrc29kcXBsamNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDE0NTEsImV4cCI6MjEwMzUxNzQ1MX0.OlbEIelZ9zj5YHCp8L1ve8fmQ0vuZ5uVUu1zk5r0XYg"

    /// Where a magic link comes back to. Registered in `project.yml` as a
    /// URL scheme and in the Supabase dashboard as a permitted redirect;
    /// it has to be in both or the link opens the website instead.
    static let callback = URL(string: "loosenickels://auth-callback")!

    /// Kept, though both values are filled in: a fresh clone with the
    /// placeholders restored should say so on its first screen rather than
    /// fail at its first request.
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
