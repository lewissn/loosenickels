import Foundation

/*
 Reading the register.

 The filenames in src/content/records are the accession numbers, so the
 directory listing is the register itself. Reading what is in each record
 costs one request per file, which for an archive of this size is a
 second and change and is not worth engineering around.

 Nothing here writes. The register is a way of looking at the archive from
 the phone; changing a record is a different path with different
 guarantees, and it does not exist yet.
 */

// MARK: - What a listing needs

/**
 A record, as far as a list is concerned.

 Deliberately not `Record`. That type exists to *produce* something the
 website's schema will accept, and it covers only the fields worth typing
 on a phone. This one has to *consume* whatever is already in the archive,
 including block types and media kinds the app has no opinion about — so
 it reads the handful of fields a listing needs and ignores the rest. A
 record with a measurements table in it still appears in the register.
 */
struct RecordSummary: Identifiable, Equatable {
    var id: String
    var dept: Department
    var slug: String
    var title: String
    var summary: String?
    var date: String
    var significance: Significance
    var status: String
    var place: String?
    var tags: [String]
    var thumbnail: Thumbnail?

    struct Thumbnail: Equatable {
        var src: String
        var alt: String
        var width: Int
        var height: Int
    }

    /// True when the record draws a plate rather than showing media.
    var isPlate: Bool { thumbnail == nil }
}

extension RecordSummary: Decodable {
    private enum Key: String, CodingKey {
        case id, dept, slug, title, summary, date, significance, status, place, tags, media
    }

    private struct PlaceName: Decodable {
        var name: String
    }

    /// Media as read rather than as written: the kind is the only field
    /// that is certainly there, and audio carries none of the rest.
    private struct AnyMedia: Decodable {
        var kind: String
        var src: String?
        var alt: String?
        var width: Int?
        var height: Int?
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)

        id = try c.decode(String.self, forKey: .id)

        let code = try c.decode(String.self, forKey: .dept)
        guard let department = Department(rawValue: code) else {
            throw DecodingError.dataCorruptedError(
                forKey: .dept,
                in: c,
                debugDescription: "\(code) is not a department this app knows."
            )
        }
        dept = department

        slug = try c.decode(String.self, forKey: .slug)
        title = try c.decode(String.self, forKey: .title)
        summary = try c.decodeIfPresent(String.self, forKey: .summary)
        date = try c.decode(String.self, forKey: .date)

        /* Both default in the schema, so their absence is legal and an
           unfamiliar value is the website's problem, not the list's. */
        significance = Significance(
            rawValue: try c.decodeIfPresent(String.self, forKey: .significance) ?? ""
        ) ?? .undetermined
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "accessioned"

        place = try c.decodeIfPresent(PlaceName.self, forKey: .place)?.name
        tags = try c.decodeIfPresent([String].self, forKey: .tags) ?? []

        let media = try c.decodeIfPresent([AnyMedia].self, forKey: .media) ?? []
        thumbnail = media
            .first { $0.kind == "image" }
            .flatMap { image in
                guard let src = image.src, let width = image.width, let height = image.height
                else { return nil }
                return Thumbnail(src: src, alt: image.alt ?? "", width: width, height: height)
            }
    }
}

// MARK: - The register

@MainActor
final class Register: ObservableObject {
    /// How the holdings are arranged. Both are the same records.
    enum Order: String, CaseIterable, Identifiable {
        /// By department, then by accession number. The register proper.
        case register
        /// Most recent first. The journal.
        case recent

        var id: String { rawValue }
        var name: String { self == .register ? "By department" : "Recent" }
    }

    @Published private(set) var records: [RecordSummary] = []
    /// Filenames that would not decode. Named rather than dropped quietly.
    @Published private(set) var unreadable: [String] = []
    @Published private(set) var isLoading = false
    @Published private(set) var failure: String?
    @Published var order: Order = .register
    @Published var query = ""

    private var hasLoaded = false

    var isEmpty: Bool { records.isEmpty && !isLoading && failure == nil }

    // MARK: Reading

    func loadIfNeeded(using settings: Settings) async {
        guard !hasLoaded else { return }
        await load(using: settings)
    }

    func load(using settings: Settings) async {
        guard settings.isReady else {
            failure = "No repository or token yet. Open Settings."
            return
        }

        isLoading = true
        defer { isLoading = false }

        let client = settings.client

        do {
            let filenames = try await client.recordFilenames().filter { $0.hasSuffix(".json") }

            var found: [RecordSummary] = []
            var refused: [String] = []

            try await withThrowingTaskGroup(of: (String, RecordSummary?).self) { group in
                for name in filenames {
                    group.addTask {
                        let data = try await client.file(at: "src/content/records/\(name)")
                        return (name, try? JSONDecoder().decode(RecordSummary.self, from: data))
                    }
                }
                for try await (name, summary) in group {
                    if let summary {
                        found.append(summary)
                    } else {
                        refused.append(name)
                    }
                }
            }

            records = found
            unreadable = refused.sorted()
            failure = nil
            hasLoaded = true
        } catch {
            failure = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Called after filing, so the register does not claim the archive is
    /// one record smaller than the archivist just made it.
    func invalidate() {
        hasLoaded = false
    }

    // MARK: Arrangement

    private var matching: [RecordSummary] {
        let term = query.trimmed.lowercased()
        guard !term.isEmpty else { return records }

        return records.filter { record in
            record.title.lowercased().contains(term)
                || record.id.lowercased().contains(term)
                || (record.summary?.lowercased().contains(term) ?? false)
                || (record.place?.lowercased().contains(term) ?? false)
                || record.tags.contains { $0.contains(term) }
        }
    }

    /// One department's holdings.
    struct Shelf: Identifiable {
        let department: Department
        let held: [RecordSummary]

        var id: String { department.rawValue }
    }

    /// Grouped by department, in the order the institution lists them.
    /// Departments holding nothing are not shown an empty shelf.
    var departments: [Shelf] {
        let all = matching
        return Department.allCases.compactMap { dept in
            let held = all.filter { $0.dept == dept }.sorted { $0.id < $1.id }
            return held.isEmpty ? nil : Shelf(department: dept, held: held)
        }
    }

    /// Most recent first, ties broken by accession number so the order is
    /// stable between readings.
    var chronological: [RecordSummary] {
        matching.sorted { ($0.date, $0.id) > ($1.date, $1.id) }
    }
}
