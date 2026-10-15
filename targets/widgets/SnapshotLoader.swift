import Foundation

/// Loads `snapshot.json` from the App Group container the JS side wrote to.
/// The App Group is derived from the bundle id (see `AppGroup`), so each build
/// variant resolves to its own container.
enum SnapshotLoader {
  static func load() -> WidgetSnapshot? {
    load(WidgetSnapshot.self, version: \.version)
  }

  /// Decodes `snapshot.json` as `type`, which can be a slice of
  /// `WidgetSnapshot` for a caller that reads only a few fields.
  static func load<Snapshot: Decodable>(
    _ type: Snapshot.Type, version: KeyPath<Snapshot, Int>
  ) -> Snapshot? {
    guard let group = AppGroup.identifier,
          let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: group
          ),
          let data = try? Data(contentsOf: container.appendingPathComponent("snapshot.json")),
          let snapshot = try? JSONDecoder().decode(type, from: data),
          snapshot[keyPath: version] == SUPPORTED_VERSION
    else {
      return nil
    }
    return snapshot
  }
}
