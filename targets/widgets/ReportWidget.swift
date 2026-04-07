import SwiftUI
import WidgetKit

// MARK: - Timeline

private struct ReportEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

private struct ReportProvider: TimelineProvider {
  func placeholder(in context: Context) -> ReportEntry {
    ReportEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (ReportEntry) -> Void) {
    completion(ReportEntry(date: Date(), snapshot: SnapshotLoader.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<ReportEntry>) -> Void) {
    let entry = ReportEntry(date: Date(), snapshot: SnapshotLoader.load())
    // Re-check hourly even if the app never reloads us — covers the case
    // where the user never opens the app and background fetch doesn't fire.
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

// MARK: - Hours mode (mirrors HourEntryCard)

private struct HoursReportView: View {
  let snapshot: WidgetSnapshot
  let family: WidgetFamily

  var body: some View {
    let report = snapshot.report
    let strings = snapshot.strings

    VStack(alignment: .center, spacing: 6) {
      // Progress bar
      ProgressView(value: min(max(report.progress, 0), 1))
        .progressViewStyle(.linear)
        .tint(.green)

      // Big hours / goal
      HStack(alignment: .lastTextBaseline, spacing: 2) {
        Text(report.monthHoursFormatted)
          .font(.system(size: family == .systemSmall ? 28 : 34, weight: .bold))
        Text("/\(report.goalHours)")
          .font(.caption2)
          .foregroundColor(.secondary)
      }

      // Encouragement
      Text(strings.encouragementPhrase)
        .font(.caption2)
        .fontWeight(.semibold)
        .multilineTextAlignment(.center)
        .lineLimit(2)
        .minimumScaleFactor(0.8)

      // Ahead/behind badge — falls back to hours-per-day-needed badge.
      if let aheadBehind = report.aheadBehindMinutes {
        Text(aheadBehind >= 0 ? strings.aheadOfScheduleLabel : strings.behindScheduleLabel)
          .font(.caption2)
          .fontWeight(.semibold)
          .foregroundColor(.white)
          .padding(.horizontal, 8)
          .padding(.vertical, 2)
          .background(
            Capsule().fill(aheadBehind >= 0 ? Color.green : Color.orange)
          )
      } else if let perDay = report.hoursPerDayNeeded {
        Text("\(formatHours(perDay)) \(strings.hoursPerDayToGoalSuffix)")
          .font(.caption2)
          .fontWeight(.semibold)
          .foregroundColor(.white)
          .padding(.horizontal, 8)
          .padding(.vertical, 2)
          .background(Capsule().fill(Color.green))
      }

      // Add Time button — medium only (small needs the room).
      if family != .systemSmall {
        Spacer(minLength: 4)
        Link(destination: WidgetURLs.addTime) {
          Text(strings.addTimeLabel)
            .font(.caption)
            .fontWeight(.bold)
            .foregroundColor(.green)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(
              RoundedRectangle(cornerRadius: 8)
                .stroke(Color.green, lineWidth: 1)
            )
        }
      }
    }
    .widgetURL(WidgetURLs.addTime)
  }

  /// Drops the trailing `.0` for whole numbers so the badge doesn't read
  /// "5.0 hrs/day". Mirrors `_.round(x, 1)` formatting from HourEntryCard.
  private func formatHours(_ value: Double) -> String {
    if value == value.rounded() {
      return String(Int(value))
    }
    return String(format: "%.1f", value)
  }
}

// MARK: - Checkbox mode (mirrors PublisherCheckBoxCard)

private struct CheckboxReportView: View {
  let snapshot: WidgetSnapshot
  let family: WidgetFamily

  var body: some View {
    let report = snapshot.report
    let strings = snapshot.strings

    if report.hasReportedThisMonth {
      // Mirrors the in-app "checkmark" state — no animation in widgets, but
      // the same intent: "you already reported, nothing to do".
      VStack(spacing: 8) {
        Image(systemName: "checkmark.seal.fill")
          .font(.system(size: family == .systemSmall ? 44 : 56))
          .foregroundColor(.green)
        Text(strings.encouragementPhrase)
          .font(.caption2)
          .multilineTextAlignment(.center)
          .lineLimit(2)
          .foregroundColor(.secondary)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      // Publishers can't access Add Time, so route the already-checked
      // state to Home instead of the (inaccessible) Add Time screen.
      .widgetURL(WidgetURLs.home)
    } else {
      // Tap → opens app → SharedGoodNewsListener adds a 0h0m report and
      // plays confetti, mirroring the in-app checkbox card behavior.
      VStack(spacing: 10) {
        Image(systemName: "square")
          .font(.system(size: family == .systemSmall ? 36 : 44))
          .foregroundColor(.white)
        Text(strings.sharedGoodNewsLabel)
          .font(.system(size: family == .systemSmall ? 12 : 14, weight: .bold))
          .foregroundColor(.white)
          .multilineTextAlignment(.center)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .padding()
      .background(Color.green)
      .cornerRadius(12)
      .widgetURL(WidgetURLs.sharedGoodNews)
    }
  }
}

// MARK: - Root view

private struct ReportWidgetView: View {
  let entry: ReportEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      if let snapshot = entry.snapshot {
        switch snapshot.report.mode {
        case .hours:
          HoursReportView(snapshot: snapshot, family: family)
        case .checkbox:
          CheckboxReportView(snapshot: snapshot, family: family)
        }
      } else {
        // Placeholder when the snapshot hasn't been written yet (cold install
        // before the app has launched once).
        VStack {
          Text("—")
            .font(.system(size: 32, weight: .bold))
            .foregroundColor(.secondary)
        }
      }
    }
    .padding()
    .containerBackground(.background, for: .widget)
  }
}

// MARK: - Widget

struct ReportWidget: Widget {
  let kind: String = "ReportWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: ReportProvider()) { entry in
      ReportWidgetView(entry: entry)
    }
    .configurationDisplayName("Service Report")
    .description("Your hours toward this month's goal, or a quick check-in if you're a publisher.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
