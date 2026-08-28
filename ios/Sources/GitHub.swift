import Foundation

/*
 The archive's write path.

 There is no server. A record is a file in a git repository, and this is
 the thing that puts it there. Two calls: list the records directory to
 see which accession numbers have been used, and create a file.

 Creating is deliberately a create and never an update — the request
 carries no blob SHA, so GitHub refuses it if the path already exists.
 That refusal is the collision check. Two records can never quietly claim
 the same accession number, because the second one simply fails.
 */

struct Repository: Codable, Equatable {
    var owner: String
    var name: String
    var branch: String
    /// The deployed site. Used only to check a slug is not already taken.
    var site: String

    static let `default` = Repository(
        owner: "lewissn",
        name: "loosenickels",
        branch: "main",
        site: "https://www.loosenickels.com"
    )

    var isComplete: Bool {
        !owner.trimmed.isEmpty && !name.trimmed.isEmpty && !branch.trimmed.isEmpty
    }

    /* Decoded field by field so that adding a setting later does not read
       as "all your settings have been forgotten". */
    init(owner: String, name: String, branch: String, site: String) {
        self.owner = owner
        self.name = name
        self.branch = branch
        self.site = site
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let fallback = Repository.default
        owner = try container.decodeIfPresent(String.self, forKey: .owner) ?? fallback.owner
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? fallback.name
        branch = try container.decodeIfPresent(String.self, forKey: .branch) ?? fallback.branch
        site = try container.decodeIfPresent(String.self, forKey: .site) ?? fallback.site
    }
}

enum GitHubError: LocalizedError {
    case noToken
    case alreadyExists(String)
    case unauthorised(Int, String)
    case notFound(String)
    case http(Int, String)
    case malformedResponse

    var errorDescription: String? {
        switch self {
        case .noToken:
            return "No access token. Add one in Settings."
        case .alreadyExists(let path):
            return "\(path) already exists. The archive declined to overwrite it."
        /* 401 and 403 are different problems wearing the same coat: the
           first means the token itself did not read as a credential, the
           second means it did and was not allowed to do this. Reporting
           them as one thing sends you to the wrong settings page. */
        case .unauthorised(401, let message):
            return "GitHub did not recognise the token. It has most likely expired, been revoked, or been pasted incompletely. \(message)"
        case .unauthorised(403, let message):
            return "The token is valid but not allowed to do this. Check it grants Contents: read and write on this repository. \(message)"
        case .unauthorised(let code, let message):
            return "GitHub rejected the token (\(code)). \(message)"
        case .notFound(let path):
            return "GitHub could not find \(path). Check the owner, repository and branch in Settings."
        case .http(let code, let message):
            return "GitHub returned \(code). \(message)"
        case .malformedResponse:
            return "GitHub returned something unreadable."
        }
    }
}

struct GitHub {
    var repository: Repository
    var token: String

    private static let api = URL(string: "https://api.github.com")!

    private struct DirectoryEntry: Decodable {
        var name: String
        var type: String
    }

    private struct FileBody: Decodable {
        var content: String
        var encoding: String
    }

    private struct CreateBody: Encodable {
        var message: String
        var content: String
        var branch: String
    }

    private struct ErrorBody: Decodable {
        var message: String?
    }

    // MARK: Requests

    private func request(_ method: String, path: String, query: [URLQueryItem] = [], body: Data? = nil) throws -> URLRequest {
        guard !token.trimmed.isEmpty else { throw GitHubError.noToken }

        var components = URLComponents(
            url: Self.api.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )!
        if !query.isEmpty { components.queryItems = query }

        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("Bearer \(token.trimmed)", forHTTPHeaderField: "Authorization")
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("2022-11-28", forHTTPHeaderField: "X-GitHub-Api-Version")
        request.setValue("LooseNickels", forHTTPHeaderField: "User-Agent")
        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    private func send(_ request: URLRequest, describing path: String) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw GitHubError.malformedResponse }

        let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.message ?? ""

        switch http.statusCode {
        case 200..<300:
            return data
        case 401, 403:
            throw GitHubError.unauthorised(http.statusCode, message)
        case 404:
            throw GitHubError.notFound(path)
        case 409, 422:
            throw GitHubError.alreadyExists(path)
        default:
            throw GitHubError.http(http.statusCode, message)
        }
    }

    // MARK: Operations

    /**
     Every filename in the records directory.

     The filenames are the accession numbers, so this is the register.
     An empty directory reads as 404 rather than an empty list, which is
     not an error worth surfacing — it just means nothing is accessioned.
     */
    func recordFilenames() async throws -> [String] {
        let path = "repos/\(repository.owner)/\(repository.name)/contents/src/content/records"
        let request = try request("GET", path: path, query: [
            URLQueryItem(name: "ref", value: repository.branch)
        ])

        do {
            let data = try await send(request, describing: "src/content/records")
            let entries = try JSONDecoder().decode([DirectoryEntry].self, from: data)
            return entries.filter { $0.type == "file" }.map(\.name)
        } catch GitHubError.notFound {
            return []
        }
    }

    /**
     The contents of one file.

     GitHub returns the bytes base64-encoded and line-wrapped, which is
     why the decode ignores unknown characters rather than trusting the
     string to be clean.
     */
    func file(at path: String) async throws -> Data {
        let endpoint = "repos/\(repository.owner)/\(repository.name)/contents/\(path)"
        let request = try request("GET", path: endpoint, query: [
            URLQueryItem(name: "ref", value: repository.branch)
        ])

        let data = try await send(request, describing: path)
        let body = try JSONDecoder().decode(FileBody.self, from: data)

        guard body.encoding == "base64",
              let decoded = Data(base64Encoded: body.content, options: .ignoreUnknownCharacters)
        else { throw GitHubError.malformedResponse }

        return decoded
    }

    /// Creates a file. Fails rather than overwrites if the path is taken.
    func create(path: String, contents: Data, message: String) async throws {
        let endpoint = "repos/\(repository.owner)/\(repository.name)/contents/\(path)"
        let body = try JSONEncoder().encode(
            CreateBody(
                message: message,
                content: contents.base64EncodedString(),
                branch: repository.branch
            )
        )
        let request = try request("PUT", path: endpoint, body: body)
        _ = try await send(request, describing: path)
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
