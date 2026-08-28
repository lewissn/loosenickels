import WidgetKit
import SwiftUI

/*
 The widget.

 Two buttons and one fact. The fact is whether today has been recorded, which
 is the only thing somebody wants from a home screen — it is the question
 they would otherwise open the app to answer.

 The buttons are two intentions rather than two routes to one: "this, now"
 and "that thing from earlier". They deep-link into the same router the
 reminders use, so there is one way into recording and it cannot drift.

 No photograph. A private archive drawn on a home screen is a private archive
 shown to whoever is standing behind you.
 */

struct Entry: TimelineEntry {
    let date: Date
    let standing: DayStanding?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: Date(), standing: DayStanding(today: "", todayRecorded: false, daysRecorded: 0))
    }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: Date(), standing: SharedStore.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        /* Refreshed at the next midnight in addition to whenever the app
           reloads it, because "today" stops being true then whether or not
           anybody opens anything. */
        let midnight = Calendar.current.nextDate(
            after: Date(),
            matching: DateComponents(hour: 0, minute: 1),
            matchingPolicy: .nextTime
        ) ?? Date().addingTimeInterval(3600)

        completion(Timeline(
            entries: [Entry(date: Date(), standing: SharedStore.read())],
            policy: .after(midnight)
        ))
    }
}

struct DailyWidgetView: View {
    var entry: Entry

    @Environment(\.widgetFamily) private var family

    private var recorded: Bool {
        guard let standing = entry.standing, !standing.isStale else { return false }
        return standing.todayRecorded
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(recorded ? "Today is recorded." : "Today is open.")
                .font(.system(size: family == .systemSmall ? 15 : 18, design: .serif))
                .foregroundStyle(Tone.ink)
                .fixedSize(horizontal: false, vertical: true)

            if let standing = entry.standing, standing.daysRecorded > 0 {
                Text(standing.daysRecorded == 1 ? "1 day" : "\(standing.daysRecorded) days")
                    .font(.system(size: 11, weight: .medium))
                    .tracking(1.4)
                    .foregroundStyle(Tone.inkFaint)
                    .padding(.top, 3)
            }

            Spacer(minLength: 8)

            /* Both offered even when today is done, because replacing
               today's photograph and filling in a day that was missed are
               both ordinary things to want. */
            HStack(spacing: 6) {
                Link(destination: URL(string: "loosenickels://record?from=camera")!) {
                    action("Take")
                }
                Link(destination: URL(string: "loosenickels://record?from=library")!) {
                    action("Choose")
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { Tone.ground }
    }

    private func action(_ label: String) -> some View {
        Text(label.uppercased())
            .font(.system(size: 11, weight: .semibold))
            .tracking(1.2)
            .foregroundStyle(Tone.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .background(Tone.wash)
    }
}

@main
struct DailyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.lewisnichols.daily.widget", provider: Provider()) { entry in
            DailyWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Whether the day is recorded, and two ways to record it.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
