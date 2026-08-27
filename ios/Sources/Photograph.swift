import Foundation
import UIKit
import ImageIO

/*
 Preparing a photograph for an archive that lives in a git repository.

 Two things matter. The file has to be a reasonable size, because every
 version of it is kept forever by git and a 12-megapixel HEIC is not a
 reasonable thing to keep forever. And the capture time has to be read
 before re-encoding, because re-encoding discards EXIF and the moment the
 photograph was taken is the one piece of metadata the archive actually
 cares about.
 */

enum Photograph {
    /// Long edge, in pixels. Comfortably more than the site ever displays.
    static let maximumEdge: CGFloat = 2400

    struct Prepared {
        var data: Data
        var width: Int
        var height: Int
        /// EXIF capture date, as yyyy-MM-dd, where the file carried one.
        var captured: String?
    }

    static func prepare(_ data: Data) -> Prepared? {
        guard let image = UIImage(data: data) else { return nil }

        /* Read this first. The re-encode below throws EXIF away. */
        let captured = captureDate(from: data)

        let normalised = downscaled(image)
        guard let jpeg = normalised.jpegData(compressionQuality: 0.85) else { return nil }

        return Prepared(
            data: jpeg,
            width: Int(normalised.size.width),
            height: Int(normalised.size.height),
            captured: captured
        )
    }

    /**
     Redraws the image at no more than `maximumEdge` on its long side.

     Drawing through a renderer also resolves EXIF orientation into the
     pixels, so the file on disk is upright and its stored dimensions are
     the dimensions it actually displays at. A rotated photograph filed
     with its aspect inverted is a subtle thing to notice later.
     */
    private static func downscaled(_ image: UIImage) -> UIImage {
        let size = image.size
        let longest = max(size.width, size.height)
        let scale = longest > maximumEdge ? maximumEdge / longest : 1

        let target = CGSize(
            width: (size.width * scale).rounded(),
            height: (size.height * scale).rounded()
        )

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1 // Points are pixels. The archive counts pixels.
        format.opaque = true

        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }

    private static func captureDate(from data: Data) -> String? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        else { return nil }

        let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any]
        let tiff = properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any]

        let raw = exif?[kCGImagePropertyExifDateTimeOriginal] as? String
            ?? exif?[kCGImagePropertyExifDateTimeDigitized] as? String
            ?? tiff?[kCGImagePropertyTIFFDateTime] as? String

        guard let raw else { return nil }

        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy:MM:dd HH:mm:ss"
        guard let date = parser.date(from: raw) else { return nil }

        return ArchiveDate.stamp(date)
    }
}
