import ExpoModulesCore
import Security

/**
 * Stores a single per-install UUID in the Keychain as a generic password.
 * Accessibility is `AfterFirstUnlockThisDeviceOnly`: readable after the first
 * unlock following boot, never migrated to a new device, and (being Keychain)
 * surviving a normal app delete/reinstall. Identity layer for ADR 0007.
 */
public class KeychainUuidModule: Module {
  private let service = "com.leviwilkerson.witnesswork.installid"
  private let account = "install-id"

  public func definition() -> ModuleDefinition {
    Name("KeychainUuid")

    Function("getOrCreate") { () -> String in
      if let existing = self.read() {
        return existing
      }
      let created = UUID().uuidString
      self.write(created)
      return created
    }

    Function("peek") { () -> String? in
      return self.read()
    }
  }

  private func baseQuery() -> [String: Any] {
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }

  private func read() -> String? {
    var query = baseQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess,
          let data = item as? Data,
          let value = String(data: data, encoding: .utf8) else {
      return nil
    }
    return value
  }

  private func write(_ value: String) {
    guard let data = value.data(using: .utf8) else { return }
    // Replace any stale value first so the add can't fail with errSecDuplicateItem.
    SecItemDelete(baseQuery() as CFDictionary)

    var attributes = baseQuery()
    attributes[kSecValueData as String] = data
    attributes[kSecAttrAccessible as String] =
      kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(attributes as CFDictionary, nil)
  }
}
