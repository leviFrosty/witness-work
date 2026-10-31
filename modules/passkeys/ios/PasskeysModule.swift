import AuthenticationServices
import CryptoKit
import ExpoModulesCore
import Foundation
import UIKit

/**
 * Platform passkeys for the server account (ADR 0038): iCloud Keychain or the
 * User's passkey provider, through `ASAuthorizationPlatformPublicKeyCredentialProvider`.
 *
 * WebAuthn JSON in and out, base64url throughout, so the JS side is the same
 * as on Android and the web. PRF runs from iOS 18; below that a passkey only
 * signs in. User verification is always required. Errors reject with stable,
 * non-localized codes; the system's message rides along for logs only.
 */
public class PasskeysModule: Module {
  private var ceremony: PasskeyCeremony?

  public func definition() -> ModuleDefinition {
    Name("Passkeys")

    // JS checks this so OTA updates never call into a binary without the module.
    Constant("passkeysVersion") {
      1
    }

    // The deployment target (16.4) already has passkeys.
    AsyncFunction("getSupport") { () -> [String: Any] in
      if #available(iOS 18.0, *) {
        return ["passkeys": true, "prf": "yes"]
      }
      return ["passkeys": true, "prf": "no"]
    }

    AsyncFunction("create") { (optionsJson: String, promise: Promise) in
      self.perform(promise) { try PasskeyRequests.registration(optionsJson) }
    }.runOnQueue(.main)

    AsyncFunction("get") { (optionsJson: String, promise: Promise) in
      self.perform(promise) { try PasskeyRequests.assertion(optionsJson) }
    }.runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async {
        self.ceremony?.finish(code: PasskeyCode.cancelled, message: "Module destroyed")
      }
    }
  }

  private func perform(_ promise: Promise, build: () throws -> PasskeyRequests.Built) {
    guard ceremony == nil else {
      PasskeyCeremony.reject(promise, code: PasskeyCode.failed, message: "A passkey request is already running")
      return
    }
    let built: PasskeyRequests.Built
    do {
      built = try build()
    } catch {
      PasskeyCeremony.reject(promise, code: PasskeyCode.failed, message: "Invalid options: \(error)")
      return
    }
    guard PasskeyDomains.claims(built.rpId) else {
      PasskeyCeremony.reject(
        promise,
        code: PasskeyCode.domainNotAssociated,
        message: "This build doesn't claim webcredentials:\(built.rpId)"
      )
      return
    }
    guard let anchor = Self.keyWindow() else {
      PasskeyCeremony.reject(promise, code: PasskeyCode.failed, message: "No window to present from")
      return
    }
    let ceremony = PasskeyCeremony(request: built.request, rpId: built.rpId, promise: promise, anchor: anchor) {
      [weak self] in
      self?.ceremony = nil
    }
    self.ceremony = ceremony
    ceremony.start(timeout: built.timeout)
  }

  /** The key window of the scene the User is looking at. */
  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }?
      .keyWindow
  }
}

/**
 * The `webcredentials:` hosts this build claims, which `plugins/with-passkey-domains.js`
 * copies into Info.plist from the associated domains entitlement. A request
 * for any other RP ID can't succeed, so it ends before the sheet.
 */
enum PasskeyDomains {
  static func claims(_ rpId: String) -> Bool {
    // A binary built without the plugin can't tell; let the system decide.
    guard let domains = Bundle.main.object(forInfoDictionaryKey: "WWPasskeyDomains") as? [String] else {
      return true
    }
    return domains.contains(rpId)
  }
}

enum PasskeyCode {
  static let cancelled = "PASSKEY_CANCELLED"
  static let notSupported = "PASSKEY_NOT_SUPPORTED"
  static let noCredentials = "PASSKEY_NO_CREDENTIALS"
  static let timeout = "PASSKEY_TIMEOUT"
  static let domainNotAssociated = "PASSKEY_DOMAIN_NOT_ASSOCIATED"
  static let alreadyRegistered = "PASSKEY_ALREADY_REGISTERED"
  static let failed = "PASSKEY_FAILED"
}

/**
 * One system sheet. Keeps the controller and itself alive until it settles,
 * and settles exactly once: on the delegate's answer, or on its own timeout,
 * since React Native pauses JS timers while the sheet is up.
 */
