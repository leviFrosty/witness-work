import SwiftUI
import WidgetKit

@main
struct WitnessWorkWatchWidgets: WidgetBundle {
  var body: some Widget {
    ProgressComplication()
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

struct ProgressComplicationView: View {
  @Environment(\.widgetFamily) private var family
  let entry: ProgressEntry

  var body: some View {
    let progress = entry.progress
    let snapshot = entry.snapshot
    switch family {
    case .accessoryCircular: CircularView(progress: progress)
    case .accessoryCorner: CornerView(progress: progress, snapshot: snapshot)
    case .accessoryInline: InlineView(progress: progress, snapshot: snapshot)
    default: RectangularView(progress: progress, snapshot: snapshot)
    }
  }
}

private func reportIcon(_ progress: MonthProgress) -> String {
  progress.publisherState == "unreported" ? "circle.dashed" : "checkmark.circle.fill"
}

private struct CircularView: View {
  let progress: MonthProgress?

  var body: some View {
    if let progress, progress.showsTimeEntry, let fraction = progress.fraction {
      Gauge(value: fraction) {
        Image(systemName: "clock")
      } currentValueLabel: {
        Text(progress.total)
      }
      .gaugeStyle(.accessoryCircularCapacity)
      .tint(.accentColor)
      .widgetAccentable()
    } else {
      ZStack {
        AccessoryWidgetBackground()
        if let progress, progress.showsTimeEntry {
          Text(progress.total)
            .font(.headline)
            .minimumScaleFactor(0.6)
        } else if let progress {
          Image(systemName: reportIcon(progress))
            .font(.title2)
            .widgetAccentable()
        } else {
          Text(verbatim: "—")
        }
      }
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
            .tint(.accentColor)
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
        PaceBar(fraction: fraction, paceFraction: progress.paceFraction)
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
