import Foundation

/// The App Group shared by the host app and every target built alongside it:
/// `group.<host bundle id>`.
///
/// Canonical here and copied into each target by `scripts/sync-widget-shared.mjs`
/// so every process derives the same identifier. Target bundle ids are the host
/// id plus a fixed suffix (see each `targets/*/expo-target.config.js`):
///
/// - host app        `com.x.y`
/// - iOS widgets     `com.x.y.widget`
/// - watch app       `com.x.y.watchkitapp`
/// - watch widgets   `com.x.y.watchkitapp.widgets`
///
/// The dev / beta / prod variants differ in the host id, so each resolves to
/// its own container. On the watch, the same identifier names a separate
/// watch-local container; App Groups never sync between devices.
public enum AppGroup {
  /// Longest first, so a nested suffix is stripped whole.
  static let targetSuffixes = [".watchkitapp.widgets", ".watchkitapp", ".widget"]

  public static func hostBundleIdentifier(for bundleId: String) -> String {
    for suffix in targetSuffixes where bundleId.hasSuffix(suffix) {
      return String(bundleId.dropLast(suffix.count))
    }
    return bundleId
  }

  public static var identifier: String? {
    guard let bundleId = Bundle.main.bundleIdentifier else { return nil }
    return "group.\(hostBundleIdentifier(for: bundleId))"
  }
}
