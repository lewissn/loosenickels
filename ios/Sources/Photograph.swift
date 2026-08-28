import Foundation
import UIKit
import ImageIO
import CoreLocation

/*
 Reading what a photograph knows about itself.

 This used to downscale to 2400px and re-encode as JPEG, because every
 version of every file was being kept forever by git and a 12-megapixel HEIC
 is not a reasonable thing to keep forever in a repository. Object storage
 removed that reason, and with it the compromise: the original goes up
 untouched, at full resolution, in whatever format the camera wrote.

 What is still true is that the metadata has to be read on the device. The
 server receives an object key and never the file, so anything not read here
 is lost — and re-encoding would have thrown it away regardless.

 Every field is optional. A screenshot with no metadata must be exactly as
 easy to record as a raw file.
 */

enum Photograph {
    struct Prepared {
        /// The original bytes, untouched. Preserved exactly as the camera
        /// wrote them, whatever the server can or cannot read.
        var data: Data
        var contentType: String

        /// A JPEG transcode, present only when `data` is a format the server
        /// cannot decode — an HEIC, in practice.
        ///
        /// sharp reads HEIC metadata and decodes none of it: the prebuilt
        /// binaries ship without an HEVC decoder for licensing reasons. This
        /// phone has one, so the conversion happens where it is possible
        /// rather than where it would be convenient. Uploaded alongside the
        /// original as the `source` variant, purely so the pipeline has
        /// something to read; it is owner-only and may be swept afterwards.
        var source: Data?
        var sourceContentType: String? { source == nil ? nil : "image/jpeg" }

        /// Whether the original needs the transcode above to be usable.
        var needsSource: Bool { source != nil }

        /// Pixel dimensions with EXIF orientation already resolved, so the
        /// stored shape is the shape it displays at. A rotated photograph
        /// filed with its aspect inverted is a subtle thing to notice later.
        var width: Int
        var height: Int

        /// A tiny inline JPEG, shown while the real one decodes.
        var placeholder: String?

        /* What the photograph does to the room, measured here as well as in
           the pipeline. The server's numbers are the ones that get stored —
           they are computed from the full-resolution original rather than
           from a preview — but the compose sheet needs to light itself the
           moment a picture is chosen, and that is long before any server has
           seen it. */
        var lightness: Double?
        var tone: String?

        /// Wall-clock capture reading, and the offset the camera recorded.
        var capturedAt: Date?
        var captureTimeZone: String?

        var camera: Camera?
        var coordinates: Coordinates?

        /// For the preview, without re-reading the file.
        var preview: UIImage?
    }

    /// Longest edge of the inline placeholder. Small on purpose — it is
    /// carried in a database column and shown for a fraction of a second.
    private static let placeholderEdge: CGFloat = 20

    static func read(_ data: Data, filename: String?) -> Prepared? {
        guard let cgSource = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }

