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
  /// Brand green. Same as `theme.colors.accent` in the app.
  static let accent = Color(red: 0x08 / 255, green: 0xCC / 255, blue: 0x50 / 255)
  /// Translucent fill for accent backgrounds (e.g. Add Time button).
  static let accentTranslucent = accent.opacity(0.15)
  /// Warm warning, used by the in-app warn token (`#fac220`).
  static let warn = Color(red: 0xFA / 255, green: 0xC2 / 255, blue: 0x20 / 255)
  /// Hard error red used for overdue follow-ups and longerThanAMonthAgo.
  static let error = Color(red: 0xE3 / 255, green: 0x09 / 255, blue: 0x09 / 255)

  // Staleness dot palette — mirrors `useMarkerColors` defaults so the widget
  // renders the same colors a user sees on the contact map.
  enum Staleness {
    static let never = Color.secondary
    static let recent = WidgetColor.accent
    static let week = WidgetColor.warn
    static let month = WidgetColor.error
  }
}

extension WidgetSnapshot.ContactStaleness {
  var color: Color {
    switch self {
    case .never:  return WidgetColor.Staleness.never
    case .recent: return WidgetColor.Staleness.recent
    case .week:   return WidgetColor.Staleness.week
    case .month:  return WidgetColor.Staleness.month
    }
  }
}
