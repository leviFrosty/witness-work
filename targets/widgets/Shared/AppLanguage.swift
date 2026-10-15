import SwiftUI

// Canonical here and copied into `targets/watch-widgets/Shared` and
// `targets/widgets/Shared` by `scripts/sync-widget-shared.mjs`.

/// The app's Language, for what the watch and the widgets lay out and write
/// themselves. Their text arrives translated from the phone's JavaScript, but
/// the system would lay it out and write numbers in the language of the device
/// or of this bundle, which can differ from the one chosen in the app (ADR
/// 0026). Both are `nil` in a snapshot from an app older than this; the
/// system's choice stands then.
struct AppLanguage: Equatable {
  /// The app lays out right to left: an RTL Language, or the dev Force Right
  /// to Left switch.
  let rtl: Bool?
  /// BCP 47 tag the app writes numbers in, e.g. `en-us`, or `ar-u-nu-arab` for
  /// Arabic-Indic digits.
  let numberLocale: String?

  var layoutDirection: LayoutDirection? {
    rtl.map { $0 ? .rightToLeft : .leftToRight }
  }

  /// `numberLocale` when its digits aren't Latin (`٠`–`٩`). Languages with
  /// Latin digits get `nil`, and keep numbers as the phone writes them
  /// (`12.5`, whatever their decimal separator).
  var digitsLocale: Locale? { digitsFormat?.locale }

  /// The Language's digits, or `nil` for Latin ones. Built once per
  /// `numberLocale`: the watch's TimelineView and every widget render ask.
  private var digitsFormat: DigitsFormat? {
    guard let numberLocale, !numberLocale.isEmpty else { return nil }
    return DigitsFormat.cached(numberLocale)
  }

  /// A count, e.g. a goal of `50` hours.
  func number(_ value: Int) -> String {
    guard let digits = digitsFormat else { return String(value) }
    return digits.whole.string(from: NSNumber(value: value)) ?? String(value)
  }

  /// One decimal place, none for a whole number: `5`, `12.5`.
  func decimal(_ value: Double) -> String {
    guard let digits = digitsFormat else {
      return value == value.rounded()
        ? String(Int(value))
        : String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), value)
    }
    return digits.tenths.string(from: NSNumber(value: value)) ?? String(value)
  }

  /// Rewrites a number the phone already wrote (`12.5`, `1:05`) in the
  /// Language's digits and decimal separator.
  func digits(_ text: String) -> String {
    guard let digits = digitsFormat, let zero = digits.zero else { return text }
    let separator = digits.separator
    let scalars = Array(text.unicodeScalars)
    func isDigit(_ index: Int) -> Bool {
      scalars.indices.contains(index) && ("0"..."9").contains(scalars[index])
    }
    var result = ""
    for (index, scalar) in scalars.enumerated() {
      if isDigit(index), let digit = Unicode.Scalar(zero.value + scalar.value - 48) {
        result.unicodeScalars.append(digit)
      } else if scalar == ".", isDigit(index - 1), isDigit(index + 1) {
        result += separator
      } else {
        result.unicodeScalars.append(scalar)
      }
    }
    return result
  }

}

/// A `numberLocale` with non-Latin digits and its formatters, kept per tag.
/// Formatters are only read after they're built, which NumberFormatter allows
/// from any thread.
private final class DigitsFormat: @unchecked Sendable {
  let locale: Locale
  let whole: NumberFormatter
  let tenths: NumberFormatter
  /// The Language's zero, e.g. `٠`.
  let zero: Unicode.Scalar?
  let separator: String

  private init?(_ numberLocale: String) {
    let locale = Locale(components: Locale.Components(identifier: numberLocale))
    guard locale.numberingSystem.identifier != "latn" else { return nil }
    self.locale = locale
    whole = Self.formatter(locale, fractionDigits: 0)
    tenths = Self.formatter(locale, fractionDigits: 1)
    zero = tenths.string(from: 0)?.unicodeScalars
      .first(where: { $0.properties.numericType != nil })
    separator = tenths.decimalSeparator ?? "."
  }

  private static let lock = NSLock()
  /// By `numberLocale`; `nil` for a tag with Latin digits.
  nonisolated(unsafe) private static var cache: [String: DigitsFormat?] = [:]

  static func cached(_ numberLocale: String) -> DigitsFormat? {
    lock.lock()
    defer { lock.unlock() }
    if let hit = cache[numberLocale] { return hit }
    let made = DigitsFormat(numberLocale)
    cache[numberLocale] = .some(made)
    return made
  }

  private static func formatter(_ locale: Locale, fractionDigits: Int) -> NumberFormatter {
    let formatter = NumberFormatter()
    formatter.locale = locale
    formatter.numberStyle = .decimal
    formatter.usesGroupingSeparator = false
    formatter.minimumFractionDigits = 0
    formatter.maximumFractionDigits = fractionDigits
    return formatter
  }
}

extension View {
  /// Lays the view out in the app's direction and, for a Language with its own
  /// digits, has SwiftUI write numbers (`Text("\(count)")`, timers) with them.
  func appLanguage(_ language: AppLanguage?) -> some View {
    modifier(AppLanguageModifier(language: language))
  }
}

extension View {
  /// Letter spacing for small caps-style labels, left out when laid out right
  /// to left: it pulls apart Arabic's joined letters.
  ///
  /// Keyed off the layout direction as a stand-in for JS's
  /// `isJoinedScriptLocale` (`src/lib/tracking.ts`), since snapshots carry
  /// `rtl` but not the script. That holds while Arabic is the only RTL
  /// Language. It drifts in two cases: the dev Force Right to Left switch drops
  /// the spacing for Latin text the app keeps spaced, and a future RTL Language
  /// that doesn't join (Hebrew) would lose it too. Add a `joined` flag to the
  /// snapshots before shipping such a Language.
  func leftToRightTracking(_ tracking: CGFloat) -> some View {
    modifier(LeftToRightTracking(tracking: tracking))
  }
}

private struct LeftToRightTracking: ViewModifier {
  let tracking: CGFloat
  @Environment(\.layoutDirection) private var direction

  func body(content: Content) -> some View {
    content.tracking(direction == .rightToLeft ? 0 : tracking)
  }
}

private struct AppLanguageModifier: ViewModifier {
  let language: AppLanguage?
  @Environment(\.layoutDirection) private var systemDirection
  @Environment(\.locale) private var systemLocale

  func body(content: Content) -> some View {
    content
      .environment(\.layoutDirection, language?.layoutDirection ?? systemDirection)
      .environment(\.locale, language?.digitsLocale ?? systemLocale)
  }
}
