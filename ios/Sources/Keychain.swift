import Foundation
import Security

/*
 Small values that must not be picked up by a file-system backup.

 Nothing uses this at present: the session is the only credential the app
 holds, and supabase-swift keeps that in the keychain on its own.
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

/* The `Settings` class that lived here — a repository, a branch, and a
   hand-pasted GitHub token — is gone with the write path it configured.
   supabase-swift keeps the session in the keychain itself, so nothing in
   this app stores a credential by hand any more.

   `Keychain` survives because it is the right answer to the question it
   answers, and something will want it again. */
