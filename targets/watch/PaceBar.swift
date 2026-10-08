import SwiftUI
import WidgetKit

// Canonical here and copied into `targets/watch-widgets/Shared` by
// `scripts/sync-widget-shared.mjs`.

/// Progress toward the monthly goal, with a mark where the user's Plans put
/// them by today. Fill left of the mark means behind, past it ahead. Never
/// turns red: it's seen all day, and behind is no reason for alarm.
struct PaceBar: View {
  let fraction: Double
  let paceFraction: Double?
  var height: CGFloat = 6
  /// Complications pass their own: `Color.accentColor` is white there.
  var tint: Color = .accentColor

  /// Tinted faces draw the fill and the mark in one color, keeping only
  /// opacity, so the bar is cut away beside the mark to keep it visible.
  private static let markWidth: CGFloat = 2
  private static let gap: CGFloat = 2

  var body: some View {
    GeometryReader { geometry in
      let width = geometry.size.width
      let markX = paceFraction.map {
        min(max(width * $0 - Self.markWidth / 2, 0), width - Self.markWidth)
      }
      ZStack(alignment: .leading) {
        ZStack(alignment: .leading) {
          Capsule()
            .fill(Color.primary.opacity(0.25))
          Capsule()
            .fill(tint)
            .frame(width: fraction > 0 ? max(width * fraction, height) : 0)
            .widgetAccentable()
        }
        .mask {
          if let markX {
            HStack(spacing: 0) {
              Rectangle().frame(width: max(markX - Self.gap, 0))
              Color.clear.frame(width: Self.markWidth + Self.gap * 2)
              Rectangle()
            }
          } else {
            Rectangle()
          }
        }
        if let markX {
          Capsule()
            .fill(Color.primary)
            .frame(width: Self.markWidth, height: height + 4)
            .offset(x: markX)
        }
      }
    }
    .frame(height: height)
    // The total and pace line say the same in words.
    .accessibilityHidden(true)
  }
}
