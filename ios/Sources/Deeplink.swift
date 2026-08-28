import Foundation

/*
 One door, several keys.

 Everything that opens this app from outside arrives on the same scheme: the
 sign-in hand-off from the website, a tapped reminder, and — shortly — the
 widget's two buttons. They need one router rather than a handler each,
 because handlers each grow their own idea of what a URL means and then
 disagree quietly.

 The shapes:

   loosenickels://auth-callback?token_hash=…&type=…   the website's hand-off
   loosenickels://record                              record however you like
   loosenickels://record?from=camera                  straight to the camera
   loosenickels://record?from=library                 straight to the library
 */

enum Deeplink: Equatable {
    case signIn(URL)
    case record(Source)

    /// Where a recording should begin. The widget offers both because they
    /// are genuinely different intentions: one is "this, now", the other is
    /// "that thing from earlier".
    enum Source: String, Equatable {
        case ask, camera, library
    }

    init?(_ url: URL) {
        guard url.scheme == "loosenickels" else { return nil }

        /* `host` for `loosenickels://record`, `path` for the form some
           systems rewrite it into. Both are accepted rather than assuming
           which one arrives, because that assumption is only ever tested by
           a link that silently does nothing. */
        let route = url.host ?? url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        switch route {
        case "auth-callback":
            self = .signIn(url)
        case "record":
            let from = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first { $0.name == "from" }?.value
            self = .record(from.flatMap(Source.init(rawValue:)) ?? .ask)
        default:
            return nil
        }
    }
}
