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
  /// Folder in the App Group for the Pet widget's PNGs. `PetWidget.swift`
  /// reads it as `pet/<name>`.
  private static let petFolderName = "pet"
  /// The only file names `writeFile` accepts, so a name can't leave `pet/`.
  /// `PetWidget.swift` checks the same pattern before it reads one.
  private static let fileNamePattern = "^[a-z0-9-]+\\.png$"

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

    /// Writes base64-encoded bytes to `pet/<name>`, creating the folder.
    /// Atomic, so the widget never reads a half-written image.
    AsyncFunction("writeFile") { (name: String, base64: String) -> Void in
      guard WidgetBridgeModule.isValidFileName(name) else {
        throw WidgetBridgeError.invalidFileName(name)
      }
      guard let data = Data(base64Encoded: base64) else {
        throw WidgetBridgeError.invalidBase64
      }
      let folder = try self.petFolderURL(create: true)
      try data.write(to: folder.appendingPathComponent(name), options: .atomic)
    }

    /// Deletes every file in `pet/` that isn't named in `keep`.
    AsyncFunction("pruneFiles") { (keep: [String]) -> Void in
      let folder = try self.petFolderURL(create: false)
      let fm = FileManager.default
      guard fm.fileExists(atPath: folder.path) else { return }
      let kept = Set(keep)
      for name in try fm.contentsOfDirectory(atPath: folder.path) where !kept.contains(name) {
        try fm.removeItem(at: folder.appendingPathComponent(name))
      }
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

  private func containerURL() -> URL? {
    guard let group = appGroupIdentifier() else { return nil }
    return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
  }

  private func snapshotURL() -> URL? {
    containerURL()?.appendingPathComponent(WidgetBridgeModule.snapshotFileName)
  }

  private func petFolderURL(create: Bool) throws -> URL {
    guard let container = containerURL() else {
      throw WidgetBridgeError.appGroupUnavailable
    }
    let folder = container.appendingPathComponent(
      WidgetBridgeModule.petFolderName, isDirectory: true
    )
    if create {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }
    return folder
  }

  private static func isValidFileName(_ name: String) -> Bool {
    name.range(of: fileNamePattern, options: .regularExpression) != nil
  }
}

/// `LocalizedError`, so the promise rejects with the description rather than
/// "WidgetBridgeError error 0".
enum WidgetBridgeError: LocalizedError, CustomStringConvertible {
  case appGroupUnavailable
  case invalidPayload
  case invalidBase64
  case invalidFileName(String)

  var description: String {
    switch self {
    case .appGroupUnavailable:
      return "App Group container is not available. Verify entitlements + appleTeamId."
    case .invalidPayload:
      return "Snapshot payload could not be encoded as UTF-8."
    case .invalidBase64:
      return "File contents are not valid base64."
    case .invalidFileName(let name):
      return "\"\(name)\" isn't a widget file name (lowercase letters, digits and dashes, ending in .png)."
    }
  }

  var errorDescription: String? { description }
}
