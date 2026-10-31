import CryptoKit
import Foundation
import Security

/// Fetches the event a push is about when it was too big to ride along: an
/// owner-signed `inbox/sync` from just before its `seq` (docs/buddies-protocol.md,
/// "Request envelope"). Reads only; the app's own sync applies events.
///
/// The extension can't hold the session's rotating refresh token without
/// racing the app, so it signs with the owner key and names itself in
/// `clientHeader`: the relay keeps serving this one legacy request after the
/// legacy switch is off, for an inbox linked to an account ("Authentication
/// (sessions)").
enum InboxFetch {
  enum Failure: Error {
    case noRelay, badKey, rejected
    /// The relay refused the inbox's owner key: the account's key changed since
    /// the old key linked it (401 `key_changed`).
    case keyChanged
  }

  static let clientHeader = (name: "x-buddies-client", value: "notification-service")

  /// Inboxes whose owner key the relay refused, kept in the App Group: this
  /// extension never signs for one again, and the app drops it
  /// (`refusedInboxes` in `modules/buddies-keychain`). An inbox's owner key
  /// comes from the account key, so a refused one stays refused.
  static let refusedKey = "buddiesRefusedInboxes"
  static let refusedLimit = 4

  static func refusedInboxes(in defaults: UserDefaults?) -> [String] {
    defaults?.stringArray(forKey: refusedKey) ?? []
  }

  static func refuse(_ inboxId: String, in defaults: UserDefaults?) {
    guard let defaults else { return }
    let others = refusedInboxes(in: defaults).filter { $0 != inboxId }
    defaults.set(Array((others + [inboxId]).suffix(refusedLimit)), forKey: refusedKey)
  }

  /// The relay's answer to an owner key the account no longer has.
  static func isKeyChanged(status: Int?, body: Data) -> Bool {
    guard status == 401,
      let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any]
    else { return false }
    return json["reason"] as? String == "key_changed"
  }

  /// The payload bytes, in the order the app writes them.
  static func payload(inboxId: String, since: Int, ts: Int64, nonce: Data) -> Data {
    Data(
      "{\"inboxId\":\"\(inboxId)\",\"since\":\(since),\"ts\":\(ts),\"nonce\":\"\(B64U.encode(nonce))\"}"
        .utf8)
  }

  /// `{ payload, signature }`: the payload, signed over `"ww-buddies/v1\n" + op +
  /// "\n"` and its bytes with the owner key (Ed25519).
  static func envelope(op: String, payload: Data, ownerSeed: Data) throws -> [String: String] {
    let key = try Curve25519.Signing.PrivateKey(rawRepresentation: ownerSeed)
    let signature = try key.signature(for: Data("ww-buddies/v1\n\(op)\n".utf8) + payload)
    return ["payload": B64U.encode(payload), "signature": B64U.encode(signature)]
  }

  /// The `inbox/sync` POST carrying `envelope`.
  static func request(url: URL, envelope: [String: String]) throws -> URLRequest {
    var request = URLRequest(url: url, timeoutInterval: 15)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "content-type")
    request.setValue(clientHeader.value, forHTTPHeaderField: clientHeader.name)
    request.httpBody = try JSONSerialization.data(withJSONObject: envelope)
    return request
  }

  static func event(
    seq: Int,
    context: AlertContext,
    refused: UserDefaults?,
    session: URLSession = .shared
  ) async throws -> SealedEvent? {
    guard !refusedInboxes(in: refused).contains(context.inboxId) else {
      throw Failure.keyChanged
    }
    guard let relay = context.relay, let url = URL(string: "\(relay)/buddies/v1/inbox/sync")
    else { throw Failure.noRelay }
    guard let ownerSeed = B64U.decode(context.ownerSeed), ownerSeed.count == 32 else {
      throw Failure.badKey
    }
    var nonce = Data(count: 16)
    let status = nonce.withUnsafeMutableBytes {
      SecRandomCopyBytes(kSecRandomDefault, 16, $0.baseAddress!)
    }
    guard status == errSecSuccess else { throw Failure.badKey }
    let body = try envelope(
      op: "inbox/sync",
      payload: payload(
        inboxId: context.inboxId,
        since: seq - 1,
        ts: Int64(Date().timeIntervalSince1970 * 1000),
        nonce: nonce),
      ownerSeed: ownerSeed)
    let (data, response) = try await session.data(for: Self.request(url: url, envelope: body))
    // Sent once: nothing signs for this inbox here again.
    if isKeyChanged(status: (response as? HTTPURLResponse)?.statusCode, body: data) {
      refuse(context.inboxId, in: refused)
      throw Failure.keyChanged
    }
    guard
      (response as? HTTPURLResponse)?.statusCode == 200,
      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      json["ok"] as? Bool == true,
      let events = json["events"] as? [[String: Any]]
    else { throw Failure.rejected }
    return events.lazy
      .first { ($0["seq"] as? NSNumber)?.intValue == seq }
      .flatMap { event in
        guard
          let eventId = event["eventId"] as? String,
          let kind = event["kind"] as? String,
          let blob = event["blob"] as? String
        else { return nil }
        return SealedEvent(eventId: eventId, kind: kind, blob: blob, slotId: event["slotId"] as? String)
      }
  }
}
