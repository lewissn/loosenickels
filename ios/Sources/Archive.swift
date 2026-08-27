import Foundation

/*
 The shapes the archive accepts.

 These mirror src/lib/archive/schema.ts. They are deliberately not clever:
 the site validates every record with zod at build time and fails loudly,
 so the job here is to produce something that passes, not to re-implement
 the validation. If this file and the schema ever disagree, the build is
 the one telling the truth.
 */

// MARK: - Departments

enum Department: String, CaseIterable, Identifiable, Codable {
    case objects = "OB"
    case places = "PL"
    case fieldNotes = "FN"
    case photographs = "PH"
    case thoughts = "TH"
    case sounds = "AU"
    case experiments = "XP"
    case research = "DR"

    var id: String { rawValue }

    var name: String {
        switch self {
        case .objects: return "Objects"
        case .places: return "Places"
        case .fieldNotes: return "Field Notes"
        case .photographs: return "Photographs"
        case .thoughts: return "Thoughts"
        case .sounds: return "Sounds"
        case .experiments: return "Experiments"
        case .research: return "Research"
        }
    }

    /// What the department is for, in the institution's own words.
    var charter: String {
        switch self {
        case .objects: return "Physical material retained without a stated reason."
        case .places: return "Locations recorded against their coordinates."
        case .fieldNotes: return "Observations made at a particular time, in a particular weather."
        case .photographs: return "Images held for their own sake."
        case .thoughts: return "Positions held briefly and recorded anyway."
        case .sounds: return "Audio taken from rooms, weather, machinery and open ground."
        case .experiments: return "Procedures carried out to see what would happen."
        case .research: return "Investigations into questions that did not require answering."
        }
    }

    /// The departments worth offering on a phone, in the order they get used.
    static var capturable: [Department] {
        [.photographs, .objects, .places, .fieldNotes, .thoughts]
    }
}

// MARK: - Significance

enum Significance: String, CaseIterable, Identifiable, Codable {
    case undetermined
    case negligible
    case personal
    case contested
    case considerable

    var id: String { rawValue }

    var note: String {
        switch self {
        case .undetermined: return "The archive has not formed a view."
        case .negligible: return "Of no importance by any measure. Retained regardless."
        case .personal: return "Significant to the archive and to nobody else."
        case .contested: return "Two or more incompatible views are held."
        case .considerable: return "A claim the archive is prepared to make. Used sparingly."
        }
    }
}

// MARK: - Record

struct Coordinates: Codable {
    var lat: Double
    var lon: Double
    /// Metres of uncertainty. This is the instrument's own figure, not a guess.
    var precision: Double?
    var elevation: Double?
}

struct Place: Codable {
    var name: String
    var region: String?
    var country: String?
    var coordinates: Coordinates?
}

struct ImageMedia: Codable {
    var kind: String = "image"
    var src: String
    var alt: String
    var width: Int
    var height: Int
    var captured: String?
}

/// The three block types worth typing on a phone. The schema has more.
struct ProseBlock: Codable {
    var type: String
    var text: String
}

struct Record: Codable {
    var id: String
    var dept: String
    var slug: String
    var title: String
    var summary: String?
    var body: [ProseBlock]
    var date: String
    var acquired: String?
    var place: Place?
    var tags: [String]
    var media: [ImageMedia]
    var weather: String?
    var significance: String
    var remark: String?

    var json: Data {
        get throws {
            let encoder = JSONEncoder()
            /* Sorted and indented, because these land in a git repository
               and a record whose diff is unreadable is a record nobody
               will ever correct. */
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            var data = try encoder.encode(self)
            data.append(0x0A) // The repository's files end in a newline.
            return data
        }
    }
}

// MARK: - Accession numbers

enum Accession {
    static let pattern = /^LN-(OB|PL|FN|PH|TH|AU|XP|DR)-([0-9]{4})$/

    /// `LN-OB-0007`
    static func format(_ dept: Department, _ sequence: Int) -> String {
        "LN-\(dept.rawValue)-" + String(format: "%04d", sequence)
    }

    /// The sequence number in a filename like `LN-OB-0007.json`, if it is one.
    static func sequence(inFilename name: String, dept: Department) -> Int? {
        guard name.hasSuffix(".json") else { return nil }
        let stem = String(name.dropLast(5))
        guard let match = stem.wholeMatch(of: pattern) else { return nil }
        guard String(match.1) == dept.rawValue else { return nil }
        return Int(match.2)
    }

    /**
     The next free number in a department.

     Sequences are never reused, including after a withdrawal, so this is
     the highest number yet issued plus one — not the count of what is
     currently held.
     */
    static func next(after filenames: [String], in dept: Department) -> Int {
        let used = filenames.compactMap { sequence(inFilename: $0, dept: dept) }
        return (used.max() ?? 0) + 1
    }
}

// MARK: - Slugs

enum Slug {
    /**
     A URL segment the schema will accept: `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

     Diacritics are folded rather than stripped, so "Ruin, unnamed on the
     1:25 000" becomes "ruin-unnamed-on-the-1-25-000" and a title with an
     é in it does not lose the letter entirely.
     */
    static func from(_ title: String, fallback: String) -> String {
        let folded = title.folding(
            options: [.diacriticInsensitive, .widthInsensitive],
            locale: Locale(identifier: "en_GB")
        ).lowercased()

        var out = ""
        var pendingSeparator = false

        for character in folded {
            if character.isLetter || character.isNumber {
                let scalars = String(character).unicodeScalars
                /* Anything that survived folding but is still not plain
                   ASCII would fail the pattern, so it is dropped. */
                guard scalars.allSatisfy({ $0.isASCII }) else {
                    pendingSeparator = true
                    continue
                }
                if pendingSeparator && !out.isEmpty { out.append("-") }
                pendingSeparator = false
                out.append(character)
            } else {
                pendingSeparator = true
            }
        }

        return out.isEmpty ? fallback : out
    }
}

// MARK: - Dates

enum ArchiveDate {
    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// The day, as the archive records days — local, not UTC. A thing found
    /// at eleven at night was found that day, whatever Greenwich thinks.
    static func stamp(_ date: Date) -> String {
        formatter.string(from: date)
    }
}
