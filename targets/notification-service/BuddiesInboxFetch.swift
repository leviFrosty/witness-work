import CryptoKit
import Foundation
import Security

/// Fetches the event a push is about when it was too big to ride along: an
/// owner-signed `inbox/sync` from just before its `seq` (docs/buddies-protocol.md,
/// "Request envelope"). Reads only; the app's own sync applies events.
enum InboxFetch {
  enum Failure: Error {
    case noRelay, badKey, rejected
  }

  /// The payload bytes, in the order the app writes them.
  static func payload(inboxId: String, since: Int, ts: Int64, nonce: Data) -> Data {
    Data(
      "{\"inboxId\":\"\(inboxId)\",\"since\":\(since),\"ts\":\(ts),\"nonce\":\"\(B64U.encode(nonce))\"}"
        .utf8)
  }

  /// `{ p, s }`: the payload, signed over `"ww-buddies/v1\n" + op + "\n"` and its
  /// bytes with the owner key (Ed25519).
  static func envelope(op: String, payload: Data, ownerSeed: Data) throws -> [String: String] {
    let key = try Curve25519.Signing.PrivateKey(rawRepresentation: ownerSeed)
    let signature = try key.signature(for: Data("ww-buddies/v1\n\(op)\n".utf8) + payload)
    return ["p": B64U.encode(payload), "s": B64U.encode(signature)]
  }

  static func event(
    seq: Int,
    context: AlertContext,
    session: URLSession = .shared
  ) async throws -> SealedEvent? {
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
    var request = URLRequest(url: url, timeoutInterval: 15)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "content-type")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    let (data, response) = try await session.data(for: request)
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
