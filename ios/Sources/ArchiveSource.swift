import Foundation

/*
 The seam, on the phone.

 A mirror of src/lib/archive/source.ts. The website and this app are two
 presentation layers over one contract, and the contract lives in Postgres:
 row level security is the single answer to who may see what, and neither
 client is allowed a second opinion about it.

 The web implementation takes a `Viewer` on every method because one process
 there serves many readers. Here there is exactly one reader — whoever is
 holding the phone — so the viewer is the session and is not a parameter.
 The `owner` still is, because looking at somebody else's public archive is
 the same call with a different owner.
 */

/// A refusal is a domain outcome, not an exception to be stringified into
/// an alert. Callers switch on the case.
enum ArchiveFailure: LocalizedError, Equatable {
    case notSignedIn
    case notFound
    case forbidden
    case invalidDate(String)
    case conflict
    case assetNotReady
    case offline
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .notSignedIn:
            return "You are signed out. Ask for a new link."
        case .notFound:
            return "That day has gone."
        case .forbidden:
            return "That is not yours to change."
        case .invalidDate(let said):
            return said
        case .conflict:
            return "Something else was writing to that day. Try again."
        case .assetNotReady:
            return "That photograph has not finished arriving."
        case .offline:
            /* Said without alarm. Nothing has been lost: the photograph is
               still in the library and the day is still open. */
            return "No connection. The day is still yours to record."
        case .transport(let said):
            return said
        }
    }
}

/// A photograph on its way to a day. The bytes went to object storage
/// first, separately, so a failed commit does not mean sending them again.
struct SubmitPhoto {
    var assetId: String
    var date: CalendarDate
    var note: String?
    var visibility: DayVisibility = .private

    var capturedAt: Date?
    var captureTimeZone: String?

    /* What the photograph knows about itself, read on the device before a
       byte was uploaded — the server only ever sees an object key. Every
       field is optional: a screenshot with no metadata must be exactly as
       easy to record as a raw file. */
    var width: Int?
    var height: Int?
    var placeholder: String?
    var camera: Camera?
    var place: Place?

    /**
     Stable across retries of the same submission.

     This is what makes a retry safe, and on a phone it is not a nicety: a
     connection that drops after the request left but before the reply
     arrived is the ordinary case outdoors. Two requests carrying this key
     are one submission, and the second returns the first one's result
     rather than writing a second revision.
     */
    var idempotencyKey: String
}

struct SubmitResult {
    var day: ResolvedDay
    /// True when this call created the revision; false when it replayed one.
    var created: Bool
    var revisionNumber: Int
}

protocol ArchiveSource {
    /// The signed-in account, or nil. Everything else needs this first.
    func me() async throws -> Profile?

    /// The most recent recorded day — not today's, necessarily. If the
    /// latest is yesterday's, yesterday's is what is shown.
    func latestDay(owner: String) async throws -> ResolvedDay?

    func day(owner: String, date: CalendarDate) async throws -> ResolvedDay?

    /// Thumbnails across a range. Returns only days that exist; absent days
    /// are absent, and the caller draws the gap. The archive does not
    /// invent placeholder records for days that were never recorded.
    func summaries(owner: String, from: CalendarDate, to: CalendarDate) async throws -> [DaySummary]

    /// Owner-only. Drives the private "Today remains unrecorded." line.
    func status(owner: String) async throws -> ArchiveStatus?

    /// Record or replace a day's photograph. One method rather than a
    /// create and an update, because from the user's side there is one
    /// action: this is the photograph for this day.
    func submit(owner: String, photo: SubmitPhoto) async throws -> SubmitResult

    func setNote(owner: String, date: CalendarDate, note: String?) async throws -> ResolvedDay

    func setVisibility(owner: String, date: CalendarDate, visibility: DayVisibility) async throws -> ResolvedDay
}