final class PasskeyCeremony: NSObject, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  private let controller: ASAuthorizationController
  private let rpId: String
  private let anchor: ASPresentationAnchor
  private var promise: Promise?
  private var timer: DispatchWorkItem?
  private let onFinish: () -> Void

  init(
    request: ASAuthorizationRequest,
    rpId: String,
    promise: Promise,
    anchor: ASPresentationAnchor,
    onFinish: @escaping () -> Void
  ) {
    self.controller = ASAuthorizationController(authorizationRequests: [request])
    self.rpId = rpId
    self.anchor = anchor
    self.promise = promise
    self.onFinish = onFinish
    super.init()
  }

  func start(timeout: TimeInterval) {
    controller.delegate = self
    controller.presentationContextProvider = self
    let timer = DispatchWorkItem { [weak self] in
      self?.finish(code: PasskeyCode.timeout, message: "Timed out after \(Int(timeout)) s")
    }
    self.timer = timer
    DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: timer)
    controller.performRequests()
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    anchor
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    do {
      let json: [String: Any]
      switch authorization.credential {
      case let registration as ASAuthorizationPlatformPublicKeyCredentialRegistration:
        json = try PasskeyResponses.registration(registration)
      case let assertion as ASAuthorizationPlatformPublicKeyCredentialAssertion:
        json = PasskeyResponses.assertion(assertion)
      default:
        finish(code: PasskeyCode.failed, message: "Unexpected credential \(type(of: authorization.credential))")
        return
      }
      let data = try JSONSerialization.data(withJSONObject: json)
      guard let promise = settle() else { return }
      promise.resolve(String(decoding: data, as: UTF8.self))
    } catch {
      finish(code: PasskeyCode.failed, message: "\(error)")
    }
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    let nsError = error as NSError
    finish(code: Self.code(for: nsError, rpId: rpId), message: Self.describe(nsError))
  }

  /** Rejects with `code` unless already settled, and closes the sheet. */
  func finish(code: String, message: String) {
    guard let promise = settle() else { return }
    Self.reject(promise, code: code, message: message)
    if code == PasskeyCode.timeout || code == PasskeyCode.cancelled {
      controller.cancel()
    }
  }

  private func settle() -> Promise? {
    guard let promise else { return nil }
    self.promise = nil
    timer?.cancel()
    timer = nil
    onFinish()
    return promise
  }

  // Raw values of cases newer than the deployment target.
  /** `matchedExcludedCredential` (iOS 18): a passkey in `excludeCredentials` is here already. */
  private static let matchedExcludedCredential = 1006
  /**
   * `deviceNotConfiguredForPasskeyCreation` (iOS 26): no passcode, or no
   * iCloud Keychain and no other provider.
   */
  private static let deviceNotConfiguredForPasskeyCreation = 1010

  private static func code(for error: NSError, rpId: String) -> String {
    if isNotAssociated(error, rpId: rpId) { return PasskeyCode.domainNotAssociated }
    guard error.domain == ASAuthorizationError.errorDomain else { return PasskeyCode.failed }
    switch error.code {
    case ASAuthorizationError.canceled.rawValue:
      return PasskeyCode.cancelled
    case ASAuthorizationError.notInteractive.rawValue:
      return PasskeyCode.noCredentials
    case matchedExcludedCredential:
      return PasskeyCode.alreadyRegistered
    case deviceNotConfiguredForPasskeyCreation:
      return PasskeyCode.notSupported
    default:
      return PasskeyCode.failed
    }
  }

  /**
   * The app's associated domains don't list the RP ID, or Apple couldn't
   * confirm them. iOS reports only `ASAuthorizationError.failed`, with no
   * underlying error, and says which in the description ("Unable to verify
   * webcredentials association of <app> with domain <rp>", seen on iOS 27.1).
   * The one exception to never reading message text: it keys on the RP ID or
   * the entitlement's name, neither of which is translated.
   */
  private static func isNotAssociated(_ error: NSError, rpId: String) -> Bool {
    guard error.domain == ASAuthorizationError.errorDomain,
      error.code == ASAuthorizationError.failed.rawValue
    else { return false }
    let description = error.localizedDescription
    return description.contains(rpId) || description.contains("webcredentials")
  }

  /** Domain, code and message of each error in the chain, for logs. */
  private static func describe(_ error: NSError) -> String {
    var parts: [String] = []
    var current: NSError? = error
    while let next = current {
      let keys = next.userInfo.keys.sorted().joined(separator: ",")
      parts.append("\(next.domain) \(next.code) [\(keys)]: \(next.localizedDescription)")
      current = next.userInfo[NSUnderlyingErrorKey] as? NSError
    }
    return parts.joined(separator: " <- ")
  }

  /**
   * Sends the code twice, as App Attest does: as the rejection's `code` and
   * inside its message, so the JS classifier still works on runtimes that drop
   * the code from async rejections.
   */
  static func reject(_ promise: Promise, code: String, message: String) {
    promise.reject(code, "Passkey operation failed (\(code)): \(message)")
  }
}

