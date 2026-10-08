import CryptoKit
import Foundation

// Named Buddies alerts: opens the sealed event a push carries and says what it
// means. Mirrors `describeBuddyEvent` in `src/features/buddies/lib/pushAlerts.ts`
// and passes the same vectors (`testing/alertVectors.json`, checked by
// `scripts/tests/buddies-alerts.swift`). Foundation and CryptoKit only, so the
// tests compile it on macOS.

// MARK: - Wire encoding and sealed blobs

/// Unpadded base64url, the only binary encoding on the Buddies wire.
enum B64U {
  static func decode(_ text: String) -> Data? {
    guard
      text.count % 4 != 1,
      text.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") })
    else { return nil }
    var base64 = text.replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
    return Data(base64Encoded: base64)
  }

  static func encode(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}

/// `b64u(0x01 ‖ nonce[12] ‖ ciphertext ‖ tag[16])`, ChaCha20-Poly1305 with a
/// UTF-8 AAD string (docs/buddies-protocol.md, "Sealed blobs").
enum SealedBlob {
  static func open(key: Data, blob: String, aad: String) -> Data? {
    guard
      key.count == 32,
      let bytes = B64U.decode(blob),
      bytes.count >= 1 + 12 + 16,
      bytes.first == 1,
      let box = try? ChaChaPoly.SealedBox(combined: Data(bytes.dropFirst()))
    else { return nil }
    return try? ChaChaPoly.open(box, using: SymmetricKey(data: key), authenticating: Data(aad.utf8))
  }

  static func seal(key: Data, plaintext: Data, aad: String, nonce: Data) throws -> String {
    let box = try ChaChaPoly.seal(
      plaintext,
      using: SymmetricKey(data: key),
      nonce: ChaChaPoly.Nonce(data: nonce),
      authenticating: Data(aad.utf8)
    )
    return B64U.encode(Data([1]) + box.combined)
  }
}

enum Aad {
  static func claim(_ inviteId: String) -> String { "ww-buddies/v1/invite-claim|\(inviteId)" }
  static func event(_ inboxId: String, _ slotId: String, _ eventId: String) -> String {
    "ww-buddies/v1/event|\(inboxId)|\(slotId)|\(eventId)"
  }
}

// MARK: - What the app hands over

/// A shared Plan or Follow-up's type, day, and start, as its sender wrote them.
struct ShareWhen: Decodable, Equatable {
  let t: String
  let d: String
  let s: Int?
}

/// `BuddyAlertContext` from the app, plus what only the extension needs: where
/// to fetch an event too big for the push, and how to write dates.
struct AlertContext: Decodable {
  struct Buddy: Decodable {
    let slot: String
    let key: String
    let name: String
    let joinMuted: Bool?
    let shares: [String: ShareWhen]?
  }

  struct Invite: Decodable {
    let id: String
    let key: String
  }

  struct Catalog: Decodable {
    let order: [String]
    let oneTime: [String]
  }

  struct Display: Decodable {
    /// The app's language (`en-us`), which may differ from the system's.
    let language: String
    let dayFirst: Bool
    let clock24: Bool
  }

