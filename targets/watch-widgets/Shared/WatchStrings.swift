import Foundation

// Canonical here and copied into `targets/watch-widgets/Shared` by
// `scripts/sync-widget-shared.mjs`.

/// Display strings for the watch. The iPhone app sends its translations in the
/// language chosen in the app; before the first snapshot, and for text the
/// system shows (Siri, the face editor), the bundled catalog generated from
/// the same translations (`src/locales`) is used instead.
enum L10n {
  static func t(_ key: String, _ snapshot: WatchSnapshot?) -> String {
    if let value = snapshot?.strings[key], !value.isEmpty { return value }
    return Bundle.main.localizedString(forKey: key, value: nil, table: nil)
  }

  /// For one-line spots; some app strings contain line breaks.
  static func line(_ key: String, _ snapshot: WatchSnapshot?) -> String {
    t(key, snapshot).replacingOccurrences(of: "\n", with: " ")
  }
}