        let properties = CGImageSourceCopyPropertiesAtIndex(cgSource, 0, nil) as? [CFString: Any] ?? [:]
        let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any] ?? [:]
        let tiff = properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any] ?? [:]
        let gps = properties[kCGImagePropertyGPSDictionary] as? [CFString: Any] ?? [:]

        let image = UIImage(data: data)
        let size = orientedSize(properties: properties, fallback: image?.size)

        let capture = captureMoment(exif: exif, tiff: tiff)
        /* Optional because a file the decoder refuses has no room to
           measure — the same reason `preview` is optional. */
        let measured: (lightness: Double, tone: String)? = image.map(environment)
        let type = contentType(for: cgSource, filename: filename)

        return Prepared(
            data: data,
            contentType: type,
            source: DECODABLE_BY_SERVER.contains(type) ? nil : transcode(image),
            width: Int(size.width),
            height: Int(size.height),
            placeholder: image.flatMap(placeholder),
            lightness: measured?.lightness,
            tone: measured?.tone,
            capturedAt: capture?.moment,
            captureTimeZone: capture?.zone,
            camera: camera(exif: exif, tiff: tiff),
            coordinates: coordinates(gps: gps),
            preview: image
        )
    }

    // MARK: Shape

    private static func orientedSize(
        properties: [CFString: Any],
        fallback: CGSize?
    ) -> CGSize {
        let width = properties[kCGImagePropertyPixelWidth] as? CGFloat
        let height = properties[kCGImagePropertyPixelHeight] as? CGFloat

        guard let width, let height else { return fallback ?? .zero }

        /* Orientations 5 to 8 are the quarter turns. The pixel dimensions
           in the file are pre-rotation, so a portrait photograph from a
           phone reports itself landscape until this is applied. */
        let orientation = properties[kCGImagePropertyOrientation] as? Int ?? 1
        return (5...8).contains(orientation)
            ? CGSize(width: height, height: width)
            : CGSize(width: width, height: height)
    }

    // MARK: Time

    private static func captureMoment(
        exif: [CFString: Any],
        tiff: [CFString: Any]
    ) -> (moment: Date, zone: String)? {
        let reading = exif[kCGImagePropertyExifDateTimeOriginal] as? String
            ?? exif[kCGImagePropertyExifDateTimeDigitized] as? String
            ?? tiff[kCGImagePropertyTIFFDateTime] as? String

        guard let reading else { return nil }

        /* EXIF's DateTimeOriginal is wall-clock time at the camera with no
           zone attached. Newer files carry the offset separately; older
           ones carry nothing at all, and for those the device's current
           zone is the least-wrong guess available — the alternative is to
           record no time, which loses more.

           This is the field that files a Tokyo evening on the wrong day if
           it is parsed as UTC. It is not parsed as UTC. */
        let offset = exif[kCGImagePropertyExifOffsetTimeOriginal] as? String
        let zone = offset.flatMap(TimeZone.init(iso8601:)) ?? .current

        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy:MM:dd HH:mm:ss"
        parser.timeZone = zone

        guard let moment = parser.date(from: reading) else { return nil }
        return (moment, name(for: zone, at: moment))
    }

    /**
     A zone name the other end can actually use.

     `TimeZone(secondsFromGMT:)` has an identifier like `GMT+0100`, and that
     string is not a time zone as far as anything else is concerned:
     `Intl.DateTimeFormat` rejects it outright, and a rejection inside the
     website's resolve loop took the whole archive down rather than one
     photograph's clock. Postgres accepted it happily, which is how a value
     nothing could read came to be stored in the first place.

     So: the device's own zone where it agrees with what the camera recorded,
     which is very nearly always — the photograph was taken by this phone, in
     this place. That keeps the real name, `Europe/London`, and with it the
     knowledge of when the clocks change.

     Otherwise the ISO offset, `+01:00`, which is accepted everywhere and is
     honest about being less than a zone: it says what the camera knew and
     claims nothing more.
     */
    private static func name(for zone: TimeZone, at moment: Date) -> String {
        let here = TimeZone.current
        if here.secondsFromGMT(for: moment) == zone.secondsFromGMT(for: moment) {
            return here.identifier
        }

        let seconds = zone.secondsFromGMT(for: moment)
        let sign = seconds < 0 ? "-" : "+"
        let total = abs(seconds) / 60
        return String(format: "%@%02d:%02d", sign, total / 60, total % 60)
    }

    // MARK: Camera

    private static func camera(exif: [CFString: Any], tiff: [CFString: Any]) -> Camera? {
        let camera = Camera(
            make: tiff[kCGImagePropertyTIFFMake] as? String,
            model: tiff[kCGImagePropertyTIFFModel] as? String,
            lens: exif[kCGImagePropertyExifLensModel] as? String,
            focalLength: exif[kCGImagePropertyExifFocalLength] as? Double,
            aperture: exif[kCGImagePropertyExifFNumber] as? Double,
            shutterSpeed: exif[kCGImagePropertyExifExposureTime] as? Double,
            iso: (exif[kCGImagePropertyExifISOSpeedRatings] as? [Int])?.first
        )
        return camera.isEmpty ? nil : camera
    }

    // MARK: Position

    private static func coordinates(gps: [CFString: Any]) -> Coordinates? {
        guard let lat = gps[kCGImagePropertyGPSLatitude] as? Double,
              let lon = gps[kCGImagePropertyGPSLongitude] as? Double
        else { return nil }

        /* EXIF stores magnitude and hemisphere separately. Ignoring the
           reference puts every southern or western photograph in the wrong
           quadrant of the world — a bug that looks like nothing at all
           until somebody photographs something in Chile. */
        let south = (gps[kCGImagePropertyGPSLatitudeRef] as? String) == "S"
        let west = (gps[kCGImagePropertyGPSLongitudeRef] as? String) == "W"

        var elevation = gps[kCGImagePropertyGPSAltitude] as? Double
        if (gps[kCGImagePropertyGPSAltitudeRef] as? Int) == 1, let above = elevation {
            elevation = -above // Below sea level.
        }

        return Coordinates(
            lat: south ? -lat : lat,
            lon: west ? -lon : lon,
            accuracy: gps[kCGImagePropertyGPSHPositioningError] as? Double,
            elevation: elevation
        )
    }

    // MARK: The room it makes

    /**
     Rec. 709 luma and one restrained colour, from a 32-pixel sample.

     The same arithmetic as `environmentOf` in the pipeline, deliberately:
     the sheet lights itself from these and then the archive lights itself
     from the server's version of the same measurement, and if the two
     disagreed the room would change colour a few seconds after a photograph
     was recorded, for no reason a person could see.

     Luma rather than the mean of the channels, because green reads far
     brighter to the eye than blue at the same value.
     */
    private static func environment(_ image: UIImage) -> (lightness: Double, tone: String) {
        let side = 32
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true

        let small = UIGraphicsImageRenderer(
            size: CGSize(width: side, height: side), format: format
        ).image { _ in
            image.draw(in: CGRect(x: 0, y: 0, width: side, height: side))
        }

        guard let cg = small.cgImage,
              let data = cg.dataProvider?.data,
              let bytes = CFDataGetBytePtr(data)
        else { return (0.5, "#808080") }

        let perPixel = cg.bitsPerPixel / 8
        var luma = 0.0, r = 0.0, g = 0.0, b = 0.0
        let count = cg.width * cg.height

        for i in stride(from: 0, to: count * perPixel, by: perPixel) {
            let red = Double(bytes[i]), green = Double(bytes[i + 1]), blue = Double(bytes[i + 2])
            luma += 0.2126 * red + 0.7152 * green + 0.0722 * blue
            r += red; g += green; b += blue
        }

        /* Pulled well toward neutral before it is used as a ground: the full
           average reads as a coloured wash competing with the picture, where
           a third of it reads as the light in the room. */
        let toward = { (channel: Double) -> Int in
            Int((128 + (channel / Double(count) - 128) * 0.35).rounded())
        }
        let hex = { (n: Int) in String(format: "%02x", max(0, min(255, n))) }

        return (
            luma / Double(count) / 255,
            "#\(hex(toward(r)))\(hex(toward(g)))\(hex(toward(b)))"
        )
    }

    // MARK: Placeholder

    private static func placeholder(_ image: UIImage) -> String? {
        let size = image.size
        let longest = max(size.width, size.height)
        guard longest > 0 else { return nil }

        let scale = placeholderEdge / longest
        let target = CGSize(
            width: max(1, (size.width * scale).rounded()),
            height: max(1, (size.height * scale).rounded())
        )

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true

        let tiny = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }

        guard let jpeg = tiny.jpegData(compressionQuality: 0.4) else { return nil }
        return "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
    }

    // MARK: Transcoding

    /* What the server's own pipeline can decode. Everything else needs the
       phone to do it first. AVIF is absent on purpose: sharp reports it
       unsupported in the same build, so it would fail exactly as HEIC does. */
    private static let DECODABLE_BY_SERVER: Set<String> = [
        "image/jpeg", "image/png", "image/webp",
    ]

    /// Quality 0.92: visually indistinguishable at any size the archive
    /// shows, and this is a working copy rather than the kept one — the
    /// original is uploaded untouched beside it.
    private static func transcode(_ image: UIImage?) -> Data? {
        image?.jpegData(compressionQuality: 0.92)
    }

    // MARK: Type

    private static func contentType(for source: CGImageSource, filename: String?) -> String {
        if let uti = CGImageSourceGetType(source) as String?,
           let type = UTTypeMap[uti] {
            return type
        }

        /* A last resort, and a deliberate one: the upload route refuses
           anything it does not recognise, which is better than storing
           bytes under a type that is a guess. */
        let ext = (filename as NSString?)?.pathExtension.lowercased() ?? ""
        return ExtensionMap[ext] ?? "application/octet-stream"
    }

    private static let UTTypeMap: [String: String] = [
        "public.jpeg": "image/jpeg",
        "public.png": "image/png",
        "org.webmproject.webp": "image/webp",
        "public.avif": "image/avif",
        "public.heic": "image/heic",
        "public.heif": "image/heif",
    ]

    private static let ExtensionMap: [String: String] = [
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png", "webp": "image/webp",
        "avif": "image/avif", "heic": "image/heic", "heif": "image/heif",
    ]
}

private extension TimeZone {
    /// EXIF writes the offset as "+01:00". A zone made from seconds has no
    /// name, which is what `captureTimeZone` records — an offset is not a
    /// zone, but it is what the camera knew and it is better than nothing.
    init?(iso8601 offset: String) {
        let sign = offset.hasPrefix("-") ? -1 : 1
        let digits = offset.dropFirst().split(separator: ":")
        guard digits.count == 2,
              let hours = Int(digits[0]), let minutes = Int(digits[1])
        else { return nil }
        self.init(secondsFromGMT: sign * (hours * 3600 + minutes * 60))
    }
}
