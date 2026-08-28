import SwiftUI

/*
 The holdings.

 Opening the app on the archive rather than on an empty form is most of
 what makes this a hub instead of an uploader. Everything here is read
 from the repository and nothing is written back.
 */

struct RegisterView: View {
    @EnvironmentObject private var settings: Settings
    @ObservedObject var register: Register

    @State private var showing: RecordSummary?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: []) {
                holdings
                controls

                if let failure = register.failure {
                    Notice(standing: "Not read", text: failure, standingTone: Tone.oxide)
                } else if register.isLoading && register.records.isEmpty {
                    Notice(standing: "Reading", text: "Drawing the register from the repository.")
                } else if register.isEmpty {
                    Notice(
                        standing: "Nothing held",
                        text: "The archive is empty, or the branch in Settings is not the one the records are on."
                    )
                } else {
                    switch register.order {
                    case .register: byDepartment
                    case .recent: chronological
                    }
                }

                if !register.unreadable.isEmpty {
                    Notice(
                        standing: "Not readable",
                        text: register.unreadable.joined(separator: ", ")
                            + " — held by the archive but not in a shape this app understands."
                    )
                }
            }
            .padding(.horizontal, Space.margin)
            .padding(.bottom, Space.s8)
        }
        .scrollDismissesKeyboard(.immediately)
        .refreshable { await register.load(using: settings) }
        .task { await register.loadIfNeeded(using: settings) }
        .sheet(item: $showing) { record in
            RecordSheet(record: record, site: settings.repository.site)
        }
    }

    // MARK: Head

    /// What the institution holds, stated before anything is listed.
    private var holdings: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            HStack(alignment: .firstTextBaseline, spacing: Space.s3) {
                Text("\(register.records.count)")
                    .font(Face.mono(Size.display, weight: .light))
                    .tracking(Size.display * Track.display)
                    .foregroundStyle(Tone.ink)

                VStack(alignment: .leading, spacing: 2) {
                    Signage(text: register.records.count == 1 ? "Record" : "Records")
                    Signage(
                        text: "\(register.departments.count) departments",
                        tone: Tone.inkGhost
                    )
                }

                Spacer()

                if register.isLoading {
                    ProgressView().tint(Tone.inkGhost)
                }
            }
            .padding(.top, Space.s5)
            .padding(.bottom, Space.s4)

            Rule(tone: Tone.ruleStrong)
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack(spacing: Space.s5) {
                ForEach(Register.Order.allCases) { order in
                    Button {
                        withAnimation(Tempo.inOut) { register.order = order }
                    } label: {
                        VStack(spacing: Space.s2) {
                            Signage(
                                text: order.name,
                                tone: register.order == order ? Tone.ink : Tone.inkGhost,
                                weight: register.order == order ? .semibold : .regular
                            )
                            Rectangle()
                                .fill(register.order == order ? Tone.oxide : Color.clear)
                                .frame(height: 1.5)
                        }
                    }
                    .buttonStyle(.plain)
                }

                Spacer()
            }
            .padding(.top, Space.s4)

            TextField("", text: $register.query, prompt: prompt)
                .font(Face.editorial(Size.body))
                .foregroundStyle(Tone.ink)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .tint(Tone.oxide)
                .padding(.vertical, Space.s2)

            Rule()
        }
        .padding(.bottom, Space.s2)
    }

    private var prompt: Text {
        Text("Find a record")
            .font(Face.editorial(Size.body, italic: true))
            .foregroundColor(Tone.inkGhost)
    }

    // MARK: Arrangements

    private var byDepartment: some View {
        ForEach(register.departments) { group in
            VStack(alignment: .leading, spacing: 0) {
                departmentHead(group.department, count: group.held.count)

                ForEach(group.held) { record in
                    row(record)
                }
            }
        }
    }

    private var chronological: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(register.chronological) { record in
                row(record)
            }
        }
    }

    private func departmentHead(_ dept: Department, count: Int) -> some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            HStack(alignment: .firstTextBaseline) {
                Signage(text: dept.name, size: Size.fine, tone: Tone.ink, weight: .semibold)
                Spacer()
                Text(String(format: "%02d", count))
                    .font(Face.mono(Size.micro))
                    .foregroundStyle(Tone.inkGhost)
            }

            Text(dept.charter)
                .font(Face.editorial(Size.small, italic: true))
                .foregroundStyle(Tone.inkMuted)
                .fixedSize(horizontal: false, vertical: true)

            Rule(tone: Tone.rule)
        }
        .padding(.top, Space.s6)
        .padding(.bottom, Space.s2)
    }

    private func row(_ record: RecordSummary) -> some View {
        Button {
            showing = record
        } label: {
            RecordRow(record: record, site: settings.repository.site)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - A record in a list

struct RecordRow: View {
    let record: RecordSummary
    let site: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: Space.s3) {
                Rectangle()
                    .fill(Tone.environment(record.dept))
                    .frame(width: 2)

                VStack(alignment: .leading, spacing: Space.s2) {
                    HStack(alignment: .firstTextBaseline) {
                        AccessionNumber(id: record.id)
                        Spacer(minLength: Space.s2)
                        if record.significance != .undetermined {
                            Signage(text: record.significance.name, tone: Tone.oxide)
                        }
                        if record.status != "accessioned" {
                            Signage(text: record.status, tone: Tone.inkGhost)
                        }
                    }

                    Text(record.title)
                        .font(Face.editorial(Size.lede))
                        .tracking(Size.lede * Track.title)
                        .foregroundStyle(Tone.ink)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)

                    if let summary = record.summary {
                        Text(summary)
                            .font(Face.editorial(Size.small))
                            .foregroundStyle(Tone.inkMuted)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }

                    HStack(spacing: Space.s2) {
                        Text(record.date)
                        if let place = record.place {
                            Text("·")
                            Text(place).lineLimit(1)
                        }
                        if record.isPlate {
                            Text("·")
                            Text("plate")
                        }
                    }
                    .font(Face.mono(Size.micro))
                    .foregroundStyle(Tone.inkGhost)
                }

                if let thumbnail = record.thumbnail {
                    AsyncImage(url: URL(string: site + thumbnail.src)) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Tone.groundDeep
                    }
                    .frame(width: 54, height: 54)
                    .clipped()
                }
            }
            .padding(.vertical, Space.s4)

            Rule(tone: Tone.ruleFaint)
        }
        .contentShape(Rectangle())
    }
}

