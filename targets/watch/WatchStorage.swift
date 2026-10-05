import Foundation

// Canonical here and copied into `targets/watch-widgets/Shared` by
// `scripts/sync-widget-shared.mjs`, so the complications read what the app
// stores.

/// A request that changes data on the iPhone, kept until the iPhone app has
/// handled its entry.
struct OutboxItem: Codable, Identifiable {
  let request: WatchRequest
  let createdAt: Date
  /// The iPhone accepted it; it now only waits for the iPhone app to save it.
  var delivered: Bool

  var id: String { request.id }
}

/// The watch's copy of what the iPhone published, plus its outbox, in the
/// watch's own App Group container (shared with the complications, never with
/// the iPhone).
enum WatchStorage {
  private static let contextFile = "phone-context.json"
  private static let outboxFile = "outbox.json"

  private static var containerURL: URL? {
    guard let group = AppGroup.identifier else { return nil }
    return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
  }

  static func loadContext() -> PhoneContext? { read(contextFile) }

  /// Stores `context` unless a newer one is already stored. Returns whether it
  /// was stored.
  @discardableResult
  static func saveContextIfNewer(_ context: PhoneContext) -> Bool {
    if let stored = loadContext(), stored.sentAt > context.sentAt { return false }
    return write(context, to: contextFile)
  }

  static func loadOutbox() -> [OutboxItem] { read(outboxFile) ?? [] }

  static func saveOutbox(_ items: [OutboxItem]) {
    write(items, to: outboxFile)
  }

  private static func read<T: Decodable>(_ name: String) -> T? {
    guard let url = containerURL?.appendingPathComponent(name),
          let data = try? Data(contentsOf: url)
    else { return nil }
    return try? JSONDecoder().decode(T.self, from: data)
  }

  @discardableResult
  private static func write<T: Encodable>(_ value: T, to name: String) -> Bool {
    guard let url = containerURL?.appendingPathComponent(name),
          let data = try? JSONEncoder().encode(value)
    else { return false }
    return (try? data.write(to: url, options: .atomic)) != nil
  }
}

extension WatchSnapshot {
  /// `YYYY-MM` of `date` in the Gregorian calendar, matching the iPhone's key.
  static func monthKey(for date: Date) -> String {
    let parts = Calendar(identifier: .gregorian).dateComponents([.year, .month], from: date)
    return String(format: "%04d-%02d", parts.year ?? 0, parts.month ?? 0)
  }

  /// False once the month the progress describes has ended, until the iPhone
  /// sends a new snapshot.
  func isCurrent(at date: Date = .now) -> Bool {
    monthKey == Self.monthKey(for: date)
  }

  /// `reportedToday` becomes `reportedThisMonth` after the day the snapshot
  /// was built, so the watch stays right overnight without the iPhone.
  func publisherState(at date: Date = .now) -> String {
    guard publisherState == "reportedToday" else { return publisherState }
    let built = Date(timeIntervalSince1970: generatedAt / 1000)
    return Calendar.current.isDate(built, inSameDayAs: date)
      ? publisherState : "reportedThisMonth"
  }
}
