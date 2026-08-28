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

    /**
     Where the app's own deep link goes. Registered in `project.yml` as a
     URL scheme, and handled by `Session.handle`.

     Note what this is *not*: it is not what the app asks Supabase to put in
     the email. See `emailReturn` below.
     */
    static let scheme = URL(string: "loosenickels://auth-callback")!

    /**
     Where a magic link is asked to come back to — the website, not the app.

     Asking for the app's own scheme is the obvious thing and it does not
     work. Mail clients will not make a `loosenickels://` link clickable:
     Outlook and Hotmail in particular rewrite every URL they can understand
     and quietly leave alone every one they cannot, so the link arrives inert
     and tapping it does nothing at all. No error, on any side.

     So the email points at the website's callback, which every mail client
     is happy to linkify. That page holds the credential without spending it
     and offers a button that opens the app with it. A custom scheme tapped
     on a web page works perfectly well; it is only in email that it does
     not.

     The proper fix is a Universal Link, which needs an associated-domains
     entitlement and an `apple-app-site-association` file served from the
     domain — and therefore needs the domain moved off GitHub Pages first.
     Worth doing. Not worth blocking on.
     */
    static let emailReturn = URL(string: "\(Site.origin)/auth/callback")!

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

        /* Whether there is a session at all is a local question — the
           keychain holds one and supabase-swift refreshes it in the
           background — so it is asked first, and separately.

           What follows is a network call, and conflating the two is how an
           app comes to show its front door to somebody already holding a
           key. Signing in once should mean signing in once: a train tunnel
           is not a logout. */
        guard let user = try? await Backend.client.auth.session.user else {
            standing = .signedOut
            return
        }

        do {
            if let profile = try await archive.me() {
                standing = .signedIn(profile)
                return
            }
            /* A session whose profile has genuinely gone — the account was
               deleted underneath it. That is a real signed-out. */
            standing = .signedOut
        } catch {
            /* Unreachable, not unauthorised. Keep whatever profile is
               already on screen, and where there is none, carry on with
               what the session itself knows. The archive below will say it
               cannot reach anything, which is true and useful, rather than
               this screen implying the reader is a stranger, which is
               neither. */
            standing = .signedIn(standing.profile ?? Profile(
                id: user.id.uuidString.lowercased(),
                handle: user.email ?? "you",
                displayName: nil,
                bio: nil,
                visibility: .private,
                timeZone: .current,
                locationPrecision: .hidden
            ))
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
                redirectTo: Backend.emailReturn,
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

    /**
     Safari hands the link back here.

     Two shapes arrive, and both are honoured for the same reason the
     website's callback honours both: which one turns up depends on how the
     project's email template is written, and a template is a preference
     rather than a thing that has to be right.

     `?token_hash=&type=` is what the template ought to produce — it is a
     credential in the query string, verified by asking the auth server. The
     default template instead sends the reader through Supabase's own verify
     endpoint, which comes back with the session in the URL *fragment*, and
     `session(from:)` is what reads that.
     */
    func handle(_ url: URL) async {
        isWorking = true
        defer { isWorking = false }

        let parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let items = parts?.queryItems ?? []
        let tokenHash = items.first { $0.name == "token_hash" }?.value
        let type = items.first { $0.name == "type" }?.value

        do {
            if let tokenHash {
                try await Backend.client.auth.verifyOTP(
                    tokenHash: tokenHash,
                    type: EmailOTPType(rawValue: type ?? "magiclink") ?? .magiclink
                )
            } else {
                try await Backend.client.auth.session(from: url)
            }
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
