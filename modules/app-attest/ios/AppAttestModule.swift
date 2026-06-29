import ExpoModulesCore
import DeviceCheck

/**
 * Wraps `DCAppAttestService` (Apple App Attest). The Secure Enclave proves a
 * request comes from a genuine, unmodified instance of this app on a real Apple
 * device — the security boundary for Notes Import (ADR 0007).
 *
 * The JS side computes the client-data hashes; this module just forwards the
 * base64-encoded 32-byte hashes to Apple and returns base64 blobs.
 */
public class AppAttestModule: Module {
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
        promise.reject("UNSUPPORTED", "App Attest is not supported on this device")
        return
      }
      DCAppAttestService.shared.generateKey { keyId, error in
        if let error = error {
          promise.reject("GENERATE_KEY", error.localizedDescription)
          return
        }
        guard let keyId = keyId else {
          promise.reject("GENERATE_KEY", "No key id returned")
          return
        }
        promise.resolve(keyId)
      }
    }

    AsyncFunction("attestKey") {
      (keyId: String, clientDataHashBase64: String, promise: Promise) in
      guard #available(iOS 14.0, *), DCAppAttestService.shared.isSupported else {
        promise.reject("UNSUPPORTED", "App Attest is not supported on this device")
        return
      }
      guard let hash = Data(base64Encoded: clientDataHashBase64) else {
        promise.reject("BAD_HASH", "clientDataHash is not valid base64")
        return
      }
      DCAppAttestService.shared.attestKey(keyId, clientDataHash: hash) {
        attestation, error in
        if let error = error {
          promise.reject("ATTEST", error.localizedDescription)
          return
        }
        guard let attestation = attestation else {
          promise.reject("ATTEST", "No attestation returned")
          return
        }
        promise.resolve(attestation.base64EncodedString())
      }
    }

    AsyncFunction("generateAssertion") {
      (keyId: String, clientDataHashBase64: String, promise: Promise) in
      guard #available(iOS 14.0, *), DCAppAttestService.shared.isSupported else {
        promise.reject("UNSUPPORTED", "App Attest is not supported on this device")
        return
      }
      guard let hash = Data(base64Encoded: clientDataHashBase64) else {
        promise.reject("BAD_HASH", "clientDataHash is not valid base64")
        return
      }
      DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: hash) {
        assertion, error in
        if let error = error {
          promise.reject("ASSERT", error.localizedDescription)
          return
        }
        guard let assertion = assertion else {
          promise.reject("ASSERT", "No assertion returned")
          return
        }
        promise.resolve(assertion.base64EncodedString())
      }
    }
  }
}
