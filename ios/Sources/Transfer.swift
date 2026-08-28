import Foundation
import Supabase

/*
 Getting the bytes there.

 The same three steps the browser takes, for the same reason: a photograph
 from this phone is larger than a serverless function will accept as a
 request body, so it goes straight to object storage and only the paperwork
 goes through the server.

   POST /api/uploads           reserve a key, get a URL signed for 120s
   PUT  <that URL>             the file, phone straight to storage
   POST /api/uploads/register  the server asks the store whether it arrived
                               and writes down the store's answer

 What comes back is an asset belonging to whoever uploaded it and to no day
 yet. Which day it is the photograph for is `ArchiveSource.submit`, and that
 separation is the point — outdoors, on a phone, a commit that fails must be
 retryable without sending the photograph again.

 These routes are the website's, and the website authenticates with a
 cookie. This has a bearer token instead, so it sends one; the routes were
 changed to accept either.
 */

enum TransferFailure: LocalizedError {
    case notSignedIn
    case refused(String)
    case interrupted
    case offline

    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "You are signed out. Ask for a new link."
        case .refused(let said): return said
        case .interrupted: return "The photograph did not finish sending."
        case .offline: return "No connection. The day is still yours to record."
        }
    }

    /// Whether trying again might work — a timeout, a signature that ran out.
    var isWorthRetrying: Bool {
        switch self {
        case .interrupted, .offline: return true
        case .notSignedIn, .refused: return false
        }
    }
}

enum Transfer {
    private struct Reserved: Decodable {
        var storageKey: String
        var uploadUrl: URL
    }

    private struct Registered: Decodable {
        var assetId: String
    }

    private struct Problem: Decodable {
        var problem: String?
    }

    /// What the archive needs to attach: the original, and where the server
    /// cannot decode it, a transcode for the pipeline to read.
    struct Sent {
        var assetId: String
        var sourceAssetId: String?
    }

    static func send(_ photo: Photograph.Prepared) async throws -> Sent {
        let token = try await bearer()

        let assetId = try await one(
            photo.data,
            contentType: photo.contentType,
            variant: "original",
            width: photo.width,
            height: photo.height,
            token: token
        )

        /* Only for a format the server cannot open. The original above is
           already safe at this point, which is why this is allowed to be a
           second request rather than something the first depends on. */
        var sourceAssetId: String?
        if let source = photo.source, let type = photo.sourceContentType {
            sourceAssetId = try await one(
                source,
                contentType: type,
                variant: "source",
                width: photo.width,
                height: photo.height,
                token: token
            )
        }

        return Sent(assetId: assetId, sourceAssetId: sourceAssetId)
    }

    /// Reserve, PUT, register. One object.
    private static func one(
        _ bytes: Data,
        contentType: String,
        variant: String,
        width: Int,
        height: Int,
        token: String
    ) async throws -> String {
        let reserved: Reserved = try await json(
            to: "/api/uploads",
            token: token,
            body: [
                "contentType": contentType,
                "byteSize": bytes.count,
                "variant": variant,
            ]
        )

        try await put(bytes, to: reserved.uploadUrl, contentType: contentType)

        let registered: Registered = try await json(
            to: "/api/uploads/register",
            token: token,
            body: [
                "storageKey": reserved.storageKey,
                "contentType": contentType,
                "variant": variant,
                /* The shape of the photograph, not of these particular
                   bytes: a transcode is the same picture at the same size,
                   and the pipeline overwrites both from what it decodes. */
                "width": width,
                "height": height,
            ]
        )

        return registered.assetId
    }

    // MARK: Plumbing

    private static func bearer() async throws -> String {
        guard let session = try? await Backend.client.auth.session else {
            throw TransferFailure.notSignedIn
        }
        return session.accessToken
    }

    private static func json<T: Decodable>(
        to path: String,
        token: String,
        body: [String: Any]
    ) async throws -> T {
        var request = URLRequest(url: URL(string: Site.origin + path)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await perform(request)
        guard let http = response as? HTTPURLResponse else { throw TransferFailure.interrupted }

        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw TransferFailure.notSignedIn }
            let said = (try? JSONDecoder().decode(Problem.self, from: data))?.problem
            throw TransferFailure.refused(said ?? "The upload was refused (\(http.statusCode)).")
        }

        return try JSONDecoder().decode(T.self, from: data)
    }

    private static func put(_ data: Data, to url: URL, contentType: String) async throws {
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        /* The content type is inside the signature. Letting URLSession
           guess a different one is refused by the CDN rather than quietly
           stored under the wrong type. */
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")

        let (_, response) = try await perform(request, uploading: data)
        guard let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode)
        else {
            /* A 403 here is very nearly always the two minutes running out
               on a slow connection, which is worth another attempt with a
               fresh URL rather than an error the user has to interpret. */
            throw TransferFailure.interrupted
        }
    }

    private static func perform(
        _ request: URLRequest,
        uploading body: Data? = nil
    ) async throws -> (Data, URLResponse) {
        do {
            if let body {
                return try await URLSession.shared.upload(for: request, from: body)
            }
            return try await URLSession.shared.data(for: request)
        } catch let error as URLError {
            throw error.code == .notConnectedToInternet || error.code == .networkConnectionLost
                ? TransferFailure.offline
                : TransferFailure.interrupted
        }
    }
}
