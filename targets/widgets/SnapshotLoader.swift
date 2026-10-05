import Foundation

/// Loads `snapshot.json` from the App Group container the JS side wrote to.
/// The App Group is derived from the bundle id (see `AppGroup`), so each build
/// variant resolves to its own container.
enum SnapshotLoader {
  static func load() -> WidgetSnapshot? {
    guard let group = AppGroup.identifier,
          let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: group
          ),
          let data = try? Data(contentsOf: container.appendingPathComponent("snapshot.json")),
          let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
          snapshot.version == SUPPORTED_VERSION
    else {
      return nil
    }
    return snapshot
  }
}
