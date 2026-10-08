import CryptoKit
import Foundation

/// The Notification Service Extension's Swift against the vectors the app's
/// TypeScript passes: `cryptoVectors.json` for every primitive it uses (CryptoKit
/// against `@noble/*`), and `alertVectors.json` for what each event means and
/// how its English alert reads. Run by `scripts/tests/buddies-alerts.node.mjs`:
///
///   swiftc targets/notification-service/BuddiesAlerts.swift \
///     targets/notification-service/BuddiesAlertText.swift \
///     targets/notification-service/BuddiesInboxFetch.swift \
///     scripts/tests/buddies-alerts.swift -o /tmp/buddies-alerts
///   /tmp/buddies-alerts <cryptoVectors.json> <alertVectors.json> <en-US.json>
@main struct BuddiesAlertTests {
  static var failures = 0
  static var checks = 0

  static func check(_ ok: Bool, _ message: @autoclosure () -> String) {
    checks += 1
    if !ok {
      failures += 1
      FileHandle.standardError.write(Data("✗ \(message())\n".utf8))
    }
  }

  static func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }
  static func fromHex(_ text: String) -> Data {
    Data(stride(from: 0, to: text.count, by: 2).map {
      let start = text.index(text.startIndex, offsetBy: $0)
      return UInt8(text[start..<text.index(start, offsetBy: 2)], radix: 16)!
    })
  }
  static func counting(_ length: Int, _ start: Int = 0) -> Data {
    Data((0..<length).map { UInt8((start + $0) & 0xff) })
  }

  static func json(_ path: String) -> [String: Any] {
    let data = FileManager.default.contents(atPath: path)!
    return try! JSONSerialization.jsonObject(with: data) as! [String: Any]
  }

  static func main() throws {
    let arguments = CommandLine.arguments
    guard arguments.count == 4 else {
      fatalError("usage: buddies-alerts <cryptoVectors.json> <alertVectors.json> <en-US.json>")
    }
    let crypto = json(arguments[1]) as! [String: String]
    let alerts = json(arguments[2])
    let english = json(arguments[3])

    try primitives(crypto)
    vectors(alerts, english: english)
    wording(english)

    print("\(checks - failures)/\(checks) checks passed")
    if failures > 0 { exit(1) }
  }

  /// CryptoKit and this file's base64url produce the app's exact bytes.
  static func primitives(_ v: [String: String]) throws {
    for length in 0...5 {
      check(
        B64U.encode(counting(length, 0xf8)) == v["b64u.counting\(length)"],
        "base64url of \(length) bytes")
    }
    check(B64U.encode(fromHex("fbefbeffff")) == v["b64u.urlSafe"], "URL-safe alphabet")
    check(B64U.decode("-_-_AAECAw").map(hex) == v["b64u.roundTrip"], "base64url decode")
    check(B64U.decode("ab+c") == nil && B64U.decode("abcde") == nil, "rejects bad base64url")

    // RFC 8439 2.8.2.
    let aead = try ChaChaPoly.seal(
      Data(
        "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it."
          .utf8),
      using: SymmetricKey(data: counting(32, 0x80)),
      nonce: ChaChaPoly.Nonce(data: fromHex("070000004041424344454647")),
      authenticating: fromHex("50515253c0c1c2c3c4c5c6c7"))
    check(hex(aead.ciphertext + aead.tag) == v["rfc.aead"], "ChaCha20-Poly1305 (RFC 8439)")

    // A sealed blob: opened, and sealed again to the same bytes.
    let key = fromHex(v["seal.key"]!)
    let opened = SealedBlob.open(key: key, blob: v["seal.blob"]!, aad: v["seal.aad"]!)
    check(opened.flatMap { String(data: $0, encoding: .utf8) } == v["seal.opened"], "opens a sealed blob")
    check(
      try SealedBlob.seal(
        key: key, plaintext: Data(v["seal.opened"]!.utf8), aad: v["seal.aad"]!,
        nonce: counting(12)) == v["seal.blob"],
      "seals the same blob")
    check(SealedBlob.open(key: key, blob: v["seal.blob"]!, aad: v["seal.aad"]! + "x") == nil, "AAD binds")

    // RFC 8032 7.1 TEST 1 and 2: CryptoKit's keys match; its signatures are
    // randomized, so it verifies the RFC's instead of reproducing them.
    let rfc = [
      ("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", "", "Test1"),
      ("4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb", "72", "Test2"),
    ]
    for (seed, message, name) in rfc {
      let publicKey = try Curve25519.Signing.PrivateKey(rawRepresentation: fromHex(seed)).publicKey
      check(hex(publicKey.rawRepresentation) == v["rfc.ed25519\(name)Pub"], "Ed25519 \(name) key")
      check(
        publicKey.isValidSignature(fromHex(v["rfc.ed25519\(name)Sig"]!), for: fromHex(message)),
        "Ed25519 \(name) signature")
    }

    // The owner key and a signed `inbox/sync` envelope, byte for byte.
    let ownerSeed = fromHex(v["identity.ownerSeed"]!)
    let ownerPub = try Curve25519.Signing.PrivateKey(rawRepresentation: ownerSeed).publicKey
    check(B64U.encode(ownerPub.rawRepresentation) == v["identity.ownerPub"], "owner key")
    let payload = InboxFetch.payload(
      inboxId: v["identity.inboxId"]!, since: 0, ts: 1_790_000_000_000, nonce: Data(count: 16))
    check(B64U.encode(payload) == v["envelope.p"], "envelope payload bytes")
    let signed = Data("ww-buddies/v1\ninbox/sync\n".utf8) + payload
    check(ownerPub.isValidSignature(B64U.decode(v["envelope.s"]!)!, for: signed), "verifies the app's envelope")
    let envelope = try InboxFetch.envelope(op: "inbox/sync", payload: payload, ownerSeed: ownerSeed)
    check(envelope["p"] == v["envelope.p"], "envelope p")
    check(
      ownerPub.isValidSignature(B64U.decode(envelope["s"]!)!, for: signed),
      "the extension's envelope verifies")
  }

  /// English strings, from the app's source of truth.
  static func lookup(_ english: [String: Any]) -> (String) -> String {
    { key in english[key] as? String ?? key }
  }

  /// `describeBuddyEvent` and `buddyAlertText` agree on every vector.
  static func vectors(_ vectors: [String: Any], english: [String: Any]) {
    let display = vectors["display"] as! [String: Any]
    let wording = AlertWording(
      string: lookup(english),
      language: display["language"] as! String,
      dayFirst: display["dayFirst"] as! Bool,
      clock24: display["clock24"] as! Bool)
    for item in vectors["cases"] as! [[String: Any]] {
      let name = item["name"] as! String
      var context = vectors["context"] as! [String: Any]
      for (key, value) in item["context"] as? [String: Any] ?? [:] { context[key] = value }
      let decoded = try! JSONDecoder().decode(
        AlertContext.self, from: JSONSerialization.data(withJSONObject: context))
      let event = item["event"] as! [String: Any]
      let outcome = describe(
        context: decoded,
        event: SealedEvent(
          eventId: event["eventId"] as! String,
          kind: event["kind"] as! String,
          blob: event["blob"] as! String,
          slotId: event["slotId"] as? String))
      let expected = item["outcome"] as! [String: Any]
      check(
        NSDictionary(dictionary: json(outcome)).isEqual(to: expected),
        "\(name): \(json(outcome)) ≠ \(expected)")
      guard case .alert(let alert) = outcome, let text = item["text"] as? [String: String] else {
        check(item["text"] == nil, "\(name): expected text")
        continue
      }
      let actual = wording.text(for: alert)
      check(
        actual == AlertText(title: text["title"]!, body: text["body"]),
        "\(name): \(actual) ≠ \(text)")
    }
  }

  /// Days and times in other conventions, and placeholders filled once.
  static func wording(_ english: [String: Any]) {
    let when = AlertWhen(d: "2026-10-10", s: 870)
    let german = AlertWording(string: lookup(english), language: "de-de", dayFirst: true, clock24: true)
    check(german.when(when) == "Sa., 10 Okt. · 14:30", "German day-first, 24-hour: \(german.when(when))")
    let british = AlertWording(string: lookup(english), language: "en-gb", dayFirst: true, clock24: true)
    check(british.when(when) == "Sat, 10 Oct · 14:30", "British: \(british.when(when))")
    let us = AlertWording(string: lookup(english), language: "en-us", dayFirst: false, clock24: false)
    check(us.when(AlertWhen(d: "2026-10-10", s: nil)) == "Sat, Oct 10", "no start time")
    check(us.when(AlertWhen(d: "2026-10-10", s: 0)) == "Sat, Oct 10 · 12:00 AM", "midnight")
    check(
      us.text(for: .paired(name: "{{name}} {{when}}")).title
        == "You and {{name}} {{when}} are buddies now",
      "a name is never filled in again")
  }

  /// An outcome in the shape `describeBuddyEvent` returns it.
  static func json(_ outcome: AlertOutcome) -> [String: Any] {
    func when(_ value: AlertWhen?) -> [String: Any] {
      guard let value else { return [:] }
      var out: [String: Any] = ["d": value.d]
      if let s = value.s { out["s"] = s }
      return ["when": out]
    }
    func badge(_ value: SharedBadge) -> [String: Any] {
      value.l.map { ["c": value.c, "l": $0] } ?? ["c": value.c]
    }
    switch outcome {
    case .quiet: return ["quiet": true]
    case .failed(let reason): return ["failed": reason]
    case .alert(let alert):
      var body: [String: Any]
      switch alert {
      case .claimed(let name): body = ["type": "claimed", "name": name]
      case .paired(let name): body = ["type": "paired", "name": name]
      case .share(let action, let shareType, let name, let w):
        body = ["type": "share", "action": action, "shareType": shareType, "name": name]
          .merging(when(w)) { a, _ in a }
      case .reply(let reply, let name, let shareType, let w):
        body = ["type": "reply", "reply": reply, "name": name].merging(when(w)) { a, _ in a }
        if let shareType { body["shareType"] = shareType }
      case .joinRequest(let name, let w):
        body = ["type": "joinRequest", "name": name].merging(when(w)) { a, _ in a }
      case .badge(let name, let badges):
        body = ["type": "badge", "name": name, "badges": badges.map(badge)]
      case .badgeReaction(let name, let reaction, let b):
        body = ["type": "badgeReaction", "name": name, "reaction": reaction, "badge": badge(b)]
      }
      return ["alert": body]
    }
  }
}
