import Foundation
import Supabase

/*
 The archive, over PostgREST.

 The website's implementation of this same contract has a long comment
 saying row level security is the authority and the client is not. It is
 true twice over here: this code runs on a device its owner controls, so
 anything it decided about permission would be a decision an attacker could
 simply delete. Every read below is an ordinary select and the policy
 decides whether there is a row.

 The one thing the database cannot hand over is a signed URL, so media rows
 become URLs at the end of each read — after the policy has already agreed
 the row may be seen.
 */

// MARK: - Wire shapes
//
// Column names, not property names. These are what Postgres returns, and
// they are kept separate from the domain types on purpose: a rename in the
// database should break this file loudly rather than silently produce a
// day with no photograph in it.

private struct AssetRow: Decodable {
    var id: String
    var variant: MediaVariant
    var width: Int
    var height: Int
}

private struct RevisionRow: Decodable {
    var id: String
    var revision_number: Int
    var state: ProcessingState
    var placeholder: String?
    var lightness: Double?
    var tone: String?
    var regions: [Region]?
    var width: Int?
    var height: Int?
    var captured_at: Date?
    var capture_timezone: String?
    var camera_make: String?
    var camera_model: String?
    var lens: String?
    var focal_length_mm: Double?
    var aperture: Double?
    var exposure_seconds: Double?
    var iso: Int?
    var latitude: Double?
    var longitude: Double?
    var altitude_m: Double?
    var accuracy_m: Double?
    var place_name: String?
    var locality: String?
    var region: String?
    var country: String?
    var location_privacy: LocationPrecision
    var weather: Weather?
    var media_assets: [AssetRow]?
}

/**
 An embedded relation that may arrive either way.

 PostgREST returns a to-one embed as a bare object and a to-many as an
 array, and which one you get depends on the direction of the foreign key
 being followed rather than on anything visible in the select. Declaring the
 wrong one does not degrade gracefully: the decode throws, the whole query
 fails, and the failure surfaces somewhere far away wearing a transport
 error's clothes.

 `day_entries -> photo_revisions` follows the entry's pointer at its current
 revision, so it is to-one and arrives as an object. This accepts both
 anyway, because that is a fact about a server's serialisation and not a
 thing worth having a client be brittle about.
 */
private struct Embedded<T: Decodable>: Decodable {
    let values: [T]

    var first: T? { values.first }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let many = try? container.decode([T].self) {
            values = many
        } else if let one = try? container.decode(T.self) {
            values = [one]
        } else if container.decodeNil() {
            values = []
        } else {
            throw DecodingError.typeMismatch(
                T.self,
                .init(
                    codingPath: decoder.codingPath,
                    debugDescription: "Expected \(T.self), an array of them, or null."
                )
            )
        }
    }
}

private struct DayRow: Decodable {
    var id: String
    var user_id: String
    var entry_date: CalendarDate
    var note: String?
    var visibility: DayVisibility
    var current_revision_id: String?
    var photo_revisions: Embedded<RevisionRow>?
}

private struct ProfileRow: Decodable {
    var id: String
    var handle: String
    var display_name: String?
    var bio: String?
    var visibility: ProfileVisibility
    var time_zone: String
    var location_precision: LocationPrecision
}

private struct AssetIdRow: Decodable { var id: String }
private struct RevisionIdRow: Decodable { var id: String; var revision_number: Int }
private struct DayIdRow: Decodable { var id: String }
private struct DateRow: Decodable { var entry_date: CalendarDate }

// MARK: - Selects

private enum Columns {
    static let profile =
        "id, handle, display_name, bio, visibility, time_zone, location_precision"

    static let revision = """
        id, revision_number, state, placeholder, lightness, tone, regions, width, height,
        captured_at, capture_timezone,
        camera_make, camera_model, lens, focal_length_mm, aperture,
        exposure_seconds, iso,
        latitude, longitude, altitude_m, accuracy_m,
        place_name, locality, region, country, location_privacy, weather,
        media_assets ( id, variant, width, height )
        """

