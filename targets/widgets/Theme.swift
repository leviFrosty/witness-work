import SwiftUI

// MARK: - Theme
//
// Mirrors the app's design tokens (`src/constants/theme.ts`) so widgets feel
// like a natural extension of the app rather than a foreign surface. Spacing
// is tighter than the app on purpose: widgets only have ~158pt of vertical
// real estate at small, so the app's 15/20pt scale would waste half the box.

enum WidgetSpacing {
  /// Icon ↔ adjacent text gap.
  static let xs: CGFloat = 2
  /// Internal row stack gap (e.g. name over subtitle).
  static let sm: CGFloat = 4
  /// Between adjacent rows in a list.
  static let md: CGFloat = 6
  /// Between section header and the first row.
  static let lg: CGFloat = 8
  /// Between major sections inside a single widget.
  static let xl: CGFloat = 12
}

enum WidgetRadius {
  static let sm: CGFloat = 6
  static let md: CGFloat = 10
  static let lg: CGFloat = 14
  static let pill: CGFloat = 100
}

/// App-matched colors. Hex values are copied from `src/constants/theme.ts`
/// (light variant). SwiftUI handles dark mode by leaning on system semantics
/// where possible — only the accent and staleness palette are pinned.
enum WidgetColor {
  /// Default brand green. Same as `theme.colors.accent` in the app. Supporters
  /// can override this at runtime via `snapshot.accentColor`; the resolved
  /// value rides through the view tree as `EnvironmentValues.widgetAccent`.
  static let brandAccent = Color(red: 0x08 / 255, green: 0xCC / 255, blue: 0x50 / 255)
  /// Warm warning, used by the in-app warn token (`#fac220`).
  static let warn = Color(red: 0xFA / 255, green: 0xC2 / 255, blue: 0x20 / 255)
  /// Hard error red used for overdue follow-ups and longerThanAMonthAgo.
  static let error = Color(red: 0xE3 / 255, green: 0x09 / 255, blue: 0x09 / 255)
}

extension WidgetSnapshot.ContactStaleness {
  /// Mirrors `useMarkerColors` — the `.recent` bucket tracks the effective
  /// accent (brand green by default, supporter override when set) so the
  /// widget's dot colors stay in sync with the rest of the widget's tint.
  func color(accent: Color) -> Color {
    switch self {
    case .never:  return .secondary
    case .recent: return accent
    case .week:   return WidgetColor.warn
    case .month:  return WidgetColor.error
    }
  }
}

// MARK: - Accent override
//
// Supporter-selected accent rides through the widget's view hierarchy via an
// environment key so individual views don't need to know whether an override
// is in play. The widget's root reads `snapshot.accentColor`, resolves it to
// a `Color` (falling back to `brandAccent` on missing / malformed hex), and
// sets `.environment(\.widgetAccent, …)` once. Leaves propagate via
// `@Environment(\.widgetAccent)`.

private struct WidgetAccentKey: EnvironmentKey {
  static let defaultValue: Color = WidgetColor.brandAccent
}

extension EnvironmentValues {
  var widgetAccent: Color {
    get { self[WidgetAccentKey.self] }
    set { self[WidgetAccentKey.self] = newValue }
  }
}

extension Color {
  /// Parses a `#RRGGBB` string. Returns `nil` on any malformed input so
  /// callers can fall back to the brand accent instead of rendering an
  /// arbitrary default. Alpha is fixed at 1 — translucent variants are
  /// derived at the call site via `.opacity(…)`.
  init?(widgetHex: String) {
    var s = widgetHex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let value = UInt32(s, radix: 16) else { return nil }
    let r = Double((value >> 16) & 0xFF) / 255
    let g = Double((value >> 8) & 0xFF) / 255
    let b = Double(value & 0xFF) / 255
    self = Color(red: r, green: g, blue: b)
  }
}

extension WidgetSnapshot {
  /// Resolves the effective accent color for this snapshot. Returns the brand
  /// green when no override is set or the hex is malformed.
  var resolvedAccent: Color {
    if let hex = accentColor, let color = Color(widgetHex: hex) {
      return color
    }
    return WidgetColor.brandAccent
  }
}
