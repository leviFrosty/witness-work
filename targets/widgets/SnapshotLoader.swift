import Foundation

/// Loads `snapshot.json` from the App Group container the JS side wrote to.
///
/// The App Group identifier is **not** hardcoded — it's derived from the
/// widget extension's bundle id by stripping the last `.<widget>` segment and
/// prefixing `group.`. This mirrors the logic in `WidgetBridgeModule.swift`
/// so the dev variant (`com.leviwilkerson.jwtimedev`) and prod variant
/// (`com.leviwilkerson.jwtime`) auto-resolve to their own containers.
enum SnapshotLoader {
  static var appGroupIdentifier: String? {
    guard let widgetBundle = Bundle.main.bundleIdentifier else { return nil }
    let host: String
    if let dot = widgetBundle.lastIndex(of: ".") {
      host = String(widgetBundle[..<dot])
    } else {
      host = widgetBundle
    }
    return "group.\(host)"
  }

  static func load() -> WidgetSnapshot? {
    guard let group = appGroupIdentifier,
          let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: group
          )
    else { return nil }

    let url = container.appendingPathComponent("snapshot.json")
    guard let data = try? Data(contentsOf: url),
          let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
          snapshot.version == SUPPORTED_VERSION
    else { return nil }
    return snapshot
  }
}