/** WebAuthn options JSON → system requests. */
enum PasskeyRequests {
  private static let defaultTimeout: TimeInterval = 300

  struct Built {
    let request: ASAuthorizationRequest
    let rpId: String
    let timeout: TimeInterval
  }

  struct Descriptor: Decodable {
    let id: String
  }

  struct Extensions: Decodable {
    struct Prf: Decodable {
      struct Values: Decodable {
        let first: String
        let second: String?
      }
      let eval: Values?
    }
    let prf: Prf?
  }

  struct CreationOptions: Decodable {
    struct Rp: Decodable { let id: String? }
    struct User: Decodable {
      let id: String
      let name: String
      let displayName: String?
    }
    let rp: Rp
    let user: User
    let challenge: String
    let timeout: Double?
    let attestation: String?
    let excludeCredentials: [Descriptor]?
    let extensions: Extensions?
  }

  struct RequestOptions: Decodable {
    let rpId: String?
    let challenge: String
    let timeout: Double?
    let allowCredentials: [Descriptor]?
    let extensions: Extensions?
  }

  enum OptionsError: Error {
    case missing(String)
    case invalidBase64url(String)
  }

  static func registration(_ json: String) throws -> Built {
    let options = try JSONDecoder().decode(CreationOptions.self, from: Data(json.utf8))
    guard let rpId = options.rp.id, !rpId.isEmpty else { throw OptionsError.missing("rp.id") }
    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
    let request = provider.createCredentialRegistrationRequest(
      challenge: try decode(options.challenge, "challenge"),
      name: options.user.name,
      userID: try decode(options.user.id, "user.id")
    )
    request.displayName = options.user.displayName
    request.userVerificationPreference = .required
    request.attestationPreference = attestation(options.attestation)
    if #available(iOS 17.4, *), let excluded = options.excludeCredentials, !excluded.isEmpty {
      request.excludedCredentials = try excluded.map {
        ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: try decode($0.id, "excludeCredentials.id"))
      }
    }
    if #available(iOS 18.0, *), let values = try prfValues(options.extensions) {
      request.prf = .inputValues(values)
    }
    return Built(request: request, rpId: rpId, timeout: timeout(options.timeout))
  }

  static func assertion(_ json: String) throws -> Built {
    let options = try JSONDecoder().decode(RequestOptions.self, from: Data(json.utf8))
    guard let rpId = options.rpId, !rpId.isEmpty else { throw OptionsError.missing("rpId") }
    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
    let request = provider.createCredentialAssertionRequest(challenge: try decode(options.challenge, "challenge"))
    request.userVerificationPreference = .required
    if let allowed = options.allowCredentials, !allowed.isEmpty {
      request.allowedCredentials = try allowed.map {
        ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: try decode($0.id, "allowCredentials.id"))
      }
    }
    if #available(iOS 18.0, *), let values = try prfValues(options.extensions) {
      request.prf = .inputValues(values)
    }
    return Built(request: request, rpId: rpId, timeout: timeout(options.timeout))
  }

  /** The `eval` salts, raw; the system hashes them as WebAuthn says. */
  @available(iOS 18.0, *)
  private static func prfValues(_ extensions: Extensions?) throws
    -> ASAuthorizationPublicKeyCredentialPRFAssertionInput.InputValues?
  {
    guard let eval = extensions?.prf?.eval else { return nil }
    return .init(
      saltInput1: try decode(eval.first, "prf.eval.first"),
      saltInput2: try eval.second.map { try decode($0, "prf.eval.second") }
    )
  }

  private static func attestation(_ value: String?) -> ASAuthorizationPublicKeyCredentialAttestationKind {
    switch value {
    case "direct": return .direct
    case "indirect": return .indirect
    case "enterprise": return .enterprise
    default: return .none
    }
  }

  private static func timeout(_ milliseconds: Double?) -> TimeInterval {
    guard let milliseconds, milliseconds > 0 else { return defaultTimeout }
    return milliseconds / 1000
  }

  private static func decode(_ value: String, _ field: String) throws -> Data {
    guard let data = Base64url.decode(value) else { throw OptionsError.invalidBase64url(field) }
    return data
  }
}

