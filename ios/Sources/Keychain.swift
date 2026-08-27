import Foundation
import Security

/*
 The token lives in the keychain rather than in UserDefaults.

 It is a fine-grained personal access token scoped to Contents: read and
 write on one repository, on a phone belonging to the person who owns
 that repository. The exposure is proportionate. Storing it somewhere a
 file-system backup would pick it up is not.
 */

enum Keychain {
    private static let service = "com.loosenickels.accession"

    static func set(_ value: String, for account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]

        SecItemDelete(query as CFDictionary)

        guard !value.isEmpty, let data = value.data(using: .utf8) else { return }

        var insert = query
        insert[kSecValueData as String] = data
        /* The token is only ever needed while the archivist is holding the
           phone, so it need not survive a locked device or leave it. */
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly

        SecItemAdd(insert as CFDictionary, nil)
    }

    static func get(_ account: String) -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8)
        else { return "" }

        return value
    }
}

/// Where the app is pointed and what it is allowed to do there.
final class Settings: ObservableObject {
    private static let repositoryKey = "ln.repository"
    private static let tokenAccount = "github-token"

    @Published var repository: Repository {
        didSet { persistRepository() }
    }

    @Published var token: String {
        didSet { Keychain.set(token, for: Self.tokenAccount) }
    }

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.repositoryKey),
           let stored = try? JSONDecoder().decode(Repository.self, from: data) {
            repository = stored
        } else {
            repository = .default
        }
        token = Keychain.get(Self.tokenAccount)
    }

    var isReady: Bool { repository.isComplete && !token.trimmed.isEmpty }

    var client: GitHub { GitHub(repository: repository, token: token) }

    private func persistRepository() {
        guard let data = try? JSONEncoder().encode(repository) else { return }
        UserDefaults.standard.set(data, forKey: Self.repositoryKey)
    }
}
