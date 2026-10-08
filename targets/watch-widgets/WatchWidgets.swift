import SwiftUI
import WidgetKit

@main
struct WitnessWorkWatchWidgets: WidgetBundle {
  var body: some Widget {
    ProgressComplication()
    ProgressRangeComplication()
    ProgressSymbolComplication()
    UpNextComplication()
  }
}

struct ProgressEntry: TimelineEntry {
  let date: Date
  /// For strings.
  let snapshot: WatchSnapshot?
  /// `nil` before the first snapshot, or once its month and the next have
  /// ended.
  let progress: MonthProgress?
}

/// Reads what the watch app stored, including time added on the watch that the
/// iPhone hasn't saved yet. The app reloads timelines when either changes; a
/// second entry at midnight moves "reported today" and the pace along, and
/// starts the next month, without the iPhone.
struct ProgressProvider: TimelineProvider {
  func placeholder(in context: Context) -> ProgressEntry {
    ProgressEntry(date: .now, snapshot: nil, progress: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (ProgressEntry) -> Void) {
    completion(entry(at: .now))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<ProgressEntry>) -> Void) {
    let now = Date.now
    let midnight = Calendar.current.nextDate(
      after: now, matching: DateComponents(hour: 0, minute: 0), matchingPolicy: .nextTime
    ) ?? now.addingTimeInterval(24 * 60 * 60)
    completion(Timeline(entries: [entry(at: now), entry(at: midnight)], policy: .after(midnight)))
  }

  private func entry(at date: Date) -> ProgressEntry {
    guard let context = WatchStorage.loadContext(), let snapshot = context.snapshot else {
      return ProgressEntry(date: date, snapshot: nil, progress: nil)
    }
    return ProgressEntry(
      date: date,
      snapshot: snapshot,
      progress: MonthProgress(
        snapshot: snapshot, outbox: WatchStorage.loadOutbox(),
        resolvedEntryIds: context.resolvedEntryIds, at: date))
  }
}

struct ProgressComplication: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "WitnessWorkProgress", provider: ProgressProvider()) { entry in
      ProgressComplicationView(entry: entry)
        .containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName(L10n.t("watchComplicationName", nil))
    .description(L10n.t("watchComplicationDescription", nil))
    .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline])
  }
}

/// The same progress in the circular slot only, drawn like another of Apple's
/// circular complications (see `CircularStyle`).
struct ProgressRangeComplication: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "WitnessWorkProgressRange", provider: ProgressProvider()) { entry in
      CircularView(progress: entry.progress, snapshot: entry.snapshot, style: .range)
        .containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName(L10n.t("watchComplicationName", nil))
    .description(L10n.t("watchRangeComplicationDescription", nil))
    .supportedFamilies([.accessoryCircular])
  }
}

struct ProgressSymbolComplication: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "WitnessWorkProgressSymbol", provider: ProgressProvider()) { entry in
      CircularView(progress: entry.progress, snapshot: entry.snapshot, style: .symbol)
        .containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName(L10n.t("watchComplicationName", nil))
    .description(L10n.t("watchSymbolComplicationDescription", nil))
    .supportedFamilies([.accessoryCircular])
  }
}

struct ProgressComplicationView: View {
  @Environment(\.widgetFamily) private var family
  let entry: ProgressEntry

  var body: some View {
    let progress = entry.progress
    let snapshot = entry.snapshot
    switch family {
    case .accessoryCircular: CircularView(progress: progress, snapshot: snapshot)
    case .accessoryCorner: CornerView(progress: progress, snapshot: snapshot)
    case .accessoryInline: InlineView(progress: progress, snapshot: snapshot)
    default: RectangularView(progress: progress, snapshot: snapshot)
    }
  }
}

private func reportIcon(_ progress: MonthProgress) -> String {
  progress.publisherState == "unreported" ? "circle.dashed" : "checkmark.circle.fill"
}

/// The app's green. `Color.accentColor` is white in a watch complication, so
/// rings tinted with it came out white on gray where Apple's are colored.
let complicationTint = Color("$accent")

