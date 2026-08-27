import Foundation
import SwiftUI

/*
 Filing a record.

 The order matters. The accession number is drawn from the repository
 immediately before the write, the photograph goes up first, and the
 record last — so a failure part-way leaves at worst an orphaned image
 under an accession number that was never issued, which is invisible and
 harmless. The reverse order would leave a record pointing at a
 photograph that does not exist, which would fail the build.
 */

@MainActor
final class Capture: ObservableObject {
    @Published var department: Department = .photographs
    @Published var title = ""
    @Published var summary = ""
    @Published var bodyText = ""
    @Published var alt = ""
    @Published var tags = ""
    @Published var significance: Significance = .undetermined
    @Published var date = Date()
    @Published var photo: Photograph.Prepared?
    @Published var attachPosition = true

    @Published private(set) var isFiling = false
    @Published var filed: String?
    @Published var failure: String?

    var canFile: Bool {
        !title.trimmed.isEmpty && !isFiling
    }

    func reset() {
        title = ""
        summary = ""
        bodyText = ""
        alt = ""
        tags = ""
        significance = .undetermined
        date = Date()
        photo = nil
    }

    // MARK: Filing

    func file(using settings: Settings, conditions: FieldConditions) async {
        guard settings.isReady else {
            failure = "No repository or token yet. Open Settings."
            return
        }

        isFiling = true
        defer { isFiling = false }

        let client = settings.client

        do {
            let taken = try await client.recordFilenames()
            let sequence = Accession.next(after: taken, in: department)
            let id = Accession.format(department, sequence)

            let slug = await availableSlug(
                for: title,
                fallback: "record-\(sequence)",
                site: settings.repository.site
            )

            var media: [ImageMedia] = []

            if let photo {
                let path = "public/media/\(id)/plate.jpg"
                try await client.create(
                    path: path,
                    contents: photo.data,
                    message: "\(id): photograph"
                )
                media.append(
                    ImageMedia(
                        src: "/media/\(id)/plate.jpg",
                        alt: alt.trimmed.isEmpty ? title.trimmed : alt.trimmed,
                        width: photo.width,
                        height: photo.height,
                        captured: photo.captured
                    )
                )
            }

            let record = assemble(
                id: id,
                slug: slug,
                media: media,
                fix: attachPosition ? conditions.fix : nil
            )

            let json = try record.json
            try await client.create(
                path: "src/content/records/\(id).json",
                contents: json,
                message: "Accession \(id): \(record.title)"
            )

            filed = id
            reset()
            conditions.clear()
        } catch {
            failure = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: Assembly

    private func assemble(id: String, slug: String, media: [ImageMedia], fix: Fix?) -> Record {
        /* The first paragraph leads the record; the rest are body. That is
           the convention the site already sets its records in. */
        let paragraphs = bodyText
            .components(separatedBy: .newlines)
            .map { $0.trimmed }
            .filter { !$0.isEmpty }

        let body = paragraphs.enumerated().map { index, text in
            ProseBlock(type: index == 0 ? "lede" : "p", text: text)
        }

        let tagList = tags
            .components(separatedBy: ",")
            .map { $0.trimmed.lowercased() }
            .filter { !$0.isEmpty }

        var place: Place?
        if let fix {
            place = Place(
                name: fix.placeName,
                region: fix.region,
                country: fix.country,
                coordinates: fix.coordinates
            )
        }

        let today = ArchiveDate.stamp(Date())
        let dated = ArchiveDate.stamp(date)

        return Record(
            id: id,
            dept: department.rawValue,
            slug: slug,
            title: title.trimmed,
            summary: summary.trimmed.isEmpty ? nil : summary.trimmed,
            body: body,
            date: dated,
            /* Only worth recording when it says something the date does
               not: that the archive took the thing in later than it
               happened. */
            acquired: dated == today ? nil : today,
            place: place,
            tags: tagList,
            media: media,
            weather: fix?.weather,
            significance: significance.rawValue,
            remark: nil
        )
    }

    /**
     A slug the site is not already using.

     Accession numbers cannot collide — the write fails if the file
     exists. Slugs can, because two things can honestly have the same
     title, and a duplicate slug fails the build rather than the write.
     So the deployed site is asked first.

     This only knows about records that have already been deployed. Two
     identically titled records filed inside the same build window would
     still collide, at which point the build says so by name and the
     title can be changed. That is a rare enough failure to be worth
     leaving loud rather than engineering around.
     */
    private func availableSlug(for title: String, fallback: String, site: String) async -> String {
        let base = Slug.from(title, fallback: fallback)

        let free = await isTaken(base, site: site) == false
        if free { return base }

        for suffix in 2...9 {
            let candidate = "\(base)-\(suffix)"
            let available = await isTaken(candidate, site: site) == false
            if available { return candidate }
        }

        /* Nine records with the same title is not a naming problem, it is
           a cataloguing decision, and the build will say so. */
        return "\(base)-\(fallback)"
    }

    private func isTaken(_ slug: String, site: String) async -> Bool {
        guard var components = URLComponents(string: site) else { return false }
        components.path = "/archive/record/\(slug)/"
        guard let url = components.url else { return false }

        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.timeoutInterval = 8

        /* Unreachable site, no signal, anything at all: assume free. The
           build is the real check and it does not depend on this. */
        guard let (_, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse
        else { return false }

        return http.statusCode == 200
    }
}
