import Foundation
import WidgetKit

/*
 The archive, as the phone holds it.

 One page of days, newest first, plus whatever the owner is told about their
 own archive. Recording a day merges the result on top rather than reloading
 the list, so the photograph that was just taken is on screen before the
 network has finished agreeing that it exists.

 What gets merged is the day the archive returned, not this app's guess at
 one. That is the difference between an interface that agrees with its own
 next refresh and one that does not.
 */

@MainActor
final class Days: ObservableObject {
    @Published private(set) var days: [ResolvedDay] = []
    @Published private(set) var status: ArchiveStatus?
    @Published private(set) var isLoading = false
    @Published private(set) var problem: String?

    /// How many days back the first load reaches. A phone shows one at a
    /// time; this is enough to swipe through an evening without waiting.
    private let window = 30

    private let archive: ArchiveSource
    private var loaded = false

    init(archive: ArchiveSource = SupabaseArchive()) {
        self.archive = archive
    }

    var today: CalendarDate? { status?.today }

    /// The zone the owner's days are reckoned in. Never the device's: that
    /// is a different zone whenever they are travelling, and it would put a
    /// photograph taken at ten past midnight on the wrong date.
    var timeZone: TimeZone { status?.timeZone ?? .current }

    var todayRecorded: Bool { status?.todayRecorded ?? false }

    var isEmpty: Bool { days.isEmpty && !isLoading && problem == nil }

    /// Every day that has a photograph, for deciding what to remind about.
    var recorded: Set<CalendarDate> { Set(days.map(\.date)) }

    /**
     Tell the widget what it is allowed to know.

     A widget cannot ask the archive anything — different process, no
     session, a few milliseconds of budget — so this is the only way it
     learns whether today is done. Called wherever the answer changes:
     after a load and after a recording.

     `reloadAllTimelines` is what makes it visible. Writing without it means
     the widget shows the previous answer until iOS decides on its own to
     refresh, which can be an hour.
     */
    func publishToWidget() {
        guard let status else { return }
        SharedStore.write(
            DayStanding(
                today: status.today.value,
                todayRecorded: status.todayRecorded,
                daysRecorded: status.daysRecorded
            )
        )
        WidgetCenter.shared.reloadAllTimelines()
    }

    func loadIfNeeded(owner: String) async {
        guard !loaded else { return }
        await load(owner: owner)
    }

    func load(owner: String) async {
        isLoading = true
        problem = nil
        defer { isLoading = false }

        do {
            let status = try await archive.status(owner: owner)
            self.status = status

            /* One request for the window. This used to ask for the latest
               day, then a page of summaries, then a full day for each of
               those in turn — thirty round trips over a mobile network
               before the first photograph could be drawn. */
            days = try await archive.recentDays(owner: owner, limit: window, before: nil)

            loaded = true
            publishToWidget()
        } catch let failure as ArchiveFailure {
            problem = failure.errorDescription
        } catch {
            problem = error.localizedDescription
        }
    }

    /// Put a recorded day on screen. Later writes win, which is what makes
    /// recording over an existing day a replacement rather than a duplicate.
    func merge(_ day: ResolvedDay) {
        days.removeAll { $0.date == day.date }
        days.append(day)
        days.sort { $0.date > $1.date }

        if let today = status?.today, day.date == today {
            status?.todayRecorded = true
        }
        status?.daysRecorded = days.count
        publishToWidget()
    }

    func invalidate() { loaded = false }

    #if DEBUG
    /// Pretend a load is in flight. Harness only — see `-slow`.
    func beginLoading() {
        isLoading = true
        days = []
        status = nil
    }
    #endif

    /// Show these and load nothing. Used only by the design harness.
    func present(_ fixtures: [ResolvedDay]) {
        isLoading = false
        days = fixtures
        loaded = true
        status = ArchiveStatus(
            today: CalendarDate.today(in: timeZone),
            timeZone: TimeZone(identifier: "Europe/London")!,
            todayRecorded: false,
            daysRecorded: fixtures.count,
            earliest: fixtures.last?.date,
            latest: fixtures.first?.date
        )
    }

    private func back(from date: CalendarDate, days count: Int) -> CalendarDate {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone

        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = timeZone
        parser.dateFormat = "yyyy-MM-dd"

        guard let anchor = parser.date(from: date.value),
              let earlier = calendar.date(byAdding: .day, value: -count, to: anchor)
        else { return date }

        return CalendarDate(earlier, in: timeZone)
    }
}
