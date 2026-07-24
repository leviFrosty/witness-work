import ExpoModulesCore
import DeviceCheck
import Foundation

/**
 * Wraps `DCAppAttestService` (Apple App Attest). The Secure Enclave proves a
 * request comes from a genuine, unmodified instance of this app on a real Apple
 * device — the security boundary for Notes Import (ADR 0007).
 *
 * The JS side computes client-data hashes. This adapter accepts only strict
 * base64 encodings of exactly 32 bytes and maps DeviceCheck errors to stable,
 * non-localized codes so lifecycle decisions never inspect message text.
 */
public class AppAttestModule: Module {
  private enum Code {
    static let unsupported = "APP_ATTEST_UNSUPPORTED"
    static let invalidInput = "APP_ATTEST_INVALID_INPUT"
    static let invalidKey = "APP_ATTEST_INVALID_KEY"
    static let serverUnavailable = "APP_ATTEST_SERVER_UNAVAILABLE"
    static let systemFailure = "APP_ATTEST_SYSTEM_FAILURE"
    static let unknown = "APP_ATTEST_UNKNOWN"
  }

  public func definition() -> ModuleDefinition {
    Name("AppAttest")

    Function("isSupported") { () -> Bool in
      if #available(iOS 14.0, *) {
        return DCAppAttestService.shared.isSupported
      }
      return false
    }

    AsyncFunction("generateKey") { (promise: Promise) in
      guard #available(iOS 14.0, *), DCAppAttestService.shared.isSupported else {
        self.reject(promise, code: Code.unsupported)
        return
      }
      DCAppAttestService.shared.generateKey { keyId, error in
        if let error {
          self.reject(promise, error: error)
          return
        }
        guard let keyId, !keyId.isEmpty else {
          self.reject(promise, code: Code.unknown)
          return
        }
        promise.resolve(keyId)
      }
    }

    AsyncFunction("attestKey") {
      (keyId: String, clientDataHashBase64: String, promise: Promise) in
      guard #available(iOS 14.0, *), DCAppAttestService.shared.isSupported else {
        self.reject(promise, code: Code.unsupported)
        return
      }
      guard !keyId.isEmpty,
            let hash = Data(base64Encoded: clientDataHashBase64),
            hash.count == 32 else {
        self.reject(promise, code: Code.invalidInput)
        return
      }
      DCAppAttestService.shared.attestKey(keyId, clientDataHash: hash) {
        attestation, error in
        if let error {
          self.reject(promise, error: error)
          return
        }
        guard let attestation else {
          self.reject(promise, code: Code.unknown)
          return
        }
        promise.resolve(attestation.base64EncodedString())
      }
    }

    AsyncFunction("generateAssertion") {
      (keyId: String, clientDataHashBase64: String, promise: Promise) in
      guard #available(iOS 14.0, *), DCAppAttestService.shared.isSupported else {
        self.reject(promise, code: Code.unsupported)
        return
      }
      guard !keyId.isEmpty,
            let hash = Data(base64Encoded: clientDataHashBase64),
            hash.count == 32 else {
        self.reject(promise, code: Code.invalidInput)
        return
      }
      DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: hash) {
        assertion, error in
        if let error {
          self.reject(promise, error: error)
          return
        }
        guard let assertion else {
          self.reject(promise, code: Code.unknown)
          return
        }
        promise.resolve(assertion.base64EncodedString())
      }
    }
  }

  private func reject(_ promise: Promise, error: Error) {
    let nsError = error as NSError
    guard nsError.domain == DCErrorDomain else {
      reject(promise, code: Code.unknown)
      return
    }
    switch nsError.code {
    case DCError.featureUnsupported.rawValue:
      reject(promise, code: Code.unsupported)
    case DCError.invalidInput.rawValue:
      reject(promise, code: Code.invalidInput)
    case DCError.invalidKey.rawValue:
      reject(promise, code: Code.invalidKey)
    case DCError.serverUnavailable.rawValue:
      reject(promise, code: Code.serverUnavailable)
    case DCError.unknownSystemFailure.rawValue:
      reject(promise, code: Code.systemFailure)
    default:
      reject(promise, code: Code.unknown)
    }
  }

  private func reject(_ promise: Promise, code: String) {
    promise.reject(code, "App Attest operation failed")
  }
}
