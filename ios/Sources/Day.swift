import Foundation

/*
 The domain, as the phone holds it.

 This is a mirror of src/lib/archive/schema.ts, and it is a mirror on
 purpose: the two clients are presentation layers over one contract and
 neither is permitted to invent a rule of its own. Where this file and that
 one disagree, the SQL migrations settle it — they are where row level
 security lives, and RLS is the single answer to who may see what.

 The museum that used to be here — departments, accession numbers,
 significance ratings — is gone. It is preserved complete at the tag
 `institute-final`.
 */

// MARK: - Calendar dates

/**
 A calendar date is not an instant, and the distinction is the whole of why
 this is a type rather than a `Date`.

 A calendar date is the day a photograph belongs to, as the person who took
 it would name it. An instant is a moment. A photograph taken at 23:40 in
 Tokyo belongs to that Tokyo day whoever is looking at it and wherever the
 server lives, so nothing here reads the device's zone by accident: every
 conversion names the zone it is converting in.
 */
struct CalendarDate: Hashable, Codable, CustomStringConvertible, Comparable {
    /// `yyyy-MM-dd`. The wire format, and the sort order, and the same
    /// string Postgres stores in a `date` column.
    let value: String

    init?(_ value: String) {
        guard Self.shape.firstMatch(
            in: value,
            range: NSRange(value.startIndex..., in: value)
        ) != nil else { return nil }
        self.value = value
    }

    /// The calendar date a moment falls on, in a named zone.
    init(_ moment: Date, in timeZone: TimeZone) {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        value = formatter.string(from: moment)
    }

    static func today(in timeZone: TimeZone) -> CalendarDate {
        CalendarDate(Date(), in: timeZone)
    }

    private static let shape = try! NSRegularExpression(
        pattern: "^\\d{4}-\\d{2}-\\d{2}$"
    )

    var description: String { value }

    /* Lexicographic order is chronological order for this format, which is
       the reason the format was chosen. */
    static func < (a: CalendarDate, b: CalendarDate) -> Bool { a.value < b.value }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        /* Postgres will hand back `2026-08-28`; a `timestamptz` mistakenly
           selected into this column would hand back something longer. Take
           the date component rather than failing, because the alternative
           is a screen that shows nothing over a formatting difference. */
        guard let parsed = CalendarDate(String(raw.prefix(10))) else {
            throw DecodingError.dataCorruptedError(
                in: try decoder.singleValueContainer(),
                debugDescription: "Not a calendar date: \(raw)"
            )
        }
        self = parsed
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value)
    }

    var year: Int { Int(value.prefix(4)) ?? 0 }

    /// "Friday 28 August 2026", in the archive's own register.
    func spelled(in timeZone: TimeZone) -> String {
        guard let date = Self.parser(timeZone).date(from: value) else { return value }
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_GB")
        out.timeZone = timeZone
        out.dateFormat = "EEEE d MMMM yyyy"
        return out.string(from: date)
    }

    private static func parser(_ timeZone: TimeZone) -> DateFormatter {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = timeZone
        parser.dateFormat = "yyyy-MM-dd"
        return parser
    }
}

// MARK: - Enumerations
//
// The spellings are the SQL enum labels exactly. A Swift case that decodes
// to a different string is a row the database will refuse to write.

enum DayVisibility: String, Codable, CaseIterable, Identifiable {
    case `private`, unlisted, `public`

    var id: String { rawValue }

    var name: String {
        switch self {
        case .private: return "Private"
        case .unlisted: return "Anyone with the link"
        case .public: return "Public"
        }
    }
}

enum ProfileVisibility: String, Codable {
    case `private`, `public`, discoverable
}

/// Ordered by increasing disclosure, so a comparison means "reveals no
/// more than". The order is the meaning; do not rearrange the cases.
enum LocationPrecision: String, Codable, CaseIterable, Identifiable, Comparable {
    case hidden, region, locality, approximate, precise

    var id: String { rawValue }

    var rank: Int { Self.allCases.firstIndex(of: self) ?? 0 }

    static func < (a: Self, b: Self) -> Bool { a.rank < b.rank }

    var name: String {
        switch self {
        case .hidden: return "Not shown"
        case .region: return "Region only"
        case .locality: return "Town or city"
        case .approximate: return "Approximate"
        case .precise: return "Exact"
        }
    }
}

enum ProcessingState: String, Codable {
    case pending, processing, ready, failed
}

enum MediaVariant: String, Codable {
    case original
    /// A decodable transcode of an original the server cannot open — an
    /// HEIC, in practice. Made on the device, which has an HEVC decoder
    /// where the server does not.
    case source
    case large, medium, thumbnail

    /// Never handed to anyone but the owner. Both are faithful copies of
    /// what the camera wrote, EXIF and all, so both carry the GPS tag out
    /// past any redaction of the location columns. Only the resized
    /// renditions are safe to publish.
    var isOwnerOnly: Bool { self == .original || self == .source }
}

// MARK: - Values