    /* The embed names its foreign key, because `day_entries` reaches
       `photo_revisions` by two of them, and PostgREST refuses an ambiguous
       embed rather than guessing. The name is the constraint's own, as
       migration 1 states it — not PostgREST's generated `..._fkey` form,
       which is what was here and which no constraint in this schema has. */
    static let day = """
        id, user_id, entry_date, note, visibility, current_revision_id,
        photo_revisions!current_revision_belongs_to_entry (
        \(revision)
        )
        """
}

// MARK: - The source

struct SupabaseArchive: ArchiveSource {
    private var db: SupabaseClient { Backend.client }

    // MARK: Identity

    func me() async throws -> Profile? {
        guard let user = try? await db.auth.session.user else { return nil }

        let rows: [ProfileRow] = try await run {
            try await db.from("profiles")
                .select(Columns.profile)
                .eq("id", value: user.id.uuidString.lowercased())
                .limit(1)
                .execute()
                .value
        }

        guard let row = rows.first else { return nil }
        return profile(from: row)
    }

    // MARK: Reading

    func latestDay(owner: String) async throws -> ResolvedDay? {
        guard let profile = try await ownerProfile(owner) else { return nil }

        let rows: [DayRow] = try await run {
            try await db.from("day_entries")
                .select(Columns.day)
                .eq("user_id", value: owner)
                .not("current_revision_id", operator: .is, value: AnyJSON.null)
                .order("entry_date", ascending: false)
                .limit(1)
                .execute()
                .value
        }

        guard let row = rows.first else { return nil }
        return try await resolve(
            row,
            owner: owner,
            ceiling: profile.location_precision,
            signed: await signedURLs(for: assetIds(in: [row]))
        )
    }

    func day(owner: String, date: CalendarDate) async throws -> ResolvedDay? {
        guard let profile = try await ownerProfile(owner) else { return nil }
        guard let row = try await dayRow(owner: owner, date: date) else { return nil }
        return try await resolve(
            row,
            owner: owner,
            ceiling: profile.location_precision,
            signed: await signedURLs(for: assetIds(in: [row]))
        )
    }

    func recentDays(
        owner: String,
        limit: Int,
        before: CalendarDate?
    ) async throws -> [ResolvedDay] {
        guard let profile = try await ownerProfile(owner) else { return [] }

        let rows: [DayRow] = try await run {
            var query = db.from("day_entries")
                .select(Columns.day)
                .eq("user_id", value: owner)
                .not("current_revision_id", operator: .is, value: AnyJSON.null)

            if let before { query = query.lt("entry_date", value: before.value) }

            return try await query
                .order("entry_date", ascending: false)
                .limit(limit)
                .execute()
                .value
        }

        let signed = await signedURLs(for: assetIds(in: rows))

        var out: [ResolvedDay] = []
        for row in rows {
            if let day = try await resolve(
                row,
                owner: owner,
                ceiling: profile.location_precision,
                signed: signed
            ) {
                out.append(day)
            }
        }
        return out
    }

    func summaries(
        owner: String,
        from: CalendarDate,
        to: CalendarDate
    ) async throws -> [DaySummary] {
        let rows: [DayRow] = try await run {
            try await db.from("day_entries")
                .select(Columns.day)
                .eq("user_id", value: owner)
                .not("current_revision_id", operator: .is, value: AnyJSON.null)
                .gte("entry_date", value: from.value)
                .lte("entry_date", value: to.value)
                .order("entry_date", ascending: false)
                .execute()
                .value
        }

        let signed = await signedURLs(for: assetIds(in: rows))

        var out: [DaySummary] = []
        for row in rows {
            guard let revision = row.photo_revisions?.first else { continue }
            let assets = revision.media_assets ?? []
            /* A day with no thumbnail yet contributes its placeholder and
               its shape and no URL at all, rather than falling back to the
               large — a listing must never fetch full-size images. */
            let thumb = assets.first { $0.variant == .thumbnail }
            let original = assets.first { $0.variant == .original }

            out.append(
                DaySummary(
                    date: row.entry_date,
                    thumbnailUrl: thumb.flatMap { signed[$0.id] },
                    width: revision.width ?? original?.width ?? 0,
                    height: revision.height ?? original?.height ?? 0,
                    placeholder: revision.placeholder
                )
            )
        }
        return out
    }