  let v: Int
  let inboxId: String
  /// Signs `inbox/sync` to fetch an event too big for the push.
  let ownerSeed: String
  let buddies: [Buddy]
  let invites: [Invite]
  let myShares: [String: ShareWhen]
  let badgeAlerts: Bool
  let joinAlerts: Bool
  let catalog: Catalog
  let relay: String?
  let display: Display?
}

struct SealedEvent {
  let eventId: String
  let kind: String
  let blob: String
  /// Known when fetched; a push leaves it out, so every buddy's key is tried.
  let slotId: String?
}

// MARK: - What it means

struct AlertWhen: Equatable {
  let d: String
  let s: Int?
}

struct SharedBadge: Equatable {
  let c: String
  let l: Int?
}

/// What happened, by whom. `BuddiesAlertText.swift` words it.
enum Alert: Equatable {
  case claimed(name: String)
  case paired(name: String)
  case share(action: String, shareType: String, name: String, when: AlertWhen?)
  case reply(reply: String, name: String, shareType: String?, when: AlertWhen?)
  case joinRequest(name: String, when: AlertWhen)
  case badge(name: String, badges: [SharedBadge])
  case badgeReaction(name: String, reaction: String, badge: SharedBadge)
}

/// `alert`: word it. `quiet`: muted on this device (an alert can't be dropped
/// here, so it keeps the template). `failed`: keep the template.
enum AlertOutcome: Equatable {
  case alert(Alert)
  case quiet
  case failed(String)
}

// MARK: - Reading plaintext like the app's schemas

private let relayIdPattern = "^[A-Za-z0-9_-]{22}$"
private let keyPattern = "^[A-Za-z0-9_-]{43}$"
private let dayPattern = "^\\d{4}-\\d{2}-\\d{2}$"

private func matches(_ value: String, _ pattern: String) -> Bool {
  value.range(of: pattern, options: .regularExpression) != nil
}

/// A JSON number that isn't a boolean (JSONSerialization makes both NSNumber).
private func number(_ value: Any?) -> Double? {
  guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID() else {
    return nil
  }
  return value.doubleValue
}

private func integer(_ value: Any?, _ range: ClosedRange<Int>) -> Int? {
  guard let n = number(value), n == n.rounded(), let i = Int(exactly: n), range.contains(i)
  else { return nil }
  return i
}

/// An absent field is fine; a present one (null included) must be valid.
private func optional(_ value: Any?, _ valid: (Any) -> Bool) -> Bool {
  guard let value else { return true }
  return !(value is NSNull) && valid(value)
}

private func string(_ value: Any?, max: Int) -> String? {
  guard let value = value as? String, value.count <= max else { return nil }
  return value
}

/// The app's `displayName`: trimmed, 1–60 characters.
private func displayName(_ value: Any?) -> String? {
  guard let raw = value as? String else { return nil }
  let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
  return (1...60).contains(name.count) ? name : nil
}

private func isVersion1(_ body: [String: Any]) -> Bool {
  integer(body["v"], 1...1) == 1
}

private func relayId(_ value: Any?) -> String? {
  guard let value = value as? String, matches(value, relayIdPattern) else { return nil }
  return value
}

private func day(_ value: Any?) -> String? {
  guard let value = value as? String, matches(value, dayPattern) else { return nil }
  return value
}

private func startValid(_ value: Any?) -> Bool { optional(value) { integer($0, 0...1439) != nil } }
private func minutesValid(_ value: Any?) -> Bool { optional(value) { integer($0, 1...1440) != nil } }

private func pairingCardName(_ body: [String: Any]) -> String? {
  guard
    isVersion1(body),
    let name = displayName(body["name"]),
    let dhPub = body["dhPub"] as? String, matches(dhPub, keyPattern),
    relayId(body["inboxId"]) != nil,
    (body["offer"] as? [String: Any])?["plans"] as? String == "daysTimes"
  else { return nil }
  return name
}

/// `shareInviteSchema`'s `details`: the day and time it says, if valid.
private func shareDetails(_ value: Any?) -> AlertWhen? {
  guard
    let details = value as? [String: Any],
    let d = day(details["d"]),
    startValid(details["s"]),
    minutesValid(details["m"]),
    optional(details["title"], { string($0, max: 100) != nil }),
    optional(details["note"], { string($0, max: 2000) != nil }),
    optional(details["firstName"], { string($0, max: 40) != nil }),
    optional(details["topic"], { string($0, max: 80) != nil }),
    optional(details["location"], { $0 is [String: Any] })
  else { return nil }
  return AlertWhen(d: d, s: integer(details["s"], 0...1439))
}

/// `sharedBadgeSchema`: an art id and an optional level 1–4.
private func wireBadge(_ value: Any?) -> SharedBadge? {
  guard
    let badge = value as? [String: Any],
    let c = badge["c"] as? String, (1...40).contains(c.count),
    optional(badge["l"], { integer($0, 1...4) != nil })
  else { return nil }
  return SharedBadge(c: c, l: integer(badge["l"], 1...4))
}

/// The badges this build knows, each once, named in announcement order: higher
/// levels first, then the catalog's order (`sortedForAnnouncement(knownBadges())`).
func knownBadges(_ badges: [SharedBadge], catalog: AlertContext.Catalog) -> [SharedBadge] {
  var seen = Set<String>()
  var known: [SharedBadge] = []
  for badge in badges {
    let valid =
      badge.l == nil
      ? catalog.oneTime.contains(badge.c)
      : catalog.order.contains(badge.c) && !catalog.oneTime.contains(badge.c)
    let key = badge.l.map { "\(badge.c).\($0)" } ?? badge.c
    guard valid, !badge.c.contains("."), seen.insert(key).inserted else { continue }
    known.append(badge)
  }
  let index = { (c: String) in catalog.order.firstIndex(of: c) ?? Int.max }
  return known.sorted {
    ($0.l ?? 0) != ($1.l ?? 0) ? ($0.l ?? 0) > ($1.l ?? 0) : index($0.c) < index($1.c)
  }
}

private let reactionIds: Set<String> = ["party", "confetti", "fire", "clap", "thumbsUp", "raisedHands"]

// MARK: - Describing an event

private enum Handler {
  case paired, share, reply, joinRequest, quiet, badge, badgeReaction
}

private func handler(of kind: String) -> Handler? {
  if kind == "pair.confirmed" { return .paired }
  if kind == "share.reply" { return .reply }
  if matches(kind, "^(plan|followup)\\.(invite|update|cancel)$") { return .share }
  if matches(kind, "^join\\.request\\.[0-9a-f]{12}$") { return .joinRequest }
  // Withdrawals never alert.
  if kind == "join.cancel" { return .quiet }
  if kind == "badge.new" { return .badge }
  if kind == "badge.reaction" { return .badgeReaction }
  return nil
}

private func json(_ plaintext: Data) -> [String: Any]? {
  (try? JSONSerialization.jsonObject(with: plaintext)) as? [String: Any]
}

/// Opens `event` with the keys in `context` and says what it means for an alert.
func describe(context: AlertContext, event: SealedEvent) -> AlertOutcome {
  if event.kind == "invite.claimed" {
    // The claim's event id is the invite's id.
    guard
      let invite = context.invites.first(where: { $0.id == event.eventId }),
      let key = B64U.decode(invite.key),
      let plaintext = SealedBlob.open(key: key, blob: event.blob, aad: Aad.claim(invite.id))
    else { return .failed("unknownSender") }
    guard let card = json(plaintext), let name = pairingCardName(card) else {
      return .failed("unreadable")
    }
    return .alert(.claimed(name: name))
  }

  guard let handler = handler(of: event.kind) else { return .failed("unknownKind") }
  if handler == .quiet { return .quiet }

  // The sender is the buddy whose key opens it.
  var sender: (buddy: AlertContext.Buddy, plaintext: Data)?
  for buddy in context.buddies {
    if let slotId = event.slotId, buddy.slot != slotId { continue }
    guard let key = B64U.decode(buddy.key) else { continue }
    let aad = Aad.event(context.inboxId, buddy.slot, event.eventId)
    if let plaintext = SealedBlob.open(key: key, blob: event.blob, aad: aad) {
      sender = (buddy, plaintext)
      break
    }
  }
  guard let (buddy, plaintext) = sender else { return .failed("unknownSender") }
  guard let body = json(plaintext), isVersion1(body) else { return .failed("unreadable") }
  let name = buddy.name

  switch handler {
  case .paired:
    return displayName(body["name"]) != nil ? .alert(.paired(name: name)) : .failed("unreadable")

  case .share:
    let parts = event.kind.split(separator: ".").map(String.init)
    let shareType = parts[0] == "plan" ? "plan" : "followUp"
    let action = parts[1]
    guard let id = relayId(body["id"]), number(body["rev"]) != nil else {
      return .failed("unreadable")
    }
    if action == "cancel" {
      let when = buddy.shares?[id].map { AlertWhen(d: $0.d, s: $0.s) }
      return .alert(.share(action: action, shareType: shareType, name: name, when: when))
    }
    guard
      body["type"] as? String == shareType,
      number(body["expiresAt"]) != nil,
      let when = shareDetails(body["details"])
    else { return .failed("unreadable") }
    return .alert(.share(action: action, shareType: shareType, name: name, when: when))

  case .reply:
    guard
      let id = relayId(body["id"]),
      number(body["rev"]) != nil,
      let status = body["status"] as? String, status == "going" || status == "declined"
    else { return .failed("unreadable") }
    let mine = context.myShares[id]
    return .alert(
      .reply(
        reply: status,
        name: name,
        shareType: mine?.t,
        when: mine.map { AlertWhen(d: $0.d, s: $0.s) }
      ))

  case .joinRequest:
    guard
      relayId(body["id"]) != nil,
      number(body["rev"]) != nil,
      number(body["expiresAt"]) != nil,
      let d = day(body["d"]),
      startValid(body["s"]),
      minutesValid(body["m"])
    else { return .failed("unreadable") }
    if !context.joinAlerts || buddy.joinMuted == true { return .quiet }
    return .alert(.joinRequest(name: name, when: AlertWhen(d: d, s: integer(body["s"], 0...1439))))

  case .badge:
    guard let items = body["badges"] as? [Any], items.count <= 40 else {
      return .failed("unreadable")
    }
    if !context.badgeAlerts { return .quiet }
    // An item this build can't read is dropped on its own.
    let badges = knownBadges(items.compactMap(wireBadge), catalog: context.catalog)
    return .alert(.badge(name: name, badges: badges))

  case .badgeReaction:
    guard
      let badge = wireBadge(body["badge"]),
      let reaction = body["e"] as? String, reactionIds.contains(reaction),
      number(body["rev"]) != nil
    else { return .failed("unreadable") }
    if !context.badgeAlerts { return .quiet }
    guard let known = knownBadges([badge], catalog: context.catalog).first else {
      return .failed("unreadable")
    }
    return .alert(.badgeReaction(name: name, reaction: reaction, badge: known))

  case .quiet:
    return .quiet
  }
}
