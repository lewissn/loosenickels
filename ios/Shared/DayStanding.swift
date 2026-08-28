import Foundation

/*
 What the widget is allowed to know.

 A widget runs in a different process with no session, no keychain access to
 speak of, and a few milliseconds of budget. It cannot ask the archive
 anything. So the app writes down the small amount the widget needs, in a
 container both can reach, and the widget reads it and draws.

 Deliberately tiny, and deliberately not a photograph. A widget showing
 today's picture sounds better than it is: it would mean the app copying
 image data into a shared container on every recording, the widget holding it
 in a process that gets killed constantly, and — the part that decides it —
 a private archive rendered on a home screen that other people can see. The
 widget says whether the day is done. It does not show the day.
 */

/* `DayStanding` rather than `Standing`, which the app already uses for
   whether there is a session. Two types of one name in a module that
   compiles both is an ambiguity the compiler reports at whichever one is
   innocent. */
public struct DayStanding: Codable, Equatable, Sendable {
    /// The owner's today, in the owner's zone, as of the last write.
    public var today: String
    public var todayRecorded: Bool
    /// Stated plainly, never as a streak. A gap is not a failure.
    public var daysRecorded: Int
    /// When the app last wrote this, so the widget can tell the difference
    /// between "not recorded" and "nobody has opened the app in a week".
    public var written: Date

    public init(today: String, todayRecorded: Bool, daysRecorded: Int, written: Date = Date()) {
        self.today = today
        self.todayRecorded = todayRecorded
        self.daysRecorded = daysRecorded
        self.written = written
    }

    /// Whether what we know is old enough to be worth doubting. A phone
    /// unopened since yesterday has a `today` that is no longer today, and
    /// saying "recorded" on the strength of it would be a lie the widget
    /// tells confidently.
    public var isStale: Bool {
        Calendar.current.isDateInToday(written) == false
    }
}

public enum SharedStore {
    /* Must match the App Group registered on the developer portal and listed
       in both entitlements files. If it does not, `UserDefaults(suiteName:)`
       returns nil, everything below quietly does nothing, and the widget
       shows its empty state for ever with no error anywhere. */
    public static let group = "group.com.lewisnichols.daily"

    private static let key = "standing"

    public static var defaults: UserDefaults? {
        UserDefaults(suiteName: group)
    }

    public static func write(_ standing: DayStanding) {
        guard let data = try? JSONEncoder().encode(standing) else { return }
        defaults?.set(data, forKey: key)
    }

    public static func read() -> DayStanding? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(DayStanding.self, from: data)
    }
}