    func status(owner: String) async throws -> ArchiveStatus? {
        guard let profile = try await ownerProfile(owner) else { return nil }
        let zone = TimeZone(identifier: profile.time_zone) ?? .gmt

        let dates: [DateRow] = try await run {
            try await db.from("day_entries")
                .select("entry_date")
                .eq("user_id", value: owner)
                .not("current_revision_id", operator: .is, value: AnyJSON.null)
                .order("entry_date", ascending: true)
                .execute()
                .value
        }

        /* Their today, in their zone. The device's zone is not consulted:
           it is a different zone whenever they are travelling, and the
           whole point of storing one on the profile is that a photograph
           taken at ten past midnight lands on one date, not two. */
        let today = CalendarDate.today(in: zone)

        return ArchiveStatus(
            today: today,
            timeZone: zone,
            todayRecorded: dates.contains { $0.entry_date == today },
            daysRecorded: dates.count,
            earliest: dates.first?.entry_date,
            latest: dates.last?.entry_date
        )
    }

    // MARK: Writing

    func submit(owner: String, photo: SubmitPhoto) async throws -> SubmitResult {
        /* The replay check first, because the whole point of the key is
           that a second request must not write anything. */
        let replayed: [RevisionIdRow] = try await run {
            try await db.from("photo_revisions")
                .select("id, revision_number")
                .eq("user_id", value: owner)
                .eq("idempotency_key", value: photo.idempotencyKey)
                .limit(1)
                .execute()
                .value
        }

        if let already = replayed.first {
            guard let day = try await day(owner: owner, date: photo.date) else {
                throw ArchiveFailure.notFound
            }
            return SubmitResult(day: day, created: false, revisionNumber: already.revision_number)
        }

        let entries: [DayIdRow] = try await run {
            try await db.from("day_entries")
                .upsert(
                    DayUpsert(user_id: owner, entry_date: photo.date, deleted_at: nil),
                    onConflict: "user_id,entry_date"
                )
                .select("id")
                .execute()
                .value
        }

        guard let entry = entries.first else {
            /* Very nearly always the date guard: a date further ahead than
               the far side of the date line can account for. */
            throw ArchiveFailure.invalidDate("That date is further ahead than any calendar has reached.")
        }

        let revisions: [RevisionIdRow] = try await run {
            try await db.from("photo_revisions")
                .insert(
                    RevisionInsert(
                        day_entry_id: entry.id,
                        user_id: owner,
                        captured_at: photo.capturedAt,
                        capture_timezone: photo.captureTimeZone,
                        idempotency_key: photo.idempotencyKey
                    )
                )
                .select("id, revision_number")
                .execute()
                .value
        }

        guard let revision = revisions.first else { throw ArchiveFailure.conflict }

        /* `photo_revision_id is null` is the guard that matters: an asset
           already attached to a day must not be moved to another one. */
        let toAttach = [photo.assetId, photo.sourceAssetId].compactMap { $0 }

        let attached: [AssetIdRow] = try await run {
            try await db.from("media_assets")
                .update(["photo_revision_id": revision.id])
                .in("id", values: toAttach)
                .eq("user_id", value: owner)
                .is("photo_revision_id", value: nil)
                .select("id")
                .execute()
                .value
        }

        /* The original is the one that must have landed. A missing transcode
           is survivable — the pipeline tries the original and fails honestly,
           which beats refusing a photograph already safe in storage. */
        guard attached.contains(where: { $0.id == photo.assetId }) else {
            throw ArchiveFailure.assetNotReady
        }

        _ = try? await db.from("photo_revisions")
            .update(
                RevisionDetail(
                    width: photo.width,
                    height: photo.height,
                    placeholder: photo.placeholder,
                    camera_make: photo.camera?.make,
                    camera_model: photo.camera?.model,
                    lens: photo.camera?.lens,
                    focal_length_mm: photo.camera?.focalLength,
                    aperture: photo.camera?.aperture,
                    exposure_seconds: photo.camera?.shutterSpeed,
                    iso: photo.camera?.iso,
                    latitude: photo.place?.coordinates?.lat,
                    longitude: photo.place?.coordinates?.lon,
                    accuracy_m: photo.place?.coordinates?.accuracy,
                    altitude_m: photo.place?.coordinates?.elevation,
                    place_name: photo.place?.label,
                    region: photo.place?.region,
                    country: photo.place?.country,
                    /* Withheld on every submission rather than inherited. A
                       default carried from a previous day would publish a
                       location its owner never looked at. */
                    location_privacy: .hidden
                )
            )
            .eq("id", value: revision.id)
            .execute()

        var patch = DayPatch(current_revision_id: revision.id)
        patch.note = photo.note
        patch.visibility = photo.visibility
        _ = try? await db.from("day_entries").update(patch).eq("id", value: entry.id).execute()

        guard let day = try await day(owner: owner, date: photo.date) else {
            throw ArchiveFailure.notFound
        }

        return SubmitResult(day: day, created: true, revisionNumber: revision.revision_number)
    }