/** System credentials → WebAuthn response JSON. */
enum PasskeyResponses {
  enum ResponseError: Error {
    case missingAttestationObject
  }

  static func registration(_ credential: ASAuthorizationPlatformPublicKeyCredentialRegistration) throws -> [String: Any] {
    guard let attestationObject = credential.rawAttestationObject else {
      throw ResponseError.missingAttestationObject
    }
    var extensions: [String: Any] = [:]
    if #available(iOS 18.0, *), let prf = credential.prf {
      var output: [String: Any] = ["enabled": prf.isSupported]
      if let first = prf.first { output["results"] = ["first": Base64url.encode(first)] }
      extensions["prf"] = output
    }
    let id = Base64url.encode(credential.credentialID)
    let attachment = attachment(credential)
    return [
      "id": id,
      "rawId": id,
      "type": "public-key",
      "authenticatorAttachment": attachment,
      "response": [
        "clientDataJSON": Base64url.encode(credential.rawClientDataJSON),
        "attestationObject": Base64url.encode(attestationObject),
        // A passkey made on a phone over hybrid is reached that way again.
        "transports": attachment == "cross-platform" ? ["hybrid"] : ["internal", "hybrid"],
      ],
      "clientExtensionResults": extensions,
    ]
  }

  static func assertion(_ credential: ASAuthorizationPlatformPublicKeyCredentialAssertion) -> [String: Any] {
    var extensions: [String: Any] = [:]
    if #available(iOS 18.0, *), let prf = credential.prf {
      extensions["prf"] = ["results": ["first": Base64url.encode(prf.first)]]
    }
    var response: [String: Any] = [
      "clientDataJSON": Base64url.encode(credential.rawClientDataJSON),
      "authenticatorData": Base64url.encode(credential.rawAuthenticatorData),
      "signature": Base64url.encode(credential.signature),
    ]
    if let userID = credential.userID, !userID.isEmpty {
      response["userHandle"] = Base64url.encode(userID)
    }
    let id = Base64url.encode(credential.credentialID)
    return [
      "id": id,
      "rawId": id,
      "type": "public-key",
      "authenticatorAttachment": attachment(credential),
      "response": response,
      "clientExtensionResults": extensions,
    ]
  }

  /** `cross-platform` when the passkey came from a phone over hybrid. */
  private static func attachment(_ credential: PlatformPasskeyCredential) -> String {
    if #available(iOS 16.6, *), credential.attachment == .crossPlatform { return "cross-platform" }
    return "platform"
  }
}

/** The two platform credentials, which both say how the passkey was reached. */
protocol PlatformPasskeyCredential {
  @available(iOS 16.6, *)
  var attachment: ASAuthorizationPublicKeyCredentialAttachment { get }
}

extension ASAuthorizationPlatformPublicKeyCredentialRegistration: PlatformPasskeyCredential {}
extension ASAuthorizationPlatformPublicKeyCredentialAssertion: PlatformPasskeyCredential {}

/** Unpadded base64url, the only binary encoding on the accounts wire. */
enum Base64url {
  static func encode(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  static func encode(_ key: SymmetricKey) -> String {
    encode(key.withUnsafeBytes { Data($0) })
  }

  static func decode(_ value: String) -> Data? {
    guard value.allSatisfy({ $0.isLetter && $0.isASCII || $0.isNumber && $0.isASCII || $0 == "-" || $0 == "_" }) else {
      return nil
    }
    var base64 = value
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    let remainder = base64.count % 4
    if remainder == 1 { return nil }
    if remainder > 0 { base64 += String(repeating: "=", count: 4 - remainder) }
    return Data(base64Encoded: base64)
  }
}
