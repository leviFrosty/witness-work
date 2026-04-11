import ExpoModulesCore
import WidgetKit
import Foundation

/// Bridges JS-side widget snapshots into the App Group container shared with
/// the iOS widget extension and triggers WidgetKit timeline reloads.
///
/// The App Group identifier is derived from the host app's bundle identifier so
/// the dev variant (`com.leviwilkerson.jwtimedev`) and prod variant
/// (`com.leviwilkerson.jwtime`) automatically point at distinct containers
/// (`group.<bundleId>`).
public class WidgetBridgeModule: Module {
  private static let snapshotFileName = "snapshot.json"

  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    Function("writeSnapshot") { (json: String) -> Void in
      guard let url = self.snapshotURL() else {
        throw WidgetBridgeError.appGroupUnavailable
      }
      guard let data = json.data(using: .utf8) else {
        throw WidgetBridgeError.invalidPayload
      }
      try data.write(to: url, options: .atomic)
    }

    Function("reloadAllTimelines") { () -> Void in
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    Function("getAppGroupIdentifier") { () -> String? in
      return self.appGroupIdentifier()
    }
  }

  // MARK: - Helpers

  private func appGroupIdentifier() -> String? {
    guard let bundleId = Bundle.main.bundleIdentifier else { return nil }
    return "group.\(bundleId)"
  }

  private func snapshotURL() -> URL? {
    guard let group = appGroupIdentifier() else { return nil }
    let fm = FileManager.default
    guard let container = fm.containerURL(forSecurityApplicationGroupIdentifier: group) else {
      return nil
    }
    return container.appendingPathComponent(WidgetBridgeModule.snapshotFileName)
  }
}

enum WidgetBridgeError: Error, CustomStringConvertible {
  case appGroupUnavailable
  case invalidPayload

  var description: String {
    switch self {
    case .appGroupUnavailable:
      return "App Group container is not available. Verify entitlements + appleTeamId."
    case .invalidPayload:
      return "Snapshot payload could not be encoded as UTF-8."
    }
  }
}
