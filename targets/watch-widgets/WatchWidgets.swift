import SwiftUI
import WidgetKit

@main
struct WitnessWorkWatchWidgets: WidgetBundle {
  var body: some Widget {
    ProgressComplication()
  }
}

struct ProgressEntry: TimelineEntry {
  let date: Date
  let snapshot: WatchSnapshot?

  /// The snapshot, or `nil` when there's none or its month has ended.
  var current: WatchSnapshot? {
    snapshot.flatMap { $0.isCurrent(at: date) ? $0 : nil }
  }
}

/// Reads what the watch app stored. The app reloads timelines when a new
/// snapshot arrives; a second entry at midnight moves "reported today" along
/// and retires last month's progress without the iPhone.
struct ProgressProvider: TimelineProvider {
  func placeholder(in context: Context) -> ProgressEntry {
    ProgressEntry(date: .now, snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (ProgressEntry) -> Void) {
    completion(ProgressEntry(date: .now, snapshot: WatchStorage.loadContext()?.snapshot))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<ProgressEntry>) -> Void) {
    let now = Date.now
    let snapshot = WatchStorage.loadContext()?.snapshot
    let midnight = Calendar.current.nextDate(
      after: now, matching: DateComponents(hour: 0, minute: 0), matchingPolicy: .nextTime
    ) ?? now.addingTimeInterval(24 * 60 * 60)
    completion(
      Timeline(
        entries: [
          ProgressEntry(date: now, snapshot: snapshot),
          ProgressEntry(date: midnight, snapshot: snapshot),
        ],
        policy: .after(midnight)))
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
    let snapshot = entry.current
    switch family {
    case .accessoryCircular: CircularView(snapshot: snapshot, date: entry.date)
    case .accessoryCorner: CornerView(snapshot: snapshot, date: entry.date)
    case .accessoryInline: InlineView(snapshot: snapshot, date: entry.date)
    default: RectangularView(snapshot: snapshot, date: entry.date)
    }
  }
}

/// Progress toward the goal, or `nil` for a role without an hours goal.
private func goalProgress(_ snapshot: WatchSnapshot) -> Double? {
  guard snapshot.showsTimeEntry, snapshot.goalHours > 0 else { return nil }
  return min(max(snapshot.progress, 0), 1)
}

private func reportIcon(_ snapshot: WatchSnapshot, _ date: Date) -> String {
  snapshot.publisherState(at: date) == "unreported" ? "circle.dashed" : "checkmark.circle.fill"
}

private struct CircularView: View {
  let snapshot: WatchSnapshot?
  let date: Date

  var body: some View {
    if let snapshot, let progress = goalProgress(snapshot) {
      Gauge(value: progress) {
        Image(systemName: "clock")
      } currentValueLabel: {
        Text(snapshot.monthCompact)
      }
      .gaugeStyle(.accessoryCircularCapacity)
      .widgetAccentable()
    } else {
      ZStack {
        AccessoryWidgetBackground()
        if let snapshot, snapshot.showsTimeEntry {
          Text(snapshot.monthCompact)
            .font(.headline)
            .minimumScaleFactor(0.6)
        } else if let snapshot {
          Image(systemName: reportIcon(snapshot, date))
            .font(.title2)
            .widgetAccentable()
        } else {
          Text(verbatim: "—")
        }
      }
    }
  }
}

private struct CornerView: View {
  let snapshot: WatchSnapshot?
  let date: Date

  var body: some View {
    if let snapshot, snapshot.showsTimeEntry {
      Text(snapshot.monthCompact)
        .font(.title3)
        .widgetCurvesContent()
        .widgetLabel {
          if let progress = goalProgress(snapshot) {
            Gauge(value: progress) {
              EmptyView()
            }
            .tint(.accentColor)
          }
        }
    } else if let snapshot {
      Image(systemName: reportIcon(snapshot, date))
        .font(.title2)
        .widgetAccentable()
        .widgetLabel(L10n.line("sharedTheGoodNews", snapshot))
    } else {
      Text(verbatim: "—")
    }
  }
}

private struct RectangularView: View {
  let snapshot: WatchSnapshot?
  let date: Date

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(L10n.t("month", snapshot))
        .font(.headline)
        .widgetAccentable()
      if let snapshot, snapshot.showsTimeEntry {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
          Text(snapshot.monthFormatted)
            .font(.title3.bold())
          if snapshot.goalHours > 0 {
            Text(verbatim: "/\(snapshot.goalHours)")
              .foregroundStyle(.secondary)
          }
        }
        .minimumScaleFactor(0.7)
        if let progress = goalProgress(snapshot) {
          ProgressView(value: progress)
            .tint(.accentColor)
        }
      } else if let snapshot {
        Label(L10n.line("sharedTheGoodNews", snapshot), systemImage: reportIcon(snapshot, date))
          .font(.footnote)
        if snapshot.publisherState(at: date) == "reportedToday" {
          Text(L10n.t("reportedToday", snapshot))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      } else {
        Text(verbatim: "—")
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct InlineView: View {
  let snapshot: WatchSnapshot?
  let date: Date

  var body: some View {
    if let snapshot, snapshot.showsTimeEntry {
      if snapshot.goalHours > 0 {
        Text(verbatim: "\(snapshot.monthCompact) / \(snapshot.goalHours)")
      } else {
        Text(snapshot.monthCompact)
      }
    } else if let snapshot {
      Label(L10n.line("sharedTheGoodNews", snapshot), systemImage: reportIcon(snapshot, date))
    } else {
      Text(verbatim: "—")
    }
  }
}