/// The circular complications are Apple's own gauge styles with unstyled
/// labels, so the ring, the number and their sizes match Apple's on every face
/// and watch size. Each mirrors one of Apple's:
///
/// - `ProgressComplication`: Battery's closed ring, the number in the middle.
/// - `ProgressRangeComplication`: Weather's temperature gauge, an open ring
///   with the low and high at its ends; here 0 and the goal.
/// - `ProgressSymbolComplication`: the open ring with a symbol in its gap, as
///   in UV Index or Noise.
///
/// Without a goal there's nothing to fill, so all three stack a caption over
/// the number like Calendar's Today's Date.
private enum CircularStyle {
  case ring, range, symbol
}

private struct CircularView: View {
  let progress: MonthProgress?
  let snapshot: WatchSnapshot?
  var style: CircularStyle = .ring

  var body: some View {
    if let progress, progress.showsTimeEntry, let fraction = progress.fraction {
      gauge(progress, fraction: fraction)
        .tint(complicationTint)
        .widgetAccentable()
        .accessibilityValue(
          progress.goalHours > 0
            ? "\(progress.formatted) / \(progress.goalHours)" : progress.formatted)
    } else {
      ZStack {
        AccessoryWidgetBackground()
        CircularScaled { scale in
          if let progress, progress.showsTimeEntry {
            // Calendar's type and spacing, measured on its complication.
            VStack(spacing: -4 * scale) {
              Text(L10n.line("hours", snapshot))
                .font(.system(size: 12 * scale, weight: .medium, design: .rounded))
                .textCase(.uppercase)
                .foregroundStyle(complicationTint)
                .widgetAccentable()
              Text(progress.hours)
                .font(.system(size: 24 * scale, weight: .medium, design: .rounded))
            }
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .padding(.horizontal, 6 * scale)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(L10n.line("hours", snapshot))
            .accessibilityValue(progress.formatted)
          } else if let progress {
            // As large as the glyph of Apple's app complications, like Messages.
            Image(systemName: reportIcon(progress))
              .font(.system(size: 32 * scale, weight: .medium))
              .foregroundStyle(complicationTint)
              .widgetAccentable()
          } else {
            Text(verbatim: "—")
          }
        }
      }
    }
  }

  @ViewBuilder
  private func gauge(_ progress: MonthProgress, fraction: Double) -> some View {
    switch style {
    case .ring:
      Gauge(value: fraction) {
        EmptyView()
      } currentValueLabel: {
        Text(progress.hours)
      }
      .gaugeStyle(.accessoryCircularCapacity)
    case .range:
      Gauge(value: fraction) {
        EmptyView()
      } currentValueLabel: {
        Text(progress.hours)
      } minimumValueLabel: {
        Text(verbatim: "0")
      } maximumValueLabel: {
        Text(verbatim: "\(progress.goalHours)")
      }
      .gaugeStyle(.accessoryCircular)
    case .symbol:
      Gauge(value: fraction) {
        Image(systemName: "clock.fill")
      } currentValueLabel: {
        Text(progress.hours)
      }
      .gaugeStyle(.accessoryCircular)
    }
  }
}

/// Apple's circular complications size their type to the slot: Calendar's
/// Today's Date is 12 and 24 points in the 51-point slot of a 46mm watch and
/// smaller in a 42mm watch's 47. `content` gets the slot's scale against 51.
struct CircularScaled<Content: View>: View {
  @ViewBuilder let content: (CGFloat) -> Content

