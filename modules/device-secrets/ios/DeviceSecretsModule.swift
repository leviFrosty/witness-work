import ExpoModulesCore
import Foundation
import Security

/**
 * Small secrets that belong to this device: today the account session's refresh
 * token (ADR 0027). Each is a generic-password Keychain item that never syncs
 * through iCloud Keychain and is never restored onto another device
 * (`ThisDeviceOnly`), unlike `buddies-keychain`'s synchronizable account key.
 * Readable after the first unlock, so background work can refresh a session
 * on a locked phone.
 */
public class DeviceSecretsModule: Module {
  private let service = "com.leviwilkerson.witnesswork.device-secrets"

  public func definition() -> ModuleDefinition {
    Name("DeviceSecrets")

    // JS checks this so OTA updates never call into a binary without the module.
    Constant("deviceSecretsVersion") {
      1
    }

    AsyncFunction("read") { (name: String) throws -> String? in
      return try self.read(name)
    }

    AsyncFunction("write") { (name: String, value: String) throws in
      try self.write(name, value)
    }

    AsyncFunction("remove") { (name: String) throws in
      try self.remove(name)
    }
  }

  private func baseQuery(_ name: String) -> [String: Any] {
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: name,
      kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
    ]
  }

  private func read(_ name: String) throws -> String? {
    var query = baseQuery(name)
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
      throw DeviceSecretsError(message: "Could not read device secret", status: status)
    }
    return value
  }

  private func write(_ name: String, _ value: String) throws {
    let data = Data(value.utf8)
    let accessible = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    var status = SecItemUpdate(
      baseQuery(name) as CFDictionary,
      [
        kSecValueData as String: data,
        kSecAttrAccessible as String: accessible,
      ] as CFDictionary
    )
    if status == errSecItemNotFound {
      var add = baseQuery(name)
      add[kSecValueData as String] = data
      add[kSecAttrAccessible as String] = accessible
      status = SecItemAdd(add as CFDictionary, nil)
    }
    guard status == errSecSuccess else {
      throw DeviceSecretsError(message: "Could not store device secret", status: status)
    }
  }

  private func remove(_ name: String) throws {
    let status = SecItemDelete(baseQuery(name) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw DeviceSecretsError(message: "Could not delete device secret", status: status)
    }
  }
}

struct DeviceSecretsError: LocalizedError {
  let message: String
  let status: OSStatus

  var errorDescription: String? {
    return "\(message) (OSStatus \(status))"
  }
}
