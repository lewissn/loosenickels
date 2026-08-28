import SwiftUI
import PhotosUI

/*
 Recording a day.

 This is the one thing the product asks of somebody, and it happens once a
 day for years. So it is arranged as a single held breath rather than a form:
 choose, look, say something if there is something to say, and be done. There
 is no title bar competing with the photograph, no section headers, and
 nothing to scroll past.

 The room takes its light from the picture here as it does everywhere else,
 which means the sheet changes colour the moment a photograph is chosen. That
 is the point at which the day stops being an empty slot and becomes a
 particular day, and the interface saying so is worth more than any label.

 Three things happen underneath and they are deliberately separate: the file
 is read on the device, because the server never sees it; the bytes go to
 storage; and only then is a day told which photograph is its own. The middle
 one is what fails outdoors, and the separation is what makes it survivable.
 */

struct ComposeView: View {
    let owner: String
    let timeZone: TimeZone
    /// Where to begin. The widget and a tapped reminder can say; opening the
    /// sheet from inside the app asks.
    var source: Deeplink.Source = .ask
    let onRecorded: (ResolvedDay) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var picked: PhotosPickerItem?
    @State private var photo: Photograph.Prepared?
    @State private var date: CalendarDate?
    @State private var note = ""
    @State private var stage: Stage = .empty
    @State private var problem: String?
    @State private var keepPlace = true
    @State private var shooting = false

    /* Generated once per chosen photograph and kept across retries, so a
       connection that drops after the request left but before the reply
       arrived cannot write the same day twice. */
    @State private var attempt = UUID().uuidString

    @FocusState private var writing: Bool

    private let archive: ArchiveSource = SupabaseArchive()

    #if DEBUG
    /// Opens with a photograph already chosen, for the design harness — the
    /// interesting state, and one a script cannot reach through a picker.
    private func loadFixture() {
        guard CommandLine.arguments.contains("-compose"), photo == nil else { return }
        guard let prepared = Fixtures.prepared() else { return }
        photo = prepared
        date = CalendarDate.today(in: timeZone)
        stage = .ready
    }
    #endif

    enum Stage: Equatable { case empty, reading, ready, sending }

    /// Before a photograph is chosen there is nothing to take light from, so
    /// the sheet holds the archive's own colours until there is.
    private var room: Room {
        guard let photo, stage != .empty, stage != .reading else { return .unlit }
        return Room.lit(by: ResolvedPhoto(
            assetId: "pending",
            width: photo.width,
            height: photo.height,
            placeholder: nil,
            lightness: photo.lightness,
            tone: photo.tone,
            processing: .pending,
            urls: [:],
            alt: ""
        ))
    }

    var body: some View {
        ZStack {
            room.ground.ignoresSafeArea()

            VStack(spacing: 0) {
                header

                if let photo, let date, stage == .ready || stage == .sending {
                    chosen(photo: photo, date: date)
                } else {
                    invitation
                }
            }
        }
        .preferredColorScheme(room.isNight ? .dark : .light)
        .animation(Tempo.considered, value: room)
        .animation(Tempo.out, value: stage)
        #if DEBUG
        .task { loadFixture() }
        #endif
        .onChange(of: picked) { _, item in
            guard let item else { return }
            Task { await read(item) }
        }
        .fullScreenCover(isPresented: $shooting) {
            Viewfinder(
                onTaken: { data in
                    shooting = false
                    accept(data, takenNow: true)
                },
                onCancelled: { shooting = false }
            )
            .ignoresSafeArea()
        }
        .task {
            /* The widget's camera button, or a reminder tapped with the
               camera in mind. Opening straight into it is the whole value of
               having two buttons rather than one. */
            if source == .camera, Viewfinder.available, photo == nil {
                shooting = true
            }
        }
    }

    // MARK: The bar

    /* Close on the left, the action on the right, and the state of things
       between them. A navigation title would say "Record a day" over a
       photograph that is already saying which day it is. */
    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Button("Close") { dismiss() }
                .buttonStyle(QuietButtonStyle())
                .disabled(stage == .sending)

            Spacer()