struct Coordinates: Codable, Equatable {
    var lat: Double
    var lon: Double
    var accuracy: Double?
    var elevation: Double?
}

struct Place: Codable, Equatable {
    var label: String?
    var region: String?
    var country: String?
    var coordinates: Coordinates?
}

/**
 The weather as it stood, kept whole.

 Mirrors the `weather` object in schema.ts, and is stored as jsonb rather
 than as columns because it is supplementary and never queried across —
 nobody will ask this archive for every rainy Tuesday.

 Nothing populates it yet. The shape exists on both sides so that when
 something does, neither client needs changing to show it.
 */
struct Weather: Codable, Equatable {
    /// Degrees Celsius. Presentation converts; storage does not.
    var temperatureC: Double?
    /// A short human phrase: "Light rain", "Clear".
    var conditions: String?
    /// Millimetres in the hour of capture.
    var precipitationMm: Double?
    /// Metres per second.
    var windMs: Double?
    var daylight: Bool?

    var isEmpty: Bool {
        temperatureC == nil && conditions == nil
            && precipitationMm == nil && windMs == nil
    }
}

struct Camera: Codable, Equatable {
    var make: String?
    var model: String?
    var lens: String?
    var focalLength: Double?
    var aperture: Double?
    var shutterSpeed: Double?
    var iso: Int?

    /// A photograph from a screenshot knows none of this. Seven nils is not
    /// a camera, and rendering it produces a line made only of separators.
    var isEmpty: Bool {
        make == nil && model == nil && lens == nil && focalLength == nil
            && aperture == nil && shutterSpeed == nil && iso == nil
    }
}

// MARK: - Resolved shapes
//
// What a surface is handed. Already reduced to what this viewer is entitled
// to, with URLs already signed — a caller cannot accidentally show a private
// coordinate, because it was never given one.

/**
 One cell of the photograph's coarse map.

 `l` says whether ink over this area should be pale or dark. `v` says whether
 it should be there at all: a cell of even tone is sky or wall or water and
 will hold text, while a cell of high variance is branches or a crowd and
 will swallow it. Luma alone cannot tell a grey wall from half-black-half-
 white branches; variance can, and that difference is the whole of what makes
 the layout photograph-aware rather than decorative.
 */
struct Region: Codable, Equatable {
    var l: Double
    var v: Double
}

struct ResolvedPhoto: Identifiable, Equatable {
    var assetId: String
    var width: Int
    var height: Int
    var placeholder: String?
    /// Rec. 709 luma, 0–1. What the photograph does to the room around it.
    var lightness: Double?
    /// One restrained colour from the image, `#rrggbb`, for the ground.
    var tone: String?
    /// A 4x6 grid, row-major from the top-left. Absent for anything resized
    /// before this existed, so every reader must cope without it.
    var regions: [Region]?
    var processing: ProcessingState
    /// Signed and expiring, by intent. An absent variant is not yet made.
    var urls: [MediaVariant: URL]
    var alt: String

    var id: String { assetId }

    /// The largest rendition this viewer was given.
    ///
    /// `original` is late in the list and `source` is absent: a photograph
    /// recorded a moment ago has no renditions yet, and showing its original
    /// is better than showing nothing — but a transcode made purely for the
    /// resizer is never the thing to display. Neither is present at all
    /// unless the viewer owns the photograph.
    var best: URL? {
        urls[.large] ?? urls[.medium] ?? urls[.thumbnail] ?? urls[.original]
    }

    var aspect: Double {
        height > 0 ? Double(width) / Double(height) : 1
    }
}

struct ResolvedDay: Identifiable, Equatable {
    var date: CalendarDate
    var note: String?
    var visibility: DayVisibility
    var photo: ResolvedPhoto
    var capturedAt: Date?
    var captureTimeZone: String?
    var place: Place?
    var weather: Weather?
    var camera: Camera?
    /// Present only for the owner. Visitors are not told a day was revised.
    var revisionCount: Int?

    var id: String { date.value }
}

/// The listing projection: a year of days, a calendar, a map.
struct DaySummary: Identifiable, Equatable {
    var date: CalendarDate
    var thumbnailUrl: URL?
    var width: Int
    var height: Int
    var placeholder: String?

    var id: String { date.value }
}

/// What the owner is told about their own archive, and nobody else is.
struct ArchiveStatus: Equatable {
    var today: CalendarDate
    /// The zone `today` was reckoned in. Carried beside it so no surface
    /// reaches for the device's zone instead — a different zone whenever
    /// the reader is travelling, and a clock that disagrees with its date.
    var timeZone: TimeZone
    var todayRecorded: Bool
    /// Stated plainly, never as a streak. A gap is not a failure.
    var daysRecorded: Int
    var earliest: CalendarDate?
    var latest: CalendarDate?
}

struct Profile: Equatable {
    var id: String
    var handle: String
    var displayName: String?
    var bio: String?
    var visibility: ProfileVisibility
    var timeZone: TimeZone
    var locationPrecision: LocationPrecision
}