    func setNote(owner: String, date: CalendarDate, note: String?) async throws -> ResolvedDay {
        try await patch(owner: owner, date: date) { $0.note = note ?? "" }
    }

    func setVisibility(
        owner: String,
        date: CalendarDate,
        visibility: DayVisibility
    ) async throws -> ResolvedDay {
        try await patch(owner: owner, date: date) { $0.visibility = visibility }
    }

    func updateProfile(
        owner: String,
        visibility: ProfileVisibility?,
        locationPrecision: LocationPrecision?,
        timeZone: String?
    ) async throws -> Profile {
        /* Only what was asked for. Sending the whole profile back would make
           every save a chance to overwrite a field another device changed a
           second ago. */
        var patch: [String: String] = [:]
        if let visibility { patch["visibility"] = visibility.rawValue }
        if let locationPrecision { patch["location_precision"] = locationPrecision.rawValue }
        if let timeZone { patch["time_zone"] = timeZone }

        guard !patch.isEmpty, let existing = try await ownerProfile(owner) else {
            throw ArchiveFailure.notFound
        }

        let rows: [ProfileRow] = try await run {
            try await db.from("profiles")
                .update(patch)
                .eq("id", value: owner)
                .select(Columns.profile)
                .execute()
                .value
        }

        guard let row = rows.first else {
            /* The update reached the database and came back with nothing,
               which under row level security means it was refused rather
               than lost. */
            _ = existing
            throw ArchiveFailure.forbidden
        }

        return profile(from: row)
    }

    // MARK: Plumbing

    private func patch(
        owner: String,
        date: CalendarDate,
        _ change: (inout DayPatch) -> Void
    ) async throws -> ResolvedDay {
        var body = DayPatch(current_revision_id: nil)
        change(&body)

        try await run {
            _ = try await db.from("day_entries")
                .update(body)
                .eq("user_id", value: owner)
                .eq("entry_date", value: date.value)
                .execute()
        }

        guard let day = try await day(owner: owner, date: date) else {
            throw ArchiveFailure.notFound
        }
        return day
    }