            if stage == .ready || stage == .sending {
                Button(action: record) {
                    Signage(
                        text: stage == .sending ? "Sending" : (replacing ? "Replace" : "Record"),
                        tone: stage == .sending ? room.inkFaint : room.ink,
                        weight: .semibold
                    )
                }
                .disabled(stage == .sending)
            }
        }
        .padding(.horizontal, Space.margin)
        .padding(.vertical, Space.s4)
        .overlay(alignment: .bottom) {
            /* Pinned above everything and impossible to scroll past. A
               refusal used to render at the foot of a scroll view under a
               full-height photograph, where nobody was ever going to find
               it, which is why a failed recording read as a dead button. */
            if let problem {
                Text(problem)
                    .font(Face.grotesk(Size.fine))
                    .foregroundStyle(Tone.groundDay)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Space.margin)
                    .padding(.vertical, Space.s3)
                    .background(Tone.oxide)
                    .fixedSize(horizontal: false, vertical: true)
                    .offset(y: 44)
                    .transition(.opacity)
            }
        }
    }

    // MARK: Nothing chosen yet

    private var invitation: some View {
        VStack(alignment: .leading, spacing: Space.s5) {
            Spacer()

            Text(stage == .reading ? "Reading the photograph" : "Today, then.")
                .font(.system(size: Size.display, design: .serif))
                .foregroundStyle(room.ink)
                .fixedSize(horizontal: false, vertical: true)

            Text("One photograph. It will be filed under the day it was taken, not the day it was added.")
                .font(.system(size: Size.body, design: .serif))
                .foregroundStyle(room.inkMuted)
                .fixedSize(horizontal: false, vertical: true)

            /* Two, because they are two different intentions rather than two
               routes to one: "this, now" and "that thing from earlier". The
               widget offers the same pair for the same reason. */
            HStack(spacing: Space.s3) {
                if Viewfinder.available {
                    Button { shooting = true } label: {
                        bordered("Take one")
                    }
                }

                PhotosPicker(selection: $picked, matching: .images, photoLibrary: .shared()) {
                    bordered(Viewfinder.available ? "Choose one" : "Choose a photograph")
                }
            }
            .disabled(stage == .reading)
            .opacity(stage == .reading ? 0.4 : 1)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, Space.margin)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func bordered(_ label: String) -> some View {
        Signage(text: label, tone: room.ink, weight: .semibold)
            .padding(.vertical, Space.s4)
            .padding(.horizontal, Space.s5)
            .overlay(Rectangle().stroke(Tone.rule, lineWidth: 1))
    }

    // MARK: Chosen

    private func chosen(photo: Photograph.Prepared, date: CalendarDate) -> some View {
        GeometryReader { screen in
            /* Same rule as the viewer: the picture takes the height its own
               shape asks for, capped, and never fills a frame of the wrong
               proportion by floating in the middle of it. */
            let natural = screen.size.width / max(Double(photo.width) / Double(max(photo.height, 1)), 0.01)
            let height = min(natural, screen.size.height * 0.52)

            ScrollView {
                VStack(alignment: .leading, spacing: Space.s5) {
                    if let preview = photo.preview {
                        Image(uiImage: preview)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: screen.size.width, height: height)
                            .clipped()
                            .opacity(stage == .sending ? 0.55 : 1)
                            .overlay(alignment: .center) {
                                if stage == .sending {
                                    ProgressView().tint(room.ink)
                                }
                            }
                    }

                    VStack(alignment: .leading, spacing: Space.s3) {
                        Text(date.spelled(in: timeZone))
                            .font(.system(size: Size.title, design: .serif))
                            .foregroundStyle(room.ink)
                            .fixedSize(horizontal: false, vertical: true)

                        /* Where the date came from, said plainly and quietly.
                           A file with no capture time is filed under today,
                           and the person should know that now rather than
                           wonder about it in five years.

                           Set as prose rather than as signage: uppercase ran
                           to two lines and shouted an aside over the date it
                           was explaining. */
                        Text(photo.capturedAt == nil
                            ? "This file records no capture time, so today is assumed."
                            : "Dated from the photograph itself.")
                            .font(Face.grotesk(Size.micro))
                            .foregroundStyle(room.inkFaint)
                            .fixedSize(horizontal: false, vertical: true)

                        noteField

                        if photo.coordinates != nil {
                            placeToggle
                        }
                    }
                    .padding(.horizontal, Space.margin)

                    Spacer(minLength: Space.s8)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .disabled(stage == .sending)
        }
    }

    private var noteField: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            /* No label. The placeholder says what it is, and a field with a
               heading above it and a hint inside it says it twice. */
            TextField(
                "A line, if there is one",
                text: $note,
                axis: .vertical
            )
            .lineLimit(1...5)
            .font(.system(size: Size.body, design: .serif))
            .foregroundStyle(room.ink)
            .focused($writing)
            .padding(.vertical, Space.s2)

            Rule(tone: Tone.rule)
        }
        .padding(.top, Space.s2)
    }

    private var placeToggle: some View {
        Toggle(isOn: $keepPlace) {
            VStack(alignment: .leading, spacing: Space.s1) {
                Signage(text: "Keep where it was taken", tone: room.inkFaint)
                Text("Kept privately. Nothing is shown to anyone until you choose to show it, and each day is set on its own.")
                    .font(Face.grotesk(Size.micro))
                    .foregroundStyle(room.inkFaint.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(Tone.oxide)
        .padding(.top, Space.s3)
    }

    private var replacing: Bool { false }

    // MARK: Reading

    private func read(_ item: PhotosPickerItem) async {
        stage = .reading
        problem = nil

        guard let data = try? await item.loadTransferable(type: Data.self) else {
            problem = "That image could not be read. Try another."
            stage = .empty
            return
        }

        accept(
            data,
            filename: item.supportedContentTypes.first?.preferredFilenameExtension,
            takenNow: false
        )
    }

    /// Both routes end here: a file chosen from the library, and bytes handed
    /// over by the camera. One place decides what a chosen photograph is.
    private func accept(_ data: Data, filename: String? = "jpg", takenNow: Bool) {
        guard let prepared = Photograph.read(data, filename: filename, takenNow: takenNow) else {
            problem = "That image could not be read. Try another."
            stage = .empty
            return
        }

        photo = prepared
        /* The capture moment decides the day, in the zone the camera was
           standing in. Where there is none, today — in the archive owner's
           zone, never the device's, which is a different zone whenever they
           are travelling. */
        date = prepared.capturedAt.map { moment in
            CalendarDate(
                moment,
                in: prepared.captureTimeZone.flatMap(TimeZone.init(identifier:)) ?? timeZone
            )
        } ?? CalendarDate.today(in: timeZone)

        attempt = UUID().uuidString
        stage = .ready
    }

    // MARK: Recording

    private func record() {
        guard let photo, let date, stage == .ready else { return }
        writing = false
        stage = .sending
        problem = nil

        Task {
            let sent: Transfer.Sent
            do {
                sent = try await Transfer.send(photo)
            } catch {
                problem = (error as? LocalizedError)?.errorDescription
                    ?? "The photograph did not finish sending."
                stage = .ready
                return
            }

            do {
                let result = try await archive.submit(
                    owner: owner,
                    photo: SubmitPhoto(
                        assetId: sent.assetId,
                        sourceAssetId: sent.sourceAssetId,
                        date: date,
                        note: note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? nil
                            : note.trimmingCharacters(in: .whitespacesAndNewlines),
                        visibility: .private,
                        capturedAt: photo.capturedAt,
                        captureTimeZone: photo.captureTimeZone,
                        width: photo.width,
                        height: photo.height,
                        placeholder: photo.placeholder,
                        camera: photo.camera,
                        place: keepPlace && photo.coordinates != nil
                            ? Place(coordinates: photo.coordinates)
                            : nil,
                        idempotencyKey: attempt
                    )
                )

                /* The day that comes back is the archive's, not this screen's
                   guess at it. Showing our own version is how a screen comes
                   to disagree with its next refresh. */
                onRecorded(result.day)
                Task.detached { await Transfer.nudgePipeline() }
                dismiss()
            } catch {
                problem = (error as? LocalizedError)?.errorDescription
                    ?? "That could not be recorded. Try again."
                stage = .ready
            }
        }
    }
}
