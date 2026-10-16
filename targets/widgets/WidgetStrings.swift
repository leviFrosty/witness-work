import Foundation

/// The widgets' bundled strings, from `Localizable.xcstrings`, which
/// `scripts/sync-widget-shared.mjs` generates from `src/locales` (keys listed
/// under `iosWidgetStrings` in `src/app/watch/watchStringKeys.json`).
///
/// They're for what the system shows outside a snapshot: each widget's name
/// and description in the widget gallery, in the device's language, and a
/// label before the app's first snapshot. Everything else arrives with the
/// snapshot, translated into the language chosen in the app.
enum L10n {
  static func t(_ key: String) -> String {
    Bundle.main.localizedString(forKey: key, value: nil, table: nil)
  }
}
