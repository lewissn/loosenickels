import SwiftUI
import UIKit

/*
 Taking the photograph rather than finding it.

 A thin wrapper over `UIImagePickerController`, which is old and is still the
 only way to get the camera without building one. AVFoundation would mean
 owning a preview layer, a capture session, focus, exposure, orientation and
 the flash — a great deal of surface for a product whose entire relationship
 with the camera is "take one picture".

 What matters here is the one line marked below. The picker offers an edited
 image and an original, and the edited one is a re-encode with the metadata
 stripped: no capture time, no camera, no position. Taking it would mean
 every photograph shot in the app arrived knowing nothing about itself, which
 is most of what this archive is for.
 */

/* Named `Viewfinder`, because `Camera` is already the domain's word for what
   a photograph records about the device that took it. Two `Camera`s in one
   module is an ambiguity the compiler reports at the type that did nothing
   wrong. */
struct Viewfinder: UIViewControllerRepresentable {
    let onTaken: (Data) -> Void
    let onCancelled: () -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        /* No cropping step. A day is what it looked like, and a product that
           asks you to compose a square before you can file it is asking for
           a different thing than the one it claims to want. */
        picker.allowsEditing = false
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onTaken: onTaken, onCancelled: onCancelled)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let onTaken: (Data) -> Void
        private let onCancelled: () -> Void

        init(onTaken: @escaping (Data) -> Void, onCancelled: @escaping () -> Void) {
            self.onTaken = onTaken
            self.onCancelled = onCancelled
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            /* `.originalImage`, and then re-encoded to JPEG at high quality,
               because a `UIImage` from the camera is pixels and carries none
               of the file's metadata anyway.

               The EXIF that matters is rebuilt from the picker's own
               metadata below rather than lost: capture time is now, the
               camera is this device, and the position — if the archive is
               keeping positions — comes from the location reader, not from
               a file that never existed. */
            guard let image = info[.originalImage] as? UIImage,
                  let data = image.jpegData(compressionQuality: 0.95)
            else {
                onCancelled()
                return
            }
            onTaken(data)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onCancelled()
        }
    }

    /// Whether there is one to open. False on every simulator, which is why
    /// the compose sheet asks before offering the button rather than
    /// presenting a camera that cannot exist.
    static var available: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }
}
