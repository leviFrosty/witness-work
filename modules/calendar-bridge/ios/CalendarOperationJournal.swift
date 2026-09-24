import Foundation
import Security

/// Reinstall-stable intent, with the same this-device-only lifetime as the
/// Keychain device ID. A sandbox file would disappear on uninstall while a
/// CloudKit lock and the identity that owns it survived.
enum CalendarOperationJournal {
  private static func query(_ namespace: String) throws -> [String: Any] {
    guard UUID(uuidString: namespace) != nil else { throw CalendarFailure("CALENDAR_UNAVAILABLE") }
    return [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "\(Bundle.main.bundleIdentifier ?? "witnesswork").calendar-operation",
            kSecAttrAccount as String: namespace,
            kSecAttrSynchronizable as String: false]
  }

  static func write(calendarId: String, namespace: String) throws {
    var attributes = try query(namespace)
    let value = [kSecValueData as String: Data(calendarId.utf8)]
    var status = SecItemUpdate(attributes as CFDictionary, value as CFDictionary)
    if status == errSecItemNotFound {
      attributes.merge(value) { _, value in value }
      attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      status = SecItemAdd(attributes as CFDictionary, nil)
    }
    guard status == errSecSuccess else { throw CalendarFailure("CALENDAR_JOURNAL") }
  }

  static func read(namespace: String) throws -> String? {
    var attributes = try query(namespace)
    attributes[kSecReturnData as String] = true
    attributes[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(attributes as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data,
          let value = String(data: data, encoding: .utf8) else { throw CalendarFailure("CALENDAR_JOURNAL") }
    return value
  }

  static func clear(namespace: String) throws {
    let status = SecItemDelete(try query(namespace) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { throw CalendarFailure("CALENDAR_JOURNAL") }
  }
}
