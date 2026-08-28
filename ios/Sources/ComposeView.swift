import SwiftUI
import PhotosUI

/*
 Recording a day.

 Three things happen and they are deliberately separate. The file is read on
 the device, because the server never sees it and anything not read here is
 lost. The bytes go to object storage. Then, and only then, a day is told
 which photograph is its own.

 The middle step is the one that fails outdoors, and the separation is what
 makes that survivable: a failed commit can be retried without sending the
 photograph again, and the idempotency key means a reply that never arrived
 cannot produce a second copy of the same day.
 */

struct ComposeView: View {
    let owner: String
    let timeZone: TimeZone
    let onRecorded: (ResolvedDay) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var picked: PhotosPickerItem?
    @State private var photo: Photograph.Prepared?
    @State private var date: CalendarDate?
    @State private var note = ""
    @State private var stage: Stage = .empty
    @State private var problem: String?
    @State private var includePlace = true

    /* Generated once per chosen photograph and kept across retries, so a
       connection that drops after the request left but before the reply
       arrived cannot write the same day twice. */
    @State private var attempt = UUID().uuidString

    private let archive: ArchiveSource = SupabaseArchive()

    private enum Stage: Equatable {
        case empty, reading, ready, sending
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Paper()

                ScrollView {
                    VStack(alignment: .leading, spacing: Space.s5) {
                        chooser

                        if stage == .ready || stage == .sending, let photo, let date {
                            details(photo: photo, date: date)
                        }


                    }
                    .padding(.horizontal, Space.margin)
                    .padding(.vertical, Space.s4)
                }
            }
            /* Above the fold and impossible to scroll past. This lived at
               the bottom of the stack, under a full-height preview, which
               is why a failed recording read as a button that did nothing:
               the message was there and nobody was ever looking at it. */
            .safeAreaInset(edge: .top) {
                if let problem {
                    Text(problem)
                        .font(.system(size: Size.small))
                        .foregroundStyle(Tone.ground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Space.margin)
                        .padding(.vertical, Space.s3)
                        .background(Tone.oxide)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .navigationTitle("Record a day")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .disabled(stage == .sending)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(stage == .sending ? "Sending" : "Record") { record() }
                        .disabled(stage != .ready)
                }
            }
        }
        .onChange(of: picked) { _, item in
            guard let item else { return }
            Task { await read(item) }
        }
    }

    // MARK: Choosing

    private var chooser: some View {
        PhotosPicker(
            selection: $picked,
            matching: .images,
            /* The original, not a rendered copy. `.current` would hand over
               a version with the edits applied and the EXIF stripped, which
               is the metadata the archive is here to keep. */
            photoLibrary: .shared()
        ) {
            ZStack {
                if let preview = photo?.preview {
                    Image(uiImage: preview)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                } else {
                    VStack(spacing: Space.s2) {
                        Image(systemName: "photo")
                            .font(.system(size: Size.display, weight: .ultraLight))
                            .foregroundStyle(Tone.inkGhost)
                        Signage(
                            text: stage == .reading ? "Reading" : "Choose a photograph",
                            tone: Tone.inkFaint
                        )
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Space.s8)
                    .background(Tone.wash)
                }
            }
        }
        .disabled(stage == .sending)
    }

    // MARK: Details

    @ViewBuilder
    private func details(photo: Photograph.Prepared, date: CalendarDate) -> some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Signage(text: "Day", tone: Tone.inkFaint)
            Text(date.spelled(in: timeZone))
                .font(.system(size: Size.lede, design: .serif))
                .foregroundStyle(Tone.ink)

            /* Where the date came from, said plainly. A photograph that
               carried no capture time is filed under today, and the reader
               should know that rather than discover it later. */
            Signage(
                text: photo.capturedAt == nil
                    ? "This file records no capture time, so today is assumed."
                    : "From the photograph's own capture time.",
                tone: Tone.inkGhost
            )
        }

        WritingField("Note", placeholder: "A sentence, if there is one.", text: $note, lines: 2...5)

        if photo.coordinates != nil {
            Toggle(isOn: $includePlace) {
                VStack(alignment: .leading, spacing: Space.s1) {
                    Signage(text: "Keep the location", tone: Tone.inkFaint)
                    Text("Stored privately. Nothing is shown to anyone until you choose to show it, and each day is set separately.")
                        .font(.system(size: Size.fine))
                        .foregroundStyle(Tone.inkGhost)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .tint(Tone.oxide)
        }
    }

    // MARK: Reading

    private func read(_ item: PhotosPickerItem) async {
        stage = .reading
        problem = nil

        guard let data = try? await item.loadTransferable(type: Data.self) else {
            problem = "That image could not be read. Try another."
            stage = .empty
            return
        }

        guard let prepared = Photograph.read(data, filename: item.supportedContentTypes.first?.preferredFilenameExtension) else {
            problem = "That image could not be read. Try another."
            stage = .empty
            return
        }

        photo = prepared
        /* The capture moment decides the day, in the zone the camera was
           standing in. Where there is none, today — in the archive owner's
           zone, never the device's. */
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
                        place: includePlace && photo.coordinates != nil
                            ? Place(coordinates: photo.coordinates)
                            : nil,
                        idempotencyKey: attempt
                    )
                )

                /* The day that comes back is the archive's, not this
                   screen's guess at it. Showing our own version instead is
                   how a screen comes to disagree with its next refresh. */
                onRecorded(result.day)
                /* Detached so dismissing is not waiting on it. */
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
