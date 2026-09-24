import ExpoModulesCore
import Foundation
import Security

/**
 * Holds the Buddies root seed as a synchronizable generic-password Keychain
 * item. iCloud Keychain is end-to-end encrypted, so every device on the same
 * Apple Account derives the same Buddies identity without the seed ever being
 * readable by Apple. Deliberately separate from `keychain-uuid`, whose items are
 * this-device-only by design.
 */
public class BuddiesKeychainModule: Module {
  private let service = "com.leviwilkerson.witnesswork.buddies"
  private let rootSeedAccount = "root-seed"

  public func definition() -> ModuleDefinition {
    Name("BuddiesKeychain")

    // JS checks this so OTA updates never call into a binary without the module.
    Constant("buddiesKeychainVersion") {
      1
    }

    Function("peekRootSeed") { () throws -> String? in
      return try self.readRootSeed()
    }

    Function("getOrCreateRootSeed") { () throws -> String in
      if let existing = try self.readRootSeed() {
        return existing
      }
      var bytes = [UInt8](repeating: 0, count: 32)
      let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
      guard status == errSecSuccess else {
        throw BuddiesKeychainError(message: "Could not create root seed", status: status)
      }
      let created = Self.base64url(Data(bytes))
      if try self.addRootSeed(created) {
        return created
      }
      // Another device's seed synced in between the read and the add: adopt it.
      guard let synced = try self.readRootSeed() else {
        throw BuddiesKeychainError(message: "Root seed vanished after duplicate", status: errSecItemNotFound)
      }
      return synced
    }

    Function("deleteRootSeed") { () throws in
      var query = self.baseQuery()
      query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny
      let status = SecItemDelete(query as CFDictionary)
      guard status == errSecSuccess || status == errSecItemNotFound else {
        throw BuddiesKeychainError(message: "Could not delete root seed", status: status)
      }
    }
  }

  private func baseQuery() -> [String: Any] {
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: rootSeedAccount,
    ]
  }

  private func readRootSeed() throws -> String? {
    var query = baseQuery()
    // Match the item whether or not it has synced yet.
    query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound {
      return nil
    }
    guard status == errSecSuccess,
      let data = result as? Data,
      let value = String(data: data, encoding: .utf8)
    else {
      throw BuddiesKeychainError(message: "Could not read root seed", status: status)
    }
    return value
  }

  /// Returns false when an item already exists (e.g. synced from another device).
  private func addRootSeed(_ value: String) throws -> Bool {
    var query = baseQuery()
    query[kSecAttrSynchronizable as String] = kCFBooleanTrue
    // Synchronizable items can't be ThisDeviceOnly. After-first-unlock keeps the
    // seed readable by a future Notification Service Extension on a locked phone.
    query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    query[kSecValueData as String] = Data(value.utf8)
    let status = SecItemAdd(query as CFDictionary, nil)
    if status == errSecDuplicateItem {
      return false
    }
    guard status == errSecSuccess else {
      throw BuddiesKeychainError(message: "Could not store root seed", status: status)
    }
    return true
  }

  private static func base64url(_ data: Data) -> String {
    return data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}

struct BuddiesKeychainError: LocalizedError {
  let message: String
  let status: OSStatus

  var errorDescription: String? {
    return "\(message) (OSStatus \(status))"
  }
}
