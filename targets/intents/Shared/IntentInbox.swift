import Foundation
#if canImport(StopwatchBridge)
import StopwatchBridge  // AppGroup; the extension compiles its own copy.
#endif

// Canonical here and copied into `targets/intents/Shared` by
// `scripts/sync-widget-shared.mjs`.

/// How Siri on the iPhone hands work to the app.
///
/// App Intents run in their own process (`targets/intents`), which can't save
/// Time Entries or Trips: they live in the app's JavaScript stores. The
/// extension adds drafts here, in the App Group container, and
/// `WatchSessionCoordinator` moves them into its inbox so they're saved like
/// entries from the watch. The app leaves its latest `WatchSnapshot` here for
/// the extension to read.
public enum IntentInbox {
  public struct Event: Codable, Sendable {
    public let name: String
    public let properties: [String: String]

    public init(name: String, properties: [String: String]) {
      self.name = name
      self.properties = properties
    }
  }

  public struct Contents: Codable, Sendable {
    public var entries: [WatchEntryDraft] = []
    public var trips: [WatchTripDraft] = []
    /// Analytics events for the app to capture.
    public var events: [Event] = []

    public var isEmpty: Bool { entries.isEmpty && trips.isEmpty && events.isEmpty }

    public init() {}

    public init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      entries = try container.decodeIfPresent([WatchEntryDraft].self, forKey: .entries) ?? []
      trips = try container.decodeIfPresent([WatchTripDraft].self, forKey: .trips) ?? []
      events = try container.decodeIfPresent([Event].self, forKey: .events) ?? []
    }
  }

  /// Posted across processes after the extension adds something, so a running
  /// app takes it at once. Includes the App Group so app variants don't hear
  /// each other.
  public static var didChangeNotificationName: String? {
    AppGroup.identifier.map { "\($0).intentInbox.didChange" }
  }

  private static let inboxFile = "intent-inbox.json"
  private static let snapshotFile = "intent-snapshot.json"
  /// Caps each list, in case the app isn't opened for a long time.
  private static let maxItems = 200

  private static func url(_ name: String) -> URL? {
    guard let group = AppGroup.identifier else { return nil }
    return FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: group)?
      .appendingPathComponent(name)
  }

  // MARK: Snapshot

  @discardableResult
  public static func saveSnapshot(_ snapshot: WatchSnapshot) -> Bool {
    guard let url = url(snapshotFile), let data = try? JSONEncoder().encode(snapshot)
    else { return false }
    return (try? data.write(to: url, options: .atomic)) != nil
  }

  public static func loadSnapshot() -> WatchSnapshot? {
    guard let url = url(snapshotFile), let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(WatchSnapshot.self, from: data)
  }

  // MARK: Inbox

  /// Adds to the inbox and tells the app. Returns whether it was stored.
  @discardableResult
  public static func add(_ change: (inout Contents) -> Void) -> Bool {
    guard let url = url(inboxFile) else { return false }
    var stored = false
    coordinate(url) { url in
      // Unreadable (e.g. before the first unlock): don't replace what's there.
      guard var contents = read(url) else { return }
      change(&contents)
      contents.entries = Array(contents.entries.suffix(maxItems))
      contents.trips = Array(contents.trips.suffix(maxItems))
      contents.events = Array(contents.events.suffix(maxItems))
      stored = write(contents, to: url)
    }
    if stored, let name = didChangeNotificationName {
      CFNotificationCenterPostNotification(
        CFNotificationCenterGetDarwinNotifyCenter(), CFNotificationName(name as CFString),
        nil, nil, true)
    }
    return stored
  }

  /// Hands the inbox to `store`, and empties it once `store` returns true
  /// (it kept everything). Nothing can be added in between.
  public static func drain(_ store: (Contents) -> Bool) {
    guard let url = url(inboxFile) else { return }
    coordinate(url) { url in
      guard let contents = read(url), !contents.isEmpty, store(contents) else { return }
      write(Contents(), to: url)
    }
  }

  /// Serializes access across the app and the extension.
  private static func coordinate(_ url: URL, _ body: (URL) -> Void) {
    var error: NSError?
    NSFileCoordinator().coordinate(
      writingItemAt: url, options: .forMerging, error: &error, byAccessor: body)
  }

  /// Empty when there's no file yet; `nil` when it can't be read.
  private static func read(_ url: URL) -> Contents? {
    guard FileManager.default.fileExists(atPath: url.path) else { return Contents() }
    guard let data = try? Data(contentsOf: url) else { return nil }
    return (try? JSONDecoder().decode(Contents.self, from: data)) ?? Contents()
  }

  @discardableResult
  private static func write(_ contents: Contents, to url: URL) -> Bool {
    guard let data = try? JSONEncoder().encode(contents) else { return false }
    return (try? data.write(
      to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])) != nil
  }
}
