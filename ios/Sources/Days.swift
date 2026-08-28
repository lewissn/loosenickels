import Foundation

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

            /* Anchored on the latest recorded day rather than on today, so
               an archive whose owner missed a fortnight still opens on a
               photograph instead of on two weeks of nothing. */
            guard let latest = try await archive.latestDay(owner: owner) else {
                days = []
                loaded = true
                return
            }

            let summaries = try await archive.summaries(
                owner: owner,
                from: back(from: latest.date, days: window),
                to: latest.date
            )

            /* The window is fetched as summaries — thumbnails and shapes —
               and only the day actually on screen is fetched whole. A phone
               on a train should not download thirty full photographs to
               show one. */
            var assembled: [ResolvedDay] = [latest]
            for summary in summaries where summary.date != latest.date {
                if let day = try? await archive.day(owner: owner, date: summary.date) {
                    assembled.append(day)
                }
            }

            days = assembled.sorted { $0.date > $1.date }
            loaded = true
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
    }

    func invalidate() { loaded = false }

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
