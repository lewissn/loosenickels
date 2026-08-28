import Foundation
import UserNotifications

/*
 Reminding somebody, and then stopping.

 Three a day until the day is recorded, and none after — the second half of
 that is the part worth being careful about. A reminder that arrives after
 you have already done the thing is worse than no reminder: it teaches you
 that the notifications are not worth reading, and once that is learned it
 cannot be unlearned.

 So these are scheduled individually rather than as a repeating trigger.
 A repeating `UNCalendarNotificationTrigger` cannot have one of its
 occurrences cancelled — it is one request that fires for ever — which would
 mean either nagging somebody who has already recorded their day or tearing
 down and rebuilding the schedule constantly. Instead a rolling window of
 individual requests is kept topped up, and today's remaining ones are simply
 removed the moment a photograph lands.

 Everything here is local. Nothing is scheduled by a server, nothing about
 this leaves the phone, and it works with no signal at all.
 */

@MainActor
final class Reminders: ObservableObject {
    /// When they arrive. Late enough that an ordinary morning is not
    /// interrupted, spread so that missing one is not missing them all, and
    /// the last one early enough to still be able to do something about it.
    private static let times: [(hour: Int, minute: Int)] = [
        (12, 30),
        (17, 30),
        (20, 30),
    ]

    /// How far ahead to keep the schedule stocked. Seven days at three a day
    /// is twenty-one requests, well inside the sixty-four iOS will hold, and
    /// far enough that an app left unopened for a week still reminds.
    private static let horizon = 7

    private static let prefix = "day-unrecorded"

    @Published private(set) var permission: UNAuthorizationStatus = .notDetermined

    private let centre = UNUserNotificationCenter.current()

    func refreshPermission() async {
        permission = await centre.notificationSettings().authorizationStatus
    }

    /**
     Ask, at a moment when the answer means something.

     Deliberately not called at launch. A permission prompt before the
     product has done anything is a question about a thing the person cannot
     yet picture, and the honest answer to it is no. This is asked after the
     first photograph is recorded, when "remind you to do that again
     tomorrow" is a sentence with a referent.
     */
    func ask() async -> Bool {
        let granted = (try? await centre.requestAuthorization(options: [.alert, .sound])) ?? false
        await refreshPermission()
        return granted
    }

    /**
     Keep the next week stocked, skipping any day already recorded.

     Called on launch and whenever the app returns to the foreground, because
     a phone that has been in a pocket for three days has three days of
     reminders that have already fired and need replacing.
     */
    func reschedule(recorded: Set<CalendarDate>, timeZone: TimeZone, today: CalendarDate) async {
        guard permission == .authorized else { return }

        let pending = await centre.pendingNotificationRequests()
        centre.removePendingNotificationRequests(
            withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(Self.prefix) }
        )

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone

        guard let start = calendar.date(from: components(of: today, in: calendar)) else { return }

        for offset in 0..<Self.horizon {
            guard let day = calendar.date(byAdding: .day, value: offset, to: start) else { continue }
            let date = CalendarDate(day, in: timeZone)

            /* A day already recorded needs no reminding, today included —
               which is the whole point of scheduling these one at a time. */
            if recorded.contains(date) { continue }

            for (index, time) in Self.times.enumerated() {
                var when = calendar.dateComponents([.year, .month, .day], from: day)
                when.hour = time.hour
                when.minute = time.minute
                when.timeZone = timeZone

                /* Skip anything already in the past — scheduling 12:30 at
                   five in the afternoon delivers it immediately, which reads
                   as the app shouting the moment you open it. */
                if let fires = calendar.date(from: when), fires <= Date() { continue }

                let content = UNMutableNotificationContent()
                content.title = "Today is not recorded"
                content.body = Self.wording[index % Self.wording.count]
                content.sound = .default
                /* Opens the app straight into recording rather than into the
                   archive: somebody acting on this reminder has already
                   decided what they want to do. */
                content.userInfo = ["deepLink": "loosenickels://record"]

                let request = UNNotificationRequest(
                    identifier: "\(Self.prefix)-\(date.value)-\(index)",
                    content: content,
                    trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: false)
                )

                try? await centre.add(request)
            }
        }
    }

    /// The day has been recorded. Drop what is left of it immediately, so
    /// nothing arrives after the fact.
    func clear(_ date: CalendarDate) async {
        let ids = (0..<Self.times.count).map { "\(Self.prefix)-\(date.value)-\($0)" }
        centre.removePendingNotificationRequests(withIdentifiers: ids)
    }

    func cancelEverything() {
        centre.removeAllPendingNotificationRequests()
    }

    /* Three different sentences rather than one repeated, because the same
       words three times in a day is nagging and three phrasings of the same
       fact is a reminder. None of them are cheerful and none of them imply
       that missing a day is a failure — a gap is part of the record. */
    private static let wording = [
        "A photograph, whenever it happens.",
        "Still open, if the day offers something.",
        "The day is nearly over. There is no penalty for letting it pass.",
    ]

    private func components(of date: CalendarDate, in calendar: Calendar) -> DateComponents {
        var parts = DateComponents()
        parts.year = Int(date.value.prefix(4))
        parts.month = Int(date.value.dropFirst(5).prefix(2))
        parts.day = Int(date.value.suffix(2))
        parts.timeZone = calendar.timeZone
        return parts
    }
}
