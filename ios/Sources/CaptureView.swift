import SwiftUI
import PhotosUI

/*
 One screen.

 The archive's own conceit is that it takes disproportionate care over
 things that do not warrant it. That care should cost the archivist
 almost nothing at the moment of collection — position, accuracy,
 altitude, weather and capture time all arrive on their own. What is left
 to type is a title and, if there is anything to say, a sentence.
 */

struct CaptureView: View {
    @EnvironmentObject private var settings: Settings
    @StateObject private var capture = Capture()
    @StateObject private var conditions = FieldConditions()

    @State private var pickerItem: PhotosPickerItem?
    @State private var showingCamera = false
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            Form {
                photographSection
                recordSection
                positionSection
                filingSection
                fileSection
            }
            .navigationTitle("Accession")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView().environmentObject(settings)
            }
            .fullScreenCover(isPresented: $showingCamera) {
                CameraPicker { data in
                    capture.photo = Photograph.prepare(data)
                }
                .ignoresSafeArea()
            }
            .task {
                /* Ask for a position on opening, so that by the time a
                   title has been typed the fix is already in hand. */
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
                Button("Good") { capture.filed = nil }
            } message: {
                Text("\(capture.filed ?? "") is in the register. It appears on the site once the build finishes, a minute or two from now.")
            }
            .alert("Not filed", isPresented: failureBinding) {
                Button("Right") { capture.failure = nil }
            } message: {
                Text(capture.failure ?? "")
            }
        }
    }

    // MARK: Sections

    private var photographSection: some View {
        Section {
            if let photo = capture.photo, let image = UIImage(data: photo.data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 220)
                    .clipped()
                    .listRowInsets(EdgeInsets())

                LabeledContent("Dimensions", value: "\(photo.width) × \(photo.height)")
                    .font(.footnote.monospaced())

                if let captured = photo.captured {
                    LabeledContent("Captured", value: captured)
                        .font(.footnote.monospaced())
                }

                Button("Remove photograph", role: .destructive) {
                    capture.photo = nil
                    pickerItem = nil
                }
            } else {
                Button {
                    showingCamera = true
                } label: {
                    Label("Take a photograph", systemImage: "camera")
                }

                PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                    Label("Choose from library", systemImage: "photo.on.rectangle")
                }
            }
        } header: {
            Text("Photograph")
        } footer: {
            Text("Optional. A record without one draws a plate from its accession number instead.")
        }
    }

    private var recordSection: some View {
        Section("The record") {
            Picker("Department", selection: $capture.department) {
                ForEach(Department.capturable) { department in
                    Text(department.name).tag(department)
                }
            }

            TextField("Title", text: $capture.title, axis: .vertical)

            TextField("Summary — a line or two", text: $capture.summary, axis: .vertical)
                .lineLimit(1...3)

            TextField("Body", text: $capture.bodyText, axis: .vertical)
                .lineLimit(3...12)

            if capture.photo != nil {
                TextField("Alt text", text: $capture.alt, axis: .vertical)
                    .lineLimit(1...3)
            }
        }
    }

    private var positionSection: some View {
        Section {
            Toggle("Record the position", isOn: $capture.attachPosition)

            if conditions.isReading {
                HStack {
                    ProgressView()
                    Text("Taking a fix…").foregroundStyle(.secondary)
                }
            } else if let fix = conditions.fix {
                LabeledContent("Place", value: fix.placeName)
                if let region = fix.region {
                    LabeledContent("Region", value: region)
                }
                LabeledContent(
                    "Position",
                    value: String(format: "%.4f, %.4f", fix.coordinates.lat, fix.coordinates.lon)
                )
                .font(.footnote.monospaced())

                if let precision = fix.coordinates.precision {
                    LabeledContent("Claimed to", value: "± \(Int(precision.rounded())) m")
                        .font(.footnote.monospaced())
                }
                if let elevation = fix.coordinates.elevation {
                    LabeledContent("Elevation", value: "\(Int(elevation.rounded())) m")
                        .font(.footnote.monospaced())
                }
                if let weather = fix.weather {
                    LabeledContent("Weather", value: weather)
                }
            } else if let note = conditions.note {
                Text(note).foregroundStyle(.secondary)
            }

            Button("Take the position again") {
                Task { await conditions.read() }
            }
            .disabled(conditions.isReading)
        } header: {
            Text("Position")
        } footer: {
            Text("The accuracy is the instrument's own figure, not an estimate. It is drawn on the survey plot as a ring that size.")
        }
    }

    private var filingSection: some View {
        Section("Filing") {
            DatePicker("Dated", selection: $capture.date, displayedComponents: .date)

            Picker("Significance", selection: $capture.significance) {
                ForEach(Significance.allCases) { value in
                    Text(value.rawValue.capitalized).tag(value)
                }
            }

            Text(capture.significance.note)
                .font(.footnote)
                .foregroundStyle(.secondary)

            TextField("Tags, comma separated", text: $capture.tags)
                .textInputAutocapitalization(.never)
        }
    }

    private var fileSection: some View {
        Section {
            Button {
                Task { await capture.file(using: settings, conditions: conditions) }
            } label: {
                if capture.isFiling {
                    HStack {
                        ProgressView()
                        Text("Filing…")
                    }
                } else {
                    Text("Accession")
                }
            }
            .disabled(!capture.canFile)
        } footer: {
            if !settings.isReady {
                Text("No repository or token yet. Open Settings.")
            } else {
                Text("The next number in the department is drawn at the moment of filing.")
            }
        }
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