    private func ownerProfile(_ owner: String) async throws -> ProfileRow? {
        let rows: [ProfileRow] = try await run {
            try await db.from("profiles")
                .select(Columns.profile)
                .eq("id", value: owner)
                .limit(1)
                .execute()
                .value
        }
        return rows.first
    }

    private func dayRow(owner: String, date: CalendarDate) async throws -> DayRow? {
        let rows: [DayRow] = try await run {
            try await db.from("day_entries")
                .select(Columns.day)
                .eq("user_id", value: owner)
                .eq("entry_date", value: date.value)
                .limit(1)
                .execute()
                .value
        }
        return rows.first
    }

    private func profile(from row: ProfileRow) -> Profile {
        Profile(
            id: row.id,
            handle: row.handle,
            displayName: row.display_name,
            bio: row.bio,
            visibility: row.visibility,
            timeZone: TimeZone(identifier: row.time_zone) ?? .gmt,
            locationPrecision: row.location_precision
        )
    }

    /// Every asset id the given rows refer to. Gathered before resolving so
    /// that one request covers a whole page rather than one per photograph.
    private func assetIds(in rows: [DayRow]) -> [String] {
        rows.flatMap { row in
            (row.photo_revisions?.first?.media_assets ?? []).map(\.id)
        }
    }

    private func resolve(
        _ row: DayRow,
        owner: String,
        ceiling: LocationPrecision,
        signed: [String: URL]
    ) async throws -> ResolvedDay? {
        /* A day entry with no current revision is a reservation that was
           never completed — an upload that failed halfway. Not a day. */
        guard let revision = row.photo_revisions?.first else { return nil }

        let mine = (try? await db.auth.session.user.id.uuidString.lowercased()) == owner
        let assets = revision.media_assets ?? []
        let original = assets.first { $0.variant == .original }

        var urls: [MediaVariant: URL] = [:]
        for asset in assets {
            /* Withheld from everyone but the owner however carefully the
               location columns were redacted: the embedded EXIF carries the
               GPS tag out past all of it. `source` is a faithful transcode
               and carries exactly the same tag, which is why the rule is a
               property of the variant rather than a test for one. */
            if asset.variant.isOwnerOnly && !mine { continue }
            if let url = signed[asset.id] { urls[asset.variant] = url }
        }

        let camera = Camera(
            make: revision.camera_make,
            model: revision.camera_model,
            lens: revision.lens,
            focalLength: revision.focal_length_mm,
            aperture: revision.aperture,
            shutterSpeed: revision.exposure_seconds,
            iso: revision.iso
        )

        return ResolvedDay(
            date: row.entry_date,
            note: row.note,
            visibility: row.visibility,
            photo: ResolvedPhoto(
                assetId: original?.id ?? revision.id,
                width: revision.width ?? original?.width ?? 0,
                height: revision.height ?? original?.height ?? 0,
                placeholder: revision.placeholder,
                lightness: revision.lightness,
                tone: revision.tone,
                regions: revision.regions,
                processing: revision.state,
                urls: urls,
                alt: "Photograph for \(row.entry_date.value)"
            ),
            capturedAt: revision.captured_at,
            captureTimeZone: revision.capture_timezone,
            place: disclose(revision, to: mine ? .precise : min(ceiling, revision.location_privacy)),
            weather: revision.weather,
            camera: camera.isEmpty ? nil : camera,
            revisionCount: mine ? revision.revision_number : nil
        )
    }

