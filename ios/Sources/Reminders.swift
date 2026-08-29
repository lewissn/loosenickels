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
    /**
     When they arrive, and whether they arrive at all.

     §23 names exactly three — a daily reminder, a later one, a final one —
     and warns against overcomplicating the scheduling because the product is
     not a habit tracker. So there is no repeat rule, no weekday selection,
     no snooze: three times of day, each of which can be turned off, and the
     first of which turns off the rest.

     Stored on the device rather than on the profile. These are a property of
     this phone's relationship with its owner — a second device would
     reasonably want different ones, and nothing on the server needs to know.
     */
    struct Schedule: Equatable {
        var enabled: Bool
        var first: Slot
        var later: Slot
        var last: Slot

        struct Slot: Equatable {
            var on: Bool
            var hour: Int
            var minute: Int
        }

        /// Late enough that an ordinary morning is not interrupted, spread so
        /// that missing one is not missing them all, and the last early
        /// enough that something can still be done about it.
        static let standard = Schedule(
            enabled: false,
            first: Slot(on: true, hour: 12, minute: 30),
            later: Slot(on: true, hour: 17, minute: 30),
            last: Slot(on: true, hour: 20, minute: 30)
        )

        var active: [Slot] { [first, later, last].filter(\.on) }
    }

    @Published var schedule: Schedule = .load() {
        didSet { schedule.save() }
    }

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
        /* Clear and stop, rather than clear and rebuild, when they are off.
           A schedule turned off has to actually remove what is already
           pending — twenty-one requests outlive the switch that made them. */
        guard permission == .authorized, schedule.enabled else {
            let pending = await centre.pendingNotificationRequests()
            centre.removePendingNotificationRequests(
                withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(Self.prefix) }
            )
            return
        }

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

            for (index, time) in schedule.active.enumerated() {
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
        let ids = (0..<3).map { "\(Self.prefix)-\(date.value)-\($0)" }
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

private extension Reminders.Schedule {
    /* UserDefaults, flattened. A Codable blob would be tidier to write and
       worse to change: adding a fourth slot later would have to cope with
       every previously encoded shape, where a missing key simply falls back
       to the standard value. */
    private static let keys = (
        enabled: "reminders.enabled",
        times: "reminders.times",
        on: "reminders.on"
    )

    static func load() -> Reminders.Schedule {
        let defaults = UserDefaults.standard
        var schedule = Reminders.Schedule.standard

        if defaults.object(forKey: keys.enabled) != nil {
            schedule.enabled = defaults.bool(forKey: keys.enabled)
        }

        if let minutes = defaults.array(forKey: keys.times) as? [Int], minutes.count == 3 {
            schedule.first.hour = minutes[0] / 60
            schedule.first.minute = minutes[0] % 60
            schedule.later.hour = minutes[1] / 60
            schedule.later.minute = minutes[1] % 60
            schedule.last.hour = minutes[2] / 60
            schedule.last.minute = minutes[2] % 60
        }

        if let on = defaults.array(forKey: keys.on) as? [Bool], on.count == 3 {
            schedule.first.on = on[0]
            schedule.later.on = on[1]
            schedule.last.on = on[2]
        }

        return schedule
    }

    func save() {
        let defaults = UserDefaults.standard
        defaults.set(enabled, forKey: Self.keys.enabled)
        defaults.set(
            [first, later, last].map { $0.hour * 60 + $0.minute },
            forKey: Self.keys.times
        )
        defaults.set([first.on, later.on, last.on], forKey: Self.keys.on)
    }
}