// MARK: - A record on its own

/// Everything the register knows about one record, and a way through to
/// the page the website makes of it.
struct RecordSheet: View {
    let record: RecordSummary
    let site: String

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Paper()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        AccessionNumber(id: record.id, size: Size.fine)
                        Spacer()
                        Button { dismiss() } label: {
                            Signage(text: "Close", tone: Tone.inkFaint)
                        }
                    }
                    .padding(.top, Space.s5)
                    .padding(.bottom, Space.s4)

                    Rule(tone: Tone.ruleStrong)

                    Text(record.title)
                        .font(Face.editorial(Size.title))
                        .tracking(Size.title * Track.title)
                        .foregroundStyle(Tone.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, Space.s5)

                    if let summary = record.summary {
                        Text(summary)
                            .font(Face.editorial(Size.body))
                            .foregroundStyle(Tone.inkMuted)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, Space.s3)
                    }

                    Panel(title: "Particulars") {
                        VStack(spacing: 0) {
                            Readout(key: "Department", value: record.dept.name)
                            Readout(key: "Dated", value: record.date)
                            Readout(key: "Significance", value: record.significance.name)
                            Readout(key: "Status", value: record.status.capitalized)
                            if let place = record.place {
                                Readout(key: "Place", value: place)
                            }
                            if !record.tags.isEmpty {
                                Readout(key: "Tags", value: record.tags.joined(separator: ", "))
                            }
                            Readout(
                                key: "Illustration",
                                value: record.isPlate ? "Generated plate" : "Photograph"
                            )
                        }
                    }

                    Rule()

                    if let url = URL(string: "\(site)/archive/record/\(record.slug)/") {
                        Link(destination: url) {
                            HStack {
                                Signage(text: "Read it on the site", tone: Tone.oxide)
                                Spacer()
                                Image(systemName: "arrow.up.right")
                                    .font(.system(size: Size.fine, weight: .medium))
                                    .foregroundStyle(Tone.oxide)
                            }
                            .padding(.vertical, Space.s4)
                        }
                    }

                    Text(record.significance.note)
                        .font(Face.editorial(Size.small, italic: true))
                        .foregroundStyle(Tone.inkGhost)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, Space.s3)
                }
                .padding(.horizontal, Space.margin)
                .padding(.bottom, Space.s8)
            }
        }
        .presentationDragIndicator(.visible)
    }
}