    /**
     Reduce a location to what a precision permits.

     The mirror of `discloseLocation` on the website, and the same rule:
     coordinates blur by *rounding*, never by a random offset, because a
     fresh offset on every read can be averaged back to the true position by
     anyone who reads twice.
     */
    private func disclose(_ r: RevisionRow, to precision: LocationPrecision) -> Place? {
        guard precision != .hidden else { return nil }

        let label: String?
        switch precision {
        case .hidden: label = nil
        case .region: label = r.region ?? r.country
        case .locality, .approximate: label = r.locality ?? r.region ?? r.country
        case .precise: label = r.place_name ?? r.locality ?? r.region ?? r.country
        }

        var coordinates: Coordinates?
        if let lat = r.latitude, let lon = r.longitude {
            switch precision {
            case .hidden, .region, .locality:
                coordinates = nil
            case .approximate:
                /* Two decimal places is a bit over a kilometre. Enough to
                   say which town; not enough to say which street. */
                coordinates = Coordinates(
                    lat: (lat * 100).rounded() / 100,
                    lon: (lon * 100).rounded() / 100
                )
            case .precise:
                coordinates = Coordinates(
                    lat: lat, lon: lon,
                    accuracy: r.accuracy_m, elevation: r.altitude_m
                )
            }
        }

        if label == nil && coordinates == nil { return nil }

        /* Only the label and the coordinates, and nothing beside them.
           Passing `region` and `country` through as separate fields — which
           this did — handed a viewer entitled to nothing the two facts the
           ladder exists to withhold, however carefully the label above had
           just been reduced. The web version returns exactly these two
           fields for the same reason; this now matches it. */
        return Place(label: label, coordinates: coordinates)
    }

    /**
     Signed URLs for a set of assets, in one authenticated request.

     The obvious thing — pointing an image view at `/api/media/{id}` and
     letting it follow the redirect — is what a browser does, and it works
     there because an `<img>` carries the session cookie. It does not work
     here: `AsyncImage` fetches a URL and cannot be handed an Authorization
     header, so every request arrived anonymous, the policy correctly found
     nothing, and every photograph rendered as its twenty-pixel placeholder.

     So the URLs are asked for, with the token attached, and the image views
     are given something already signed. One request for a page of days
     rather than one per rendition, which on a mobile connection is the
     difference between a screen that fills and one that trickles.
     */
    private func signedURLs(for assetIds: [String]) async -> [String: URL] {
        guard !assetIds.isEmpty,
              let session = try? await db.auth.session
        else { return [:] }

        var request = URLRequest(url: URL(string: "\(Site.origin)/api/media")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(
            withJSONObject: ["assetIds": Array(Set(assetIds))]
        )

        struct Answer: Decodable { var urls: [String: String] }

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode),
              let answer = try? JSONDecoder().decode(Answer.self, from: data)
        else { return [:] }

        return answer.urls.compactMapValues(URL.init(string:))
    }

    /// Turns a transport failure into a domain outcome. A PostgREST error
    /// carrying a policy refusal is `forbidden`; no network is `offline`.
    private func run<T>(_ work: () async throws -> T) async throws -> T {
        do {
            return try await work()
        } catch let error as URLError {
            throw error.code == .notConnectedToInternet || error.code == .networkConnectionLost
                ? ArchiveFailure.offline
                : ArchiveFailure.transport(error.localizedDescription)
        } catch {
            throw ArchiveFailure.transport(error.localizedDescription)
        }
    }
}

// MARK: - Bodies

private struct DayUpsert: Encodable {
    var user_id: String
    var entry_date: CalendarDate
    var deleted_at: String?
}

private struct RevisionInsert: Encodable {
    var day_entry_id: String
    var user_id: String
    var captured_at: Date?
    var capture_timezone: String?
    var idempotency_key: String
}

private struct RevisionDetail: Encodable {
    var width: Int?
    var height: Int?
    var placeholder: String?
    var camera_make: String?
    var camera_model: String?
    var lens: String?
    var focal_length_mm: Double?
    var aperture: Double?
    var exposure_seconds: Double?
    var iso: Int?
    var latitude: Double?
    var longitude: Double?
    var accuracy_m: Double?
    var altitude_m: Double?
    var place_name: String?
    var region: String?
    var country: String?
    var location_privacy: LocationPrecision
}

private struct DayPatch: Encodable {
    var current_revision_id: String?
    var note: String?
    var visibility: DayVisibility?
}