  var body: some View {
    GeometryReader { proxy in
      content(min(proxy.size.width, proxy.size.height) / 51)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}

/// A corner's curved label fits about a dozen characters, so a Kingdom
/// Publisher gets the month there and the status as the icon.
private struct CornerView: View {
  let progress: MonthProgress?
  let snapshot: WatchSnapshot?

  var body: some View {
    if let progress, progress.showsTimeEntry {
      Text(progress.total)
        .font(.title3)
        .widgetCurvesContent()
        .widgetLabel {
          if let fraction = progress.fraction {
            Gauge(value: fraction) {
              EmptyView()
            }
            .tint(complicationTint)
          }
        }
    } else if let progress {
      Image(systemName: reportIcon(progress))
        .font(.title2)
        .widgetAccentable()
        .accessibilityLabel(L10n.line("sharedTheGoodNews", snapshot))
        .widgetLabel(progress.monthName)
    } else {
      Text(verbatim: "—")
    }
  }
}

/// Fills whatever room the slot has: the month on its own line where there's
/// room, the pace line under a smaller total in mid-size slots (a 42mm Modular
/// Duo), and in the smallest (Modular, two lines tall) a large total and the
/// bar, whose mark shows the pace.
private struct RectangularView: View {
  let progress: MonthProgress?
  let snapshot: WatchSnapshot?

  var body: some View {
    Group {
      if let progress, progress.showsTimeEntry {
        ViewThatFits(in: .vertical) {
          hours(progress, monthOnOwnLine: true, showsFooter: true)
          hours(progress, monthOnOwnLine: false, showsFooter: true)
          hours(progress, monthOnOwnLine: false, showsFooter: false)
        }
      } else if let progress {
        // The label keeps its two lines; a small slot drops the month rather
        // than cut it short.
        ViewThatFits(in: .vertical) {
          report(progress, showsMonth: true, showsToday: true)
          report(progress, showsMonth: true, showsToday: false)
          report(progress, showsMonth: false, showsToday: false)
        }
      } else {
        Text(verbatim: "—")
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func report(_ progress: MonthProgress, showsMonth: Bool, showsToday: Bool) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      if showsMonth {
        Text(progress.monthName)
          .font(.headline)
          .widgetAccentable()
      }
      Label(L10n.t("sharedTheGoodNews", snapshot), systemImage: reportIcon(progress))
        .font(.footnote)
      if showsToday, progress.publisherState == "reportedToday" {
        Text(L10n.t("reportedToday", snapshot))
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
    }
    .accessibilityElement(children: .combine)
  }

  private func hours(
    _ progress: MonthProgress, monthOnOwnLine: Bool, showsFooter: Bool
  ) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      if monthOnOwnLine {
        Text(progress.monthName)
          .font(.headline)
          .widgetAccentable()
      }
      HStack(alignment: .firstTextBaseline, spacing: 2) {
        // Large on its own; smaller when the pace line needs the room.
        Text(progress.total)
          .font(monthOnOwnLine || showsFooter ? .headline : .title3.bold())
        if progress.goalHours > 0 {
          Text(verbatim: "/\(progress.goalHours)")
            .foregroundStyle(.secondary)
        }
        if !monthOnOwnLine {
          Spacer(minLength: 4)
          Text(progress.monthName)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .widgetAccentable()
        }
      }
      .lineLimit(1)
      .minimumScaleFactor(0.7)
      if let fraction = progress.fraction {
        PaceBar(fraction: fraction, paceFraction: progress.paceFraction, tint: complicationTint)
          .padding(.vertical, 1)
      }
      if showsFooter {
        if progress.goalReached {
          Label(L10n.t("goalReached", snapshot), systemImage: "checkmark.circle.fill")
            .font(.footnote)
            .lineLimit(1)
        } else if let pace = progress.paceText {
          Text(pace)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
      }
    }
    .accessibilityElement(children: .combine)
  }
}

private struct InlineView: View {
  let progress: MonthProgress?
  let snapshot: WatchSnapshot?

  var body: some View {
    if let progress, progress.showsTimeEntry {
      if progress.goalHours > 0 {
        Text(verbatim: "\(progress.total) / \(progress.goalHours)")
      } else {
        Text(progress.total)
      }
    } else if let progress {
      Label(L10n.line("sharedTheGoodNews", snapshot), systemImage: reportIcon(progress))
    } else {
      Text(verbatim: "—")
    }
  }
}
