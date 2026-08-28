import SwiftUI
import PhotosUI

/*
 Accessioning something.

 The archive's own conceit is that it takes disproportionate care over
 things that do not warrant it. That care should cost the archivist almost
 nothing at the moment of collection — position, accuracy, altitude,
 weather and capture time all arrive on their own. What is left to type is
 a title and, if there is anything to say, a sentence.

 Set as a ledger rather than as a form: labelled above, ruled beneath, no
 boxes. The institution does not use dialogs.
 */

struct CaptureView: View {
    @EnvironmentObject private var settings: Settings

    /// Called once a record is in the register.
    var onFiled: () -> Void

    @StateObject private var capture = Capture()
    @StateObject private var conditions = FieldConditions()

    @State private var pickerItem: PhotosPickerItem?
    @State private var showingCamera = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                photograph
                Rule()
                theRecord
                Rule()
                position
                Rule()
                filing
                stamp
            }
            .padding(.horizontal, Space.margin)
            .padding(.bottom, Space.s8)
        }
        .scrollDismissesKeyboard(.interactively)
        .fullScreenCover(isPresented: $showingCamera) {
            CameraPicker { data in
                capture.photo = Photograph.prepare(data)
            }
            .ignoresSafeArea()
        }
        .task {
            /* Ask for a position on opening, so that by the time a title
               has been typed the fix is already in hand. */
            if conditions.fix == nil { await conditions.read() }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    capture.photo = Photograph.prepare(data)
                }
            }
        }
        .alert("Accessioned", isPresented: filedBinding) {
            Button("Good") {
                capture.filed = nil
                onFiled()
            }
        } message: {
            Text("\(Accession.display(capture.filed ?? "")) is in the register. It appears on the site once the build finishes, a minute or two from now.")
        }
        .alert("Not filed", isPresented: failureBinding) {
            Button("Right") { capture.failure = nil }
        } message: {
            Text(capture.failure ?? "")
        }
    }

    // MARK: Photograph

    private var photograph: some View {
        Panel(
            title: "Photograph",
            note: "Optional. A record without one draws a plate from its accession number instead."
        ) {
            if let photo = capture.photo, let image = UIImage(data: photo.data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity)
                    .frame(height: 240)
                    .clipped()
                    .overlay { Rectangle().stroke(Tone.rule, lineWidth: 1) }

                Readout(key: "Dimensions", value: "\(photo.width) × \(photo.height)")
                if let captured = photo.captured {
                    Readout(key: "Captured", value: captured)
                }

                Rule(tone: Tone.ruleFaint)

                Button("Remove photograph") {
                    capture.photo = nil
                    pickerItem = nil
                }
                .buttonStyle(QuietButtonStyle())
                .foregroundStyle(Tone.oxide)
            } else {
                Button("Take a photograph") { showingCamera = true }
                    .buttonStyle(QuietButtonStyle())

                Rule(tone: Tone.ruleFaint)

                PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                    Signage(text: "Choose from the library", tone: Tone.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, Space.s3)
                }
            }
        }
    }

    // MARK: The record

    private var theRecord: some View {
        Panel(title: "The record") {
            ChoiceRow(
                label: "Department",
                options: Department.capturable,
                selection: $capture.department
            ) { $0.name }

            Text(capture.department.charter)
                .font(Face.editorial(Size.small, italic: true))
                .foregroundStyle(Tone.inkMuted)
                .fixedSize(horizontal: false, vertical: true)

            WritingField(
                "Title",
                placeholder: "What it is",
                text: $capture.title,
                lines: 1...3,
                face: Face.editorial(Size.lede)
            )

            WritingField(
                "Summary",
                placeholder: "A line or two",
                text: $capture.summary,
                lines: 1...4
            )

            WritingField(
                "Body",
                placeholder: "One paragraph per line. The first leads the record.",
                text: $capture.bodyText,
                lines: 3...14
            )

            if capture.photo != nil {
                WritingField(
                    "Alt text",
                    placeholder: "The photograph, described",
                    text: $capture.alt,
                    lines: 1...3
                )
            }
        }
    }

    // MARK: Position

    private var position: some View {
        Panel(
            title: "Position",
            note: "The accuracy is the instrument's own figure, not an estimate. It is drawn on the survey plot as a ring that size."
        ) {
            Toggle(isOn: $capture.attachPosition) {
                Signage(text: "Record the position", size: Size.small, tone: Tone.ink)
            }
            .tint(Tone.oxide)
            .padding(.vertical, Space.s1)

            Rule(tone: Tone.ruleFaint)

            if conditions.isReading {
                HStack(spacing: Space.s3) {
                    ProgressView().tint(Tone.inkGhost)
                    Signage(text: "Taking a fix", tone: Tone.inkGhost)
                }
                .padding(.vertical, Space.s3)
            } else if let fix = conditions.fix {
                Readout(key: "Place", value: fix.placeName)
                if let region = fix.region {
                    Readout(key: "Region", value: region)
                }
                Readout(
                    key: "Position",
                    value: String(format: "%.4f, %.4f", fix.coordinates.lat, fix.coordinates.lon)
                )
                if let precision = fix.coordinates.precision {
                    Readout(key: "Claimed to", value: "± \(Int(precision.rounded())) m")
                }
                if let elevation = fix.coordinates.elevation {
                    Readout(key: "Elevation", value: "\(Int(elevation.rounded())) m")
                }
                if let weather = fix.weather {
                    Readout(key: "Weather", value: weather)
                }
            } else if let note = conditions.note {
                Text(note)
                    .font(Face.editorial(Size.small))
                    .foregroundStyle(Tone.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.vertical, Space.s3)
            }

            Rule(tone: Tone.ruleFaint)

            Button("Take the position again") {
                Task { await conditions.read() }
            }
            .buttonStyle(QuietButtonStyle())
            .disabled(conditions.isReading)
        }
    }

    // MARK: Filing

    private var filing: some View {
        Panel(title: "Filing") {
            DatePicker(selection: $capture.date, displayedComponents: .date) {
                Signage(text: "Dated", size: Size.small, tone: Tone.ink)
            }
            .tint(Tone.oxide)
            .padding(.vertical, Space.s1)

            Rule(tone: Tone.ruleFaint)

            ChoiceRow(
                label: "Significance",
                options: Significance.allCases,
                selection: $capture.significance
            ) { $0.name }

            Text(capture.significance.note)
                .font(Face.editorial(Size.small, italic: true))
                .foregroundStyle(Tone.inkMuted)
                .fixedSize(horizontal: false, vertical: true)

            WritingField(
                "Tags",
                placeholder: "comma, separated",
                text: $capture.tags,
                face: Face.mono(Size.small),
                autocapitalisation: .never
            )
        }
    }

    // MARK: Filing it

    private var stamp: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Button {
                Task { await capture.file(using: settings, conditions: conditions) }
            } label: {
                Text(capture.isFiling ? "Filing" : "Accession")
            }
            .buttonStyle(StampButtonStyle())
            .disabled(!capture.canFile)

            Text(settings.isReady
                 ? "The next number in the department is drawn at the moment of filing."
                 : "No repository or token yet. Open Settings.")
                .font(Face.editorial(Size.small, italic: true))
                .foregroundStyle(settings.isReady ? Tone.inkMuted : Tone.oxide)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, Space.s5)
    }

    // MARK: Alert plumbing

    private var filedBinding: Binding<Bool> {
        Binding(get: { capture.filed != nil }, set: { if !$0 { capture.filed = nil } })
    }

    private var failureBinding: Binding<Bool> {
        Binding(get: { capture.failure != nil }, set: { if !$0 { capture.failure = nil } })
    }
}

// MARK: - Camera

/// The system camera. A photograph taken here carries no EXIF capture
/// date, which does not matter: a photograph taken here was taken now.
struct CameraPicker: UIViewControllerRepresentable {
    var onCapture: (Data) -> Void

    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera)
            ? .camera
            : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let parent: CameraPicker

        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage,
               let data = image.jpegData(compressionQuality: 1) {
                parent.onCapture(data)
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
