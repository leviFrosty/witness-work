import Foundation
import Security
import UserNotifications

/// Names Buddies alerts. The relay sends each device its own generic template
/// ("A buddy invited you to a Plan"), because it must never see a name; the
/// push also carries the event it's about, still sealed (or its `seq`, when the
/// event didn't fit). This extension opens it with the keys the app keeps in a
/// shared Keychain item and rewrites the alert: "Anna invited you to a Plan",
/// "Sat, Oct 10 · 10:00 AM". Anything else, or anything that goes wrong, keeps
/// the alert exactly as it arrived.
final class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var original: UNNotificationContent?
  private var work: Task<Void, Never>?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    guard let marker = PushMarker(userInfo: request.content.userInfo) else {
      contentHandler(request.content)
      return
    }
    lock.withLock {
      self.contentHandler = contentHandler
      self.original = request.content
    }
    work = Task {
      let (content, outcome) = await NamedAlert.content(for: request.content, marker: marker)
      self.deliver(content, outcome: outcome)
    }
  }

  override func serviceExtensionTimeWillExpire() {
    work?.cancel()
    if let original = lock.withLock({ self.original }) {
      deliver(original, outcome: "fallback.timeout")
    }
  }

  /// Hands over the alert once. The outcome is counted first: iOS may end the
  /// extension as soon as it has the alert.
  private func deliver(_ content: UNNotificationContent, outcome: String) {
    guard let handler = lock.withLock({ () -> ((UNNotificationContent) -> Void)? in
      defer { contentHandler = nil }
      return contentHandler
    }) else { return }
    AlertOutcomes.record(outcome)
    handler(content)
  }
}

/// The push's `ww` marker (docs/buddies-protocol.md, "APNs (iOS)").
struct PushMarker {
  let kind: String
  let seq: Int?
  let eventId: String?
  let blob: String?

  init?(userInfo: [AnyHashable: Any]) {
    guard let ww = userInfo["ww"] as? [String: Any], let kind = ww["kind"] as? String else {
      return nil
    }
    self.kind = kind
    seq = (ww["seq"] as? NSNumber)?.intValue
    eventId = ww["eventId"] as? String
    blob = ww["blob"] as? String
  }
}

enum NamedAlert {
  /// The alert to show, and how it turned out (`AlertOutcomes`).
  static func content(
    for original: UNNotificationContent,
    marker: PushMarker
  ) async -> (UNNotificationContent, String) {
    guard let context = AlertContextStore.load() else { return (original, "fallback.noContext") }
    var event: SealedEvent?
    if let eventId = marker.eventId, let blob = marker.blob {
      event = SealedEvent(eventId: eventId, kind: marker.kind, blob: blob, slotId: nil)
    } else if let seq = marker.seq, seq > 0 {
      do {
        event = try await InboxFetch.event(seq: seq, context: context)
      } catch {
        return (original, "fallback.fetch")
      }
    }
    guard let event else { return (original, "fallback.noEvent") }
    switch describe(context: context, event: event) {
    case .quiet:
      // Muted here; an extension without the filtering entitlement can't drop
      // an alert, so it keeps the template.
      return (original, "quiet")
    case .failed(let reason):
      return (original, "fallback.\(reason)")
    case .alert(let alert):
      guard let display = context.display,
        let content = original.mutableCopy() as? UNMutableNotificationContent
      else { return (original, "fallback.noContext") }
      let text = AlertWording(
        string: Localized.strings(language: display.language),
        language: display.language,
        dayFirst: display.dayFirst,
        clock24: display.clock24
      ).text(for: alert)
      content.title = text.title
      content.body = text.body ?? ""
      return (content, "named")
    }
  }
}

/// The app's snapshot, from the Keychain item it shares with this extension
/// (`setAlertContext` in `modules/buddies-keychain`).
enum AlertContextStore {
  static func load() -> AlertContext? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "com.leviwilkerson.witnesswork.buddies.alerts",
      kSecAttrAccount as String: "context",
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else { return nil }
    return try? JSONDecoder().decode(AlertContext.self, from: data)
  }
}

/// Strings generated from `src/locales` (`Localizable.xcstrings`), in the app's
/// language rather than the system's, which can differ.
enum Localized {
  static func strings(language: String) -> (String) -> String {
    let bundle = Bundle.main
    let match = Bundle.preferredLocalizations(
      from: bundle.localizations,
      forPreferences: [Locale.identifier(.bcp47, from: language)]
    ).first
    let localized =
      match.flatMap { bundle.path(forResource: $0, ofType: "lproj") }.flatMap(Bundle.init(path:))
      ?? bundle
    return { key in localized.localizedString(forKey: key, value: nil, table: nil) }
  }
}

/// How alerts turned out, counted in the App Group until the app reports them
/// (`reportAlertOutcomes` in `src/app/buddies/buddiesAlertOutcomes.ts`).
/// Counts only: no kinds, names, or ids.
enum AlertOutcomes {
  static let key = "buddiesAlertOutcomes"

  /// The app's group, `group.<app bundle id>`; this extension's id adds
  /// `.notifications` (expo-target.config.js).
  static var appGroup: String? {
    guard let bundleId = Bundle.main.bundleIdentifier else { return nil }
    let suffix = ".notifications"
    return "group.\(bundleId.hasSuffix(suffix) ? String(bundleId.dropLast(suffix.count)) : bundleId)"
  }

  static func record(_ outcome: String) {
    guard let appGroup, let defaults = UserDefaults(suiteName: appGroup) else { return }
    var counts = defaults.dictionary(forKey: key) as? [String: Int] ?? [:]
    counts[outcome, default: 0] += 1
    defaults.set(counts, forKey: key)
  }
}
