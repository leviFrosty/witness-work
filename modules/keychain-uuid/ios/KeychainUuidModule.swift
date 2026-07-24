import ExpoModulesCore
import Foundation
import Security

/**
 * Stores reinstall-stable device state as generic-password Keychain items.
 * Items are this-device-only and explicitly non-synchronizing: they survive an
 * app reinstall, never migrate to another device, and never enter iCloud
 * Keychain. The recovery credential is readable only while the device is
 * unlocked; identifiers retain the existing after-first-unlock behavior.
 */
public class KeychainUuidModule: Module {
  private let service = "com.leviwilkerson.witnesswork.installid"
  private let installIdAccount = "install-id"
  private let appAttestKeyIdAccount = "notes-import-app-attest-key-id"
  private let appAttestRecoveryTokenAccount =
    "notes-import-app-attest-recovery-token"
  private let appAttestRecoveryEnrollmentKeyIdAccount =
    "notes-import-app-attest-recovery-enrollment-key-id"
  private let appAttestJournalKeyAccount =
    "notes-import-app-attest-journal-key"

  public func definition() -> ModuleDefinition {
    Name("KeychainUuid")

    // JS checks this before using methods added after the original UUID-only
    // module. Older OTA-compatible binaries expose the module but not this API.
    Constant("appAttestStorageVersion") {
      2
    }

    // Existing UUID interface — preserved for all current callers.
    Function("getOrCreate") { () throws -> String in
      if let existing = try self.read(account: self.installIdAccount) {
        return existing
      }
      let created = UUID().uuidString
      try self.write(created, account: self.installIdAccount)
      return created
    }

    Function("peek") { () throws -> String? in
      return try self.read(account: self.installIdAccount)
    }

    Function("readAppAttestKeyId") { () throws -> String? in
      return try self.read(account: self.appAttestKeyIdAccount)
    }

    Function("writeAppAttestKeyId") { (keyId: String) throws in
      guard !keyId.isEmpty else {
        throw self.exception(
          code: "KEYCHAIN_INVALID_INPUT",
          description: "App Attest key id must not be empty"
        )
      }
      try self.write(keyId, account: self.appAttestKeyIdAccount)
    }

    Function("readAppAttestRecoveryToken") { () throws -> String? in
      return try self.read(account: self.appAttestRecoveryTokenAccount)
    }

    Function("getOrCreateAppAttestRecoveryToken") { () throws -> String in
      if let existing = try self.read(
        account: self.appAttestRecoveryTokenAccount
      ) {
        return existing
      }

      var bytes = [UInt8](repeating: 0, count: 32)
      let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
      guard status == errSecSuccess else {
        throw self.exception(
          code: "KEYCHAIN_RANDOM_FAILED",
          description: "Could not create recovery token"
        )
      }
      // Base64url without padding: 32 random bytes retain all 256 bits while the
      // resulting token remains safe in JSON and HTTP bodies.
      let created = Data(bytes).base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
      try self.write(
        created,
        account: self.appAttestRecoveryTokenAccount,
        accessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
      )
      return created
    }

    Function("readAppAttestRecoveryEnrollmentKeyId") { () throws -> String? in
      return try self.read(
        account: self.appAttestRecoveryEnrollmentKeyIdAccount
      )
    }

    Function("writeAppAttestRecoveryEnrollmentKeyId") {
      (keyId: String) throws in
      guard !keyId.isEmpty else {
        throw self.exception(
          code: "KEYCHAIN_INVALID_INPUT",
          description: "Recovery enrollment key id must not be empty"
        )
      }
      try self.write(
        keyId,
        account: self.appAttestRecoveryEnrollmentKeyIdAccount
      )
    }

    Function("getOrCreateAppAttestJournalKey") { () throws -> String in
      if let existing = try self.read(account: self.appAttestJournalKeyAccount) {
        return existing
      }

      // MMKV accepts at most 16 bytes/characters. Twelve random bytes encode to
      // exactly 16 unpadded base64url characters (96 bits) without truncation.
      var bytes = [UInt8](repeating: 0, count: 12)
      let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
      guard status == errSecSuccess else {
        throw self.exception(
          code: "KEYCHAIN_RANDOM_FAILED",
          description: "Could not create lifecycle journal key"
        )
      }
      let created = Data(bytes).base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
      try self.write(created, account: self.appAttestJournalKeyAccount)
      return created
    }
  }

  private func baseQuery(account: String) -> [String: Any] {
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
    ]
  }

  /** `nil` means only errSecItemNotFound; every other status throws. */
  private func read(account: String) throws -> String? {
    var query = baseQuery(account: account)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else {
      throw exception(
        code: "KEYCHAIN_READ_FAILED",
        description: "Keychain read failed (status \(status))"
      )
    }
    guard let data = item as? Data,
          let value = String(data: data, encoding: .utf8),
          !value.isEmpty else {
      throw exception(
        code: "KEYCHAIN_INVALID_VALUE",
        description: "Keychain item is not valid UTF-8"
      )
    }
    return value
  }

  private func write(
    _ value: String,
    account: String,
    accessible: CFString = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
  ) throws {
    guard let data = value.data(using: .utf8) else {
      throw exception(
        code: "KEYCHAIN_INVALID_INPUT",
        description: "Keychain value is not valid UTF-8"
      )
    }

    var attributes = baseQuery(account: account)
    attributes[kSecValueData as String] = data
    attributes[kSecAttrAccessible as String] = accessible

    let addStatus = SecItemAdd(attributes as CFDictionary, nil)
    if addStatus == errSecSuccess { return }
    if addStatus == errSecDuplicateItem {
      let updates: [String: Any] = [
        kSecValueData as String: data,
        kSecAttrAccessible as String: accessible,
      ]
      let updateStatus = SecItemUpdate(
        baseQuery(account: account) as CFDictionary,
        updates as CFDictionary
      )
      guard updateStatus == errSecSuccess else {
        throw exception(
          code: "KEYCHAIN_WRITE_FAILED",
          description: "Keychain update failed (status \(updateStatus))"
        )
      }
      return
    }
    throw exception(
      code: "KEYCHAIN_WRITE_FAILED",
      description: "Keychain add failed (status \(addStatus))"
    )
  }

  private func exception(code: String, description: String) -> Exception {
    return Exception(
      name: "KeychainUuidError",
      description: description,
      code: code
    )
  }
}
