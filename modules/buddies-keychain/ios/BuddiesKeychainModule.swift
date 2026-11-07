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

  /// The named-alert snapshot for the Notification Service Extension
  /// (`targets/notification-service`), in a Keychain access group only the app
  /// and the extension have: `<team id>.<bundle id>.buddies-alerts`.
  static let alertService = "com.leviwilkerson.witnesswork.buddies.alerts"
  static let alertAccount = "context"
  /// Where the extension counts how its alerts turned out, in the App Group.
  static let alertOutcomesKey = "buddiesAlertOutcomes"
  /// Where the extension keeps inboxes whose owner key the relay refused after
  /// an account key change (`InboxFetch.refusedKey`), in the App Group.
  static let refusedInboxesKey = "buddiesRefusedInboxes"

  public func definition() -> ModuleDefinition {
    Name("BuddiesKeychain")

    // JS checks this so OTA updates never call into a binary without the module.
    Constant("buddiesKeychainVersion") {
      3
    }

    Function("peekRootSeed") { () throws -> String? in
      return try self.readRootSeed()
    }

    Function("getOrCreateRootSeed") { () throws -> String in
      return try self.getOrCreateRootSeed()
    }

    // The same, off the JS thread, so both platforms share one async API (a
    // first read on Android can wait on Block Store). JS falls back to the
    // functions above on binaries without these.
    AsyncFunction("peekRootSeedAsync") { () throws -> String? in
      return try self.readRootSeed()
    }

    AsyncFunction("getOrCreateRootSeedAsync") { () throws -> String in
      return try self.getOrCreateRootSeed()
    }

    AsyncFunction("deleteRootSeedAsync") { () throws in
      try self.deleteRootSeed()
    }

    // Version 3: the account key received from a recovery key or another
    // device replaces this one, here and on the User's other Apple devices.
    AsyncFunction("replaceRootSeedAsync") { (seed: String) throws in
      try self.replaceRootSeed(seed)
    }

    Function("setAlertContext") { (json: String?) throws in
      try self.writeAlertContext(json)
    }

    Function("takeAlertOutcomes") { () -> [String: Int] in
      guard
        let bundleId = Bundle.main.bundleIdentifier,
        let defaults = UserDefaults(suiteName: "group.\(bundleId)")
      else { return [:] }
      let counts = defaults.dictionary(forKey: Self.alertOutcomesKey) as? [String: Int] ?? [:]
      defaults.removeObject(forKey: Self.alertOutcomesKey)
      return counts
    }

    Function("refusedInboxes") { () -> [String] in
      guard
        let bundleId = Bundle.main.bundleIdentifier,
        let defaults = UserDefaults(suiteName: "group.\(bundleId)")
      else { return [] }
      return defaults.stringArray(forKey: Self.refusedInboxesKey) ?? []
    }

    Function("deleteRootSeed") { () throws in
      try self.deleteRootSeed()
    }
  }

  private func getOrCreateRootSeed() throws -> String {
    if let existing = try readRootSeed() {
      return existing
    }
    var bytes = [UInt8](repeating: 0, count: 32)
    let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    guard status == errSecSuccess else {
      throw BuddiesKeychainError(message: "Could not create root seed", status: status)
    }
    let created = Self.base64url(Data(bytes))
    if try addRootSeed(created) {
      return created
    }
    // Another device's seed synced in between the read and the add: adopt it.
    guard let synced = try readRootSeed() else {
      throw BuddiesKeychainError(message: "Root seed vanished after duplicate", status: errSecItemNotFound)
    }
    return synced
  }

  /// Replaces the synchronizable item, so the new seed reaches the User's
  /// other Apple devices too. Deleted then added rather than updated, which
  /// also clears a copy that hasn't synced yet; a copy syncing in between the
  /// two is deleted again once.
  private func replaceRootSeed(_ seed: String) throws {
    guard Self.decodeBase64url(seed)?.count == 32 else {
      throw BuddiesKeychainError(message: "Root seed must be 32 bytes", status: errSecParam)
    }
    for _ in 0..<2 {
      try deleteRootSeed()
      if try addRootSeed(seed) {
        return
      }
    }
    throw BuddiesKeychainError(message: "Could not replace root seed", status: errSecDuplicateItem)
  }

  private func deleteRootSeed() throws {
    var query = baseQuery()
    query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw BuddiesKeychainError(message: "Could not delete root seed", status: status)
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

  /// Replaces the snapshot, or deletes it for nil. Readable after the first
  /// unlock (the extension runs on a locked phone), on this device only: it
  /// never syncs or moves to another device in a backup.
  private func writeAlertContext(_ json: String?) throws {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.alertService,
      kSecAttrAccount as String: Self.alertAccount,
      kSecAttrAccessGroup as String: try alertAccessGroup(),
      kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
    ]
    guard let json else {
      let status = SecItemDelete(query as CFDictionary)
      guard status == errSecSuccess || status == errSecItemNotFound else {
        throw BuddiesKeychainError(message: "Could not delete alert context", status: status)
      }
      return
    }
    let data = Data(json.utf8)
    let accessible = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    var status = SecItemUpdate(
      query as CFDictionary,
      [
        kSecValueData as String: data,
        kSecAttrAccessible as String: accessible,
      ] as CFDictionary
    )
    if status == errSecItemNotFound {
      query[kSecValueData as String] = data
      query[kSecAttrAccessible as String] = accessible
      status = SecItemAdd(query as CFDictionary, nil)
    }
    guard status == errSecSuccess else {
      throw BuddiesKeychainError(message: "Could not store alert context", status: status)
    }
  }

  private var cachedAlertAccessGroup: String?

  /// `<team id>.<bundle id>.buddies-alerts`. The team id is read from the app's
  /// default access group (`<team id>.<bundle id>`), which a probe item shows.
  private func alertAccessGroup() throws -> String {
    if let cachedAlertAccessGroup { return cachedAlertAccessGroup }
    let probe: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "\(service).probe",
      kSecAttrAccount as String: "access-group",
      kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
      kSecReturnAttributes as String: true,
    ]
    var result: AnyObject?
    var status = SecItemCopyMatching(probe as CFDictionary, &result)
    if status == errSecItemNotFound {
      var add = probe
      add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      status = SecItemAdd(add as CFDictionary, &result)
    }
    guard
      status == errSecSuccess,
      let attributes = result as? [String: Any],
      let group = attributes[kSecAttrAccessGroup as String] as? String,
      let team = group.split(separator: ".").first,
      let bundleId = Bundle.main.bundleIdentifier
    else {
      throw BuddiesKeychainError(message: "Could not find the Keychain access group", status: status)
    }
    let alertGroup = "\(team).\(bundleId).buddies-alerts"
    cachedAlertAccessGroup = alertGroup
    return alertGroup
  }

  private static func decodeBase64url(_ text: String) -> Data? {
    var base64 = text
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    while base64.count % 4 != 0 {
      base64.append("=")
    }
    return Data(base64Encoded: base64)
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
